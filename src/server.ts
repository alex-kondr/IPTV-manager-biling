import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { GoogleGenAI } from '@google/genai';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  isCloudSqlAvailable,
  getCloudSqlDbStatus,
  loadAllFromCloudSql,
  saveSettingsToCloudSql,
  getSettingsFromCloudSql,
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
  seedInitialDataToCloudSql,
  purgeTestDataFromCloudSql,
} from './server/cloudsql-sync';
import { DEFAULT_UTILITY_TARIFFS, UtilityTariffsSettings } from './app/models/utility.model';
import {
  BudgetLedgerItem,
  ProviderBalanceAdjustment,
  AccountDeductionOverride,
} from './app/models/client.model';

const browserDistFolder = join(import.meta.dirname, '../browser');
const dbDir = join(process.cwd(), 'data');
const dbFile = join(dbDir, 'iptv_database.json');
const settingsFile = join(dbDir, 'settings.json');

// Ensure db directory exists
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

function deepMergeTariffs(
  currentTariffs: UtilityTariffsSettings | Record<string, unknown> | undefined,
  newTariffs: Partial<UtilityTariffsSettings> | Record<string, unknown> | undefined
): UtilityTariffsSettings {
  if (!newTariffs && currentTariffs) return currentTariffs as UtilityTariffsSettings;
  if (!newTariffs && !currentTariffs) return DEFAULT_UTILITY_TARIFFS;

  const base = (currentTariffs as UtilityTariffsSettings) || DEFAULT_UTILITY_TARIFFS;
  const n = (newTariffs || {}) as Partial<UtilityTariffsSettings>;

  const waterPrice = n.water?.price !== undefined ? Number(n.water.price) : (base.water?.price !== undefined ? Number(base.water.price) : DEFAULT_UTILITY_TARIFFS.water.price);
  const waterMonthlyFee = n.water?.monthlyFee !== undefined ? Number(n.water.monthlyFee) : (base.water?.monthlyFee !== undefined ? Number(base.water.monthlyFee) : (DEFAULT_UTILITY_TARIFFS.water.monthlyFee || 0));
  const waterValidFrom = n.water?.validFrom || base.water?.validFrom || DEFAULT_UTILITY_TARIFFS.water.validFrom;
  const waterValidTo = n.water?.validTo !== undefined ? n.water.validTo : (base.water?.validTo || '');
  let waterHistory = n.water?.history && Array.isArray(n.water.history) && n.water.history.length > 0
    ? [...n.water.history]
    : (base.water?.history && Array.isArray(base.water.history) && base.water.history.length > 0 ? [...base.water.history] : []);

  if (waterHistory.length === 0) {
    waterHistory = [{ id: 'wh_1', price: waterPrice, monthlyFee: waterMonthlyFee, validFrom: waterValidFrom, validTo: waterValidTo, note: 'Базовий тариф на воду' }];
  } else {
    // Keep history synced with top-level tariff
    for (const item of waterHistory) {
      if (item.validFrom === waterValidFrom || waterHistory.length === 1) {
        item.price = waterPrice;
        item.monthlyFee = waterMonthlyFee;
        item.validTo = waterValidTo;
      }
    }
  }

  const wastePrice = n.waste?.price !== undefined ? Number(n.waste.price) : (base.waste?.price !== undefined ? Number(base.waste.price) : DEFAULT_UTILITY_TARIFFS.waste.price);
  const wasteValidFrom = n.waste?.validFrom || base.waste?.validFrom || DEFAULT_UTILITY_TARIFFS.waste.validFrom;
  const wasteValidTo = n.waste?.validTo !== undefined ? n.waste.validTo : (base.waste?.validTo || '');
  let wasteHistory = n.waste?.history && Array.isArray(n.waste.history) && n.waste.history.length > 0
    ? [...n.waste.history]
    : (base.waste?.history && Array.isArray(base.waste.history) && base.waste.history.length > 0 ? [...base.waste.history] : []);

  if (wasteHistory.length === 0) {
    wasteHistory = [{ id: 'wsh_1', price: wastePrice, validFrom: wasteValidFrom, validTo: wasteValidTo, note: 'Базовий тариф на вивіз сміття' }];
  } else {
    for (const item of wasteHistory) {
      if (item.validFrom === wasteValidFrom || wasteHistory.length === 1) {
        item.price = wastePrice;
        item.validTo = wasteValidTo;
      }
    }
  }

  const elecSingleRate = n.electricitySingle?.rate !== undefined ? Number(n.electricitySingle.rate) : (base.electricitySingle?.rate !== undefined ? Number(base.electricitySingle.rate) : DEFAULT_UTILITY_TARIFFS.electricitySingle.rate);
  const elecSingleValidFrom = n.electricitySingle?.validFrom || base.electricitySingle?.validFrom || DEFAULT_UTILITY_TARIFFS.electricitySingle.validFrom;
  const elecSingleValidTo = n.electricitySingle?.validTo !== undefined ? n.electricitySingle.validTo : (base.electricitySingle?.validTo || '');
  let elecSingleHistory = n.electricitySingle?.history && Array.isArray(n.electricitySingle.history) && n.electricitySingle.history.length > 0
    ? [...n.electricitySingle.history]
    : (base.electricitySingle?.history && Array.isArray(base.electricitySingle.history) && base.electricitySingle.history.length > 0 ? [...base.electricitySingle.history] : []);

  if (elecSingleHistory.length === 0) {
    elecSingleHistory = [{ id: 'esh_1', rate: elecSingleRate, validFrom: elecSingleValidFrom, validTo: elecSingleValidTo, note: 'Єдиний тариф на електроенергію' }];
  } else {
    for (const item of elecSingleHistory) {
      if (item.validFrom === elecSingleValidFrom || elecSingleHistory.length === 1) {
        item.rate = elecSingleRate;
        item.validTo = elecSingleValidTo;
      }
    }
  }

  const elecDualValidFrom = n.electricityDual?.validFrom || base.electricityDual?.validFrom || DEFAULT_UTILITY_TARIFFS.electricityDual.validFrom;
  const elecDualValidTo = n.electricityDual?.validTo !== undefined ? n.electricityDual.validTo : (base.electricityDual?.validTo || '');
  const elecDualSummerDay = n.electricityDual?.summerDay !== undefined ? Number(n.electricityDual.summerDay) : (base.electricityDual?.summerDay ?? DEFAULT_UTILITY_TARIFFS.electricityDual.summerDay);
  const elecDualSummerNight = n.electricityDual?.summerNight !== undefined ? Number(n.electricityDual.summerNight) : (base.electricityDual?.summerNight ?? DEFAULT_UTILITY_TARIFFS.electricityDual.summerNight);
  const elecDualWinterDay = n.electricityDual?.winterDay !== undefined ? Number(n.electricityDual.winterDay) : (base.electricityDual?.winterDay ?? DEFAULT_UTILITY_TARIFFS.electricityDual.winterDay);
  const elecDualWinterNight = n.electricityDual?.winterNight !== undefined ? Number(n.electricityDual.winterNight) : (base.electricityDual?.winterNight ?? DEFAULT_UTILITY_TARIFFS.electricityDual.winterNight);
  const elecDualWinterLimit = n.electricityDual?.winterLimitKwh !== undefined ? Number(n.electricityDual.winterLimitKwh) : (base.electricityDual?.winterLimitKwh ?? DEFAULT_UTILITY_TARIFFS.electricityDual.winterLimitKwh ?? 2000);
  let elecDualHistory = n.electricityDual?.history && Array.isArray(n.electricityDual.history) && n.electricityDual.history.length > 0
    ? [...n.electricityDual.history]
    : (base.electricityDual?.history && Array.isArray(base.electricityDual.history) && base.electricityDual.history.length > 0 ? [...base.electricityDual.history] : []);

  if (elecDualHistory.length === 0) {
    elecDualHistory = [{
      id: 'edh_1',
      validFrom: elecDualValidFrom,
      validTo: elecDualValidTo,
      summerDay: elecDualSummerDay,
      summerNight: elecDualSummerNight,
      winterDay: elecDualWinterDay,
      winterNight: elecDualWinterNight,
      winterLimitKwh: elecDualWinterLimit,
      note: 'Базовий двозонний тариф',
    }];
  } else {
    for (const item of elecDualHistory) {
      if (item.validFrom === elecDualValidFrom || elecDualHistory.length === 1) {
        item.summerDay = elecDualSummerDay;
        item.summerNight = elecDualSummerNight;
        item.winterDay = elecDualWinterDay;
        item.winterNight = elecDualWinterNight;
        item.winterLimitKwh = elecDualWinterLimit;
        item.validTo = elecDualValidTo;
      }
    }
  }

  return {
    water: {
      price: waterPrice,
      monthlyFee: waterMonthlyFee,
      validFrom: waterValidFrom,
      validTo: waterValidTo,
      history: waterHistory,
    },
    waste: {
      price: wastePrice,
      validFrom: wasteValidFrom,
      validTo: wasteValidTo,
      history: wasteHistory,
    },
    electricitySingle: {
      rate: elecSingleRate,
      validFrom: elecSingleValidFrom,
      validTo: elecSingleValidTo,
      history: elecSingleHistory,
    },
    electricityDual: {
      validFrom: elecDualValidFrom,
      validTo: elecDualValidTo,
      summerDay: elecDualSummerDay,
      summerNight: elecDualSummerNight,
      winterDay: elecDualWinterDay,
      winterNight: elecDualWinterNight,
      winterLimitKwh: elecDualWinterLimit,
      history: elecDualHistory,
    },
  };
}

// Interfaces for server state
export type SubscriptionPlanType = '1usd' | '2usd' | 'custom';

interface Client {
  id: string;
  fullName: string;
  phone: string;
  iptvLogin: string;
  deviceInfo?: string;
  subscriptionPlan?: SubscriptionPlanType;
  costUsd: number; // 1 or 2
  monthlyPrice: number; // 100 or 150 (UAH)
  startDate: string;
  activeUntil: string;
  balance: number;
  status: 'active' | 'expiring_soon' | 'expired' | 'paused';
  providerAccountId?: string;
  telegramChatId?: string;
  telegramUsername?: string;
  viberId?: string;
  notes?: string;
  lastReminderDate?: string;
  lastReminderStatus?: 'sent' | 'failed' | 'manual';
  createdAt: string;
  updatedAt: string;
}

interface PaymentTransaction {
  id: string;
  clientId: string;
  clientName: string;
  amount: number;
  monthlyPrice: number;
  previousBalance: number;
  newBalance: number;
  monthsAdded: number;
  costUsdPerMonth?: number;
  totalUsdDeducted?: number;
  previousActiveUntil: string;
  newActiveUntil: string;
  date: string;
  note?: string;
}

interface ProviderAccountRenewal {
  id: string;
  date: string;
  months: number;
  pricePerMonthUsd: number;
  totalCostUsd: number;
  previousValidUntil?: string;
  newValidUntil: string;
  note?: string;
}

interface ProviderAccount {
  id: string;
  name: string;
  login: string;
  password?: string;
  playlistUrl?: string;
  serverUrl?: string;
  maxSlots: number; // default 2
  assignedClientIds: string[]; // max 2
  pricePerMonthUsd: number; // 1 or 2 ($ per month at provider)
  startDate?: string; // Connection start date (YYYY-MM-DD)
  monthsCount: number; // total months paid
  validUntil: string; // date paid until at provider
  totalDeductedUsd: number; // total USD deducted from main balance
  renewals?: ProviderAccountRenewal[];
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

interface ProviderDeposit {
  id: string;
  date: string; // YYYY-MM-DD
  amountUsd: number; // $ Top-up
  spentUah: number; // ₴ Total spent including commission (MINUS in budget)
  exchangeRate?: number; // spentUah / amountUsd
  paymentMethod?: string;
  note?: string;
  createdAt: string;
}

interface AppSettings {
  telegramBotToken: string;
  telegramBotUsername: string;
  telegramSenderName: string;
  defaultMonthlyPrice: number;
  reminderDaysBefore: number;
  cardRequisites: string;
  reminderMessageTemplate: string;
  autoReminderEnabled: boolean;
  viberAuthToken?: string;
  viberSenderName?: string;
  viberRenewalMessageTemplate?: string;
  viberReminderMessageTemplate?: string;
  utilityTariffsSettings?: Record<string, unknown>;
}

export type UtilityType = 'electricity' | 'water' | 'waste';
export type ElectricityTariffType = 'single' | 'dual';
export type SeasonType = 'summer' | 'winter';

export interface UtilityAccount {
  id: string;
  type: 'electricity' | 'water_waste';
  name: string;
  accountNumber: string;
  address?: string;
  meterNumber?: string;
  electricityTariffType: ElectricityTariffType;
  residentsCount?: number;
  initialReadingT1?: number;
  initialReadingT2?: number;
  initialReadingWater?: number;
  waterEnabled?: boolean;
  wasteEnabled?: boolean;
  balanceUah?: number;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface UtilityReading {
  id: string;
  accountId: string;
  utilityType: UtilityType;
  date: string;
  periodMonth?: string;
  readingT1?: number;
  readingT2?: number;
  consumptionT1?: number;
  consumptionT2?: number;
  rateT1?: number;
  rateT2?: number;
  totalCost: number;
  season?: SeasonType;
  isPaid?: boolean;
  paidDate?: string;
  paidAmount?: number;
  note?: string;
  isControlOnly?: boolean;
  readingPurpose?: 'billing' | 'control';
  daysSinceLastReading?: number;
  dailyAvgConsumption?: number;
  createdAt: string;
}

export type UserRole = 'admin' | 'user' | 'new';

export interface AppUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
  role: UserRole; // 'admin' (Всі права), 'user' (Тільки перегляд), 'new' (Зовсім без доступу)
  createdAt: string;
  lastLoginAt: string;
  sub?: string;
}

interface DatabaseSchema {
  clients: Client[];
  payments: PaymentTransaction[];
  providerAccounts: ProviderAccount[];
  providerDeposits: ProviderDeposit[];
  customLedgerEntries: BudgetLedgerItem[];
  providerBalanceAdjustments: ProviderBalanceAdjustment[];
  accountDeductionOverrides: AccountDeductionOverride[];
  utilityAccounts: UtilityAccount[];
  utilityReadings: UtilityReading[];
  settings: AppSettings;
  users: AppUser[];
}

// Helpers
function addMonthsExact(dateStr: string, monthsToAdd: number): string {
  if (!dateStr || monthsToAdd === 0) return dateStr;
  const parts = dateStr.split('-').map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];

  const totalMonths = (y * 12 + (m - 1)) + monthsToAdd;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonthIndex = ((totalMonths % 12) + 12) % 12;

  const maxDaysInMonth = new Date(targetYear, targetMonthIndex + 1, 0).getDate();
  const targetDay = Math.min(d, maxDaysInMonth);

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${targetYear}-${pad(targetMonthIndex + 1)}-${pad(targetDay)}`;
}

function getDaysRemaining(activeUntilStr: string): number {
  if (!activeUntilStr) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [y, m, d] = activeUntilStr.split('-').map(Number);
  const targetDate = new Date(y, m - 1, d);
  targetDate.setHours(0, 0, 0, 0);

  const diffMs = targetDate.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

function computeClientStatus(client: { activeUntil: string; status?: string }): 'active' | 'expiring_soon' | 'expired' | 'paused' {
  if (client.status === 'paused') return 'paused';
  const days = getDaysRemaining(client.activeUntil);
  if (days < 0) return 'expired';
  if (days <= 7) return 'expiring_soon';
  return 'active';
}

/**
 * Calculates how many monthly billing cycles have occurred from startDateStr up to currentDateStr.
 * Cycle 1 occurs on the connection day (startDateStr itself).
 * Cycle 2 occurs 1 month later on the connection day, and so on.
 */
function calculateElapsedMonthlyCycles(startDateStr: string, currentDateStr?: string): number {
  if (!startDateStr) return 0;

  const startYMD = startDateStr.split('T')[0];
  const currYMD = currentDateStr || new Date().toISOString().split('T')[0];

  const [startYear, startMonth, startDay] = startYMD.split('-').map(Number);
  const [currYear, currMonth, currDay] = currYMD.split('-').map(Number);

  if (isNaN(startYear) || isNaN(startMonth) || isNaN(startDay)) return 0;
  if (isNaN(currYear) || isNaN(currMonth) || isNaN(currDay)) return 0;

  if (currYear < startYear) return 0;
  if (currYear === startYear && currMonth < startMonth) return 0;
  if (currYear === startYear && currMonth === startMonth && currDay < startDay) return 0;

  const monthDiff = (currYear - startYear) * 12 + (currMonth - startMonth);
  const maxDaysInCurrMonth = new Date(currYear, currMonth, 0).getDate();
  const effectiveDayThisMonth = Math.min(startDay, maxDaysInCurrMonth);

  let cycles = monthDiff;
  if (currDay >= effectiveDayThisMonth) {
    cycles += 1;
  }

  return Math.max(0, cycles);
}

/**
 * Calculates exact provider account deduction details up to currentDateStr.
 * Deducts $1 or $2 on the connection day once per month.
 * If startDate is in the past, dynamically counts elapsed monthly cycles and deducts the corresponding sum.
 */
function getAccountDeductionDetails(account: ProviderAccount, currentDateStr?: string) {
  const startDateStr = account.startDate || (account.createdAt ? account.createdAt.split('T')[0] : new Date().toISOString().split('T')[0]);
  const pricePerMonth = account.pricePerMonthUsd || 1;
  const totalMonthsLimit = account.monthsCount || 999;

  const elapsed = calculateElapsedMonthlyCycles(startDateStr, currentDateStr);
  const actualDeductedMonths = Math.min(elapsed, totalMonthsLimit);
  const totalDeductedUsd = actualDeductedMonths * pricePerMonth;

  return {
    startDateStr,
    pricePerMonth,
    totalMonthsLimit,
    elapsedCycles: elapsed,
    actualDeductedMonths,
    totalDeductedUsd,
  };
}

// Initial Database Seeding
const defaultAdminEmail = 'djsahbok@gmail.com';

function getInitialDb(): DatabaseSchema {
  const initialSettings: AppSettings = {
    telegramBotToken: process.env['TELEGRAM_BOT_TOKEN'] || '',
    telegramBotUsername: 'iptv_billing_bot',
    telegramSenderName: 'IPTV Підтримка',
    defaultMonthlyPrice: 100, // Default 100 грн for $1 plan
    reminderDaysBefore: 7,
    cardRequisites: '4441 1144 5566 7788 (Монобанк)',
    reminderMessageTemplate:
      'Шановний(а) {name}! Нагадуємо, що термін дії вашої підписки IPTV (логін: {login}) закінчується {expiry_date}. Вартість: {price} грн/міс. До сплати: {amount_to_pay} грн. Реквізити картки: {card_number}. Дякуємо за вибір нашого сервісу!',
    autoReminderEnabled: true,
    viberReminderMessageTemplate:
      'Доброго дня, {name}! Нагадуємо, що термін дії вашої підписки IPTV (логін: {login}) закінчується {active_until}. Сума до сплати: {amount} грн. Реквізити картки: {card}. Сьогодні {current_date}. Дякуємо, що ви з нами!',
    viberRenewalMessageTemplate:
      'Доброго дня, {name}! Вашу IPTV підписку (логін: {login}) успішно продовжено до {active_until}. Сума оплати: {amount} грн. Дата: {current_date}. Приємного перегляду!',
    utilityTariffsSettings: DEFAULT_UTILITY_TARIFFS as unknown as Record<string, unknown>,
  };

  const initialUsers: AppUser[] = [
    {
      id: 'usr_admin_default',
      email: defaultAdminEmail,
      name: 'Адміністратор (djsahbok)',
      picture: `https://ui-avatars.com/api/?name=${encodeURIComponent('Адміністратор')}&background=0284c7&color=fff`,
      role: 'admin',
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    },
  ];

  return {
    clients: [],
    payments: [],
    providerAccounts: [],
    providerDeposits: [],
    customLedgerEntries: [],
    providerBalanceAdjustments: [],
    accountDeductionOverrides: [],
    utilityAccounts: [],
    utilityReadings: [],
    settings: initialSettings,
    users: initialUsers,
  };
}

let cachedDb: DatabaseSchema | null = null;
let startupSyncPromise: Promise<void> | null = null;

async function syncWithDatabaseOnStartup(): Promise<void> {
  try {
    if (isCloudSqlAvailable()) {
      console.log('[Cloud SQL] Connecting to Cloud SQL PostgreSQL database...');
      const cloudSqlData = await loadAllFromCloudSql();
      if (cloudSqlData) {
        const init = getInitialDb();
        const current: DatabaseSchema = {
          clients: Array.isArray(cloudSqlData.clients) ? (cloudSqlData.clients as unknown as Client[]) : [],
          payments: Array.isArray(cloudSqlData.payments) ? (cloudSqlData.payments as unknown as PaymentTransaction[]) : [],
          providerAccounts: Array.isArray(cloudSqlData.providerAccounts) ? (cloudSqlData.providerAccounts as unknown as ProviderAccount[]) : [],
          providerDeposits: Array.isArray(cloudSqlData.providerDeposits) ? (cloudSqlData.providerDeposits as unknown as ProviderDeposit[]) : [],
          customLedgerEntries: Array.isArray(cloudSqlData.customLedgerEntries) ? (cloudSqlData.customLedgerEntries as unknown as BudgetLedgerItem[]) : [],
          providerBalanceAdjustments: Array.isArray(cloudSqlData.providerBalanceAdjustments) ? (cloudSqlData.providerBalanceAdjustments as unknown as ProviderBalanceAdjustment[]) : [],
          accountDeductionOverrides: Array.isArray(cloudSqlData.accountDeductionOverrides) ? (cloudSqlData.accountDeductionOverrides as unknown as AccountDeductionOverride[]) : [],
          utilityAccounts: Array.isArray(cloudSqlData.utilityAccounts) ? (cloudSqlData.utilityAccounts as unknown as UtilityAccount[]) : [],
          utilityReadings: Array.isArray(cloudSqlData.utilityReadings)
            ? (cloudSqlData.utilityReadings as unknown as UtilityReading[]).map((r) => {
                const isCtrl = r.isControlOnly === true || String(r.isControlOnly) === 'true' || r.readingPurpose === 'control';
                return {
                  ...r,
                  isControlOnly: isCtrl,
                  readingPurpose: isCtrl ? 'control' : 'billing',
                };
              })
            : [],
          settings: init.settings,
          users: init.users,
        };

        if (cloudSqlData.settings) {
          const rawTariffs = cloudSqlData.settings['utilityTariffsSettings'];
          let parsedTariffs = rawTariffs;
          if (typeof rawTariffs === 'string') {
            try {
              parsedTariffs = JSON.parse(rawTariffs);
            } catch {
              // ignore parse error
            }
          }
          current.settings = {
            ...init.settings,
            ...cloudSqlData.settings,
            utilityTariffsSettings: deepMergeTariffs(
              DEFAULT_UTILITY_TARIFFS,
              parsedTariffs as Partial<UtilityTariffsSettings>
            ),
          } as unknown as AppSettings;
        } else {
          console.log('[Cloud SQL] Initializing default settings in Cloud SQL...');
          await seedInitialDataToCloudSql(current as unknown as Record<string, unknown>);
        }

        // Restore user list from local cache if present
        if (existsSync(dbFile)) {
          try {
            const raw = JSON.parse(readFileSync(dbFile, 'utf-8'));
            if (Array.isArray(raw.users) && raw.users.length > 0) {
              current.users = raw.users;
            }
          } catch {
            // ignore
          }
        }

        cachedDb = current;
        try {
          writeFileSync(dbFile, JSON.stringify(current, null, 2), 'utf-8');
          writeFileSync(settingsFile, JSON.stringify(current.settings, null, 2), 'utf-8');
        } catch (e) {
          console.warn('Cache write warning:', e);
        }
        console.log('[Cloud SQL] Successfully loaded application state directly from Cloud SQL PostgreSQL database!');
        return;
      }
    }
  } catch (err) {
    console.error('[Cloud SQL] Startup sync error:', err);
  }
}

// Kick off database sync on startup and store promise for API requests
startupSyncPromise = syncWithDatabaseOnStartup();

function loadDb(): DatabaseSchema {
  if (cachedDb) {
    return cachedDb;
  }
  try {
    if (existsSync(dbFile)) {
      const data = readFileSync(dbFile, 'utf-8');
      const parsed = JSON.parse(data);

      const init = getInitialDb();
      if (!parsed.providerAccounts || !Array.isArray(parsed.providerAccounts)) {
        parsed.providerAccounts = init.providerAccounts;
      }
      if (!parsed.providerDeposits || !Array.isArray(parsed.providerDeposits)) {
        parsed.providerDeposits = init.providerDeposits;
      }
      if (!parsed.customLedgerEntries || !Array.isArray(parsed.customLedgerEntries)) {
        parsed.customLedgerEntries = [];
      }
      if (!parsed.providerBalanceAdjustments || !Array.isArray(parsed.providerBalanceAdjustments)) {
        parsed.providerBalanceAdjustments = [];
      }
      if (!parsed.accountDeductionOverrides || !Array.isArray(parsed.accountDeductionOverrides)) {
        parsed.accountDeductionOverrides = [];
      }
      if (!parsed.utilityAccounts || !Array.isArray(parsed.utilityAccounts)) {
        parsed.utilityAccounts = [];
      }
      if (!parsed.utilityReadings || !Array.isArray(parsed.utilityReadings)) {
        parsed.utilityReadings = [];
      } else {
        parsed.utilityReadings = parsed.utilityReadings.map((r: UtilityReading) => {
          const isCtrl = r.isControlOnly === true || String(r.isControlOnly) === 'true' || r.readingPurpose === 'control';
          return {
            ...r,
            isControlOnly: isCtrl,
            readingPurpose: isCtrl ? 'control' : 'billing',
          };
        });
      }
      if (!parsed.settings) {
        parsed.settings = init.settings;
      } else {
        const mergedTariffs = deepMergeTariffs(
          init.settings.utilityTariffsSettings,
          parsed.settings.utilityTariffsSettings
        );
        parsed.settings = {
          ...init.settings,
          ...parsed.settings,
          utilityTariffsSettings: mergedTariffs,
        };
      }

      if (!parsed.users || !Array.isArray(parsed.users) || parsed.users.length === 0) {
        parsed.users = init.users;
      } else {
        const hasAdmin = parsed.users.some((u: AppUser) => u.email.toLowerCase() === defaultAdminEmail.toLowerCase());
        if (!hasAdmin) {
          parsed.users.unshift(init.users[0]);
        }
      }

      // Auto-update client status based on current date and normalize plans
      if (parsed.clients && Array.isArray(parsed.clients)) {
        parsed.clients = parsed.clients.map((c: Client) => {
          const plan: SubscriptionPlanType = c.subscriptionPlan || (c.monthlyPrice >= 150 ? '2usd' : '1usd');
          const cost = c.costUsd || (plan === '2usd' ? 2 : 1);
          return {
            ...c,
            subscriptionPlan: plan,
            costUsd: cost,
            status: computeClientStatus(c),
          };
        });
      }
      cachedDb = parsed;
      return parsed;
    }
  } catch (err) {
    console.error('Error loading DB file, falling back to seed:', err);
  }
  const init = getInitialDb();
  cachedDb = init;
  try {
    writeFileSync(dbFile, JSON.stringify(init, null, 2), 'utf-8');
  } catch {
    // ignore
  }
  return init;
}

let dbRevision = 1;
let lastDbUpdate = new Date().toISOString();

function saveDb(data: DatabaseSchema): void {
  cachedDb = data;
  dbRevision++;
  lastDbUpdate = new Date().toISOString();
  try {
    writeFileSync(dbFile, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving DB file:', err);
  }
}

// Active user sessions: token -> session info
const activeSessions = new Map<string, { userId: string; email: string; role: UserRole; expiresAt: number }>();

function parseGoogleJwt(token: string): { sub?: string; email?: string; name?: string; picture?: string; email_verified?: boolean } | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = Buffer.from(base64, 'base64').toString('utf-8');
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

function getAuthenticatedUser(req: express.Request, db: DatabaseSchema): AppUser | null {
  const authHeader = (req.headers['authorization'] || '') as string;
  const headerToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '';
  const customUserId = req.headers['x-auth-user-id'] as string;
  const customEmail = req.headers['x-auth-user-email'] as string;

  // 1. Session token
  if (headerToken && activeSessions.has(headerToken)) {
    const sess = activeSessions.get(headerToken)!;
    const user = (db.users || []).find((u) => u.id === sess.userId || u.email.toLowerCase() === sess.email.toLowerCase());
    if (user) return user;
  }

  // 2. Custom header
  if (customUserId) {
    const user = (db.users || []).find((u) => u.id === customUserId);
    if (user) return user;
  }
  if (customEmail) {
    const user = (db.users || []).find((u) => u.email.toLowerCase() === customEmail.toLowerCase());
    if (user) return user;
  }

  // Fallback default admin if no auth header passed in local environment
  return (db.users || []).find((u) => u.role === 'admin') || null;
}

const app = express();
const angularApp = new AngularNodeAppEngine();

// Middleware
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Role-based protection middleware for state-modifying requests
app.use('/api', async (req, res, next) => {
  if (startupSyncPromise) {
    try {
      await startupSyncPromise;
    } catch {
      // ignore
    }
  }

  // Allow all auth endpoints, sync version, database status, photo recognition, dtek shutdowns, settings, budget endpoints, and GET requests
  if (
    req.path.startsWith('/auth') ||
    req.path === '/sync/version' ||
    req.path === '/database/status' ||
    req.path === '/utility/recognize-meter' ||
    req.path.startsWith('/utility/dtek-shutdowns') ||
    req.path === '/settings' ||
    req.path.startsWith('/budget') ||
    req.method === 'GET' ||
    req.method === 'OPTIONS'
  ) {
    return next();
  }

  // For POST/PUT/DELETE mutating requests: require Admin role
  const db = loadDb();
  const user = getAuthenticatedUser(req, db);

  if (!user) {
    return res.status(401).json({ error: 'Необхідна Google авторизація для виконання цієї дії' });
  }

  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'У вас режим тільки для перегляду. Тільки адміністратор може вносити зміни' });
  }

  next();
});

// API Endpoints: Auth & User Management
app.get('/api/auth/me', (req, res) => {
  const db = loadDb();
  const user = getAuthenticatedUser(req, db);
  res.json({
    authenticated: !!user,
    user: user || null,
    googleClientId: process.env['GOOGLE_CLIENT_ID'] || '',
    totalUsersCount: (db.users || []).length,
    pendingUsersCount: (db.users || []).filter((u) => u.role === 'new').length,
  });
});

app.post('/api/auth/google', (req, res): void => {
  const db = loadDb();
  if (!db.users) db.users = [];

  let email = (req.body.email || '').trim().toLowerCase();
  let name = (req.body.name || '').trim();
  let picture = req.body.picture || '';
  let sub = req.body.sub || '';

  // If Google ID token / credential is provided from Google Identity Services
  if (req.body.credential) {
    const decoded = parseGoogleJwt(req.body.credential);
    if (decoded) {
      if (decoded.email) email = decoded.email.toLowerCase();
      if (decoded.name) name = decoded.name;
      if (decoded.picture) picture = decoded.picture;
      if (decoded.sub) sub = decoded.sub;
    }
  }

  if (!email) {
    res.status(400).json({ error: 'Електронна пошта Google обовʼязкова' });
    return;
  }

  let user = db.users.find((u) => u.email.toLowerCase() === email || (sub && u.sub === sub));
  const now = new Date().toISOString();

  if (user) {
    user.lastLoginAt = now;
    if (name && (!user.name || user.name.startsWith('usr_'))) user.name = name;
    if (picture) user.picture = picture;
    if (sub && !user.sub) user.sub = sub;
  } else {
    // Initial role determination:
    // If email matches creator/admin or if no admin exists: 'admin'
    // Otherwise: 'new' (must be approved by admin)
    const isAdminEmail = email === defaultAdminEmail.toLowerCase();
    const hasExistingAdmin = db.users.some((u) => u.role === 'admin');
    const initialRole: UserRole = (isAdminEmail || !hasExistingAdmin) ? 'admin' : 'new';

    user = {
      id: 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      email,
      name: name || email.split('@')[0],
      picture: picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(name || email)}&background=0284c7&color=fff`,
      role: initialRole,
      createdAt: now,
      lastLoginAt: now,
      sub: sub || undefined,
    };
    db.users.push(user);
  }

  saveDb(db);

  const sessionToken = 'tok_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
  activeSessions.set(sessionToken, {
    userId: user.id,
    email: user.email,
    role: user.role,
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
  });

  res.json({
    success: true,
    user,
    token: sessionToken,
    message: user.role === 'admin'
      ? 'Вхід виконано (Адміністратор - повний доступ)'
      : (user.role === 'user'
        ? 'Вхід виконано (Користувач - режим перегляду)'
        : 'Акаунт зареєстровано. Доступ надається адміністратором.'),
  });
});

app.post('/api/auth/logout', (req, res): void => {
  const authHeader = (req.headers['authorization'] || '') as string;
  const headerToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '';
  if (headerToken) {
    activeSessions.delete(headerToken);
  }
  res.json({ success: true, message: 'Успішний вихід із системи' });
});

// User access management by Admin
app.get('/api/users', (req, res): void => {
  const db = loadDb();
  const currentUser = getAuthenticatedUser(req, db);
  if (!currentUser || currentUser.role !== 'admin') {
    res.status(403).json({ error: 'Тільки адміністратор має доступ до списку користувачів' });
    return;
  }

  const roleOrder: Record<UserRole, number> = { new: 0, user: 1, admin: 2 };
  const sorted = [...(db.users || [])].sort((a, b) => (roleOrder[a.role] ?? 3) - (roleOrder[b.role] ?? 3));
  res.json(sorted);
});

app.post('/api/users', (req, res): void => {
  const db = loadDb();
  const currentUser = getAuthenticatedUser(req, db);
  if (!currentUser || currentUser.role !== 'admin') {
    res.status(403).json({ error: 'Тільки адміністратор може додавати користувачів' });
    return;
  }

  const { email, name, role } = req.body;
  if (!email || !email.includes('@')) {
    res.status(400).json({ error: 'Вкажіть коректний Google Email' });
    return;
  }

  const cleanEmail = email.trim().toLowerCase();
  const existing = (db.users || []).find((u) => u.email.toLowerCase() === cleanEmail);
  if (existing) {
    existing.role = (role as UserRole) || 'user';
    if (name) existing.name = name;
    saveDb(db);
    res.json(existing);
    return;
  }

  const newUser: AppUser = {
    id: 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    email: cleanEmail,
    name: name || cleanEmail.split('@')[0],
    picture: `https://ui-avatars.com/api/?name=${encodeURIComponent(name || cleanEmail)}&background=0284c7&color=fff`,
    role: (role as UserRole) || 'user',
    createdAt: new Date().toISOString(),
    lastLoginAt: '',
  };

  if (!db.users) db.users = [];
  db.users.push(newUser);
  saveDb(db);
  res.status(201).json(newUser);
});

app.put('/api/users/:id/role', (req, res): void => {
  const db = loadDb();
  const currentUser = getAuthenticatedUser(req, db);
  if (!currentUser || currentUser.role !== 'admin') {
    res.status(403).json({ error: 'Тільки адміністратор може змінювати права' });
    return;
  }

  const { id } = req.params;
  const { role } = req.body;

  if (!['admin', 'user', 'new'].includes(role)) {
    res.status(400).json({ error: 'Недійсний тип ролі (має бути admin, user або new)' });
    return;
  }

  const target = (db.users || []).find((u) => u.id === id);
  if (!target) {
    res.status(404).json({ error: 'Користувача не знайдено' });
    return;
  }

  // Prevent demoting the only admin
  if (target.role === 'admin' && role !== 'admin') {
    const adminCount = (db.users || []).filter((u) => u.role === 'admin').length;
    if (adminCount <= 1) {
      res.status(400).json({ error: 'Неможливо забрати права у єдиного адміністратора системи' });
      return;
    }
  }

  target.role = role as UserRole;
  saveDb(db);
  res.json(target);
});

app.delete('/api/users/:id', (req, res): void => {
  const db = loadDb();
  const currentUser = getAuthenticatedUser(req, db);
  if (!currentUser || currentUser.role !== 'admin') {
    res.status(403).json({ error: 'Тільки адміністратор може видаляти користувачів' });
    return;
  }

  const { id } = req.params;
  const index = (db.users || []).findIndex((u) => u.id === id);
  if (index === -1) {
    res.status(404).json({ error: 'Користувача не знайдено' });
    return;
  }

  const target = db.users[index];
  if (target.role === 'admin') {
    const adminCount = (db.users || []).filter((u) => u.role === 'admin').length;
    if (adminCount <= 1) {
      res.status(400).json({ error: 'Неможливо видалити єдиного адміністратора системи' });
      return;
    }
  }

  db.users.splice(index, 1);
  saveDb(db);
  res.json({ success: true, message: 'Користувача видалено' });
});

// API Endpoints: Real-time sync version check
app.get('/api/sync/version', (_req, res) => {
  res.json({
    version: dbRevision,
    lastUpdate: lastDbUpdate,
    cloudSqlAvailable: isCloudSqlAvailable(),
  });
});

// API Endpoints
// 1. Get all clients
app.get('/api/clients', (_req, res) => {
  const db = loadDb();
  res.json(db.clients);
});

// 2. Add client
app.post('/api/clients', (req, res) => {
  const db = loadDb();
  const body = req.body;

  const plan: SubscriptionPlanType = body.subscriptionPlan || '1usd';
  const defaultPriceForPlan = plan === '2usd' ? 150 : (plan === '1usd' ? 100 : db.settings.defaultMonthlyPrice || 100);
  const monthlyPrice = Number(body.monthlyPrice) || defaultPriceForPlan;
  const costUsd = Number(body.costUsd) || (plan === '2usd' ? 2 : (plan === '1usd' ? 1 : 1));

  const startDate = body.startDate || new Date().toISOString().split('T')[0];
  // If activeUntil not provided, calculate exactly 1 month "число в число"
  const activeUntil = body.activeUntil || addMonthsExact(startDate, 1);

  const newClient: Client = {
    id: 'c_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    fullName: body.fullName || 'Новий абонент',
    phone: body.phone || '',
    iptvLogin: body.iptvLogin || ('iptv_' + Math.random().toString(36).substring(2, 8)),
    deviceInfo: body.deviceInfo || '',
    subscriptionPlan: plan,
    costUsd,
    monthlyPrice,
    startDate,
    activeUntil,
    balance: Number(body.balance) || 0,
    status: computeClientStatus({ activeUntil, status: body.status }),
    providerAccountId: body.providerAccountId || undefined,
    telegramChatId: body.telegramChatId || '',
    telegramUsername: body.telegramUsername || '',
    viberId: body.viberId || '',
    notes: body.notes || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // If assigned to a provider account, add to account's assignedClientIds if slot available
  if (newClient.providerAccountId) {
    const acc = db.providerAccounts.find((a) => a.id === newClient.providerAccountId);
    if (acc) {
      if (!acc.assignedClientIds) acc.assignedClientIds = [];
      if (!acc.assignedClientIds.includes(newClient.id) && acc.assignedClientIds.length < (acc.maxSlots || 2)) {
        acc.assignedClientIds.push(newClient.id);
      }
    }
  }

  db.clients.unshift(newClient);
  saveDb(db);
  if (isCloudSqlAvailable()) {
    saveClientToCloudSql(newClient as unknown as Record<string, unknown>).catch((e) => console.warn('[Cloud SQL] Save client error:', e));
  }
  res.status(201).json(newClient);
});

// 3. Update client
app.put('/api/clients/:id', (req, res) => {
  const db = loadDb();
  const id = req.params.id;
  const index = db.clients.findIndex((c) => c.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Client not found' });
  }

  const existing = db.clients[index];
  const body = req.body;

  const plan: SubscriptionPlanType = body.subscriptionPlan || existing.subscriptionPlan || '1usd';
  const costUsd = body.costUsd !== undefined ? Number(body.costUsd) : (existing.costUsd || (plan === '2usd' ? 2 : 1));

  // Check if provider account changed
  const oldAccountId = existing.providerAccountId;
  const newAccountId = body.providerAccountId !== undefined ? body.providerAccountId : oldAccountId;

  if (oldAccountId !== newAccountId) {
    // Remove from old account
    if (oldAccountId) {
      const oldAcc = db.providerAccounts.find((a) => a.id === oldAccountId);
      if (oldAcc && oldAcc.assignedClientIds) {
        oldAcc.assignedClientIds = oldAcc.assignedClientIds.filter((cid) => cid !== id);
        if (isCloudSqlAvailable()) {
          saveProviderAccountToCloudSql(oldAcc as unknown as Record<string, unknown>).catch((e) => console.warn('[Cloud SQL] Update old account error:', e));
        }
      }
    }
    // Add to new account
    if (newAccountId) {
      const newAcc = db.providerAccounts.find((a) => a.id === newAccountId);
      if (newAcc) {
        if (!newAcc.assignedClientIds) newAcc.assignedClientIds = [];
        if (!newAcc.assignedClientIds.includes(id) && newAcc.assignedClientIds.length < (newAcc.maxSlots || 2)) {
          newAcc.assignedClientIds.push(id);
        }
        if (isCloudSqlAvailable()) {
          saveProviderAccountToCloudSql(newAcc as unknown as Record<string, unknown>).catch((e) => console.warn('[Cloud SQL] Update new account error:', e));
        }
      }
    }
  }

  const updated: Client = {
    ...existing,
    ...body,
    subscriptionPlan: plan,
    costUsd,
    providerAccountId: newAccountId || undefined,
    monthlyPrice: body.monthlyPrice !== undefined ? Number(body.monthlyPrice) : existing.monthlyPrice,
    balance: body.balance !== undefined ? Number(body.balance) : existing.balance,
    updatedAt: new Date().toISOString(),
  };
  updated.status = computeClientStatus(updated);

  db.clients[index] = updated;
  saveDb(db);
  if (isCloudSqlAvailable()) {
    saveClientToCloudSql(updated as unknown as Record<string, unknown>).catch((e) => console.warn('[Cloud SQL] Update client error:', e));
  }
  return res.json(updated);
});

// 4. Delete client
app.delete('/api/clients/:id', (req, res) => {
  const db = loadDb();
  const id = req.params.id;
  const initialLen = db.clients.length;
  db.clients = db.clients.filter((c) => c.id !== id);

  if (db.clients.length === initialLen) {
    return res.status(404).json({ error: 'Client not found' });
  }

  // Remove from any assigned provider accounts
  for (const acc of db.providerAccounts) {
    if (acc.assignedClientIds && acc.assignedClientIds.includes(id)) {
      acc.assignedClientIds = acc.assignedClientIds.filter((cid) => cid !== id);
      if (isCloudSqlAvailable()) {
        saveProviderAccountToCloudSql(acc as unknown as Record<string, unknown>).catch((e) => console.warn('[Cloud SQL] Update account on delete client error:', e));
      }
    }
  }

  if (isCloudSqlAvailable()) {
    deleteClientFromCloudSql(id).catch((e) => console.warn('[Cloud SQL] Delete error:', e));
  }
  saveDb(db);
  return res.json({ success: true, id });
});

// 5. Client Payment & Auto-Extension Endpoint
// Calculates extension based on deposit amount and leftover balance, exactly "число в число"
app.post('/api/clients/:id/pay', (req, res) => {
  const db = loadDb();
  const id = req.params.id;
  const client = db.clients.find((c) => c.id === id);

  if (!client) {
    return res.status(404).json({ error: 'Client not found' });
  }

  const depositAmount = Number(req.body.amount);
  if (isNaN(depositAmount) || depositAmount <= 0) {
    return res.status(400).json({ error: 'Сума внеску повинна бути більшою за 0' });
  }

  const monthlyPrice = client.monthlyPrice > 0 ? client.monthlyPrice : 100;
  const previousBalance = client.balance || 0;
  const totalAvailable = previousBalance + depositAmount;
  const monthsToAdd = Math.floor(totalAvailable / monthlyPrice);
  const newBalance = totalAvailable % monthlyPrice;

  const previousActiveUntil = client.activeUntil;
  // If extension is applied, add exact months "число в число"
  let baseDateForExtension = client.activeUntil;
  // If user expired more than 30 days ago and admin checked "startFromToday", allow using today
  if (req.body.startFromToday) {
    baseDateForExtension = new Date().toISOString().split('T')[0];
  }

  const newActiveUntil = monthsToAdd > 0
    ? addMonthsExact(baseDateForExtension, monthsToAdd)
    : previousActiveUntil;

  const costUsdPerMonth = client.costUsd || (client.subscriptionPlan === '2usd' ? 2 : 1);

  client.balance = newBalance;
  client.activeUntil = newActiveUntil;
  client.status = computeClientStatus(client);
  client.updatedAt = new Date().toISOString();

  const transaction: PaymentTransaction = {
    id: 'pay_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    clientId: client.id,
    clientName: client.fullName,
    amount: depositAmount,
    monthlyPrice,
    previousBalance,
    newBalance,
    monthsAdded: monthsToAdd,
    costUsdPerMonth,
    totalUsdDeducted: 0, // DEDUCTED ONLY BY IPTV PROVIDER ACCOUNTS
    previousActiveUntil,
    newActiveUntil,
    date: new Date().toISOString(),
    note: req.body.note || `Внесок ${depositAmount} грн (продовжено особистий термін на ${monthsToAdd} міс. до ${newActiveUntil}, залишок на балансі: ${newBalance} грн)`,
  };

  db.payments.unshift(transaction);
  saveDb(db);
  if (isCloudSqlAvailable()) {
    saveClientToCloudSql(client as unknown as Record<string, unknown>).catch((e) => console.warn('[Cloud SQL] Pay client update error:', e));
    savePaymentToCloudSql(transaction as unknown as Record<string, unknown>).catch((e) => console.warn('[Cloud SQL] Save payment error:', e));
  }

  return res.json({
    client,
    transaction,
    summary: {
      depositAmount,
      totalAvailable,
      monthsAdded: monthsToAdd,
      costUsdPerMonth,
      totalUsdDeducted: 0,
      newBalance,
      newActiveUntil,
    },
  });
});

// 6. Payments history
app.get('/api/payments', (_req, res) => {
  const db = loadDb();
  res.json(db.payments);
});

// 6.0.1 Update payment
app.put('/api/payments/:id', (req, res) => {
  const db = loadDb();
  const id = req.params.id;
  const index = db.payments.findIndex((p) => p.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Платіж не знайдено' });
  }

  const existing = db.payments[index];
  const body = req.body;

  const updated: PaymentTransaction = {
    ...existing,
    amount: body.amount !== undefined ? Number(body.amount) : existing.amount,
    date: body.date || existing.date,
    note: body.note !== undefined ? body.note : existing.note,
    monthsAdded: body.monthsAdded !== undefined ? Number(body.monthsAdded) : existing.monthsAdded,
    newActiveUntil: body.newActiveUntil || existing.newActiveUntil,
    newBalance: body.newBalance !== undefined ? Number(body.newBalance) : existing.newBalance,
    monthlyPrice: body.monthlyPrice !== undefined ? Number(body.monthlyPrice) : existing.monthlyPrice,
    clientName: body.clientName !== undefined ? body.clientName : existing.clientName,
  };

  db.payments[index] = updated;

  // If syncWithClient requested, update the client's current activeUntil or balance
  if (body.syncWithClient && existing.clientId) {
    const client = db.clients.find((c) => c.id === existing.clientId);
    if (client) {
      if (body.newActiveUntil) {
        client.activeUntil = body.newActiveUntil;
        client.status = computeClientStatus(client);
      }
      if (body.newBalance !== undefined) {
        client.balance = Number(body.newBalance);
      }
      client.updatedAt = new Date().toISOString();
      if (isCloudSqlAvailable()) {
        saveClientToCloudSql(client as unknown as Record<string, unknown>).catch((e) => console.warn('[Cloud SQL] Client sync error:', e));
      }
    }
  }

  saveDb(db);
  if (isCloudSqlAvailable()) {
    savePaymentToCloudSql(updated as unknown as Record<string, unknown>).catch((e) => console.warn('[Cloud SQL] Update payment error:', e));
  }
  return res.json(updated);
});

// 6.0.2 Delete payment
app.delete('/api/payments/:id', (req, res) => {
  const db = loadDb();
  const id = req.params.id;
  const initialLen = db.payments.length;
  db.payments = db.payments.filter((p) => p.id !== id);

  if (db.payments.length === initialLen) {
    return res.status(404).json({ error: 'Платіж не знайдено' });
  }

  if (isCloudSqlAvailable()) {
    deletePaymentFromCloudSql(id).catch((e) => console.warn('[Cloud SQL] Delete error:', e));
  }
  saveDb(db);
  return res.json({ success: true, id });
});

// 6.1 Provider Accounts API
app.get('/api/accounts', (_req, res) => {
  const db = loadDb();
  const accountsWithDetails = db.providerAccounts.map((acc) => {
    const assignedIds = acc.assignedClientIds || [];
    const connectedClients = assignedIds
      .map((cid) => db.clients.find((c) => c.id === cid))
      .filter((c): c is Client => Boolean(c))
      .map((c) => ({
        id: c.id,
        fullName: c.fullName,
        phone: c.phone,
        iptvLogin: c.iptvLogin,
        subscriptionPlan: c.subscriptionPlan || '1usd',
        costUsd: c.costUsd || 1,
        monthlyPrice: c.monthlyPrice,
        activeUntil: c.activeUntil,
        status: c.status,
      }));

    const maxSlots = acc.maxSlots || 2;
    const occupiedSlots = connectedClients.length;
    const availableSlots = Math.max(0, maxSlots - occupiedSlots);
    const daysRemaining = acc.validUntil ? getDaysRemaining(acc.validUntil) : 999;
    const status = !acc.validUntil ? 'active' : (daysRemaining <= 0 ? 'expired' : (daysRemaining <= 7 ? 'expiring_soon' : 'active'));

    const deduction = getAccountDeductionDetails(acc);

    return {
      ...acc,
      pricePerMonthUsd: acc.pricePerMonthUsd || 1,
      startDate: acc.startDate || deduction.startDateStr,
      monthsCount: acc.monthsCount || 1,
      validUntil: acc.validUntil || '',
      totalDeductedUsd: deduction.totalDeductedUsd,
      renewals: acc.renewals || [],
      daysRemaining,
      status,
      maxSlots,
      clients: connectedClients,
      occupiedSlots,
      availableSlots,
      isFull: occupiedSlots >= maxSlots,
    };
  });
  return res.json(accountsWithDetails);
});

app.post('/api/accounts', (req, res) => {
  const db = loadDb();
  const body = req.body;

  if (!body.name || !body.login) {
    return res.status(400).json({ error: 'Назва та логін акаунту обов\'язкові' });
  }

  const pricePerMonthUsd = Number(body.pricePerMonthUsd) === 2 ? 2 : 1;
  const monthsCount = Math.max(1, Number(body.monthsCount) || 1);
  const startDate = body.startDate || new Date().toISOString().split('T')[0];
  const validUntil = addMonthsExact(startDate, monthsCount);

  const newAccount: ProviderAccount = {
    id: 'acc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    name: body.name.trim(),
    login: body.login.trim(),
    password: body.password?.trim() || '',
    playlistUrl: body.playlistUrl?.trim() || '',
    serverUrl: body.serverUrl?.trim() || '',
    maxSlots: 2, // Hard limit 2 slots per account as requested by user
    assignedClientIds: [],
    pricePerMonthUsd,
    startDate,
    monthsCount,
    validUntil,
    totalDeductedUsd: 0,
    renewals: [],
    notes: body.notes?.trim() || '',
    createdAt: new Date().toISOString(),
  };

  const deduction = getAccountDeductionDetails(newAccount);
  newAccount.totalDeductedUsd = deduction.totalDeductedUsd;

  db.providerAccounts.push(newAccount);
  saveDb(db);
  if (isCloudSqlAvailable()) {
    saveProviderAccountToCloudSql(newAccount as unknown as Record<string, unknown>).catch((e) => console.warn('[Cloud SQL] Save account error:', e));
  }
  return res.status(201).json(newAccount);
});

// Extend / Renew Provider Account at IPTV Provider
app.post('/api/accounts/:id/renew', (req, res) => {
  const db = loadDb();
  const id = req.params.id;
  const account = db.providerAccounts.find((a) => a.id === id);

  if (!account) {
    return res.status(404).json({ error: 'Акаунт IPTV не знайдено' });
  }

  const months = Math.max(1, Number(req.body.months) || 1);
  const pricePerMonthUsd = Number(req.body.pricePerMonthUsd) === 2
    ? 2
    : (Number(req.body.pricePerMonthUsd) === 1 ? 1 : (account.pricePerMonthUsd || 1));

  const todayStr = new Date().toISOString().split('T')[0];
  const isCurrentlyValid = account.validUntil && getDaysRemaining(account.validUntil) > 0;
  const baseDate = isCurrentlyValid ? account.validUntil : todayStr;
  const newValidUntil = addMonthsExact(baseDate, months);

  account.validUntil = newValidUntil;
  account.pricePerMonthUsd = pricePerMonthUsd;
  account.monthsCount = (account.monthsCount || 0) + months;

  const deduction = getAccountDeductionDetails(account);
  account.totalDeductedUsd = deduction.totalDeductedUsd;
  account.updatedAt = new Date().toISOString();

  saveDb(db);
  if (isCloudSqlAvailable()) {
    saveProviderAccountToCloudSql(account as unknown as Record<string, unknown>).catch((e) => console.warn('[Cloud SQL] Renew account error:', e));
  }

  return res.json({
    success: true,
    account,
    summary: {
      monthsAdded: months,
      costUsd: deduction.totalDeductedUsd,
      newValidUntil,
    },
  });
});

app.put('/api/accounts/:id', (req, res) => {
  const db = loadDb();
  const id = req.params.id;
  const index = db.providerAccounts.findIndex((a) => a.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Акаунт не знайдено' });
  }

  const existing = db.providerAccounts[index];
  const body = req.body;

  const updated: ProviderAccount = {
    ...existing,
    name: body.name !== undefined ? body.name.trim() : existing.name,
    login: body.login !== undefined ? body.login.trim() : existing.login,
    password: body.password !== undefined ? body.password.trim() : existing.password,
    playlistUrl: body.playlistUrl !== undefined ? body.playlistUrl.trim() : existing.playlistUrl,
    serverUrl: body.serverUrl !== undefined ? body.serverUrl.trim() : existing.serverUrl,
    pricePerMonthUsd: body.pricePerMonthUsd ? Number(body.pricePerMonthUsd) : existing.pricePerMonthUsd,
    validUntil: body.validUntil !== undefined ? body.validUntil : existing.validUntil,
    maxSlots: 2, // Keep 2 slots max
    notes: body.notes !== undefined ? body.notes.trim() : existing.notes,
    updatedAt: new Date().toISOString(),
  };

  db.providerAccounts[index] = updated;
  saveDb(db);
  if (isCloudSqlAvailable()) {
    saveProviderAccountToCloudSql(updated as unknown as Record<string, unknown>).catch((e) => console.warn('[Cloud SQL] Update account error:', e));
  }
  return res.json(updated);
});

app.delete('/api/accounts/:id', (req, res) => {
  const db = loadDb();
  const id = req.params.id;
  const index = db.providerAccounts.findIndex((a) => a.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Акаунт не знайдено' });
  }

  // Unlink any clients assigned to this account
  for (const client of db.clients) {
    if (client.providerAccountId === id) {
      client.providerAccountId = undefined;
      if (isCloudSqlAvailable()) {
        saveClientToCloudSql(client as unknown as Record<string, unknown>).catch((e) => console.warn('[Cloud SQL] Unlink client error:', e));
      }
    }
  }

  db.providerAccounts.splice(index, 1);
  if (isCloudSqlAvailable()) {
    deleteProviderAccountFromCloudSql(id).catch((e) => console.warn('[Cloud SQL] Delete error:', e));
  }
  saveDb(db);
  return res.json({ success: true, id });
});

// Assign or unassign client to provider account slot (Max 2)
app.post('/api/accounts/:id/assign', (req, res) => {
  const db = loadDb();
  const id = req.params.id;
  const { clientId, action } = req.body;

  const account = db.providerAccounts.find((a) => a.id === id);
  if (!account) {
    return res.status(404).json({ error: 'Акаунт не знайдено' });
  }

  const client = db.clients.find((c) => c.id === clientId);
  if (!client) {
    return res.status(404).json({ error: 'Абонента не знайдено' });
  }

  if (!account.assignedClientIds) account.assignedClientIds = [];

  if (action === 'unassign') {
    account.assignedClientIds = account.assignedClientIds.filter((cid) => cid !== clientId);
    if (client.providerAccountId === id) {
      client.providerAccountId = undefined;
    }
  } else {
    // Check max slots limit (max 2)
    if (account.assignedClientIds.length >= (account.maxSlots || 2) && !account.assignedClientIds.includes(clientId)) {
      return res.status(400).json({ error: 'На цей акаунт вже підключено максимальну кількість абонентів (максимум 2)!' });
    }

    // If client was on another account, remove from there
    if (client.providerAccountId && client.providerAccountId !== id) {
      const prevAcc = db.providerAccounts.find((a) => a.id === client.providerAccountId);
      if (prevAcc && prevAcc.assignedClientIds) {
        prevAcc.assignedClientIds = prevAcc.assignedClientIds.filter((cid) => cid !== clientId);
        if (isCloudSqlAvailable()) {
          saveProviderAccountToCloudSql(prevAcc as unknown as Record<string, unknown>).catch((e) => console.warn('[Cloud SQL] Prev account error:', e));
        }
      }
    }

    if (!account.assignedClientIds.includes(clientId)) {
      account.assignedClientIds.push(clientId);
    }
    client.providerAccountId = id;
  }

  saveDb(db);
  if (isCloudSqlAvailable()) {
    saveProviderAccountToCloudSql(account as unknown as Record<string, unknown>).catch((e) => console.warn('[Cloud SQL] Assign account error:', e));
    saveClientToCloudSql(client as unknown as Record<string, unknown>).catch((e) => console.warn('[Cloud SQL] Assign client error:', e));
  }
  return res.json({ success: true, account, client });
});

// 6.2 Budget & Provider Deposits API
// Calculates entire budget in UAH (income vs expenses) and Provider Account balance in USD
app.get('/api/budget', (_req, res) => {
  const db = loadDb();
  if (!db.customLedgerEntries) db.customLedgerEntries = [];
  if (!db.providerBalanceAdjustments) db.providerBalanceAdjustments = [];

  // 1. Total spent in UAH for provider deposits (with commissions)
  let totalExpensesUah = db.providerDeposits.reduce((sum, d) => sum + (Number(d.spentUah) || 0), 0);

  // 2. Client payments sum (UAH) - all incomes from subscribers
  let totalIncomeUah = db.payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  // Add custom ledger entries to totalIncomeUah / totalExpensesUah
  for (const entry of db.customLedgerEntries) {
    if (entry.category && ['client_payment', 'provider_topup', 'account_payment'].includes(entry.category)) {
      continue;
    }
    const uah = Number(entry.amountUah) || 0;
    if (uah > 0) {
      totalIncomeUah += uah;
    } else if (uah < 0) {
      totalExpensesUah += Math.abs(uah);
    }
  }

  const netProfitUah = totalIncomeUah - totalExpensesUah;

  // 3. Gather IPTV accounts deductions for ledger (1 or 2 USD on connection day per month)
  // Takes into account user overrides and excluded/deleted deductions!
  const accountDeductions: BudgetLedgerItem[] = [];
  for (const acc of db.providerAccounts) {
    const det = getAccountDeductionDetails(acc);
    for (let i = 0; i < det.actualDeductedMonths; i++) {
      const dedId = `ded_${acc.id}_m${i + 1}`;
      const override = (db.accountDeductionOverrides || []).find((o) => o.id === dedId);
      if (override?.isExcluded) {
        continue; // Excluded/deleted by user!
      }

      const cycleDate = override?.date || addMonthsExact(det.startDateStr, i);
      const amountUsd = override?.amountUsd !== undefined ? override.amountUsd : -det.pricePerMonth;
      const amountUah = override?.amountUah !== undefined ? override.amountUah : 0;
      const title = override?.title || `Щомісячне списання: ${acc.name}`;
      const subtitle = override?.subtitle || `-$${Math.abs(amountUsd)} USD в день підключення (місяць ${i + 1}/${det.totalMonthsLimit})`;
      const note = override?.note || `Автоматичне списання $${Math.abs(amountUsd)}/міс на дату підключення`;

      accountDeductions.push({
        id: dedId,
        type: 'deduction',
        category: 'account_payment',
        date: cycleDate,
        amountUah,
        amountUsd,
        title,
        subtitle,
        note,
        accountId: acc.id,
        accountName: acc.name,
      });
    }
  }

  // Monthly burn rate in USD: sum of pricePerMonthUsd of all active provider lines
  const activeAccounts = db.providerAccounts.filter((a) => !a.validUntil || getDaysRemaining(a.validUntil) >= 0);
  const monthlyBurnUsd = activeAccounts.reduce((sum, a) => sum + (Number(a.pricePerMonthUsd) || 1), 0);

  const clientPaymentEntries: BudgetLedgerItem[] = db.payments.map((p) => ({
    id: p.id,
    type: 'income',
    category: 'client_payment',
    date: p.date,
    amountUah: p.amount,
    amountUsd: 0,
    title: `Оплата від абонента: ${p.clientName}`,
    subtitle: `+${p.amount} ₴ (+${p.monthsAdded} міс. до особистого терміну, залишок: ${p.newBalance} ₴)`,
    note: p.note,
    clientId: p.clientId,
    clientName: p.clientName,
  }));

  const depositEntries: BudgetLedgerItem[] = db.providerDeposits.map((d) => ({
    id: d.id,
    type: 'expense',
    category: 'provider_topup',
    date: d.date,
    amountUah: -d.spentUah,
    amountUsd: d.amountUsd,
    title: `Поповнення рахунку IPTV: +$${d.amountUsd}`,
    subtitle: `Витрачено ${d.spentUah} ₴ (курс ~${(d.spentUah / (d.amountUsd || 1)).toFixed(2)} ₴/$ з комісією)`,
    note: d.note,
    paymentMethod: d.paymentMethod,
  }));

  const adjustmentEntries: BudgetLedgerItem[] = db.providerBalanceAdjustments.map((a) => ({
    id: a.id,
    type: 'adjustment',
    category: 'provider_adjustment',
    date: a.date,
    amountUah: 0,
    amountUsd: a.amountUsd,
    title: `Коригування балансу провайдера: ${a.amountUsd >= 0 ? '+' : ''}$${a.amountUsd}`,
    subtitle: `Ручне калібрування балансу провайдера`,
    note: a.note || 'Коригування балансу провайдера',
  }));

  const customEntries: BudgetLedgerItem[] = (db.customLedgerEntries || []).map((c) => ({
    ...c,
    isCustom: true,
  }));

  // Combine all entries and calculate chronological provider balance (before and after)
  const allEntries: BudgetLedgerItem[] = [
    ...clientPaymentEntries,
    ...depositEntries,
    ...accountDeductions,
    ...adjustmentEntries,
    ...customEntries,
  ];

  const getTime = (d?: string) => {
    if (!d) return 0;
    const t = new Date(d).getTime();
    return isNaN(t) ? 0 : t;
  };

  const getPriority = (item: BudgetLedgerItem) => {
    const usd = Number(item.amountUsd) || 0;
    if (item.category === 'provider_topup' && usd > 0) return 1;
    if (usd > 0) return 2;
    if (item.category === 'provider_adjustment') return 3;
    if (usd < 0) return 4;
    return 5;
  };

  // Sort chronologically ascending (oldest to newest) to track running balance accurately
  allEntries.sort((a, b) => {
    const timeA = getTime(a.date);
    const timeB = getTime(b.date);
    if (timeA !== timeB) return timeA - timeB;
    return getPriority(a) - getPriority(b);
  });

  // Calculate provider balance before and after each transaction affecting USD
  let runningProviderBalance = 0;
  for (const item of allEntries) {
    const usdChange = Number(item.amountUsd) || 0;
    if (usdChange !== 0) {
      const before = Math.round(runningProviderBalance * 100) / 100;
      const after = Math.round((runningProviderBalance + usdChange) * 100) / 100;
      item.balanceBeforeUsd = before;
      item.balanceAfterUsd = after;
      runningProviderBalance = after;
    }
  }

  // Exact provider balance strictly synchronized with the ledger running balance
  const providerBalanceUsd = Math.round(runningProviderBalance * 100) / 100;
  const calculatedProviderBalanceUsd = providerBalanceUsd;

  // Exact deposited and deducted amounts from all ledger entries
  const totalDepositedUsd = Math.round(
    allEntries
      .filter((e) => (Number(e.amountUsd) || 0) > 0)
      .reduce((sum, e) => sum + (Number(e.amountUsd) || 0), 0) * 100
  ) / 100;

  const totalDeductedUsd = Math.round(
    allEntries
      .filter((e) => (Number(e.amountUsd) || 0) < 0)
      .reduce((sum, e) => sum + Math.abs(Number(e.amountUsd) || 0), 0) * 100
  ) / 100;

  const providerBalanceAdjustmentsSum = Math.round(
    (db.providerBalanceAdjustments || []).reduce((sum, a) => sum + (Number(a.amountUsd) || 0), 0) * 100
  ) / 100;

  const runwayMonths = monthlyBurnUsd > 0 ? (providerBalanceUsd / monthlyBurnUsd) : 999;

  // Populate balanceBeforeUsd and balanceAfterUsd on provider deposits as well
  const depositsWithBalances = db.providerDeposits.map((d) => {
    const matchingLedger = allEntries.find((e) => e.id === d.id);
    return {
      ...d,
      balanceBeforeUsd: matchingLedger?.balanceBeforeUsd,
      balanceAfterUsd: matchingLedger?.balanceAfterUsd,
    };
  });

  // Combined ledger of all transactions sorted by date descending (newest first for UI display)
  const ledger: BudgetLedgerItem[] = [...allEntries].sort((a, b) => {
    const timeA = getTime(a.date);
    const timeB = getTime(b.date);
    if (timeB !== timeA) return timeB - timeA;
    return getPriority(b) - getPriority(a);
  });

  const activeClients = db.clients.filter((c) => c.status === 'active' || c.status === 'expiring_soon');

  res.json({
    summary: {
      totalIncomeUah,
      totalExpensesUah,
      netProfitUah,
      totalDepositedUsd,
      totalDeductedUsd,
      providerBalanceUsd,
      monthlyBurnUsd,
      runwayMonths: Math.max(0, Math.round(runwayMonths * 10) / 10),
      activeClientsCount: activeClients.length,
      averageExchangeRate: totalDepositedUsd > 0 ? Math.round((totalExpensesUah / totalDepositedUsd) * 100) / 100 : 44,
      calculatedProviderBalanceUsd,
      providerBalanceAdjustmentsSum,
    },
    deposits: depositsWithBalances,
    adjustments: db.providerBalanceAdjustments,
    ledger,
  });
});

// Custom Ledger Entries CRUD
app.post('/api/budget/ledger', async (req, res) => {
  const db = loadDb();
  if (!db.customLedgerEntries) db.customLedgerEntries = [];

  const {
    type,
    category,
    date,
    amountUah,
    amountUsd,
    title,
    subtitle,
    note,
    paymentMethod,
    clientId,
    accountId,
  } = req.body;

  let clientName = req.body.clientName;
  if (clientId && !clientName) {
    const c = db.clients.find((client) => client.id === clientId);
    if (c) clientName = c.fullName;
  }

  let accountName = req.body.accountName;
  if (accountId && !accountName) {
    const a = db.providerAccounts.find((acc) => acc.id === accountId);
    if (a) accountName = a.name;
  }

  const numUah = Number(amountUah) || 0;
  let finalUah = numUah;
  if (type === 'expense') {
    finalUah = -Math.abs(numUah);
  } else if (type === 'income') {
    finalUah = Math.abs(numUah);
  }

  let finalUsd: number | undefined = undefined;
  if (amountUsd !== undefined && amountUsd !== '' && amountUsd !== null) {
    const rawVal = Number(amountUsd);
    if (!isNaN(rawVal) && rawVal !== 0) {
      if (type === 'expense' && category !== 'provider_topup') {
        finalUsd = -Math.abs(rawVal);
      } else if (category === 'provider_topup' || type === 'income') {
        finalUsd = Math.abs(rawVal);
      } else {
        finalUsd = rawVal;
      }
    }
  }

  let finalTitle = title;
  let finalSubtitle = subtitle;

  if (!finalTitle) {
    if (category === 'client_payment') {
      finalTitle = clientName ? `Оплата від абонента: ${clientName}` : 'Оплата від абонента';
    } else if (category === 'account_payment') {
      finalTitle = accountName ? `Оплата за акаунт: ${accountName}` : 'Оплата за акаунт провайдера';
    } else if (category === 'provider_topup') {
      finalTitle = `Поповнення балансу провайдера: +$${Math.abs(finalUsd || 0)}`;
    } else if (category === 'provider_adjustment') {
      finalTitle = `Коригування балансу провайдера: ${finalUsd && finalUsd >= 0 ? '+' : ''}$${finalUsd || 0}`;
    } else if (type === 'expense') {
      finalTitle = finalUsd ? `Витрата з балансу (-$${Math.abs(finalUsd)})` : 'Витрата (ручний запис)';
    } else {
      finalTitle = 'Дохід (ручний запис)';
    }
  }

  if (!finalSubtitle) {
    if (finalUah !== 0) {
      finalSubtitle = `${finalUah > 0 ? '+' : ''}${finalUah} ₴`;
    }
    if (finalUsd !== undefined && finalUsd !== 0) {
      finalSubtitle = `${finalSubtitle ? finalSubtitle + ', ' : ''}${finalUsd > 0 ? '+' : '-'}$${Math.abs(finalUsd)} USD`;
    }
    if (!finalSubtitle) finalSubtitle = 'Запис у білінгу';
  }

  const newEntry: BudgetLedgerItem = {
    id: 'led_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    type: type || (finalUah >= 0 ? 'income' : 'expense'),
    category: category || 'custom',
    date: date || new Date().toISOString().split('T')[0],
    amountUah: finalUah,
    amountUsd: finalUsd,
    title: finalTitle,
    subtitle: finalSubtitle,
    note: note || '',
    paymentMethod: paymentMethod || '',
    clientId: clientId || undefined,
    clientName: clientName || undefined,
    accountId: accountId || undefined,
    accountName: accountName || undefined,
    isCustom: true,
  };

  db.customLedgerEntries.unshift(newEntry);
  saveDb(db);
  if (isCloudSqlAvailable()) {
    try {
      await saveCustomLedgerEntryToCloudSql(newEntry as unknown as Record<string, unknown>);
    } catch (e) {
      console.warn('[Cloud SQL] Save ledger error:', e);
    }
  }
  return res.status(201).json(newEntry);
});

app.put('/api/budget/ledger/:id', (req, res) => {
  const db = loadDb();
  if (!db.accountDeductionOverrides) db.accountDeductionOverrides = [];
  if (!db.customLedgerEntries) db.customLedgerEntries = [];
  if (!db.providerBalanceAdjustments) db.providerBalanceAdjustments = [];
  if (!db.providerDeposits) db.providerDeposits = [];
  if (!db.payments) db.payments = [];

  const id = req.params.id;
  const body = req.body;

  // 1. Account deduction override
  if (id.startsWith('ded_')) {
    let override = db.accountDeductionOverrides.find((o) => o.id === id);
    if (!override) {
      override = { id };
      db.accountDeductionOverrides.push(override);
    }
    override.isExcluded = false;
    if (body.amountUsd !== undefined) {
      const num = Number(body.amountUsd);
      override.amountUsd = num > 0 ? -num : num; // Deductions are negative USD
    }
    if (body.amountUah !== undefined) override.amountUah = Number(body.amountUah);
    if (body.date) override.date = body.date;
    if (body.title) override.title = body.title;
    if (body.note !== undefined) override.note = body.note;

    saveDb(db);
    if (isCloudSqlAvailable()) {
      saveAccountDeductionOverrideToCloudSql(override as unknown as Record<string, unknown>).catch((e) => console.warn('[Cloud SQL] Save override error:', e));
    }
    return res.json({ success: true, id, message: 'Списання успішно оновлено' });
  }

  // 2. Custom entry
  const customIdx = db.customLedgerEntries.findIndex((e) => e.id === id);
  if (customIdx !== -1) {
    const existing = db.customLedgerEntries[customIdx];
    let clientName = body.clientName !== undefined ? body.clientName : existing.clientName;
    if (body.clientId && !body.clientName) {
      const c = db.clients.find((client) => client.id === body.clientId);
      if (c) clientName = c.fullName;
    }
    let accountName = body.accountName !== undefined ? body.accountName : existing.accountName;
    if (body.accountId && !body.accountName) {
      const a = db.providerAccounts.find((acc) => acc.id === body.accountId);
      if (a) accountName = a.name;
    }

    const itemType = body.type !== undefined ? body.type : existing.type;
    const itemCategory = body.category !== undefined ? body.category : existing.category;

    let finalUah = body.amountUah !== undefined ? Number(body.amountUah) : existing.amountUah;
    if (itemType === 'expense' && finalUah > 0) finalUah = -finalUah;
    if (itemType === 'income' && finalUah < 0) finalUah = Math.abs(finalUah);

    let finalUsd = existing.amountUsd;
    if (body.amountUsd !== undefined) {
      if (body.amountUsd === null || body.amountUsd === '') {
        finalUsd = undefined;
      } else {
        const rawVal = Number(body.amountUsd);
        if (!isNaN(rawVal)) {
          if (itemType === 'expense' && itemCategory !== 'provider_topup') {
            finalUsd = -Math.abs(rawVal);
          } else if (itemCategory === 'provider_topup' || itemType === 'income') {
            finalUsd = Math.abs(rawVal);
          } else {
            finalUsd = rawVal;
          }
        }
      }
    }

    const updated: BudgetLedgerItem = {
      ...existing,
      type: itemType,
      category: itemCategory,
      date: body.date || existing.date,
      amountUah: finalUah,
      amountUsd: finalUsd,
      title: body.title !== undefined ? body.title : existing.title,
      subtitle: body.subtitle !== undefined ? body.subtitle : existing.subtitle,
      note: body.note !== undefined ? body.note : existing.note,
      paymentMethod: body.paymentMethod !== undefined ? body.paymentMethod : existing.paymentMethod,
      clientId: body.clientId !== undefined ? body.clientId : existing.clientId,
      clientName,
      accountId: body.accountId !== undefined ? body.accountId : existing.accountId,
      accountName,
      isCustom: true,
    };
    db.customLedgerEntries[customIdx] = updated;
    saveDb(db);
    if (isCloudSqlAvailable()) {
      saveCustomLedgerEntryToCloudSql(updated as unknown as Record<string, unknown>).catch((e) => console.warn('[Cloud SQL] Update custom ledger error:', e));
    }
    return res.json(updated);
  }

  // 3. Provider adjustment
  const adjIdx = db.providerBalanceAdjustments.findIndex((a) => a.id === id);
  if (adjIdx !== -1) {
    const adj = db.providerBalanceAdjustments[adjIdx];
    if (body.amountUsd !== undefined) adj.amountUsd = Number(body.amountUsd);
    if (body.date) adj.date = body.date;
    if (body.note !== undefined) adj.note = body.note;
    saveDb(db);
    if (isCloudSqlAvailable()) {
      saveProviderBalanceAdjustmentToCloudSql(adj as unknown as Record<string, unknown>).catch((e) => console.warn('[Cloud SQL] Update adj error:', e));
    }
    return res.json(adj);
  }

  // 4. Provider deposit
  const depIdx = db.providerDeposits.findIndex((d) => d.id === id);
  if (depIdx !== -1) {
    const dep = db.providerDeposits[depIdx];
    if (body.amountUsd !== undefined) dep.amountUsd = Number(body.amountUsd);
    if (body.spentUah !== undefined) dep.spentUah = Number(body.spentUah);
    if (body.amountUah !== undefined && body.spentUah === undefined) dep.spentUah = Math.abs(Number(body.amountUah));
    if (body.date) dep.date = body.date;
    if (body.paymentMethod !== undefined) dep.paymentMethod = body.paymentMethod;
    if (body.note !== undefined) dep.note = body.note;
    if (dep.amountUsd > 0 && dep.spentUah > 0) {
      dep.exchangeRate = Math.round((dep.spentUah / dep.amountUsd) * 100) / 100;
    }
    saveDb(db);
    if (isCloudSqlAvailable()) {
      saveProviderDepositToCloudSql(dep as unknown as Record<string, unknown>).catch((e) => console.warn('[Cloud SQL] Update dep error:', e));
    }
    return res.json(dep);
  }

  // 5. Client payment
  const payIdx = db.payments.findIndex((p) => p.id === id);
  if (payIdx !== -1) {
    const pay = db.payments[payIdx];
    if (body.amountUah !== undefined) pay.amount = Number(body.amountUah);
    if (body.amount !== undefined) pay.amount = Number(body.amount);
    if (body.date) pay.date = body.date;
    if (body.note !== undefined) pay.note = body.note;
    if (body.clientName) pay.clientName = body.clientName;
    saveDb(db);
    if (isCloudSqlAvailable()) {
      savePaymentToCloudSql(pay as unknown as Record<string, unknown>).catch((e) => console.warn('[Cloud SQL] Update payment error:', e));
    }
    return res.json(pay);
  }

  return res.status(404).json({ error: 'Запис не знайдено' });
});

app.delete('/api/budget/ledger/:id', (req, res) => {
  const db = loadDb();
  const id = req.params.id;

  if (!db.accountDeductionOverrides) db.accountDeductionOverrides = [];
  if (!db.customLedgerEntries) db.customLedgerEntries = [];
  if (!db.providerBalanceAdjustments) db.providerBalanceAdjustments = [];
  if (!db.providerDeposits) db.providerDeposits = [];
  if (!db.payments) db.payments = [];

  // 1. Account deduction
  if (id.startsWith('ded_')) {
    const existing = db.accountDeductionOverrides.find((o) => o.id === id);
    if (existing) {
      existing.isExcluded = true;
    } else {
      db.accountDeductionOverrides.push({ id, isExcluded: true });
    }
    saveDb(db);
    if (isCloudSqlAvailable()) {
      saveAccountDeductionOverrideToCloudSql({ id, isExcluded: true }).catch((e) => console.warn('[Cloud SQL] Save excluded override error:', e));
    }
    return res.json({ success: true, id, message: 'Списання успішно видалено з журналу та балансу' });
  }

  // 2. Custom entry
  const customIdx = db.customLedgerEntries.findIndex((e) => e.id === id);
  if (customIdx !== -1) {
    db.customLedgerEntries.splice(customIdx, 1);
    saveDb(db);
    if (isCloudSqlAvailable()) {
      deleteCustomLedgerEntryFromCloudSql(id).catch((e) => console.warn('[Cloud SQL] Delete custom ledger error:', e));
    }
    return res.json({ success: true, id, message: 'Запис успішно видалено' });
  }

  // 3. Provider adjustment
  const adjIdx = db.providerBalanceAdjustments.findIndex((a) => a.id === id);
  if (adjIdx !== -1) {
    db.providerBalanceAdjustments.splice(adjIdx, 1);
    saveDb(db);
    if (isCloudSqlAvailable()) {
      deleteProviderBalanceAdjustmentFromCloudSql(id).catch((e) => console.warn('[Cloud SQL] Delete adj error:', e));
    }
    return res.json({ success: true, id, message: 'Коригування успішно видалено' });
  }

  // 4. Provider deposit
  const depIdx = db.providerDeposits.findIndex((d) => d.id === id);
  if (depIdx !== -1) {
    db.providerDeposits.splice(depIdx, 1);
    saveDb(db);
    if (isCloudSqlAvailable()) {
      deleteProviderDepositFromCloudSql(id).catch((e) => console.warn('[Cloud SQL] Delete dep error:', e));
    }
    return res.json({ success: true, id, message: 'Поповнення успішно видалено' });
  }

  // 5. Client payment
  const payIdx = db.payments.findIndex((p) => p.id === id);
  if (payIdx !== -1) {
    db.payments.splice(payIdx, 1);
    saveDb(db);
    if (isCloudSqlAvailable()) {
      deletePaymentFromCloudSql(id).catch((e) => console.warn('[Cloud SQL] Delete pay error:', e));
    }
    return res.json({ success: true, id, message: 'Оплату абонента успішно видалено' });
  }

  return res.status(404).json({ error: 'Запис не знайдено' });
});

// Provider Balance Adjustments
app.post('/api/budget/provider-balance/adjust', (req, res) => {
  const db = loadDb();
  if (!db.providerBalanceAdjustments) db.providerBalanceAdjustments = [];
  if (!db.accountDeductionOverrides) db.accountDeductionOverrides = [];

  const { amountUsd, targetBalanceUsd, note, date } = req.body;
  let finalAmountUsd = 0;

  if (targetBalanceUsd !== undefined) {
    // Calculate current provider balance before this new adjustment
    const totalDeposited = db.providerDeposits.reduce((sum, d) => sum + (Number(d.amountUsd) || 0), 0);
    let totalDeducted = 0;
    for (const acc of db.providerAccounts) {
      const det = getAccountDeductionDetails(acc);
      for (let i = 0; i < det.actualDeductedMonths; i++) {
        const dedId = `ded_${acc.id}_m${i + 1}`;
        const override = db.accountDeductionOverrides.find((o) => o.id === dedId);
        if (override?.isExcluded) continue;
        const price = override?.amountUsd !== undefined ? override.amountUsd : -det.pricePerMonth;
        totalDeducted += Math.abs(price);
      }
    }
    const customDelta = (db.customLedgerEntries || []).reduce((sum, e) => sum + (Number(e.amountUsd) || 0), 0);
    const existingAdjustments = db.providerBalanceAdjustments.reduce((sum, a) => sum + (Number(a.amountUsd) || 0), 0);

    const currentBalance = totalDeposited - totalDeducted + customDelta + existingAdjustments;
    finalAmountUsd = Math.round((Number(targetBalanceUsd) - currentBalance) * 100) / 100;
  } else {
    finalAmountUsd = Number(amountUsd) || 0;
  }

  if (finalAmountUsd === 0 && targetBalanceUsd === undefined) {
    return res.status(400).json({ error: 'Сума коригування не може бути 0' });
  }

  const newAdjustment: ProviderBalanceAdjustment = {
    id: 'adj_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    date: date || new Date().toISOString().split('T')[0],
    amountUsd: finalAmountUsd,
    note: note || (targetBalanceUsd !== undefined ? `Калібрування до балансу $${targetBalanceUsd}` : 'Ручне коригування балансу'),
    createdAt: new Date().toISOString(),
  };

  db.providerBalanceAdjustments.unshift(newAdjustment);
  saveDb(db);
  if (isCloudSqlAvailable()) {
    saveProviderBalanceAdjustmentToCloudSql(newAdjustment as unknown as Record<string, unknown>).catch((e) => console.warn('[Cloud SQL] Save adj error:', e));
  }
  return res.status(201).json(newAdjustment);
});

app.delete('/api/budget/provider-balance/adjust/:id', (req, res) => {
  const db = loadDb();
  if (!db.providerBalanceAdjustments) db.providerBalanceAdjustments = [];
  const id = req.params.id;
  const initialLen = db.providerBalanceAdjustments.length;
  db.providerBalanceAdjustments = db.providerBalanceAdjustments.filter((a) => a.id !== id);

  if (db.providerBalanceAdjustments.length === initialLen) {
    return res.status(404).json({ error: 'Запис коригування не знайдено' });
  }

  saveDb(db);
  if (isCloudSqlAvailable()) {
    deleteProviderBalanceAdjustmentFromCloudSql(id).catch((e) => console.warn('[Cloud SQL] Delete adj error:', e));
  }
  return res.json({ success: true, id });
});

app.post('/api/budget/deposits', (req, res) => {
  const db = loadDb();
  const { amountUsd, spentUah, date, paymentMethod, note } = req.body;

  const numUsd = Number(amountUsd);
  const numUah = Number(spentUah);

  if (isNaN(numUsd) || numUsd <= 0) {
    return res.status(400).json({ error: 'Сума поповнення у доларах повинна бути більше 0' });
  }
  if (isNaN(numUah) || numUah <= 0) {
    return res.status(400).json({ error: 'Сума витрат у гривнях повинна бути більше 0' });
  }

  const depositDate = date || new Date().toISOString().split('T')[0];
  const rate = Math.round((numUah / numUsd) * 100) / 100;

  const newDeposit: ProviderDeposit = {
    id: 'dep_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    date: depositDate,
    amountUsd: numUsd,
    spentUah: numUah,
    exchangeRate: rate,
    paymentMethod: paymentMethod || 'Картка банку',
    note: note || `Поповнення акаунту на $${numUsd} (витрачено ${numUah} ₴)`,
    createdAt: new Date().toISOString(),
  };

  db.providerDeposits.unshift(newDeposit);
  saveDb(db);
  if (isCloudSqlAvailable()) {
    saveProviderDepositToCloudSql(newDeposit as unknown as Record<string, unknown>).catch((e) => console.warn('[Cloud SQL] Save deposit error:', e));
  }
  return res.status(201).json(newDeposit);
});

app.put('/api/budget/deposits/:id', (req, res) => {
  const db = loadDb();
  const id = req.params.id;
  const index = db.providerDeposits.findIndex((d) => d.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Запис поповнення не знайдено' });
  }

  const existing = db.providerDeposits[index];
  const body = req.body;

  const numUsd = body.amountUsd !== undefined ? Number(body.amountUsd) : existing.amountUsd;
  const numUah = body.spentUah !== undefined ? Number(body.spentUah) : existing.spentUah;
  const rate = numUsd > 0 ? Math.round((numUah / numUsd) * 100) / 100 : existing.exchangeRate;

  const updated: ProviderDeposit = {
    ...existing,
    amountUsd: numUsd,
    spentUah: numUah,
    exchangeRate: rate,
    date: body.date || existing.date,
    paymentMethod: body.paymentMethod !== undefined ? body.paymentMethod : existing.paymentMethod,
    note: body.note !== undefined ? body.note : existing.note,
  };

  db.providerDeposits[index] = updated;
  saveDb(db);
  if (isCloudSqlAvailable()) {
    saveProviderDepositToCloudSql(updated as unknown as Record<string, unknown>).catch((e) => console.warn('[Cloud SQL] Update deposit error:', e));
  }
  return res.json(updated);
});

app.delete('/api/budget/deposits/:id', (req, res) => {
  const db = loadDb();
  const id = req.params.id;
  const initialLen = db.providerDeposits.length;
  db.providerDeposits = db.providerDeposits.filter((d) => d.id !== id);

  if (db.providerDeposits.length === initialLen) {
    return res.status(404).json({ error: 'Запис поповнення не знайдено' });
  }

  if (isCloudSqlAvailable()) {
    deleteProviderDepositFromCloudSql(id).catch((e) => console.warn('[Cloud SQL] Delete error:', e));
  }
  saveDb(db);
  return res.json({ success: true, id });
});

// Update or delete provider account renewal (deduction)
app.put('/api/accounts/:accountId/renewals/:renewalId', (req, res) => {
  const db = loadDb();
  const { accountId, renewalId } = req.params;
  const account = db.providerAccounts.find((a) => a.id === accountId);

  if (!account || !account.renewals) {
    return res.status(404).json({ error: 'Акаунт або списання не знайдено' });
  }

  const renIndex = account.renewals.findIndex((r) => r.id === renewalId);
  if (renIndex === -1) {
    return res.status(404).json({ error: 'Запис списання не знайдено' });
  }

  const existingRen = account.renewals[renIndex];
  const body = req.body;

  const updatedRen: ProviderAccountRenewal = {
    ...existingRen,
    date: body.date || existingRen.date,
    months: body.months !== undefined ? Number(body.months) : existingRen.months,
    pricePerMonthUsd: body.pricePerMonthUsd !== undefined ? Number(body.pricePerMonthUsd) : existingRen.pricePerMonthUsd,
    totalCostUsd: body.totalCostUsd !== undefined ? Number(body.totalCostUsd) : existingRen.totalCostUsd,
    newValidUntil: body.newValidUntil || existingRen.newValidUntil,
    note: body.note !== undefined ? body.note : existingRen.note,
  };

  account.renewals[renIndex] = updatedRen;
  // Recalculate account totalDeductedUsd
  account.totalDeductedUsd = account.renewals.reduce((sum, r) => sum + (Number(r.totalCostUsd) || 0), 0);
  account.updatedAt = new Date().toISOString();

  saveDb(db);
  return res.json({ success: true, renewal: updatedRen, account });
});

app.delete('/api/accounts/:accountId/renewals/:renewalId', (req, res) => {
  const db = loadDb();
  const { accountId, renewalId } = req.params;
  const account = db.providerAccounts.find((a) => a.id === accountId);

  if (!account || !account.renewals) {
    return res.status(404).json({ error: 'Акаунт або списання не знайдено' });
  }

  const initialLen = account.renewals.length;
  account.renewals = account.renewals.filter((r) => r.id !== renewalId);

  if (account.renewals.length === initialLen) {
    return res.status(404).json({ error: 'Запис списання не знайдено' });
  }

  account.totalDeductedUsd = account.renewals.reduce((sum, r) => sum + (Number(r.totalCostUsd) || 0), 0);
  account.updatedAt = new Date().toISOString();

  saveDb(db);
  return res.json({ success: true, accountId, renewalId });
});

// 7. Settings
app.get('/api/settings', async (_req, res) => {
  if (startupSyncPromise) {
    try {
      await startupSyncPromise;
    } catch {
      // ignore
    }
  }
  if (isCloudSqlAvailable()) {
    try {
      const sqlSettings = await getSettingsFromCloudSql();
      if (sqlSettings) {
        const rawTariffs = sqlSettings['utilityTariffsSettings'];
        let parsedTariffs = rawTariffs;
        if (typeof rawTariffs === 'string') {
          try {
            parsedTariffs = JSON.parse(rawTariffs);
          } catch {
            // ignore
          }
        }
        const db = loadDb();
        const mergedTariffs = deepMergeTariffs(
          db.settings?.utilityTariffsSettings,
          parsedTariffs as Partial<UtilityTariffsSettings>
        );
        db.settings = {
          ...db.settings,
          ...sqlSettings,
          utilityTariffsSettings: mergedTariffs,
        } as unknown as AppSettings;
        cachedDb = db;
        try {
          writeFileSync(settingsFile, JSON.stringify(db.settings, null, 2), 'utf-8');
        } catch {
          // ignore
        }
        res.json(db.settings);
        return;
      }
    } catch (e) {
      console.warn('[Cloud SQL] Direct get settings error:', e);
    }
  }
  const db = loadDb();
  res.json(db.settings);
});

app.post('/api/settings', async (req, res) => {
  if (startupSyncPromise) {
    try {
      await startupSyncPromise;
    } catch {
      // ignore
    }
  }
  const db = loadDb();
  const body = req.body || {};
  const currentTariffs = db.settings.utilityTariffsSettings || DEFAULT_UTILITY_TARIFFS;
  const mergedTariffs = deepMergeTariffs(currentTariffs, body.utilityTariffsSettings);

  const updatedSettings: AppSettings = {
    ...db.settings,
    ...body,
    defaultMonthlyPrice: body.defaultMonthlyPrice !== undefined ? Number(body.defaultMonthlyPrice) : db.settings.defaultMonthlyPrice,
    reminderDaysBefore: body.reminderDaysBefore !== undefined ? Number(body.reminderDaysBefore) : db.settings.reminderDaysBefore,
    utilityTariffsSettings: mergedTariffs,
  };
  db.settings = updatedSettings;
  cachedDb = db;
  saveDb(db);

  try {
    writeFileSync(settingsFile, JSON.stringify(updatedSettings, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing settings backup file:', err);
  }

  if (isCloudSqlAvailable()) {
    try {
      await saveSettingsToCloudSql(updatedSettings as unknown as Record<string, unknown>);
    } catch (err) {
      console.warn('[Cloud SQL] Direct save settings error:', err);
    }
  }

  res.json(db.settings);
});

// 8. Real-Time Analytics & Monthly Revenue Stats
app.get('/api/stats', (_req, res) => {
  const db = loadDb();
  const clients = db.clients;
  const payments = db.payments;

  const totalClients = clients.length;
  let activeClients = 0;
  let expiringSoonClients = 0;
  let expiredClients = 0;
  let pausedClients = 0;
  let projectedMonthlyRevenue = 0;
  let totalBalanceSum = 0;

  for (const c of clients) {
    totalBalanceSum += c.balance || 0;
    const days = getDaysRemaining(c.activeUntil);
    if (c.status === 'paused') {
      pausedClients++;
    } else if (days < 0) {
      expiredClients++;
    } else {
      activeClients++;
      projectedMonthlyRevenue += c.monthlyPrice || 0;
      if (days <= 7) {
        expiringSoonClients++;
      }
    }
  }

  // Monthly Revenue & Expenses calculations
  const now = new Date();
  const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  let currentMonthRevenue = 0;
  let paymentsThisMonthCount = 0;

  interface MonthAccumulator {
    income: number;
    expenses: number;
    paymentsCount: number;
    depositsCount: number;
    usdDeposits: number;
    usdExpenses: number;
  }

  const monthsMap = new Map<string, MonthAccumulator>();

  // Pre-seed current and past 5 months
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthsMap.set(key, {
      income: 0,
      expenses: 0,
      paymentsCount: 0,
      depositsCount: 0,
      usdDeposits: 0,
      usdExpenses: 0,
    });
  }

  // Aggregate client payments (Income UAH)
  for (const p of payments) {
    const pDate = new Date(p.date);
    const key = `${pDate.getFullYear()}-${String(pDate.getMonth() + 1).padStart(2, '0')}`;
    const amount = Number(p.amount) || 0;

    if (key === currentYearMonth) {
      currentMonthRevenue += amount;
      paymentsThisMonthCount++;
    }

    if (!monthsMap.has(key)) {
      monthsMap.set(key, {
        income: 0,
        expenses: 0,
        paymentsCount: 0,
        depositsCount: 0,
        usdDeposits: 0,
        usdExpenses: 0,
      });
    }

    const cur = monthsMap.get(key)!;
    cur.income += amount;
    cur.paymentsCount += 1;
  }

  // Aggregate provider deposits (Expenses UAH and Deposits USD)
  for (const dep of (db.providerDeposits || [])) {
    const depDate = new Date(dep.date);
    const key = `${depDate.getFullYear()}-${String(depDate.getMonth() + 1).padStart(2, '0')}`;
    const spentUah = Number(dep.spentUah) || 0;
    const amountUsd = Number(dep.amountUsd) || 0;

    if (!monthsMap.has(key)) {
      monthsMap.set(key, {
        income: 0,
        expenses: 0,
        paymentsCount: 0,
        depositsCount: 0,
        usdDeposits: 0,
        usdExpenses: 0,
      });
    }

    const cur = monthsMap.get(key)!;
    cur.expenses += spentUah;
    cur.depositsCount += 1;
    cur.usdDeposits += amountUsd;
  }

  // Aggregate provider account monthly deductions (USD expenses)
  for (const acc of (db.providerAccounts || [])) {
    const det = getAccountDeductionDetails(acc);
    for (let i = 0; i < det.actualDeductedMonths; i++) {
      const cycleDate = addMonthsExact(det.startDateStr, i);
      const key = cycleDate.substring(0, 7);
      if (monthsMap.has(key)) {
        monthsMap.get(key)!.usdExpenses += det.pricePerMonth;
      }
    }
  }

  const monthNamesUa: Record<string, string> = {
    '01': 'Січ', '02': 'Лют', '03': 'Бер', '04': 'Кві',
    '05': 'Тра', '06': 'Чер', '07': 'Лип', '08': 'Сер',
    '09': 'Вер', '10': 'Жов', '11': 'Лис', '12': 'Гру',
  };

  const monthlyBreakdown = Array.from(monthsMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, val]) => {
      const [y, m] = key.split('-');
      return {
        monthKey: key,
        monthName: `${monthNamesUa[m] || m} ${y}`,
        totalIncome: val.income,
        totalExpenses: val.expenses,
        netProfit: val.income - val.expenses,
        paymentsCount: val.paymentsCount,
        depositsCount: val.depositsCount,
        usdDeposits: val.usdDeposits,
        usdExpenses: val.usdExpenses,
      };
    });

  const monthNamesFullUa: Record<string, string> = {
    '01': 'Січень', '02': 'Лютий', '03': 'Березень', '04': 'Квітень',
    '05': 'Травень', '06': 'Червень', '07': 'Липень', '08': 'Серпень',
    '09': 'Вересень', '10': 'Жовтень', '11': 'Листопад', '12': 'Грудень',
  };

  const currentYear = now.getFullYear();
  const currentMonthNum = now.getMonth() + 1;
  let runningYearlyTotal = 0;

  interface ServerYearlyMonthStat {
    monthIndex: number;
    monthKey: string;
    monthName: string;
    monthShort: string;
    year: number;
    totalIncome: number;
    paymentsCount: number;
    averagePayment: number;
    cumulativeIncome: number;
    growthPct: number | null;
    isCurrent: boolean;
    isPast: boolean;
    isFuture: boolean;
  }

  const currentYearMonthly: ServerYearlyMonthStat[] = [];
  for (let m = 1; m <= 12; m++) {
    const mStr = String(m).padStart(2, '0');
    const key = `${currentYear}-${mStr}`;
    const isCurrent = m === currentMonthNum;
    const isPast = m < currentMonthNum;
    const isFuture = m > currentMonthNum;

    let income = 0;
    let count = 0;

    for (const p of payments) {
      if (p.date && p.date.startsWith(key)) {
        income += Number(p.amount) || 0;
        count++;
      }
    }

    if (isPast || isCurrent) {
      runningYearlyTotal += income;
    }

    currentYearMonthly.push({
      monthIndex: m,
      monthKey: key,
      monthName: monthNamesFullUa[mStr] || key,
      monthShort: monthNamesUa[mStr] || mStr,
      year: currentYear,
      totalIncome: income,
      paymentsCount: count,
      averagePayment: count > 0 ? Math.round(income / count) : 0,
      cumulativeIncome: runningYearlyTotal,
      growthPct: null,
      isCurrent,
      isPast,
      isFuture,
    });
  }

  // Calculate growth percentages
  for (let i = 1; i < currentYearMonthly.length; i++) {
    const prev = currentYearMonthly[i - 1].totalIncome;
    const cur = currentYearMonthly[i].totalIncome;
    if (prev > 0 && (currentYearMonthly[i].isPast || currentYearMonthly[i].isCurrent)) {
      currentYearMonthly[i].growthPct = Math.round(((cur - prev) / prev) * 1000) / 10;
    } else if (prev === 0 && cur > 0 && (currentYearMonthly[i].isPast || currentYearMonthly[i].isCurrent)) {
      currentYearMonthly[i].growthPct = 100;
    }
  }

  res.json({
    summary: {
      totalClients,
      activeClients,
      expiringSoonClients,
      expiredClients,
      pausedClients,
      currentMonthRevenue,
      projectedMonthlyRevenue,
      totalBalanceSum,
      paymentsThisMonthCount,
    },
    monthlyBreakdown,
    currentYearMonthly,
    currentYear,
  });
});

// 13. Cloud Database Status & Management Endpoints
app.get('/api/database/status', (_req, res) => {
  const db = loadDb();
  const cloudSqlStatus = getCloudSqlDbStatus();
  
  res.json({
    provider: isCloudSqlAvailable() ? 'Google Cloud SQL (PostgreSQL)' : 'Локальна база даних (JSON)',
    databaseId: isCloudSqlAvailable() ? (process.env['SQL_DB_NAME'] || 'postgres') : 'iptv_database.json',
    connected: isCloudSqlAvailable() ? cloudSqlStatus.connected : true,
    lastSync: cloudSqlStatus.lastSync || lastDbUpdate,
    error: cloudSqlStatus.error,
    cloudSql: cloudSqlStatus,
    stats: {
      clientsCount: db.clients.length,
      paymentsCount: db.payments.length,
      providerAccountsCount: db.providerAccounts.length,
      providerDepositsCount: db.providerDeposits.length,
      settingsConfigured: !!db.settings,
    },
  });
});

app.post('/api/database/sync', async (_req, res) => {
  try {
    let cloudData: Record<string, unknown> | null = null;
    if (isCloudSqlAvailable()) {
      cloudData = await loadAllFromCloudSql();
    }

    if (cloudData) {
      const current = loadDb();
      if (cloudData['clients']) current.clients = cloudData['clients'] as unknown as Client[];
      if (cloudData['payments']) current.payments = cloudData['payments'] as unknown as PaymentTransaction[];
      if (cloudData['providerAccounts']) current.providerAccounts = cloudData['providerAccounts'] as unknown as ProviderAccount[];
      if (cloudData['providerDeposits']) current.providerDeposits = cloudData['providerDeposits'] as unknown as ProviderDeposit[];
      if (cloudData['utilityAccounts']) current.utilityAccounts = cloudData['utilityAccounts'] as unknown as UtilityAccount[];
      if (cloudData['utilityReadings']) {
        current.utilityReadings = (cloudData['utilityReadings'] as unknown as UtilityReading[]).map((r) => {
          const isCtrl = r.isControlOnly === true || String(r.isControlOnly) === 'true' || r.readingPurpose === 'control';
          return {
            ...r,
            isControlOnly: isCtrl,
            readingPurpose: isCtrl ? 'control' : 'billing',
          };
        });
      }
      if (cloudData['customLedgerEntries']) current.customLedgerEntries = cloudData['customLedgerEntries'] as unknown as BudgetLedgerItem[];
      if (cloudData['providerBalanceAdjustments']) current.providerBalanceAdjustments = cloudData['providerBalanceAdjustments'] as unknown as ProviderBalanceAdjustment[];
      if (cloudData['accountDeductionOverrides']) current.accountDeductionOverrides = cloudData['accountDeductionOverrides'] as unknown as AccountDeductionOverride[];
      if (cloudData['settings']) {
        const rawTariffs = (cloudData['settings'] as Record<string, unknown>)['utilityTariffsSettings'];
        let parsedTariffs = rawTariffs;
        if (typeof rawTariffs === 'string') {
          try {
            parsedTariffs = JSON.parse(rawTariffs);
          } catch {
            // ignore
          }
        }
        current.settings = {
          ...current.settings,
          ...(cloudData['settings'] as Record<string, unknown>),
          utilityTariffsSettings: deepMergeTariffs(DEFAULT_UTILITY_TARIFFS, parsedTariffs as Partial<UtilityTariffsSettings>),
        } as unknown as AppSettings;
        try {
          writeFileSync(settingsFile, JSON.stringify(current.settings, null, 2), 'utf-8');
        } catch {
          // ignore
        }
      }
      
      saveDb(current);
      return res.json({
        success: true,
        message: 'Дані успішно синхронізовано з Cloud SQL (PostgreSQL)',
        syncedAt: new Date().toISOString(),
        stats: {
          clientsCount: current.clients.length,
          paymentsCount: current.payments.length,
          providerAccountsCount: current.providerAccounts.length,
          providerDepositsCount: current.providerDeposits.length,
        },
      });
    } else {
      const current = loadDb();
      return res.json({
        success: true,
        message: 'Дані завантажено з локальної бази даних',
        syncedAt: new Date().toISOString(),
        stats: {
          clientsCount: current.clients.length,
          paymentsCount: current.payments.length,
          providerAccountsCount: current.providerAccounts.length,
          providerDepositsCount: current.providerDeposits.length,
        },
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

app.post('/api/database/purge-test-data', async (_req, res) => {
  try {
    if (isCloudSqlAvailable()) {
      await purgeTestDataFromCloudSql();
    }
    const testIds = new Set(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'p1', 'p2', 'p3', 'p4', 'acc_1', 'acc_2', 'acc_3', 'dep_1', 'dep_2']);
    const current = loadDb();
    current.clients = current.clients.filter((c) => !testIds.has(c.id));
    current.payments = current.payments.filter((p) => !testIds.has(p.id));
    current.providerAccounts = current.providerAccounts.filter((a) => !testIds.has(a.id));
    current.providerDeposits = current.providerDeposits.filter((d) => !testIds.has(d.id));
    saveDb(current);

    return res.json({
      success: true,
      message: 'Тестові дані успішно видалено. База даних містить виключно актуальні записи.',
      stats: {
        clientsCount: current.clients.length,
        paymentsCount: current.payments.length,
        providerAccountsCount: current.providerAccounts.length,
        providerDepositsCount: current.providerDeposits.length,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

app.post('/api/database/push-all', async (_req, res) => {
  try {
    const current = loadDb();
    if (isCloudSqlAvailable()) {
      await seedInitialDataToCloudSql(current as unknown as Record<string, unknown>);
    }
    return res.json({
      success: true,
      message: isCloudSqlAvailable()
        ? 'Усі записи успішно збережено у Cloud SQL (PostgreSQL)'
        : 'Усі локальні записи збережено у базу даних',
      savedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

// 10. Utility (Electricity, Water, Waste) APIs
app.get('/api/utility/data', (_req, res) => {
  const db = loadDb();
  res.json({
    accounts: db.utilityAccounts || [],
    readings: db.utilityReadings || [],
  });
});

app.post('/api/utility/accounts', async (req, res) => {
  try {
    const db = loadDb();
    const body = req.body;
    if (!body.name || !body.accountNumber) {
      return res.status(400).json({ error: "Назва та номер особового рахунку обов'язкові" });
    }

    const id = body.id || `uacc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const existingIndex = (db.utilityAccounts || []).findIndex((a) => a.id === id);
    const existing = existingIndex >= 0 ? db.utilityAccounts[existingIndex] : null;

    const account: UtilityAccount = {
      id,
      type: body.type === 'water_waste' ? 'water_waste' : 'electricity',
      name: String(body.name).trim(),
      accountNumber: String(body.accountNumber).trim(),
      address: body.address ? String(body.address).trim() : '',
      meterNumber: body.meterNumber ? String(body.meterNumber).trim() : '',
      electricityTariffType: body.electricityTariffType === 'dual' ? 'dual' : 'single',
      residentsCount: body.residentsCount !== undefined ? Math.max(1, Number(body.residentsCount) || 1) : 1,
      initialReadingT1: body.initialReadingT1 !== undefined ? Number(body.initialReadingT1) || 0 : 0,
      initialReadingT2: body.initialReadingT2 !== undefined ? Number(body.initialReadingT2) || 0 : 0,
      initialReadingWater: body.initialReadingWater !== undefined ? Number(body.initialReadingWater) || 0 : 0,
      waterEnabled: body.waterEnabled !== undefined ? Boolean(body.waterEnabled) : true,
      wasteEnabled: body.wasteEnabled !== undefined ? Boolean(body.wasteEnabled) : true,
      balanceUah: body.balanceUah !== undefined ? Number(body.balanceUah) || 0 : (existing ? existing.balanceUah || 0 : 0),
      notes: body.notes ? String(body.notes) : '',
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };

    if (existingIndex >= 0) {
      db.utilityAccounts[existingIndex] = account;
    } else {
      db.utilityAccounts.push(account);
    }

    saveDb(db);

    if (isCloudSqlAvailable()) {
      try {
        await saveUtilityAccountToCloudSql(account as unknown as Record<string, unknown>);
      } catch (e) {
        console.warn('[Cloud SQL] Direct save utility account warning:', e);
      }
    }

    return res.json({ success: true, account });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

app.delete('/api/utility/accounts/:id', async (req, res) => {
  try {
    const db = loadDb();
    const id = req.params.id;
    db.utilityAccounts = (db.utilityAccounts || []).filter((a) => a.id !== id);
    db.utilityReadings = (db.utilityReadings || []).filter((r) => r.accountId !== id);
    saveDb(db);

    if (isCloudSqlAvailable()) {
      try {
        await deleteUtilityAccountFromCloudSql(id);
      } catch (e) {
        console.warn('[Cloud SQL] Direct delete utility account warning:', e);
      }
    }

    return res.json({ success: true, id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

app.post('/api/utility/readings', async (req, res) => {
  try {
    const db = loadDb();
    const body = req.body;
    if (!body.accountId || !body.date) {
      return res.status(400).json({ error: "Акаунт та дата показів обов'язкові" });
    }

    const id = body.id || `uread_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const isControlOnly = body.isControlOnly === true || String(body.isControlOnly) === 'true' || body.readingPurpose === 'control';
    const totalCost = isControlOnly ? 0 : (Number(body.totalCost) || 0);

    const reading: UtilityReading = {
      id,
      accountId: String(body.accountId),
      utilityType: body.utilityType || 'electricity',
      date: String(body.date),
      periodMonth: body.periodMonth || body.date.substring(0, 7),
      readingT1: body.readingT1 !== undefined && body.readingT1 !== null ? Number(body.readingT1) : undefined,
      readingT2: body.readingT2 !== undefined && body.readingT2 !== null ? Number(body.readingT2) : undefined,
      consumptionT1: body.consumptionT1 !== undefined && body.consumptionT1 !== null ? Number(body.consumptionT1) : undefined,
      consumptionT2: body.consumptionT2 !== undefined && body.consumptionT2 !== null ? Number(body.consumptionT2) : undefined,
      rateT1: isControlOnly ? undefined : (body.rateT1 !== undefined && body.rateT1 !== null ? Number(body.rateT1) : undefined),
      rateT2: isControlOnly ? undefined : (body.rateT2 !== undefined && body.rateT2 !== null ? Number(body.rateT2) : undefined),
      totalCost,
      season: body.season,
      isPaid: isControlOnly ? true : Boolean(body.isPaid),
      paidDate: isControlOnly ? undefined : (body.isPaid ? String(body.paidDate || body.date) : undefined),
      paidAmount: isControlOnly ? 0 : (body.paidAmount !== undefined && body.paidAmount !== null ? Number(body.paidAmount) : undefined),
      note: body.note ? String(body.note) : '',
      isControlOnly,
      readingPurpose: isControlOnly ? 'control' : 'billing',
      daysSinceLastReading: body.daysSinceLastReading !== undefined ? Number(body.daysSinceLastReading) : undefined,
      dailyAvgConsumption: body.dailyAvgConsumption !== undefined ? Number(body.dailyAvgConsumption) : undefined,
      createdAt: body.createdAt || now,
    };

    const existingIndex = (db.utilityReadings || []).findIndex((r) => r.id === id);
    if (existingIndex >= 0) {
      db.utilityReadings[existingIndex] = reading;
    } else {
      db.utilityReadings.push(reading);
    }

    saveDb(db);

    if (isCloudSqlAvailable()) {
      try {
        await saveUtilityReadingToCloudSql(reading as unknown as Record<string, unknown>);
      } catch (e) {
        console.warn('[Cloud SQL] Direct save utility reading warning:', e);
      }
    }

    return res.json({ success: true, reading });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

app.put('/api/utility/readings/:id', async (req, res) => {
  try {
    const db = loadDb();
    const id = req.params.id;
    const body = req.body;
    const existingIndex = (db.utilityReadings || []).findIndex((r) => r.id === id);
    if (existingIndex < 0) {
      return res.status(404).json({ error: 'Запис показів не знайдено' });
    }

    const existing = db.utilityReadings[existingIndex];
    const isControlOnly = body.isControlOnly !== undefined
      ? (body.isControlOnly === true || String(body.isControlOnly) === 'true' || body.readingPurpose === 'control')
      : existing.isControlOnly;
    const totalCost = isControlOnly ? 0 : (body.totalCost !== undefined ? Number(body.totalCost) : existing.totalCost);

    const updated: UtilityReading = {
      ...existing,
      date: body.date ? String(body.date) : existing.date,
      periodMonth: body.periodMonth || (body.date ? String(body.date).substring(0, 7) : existing.periodMonth),
      readingT1: body.readingT1 !== undefined ? (body.readingT1 !== null ? Number(body.readingT1) : undefined) : existing.readingT1,
      readingT2: body.readingT2 !== undefined ? (body.readingT2 !== null ? Number(body.readingT2) : undefined) : existing.readingT2,
      consumptionT1: body.consumptionT1 !== undefined ? (body.consumptionT1 !== null ? Number(body.consumptionT1) : undefined) : existing.consumptionT1,
      consumptionT2: body.consumptionT2 !== undefined ? (body.consumptionT2 !== null ? Number(body.consumptionT2) : undefined) : existing.consumptionT2,
      rateT1: isControlOnly ? undefined : (body.rateT1 !== undefined ? (body.rateT1 !== null ? Number(body.rateT1) : undefined) : existing.rateT1),
      rateT2: isControlOnly ? undefined : (body.rateT2 !== undefined ? (body.rateT2 !== null ? Number(body.rateT2) : undefined) : existing.rateT2),
      totalCost,
      season: body.season !== undefined ? body.season : existing.season,
      isPaid: isControlOnly ? true : (body.isPaid !== undefined ? Boolean(body.isPaid) : existing.isPaid),
      paidDate: isControlOnly ? undefined : (body.paidDate !== undefined ? (body.paidDate ? String(body.paidDate) : undefined) : existing.paidDate),
      paidAmount: isControlOnly ? 0 : (body.paidAmount !== undefined ? (body.paidAmount !== null ? Number(body.paidAmount) : undefined) : existing.paidAmount),
      note: body.note !== undefined ? String(body.note) : existing.note,
      isControlOnly,
      readingPurpose: isControlOnly ? 'control' : 'billing',
      daysSinceLastReading: body.daysSinceLastReading !== undefined ? (body.daysSinceLastReading !== null ? Number(body.daysSinceLastReading) : undefined) : existing.daysSinceLastReading,
      dailyAvgConsumption: body.dailyAvgConsumption !== undefined ? (body.dailyAvgConsumption !== null ? Number(body.dailyAvgConsumption) : undefined) : existing.dailyAvgConsumption,
    };

    db.utilityReadings[existingIndex] = updated;
    saveDb(db);

    if (isCloudSqlAvailable()) {
      try {
        await saveUtilityReadingToCloudSql(updated as unknown as Record<string, unknown>);
      } catch (e) {
        console.warn('[Cloud SQL] Direct update utility reading warning:', e);
      }
    }

    return res.json({ success: true, reading: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

app.delete('/api/utility/readings/:id', async (req, res) => {
  try {
    const db = loadDb();
    const id = req.params.id;
    db.utilityReadings = (db.utilityReadings || []).filter((r) => r.id !== id);
    saveDb(db);

    if (isCloudSqlAvailable()) {
      try {
        await deleteUtilityReadingFromCloudSql(id);
      } catch (e) {
        console.warn('[Cloud SQL] Direct delete utility reading warning:', e);
      }
    }

    return res.json({ success: true, id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

app.post('/api/utility/readings/:id/pay', async (req, res) => {
  try {
    const db = loadDb();
    const id = req.params.id;
    const reading = (db.utilityReadings || []).find((r) => r.id === id);
    if (!reading) {
      return res.status(404).json({ error: 'Запис показів не знайдено' });
    }

    const { isPaid, paidDate, paidAmount } = req.body;
    reading.isPaid = isPaid !== undefined ? Boolean(isPaid) : true;
    reading.paidDate = paidDate || (reading.isPaid ? new Date().toISOString().split('T')[0] : undefined);
    reading.paidAmount = paidAmount !== undefined ? Number(paidAmount) : (reading.isPaid ? reading.totalCost : undefined);

    saveDb(db);

    if (isCloudSqlAvailable()) {
      try {
        await saveUtilityReadingToCloudSql(reading as unknown as Record<string, unknown>);
      } catch (e) {
        console.warn('[Cloud SQL] Direct update utility reading payment warning:', e);
      }
    }

    return res.json({ success: true, reading });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

/**
 * AI-powered meter photo recognition endpoint
 * Uses Gemini AI vision to detect numbers/dials on electricity or water meters.
 */
app.post('/api/utility/recognize-meter', async (req, res) => {
  try {
    const { imageBase64, utilityType, electricityTariffType } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ success: false, error: 'Зображення обов’язкове для розпізнавання' });
    }

    const apiKey = process.env['GEMINI_API_KEY'];
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: 'API ключ Gemini не налаштовано на сервері (GEMINI_API_KEY)',
      });
    }

    // Extract mimeType and raw base64 data
    let mimeType = 'image/jpeg';
    let rawBase64 = String(imageBase64);
    if (rawBase64.includes(';base64,')) {
      const parts = rawBase64.split(';base64,');
      mimeType = parts[0].replace('data:', '') || 'image/jpeg';
      rawBase64 = parts[1];
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    let prompt = '';
    if (utilityType === 'electricity') {
      const isDual = electricityTariffType === 'dual';
      prompt = `Виступай високоточним експертом зі зчитування показів лічильників електроенергії (лічильник світла в Україні: NIK, Itron, GAMA, Matrix тощо).
Проаналізуй прикріплене фото табло/дисплея лічильника електроенергії.
${
  isDual
    ? `Цей лічильник є двозонним (день / ніч: Т1 / Т2).
Електронні лічильники показують значення з позначками або кодами OBIS:
- Т1 (День / Day / 1.8.1 / 1): денне споживання в кВт·год
- Т2 (Ніч / Night / 1.8.2 / 2): нічне споживання в кВт·год
- Загальне (1.8.0 / Total / Σ)
Знайди числові значення для Дня (Т1) та Ночі (Т2). Якщо на фото зараз видно лише одне число або активний тариф, вкажи знайдене число як readingT1, а друге залиш null.`
    : `Цей лічильник є однозонним (звичайний або механічний).
Знайди поточний загальний показник споживання електроенергії в кВт·год.`
}
Правила зчитування:
1. Звертай увагу на кому/крапку або виділений червоним/меншим шрифтом десятковий знак.
2. Ігноруй початкові незначущі нулі (наприклад 00124.5 перетвори у 124.5).
3. Поверни суворий JSON у форматі:
{
  "readingT1": <число або null>,
  "readingT2": <число або null>,
  "singleReading": <число або null>,
  "meterNumber": <рядок із номером лічильника якщо видно або null>,
  "confidence": <число від 0.0 до 1.0>,
  "explanation": <коротке пояснення українською мовою, наприклад "Розпізнано покази Т1 (день): 1420.5 кВт·г, Т2 (ніч): 630.2 кВт·г">
}`;
    } else {
      prompt = `Виступай високоточним експертом зі зчитування показів лічильників води (холодна або гаряча вода в Україні: Новатор, Луцьк, Gross, Baylan, Maddalena тощо).
Проаналізуй прикріплене фото циферблата лічильника води.
Механічні лічильники води мають:
- Чорні цифри на роликах: повні кубічні метри (м³), зазвичай 4-5 цифр (наприклад 00142).
- Червоні цифри або стрілочні кругові шкали: літри або частки кубометра.
Правила:
1. Основні кубометри беруться з чорних цифр (наприклад 00142 -> 142).
2. Якщо червоні десяткові цифри чітко видно, можна додати десяткову частину (наприклад 142.5 або 142), якщо розмито — вкажи ціле число кубів.
3. Ігноруй початкові нулі.
4. Поверни суворий JSON у форматі:
{
  "readingWater": <число або null>,
  "meterNumber": <рядок із заводським номером лічильника якщо видно або null>,
  "confidence": <число від 0.0 до 1.0>,
  "explanation": <коротке пояснення українською мовою, наприклад "Розпізнано показник води: 142.5 м³ (заводський номер 489201)">
}`;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: rawBase64,
            },
          },
          {
            text: prompt,
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
      },
    });

    const responseText = response.text || '{}';
    let parsed: Record<string, unknown> = {};
    try {
      const cleaned = responseText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.warn('Failed to parse Gemini response as JSON:', responseText);
    }

    const sanitizeNum = (v: unknown): number | null => {
      if (v === null || v === undefined) return null;
      if (typeof v === 'number') return isNaN(v) ? null : v;
      const clean = String(v).trim().replace(/\s+/g, '').replace(',', '.');
      const num = parseFloat(clean);
      return isNaN(num) ? null : num;
    };

    return res.json({
      success: true,
      readingT1: sanitizeNum(parsed['readingT1']),
      readingT2: sanitizeNum(parsed['readingT2']),
      singleReading: sanitizeNum(parsed['singleReading']),
      readingWater: sanitizeNum(parsed['readingWater']),
      meterNumber: typeof parsed['meterNumber'] === 'string' ? parsed['meterNumber'] : null,
      confidence: typeof parsed['confidence'] === 'number' ? parsed['confidence'] : 0.9,
      explanation: typeof parsed['explanation'] === 'string' ? parsed['explanation'] : '',
    });
  } catch (err: unknown) {
    console.error('Error in recognize-meter:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({
      success: false,
      error: `Помилка розпізнавання фото: ${msg}`,
    });
  }
});

function getKyivFormattedDate(date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat('uk-UA', {
      timeZone: 'Europe/Kyiv',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const pMap: Record<string, string> = {};
    for (const p of parts) {
      pMap[p.type] = p.value;
    }
    return `${pMap['day'] || '01'}.${pMap['month'] || '01'}.${pMap['year'] || '2026'} ${pMap['hour'] || '00'}:${pMap['minute'] || '00'}`;
  } catch {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
}

/**
 * Proxy endpoint for DTEK Shutdown Schedule (с-ще Окни, вул. Шкільна, буд. 11)
 */
app.all('/api/utility/dtek-shutdowns', async (_req, res) => {
  try {
    const now = new Date();
    const dateFactFormatted = getKyivFormattedDate(now);

    const bodyParams = new URLSearchParams();
    bodyParams.append('method', 'getHomeNum');
    bodyParams.append('data[0][name]', 'city');
    bodyParams.append('data[0][value]', 'с-ще Окни');
    bodyParams.append('data[1][name]', 'street');
    bodyParams.append('data[1][value]', 'вул. Шкільна');
    bodyParams.append('data[2][name]', 'updateFact');
    bodyParams.append('data[2][value]', dateFactFormatted);

    const dtekUrl = 'https://www.dtek-oem.com.ua/ua/ajax';

    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:159.0) Gecko/20100101 Firefox/159.0',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'Accept-Language': 'uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7',
      'Referer': 'https://www.dtek-oem.com.ua/ua/shutdowns',
      'X-CSRF-Token': '-XfNoiOyKzTw3gHXBfTFitooB-_7fyqcRbqww6XhAlPLToTrce0TeLWUQOVymZzmu31spq8ZafI_5d6X3LZkYg==',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      'Origin': 'https://www.dtek-oem.com.ua',
      'Cookie': 'dtek-oem=c251pon7lgog6426dbf9u852eb; _language=4feef5ffdc846bbf9c35c97292b7b3e6c48117a536a6462b530e0984a39d6bd4a%3A2%3A%7Bi%3A0%3Bs%3A9%3A%22_language%22%3Bi%3A1%3Bs%3A2%3A%22uk%22%3B%7D; _csrf-dtek-oem=14943da4f286058abdee133e16bf46d50548dd78fe24e0ef40b2b513173742f5a%3A2%3A%7Bi%3A0%3Bs%3A14%3A%22_csrf-dtek-oem%22%3Bi%3A1%3Bs%3A32%3A%2229IIR_8LEJA2wmYlaUkITfCnz_nTyWf1%22%3B%7D; visid_incap_2398477=jcFO++QVRFyc30m/uifUBlYX62oAAAAAQUIPAAAAAACJlnvVMplgOe4l+5MR0hIW; incap_ses_323_2398477=7jClKkCJcz/fA51wood7BFYX62oAAAAAJtD9ljb+qbjCKHQVDTxZLA==; incap_wrt_377=VxfragAAAACHcE5RGgAI+QIQn8XT76ICGIOxrNcGIAIo1q6s1wYwAQzffJkr6M8xOmsJ95BBu/E=',
      'Pragma': 'no-cache',
      'Cache-Control': 'no-cache',
    };

    const dtekResponse = await fetch(dtekUrl, {
      method: 'POST',
      headers,
      body: bodyParams.toString(),
    });

    const responseText = await dtekResponse.text();
    let jsonResponse: Record<string, unknown> = {};
    try {
      jsonResponse = JSON.parse(responseText);
    } catch {
      console.warn('Failed to parse DTEK response as JSON:', responseText.substring(0, 200));
    }

    const dataDict = (jsonResponse['data'] || jsonResponse) as Record<string, unknown>;
    const house11Data = dataDict ? (dataDict['11'] || dataDict[11] || null) : null;

    let startDate: string | null = null;
    let endDate: string | null = null;
    let subType: string | null = null;
    let subStatus: string | null = null;
    let queueGroup: string | null = null;

    if (house11Data && typeof house11Data === 'object') {
      const hObj = house11Data as Record<string, unknown>;
      startDate = hObj['start_date'] ? String(hObj['start_date']) : (hObj['startDate'] ? String(hObj['startDate']) : null);
      endDate = hObj['end_date'] ? String(hObj['end_date']) : (hObj['endDate'] ? String(hObj['endDate']) : null);
      subType = hObj['type'] ? String(hObj['type']) : null;
      subStatus = hObj['status'] ? String(hObj['status']) : null;

      if (hObj['sub_type_reason']) {
        if (Array.isArray(hObj['sub_type_reason']) && hObj['sub_type_reason'].length > 0) {
          queueGroup = String(hObj['sub_type_reason'][0]);
        } else if (typeof hObj['sub_type_reason'] === 'string') {
          queueGroup = String(hObj['sub_type_reason']);
        }
      }
    }

    if (!queueGroup) {
      queueGroup = 'GPV4.1'; // Default fallback queue group as specified in requirements
    }

    let scheduleDate: string | null = null;
    const hourlySchedule: {
      hour: number;
      fromTime: string;
      toTime: string;
      timeLabel: string;
      statusKey: string;
      statusLabel: string;
      firstHalfPower: boolean;
      secondHalfPower: boolean;
    }[] = [];

    // Fetch DisconSchedule.fact from https://www.dtek-oem.com.ua/ua/shutdowns
    try {
      const pageResponse = await fetch('https://www.dtek-oem.com.ua/ua/shutdowns', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:159.0) Gecko/20100101 Firefox/159.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7',
          'Cookie': headers['Cookie'],
        },
        signal: AbortSignal.timeout(6000),
      });

      if (pageResponse.ok) {
        const htmlText = await pageResponse.text();
        const factIdx = htmlText.indexOf('DisconSchedule.fact =');
        if (factIdx !== -1) {
          const sub = htmlText.substring(factIdx + 'DisconSchedule.fact ='.length).trim();
          let jsonStr = '';
          let braceCount = 0;
          let started = false;
          for (const char of sub) {
            if (char === '{') {
              braceCount++;
              started = true;
            }
            if (started) {
              jsonStr += char;
              if (char === '}') {
                braceCount--;
                if (braceCount === 0) {
                  break;
                }
              }
            }
          }

          if (jsonStr) {
            const factObj = JSON.parse(jsonStr);
            const dataSection = factObj['data'] || factObj;
            if (dataSection && typeof dataSection === 'object') {
              const dates = Object.keys(dataSection);
              const todayFormattedDate = dateFactFormatted.split(' ')[0]; // DD.MM.YYYY

              const targetDateKey = dates.find((d) => d === todayFormattedDate || d.includes(todayFormattedDate.substring(0, 5))) || dates[0];

              if (targetDateKey && dataSection[targetDateKey]) {
                scheduleDate = targetDateKey;
                const queueSection = dataSection[targetDateKey] as Record<string, unknown>;

                let hoursObj: Record<string, unknown> | null = null;
                if (queueGroup && queueSection[queueGroup]) {
                  hoursObj = queueSection[queueGroup] as Record<string, unknown>;
                } else {
                  const qKey = Object.keys(queueSection).find((k) => k === queueGroup || (queueGroup && k.includes(queueGroup))) || Object.keys(queueSection)[0];
                  if (qKey && queueSection[qKey]) {
                    hoursObj = queueSection[qKey] as Record<string, unknown>;
                    if (!queueGroup) queueGroup = qKey;
                  }
                }

                if (hoursObj) {
                  for (let h = 1; h <= 24; h++) {
                    const key = String(h);
                    const val = String(hoursObj[key] || 'yes').toLowerCase();
                    const fromHour = String(h - 1).padStart(2, '0');
                    const toHour = String(h).padStart(2, '0');
                    const fromTime = `${fromHour}:00`;
                    const toTime = `${toHour}:00`;
                    const timeLabel = `${fromTime} - ${toTime}`;

                    let firstHalfPower = true;
                    let secondHalfPower = true;
                    let statusLabel = 'Світло є';

                    if (val === 'no') {
                      firstHalfPower = false;
                      secondHalfPower = false;
                      statusLabel = 'Відключення світла';
                    } else if (val === 'first') {
                      firstHalfPower = false;
                      secondHalfPower = true;
                      statusLabel = `Відключення ${fromHour}:00 - ${fromHour}:30`;
                    } else if (val === 'second') {
                      firstHalfPower = true;
                      secondHalfPower = false;
                      statusLabel = `Відключення ${fromHour}:30 - ${toHour}:00`;
                    } else if (val === 'maybe') {
                      firstHalfPower = false;
                      secondHalfPower = false;
                      statusLabel = 'Можливе відключення';
                    }

                    hourlySchedule.push({
                      hour: h,
                      fromTime,
                      toTime,
                      timeLabel,
                      statusKey: val,
                      statusLabel,
                      firstHalfPower,
                      secondHalfPower,
                    });
                  }
                }
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('Error fetching or parsing DisconSchedule.fact HTML:', e);
    }

    // Fallback if hourlySchedule is empty (e.g. network issue reaching html page)
    if (hourlySchedule.length === 0) {
      scheduleDate = dateFactFormatted.split(' ')[0];
      for (let h = 1; h <= 24; h++) {
        const fromHour = String(h - 1).padStart(2, '0');
        const toHour = String(h).padStart(2, '0');
        hourlySchedule.push({
          hour: h,
          fromTime: `${fromHour}:00`,
          toTime: `${toHour}:00`,
          timeLabel: `${fromHour}:00 - ${toHour}:00`,
          statusKey: 'yes',
          statusLabel: 'Світло є',
          firstHalfPower: true,
          secondHalfPower: true,
        });
      }
    }

    return res.json({
      success: true,
      city: 'с-ще Окни',
      street: 'вул. Шкільна',
      houseNum: '11',
      updateFact: dateFactFormatted,
      fetchedAt: new Date().toISOString(),
      houseData: house11Data,
      startDate,
      endDate,
      subType,
      subStatus,
      queueGroup,
      scheduleDate,
      hourlySchedule,
      raw: jsonResponse,
    });
  } catch (err: unknown) {
    console.error('Error fetching DTEK shutdown data:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return res.json({
      success: false,
      error: msg,
      city: 'с-ще Окни',
      street: 'вул. Шкільна',
      houseNum: '11',
      fetchedAt: new Date().toISOString(),
    });
  }
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next): void => {
  if (req.path.startsWith('/api')) {
    res.status(404).json({ error: `API route ${req.method} ${req.path} not found` });
    return;
  }
  angularApp
    .handle(req)
    .then((response) => {
      if (response) {
        writeResponseToNodeResponse(response, res);
      } else {
        next();
      }
    })
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
