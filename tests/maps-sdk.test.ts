import { afterEach, beforeEach, expect, it, vi } from 'vitest';
type Script = { src: string; onerror?: () => void; remove: ReturnType<typeof vi.fn> };
let scripts: Script[], scope: Record<string, () => void>;
beforeEach(() => {
  vi.resetModules(); scripts = []; scope = {}; vi.stubGlobal('window', scope); vi.stubGlobal('google', undefined);
  vi.stubGlobal('document', { createElement: () => ({ src: '', remove: vi.fn() }), head: { append: (script: Script) => scripts.push(script) } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const callback = (script: Script) => scope[new URL(script.src).searchParams.get('callback')!];
const ready = () => vi.stubGlobal('google', { maps: { Map: class {}, geometry: { encoding: {} } } });
it('loads one SDK for concurrent map consumers and removes its callback after readiness', async () => {
  const { loadMaps } = await import('../apps/web/src/maps-sdk'); const first = loadMaps('synthetic-browser-key'), second = loadMaps('synthetic-browser-key'); expect(first).toBe(second); expect(scripts).toHaveLength(1);
  ready(); callback(scripts[0])(); await first; expect(callback(scripts[0])).toBeUndefined(); await loadMaps('synthetic-browser-key'); expect(scripts).toHaveLength(1);
});
it('removes a failed script, permits a retry and ignores late callbacks from that script', async () => {
  const { loadMaps } = await import('../apps/web/src/maps-sdk'); const first = loadMaps('synthetic-browser-key'), old = callback(scripts[0]); const failure = expect(first).rejects.toThrow('unavailable'); scripts[0].onerror!(); await failure; expect(scripts[0].remove).toHaveBeenCalledTimes(1);
  const second = loadMaps('synthetic-browser-key'); expect(scripts).toHaveLength(2); old(); ready(); callback(scripts[1])(); await second;
});
it('times out and removes the script without leaving a cached rejected promise', async () => {
  vi.useFakeTimers(); const { loadMaps } = await import('../apps/web/src/maps-sdk'); const failed = expect(loadMaps('synthetic-browser-key')).rejects.toThrow('too long'); await vi.advanceTimersByTimeAsync(15001); await failed; expect(scripts[0].remove).toHaveBeenCalled();
  const retry = loadMaps('synthetic-browser-key'); ready(); callback(scripts[1])(); await retry;
});
it('reports Google authorization failures after SDK readiness to mounted map consumers', async () => {
  const { loadMaps, subscribeMapFailures, mapAuthorizationFailed } = await import('../apps/web/src/maps-sdk'); const notify = vi.fn(), remove = subscribeMapFailures(notify), loading = loadMaps('synthetic-browser-key'); ready(); callback(scripts[0])(); await loading;
  scope.gm_authFailure(); expect(mapAuthorizationFailed()).toBe(true); expect(notify).toHaveBeenCalledWith(expect.stringContaining('website restrictions')); await expect(loadMaps('synthetic-browser-key')).rejects.toThrow('authorization failed'); remove(); scope.gm_authFailure(); expect(notify).toHaveBeenCalledTimes(1);
});
it('rejects an incomplete SDK instead of displaying a map as successfully loaded', async () => {
  const { loadMaps } = await import('../apps/web/src/maps-sdk'); const loading = loadMaps('synthetic-browser-key'), failure = expect(loading).rejects.toThrow('incomplete'); callback(scripts[0])(); await failure;
});
