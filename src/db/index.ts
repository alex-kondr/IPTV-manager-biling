import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

const { Pool } = pg;

declare global {
  var _postgresPool: pg.Pool | undefined;
}

export const createPool = () => {
  if (!global._postgresPool) {
    global._postgresPool = new Pool({
      host: process.env['SQL_HOST'] || '127.0.0.1',
      user: process.env['SQL_USER'] || 'postgres',
      password: process.env['SQL_PASSWORD'] || '',
      database: process.env['SQL_DB_NAME'] || 'postgres',
      max: 10,
      connectionTimeoutMillis: 5000,
    });

    global._postgresPool.on('error', (err) => {
      if (process.env['SQL_HOST']) {
        console.error('Unexpected error on idle SQL pool client:', err);
      }
    });
  }
  return global._postgresPool;
};

const pool = createPool();

export const db = drizzle(pool, { schema });
