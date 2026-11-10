import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { triggerFirebaseGooglePopup, triggerFirebaseSignOut } from '../firebase-client';
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
  AppUser,
  AppTabId,
  SettingsSectionId,
  ALL_SETTINGS_SECTIONS,
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
  OutageScheduleViewVariant,
} from '../models/utility.model';

const DEFAULT_SETTINGS: AppSettings = {
  telegramBotToken: '',
  telegramBotUsername: 'iptv_billing_bot',
  telegramSenderName: 'IPTV Підтримка',
  cardRequisites: '4441 1144 2233 5566 (Монобанк, Іван П.)',
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

export function normalizeUtilityTariffs(raw?: Partial<UtilityTariffsSettings>): UtilityTariffsSettings {
  if (!raw) return DEFAULT_UTILITY_TARIFFS;
  const t = raw;
  const waterPrice = t.water?.price !== undefined ? Number(t.water.price) : DEFAULT_UTILITY_TARIFFS.water.price;
  const waterMonthlyFee = t.water?.monthlyFee !== undefined ? Number(t.water.monthlyFee) : (DEFAULT_UTILITY_TARIFFS.water.monthlyFee || 0);
  const waterValidFrom = t.water?.validFrom || DEFAULT_UTILITY_TARIFFS.water.validFrom;
  const waterValidTo = t.water?.validTo !== undefined ? t.water.validTo : (DEFAULT_UTILITY_TARIFFS.water.validTo || '');
  let waterHistory = t.water?.history && Array.isArray(t.water.history) && t.water.history.length > 0 ? [...t.water.history] : [];
  if (waterHistory.length === 0) {
    waterHistory = [{ id: 'wh_1', price: waterPrice, monthlyFee: waterMonthlyFee, validFrom: waterValidFrom, validTo: waterValidTo, note: 'Базовий тариф на воду' }];
  } else {
    for (const item of waterHistory) {
      if (item.validFrom === waterValidFrom || waterHistory.length === 1) {
        item.price = waterPrice;
        item.monthlyFee = waterMonthlyFee;
        item.validTo = waterValidTo;
      }
    }
  }

  const wastePrice = t.waste?.price !== undefined ? Number(t.waste.price) : DEFAULT_UTILITY_TARIFFS.waste.price;
  const wasteValidFrom = t.waste?.validFrom || DEFAULT_UTILITY_TARIFFS.waste.validFrom;
  const wasteValidTo = t.waste?.validTo !== undefined ? t.waste.validTo : (DEFAULT_UTILITY_TARIFFS.waste.validTo || '');
  let wasteHistory = t.waste?.history && Array.isArray(t.waste.history) && t.waste.history.length > 0 ? [...t.waste.history] : [];
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

  const elecSingleRate = t.electricitySingle?.rate !== undefined ? Number(t.electricitySingle.rate) : DEFAULT_UTILITY_TARIFFS.electricitySingle.rate;
  const elecSingleValidFrom = t.electricitySingle?.validFrom || DEFAULT_UTILITY_TARIFFS.electricitySingle.validFrom;
  const elecSingleValidTo = t.electricitySingle?.validTo !== undefined ? t.electricitySingle.validTo : (DEFAULT_UTILITY_TARIFFS.electricitySingle.validTo || '');
  let elecSingleHistory = t.electricitySingle?.history && Array.isArray(t.electricitySingle.history) && t.electricitySingle.history.length > 0 ? [...t.electricitySingle.history] : [];
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

  const elecDualValidFrom = t.electricityDual?.validFrom || DEFAULT_UTILITY_TARIFFS.electricityDual.validFrom;
  const elecDualValidTo = t.electricityDual?.validTo !== undefined ? t.electricityDual.validTo : (DEFAULT_UTILITY_TARIFFS.electricityDual.validTo || '');
  const elecDualSummerDay = t.electricityDual?.summerDay !== undefined ? Number(t.electricityDual.summerDay) : DEFAULT_UTILITY_TARIFFS.electricityDual.summerDay;
  const elecDualSummerNight = t.electricityDual?.summerNight !== undefined ? Number(t.electricityDual.summerNight) : DEFAULT_UTILITY_TARIFFS.electricityDual.summerNight;
  const elecDualWinterDay = t.electricityDual?.winterDay !== undefined ? Number(t.electricityDual.winterDay) : DEFAULT_UTILITY_TARIFFS.electricityDual.winterDay;
  const elecDualWinterNight = t.electricityDual?.winterNight !== undefined ? Number(t.electricityDual.winterNight) : DEFAULT_UTILITY_TARIFFS.electricityDual.winterNight;
  const elecDualWinterLimit = t.electricityDual?.winterLimitKwh !== undefined ? Number(t.electricityDual.winterLimitKwh) : (DEFAULT_UTILITY_TARIFFS.electricityDual.winterLimitKwh ?? 2000);
  let elecDualHistory = t.electricityDual?.history && Array.isArray(t.electricityDual.history) && t.electricityDual.history.length > 0 ? [...t.electricityDual.history] : [];
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

  const outageScheduleViewVariant: OutageScheduleViewVariant =
    t.outageScheduleViewVariant || DEFAULT_UTILITY_TARIFFS.outageScheduleViewVariant || 'v1_classic_grid';

  return {
    outageScheduleViewVariant,
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
    method: 'viber_api' | 'manual';
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
  currentKyivHour?: number;
  kyivTime?: string;
  houseData?: Record<string, unknown> | null;
  raw?: Record<string, unknown>;
  error?: string;
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

  // User Authentication & Role Management Signals
  readonly currentUser = signal<AppUser | null>(null);
  readonly realAdminUser = signal<AppUser | null>(null);
  readonly impersonatedUser = signal<AppUser | null>(null);
  readonly isImpersonating = computed<boolean>(() => !!this.impersonatedUser());
  readonly authToken = signal<string | null>(null);
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
  readonly canEdit = computed<boolean>(() => {
    const user = this.currentUser();
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (user.role === 'user' || user.role === 'new') return user.canManageOwnData !== false;
    return false;
  });
  readonly canView = computed<boolean>(() => !!this.currentUser());
  readonly pendingUsersCount = computed<number>(() => this.usersList().filter((u) => u.role === 'new').length);

  readonly allowedTabs = computed<AppTabId[]>(() => {
    const user = this.currentUser();
    if (!user) {
      return [];
    }
    if (user.role === 'admin') {
      return ALL_ADMIN_TABS;
    }
    const rawTabs =
      Array.isArray(user.allowedTabs) && user.allowedTabs.length > 0
        ? (user.allowedTabs.filter((t) => typeof t === 'string' && !t.startsWith('settings:')) as AppTabId[])
        : [...DEFAULT_USER_TABS];
    const expanded = new Set<AppTabId>(rawTabs);
    if (expanded.has('electricity')) {
      expanded.add('outage_schedule');
    }
    if (expanded.has('water_waste')) {
      expanded.add('water');
      expanded.add('waste');
    }
    return Array.from(expanded);
  });

  readonly allowedSettingsSections = computed<SettingsSectionId[]>(() => {
    const user = this.currentUser();
    if (!user) {
      return [];
    }
    if (user.role === 'admin') {
      return ALL_SETTINGS_SECTIONS.map((s) => s.id);
    }
    return extractAllowedSettingsFromUser(user);
  });

  isSettingsSectionAllowed(sectionId: SettingsSectionId): boolean {
    const user = this.currentUser();
    if (!user) return false;
    if (user.role === 'admin') return true;
    return this.allowedSettingsSections().includes(sectionId);
  }

  isTabAllowed(tab: AppTabId): boolean {
    const user = this.currentUser();
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (tab === 'users') return false;
    if (tab === 'settings') {
      return this.allowedSettingsSections().length > 0;
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
      (a) => this.isElectricityGroupHouse(a) && !isAccountHiddenInTab(a, 'outage_schedule')
    )
  );

  readonly electricityAccounts = computed(() =>
    this.utilityAccounts().filter(
      (a) => this.isElectricityGroupHouse(a) && !isAccountHiddenInTab(a, 'electricity')
    )
  );

  readonly waterAccounts = computed(() =>
    this.utilityAccounts().filter(
      (a) => this.isWaterWasteGroupHouse(a) && !isAccountHiddenInTab(a, 'water')
    )
  );

  readonly wasteAccounts = computed(() =>
    this.utilityAccounts().filter(
      (a) => this.isWaterWasteGroupHouse(a) && !isAccountHiddenInTab(a, 'waste')
    )
  );

  readonly waterWasteAccounts = computed(() =>
    this.utilityAccounts().filter(
      (a) =>
        this.isWaterWasteGroupHouse(a) &&
        (!isAccountHiddenInTab(a, 'water') || !isAccountHiddenInTab(a, 'waste'))
    )
  );

  getVisibleAccountsForTab(tab: UtilityServiceTabId): UtilityAccount[] {
    const isElecGroup = tab === 'outage_schedule' || tab === 'electricity';
    return this.utilityAccounts().filter((a) => {
      const inGroup = isElecGroup ? this.isElectricityGroupHouse(a) : this.isWaterWasteGroupHouse(a);
      return inGroup && !isAccountHiddenInTab(a, tab);
    });
  }

  getHiddenAccountsForTab(tab: UtilityServiceTabId): UtilityAccount[] {
    const isElecGroup = tab === 'outage_schedule' || tab === 'electricity';
    return this.utilityAccounts().filter((a) => {
      const inGroup = isElecGroup ? this.isElectricityGroupHouse(a) : this.isWaterWasteGroupHouse(a);
      return inGroup && isAccountHiddenInTab(a, tab);
    });
  }

  isHouseHiddenInTab(acc: UtilityAccount | null | undefined, tab: UtilityServiceTabId): boolean {
    return isAccountHiddenInTab(acc, tab);
  }

  async toggleHouseVisibilityInTab(accountId: string, tab: UtilityServiceTabId): Promise<void> {
    const acc = this.utilityAccounts().find((a) => a.id === accountId);
    if (!acc) return;
    const isElecGroup = this.isElectricityGroupHouse(acc);
    const allowedTabsForGroup: UtilityServiceTabId[] = isElecGroup
      ? ['outage_schedule', 'electricity']
      : ['water', 'waste'];
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

  readonly utilityTariffs = computed<UtilityTariffsSettings>(() =>
    this.settings().utilityTariffsSettings || DEFAULT_UTILITY_TARIFFS
  );

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
  private lastSettingsFetchTime = 0;
  private settingsCooldownUntil = 0;
  private lastVersionCheckTime = 0;

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

    // Current month revenue
    let currentMonthRevenue = 0;
    let paymentsThisMonthCount = 0;
    for (const p of paymentsList) {
      if (p.date && p.date.startsWith(currentMonthKey)) {
        currentMonthRevenue += Number(p.amount) || 0;
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
    const impersonated = this.impersonatedUser();
    const headers: Record<string, string> = {};
    if (token && token.startsWith('gauth3_')) {
      headers['Authorization'] = `Bearer ${token}`;
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
        allowedSettings: [],
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
      testTarget = {
        ...testTarget,
        role: testTarget.role === 'new' ? 'user' : testTarget.role,
        allowedTabs: normalizedTabs,
        canManageOwnData: testTarget.canManageOwnData !== false,
      };
    }

    if (typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.setItem('homehub_impersonate_uid', testTarget.id);
      } catch {
        // ignore
      }
    }
    this.impersonatedUser.set(testTarget);
    this.currentUser.set(testTarget);
    await this.checkAuth();
    await this.refreshAllData(false);
    this.triggerSuccess(`Увімкнено режим перегляду очима користувача: ${this.currentUser()?.name || testTarget.name}`);
  }

  async exitTestUserMode(): Promise<void> {
    const admin = this.realAdminUser();
    this.impersonatedUser.set(null);
    if (typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.removeItem('homehub_impersonate_uid');
      } catch {
        // ignore
      }
    }
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
    this.triggerSuccess('Ви повернулись у режим Адміністратора з повним доступом');
  }

  async checkAuth(): Promise<AppUser | null> {
    this.isAuthLoading.set(true);
    try {
      if (typeof window !== 'undefined') {
        // Purge any legacy localStorage keys that previously auto-logged visitors as admin
        try {
          localStorage.removeItem('iptv_auth_token');
          localStorage.removeItem('iptv_auth_user');
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
          totalUsersCount: number;
        }>('/api/auth/me', this.getAuthHeaders())
      );

      if (res.googleClientId) {
        this.googleClientId.set(res.googleClientId);
      }

      if (res.realAdminUser) {
        this.realAdminUser.set(res.realAdminUser);
      }

      if (res.authenticated && res.user) {
        this.currentUser.set(res.user);
        if (this.impersonatedUser() && res.user.id === this.impersonatedUser()?.id) {
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
        this.authToken.set(null);
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
    email?: string;
    name?: string;
    picture?: string;
    sub?: string;
  }): Promise<AppUser | null> {
    this.isLoading.set(true);
    try {
      const res = await firstValueFrom(
        this.http.post<{ success: boolean; user: AppUser; token: string; message: string }>('/api/auth/google', payload)
      );

      if (res.success && res.user) {
        this.impersonatedUser.set(null);
        this.currentUser.set(res.user);
        if (res.user.role === 'admin') {
          this.realAdminUser.set(res.user);
        } else {
          this.realAdminUser.set(null);
        }
        this.authToken.set(res.token);
        if (typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem('homehub_gauth3_token', res.token);
            localStorage.setItem('homehub_gauth3_user', JSON.stringify(res.user));
          } catch {
            // ignore
          }
        }
        if (typeof sessionStorage !== 'undefined') {
          try {
            sessionStorage.removeItem('homehub_impersonate_uid');
            sessionStorage.setItem('homehub_gauth3_token', res.token);
            sessionStorage.setItem('homehub_gauth3_user', JSON.stringify(res.user));
          } catch {
            // ignore
          }
        }
        this.triggerSuccess(res.message || 'Успішний вхід через Google');
        if (res.user.role === 'admin') {
          await Promise.all([this.fetchUsers(), this.fetchAdminUtilityAccounts()]);
        }
        await this.refreshAllData(true);
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
    this.authToken.set(null);
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
        sessionStorage.removeItem('homehub_gauth3_token');
        sessionStorage.removeItem('homehub_gauth3_user');
        sessionStorage.removeItem('homehub_impersonate_uid');
        localStorage.removeItem('iptv_auth_token');
        localStorage.removeItem('iptv_auth_user');
      } catch {
        // ignore
      }
    }
    this.triggerSuccess('Ви вийшли з облікового запису');
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

  async updateUserPermissions(
    userId: string,
    payload: {
      role?: UserRole;
      name?: string;
      allowedTabs?: AppTabId[];
      allowedSettings?: SettingsSectionId[];
      assignedUtilityAccountIds?: string[];
      assignedClientIds?: string[];
      canManageOwnData?: boolean;
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
      void Promise.all([this.fetchAdminUtilityAccounts(), this.fetchUtilityData(), this.fetchClients()]);
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

  async refreshAllData(silent = false): Promise<void> {
    if (!silent) {
      this.isLoading.set(true);
    }
    try {
      await Promise.all([
        this.fetchClients(),
        this.fetchPayments(),
        this.fetchSettings(),
        this.fetchStats(),
        this.fetchAccounts(),
        this.fetchBudget(),
        this.fetchDbStatus(),
        this.fetchUtilityData(),
        this.fetchDtekShutdowns(),
      ]);
      this.lastAutoSyncTime.set(new Date().toISOString());
    } catch (err) {
      console.warn('Error refreshing all application data:', err);
    } finally {
      if (!silent) {
        this.isLoading.set(false);
      }
    }
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
      await Promise.all([
        this.fetchSettings(),
        this.fetchDtekShutdowns(),
      ]);
    } catch (e) {
      console.debug('Direct fetch settings or DTEK error on init:', e);
    }

    try {
      await this.syncCloudDatabase(true);
    } catch {
      try {
        await this.refreshAllData(true);
      } catch {
        this.loadFromLocalStorage();
      }
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
    this.isDtekCatalogLoading.set(true);
    try {
      const url = city ? `/api/utility/dtek-streets?city=${encodeURIComponent(city)}` : '/api/utility/dtek-streets';
      const res = await firstValueFrom(this.http.get<{ cities: string[]; streets: string[] }>(url));
      if (res && Array.isArray(res.cities) && res.cities.length > 0) {
        this.dtekCities.set(res.cities);
      }
      if (res && Array.isArray(res.streets)) {
        this.dtekStreets.set(res.streets);
      }
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
        this.dtekShutdownInfo.set(info);
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

  async switchDatabaseMode(mode: 'sqlite_local' | 'cloudsql' | 'external'): Promise<boolean> {
    this.isSwitchingDb.set(true);
    try {
      const res = await firstValueFrom(
        this.http.post<{
          success: boolean;
          activeMode: 'sqlite_local' | 'cloudsql' | 'external';
          provider: string;
          databaseId: string;
          message: string;
          error?: string;
        }>('/api/database/switch', { mode }, this.getAuthHeaders())
      );
      await this.refreshAllData(true);
      await this.fetchDbStatus();
      this.triggerSuccess(
        res.message ||
          (mode === 'sqlite_local'
            ? 'Перемкнуто на SQLite / In-Memory Local Cache!'
            : mode === 'cloudsql'
            ? 'Перемкнуто на Google Cloud SQL!'
            : 'Перемкнуто на зовнішню PostgreSQL (Aiven Cloud)!')
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
    type: 'postgresql' | 'sqlite' | 'firestore' | 'mysql';
    host?: string;
    database: string;
    description?: string;
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

  async fetchClients(): Promise<void> {
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
        this.saveClientsLocal(mapped);
      }
    } catch (err) {
      console.error('Error fetching clients:', err);
    }
  }

  async fetchPayments(): Promise<void> {
    try {
      const data = await firstValueFrom(this.http.get<PaymentTransaction[]>('/api/payments', this.getAuthHeaders()));
      if (Array.isArray(data)) {
        this.payments.set(data);
        this.savePaymentsLocal(data);
      }
    } catch (err) {
      console.error('Error fetching payments:', err);
    }
  }

  async fetchSettings(force = false): Promise<void> {
    const now = Date.now();
    // 1. Observe cooldown if Cloud Run / backend hit rate limit (429)
    if (!force && now < this.settingsCooldownUntil) {
      return;
    }
    // 2. Throttle calls within 15 seconds unless explicitly forced
    if (!force && this.lastSettingsFetchTime > 0 && now - this.lastSettingsFetchTime < 15000) {
      return;
    }
    // 3. Reuse in-flight promise to avoid duplicate concurrent HTTP calls
    if (this.inFlightSettingsPromise) {
      return this.inFlightSettingsPromise;
    }

    this.inFlightSettingsPromise = (async () => {
      try {
        const data = await firstValueFrom(this.http.get<AppSettings>('/api/settings', this.getAuthHeaders()));
        if (data) {
          const tariffs = normalizeUtilityTariffs(data.utilityTariffsSettings);
          const merged: AppSettings = { ...DEFAULT_SETTINGS, ...data, utilityTariffsSettings: tariffs };
          this.settings.set(merged);
          this.saveSettingsLocal(merged);
          this.lastSettingsFetchTime = Date.now();
          this.settingsCooldownUntil = 0;
        }
      } catch (err: unknown) {
        const httpErr = err as { status?: number; message?: string };
        if (httpErr?.status === 429) {
          // 429 Rate exceeded: activate a 45-second cooldown and quietly rely on local storage
          this.settingsCooldownUntil = Date.now() + 45000;
          console.warn('API settings rate limit reached (429), serving local cached settings during cooldown');
        } else {
          console.warn('Notice: error fetching settings (serving local cached settings):', httpErr?.message || err);
        }
      } finally {
        this.inFlightSettingsPromise = null;
      }
    })();

    return this.inFlightSettingsPromise;
  }

  async fetchStats(): Promise<void> {
    try {
      const data = await firstValueFrom(
        this.http.get<{ summary: StatsSummary; monthlyBreakdown: MonthRevenueStat[] }>('/api/stats', this.getAuthHeaders())
      );
      if (data && data.monthlyBreakdown) {
        this.monthlyStats.set(data.monthlyBreakdown);
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  }

  async fetchAccounts(): Promise<void> {
    try {
      const data = await firstValueFrom(this.http.get<ProviderAccountDetailed[]>('/api/accounts', this.getAuthHeaders()));
      if (Array.isArray(data)) {
        this.accounts.set(data);
      }
    } catch (err) {
      console.error('Error fetching accounts:', err);
    }
  }

  async fetchBudget(): Promise<void> {
    try {
      const res = await firstValueFrom(this.http.get<BudgetApiResponse>('/api/budget', this.getAuthHeaders()));
      if (res) {
        this.budgetSummary.set(res.summary);
        this.deposits.set(res.deposits || []);
        this.providerAdjustments.set(res.adjustments || []);
        this.ledger.set(res.ledger || []);
      }
    } catch (err) {
      console.error('Error fetching budget:', err);
    }
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
      this.saveClientsLocal(this.clients());
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
      this.saveClientsLocal(this.clients());
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
      this.saveClientsLocal(this.clients());
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
      this.saveClientsLocal(this.clients());
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
      this.saveClientsLocal(this.clients());
      this.triggerSuccess('Клієнта видалено');
    } catch {
      this.clients.update((list) => list.filter((c) => c.id !== id));
      this.saveClientsLocal(this.clients());
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

      this.saveClientsLocal(this.clients());
      this.savePaymentsLocal(this.payments());
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
      this.saveClientsLocal(this.clients());
      this.savePaymentsLocal(this.payments());

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
      this.savePaymentsLocal(this.payments());
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
      this.savePaymentsLocal(this.payments());
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

  openOutageScheduleSettings(): void {
    this.requestedSettingsModal.set('outage_display');
    this.requestedAppTab.set('settings');
  }

  openOutageScheduleTab(): void {
    this.requestedAppTab.set('outage_schedule');
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
  async fetchUtilityData(): Promise<void> {
    try {
      const data = await firstValueFrom(
        this.http.get<{ accounts: UtilityAccount[]; readings: UtilityReading[] }>('/api/utility/data', this.getAuthHeaders())
      );
      if (data) {
        if (Array.isArray(data.accounts)) {
          this.utilityAccounts.set(data.accounts);
          this.saveUtilityAccountsLocal(data.accounts);

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
              this.fetchDtekShutdowns(city, street, house);
            }
          }
        }
        if (Array.isArray(data.readings)) {
          this.utilityReadings.set(data.readings);
          this.saveUtilityReadingsLocal(data.readings);
        }
      }
      if (this.isAdmin()) {
        await this.fetchAdminUtilityAccounts();
      }
    } catch (err) {
      console.warn('Error fetching utility data:', err);
    }
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
      this.saveUtilityAccountsLocal(this.utilityAccounts());
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
      this.saveUtilityAccountsLocal(this.utilityAccounts());
      this.saveUtilityReadingsLocal(this.utilityReadings());
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
      this.saveUtilityReadingsLocal(this.utilityReadings());
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
      this.saveUtilityReadingsLocal(this.utilityReadings());
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
      this.saveUtilityReadingsLocal(this.utilityReadings());
      this.triggerSuccess(isPaid ? 'Оплату зафіксовано!' : 'Статус оплати скасовано');
      this.broadcastDataChange();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Помилка оновлення оплати';
      this.triggerError(msg);
    }
  }

  async updateUtilityTariffs(tariffs: Partial<UtilityTariffsSettings>): Promise<void> {
    const current = this.settings();
    const currentTariffs = current.utilityTariffsSettings || DEFAULT_UTILITY_TARIFFS;
    const mergedTariffs: UtilityTariffsSettings = {
      ...currentTariffs,
      ...tariffs,
    };
    await this.saveSettings({
      utilityTariffsSettings: mergedTariffs,
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
    return firstValueFrom(
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
  }

  async saveUtilityAccountDevices(
    accountId: string,
    devices: ElectricityDevice[],
    successNotice?: string,
    silent = false
  ): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    const existingAcc = this.utilityAccounts().find((a) => a.id === accountId);
    // Immediate optimistic update in signal state
    this.utilityAccounts.update((list) =>
      list.map((acc) => (acc.id === accountId ? { ...acc, devices } : acc))
    );

    const payload = {
      devices,
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
        this.saveClientsLocal(this.clients());
      }
      if (parsed.payments && Array.isArray(parsed.payments)) {
        this.payments.set(parsed.payments);
        this.savePaymentsLocal(this.payments());
      }
      if (parsed.settings) {
        this.settings.set({ ...DEFAULT_SETTINGS, ...parsed.settings });
      }
      if (parsed.utilityAccounts && Array.isArray(parsed.utilityAccounts)) {
        this.utilityAccounts.set(parsed.utilityAccounts);
        this.saveUtilityAccountsLocal(parsed.utilityAccounts);
      }
      if (parsed.utilityReadings && Array.isArray(parsed.utilityReadings)) {
        this.utilityReadings.set(parsed.utilityReadings);
        this.saveUtilityReadingsLocal(parsed.utilityReadings);
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

  private saveSettingsLocal(settings: AppSettings): void {
    void settings;
  }

  private saveClientsLocal(clients: Client[]): void {
    void clients;
  }

  private savePaymentsLocal(payments: PaymentTransaction[]): void {
    void payments;
  }

  private saveUtilityAccountsLocal(accounts: UtilityAccount[]): void {
    void accounts;
  }

  private saveUtilityReadingsLocal(readings: UtilityReading[]): void {
    void readings;
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
