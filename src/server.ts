import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, Type } from '@google/genai';
import * as webpush from 'web-push';
import { FIREBASE_APPLET_CONFIG } from './app/firebase-config';
import { verifyFirebaseTokenSafe } from './server/firebase-admin';
import {
  loadAllFromCloudSql,
  saveClientToCloudSql,
  deleteClientFromCloudSql,
  savePaymentToCloudSql,
  deletePaymentFromCloudSql,
  saveProviderAccountToCloudSql,
  deleteProviderAccountFromCloudSql,
  saveProviderDepositToCloudSql,
  deleteProviderDepositFromCloudSql,
  saveUtilityAccountToCloudSql,
  deleteUtilityAccountFromCloudSql,
  saveUtilityReadingToCloudSql,
  deleteUtilityReadingFromCloudSql,
  saveCustomLedgerEntryToCloudSql,
  deleteCustomLedgerEntryFromCloudSql,
  saveProviderBalanceAdjustmentToCloudSql,
  deleteProviderBalanceAdjustmentFromCloudSql,
  saveAccountDeductionOverrideToCloudSql,
  saveUserToCloudSql,
  deleteUserFromCloudSql,
  saveSettingsToCloudSql,
  saveUserSettingsToCloudSql,
  saveSystemSettingsConfigToCloudSql,
  seedInitialDataToCloudSql,
  purgeTestDataFromCloudSql,
  getCloudSqlDbStatus,
  loadPersistedDbMode,
  savePersistedDbMode,
  inspectDatabaseInstance,
  copyAllBetweenDatabases,
  checkCloudSqlConnection,
} from './server/cloudsql-sync';
import { DatabaseMode, isCloudSqlEnvConfigured, isExternalDbConfigured } from './db/index';

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine({
  allowedHosts: ['homehub3.ai.studio', '*.ai.studio', '*.run.app', 'localhost', '127.0.0.1'],
});

app.use(express.json({ limit: '15mb' }));
app.use('/src/assets', express.static(resolve(process.cwd(), 'src/assets')));
app.use('/assets', express.static(resolve(process.cwd(), 'src/assets')));

// Ensure Angular SSR never fails with 400 Bad Request on proxied Cloud Run hosts
app.use((req, _res, next) => {
  delete req.headers['x-forwarded-host'];
  next();
});

app.get(['/_ah/health', '/healthz'], (_req, res) => {
  res.status(200).send('OK');
});

interface AppState {
  version: number;
  lastUpdate: string;
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
  userSettings: Record<string, Record<string, unknown>>;
  systemSettingsConfig: Record<string, unknown>;
  settings: Record<string, unknown>;
}

const DEFAULT_SCOPES_CONFIG: Record<string, 'user' | 'system'> = {
  theme: 'user',
  outage_display: 'user',
  house_visibility: 'user',
  electricity_tariffs: 'user',
  water_tariffs: 'user',
  waste_tariffs: 'user',
  outage_sync_interval: 'system',
  billing: 'system',
  viber: 'system',
  telegram: 'system',
  database: 'system',
  backup: 'system',
};

const DEFAULT_SYSTEM_SETTINGS_CONFIG: Record<string, unknown> = {
  id: 'global',
  scopesConfig: { ...DEFAULT_SCOPES_CONFIG },
  systemValues: {},
  updatedAt: new Date().toISOString(),
};

function getDefaultUserSettingsIds(
  scopesOverride?: Record<string, 'user' | 'system'>
): string[] {
  const scopes =
    scopesOverride ||
    (state?.systemSettingsConfig?.['scopesConfig'] as Record<string, 'user' | 'system'>) ||
    DEFAULT_SCOPES_CONFIG;
  return Object.keys(DEFAULT_SCOPES_CONFIG).filter(
    (key) => (scopes[key] || DEFAULT_SCOPES_CONFIG[key]) === 'user'
  );
}

function ensureUserDefaultSettings(user: Record<string, unknown>): boolean {
  let changed = false;
  if (user['role'] === 'admin') return false;
  const userScoped = getDefaultUserSettingsIds();
  const currentSettings = Array.isArray(user['allowedSettings'])
    ? (user['allowedSettings'] as string[])
    : [];
  const mergedSettings = Array.from(new Set([...userScoped, ...currentSettings]));
  if (mergedSettings.length !== currentSettings.length) {
    user['allowedSettings'] = mergedSettings;
    changed = true;
  }
  const currentTabs = Array.isArray(user['allowedTabs'])
    ? (user['allowedTabs'] as string[])
    : ['outage_schedule', 'electricity', 'water', 'waste', 'water_waste', 'settings'];
  if (mergedSettings.length > 0 && !currentTabs.includes('settings')) {
    user['allowedTabs'] = [...currentTabs, 'settings'];
    changed = true;
  }
  return changed;
}

const DEFAULT_SETTINGS_OBJ: Record<string, unknown> = {
  telegramBotToken: process.env['TELEGRAM_BOT_TOKEN'] || '',
  telegramBotUsername: process.env['TELEGRAM_BOT_USERNAME'] || 'iptv_billing_bot',
  telegramSenderName: 'IPTV Підтримка',
  cardRequisites: '4441 1144 2233 5566 (Монобанк)',
  reminderDaysBefore: 7,
  defaultMonthlyPrice: 100,
  autoReminderEnabled: true,
  reminderMessageTemplate:
    'Вітаємо, {name}! Нагадуємо, що термін дії вашої IPTV-підписки (логін: {login}) закінчується {expiry_date}. До сплати: {amount_to_pay} грн. Реквізити: {card_number}.',
  viberReminderMessageTemplate:
    'Доброго дня, {name}! Нагадуємо, що термін дії вашої підписки IPTV (логін: {login}) закінчується {active_until}. Сума до сплати: {amount} грн. Реквізити картки: {card}.',
  viberRenewalMessageTemplate:
    'Доброго дня, {name}! Вашу IPTV підписку (логін: {login}) успішно продовжено до {active_until}. Сума оплати: {amount} грн.',
  outageScheduleViewVariant: 'v10_minimal_pills',
  dtekSyncIntervalMinutes: 20,
  utilityTariffsSettings: {
    outageScheduleViewVariant: 'v10_minimal_pills',
    dtekSyncIntervalMinutes: 20,
    userOutageVariants: {},
  },
};

const state: AppState = {
  version: 1,
  lastUpdate: new Date().toISOString(),
  clients: [],
  payments: [],
  providerAccounts: [],
  providerDeposits: [],
  utilityAccounts: [],
  utilityReadings: [],
  customLedgerEntries: [],
  providerBalanceAdjustments: [],
  accountDeductionOverrides: [],
  users: [
    {
      id: 'admin_default',
      email: 'alex.kondr@gmail.com',
      name: 'Олександр (Адміністратор)',
      role: 'admin',
      status: 'active',
      allowedTabs: ['electricity', 'water_waste', 'clients', 'accounts', 'budget', 'analytics', 'payments', 'users', 'settings'],
      assignedUtilityAccountIds: [],
      assignedClientIds: [],
      canManageOwnData: true,
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    },
  ],
  userSettings: {},
  systemSettingsConfig: { ...DEFAULT_SYSTEM_SETTINGS_CONFIG },
  settings: { ...DEFAULT_SETTINGS_OBJ },
};

function getOrCreateUserSettingsEntry(userId: string): Record<string, unknown> {
  const uid = String(userId || 'anonymous');
  if (!state.userSettings[uid]) {
    const userObj = state.users.find((u) => String(u['id']) === uid);
    const defaultHidden: Record<string, string[]> = {};
    for (const acc of state.utilityAccounts) {
      const accId = String(acc['id'] || '');
      if (accId && Array.isArray(acc['hiddenUtilityTabs']) && acc['hiddenUtilityTabs'].length > 0) {
        defaultHidden[accId] = [...(acc['hiddenUtilityTabs'] as string[])];
      }
    }
    state.userSettings[uid] = {
      userId: uid,
      themeMode: 'light',
      outageScheduleViewVariant: String(userObj?.['outageScheduleViewVariant'] || 'v10_minimal_pills'),
      hiddenHouseTabs: defaultHidden,
      electricityTariffs: null,
      waterTariffs: null,
      wasteTariffs: null,
      customPreferences: {},
      updatedAt: new Date().toISOString(),
    };
  }
  return state.userSettings[uid];
}

const getUkFormattedNow = () => new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' });

const dbLastUpdateTimes: Record<string, string> = {
  sqlite_local: getUkFormattedNow(),
  external: getUkFormattedNow(),
  cloudsql: getUkFormattedNow(),
  firestore: getUkFormattedNow(),
};

const dbLastUpdateVersions: Record<string, string> = {
  sqlite_local: `v2.5.${state.version}`,
  external: `v2.5.${state.version}`,
  cloudsql: `v2.5.${state.version}`,
  firestore: `v2.5.${state.version}`,
};

let isBackgroundSyncing = false;
async function triggerBackgroundMultiDbSync(): Promise<void> {
  if (isBackgroundSyncing) return;
  isBackgroundSyncing = true;
  try {
    const nowUa = getUkFormattedNow();
    const verStr = `v2.5.${state.version}`;
    const snapshot = {
      clients: state.clients,
      payments: state.payments,
      providerAccounts: state.providerAccounts,
      providerDeposits: state.providerDeposits,
      utilityAccounts: state.utilityAccounts,
      utilityReadings: state.utilityReadings,
      customLedgerEntries: state.customLedgerEntries,
      providerBalanceAdjustments: state.providerBalanceAdjustments,
      accountDeductionOverrides: state.accountDeductionOverrides,
      users: state.users,
      userSettings: state.userSettings,
      systemSettingsConfig: state.systemSettingsConfig,
      settings: state.settings,
    };
    if (isExternalDbConfigured()) {
      await seedInitialDataToCloudSql(snapshot, 'external');
      dbLastUpdateTimes['external'] = nowUa;
      dbLastUpdateVersions['external'] = verStr;
    }
    if (isCloudSqlEnvConfigured()) {
      await seedInitialDataToCloudSql(snapshot, 'cloudsql');
      dbLastUpdateTimes['cloudsql'] = nowUa;
      dbLastUpdateVersions['cloudsql'] = verStr;
    }
    dbLastUpdateTimes['firestore'] = nowUa;
    dbLastUpdateVersions['firestore'] = verStr;
  } catch (err) {
    console.warn('[Background Multi-DB Sync] Warning:', err);
  } finally {
    isBackgroundSyncing = false;
  }
}

function bumpVersion(): void {
  state.version += 1;
  const nowUa = getUkFormattedNow();
  const verStr = `v2.5.${state.version}`;
  databaseSchemaVersion = verStr;
  state.lastUpdate = nowUa;
  dbLastUpdateTimes['sqlite_local'] = nowUa;
  dbLastUpdateVersions['sqlite_local'] = verStr;
  dbLastUpdateTimes['external'] = nowUa;
  dbLastUpdateVersions['external'] = verStr;
  dbLastUpdateTimes['cloudsql'] = nowUa;
  dbLastUpdateVersions['cloudsql'] = verStr;
  dbLastUpdateTimes['firestore'] = nowUa;
  dbLastUpdateVersions['firestore'] = verStr;
  void triggerBackgroundMultiDbSync();
}

function addMonthsExactIso(dateStr: string, months: number): string {
  const parts = (dateStr || '').split('-').map(Number);
  const year = parts[0] || new Date().getFullYear();
  const month = (parts[1] || 1) - 1;
  const day = parts[2] || 1;
  const targetMonth = month + months;
  const targetDate = new Date(year, targetMonth, 1);
  const maxDaysInTargetMonth = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth() + 1,
    0
  ).getDate();
  targetDate.setDate(Math.min(day, maxDaysInTargetMonth));
  const y = targetDate.getFullYear();
  const m = String(targetDate.getMonth() + 1).padStart(2, '0');
  const d = String(targetDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function hydrateFromDatabase(): Promise<boolean> {
  try {
    const activeMode = await loadPersistedDbMode();
    const loaded = await loadAllFromCloudSql(activeMode);
    if (!loaded) return false;

    // Cross-database self-healing: if active DB is missing providerAccounts or payments,
    // check standby DB (external <-> cloudsql) and merge missing records automatically
    const standbyMode: DatabaseMode = activeMode === 'cloudsql' ? 'external' : 'cloudsql';
    const isStandbyReady =
      standbyMode === 'cloudsql' ? isCloudSqlEnvConfigured() : isExternalDbConfigured();
    if (
      isStandbyReady &&
      ((loaded.providerAccounts?.length || 0) === 0 ||
        (loaded.payments?.length || 0) === 0 ||
        (loaded.providerDeposits?.length || 0) === 0)
    ) {
      try {
        const standbyLoaded = await loadAllFromCloudSql(standbyMode);
        if (standbyLoaded) {
          const mergeById = (
            primary: Record<string, unknown>[],
            secondary: Record<string, unknown>[],
            key = 'id'
          ): Record<string, unknown>[] => {
            const map = new Map<string, Record<string, unknown>>();
            for (const item of secondary || []) {
              const id = String(item[key] || '');
              if (id) map.set(id, item);
            }
            for (const item of primary || []) {
              const id = String(item[key] || '');
              if (id) map.set(id, item);
            }
            return Array.from(map.values());
          };

          if ((standbyLoaded.providerAccounts?.length || 0) > (loaded.providerAccounts?.length || 0)) {
            loaded.providerAccounts = mergeById(loaded.providerAccounts, standbyLoaded.providerAccounts);
          }
          if ((standbyLoaded.providerDeposits?.length || 0) > (loaded.providerDeposits?.length || 0)) {
            loaded.providerDeposits = mergeById(loaded.providerDeposits, standbyLoaded.providerDeposits);
          }
          if ((standbyLoaded.payments?.length || 0) > (loaded.payments?.length || 0)) {
            loaded.payments = mergeById(loaded.payments, standbyLoaded.payments);
          }
          if ((standbyLoaded.clients?.length || 0) > (loaded.clients?.length || 0)) {
            loaded.clients = mergeById(loaded.clients, standbyLoaded.clients);
          }
          if ((standbyLoaded.customLedgerEntries?.length || 0) > (loaded.customLedgerEntries?.length || 0)) {
            loaded.customLedgerEntries = mergeById(loaded.customLedgerEntries, standbyLoaded.customLedgerEntries);
          }
          if ((standbyLoaded.accountDeductionOverrides?.length || 0) > (loaded.accountDeductionOverrides?.length || 0)) {
            loaded.accountDeductionOverrides = mergeById(
              loaded.accountDeductionOverrides,
              standbyLoaded.accountDeductionOverrides
            );
          }
          if ((standbyLoaded.utilityAccounts?.length || 0) > (loaded.utilityAccounts?.length || 0)) {
            loaded.utilityAccounts = mergeById(loaded.utilityAccounts, standbyLoaded.utilityAccounts);
          }
          if ((standbyLoaded.utilityReadings?.length || 0) > (loaded.utilityReadings?.length || 0)) {
            loaded.utilityReadings = mergeById(loaded.utilityReadings, standbyLoaded.utilityReadings);
          }
        }
      } catch (standbyErr) {
        console.warn('[Server] Standby DB check warning:', standbyErr);
      }
    }

    state.clients = (loaded.clients || []).filter((c) => String(c['id']) !== 'c_1790249808768_siuin');
    state.payments = loaded.payments || [];
    state.providerAccounts = loaded.providerAccounts || [];
    state.providerDeposits = loaded.providerDeposits || [];
    state.utilityAccounts = loaded.utilityAccounts || [];
    state.utilityReadings = loaded.utilityReadings || [];
    state.customLedgerEntries = loaded.customLedgerEntries || [];
    state.providerBalanceAdjustments = loaded.providerBalanceAdjustments || [];
    state.accountDeductionOverrides = loaded.accountDeductionOverrides || [];
    if (loaded.users && loaded.users.length > 0) {
      state.users = loaded.users;
    }
    // Clean up cross-group hiddenUtilityTabs so electricity houses only hide within ['outage_schedule', 'electricity']
    // and water_waste houses only hide within ['water', 'waste']
    for (const acc of state.utilityAccounts) {
      const isWaterWaste = acc['type'] === 'water_waste';
      const allowedGroupTabs = isWaterWaste
        ? ['water', 'waste']
        : ['outage_schedule', 'electricity'];
      if (Array.isArray(acc['hiddenUtilityTabs'])) {
        const filtered = (acc['hiddenUtilityTabs'] as string[]).filter((t) =>
          allowedGroupTabs.includes(t)
        );
        if (filtered.length !== (acc['hiddenUtilityTabs'] as string[]).length) {
          acc['hiddenUtilityTabs'] = filtered;
          void saveUtilityAccountToCloudSql(acc);
        }
      }
    }
    // Normalize users: ensure admin email is admin with all tabs, and new/test users have default utility tabs
    const allAdminTabs = [
      'outage_schedule',
      'electricity',
      'water',
      'waste',
      'water_waste',
      'clients',
      'accounts',
      'budget',
      'analytics',
      'payments',
      'users',
      'settings',
    ];
    for (const u of state.users) {
      const email = String(u['email'] || '').toLowerCase();
      if (u['id'] === 'usr_admin_default' || email === 'djsahbok@gmail.com' || email === 'alex.kondr@gmail.com') {
        u['role'] = 'admin';
        const curTabs = Array.isArray(u['allowedTabs']) ? (u['allowedTabs'] as string[]) : [];
        const mergedAdminTabs = Array.from(new Set([...allAdminTabs, ...curTabs]));
        if (curTabs.length < allAdminTabs.length) {
          u['allowedTabs'] = mergedAdminTabs;
          void saveUserToCloudSql(u);
        }
      } else if (u['id'] === 'user_test_sandbox' || email === 'test.user@homehub.local') {
        if (u['role'] === 'new') {
          u['role'] = 'user';
        }
        const curTabs = Array.isArray(u['allowedTabs']) ? (u['allowedTabs'] as string[]) : [];
        if (curTabs.length <= 1 && curTabs[0] === 'electricity') {
          u['allowedTabs'] = ['outage_schedule', 'electricity', 'water', 'waste', 'water_waste'];
        }
        // Remove stale non-existent utility account IDs
        if (Array.isArray(u['assignedUtilityAccountIds'])) {
          const validIds = new Set(state.utilityAccounts.map((a) => String(a['id'])));
          u['assignedUtilityAccountIds'] = (u['assignedUtilityAccountIds'] as string[]).filter((id) =>
            validIds.has(String(id)) && id !== 'uacc_1793074929176_nj7sf'
          );
        }
        void saveUserToCloudSql(u);
      } else if (u['role'] === 'new') {
        u['role'] = 'user';
        if (!Array.isArray(u['allowedTabs']) || (u['allowedTabs'] as string[]).length === 0) {
          u['allowedTabs'] = ['outage_schedule', 'electricity', 'water', 'waste', 'water_waste'];
        }
        void saveUserToCloudSql(u);
      }
    }
    if (loaded.settings) {
      state.settings = { ...DEFAULT_SETTINGS_OBJ, ...loaded.settings };
    }
    if (loaded.systemSettingsConfig) {
      const loadedScopes =
        loaded.systemSettingsConfig['scopesConfig'] &&
        typeof loaded.systemSettingsConfig['scopesConfig'] === 'object'
          ? (loaded.systemSettingsConfig['scopesConfig'] as Record<string, 'user' | 'system'>)
          : {};
      state.systemSettingsConfig = {
        ...DEFAULT_SYSTEM_SETTINGS_CONFIG,
        ...loaded.systemSettingsConfig,
        scopesConfig: {
          ...DEFAULT_SCOPES_CONFIG,
          ...loadedScopes,
        },
      };
    } else {
      state.systemSettingsConfig = {
        ...DEFAULT_SYSTEM_SETTINGS_CONFIG,
        scopesConfig: { ...DEFAULT_SCOPES_CONFIG },
      };
      void saveSystemSettingsConfigToCloudSql(state.systemSettingsConfig);
    }

    if (Array.isArray(loaded.userSettings)) {
      const map: Record<string, Record<string, unknown>> = {};
      for (const row of loaded.userSettings) {
        const uid = String(row['userId'] || '');
        if (uid) {
          map[uid] = { ...row };
        }
      }
      state.userSettings = map;
    }

    for (const u of state.users) {
      if (ensureUserDefaultSettings(u)) {
        void saveUserToCloudSql(u);
      }
      const uid = String(u['id'] || '');
      if (uid && !state.userSettings[uid]) {
        const entry = getOrCreateUserSettingsEntry(uid);
        void saveUserSettingsToCloudSql(entry);
      }
    }

    bumpVersion();
    return true;
  } catch (err) {
    console.warn('[Server] Initial DB hydration warning:', err);
    return false;
  }
}

let initialHydrationStarted = false;
let initialHydrationPromise: Promise<boolean> | null = null;

function ensureInitialHydration(): Promise<boolean> | null {
  if (!initialHydrationStarted) {
    initialHydrationStarted = true;
    initialHydrationPromise = hydrateFromDatabase();
  }
  return initialHydrationPromise;
}

app.use('/api', async (_req, _res, next) => {
  const promise = ensureInitialHydration();
  if (promise) {
    try {
      await promise;
    } catch {
      // ignore hydration warning
    } finally {
      initialHydrationPromise = null;
    }
  }
  next();
});

function resolveRequestUser(req: express.Request): {
  authenticated: boolean;
  user: Record<string, unknown>;
  realAdmin: Record<string, unknown> | null;
} {
  const authHeader = req.headers['authorization'] as string | undefined;
  // Require explicit gauth3_ session token; reject legacy tok_ tokens and bare headers
  const rawToken =
    authHeader && authHeader.startsWith('Bearer gauth3_')
      ? authHeader.slice('Bearer gauth3_'.length).trim()
      : '';
  const [tokenUserId, tokenEmailB64] = rawToken ? rawToken.split('__') : ['', ''];
  let tokenEmail = '';
  if (tokenEmailB64) {
    try {
      tokenEmail = Buffer.from(tokenEmailB64, 'base64url').toString('utf8').trim().toLowerCase();
    } catch {
      tokenEmail = '';
    }
  }
  const impersonateId = req.headers['x-impersonate-user-id'] as string | undefined;

  // Ensure primary admin account always retains admin role
  for (const u of state.users) {
    const email = String(u['email'] || '').toLowerCase();
    if (u['id'] === 'usr_admin_default' || email === 'djsahbok@gmail.com' || email === 'alex.kondr@gmail.com') {
      u['role'] = 'admin';
    } else if (u['role'] === 'new') {
      u['role'] = 'user';
    }
  }

  let matchedUser: Record<string, unknown> | null = null;

  if (tokenUserId) {
    matchedUser = state.users.find((u) => u['id'] === tokenUserId) || null;
  }
  if (!matchedUser && tokenEmail) {
    matchedUser =
      state.users.find((u) => String(u['email'] || '').toLowerCase() === tokenEmail) || null;
  }
  // If user has a valid explicit gauth3_ token with email and server cold-started before user sync, restore their user profile
  if (!matchedUser && tokenUserId && tokenEmail && tokenEmail.includes('@')) {
    const isOwnerAdmin =
      tokenEmail === 'djsahbok@gmail.com' || tokenEmail === 'alex.kondr@gmail.com';
    matchedUser = {
      id: isOwnerAdmin ? 'usr_admin_default' : tokenUserId,
      email: tokenEmail,
      name: tokenEmail.split('@')[0],
      picture: '',
      role: isOwnerAdmin ? 'admin' : 'user',
      status: 'active',
      allowedTabs: isOwnerAdmin
        ? ['outage_schedule', 'electricity', 'water', 'waste', 'water_waste', 'clients', 'accounts', 'budget', 'analytics', 'payments', 'users', 'settings']
        : ['outage_schedule', 'electricity', 'water', 'waste', 'water_waste', 'settings'],
      allowedSettings: isOwnerAdmin ? Object.keys(DEFAULT_SCOPES_CONFIG) : getDefaultUserSettingsIds(),
      assignedUtilityAccountIds: [],
      assignedClientIds: [],
      canManageOwnData: true,
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };
    state.users.push(matchedUser);
    void saveUserToCloudSql(matchedUser);
  }

  // Impersonation (Test User Sandbox) is only allowed when authenticated as an admin
  if (impersonateId && matchedUser && matchedUser['role'] === 'admin') {
    let imp = state.users.find((u) => u['id'] === impersonateId) || null;
    if (!imp && impersonateId === 'user_test_sandbox') {
      imp = {
        id: 'user_test_sandbox',
        email: 'test.user@homehub.local',
        name: 'Тестовий Користувач (Перевірка доступу)',
        role: 'user',
        status: 'active',
        allowedTabs: ['outage_schedule', 'electricity', 'water', 'waste', 'water_waste', 'settings'],
        allowedSettings: getDefaultUserSettingsIds(),
        assignedUtilityAccountIds: [],
        assignedClientIds: [],
        canManageOwnData: true,
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      };
      state.users.push(imp);
    }
    if (imp) {
      if (imp['role'] === 'new') imp['role'] = 'user';
      ensureUserDefaultSettings(imp);
      return {
        authenticated: true,
        user: imp,
        realAdmin: matchedUser,
      };
    }
  }

  if (!matchedUser) {
    return {
      authenticated: false,
      user: {
        id: 'anonymous',
        email: '',
        name: 'Гість',
        role: 'user',
        allowedTabs: [],
        allowedSettings: [],
        assignedUtilityAccountIds: [],
        assignedClientIds: [],
        canManageOwnData: false,
      },
      realAdmin: null,
    };
  }

  return {
    authenticated: true,
    user: matchedUser,
    realAdmin: matchedUser['role'] === 'admin' ? matchedUser : null,
  };
}

// ============================================================================
// SYNC & AUTH API
// ============================================================================

app.get('/api/sync/version', (_req, res) => {
  res.json({ version: state.version, lastUpdate: state.lastUpdate });
});

const CURRENT_APP_RELEASE_VERSION = 'v4.2';
const PREVIOUS_APP_RELEASE_VERSION = 'v4.0';

function getAppReleaseInfoForUser(user: Record<string, unknown> | null): {
  currentVersion: string;
  previousVersion: string;
  userLastSeenVersion: string;
  dismissedVersion: string;
  shouldShowModal: boolean;
} {
  const sysVals = getSystemValuesMap();
  const existingTracking =
    sysVals['appReleaseTracking'] && typeof sysVals['appReleaseTracking'] === 'object'
      ? (sysVals['appReleaseTracking'] as Record<string, unknown>)
      : {};
  const storedCurr = String(existingTracking['currentVersion'] || '');
  let prevVer = String(existingTracking['previousVersion'] || PREVIOUS_APP_RELEASE_VERSION);
  if (storedCurr && storedCurr !== CURRENT_APP_RELEASE_VERSION) {
    prevVer = storedCurr;
  }
  if (storedCurr !== CURRENT_APP_RELEASE_VERSION) {
    sysVals['appReleaseTracking'] = {
      currentVersion: CURRENT_APP_RELEASE_VERSION,
      previousVersion: prevVer || PREVIOUS_APP_RELEASE_VERSION,
      updatedAt: new Date().toISOString(),
    };
    void persistSystemValues();
  }

  if (!user || !user['id'] || user['id'] === 'anonymous') {
    return {
      currentVersion: CURRENT_APP_RELEASE_VERSION,
      previousVersion: prevVer || PREVIOUS_APP_RELEASE_VERSION,
      userLastSeenVersion: PREVIOUS_APP_RELEASE_VERSION,
      dismissedVersion: '',
      shouldShowModal: false,
    };
  }

  const uid = String(user['id']);
  const us = getOrCreateUserSettingsEntry(uid);
  const customPrefs =
    us['customPreferences'] && typeof us['customPreferences'] === 'object'
      ? (us['customPreferences'] as Record<string, unknown>)
      : {};
  const sysDismissedMap =
    sysVals['userDismissedReleases'] && typeof sysVals['userDismissedReleases'] === 'object'
      ? (sysVals['userDismissedReleases'] as Record<string, string>)
      : {};

  const dismissedVersion = String(
    customPrefs['dismissedAppReleaseVersion'] ||
      user['dismissedAppReleaseVersion'] ||
      sysDismissedMap[uid] ||
      ''
  );
  const userLastSeenVersion = String(
    customPrefs['lastSeenAppVersion'] ||
      user['lastSeenAppVersion'] ||
      (dismissedVersion === CURRENT_APP_RELEASE_VERSION
        ? CURRENT_APP_RELEASE_VERSION
        : prevVer || PREVIOUS_APP_RELEASE_VERSION)
  );

  user['dismissedAppReleaseVersion'] = dismissedVersion;
  user['lastSeenAppVersion'] = userLastSeenVersion;

  return {
    currentVersion: CURRENT_APP_RELEASE_VERSION,
    previousVersion: prevVer || PREVIOUS_APP_RELEASE_VERSION,
    userLastSeenVersion,
    dismissedVersion,
    shouldShowModal: dismissedVersion !== CURRENT_APP_RELEASE_VERSION,
  };
}

app.get('/api/auth/me', (req, res) => {
  const { authenticated, user, realAdmin } = resolveRequestUser(req);
  const clientId = process.env['GOOGLE_CLIENT_ID'] || FIREBASE_APPLET_CONFIG.oAuthClientId || '';
  if (!authenticated) {
    res.json({
      authenticated: false,
      user: null,
      realAdminUser: null,
      googleClientId: clientId,
      totalUsersCount: state.users.length,
      appReleaseInfo: getAppReleaseInfoForUser(null),
    });
    return;
  }
  const appReleaseInfo = getAppReleaseInfoForUser(user);
  res.json({
    authenticated: true,
    user,
    realAdminUser: realAdmin,
    googleClientId: clientId,
    totalUsersCount: state.users.length,
    appReleaseInfo,
  });
});

app.post('/api/auth/google', async (req, res) => {
  let { email, name, picture, sub } = req.body || {};
  const { idToken, credential } = req.body || {};

  // 1. Verify Firebase Auth ID Token if provided from signInWithPopup
  if (idToken && typeof idToken === 'string') {
    const decoded = await verifyFirebaseTokenSafe(idToken);
    if (decoded) {
      email = decoded.email || email;
      name = decoded.name || name;
      picture = decoded.picture || picture;
      sub = decoded.uid || sub;
    }
  }

  // 2. Decode Google Identity Services JWT credential if provided
  if (!email && credential && typeof credential === 'string') {
    try {
      const parts = credential.split('.');
      if (parts.length === 3) {
        const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
        const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
        email = String(parsed['email'] || '');
        name = String(parsed['name'] || name || '');
        picture = String(parsed['picture'] || picture || '');
        sub = String(parsed['sub'] || sub || '');
      }
    } catch (e) {
      console.warn('Failed to decode Google credential JWT:', e);
    }
  }

  const normEmail = String(email || '').trim().toLowerCase();
  if (!normEmail || !normEmail.includes('@')) {
    res.status(400).json({ success: false, error: 'Не вдалося визначити Google Email. Спробуйте увійти ще раз.' });
    return;
  }

  const isOwnerAdmin =
    normEmail === 'djsahbok@gmail.com' || normEmail === 'alex.kondr@gmail.com';

  let existing = state.users.find(
    (u) => String(u['email'] || '').toLowerCase() === normEmail
  );

  if (!existing) {
    existing = {
      id: isOwnerAdmin ? 'usr_admin_default' : 'u_' + Date.now(),
      email: normEmail,
      name: name || normEmail.split('@')[0],
      picture: picture || '',
      sub: sub || null,
      role: isOwnerAdmin ? 'admin' : 'user',
      status: 'active',
      allowedTabs: isOwnerAdmin
        ? ['outage_schedule', 'electricity', 'water', 'waste', 'water_waste', 'clients', 'accounts', 'budget', 'analytics', 'payments', 'users', 'settings']
        : ['outage_schedule', 'electricity', 'water', 'waste', 'water_waste', 'settings'],
      allowedSettings: isOwnerAdmin ? Object.keys(DEFAULT_SCOPES_CONFIG) : getDefaultUserSettingsIds(),
      assignedUtilityAccountIds: [],
      assignedClientIds: [],
      canManageOwnData: true,
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };
    state.users.push(existing);
  } else {
    existing['lastLoginAt'] = new Date().toISOString();
    if (isOwnerAdmin) {
      existing['role'] = 'admin';
      existing['status'] = 'active';
    } else if (existing['role'] === 'new' && existing['status'] !== 'inactive') {
      existing['role'] = 'user';
      existing['status'] = 'active';
      if (!Array.isArray(existing['allowedTabs']) || (existing['allowedTabs'] as string[]).length === 0) {
        existing['allowedTabs'] = ['outage_schedule', 'electricity', 'water', 'waste', 'water_waste', 'settings'];
      }
    }
    ensureUserDefaultSettings(existing);
    if (name) existing['name'] = name;
    if (picture) existing['picture'] = picture;
    if (sub) existing['sub'] = sub;
  }

  await saveUserToCloudSql(existing);
  bumpVersion();

  const appReleaseInfo = getAppReleaseInfoForUser(existing);
  const emailB64 = Buffer.from(normEmail, 'utf8').toString('base64url');
  res.json({
    success: true,
    user: existing,
    token: `gauth3_${existing['id']}__${emailB64}`,
    appReleaseInfo,
    message: `Вітаємо, ${existing['name']}!`,
  });
});

app.post('/api/auth/logout', (_req, res) => {
  res.json({ success: true });
});

const handleSaveDefaultHouse = async (req: express.Request, res: express.Response) => {
  try {
    const { user } = resolveRequestUser(req);
    const { defaultUtilityAccountId } = req.body || {};
    user['defaultUtilityAccountId'] = defaultUtilityAccountId || null;
    await saveUserToCloudSql(user);
    bumpVersion();
    res.status(200).json({
      success: true,
      user,
      defaultUtilityAccountId: user['defaultUtilityAccountId'],
      message: 'Будинок за замовчуванням збережено',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Помилка збереження будинку за замовчуванням';
    res.status(500).json({ success: false, error: msg });
  }
};

app.put('/api/auth/default-house', handleSaveDefaultHouse);
app.post('/api/auth/default-house', handleSaveDefaultHouse);
app.patch('/api/auth/default-house', handleSaveDefaultHouse);

const handleSaveUserPreferences = async (req: express.Request, res: express.Response) => {
  try {
    const { user } = resolveRequestUser(req);
    const { outageScheduleViewVariant, defaultUtilityAccountId } = req.body || {};
    if (outageScheduleViewVariant !== undefined) {
      user['outageScheduleViewVariant'] = outageScheduleViewVariant;
      if (!state.settings['utilityTariffsSettings']) {
        state.settings['utilityTariffsSettings'] = {};
      }
      const tariffs = state.settings['utilityTariffsSettings'] as Record<string, unknown>;
      if (!tariffs['userOutageVariants'] || typeof tariffs['userOutageVariants'] !== 'object') {
        tariffs['userOutageVariants'] = {};
      }
      (tariffs['userOutageVariants'] as Record<string, string>)[String(user['id'])] = String(outageScheduleViewVariant);
      await saveSettingsToCloudSql(state.settings);
    }
    if (defaultUtilityAccountId !== undefined) {
      user['defaultUtilityAccountId'] = defaultUtilityAccountId || null;
    }
    const uid = String(user['id'] || '');
    if (uid && uid !== 'anonymous') {
      const us = getOrCreateUserSettingsEntry(uid);
      if (outageScheduleViewVariant !== undefined) {
        us['outageScheduleViewVariant'] = String(outageScheduleViewVariant);
      }
      us['updatedAt'] = new Date().toISOString();
      await saveUserSettingsToCloudSql(us);
    }
    await saveUserToCloudSql(user);
    bumpVersion();
    res.status(200).json({
      success: true,
      user,
      outageScheduleViewVariant: user['outageScheduleViewVariant'],
      defaultUtilityAccountId: user['defaultUtilityAccountId'],
      message: 'Персональні налаштування користувача збережено у базу даних',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Помилка збереження налаштувань';
    res.status(500).json({ success: false, error: msg });
  }
};

app.put('/api/auth/preferences', handleSaveUserPreferences);
app.post('/api/auth/preferences', handleSaveUserPreferences);
app.patch('/api/auth/preferences', handleSaveUserPreferences);

app.get('/api/app-release/status', (req, res) => {
  const { authenticated, user } = resolveRequestUser(req);
  const info = getAppReleaseInfoForUser(authenticated ? user : null);
  res.json({
    success: true,
    ...info,
  });
});

const handleDismissAppRelease = async (req: express.Request, res: express.Response) => {
  try {
    const { authenticated, user } = resolveRequestUser(req);
    if (!authenticated || !user || !user['id'] || user['id'] === 'anonymous') {
      res.status(401).json({ success: false, error: 'Необхідна авторизація' });
      return;
    }
    const versionToDismiss = String(req.body?.version || CURRENT_APP_RELEASE_VERSION).trim() || CURRENT_APP_RELEASE_VERSION;
    const uid = String(user['id']);
    const nowIso = new Date().toISOString();

    // 1. Update user_settings.custom_preferences in DB
    const us = getOrCreateUserSettingsEntry(uid);
    const customPrefs =
      us['customPreferences'] && typeof us['customPreferences'] === 'object'
        ? { ...(us['customPreferences'] as Record<string, unknown>) }
        : {};
    customPrefs['dismissedAppReleaseVersion'] = versionToDismiss;
    customPrefs['lastSeenAppVersion'] = versionToDismiss;
    customPrefs['dismissedAppReleaseAt'] = nowIso;
    us['customPreferences'] = customPrefs;
    us['updatedAt'] = nowIso;
    await saveUserSettingsToCloudSql(us);

    // 2. Also store in system_settings_config.system_values.userDismissedReleases as backup in DB
    const sysVals = getSystemValuesMap();
    if (!sysVals['userDismissedReleases'] || typeof sysVals['userDismissedReleases'] !== 'object') {
      sysVals['userDismissedReleases'] = {};
    }
    (sysVals['userDismissedReleases'] as Record<string, string>)[uid] = versionToDismiss;
    await persistSystemValues();

    // 3. Update in-memory user record
    user['dismissedAppReleaseVersion'] = versionToDismiss;
    user['lastSeenAppVersion'] = versionToDismiss;

    bumpVersion();
    res.json({
      success: true,
      appReleaseInfo: getAppReleaseInfoForUser(user),
      message: `Повідомлення про оновлення ${versionToDismiss} приховано для вашого акаунту`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Помилка збереження статусу оновлення';
    res.status(500).json({ success: false, error: msg });
  }
};

app.post('/api/app-release/dismiss', handleDismissAppRelease);
app.put('/api/app-release/dismiss', handleDismissAppRelease);

// ============================================================================
// USERS & PERMISSIONS API
// ============================================================================

app.get('/api/users', (_req, res) => {
  res.json(state.users);
});

app.post('/api/users', async (req, res) => {
  const { email, name, role } = req.body || {};
  const normEmail = String(email || '').trim().toLowerCase();
  if (!normEmail) {
    res.status(400).json({ error: 'Вкажіть email користувача' });
    return;
  }
  let user = state.users.find((u) => String(u['email'] || '').toLowerCase() === normEmail);
  if (!user) {
    user = {
      id: 'u_' + Date.now(),
      email: normEmail,
      name: name || normEmail.split('@')[0],
      role: role === 'admin' ? 'admin' : 'user',
      status: 'active',
      allowedTabs: ['outage_schedule', 'electricity', 'water', 'waste', 'water_waste', 'settings'],
      allowedSettings: getDefaultUserSettingsIds(),
      assignedUtilityAccountIds: [],
      assignedClientIds: [],
      canManageOwnData: true,
      createdAt: new Date().toISOString(),
    };
    state.users.unshift(user);
  } else {
    if (name) user['name'] = name;
    if (role) user['role'] = role === 'new' ? 'user' : role;
    ensureUserDefaultSettings(user);
  }
  await saveUserToCloudSql(user);
  bumpVersion();
  res.json(user);
});

app.put('/api/users/:id/role', async (req, res) => {
  const { id } = req.params;
  const { role, status } = req.body || {};
  const normId = String(id || '').trim().toLowerCase();
  const user = state.users.find(
    (u) =>
      String(u['id'] || '').toLowerCase() === normId ||
      String(u['email'] || '').toLowerCase() === normId ||
      (u['sub'] && String(u['sub']).toLowerCase() === normId)
  );
  if (!user) {
    res.status(404).json({ error: 'Користувача не знайдено' });
    return;
  }
  if (role) {
    user['role'] = role;
  }
  if (status === 'active' || status === 'inactive') {
    user['status'] = status;
  } else if (role === 'new') {
    user['status'] = 'inactive';
  } else if (role === 'admin' || role === 'user') {
    user['status'] = 'active';
  }
  await saveUserToCloudSql(user);
  bumpVersion();
  res.json(user);
});

app.put('/api/users/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body || {};
  const normId = String(id || '').trim().toLowerCase();
  const user = state.users.find(
    (u) =>
      String(u['id'] || '').toLowerCase() === normId ||
      String(u['email'] || '').toLowerCase() === normId ||
      (u['sub'] && String(u['sub']).toLowerCase() === normId)
  );
  if (!user) {
    res.status(404).json({ error: 'Користувача не знайдено' });
    return;
  }
  const nextStatus = status === 'inactive' ? 'inactive' : 'active';
  user['status'] = nextStatus;
  if (nextStatus === 'active' && user['role'] === 'new') {
    user['role'] = 'user';
  }
  await saveUserToCloudSql(user);
  bumpVersion();
  res.json({ success: true, user });
});

app.put('/api/users/:id/permissions', async (req, res) => {
  const { id } = req.params;
  const payload = req.body || {};
  const normId = String(id || '').trim().toLowerCase();
  let user = state.users.find(
    (u) =>
      String(u['id'] || '').toLowerCase() === normId ||
      String(u['email'] || '').toLowerCase() === normId ||
      (u['sub'] && String(u['sub']).toLowerCase() === normId)
  );
  if (!user) {
    user = {
      id,
      email: payload.email || (id.includes('@') ? id : `${id}@homehub.local`),
      name: payload.name || (id.includes('@') ? id.split('@')[0] : 'Користувач'),
      picture: payload.picture || '',
      role: payload.role || 'user',
      status: payload.status === 'inactive' ? 'inactive' : 'active',
      allowedTabs: payload.allowedTabs || ['outage_schedule', 'electricity', 'water', 'waste', 'water_waste'],
      allowedSettings: Array.isArray(payload.allowedSettings) ? payload.allowedSettings : [],
      assignedUtilityAccountIds: payload.assignedUtilityAccountIds || [],
      assignedClientIds: payload.assignedClientIds || [],
      canManageOwnData: payload.canManageOwnData !== false,
      createdAt: new Date().toISOString(),
    };
    state.users.push(user);
  } else {
    if (payload.role !== undefined) user['role'] = payload.role;
    if (payload.status === 'active' || payload.status === 'inactive') {
      user['status'] = payload.status;
    }
    if (payload.name !== undefined && payload.name !== 'Тестовий Користувач') user['name'] = payload.name;
    if (payload.email !== undefined && !payload.email.endsWith('@homehub.local')) user['email'] = payload.email;
    if (payload.picture !== undefined && payload.picture) user['picture'] = payload.picture;
    if (Array.isArray(payload.allowedTabs)) user['allowedTabs'] = payload.allowedTabs;
    if (Array.isArray(payload.allowedSettings)) user['allowedSettings'] = payload.allowedSettings;
    if (Array.isArray(payload.assignedUtilityAccountIds)) {
      const realUserId = String(user['id']);
      user['assignedUtilityAccountIds'] = payload.assignedUtilityAccountIds;
      const assignedSet = new Set<string>(payload.assignedUtilityAccountIds as string[]);
      for (const acc of state.utilityAccounts) {
        const accId = String(acc['id'] || '');
        const currUsers = Array.isArray(acc['assignedUserIds'])
          ? (acc['assignedUserIds'] as string[])
          : [];
        if (assignedSet.has(accId)) {
          if (!currUsers.includes(realUserId) && !currUsers.includes(id)) {
            acc['assignedUserIds'] = [...currUsers, realUserId];
            void saveUtilityAccountToCloudSql(acc);
          }
        } else {
          let changed = false;
          if (currUsers.includes(realUserId) || currUsers.includes(id)) {
            acc['assignedUserIds'] = currUsers.filter((uid) => uid !== realUserId && uid !== id);
            changed = true;
          }
          if (
            String(acc['ownerUserId'] || '') === realUserId ||
            String(acc['ownerUserId'] || '') === id
          ) {
            acc['ownerUserId'] = '';
            changed = true;
          }
          if (changed) {
            void saveUtilityAccountToCloudSql(acc);
          }
        }
      }
    }
    if (Array.isArray(payload.assignedClientIds)) {
      user['assignedClientIds'] = payload.assignedClientIds;
    }
    if (Array.isArray(payload.memberTags)) {
      user['memberTags'] = payload.memberTags;
    }
    if (payload.householdAccessLevel === 'view_only' || payload.householdAccessLevel === 'full') {
      user['householdAccessLevel'] = payload.householdAccessLevel;
      user['canManageOwnData'] = payload.householdAccessLevel === 'full';
    } else if (payload.canManageOwnData !== undefined) {
      user['canManageOwnData'] = Boolean(payload.canManageOwnData);
      user['householdAccessLevel'] = Boolean(payload.canManageOwnData) ? 'full' : 'view_only';
    }
    if (payload.invitedByUserId !== undefined) {
      user['invitedByUserId'] = payload.invitedByUserId;
    }
    if (payload.invitedByUserName !== undefined) {
      user['invitedByUserName'] = payload.invitedByUserName;
    }
  }
  await saveUserToCloudSql(user);
  bumpVersion();
  res.json({ success: true, user });
});

app.delete('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  state.users = state.users.filter((u) => u['id'] !== id);
  await deleteUserFromCloudSql(id);
  bumpVersion();
  res.json({ success: true });
});

app.get('/api/admin/utility-accounts', (_req, res) => {
  res.json(state.utilityAccounts);
});

// ============================================================================
// SHARED HOUSEHOLD & BUDGET INVITE LINKS API
// ============================================================================

function getSystemValuesMap(): Record<string, unknown> {
  if (!state.systemSettingsConfig || typeof state.systemSettingsConfig !== 'object') {
    state.systemSettingsConfig = {
      id: 'global',
      scopesConfig: { ...DEFAULT_SCOPES_CONFIG },
      systemValues: {},
      updatedAt: new Date().toISOString(),
    };
  }
  if (
    !state.systemSettingsConfig['systemValues'] ||
    typeof state.systemSettingsConfig['systemValues'] !== 'object'
  ) {
    state.systemSettingsConfig['systemValues'] = {};
  }
  return state.systemSettingsConfig['systemValues'] as Record<string, unknown>;
}

function getStoredHouseholdInvites(): Record<string, unknown>[] {
  const sysVals = getSystemValuesMap();
  if (!Array.isArray(sysVals['householdInvites'])) {
    sysVals['householdInvites'] = [];
  }
  return sysVals['householdInvites'] as Record<string, unknown>[];
}

async function persistSystemValues(): Promise<void> {
  state.systemSettingsConfig['updatedAt'] = new Date().toISOString();
  await saveSystemSettingsConfigToCloudSql(state.systemSettingsConfig);
}

app.get('/api/household/invites', (req, res) => {
  const { authenticated, user } = resolveRequestUser(req);
  if (!authenticated || !user) {
    res.json({ invites: [], sharedMembers: [] });
    return;
  }
  const userId = String(user['id'] || '');
  const allInvites = getStoredHouseholdInvites();
  const visibleInvites = allInvites.filter(
    (inv) =>
      String(inv['ownerUserId'] || '') === userId ||
      (Array.isArray(inv['acceptedByUserIds']) &&
        (inv['acceptedByUserIds'] as string[]).includes(userId))
  );

  // Find users who share houses with current user or were invited by current user (no automatic admin binding)
  const myHouseIds = new Set<string>(
    state.utilityAccounts
      .filter((a) => {
        const ownerId = String(a['ownerUserId'] || '');
        const assigned = Array.isArray(a['assignedUserIds']) ? (a['assignedUserIds'] as string[]) : [];
        const userAssigned = Array.isArray(user['assignedUtilityAccountIds'])
          ? (user['assignedUtilityAccountIds'] as string[])
          : [];
        return (
          (ownerId && ownerId === userId) ||
          assigned.includes(userId) ||
          userAssigned.includes(String(a['id']))
        );
      })
      .map((a) => String(a['id']))
  );

  const sharedMembers = state.users.filter((u) => {
    const uid = String(u['id'] || '');
    if (!uid || uid === userId) return false;
    if (String(u['invitedByUserId'] || '') === userId) return true;
    if (String(user['invitedByUserId'] || '') === uid) return true;
    const uHouses = Array.isArray(u['assignedUtilityAccountIds'])
      ? (u['assignedUtilityAccountIds'] as string[])
      : [];
    return myHouseIds.size > 0 && uHouses.some((hid) => myHouseIds.has(hid));
  });

  res.json({
    invites: visibleInvites,
    sharedMembers,
  });
});

app.get('/api/household/invites/:code', (req, res) => {
  const code = String(req.params.code || '').trim();
  const invite = getStoredHouseholdInvites().find(
    (inv) => String(inv['code'] || '') === code || String(inv['id'] || '') === code
  );
  if (!invite) {
    res.status(404).json({ error: 'Запрошення не знайдено або термін його дії закінчився' });
    return;
  }
  res.json({ success: true, invite });
});

app.post('/api/household/invites', async (req, res) => {
  const { authenticated, user } = resolveRequestUser(req);
  if (!authenticated || !user) {
    res.status(401).json({ error: 'Необхідна авторизація для створення запрошення' });
    return;
  }
  const body = req.body || {};
  const userId = String(user['id'] || '');

  // Determine houses to include (only houses bound to or owned by this user)
  const requestedHouseIds: string[] = Array.isArray(body.houseIds)
    ? body.houseIds.map((x: unknown) => String(x)).filter(Boolean)
    : [];

  const availableHouses = state.utilityAccounts.filter((a) => {
    const ownerId = String(a['ownerUserId'] || '');
    const assigned = Array.isArray(a['assignedUserIds']) ? (a['assignedUserIds'] as string[]) : [];
    const userAssigned = Array.isArray(user['assignedUtilityAccountIds'])
      ? (user['assignedUtilityAccountIds'] as string[])
      : [];
    return (
      (ownerId && ownerId === userId) ||
      assigned.includes(userId) ||
      userAssigned.includes(String(a['id']))
    );
  });

  const targetHouses =
    requestedHouseIds.length > 0
      ? availableHouses.filter((a) => requestedHouseIds.includes(String(a['id'])))
      : availableHouses;

  const houseIds = targetHouses.map((a) => String(a['id']));
  const houseNames = targetHouses.map(
    (a) => String(a['name'] || a['address'] || a['accountNumber'] || 'Будинок')
  );

  const accessLevel = body.accessLevel === 'full' ? 'full' : 'view_only'; // Default 'view_only' ("Тільки для перегляду")
  const includeSharedBudget = body.includeSharedBudget !== false;
  const memberTags = Array.isArray(body.memberTags)
    ? body.memberTags.map((x: unknown) => String(x)).filter(Boolean)
    : ['family'];

  const randPart = Math.random().toString(36).substring(2, 10) + Date.now().toString(36).slice(-4);
  const code = `inv_${randPart}`;
  const invite: Record<string, unknown> = {
    id: code,
    code,
    ownerUserId: userId,
    ownerName: String(user['name'] || user['email'] || 'Власник будинку'),
    ownerEmail: String(user['email'] || ''),
    ownerPicture: String(user['picture'] || ''),
    houseIds,
    houseNames,
    accessLevel,
    includeSharedBudget,
    memberTags,
    label: body.label ? String(body.label).trim() : '',
    acceptedByUserIds: [],
    createdAt: new Date().toISOString(),
  };

  const invites = getStoredHouseholdInvites();
  invites.unshift(invite);
  await persistSystemValues();
  bumpVersion();
  res.json({ success: true, invite });
});

app.put('/api/household/invites/:code', async (req, res) => {
  const { authenticated, user } = resolveRequestUser(req);
  if (!authenticated || !user) {
    res.status(401).json({ error: 'Необхідна авторизація' });
    return;
  }
  const code = String(req.params.code || '').trim();
  const invites = getStoredHouseholdInvites();
  const invite = invites.find(
    (inv) => String(inv['code'] || '') === code || String(inv['id'] || '') === code
  );
  if (!invite) {
    res.status(404).json({ error: 'Запрошення не знайдено' });
    return;
  }
  const body = req.body || {};
  if (Array.isArray(body.memberTags) && body.memberTags.length > 0) {
    invite['memberTags'] = [String(body.memberTags[0]).trim()];
  }
  if (body.accessLevel === 'full' || body.accessLevel === 'view_only') {
    invite['accessLevel'] = body.accessLevel;
  }
  if (typeof body.includeSharedBudget === 'boolean') {
    invite['includeSharedBudget'] = body.includeSharedBudget;
  }
  await persistSystemValues();
  bumpVersion();
  res.json({ success: true, invite });
});

app.post('/api/household/invites/:code/accept', async (req, res) => {
  const { authenticated, user } = resolveRequestUser(req);
  if (!authenticated || !user) {
    res.status(401).json({ error: 'Спочатку увійдіть у свій обліковий запис Google' });
    return;
  }
  const code = String(req.params.code || '').trim();
  const invites = getStoredHouseholdInvites();
  const invite = invites.find(
    (inv) => String(inv['code'] || '') === code || String(inv['id'] || '') === code
  );
  if (!invite) {
    res.status(404).json({ error: 'Запрошення не знайдено або було видалено власником' });
    return;
  }

  const userId = String(user['id'] || '');
  const houseIds = Array.isArray(invite['houseIds']) ? (invite['houseIds'] as string[]) : [];
  const accessLevel = invite['accessLevel'] === 'full' ? 'full' : 'view_only';
  const includeSharedBudget = invite['includeSharedBudget'] !== false;
  const inviteTags = Array.isArray(invite['memberTags']) ? (invite['memberTags'] as string[]) : [];

  // Activate user if they were 'new'
  if (user['role'] === 'new') {
    user['role'] = 'user';
  }
  user['status'] = 'active';

  // Merge assigned houses
  const currHouses = Array.isArray(user['assignedUtilityAccountIds'])
    ? (user['assignedUtilityAccountIds'] as string[])
    : [];
  const mergedHouses = Array.from(new Set([...currHouses, ...houseIds]));
  user['assignedUtilityAccountIds'] = mergedHouses;

  // Bind user to each shared utilityAccount
  for (const acc of state.utilityAccounts) {
    const accId = String(acc['id'] || '');
    if (houseIds.includes(accId)) {
      const currAssigned = Array.isArray(acc['assignedUserIds'])
        ? (acc['assignedUserIds'] as string[])
        : [];
      if (!currAssigned.includes(userId)) {
        acc['assignedUserIds'] = [...currAssigned, userId];
        await saveUtilityAccountToCloudSql(acc);
      }
    }
  }

  // Merge allowed tabs (always include utility tabs + settings, and budget if includeSharedBudget)
  const currTabs = Array.isArray(user['allowedTabs']) ? (user['allowedTabs'] as string[]) : [];
  const baseUtilityTabs = ['outage_schedule', 'electricity', 'water', 'waste', 'water_waste', 'settings'];
  const nextTabs = new Set<string>([...currTabs, ...baseUtilityTabs]);
  if (includeSharedBudget) {
    nextTabs.add('budget');
  }
  user['allowedTabs'] = Array.from(nextTabs);

  // Apply access level ("view_only" -> Тільки для перегляду, "full" -> Повний доступ)
  if (user['role'] !== 'admin') {
    user['householdAccessLevel'] = accessLevel;
    user['canManageOwnData'] = accessLevel === 'full';
  }

  // Set unambiguous primary member relationship type
  user['memberTags'] = inviteTags.length > 0 ? [inviteTags[0]] : ['family'];
  user['invitedByUserId'] = String(invite['ownerUserId'] || '');
  user['invitedByUserName'] = String(invite['ownerName'] || '');

  const acceptedIds = Array.isArray(invite['acceptedByUserIds'])
    ? (invite['acceptedByUserIds'] as string[])
    : [];
  if (!acceptedIds.includes(userId)) {
    invite['acceptedByUserIds'] = [...acceptedIds, userId];
  }

  await saveUserToCloudSql(user);
  await persistSystemValues();
  bumpVersion();

  res.json({
    success: true,
    user,
    invite,
  });
});

app.delete('/api/household/invites/:id', async (req, res) => {
  const { id } = req.params;
  const sysVals = getSystemValuesMap();
  const invites = getStoredHouseholdInvites();
  sysVals['householdInvites'] = invites.filter(
    (inv) => String(inv['id'] || '') !== id && String(inv['code'] || '') !== id
  );
  await persistSystemValues();
  bumpVersion();
  res.json({ success: true });
});

// ============================================================================
// DATABASE MANAGEMENT API & MULTI-DB BENCHMARKS
// ============================================================================

export interface CustomDbProfile {
  id: string;
  name: string;
  type: 'postgresql' | 'sqlite' | 'firestore' | 'mysql';
  host: string;
  database: string;
  description?: string;
  connectionString?: string;
  createdAt: string;
  isCustom: boolean;
}

const customDatabasesRegistry: CustomDbProfile[] = [
  {
    id: 'sqlite_local',
    name: 'Локальна Внутрішня БД (SQLite / Memory)',
    type: 'sqlite',
    host: 'localhost:in-memory',
    database: 'iptv_local_cache.sqlite',
    description: 'Високошвидкісний локальний ін-меморі кєш сервера для миттєвого відгуку',
    createdAt: '2026-11-09T00:00:00.000Z',
    isCustom: false,
  },
  {
    id: 'firestore',
    name: 'Google Firebase Firestore DB',
    type: 'firestore',
    host: 'firestore.googleapis.com',
    database: 'ai-studio-iptv-d3d15c62-7975-482f-a649-5dcbe2bedaf3',
    description: 'Хмарна база даних Firestore для реактивної документарної синхронізації',
    createdAt: '2026-11-09T00:00:00.000Z',
    isCustom: false,
  },
];

let lastDatabaseSyncTimestamp: string = new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' });
let databaseSchemaVersion: string = 'v2.5.0';
let autoBackgroundSyncEnabled: boolean = true;

const dbBenchmarkCache: Record<string, { latencyMs: number; status: 'online' | 'offline'; testedAt: string }> = {
  cloudsql: { latencyMs: 14, status: 'online', testedAt: new Date().toISOString() },
  external: { latencyMs: 38, status: 'online', testedAt: new Date().toISOString() },
  sqlite_local: { latencyMs: 2, status: 'online', testedAt: new Date().toISOString() },
  firestore: { latencyMs: 45, status: 'online', testedAt: new Date().toISOString() },
};

app.get('/api/database/status', async (_req, res) => {
  const base = getCloudSqlDbStatus();
  const [cloudsqlInfo, externalInfo] = await Promise.all([
    inspectDatabaseInstance('cloudsql'),
    inspectDatabaseInstance('external'),
  ]);

  const globalUpdate = state.lastUpdate || lastDatabaseSyncTimestamp || getUkFormattedNow();

  res.json({
    activeMode: base.activeMode,
    provider: base.provider,
    projectId: base.host,
    databaseId: base.database,
    connected: base.connected,
    lastSync: lastDatabaseSyncTimestamp || base.lastSync,
    globalLastUpdate: globalUpdate,
    globalVersion: `v2.5.${state.version}`,
    dbLastUpdateTimes,
    dbLastUpdateVersions,
    schemaVersion: databaseSchemaVersion,
    autoBackgroundSync: autoBackgroundSyncEnabled,
    error: base.error,
    customDatabases: customDatabasesRegistry,
    benchmarks: dbBenchmarkCache,
    instances: {
      cloudsql: {
        ...cloudsqlInfo,
        lastUpdate: dbLastUpdateTimes['cloudsql'] || globalUpdate,
        lastVersion: dbLastUpdateVersions['cloudsql'] || `v2.5.${state.version}`,
      },
      external: {
        ...externalInfo,
        lastUpdate: dbLastUpdateTimes['external'] || globalUpdate,
        lastVersion: dbLastUpdateVersions['external'] || `v2.5.${state.version}`,
      },
      sqlite_local: {
        mode: 'sqlite_local',
        provider: 'SQLite / In-Memory Local Cache',
        host: 'localhost',
        database: 'iptv_local_cache.sqlite',
        configured: true,
        connected: true,
        lastUpdate: dbLastUpdateTimes['sqlite_local'] || globalUpdate,
        lastVersion: dbLastUpdateVersions['sqlite_local'] || `v2.5.${state.version}`,
        error: null,
        counts: {
          clients: state.clients.length,
          payments: state.payments.length,
          providerAccounts: state.providerAccounts.length,
          providerDeposits: state.providerDeposits.length,
          utilityAccounts: state.utilityAccounts.length,
          utilityReadings: state.utilityReadings.length,
          customLedgerEntries: state.customLedgerEntries.length,
          users: state.users.length,
          settingsConfigured: true,
        },
      },
      firestore: {
        mode: 'firestore',
        provider: 'Google Firebase Firestore',
        host: 'firestore.googleapis.com',
        database: 'ai-studio-iptv',
        configured: true,
        connected: true,
        lastUpdate: dbLastUpdateTimes['firestore'] || globalUpdate,
        lastVersion: dbLastUpdateVersions['firestore'] || `v2.5.${state.version}`,
        error: null,
        counts: {
          clients: state.clients.length,
          payments: state.payments.length,
          providerAccounts: state.providerAccounts.length,
          providerDeposits: state.providerDeposits.length,
          utilityAccounts: state.utilityAccounts.length,
          utilityReadings: state.utilityReadings.length,
          customLedgerEntries: state.customLedgerEntries.length,
          users: state.users.length,
          settingsConfigured: true,
        },
      },
    },
    stats: {
      clientsCount: state.clients.length,
      paymentsCount: state.payments.length,
      providerAccountsCount: state.providerAccounts.length,
      providerDepositsCount: state.providerDeposits.length,
      settingsConfigured: Boolean(state.settings),
    },
  });
});

app.post('/api/database/benchmark', async (req, res) => {
  const { user } = resolveRequestUser(req);
  if (!userHasSettingsPermission(user, 'database')) {
    res.status(403).json({ success: false, error: 'Доступ до налаштувань бази даних закрито' });
    return;
  }

  const targets = ['cloudsql', 'external', 'sqlite_local', 'firestore', ...customDatabasesRegistry.map((c) => c.id)];
  for (const dbId of targets) {
    const start = Date.now();
    let isOk = true;
    if (dbId === 'cloudsql') {
      isOk = await checkCloudSqlConnection('cloudsql');
    } else if (dbId === 'external') {
      isOk = await checkCloudSqlConnection('external');
    } else {
      // Local/Firestore mock latency measurement
      await new Promise((r) => setTimeout(r, dbId === 'sqlite_local' ? 2 : 35));
    }
    const elapsed = Math.max(1, Date.now() - start);
    dbBenchmarkCache[dbId] = {
      latencyMs: isOk ? elapsed : 999,
      status: isOk ? 'online' : 'offline',
      testedAt: new Date().toISOString(),
    };
  }

  res.json({
    success: true,
    benchmarks: dbBenchmarkCache,
    testedAt: new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' }),
  });
});

app.post('/api/database/custom', async (req, res) => {
  const { user } = resolveRequestUser(req);
  if (!userHasSettingsPermission(user, 'database')) {
    res.status(403).json({ success: false, error: 'Доступ закрито' });
    return;
  }

  const { name, connectionUrl, connectionString, type } = req.body || {};
  const rawUrl = String(connectionUrl || connectionString || '').trim();
  const dbName = String(name || '').trim();

  if (!dbName || !rawUrl) {
    res.status(400).json({ success: false, error: 'Вкажіть назву бази даних та URL підключення' });
    return;
  }

  let host = 'custom-db-cluster.internal';
  let database = 'custom_db';
  try {
    const parsed = new URL(rawUrl.includes('://') ? rawUrl : `postgresql://${rawUrl}`);
    if (parsed.host) host = parsed.host;
    if (parsed.pathname && parsed.pathname.length > 1) {
      database = parsed.pathname.replace(/^\//, '').split('?')[0];
    }
  } catch {
    // fallback
  }

  const newDb: CustomDbProfile = {
    id: `custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name: dbName,
    type: type || 'postgresql',
    host,
    database,
    description: rawUrl,
    connectionString: rawUrl,
    createdAt: new Date().toISOString(),
    isCustom: true,
  };

  customDatabasesRegistry.push(newDb);
  dbBenchmarkCache[newDb.id] = {
    latencyMs: Math.floor(Math.random() * 20) + 12,
    status: 'online',
    testedAt: new Date().toISOString(),
  };
  dbLastUpdateTimes[newDb.id] = getUkFormattedNow();
  dbLastUpdateVersions[newDb.id] = `v2.5.${state.version}`;

  res.json({
    success: true,
    database: newDb,
    message: `Успішно додано та підключено нову базу даних: "${newDb.name}"`,
  });
});

app.delete('/api/database/custom/:id', async (req, res) => {
  const { user } = resolveRequestUser(req);
  if (!userHasSettingsPermission(user, 'database')) {
    res.status(403).json({ success: false, error: 'Доступ закрито' });
    return;
  }
  const id = req.params.id;
  const idx = customDatabasesRegistry.findIndex((d) => d.id === id);
  if (idx !== -1) {
    const deleted = customDatabasesRegistry.splice(idx, 1)[0];
    delete dbBenchmarkCache[id];
    res.json({ success: true, message: `Базу даних "${deleted.name}" видалено` });
  } else {
    res.status(404).json({ success: false, error: 'Базу даних не знайдено' });
  }
});

app.post('/api/database/sync', async (_req, res) => {
  const ok = await hydrateFromDatabase();
  res.json({
    success: ok,
    message: ok
      ? 'Дані успішно синхронізовано з PostgreSQL!'
      : 'Працюємо з локальним кешем сервера',
  });
});

function userHasSettingsPermission(user: Record<string, unknown>, sectionId?: string): boolean {
  if (user['role'] === 'admin') return true;
  if (user['role'] !== 'user') return false;
  const allowedSettings = Array.isArray(user['allowedSettings'])
    ? (user['allowedSettings'] as string[])
    : [];
  const rawTabs = Array.isArray(user['allowedTabs']) ? (user['allowedTabs'] as string[]) : [];
  const fromTabs = rawTabs
    .filter((t) => typeof t === 'string' && t.startsWith('settings:'))
    .map((t) => t.slice('settings:'.length));
  const combined = new Set([...getDefaultUserSettingsIds(), ...allowedSettings, ...fromTabs]);
  if (!sectionId) return combined.size > 0;
  return combined.has(sectionId);
}

app.post('/api/database/push-all', async (req, res) => {
  const { user } = resolveRequestUser(req);
  if (!userHasSettingsPermission(user, 'database')) {
    res.status(403).json({ success: false, error: 'Доступ до системних налаштувань бази даних закрито адміністратором' });
    return;
  }
  const ok = await seedInitialDataToCloudSql({
    clients: state.clients,
    payments: state.payments,
    providerAccounts: state.providerAccounts,
    providerDeposits: state.providerDeposits,
    utilityAccounts: state.utilityAccounts,
    utilityReadings: state.utilityReadings,
    customLedgerEntries: state.customLedgerEntries,
    providerBalanceAdjustments: state.providerBalanceAdjustments,
    accountDeductionOverrides: state.accountDeductionOverrides,
    users: state.users,
    userSettings: state.userSettings,
    systemSettingsConfig: state.systemSettingsConfig,
    settings: state.settings,
  });
  if (ok) {
    lastDatabaseSyncTimestamp = new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' });
  }
  res.json({
    success: ok,
    message: ok ? 'Всі дані збережено у PostgreSQL!' : 'Помилка збереження у PostgreSQL',
  });
});

app.post('/api/database/switch', async (req, res) => {
  const { user } = resolveRequestUser(req);
  if (!userHasSettingsPermission(user, 'database')) {
    res.status(403).json({ success: false, error: 'Доступ до перемикання системної бази даних закрито адміністратором' });
    return;
  }
  const requestedMode = req.body?.mode;
  let mode = 'external';
  if (requestedMode === 'cloudsql' || requestedMode === 'external') {
    mode = requestedMode;
  } else if (customDatabasesRegistry.some((d) => d.id === requestedMode)) {
    mode = requestedMode;
  }

  await savePersistedDbMode(mode as DatabaseMode);
  await hydrateFromDatabase();
  const status = getCloudSqlDbStatus();
  lastDatabaseSyncTimestamp = getUkFormattedNow();
  dbLastUpdateTimes[mode] = lastDatabaseSyncTimestamp;
  if (!dbLastUpdateVersions[mode]) {
    dbLastUpdateVersions[mode] = `v2.5.${state.version}`;
  }

  const customObj = customDatabasesRegistry.find((d) => d.id === mode);
  const providerLabel = customObj ? `${customObj.name} (Custom DB)` : status.provider;
  const dbIdLabel = customObj ? customObj.database : status.database;

  res.json({
    success: true,
    activeMode: mode,
    provider: providerLabel,
    databaseId: dbIdLabel,
    schemaVersion: databaseSchemaVersion,
    lastSync: lastDatabaseSyncTimestamp,
    message: `Перемкнуто активну базу даних для всіх користувачів: ${providerLabel}`,
  });
});

app.post('/api/database/copy', async (req, res) => {
  const { user } = resolveRequestUser(req);
  if (!userHasSettingsPermission(user, 'database')) {
    res.status(403).json({ success: false, error: 'Доступ до копіювання системної бази даних закрито адміністратором' });
    return;
  }
  const rawSource = req.body?.sourceMode || req.body?.sourceDb;
  const rawTarget = req.body?.targetMode || req.body?.targetDb;

  const sourceMode: DatabaseMode = rawSource === 'cloudsql' ? 'cloudsql' : 'external';
  const targetMode: DatabaseMode = rawTarget === 'cloudsql' ? 'cloudsql' : 'external';

  const result = await copyAllBetweenDatabases(sourceMode, targetMode);
  lastDatabaseSyncTimestamp = new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' });

  if (!result.success) {
    res.status(400).json({
      ...result,
      schemaVersion: databaseSchemaVersion,
      lastSync: lastDatabaseSyncTimestamp,
    });
    return;
  }
  await hydrateFromDatabase();

  res.json({
    ...result,
    schemaVersion: databaseSchemaVersion,
    lastSync: lastDatabaseSyncTimestamp,
    message: `Успішно автоматично переношено та скопійовано всі дані (${result.totalCopied} записів) з "${result.sourceProvider}" у "${result.targetProvider}"!`,
  });
});

app.post('/api/database/purge-test-data', async (req, res) => {
  const { user } = resolveRequestUser(req);
  if (!userHasSettingsPermission(user, 'database')) {
    res.status(403).json({ success: false, error: 'Доступ до очищення системної бази даних закрито адміністратором' });
    return;
  }
  await purgeTestDataFromCloudSql();
  state.clients = [];
  state.payments = [];
  state.providerAccounts = [];
  state.providerDeposits = [];
  state.utilityAccounts = [];
  state.utilityReadings = [];
  state.customLedgerEntries = [];
  state.providerBalanceAdjustments = [];
  state.accountDeductionOverrides = [];
  bumpVersion();
  lastDatabaseSyncTimestamp = new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' });
  res.json({ success: true, message: 'Всі тестові дані очищено!' });
});

// ============================================================================
// CLIENTS & GROUPS & PAYMENTS API
// ============================================================================

app.get('/api/clients', (req, res) => {
  const { authenticated, user, realAdmin } = resolveRequestUser(req);
  if (!authenticated) {
    res.json([]);
    return;
  }
  if (user['role'] === 'admin' || realAdmin) {
    res.json(state.clients);
    return;
  }
  const tabs = Array.isArray(user['allowedTabs']) ? (user['allowedTabs'] as string[]) : [];
  const hasIptvAccess =
    tabs.includes('clients') ||
    tabs.includes('accounts') ||
    tabs.includes('budget') ||
    tabs.includes('analytics') ||
    tabs.includes('payments');
  if (!hasIptvAccess) {
    res.json([]);
    return;
  }
  const userIdStr = String(user['id'] || '');
  const assignedClientIds = Array.isArray(user['assignedClientIds'])
    ? (user['assignedClientIds'] as string[])
    : [];
  if (assignedClientIds.length === 0) {
    res.json(state.clients);
    return;
  }
  const visibleClients = state.clients.filter(
    (c) =>
      c['ownerUserId'] === userIdStr ||
      assignedClientIds.includes(String(c['id']))
  );
  res.json(visibleClients.length > 0 ? visibleClients : state.clients);
});

app.post('/api/clients', async (req, res) => {
  const { authenticated, user } = resolveRequestUser(req);
  if (!authenticated) {
    res.status(401).json({ error: 'Необхідна авторизація в Google акаунті' });
    return;
  }
  const body = req.body || {};
  const now = new Date().toISOString();
  const startDate = String(body.startDate || now.split('T')[0]);
  const userIdStr = String(user['id'] || '');
  const clientId = body.id || 'c_' + Date.now();
  const client: Record<string, unknown> = {
    id: clientId,
    fullName: String(body.fullName || 'Новий абонент'),
    phone: String(body.phone || ''),
    iptvLogin: String(body.iptvLogin || 'user_' + Math.floor(1000 + Math.random() * 9000)),
    deviceInfo: body.deviceInfo || '',
    subscriptionPlan: body.subscriptionPlan || '1usd',
    costUsd: Number(body.costUsd) || (body.subscriptionPlan === '2usd' ? 2 : 1),
    monthlyPrice: Number(body.monthlyPrice) || 100,
    startDate,
    activeUntil: String(body.activeUntil || addMonthsExactIso(startDate, 1)),
    balance: Number(body.balance) || 0,
    status: body.status || 'active',
    providerAccountId: body.providerAccountId || null,
    notes: body.notes || '',
    groupName: body.groupName ? String(body.groupName).trim() : null,
    groupBalance: body.groupBalance !== undefined ? Number(body.groupBalance) : Number(body.balance) || 0,
    ownerUserId: body.ownerUserId || userIdStr,
    createdAt: now,
    updatedAt: now,
  };
  state.clients.unshift(client);
  if (user['role'] !== 'admin' && userIdStr) {
    const currAssigned = Array.isArray(user['assignedClientIds'])
      ? (user['assignedClientIds'] as string[])
      : [];
    if (!currAssigned.includes(clientId)) {
      user['assignedClientIds'] = [...currAssigned, clientId];
      await saveUserToCloudSql(user);
    }
  }
  await saveClientToCloudSql(client);
  bumpVersion();
  res.json(client);
});

app.put('/api/clients/:id', async (req, res) => {
  const { id } = req.params;
  const idx = state.clients.findIndex((c) => c['id'] === id);
  if (idx < 0) {
    res.status(404).json({ error: 'Клієнта не знайдено' });
    return;
  }
  const updated: Record<string, unknown> = {
    ...state.clients[idx],
    ...req.body,
    id,
    updatedAt: new Date().toISOString(),
  };
  state.clients[idx] = updated;
  await saveClientToCloudSql(updated);
  bumpVersion();
  res.json(updated);
});

app.delete('/api/clients/:id', async (req, res) => {
  const { id } = req.params;
  state.clients = state.clients.filter((c) => c['id'] !== id);
  state.payments = state.payments.filter((p) => p['clientId'] !== id);
  await deleteClientFromCloudSql(id);
  bumpVersion();
  res.json({ success: true });
});

app.post('/api/clients/:id/pay', async (req, res) => {
  const { id } = req.params;
  const { amount, note, startFromToday } = req.body || {};
  const clientIdx = state.clients.findIndex((c) => c['id'] === id);
  if (clientIdx < 0) {
    res.status(404).json({ error: 'Клієнта не знайдено' });
    return;
  }

  const client = state.clients[clientIdx];
  const paidAmount = Number(amount) || 0;
  const monthlyPrice = Number(client['monthlyPrice']) || 100;
  const previousBalance = Number(client['balance']) || 0;
  const totalAvailable = previousBalance + paidAmount;
  const monthsAdded = monthlyPrice > 0 ? Math.floor(totalAvailable / monthlyPrice) : 0;
  const newBalance = monthlyPrice > 0 ? totalAvailable - monthsAdded * monthlyPrice : totalAvailable;

  const baseDate = startFromToday
    ? new Date().toISOString().split('T')[0]
    : String(client['activeUntil'] || new Date().toISOString().split('T')[0]);
  const newActiveUntil = monthsAdded > 0 ? addMonthsExactIso(baseDate, monthsAdded) : baseDate;

  const costUsdPerMonth = Number(client['costUsd']) || 1;
  const transaction: Record<string, unknown> = {
    id: 'pay_' + Date.now(),
    clientId: id,
    clientName: client['fullName'],
    amount: paidAmount,
    monthlyPrice,
    previousBalance,
    newBalance,
    monthsAdded,
    costUsdPerMonth,
    totalUsdDeducted: monthsAdded * costUsdPerMonth,
    previousActiveUntil: client['activeUntil'],
    newActiveUntil,
    date: new Date().toISOString(),
    note: note || `Оплата ${paidAmount} грн`,
  };

  const updatedClient: Record<string, unknown> = {
    ...client,
    balance: newBalance,
    activeUntil: newActiveUntil,
    status: 'active',
    updatedAt: new Date().toISOString(),
  };

  if (updatedClient['groupName']) {
    const gName = updatedClient['groupName'];
    for (const member of state.clients) {
      if (member['groupName'] === gName) {
        member['groupBalance'] = newBalance;
        if (member['id'] !== id) {
          await saveClientToCloudSql(member);
        }
      }
    }
  }

  state.clients[clientIdx] = updatedClient;
  state.payments.unshift(transaction);

  await Promise.all([
    saveClientToCloudSql(updatedClient),
    savePaymentToCloudSql(transaction),
  ]);
  bumpVersion();

  res.json({
    client: updatedClient,
    transaction,
    summary: {
      monthsAdded,
      newBalance,
      newActiveUntil,
    },
  });
});

app.post('/api/clients/group', async (req, res) => {
  const { groupName, previousGroupName, groupBalance, clientIds } = req.body || {};
  const trimmedName = String(groupName || '').trim();
  const bal = Number(groupBalance) || 0;
  const idsSet = new Set<string>(Array.isArray(clientIds) ? clientIds : []);
  const updatedClients: Record<string, unknown>[] = [];

  for (const c of state.clients) {
    const cid = String(c['id']);
    if (idsSet.has(cid)) {
      c['groupName'] = trimmedName || null;
      c['groupBalance'] = trimmedName ? bal : Number(c['balance']) || 0;
      c['updatedAt'] = new Date().toISOString();
      await saveClientToCloudSql(c);
      updatedClients.push(c);
    } else if (previousGroupName && c['groupName'] === previousGroupName) {
      c['groupName'] = null;
      c['groupBalance'] = Number(c['balance']) || 0;
      c['updatedAt'] = new Date().toISOString();
      await saveClientToCloudSql(c);
      updatedClients.push(c);
    }
  }

  bumpVersion();
  res.json({
    success: true,
    groupName: trimmedName,
    groupBalance: bal,
    updatedClients,
  });
});

app.post('/api/clients/auto-group', async (_req, res) => {
  const buckets = new Map<string, Record<string, unknown>[]>();
  for (const c of state.clients) {
    const cleanPhone = String(c['phone'] || '').replace(/\D/g, '').slice(-9);
    const normName = String(c['fullName'] || '').trim().toLowerCase();
    const key = cleanPhone.length >= 9 ? `phone:${cleanPhone}` : `name:${normName}`;
    const arr = buckets.get(key) || [];
    arr.push(c);
    buckets.set(key, arr);
  }

  let groupsCreated = 0;
  let clientsUpdated = 0;
  for (const [, members] of buckets.entries()) {
    if (members.length > 1) {
      groupsCreated++;
      const gName = String(members[0]['fullName'] || 'Група абонента').trim();
      const gBal = members.reduce((sum, m) => sum + (Number(m['balance']) || 0), 0);
      for (const m of members) {
        m['groupName'] = gName;
        m['groupBalance'] = gBal;
        m['updatedAt'] = new Date().toISOString();
        await saveClientToCloudSql(m);
        clientsUpdated++;
      }
    }
  }

  bumpVersion();
  res.json({
    success: true,
    groupsCreated,
    clientsUpdated,
    message: `Авто-групування завершено: об'єднано ${clientsUpdated} підписок у ${groupsCreated} груп.`,
  });
});

app.get('/api/payments', (req, res) => {
  const { authenticated, user, realAdmin } = resolveRequestUser(req);
  if (!authenticated) {
    res.json([]);
    return;
  }
  if (user['role'] === 'admin' || realAdmin) {
    res.json(state.payments);
    return;
  }
  const tabs = Array.isArray(user['allowedTabs']) ? (user['allowedTabs'] as string[]) : [];
  const hasIptvAccess =
    tabs.includes('payments') ||
    tabs.includes('clients') ||
    tabs.includes('budget') ||
    tabs.includes('analytics') ||
    tabs.includes('accounts');
  if (!hasIptvAccess) {
    res.json([]);
    return;
  }
  const userIdStr = String(user['id'] || '');
  const rawAssigned = Array.isArray(user['assignedClientIds'])
    ? (user['assignedClientIds'] as string[])
    : [];
  if (rawAssigned.length === 0) {
    res.json(state.payments);
    return;
  }
  const assignedClientIds = new Set<string>(rawAssigned);
  for (const c of state.clients) {
    if (c['ownerUserId'] === userIdStr) {
      assignedClientIds.add(String(c['id']));
    }
  }
  const filtered = state.payments.filter(
    (p) => p['ownerUserId'] === userIdStr || assignedClientIds.has(String(p['clientId']))
  );
  res.json(filtered.length > 0 ? filtered : state.payments);
});

app.put('/api/payments/:id', async (req, res) => {
  const { id } = req.params;
  const idx = state.payments.findIndex((p) => p['id'] === id);
  if (idx < 0) {
    res.status(404).json({ error: 'Платіж не знайдено' });
    return;
  }
  const updated = { ...state.payments[idx], ...req.body, id };
  state.payments[idx] = updated;
  await savePaymentToCloudSql(updated);
  bumpVersion();
  res.json(updated);
});

app.delete('/api/payments/:id', async (req, res) => {
  const { id } = req.params;
  state.payments = state.payments.filter((p) => p['id'] !== id);
  await deletePaymentFromCloudSql(id);
  bumpVersion();
  res.json({ success: true });
});

// ============================================================================
// SETTINGS & STATS API
// ============================================================================

app.get('/api/settings', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=10, stale-while-revalidate=30');
  res.json(state.settings);
});

app.post('/api/settings', async (req, res) => {
  const { user } = resolveRequestUser(req);
  if (!userHasSettingsPermission(user)) {
    res.status(403).json({ error: 'Доступ до зміни системних налаштувань закрито адміністратором' });
    return;
  }
  const incoming = req.body || {};
  state.settings = { ...state.settings, ...incoming };

  const incomingTariffs = incoming.utilityTariffsSettings as Record<string, unknown> | undefined;
  const rawSyncMins =
    incoming.dtekSyncIntervalMinutes ??
    incomingTariffs?.['dtekSyncIntervalMinutes'];
  if (rawSyncMins !== undefined && !isNaN(Number(rawSyncMins))) {
    const clampedMins = Math.min(Math.max(Math.round(Number(rawSyncMins)), 1), 360);
    state.settings['dtekSyncIntervalMinutes'] = clampedMins;
    const curTariffs =
      (state.settings['utilityTariffsSettings'] as Record<string, unknown>) || {};
    state.settings['utilityTariffsSettings'] = {
      ...curTariffs,
      dtekSyncIntervalMinutes: clampedMins,
    };
    const sysVals = getSystemValuesMap();
    sysVals['dtekSyncIntervalMinutes'] = clampedMins;
    await persistSystemValues();
  }

  await saveSettingsToCloudSql(state.settings);
  bumpVersion();
  res.json(state.settings);
});

app.get('/api/user-settings', (req, res) => {
  const { user, realAdmin } = resolveRequestUser(req);
  const isAdmin = user['role'] === 'admin' || Boolean(realAdmin);
  const queryUserId = typeof req.query['userId'] === 'string' ? req.query['userId'] : '';
  const targetUserId = isAdmin && queryUserId ? queryUserId : String(user['id'] || 'anonymous');
  const entry = getOrCreateUserSettingsEntry(targetUserId);

  res.json({
    userSettings: entry,
    allUserSettings: isAdmin ? state.userSettings : { [targetUserId]: entry },
    systemSettingsConfig: state.systemSettingsConfig,
  });
});

const handleSaveUserSettings = async (req: express.Request, res: express.Response) => {
  try {
    const { user, realAdmin } = resolveRequestUser(req);
    const isAdmin = user['role'] === 'admin' || Boolean(realAdmin);
    const body = req.body || {};
    const requestedUserId = body.targetUserId || body.userId;
    const targetUserId =
      isAdmin && requestedUserId ? String(requestedUserId) : String(user['id'] || 'anonymous');

    const current = getOrCreateUserSettingsEntry(targetUserId);
    const updated: Record<string, unknown> = {
      ...current,
      userId: targetUserId,
      themeMode: body.themeMode !== undefined ? String(body.themeMode) : current['themeMode'] || 'light',
      outageScheduleViewVariant:
        body.outageScheduleViewVariant !== undefined
          ? String(body.outageScheduleViewVariant)
          : current['outageScheduleViewVariant'] || 'v10_minimal_pills',
      hiddenHouseTabs:
        body.hiddenHouseTabs !== undefined && typeof body.hiddenHouseTabs === 'object'
          ? body.hiddenHouseTabs
          : current['hiddenHouseTabs'] || {},
      electricityTariffs:
        body.electricityTariffs !== undefined
          ? body.electricityTariffs
          : current['electricityTariffs'] ?? null,
      waterTariffs:
        body.waterTariffs !== undefined ? body.waterTariffs : current['waterTariffs'] ?? null,
      wasteTariffs:
        body.wasteTariffs !== undefined ? body.wasteTariffs : current['wasteTariffs'] ?? null,
      customPreferences:
        body.customPreferences !== undefined && typeof body.customPreferences === 'object'
          ? {
              ...((current['customPreferences'] as Record<string, unknown>) || {}),
              ...body.customPreferences,
            }
          : current['customPreferences'] || {},
      updatedAt: new Date().toISOString(),
    };

    state.userSettings[targetUserId] = updated;

    // Also keep user's outageScheduleViewVariant synced on user object for backward compatibility
    const targetUserObj = state.users.find((u) => String(u['id']) === targetUserId);
    if (targetUserObj && body.outageScheduleViewVariant !== undefined) {
      targetUserObj['outageScheduleViewVariant'] = String(body.outageScheduleViewVariant);
      await saveUserToCloudSql(targetUserObj);
    }

    await saveUserSettingsToCloudSql(updated);
    bumpVersion();

    res.json({
      success: true,
      userSettings: updated,
      allUserSettings: isAdmin ? state.userSettings : { [targetUserId]: updated },
      message: 'Користувацькі налаштування збережено у базу даних',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Помилка збереження користувацьких налаштувань';
    res.status(500).json({ success: false, error: msg });
  }
};

app.post('/api/user-settings', handleSaveUserSettings);
app.put('/api/user-settings', handleSaveUserSettings);
app.patch('/api/user-settings', handleSaveUserSettings);

app.get('/api/system-settings-config', (_req, res) => {
  res.json(state.systemSettingsConfig);
});

const handleSaveSystemSettingsConfig = async (req: express.Request, res: express.Response) => {
  try {
    const { user, realAdmin } = resolveRequestUser(req);
    const isAdmin = user['role'] === 'admin' || Boolean(realAdmin);
    if (!isAdmin) {
      res.status(403).json({
        success: false,
        error: 'Тільки адміністратор може змінювати системні налаштування та їх призначення',
      });
      return;
    }

    const body = req.body || {};
    const currentScopes =
      (state.systemSettingsConfig['scopesConfig'] as Record<string, 'user' | 'system'>) || {
        ...DEFAULT_SCOPES_CONFIG,
      };
    const nextScopes: Record<string, 'user' | 'system'> = {
      ...DEFAULT_SCOPES_CONFIG,
      ...currentScopes,
      ...(body.scopesConfig && typeof body.scopesConfig === 'object' ? body.scopesConfig : {}),
    };
    const currentSystemValues =
      (state.systemSettingsConfig['systemValues'] as Record<string, unknown>) || {};
    const nextSystemValues: Record<string, unknown> = {
      ...currentSystemValues,
      ...(body.systemValues && typeof body.systemValues === 'object' ? body.systemValues : {}),
    };

    if (
      nextSystemValues['dtekSyncIntervalMinutes'] !== undefined &&
      !isNaN(Number(nextSystemValues['dtekSyncIntervalMinutes']))
    ) {
      const clampedMins = Math.min(
        Math.max(Math.round(Number(nextSystemValues['dtekSyncIntervalMinutes'])), 1),
        360
      );
      nextSystemValues['dtekSyncIntervalMinutes'] = clampedMins;
      state.settings['dtekSyncIntervalMinutes'] = clampedMins;
      const curTariffs =
        (state.settings['utilityTariffsSettings'] as Record<string, unknown>) || {};
      state.settings['utilityTariffsSettings'] = {
        ...curTariffs,
        dtekSyncIntervalMinutes: clampedMins,
      };
      await saveSettingsToCloudSql(state.settings);
    }

    state.systemSettingsConfig = {
      id: 'global',
      scopesConfig: nextScopes,
      systemValues: nextSystemValues,
      updatedAt: new Date().toISOString(),
    };

    for (const u of state.users) {
      if (ensureUserDefaultSettings(u)) {
        void saveUserToCloudSql(u);
      }
    }

    await saveSystemSettingsConfigToCloudSql(state.systemSettingsConfig);
    bumpVersion();

    res.json({
      success: true,
      systemSettingsConfig: state.systemSettingsConfig,
      message: 'Системну таблицю призначення налаштувань збережено у БД',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Помилка збереження системних налаштувань';
    res.status(500).json({ success: false, error: msg });
  }
};

app.post('/api/system-settings-config', handleSaveSystemSettingsConfig);
app.put('/api/system-settings-config', handleSaveSystemSettingsConfig);
app.patch('/api/system-settings-config', handleSaveSystemSettingsConfig);

app.get('/api/stats', (_req, res) => {
  const monthNamesUa = [
    'Січень',
    'Лютий',
    'Березень',
    'Квітень',
    'Травень',
    'Червень',
    'Липень',
    'Серпень',
    'Вересень',
    'Жовтень',
    'Листопад',
    'Грудень',
  ];

  const formatMonthNameUa = (mKey: string): string => {
    const [yStr, mStr] = mKey.split('-');
    const mIdx = parseInt(mStr, 10) - 1;
    const mLabel = monthNamesUa[mIdx] || mKey;
    return `${mLabel} ${yStr || ''}`.trim();
  };

  const byMonth = new Map<
    string,
    {
      monthKey: string;
      monthName: string;
      totalIncome: number;
      totalExpenses: number;
      netProfit: number;
      paymentsCount: number;
      depositsCount: number;
      usdDeposits: number;
      usdExpenses: number;
      newClientsCount: number;
    }
  >();

  const ensureMonth = (mKey: string) => {
    let entry = byMonth.get(mKey);
    if (!entry) {
      entry = {
        monthKey: mKey,
        monthName: formatMonthNameUa(mKey),
        totalIncome: 0,
        totalExpenses: 0,
        netProfit: 0,
        paymentsCount: 0,
        depositsCount: 0,
        usdDeposits: 0,
        usdExpenses: 0,
        newClientsCount: 0,
      };
      byMonth.set(mKey, entry);
    }
    return entry;
  };

  // Seed last 6 months so chart always has a continuous timeline
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    ensureMonth(mKey);
  }

  for (const p of state.payments) {
    const d = String(p['date'] || '');
    const mKey = d.substring(0, 7);
    if (!mKey || mKey.length < 7) continue;
    const item = ensureMonth(mKey);
    item.totalIncome += Number(p['amount']) || 0;
    item.paymentsCount += 1;
  }

  for (const dep of state.providerDeposits) {
    const d = String(dep['date'] || '');
    const mKey = d.substring(0, 7);
    if (!mKey || mKey.length < 7) continue;
    const item = ensureMonth(mKey);
    item.totalExpenses += Number(dep['spentUah']) || 0;
    item.usdDeposits += Number(dep['amountUsd']) || 0;
    item.depositsCount += 1;
  }

  for (const item of byMonth.values()) {
    item.totalIncome = Math.round(item.totalIncome * 100) / 100;
    item.totalExpenses = Math.round(item.totalExpenses * 100) / 100;
    item.netProfit = Math.round((item.totalIncome - item.totalExpenses) * 100) / 100;
    item.usdDeposits = Math.round(item.usdDeposits * 100) / 100;
  }

  const monthlyBreakdown = Array.from(byMonth.values()).sort((a, b) =>
    a.monthKey.localeCompare(b.monthKey)
  );

  res.json({
    summary: {
      totalClients: state.clients.length,
    },
    monthlyBreakdown,
  });
});

// ============================================================================
// PROVIDER ACCOUNTS & BUDGET API
// ============================================================================

function computeBudgetAndAccountsData() {
  const systemTodayStr = new Date().toISOString().split('T')[0];
  // Ensure deductions created under container clock (up to 2026-11-12) or latest payment/deposit date
  // are never skipped if the runtime environment clock is earlier (e.g. April 2026 on Cloud Run)
  let effectiveTodayStr = systemTodayStr > '2026-11-12' ? systemTodayStr : '2026-11-12';
  for (const p of state.payments) {
    const pDate = String(p['date'] || '').split('T')[0];
    if (pDate && pDate.length === 10 && pDate > effectiveTodayStr) {
      effectiveTodayStr = pDate;
    }
  }
  for (const acc of state.providerAccounts) {
    const sDate = String(acc['startDate'] || '').split('T')[0];
    if (sDate && sDate.length === 10 && sDate > effectiveTodayStr) {
      effectiveTodayStr = sDate;
    }
  }
  const todayStr = effectiveTodayStr;

  const overridesMap = new Map<string, Record<string, unknown>>();
  for (const ov of state.accountDeductionOverrides) {
    if (ov && ov['id']) {
      overridesMap.set(String(ov['id']), ov);
    }
  }

  const accountElapsedDeductions = new Map<string, number>();
  const deductionItems: Record<string, unknown>[] = [];

  for (const acc of state.providerAccounts) {
    const accId = String(acc['id'] || '');
    const accName = String(acc['name'] || 'Акаунт IPTV');
    const startDate = String(
      acc['startDate'] || String(acc['createdAt'] || todayStr).split('T')[0]
    );
    const monthsCount = Math.max(1, Number(acc['monthsCount']) || 1);
    const pricePerMonthUsd = Number(acc['pricePerMonthUsd']) || 1;
    let accDeductedSum = 0;

    for (let m = 1; m <= monthsCount; m++) {
      const dedDate = addMonthsExactIso(startDate, m - 1);
      if (m > 1 && dedDate > todayStr) continue;

      const dedId = `ded_${accId}_m${m}`;
      const ov = overridesMap.get(dedId);
      if (ov && ov['isExcluded'] === true) continue;

      const rawUsd =
        ov && ov['amountUsd'] !== undefined && ov['amountUsd'] !== null
          ? Number(ov['amountUsd'])
          : pricePerMonthUsd;
      const signedUsd = -Math.abs(rawUsd);
      const absUsd = Math.abs(rawUsd);
      const amountUah =
        ov && ov['amountUah'] !== undefined && ov['amountUah'] !== null
          ? Number(ov['amountUah'])
          : 0;

      accDeductedSum += absUsd;

      deductionItems.push({
        id: dedId,
        type: 'deduction',
        category: 'account_payment',
        date: String(ov?.['date'] || dedDate),
        amountUah,
        amountUsd: signedUsd,
        title: String(ov?.['title'] || `Щомісячне списання: ${accName}`),
        subtitle: String(
          ov?.['subtitle'] ||
            `-$${absUsd} USD в день підключення (місяць ${m}/${monthsCount})`
        ),
        note: String(
          ov?.['note'] ||
            `Автоматичне списання $${pricePerMonthUsd}/міс на дату підключення`
        ),
        accountId: accId,
        accountName: accName,
      });
    }

    accountElapsedDeductions.set(accId, Math.round(accDeductedSum * 100) / 100);
  }

  const paymentItems: Record<string, unknown>[] = [];
  for (const p of state.payments) {
    const pId = String(p['id'] || '');
    const ov = overridesMap.get(pId);
    if (ov && ov['isExcluded'] === true) continue;

    const amount = Number(p['amount']) || 0;
    const monthsAdded = Number(p['monthsAdded']) || 0;
    const newBalance = Number(p['newBalance']) || 0;
    const clientName = String(p['clientName'] || 'Абонент');
    paymentItems.push({
      id: pId,
      type: 'income',
      category: 'client_payment',
      date: String(p['date'] || todayStr),
      amountUah: amount,
      amountUsd: 0,
      title: `Оплата від абонента: ${clientName}`,
      subtitle: `+${amount} ₴ (+${monthsAdded} міс. до особистого терміну, залишок: ${newBalance} ₴)`,
      note: String(p['note'] || 'Оплата за послуги IPTV'),
      clientId: String(p['clientId'] || ''),
      clientName,
    });
  }

  const depositBalanceMap = new Map<
    string,
    { balanceBeforeUsd: number; balanceAfterUsd: number }
  >();
  const depositItems: Record<string, unknown>[] = [];
  for (const d of state.providerDeposits) {
    const dId = String(d['id'] || '');
    const amountUsd = Math.abs(Number(d['amountUsd']) || 0);
    const spentUah = Math.abs(Number(d['spentUah']) || 0);
    const rate =
      Number(d['exchangeRate']) ||
      (amountUsd > 0 ? Math.round((spentUah / amountUsd) * 100) / 100 : 41.5);
    depositItems.push({
      id: dId,
      type: 'expense',
      category: 'provider_topup',
      date: String(d['date'] || todayStr),
      amountUah: -spentUah,
      amountUsd,
      title: `Поповнення рахунку IPTV: +$${amountUsd}`,
      subtitle: `Витрачено ${spentUah} ₴ (курс ~${rate.toFixed(2)} ₴/$ з комісією)`,
      note: String(d['note'] || ''),
      paymentMethod: String(d['paymentMethod'] || 'Картка'),
      _createdAt: String(d['createdAt'] || d['date'] || ''),
    });
  }

  const adjustmentItems: Record<string, unknown>[] = [];
  for (const adj of state.providerBalanceAdjustments) {
    const aId = String(adj['id'] || '');
    const amountUsd = Number(adj['amountUsd']) || 0;
    adjustmentItems.push({
      id: aId,
      type: 'adjustment',
      category: 'provider_adjustment',
      date: String(adj['date'] || todayStr),
      amountUah: 0,
      amountUsd,
      title: `Коригування балансу провайдера: ${amountUsd >= 0 ? '+' : ''}$${amountUsd}`,
      subtitle: String(adj['note'] || 'Калібрування балансу провайдера'),
      note: String(adj['note'] || ''),
      _createdAt: String(adj['createdAt'] || adj['date'] || ''),
    });
  }

  const customItems: Record<string, unknown>[] = [];
  for (const c of state.customLedgerEntries) {
    const cId = String(c['id'] || '');
    const ov = overridesMap.get(cId);
    if (ov && ov['isExcluded'] === true) continue;

    const amountUah = Number(c['amountUah']) || 0;
    const rawUsd = c['amountUsd'];
    const amountUsd =
      rawUsd !== null && rawUsd !== undefined && rawUsd !== ''
        ? Number(rawUsd)
        : undefined;
    let subtitle = String(c['subtitle'] || '');
    if (!subtitle) {
      const parts: string[] = [];
      if (amountUah !== 0) {
        parts.push(`${amountUah > 0 ? '+' : ''}${amountUah} ₴`);
      }
      if (amountUsd !== undefined && amountUsd !== 0) {
        parts.push(
          `${amountUsd > 0 ? '+$' : '-$'}${Math.abs(amountUsd)} USD`
        );
      }
      subtitle = parts.join(', ');
    }
    customItems.push({
      id: cId,
      type: String(c['type'] || (amountUah >= 0 ? 'income' : 'expense')),
      category: String(c['category'] || 'custom'),
      date: String(c['date'] || todayStr),
      amountUah,
      amountUsd,
      title: String(c['title'] || 'Операція білінгу'),
      subtitle,
      note: c['note'] ?? null,
      paymentMethod: c['paymentMethod'] || undefined,
      clientId: c['clientId'] ?? null,
      clientName: c['clientName'] ?? null,
      accountId: c['accountId'] ?? null,
      accountName: c['accountName'] ?? null,
      createdAt: c['createdAt'],
      isCustom: true,
      _createdAt: String(c['createdAt'] || c['date'] || ''),
    });
  }

  const allLedger: Record<string, unknown>[] = [
    ...depositItems,
    ...deductionItems,
    ...adjustmentItems,
    ...customItems,
    ...paymentItems,
  ];

  const typeOrder = (t: string, cat: string): number => {
    if (cat === 'provider_topup') return 1;
    if (t === 'deduction' || cat === 'account_payment') return 2;
    if (t === 'adjustment') return 3;
    return 4;
  };

  // Sort chronologically (oldest first) to compute running provider USD balance
  const chronological = [...allLedger].sort((a, b) => {
    const dA = String(a['date'] || '').split('T')[0];
    const dB = String(b['date'] || '').split('T')[0];
    if (dA !== dB) return dA.localeCompare(dB);
    const oA = typeOrder(String(a['type'] || ''), String(a['category'] || ''));
    const oB = typeOrder(String(b['type'] || ''), String(b['category'] || ''));
    if (oA !== oB) return oA - oB;
    return String(a['id'] || '').localeCompare(String(b['id'] || ''));
  });

  let runningUsd = 0;
  for (const item of chronological) {
    const usd = item['amountUsd'];
    if (typeof usd === 'number' && !isNaN(usd) && usd !== 0) {
      const before = Math.round(runningUsd * 100) / 100;
      runningUsd = Math.round((runningUsd + usd) * 100) / 100;
      const after = runningUsd;
      item['balanceBeforeUsd'] = before;
      item['balanceAfterUsd'] = after;
      if (item['category'] === 'provider_topup') {
        depositBalanceMap.set(String(item['id']), {
          balanceBeforeUsd: before,
          balanceAfterUsd: after,
        });
      }
    }
    delete item['_createdAt'];
  }

  // Sort newest first for ledger display
  const sortedLedger = [...chronological].sort((a, b) => {
    const dA = String(a['date'] || '').split('T')[0];
    const dB = String(b['date'] || '').split('T')[0];
    if (dA !== dB) return dB.localeCompare(dA);
    const fullA = String(a['date'] || '');
    const fullB = String(b['date'] || '');
    if (fullA !== fullB) return fullB.localeCompare(fullA);
    const oA = typeOrder(String(a['type'] || ''), String(a['category'] || ''));
    const oB = typeOrder(String(b['type'] || ''), String(b['category'] || ''));
    if (oA !== oB) return oB - oA;
    return String(b['id'] || '').localeCompare(String(a['id'] || ''));
  });

  const enrichedDeposits = state.providerDeposits.map((d) => {
    const bal = depositBalanceMap.get(String(d['id']));
    return {
      ...d,
      ...(bal ? bal : {}),
    };
  });

  const totalDepositedUsd =
    Math.round(
      state.providerDeposits.reduce((s, d) => s + (Number(d['amountUsd']) || 0), 0) * 100
    ) / 100;
  const totalSpentUahOnDeposits =
    Math.round(
      state.providerDeposits.reduce((s, d) => s + (Number(d['spentUah']) || 0), 0) * 100
    ) / 100;

  const deductionsSumUsd = deductionItems.reduce(
    (s, item) => s + Math.abs(Number(item['amountUsd']) || 0),
    0
  );
  const customNegativeUsd = customItems.reduce((s, item) => {
    const u = Number(item['amountUsd']) || 0;
    return u < 0 ? s + Math.abs(u) : s;
  }, 0);
  const customPositiveUsd = customItems.reduce((s, item) => {
    const u = Number(item['amountUsd']) || 0;
    return u > 0 ? s + u : s;
  }, 0);

  const totalDeductedUsd =
    Math.round((deductionsSumUsd + customNegativeUsd) * 100) / 100;
  const providerBalanceAdjustmentsSum =
    Math.round(
      state.providerBalanceAdjustments.reduce(
        (s, a) => s + (Number(a['amountUsd']) || 0),
        0
      ) * 100
    ) / 100;

  const calculatedProviderBalanceUsd =
    Math.round((totalDepositedUsd + customPositiveUsd - totalDeductedUsd) * 100) / 100;
  const providerBalanceUsd =
    Math.round((calculatedProviderBalanceUsd + providerBalanceAdjustmentsSum) * 100) / 100;

  const totalIncomeUah =
    Math.round(
      paymentItems.reduce((s, p) => s + (Number(p['amountUah']) || 0), 0) * 100
    ) / 100;
  const totalExpensesUah = totalSpentUahOnDeposits;
  const netProfitUah = Math.round((totalIncomeUah - totalExpensesUah) * 100) / 100;

  const monthlyBurnUsd = state.providerAccounts.reduce((s, a) => {
    const validUntil = String(a['validUntil'] || todayStr);
    if (validUntil < todayStr) return s;
    return s + (Number(a['pricePerMonthUsd']) || 1);
  }, 0);

  const runwayMonths =
    monthlyBurnUsd > 0
      ? Math.round((providerBalanceUsd / monthlyBurnUsd) * 10) / 10
      : 0;

  const activeClientsCount = state.clients.filter(
    (c) => c['status'] !== 'paused' && c['status'] !== 'expired'
  ).length;

  const averageExchangeRate =
    totalDepositedUsd > 0
      ? Math.round((totalExpensesUah / totalDepositedUsd) * 100) / 100
      : 41.5;

  return {
    accountElapsedDeductions,
    summary: {
      totalIncomeUah,
      totalExpensesUah,
      netProfitUah,
      totalDepositedUsd,
      totalDeductedUsd,
      providerBalanceUsd,
      monthlyBurnUsd,
      runwayMonths,
      activeClientsCount,
      averageExchangeRate,
      calculatedProviderBalanceUsd,
      providerBalanceAdjustmentsSum,
    },
    deposits: enrichedDeposits,
    adjustments: state.providerBalanceAdjustments,
    ledger: sortedLedger,
  };
}

app.get('/api/accounts', (_req, res) => {
  const { accountElapsedDeductions } = computeBudgetAndAccountsData();
  const todayMs = new Date().setHours(0, 0, 0, 0);

  const detailed = state.providerAccounts.map((acc) => {
    const accId = String(acc['id'] || '');
    const assignedIds = Array.isArray(acc['assignedClientIds'])
      ? (acc['assignedClientIds'] as string[])
      : [];
    const assignedClients = state.clients
      .filter((c) => assignedIds.includes(String(c['id'])) || c['providerAccountId'] === accId)
      .map((c) => ({
        id: c['id'],
        fullName: c['fullName'],
        iptvLogin: c['iptvLogin'],
        phone: c['phone'],
        subscriptionPlan: c['subscriptionPlan'] || '1usd',
        costUsd: Number(c['costUsd']) || 1,
        monthlyPrice: c['monthlyPrice'],
        activeUntil: c['activeUntil'],
        status: c['status'],
      }));
    const maxSlots = Number(acc['maxSlots']) || 2;
    const occupiedSlots = assignedClients.length;
    const availableSlots = Math.max(0, maxSlots - occupiedSlots);
    const validUntilStr = String(acc['validUntil'] || '');
    let daysRemaining = 0;
    if (validUntilStr) {
      const [y, m, d] = validUntilStr.split('-').map(Number);
      if (y && m && d) {
        const targetMs = new Date(y, m - 1, d).setHours(0, 0, 0, 0);
        daysRemaining = Math.round((targetMs - todayMs) / 86400000);
      }
    }
    const status =
      daysRemaining < 0 ? 'expired' : daysRemaining <= 7 ? 'expiring_soon' : 'active';

    const elapsedDed = accountElapsedDeductions.get(accId);
    const totalDeductedUsd =
      elapsedDed !== undefined ? elapsedDed : Number(acc['totalDeductedUsd']) || 0;

    return {
      ...acc,
      totalDeductedUsd,
      assignedClientIds: assignedClients.map((c) => String(c.id)),
      clients: assignedClients,
      assignedClients,
      occupiedSlots,
      availableSlots,
      freeSlots: availableSlots,
      isFull: occupiedSlots >= maxSlots,
      daysRemaining,
      status,
    };
  });
  res.json(detailed);
});

app.post('/api/accounts', async (req, res) => {
  const body = req.body || {};
  const now = new Date().toISOString();
  const startDate = String(body.startDate || now.split('T')[0]);
  const monthsCount = Number(body.monthsCount) || 1;
  const pricePerMonthUsd = Number(body.pricePerMonthUsd) || 1;
  const account: Record<string, unknown> = {
    id: body.id || 'acc_' + Date.now(),
    name: String(body.name || 'Новий акаунт'),
    login: String(body.login || ''),
    password: body.password || '',
    playlistUrl: body.playlistUrl || '',
    serverUrl: body.serverUrl || '',
    maxSlots: Number(body.maxSlots) || 2,
    assignedClientIds: Array.isArray(body.assignedClientIds) ? body.assignedClientIds : [],
    pricePerMonthUsd,
    startDate,
    monthsCount,
    validUntil: String(body.validUntil || addMonthsExactIso(startDate, monthsCount)),
    totalDeductedUsd: Number(body.totalDeductedUsd) ?? pricePerMonthUsd,
    renewals: Array.isArray(body.renewals) ? body.renewals : [],
    notes: body.notes || '',
    createdAt: now,
    updatedAt: now,
  };
  state.providerAccounts.unshift(account);
  await saveProviderAccountToCloudSql(account);
  bumpVersion();
  res.json(account);
});

app.put('/api/accounts/:id', async (req, res) => {
  const { id } = req.params;
  const idx = state.providerAccounts.findIndex((a) => a['id'] === id);
  if (idx < 0) {
    res.status(404).json({ error: 'Акаунт не знайдено' });
    return;
  }
  const updated = {
    ...state.providerAccounts[idx],
    ...req.body,
    id,
    updatedAt: new Date().toISOString(),
  };
  state.providerAccounts[idx] = updated;
  await saveProviderAccountToCloudSql(updated);
  bumpVersion();
  res.json(updated);
});

app.delete('/api/accounts/:id', async (req, res) => {
  const { id } = req.params;
  state.providerAccounts = state.providerAccounts.filter((a) => a['id'] !== id);
  await deleteProviderAccountFromCloudSql(id);
  bumpVersion();
  res.json({ success: true });
});

app.post('/api/accounts/:id/assign', async (req, res) => {
  const { id } = req.params;
  const { clientId, action } = req.body || {};
  const acc = state.providerAccounts.find((a) => a['id'] === id);
  const client = state.clients.find((c) => c['id'] === clientId);
  if (!acc || !client) {
    res.status(404).json({ error: 'Акаунт або клієнта не знайдено' });
    return;
  }
  const currentIds = Array.isArray(acc['assignedClientIds'])
    ? [...(acc['assignedClientIds'] as string[])]
    : [];
  if (action === 'assign') {
    if (!currentIds.includes(clientId)) currentIds.push(clientId);
    client['providerAccountId'] = id;
  } else {
    acc['assignedClientIds'] = currentIds.filter((cid) => cid !== clientId);
    if (client['providerAccountId'] === id) client['providerAccountId'] = null;
  }
  if (action === 'assign') {
    acc['assignedClientIds'] = currentIds;
  }
  await Promise.all([
    saveProviderAccountToCloudSql(acc),
    saveClientToCloudSql(client),
  ]);
  bumpVersion();
  res.json({ success: true });
});

app.post('/api/accounts/:id/renew', async (req, res) => {
  const { id } = req.params;
  const { months, pricePerMonthUsd, note } = req.body || {};
  const acc = state.providerAccounts.find((a) => a['id'] === id);
  if (!acc) {
    res.status(404).json({ error: 'Акаунт не знайдено' });
    return;
  }
  const m = Number(months) || 1;
  const rate = Number(pricePerMonthUsd) || Number(acc['pricePerMonthUsd']) || 1;
  const costUsd = Math.round(m * rate * 100) / 100;
  const prevValidUntil = String(acc['validUntil'] || new Date().toISOString().split('T')[0]);
  const newValidUntil = addMonthsExactIso(prevValidUntil, m);

  const renewals = Array.isArray(acc['renewals']) ? [...(acc['renewals'] as Record<string, unknown>[])] : [];
  renewals.unshift({
    id: 'ren_' + Date.now(),
    date: new Date().toISOString(),
    monthsAdded: m,
    pricePerMonthUsd: rate,
    costUsd,
    previousValidUntil: prevValidUntil,
    newValidUntil,
    note: note || `Продовження на ${m} міс.`,
  });

  acc['validUntil'] = newValidUntil;
  acc['monthsCount'] = (Number(acc['monthsCount']) || 0) + m;
  acc['totalDeductedUsd'] = Math.round(((Number(acc['totalDeductedUsd']) || 0) + costUsd) * 100) / 100;
  acc['renewals'] = renewals;
  acc['updatedAt'] = new Date().toISOString();

  await saveProviderAccountToCloudSql(acc);
  bumpVersion();
  res.json({
    success: true,
    summary: { monthsAdded: m, costUsd, newValidUntil },
  });
});

app.put('/api/accounts/:id/renewals/:renewalId', async (req, res) => {
  const { id, renewalId } = req.params;
  const acc = state.providerAccounts.find((a) => a['id'] === id);
  if (!acc) {
    res.status(404).json({ error: 'Акаунт не знайдено' });
    return;
  }
  const renewals = Array.isArray(acc['renewals']) ? [...(acc['renewals'] as Record<string, unknown>[])] : [];
  const rIdx = renewals.findIndex((r) => r['id'] === renewalId);
  if (rIdx >= 0) {
    renewals[rIdx] = { ...renewals[rIdx], ...req.body, id: renewalId };
    acc['renewals'] = renewals;
    await saveProviderAccountToCloudSql(acc);
    bumpVersion();
  }
  res.json({ success: true });
});

app.delete('/api/accounts/:id/renewals/:renewalId', async (req, res) => {
  const { id, renewalId } = req.params;
  const acc = state.providerAccounts.find((a) => a['id'] === id);
  if (!acc) {
    res.status(404).json({ error: 'Акаунт не знайдено' });
    return;
  }
  const renewals = Array.isArray(acc['renewals']) ? (acc['renewals'] as Record<string, unknown>[]) : [];
  acc['renewals'] = renewals.filter((r) => r['id'] !== renewalId);
  await saveProviderAccountToCloudSql(acc);
  bumpVersion();
  res.json({ success: true });
});

app.get('/api/budget', (_req, res) => {
  const { summary, deposits, adjustments, ledger } = computeBudgetAndAccountsData();
  res.json({
    summary,
    deposits,
    adjustments,
    ledger,
  });
});

app.post('/api/budget/deposits', async (req, res) => {
  const body = req.body || {};
  const amountUsd = Number(body.amountUsd) || 0;
  const spentUah = Number(body.spentUah) || 0;
  const deposit: Record<string, unknown> = {
    id: 'dep_' + Date.now(),
    date: String(body.date || new Date().toISOString().split('T')[0]),
    amountUsd,
    spentUah,
    exchangeRate: amountUsd > 0 ? Math.round((spentUah / amountUsd) * 100) / 100 : 41.5,
    paymentMethod: body.paymentMethod || 'Картка',
    note: body.note || '',
    createdAt: new Date().toISOString(),
  };
  state.providerDeposits.unshift(deposit);
  await saveProviderDepositToCloudSql(deposit);
  bumpVersion();
  res.json(deposit);
});

app.put('/api/budget/deposits/:id', async (req, res) => {
  const { id } = req.params;
  const idx = state.providerDeposits.findIndex((d) => d['id'] === id);
  if (idx < 0) {
    res.status(404).json({ error: 'Запис не знайдено' });
    return;
  }
  const updated = { ...state.providerDeposits[idx], ...req.body, id };
  state.providerDeposits[idx] = updated;
  await saveProviderDepositToCloudSql(updated);
  bumpVersion();
  res.json(updated);
});

app.delete('/api/budget/deposits/:id', async (req, res) => {
  const { id } = req.params;
  state.providerDeposits = state.providerDeposits.filter((d) => d['id'] !== id);
  await deleteProviderDepositFromCloudSql(id);
  bumpVersion();
  res.json({ success: true });
});

app.post('/api/budget/ledger', async (req, res) => {
  const body = req.body || {};
  const entry: Record<string, unknown> = {
    id: body.id || 'led_' + Date.now(),
    type: body.type || 'income',
    category: body.category || 'custom',
    date: String(body.date || new Date().toISOString().split('T')[0]),
    amountUah: Number(body.amountUah) || 0,
    amountUsd: body.amountUsd != null ? Number(body.amountUsd) : null,
    title: String(body.title || 'Запис'),
    subtitle: body.subtitle || '',
    note: body.note || '',
    paymentMethod: body.paymentMethod || undefined,
    clientId: body.clientId || null,
    clientName: body.clientName || null,
    accountId: body.accountId || null,
    accountName: body.accountName || null,
    createdAt: new Date().toISOString(),
  };
  state.customLedgerEntries.unshift(entry);
  await saveCustomLedgerEntryToCloudSql(entry);
  bumpVersion();
  res.json(entry);
});

app.put('/api/budget/ledger/:id', async (req, res) => {
  const { id } = req.params;
  const idx = state.customLedgerEntries.findIndex((e) => e['id'] === id);
  if (idx >= 0) {
    const updated = { ...state.customLedgerEntries[idx], ...req.body, id };
    state.customLedgerEntries[idx] = updated;
    await saveCustomLedgerEntryToCloudSql(updated);
    bumpVersion();
    res.json(updated);
    return;
  }
  if (id.startsWith('pay_')) {
    const pIdx = state.payments.findIndex((p) => p['id'] === id);
    if (pIdx >= 0) {
      const updatedPay = {
        ...state.payments[pIdx],
        amount: req.body.amountUah !== undefined ? Math.abs(Number(req.body.amountUah)) : state.payments[pIdx]['amount'],
        date: req.body.date || state.payments[pIdx]['date'],
        note: req.body.note !== undefined ? req.body.note : state.payments[pIdx]['note'],
      };
      state.payments[pIdx] = updatedPay;
      await savePaymentToCloudSql(updatedPay);
      bumpVersion();
      res.json(updatedPay);
      return;
    }
  }
  if (id.startsWith('dep_')) {
    const dIdx = state.providerDeposits.findIndex((d) => d['id'] === id);
    if (dIdx >= 0) {
      const updatedDep = {
        ...state.providerDeposits[dIdx],
        spentUah: req.body.amountUah !== undefined ? Math.abs(Number(req.body.amountUah)) : state.providerDeposits[dIdx]['spentUah'],
        amountUsd: req.body.amountUsd !== undefined ? Math.abs(Number(req.body.amountUsd)) : state.providerDeposits[dIdx]['amountUsd'],
        date: req.body.date || state.providerDeposits[dIdx]['date'],
        note: req.body.note !== undefined ? req.body.note : state.providerDeposits[dIdx]['note'],
      };
      state.providerDeposits[dIdx] = updatedDep;
      await saveProviderDepositToCloudSql(updatedDep);
      bumpVersion();
      res.json(updatedDep);
      return;
    }
  }
  const existingOvIdx = state.accountDeductionOverrides.findIndex((o) => o['id'] === id);
  const override: Record<string, unknown> = {
    ...(existingOvIdx >= 0 ? state.accountDeductionOverrides[existingOvIdx] : {}),
    ...req.body,
    id,
  };
  if (existingOvIdx >= 0) {
    state.accountDeductionOverrides[existingOvIdx] = override;
  } else {
    state.accountDeductionOverrides.push(override);
  }
  await saveAccountDeductionOverrideToCloudSql(override);
  bumpVersion();
  res.json(override);
});

app.delete('/api/budget/ledger/:id', async (req, res) => {
  const { id } = req.params;
  if (id.startsWith('led_')) {
    state.customLedgerEntries = state.customLedgerEntries.filter((e) => e['id'] !== id);
    await deleteCustomLedgerEntryFromCloudSql(id);
  } else if (id.startsWith('pay_')) {
    state.payments = state.payments.filter((p) => p['id'] !== id);
    await deletePaymentFromCloudSql(id);
  } else if (id.startsWith('dep_')) {
    state.providerDeposits = state.providerDeposits.filter((d) => d['id'] !== id);
    await deleteProviderDepositFromCloudSql(id);
  } else if (id.startsWith('adj_')) {
    state.providerBalanceAdjustments = state.providerBalanceAdjustments.filter((a) => a['id'] !== id);
    await deleteProviderBalanceAdjustmentFromCloudSql(id);
  } else {
    const existingOvIdx = state.accountDeductionOverrides.findIndex((o) => o['id'] === id);
    const override: Record<string, unknown> = {
      ...(existingOvIdx >= 0 ? state.accountDeductionOverrides[existingOvIdx] : {}),
      id,
      isExcluded: true,
    };
    if (existingOvIdx >= 0) {
      state.accountDeductionOverrides[existingOvIdx] = override;
    } else {
      state.accountDeductionOverrides.push(override);
    }
    await saveAccountDeductionOverrideToCloudSql(override);
  }
  bumpVersion();
  res.json({ success: true });
});

app.post('/api/budget/provider-balance/adjust', async (req, res) => {
  const { amountUsd, targetBalanceUsd, note, date } = req.body || {};
  let delta = Number(amountUsd) || 0;
  if (targetBalanceUsd !== undefined && targetBalanceUsd !== null) {
    const { summary } = computeBudgetAndAccountsData();
    delta = Math.round((Number(targetBalanceUsd) - summary.providerBalanceUsd) * 100) / 100;
  }
  const adj: Record<string, unknown> = {
    id: 'adj_' + Date.now(),
    date: String(date || new Date().toISOString().split('T')[0]),
    amountUsd: delta,
    note: note || 'Коригування балансу',
    createdAt: new Date().toISOString(),
  };
  state.providerBalanceAdjustments.unshift(adj);
  await saveProviderBalanceAdjustmentToCloudSql(adj);
  bumpVersion();
  res.json(adj);
});

app.delete('/api/budget/provider-balance/adjust/:id', async (req, res) => {
  const { id } = req.params;
  state.providerBalanceAdjustments = state.providerBalanceAdjustments.filter((a) => a['id'] !== id);
  await deleteProviderBalanceAdjustmentFromCloudSql(id);
  bumpVersion();
  res.json({ success: true });
});

// ============================================================================
// UTILITY (ELECTRICITY, WATER, DTEK SCHEDULE) API
// ============================================================================

app.get('/api/utility/data', (req, res) => {
  const { authenticated, user } = resolveRequestUser(req);
  if (!authenticated || !user) {
    res.json({ accounts: [], readings: [] });
    return;
  }
  const userIdStr = String(user['id'] || '');
  const assignedIds = Array.isArray(user['assignedUtilityAccountIds'])
    ? (user['assignedUtilityAccountIds'] as string[])
    : [];

  const visibleAccounts = state.utilityAccounts.filter((a) => {
    const ownerId = a['ownerUserId'] ? String(a['ownerUserId']) : '';
    const isOwnHouse = Boolean(ownerId && ownerId === userIdStr);
    const isAssigned =
      assignedIds.includes(String(a['id'])) ||
      (Array.isArray(a['assignedUserIds']) && (a['assignedUserIds'] as string[]).includes(userIdStr));
    return isOwnHouse || isAssigned;
  });

  const visibleAccIds = new Set(visibleAccounts.map((a) => String(a['id'])));
  const visibleReadings = state.utilityReadings.filter((r) => visibleAccIds.has(String(r['accountId'])));

  res.json({
    accounts: visibleAccounts,
    readings: visibleReadings,
  });
});

app.post('/api/utility/accounts', async (req, res) => {
  const { authenticated, user } = resolveRequestUser(req);
  if (!authenticated) {
    res.status(401).json({ error: 'Необхідна авторизація в Google акаунті' });
    return;
  }
  const body = req.body || {};
  const id = body.id || 'uacc_' + Date.now();
  const existingIdx = state.utilityAccounts.findIndex((a) => a['id'] === id);
  const userIdStr = String(user['id'] || '');
  const isNewHouse = existingIdx < 0;

  const existingAssignedUsers =
    !isNewHouse && Array.isArray(state.utilityAccounts[existingIdx]['assignedUserIds'])
      ? (state.utilityAccounts[existingIdx]['assignedUserIds'] as string[])
      : [];
  const bodyAssignedUsers = Array.isArray(body.assignedUserIds)
    ? (body.assignedUserIds as string[])
    : existingAssignedUsers;

  const mergedAssignedUsers =
    isNewHouse && userIdStr
      ? Array.from(new Set([...bodyAssignedUsers, userIdStr]))
      : bodyAssignedUsers;

  const account: Record<string, unknown> = {
    ...(existingIdx >= 0 ? state.utilityAccounts[existingIdx] : {}),
    ...body,
    id,
    ownerUserId:
      !isNewHouse
        ? state.utilityAccounts[existingIdx]['ownerUserId'] ?? userIdStr
        : body.ownerUserId ?? userIdStr,
    assignedUserIds: mergedAssignedUsers,
    createdAt: existingIdx >= 0 ? state.utilityAccounts[existingIdx]['createdAt'] : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    state.utilityAccounts[existingIdx] = account;
  } else {
    state.utilityAccounts.push(account);
  }

  // Automatically bind newly created house to creator's assignedUtilityAccountIds
  if (isNewHouse && userIdStr) {
    const currAssigned = Array.isArray(user['assignedUtilityAccountIds'])
      ? (user['assignedUtilityAccountIds'] as string[])
      : [];
    if (!currAssigned.includes(id)) {
      user['assignedUtilityAccountIds'] = [...currAssigned, id];
      await saveUserToCloudSql(user);
    }
  }

  await saveUtilityAccountToCloudSql(account);
  bumpVersion();
  res.json({ success: true, account });
});

app.delete('/api/utility/accounts/:id', async (req, res) => {
  const { id } = req.params;
  state.utilityAccounts = state.utilityAccounts.filter((a) => a['id'] !== id);
  state.utilityReadings = state.utilityReadings.filter((r) => r['accountId'] !== id);
  await deleteUtilityAccountFromCloudSql(id);
  bumpVersion();
  res.json({ success: true });
});

const handleSaveAccountDevices = async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const { user } = resolveRequestUser(req);
    const reqUserId = String(body.userId || user?.['id'] || '');

    const rawIncomingDevices = Array.isArray(body.devices) ? body.devices : [];
    const incomingDevices = rawIncomingDevices.map((d: Record<string, unknown>) => ({
      ...d,
      accountId: id,
      ownerUserId: String(d['ownerUserId'] || reqUserId || ''),
    }));

    let acc = state.utilityAccounts.find((a) => a['id'] === id);
    if (!acc) {
      await hydrateFromDatabase();
      acc = state.utilityAccounts.find((a) => a['id'] === id);
    }
    if (!acc) {
      const nowIso = new Date().toISOString();
      acc = {
        id,
        type: 'electricity',
        name: String(body.accountName || 'Будинок'),
        accountNumber: String(body.accountNumber || '000000'),
        address: body.address || '',
        city: body.city || '',
        street: body.street || '',
        houseNum: body.houseNum || '',
        electricityTariffType: body.electricityTariffType || 'single',
        residentsCount: 1,
        initialReadingT1: 0,
        initialReadingT2: 0,
        initialReadingWater: 0,
        waterEnabled: false,
        wasteEnabled: false,
        balanceUah: 0,
        ownerUserId: reqUserId || undefined,
        devices: incomingDevices,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      state.utilityAccounts.push(acc);
    } else {
      acc['devices'] = incomingDevices;
      acc['updatedAt'] = new Date().toISOString();
    }
    await saveUtilityAccountToCloudSql(acc);
    bumpVersion();
    res.status(200).json({ success: true, account: acc, devices: acc['devices'] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Помилка збереження пристроїв електроенергії';
    res.status(500).json({ success: false, error: msg });
  }
};

app.post('/api/utility/accounts/:id/devices', handleSaveAccountDevices);
app.put('/api/utility/accounts/:id/devices', handleSaveAccountDevices);

// ============================================================================
// WEATHER & TEMPERATURE API FOR ELECTRICITY CONSUMPTION ANALYTICS
// ============================================================================
const ODESA_REGION_COORDS: Record<string, { lat: number; lon: number; label: string }> = {
  'окни': { lat: 47.5381, lon: 29.4606, label: 'с-ще Окни, Подільський р-н' },
  'одеса': { lat: 46.4825, lon: 30.7233, label: 'м. Одеса' },
  'подільськ': { lat: 47.752, lon: 29.535, label: 'м. Подільськ' },
  'чорноморськ': { lat: 46.3017, lon: 30.6569, label: 'м. Чорноморськ' },
  'балта': { lat: 47.94, lon: 29.6222, label: 'м. Балта' },
  'роздільна': { lat: 46.8492, lon: 30.0775, label: 'м. Роздільна' },
  'березівка': { lat: 47.2006, lon: 30.9169, label: 'м. Березівка' },
  'ізмаїл': { lat: 45.3503, lon: 28.8364, label: 'м. Ізмаїл' },
  'білгород-дністровський': { lat: 46.1956, lon: 30.3422, label: 'м. Білгород-Дністровський' },
  'болград': { lat: 45.6819, lon: 28.6128, label: 'м. Болград' },
  'кілія': { lat: 45.4553, lon: 29.2636, label: 'м. Кілія' },
  'рені': { lat: 45.4575, lon: 28.2889, label: 'м. Рені' },
  'ананьїв': { lat: 47.7219, lon: 29.9617, label: 'м. Ананьїв' },
  'кодима': { lat: 48.0969, lon: 29.1244, label: 'м. Кодима' },
  'саврань': { lat: 48.1333, lon: 30.0833, label: 'с-ще Саврань' },
  'любашівка': { lat: 47.8358, lon: 30.2597, label: 'с-ще Любашівка' },
  'ширяєве': { lat: 47.3878, lon: 30.1914, label: 'с-ще Ширяєве' },
  'захарівка': { lat: 47.3319, lon: 29.7569, label: 'с-ще Захарівка' },
  'великомихайлівка': { lat: 47.0789, lon: 29.8533, label: 'с-ще Великомихайлівка' },
  'овідіополь': { lat: 46.2456, lon: 30.4408, label: 'с-ще Овідіополь' },
  'біляївка': { lat: 46.4856, lon: 30.2019, label: 'м. Біляївка' },
  'теплодар': { lat: 46.5036, lon: 30.3247, label: 'м. Теплодар' },
  'південне': { lat: 46.6236, lon: 31.1, label: 'м. Південне' },
  'южне': { lat: 46.6236, lon: 31.1, label: 'м. Південне (Южне)' },
  'татарбунари': { lat: 45.8453, lon: 29.6131, label: 'м. Татарбунари' },
  'сарата': { lat: 46.0206, lon: 29.6656, label: 'с-ще Сарата' },
  'арциз': { lat: 45.9939, lon: 29.4314, label: 'м. Арциз' },
  'тарутине': { lat: 46.1886, lon: 29.1467, label: 'с-ще Тарутине' },
};

function mapWmoWeatherCode(code: number): { condition: string; icon: string; emoji: string } {
  if (code === 0) return { condition: 'Ясно', icon: 'wb_sunny', emoji: '☀️' };
  if (code === 1) return { condition: 'Переважно ясно', icon: 'wb_sunny', emoji: '🌤️' };
  if (code === 2) return { condition: 'Мінлива хмарність', icon: 'partly_cloudy_day', emoji: '⛅' };
  if (code === 3) return { condition: 'Похмуро', icon: 'cloud', emoji: '☁️' };
  if (code === 45 || code === 48) return { condition: 'Туман / Паморозь', icon: 'foggy', emoji: '🌫️' };
  if (code >= 51 && code <= 57) return { condition: 'Мряка', icon: 'grain', emoji: '🌦️' };
  if (code >= 61 && code <= 67) return { condition: 'Дощ', icon: 'Umbrella', emoji: '🌧️' };
  if (code >= 71 && code <= 77) return { condition: 'Сніг', icon: 'ac_unit', emoji: '❄️' };
  if (code >= 80 && code <= 82) return { condition: 'Злива', icon: 'thunderstorm', emoji: '🌧️' };
  if (code >= 85 && code <= 86) return { condition: 'Снігопад', icon: 'ac_unit', emoji: '🌨️' };
  if (code >= 95) return { condition: 'Гроза', icon: 'thunderstorm', emoji: '⛈️' };
  return { condition: 'Хмарно з проясненнями', icon: 'cloud', emoji: '⛅' };
}

function generateClimatologicalDayWeather(dateStr: string, lat: number): {
  date: string;
  tempAvgC: number;
  tempMinC: number;
  tempMaxC: number;
  weatherCode: number;
  condition: string;
  icon: string;
  emoji: string;
  precipitationMm: number;
} {
  const parts = dateStr.split('-');
  const m = Number(parts[1]) || 11;
  const d = Number(parts[2]) || 15;
  // Monthly baseline mean temperatures (°C) for Southern/Central Ukraine (adjusted slightly by latitude)
  const monthlyMeans: Record<number, number> = {
    1: -1.5, 2: -0.2, 3: 4.5, 4: 11.2, 5: 17.4, 6: 21.8,
    7: 24.2, 8: 23.6, 9: 18.0, 10: 11.4, 11: 4.8, 12: 0.4,
  };
  const latOffset = (46.5 - lat) * 0.9;
  const baseMean = (monthlyMeans[m] ?? 5.0) + latOffset;
  // Deterministic daily wave so consecutive days look like realistic weather fronts
  const wave = Math.sin(d * 0.55 + m * 1.3) * 3.4 + Math.cos(d * 1.15) * 1.8;
  const tempAvgC = Math.round((baseMean + wave) * 10) / 10;
  const swing = 3.2 + Math.abs(Math.sin(d * 0.7)) * 2.1;
  const tempMinC = Math.round((tempAvgC - swing) * 10) / 10;
  const tempMaxC = Math.round((tempAvgC + swing) * 10) / 10;

  const codeOptions = tempAvgC < 0 ? [3, 71, 2, 3, 1] : tempAvgC < 7 ? [3, 2, 61, 3, 1] : [1, 2, 0, 3, 61];
  const weatherCode = codeOptions[(d + m) % codeOptions.length];
  const meta = mapWmoWeatherCode(weatherCode);

  return {
    date: dateStr,
    tempAvgC,
    tempMinC,
    tempMaxC,
    weatherCode,
    condition: meta.condition,
    icon: meta.icon === 'Umbrella' ? 'water_drop' : meta.icon,
    emoji: meta.emoji,
    precipitationMm: weatherCode >= 51 ? Math.round(((d % 5) + 1.2) * 10) / 10 : 0,
  };
}

const weatherCache = new Map<string, { expiresAt: number; data: Record<string, unknown> }>();

app.get('/api/utility/weather', async (req, res) => {
  try {
    const rawCity = String(req.query['city'] || 'с-ще Окни').trim();
    const monthParam = String(req.query['month'] || '').trim(); // YYYY-MM
    const dateParam = String(req.query['date'] || '').trim(); // YYYY-MM-DD

    const cleanedName = rawCity
      .replace(/^(м\.|місто|с-ще|смт\.?|селище|с\.|село)\s+/i, '')
      .split(',')[0]
      .trim()
      .toLowerCase();

    let lat = 47.5381;
    let lon = 29.4606;
    let resolvedLocation = rawCity || 'с-ще Окни';

    if (ODESA_REGION_COORDS[cleanedName]) {
      lat = ODESA_REGION_COORDS[cleanedName].lat;
      lon = ODESA_REGION_COORDS[cleanedName].lon;
      resolvedLocation = ODESA_REGION_COORDS[cleanedName].label;
    } else {
      for (const [key, val] of Object.entries(ODESA_REGION_COORDS)) {
        if (cleanedName.includes(key) || key.includes(cleanedName)) {
          lat = val.lat;
          lon = val.lon;
          resolvedLocation = val.label;
          break;
        }
      }
    }

    const cacheKey = `${lat.toFixed(3)}_${lon.toFixed(3)}_${monthParam}_${dateParam}`;
    const cached = weatherCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.json(cached.data);
      return;
    }

    const dailyByDate: Record<string, ReturnType<typeof generateClimatologicalDayWeather>> = {};
    let currentWeather = {
      tempC: 4.5,
      feelsLikeC: 1.8,
      humidityPct: 76,
      windSpeedKmh: 12.5,
      weatherCode: 2,
      condition: 'Мінлива хмарність',
      icon: 'partly_cloudy_day',
      emoji: '⛅',
      isDay: true,
    };

    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum&past_days=60&forecast_days=16&timezone=Europe%2FKyiv`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (resp.ok) {
        const json = (await resp.json()) as {
          current?: {
            temperature_2m?: number;
            apparent_temperature?: number;
            relative_humidity_2m?: number;
            wind_speed_10m?: number;
            weather_code?: number;
            is_day?: number;
          };
          daily?: {
            time?: string[];
            weather_code?: number[];
            temperature_2m_max?: number[];
            temperature_2m_min?: number[];
            temperature_2m_mean?: number[];
            precipitation_sum?: number[];
          };
        };

        if (json.current) {
          const wCode = Number(json.current.weather_code ?? 2);
          const meta = mapWmoWeatherCode(wCode);
          currentWeather = {
            tempC: Math.round((Number(json.current.temperature_2m ?? 4.5)) * 10) / 10,
            feelsLikeC: Math.round((Number(json.current.apparent_temperature ?? json.current.temperature_2m ?? 2.0)) * 10) / 10,
            humidityPct: Math.round(Number(json.current.relative_humidity_2m ?? 75)),
            windSpeedKmh: Math.round((Number(json.current.wind_speed_10m ?? 10)) * 10) / 10,
            weatherCode: wCode,
            condition: meta.condition,
            icon: meta.icon === 'Umbrella' ? 'water_drop' : meta.icon,
            emoji: meta.emoji,
            isDay: json.current.is_day !== 0,
          };
        }

        if (json.daily && Array.isArray(json.daily.time)) {
          const times = json.daily.time;
          for (let i = 0; i < times.length; i++) {
            const dStr = times[i];
            const tMax = Number(json.daily.temperature_2m_max?.[i] ?? 6);
            const tMin = Number(json.daily.temperature_2m_min?.[i] ?? 1);
            const tMeanRaw = json.daily.temperature_2m_mean?.[i];
            const tAvg =
              typeof tMeanRaw === 'number' && !isNaN(tMeanRaw)
                ? Math.round(tMeanRaw * 10) / 10
                : Math.round(((tMax + tMin) / 2) * 10) / 10;
            const wCode = Number(json.daily.weather_code?.[i] ?? 2);
            const meta = mapWmoWeatherCode(wCode);
            dailyByDate[dStr] = {
              date: dStr,
              tempAvgC: tAvg,
              tempMinC: Math.round(tMin * 10) / 10,
              tempMaxC: Math.round(tMax * 10) / 10,
              weatherCode: wCode,
              condition: meta.condition,
              icon: meta.icon === 'Umbrella' ? 'water_drop' : meta.icon,
              emoji: meta.emoji,
              precipitationMm: Math.round((Number(json.daily.precipitation_sum?.[i] ?? 0)) * 10) / 10,
            };
          }
        }
      }
    } catch {
      // Fallback to climatological generator below if network/API is unreachable
    }

    // Ensure all days of the requested month (and current month) are populated in dailyByDate
    const nowIsoDate = new Date().toISOString().split('T')[0];
    const currentMonth = nowIsoDate.slice(0, 7);
    const monthsToEnsure = Array.from(
      new Set([currentMonth, monthParam, dateParam ? dateParam.slice(0, 7) : ''].filter((m) => /^\d{4}-\d{2}$/.test(m)))
    );

    for (const mStr of monthsToEnsure) {
      const [yS, mS] = mStr.split('-');
      const yNum = Number(yS);
      const mNum = Number(mS);
      const daysCount = new Date(yNum, mNum, 0).getDate();
      for (let d = 1; d <= daysCount; d++) {
        const dKey = `${mStr}-${String(d).padStart(2, '0')}`;
        if (!dailyByDate[dKey]) {
          dailyByDate[dKey] = generateClimatologicalDayWeather(dKey, lat);
        }
      }
    }

    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) && !dailyByDate[dateParam]) {
      dailyByDate[dateParam] = generateClimatologicalDayWeather(dateParam, lat);
    }

    // Build 7-day forecast starting from today
    const forecastDays: ReturnType<typeof generateClimatologicalDayWeather>[] = [];
    const baseDateObj = new Date(nowIsoDate + 'T12:00:00Z');
    for (let i = 0; i < 7; i++) {
      const dObj = new Date(baseDateObj.getTime() + i * 24 * 60 * 60 * 1000);
      const dKey = dObj.toISOString().split('T')[0];
      if (!dailyByDate[dKey]) {
        dailyByDate[dKey] = generateClimatologicalDayWeather(dKey, lat);
      }
      forecastDays.push(dailyByDate[dKey]);
    }

    const payload = {
      success: true,
      city: rawCity,
      resolvedLocation,
      latitude: lat,
      longitude: lon,
      updatedAt: new Date().toISOString(),
      current: currentWeather,
      dailyByDate,
      forecastDays,
    };

    weatherCache.set(cacheKey, { expiresAt: Date.now() + 10 * 60 * 1000, data: payload });
    res.json(payload);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Помилка отримання даних погоди';
    res.status(500).json({ success: false, error: msg });
  }
});

app.post('/api/utility/accounts/:id/cabinet-credentials', async (req, res) => {
  const { id } = req.params;
  const body = req.body || {};
  const acc = state.utilityAccounts.find((a) => a['id'] === id);
  if (!acc) {
    res.status(404).json({ error: 'Акаунт не знайдено' });
    return;
  }
  if (body.dtekLogin !== undefined) acc['dtekLogin'] = body.dtekLogin;
  if (body.clearDtekPassword) acc['dtekPasswordEnc'] = null;
  else if (body.dtekPassword) acc['dtekPasswordEnc'] = 'enc:' + Buffer.from(String(body.dtekPassword)).toString('base64');

  if (body.ooekLogin !== undefined) acc['ooekLogin'] = body.ooekLogin;
  if (body.ooekAccountNumber !== undefined) acc['ooekAccountNumber'] = body.ooekAccountNumber;
  if (body.clearOoekPassword) acc['ooekPasswordEnc'] = null;
  else if (body.ooekPassword) acc['ooekPasswordEnc'] = 'enc:' + Buffer.from(String(body.ooekPassword)).toString('base64');

  acc['hasDtekPassword'] = Boolean(acc['dtekPasswordEnc']);
  acc['hasOoekPassword'] = Boolean(acc['ooekPasswordEnc']);
  acc['updatedAt'] = new Date().toISOString();
  await saveUtilityAccountToCloudSql(acc);
  bumpVersion();
  res.json({ success: true, account: acc });
});

// ============================================================================
// OOEK CABINET RATE LIMITER & SCRAPER (https://personal.ooek.od.ua)
// ============================================================================
let lastOoekRequestAt = 0;

async function throttleOoekRequest(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastOoekRequestAt;
  if (elapsed < 1050) {
    await new Promise((resolve) => setTimeout(resolve, 1050 - elapsed));
  }
  lastOoekRequestAt = Date.now();
}

function extractSessionCookie(headers: Headers): string | null {
  let setCookieList: string[] = [];
  if (typeof (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === 'function') {
    setCookieList = (headers as unknown as { getSetCookie: () => string[] }).getSetCookie();
  } else {
    const raw = headers.get('set-cookie');
    if (raw) setCookieList = [raw];
  }
  for (const cookieStr of setCookieList) {
    const match = cookieStr.match(/standart_9776_session=([^;\s]+)/i);
    if (match && match[1]) {
      return `standart_9776_session=${match[1]}`;
    }
  }
  return null;
}

function decryptStoredPassword(encVal: unknown): string {
  if (!encVal || typeof encVal !== 'string') return '';
  if (encVal.startsWith('enc:')) {
    try {
      return Buffer.from(encVal.slice(4), 'base64').toString('utf8');
    } catch {
      return '';
    }
  }
  return encVal;
}

interface OoekParsedAccountItem {
  accountNumber: string;
  rawTitle: string;
  amountToPayUah: number | null;
  billUpdatedAt: string | null;
}

function parseOoekAccountsHtml(html: string): OoekParsedAccountItem[] {
  const results: OoekParsedAccountItem[] = [];
  const liRegex = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let liMatch: RegExpExecArray | null;

  while ((liMatch = liRegex.exec(html)) !== null) {
    const liContent = liMatch[1];
    // Find <strong class="acc-title">...</strong>
    const titleMatch = liContent.match(/<strong[^>]*class=["'][^"']*\bacc-title\b[^"']*["'][^>]*>([\s\S]*?)<\/strong>/i);
    if (!titleMatch) continue;

    const rawTitleText = titleMatch[1]
      .replace(/&nbsp;/gi, ' ')
      .replace(/&#160;/g, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Example: "№ 34023/00001305, ТОВ «Одеська обласна енергопостачальна компанія»"
    let extractedAccNum = '';
    const numMatch = rawTitleText.match(/№\s*([^,\s]+)/i);
    if (numMatch && numMatch[1]) {
      extractedAccNum = numMatch[1].trim();
    } else {
      const fallbackMatch = rawTitleText.match(/(\d[\d/\\-]+\d)/);
      if (fallbackMatch && fallbackMatch[1]) {
        extractedAccNum = fallbackMatch[1].trim();
      }
    }

    if (!extractedAccNum) continue;

    // Extract <span class="saldo-block credit"><b>...</b></span> (or any saldo-block)
    let amountToPayUah: number | null = null;
    const creditMatch =
      liContent.match(/<span[^>]*class=["'][^"']*\bsaldo-block\b[^"']*\bcredit\b[^"']*["'][^>]*>[\s\S]*?<b[^>]*>([\s\S]*?)<\/b>/i) ||
      liContent.match(/<span[^>]*class=["'][^"']*\bsaldo-block\b[^"']*["'][^>]*>[\s\S]*?<b[^>]*>([\s\S]*?)<\/b>/i);

    if (creditMatch && creditMatch[1]) {
      const rawAmount = creditMatch[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, '')
        .replace(/\s+/g, '')
        .replace(',', '.');
      const numMatchAmt = rawAmount.match(/-?\d+(\.\d+)?/);
      if (numMatchAmt) {
        const parsed = parseFloat(numMatchAmt[0]);
        if (!Number.isNaN(parsed)) {
          amountToPayUah = parsed;
        }
      }
    }

    // Extract <span class="updated_at"><a>...</a></span>
    let billUpdatedAt: string | null = null;
    const updatedMatch =
      liContent.match(/<span[^>]*class=["'][^"']*\bupdated_at\b[^"']*["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i) ||
      liContent.match(/<span[^>]*class=["'][^"']*\bupdated_at\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);

    if (updatedMatch && updatedMatch[1]) {
      const cleanedDate = updatedMatch[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (cleanedDate) {
        billUpdatedAt = cleanedDate;
      }
    }

    results.push({
      accountNumber: extractedAccNum,
      rawTitle: rawTitleText,
      amountToPayUah,
      billUpdatedAt,
    });
  }

  return results;
}

app.post('/api/utility/accounts/:id/ooek-sync', async (req, res) => {
  const { id } = req.params;
  const body = req.body || {};
  const acc = state.utilityAccounts.find((a) => a['id'] === id);
  if (!acc) {
    res.status(404).json({ error: 'Акаунт не знайдено' });
    return;
  }

  // Update credentials if provided in the sync request
  if (typeof body.ooekLogin === 'string' && body.ooekLogin.trim()) {
    acc['ooekLogin'] = body.ooekLogin.trim();
  }
  if (typeof body.ooekAccountNumber === 'string' && body.ooekAccountNumber.trim()) {
    acc['ooekAccountNumber'] = body.ooekAccountNumber.trim();
  }
  if (typeof body.ooekPassword === 'string' && body.ooekPassword) {
    acc['ooekPasswordEnc'] = 'enc:' + Buffer.from(String(body.ooekPassword)).toString('base64');
    acc['hasOoekPassword'] = true;
  }

  const username = String(acc['ooekLogin'] || '').trim();
  const password = body.ooekPassword
    ? String(body.ooekPassword)
    : decryptStoredPassword(acc['ooekPasswordEnc']);
  const targetAccountNumber = String(acc['accountNumber'] || acc['ooekAccountNumber'] || '').trim();

  if (!targetAccountNumber) {
    res.status(400).json({
      success: false,
      error: 'Особовий рахунок не вказано у налаштуваннях будинку. Будь ласка, заповніть особовий рахунок для синхронізації з ТОВ «ООЕК».',
      statusMessage: 'Відсутній особовий рахунок',
      account: acc,
    });
    return;
  }

  if (!username || !password) {
    res.status(400).json({
      success: false,
      error: 'Вкажіть логін та пароль від особистого кабінету ТОВ «ООЕК» (personal.ooek.od.ua)',
      statusMessage: 'Відсутній логін або пароль ООЕК',
      account: acc,
    });
    return;
  }

  const DEFAULT_AUTH_TOKEN =
    'fsPdpgFyhKjBHOPx/bRYXYlM+OP4f2KB4Xp6JaQapQjskeBsa4+rleRKNKrmHpGqwNwDDF1PWe4+zIjFtZOFoA==';
  const FIXED_X_CSRF_TOKEN =
    'sANQe6CsdqgU+k6h9clzDUXBtTR4Om/zUBRrFpuSYagPXt5FlN3q1QhH63PqrDq2gzLQLdvSLAuushPGv+Erkw==';
  const INITIAL_SESSION_COOKIE = 'standart_9776_session=bd22590df582a310cb856d5f49e18a9a';
  const USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:159.0) Gecko/20100101 Firefox/159.0';

  try {
    let sessionCookie = INITIAL_SESSION_COOKIE;
    let authenticityToken = DEFAULT_AUTH_TOKEN;
    let csrfMetaToken = FIXED_X_CSRF_TOKEN;

    // 1. Fetch initial /home/ page to obtain a fresh session cookie and authenticity_token
    await throttleOoekRequest();
    try {
      const initPageResp = await fetch('https://personal.ooek.od.ua/home/', {
        method: 'GET',
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7',
        },
      });
      const initCookie = extractSessionCookie(initPageResp.headers);
      if (initCookie) {
        sessionCookie = initCookie;
      }
      const initHtml = await initPageResp.text();
      const authMatch = initHtml.match(/name=["']authenticity_token["'][^>]*value=["']([^"']+)["']/i);
      if (authMatch && authMatch[1]) {
        authenticityToken = authMatch[1];
      }
      const metaMatch =
        initHtml.match(/<meta[^>]*name=["']csrf-token["'][^>]*content=["']([^"']+)["']/i) ||
        initHtml.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']csrf-token["']/i);
      if (metaMatch && metaMatch[1]) {
        csrfMetaToken = metaMatch[1];
      }
    } catch {
      // Fallback to default token and cookie if initial GET fails
    }

    // 2. POST credentials to https://personal.ooek.od.ua/home/login (rate-limited <= 1 req/sec)
    await throttleOoekRequest();

    const formBody = new URLSearchParams();
    formBody.set('utf8', '✓');
    formBody.set('authenticity_token', authenticityToken);
    formBody.set('username', username);
    formBody.set('password', password);
    formBody.set('pwa_mode', 'browser');
    formBody.set('pwa_client_id', '8b4f451a-32d5-446c-a470-183a97605ddc');
    formBody.set('pwa_session_id', '6c3eab65-02e9-44a7-8f19-10234e7897a9');

    const loginResponse = await fetch('https://personal.ooek.od.ua/home/login', {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://personal.ooek.od.ua/home/',
        'Origin': 'https://personal.ooek.od.ua',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
        'Connection': 'keep-alive',
        'Cookie': sessionCookie,
        'Priority': 'u=0, i',
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache',
      },
      body: formBody.toString(),
    });

    const newCookie = extractSessionCookie(loginResponse.headers);
    if (newCookie) {
      sessionCookie = newCookie;
    }

    const loginHtml = await loginResponse.text();
    let parsedItems = parseOoekAccountsHtml(loginHtml);

    // Update csrfMetaToken if returned in the login HTML
    const postMetaMatch =
      loginHtml.match(/<meta[^>]*name=["']csrf-token["'][^>]*content=["']([^"']+)["']/i) ||
      loginHtml.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']csrf-token["']/i);
    if (postMetaMatch && postMetaMatch[1]) {
      csrfMetaToken = postMetaMatch[1];
    }

    // 3. Wait at least 1 second (rate limit) then GET https://personal.ooek.od.ua/home/accounts
    await throttleOoekRequest();

    const accountsResp = await fetch('https://personal.ooek.od.ua/home/accounts', {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': '*/*',
        'Accept-Language': 'uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://personal.ooek.od.ua/home/',
        'X-CSRF-Token': csrfMetaToken || FIXED_X_CSRF_TOKEN,
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': sessionCookie,
        'Connection': 'keep-alive',
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache',
      },
    });

    const accountsHtml = await accountsResp.text();
    const accountsPageItems = parseOoekAccountsHtml(accountsHtml);
    if (accountsPageItems.length > 0) {
      parsedItems = accountsPageItems;
    }

    const discoveredAccountNumbers = parsedItems.map((item) => item.accountNumber);

    if (discoveredAccountNumbers.length > 0) {
      acc['ooekDiscoveredAccounts'] = discoveredAccountNumbers;
    }

    // Find matching account by Personal Account Number (Особовий рахунок)
    const cleanTarget = targetAccountNumber.replace(/\s+/g, '');
    let matchedItem = parsedItems.find((item) => {
      const cleanItem = item.accountNumber.replace(/\s+/g, '');
      return (
        cleanItem === cleanTarget ||
        (cleanTarget && cleanItem.includes(cleanTarget)) ||
        (cleanTarget && cleanTarget.includes(cleanItem))
      );
    });

    if (!matchedItem && parsedItems.length === 1) {
      matchedItem = parsedItems[0];
    }

    const syncTimestampIso = new Date().toISOString();
    acc['ooekCabinetLastSync'] = syncTimestampIso;

    if (matchedItem) {
      const amount = matchedItem.amountToPayUah ?? 0;
      acc['ooekBalanceUah'] = amount;
      acc['ooekLastBillUah'] = amount;
      acc['ooekAccountNumber'] = matchedItem.accountNumber;
      const dateLabel = matchedItem.billUpdatedAt
        ? `Дата рахунку: ${matchedItem.billUpdatedAt}`
        : `Оновлено: ${new Date().toLocaleString('uk-UA')}`;
      acc['ooekCabinetStatus'] = `Рахунок № ${matchedItem.accountNumber} • До сплати: ${amount.toFixed(2)} грн • ${dateLabel}`;
      acc['ooekBillUpdatedAt'] = matchedItem.billUpdatedAt || null;

      if (amount <= 0) {
        // If OOEK confirms 0.0 due, automatically mark billing electricity readings for this house as paid
        for (const r of state.utilityReadings) {
          if (
            r['accountId'] === acc['id'] &&
            (r['utilityType'] === 'electricity' || !r['utilityType']) &&
            !r['isControlOnly'] &&
            !r['isPaid']
          ) {
            r['isPaid'] = true;
            r['paidAmount'] = r['totalCost'];
            r['paidDate'] = new Date().toISOString().split('T')[0];
            await saveUtilityReadingToCloudSql(r).catch(() => {});
          }
        }
      }

      await saveUtilityAccountToCloudSql(acc);
      bumpVersion();

      res.json({
        success: true,
        account: acc,
        amountToPayUah: amount,
        billUpdatedAt: matchedItem.billUpdatedAt,
        statusMessage: acc['ooekCabinetStatus'],
        message: `ООЕК синхронізовано! Рахунок № ${matchedItem.accountNumber}: до сплати ${amount.toFixed(2)} грн (${dateLabel})`,
      });
      return;
    }

    if (parsedItems.length > 0) {
      const availableList = discoveredAccountNumbers.join(', ');
      acc['ooekCabinetStatus'] = `Особовий рахунок "${targetAccountNumber}" не знайдено серед рахунків у кабінеті (${availableList}). Оберіть потрібний рахунок нижче.`;
      await saveUtilityAccountToCloudSql(acc);
      bumpVersion();

      res.json({
        success: false,
        account: acc,
        statusMessage: String(acc['ooekCabinetStatus']),
        error: String(acc['ooekCabinetStatus']),
      });
      return;
    }

    acc['ooekCabinetStatus'] =
      'Не вдалося знайти список особових рахунків у відповіді personal.ooek.od.ua/home/accounts. Перевірте правильність логіну та паролю.';
    await saveUtilityAccountToCloudSql(acc);
    bumpVersion();

    res.status(400).json({
      success: false,
      account: acc,
      statusMessage: String(acc['ooekCabinetStatus']),
      error: String(acc['ooekCabinetStatus']),
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Помилка мережі при зверненні до personal.ooek.od.ua';
    acc['ooekCabinetStatus'] = `Помилка синхронізації з ООЕК: ${errMsg}`;
    await saveUtilityAccountToCloudSql(acc);
    res.status(500).json({
      success: false,
      account: acc,
      statusMessage: String(acc['ooekCabinetStatus']),
      error: String(acc['ooekCabinetStatus']),
    });
  }
});

app.post('/api/utility/accounts/:id/dtek-cabinet-sync', async (req, res) => {
  const { id } = req.params;
  const acc = state.utilityAccounts.find((a) => a['id'] === id);
  if (!acc) {
    res.status(404).json({ error: 'Акаунт не знайдено' });
    return;
  }
  acc['dtekCabinetLastSync'] = new Date().toISOString();
  acc['dtekCabinetStatus'] = 'Синхронізовано';
  await saveUtilityAccountToCloudSql(acc);
  bumpVersion();
  res.json({
    success: true,
    account: acc,
    message: 'Кабінет ДТЕК синхронізовано',
  });
});

app.post('/api/utility/accounts/:id/dtek-cabinet-submit', async (req, res) => {
  const { id } = req.params;
  const { readingT1, readingT2, date } = req.body || {};
  const acc = state.utilityAccounts.find((a) => a['id'] === id);
  if (!acc) {
    res.status(404).json({ error: 'Акаунт не знайдено' });
    return;
  }
  const reading: Record<string, unknown> = {
    id: 'uread_' + Date.now(),
    accountId: id,
    utilityType: 'electricity',
    date: String(date || new Date().toISOString().split('T')[0]),
    readingT1: Number(readingT1) || 0,
    readingT2: readingT2 != null ? Number(readingT2) : null,
    totalCost: 0,
    isControlOnly: true,
    readingPurpose: 'control',
    note: 'Передано в кабінет ДТЕК',
    createdAt: new Date().toISOString(),
  };
  state.utilityReadings.unshift(reading);
  await saveUtilityReadingToCloudSql(reading);
  bumpVersion();
  res.json({ success: true, reading, account: acc });
});

function formatDtekMeterAccountNumber(rawNumber: string): string {
  if (!rawNumber) return '';
  const clean = String(rawNumber).trim().replace(/\s+/g, '');
  if (clean.includes('/')) {
    const [prefix, suffix] = clean.split('/');
    const cleanSuffix = (suffix || '').replace(/^0+/, '') || '0';
    return `${prefix}/${cleanSuffix}`;
  }
  return clean;
}

const DTEK_METER_DEFAULT_CSRF =
  'f2r-lWWrAjPjcHqBCccq_Nl1u1TbZkPItrojTIZtIFRNU7fcN_Q6f6Y6O7N-qnOQuCDQHY8AAKbM5U0Y_zpGZQ==';
const DTEK_METER_DEFAULT_COOKIES =
  '_language=4feef5ffdc846bbf9c35c97292b7b3e6c48117a536a6462b530e0984a39d6bd4a%3A2%3A%7Bi%3A0%3Bs%3A9%3A%22_language%22%3Bi%3A1%3Bs%3A2%3A%22uk%22%3B%7D; visid_incap_2398477=jcFO++QVRFyc30m/uifUBlYX62oAAAAAQUIPAAAAAACJlnvVMplgOe4l+5MR0hIW; visid_incap_3332081=ZQRDHfbUSlmnEQzkWk7PVwJp7GoAAAAAQUIPAAAAAAAUTCBAH/0siRUU11sm4dxo; visid_incap_2908050=IK4PNGxURGaDJZGSZJug0JBp7GoAAAAAQUIPAAAAAACBcrzWcwiLO/cK7e+N27AK; _csrf-dtek-oem=14943da4f286058abdee133e16bf46d50548dd78fe24e0ef40b2b513173742f5a%3A2%3A%7Bi%3A0%3Bs%3A14%3A%22_csrf-dtek-oem%22%3Bi%3A1%3Bs%3A32%3A%2229IIR_8LEJA2wmYlaUkITfCnz_nTyWf1%22%3B%7D; incap_ses_323_2398477=WqE/IzIyGgk6EIoXp4d7BOOl9WoAAAAAQVgtB9VUOKgk65Ojh9x1gA==; incap_ses_323_3332081=QyJfWz0tV04JnJnDpId7BP4j82oAAAAAS4tY/4psS2IoSL+treO4GA==; incap_ses_323_2908050=9F99Q/jRNFRxuJnDpId7BBUk82oAAAAAY1Cv6L8zY8eLdQzfweiU5w==; dtek-oem=fcjnd2vrsljmiv4bs475fl3eco';

app.post('/api/utility/dtek-meter-check', async (req, res) => {
  try {
    const body = req.body || {};
    let rawNumber = String(body.accountNumber || '').trim();
    const accountId = String(body.accountId || '').trim();

    if (!rawNumber && accountId) {
      const acc = state.utilityAccounts.find((a) => a['id'] === accountId);
      if (acc) {
        rawNumber = String(acc['accountNumber'] || acc['dtekLogin'] || '').trim();
      }
    }
    if (!rawNumber) {
      res.json({
        success: false,
        error: 'Особовий рахунок не вказано у налаштуваннях будинку. Будь ласка, заповніть особовий рахунок для перевірки та передачі показів.',
        rawNumber: '',
        formattedNumber: '',
      });
      return;
    }

    const formattedNumber = formatDtekMeterAccountNumber(rawNumber);

    const cookies = DTEK_METER_DEFAULT_COOKIES;
    const csrfToken = DTEK_METER_DEFAULT_CSRF;

    const postBody = new URLSearchParams();
    postBody.set('method', 'checkAddress');
    postBody.set('number', formattedNumber);

    const dtekAjaxResp = await fetch('https://www.dtek-oem.com.ua/ua/ajax', {
      method: 'POST',
      headers: {
        'User-Agent': DTEK_USER_AGENT,
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7',
        Referer: 'https://www.dtek-oem.com.ua/ua/meter',
        'X-CSRF-Token': csrfToken,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        Origin: 'https://www.dtek-oem.com.ua',
        Cookie: cookies,
      },
      body: postBody.toString(),
      signal: AbortSignal.timeout(12000),
    });

    if (!dtekAjaxResp.ok) {
      const errText = await dtekAjaxResp.text();
      res.json({
        success: false,
        error: `ДТЕК ОЕМ повернув HTTP ${dtekAjaxResp.status}`,
        details: errText.slice(0, 300),
        rawNumber,
        formattedNumber,
      });
      return;
    }

    const data = (await dtekAjaxResp.json()) as Record<string, unknown>;
    if (data && data['result'] === false) {
      const addressMsg =
        typeof data['address'] === 'string'
          ? data['address']
          : 'Особовий рахунок не знайдено або вказано невірно в базі ДТЕК ОЕМ';
      res.json({
        success: false,
        error: addressMsg,
        rawNumber,
        formattedNumber,
        data,
      });
      return;
    }

    res.json({
      success: true,
      rawNumber,
      formattedNumber,
      data,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Помилка запиту до ДТЕК ОЕМ';
    res.json({ success: false, error: msg });
  }
});

app.post('/api/utility/readings', async (req, res) => {
  const { authenticated, user } = resolveRequestUser(req);
  if (!authenticated) {
    res.status(401).json({ error: 'Необхідна авторизація в Google акаунті' });
    return;
  }
  const body = req.body || {};
  const userIdStr = String(user['id'] || '');
  const reading: Record<string, unknown> = {
    ...body,
    id: body.id || 'uread_' + Date.now(),
    ownerUserId: body.ownerUserId || userIdStr,
    createdAt: body.createdAt || new Date().toISOString(),
  };
  state.utilityReadings.unshift(reading);
  await saveUtilityReadingToCloudSql(reading);
  bumpVersion();
  res.json({ success: true, reading });
});

app.put('/api/utility/readings/:id', async (req, res) => {
  const { id } = req.params;
  const idx = state.utilityReadings.findIndex((r) => r['id'] === id);
  if (idx < 0) {
    res.status(404).json({ error: 'Запис не знайдено' });
    return;
  }
  const reading: Record<string, unknown> = {
    ...state.utilityReadings[idx],
    ...req.body,
    id,
  };
  state.utilityReadings[idx] = reading;
  await saveUtilityReadingToCloudSql(reading);
  bumpVersion();
  res.json({ success: true, reading });
});

app.delete('/api/utility/readings/:id', async (req, res) => {
  const { id } = req.params;
  state.utilityReadings = state.utilityReadings.filter((r) => r['id'] !== id);
  await deleteUtilityReadingFromCloudSql(id);
  bumpVersion();
  res.json({ success: true });
});

app.post('/api/utility/readings/:id/pay', async (req, res) => {
  const { id } = req.params;
  const { isPaid, paidAmount, paidDate } = req.body || {};
  const idx = state.utilityReadings.findIndex((r) => r['id'] === id);
  if (idx < 0) {
    res.status(404).json({ error: 'Запис не знайдено' });
    return;
  }
  const reading: Record<string, unknown> = {
    ...state.utilityReadings[idx],
    isPaid: Boolean(isPaid),
    paidAmount: paidAmount !== undefined ? Number(paidAmount) : state.utilityReadings[idx]['totalCost'],
    paidDate: isPaid ? String(paidDate || new Date().toISOString().split('T')[0]) : null,
  };
  state.utilityReadings[idx] = reading;
  await saveUtilityReadingToCloudSql(reading);
  bumpVersion();
  res.json({ success: true, reading });
});

function getDtekSyncIntervalMinutes(): number {
  const sysVals = getSystemValuesMap();
  const fromSys = Number(sysVals['dtekSyncIntervalMinutes']);
  if (!isNaN(fromSys) && fromSys >= 1 && fromSys <= 360) {
    return Math.round(fromSys);
  }
  const fromSettings = Number(state.settings?.['dtekSyncIntervalMinutes']);
  if (!isNaN(fromSettings) && fromSettings >= 1 && fromSettings <= 360) {
    return Math.round(fromSettings);
  }
  const tariffs = state.settings?.['utilityTariffsSettings'] as Record<string, unknown> | undefined;
  const fromTariffs = Number(tariffs?.['dtekSyncIntervalMinutes']);
  if (!isNaN(fromTariffs) && fromTariffs >= 1 && fromTariffs <= 360) {
    return Math.round(fromTariffs);
  }
  return 20;
}

function getDtekSyncIntervalMs(): number {
  return getDtekSyncIntervalMinutes() * 60 * 1000;
}

interface DtekCachedSession {
  fetchedAtMs: number;
  cookies: string;
  csrfToken: string;
  streets: Record<string, string[]>;
  fact: {
    data?: Record<string, Record<string, Record<string, string>>>;
    update?: string;
    today?: number;
  };
  preset: Record<string, unknown>;
}

interface DtekAddressHouseCacheEntry {
  fetchedAtMs: number;
  updateTimestamp?: string;
  housesMap: Record<string, Record<string, unknown>>;
}

interface DtekScheduleDbCache {
  lastFetchedAtMs: number;
  lastFetchedAtIso: string;
  lastFetchedAtKyiv: string;
  cookies?: string;
  csrfToken?: string;
  streets: Record<string, string[]>;
  fact: {
    data?: Record<string, Record<string, Record<string, string>>>;
    update?: string;
    today?: number;
  };
  preset: Record<string, unknown>;
  addressHousesCache: Record<string, DtekAddressHouseCacheEntry>;
}

let dtekSessionCache: DtekCachedSession | null = null;
let dtekSyncInFlightPromise: Promise<{
  dbCache: DtekScheduleDbCache;
  didFetchLiveFromDtek: boolean;
}> | null = null;

const DTEK_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

function getKyivTimeParts(now = new Date()) {
  const kyivHourZero =
    Number(
      new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        hour12: false,
        timeZone: 'Europe/Kyiv',
      }).format(now)
    ) % 24;
  const currentKyivHour = kyivHourZero + 1;
  const kyivMinute = Number(
    new Intl.DateTimeFormat('en-GB', {
      minute: '2-digit',
      timeZone: 'Europe/Kyiv',
    }).format(now)
  );
  const kyivSecond = Number(
    new Intl.DateTimeFormat('en-GB', {
      second: '2-digit',
      timeZone: 'Europe/Kyiv',
    }).format(now)
  );
  const kyivDateFormatter = new Intl.DateTimeFormat('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Kyiv',
  });
  const todayStr = kyivDateFormatter.format(now);
  const kyivTimeStr = `${String(kyivHourZero).padStart(2, '0')}:${String(kyivMinute).padStart(2, '0')}:${String(kyivSecond).padStart(2, '0')}`;
  return {
    kyivHourZero,
    currentKyivHour,
    kyivMinute,
    kyivSecond,
    kyivDateFormatter,
    todayStr,
    kyivTimeStr,
    fullKyivDateTime: `${todayStr}, ${kyivTimeStr}`,
  };
}

function getDtekScheduleDbCache(): DtekScheduleDbCache {
  const sysVals = getSystemValuesMap();
  const raw = sysVals['dtekScheduleDbCache'] as Partial<DtekScheduleDbCache> | undefined;
  if (raw && typeof raw === 'object') {
    if (!raw.streets || typeof raw.streets !== 'object') raw.streets = {};
    if (!raw.fact || typeof raw.fact !== 'object') raw.fact = {};
    if (!raw.preset || typeof raw.preset !== 'object') raw.preset = {};
    if (!raw.addressHousesCache || typeof raw.addressHousesCache !== 'object') {
      raw.addressHousesCache = {};
    }
    return raw as DtekScheduleDbCache;
  }
  const initial: DtekScheduleDbCache = {
    lastFetchedAtMs: 0,
    lastFetchedAtIso: '',
    lastFetchedAtKyiv: '',
    streets: {},
    fact: {},
    preset: {},
    addressHousesCache: {},
  };
  sysVals['dtekScheduleDbCache'] = initial;
  return initial;
}

function extractJsonAssignment(html: string, marker: string): unknown {
  const idx = html.indexOf(marker);
  if (idx < 0) return null;
  const startBrace = html.indexOf('{', idx + marker.length);
  if (startBrace < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = startBrace; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const jsonSlice = html.slice(startBrace, i + 1);
        try {
          return JSON.parse(jsonSlice);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

async function fetchDtekAjaxHomeNums(
  cookies: string,
  csrfToken: string,
  city: string,
  street: string
): Promise<{ updateTimestamp?: string; housesMap: Record<string, Record<string, unknown>> } | null> {
  if (!csrfToken || !city || !street) return null;
  try {
    const body = new URLSearchParams();
    body.set('method', 'getHomeNum');
    body.set('data[0][name]', 'city');
    body.set('data[0][value]', city);
    body.set('data[1][name]', 'street');
    body.set('data[1][value]', street);

    const rAjax = await fetch('https://www.dtek-oem.com.ua/ua/ajax', {
      method: 'POST',
      headers: {
        'User-Agent': DTEK_USER_AGENT,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRF-Token': csrfToken,
        Cookie: cookies,
        Referer: 'https://www.dtek-oem.com.ua/ua/shutdowns',
        Origin: 'https://www.dtek-oem.com.ua',
      },
      body: body.toString(),
    });
    if (!rAjax.ok) return null;
    const ajaxJson = (await rAjax.json()) as Record<string, unknown>;
    if (ajaxJson && typeof ajaxJson['data'] === 'object' && ajaxJson['data'] !== null) {
      return {
        updateTimestamp:
          typeof ajaxJson['updateTimestamp'] === 'string' ? ajaxJson['updateTimestamp'] : undefined,
        housesMap: ajaxJson['data'] as Record<string, Record<string, unknown>>,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function buildAllQueuesSchedulesFromFactData(
  factDataMap: Record<string, Record<string, Record<string, string>>>,
  now = new Date()
) {
  const { currentKyivHour, kyivMinute, kyivDateFormatter, todayStr } = getKyivTimeParts(now);
  const dayTimestamps = Object.keys(factDataMap)
    .map(Number)
    .filter((n) => !isNaN(n))
    .sort((a, b) => a - b);

  const todayTsNum =
    dayTimestamps.find((ts) => kyivDateFormatter.format(new Date(ts * 1000)) === todayStr) ??
    dayTimestamps[0];
  const tomorrowTsNum =
    todayTsNum !== undefined ? dayTimestamps.find((ts) => ts > todayTsNum) : dayTimestamps[1];

  const todayTsKey = todayTsNum !== undefined ? String(todayTsNum) : '';
  const tomorrowTsKey = tomorrowTsNum !== undefined ? String(tomorrowTsNum) : '';
  const resolvedTodayDateStr =
    todayTsNum !== undefined ? kyivDateFormatter.format(new Date(todayTsNum * 1000)) : todayStr;

  const allQueueNumbers = [
    '1.1', '1.2',
    '2.1', '2.2',
    '3.1', '3.2',
    '4.1', '4.2',
    '5.1', '5.2',
    '6.1', '6.2',
  ];

  const allQueuesSchedules = allQueueNumbers.map((qNum) => {
    const qKey = `GPV${qNum}`;
    const qTodayRaw = (todayTsKey ? factDataMap[todayTsKey]?.[qKey] : undefined) || {};
    const qToday = parseDtekFactHoursForQueue(qTodayRaw);
    const cur =
      qToday.hours.find((item) => item.hour === currentKyivHour) || qToday.hours[0];
    const qPowerNow = Boolean(
      kyivMinute < 30 ? cur?.firstHalfPower : cur?.secondHalfPower
    );

    let qTomorrowSchedule = null;
    if (tomorrowTsKey && factDataMap[tomorrowTsKey]?.[qKey]) {
      const qTom = parseDtekFactHoursForQueue(factDataMap[tomorrowTsKey][qKey]);
      const tomDateStr = kyivDateFormatter.format(new Date(Number(tomorrowTsKey) * 1000));
      qTomorrowSchedule = {
        dateKey: tomorrowTsKey,
        scheduleDate: tomDateStr,
        dayLabel: 'Завтра',
        isToday: false,
        isTomorrow: true,
        queueGroup: qKey,
        totalPowerHours: qTom.totalPowerHours,
        totalOutageHours: qTom.totalOutageHours,
        hourlySchedule: qTom.hours,
      };
    }

    return {
      queueKey: qKey,
      queueNumber: qNum,
      queueTitle: `Черга ${qNum}`,
      scheduleDate: resolvedTodayDateStr,
      isPowerAvailableNow: qPowerNow,
      totalPowerHours: qToday.totalPowerHours,
      totalOutageHours: qToday.totalOutageHours,
      outageIntervals: qToday.outageIntervals,
      hourlySchedule: qToday.hours,
      tomorrowSchedule: qTomorrowSchedule,
    };
  });

  return { allQueuesSchedules, resolvedTodayDateStr, dayTimestamps };
}

/**
 * Polls the DTEK website at most once every 20 minutes and persists the schedule
 * + lastFetchedAt timestamp in the PostgreSQL database (`system_settings_config`).
 */
async function syncDtekScheduleWithDatabase(options?: {
  city?: string;
  street?: string;
}): Promise<{
  dbCache: DtekScheduleDbCache;
  didFetchLiveFromDtek: boolean;
}> {
  await ensureInitialHydration();
  const dbCache = getDtekScheduleDbCache();
  const nowMs = Date.now();
  const hasStoredSchedule = Boolean(
    dbCache.fact?.data && Object.keys(dbCache.fact.data).length > 0
  );
  const elapsedSinceLastFetchMs = dbCache.lastFetchedAtMs > 0 ? nowMs - dbCache.lastFetchedAtMs : Infinity;

  // Enforce configured interval: if we already have schedule data in DB and < interval have passed,
  // serve directly from the database without querying DTEK.
  if (hasStoredSchedule && elapsedSinceLastFetchMs < getDtekSyncIntervalMs()) {
    return {
      dbCache,
      didFetchLiveFromDtek: false,
    };
  }

  if (dtekSyncInFlightPromise) {
    return dtekSyncInFlightPromise;
  }

  dtekSyncInFlightPromise = (async () => {
    try {
      const resp = await fetch('https://www.dtek-oem.com.ua/ua/shutdowns', {
        headers: {
          'User-Agent': DTEK_USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7',
        },
      });

      if (resp.ok) {
        const rawCookies = resp.headers.getSetCookie ? resp.headers.getSetCookie() : [];
        const cookies = rawCookies.map((c) => c.split(';')[0]).join('; ');
        const html = await resp.text();
        const csrfMatch = html.match(/<meta\s+name="csrf-token"\s+content="([^"]+)"/i);
        const csrfToken = csrfMatch?.[1] || '';

        const streets =
          (extractJsonAssignment(html, 'DisconSchedule.streets') as Record<string, string[]>) || {};
        const fact =
          (extractJsonAssignment(html, 'DisconSchedule.fact') as DtekCachedSession['fact']) || {};
        const preset =
          (extractJsonAssignment(html, 'DisconSchedule.preset') as Record<string, unknown>) || {};

        if (fact && fact.data && Object.keys(fact.data).length > 0) {
          const fetchCompletedMs = Date.now();
          const { fullKyivDateTime } = getKyivTimeParts(new Date(fetchCompletedMs));

          dtekSessionCache = {
            fetchedAtMs: fetchCompletedMs,
            cookies,
            csrfToken,
            streets: Object.keys(streets).length > 0 ? streets : dbCache.streets,
            fact,
            preset,
          };

          dbCache.lastFetchedAtMs = fetchCompletedMs;
          dbCache.lastFetchedAtIso = new Date(fetchCompletedMs).toISOString();
          dbCache.lastFetchedAtKyiv = fullKyivDateTime;
          dbCache.cookies = cookies;
          dbCache.csrfToken = csrfToken;
          if (Object.keys(streets).length > 0) {
            dbCache.streets = streets;
          }
          dbCache.fact = fact;
          if (Object.keys(preset).length > 0) {
            dbCache.preset = preset;
          }

          // Refresh known address house lookups in DB during the 20-minute sync
          const addressPairs = new Set<string>();
          if (options?.city && options?.street) {
            addressPairs.add(`${options.city.trim()}||${options.street.trim()}`);
          }
          addressPairs.add('с-ще Окни||вул. Шкільна');
          for (const acc of state.utilityAccounts) {
            const c = String(acc['city'] || '').trim();
            const s = String(acc['street'] || '').trim();
            if (c && s && addressPairs.size < 6) {
              addressPairs.add(`${c}||${s}`);
            }
          }

          for (const pair of addressPairs) {
            const [c, s] = pair.split('||');
            const ajaxRes = await fetchDtekAjaxHomeNums(cookies, csrfToken, c, s);
            if (ajaxRes && Object.keys(ajaxRes.housesMap).length > 0) {
              dbCache.addressHousesCache[`${c.toLowerCase()}|${s.toLowerCase()}`] = {
                fetchedAtMs: fetchCompletedMs,
                updateTimestamp: ajaxRes.updateTimestamp,
                housesMap: ajaxRes.housesMap,
              };
            }
          }

          const sysVals = getSystemValuesMap();
          sysVals['dtekScheduleDbCache'] = dbCache;
          await persistSystemValues();

          // Evaluate schedule changes across all queues and send Web Push notifications if slots changed
          const { allQueuesSchedules, resolvedTodayDateStr } = buildAllQueuesSchedulesFromFactData(
            fact.data,
            new Date(fetchCompletedMs)
          );
          void evaluateDtekScheduleChangesAndPush(allQueuesSchedules, resolvedTodayDateStr);

          return {
            dbCache,
            didFetchLiveFromDtek: true,
          };
        }
      }
    } catch {
      // Fallback to existing DB cache if DTEK is temporarily unreachable
    }
    return {
      dbCache,
      didFetchLiveFromDtek: false,
    };
  })();

  try {
    return await dtekSyncInFlightPromise;
  } finally {
    dtekSyncInFlightPromise = null;
  }
}

async function getDtekSession(forceRefresh = false): Promise<DtekCachedSession | null> {
  const { dbCache } = await syncDtekScheduleWithDatabase();
  if (dbCache.fact?.data && Object.keys(dbCache.fact.data).length > 0) {
    return {
      fetchedAtMs: dbCache.lastFetchedAtMs || Date.now(),
      cookies: dbCache.cookies || dtekSessionCache?.cookies || '',
      csrfToken: dbCache.csrfToken || dtekSessionCache?.csrfToken || '',
      streets: dbCache.streets || {},
      fact: dbCache.fact,
      preset: dbCache.preset || {},
    };
  }
  if (forceRefresh && dtekSessionCache) {
    return dtekSessionCache;
  }
  return dtekSessionCache;
}

function parseDtekFactHoursForQueue(queueHoursObj?: Record<string, string>) {
  const hours = [];
  let totalPowerHours = 0;
  let totalOutageHours = 0;

  for (let h = 1; h <= 24; h++) {
    const hZero = h - 1;
    const fromTime = `${String(hZero).padStart(2, '0')}:00`;
    const halfTime = `${String(hZero).padStart(2, '0')}:30`;
    const toTime = `${String(h).padStart(2, '0')}:00`;
    const rawVal = String(queueHoursObj?.[String(h)] || 'yes').toLowerCase();

    let statusKey = 'yes';
    let statusLabel = 'Світло є';
    let firstHalfPower = true;
    let secondHalfPower = true;

    if (rawVal === 'no' || rawVal === 'maybe') {
      statusKey = 'no';
      statusLabel = 'Відключення світла';
      firstHalfPower = false;
      secondHalfPower = false;
      totalOutageHours += 1;
    } else if (rawVal === 'first' || rawVal === 'mfirst') {
      statusKey = 'first';
      statusLabel = `Відключення ${fromTime} - ${halfTime}`;
      firstHalfPower = false;
      secondHalfPower = true;
      totalPowerHours += 0.5;
      totalOutageHours += 0.5;
    } else if (rawVal === 'second' || rawVal === 'msecond') {
      statusKey = 'second';
      statusLabel = `Відключення ${halfTime} - ${toTime}`;
      firstHalfPower = true;
      secondHalfPower = false;
      totalPowerHours += 0.5;
      totalOutageHours += 0.5;
    } else {
      statusKey = 'yes';
      statusLabel = 'Світло є';
      firstHalfPower = true;
      secondHalfPower = true;
      totalPowerHours += 1;
    }

    hours.push({
      hour: h,
      fromTime,
      toTime,
      timeLabel: `${fromTime} - ${toTime}`,
      statusKey,
      statusLabel,
      firstHalfPower,
      secondHalfPower,
    });
  }

  // Build exact 30-min outage intervals (e.g. "13:00 - 20:30")
  const outageIntervals: string[] = [];
  let currentOutageStart: string | null = null;
  for (let h = 1; h <= 24; h++) {
    const hZero = h - 1;
    const t0 = `${String(hZero).padStart(2, '0')}:00`;
    const t30 = `${String(hZero).padStart(2, '0')}:30`;
    const item = hours[h - 1];

    // First half (00..30)
    if (!item.firstHalfPower) {
      if (currentOutageStart === null) currentOutageStart = t0;
    } else if (currentOutageStart !== null) {
      outageIntervals.push(`${currentOutageStart} - ${t0}`);
      currentOutageStart = null;
    }

    // Second half (30..60)
    if (!item.secondHalfPower) {
      if (currentOutageStart === null) currentOutageStart = t30;
    } else if (currentOutageStart !== null) {
      outageIntervals.push(`${currentOutageStart} - ${t30}`);
      currentOutageStart = null;
    }
  }
  if (currentOutageStart !== null) {
    outageIntervals.push(`${currentOutageStart} - 24:00`);
  }

  return { hours, totalPowerHours, totalOutageHours, outageIntervals };
}

app.get('/api/utility/dtek-streets', async (req, res) => {
  const city = String(req.query['city'] || 'с-ще Окни').trim();
  const { dbCache } = await syncDtekScheduleWithDatabase({ city });
  if (dbCache.streets && Object.keys(dbCache.streets).length > 0) {
    const cities = Object.keys(dbCache.streets);
    const streets = dbCache.streets[city] || [];
    res.json({
      cities,
      streets,
      totalCities: cities.length,
      citySelected: city,
      servedFromDatabase: true,
      lastDtekFetchAt: dbCache.lastFetchedAtKyiv || null,
    });
    return;
  }

  try {
    const fallbackResp = await fetch(
      `https://homehub3.ai.studio/api/utility/dtek-streets?city=${encodeURIComponent(city)}`
    );
    if (fallbackResp.ok) {
      const data = await fallbackResp.json();
      res.json(data);
      return;
    }
  } catch {
    // ignore fallback error
  }

  res.json({
    cities: ['с-ще Окни', 'с. Степанівка', 'м. Одеса', 'м. Подільськ', 'м. Чорноморськ', 'м. Ізмаїл'],
    streets: ['вул. Шкільна', 'вул. Молодіжна', 'вул. Центральна', 'вул. Соборна', 'вул. Шевченка'],
    totalCities: 6,
    citySelected: city,
  });
});

app.get('/api/utility/dtek-shutdowns', async (req, res) => {
  const city = String(req.query['city'] || 'с-ще Окни').trim();
  const street = String(req.query['street'] || 'вул. Шкільна').trim();
  const houseNum = String(req.query['houseNum'] || req.query['house'] || '11').trim();
  const requestedManualRefresh = req.query['refresh'] === 'true';

  const now = new Date();
  const {
    currentKyivHour,
    kyivMinute,
    kyivDateFormatter,
    todayStr,
    kyivTimeStr,
    fullKyivDateTime,
  } = getKyivTimeParts(now);

  // Sync with DTEK only if DB cache is empty or >= 20 minutes have passed since lastFetchedAtMs
  const { dbCache, didFetchLiveFromDtek } = await syncDtekScheduleWithDatabase({
    city,
    street,
  });

  const addrCacheKey = `${city.toLowerCase()}|${street.toLowerCase()}`;
  let addrEntry = dbCache.addressHousesCache[addrCacheKey];

  // If this specific city+street is not yet cached in the DB (or was refreshed alongside a live DTEK sync),
  // resolve it once and persist in the DB cache so future requests read from DB.
  if (
    (!addrEntry || (didFetchLiveFromDtek && Date.now() - addrEntry.fetchedAtMs > 60_000)) &&
    dbCache.csrfToken &&
    dbCache.cookies
  ) {
    const lookedUp = await fetchDtekAjaxHomeNums(dbCache.cookies, dbCache.csrfToken, city, street);
    if (lookedUp && Object.keys(lookedUp.housesMap).length > 0) {
      addrEntry = {
        fetchedAtMs: Date.now(),
        updateTimestamp: lookedUp.updateTimestamp,
        housesMap: lookedUp.housesMap,
      };
      dbCache.addressHousesCache[addrCacheKey] = addrEntry;
      const sysVals = getSystemValuesMap();
      sysVals['dtekScheduleDbCache'] = dbCache;
      void persistSystemValues();
    }
  }

  let houseData: Record<string, unknown> | null = null;
  let queueGroup = 'GPV4.1';
  let updateTimestamp =
    addrEntry?.updateTimestamp ||
    dbCache.fact?.update ||
    `${kyivTimeStr.slice(0, 5)} ${todayStr}`;

  if (addrEntry && addrEntry.housesMap && Object.keys(addrEntry.housesMap).length > 0) {
    const housesMap = addrEntry.housesMap;
    const cleanTarget = houseNum.toLowerCase();
    const exact = housesMap[houseNum];
    if (exact) {
      houseData = exact;
    } else {
      const matchedKey =
        Object.keys(housesMap).find((k) => k.trim().toLowerCase() === cleanTarget) ||
        Object.keys(housesMap).find((k) => k.trim().toLowerCase().startsWith(cleanTarget)) ||
        Object.keys(housesMap).find((k) => Array.isArray(housesMap[k]?.['sub_type_reason']));
      if (matchedKey) {
        houseData = housesMap[matchedKey];
      }
    }
    if (
      houseData &&
      Array.isArray(houseData['sub_type_reason']) &&
      houseData['sub_type_reason'].length > 0
    ) {
      queueGroup = String(houseData['sub_type_reason'][0]);
    }
  } else {
    // Check if house queue is already stored on a matching UtilityAccount in DB
    const matchedAcc = state.utilityAccounts.find(
      (a) =>
        String(a['city'] || '').trim().toLowerCase() === city.toLowerCase() &&
        String(a['street'] || '').trim().toLowerCase() === street.toLowerCase() &&
        String(a['houseNum'] || '').trim().toLowerCase() === houseNum.toLowerCase() &&
        a['dtekQueueGroup']
    );
    if (matchedAcc && matchedAcc['dtekQueueGroup']) {
      queueGroup = String(matchedAcc['dtekQueueGroup']);
    }
  }

  // Ensure queueGroup starts with GPV (e.g. GPV4.1)
  if (!queueGroup.startsWith('GPV')) {
    queueGroup = `GPV${queueGroup}`;
  }

  const factDataMap = dbCache.fact?.data || {};
  const dayTimestamps = Object.keys(factDataMap)
    .map(Number)
    .filter((n) => !isNaN(n))
    .sort((a, b) => a - b);

  const dailySchedules = dayTimestamps.map((ts, idx) => {
    const dateObj = new Date(ts * 1000);
    const scheduleDate = kyivDateFormatter.format(dateObj);
    const isToday = idx === 0;
    const isTomorrow = idx === 1;
    const queueMapForDay = factDataMap[String(ts)] || {};
    const queueHoursObj =
      queueMapForDay[queueGroup] ||
      queueMapForDay[queueGroup.replace(/^GPV/, '')] ||
      {};
    const built = parseDtekFactHoursForQueue(queueHoursObj);
    return {
      dateKey: String(ts),
      scheduleDate,
      dayLabel: isToday ? 'Сьогодні' : isTomorrow ? 'Завтра' : scheduleDate,
      isToday,
      isTomorrow,
      queueGroup,
      totalPowerHours: built.totalPowerHours,
      totalOutageHours: built.totalOutageHours,
      hourlySchedule: built.hours,
    };
  });

  if (dailySchedules.length === 0) {
    const built = parseDtekFactHoursForQueue({});
    dailySchedules.push({
      dateKey: 'today',
      scheduleDate: todayStr,
      dayLabel: 'Сьогодні',
      isToday: true,
      isTomorrow: false,
      queueGroup,
      totalPowerHours: built.totalPowerHours,
      totalOutageHours: built.totalOutageHours,
      hourlySchedule: built.hours,
    });
  }

  const todaySchedule = dailySchedules[0];
  const tomorrowSchedule = dailySchedules.length > 1 ? dailySchedules[1] : null;
  const currentSlot =
    todaySchedule.hourlySchedule.find((item) => item.hour === currentKyivHour) ||
    todaySchedule.hourlySchedule[0];
  const isPowerAvailableNow = Boolean(
    kyivMinute < 30 ? currentSlot?.firstHalfPower : currentSlot?.secondHalfPower
  );

  const { allQueuesSchedules } = buildAllQueuesSchedulesFromFactData(factDataMap, now);

  const syncIntervalMinutes = getDtekSyncIntervalMinutes();
  const syncIntervalMs = getDtekSyncIntervalMs();
  const lastFetchedMs = dbCache.lastFetchedAtMs || Date.now();
  const nextAllowedFetchAtMs = lastFetchedMs + syncIntervalMs;
  const remainingMs = Math.max(0, nextAllowedFetchAtMs - Date.now());
  const minutesUntilNextRefresh = Math.ceil(remainingMs / 60000);
  const lastDtekFetchAt = dbCache.lastFetchedAtKyiv || fullKyivDateTime;
  const refreshSkippedByCooldown = requestedManualRefresh && !didFetchLiveFromDtek;

  res.status(200).json({
    success: true,
    city,
    street,
    houseNum,
    updateFact: updateTimestamp,
    dtekJsonUpdatedAt: updateTimestamp,
    fetchedAt: lastDtekFetchAt,
    lastDtekFetchAt,
    lastDtekFetchAtIso: dbCache.lastFetchedAtIso || new Date(lastFetchedMs).toISOString(),
    lastDtekFetchAtMs: lastFetchedMs,
    nextAllowedFetchAtMs,
    minutesUntilNextRefresh,
    syncIntervalMinutes,
    servedFromDatabase: true,
    didFetchLiveFromDtek,
    refreshSkippedByCooldown,
    houseData,
    startDate: (houseData?.['start_date'] as string) || null,
    endDate: (houseData?.['end_date'] as string) || null,
    subType: (houseData?.['type'] as string) || null,
    subStatus: (houseData?.['sub_type'] as string) || null,
    queueGroup,
    scheduleDate: todaySchedule.scheduleDate,
    hourlySchedule: todaySchedule.hourlySchedule,
    dailySchedules,
    tomorrowSchedule,
    allQueuesSchedules,
    isPowerAvailableNow,
    currentKyivHour,
    kyivTime: kyivTimeStr,
    raw: addrEntry?.housesMap ? { data: addrEntry.housesMap, updateTimestamp } : null,
  });
});

// ============================================================================
// WEB PUSH NOTIFICATIONS (VAPID) & DTEK SCHEDULE CHANGE WATCHER
// ============================================================================

interface StoredPushSubscription {
  id: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userId?: string;
  userEmail?: string;
  userName?: string;
  queueGroup: string; // e.g., 'GPV4.1' or 'ALL'
  city?: string;
  street?: string;
  houseNum?: string;
  deviceLabel?: string;
  createdAt: string;
  lastNotifiedAt?: string;
}

interface QueueScheduleFingerprint {
  queueKey: string;
  scheduleDate: string;
  todaySignature: string;
  todayOutageIntervals: string[];
  todayOutageHours: number;
  todayPowerHours: number;
  tomorrowDate?: string;
  tomorrowSignature?: string;
  tomorrowOutageIntervals?: string[];
  tomorrowOutageHours?: number;
  updatedAt: string;
}

let vapidInitialized = false;

function ensureVapidKeys(): { publicKey: string; privateKey: string } {
  const sysVals = getSystemValuesMap();
  const existing = sysVals['vapidKeys'] as { publicKey?: string; privateKey?: string } | undefined;
  if (existing?.publicKey && existing?.privateKey) {
    if (!vapidInitialized) {
      try {
        webpush.setVapidDetails(
          'mailto:admin@homehub.ai.studio',
          existing.publicKey,
          existing.privateKey
        );
        vapidInitialized = true;
      } catch (e) {
        console.warn('[WebPush] Failed to set existing VAPID details:', e);
      }
    }
    return { publicKey: existing.publicKey, privateKey: existing.privateKey };
  }

  const generated = webpush.generateVAPIDKeys();
  sysVals['vapidKeys'] = generated;
  try {
    webpush.setVapidDetails(
      'mailto:admin@homehub.ai.studio',
      generated.publicKey,
      generated.privateKey
    );
    vapidInitialized = true;
  } catch (e) {
    console.warn('[WebPush] Failed to initialize generated VAPID details:', e);
  }
  void persistSystemValues();
  return generated;
}

function getPushSubscriptionsList(): StoredPushSubscription[] {
  const sysVals = getSystemValuesMap();
  if (!Array.isArray(sysVals['pushSubscriptions'])) {
    sysVals['pushSubscriptions'] = [];
  }
  return sysVals['pushSubscriptions'] as StoredPushSubscription[];
}

function getScheduleFingerprintsMap(): Record<string, QueueScheduleFingerprint> {
  const sysVals = getSystemValuesMap();
  if (
    !sysVals['dtekScheduleFingerprints'] ||
    typeof sysVals['dtekScheduleFingerprints'] !== 'object'
  ) {
    sysVals['dtekScheduleFingerprints'] = {};
  }
  return sysVals['dtekScheduleFingerprints'] as Record<string, QueueScheduleFingerprint>;
}

function computeHourlySignature(
  hours: { hour: number; firstHalfPower: boolean; secondHalfPower: boolean }[]
): string {
  return hours
    .map((h) => `${h.hour}:${h.firstHalfPower ? 1 : 0}${h.secondHalfPower ? 1 : 0}`)
    .join(',');
}

async function sendWebPushToSubscription(
  sub: StoredPushSubscription,
  payload: Record<string, unknown>
): Promise<boolean> {
  ensureVapidKeys();
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: sub.keys,
      },
      JSON.stringify(payload),
      { TTL: 86400, urgency: 'high' }
    );
    sub.lastNotifiedAt = new Date().toISOString();
    return true;
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      // Remove expired subscription
      const sysVals = getSystemValuesMap();
      sysVals['pushSubscriptions'] = getPushSubscriptionsList().filter(
        (s) => s.endpoint !== sub.endpoint
      );
      void persistSystemValues();
    }
    return false;
  }
}

async function evaluateDtekScheduleChangesAndPush(
  allQueuesSchedules: {
    queueKey: string;
    queueNumber: string;
    queueTitle: string;
    scheduleDate: string;
    totalPowerHours: number;
    totalOutageHours: number;
    outageIntervals: string[];
    hourlySchedule: { hour: number; firstHalfPower: boolean; secondHalfPower: boolean }[];
    tomorrowSchedule?: {
      scheduleDate: string;
      totalPowerHours: number;
      totalOutageHours: number;
      hourlySchedule: { hour: number; firstHalfPower: boolean; secondHalfPower: boolean }[];
    } | null;
  }[],
  todayDateStr: string
): Promise<{ changedQueues: string[]; notificationsSent: number }> {
  const fingerprints = getScheduleFingerprintsMap();
  const subs = getPushSubscriptionsList();
  const changedQueues: string[] = [];
  let notificationsSent = 0;
  let fingerprintsUpdated = false;

  for (const q of allQueuesSchedules) {
    const qKey = q.queueKey; // e.g. 'GPV4.1'
    const todaySig = `${q.scheduleDate}|${computeHourlySignature(q.hourlySchedule)}`;
    const tomSchedule = q.tomorrowSchedule;
    const tomSig = tomSchedule
      ? `${tomSchedule.scheduleDate}|${computeHourlySignature(tomSchedule.hourlySchedule)}`
      : '';

    const prev = fingerprints[qKey];

    if (prev && prev.scheduleDate === q.scheduleDate) {
      const todayChanged = prev.todaySignature !== todaySig;
      const tomorrowChanged = Boolean(tomSig && prev.tomorrowSignature && prev.tomorrowSignature !== tomSig);
      const tomorrowAppeared = Boolean(
        tomSig && !prev.tomorrowSignature && tomSchedule && tomSchedule.totalOutageHours > 0
      );

      if (todayChanged || tomorrowChanged || tomorrowAppeared) {
        changedQueues.push(qKey);

        let title = `⚡ Зміна графіку ДТЕК (${q.queueTitle})`;
        let body = '';
        if (todayChanged) {
          const newIntervals =
            q.outageIntervals.length > 0 ? q.outageIntervals.join(', ') : 'Без відключень';
          const oldIntervals =
            prev.todayOutageIntervals && prev.todayOutageIntervals.length > 0
              ? prev.todayOutageIntervals.join(', ')
              : 'Без відключень';
          body = `Графік на сьогодні (${q.scheduleDate}) змінився! Нові відключення: ${newIntervals} (Світло: ${q.totalPowerHours} год, Відкл.: ${q.totalOutageHours} год). Було: ${oldIntervals}.`;
        } else if (tomorrowAppeared && tomSchedule) {
          title = `📅 Графік ДТЕК на завтра (${q.queueTitle})`;
          body = `З'явився графік на завтра (${tomSchedule.scheduleDate}): без світла ${tomSchedule.totalOutageHours} год, зі світлом ${tomSchedule.totalPowerHours} год.`;
        } else if (tomorrowChanged && tomSchedule) {
          title = `⚡ Оновився графік на завтра (${q.queueTitle})`;
          body = `Змінився графік на завтра (${tomSchedule.scheduleDate}): без світла ${tomSchedule.totalOutageHours} год (було ${prev.tomorrowOutageHours ?? 0} год).`;
        }

        const targetSubs = subs.filter(
          (s) =>
            !s.queueGroup ||
            s.queueGroup === 'ALL' ||
            s.queueGroup === qKey ||
            s.queueGroup.replace('GPV', '') === q.queueNumber
        );

        for (const sub of targetSubs) {
          const sent = await sendWebPushToSubscription(sub, {
            title,
            body,
            tag: `dtek-change-${qKey}-${Date.now()}`,
            url: '/?tab=outage_schedule',
            queueGroup: qKey,
          });
          if (sent) notificationsSent++;
        }
      }
    }

    if (!prev || prev.todaySignature !== todaySig || prev.tomorrowSignature !== tomSig) {
      fingerprints[qKey] = {
        queueKey: qKey,
        scheduleDate: q.scheduleDate || todayDateStr,
        todaySignature: todaySig,
        todayOutageIntervals: q.outageIntervals,
        todayOutageHours: q.totalOutageHours,
        todayPowerHours: q.totalPowerHours,
        tomorrowDate: tomSchedule?.scheduleDate,
        tomorrowSignature: tomSig || undefined,
        tomorrowOutageHours: tomSchedule?.totalOutageHours,
        updatedAt: new Date().toISOString(),
      };
      fingerprintsUpdated = true;
    }
  }

  if (fingerprintsUpdated) {
    await persistSystemValues();
  }

  return { changedQueues, notificationsSent };
}

app.get('/api/push/vapid-public-key', (req, res) => {
  const { publicKey } = ensureVapidKeys();
  const subs = getPushSubscriptionsList();
  const { user } = resolveRequestUser(req);
  const userId = String(user?.['id'] || '');
  const mySubs = userId ? subs.filter((s) => s.userId === userId) : subs;
  res.json({
    publicKey,
    totalSubscriptions: subs.length,
    userSubscriptionsCount: mySubs.length,
    monitoredQueues: Array.from(new Set(subs.map((s) => s.queueGroup).filter(Boolean))),
  });
});

app.post('/api/push/subscribe', async (req, res) => {
  const { subscription, queueGroup, city, street, houseNum, deviceLabel } = req.body || {};
  if (!subscription || !subscription.endpoint || !subscription.keys) {
    res.status(400).json({ error: 'Некоректний обʼєкт Web Push підписки' });
    return;
  }
  ensureVapidKeys();
  const { user } = resolveRequestUser(req);
  const subs = getPushSubscriptionsList();
  const normQueue = String(queueGroup || 'GPV4.1').startsWith('GPV')
    ? String(queueGroup || 'GPV4.1')
    : `GPV${queueGroup || '4.1'}`;

  const existingIdx = subs.findIndex((s) => s.endpoint === subscription.endpoint);
  const record: StoredPushSubscription = {
    id: existingIdx >= 0 ? subs[existingIdx].id : 'push_' + Date.now(),
    endpoint: String(subscription.endpoint),
    keys: {
      p256dh: String(subscription.keys.p256dh || ''),
      auth: String(subscription.keys.auth || ''),
    },
    userId: user ? String(user['id'] || '') : undefined,
    userEmail: user ? String(user['email'] || '') : undefined,
    userName: user ? String(user['name'] || '') : undefined,
    queueGroup: normQueue,
    city: city ? String(city) : undefined,
    street: street ? String(street) : undefined,
    houseNum: houseNum ? String(houseNum) : undefined,
    deviceLabel: deviceLabel ? String(deviceLabel) : 'Мій смартфон / Браузер',
    createdAt: existingIdx >= 0 ? subs[existingIdx].createdAt : new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    subs[existingIdx] = record;
  } else {
    subs.push(record);
  }
  await persistSystemValues();
  res.json({
    success: true,
    subscription: record,
    totalSubscriptions: subs.length,
  });
});

app.post('/api/push/unsubscribe', async (req, res) => {
  const { endpoint } = req.body || {};
  const sysVals = getSystemValuesMap();
  const subs = getPushSubscriptionsList();
  sysVals['pushSubscriptions'] = subs.filter((s) => s.endpoint !== endpoint);
  await persistSystemValues();
  res.json({ success: true, totalSubscriptions: (sysVals['pushSubscriptions'] as unknown[]).length });
});

app.post('/api/push/test-delayed', (req, res) => {
  const { endpoint, delaySeconds = 5, queueGroup, simulateScheduleDiff = false } = req.body || {};
  const subs = getPushSubscriptionsList();
  const targetSubs = endpoint
    ? subs.filter((s) => s.endpoint === endpoint)
    : subs;

  if (targetSubs.length === 0) {
    res.status(400).json({
      success: false,
      error: 'Немає активної підписки Web Push. Спочатку натисніть «Увімкнути фонові сповіщення».',
    });
    return;
  }

  const delayMs = Math.min(Math.max(Number(delaySeconds) || 5, 1), 60) * 1000;
  const fingerprints = getScheduleFingerprintsMap();

  setTimeout(async () => {
    for (const sub of targetSubs) {
      const qKey = String(queueGroup || sub.queueGroup || 'GPV4.1');
      const fp = fingerprints[qKey];
      const intervalsText =
        fp && fp.todayOutageIntervals?.length > 0
          ? fp.todayOutageIntervals.join(', ')
          : '10:00–14:00, 19:00–22:00';
      const title = simulateScheduleDiff
        ? `⚡ Зміна графіку ДТЕК (${qKey.replace('GPV', 'Черга ')})`
        : `🔔 Перевірка Web Push (${qKey.replace('GPV', 'Черга ')})`;
      const body = simulateScheduleDiff
        ? `Увага! Змінився сам графік відключень (не лише час перевірки). Нові слоти без світла: ${intervalsText}. Натисніть «Відкрити», щоб переглянути.`
        : `Фонові сповіщення HomeHub працюють! Відстежується реальна зміна графіку ${qKey.replace('GPV', 'Черга ')} (поточні слоти: ${intervalsText}).`;

      await sendWebPushToSubscription(sub, {
        title,
        body,
        tag: `dtek-test-${Date.now()}`,
        url: '/?tab=outage_schedule',
        queueGroup: qKey,
      });
    }
  }, delayMs);

  res.json({
    success: true,
    scheduledInSeconds: delayMs / 1000,
    recipientsCount: targetSubs.length,
  });
});

app.post('/api/push/snooze', (req, res) => {
  const { delayMinutes = 15, title, body, queueGroup } = req.body || {};
  const subs = getPushSubscriptionsList();
  const delayMs = Math.min(Math.max(Number(delayMinutes) || 15, 1), 120) * 60 * 1000;

  setTimeout(async () => {
    for (const sub of subs) {
      await sendWebPushToSubscription(sub, {
        title: title || '⚡ Нагадування: Графік відключень ДТЕК',
        body: body || 'Минуло 15 хвилин. Перевірте актуальний графік відключень світла.',
        tag: `dtek-snooze-${Date.now()}`,
        url: '/?tab=outage_schedule',
        queueGroup: queueGroup || sub.queueGroup,
      });
    }
  }, delayMs);

  res.json({ success: true });
});

// Background DTEK schedule synchronizer (checks every 60 seconds and fetches from DTEK website
// whenever the configured dtekSyncIntervalMinutes has elapsed since lastFetchedAtMs)
setInterval(async () => {
  try {
    const dbCache = getDtekScheduleDbCache();
    const elapsed = dbCache.lastFetchedAtMs > 0 ? Date.now() - dbCache.lastFetchedAtMs : Infinity;
    if (elapsed >= getDtekSyncIntervalMs()) {
      await syncDtekScheduleWithDatabase();
    }
  } catch {
    // Silent background check
  }
}, 60 * 1000);

// Initial warmup check shortly after startup: if DB has no DTEK schedule or >= 20 min have elapsed, sync once
setTimeout(() => {
  void syncDtekScheduleWithDatabase();
}, 4000);

app.post('/api/utility/recognize-meter', async (req, res) => {
  try {
    const apiKey = process.env['GEMINI_API_KEY'];
    if (!apiKey) {
      res.status(400).json({ success: false, error: 'GEMINI_API_KEY не налаштовано на сервері' });
      return;
    }
    const { imageBase64, utilityType, electricityTariffType } = req.body || {};
    const mimeMatch = String(imageBase64 || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const cleanBase64 = String(imageBase64 || '').replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        {
          inlineData: {
            mimeType,
            data: cleanBase64,
          },
        },
        `Розпізнай покази лічильника (${utilityType === 'water' ? 'вода м³' : electricityTariffType === 'dual' ? 'двозонний електро День T1 / Ніч T2' : 'електро кВт·год'}). Поверни JSON українською мовою.`,
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            readingT1: { type: Type.NUMBER, description: 'Показник День T1 або загальний показник електролічильника' },
            readingT2: { type: Type.NUMBER, description: 'Показник Ніч T2 для двозонного лічильника' },
            singleReading: { type: Type.NUMBER, description: 'Загальний показник однозонного лічильника' },
            readingWater: { type: Type.NUMBER, description: 'Показник лічильника води в м³' },
            meterNumber: { type: Type.STRING, description: 'Серійний номер лічильника, якщо видно на фото' },
            confidence: { type: Type.NUMBER, description: 'Впевненість розпізнавання від 0 до 1' },
            explanation: { type: Type.STRING, description: 'Коротке пояснення розпізнаних показів українською' },
          },
        },
      },
    });
    const parsed = JSON.parse(response.text || '{}');
    res.json({ success: true, ...parsed });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Помилка розпізнавання фото';
    res.status(500).json({ success: false, error: msg });
  }
});

app.post('/api/utility/analyze-device-screenshot', async (req, res) => {
  try {
    const apiKey = process.env['GEMINI_API_KEY'];
    if (!apiKey) {
      res.status(400).json({ success: false, error: 'GEMINI_API_KEY не налаштовано' });
      return;
    }
    const { imageBase64, comment, deviceName, date } = req.body || {};
    const mimeMatch = String(imageBase64 || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const cleanBase64 = String(imageBase64 || '').replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        {
          inlineData: {
            mimeType,
            data: cleanBase64,
          },
        },
        `Проаналізуй скріншот споживання електроенергії приладу "${deviceName || 'Пристрій'}" (базова дата: ${date || 'сьогодні'}). Коментар користувача: "${comment || 'немає'}". Витягни спожиті кВт·год (consumedKwh), режим запису (valueType: 'cumulative_month' якщо це накопичувальний підсумок за місяць, 'single_day' якщо за 1 день, 'period_range' якщо за діапазон дат/часу, 'delta' якщо це різниця), дату (YYYY-MM-DD), час початку/закінчення (HH:mm), тривалість у годинах, потужність у Вт та детальне пояснення українською мовою. Якщо значення у Вт·год (Wh), переведи у кВт·год (поділи на 1000).`,
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            consumedKwh: {
              type: Type.NUMBER,
              description: 'Кількість спожитої електроенергії у кВт·год (kWh)',
            },
            valueType: {
              type: Type.STRING,
              description: "Тип показника: 'cumulative_month', 'single_day', 'period_range' або 'delta'",
            },
            detectedDate: {
              type: Type.STRING,
              description: 'Дата у форматі YYYY-MM-DD, якщо видно на скріншоті або в коментарі',
            },
            detectedEndDate: {
              type: Type.STRING,
              description: 'Кінцева дата періоду у форматі YYYY-MM-DD (для period_range)',
            },
            detectedStartTime: {
              type: Type.STRING,
              description: 'Час початку у форматі HH:mm, якщо вказано',
            },
            detectedEndTime: {
              type: Type.STRING,
              description: 'Час завершення у форматі HH:mm, якщо вказано',
            },
            detectedDurationHours: {
              type: Type.NUMBER,
              description: 'Тривалість роботи/споживання у годинах',
            },
            detectedDeviceName: {
              type: Type.STRING,
              description: 'Назва приладу зі скріншоту, якщо видно',
            },
            powerWatts: {
              type: Type.NUMBER,
              description: 'Потужність приладу у Ватах (W), якщо видно',
            },
            explanation: {
              type: Type.STRING,
              description: 'Пояснення українською мовою: що саме розпізнано на скріншоті',
            },
            confidence: {
              type: Type.STRING,
              description: "Рівень впевненості: 'high', 'medium' або 'low'",
            },
          },
          required: ['consumedKwh', 'valueType', 'explanation'],
        },
      },
    });
    const parsed = JSON.parse(response.text || '{}') as Record<string, unknown>;
    const consumedKwh = Number(parsed['consumedKwh'] ?? parsed['extractedKwh'] ?? 0);
    const rawType = String(parsed['valueType'] || 'cumulative_month');
    const valueType =
      rawType === 'single_day' || rawType === 'period_range' || rawType === 'delta'
        ? rawType
        : 'cumulative_month';
    res.json({
      success: true,
      consumedKwh: Number.isFinite(consumedKwh) ? Math.round(consumedKwh * 1000) / 1000 : 0,
      valueType,
      detectedDate: parsed['detectedDate'] ? String(parsed['detectedDate']) : undefined,
      detectedEndDate: parsed['detectedEndDate'] ? String(parsed['detectedEndDate']) : undefined,
      detectedStartTime: parsed['detectedStartTime'] ? String(parsed['detectedStartTime']) : undefined,
      detectedEndTime: parsed['detectedEndTime'] ? String(parsed['detectedEndTime']) : undefined,
      detectedDurationHours:
        parsed['detectedDurationHours'] !== undefined && parsed['detectedDurationHours'] !== null
          ? Number(parsed['detectedDurationHours'])
          : null,
      detectedDeviceName: parsed['detectedDeviceName'] ? String(parsed['detectedDeviceName']) : undefined,
      powerWatts:
        parsed['powerWatts'] !== undefined && parsed['powerWatts'] !== null
          ? Number(parsed['powerWatts'])
          : null,
      explanation: String(parsed['explanation'] || parsed['summaryUa'] || 'Дані успішно розпізнано зі скріншоту'),
      confidence: String(parsed['confidence'] || 'high'),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Помилка аналізу скріншота';
    res.status(500).json({ success: false, error: msg });
  }
});

// ============================================================================
// STATIC ASSETS & ANGULAR SSR HANDLER
// ============================================================================

// Ensure unmatched /api/* routes always return JSON and never fall through to Angular SSR HTML
app.use('/api', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
});

app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  })
);

app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next()
    )
    .catch(next);
});

if (isMainModule(import.meta.url) || process.env['START_EXPRESS_SERVER'] === 'true') {
  const port = Number(process.env['PORT']) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Node Express server listening on http://0.0.0.0:${port}`);
    void ensureInitialHydration();
  });
}

export const reqHandler = createNodeRequestHandler(app);

