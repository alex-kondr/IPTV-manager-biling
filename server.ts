import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const builtServer = resolve(process.cwd(), 'dist/app/server/server.mjs');

if (existsSync(builtServer)) {
  await import(`file://${builtServer}`);
} else {
  await import('./src/server.ts');
}
