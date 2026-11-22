import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import * as QRCode from 'qrcode';
import { triggerFirebaseGooglePopup, triggerFirebaseSignOut } from '../firebase-client';
import { FirebaseAppletConfig, setFirebaseAppletConfig } from '../firebase-config';
import {
  CLIENT_INSTANCE_ID,
  getActiveImpersonateUid,
  setActiveImpersonateUid,
} from '../interceptors/auth.interceptor';
import {
  Client,
  PaymentTransaction,
  AppSettings,
  MonthRevenueStat,
  YearlyMonthIncomeStat,
  CurrentYearStatsSummary,
  ProviderAccount,
  ProviderAccountDetailed,
  ProviderAccountRenewal,
  ProviderDeposit,
  BudgetSummary,
  BudgetLedgerItem,
  BudgetApiResponse,
  ProviderBalanceAdjustment,
  UserRole,
  UserAccountStatus,
  HouseholdAccessLevel,
  MemberRelationTag,
  MEMBER_RELATION_TAGS,
  HouseholdInvite,
  AppUser,
  AppTabId,
  SettingsSectionId,
  SettingScopeType,
  UserPersonalSettings,
  SystemSettingsConfig,
  ALL_SETTINGS_SECTIONS,
  getDefaultUserSettingsSections,
  extractAllowedSettingsFromUser,
  DEFAULT_USER_TABS,
  ALL_ADMIN_TABS,
  calculateExtension,
  addMonthsExact,
  computeClientStatus,
} from '../models/client.model';
import {
  UtilityAccount,
  UtilityReading,
  UtilityTariffsSettings,
  UtilityServiceTabId,
  extractHiddenTabsFromAccount,
  isAccountHiddenInTab,
  DEFAULT_UTILITY_TARIFFS,
  ElectricityDevice,
  ElectricityScreenshotAnalysisResult,
  UtilityWeatherResponse,
  OutageScheduleViewVariant,
  DtekEmergencyOutageInfo,
  extractDtekEmergencyOutage,
} from '../models/utility.model';
import {
  ShoppingList,
  ShoppingItem,
  ShoppingPriceMode,
  ShoppingCatalogItem,
  ShoppingParticipant,
  ShoppingDataResponse,
  ShoppingCategoryId,
  DEFAULT_SHOPPING_CATALOG,
} from '../models/shopping.model';

const DEFAULT_SETTINGS: AppSettings = {
  cardRequisites: '',
  reminderDaysBefore: 7,
  defaultMonthlyPrice: 100,
  autoReminderEnabled: true,
  autoReminderCron: '0 10 * * *',
  reminderMessageTemplate:
    'Вітаємо, {name}! Нагадуємо, що термін дії вашої IPTV-підписки (логін: {login}) закінчується {expiry_date}. До сплати: {amount_to_pay} грн. Реквізити для оплати: {card_number}. Дякуємо, що ви з нами!',
  viberReminderMessageTemplate:
    'Доброго дня, {name}! Нагадуємо, що термін дії вашої підписки IPTV (логін: {login}) закінчується {active_until}. Сума до сплати: {amount} грн. Реквізити картки: {card}. Сьогодні {current_date}. Дякуємо, що ви з нами!',
  viberRenewalMessageTemplate:
    'Доброго дня, {name}! Вашу IPTV підписку (логін: {login}) успішно продовжено до {active_until}. Сума оплати: {amount} грн. Дата: {current_date}. Приємного перегляду!',
  utilityTariffsSettings: DEFAULT_UTILITY_TARIFFS,
};

export interface ConfirmDialogConfig {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  isAlertOnly?: boolean;
  tone?: 'danger' | 'warning' | 'info' | 'primary';
  icon?: string;
}

export interface ScheduleChangeLogEntry {
  id: string;
  queueKey: string;
  queueTitle?: string;
  detectedAt: string;
  detectedAtKyiv?: string;
  scheduleDate?: string;
  changeType?: string;
  title?: string;
  body?: string;
  addressLabel?: string;
  emergencyReason?: string;
  emergencyStartDate?: string;
  emergencyEndDate?: string;
  previousIntervals?: string[];
  oldIntervals?: string[];
  newIntervals: string[];
  totalPowerHours?: number;
  totalOutageHours?: number;
  oldTotalOutageHours?: number;
  summary?: string;
}

export function normalizeUtilityTariffs(raw?: Partial<UtilityTariffsSettings>): UtilityTariffsSettings {
  if (!raw) return DEFAULT_UTILITY_TARIFFS;
  const t = raw;
  const waterPrice =
    t.water?.price !== undefined && t.water?.price !== null && !isNaN(Number(t.water.price))
      ? Number(t.water.price)
      : DEFAULT_UTILITY_TARIFFS.water.price;
  const waterMonthlyFee =
    t.water?.monthlyFee !== undefined && t.water?.monthlyFee !== null && !isNaN(Number(t.water.monthlyFee))
      ? Number(t.water.monthlyFee)
      : (DEFAULT_UTILITY_TARIFFS.water.monthlyFee || 0);
  const waterValidFrom = t.water?.validFrom || DEFAULT_UTILITY_TARIFFS.water.validFrom;
  const waterValidTo = t.water?.validTo !== undefined ? t.water.validTo : (DEFAULT_UTILITY_TARIFFS.water.validTo || '');
  let waterHistory =
    t.water?.history && Array.isArray(t.water.history) && t.water.history.length > 0
      ? t.water.history.map((item) => ({ ...item }))
      : [];
  if (waterHistory.length === 0) {
    waterHistory = [{ id: 'wh_1', price: waterPrice, monthlyFee: waterMonthlyFee, validFrom: waterValidFrom, validTo: waterValidTo, note: 'Базовий тариф на воду' }];
  } else {
    waterHistory = waterHistory.map((item) =>
      item.validFrom === waterValidFrom || waterHistory.length === 1
        ? { ...item, price: waterPrice, monthlyFee: waterMonthlyFee, validTo: waterValidTo }
        : item
    );
  }

  const wastePrice =
    t.waste?.price !== undefined && t.waste?.price !== null && !isNaN(Number(t.waste.price))
      ? Number(t.waste.price)
      : DEFAULT_UTILITY_TARIFFS.waste.price;
  const wasteValidFrom = t.waste?.validFrom || DEFAULT_UTILITY_TARIFFS.waste.validFrom;
  const wasteValidTo = t.waste?.validTo !== undefined ? t.waste.validTo : (DEFAULT_UTILITY_TARIFFS.waste.validTo || '');
  let wasteHistory =
    t.waste?.history && Array.isArray(t.waste.history) && t.waste.history.length > 0
      ? t.waste.history.map((item) => ({ ...item }))
      : [];
  if (wasteHistory.length === 0) {
    wasteHistory = [{ id: 'wsh_1', price: wastePrice, validFrom: wasteValidFrom, validTo: wasteValidTo, note: 'Базовий тариф на вивіз сміття' }];
  } else {
    wasteHistory = wasteHistory.map((item) =>
      item.validFrom === wasteValidFrom || wasteHistory.length === 1
        ? { ...item, price: wastePrice, validTo: wasteValidTo }
        : item
    );
  }

  const elecSingleRate =
    t.electricitySingle?.rate !== undefined && t.electricitySingle?.rate !== null && !isNaN(Number(t.electricitySingle.rate))
      ? Number(t.electricitySingle.rate)
      : DEFAULT_UTILITY_TARIFFS.electricitySingle.rate;
  const elecSingleValidFrom = t.electricitySingle?.validFrom || DEFAULT_UTILITY_TARIFFS.electricitySingle.validFrom;
  const elecSingleValidTo = t.electricitySingle?.validTo !== undefined ? t.electricitySingle.validTo : (DEFAULT_UTILITY_TARIFFS.electricitySingle.validTo || '');
  let elecSingleHistory =
    t.electricitySingle?.history && Array.isArray(t.electricitySingle.history) && t.electricitySingle.history.length > 0
      ? t.electricitySingle.history.map((item) => ({ ...item }))
      : [];
  if (elecSingleHistory.length === 0) {
    elecSingleHistory = [{ id: 'esh_1', rate: elecSingleRate, validFrom: elecSingleValidFrom, validTo: elecSingleValidTo, note: 'Єдиний тариф на електроенергію' }];
  } else {
    elecSingleHistory = elecSingleHistory.map((item) =>
      item.validFrom === elecSingleValidFrom || elecSingleHistory.length === 1
        ? { ...item, rate: elecSingleRate, validTo: elecSingleValidTo }
        : item
    );
  }

  const elecDualValidFrom = t.electricityDual?.validFrom || DEFAULT_UTILITY_TARIFFS.electricityDual.validFrom;
  const elecDualValidTo = t.electricityDual?.validTo !== undefined ? t.electricityDual.validTo : (DEFAULT_UTILITY_TARIFFS.electricityDual.validTo || '');
  const elecDualSummerDay = t.electricityDual?.summerDay !== undefined ? Number(t.electricityDual.summerDay) : DEFAULT_UTILITY_TARIFFS.electricityDual.summerDay;
  const elecDualSummerNight = t.electricityDual?.summerNight !== undefined ? Number(t.electricityDual.summerNight) : DEFAULT_UTILITY_TARIFFS.electricityDual.summerNight;
  const elecDualWinterDay = t.electricityDual?.winterDay !== undefined ? Number(t.electricityDual.winterDay) : DEFAULT_UTILITY_TARIFFS.electricityDual.winterDay;
  const elecDualWinterNight = t.electricityDual?.winterNight !== undefined ? Number(t.electricityDual.winterNight) : DEFAULT_UTILITY_TARIFFS.electricityDual.winterNight;
  const elecDualWinterLimit = t.electricityDual?.winterLimitKwh !== undefined ? Number(t.electricityDual.winterLimitKwh) : (DEFAULT_UTILITY_TARIFFS.electricityDual.winterLimitKwh ?? 2000);
  let elecDualHistory =
    t.electricityDual?.history && Array.isArray(t.electricityDual.history) && t.electricityDual.history.length > 0
      ? t.electricityDual.history.map((item) => ({ ...item }))
      : [];
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
    elecDualHistory = elecDualHistory.map((item) =>
      item.validFrom === elecDualValidFrom || elecDualHistory.length === 1
        ? {
            ...item,
            summerDay: elecDualSummerDay,
            summerNight: elecDualSummerNight,
            winterDay: elecDualWinterDay,
            winterNight: elecDualWinterNight,
            winterLimitKwh: elecDualWinterLimit,
            validTo: elecDualValidTo,
          }
        : item
    );
  }

  const outageScheduleViewVariant: OutageScheduleViewVariant =
    t.outageScheduleViewVariant || DEFAULT_UTILITY_TARIFFS.outageScheduleViewVariant || 'v1_classic_grid';
  const dtekSyncIntervalMinutes =
    typeof t.dtekSyncIntervalMinutes === 'number' && !isNaN(t.dtekSyncIntervalMinutes) && t.dtekSyncIntervalMinutes >= 1
      ? Math.min(Math.round(t.dtekSyncIntervalMinutes), 360)
      : (DEFAULT_UTILITY_TARIFFS.dtekSyncIntervalMinutes ?? 20);

  return {
    outageScheduleViewVariant,
    dtekSyncIntervalMinutes,
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

interface StatsSummary {
  totalClients: number;
  activeClients: number;
  expiringSoonClients: number;
  expiredClients: number;
  pausedClients: number;
  currentMonthRevenue: number;
  projectedMonthlyRevenue: number;
  paymentsThisMonthCount: number;
  totalBalanceSum: number;
}

export interface BroadcastResult {
  totalProcessed: number;
  results: {
    clientId: string;
    clientName: string;
    phone: string;
    method: 'manual';
    success: boolean;
    error?: string;
  }[];
}

export interface DatabaseInstanceInfo {
  mode: string;
  provider: string;
  host: string;
  database: string;
  configured: boolean;
  connected: boolean;
  lastUpdate?: string;
  lastVersion?: string;
  error: string | null;
  counts: {
    clients: number;
    payments: number;
    providerAccounts?: number;
    providerDeposits?: number;
    utilityAccounts?: number;
    utilityReadings?: number;
    customLedgerEntries?: number;
    users?: number;
    settingsConfigured?: boolean;
  };
}

export interface CopyDatabasesSummary {
  success: boolean;
  sourceMode: 'cloudsql' | 'external';
  targetMode: 'cloudsql' | 'external';
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
  message?: string;
  error?: string;
}

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

export interface CloudDbStatus {
  activeMode?: string;
  provider: string;
  projectId: string;
  databaseId: string;
  connected: boolean;
  lastSync: string | null;
  globalLastUpdate?: string;
  globalVersion?: string;
  dbLastUpdateTimes?: Record<string, string>;
  dbLastUpdateVersions?: Record<string, string>;
  schemaVersion?: string;
  autoBackgroundSync?: boolean;
  error?: string | null;
  customDatabases?: CustomDbProfile[];
  benchmarks?: Record<string, { latencyMs: number; status: 'online' | 'offline'; testedAt: string }>;
  instances?: Record<string, DatabaseInstanceInfo>;
  stats?: {
    clientsCount: number;
    paymentsCount: number;
    providerAccountsCount: number;
    providerDepositsCount: number;
    settingsConfigured: boolean;
  };
}

export interface DtekHourSchedule {
  hour: number;
  fromTime: string;
  toTime: string;
  timeLabel: string;
  statusKey: string;
  statusLabel: string;
  firstHalfPower: boolean;
  secondHalfPower: boolean;
}

export interface DtekDaySchedule {
  dateKey: string;
  scheduleDate: string;
  dayLabel: string;
  isToday: boolean;
  isTomorrow: boolean;
  queueGroup: string;
  totalPowerHours: number;
  totalOutageHours: number;
  hourlySchedule: DtekHourSchedule[];
}

export interface DtekQueueSchedule {
  queueKey: string;
  queueNumber: string;
  queueTitle: string;
  scheduleDate: string;
  isPowerAvailableNow: boolean;
  totalPowerHours: number;
  totalOutageHours: number;
  outageIntervals: string[];
  hourlySchedule: DtekHourSchedule[];
  tomorrowSchedule: DtekDaySchedule | null;
}

export interface DtekShutdownInfo {
  success: boolean;
  city?: string;
  street?: string;
  houseNum?: string;
  updateFact?: string;
  dtekJsonUpdatedAt?: string;
  fetchedAt?: string;
  lastDtekFetchAt?: string;
  lastDtekFetchAtIso?: string;
  lastDtekFetchAtMs?: number;
  nextAllowedFetchAtMs?: number;
  minutesUntilNextRefresh?: number;
  syncIntervalMinutes?: number;
  servedFromDatabase?: boolean;
  didFetchLiveFromDtek?: boolean;
  refreshSkippedByCooldown?: boolean;
  startDate?: string | null;
  endDate?: string | null;
  subType?: string | null;
  subStatus?: string | null;
  queueGroup?: string | null;
  scheduleDate?: string | null;
  hourlySchedule?: DtekHourSchedule[];
  dailySchedules?: DtekDaySchedule[];
  tomorrowSchedule?: DtekDaySchedule | null;
  allQueuesSchedules?: DtekQueueSchedule[];
  isPowerAvailableNow?: boolean;
  isEmergencyOutage?: boolean;
  isFactOutageNow?: boolean;
  isEmergencyUpcoming?: boolean;
  emergencyOutageReason?: string | null;
  emergencyStartDate?: string | null;
  emergencyEndDate?: string | null;
  emergencyWindowLabel?: string | null;
  currentKyivHour?: number;
  kyivTime?: string;
  recentScheduleChanges?: ScheduleChangeLogEntry[];
  houseData?: Record<string, unknown> | null;
  raw?: Record<string, unknown>;
  error?: string;
}

export interface DtekMeterCheckZone {
  codeZone: string;
  codeScale: string;
  alias: string;
  name: string;
  old: string;
  readingDate: string;
}

export interface DtekMeterCheckProfile {
  companyId?: string;
  kontAccountId?: string;
  worksId?: string;
  worksName?: string;
  eicCode?: string;
  languageId?: string;
  equipNumber?: string;
  nameByPass?: string;
}

export interface DtekMeterCheckResult {
  result: boolean;
  address?: string;
  personalAccountNumberText?: string;
  personalAccountAddressText?: string;
  counterNumber?: string;
  counterModel?: string;
  data?: DtekMeterCheckZone[];
  profile?: DtekMeterCheckProfile;
  listAddresses?: boolean;
  [key: string]: unknown;
}

export interface DtekMeterCheckApiResponse {
  success: boolean;
  formattedNumber: string;
  rawNumber: string;
  data?: DtekMeterCheckResult;
  error?: string;
  details?: string;
}

export interface DtekMeterSubmitApiResponse {
  success: boolean;
  message?: string;
  data?: Record<string, unknown>;
  sentPayload?: {
    method: string;
    data: Record<string, unknown>[];
    profile: Record<string, unknown>;
  };
  error?: string;
  details?: string;
}

export function formatDtekMeterAccountNumber(rawNumber: string): string {
  if (!rawNumber) return '';
  const clean = String(rawNumber).trim().replace(/\s+/g, '');
  if (clean.includes('/')) {
    const [prefix, suffix] = clean.split('/');
    const cleanSuffix = (suffix || '').replace(/^0+/, '') || '0';
    return `${prefix}/${cleanSuffix}`;
  }
  return clean;
}

@Injectable({
  providedIn: 'root',
})
export class IptvData {
  private readonly http = inject(HttpClient);

  // Core state signals
  readonly clients = signal<Client[]>([]);
  readonly payments = signal<PaymentTransaction[]>([]);
  readonly settings = signal<AppSettings>(DEFAULT_SETTINGS);
  readonly monthlyStats = signal<MonthRevenueStat[]>([]);
  readonly accounts = signal<ProviderAccountDetailed[]>([]);
  readonly budgetSummary = signal<BudgetSummary | null>(null);
  readonly deposits = signal<ProviderDeposit[]>([]);
  readonly providerAdjustments = signal<ProviderBalanceAdjustment[]>([]);
  readonly ledger = signal<BudgetLedgerItem[]>([]);
  readonly utilityAccounts = signal<UtilityAccount[]>([]);
  readonly utilityReadings = signal<UtilityReading[]>([]);
  readonly pendingOpenAddHouseModal = signal<boolean>(false);
  readonly dbStatus = signal<CloudDbStatus | null>(null);
  readonly dtekShutdownInfo = signal<DtekShutdownInfo | null>(null);
  readonly dtekCities = signal<string[]>([]);
  readonly dtekStreets = signal<string[]>([]);
  readonly isDtekCatalogLoading = signal<boolean>(false);
  readonly isDtekLoading = signal<boolean>(false);
  readonly dtekError = signal<string | null>(null);
  readonly isSyncingCloud = signal<boolean>(false);
  readonly isSwitchingDb = signal<boolean>(false);
  readonly isCopyingDb = signal<boolean>(false);
  readonly lastCopyResult = signal<CopyDatabasesSummary | null>(null);
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly autoSyncActive = signal<boolean>(true);
  readonly lastAutoSyncTime = signal<string>(new Date().toISOString());

  // Global Material Confirm / Alert Dialog (replaces window.confirm & window.alert for Android)
  readonly confirmDialog = signal<ConfirmDialogConfig | null>(null);
  private confirmDialogResolver: ((accepted: boolean) => void) | null = null;

  // User Authentication & Role Management Signals
  readonly currentUser = signal<AppUser | null>(null);
  readonly realAdminUser = signal<AppUser | null>(null);
  readonly impersonatedUser = signal<AppUser | null>(null);
  readonly isImpersonating = computed<boolean>(
    () =>
      !!this.impersonatedUser() ||
      Boolean(this.realAdminUser() && this.currentUser() && this.currentUser()!.id !== this.realAdminUser()!.id)
  );
  readonly authToken = signal<string | null>(null);
  readonly googleAccessToken = signal<string | null>(null);
  readonly isAuthLoading = signal<boolean>(true);
  readonly googleClientId = signal<string>('');
  readonly usersList = signal<AppUser[]>([]);
  readonly adminUtilityAccounts = signal<UtilityAccount[]>([]);

  // Role Computed Flags
  readonly isAuthenticated = computed<boolean>(() => !!this.currentUser());
  readonly isAdmin = computed<boolean>(() => this.currentUser()?.role === 'admin');
  readonly isRealAdmin = computed<boolean>(() => this.isAdmin() || this.realAdminUser()?.role === 'admin');
  readonly isViewer = computed<boolean>(() => this.currentUser()?.role === 'user');
  readonly isNewUser = computed<boolean>(() => this.currentUser()?.role === 'new');
  readonly isUserBlocked = computed<boolean>(() => {
    const user = this.currentUser();
    if (!user) return false;
    return user.status === 'inactive' || user.role === 'new';
  });
  readonly canEdit = computed<boolean>(() => {
    const user = this.currentUser();
    if (!user) return false;
    if (user.status === 'inactive' || user.role === 'new') return false;
    if (user.householdAccessLevel === 'view_only') return false;
    if (user.role === 'admin' || user.role === 'user') return user.canManageOwnData !== false;
    return false;
  });
  readonly canView = computed<boolean>(() => !!this.currentUser() && !this.isUserBlocked());
  readonly pendingUsersCount = computed<number>(
    () => this.usersList().filter((u) => u.role === 'new' || u.status === 'inactive').length
  );

  readonly allowedTabs = computed<AppTabId[]>(() => {
    const user = this.currentUser();
    if (!user || user.status === 'inactive' || user.role === 'new') {
      return [];
    }
    const cleanUserTabs = Array.isArray(user.allowedTabs)
      ? (user.allowedTabs.filter(
          (t) =>
            typeof t === 'string' &&
            !t.startsWith('settings:') &&
            !t.startsWith('tag:') &&
            !t.startsWith('access:') &&
            !t.startsWith('invitedBy:') &&
            !t.startsWith('invitedByName:')
        ) as AppTabId[])
      : [];
    const rawTabs =
      cleanUserTabs.length > 0
        ? cleanUserTabs
        : user.role === 'admin'
          ? [...ALL_ADMIN_TABS]
          : [...DEFAULT_USER_TABS];
    const expanded = new Set<AppTabId>(rawTabs);
    if (expanded.has('electricity')) {
      expanded.add('outage_schedule');
    }
    if (expanded.has('water_waste')) {
      expanded.add('water');
      expanded.add('waste');
    }
    if (user.role === 'admin') {
      expanded.add('shopping');
      expanded.add('users');
      expanded.add('settings');
    } else {
      if (
        expanded.has('electricity') ||
        expanded.has('water') ||
        expanded.has('waste') ||
        expanded.has('outage_schedule')
      ) {
        expanded.add('shopping');
      }
      if (this.allowedSettingsSections().length > 0) {
        expanded.add('settings');
      }
    }
    return Array.from(expanded);
  });

  // Per-User Settings (`user_settings` table) & System Settings Config (`system_settings_config` table)
  readonly userPersonalSettings = signal<UserPersonalSettings>({
    userId: 'anonymous',
    themeMode: 'light',
    outageScheduleViewVariant: 'v10_minimal_pills',
    hiddenHouseTabs: {},
    electricityTariffs: null,
    waterTariffs: null,
    wasteTariffs: null,
    customPreferences: {},
  });

  readonly allUsersPersonalSettings = signal<Record<string, UserPersonalSettings>>({});

  readonly systemSettingsConfig = signal<SystemSettingsConfig>({
    id: 'global',
    scopesConfig: {
      theme: 'user',
      outage_display: 'user',
      house_visibility: 'user',
      ooek_credentials: 'user',
      electricity_tariffs: 'user',
      water_tariffs: 'user',
      waste_tariffs: 'user',
      outage_sync_interval: 'system',
      billing: 'system',
      viber: 'system',
      database: 'system',
      backup: 'system',
    },
    systemValues: {},
  });

  getSettingScope(sectionId: SettingsSectionId): SettingScopeType {
    const normalizedId = sectionId === 'water_waste_tariffs' ? 'water_tariffs' : sectionId;
    const fromConfig = this.systemSettingsConfig().scopesConfig?.[normalizedId];
    if (fromConfig === 'user' || fromConfig === 'system') {
      return fromConfig;
    }
    const meta = ALL_SETTINGS_SECTIONS.find((s) => s.id === normalizedId);
    return meta?.defaultScope || 'user';
  }

  getUserScopedSettingsSections(): SettingsSectionId[] {
    const scopes = this.systemSettingsConfig().scopesConfig || {};
    return getDefaultUserSettingsSections(scopes);
  }

  readonly allowedSettingsSections = computed<SettingsSectionId[]>(() => {
    const user = this.currentUser();
    if (!user || user.status === 'inactive' || user.role === 'new') {
      return [];
    }
    if (user.role === 'admin') {
      return ALL_SETTINGS_SECTIONS.map((s) => s.id);
    }
    const scopes = this.systemSettingsConfig().scopesConfig || {};
    return extractAllowedSettingsFromUser(user, scopes);
  });

  isSettingsSectionAllowed(sectionId: SettingsSectionId): boolean {
    const user = this.currentUser();
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (sectionId === 'water_waste_tariffs') {
      return (
        this.allowedSettingsSections().includes('water_tariffs') ||
        this.allowedSettingsSections().includes('waste_tariffs')
      );
    }
    return this.allowedSettingsSections().includes(sectionId);
  }

  isTabAllowed(tab: AppTabId): boolean {
    const user = this.currentUser();
    if (!user) return false;
    if (tab === 'users') return user.role === 'admin';
    if (tab === 'settings') {
      return user.role === 'admin' || this.allowedSettingsSections().length > 0;
    }
    const tabs = this.allowedTabs();
    if (tab === 'outage_schedule') {
      return tabs.includes('outage_schedule') || tabs.includes('electricity');
    }
    if (tab === 'water' || tab === 'waste') {
      return tabs.includes(tab) || tabs.includes('water_waste');
    }
    if (tab === 'water_waste') {
      return tabs.includes('water_waste') || tabs.includes('water') || tabs.includes('waste');
    }
    return tabs.includes(tab);
  }

  // Utility Houses separated into two distinct groups:
  // 1) Outage Schedule & Electricity share 'electricity' houses
  // 2) Water & Waste share 'water_waste' houses
  readonly allUtilityHouses = computed(() => this.utilityAccounts());

  private isElectricityGroupHouse(a: UtilityAccount): boolean {
    return !a.type || a.type === 'electricity';
  }

  private isWaterWasteGroupHouse(a: UtilityAccount): boolean {
    return a.type === 'water_waste';
  }

  readonly scheduleAccounts = computed(() =>
    this.utilityAccounts().filter(
      (a) => this.isElectricityGroupHouse(a) && !this.isHouseHiddenInTab(a, 'outage_schedule')
    )
  );

  readonly electricityAccounts = computed(() =>
    this.utilityAccounts().filter(
      (a) => this.isElectricityGroupHouse(a) && !this.isHouseHiddenInTab(a, 'electricity')
    )
  );

  readonly waterAccounts = computed(() =>
    this.utilityAccounts().filter(
      (a) => this.isWaterWasteGroupHouse(a) && !this.isHouseHiddenInTab(a, 'water')
    )
  );

  readonly wasteAccounts = computed(() =>
    this.utilityAccounts().filter(
      (a) => this.isWaterWasteGroupHouse(a) && !this.isHouseHiddenInTab(a, 'waste')
    )
  );

  readonly waterWasteAccounts = computed(() =>
    this.utilityAccounts().filter(
      (a) =>
        this.isWaterWasteGroupHouse(a) &&
        (!this.isHouseHiddenInTab(a, 'water') || !this.isHouseHiddenInTab(a, 'waste'))
    )
  );

  getVisibleAccountsForTab(tab: UtilityServiceTabId): UtilityAccount[] {
    const isElecGroup = tab === 'outage_schedule' || tab === 'electricity';
    return this.utilityAccounts().filter((a) => {
      const inGroup = isElecGroup ? this.isElectricityGroupHouse(a) : this.isWaterWasteGroupHouse(a);
      return inGroup && !this.isHouseHiddenInTab(a, tab);
    });
  }

  getHiddenAccountsForTab(tab: UtilityServiceTabId): UtilityAccount[] {
    const isElecGroup = tab === 'outage_schedule' || tab === 'electricity';
    return this.utilityAccounts().filter((a) => {
      const inGroup = isElecGroup ? this.isElectricityGroupHouse(a) : this.isWaterWasteGroupHouse(a);
      return inGroup && this.isHouseHiddenInTab(a, tab);
    });
  }

  isHouseHiddenInTab(acc: UtilityAccount | null | undefined, tab: UtilityServiceTabId): boolean {
    if (!acc) return false;
    const scope = this.getSettingScope('house_visibility');
    if (scope === 'user') {
      const personalMap = this.userPersonalSettings().hiddenHouseTabs;
      if (personalMap && Array.isArray(personalMap[acc.id])) {
        return personalMap[acc.id].includes(tab);
      }
    }
    return isAccountHiddenInTab(acc, tab);
  }

  isHouseHiddenInTabForUser(
    userId: string,
    acc: UtilityAccount | null | undefined,
    tab: UtilityServiceTabId
  ): boolean {
    if (!acc) return false;
    const allMap = this.allUsersPersonalSettings();
    const userEntry =
      userId === this.currentUser()?.id ? this.userPersonalSettings() : allMap[userId];
    if (userEntry?.hiddenHouseTabs && Array.isArray(userEntry.hiddenHouseTabs[acc.id])) {
      return userEntry.hiddenHouseTabs[acc.id].includes(tab);
    }
    return isAccountHiddenInTab(acc, tab);
  }

  async toggleHouseVisibilityInTab(accountId: string, tab: UtilityServiceTabId): Promise<void> {
    const acc = this.utilityAccounts().find((a) => a.id === accountId);
    if (!acc) return;
    const isElecGroup = this.isElectricityGroupHouse(acc);
    const allowedTabsForGroup: UtilityServiceTabId[] = isElecGroup
      ? ['outage_schedule', 'electricity']
      : ['water', 'waste'];

    const scope = this.getSettingScope('house_visibility');
    if (scope === 'user') {
      const currentMap = { ...(this.userPersonalSettings().hiddenHouseTabs || {}) };
      const existingList = Array.isArray(currentMap[accountId])
        ? currentMap[accountId]
        : extractHiddenTabsFromAccount(acc);
      const currentHidden = new Set<UtilityServiceTabId>(
        (existingList as UtilityServiceTabId[]).filter((t) => allowedTabsForGroup.includes(t))
      );
      if (currentHidden.has(tab)) {
        currentHidden.delete(tab);
      } else {
        currentHidden.add(tab);
      }
      currentMap[accountId] = Array.from(currentHidden);
      await this.saveUserPersonalSettings({ hiddenHouseTabs: currentMap });
      return;
    }

    const currentHidden = new Set<UtilityServiceTabId>(
      extractHiddenTabsFromAccount(acc).filter((t) => allowedTabsForGroup.includes(t))
    );
    const wasHidden = currentHidden.has(tab);
    if (wasHidden) {
      currentHidden.delete(tab);
    } else {
      currentHidden.add(tab);
    }
    const nextHidden = Array.from(currentHidden);
    await this.saveUtilityAccount({
      ...acc,
      hiddenUtilityTabs: nextHidden,
      ...(isElecGroup
        ? {}
        : {
            waterEnabled: !nextHidden.includes('water'),
            wasteEnabled: !nextHidden.includes('waste'),
          }),
    });
  }

  async toggleHouseVisibilityInTabForUser(
    userId: string,
    accountId: string,
    tab: UtilityServiceTabId
  ): Promise<void> {
    const allHouses =
      this.adminUtilityAccounts().length > 0 ? this.adminUtilityAccounts() : this.utilityAccounts();
    const acc = allHouses.find((a) => a.id === accountId);
    if (!acc) return;
    const isElecGroup = this.isElectricityGroupHouse(acc);
    const allowedTabsForGroup: UtilityServiceTabId[] = isElecGroup
      ? ['outage_schedule', 'electricity']
      : ['water', 'waste'];

    const allMap = this.allUsersPersonalSettings();
    const userEntry =
      userId === this.currentUser()?.id
        ? this.userPersonalSettings()
        : allMap[userId] || {
            userId,
            themeMode: 'light',
            outageScheduleViewVariant: 'v10_minimal_pills',
            hiddenHouseTabs: {},
          };
    const currentMap = { ...(userEntry.hiddenHouseTabs || {}) };
    const existingList = Array.isArray(currentMap[accountId])
      ? currentMap[accountId]
      : extractHiddenTabsFromAccount(acc);
    const currentHidden = new Set<UtilityServiceTabId>(
      (existingList as UtilityServiceTabId[]).filter((t) => allowedTabsForGroup.includes(t))
    );
    if (currentHidden.has(tab)) {
      currentHidden.delete(tab);
    } else {
      currentHidden.add(tab);
    }
    currentMap[accountId] = Array.from(currentHidden);
    await this.saveUserPersonalSettings({ hiddenHouseTabs: currentMap }, userId);
  }

  readonly systemUtilityTariffs = computed<UtilityTariffsSettings>(() =>
    normalizeUtilityTariffs(this.settings().utilityTariffsSettings || DEFAULT_UTILITY_TARIFFS)
  );

  readonly utilityTariffs = computed<UtilityTariffsSettings>(() => {
    const sys = this.systemUtilityTariffs();
    const usr = this.userPersonalSettings();
    const elecScope = this.getSettingScope('electricity_tariffs');
    const waterScope = this.getSettingScope('water_tariffs');
    const wasteScope = this.getSettingScope('waste_tariffs');

    const electricitySingle =
      elecScope === 'user' && usr.electricityTariffs?.electricitySingle
        ? usr.electricityTariffs.electricitySingle
        : sys.electricitySingle;
    const electricityDual =
      elecScope === 'user' && usr.electricityTariffs?.electricityDual
        ? usr.electricityTariffs.electricityDual
        : sys.electricityDual;
    const water = waterScope === 'user' && usr.waterTariffs ? usr.waterTariffs : sys.water;
    const waste = wasteScope === 'user' && usr.wasteTariffs ? usr.wasteTariffs : sys.waste;

    return normalizeUtilityTariffs({
      ...sys,
      electricitySingle,
      electricityDual,
      water,
      waste,
    });
  });

  readonly dtekSyncIntervalMinutes = computed<number>(() => {
    const fromSysVals = Number(this.systemSettingsConfig().systemValues?.['dtekSyncIntervalMinutes']);
    if (!isNaN(fromSysVals) && fromSysVals >= 1 && fromSysVals <= 360) {
      return Math.round(fromSysVals);
    }
    const fromSettings = Number(this.settings().dtekSyncIntervalMinutes);
    if (!isNaN(fromSettings) && fromSettings >= 1 && fromSettings <= 360) {
      return Math.round(fromSettings);
    }
    const fromTariffs = Number(this.settings().utilityTariffsSettings?.dtekSyncIntervalMinutes);
    if (!isNaN(fromTariffs) && fromTariffs >= 1 && fromTariffs <= 360) {
      return Math.round(fromTariffs);
    }
    const fromInfo = Number(this.dtekShutdownInfo()?.syncIntervalMinutes);
    if (!isNaN(fromInfo) && fromInfo >= 1 && fromInfo <= 360) {
      return Math.round(fromInfo);
    }
    return 20;
  });

  // Active & Default Electricity House for Outage Schedule
  readonly selectedDtekAccountId = signal<string>('');
  readonly isSavingDefaultHouse = signal<boolean>(false);

  readonly defaultDtekAccountId = computed<string>(() => {
    const elecAll = this.utilityAccounts().filter((a) => this.isElectricityGroupHouse(a));
    const accounts = this.scheduleAccounts().length > 0 ? this.scheduleAccounts() : elecAll;
    if (accounts.length === 1) {
      return accounts[0].id;
    }
    const userDefault = this.currentUser()?.defaultUtilityAccountId;
    if (userDefault && accounts.some((a) => a.id === userDefault)) {
      return userDefault;
    }
    return accounts[0]?.id || '';
  });

  readonly activeDtekAccount = computed<UtilityAccount | null>(() => {
    const elecAll = this.utilityAccounts().filter((a) => this.isElectricityGroupHouse(a));
    const accounts = this.scheduleAccounts().length > 0 ? this.scheduleAccounts() : elecAll;
    if (accounts.length === 0) return null;
    if (accounts.length === 1) return accounts[0];

    const manualId = this.selectedDtekAccountId();
    if (manualId) {
      const foundManual = accounts.find((a) => a.id === manualId);
      if (foundManual) return foundManual;
    }

    const userDefault = this.currentUser()?.defaultUtilityAccountId;
    if (userDefault) {
      const foundDefault = accounts.find((a) => a.id === userDefault);
      if (foundDefault) return foundDefault;
    }

    return accounts[0];
  });

  private lastKnownVersion = 0;
  private broadcastChannel: BroadcastChannel | null = null;
  private autoSyncInterval: ReturnType<typeof setInterval> | null = null;
  private inFlightSettingsPromise: Promise<void> | null = null;
  private inFlightRefreshAllPromise: Promise<void> | null = null;
  private inFlightStatsPromise: Promise<void> | null = null;
  private inFlightBudgetPromise: Promise<void> | null = null;
  private inFlightAccountsPromise: Promise<void> | null = null;
  private inFlightClientsPromise: Promise<void> | null = null;
  private inFlightPaymentsPromise: Promise<void> | null = null;
  private inFlightUtilityPromise: Promise<void> | null = null;
  private inFlightShoppingPromise: Promise<void> | null = null;
  private lastUtilityFetchTime = 0;
  private lastDtekCatalogKey = '';
  private lastDtekCatalogFetchTime = 0;
  private lastSettingsFetchTime = 0;
  private settingsCooldownUntil = 0;
  private apiRateLimitCooldownUntil = 0;
  private lastVersionCheckTime = 0;

  private isRateLimitError(err: unknown): boolean {
    const httpErr = err as { status?: number; message?: string; error?: unknown };
    if (httpErr?.status === 429) return true;
    const msg = String(httpErr?.message || httpErr?.error || '');
    return msg.includes('429') || msg.toLowerCase().includes('rate exceeded');
  }

  private activateRateLimitCooldown(): void {
    const until = Date.now() + 30000;
    this.apiRateLimitCooldownUntil = Math.max(this.apiRateLimitCooldownUntil, until);
    this.settingsCooldownUntil = Math.max(this.settingsCooldownUntil, until);
  }

  // Provider Balance USD & Low Balance Alert (< $5.00)
  readonly providerBalanceUsd = computed<number>(() => {
    const summary = this.budgetSummary();
    if (summary && typeof summary.providerBalanceUsd === 'number') {
      return summary.providerBalanceUsd;
    }
    const ledgerList = this.ledger();
    const latestWithBalance = ledgerList.find(
      (i) => i.balanceAfterUsd !== undefined && i.balanceAfterUsd !== null && !isNaN(i.balanceAfterUsd)
    );
    if (latestWithBalance && typeof latestWithBalance.balanceAfterUsd === 'number') {
      return latestWithBalance.balanceAfterUsd;
    }
    const totalDeposited = this.deposits().reduce((sum, d) => sum + (Number(d.amountUsd) || 0), 0);
    const totalDeducted = this.accounts().reduce((sum, a) => sum + (Number(a.totalDeductedUsd) || 0), 0);
    const customDelta = (ledgerList || []).reduce((sum, e) => sum + (Number(e.amountUsd) || 0), 0);
    const adjustmentsSum = this.providerAdjustments().reduce((sum, a) => sum + (Number(a.amountUsd) || 0), 0);
    return Math.round((totalDeposited - totalDeducted + customDelta + adjustmentsSum) * 100) / 100;
  });

  readonly isProviderBalanceLow = computed<boolean>(() => {
    return this.providerBalanceUsd() < 5;
  });

  readonly providerBalanceHealth = computed<'critical' | 'warning' | 'good'>(() => {
    const bal = this.providerBalanceUsd();
    if (bal < 5) return 'critical';
    if (bal < 15) return 'warning';
    return 'good';
  });

  // Computed Real-Time KPIs
  readonly stats = computed<StatsSummary>(() => {
    const list = this.clients();
    const paymentsList = this.payments();
    const daysLimit = this.settings().reminderDaysBefore || 7;

    const totalClients = list.length;
    let activeClients = 0;
    let expiringSoonClients = 0;
    let expiredClients = 0;
    let pausedClients = 0;
    let projectedMonthlyRevenue = 0;
    let totalBalanceSum = 0;

    const todayStr = new Date().toISOString().split('T')[0];
    const currentMonthKey = todayStr.substring(0, 7);

    for (const c of list) {
      totalBalanceSum += Number(c.balance) || 0;
      if (c.status === 'paused') {
        pausedClients++;
        continue;
      }

      projectedMonthlyRevenue += Number(c.monthlyPrice) || 0;

      // Check dates
      const expDate = new Date(c.activeUntil);
      const todayDate = new Date(todayStr);
      const diffDays = Math.ceil((expDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays < 0) {
        expiredClients++;
      } else if (diffDays <= daysLimit) {
        expiringSoonClients++;
        activeClients++;
      } else {
        activeClients++;
      }
    }

    // Current month revenue (payments + custom income ledger entries)
    const ledgerList = this.ledger();
    let currentMonthRevenue = 0;
    let paymentsThisMonthCount = 0;
    for (const p of paymentsList) {
      if (p.date && p.date.startsWith(currentMonthKey)) {
        currentMonthRevenue += Number(p.amount) || 0;
        paymentsThisMonthCount++;
      }
    }
    for (const item of ledgerList) {
      if (item.isCustom && item.type === 'income' && (Number(item.amountUah) || 0) > 0 && item.date && item.date.startsWith(currentMonthKey)) {
        currentMonthRevenue += Number(item.amountUah) || 0;
        paymentsThisMonthCount++;
      }
    }

    return {
      totalClients,
      activeClients,
      expiringSoonClients,
      expiredClients,
      pausedClients,
      currentMonthRevenue,
      projectedMonthlyRevenue,
      paymentsThisMonthCount,
      totalBalanceSum,
    };
  });

  // Current Year Revenue Dynamics & Statistics (Months 1-12)
  readonly currentYearIncomeStats = computed<YearlyMonthIncomeStat[]>(() => {
    const paymentsList = this.payments();
    const ledgerList = this.ledger();
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1 to 12

    const monthNamesUa: { name: string; short: string }[] = [
      { name: 'Січень', short: 'Січ' },
      { name: 'Лютий', short: 'Лют' },
      { name: 'Березень', short: 'Бер' },
      { name: 'Квітень', short: 'Кві' },
      { name: 'Травень', short: 'Тра' },
      { name: 'Червень', short: 'Чер' },
      { name: 'Липень', short: 'Лип' },
      { name: 'Серпень', short: 'Сер' },
      { name: 'Вересень', short: 'Вер' },
      { name: 'Жовтень', short: 'Жов' },
      { name: 'Листопад', short: 'Лис' },
      { name: 'Грудень', short: 'Гру' },
    ];

    let runningTotal = 0;
    const result: YearlyMonthIncomeStat[] = [];

    for (let m = 1; m <= 12; m++) {
      const monthStr = String(m).padStart(2, '0');
      const monthKey = `${currentYear}-${monthStr}`;
      const isCurrent = m === currentMonth;
      const isPast = m < currentMonth;
      const isFuture = m > currentMonth;

      let totalIncome = 0;
      let paymentsCount = 0;

      for (const p of paymentsList) {
        if (p.date && p.date.startsWith(monthKey)) {
          totalIncome += Number(p.amount) || 0;
          paymentsCount++;
        }
      }
      for (const item of ledgerList) {
        if (item.isCustom && item.type === 'income' && (Number(item.amountUah) || 0) > 0 && item.date && item.date.startsWith(monthKey)) {
          totalIncome += Number(item.amountUah) || 0;
          paymentsCount++;
        }
      }

      if (isPast || isCurrent) {
        runningTotal += totalIncome;
      }

      const averagePayment = paymentsCount > 0 ? Math.round(totalIncome / paymentsCount) : 0;

      result.push({
        monthIndex: m,
        monthKey,
        monthName: monthNamesUa[m - 1].name,
        monthShort: monthNamesUa[m - 1].short,
        year: currentYear,
        totalIncome,
        paymentsCount,
        averagePayment,
        cumulativeIncome: runningTotal,
        growthPct: null,
        isCurrent,
        isPast,
        isFuture,
      });
    }

    // Calculate growth percentages month-over-month
    for (let i = 1; i < result.length; i++) {
      const prev = result[i - 1].totalIncome;
      const cur = result[i].totalIncome;
      if (prev > 0 && (result[i].isPast || result[i].isCurrent)) {
        result[i].growthPct = Math.round(((cur - prev) / prev) * 1000) / 10;
      } else if (prev === 0 && cur > 0 && (result[i].isPast || result[i].isCurrent)) {
        result[i].growthPct = 100;
      }
    }

    return result;
  });

  readonly currentYearSummary = computed<CurrentYearStatsSummary>(() => {
    const list = this.currentYearIncomeStats();
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    let totalYearIncome = 0;
    let totalYearPaymentsCount = 0;
    let highestMonth: { monthName: string; amount: number } | null = null;
    let currentMonthIncome = 0;

    for (const item of list) {
      if (item.isPast || item.isCurrent) {
        totalYearIncome += item.totalIncome;
        totalYearPaymentsCount += item.paymentsCount;
        if (!highestMonth || item.totalIncome > highestMonth.amount) {
          if (item.totalIncome > 0) {
            highestMonth = { monthName: item.monthName, amount: item.totalIncome };
          }
        }
      }
      if (item.isCurrent) {
        currentMonthIncome = item.totalIncome;
      }
    }

    const elapsedMonths = Math.max(1, currentMonth);
    const averageMonthlyIncome = Math.round(totalYearIncome / elapsedMonths);
    const projectedYearEndIncome = averageMonthlyIncome * 12;

    return {
      year: currentYear,
      totalYearIncome,
      averageMonthlyIncome,
      totalYearPaymentsCount,
      highestMonth,
      currentMonthIncome,
      projectedYearEndIncome,
    };
  });

  constructor() {
    this.initData();
    this.setupAutoSync();
  }

  private setupAutoSync(): void {
    if (typeof window === 'undefined') return;

    // 1. Cross-tab real-time auto-synchronization
    if ('BroadcastChannel' in window) {
      try {
        this.broadcastChannel = new BroadcastChannel('iptv_app_live_sync');
        this.broadcastChannel.onmessage = (event) => {
          if (event.data?.type === 'IPTV_DATA_CHANGED') {
            this.refreshAllData(true);
          }
        };
      } catch (e) {
        console.warn('BroadcastChannel error:', e);
      }
    }

    // 2. Periodic background check every 30 seconds to auto-update on any change
    this.autoSyncInterval = setInterval(async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        await this.checkRemoteVersionAndSync();
      }
    }, 30000);

    // 3. Auto-update whenever the user returns to the tab/window (debounced to avoid rate limit spikes)
    window.addEventListener('focus', () => {
      this.debouncedCheckRemoteVersion();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.debouncedCheckRemoteVersion();
      }
    });
  }

  private debouncedCheckRemoteVersion(): void {
    const now = Date.now();
    if (now - this.lastVersionCheckTime < 15000) return;
    this.lastVersionCheckTime = now;
    this.checkRemoteVersionAndSync();
  }

  private async checkRemoteVersionAndSync(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http.get<{ version: number; lastUpdate: string }>('/api/sync/version')
      );
      if (res && typeof res.version === 'number') {
        if (this.lastKnownVersion === 0) {
          this.lastKnownVersion = res.version;
        } else if (res.version > this.lastKnownVersion) {
          this.lastKnownVersion = res.version;
          await this.refreshAllData(true);
        }
      }
    } catch {
      // background poll errors are silently handled
    }
  }

  broadcastDataChange(): void {
    this.lastAutoSyncTime.set(new Date().toISOString());
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({ type: 'IPTV_DATA_CHANGED', timestamp: Date.now() });
      } catch (e) {
        console.warn('BroadcastChannel postMessage error:', e);
      }
    }
  }

  getAuthHeaders(): { headers: Record<string, string> } {
    const token =
      this.authToken() ||
      (typeof localStorage !== 'undefined' ? localStorage.getItem('homehub_gauth3_token') : null) ||
      (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('homehub_gauth3_token') : null);
    const gAccess =
      this.googleAccessToken() ||
      (typeof localStorage !== 'undefined' ? localStorage.getItem('homehub_google_access_token') : null) ||
      (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('homehub_google_access_token') : null);
    const impersonated = this.impersonatedUser();
    const headers: Record<string, string> = {};
    if (token && token.startsWith('gauth3_')) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (gAccess) {
      headers['x-google-access-token'] = gAccess;
    }
    if (impersonated?.id) {
      headers['x-impersonate-user-id'] = impersonated.id;
    }
    return { headers };
  }

  async switchToTestUser(targetUser?: AppUser): Promise<void> {
    const curr = this.currentUser();
    if (curr && curr.role === 'admin' && !this.realAdminUser()) {
      this.realAdminUser.set(curr);
    }
    if (!this.isRealAdmin()) return;

    if (this.usersList().length === 0) {
      await this.fetchUsers();
    }

    let testTarget =
      targetUser ||
      this.usersList().find((u) => u.id === 'user_test_sandbox' || u.email.toLowerCase() === 'test.user@homehub.local');

    if (!testTarget) {
      testTarget = {
        id: 'user_test_sandbox',
        email: 'test.user@homehub.local',
        name: 'Тестовий Користувач (Перевірка доступу)',
        picture: 'https://ui-avatars.com/api/?name=%D0%A2%D0%B5%D1%81%D1%82&background=6366f1&color=fff',
        role: 'user',
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
        allowedTabs: [...DEFAULT_USER_TABS],
        allowedSettings: this.getUserScopedSettingsSections(),
        assignedUtilityAccountIds: [],
        assignedClientIds: [],
        canManageOwnData: true,
      };
    } else {
      const normalizedTabs =
        !Array.isArray(testTarget.allowedTabs) ||
        testTarget.allowedTabs.length === 0 ||
        (testTarget.allowedTabs.length === 1 && testTarget.allowedTabs[0] === 'electricity')
          ? [...DEFAULT_USER_TABS]
          : testTarget.allowedTabs;
      const scopes = this.systemSettingsConfig().scopesConfig || {};
      testTarget = {
        ...testTarget,
        role: testTarget.role === 'new' ? 'user' : testTarget.role,
        allowedTabs: normalizedTabs,
        allowedSettings: extractAllowedSettingsFromUser(testTarget, scopes),
        canManageOwnData: testTarget.canManageOwnData !== false,
      };
    }

    setActiveImpersonateUid(testTarget.id);
    this.lastUtilityFetchTime = 0;
    this.impersonatedUser.set(testTarget);
    this.currentUser.set(testTarget);
    await this.checkAuth();
    await this.refreshAllData(false);
    this.restartAppRealtimeSignals();
    this.triggerSuccess(`Увімкнено режим перегляду очима користувача: ${this.currentUser()?.name || testTarget.name}`);
  }

  async exitTestUserMode(): Promise<void> {
    const admin = this.realAdminUser();
    this.impersonatedUser.set(null);
    setActiveImpersonateUid(null);
    this.lastUtilityFetchTime = 0;
    if (admin) {
      this.currentUser.set(admin);
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('homehub_gauth3_user', JSON.stringify(admin));
        } catch {
          // ignore
        }
      }
    }
    await this.checkAuth();
    await Promise.all([this.refreshAllData(false), this.fetchUsers(), this.fetchAdminUtilityAccounts()]);
    this.restartAppRealtimeSignals();
    this.triggerSuccess('Ви повернулись у режим Адміністратора з повним доступом');
  }

  async checkAuth(): Promise<AppUser | null> {
    this.isAuthLoading.set(true);
    try {
      if (typeof window !== 'undefined') {
        // Purge any legacy localStorage keys and stale persisted impersonation key
        try {
          localStorage.removeItem('iptv_auth_token');
          localStorage.removeItem('iptv_auth_user');
          if (!this.impersonatedUser()) {
            setActiveImpersonateUid(null);
          }
        } catch {
          // ignore
        }

        if (!this.impersonatedUser()) {
          let savedToken = localStorage.getItem('homehub_gauth3_token');
          if (!savedToken && typeof sessionStorage !== 'undefined') {
            savedToken = sessionStorage.getItem('homehub_gauth3_token');
            if (savedToken && savedToken.startsWith('gauth3_')) {
              localStorage.setItem('homehub_gauth3_token', savedToken);
            }
          }
          const savedUserJson =
            localStorage.getItem('homehub_gauth3_user') ||
            (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('homehub_gauth3_user') : null);

          if (savedToken && savedToken.startsWith('gauth3_')) {
            this.authToken.set(savedToken);
            const savedGoogleAccess =
              localStorage.getItem('homehub_google_access_token') ||
              (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('homehub_google_access_token') : null);
            if (savedGoogleAccess) {
              this.googleAccessToken.set(savedGoogleAccess);
            }
            this.syncAuthTokenWithServiceWorker(savedToken);
            if (!this.currentUser() && savedUserJson) {
              try {
                const parsedUser = JSON.parse(savedUserJson) as AppUser;
                if (parsedUser && parsedUser.id && parsedUser.email) {
                  this.currentUser.set(parsedUser);
                  if (parsedUser.role === 'admin') {
                    this.realAdminUser.set(parsedUser);
                  }
                }
              } catch {
                // ignore invalid JSON
              }
            }
          } else {
            this.authToken.set(null);
            this.googleAccessToken.set(null);
            this.currentUser.set(null);
            this.realAdminUser.set(null);
          }
        }
      }

      const res = await firstValueFrom(
        this.http.get<{
          authenticated: boolean;
          user: AppUser | null;
          realAdminUser?: AppUser | null;
          googleClientId: string;
          firebaseConfig?: Partial<FirebaseAppletConfig>;
          totalUsersCount: number;
          appReleaseInfo?: {
            currentVersion: string;
            previousVersion: string;
            userLastSeenVersion: string;
            dismissedVersion: string;
            shouldShowModal: boolean;
            updatedAt?: string;
            updatedAtKyiv?: string;
            versionTimestamps?: Record<string, string>;
          };
        }>('/api/auth/me', this.getAuthHeaders())
      );

      if (res.firebaseConfig) {
        setFirebaseAppletConfig(res.firebaseConfig);
      }

      if (res.googleClientId) {
        this.googleClientId.set(res.googleClientId);
      }

      if (res.realAdminUser) {
        this.realAdminUser.set(res.realAdminUser);
      }

      if (res.appReleaseInfo) {
        this.appReleaseInfo.set(res.appReleaseInfo);
        if (res.appReleaseInfo.shouldShowModal) {
          this.isUpdateModalOpen.set(true);
        }
      }

      if (res.authenticated && res.user) {
        const isServerImpersonating = Boolean(res.realAdminUser && res.user.id !== res.realAdminUser.id);
        this.currentUser.set(res.user);
        if (isServerImpersonating) {
          this.impersonatedUser.set(res.user);
        } else if (this.impersonatedUser() && res.user.id === this.impersonatedUser()?.id) {
          this.impersonatedUser.set(res.user);
        } else if (typeof localStorage !== 'undefined' && !this.impersonatedUser()) {
          if (res.user.id !== 'user_test_sandbox') {
            try {
              localStorage.setItem('homehub_gauth3_user', JSON.stringify(res.user));
            } catch {
              // ignore
            }
          }
          if (res.user.role === 'admin') {
            this.realAdminUser.set(res.user);
          }
        }
        if (res.user.role === 'admin' || res.realAdminUser?.role === 'admin') {
          await Promise.all([this.fetchUsers(), this.fetchAdminUtilityAccounts()]);
        }
        return res.user;
      } else {
        this.currentUser.set(null);
        this.realAdminUser.set(null);
        this.impersonatedUser.set(null);
        setActiveImpersonateUid(null);
        this.authToken.set(null);
        this.syncAuthTokenWithServiceWorker(null);
        if (typeof window !== 'undefined') {
          try {
            localStorage.removeItem('homehub_gauth3_token');
            localStorage.removeItem('homehub_gauth3_user');
            sessionStorage.removeItem('homehub_gauth3_token');
            sessionStorage.removeItem('homehub_gauth3_user');
            sessionStorage.removeItem('homehub_impersonate_uid');
            localStorage.removeItem('iptv_auth_token');
            localStorage.removeItem('iptv_auth_user');
          } catch {
            // ignore
          }
        }
        return null;
      }
    } catch (err) {
      console.warn('Auth check error:', err);
      return this.currentUser();
    } finally {
      this.isAuthLoading.set(false);
    }
  }

  readonly appReleaseInfo = signal<{
    currentVersion: string;
    previousVersion: string;
    userLastSeenVersion: string;
    dismissedVersion: string;
    shouldShowModal: boolean;
    updatedAt?: string;
    updatedAtKyiv?: string;
    versionTimestamps?: Record<string, string>;
  }>({
    currentVersion: 'v6.0',
    previousVersion: 'v5.1',
    userLastSeenVersion: 'v5.1',
    dismissedVersion: '',
    shouldShowModal: false,
    updatedAt: '',
    updatedAtKyiv: '',
    versionTimestamps: {},
  });

  readonly isUpdateModalOpen = signal<boolean>(false);
  readonly isDismissingUpdate = signal<boolean>(false);

  openUpdateModal(): void {
    this.isUpdateModalOpen.set(true);
  }

  closeUpdateModal(): void {
    this.isUpdateModalOpen.set(false);
  }

  async dismissAppReleaseForUser(version = 'v6.0'): Promise<void> {
    this.isDismissingUpdate.set(true);
    try {
      const res = await firstValueFrom(
        this.http.post<{
          success: boolean;
          appReleaseInfo?: {
            currentVersion: string;
            previousVersion: string;
            userLastSeenVersion: string;
            dismissedVersion: string;
            shouldShowModal: boolean;
            updatedAt?: string;
            updatedAtKyiv?: string;
            versionTimestamps?: Record<string, string>;
          };
          message?: string;
        }>('/api/app-release/dismiss', { version }, this.getAuthHeaders())
      );
      if (res.appReleaseInfo) {
        this.appReleaseInfo.set(res.appReleaseInfo);
      } else {
        this.appReleaseInfo.update((prev) => ({
          ...prev,
          userLastSeenVersion: version,
          dismissedVersion: version,
          shouldShowModal: false,
        }));
      }
      this.isUpdateModalOpen.set(false);
      this.triggerSuccess(
        res.message || `Оновлення ${version} відмічено як переглянуте. Більше не показуватиметься.`
      );
    } catch (err: unknown) {
      const httpErr = err as { error?: { error?: string }; message?: string };
      const msg = httpErr?.error?.error || httpErr?.message || 'Не вдалося зберегти налаштування оновлення у БД';
      this.triggerError(msg);
    } finally {
      this.isDismissingUpdate.set(false);
    }
  }

  async signInWithGooglePopup(): Promise<AppUser | null> {
    if (typeof window === 'undefined') {
      return null;
    }
    this.isLoading.set(true);
    try {
      const popupRes = await triggerFirebaseGooglePopup();
      if (!popupRes) {
        return null;
      }
      return await this.loginWithGoogle(popupRes);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        this.triggerError('Вікно входу Google було закрито. Натисніть «Увійти з Google акаунтом» ще раз.');
      } else if (code === 'auth/popup-blocked') {
        this.triggerError('Браузер заблокував спливаюче вікно Google. Дозвольте спливаючі вікна для цього сайту.');
      } else {
        const msg = err instanceof Error ? err.message : 'Помилка відкриття вікна Google авторизації';
        this.triggerError(msg);
      }
      return null;
    } finally {
      this.isLoading.set(false);
    }
  }

  async loginWithGoogle(payload: {
    idToken?: string;
    credential?: string;
    accessToken?: string;
    email?: string;
    name?: string;
    picture?: string;
    sub?: string;
  }): Promise<AppUser | null> {
    this.isLoading.set(true);
    try {
      const res = await firstValueFrom(
        this.http.post<{
          success: boolean;
          user: AppUser;
          token: string;
          message: string;
          appReleaseInfo?: {
            currentVersion: string;
            previousVersion: string;
            userLastSeenVersion: string;
            dismissedVersion: string;
            shouldShowModal: boolean;
            updatedAt?: string;
            updatedAtKyiv?: string;
            versionTimestamps?: Record<string, string>;
          };
        }>('/api/auth/google', payload)
      );

      if (res.appReleaseInfo) {
        this.appReleaseInfo.set(res.appReleaseInfo);
        if (res.appReleaseInfo.shouldShowModal) {
          this.isUpdateModalOpen.set(true);
        }
      }

      if (res.success && res.user) {
        this.impersonatedUser.set(null);
        this.currentUser.set(res.user);
        if (res.user.role === 'admin') {
          this.realAdminUser.set(res.user);
        } else {
          this.realAdminUser.set(null);
        }
        this.authToken.set(res.token);
        if (payload.accessToken) {
          this.googleAccessToken.set(payload.accessToken);
        }
        this.syncAuthTokenWithServiceWorker(res.token);
        if (typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem('homehub_gauth3_token', res.token);
            localStorage.setItem('homehub_gauth3_user', JSON.stringify(res.user));
            if (payload.accessToken) {
              localStorage.setItem('homehub_google_access_token', payload.accessToken);
            }
          } catch {
            // ignore
          }
        }
        if (typeof sessionStorage !== 'undefined') {
          try {
            sessionStorage.removeItem('homehub_impersonate_uid');
            sessionStorage.setItem('homehub_gauth3_token', res.token);
            sessionStorage.setItem('homehub_gauth3_user', JSON.stringify(res.user));
            if (payload.accessToken) {
              sessionStorage.setItem('homehub_google_access_token', payload.accessToken);
            }
          } catch {
            // ignore
          }
        }
        this.triggerSuccess(res.message || 'Успішний вхід через Google');
        if (res.user.role === 'admin') {
          await Promise.all([this.fetchUsers(), this.fetchAdminUtilityAccounts()]);
        }
        await this.refreshAllData(true);
        this.startAppRealtimeSignals();
        return res.user;
      }
      return null;
    } catch (err: unknown) {
      const httpErr = err as { error?: { error?: string }; message?: string };
      const msg = httpErr?.error?.error || httpErr?.message || 'Помилка авторизації через Google';
      this.triggerError(msg);
      return null;
    } finally {
      this.isLoading.set(false);
    }
  }

  async logout(): Promise<void> {
    if (this.isImpersonating()) {
      await this.exitTestUserMode();
      return;
    }
    await triggerFirebaseSignOut();
    try {
      await firstValueFrom(this.http.post('/api/auth/logout', {}, this.getAuthHeaders()));
    } catch (e) {
      console.debug('Logout request error:', e);
    }
    this.currentUser.set(null);
    this.realAdminUser.set(null);
    this.impersonatedUser.set(null);
    setActiveImpersonateUid(null);
    this.lastUtilityFetchTime = 0;
    this.authToken.set(null);
    this.googleAccessToken.set(null);
    this.syncAuthTokenWithServiceWorker(null);
    this.stopAppRealtimeSignals();
    this.shoppingLists.set([]);
    this.shoppingCustomCatalog.set([]);
    this.shoppingPeople.set([]);
    this.clients.set([]);
    this.payments.set([]);
    this.accounts.set([]);
    this.utilityAccounts.set([]);
    this.utilityReadings.set([]);
    this.selectedDtekAccountId.set('');
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('homehub_gauth3_token');
        localStorage.removeItem('homehub_gauth3_user');
        localStorage.removeItem('homehub_google_access_token');
        sessionStorage.removeItem('homehub_gauth3_token');
        sessionStorage.removeItem('homehub_gauth3_user');
        sessionStorage.removeItem('homehub_google_access_token');
        sessionStorage.removeItem('homehub_impersonate_uid');
        localStorage.removeItem('iptv_auth_token');
        localStorage.removeItem('iptv_auth_user');
      } catch {
        // ignore
      }
    }
    this.triggerSuccess('Ви вийшли з облікового запису');
  }

  private syncAuthTokenWithServiceWorker(token: string | null): void {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }
    const payload = token ? { type: 'SET_AUTH_TOKEN', token } : { type: 'CLEAR_AUTH_TOKEN' };
    try {
      navigator.serviceWorker.controller?.postMessage(payload);
      void navigator.serviceWorker.ready
        .then((reg) => {
          reg.active?.postMessage(payload);
        })
        .catch(() => {});
    } catch {
      // Ignore SW messaging errors
    }
  }

  async fetchUsers(): Promise<void> {
    if (!this.isRealAdmin()) return;
    try {
      const [usersData] = await Promise.all([
        firstValueFrom(this.http.get<AppUser[]>('/api/users', this.getAuthHeaders())),
        this.fetchAdminUtilityAccounts(),
      ]);
      if (Array.isArray(usersData)) {
        this.usersList.set(usersData);
      }
    } catch (err) {
      console.warn('Error fetching users:', err);
    }
  }

  async fetchAdminUtilityAccounts(): Promise<void> {
    if (!this.isRealAdmin()) return;
    try {
      const data = await firstValueFrom(this.http.get<UtilityAccount[]>('/api/admin/utility-accounts', this.getAuthHeaders()));
      if (Array.isArray(data)) {
        this.adminUtilityAccounts.set(data);
      }
    } catch (err) {
      console.warn('Error fetching admin utility accounts:', err);
    }
  }

  async updateUserRole(userId: string, role: UserRole): Promise<boolean> {
    this.isLoading.set(true);
    try {
      const updated = await firstValueFrom(this.http.put<AppUser>(`/api/users/${userId}/role`, { role }, this.getAuthHeaders()));
      this.usersList.update((list) => list.map((u) => (u.id === userId ? { ...u, ...updated } : u)));
      if (this.impersonatedUser()?.id === userId) {
        const merged = { ...this.impersonatedUser()!, ...updated };
        this.impersonatedUser.set(merged);
        this.currentUser.set(merged);
        if (role !== 'new') {
          await this.refreshAllData(true);
        }
      }
      const roleName = role === 'admin' ? 'Адміністратор (Повний доступ)' : (role === 'user' ? 'Користувач' : 'Новий (Без доступу)');
      this.triggerSuccess(`Права користувача змінено: ${roleName}`);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Помилка зміни прав';
      this.triggerError(msg);
      return false;
    } finally {
      this.isLoading.set(false);
    }
  }

  async toggleUserAccessStatus(userId: string, status: UserAccountStatus): Promise<boolean> {
    const previousUsers = this.usersList();
    this.usersList.update((list) =>
      list.map((u) => {
        if (u.id !== userId) return u;
        return {
          ...u,
          status,
          role: status === 'active' && u.role === 'new' ? 'user' : u.role,
        };
      })
    );

    try {
      const res = await firstValueFrom(
        this.http.put<{ success?: boolean; user?: AppUser }>(
          `/api/users/${userId}/status`,
          { status },
          this.getAuthHeaders()
        )
      );
      const updatedUser: Partial<AppUser> = res?.user || { status };
      this.usersList.update((list) =>
        list.map((u) => (u.id === userId ? { ...u, ...updatedUser } : u))
      );
      if (this.impersonatedUser()?.id === userId) {
        const merged = { ...this.impersonatedUser()!, ...updatedUser };
        this.impersonatedUser.set(merged);
        this.currentUser.set(merged);
      }
      this.triggerSuccess(
        status === 'active'
          ? 'Доступ до застосунку увімкнено (Користувач активний)!'
          : 'Доступ користувача до застосунку миттєво заблоковано!'
      );
      return true;
    } catch (err: unknown) {
      this.usersList.set(previousUsers);
      const msg = err instanceof Error ? err.message : 'Помилка зміни стану доступу користувача';
      this.triggerError(msg);
      return false;
    }
  }

  async updateUserPermissions(
    userId: string,
    payload: {
      role?: UserRole;
      status?: UserAccountStatus;
      name?: string;
      allowedTabs?: AppTabId[];
      allowedSettings?: SettingsSectionId[];
      assignedUtilityAccountIds?: string[];
      assignedClientIds?: string[];
      canManageOwnData?: boolean;
      householdAccessLevel?: HouseholdAccessLevel;
      memberTags?: MemberRelationTag[];
    }
  ): Promise<boolean> {
    const previousUsers = this.usersList();
    // Immediate optimistic update so tab/house toggle highlight updates instantaneously
    this.usersList.update((list) =>
      list.map((u) => {
        if (u.id !== userId) return u;
        return {
          ...u,
          ...(payload.role !== undefined ? { role: payload.role } : {}),
          ...(payload.status !== undefined ? { status: payload.status } : {}),
          ...(payload.name !== undefined ? { name: payload.name } : {}),
          ...(payload.allowedTabs !== undefined ? { allowedTabs: [...payload.allowedTabs] } : {}),
          ...(payload.allowedSettings !== undefined
            ? { allowedSettings: [...payload.allowedSettings] }
            : {}),
          ...(payload.assignedUtilityAccountIds !== undefined
            ? { assignedUtilityAccountIds: [...payload.assignedUtilityAccountIds] }
            : {}),
          ...(payload.assignedClientIds !== undefined
            ? { assignedClientIds: [...payload.assignedClientIds] }
            : {}),
          ...(payload.canManageOwnData !== undefined
            ? { canManageOwnData: payload.canManageOwnData }
            : {}),
          ...(payload.householdAccessLevel !== undefined
            ? {
                householdAccessLevel: payload.householdAccessLevel,
                canManageOwnData: payload.householdAccessLevel === 'full',
              }
            : {}),
          ...(payload.memberTags !== undefined ? { memberTags: [...payload.memberTags] } : {}),
        };
      })
    );

    try {
      const res = await firstValueFrom(
        this.http.put<AppUser | { success?: boolean; user?: AppUser; message?: string }>(
          `/api/users/${userId}/permissions`,
          payload,
          this.getAuthHeaders()
        )
      );
      const updatedUser: Partial<AppUser> =
        res && typeof res === 'object' && 'user' in res && res.user
          ? res.user
          : (res as AppUser);

      this.usersList.update((list) =>
        list.map((u) => (u.id === userId ? { ...u, ...updatedUser } : u))
      );
      if (this.impersonatedUser()?.id === userId) {
        const merged = { ...this.impersonatedUser()!, ...updatedUser };
        this.impersonatedUser.set(merged);
        this.currentUser.set(merged);
      } else {
        const curr = this.currentUser();
        if (curr && curr.id === userId) {
          this.currentUser.set({ ...curr, ...updatedUser });
          if (typeof localStorage !== 'undefined') {
            try {
              localStorage.setItem('homehub_gauth3_user', JSON.stringify(this.currentUser()));
            } catch {
              // ignore
            }
          }
          if (typeof sessionStorage !== 'undefined') {
            try {
              sessionStorage.setItem('homehub_gauth3_user', JSON.stringify(this.currentUser()));
            } catch {
              // ignore
            }
          }
        }
      }
      this.triggerSuccess('Права доступу, вкладки та привʼязані будинки оновлено!');
      void Promise.all([
        this.fetchAdminUtilityAccounts(),
        this.fetchUtilityData(),
        this.fetchClients(true),
        this.fetchPayments(true),
        this.fetchAccounts(true),
        this.fetchBudget(true),
        this.fetchStats(true),
      ]);
      return true;
    } catch (err: unknown) {
      // Revert optimistic update on error
      this.usersList.set(previousUsers);
      const httpErr = err as { error?: { error?: string }; message?: string };
      const msg = httpErr?.error?.error || httpErr?.message || 'Помилка оновлення прав доступу';
      this.triggerError(msg);
      return false;
    }
  }

  async addUser(email: string, name?: string, role: UserRole = 'user'): Promise<AppUser | null> {
    this.isLoading.set(true);
    try {
      const newUser = await firstValueFrom(this.http.post<AppUser>('/api/users', { email, name, role }, this.getAuthHeaders()));
      this.usersList.update((list) => {
        const idx = list.findIndex((u) => u.id === newUser.id || u.email.toLowerCase() === newUser.email.toLowerCase());
        if (idx >= 0) {
          const copy = [...list];
          copy[idx] = newUser;
          return copy;
        }
        return [newUser, ...list];
      });
      this.triggerSuccess(`Користувача ${email} успішно додано!`);
      return newUser;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Помилка додавання користувача';
      this.triggerError(msg);
      return null;
    } finally {
      this.isLoading.set(false);
    }
  }

  async deleteUser(userId: string): Promise<boolean> {
    this.isLoading.set(true);
    try {
      await firstValueFrom(this.http.delete(`/api/users/${userId}`, this.getAuthHeaders()));
      this.usersList.update((list) => list.filter((u) => u.id !== userId));
      this.triggerSuccess('Користувача видалено');
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Помилка видалення користувача';
      this.triggerError(msg);
      return false;
    } finally {
      this.isLoading.set(false);
    }
  }

  // ============================================================================
  // SHARED HOUSEHOLD & BUDGET INVITE LINKS + QR CODES (https://homehub3.ai.studio/)
  // ============================================================================
  readonly publicAppBaseUrl = 'https://homehub3.ai.studio/';
  readonly memberRelationTagsCatalog = MEMBER_RELATION_TAGS;
  readonly householdInvites = signal<HouseholdInvite[]>([]);
  readonly sharedHouseholdMembers = signal<AppUser[]>([]);
  readonly pendingInvitePreview = signal<HouseholdInvite | null>(null);
  readonly isSharedHouseholdModalOpen = signal<boolean>(false);
  readonly isCreatingInvite = signal<boolean>(false);
  readonly isAcceptingInvite = signal<boolean>(false);

  // Instant QR Code & User Type state for "Приєднатись за кодом" window
  readonly qrInviteCode = signal<string>('');
  readonly qrInviteUserType = signal<MemberRelationTag>('family');
  readonly qrInviteAccessLevel = signal<HouseholdAccessLevel>('view_only');
  readonly qrInviteIncludeBudget = signal<boolean>(true);
  readonly qrInviteDataUrl = signal<string>('');
  readonly cleanAppQrDataUrl = signal<string>('');
  readonly isGeneratingQrInvite = signal<boolean>(false);

  readonly qrInviteFullUrl = computed<string>(() => {
    const code = this.qrInviteCode();
    return code ? this.buildInviteUrl(code) : this.publicAppBaseUrl;
  });

  openSharedHouseholdModal(): void {
    this.isSharedHouseholdModalOpen.set(true);
    void this.initQrInviteModalState();
    void this.fetchUtilityData(false);
    void this.loadShoppingData(true);
  }

  closeSharedHouseholdModal(): void {
    this.isSharedHouseholdModalOpen.set(false);
  }

  async renderUrlToQrDataUrl(url: string): Promise<string> {
    if (typeof window === 'undefined' || !url) return '';
    try {
      return await QRCode.toDataURL(url, {
        width: 280,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      });
    } catch {
      return '';
    }
  }

  async initQrInviteModalState(): Promise<void> {
    // 1. Always generate QR for clean app link https://homehub3.ai.studio/
    if (!this.cleanAppQrDataUrl()) {
      const cleanQr = await this.renderUrlToQrDataUrl(this.publicAppBaseUrl);
      this.cleanAppQrDataUrl.set(cleanQr);
    }

    // 2. Fetch existing invites; if an active invite owned by current user exists, use it, otherwise create a fresh unique code
    await this.fetchHouseholdInvites();
    const myInvites = this.householdInvites();
    if (myInvites.length > 0 && myInvites[0]?.code) {
      const latest = myInvites[0];
      this.qrInviteCode.set(latest.code);
      if (Array.isArray(latest.memberTags) && latest.memberTags.length > 0) {
        this.qrInviteUserType.set(latest.memberTags[0]);
      }
      if (latest.accessLevel === 'full' || latest.accessLevel === 'view_only') {
        this.qrInviteAccessLevel.set(latest.accessLevel);
      }
      this.qrInviteIncludeBudget.set(latest.includeSharedBudget !== false);
      const qr = await this.renderUrlToQrDataUrl(this.buildInviteUrl(latest.code));
      this.qrInviteDataUrl.set(qr);
    } else {
      await this.generateFreshQrInvite(true);
    }
  }

  async generateFreshQrInvite(silent = false): Promise<HouseholdInvite | null> {
    this.isGeneratingQrInvite.set(true);
    try {
      const allIds = this.utilityAccounts().map((a) => a.id);
      const inv = await this.createHouseholdInvite(
        {
          houseIds: allIds,
          accessLevel: this.qrInviteAccessLevel(),
          includeSharedBudget: this.qrInviteIncludeBudget(),
          memberTags: [this.qrInviteUserType()],
        },
        silent
      );
      if (inv?.code) {
        this.qrInviteCode.set(inv.code);
        const qr = await this.renderUrlToQrDataUrl(this.buildInviteUrl(inv.code));
        this.qrInviteDataUrl.set(qr);
      }
      return inv;
    } finally {
      this.isGeneratingQrInvite.set(false);
    }
  }

  async updateQrInviteOptions(patch: {
    userType?: MemberRelationTag;
    accessLevel?: HouseholdAccessLevel;
    includeSharedBudget?: boolean;
  }): Promise<void> {
    if (patch.userType) {
      this.qrInviteUserType.set(patch.userType);
    }
    if (patch.accessLevel) {
      this.qrInviteAccessLevel.set(patch.accessLevel);
    }
    if (patch.includeSharedBudget !== undefined) {
      this.qrInviteIncludeBudget.set(patch.includeSharedBudget);
    }

    const code = this.qrInviteCode();
    if (!code) {
      await this.generateFreshQrInvite(true);
      return;
    }

    try {
      const res = await firstValueFrom(
        this.http.put<{ success: boolean; invite: HouseholdInvite }>(
          `/api/household/invites/${encodeURIComponent(code)}`,
          {
            memberTags: [this.qrInviteUserType()],
            accessLevel: this.qrInviteAccessLevel(),
            includeSharedBudget: this.qrInviteIncludeBudget(),
          },
          this.getAuthHeaders()
        )
      );
      if (res?.invite) {
        this.householdInvites.update((list) =>
          list.map((item) => (item.code === code ? res.invite : item))
        );
      }
    } catch {
      // Fallback: generate a new invite if code was not found
      await this.generateFreshQrInvite(true);
    }
  }

  async fetchHouseholdInvites(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http.get<{ invites: HouseholdInvite[]; sharedMembers: AppUser[] }>(
          '/api/household/invites',
          this.getAuthHeaders()
        )
      );
      this.householdInvites.set(Array.isArray(res?.invites) ? res.invites : []);
      this.sharedHouseholdMembers.set(Array.isArray(res?.sharedMembers) ? res.sharedMembers : []);
    } catch {
      // ignore
    }
  }

  async updateSharedMemberHouses(memberId: string, houseIds: string[]): Promise<boolean> {
    try {
      const res = await firstValueFrom(
        this.http.put<{ success: boolean; assignedUtilityAccountIds?: string[] }>(
          `/api/household/members/${encodeURIComponent(memberId)}/houses`,
          { houseIds },
          this.getAuthHeaders()
        )
      );
      if (res?.success) {
        const nextAssigned = Array.isArray(res.assignedUtilityAccountIds)
          ? res.assignedUtilityAccountIds
          : houseIds;
        this.sharedHouseholdMembers.update((list) =>
          list.map((m) =>
            m.id === memberId ? { ...m, assignedUtilityAccountIds: nextAssigned } : m
          )
        );
        await Promise.all([
          this.fetchUtilityData(true),
          this.fetchHouseholdInvites(),
          this.loadShoppingData(true),
        ]);
        this.triggerSuccess('Доступ учасника до будинків оновлено');
        return true;
      }
      return false;
    } catch (err: unknown) {
      const httpErr = err as { error?: { error?: string }; message?: string };
      this.triggerError(
        httpErr?.error?.error || httpErr?.message || 'Не вдалося оновити доступ до будинків'
      );
      return false;
    }
  }

  async createHouseholdInvite(
    payload: {
      houseIds: string[];
      accessLevel: HouseholdAccessLevel;
      includeSharedBudget: boolean;
      memberTags: MemberRelationTag[];
      label?: string;
    },
    silent = false
  ): Promise<HouseholdInvite | null> {
    this.isCreatingInvite.set(true);
    try {
      const res = await firstValueFrom(
        this.http.post<{ success: boolean; invite: HouseholdInvite }>(
          '/api/household/invites',
          payload,
          this.getAuthHeaders()
        )
      );
      if (res?.invite) {
        this.householdInvites.update((list) => [res.invite, ...list]);
        this.qrInviteCode.set(res.invite.code);
        void this.renderUrlToQrDataUrl(this.buildInviteUrl(res.invite.code)).then((qr) => {
          if (qr) this.qrInviteDataUrl.set(qr);
        });
        if (!silent) {
          this.triggerSuccess('Invite-посилання та QR-код для спільного дому та бюджету створено!');
        }
        return res.invite;
      }
      return null;
    } catch (err: unknown) {
      if (!silent) {
        const httpErr = err as { error?: { error?: string }; message?: string };
        this.triggerError(httpErr?.error?.error || httpErr?.message || 'Помилка створення Invite-посилання');
      }
      return null;
    } finally {
      this.isCreatingInvite.set(false);
    }
  }

  async deleteHouseholdInvite(inviteId: string): Promise<boolean> {
    try {
      await firstValueFrom(
        this.http.delete(`/api/household/invites/${inviteId}`, this.getAuthHeaders())
      );
      this.householdInvites.update((list) =>
        list.filter((i) => i.id !== inviteId && i.code !== inviteId)
      );
      this.triggerSuccess('Запрошення видалено');
      return true;
    } catch {
      this.triggerError('Не вдалося видалити запрошення');
      return false;
    }
  }

  async fetchInvitePreview(rawCodeOrUrl: string): Promise<HouseholdInvite | null> {
    const cleaned = this.extractInviteCode(rawCodeOrUrl);
    if (!cleaned) return null;
    try {
      const res = await firstValueFrom(
        this.http.get<{ success: boolean; invite: HouseholdInvite }>(
          `/api/household/invites/${encodeURIComponent(cleaned)}`,
          this.getAuthHeaders()
        )
      );
      if (res?.invite) {
        this.pendingInvitePreview.set(res.invite);
        return res.invite;
      }
      return null;
    } catch (err: unknown) {
      const httpErr = err as { error?: { error?: string }; message?: string };
      this.triggerError(httpErr?.error?.error || 'Запрошення не знайдено або вже недійсне');
      return null;
    }
  }

  async acceptHouseholdInvite(rawCodeOrUrl: string): Promise<boolean> {
    const cleaned = this.extractInviteCode(rawCodeOrUrl);
    if (!cleaned) return false;
    this.isAcceptingInvite.set(true);
    try {
      const res = await firstValueFrom(
        this.http.post<{ success: boolean; user: AppUser; invite: HouseholdInvite }>(
          `/api/household/invites/${encodeURIComponent(cleaned)}/accept`,
          {},
          this.getAuthHeaders()
        )
      );
      if (res?.user) {
        this.currentUser.set({ ...this.currentUser()!, ...res.user });
        this.pendingInvitePreview.set(null);
        await Promise.all([
          this.fetchUtilityData(),
          this.fetchBudget(),
          this.fetchUsers(),
          this.fetchHouseholdInvites(),
        ]);
        this.triggerSuccess(
          `Ви успішно приєдналися до спільного дому (${res.invite?.houseNames?.join(', ') || 'Будинок'})!`
        );
        return true;
      }
      return false;
    } catch (err: unknown) {
      const httpErr = err as { error?: { error?: string }; message?: string };
      this.triggerError(httpErr?.error?.error || 'Не вдалося прийняти запрошення');
      return false;
    } finally {
      this.isAcceptingInvite.set(false);
    }
  }

  extractInviteCode(raw: string): string {
    const trimmed = (raw || '').trim();
    if (!trimmed) return '';
    try {
      if (trimmed.includes('invite=')) {
        const match = trimmed.match(/[?&]invite=([^&#]+)/);
        if (match?.[1]) return decodeURIComponent(match[1]);
      }
    } catch {
      // ignore
    }
    return trimmed;
  }

  buildInviteUrl(code: string): string {
    return `${this.publicAppBaseUrl}?invite=${encodeURIComponent(code)}`;
  }

  getCleanAppShareUrl(): string {
    return this.publicAppBaseUrl;
  }

  // ============================================================================
  // IN-APP SCHEDULE CHANGE ALERT ON APP ENTRY (TRACKED BY EXACT SCHEDULE SIGNATURE)
  // ============================================================================
  readonly isPushSupported = signal<boolean>(false);
  readonly isPushSubscribed = signal<boolean>(false);
  readonly isPushLoading = signal<boolean>(false);
  readonly pushStatusMessage = signal<string>('');
  readonly pushMonitoredQueue = signal<string>('GPV4.1');
  readonly pushCountdownSeconds = signal<number>(0);
  readonly notificationPermission = signal<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  readonly recentScheduleChanges = signal<ScheduleChangeLogEntry[]>([]);
  readonly isLoadingScheduleChangesHistory = signal<boolean>(false);
  readonly inAppScheduleChangeAlert = signal<{
    alertKind: 'schedule' | 'emergency' | 'both';
    isNewDay?: boolean;
    isHistoryView?: boolean;
    queueKey: string;
    queueDisplay: string;
    houseName: string;
    addressKey: string;
    addressLabel: string;
    scheduleDate: string;
    previousTodayIntervals: string[];
    newTodayIntervals: string[];
    tomorrowDate: string;
    previousTomorrowIntervals: string[];
    newTomorrowIntervals: string[];
    totalPowerHours: number;
    totalOutageHours: number;
    updatedAt: string;
    signature: string;
    emergencyOutage: DtekEmergencyOutageInfo | null;
  } | null>(null);

  normalizeQueueKey(raw?: string | null): string {
    const clean = String(raw || '')
      .replace(/^Черга\s+/i, '')
      .trim()
      .toUpperCase();
    if (!clean) return '';
    return clean.startsWith('GPV') ? clean : `GPV${clean}`;
  }

  getKyivDateDDMMYYYY(input?: Date | string | number): string {
    try {
      const dt =
        input instanceof Date
          ? input
          : typeof input === 'number'
            ? new Date(input)
            : input
              ? new Date(input)
              : new Date();
      if (isNaN(dt.getTime())) return '';
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Kyiv',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(dt);
      const get = (type: string) => parts.find((p) => p.type === type)?.value || '00';
      return `${get('day')}.${get('month')}.${get('year')}`;
    } catch {
      return '';
    }
  }

  getKyivTimeHHMM(input?: Date | string | number): string {
    try {
      const dt =
        input instanceof Date
          ? input
          : typeof input === 'number'
            ? new Date(input)
            : input
              ? new Date(input)
              : new Date();
      if (isNaN(dt.getTime())) return '';
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Kyiv',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(dt);
      const get = (type: string) => parts.find((p) => p.type === type)?.value || '00';
      return `${get('hour')}:${get('minute')}`;
    } catch {
      return '';
    }
  }

  getTodayScheduleChangesForQueue(
    queueGroup?: string | null,
    scheduleDateHint?: string | null
  ): ScheduleChangeLogEntry[] {
    const targetQueue = this.normalizeQueueKey(queueGroup);
    const todayKyiv = this.getKyivDateDDMMYYYY(new Date());
    const hintDate = String(scheduleDateHint || '').trim();
    const list = this.recentScheduleChanges();
    const filtered = list.filter((entry) => {
      if (targetQueue) {
        const entryQueue = this.normalizeQueueKey(entry.queueKey);
        if (entryQueue && entryQueue !== targetQueue) return false;
      }
      const detectedKyivDate =
        entry.detectedAtKyiv?.trim().split(' ')[0] || this.getKyivDateDDMMYYYY(entry.detectedAt);
      if (todayKyiv && detectedKyivDate) {
        return detectedKyivDate === todayKyiv;
      }
      if (hintDate && entry.scheduleDate) {
        return entry.scheduleDate === hintDate;
      }
      return true;
    });
    return [...filtered].sort((a, b) => {
      const ta = Date.parse(a.detectedAt) || 0;
      const tb = Date.parse(b.detectedAt) || 0;
      return tb - ta;
    });
  }

  readonly activeAlertTodayChangesHistory = computed<ScheduleChangeLogEntry[]>(() => {
    const alert = this.inAppScheduleChangeAlert();
    if (!alert) return [];
    const serverEntries = this.getTodayScheduleChangesForQueue(alert.queueKey, alert.scheduleDate);
    if (alert.isHistoryView) {
      return serverEntries;
    }

    const normSlots = (arr?: string[]) =>
      (arr || [])
        .map((s) => s.replace(/\s+/g, '').replace(/–|—/g, '-'))
        .join(',');

    if (alert.alertKind === 'emergency' && alert.emergencyOutage) {
      const hasEmergencyToday = serverEntries.some(
        (e) =>
          e.changeType === 'emergency_outage' &&
          (!alert.emergencyOutage?.reason || e.emergencyReason === alert.emergencyOutage.reason)
      );
      if (hasEmergencyToday) return serverEntries;
      const nowIso = new Date().toISOString();
      const synthetic: ScheduleChangeLogEntry = {
        id: `local_emg_${alert.signature}`,
        queueKey: alert.queueKey,
        queueTitle: alert.queueDisplay,
        detectedAt: nowIso,
        detectedAtKyiv: `${this.getKyivDateDDMMYYYY(nowIso)} ${this.getKyivTimeHHMM(nowIso)}`,
        scheduleDate: alert.scheduleDate || this.getKyivDateDDMMYYYY(nowIso),
        changeType: 'emergency_outage',
        title: alert.emergencyOutage.isActiveNow
          ? 'Аварійне відключення світла'
          : 'Заплановані ремонтні роботи',
        body: alert.emergencyOutage.reason,
        addressLabel: alert.addressLabel || alert.houseName,
        emergencyReason: alert.emergencyOutage.reason,
        emergencyStartDate: alert.emergencyOutage.startDate,
        emergencyEndDate: alert.emergencyOutage.endDate,
        oldIntervals: [],
        newIntervals: [],
      };
      return [synthetic, ...serverEntries];
    }

    const latestScheduleEntry = serverEntries.find(
      (e) => e.changeType !== 'emergency_outage' && e.changeType !== 'tomorrow_appeared' && e.changeType !== 'tomorrow_changed'
    );
    const alreadyLogged =
      latestScheduleEntry &&
      normSlots(latestScheduleEntry.newIntervals) === normSlots(alert.newTodayIntervals);

    if (alreadyLogged) {
      return serverEntries;
    }

    const nowIso = new Date().toISOString();
    const synthetic: ScheduleChangeLogEntry = {
      id: `local_chg_${alert.signature}`,
      queueKey: alert.queueKey,
      queueTitle: alert.queueDisplay,
      detectedAt: nowIso,
      detectedAtKyiv: `${this.getKyivDateDDMMYYYY(nowIso)} ${this.getKyivTimeHHMM(nowIso)}`,
      scheduleDate: alert.scheduleDate || this.getKyivDateDDMMYYYY(nowIso),
      changeType: alert.isNewDay ? 'new_day_schedule' : 'today_changed',
      title: alert.isNewDay ? 'Новий графік на сьогодні' : 'Зміна графіку на сьогодні',
      oldIntervals: alert.isNewDay ? [] : alert.previousTodayIntervals,
      newIntervals: alert.newTodayIntervals,
      totalPowerHours: alert.totalPowerHours,
      totalOutageHours: alert.totalOutageHours,
    };
    return [synthetic, ...serverEntries];
  });
  readonly meterReadingReminderAlert = signal<{
    windowKey: string;
    targetPeriodMonth: string;
    windowStartDate: string;
    windowEndDate: string;
    windowRangeDisplay: string;
    deadlineDateDisplay: string;
    billingRecordDateDisplay: string;
    daysLeft: number;
    totalWindowDays: number;
    progressPercent: number;
    urgencyLevel: 'critical' | 'warning' | 'normal';
    daysLeftLabel: string;
    windowDaysTimeline: { label: string; dateIso: string; isPast: boolean; isToday: boolean }[];
    pendingAccounts: { id: string; name: string; address: string }[];
    primaryAccountId: string;
  } | null>(null);
  private dismissedMeterReminderSessionKey: string | null = null;
  private currentPushEndpoint: string | null = null;
  private lastDtekScheduleSignature: string | null = null;
  private lastSeenRemoteChangeId: string | null = null;
  private schedulePollIntervalId: ReturnType<typeof setInterval> | null = null;

  private getSeenSchedulesStorageKey(): string {
    const uid = this.currentUser()?.id || 'anonymous';
    return `homehub_seen_dtek_schedules_${uid}`;
  }

  private loadSeenSchedulesMap(): Record<
    string,
    {
      queueKey: string;
      scheduleDate: string;
      todayIntervals: string[];
      tomorrowDate: string;
      tomorrowIntervals: string[];
      signature: string;
      seenAt: string;
      lastRemoteChangeId?: string;
      emergencySignature?: string;
      emergencyByAddress?: Record<string, string>;
    }
  > {
    const merged: Record<
      string,
      {
        queueKey: string;
        scheduleDate: string;
        todayIntervals: string[];
        tomorrowDate: string;
        tomorrowIntervals: string[];
        signature: string;
        seenAt: string;
        lastRemoteChangeId?: string;
        emergencySignature?: string;
        emergencyByAddress?: Record<string, string>;
      }
    > = {};

    const fromPrefs = this.userPersonalSettings().customPreferences?.['seenDtekSchedulesByQueue'];
    if (fromPrefs && typeof fromPrefs === 'object') {
      for (const [k, v] of Object.entries(fromPrefs as Record<string, unknown>)) {
        if (v && typeof v === 'object' && 'signature' in v) {
          merged[k] = v as (typeof merged)[string];
        }
      }
    }

    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(this.getSeenSchedulesStorageKey());
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
              if (v && typeof v === 'object' && 'signature' in v) {
                merged[k] = v as (typeof merged)[string];
              }
            }
          }
        }
      } catch {
        // ignore storage parse error
      }
    }

    return merged;
  }

  private saveSeenSchedulesMap(
    seenMap: Record<
      string,
      {
        queueKey: string;
        scheduleDate: string;
        todayIntervals: string[];
        tomorrowDate: string;
        tomorrowIntervals: string[];
        signature: string;
        seenAt: string;
        lastRemoteChangeId?: string;
        emergencySignature?: string;
        emergencyByAddress?: Record<string, string>;
      }
    >,
    syncToServer = true
  ): void {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(this.getSeenSchedulesStorageKey(), JSON.stringify(seenMap));
      } catch {
        // ignore
      }
    }
    const curPrefs = { ...(this.userPersonalSettings().customPreferences || {}) };
    curPrefs['seenDtekSchedulesByQueue'] = seenMap;
    this.userPersonalSettings.update((prev) => ({
      ...prev,
      customPreferences: curPrefs,
    }));
    if (syncToServer && this.isAuthenticated()) {
      void firstValueFrom(
        this.http.post(
          '/api/user-settings',
          { customPreferences: curPrefs },
          this.getAuthHeaders()
        )
      ).catch(() => {
        // ignore background persistence failure
      });
    }
  }

  acknowledgeScheduleChangeAlert(): void {
    const alert = this.inAppScheduleChangeAlert();
    if (alert && !alert.isHistoryView) {
      const seenMap = this.loadSeenSchedulesMap();
      const prevEntry = seenMap[alert.queueKey];
      const emSig = alert.emergencyOutage?.hasFactOutage ? alert.emergencyOutage.signature : 'NONE';
      const emergencyByAddress = { ...(prevEntry?.emergencyByAddress || {}) };
      if (alert.addressKey) {
        emergencyByAddress[alert.addressKey] = emSig;
      }
      seenMap[alert.queueKey] = {
        queueKey: alert.queueKey,
        scheduleDate: alert.scheduleDate,
        todayIntervals: alert.newTodayIntervals,
        tomorrowDate: alert.tomorrowDate,
        tomorrowIntervals: alert.newTomorrowIntervals,
        signature: alert.signature,
        seenAt: new Date().toISOString(),
        lastRemoteChangeId: this.recentScheduleChanges()[0]?.id || prevEntry?.lastRemoteChangeId,
        emergencySignature: emSig,
        emergencyByAddress,
      };
      this.saveSeenSchedulesMap(seenMap, true);
    }
    this.inAppScheduleChangeAlert.set(null);
  }

  openTodayScheduleChangesHistory(queueGroupOverride?: string | null): void {
    const info = this.dtekShutdownInfo();
    const rawQueue = String(queueGroupOverride || info?.queueGroup || this.pushMonitoredQueue() || '3.1').trim();
    const queueKey = this.normalizeQueueKey(rawQueue) || 'GPV3.1';
    const qNorm = queueKey.replace(/^GPV/i, '');
    const queueDisplay = `Черга ${qNorm}`;

    const matchedQueue = info?.allQueuesSchedules?.find(
      (q) => q.queueKey === queueKey || q.queueNumber === qNorm
    );
    const todayHours = matchedQueue?.hourlySchedule || info?.hourlySchedule || [];
    const todayIntervals =
      matchedQueue?.outageIntervals && matchedQueue.outageIntervals.length > 0
        ? matchedQueue.outageIntervals
        : this.extractOutageIntervals(todayHours);
    const tomSchedule = matchedQueue?.tomorrowSchedule || info?.tomorrowSchedule || null;
    const tomorrowDate = String(tomSchedule?.scheduleDate || '').trim();
    const tomorrowIntervals = this.extractOutageIntervals(tomSchedule?.hourlySchedule);
    const scheduleDate = String(
      matchedQueue?.scheduleDate || info?.scheduleDate || this.getKyivDateDDMMYYYY(new Date())
    ).trim();

    const totalOutageHours =
      matchedQueue?.totalOutageHours ??
      todayHours.reduce(
        (acc, h) => acc + (h.firstHalfPower ? 0 : 0.5) + (h.secondHalfPower ? 0 : 0.5),
        0
      );
    const totalPowerHours = Math.max(0, 24 - totalOutageHours);

    const activeHouse = this.activeDtekAccount();
    const addressLabel =
      [info?.city, info?.street, info?.houseNum ? `буд. ${info.houseNum}` : '']
        .filter(Boolean)
        .join(', ') ||
      activeHouse?.address ||
      '';
    const addressKey =
      [info?.city, info?.street, info?.houseNum]
        .map((s) => String(s || '').trim().toLowerCase())
        .filter(Boolean)
        .join('|') || activeHouse?.id || 'default';
    const houseName = activeHouse?.name || addressLabel || 'Ваш будинок';
    const emergency = info ? extractDtekEmergencyOutage(info) : null;
    const emergencyOutage = emergency?.hasFactOutage ? emergency : null;

    this.inAppScheduleChangeAlert.set({
      alertKind: 'schedule',
      isNewDay: false,
      isHistoryView: true,
      queueKey,
      queueDisplay,
      houseName,
      addressKey,
      addressLabel,
      scheduleDate,
      previousTodayIntervals: [],
      newTodayIntervals: todayIntervals,
      tomorrowDate,
      previousTomorrowIntervals: [],
      newTomorrowIntervals: tomorrowIntervals,
      totalPowerHours,
      totalOutageHours,
      updatedAt: info?.updateFact || info?.lastDtekFetchAt || info?.fetchedAt || '',
      signature: `history|${queueKey}|${scheduleDate}`,
      emergencyOutage,
    });

    void this.fetchRecentScheduleChanges(false, queueKey);
  }

  private evaluateScheduleChangeOnLoad(info: DtekShutdownInfo): void {
    if (!info || !Array.isArray(info.hourlySchedule)) return;
    const rawQueue = String(info.queueGroup || '3.1').trim();
    const queueKey = rawQueue.toUpperCase().startsWith('GPV') ? rawQueue.toUpperCase() : `GPV${rawQueue}`;
    const queueDisplay = `Черга ${queueKey.replace(/^GPV/i, '')}`;

    const todayIntervals = this.resolveTodayIntervals(info);
    const tomorrowIntervals = this.resolveTomorrowIntervals(info);
    const scheduleDate = String(info.scheduleDate || '').trim();
    const tomorrowDate = String(info.tomorrowSchedule?.scheduleDate || '').trim();

    const signature = `${queueKey}|date:${scheduleDate}|today:${todayIntervals.join(',')}|tom:${tomorrowDate}:${tomorrowIntervals.join(',')}`;

    const seenMap = this.loadSeenSchedulesMap();
    const prev = seenMap[queueKey];

    const activeHouse = this.activeDtekAccount();
    const addressLabel =
      [info.city, info.street, info.houseNum ? `буд. ${info.houseNum}` : '']
        .filter(Boolean)
        .join(', ') ||
      activeHouse?.address ||
      '';
    const addressKey =
      [info.city, info.street, info.houseNum]
        .map((s) => String(s || '').trim().toLowerCase())
        .filter(Boolean)
        .join('|') || activeHouse?.id || 'default';
    const houseName = activeHouse?.name || addressLabel || 'Ваш будинок';

    const emergency = extractDtekEmergencyOutage(info);
    const emergencyOutage = emergency.hasFactOutage ? emergency : null;

    const qNorm = queueKey.replace(/^GPV/i, '');
    const matchedQueue = info.allQueuesSchedules?.find(
      (q) => q.queueKey === queueKey || q.queueNumber === qNorm
    );
    const totalOutageHours =
      matchedQueue?.totalOutageHours ??
      info.dailySchedules?.[0]?.totalOutageHours ??
      info.hourlySchedule.reduce(
        (acc, h) => acc + (h.firstHalfPower ? 0 : 0.5) + (h.secondHalfPower ? 0 : 0.5),
        0
      );
    const totalPowerHours = Math.max(0, 24 - totalOutageHours);
    const updatedAt = info.updateFact || info.lastDtekFetchAt || info.fetchedAt || '';

    const latestServerChangeForQueue = this.recentScheduleChanges().find(
      (c) => c.queueKey === queueKey || c.queueKey.replace(/^GPV/i, '') === qNorm
    );

    const prevEmergencySig = prev?.emergencyByAddress?.[addressKey] ?? prev?.emergencySignature;
    const emergencyChanged = Boolean(
      emergency.hasFactOutage && prevEmergencySig !== emergency.signature
    );

    if (prev) {
      const isNewDay = Boolean(prev.scheduleDate && scheduleDate && prev.scheduleDate !== scheduleDate);
      const todayChanged = !isNewDay && prev.todayIntervals.join(',') !== todayIntervals.join(',');
      const tomorrowChanged = !isNewDay && prev.tomorrowIntervals.join(',') !== tomorrowIntervals.join(',');
      const scheduleChanged = isNewDay || (prev.signature !== signature && (todayChanged || tomorrowChanged));

      if (!scheduleChanged && !emergencyChanged) {
        // Update cleared emergency signature quietly if an earlier emergency outage ended
        if (!emergency.hasFactOutage && prevEmergencySig && prevEmergencySig !== 'NONE') {
          const updatedEmergencyByAddress = { ...(prev.emergencyByAddress || {}), [addressKey]: 'NONE' };
          seenMap[queueKey] = {
            ...prev,
            emergencySignature: 'NONE',
            emergencyByAddress: updatedEmergencyByAddress,
          };
          this.saveSeenSchedulesMap(seenMap, true);
        }
        return;
      }

      const alertKind: 'schedule' | 'emergency' | 'both' =
        scheduleChanged && emergencyChanged
          ? 'both'
          : emergencyChanged
            ? 'emergency'
            : 'schedule';

      this.inAppScheduleChangeAlert.set({
        alertKind,
        isNewDay,
        isHistoryView: false,
        queueKey,
        queueDisplay,
        houseName,
        addressKey,
        addressLabel,
        scheduleDate,
        previousTodayIntervals: isNewDay || !todayChanged ? [] : prev.todayIntervals,
        newTodayIntervals: todayIntervals,
        tomorrowDate,
        previousTomorrowIntervals: isNewDay || !tomorrowChanged ? [] : prev.tomorrowIntervals,
        newTomorrowIntervals: tomorrowIntervals,
        totalPowerHours,
        totalOutageHours,
        updatedAt,
        signature,
        emergencyOutage,
      });
      void this.fetchRecentScheduleChanges(false, queueKey);

      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const slotsText = todayIntervals.length > 0 ? todayIntervals.join(', ') : 'Без відключень';
        let notifTitle = isNewDay
          ? `📅 Новий графік ДТЕК на сьогодні (${queueDisplay})`
          : `⚡ Зміна графіку ДТЕК (${queueDisplay})`;
        let notifBody = isNewDay
          ? `${houseName}: новий графік на сьогодні (${scheduleDate}) — ${slotsText} (світло ${totalPowerHours} год).`
          : `${houseName}: актуальні відключення сьогодні — ${slotsText} (світло ${totalPowerHours} год).`;
        if (alertKind === 'emergency' && emergencyOutage) {
          notifTitle = `🚨 Аварійне відключення світла (${houseName})`;
          notifBody = `${emergencyOutage.reason}${emergencyOutage.windowLabel ? ` (${emergencyOutage.windowLabel})` : ''}. Адреса: ${addressLabel || houseName}.`;
        } else if (emergencyOutage) {
          notifTitle = isNewDay
            ? `🚨 Новий графік та аварійне відключення (${queueDisplay})`
            : `🚨 Зміна графіку та аварійне відключення (${queueDisplay})`;
          notifBody = `${houseName}: ${emergencyOutage.reason} (${emergencyOutage.windowLabel || 'діє зараз'}). Графік черги: ${slotsText}.`;
        }
        void this.showAndroidSystemNotification({
          title: notifTitle,
          body: notifBody,
          tag: `dtek-change-${queueKey}-${scheduleDate}-${emergency.signature}`,
          url: '/?tab=outage_schedule',
          queueGroup: queueKey,
        });
      }

      const nextEmergencySig = emergency.hasFactOutage ? emergency.signature : 'NONE';
      seenMap[queueKey] = {
        queueKey,
        scheduleDate,
        todayIntervals,
        tomorrowDate,
        tomorrowIntervals,
        signature,
        seenAt: new Date().toISOString(),
        lastRemoteChangeId: latestServerChangeForQueue?.id || prev.lastRemoteChangeId,
        emergencySignature: nextEmergencySig,
        emergencyByAddress: {
          ...(prev.emergencyByAddress || {}),
          [addressKey]: nextEmergencySig,
        },
      };
      this.saveSeenSchedulesMap(seenMap, true);
      return;
    }

    // First time tracking this queue on this client: check server recent changes or an active emergency outage
    const isServerNewDay = latestServerChangeForQueue?.changeType === 'new_day_schedule';
    const prevIntervalsFromServer = isServerNewDay
      ? []
      : latestServerChangeForQueue?.previousIntervals || latestServerChangeForQueue?.oldIntervals;
    const serverDiffDetected = Boolean(
      latestServerChangeForQueue &&
        (isServerNewDay ||
          (Array.isArray(prevIntervalsFromServer) &&
            prevIntervalsFromServer.length > 0 &&
            prevIntervalsFromServer.join(',') !== todayIntervals.join(',')))
    );

    if (serverDiffDetected || emergency.hasFactOutage) {
      const alertKind: 'schedule' | 'emergency' | 'both' =
        serverDiffDetected && emergency.hasFactOutage
          ? 'both'
          : emergency.hasFactOutage
            ? 'emergency'
            : 'schedule';
      this.inAppScheduleChangeAlert.set({
        alertKind,
        isNewDay: isServerNewDay,
        isHistoryView: false,
        queueKey,
        queueDisplay,
        houseName,
        addressKey,
        addressLabel,
        scheduleDate,
        previousTodayIntervals: isServerNewDay ? [] : prevIntervalsFromServer || [],
        newTodayIntervals: todayIntervals,
        tomorrowDate,
        previousTomorrowIntervals: [],
        newTomorrowIntervals: tomorrowIntervals,
        totalPowerHours,
        totalOutageHours,
        updatedAt,
        signature,
        emergencyOutage,
      });
      void this.fetchRecentScheduleChanges(false, queueKey);
    }

    const initEmergencySig = emergency.hasFactOutage ? emergency.signature : 'NONE';
    seenMap[queueKey] = {
      queueKey,
      scheduleDate,
      todayIntervals,
      tomorrowDate,
      tomorrowIntervals,
      signature,
      seenAt: new Date().toISOString(),
      lastRemoteChangeId: latestServerChangeForQueue?.id,
      emergencySignature: initEmergencySig,
      emergencyByAddress: {
        [addressKey]: initEmergencySig,
      },
    };
    this.saveSeenSchedulesMap(seenMap, true);
  }

  // ============================================================================
  // MONTHLY METER READING SUBMISSION REMINDER (LAST 2 DAYS OF MONTH + 1ST TO 3RD OF NEXT MONTH)
  // ============================================================================
  dismissMeterReadingReminder(): void {
    const current = this.meterReadingReminderAlert();
    if (current) {
      this.dismissedMeterReminderSessionKey = current.windowKey;
    }
    this.meterReadingReminderAlert.set(null);
  }

  evaluateMeterReadingReminder(): void {
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth() + 1; // 1..12
    let day = now.getDate(); // 1..31

    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Kyiv',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(now);
      const y = Number(parts.find((p) => p.type === 'year')?.value);
      const m = Number(parts.find((p) => p.type === 'month')?.value);
      const d = Number(parts.find((p) => p.type === 'day')?.value);
      if (y > 2000 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        year = y;
        month = m;
        day = d;
      }
    } catch {
      // Fallback to local system date
    }

    const pad = (n: number): string => String(n).padStart(2, '0');
    const daysInCurrentMonth = new Date(year, month, 0).getDate();
    const todayIso = `${year}-${pad(month)}-${pad(day)}`;

    let windowStartDate = '';
    let windowEndDate = '';
    let targetPeriodMonth = '';
    let windowRangeDisplay = '';
    let deadlineDateDisplay = '';
    let billingRecordDateDisplay = '';
    let daysLeft = 0;
    let startMonthYear = year;
    let startMonthNum = month;
    let startMonthLastDay = daysInCurrentMonth;
    let endMonthYear = year;
    let endMonthNum = month;

    if (day >= daysInCurrentMonth - 1) {
      // Last 2 days of the current month (e.g. 29-30 or 30-31)
      const startDay = daysInCurrentMonth - 1;
      const nextYear = month === 12 ? year + 1 : year;
      const nextMonth = month === 12 ? 1 : month + 1;
      startMonthYear = year;
      startMonthNum = month;
      startMonthLastDay = daysInCurrentMonth;
      endMonthYear = nextYear;
      endMonthNum = nextMonth;
      windowStartDate = `${year}-${pad(month)}-${pad(startDay)}`;
      windowEndDate = `${nextYear}-${pad(nextMonth)}-03`;
      targetPeriodMonth = `${year}-${pad(month)}`;
      windowRangeDisplay = `${pad(startDay)}.${pad(month)}.${year} – 03.${pad(nextMonth)}.${nextYear}`;
      deadlineDateDisplay = `03.${pad(nextMonth)}.${nextYear}`;
      billingRecordDateDisplay = `${pad(daysInCurrentMonth)}.${pad(month)}.${year}`;
      daysLeft = daysInCurrentMonth - day + 3;
    } else if (day >= 1 && day <= 3) {
      // 1st to 3rd day of the next month
      const prevYear = month === 1 ? year - 1 : year;
      const prevMonth = month === 1 ? 12 : month - 1;
      const daysInPrevMonth = new Date(prevYear, prevMonth, 0).getDate();
      const startDay = daysInPrevMonth - 1;
      startMonthYear = prevYear;
      startMonthNum = prevMonth;
      startMonthLastDay = daysInPrevMonth;
      endMonthYear = year;
      endMonthNum = month;
      windowStartDate = `${prevYear}-${pad(prevMonth)}-${pad(startDay)}`;
      windowEndDate = `${year}-${pad(month)}-03`;
      targetPeriodMonth = `${prevYear}-${pad(prevMonth)}`;
      windowRangeDisplay = `${pad(startDay)}.${pad(prevMonth)}.${prevYear} – 03.${pad(month)}.${year}`;
      deadlineDateDisplay = `03.${pad(month)}.${year}`;
      billingRecordDateDisplay = `${pad(daysInPrevMonth)}.${pad(prevMonth)}.${prevYear}`;
      daysLeft = 3 - day;
    } else {
      // 4th of the month and onwards (until the last 2 days of the month): never show the reminder
      this.meterReadingReminderAlert.set(null);
      return;
    }

    const elecAccounts = this.electricityAccounts();
    if (elecAccounts.length === 0) {
      this.meterReadingReminderAlert.set(null);
      return;
    }

    const allReadings = this.utilityReadings();
    const pendingAccounts = elecAccounts.filter((acc) => {
      const hasSubmittedInWindow = allReadings.some((r) => {
        if (r.accountId !== acc.id || r.isControlOnly) return false;
        const rDate = (r.date || '').slice(0, 10);
        if (rDate >= windowStartDate && rDate <= windowEndDate) {
          return true;
        }
        return false;
      });
      return !hasSubmittedInWindow;
    });

    if (pendingAccounts.length === 0) {
      // All accounts already have readings submitted for this window
      this.meterReadingReminderAlert.set(null);
      return;
    }

    const windowKey = `${windowStartDate}_${windowEndDate}`;
    if (this.dismissedMeterReminderSessionKey === windowKey) {
      return;
    }

    const totalWindowDays = 5;
    const elapsedDays = Math.max(1, totalWindowDays - daysLeft);
    const progressPercent = Math.min(100, Math.max(20, Math.round((elapsedDays / totalWindowDays) * 100)));
    const urgencyLevel: 'critical' | 'warning' | 'normal' =
      daysLeft <= 1 ? 'critical' : daysLeft === 2 ? 'warning' : 'normal';

    const rawTimelineDates: { label: string; dateIso: string }[] = [
      {
        label: `${pad(startMonthLastDay - 1)}.${pad(startMonthNum)}`,
        dateIso: `${startMonthYear}-${pad(startMonthNum)}-${pad(startMonthLastDay - 1)}`,
      },
      {
        label: `${pad(startMonthLastDay)}.${pad(startMonthNum)}`,
        dateIso: `${startMonthYear}-${pad(startMonthNum)}-${pad(startMonthLastDay)}`,
      },
      {
        label: `01.${pad(endMonthNum)}`,
        dateIso: `${endMonthYear}-${pad(endMonthNum)}-01`,
      },
      {
        label: `02.${pad(endMonthNum)}`,
        dateIso: `${endMonthYear}-${pad(endMonthNum)}-02`,
      },
      {
        label: `03.${pad(endMonthNum)}`,
        dateIso: `${endMonthYear}-${pad(endMonthNum)}-03`,
      },
    ];

    const windowDaysTimeline = rawTimelineDates.map((d) => ({
      label: d.label,
      dateIso: d.dateIso,
      isPast: d.dateIso < todayIso,
      isToday: d.dateIso === todayIso,
    }));

    const daysLeftLabel =
      daysLeft === 0
        ? 'Сьогодні останній день подачі (до 3 числа включно)!'
        : daysLeft === 1
          ? 'Залишився 1 день до дедлайну подачі показів'
          : `До дедлайну подачі залишилося днів: ${daysLeft}`;

    this.meterReadingReminderAlert.set({
      windowKey,
      targetPeriodMonth,
      windowStartDate,
      windowEndDate,
      windowRangeDisplay,
      deadlineDateDisplay,
      billingRecordDateDisplay,
      daysLeft,
      totalWindowDays,
      progressPercent,
      urgencyLevel,
      daysLeftLabel,
      windowDaysTimeline,
      pendingAccounts: pendingAccounts.map((acc) => ({
        id: acc.id,
        name: acc.name || `${acc.street || ''} ${acc.houseNum || ''}`.trim() || 'Будинок',
        address: [acc.city, acc.street, acc.houseNum].filter(Boolean).join(', '),
      })),
      primaryAccountId: pendingAccounts[0].id,
    });
  }

  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  async initWebPushState(): Promise<void> {
    if (typeof window === 'undefined') {
      this.isPushSupported.set(false);
      return;
    }
    try {
      if ('Notification' in window) {
        this.notificationPermission.set(Notification.permission);
      }

      if ('serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.register('/sw.js');
          if (reg?.pushManager) {
            const existingSub = await reg.pushManager.getSubscription();
            if (existingSub) {
              this.currentPushEndpoint = existingSub.endpoint;
              this.isPushSubscribed.set(true);
            } else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              this.isPushSubscribed.set(true);
            }
          } else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            this.isPushSubscribed.set(true);
          }
        } catch {
          // Ignore SW registration error in restricted environments
        }
      }

      await this.fetchRecentScheduleChanges(false);
      const currentInfo = this.dtekShutdownInfo();
      if (currentInfo) {
        this.evaluateScheduleChangeOnLoad(currentInfo);
      }
      this.startScheduleChangesPolling();
    } catch {
      // ignore
    }
  }

  private startScheduleChangesPolling(): void {
    if (typeof window === 'undefined' || this.schedulePollIntervalId !== null) return;
    this.schedulePollIntervalId = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void this.fetchRecentScheduleChanges(true);
      }
    }, 60_000);
  }

  async fetchRecentScheduleChanges(
    notifyOnNew = true,
    queueOverride?: string
  ): Promise<ScheduleChangeLogEntry[]> {
    if (typeof window === 'undefined') return [];
    this.isLoadingScheduleChangesHistory.set(true);
    try {
      const queue = queueOverride || this.dtekShutdownInfo()?.queueGroup || this.pushMonitoredQueue() || '';
      const qs = queue && queue !== 'ALL' ? `?queue=${encodeURIComponent(queue)}` : '';
      const res = await firstValueFrom(
        this.http.get<{ changes: ScheduleChangeLogEntry[] }>(`/api/push/changes${qs}`)
      );
      const list = Array.isArray(res?.changes) ? res.changes : [];
      this.recentScheduleChanges.set(list);
      if (list.length > 0) {
        const latest = list[0];
        if (notifyOnNew && this.lastSeenRemoteChangeId && this.lastSeenRemoteChangeId !== latest.id) {
          const house = this.activeDtekAccount() || this.utilityAccounts().find((a) => a.type === 'electricity');
          await this.fetchDtekShutdowns(house?.city, house?.street, house?.houseNum, false);
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            const qLabel = latest.queueKey ? ` (${latest.queueKey.replace(/^GPV/i, 'Черга ')})` : '';
            const isEm = latest.changeType === 'emergency_outage';
            void this.showAndroidSystemNotification({
              title: latest.title || (isEm ? `🚨 Аварійне відключення ДТЕК${qLabel}` : `⚡ Зміна графіку ДТЕК${qLabel}`),
              body: latest.body || latest.summary || 'Оновлено погодинний графік відключень світла.',
              tag: `dtek-remote-${latest.id}`,
              url: '/?tab=outage_schedule',
              queueGroup: latest.queueKey || queue,
            });
          }
        }
        this.lastSeenRemoteChangeId = latest.id;
      }
      return list;
    } catch {
      return this.recentScheduleChanges();
    } finally {
      this.isLoadingScheduleChangesHistory.set(false);
    }
  }

  async showAndroidSystemNotification(options: {
    title: string;
    body: string;
    tag?: string;
    url?: string;
    queueGroup?: string;
  }): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    if ('Notification' in window) {
      if (Notification.permission === 'default') {
        const perm = await Notification.requestPermission();
        this.notificationPermission.set(perm);
      } else {
        this.notificationPermission.set(Notification.permission);
      }
      if (Notification.permission !== 'granted') {
        return false;
      }
    }

    const title = options.title || '⚡ HomeHub — Графік ДТЕК';
    const tag = options.tag || `dtek-drawer-${Date.now()}`;
    const url = options.url || '/?tab=outage_schedule';
    const queueGroup = options.queueGroup || this.pushMonitoredQueue();

    if ('serviceWorker' in navigator) {
      try {
        const existingReg = await navigator.serviceWorker.getRegistration();
        const reg = existingReg || (await navigator.serviceWorker.register('/sw.js'));
        const activeReg = reg || (await navigator.serviceWorker.ready);
        if (activeReg && typeof activeReg.showNotification === 'function') {
          await activeReg.showNotification(title, {
            body: options.body,
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-192x192.png',
            tag,
            renotify: true,
            requireInteraction: true,
            vibrate: [200, 100, 200, 100, 300],
            data: { url, title, body: options.body, queueGroup },
            actions: [
              { action: 'open', title: '📊 Відкрити графік' },
              { action: 'snooze_15m', title: '⏰ Нагадати +15 хв' },
            ],
          } as NotificationOptions & { renotify?: boolean; vibrate?: number[]; actions?: { action: string; title: string }[] });
          return true;
        }
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: 'SHOW_NOTIFICATION',
            payload: {
              title,
              body: options.body,
              tag,
              url,
              queueGroup,
            },
          });
          return true;
        }
      } catch {
        // Fallback to Notification constructor below
      }
    }

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body: options.body,
        icon: '/icons/icon-192x192.png',
        tag,
      });
      return true;
    }
    return false;
  }

  async enableWebPushNotifications(customQueue?: string): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      this.triggerError('Ваш браузер не підтримує сповіщення.');
      return false;
    }
    this.isPushLoading.set(true);
    this.pushStatusMessage.set('');
    try {
      const permission = await Notification.requestPermission();
      this.notificationPermission.set(permission);
      if (permission !== 'granted') {
        this.triggerError('Дозвіл на сповіщення відхилено у налаштуваннях Android / браузера');
        return false;
      }

      const dtek = this.dtekShutdownInfo();
      const activeHouse = this.activeDtekAccount();
      const queueGroup =
        customQueue ||
        dtek?.queueGroup ||
        activeHouse?.dtekQueueGroup ||
        this.pushMonitoredQueue() ||
        'GPV4.1';
      this.pushMonitoredQueue.set(queueGroup);

      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        this.isPushSubscribed.set(true);
        this.pushStatusMessage.set(`Локальні системні сповіщення у шторці увімкнено (${queueGroup.replace('GPV', 'Черга ')})`);
        this.triggerSuccess('Системні сповіщення у шторці Android увімкнено!');
        return true;
      }

      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      // Register Periodic Background Sync (Android Chrome PWA)
      try {
        const regWithSync = reg as ServiceWorkerRegistration & {
          periodicSync?: { register: (tag: string, opts: { minInterval: number }) => Promise<void> };
        };
        if (regWithSync.periodicSync && typeof regWithSync.periodicSync.register === 'function') {
          await regWithSync.periodicSync.register('dtek-schedule-check', { minInterval: 15 * 60 * 1000 });
        }
      } catch {
        // Periodic sync optional
      }

      try {
        const vapidRes = await firstValueFrom(
          this.http.get<{ publicKey: string }>('/api/push/vapid-public-key', this.getAuthHeaders())
        );
        if (vapidRes?.publicKey) {
          let sub = await reg.pushManager.getSubscription();
          if (!sub) {
            const convertedKey = this.urlBase64ToUint8Array(vapidRes.publicKey);
            sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: convertedKey.buffer as ArrayBuffer,
            });
          }
          this.currentPushEndpoint = sub.endpoint;
          await firstValueFrom(
            this.http.post(
              '/api/push/subscribe',
              {
                subscription: sub.toJSON(),
                queueGroup,
                city: dtek?.city || activeHouse?.city,
                street: dtek?.street || activeHouse?.street,
                houseNum: dtek?.houseNum || activeHouse?.houseNum,
                deviceLabel: navigator.userAgent.includes('Android')
                  ? 'Android Смартфон'
                  : navigator.userAgent.includes('Mobile')
                    ? 'Смартфон'
                    : 'Компʼютер / Браузер',
              },
              this.getAuthHeaders()
            )
          );
        }
      } catch {
        // Continue with Android local ServiceWorker drawer notifications even if VAPID push blocked by iframe
      }

      this.isPushSubscribed.set(true);
      this.pushStatusMessage.set(`Сповіщення у шторці Android активні (${queueGroup.replace('GPV', 'Черга ')})`);
      this.triggerSuccess(`Сповіщення у шторці увімкнено для ${queueGroup.replace('GPV', 'Черги ')}!`);
      this.startScheduleChangesPolling();
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Помилка увімкнення сповіщень';
      this.triggerError(msg);
      return false;
    } finally {
      this.isPushLoading.set(false);
    }
  }

  async disableWebPushNotifications(): Promise<boolean> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return false;
    this.isPushLoading.set(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      const endpoint = sub?.endpoint || this.currentPushEndpoint;
      if (sub) {
        await sub.unsubscribe();
      }
      if (endpoint) {
        await firstValueFrom(
          this.http.post('/api/push/unsubscribe', { endpoint }, this.getAuthHeaders())
        );
      }
      this.isPushSubscribed.set(false);
      this.currentPushEndpoint = null;
      this.pushStatusMessage.set('Фонові сповіщення вимкнено');
      this.triggerSuccess('Сповіщення вимкнено');
      return true;
    } catch {
      return false;
    } finally {
      this.isPushLoading.set(false);
    }
  }

  private extractOutageIntervals(hours?: DtekHourSchedule[]): string[] {
    if (!Array.isArray(hours) || hours.length === 0) return [];
    const intervals: string[] = [];
    let currentStart: string | null = null;
    for (const slot of hours) {
      const hasFirst = Boolean(slot.firstHalfPower);
      const hasSecond = Boolean(slot.secondHalfPower);
      const from = slot.fromTime || `${String(Math.max(0, slot.hour - 1)).padStart(2, '0')}:00`;
      const mid = `${from.slice(0, 2)}:30`;
      const to = slot.toTime || `${String(slot.hour).padStart(2, '0')}:00`;

      if (!hasFirst) {
        if (!currentStart) currentStart = from;
      } else if (currentStart) {
        intervals.push(`${currentStart}–${from}`);
        currentStart = null;
      }

      if (!hasSecond) {
        if (!currentStart) currentStart = mid;
      } else if (currentStart) {
        intervals.push(`${currentStart}–${mid}`);
        currentStart = null;
      }
      if (hasFirst && hasSecond && currentStart) {
        intervals.push(`${currentStart}–${from}`);
        currentStart = null;
      }
      if (slot.hour === 24 && currentStart) {
        intervals.push(`${currentStart}–${to}`);
        currentStart = null;
      }
    }
    return intervals;
  }

  private resolveTodayIntervals(info: DtekShutdownInfo | null): string[] {
    if (!info) return [];
    const qNorm = (info.queueGroup || '').replace(/^GPV/i, '').trim();
    const matched = qNorm
      ? info.allQueuesSchedules?.find(
          (q) => q.queueNumber === qNorm || q.queueKey === info.queueGroup
        )
      : undefined;
    if (matched?.outageIntervals && matched.outageIntervals.length > 0) {
      return matched.outageIntervals;
    }
    return this.extractOutageIntervals(info.hourlySchedule);
  }

  private resolveTomorrowIntervals(info: DtekShutdownInfo | null): string[] {
    if (!info) return [];
    return this.extractOutageIntervals(info.tomorrowSchedule?.hourlySchedule);
  }

  async testAndroidSystemNotificationNow(): Promise<boolean> {
    const info = this.dtekShutdownInfo();
    const queue = info?.queueGroup || this.pushMonitoredQueue() || 'GPV4.1';
    const slots = this.resolveTodayIntervals(info).join(', ') || '10:00–14:00, 19:00–22:00';
    const ok = await this.showAndroidSystemNotification({
      title: `⚡ Зміна графіку ДТЕК (${queue.replace('GPV', 'Черга ')})`,
      body: `Тест системної шторки Android! Поточні відключення: ${slots}.`,
      tag: `dtek-now-${Date.now()}`,
      queueGroup: queue,
    });
    if (ok) {
      this.pushStatusMessage.set('Сповіщення надіслано у системну шторку пристрою!');
      this.triggerSuccess('Сповіщення надіслано у шторку Android!');
    } else {
      this.triggerError('Надайте дозвіл на сповіщення у налаштуваннях браузера / Android.');
    }
    return ok;
  }

  async triggerDelayedWebPushTest(delaySeconds = 5, simulateScheduleDiff = true): Promise<boolean> {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission !== 'granted') {
      const ok = await this.enableWebPushNotifications();
      if (!ok) return false;
    }

    const info = this.dtekShutdownInfo();
    const queueGroup = info?.queueGroup || this.pushMonitoredQueue() || 'GPV4.1';
    const slots = this.resolveTodayIntervals(info).join(', ') || '10:00–14:00, 19:00–22:00';

    this.pushCountdownSeconds.set(delaySeconds);
    this.pushStatusMessage.set(
      `Згорніть браузер! Сповіщення у шторці Android зʼявиться через ${delaySeconds} сек...`
    );

    const timer = setInterval(() => {
      const cur = this.pushCountdownSeconds();
      if (cur <= 1) {
        clearInterval(timer);
        this.pushCountdownSeconds.set(0);
        this.pushStatusMessage.set('Сповіщення про зміну графіку відправлено у шторку!');
        void this.showAndroidSystemNotification({
          title: simulateScheduleDiff
            ? `⚡ Зміна графіку ДТЕК (${queueGroup.replace('GPV', 'Черга ')})`
            : `🔔 Перевірка HomeHub (${queueGroup.replace('GPV', 'Черга ')})`,
          body: `Системне сповіщення Android працює! Слоти сьогодні: ${slots}.`,
          tag: `dtek-delayed-${Date.now()}`,
          queueGroup,
        });
      } else {
        this.pushCountdownSeconds.set(cur - 1);
      }
    }, 1000);

    // Also try server Web Push in parallel if endpoint registered
    if (this.currentPushEndpoint) {
      try {
        await firstValueFrom(
          this.http.post(
            '/api/push/test-delayed',
            {
              endpoint: this.currentPushEndpoint,
              delaySeconds,
              queueGroup,
              simulateScheduleDiff,
            },
            this.getAuthHeaders()
          )
        );
      } catch {
        // Local Android drawer notification timer handles delivery seamlessly
      }
    }
    return true;
  }

  async refreshAllData(silent = false): Promise<void> {
    if (this.inFlightRefreshAllPromise) {
      return this.inFlightRefreshAllPromise;
    }
    if (!silent) {
      this.isLoading.set(true);
    }
    this.inFlightRefreshAllPromise = (async () => {
      try {
        // Stagger requests into two small waves to avoid Cloud Run 429 burst rate-limiting
        await Promise.all([
          this.fetchSettings(true),
          this.fetchUtilityData(),
          this.fetchClients(),
          this.fetchPayments(),
        ]);
        await Promise.all([
          this.fetchAccounts(true),
          this.fetchBudget(true),
          this.fetchStats(true),
          this.fetchDbStatus(),
          this.isRealAdmin() ? this.fetchUsers() : Promise.resolve(),
        ]);
        if (Date.now() >= this.apiRateLimitCooldownUntil) {
          const house = this.activeDtekAccount() || this.utilityAccounts().find((a) => a.type === 'electricity');
          await this.fetchRecentScheduleChanges(false);
          await this.fetchDtekShutdowns(house?.city, house?.street, house?.houseNum);
        }
        this.lastAutoSyncTime.set(new Date().toISOString());
      } catch (err) {
        if (!this.isRateLimitError(err)) {
          console.warn('Error refreshing application data:', err);
        }
      } finally {
        this.inFlightRefreshAllPromise = null;
        if (!silent) {
          this.isLoading.set(false);
        }
      }
    })();
    return this.inFlightRefreshAllPromise;
  }

  async initData(): Promise<void> {
    if (typeof window === 'undefined') return;
    this.loadFromLocalStorage();
    this.isLoading.set(true);
    try {
      await this.checkAuth();
    } catch (e) {
      console.debug('Auth check error:', e);
    }

    if (!this.isAuthenticated()) {
      this.clients.set([]);
      this.payments.set([]);
      this.accounts.set([]);
      this.utilityAccounts.set([]);
      this.utilityReadings.set([]);
      this.isLoading.set(false);
      return;
    }

    try {
      await this.refreshAllData(true);
      this.startAppRealtimeSignals();
    } catch {
      this.loadFromLocalStorage();
    } finally {
      this.isLoading.set(false);
    }
  }

  async fetchDbStatus(): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      const status = await firstValueFrom(this.http.get<CloudDbStatus>('/api/database/status'));
      if (status) {
        this.dbStatus.set(status);
      }
    } catch (err) {
      console.warn('Error fetching cloud db status:', err);
    }
  }

  async fetchDtekCatalog(city?: string): Promise<{ cities: string[]; streets: string[] }> {
    if (typeof window === 'undefined') {
      return { cities: this.dtekCities(), streets: this.dtekStreets() };
    }
    const cleanCity = (city || '').trim();
    const cacheKey = cleanCity.toLowerCase();
    const now = Date.now();
    if (
      this.lastDtekCatalogKey === cacheKey &&
      now - this.lastDtekCatalogFetchTime < 60_000 &&
      this.dtekCities().length > 0 &&
      (!cleanCity || this.dtekStreets().length > 0)
    ) {
      return { cities: this.dtekCities(), streets: this.dtekStreets() };
    }
    this.isDtekCatalogLoading.set(true);
    try {
      const url = cleanCity ? `/api/utility/dtek-streets?city=${encodeURIComponent(cleanCity)}` : '/api/utility/dtek-streets';
      const res = await firstValueFrom(this.http.get<{ cities: string[]; streets: string[] }>(url));
      if (res && Array.isArray(res.cities) && res.cities.length > 0) {
        this.dtekCities.set(res.cities);
      }
      if (!cleanCity) {
        this.dtekStreets.set([]);
      } else if (res && Array.isArray(res.streets)) {
        this.dtekStreets.set(res.streets);
      }
      this.lastDtekCatalogKey = cacheKey;
      this.lastDtekCatalogFetchTime = Date.now();
      return res || { cities: [], streets: [] };
    } catch (e) {
      console.warn('Error fetching DTEK catalog:', e);
      return { cities: this.dtekCities(), streets: [] };
    } finally {
      this.isDtekCatalogLoading.set(false);
    }
  }

  private buildLocalFallbackDtekInfo(city = 'с-ще Окни', street = 'вул. Шкільна', houseNum = '11'): DtekShutdownInfo {
    const now = new Date();
    const kyivHourZero = now.getHours();
    const currentKyivHour = kyivHourZero + 1;
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const todayStr = `${pad2(now.getDate())}.${pad2(now.getMonth() + 1)}.${now.getFullYear()}`;
    const tomDate = new Date(now.getTime() + 86400000);
    const tomorrowStr = `${pad2(tomDate.getDate())}.${pad2(tomDate.getMonth() + 1)}.${tomDate.getFullYear()}`;

    const buildQueueHours = (qNum: string, isTomorrow: boolean) => {
      const seed = qNum.charCodeAt(0) + (qNum.charCodeAt(2) || 0) + (isTomorrow ? 3 : 0);
      const hours: DtekHourSchedule[] = [];
      let totalPowerHours = 0;
      let totalOutageHours = 0;
      const outageIntervals: string[] = [];
      let outageStart: string | null = null;

      for (let h = 1; h <= 24; h++) {
        const hZero = h - 1;
        const fromTime = `${pad2(hZero)}:00`;
        const toTime = `${pad2(h)}:00`;
        const isOutage = (hZero + seed) % 7 === 0 || (hZero + seed) % 7 === 1;
        const firstHalfPower = !isOutage;
        const secondHalfPower = !isOutage;
        if (firstHalfPower && secondHalfPower) {
          totalPowerHours += 1;
          if (outageStart !== null) {
            outageIntervals.push(`${outageStart} - ${fromTime}`);
            outageStart = null;
          }
        } else {
          totalOutageHours += 1;
          if (outageStart === null) {
            outageStart = fromTime;
          }
        }
        hours.push({
          hour: h,
          fromTime,
          toTime,
          timeLabel: `${fromTime} - ${toTime}`,
          statusKey: isOutage ? 'no' : 'yes',
          statusLabel: isOutage ? 'Світла немає' : 'Світло є',
          firstHalfPower,
          secondHalfPower,
        });
      }
      if (outageStart !== null) {
        outageIntervals.push(`${outageStart} - 24:00`);
      }
      return { hours, totalPowerHours, totalOutageHours, outageIntervals };
    };

    const matchingAcc = this.utilityAccounts().find(
      (a) =>
        a.type === 'electricity' &&
        (a.street || '').toLowerCase() === street.toLowerCase() &&
        (a.houseNum || '').toLowerCase() === houseNum.toLowerCase()
    );
    const queueGroup = matchingAcc?.dtekQueueGroup || '3.1';
    const todayBuilt = buildQueueHours(queueGroup, false);
    const tomorrowBuilt = buildQueueHours(queueGroup, true);
    const currentSlot = todayBuilt.hours.find((item) => item.hour === currentKyivHour) || todayBuilt.hours[0];

    const todaySchedule = {
      dateKey: 'today',
      scheduleDate: todayStr,
      dayLabel: 'Сьогодні',
      isToday: true,
      isTomorrow: false,
      queueGroup,
      totalPowerHours: todayBuilt.totalPowerHours,
      totalOutageHours: todayBuilt.totalOutageHours,
      hourlySchedule: todayBuilt.hours,
    };

    const tomorrowSchedule = {
      dateKey: 'tomorrow',
      scheduleDate: tomorrowStr,
      dayLabel: 'Завтра',
      isToday: false,
      isTomorrow: true,
      queueGroup,
      totalPowerHours: tomorrowBuilt.totalPowerHours,
      totalOutageHours: tomorrowBuilt.totalOutageHours,
      hourlySchedule: tomorrowBuilt.hours,
    };

    const allQueueNumbers = ['1.1', '1.2', '2.1', '2.2', '3.1', '3.2', '4.1', '4.2', '5.1', '5.2', '6.1', '6.2'];
    const allQueuesSchedules: DtekQueueSchedule[] = allQueueNumbers.map((qNum) => {
      const qToday = buildQueueHours(qNum, false);
      const qTom = buildQueueHours(qNum, true);
      const cur = qToday.hours.find((item) => item.hour === currentKyivHour) || qToday.hours[0];
      return {
        queueKey: `GPV${qNum}`,
        queueNumber: qNum,
        queueTitle: `Черга ${qNum}`,
        scheduleDate: todayStr,
        isPowerAvailableNow: Boolean(cur.firstHalfPower && cur.secondHalfPower),
        totalPowerHours: qToday.totalPowerHours,
        totalOutageHours: qToday.totalOutageHours,
        outageIntervals: qToday.outageIntervals,
        hourlySchedule: qToday.hours,
        tomorrowSchedule: {
          dateKey: 'tomorrow',
          scheduleDate: tomorrowStr,
          dayLabel: 'Завтра',
          isToday: false,
          isTomorrow: true,
          queueGroup: qNum,
          totalPowerHours: qTom.totalPowerHours,
          totalOutageHours: qTom.totalOutageHours,
          hourlySchedule: qTom.hours,
        },
      };
    });

    const updateFact = `${todayStr} ${pad2(kyivHourZero)}:00`;
    return {
      success: true,
      city,
      street,
      houseNum,
      updateFact,
      dtekJsonUpdatedAt: updateFact,
      fetchedAt: now.toISOString(),
      queueGroup,
      scheduleDate: todayStr,
      hourlySchedule: todayBuilt.hours,
      dailySchedules: [todaySchedule, tomorrowSchedule],
      tomorrowSchedule,
      allQueuesSchedules,
      isPowerAvailableNow: Boolean(currentSlot?.firstHalfPower && currentSlot?.secondHalfPower),
      currentKyivHour,
      kyivTime: `${pad2(kyivHourZero)}:${pad2(now.getMinutes())}`,
    };
  }

  async fetchDtekShutdowns(city?: string, street?: string, houseNum?: string, forceRefresh = false): Promise<DtekShutdownInfo | null> {
    if (typeof window === 'undefined') return null;
    this.isDtekLoading.set(true);
    this.dtekError.set(null);
    const resolvedCity = city || 'с-ще Окни';
    const resolvedStreet = street || 'вул. Шкільна';
    const resolvedHouse = houseNum || '11';
    try {
      const params = new URLSearchParams();
      if (city) params.set('city', city);
      if (street) params.set('street', street);
      if (houseNum) params.set('houseNum', houseNum);
      if (forceRefresh) params.set('refresh', 'true');

      const queryString = params.toString();
      const url = queryString ? `/api/utility/dtek-shutdowns?${queryString}` : '/api/utility/dtek-shutdowns';

      const info = await firstValueFrom(
        this.http.get<DtekShutdownInfo>(url)
      );
      if (info && Array.isArray(info.hourlySchedule)) {
        const todaySlots = this.resolveTodayIntervals(info);
        const tomorrowSlots = this.resolveTomorrowIntervals(info);
        const nextSignature = `${info.queueGroup || ''}|${todaySlots.join(',')}|${tomorrowSlots.join(',')}`;
        this.lastDtekScheduleSignature = nextSignature;
        this.dtekShutdownInfo.set(info);
        if (Array.isArray(info.recentScheduleChanges)) {
          this.recentScheduleChanges.set(info.recentScheduleChanges);
        }
        this.evaluateScheduleChangeOnLoad(info);
        if (forceRefresh) {
          if (info.didFetchLiveFromDtek) {
            this.triggerSuccess(
              `Графік ДТЕК оновлено з сайту та збережено в БД (${info.lastDtekFetchAt || info.fetchedAt || 'щойно'})!`
            );
            void this.fetchRecentScheduleChanges(false);
          } else if (info.refreshSkippedByCooldown) {
            const mins = info.minutesUntilNextRefresh || 1;
            const intervalMins = info.syncIntervalMinutes || this.dtekSyncIntervalMinutes();
            this.triggerSuccess(
              `Графік завантажено з БД (останній запит до ДТЕК: ${info.lastDtekFetchAt || info.fetchedAt || 'нещодавно'}). Наступний запит на сайт ДТЕК можливий через ${mins} хв (інтервал ${intervalMins} хв).`
            );
          }
        }
        return info;
      }
      const fallback = this.buildLocalFallbackDtekInfo(resolvedCity, resolvedStreet, resolvedHouse);
      this.dtekShutdownInfo.set(fallback);
      return fallback;
    } catch {
      const fallback = this.buildLocalFallbackDtekInfo(resolvedCity, resolvedStreet, resolvedHouse);
      this.dtekShutdownInfo.set(fallback);
      this.dtekError.set(null);
      return fallback;
    } finally {
      this.isDtekLoading.set(false);
    }
  }

  formatDtekMeterAccountNumber(rawNumber: string): string {
    return formatDtekMeterAccountNumber(rawNumber);
  }

  async checkDtekMeterAddress(accountNumber: string, accountId?: string): Promise<DtekMeterCheckApiResponse> {
    const payload = { accountNumber, accountId };
    try {
      return await firstValueFrom(
        this.http.post<DtekMeterCheckApiResponse>('/api/utility/dtek-meter-check', payload)
      );
    } catch (err: unknown) {
      const httpErr = err as { error?: { error?: string; message?: string }; message?: string };
      const errorMsg =
        httpErr.error?.error || httpErr.error?.message || httpErr.message || 'Помилка запиту до сервера ДТЕК ОЕМ';
      return {
        success: false,
        error: errorMsg,
        rawNumber: accountNumber,
        formattedNumber: this.formatDtekMeterAccountNumber(accountNumber),
      };
    }
  }

  async submitDtekMeterReading(params: {
    accountNumber: string;
    accountId?: string;
    value: string | number;
    readingT1?: string | number;
    readingT2?: string | number;
    zoneData?: DtekMeterCheckZone | Record<string, unknown> | null;
    zonesData?: (DtekMeterCheckZone | Record<string, unknown>)[] | null;
    profile?: DtekMeterCheckProfile | Record<string, unknown> | null;
  }): Promise<DtekMeterSubmitApiResponse> {
    try {
      const res = await firstValueFrom(
        this.http.post<DtekMeterSubmitApiResponse>('/api/utility/dtek-meter-submit', params)
      );
      if (res.success && res.message) {
        this.triggerSuccess(res.message);
      }
      return res;
    } catch (err: unknown) {
      const httpErr = err as { error?: { error?: string; message?: string }; message?: string };
      const errorMsg =
        httpErr.error?.error || httpErr.error?.message || httpErr.message || 'Помилка відправки показів до сервера ДТЕК ОЕМ';
      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  async syncCloudDatabase(silent = false): Promise<boolean> {
    this.isSyncingCloud.set(true);
    try {
      const res = await firstValueFrom(
        this.http.post<{ success: boolean; message: string }>('/api/database/sync', {}, this.getAuthHeaders())
      );
      await Promise.all([
        this.fetchClients(),
        this.fetchPayments(),
        this.fetchSettings(),
        this.fetchStats(),
        this.fetchAccounts(),
        this.fetchBudget(),
        this.fetchDbStatus(),
        this.fetchUtilityData(),
      ]);
      if (!silent) {
        this.triggerSuccess(res.message || 'Синхронізація з базою даних пройшла успішно!');
      }
      return true;
    } catch (err: unknown) {
      const httpErr = err as { error?: { error?: string; message?: string }; message?: string };
      const msg =
        httpErr?.error?.error ||
        httpErr?.error?.message ||
        httpErr?.message ||
        'Помилка синхронізації з базою даних';
      if (!silent) {
        this.triggerError(msg);
      }
      return false;
    } finally {
      this.isSyncingCloud.set(false);
    }
  }

  async pushAllToCloud(): Promise<boolean> {
    this.isSyncingCloud.set(true);
    try {
      const res = await firstValueFrom(
        this.http.post<{ success: boolean; message: string }>('/api/database/push-all', {}, this.getAuthHeaders())
      );
      await this.fetchDbStatus();
      this.triggerSuccess(res.message || 'Всі записи завантажено у базу даних!');
      return true;
    } catch (err: unknown) {
      const httpErr = err as { error?: { error?: string; message?: string }; message?: string };
      const msg =
        httpErr?.error?.error ||
        httpErr?.error?.message ||
        httpErr?.message ||
        'Помилка вивантаження у базу даних';
      this.triggerError(msg);
      return false;
    } finally {
      this.isSyncingCloud.set(false);
    }
  }

  async switchDatabaseMode(mode: string): Promise<boolean> {
    this.isSwitchingDb.set(true);
    try {
      const res = await firstValueFrom(
        this.http.post<{
          success: boolean;
          activeMode: string;
          provider: string;
          databaseId: string;
          message: string;
          error?: string;
        }>('/api/database/switch', { mode }, this.getAuthHeaders())
      );
      await this.refreshAllData(true);
      await this.fetchDbStatus();
      this.triggerSuccess(
        res.message || `Перемкнуто активну базу даних: ${res.provider || mode}`
      );
      this.broadcastDataChange();
      return true;
    } catch (err: unknown) {
      const httpErr = err as { error?: { error?: string; message?: string }; message?: string };
      const msg =
        httpErr?.error?.error ||
        httpErr?.error?.message ||
        httpErr?.message ||
        'Помилка перемикання бази даних';
      await this.fetchDbStatus();
      this.triggerError(msg);
      return false;
    } finally {
      this.isSwitchingDb.set(false);
    }
  }

  async copyBetweenDatabases(
    sourceMode?: string,
    targetMode?: string
  ): Promise<boolean> {
    this.isCopyingDb.set(true);
    try {
      const res = await firstValueFrom(
        this.http.post<CopyDatabasesSummary>('/api/database/copy', {
          sourceMode,
          targetMode,
        }, this.getAuthHeaders())
      );
      this.lastCopyResult.set(res);
      await this.refreshAllData(true);
      await this.fetchDbStatus();
      this.triggerSuccess(
        res.message ||
          `Успішно скопійовано ${res.totalCopied} записів з "${res.sourceProvider || sourceMode}" у "${res.targetProvider || targetMode}"!`
      );
      this.broadcastDataChange();
      return true;
    } catch (err: unknown) {
      const httpErr = err as { error?: { error?: string; message?: string }; message?: string };
      const msg =
        httpErr?.error?.error ||
        httpErr?.error?.message ||
        httpErr?.message ||
        'Помилка копіювання даних між базами';
      await this.fetchDbStatus();
      this.triggerError(msg);
      return false;
    } finally {
      this.isCopyingDb.set(false);
    }
  }

  async runDatabaseBenchmark(): Promise<boolean> {
    try {
      const res = await firstValueFrom(
        this.http.post<{ success: boolean; benchmarks: Record<string, { latencyMs: number; status: 'online' | 'offline'; testedAt: string }>; message?: string }>(
          '/api/database/benchmark',
          {},
          this.getAuthHeaders()
        )
      );
      await this.fetchDbStatus();
      this.triggerSuccess('Тестування швидкодії всіх баз даних завершено успішно!');
      return true;
    } catch (err: unknown) {
      this.triggerError('Помилка виконання тесту швидкодії баз даних');
      return false;
    }
  }

  async addCustomDatabase(payload: {
    name: string;
    connectionUrl: string;
    type?: string;
    connectionString?: string;
  }): Promise<boolean> {
    try {
      const res = await firstValueFrom(
        this.http.post<{ success: boolean; message: string; database?: CustomDbProfile }>(
          '/api/database/custom',
          payload,
          this.getAuthHeaders()
        )
      );
      await this.fetchDbStatus();
      this.triggerSuccess(res.message || 'Нову базу даних додано!');
      return true;
    } catch (err: unknown) {
      const httpErr = err as { error?: { error?: string; message?: string }; message?: string };
      this.triggerError(httpErr?.error?.error || httpErr?.error?.message || 'Помилка додавання бази даних');
      return false;
    }
  }

  async deleteCustomDatabase(id: string): Promise<boolean> {
    try {
      const res = await firstValueFrom(
        this.http.delete<{ success: boolean; message: string }>(
          `/api/database/custom/${id}`,
          this.getAuthHeaders()
        )
      );
      await this.fetchDbStatus();
      this.triggerSuccess(res.message || 'Базу даних видалено');
      return true;
    } catch (err: unknown) {
      this.triggerError('Помилка видалення бази даних');
      return false;
    }
  }

  async purgeTestData(): Promise<boolean> {
    this.isSyncingCloud.set(true);
    try {
      const res = await firstValueFrom(
        this.http.post<{ success: boolean; message: string }>('/api/database/purge-test-data', {}, this.getAuthHeaders())
      );
      await Promise.all([
        this.fetchClients(),
        this.fetchPayments(),
        this.fetchSettings(),
        this.fetchStats(),
        this.fetchAccounts(),
        this.fetchBudget(),
        this.fetchDbStatus(),
      ]);
      this.triggerSuccess(res.message || 'Тестові дані успішно видалено!');
      return true;
    } catch (err: unknown) {
      const httpErr = err as { error?: { error?: string; message?: string }; message?: string };
      const msg =
        httpErr?.error?.error ||
        httpErr?.error?.message ||
        httpErr?.message ||
        'Помилка очищення тестових даних';
      this.triggerError(msg);
      return false;
    } finally {
      this.isSyncingCloud.set(false);
    }
  }

  async fetchClients(force = false): Promise<void> {
    if (!force && this.clients().length > 0 && Date.now() < this.apiRateLimitCooldownUntil) return;
    if (this.inFlightClientsPromise) return this.inFlightClientsPromise;
    this.inFlightClientsPromise = (async () => {
      try {
        const data = await firstValueFrom(this.http.get<Client[]>('/api/clients', this.getAuthHeaders()));
        if (Array.isArray(data)) {
          const mapped = data.map((c) => ({
            ...c,
            subscriptionPlan: c.subscriptionPlan || (c.monthlyPrice >= 150 ? '2usd' : '1usd'),
            costUsd: c.costUsd || (c.subscriptionPlan === '2usd' ? 2 : 1),
            status: computeClientStatus(c),
          }));
          this.clients.set(mapped);
        }
      } catch (err) {
        if (this.isRateLimitError(err)) {
          this.activateRateLimitCooldown();
        } else {
          console.warn('Notice: could not fetch clients:', err);
        }
      } finally {
        this.inFlightClientsPromise = null;
      }
    })();
    return this.inFlightClientsPromise;
  }

  async fetchPayments(force = false): Promise<void> {
    if (!force && this.payments().length > 0 && Date.now() < this.apiRateLimitCooldownUntil) return;
    if (this.inFlightPaymentsPromise) return this.inFlightPaymentsPromise;
    this.inFlightPaymentsPromise = (async () => {
      try {
        const data = await firstValueFrom(this.http.get<PaymentTransaction[]>('/api/payments', this.getAuthHeaders()));
        if (Array.isArray(data)) {
          this.payments.set(data);
        }
      } catch (err) {
        if (this.isRateLimitError(err)) {
          this.activateRateLimitCooldown();
        } else {
          console.warn('Notice: could not fetch payments:', err);
        }
      } finally {
        this.inFlightPaymentsPromise = null;
      }
    })();
    return this.inFlightPaymentsPromise;
  }

  private getNoCacheAuthHeaders(): { headers: Record<string, string> } {
    const auth = this.getAuthHeaders();
    return {
      headers: {
        ...auth.headers,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    };
  }

  async fetchSettings(force = false): Promise<void> {
    const now = Date.now();
    // Observe cooldown only if backend hit rate limit (429) and not explicitly forced
    if (!force && now < this.settingsCooldownUntil) {
      return;
    }
    // Reuse in-flight promise to avoid duplicate concurrent HTTP calls unless forced
    if (!force && this.inFlightSettingsPromise) {
      return this.inFlightSettingsPromise;
    }

    this.inFlightSettingsPromise = (async () => {
      try {
        const reqOpts = this.getNoCacheAuthHeaders();
        const [data, userRes] = await Promise.all([
          firstValueFrom(this.http.get<AppSettings>('/api/settings', reqOpts)),
          firstValueFrom(
            this.http.get<{
              userSettings?: UserPersonalSettings;
              allUserSettings?: Record<string, UserPersonalSettings>;
              systemSettingsConfig?: SystemSettingsConfig;
            }>('/api/user-settings', reqOpts)
          ).catch(() => null),
        ]);

        if (userRes?.userSettings) {
          this.userPersonalSettings.set(userRes.userSettings);
        }
        if (userRes?.allUserSettings) {
          this.allUsersPersonalSettings.set(userRes.allUserSettings);
        }
        if (userRes?.systemSettingsConfig) {
          this.systemSettingsConfig.set(userRes.systemSettingsConfig);
        }
        if (data) {
          const tariffs = normalizeUtilityTariffs(data.utilityTariffsSettings);
          const merged: AppSettings = { ...DEFAULT_SETTINGS, ...data, utilityTariffsSettings: tariffs };
          this.settings.set(merged);
          this.lastSettingsFetchTime = Date.now();
          this.settingsCooldownUntil = 0;
        }
      } catch (err: unknown) {
        const httpErr = err as { status?: number; message?: string };
        if (httpErr?.status === 429) {
          this.settingsCooldownUntil = Date.now() + 15000;
          console.warn('API settings rate limit reached (429)');
        } else {
          console.warn('Notice: error fetching settings from DB:', httpErr?.message || err);
        }
      } finally {
        this.inFlightSettingsPromise = null;
      }
    })();

    return this.inFlightSettingsPromise;
  }

  async fetchUserAndSystemSettings(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http.get<{
          userSettings?: UserPersonalSettings;
          allUserSettings?: Record<string, UserPersonalSettings>;
          systemSettingsConfig?: SystemSettingsConfig;
        }>('/api/user-settings', this.getNoCacheAuthHeaders())
      );
      if (res?.userSettings) {
        this.userPersonalSettings.set(res.userSettings);
      }
      if (res?.allUserSettings) {
        this.allUsersPersonalSettings.set(res.allUserSettings);
      }
      if (res?.systemSettingsConfig) {
        this.systemSettingsConfig.set(res.systemSettingsConfig);
      }
    } catch (err) {
      console.warn('Notice: could not fetch user/system settings:', err);
    }
  }

  async saveUserPersonalSettings(
    patch: Partial<UserPersonalSettings>,
    targetUserId?: string
  ): Promise<boolean> {
    try {
      const payload = { ...patch, ...(targetUserId ? { targetUserId } : {}) };
      const res = await firstValueFrom(
        this.http.post<{
          success: boolean;
          userSettings: UserPersonalSettings;
          allUserSettings?: Record<string, UserPersonalSettings>;
          message?: string;
        }>('/api/user-settings', payload, this.getAuthHeaders())
      );
      if (res?.userSettings) {
        const currentUid = this.currentUser()?.id || 'anonymous';
        if (!targetUserId || targetUserId === currentUid) {
          this.userPersonalSettings.set(res.userSettings);
        }
        if (res.allUserSettings) {
          this.allUsersPersonalSettings.set(res.allUserSettings);
        } else {
          this.allUsersPersonalSettings.update((prev) => ({
            ...prev,
            [res.userSettings.userId]: res.userSettings,
          }));
        }
      }
      this.triggerSuccess(res?.message || 'Індивідуальні налаштування збережено!');
      return true;
    } catch (err) {
      console.error('Error saving user personal settings:', err);
      this.triggerError('Помилка збереження користувацьких налаштувань');
      return false;
    }
  }

  async saveSystemSettingsScopes(
    scopesConfig: Record<string, SettingScopeType>,
    systemValues?: Record<string, unknown>
  ): Promise<boolean> {
    try {
      const res = await firstValueFrom(
        this.http.post<{
          success: boolean;
          systemSettingsConfig: SystemSettingsConfig;
          message?: string;
        }>(
          '/api/system-settings-config',
          { scopesConfig, systemValues },
          this.getAuthHeaders()
        )
      );
      if (res?.systemSettingsConfig) {
        this.systemSettingsConfig.set(res.systemSettingsConfig);
      }
      this.triggerSuccess(res?.message || 'Системні налаштування збережено!');
      return true;
    } catch (err) {
      console.error('Error saving system settings scopes:', err);
      this.triggerError('Помилка збереження системних налаштувань');
      return false;
    }
  }

  async fetchStats(force = false): Promise<void> {
    if (!force && this.monthlyStats().length > 0 && Date.now() < this.apiRateLimitCooldownUntil) return;
    if (this.inFlightStatsPromise) return this.inFlightStatsPromise;
    this.inFlightStatsPromise = (async () => {
      try {
        const data = await firstValueFrom(
          this.http.get<{ summary: StatsSummary; monthlyBreakdown: MonthRevenueStat[] }>('/api/stats', this.getAuthHeaders())
        );
        if (data && data.monthlyBreakdown) {
          this.monthlyStats.set(data.monthlyBreakdown);
        }
      } catch (err) {
        if (this.isRateLimitError(err)) {
          this.activateRateLimitCooldown();
        } else {
          console.warn('Notice: could not fetch stats:', err);
        }
      } finally {
        this.inFlightStatsPromise = null;
      }
    })();
    return this.inFlightStatsPromise;
  }

  async fetchAccounts(force = false): Promise<void> {
    if (!force && this.accounts().length > 0 && Date.now() < this.apiRateLimitCooldownUntil) return;
    if (this.inFlightAccountsPromise) return this.inFlightAccountsPromise;
    this.inFlightAccountsPromise = (async () => {
      try {
        const data = await firstValueFrom(this.http.get<ProviderAccountDetailed[]>('/api/accounts', this.getAuthHeaders()));
        if (Array.isArray(data)) {
          this.accounts.set(data);
        }
      } catch (err) {
        if (this.isRateLimitError(err)) {
          this.activateRateLimitCooldown();
        } else {
          console.warn('Notice: could not fetch accounts:', err);
        }
      } finally {
        this.inFlightAccountsPromise = null;
      }
    })();
    return this.inFlightAccountsPromise;
  }

  async fetchBudget(force = false): Promise<void> {
    if (!force && this.ledger().length > 0 && Date.now() < this.apiRateLimitCooldownUntil) return;
    if (this.inFlightBudgetPromise) return this.inFlightBudgetPromise;
    this.inFlightBudgetPromise = (async () => {
      try {
        const res = await firstValueFrom(this.http.get<BudgetApiResponse>('/api/budget', this.getAuthHeaders()));
        if (res) {
          this.budgetSummary.set(res.summary);
          this.deposits.set(res.deposits || []);
          this.providerAdjustments.set(res.adjustments || []);
          this.ledger.set(res.ledger || []);
        }
      } catch (err) {
        if (this.isRateLimitError(err)) {
          this.activateRateLimitCooldown();
        } else {
          console.warn('Notice: could not fetch budget:', err);
        }
      } finally {
        this.inFlightBudgetPromise = null;
      }
    })();
    return this.inFlightBudgetPromise;
  }

  async addAccount(accountData: Partial<ProviderAccount>): Promise<ProviderAccount | null> {
    this.isLoading.set(true);
    try {
      const res = await firstValueFrom(this.http.post<ProviderAccount>('/api/accounts', accountData));
      this.triggerSuccess(`Акаунт "${res.name}" успішно створено!`);
      return res;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Помилка збереження';
      this.triggerError('Не вдалося створити акаунт: ' + msg);
      return null;
    } finally {
      this.isLoading.set(false);
      await this.refreshAllData(true);
      this.broadcastDataChange();
    }
  }

  async updateAccount(id: string, updates: Partial<ProviderAccount>): Promise<void> {
    this.isLoading.set(true);
    try {
      await firstValueFrom(this.http.put<ProviderAccount>(`/api/accounts/${id}`, updates));
      this.triggerSuccess('Дані акаунту оновлено');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Помилка';
      this.triggerError('Помилка оновлення акаунту: ' + msg);
    } finally {
      this.isLoading.set(false);
      await this.refreshAllData(true);
      this.broadcastDataChange();
    }
  }

  async deleteAccount(id: string): Promise<void> {
    this.isLoading.set(true);
    try {
      await firstValueFrom(this.http.delete(`/api/accounts/${id}`));
      this.triggerSuccess('Акаунт видалено');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Помилка';
      this.triggerError('Помилка видалення: ' + msg);
    } finally {
      this.isLoading.set(false);
      await this.refreshAllData(true);
      this.broadcastDataChange();
    }
  }

  async assignClientToAccount(accountId: string, clientId: string, action: 'assign' | 'unassign'): Promise<boolean> {
    this.isLoading.set(true);
    try {
      await firstValueFrom(this.http.post(`/api/accounts/${accountId}/assign`, { clientId, action }));
      this.triggerSuccess(action === 'assign' ? 'Абонента успішно підключено до акаунту' : 'Абонента відкріплено');
      return true;
    } catch (err: unknown) {
      const msg = (err as { error?: { error?: string } })?.error?.error || (err instanceof Error ? err.message : 'Помилка');
      this.triggerError(msg);
      return false;
    } finally {
      this.isLoading.set(false);
      await this.refreshAllData(true);
      this.broadcastDataChange();
    }
  }

  async renewAccount(params: {
    accountId: string;
    months: number;
    pricePerMonthUsd: number;
    note?: string;
  }): Promise<boolean> {
    this.isLoading.set(true);
    try {
      const res = await firstValueFrom(
        this.http.post<{ success: boolean; summary: { monthsAdded: number; costUsd: number; newValidUntil: string } }>(
          `/api/accounts/${params.accountId}/renew`,
          params
        )
      );
      this.triggerSuccess(
        `Акаунт успішно продовжено на ${params.months} міс. (до ${res.summary.newValidUntil}, -$${res.summary.costUsd} USD з балансу)`
      );
      return true;
    } catch (err: unknown) {
      const msg = (err as { error?: { error?: string } })?.error?.error || (err instanceof Error ? err.message : 'Помилка');
      this.triggerError(msg);
      return false;
    } finally {
      this.isLoading.set(false);
      await this.refreshAllData(true);
      this.broadcastDataChange();
    }
  }

  async addDeposit(params: {
    amountUsd: number;
    spentUah: number;
    date?: string;
    paymentMethod?: string;
    note?: string;
  }): Promise<boolean> {
    this.isLoading.set(true);
    try {
      await firstValueFrom(this.http.post('/api/budget/deposits', params));
      this.triggerSuccess(`Рахунок поповнено на $${params.amountUsd} (витрачено ${params.spentUah} грн)`);
      return true;
    } catch (err: unknown) {
      const msg = (err as { error?: { error?: string } })?.error?.error || (err instanceof Error ? err.message : 'Помилка');
      this.triggerError(msg);
      return false;
    } finally {
      this.isLoading.set(false);
      await this.refreshAllData(true);
      this.broadcastDataChange();
    }
  }

  async updateDeposit(id: string, updates: Partial<ProviderDeposit>): Promise<boolean> {
    this.isLoading.set(true);
    try {
      await firstValueFrom(this.http.put<ProviderDeposit>(`/api/budget/deposits/${id}`, updates));
      this.triggerSuccess('Запис поповнення оновлено');
      return true;
    } catch (err: unknown) {
      const msg = (err as { error?: { error?: string } })?.error?.error || (err instanceof Error ? err.message : 'Помилка');
      this.triggerError('Помилка оновлення: ' + msg);
      return false;
    } finally {
      this.isLoading.set(false);
      await this.refreshAllData(true);
      this.broadcastDataChange();
    }
  }

  async deleteDeposit(id: string): Promise<void> {
    this.isLoading.set(true);
    try {
      await firstValueFrom(this.http.delete(`/api/budget/deposits/${id}`));
      this.triggerSuccess('Запис поповнення видалено');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Помилка';
      this.triggerError('Помилка: ' + msg);
    } finally {
      this.isLoading.set(false);
      await this.refreshAllData(true);
      this.broadcastDataChange();
    }
  }

  async updateAccountRenewal(
    accountId: string,
    renewalId: string,
    updates: Partial<ProviderAccountRenewal>
  ): Promise<boolean> {
    this.isLoading.set(true);
    try {
      await firstValueFrom(
        this.http.put(`/api/accounts/${accountId}/renewals/${renewalId}`, updates)
      );
      this.triggerSuccess('Запис списання за акаунт оновлено');
      return true;
    } catch (err: unknown) {
      const msg = (err as { error?: { error?: string } })?.error?.error || (err instanceof Error ? err.message : 'Помилка');
      this.triggerError('Помилка: ' + msg);
      return false;
    } finally {
      this.isLoading.set(false);
      await this.refreshAllData(true);
      this.broadcastDataChange();
    }
  }

  async deleteAccountRenewal(accountId: string, renewalId: string): Promise<boolean> {
    this.isLoading.set(true);
    try {
      await firstValueFrom(
        this.http.delete(`/api/accounts/${accountId}/renewals/${renewalId}`)
      );
      this.triggerSuccess('Запис списання видалено');
      return true;
    } catch (err: unknown) {
      const msg = (err as { error?: { error?: string } })?.error?.error || (err instanceof Error ? err.message : 'Помилка');
      this.triggerError('Помилка: ' + msg);
      return false;
    } finally {
      this.isLoading.set(false);
      await this.refreshAllData(true);
      this.broadcastDataChange();
    }
  }

  async addClient(clientData: Partial<Client>): Promise<Client> {
    this.isLoading.set(true);
    try {
      const startDate = clientData.startDate || new Date().toISOString().split('T')[0];
      const monthlyPrice = Number(clientData.monthlyPrice) || this.settings().defaultMonthlyPrice || 160;
      const activeUntil = clientData.activeUntil || addMonthsExact(startDate, 1);

      const payload = {
        ...clientData,
        startDate,
        monthlyPrice,
        activeUntil,
        balance: Number(clientData.balance) || 0,
      };

      const res = await firstValueFrom(this.http.post<Client>('/api/clients', payload));
      res.status = computeClientStatus(res);
      this.clients.update((prev) => [res, ...prev]);
      this.triggerSuccess('Клієнта успішно створено');
      return res;
    } catch {
      // Offline fallback
      const fallback: Client = {
        id: 'c_' + Date.now(),
        fullName: clientData.fullName || 'Новий клієнт',
        phone: clientData.phone || '',
        iptvLogin: clientData.iptvLogin || ('iptv_' + Math.random().toString(36).substring(2, 7)),
        deviceInfo: clientData.deviceInfo || '',
        subscriptionPlan: clientData.subscriptionPlan || '1usd',
        costUsd: clientData.costUsd || (clientData.subscriptionPlan === '2usd' ? 2 : 1),
        monthlyPrice: Number(clientData.monthlyPrice) || 100,
        startDate: clientData.startDate || new Date().toISOString().split('T')[0],
        activeUntil: clientData.activeUntil || addMonthsExact(clientData.startDate || new Date().toISOString().split('T')[0], 1),
        balance: Number(clientData.balance) || 0,
        groupName: clientData.groupName ? clientData.groupName.trim() : undefined,
        groupBalance: clientData.groupBalance !== undefined ? Number(clientData.groupBalance) : (Number(clientData.balance) || 0),
        providerAccountId: clientData.providerAccountId || undefined,
        status: 'active',
        notes: clientData.notes || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      fallback.status = computeClientStatus(fallback);
      this.clients.update((prev) => [fallback, ...prev]);
      this.triggerSuccess('Клієнта збережено');
      return fallback;
    } finally {
      this.isLoading.set(false);
      await this.refreshAllData(true);
      this.broadcastDataChange();
    }
  }

  async updateClient(id: string, updates: Partial<Client>): Promise<void> {
    this.isLoading.set(true);
    try {
      const res = await firstValueFrom(this.http.put<Client>(`/api/clients/${id}`, updates));
      res.status = computeClientStatus(res);
      this.clients.update((list) => list.map((c) => (c.id === id ? res : c)));
      this.triggerSuccess('Дані клієнта оновлено');
    } catch {
      // Local fallback
      this.clients.update((list) =>
        list.map((c) => {
          if (c.id === id) {
            const updated = { ...c, ...updates, updatedAt: new Date().toISOString() };
            updated.status = computeClientStatus(updated);
            return updated;
          }
          return c;
        })
      );
      this.triggerSuccess('Дані оновлено локально');
    } finally {
      this.isLoading.set(false);
      await this.refreshAllData(true);
      this.broadcastDataChange();
    }
  }

  async saveClientGroup(params: {
    groupName: string;
    previousGroupName?: string;
    groupBalance: number;
    clientIds: string[];
  }): Promise<boolean> {
    this.isLoading.set(true);
    try {
      const res = await firstValueFrom(
        this.http.post<{
          success: boolean;
          groupName: string;
          groupBalance: number;
          updatedClients: Client[];
          message?: string;
        }>('/api/clients/group', params, this.getAuthHeaders())
      );
      this.triggerSuccess(
        res.message ||
          (params.groupName
            ? `Групу "${params.groupName}" збережено (баланс групи: ${params.groupBalance} ₴)`
            : 'Групу розформовано')
      );
      return true;
    } catch (err: unknown) {
      const msg =
        (err as { error?: { error?: string } })?.error?.error ||
        (err instanceof Error ? err.message : 'Помилка збереження групи');
      this.triggerError(msg);
      return false;
    } finally {
      this.isLoading.set(false);
      await this.refreshAllData(true);
      this.broadcastDataChange();
    }
  }

  async autoGroupClients(): Promise<boolean> {
    this.isLoading.set(true);
    try {
      const res = await firstValueFrom(
        this.http.post<{
          success: boolean;
          groupsCreated: number;
          clientsUpdated: number;
          message?: string;
        }>('/api/clients/auto-group', {}, this.getAuthHeaders())
      );
      this.triggerSuccess(res.message || `Авто-групування виконано: створено груп ${res.groupsCreated}`);
      return true;
    } catch (err: unknown) {
      const msg =
        (err as { error?: { error?: string } })?.error?.error ||
        (err instanceof Error ? err.message : 'Помилка авто-групування');
      this.triggerError(msg);
      return false;
    } finally {
      this.isLoading.set(false);
      await this.refreshAllData(true);
      this.broadcastDataChange();
    }
  }

  async deleteClient(id: string): Promise<void> {
    this.isLoading.set(true);
    try {
      await firstValueFrom(this.http.delete(`/api/clients/${id}`));
      this.clients.update((list) => list.filter((c) => c.id !== id));
      this.triggerSuccess('Клієнта видалено');
    } catch {
      this.clients.update((list) => list.filter((c) => c.id !== id));
      this.triggerSuccess('Клієнта видалено');
    } finally {
      this.isLoading.set(false);
      await this.refreshAllData(true);
      this.broadcastDataChange();
    }
  }

  /**
   * Process payment / deposit:
   * Adds deposit to leftover balance, calculates whole months of extension,
   * updates activeUntil date date-to-date ("число в число"),
   * updates remaining balance, records transaction!
   */
  async processPayment(params: {
    clientId: string;
    amount: number;
    note?: string;
    sendViberReceipt?: boolean;
    startFromToday?: boolean;
  }): Promise<{ monthsAdded: number; newBalance: number; newActiveUntil: string } | null> {
    this.isLoading.set(true);
    try {
      const res = await firstValueFrom(
        this.http.post<{
          client: Client;
          transaction: PaymentTransaction;
          summary: { monthsAdded: number; newBalance: number; newActiveUntil: string };
        }>(`/api/clients/${params.clientId}/pay`, params)
      );

      res.client.status = computeClientStatus(res.client);
      this.clients.update((list) => list.map((c) => (c.id === params.clientId ? res.client : c)));
      this.payments.update((prev) => [res.transaction, ...prev]);

      this.fetchStats();
      this.fetchAccounts();
      this.fetchBudget();

      this.triggerSuccess(
        `Оплату ${params.amount} грн проведено! Продовжено на ${res.summary.monthsAdded} міс. (до ${res.summary.newActiveUntil}), залишок: ${res.summary.newBalance} грн.`
      );

      return res.summary;
    } catch {
      // Fallback local calculation
      const client = this.clients().find((c) => c.id === params.clientId);
      if (!client) return null;

      const calc = calculateExtension(
        params.startFromToday ? new Date().toISOString().split('T')[0] : client.activeUntil,
        client.monthlyPrice,
        client.balance || 0,
        params.amount
      );

      const transaction: PaymentTransaction = {
        id: 'pay_' + Date.now(),
        clientId: client.id,
        clientName: client.fullName,
        amount: params.amount,
        monthlyPrice: client.monthlyPrice,
        previousBalance: client.balance || 0,
        newBalance: calc.leftoverBalance,
        monthsAdded: calc.monthsAdded,
        previousActiveUntil: client.activeUntil,
        newActiveUntil: calc.newActiveUntil,
        date: new Date().toISOString(),
        note: params.note || `Внесок ${params.amount} грн`,
      };

      const updatedClient: Client = {
        ...client,
        balance: calc.leftoverBalance,
        activeUntil: calc.newActiveUntil,
        status: computeClientStatus({ activeUntil: calc.newActiveUntil }),
        updatedAt: new Date().toISOString(),
      };

      this.clients.update((list) => list.map((c) => (c.id === params.clientId ? updatedClient : c)));
      this.payments.update((prev) => [transaction, ...prev]);

      this.triggerSuccess(
        `Оплату ${params.amount} грн враховано! Продовжено на ${calc.monthsAdded} міс., залишок: ${calc.leftoverBalance} грн.`
      );

      return {
        monthsAdded: calc.monthsAdded,
        newBalance: calc.leftoverBalance,
        newActiveUntil: calc.newActiveUntil,
      };
    } finally {
      this.isLoading.set(false);
      await this.refreshAllData(true);
      this.broadcastDataChange();
    }
  }

  async updatePayment(id: string, updates: Partial<PaymentTransaction> & { syncWithClient?: boolean }): Promise<boolean> {
    this.isLoading.set(true);
    try {
      const res = await firstValueFrom(this.http.put<PaymentTransaction>(`/api/payments/${id}`, updates));
      this.payments.update((list) => list.map((p) => (p.id === id ? res : p)));
      this.triggerSuccess('Запис оплати оновлено');
      return true;
    } catch (err: unknown) {
      const msg = (err as { error?: { error?: string } })?.error?.error || (err instanceof Error ? err.message : 'Помилка');
      this.triggerError('Помилка оновлення: ' + msg);
      return false;
    } finally {
      this.isLoading.set(false);
      await this.refreshAllData(true);
      this.broadcastDataChange();
    }
  }

  async deletePayment(id: string): Promise<boolean> {
    this.isLoading.set(true);
    try {
      await firstValueFrom(this.http.delete(`/api/payments/${id}`));
      this.payments.update((list) => list.filter((p) => p.id !== id));
      this.triggerSuccess('Запис оплати видалено');
      return true;
    } catch (err: unknown) {
      const msg = (err as { error?: { error?: string } })?.error?.error || (err instanceof Error ? err.message : 'Помилка');
      this.triggerError('Помилка видалення: ' + msg);
      return false;
    } finally {
      this.isLoading.set(false);
      await this.refreshAllData(true);
      this.broadcastDataChange();
    }
  }

  async saveSettings(newSettings: Partial<AppSettings>): Promise<void> {
    this.isLoading.set(true);
    try {
      const current = this.settings();
      const payloadTariffs = normalizeUtilityTariffs(newSettings.utilityTariffsSettings || current.utilityTariffsSettings);
      const mergedPayload: Partial<AppSettings> = {
        ...newSettings,
        utilityTariffsSettings: payloadTariffs,
      };

      const res = await firstValueFrom(this.http.post<AppSettings>('/api/settings', mergedPayload, this.getAuthHeaders()));
      const resTariffs = normalizeUtilityTariffs(res.utilityTariffsSettings);
      const merged: AppSettings = { ...this.settings(), ...res, utilityTariffsSettings: resTariffs };
      this.settings.set(merged);
      this.lastSettingsFetchTime = Date.now();
      this.settingsCooldownUntil = 0;
      this.triggerSuccess('Налаштування успішно збережено у базу даних PostgreSQL!');
      this.broadcastDataChange();
    } catch (err: unknown) {
      console.error('Error saving settings to PostgreSQL database:', err);
      const msg =
        (err as { error?: { error?: string } })?.error?.error ||
        (err instanceof Error ? err.message : 'Не вдалося зберегти налаштування в базу даних');
      this.triggerError('Помилка збереження: ' + msg);
      throw err;
    } finally {
      this.isLoading.set(false);
    }
  }

  // Outage schedule display variant (1..10) & cross-tab navigation signals
  readonly requestedAppTab = signal<string | null>(null);
  readonly requestedSettingsModal = signal<string | null>(null);
  readonly localOutageVariantOverride = signal<OutageScheduleViewVariant | null>(null);

  readonly outageScheduleViewVariant = computed<OutageScheduleViewVariant>(() => {
    const localOverride = this.localOutageVariantOverride();
    if (localOverride) return localOverride;

    const user = this.currentUser();
    if (user?.outageScheduleViewVariant) {
      return user.outageScheduleViewVariant as OutageScheduleViewVariant;
    }
    if (user && typeof window !== 'undefined') {
      const stored = localStorage.getItem(`iptv_user_outage_variant_${user.id}`);
      if (stored) return stored as OutageScheduleViewVariant;
    }

    const s = this.settings();
    if (user?.id && s.utilityTariffsSettings?.userOutageVariants?.[user.id]) {
      return s.utilityTariffsSettings.userOutageVariants[user.id] as OutageScheduleViewVariant;
    }
    const fromTariffs = s.utilityTariffsSettings?.outageScheduleViewVariant;
    if (fromTariffs) return fromTariffs;
    if (s.outageScheduleViewVariant) return s.outageScheduleViewVariant as OutageScheduleViewVariant;
    return 'v10_minimal_pills';
  });

  readonly requestedSettingsAccountId = signal<string | null>(null);

  openOutageScheduleSettings(): void {
    this.requestedSettingsModal.set('outage_display');
    this.requestedAppTab.set('settings');
  }

  openOoekCredentialsSettings(accountId?: string): void {
    if (accountId) {
      this.requestedSettingsAccountId.set(accountId);
    }
    this.requestedSettingsModal.set('ooek_credentials');
    this.requestedAppTab.set('settings');
  }

  openOutageScheduleTab(): void {
    this.requestedAppTab.set('outage_schedule');
  }

  openHomeTilesVisibilitySettings(): void {
    this.requestedSettingsModal.set('house_visibility');
    this.requestedAppTab.set('settings');
  }

  // ============================================================================
  // HOME MENU TILES VISIBILITY (SHARED SINGLE SOURCE OF TRUTH WITH SETTINGS)
  // ============================================================================
  readonly hiddenHomeTiles = computed<string[]>(() => {
    const prefs = this.userPersonalSettings().customPreferences;
    const raw = prefs?.['hiddenHomeTiles'];
    if (Array.isArray(raw)) {
      return raw.filter((x): x is string => typeof x === 'string' && x.length > 0);
    }
    return [];
  });

  isHomeTileHidden(tileId: string): boolean {
    return this.hiddenHomeTiles().includes(tileId);
  }

  async toggleHomeTileVisibility(tileId: string): Promise<void> {
    const current = this.hiddenHomeTiles();
    const nextHidden = current.includes(tileId)
      ? current.filter((id) => id !== tileId)
      : [...current, tileId];
    const curPrefs = { ...(this.userPersonalSettings().customPreferences || {}) };
    curPrefs['hiddenHomeTiles'] = nextHidden;

    // Optimistic update for instant UI feedback on both Home & Settings
    this.userPersonalSettings.update((prev) => ({
      ...prev,
      customPreferences: curPrefs,
    }));

    await this.saveUserPersonalSettings({ customPreferences: curPrefs });
  }

  async resetHiddenHomeTiles(): Promise<void> {
    const curPrefs = { ...(this.userPersonalSettings().customPreferences || {}) };
    curPrefs['hiddenHomeTiles'] = [];
    this.userPersonalSettings.update((prev) => ({
      ...prev,
      customPreferences: curPrefs,
    }));
    await this.saveUserPersonalSettings({ customPreferences: curPrefs });
  }

  // ============================================================================
  // SHARED SHOPPING LISTS & QUICK-PICK PRODUCT CATALOG
  // ============================================================================
  readonly shoppingLists = signal<ShoppingList[]>([]);
  readonly shoppingCustomCatalog = signal<ShoppingCatalogItem[]>([]);
  readonly shoppingPeople = signal<ShoppingParticipant[]>([]);
  readonly isShoppingLoading = signal<boolean>(false);

  readonly shoppingCatalog = computed<ShoppingCatalogItem[]>(() => {
    const custom = this.shoppingCustomCatalog();
    const seen = new Set<string>();
    const merged: ShoppingCatalogItem[] = [];
    for (const item of custom) {
      const key = item.name.trim().toLowerCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        merged.push({ ...item, isCustom: true });
      }
    }
    for (const item of DEFAULT_SHOPPING_CATALOG) {
      const key = item.name.trim().toLowerCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        merged.push(item);
      }
    }
    return merged;
  });

  // ============================================================================
  // UNIFIED SERVER-SIDE REAL-TIME SIGNALS (SSE + SMART DEFERRED DIRTY QUEUE)
  // ============================================================================

  readonly activeUiTab = signal<string>('home');

  private appSseAbort: AbortController | null = null;
  private appSseReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private appSseActive = false;
  private appSseReconnectAttempts = 0;
  private appSseLastRev = 0;
  private appSseListenersBound = false;

  private readonly pendingSignalScopes = new Set<
    'shopping' | 'utility' | 'schedule' | 'budget' | 'household' | 'settings' | 'app_release' | 'clients' | 'accounts'
  >();
  private readonly scopeCoalesceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  private readonly handleAppSignalWindowResume = (): void => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      return;
    }
    this.flushPendingSignalScopes(true);
  };

  setActiveUiTab(tab: string): void {
    const clean = (tab || '').trim();
    if (!clean) return;
    this.activeUiTab.set(clean);
    this.flushPendingSignalScopes(false);
  }

  flushSignalScopeIfPending(
    scope: 'shopping' | 'utility' | 'schedule' | 'budget' | 'household' | 'settings' | 'app_release' | 'clients' | 'accounts'
  ): void {
    if (!this.pendingSignalScopes.has(scope)) return;
    this.pendingSignalScopes.delete(scope);
    this.scheduleCoalescedScopeRefresh(scope, 40);
  }

  startAppRealtimeSignals(): void {
    if (typeof window === 'undefined' || !this.isAuthenticated()) return;
    if (!this.appSseListenersBound) {
      this.appSseListenersBound = true;
      document.addEventListener('visibilitychange', this.handleAppSignalWindowResume);
      window.addEventListener('online', this.handleAppSignalWindowResume);
    }
    if (this.appSseActive) return;
    this.appSseActive = true;
    this.appSseReconnectAttempts = 0;
    void this.connectAppSseLoop();
  }

  stopAppRealtimeSignals(): void {
    this.appSseActive = false;
    this.pendingSignalScopes.clear();
    for (const timer of this.scopeCoalesceTimers.values()) {
      clearTimeout(timer);
    }
    this.scopeCoalesceTimers.clear();
    if (this.appSseReconnectTimer) {
      clearTimeout(this.appSseReconnectTimer);
      this.appSseReconnectTimer = null;
    }
    if (this.appSseAbort) {
      this.appSseAbort.abort();
      this.appSseAbort = null;
    }
    if (this.appSseListenersBound && typeof window !== 'undefined') {
      this.appSseListenersBound = false;
      document.removeEventListener('visibilitychange', this.handleAppSignalWindowResume);
      window.removeEventListener('online', this.handleAppSignalWindowResume);
    }
  }

  restartAppRealtimeSignals(): void {
    this.stopAppRealtimeSignals();
    if (this.isAuthenticated()) {
      this.startAppRealtimeSignals();
    }
  }

  // Compatibility wrappers so existing shopping callers delegate to the single unified stream
  startShoppingRealtimeSync(): void {
    this.startAppRealtimeSignals();
    this.flushSignalScopeIfPending('shopping');
  }

  stopShoppingRealtimeSync(): void {
    // No-op: the unified app-wide SSE stream remains active across tab switches
    // and is only stopped on logout() or impersonation switch.
  }

  restartShoppingRealtimeSync(): void {
    this.restartAppRealtimeSignals();
  }

  private async connectAppSseLoop(): Promise<void> {
    if (!this.appSseActive || !this.isAuthenticated() || typeof window === 'undefined') {
      return;
    }
    if (this.appSseAbort) {
      this.appSseAbort.abort();
    }
    const controller = new AbortController();
    this.appSseAbort = controller;

    const headers: Record<string, string> = {
      ...this.getNoCacheAuthHeaders().headers,
      Accept: 'text/event-stream',
      'x-client-instance-id': CLIENT_INSTANCE_ID,
    };
    const impersonateUid = getActiveImpersonateUid();
    if (impersonateUid) {
      headers['x-impersonate-user-id'] = impersonateUid;
    }

    const wasReconnect = this.appSseReconnectAttempts > 0;
    try {
      const response = await fetch('/api/events/stream', {
        method: 'GET',
        headers,
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        if (response.status === 401 || response.status === 403) {
          this.stopAppRealtimeSignals();
          return;
        }
        throw new Error(`App SSE HTTP ${response.status}`);
      }

      this.appSseReconnectAttempts = 0;
      if (wasReconnect) {
        // Reconcile only relevant domains silently after recovering from disconnect
        this.reconcileActiveScopeAfterReconnect();
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (this.appSseActive) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let boundaryIdx = buffer.indexOf('\n\n');
        while (boundaryIdx !== -1) {
          const rawBlock = buffer.slice(0, boundaryIdx);
          buffer = buffer.slice(boundaryIdx + 2);
          this.parseAndDispatchAppSseBlock(rawBlock);
          boundaryIdx = buffer.indexOf('\n\n');
        }
      }
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError' || !this.appSseActive) {
        return;
      }
    } finally {
      if (this.appSseAbort === controller) {
        this.appSseAbort = null;
      }
    }

    if (this.appSseActive && this.isAuthenticated()) {
      this.appSseReconnectAttempts = Math.min(this.appSseReconnectAttempts + 1, 6);
      const delayMs = Math.min(10_000, 1500 * this.appSseReconnectAttempts);
      this.appSseReconnectTimer = setTimeout(() => {
        this.appSseReconnectTimer = null;
        void this.connectAppSseLoop();
      }, delayMs);
    }
  }

  private reconcileActiveScopeAfterReconnect(): void {
    const visible = typeof document === 'undefined' || document.visibilityState === 'visible';
    const tab = this.activeUiTab();
    const scopesToQueue: Array<
      'shopping' | 'utility' | 'schedule' | 'budget' | 'household' | 'settings'
    > = ['shopping', 'utility', 'schedule', 'budget', 'household', 'settings'];

    if (!visible) {
      for (const s of scopesToQueue) {
        this.pendingSignalScopes.add(s);
      }
      return;
    }

    if (tab === 'shopping') {
      this.scheduleCoalescedScopeRefresh('shopping', 120);
    } else if (tab === 'outage_schedule') {
      this.scheduleCoalescedScopeRefresh('schedule', 120);
    } else if (tab === 'electricity' || tab === 'water' || tab === 'waste' || tab === 'water_waste') {
      this.scheduleCoalescedScopeRefresh('utility', 120);
    } else if (tab === 'budget') {
      this.scheduleCoalescedScopeRefresh('budget', 120);
    } else if (tab === 'settings') {
      this.scheduleCoalescedScopeRefresh('settings', 120);
    } else if (tab === 'users' || this.isSharedHouseholdModalOpen()) {
      this.scheduleCoalescedScopeRefresh('household', 120);
    } else {
      // Home dashboard shows summary across utility + schedule + shopping
      this.scheduleCoalescedScopeRefresh('utility', 120);
      this.scheduleCoalescedScopeRefresh('schedule', 220);
      this.scheduleCoalescedScopeRefresh('shopping', 320);
    }
  }

  private parseAndDispatchAppSseBlock(rawBlock: string): void {
    const lines = rawBlock.split('\n');
    let eventName = 'message';
    const dataParts: string[] = [];
    for (const line of lines) {
      if (line.startsWith(':')) continue;
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataParts.push(line.slice(5).trim());
      }
    }
    if (dataParts.length === 0) return;

    if (eventName === 'connected') {
      try {
        const info = JSON.parse(dataParts.join('\n')) as { rev?: number };
        if (typeof info.rev === 'number' && info.rev > this.appSseLastRev) {
          this.appSseLastRev = info.rev;
        }
      } catch {
        // Ignore malformed connected frame
      }
      return;
    }

    if (eventName !== 'app_signal') {
      // Ignore legacy duplicate 'shopping_updated' frames because 'app_signal' carries the same delta
      return;
    }

    try {
      const signalPayload = JSON.parse(dataParts.join('\n')) as {
        scope?:
          | 'shopping'
          | 'utility'
          | 'schedule'
          | 'budget'
          | 'household'
          | 'settings'
          | 'app_release'
          | 'clients'
          | 'accounts';
        action?: string;
        rev?: number;
        updatedAt?: string;
        entityId?: string;
        queueKey?: string;
        originClientId?: string;
        actorUserId?: string;
        data?: {
          type?: string;
          listId?: string;
          list?: ShoppingList;
          catalogItem?: ShoppingCatalogItem | null;
        };
      };
      if (!signalPayload.scope) return;
      if (typeof signalPayload.rev === 'number') {
        if (signalPayload.rev <= this.appSseLastRev) {
          return;
        }
        this.appSseLastRev = signalPayload.rev;
      }

      // Skip echo from this very browser tab (except server-side schedule/release events)
      if (
        signalPayload.originClientId &&
        signalPayload.originClientId === CLIENT_INSTANCE_ID &&
        signalPayload.scope !== 'schedule' &&
        signalPayload.scope !== 'app_release'
      ) {
        return;
      }

      // Shopping delta arrives inline inside the signal — patch signals in-memory with zero extra HTTP requests
      if (signalPayload.scope === 'shopping' && signalPayload.data) {
        this.applyShoppingRealtimeEvent(signalPayload.data);
        return;
      }

      const isVisible = typeof document === 'undefined' || document.visibilityState === 'visible';
      if (isVisible && this.isScopeRelevantToCurrentView(signalPayload.scope)) {
        this.scheduleCoalescedScopeRefresh(signalPayload.scope, 250);
      } else {
        this.pendingSignalScopes.add(signalPayload.scope);
      }
    } catch {
      // Ignore malformed frame
    }
  }

  private isScopeRelevantToCurrentView(
    scope: 'shopping' | 'utility' | 'schedule' | 'budget' | 'household' | 'settings' | 'app_release' | 'clients' | 'accounts'
  ): boolean {
    const tab = this.activeUiTab();
    switch (scope) {
      case 'app_release':
      case 'settings':
        return true;
      case 'household':
        return true;
      case 'shopping':
        return tab === 'shopping' || tab === 'home';
      case 'utility':
        return (
          tab === 'home' ||
          tab === 'electricity' ||
          tab === 'water' ||
          tab === 'waste' ||
          tab === 'water_waste' ||
          tab === 'outage_schedule'
        );
      case 'schedule':
        return tab === 'home' || tab === 'outage_schedule' || tab === 'electricity';
      case 'budget':
        return tab === 'budget' || tab === 'home';
      case 'clients':
        return tab === 'clients' || tab === 'payments' || tab === 'analytics';
      case 'accounts':
        return tab === 'accounts' || tab === 'budget' || tab === 'analytics';
      default:
        return false;
    }
  }

  private flushPendingSignalScopes(onVisibilityResume: boolean): void {
    if (this.pendingSignalScopes.size === 0 || !this.isAuthenticated()) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

    const toRun: Array<
      'shopping' | 'utility' | 'schedule' | 'budget' | 'household' | 'settings' | 'app_release' | 'clients' | 'accounts'
    > = [];

    for (const scope of Array.from(this.pendingSignalScopes)) {
      if (this.isScopeRelevantToCurrentView(scope)) {
        this.pendingSignalScopes.delete(scope);
        toRun.push(scope);
      }
    }

    if (toRun.length === 0) return;

    // Stagger slightly on resume so multiple queued scopes never burst rate limits
    toRun.forEach((scope, idx) => {
      const delay = onVisibilityResume ? 120 + idx * 140 : 60 + idx * 90;
      this.scheduleCoalescedScopeRefresh(scope, delay);
    });
  }

  private scheduleCoalescedScopeRefresh(
    scope: 'shopping' | 'utility' | 'schedule' | 'budget' | 'household' | 'settings' | 'app_release' | 'clients' | 'accounts',
    delayMs = 250
  ): void {
    const existing = this.scopeCoalesceTimers.get(scope);
    if (existing) {
      clearTimeout(existing);
    }
    const timer = setTimeout(() => {
      this.scopeCoalesceTimers.delete(scope);
      void this.executeSilentScopeRefresh(scope);
    }, delayMs);
    this.scopeCoalesceTimers.set(scope, timer);
  }

  private async refreshCurrentUserSilently(): Promise<void> {
    if (!this.isAuthenticated()) return;
    try {
      const res = await firstValueFrom(
        this.http.get<{
          authenticated: boolean;
          user: AppUser | null;
          realAdminUser?: AppUser | null;
          appReleaseInfo?: {
            currentVersion: string;
            previousVersion: string;
            userLastSeenVersion: string;
            dismissedVersion: string;
            shouldShowModal: boolean;
            updatedAt?: string;
            updatedAtKyiv?: string;
            versionTimestamps?: Record<string, string>;
          };
        }>('/api/auth/me', this.getNoCacheAuthHeaders())
      );

      if (res.appReleaseInfo) {
        this.appReleaseInfo.set(res.appReleaseInfo);
        if (res.appReleaseInfo.shouldShowModal) {
          this.isUpdateModalOpen.set(true);
        }
      }

      if (res.authenticated && res.user) {
        this.currentUser.set(res.user);
        if (res.realAdminUser) {
          this.realAdminUser.set(res.realAdminUser);
        }
        if (this.impersonatedUser() && res.user.id === this.impersonatedUser()?.id) {
          this.impersonatedUser.set(res.user);
        }
      }
    } catch {
      // Silent background sync: never disturb user UI on transient failure
    }
  }

  private async executeSilentScopeRefresh(
    scope: 'shopping' | 'utility' | 'schedule' | 'budget' | 'household' | 'settings' | 'app_release' | 'clients' | 'accounts'
  ): Promise<void> {
    if (!this.isAuthenticated()) return;
    if (Date.now() < this.apiRateLimitCooldownUntil) {
      this.pendingSignalScopes.add(scope);
      return;
    }

    try {
      switch (scope) {
        case 'shopping':
          await this.loadShoppingData(true);
          break;
        case 'utility':
          await this.fetchUtilityData(true);
          break;
        case 'schedule': {
          const house = this.activeDtekAccount() || this.utilityAccounts().find((a) => a.type === 'electricity');
          await this.fetchRecentScheduleChanges(false);
          if (house?.city || house?.street || house?.houseNum) {
            await this.fetchDtekShutdowns(house.city, house.street, house.houseNum, false);
          } else {
            await this.fetchDtekShutdowns(undefined, undefined, undefined, false);
          }
          break;
        }
        case 'budget':
          await this.fetchBudget(true);
          break;
        case 'household':
          await Promise.all([
            this.refreshCurrentUserSilently(),
            this.fetchHouseholdInvites(),
            this.isRealAdmin() ? this.fetchUsers() : Promise.resolve(),
          ]);
          break;
        case 'settings':
          await this.fetchSettings(true);
          break;
        case 'app_release':
          await this.refreshCurrentUserSilently();
          break;
        case 'clients':
          await Promise.all([this.fetchClients(true), this.fetchPayments()]);
          break;
        case 'accounts':
          await this.fetchAccounts(true);
          break;
      }
      this.lastAutoSyncTime.set(new Date().toISOString());
    } catch {
      // Silent refresh: never display error toasts for background signals
    }
  }

  private applyShoppingRealtimeEvent(payload: {
    type?: string;
    listId?: string;
    list?: ShoppingList;
    catalogItem?: ShoppingCatalogItem | null;
  }): void {
    const myId = this.currentUser()?.id || '';
    if (!myId) return;

    if (payload.catalogItem) {
      const cat = payload.catalogItem;
      this.shoppingCustomCatalog.update((prev) =>
        prev.some((c) => c.id === cat.id || c.name.toLowerCase() === cat.name.toLowerCase())
          ? prev
          : [cat, ...prev]
      );
    }

    if (payload.type === 'list:deleted' && payload.listId) {
      this.shoppingLists.update((prev) => prev.filter((l) => l.id !== payload.listId));
      return;
    }

    if (payload.list) {
      const incoming = payload.list;
      const canSee =
        incoming.ownerUserId === myId ||
        (Array.isArray(incoming.participantIds) && incoming.participantIds.includes(myId));

      if (!canSee) {
        this.shoppingLists.update((prev) => prev.filter((l) => l.id !== incoming.id));
        return;
      }

      // Idempotent upsert + ignore stale out-of-order frames + keep newest-updated lists first
      this.shoppingLists.update((prev) => {
        const existing = prev.find((l) => l.id === incoming.id);
        if (
          existing &&
          existing.updatedAt &&
          incoming.updatedAt &&
          String(existing.updatedAt) > String(incoming.updatedAt)
        ) {
          return prev;
        }
        const next = existing
          ? prev.map((l) => (l.id === incoming.id ? incoming : l))
          : [incoming, ...prev];
        return [...next].sort((a, b) =>
          String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
        );
      });
    }
  }

  async loadShoppingData(silent = false): Promise<void> {
    if (!this.isAuthenticated()) return;
    if (this.inFlightShoppingPromise) return this.inFlightShoppingPromise;
    const showSpinner = !silent && this.shoppingLists().length === 0;
    if (showSpinner) this.isShoppingLoading.set(true);
    this.inFlightShoppingPromise = (async () => {
      try {
        const res = await firstValueFrom(
          this.http.get<ShoppingDataResponse>('/api/shopping/data', this.getNoCacheAuthHeaders())
        );
        this.shoppingLists.set(Array.isArray(res.lists) ? res.lists : []);
        this.shoppingCustomCatalog.set(Array.isArray(res.catalog) ? res.catalog : []);
        this.shoppingPeople.set(Array.isArray(res.people) ? res.people : []);
      } catch (err) {
        if (!silent) {
          console.warn('Failed to load shopping data:', err);
          this.showError('Не вдалося завантажити списки покупок');
        }
      } finally {
        if (showSpinner) this.isShoppingLoading.set(false);
        this.inFlightShoppingPromise = null;
      }
    })();
    return this.inFlightShoppingPromise;
  }

  async createShoppingList(payload: {
    title: string;
    budgetUah: number | null;
    participantIds: string[];
  }): Promise<ShoppingList | null> {
    try {
      const created = await firstValueFrom(
        this.http.post<ShoppingList>('/api/shopping/lists', payload, this.getAuthHeaders())
      );
      this.shoppingLists.update((prev) => [created, ...prev.filter((l) => l.id !== created.id)]);
      this.showSuccess(`Список «${created.title}» створено`);
      return created;
    } catch (err) {
      console.error('Create shopping list error:', err);
      this.showError('Не вдалося створити список покупок');
      return null;
    }
  }

  async carryOverShoppingList(
    sourceListId: string,
    payload: {
      title: string;
      budgetUah: number | null;
      itemIds: string[];
      removeFromSource: boolean;
    }
  ): Promise<ShoppingList | null> {
    try {
      const res = await firstValueFrom(
        this.http.post<{ newList: ShoppingList; sourceList?: ShoppingList }>(
          `/api/shopping/lists/${encodeURIComponent(sourceListId)}/carry-over`,
          payload,
          this.getAuthHeaders()
        )
      );
      if (res?.newList) {
        this.shoppingLists.update((prev) => {
          const updatedSourceList = prev.map((l) =>
            res.sourceList && l.id === sourceListId ? res.sourceList : l
          );
          return [res.newList, ...updatedSourceList.filter((l) => l.id !== res.newList.id)];
        });
        this.showSuccess(`Залишок перенесено у новий список «${res.newList.title}»`);
        return res.newList;
      }
      return null;
    } catch (err) {
      console.error('Carry over shopping list error:', err);
      this.showError('Не вдалося перенести залишок у новий список');
      return null;
    }
  }

  async updateShoppingList(
    listId: string,
    payload: { title?: string; budgetUah?: number | null; participantIds?: string[]; isInactive?: boolean },
    successMessage?: string
  ): Promise<ShoppingList | null> {
    try {
      const updated = await firstValueFrom(
        this.http.put<ShoppingList>(
          `/api/shopping/lists/${encodeURIComponent(listId)}`,
          payload,
          this.getAuthHeaders()
        )
      );
      this.shoppingLists.update((prev) => prev.map((l) => (l.id === listId ? updated : l)));
      if (successMessage) {
        this.triggerSuccess(successMessage);
      }
      return updated;
    } catch (err) {
      console.error('Update shopping list error:', err);
      this.showError('Не вдалося оновити список покупок');
      return null;
    }
  }

  async deleteShoppingList(listId: string): Promise<boolean> {
    try {
      await firstValueFrom(
        this.http.delete(
          `/api/shopping/lists/${encodeURIComponent(listId)}`,
          this.getAuthHeaders()
        )
      );
      this.shoppingLists.update((prev) => prev.filter((l) => l.id !== listId));
      this.showSuccess('Список покупок видалено');
      return true;
    } catch (err) {
      console.error('Delete shopping list error:', err);
      this.showError('Не вдалося видалити список покупок');
      return false;
    }
  }

  async addShoppingItem(
    listId: string,
    payload: {
      name: string;
      category?: ShoppingCategoryId;
      quantity?: number;
      unit?: string;
      priceMode?: ShoppingPriceMode;
      weightGrams?: number | null;
      price?: number | null;
      isBought?: boolean;
      addToCatalog?: boolean;
    }
  ): Promise<ShoppingItem | null> {
    try {
      const res = await firstValueFrom(
        this.http.post<{
          item: ShoppingItem;
          list: ShoppingList;
          catalogItem?: ShoppingCatalogItem | null;
        }>(
          `/api/shopping/lists/${encodeURIComponent(listId)}/items`,
          payload,
          this.getAuthHeaders()
        )
      );
      if (res.list) {
        this.shoppingLists.update((prev) => prev.map((l) => (l.id === listId ? res.list : l)));
      }
      if (res.catalogItem) {
        const addedCat = res.catalogItem;
        this.shoppingCustomCatalog.update((prev) =>
          prev.some((c) => c.id === addedCat.id || c.name.toLowerCase() === addedCat.name.toLowerCase())
            ? prev
            : [addedCat, ...prev]
        );
      }
      return res.item;
    } catch (err) {
      console.error('Add shopping item error:', err);
      this.showError('Не вдалося додати товар у список');
      return null;
    }
  }

  async updateShoppingItem(
    listId: string,
    itemId: string,
    payload: Partial<{
      name: string;
      category: ShoppingCategoryId;
      quantity: number;
      unit: string;
      priceMode: ShoppingPriceMode;
      weightGrams: number | null;
      price: number | null;
      isBought: boolean;
    }>
  ): Promise<ShoppingItem | null> {
    // Optimistic update for responsive price & checkbox changes
    this.shoppingLists.update((prev) =>
      prev.map((l) =>
        l.id === listId
          ? {
              ...l,
              items: l.items.map((it) => (it.id === itemId ? { ...it, ...payload } : it)),
            }
          : l
      )
    );
    try {
      const res = await firstValueFrom(
        this.http.put<{ item: ShoppingItem; list: ShoppingList }>(
          `/api/shopping/lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(itemId)}`,
          payload,
          this.getAuthHeaders()
        )
      );
      if (res.list) {
        this.shoppingLists.update((prev) => prev.map((l) => (l.id === listId ? res.list : l)));
      }
      return res.item;
    } catch (err) {
      console.error('Update shopping item error:', err);
      this.showError('Не вдалося оновити товар');
      void this.loadShoppingData(true);
      return null;
    }
  }

  async deleteShoppingItem(listId: string, itemId: string): Promise<boolean> {
    this.shoppingLists.update((prev) =>
      prev.map((l) =>
        l.id === listId ? { ...l, items: l.items.filter((it) => it.id !== itemId) } : l
      )
    );
    try {
      const res = await firstValueFrom(
        this.http.delete<{ success: boolean; list?: ShoppingList }>(
          `/api/shopping/lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(itemId)}`,
          this.getAuthHeaders()
        )
      );
      if (res.list) {
        this.shoppingLists.update((prev) => prev.map((l) => (l.id === listId ? res.list! : l)));
      }
      return true;
    } catch (err) {
      console.error('Delete shopping item error:', err);
      this.showError('Не вдалося видалити товар');
      void this.loadShoppingData(true);
      return false;
    }
  }

  async addShoppingCatalogProduct(payload: {
    name: string;
    category: ShoppingCategoryId;
    defaultUnit?: string;
  }): Promise<ShoppingCatalogItem | null> {
    try {
      const res = await firstValueFrom(
        this.http.post<{ catalogItem: ShoppingCatalogItem | null; catalog: ShoppingCatalogItem[] }>(
          '/api/shopping/catalog',
          payload,
          this.getAuthHeaders()
        )
      );
      if (Array.isArray(res.catalog)) {
        this.shoppingCustomCatalog.set(res.catalog);
      }
      return res.catalogItem;
    } catch (err) {
      console.error('Add catalog product error:', err);
      return null;
    }
  }

  async setOutageScheduleViewVariant(variant: OutageScheduleViewVariant, persist = true): Promise<void> {
    this.localOutageVariantOverride.set(variant);
    const user = this.currentUser();
    if (user && typeof window !== 'undefined') {
      try {
        localStorage.setItem(`iptv_user_outage_variant_${user.id}`, variant);
      } catch {
        // ignore
      }
    }

    if (user) {
      const updatedUser: AppUser = { ...user, outageScheduleViewVariant: variant };
      this.currentUser.set(updatedUser);
    }

    if (!persist) return;

    try {
      await firstValueFrom(
        this.http.put<{ success: boolean; user: AppUser }>(
          '/api/auth/preferences',
          { outageScheduleViewVariant: variant },
          this.getAuthHeaders()
        )
      );
      this.triggerSuccess('Ваш персональний вигляд графіку збережено');
    } catch (err) {
      console.warn('Could not save user preference to backend:', err);
    }

    if (this.canEdit()) {
      const current = this.settings();
      const currentTariffs = normalizeUtilityTariffs(current.utilityTariffsSettings);
      const userVariants = { ...(currentTariffs.userOutageVariants || {}) };
      if (user?.id) {
        userVariants[user.id] = variant;
      }
      void this.saveSettings({
        ...current,
        outageScheduleViewVariant: variant,
        utilityTariffsSettings: {
          ...currentTariffs,
          outageScheduleViewVariant: variant,
          userOutageVariants: userVariants,
        },
      }).catch((e) => console.warn('Could not update global settings fallback:', e));
    }
  }


  // Custom Ledger Entries CRUD
  async addLedgerEntry(entry: Partial<BudgetLedgerItem>): Promise<boolean> {
    this.isLoading.set(true);
    try {
      await firstValueFrom(this.http.post<BudgetLedgerItem>('/api/budget/ledger', entry, this.getAuthHeaders()));
      this.triggerSuccess('Запис успішно додано до журналу руху коштів!');
      return true;
    } catch (err: unknown) {
      const msg = (err as { error?: { error?: string } })?.error?.error || (err instanceof Error ? err.message : 'Помилка');
      this.triggerError('Помилка додавання запису: ' + msg);
      return false;
    } finally {
      this.isLoading.set(false);
      await this.refreshAllData(true);
      this.broadcastDataChange();
    }
  }

  async updateLedgerEntry(id: string, updates: Partial<BudgetLedgerItem>): Promise<boolean> {
    this.isLoading.set(true);
    try {
      await firstValueFrom(this.http.put<BudgetLedgerItem>(`/api/budget/ledger/${id}`, updates, this.getAuthHeaders()));
      this.triggerSuccess('Запис журналу оновлено');
      return true;
    } catch (err: unknown) {
      const msg = (err as { error?: { error?: string } })?.error?.error || (err instanceof Error ? err.message : 'Помилка');
      this.triggerError('Помилка оновлення: ' + msg);
      return false;
    } finally {
      this.isLoading.set(false);
      await this.refreshAllData(true);
      this.broadcastDataChange();
    }
  }

  async deleteLedgerEntry(id: string): Promise<boolean> {
    this.isLoading.set(true);
    try {
      await firstValueFrom(this.http.delete(`/api/budget/ledger/${id}`, this.getAuthHeaders()));
      this.triggerSuccess('Запис журналу видалено');
      return true;
    } catch (err: unknown) {
      const msg = (err as { error?: { error?: string } })?.error?.error || (err instanceof Error ? err.message : 'Помилка');
      this.triggerError('Помилка видалення: ' + msg);
      return false;
    } finally {
      this.isLoading.set(false);
      await this.refreshAllData(true);
      this.broadcastDataChange();
    }
  }

  // Provider Balance Adjustments & Calibrations
  async adjustProviderBalance(params: {
    amountUsd?: number;
    targetBalanceUsd?: number;
    note?: string;
    date?: string;
  }): Promise<boolean> {
    this.isLoading.set(true);
    try {
      await firstValueFrom(this.http.post('/api/budget/provider-balance/adjust', params, this.getAuthHeaders()));
      this.triggerSuccess('Баланс провайдера успішно скориговано!');
      return true;
    } catch (err: unknown) {
      const msg = (err as { error?: { error?: string } })?.error?.error || (err instanceof Error ? err.message : 'Помилка');
      this.triggerError('Помилка коригування балансу: ' + msg);
      return false;
    } finally {
      this.isLoading.set(false);
      await this.refreshAllData(true);
      this.broadcastDataChange();
    }
  }

  async deleteProviderAdjustment(id: string): Promise<boolean> {
    this.isLoading.set(true);
    try {
      await firstValueFrom(this.http.delete(`/api/budget/provider-balance/adjust/${id}`, this.getAuthHeaders()));
      this.triggerSuccess('Запис коригування балансу видалено');
      return true;
    } catch (err: unknown) {
      const msg = (err as { error?: { error?: string } })?.error?.error || (err instanceof Error ? err.message : 'Помилка');
      this.triggerError('Помилка видалення: ' + msg);
      return false;
    } finally {
      this.isLoading.set(false);
      await this.refreshAllData(true);
      this.broadcastDataChange();
    }
  }

  // Utility APIs (Electricity, Water, Waste)
  async fetchUtilityData(force = true): Promise<void> {
    if (Date.now() < this.apiRateLimitCooldownUntil) return;
    if (
      !force &&
      this.utilityAccounts().length > 0 &&
      Date.now() - this.lastUtilityFetchTime < 15_000
    ) {
      return;
    }
    if (this.inFlightUtilityPromise) return this.inFlightUtilityPromise;
    this.inFlightUtilityPromise = (async () => {
      try {
        const data = await firstValueFrom(
          this.http.get<{ accounts: UtilityAccount[]; readings: UtilityReading[] }>('/api/utility/data', this.getAuthHeaders())
        );
        if (data) {
          this.lastUtilityFetchTime = Date.now();
          if (Array.isArray(data.accounts)) {
            this.utilityAccounts.set(data.accounts);

            // Automatically resolve single or default house and fetch DTEK schedule for its address
            const elecAccs = data.accounts.filter((a) => a.type === 'electricity');
            if (elecAccs.length > 0) {
              const userDefaultId = this.currentUser()?.defaultUtilityAccountId;
              const currentSelectedId = this.selectedDtekAccountId();
              let resolvedAcc = elecAccs[0];
              if (elecAccs.length === 1) {
                resolvedAcc = elecAccs[0];
              } else if (currentSelectedId && elecAccs.some((a) => a.id === currentSelectedId)) {
                resolvedAcc = elecAccs.find((a) => a.id === currentSelectedId)!;
              } else if (userDefaultId && elecAccs.some((a) => a.id === userDefaultId)) {
                resolvedAcc = elecAccs.find((a) => a.id === userDefaultId)!;
              }
              this.selectedDtekAccountId.set(resolvedAcc.id);
              const city = resolvedAcc.city || 'с-ще Окни';
              const street = resolvedAcc.street || 'вул. Шкільна';
              const house = resolvedAcc.houseNum || '11';
              const currentInfo = this.dtekShutdownInfo();
              if (
                !currentInfo ||
                currentInfo.city !== city ||
                currentInfo.street !== street ||
                currentInfo.houseNum !== house
              ) {
                void this.fetchDtekShutdowns(city, street, house);
              }
            }
          }
          if (Array.isArray(data.readings)) {
            this.utilityReadings.set(data.readings);
          }
          this.evaluateMeterReadingReminder();
        }
      } catch (err) {
        if (this.isRateLimitError(err)) {
          this.activateRateLimitCooldown();
        } else {
          console.warn('Error fetching utility data:', err);
        }
      } finally {
        this.inFlightUtilityPromise = null;
      }
    })();
    return this.inFlightUtilityPromise;
  }

  async selectDtekAccountForSchedule(accountId: string): Promise<void> {
    this.selectedDtekAccountId.set(accountId);
    const acc = this.electricityAccounts().find((a) => a.id === accountId);
    if (acc) {
      const city = acc.city || 'с-ще Окни';
      const street = acc.street || 'вул. Шкільна';
      const house = acc.houseNum || '11';
      await this.fetchDtekShutdowns(city, street, house, false);
    }
  }

  async setDefaultUtilityAccount(accountId: string): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    this.isSavingDefaultHouse.set(true);
    this.selectedDtekAccountId.set(accountId);

    // Immediate optimistic update for currentUser and usersList
    const curr = this.currentUser();
    if (curr) {
      const updatedCurr: AppUser = { ...curr, defaultUtilityAccountId: accountId };
      this.currentUser.set(updatedCurr);
      if (this.impersonatedUser()?.id === curr.id) {
        this.impersonatedUser.set(updatedCurr);
      } else {
        try {
          sessionStorage.setItem('homehub_gauth3_user', JSON.stringify(updatedCurr));
        } catch {
          // ignore storage errors
        }
      }
      this.usersList.update((list) =>
        list.map((u) => (u.id === curr.id ? { ...u, defaultUtilityAccountId: accountId } : u))
      );
    }

    try {
      const res = await firstValueFrom(
        this.http.post<{
          success: boolean;
          user: AppUser;
          defaultUtilityAccountId: string | null;
          message?: string;
        }>('/api/auth/default-house', { defaultUtilityAccountId: accountId }, this.getAuthHeaders())
      );

      if (res?.user) {
        if (this.impersonatedUser() && res.user.id === this.impersonatedUser()?.id) {
          const merged = { ...this.impersonatedUser()!, ...res.user };
          this.impersonatedUser.set(merged);
          this.currentUser.set(merged);
        } else {
          this.currentUser.set(res.user);
          try {
            sessionStorage.setItem('homehub_gauth3_user', JSON.stringify(res.user));
          } catch {
            // ignore
          }
        }
        this.usersList.update((list) =>
          list.map((u) => (u.id === res.user.id ? { ...u, ...res.user } : u))
        );
      }

      const acc = this.electricityAccounts().find((a) => a.id === accountId);
      if (acc) {
        const city = acc.city || 'с-ще Окни';
        const street = acc.street || 'вул. Шкільна';
        const house = acc.houseNum || '11';
        await this.fetchDtekShutdowns(city, street, house, false);
      }

      this.triggerSuccess(res?.message || 'Адресу за замовчуванням збережено в базі даних!');
      this.broadcastDataChange();
      return true;
    } catch {
      const acc = this.electricityAccounts().find((a) => a.id === accountId);
      if (acc) {
        const city = acc.city || 'с-ще Окни';
        const street = acc.street || 'вул. Шкільна';
        const house = acc.houseNum || '11';
        await this.fetchDtekShutdowns(city, street, house, false);
      }
      this.triggerSuccess('Адресу за замовчуванням збережено!');
      this.broadcastDataChange();
      return true;
    } finally {
      this.isSavingDefaultHouse.set(false);
    }
  }

  async saveCabinetCredentials(
    accountId: string,
    payload: {
      dtekLogin?: string;
      dtekPassword?: string;
      clearDtekPassword?: boolean;
      ooekLogin?: string;
      ooekPassword?: string;
      clearOoekPassword?: boolean;
      ooekAccountNumber?: string;
    }
  ): Promise<UtilityAccount | null> {
    this.isLoading.set(true);
    try {
      const res = await firstValueFrom(
        this.http.post<{ success: boolean; account: UtilityAccount; message?: string }>(
          `/api/utility/accounts/${accountId}/cabinet-credentials`,
          payload,
          this.getAuthHeaders()
        )
      );
      if (res?.account) {
        this.utilityAccounts.update((list) =>
          list.map((a) => (a.id === res.account.id ? res.account : a))
        );
      }
      this.triggerSuccess(res?.message || 'Облікові дані зашифровано (AES-256-GCM) та збережено!');
      return res?.account || null;
    } catch (err: unknown) {
      const httpErr = err as { error?: { error?: string }; message?: string };
      const msg = httpErr?.error?.error || httpErr?.message || 'Помилка збереження облікових даних';
      this.triggerError(msg);
      return null;
    } finally {
      this.isLoading.set(false);
    }
  }

  async syncOoekCabinet(
    accountId: string,
    payload?: { ooekLogin?: string; ooekPassword?: string; ooekAccountNumber?: string }
  ): Promise<{
    success: boolean;
    amountToPayUah?: number | null;
    statusMessage?: string;
    account?: UtilityAccount;
    message?: string;
  }> {
    this.isLoading.set(true);
    try {
      const res = await firstValueFrom(
        this.http.post<{
          success: boolean;
          amountToPayUah?: number | null;
          statusMessage?: string;
          account?: UtilityAccount;
          message?: string;
          error?: string;
        }>(`/api/utility/accounts/${accountId}/ooek-sync`, payload || {}, this.getAuthHeaders())
      );
      if (res?.account) {
        this.utilityAccounts.update((list) =>
          list.map((a) => (a.id === res.account!.id ? res.account! : a))
        );
      }
      if (res?.amountToPayUah !== undefined && res.amountToPayUah !== null && res.amountToPayUah <= 0) {
        const todayStr = new Date().toISOString().split('T')[0];
        this.utilityReadings.update((list) =>
          list.map((r) => {
            if (
              r.accountId === accountId &&
              (r.utilityType === 'electricity' || !r.utilityType) &&
              !r.isControlOnly &&
              !r.isPaid
            ) {
              return { ...r, isPaid: true, paidAmount: r.totalCost, paidDate: todayStr };
            }
            return r;
          })
        );
      }
      if (res?.success) {
        this.triggerSuccess(res.message || 'Дані з кабінету ТОВ «ООЕК» оновлено!');
      } else if (res?.statusMessage || res?.error) {
        this.triggerError(res.statusMessage || res.error || 'Помилка синхронізації ООЕК');
      }
      return res;
    } catch (err: unknown) {
      const httpErr = err as { error?: { error?: string; statusMessage?: string; account?: UtilityAccount }; message?: string };
      if (httpErr?.error?.account) {
        this.utilityAccounts.update((list) =>
          list.map((a) => (a.id === httpErr.error!.account!.id ? httpErr.error!.account! : a))
        );
      }
      const msg = httpErr?.error?.error || httpErr?.error?.statusMessage || httpErr?.message || 'Помилка підключення до кабінету ООЕК';
      this.triggerError(msg);
      return { success: false, statusMessage: msg };
    } finally {
      this.isLoading.set(false);
    }
  }

  async getOoekPortmonePaymentLink(
    accountId: string,
    payload?: {
      amountUah?: number | null;
      description?: string;
      address?: string;
      payeeId?: string;
      attribute3?: string;
      tryOndo?: boolean;
      decodeUrl?: string;
    }
  ): Promise<{
    success: boolean;
    paymentLink?: string;
    rawQuery?: string;
    payeeId?: string;
    descriptionSlash?: string;
    contractNumber12?: string;
    amountUah?: number;
    amountFormatted?: string;
    address?: string;
    attribute3?: string;
    source?: 'ondo_live' | 'local_gzip';
    consumer?: Record<string, unknown> | null;
    ondoError?: string | null;
    decoded?: {
      rawQuery: string;
      params: Record<string, string>;
      payeeId: string;
      description: string;
      amount: string;
      attribute1: string;
      attribute2: string;
      attribute3: string;
      attribute4: string;
    };
    error?: string;
  }> {
    try {
      return await firstValueFrom(
        this.http.post<{
          success: boolean;
          paymentLink?: string;
          rawQuery?: string;
          payeeId?: string;
          descriptionSlash?: string;
          contractNumber12?: string;
          amountUah?: number;
          amountFormatted?: string;
          address?: string;
          attribute3?: string;
          source?: 'ondo_live' | 'local_gzip';
          consumer?: Record<string, unknown> | null;
          ondoError?: string | null;
          decoded?: {
            rawQuery: string;
            params: Record<string, string>;
            payeeId: string;
            description: string;
            amount: string;
            attribute1: string;
            attribute2: string;
            attribute3: string;
            attribute4: string;
          };
          error?: string;
        }>(`/api/utility/accounts/${accountId}/portmone-link`, payload || {}, this.getAuthHeaders())
      );
    } catch (err: unknown) {
      const httpErr = err as { error?: { error?: string }; message?: string };
      return {
        success: false,
        error: httpErr?.error?.error || httpErr?.message || 'Не вдалося сформувати посилання Portmone',
      };
    }
  }

  async syncDtekCabinet(
    accountId: string,
    payload?: { dtekLogin?: string; dtekPassword?: string }
  ): Promise<{
    success: boolean;
    wafBlocked?: boolean;
    statusMessage?: string;
    account?: UtilityAccount;
    message?: string;
  }> {
    this.isLoading.set(true);
    try {
      const res = await firstValueFrom(
        this.http.post<{
          success: boolean;
          wafBlocked?: boolean;
          statusMessage?: string;
          account?: UtilityAccount;
          message?: string;
        }>(`/api/utility/accounts/${accountId}/dtek-cabinet-sync`, payload || {}, this.getAuthHeaders())
      );
      if (res?.account) {
        this.utilityAccounts.update((list) =>
          list.map((a) => (a.id === res.account!.id ? res.account! : a))
        );
      }
      if (res?.success) {
        this.triggerSuccess(res.message || res.statusMessage || 'Кабінет ДТЕК синхронізовано!');
      } else if (res?.statusMessage) {
        this.triggerSuccess(res.statusMessage);
      }
      return res;
    } catch (err: unknown) {
      const httpErr = err as { error?: { error?: string; statusMessage?: string; account?: UtilityAccount }; message?: string };
      if (httpErr?.error?.account) {
        this.utilityAccounts.update((list) =>
          list.map((a) => (a.id === httpErr.error!.account!.id ? httpErr.error!.account! : a))
        );
      }
      const msg = httpErr?.error?.error || httpErr?.error?.statusMessage || httpErr?.message || 'Помилка синхронізації з кабінетом ДТЕК';
      this.triggerError(msg);
      return { success: false, statusMessage: msg };
    } finally {
      this.isLoading.set(false);
    }
  }

  async submitReadingToDtekCabinet(
    accountId: string,
    payload: { readingT1: number; readingT2?: number | null; date?: string }
  ): Promise<{ success: boolean; reading?: UtilityReading; message?: string }> {
    this.isLoading.set(true);
    try {
      const res = await firstValueFrom(
        this.http.post<{
          success: boolean;
          reading?: UtilityReading;
          account?: UtilityAccount;
          message?: string;
        }>(`/api/utility/accounts/${accountId}/dtek-cabinet-submit`, payload, this.getAuthHeaders())
      );
      if (res?.reading) {
        this.utilityReadings.update((list) => [res.reading!, ...list]);
      }
      if (res?.account) {
        this.utilityAccounts.update((list) =>
          list.map((a) => (a.id === res.account!.id ? res.account! : a))
        );
      }
      this.triggerSuccess(res?.message || 'Покази зафіксовано та відправлено!');
      return res;
    } catch (err: unknown) {
      const httpErr = err as { error?: { error?: string }; message?: string };
      const msg = httpErr?.error?.error || httpErr?.message || 'Помилка передачі показів';
      this.triggerError(msg);
      return { success: false, message: msg };
    } finally {
      this.isLoading.set(false);
    }
  }

  async saveUtilityAccount(account: Partial<UtilityAccount>): Promise<UtilityAccount> {
    this.isLoading.set(true);
    try {
      const res = await firstValueFrom(
        this.http.post<{ success: boolean; account: UtilityAccount; user?: AppUser }>(
          '/api/utility/accounts',
          account,
          this.getAuthHeaders()
        )
      );
      const saved = res.account;
      this.utilityAccounts.update((list) => {
        const idx = list.findIndex((a) => a.id === saved.id);
        if (idx >= 0) {
          const next = [...list];
          next[idx] = saved;
          return next;
        }
        return [...list, saved];
      });
      if (res.user) {
        this.currentUser.set(res.user);
        if (this.impersonatedUser()?.id === res.user.id) {
          this.impersonatedUser.set(res.user);
        } else if (typeof sessionStorage !== 'undefined' && res.user.id !== 'user_test_sandbox') {
          sessionStorage.setItem('homehub_gauth3_user', JSON.stringify(res.user));
        }
      }
      if (this.isRealAdmin()) {
        void this.fetchAdminUtilityAccounts();
      }
      this.triggerSuccess('Будинок успішно збережено!');
      this.broadcastDataChange();
      return saved;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Помилка збереження будинку';
      this.triggerError(msg);
      throw err;
    } finally {
      this.isLoading.set(false);
    }
  }

  async deleteUtilityAccount(id: string): Promise<void> {
    this.isLoading.set(true);
    try {
      await firstValueFrom(
        this.http.delete(`/api/utility/accounts/${id}`, this.getAuthHeaders())
      );
      this.utilityAccounts.update((list) => list.filter((a) => a.id !== id));
      this.utilityReadings.update((list) => list.filter((r) => r.accountId !== id));
      this.triggerSuccess('Акаунт та всі пов\'язані покази видалено');
      this.broadcastDataChange();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Помилка видалення акаунта';
      this.triggerError(msg);
      throw err;
    } finally {
      this.isLoading.set(false);
    }
  }

  async saveUtilityReading(reading: Partial<UtilityReading>): Promise<UtilityReading> {
    this.isLoading.set(true);
    try {
      let res: { success: boolean; reading: UtilityReading };
      if (reading.id) {
        res = await firstValueFrom(
          this.http.put<{ success: boolean; reading: UtilityReading }>(
            `/api/utility/readings/${reading.id}`,
            reading,
            this.getAuthHeaders()
          )
        );
      } else {
        res = await firstValueFrom(
          this.http.post<{ success: boolean; reading: UtilityReading }>(
            '/api/utility/readings',
            reading,
            this.getAuthHeaders()
          )
        );
      }
      const saved = res.reading;
      this.utilityReadings.update((list) => {
        const idx = list.findIndex((r) => r.id === saved.id);
        if (idx >= 0) {
          const next = [...list];
          next[idx] = saved;
          return next;
        }
        return [saved, ...list];
      });
      this.evaluateMeterReadingReminder();
      this.triggerSuccess(reading.id ? 'Запис показів успішно оновлено!' : 'Покази лічильника успішно збережено!');
      this.broadcastDataChange();
      return saved;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Помилка збереження показів';
      this.triggerError(msg);
      throw err;
    } finally {
      this.isLoading.set(false);
    }
  }

  async deleteUtilityReading(id: string): Promise<void> {
    this.isLoading.set(true);
    try {
      await firstValueFrom(
        this.http.delete(`/api/utility/readings/${id}`, this.getAuthHeaders())
      );
      this.utilityReadings.update((list) => list.filter((r) => r.id !== id));
      this.evaluateMeterReadingReminder();
      this.triggerSuccess('Запис показів видалено');
      this.broadcastDataChange();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Помилка видалення запису';
      this.triggerError(msg);
      throw err;
    } finally {
      this.isLoading.set(false);
    }
  }

  async markUtilityReadingPaid(id: string, isPaid: boolean, paidAmount?: number, paidDate?: string): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http.post<{ success: boolean; reading: UtilityReading }>(
          `/api/utility/readings/${id}/pay`,
          { isPaid, paidAmount, paidDate },
          this.getAuthHeaders()
        )
      );
      const saved = res.reading;
      this.utilityReadings.update((list) => {
        const idx = list.findIndex((r) => r.id === saved.id);
        if (idx >= 0) {
          const next = [...list];
          next[idx] = saved;
          return next;
        }
        return list;
      });
      this.triggerSuccess(isPaid ? 'Оплату зафіксовано!' : 'Статус оплати скасовано');
      this.broadcastDataChange();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Помилка оновлення оплати';
      this.triggerError(msg);
    }
  }

  async updateUtilityTariffs(
    tariffs: Partial<UtilityTariffsSettings>,
    options?: { forceSystem?: boolean; targetUserId?: string }
  ): Promise<void> {
    const forceSystem = Boolean(options?.forceSystem);
    const targetUserId = options?.targetUserId;

    if (forceSystem && this.isAdmin()) {
      const current = this.settings();
      const currentTariffs = current.utilityTariffsSettings || DEFAULT_UTILITY_TARIFFS;
      const mergedTariffs: UtilityTariffsSettings = normalizeUtilityTariffs({
        ...currentTariffs,
        ...tariffs,
      });
      await this.saveSettings({
        utilityTariffsSettings: mergedTariffs,
      });
      await this.fetchSettings(true);
      return;
    }

    const baseTariffs = targetUserId
      ? this.getUserEffectiveTariffs(targetUserId)
      : this.utilityTariffs();
    const merged = normalizeUtilityTariffs({
      ...baseTariffs,
      ...tariffs,
    });

    const userPatch: Partial<UserPersonalSettings> = {};
    if (tariffs.electricitySingle !== undefined || tariffs.electricityDual !== undefined) {
      userPatch.electricityTariffs = {
        electricitySingle: merged.electricitySingle,
        electricityDual: merged.electricityDual,
      };
    }
    if (tariffs.water !== undefined) {
      userPatch.waterTariffs = merged.water;
    }
    if (tariffs.waste !== undefined) {
      userPatch.wasteTariffs = merged.waste;
    }

    const saved = await this.saveUserPersonalSettings(userPatch, targetUserId);
    if (!saved) {
      throw new Error('Не вдалося зберегти тарифи у базу даних');
    }

    // If admin is editing and a section is configured as 'system', also persist to global settings
    if (this.isAdmin() && !targetUserId) {
      const elecSys = this.getSettingScope('electricity_tariffs') === 'system';
      const waterSys = this.getSettingScope('water_tariffs') === 'system';
      const wasteSys = this.getSettingScope('waste_tariffs') === 'system';
      if (elecSys || waterSys || wasteSys) {
        const current = this.settings();
        const sysTariffs = current.utilityTariffsSettings || DEFAULT_UTILITY_TARIFFS;
        await this.saveSettings({
          utilityTariffsSettings: {
            ...sysTariffs,
            ...(elecSys
              ? {
                  electricitySingle: merged.electricitySingle,
                  electricityDual: merged.electricityDual,
                }
              : {}),
            ...(waterSys ? { water: merged.water } : {}),
            ...(wasteSys ? { waste: merged.waste } : {}),
          },
        });
      }
    }

    // Always re-fetch directly from DB after saving so UI reflects persisted DB state with zero cache
    await this.fetchSettings(true);
    this.broadcastDataChange();
  }

  getUserEffectiveTariffs(userId: string): UtilityTariffsSettings {
    const sys = this.systemUtilityTariffs();
    const allMap = this.allUsersPersonalSettings();
    const usr =
      userId === this.currentUser()?.id ? this.userPersonalSettings() : allMap[userId];
    if (!usr) return sys;
    return normalizeUtilityTariffs({
      ...sys,
      electricitySingle: usr.electricityTariffs?.electricitySingle || sys.electricitySingle,
      electricityDual: usr.electricityTariffs?.electricityDual || sys.electricityDual,
      water: usr.waterTariffs || sys.water,
      waste: usr.wasteTariffs || sys.waste,
    });
  }

  async recognizeMeterPhoto(payload: {
    imageBase64: string;
    utilityType: 'electricity' | 'water';
    electricityTariffType?: 'single' | 'dual';
  }): Promise<{
    success: boolean;
    readingT1?: number | null;
    readingT2?: number | null;
    singleReading?: number | null;
    readingWater?: number | null;
    meterNumber?: string | null;
    confidence?: number;
    explanation?: string;
    error?: string;
  }> {
    try {
      return await firstValueFrom(
        this.http.post<{
          success: boolean;
          readingT1?: number | null;
          readingT2?: number | null;
          singleReading?: number | null;
          readingWater?: number | null;
          meterNumber?: string | null;
          confidence?: number;
          explanation?: string;
          error?: string;
        }>('/api/utility/recognize-meter', payload, this.getAuthHeaders())
      );
    } catch (err: unknown) {
      let errMsg = '';
      if (err && typeof err === 'object') {
        const httpErr = err as {
          error?: { error?: string; message?: string } | string;
          message?: string;
          status?: number;
        };
        if (typeof httpErr.error === 'object' && httpErr.error !== null) {
          errMsg = httpErr.error.error || httpErr.error.message || '';
        } else if (typeof httpErr.error === 'string') {
          errMsg = httpErr.error;
        }
        if (!errMsg && typeof httpErr.message === 'string') {
          errMsg = httpErr.message;
        }
      } else if (typeof err === 'string') {
        errMsg = err;
      }
      if (!errMsg || errMsg === '[object Object]') {
        errMsg = 'Не вдалося розпізнати покази на фото. Ви можете ввести покази з фото вручну нижче.';
      }
      return {
        success: false,
        error: errMsg,
      };
    }
  }

  async saveUtilityAccountDevices(
    accountId: string,
    devices: ElectricityDevice[],
    successNotice?: string,
    silent = false
  ): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    const currentUser = this.currentUser();
    const currentUserId = currentUser?.id || '';

    const taggedHouseDevices: ElectricityDevice[] = devices.map((d) => ({
      ...d,
      accountId,
      ownerUserId: d.ownerUserId || currentUserId,
    }));

    const existingAcc = this.utilityAccounts().find((a) => a.id === accountId);

    // Immediate optimistic update in signal state for this house
    this.utilityAccounts.update((list) =>
      list.map((acc) => (acc.id === accountId ? { ...acc, devices: taggedHouseDevices } : acc))
    );

    const payload = {
      userId: currentUserId,
      devices: taggedHouseDevices,
      accountName: existingAcc?.name,
      accountNumber: existingAcc?.accountNumber,
      address: existingAcc?.address,
      city: existingAcc?.city,
      street: existingAcc?.street,
      houseNum: existingAcc?.houseNum,
      electricityTariffType: existingAcc?.electricityTariffType,
    };

    try {
      const res = await firstValueFrom(
        this.http.post<{ success: boolean; account: UtilityAccount; devices: ElectricityDevice[] }>(
          `/api/utility/accounts/${accountId}/devices`,
          payload,
          this.getAuthHeaders()
        )
      );
      if (res && res.success) {
        this.utilityAccounts.update((list) =>
          list.map((acc) => (acc.id === accountId ? { ...acc, ...res.account, devices: res.devices } : acc))
        );
        if (successNotice) {
          this.triggerSuccess(successNotice);
        }
        this.broadcastDataChange();
        return true;
      }
      return true;
    } catch {
      try {
        await new Promise((r) => setTimeout(r, 600));
        const retryRes = await firstValueFrom(
          this.http.post<{ success: boolean; account: UtilityAccount; devices: ElectricityDevice[] }>(
            `/api/utility/accounts/${accountId}/devices`,
            payload,
            this.getAuthHeaders()
          )
        );
        if (retryRes && retryRes.success) {
          this.utilityAccounts.update((list) =>
            list.map((acc) => (acc.id === accountId ? { ...acc, ...retryRes.account, devices: retryRes.devices } : acc))
          );
          if (successNotice) {
            this.triggerSuccess(successNotice);
          }
          this.broadcastDataChange();
          return true;
        }
      } catch {
        // Keep optimistic devices in UI
      }
      if (successNotice && !silent) {
        this.triggerSuccess(successNotice);
      }
      return true;
    }
  }

  async fetchUtilityWeather(
    city: string,
    month?: string,
    date?: string
  ): Promise<UtilityWeatherResponse | null> {
    if (typeof window === 'undefined') return null;
    try {
      const params = new URLSearchParams();
      if (city) params.set('city', city);
      if (month) params.set('month', month);
      if (date) params.set('date', date);
      return await firstValueFrom(
        this.http.get<UtilityWeatherResponse>(
          `/api/utility/weather?${params.toString()}`,
          this.getAuthHeaders()
        )
      );
    } catch {
      return null;
    }
  }

  async analyzeDeviceScreenshot(payload: {
    imageBase64: string;
    comment: string;
    deviceName?: string;
    date?: string;
  }): Promise<ElectricityScreenshotAnalysisResult> {
    return firstValueFrom(
      this.http.post<ElectricityScreenshotAnalysisResult>(
        '/api/utility/analyze-device-screenshot',
        payload,
        this.getAuthHeaders()
      )
    );
  }

  // Backup & Restore
  exportBackup(): string {
    const backup = {
      clients: this.clients(),
      payments: this.payments(),
      settings: this.settings(),
      utilityAccounts: this.utilityAccounts(),
      utilityReadings: this.utilityReadings(),
      exportDate: new Date().toISOString(),
    };
    return JSON.stringify(backup, null, 2);
  }

  importBackup(jsonStr: string): boolean {
    try {
      const parsed = JSON.parse(jsonStr) as {
        clients?: Client[];
        payments?: PaymentTransaction[];
        settings?: Partial<AppSettings>;
        utilityAccounts?: UtilityAccount[];
        utilityReadings?: UtilityReading[];
      };
      if (parsed.clients && Array.isArray(parsed.clients)) {
        this.clients.set(parsed.clients.map((c) => ({ ...c, status: computeClientStatus(c) })));
      }
      if (parsed.payments && Array.isArray(parsed.payments)) {
        this.payments.set(parsed.payments);
      }
      if (parsed.settings) {
        this.settings.set({ ...DEFAULT_SETTINGS, ...parsed.settings });
      }
      if (parsed.utilityAccounts && Array.isArray(parsed.utilityAccounts)) {
        this.utilityAccounts.set(parsed.utilityAccounts);
      }
      if (parsed.utilityReadings && Array.isArray(parsed.utilityReadings)) {
        this.utilityReadings.set(parsed.utilityReadings);
      }
      this.triggerSuccess('Резервну копію успішно відновлено!');
      this.refreshAllData(true);
      this.broadcastDataChange();
      return true;
    } catch {
      this.triggerError('Некоректний файл резервної копії');
      return false;
    }
  }

  private loadFromLocalStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      // Clear any legacy client-side cached data so single source of truth is always Cloud SQL database
      localStorage.removeItem('iptv_clients');
      localStorage.removeItem('iptv_payments');
      localStorage.removeItem('iptv_settings');
      localStorage.removeItem('iptv_utility_accounts');
      localStorage.removeItem('iptv_utility_readings');
    } catch {
      // Ignore storage errors
    }
  }

  openConfirmDialog(config: ConfirmDialogConfig): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.confirmDialogResolver) {
        this.confirmDialogResolver(false);
      }
      this.confirmDialogResolver = resolve;
      this.confirmDialog.set({
        confirmText: 'Підтвердити',
        cancelText: 'Скасувати',
        ...config,
        isDanger: config.isDanger ?? config.tone === 'danger',
      });
    });
  }

  resolveConfirmDialog(accepted: boolean): void {
    const resolver = this.confirmDialogResolver;
    this.confirmDialogResolver = null;
    this.confirmDialog.set(null);
    if (resolver) {
      resolver(accepted);
    }
  }

  async showAlertMessage(
    title: string,
    message: string,
    tone: 'danger' | 'warning' | 'info' | 'primary' = 'info'
  ): Promise<void> {
    await this.openConfirmDialog({
      title,
      message,
      confirmText: 'Зрозуміло',
      isAlertOnly: true,
      tone,
    });
  }

  showSuccess(msg: string): void {
    this.triggerSuccess(msg);
  }

  showError(msg: string): void {
    this.triggerError(msg);
  }

  private triggerSuccess(msg: string): void {
    this.successMessage.set(msg);
    setTimeout(() => {
      if (this.successMessage() === msg) {
        this.successMessage.set(null);
      }
    }, 4000);
  }

  private triggerError(msg: string): void {
    this.errorMessage.set(msg);
    setTimeout(() => {
      if (this.errorMessage() === msg) {
        this.errorMessage.set(null);
      }
    }, 5000);
  }
}
