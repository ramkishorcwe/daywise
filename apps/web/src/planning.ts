import type { PlanningResult, TripInput } from '../../../packages/contracts/src';
import { backendConnected, previewOnServer } from './api';

export function calculatePlan(input: TripInput, order: string[] | null, signal: AbortSignal): Promise<PlanningResult> {
  if (backendConnected()) return previewOnServer(input, order, signal);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    const cleanup = () => { clearTimeout(timeout); signal.removeEventListener('abort', abort); worker.terminate(); };
    const abort = () => { cleanup(); reject(new DOMException('Canceled', 'AbortError')); };
    const timeout = setTimeout(() => { cleanup(); reject(new Error('Planning took too long. Try a simpler day or retry.')); }, 20000);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); return; }
    worker.onmessage = e => { cleanup(); if (e.data.error) reject(new Error(e.data.error)); else resolve(e.data.result as PlanningResult); };
    worker.onerror = () => { cleanup(); reject(new Error('The planning worker is unavailable. Reload and try again.')); };
    worker.postMessage({ input, order });
  });
}
