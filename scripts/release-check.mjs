import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { checkClientSecrets } from './client-secrets.mjs';
import { checkFixtureLocations } from './client-locations.mjs';

const requireLive = process.argv.slice(2).includes('--require-live');
if (process.argv.slice(2).some(value => value !== '--require-live')) throw new Error('Only --require-live is supported.');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run through npm run check:release.');
const root = process.cwd(), artifacts = resolve('artifacts/release');
await mkdir(artifacts, { recursive: true }); await mkdir(resolve('.tmp'), { recursive: true });
const startedAt = new Date().toISOString();
async function fingerprint() {
  const paths = [];
  async function collect(directory) { for (const item of await readdir(directory, { withFileTypes: true })) { const path = join(directory, item.name); if (item.isDirectory()) await collect(path); else paths.push(path); } }
  for (const directory of ['apps', 'packages', 'fixtures', 'tests', 'scripts', '.github']) await collect(resolve(directory));
  for (const item of await readdir(root)) if (/\.(?:md|ts)$/.test(item) || ['package.json', 'package-lock.json', 'tsconfig.json', 'firebase.json', 'firestore.rules', 'firestore.indexes.json', '.env.example'].includes(item)) paths.push(resolve(item));
  const hash = createHash('sha256');
  for (const path of paths.sort()) hash.update(relative(root, path)).update('\0').update(await readFile(path)).update('\0');
  return hash.digest('hex');
}
const sourceDigest = await fingerprint(), checks = [];
const runId = randomUUID();
const checkEnv = { ...process.env, CI: 'true', NODE_ENV: 'development', API_AUTH_MODE: 'local', ASSISTANT_MODE: 'local', GEMINI_API_KEY: '', GEMINI_MODEL: '', PROVIDER_DAILY_LIMIT: '0', AI_DAILY_LIMIT: '0', GOOGLE_ROUTES_API_KEY: '', GOOGLE_PLACES_API_KEY: '', GOOGLE_GEOCODING_API_KEY: '', GOOGLE_TIME_ZONE_API_KEY: '', VITE_GOOGLE_MAPS_BROWSER_KEY: '', CHECKED_CATALOG_PATH: '', OPERATIONS_TOKEN: '', WEB_PORT: '5174', API_PORT: '3002', WEB_ORIGIN: 'http://127.0.0.1:5174', LOCAL_DATA_DIR: resolve(`.tmp/release-api-${runId}`), MAINTENANCE_DIR: resolve(`.tmp/release-maintenance-${runId}`), TEMP: resolve('.tmp'), TMP: resolve('.tmp'), PLAYWRIGHT_JSON_OUTPUT_FILE: join(artifacts, 'browser.json') };
function run(name, args, capture = false) {
  console.log(`Checking ${name}…`);
  return new Promise(resolveRun => {
    const child = spawn(process.execPath, [npmCli, ...args], { cwd: root, shell: false, env: { ...checkEnv, NODE_ENV: name === 'typecheck_production_build' ? 'production' : 'development' }, stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
    let output = '';
    if (capture) { child.stdout.on('data', chunk => { if (output.length < 4_000_000) output += chunk; }); child.stderr.on('data', () => {}); }
    child.on('error', () => resolveRun({ name, passed: false, exitCode: -1, output: '' }));
    child.on('close', exitCode => resolveRun({ name, passed: exitCode === 0, exitCode, output }));
  });
}
for (const [name, args] of [
  ['unit_api_provider', ['run', 'test', '--', '--reporter=json', `--outputFile=${join(artifacts, 'unit.json')}`]],
  ['typecheck_production_build', ['run', 'build']],
  ['browser_journeys', ['run', 'test:e2e', '--', '--reporter=json']],
]) {
  const result = await run(name, args);
  if (name === 'browser_journeys') { try { JSON.parse(await readFile(join(artifacts, 'browser.json'), 'utf8')); } catch { result.passed = false; } }
  checks.push({ name: result.name, passed: result.passed, exitCode: result.exitCode });
}
const audit = await run('dependency_audit', ['audit', '--json'], true);
let vulnerabilities = null;
let auditError = null;
try { const data = JSON.parse(audit.output); vulnerabilities = data.metadata?.vulnerabilities ?? null; if (!vulnerabilities || vulnerabilities.total !== 0) { audit.passed = false; auditError = /^[A-Z_0-9-]{1,80}$/.test(data.error?.code ?? '') ? data.error.code : 'AUDIT_NOT_CLEAN'; } } catch { audit.passed = false; auditError = 'UNREADABLE_AUDIT'; }
checks.push({ name: audit.name, passed: audit.passed, exitCode: audit.exitCode, vulnerabilities, errorCode: auditError });
try { checks.push({ name: 'client_credentials', ...await checkClientSecrets(resolve('dist')) }); } catch { checks.push({ name: 'client_credentials', passed: false, note: 'Client artifacts could not be inspected.' }); }
try { checks.push({ name: 'fixture_locations_absent', ...await checkFixtureLocations(resolve('dist')) }); } catch { checks.push({ name: 'fixture_locations_absent', passed: false, note: 'Client artifacts could not be inspected.' }); }
checks.push({ name: 'source_unchanged_during_checks', passed: sourceDigest === await fingerprint() });
const pending = ['Verified venue/branch dietary facts and maintenance procedures', 'Licensed provider access, persistence rights and representative live routing tests', 'Durable shared request/proposal guards and cross-instance spend limits', 'Cloud authentication, authorization, retention/deletion and recovery tests', 'Evaluated AI model/account controls and actual cost/latency measurements', 'Official advisory source ownership and notice/location checks', 'Consented controlled traveler trials and reviewed findings', 'Concrete deployment review and authorization'];
const report = { schemaVersion: 1, purpose: 'local_validation_only', startedAt, finishedAt: new Date().toISOString(), sourceDigest, localChecksPassed: checks.every(check => check.passed), publicReleaseReady: false, checks, pending };
await writeFile(join(artifacts, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ localChecksPassed: report.localChecksPassed, publicReleaseReady: false, pendingGates: pending.length, report: 'artifacts/release/report.json' }, null, 2));
process.exitCode = report.localChecksPassed ? requireLive ? 2 : 0 : 1;
