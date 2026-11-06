import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

export type DatabaseMode = 'external' | 'cloudsql';

declare global {
  var _externalPool: pg.Pool | undefined;
  var _cloudSqlPool: pg.Pool | undefined;
  var _externalDb: NodePgDatabase<typeof schema> | undefined;
  var _cloudSqlDb: NodePgDatabase<typeof schema> | undefined;
  var _activeDbMode: DatabaseMode | undefined;
}

export const getExternalDatabaseUrl = (): string | undefined => {
  const extUrl = process.env['EXTERNAL_DATABASE_URL'];
  if (extUrl) return extUrl;
  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl && dbUrl.includes('internet-shop-4-alex-kondr.e.aivencloud.com')) {
    return dbUrl.replace(/\/defaultdb(\?|$)/, '/iptv$1');
  }
  return dbUrl;
};

export const isCloudSqlEnvConfigured = (): boolean => {
  return Boolean(
    process.env['SQL_HOST'] &&
    process.env['SQL_USER'] &&
    process.env['SQL_DB_NAME']
  );
};

export const isExternalDbConfigured = (): boolean => {
  return Boolean(getExternalDatabaseUrl());
};

export const getActiveDbMode = (): DatabaseMode => {
  if (!global._activeDbMode) {
    if (isExternalDbConfigured()) {
      global._activeDbMode = 'external';
    } else if (isCloudSqlEnvConfigured()) {
      global._activeDbMode = 'cloudsql';
    } else {
      global._activeDbMode = 'external';
    }
  }
  return global._activeDbMode;
};

export const setActiveDbMode = (mode: DatabaseMode): void => {
  global._activeDbMode = mode;
};

export const getActiveDatabaseUrl = (): string | undefined => {
  const mode = getActiveDbMode();
  if (mode === 'external') {
    return getExternalDatabaseUrl();
  }
  return undefined;
};

export const getExternalPool = (): pg.Pool => {
  if (!global._externalPool) {
    const dbUrl = getExternalDatabaseUrl() || '';
    const cleanUrl = dbUrl.replace(/[?&]sslmode=[^&]+/g, '').replace(/\?$/, '');
    global._externalPool = new Pool({
      connectionString: cleanUrl,
      ssl: { rejectUnauthorized: false },
      max: 10,
      connectionTimeoutMillis: 8000,
    });
    global._externalPool.on('error', (err) => {
      console.error('[External PostgreSQL] Unexpected error on idle pool client:', err);
    });
  }
  return global._externalPool;
};

export const getCloudSqlPool = (): pg.Pool => {
  if (!global._cloudSqlPool) {
    const host = process.env['SQL_HOST'] || '127.0.0.1';
    const isUnixSocket = host.startsWith('/');
    const isSsl = !isUnixSocket && (process.env['SQL_SSL'] === 'true' || Boolean(process.env['SQL_PORT'] && process.env['SQL_PORT'] !== '5432'));
    global._cloudSqlPool = new Pool({
      host,
      port: isUnixSocket ? undefined : (Number(process.env['SQL_PORT']) || 5432),
      user: process.env['SQL_USER'] || 'postgres',
      password: process.env['SQL_PASSWORD'] || '',
      database: process.env['SQL_DB_NAME'] || 'postgres',
      ssl: isSsl ? { rejectUnauthorized: false } : false,
      max: 10,
      connectionTimeoutMillis: 8000,
    });
    global._cloudSqlPool.on('error', (err) => {
      console.error('[Cloud SQL] Unexpected error on idle pool client:', err);
    });
  }
  return global._cloudSqlPool;
};

export const getPoolForMode = (mode?: DatabaseMode): pg.Pool => {
  const targetMode = mode || getActiveDbMode();
  return targetMode === 'cloudsql' ? getCloudSqlPool() : getExternalPool();
};

export const getDbForMode = (mode?: DatabaseMode): NodePgDatabase<typeof schema> => {
  const targetMode = mode || getActiveDbMode();
  if (targetMode === 'cloudsql') {
    if (!global._cloudSqlDb) {
      global._cloudSqlDb = drizzle(getCloudSqlPool(), { schema });
    }
    return global._cloudSqlDb;
  } else {
    if (!global._externalDb) {
      global._externalDb = drizzle(getExternalPool(), { schema });
    }
    return global._externalDb;
  }
};

export const pool: pg.Pool = new Proxy({} as pg.Pool, {
  get(_target, prop) {
    const activePool = getPoolForMode();
    const val = Reflect.get(activePool, prop);
    return typeof val === 'function' ? val.bind(activePool) : val;
  },
});

export const db: NodePgDatabase<typeof schema> = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, prop) {
    const activeDb = getDbForMode();
    const val = Reflect.get(activeDb, prop);
    return typeof val === 'function' ? val.bind(activeDb) : val;
  },
});
