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
import { IptvData, ScheduleChangeLogEntry } from './services/iptv-data';
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
  HOME_MENU_TILE_OPTIONS,
  HomeMenuTileMeta,
} from './models/client.model';
import { resolveWasteRate, UtilityAccount } from './models/utility.model';
import { ShoppingList, computeShoppingItemTotal } from './models/shopping.model';
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
import { ShoppingView } from './components/shopping-view/shopping-view';
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
  | 'shopping'
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
    ShoppingView,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  readonly dataService = inject(IptvData);
  readonly themeService = inject(ThemeService);
  readonly Math = Math;

  // Application metadata for user tracking (v6.0)
  readonly appVersion = 'v6.0';
  readonly appVersionNumeric = '6.0';
  readonly publishDateTime = '22.11.2026 07:30 (Київ)';
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
      void this.dataService.showAlertMessage(
        'Встановлення HomeHub',
        '• На Android / Chrome: Торкніться меню (⋮) ➔ "Встановити додаток" або "Додати на початковий екран".\n• На iPhone / Safari: Торкніться "Поділитися" ➔ "На початковий екран".'
      );
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
  readonly isLoading = this.dataService.isLoading;
  readonly canEdit = this.dataService.canEdit;
  readonly canView = this.dataService.canView;
  readonly pendingUsersCount = this.dataService.pendingUsersCount;
  readonly adminUtilityAccounts = this.dataService.adminUtilityAccounts;

  readonly hasNoHousesAdded = computed<boolean>(
    () => this.dataService.utilityAccounts().length === 0
  );

  readonly canAddFirstHouse = computed<boolean>(
    () =>
      this.canEdit() &&
      (this.isTabAllowed('electricity') ||
        this.isTabAllowed('water') ||
        this.isTabAllowed('waste'))
  );

  openAddNewHouseFlow(): void {
    if (!this.canAddFirstHouse()) return;
    this.dataService.pendingOpenAddHouseModal.set(true);
    if (this.isTabAllowed('electricity')) {
      this.setTab('electricity');
    } else if (this.isTabAllowed('water')) {
      this.setTab('water');
    } else if (this.isTabAllowed('waste')) {
      this.setTab('waste');
    }
  }

  readonly sandboxTabs: { id: AppTabId; label: string }[] = [
    { id: 'outage_schedule', label: '💡 Графік світла' },
    { id: 'electricity', label: '⚡ Електро' },
    { id: 'water', label: '💧 Вода' },
    { id: 'waste', label: '🗑️ Вивіз сміття' },
    { id: 'shopping', label: '🛒 Покупки' },
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
      case 'shopping':
        return {
          imageUrl: '/assets/images/tile_settings_database_1794223833366.jpg',
          title: 'Спільні покупки',
          subtitle: 'Списки покупок з обраними людьми, контроль бюджету та швидкий каталог товарів',
          badge: 'Покупки',
          accentClass: 'from-slate-950/90 via-rose-950/75 to-slate-950/90',
          pageTintClass: 'from-rose-950/15 via-slate-100/92 to-slate-100/95',
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
  readonly dtekQueueDigits = computed<string>(() => {
    const raw = (this.dtekInfo()?.queueGroup || '').trim();
    if (!raw) return '';
    const match = raw.match(/\d+(?:\.\d+)?/);
    return match ? match[0] : '';
  });
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

  readonly homeDashboardSummary = computed(() => {
    const elecAccs = this.electricityAccounts();
    const waterAccs = this.waterAccounts();
    const wasteAccs = this.wasteAccounts();
    const readings = this.utilityReadings();
    const tariffs = this.utilityTariffs();
    const dtek = this.dtekInfo();
    const activeDtek = this.activeDtekAccount();
    const unpaidElec = this.unpaidElectricityInfo();

    // Primary active house for address kicker
    const primaryHouse = activeDtek || elecAccs[0] || waterAccs[0] || wasteAccs[0] || null;
    let addressLabel = 'Ваш комунальний простір';
    if (primaryHouse) {
      if (primaryHouse.city && primaryHouse.street) {
        addressLabel = `${primaryHouse.city}, ${primaryHouse.street}${primaryHouse.houseNum ? ', буд. ' + primaryHouse.houseNum : ''}`;
      } else if (primaryHouse.address) {
        addressLabel = primaryHouse.address;
      } else if (primaryHouse.name) {
        addressLabel = primaryHouse.name;
      }
    }

    // Electricity live metrics
    const primaryElec = activeDtek && (activeDtek.type === 'electricity' || !activeDtek.type) ? activeDtek : elecAccs[0] || null;
    const meterTypeLabel = primaryElec
      ? (primaryElec.electricityTariffType === 'dual' ? 'Двозонний лічильник' : 'Однозонний лічильник')
      : 'Облік електроенергії';
    const elecReadings = primaryElec
      ? readings
          .filter((r) => r.accountId === primaryElec.id && r.utilityType === 'electricity' && !r.isControlOnly && r.readingPurpose !== 'control')
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      : [];
    const latestElecReading = elecReadings[0] || null;
    const lastConsumedKwh = latestElecReading
      ? Math.round(((Number(latestElecReading.consumptionT1) || 0) + (Number(latestElecReading.consumptionT2) || 0)) * 10) / 10
      : 0;

    // Outage live metrics & 8-slot mini bar (Europe/Kyiv half-hour precision across today + tomorrow)
    const cleanQueue = (dtek?.queueGroup || '').replace(/^GPV/i, '').trim();
    const matchedQueue = cleanQueue
      ? (dtek?.allQueuesSchedules || []).find(
          (q) => q.queueNumber === cleanQueue || q.queueKey === `GPV${cleanQueue}`
        )
      : undefined;
    const todaySchedule = matchedQueue?.hourlySchedule?.length
      ? matchedQueue.hourlySchedule
      : dtek?.hourlySchedule || [];
    const tomorrowDay =
      matchedQueue?.tomorrowSchedule ||
      dtek?.tomorrowSchedule ||
      dtek?.dailySchedules?.find((day) => day.isTomorrow) ||
      null;
    const tomorrowSchedule = tomorrowDay?.hourlySchedule || [];

    const pad2 = (n: number) => String(n).padStart(2, '0');
    let kyivHourZero = new Date().getHours();
    let kyivMinute = new Date().getMinutes();
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Kyiv',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(new Date());
      const hPart = Number(parts.find((p) => p.type === 'hour')?.value);
      const mPart = Number(parts.find((p) => p.type === 'minute')?.value);
      if (!Number.isNaN(hPart) && !Number.isNaN(mPart)) {
        kyivHourZero = hPart === 24 ? 0 : hPart;
        kyivMinute = mPart;
      }
    } catch {
      if (dtek?.kyivTime && dtek.kyivTime.includes(':')) {
        const [hStr, mStr] = dtek.kyivTime.split(':');
        const parsedH = Number(hStr);
        const parsedM = Number(mStr);
        if (!Number.isNaN(parsedH)) kyivHourZero = parsedH === 24 ? 0 : parsedH;
        if (!Number.isNaN(parsedM)) kyivMinute = parsedM;
      }
    }

    interface HalfHourSlot {
      isTomorrow: boolean;
      startTime: string;
      endTime: string;
      hasPower: boolean;
    }

    const buildDayHalves = (
      list: typeof todaySchedule,
      isTomorrow: boolean
    ): HalfHourSlot[] => {
      const sorted = [...list].sort((a, b) => a.hour - b.hour);
      const halves: HalfHourSlot[] = [];
      for (const h of sorted) {
        const hZero = Math.max(0, Math.min(23, (Number(h.hour) || 1) - 1));
        const hStart = `${pad2(hZero)}:00`;
        const hMid = `${pad2(hZero)}:30`;
        const hEnd = `${pad2(hZero + 1)}:00`;
        halves.push({
          isTomorrow,
          startTime: hStart,
          endTime: hMid,
          hasPower: Boolean(h.firstHalfPower),
        });
        halves.push({
          isTomorrow,
          startTime: hMid,
          endTime: hEnd,
          hasPower: Boolean(h.secondHalfPower),
        });
      }
      return halves;
    };

    const todayHalves = buildDayHalves(todaySchedule, false);
    const tomorrowHalves = buildDayHalves(tomorrowSchedule, true);
    const allHalves = [...todayHalves, ...tomorrowHalves];
    const curHalfIdx = Math.min(
      Math.max(0, todayHalves.length - 1),
      Math.max(0, kyivHourZero * 2 + (kyivMinute >= 30 ? 1 : 0))
    );

    const scheduledPowerNow =
      todayHalves.length > 0 ? todayHalves[curHalfIdx].hasPower : true;
    const isPowerNow = dtek
      ? dtek.isPowerAvailableNow === false
        ? false
        : scheduledPowerNow
      : true;

    const queueGroup = cleanQueue;
    const queuePrefix = queueGroup ? `Черга ${queueGroup} • ` : '';
    const miniBars: Array<'on' | 'off' | 'maybe'> = [];
    let nextChangeText = queueGroup ? `Черга ${queueGroup}` : 'Оберіть чергу або адресу';

    if (todaySchedule.length > 0) {
      const sortedToday = [...todaySchedule].sort((a, b) => a.hour - b.hour);
      const currentHourIdx = Math.max(
        0,
        sortedToday.findIndex((h) => h.hour === kyivHourZero + 1)
      );
      for (let i = 0; i < 8; i++) {
        const slot = sortedToday[(currentHourIdx + i) % sortedToday.length];
        if (!slot) {
          miniBars.push('on');
        } else if (slot.firstHalfPower && slot.secondHalfPower) {
          miniBars.push('on');
        } else if (!slot.firstHalfPower && !slot.secondHalfPower) {
          miniBars.push('off');
        } else {
          miniBars.push('maybe');
        }
      }

      const findNextPlannedOutage = (fromIdx: number) => {
        let startIdx = -1;
        for (let i = fromIdx; i < allHalves.length; i++) {
          if (!allHalves[i].hasPower) {
            startIdx = i;
            break;
          }
        }
        if (startIdx < 0) return null;
        let endIdx = startIdx;
        while (endIdx + 1 < allHalves.length && !allHalves[endIdx + 1].hasPower) {
          endIdx++;
        }
        return {
          startTime: allHalves[startIdx].startTime,
          endTime: allHalves[endIdx].endTime,
          isTomorrow: allHalves[startIdx].isTomorrow,
        };
      };

      if (scheduledPowerNow) {
        const nextOutage = findNextPlannedOutage(curHalfIdx + 1);
        if (nextOutage) {
          const daySuffix = nextOutage.isTomorrow ? ' (завтра)' : '';
          nextChangeText = `${queuePrefix}Відключення о ${nextOutage.startTime}–${nextOutage.endTime}${daySuffix}`;
        } else if (tomorrowHalves.length > 0) {
          nextChangeText = `${queuePrefix}Без планових відключень`;
        } else {
          nextChangeText = `${queuePrefix}Сьогодні без відключень`;
        }
      } else {
        // Currently in a scheduled outage: find power return time and the next planned outage after it
        let returnIdx = -1;
        for (let i = curHalfIdx + 1; i < allHalves.length; i++) {
          if (allHalves[i].hasPower) {
            returnIdx = i;
            break;
          }
        }
        const returnLabel =
          returnIdx >= 0
            ? `Увімкнення о ${allHalves[returnIdx].startTime}${allHalves[returnIdx].isTomorrow ? ' (завтра)' : ''}`
            : 'Світла тимчасово немає';
        const nextOutageAfter = returnIdx >= 0 ? findNextPlannedOutage(returnIdx + 1) : null;
        if (nextOutageAfter) {
          const daySuffix = nextOutageAfter.isTomorrow ? ' (завтра)' : '';
          nextChangeText = `${queuePrefix}${returnLabel} • Відключення о ${nextOutageAfter.startTime}–${nextOutageAfter.endTime}${daySuffix}`;
        } else {
          nextChangeText = `${queuePrefix}${returnLabel}`;
        }
      }
    } else {
      for (let i = 0; i < 8; i++) {
        miniBars.push('on');
      }
    }

    // Water live metrics
    const primaryWater = waterAccs[0] || null;
    const totalWaterBalance = Math.round(
      waterAccs.reduce((sum, acc) => sum + (Number(acc.balanceUah) || 0), 0) * 100
    ) / 100;
    const waterReadings = primaryWater
      ? readings
          .filter((r) => r.accountId === primaryWater.id && r.utilityType === 'water')
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      : [];
    const latestWaterM3 = waterReadings[0]?.readingT1;
    const waterSubtitle = latestWaterM3 !== undefined
      ? `Останній показник: ${latestWaterM3} м³${waterAccs.length > 1 ? ' • ' + waterAccs.length + ' обʼєкти' : ''}`
      : waterAccs.length > 0
        ? `${waterAccs.length} ${waterAccs.length === 1 ? 'обʼєкт' : 'обʼєкти'} • Прогноз балансу та показів`
        : 'Додайте лічильник для обліку води';

    // Waste live metrics
    const todayIso = new Date().toISOString().slice(0, 10);
    const wasteRate = resolveWasteRate(todayIso, tariffs);
    const totalResidents = wasteAccs.reduce((sum, acc) => sum + (Number(acc.residentsCount) || 1), 0);
    const monthlyWasteTotal = Math.round(totalResidents * wasteRate * 100) / 100;
    const wasteSubtitle = wasteAccs.length > 0
      ? `Тариф ${wasteRate.toFixed(2)} ₴/особа • ${totalResidents} ${totalResidents === 1 ? 'мешканець' : 'мешканців'}`
      : 'Щомісячні нарахування за ТПВ';

    const totalDueUah = Math.round(
      (unpaidElec.totalAmount + (totalWaterBalance < 0 ? Math.abs(totalWaterBalance) : 0)) * 100
    ) / 100;

    return {
      addressLabel,
      totalDueUah,
      electricity: {
        accountsCount: elecAccs.length,
        activeName: primaryElec?.name || 'Електроенергія',
        meterTypeLabel,
        dueAmount: unpaidElec.totalAmount,
        hasUnpaid: unpaidElec.hasUnpaid,
        lastConsumedKwh,
      },
      outages: {
        hasData: Boolean(dtek && queueGroup),
        isPowerNow,
        queueGroup,
        nextChangeText,
        miniBars,
      },
      water: {
        accountsCount: waterAccs.length,
        totalBalanceUah: totalWaterBalance,
        subtitle: waterSubtitle,
      },
      waste: {
        accountsCount: wasteAccs.length,
        monthlyWasteTotal,
        subtitle: wasteSubtitle,
      },
    };
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
      case 'shopping':
        return {
          category: 'Побут та родина',
          title: 'Спільні покупки',
          icon: 'shopping_cart',
          iconColor: 'text-rose-500',
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
      if (this.isAuthenticated() && !this.isUserBlocked()) {
        void this.dataService.loadShoppingData(true);
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
          } else if (event.data?.type === 'DTEK_PUSH_RECEIVED') {
            void this.dataService.fetchRecentScheduleChanges(false);
            const house =
              this.dataService.activeDtekAccount() ||
              this.dataService.utilityAccounts().find((a) => a.type === 'electricity');
            void this.dataService.fetchDtekShutdowns(house?.city, house?.street, house?.houseNum, false);
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
    } else if (tab === 'users') {
      void this.dataService.fetchUsers();
      void this.dataService.fetchHouseholdInvites();
    } else if (tab === 'shopping') {
      void this.dataService.loadShoppingData(this.dataService.shoppingLists().length > 0);
    } else if (
      tab === 'electricity' ||
      tab === 'outage_schedule' ||
      tab === 'water' ||
      tab === 'waste' ||
      tab === 'water_waste'
    ) {
      void this.dataService.fetchUtilityData(false);
    }
  }

  // Home Menu Tiles Visibility (directly synced with Settings house_visibility & user_settings)
  readonly isHomeTilesModalOpen = signal<boolean>(false);
  readonly hiddenHomeTiles = this.dataService.hiddenHomeTiles;

  readonly permittedHomeMenuTiles = computed<HomeMenuTileMeta[]>(() =>
    HOME_MENU_TILE_OPTIONS.filter((t) => {
      if (t.id === 'users') return this.isAdmin();
      return this.isTabAllowed(t.id);
    })
  );

  readonly shoppingSummary = computed(() => {
    const lists = this.dataService.shoppingLists();
    let totalItems = 0;
    let todoItems = 0;
    let totalSpentUah = 0;
    let activeListsCount = 0;
    for (const l of lists) {
      if (l.isInactive) {
        continue;
      }
      activeListsCount++;
      for (const it of l.items) {
        totalItems++;
        if (!it.isBought) todoItems++;
        totalSpentUah += computeShoppingItemTotal(it);
      }
    }
    return {
      listsCount: activeListsCount,
      totalItems,
      todoItems,
      totalSpentUah: Math.round(totalSpentUah * 100) / 100,
    };
  });

  isHomeTileVisible(tileId: AppTabId): boolean {
    if (tileId === 'users') {
      return this.isAdmin() && !this.dataService.isHomeTileHidden(tileId);
    }
    return this.isTabAllowed(tileId) && !this.dataService.isHomeTileHidden(tileId);
  }

  readonly hasAnyVisibleSecondaryTile = computed<boolean>(() => {
    const secondaryIds: AppTabId[] = [
      'clients',
      'accounts',
      'budget',
      'analytics',
      'payments',
      'users',
      'settings',
    ];
    return secondaryIds.some((id) => this.isHomeTileVisible(id));
  });

  openHomeTilesEditor(): void {
    this.isHomeTilesModalOpen.set(true);
  }

  closeHomeTilesEditor(): void {
    this.isHomeTilesModalOpen.set(false);
  }

  async toggleHomeTileVisibility(tileId: AppTabId): Promise<void> {
    await this.dataService.toggleHomeTileVisibility(tileId);
  }

  async resetHiddenHomeTiles(): Promise<void> {
    await this.dataService.resetHiddenHomeTiles();
  }

  openFullVisibilitySettings(): void {
    this.isHomeTilesModalOpen.set(false);
    this.dataService.openHomeTilesVisibilitySettings();
  }

  selectIptvSubTab(tab: ActiveTab): void {
    this.activeTab.set(tab);
    this.dataService.setActiveUiTab(tab);
    this.isSidebarIptvOpen.set(true);
    this.isMobileIptvDrawerOpen.set(false);
    this.ensureTabDataLoaded(tab);
    if (typeof window !== 'undefined' && window.scrollY > 0) {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }

  setTab(tab: ActiveTab): void {
    this.activeTab.set(tab);
    this.dataService.setActiveUiTab(tab);
    this.isMobileIptvDrawerOpen.set(false);
    this.ensureTabDataLoaded(tab);
    if (typeof window !== 'undefined' && window.scrollY > 0) {
      window.scrollTo({ top: 0, behavior: 'auto' });
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
  readonly isDesignModalOpen = signal<boolean>(false);

  // App Release Update Modal (Cumulative Changelog: Newest Top -> Older Bottom)
  readonly appReleaseInfo = this.dataService.appReleaseInfo;
  readonly isUpdateModalOpen = this.dataService.isUpdateModalOpen;
  readonly isDismissingUpdate = this.dataService.isDismissingUpdate;

  readonly currentReleaseDateTime = computed<string>(() => {
    const info = this.appReleaseInfo();
    if (info.updatedAtKyiv) {
      return `${info.updatedAtKyiv} (Київ)`;
    }
    return this.publishDateTime;
  });

  readonly appReleaseHistory = computed<
    {
      version: string;
      previousVersion: string;
      releasedAt: string;
      isLatest: boolean;
      summary: string;
      features: {
        icon: string;
        badge: string;
        title: string;
        description: string;
        colorClass: string;
        isHighlight?: boolean;
        bullets?: string[];
        actionLabel?: string;
        actionIcon?: string;
        actionId?: 'shared_home' | 'shopping';
      }[];
    }[]
  >(() => {
    const info = this.appReleaseInfo();
    const tsMap = info.versionTimestamps || {};
    const v60Time = tsMap['v6.0'] || info.updatedAtKyiv || '22.11.2026 07:30';
    const v51Time = tsMap['v5.1'] || '19.11.2026 08:00';
    const v50Time = tsMap['v5.0'] || '15.11.2026 18:00';
    const v42Time = tsMap['v4.2'] || '10.11.2026 14:30';

    return [
      {
        version: 'v6.0',
        previousVersion: 'v5.1',
        releasedAt: `${v60Time} (Київ)`,
        isLatest: true,
        summary: 'Оновлений «Спільний дім», спільні списки покупок із тематичними фото й ваговими товарами, миттєва синхронізація та світла/темна теми',
        features: [
          {
            icon: 'family_restroom',
            badge: 'Сімейний простір • v6.0',
            title: 'Спільний дім став ще функціональніший та зручніший. Спробуй і ти.',
            description:
              'Керуйте доступом родини та близьких в один дотик: мінімалістичні плитки учасників із гнучкими правами на будинки, комунальні розділи та списки покупок, швидке запрошення за інвайт-посиланням або QR-кодом і миттєва фонова синхронізація всіх змін між пристроями в реальному часі.',
            bullets: [
              'Мінімалістичні плитки учасників і прав',
              'Миттєвий QR-код та інвайт-посилання',
              'Жива синхронізація між пристроями',
              'Спільні будинки та покупки разом',
            ],
            actionLabel: 'Відкрити «Спільний дім»',
            actionIcon: 'family_restroom',
            actionId: 'shared_home',
            colorClass: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40',
            isHighlight: true,
          },
          {
            icon: 'shopping_cart',
            badge: 'Головне оновлення • v6.0',
            title: 'Спільний список покупок із тематичними фото, вагою та перенесенням залишку',
            description:
              'Створюйте спільні списки покупок із тематичними фотографіями товарів, перемикачем ціни «За 100 г / За 1 кг / За 1 шт» із введенням ваги, обʼєднаним індикатором залишку бюджету («1 500 з 2 000 ₴») та перенесенням некуплених позицій і залишку коштів у новий список в один клік.',
            bullets: [
              'Ціна за 100 г / 1 кг / 1 шт + вага',
              'Перенесення залишку у новий список',
              'Тематичні фото для кожного товару',
            ],
            actionLabel: 'Перейти до покупок',
            actionIcon: 'shopping_cart',
            actionId: 'shopping',
            colorClass: 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/40',
          },
          {
            icon: 'auto_awesome',
            badge: 'Дизайн • Оновлений інтерфейс',
            title: 'Оновлений дизайн застосунку HomeHub та світла й темна теми',
            description:
              'Оновлено інтерфейс усіх розділів: шрифт Inter, картки з плавним заокругленням, перемикання світлої та глибокої темної теми, а також індивідуальні кольорові акценти для світла (amber), води (sky), сміття (emerald), покупок (rose) та графіка відключень (slate/indigo).',
            colorClass: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30',
          },
          {
            icon: 'history',
            badge: 'Електроенергія • Швидкий перегляд',
            title: 'Історія передачі показів та розрахунків розгорнута за замовчуванням',
            description:
              'На вкладці «Світло» таблиця історії показів та нарахувань тепер одразу відкрита — без зайвих натискань, а в блоці «Середній темп» додано наочний індикатор динаміки споживання.',
            colorClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
          },
        ],
      },
      {
        version: 'v5.1',
        previousVersion: 'v5.0',
        releasedAt: `${v51Time} (Київ)`,
        isLatest: false,
        summary: 'Оплата ООЕК без комісії, історія змін графіку за сьогодні, чисті аварійні сповіщення та журнал версій',
        features: [
          {
            icon: 'payments',
            badge: '0% Комісії • Оплата ООЕК',
            title: 'Ви просили я зробив 🥳. Зустрічайте: оплата вже у застосунку, а найголовніше БЕЗ КОМІСІЇ',
            description:
              'Натискайте «Сплатити» прямо у картці будинку — сторінка Portmone відкриється миттєво з уже підставленим вашим особовим рахунком, адресою та актуальною сумою до сплати (Apple Pay, Google Pay або картка).',
            colorClass: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40',
            isHighlight: true,
          },
          {
            icon: 'history',
            badge: 'Графік світла • v5.1',
            title: 'Повна історія змін графіку відключень за поточний день',
            description:
              'У сповіщенні при зміні графіку ДТЕК тепер відображається повна хронологія усіх змін за сьогодні (з точним часом оновлення та інтервалами). На вкладці «Світло» поруч із кнопкою «Черга» додано окрему кнопку «Історія» для перегляду змін за день у будь-який момент.',
            colorClass: 'bg-sky-500/15 text-sky-600 dark:text-sky-300 border-sky-500/30',
          },
          {
            icon: 'warning',
            badge: 'Чистий UI • Вкладка Світло',
            title: 'Аварійні відключення — лише у «Фокус поточного інтервалу»',
            description:
              'Прибрано дублювання блоку аварійних відключень на вкладці «Світло». Вся актуальна інформація (причина, час початку, орієнтовне відновлення та залишок часу) відображається компактно в одному місці — на банері «Фокус поточного інтервалу».',
            colorClass: 'bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-500/30',
          },
          {
            icon: 'account_balance_wallet',
            badge: 'Безпека • ООЕК без пароля',
            title: 'Отримання актуального рахунку ООЕК без збереження логіну й пароля',
            description:
              'Кнопка «Оновити з ООЕК» тепер отримує актуальний баланс до сплати автоматично лише за номером особового рахунку — без потреби зберігати конфіденційний логін і пароль кабінету.',
            colorClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30',
          },
          {
            icon: 'storage',
            badge: 'Тарифи та дати • v5.1',
            title: 'Пряме збереження тарифів у БД, новий день без зайвого порівняння та розумні дати',
            description:
              'Тарифи на електроенергію, воду та сміття зберігаються і зчитуються напряму з бази даних без кешування. При настанні нового дня показується новий графік без порівняння з учорашнім, а для моніторингу та приладів за замовчуванням підставляється попередня дата.',
            colorClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30',
          },
          {
            icon: 'new_releases',
            badge: 'Журнал релізів • v5.1',
            title: 'Накопичувальна історія оновлень HomeHub з датою та часом',
            description:
              'У вікні оновлень застосунку додано точну дату й час кожного оновлення та збережено накопичувальну хронологію усіх версій: новіші релізи розташовані зверху, а попередні — нижче.',
            colorClass: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border-indigo-500/30',
          },
        ],
      },
      {
        version: 'v5.0',
        previousVersion: 'v4.2',
        releasedAt: `${v50Time} (Київ)`,
        isLatest: false,
        summary: 'Пряма передача показів до ДТЕК ОЕМ, AI-сканер фото, нагадування та підтвердження видалень',
        features: [
          {
            icon: 'send_and_archive',
            badge: 'Головна фішка v5.0 • ДТЕК ОЕМ',
            title: 'Пряма передача показів до ДТЕК ОЕМ та автозбереження в журнал',
            description:
              'Повна двоетапна інтеграція з кабінетом ДТЕК ОЕМ (checkAddress + saveReceptionMeter): автоматична перевірка особового рахунку з підтягуванням профілю, EIC-коду, моделі й номера лічильника та попередніх показів по зонах, миттєва відправка нових показів у ДТЕК і автоматичний запис у журнал будинку.',
            colorClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30',
          },
          {
            icon: 'notifications_active',
            badge: 'Сповіщення про передачу показів • v5.0',
            title: 'Розумні сповіщення про прийом показів ДТЕК, зміни графіку та аварії',
            description:
              'Автоматичні нагадування у 5-денному вікні прийому показів (останні 2 дні місяця та 1–3 число наступного) з візуальною шкалою дедлайну й швидким переходом до відправки, миттєві сповіщення про прийняття показів у ДТЕК, а також сповіщення про зміни графіку світла та аварійні відключення.',
            colorClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30',
          },
          {
            icon: 'auto_fix_high',
            badge: 'Візуальне оновлення • Чистий інтерфейс',
            title: 'Очищення інтерфейсу від зайвих і дублюючих кнопок та блоків',
            description:
              'Проведено комплексне візуальне впорядкування розділу «Електроенергія» та панелі приладів: прибрано зайву кнопку ручного внесення показів (покази фіксуються автоматично під час передачі в ДТЕК), видалено дублюючі кнопки згортання/розгортання блоків, графіків, інсайтів, історії замірів і зайві перемикачі.',
            colorClass: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border-indigo-500/30',
          },
          {
            icon: 'photo_camera',
            badge: 'AI-сканер та Фото з файлу',
            title: 'Розпізнавання показів з камери або вибір готового фото з файлу',
            description:
              'Виправлено та розділено режими завантаження фото лічильника: кнопка «Завантажити фото з файлу» тепер відкриває системний вибір файлу з галереї або провідника без примусового запуску камери. Додано швидке AI-розпізнавання та автопідстановку зон День (Т2) і Ніч (Т1) прямо у вікні передачі показів ДТЕК.',
            colorClass: 'bg-sky-500/15 text-sky-600 dark:text-sky-300 border-sky-500/30',
          },
          {
            icon: 'verified_user',
            badge: 'Безпека даних • v5.0',
            title: 'Обовʼязкове вікно підтвердження для всіх дій видалення',
            description:
              'При натисканні будь-якої кнопки видалення (будинку, особового рахунку, запису показів електроенергії, води чи вивозу сміття, заміру споживання приладу, абонента, групи або запрошення) обовʼязково відкривається діалогове вікно підтвердження поверх усіх вікон із деталями запису, що видаляється.',
            colorClass: 'bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-500/30',
          },
          {
            icon: 'new_releases',
            badge: 'Верхня панель • Навігація',
            title: 'Адаптивний індикатор версії застосунку на верхній панелі',
            description:
              'На стаціонарній верхній панелі додано індикатор поточної версії застосунку, який автоматично адаптується під ширину екрана (компактне «5.0» на вузьких мобільних екранах та повний індикатор на ширших дисплеях) та відкриває список оновлень в один дотик.',
            colorClass: 'bg-teal-500/15 text-teal-600 dark:text-teal-300 border-teal-500/30',
          },
          {
            icon: 'calculate',
            badge: 'Автоматизація розрахунків',
            title: 'Авторозрахунок споживання на останній день місяця та звірка з ООЕК',
            description:
              'При передачі показів до ДТЕК застосунок автоматично підставляє розрахункову дату на кінець місяця, обчислює спожиті кВт·год за денним і нічним тарифами (з урахуванням сезонного зимового ліміту), оновлює картку поточного стану будинку та звіряє нараховану суму з балансом ООЕК.',
            colorClass: 'bg-purple-500/15 text-purple-600 dark:text-purple-300 border-purple-500/30',
          },
        ],
      },
      {
        version: 'v4.2',
        previousVersion: 'v4.0',
        releasedAt: `${v42Time} (Київ)`,
        isLatest: false,
        summary: 'Багатокористувацький доступ, стилі графіку відключень, спільне домогосподарство та Web Push',
        features: [
          {
            icon: 'view_timeline',
            badge: 'Графік відключень • v4.2',
            title: 'Кілька візуальних стилів відображення графіку ДТЕК та експорт у PNG',
            description:
              'Додано набір варіантів візуалізації 24-годинного графіку відключень (мінімалістичні капсули, лінійна шкала, офіційна таблиця ДТЕК, 6-годинні квадранти), список усіх 12 черг (1.1–6.2) та збереження/поширення графіку як зображення PNG.',
            colorClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30',
          },
          {
            icon: 'group_add',
            badge: 'Спільний доступ • v4.2',
            title: 'Спільне домогосподарство з QR-запрошеннями та рівнями доступу',
            description:
              'Реалізовано запрошення членів родини через QR-код або посилання з налаштуванням ролі, рівня доступу та синхронізацією комунальних рахунків і сімейного бюджету у реальному часі.',
            colorClass: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border-indigo-500/30',
          },
        ],
      },
    ];
  });

  openProfileModal(): void {
    this.isProfileModalOpen.set(true);
  }

  closeProfileModal(): void {
    this.isProfileModalOpen.set(false);
  }

  openDesignModal(): void {
    this.isDesignModalOpen.set(true);
  }

  closeDesignModal(): void {
    this.isDesignModalOpen.set(false);
  }

  openHomeTilesFromDesignModal(): void {
    this.isDesignModalOpen.set(false);
    this.openHomeTilesEditor();
  }

  openUpdateModal(): void {
    this.isProfileModalOpen.set(false);
    this.dataService.openUpdateModal();
  }

  closeUpdateModal(): void {
    this.dataService.closeUpdateModal();
  }

  triggerReleaseFeatureAction(actionId?: 'shared_home' | 'shopping'): void {
    if (!actionId) return;
    this.closeUpdateModal();
    if (actionId === 'shared_home') {
      this.openSharedHouseholdModal();
    } else if (actionId === 'shopping') {
      this.setTab('shopping');
    }
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
    const ok = await this.dataService.openConfirmDialog({
      title: 'Видалити абонента?',
      message: `Ви дійсно бажаєте видалити абонента «${client.fullName}» (${client.iptvLogin})? Цю дію неможливо скасувати.`,
      confirmText: 'Видалити',
      cancelText: 'Скасувати',
      tone: 'danger',
      icon: 'delete_forever',
    });
    if (ok) {
      await this.dataService.deleteClient(client.id);
    }
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
    const ok = await this.dataService.openConfirmDialog({
      title: 'Розформувати групу?',
      message: `Ви дійсно бажаєте розформувати групу «${group.groupName}»? Усі абоненти залишаться в списку як індивідуальні.`,
      confirmText: 'Розформувати',
      cancelText: 'Скасувати',
      tone: 'danger',
      icon: 'group_remove',
    });
    if (!ok) return;
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

  // Web Push & In-App Schedule Change Alert signals
  readonly isPushSupported = this.dataService.isPushSupported;
  readonly isPushSubscribed = this.dataService.isPushSubscribed;
  readonly isPushLoading = this.dataService.isPushLoading;
  readonly pushStatusMessage = this.dataService.pushStatusMessage;
  readonly pushCountdownSeconds = this.dataService.pushCountdownSeconds;
  readonly inAppScheduleChangeAlert = this.dataService.inAppScheduleChangeAlert;
  readonly activeAlertTodayChangesHistory = this.dataService.activeAlertTodayChangesHistory;
  readonly isLoadingScheduleChangesHistory = this.dataService.isLoadingScheduleChangesHistory;

  openScheduleFromChangeAlert(): void {
    this.dataService.acknowledgeScheduleChangeAlert();
    this.setTab('outage_schedule');
  }

  dismissScheduleChangeAlert(): void {
    this.dataService.acknowledgeScheduleChangeAlert();
  }

  refreshTodayScheduleChangesHistory(): void {
    const queueKey = this.inAppScheduleChangeAlert()?.queueKey;
    void this.dataService.fetchRecentScheduleChanges(false, queueKey);
  }

  formatScheduleChangeTime(entry: ScheduleChangeLogEntry): string {
    if (entry.detectedAtKyiv) {
      const parts = entry.detectedAtKyiv.trim().split(' ');
      if (parts.length >= 2 && parts[1]) {
        return parts[1];
      }
    }
    return this.dataService.getKyivTimeHHMM(entry.detectedAt) || '—';
  }

  getScheduleChangeBadgeLabel(changeType?: string): string {
    switch (changeType) {
      case 'new_day_schedule':
        return 'Новий графік дня';
      case 'today_changed':
        return 'Зміна на сьогодні';
      case 'tomorrow_appeared':
        return 'Графік на завтра';
      case 'tomorrow_changed':
        return 'Зміна на завтра';
      case 'emergency_outage':
        return 'Аварійне відключення';
      default:
        return 'Оновлення графіку';
    }
  }

  getScheduleChangePrevIntervals(entry: ScheduleChangeLogEntry): string[] {
    if (entry.changeType === 'new_day_schedule' || entry.changeType === 'tomorrow_appeared') {
      return [];
    }
    return entry.oldIntervals && entry.oldIntervals.length > 0
      ? entry.oldIntervals
      : entry.previousIntervals || [];
  }

  getScheduleChangeCountLabel(count: number): string {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (count === 0) return '0 змін';
    if (mod10 === 1 && mod100 !== 11) return `${count} зміна`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} зміни`;
    return `${count} змін`;
  }

  readonly householdModalView = signal<'home' | 'member' | 'add' | 'qr'>('home');
  readonly selectedHouseholdMemberId = signal<string | null>(null);
  readonly householdQrMode = signal<'invite' | 'app'>('invite');
  readonly showJoinByCodeInput = signal<boolean>(false);

  readonly selectedHouseholdMember = computed<AppUser | null>(() => {
    const id = this.selectedHouseholdMemberId();
    if (!id) return null;
    return this.sharedHouseholdMembers().find((m) => m.id === id) || null;
  });

  openSharedHouseholdModal(): void {
    this.householdModalView.set('home');
    this.selectedHouseholdMemberId.set(null);
    this.showJoinByCodeInput.set(false);
    this.dataService.flushSignalScopeIfPending('household');
    this.dataService.openSharedHouseholdModal();
  }

  closeSharedHouseholdModal(): void {
    this.householdModalView.set('home');
    this.selectedHouseholdMemberId.set(null);
    this.showJoinByCodeInput.set(false);
    this.dataService.closeSharedHouseholdModal();
  }

  openHouseholdMemberDetail(memberId: string): void {
    this.selectedHouseholdMemberId.set(memberId);
    this.householdModalView.set('member');
  }

  openHouseholdAddView(): void {
    this.selectedHouseholdMemberId.set(null);
    this.showJoinByCodeInput.set(false);
    this.householdModalView.set('add');
  }

  openHouseholdQrView(mode: 'invite' | 'app' = 'invite'): void {
    this.selectedHouseholdMemberId.set(null);
    this.householdQrMode.set(mode);
    this.householdModalView.set('qr');
    void this.dataService.initQrInviteModalState();
  }

  backToHouseholdHome(): void {
    this.selectedHouseholdMemberId.set(null);
    this.showJoinByCodeInput.set(false);
    this.householdModalView.set('home');
  }

  getMemberRelationLabel(member: AppUser): string {
    const relId = this.getMemberPrimaryRelation(member);
    return this.getRelationTagMeta(relId)?.label || 'Учасник';
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
    const ok = await this.dataService.openConfirmDialog({
      title: 'Видалити запрошення?',
      message: 'Ви дійсно бажаєте видалити це посилання-запрошення до спільного будинку?',
      confirmText: 'Видалити',
      cancelText: 'Скасувати',
      tone: 'danger',
      icon: 'delete',
    });
    if (ok) {
      await this.dataService.deleteHouseholdInvite(id);
    }
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

  readonly manageableHouseholdHouses = computed<UtilityAccount[]>(() => {
    const me = this.currentUser();
    const accounts = this.dataService.utilityAccounts();
    if (!me) return [];
    if (this.isAdmin()) return accounts;
    return accounts.filter((a) => !a.ownerUserId || a.ownerUserId === me.id);
  });

  readonly ownShoppingLists = computed<ShoppingList[]>(() => {
    const me = this.currentUser();
    const lists = this.dataService.shoppingLists();
    if (!me) return [];
    return lists.filter((l) => l.ownerUserId === me.id);
  });

  isMemberAssignedToHouse(member: AppUser, house: UtilityAccount): boolean {
    const assignedOnHouse = Array.isArray(house.assignedUserIds) ? house.assignedUserIds : [];
    const assignedOnMember = Array.isArray(member.assignedUtilityAccountIds)
      ? member.assignedUtilityAccountIds
      : [];
    return assignedOnHouse.includes(member.id) || assignedOnMember.includes(house.id);
  }

  async toggleMemberHouseAccess(member: AppUser, houseId: string): Promise<void> {
    const houses = this.manageableHouseholdHouses();
    const currentAssignedIds = new Set<string>(
      houses.filter((h) => this.isMemberAssignedToHouse(member, h)).map((h) => h.id)
    );
    if (currentAssignedIds.has(houseId)) {
      currentAssignedIds.delete(houseId);
    } else {
      currentAssignedIds.add(houseId);
    }
    await this.dataService.updateSharedMemberHouses(member.id, Array.from(currentAssignedIds));
  }

  isMemberInShoppingList(memberId: string, list: ShoppingList): boolean {
    const ids = Array.isArray(list.participantIds) ? list.participantIds : [];
    return ids.includes(memberId);
  }

  async toggleMemberShoppingListAccess(memberId: string, list: ShoppingList): Promise<void> {
    const existing = Array.isArray(list.participantIds) ? list.participantIds : [];
    const hasMember = existing.includes(memberId);
    const nextIds = hasMember
      ? existing.filter((id) => id !== memberId)
      : [...existing, memberId];
    await this.dataService.updateShoppingList(
      list.id,
      { participantIds: nextIds },
      hasMember
        ? `Учасника відкріплено від списку «${list.title}»`
        : `Учасника додано до списку «${list.title}»`
    );
  }

  reloadPageForChunkRecovery(): void {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }

  dismissMeterReadingReminder(): void {
    this.dataService.dismissMeterReadingReminder();
  }

  openElectricityFromMeterReminder(accountId?: string): void {
    const alert = this.dataService.meterReadingReminderAlert();
    const targetAccId = accountId || alert?.primaryAccountId;
    if (targetAccId) {
      this.dataService.selectedDtekAccountId.set(targetAccId);
    }
    this.dataService.dismissMeterReadingReminder();
    this.setTab('electricity');
  }
}

