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
  | 'clients'
  | 'accounts'
  | 'budget'
  | 'analytics'
  | 'payments'
  | 'electricity'
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
  readonly publishDateTime = '05.11.2026, 23:30 (Київ)';
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
    { id: 'electricity', label: '⚡ Електро' },
    { id: 'water_waste', label: '💧 Вода/Сміття' },
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
    const currentTabs = Array.isArray(user.allowedTabs) && user.allowedTabs.length > 0
      ? [...user.allowedTabs]
      : ['electricity', 'water_waste'] as AppTabId[];
    const exists = currentTabs.includes(tab);
    const nextTabs = exists ? currentTabs.filter((t) => t !== tab) : [...currentTabs, tab];
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

  // Active navigation tab
  readonly activeTab = signal<ActiveTab>('electricity');
  readonly allowedTabs = this.dataService.allowedTabs;

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
      case 'electricity':
        return {
          category: 'Комунальні сервіси',
          title: 'Електроенергія (ДТЕК / ООЕК)',
          icon: 'bolt',
          iconColor: 'text-amber-500',
        };
      case 'water_waste':
        return {
          category: 'Комунальні сервіси',
          title: 'Водопостачання та вивіз сміття',
          icon: 'water_drop',
          iconColor: 'text-cyan-500',
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
      const user = this.currentUser();
      const allowed = this.allowedTabs();
      const current = this.activeTab();
      if (!user || user.role === 'admin') return;
      if (current === 'users' || !allowed.includes(current as AppTabId)) {
        const fallback = (allowed[0] as ActiveTab) || 'electricity';
        if (fallback && fallback !== current) {
          this.activeTab.set(fallback);
        }
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

  // Client filtering & search
  readonly searchControl = new FormControl('');
  readonly statusFilter = signal<FilterStatus>('all');

  // Modals state
  readonly isClientModalOpen = signal<boolean>(false);
  readonly selectedClientForEdit = signal<Client | null>(null);

  readonly isPaymentModalOpen = signal<boolean>(false);
  readonly selectedClientForPayment = signal<Client | null>(null);

  // Copied feedback
  readonly copiedLoginId = signal<string | null>(null);

  // Computed data
  readonly clients = this.dataService.clients;
  readonly stats = this.dataService.stats;
  readonly accounts = this.dataService.accounts;
  readonly budgetSummary = this.dataService.budgetSummary;
  readonly dbStatus = this.dataService.dbStatus;
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
      // 1. Status Filter
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

      // 2. Search Query
      if (!query) return true;
      const phoneDigits = c.phone.replace(/[^\d]/g, '');
      const queryDigits = query.replace(/[^\d]/g, '');

      return (
        c.fullName.toLowerCase().includes(query) ||
        c.iptvLogin.toLowerCase().includes(query) ||
        (c.deviceInfo && c.deviceInfo.toLowerCase().includes(query)) ||
        (c.notes && c.notes.toLowerCase().includes(query)) ||
        c.phone.includes(query) ||
        (queryDigits.length > 2 && phoneDigits.includes(queryDigits))
      );
    });
  });

  setTab(tab: ActiveTab): void {
    this.activeTab.set(tab);
    this.isMobileIptvDrawerOpen.set(false);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  setFilter(filter: FilterStatus): void {
    this.statusFilter.set(filter);
  }

  getCardAnimationDelay(index: number): string {
    return `${Math.min(index * 25, 250)}ms`;
  }

  openCreateClient(): void {
    this.selectedClientForEdit.set(null);
    this.isClientModalOpen.set(true);
  }

  openEditClient(client: Client): void {
    this.selectedClientForEdit.set(client);
    this.isClientModalOpen.set(true);
  }

  openPaymentModal(client: Client): void {
    this.selectedClientForPayment.set(client);
    this.isPaymentModalOpen.set(true);
  }

  sendViberReminder(client: Client): void {
    const cleanPhone = client.phone.replace(/\D/g, '');
    let formattedPhone = cleanPhone;
    if (cleanPhone.length === 9) {
      formattedPhone = `380${cleanPhone}`;
    } else if (cleanPhone.length === 10 && cleanPhone.startsWith('0')) {
      formattedPhone = `380${cleanPhone.substring(1)}`;
    }
    const settings = this.dataService.settings();
    const tmpl = settings.viberReminderMessageTemplate || DEFAULT_VIBER_REMINDER_TEMPLATE;
    const expiry = formatDateUa(client.activeUntil, true);
    const todayFormatted = formatDateUa(new Date().toISOString().split('T')[0], true);
    const amount = client.monthlyPrice || settings.defaultMonthlyPrice || 100;

    const text = interpolateViberMessage(tmpl, {
      name: client.fullName,
      login: client.iptvLogin,
      phone: client.phone,
      activeUntil: expiry,
      currentDate: todayFormatted,
      amount: amount,
      price: client.monthlyPrice || settings.defaultMonthlyPrice || 100,
      card: settings.cardRequisites || '',
      balance: client.balance || 0,
      months: 1,
      device: client.deviceInfo || '',
      notes: client.notes || '',
    });

    const viberUrl = `viber://chat?number=${formattedPhone}&draft=${encodeURIComponent(text)}`;
    window.open(viberUrl, '_blank');
  }

  async deleteClientConfirm(client: Client): Promise<void> {
    const ok = confirm(`Ви дійсно бажаєте видалити абонента ${client.fullName} (${client.iptvLogin})?`);
    if (ok) {
      await this.dataService.deleteClient(client.id);
    }
  }

  copyLogin(login: string, clientId: string): void {
    navigator.clipboard.writeText(login);
    this.copiedLoginId.set(clientId);
    setTimeout(() => {
      if (this.copiedLoginId() === clientId) {
        this.copiedLoginId.set(null);
      }
    }, 2000);
  }

  formatDate(dateStr: string): string {
    return formatDateUa(dateStr, true);
  }

  getClientDays(activeUntil: string): number {
    return getDaysRemaining(activeUntil);
  }

  getDaysText(days: number): string {
    if (days < 0) return `Прострочено ${Math.abs(days)} дн.`;
    if (days === 0) return 'Сьогодні!';
    if (days === 1) return 'Завтра';
    return `${days} дн.`;
  }

  getCleanPhone(phone: string): string {
    return cleanPhoneNumber(phone);
  }

  getAccountName(accountId?: string): string {
    if (!accountId) return '';
    const acc = this.accounts().find((a) => a.id === accountId);
    return acc ? acc.name : '';
  }
}
