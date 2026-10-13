import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
export async function checkFixtureLocations(directory) {
  let findings = 0;
  async function walk(path) { for (const row of await readdir(path, { withFileTypes: true })) { const file = join(path, row.name); if (row.isDirectory()) await walk(file); else if (/\.(js|html|json|map)$/.test(row.name) && /jaipur-test|harbor-test|Demo stay|Demo station|Heritage Gallery|fixture-v1/.test(await readFile(file, 'utf8'))) findings++; } }
  await walk(directory); return { passed: findings === 0, findings, note: 'Known fixture location identities must not ship in the production client.' };
}
