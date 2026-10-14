import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { request } from '../apps/web/src/api';
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => { const c = new AbortController(); setTimeout(() => c.abort(new DOMException('Timed out', 'TimeoutError')), ms); return c.signal; });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function delayedFetch(delay: number) {
  const fetcher = vi.fn<typeof fetch>((_path, options) => new Promise((resolve, reject) => {
    const signal = options!.signal!, abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(Response.json({ ok: true })); }, delay);
    signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort();
  })); vi.stubGlobal('fetch', fetcher); return fetcher;
}
it.each(['/guide/plan', '/guide/discover', '/plans/live'])('allows a successful %s response beyond the old 20-second cutoff without resubmitting', async path => {
  const fetcher = delayedFetch(25000), result = request(path, {}, false);
  await vi.advanceTimersByTimeAsync(25000); await expect(result).resolves.toEqual({ ok: true }); expect(fetcher).toHaveBeenCalledTimes(1);
});
it('planning stops at 80 seconds with a timeout error, preserving the distinction from an unavailable backend', async () => {
  const fetcher = delayedFetch(90000), result = request('/guide/plan', {}, false);
  const assertion = expect(result).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT', status: 408, message: expect.stringContaining('80 seconds') });
  await vi.advanceTimersByTimeAsync(80000); await assertion; expect(fetcher).toHaveBeenCalledTimes(1);
});
it('location lookups retain the 20-second bound and report timeout accurately', async () => {
  delayedFetch(25000); const result = request('/locations/autocomplete', {}, false), assertion = expect(result).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT', message: expect.stringContaining('20 seconds') });
  await vi.advanceTimersByTimeAsync(20000); await assertion;
});
it('caller cancellation is preserved and cannot be labeled as a backend failure', async () => {
  const fetcher = delayedFetch(25000), controller = new AbortController(), result = request('/guide/plan', { signal: controller.signal }, false);
  const assertion = expect(result).rejects.toMatchObject({ name: 'AbortError' }); controller.abort(); await assertion; expect(fetcher).toHaveBeenCalledTimes(1);
});
it('real connection failures keep the actionable backend message without retrying', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => { throw new TypeError('Failed to fetch'); }); vi.stubGlobal('fetch', fetcher);
  await expect(request('/guide/plan', {}, false)).rejects.toThrow('The backend is unavailable'); expect(fetcher).toHaveBeenCalledTimes(1);
});
it('HTTP provider errors and invalid JSON remain separate from client timeouts', async () => {
  vi.stubGlobal('fetch', async () => Response.json({ error: { code: 'PROVIDER_QUOTA', message: 'Provider quota reached' } }, { status: 429 }));
  await expect(request('/guide/plan', {}, false)).rejects.toMatchObject({ code: 'PROVIDER_QUOTA', status: 429 });
  vi.stubGlobal('fetch', async () => new Response('{broken'));
  await expect(request('/guide/plan', {}, false)).rejects.toThrow('unreadable response');
});
it('a response body that stalls after its headers uses the same planning deadline', async () => {
  const fetcher = vi.fn<typeof fetch>(async (_path, options) => {
    const response = Response.json({ ok: true });
    response.json = () => new Promise((_resolve, reject) => options!.signal!.addEventListener('abort', () => reject(options!.signal!.reason), { once: true }));
    return response;
  }); vi.stubGlobal('fetch', fetcher);
  const result = request('/guide/plan', {}, false), assertion = expect(result).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT', status: 408 });
  await vi.advanceTimersByTimeAsync(80000); await assertion; expect(fetcher).toHaveBeenCalledTimes(1);
});
