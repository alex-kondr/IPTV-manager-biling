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
  AppUser,
  HouseholdAccessLevel,
  MemberRelationTag,
  MemberRelationTagMeta,
  MEMBER_RELATION_TAGS,
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
import { ThemeService } from './services/theme';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

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
  readonly themeService = inject(ThemeService);
  readonly tgApp = inject(TelegramWebApp);
  readonly Math = Math;

  // Application metadata for user tracking (v4.2)
  readonly appVersion = 'v4.2';
  readonly publishDateTime = '12.11.2026 (Київ)';
  readonly sharedAppUrl = 'https://ais-pre-xwrvn3here3zzs7lwxjyvb-427445800479.europe-west2.run.app';
  readonly devAppUrl = 'https://ais-dev-xwrvn3here3zzs7lwxjyvb-427445800479.europe-west2.run.app';
  readonly copiedAppUrl = signal<boolean>(false);

  // IPTV Grouped Tree (Desktop Sidebar) & Drawer (Mobile) State
  readonly isSidebarIptvOpen = signal<boolean>(true);
  readonly isMobileIptvDrawerOpen = signal<boolean>(false);

  // PWA Installation & Offline State
  readonly isOnline = signal<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  readonly deferredInstallPrompt = signal<BeforeInstallPromptEvent | null>(null);
  readonly isAppInstalled = signal<boolean>(false);
  readonly isIOSDevice = signal<boolean>(false);
  readonly showIOSInstallGuide = signal<boolean>(false);



  async triggerPwaInstall(): Promise<void> {
    const promptEvent = this.deferredInstallPrompt();
    if (promptEvent) {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      if (outcome === 'accepted') {
        this.isAppInstalled.set(true);
        this.deferredInstallPrompt.set(null);
      }
    } else if (this.isIOSDevice()) {
      this.showIOSInstallGuide.set(true);
    } else {
      alert('Щоб встановити HomeHub на пристрій:\n\n• На Android / Chrome: Торкніться меню (⋮) ➔ "Встановити додаток" або "Додати на початковий екран".\n• На iPhone / Safari: Торкніться кнопки "Поділитися" (Share) ➔ "На початковий екран".');
    }
  }

  // User Auth and Permissions
  readonly currentUser = this.dataService.currentUser;
  readonly isAuthenticated = this.dataService.isAuthenticated;
  readonly isAuthLoading = this.dataService.isAuthLoading;
  readonly isAdmin = this.dataService.isAdmin;
  readonly isRealAdmin = this.dataService.isRealAdmin;
  readonly isImpersonating = this.dataService.isImpersonating;
  readonly isViewer = this.dataService.isViewer;
  readonly isNewUser = this.dataService.isNewUser;
  readonly isUserBlocked = this.dataService.isUserBlocked;
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

  readonly unpaidElectricityInfo = computed<{ hasUnpaid: boolean; totalAmount: number }>(() => {
    const accounts = this.dataService.utilityAccounts();
    const readings = this.dataService.utilityReadings();

    const unpaidReadings = readings.filter(
      (r) =>
        r.utilityType === 'electricity' &&
        !r.isPaid &&
        !r.isControlOnly &&
        r.readingPurpose !== 'control' &&
        (Number(r.totalCost) || 0) > 0
    );
    const unpaidReadingsSum = unpaidReadings.reduce((sum, r) => sum + (Number(r.totalCost) || 0), 0);

    let unpaidOoekSum = 0;
    for (const acc of accounts) {
      if (acc.type === 'electricity' || !acc.type) {
        const bal = Number(acc.ooekBalanceUah) || 0;
        if (bal > 0) {
          unpaidOoekSum += bal;
        }
      }
    }

    const hasUnpaid = unpaidReadings.length > 0 || unpaidOoekSum > 0;
    const totalAmount = unpaidOoekSum > 0 ? unpaidOoekSum : unpaidReadingsSum;
    return { hasUnpaid, totalAmount: Math.round(totalAmount * 100) / 100 };
  });

  readonly iptvBillingAlertStatus = computed<'critical' | 'warning' | null>(() => {
    const provBal = this.dataService.providerBalanceUsd();
    const clientsList = this.dataService.clients();

    let hasCriticalClient = false;
    let hasWarningClient = false;

    for (const c of clientsList) {
      if (c.status === 'paused') continue;
      if (!c.activeUntil) continue;
      const days = getDaysRemaining(c.activeUntil);
      if (days <= 7) {
        hasCriticalClient = true;
        break;
      } else if (days <= 10) {
        hasWarningClient = true;
      }
    }

    const isProvCritical = typeof provBal === 'number' && !isNaN(provBal) && provBal <= 3;
    const isProvWarning = typeof provBal === 'number' && !isNaN(provBal) && provBal <= 5;

    if (hasCriticalClient || isProvCritical) {
      return 'critical';
    }
    if (hasWarningClient || isProvWarning) {
      return 'warning';
    }
    return null;
  });

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

    if (typeof window !== 'undefined') {
      this.isOnline.set(window.navigator.onLine);
      window.addEventListener('online', () => {
        this.isOnline.set(true);
        void this.dataService.refreshAllData();
      });
      window.addEventListener('offline', () => {
        this.isOnline.set(false);
      });

      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      this.isAppInstalled.set(isStandalone);

      const ua = window.navigator.userAgent.toLowerCase();
      const isIOS = /iphone|ipad|ipod/.test(ua);
      this.isIOSDevice.set(isIOS);

      window.addEventListener('beforeinstallprompt', (e: Event) => {
        e.preventDefault();
        this.deferredInstallPrompt.set(e as BeforeInstallPromptEvent);
      });

      window.addEventListener('appinstalled', () => {
        this.isAppInstalled.set(true);
        this.deferredInstallPrompt.set(null);
      });

      // Initialize Web Push & Service Worker
      void this.dataService.initWebPushState();

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data?.type === 'OPEN_TAB' && event.data?.tab) {
            this.setTab(event.data.tab as ActiveTab);
          }
        });
      }

      // Check URL query params for ?tab=... or ?invite=...
      try {
        const params = new URLSearchParams(window.location.search);
        const tabParam = params.get('tab');
        if (tabParam === 'outage_schedule' || tabParam === 'electricity' || tabParam === 'budget') {
          this.activeTab.set(tabParam as ActiveTab);
        }
        const inviteParam = params.get('invite');
        if (inviteParam) {
          this.joinInviteInputControl.setValue(inviteParam);
          void this.dataService.fetchInvitePreview(inviteParam).then((inv) => {
            if (inv) {
              this.dataService.isSharedHouseholdModalOpen.set(true);
            }
          });
        }
      } catch {
        // ignore
      }
    }
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

  private ensureTabDataLoaded(tab: ActiveTab): void {
    if (tab === 'accounts') {
      void this.dataService.fetchAccounts(true);
      void this.dataService.fetchBudget(true);
      void this.dataService.fetchClients(true);
    } else if (tab === 'budget') {
      void this.dataService.fetchBudget(true);
      void this.dataService.fetchAccounts(true);
      void this.dataService.fetchClients(true);
      void this.dataService.fetchPayments(true);
    } else if (tab === 'clients') {
      void this.dataService.fetchClients(true);
      void this.dataService.fetchAccounts(true);
    } else if (tab === 'payments') {
      void this.dataService.fetchPayments(true);
      void this.dataService.fetchClients(true);
    } else if (tab === 'analytics') {
      void this.dataService.fetchStats(true);
      void this.dataService.fetchBudget(true);
      void this.dataService.fetchAccounts(true);
    }
  }

  selectIptvSubTab(tab: ActiveTab): void {
    this.activeTab.set(tab);
    this.isSidebarIptvOpen.set(true);
    this.isMobileIptvDrawerOpen.set(false);
    this.ensureTabDataLoaded(tab);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  setTab(tab: ActiveTab): void {
    this.activeTab.set(tab);
    this.isMobileIptvDrawerOpen.set(false);
    this.ensureTabDataLoaded(tab);
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
  readonly isProfileModalOpen = signal<boolean>(false);

  // App Release Update Modal (v4.0 -> v4.2)
  readonly appReleaseInfo = this.dataService.appReleaseInfo;
  readonly isUpdateModalOpen = this.dataService.isUpdateModalOpen;
  readonly isDismissingUpdate = this.dataService.isDismissingUpdate;

  readonly releaseFeaturesV4: {
    icon: string;
    badge: string;
    title: string;
    description: string;
    colorClass: string;
  }[] = [
    {
      icon: 'send_and_archive',
      badge: 'ДТЕК ОЕМ Покази (Крок 1)',
      title: 'Кнопка «Хочу передати покази» та перевірка адреси за особовим рахунком',
      description:
        'Прямий запит checkAddress до сервера ДТЕК ОЕМ з автоматичним очищенням нулів після скісної риски (напр. 34023/2729), отриманням моделі й номера лічильника, зон споживання та адреси.',
      colorClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30',
    },
    {
      icon: 'timer',
      badge: 'Системні опції',
      title: 'Налаштування інтервалу оновлення графіку та чисті поля нового будинку',
      description:
        'Можливість у системних налаштуваннях обирати період оновлення кешу графіку відключень (10, 15, 20, 30, 60 хв), а також очищені дефолтні значення населеного пункту і вулиці при створенні нового рахунку.',
      colorClass: 'bg-purple-500/15 text-purple-600 dark:text-purple-300 border-purple-500/30',
    },
    {
      icon: 'qr_code_2',
      badge: 'Спільний дім та бюджет',
      title: 'Приєднання за QR-кодом з вибором ролі та чисте посилання',
      description:
        'Миттєва генерація QR-коду для приєднання до спільного будинку й бюджету з вибором типу користувача у випадаючому списку (Дружина, Чоловік, Батько, Мати, Брат, Сестра, Бабуся, Дідусь тощо), а також окреме чисте посилання на застосунок https://homehub3.ai.studio/.',
      colorClass: 'bg-teal-500/15 text-teal-600 dark:text-teal-300 border-teal-500/30',
    },
    {
      icon: 'notifications_active',
      badge: 'Графік світла ДТЕК',
      title: 'Швидка кнопка «Підписатись» / «Відписатись» біля бейджа черги',
      description:
        'У вкладці «Графік світла» поруч із бейджем черги (напр. GPV4.1) додано кнопку швидкої підписки на push-сповіщення про зміни графіку. При активній підписці кнопка змінюється на «Відписатись» із перекресленим дзвіночком.',
      colorClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30',
    },
    {
      icon: 'cloud_sync',
      badge: 'Оптимізація та кеш БД',
      title: 'Централізований кеш графіку ДТЕК у БД (оновлення раз на 20 хв)',
      description:
        'Графік відключень тепер централізовано кешується у PostgreSQL для кожної адреси та оновлюється сервером раз на 20 хвилин для всіх користувачів без зайвого навантаження на сайт ДТЕК.',
      colorClass: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border-indigo-500/30',
    },
    {
      icon: 'share',
      badge: '11 варіантів графіку',
      title: 'Офіційний вигляд ДТЕК (#11) та шеринг обраного варіанту в PNG',
      description:
        'Додано 11-й офіційний табличний стиль графіку ДТЕК, а кнопка «Поділитись графіком» тепер генерує якісне PNG-зображення саме того варіанту вигляду (1–11), який ви обрали.',
      colorClass: 'bg-sky-500/15 text-sky-600 dark:text-sky-300 border-sky-500/30',
    },
    {
      icon: 'wifi_off',
      badge: 'Мобільний інтерфейс та мережа',
      title: 'Компактний верхній бар, вікно профілю та індикатор втрати звʼязку',
      description:
        'На мобільних пристроях верхній бар оптимізовано без накладань: налаштування («Опції»), «Доступ» для адміністратора та вихід зібрані у вікні профілю, а індикатор мережі стає червоним при втраті звʼязку (Офлайн).',
      colorClass: 'bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-500/30',
    },
    {
      icon: 'electric_meter',
      badge: 'Облік та налаштування',
      title: 'Зони «День (Т2)» / «Ніч (Т1)», попередня дата показів та таблиця БД',
      description:
        'При внесенні показів автоматично підставляється попередня дата для передачі станом на 1 число, оновлено підписи зон лічильника та додано інтерактивну таблицю системних і користувацьких параметрів БД.',
      colorClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30',
    },
  ];

  openProfileModal(): void {
    this.isProfileModalOpen.set(true);
  }

  closeProfileModal(): void {
    this.isProfileModalOpen.set(false);
  }

  openUpdateModal(): void {
    this.isProfileModalOpen.set(false);
    this.dataService.openUpdateModal();
  }

  closeUpdateModal(): void {
    this.dataService.closeUpdateModal();
  }

  async dismissUpdateForever(): Promise<void> {
    await this.dataService.dismissAppReleaseForUser(this.appVersion);
  }

  openTabFromProfileModal(tab: ActiveTab): void {
    this.isProfileModalOpen.set(false);
    this.setTab(tab);
  }

  openSharedHouseholdFromProfileModal(): void {
    this.isProfileModalOpen.set(false);
    this.openSharedHouseholdModal();
  }

  async logoutFromProfileModal(): Promise<void> {
    this.isProfileModalOpen.set(false);
    await this.logout();
  }

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
    this.isProfileModalOpen.set(false);
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

  // ============================================================================
  // SHARED HOUSEHOLD & BUDGET INVITE MODAL + WEB PUSH HELPERS
  // ============================================================================
  readonly isSharedHouseholdModalOpen = this.dataService.isSharedHouseholdModalOpen;
  readonly householdInvites = this.dataService.householdInvites;
  readonly sharedHouseholdMembers = this.dataService.sharedHouseholdMembers;
  readonly pendingInvitePreview = this.dataService.pendingInvitePreview;
  readonly isCreatingInvite = this.dataService.isCreatingInvite;
  readonly isAcceptingInvite = this.dataService.isAcceptingInvite;
  readonly relationTagsCatalog: MemberRelationTagMeta[] = MEMBER_RELATION_TAGS;

  readonly modalInviteAccessLevel = signal<HouseholdAccessLevel>('view_only'); // Default "Тільки для перегляду"
  readonly modalInviteIncludeBudget = signal<boolean>(true);
  readonly modalInviteSelectedTags = signal<MemberRelationTag[]>(['family']);
  readonly modalInviteHouseIds = signal<string[]>([]);
  readonly joinInviteInputControl = new FormControl<string>('');
  readonly copiedHouseholdInviteCode = signal<string>('');
  readonly copiedCleanAppLink = signal<boolean>(false);

  // Instant QR Code & Clean App Link signals from DataService
  readonly publicAppBaseUrl = this.dataService.publicAppBaseUrl;
  readonly qrInviteCode = this.dataService.qrInviteCode;
  readonly qrInviteFullUrl = this.dataService.qrInviteFullUrl;
  readonly qrInviteDataUrl = this.dataService.qrInviteDataUrl;
  readonly cleanAppQrDataUrl = this.dataService.cleanAppQrDataUrl;
  readonly qrInviteUserType = this.dataService.qrInviteUserType;
  readonly qrInviteAccessLevel = this.dataService.qrInviteAccessLevel;
  readonly isGeneratingQrInvite = this.dataService.isGeneratingQrInvite;

  // Web Push signals
  readonly isPushSupported = this.dataService.isPushSupported;
  readonly isPushSubscribed = this.dataService.isPushSubscribed;
  readonly isPushLoading = this.dataService.isPushLoading;
  readonly pushStatusMessage = this.dataService.pushStatusMessage;
  readonly pushCountdownSeconds = this.dataService.pushCountdownSeconds;

  openSharedHouseholdModal(): void {
    this.dataService.openSharedHouseholdModal();
  }

  closeSharedHouseholdModal(): void {
    this.dataService.closeSharedHouseholdModal();
  }

  getRelationTagMeta(tagId: string): MemberRelationTagMeta | undefined {
    return this.relationTagsCatalog.find((t) => t.id === tagId);
  }

  getSelectedModalInviteRelation(): MemberRelationTag {
    const tags = this.modalInviteSelectedTags();
    return tags.length > 0 ? tags[0] : 'family';
  }

  setModalInviteRelation(tagId: string): void {
    const clean = (tagId || '').trim() as MemberRelationTag;
    this.modalInviteSelectedTags.set(clean ? [clean] : ['family']);
    void this.dataService.updateQrInviteOptions({ userType: clean || 'family' });
  }

  async setQrInviteUserType(tagId: string): Promise<void> {
    const clean = (tagId || 'family').trim() as MemberRelationTag;
    this.modalInviteSelectedTags.set([clean]);
    await this.dataService.updateQrInviteOptions({ userType: clean });
  }

  async setQrInviteAccessLevel(level: HouseholdAccessLevel): Promise<void> {
    this.modalInviteAccessLevel.set(level);
    await this.dataService.updateQrInviteOptions({ accessLevel: level });
  }

  async generateNewQrInviteCode(): Promise<void> {
    const inv = await this.dataService.generateFreshQrInvite(false);
    if (inv?.code) {
      this.copyHouseholdInviteLink(inv.code);
    }
  }

  copyCleanAppUrl(): void {
    const url = this.publicAppBaseUrl;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(url);
      this.copiedCleanAppLink.set(true);
      setTimeout(() => {
        this.copiedCleanAppLink.set(false);
      }, 2500);
    }
  }

  async shareCleanAppUrl(): Promise<void> {
    const url = this.publicAppBaseUrl;
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    if (nav && typeof nav.share === 'function') {
      try {
        await nav.share({
          title: 'HomeHub — Комунальні послуги, графік ДТЕК та бюджет',
          text: 'Застосунок для обліку комунальних послуг, графіків відключень світла ДТЕК та домашнього бюджету:',
          url,
        });
        return;
      } catch {
        // fallback to copy
      }
    }
    this.copyCleanAppUrl();
  }

  async shareQrInviteUrl(): Promise<void> {
    const code = this.qrInviteCode();
    const url = this.qrInviteFullUrl();
    const relMeta = this.getRelationTagMeta(this.qrInviteUserType());
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    if (nav && typeof nav.share === 'function') {
      try {
        await nav.share({
          title: 'Запрошення до спільного дому та бюджету — HomeHub',
          text: `Приєднуйтесь до нашого спільного будинку та бюджету (${relMeta?.label || 'Сімʼя'}) за посиланням:`,
          url,
        });
        return;
      } catch {
        // fallback to copy
      }
    }
    if (code) {
      this.copyHouseholdInviteLink(code);
    }
  }

  toggleModalInviteTag(tagId: MemberRelationTag): void {
    this.modalInviteSelectedTags.set([tagId]);
  }

  isModalInviteHouseChecked(houseId: string): boolean {
    const sel = this.modalInviteHouseIds();
    if (sel.length === 0) return true;
    return sel.includes(houseId);
  }

  toggleModalInviteHouse(houseId: string): void {
    const allIds = this.dataService.utilityAccounts().map((a) => a.id);
    const curr = this.modalInviteHouseIds().length > 0 ? this.modalInviteHouseIds() : allIds;
    if (curr.includes(houseId)) {
      if (curr.length <= 1) return;
      this.modalInviteHouseIds.set(curr.filter((id) => id !== houseId));
    } else {
      this.modalInviteHouseIds.set([...curr, houseId]);
    }
  }

  async createHouseholdInviteFromModal(): Promise<void> {
    const allIds = this.dataService.utilityAccounts().map((a) => a.id);
    const houseIds = this.modalInviteHouseIds().length > 0 ? this.modalInviteHouseIds() : allIds;
    const primaryTag = this.getSelectedModalInviteRelation();
    const inv = await this.dataService.createHouseholdInvite({
      houseIds,
      accessLevel: this.modalInviteAccessLevel(),
      includeSharedBudget: this.modalInviteIncludeBudget(),
      memberTags: [primaryTag],
    });
    if (inv) {
      this.copyHouseholdInviteLink(inv.code);
    }
  }

  getHouseholdInviteUrl(code: string): string {
    return this.dataService.buildInviteUrl(code);
  }

  copyHouseholdInviteLink(code: string): void {
    const url = this.dataService.buildInviteUrl(code);
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(url);
      this.copiedHouseholdInviteCode.set(code);
      setTimeout(() => {
        if (this.copiedHouseholdInviteCode() === code) {
          this.copiedHouseholdInviteCode.set('');
        }
      }, 2500);
    }
  }

  async deleteHouseholdInviteFromModal(id: string): Promise<void> {
    await this.dataService.deleteHouseholdInvite(id);
  }

  async previewOrJoinInviteByCode(): Promise<void> {
    const raw = (this.joinInviteInputControl.value || '').trim();
    if (!raw) return;
    await this.dataService.fetchInvitePreview(raw);
  }

  async confirmAcceptInvite(code: string): Promise<void> {
    const ok = await this.dataService.acceptHouseholdInvite(code);
    if (ok && typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.searchParams.has('invite')) {
        url.searchParams.delete('invite');
        window.history.replaceState({}, '', url.toString());
      }
    }
  }

  getMemberAccessLevel(member: AppUser): HouseholdAccessLevel {
    if (member.householdAccessLevel === 'view_only' || member.householdAccessLevel === 'full') {
      return member.householdAccessLevel;
    }
    return member.canManageOwnData === false ? 'view_only' : 'full';
  }

  async toggleSharedMemberAccessLevel(member: AppUser, level: HouseholdAccessLevel): Promise<void> {
    await this.dataService.updateUserPermissions(member.id, {
      householdAccessLevel: level,
      canManageOwnData: level === 'full',
    });
    await this.dataService.fetchHouseholdInvites();
  }

  getMemberPrimaryRelation(member: AppUser): MemberRelationTag {
    const list = Array.isArray(member.memberTags) ? member.memberTags : [];
    return list.length > 0 ? list[0] : 'family';
  }

  async setSharedMemberRelation(member: AppUser, tagId: string): Promise<void> {
    const clean = (tagId || '').trim() as MemberRelationTag;
    const next: MemberRelationTag[] = clean ? [clean] : ['family'];
    await this.dataService.updateUserPermissions(member.id, {
      memberTags: next,
    });
    await this.dataService.fetchHouseholdInvites();
  }

  async toggleSharedMemberTag(member: AppUser, tagId: MemberRelationTag): Promise<void> {
    await this.setSharedMemberRelation(member, tagId);
  }
}
