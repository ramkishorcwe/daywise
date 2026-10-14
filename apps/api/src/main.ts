import { configuredServer } from './runtime';
async function main() {
  const server = await configuredServer();
  const port = Number(process.env.API_PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('API_PORT must be between 1024 and 65535.');
  await server.listen({ port, host: '127.0.0.1' });
  const stop = async () => { await server.close(); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'API startup failed.'); process.exitCode = 1; });