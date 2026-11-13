import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  forwardRef,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { formatDateUa } from "../../models/client.model";
import {
  ControlReadingNoteAnalysis,
  DailyWeatherPoint,
  ElectricityDevice,
  ElectricityDeviceLogEntry,
  resolveElectricityDualRates,
  resolveElectricitySingleRate,
  UtilityAccount,
  UtilityReading,
  UtilityWeatherResponse,
} from "../../models/utility.model";
import { IptvData } from "../../services/iptv-data";
import { ElectricityChartComponent } from "./electricity-chart.component";
import {
  ElectricityMonthlySummary,
  ElectricityStatsKPIs,
  ElectricityTimelinePoint,
} from "./electricity-chart-wrapper";
import {
  AppliedMeterReading,
  MeterCameraModal,
} from '../meter-camera-modal/meter-camera-modal';
import {
  buildDeviceAnalyticsSummary,
  DeviceAnalyticsSummaryResult,
  EMPTY_DEVICE_ANALYTICS_SUMMARY,
  getEffectiveLogWeatherPoint,
  getWeatherForDateFromResponse,
} from './electricity-device-analytics.util';
import {
  CleanReadingNotePipe,
  cleanReadingNoteText,
  FormatCostPipe,
  formatCostValue,
  FormatDateUaPipe,
} from './electricity-pipes';
import {
  buildElectricityMonthlyData,
  buildElectricityStatsKPIs,
  buildElectricityTimelineData,
  EnrichedUtilityReading,
  enrichReadingRow,
  getAccountFormattedAddressHelper,
  getControlNoteAnalysisHelper,
  getEffectivePrevReadingHelper,
  getHouseDueInfoHelper,
  hasAccountAddressHelper,
  isReadingPaidHelper,
  isWinterLimitExceededReadingHelper,
  totalConsumedKwhHelper,
} from './electricity-reading-calc.util';
import {
  ELECTRICITY_VIEW_CTX,
  ElectricityViewContext,
} from './electricity-view.context';
import { DeviceEditModalComponent } from './modals/device-edit-modal.component';
import { DeviceLogModalComponent } from './modals/device-log-modal.component';
import { DeviceScreenshotAiModalComponent } from './modals/device-screenshot-ai-modal.component';
import { MeterReadingModalComponent } from './modals/meter-reading-modal.component';
import { ReadingBreakdownModalComponent } from './modals/reading-breakdown-modal.component';
import { UtilityAccountModalComponent } from './modals/utility-account-modal.component';
import { DtekScheduleSectionComponent } from './sections/dtek-schedule-section.component';
import { ElectricityDevicesDashboardComponent } from './sections/electricity-devices-dashboard.component';
import { UtilityCabinetsSyncComponent } from './sections/utility-cabinets-sync.component';

@Component({
  selector: 'app-electricity-view',
  imports: [
    CommonModule,
    MatIconModule,
    FormatDateUaPipe,
    CleanReadingNotePipe,
    FormatCostPipe,
    ElectricityChartComponent,
    MeterCameraModal,
    DtekScheduleSectionComponent,
    UtilityCabinetsSyncComponent,
    ElectricityDevicesDashboardComponent,
    UtilityAccountModalComponent,
    MeterReadingModalComponent,
    ReadingBreakdownModalComponent,
    DeviceEditModalComponent,
    DeviceLogModalComponent,
    DeviceScreenshotAiModalComponent,
  ],
  providers: [
    {
      provide: ELECTRICITY_VIEW_CTX,
      useExisting: forwardRef(() => ElectricityView),
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './electricity-view.html',
})
export class ElectricityView implements ElectricityViewContext {
  private readonly destroyRef = inject(DestroyRef);
  readonly dataService = inject(IptvData);
  readonly viewMode = input<'all' | 'schedule' | 'readings'>('all');
  readonly liveKyivTime = signal<string>('');
  readonly canEdit = this.dataService.canEdit;
  readonly electricityAccounts = this.dataService.electricityAccounts;
  readonly utilityTariffs = this.dataService.utilityTariffs;
  readonly defaultDtekAccountId = this.dataService.defaultDtekAccountId;
  readonly isSavingDefaultHouse = this.dataService.isSavingDefaultHouse;

  readonly showHiddenHousesPanel = signal<boolean>(false);
  readonly selectedAccountId = signal<string>('');
  readonly activeTab = signal<'table' | 'devices' | 'analytics'>('table');
  readonly filterPurpose = signal<'all' | 'billing' | 'control'>('all');

  readonly isAccountCardExpanded = signal<boolean>(true);
  readonly isHistoryTableExpanded = signal<boolean>(true);
  readonly isAnalyticsChartExpanded = signal<boolean>(true);

  readonly deviceSelectedMonth = signal<string>(new Date().toISOString().slice(0, 7));
  readonly customMonthHouseKwh = signal<number | null>(null);
  readonly weatherData = signal<UtilityWeatherResponse | null>(null);
  readonly isWeatherLoading = signal<boolean>(false);
  readonly isSavingDevices = signal<boolean>(false);

  // Modal signals
  readonly isAccountModalOpen = signal<boolean>(false);
  readonly editingAccount = signal<UtilityAccount | null>(null);

  readonly isReadingModalOpen = signal<boolean>(false);
  readonly editingReadingId = signal<string | null>(null);
  readonly editingReadingObj = signal<UtilityReading | null>(null);
  readonly readingModalInitialControl = signal<boolean>(false);
  readonly appliedCameraReading = signal<AppliedMeterReading | null>(null);

  readonly isCameraModalOpen = signal<boolean>(false);
  readonly selectedReadingForBreakdown = signal<UtilityReading | null>(null);

  readonly isDeviceModalOpen = signal<boolean>(false);
  readonly editingDeviceId = signal<string | null>(null);
  readonly editingDeviceObj = signal<ElectricityDevice | null>(null);

  readonly isDeviceLogModalOpen = signal<boolean>(false);
  readonly editingDeviceLogId = signal<string | null>(null);
  readonly editingDeviceLogOriginalDeviceId = signal<string | null>(null);
  readonly editingDeviceLogObj = signal<ElectricityDeviceLogEntry | null>(null);
  readonly initialLogDeviceId = signal<string>('');

  readonly isScreenshotModalOpen = signal<boolean>(false);
  readonly screenshotInitialDeviceId = signal<string>('');

  readonly visibleAccountsForCurrentTab = computed<UtilityAccount[]>(() => {
    const tabKey = this.viewMode() === 'schedule' ? 'outage_schedule' : 'electricity';
    return this.electricityAccounts().filter(
      (a) => !this.dataService.isHouseHiddenInTab(a, tabKey)
    );
  });

  readonly hiddenAccountsForCurrentTab = computed<UtilityAccount[]>(() => {
    const tabKey = this.viewMode() === 'schedule' ? 'outage_schedule' : 'electricity';
    return this.electricityAccounts().filter((a) =>
      this.dataService.isHouseHiddenInTab(a, tabKey)
    );
  });

  readonly currentAccount = computed<UtilityAccount | null>(() => {
    const list = this.visibleAccountsForCurrentTab();
    if (list.length === 0) return null;
    const selected = list.find((a) => a.id === this.selectedAccountId());
    return selected || list[0];
  });

  readonly accountDevices = computed<ElectricityDevice[]>(() => {
    const acc = this.currentAccount();
    if (!acc) return [];
    const list = Array.isArray(acc.devices) ? acc.devices : [];
    return list.filter((d) => !d.accountId || d.accountId === acc.id);
  });

  readonly accountReadings = computed<UtilityReading[]>(() => {
    const acc = this.currentAccount();
    if (!acc) return [];
    return this.dataService
      .utilityReadings()
      .filter((r) => r.accountId === acc.id)
      .sort(
        (a, b) =>
          (b.date || '').localeCompare(a.date || '') ||
          (b.createdAt || '').localeCompare(a.createdAt || '')
      );
  });

  readonly filteredAccountReadings = computed<EnrichedUtilityReading[]>(() => {
    const list = this.accountReadings();
    const filter = this.filterPurpose();
    const acc = this.currentAccount();
    const tariffs = this.utilityTariffs();
    const devices = this.accountDevices();
    const filtered =
      filter === 'billing'
        ? list.filter((r) => !r.isControlOnly)
        : filter === 'control'
          ? list.filter((r) => r.isControlOnly)
          : list;
    return filtered.map((r) => enrichReadingRow(r, acc, tariffs, devices));
  });

  readonly billingReadingsCount = computed<number>(
    () => this.accountReadings().filter((r) => !r.isControlOnly).length
  );

  readonly controlReadingsCount = computed<number>(
    () => this.accountReadings().filter((r) => r.isControlOnly).length
  );

  readonly latestAnyReading = computed<UtilityReading | null>(() => {
    const list = this.accountReadings();
    return list.length > 0 ? list[0] : null;
  });

  readonly latestBillingReading = computed<UtilityReading | null>(() => {
    const list = this.accountReadings().filter((r) => !r.isControlOnly);
    return list.length > 0 ? list[0] : null;
  });

  readonly currentSingleRate = computed<number>(() => {
    const today = new Date().toISOString().split('T')[0];
    return resolveElectricitySingleRate(today, this.utilityTariffs());
  });

  readonly currentDualRates = computed(() => {
    const today = new Date().toISOString().split('T')[0];
    return resolveElectricityDualRates(today, this.utilityTariffs());
  });

  readonly electricityTimelineData = computed<ElectricityTimelinePoint[]>(() =>
    buildElectricityTimelineData(this.accountReadings(), this.currentAccount())
  );

  readonly electricityMonthlyData = computed<ElectricityMonthlySummary[]>(() =>
    buildElectricityMonthlyData(this.electricityTimelineData(), this.utilityTariffs())
  );

  readonly electricityStatsKPIs = computed<ElectricityStatsKPIs>(() =>
    buildElectricityStatsKPIs(
      this.electricityTimelineData(),
      this.currentAccount(),
      this.utilityTariffs()
    )
  );

  readonly deviceAnalyticsSummary = computed<DeviceAnalyticsSummaryResult>(() => {
    if (this.viewMode() === 'schedule' || this.activeTab() !== 'devices') {
      return EMPTY_DEVICE_ANALYTICS_SUMMARY;
    }
    return buildDeviceAnalyticsSummary({
      acc: this.currentAccount(),
      devices: this.accountDevices(),
      weatherData: this.weatherData(),
      selectedMonth: this.deviceSelectedMonth() || new Date().toISOString().slice(0, 7),
      tariffs: this.utilityTariffs(),
      currentSingleRate: this.currentSingleRate(),
      accountReadings: this.accountReadings(),
      electricityStatsKPIs: this.electricityStatsKPIs(),
      customMonthHouseKwh: this.customMonthHouseKwh(),
    });
  });

  constructor() {
    this.updateLiveKyivTime();
    if (typeof window !== 'undefined') {
      const clockTimer = setInterval(() => this.updateLiveKyivTime(), 1000);
      this.destroyRef.onDestroy(() => clearInterval(clockTimer));
      this.dataService.fetchDtekCatalog();
    }

    const activeDefault = this.dataService.activeDtekAccount();
    const accounts = this.electricityAccounts();
    if (activeDefault && !this.selectedAccountId()) {
      this.selectedAccountId.set(activeDefault.id);
    } else if (accounts.length > 0 && !this.selectedAccountId()) {
      this.selectedAccountId.set(accounts[0].id);
    }

    effect(() => {
      const defAcc = this.dataService.activeDtekAccount();
      const currSelected = this.selectedAccountId();
      const list = this.electricityAccounts();
      if (defAcc && (!currSelected || !list.some((a) => a.id === currSelected))) {
        untracked(() => {
          this.selectedAccountId.set(defAcc.id);
        });
      }
    });

    effect(() => {
      const acc = this.currentAccount();
      const city = acc?.city || 'с-ще Окни';
      const street = acc?.street || 'вул. Шкільна';
      const house = acc?.houseNum || '11';
      untracked(() => {
        if (typeof window !== 'undefined') {
          this.dataService.fetchDtekCatalog(city);
          this.dataService.fetchDtekShutdowns(city, street, house);
          void this.loadWeatherForCurrentAccount(city, this.deviceSelectedMonth());
        }
      });
    });

    effect(() => {
      const selMonth = this.deviceSelectedMonth();
      const acc = this.currentAccount();
      const city = acc?.city || 'с-ще Окни';
      untracked(() => {
        if (typeof window !== 'undefined' && selMonth) {
          void this.loadWeatherForCurrentAccount(city, selMonth);
        }
      });
    });
  }

  private updateLiveKyivTime(): void {
    try {
      const timeStr = new Intl.DateTimeFormat('uk-UA', {
        timeZone: 'Europe/Kyiv',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(new Date());
      this.liveKyivTime.set(timeStr);
    } catch {
      this.liveKyivTime.set(new Date().toLocaleTimeString('uk-UA'));
    }
  }

  toggleHideHouseInCurrentTab(accountId: string, event?: Event): void {
    if (event) event.stopPropagation();
    const tabKey = this.viewMode() === 'schedule' ? 'outage_schedule' : 'electricity';
    void this.dataService.toggleHouseVisibilityInTab(accountId, tabKey);
  }

  selectAccount(id: string): void {
    this.selectedAccountId.set(id);
    this.dataService.selectDtekAccountForSchedule(id);
  }

  async setAsDefaultHouse(id: string): Promise<void> {
    this.selectedAccountId.set(id);
    await this.dataService.setDefaultUtilityAccount(id);
  }

  hasAccountAddress(acc: UtilityAccount | null | undefined): boolean {
    return hasAccountAddressHelper(acc);
  }

  getAccountFormattedAddress(acc: UtilityAccount | null | undefined): string {
    return getAccountFormattedAddressHelper(acc);
  }

  getHouseDueInfo(acc: UtilityAccount) {
    return getHouseDueInfoHelper(acc, this.dataService.utilityReadings());
  }

  isReadingPaid(r: UtilityReading, acc?: UtilityAccount | null): boolean {
    return isReadingPaidHelper(r, acc || this.currentAccount());
  }

  formatDate(dateStr: string): string {
    return formatDateUa(dateStr, true);
  }

  formatCost(value: unknown): string {
    return formatCostValue(value);
  }

  cleanReadingNote(note?: string | null): string {
    return cleanReadingNoteText(note);
  }

  totalConsumedKwh(r: UtilityReading): number {
    return totalConsumedKwhHelper(r);
  }

  isWinterLimitExceededReading(r: UtilityReading): boolean {
    return isWinterLimitExceededReadingHelper(r, this.currentAccount(), this.utilityTariffs());
  }

  getControlNoteAnalysis(r: UtilityReading): ControlReadingNoteAnalysis | null {
    return getControlNoteAnalysisHelper(r, this.accountDevices());
  }

  getEffectivePrevReading(isControl: boolean, targetDate: string, excludeId?: string | null) {
    return getEffectivePrevReadingHelper(
      this.accountReadings(),
      this.currentAccount(),
      isControl,
      targetDate,
      excludeId
    );
  }

  onDeviceMonthChange(monthVal: string): void {
    if (monthVal && /^\d{4}-\d{2}$/.test(monthVal)) {
      this.deviceSelectedMonth.set(monthVal);
      this.customMonthHouseKwh.set(null);
    }
  }

  async loadWeatherForCurrentAccount(city?: string, month?: string, date?: string): Promise<void> {
    const targetCity = city || this.currentAccount()?.city || 'с-ще Окни';
    const targetMonth = month || this.deviceSelectedMonth() || new Date().toISOString().slice(0, 7);
    this.isWeatherLoading.set(true);
    try {
      const res = await this.dataService.fetchUtilityWeather(targetCity, targetMonth, date);
      if (res && res.success) {
        this.weatherData.set(res);
      }
    } finally {
      this.isWeatherLoading.set(false);
    }
  }

  getWeatherForDate(dateStr?: string | null, endDateStr?: string | null): DailyWeatherPoint {
    return getWeatherForDateFromResponse(this.weatherData(), dateStr, endDateStr);
  }

  getEffectiveLogWeather(log: ElectricityDeviceLogEntry): DailyWeatherPoint {
    return getEffectiveLogWeatherPoint(this.weatherData(), log);
  }

  // Modal Triggers & CRUD
  openAccountModal(acc: UtilityAccount | null): void {
    this.editingAccount.set(acc);
    this.isAccountModalOpen.set(true);
  }

  closeAccountModal(): void {
    this.isAccountModalOpen.set(false);
    this.editingAccount.set(null);
  }

  async confirmDeleteAccount(acc: UtilityAccount): Promise<void> {
    const ok = await this.dataService.openConfirmDialog({
      title: 'Видалити особовий рахунок?',
      message: `Ви дійсно бажаєте видалити особовий рахунок «${acc.name}» (№ ${acc.accountNumber}) та всі зафіксовані по ньому покази?`,
      confirmText: 'Видалити',
      cancelText: 'Скасувати',
      tone: 'danger',
      icon: 'delete_forever',
    });
    if (ok) {
      await this.dataService.deleteUtilityAccount(acc.id);
      const remaining = this.electricityAccounts();
      if (remaining.length > 0) {
        this.selectedAccountId.set(remaining[0].id);
      }
    }
  }

  openReadingModal(isControl = false): void {
    if (!this.currentAccount()) return;
    this.editingReadingId.set(null);
    this.editingReadingObj.set(null);
    this.readingModalInitialControl.set(isControl);
    this.appliedCameraReading.set(null);
    this.isReadingModalOpen.set(true);
  }

  openEditReadingModal(r: UtilityReading): void {
    if (!this.currentAccount()) return;
    this.editingReadingId.set(r.id);
    this.editingReadingObj.set(r);
    this.readingModalInitialControl.set(Boolean(r.isControlOnly));
    this.appliedCameraReading.set(null);
    this.isReadingModalOpen.set(true);
  }

  closeReadingModal(): void {
    this.isReadingModalOpen.set(false);
    this.editingReadingId.set(null);
    this.editingReadingObj.set(null);
    this.appliedCameraReading.set(null);
  }

  openCameraModal(): void {
    if (!this.currentAccount()) return;
    this.isCameraModalOpen.set(true);
  }

  closeCameraModal(): void {
    this.isCameraModalOpen.set(false);
  }

  onCameraReadingApplied(applied: AppliedMeterReading): void {
    if (!this.currentAccount()) return;
    this.appliedCameraReading.set(applied);
    this.isReadingModalOpen.set(true);
  }

  showReadingBreakdown(r: UtilityReading): void {
    this.selectedReadingForBreakdown.set(r);
  }

  closeReadingBreakdown(): void {
    this.selectedReadingForBreakdown.set(null);
  }

  async deleteReading(id: string): Promise<void> {
    const ok = await this.dataService.openConfirmDialog({
      title: 'Видалити показник?',
      message: 'Ви дійсно бажаєте видалити цей запис показів лічильника?',
      confirmText: 'Видалити',
      cancelText: 'Скасувати',
      tone: 'danger',
      icon: 'delete',
    });
    if (ok) {
      await this.dataService.deleteUtilityReading(id);
    }
  }

  async togglePaidStatus(r: UtilityReading): Promise<void> {
    if (r.isControlOnly) return;
    const isCurrentlyPaid = this.isReadingPaid(r, this.currentAccount());
    await this.dataService.markUtilityReadingPaid(r.id, !isCurrentlyPaid, r.totalCost);
  }

  openDeviceModal(): void {
    this.editingDeviceId.set(null);
    this.editingDeviceObj.set(null);
    this.isDeviceModalOpen.set(true);
  }

  openEditDeviceModal(device: ElectricityDevice): void {
    this.editingDeviceId.set(device.id);
    this.editingDeviceObj.set(device);
    this.isDeviceModalOpen.set(true);
  }

  closeDeviceModal(): void {
    this.isDeviceModalOpen.set(false);
    this.editingDeviceId.set(null);
    this.editingDeviceObj.set(null);
  }

  async deleteDevice(deviceId: string): Promise<void> {
    const acc = this.currentAccount();
    if (!acc) return;
    const target = this.accountDevices().find((d) => d.id === deviceId);
    if (!target) return;
    const ok = await this.dataService.openConfirmDialog({
      title: 'Видалити пристрій?',
      message: `Видалити пристрій «${target.name}» та всі його записи споживання?`,
      confirmText: 'Видалити',
      cancelText: 'Скасувати',
      tone: 'danger',
      icon: 'delete',
    });
    if (!ok) return;

    const nextList = this.accountDevices().filter((d) => d.id !== deviceId);
    this.isSavingDevices.set(true);
    try {
      await this.dataService.saveUtilityAccountDevices(
        acc.id,
        nextList,
        `Пристрій «${target.name}» видалено`
      );
    } finally {
      this.isSavingDevices.set(false);
    }
  }

  openAddDeviceLogModal(deviceId?: string): void {
    const devices = this.accountDevices();
    if (devices.length === 0) {
      this.openDeviceModal();
      return;
    }
    this.editingDeviceLogId.set(null);
    this.editingDeviceLogOriginalDeviceId.set(null);
    this.editingDeviceLogObj.set(null);
    this.initialLogDeviceId.set(deviceId || devices[0].id);
    this.isDeviceLogModalOpen.set(true);
  }

  openEditDeviceLogModal(deviceId: string, log: ElectricityDeviceLogEntry): void {
    this.editingDeviceLogId.set(log.id);
    this.editingDeviceLogOriginalDeviceId.set(deviceId);
    this.editingDeviceLogObj.set(log);
    this.initialLogDeviceId.set(deviceId);
    this.isDeviceLogModalOpen.set(true);
  }

  closeDeviceLogModal(): void {
    this.isDeviceLogModalOpen.set(false);
    this.editingDeviceLogId.set(null);
    this.editingDeviceLogOriginalDeviceId.set(null);
    this.editingDeviceLogObj.set(null);
  }

  async deleteDeviceLog(deviceId: string, logId: string): Promise<void> {
    const acc = this.currentAccount();
    if (!acc) return;
    const nextList = this.accountDevices().map((d) =>
      d.id === deviceId
        ? {
            ...d,
            logs: (d.logs || []).filter((l) => l.id !== logId),
            updatedAt: new Date().toISOString(),
          }
        : d
    );
    await this.dataService.saveUtilityAccountDevices(acc.id, nextList, 'Запис споживання видалено');
  }

  openScreenshotModal(deviceId?: string): void {
    this.screenshotInitialDeviceId.set(deviceId || '');
    this.isScreenshotModalOpen.set(true);
  }

  closeScreenshotModal(): void {
    this.isScreenshotModalOpen.set(false);
  }
}
