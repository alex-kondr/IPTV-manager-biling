import {
  db,
  DatabaseMode,
  getActiveDbMode,
  setActiveDbMode,
  getExternalDatabaseUrl,
  getPoolForMode,
  getDbForMode,
  isCloudSqlEnvConfigured,
  isExternalDbConfigured,
} from '../db/index';
import {
  clients,
  payments,
  providerAccounts,
  providerDeposits,
  settings,
  utilityAccounts,
  utilityReadings,
  customLedgerEntries,
  providerBalanceAdjustments,
  accountDeductionOverrides,
  users,
  userSettings,
  systemSettingsConfig,
} from '../db/schema';
import { eq } from 'drizzle-orm';

let isConnectedToCloudSql = false;
let lastSyncTimestamp: string | null = null;
let connectionError: string | null = null;

export function isCloudSqlAvailable(mode?: DatabaseMode): boolean {
  const targetMode = mode || getActiveDbMode();
  if (targetMode === 'sqlite_local') return true;
  return targetMode === 'cloudsql' ? isCloudSqlEnvConfigured() : isExternalDbConfigured();
}

export async function checkCloudSqlConnection(mode?: DatabaseMode): Promise<boolean> {
  const targetPool = getPoolForMode(mode);
  try {
    await targetPool.query('SELECT 1');
    if (!mode || mode === getActiveDbMode()) {
      isConnectedToCloudSql = true;
      connectionError = null;
    }
    return true;
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    if (!mode || mode === getActiveDbMode()) {
      isConnectedToCloudSql = false;
      connectionError = err;
    }
    console.warn(`[PostgreSQL:${mode || getActiveDbMode()}] Connection ping failed:`, err);
    return false;
  }
}

export function getModeMetadata(mode: DatabaseMode): {
  mode: DatabaseMode;
  provider: string;
  host: string;
  database: string;
  configured: boolean;
} {
  if (mode === 'sqlite_local') {
    return {
      mode: 'sqlite_local',
      provider: 'SQLite / In-Memory Local Cache',
      host: 'localhost',
      database: 'iptv_local_cache.sqlite',
      configured: true,
    };
  }

  if (mode === 'cloudsql') {
    const rawHost = process.env['SQL_HOST'] || 'Cloud SQL Socket';
    const shortHost = rawHost.startsWith('/app/cloudsql/')
      ? rawHost.replace('/app/cloudsql/', '')
      : rawHost;
    return {
      mode: 'cloudsql',
      provider: 'Google Cloud SQL (PostgreSQL)',
      host: shortHost,
      database: process.env['SQL_DB_NAME'] || 'cloud_sql_development_database',
      configured: isCloudSqlEnvConfigured(),
    };
  }

  let host = process.env['EXTERNAL_DATABASE_HOST'] || 'External PostgreSQL';
  let database = process.env['EXTERNAL_DATABASE_NAME'] || 'postgres';
  const dbUrl = getExternalDatabaseUrl();
  if (dbUrl) {
    try {
      const parsed = new URL(dbUrl);
      host = parsed.host || host;
      database = parsed.pathname?.replace(/^\//, '') || database;
    } catch {
      // ignore URL parse error
    }
  }
  return {
    mode: 'external',
    provider: 'Зовнішня PostgreSQL',
    host,
    database,
    configured: isExternalDbConfigured(),
  };
}

export function getCloudSqlDbStatus() {
  const activeMode = getActiveDbMode();
  const meta = getModeMetadata(activeMode);

  return {
    activeMode,
    provider: meta.provider,
    host: meta.host,
    database: meta.database,
    connected: isConnectedToCloudSql || activeMode === 'sqlite_local',
    lastSync: lastSyncTimestamp,
    error: connectionError,
  };
}

export async function ensureDatabaseSchema(mode?: DatabaseMode): Promise<boolean> {
  const targetMode = mode || getActiveDbMode();
  const targetPool = getPoolForMode(targetMode);

  // In managed Google Cloud SQL, DDL is applied via Drizzle UpdateSchema (admin role),
  // whereas the runtime user only has DML privileges (SELECT/INSERT/UPDATE/DELETE) on public schema.
  if (targetMode === 'cloudsql') {
    try {
      await targetPool.query('SELECT 1');
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[PostgreSQL:cloudsql] Connection check warning:', msg);
      return false;
    }
  }

  try {
    const ddl = `
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  iptv_login TEXT NOT NULL,
  device_info TEXT,
  subscription_plan TEXT,
  cost_usd REAL NOT NULL DEFAULT 1,
  monthly_price REAL NOT NULL DEFAULT 100,
  start_date TEXT NOT NULL,
  active_until TEXT NOT NULL,
  balance REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  provider_account_id TEXT,
  notes TEXT,
  group_name TEXT,
  group_balance REAL DEFAULT 0,
  last_reminder_date TEXT,
  last_reminder_status TEXT,
  owner_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  amount REAL NOT NULL,
  monthly_price REAL NOT NULL,
  previous_balance REAL NOT NULL,
  new_balance REAL NOT NULL,
  months_added INTEGER NOT NULL,
  cost_usd_per_month REAL,
  total_usd_deducted REAL,
  previous_active_until TEXT NOT NULL,
  new_active_until TEXT NOT NULL,
  date TEXT NOT NULL,
  note TEXT
);

CREATE TABLE IF NOT EXISTS provider_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  login TEXT NOT NULL,
  password TEXT,
  playlist_url TEXT,
  server_url TEXT,
  max_slots INTEGER NOT NULL DEFAULT 2,
  assigned_client_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  price_per_month_usd REAL NOT NULL DEFAULT 1,
  start_date TEXT,
  months_count INTEGER NOT NULL DEFAULT 0,
  valid_until TEXT NOT NULL,
  total_deducted_usd REAL NOT NULL DEFAULT 0,
  renewals JSONB,
  notes TEXT,
  owner_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS provider_deposits (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  amount_usd REAL NOT NULL,
  spent_uah REAL NOT NULL,
  exchange_rate REAL,
  payment_method TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  default_monthly_price REAL NOT NULL DEFAULT 100,
  reminder_days_before INTEGER NOT NULL DEFAULT 7,
  card_requisites TEXT NOT NULL DEFAULT '',
  reminder_message_template TEXT NOT NULL DEFAULT '',
  auto_reminder_enabled BOOLEAN NOT NULL DEFAULT false,
  viber_reminder_message_template TEXT,
  viber_renewal_message_template TEXT,
  utility_tariffs_settings JSONB
);

CREATE TABLE IF NOT EXISTS utility_accounts (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  address TEXT,
  city TEXT,
  street TEXT,
  house_num TEXT,
  dtek_queue_group TEXT,
  meter_number TEXT,
  electricity_tariff_type TEXT NOT NULL DEFAULT 'single',
  residents_count INTEGER NOT NULL DEFAULT 1,
  initial_reading_t1 REAL DEFAULT 0,
  initial_reading_t2 REAL DEFAULT 0,
  initial_reading_water REAL DEFAULT 0,
  water_enabled BOOLEAN DEFAULT true,
  waste_enabled BOOLEAN DEFAULT true,
  balance_uah REAL DEFAULT 0,
  notes TEXT,
  owner_user_id TEXT,
  assigned_user_ids JSONB DEFAULT '[]'::jsonb,
  dtek_login TEXT,
  dtek_password_enc TEXT,
  dtek_cabinet_status TEXT,
  dtek_cabinet_last_sync TEXT,
  ooek_login TEXT,
  ooek_password_enc TEXT,
  ooek_account_number TEXT,
  ooek_balance_uah REAL,
  ooek_last_bill_uah REAL,
  ooek_history JSONB DEFAULT '[]'::jsonb,
  ooek_cabinet_status TEXT,
  ooek_cabinet_last_sync TEXT,
  devices JSONB DEFAULT '[]'::jsonb,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS utility_readings (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  utility_type TEXT NOT NULL,
  date TEXT NOT NULL,
  period_month TEXT,
  reading_t1 REAL,
  reading_t2 REAL,
  consumption_t1 REAL,
  consumption_t2 REAL,
  rate_t1 REAL,
  rate_t2 REAL,
  total_cost REAL NOT NULL DEFAULT 0,
  season TEXT,
  is_paid BOOLEAN DEFAULT false,
  paid_date TEXT,
  paid_amount REAL,
  note TEXT,
  is_control_only BOOLEAN DEFAULT false,
  reading_purpose TEXT DEFAULT 'billing',
  days_since_last_reading REAL,
  daily_avg_consumption REAL,
  owner_user_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS custom_ledger_entries (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  category TEXT NOT NULL,
  date TEXT NOT NULL,
  amount_uah REAL NOT NULL DEFAULT 0,
  amount_usd REAL,
  title TEXT NOT NULL,
  subtitle TEXT,
  note TEXT,
  payment_method TEXT,
  client_id TEXT,
  client_name TEXT,
  account_id TEXT,
  account_name TEXT,
  balance_before_usd REAL,
  balance_after_usd REAL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_balance_adjustments (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  amount_usd REAL NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS account_deduction_overrides (
  id TEXT PRIMARY KEY,
  is_excluded BOOLEAN DEFAULT false,
  amount_usd REAL,
  amount_uah REAL,
  date TEXT,
  title TEXT,
  subtitle TEXT,
  note TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  picture TEXT,
  role TEXT NOT NULL DEFAULT 'admin',
  status TEXT NOT NULL DEFAULT 'active',
  sub TEXT,
  allowed_tabs JSONB,
  assigned_utility_account_ids JSONB,
  assigned_client_ids JSONB,
  default_utility_account_id TEXT,
  can_manage_own_data BOOLEAN DEFAULT true,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS sub TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS allowed_tabs JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS assigned_utility_account_ids JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS assigned_client_ids JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS default_utility_account_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_manage_own_data BOOLEAN DEFAULT true;

ALTER TABLE utility_accounts ADD COLUMN IF NOT EXISTS owner_user_id TEXT;
ALTER TABLE utility_accounts ADD COLUMN IF NOT EXISTS assigned_user_ids JSONB DEFAULT '[]'::jsonb;
ALTER TABLE utility_accounts ADD COLUMN IF NOT EXISTS dtek_login TEXT;
ALTER TABLE utility_accounts ADD COLUMN IF NOT EXISTS dtek_password_enc TEXT;
ALTER TABLE utility_accounts ADD COLUMN IF NOT EXISTS dtek_cabinet_status TEXT;
ALTER TABLE utility_accounts ADD COLUMN IF NOT EXISTS dtek_cabinet_last_sync TEXT;
ALTER TABLE utility_accounts ADD COLUMN IF NOT EXISTS ooek_login TEXT;
ALTER TABLE utility_accounts ADD COLUMN IF NOT EXISTS ooek_password_enc TEXT;
ALTER TABLE utility_accounts ADD COLUMN IF NOT EXISTS ooek_account_number TEXT;
ALTER TABLE utility_accounts ADD COLUMN IF NOT EXISTS ooek_balance_uah REAL;
ALTER TABLE utility_accounts ADD COLUMN IF NOT EXISTS ooek_last_bill_uah REAL;
ALTER TABLE utility_accounts ADD COLUMN IF NOT EXISTS ooek_history JSONB DEFAULT '[]'::jsonb;
ALTER TABLE utility_accounts ADD COLUMN IF NOT EXISTS ooek_cabinet_status TEXT;
ALTER TABLE utility_accounts ADD COLUMN IF NOT EXISTS ooek_cabinet_last_sync TEXT;
ALTER TABLE utility_accounts ADD COLUMN IF NOT EXISTS devices JSONB DEFAULT '[]'::jsonb;

ALTER TABLE utility_readings ADD COLUMN IF NOT EXISTS period_month TEXT;
ALTER TABLE utility_readings ADD COLUMN IF NOT EXISTS reading_t1 REAL;
ALTER TABLE utility_readings ADD COLUMN IF NOT EXISTS reading_t2 REAL;
ALTER TABLE utility_readings ADD COLUMN IF NOT EXISTS consumption_t1 REAL;
ALTER TABLE utility_readings ADD COLUMN IF NOT EXISTS consumption_t2 REAL;
ALTER TABLE utility_readings ADD COLUMN IF NOT EXISTS rate_t1 REAL;
ALTER TABLE utility_readings ADD COLUMN IF NOT EXISTS rate_t2 REAL;
ALTER TABLE utility_readings ADD COLUMN IF NOT EXISTS total_cost REAL DEFAULT 0;
ALTER TABLE utility_readings ADD COLUMN IF NOT EXISTS season TEXT;
ALTER TABLE utility_readings ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT false;
ALTER TABLE utility_readings ADD COLUMN IF NOT EXISTS paid_date TEXT;
ALTER TABLE utility_readings ADD COLUMN IF NOT EXISTS paid_amount REAL;
ALTER TABLE utility_readings ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE utility_readings ADD COLUMN IF NOT EXISTS is_control_only BOOLEAN DEFAULT false;
ALTER TABLE utility_readings ADD COLUMN IF NOT EXISTS reading_purpose TEXT DEFAULT 'billing';
ALTER TABLE utility_readings ADD COLUMN IF NOT EXISTS days_since_last_reading REAL;
ALTER TABLE utility_readings ADD COLUMN IF NOT EXISTS daily_avg_consumption REAL;
ALTER TABLE utility_readings ADD COLUMN IF NOT EXISTS owner_user_id TEXT;
ALTER TABLE utility_readings ADD COLUMN IF NOT EXISTS created_at TEXT;

ALTER TABLE custom_ledger_entries ADD COLUMN IF NOT EXISTS subtitle TEXT;
ALTER TABLE custom_ledger_entries ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE custom_ledger_entries ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE custom_ledger_entries ADD COLUMN IF NOT EXISTS client_id TEXT;
ALTER TABLE custom_ledger_entries ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE custom_ledger_entries ADD COLUMN IF NOT EXISTS account_id TEXT;
ALTER TABLE custom_ledger_entries ADD COLUMN IF NOT EXISTS account_name TEXT;
ALTER TABLE custom_ledger_entries ADD COLUMN IF NOT EXISTS balance_before_usd REAL;
ALTER TABLE custom_ledger_entries ADD COLUMN IF NOT EXISTS balance_after_usd REAL;
ALTER TABLE custom_ledger_entries ADD COLUMN IF NOT EXISTS created_at TEXT;

ALTER TABLE users ADD COLUMN IF NOT EXISTS picture TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'admin';
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TEXT;

ALTER TABLE clients ADD COLUMN IF NOT EXISTS owner_user_id TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS group_name TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS group_balance REAL DEFAULT 0;
ALTER TABLE provider_accounts ADD COLUMN IF NOT EXISTS owner_user_id TEXT;

ALTER TABLE account_deduction_overrides ADD COLUMN IF NOT EXISTS is_excluded BOOLEAN DEFAULT false;
ALTER TABLE account_deduction_overrides ADD COLUMN IF NOT EXISTS amount_usd REAL;
ALTER TABLE account_deduction_overrides ADD COLUMN IF NOT EXISTS amount_uah REAL;
ALTER TABLE account_deduction_overrides ADD COLUMN IF NOT EXISTS date TEXT;
ALTER TABLE account_deduction_overrides ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE account_deduction_overrides ADD COLUMN IF NOT EXISTS subtitle TEXT;
ALTER TABLE account_deduction_overrides ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE account_deduction_overrides ADD COLUMN IF NOT EXISTS created_at TEXT;

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY,
  theme_mode TEXT NOT NULL DEFAULT 'light',
  outage_schedule_view_variant TEXT NOT NULL DEFAULT 'v10_minimal_pills',
  hidden_house_tabs JSONB NOT NULL DEFAULT '{}'::jsonb,
  electricity_tariffs JSONB,
  water_tariffs JSONB,
  waste_tariffs JSONB,
  custom_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS system_settings_config (
  id TEXT PRIMARY KEY,
  scopes_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  system_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TEXT NOT NULL
);
`;
    const statements = ddl
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const stmt of statements) {
      try {
        await targetPool.query(stmt);
      } catch {
        // Ignore individual statement permission/owner errors on existing tables
      }
    }
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('permission denied for schema public') || msg.includes('must be owner')) {
      return true;
    }
    return false;
  }
}

type QueryResult<T> = { ok: true; rows: T[] } | { ok: false; error: string };

async function trySelect<T>(queryPromise: Promise<T[]>, label?: string): Promise<QueryResult<T>> {
  try {
    const rows = await queryPromise;
    return { ok: true, rows };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    console.warn(`[PostgreSQL] trySelect${label ? ` (${label})` : ''} warning:`, err);
    return { ok: false, error: err };
  }
}

export interface CloudSqlLoadResult {
  clients: Record<string, unknown>[];
  payments: Record<string, unknown>[];
  providerAccounts: Record<string, unknown>[];
  providerDeposits: Record<string, unknown>[];
  utilityAccounts: Record<string, unknown>[];
  utilityReadings: Record<string, unknown>[];
  customLedgerEntries: Record<string, unknown>[];
  providerBalanceAdjustments: Record<string, unknown>[];
  accountDeductionOverrides: Record<string, unknown>[];
  users: Record<string, unknown>[];
  userSettings: Record<string, unknown>[];
  systemSettingsConfig: Record<string, unknown> | null;
  settings: Record<string, unknown> | null;
  settingsReadSuccess: boolean;
}

export async function loadAllFromCloudSql(mode?: DatabaseMode): Promise<CloudSqlLoadResult | null> {
  const targetMode = mode || getActiveDbMode();
  if (!isCloudSqlAvailable(targetMode)) return null;

  try {
    await ensureDatabaseSchema(targetMode);
    const targetDb = getDbForMode(targetMode);

    const [
      clientsRes,
      paymentsRes,
      accountsRes,
      depositsRes,
      settingsRes,
      utilityAccountsRes,
      utilityReadingsRes,
      ledgerEntriesRes,
      adjustmentsRes,
      overridesRes,
      usersRes,
      userSettingsRes,
      systemSettingsConfigRes,
    ] = await Promise.all([
      trySelect(targetDb.select().from(clients), 'clients'),
      trySelect(targetDb.select().from(payments), 'payments'),
      trySelect(targetDb.select().from(providerAccounts), 'provider_accounts'),
      trySelect(targetDb.select().from(providerDeposits), 'provider_deposits'),
      trySelect(targetDb.select().from(settings), 'settings'),
      trySelect(targetDb.select().from(utilityAccounts), 'utility_accounts'),
      trySelect(targetDb.select().from(utilityReadings), 'utility_readings'),
      trySelect(targetDb.select().from(customLedgerEntries), 'custom_ledger_entries'),
      trySelect(targetDb.select().from(providerBalanceAdjustments), 'provider_balance_adjustments'),
      trySelect(targetDb.select().from(accountDeductionOverrides), 'account_deduction_overrides'),
      trySelect(targetDb.select().from(users), 'users'),
      trySelect(targetDb.select().from(userSettings), 'user_settings'),
      trySelect(targetDb.select().from(systemSettingsConfig), 'system_settings_config'),
    ]);

    if (!mode || mode === getActiveDbMode()) {
      if (settingsRes.ok) {
        isConnectedToCloudSql = true;
        lastSyncTimestamp = new Date().toISOString();
        connectionError = null;
      } else {
        isConnectedToCloudSql = false;
        connectionError = settingsRes.error || 'Помилка читання таблиці settings';
      }
    }

    let settingsObj: Record<string, unknown> | null = null;
    if (settingsRes.ok && settingsRes.rows.length > 0) {
      const validRows = settingsRes.rows.filter((s) => s.id !== '__db_mode__');
      const globalDoc = validRows.find((s) => s.id === 'global') || validRows[0];
      if (globalDoc) {
        const rest = { ...globalDoc };
        delete (rest as { id?: string }).id;
        settingsObj = rest as Record<string, unknown>;
      }
    }

    const mappedUtilityAccounts = (utilityAccountsRes.ok ? utilityAccountsRes.rows : []).map((row) =>
      mapUtilityAccountRow(row as unknown as Record<string, unknown>)
    );

    const mappedUsers = (usersRes.ok ? usersRes.rows : []).map((row) =>
      mapUserRow(row as unknown as Record<string, unknown>, settingsObj)
    );

    let systemConfigObj: Record<string, unknown> | null = null;
    if (systemSettingsConfigRes.ok && systemSettingsConfigRes.rows.length > 0) {
      const globalCfg =
        systemSettingsConfigRes.rows.find((s) => s.id === 'global') || systemSettingsConfigRes.rows[0];
      if (globalCfg) {
        systemConfigObj = { ...globalCfg } as Record<string, unknown>;
      }
    }

    return {
      clients: (clientsRes.ok ? clientsRes.rows : []) as Record<string, unknown>[],
      payments: (paymentsRes.ok ? paymentsRes.rows : []) as Record<string, unknown>[],
      providerAccounts: (accountsRes.ok ? accountsRes.rows : []) as Record<string, unknown>[],
      providerDeposits: (depositsRes.ok ? depositsRes.rows : []) as Record<string, unknown>[],
      utilityAccounts: mappedUtilityAccounts,
      utilityReadings: (utilityReadingsRes.ok ? utilityReadingsRes.rows : []) as Record<string, unknown>[],
      customLedgerEntries: (ledgerEntriesRes.ok ? ledgerEntriesRes.rows : []) as Record<string, unknown>[],
      providerBalanceAdjustments: (adjustmentsRes.ok ? adjustmentsRes.rows : []) as Record<string, unknown>[],
      accountDeductionOverrides: (overridesRes.ok ? overridesRes.rows : []) as Record<string, unknown>[],
      users: mappedUsers,
      userSettings: (userSettingsRes.ok ? userSettingsRes.rows : []) as Record<string, unknown>[],
      systemSettingsConfig: systemConfigObj,
      settings: settingsObj,
      settingsReadSuccess: settingsRes.ok,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[PostgreSQL] loadAll error:', msg);
    connectionError = msg;
    isConnectedToCloudSql = false;
    return null;
  }
}

function mapUtilityAccountRow(row: Record<string, unknown>): Record<string, unknown> {
  const rawAssigned = Array.isArray(row['assignedUserIds']) ? row['assignedUserIds'] : [];
  const hiddenUtilityTabs = rawAssigned
    .filter((x) => typeof x === 'string' && x.startsWith('__hidden_tab__:'))
    .map((x) => x.slice('__hidden_tab__:'.length));
  const cleanAssignedUserIds = rawAssigned.filter(
    (x) => typeof x === 'string' && !x.startsWith('__hidden_tab__:')
  );
  return {
    ...row,
    assignedUserIds: cleanAssignedUserIds,
    hiddenUtilityTabs,
  };
}

function mapUserRow(
  row: Record<string, unknown>,
  settingsObj?: Record<string, unknown> | null
): Record<string, unknown> {
  const rawTabs = Array.isArray(row['allowedTabs']) ? row['allowedTabs'] : null;
  const allowedSettings = rawTabs
    ? rawTabs
        .filter((x) => typeof x === 'string' && x.startsWith('settings:'))
        .map((x) => x.slice('settings:'.length))
    : [];
  const userVariant = rawTabs
    ? rawTabs
        .filter((x) => typeof x === 'string' && x.startsWith('variant:'))
        .map((x) => x.slice('variant:'.length))[0]
    : null;
  const memberTags = rawTabs
    ? rawTabs
        .filter((x) => typeof x === 'string' && x.startsWith('tag:'))
        .map((x) => x.slice('tag:'.length))
    : [];
  const accessTag = rawTabs
    ? rawTabs
        .filter((x) => typeof x === 'string' && x.startsWith('access:'))
        .map((x) => x.slice('access:'.length))[0]
    : null;
  const invitedByUserId = rawTabs
    ? rawTabs
        .filter((x) => typeof x === 'string' && x.startsWith('invitedBy:'))
        .map((x) => x.slice('invitedBy:'.length))[0]
    : undefined;
  const invitedByUserName = rawTabs
    ? rawTabs
        .filter((x) => typeof x === 'string' && x.startsWith('invitedByName:'))
        .map((x) => x.slice('invitedByName:'.length))[0]
    : undefined;
  const cleanTabs = rawTabs
    ? rawTabs.filter(
        (x) =>
          typeof x === 'string' &&
          !x.startsWith('settings:') &&
          !x.startsWith('variant:') &&
          !x.startsWith('tag:') &&
          !x.startsWith('access:') &&
          !x.startsWith('invitedBy:') &&
          !x.startsWith('invitedByName:')
      )
    : null;
  const tariffs = (settingsObj?.['utilityTariffsSettings'] as Record<string, unknown>) || {};
  const userVariantsMap = (tariffs['userOutageVariants'] as Record<string, string>) || {};
  const resolvedVariant = userVariant || userVariantsMap[String(row['id'])] || 'v10_minimal_pills';
  const resolvedAccess =
    accessTag === 'view_only' || accessTag === 'full'
      ? accessTag
      : row['canManageOwnData'] === false
        ? 'view_only'
        : 'full';
  return {
    ...row,
    allowedTabs: cleanTabs,
    allowedSettings,
    outageScheduleViewVariant: resolvedVariant,
    memberTags,
    householdAccessLevel: resolvedAccess,
    ...(invitedByUserId ? { invitedByUserId } : {}),
    ...(invitedByUserName ? { invitedByUserName } : {}),
  };
}

export async function loadUsersOnlyFromCloudSql(
  mode?: DatabaseMode,
  settingsObj?: Record<string, unknown> | null
): Promise<Record<string, unknown>[] | null> {
  const targetMode = mode || getActiveDbMode();
  if (!isCloudSqlAvailable(targetMode)) return null;
  try {
    const targetDb = getDbForMode(targetMode);
    const [usersRes, settingsRes] = await Promise.all([
      trySelect(targetDb.select().from(users), 'users_only'),
      settingsObj
        ? Promise.resolve(null)
        : trySelect(targetDb.select().from(settings), 'users_only_settings'),
    ]);
    if (!usersRes.ok) return null;
    let resolvedSettings = settingsObj || null;
    if (!resolvedSettings && settingsRes && settingsRes.ok && settingsRes.rows.length > 0) {
      const validRows = settingsRes.rows.filter((s) => s.id !== '__db_mode__');
      const globalDoc = validRows.find((s) => s.id === 'global') || validRows[0];
      if (globalDoc) {
        const rest = { ...globalDoc };
        delete (rest as { id?: string }).id;
        resolvedSettings = rest as Record<string, unknown>;
      }
    }
    return usersRes.rows.map((row) =>
      mapUserRow(row as unknown as Record<string, unknown>, resolvedSettings)
    );
  } catch (err) {
    console.warn('[PostgreSQL] loadUsersOnly error:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function loadUtilityOnlyFromCloudSql(
  mode?: DatabaseMode
): Promise<{
  utilityAccounts: Record<string, unknown>[];
  utilityReadings: Record<string, unknown>[];
} | null> {
  const targetMode = mode || getActiveDbMode();
  if (!isCloudSqlAvailable(targetMode)) return null;
  try {
    const targetDb = getDbForMode(targetMode);
    const [accountsRes, readingsRes] = await Promise.all([
      trySelect(targetDb.select().from(utilityAccounts), 'utility_accounts_only'),
      trySelect(targetDb.select().from(utilityReadings), 'utility_readings_only'),
    ]);
    if (!accountsRes.ok && !readingsRes.ok) return null;
    return {
      utilityAccounts: (accountsRes.ok ? accountsRes.rows : []).map((row) =>
        mapUtilityAccountRow(row as unknown as Record<string, unknown>)
      ),
      utilityReadings: (readingsRes.ok ? readingsRes.rows : []) as Record<string, unknown>[],
    };
  } catch (err) {
    console.warn('[PostgreSQL] loadUtilityOnly error:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function saveClientToCloudSql(client: Record<string, unknown>, mode?: DatabaseMode): Promise<boolean> {
  const targetMode = mode || getActiveDbMode();
  if (targetMode === 'sqlite_local') return true;
  if (!isCloudSqlAvailable(targetMode)) return false;
  try {
    const targetDb = getDbForMode(targetMode);
    const data = {
      id: String(client['id']),
      fullName: String(client['fullName'] || ''),
      phone: String(client['phone'] || ''),
      iptvLogin: String(client['iptvLogin'] || ''),
      deviceInfo: client['deviceInfo'] ? String(client['deviceInfo']) : null,
      subscriptionPlan: client['subscriptionPlan'] ? String(client['subscriptionPlan']) : null,
      costUsd: Number(client['costUsd']) || 1,
      monthlyPrice: Number(client['monthlyPrice']) || 100,
      startDate: String(client['startDate'] || new Date().toISOString().split('T')[0]),
      activeUntil: String(client['activeUntil'] || new Date().toISOString().split('T')[0]),
      balance: Number(client['balance']) || 0,
      status: String(client['status'] || 'active'),
      providerAccountId: client['providerAccountId'] ? String(client['providerAccountId']) : null,
      notes: client['notes'] ? String(client['notes']) : null,
      groupName: client['groupName'] ? String(client['groupName']) : null,
      groupBalance: client['groupBalance'] != null ? Number(client['groupBalance']) : 0,
      lastReminderDate: client['lastReminderDate'] ? String(client['lastReminderDate']) : null,
      lastReminderStatus: client['lastReminderStatus'] ? String(client['lastReminderStatus']) : null,
      ownerUserId: client['ownerUserId'] ? String(client['ownerUserId']) : null,
      createdAt: String(client['createdAt'] || new Date().toISOString()),
      updatedAt: String(client['updatedAt'] || new Date().toISOString()),
    };

    await targetDb.insert(clients)
      .values(data)
      .onConflictDoUpdate({
        target: clients.id,
        set: data,
      });

    lastSyncTimestamp = new Date().toISOString();
    return true;
  } catch (err: unknown) {
    console.error(`[PostgreSQL:${targetMode}] saveClient error:`, err);
    return false;
  }
}

export async function deleteClientFromCloudSql(clientId: string, mode?: DatabaseMode): Promise<boolean> {
  const targetMode = mode || getActiveDbMode();
  if (targetMode === 'sqlite_local') return true;
  if (!isCloudSqlAvailable(targetMode)) return false;
  try {
    const targetDb = getDbForMode(targetMode);
    await targetDb.delete(clients).where(eq(clients.id, clientId));
    await targetDb.delete(payments).where(eq(payments.clientId, clientId));
    lastSyncTimestamp = new Date().toISOString();
    return true;
  } catch (err: unknown) {
    console.error(`[PostgreSQL:${targetMode}] deleteClient error:`, err);
    return false;
  }
}

export async function savePaymentToCloudSql(payment: Record<string, unknown>, mode?: DatabaseMode): Promise<boolean> {
  const targetMode = mode || getActiveDbMode();
  if (targetMode === 'sqlite_local') return true;
  if (!isCloudSqlAvailable(targetMode)) return false;
  try {
    const targetDb = getDbForMode(targetMode);
    const data = {
      id: String(payment['id']),
      clientId: String(payment['clientId']),
      clientName: String(payment['clientName'] || ''),
      amount: Number(payment['amount']) || 0,
      monthlyPrice: Number(payment['monthlyPrice']) || 100,
      previousBalance: Number(payment['previousBalance']) || 0,
      newBalance: Number(payment['newBalance']) || 0,
      monthsAdded: Number(payment['monthsAdded']) || 0,
      costUsdPerMonth: payment['costUsdPerMonth'] != null ? Number(payment['costUsdPerMonth']) : null,
      totalUsdDeducted: payment['totalUsdDeducted'] != null ? Number(payment['totalUsdDeducted']) : null,
      previousActiveUntil: String(payment['previousActiveUntil'] || ''),
      newActiveUntil: String(payment['newActiveUntil'] || ''),
      date: String(payment['date'] || new Date().toISOString()),
      note: payment['note'] ? String(payment['note']) : null,
    };

    await targetDb.insert(payments)
      .values(data)
      .onConflictDoUpdate({
        target: payments.id,
        set: data,
      });

    lastSyncTimestamp = new Date().toISOString();
    return true;
  } catch (err: unknown) {
    console.error(`[PostgreSQL:${targetMode}] savePayment error:`, err);
    return false;
  }
}

export async function deletePaymentFromCloudSql(paymentId: string, mode?: DatabaseMode): Promise<boolean> {
  const targetMode = mode || getActiveDbMode();
  if (targetMode === 'sqlite_local') return true;
  if (!isCloudSqlAvailable(targetMode)) return false;
  try {
    const targetDb = getDbForMode(targetMode);
    await targetDb.delete(payments).where(eq(payments.id, paymentId));
    lastSyncTimestamp = new Date().toISOString();
    return true;
  } catch (err: unknown) {
    console.error(`[PostgreSQL:${targetMode}] deletePayment error:`, err);
    return false;
  }
}

export async function saveProviderAccountToCloudSql(account: Record<string, unknown>, mode?: DatabaseMode): Promise<boolean> {
  const targetMode = mode || getActiveDbMode();
  if (targetMode === 'sqlite_local') return true;
  if (!isCloudSqlAvailable(targetMode)) return false;
  try {
    const targetDb = getDbForMode(targetMode);
    const data = {
      id: String(account['id']),
      name: String(account['name'] || ''),
      login: String(account['login'] || ''),
      password: account['password'] ? String(account['password']) : null,
      playlistUrl: account['playlistUrl'] ? String(account['playlistUrl']) : null,
      serverUrl: account['serverUrl'] ? String(account['serverUrl']) : null,
      maxSlots: Number(account['maxSlots']) || 2,
      assignedClientIds: Array.isArray(account['assignedClientIds']) ? (account['assignedClientIds'] as string[]) : [],
      pricePerMonthUsd: Number(account['pricePerMonthUsd']) || 1,
      startDate: account['startDate'] ? String(account['startDate']) : null,
      monthsCount: Number(account['monthsCount']) || 0,
      validUntil: String(account['validUntil'] || new Date().toISOString().split('T')[0]),
      totalDeductedUsd: Number(account['totalDeductedUsd']) || 0,
      renewals: Array.isArray(account['renewals']) ? (account['renewals'] as Record<string, unknown>[]) : null,
      notes: account['notes'] ? String(account['notes']) : null,
      ownerUserId: account['ownerUserId'] ? String(account['ownerUserId']) : null,
      createdAt: String(account['createdAt'] || new Date().toISOString()),
      updatedAt: account['updatedAt'] ? String(account['updatedAt']) : null,
    };

    await targetDb.insert(providerAccounts)
      .values(data)
      .onConflictDoUpdate({
        target: providerAccounts.id,
        set: data,
      });

    lastSyncTimestamp = new Date().toISOString();
    return true;
  } catch (err: unknown) {
    console.error(`[PostgreSQL:${targetMode}] saveProviderAccount error:`, err);
    return false;
  }
}

export async function deleteProviderAccountFromCloudSql(accountId: string, mode?: DatabaseMode): Promise<boolean> {
  const targetMode = mode || getActiveDbMode();
  if (targetMode === 'sqlite_local') return true;
  if (!isCloudSqlAvailable(targetMode)) return false;
  try {
    const targetDb = getDbForMode(targetMode);
    await targetDb.delete(providerAccounts).where(eq(providerAccounts.id, accountId));
    lastSyncTimestamp = new Date().toISOString();
    return true;
  } catch (err: unknown) {
    console.error(`[PostgreSQL:${targetMode}] deleteProviderAccount error:`, err);
    return false;
  }
}

export async function saveProviderDepositToCloudSql(deposit: Record<string, unknown>, mode?: DatabaseMode): Promise<boolean> {
  const targetMode = mode || getActiveDbMode();
  if (targetMode === 'sqlite_local') return true;
  if (!isCloudSqlAvailable(targetMode)) return false;
  try {
    const targetDb = getDbForMode(targetMode);
    const data = {
      id: String(deposit['id']),
      date: String(deposit['date'] || new Date().toISOString().split('T')[0]),
      amountUsd: Number(deposit['amountUsd']) || 0,
      spentUah: Number(deposit['spentUah']) || 0,
      exchangeRate: deposit['exchangeRate'] != null ? Number(deposit['exchangeRate']) : null,
      paymentMethod: deposit['paymentMethod'] ? String(deposit['paymentMethod']) : null,
      note: deposit['note'] ? String(deposit['note']) : null,
      createdAt: String(deposit['createdAt'] || new Date().toISOString()),
    };

    await targetDb.insert(providerDeposits)
      .values(data)
      .onConflictDoUpdate({
        target: providerDeposits.id,
        set: data,
      });

    lastSyncTimestamp = new Date().toISOString();
    return true;
  } catch (err: unknown) {
    console.error(`[PostgreSQL:${targetMode}] saveProviderDeposit error:`, err);
    return false;
  }
}

export async function deleteProviderDepositFromCloudSql(depositId: string, mode?: DatabaseMode): Promise<boolean> {
  const targetMode = mode || getActiveDbMode();
  if (targetMode === 'sqlite_local') return true;
  if (!isCloudSqlAvailable(targetMode)) return false;
  try {
    const targetDb = getDbForMode(targetMode);
    await targetDb.delete(providerDeposits).where(eq(providerDeposits.id, depositId));
    lastSyncTimestamp = new Date().toISOString();
    return true;
  } catch (err: unknown) {
    console.error(`[PostgreSQL:${targetMode}] deleteProviderDeposit error:`, err);
    return false;
  }
}

export async function saveUtilityAccountToCloudSql(account: Record<string, unknown>, mode?: DatabaseMode): Promise<boolean> {
  const targetMode = mode || getActiveDbMode();
  if (targetMode === 'sqlite_local') return true;
  if (!isCloudSqlAvailable(targetMode)) return false;
  try {
    const targetDb = getDbForMode(targetMode);
    const baseAssignedUsers = Array.isArray(account['assignedUserIds'])
      ? (account['assignedUserIds'] as string[]).filter((x) => typeof x === 'string' && !x.startsWith('__hidden_tab__:'))
      : [];
    const hiddenTabs = Array.isArray(account['hiddenUtilityTabs'])
      ? (account['hiddenUtilityTabs'] as string[]).filter(Boolean)
      : [];
    const serializedAssignedUserIds = [
      ...baseAssignedUsers,
      ...hiddenTabs.map((t) => `__hidden_tab__:${t}`),
    ];

    const data = {
      id: String(account['id']),
      type: String(account['type'] || 'electricity'),
      name: String(account['name'] || ''),
      accountNumber: String(account['accountNumber'] || ''),
      address: account['address'] ? String(account['address']) : null,
      city: account['city'] ? String(account['city']) : null,
      street: account['street'] ? String(account['street']) : null,
      houseNum: account['houseNum'] ? String(account['houseNum']) : null,
      dtekQueueGroup: account['dtekQueueGroup'] ? String(account['dtekQueueGroup']) : null,
      meterNumber: account['meterNumber'] ? String(account['meterNumber']) : null,
      electricityTariffType: String(account['electricityTariffType'] || 'single'),
      residentsCount: Number(account['residentsCount']) || 1,
      initialReadingT1: Number(account['initialReadingT1']) || 0,
      initialReadingT2: Number(account['initialReadingT2']) || 0,
      initialReadingWater: Number(account['initialReadingWater']) || 0,
      waterEnabled: account['waterEnabled'] !== undefined ? Boolean(account['waterEnabled']) : true,
      wasteEnabled: account['wasteEnabled'] !== undefined ? Boolean(account['wasteEnabled']) : true,
      balanceUah: Number(account['balanceUah']) || 0,
      notes: account['notes'] ? String(account['notes']) : null,
      ownerUserId: account['ownerUserId'] ? String(account['ownerUserId']) : null,
      assignedUserIds: serializedAssignedUserIds,
      dtekLogin: account['dtekLogin'] ? String(account['dtekLogin']) : null,
      dtekPasswordEnc: account['dtekPasswordEnc'] ? String(account['dtekPasswordEnc']) : null,
      dtekCabinetStatus: account['dtekCabinetStatus'] ? String(account['dtekCabinetStatus']) : null,
      dtekCabinetLastSync: account['dtekCabinetLastSync'] ? String(account['dtekCabinetLastSync']) : null,
      ooekLogin: account['ooekLogin'] ? String(account['ooekLogin']) : null,
      ooekPasswordEnc: account['ooekPasswordEnc'] ? String(account['ooekPasswordEnc']) : null,
      ooekAccountNumber: account['ooekAccountNumber'] ? String(account['ooekAccountNumber']) : null,
      ooekBalanceUah: account['ooekBalanceUah'] != null ? Number(account['ooekBalanceUah']) : null,
      ooekLastBillUah: account['ooekLastBillUah'] != null ? Number(account['ooekLastBillUah']) : null,
      ooekHistory: Array.isArray(account['ooekHistory']) ? (account['ooekHistory'] as Record<string, unknown>[]) : [],
      ooekCabinetStatus: account['ooekCabinetStatus'] ? String(account['ooekCabinetStatus']) : null,
      ooekCabinetLastSync: account['ooekCabinetLastSync'] ? String(account['ooekCabinetLastSync']) : null,
      devices: Array.isArray(account['devices']) ? (account['devices'] as Record<string, unknown>[]) : [],
      createdAt: String(account['createdAt'] || new Date().toISOString()),
      updatedAt: account['updatedAt'] ? String(account['updatedAt']) : null,
    };

    await targetDb.insert(utilityAccounts)
      .values(data)
      .onConflictDoUpdate({
        target: utilityAccounts.id,
        set: data,
      });

    lastSyncTimestamp = new Date().toISOString();
    return true;
  } catch (err: unknown) {
    console.error(`[PostgreSQL:${targetMode}] saveUtilityAccount error:`, err);
    return false;
  }
}

export async function deleteUtilityAccountFromCloudSql(accountId: string, mode?: DatabaseMode): Promise<boolean> {
  const targetMode = mode || getActiveDbMode();
  if (targetMode === 'sqlite_local') return true;
  if (!isCloudSqlAvailable(targetMode)) return false;
  try {
    const targetDb = getDbForMode(targetMode);
    await targetDb.delete(utilityAccounts).where(eq(utilityAccounts.id, accountId));
    await targetDb.delete(utilityReadings).where(eq(utilityReadings.accountId, accountId));
    lastSyncTimestamp = new Date().toISOString();
    return true;
  } catch (err: unknown) {
    console.error(`[PostgreSQL:${targetMode}] deleteUtilityAccount error:`, err);
    return false;
  }
}

export async function saveUtilityReadingToCloudSql(reading: Record<string, unknown>, mode?: DatabaseMode): Promise<boolean> {
  const targetMode = mode || getActiveDbMode();
  if (targetMode === 'sqlite_local') return true;
  if (!isCloudSqlAvailable(targetMode)) return false;
  try {
    const targetDb = getDbForMode(targetMode);
    const isControlOnly = reading['isControlOnly'] === true || String(reading['isControlOnly']) === 'true' || reading['readingPurpose'] === 'control';
    const data = {
      id: String(reading['id']),
      accountId: String(reading['accountId']),
      utilityType: String(reading['utilityType'] || 'electricity'),
      date: String(reading['date']),
      periodMonth: reading['periodMonth'] ? String(reading['periodMonth']) : null,
      readingT1: reading['readingT1'] != null ? Number(reading['readingT1']) : null,
      readingT2: reading['readingT2'] != null ? Number(reading['readingT2']) : null,
      consumptionT1: reading['consumptionT1'] != null ? Number(reading['consumptionT1']) : null,
      consumptionT2: reading['consumptionT2'] != null ? Number(reading['consumptionT2']) : null,
      rateT1: reading['rateT1'] != null ? Number(reading['rateT1']) : null,
      rateT2: reading['rateT2'] != null ? Number(reading['rateT2']) : null,
      totalCost: Number(reading['totalCost']) || 0,
      season: reading['season'] ? String(reading['season']) : null,
      isPaid: Boolean(reading['isPaid']),
      paidDate: reading['paidDate'] ? String(reading['paidDate']) : null,
      paidAmount: reading['paidAmount'] != null ? Number(reading['paidAmount']) : null,
      note: reading['note'] ? String(reading['note']) : null,
      isControlOnly,
      readingPurpose: String(reading['readingPurpose'] || (isControlOnly ? 'control' : 'billing')),
      daysSinceLastReading: reading['daysSinceLastReading'] != null ? Number(reading['daysSinceLastReading']) : null,
      dailyAvgConsumption: reading['dailyAvgConsumption'] != null ? Number(reading['dailyAvgConsumption']) : null,
      ownerUserId: reading['ownerUserId'] ? String(reading['ownerUserId']) : null,
      createdAt: String(reading['createdAt'] || new Date().toISOString()),
    };

    await targetDb.insert(utilityReadings)
      .values(data)
      .onConflictDoUpdate({
        target: utilityReadings.id,
        set: data,
      });

    lastSyncTimestamp = new Date().toISOString();
    return true;
  } catch (err: unknown) {
    console.error(`[PostgreSQL:${targetMode}] saveUtilityReading error:`, err);
    return false;
  }
}

export async function deleteUtilityReadingFromCloudSql(readingId: string, mode?: DatabaseMode): Promise<boolean> {
  const targetMode = mode || getActiveDbMode();
  if (targetMode === 'sqlite_local') return true;
  if (!isCloudSqlAvailable(targetMode)) return false;
  try {
    const targetDb = getDbForMode(targetMode);
    await targetDb.delete(utilityReadings).where(eq(utilityReadings.id, readingId));
    lastSyncTimestamp = new Date().toISOString();
    return true;
  } catch (err: unknown) {
    console.error(`[PostgreSQL:${targetMode}] deleteUtilityReading error:`, err);
    return false;
  }
}

export async function saveCustomLedgerEntryToCloudSql(entry: Record<string, unknown>, mode?: DatabaseMode): Promise<boolean> {
  const targetMode = mode || getActiveDbMode();
  if (targetMode === 'sqlite_local') return true;
  if (!isCloudSqlAvailable(targetMode)) return false;
  try {
    const targetDb = getDbForMode(targetMode);
    const data = {
      id: String(entry['id']),
      type: String(entry['type']),
      category: String(entry['category'] || 'other'),
      date: String(entry['date']),
      amountUah: Number(entry['amountUah']) || 0,
      amountUsd: entry['amountUsd'] != null ? Number(entry['amountUsd']) : null,
      title: String(entry['title'] || ''),
      subtitle: entry['subtitle'] ? String(entry['subtitle']) : null,
      note: entry['note'] ? String(entry['note']) : null,
      paymentMethod: entry['paymentMethod'] ? String(entry['paymentMethod']) : null,
      clientId: entry['clientId'] ? String(entry['clientId']) : null,
      clientName: entry['clientName'] ? String(entry['clientName']) : null,
      accountId: entry['accountId'] ? String(entry['accountId']) : null,
      accountName: entry['accountName'] ? String(entry['accountName']) : null,
      balanceBeforeUsd: entry['balanceBeforeUsd'] != null ? Number(entry['balanceBeforeUsd']) : null,
      balanceAfterUsd: entry['balanceAfterUsd'] != null ? Number(entry['balanceAfterUsd']) : null,
      createdAt: String(entry['createdAt'] || new Date().toISOString()),
    };

    await targetDb.insert(customLedgerEntries)
      .values(data)
      .onConflictDoUpdate({
        target: customLedgerEntries.id,
        set: data,
      });

    lastSyncTimestamp = new Date().toISOString();
    return true;
  } catch (err: unknown) {
    console.error(`[PostgreSQL:${targetMode}] saveCustomLedgerEntry error:`, err);
    return false;
  }
}

export async function deleteCustomLedgerEntryFromCloudSql(entryId: string, mode?: DatabaseMode): Promise<boolean> {
  const targetMode = mode || getActiveDbMode();
  if (targetMode === 'sqlite_local') return true;
  if (!isCloudSqlAvailable(targetMode)) return false;
  try {
    const targetDb = getDbForMode(targetMode);
    await targetDb.delete(customLedgerEntries).where(eq(customLedgerEntries.id, entryId));
    lastSyncTimestamp = new Date().toISOString();
    return true;
  } catch (err: unknown) {
    console.error(`[PostgreSQL:${targetMode}] deleteCustomLedgerEntry error:`, err);
    return false;
  }
}

export async function saveProviderBalanceAdjustmentToCloudSql(adj: Record<string, unknown>, mode?: DatabaseMode): Promise<boolean> {
  const targetMode = mode || getActiveDbMode();
  if (targetMode === 'sqlite_local') return true;
  if (!isCloudSqlAvailable(targetMode)) return false;
  try {
    const targetDb = getDbForMode(targetMode);
    const data = {
      id: String(adj['id']),
      date: String(adj['date']),
      amountUsd: Number(adj['amountUsd']) || 0,
      note: adj['note'] ? String(adj['note']) : null,
      createdAt: String(adj['createdAt'] || new Date().toISOString()),
    };

    await targetDb.insert(providerBalanceAdjustments)
      .values(data)
      .onConflictDoUpdate({
        target: providerBalanceAdjustments.id,
        set: data,
      });

    lastSyncTimestamp = new Date().toISOString();
    return true;
  } catch (err: unknown) {
    console.error(`[PostgreSQL:${targetMode}] saveProviderBalanceAdjustment error:`, err);
    return false;
  }
}

export async function deleteProviderBalanceAdjustmentFromCloudSql(adjId: string, mode?: DatabaseMode): Promise<boolean> {
  const targetMode = mode || getActiveDbMode();
  if (targetMode === 'sqlite_local') return true;
  if (!isCloudSqlAvailable(targetMode)) return false;
  try {
    const targetDb = getDbForMode(targetMode);
    await targetDb.delete(providerBalanceAdjustments).where(eq(providerBalanceAdjustments.id, adjId));
    lastSyncTimestamp = new Date().toISOString();
    return true;
  } catch (err: unknown) {
    console.error(`[PostgreSQL:${targetMode}] deleteProviderBalanceAdjustment error:`, err);
    return false;
  }
}

export async function saveAccountDeductionOverrideToCloudSql(override: Record<string, unknown>, mode?: DatabaseMode): Promise<boolean> {
  const targetMode = mode || getActiveDbMode();
  if (targetMode === 'sqlite_local') return true;
  if (!isCloudSqlAvailable(targetMode)) return false;
  try {
    const targetDb = getDbForMode(targetMode);
    const data = {
      id: String(override['id']),
      isExcluded: Boolean(override['isExcluded']),
      amountUsd: override['amountUsd'] != null ? Number(override['amountUsd']) : null,
      amountUah: override['amountUah'] != null ? Number(override['amountUah']) : null,
      date: override['date'] ? String(override['date']) : null,
      title: override['title'] ? String(override['title']) : null,
      subtitle: override['subtitle'] ? String(override['subtitle']) : null,
      note: override['note'] ? String(override['note']) : null,
      createdAt: override['createdAt'] ? String(override['createdAt']) : null,
    };

    await targetDb.insert(accountDeductionOverrides)
      .values(data)
      .onConflictDoUpdate({
        target: accountDeductionOverrides.id,
        set: data,
      });

    lastSyncTimestamp = new Date().toISOString();
    return true;
  } catch (err: unknown) {
    console.error(`[PostgreSQL:${targetMode}] saveAccountDeductionOverride error:`, err);
    return false;
  }
}

export async function saveUserToCloudSql(user: Record<string, unknown>, mode?: DatabaseMode): Promise<boolean> {
  const targetMode = mode || getActiveDbMode();
  if (targetMode === 'sqlite_local') return true;
  if (!isCloudSqlAvailable(targetMode)) return false;
  try {
    const targetDb = getDbForMode(targetMode);
    const baseTabs = Array.isArray(user['allowedTabs'])
      ? (user['allowedTabs'] as string[]).filter(
          (x) =>
            typeof x === 'string' &&
            !x.startsWith('settings:') &&
            !x.startsWith('variant:') &&
            !x.startsWith('tag:') &&
            !x.startsWith('access:') &&
            !x.startsWith('invitedBy:') &&
            !x.startsWith('invitedByName:')
        )
      : null;
    const allowedSettings = Array.isArray(user['allowedSettings'])
      ? (user['allowedSettings'] as string[]).filter(Boolean)
      : [];
    const variantTag = user['outageScheduleViewVariant']
      ? [`variant:${user['outageScheduleViewVariant']}`]
      : [];
    const memberTags = Array.isArray(user['memberTags'])
      ? (user['memberTags'] as string[]).filter(Boolean).map((t) => `tag:${t}`)
      : [];
    const accessTag = user['householdAccessLevel']
      ? [`access:${user['householdAccessLevel']}`]
      : [];
    const invitedByTag = user['invitedByUserId']
      ? [`invitedBy:${user['invitedByUserId']}`]
      : [];
    const invitedByNameTag = user['invitedByUserName']
      ? [`invitedByName:${user['invitedByUserName']}`]
      : [];
    const serializedAllowedTabs =
      baseTabs !== null ||
      allowedSettings.length > 0 ||
      variantTag.length > 0 ||
      memberTags.length > 0 ||
      accessTag.length > 0 ||
      invitedByTag.length > 0
        ? [
            ...(baseTabs || ['electricity', 'water', 'waste', 'water_waste']),
            ...allowedSettings.map((s) => `settings:${s}`),
            ...variantTag,
            ...memberTags,
            ...accessTag,
            ...invitedByTag,
            ...invitedByNameTag,
          ]
        : null;

    const data = {
      id: String(user['id']),
      email: String(user['email'] || ''),
      name: String(user['name'] || ''),
      picture: user['picture'] ? String(user['picture']) : null,
      role: String(user['role'] || 'admin'),
      status: String(user['status'] || 'active'),
      sub: user['sub'] ? String(user['sub']) : null,
      allowedTabs: serializedAllowedTabs,
      assignedUtilityAccountIds: Array.isArray(user['assignedUtilityAccountIds'])
        ? (user['assignedUtilityAccountIds'] as string[])
        : [],
      assignedClientIds: Array.isArray(user['assignedClientIds']) ? (user['assignedClientIds'] as string[]) : [],
      defaultUtilityAccountId: user['defaultUtilityAccountId'] ? String(user['defaultUtilityAccountId']) : null,
      canManageOwnData: user['canManageOwnData'] !== undefined ? Boolean(user['canManageOwnData']) : true,
      createdAt: String(user['createdAt'] || new Date().toISOString()),
      lastLoginAt: user['lastLoginAt'] ? String(user['lastLoginAt']) : null,
    };

    await targetDb.insert(users)
      .values(data)
      .onConflictDoUpdate({
        target: users.id,
        set: data,
      });

    lastSyncTimestamp = new Date().toISOString();
    return true;
  } catch (err: unknown) {
    console.error(`[PostgreSQL:${targetMode}] saveUser error:`, err);
    return false;
  }
}

export async function deleteUserFromCloudSql(userId: string, mode?: DatabaseMode): Promise<boolean> {
  const targetMode = mode || getActiveDbMode();
  if (targetMode === 'sqlite_local') return true;
  if (!isCloudSqlAvailable(targetMode)) return false;
  try {
    const targetDb = getDbForMode(targetMode);
    await targetDb.delete(users).where(eq(users.id, userId));
    lastSyncTimestamp = new Date().toISOString();
    return true;
  } catch (err: unknown) {
    console.error(`[PostgreSQL:${targetMode}] deleteUser error:`, err);
    return false;
  }
}

export async function saveSettingsToCloudSql(settingsObj: Record<string, unknown>, mode?: DatabaseMode): Promise<boolean> {
  const targetMode = mode || getActiveDbMode();
  if (targetMode === 'sqlite_local') return true;
  if (!isCloudSqlAvailable(targetMode)) return false;
  try {
    const targetDb = getDbForMode(targetMode);
    const data = {
      id: 'global',
      defaultMonthlyPrice: Number(settingsObj['defaultMonthlyPrice']) || 100,
      reminderDaysBefore: Number(settingsObj['reminderDaysBefore']) || 7,
      cardRequisites: String(settingsObj['cardRequisites'] || ''),
      reminderMessageTemplate: String(settingsObj['reminderMessageTemplate'] || ''),
      autoReminderEnabled: Boolean(settingsObj['autoReminderEnabled']),
      viberReminderMessageTemplate: settingsObj['viberReminderMessageTemplate'] ? String(settingsObj['viberReminderMessageTemplate']) : null,
      viberRenewalMessageTemplate: settingsObj['viberRenewalMessageTemplate'] ? String(settingsObj['viberRenewalMessageTemplate']) : null,
      utilityTariffsSettings: settingsObj['utilityTariffsSettings'] || null,
    };

    await targetDb.insert(settings)
      .values(data)
      .onConflictDoUpdate({
        target: settings.id,
        set: data,
      });

    if (!mode || mode === getActiveDbMode()) {
      isConnectedToCloudSql = true;
      connectionError = null;
    }
    lastSyncTimestamp = new Date().toISOString();
    return true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[PostgreSQL:${targetMode}] saveSettings error:`, msg);
    if (!mode || mode === getActiveDbMode()) {
      isConnectedToCloudSql = false;
      connectionError = msg;
    }
    return false;
  }
}

export async function saveUserSettingsToCloudSql(
  row: Record<string, unknown>,
  mode?: DatabaseMode
): Promise<boolean> {
  const targetMode = mode || getActiveDbMode();
  if (targetMode === 'sqlite_local') return true;
  if (!isCloudSqlAvailable(targetMode)) return false;
  try {
    const targetDb = getDbForMode(targetMode);
    const data = {
      userId: String(row['userId']),
      themeMode: String(row['themeMode'] || 'light'),
      outageScheduleViewVariant: String(row['outageScheduleViewVariant'] || 'v10_minimal_pills'),
      hiddenHouseTabs:
        row['hiddenHouseTabs'] && typeof row['hiddenHouseTabs'] === 'object'
          ? (row['hiddenHouseTabs'] as Record<string, string[]>)
          : {},
      electricityTariffs:
        row['electricityTariffs'] && typeof row['electricityTariffs'] === 'object'
          ? (row['electricityTariffs'] as Record<string, unknown>)
          : null,
      waterTariffs:
        row['waterTariffs'] && typeof row['waterTariffs'] === 'object'
          ? (row['waterTariffs'] as Record<string, unknown>)
          : null,
      wasteTariffs:
        row['wasteTariffs'] && typeof row['wasteTariffs'] === 'object'
          ? (row['wasteTariffs'] as Record<string, unknown>)
          : null,
      customPreferences:
        row['customPreferences'] && typeof row['customPreferences'] === 'object'
          ? (row['customPreferences'] as Record<string, unknown>)
          : {},
      updatedAt: String(row['updatedAt'] || new Date().toISOString()),
    };

    await targetDb
      .insert(userSettings)
      .values(data)
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: data,
      });

    lastSyncTimestamp = new Date().toISOString();
    return true;
  } catch (err: unknown) {
    console.error(`[PostgreSQL:${targetMode}] saveUserSettings error:`, err);
    return false;
  }
}

export async function saveSystemSettingsConfigToCloudSql(
  cfg: Record<string, unknown>,
  mode?: DatabaseMode
): Promise<boolean> {
  const targetMode = mode || getActiveDbMode();
  if (targetMode === 'sqlite_local') return true;
  if (!isCloudSqlAvailable(targetMode)) return false;
  try {
    const targetDb = getDbForMode(targetMode);
    const data = {
      id: String(cfg['id'] || 'global'),
      scopesConfig:
        cfg['scopesConfig'] && typeof cfg['scopesConfig'] === 'object'
          ? (cfg['scopesConfig'] as Record<string, 'user' | 'system'>)
          : {},
      systemValues:
        cfg['systemValues'] && typeof cfg['systemValues'] === 'object'
          ? (cfg['systemValues'] as Record<string, unknown>)
          : {},
      updatedAt: String(cfg['updatedAt'] || new Date().toISOString()),
    };

    await targetDb
      .insert(systemSettingsConfig)
      .values(data)
      .onConflictDoUpdate({
        target: systemSettingsConfig.id,
        set: data,
      });

    lastSyncTimestamp = new Date().toISOString();
    return true;
  } catch (err: unknown) {
    console.error(`[PostgreSQL:${targetMode}] saveSystemSettingsConfig error:`, err);
    return false;
  }
}

export async function getSettingsFromCloudSql(): Promise<Record<string, unknown> | null> {
  if (!isCloudSqlAvailable()) return null;
  try {
    const allSettings = await db.select().from(settings);
    if (allSettings.length > 0) {
      const globalDoc = allSettings.find((s) => s.id === 'global') || allSettings[0];
      const rest = { ...globalDoc };
      delete (rest as { id?: string }).id;
      return rest as Record<string, unknown>;
    }
    return null;
  } catch (err: unknown) {
    console.warn('[PostgreSQL] getSettings error:', err);
    return null;
  }
}

export async function seedInitialDataToCloudSql(fullDb: Record<string, unknown>, mode?: DatabaseMode): Promise<boolean> {
  const targetMode = mode || getActiveDbMode();
  if (targetMode === 'sqlite_local') return true;
  try {
    if (fullDb['settings']) {
      await saveSettingsToCloudSql(fullDb['settings'] as Record<string, unknown>, targetMode);
    }
    if (Array.isArray(fullDb['clients'])) {
      for (const c of fullDb['clients']) await saveClientToCloudSql(c as Record<string, unknown>, targetMode);
    }
    if (Array.isArray(fullDb['payments'])) {
      for (const p of fullDb['payments']) await savePaymentToCloudSql(p as Record<string, unknown>, targetMode);
    }
    if (Array.isArray(fullDb['providerAccounts'])) {
      for (const a of fullDb['providerAccounts']) await saveProviderAccountToCloudSql(a as Record<string, unknown>, targetMode);
    }
    if (Array.isArray(fullDb['providerDeposits'])) {
      for (const d of fullDb['providerDeposits']) await saveProviderDepositToCloudSql(d as Record<string, unknown>, targetMode);
    }
    if (Array.isArray(fullDb['utilityAccounts'])) {
      for (const u of fullDb['utilityAccounts']) await saveUtilityAccountToCloudSql(u as Record<string, unknown>, targetMode);
    }
    if (Array.isArray(fullDb['utilityReadings'])) {
      for (const r of fullDb['utilityReadings']) await saveUtilityReadingToCloudSql(r as Record<string, unknown>, targetMode);
    }
    if (Array.isArray(fullDb['customLedgerEntries'])) {
      for (const e of fullDb['customLedgerEntries']) await saveCustomLedgerEntryToCloudSql(e as Record<string, unknown>, targetMode);
    }
    if (Array.isArray(fullDb['providerBalanceAdjustments'])) {
      for (const a of fullDb['providerBalanceAdjustments']) await saveProviderBalanceAdjustmentToCloudSql(a as Record<string, unknown>, targetMode);
    }
    if (Array.isArray(fullDb['accountDeductionOverrides'])) {
      for (const o of fullDb['accountDeductionOverrides']) await saveAccountDeductionOverrideToCloudSql(o as Record<string, unknown>, targetMode);
    }
    if (Array.isArray(fullDb['users'])) {
      for (const u of fullDb['users']) await saveUserToCloudSql(u as Record<string, unknown>, targetMode);
    }
    if (fullDb['userSettings'] && typeof fullDb['userSettings'] === 'object') {
      const entries = Array.isArray(fullDb['userSettings'])
        ? (fullDb['userSettings'] as Record<string, unknown>[])
        : (Object.values(fullDb['userSettings'] as Record<string, unknown>) as Record<string, unknown>[]);
      for (const us of entries) {
        if (us && us['userId']) await saveUserSettingsToCloudSql(us, targetMode);
      }
    }
    if (fullDb['systemSettingsConfig'] && typeof fullDb['systemSettingsConfig'] === 'object') {
      await saveSystemSettingsConfigToCloudSql(fullDb['systemSettingsConfig'] as Record<string, unknown>, targetMode);
    }
    console.log(`[PostgreSQL:${targetMode}] Full database initialized in PostgreSQL`);
    return true;
  } catch (err: unknown) {
    console.error(`[PostgreSQL:${targetMode}] seedInitialData error:`, err);
    return false;
  }
}

export async function purgeTestDataFromCloudSql(): Promise<boolean> {
  if (!isCloudSqlAvailable()) return false;
  try {
    await Promise.all([
      db.delete(clients),
      db.delete(payments),
      db.delete(providerAccounts),
      db.delete(providerDeposits),
      db.delete(utilityAccounts),
      db.delete(utilityReadings),
      db.delete(customLedgerEntries),
      db.delete(providerBalanceAdjustments),
      db.delete(accountDeductionOverrides),
      db.delete(settings),
    ]);
    lastSyncTimestamp = new Date().toISOString();
    console.log('[PostgreSQL] Purged all test data');
    return true;
  } catch (err: unknown) {
    console.error('[PostgreSQL] purgeTestData error:', err);
    return false;
  }
}

export async function loadPersistedDbMode(): Promise<DatabaseMode> {
  const currentMode = getActiveDbMode();
  try {
    if (currentMode === 'external' && !isExternalDbConfigured()) {
      return getActiveDbMode();
    }
    const targetDb = getDbForMode(currentMode);
    await ensureDatabaseSchema(currentMode);
    const rows = await targetDb.select().from(settings).where(eq(settings.id, '__db_mode__'));
    if (rows.length > 0) {
      const savedMode = rows[0].cardRequisites as DatabaseMode;
      if (savedMode === 'cloudsql' || savedMode === 'external') {
        setActiveDbMode(savedMode);
        return savedMode;
      }
    }
  } catch (err) {
    console.warn(`[PostgreSQL] Could not load persisted db mode from ${currentMode}:`, err);
  }
  return getActiveDbMode();
}

export async function savePersistedDbMode(mode: DatabaseMode): Promise<void> {
  setActiveDbMode(mode);
  try {
    if (mode === 'external' && !isExternalDbConfigured()) {
      return;
    }
    const targetDb = getDbForMode(mode);
    await ensureDatabaseSchema(mode);
    const modeRow = {
      id: '__db_mode__',
      defaultMonthlyPrice: 100,
      reminderDaysBefore: 7,
      cardRequisites: mode,
      reminderMessageTemplate: '',
      autoReminderEnabled: false,
      viberReminderMessageTemplate: null,
      viberRenewalMessageTemplate: null,
      utilityTariffsSettings: null,
    };
    await targetDb
      .insert(settings)
      .values(modeRow)
      .onConflictDoUpdate({
        target: settings.id,
        set: modeRow,
      });
  } catch (err) {
    console.warn(`[PostgreSQL] Failed to persist db mode in ${mode} db:`, err);
  }
}

export interface DatabaseInstanceInspection {
  mode: DatabaseMode;
  provider: string;
  host: string;
  database: string;
  configured: boolean;
  connected: boolean;
  error: string | null;
  counts: {
    clients: number;
    payments: number;
    providerAccounts: number;
    providerDeposits: number;
    utilityAccounts: number;
    utilityReadings: number;
    customLedgerEntries: number;
    users: number;
    settingsConfigured: boolean;
  };
}

export async function inspectDatabaseInstance(mode: DatabaseMode): Promise<DatabaseInstanceInspection> {
  const meta = getModeMetadata(mode);
  if (!meta.configured) {
    return {
      ...meta,
      connected: false,
      error: 'База даних не налаштована у змінних середовища',
      counts: {
        clients: 0,
        payments: 0,
        providerAccounts: 0,
        providerDeposits: 0,
        utilityAccounts: 0,
        utilityReadings: 0,
        customLedgerEntries: 0,
        users: 0,
        settingsConfigured: false,
      },
    };
  }

  try {
    const targetPool = getPoolForMode(mode);
    await targetPool.query('SELECT 1');
    await ensureDatabaseSchema(mode);
    const res = await targetPool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM clients) AS clients,
        (SELECT COUNT(*)::int FROM payments) AS payments,
        (SELECT COUNT(*)::int FROM provider_accounts) AS provider_accounts,
        (SELECT COUNT(*)::int FROM provider_deposits) AS provider_deposits,
        (SELECT COUNT(*)::int FROM utility_accounts) AS utility_accounts,
        (SELECT COUNT(*)::int FROM utility_readings) AS utility_readings,
        (SELECT COUNT(*)::int FROM custom_ledger_entries) AS custom_ledger_entries,
        (SELECT COUNT(*)::int FROM users) AS users,
        (SELECT COUNT(*)::int FROM settings WHERE id = 'global') AS settings_count
    `);
    const row = res.rows[0] || {};
    return {
      ...meta,
      connected: true,
      error: null,
      counts: {
        clients: Number(row.clients) || 0,
        payments: Number(row.payments) || 0,
        providerAccounts: Number(row.provider_accounts) || 0,
        providerDeposits: Number(row.provider_deposits) || 0,
        utilityAccounts: Number(row.utility_accounts) || 0,
        utilityReadings: Number(row.utility_readings) || 0,
        customLedgerEntries: Number(row.custom_ledger_entries) || 0,
        users: Number(row.users) || 0,
        settingsConfigured: Number(row.settings_count) > 0,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ...meta,
      connected: false,
      error: msg,
      counts: {
        clients: 0,
        payments: 0,
        providerAccounts: 0,
        providerDeposits: 0,
        utilityAccounts: 0,
        utilityReadings: 0,
        customLedgerEntries: 0,
        users: 0,
        settingsConfigured: false,
      },
    };
  }
}

export interface CopyDatabasesResult {
  success: boolean;
  sourceMode: DatabaseMode;
  targetMode: DatabaseMode;
  sourceProvider: string;
  targetProvider: string;
  counts: {
    clients: number;
    payments: number;
    providerAccounts: number;
    providerDeposits: number;
    utilityAccounts: number;
    utilityReadings: number;
    customLedgerEntries: number;
    providerBalanceAdjustments: number;
    accountDeductionOverrides: number;
    users: number;
    settings: number;
  };
  totalCopied: number;
  error?: string;
}

export async function copyAllBetweenDatabases(
  sourceMode: DatabaseMode,
  targetMode: DatabaseMode
): Promise<CopyDatabasesResult> {
  const sourceMeta = getModeMetadata(sourceMode);
  const targetMeta = getModeMetadata(targetMode);

  const emptyCounts = {
    clients: 0,
    payments: 0,
    providerAccounts: 0,
    providerDeposits: 0,
    utilityAccounts: 0,
    utilityReadings: 0,
    customLedgerEntries: 0,
    providerBalanceAdjustments: 0,
    accountDeductionOverrides: 0,
    users: 0,
    settings: 0,
  };

  if (sourceMode === targetMode) {
    return {
      success: false,
      sourceMode,
      targetMode,
      sourceProvider: sourceMeta.provider,
      targetProvider: targetMeta.provider,
      counts: emptyCounts,
      totalCopied: 0,
      error: 'Джерело та цільова база даних повинні відрізнятися',
    };
  }

  try {
    const sourceOk = await ensureDatabaseSchema(sourceMode);
    if (!sourceOk) {
      throw new Error(`Не вдалося підключитися до бази-джерела (${sourceMeta.provider})`);
    }
    const targetOk = await ensureDatabaseSchema(targetMode);
    if (!targetOk) {
      throw new Error(`Не вдалося підключитися або створити таблиці у цільовій базі (${targetMeta.provider})`);
    }

    const sourceDb = getDbForMode(sourceMode);
    const targetDb = getDbForMode(targetMode);

    const [
      clientsRows,
      paymentsRows,
      accountsRows,
      depositsRows,
      settingsRows,
      utilityAccountsRows,
      utilityReadingsRows,
      ledgerRows,
      adjustmentsRows,
      overridesRows,
      usersRows,
    ] = await Promise.all([
      sourceDb.select().from(clients),
      sourceDb.select().from(payments),
      sourceDb.select().from(providerAccounts),
      sourceDb.select().from(providerDeposits),
      sourceDb.select().from(settings),
      sourceDb.select().from(utilityAccounts),
      sourceDb.select().from(utilityReadings),
      sourceDb.select().from(customLedgerEntries),
      sourceDb.select().from(providerBalanceAdjustments),
      sourceDb.select().from(accountDeductionOverrides),
      sourceDb.select().from(users),
    ]);

    const validSettingsRows = settingsRows.filter((s) => s.id !== '__db_mode__');

    for (const row of validSettingsRows) {
      await targetDb.insert(settings).values(row).onConflictDoUpdate({ target: settings.id, set: row });
    }
    for (const row of clientsRows) {
      await targetDb.insert(clients).values(row).onConflictDoUpdate({ target: clients.id, set: row });
    }
    for (const row of paymentsRows) {
      await targetDb.insert(payments).values(row).onConflictDoUpdate({ target: payments.id, set: row });
    }
    for (const row of accountsRows) {
      await targetDb.insert(providerAccounts).values(row).onConflictDoUpdate({ target: providerAccounts.id, set: row });
    }
    for (const row of depositsRows) {
      await targetDb.insert(providerDeposits).values(row).onConflictDoUpdate({ target: providerDeposits.id, set: row });
    }
    for (const row of utilityAccountsRows) {
      await targetDb.insert(utilityAccounts).values(row).onConflictDoUpdate({ target: utilityAccounts.id, set: row });
    }
    for (const row of utilityReadingsRows) {
      await targetDb.insert(utilityReadings).values(row).onConflictDoUpdate({ target: utilityReadings.id, set: row });
    }
    for (const row of ledgerRows) {
      await targetDb.insert(customLedgerEntries).values(row).onConflictDoUpdate({ target: customLedgerEntries.id, set: row });
    }
    for (const row of adjustmentsRows) {
      await targetDb
        .insert(providerBalanceAdjustments)
        .values(row)
        .onConflictDoUpdate({ target: providerBalanceAdjustments.id, set: row });
    }
    for (const row of overridesRows) {
      await targetDb
        .insert(accountDeductionOverrides)
        .values(row)
        .onConflictDoUpdate({ target: accountDeductionOverrides.id, set: row });
    }
    for (const row of usersRows) {
      await targetDb.insert(users).values(row).onConflictDoUpdate({ target: users.id, set: row });
    }

    try {
      const userSettingsRows = await sourceDb.select().from(userSettings);
      for (const row of userSettingsRows) {
        await targetDb
          .insert(userSettings)
          .values(row)
          .onConflictDoUpdate({ target: userSettings.userId, set: row });
      }
    } catch {
      // ignore if not present
    }

    try {
      const sysCfgRows = await sourceDb.select().from(systemSettingsConfig);
      for (const row of sysCfgRows) {
        await targetDb
          .insert(systemSettingsConfig)
          .values(row)
          .onConflictDoUpdate({ target: systemSettingsConfig.id, set: row });
      }
    } catch {
      // ignore if not present
    }

    const counts = {
      clients: clientsRows.length,
      payments: paymentsRows.length,
      providerAccounts: accountsRows.length,
      providerDeposits: depositsRows.length,
      utilityAccounts: utilityAccountsRows.length,
      utilityReadings: utilityReadingsRows.length,
      customLedgerEntries: ledgerRows.length,
      providerBalanceAdjustments: adjustmentsRows.length,
      accountDeductionOverrides: overridesRows.length,
      users: usersRows.length,
      settings: validSettingsRows.length,
    };

    const totalCopied =
      counts.clients +
      counts.payments +
      counts.providerAccounts +
      counts.providerDeposits +
      counts.utilityAccounts +
      counts.utilityReadings +
      counts.customLedgerEntries +
      counts.providerBalanceAdjustments +
      counts.accountDeductionOverrides +
      counts.users +
      counts.settings;

    lastSyncTimestamp = new Date().toISOString();
    return {
      success: true,
      sourceMode,
      targetMode,
      sourceProvider: sourceMeta.provider,
      targetProvider: targetMeta.provider,
      counts,
      totalCopied,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[PostgreSQL] copyAllBetweenDatabases (${sourceMode} -> ${targetMode}) error:`, msg);
    return {
      success: false,
      sourceMode,
      targetMode,
      sourceProvider: sourceMeta.provider,
      targetProvider: targetMeta.provider,
      counts: emptyCounts,
      totalCopied: 0,
      error: msg,
    };
  }
}

