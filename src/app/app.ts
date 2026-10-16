import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { IptvData } from './services/iptv-data';
import { TelegramWebApp } from './services/telegram-web-app';
import {
  Client,
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

type ActiveTab = 'clients' | 'accounts' | 'budget' | 'analytics' | 'payments' | 'electricity' | 'water_waste' | 'users' | 'settings';
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

  // Application metadata for user tracking
  readonly appVersion = 'v2.0';
  readonly publishDateTime = '24.09.2026, 12:05 (Київ)';

  // User Auth and Permissions
  readonly currentUser = this.dataService.currentUser;
  readonly isAuthenticated = this.dataService.isAuthenticated;
  readonly isAuthLoading = this.dataService.isAuthLoading;
  readonly isAdmin = this.dataService.isAdmin;
  readonly isViewer = this.dataService.isViewer;
  readonly isNewUser = this.dataService.isNewUser;
  readonly canEdit = this.dataService.canEdit;
  readonly canView = this.dataService.canView;
  readonly pendingUsersCount = this.dataService.pendingUsersCount;

  // Auto-sync status
  readonly autoSyncActive = this.dataService.autoSyncActive;
  readonly lastAutoSyncTime = this.dataService.lastAutoSyncTime;

  // Active navigation tab
  readonly activeTab = signal<ActiveTab>('clients');

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
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
