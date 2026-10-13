const loopbackHosts = new Set(['127.0.0.1', 'localhost']);

function configuredOrigin(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('WEB_ORIGIN must be an HTTP or HTTPS origin, for example http://127.0.0.1:5173.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('WEB_ORIGIN must contain only the scheme, hostname and optional port, without credentials, paths, queries or fragments.');
  }
  return url;
}

export function webOriginFromEnvironment(env: { WEB_ORIGIN?: string; WEB_PORT?: string }) {
  if (env.WEB_ORIGIN !== undefined) return configuredOrigin(env.WEB_ORIGIN).origin;
  const port = Number(env.WEB_PORT ?? 5173);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('WEB_PORT must be between 1024 and 65535.');
  return `http://127.0.0.1:${port}`;
}

export function webOriginPolicy(value: string, localDevelopment: boolean) {
  const configured = configuredOrigin(value), allowed = new Set([configured.origin]);
  // Only local auth outside production gets aliases, on the same scheme and port.
  // Public deployments, other loopback ports and unrelated hosts remain exact matches.
  if (localDevelopment && loopbackHosts.has(configured.hostname)) {
    for (const hostname of loopbackHosts) {
      const alias = new URL(configured.origin); alias.hostname = hostname; allowed.add(alias.origin);
    }
  }
  return { configured: configured.origin, accepts: (origin: string) => allowed.has(origin) };
}
