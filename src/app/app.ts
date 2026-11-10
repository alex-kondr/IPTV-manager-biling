import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { IptvData } from './services/iptv-data';
import { TelegramWebApp } from './services/telegram-web-app';
import {
  Client,
  ClientGroupView,
  AppTabId,
  formatDateUa,
  getDaysRemaining,
  cleanPhoneNumber,
  DEFAULT_VIBER_REMINDER_TEMPLATE,
  interpolateViberMessage,
} from './models/client.model';
import { ClientModal } from './components/client-modal/client-modal';
import { PaymentModal } from './components/payment-modal/payment-modal';
import { AnalyticsView } from './components/analytics-view/analytics-view';
import { SettingsView } from './components/settings-view/settings-view';
import { PaymentsView } from './components/payments-view/payments-view';
import { AccountsView } from './components/accounts-view/accounts-view';
import { BudgetView } from './components/budget-view/budget-view';
import { AuthView } from './components/auth-view/auth-view';
import { UsersView } from './components/users-view/users-view';
import { ElectricityView } from './components/electricity-view/electricity-view';
import { WaterWasteView } from './components/water-waste-view/water-waste-view';

export type ActiveTab =
  | 'home'
  | 'outage_schedule'
  | 'clients'
  | 'accounts'
  | 'budget'
  | 'analytics'
  | 'payments'
  | 'electricity'
  | 'water'
  | 'waste'
  | 'water_waste'
  | 'users'
  | 'settings';
type FilterStatus = 'all' | 'expiring_soon' | 'expired' | 'active' | 'paused';

@Component({
  selector: 'app-root',
  imports: [
    ReactiveFormsModule,
    MatIconModule,
    ClientModal,
    PaymentModal,
    AnalyticsView,
    SettingsView,
    PaymentsView,
    AccountsView,
    BudgetView,
    AuthView,
    UsersView,
    ElectricityView,
    WaterWasteView,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  readonly dataService = inject(IptvData);
  readonly tgApp = inject(TelegramWebApp);
  readonly Math = Math;

  // Application metadata for user tracking (v3.0)
  readonly appVersion = 'v3.0';
  readonly publishDateTime = '08.11.2026, 23:55 (Київ)';
  readonly sharedAppUrl = 'https://ais-pre-xwrvn3here3zzs7lwxjyvb-427445800479.europe-west2.run.app';
  readonly devAppUrl = 'https://ais-dev-xwrvn3here3zzs7lwxjyvb-427445800479.europe-west2.run.app';
  readonly copiedAppUrl = signal<boolean>(false);

  // IPTV Grouped Tree (Desktop Sidebar) & Drawer (Mobile) State
  readonly isSidebarIptvOpen = signal<boolean>(true);
  readonly isMobileIptvDrawerOpen = signal<boolean>(false);

  // User Auth and Permissions
  readonly currentUser = this.dataService.currentUser;
  readonly isAuthenticated = this.dataService.isAuthenticated;
  readonly isAuthLoading = this.dataService.isAuthLoading;
  readonly isAdmin = this.dataService.isAdmin;
  readonly isRealAdmin = this.dataService.isRealAdmin;
  readonly isImpersonating = this.dataService.isImpersonating;
  readonly isViewer = this.dataService.isViewer;
  readonly isNewUser = this.dataService.isNewUser;
  readonly canEdit = this.dataService.canEdit;
  readonly canView = this.dataService.canView;
  readonly pendingUsersCount = this.dataService.pendingUsersCount;
  readonly adminUtilityAccounts = this.dataService.adminUtilityAccounts;

  readonly sandboxTabs: { id: AppTabId; label: string }[] = [
    { id: 'outage_schedule', label: '💡 Графік світла' },
    { id: 'electricity', label: '⚡ Електро' },
    { id: 'water', label: '💧 Вода' },
    { id: 'waste', label: '🗑️ Вивіз сміття' },
    { id: 'clients', label: '👥 Клієнти' },
    { id: 'accounts', label: '📺 Акаунти' },
    { id: 'budget', label: '💵 Бюджет' },
    { id: 'analytics', label: '📊 Аналітика' },
    { id: 'payments', label: '🧾 Оплати' },
    { id: 'settings', label: '⚙️ Опції' },
  ];

  async enterTestAccountMode(): Promise<void> {
    await this.dataService.switchToTestUser();
  }

  async exitTestAccountMode(): Promise<void> {
    await this.dataService.exitTestUserMode();
  }

  async setTestUserRole(role: 'user' | 'new'): Promise<void> {
    const user = this.currentUser();
    if (!user) return;
    await this.dataService.updateUserRole(user.id, role);
  }

  async toggleTestUserTab(tab: AppTabId): Promise<void> {
    const user = this.currentUser();
    if (!user) return;
    const currentTabs = [...this.allowedTabs()];
    const exists = currentTabs.includes(tab);
    let nextTabs = exists ? currentTabs.filter((t) => t !== tab) : [...currentTabs, tab];
    if (tab === 'water' || tab === 'waste') {
      nextTabs = nextTabs.filter((t) => t !== 'water_waste');
    }
    await this.dataService.updateUserPermissions(user.id, {
      allowedTabs: nextTabs,
    });
  }

  isTestUserHouseAssigned(accId: string): boolean {
    const user = this.currentUser();
    if (!user) return false;
    return Array.isArray(user.assignedUtilityAccountIds) && user.assignedUtilityAccountIds.includes(accId);
  }

  async toggleTestUserHouse(accId: string): Promise<void> {
    const user = this.currentUser();
    if (!user) return;
    const currentHouses = Array.isArray(user.assignedUtilityAccountIds)
      ? [...user.assignedUtilityAccountIds]
      : [];
    const exists = currentHouses.includes(accId);
    const nextHouses = exists ? currentHouses.filter((id) => id !== accId) : [...currentHouses, accId];
    await this.dataService.updateUserPermissions(user.id, {
      assignedUtilityAccountIds: nextHouses,
    });
  }

  // Auto-sync status
  readonly autoSyncActive = this.dataService.autoSyncActive;
  readonly lastAutoSyncTime = this.dataService.lastAutoSyncTime;

  // Active navigation tab (starts on 'home' with large tiles)
  readonly activeTab = signal<ActiveTab>('home');
  readonly allowedTabs = this.dataService.allowedTabs;

  // Thematic Background Configuration for Every Tab
  readonly activeTabBackground = computed(() => {
    const tab = this.activeTab();
    switch (tab) {
      case 'outage_schedule':
        return {
          imageUrl: '/assets/images/tile_outage_schedule_1793997826688.jpg',
          title: 'Графік відключень світла ДТЕК',
          subtitle: 'Погодинний графік стабілізаційних відключень, черга та статус мережі за вашою адресою',
          badge: 'Енергомережа ДТЕК',
          accentClass: 'from-slate-950/90 via-amber-950/75 to-slate-950/90',
          pageTintClass: 'from-amber-950/15 via-slate-100/92 to-slate-100/95',
        };
      case 'electricity':
        return {
          imageUrl: '/assets/images/tile_electricity_cabinet_1793997827492.jpg',
          title: 'Кабінет з показами електроенергії',
          subtitle: 'Двозонний та однозонний облік День/Ніч, розпізнавання фото лічильника, синхронізація ООЕК та ДТЕК',
          badge: 'Облік електроенергії',
          accentClass: 'from-slate-950/90 via-emerald-950/75 to-slate-950/90',
          pageTintClass: 'from-emerald-950/15 via-slate-100/92 to-slate-100/95',
        };
      case 'water':
      case 'water_waste':
        return {
          imageUrl: '/assets/images/tile_water_supply_1793997828992.jpg',
          title: 'Водопостачання (Вода)',
          subtitle: 'Покази водяного лічильника (м³), абонплата, залишок коштів та статистика',
          badge: 'Водопостачання',
          accentClass: 'from-slate-950/90 via-cyan-950/75 to-slate-950/90',
          pageTintClass: 'from-cyan-950/15 via-slate-100/92 to-slate-100/95',
        };
      case 'waste':
        return {
          imageUrl: '/assets/images/tile_water_supply_1793997828992.jpg',
          title: 'Вивіз сміття (ТПВ)',
          subtitle: 'Щомісячні нарахування за вивіз твердих побутових відходів за кількістю мешканців',
          badge: 'Вивіз сміття',
          accentClass: 'from-slate-950/90 via-emerald-950/75 to-slate-950/90',
          pageTintClass: 'from-emerald-950/15 via-slate-100/92 to-slate-100/95',
        };
      case 'clients':
        return {
          imageUrl: '/assets/images/tile_iptv_media_1793997828251.jpg',
          title: 'Клієнти та групування підписок IPTV',
          subtitle: 'Абонентська база, обʼєднання декількох підписок одного клієнта в групу зі спільним балансом у гривнях',
          badge: 'IPTV Білінг • Клієнти',
          accentClass: 'from-slate-950/90 via-indigo-950/80 to-slate-950/90',
          pageTintClass: 'from-indigo-950/15 via-slate-100/92 to-slate-100/95',
        };
      case 'accounts':
        return {
          imageUrl: '/assets/images/tile_iptv_media_1793997828251.jpg',
          title: 'Акаунти IPTV провайдера',
          subtitle: 'Управління лініями провайдера (до 2 підписок на 1 акаунт) та термінами дії пакетів',
          badge: 'IPTV Білінг • Акаунти',
          accentClass: 'from-slate-950/90 via-indigo-950/80 to-slate-950/90',
          pageTintClass: 'from-indigo-950/15 via-slate-100/92 to-slate-100/95',
        };
      case 'budget':
        return {
          imageUrl: '/assets/images/tile_iptv_media_1793997828251.jpg',
          title: 'Бюджет та баланс провайдера ($ / ₴)',
          subtitle: 'Контроль доларового балансу провайдера, поповнення, списання за лінії та чистий прибуток',
          badge: 'IPTV Білінг • Фінанси',
          accentClass: 'from-slate-950/90 via-teal-950/80 to-slate-950/90',
          pageTintClass: 'from-teal-950/15 via-slate-100/92 to-slate-100/95',
        };
      case 'analytics':
        return {
          imageUrl: '/assets/images/tile_iptv_media_1793997828251.jpg',
          title: 'Фінансова аналітика IPTV',
          subtitle: 'Динаміка доходів по місяцях, середній чек та прогнозована виручка за рік',
          badge: 'IPTV Білінг • Аналітика',
          accentClass: 'from-slate-950/90 via-violet-950/80 to-slate-950/90',
          pageTintClass: 'from-violet-950/15 via-slate-100/92 to-slate-100/95',
        };
      case 'payments':
        return {
          imageUrl: '/assets/images/tile_iptv_media_1793997828251.jpg',
          title: 'Історія оплат та Viber-розсилка',
          subtitle: 'Журнал транзакцій клієнтів та автоматизовані нагадування про закінчення підписки у Viber',
          badge: 'IPTV Білінг • Оплати',
          accentClass: 'from-slate-950/90 via-purple-950/80 to-slate-950/90',
          pageTintClass: 'from-purple-950/15 via-slate-100/92 to-slate-100/95',
        };
      case 'users':
        return {
          imageUrl: '/assets/images/tile_electricity_cabinet_1793997827492.jpg',
          title: 'Користувачі та права доступу',
          subtitle: 'Налаштування ролей, дозволених вкладок та привʼязаних будинків для кожного користувача',
          badge: 'Адміністрування',
          accentClass: 'from-slate-950/90 via-slate-900/80 to-slate-950/90',
          pageTintClass: 'from-slate-900/15 via-slate-100/92 to-slate-100/95',
        };
      case 'settings':
        return {
          imageUrl: '/assets/images/tile_outage_schedule_1793997826688.jpg',
          title: 'Налаштування системи та бази даних PostgreSQL',
          subtitle: 'Тарифи на електроенергію й воду, шаблони повідомлень та синхронізація із зовнішньою PostgreSQL',
          badge: 'Налаштування',
          accentClass: 'from-slate-950/90 via-slate-900/80 to-slate-950/90',
          pageTintClass: 'from-slate-900/15 via-slate-100/92 to-slate-100/95',
        };
      case 'home':
      default:
        return {
          imageUrl: '/assets/images/tile_outage_schedule_1793997826688.jpg',
          title: 'Головна панель',
          subtitle: 'Швидкий доступ до основних сервісів',
          badge: 'HomeHub',
          accentClass: 'from-slate-950/90 via-indigo-950/80 to-slate-950/90',
          pageTintClass: 'from-slate-950/20 via-slate-100/90 to-slate-100/95',
        };
    }
  });

  // Utility & DTEK schedule signals
  readonly electricityAccounts = this.dataService.electricityAccounts;
  readonly waterAccounts = this.dataService.waterAccounts;
  readonly wasteAccounts = this.dataService.wasteAccounts;
  readonly waterWasteAccounts = this.dataService.waterWasteAccounts;
  readonly utilityReadings = this.dataService.utilityReadings;
  readonly utilityTariffs = this.dataService.utilityTariffs;
  readonly dtekInfo = this.dataService.dtekShutdownInfo;
  readonly isDtekLoading = this.dataService.isDtekLoading;
  readonly activeDtekAccount = this.dataService.activeDtekAccount;
  readonly defaultDtekAccountId = this.dataService.defaultDtekAccountId;
  readonly isSavingDefaultHouse = this.dataService.isSavingDefaultHouse;

  openFirstAllowedIptvTab(): void {
    const candidates: AppTabId[] = ['clients', 'accounts', 'budget', 'analytics', 'payments'];
    const first = candidates.find((t) => this.isTabAllowed(t)) || 'clients';
    this.selectIptvSubTab(first as ActiveTab);
  }

  readonly isIptvTabActive = computed(() => {
    const tab = this.activeTab();
    return (
      tab === 'clients' ||
      tab === 'accounts' ||
      tab === 'budget' ||
      tab === 'analytics' ||
      tab === 'payments'
    );
  });

  readonly activeIptvTabLabel = computed(() => {
    switch (this.activeTab()) {
      case 'clients':
        return 'Клієнти';
      case 'accounts':
        return 'Акаунти';
      case 'budget':
        return 'Бюджет';
      case 'analytics':
        return 'Аналітика';
      case 'payments':
        return 'Оплати';
      default:
        return '';
    }
  });

  readonly activeSectionInfo = computed(() => {
    switch (this.activeTab()) {
      case 'home':
        return {
          category: 'Головний екран',
          title: 'Швидкий вибір розділу (Плитки)',
          icon: 'grid_view',
          iconColor: 'text-indigo-600',
        };
      case 'outage_schedule':
        return {
          category: 'Комунальні сервіси',
          title: 'Графік відключень світла ДТЕК',
          icon: 'lightbulb',
          iconColor: 'text-amber-500',
        };
      case 'electricity':
        return {
          category: 'Комунальні сервіси',
          title: 'Кабінет з показами електроенергії',
          icon: 'bolt',
          iconColor: 'text-amber-500',
        };
      case 'water':
      case 'water_waste':
        return {
          category: 'Комунальні сервіси',
          title: 'Вода (Водопостачання)',
          icon: 'water_drop',
          iconColor: 'text-cyan-500',
        };
      case 'waste':
        return {
          category: 'Комунальні сервіси',
          title: 'Вивіз сміття (ТПВ)',
          icon: 'delete_outline',
          iconColor: 'text-emerald-500',
        };
      case 'clients':
        return {
          category: 'IPTV Білінг',
          title: 'Клієнти та абоненти',
          icon: 'group',
          iconColor: 'text-indigo-500',
        };
      case 'accounts':
        return {
          category: 'IPTV Білінг',
          title: 'Акаунти IPTV провайдера',
          icon: 'dns',
          iconColor: 'text-emerald-500',
        };
      case 'budget':
        return {
          category: 'IPTV Білінг',
          title: 'Бюджет та баланс ($/₴)',
          icon: 'account_balance_wallet',
          iconColor: 'text-teal-500',
        };
      case 'analytics':
        return {
          category: 'IPTV Білінг',
          title: 'Аналітика доходів',
          icon: 'analytics',
          iconColor: 'text-indigo-500',
        };
      case 'payments':
        return {
          category: 'IPTV Білінг',
          title: 'Історія оплат та Viber розсилка',
          icon: 'receipt_long',
          iconColor: 'text-purple-500',
        };
      case 'users':
        return {
          category: 'Адміністрування',
          title: 'Користувачі та права доступу',
          icon: 'admin_panel_settings',
          iconColor: 'text-emerald-500',
        };
      case 'settings':
      default:
        return {
          category: 'Система',
          title: 'Налаштування тарифів та БД',
          icon: 'settings',
          iconColor: 'text-slate-600',
        };
    }
  });

  constructor() {
    effect(() => {
      const reqTab = this.dataService.requestedAppTab();
      if (reqTab) {
        this.activeTab.set(reqTab as ActiveTab);
        this.dataService.requestedAppTab.set(null);
        if (typeof window !== 'undefined') {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
    });

    effect(() => {
      const user = this.currentUser();
      this.allowedTabs();
      this.dataService.allowedSettingsSections();
      const current = this.activeTab();
      if (!user || user.role === 'admin') return;
      if (current === 'home') return;
      if (current === 'users' || !this.isTabAllowed(current as AppTabId)) {
        this.activeTab.set('home');
      }
    });
  }

  copyAppLink(): void {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(this.sharedAppUrl);
      this.copiedAppUrl.set(true);
      setTimeout(() => this.copiedAppUrl.set(false), 2000);
    }
  }

  isTabAllowed(tab: AppTabId): boolean {
    return this.dataService.isTabAllowed(tab);
  }

  hasAnyIptvTabAllowed(): boolean {
    return (
      this.isTabAllowed('clients') ||
      this.isTabAllowed('accounts') ||
      this.isTabAllowed('budget') ||
      this.isTabAllowed('analytics') ||
      this.isTabAllowed('payments')
    );
  }

  toggleSidebarIptv(): void {
    this.isSidebarIptvOpen.update((v) => !v);
  }

  toggleMobileIptvDrawer(): void {
    this.isMobileIptvDrawerOpen.update((v) => !v);
  }

  closeMobileIptvDrawer(): void {
    this.isMobileIptvDrawerOpen.set(false);
  }

  selectIptvSubTab(tab: ActiveTab): void {
    this.activeTab.set(tab);
    this.isSidebarIptvOpen.set(true);
    this.isMobileIptvDrawerOpen.set(false);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  setTab(tab: ActiveTab): void {
    this.activeTab.set(tab);
    this.isMobileIptvDrawerOpen.set(false);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  setFilter(status: FilterStatus): void {
    this.statusFilter.set(status);
  }

  // Client filtering & search
  readonly searchControl = new FormControl('');
  readonly statusFilter = signal<FilterStatus>('all');
  readonly clientViewMode = signal<'grouped' | 'flat'>('grouped');

  // Modals state
  readonly isClientModalOpen = signal<boolean>(false);
  readonly selectedClientForEdit = signal<Client | null>(null);
  readonly presetGroupForNewClient = signal<{
    groupName: string;
    groupBalance: number;
    fullName?: string;
    phone?: string;
  } | null>(null);

  readonly isPaymentModalOpen = signal<boolean>(false);
  readonly selectedClientForPayment = signal<Client | null>(null);

  // Client Group Management Modal state
  readonly isGroupModalOpen = signal<boolean>(false);
  readonly editingGroupOriginalName = signal<string>('');
  readonly groupFormName = new FormControl<string>('');
  readonly groupFormBalance = new FormControl<number>(0);
  readonly groupModalSearch = new FormControl<string>('');
  readonly selectedGroupClientIds = signal<string[]>([]);
  readonly isSavingGroup = signal<boolean>(false);

  // Copied feedback
  readonly copiedLoginId = signal<string | null>(null);

  // Computed data
  readonly clients = this.dataService.clients;
  readonly stats = this.dataService.stats;
  readonly accounts = this.dataService.accounts;
  readonly budgetSummary = this.dataService.budgetSummary;
  readonly dbStatus = this.dataService.dbStatus;
  readonly activeDbLabel = computed<string>(() => {
    const status = this.dbStatus();
    const mode = status?.activeMode || 'external';
    if (mode === 'cloudsql') return 'Cloud SQL';
    if (mode === 'external') return 'Aiven PG';
    return 'Aiven PG';
  });
  readonly isSyncingCloud = this.dataService.isSyncingCloud;
  readonly providerBalanceUsd = this.dataService.providerBalanceUsd;
  readonly isProviderBalanceLow = this.dataService.isProviderBalanceLow;
  readonly providerBalanceHealth = this.dataService.providerBalanceHealth;

  async logout(): Promise<void> {
    await this.dataService.logout();
  }

  async syncCloud(): Promise<void> {
    await this.dataService.syncCloudDatabase();
  }

  readonly urgentCount = computed(() => {
    return this.stats().expiringSoonClients;
  });

  readonly totalProviderSlotsFree = computed(() => {
    const accs = this.accounts();
    const capacity = accs.length * 2;
    const occupied = accs.reduce((sum, a) => sum + (a.assignedClientIds?.length || 0), 0);
    return Math.max(0, capacity - occupied);
  });

  readonly filteredClients = computed(() => {
    const list = this.clients();
    const query = (this.searchControl.value || '').toLowerCase().trim();
    const filter = this.statusFilter();
    const daysLimit = this.dataService.settings().reminderDaysBefore || 7;

    return list.filter((c) => {
      const days = getDaysRemaining(c.activeUntil);
      if (filter === 'active') {
        if (c.status === 'paused' || days < 0) return false;
      } else if (filter === 'expiring_soon') {
        if (c.status === 'paused' || days > daysLimit || days < 0) return false;
      } else if (filter === 'expired') {
        if (c.status === 'paused' || days >= 0) return false;
      } else if (filter === 'paused') {
        if (c.status !== 'paused') return false;
      }

      if (!query) return true;
      const phoneDigits = c.phone.replace(/[^\d]/g, '');
      const queryDigits = query.replace(/[^\d]/g, '');

      return (
        c.fullName.toLowerCase().includes(query) ||
        (c.groupName && c.groupName.toLowerCase().includes(query)) ||
        c.iptvLogin.toLowerCase().includes(query) ||
        (c.deviceInfo && c.deviceInfo.toLowerCase().includes(query)) ||
        (c.notes && c.notes.toLowerCase().includes(query)) ||
        c.phone.includes(query) ||
        (queryDigits.length > 2 && phoneDigits.includes(queryDigits))
      );
    });
  });

  readonly clientGroupingResult = computed<{
    groups: ClientGroupView[];
    singleClients: Client[];
  }>(() => {
    const list = this.filteredClients();
    const explicitBuckets = new Map<string, Client[]>();
    const remaining: Client[] = [];

    for (const c of list) {
      const gName = (c.groupName || '').trim();
      if (gName) {
        const arr = explicitBuckets.get(gName) || [];
        arr.push(c);
        explicitBuckets.set(gName, arr);
      } else {
        remaining.push(c);
      }
    }

    const autoBuckets = new Map<string, Client[]>();
    for (const c of remaining) {
      const cleanPhone = (c.phone || '').replace(/\D/g, '').slice(-9);
      const normName = (c.fullName || '').trim().toLowerCase();
      const key = cleanPhone.length >= 9 ? `phone:${cleanPhone}` : `name:${normName}`;
      const arr = autoBuckets.get(key) || [];
      arr.push(c);
      autoBuckets.set(key, arr);
    }

    const groups: ClientGroupView[] = [];
    const singleClients: Client[] = [];

    for (const [groupName, members] of explicitBuckets.entries()) {
      const explicitBal = members.find((m) => m.groupBalance !== undefined && m.groupBalance !== null)?.groupBalance;
      const fallbackBal = members.reduce((sum, m) => sum + (Number(m.balance) || 0), 0);
      const groupBalance = explicitBal !== undefined ? Number(explicitBal) : fallbackBal;
      const totalMonthlyPrice = members.reduce((sum, m) => sum + (Number(m.monthlyPrice) || 0), 0);

      groups.push({
        groupKey: `group:${groupName}`,
        groupName,
        groupBalance,
        isGrouped: true,
        clients: members,
        totalMonthlyPrice,
      });
    }

    for (const [, members] of autoBuckets.entries()) {
      if (members.length > 1) {
        const groupName = members[0].fullName || 'Група абонента';
        const groupBalance = members.reduce((sum, m) => sum + (Number(m.balance) || 0), 0);
        const totalMonthlyPrice = members.reduce((sum, m) => sum + (Number(m.monthlyPrice) || 0), 0);
        groups.push({
          groupKey: `auto:${groupName}:${members[0].id}`,
          groupName,
          groupBalance,
          isGrouped: false,
          clients: members,
          totalMonthlyPrice,
        });
      } else {
        singleClients.push(...members);
      }
    }

    groups.sort((a, b) => a.groupName.localeCompare(b.groupName, 'uk'));
    return { groups, singleClients };
  });

  readonly multiClientGroups = computed<ClientGroupView[]>(() => {
    return this.clientGroupingResult().groups;
  });

  readonly singleUngroupedClients = computed<Client[]>(() => {
    return this.clientGroupingResult().singleClients;
  });

  // Animated collapse/expand state for client groups (collapsed into single compact tile by default)
  readonly expandedClientGroupKeys = signal<string[]>([]);

  isClientGroupExpanded(groupKey: string): boolean {
    return this.expandedClientGroupKeys().includes(groupKey);
  }

  toggleClientGroup(groupKey: string, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.expandedClientGroupKeys.update((keys) =>
      keys.includes(groupKey) ? keys.filter((k) => k !== groupKey) : [...keys, groupKey]
    );
  }

  hasAnyExpandedClientGroup(): boolean {
    return this.expandedClientGroupKeys().length > 0;
  }

  collapseAllClientGroups(): void {
    this.expandedClientGroupKeys.set([]);
  }

  expandAllClientGroups(): void {
    this.expandedClientGroupKeys.set(this.multiClientGroups().map((g) => g.groupKey));
  }

  // Client Card Helpers
  getClientDays(activeUntil: string): number {
    return getDaysRemaining(activeUntil);
  }

  getCardAnimationDelay(idx: number): string {
    return `${Math.min(idx * 35, 350)}ms`;
  }

  getCleanPhone(phone: string): string {
    return cleanPhoneNumber(phone);
  }

  formatDate(dateStr: string): string {
    return formatDateUa(dateStr, true);
  }

  getAccountName(accountId?: string): string {
    if (!accountId) return '';
    const acc = this.accounts().find((a) => a.id === accountId);
    return acc ? acc.name : '';
  }

  copyLogin(client: Client, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(client.iptvLogin);
      this.copiedLoginId.set(client.id);
      setTimeout(() => {
        if (this.copiedLoginId() === client.id) {
          this.copiedLoginId.set(null);
        }
      }, 2000);
    }
  }

  // Client Modal Handlers
  openCreateClient(): void {
    this.selectedClientForEdit.set(null);
    this.presetGroupForNewClient.set(null);
    this.isClientModalOpen.set(true);
  }

  openCreateClientInGroup(group: ClientGroupView, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    const first = group.clients[0];
    this.selectedClientForEdit.set(null);
    this.presetGroupForNewClient.set({
      groupName: group.groupName,
      groupBalance: group.groupBalance,
      fullName: first?.fullName || group.groupName,
      phone: first?.phone || '',
    });
    this.isClientModalOpen.set(true);
  }

  openEditClient(client: Client, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.selectedClientForEdit.set(client);
    this.presetGroupForNewClient.set(null);
    this.isClientModalOpen.set(true);
  }

  closeClientModal(): void {
    this.isClientModalOpen.set(false);
    this.selectedClientForEdit.set(null);
    this.presetGroupForNewClient.set(null);
  }

  // Payment Modal Handlers
  openPaymentModal(client: Client, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.selectedClientForPayment.set(client);
    this.isPaymentModalOpen.set(true);
  }

  closePaymentModal(): void {
    this.isPaymentModalOpen.set(false);
    this.selectedClientForPayment.set(null);
  }

  async deleteClientConfirm(client: Client, event?: Event): Promise<void> {
    if (event) {
      event.stopPropagation();
    }
    await this.dataService.deleteClient(client.id);
  }

  sendViberReminder(client: Client, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    const settings = this.dataService.settings();
    const tmpl = settings.viberReminderMessageTemplate || DEFAULT_VIBER_REMINDER_TEMPLATE;
    const todayFormatted = formatDateUa(new Date().toISOString().split('T')[0], true);
    const expiryFormatted = formatDateUa(client.activeUntil, true);
    const amountToPay = Math.max(0, (client.monthlyPrice || 100) - (client.balance || 0));

    const text = interpolateViberMessage(tmpl, {
      name: client.fullName,
      login: client.iptvLogin,
      phone: client.phone,
      activeUntil: expiryFormatted,
      currentDate: todayFormatted,
      amount: amountToPay,
      price: client.monthlyPrice || 100,
      card: settings.cardRequisites || '',
      balance: client.balance || 0,
      device: client.deviceInfo || '',
      notes: client.notes || '',
    });

    const cleanPhone = client.phone.replace(/\D/g, '');
    let formattedPhone = cleanPhone;
    if (cleanPhone.length === 9) {
      formattedPhone = `380${cleanPhone}`;
    } else if (cleanPhone.length === 10 && cleanPhone.startsWith('0')) {
      formattedPhone = `380${cleanPhone.substring(1)}`;
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
    if (typeof window !== 'undefined') {
      window.location.href = `viber://chat?number=${formattedPhone}&draft=${encodeURIComponent(text)}`;
    }
  }

  // Group Management Modal Handlers
  openCreateGroupModal(): void {
    this.editingGroupOriginalName.set('');
    this.groupFormName.setValue('');
    this.groupFormBalance.setValue(0);
    this.groupModalSearch.setValue('');
    this.selectedGroupClientIds.set([]);
    this.isGroupModalOpen.set(true);
  }

  openEditGroupModal(group: ClientGroupView, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.editingGroupOriginalName.set(group.groupName);
    this.groupFormName.setValue(group.groupName);
    this.groupFormBalance.setValue(group.groupBalance);
    this.groupModalSearch.setValue('');
    this.selectedGroupClientIds.set(group.clients.map((c) => c.id));
    this.isGroupModalOpen.set(true);
  }

  closeGroupModal(): void {
    this.isGroupModalOpen.set(false);
  }

  isClientSelectedInGroupModal(clientId: string): boolean {
    return this.selectedGroupClientIds().includes(clientId);
  }

  toggleClientInGroupModal(client: Client): void {
    this.selectedGroupClientIds.update((ids) => {
      const exists = ids.includes(client.id);
      const next = exists ? ids.filter((id) => id !== client.id) : [...ids, client.id];
      if (!exists && !(this.groupFormName.value || '').trim()) {
        this.groupFormName.setValue(client.fullName);
      }
      return next;
    });
  }

  readonly filteredClientsForGroupModal = computed<Client[]>(() => {
    const q = (this.groupModalSearch.value || '').toLowerCase().trim();
    const all = this.clients();
    if (!q) return all;
    return all.filter(
      (c) =>
        c.fullName.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.iptvLogin.toLowerCase().includes(q) ||
        (c.groupName || '').toLowerCase().includes(q)
    );
  });

  async saveGroupModal(): Promise<void> {
    const groupName = (this.groupFormName.value || '').trim();
    const groupBalance = Number(this.groupFormBalance.value) || 0;
    const clientIds = this.selectedGroupClientIds();
    if (!groupName || clientIds.length === 0) return;

    this.isSavingGroup.set(true);
    try {
      const ok = await this.dataService.saveClientGroup({
        groupName,
        previousGroupName: this.editingGroupOriginalName() || undefined,
        groupBalance,
        clientIds,
      });
      if (ok) {
        this.isGroupModalOpen.set(false);
      }
    } finally {
      this.isSavingGroup.set(false);
    }
  }

  async dissolveGroupConfirm(group: ClientGroupView, event?: Event): Promise<void> {
    if (event) {
      event.stopPropagation();
    }
    await this.dataService.saveClientGroup({
      groupName: '',
      previousGroupName: group.groupName,
      groupBalance: 0,
      clientIds: group.clients.map((c) => c.id),
    });
  }

  async autoGroupAllClients(): Promise<void> {
    await this.dataService.autoGroupClients();
  }
}
