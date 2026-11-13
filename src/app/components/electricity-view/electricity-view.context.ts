import { InjectionToken, Signal, WritableSignal } from "@angular/core";
import {
  DailyWeatherPoint,
  ElectricityDevice,
  ElectricityDeviceLogEntry,
  resolveElectricityDualRates,
  UtilityAccount,
  UtilityReading,
  UtilityTariffsSettings,
  UtilityWeatherResponse,
} from "../../models/utility.model";
import { IptvData } from "../../services/iptv-data";
import { AppliedMeterReading } from "../meter-camera-modal/meter-camera-modal";
import { ElectricityStatsKPIs } from "./electricity-chart-wrapper";
import { DeviceAnalyticsSummaryResult } from "./electricity-device-analytics.util";
import { EnrichedUtilityReading } from "./electricity-reading-calc.util";

export interface ElectricityViewContext {
  readonly dataService: IptvData;
  readonly viewMode: Signal<'all' | 'schedule' | 'readings'>;
  readonly canEdit: Signal<boolean>;
  readonly liveKyivTime: WritableSignal<string>;

  readonly electricityAccounts: Signal<UtilityAccount[]>;
  readonly visibleAccountsForCurrentTab: Signal<UtilityAccount[]>;
  readonly hiddenAccountsForCurrentTab: Signal<UtilityAccount[]>;
  readonly currentAccount: Signal<UtilityAccount | null>;
  readonly selectedAccountId: WritableSignal<string>;
  readonly utilityTariffs: Signal<UtilityTariffsSettings>;

  readonly accountReadings: Signal<UtilityReading[]>;
  readonly filteredAccountReadings: Signal<EnrichedUtilityReading[]>;
  readonly latestAnyReading: Signal<UtilityReading | null>;
  readonly latestBillingReading: Signal<UtilityReading | null>;
  readonly currentSingleRate: Signal<number>;
  readonly currentDualRates: Signal<ReturnType<typeof resolveElectricityDualRates>>;
  readonly electricityStatsKPIs: Signal<ElectricityStatsKPIs>;

  readonly accountDevices: Signal<ElectricityDevice[]>;
  readonly deviceAnalyticsSummary: Signal<DeviceAnalyticsSummaryResult>;
  readonly weatherData: WritableSignal<UtilityWeatherResponse | null>;
  readonly isWeatherLoading: WritableSignal<boolean>;
  readonly isSavingDevices: WritableSignal<boolean>;

  readonly activeTab: WritableSignal<'table' | 'devices' | 'analytics'>;
  readonly filterPurpose: WritableSignal<'all' | 'billing' | 'control'>;
  readonly isAccountCardExpanded: WritableSignal<boolean>;
  readonly isHistoryTableExpanded: WritableSignal<boolean>;
  readonly isAnalyticsChartExpanded: WritableSignal<boolean>;
  readonly deviceSelectedMonth: WritableSignal<string>;
  readonly customMonthHouseKwh: WritableSignal<number | null>;

  // Modal signals & open/close actions
  readonly isAccountModalOpen: WritableSignal<boolean>;
  readonly editingAccount: WritableSignal<UtilityAccount | null>;
  openAccountModal(acc: UtilityAccount | null): void;
  closeAccountModal(): void;

  readonly isReadingModalOpen: WritableSignal<boolean>;
  readonly editingReadingId: WritableSignal<string | null>;
  readonly editingReadingObj: WritableSignal<UtilityReading | null>;
  readonly readingModalInitialControl: WritableSignal<boolean>;
  readonly appliedCameraReading: WritableSignal<AppliedMeterReading | null>;
  openReadingModal(isControl?: boolean): void;
  openEditReadingModal(r: UtilityReading): void;
  closeReadingModal(): void;

  readonly isCameraModalOpen: WritableSignal<boolean>;
  openCameraModal(): void;
  closeCameraModal(): void;
  onCameraReadingApplied(applied: AppliedMeterReading): void;

  readonly selectedReadingForBreakdown: WritableSignal<UtilityReading | null>;
  showReadingBreakdown(r: UtilityReading): void;
  closeReadingBreakdown(): void;

  readonly isDeviceModalOpen: WritableSignal<boolean>;
  readonly editingDeviceId: WritableSignal<string | null>;
  readonly editingDeviceObj: WritableSignal<ElectricityDevice | null>;
  openDeviceModal(): void;
  openEditDeviceModal(device: ElectricityDevice): void;
  closeDeviceModal(): void;

  readonly isDeviceLogModalOpen: WritableSignal<boolean>;
  readonly editingDeviceLogId: WritableSignal<string | null>;
  readonly editingDeviceLogOriginalDeviceId: WritableSignal<string | null>;
  readonly editingDeviceLogObj: WritableSignal<ElectricityDeviceLogEntry | null>;
  readonly initialLogDeviceId: WritableSignal<string>;
  openAddDeviceLogModal(deviceId?: string): void;
  openEditDeviceLogModal(deviceId: string, log: ElectricityDeviceLogEntry): void;
  closeDeviceLogModal(): void;

  readonly isScreenshotModalOpen: WritableSignal<boolean>;
  readonly screenshotInitialDeviceId: WritableSignal<string>;
  openScreenshotModal(deviceId?: string): void;
  closeScreenshotModal(): void;

  // Shared helper methods
  loadWeatherForCurrentAccount(city?: string, month?: string, date?: string): Promise<void>;
  getWeatherForDate(dateStr?: string | null, endDateStr?: string | null): DailyWeatherPoint;
  getEffectiveLogWeather(log: ElectricityDeviceLogEntry): DailyWeatherPoint;
  getEffectivePrevReading(
    isControl: boolean,
    targetDate: string,
    excludeId?: string | null
  ): { t1: number; t2: number; prevDate?: string };
  deleteDevice(deviceId: string): Promise<void>;
  deleteDeviceLog(deviceId: string, logId: string): Promise<void>;
  formatDate(dateStr: string): string;
}

export const ELECTRICITY_VIEW_CTX = new InjectionToken<ElectricityViewContext>('ELECTRICITY_VIEW_CTX');
