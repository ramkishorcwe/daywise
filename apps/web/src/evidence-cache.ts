// Session memory only. Tokens are opaque, encrypted and expire on the server.
const locations = new Map<string, { receipt: string; expires: number }>();
const guides = new Map<string, { receipt: string; expires: number }>();
export function rememberEvidence(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) { value.forEach(rememberEvidence); return; }
  const row = value as Record<string, unknown>;
  if (typeof row.receipt === 'string') {
    const location = row.location as Record<string, unknown> | undefined;
    const id = location?.id ?? row.id, expires = Date.parse(String(location?.expiresAt ?? row.expiresAt));
    const map = location ? guides : locations;
    if (typeof id === 'string' && Number.isFinite(expires)) map.set(id, { receipt: row.receipt, expires });
    for (const [key, item] of map) if (item.expires <= Date.now()) map.delete(key);
    while (map.size > 100) map.delete(map.keys().next().value!);
  }
  Object.values(row).forEach(rememberEvidence);
}
export function attachEvidence(body: string): string {
  const data = JSON.parse(body), ids = new Set<string>();
  function collect(value: unknown): void {
    if (typeof value === 'string') ids.add(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === 'object') Object.values(value).forEach(collect);
  }
  collect(data);
  const needed = (map: typeof locations) => [...ids].flatMap(id => { const item = map.get(id); return item && item.expires > Date.now() ? [item.receipt] : []; });
  const evidence = { locations: needed(locations), guides: needed(guides) };
  return evidence.locations.length || evidence.guides.length ? JSON.stringify({ ...data, _evidence: evidence }) : body;
}
export function clearEvidence() { locations.clear(); guides.clear(); }
