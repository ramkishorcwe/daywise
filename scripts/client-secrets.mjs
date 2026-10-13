import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
export async function checkClientSecrets(directory, env = process.env) {
  const secrets = ['GEMINI_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_ROUTES_API_KEY', 'GOOGLE_PLACES_API_KEY', 'GOOGLE_GEOCODING_API_KEY', 'GOOGLE_TIME_ZONE_API_KEY', 'OPERATIONS_TOKEN'].map(key => env[key]).filter(value => value && value.length >= 12);
  const failures = [];
  async function walk(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (/\.(js|html|css|map|json)$/.test(entry.name)) {
        const text = await readFile(file, 'utf8');
        if (secrets.some(secret => text.includes(secret)) || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|sk-(?:proj-)?[A-Za-z0-9_-]{24,}/.test(text)) failures.push('Potential server credential in client artifact.');
      }
    }
  }
  await walk(directory);
  return { passed: failures.length === 0, findings: failures.length, note: 'Heuristic plus configured server-value scan; not a complete secret audit.' };
}
