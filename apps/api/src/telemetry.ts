// Bounded aggregate telemetry. Never accept a URL, user ID, body or provider payload.
const buckets = ['under_100ms', 'under_1s', 'under_5s', 'over_5s'] as const;
export class Telemetry {
  private started: number;
  private routes = new Map<string, { requests: number; failures: number; rejected: number; limited: number; durationMs: number; latency: Record<typeof buckets[number], number> }>();
  constructor(private clock = () => Date.now()) { this.started = clock(); }
  record(method: string, template: string | undefined, status: number, elapsed: number) {
    // Fastify's registered route template is supplied by the server, never request.url.
    const candidate = `${method} ${template}`;
    const key = template && (this.routes.has(candidate) || this.routes.size < 40) ? candidate : 'other';
    const row = this.routes.get(key) ?? { requests: 0, failures: 0, rejected: 0, limited: 0, durationMs: 0, latency: { under_100ms: 0, under_1s: 0, under_5s: 0, over_5s: 0 } };
    const duration = Number.isFinite(elapsed) ? Math.max(0, Math.min(elapsed, 60000)) : 0;
    row.requests++; if (status >= 500) row.failures++; if (status >= 400 && status < 500) row.rejected++; if (status === 429) row.limited++;
    row.durationMs += duration; row.latency[buckets[duration < 100 ? 0 : duration < 1000 ? 1 : duration < 5000 ? 2 : 3]]++;
    this.routes.set(key, row);
  }
  snapshot() { return { scope: 'one_process_since_start', startedAt: new Date(this.started).toISOString(), routes: [...this.routes].map(([route, row]) => ({ route, ...structuredClone(row), durationMs: Math.round(row.durationMs) })) }; }
}
