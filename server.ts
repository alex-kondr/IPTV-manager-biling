import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

process.env['START_EXPRESS_SERVER'] = 'true';

const builtServer = resolve(process.cwd(), 'dist/app/server/server.mjs');

if (existsSync(builtServer)) {
  process.argv[1] = builtServer;
  await import(`file://${builtServer}`);
} else {
  await import('./dev-server.cjs');
}
