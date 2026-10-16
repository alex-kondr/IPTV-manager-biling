import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
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
  UserRole,
  AppUser,
  calculateExtension,
  addMonthsExact,
  computeClientStatus,
} from '../models/client.model';
import {
  UtilityAccount,
  UtilityReading,
  UtilityTariffsSettings,
  DEFAULT_UTILITY_TARIFFS,
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

export interface CloudDbStatus {
  provider: string;
  projectId: string;
  databaseId: string;
  connected: boolean;
  lastSync: string | null;
  error?: string | null;
  stats?: {
    clientsCount: number;
    paymentsCount: number;
    providerAccountsCount: number;
    providerDepositsCount: number;
    settingsConfigured: boolean;
  };
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
  readonly ledger = signal<BudgetLedgerItem[]>([]);
  readonly utilityAccounts = signal<UtilityAccount[]>([]);
  readonly utilityReadings = signal<UtilityReading[]>([]);
  readonly dbStatus = signal<CloudDbStatus | null>(null);
  readonly isSyncingCloud = signal<boolean>(false);
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly autoSyncActive = signal<boolean>(true);
  readonly lastAutoSyncTime = signal<string>(new Date().toISOString());

  // User Authentication & Role Management Signals
  readonly currentUser = signal<AppUser | null>(null);
  readonly authToken = signal<string | null>(null);
  readonly isAuthLoading = signal<boolean>(true);
  readonly googleClientId = signal<string>('');
  readonly usersList = signal<AppUser[]>([]);

  // Role Computed Flags
  readonly isAuthenticated = computed<boolean>(() => !!this.currentUser());
  readonly isAdmin = computed<boolean>(() => this.currentUser()?.role === 'admin');
  readonly isViewer = computed<boolean>(() => this.currentUser()?.role === 'user');
  readonly isNewUser = computed<boolean>(() => this.currentUser()?.role === 'new');
  readonly canEdit = computed<boolean>(() => this.isAdmin());
  readonly canView = computed<boolean>(() => this.isAdmin() || this.isViewer());
  readonly pendingUsersCount = computed<number>(() => this.usersList().filter((u) => u.role === 'new').length);

  // Utility accounts & tariffs computed properties
  readonly electricityAccounts = computed(() =>
    this.utilityAccounts().filter((a) => a.type === 'electricity')
  );
  readonly waterWasteAccounts = computed(() =>
    this.utilityAccounts().filter((a) => a.type === 'water_waste')
  );
  readonly utilityTariffs = computed<UtilityTariffsSettings>(() =>
    this.settings().utilityTariffsSettings || DEFAULT_UTILITY_TARIFFS
  );

  private lastKnownVersion = 0;
  private broadcastChannel: BroadcastChannel | null = null;
  private autoSyncInterval: ReturnType<typeof setInterval> | null = null;

  // Provider Balance USD & Low Balance Alert (< $5.00)
  readonly providerBalanceUsd = computed<number>(() => {
    const summary = this.budgetSummary();
    if (summary && typeof summary.providerBalanceUsd === 'number') {
      return summary.providerBalanceUsd;
    }
    const totalDeposited = this.deposits().reduce((sum, d) => sum + (Number(d.amountUsd) || 0), 0);
    const totalDeducted = this.accounts().reduce((sum, a) => sum + (Number(a.totalDeductedUsd) || 0), 0);
    return Math.round((totalDeposited - totalDeducted) * 100) / 100;
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

    // 2. Periodic background check every 10 seconds to auto-update on any change
    this.autoSyncInterval = setInterval(async () => {
      if (document.visibilityState === 'visible') {
        await this.checkRemoteVersionAndSync();
      }
    }, 10000);

    // 3. Auto-update whenever the user returns to the tab/window
    window.addEventListener('focus', () => {
      this.checkRemoteVersionAndSync();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.checkRemoteVersionAndSync();
      }
    });
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
    const token = this.authToken() || (typeof localStorage !== 'undefined' ? localStorage.getItem('iptv_auth_token') : null);
    const user = this.currentUser();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (user?.id) {
      headers['x-auth-user-id'] = user.id;
    }
    if (user?.email) {
      headers['x-auth-user-email'] = user.email;
    }
    return { headers };
  }

  async checkAuth(): Promise<AppUser | null> {
    this.isAuthLoading.set(true);
    try {
      if (typeof window !== 'undefined') {
        const savedToken = localStorage.getItem('iptv_auth_token');
        if (savedToken) {
          this.authToken.set(savedToken);
        }
        const savedUserStr = localStorage.getItem('iptv_auth_user');
        if (savedUserStr) {
          try {
            const parsed = JSON.parse(savedUserStr) as AppUser;
            this.currentUser.set(parsed);
          } catch (e) {
            console.debug('Failed to parse cached user:', e);
          }
        }
      }

      const res = await firstValueFrom(
        this.http.get<{ authenticated: boolean; user: AppUser | null; googleClientId: string; totalUsersCount: number }>('/api/auth/me', this.getAuthHeaders())
      );

      if (res.googleClientId) {
        this.googleClientId.set(res.googleClientId);
      }

      if (res.user) {
        this.currentUser.set(res.user);
        if (typeof window !== 'undefined') {
          localStorage.setItem('iptv_auth_user', JSON.stringify(res.user));
        }
        if (res.user.role === 'admin') {
          await this.fetchUsers();
        }
        return res.user;
      } else if (!this.currentUser()) {
        this.currentUser.set(null);
      }
      return this.currentUser();
    } catch (err) {
      console.warn('Auth check error:', err);
      return this.currentUser();
    } finally {
      this.isAuthLoading.set(false);
    }
  }

  async loginWithGoogle(payload: { credential?: string; email?: string; name?: string; picture?: string; sub?: string }): Promise<AppUser | null> {
    this.isLoading.set(true);
    try {
      const res = await firstValueFrom(
        this.http.post<{ success: boolean; user: AppUser; token: string; message: string }>('/api/auth/google', payload)
      );

      if (res.success && res.user) {
        this.currentUser.set(res.user);
        this.authToken.set(res.token);
        if (typeof window !== 'undefined') {
          localStorage.setItem('iptv_auth_token', res.token);
          localStorage.setItem('iptv_auth_user', JSON.stringify(res.user));
        }
        this.triggerSuccess(res.message || 'Успішний вхід');
        if (res.user.role === 'admin') {
          await this.fetchUsers();
        }
        if (res.user.role !== 'new') {
          await this.refreshAllData(true);
        }
        return res.user;
      }
      return null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Помилка авторизації через Google';
      this.triggerError(msg);
      return null;
    } finally {
      this.isLoading.set(false);
    }
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post('/api/auth/logout', {}, this.getAuthHeaders()));
    } catch (e) {
      console.debug('Logout request error:', e);
    }
    this.currentUser.set(null);
    this.authToken.set(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('iptv_auth_token');
      localStorage.removeItem('iptv_auth_user');
    }
    this.triggerSuccess('Ви вийшли з облікового запису');
  }

  async fetchUsers(): Promise<void> {
    if (!this.isAdmin()) return;
    try {
      const data = await firstValueFrom(this.http.get<AppUser[]>('/api/users', this.getAuthHeaders()));
      if (Array.isArray(data)) {
        this.usersList.set(data);
      }
    } catch (err) {
      console.warn('Error fetching users:', err);
    }
  }

  async updateUserRole(userId: string, role: UserRole): Promise<boolean> {
    this.isLoading.set(true);
    try {
      const updated = await firstValueFrom(this.http.put<AppUser>(`/api/users/${userId}/role`, { role }, this.getAuthHeaders()));
      this.usersList.update((list) => list.map((u) => (u.id === userId ? { ...u, role: updated.role } : u)));
      const roleName = role === 'admin' ? 'Адміністратор (Повний доступ)' : (role === 'user' ? 'Користувач (Тільки перегляд)' : 'Новий (Без доступу)');
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
    this.loadFromLocalStorage();
    this.isLoading.set(true);
    try {
      await this.checkAuth();
    } catch (e) {
      console.debug('Auth check error:', e);
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
    try {
      const status = await firstValueFrom(this.http.get<CloudDbStatus>('/api/database/status'));
      if (status) {
        this.dbStatus.set(status);
      }
    } catch (err) {
      console.warn('Error fetching cloud db status:', err);
    }
  }

  async syncCloudDatabase(silent = false): Promise<boolean> {
    this.isSyncingCloud.set(true);
    try {
      const res = await firstValueFrom(this.http.post<{ success: boolean; message: string }>('/api/database/sync', {}));
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
      const msg = err instanceof Error ? err.message : 'Помилка синхронізації з базою даних';
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
      const res = await firstValueFrom(this.http.post<{ success: boolean; message: string }>('/api/database/push-all', {}));
      await this.fetchDbStatus();
      this.triggerSuccess(res.message || 'Всі записи завантажено у базу даних!');
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Помилка вивантаження у базу даних';
      this.triggerError(msg);
      return false;
    } finally {
      this.isSyncingCloud.set(false);
    }
  }

  async purgeTestData(): Promise<boolean> {
    this.isSyncingCloud.set(true);
    try {
      const res = await firstValueFrom(this.http.post<{ success: boolean; message: string }>('/api/database/purge-test-data', {}));
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
      const msg = err instanceof Error ? err.message : 'Помилка очищення тестових даних';
      this.triggerError(msg);
      return false;
    } finally {
      this.isSyncingCloud.set(false);
    }
  }

  async fetchClients(): Promise<void> {
    try {
      const data = await firstValueFrom(this.http.get<Client[]>('/api/clients'));
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
      const data = await firstValueFrom(this.http.get<PaymentTransaction[]>('/api/payments'));
      if (Array.isArray(data)) {
        this.payments.set(data);
        this.savePaymentsLocal(data);
      }
    } catch (err) {
      console.error('Error fetching payments:', err);
    }
  }

  async fetchSettings(): Promise<void> {
    try {
      const data = await firstValueFrom(this.http.get<AppSettings>('/api/settings'));
      if (data) {
        const merged: AppSettings = { ...DEFAULT_SETTINGS, ...data };
        this.settings.set(merged);
        this.saveSettingsLocal(merged);
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
    }
  }

  async fetchStats(): Promise<void> {
    try {
      const data = await firstValueFrom(
        this.http.get<{ summary: StatsSummary; monthlyBreakdown: MonthRevenueStat[] }>('/api/stats')
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
      const data = await firstValueFrom(this.http.get<ProviderAccountDetailed[]>('/api/accounts'));
      if (Array.isArray(data)) {
        this.accounts.set(data);
      }
    } catch (err) {
      console.error('Error fetching accounts:', err);
    }
  }

  async fetchBudget(): Promise<void> {
    try {
      const res = await firstValueFrom(this.http.get<BudgetApiResponse>('/api/budget'));
      if (res) {
        this.budgetSummary.set(res.summary);
        this.deposits.set(res.deposits || []);
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
      const res = await firstValueFrom(this.http.post<AppSettings>('/api/settings', newSettings, this.getAuthHeaders()));
      const merged: AppSettings = { ...this.settings(), ...res };
      this.settings.set(merged);
      this.saveSettingsLocal(merged);
      this.triggerSuccess('Налаштування успішно збережено в базу даних!');
    } catch (err: unknown) {
      console.warn('Error saving settings to server, saving locally:', err);
      const merged: AppSettings = { ...this.settings(), ...newSettings };
      this.settings.set(merged);
      this.saveSettingsLocal(merged);
      this.triggerSuccess('Налаштування збережено локально');
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
        this.http.get<{ accounts: UtilityAccount[]; readings: UtilityReading[] }>('/api/utility/data')
      );
      if (data) {
        if (Array.isArray(data.accounts)) {
          this.utilityAccounts.set(data.accounts);
          this.saveUtilityAccountsLocal(data.accounts);
        }
        if (Array.isArray(data.readings)) {
          this.utilityReadings.set(data.readings);
          this.saveUtilityReadingsLocal(data.readings);
        }
      }
    } catch (err) {
      console.warn('Error fetching utility data:', err);
    }
  }

  async saveUtilityAccount(account: Partial<UtilityAccount>): Promise<UtilityAccount> {
    this.isLoading.set(true);
    try {
      const res = await firstValueFrom(
        this.http.post<{ success: boolean; account: UtilityAccount }>(
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
      this.saveUtilityAccountsLocal(this.utilityAccounts());
      this.triggerSuccess('Акаунт успішно збережено!');
      this.broadcastDataChange();
      return saved;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Помилка збереження акаунта';
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
      const res = await firstValueFrom(
        this.http.post<{ success: boolean; reading: UtilityReading }>(
          '/api/utility/readings',
          reading,
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
        return [saved, ...list];
      });
      this.saveUtilityReadingsLocal(this.utilityReadings());
      this.triggerSuccess('Покази лічильника успішно збережено!');
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
      const cStr = localStorage.getItem('iptv_clients');
      if (cStr) {
        const parsed = JSON.parse(cStr) as Client[];
        this.clients.set(parsed.map((c) => ({ ...c, status: computeClientStatus(c) })));
      }
      const pStr = localStorage.getItem('iptv_payments');
      if (pStr) {
        this.payments.set(JSON.parse(pStr) as PaymentTransaction[]);
      }
      const sStr = localStorage.getItem('iptv_settings');
      if (sStr) {
        this.settings.set({ ...DEFAULT_SETTINGS, ...JSON.parse(sStr) });
      }
      const uaccStr = localStorage.getItem('iptv_utility_accounts');
      if (uaccStr) {
        this.utilityAccounts.set(JSON.parse(uaccStr) as UtilityAccount[]);
      }
      const ureadStr = localStorage.getItem('iptv_utility_readings');
      if (ureadStr) {
        this.utilityReadings.set(JSON.parse(ureadStr) as UtilityReading[]);
      }
    } catch (err) {
      console.warn('LocalStorage error:', err);
    }
  }

  private saveSettingsLocal(settings: AppSettings): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('iptv_settings', JSON.stringify(settings));
    } catch {
      // Ignore quota errors
    }
  }

  private saveClientsLocal(clients: Client[]): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('iptv_clients', JSON.stringify(clients));
    } catch {
      // Ignore quota errors
    }
  }

  private savePaymentsLocal(payments: PaymentTransaction[]): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('iptv_payments', JSON.stringify(payments));
    } catch {
      // Ignore quota errors
    }
  }

  private saveUtilityAccountsLocal(accounts: UtilityAccount[]): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('iptv_utility_accounts', JSON.stringify(accounts));
    } catch {
      // Ignore quota errors
    }
  }

  private saveUtilityReadingsLocal(readings: UtilityReading[]): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('iptv_utility_readings', JSON.stringify(readings));
    } catch {
      // Ignore quota errors
    }
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
