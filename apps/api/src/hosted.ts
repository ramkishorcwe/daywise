import type { IncomingMessage, ServerResponse } from 'node:http';
import { configuredServer } from './runtime';

let initialized: ReturnType<typeof configuredServer> | undefined;
export default async function handler(request: IncomingMessage, response: ServerResponse) {
  initialized ??= configuredServer(true).catch(error => { initialized = undefined; throw error; });
  const app = await initialized;
  await app.ready();
  app.server.emit('request', request, response);
}
