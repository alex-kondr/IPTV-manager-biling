import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { IptvData, DtekQueueSchedule, DtekHourSchedule, DtekMeterCheckResult } from '../../services/iptv-data';
import {
  UtilityAccount,
  UtilityReading,
  resolveElectricitySingleRate,
  resolveElectricityDualRates,
  getSeasonForDate,
  calculateElectricityCost,
  ElectricityCostResult,
  ElectricityDevice,
  ElectricityDeviceLogEntry,
  ElectricityScreenshotAnalysisResult,
  DailyWeatherPoint,
  UtilityWeatherResponse,
  DeviceConsumptionEntryMode,
  OutageScheduleViewVariant,
  OUTAGE_SCHEDULE_VARIANTS,
  OutageScheduleVariantMeta,
  UtilityServiceTabId,
  ControlReadingNoteAnalysis,
  parseControlReadingNote,
  isAirConditionerDevice,
  computeDeviceEmpiricalReadingStats,
  resolveAirConditionerPowerProfile,
} from '../../models/utility.model';
import { formatDateUa } from '../../models/client.model';
import { MeterCameraModal, AppliedMeterReading } from '../meter-camera-modal/meter-camera-modal';
import { ElectricityChartComponent } from './electricity-chart.component';
import {
  ElectricityTimelinePoint,
  ElectricityMonthlySummary,
  ElectricityStatsKPIs,
} from './electricity-chart-wrapper';

import {
  OutageScheduleVariantsComponent,
  OutageChronologicalInterval,
  OutageShiftQuadrant,
} from './outage-schedule-variants';

@Component({
  selector: 'app-electricity-view',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatIconModule,
    MeterCameraModal,
    ElectricityChartComponent,
    OutageScheduleVariantsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div id="electricity-container" class="space-y-6 max-w-7xl mx-auto">
      @if (viewMode() !== 'schedule' && canEdit()) {
        <div class="flex items-center justify-end">
          <button
            type="button"
            (click)="openAccountModal(null)"
            class="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <mat-icon class="text-base leading-none">add_business</mat-icon>
            <span>Додати будинок</span>
          </button>
        </div>
      }

      <!-- Unified House / Account Selector with Default House Persistence & Per-Tab Visibility -->
      @if (visibleAccountsForCurrentTab().length > 0 || hiddenAccountsForCurrentTab().length > 0) {
        <div class="p-3 sm:p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-2">
          <div class="flex items-center justify-between gap-1.5 flex-wrap">
            <div class="flex items-center gap-1.5 min-w-0">
              <mat-icon class="text-base text-amber-500 shrink-0">home_pin</mat-icon>
              <span class="text-xs font-bold text-slate-800 truncate">
                Будинок ({{ visibleAccountsForCurrentTab().length }}):
              </span>
            </div>
            <div class="flex items-center gap-1.5 flex-wrap justify-end">
              @if (currentAccount(); as activeAcc) {
                @if (defaultDtekAccountId() !== activeAcc.id) {
                  <button
                    type="button"
                    (click)="setAsDefaultHouse(activeAcc.id)"
                    [disabled]="isSavingDefaultHouse()"
                    class="px-2 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-2xs font-bold inline-flex items-center gap-1 transition-colors cursor-pointer shadow-2xs disabled:opacity-50 shrink-0"
                    title="Встановити цей будинок за замовчуванням"
                  >
                    <mat-icon class="text-xs">star</mat-icon>
                    <span>{{ isSavingDefaultHouse() ? '...' : 'За замовч.' }}</span>
                  </button>
                }
                @if (canEdit()) {
                  <button
                    type="button"
                    (click)="toggleHideHouseInCurrentTab(activeAcc.id)"
                    class="px-2 py-1 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 hover:border-rose-200 text-2xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                    title="Приховати поточний будинок лише на цій вкладці"
                  >
                    <mat-icon class="text-xs">visibility_off</mat-icon>
                    <span>Сховати</span>
                  </button>
                }
              }
              @if (hiddenAccountsForCurrentTab().length > 0) {
                <button
                  type="button"
                  (click)="showHiddenHousesPanel.set(!showHiddenHousesPanel())"
                  class="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-2xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                  title="Показати або сховати список прихованих будинків на цій вкладці"
                >
                  <mat-icon class="text-xs text-slate-500">{{ showHiddenHousesPanel() ? 'visibility' : 'visibility_off' }}</mat-icon>
                  <span>Приховані ({{ hiddenAccountsForCurrentTab().length }})</span>
                </button>
              }
            </div>
          </div>

          @if (visibleAccountsForCurrentTab().length > 0) {
            <div class="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
              @for (acc of visibleAccountsForCurrentTab(); track acc.id) {
                <button
                  type="button"
                  (click)="selectAccount(acc.id)"
                  [class.bg-slate-900]="currentAccount()?.id === acc.id"
                  [class.text-white]="currentAccount()?.id === acc.id"
                  [class.border-slate-900]="currentAccount()?.id === acc.id"
                  [class.bg-slate-50]="currentAccount()?.id !== acc.id"
                  [class.text-slate-700]="currentAccount()?.id !== acc.id"
                  [class.border-slate-200]="currentAccount()?.id !== acc.id"
                  class="px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2.5 shrink-0 transition-all shadow-2xs cursor-pointer hover:border-slate-400"
                >
                  <mat-icon class="text-base" [class.text-amber-400]="currentAccount()?.id === acc.id" [class.text-amber-500]="currentAccount()?.id !== acc.id">
                    {{ defaultDtekAccountId() === acc.id ? 'star' : 'home' }}
                  </mat-icon>
                  <div class="text-left">
                    <div class="font-bold leading-tight flex items-center gap-1.5">
                      <span>{{ acc.name }}</span>
                      @if (defaultDtekAccountId() === acc.id) {
                        <span
                          class="px-1.5 py-0.2 rounded text-3xs font-extrabold uppercase"
                          [class.bg-amber-400]="currentAccount()?.id === acc.id"
                          [class.text-slate-950]="currentAccount()?.id === acc.id"
                          [class.bg-amber-100]="currentAccount()?.id !== acc.id"
                          [class.text-amber-900]="currentAccount()?.id !== acc.id"
                        >
                          За замовч.
                        </span>
                      }
                    </div>
                    <div class="text-3xs opacity-80">
                      @if (viewMode() !== 'schedule' && acc.accountNumber) {
                        № {{ acc.accountNumber }}
                        @if (hasAccountAddress(acc)) {
                          • {{ getAccountFormattedAddress(acc) }}
                        }
                      } @else if (hasAccountAddress(acc)) {
                        {{ getAccountFormattedAddress(acc) }}
                      } @else {
                        Адресу будинку не вказано
                      }
                    </div>
                  </div>
                  @if (viewMode() !== 'schedule') {
                    @let due = getHouseDueInfo(acc);
                    <div class="flex items-center gap-1.5 shrink-0">
                      @if (due.hasDue) {
                        <span
                          class="px-2 py-0.5 rounded-lg text-3xs font-extrabold whitespace-nowrap shadow-xs"
                          [class.bg-amber-400]="!due.isZeroOrPaid && currentAccount()?.id === acc.id"
                          [class.text-slate-950]="!due.isZeroOrPaid && currentAccount()?.id === acc.id"
                          [class.bg-amber-100]="!due.isZeroOrPaid && currentAccount()?.id !== acc.id"
                          [class.text-amber-900]="!due.isZeroOrPaid && currentAccount()?.id !== acc.id"
                          [class.border]="!due.isZeroOrPaid && currentAccount()?.id !== acc.id"
                          [class.border-amber-300]="!due.isZeroOrPaid && currentAccount()?.id !== acc.id"
                          [class.bg-emerald-500/25]="due.isZeroOrPaid && currentAccount()?.id === acc.id"
                          [class.text-emerald-300]="due.isZeroOrPaid && currentAccount()?.id === acc.id"
                          [class.border]="due.isZeroOrPaid && currentAccount()?.id === acc.id"
                          [class.border-emerald-500/40]="due.isZeroOrPaid && currentAccount()?.id === acc.id"
                          [class.bg-emerald-100]="due.isZeroOrPaid && currentAccount()?.id !== acc.id"
                          [class.text-emerald-800]="due.isZeroOrPaid && currentAccount()?.id !== acc.id"
                          [class.border-emerald-200]="due.isZeroOrPaid && currentAccount()?.id !== acc.id"
                        >
                          @if (!due.isZeroOrPaid) {
                            До сплати: {{ due.amount.toFixed(2) }} грн
                          } @else {
                            Сплачено (0.00 грн)
                          }
                        </span>
                      }
                      <span
                        class="px-1.5 py-0.5 rounded text-3xs font-bold uppercase"
                        [class.bg-white/20]="currentAccount()?.id === acc.id"
                        [class.text-white]="currentAccount()?.id === acc.id"
                        [class.bg-slate-200/80]="currentAccount()?.id !== acc.id"
                        [class.text-slate-700]="currentAccount()?.id !== acc.id"
                      >
                        {{ acc.electricityTariffType === 'dual' ? '2-зонний' : '1-зонний' }}
                      </span>
                    </div>
                  }
                </button>
              }
            </div>
          } @else {
            <div class="p-3 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-900 flex items-center justify-between gap-2 flex-wrap">
              <span>Всі будинки приховано на цій вкладці. Натисніть «Повернути», щоб знову відобразити потрібний будинок.</span>
            </div>
          }

          @if (hiddenAccountsForCurrentTab().length > 0 && (showHiddenHousesPanel() || visibleAccountsForCurrentTab().length === 0)) {
            <div class="pt-2 border-t border-slate-100 flex items-center gap-2 flex-wrap">
              <span class="text-2xs font-bold text-slate-500">Приховані будинки:</span>
              @for (hAcc of hiddenAccountsForCurrentTab(); track hAcc.id) {
                <button
                  type="button"
                  (click)="toggleHideHouseInCurrentTab(hAcc.id)"
                  class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border border-slate-200 hover:border-emerald-300 text-2xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Повернути будинок на цю вкладку"
                >
                  <mat-icon class="text-xs text-emerald-600">visibility</mat-icon>
                  <span>{{ hAcc.name }}</span>
                  <span class="text-3xs text-emerald-700 font-bold">(Повернути)</span>
                </button>
              }
            </div>
          }
        </div>
      }

      @if (viewMode() !== 'readings') {
        <!-- ============================================================== -->
        <!-- QUEUES LIST VIEW (Shown when NO house with address is added,   -->
        <!-- or when user switches to "Список черг ДТЕК")                   -->
        <!-- ============================================================== -->
        @if (!hasHouseWithAddress() || forceShowQueuesMode()) {
          <div class="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
            <!-- Header Row -->
            <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div class="flex items-start sm:items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold shadow-2xs shrink-0">
                  <mat-icon>view_comfy_alt</mat-icon>
                </div>
                <div>
                  <div class="flex items-center gap-2 flex-wrap">
                    <h3 class="text-sm sm:text-base font-bold text-slate-900">
                      Список черг стабілізаційних відключень ДТЕК
                    </h3>
                    @if (!hasHouseWithAddress()) {
                      <span class="px-2.5 py-0.5 rounded-full text-2xs font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                        <mat-icon class="text-xs leading-none">info</mat-icon>
                        <span>Будинок з адресою не додано — оберіть чергу зі списку</span>
                      </span>
                    } @else {
                      <span class="px-2.5 py-0.5 rounded-full text-2xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                        Всі черги (1.1 – 6.2)
                      </span>
                    }
                  </div>
                  <div class="flex items-center gap-2 flex-wrap text-xs text-slate-600 mt-1">
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-900 border border-emerald-200 font-semibold">
                      <mat-icon class="text-xs text-emerald-600 leading-none">update</mat-icon>
                      <span>Оновлено ДТЕК: <strong>{{ dtekInfo()?.dtekJsonUpdatedAt || dtekInfo()?.updateFact || '—' }}</strong></span>
                    </span>
                    @if (dtekInfo()?.lastDtekFetchAt || dtekInfo()?.fetchedAt) {
                      <span
                        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-200 font-semibold"
                        [title]="'Графік зберігається у спільній базі даних та оновлюється з сайту ДТЕК кожні ' + (dtekInfo()?.syncIntervalMinutes || dataService.dtekSyncIntervalMinutes()) + ' хвилин'"
                      >
                        <mat-icon class="text-xs text-amber-600 leading-none">storage</mat-icon>
                        <span>Запит у БД: <strong>{{ dtekInfo()?.lastDtekFetchAt || dtekInfo()?.fetchedAt }}</strong> (інтервал {{ dtekInfo()?.syncIntervalMinutes || dataService.dtekSyncIntervalMinutes() }} хв)</span>
                      </span>
                    }
                    <span>•</span>
                    <span class="text-indigo-600 font-mono font-bold inline-flex items-center gap-1.5 bg-indigo-50 px-2.5 py-0.5 rounded-lg border border-indigo-200/80 shadow-2xs">
                      <span class="relative flex h-2 w-2">
                        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      <span>Київський час: {{ liveKyivTime() || dtekInfo()?.kyivTime || '—' }}</span>
                    </span>
                    @if (weatherData(); as w) {
                      <span>•</span>
                      <span
                        class="text-sky-700 dark:text-sky-300 font-medium inline-flex items-center gap-1.5 bg-sky-50 dark:bg-slate-800 px-2.5 py-0.5 rounded-lg border border-sky-200/80 dark:border-slate-700 shadow-2xs text-2xs"
                        [title]="'Погода зараз (' + (w.resolvedLocation || w.city) + '): ' + w.current.condition + ', вітер ' + w.current.windSpeedKmh + ' км/год, вологість ' + w.current.humidityPct + '%'"
                      >
                        <mat-icon class="text-sm text-sky-600 dark:text-sky-400 leading-none">{{ w.current.icon || 'wb_sunny' }}</mat-icon>
                        <span class="font-bold font-mono text-slate-900 dark:text-white">
                          {{ w.current.tempC > 0 ? '+' : '' }}{{ w.current.tempC }}°C
                        </span>
                        <span class="text-slate-500 dark:text-slate-400">({{ w.current.condition }})</span>
                        @if (w.resolvedLocation || w.city) {
                          <span class="hidden md:inline text-slate-400 dark:text-slate-500">• {{ w.resolvedLocation || w.city }}</span>
                        }
                      </span>
                    }
                    <span>•</span>
                    <span class="text-slate-500">Натисніть на плитку черги, щоб відкрити графік</span>
                  </div>
                </div>
              </div>

              <div class="flex items-center gap-2 shrink-0 flex-wrap">

                @if (hasHouseWithAddress()) {
                  <button
                    type="button"
                    (click)="forceShowQueuesMode.set(false)"
                    class="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <mat-icon class="text-base leading-none">home_pin</mat-icon>
                    <span>Графік за адресою будинку</span>
                  </button>
                } @else if (canEdit()) {
                  <button
                    type="button"
                    (click)="openAccountModal(currentAccount())"
                    class="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <mat-icon class="text-base leading-none">add_location_alt</mat-icon>
                    <span>{{ currentAccount() ? 'Вказати адресу будинку' : '+ Додати будинок з адресою' }}</span>
                  </button>
                }

                <button
                  type="button"
                  (click)="refreshDtekSchedule()"
                  [disabled]="isDtekLoading()"
                  class="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white transition-colors flex items-center gap-1.5 shadow-2xs disabled:opacity-50 cursor-pointer"
                >
                  <mat-icon class="text-base leading-none" [class.animate-spin]="isDtekLoading()">sync</mat-icon>
                  <span>{{ isDtekLoading() ? 'Оновлення...' : 'Оновити черги' }}</span>
                </button>
              </div>
            </div>

            <!-- Quick 10-Variant Switcher Bar inside Queues Card -->
            <div class="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col gap-2">
              <div class="flex items-center justify-between gap-2 flex-wrap">
                <div class="flex items-center gap-2">
                  <mat-icon class="text-sm text-amber-600 leading-none">{{ activeOutageVariantMeta().icon }}</mat-icon>
                  <span class="text-xs font-bold text-slate-800">
                    Активний стиль графіку: <span class="text-amber-700">{{ activeOutageVariantMeta().name }}</span>
                  </span>
                </div>
                <button
                  type="button"
                  (click)="openOutageDisplaySettings()"
                  class="text-2xs font-bold text-indigo-700 hover:text-indigo-900 inline-flex items-center gap-1 cursor-pointer"
                >
                  <mat-icon class="text-xs leading-none">settings</mat-icon>
                  <span>Відкрити налаштування вигляду графіку →</span>
                </button>
              </div>
              <div class="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                @for (v of outageScheduleVariants; track v.id) {
                  @let isSelected = activeOutageVariant() === v.id;
                  <button
                    type="button"
                    (click)="selectOutageVariantInline(v.id)"
                    class="px-2.5 py-1.5 rounded-lg text-2xs font-bold flex items-center gap-1.5 shrink-0 border transition-all cursor-pointer"
                    [class.bg-slate-900]="isSelected"
                    [class.text-white]="isSelected"
                    [class.border-slate-900]="isSelected"
                    [class.bg-white]="!isSelected"
                    [class.text-slate-700]="!isSelected"
                    [class.border-slate-200]="!isSelected"
                    [class.hover:border-amber-400]="!isSelected"
                    [title]="v.description"
                  >
                    <mat-icon class="text-xs leading-none" [class.text-amber-400]="isSelected" [class.text-slate-500]="!isSelected">{{ v.icon }}</mat-icon>
                    <span>{{ v.shortName }}</span>
                  </button>
                }
              </div>
            </div>

            <!-- Small Queue Tiles Grid with Animated Dropdown Schedule -->
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
              @for (q of allQueuesList(); track q.queueKey) {
                @let isOpen = isQueueDropdownOpen(q.queueKey);
                <div
                  class="rounded-xl border transition-all duration-200 overflow-hidden"
                  [class.col-span-2]="isOpen"
                  [class.sm:col-span-3]="isOpen"
                  [class.md:col-span-4]="isOpen"
                  [class.lg:col-span-6]="isOpen"
                  [class.border-indigo-500]="isOpen"
                  [class.ring-2]="isOpen"
                  [class.ring-indigo-500/20]="isOpen"
                  [class.bg-white]="isOpen"
                  [class.shadow-md]="isOpen"
                  [class.border-emerald-200]="!isOpen && q.isPowerAvailableNow"
                  [class.bg-emerald-50/40]="!isOpen && q.isPowerAvailableNow"
                  [class.hover:border-emerald-400]="!isOpen && q.isPowerAvailableNow"
                  [class.border-rose-300]="!isOpen && !q.isPowerAvailableNow"
                  [class.bg-rose-50/50]="!isOpen && !q.isPowerAvailableNow"
                  [class.hover:border-rose-400]="!isOpen && !q.isPowerAvailableNow"
                >
                  <!-- Compact Clickable Queue Tile Header -->
                  <button
                    type="button"
                    (click)="toggleQueueDropdown(q.queueKey)"
                    class="w-full p-3 text-left flex items-center justify-between gap-2 cursor-pointer select-none transition-colors"
                    [class.bg-slate-900]="isOpen"
                    [class.text-white]="isOpen"
                  >
                    <div class="flex items-center gap-2.5 min-w-0">
                      <div
                        class="w-8 h-8 rounded-lg flex items-center justify-center font-extrabold text-xs shrink-0"
                        [class.bg-emerald-500]="q.isPowerAvailableNow"
                        [class.text-white]="q.isPowerAvailableNow"
                        [class.bg-rose-600]="!q.isPowerAvailableNow"
                        [class.text-white]="!q.isPowerAvailableNow"
                      >
                        {{ q.queueNumber }}
                      </div>
                      <div class="min-w-0">
                        <div class="text-xs sm:text-sm font-black leading-tight truncate" [class.text-white]="isOpen" [class.text-slate-900]="!isOpen">
                          {{ q.queueTitle }}
                        </div>
                        <div class="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span
                            class="inline-flex items-center gap-0.5 text-3xs font-bold"
                            [class.text-emerald-300]="isOpen && q.isPowerAvailableNow"
                            [class.text-rose-300]="isOpen && !q.isPowerAvailableNow"
                            [class.text-emerald-700]="!isOpen && q.isPowerAvailableNow"
                            [class.text-rose-700]="!isOpen && !q.isPowerAvailableNow"
                          >
                            {{ q.isPowerAvailableNow ? '⚡ Світло є' : '🔌 Відключення' }}
                          </span>
                          <span class="text-3xs opacity-75 font-mono" [class.text-slate-300]="isOpen" [class.text-slate-500]="!isOpen">
                            • {{ q.totalOutageHours > 0 ? ('-' + q.totalOutageHours + ' год') : '24 год' }}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div class="flex items-center gap-1.5 shrink-0">
                      @if (isOpen) {
                        <span class="hidden sm:inline-block px-2 py-0.5 rounded bg-white/15 text-white text-3xs font-semibold">
                          Згорнути графік
                        </span>
                      }
                      <mat-icon
                        class="text-lg transition-transform duration-300 leading-none"
                        [class.rotate-180]="isOpen"
                        [class.text-amber-400]="isOpen"
                        [class.text-slate-400]="!isOpen"
                      >
                        expand_more
                      </mat-icon>
                    </div>
                  </button>

                  <!-- Animated Dropdown Content for This Queue -->
                  <div
                    class="grid transition-all duration-300 ease-in-out"
                    [class.grid-rows-[1fr]]="isOpen"
                    [class.opacity-100]="isOpen"
                    [class.grid-rows-[0fr]]="!isOpen"
                    [class.opacity-0]="!isOpen"
                  >
                    <div class="overflow-hidden">
                      <div class="p-4 border-t border-slate-200 bg-slate-50/70 space-y-3.5">
                        <!-- Summary Row: Outage Intervals + Hours -->
                        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-200/80">
                          <div class="flex items-center gap-2 flex-wrap">
                            <span class="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-xs font-extrabold">
                              {{ q.queueTitle }} ({{ q.queueKey }})
                            </span>
                            <span class="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-200 text-xs font-bold">
                              Зі світлом: {{ q.totalPowerHours }} год
                            </span>
                            <span class="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-900 border border-rose-200 text-xs font-bold">
                              Без світла: {{ q.totalOutageHours }} год
                            </span>
                          </div>

                          <div class="flex items-center gap-1.5 flex-wrap">
                            <span class="text-2xs font-bold text-slate-600">Час відключень сьогодні:</span>
                            @if (q.outageIntervals.length > 0) {
                              @for (interval of q.outageIntervals; track interval) {
                                <span class="px-2.5 py-0.5 rounded-md bg-rose-600 text-white text-xs font-mono font-bold shadow-2xs">
                                  {{ interval }}
                                </span>
                              }
                            } @else {
                              <span class="px-2.5 py-0.5 rounded-md bg-emerald-600 text-white text-xs font-bold">
                                Без стабілізаційних відключень
                              </span>
                            }
                          </div>
                        </div>

                        <!-- Queue Schedule Display (adapts to selected variant or shows interval/ribbon/grid) -->
                        @switch (activeOutageVariant()) {
                          @case ('v5_interval_cards') {
                            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                              @for (iv of getGroupedIntervals(q.hourlySchedule, dtekStatus()?.currentHourNumber || 0, dtekStatus()?.currentMinute || 0); track iv.id) {
                                <div
                                  class="p-2.5 rounded-xl border flex items-center justify-between gap-2"
                                  [class.bg-emerald-50]="iv.state === 'on'"
                                  [class.border-emerald-200]="iv.state === 'on'"
                                  [class.bg-rose-50]="iv.state === 'off'"
                                  [class.border-rose-300]="iv.state === 'off'"
                                  [class.ring-2]="iv.containsCurrentTime"
                                  [class.ring-slate-900]="iv.containsCurrentTime"
                                >
                                  <div>
                                    <div class="text-xs font-mono font-black text-slate-900">{{ iv.fromTime }} – {{ iv.toTime }}</div>
                                    <div class="text-3xs font-bold" [class.text-emerald-700]="iv.state === 'on'" [class.text-rose-700]="iv.state === 'off'">
                                      {{ iv.state === 'on' ? '⚡ Світло є' : '🔌 Відключення' }}
                                      @if (iv.containsCurrentTime) { • ЗАРАЗ }
                                    </div>
                                  </div>
                                  <span class="px-2 py-0.5 rounded-lg text-2xs font-mono font-extrabold bg-white border border-slate-200 text-slate-800">
                                    {{ iv.durationHours }} год
                                  </span>
                                </div>
                              }
                            </div>
                          }
                          @case ('v4_shift_quadrants') {
                            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                              @for (sh of getShiftQuadrants(q.hourlySchedule, dtekStatus()?.currentHourNumber || 0); track sh.id) {
                                <div class="p-3 rounded-xl border border-slate-200 bg-white space-y-2">
                                  <div class="flex items-center justify-between">
                                    <span class="text-xs font-bold text-slate-900">{{ sh.title }} ({{ sh.timeRange }})</span>
                                    <span class="text-3xs font-mono font-bold text-emerald-700">+{{ sh.powerHours }}г / -{{ sh.outageHours }}г</span>
                                  </div>
                                  <div class="grid grid-cols-6 gap-1">
                                    @for (hItem of sh.hours; track hItem.hour) {
                                      <div class="p-1 rounded border border-slate-200 text-center">
                                        <div class="text-4xs font-mono font-bold">{{ hItem.fromTime.substring(0, 2) }}</div>
                                        <div class="h-2 rounded-xs mt-0.5"
                                          [class.bg-emerald-500]="hItem.firstHalfPower && hItem.secondHalfPower"
                                          [class.bg-rose-500]="!hItem.firstHalfPower && !hItem.secondHalfPower"
                                          [class.bg-amber-500]="hItem.firstHalfPower !== hItem.secondHalfPower"
                                        ></div>
                                      </div>
                                    }
                                  </div>
                                </div>
                              }
                            </div>
                          }
                          @case ('v11_dtek_official_sheet') {
                            <div class="p-3 sm:p-4 rounded-xl bg-white border border-slate-200 space-y-3 overflow-x-auto">
                              <div class="min-w-[660px] border border-slate-300 rounded-xl overflow-hidden bg-white">
                                <div class="flex border-b border-slate-300 bg-white">
                                  <div class="w-28 sm:w-32 shrink-0 px-2.5 py-2 border-r border-slate-300 flex flex-col justify-center text-left">
                                    <span class="text-2xs font-bold text-slate-900 leading-tight">Часові</span>
                                    <span class="text-2xs font-bold text-slate-900 leading-tight">проміжки</span>
                                  </div>
                                  @for (hItem of q.hourlySchedule; track hItem.hour) {
                                    <div class="flex-1 min-w-[22px] h-14 border-r last:border-r-0 border-slate-300 flex items-center justify-center bg-white select-none">
                                      <span class="text-[10px] font-bold text-slate-900 tracking-tight whitespace-nowrap -rotate-90">
                                        {{ hItem.fromTime.substring(0, 2) }}-{{ hItem.toTime.substring(0, 2) }}
                                      </span>
                                    </div>
                                  }
                                </div>
                                <div class="flex bg-white">
                                  <div class="w-28 sm:w-32 shrink-0 px-2.5 py-2 border-r border-slate-300 flex items-center text-left">
                                    <span class="text-2xs font-bold text-slate-950 whitespace-nowrap">
                                      Сьогодні {{ (q.scheduleDate || dtekStatus()?.scheduleDate || '').slice(0, 5) }}
                                    </span>
                                  </div>
                                  @for (hItem of q.hourlySchedule; track hItem.hour) {
                                    @let isFullPower = hItem.firstHalfPower && hItem.secondHalfPower;
                                    @let isFullOutage = !hItem.firstHalfPower && !hItem.secondHalfPower;
                                    @let isFirstHalfOutage = !hItem.firstHalfPower && hItem.secondHalfPower;
                                    @let isSecondHalfOutage = hItem.firstHalfPower && !hItem.secondHalfPower;
                                    <div
                                      class="flex-1 min-w-[22px] h-11 border-r last:border-r-0 border-slate-300 relative flex items-center justify-center overflow-hidden"
                                      [class.bg-white]="isFullPower"
                                      [class.bg-[#d6d8db]]="isFullOutage"
                                      [title]="hItem.timeLabel + ': ' + hItem.statusLabel"
                                    >
                                      @if (isFirstHalfOutage) {
                                        <div class="absolute inset-0 flex pointer-events-none">
                                          <div class="w-1/2 h-full bg-[#d6d8db]"></div>
                                          <div class="w-1/2 h-full bg-white"></div>
                                        </div>
                                      }
                                      @if (isSecondHalfOutage) {
                                        <div class="absolute inset-0 flex pointer-events-none">
                                          <div class="w-1/2 h-full bg-white"></div>
                                          <div class="w-1/2 h-full bg-[#d6d8db]"></div>
                                        </div>
                                      }
                                      @if (isFullOutage) {
                                        <svg viewBox="0 0 24 24" class="w-3.5 h-3.5 relative z-10" aria-hidden="true">
                                          <path d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z" fill="#1e293b" />
                                          <line x1="3.5" y1="5.5" x2="20.5" y2="18.5" stroke="#1e293b" stroke-width="2.2" stroke-linecap="round" />
                                        </svg>
                                      }
                                      @if (isFirstHalfOutage || isSecondHalfOutage) {
                                        <svg viewBox="0 0 24 24" class="w-3.5 h-3.5 relative z-10" aria-hidden="true">
                                          <path d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z" fill="#eab308" stroke="#1e293b" stroke-width="1.2" stroke-linejoin="round" />
                                          <line x1="3.5" y1="5.5" x2="20.5" y2="18.5" stroke="#1e293b" stroke-width="2" stroke-linecap="round" />
                                        </svg>
                                      }
                                    </div>
                                  }
                                </div>
                              </div>
                            </div>
                          }
                          @default {
                            <!-- Today 24-Hour Timeline inside Dropdown -->
                            <div class="space-y-1.5">
                              <div class="flex items-center justify-between flex-wrap gap-2">
                                <span class="text-xs font-bold text-slate-800">
                                  Погодинний графік на сьогодні ({{ q.scheduleDate || dtekStatus()?.scheduleDate || 'поточна доба' }}):
                                </span>
                                <div class="flex items-center gap-3 text-3xs font-semibold">
                                  <span class="inline-flex items-center gap-1 text-emerald-700">
                                    <span class="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block"></span> Світло є
                                  </span>
                                  <span class="inline-flex items-center gap-1 text-amber-700">
                                    <span class="w-2.5 h-2.5 rounded-xs bg-gradient-to-r from-rose-500 to-emerald-500 inline-block"></span> 30 хв
                                  </span>
                                  <span class="inline-flex items-center gap-1 text-rose-700">
                                    <span class="w-2.5 h-2.5 rounded-xs bg-rose-500 inline-block"></span> Відключення
                                  </span>
                                </div>
                              </div>

                              <div class="grid grid-cols-6 sm:grid-cols-12 lg:grid-cols-24 gap-1">
                                @for (hItem of q.hourlySchedule; track hItem.hour) {
                                  @let isCurrentHour = hItem.hour === (dtekStatus()?.currentHourNumber || 0);
                                  <div
                                    class="p-1 rounded-lg border flex flex-col items-center justify-between text-center bg-white"
                                    [class.border-slate-900]="isCurrentHour"
                                    [class.ring-2]="isCurrentHour"
                                    [class.ring-amber-400]="isCurrentHour"
                                    [class.border-slate-200]="!isCurrentHour"
                                    [title]="hItem.timeLabel + ': ' + hItem.statusLabel"
                                  >
                                    <span class="text-3xs font-mono font-bold leading-none mb-1 text-slate-700">
                                      {{ hItem.fromTime.substring(0, 2) }}
                                    </span>
                                    <div class="w-full h-4 rounded flex overflow-hidden gap-0.5 p-0.5 bg-slate-100">
                                      <div
                                        class="h-full flex-1 rounded-xs"
                                        [class.bg-emerald-500]="hItem.firstHalfPower"
                                        [class.bg-rose-500]="!hItem.firstHalfPower"
                                      ></div>
                                      <div
                                        class="h-full flex-1 rounded-xs"
                                        [class.bg-emerald-500]="hItem.secondHalfPower"
                                        [class.bg-rose-500]="!hItem.secondHalfPower"
                                      ></div>
                                    </div>
                                    <span
                                      class="text-4xs font-bold leading-tight mt-0.5"
                                      [class.text-emerald-700]="hItem.firstHalfPower && hItem.secondHalfPower"
                                      [class.text-rose-700]="!hItem.firstHalfPower && !hItem.secondHalfPower"
                                      [class.text-amber-700]="hItem.firstHalfPower !== hItem.secondHalfPower"
                                    >
                                      {{ hItem.statusKey === 'yes' ? 'Є' : (hItem.statusKey === 'no' ? 'Ні' : '0.5h') }}
                                    </span>
                                  </div>
                                }
                              </div>
                            </div>
                          }
                        }

                        <!-- Tomorrow 24-Hour Timeline inside Dropdown (if available) — uses the same activeOutageVariant() style -->
                        @if (q.tomorrowSchedule; as tom) {
                          <div class="space-y-2 pt-2.5 border-t border-slate-200/80">
                            <div class="flex items-center gap-2 flex-wrap">
                              <span class="px-2 py-0.5 rounded bg-amber-500 text-white text-3xs font-bold uppercase">
                                Завтра ({{ tom.scheduleDate }})
                              </span>
                              <span class="text-3xs font-bold text-emerald-700">Світло: {{ tom.totalPowerHours }} год</span>
                              <span class="text-3xs font-bold text-rose-700">Відключення: {{ tom.totalOutageHours }} год</span>
                            </div>

                            @switch (activeOutageVariant()) {
                              @case ('v5_interval_cards') {
                                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                                  @for (iv of getGroupedIntervals(tom.hourlySchedule, 0, 0); track iv.id) {
                                    <div
                                      class="p-2.5 rounded-xl border flex items-center justify-between gap-2"
                                      [class.bg-emerald-50]="iv.state === 'on'"
                                      [class.border-emerald-200]="iv.state === 'on'"
                                      [class.bg-rose-50]="iv.state === 'off'"
                                      [class.border-rose-300]="iv.state === 'off'"
                                    >
                                      <div>
                                        <div class="text-xs font-mono font-black text-slate-900">{{ iv.fromTime }} – {{ iv.toTime }}</div>
                                        <div class="text-3xs font-bold" [class.text-emerald-700]="iv.state === 'on'" [class.text-rose-700]="iv.state === 'off'">
                                          {{ iv.state === 'on' ? '⚡ Світло є' : '🔌 Відключення' }}
                                        </div>
                                      </div>
                                      <span class="px-2 py-0.5 rounded-lg text-2xs font-mono font-extrabold bg-white border border-slate-200 text-slate-800">
                                        {{ iv.durationHours }} год
                                      </span>
                                    </div>
                                  }
                                </div>
                              }
                              @case ('v4_shift_quadrants') {
                                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                                  @for (sh of getShiftQuadrants(tom.hourlySchedule, 0); track sh.id) {
                                    <div class="p-3 rounded-xl border border-slate-200 bg-white space-y-2">
                                      <div class="flex items-center justify-between">
                                        <span class="text-xs font-bold text-slate-900">{{ sh.title }} ({{ sh.timeRange }})</span>
                                        <span class="text-3xs font-mono font-bold text-emerald-700">+{{ sh.powerHours }}г / -{{ sh.outageHours }}г</span>
                                      </div>
                                      <div class="grid grid-cols-6 gap-1">
                                        @for (hItem of sh.hours; track hItem.hour) {
                                          <div class="p-1 rounded border border-slate-200 text-center">
                                            <div class="text-4xs font-mono font-bold">{{ hItem.fromTime.substring(0, 2) }}</div>
                                            <div class="h-2 rounded-xs mt-0.5"
                                              [class.bg-emerald-500]="hItem.firstHalfPower && hItem.secondHalfPower"
                                              [class.bg-rose-500]="!hItem.firstHalfPower && !hItem.secondHalfPower"
                                              [class.bg-amber-500]="hItem.firstHalfPower !== hItem.secondHalfPower"
                                            ></div>
                                          </div>
                                        }
                                      </div>
                                    </div>
                                  }
                                </div>
                              }
                              @case ('v10_minimal_pills') {
                                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
                                  @for (hItem of tom.hourlySchedule; track hItem.hour) {
                                    @let isFullPower = hItem.firstHalfPower && hItem.secondHalfPower;
                                    @let isFullOutage = !hItem.firstHalfPower && !hItem.secondHalfPower;
                                    @let isMixed = !isFullPower && !isFullOutage;
                                    <div
                                      class="h-8 px-2.5 rounded-full border text-2xs font-mono font-bold flex items-center justify-center transition-all select-none w-full shadow-2xs relative overflow-hidden"
                                      [class.bg-emerald-500]="isFullPower"
                                      [class.border-emerald-600]="isFullPower"
                                      [class.bg-rose-600]="isFullOutage"
                                      [class.border-rose-700]="isFullOutage"
                                      [class.border-amber-500]="isMixed"
                                      [title]="'Завтра ' + hItem.timeLabel + ': ' + hItem.statusLabel"
                                    >
                                      @if (isMixed) {
                                        <div class="absolute inset-0 flex pointer-events-none">
                                          <div class="w-1/2 h-full border-r border-black/10" [class.bg-emerald-500]="hItem.firstHalfPower" [class.bg-rose-600]="!hItem.firstHalfPower"></div>
                                          <div class="w-1/2 h-full" [class.bg-emerald-500]="hItem.secondHalfPower" [class.bg-rose-600]="!hItem.secondHalfPower"></div>
                                        </div>
                                      }
                                      <span class="relative z-10 text-white leading-none tracking-tight">{{ hItem.fromTime }}–{{ hItem.toTime }}</span>
                                    </div>
                                  }
                                </div>
                              }
                              @case ('v11_dtek_official_sheet') {
                                <div class="p-3 sm:p-4 rounded-xl bg-white border border-slate-200 overflow-x-auto">
                                  <div class="min-w-[660px] border border-slate-300 rounded-xl overflow-hidden bg-white">
                                    <div class="flex border-b border-slate-300 bg-white">
                                      <div class="w-28 sm:w-32 shrink-0 px-2.5 py-2 border-r border-slate-300 flex flex-col justify-center text-left">
                                        <span class="text-2xs font-bold text-slate-900 leading-tight">Часові</span>
                                        <span class="text-2xs font-bold text-slate-900 leading-tight">проміжки</span>
                                      </div>
                                      @for (hItem of tom.hourlySchedule; track hItem.hour) {
                                        <div class="flex-1 min-w-[22px] h-14 border-r last:border-r-0 border-slate-300 flex items-center justify-center bg-white select-none">
                                          <span class="text-[10px] font-bold text-slate-900 tracking-tight whitespace-nowrap -rotate-90">
                                            {{ hItem.fromTime.substring(0, 2) }}-{{ hItem.toTime.substring(0, 2) }}
                                          </span>
                                        </div>
                                      }
                                    </div>
                                    <div class="flex bg-white">
                                      <div class="w-28 sm:w-32 shrink-0 px-2.5 py-2 border-r border-slate-300 flex items-center text-left">
                                        <span class="text-2xs font-bold text-slate-950 whitespace-nowrap">
                                          Завтра {{ (tom.scheduleDate || '').slice(0, 5) }}
                                        </span>
                                      </div>
                                      @for (hItem of tom.hourlySchedule; track hItem.hour) {
                                        @let isFullPower = hItem.firstHalfPower && hItem.secondHalfPower;
                                        @let isFullOutage = !hItem.firstHalfPower && !hItem.secondHalfPower;
                                        @let isFirstHalfOutage = !hItem.firstHalfPower && hItem.secondHalfPower;
                                        @let isSecondHalfOutage = hItem.firstHalfPower && !hItem.secondHalfPower;
                                        <div
                                          class="flex-1 min-w-[22px] h-11 border-r last:border-r-0 border-slate-300 relative flex items-center justify-center overflow-hidden"
                                          [class.bg-white]="isFullPower"
                                          [class.bg-[#d6d8db]]="isFullOutage"
                                          [title]="'Завтра ' + hItem.timeLabel + ': ' + hItem.statusLabel"
                                        >
                                          @if (isFirstHalfOutage) {
                                            <div class="absolute inset-0 flex pointer-events-none">
                                              <div class="w-1/2 h-full bg-[#d6d8db]"></div>
                                              <div class="w-1/2 h-full bg-white"></div>
                                            </div>
                                          }
                                          @if (isSecondHalfOutage) {
                                            <div class="absolute inset-0 flex pointer-events-none">
                                              <div class="w-1/2 h-full bg-white"></div>
                                              <div class="w-1/2 h-full bg-[#d6d8db]"></div>
                                            </div>
                                          }
                                          @if (isFullOutage) {
                                            <svg viewBox="0 0 24 24" class="w-3.5 h-3.5 relative z-10" aria-hidden="true">
                                              <path d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z" fill="#1e293b" />
                                              <line x1="3.5" y1="5.5" x2="20.5" y2="18.5" stroke="#1e293b" stroke-width="2.2" stroke-linecap="round" />
                                            </svg>
                                          }
                                          @if (isFirstHalfOutage || isSecondHalfOutage) {
                                            <svg viewBox="0 0 24 24" class="w-3.5 h-3.5 relative z-10" aria-hidden="true">
                                              <path d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z" fill="#eab308" stroke="#1e293b" stroke-width="1.2" stroke-linejoin="round" />
                                              <line x1="3.5" y1="5.5" x2="20.5" y2="18.5" stroke="#1e293b" stroke-width="2" stroke-linecap="round" />
                                            </svg>
                                          }
                                        </div>
                                      }
                                    </div>
                                  </div>
                                </div>
                              }
                              @default {
                                <div class="grid grid-cols-6 sm:grid-cols-12 lg:grid-cols-24 gap-1">
                                  @for (hItem of tom.hourlySchedule; track hItem.hour) {
                                    <div
                                      class="p-1 rounded-lg border border-slate-200 bg-white flex flex-col items-center justify-between text-center"
                                      [title]="'Завтра ' + hItem.timeLabel + ': ' + hItem.statusLabel"
                                    >
                                      <span class="text-3xs font-mono font-bold leading-none mb-1 text-slate-600">
                                        {{ hItem.fromTime.substring(0, 2) }}
                                      </span>
                                      <div class="w-full h-4 rounded flex overflow-hidden gap-0.5 p-0.5 bg-slate-100">
                                        <div
                                          class="h-full flex-1 rounded-xs"
                                          [class.bg-emerald-500]="hItem.firstHalfPower"
                                          [class.bg-rose-500]="!hItem.firstHalfPower"
                                        ></div>
                                        <div
                                          class="h-full flex-1 rounded-xs"
                                          [class.bg-emerald-500]="hItem.secondHalfPower"
                                          [class.bg-rose-500]="!hItem.secondHalfPower"
                                        ></div>
                                      </div>
                                      <span
                                        class="text-4xs font-bold leading-tight mt-0.5"
                                        [class.text-emerald-700]="hItem.firstHalfPower && hItem.secondHalfPower"
                                        [class.text-rose-700]="!hItem.firstHalfPower && !hItem.secondHalfPower"
                                        [class.text-amber-700]="hItem.firstHalfPower !== hItem.secondHalfPower"
                                      >
                                        {{ hItem.statusKey === 'yes' ? 'Є' : (hItem.statusKey === 'no' ? 'Ні' : '0.5h') }}
                                      </span>
                                    </div>
                                  }
                                </div>
                              }
                            }
                          </div>
                        }
                      </div>
                    </div>
                  </div>
                </div>
              }
            </div>
          </div>
        } @else {
      <!-- DTEK Shutdown Schedule Card (Only when a house with an address is added) -->
      <div class="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
        <!-- Top header row -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div class="flex items-center gap-2.5">
            <div
              class="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white shadow-2xs transition-colors shrink-0"
              [class.bg-emerald-600]="dtekStatus()?.isPowerAvailableNow"
              [class.bg-rose-600]="!dtekStatus()?.isPowerAvailableNow"
            >
              <mat-icon class="text-sm leading-none">{{ dtekStatus()?.isPowerAvailableNow ? 'lightbulb' : 'power_off' }}</mat-icon>
            </div>
            <div class="flex items-center gap-2 text-xs font-semibold text-slate-700 flex-wrap">
              <span>Графік погодинних відключень ДТЕК</span>
              <span class="text-slate-300">•</span>
              <div class="flex flex-col sm:flex-row sm:items-center gap-1.5">
                <span class="text-indigo-600 font-mono font-bold inline-flex items-center gap-1.5 bg-indigo-50 px-2.5 py-0.5 rounded-lg border border-indigo-200/80 shadow-2xs">
                  <span class="relative flex h-2 w-2">
                    <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span>Київський час: {{ liveKyivTime() || dtekInfo()?.kyivTime || '—' }}</span>
                </span>
                @if (weatherData(); as w) {
                  <span
                    class="text-sky-700 dark:text-sky-300 font-medium inline-flex items-center gap-1.5 bg-sky-50 dark:bg-slate-800 px-2.5 py-0.5 rounded-lg border border-sky-200/80 dark:border-slate-700 shadow-2xs text-2xs"
                    [title]="'Погода зараз (' + (w.resolvedLocation || w.city) + '): ' + w.current.condition + ', вітер ' + w.current.windSpeedKmh + ' км/год, вологість ' + w.current.humidityPct + '%'"
                  >
                    <mat-icon class="text-sm text-sky-600 dark:text-sky-400 leading-none">{{ w.current.icon || 'wb_sunny' }}</mat-icon>
                    <span class="font-bold font-mono text-slate-900 dark:text-white">
                      {{ w.current.tempC > 0 ? '+' : '' }}{{ w.current.tempC }}°C
                    </span>
                    <span class="text-slate-500 dark:text-slate-400">({{ w.current.condition }})</span>
                    @if (w.resolvedLocation || w.city) {
                      <span class="hidden md:inline text-slate-400 dark:text-slate-500">• {{ w.resolvedLocation || w.city }}</span>
                    }
                  </span>
                }
              </div>
            </div>
          </div>

          <div class="flex items-center gap-2 shrink-0 self-start sm:self-auto flex-wrap">
            <button
              type="button"
              (click)="forceShowQueuesMode.set(true)"
              class="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="Переглянути графік по всіх чергах ДТЕК (1.1 – 6.2)"
            >
              <mat-icon class="text-base text-amber-300 leading-none">view_comfy_alt</mat-icon>
              <span>Всі черги ДТЕК</span>
            </button>
          </div>
        </div>

        <!-- Address Search & Autocomplete Bar -->
        @if (isCardAddressOpen()) {
          <div class="p-4 rounded-xl bg-slate-50/90 border border-slate-200 space-y-3">
            <div class="flex items-center justify-between flex-wrap gap-2">
              <span class="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <mat-icon class="text-amber-600 text-sm leading-none">search</mat-icon>
                <span>Підказки адрес ДТЕК (почніть вводити перші літери)</span>
              </span>
              @if (isDtekCatalogLoading()) {
                <span class="text-3xs text-amber-700 flex items-center gap-1">
                  <span class="w-2.5 h-2.5 border border-amber-600 border-t-transparent rounded-full animate-spin"></span>
                  Завантаження каталогу...
                </span>
              }
            </div>

            <div class="grid grid-cols-1 md:grid-cols-12 gap-2.5">
              <!-- Settlement Input with Autocomplete -->
              <div class="md:col-span-5 relative">
                <label for="card-city-input" class="block text-3xs font-semibold text-slate-600 mb-1">
                  Населений пункт (Одеська обл.) *
                </label>
                <div class="relative">
                  <input
                    id="card-city-input"
                    type="text"
                    [value]="cardCityQuery()"
                    (input)="onCardCityInput($any($event.target).value)"
                    (focus)="showCardCitySuggestions.set(true)"
                    placeholder="напр. Окни або Одеса"
                    autocomplete="off"
                    class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:border-amber-500"
                  />
                  @if (cardCityQuery()) {
                    <button
                      type="button"
                      (click)="onCardCityInput(''); showCardCitySuggestions.set(true)"
                      class="absolute right-2 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <mat-icon class="text-xs leading-none">close</mat-icon>
                    </button>
                  }
                </div>

                <!-- Suggestions Dropdown -->
                @if (showCardCitySuggestions() && filteredCardCities().length > 0) {
                  <button
                    type="button"
                    aria-label="Закрити список міст"
                    class="fixed inset-0 z-20 cursor-default bg-transparent border-0"
                    (click)="showCardCitySuggestions.set(false)"
                  ></button>
                  <div class="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-56 overflow-y-auto divide-y divide-slate-100">
                    @for (c of filteredCardCities(); track c) {
                      <button
                        type="button"
                        (click)="selectCardCity(c)"
                        class="w-full px-3 py-2 text-left text-xs text-slate-800 hover:bg-amber-50 flex items-center justify-between cursor-pointer transition-colors"
                      >
                        <span class="font-medium">{{ c }}</span>
                        <mat-icon class="text-3xs text-slate-400 leading-none">chevron_right</mat-icon>
                      </button>
                    }
                  </div>
                }
              </div>

              <!-- Street Input with Autocomplete -->
              <div class="md:col-span-4 relative">
                <label for="card-street-input" class="block text-3xs font-semibold text-slate-600 mb-1">
                  Вулиця (підказка за першими літерами) *
                </label>
                <div class="relative">
                  <input
                    id="card-street-input"
                    type="text"
                    [value]="cardStreetQuery()"
                    (input)="onCardStreetInput($any($event.target).value)"
                    (focus)="showCardStreetSuggestions.set(true)"
                    placeholder="Почніть вводити вулицю..."
                    autocomplete="off"
                    class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:border-amber-500"
                  />
                  @if (cardStreetQuery()) {
                    <button
                      type="button"
                      (click)="onCardStreetInput(''); showCardStreetSuggestions.set(true)"
                      class="absolute right-2 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <mat-icon class="text-xs leading-none">close</mat-icon>
                    </button>
                  }
                </div>

                <!-- Suggestions Dropdown -->
                @if (showCardStreetSuggestions() && filteredCardStreets().length > 0) {
                  <button
                    type="button"
                    aria-label="Закрити список вулиць"
                    class="fixed inset-0 z-20 cursor-default bg-transparent border-0"
                    (click)="showCardStreetSuggestions.set(false)"
                  ></button>
                  <div class="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-56 overflow-y-auto divide-y divide-slate-100">
                    @for (s of filteredCardStreets(); track s) {
                      <button
                        type="button"
                        (click)="selectCardStreet(s)"
                        class="w-full px-3 py-2 text-left text-xs text-slate-800 hover:bg-amber-50 flex items-center justify-between cursor-pointer transition-colors"
                      >
                        <span class="font-medium">{{ s }}</span>
                        <mat-icon class="text-3xs text-slate-400 leading-none">chevron_right</mat-icon>
                      </button>
                    }
                  </div>
                }
              </div>

              <!-- House Number Input & Button -->
              <div class="md:col-span-3">
                <label for="card-house-input" class="block text-3xs font-semibold text-slate-600 mb-1">
                  Номер будинку *
                </label>
                <div class="flex items-center gap-1.5">
                  <input
                    id="card-house-input"
                    type="text"
                    [value]="cardHouseInput()"
                    (input)="cardHouseInput.set($any($event.target).value)"
                    placeholder="11"
                    class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-medium text-slate-900 focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="button"
                    (click)="applyCardAddress()"
                    [disabled]="isDtekLoading()"
                    class="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer shrink-0 disabled:opacity-50 shadow-2xs"
                    title="Завантажити графік для цієї адреси"
                  >
                    Перевірити
                  </button>
                </div>
              </div>
            </div>

            <!-- Actions footer row inside search bar -->
            <div class="flex items-center justify-between pt-2 border-t border-slate-200 text-3xs text-slate-500 flex-wrap gap-2">
              <span class="flex items-center gap-1">
                <mat-icon class="text-xs text-slate-400 leading-none">info</mat-icon>
                Запит формується з поточною датою та часом за Києвом
              </span>
              @if (currentAccount(); as acc) {
                <button
                  type="button"
                  (click)="saveCardAddressToCurrentAccount()"
                  class="text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer"
                  title="Зберегти обрану адресу в поточний особовий рахунок електроенергії"
                >
                  <mat-icon class="text-xs leading-none">save</mat-icon>
                  <span>Зберегти цю адресу для кабінету «{{ acc.name }}»</span>
                </button>
              }
            </div>
          </div>
        }

        @if (isDtekLoading() && !dtekInfo()) {
          <div class="py-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
            <div class="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
            <span>Завантаження актуального графіка ДТЕК...</span>
          </div>
        } @else if (dtekError() || !dtekStatus()) {
          <div class="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-950 space-y-3 shadow-xs">
            <div class="flex items-start justify-between gap-3 flex-wrap">
              <div class="flex items-center gap-2.5">
                <div class="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-700 flex items-center justify-center shrink-0">
                  <mat-icon class="text-lg">cloud_off</mat-icon>
                </div>
                <div>
                  <div class="font-bold text-amber-950 text-sm">Інформацію з ДТЕК не вдалось отримати</div>
                  <div class="text-amber-800 text-xs mt-0.5">Виберіть чергу вручну</div>
                </div>
              </div>

              <button
                type="button"
                (click)="refreshDtekSchedule()"
                class="px-3 py-1.5 rounded-xl bg-white hover:bg-amber-100 border border-amber-300 text-amber-900 font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <mat-icon class="text-sm">refresh</mat-icon>
                <span>Спробувати знову</span>
              </button>
            </div>

            <!-- Quick Manual Queue Picker -->
            <div class="pt-2 border-t border-amber-200/80">
              <div class="text-3xs uppercase font-bold tracking-wider text-amber-900/80 mb-1.5 flex items-center justify-between">
                <span>Виберіть номер черги:</span>
                <span class="font-normal lowercase">Активна черга: <strong class="font-mono text-amber-950">{{ manualQueue() || '3.1' }}</strong></span>
              </div>
              <div class="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
                @for (qName of availableQueues; track qName) {
                  @let isSelected = (manualQueue() || '3.1') === qName;
                  <button
                    type="button"
                    (click)="selectManualQueue(qName)"
                    class="h-8 rounded-lg font-mono text-xs font-bold transition-all border flex items-center justify-center cursor-pointer shadow-2xs"
                    [class.bg-amber-600]="isSelected"
                    [class.border-amber-700]="isSelected"
                    [class.text-white]="isSelected"
                    [class.ring-2]="isSelected"
                    [class.ring-amber-500]="isSelected"
                    [class.bg-white]="!isSelected"
                    [class.border-amber-200]="!isSelected"
                    [class.text-amber-950]="!isSelected"
                    [class.hover:bg-amber-100]="!isSelected"
                  >
                    {{ qName }}
                  </button>
                }
              </div>
            </div>
          </div>
        } @else if (dtekStatus(); as status) {
          <!-- Fact / Emergency Outage Window if any -->
          @if (status.startDate || status.endDate) {
            <div class="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex flex-col justify-between">
              <span class="text-3xs font-semibold uppercase tracking-wider text-amber-800 block">Фактичне відключення ДТЕК</span>
              <div class="mt-1 space-y-0.5">
                <div class="text-xs text-slate-700">
                  Початок: <span class="font-bold text-slate-900 font-mono">{{ status.startDate || '—' }}</span> — Кінець: <span class="font-bold text-slate-900 font-mono">{{ status.endDate || '—' }}</span>
                </div>
                @if (status.subType || status.subStatus) {
                  <div class="text-3xs text-amber-800 font-medium truncate" [title]="(status.subType || '') + ' ' + (status.subStatus || '')">
                    {{ status.subType }} {{ status.subStatus ? '(' + status.subStatus + ')' : '' }}
                  </div>
                }
              </div>
            </div>
          }

          <app-outage-schedule-variants
            [status]="status"
            [kyivTime]="liveKyivTime() || dtekInfo()?.kyivTime || ''"
            [lastUpdated]="dtekInfo()?.dtekJsonUpdatedAt || dtekInfo()?.updateFact || ''"
            [lastDtekFetchAt]="dtekInfo()?.lastDtekFetchAt || dtekInfo()?.fetchedAt || ''"
            [minutesUntilNextRefresh]="dtekInfo()?.minutesUntilNextRefresh || 0"
            [isRefreshing]="isDtekLoading()"
            (refresh)="refreshDtekSchedule()"
          />
        }
      </div>
        }
      }

      @if (viewMode() !== 'schedule') {
      @if (electricityAccounts().length === 0) {
        <!-- Empty Accounts State -->
        <div class="p-8 text-center bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <div class="w-14 h-14 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center mx-auto mb-3">
            <mat-icon class="text-3xl">bolt</mat-icon>
          </div>
          <h3 class="text-base font-bold text-slate-900">Немає доданих особових рахунків електроенергії</h3>
          <p class="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
            Додайте свій перший рахунок (наприклад, «Квартира», «Будинок» або «Дача»), щоб передавати покази та рахувати споживання.
          </p>
          @if (canEdit()) {
            <button
              type="button"
              (click)="openAccountModal(null)"
              class="px-4 py-2.5 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white transition-colors inline-flex items-center gap-2 cursor-pointer shadow-sm shadow-amber-500/20"
            >
              <mat-icon class="text-base">add</mat-icon>
              <span>Створити перший особовий рахунок</span>
            </button>
          }
        </div>
      }

      @if (currentAccount(); as acc) {
        <!-- Active Account Details Card -->
        <div class="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div class="flex items-center gap-2.5 flex-1 min-w-0">
              <button
                type="button"
                (click)="isAccountCardExpanded.update(v => !v)"
                class="w-8 h-8 rounded-xl bg-amber-500/10 dark:bg-amber-400/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                [title]="isAccountCardExpanded() ? 'Згорнути покази та кабінети будинку' : 'Розгорнути покази та кабінети будинку'"
              >
                <mat-icon class="text-xl leading-none transition-transform duration-200" [class.rotate-180]="!isAccountCardExpanded()">
                  expand_more
                </mat-icon>
              </button>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <h3
                    class="text-base font-bold text-slate-900 dark:text-white cursor-pointer hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                    (click)="isAccountCardExpanded.update(v => !v)"
                  >
                    {{ acc.name }}
                  </h3>
                  <span class="px-2.5 py-0.5 rounded-full text-2xs font-bold"
                    [class.bg-emerald-100]="acc.electricityTariffType === 'dual'"
                    [class.text-emerald-800]="acc.electricityTariffType === 'dual'"
                    [class.bg-blue-100]="acc.electricityTariffType === 'single'"
                    [class.text-blue-800]="acc.electricityTariffType === 'single'"
                  >
                    {{ acc.electricityTariffType === 'dual' ? 'Двотарифний (День / Ніч)' : 'Однотарифний (Єдиний)' }}
                  </span>
                  @if (acc.meterNumber) {
                    <span class="text-2xs text-slate-500 dark:text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                      Лічильник № {{ acc.meterNumber }}
                    </span>
                  }
                </div>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                  Особовий рахунок: <span class="font-semibold text-slate-700 dark:text-slate-300 font-mono">{{ acc.accountNumber }}</span>
                  @if (acc.address) {
                    • <span class="text-slate-600 dark:text-slate-300">{{ acc.address }}</span>
                  }
                </p>
              </div>
            </div>

            <div class="flex items-center gap-2 shrink-0 flex-wrap">
              @if (!isAccountCardExpanded()) {
                @if (latestAnyReading(); as lr) {
                  <span class="text-2xs font-mono font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                    Показ: {{ totalConsumedKwh(lr) }} кВт·г
                  </span>
                }
                @if (acc.ooekBalanceUah !== undefined && acc.ooekBalanceUah !== null) {
                  <span class="text-2xs font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2.5 py-1 rounded-lg border border-amber-200 dark:border-amber-800">
                    ООЕК: {{ acc.ooekBalanceUah.toFixed(2) }} грн
                  </span>
                }
              }
              @if (canEdit()) {
                <button
                  type="button"
                  (click)="openAccountModal(acc)"
                  class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <mat-icon class="text-sm">edit</mat-icon>
                  <span>Редагувати</span>
                </button>
                <button
                  type="button"
                  (click)="confirmDeleteAccount(acc)"
                  class="px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 border border-rose-200 dark:border-rose-800 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <mat-icon class="text-sm">delete</mat-icon>
                  <span>Видалити</span>
                </button>
              }
            </div>
          </div>

          @if (isAccountCardExpanded()) {
            <!-- Stat Cards -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <!-- Latest Reading -->
            <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <span class="text-3xs font-semibold uppercase tracking-wider text-slate-500 block">Останні покази</span>
              @if (latestAnyReading(); as lr) {
                @if (acc.electricityTariffType === 'dual') {
                  <div class="text-sm font-extrabold text-slate-900 mt-1">
                    День (Т2): {{ lr.readingT1 }} <span class="text-2xs font-normal text-slate-500">кВт·г</span>
                  </div>
                  <div class="text-sm font-extrabold text-slate-900">
                    Ніч (Т1): {{ lr.readingT2 }} <span class="text-2xs font-normal text-slate-500">кВт·г</span>
                  </div>
                } @else {
                  <div class="text-base font-extrabold text-slate-900 mt-1">
                    {{ lr.readingT1 }} <span class="text-xs font-normal text-slate-500">кВт·г</span>
                  </div>
                }
                <div class="flex items-center gap-1.5 mt-1 flex-wrap">
                  <span class="text-3xs text-slate-500">{{ formatDate(lr.date) }}</span>
                  @if (lr.isControlOnly) {
                    <span class="px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800 text-3xs font-bold border border-indigo-200">
                      Контрольний
                    </span>
                  }
                </div>
              } @else {
                <div class="text-xs text-slate-400 mt-1 italic">
                  Початкові: {{ acc.electricityTariffType === 'dual' ? (acc.initialReadingT1 || 0) + ' / ' + (acc.initialReadingT2 || 0) : (acc.initialReadingT1 || 0) }} кВт·г
                </div>
              }
            </div>

            <!-- Last Consumption -->
            <div class="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200/80">
              <span class="text-3xs font-semibold uppercase tracking-wider text-amber-800 block">Спожито за період</span>
              @if (latestAnyReading(); as lr) {
                <div class="text-base font-extrabold text-amber-950 mt-1">
                  {{ totalConsumedKwh(lr) }} <span class="text-xs font-normal text-amber-700">кВт·г</span>
                </div>
                @if (acc.electricityTariffType === 'dual') {
                  <div class="text-2xs text-amber-800 mt-0.5">
                    День: {{ lr.consumptionT1 || 0 }} • Ніч: {{ lr.consumptionT2 || 0 }}
                  </div>
                }
                @if (lr.isControlOnly) {
                  <span class="text-3xs text-indigo-700 font-semibold mt-0.5 block">Для моніторингу</span>
                }
              } @else {
                <div class="text-xs text-amber-600 mt-1 italic">Немає розрахунків</div>
              }
            </div>

            <!-- Last Billing Accrual / Paid Status (Only official billing readings) -->
            <div class="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200/80">
              <span class="text-3xs font-semibold uppercase tracking-wider text-emerald-800 block">Сума за останній розрахунок</span>
              @let lbr = latestBillingReading();
              @let predictedAmt = lbr ? lbr.totalCost.toFixed(2) : '0.00';
              @let ooekAmt = (acc.ooekBalanceUah !== undefined && acc.ooekBalanceUah !== null) ? acc.ooekBalanceUah.toFixed(2) : '—';
              <div class="text-xs sm:text-sm font-extrabold text-emerald-950 mt-1 leading-snug">
                Прогнозована {{ predictedAmt }} грн / ООЕК {{ ooekAmt }} грн
              </div>
              <div class="mt-1 flex items-center justify-between gap-1 flex-wrap">
                @if (lbr) {
                  @if (isReadingPaid(lbr, acc)) {
                    <span class="inline-flex items-center gap-1 text-3xs font-bold text-emerald-700 bg-emerald-100/90 px-2 py-0.5 rounded">
                      <mat-icon class="text-xs leading-none">check_circle</mat-icon> Оплачено
                    </span>
                  } @else {
                    <span class="inline-flex items-center gap-1 text-3xs font-bold text-rose-700 bg-rose-100/90 px-2 py-0.5 rounded">
                      <mat-icon class="text-xs leading-none">pending</mat-icon> До сплати
                    </span>
                  }
                  <span class="text-3xs text-slate-500 font-mono">{{ acc.ooekBillUpdatedAt || formatDate(lbr.date) }}</span>
                } @else if (acc.ooekBillUpdatedAt) {
                  <span class="text-3xs text-emerald-800 font-mono">Рахунок ООЕК: {{ acc.ooekBillUpdatedAt }}</span>
                } @else {
                  <span class="text-3xs text-emerald-600 italic">Немає розрахунків</span>
                }
              </div>
            </div>

            <!-- Current Tariff Applied -->
            <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <span class="text-3xs font-semibold uppercase tracking-wider text-slate-500 block">Діючий тариф</span>
              <div class="mt-1">
                @if (acc.electricityTariffType === 'dual') {
                  @let dualRates = currentDualRates();
                  <div class="text-xs font-bold text-slate-900">
                    День: {{ dualRates.dayRate }} <span class="text-3xs text-slate-500 font-normal">грн</span>
                  </div>
                  <div class="text-xs font-bold text-slate-900">
                    Ніч: {{ dualRates.nightRate }} <span class="text-3xs text-slate-500 font-normal">грн</span>
                  </div>
                  <span class="inline-block mt-1 text-3xs font-semibold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200/60">
                    {{ dualRates.season === 'summer' ? 'Літній сезон (01.05 – 30.09)' : 'Зимовий сезон (01.10 – 30.04)' }}
                  </span>
                } @else {
                  <div class="text-base font-extrabold text-slate-900">
                    {{ currentSingleRate() }} <span class="text-xs font-normal text-slate-500">грн/кВт·г</span>
                  </div>
                  <span class="inline-block mt-1 text-3xs font-semibold text-slate-600 bg-slate-200/60 px-1.5 py-0.5 rounded">
                    Єдиний на весь рік
                  </span>
                }
              </div>
            </div>
          </div>

          <!-- Personal Cabinets Integration: DTEK OEM & OOEK (Encrypted Credentials) -->
          <div class="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-50 dark:bg-slate-800/90 p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-700">
              <div class="flex items-start sm:items-center gap-3">
                <div class="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                  <mat-icon class="text-lg">vpn_key</mat-icon>
                </div>
                <div>
                  <div class="flex items-center gap-2 flex-wrap">
                    <h4 class="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                      Особисті кабінети будинку: ДТЕК ОЕМ та ТОВ «ООЕК»
                    </h4>
                    <span class="px-2 py-0.5 rounded-full text-3xs font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700 inline-flex items-center gap-1">
                      <mat-icon class="text-3xs leading-none">enhanced_encryption</mat-icon>
                      <span>AES-256-GCM шифрування</span>
                    </span>
                    @if (acc.ooekBalanceUah !== undefined && acc.ooekBalanceUah !== null) {
                      <span class="px-2.5 py-0.5 rounded-full text-2xs font-extrabold bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-700 inline-flex items-center gap-1.5 flex-wrap">
                        <span>ООЕК до сплати: {{ acc.ooekBalanceUah.toFixed(2) }} грн</span>
                        @if (acc.ooekBillUpdatedAt) {
                          <span class="text-3xs font-semibold text-amber-800 dark:text-amber-200">({{ acc.ooekBillUpdatedAt }})</span>
                        } @else if (acc.ooekCabinetLastSync) {
                          <span class="text-3xs font-semibold text-amber-800 dark:text-amber-200">({{ formatDate(acc.ooekCabinetLastSync) }})</span>
                        }
                      </span>
                    }
                  </div>
                  <p class="text-2xs text-slate-600 dark:text-slate-300 mt-0.5">
                    Безпечне збереження облікових даних для <span class="font-mono text-slate-800 dark:text-slate-200">auth.my.dtek-oem.com.ua</span> (показники) та <span class="font-mono text-slate-800 dark:text-slate-200">personal.ooek.od.ua</span> (нарахована сума до сплати)
                  </p>
                </div>
              </div>

              <div class="flex items-center gap-2 shrink-0 flex-wrap">
                <button
                  type="button"
                  (click)="syncOoekForCurrentAccount()"
                  [disabled]="isSyncingOoek() || !hasHouseAccountNumber(acc)"
                  class="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
                  [title]="!hasHouseAccountNumber(acc) ? 'Особовий рахунок не вказано у налаштуваннях будинку' : 'Підключитися до personal.ooek.od.ua/home/accounts та оновити нараховану суму до сплати по особовому рахунку'"
                >
                  <mat-icon class="text-sm leading-none" [class.animate-spin]="isSyncingOoek()">receipt_long</mat-icon>
                  <span>{{ isSyncingOoek() ? 'Запит ООЕК...' : 'Оновити з ООЕК' }}</span>
                </button>

                <button
                  type="button"
                  (click)="toggleCabinetPanel()"
                  class="px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors flex items-center gap-1.5 cursor-pointer"
                  [class.bg-indigo-600]="isCabinetPanelOpen()"
                  [class.text-white]="isCabinetPanelOpen()"
                  [class.border-indigo-500]="isCabinetPanelOpen()"
                  [class.bg-white]="!isCabinetPanelOpen()"
                  [class.text-slate-700]="!isCabinetPanelOpen()"
                  [class.border-slate-300]="!isCabinetPanelOpen()"
                >
                  <mat-icon class="text-sm leading-none">{{ isCabinetPanelOpen() ? 'expand_less' : 'settings_suggest' }}</mat-icon>
                  <span>{{ isCabinetPanelOpen() ? 'Згорнути кабінети' : 'Логіни та синхронізація' }}</span>
                </button>
              </div>
            </div>

            @if (isCabinetPanelOpen()) {
              <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                <!-- Left Card: OOEK Personal Cabinet (https://personal.ooek.od.ua/home/) -->
                <div class="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-700 shadow-2xs space-y-3 flex flex-col justify-between">
                  <div class="space-y-3">
                    <div class="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
                      <div>
                        <div class="flex items-center gap-2 flex-wrap">
                          <span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-3xs font-bold uppercase">
                            Пряма інтеграція працює
                          </span>
                          <h5 class="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                            Кабінет ТОВ «ООЕК» (Сума + Абонкнижка)
                          </h5>
                        </div>
                        <div class="flex items-center gap-3 flex-wrap mt-0.5">
                          <a
                            href="https://personal.ooek.od.ua/home/"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="text-2xs text-indigo-600 dark:text-indigo-400 hover:underline font-mono inline-flex items-center gap-1"
                          >
                            <span>personal.ooek.od.ua/home</span>
                            <mat-icon class="text-3xs">open_in_new</mat-icon>
                          </a>
                          <a
                            href="https://personal.ooek.od.ua/home/abonbook/cards"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="text-2xs text-emerald-700 dark:text-emerald-400 hover:underline font-mono inline-flex items-center gap-1"
                          >
                            <span>/home/abonbook/cards</span>
                            <mat-icon class="text-3xs">open_in_new</mat-icon>
                          </a>
                        </div>
                      </div>

                      @if (acc.hasOoekPassword) {
                        <span class="px-2 py-0.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-3xs font-bold flex items-center gap-1 shrink-0">
                          <mat-icon class="text-xs leading-none">lock</mat-icon>
                          <span>Пароль зашифровано</span>
                        </span>
                      }
                    </div>

                    @if (!hasHouseAccountNumber(acc)) {
                      <div class="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-200 space-y-2.5 my-1">
                        <div class="flex items-center gap-2 font-bold text-xs text-amber-900 dark:text-amber-300">
                          <mat-icon class="text-amber-600 dark:text-amber-400 text-base leading-none">lock</mat-icon>
                          <span>Кабінет ТОВ «ООЕК» недоступний</span>
                        </div>
                        <p class="text-3xs leading-relaxed text-amber-800 dark:text-amber-300">
                          Особовий рахунок не вказано. Для підключення до кабінету ТОВ «ООЕК» та отримання нарахувань необхідно заповнити особовий рахунок у налаштуваннях будинку.
                        </p>
                        <button
                          type="button"
                          (click)="openAccountModal(acc)"
                          class="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-3xs font-bold inline-flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                        >
                          <mat-icon class="text-xs leading-none">edit</mat-icon>
                          <span>Заповнити особовий рахунок</span>
                        </button>
                      </div>
                    } @else {
                      <!-- Accrued Amount Display Box -->
                      <div class="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between gap-3 flex-wrap">
                        <div class="space-y-0.5">
                          <span class="text-3xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 block">
                            Нарахована сума до сплати (ООЕК • о/р {{ acc.ooekAccountNumber || acc.accountNumber }})
                          </span>
                          @if (acc.ooekBillUpdatedAt) {
                            <span class="text-2xs font-semibold text-emerald-900 dark:text-emerald-200 block">
                              Дата отримання рахунку: {{ acc.ooekBillUpdatedAt }}
                            </span>
                          }
                          @if (acc.ooekCabinetLastSync) {
                            <span class="text-3xs text-emerald-700 dark:text-emerald-300 block">
                              Останнє оновлення: {{ formatDate(acc.ooekCabinetLastSync) }}
                            </span>
                          } @else {
                            <span class="text-3xs text-slate-500 dark:text-slate-400 block">Ще не синхронізовано</span>
                          }
                        </div>
                        <div class="text-right shrink-0 flex flex-col items-end gap-1">
                          @if (acc.ooekBalanceUah !== undefined && acc.ooekBalanceUah !== null) {
                            <span class="text-lg font-extrabold font-mono text-emerald-950 dark:text-emerald-300 leading-tight">
                              {{ acc.ooekBalanceUah.toFixed(2) }} грн
                            </span>
                            @if (acc.ooekBalanceUah > 0) {
                              <span class="text-3xs font-mono font-semibold text-emerald-800 dark:text-emerald-300">
                                ~{{ getEstimatedKwhFromOoekBalance(acc) }} кВт·г (за тарифом)
                              </span>
                            }
                          } @else {
                            <span class="text-xs font-semibold text-slate-400 italic">— грн</span>
                          }
                          @if (canEdit()) {
                            <button
                              type="button"
                              (click)="addOoekAccruedAmountToHistory(acc)"
                              [disabled]="isSubmitting() || acc.ooekBalanceUah === undefined || acc.ooekBalanceUah === null || acc.ooekBalanceUah <= 0"
                              class="mt-0.5 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-3xs font-bold inline-flex items-center gap-1 cursor-pointer transition-colors shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Додати нараховану суму у блок «Історія передачі показів та розрахунків» (якщо показників немає — кВт·г розраховуються на основі суми та тарифу)"
                            >
                              <mat-icon class="text-xs leading-none">playlist_add</mat-icon>
                              <span>Додати до історії</span>
                            </button>
                          }
                        </div>
                      </div>

                      @if (acc.ooekCabinetStatus) {
                        <div class="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-2xs text-slate-700 dark:text-slate-200 flex items-start gap-1.5">
                          <mat-icon class="text-sm text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5">info</mat-icon>
                          <span>{{ acc.ooekCabinetStatus }}</span>
                        </div>
                      }

                      <!-- OOEK Credentials Inputs (Account Number is automatically taken from House Settings) -->
                      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label for="cabinet-ooek-login-input" class="block text-3xs font-bold text-slate-600 dark:text-slate-300 uppercase mb-1">
                            Логін (Email або телефон ООЕК)
                          </label>
                          <input
                            id="cabinet-ooek-login-input"
                            type="text"
                            [value]="cabinetOoekLogin()"
                            (input)="cabinetOoekLogin.set($any($event.target).value)"
                            placeholder="user@email.com"
                            autocomplete="off"
                            class="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-xs text-slate-900 font-mono focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div>
                          <label for="cabinet-ooek-password-input" class="block text-3xs font-bold text-slate-600 dark:text-slate-300 uppercase mb-1">
                            Пароль ООЕК {{ acc.hasOoekPassword ? '(збережено)' : '' }}
                          </label>
                          <input
                            id="cabinet-ooek-password-input"
                            type="password"
                            [value]="cabinetOoekPassword()"
                            (input)="cabinetOoekPassword.set($any($event.target).value)"
                            [placeholder]="acc.hasOoekPassword ? '•••••••• (залиште порожнім без змін)' : 'Введіть пароль кабінету ООЕК'"
                            autocomplete="new-password"
                            class="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                      </div>
                    }
                  </div>

                  @if (hasHouseAccountNumber(acc)) {
                    <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
                      <button
                        type="button"
                        (click)="saveCabinetCredentialsForCurrentAccount()"
                        [disabled]="isSavingCabinet()"
                        class="px-3 py-2 rounded-xl bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <mat-icon class="text-sm leading-none">lock</mat-icon>
                        <span>Зберегти зашифровано</span>
                      </button>

                      <button
                        type="button"
                        (click)="syncOoekForCurrentAccount()"
                        [disabled]="isSyncingOoek()"
                        class="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-2xs"
                      >
                        <mat-icon class="text-sm leading-none" [class.animate-spin]="isSyncingOoek()">sync</mat-icon>
                        <span>{{ isSyncingOoek() ? 'Підключення...' : 'Отримати суму до сплати' }}</span>
                      </button>
                    </div>
                  }
                </div>

                <!-- Right Card: DTEK OEM Direct Reading Submission (In development...) -->
                <div class="p-4 rounded-xl bg-slate-100 dark:bg-slate-900/90 border border-slate-300 dark:border-slate-700 shadow-2xs space-y-3.5 flex flex-col justify-between">
                  <div class="space-y-3">
                    <div class="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-200 dark:border-slate-800">
                      <div>
                        <div class="flex items-center gap-2 flex-wrap">
                          <span class="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 text-3xs font-bold uppercase inline-flex items-center gap-1">
                            <mat-icon class="text-xs leading-none">construction</mat-icon>
                            <span>В розробці...</span>
                          </span>
                          <h5 class="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200">
                            Передача показів лічильника ДТЕК ОЕМ
                          </h5>
                        </div>
                        <p class="text-2xs text-slate-500 dark:text-slate-400 mt-0.5">
                          @if (hasHouseAccountNumber(acc)) {
                            Швидка передача показів без входу в акаунт за особовим рахунком (<span class="font-mono font-semibold text-slate-600 dark:text-slate-300">{{ acc.accountNumber }}</span> • для ДТЕК: <span class="font-mono font-bold text-amber-700 dark:text-amber-400">{{ getFormattedDtekAccountNumber(acc.accountNumber) }}</span>)
                          } @else {
                            <span class="text-rose-600 dark:text-rose-400 font-semibold">Особовий рахунок не вказано у налаштуваннях будинку</span>
                          }
                        </p>
                      </div>
                    </div>

                    @if (!hasHouseAccountNumber(acc)) {
                      <div class="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-200 space-y-2.5 my-1">
                        <div class="flex items-center gap-2 font-bold text-xs text-amber-900 dark:text-amber-300">
                          <mat-icon class="text-amber-600 dark:text-amber-400 text-base leading-none">lock</mat-icon>
                          <span>Передача показів ДТЕК ОЕМ недоступна</span>
                        </div>
                        <p class="text-3xs leading-relaxed text-amber-800 dark:text-amber-300">
                          Особовий рахунок не вказано. Для перевірки адреси та передачі показів лічильника необхідно заповнити особовий рахунок у налаштуваннях будинку.
                        </p>
                        <button
                          type="button"
                          (click)="openAccountModal(acc)"
                          class="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-3xs font-bold inline-flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                        >
                          <mat-icon class="text-xs leading-none">edit</mat-icon>
                          <span>Заповнити особовий рахунок</span>
                        </button>
                      </div>
                    } @else {
                      <!-- Step 1 Trigger Button: "Хочу передати покази" -->
                      <div class="p-3 rounded-xl bg-amber-50/90 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div class="space-y-0.5 min-w-0">
                          <div class="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                            <mat-icon class="text-sm text-amber-600 leading-none">electric_meter</mat-icon>
                            <span>Крок 1: Запит адреси та лічильника</span>
                          </div>
                          <p class="text-3xs text-slate-500 dark:text-slate-400">
                            О/Р будинку: <strong class="font-mono text-slate-800 dark:text-slate-200">{{ getFormattedDtekAccountNumber(acc.accountNumber) }}</strong>
                          </p>
                        </div>
                        <button
                          type="button"
                          id="btn-dtek-want-submit-readings"
                          (click)="onWantToSubmitDtekReadings(acc)"
                          [disabled]="isDtekMeterChecking() || !hasHouseAccountNumber(acc)"
                          class="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-95 disabled:opacity-60 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-sm shrink-0"
                        >
                          @if (isDtekMeterChecking()) {
                            <span class="w-3.5 h-3.5 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin"></span>
                            <span>Запит до ДТЕК...</span>
                          } @else {
                            <mat-icon class="text-sm leading-none">send</mat-icon>
                            <span>Хочу передати покази</span>
                          }
                        </button>
                      </div>

                      <!-- Step 1 Result Card (when checkAddress returns data) -->
                      @if (dtekMeterCheckResult(); as res) {
                        <div class="p-3 rounded-xl bg-emerald-50/90 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 space-y-2.5">
                          <div class="flex items-start justify-between gap-2 flex-wrap">
                            <div class="flex items-center gap-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                              <mat-icon class="text-sm text-emerald-600 leading-none">verified</mat-icon>
                              <span>Дані отримано з ДТЕК ОЕМ:</span>
                            </div>
                            <button
                              type="button"
                              (click)="toggleShowDtekMeterRawJson()"
                              class="text-3xs font-mono font-semibold px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-slate-700 cursor-pointer transition-colors"
                            >
                              {{ showDtekMeterRawJson() ? 'Сховати JSON' : 'Переглянути JSON відповідь' }}
                            </button>
                          </div>

                          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-2xs">
                            <div class="space-y-0.5">
                              <span class="text-3xs uppercase font-bold text-slate-400">Адреса ДТЕК:</span>
                              <div class="font-medium text-slate-800 dark:text-slate-200 leading-tight">
                                {{ res.personalAccountAddressText || res.address || '—' }}
                              </div>
                            </div>
                            <div class="space-y-0.5">
                              <span class="text-3xs uppercase font-bold text-slate-400">Особовий рахунок:</span>
                              <div class="font-mono font-bold text-slate-800 dark:text-slate-200 leading-tight">
                                {{ res.personalAccountNumberText || ('О/Р ' + getFormattedDtekAccountNumber(acc.accountNumber)) }}
                              </div>
                            </div>
                            <div class="space-y-0.5">
                              <span class="text-3xs uppercase font-bold text-slate-400">Лічильник:</span>
                              <div class="font-mono font-medium text-slate-800 dark:text-slate-200">
                                {{ res.counterModel || '—' }} (№ {{ res.counterNumber || '—' }})
                              </div>
                            </div>
                            <div class="space-y-0.5">
                              <span class="text-3xs uppercase font-bold text-slate-400">EIC код:</span>
                              <div class="font-mono font-semibold text-slate-700 dark:text-slate-300 truncate">
                                {{ res.profile?.eicCode || '—' }}
                              </div>
                            </div>
                          </div>

                          @if (res.data && res.data.length > 0) {
                            <div class="pt-2 border-t border-emerald-200/80 dark:border-emerald-800/40">
                              <div class="text-3xs uppercase font-bold text-slate-500 dark:text-slate-400 mb-1">Попередні зафіксовані покази:</div>
                              <div class="grid grid-cols-2 gap-2">
                                @for (zone of res.data; track zone.codeZone) {
                                  <div class="px-2.5 py-1.5 rounded-lg bg-white/90 dark:bg-slate-800/90 border border-emerald-200 dark:border-emerald-700/50">
                                    <div class="text-3xs text-slate-500 font-semibold">{{ zone.name }} ({{ zone.codeZone }})</div>
                                    <div class="text-xs font-mono font-black text-slate-900 dark:text-slate-100">
                                      {{ zone.old }} кВт·год
                                    </div>
                                  </div>
                                }
                              </div>
                            </div>
                          }

                          @if (showDtekMeterRawJson()) {
                            <div class="pt-2 border-t border-emerald-200 dark:border-emerald-800/40">
                              <div class="text-3xs font-bold text-slate-500 dark:text-slate-400 mb-1">Сирий JSON (відповідь /ua/ajax checkAddress):</div>
                              <pre class="p-2.5 rounded-lg bg-slate-950 text-emerald-400 text-3xs font-mono max-h-48 overflow-auto whitespace-pre-wrap select-all">{{ dtekMeterRawResponse() | json }}</pre>
                            </div>
                          }
                        </div>
                      }

                      @if (dtekMeterCheckError()) {
                        <div class="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-2xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                          <mat-icon class="text-sm text-rose-600 shrink-0">error_outline</mat-icon>
                          <span>{{ dtekMeterCheckError() }}</span>
                        </div>
                      }

                      <!-- Meter Reading Inputs (1 field for single-zone, 2 fields for dual-zone) -->
                      @if (acc.electricityTariffType === 'dual') {
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 opacity-70">
                          <div>
                            <label class="block text-3xs font-bold text-slate-500 uppercase mb-1">
                              Покази День (Т2), кВт·год
                            </label>
                            <input
                              type="number"
                              disabled
                              [placeholder]="latestAnyReading()?.readingT1 || 0"
                              class="w-full px-3 py-2 rounded-lg bg-slate-200/70 dark:bg-slate-800/70 border border-slate-300 dark:border-slate-700 text-xs text-slate-500 font-mono cursor-not-allowed"
                            />
                          </div>
                          <div>
                            <label class="block text-3xs font-bold text-slate-500 uppercase mb-1">
                              Покази Ніч (Т1), кВт·год
                            </label>
                            <input
                              type="number"
                              disabled
                              [placeholder]="latestAnyReading()?.readingT2 || 0"
                              class="w-full px-3 py-2 rounded-lg bg-slate-200/70 dark:bg-slate-800/70 border border-slate-300 dark:border-slate-700 text-xs text-slate-500 font-mono cursor-not-allowed"
                            />
                          </div>
                        </div>
                      } @else {
                        <div class="opacity-70">
                          <label class="block text-3xs font-bold text-slate-500 uppercase mb-1">
                            Покази лічильника (Загальний Т1, кВт·год)
                          </label>
                          <input
                            type="number"
                            disabled
                            [placeholder]="latestAnyReading()?.readingT1 || 0"
                            class="w-full px-3 py-2 rounded-lg bg-slate-200/70 dark:bg-slate-800/70 border border-slate-300 dark:border-slate-700 text-xs text-slate-500 font-mono cursor-not-allowed"
                          />
                        </div>
                      }

                      <div class="p-2.5 rounded-lg bg-slate-200/60 dark:bg-slate-800/60 border border-slate-300/80 dark:border-slate-700/80 text-2xs text-slate-600 dark:text-slate-400 flex items-center gap-2">
                        <mat-icon class="text-sm text-slate-500 shrink-0">hourglass_top</mat-icon>
                        <span>В розробці... Крок 1 (перевірка адреси та лічильника) виконано кнопкою «Хочу передати покази». Крок 2 (відправка нових показів) буде підключено на наступному етапі.</span>
                      </div>
                    }
                  </div>

                  @if (hasHouseAccountNumber(acc)) {
                    <div class="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
                      <span class="text-3xs text-slate-400">Крок 2: Відправка показів</span>
                      <button
                        type="button"
                        disabled
                        class="px-3.5 py-2 rounded-xl bg-slate-400 text-white text-xs font-bold flex items-center gap-1.5 cursor-not-allowed opacity-80"
                        title="Буде активовано на наступному кроці розробки"
                      >
                        <mat-icon class="text-sm leading-none">send</mat-icon>
                        <span>Відправити покази</span>
                      </button>
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        }
      </div>

        <!-- Mode Switcher: History Table vs Devices vs Trend Analytics -->
        <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs">
          <!-- Left: Mode Dropdown & Context Period Picker -->
          <div class="flex flex-wrap items-center gap-2.5">
            <div class="relative flex items-center min-w-[200px] sm:min-w-[230px]">
              <mat-icon
                class="text-base pointer-events-none absolute left-3"
                [class.text-amber-500]="activeTab() === 'table'"
                [class.text-emerald-600]="activeTab() === 'devices'"
                [class.text-indigo-600]="activeTab() === 'analytics'"
              >
                {{ activeTab() === 'table' ? 'table_chart' : activeTab() === 'devices' ? 'electrical_services' : 'query_stats' }}
              </mat-icon>
              <select
                aria-label="Режим перегляду електроенергії"
                [value]="activeTab()"
                (change)="activeTab.set($any($event.target).value)"
                class="h-9 w-full appearance-none pl-9 pr-8 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/70 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 cursor-pointer transition-colors"
              >
                <option value="table" [selected]="activeTab() === 'table'">
                  Журнал ({{ accountReadings().length }})
                </option>
                <option value="devices" [selected]="activeTab() === 'devices'">
                  Пристрої ({{ accountDevices().length }})
                </option>
                <option value="analytics" [selected]="activeTab() === 'analytics'">
                  Графіки
                </option>
              </select>
              <mat-icon class="text-base text-slate-500 dark:text-slate-400 pointer-events-none absolute right-2.5">
                expand_more
              </mat-icon>
            </div>

            @if (activeTab() === 'devices') {
              <div class="h-9 flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <mat-icon class="text-sm text-slate-500 dark:text-slate-400 leading-none">calendar_month</mat-icon>
                <span class="text-3xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Місяць:</span>
                <input
                  type="month"
                  [value]="deviceSelectedMonth()"
                  (change)="onDeviceMonthChange($any($event.target).value)"
                  class="bg-transparent text-xs font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer"
                />
              </div>
            }
          </div>

          <!-- Right: Contextual Actions / Filters -->
          @if (activeTab() === 'table') {
            <div class="flex items-center justify-between sm:justify-end gap-2 flex-wrap">
              @if (canEdit()) {
                <button
                  type="button"
                  (click)="openScreenshotModal()"
                  class="h-9 px-3 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
                  title="Завантажити скріншот споживання пристрою з коментарем для AI-аналізу"
                >
                  <mat-icon class="text-sm leading-none text-emerald-600 dark:text-emerald-400">add_photo_alternate</mat-icon>
                  <span>Скріншот (ШІ)</span>
                </button>
              }
              <!-- Filter Pills -->
              <div class="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200/80 dark:border-slate-700 overflow-x-auto text-2xs">
                <button
                  type="button"
                  (click)="filterPurpose.set('all')"
                  [class.bg-slate-900]="filterPurpose() === 'all'"
                  [class.text-white]="filterPurpose() === 'all'"
                  [class.dark:bg-slate-700]="filterPurpose() === 'all'"
                  [class.text-slate-600]="filterPurpose() !== 'all'"
                  [class.dark:text-slate-300]="filterPurpose() !== 'all'"
                  class="px-2.5 py-1 rounded-lg font-semibold cursor-pointer transition-colors shrink-0"
                >
                  Всі ({{ accountReadings().length }})
                </button>
                <button
                  type="button"
                  (click)="filterPurpose.set('billing')"
                  [class.bg-amber-600]="filterPurpose() === 'billing'"
                  [class.text-white]="filterPurpose() === 'billing'"
                  [class.text-amber-800]="filterPurpose() !== 'billing'"
                  [class.dark:text-amber-300]="filterPurpose() !== 'billing'"
                  class="px-2.5 py-1 rounded-lg font-semibold cursor-pointer transition-colors shrink-0"
                >
                  ⚡ Офіційні ({{ billingReadingsCount() }})
                </button>
                <button
                  type="button"
                  (click)="filterPurpose.set('control')"
                  [class.bg-indigo-600]="filterPurpose() === 'control'"
                  [class.text-white]="filterPurpose() === 'control'"
                  [class.text-indigo-800]="filterPurpose() !== 'control'"
                  [class.dark:text-indigo-300]="filterPurpose() !== 'control'"
                  class="px-2.5 py-1 rounded-lg font-semibold cursor-pointer transition-colors shrink-0"
                >
                  👁️ Контрольні ({{ controlReadingsCount() }})
                </button>
              </div>
            </div>
          } @else if (activeTab() === 'devices' && canEdit()) {
            <div class="flex items-center gap-2 flex-wrap sm:justify-end">
              <button
                type="button"
                (click)="openAddDeviceLogModal()"
                class="h-9 px-3 rounded-xl text-xs font-semibold bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/60 transition-colors inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                title="Внести споживання приладу на обрану дату або період"
              >
                <mat-icon class="text-sm text-amber-600 dark:text-amber-400 leading-none">playlist_add</mat-icon>
                <span>+ Споживання на дату</span>
              </button>

              <button
                type="button"
                (click)="openScreenshotModal()"
                class="h-9 px-3 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors inline-flex items-center gap-1.5 shadow-2xs cursor-pointer shrink-0"
                title="Завантажити скріншот з розумної розетки та додати коментар для ШІ-аналізу"
              >
                <mat-icon class="text-sm leading-none">add_photo_alternate</mat-icon>
                <span>Скріншот + ШІ</span>
              </button>

              <button
                type="button"
                (click)="openDeviceModal()"
                class="h-9 px-3 rounded-xl text-xs font-semibold bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white border border-slate-800 dark:border-slate-700 transition-colors inline-flex items-center gap-1.5 shadow-2xs cursor-pointer shrink-0"
                title="Додати новий електроприлад до будинку"
              >
                <mat-icon class="text-sm leading-none">add</mat-icon>
                <span>Додати пристрій</span>
              </button>
            </div>
          }
        </div>

        @if (activeTab() === 'devices') {
          @let dSummary = deviceAnalyticsSummary();
          <!-- ======================================================== -->
          <!-- DEVICES & AI SCREENSHOT CONSUMPTION ANALYSIS SECTION     -->
          <!-- ======================================================== -->
          <div class="space-y-5">
            <!-- Top Overview Banner & KPIs -->
            <div class="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs space-y-4">
              <div
                class="flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                [class.border-b]="isOverviewKpiExpanded()"
                [class.border-slate-100]="isOverviewKpiExpanded()"
                [class.dark:border-slate-800]="isOverviewKpiExpanded()"
                [class.pb-3]="isOverviewKpiExpanded()"
              >
                <div class="flex items-start gap-3">
                  <button
                    type="button"
                    (click)="isOverviewKpiExpanded.update(v => !v)"
                    class="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0 cursor-pointer hover:bg-emerald-500/25 transition-colors"
                    [title]="isOverviewKpiExpanded() ? 'Згорнути блок моніторингу' : 'Розгорнути блок моніторингу'"
                  >
                    <mat-icon class="text-xl transition-transform duration-200" [class.rotate-180]="!isOverviewKpiExpanded()">
                      expand_more
                    </mat-icon>
                  </button>
                  <div>
                    <div class="flex items-center gap-2 flex-wrap">
                      <h3
                        class="text-base sm:text-lg font-bold text-slate-900 dark:text-white cursor-pointer hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                        (click)="isOverviewKpiExpanded.update(v => !v)"
                      >
                        Моніторинг електроприладів та AI-аналіз за {{ dSummary.monthLabel }}
                      </h3>
                      <span class="px-2 py-0.5 rounded-md text-3xs font-bold uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        Станом на {{ formatDate(dSummary.referenceDate) }} (день {{ dSummary.daysElapsed }} з {{ dSummary.daysInMonth }})
                      </span>
                      <span class="px-2 py-0.5 rounded-md text-3xs font-bold bg-indigo-100 dark:bg-indigo-950/80 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 inline-flex items-center gap-1">
                        <mat-icon class="text-3xs leading-none">home_pin</mat-icon>
                        <span>Будинок: {{ acc.name }} • Прилади будинку</span>
                      </span>
                    </div>
                    @if (isOverviewKpiExpanded()) {
                      <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Додавайте спожиту електроенергію по окремих приладах або завантажуйте скріншоти розумних розеток з коментарем для ШІ-аналізу
                      </p>
                    }
                  </div>
                </div>

                <!-- Reference Total House kWh Override -->
                <div class="flex items-center gap-2.5 shrink-0 flex-wrap">
                  <div class="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div>
                      <div class="text-3xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Загальне споживання дому ({{ dSummary.houseSourceLabel }})
                      </div>
                      <div class="flex items-center gap-2 mt-0.5">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          [value]="customMonthHouseKwh() !== null ? customMonthHouseKwh() : dSummary.houseReferenceKwh"
                          (change)="onCustomMonthHouseKwhChange($any($event.target).value)"
                          title="Уточнити загальне споживання будинку на цю дату"
                          class="w-24 px-2 py-0.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                        />
                        <span class="text-xs font-bold text-slate-700 dark:text-slate-300">кВт·год</span>
                        @if (customMonthHouseKwh() !== null) {
                          <button
                            type="button"
                            (click)="customMonthHouseKwh.set(null)"
                            class="text-3xs text-slate-500 hover:text-rose-600 underline cursor-pointer"
                            title="Скинути до автоматичного розрахунку"
                          >
                            Авто
                          </button>
                        }
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              @if (isOverviewKpiExpanded()) {
                <!-- ======================================================== -->
                <!-- WEATHER NOW, 7-DAY FORECAST & TEMPERATURE CORRELATION    -->
                <!-- ======================================================== -->
                @if (weatherData(); as weather) {
                  <div class="p-3.5 sm:p-4 rounded-2xl bg-sky-50/70 dark:bg-slate-800/90 border border-sky-200 dark:border-slate-700 space-y-3">
                    <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-2 border-b border-sky-200/70 dark:border-slate-700">
                      <!-- Current Weather Now -->
                      <div class="flex items-center gap-3">
                        <div>
                          <div class="flex items-center gap-2 flex-wrap">
                            <span
                              class="text-xs font-bold uppercase tracking-wider text-sky-900 dark:text-sky-300 cursor-pointer hover:underline"
                              (click)="isWeatherSectionExpanded.update(v => !v)"
                            >
                              Погода зараз ({{ weather.resolvedLocation || weather.city }}):
                            </span>
                            <span class="text-base sm:text-lg font-black font-mono text-slate-900 dark:text-white">
                              {{ weather.current.tempC > 0 ? '+' : '' }}{{ weather.current.tempC }}°C
                            </span>
                            <span class="px-2 py-0.5 rounded-full text-2xs font-bold bg-sky-100 dark:bg-sky-950 text-sky-900 dark:text-sky-200 border border-sky-300 dark:border-sky-700">
                              {{ weather.current.condition }}
                            </span>
                          </div>
                          <div class="text-2xs text-slate-600 dark:text-slate-300 mt-0.5 flex items-center gap-2 flex-wrap">
                            <span>Відчувається: <strong class="font-mono text-slate-900 dark:text-white">{{ weather.current.feelsLikeC > 0 ? '+' : '' }}{{ weather.current.feelsLikeC }}°C</strong></span>
                            <span>•</span>
                            <span>Вітер: <strong>{{ weather.current.windSpeedKmh }} км/г</strong></span>
                            <span>•</span>
                            <span>Вологість: <strong>{{ weather.current.humidityPct }}%</strong></span>
                          </div>
                        </div>
                      </div>

                      <!-- Temperature Impact Summary Pill & Refresh -->
                      <div class="flex items-center gap-2 flex-wrap">
                        <div class="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-700 text-2xs space-y-0.5">
                          <div class="text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1">
                            <mat-icon class="text-xs text-amber-500 leading-none">thermostat</mat-icon>
                            <span>Температурний тренд ({{ dSummary.monthLabel }}):</span>
                          </div>
                          <div class="font-mono font-bold text-slate-900 dark:text-slate-100">
                            Минулі: {{ dSummary.avgElapsedMonthTempC !== null ? ((dSummary.avgElapsedMonthTempC > 0 ? '+' : '') + dSummary.avgElapsedMonthTempC + '°C') : '—' }}
                            → Залишок: {{ dSummary.avgForecastRemainingTempC !== null ? ((dSummary.avgForecastRemainingTempC > 0 ? '+' : '') + dSummary.avgForecastRemainingTempC + '°C') : '—' }}
                            @if (dSummary.monthTempDropC > 0.5) {
                              <span class="text-sky-700 dark:text-sky-300 ml-1">(❄️ похолодання -{{ dSummary.monthTempDropC }}°C)</span>
                            } @else if (dSummary.monthTempDropC < -0.5) {
                              <span class="text-amber-700 dark:text-amber-300 ml-1">(☀️ потепління +{{ (-dSummary.monthTempDropC).toFixed(1) }}°C)</span>
                            }
                          </div>
                        </div>

                        <button
                          type="button"
                          (click)="loadWeatherForCurrentAccount()"
                          [disabled]="isWeatherLoading()"
                          class="p-2 rounded-xl bg-white dark:bg-slate-900 hover:bg-sky-100 dark:hover:bg-slate-700 border border-sky-200 dark:border-slate-700 text-sky-700 dark:text-sky-300 cursor-pointer transition-colors"
                          title="Оновити метеодані"
                        >
                          <mat-icon class="text-base leading-none" [class.animate-spin]="isWeatherLoading()">refresh</mat-icon>
                        </button>
                      </div>
                    </div>

                    @if (isWeatherSectionExpanded()) {
                      <!-- 7-Day Weather Forecast Strip -->
                      @if (weather.forecastDays.length > 0) {
                        <div>
                          <div class="flex items-center justify-between text-2xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                            <span>Прогноз погоди на найближчі дні:</span>
                            <span class="text-3xs text-slate-500 dark:text-slate-400">Нижча температура → більше споживання тепла</span>
                          </div>
                          <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                            @for (day of weather.forecastDays; track day.date; let idx = $index) {
                              <div class="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-700 flex flex-col justify-between gap-1 text-center">
                                <div class="text-3xs font-bold text-slate-600 dark:text-slate-300">
                                  {{ idx === 0 ? 'Сьогодні' : formatDate(day.date) }}
                                </div>
                                <div class="flex items-center justify-center gap-1 my-0.5">
                                  <mat-icon class="text-base text-sky-600 dark:text-sky-400 leading-none">{{ day.icon }}</mat-icon>
                                  <span class="text-xs font-black font-mono text-slate-900 dark:text-white">
                                    {{ day.tempAvgC > 0 ? '+' : '' }}{{ day.tempAvgC }}°C
                                  </span>
                                </div>
                                <div class="text-3xs font-mono text-slate-500 dark:text-slate-400">
                                  {{ day.tempMinC > 0 ? '+' : '' }}{{ day.tempMinC }}° .. {{ day.tempMaxC > 0 ? '+' : '' }}{{ day.tempMaxC }}°C
                                </div>
                                <div class="text-3xs font-semibold text-sky-800 dark:text-sky-300 truncate" [title]="day.condition">
                                  {{ day.condition }}
                                </div>
                              </div>
                            }
                          </div>
                        </div>
                      }

                      <!-- Weather-Correlated Consumption Forecast Breakdown -->
                      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                        <div class="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
                          <div>
                            <span class="text-3xs font-bold uppercase text-slate-500 dark:text-slate-400 block">Холодні vs Теплі дні</span>
                            @if (dSummary.coldDaysAvgKwh !== null && dSummary.warmDaysAvgKwh !== null) {
                              <div class="text-xs font-bold text-slate-900 dark:text-white mt-0.5">
                                ❄️ {{ dSummary.coldDaysAvgKwh.toFixed(2) }} кВт·г vs ☀️ {{ dSummary.warmDaysAvgKwh.toFixed(2) }} кВт·г
                              </div>
                              <span class="text-3xs text-slate-500 dark:text-slate-400">середнє за запис по погоді</span>
                            } @else {
                              <div class="text-xs font-bold text-slate-900 dark:text-white mt-0.5">
                                Вплив погоди: {{ dSummary.weatherHouseImpactPct > 0 ? '+' : '' }}{{ dSummary.weatherHouseImpactPct }}% до прогнозу
                              </div>
                              <span class="text-3xs text-slate-500 dark:text-slate-400">модель теплового навантаження дому</span>
                            }
                          </div>
                          <mat-icon class="text-sky-600 dark:text-sky-400 text-xl shrink-0">ac_unit</mat-icon>
                        </div>

                        <div class="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
                          <div>
                            <span class="text-3xs font-bold uppercase text-slate-500 dark:text-slate-400 block">Лінійний прогноз (без погоди)</span>
                            <div class="text-xs sm:text-sm font-black font-mono text-slate-900 dark:text-white mt-0.5">
                              {{ dSummary.projectedHouseMonthKwh.toFixed(0) }} кВт·год (~{{ dSummary.projectedHouseMonthCostUah.toFixed(0) }} грн)
                            </div>
                            <span class="text-3xs text-slate-500 dark:text-slate-400">При незмінній температурі</span>
                          </div>
                          <mat-icon class="text-slate-400 text-xl shrink-0">trending_flat</mat-icon>
                        </div>

                        <div class="p-3 rounded-xl bg-amber-50/80 dark:bg-slate-900 border border-amber-300 dark:border-amber-700 flex items-center justify-between gap-2">
                          <div>
                            <span class="text-3xs font-bold uppercase text-amber-900 dark:text-amber-300 block">Точний прогноз за погодою</span>
                            <div class="text-xs sm:text-sm font-black font-mono text-slate-900 dark:text-white mt-0.5">
                              {{ dSummary.weatherProjectedHouseMonthKwh.toFixed(0) }} кВт·год (~{{ dSummary.weatherProjectedHouseMonthCostUah.toFixed(0) }} грн)
                            </div>
                            <span class="text-3xs font-semibold text-amber-800 dark:text-amber-300">
                              @let diffKwh = dSummary.weatherProjectedHouseMonthKwh - dSummary.projectedHouseMonthKwh;
                              @if (Math.abs(diffKwh) >= 1) {
                                {{ diffKwh > 0 ? '+' : '' }}{{ diffKwh.toFixed(0) }} кВт·г через зміну температури
                              } @else {
                                Температура стабільна — без відхилень
                              }
                            </span>
                          </div>
                          <mat-icon class="text-amber-600 dark:text-amber-400 text-xl shrink-0">wb_twilight</mat-icon>
                        </div>
                      </div>
                    }
                  </div>
                }

                <!-- 4 KPI Cards: House Total vs Devices Total vs Untracked vs Month Forecast -->
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  <!-- Card 1: Total House Consumption -->
                  <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/90 dark:border-slate-700 flex flex-col justify-between">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-3xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Загалом по будинку
                      </span>
                      <mat-icon class="text-amber-500 text-lg leading-none">home_iot_device</mat-icon>
                    </div>
                    <div class="mt-2">
                      <div class="text-xl font-black font-mono text-slate-900 dark:text-white">
                        {{ dSummary.houseReferenceKwh.toFixed(1) }}
                        <span class="text-xs font-semibold text-slate-500 dark:text-slate-400">кВт·год</span>
                      </div>
                      <div class="text-xs font-bold text-amber-700 dark:text-amber-400 mt-0.5">
                        ≈ {{ dSummary.houseReferenceCostUah.toFixed(2) }} грн
                      </div>
                    </div>
                    <div class="mt-2 pt-2 border-t border-slate-200/70 dark:border-slate-700 flex items-center justify-between text-3xs text-slate-500 dark:text-slate-400">
                      <span>Темп: ~{{ dSummary.houseDailyPace.toFixed(2) }} кВт·г/добу</span>
                      <span class="font-semibold text-slate-700 dark:text-slate-300">{{ dSummary.houseSourceLabel }}</span>
                    </div>
                  </div>

                  <!-- Card 2: Consumed by Tracked Devices -->
                  <div class="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex flex-col justify-between">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-3xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                        Окремі пристрої ({{ accountDevices().length }})
                      </span>
                      <mat-icon class="text-emerald-600 dark:text-emerald-400 text-lg leading-none">power</mat-icon>
                    </div>
                    <div class="mt-2">
                      <div class="flex items-baseline gap-2">
                        <span class="text-xl font-black font-mono text-emerald-950 dark:text-emerald-200">
                          {{ dSummary.totalDevicesKwh.toFixed(2) }}
                        </span>
                        <span class="text-xs font-semibold text-emerald-700 dark:text-emerald-400">кВт·год</span>
                        <span class="ml-auto px-2 py-0.5 rounded-full text-2xs font-extrabold bg-emerald-200/80 dark:bg-emerald-800 text-emerald-900 dark:text-emerald-100">
                          {{ dSummary.devicesSharePercent.toFixed(1) }}%
                        </span>
                      </div>
                      <div class="text-xs font-bold text-emerald-800 dark:text-emerald-300 mt-0.5">
                        ≈ {{ dSummary.totalDevicesCostUah.toFixed(2) }} грн
                      </div>
                    </div>
                    <div class="mt-2 pt-2 border-t border-emerald-200/70 dark:border-emerald-800 flex items-center justify-between text-3xs text-emerald-800 dark:text-emerald-300">
                      <span>Темп: {{ dSummary.devicesDailyPace.toFixed(2) }} кВт·г/добу</span>
                      <span>
                        Записів: {{ dSummary.totalLogsInMonth }}
                        @if (dSummary.totalAttributedNoteKwh > 0) {
                          <span class="font-bold ml-1 text-emerald-900 dark:text-emerald-200">• ~{{ dSummary.totalAttributedNoteKwh }} кВт·г ШІ</span>
                        }
                      </span>
                    </div>
                  </div>

                  <!-- Card 3: Untracked / Other Household Consumption -->
                  <div class="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800 flex flex-col justify-between">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-3xs font-bold uppercase tracking-wider text-indigo-800 dark:text-indigo-300">
                        Інші прилади (поза моніторингом)
                      </span>
                      <mat-icon class="text-indigo-600 dark:text-indigo-400 text-lg leading-none">lightbulb</mat-icon>
                    </div>
                    <div class="mt-2">
                      <div class="flex items-baseline gap-2">
                        <span class="text-xl font-black font-mono text-indigo-950 dark:text-indigo-200">
                          {{ dSummary.untrackedKwh.toFixed(2) }}
                        </span>
                        <span class="text-xs font-semibold text-indigo-700 dark:text-indigo-400">кВт·год</span>
                        <span class="ml-auto px-2 py-0.5 rounded-full text-2xs font-extrabold bg-indigo-200/70 dark:bg-indigo-800 text-indigo-900 dark:text-indigo-100">
                          {{ dSummary.untrackedSharePercent.toFixed(1) }}%
                        </span>
                      </div>
                      <div class="text-xs font-bold text-indigo-800 dark:text-indigo-300 mt-0.5">
                        ≈ {{ dSummary.untrackedCostUah.toFixed(2) }} грн
                      </div>
                    </div>
                    <div class="mt-2 pt-2 border-t border-indigo-200/60 dark:border-indigo-800 text-3xs text-indigo-700 dark:text-indigo-300">
                      @if (dSummary.unmonitoredCatalogDevices.length > 0) {
                        <span>Включає {{ dSummary.unmonitoredCatalogDevices.length }} прилад(ів) будинку без смарт-розеток + світло</span>
                      } @else {
                        <span>Освітлення, роутер, зарядки, техніка</span>
                      }
                    </div>
                  </div>

                  <!-- Card 4: Weather-Adjusted End-of-Month Forecast -->
                  <div class="p-4 rounded-2xl bg-amber-50/70 dark:bg-slate-800 border border-amber-300/80 dark:border-amber-700 flex flex-col justify-between">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-3xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-300">
                        Прогноз за погодою ({{ dSummary.daysInMonth }} дн.)
                      </span>
                      <mat-icon class="text-amber-600 text-lg leading-none">thermostat_auto</mat-icon>
                    </div>
                    <div class="mt-2">
                      <div class="text-xl font-black font-mono text-slate-900 dark:text-white">
                        {{ dSummary.weatherProjectedHouseMonthKwh.toFixed(0) }}
                        <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">кВт·год</span>
                      </div>
                      <div class="text-xs font-bold text-amber-800 dark:text-amber-300 mt-0.5">
                        Рахунок: ~{{ dSummary.weatherProjectedHouseMonthCostUah.toFixed(0) }} грн
                      </div>
                    </div>
                    <div class="mt-2 pt-2 border-t border-amber-200/80 dark:border-slate-700 flex items-center justify-between text-3xs text-amber-900 dark:text-amber-200">
                      <span>Пристрої: ~{{ dSummary.weatherProjectedDevicesMonthKwh.toFixed(0) }} кВт·г</span>
                      <span class="font-bold">(~{{ dSummary.weatherProjectedDevicesMonthCostUah.toFixed(0) }} грн)</span>
                    </div>
                  </div>
                </div>
              } @else {
                <!-- Compact Summary Line when Overview Section is Collapsed -->
                <div class="px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/90 dark:border-slate-700 flex items-center justify-between gap-3 text-2xs flex-wrap">
                  <div class="flex items-center gap-3.5 flex-wrap">
                    @if (weatherData(); as weather) {
                      <span class="inline-flex items-center gap-1 font-bold text-sky-700 dark:text-sky-300">
                        <mat-icon class="text-xs leading-none">{{ weather.current.icon || 'wb_sunny' }}</mat-icon>
                        <span>{{ weather.current.tempC > 0 ? '+' : '' }}{{ weather.current.tempC }}°C</span>
                      </span>
                      <span>•</span>
                    }
                    <span>Загалом дім: <strong class="font-mono text-slate-900 dark:text-white">{{ dSummary.houseReferenceKwh.toFixed(1) }} кВт·г</strong> (≈{{ dSummary.houseReferenceCostUah.toFixed(0) }} грн)</span>
                    <span>•</span>
                    <span>Окремі прилади: <strong class="font-mono text-emerald-700 dark:text-emerald-400">{{ dSummary.totalDevicesKwh.toFixed(1) }} кВт·г</strong> ({{ dSummary.devicesSharePercent.toFixed(1) }}%)</span>
                    <span>•</span>
                    <span>Інші: <strong class="font-mono text-indigo-700 dark:text-indigo-400">{{ dSummary.untrackedKwh.toFixed(1) }} кВт·г</strong> ({{ dSummary.untrackedSharePercent.toFixed(1) }}%)</span>
                    <span>•</span>
                    <span>Прогноз за погодою: <strong class="font-mono text-amber-800 dark:text-amber-300">~{{ dSummary.weatherProjectedHouseMonthKwh.toFixed(0) }} кВт·г</strong> (~{{ dSummary.weatherProjectedHouseMonthCostUah.toFixed(0) }} грн)</span>
                  </div>
                  <button
                    type="button"
                    (click)="isOverviewKpiExpanded.set(true)"
                    class="text-3xs text-emerald-600 dark:text-emerald-400 hover:underline font-semibold cursor-pointer"
                  >
                    Розгорнути блок
                  </button>
                </div>
              }
            </div>

            <!-- ======================================================== -->
            <!-- USAGE WARNING COMPONENT (HIGH CONSUMPTION APPLIANCES)    -->
            <!-- ======================================================== -->
            @if (dSummary.usageWarnings.length > 0) {
              <div class="rounded-2xl bg-gradient-to-r from-amber-50/90 via-orange-50/70 to-rose-50/80 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900 border border-amber-300/90 dark:border-amber-700/80 shadow-2xs overflow-hidden">
                <!-- Warning Header -->
                <div class="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-200/70 dark:border-slate-800">
                  <div class="flex items-center gap-3">
                    <button
                      type="button"
                      (click)="isUsageWarningExpanded.update(v => !v)"
                      class="w-9 h-9 rounded-xl bg-amber-500/20 dark:bg-amber-500/15 border border-amber-500/40 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0 cursor-pointer hover:bg-amber-500/30 transition-colors"
                      [title]="isUsageWarningExpanded() ? 'Згорнути попередження про споживання' : 'Розгорнути попередження про споживання'"
                    >
                      <mat-icon class="text-xl transition-transform duration-200" [class.rotate-180]="!isUsageWarningExpanded()">
                        warning_amber
                      </mat-icon>
                    </button>
                    <div>
                      <div class="flex items-center gap-2 flex-wrap">
                        <h4
                          class="text-sm sm:text-base font-bold text-slate-900 dark:text-white cursor-pointer hover:text-amber-700 dark:hover:text-amber-400 transition-colors"
                          (click)="isUsageWarningExpanded.update(v => !v)"
                        >
                          Попередження про підвищене споживання (Usage Warning)
                        </h4>
                        <span class="px-2 py-0.5 rounded-full text-2xs font-extrabold bg-rose-100 dark:bg-rose-950/90 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                          {{ dSummary.usageWarnings.length }} прилад(ів) вище норми
                        </span>
                        <span class="px-2 py-0.5 rounded-full text-2xs font-mono font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                          Перевищення: +{{ dSummary.totalWarningExcessKwh.toFixed(1) }} кВт·г (~{{ dSummary.totalWarningExcessCostUah.toFixed(0) }} грн)
                        </span>
                      </div>
                      <p class="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                        Прилади, що споживають значно більше електроенергії за своє середнє місячне значення (середнє по приладу: {{ dSummary.averageDeviceMonthKwh.toFixed(1) }} кВт·г)
                      </p>
                    </div>
                  </div>

                  <div class="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <button
                      type="button"
                      (click)="isUsageWarningExpanded.update(v => !v)"
                      class="p-1.5 rounded-xl bg-white/80 dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-amber-200 dark:border-slate-700 transition-colors cursor-pointer"
                      [title]="isUsageWarningExpanded() ? 'Згорнути попередження' : 'Розгорнути попередження'"
                    >
                      <mat-icon class="text-base leading-none">
                        {{ isUsageWarningExpanded() ? 'expand_less' : 'expand_more' }}
                      </mat-icon>
                    </button>
                  </div>
                </div>

                @if (isUsageWarningExpanded()) {
                  <div class="p-3.5 sm:p-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
                    @for (warn of dSummary.usageWarnings; track warn.deviceId) {
                      <div
                        class="p-3.5 rounded-xl bg-white dark:bg-slate-800/90 border transition-all flex flex-col justify-between gap-2.5 shadow-2xs"
                        [class.border-rose-300]="warn.severity === 'critical'"
                        [class.dark:border-rose-800/80]="warn.severity === 'critical'"
                        [class.border-amber-300]="warn.severity === 'warning'"
                        [class.dark:border-amber-700/70]="warn.severity === 'warning'"
                      >
                        <div class="flex items-start justify-between gap-2.5">
                          <div class="flex items-center gap-2.5 min-w-0">
                            <div
                              class="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0 shadow-2xs"
                              [style.background-color]="warn.deviceColor || '#f59e0b'"
                            >
                              <mat-icon class="text-lg">{{ warn.deviceIcon || 'bolt' }}</mat-icon>
                            </div>
                            <div class="min-w-0">
                              <div class="flex items-center gap-1.5 flex-wrap">
                                <span class="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                                  {{ warn.deviceName }}
                                </span>
                                @if (warn.powerWatts) {
                                  <span class="px-1.5 py-0.2 rounded text-3xs font-mono font-semibold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                    {{ warn.powerWatts }} Вт
                                  </span>
                                }
                              </div>
                              <div class="text-3xs text-slate-500 dark:text-slate-400 mt-0.5">
                                База порівняння: <span class="font-semibold text-slate-700 dark:text-slate-300">{{ warn.baselineLabel }}</span>
                              </div>
                            </div>
                          </div>

                          <span
                            class="px-2 py-0.5 rounded-lg text-2xs font-extrabold font-mono shrink-0 flex items-center gap-1 border"
                            [class.bg-rose-100]="warn.severity === 'critical'"
                            [class.dark:bg-rose-950]="warn.severity === 'critical'"
                            [class.text-rose-800]="warn.severity === 'critical'"
                            [class.dark:text-rose-300]="warn.severity === 'critical'"
                            [class.border-rose-300]="warn.severity === 'critical'"
                            [class.dark:border-rose-800]="warn.severity === 'critical'"
                            [class.bg-amber-100]="warn.severity === 'warning'"
                            [class.dark:bg-amber-950]="warn.severity === 'warning'"
                            [class.text-amber-900]="warn.severity === 'warning'"
                            [class.dark:text-amber-300]="warn.severity === 'warning'"
                            [class.border-amber-300]="warn.severity === 'warning'"
                            [class.dark:border-amber-800]="warn.severity === 'warning'"
                          >
                            <mat-icon class="text-xs leading-none">trending_up</mat-icon>
                            <span>+{{ warn.excessPercent }}% вище норми</span>
                          </span>
                        </div>

                        <!-- Metrics Comparison Bar -->
                        <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-700/80 space-y-1.5">
                          <div class="grid grid-cols-3 gap-2 text-2xs">
                            <div>
                              <span class="text-3xs text-slate-500 dark:text-slate-400 block">Поточне / Прогноз</span>
                              <span class="font-mono font-black text-slate-900 dark:text-white">
                                {{ warn.actualOrProjectedKwh.toFixed(1) }} кВт·г
                              </span>
                              <span class="text-3xs text-slate-500 dark:text-slate-400 block">
                                ≈ {{ warn.actualOrProjectedCostUah.toFixed(0) }} грн
                              </span>
                            </div>
                            <div>
                              <span class="text-3xs text-slate-500 dark:text-slate-400 block">Середнє за місяць</span>
                              <span class="font-mono font-bold text-slate-700 dark:text-slate-300">
                                {{ warn.monthlyAverageKwh.toFixed(1) }} кВт·г
                              </span>
                              <span class="text-3xs text-slate-500 dark:text-slate-400 block">
                                Частка дому: {{ warn.shareOfHousePercent.toFixed(1) }}%
                              </span>
                            </div>
                            <div class="text-right">
                              <span class="text-3xs text-slate-500 dark:text-slate-400 block">Перевищення</span>
                              <span
                                class="font-mono font-black"
                                [class.text-rose-600]="warn.severity === 'critical'"
                                [class.dark:text-rose-400]="warn.severity === 'critical'"
                                [class.text-amber-700]="warn.severity === 'warning'"
                                [class.dark:text-amber-400]="warn.severity === 'warning'"
                              >
                                +{{ warn.excessKwh.toFixed(1) }} кВт·г
                              </span>
                              <span class="text-3xs font-bold text-rose-600 dark:text-rose-400 block">
                                +{{ warn.excessCostUah.toFixed(0) }} грн
                              </span>
                            </div>
                          </div>

                          <!-- Visual Progress Ratio -->
                          <div class="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden flex">
                            <div
                              class="h-full bg-emerald-500 transition-all"
                              [style.width.%]="warn.normalBarWidthPct"
                              title="Середній рівень споживання"
                            ></div>
                            <div
                              class="h-full transition-all"
                              [class.bg-rose-500]="warn.severity === 'critical'"
                              [class.bg-amber-500]="warn.severity === 'warning'"
                              [style.width.%]="100 - warn.normalBarWidthPct"
                              title="Перевищення середнього споживання"
                            ></div>
                          </div>
                        </div>

                        <!-- Explanation & Quick Action -->
                        <div class="flex items-center justify-between gap-2 pt-0.5">
                          <p class="text-2xs text-slate-600 dark:text-slate-300 leading-snug">
                            {{ warn.recommendation }}
                          </p>
                          <button
                            type="button"
                            (click)="focusAndExpandDeviceFromWarning(warn.deviceId)"
                            class="px-2.5 py-1 rounded-lg text-2xs font-bold bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 transition-colors shrink-0 flex items-center gap-1 cursor-pointer"
                          >
                            <mat-icon class="text-xs leading-none">visibility</mat-icon>
                            <span>Деталі</span>
                          </button>
                        </div>
                      </div>
                    }
                  </div>
                }
              </div>
            }

            <!-- ======================================================== -->
            <!-- INDIVIDUAL DEVICES (ULTRA-COMPACT EXPANDABLE LIST VIEW)   -->
            <!-- ======================================================== -->
            <div class="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs space-y-0 overflow-hidden">
              <!-- Section Header & Controls -->
              <div class="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800">
                <div class="flex items-center gap-3">
                  <button
                    type="button"
                    (click)="isDevicesSectionExpanded.update(v => !v)"
                    class="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0 cursor-pointer hover:bg-emerald-500/25 transition-colors"
                    [title]="isDevicesSectionExpanded() ? 'Згорнути список приладів' : 'Розгорнути список приладів'"
                  >
                    <mat-icon class="text-xl transition-transform duration-200" [class.rotate-180]="!isDevicesSectionExpanded()">
                      expand_more
                    </mat-icon>
                  </button>
                  <div>
                    <div class="flex items-center gap-2 flex-wrap">
                      <h4
                        class="text-sm sm:text-base font-bold text-slate-900 dark:text-white cursor-pointer hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                        (click)="isDevicesSectionExpanded.update(v => !v)"
                      >
                        Список електроприладів
                      </h4>
                      <span class="px-2 py-0.5 rounded-full text-2xs font-extrabold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                        {{ dSummary.deviceRows.length }} прилад(ів)
                      </span>
                    </div>
                    <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {{ deviceViewLayout() === 'cards' ? 'Картки приладів зі споживанням, потужністю, журналами та аналітикою' : 'Компактний список: натисніть на рядок пристрою, щоб відкрити деталі' }}
                    </p>
                  </div>
                </div>

                <!-- Section Actions & View Mode Toggle -->
                <div class="flex items-center gap-2 flex-wrap">
                  <!-- Layout Switcher: Cards vs List -->
                  <div class="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
                    <button
                      type="button"
                      (click)="deviceViewLayout.set('cards')"
                      class="px-2.5 py-1 rounded-lg text-2xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                      [class.bg-white]="deviceViewLayout() === 'cards'"
                      [class.dark:bg-slate-900]="deviceViewLayout() === 'cards'"
                      [class.text-emerald-700]="deviceViewLayout() === 'cards'"
                      [class.dark:text-emerald-400]="deviceViewLayout() === 'cards'"
                      [class.shadow-2xs]="deviceViewLayout() === 'cards'"
                      [class.text-slate-600]="deviceViewLayout() !== 'cards'"
                      [class.dark:text-slate-400]="deviceViewLayout() !== 'cards'"
                      title="Відобразити у вигляді карток"
                    >
                      <mat-icon class="text-xs leading-none">grid_view</mat-icon>
                      <span>Картки</span>
                    </button>
                    <button
                      type="button"
                      (click)="deviceViewLayout.set('list')"
                      class="px-2.5 py-1 rounded-lg text-2xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                      [class.bg-white]="deviceViewLayout() === 'list'"
                      [class.dark:bg-slate-900]="deviceViewLayout() === 'list'"
                      [class.text-emerald-700]="deviceViewLayout() === 'list'"
                      [class.dark:text-emerald-400]="deviceViewLayout() === 'list'"
                      [class.shadow-2xs]="deviceViewLayout() === 'list'"
                      [class.text-slate-600]="deviceViewLayout() !== 'list'"
                      [class.dark:text-slate-400]="deviceViewLayout() !== 'list'"
                      title="Відобразити у вигляді компактного списку"
                    >
                      <mat-icon class="text-xs leading-none">view_list</mat-icon>
                      <span>Список</span>
                    </button>
                  </div>

                  @if (canEdit()) {
                    <button
                      type="button"
                      (click)="openAddDeviceLogModal()"
                      class="px-2.5 py-1.5 rounded-xl text-2xs font-bold bg-amber-500 hover:bg-amber-600 text-white transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                      title="Внести споживання для приладу"
                    >
                      <mat-icon class="text-xs leading-none">add</mat-icon>
                      <span>+ Запис кВт·г</span>
                    </button>

                    <button
                      type="button"
                      (click)="openScreenshotModal()"
                      class="px-2.5 py-1.5 rounded-xl text-2xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                      title="Завантажити скріншот з розетки"
                    >
                      <mat-icon class="text-xs leading-none">add_photo_alternate</mat-icon>
                      <span>Скріншот (ШІ)</span>
                    </button>

                    <button
                      type="button"
                      (click)="openDeviceModal()"
                      class="px-2.5 py-1.5 rounded-xl text-2xs font-semibold bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white transition-colors flex items-center gap-1 cursor-pointer border border-slate-800 dark:border-slate-700 shadow-2xs"
                    >
                      <mat-icon class="text-xs leading-none">add_circle</mat-icon>
                      <span>Новий прилад</span>
                    </button>
                  }
                </div>
              </div>

              <!-- Device Rows: Cards or List -->
              @if (isDevicesSectionExpanded()) {
                @if (dSummary.deviceRows.length > 0) {
                  @if (deviceViewLayout() === 'cards') {
                    <!-- ============================================== -->
                    <!-- SMART-HOME NEON-CYAN CARDS GRID VIEW (DEFAULT) -->
                    <!-- ============================================== -->
                    <div class="p-4 sm:p-6 bg-slate-950/95">
                      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                        @for (item of dSummary.deviceRows; track item.device.id) {
                          @let archetype = getSmartCardArchetype(item);
                          @let statusInfo = getSmartCardStatusInfo(item);
                          @let leftMetric = getSmartCardLeftMetric(item);
                          @let rightMetric = getSmartCardRightMetric(item);
                          @let dailyChart = getSmartCardDailyChart(item);
                          @let isOn = isDevicePowerOn(item.device.id);
                          <div
                            class="relative rounded-[28px] bg-gradient-to-br from-[#0c2147] via-[#091836] to-[#061024] border transition-all duration-300 shadow-[0_14px_34px_rgba(2,8,24,0.75)] flex flex-col justify-between overflow-hidden text-white select-none"
                            [class.border-rose-500/70]="item.usageWarning?.severity === 'critical'"
                            [class.border-amber-400/70]="item.usageWarning?.severity === 'warning'"
                            [class.border-sky-400/25]="!item.usageWarning"
                            [class.ring-2]="isCompactDeviceExpanded(item.device.id)"
                            [class.ring-sky-400/40]="isCompactDeviceExpanded(item.device.id)"
                          >
                            <!-- Ambient Top-Left Cyan Glow -->
                            <div
                              class="pointer-events-none absolute -top-12 -left-12 w-48 h-48 rounded-full blur-3xl transition-opacity duration-300"
                              [class.bg-sky-400/20]="isOn"
                              [class.bg-slate-600/10]="!isOn"
                            ></div>

                            <!-- Main Card Content -->
                            <div class="relative z-10 p-5 sm:p-6 space-y-4 flex-1 flex flex-col">
                              <!-- Quick Top-Right Utility Badges (Usage Warning + Quick Log) -->
                              <div class="flex items-center justify-between gap-2">
                                <div class="flex items-center gap-1.5 flex-wrap">
                                  <span class="px-2 py-0.5 rounded-full text-3xs font-mono font-bold bg-sky-500/15 text-sky-300 border border-sky-400/25">
                                    {{ item.monthKwh.toFixed(1) }} кВт·г • {{ item.monthCostUah.toFixed(0) }} грн
                                  </span>
                                  <span class="px-2 py-0.5 rounded-full text-3xs font-mono font-semibold bg-white/5 text-slate-300 border border-white/10">
                                    {{ item.shareOfHousePercent.toFixed(1) }}% будинку
                                  </span>
                                  @if (item.usageWarning; as uw) {
                                    <span
                                      class="px-2 py-0.5 rounded-full text-3xs font-extrabold inline-flex items-center gap-0.5 border"
                                      [class.bg-rose-500/25]="uw.severity === 'critical'"
                                      [class.text-rose-200]="uw.severity === 'critical'"
                                      [class.border-rose-400/50]="uw.severity === 'critical'"
                                      [class.bg-amber-500/25]="uw.severity === 'warning'"
                                      [class.text-amber-200]="uw.severity === 'warning'"
                                      [class.border-amber-400/50]="uw.severity === 'warning'"
                                      [title]="'Споживання перевищує середнє (' + uw.monthlyAverageKwh.toFixed(1) + ' кВт·г) на +' + uw.excessPercent + '%'"
                                    >
                                      <mat-icon class="text-3xs leading-none">warning_amber</mat-icon>
                                      <span>+{{ uw.excessPercent }}%</span>
                                    </span>
                                  }
                                </div>

                                @if (canEdit()) {
                                  <div class="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      (click)="openAddDeviceLogModal(item.device.id)"
                                      class="px-2 py-1 rounded-lg text-3xs font-bold bg-sky-500/20 hover:bg-sky-500/35 text-sky-200 border border-sky-400/30 transition-colors cursor-pointer flex items-center gap-0.5"
                                      title="Внести споживання кВт·г"
                                    >
                                      <mat-icon class="text-xs leading-none">add</mat-icon>
                                      <span>кВт·г</span>
                                    </button>
                                    <button
                                      type="button"
                                      (click)="openScreenshotModal(item.device.id)"
                                      class="p-1 rounded-lg text-sky-300/80 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/15 transition-colors cursor-pointer"
                                      title="Завантажити скріншот (ШІ)"
                                    >
                                      <mat-icon class="text-xs leading-none">add_photo_alternate</mat-icon>
                                    </button>
                                  </div>
                                }
                              </div>

                              <!-- Header Row: Glowing Neon-Cyan Line-Art SVG Icon + Title & Specs -->
                              <div class="flex items-center gap-4 pt-0.5">
                                <!-- Neon-Cyan SVG Illustration -->
                                <div class="w-20 h-20 sm:w-22 sm:h-22 shrink-0 flex items-center justify-center relative">
                                  @switch (archetype) {
                                    @case ('ac') {
                                      <!-- Air Conditioner Glowing Line-Art SVG -->
                                      <svg
                                        viewBox="0 0 96 96"
                                        class="w-full h-full overflow-visible transition-opacity duration-300"
                                        [class.opacity-50]="!isOn"
                                        style="filter: drop-shadow(0 0 10px rgba(56, 189, 248, 0.75));"
                                        fill="none"
                                      >
                                        <rect x="8" y="14" width="80" height="40" rx="8" stroke="#38bdf8" stroke-width="3.2" fill="rgba(14, 165, 233, 0.08)" />
                                        <circle cx="19" cy="24" r="2.2" fill="#7dd3fc" />
                                        <circle cx="27" cy="24" r="2.2" fill="#7dd3fc" />
                                        <circle cx="35" cy="24" r="2.2" fill="#7dd3fc" />
                                        <path d="M16 44 H80 C82 44 83 46 83 48 V51 H13 V48 C13 46 14 44 16 44 Z" stroke="#38bdf8" stroke-width="2.6" fill="rgba(56, 189, 248, 0.12)" />
                                        <path d="M29 60 C29 68 25 74 18 79" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" />
                                        <path d="M41 60 C41 69 39 76 34 83" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" />
                                        <path d="M49 60 V83" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" />
                                        <path d="M58 60 C58 69 61 76 66 82" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" />
                                        <path d="M70 60 C71 67 75 73 82 77" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" />
                                      </svg>
                                    }
                                    @case ('boiler') {
                                      <!-- Water Heater / Boiler Glowing Line-Art SVG -->
                                      <svg
                                        viewBox="0 0 96 96"
                                        class="w-full h-full overflow-visible transition-opacity duration-300"
                                        [class.opacity-50]="!isOn"
                                        style="filter: drop-shadow(0 0 10px rgba(56, 189, 248, 0.75));"
                                        fill="none"
                                      >
                                        <rect x="22" y="10" width="52" height="68" rx="14" stroke="#38bdf8" stroke-width="3.2" fill="rgba(14, 165, 233, 0.08)" />
                                        <circle cx="48" cy="31" r="9.5" stroke="#38bdf8" stroke-width="3" fill="rgba(14, 165, 233, 0.15)" />
                                        <path d="M48 31 L53 26" stroke="#7dd3fc" stroke-width="2.8" stroke-linecap="round" />
                                        <rect x="38" y="52" width="20" height="10" rx="2.5" stroke="#38bdf8" stroke-width="2.6" fill="rgba(56, 189, 248, 0.14)" />
                                        <path d="M42 66 H54" stroke="#7dd3fc" stroke-width="2.5" stroke-linecap="round" />
                                        <rect x="33" y="78" width="7" height="7" rx="1.5" stroke="#38bdf8" stroke-width="2.6" />
                                        <rect x="56" y="78" width="7" height="7" rx="1.5" stroke="#38bdf8" stroke-width="2.6" />
                                      </svg>
                                    }
                                    @case ('ev') {
                                      <!-- Electric Vehicle with Plug Glowing Line-Art SVG -->
                                      <svg
                                        viewBox="0 0 96 96"
                                        class="w-full h-full overflow-visible transition-opacity duration-300"
                                        [class.opacity-50]="!isOn"
                                        style="filter: drop-shadow(0 0 10px rgba(56, 189, 248, 0.75));"
                                        fill="none"
                                      >
                                        <path d="M29 14 H37 M29 22 H37" stroke="#38bdf8" stroke-width="2.8" stroke-linecap="round" />
                                        <path d="M37 11 H46 C50 11 53 14 53 18 C53 22 50 25 46 25 H37 Z" stroke="#38bdf8" stroke-width="2.8" fill="rgba(56, 189, 248, 0.15)" />
                                        <path d="M53 18 H68 C76 18 81 24 81 31 C81 38 75 43 68 44" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" />
                                        <path d="M24 50 L30 35 C32 31 36 29 41 29 H55 C60 29 64 31 66 35 L72 50" stroke="#38bdf8" stroke-width="3" stroke-linejoin="round" fill="rgba(14, 165, 233, 0.08)" />
                                        <rect x="15" y="45" width="8" height="5" rx="2.5" stroke="#38bdf8" stroke-width="2.5" />
                                        <rect x="73" y="45" width="8" height="5" rx="2.5" stroke="#38bdf8" stroke-width="2.5" />
                                        <rect x="19" y="50" width="58" height="24" rx="8" stroke="#38bdf8" stroke-width="3.2" fill="rgba(14, 165, 233, 0.12)" />
                                        <path d="M25 58 L35 61" stroke="#7dd3fc" stroke-width="3.2" stroke-linecap="round" />
                                        <path d="M71 58 L61 61" stroke="#7dd3fc" stroke-width="3.2" stroke-linecap="round" />
                                        <path d="M40 66 H56" stroke="#38bdf8" stroke-width="2.8" stroke-linecap="round" />
                                        <path d="M22 74 V82 C22 84 24 85 26 85 H31 C33 85 35 84 35 82 V74" stroke="#38bdf8" stroke-width="3" />
                                        <path d="M61 74 V82 C61 84 63 85 65 85 H70 C72 85 74 84 74 82 V74" stroke="#38bdf8" stroke-width="3" />
                                      </svg>
                                    }
                                    @default {
                                      <!-- Glowing Neon-Cyan Appliance Frame for Other Devices -->
                                      <div
                                        class="w-18 h-18 rounded-2xl border-2 border-sky-400 bg-sky-500/10 flex items-center justify-center text-sky-300 transition-opacity duration-300"
                                        [class.opacity-50]="!isOn"
                                        style="filter: drop-shadow(0 0 10px rgba(56, 189, 248, 0.65));"
                                      >
                                        <mat-icon class="text-4xl leading-none" style="width: 36px; height: 36px; font-size: 36px;">
                                          {{ item.device.icon || 'bolt' }}
                                        </mat-icon>
                                      </div>
                                    }
                                  }
                                </div>

                                <!-- Device Title & Technical Subtitle -->
                                <div class="min-w-0 flex-1">
                                  <h4
                                    class="text-lg sm:text-xl font-bold text-white leading-snug line-clamp-2"
                                    [title]="item.device.name"
                                  >
                                    {{ item.device.name }}
                                  </h4>
                                  <div class="text-xs sm:text-sm mt-1 font-medium">
                                    <span class="text-slate-400">{{ statusInfo.prefix }} </span>
                                    <span
                                      class="font-semibold"
                                      [class.text-sky-400]="isOn"
                                      [class.text-slate-500]="!isOn"
                                    >
                                      {{ statusInfo.value }}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <!-- Two Translucent Metric Tiles: Hourly Average + Monthly Total -->
                              <div class="grid grid-cols-2 gap-3">
                                <!-- Left Metric Tile: Average Consumption per Hour -->
                                <div class="rounded-2xl bg-[#11264e]/85 border border-sky-300/12 px-3 py-3 text-center flex flex-col justify-center min-h-[96px] shadow-inner">
                                  <div class="flex items-baseline justify-center gap-1">
                                    <span class="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-mono">
                                      {{ leftMetric.value }}
                                    </span>
                                    <span class="text-xs sm:text-sm font-semibold text-slate-300">
                                      {{ leftMetric.unit }}
                                    </span>
                                  </div>
                                  <div class="text-2xs sm:text-xs text-slate-200 mt-1 font-medium">
                                    {{ leftMetric.label }}
                                  </div>
                                  @if (leftMetric.subnote) {
                                    <div class="text-3xs text-sky-300/80 mt-0.5 truncate" [title]="leftMetric.subnote">
                                      {{ leftMetric.subnote }}
                                    </div>
                                  }
                                </div>

                                <!-- Right Metric Tile: Monthly Consumption & Reading Average -->
                                <div class="rounded-2xl bg-[#11264e]/85 border border-sky-300/12 px-3 py-3 text-center flex flex-col justify-center min-h-[96px] shadow-inner">
                                  <div class="flex items-baseline justify-center gap-1">
                                    <span class="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-mono">
                                      {{ rightMetric.value }}
                                    </span>
                                    <span class="text-xs sm:text-sm font-semibold text-slate-300">
                                      {{ rightMetric.unit }}
                                    </span>
                                  </div>
                                  <div class="text-2xs sm:text-xs text-slate-200 mt-1 font-medium">
                                    {{ rightMetric.label }}
                                  </div>
                                  @if (rightMetric.sublabel) {
                                    <div class="text-3xs text-slate-400 mt-0.5 truncate" [title]="rightMetric.sublabel">
                                      {{ rightMetric.sublabel }}
                                    </div>
                                  }
                                </div>
                              </div>

                              <!-- Energy Consumption Spline Box by Recorded Days ("Споживання електроенергії") -->
                              <div class="rounded-2xl bg-[#11264e]/85 border border-sky-300/12 p-4 space-y-2 shadow-inner">
                                <div class="flex items-center justify-between gap-2">
                                  <span class="text-xs sm:text-sm font-medium text-slate-200">
                                    Споживання електроенергії
                                  </span>
                                  <span class="text-3xs font-mono text-sky-300/90" title="Прогноз до кінця місяця з урахуванням погоди">
                                    ⛅ ~{{ item.weatherProjectedMonthKwh.toFixed(0) }} кВт·г/міс
                                  </span>
                                </div>

                                <!-- Glowing Neon-Cyan Smooth Area Spline SVG by Recorded Days -->
                                <div class="pt-1">
                                  <svg viewBox="0 0 300 72" class="w-full h-18 overflow-visible">
                                    <defs>
                                      <linearGradient [attr.id]="'cardSplineGrad_' + item.device.id" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.42" />
                                        <stop offset="100%" stop-color="#0ea5e9" stop-opacity="0.0" />
                                      </linearGradient>
                                    </defs>
                                    <!-- Filled Area under curve -->
                                    <path
                                      [attr.d]="dailyChart.areaPath"
                                      [attr.fill]="'url(#cardSplineGrad_' + item.device.id + ')'"
                                    />
                                    <!-- Glowing Cyan Spline Line -->
                                    <path
                                      [attr.d]="dailyChart.linePath"
                                      fill="none"
                                      stroke="#38bdf8"
                                      stroke-width="2.8"
                                      stroke-linecap="round"
                                      style="filter: drop-shadow(0 0 6px rgba(56, 189, 248, 0.8));"
                                    />
                                    <!-- Data Points & Values for Recorded Days -->
                                    @for (pt of dailyChart.points; track pt.dateLabel + '_' + $index) {
                                      <g>
                                        <circle
                                          [attr.cx]="pt.x"
                                          [attr.cy]="pt.y"
                                          r="3.4"
                                          fill="#e0f2fe"
                                          stroke="#0284c7"
                                          stroke-width="1.5"
                                        >
                                          <title>{{ pt.dateLabel }}: {{ pt.kwh }} кВт·г</title>
                                        </circle>
                                        @if (pt.kwh > 0) {
                                          <text
                                            [attr.x]="pt.x"
                                            [attr.y]="Math.max(10, pt.y - 6)"
                                            text-anchor="middle"
                                            fill="#bae6fd"
                                            font-size="8.5"
                                            font-family="monospace"
                                            font-weight="700"
                                          >
                                            {{ pt.kwh >= 10 ? pt.kwh.toFixed(0) : pt.kwh.toFixed(1) }}
                                          </text>
                                        }
                                      </g>
                                    }
                                  </svg>

                                  <!-- X-Axis Labels: Recorded Dates by Day -->
                                  @if (dailyChart.hasData && dailyChart.points.length > 0) {
                                    <div class="flex items-center justify-between text-3xs sm:text-2xs text-slate-300 pt-1 font-mono font-medium px-1">
                                      @for (pt of dailyChart.points; track pt.dateLabel + '_lbl_' + $index) {
                                        <span>{{ pt.dateLabel }}</span>
                                      }
                                    </div>
                                  } @else {
                                    <div class="text-center text-3xs text-slate-400 pt-1">
                                      Ще немає записаних показників по днях
                                    </div>
                                  }
                                </div>
                              </div>

                              <!-- Bottom Controls Row: "Ввімкнено" Toggle Switch + "Налаштувати" Button -->
                              <div class="grid grid-cols-2 gap-3 pt-1">
                                <!-- Left Pill: Glowing Toggle Switch -->
                                <button
                                  type="button"
                                  (click)="toggleDevicePowerState(item.device.id)"
                                  class="rounded-full p-1.5 pr-3.5 flex items-center gap-2.5 border transition-all cursor-pointer"
                                  [class.bg-[#0d2244]]="isOn"
                                  [class.border-emerald-400/35]="isOn"
                                  [class.bg-slate-900/80]="!isOn"
                                  [class.border-slate-700]="!isOn"
                                  [title]="isOn ? 'Натисніть, щоб перевести у режим очікування' : 'Натисніть, щоб увімкнути'"
                                >
                                  <!-- Switch Track -->
                                  <div
                                    class="w-13 h-7 rounded-full p-0.5 flex items-center transition-all duration-300 shrink-0"
                                    [class.bg-gradient-to-r]="isOn"
                                    [class.from-emerald-400]="isOn"
                                    [class.to-cyan-400]="isOn"
                                    [class.justify-end]="isOn"
                                    [class.shadow-[0_0_14px_rgba(52,211,153,0.6)]]="isOn"
                                    [class.bg-slate-700]="!isOn"
                                    [class.justify-start]="!isOn"
                                  >
                                    <div class="w-6 h-6 rounded-full bg-white shadow-md"></div>
                                  </div>
                                  <span
                                    class="text-xs sm:text-sm font-semibold truncate"
                                    [class.text-emerald-400]="isOn"
                                    [class.text-slate-400]="!isOn"
                                  >
                                    {{ isOn ? 'Ввімкнено' : 'Вимкнено' }}
                                  </span>
                                </button>

                                <!-- Right Pill: "Налаштувати" Button -->
                                <button
                                  type="button"
                                  (click)="toggleCompactDevice(item.device.id)"
                                  class="rounded-full bg-[#152a54]/90 hover:bg-[#1d376e] border border-sky-300/25 px-4 py-2 flex items-center justify-center gap-2 text-slate-100 font-semibold text-xs sm:text-sm transition-all cursor-pointer"
                                  [class.ring-2]="isCompactDeviceExpanded(item.device.id)"
                                  [class.ring-sky-400/50]="isCompactDeviceExpanded(item.device.id)"
                                  title="Налаштування приладу та журнал споживання"
                                >
                                  <mat-icon class="text-base leading-none text-slate-300">settings</mat-icon>
                                  <span class="truncate">Налаштувати</span>
                                </button>
                              </div>
                            </div>

                            <!-- Expandable Settings & Logs Drawer inside Dark Card -->
                            @if (isCompactDeviceExpanded(item.device.id)) {
                              <div class="relative z-10 px-5 py-4 bg-[#071226]/95 border-t border-sky-400/20 space-y-3 text-xs">
                                <!-- Device Management Toolbar -->
                                <div class="flex items-center justify-between gap-2 flex-wrap pb-2 border-b border-white/10">
                                  <span class="font-bold text-sky-300 flex items-center gap-1">
                                    <mat-icon class="text-sm leading-none">tune</mat-icon>
                                    <span>Керування та журнал ({{ item.monthLogs.length }})</span>
                                  </span>
                                  @if (canEdit()) {
                                    <div class="flex items-center gap-1.5 flex-wrap">
                                      <button
                                        type="button"
                                        (click)="openAddDeviceLogModal(item.device.id)"
                                        class="px-2.5 py-1 rounded-lg text-2xs font-bold bg-amber-500 hover:bg-amber-600 text-white transition-colors cursor-pointer flex items-center gap-1"
                                      >
                                        <mat-icon class="text-xs leading-none">add</mat-icon>
                                        <span>+ Запис кВт·г</span>
                                      </button>
                                      <button
                                        type="button"
                                        (click)="openScreenshotModal(item.device.id)"
                                        class="px-2.5 py-1 rounded-lg text-2xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer flex items-center gap-1"
                                      >
                                        <mat-icon class="text-xs leading-none">add_photo_alternate</mat-icon>
                                        <span>Фото (ШІ)</span>
                                      </button>
                                      <button
                                        type="button"
                                        (click)="openEditDeviceModal(item.device)"
                                        class="px-2.5 py-1 rounded-lg text-2xs font-semibold bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer flex items-center gap-1"
                                        title="Змінити назву, потужність або категорію"
                                      >
                                        <mat-icon class="text-xs leading-none">edit</mat-icon>
                                        <span>Параметри</span>
                                      </button>
                                      <button
                                        type="button"
                                        (click)="deleteDevice(item.device.id)"
                                        class="p-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/35 text-rose-300 transition-colors cursor-pointer"
                                        title="Видалити прилад"
                                      >
                                        <mat-icon class="text-xs leading-none">delete</mat-icon>
                                      </button>
                                    </div>
                                  }
                                </div>

                                @if (item.hasAttributedConsumption) {
                                  <div class="p-2.5 rounded-xl bg-emerald-950/70 border border-emerald-500/30 text-2xs text-emerald-200">
                                    Обліковано за примітками контрольних замірів лічильника: <strong class="font-mono">~{{ item.attributedNoteKwh.toFixed(1) }} кВт·г</strong>
                                  </div>
                                }

                                <!-- Logs List -->
                                @if (item.monthLogs.length > 0) {
                                  <div class="max-h-56 overflow-y-auto divide-y divide-white/10 border border-white/10 rounded-xl bg-[#0b1b38]/90">
                                    @for (log of item.monthLogs; track log.id) {
                                      @let logW = getEffectiveLogWeather(log);
                                      <div class="p-2.5 flex items-start justify-between gap-2 text-xs hover:bg-white/5 transition-colors">
                                        <div class="space-y-0.5 min-w-0 flex-1">
                                          <div class="flex items-center gap-1.5 flex-wrap">
                                            <span class="font-bold text-2xs text-white">{{ getDeviceLogDateLabel(log) }}</span>
                                            @if (logW) {
                                              <span class="px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-200 border border-sky-400/30 text-3xs font-mono font-bold inline-flex items-center gap-0.5">
                                                <mat-icon class="text-3xs text-sky-300 leading-none">{{ logW.icon }}</mat-icon>
                                                <span>{{ logW.tempAvgC > 0 ? '+' : '' }}{{ logW.tempAvgC }}°C</span>
                                              </span>
                                            }
                                            <span class="px-1.5 py-0.2 rounded text-3xs font-bold bg-white/10 text-sky-200">
                                              {{ getDeviceLogModeBadge(log) }}
                                            </span>
                                            @if (log.fromScreenshot) {
                                              <span class="px-1 py-0.2 rounded bg-teal-500/25 text-teal-200 text-3xs font-bold">
                                                AI
                                              </span>
                                            }
                                          </div>
                                          @if (log.comment) {
                                            <div class="text-3xs text-slate-300 truncate">
                                              {{ log.comment }}
                                            </div>
                                          }
                                        </div>
                                        <div class="flex items-center gap-1 shrink-0">
                                          <span class="font-mono font-bold text-sky-300 text-xs mr-1">
                                            {{ log.entryMode && log.entryMode !== 'cumulative_month' ? '+' : '' }}{{ log.consumedKwh }} кВт·г
                                          </span>
                                          @if (canEdit()) {
                                            <button
                                              type="button"
                                              (click)="openEditDeviceLogModal(item.device.id, log)"
                                              class="p-1 rounded text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer transition-colors"
                                              title="Редагувати запис"
                                            >
                                              <mat-icon class="text-xs leading-none">edit</mat-icon>
                                            </button>
                                            <button
                                              type="button"
                                              (click)="deleteDeviceLog(item.device.id, log.id)"
                                              class="p-1 rounded text-rose-400 hover:text-rose-200 hover:bg-rose-500/20 cursor-pointer transition-colors"
                                              title="Видалити запис"
                                            >
                                              <mat-icon class="text-xs leading-none">delete</mat-icon>
                                            </button>
                                          }
                                        </div>
                                      </div>
                                    }
                                  </div>
                                } @else if (item.attributedNotes.length > 0) {
                                  <div class="space-y-1.5 border border-emerald-500/30 rounded-xl bg-emerald-950/40 p-2.5">
                                    <div class="text-3xs font-bold text-emerald-300 flex items-center gap-1">
                                      <mat-icon class="text-xs leading-none">psychology</mat-icon>
                                      <span>За примітками контрольних замірів:</span>
                                    </div>
                                    <div class="divide-y divide-emerald-500/20">
                                      @for (an of item.attributedNotes; track an.readingDate + an.rawNote) {
                                        <div class="py-1 flex items-start justify-between gap-1 text-3xs">
                                          <div>
                                            <span class="font-bold text-white">{{ formatDate(an.readingDate) }} • {{ an.hours }} год</span>
                                            <span class="text-slate-300 block">{{ an.explanation }}</span>
                                          </div>
                                          <span class="font-mono font-bold text-emerald-300 shrink-0">~{{ an.kwh.toFixed(1) }} кВт·г</span>
                                        </div>
                                      }
                                    </div>
                                  </div>
                                } @else {
                                  <div class="text-center py-2.5 text-2xs text-slate-400 bg-[#0b1b38]/60 rounded-xl border border-white/10">
                                    За {{ dSummary.monthLabel }} ще немає записів споживання.
                                  </div>
                                }
                              </div>
                            }
                          </div>
                        }
                      </div>
                    </div>
                  } @else {
                    <!-- ============================================== -->
                    <!-- COMPACT LIST VIEW                              -->
                    <!-- ============================================== -->
                    <div class="divide-y divide-slate-100 dark:divide-slate-800/80">
                    @for (item of dSummary.deviceRows; track item.device.id) {
                      <div
                        class="transition-colors"
                        [class.bg-slate-50/60]="isCompactDeviceExpanded(item.device.id)"
                        [class.dark:bg-slate-800/40]="isCompactDeviceExpanded(item.device.id)"
                      >
                        <!-- Ultra-Compact Row Header Bar (~48px) -->
                        <div
                          (click)="toggleCompactDevice(item.device.id)"
                          class="px-3.5 py-2.5 sm:px-4 sm:py-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors select-none"
                        >
                          <!-- Left: Device Icon & Identity Badges -->
                          <div class="flex items-center gap-2.5 min-w-0 flex-1">
                            <div
                              class="w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-2xs shrink-0"
                              [style.background-color]="item.device.color || '#10b981'"
                            >
                              <mat-icon class="text-base">{{ item.device.icon || 'bolt' }}</mat-icon>
                            </div>

                            <div class="min-w-0 flex-1">
                              <div class="flex items-center gap-1.5 flex-wrap">
                                <span class="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                                  {{ item.device.name }}
                                </span>

                                @if (item.isAirConditioner) {
                                  <span
                                    class="px-1.5 py-0.2 rounded text-3xs font-mono font-bold bg-sky-50 dark:bg-sky-950/80 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800"
                                    title="Вказана потужність є максимальною при запуску/нагріві, а в робочому режимі споживання становить 400–800 Вт·г"
                                  >
                                    Макс {{ item.device.powerWatts || 2200 }} Вт • Робочий {{ item.steadyRangeLabel }} (~{{ item.steadyOperatingWatts }} Вт·г)
                                  </span>
                                } @else if (item.device.powerWatts) {
                                  <span class="px-1.5 py-0.2 rounded text-3xs font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                    {{ item.device.powerWatts }} Вт
                                  </span>
                                }
                                @if (item.allLogsCount > 0 && item.avgKwhPerReading > 0) {
                                  <span
                                    class="px-1.5 py-0.2 rounded text-3xs font-mono font-bold bg-teal-50 dark:bg-teal-950/80 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800"
                                    [title]="'Середнє споживання по наявних показах (' + item.allLogsCount + ' записів)'"
                                  >
                                    Сер. по показах: {{ item.avgKwhPerReading.toFixed(2) }} кВт·г
                                  </span>
                                }
                                @if (item.device.batteryCapacityKwh) {
                                  <span class="px-1.5 py-0.2 rounded text-3xs font-mono font-bold bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                    {{ item.device.batteryCapacityKwh }} кВт·г
                                  </span>
                                }
                                @if (item.device.category === 'heating_ac') {
                                  <span class="px-1.5 py-0.2 rounded text-3xs font-bold bg-orange-50 dark:bg-orange-950/80 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800">
                                    Обігрів
                                  </span>
                                }
                                @if (item.device.isNightFriendly) {
                                  <span class="px-1.5 py-0.2 rounded text-3xs font-bold bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                    Ніч
                                  </span>
                                }
                                @if (item.hasAttributedConsumption) {
                                  <span class="px-1.5 py-0.2 rounded text-3xs font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                                    ~{{ item.attributedNoteKwh.toFixed(1) }} кВт·г ШІ
                                  </span>
                                }
                                @if (item.isUnmonitoredCatalogDevice) {
                                  <span class="px-1.5 py-0.2 rounded text-3xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                                    Фонове
                                  </span>
                                }
                                @if (item.usageWarning; as uw) {
                                  <span
                                    class="px-1.5 py-0.2 rounded text-3xs font-extrabold inline-flex items-center gap-0.5 border"
                                    [class.bg-rose-100]="uw.severity === 'critical'"
                                    [class.dark:bg-rose-950/90]="uw.severity === 'critical'"
                                    [class.text-rose-800]="uw.severity === 'critical'"
                                    [class.dark:text-rose-300]="uw.severity === 'critical'"
                                    [class.border-rose-300]="uw.severity === 'critical'"
                                    [class.dark:border-rose-800]="uw.severity === 'critical'"
                                    [class.bg-amber-100]="uw.severity === 'warning'"
                                    [class.dark:bg-amber-950/90]="uw.severity === 'warning'"
                                    [class.text-amber-900]="uw.severity === 'warning'"
                                    [class.dark:text-amber-300]="uw.severity === 'warning'"
                                    [class.border-amber-300]="uw.severity === 'warning'"
                                    [class.dark:border-amber-800]="uw.severity === 'warning'"
                                    [title]="'Споживання перевищує середнє (' + uw.monthlyAverageKwh.toFixed(1) + ' кВт·г) на +' + uw.excessPercent + '%'"
                                  >
                                    <mat-icon class="text-3xs leading-none">warning_amber</mat-icon>
                                    <span>+{{ uw.excessPercent }}% вище сер.</span>
                                  </span>
                                }
                              </div>
                            </div>
                          </div>

                          <!-- Center/Right: Metrics, Share, Forecast, Quick Actions & Chevron -->
                          <div class="flex items-center gap-2.5 sm:gap-3.5 shrink-0">
                            <!-- Month Fact & Cost -->
                            <div class="text-right">
                              <div class="font-mono font-black text-xs sm:text-sm text-slate-900 dark:text-white">
                                {{ item.monthKwh.toFixed(1) }}
                                <span class="text-3xs font-normal text-slate-500 dark:text-slate-400">кВт·г</span>
                              </div>
                              <div class="text-3xs font-bold text-emerald-700 dark:text-emerald-400">
                                {{ item.monthCostUah.toFixed(0) }} грн
                              </div>
                            </div>

                            <!-- Share % & Progress bar -->
                            <div class="hidden sm:flex flex-col items-end w-16 lg:w-20">
                              <div class="text-3xs font-bold text-slate-600 dark:text-slate-300 font-mono">
                                {{ item.shareOfHousePercent.toFixed(1) }}%
                              </div>
                              <div class="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden mt-0.5">
                                <div
                                  class="h-full rounded-full transition-all duration-300"
                                  [style.width.%]="Math.min(100, item.shareOfHousePercent)"
                                  [style.background-color]="item.device.color || '#10b981'"
                                ></div>
                              </div>
                            </div>

                            <!-- Weather Projected -->
                            <div class="hidden md:block text-right">
                              <span
                                class="px-2 py-0.5 rounded-md text-3xs font-mono font-bold bg-amber-50 dark:bg-amber-950/70 text-amber-900 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                                title="Прогноз до кінця місяця з урахуванням погоди"
                              >
                                ⛅ ~{{ item.weatherProjectedMonthKwh.toFixed(0) }} кВт·г
                              </span>
                            </div>

                            <!-- Quick Actions -->
                            @if (canEdit()) {
                              <div class="flex items-center gap-1" (click)="$event.stopPropagation()">
                                <button
                                  type="button"
                                  (click)="openAddDeviceLogModal(item.device.id)"
                                  class="p-1 sm:px-2 sm:py-1 rounded-lg text-3xs font-bold bg-amber-500 hover:bg-amber-600 text-white transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                                  title="Внести споживання кВт·г"
                                >
                                  <mat-icon class="text-xs leading-none">add</mat-icon>
                                  <span class="hidden xl:inline">+ кВт·г</span>
                                </button>

                                <button
                                  type="button"
                                  (click)="openScreenshotModal(item.device.id)"
                                  class="p-1 sm:px-2 sm:py-1 rounded-lg text-3xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                                  title="Завантажити скріншот"
                                >
                                  <mat-icon class="text-xs leading-none">add_photo_alternate</mat-icon>
                                  <span class="hidden xl:inline">Фото</span>
                                </button>

                                <button
                                  type="button"
                                  (click)="openEditDeviceModal(item.device)"
                                  class="p-1 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                  title="Редагувати пристрій"
                                >
                                  <mat-icon class="text-xs leading-none">edit</mat-icon>
                                </button>

                                <button
                                  type="button"
                                  (click)="deleteDevice(item.device.id)"
                                  class="p-1 rounded-lg text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/60 transition-colors cursor-pointer"
                                  title="Видалити пристрій"
                                >
                                  <mat-icon class="text-xs leading-none">delete</mat-icon>
                                </button>
                              </div>
                            }

                            <!-- Expand Chevron -->
                            <button
                              type="button"
                              (click)="$event.stopPropagation(); toggleCompactDevice(item.device.id)"
                              class="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                              [title]="isCompactDeviceExpanded(item.device.id) ? 'Згорнути деталі' : 'Розгорнути деталі'"
                            >
                              <mat-icon class="text-base leading-none transition-transform duration-200" [class.rotate-180]="isCompactDeviceExpanded(item.device.id)">
                                expand_more
                              </mat-icon>
                            </button>
                          </div>
                        </div>

                        <!-- ============================================== -->
                        <!-- EXPANDED DETAILS DRAWER FOR THIS DEVICE        -->
                        <!-- ============================================== -->
                        @if (isCompactDeviceExpanded(item.device.id)) {
                          <div class="px-4 py-4 sm:p-5 bg-slate-50/80 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 space-y-4">
                            <!-- Attributed Note or Unmonitored Banner -->
                            @if (item.hasAttributedConsumption) {
                              <div class="p-2.5 rounded-xl bg-emerald-50/90 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-2xs space-y-1">
                                <div class="flex items-center justify-between text-emerald-900 dark:text-emerald-200 font-bold">
                                  <span class="flex items-center gap-1">
                                    <mat-icon class="text-xs text-emerald-600 dark:text-emerald-400 leading-none">psychology</mat-icon>
                                    <span>Обліковано за контрольними замірами лічильника:</span>
                                  </span>
                                  <span class="font-mono text-emerald-700 dark:text-emerald-300">~{{ item.attributedNoteKwh.toFixed(1) }} кВт·г</span>
                                </div>
                                <p class="text-3xs text-emerald-800/90 dark:text-emerald-300/90">
                                  Споживання розраховано за примітками до контрольних замірів для цього приладу ({{ item.attributedNotes.length }} замір(и)).
                                </p>
                              </div>
                            } @else if (item.isUnmonitoredCatalogDevice) {
                              <div class="p-2.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-3xs text-slate-600 dark:text-slate-300 space-y-0.5">
                                <div class="font-bold flex items-center gap-1 text-slate-800 dark:text-slate-200">
                                  <mat-icon class="text-xs text-indigo-500 leading-none">info</mat-icon>
                                  <span>Споживання не ведеться окремо</span>
                                </div>
                                <p class="text-slate-500 dark:text-slate-400">
                                  Прилад враховано у фоновому споживанні будинку (номінал {{ item.device.powerWatts || 1200 }} Вт). Вказуйте години роботи у примітках контрольних замірів для авто-розрахунку.
                                </p>
                              </div>
                            }

                            <!-- Full 4-Column Metrics Grid & Progress Bar -->
                            <div class="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700 space-y-2.5">
                              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                <div>
                                  <div class="text-3xs font-semibold uppercase text-slate-400 dark:text-slate-400">Спожито за місяць</div>
                                  <div class="text-base sm:text-lg font-black font-mono text-slate-900 dark:text-white">
                                    {{ item.monthKwh.toFixed(2) }}
                                    <span class="text-3xs font-normal text-slate-500 dark:text-slate-400">кВт·г</span>
                                  </div>
                                  <div class="text-2xs font-bold text-emerald-700 dark:text-emerald-400">
                                    {{ item.monthCostUah.toFixed(2) }} грн
                                  </div>
                                </div>

                                <div>
                                  <div class="text-3xs font-semibold uppercase text-slate-400 dark:text-slate-400">Середньодобово</div>
                                  <div class="text-sm sm:text-base font-bold font-mono text-slate-800 dark:text-slate-200">
                                    {{ item.dailyPaceKwh.toFixed(2) }}
                                    <span class="text-3xs font-normal text-slate-500 dark:text-slate-400">кВт·г/д</span>
                                  </div>
                                  @if (item.estimatedHoursPerDay !== null) {
                                    <div class="text-3xs text-slate-500 dark:text-slate-400">
                                      ~{{ item.estimatedHoursPerDay.toFixed(1) }} год/добу {{ item.isAirConditioner ? '(робочий ' + item.steadyOperatingWatts + ' Вт·г)' : 'роботи' }}
                                    </div>
                                  }
                                </div>

                                <div>
                                  <div class="text-3xs font-semibold uppercase text-slate-400 dark:text-slate-400">Середнє по показах</div>
                                  @if (item.allLogsCount > 0) {
                                    <div class="text-sm sm:text-base font-bold font-mono text-teal-800 dark:text-teal-300">
                                      {{ item.avgKwhPerReading.toFixed(2) }}
                                      <span class="text-3xs font-normal text-teal-700 dark:text-teal-400">кВт·г/показ</span>
                                    </div>
                                    <div class="text-3xs text-slate-500 dark:text-slate-400">
                                      За {{ item.allLogsCount }} показ(ами)
                                      @if (item.monthLogs.length > 0) {
                                        <span>• міс.: {{ item.monthAvgKwhPerReading.toFixed(2) }} кВт·г</span>
                                      }
                                    </div>
                                  } @else {
                                    <div class="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
                                      Немає показів
                                    </div>
                                  }
                                  @if (item.isAirConditioner) {
                                    <div class="text-3xs font-semibold text-sky-700 dark:text-sky-300 mt-0.5">
                                      Пік {{ item.device.powerWatts || 2200 }} Вт → Роб. {{ item.steadyRangeLabel }}
                                    </div>
                                  }
                                </div>

                                <div>
                                  <div class="text-3xs font-semibold uppercase text-slate-400 dark:text-slate-400">Прогноз (з погодою)</div>
                                  <div class="text-sm sm:text-base font-bold font-mono text-amber-800 dark:text-amber-300">
                                    {{ item.weatherProjectedMonthKwh.toFixed(1) }}
                                    <span class="text-3xs font-normal text-amber-700 dark:text-amber-400">кВт·г</span>
                                  </div>
                                  <div class="text-2xs font-semibold text-amber-700 dark:text-amber-400">
                                    ~{{ item.weatherProjectedMonthCostUah.toFixed(0) }} грн
                                    @if (Math.abs(item.weatherProjectedMonthKwh - item.projectedMonthKwh) >= 0.4) {
                                      <span class="text-3xs text-slate-500 dark:text-slate-400 block font-normal">
                                        (лін.: {{ item.projectedMonthKwh.toFixed(1) }} кВт·г)
                                      </span>
                                    }
                                  </div>
                                </div>
                              </div>

                              <!-- Share Progress Bar -->
                              <div class="space-y-1 pt-1 border-t border-slate-100 dark:border-slate-800">
                                <div class="flex items-center justify-between text-3xs font-semibold">
                                  <span class="text-slate-600 dark:text-slate-400">Частка від споживання будинку</span>
                                  <span class="font-mono font-bold text-slate-900 dark:text-white">{{ item.shareOfHousePercent.toFixed(1) }}%</span>
                                </div>
                                <div class="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                                  <div
                                    class="h-full rounded-full transition-all duration-500"
                                    [style.width.%]="Math.min(100, item.shareOfHousePercent)"
                                    [style.background-color]="item.device.color || '#10b981'"
                                  ></div>
                                </div>
                              </div>
                            </div>

                            <!-- Logs History Section for this Device -->
                            <div class="space-y-2">
                              <div class="flex items-center justify-between text-2xs font-bold text-slate-700 dark:text-slate-300">
                                <span>Журнал записів за {{ dSummary.monthLabel }} ({{ item.monthLogs.length }} запис(ів)):</span>
                                @if (canEdit()) {
                                  <div class="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      (click)="openAddDeviceLogModal(item.device.id)"
                                      class="px-2 py-1 rounded-lg text-3xs font-bold bg-amber-500 hover:bg-amber-600 text-white transition-colors cursor-pointer flex items-center gap-0.5"
                                    >
                                      <mat-icon class="text-xs leading-none">add</mat-icon>
                                      <span>Додати запис</span>
                                    </button>
                                    <button
                                      type="button"
                                      (click)="openScreenshotModal(item.device.id)"
                                      class="px-2 py-1 rounded-lg text-3xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer flex items-center gap-0.5"
                                    >
                                      <mat-icon class="text-xs leading-none">add_photo_alternate</mat-icon>
                                      <span>Скріншот</span>
                                    </button>
                                  </div>
                                }
                              </div>

                              @if (item.monthLogs.length > 0) {
                                <div class="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900">
                                  @for (log of item.monthLogs; track log.id) {
                                    @let logW = getEffectiveLogWeather(log);
                                    <div class="p-2.5 flex items-start justify-between gap-2 text-xs hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                                      <div class="space-y-1 min-w-0 flex-1">
                                        <div class="flex items-center gap-1.5 flex-wrap">
                                          <span class="font-bold text-slate-900 dark:text-slate-100">{{ getDeviceLogDateLabel(log) }}</span>
                                          @if (logW) {
                                            <span
                                              class="px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-950/90 text-sky-900 dark:text-sky-200 border border-sky-200 dark:border-sky-800 text-3xs font-mono font-bold inline-flex items-center gap-1"
                                              [title]="'Погода на ' + log.date + ': ' + logW.condition + ' (від ' + logW.tempMinC + '°C до ' + logW.tempMaxC + '°C)'"
                                            >
                                              <mat-icon class="text-3xs text-sky-600 dark:text-sky-300 leading-none">{{ logW.icon }}</mat-icon>
                                              <span>{{ logW.tempAvgC > 0 ? '+' : '' }}{{ logW.tempAvgC }}°C ({{ logW.condition }})</span>
                                            </span>
                                          }
                                          <span
                                            class="px-1.5 py-0.2 rounded text-3xs font-bold"
                                            [class.bg-emerald-100]="log.entryMode === 'cumulative_month' || !log.entryMode"
                                            [class.text-emerald-800]="log.entryMode === 'cumulative_month' || !log.entryMode"
                                            [class.bg-sky-100]="log.entryMode === 'single_day'"
                                            [class.text-sky-800]="log.entryMode === 'single_day'"
                                            [class.bg-indigo-100]="log.entryMode === 'period_range'"
                                            [class.text-indigo-800]="log.entryMode === 'period_range'"
                                            [class.bg-amber-100]="log.entryMode === 'delta'"
                                            [class.text-amber-800]="log.entryMode === 'delta'"
                                          >
                                            {{ getDeviceLogModeBadge(log) }}
                                          </span>
                                          @if (log.tariffSelection) {
                                            <span
                                              class="px-1.5 py-0.2 rounded text-3xs font-bold"
                                              [class.bg-indigo-100]="log.tariffSelection === 'night_only'"
                                              [class.text-indigo-800]="log.tariffSelection === 'night_only'"
                                              [class.bg-amber-100]="log.tariffSelection === 'day_only'"
                                              [class.text-amber-800]="log.tariffSelection === 'day_only'"
                                              [class.bg-slate-100]="log.tariffSelection === 'auto_time'"
                                              [class.text-slate-700]="log.tariffSelection === 'auto_time'"
                                            >
                                              {{ getDeviceLogTariffBadge(log) }}
                                            </span>
                                          }
                                          @if (log.startTime || log.endTime || log.durationHours) {
                                            <span class="px-1.5 py-0.2 rounded bg-slate-200/80 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-3xs font-mono font-semibold flex items-center gap-0.5">
                                              <mat-icon class="text-3xs leading-none">schedule</mat-icon>
                                              <span>{{ getDeviceLogTimeIntervalBadge(log) }}</span>
                                            </span>
                                          }
                                          @if (log.fromScreenshot) {
                                            <span class="px-1.5 py-0.2 rounded bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-200 text-3xs font-bold flex items-center gap-0.5">
                                              <mat-icon class="text-3xs leading-none">auto_awesome</mat-icon>
                                              <span>AI Скріншот</span>
                                            </span>
                                          }
                                        </div>
                                        @if (log.comment) {
                                          <div class="text-2xs text-slate-700 dark:text-slate-300">
                                            <span class="font-semibold text-slate-500 dark:text-slate-400">Коментар:</span> {{ log.comment }}
                                          </div>
                                        }
                                        @if (log.aiExplanation) {
                                          <div class="text-3xs text-teal-800 dark:text-teal-200 bg-teal-50/80 dark:bg-teal-950/60 px-2 py-1 rounded border border-teal-200/70 dark:border-teal-800 mt-1">
                                            <span class="font-bold">AI:</span> {{ log.aiExplanation }}
                                          </div>
                                        }
                                      </div>
                                      <div class="flex items-center gap-1.5 shrink-0">
                                        <span class="font-mono font-bold text-slate-900 dark:text-white text-sm mr-1">
                                          {{ log.entryMode && log.entryMode !== 'cumulative_month' ? '+' : '' }}{{ log.consumedKwh }} кВт·г
                                        </span>
                                        @if (canEdit()) {
                                          <button
                                            type="button"
                                            (click)="openEditDeviceLogModal(item.device.id, log)"
                                            class="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-100 hover:bg-indigo-50 dark:hover:bg-indigo-900/70 hover:text-indigo-700 dark:hover:text-indigo-200 cursor-pointer transition-colors inline-flex items-center gap-1 text-3xs font-semibold shadow-2xs"
                                            title="Редагувати запис"
                                          >
                                            <mat-icon class="text-xs leading-none">edit</mat-icon>
                                            <span class="hidden sm:inline">Ред.</span>
                                          </button>
                                          <button
                                            type="button"
                                            (click)="deleteDeviceLog(item.device.id, log.id)"
                                            class="px-2 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/90 border border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-200 hover:bg-rose-100 dark:hover:bg-rose-900 cursor-pointer transition-colors inline-flex items-center gap-1 text-3xs font-semibold shadow-2xs"
                                            title="Видалити запис"
                                          >
                                            <mat-icon class="text-xs leading-none">delete</mat-icon>
                                            <span class="hidden sm:inline">Видалити</span>
                                          </button>
                                        }
                                      </div>
                                    </div>
                                  }
                                </div>
                              } @else if (item.attributedNotes.length > 0) {
                                <div class="space-y-2 border border-emerald-200 dark:border-emerald-800 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/40 p-2.5">
                                  <div class="text-3xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                                    <mat-icon class="text-xs leading-none">psychology</mat-icon>
                                    <span>Розраховано за примітками контрольних замірів лічильника:</span>
                                  </div>
                                  <div class="divide-y divide-emerald-200/60 dark:divide-emerald-800/60">
                                    @for (an of item.attributedNotes; track an.readingDate + an.rawNote) {
                                      <div class="py-1.5 flex items-start justify-between gap-2 text-2xs">
                                        <div>
                                          <div class="font-bold text-slate-900 dark:text-slate-100">{{ formatDate(an.readingDate) }} • {{ an.hours }} год роботи</div>
                                          <div class="text-3xs text-slate-600 dark:text-slate-300">Примітка: «{{ an.rawNote }}»</div>
                                          <div class="text-3xs text-emerald-700 dark:text-emerald-300 mt-0.5">{{ an.explanation }}</div>
                                        </div>
                                        <span class="font-mono font-bold text-emerald-800 dark:text-emerald-300 shrink-0">~{{ an.kwh.toFixed(1) }} кВт·г</span>
                                      </div>
                                    }
                                  </div>
                                </div>
                              } @else {
                                <div class="text-center py-3 text-2xs text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                                  За {{ dSummary.monthLabel }} ще немає записів споживання для цього пристрою.
                                </div>
                              }
                            </div>
                          </div>
                        }
                      </div>
                    }
                  </div>
                }
              } @else {
                  <!-- Empty State when no devices added yet -->
                  <div class="p-8 text-center rounded-2xl bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 space-y-3 m-4">
                    <div class="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                      <mat-icon class="text-3xl">electrical_services</mat-icon>
                    </div>
                    <div>
                      <h4 class="text-sm font-bold text-slate-800 dark:text-slate-200">Ще не додано жодного електроприладу</h4>
                      <p class="text-xs text-slate-500 dark:text-slate-400 max-w-lg mx-auto mt-1">
                        Додайте бойлер, кондиціонер, пральну машину, обігрівач або розумну розетку, щоб фіксувати спожиту електроенергію на конкретну дату або розпізнавати її зі скріншотів за допомогою ШІ.
                      </p>
                    </div>
                    @if (canEdit()) {
                      <div class="flex items-center justify-center gap-2.5 flex-wrap pt-2">
                        <button
                          type="button"
                          (click)="openDeviceModal()"
                          class="px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        >
                          <mat-icon class="text-base leading-none">add</mat-icon>
                          <span>Додати перший пристрій</span>
                        </button>
                        <button
                          type="button"
                          (click)="openScreenshotModal()"
                          class="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        >
                          <mat-icon class="text-base leading-none">add_photo_alternate</mat-icon>
                          <span>Завантажити скріншот з коментарем (ШІ)</span>
                        </button>
                      </div>
                    }
                  </div>
                }
              }
            </div>

            <!-- ======================================================== -->
            <!-- CHARTS, BREAKDOWN & FORECAST ANALYTICS                   -->
            <!-- ======================================================== -->
            @if (dSummary.deviceRows.length > 0) {
              <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
                <!-- Left 7 cols: Visual Structure & SVG Forecast Chart -->
                <div class="lg:col-span-7 p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs space-y-4">
                  <div class="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                    <div class="flex items-center gap-2.5">
                      <button
                        type="button"
                        (click)="isChartsSectionExpanded.update(v => !v)"
                        class="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0 cursor-pointer hover:bg-emerald-500/25 transition-colors"
                        [title]="isChartsSectionExpanded() ? 'Згорнути графік структури' : 'Розгорнути графік структури'"
                      >
                        <mat-icon class="text-lg leading-none transition-transform duration-200" [class.rotate-180]="!isChartsSectionExpanded()">
                          expand_more
                        </mat-icon>
                      </button>
                      <div>
                        <h4
                          class="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-1.5 cursor-pointer hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                          (click)="isChartsSectionExpanded.update(v => !v)"
                        >
                          <mat-icon class="text-emerald-600 dark:text-emerald-400 text-lg">pie_chart</mat-icon>
                          <span>Структура споживання та прогноз</span>
                        </h4>
                        <p class="text-2xs text-slate-500 dark:text-slate-400">
                          Порівняння споживання пристроїв із загальним показником будинку
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      (click)="isChartsSectionExpanded.update(v => !v)"
                      class="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                      [title]="isChartsSectionExpanded() ? 'Згорнути' : 'Розгорнути'"
                    >
                      <mat-icon class="text-base leading-none">
                        {{ isChartsSectionExpanded() ? 'expand_less' : 'expand_more' }}
                      </mat-icon>
                    </button>
                  </div>

                  @if (isChartsSectionExpanded()) {
                    <!-- Multi-segment Stacked Bar (All Devices + Untracked) -->
                    <div class="space-y-2">
                      <div class="flex items-center justify-between text-2xs font-semibold text-slate-600 dark:text-slate-400">
                        <span>Розподіл спожитих {{ dSummary.houseReferenceKwh.toFixed(1) }} кВт·год за {{ dSummary.monthLabel }}</span>
                        <span>100% ({{ dSummary.houseReferenceCostUah.toFixed(0) }} грн)</span>
                      </div>
                      <div class="w-full h-5 rounded-xl bg-slate-100 dark:bg-slate-800 overflow-hidden flex border border-slate-200 dark:border-slate-700 p-0.5 gap-0.5">
                        @for (item of dSummary.deviceRows; track item.device.id) {
                          @if (item.shareOfHousePercent > 0) {
                            <div
                              class="h-full first:rounded-l-lg last:rounded-r-lg transition-all duration-500"
                              [style.width.%]="Math.max(2, item.shareOfHousePercent)"
                              [style.background-color]="item.device.color || '#10b981'"
                              [title]="item.device.name + ': ' + item.monthKwh.toFixed(2) + ' кВт·год (' + item.shareOfHousePercent.toFixed(1) + '%)'"
                            ></div>
                          }
                        }
                        @if (dSummary.untrackedSharePercent > 0) {
                          <div
                            class="h-full bg-slate-300 dark:bg-slate-600 last:rounded-r-lg transition-all duration-500"
                            [style.width.%]="dSummary.untrackedSharePercent"
                            [title]="'Інші прилади (поза моніторингом): ' + dSummary.untrackedKwh.toFixed(2) + ' кВт·год (' + dSummary.untrackedSharePercent.toFixed(1) + '%)'"
                          ></div>
                        }
                      </div>
                      <!-- Legend -->
                      <div class="flex items-center gap-3 flex-wrap pt-1">
                        @for (item of dSummary.deviceRows; track item.device.id) {
                          <div class="flex items-center gap-1.5 text-2xs">
                            <span class="w-2.5 h-2.5 rounded-xs shrink-0" [style.background-color]="item.device.color || '#10b981'"></span>
                            <span class="font-semibold text-slate-700 dark:text-slate-300">{{ item.device.name }}</span>
                            <span class="font-mono text-slate-500 dark:text-slate-400">({{ item.shareOfHousePercent.toFixed(1) }}%)</span>
                          </div>
                        }
                        <div class="flex items-center gap-1.5 text-2xs">
                          <span class="w-2.5 h-2.5 rounded-xs bg-slate-300 dark:bg-slate-600 shrink-0"></span>
                          <span class="font-semibold text-slate-600 dark:text-slate-400">Інші прилади (фонове)</span>
                          <span class="font-mono text-slate-500 dark:text-slate-400">({{ dSummary.untrackedSharePercent.toFixed(1) }}%)</span>
                        </div>
                      </div>
                    </div>

                    <!-- SVG Grouped Bar Chart: Fact vs End-of-Month Forecast per Device -->
                    <div class="pt-2 space-y-2">
                      <div class="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                        <span>Графік: Спожито на дату vs Прогноз до кінця місяця (кВт·год)</span>
                        <div class="flex items-center gap-3 text-3xs font-semibold">
                          <span class="flex items-center gap-1">
                            <span class="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block"></span> Факт на дату
                          </span>
                          <span class="flex items-center gap-1">
                            <span class="w-2.5 h-2.5 rounded-xs bg-amber-300 border border-amber-500 inline-block"></span> Прогноз ({{ dSummary.daysInMonth }} дн.)
                          </span>
                        </div>
                      </div>

                      <div class="w-full overflow-x-auto bg-slate-50/70 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700 p-3">
                        <svg
                          [attr.viewBox]="'0 0 600 ' + (Math.max(1, dSummary.deviceRows.length + 1) * 44 + 20)"
                          class="w-full h-auto min-w-[440px]"
                        >
                          @for (item of dSummary.deviceRows; track item.device.id; let idx = $index) {
                            @let yPos = idx * 44 + 12;
                            @let factW = dSummary.maxChartKwh > 0 ? Math.max(4, (item.monthKwh / dSummary.maxChartKwh) * 340) : 4;
                            @let projW = dSummary.maxChartKwh > 0 ? Math.max(4, (item.projectedMonthKwh / dSummary.maxChartKwh) * 340) : 4;
                            <!-- Device label -->
                            <text
                              x="4"
                              [attr.y]="yPos + 15"
                              class="fill-slate-800 dark:fill-slate-200 text-[11px] font-bold"
                            >
                              {{ item.device.name.length > 18 ? item.device.name.slice(0, 18) + '…' : item.device.name }}
                            </text>
                            <text
                              x="4"
                              [attr.y]="yPos + 29"
                              class="fill-slate-400 dark:fill-slate-400 text-[9px] font-mono"
                            >
                              ~{{ item.dailyPaceKwh.toFixed(2) }} кВт·г/д ({{ item.shareOfHousePercent.toFixed(0) }}%)
                            </text>

                            <!-- Projected bar (background) -->
                            <rect
                              x="145"
                              [attr.y]="yPos + 4"
                              [attr.width]="projW"
                              height="24"
                              rx="6"
                              fill="#fde68a"
                              stroke="#f59e0b"
                              stroke-width="1"
                              stroke-dasharray="3 2"
                            />
                            <!-- Actual bar (foreground) -->
                            <rect
                              x="145"
                              [attr.y]="yPos + 4"
                              [attr.width]="factW"
                              height="24"
                              rx="6"
                              [attr.fill]="item.device.color || '#10b981'"
                            />

                            <!-- Value label -->
                            <text
                              [attr.x]="153 + Math.max(factW, projW)"
                              [attr.y]="yPos + 20"
                              class="fill-slate-800 dark:fill-slate-200 text-[10px] font-mono font-bold"
                            >
                              {{ item.monthKwh.toFixed(1) }} → {{ item.projectedMonthKwh.toFixed(1) }} кВт·г ({{ item.projectedMonthCostUah.toFixed(0) }} грн)
                            </text>
                          }

                          <!-- Untracked row -->
                          @let unY = dSummary.deviceRows.length * 44 + 12;
                          @let unFactW = dSummary.maxChartKwh > 0 ? Math.max(4, (dSummary.untrackedKwh / dSummary.maxChartKwh) * 340) : 4;
                          @let unProjW = dSummary.maxChartKwh > 0 ? Math.max(4, (dSummary.projectedUntrackedMonthKwh / dSummary.maxChartKwh) * 340) : 4;
                          <text x="4" [attr.y]="unY + 15" class="fill-slate-600 dark:fill-slate-300 text-[11px] font-semibold">
                            Інші прилади (фонове)
                          </text>
                          <text x="4" [attr.y]="unY + 29" class="fill-slate-400 text-[9px] font-mono">
                            поза моніторингом ({{ dSummary.untrackedSharePercent.toFixed(0) }}%)
                          </text>
                          <rect
                            x="145"
                            [attr.y]="unY + 4"
                            [attr.width]="unProjW"
                            height="22"
                            rx="6"
                            fill="#e2e8f0"
                            stroke="#94a3b8"
                            stroke-width="1"
                            stroke-dasharray="3 2"
                          />
                          <rect
                            x="145"
                            [attr.y]="unY + 4"
                            [attr.width]="unFactW"
                            height="22"
                            rx="6"
                            fill="#64748b"
                          />
                          <text
                            [attr.x]="153 + Math.max(unFactW, unProjW)"
                            [attr.y]="unY + 19"
                            class="fill-slate-600 dark:fill-slate-300 text-[10px] font-mono font-semibold"
                          >
                            {{ dSummary.untrackedKwh.toFixed(1) }} → {{ dSummary.projectedUntrackedMonthKwh.toFixed(1) }} кВт·г
                          </text>
                        </svg>
                      </div>
                    </div>

                    <!-- Daily Timeline Progression -->
                    @if (dSummary.dateProgressionPoints.length > 0) {
                      <div class="pt-2 space-y-2 border-t border-slate-100 dark:border-slate-800">
                        <div class="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <mat-icon class="text-sm text-indigo-600 dark:text-indigo-400 leading-none">timeline</mat-icon>
                          <span>Динаміка внесеного споживання пристроїв по датах місяця</span>
                        </div>
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          @for (pt of dSummary.dateProgressionPoints; track pt.date) {
                            <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700">
                              <div class="text-3xs font-semibold text-slate-500 dark:text-slate-400">{{ formatDate(pt.date) }}</div>
                              <div class="text-sm font-black font-mono text-slate-900 dark:text-white mt-0.5">
                                {{ pt.cumulativeDevicesKwh.toFixed(2) }} <span class="text-3xs font-normal">кВт·г</span>
                              </div>
                              <div class="text-3xs text-emerald-700 dark:text-emerald-400 font-medium truncate" [title]="pt.devicesSummary">
                                {{ pt.devicesSummary }}
                              </div>
                            </div>
                          }
                        </div>
                      </div>
                    }
                  } @else {
                    <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-2xs text-slate-600 dark:text-slate-300 flex items-center justify-between gap-2">
                      <span>Розподіл: прилади {{ dSummary.totalDevicesKwh.toFixed(1) }} кВт·г ({{ dSummary.devicesSharePercent.toFixed(0) }}%) vs інші {{ dSummary.untrackedKwh.toFixed(1) }} кВт·г</span>
                      <button
                        type="button"
                        (click)="isChartsSectionExpanded.set(true)"
                        class="text-3xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                      >
                        Розгорнути графік
                      </button>
                    </div>
                  }
                </div>

                <!-- Right 5 cols: Smart Analysis, Insights & Forecast Recommendations -->
                <div class="lg:col-span-5 p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs flex flex-col justify-between space-y-4">
                  <div class="space-y-4">
                    <div class="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                      <div class="flex items-center gap-2.5">
                        <button
                          type="button"
                          (click)="isInsightsSectionExpanded.update(v => !v)"
                          class="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 cursor-pointer hover:bg-amber-500/25 transition-colors"
                          [title]="isInsightsSectionExpanded() ? 'Згорнути інсайти' : 'Розгорнути інсайти'"
                        >
                          <mat-icon class="text-lg leading-none transition-transform duration-200" [class.rotate-180]="!isInsightsSectionExpanded()">
                            expand_more
                          </mat-icon>
                        </button>
                        <div>
                          <h4
                            class="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-1.5 cursor-pointer hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                            (click)="isInsightsSectionExpanded.update(v => !v)"
                          >
                            <mat-icon class="text-amber-500 text-lg">lightbulb</mat-icon>
                            <span>Аналіз та прогнози</span>
                          </h4>
                          <p class="text-2xs text-slate-500 dark:text-slate-400">
                            Висновки на основі показів лічильника та приладів
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        (click)="isInsightsSectionExpanded.update(v => !v)"
                        class="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                        [title]="isInsightsSectionExpanded() ? 'Згорнути' : 'Розгорнути'"
                      >
                        <mat-icon class="text-base leading-none">
                          {{ isInsightsSectionExpanded() ? 'expand_less' : 'expand_more' }}
                        </mat-icon>
                      </button>
                    </div>

                    @if (isInsightsSectionExpanded()) {
                      <div class="space-y-3">
                        @for (insight of dSummary.insights; track insight.title) {
                          <div
                            class="p-3.5 rounded-xl border space-y-1"
                            [class.bg-amber-50/70]="insight.tone === 'amber'"
                            [class.dark:bg-amber-950/30]="insight.tone === 'amber'"
                            [class.border-amber-200]="insight.tone === 'amber'"
                            [class.dark:border-amber-800]="insight.tone === 'amber'"
                            [class.bg-emerald-50/70]="insight.tone === 'emerald'"
                            [class.dark:bg-emerald-950/30]="insight.tone === 'emerald'"
                            [class.border-emerald-200]="insight.tone === 'emerald'"
                            [class.dark:border-emerald-800]="insight.tone === 'emerald'"
                            [class.bg-indigo-50/70]="insight.tone === 'indigo'"
                            [class.dark:bg-indigo-950/30]="insight.tone === 'indigo'"
                            [class.border-indigo-200]="insight.tone === 'indigo'"
                            [class.dark:border-indigo-800]="insight.tone === 'indigo'"
                            [class.bg-rose-50/70]="insight.tone === 'rose'"
                            [class.dark:bg-rose-950/30]="insight.tone === 'rose'"
                            [class.border-rose-200]="insight.tone === 'rose'"
                            [class.dark:border-rose-800]="insight.tone === 'rose'"
                          >
                            <div class="flex items-center justify-between gap-2">
                              <div class="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
                                <mat-icon
                                  class="text-base leading-none"
                                  [class.text-amber-600]="insight.tone === 'amber'"
                                  [class.text-emerald-600]="insight.tone === 'emerald'"
                                  [class.text-indigo-600]="insight.tone === 'indigo'"
                                  [class.text-rose-600]="insight.tone === 'rose'"
                                >
                                  {{ insight.icon }}
                                </mat-icon>
                                <span>{{ insight.title }}</span>
                              </div>
                              @if (insight.badge) {
                                <span class="px-2.5 py-0.5 rounded-full text-3xs font-mono font-extrabold bg-slate-900 dark:bg-slate-950 text-amber-300 dark:text-emerald-300 border border-slate-700 shrink-0 shadow-2xs">
                                  {{ insight.badge }}
                                </span>
                              }
                            </div>
                            <p class="text-2xs text-slate-700 dark:text-slate-200 leading-relaxed">
                              {{ insight.description }}
                            </p>
                          </div>
                        }
                      </div>
                    } @else {
                      <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-2xs text-slate-600 dark:text-slate-300 flex items-center justify-between gap-2">
                        <span>{{ dSummary.insights.length }} AI-інсайтів сформовано для цього будинку</span>
                        <button
                          type="button"
                          (click)="isInsightsSectionExpanded.set(true)"
                          class="text-3xs font-semibold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                        >
                          Розгорнути інсайти
                        </button>
                      </div>
                    }
                  </div>

                  <!-- Quick CTA to upload screenshot -->
                  @if (canEdit()) {
                    <div class="p-3.5 rounded-xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-transparent border border-emerald-500/20 flex items-center justify-between gap-3">
                      <div class="text-2xs text-slate-700 dark:text-slate-300">
                        <span class="font-bold text-slate-900 dark:text-white block">Маєте скріншот з додатка розумної розетки?</span>
                        Завантажте фото та додайте коментар — ШІ сам порахує кВт·год і додасть до приладу.
                      </div>
                      <button
                        type="button"
                        (click)="openScreenshotModal()"
                        class="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-2xs font-bold flex items-center gap-1 shrink-0 cursor-pointer shadow-2xs"
                      >
                        <mat-icon class="text-sm leading-none">add_photo_alternate</mat-icon>
                        <span>Аналіз фото</span>
                      </button>
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        } @else if (activeTab() === 'analytics') {
          <!-- Charts Section -->
          <div class="p-4 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs space-y-4">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div class="flex items-center gap-2.5">
                <button
                  type="button"
                  (click)="isAnalyticsChartExpanded.update(v => !v)"
                  class="w-8 h-8 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-700 dark:text-indigo-400 flex items-center justify-center shrink-0 cursor-pointer hover:bg-indigo-500/25 transition-colors"
                  [title]="isAnalyticsChartExpanded() ? 'Згорнути аналітику' : 'Розгорнути аналітику'"
                >
                  <mat-icon class="text-lg leading-none transition-transform duration-200" [class.rotate-180]="!isAnalyticsChartExpanded()">
                    expand_more
                  </mat-icon>
                </button>
                <div>
                  <h3
                    class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                    (click)="isAnalyticsChartExpanded.update(v => !v)"
                  >
                    <mat-icon class="text-indigo-600 dark:text-indigo-400">query_stats</mat-icon>
                    <span>Аналітика споживання та тенденцій</span>
                  </h3>
                  <p class="text-xs text-slate-500 dark:text-slate-400">
                    Аналіз темпу кВт·г/добу, контроль лімітів та перевірка ефективності 2-зонного тарифу
                  </p>
                </div>
              </div>

              <div class="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  (click)="activeTab.set('devices')"
                  class="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <mat-icon class="text-sm text-emerald-600 dark:text-emerald-400">electrical_services</mat-icon>
                  <span>Пристрої ({{ accountDevices().length }})</span>
                </button>
                @if (canEdit()) {
                  <button
                    type="button"
                    (click)="openReadingModal(true)"
                    class="px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <mat-icon class="text-sm text-indigo-600 dark:text-indigo-400">visibility</mat-icon>
                    <span>+ Контрольний замір</span>
                  </button>
                }
                <button
                  type="button"
                  (click)="isAnalyticsChartExpanded.update(v => !v)"
                  class="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                  [title]="isAnalyticsChartExpanded() ? 'Згорнути' : 'Розгорнути'"
                >
                  <mat-icon class="text-base leading-none">
                    {{ isAnalyticsChartExpanded() ? 'expand_less' : 'expand_more' }}
                  </mat-icon>
                </button>
              </div>
            </div>

            @if (isAnalyticsChartExpanded()) {
              <app-electricity-chart
                [timeline]="electricityTimelineData()"
                [monthly]="electricityMonthlyData()"
                [stats]="electricityStatsKPIs()"
              />
            } @else {
              <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-2xs text-slate-600 dark:text-slate-300 flex items-center justify-between gap-2">
                <span>Графіки помісячного споживання та аналітики зон згорнуто для економії місця.</span>
                <button
                  type="button"
                  (click)="isAnalyticsChartExpanded.set(true)"
                  class="text-3xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  Розгорнути графіки
                </button>
              </div>
            }
          </div>
        } @else {
          <!-- Readings History Section -->
          <div class="p-4 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs space-y-4">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div class="flex items-center gap-2.5">
                <button
                  type="button"
                  (click)="isHistoryTableExpanded.update(v => !v)"
                  class="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0 cursor-pointer hover:bg-amber-500/25 transition-colors"
                  [title]="isHistoryTableExpanded() ? 'Згорнути історію показів' : 'Розгорнути історію показів'"
                >
                  <mat-icon class="text-lg leading-none transition-transform duration-200" [class.rotate-180]="!isHistoryTableExpanded()">
                    expand_more
                  </mat-icon>
                </button>
                <div>
                  <div class="flex items-center gap-2 flex-wrap">
                    <h3
                      class="text-sm sm:text-base font-bold text-slate-900 dark:text-white cursor-pointer hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                      (click)="isHistoryTableExpanded.update(v => !v)"
                    >
                      Історія передачі показів та розрахунків
                    </h3>
                    <span class="px-2 py-0.5 rounded-full text-2xs font-extrabold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {{ filteredAccountReadings().length }} запис(ів)
                    </span>
                  </div>
                  <p class="text-3xs sm:text-xs text-slate-500 dark:text-slate-400">Усі зафіксовані покази по поточному особовому рахунку</p>
                </div>
              </div>

              <div class="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-thin">
                @if (canEdit()) {
                  <button
                    type="button"
                    (click)="openReadingModal(false)"
                    class="px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-2xs sm:text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white transition-colors flex items-center gap-1 sm:gap-1.5 shadow-2xs cursor-pointer shrink-0"
                  >
                    <mat-icon class="text-sm sm:text-base leading-none">add</mat-icon>
                    <span>Внести покази</span>
                  </button>
                  <button
                    type="button"
                    (click)="openReadingModal(true)"
                    class="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-2xs sm:text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-300 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors flex items-center gap-1 sm:gap-1.5 shadow-2xs cursor-pointer shrink-0"
                    title="Внести контрольний замір"
                  >
                    <mat-icon class="text-sm sm:text-base text-indigo-600 dark:text-indigo-400 leading-none">visibility</mat-icon>
                    <span>Контрольний замір</span>
                  </button>
                  <button
                    type="button"
                    (click)="openCameraModal()"
                    class="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-2xs sm:text-xs font-semibold bg-amber-50 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/60 transition-colors flex items-center gap-1 sm:gap-1.5 shadow-2xs cursor-pointer shrink-0"
                    title="Сфотографувати лічильник та розпізнати покази"
                  >
                    <mat-icon class="text-sm sm:text-base text-amber-600 dark:text-amber-400 leading-none">photo_camera</mat-icon>
                    <span>Зробити фото</span>
                  </button>
                }

                <button
                  type="button"
                  (click)="isHistoryTableExpanded.update(v => !v)"
                  class="p-1.5 sm:p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer shrink-0"
                  [title]="isHistoryTableExpanded() ? 'Згорнути журнал' : 'Розгорнути журнал'"
                >
                  <mat-icon class="text-base leading-none">
                    {{ isHistoryTableExpanded() ? 'expand_less' : 'expand_more' }}
                  </mat-icon>
                </button>
              </div>
            </div>

            <!-- History Table Content -->
            @if (isHistoryTableExpanded()) {
              @if (filteredAccountReadings().length > 0) {
                <div class="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <table class="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr class="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-semibold uppercase text-3xs tracking-wider">
                        <th class="py-3 px-3.5">Дата передачі</th>
                        <th class="py-3 px-3.5">Покази лічильника</th>
                        <th class="py-3 px-3.5">Спожито (кВт·г)</th>
                        <th class="py-3 px-3.5">Тариф (грн)</th>
                        <th class="py-3 px-3.5">Сума до сплати</th>
                        <th class="py-3 px-3.5">Статус</th>
                        @if (canEdit()) {
                          <th class="py-3 px-3.5 text-right">Дії</th>
                        }
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
                      @for (r of filteredAccountReadings(); track r.id) {
                        <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                          <!-- Date -->
                          <td class="py-3 px-3.5 whitespace-nowrap">
                            <div class="flex items-center gap-1.5">
                              <div class="font-bold text-slate-900 dark:text-white">{{ formatDate(r.date) }}</div>
                              @if (r.isControlOnly) {
                                <span class="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-200 text-3xs font-bold border border-indigo-200 dark:border-indigo-800">
                                  <mat-icon class="text-3xs leading-none">visibility</mat-icon> Контрольний
                                </span>
                              }
                            </div>
                            <div class="text-3xs text-slate-400 dark:text-slate-500 font-mono">{{ r.periodMonth || r.date.substring(0, 7) }}</div>
                          </td>

                          <!-- Meter Readings -->
                          <td class="py-3 px-3.5 whitespace-nowrap">
                            @if (acc.electricityTariffType === 'dual') {
                              <div class="font-mono text-xs">
                                <span class="text-amber-600 dark:text-amber-400 font-bold">День (Т2):</span> {{ r.readingT1 }}
                              </div>
                              <div class="font-mono text-xs">
                                <span class="text-indigo-600 dark:text-indigo-400 font-bold">Ніч (Т1):</span> {{ r.readingT2 }}
                              </div>
                            } @else {
                              <div class="font-mono text-xs font-bold text-slate-900 dark:text-white">
                                {{ r.readingT1 }} кВт·г
                              </div>
                            }
                          </td>

                          <!-- Consumption -->
                          <td class="py-3 px-3.5 whitespace-nowrap">
                            <div class="font-bold text-slate-900 dark:text-white text-sm">
                              {{ totalConsumedKwh(r) }} <span class="text-2xs font-normal text-slate-500 dark:text-slate-400">кВт·г</span>
                            </div>
                            @if (acc.electricityTariffType === 'dual') {
                              <div class="text-3xs text-slate-500 dark:text-slate-400">
                                День (Т2): {{ r.consumptionT1 || 0 }} • Ніч (Т1): {{ r.consumptionT2 || 0 }}
                              </div>
                            }
                            @if (r.dailyAvgConsumption && r.dailyAvgConsumption > 0) {
                              <div class="text-3xs text-emerald-600 dark:text-emerald-400 font-medium">
                                ~{{ r.dailyAvgConsumption }} кВт·г/добу
                              </div>
                            }
                          </td>

                          <!-- Rates -->
                          <td class="py-3 px-3.5 whitespace-nowrap">
                            @if (r.isControlOnly) {
                              <span class="text-2xs text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/70 px-2 py-0.5 rounded font-medium border border-indigo-200/60 dark:border-indigo-800 inline-flex items-center gap-1">
                                <mat-icon class="text-3xs">query_stats</mat-icon> Тільки контроль
                              </span>
                            } @else if (acc.electricityTariffType === 'dual') {
                              <div class="text-2xs text-slate-600 dark:text-slate-300">
                                Д: {{ r.rateT1 || '—' }} / Н: {{ r.rateT2 || '—' }}
                              </div>
                              <div class="flex items-center gap-1.5 mt-0.5">
                                <span class="text-3xs uppercase font-semibold" [class.text-indigo-600]="r.season === 'winter'" [class.text-amber-600]="r.season === 'summer'">
                                  {{ r.season === 'summer' ? 'Літо' : 'Зима' }}
                                </span>
                                @if (isWinterLimitExceededReading(r)) {
                                  <button
                                    type="button"
                                    (click)="showReadingBreakdown(r)"
                                    class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-3xs font-bold bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-700 hover:bg-amber-200 dark:hover:bg-amber-900 transition-colors"
                                    title="Перевищено зимовий ліміт 2000 кВт·г"
                                  >
                                    <span>❄️ >2000 кВт·г</span>
                                    <mat-icon class="text-xs leading-none">info</mat-icon>
                                  </button>
                                }
                              </div>
                            } @else {
                              <span class="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                {{ r.rateT1 || currentSingleRate() }} грн
                              </span>
                            }
                          </td>

                          <!-- Total Cost -->
                          <td class="py-3 px-3.5 whitespace-nowrap">
                            @if (r.isControlOnly) {
                              <span class="font-semibold text-slate-400 dark:text-slate-500 text-sm">
                                0.00 грн
                              </span>
                              <div class="text-3xs text-indigo-600 dark:text-indigo-400 font-medium">Без оплати</div>
                            } @else {
                              <span class="font-bold text-slate-900 dark:text-white text-sm">
                                {{ r.totalCost.toFixed(2) }} грн
                              </span>
                            }
                            @if (cleanReadingNote(r.note)) {
                              <div class="text-3xs text-slate-400 dark:text-slate-500 max-w-xs truncate" [title]="cleanReadingNote(r.note)">{{ cleanReadingNote(r.note) }}</div>
                            }
                            @if (r.isControlOnly) {
                              @if (getControlNoteAnalysis(r); as cAnalysis) {
                                <div
                                  class="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-200 dark:border-emerald-800 text-3xs font-semibold text-emerald-800 dark:text-emerald-200 cursor-help"
                                  [title]="cAnalysis.explanation"
                                >
                                  <mat-icon class="text-3xs text-emerald-600 dark:text-emerald-400 leading-none">psychology</mat-icon>
                                  <span>{{ cAnalysis.matchedDeviceName || cAnalysis.detectedAction }}: ~{{ cAnalysis.estimatedKwh }} кВт·г ({{ cAnalysis.durationHours }} год)</span>
                                </div>
                              }
                            }
                          </td>

                          <!-- Status & Pay Toggle -->
                          <td class="py-3 px-3.5 whitespace-nowrap">
                            @if (r.isControlOnly) {
                              <span class="px-2.5 py-1 rounded-full text-2xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 inline-flex items-center gap-1 border border-slate-200 dark:border-slate-700">
                                <mat-icon class="text-xs leading-none">visibility</mat-icon>
                                <span>Моніторинг</span>
                              </span>
                            } @else if (canEdit()) {
                              @let isPaid = isReadingPaid(r, currentAccount());
                              <button
                                type="button"
                                (click)="togglePaidStatus(r)"
                                class="px-2.5 py-1 rounded-full text-2xs font-bold inline-flex items-center gap-1 cursor-pointer transition-colors"
                                [class.bg-emerald-100]="isPaid"
                                [class.dark:bg-emerald-950]="isPaid"
                                [class.text-emerald-800]="isPaid"
                                [class.dark:text-emerald-300]="isPaid"
                                [class.hover:bg-emerald-200]="isPaid"
                                [class.bg-rose-100]="!isPaid"
                                [class.dark:bg-rose-950]="!isPaid"
                                [class.text-rose-800]="!isPaid"
                                [class.dark:text-rose-300]="!isPaid"
                                [class.hover:bg-rose-200]="!isPaid"
                              >
                                <mat-icon class="text-xs leading-none">{{ isPaid ? 'check_circle' : 'pending' }}</mat-icon>
                                <span>{{ isPaid ? 'Сплачено' : 'До сплати' }}</span>
                              </button>
                            } @else {
                              @let isPaid = isReadingPaid(r, currentAccount());
                              <span
                                class="px-2.5 py-1 rounded-full text-2xs font-bold inline-flex items-center gap-1"
                                [class.bg-emerald-100]="isPaid"
                                [class.dark:bg-emerald-950]="isPaid"
                                [class.text-emerald-800]="isPaid"
                                [class.dark:text-emerald-300]="isPaid"
                                [class.bg-rose-100]="!isPaid"
                                [class.dark:bg-rose-950]="!isPaid"
                                [class.text-rose-800]="!isPaid"
                                [class.dark:text-rose-300]="!isPaid"
                              >
                                <mat-icon class="text-xs leading-none">{{ isPaid ? 'check_circle' : 'pending' }}</mat-icon>
                                <span>{{ isPaid ? 'Сплачено' : 'До сплати' }}</span>
                              </span>
                            }
                          </td>

                          <!-- Actions -->
                          @if (canEdit()) {
                            <td class="py-3 px-3.5 whitespace-nowrap text-right">
                              <button
                                type="button"
                                (click)="openEditReadingModal(r)"
                                class="p-1 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/60 transition-colors cursor-pointer mr-1"
                                title="Редагувати запис"
                              >
                                <mat-icon class="text-base leading-none">edit</mat-icon>
                              </button>
                              <button
                                type="button"
                                (click)="deleteReading(r.id)"
                                class="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/60 transition-colors cursor-pointer"
                                title="Видалити запис"
                              >
                                <mat-icon class="text-base leading-none">delete</mat-icon>
                              </button>
                            </td>
                          }
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              } @else {
                <div class="py-10 text-center bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                  <mat-icon class="text-3xl text-slate-400 dark:text-slate-500 mb-1">history</mat-icon>
                  <div class="text-xs font-semibold text-slate-600 dark:text-slate-300">Записів за обраним фільтром не знайдено</div>
                  <p class="text-3xs text-slate-400 dark:text-slate-500 mt-0.5">Внесіть перші дані лічильника вручну або сфотографуйте табло.</p>
                  @if (canEdit()) {
                    <div class="flex items-center justify-center gap-2 mt-3">
                      <button
                        type="button"
                        (click)="openReadingModal(false)"
                        class="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                      >
                        <mat-icon class="text-base leading-none">add</mat-icon>
                        <span>Внести покази</span>
                      </button>
                      <button
                        type="button"
                        (click)="openCameraModal()"
                        class="px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-50 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/60 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                      >
                        <mat-icon class="text-base text-amber-600 dark:text-amber-400 leading-none">photo_camera</mat-icon>
                        <span>Зробити фото</span>
                      </button>
                    </div>
                  }
                </div>
              }
            } @else {
              <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-2xs text-slate-600 dark:text-slate-300 flex items-center justify-between gap-2">
                <span>Історію показів лічильника ({{ filteredAccountReadings().length }} записів) згорнуто для економії місця.</span>
                <button
                  type="button"
                  (click)="isHistoryTableExpanded.set(true)"
                  class="text-3xs font-semibold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                >
                  Розгорнути журнал
                </button>
              </div>
            }
          </div>
        }
      }
      }
    </div>

    <!-- ======================================================== -->
    <!-- MODAL: ADD / EDIT UTILITY ACCOUNT                        -->
    <!-- ======================================================== -->
    @if (isAccountModalOpen()) {
      <div class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs p-2 sm:p-4 flex items-center justify-center">
        <div class="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[calc(100dvh-2rem)] animate-in fade-in zoom-in-95 duration-150 my-auto">
          <!-- Pinned Header -->
          <div class="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 bg-slate-50 shrink-0">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                <mat-icon>bolt</mat-icon>
              </div>
              <h3 class="text-base font-bold text-slate-900">
                {{ editingAccount() ? 'Редагувати рахунок електроенергії' : 'Новий рахунок електроенергії' }}
              </h3>
            </div>
            <button
              type="button"
              (click)="closeAccountModal()"
              class="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center cursor-pointer transition-colors"
            >
              <mat-icon class="text-lg">close</mat-icon>
            </button>
          </div>

          <!-- Form with scrollable body and pinned footer -->
          <form [formGroup]="accountForm" (ngSubmit)="saveAccount()" class="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div class="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 overscroll-contain">
              <!-- Account Name -->
              <div>
                <label for="acc-name" class="block text-xs font-semibold text-slate-700 mb-1">
                  Назва об'єкта / акаунта *
                </label>
                <input
                  id="acc-name"
                  type="text"
                  formControlName="name"
                  placeholder="Квартира (вул. Шевченка), Будинок або Дача"
                  class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-amber-500"
                />
              </div>

              <!-- Account Number & Meter Number -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label for="acc-num" class="block text-xs font-semibold text-slate-700 mb-1">
                    Особовий рахунок *
                  </label>
                  <input
                    id="acc-num"
                    type="text"
                    formControlName="accountNumber"
                    placeholder="020014529"
                    class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-medium text-slate-900 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label for="acc-meter" class="block text-xs font-semibold text-slate-700 mb-1">
                    Номер лічильника
                  </label>
                  <input
                    id="acc-meter"
                    type="text"
                    formControlName="meterNumber"
                    placeholder="№ 12849021"
                    class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-medium text-slate-900 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <!-- Structured DTEK Address Section -->
              <div class="space-y-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <div class="flex items-center justify-between flex-wrap gap-1">
                  <span class="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <mat-icon class="text-amber-600 text-sm leading-none">location_city</mat-icon>
                    <span>Адреса об'єкта та прив'язка до графіка ДТЕК</span>
                  </span>
                  @if (isDtekCatalogLoading()) {
                    <span class="text-3xs text-amber-700 flex items-center gap-1">
                      <span class="w-2.5 h-2.5 border border-amber-600 border-t-transparent rounded-full animate-spin"></span>
                      Оновлення каталогу...
                    </span>
                  }
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <!-- City Autocomplete -->
                  <div class="relative">
                    <label for="acc-city" class="block text-xs font-semibold text-slate-700 mb-1">
                      Населений пункт (Одеська обл.) *
                    </label>
                    <input
                      id="acc-city"
                      type="text"
                      [value]="formCityQuery()"
                      (input)="onFormCityInput($any($event.target).value)"
                      (focus)="showFormCitySuggestions.set(true)"
                      placeholder="Введіть або оберіть населений пункт..."
                      autocomplete="off"
                      class="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-amber-500"
                    />

                    <!-- Dropdown -->
                    @if (showFormCitySuggestions() && filteredFormCities().length > 0) {
                      <button
                        type="button"
                        aria-label="Закрити список міст"
                        class="fixed inset-0 z-30 cursor-default bg-transparent border-0"
                        (click)="showFormCitySuggestions.set(false)"
                      ></button>
                      <div class="absolute z-40 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100">
                        @for (c of filteredFormCities(); track c) {
                          <button
                            type="button"
                            (click)="selectFormCity(c)"
                            class="w-full px-3 py-2 text-left text-xs text-slate-800 hover:bg-amber-50 flex items-center justify-between cursor-pointer transition-colors"
                          >
                            <span class="font-medium">{{ c }}</span>
                            <mat-icon class="text-3xs text-slate-400 leading-none">chevron_right</mat-icon>
                          </button>
                        }
                      </div>
                    }
                  </div>

                  <!-- Street Autocomplete -->
                  <div class="relative">
                    <label for="acc-street" class="block text-xs font-semibold text-slate-700 mb-1">
                      Вулиця (підказка за першими літерами) *
                    </label>
                    <input
                      id="acc-street"
                      type="text"
                      [value]="formStreetQuery()"
                      (input)="onFormStreetInput($any($event.target).value)"
                      (focus)="showFormStreetSuggestions.set(true)"
                      placeholder="Почніть вводити назву вулиці..."
                      autocomplete="off"
                      class="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-amber-500"
                    />

                    <!-- Dropdown -->
                    @if (showFormStreetSuggestions() && filteredFormStreets().length > 0) {
                      <button
                        type="button"
                        aria-label="Закрити список вулиць"
                        class="fixed inset-0 z-30 cursor-default bg-transparent border-0"
                        (click)="showFormStreetSuggestions.set(false)"
                      ></button>
                      <div class="absolute z-40 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100">
                        @for (s of filteredFormStreets(); track s) {
                          <button
                            type="button"
                            (click)="selectFormStreet(s)"
                            class="w-full px-3 py-2 text-left text-xs text-slate-800 hover:bg-amber-50 flex items-center justify-between cursor-pointer transition-colors"
                          >
                            <span class="font-medium">{{ s }}</span>
                            <mat-icon class="text-3xs text-slate-400 leading-none">chevron_right</mat-icon>
                          </button>
                        }
                      </div>
                    }
                  </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <!-- House Number -->
                  <div>
                    <label for="acc-housenum" class="block text-xs font-semibold text-slate-700 mb-1">
                      Номер будинку
                    </label>
                    <input
                      id="acc-housenum"
                      type="text"
                      formControlName="houseNum"
                      (input)="onFormHouseInput($any($event.target).value)"
                      placeholder="Введіть номер будинку..."
                      class="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-medium text-slate-900 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <!-- DTEK Queue Group -->
                  <div>
                    <label for="acc-queue" class="block text-xs font-semibold text-slate-700 mb-1">
                      Черга відключення ДТЕК
                    </label>
                    <input
                      id="acc-queue"
                      type="text"
                      formControlName="dtekQueueGroup"
                      placeholder="напр. GPV4.1 (автопідстановка)"
                      class="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-medium text-slate-900 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <!-- Full Address (auto-assembled, editable) -->
                <div>
                  <label for="acc-addr" class="block text-xs font-semibold text-slate-700 mb-1">
                    Повна адреса (для звітів та квитанцій)
                  </label>
                  <input
                    id="acc-addr"
                    type="text"
                    formControlName="address"
                    placeholder="Автоматично сформується з адреси або введіть вручну"
                    class="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <!-- Tariff Type Selection -->
              <div>
                <span class="block text-xs font-semibold text-slate-700 mb-1.5">
                  Тип тарифу для даного акаунту *
                </span>
                <div class="grid grid-cols-2 gap-3">
                  <label
                    class="p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all"
                    [class.border-amber-500]="accountForm.get('electricityTariffType')?.value === 'single'"
                    [class.bg-amber-50/60]="accountForm.get('electricityTariffType')?.value === 'single'"
                    [class.border-slate-200]="accountForm.get('electricityTariffType')?.value !== 'single'"
                  >
                    <input
                      type="radio"
                      value="single"
                      formControlName="electricityTariffType"
                      class="text-amber-500 focus:ring-amber-500"
                    />
                    <div>
                      <div class="text-xs font-bold text-slate-900">Однотарифний</div>
                      <div class="text-3xs text-slate-500">Один тариф на весь рік</div>
                    </div>
                  </label>

                  <label
                    class="p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all"
                    [class.border-amber-500]="accountForm.get('electricityTariffType')?.value === 'dual'"
                    [class.bg-amber-50/60]="accountForm.get('electricityTariffType')?.value === 'dual'"
                    [class.border-slate-200]="accountForm.get('electricityTariffType')?.value !== 'dual'"
                  >
                    <input
                      type="radio"
                      value="dual"
                      formControlName="electricityTariffType"
                      class="text-amber-500 focus:ring-amber-500"
                    />
                    <div>
                      <div class="text-xs font-bold text-slate-900">Двотарифний</div>
                      <div class="text-3xs text-slate-500">День / Ніч та Сезони</div>
                    </div>
                  </label>
                </div>
              </div>

              <!-- Initial Readings -->
              <div class="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <span class="text-3xs font-bold uppercase tracking-wider text-slate-600 block">
                  Початкові покази лічильника (кВт·г)
                </span>
                <p class="text-3xs text-slate-500">
                  Використовуються як точка відліку для розрахунку споживання за першу передачу показів.
                </p>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label for="acc-t1" class="block text-3xs font-semibold text-slate-600 mb-0.5">
                      {{ accountForm.get('electricityTariffType')?.value === 'dual' ? 'Початковий День (Т2)' : 'Початковий показник' }}
                    </label>
                    <input
                      id="acc-t1"
                      type="number"
                      min="0"
                      step="0.1"
                      formControlName="initialReadingT1"
                      placeholder="0"
                      class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  @if (accountForm.get('electricityTariffType')?.value === 'dual') {
                    <div>
                      <label for="acc-t2" class="block text-3xs font-semibold text-slate-600 mb-0.5">
                        Початковий Ніч (Т1)
                      </label>
                      <input
                        id="acc-t2"
                        type="number"
                        min="0"
                        step="0.1"
                        formControlName="initialReadingT2"
                        placeholder="0"
                        class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  }
                </div>
              </div>

              <!-- Notes -->
              <div>
                <label for="acc-notes" class="block text-xs font-semibold text-slate-700 mb-1">
                  Примітки
                </label>
                <input
                  id="acc-notes"
                  type="text"
                  formControlName="notes"
                  placeholder="Додаткова інформація про лічильник чи договір"
                  class="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <!-- Pinned Footer -->
            <div class="flex items-center justify-end gap-2.5 p-4 border-t border-slate-200 bg-slate-50/90 shrink-0">
              <button
                type="button"
                (click)="closeAccountModal()"
                class="px-4 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Скасувати
              </button>
              <button
                type="submit"
                [disabled]="accountForm.invalid || isSubmitting()"
                class="px-4 py-2 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white transition-colors cursor-pointer disabled:opacity-50"
              >
                {{ editingAccount() ? 'Оновити акаунт' : 'Зберегти акаунт' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- ======================================================== -->
    <!-- MODAL: ADD NEW METER READINGS (BILLING OR CONTROL)       -->
    <!-- ======================================================== -->
    @if (isReadingModalOpen()) {
      <div class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs p-2 sm:p-4 flex items-center justify-center">
        <div class="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[calc(100dvh-2rem)] animate-in fade-in zoom-in-95 duration-150 my-auto">
          <!-- Pinned Header -->
          <div class="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 shrink-0">
            <div class="flex items-center gap-2.5">
              <div
                class="w-9 h-9 rounded-xl text-white flex items-center justify-center shrink-0"
                [class.bg-amber-500]="!readingForm.get('isControlOnly')?.value"
                [class.bg-indigo-600]="readingForm.get('isControlOnly')?.value"
              >
                <mat-icon>{{ readingForm.get('isControlOnly')?.value ? 'visibility' : 'speed' }}</mat-icon>
              </div>
              <div>
                <h3 class="text-base font-bold text-slate-900 dark:text-white">
                  @if (editingReadingId()) {
                    {{ readingForm.get('isControlOnly')?.value ? 'Редагувати контрольний замір' : 'Редагувати показник лічильника' }}
                  } @else {
                    {{ readingForm.get('isControlOnly')?.value ? 'Контрольний замір електроенергії' : 'Внесення показів електроенергії' }}
                  }
                </h3>
                <p class="text-2xs text-slate-500 dark:text-slate-400">{{ currentAccount()?.name }} • Особовий № {{ currentAccount()?.accountNumber }}</p>
              </div>
            </div>
            <button
              type="button"
              (click)="closeReadingModal()"
              class="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 flex items-center justify-center cursor-pointer transition-colors"
            >
              <mat-icon class="text-lg">close</mat-icon>
            </button>
          </div>

          <!-- Form with scrollable body and pinned footer -->
          <form [formGroup]="readingForm" (ngSubmit)="saveReading()" class="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div class="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 overscroll-contain">
              <!-- Purpose Switcher: Billing vs Control Only -->
              <div class="space-y-1.5">
                <span class="block text-xs font-semibold text-slate-700 dark:text-slate-300">Призначення показу *</span>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label
                    class="p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all"
                    [class.border-amber-500]="!readingForm.get('isControlOnly')?.value"
                    [class.bg-amber-50/70]="!readingForm.get('isControlOnly')?.value"
                    [class.dark:bg-amber-950/30]="!readingForm.get('isControlOnly')?.value"
                    [class.border-slate-200]="readingForm.get('isControlOnly')?.value"
                    [class.dark:border-slate-700]="readingForm.get('isControlOnly')?.value"
                  >
                    <input
                      type="radio"
                      [value]="false"
                      formControlName="isControlOnly"
                      (change)="recalculateFormCost()"
                      class="mt-0.5 text-amber-500 focus:ring-amber-500"
                    />
                    <div>
                      <div class="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <span>⚡ Розрахунковий</span>
                        <span class="text-3xs text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/80 px-1.5 py-0.2 rounded font-bold">Для оплати</span>
                      </div>
                      <div class="text-3xs text-slate-500 dark:text-slate-400 mt-0.5">Офіційний білінг та нарахування до сплати</div>
                    </div>
                  </label>

                  <label
                    class="p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all"
                    [class.border-indigo-500]="readingForm.get('isControlOnly')?.value"
                    [class.bg-indigo-50/70]="readingForm.get('isControlOnly')?.value"
                    [class.dark:bg-indigo-950/30]="readingForm.get('isControlOnly')?.value"
                    [class.border-slate-200]="!readingForm.get('isControlOnly')?.value"
                    [class.dark:border-slate-700]="!readingForm.get('isControlOnly')?.value"
                  >
                    <input
                      type="radio"
                      [value]="true"
                      formControlName="isControlOnly"
                      (change)="recalculateFormCost()"
                      class="mt-0.5 text-indigo-600 focus:ring-indigo-600"
                    />
                    <div>
                      <div class="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <span>👁️ Контрольний</span>
                        <span class="text-3xs text-indigo-800 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-950/80 px-1.5 py-0.2 rounded font-bold">Без оплати</span>
                      </div>
                      <div class="text-3xs text-slate-500 dark:text-slate-400 mt-0.5">Для аналізу тенденцій та споживання приладів</div>
                    </div>
                  </label>
                </div>
              </div>

              <!-- Informational Banner for Control Readings -->
              @if (readingForm.get('isControlOnly')?.value) {
                <div class="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200 text-xs flex items-start gap-2">
                  <mat-icon class="text-indigo-600 dark:text-indigo-400 shrink-0 text-base">info</mat-icon>
                  <div class="text-2xs leading-relaxed">
                    <strong>Контрольний показник:</strong> використовується виключно для графіків, відстеження тенденцій та аналізу роботи приладів з приміток. <strong>Плата не нараховується (0.00 грн)</strong>, а наступний розрахунковий показник автоматично охопить весь обсяг з моменту останньої оплати.
                  </div>
                </div>
              }

              <!-- Reading Date -->
              <div>
                <label for="read-date" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Дата зняття показів *
                </label>
                <input
                  id="read-date"
                  type="date"
                  formControlName="date"
                  (change)="recalculateFormCost()"
                  class="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <!-- Current Account Tariff Details & Previous Readings -->
              <div
                class="p-3 border rounded-xl space-y-1 text-xs"
                [class.bg-amber-50/70]="!readingForm.get('isControlOnly')?.value"
                [class.dark:bg-amber-950/30]="!readingForm.get('isControlOnly')?.value"
                [class.border-amber-200/80]="!readingForm.get('isControlOnly')?.value"
                [class.dark:border-amber-800/60]="!readingForm.get('isControlOnly')?.value"
                [class.bg-indigo-50/70]="readingForm.get('isControlOnly')?.value"
                [class.dark:bg-indigo-950/30]="readingForm.get('isControlOnly')?.value"
                [class.border-indigo-200/80]="readingForm.get('isControlOnly')?.value"
                [class.dark:border-indigo-800/60]="readingForm.get('isControlOnly')?.value"
              >
                <div class="flex items-center justify-between text-3xs uppercase tracking-wider font-bold">
                  <span [class.text-amber-900]="!readingForm.get('isControlOnly')?.value" [class.dark:text-amber-300]="!readingForm.get('isControlOnly')?.value" [class.text-indigo-900]="readingForm.get('isControlOnly')?.value" [class.dark:text-indigo-300]="readingForm.get('isControlOnly')?.value">
                    {{ readingForm.get('isControlOnly')?.value ? 'Попередні покази для розрахунку темпу:' : 'Попередній розрахунковий показник:' }}
                  </span>
                  @if (!readingForm.get('isControlOnly')?.value) {
                    <span class="text-purple-700 dark:text-purple-300 font-semibold">{{ calculatedSeason() === 'summer' ? 'Літній сезон (01.05 – 30.09)' : 'Зимовий сезон (01.10 – 30.04)' }}</span>
                  }
                </div>
                <div class="text-xs font-mono font-medium" [class.text-amber-950]="!readingForm.get('isControlOnly')?.value" [class.dark:text-amber-100]="!readingForm.get('isControlOnly')?.value" [class.text-indigo-950]="readingForm.get('isControlOnly')?.value" [class.dark:text-indigo-100]="readingForm.get('isControlOnly')?.value">
                  @if (currentAccount()?.electricityTariffType === 'dual') {
                    День (Т2): <span class="font-bold">{{ activePrevT1() }}</span> кВт·г • Ніч (Т1): <span class="font-bold">{{ activePrevT2() }}</span> кВт·г
                  } @else {
                    Попередній: <span class="font-bold">{{ activePrevT1() }}</span> кВт·г
                  }
                </div>
              </div>

              <!-- Current Reading Section Header with Camera Action -->
              <div class="flex items-center justify-between pb-0.5">
                <span class="text-xs font-bold text-slate-800 dark:text-slate-200">Поточні покази лічильника:</span>
                <button
                  type="button"
                  (click)="openCameraModal()"
                  class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-amber-100 dark:bg-amber-950/80 hover:bg-amber-200 dark:hover:bg-amber-900 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700 transition-colors cursor-pointer shadow-2xs"
                  title="Сфотографувати лічильник для автоматичного заповнення"
                >
                  <mat-icon class="text-sm text-amber-600 dark:text-amber-400 leading-none">photo_camera</mat-icon>
                  <span>Зробити фото</span>
                </button>
              </div>

              <!-- Meter Reading Inputs -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label for="read-t1" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {{ currentAccount()?.electricityTariffType === 'dual' ? 'Показник День (Т2) *' : 'Показник лічильника *' }}
                  </label>
                  <input
                    id="read-t1"
                    type="number"
                    step="0.1"
                    min="0"
                    formControlName="readingT1"
                    (input)="recalculateFormCost()"
                    placeholder="Введіть число"
                    class="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-mono font-extrabold text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                @if (currentAccount()?.electricityTariffType === 'dual') {
                  <div>
                    <label for="read-t2" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Показник Ніч (Т1) *
                    </label>
                    <input
                      id="read-t2"
                      type="number"
                      step="0.1"
                      min="0"
                      formControlName="readingT2"
                      (input)="recalculateFormCost()"
                      placeholder="Введіть число"
                      class="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-mono font-extrabold text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                }
              </div>

              <!-- Live Calculation Summary Card -->
              <div class="p-4 rounded-xl bg-slate-900 text-white space-y-2.5 shadow-sm">
                <div class="text-3xs uppercase tracking-wider text-slate-400 font-semibold flex items-center justify-between">
                  <span>{{ readingForm.get('isControlOnly')?.value ? 'Контрольний розрахунок темпу' : 'Автоматичний розрахунок нарахування' }}</span>
                  @if (!readingForm.get('isControlOnly')?.value) {
                    <span class="text-amber-400 font-bold">Тариф: {{ calculatedRatesText() }}</span>
                  } @else {
                    <span class="text-indigo-300 font-bold">Без нарахування оплати</span>
                  }
                </div>

                <div class="flex items-center justify-between pt-1 border-t border-slate-800">
                  <span class="text-xs text-slate-300">Споживання за період:</span>
                  <span class="text-xs font-mono font-bold text-amber-300">
                    {{ formConsumedKwhText() }}
                  </span>
                </div>

                <div class="flex items-center justify-between pt-1 border-t border-slate-800">
                  <span class="text-sm font-bold text-white">До сплати:</span>
                  @if (readingForm.get('isControlOnly')?.value) {
                    <span class="text-base font-mono font-bold text-indigo-300">
                      0.00 грн (тільки аналіз)
                    </span>
                  } @else {
                    <span class="text-lg font-mono font-extrabold text-emerald-400">
                      {{ formTotalCost().toFixed(2) }} грн
                    </span>
                  }
                </div>
              </div>

              <!-- Winter Consumption Limit Exceeded Breakdown Card -->
              @if (!readingForm.get('isControlOnly')?.value && formCalculationResult(); as calc) {
                @if (calc.isWinterExceeded) {
                  <div class="p-3.5 rounded-xl bg-indigo-950/90 border border-indigo-500/40 text-indigo-100 space-y-2.5 text-xs shadow-sm animate-in fade-in duration-200">
                    <div class="flex items-center justify-between pb-2 border-b border-indigo-800/60">
                      <div class="flex items-center gap-1.5 font-bold text-amber-300">
                        <mat-icon class="text-base text-amber-400">warning_amber</mat-icon>
                        <span>Перевищення зимового ліміту {{ calc.winterLimitKwh }} кВт·г</span>
                      </div>
                      <span class="px-2 py-0.5 rounded text-3xs font-mono font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30">
                        +{{ calc.excessKwh?.toFixed(1) }} кВт·г понад норму
                      </span>
                    </div>

                    <div class="text-3xs text-indigo-200">
                      Розподіл день/ніч пропорційно споживанню: <span class="font-bold text-white">День (Т2) {{ calc.ratioDay }}%</span>, <span class="font-bold text-white">Ніч (Т1) {{ calc.ratioNight }}%</span>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-2xs">
                      <!-- Winter portion -->
                      <div class="p-2.5 rounded-lg bg-indigo-900/60 border border-indigo-700/50 space-y-1">
                        <div class="font-bold text-indigo-300 flex items-center justify-between">
                          <span>❄️ До {{ calc.winterLimitKwh }} кВт·г (зимовий):</span>
                          <span class="font-mono text-white">{{ calc.winterTotalCost?.toFixed(2) }} грн</span>
                        </div>
                        <div class="text-slate-300 font-mono text-3xs">
                          День: {{ calc.winterDayKwh?.toFixed(1) }} кВт·г × {{ currentDualRates().winterDay }} грн
                        </div>
                        <div class="text-slate-300 font-mono text-3xs">
                          Ніч: {{ calc.winterNightKwh?.toFixed(1) }} кВт·г × {{ currentDualRates().winterNight }} грн
                        </div>
                      </div>

                      <!-- Summer portion (excess) -->
                      <div class="p-2.5 rounded-lg bg-amber-950/60 border border-amber-700/50 space-y-1">
                        <div class="font-bold text-amber-300 flex items-center justify-between">
                          <span>☀️ Понад {{ calc.winterLimitKwh }} кВт·г (літній):</span>
                          <span class="font-mono text-white">{{ calc.summerTotalCost?.toFixed(2) }} грн</span>
                        </div>
                        <div class="text-amber-200/90 font-mono text-3xs">
                          День: {{ calc.summerDayKwh?.toFixed(1) }} кВт·г × {{ currentDualRates().summerDay }} грн
                        </div>
                        <div class="text-amber-200/90 font-mono text-3xs">
                          Ніч: {{ calc.summerNightKwh?.toFixed(1) }} кВт·г × {{ currentDualRates().summerNight }} грн
                        </div>
                      </div>
                    </div>
                  </div>
                }
              }

              <!-- Payment status checkbox (Only for billing readings) -->
              @if (!readingForm.get('isControlOnly')?.value) {
                <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                  <div>
                    <label for="read-ispaid" class="text-xs font-bold text-slate-900 block cursor-pointer">
                      Позначити одразу як сплачено
                    </label>
                    <span class="text-3xs text-slate-500">Встановлює статус сплати для даного рахунку</span>
                  </div>
                  <input
                    id="read-ispaid"
                    type="checkbox"
                    formControlName="isPaid"
                    class="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 cursor-pointer"
                  />
                </div>
              }

              <!-- Note -->
              <div>
                <div class="flex items-center justify-between mb-1">
                  <label for="read-note" class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Примітка (необов'язково)
                  </label>
                  @if (readingForm.get('isControlOnly')?.value) {
                    <span class="text-3xs text-indigo-600 dark:text-indigo-400 font-bold flex items-center gap-0.5">
                      <mat-icon class="text-3xs leading-none">auto_awesome</mat-icon>
                      <span>Розумний аналіз приміток</span>
                    </span>
                  }
                </div>
                <input
                  id="read-note"
                  type="text"
                  formControlName="note"
                  (input)="recalculateFormCost()"
                  [placeholder]="readingForm.get('isControlOnly')?.value ? 'Наприклад: Вчора увімкнули опалення з 17-ї до сьогодні 8-ї години' : 'Наприклад: Контрольна перевірка, або Оплачено через Приват24'"
                  class="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                />
                @if (readingForm.get('isControlOnly')?.value && !controlReadingNoteAnalysis()) {
                  <p class="text-3xs text-slate-500 dark:text-slate-400 mt-1">
                    💡 Підказка: якщо прилад (обігрів, котел, бойлер) не має окремої смарт-розетки, вкажіть час роботи у примітці (наприклад: «Вчора увімкнули опалення з 17-ї до сьогодні 8-ї години»). Система автоматично розрахує спожиті кВт·год за номіналом приладу зі списку.
                  </p>
                }
              </div>

              <!-- Live Smart Note Analysis Card for Control Readings -->
              @if (readingForm.get('isControlOnly')?.value && controlReadingNoteAnalysis(); as analysis) {
                <div class="p-3.5 rounded-xl bg-indigo-950/90 border border-indigo-500/50 text-indigo-100 space-y-2.5 text-xs shadow-md animate-in fade-in duration-150">
                  <div class="flex items-center justify-between pb-2 border-b border-indigo-800/70">
                    <div class="flex items-center gap-1.5 font-bold text-amber-300">
                      <mat-icon class="text-base text-amber-400">psychology</mat-icon>
                      <span>Розумний аналіз примітки контрольного заміру</span>
                    </div>
                    <span class="px-2 py-0.5 rounded text-3xs font-mono font-bold bg-emerald-400/20 text-emerald-300 border border-emerald-400/40">
                      ~{{ analysis.estimatedKwh.toFixed(1) }} кВт·год розпізнано
                    </span>
                  </div>

                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-2xs">
                    <div class="p-2 rounded-lg bg-indigo-900/60 border border-indigo-800/60 space-y-0.5">
                      <span class="text-3xs text-indigo-300 block font-semibold">Розпізнаний прилад / дія:</span>
                      <span class="font-bold text-white block truncate" [title]="analysis.matchedDeviceName || analysis.detectedAction">
                        {{ analysis.matchedDeviceName || analysis.detectedAction }}
                      </span>
                      <span class="text-3xs text-indigo-300">
                        {{ analysis.deviceMatchedFromList ? '✓ Знайдено у списку приладів будинку' : 'Категорія приладу' }}
                      </span>
                    </div>

                    <div class="p-2 rounded-lg bg-indigo-900/60 border border-indigo-800/60 space-y-0.5">
                      <span class="text-3xs text-indigo-300 block font-semibold">Період та тривалість:</span>
                      <span class="font-bold text-amber-300 block">
                        {{ analysis.timeIntervalText }}
                      </span>
                      <span class="text-3xs text-indigo-300">
                        Потужність: {{ analysis.powerWatts }} Вт
                      </span>
                    </div>
                  </div>

                  @if (formActiveReadingDelta() > 0) {
                    <div class="p-2 rounded-lg bg-indigo-900/40 border border-indigo-800/40 text-3xs space-y-1">
                      <div class="flex items-center justify-between text-indigo-200">
                        <span>Зафіксований замір: <strong class="text-white">{{ formActiveReadingDelta() }} кВт·г</strong></span>
                        <span>Пояснено приміткою: <strong class="text-amber-300">{{ analysis.coveragePercent }}%</strong></span>
                      </div>
                      <div class="w-full h-1.5 rounded-full bg-indigo-950 overflow-hidden flex">
                        <div class="h-full bg-emerald-400 transition-all duration-300" [style.width.%]="analysis.coveragePercent"></div>
                        <div class="h-full bg-indigo-600/60 transition-all duration-300" [style.width.%]="100 - analysis.coveragePercent"></div>
                      </div>
                      <div class="flex items-center justify-between text-indigo-300">
                        <span>Прилад: ~{{ analysis.estimatedKwh.toFixed(1) }} кВт·г</span>
                        <span>Залишковий фон будинку: ~{{ analysis.residualKwh.toFixed(1) }} кВт·г</span>
                      </div>
                    </div>
                  }

                  <p class="text-2xs text-indigo-200 leading-relaxed">
                    {{ analysis.explanation }}
                  </p>

                  @if (analysis.matchedDeviceId && canEdit()) {
                    <div class="pt-1.5 border-t border-indigo-800/60 flex items-center justify-between gap-2 flex-wrap">
                      <span class="text-3xs text-indigo-300">Хочете продублювати запис окремо в історію приладу?</span>
                      <button
                        type="button"
                        (click)="addDeviceLogFromControlNote(analysis)"
                        class="px-2.5 py-1 rounded-lg text-3xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white transition-colors cursor-pointer flex items-center gap-1 shadow-2xs shrink-0"
                        title="Створити окремий запис споживання в історії приладу"
                      >
                        <mat-icon class="text-xs leading-none">add_circle</mat-icon>
                        <span>Внести у «{{ analysis.matchedDeviceName }}»</span>
                      </button>
                    </div>
                  }
                </div>
              }
            </div>

            <!-- Pinned Footer -->
            <div class="flex items-center justify-end gap-2.5 p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/90 shrink-0">
              <button
                type="button"
                (click)="closeReadingModal()"
                class="px-4 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
              >
                Скасувати
              </button>
              <button
                type="submit"
                [disabled]="readingForm.invalid || isSubmitting()"
                class="px-4 py-2 rounded-xl text-xs font-semibold text-white transition-colors cursor-pointer disabled:opacity-50"
                [class.bg-amber-500]="!readingForm.get('isControlOnly')?.value"
                [class.hover:bg-amber-600]="!readingForm.get('isControlOnly')?.value"
                [class.bg-indigo-600]="readingForm.get('isControlOnly')?.value"
                [class.hover:bg-indigo-700]="readingForm.get('isControlOnly')?.value"
              >
                @if (editingReadingId()) {
                  Зберегти зміни
                } @else if (readingForm.get('isControlOnly')?.value) {
                  Зберегти контрольний замір
                } @else {
                  Зафіксувати покази
                }
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- ======================================================== -->
    <!-- MODAL: READING BREAKDOWN DETAILS                         -->
    <!-- ======================================================== -->
    @if (selectedReadingForBreakdown(); as sel) {
      @let bDown = getReadingBreakdown(sel);
      <div class="fixed inset-0 z-50 overflow-y-auto p-3 sm:p-4 flex items-center justify-center">
        <!-- Backdrop button for closing -->
        <button
          type="button"
          aria-label="Закрити вікно деталей"
          class="fixed inset-0 w-full h-full bg-slate-900/60 backdrop-blur-xs cursor-default -z-10"
          (click)="closeReadingBreakdown()"
        ></button>

        <div class="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto flex flex-col max-h-[92dvh] animate-in fade-in zoom-in-95 duration-150">
          <!-- Header -->
          <div class="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/80 shrink-0">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <mat-icon class="text-lg">calculate</mat-icon>
              </div>
              <div>
                <h3 class="text-sm font-bold text-slate-900">Деталізація нарахування за електроенергію</h3>
                <p class="text-3xs text-slate-500">Дата: {{ formatDate(sel.date) }} • {{ currentAccount()?.name }}</p>
              </div>
            </div>
            <button
              type="button"
              (click)="closeReadingBreakdown()"
              class="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors"
            >
              <mat-icon class="text-base">close</mat-icon>
            </button>
          </div>

          <!-- Body -->
          <div class="p-5 space-y-4 overflow-y-auto">
            <!-- Alert badge if exceeded -->
            @if (bDown.isWinterExceeded) {
              <div class="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                <mat-icon class="text-amber-600 shrink-0 text-lg">warning</mat-icon>
                <div>
                  <div class="font-bold">Зимове споживання понад норму {{ bDown.winterLimitKwh }} кВт·г</div>
                  <div class="text-3xs text-amber-800 mt-0.5">
                    Загальне споживання: <span class="font-bold">{{ bDown.totalKwh }} кВт·г</span>.
                    Зимовий тариф діє на перші <span class="font-bold">{{ bDown.winterLimitKwh }} кВт·г</span>, а все що понад норму (<span class="font-bold">{{ bDown.excessKwh }} кВт·г</span>) розраховано за літнім тарифом. День/ніч розподілено строго пропорційно (День (Т2): {{ bDown.ratioDay }}%, Ніч (Т1): {{ bDown.ratioNight }}%).
                  </div>
                </div>
              </div>
            }

            <!-- Consumption Summary -->
            <div class="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <div>
                <span class="text-3xs text-slate-500 block">День (Т2):</span>
                <span class="font-bold text-slate-900 font-mono">{{ bDown.diff1 }} кВт·г</span>
              </div>
              <div>
                <span class="text-3xs text-slate-500 block">Ніч (Т1):</span>
                <span class="font-bold text-slate-900 font-mono">{{ bDown.diff2 }} кВт·г</span>
              </div>
            </div>

            <!-- Calculation sections -->
            @if (bDown.isWinterExceeded) {
              <div class="space-y-3">
                <!-- Winter Block -->
                <div class="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200 space-y-2">
                  <div class="flex items-center justify-between text-xs font-bold text-indigo-950 pb-1.5 border-b border-indigo-200/80">
                    <span class="flex items-center gap-1.5">
                      <mat-icon class="text-sm text-indigo-600">ac_unit</mat-icon>
                      Зимовий тариф (до {{ bDown.winterLimitKwh }} кВт·г)
                    </span>
                    <span class="font-mono">{{ bDown.winterTotalCost?.toFixed(2) }} грн</span>
                  </div>
                  <div class="text-2xs text-indigo-900 space-y-1">
                    <div class="flex justify-between">
                      <span>День ({{ bDown.winterDayKwh }} кВт·г × {{ currentDualRates().winterDay }} грн):</span>
                      <span class="font-mono font-semibold">{{ bDown.winterDayCost?.toFixed(2) }} грн</span>
                    </div>
                    <div class="flex justify-between">
                      <span>Ніч ({{ bDown.winterNightKwh }} кВт·г × {{ currentDualRates().winterNight }} грн):</span>
                      <span class="font-mono font-semibold">{{ bDown.winterNightCost?.toFixed(2) }} грн</span>
                    </div>
                  </div>
                </div>

                <!-- Summer Block -->
                <div class="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2">
                  <div class="flex items-center justify-between text-xs font-bold text-amber-950 pb-1.5 border-b border-amber-200/80">
                    <span class="flex items-center gap-1.5">
                      <mat-icon class="text-sm text-amber-600">wb_sunny</mat-icon>
                      Літній тариф (понад норму {{ bDown.excessKwh }} кВт·г)
                    </span>
                    <span class="font-mono">{{ bDown.summerTotalCost?.toFixed(2) }} грн</span>
                  </div>
                  <div class="text-2xs text-amber-900 space-y-1">
                    <div class="flex justify-between">
                      <span>День ({{ bDown.summerDayKwh }} кВт·г × {{ currentDualRates().summerDay }} грн):</span>
                      <span class="font-mono font-semibold">{{ bDown.summerDayCost?.toFixed(2) }} грн</span>
                    </div>
                    <div class="flex justify-between">
                      <span>Ніч ({{ bDown.summerNightKwh }} кВт·г × {{ currentDualRates().summerNight }} грн):</span>
                      <span class="font-mono font-semibold">{{ bDown.summerNightCost?.toFixed(2) }} грн</span>
                    </div>
                  </div>
                </div>
              </div>
            }

            <!-- Final total box -->
            <div class="p-3.5 rounded-xl bg-slate-900 text-white flex items-center justify-between">
              <div>
                <span class="text-3xs text-slate-400 uppercase tracking-wider block">Загальна сума до сплати</span>
                <span class="text-xs text-slate-300">Спожито {{ bDown.totalKwh }} кВт·г</span>
              </div>
              <span class="text-xl font-mono font-extrabold text-emerald-400">
                {{ sel.totalCost.toFixed(2) }} грн
              </span>
            </div>

            @if (sel.note) {
              <div class="text-2xs text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span class="font-bold text-slate-700 block mb-0.5">Примітка до запису:</span>
                {{ sel.note }}
              </div>
            }
          </div>

          <!-- Footer -->
          <div class="px-5 py-3 border-t border-slate-100 bg-slate-50/80 flex justify-end shrink-0">
            <button
              type="button"
              (click)="closeReadingBreakdown()"
              class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition-colors"
            >
              Закрити
            </button>
          </div>
        </div>
      </div>
    }

    <!-- ======================================================== -->
    <!-- MODAL: CAMERA SCANNER MODAL                              -->
    <!-- ======================================================== -->
    @if (isCameraModalOpen()) {
      <app-meter-camera-modal
        utilityType="electricity"
        [electricityTariffType]="currentAccount()?.electricityTariffType || 'single'"
        [accountName]="currentAccount()?.name || 'Електроенергія'"
        (closeModal)="closeCameraModal()"
        (readingApplied)="onCameraReadingApplied($event)"
      />
    }

    <!-- ======================================================== -->
    <!-- MODAL 1: ADD / EDIT ELECTRICITY DEVICE                   -->
    <!-- ======================================================== -->
    @if (isDeviceModalOpen()) {
      <div class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 flex items-center justify-center">
        <div class="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] animate-in fade-in zoom-in-95 duration-150 my-auto">
          <div class="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 bg-slate-50 shrink-0">
            <div class="flex items-center gap-2.5">
              <div
                class="w-9 h-9 rounded-xl text-white flex items-center justify-center shrink-0"
                [style.background-color]="deviceForm.get('color')?.value || '#10b981'"
              >
                <mat-icon>{{ deviceForm.get('icon')?.value || 'electrical_services' }}</mat-icon>
              </div>
              <div>
                <h3 class="text-base font-bold text-slate-900">
                  {{ editingDeviceId() ? 'Редагувати пристрій' : 'Додати електроприлад' }}
                </h3>
                <p class="text-3xs text-slate-500">{{ currentAccount()?.name }}</p>
              </div>
            </div>
            <button
              type="button"
              (click)="closeDeviceModal()"
              class="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center cursor-pointer"
            >
              <mat-icon class="text-lg">close</mat-icon>
            </button>
          </div>

          <form [formGroup]="deviceForm" (ngSubmit)="saveDevice()" class="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div class="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
              <!-- Quick Templates Dropdown -->
              @if (!editingDeviceId()) {
                <div>
                  <label for="dev-template-select" class="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                    <span>Шаблони приладів (оберіть для автозаповнення):</span>
                    <span class="text-3xs text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      {{ devicePresets.length }} шаблонів
                    </span>
                  </label>
                  <select
                    id="dev-template-select"
                    (change)="onPresetSelectChange($any($event.target).value)"
                    class="w-full px-3.5 py-2.5 bg-emerald-50/60 border border-emerald-300 rounded-xl text-xs font-bold text-emerald-950 focus:outline-none focus:border-emerald-600 cursor-pointer shadow-2xs"
                  >
                    <option value="" disabled selected>-- Оберіть готовий шаблон приладу --</option>
                    @for (preset of devicePresets; track preset.name) {
                      <option [value]="preset.name">
                        {{ preset.name }} {{ preset.powerWatts ? '(' + preset.powerWatts + ' Вт)' : '' }} {{ preset.batteryCapacityKwh ? '[' + preset.batteryCapacityKwh + ' кВт·год]' : '' }}
                      </option>
                    }
                  </select>
                </div>
              }

              <div>
                <label for="dev-name" class="block text-xs font-semibold text-slate-700 mb-1">
                  Назва пристрою *
                </label>
                <input
                  id="dev-name"
                  type="text"
                  formControlName="name"
                  placeholder="Напр. Бойлер (ванна), Кондиціонер спальня, EcoFlow, Пральна машина"
                  class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label for="dev-power" class="block text-xs font-semibold text-slate-700 mb-1">
                    Потужність (Вт)
                  </label>
                  <input
                    id="dev-power"
                    type="number"
                    min="0"
                    formControlName="powerWatts"
                    placeholder="Напр. 1350 або 3600"
                    class="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label for="dev-battery" class="block text-xs font-semibold text-slate-700 mb-1">
                    Батарея (кВт·год, для авто/ДБЖ)
                  </label>
                  <input
                    id="dev-battery"
                    type="number"
                    step="0.5"
                    min="0"
                    formControlName="batteryCapacityKwh"
                    placeholder="Напр. 24 (VW E-Golf)"
                    class="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <span class="block text-xs font-semibold text-slate-700 mb-1">
                    Колір на графіку
                  </span>
                  <div class="flex items-center gap-1.5 pt-1 flex-wrap">
                    @for (c of deviceColors; track c) {
                      <button
                        type="button"
                        (click)="deviceForm.patchValue({ color: c })"
                        [attr.aria-label]="'Обрати колір ' + c"
                        class="w-5 h-5 rounded-full cursor-pointer transition-transform"
                        [style.background-color]="c"
                        [class.scale-125]="deviceForm.get('color')?.value === c"
                        [class.ring-2]="deviceForm.get('color')?.value === c"
                        [class.ring-slate-900]="deviceForm.get('color')?.value === c"
                      >
                        <span class="sr-only">{{ c }}</span>
                      </button>
                    }
                  </div>
                </div>
              </div>

              <!-- Night Tariff Friendly Toggle -->
              <label class="p-3 rounded-xl bg-indigo-50/60 border border-indigo-200/80 flex items-center justify-between gap-3 cursor-pointer">
                <div class="flex items-center gap-2.5">
                  <mat-icon class="text-indigo-600">dark_mode</mat-icon>
                  <div>
                    <div class="text-xs font-bold text-slate-900">Можна вмикати вночі (23:00 – 07:00)</div>
                    <div class="text-3xs text-slate-500">Враховувати прилад у розрахунку потенційної економії за нічним тарифом Ніч (Т1)</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  formControlName="isNightFriendly"
                  class="w-4 h-4 text-indigo-600 rounded cursor-pointer"
                />
              </label>

              <div>
                <label for="dev-notes" class="block text-xs font-semibold text-slate-700 mb-1">
                  Примітка (модель / параметри / розташування)
                </label>
                <input
                  id="dev-notes"
                  type="text"
                  formControlName="notes"
                  placeholder="Напр. Кондиціонер на обігрів або Volkswagen E-Golf 2014 24кВт·год"
                  class="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div class="flex items-center justify-end gap-2.5 p-4 border-t border-slate-200 bg-slate-50 shrink-0">
              <button
                type="button"
                (click)="closeDeviceModal()"
                class="px-4 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Скасувати
              </button>
              <button
                type="submit"
                [disabled]="deviceForm.invalid || isSavingDevices()"
                class="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer disabled:opacity-50"
              >
                {{ editingDeviceId() ? 'Зберегти зміни' : 'Додати пристрій' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- ======================================================== -->
    <!-- MODAL 2: ADD CONSUMPTION (DAY / TIME INTERVAL / MONTH)   -->
    <!-- ======================================================== -->
    @if (isDeviceLogModalOpen()) {
      <div class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 flex items-center justify-center">
        <div class="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[94dvh] animate-in fade-in zoom-in-95 duration-150 my-auto">
          <div class="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 bg-slate-50 shrink-0">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                <mat-icon>{{ editingDeviceLogId() ? 'edit_note' : 'playlist_add' }}</mat-icon>
              </div>
              <div>
                <h3 class="text-base font-bold text-slate-900">
                  {{ editingDeviceLogId() ? 'Редагувати запис споживання' : 'Внести споживання приладу' }}
                </h3>
                <p class="text-3xs text-slate-500">За конкретну добу, відрізок часу або станом на дату з початку місяця</p>
              </div>
            </div>
            <button
              type="button"
              (click)="closeDeviceLogModal()"
              class="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center cursor-pointer"
            >
              <mat-icon class="text-lg">close</mat-icon>
            </button>
          </div>

          <form [formGroup]="deviceLogForm" (ngSubmit)="saveDeviceLog()" class="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div class="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
              <!-- Select Device -->
              <div>
                <label for="dlog-device" class="block text-xs font-semibold text-slate-700 mb-1">
                  Оберіть пристрій *
                </label>
                <select
                  id="dlog-device"
                  formControlName="deviceId"
                  (change)="onDeviceLogFormChange()"
                  class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500"
                >
                  @for (dev of accountDevices(); track dev.id) {
                    <option [value]="dev.id">
                      {{ dev.name }}
                      {{ dev.powerWatts ? '(' + dev.powerWatts + ' Вт)' : '' }}
                      {{ dev.batteryCapacityKwh ? '[' + dev.batteryCapacityKwh + ' кВт·год]' : '' }}
                    </option>
                  }
                </select>
              </div>

              <!-- Entry Mode Selector Cards (Specific Day / Time Interval / Cumulative Month / Delta) -->
              <div>
                <span class="block text-xs font-semibold text-slate-700 mb-1.5">
                  Оберіть період або спосіб обліку споживання *
                </span>
                <div class="grid grid-cols-2 gap-2">
                  <!-- Option 1: Specific Day -->
                  <button
                    type="button"
                    (click)="setDeviceLogEntryMode('single_day')"
                    class="p-2.5 rounded-xl border text-left flex items-start gap-2 cursor-pointer transition-all"
                    [class.border-sky-500]="deviceLogForm.get('entryMode')?.value === 'single_day'"
                    [class.bg-sky-50/70]="deviceLogForm.get('entryMode')?.value === 'single_day'"
                    [class.border-slate-200]="deviceLogForm.get('entryMode')?.value !== 'single_day'"
                  >
                    <mat-icon
                      class="text-base leading-none mt-0.5 shrink-0"
                      [class.text-sky-600]="deviceLogForm.get('entryMode')?.value === 'single_day'"
                      [class.text-slate-400]="deviceLogForm.get('entryMode')?.value !== 'single_day'"
                    >
                      today
                    </mat-icon>
                    <div>
                      <div class="text-xs font-bold text-slate-900">За конкретну добу</div>
                      <div class="text-3xs text-slate-500">Спожито за обраний день (+ до місяця)</div>
                    </div>
                  </button>

                  <!-- Option 2: Time Interval / Period Range -->
                  <button
                    type="button"
                    (click)="setDeviceLogEntryMode('period_range')"
                    class="p-2.5 rounded-xl border text-left flex items-start gap-2 cursor-pointer transition-all"
                    [class.border-indigo-500]="deviceLogForm.get('entryMode')?.value === 'period_range'"
                    [class.bg-indigo-50/70]="deviceLogForm.get('entryMode')?.value === 'period_range'"
                    [class.border-slate-200]="deviceLogForm.get('entryMode')?.value !== 'period_range'"
                  >
                    <mat-icon
                      class="text-base leading-none mt-0.5 shrink-0"
                      [class.text-indigo-600]="deviceLogForm.get('entryMode')?.value === 'period_range'"
                      [class.text-slate-400]="deviceLogForm.get('entryMode')?.value !== 'period_range'"
                    >
                      schedule
                    </mat-icon>
                    <div>
                      <div class="text-xs font-bold text-slate-900">За відрізок часу</div>
                      <div class="text-3xs text-slate-500">Часовий інтервал (ГГ:ХХ–ГГ:ХХ) або дні</div>
                    </div>
                  </button>

                  <!-- Option 3: Cumulative Month as of Date -->
                  <button
                    type="button"
                    (click)="setDeviceLogEntryMode('cumulative_month')"
                    class="p-2.5 rounded-xl border text-left flex items-start gap-2 cursor-pointer transition-all"
                    [class.border-emerald-500]="deviceLogForm.get('entryMode')?.value === 'cumulative_month'"
                    [class.bg-emerald-50/70]="deviceLogForm.get('entryMode')?.value === 'cumulative_month'"
                    [class.border-slate-200]="deviceLogForm.get('entryMode')?.value !== 'cumulative_month'"
                  >
                    <mat-icon
                      class="text-base leading-none mt-0.5 shrink-0"
                      [class.text-emerald-600]="deviceLogForm.get('entryMode')?.value === 'cumulative_month'"
                      [class.text-slate-400]="deviceLogForm.get('entryMode')?.value !== 'cumulative_month'"
                    >
                      calendar_month
                    </mat-icon>
                    <div>
                      <div class="text-xs font-bold text-slate-900">З початку місяця</div>
                      <div class="text-3xs text-slate-500">Сумарний показник станом на дату</div>
                    </div>
                  </button>

                  <!-- Option 4: Delta -->
                  <button
                    type="button"
                    (click)="setDeviceLogEntryMode('delta')"
                    class="p-2.5 rounded-xl border text-left flex items-start gap-2 cursor-pointer transition-all"
                    [class.border-amber-500]="deviceLogForm.get('entryMode')?.value === 'delta'"
                    [class.bg-amber-50/70]="deviceLogForm.get('entryMode')?.value === 'delta'"
                    [class.border-slate-200]="deviceLogForm.get('entryMode')?.value !== 'delta'"
                  >
                    <mat-icon
                      class="text-base leading-none mt-0.5 shrink-0"
                      [class.text-amber-600]="deviceLogForm.get('entryMode')?.value === 'delta'"
                      [class.text-slate-400]="deviceLogForm.get('entryMode')?.value !== 'delta'"
                    >
                      add_circle_outline
                    </mat-icon>
                    <div>
                      <div class="text-xs font-bold text-slate-900">+ Додати дельту</div>
                      <div class="text-3xs text-slate-500">Додати кВт·год до місячного підсумку</div>
                    </div>
                  </button>
                </div>
              </div>

              <!-- Dynamic Date & Time Interval Section -->
              @if (deviceLogForm.get('entryMode')?.value === 'period_range') {
                <div class="p-3.5 rounded-xl bg-indigo-50/60 border border-indigo-200 space-y-3">
                  <div class="flex items-center justify-between gap-2 flex-wrap">
                    <span class="text-2xs font-bold text-indigo-950 flex items-center gap-1">
                      <mat-icon class="text-sm text-indigo-600 leading-none">date_range</mat-icon>
                      <span>Вкажіть відрізок часу (початок та завершення):</span>
                    </span>
                    @if (calculatedLogDurationHours(); as durH) {
                      <span class="px-2 py-0.5 rounded-full bg-indigo-200/80 text-indigo-950 text-3xs font-mono font-bold">
                        Тривалість: {{ durH }} год
                      </span>
                    }
                  </div>

                  <!-- Quick Time Interval Presets -->
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      (click)="applyQuickTimeInterval('23:00', '07:00', true)"
                      class="px-2 py-1 rounded-lg bg-white hover:bg-indigo-100 border border-indigo-200 text-3xs font-semibold text-indigo-900 cursor-pointer"
                    >
                      🌙 Ніч 23:00–07:00 (8 год)
                    </button>
                    <button
                      type="button"
                      (click)="applyQuickTimeInterval('18:00', '23:00', false)"
                      class="px-2 py-1 rounded-lg bg-white hover:bg-indigo-100 border border-indigo-200 text-3xs font-semibold text-indigo-900 cursor-pointer"
                    >
                      🌆 Вечір 18:00–23:00 (5 год)
                    </button>
                    <button
                      type="button"
                      (click)="applyQuickTimeInterval('09:00', '17:00', false)"
                      class="px-2 py-1 rounded-lg bg-white hover:bg-indigo-100 border border-indigo-200 text-3xs font-semibold text-indigo-900 cursor-pointer"
                    >
                      ☀️ День 09:00–17:00 (8 год)
                    </button>
                    <button
                      type="button"
                      (click)="applyQuickTimeInterval('20:00', '22:00', false)"
                      class="px-2 py-1 rounded-lg bg-white hover:bg-indigo-100 border border-indigo-200 text-3xs font-semibold text-indigo-900 cursor-pointer"
                    >
                      ⏱️ 2 години (20:00–22:00)
                    </button>
                  </div>

                  <div class="grid grid-cols-2 gap-2.5">
                    <div>
                      <label for="dlog-start-date" class="block text-3xs font-bold uppercase text-indigo-900 mb-1">
                        Дата початку *
                      </label>
                      <input
                        id="dlog-start-date"
                        type="date"
                        formControlName="date"
                        (change)="onDeviceLogFormChange()"
                        class="w-full px-3 py-1.5 bg-white border border-indigo-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-indigo-600"
                      />
                    </div>
                    <div>
                      <label for="dlog-start-time" class="block text-3xs font-bold uppercase text-indigo-900 mb-1">
                        Час початку (ГГ:ХХ)
                      </label>
                      <input
                        id="dlog-start-time"
                        type="time"
                        formControlName="startTime"
                        (change)="onDeviceLogFormChange()"
                        class="w-full px-3 py-1.5 bg-white border border-indigo-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-indigo-600"
                      />
                    </div>
                    <div>
                      <label for="dlog-end-date" class="block text-3xs font-bold uppercase text-indigo-900 mb-1">
                        Дата завершення
                      </label>
                      <input
                        id="dlog-end-date"
                        type="date"
                        formControlName="endDate"
                        (change)="onDeviceLogFormChange()"
                        class="w-full px-3 py-1.5 bg-white border border-indigo-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-indigo-600"
                      />
                    </div>
                    <div>
                      <label for="dlog-end-time" class="block text-3xs font-bold uppercase text-indigo-900 mb-1">
                        Час завершення (ГГ:ХХ)
                      </label>
                      <input
                        id="dlog-end-time"
                        type="time"
                        formControlName="endTime"
                        (change)="onDeviceLogFormChange()"
                        class="w-full px-3 py-1.5 bg-white border border-indigo-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-indigo-600"
                      />
                    </div>
                  </div>

                  @if (estimatedKwhFromPowerAndDuration(); as estKwh) {
                    <div class="flex items-center justify-between gap-2 pt-1 border-t border-indigo-200/80">
                      <span class="text-3xs text-indigo-900">
                        @if (isSelectedLogDeviceAirConditioner()) {
                          За профілем кондиціонера (пік {{ selectedLogDevice()?.powerWatts || 2200 }} Вт → робочий 400–800 Вт·г × {{ calculatedLogDurationHours() }} год):
                        } @else {
                          За потужністю приладу ({{ selectedLogDevice()?.powerWatts }} Вт × {{ calculatedLogDurationHours() }} год):
                        }
                        <b>~{{ estKwh }} кВт·год</b>
                      </span>
                      <button
                        type="button"
                        (click)="applyEstimatedKwhToLogForm(estKwh)"
                        class="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-3xs font-bold cursor-pointer shrink-0"
                      >
                        Підставити {{ estKwh }} кВт·год
                      </button>
                    </div>
                  }
                </div>
              } @else if (deviceLogForm.get('entryMode')?.value === 'single_day') {
                <div class="p-3.5 rounded-xl bg-sky-50/60 border border-sky-200 space-y-2.5">
                  <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label for="dlog-day-date" class="block text-3xs font-bold uppercase text-sky-900 mb-1">
                        Конкретна доба (дата) *
                      </label>
                      <input
                        id="dlog-day-date"
                        type="date"
                        formControlName="date"
                        (change)="onDeviceLogFormChange()"
                        class="w-full px-3 py-1.5 bg-white border border-sky-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-sky-600"
                      />
                    </div>
                    <div>
                      <label for="dlog-day-start" class="block text-3xs font-bold uppercase text-sky-900 mb-1">
                        З (час, необов'язково)
                      </label>
                      <input
                        id="dlog-day-start"
                        type="time"
                        formControlName="startTime"
                        (change)="onDeviceLogFormChange()"
                        class="w-full px-3 py-1.5 bg-white border border-sky-300 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:border-sky-600"
                      />
                    </div>
                    <div>
                      <label for="dlog-day-end" class="block text-3xs font-bold uppercase text-sky-900 mb-1">
                        До (час, необов'язково)
                      </label>
                      <input
                        id="dlog-day-end"
                        type="time"
                        formControlName="endTime"
                        (change)="onDeviceLogFormChange()"
                        class="w-full px-3 py-1.5 bg-white border border-sky-300 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:border-sky-600"
                      />
                    </div>
                  </div>
                </div>
              } @else {
                <div>
                  <label for="dlog-date" class="block text-xs font-semibold text-slate-700 mb-1">
                    Дата у цьому місяці *
                  </label>
                  <input
                    id="dlog-date"
                    type="date"
                    formControlName="date"
                    (change)="onDeviceLogFormChange()"
                    class="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-amber-500"
                  />
                </div>
              }

              <!-- Automatic Weather Attachment for Selected Date -->
              @if (currentFormLogWeather(); as logDayW) {
                <div class="p-3 rounded-xl bg-sky-50 dark:bg-slate-800 border border-sky-200 dark:border-slate-700 flex items-center justify-between gap-3">
                  <div class="flex items-center gap-2.5">
                    <div class="w-8 h-8 rounded-lg bg-sky-600 text-white flex items-center justify-center shrink-0">
                      <mat-icon class="text-base">{{ logDayW.icon }}</mat-icon>
                    </div>
                    <div>
                      <div class="text-2xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                        <span>Погода на {{ formatDate(logDayW.date) }}:</span>
                        <span class="font-mono text-sky-700 dark:text-sky-300">{{ logDayW.tempAvgC > 0 ? '+' : '' }}{{ logDayW.tempAvgC }}°C ({{ logDayW.tempMinC > 0 ? '+' : '' }}{{ logDayW.tempMinC }}°..{{ logDayW.tempMaxC > 0 ? '+' : '' }}{{ logDayW.tempMaxC }}°C)</span>
                        <span>• {{ logDayW.condition }}</span>
                      </div>
                      <div class="text-3xs text-slate-500 dark:text-slate-400">
                        Дані про температуру автоматично збережуться у записі для точного прогнозу споживання
                      </div>
                    </div>
                  </div>
                  <span class="px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-200 border border-sky-300 dark:border-sky-700 text-3xs font-bold shrink-0">
                    Авто-погода
                  </span>
                </div>
              }

              <!-- EV Battery Charge Helper (when Volkswagen E-Golf 2014 24 kWh or any EV/battery device is selected) -->
              @if (selectedLogDevice()?.batteryCapacityKwh; as batCap) {
                <div class="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 space-y-2.5">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-2xs font-bold text-blue-950 flex items-center gap-1.5">
                      <mat-icon class="text-sm text-blue-600 leading-none">electric_car</mat-icon>
                      <span>Швидкий розрахунок зарядки батареї ({{ batCap }} кВт·год):</span>
                    </span>
                  </div>
                  <div class="grid grid-cols-3 gap-2 items-end">
                    <div>
                      <label for="ev-soc-start" class="block text-3xs font-semibold text-blue-900 mb-1">
                        Заряд ДО (%)
                      </label>
                      <input
                        id="ev-soc-start"
                        type="number"
                        min="0"
                        max="100"
                        [value]="evChargeStartPct()"
                        (input)="evChargeStartPct.set(+$any($event.target).value || 0)"
                        class="w-full px-2.5 py-1.5 bg-white border border-blue-300 rounded-lg text-xs font-mono font-bold text-slate-900"
                      />
                    </div>
                    <div>
                      <label for="ev-soc-end" class="block text-3xs font-semibold text-blue-900 mb-1">
                        Заряд ПІСЛЯ (%)
                      </label>
                      <input
                        id="ev-soc-end"
                        type="number"
                        min="0"
                        max="100"
                        [value]="evChargeEndPct()"
                        (input)="evChargeEndPct.set(+$any($event.target).value || 0)"
                        class="w-full px-2.5 py-1.5 bg-white border border-blue-300 rounded-lg text-xs font-mono font-bold text-slate-900"
                      />
                    </div>
                    <button
                      type="button"
                      (click)="applyEvBatteryChargeCalculation(batCap)"
                      class="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-2xs font-bold cursor-pointer"
                    >
                      = {{ calculateEvChargeKwh(batCap) }} кВт·г
                    </button>
                  </div>
                </div>
              }

              <!-- Tariff Rate Zone Selector (NIGHT / DAY / AUTO TIME) -->
              <div>
                <label for="dlog-tariff-selection" class="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between flex-wrap gap-1">
                  <span>Режим розрахунку тарифу *</span>
                  @if (deviceLogForm.get('tariffSelection')?.value === 'night_only') {
                    <span class="text-3xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                      🌙 Ніч (Т1) (23:00–07:00)
                    </span>
                  } @else if (deviceLogForm.get('tariffSelection')?.value === 'day_only') {
                    <span class="text-3xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                      ☀️ День (Т2) (07:00–23:00)
                    </span>
                  } @else {
                    <span class="text-3xs font-medium text-slate-500">
                      ⏱️ Авторозрахунок по часу
                    </span>
                  }
                </label>
                <select
                  id="dlog-tariff-selection"
                  formControlName="tariffSelection"
                  class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500 shadow-2xs"
                >
                  <option value="night_only">Спожито за нічним тарифом</option>
                  <option value="day_only">Спожито за денним тарифом</option>
                  <option value="auto_time">Розрахувати по часу</option>
                </select>
              </div>

              <!-- Consumed kWh & Comment -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label for="dlog-kwh" class="block text-xs font-semibold text-slate-700 mb-1">
                    Спожито електроенергії (кВт·год) *
                  </label>
                  <input
                    id="dlog-kwh"
                    type="number"
                    step="0.01"
                    min="0"
                    formControlName="consumedKwh"
                    placeholder="Напр. 12.5"
                    class="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono font-bold text-slate-900 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label for="dlog-comment" class="block text-xs font-semibold text-slate-700 mb-1">
                    Коментар (необов'язково)
                  </label>
                  <input
                    id="dlog-comment"
                    type="text"
                    formControlName="comment"
                    placeholder="Напр. Обігрів ввечері / Зарядка авто"
                    class="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </div>

            <div class="flex items-center justify-end gap-2.5 p-4 border-t border-slate-200 bg-slate-50 shrink-0">
              <button
                type="button"
                (click)="closeDeviceLogModal()"
                class="px-4 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Скасувати
              </button>
              <button
                type="submit"
                [disabled]="deviceLogForm.invalid || isSavingDevices()"
                class="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white cursor-pointer disabled:opacity-50"
              >
                {{ editingDeviceLogId() ? 'Зберегти зміни' : 'Додати споживання' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- ======================================================== -->
    <!-- MODAL 3: UPLOAD SCREENSHOT + COMMENT AI ANALYSIS         -->
    <!-- ======================================================== -->
    @if (isScreenshotModalOpen()) {
      <div
        class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/65 backdrop-blur-xs p-3 sm:p-4 flex items-center justify-center"
        (paste)="onScreenshotPaste($event)"
      >
        <div class="w-full max-w-xl bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[94dvh] animate-in fade-in zoom-in-95 duration-150 my-auto">
          <!-- Header -->
          <div class="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-white shrink-0">
            <div class="flex items-center gap-2.5">
              <div class="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                <mat-icon>add_photo_alternate</mat-icon>
              </div>
              <div>
                <h3 class="text-base font-bold text-slate-900">
                  Аналіз скріншоту споживання електроенергії (ШІ)
                </h3>
                <p class="text-3xs text-slate-500">
                  Завантажте скріншот, додайте коментар-пояснення та виберіть пристрій для зарахування кВт·год
                </p>
              </div>
            </div>
            <button
              type="button"
              (click)="closeScreenshotModal()"
              class="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center cursor-pointer"
            >
              <mat-icon class="text-lg">close</mat-icon>
            </button>
          </div>

          <div class="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
            <!-- Step 1: Select Device (or create new inline) & Date -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div class="sm:col-span-2">
                <label for="scr-device-select" class="block text-xs font-semibold text-slate-700 mb-1">
                  Пристрій, до якого додати споживання *
                </label>
                <select
                  id="scr-device-select"
                  [value]="screenshotTargetDeviceId()"
                  (change)="onScreenshotDeviceSelect($any($event.target).value)"
                  class="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-500"
                >
                  @for (dev of accountDevices(); track dev.id) {
                    <option [value]="dev.id">{{ dev.name }} {{ dev.powerWatts ? '(' + dev.powerWatts + ' Вт)' : '' }}</option>
                  }
                  <option value="__new__">+ Створити новий пристрій прямо зараз...</option>
                </select>
              </div>

              <div>
                <label for="scr-date" class="block text-xs font-semibold text-slate-700 mb-1">
                  Станом на дату *
                </label>
                <input
                  id="scr-date"
                  type="date"
                  [value]="screenshotDate()"
                  (change)="screenshotDate.set($any($event.target).value)"
                  class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <!-- Weather on Screenshot Date -->
            @if (currentScreenshotWeather(); as scrW) {
              <div class="p-2.5 rounded-xl bg-sky-50 dark:bg-slate-800 border border-sky-200 dark:border-slate-700 flex items-center justify-between gap-2 text-2xs">
                <div class="flex items-center gap-2">
                  <mat-icon class="text-base text-sky-600 dark:text-sky-400 leading-none">{{ scrW.icon }}</mat-icon>
                  <span class="text-slate-800 dark:text-slate-200">
                    Погода на <b>{{ formatDate(scrW.date) }}</b>:
                    <b class="font-mono text-sky-800 dark:text-sky-300">{{ scrW.tempAvgC > 0 ? '+' : '' }}{{ scrW.tempAvgC }}°C</b>
                    ({{ scrW.tempMinC > 0 ? '+' : '' }}{{ scrW.tempMinC }}°..{{ scrW.tempMaxC > 0 ? '+' : '' }}{{ scrW.tempMaxC }}°C, {{ scrW.condition }}) — додасться до показу
                  </span>
                </div>
              </div>
            }

            <!-- Inline New Device Name if __new__ is selected -->
            @if (screenshotTargetDeviceId() === '__new__') {
              <div class="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-2.5">
                <div class="text-2xs font-bold text-emerald-900 flex items-center gap-1.5">
                  <mat-icon class="text-sm text-emerald-600 leading-none">add_circle</mat-icon>
                  <span>Новий пристрій буде створено автоматично при збереженні:</span>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div class="sm:col-span-2">
                    <input
                      type="text"
                      [value]="screenshotNewDeviceName()"
                      (input)="screenshotNewDeviceName.set($any($event.target).value)"
                      placeholder="Назва пристрою (напр. Бойлер, Кондиціонер, Пральна машина)"
                      class="w-full px-3 py-2 bg-white border border-emerald-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                  <div>
                    <input
                      type="number"
                      min="0"
                      [value]="screenshotNewDeviceWatts() || ''"
                      (input)="screenshotNewDeviceWatts.set(+$any($event.target).value || null)"
                      placeholder="Потужність (Вт)"
                      class="w-full px-3 py-2 bg-white border border-emerald-300 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>
              </div>
            }

            <!-- Step 2: Upload / Paste Screenshot Image -->
            <div>
              <span class="block text-xs font-semibold text-slate-700 mb-1">
                Скріншот або фото (можна вибрати файл або вставити через Ctrl+V) *
              </span>
              @if (!screenshotBase64()) {
                <label
                  class="flex flex-col items-center justify-center p-6 border-2 border-dashed border-emerald-300 hover:border-emerald-500 rounded-2xl bg-emerald-50/30 hover:bg-emerald-50/60 transition-colors cursor-pointer text-center"
                >
                  <mat-icon class="text-3xl text-emerald-600 mb-1.5">cloud_upload</mat-icon>
                  <span class="text-xs font-bold text-slate-800">
                    Натисніть, щоб обрати скріншот, або вставте з буфера (Ctrl+V)
                  </span>
                  <span class="text-3xs text-slate-500 mt-0.5">
                    Підтримуються скріншоти з Tuya, Smart Life, Tapo, Sonoff, EcoFlow, Xiaomi та фото ватметрів
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    (change)="onScreenshotFileSelected($event)"
                    class="hidden"
                  />
                </label>
              } @else {
                <div class="relative rounded-2xl border border-slate-200 bg-slate-900/5 p-2 flex items-center justify-center max-h-56 overflow-hidden">
                  <img
                    [src]="screenshotBase64()"
                    alt="Скріншот споживання"
                    class="max-h-52 w-auto object-contain rounded-xl"
                  />
                  <button
                    type="button"
                    (click)="clearScreenshotImage()"
                    class="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-slate-900/80 hover:bg-rose-600 text-white text-2xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <mat-icon class="text-xs leading-none">delete</mat-icon>
                    <span>Змінити фото</span>
                  </button>
                </div>
              }
            </div>

            <!-- Step 3: User Comment / Explanation of what is shown -->
            <div>
              <label for="scr-comment" class="block text-xs font-semibold text-slate-700 mb-1">
                Коментар до цього фото (пояснення, що відображено) *
              </label>
              <textarea
                id="scr-comment"
                rows="2"
                [value]="screenshotComment()"
                (input)="screenshotComment.set($any($event.target).value)"
                placeholder="Наприклад: Це скріншот з розумної розетки бойлера за поточний місяць, візьми число за жовтень (або: тут у Вт·год, переведи у кВт·год)"
                class="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
              ></textarea>
            </div>

            <!-- Analyze Button -->
            <div class="flex items-center justify-between gap-3">
              <button
                type="button"
                (click)="analyzeUploadedScreenshot()"
                [disabled]="!screenshotBase64() || isAnalyzingScreenshot()"
                class="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-sm transition-all"
              >
                @if (isAnalyzingScreenshot()) {
                  <span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>ШІ аналізує скріншот та ваш коментар...</span>
                } @else {
                  <mat-icon class="text-base leading-none">auto_awesome</mat-icon>
                  <span>Проаналізувати скріншот за коментарем</span>
                }
              </button>
            </div>

            @if (screenshotError()) {
              <div class="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                <mat-icon class="text-rose-600 text-base shrink-0">error_outline</mat-icon>
                <span>{{ screenshotError() }}</span>
              </div>
            }

            <!-- Step 4: AI Analysis Result & Adjustable kWh before saving -->
            @if (screenshotAnalysisResult(); as aiRes) {
              <div class="p-4 rounded-2xl bg-teal-50/70 border border-teal-300 space-y-3 animate-in fade-in duration-150">
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-1.5 text-xs font-bold text-teal-950">
                    <mat-icon class="text-teal-600 text-base leading-none">check_circle</mat-icon>
                    <span>Результат AI-аналізу скріншоту та коментаря</span>
                  </div>
                  <span class="px-2 py-0.5 rounded-full text-3xs font-bold uppercase bg-teal-200/80 text-teal-900">
                    Розпізнано успішно
                  </span>
                </div>

                <p class="text-xs text-teal-900 bg-white/90 p-3 rounded-xl border border-teal-200 leading-relaxed">
                  {{ aiRes.explanation }}
                </p>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label for="scr-parsed-kwh" class="block text-2xs font-bold text-teal-900 mb-1">
                      Кількість спожитої електроенергії (кВт·год)
                    </label>
                    <input
                      id="scr-parsed-kwh"
                      type="number"
                      step="0.01"
                      min="0"
                      [value]="screenshotExtractedKwh()"
                      (input)="screenshotExtractedKwh.set(+$any($event.target).value || 0)"
                      class="w-full px-3.5 py-2 bg-white border border-teal-400 rounded-xl text-base font-mono font-black text-slate-900 focus:outline-none focus:border-teal-600"
                    />
                  </div>
                  <div>
                    <label for="scr-parsed-mode" class="block text-2xs font-bold text-teal-900 mb-1">
                      Період / режим зарахування
                    </label>
                    <select
                      id="scr-parsed-mode"
                      [value]="screenshotExtractedMode()"
                      (change)="screenshotExtractedMode.set($any($event.target).value)"
                      class="w-full px-3 py-2.5 bg-white border border-teal-400 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-teal-600"
                    >
                      <option value="single_day">За конкретну добу (+ до місяця)</option>
                      <option value="period_range">За відрізок часу / період (+ до місяця)</option>
                      <option value="cumulative_month">Станом на дату (з початку місяця)</option>
                      <option value="delta">+ Додати до вже внесеного (дельта)</option>
                    </select>
                  </div>
                </div>

                @if (screenshotExtractedMode() === 'single_day' || screenshotExtractedMode() === 'period_range') {
                  <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                    @if (screenshotExtractedMode() === 'period_range') {
                      <div>
                        <label for="scr-end-date" class="block text-3xs font-bold text-teal-900 mb-1">
                          Дата завершення
                        </label>
                        <input
                          id="scr-end-date"
                          type="date"
                          [value]="screenshotEndDate()"
                          (change)="screenshotEndDate.set($any($event.target).value)"
                          class="w-full px-2.5 py-1.5 bg-white border border-teal-300 rounded-lg text-xs text-slate-900"
                        />
                      </div>
                    }
                    <div>
                      <label for="scr-start-time" class="block text-3xs font-bold text-teal-900 mb-1">
                        Час початку (ГГ:ХХ)
                      </label>
                      <input
                        id="scr-start-time"
                        type="time"
                        [value]="screenshotStartTime()"
                        (change)="screenshotStartTime.set($any($event.target).value)"
                        class="w-full px-2.5 py-1.5 bg-white border border-teal-300 rounded-lg text-xs font-mono text-slate-900"
                      />
                    </div>
                    <div>
                      <label for="scr-end-time" class="block text-3xs font-bold text-teal-900 mb-1">
                        Час завершення (ГГ:ХХ)
                      </label>
                      <input
                        id="scr-end-time"
                        type="time"
                        [value]="screenshotEndTime()"
                        (change)="screenshotEndTime.set($any($event.target).value)"
                        class="w-full px-2.5 py-1.5 bg-white border border-teal-300 rounded-lg text-xs font-mono text-slate-900"
                      />
                    </div>
                  </div>
                }
              </div>
            }
          </div>

          <!-- Footer -->
          <div class="flex items-center justify-end gap-2.5 p-4 border-t border-slate-200 bg-slate-50 shrink-0">
            <button
              type="button"
              (click)="closeScreenshotModal()"
              class="px-4 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Скасувати
            </button>
            <button
              type="button"
              (click)="applyScreenshotToDevice()"
              [disabled]="screenshotExtractedKwh() === null || screenshotExtractedKwh()! < 0 || isSavingDevices()"
              class="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-2xs"
            >
              <mat-icon class="text-sm leading-none">add_task</mat-icon>
              <span>Додати {{ screenshotExtractedKwh() ?? 0 }} кВт·год до пристрою</span>
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ElectricityView {
  private readonly destroyRef = inject(DestroyRef);
  readonly dataService = inject(IptvData);
  readonly viewMode = input<'all' | 'schedule' | 'readings'>('all');
  readonly liveKyivTime = signal<string>('');
  readonly availableQueues = ['1.1', '1.2', '2.1', '2.2', '3.1', '3.2', '4.1', '4.2', '5.1', '5.2', '6.1', '6.2'];
  readonly manualQueue = signal<string | null>(null);

  selectManualQueue(q: string): void {
    this.manualQueue.set(q);
    const acc = this.currentAccount();
    if (acc) {
      void this.dataService.saveUtilityAccount({
        ...acc,
        dtekQueueGroup: `GPV${q}`,
      });
    }
  }

  private updateLiveKyivTime(): void {
    try {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('uk-UA', {
        timeZone: 'Europe/Kyiv',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      this.liveKyivTime.set(formatter.format(now));
    } catch {
      const now = new Date();
      this.liveKyivTime.set(now.toTimeString().split(' ')[0]);
    }
  }

  readonly canEdit = this.dataService.canEdit;
  readonly electricityAccounts = this.dataService.electricityAccounts;
  readonly currentUtilityTab = computed<UtilityServiceTabId>(() =>
    this.viewMode() === 'schedule' ? 'outage_schedule' : 'electricity'
  );
  readonly visibleAccountsForCurrentTab = computed<UtilityAccount[]>(() =>
    this.dataService.getVisibleAccountsForTab(this.currentUtilityTab())
  );
  readonly hiddenAccountsForCurrentTab = computed<UtilityAccount[]>(() =>
    this.dataService.getHiddenAccountsForTab(this.currentUtilityTab())
  );
  readonly showHiddenHousesPanel = signal<boolean>(false);
  readonly utilityTariffs = this.dataService.utilityTariffs;
  readonly defaultDtekAccountId = this.dataService.defaultDtekAccountId;
  readonly isSavingDefaultHouse = this.dataService.isSavingDefaultHouse;

  async toggleHideHouseInCurrentTab(accountId: string): Promise<void> {
    await this.dataService.toggleHouseVisibilityInTab(accountId, this.currentUtilityTab());
    const visible = this.visibleAccountsForCurrentTab();
    if (visible.length > 0 && !visible.some((a) => a.id === this.selectedAccountId())) {
      this.selectedAccountId.set(visible[0].id);
    }
  }

  readonly dtekInfo = this.dataService.dtekShutdownInfo;
  readonly isDtekLoading = this.dataService.isDtekLoading;
  readonly dtekError = this.dataService.dtekError;

  readonly dtekStatus = computed(() => {
    const info = this.dtekInfo();
    if (!info) return null;

    const now = new Date();
    const currentHourNumber = info.currentKyivHour || (now.getHours() + 1); // 1..24 in Kyiv time
    const currentMinute = now.getMinutes();

    let isFactOutageNow = false;
    if (info.startDate && info.endDate) {
      const start = new Date(info.startDate);
      const end = new Date(info.endDate);
      isFactOutageNow = now >= start && now <= end;
    }

    const chosenQueue = this.manualQueue() || (info.queueGroup ? info.queueGroup.replace('GPV', '') : '3.1');
    const matchedQueue = (info.allQueuesSchedules || []).find(
      (q) => q.queueNumber === chosenQueue || q.queueKey === `GPV${chosenQueue}`
    );
    const scheduleList = matchedQueue?.hourlySchedule || info.hourlySchedule || [];
    const currentHourItem = scheduleList.find((item) => item.hour === currentHourNumber) || null;

    let isScheduledPowerOn = true;
    if (currentHourItem) {
      if (currentMinute < 30) {
        isScheduledPowerOn = currentHourItem.firstHalfPower;
      } else {
        isScheduledPowerOn = currentHourItem.secondHalfPower;
      }
    }

    const isPowerAvailableNow = !isFactOutageNow && isScheduledPowerOn;

    let totalPowerHours = 0;
    let totalOutageHours = 0;

    for (const h of scheduleList) {
      if (h.firstHalfPower && h.secondHalfPower) {
        totalPowerHours += 1;
      } else if (!h.firstHalfPower && !h.secondHalfPower) {
        totalOutageHours += 1;
      } else {
        totalPowerHours += 0.5;
        totalOutageHours += 0.5;
      }
    }

    const dailySchedules = info.dailySchedules || [];
    const tomorrowSchedule =
      info.tomorrowSchedule || (dailySchedules.length > 1 ? dailySchedules[1] : null);

    return {
      info,
      now,
      currentHourNumber,
      currentMinute,
      isFactOutageNow,
      isScheduledPowerOn,
      isPowerAvailableNow,
      currentHourItem,
      totalPowerHours,
      totalOutageHours,
      queueGroup: 'GPV' + chosenQueue,
      scheduleDate: info.scheduleDate || info.updateFact?.split(' ')[0] || '',
      startDate: info.startDate || null,
      endDate: info.endDate || null,
      subType: info.subType || '',
      subStatus: info.subStatus || '',
      updateFact: info.updateFact || '',
      updateFactKyiv: info.updateFact ? (info.updateFact.includes('Києв') ? info.updateFact : `${info.updateFact} (за Києвом)`) : '',
      hourlySchedule: scheduleList,
      dailySchedules,
      tomorrowSchedule,
    };
  });

  readonly dtekCities = this.dataService.dtekCities;
  readonly dtekStreets = this.dataService.dtekStreets;
  readonly isDtekCatalogLoading = this.dataService.isDtekCatalogLoading;

  // Queue tiles & house address state
  readonly forceShowQueuesMode = signal<boolean>(false);
  readonly expandedQueueKeys = signal<Record<string, boolean>>({});

  hasAccountAddress(acc: UtilityAccount | null | undefined): boolean {
    if (!acc) return false;
    const hasStructured = Boolean(
      acc.city && acc.city.trim() && acc.street && acc.street.trim() && acc.houseNum && acc.houseNum.trim()
    );
    const hasFreeAddress = Boolean(acc.address && acc.address.trim().length > 3);
    return hasStructured || hasFreeAddress;
  }

  getAccountFormattedAddress(acc: UtilityAccount | null | undefined): string {
    if (!acc) return '';
    if (acc.city && acc.street && acc.houseNum) {
      return `${acc.city}, ${acc.street}, буд. ${acc.houseNum}`;
    }
    return acc.address?.trim() || '';
  }

  readonly hasHouseWithAddress = computed<boolean>(() => {
    const acc = this.currentAccount();
    return this.hasAccountAddress(acc);
  });

  isQueueDropdownOpen(queueKey: string): boolean {
    return !!this.expandedQueueKeys()[queueKey];
  }

  toggleQueueDropdown(queueKey: string): void {
    this.expandedQueueKeys.update((prev) => ({
      ...prev,
      [queueKey]: !prev[queueKey],
    }));
  }

  readonly allQueuesList = computed<DtekQueueSchedule[]>(() => {
    const fromServer = this.dtekInfo()?.allQueuesSchedules;
    if (Array.isArray(fromServer) && fromServer.length > 0) {
      return fromServer;
    }
    const fallbackNumbers = [
      '1.1', '1.2',
      '2.1', '2.2',
      '3.1', '3.2',
      '4.1', '4.2',
      '5.1', '5.2',
      '6.1', '6.2',
    ];
    const defaultHours: DtekHourSchedule[] = [];
    for (let h = 1; h <= 24; h++) {
      const fromHour = String(h - 1).padStart(2, '0');
      const toHour = String(h).padStart(2, '0');
      defaultHours.push({
        hour: h,
        fromTime: `${fromHour}:00`,
        toTime: `${toHour}:00`,
        timeLabel: `${fromHour}:00 - ${toHour}:00`,
        statusKey: 'yes',
        statusLabel: 'Світло є',
        firstHalfPower: true,
        secondHalfPower: true,
      });
    }
    return fallbackNumbers.map((num) => ({
      queueKey: `GPV${num}`,
      queueNumber: num,
      queueTitle: `Черга ${num}`,
      scheduleDate: this.dtekStatus()?.scheduleDate || '',
      isPowerAvailableNow: true,
      totalPowerHours: 24,
      totalOutageHours: 0,
      outageIntervals: [],
      hourlySchedule: defaultHours,
      tomorrowSchedule: null,
    }));
  });

  // Card search bar signals
  readonly isCardAddressOpen = signal<boolean>(false);
  readonly cardCity = signal<string>('с-ще Окни');
  readonly cardStreet = signal<string>('вул. Шкільна');
  readonly cardHouse = signal<string>('11');
  readonly cardCityQuery = signal<string>('с-ще Окни');
  readonly cardStreetQuery = signal<string>('вул. Шкільна');
  readonly cardHouseInput = signal<string>('11');
  readonly showCardCitySuggestions = signal<boolean>(false);
  readonly showCardStreetSuggestions = signal<boolean>(false);

  readonly activeDtekCity = computed(() => this.cardCity() || 'с-ще Окни');
  readonly activeDtekStreet = computed(() => this.cardStreet() || 'вул. Шкільна');
  readonly activeDtekHouse = computed(() => this.cardHouse() || '11');

  // Form autocomplete signals
  readonly formCityQuery = signal<string>('');
  readonly formStreetQuery = signal<string>('');
  readonly showFormCitySuggestions = signal<boolean>(false);
  readonly showFormStreetSuggestions = signal<boolean>(false);

  readonly filteredCardCities = computed(() => {
    const q = this.cardCityQuery().trim().toLowerCase();
    const all = this.dtekCities();
    if (!q) return all.slice(0, 15);
    return all
      .filter((c) => c.toLowerCase().includes(q))
      .sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.toLowerCase().startsWith(q) ? 0 : 1;
        return aStarts - bStarts || a.localeCompare(b, 'uk');
      })
      .slice(0, 15);
  });

  readonly filteredCardStreets = computed(() => {
    const q = this.cardStreetQuery().trim().toLowerCase();
    const all = this.dtekStreets();
    if (!q) return all.slice(0, 20);
    return all
      .filter((s) => s.toLowerCase().includes(q))
      .sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.toLowerCase().startsWith(q) ? 0 : 1;
        return aStarts - bStarts || a.localeCompare(b, 'uk');
      })
      .slice(0, 20);
  });

  readonly filteredFormCities = computed(() => {
    const q = this.formCityQuery().trim().toLowerCase();
    const all = this.dtekCities();
    if (!q) return all.slice(0, 15);
    return all
      .filter((c) => c.toLowerCase().includes(q))
      .sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.toLowerCase().startsWith(q) ? 0 : 1;
        return aStarts - bStarts || a.localeCompare(b, 'uk');
      })
      .slice(0, 15);
  });

  readonly filteredFormStreets = computed(() => {
    const q = this.formStreetQuery().trim().toLowerCase();
    const all = this.dtekStreets();
    if (!q) return all.slice(0, 20);
    return all
      .filter((s) => s.toLowerCase().includes(q))
      .sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.toLowerCase().startsWith(q) ? 0 : 1;
        return aStarts - bStarts || a.localeCompare(b, 'uk');
      })
      .slice(0, 20);
  });

  refreshDtekSchedule(): void {
    const city = this.activeDtekCity();
    const street = this.activeDtekStreet();
    const house = this.activeDtekHouse();
    this.dataService.fetchDtekShutdowns(city, street, house, true);
  }

  toggleCardAddress(): void {
    this.isCardAddressOpen.update((v) => !v);
  }

  onCardCityInput(val: string): void {
    this.cardCityQuery.set(val);
    this.showCardCitySuggestions.set(true);
  }

  selectCardCity(city: string): void {
    this.cardCityQuery.set(city);
    this.cardCity.set(city);
    this.showCardCitySuggestions.set(false);
    this.cardStreetQuery.set('');
    this.dataService.fetchDtekCatalog(city);
  }

  onCardStreetInput(val: string): void {
    this.cardStreetQuery.set(val);
    this.showCardStreetSuggestions.set(true);
  }

  selectCardStreet(street: string): void {
    this.cardStreetQuery.set(street);
    this.cardStreet.set(street);
    this.showCardStreetSuggestions.set(false);
  }

  applyCardAddress(): void {
    const city = this.cardCityQuery().trim() || this.cardCity();
    const street = this.cardStreetQuery().trim() || this.cardStreet();
    const house = this.cardHouseInput().trim() || this.cardHouse();
    this.cardCity.set(city);
    this.cardStreet.set(street);
    this.cardHouse.set(house);
    this.showCardCitySuggestions.set(false);
    this.showCardStreetSuggestions.set(false);
    this.dataService.fetchDtekShutdowns(city, street, house, true);
  }

  async saveCardAddressToCurrentAccount(): Promise<void> {
    const acc = this.currentAccount();
    if (!acc) return;
    const city = this.cardCityQuery().trim() || this.cardCity();
    const street = this.cardStreetQuery().trim() || this.cardStreet();
    const house = this.cardHouseInput().trim() || this.cardHouse();
    const formattedAddr = [city, street, house ? `буд. ${house}` : ''].filter(Boolean).join(', ');

    await this.dataService.saveUtilityAccount({
      id: acc.id,
      type: 'electricity',
      city,
      street,
      houseNum: house,
      address: formattedAddr,
    });
    this.applyCardAddress();
  }

  onFormCityInput(val: string): void {
    this.formCityQuery.set(val);
    this.accountForm.patchValue({ city: val });
    this.showFormCitySuggestions.set(true);
    this.updateFormFullAddress();
  }

  selectFormCity(city: string): void {
    this.formCityQuery.set(city);
    this.accountForm.patchValue({ city, street: '' });
    this.formStreetQuery.set('');
    this.showFormCitySuggestions.set(false);
    this.dataService.fetchDtekCatalog(city);
    this.updateFormFullAddress();
  }

  onFormStreetInput(val: string): void {
    this.formStreetQuery.set(val);
    this.accountForm.patchValue({ street: val });
    this.showFormStreetSuggestions.set(true);
    this.updateFormFullAddress();
  }

  selectFormStreet(street: string): void {
    this.formStreetQuery.set(street);
    this.accountForm.patchValue({ street });
    this.showFormStreetSuggestions.set(false);
    this.updateFormFullAddress();
  }

  onFormHouseInput(val: string): void {
    this.accountForm.patchValue({ houseNum: val });
    this.updateFormFullAddress();
  }

  updateFormFullAddress(): void {
    const city = this.accountForm.get('city')?.value || '';
    const street = this.accountForm.get('street')?.value || '';
    const house = this.accountForm.get('houseNum')?.value || '';
    const full = [city, street, house ? `буд. ${house}` : ''].filter(Boolean).join(', ');
    this.accountForm.patchValue({ address: full }, { emitEvent: false });
  }

  cleanReadingNote(note?: string | null): string {
    if (!note) return '';
    return note
      .replace(/\[Зима\s*>[^\]]+\]/g, '')
      .replace(/Зима\s*>[^;,\n]+/g, '')
      .trim();
  }

  readonly Math = Math;
  readonly selectedAccountId = signal<string>('');
  readonly activeTab = signal<'table' | 'devices' | 'analytics'>('table');
  readonly filterPurpose = signal<'all' | 'billing' | 'control'>('all');

  // ========================================================
  // COLLAPSIBLE SECTIONS & COMPACT VIEW STATE (Електро)
  // ========================================================
  readonly isAccountCardExpanded = signal<boolean>(true);
  readonly isWeatherSectionExpanded = signal<boolean>(true);
  readonly isOverviewKpiExpanded = signal<boolean>(true);
  readonly isUsageWarningExpanded = signal<boolean>(true);
  readonly isDevicesSectionExpanded = signal<boolean>(true);
  readonly isChartsSectionExpanded = signal<boolean>(true);
  readonly isInsightsSectionExpanded = signal<boolean>(true);
  readonly isHistoryTableExpanded = signal<boolean>(true);
  readonly isAnalyticsChartExpanded = signal<boolean>(true);

  // Device list layout view mode ('cards' or 'list')
  readonly deviceViewLayout = signal<'cards' | 'list'>('cards');

  // Smart card power toggle state (maps deviceId -> boolean, defaults to true = Ввімкнено)
  readonly devicePowerStates = signal<Record<string, boolean>>({});

  isDevicePowerOn(deviceId: string): boolean {
    const map = this.devicePowerStates();
    return map[deviceId] !== undefined ? map[deviceId] : true;
  }

  toggleDevicePowerState(deviceId: string): void {
    const current = this.isDevicePowerOn(deviceId);
    this.devicePowerStates.update((prev) => ({
      ...prev,
      [deviceId]: !current,
    }));
  }

  getSmartCardArchetype(item: {
    device: ElectricityDevice;
    isAirConditioner?: boolean;
  }): 'ac' | 'boiler' | 'ev' | 'other' {
    const dev = item.device;
    const nameLower = (dev.name || '').toLowerCase();
    if (
      dev.category === 'ev' ||
      dev.icon === 'electric_car' ||
      /golf|авто|електромобіль|ev|tesla|leaf|car/i.test(nameLower) ||
      (dev.batteryCapacityKwh && dev.batteryCapacityKwh >= 12)
    ) {
      return 'ev';
    }
    if (
      dev.category === 'boiler' ||
      dev.icon === 'water_heater' ||
      /бойлер|водонагрівач|boiler/i.test(nameLower)
    ) {
      return 'boiler';
    }
    if (
      item.isAirConditioner ||
      dev.category === 'climate' ||
      dev.category === 'heating_ac' ||
      dev.icon === 'ac_unit' ||
      /кондиціонер|клімат|спліт/i.test(nameLower)
    ) {
      return 'ac';
    }
    return 'other';
  }

  getSmartCardStatusInfo(item: {
    device: ElectricityDevice;
    isAirConditioner?: boolean;
    allLogsCount?: number;
  }): { prefix: string; value: string } {
    if (!this.isDevicePowerOn(item.device.id)) {
      return { prefix: 'Статус:', value: 'Вимкнено' };
    }
    const archetype = this.getSmartCardArchetype(item);
    if (archetype === 'ac') {
      const maxKw = ((item.device.powerWatts || 2200) / 1000).toFixed(1);
      return {
        prefix: 'Потужність:',
        value: `Пік ${maxKw} кВт • Роб. 0.4–0.8 кВт·г`,
      };
    }
    if (archetype === 'ev') {
      const kw = item.device.powerWatts
        ? `${(item.device.powerWatts / 1000).toFixed(1)} кВт`
        : '3.6 кВт';
      const bat = item.device.batteryCapacityKwh
        ? ` • Батарея ${item.device.batteryCapacityKwh} кВт·г`
        : '';
      return {
        prefix: 'Параметри:',
        value: `${kw}${bat}`,
      };
    }
    if (archetype === 'boiler') {
      const kw = ((item.device.powerWatts || 2000) / 1000).toFixed(1);
      return {
        prefix: 'Потужність:',
        value: `Номінал ${kw} кВт`,
      };
    }
    if (item.device.powerWatts) {
      return {
        prefix: 'Потужність:',
        value: `Номінал ${(item.device.powerWatts / 1000).toFixed(1)} кВт`,
      };
    }
    return {
      prefix: 'Облік:',
      value: item.allLogsCount ? `${item.allLogsCount} запис(ів)` : 'Активний',
    };
  }

  getSmartCardLeftMetric(item: {
    device: ElectricityDevice;
    isAirConditioner?: boolean;
    steadyOperatingWatts?: number;
    effectiveOperatingWatts?: number;
    empiricalHourlyWatts?: number | null;
    dailyPaceKwh: number;
    avgKwhPerReading: number;
    allLogsCount: number;
    attributedNotes?: Array<{ hours: number; kwh: number }>;
  }): { value: string; unit: string; label: string; subnote?: string } {
    const label = 'Середнє за годину';
    if (!this.isDevicePowerOn(item.device.id)) {
      return { value: '0.00', unit: 'кВт·г', label, subnote: 'Прилад вимкнено' };
    }

    // 1. If logs have explicit durationHours -> exact empirical hourly kWh
    if (item.empiricalHourlyWatts !== null && item.empiricalHourlyWatts !== undefined && item.empiricalHourlyWatts > 0) {
      const hourlyKwh = item.empiricalHourlyWatts / 1000;
      return {
        value: hourlyKwh >= 1 ? hourlyKwh.toFixed(1) : hourlyKwh.toFixed(2),
        unit: 'кВт·г',
        label,
        subnote: `По часу роботи (${item.dailyPaceKwh.toFixed(2)} кВт·г/д)`,
      };
    }

    // 2. If attributed notes from meter readings have hours & kwh
    if (item.attributedNotes && item.attributedNotes.length > 0) {
      const sumH = item.attributedNotes.reduce((s, n) => s + (Number(n.hours) || 0), 0);
      const sumK = item.attributedNotes.reduce((s, n) => s + (Number(n.kwh) || 0), 0);
      if (sumH > 0 && sumK > 0) {
        const hourlyKwh = sumK / sumH;
        return {
          value: hourlyKwh >= 1 ? hourlyKwh.toFixed(1) : hourlyKwh.toFixed(2),
          unit: 'кВт·г',
          label,
          subnote: `За замірами (${sumH} год)`,
        };
      }
    }

    // 3. If monthly consumption is present -> compute hourly average from daily pace (24h)
    if (item.dailyPaceKwh > 0) {
      const avgHourly24 = item.dailyPaceKwh / 24;
      const formatted = avgHourly24 >= 1 ? avgHourly24.toFixed(1) : avgHourly24.toFixed(2);
      const sub = item.isAirConditioner
        ? `${item.dailyPaceKwh.toFixed(2)} кВт·г/д • Роб. ~${((item.steadyOperatingWatts || 600) / 1000).toFixed(1)} кВт·г/год`
        : `Темп: ${item.dailyPaceKwh.toFixed(2)} кВт·г/добу`;
      return {
        value: formatted,
        unit: 'кВт·г',
        label,
        subnote: sub,
      };
    }

    // 4. Fallback to all-time readings average if available
    if (item.allLogsCount > 0 && item.avgKwhPerReading > 0) {
      const avgHourly = item.avgKwhPerReading / 24;
      return {
        value: avgHourly >= 1 ? avgHourly.toFixed(1) : avgHourly.toFixed(2),
        unit: 'кВт·г',
        label,
        subnote: `Сер. показ: ${item.avgKwhPerReading.toFixed(2)} кВт·г`,
      };
    }

    // 5. If no readings yet, show 0.00 (or steady operating rate note for AC)
    return {
      value: '0.00',
      unit: 'кВт·г',
      label,
      subnote: item.isAirConditioner ? 'Робочий режим: 0.4–0.8 кВт·г' : 'Немає показів за місяць',
    };
  }

  getSmartCardRightMetric(item: {
    device: ElectricityDevice;
    isAirConditioner?: boolean;
    monthKwh: number;
    monthCostUah: number;
    avgKwhPerReading: number;
    allLogsCount: number;
    shareOfHousePercent: number;
  }): { value: string; unit: string; label: string; sublabel?: string } {
    return {
      value: item.monthKwh.toFixed(1),
      unit: 'кВт·г',
      label: 'Спожито за місяць',
      sublabel:
        item.allLogsCount > 0 && item.avgKwhPerReading > 0
          ? `${item.monthCostUah.toFixed(0)} грн • Сер. показ: ${item.avgKwhPerReading.toFixed(1)} кВт·г`
          : `${item.monthCostUah.toFixed(0)} грн • ${item.shareOfHousePercent.toFixed(1)}% будинку`,
    };
  }

  getSmartCardDailyChart(item: {
    device: ElectricityDevice;
    monthLogs: ElectricityDeviceLogEntry[];
    attributedNotes?: Array<{ readingDate: string; kwh: number; hours: number }>;
  }): {
    hasData: boolean;
    linePath: string;
    areaPath: string;
    points: Array<{ x: number; y: number; dateLabel: string; kwh: number }>;
  } {
    const formatShortDay = (isoDate: string): string => {
      if (!isoDate || isoDate.length < 10) return isoDate || '—';
      const parts = isoDate.slice(0, 10).split('-');
      return parts.length === 3 ? `${parts[2]}.${parts[1]}` : isoDate;
    };

    // Collect daily readings in chronological order
    let rawPoints: Array<{ date: string; dateLabel: string; kwh: number }> = [];

    if (item.monthLogs && item.monthLogs.length > 0) {
      const chronological = [...item.monthLogs].sort(
        (a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || '').localeCompare(b.createdAt || '')
      );
      const byDay = new Map<string, number>();
      let prevCum = 0;
      for (const l of chronological) {
        const dKey = (l.date || '').slice(0, 10);
        if (!dKey) continue;
        const val = Number(l.consumedKwh) || 0;
        if (val <= 0) continue;
        if (!l.entryMode || l.entryMode === 'cumulative_month') {
          const dayVal = val >= prevCum && prevCum > 0 ? Math.round((val - prevCum) * 100) / 100 : val;
          prevCum = Math.max(prevCum, val);
          byDay.set(dKey, Math.round(((byDay.get(dKey) || 0) + dayVal) * 100) / 100);
        } else {
          byDay.set(dKey, Math.round(((byDay.get(dKey) || 0) + val) * 100) / 100);
        }
      }
      rawPoints = Array.from(byDay.entries()).map(([date, kwh]) => ({
        date,
        dateLabel: formatShortDay(date),
        kwh,
      }));
    } else if (item.attributedNotes && item.attributedNotes.length > 0) {
      const sortedNotes = [...item.attributedNotes].sort((a, b) =>
        (a.readingDate || '').localeCompare(b.readingDate || '')
      );
      const byDay = new Map<string, number>();
      for (const n of sortedNotes) {
        const dKey = (n.readingDate || '').slice(0, 10);
        if (!dKey) continue;
        byDay.set(dKey, Math.round(((byDay.get(dKey) || 0) + (Number(n.kwh) || 0)) * 100) / 100);
      }
      rawPoints = Array.from(byDay.entries()).map(([date, kwh]) => ({
        date,
        dateLabel: formatShortDay(date),
        kwh,
      }));
    } else if (item.device.logs && item.device.logs.length > 0) {
      // Fallback to recent historical logs across months if selected month has none yet
      const chronological = [...item.device.logs].sort(
        (a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || '').localeCompare(b.createdAt || '')
      );
      const byDay = new Map<string, number>();
      for (const l of chronological) {
        const dKey = (l.date || '').slice(0, 10);
        if (!dKey) continue;
        const val = Number(l.consumedKwh) || 0;
        if (val > 0) {
          byDay.set(dKey, val);
        }
      }
      rawPoints = Array.from(byDay.entries()).map(([date, kwh]) => ({
        date,
        dateLabel: formatShortDay(date),
        kwh,
      }));
    }

    // Keep up to last 7 recorded days so X-axis labels are clean
    if (rawPoints.length > 7) {
      rawPoints = rawPoints.slice(rawPoints.length - 7);
    }

    // If no recorded points exist at all
    if (rawPoints.length === 0) {
      return {
        hasData: false,
        linePath: 'M 16 58 L 284 58',
        areaPath: 'M 16 58 L 284 58 L 284 66 L 16 66 Z',
        points: [],
      };
    }

    // If only 1 recorded day exists, prepend the 1st of that month with 0 kWh so a line can be drawn
    if (rawPoints.length === 1) {
      const only = rawPoints[0];
      const monthPrefix = only.date.slice(0, 7);
      const startDay = `${monthPrefix}-01`;
      if (only.date !== startDay) {
        rawPoints = [
          { date: startDay, dateLabel: formatShortDay(startDay), kwh: 0 },
          only,
        ];
      } else {
        rawPoints = [
          { date: startDay, dateLabel: 'Поч.', kwh: 0 },
          only,
        ];
      }
    }

    const maxKwh = Math.max(...rawPoints.map((p) => p.kwh), 0.1);
    const minX = 20;
    const maxX = 280;
    const topY = 16;
    const bottomY = 56;
    const n = rawPoints.length;

    const coords = rawPoints.map((p, idx) => {
      const x = n === 1 ? 150 : Math.round((minX + (idx / (n - 1)) * (maxX - minX)) * 10) / 10;
      const ratio = Math.max(0, Math.min(1, p.kwh / maxKwh));
      const y = Math.round((bottomY - ratio * (bottomY - topY)) * 10) / 10;
      return {
        x,
        y,
        dateLabel: p.dateLabel,
        kwh: p.kwh,
      };
    });

    // Build smooth cubic bezier path through coords
    let linePath = `M ${coords[0].x} ${coords[0].y}`;
    for (let i = 0; i < coords.length - 1; i++) {
      const curr = coords[i];
      const next = coords[i + 1];
      const midX = Math.round(((curr.x + next.x) / 2) * 10) / 10;
      linePath += ` C ${midX} ${curr.y}, ${midX} ${next.y}, ${next.x} ${next.y}`;
    }

    const areaPath = `${linePath} L ${coords[coords.length - 1].x} 66 L ${coords[0].x} 66 Z`;

    return {
      hasData: true,
      linePath,
      areaPath,
      points: coords,
    };
  }

  // Compact device row expansion (maps deviceId -> boolean)
  readonly expandedCompactDeviceIds = signal<Record<string, boolean>>({});

  isCompactDeviceExpanded(deviceId: string): boolean {
    return Boolean(this.expandedCompactDeviceIds()[deviceId]);
  }

  toggleCompactDevice(deviceId: string): void {
    this.expandedCompactDeviceIds.update((prev) => ({
      ...prev,
      [deviceId]: !prev[deviceId],
    }));
  }

  focusAndExpandDeviceFromWarning(deviceId: string): void {
    this.isDevicesSectionExpanded.set(true);
    this.expandedCompactDeviceIds.update((prev) => ({
      ...prev,
      [deviceId]: true,
    }));
  }

  expandAllCompactDevices(): void {
    const all: Record<string, boolean> = {};
    for (const row of this.deviceAnalyticsSummary().deviceRows) {
      all[row.device.id] = true;
    }
    this.expandedCompactDeviceIds.set(all);
  }

  collapseAllCompactDevices(): void {
    this.expandedCompactDeviceIds.set({});
  }

  areAllCompactDevicesExpanded(): boolean {
    const rows = this.deviceAnalyticsSummary().deviceRows;
    if (rows.length === 0) return false;
    const current = this.expandedCompactDeviceIds();
    return rows.every((r) => Boolean(current[r.device.id]));
  }

  toggleAllSections(expand: boolean): void {
    this.isAccountCardExpanded.set(expand);
    this.isWeatherSectionExpanded.set(expand);
    this.isOverviewKpiExpanded.set(expand);
    this.isDevicesSectionExpanded.set(expand);
    this.isChartsSectionExpanded.set(expand);
    this.isInsightsSectionExpanded.set(expand);
    this.isHistoryTableExpanded.set(expand);
    this.isAnalyticsChartExpanded.set(expand);
  }

  areAllSectionsExpanded(): boolean {
    return (
      this.isAccountCardExpanded() &&
      this.isWeatherSectionExpanded() &&
      this.isOverviewKpiExpanded() &&
      this.isDevicesSectionExpanded() &&
      this.isChartsSectionExpanded() &&
      this.isInsightsSectionExpanded() &&
      this.isHistoryTableExpanded() &&
      this.isAnalyticsChartExpanded()
    );
  }

  // ========================================================
  // ELECTRICITY DEVICES & AI SCREENSHOT STATE
  // ========================================================
  readonly deviceSelectedMonth = signal<string>(new Date().toISOString().slice(0, 7));
  readonly customMonthHouseKwh = signal<number | null>(null);
  readonly expandedDeviceIds = signal<Record<string, boolean>>({});
  readonly isSavingDevices = signal<boolean>(false);

  readonly isDeviceModalOpen = signal<boolean>(false);
  readonly editingDeviceId = signal<string | null>(null);

  readonly isDeviceLogModalOpen = signal<boolean>(false);
  readonly editingDeviceLogId = signal<string | null>(null);
  readonly editingDeviceLogOriginalDeviceId = signal<string | null>(null);
  readonly deviceLogFormTrigger = signal<number>(0);
  readonly evChargeStartPct = signal<number>(20);
  readonly evChargeEndPct = signal<number>(80);

  // Weather & temperature state for Devices & Consumption Forecasting
  readonly weatherData = signal<UtilityWeatherResponse | null>(null);
  readonly isWeatherLoading = signal<boolean>(false);
  readonly logCustomTempAvgC = signal<number | null>(null);
  readonly logCustomWeatherCondition = signal<string>('');

  readonly isScreenshotModalOpen = signal<boolean>(false);
  readonly screenshotTargetDeviceId = signal<string>('');
  readonly screenshotNewDeviceName = signal<string>('');
  readonly screenshotNewDeviceWatts = signal<number | null>(null);
  readonly screenshotDate = signal<string>(new Date().toISOString().split('T')[0]);
  readonly screenshotEndDate = signal<string>('');
  readonly screenshotStartTime = signal<string>('');
  readonly screenshotEndTime = signal<string>('');
  readonly screenshotBase64 = signal<string>('');
  readonly screenshotComment = signal<string>('');
  readonly isAnalyzingScreenshot = signal<boolean>(false);
  readonly screenshotError = signal<string | null>(null);
  readonly screenshotAnalysisResult = signal<ElectricityScreenshotAnalysisResult | null>(null);
  readonly screenshotExtractedKwh = signal<number | null>(null);
  readonly screenshotExtractedMode = signal<DeviceConsumptionEntryMode>('single_day');

  readonly deviceColors = [
    '#10b981', // emerald
    '#2563eb', // blue (EV)
    '#ea580c', // deep orange (AC Heating)
    '#0ea5e9', // sky
    '#f59e0b', // amber
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#6366f1', // indigo
  ];

  readonly devicePresets: {
    name: string;
    category: string;
    icon: string;
    color: string;
    powerWatts: number;
    batteryCapacityKwh?: number;
    isNightFriendly: boolean;
    notes?: string;
  }[] = [
    {
      name: 'Кондиціонер (режим обігріву)',
      category: 'heating_ac',
      icon: 'mode_heat',
      color: '#ea580c',
      powerWatts: 1350,
      isNightFriendly: true,
      notes: 'Обігрів кондиціонером / тепловим насосом',
    },
    {
      name: 'Volkswagen E-Golf 2014 (24 кВт·год)',
      category: 'ev',
      icon: 'electric_car',
      color: '#2563eb',
      powerWatts: 3600,
      batteryCapacityKwh: 24,
      isNightFriendly: true,
      notes: 'Електромобіль VW e-Golf 2014, батарея 24 кВт·год',
    },
    { name: 'Бойлер', category: 'boiler', icon: 'water_drop', color: '#0ea5e9', powerWatts: 1800, isNightFriendly: true },
    { name: 'Кондиціонер (охолодження)', category: 'climate', icon: 'ac_unit', color: '#06b6d4', powerWatts: 1100, isNightFriendly: false },
    { name: 'Електрокотел / Обігрівач', category: 'heating', icon: 'local_fire_department', color: '#f97316', powerWatts: 2200, isNightFriendly: true },
    { name: 'Пральна машина', category: 'laundry', icon: 'local_laundry_service', color: '#8b5cf6', powerWatts: 2000, isNightFriendly: true },
    { name: 'Холодильник', category: 'kitchen', icon: 'kitchen', color: '#10b981', powerWatts: 200, isNightFriendly: false },
    { name: 'Електроплита / Духовка', category: 'kitchen', icon: 'soup_kitchen', color: '#f59e0b', powerWatts: 2200, isNightFriendly: false },
    { name: 'Комп’ютер / Робоче місце', category: 'pc', icon: 'computer', color: '#6366f1', powerWatts: 400, isNightFriendly: false },
    { name: 'Зарядна станція / Інвертор', category: 'power_station', icon: 'battery_charging_full', color: '#14b8a6', powerWatts: 1500, isNightFriendly: true },
  ];

  readonly deviceForm = new FormGroup({
    name: new FormControl('', [Validators.required]),
    category: new FormControl('other'),
    icon: new FormControl('bolt'),
    color: new FormControl('#10b981'),
    powerWatts: new FormControl<number | null>(null),
    batteryCapacityKwh: new FormControl<number | null>(null),
    isNightFriendly: new FormControl<boolean>(false),
    notes: new FormControl(''),
  });

  readonly deviceLogForm = new FormGroup({
    deviceId: new FormControl('', [Validators.required]),
    date: new FormControl(new Date().toISOString().split('T')[0], [Validators.required]),
    endDate: new FormControl(''),
    startTime: new FormControl(''),
    endTime: new FormControl(''),
    consumedKwh: new FormControl<number | null>(null, [Validators.required, Validators.min(0)]),
    entryMode: new FormControl<DeviceConsumptionEntryMode>('single_day'),
    tariffSelection: new FormControl<'auto_time' | 'night_only' | 'day_only'>('auto_time'),
    comment: new FormControl(''),
  });

  readonly isAccountModalOpen = signal<boolean>(false);
  readonly editingAccount = signal<UtilityAccount | null>(null);

  readonly isReadingModalOpen = signal<boolean>(false);
  readonly editingReadingId = signal<string | null>(null);
  readonly formChangeTrigger = signal<number>(0);
  readonly isCameraModalOpen = signal<boolean>(false);
  readonly isSubmitting = signal<boolean>(false);

  // DTEK OEM & OOEK Personal Cabinets state
  readonly isCabinetPanelOpen = signal<boolean>(false);
  readonly isOoekHistoryExpanded = signal<boolean>(false);
  readonly cabinetDtekLogin = signal<string>('');
  readonly cabinetDtekPassword = signal<string>('');
  readonly cabinetOoekLogin = signal<string>('');
  readonly cabinetOoekPassword = signal<string>('');
  readonly cabinetOoekAccountNumber = signal<string>('');
  readonly isSavingCabinet = signal<boolean>(false);
  readonly isSyncingOoek = signal<boolean>(false);
  readonly isSyncingDtekCabinet = signal<boolean>(false);

  // DTEK OEM Direct Meter Reading Submission (Check Address Step 1)
  readonly isDtekMeterChecking = signal<boolean>(false);
  readonly dtekMeterCheckResult = signal<DtekMeterCheckResult | null>(null);
  readonly dtekMeterCheckError = signal<string | null>(null);
  readonly dtekMeterRawResponse = signal<Record<string, unknown> | null>(null);
  readonly showDtekMeterRawJson = signal<boolean>(false);

  hasHouseAccountNumber(acc?: UtilityAccount | null): boolean {
    const target = acc || this.currentAccount();
    return Boolean(target?.accountNumber && target.accountNumber.trim().length > 0);
  }

  getFormattedDtekAccountNumber(rawNum?: string | null): string {
    const num = (rawNum && rawNum.trim()) || (this.currentAccount()?.accountNumber && this.currentAccount()?.accountNumber.trim()) || '';
    if (!num) return '';
    return this.dataService.formatDtekMeterAccountNumber(num);
  }

  async onWantToSubmitDtekReadings(acc?: UtilityAccount | null): Promise<void> {
    const targetAcc = acc || this.currentAccount();
    const rawNum = (targetAcc?.accountNumber && targetAcc.accountNumber.trim()) || '';
    const targetId = targetAcc?.id;

    if (!rawNum) {
      this.dtekMeterCheckError.set('Особовий рахунок не вказано у налаштуваннях будинку. Будь ласка, заповніть його для перевірки.');
      return;
    }

    this.isDtekMeterChecking.set(true);
    this.dtekMeterCheckError.set(null);

    try {
      const res = await this.dataService.checkDtekMeterAddress(rawNum, targetId);
      if (res.success && res.data && res.data.result !== false) {
        this.dtekMeterCheckResult.set(res.data);
        this.dtekMeterRawResponse.set(res.data as Record<string, unknown>);
      } else {
        const errMsg =
          res.error ||
          (typeof res.data?.address === 'string' ? res.data.address : '') ||
          'ДТЕК ОЕМ не повернув дані адреси';
        this.dtekMeterCheckError.set(errMsg);
      }
    } catch (err: unknown) {
      let errMsg = 'Помилка звернення до сервера ДТЕК ОЕМ';
      if (err && typeof err === 'object') {
        const httpErr = err as { error?: { error?: string; message?: string }; message?: string };
        if (httpErr.error?.error) {
          errMsg = httpErr.error.error;
        } else if (httpErr.error?.message) {
          errMsg = httpErr.error.message;
        } else if (httpErr.message) {
          errMsg = httpErr.message;
        }
      }
      this.dtekMeterCheckError.set(errMsg);
    } finally {
      this.isDtekMeterChecking.set(false);
    }
  }

  toggleShowDtekMeterRawJson(): void {
    this.showDtekMeterRawJson.update((v) => !v);
  }

  // Form calculated cost
  readonly formTotalCost = signal<number>(0);
  readonly calculatedSeason = signal<'summer' | 'winter'>('summer');
  readonly formCalculationResult = signal<ElectricityCostResult | null>(null);
  readonly selectedReadingForBreakdown = signal<UtilityReading | null>(null);

  readonly accountForm = new FormGroup({
    name: new FormControl('', [Validators.required]),
    accountNumber: new FormControl('', [Validators.required]),
    city: new FormControl(''),
    street: new FormControl(''),
    houseNum: new FormControl(''),
    dtekQueueGroup: new FormControl(''),
    address: new FormControl(''),
    meterNumber: new FormControl(''),
    electricityTariffType: new FormControl<'single' | 'dual'>('single', [Validators.required]),
    initialReadingT1: new FormControl<number>(0),
    initialReadingT2: new FormControl<number>(0),
    notes: new FormControl(''),
  });

  getPreviousDayIsoDate(): string {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  readonly readingForm = new FormGroup({
    date: new FormControl(this.getPreviousDayIsoDate(), [Validators.required]),
    readingT1: new FormControl<number | null>(null, [Validators.required]),
    readingT2: new FormControl<number | null>(null),
    isControlOnly: new FormControl<boolean>(false),
    isPaid: new FormControl<boolean>(false),
    note: new FormControl(''),
  });

  constructor() {
    this.updateLiveKyivTime();
    if (typeof window !== 'undefined') {
      const clockTimer = setInterval(() => this.updateLiveKyivTime(), 1000);
      this.destroyRef.onDestroy(() => clearInterval(clockTimer));
      // Pre-fetch DTEK catalog
      this.dataService.fetchDtekCatalog();
    }

    // Select active/default account if none selected
    const activeDefault = this.dataService.activeDtekAccount();
    const accounts = this.electricityAccounts();
    if (activeDefault && !this.selectedAccountId()) {
      this.selectedAccountId.set(activeDefault.id);
    } else if (accounts.length > 0 && !this.selectedAccountId()) {
      this.selectedAccountId.set(accounts[0].id);
    }

    // Keep selectedAccountId synced with dataService.activeDtekAccount when accounts load
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

    // Synchronize card address with selected account or defaults
    effect(() => {
      const acc = this.currentAccount();
      const city = acc?.city || 'с-ще Окни';
      const street = acc?.street || 'вул. Шкільна';
      const house = acc?.houseNum || '11';

      untracked(() => {
        this.cardCity.set(city);
        this.cardStreet.set(street);
        this.cardHouse.set(house);
        this.cardCityQuery.set(city);
        this.cardStreetQuery.set(street);
        this.cardHouseInput.set(house);
        this.cabinetDtekLogin.set(acc?.dtekLogin || '');
        this.cabinetDtekPassword.set('');
        this.cabinetOoekLogin.set(acc?.ooekLogin || '');
        this.cabinetOoekPassword.set('');
        this.cabinetOoekAccountNumber.set(acc?.ooekAccountNumber || acc?.accountNumber || '');
        if (typeof window !== 'undefined') {
          this.dataService.fetchDtekCatalog(city);
          this.dataService.fetchDtekShutdowns(city, street, house);
          void this.loadWeatherForCurrentAccount(city, this.deviceSelectedMonth());
        }
      });
    });

    // Reload weather when selected month for devices changes
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

  toggleCabinetPanel(): void {
    this.isCabinetPanelOpen.update((v) => !v);
  }

  toggleOoekHistoryExpanded(): void {
    this.isOoekHistoryExpanded.update((v) => !v);
  }

  async saveCabinetCredentialsForCurrentAccount(): Promise<void> {
    const acc = this.currentAccount();
    if (!acc) return;
    this.isSavingCabinet.set(true);
    try {
      await this.dataService.saveCabinetCredentials(acc.id, {
        dtekLogin: this.cabinetDtekLogin().trim(),
        ...(this.cabinetDtekPassword() ? { dtekPassword: this.cabinetDtekPassword() } : {}),
        ooekLogin: this.cabinetOoekLogin().trim(),
        ...(this.cabinetOoekPassword() ? { ooekPassword: this.cabinetOoekPassword() } : {}),
        ooekAccountNumber: acc.accountNumber,
      });
      this.cabinetDtekPassword.set('');
      this.cabinetOoekPassword.set('');
    } finally {
      this.isSavingCabinet.set(false);
    }
  }

  async syncOoekForCurrentAccount(): Promise<void> {
    const acc = this.currentAccount();
    if (!acc) return;
    this.isSyncingOoek.set(true);
    try {
      const payload: { ooekLogin?: string; ooekPassword?: string; ooekAccountNumber?: string } = {
        ooekAccountNumber: acc.accountNumber,
      };
      if (this.cabinetOoekLogin().trim()) {
        payload.ooekLogin = this.cabinetOoekLogin().trim();
      }
      if (this.cabinetOoekPassword()) {
        payload.ooekPassword = this.cabinetOoekPassword();
      }
      await this.dataService.syncOoekCabinet(acc.id, payload);
      this.cabinetOoekPassword.set('');
    } finally {
      this.isSyncingOoek.set(false);
    }
  }

  resolveOoekBillDate(acc: UtilityAccount): string {
    const rawBillDate = (acc.ooekBillUpdatedAt || '').trim();
    if (rawBillDate) {
      const dmyMatch = rawBillDate.match(/(\d{2})\.(\d{2})\.(\d{4})/);
      if (dmyMatch) {
        return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;
      }
      const isoMatch = rawBillDate.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (isoMatch) {
        return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
      }
    }
    if (acc.ooekCabinetLastSync && /^\d{4}-\d{2}-\d{2}/.test(acc.ooekCabinetLastSync)) {
      return acc.ooekCabinetLastSync.slice(0, 10);
    }
    return new Date().toISOString().split('T')[0];
  }

  getHouseDueInfo(acc: UtilityAccount): { hasDue: boolean; amount: number; isZeroOrPaid: boolean } {
    if (!acc) return { hasDue: false, amount: 0, isZeroOrPaid: true };

    if (acc.ooekBalanceUah !== undefined && acc.ooekBalanceUah !== null) {
      const amt = Number(acc.ooekBalanceUah) || 0;
      if (amt <= 0) {
        return { hasDue: true, amount: 0, isZeroOrPaid: true };
      }
      return { hasDue: true, amount: amt, isZeroOrPaid: false };
    }

    const readings = this.dataService.utilityReadings();
    const houseUnpaid = readings.filter(
      (r) =>
        r.accountId === acc.id &&
        (r.utilityType === 'electricity' || !r.utilityType) &&
        !r.isControlOnly &&
        !r.isPaid &&
        (Number(r.totalCost) || 0) > 0
    );
    if (houseUnpaid.length > 0) {
      const sum = houseUnpaid.reduce((tot, r) => tot + (Number(r.totalCost) || 0), 0);
      return { hasDue: true, amount: Math.round(sum * 100) / 100, isZeroOrPaid: false };
    }

    const hasAnyBilling = readings.some(
      (r) => r.accountId === acc.id && (r.utilityType === 'electricity' || !r.utilityType) && !r.isControlOnly
    );
    if (hasAnyBilling) {
      return { hasDue: true, amount: 0, isZeroOrPaid: true };
    }

    return { hasDue: false, amount: 0, isZeroOrPaid: true };
  }

  isReadingPaid(r: UtilityReading, acc?: UtilityAccount | null): boolean {
    if (!r) return false;
    if (r.isPaid) return true;
    if (r.isControlOnly) return true;
    const targetAcc = acc || this.currentAccount();
    if (
      targetAcc &&
      targetAcc.id === r.accountId &&
      targetAcc.ooekBalanceUah !== undefined &&
      targetAcc.ooekBalanceUah !== null &&
      targetAcc.ooekBalanceUah <= 0
    ) {
      return true;
    }
    return false;
  }

  getEstimatedKwhFromOoekBalance(acc: UtilityAccount): number {
    const amountUah = Number(acc.ooekBalanceUah) || 0;
    if (amountUah <= 0) return 0;
    const date = this.resolveOoekBillDate(acc);
    const tariffs = this.utilityTariffs();
    const rate =
      acc.electricityTariffType === 'dual'
        ? resolveElectricityDualRates(date, tariffs).dayRate || 4.32
        : resolveElectricitySingleRate(date, tariffs) || 4.32;
    return Math.round((amountUah / rate) * 10) / 10;
  }

  async addOoekAccruedAmountToHistory(acc: UtilityAccount): Promise<void> {
    if (!acc || acc.ooekBalanceUah === undefined || acc.ooekBalanceUah === null) return;
    const amountUah = Math.round(Number(acc.ooekBalanceUah) * 100) / 100;
    if (isNaN(amountUah) || amountUah <= 0) return;

    this.isSubmitting.set(true);
    try {
      const date = this.resolveOoekBillDate(acc);
      const periodMonth = date.slice(0, 7);
      const tariffs = this.utilityTariffs();
      const season = getSeasonForDate(date);

      // Check if an existing OOEK reading on this date already exists to update it instead of duplicating
      const existingSameBill = this.accountReadings().find(
        (r) =>
          !r.isControlOnly &&
          r.date === date &&
          (Math.abs((r.totalCost || 0) - amountUah) < 0.05 || (r.note || '').includes('ООЕК'))
      );

      const prev = this.getEffectivePrevReading(false, date, existingSameBill?.id || null);

      let rate1 = resolveElectricitySingleRate(date, tariffs) || 4.32;
      let rate2: number | undefined;
      if (acc.electricityTariffType === 'dual') {
        const dual = resolveElectricityDualRates(date, tariffs);
        rate1 = dual.dayRate || 4.32;
        rate2 = dual.nightRate || 2.16;
      }

      // Check if we have actual readings in existingSameBill or ooekHistory; if not, calculate kWh from sum & tariff
      let consT1 = 0;
      let consT2: number | undefined = acc.electricityTariffType === 'dual' ? 0 : undefined;
      let readingT1 = 0;
      let readingT2: number | undefined = acc.electricityTariffType === 'dual' ? prev.t2 : undefined;
      let calculatedFromSum = false;

      const latestOoekEntry = Array.isArray(acc.ooekHistory) && acc.ooekHistory.length > 0 ? acc.ooekHistory[0] : null;

      if (
        existingSameBill &&
        ((Number(existingSameBill.consumptionT1) || 0) + (Number(existingSameBill.consumptionT2) || 0) > 0)
      ) {
        consT1 = Number(existingSameBill.consumptionT1) || 0;
        consT2 = acc.electricityTariffType === 'dual' ? Number(existingSameBill.consumptionT2) || 0 : undefined;
        readingT1 = Number(existingSameBill.readingT1) || Math.round((prev.t1 + consT1) * 10) / 10;
        readingT2 =
          acc.electricityTariffType === 'dual'
            ? Number(existingSameBill.readingT2) || Math.round((prev.t2 + (consT2 || 0)) * 10) / 10
            : undefined;
      } else if (latestOoekEntry && latestOoekEntry.readingT1 && latestOoekEntry.readingT1 > prev.t1) {
        readingT1 = Number(latestOoekEntry.readingT1);
        consT1 = Math.max(0, Math.round((readingT1 - prev.t1) * 10) / 10);
        if (acc.electricityTariffType === 'dual' && latestOoekEntry.readingT2 && latestOoekEntry.readingT2 >= prev.t2) {
          readingT2 = Number(latestOoekEntry.readingT2);
          consT2 = Math.max(0, Math.round((readingT2 - prev.t2) * 10) / 10);
        }
      } else {
        // No meter readings available -> calculate kWh based on accrued sum and tariff!
        calculatedFromSum = true;
        const calculatedKwh = Math.round((amountUah / rate1) * 10) / 10;
        consT1 = calculatedKwh;
        readingT1 = Math.round((prev.t1 + consT1) * 10) / 10;
        if (acc.electricityTariffType === 'dual') {
          consT2 = 0;
          readingT2 = prev.t2;
        }
      }

      let daysSinceLast = 0;
      let dailyAvg = 0;
      const totalCons = consT1 + (consT2 || 0);
      if (prev.prevDate) {
        const curMs = new Date(date).getTime();
        const prevMs = new Date(prev.prevDate).getTime();
        daysSinceLast = Math.max(1, Math.round((curMs - prevMs) / (1000 * 60 * 60 * 24)));
        dailyAvg = Math.round((totalCons / daysSinceLast) * 10) / 10;
      } else if (totalCons > 0) {
        daysSinceLast = 30;
        dailyAvg = Math.round((totalCons / 30) * 10) / 10;
      }

      const noteText = calculatedFromSum
        ? `Рахунок ООЕК (${amountUah.toFixed(2)} грн • розраховано ~${totalCons} кВт·г за тарифом ${rate1} грн)`
        : `Рахунок ООЕК (${amountUah.toFixed(2)} грн)`;

      const readingPayload: Partial<UtilityReading> = {
        ...(existingSameBill ? { id: existingSameBill.id } : {}),
        accountId: acc.id,
        utilityType: 'electricity',
        date,
        periodMonth,
        readingT1,
        readingT2,
        consumptionT1: consT1,
        consumptionT2: consT2,
        rateT1: rate1,
        rateT2: rate2,
        totalCost: amountUah,
        season,
        isPaid: existingSameBill ? Boolean(existingSameBill.isPaid) : false,
        note: noteText,
        isControlOnly: false,
        readingPurpose: 'billing',
        daysSinceLastReading: daysSinceLast,
        dailyAvgConsumption: dailyAvg,
      };

      await this.dataService.saveUtilityReading(readingPayload);
      this.activeTab.set('table');
      this.isHistoryTableExpanded.set(true);
      if (this.filterPurpose() === 'control') {
        this.filterPurpose.set('all');
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async syncDtekCabinetForCurrentAccount(): Promise<void> {
    const acc = this.currentAccount();
    if (!acc) return;
    this.isSyncingDtekCabinet.set(true);
    try {
      const payload: { dtekLogin?: string; dtekPassword?: string } = {};
      if (this.cabinetDtekLogin().trim()) {
        payload.dtekLogin = this.cabinetDtekLogin().trim();
      }
      if (this.cabinetDtekPassword()) {
        payload.dtekPassword = this.cabinetDtekPassword();
      }
      await this.dataService.syncDtekCabinet(acc.id, payload);
      this.cabinetDtekPassword.set('');
    } finally {
      this.isSyncingDtekCabinet.set(false);
    }
  }

  async submitLatestReadingToDtek(reading: UtilityReading): Promise<void> {
    const acc = this.currentAccount();
    if (!acc || reading.readingT1 === undefined) return;
    this.isSyncingDtekCabinet.set(true);
    try {
      await this.dataService.submitReadingToDtekCabinet(acc.id, {
        readingT1: reading.readingT1,
        readingT2: reading.readingT2,
        date: reading.date,
      });
    } finally {
      this.isSyncingDtekCabinet.set(false);
    }
  }

  readonly currentAccount = computed<UtilityAccount | null>(() => {
    const list = this.visibleAccountsForCurrentTab();
    if (list.length === 0) return null;
    const selected = list.find((a) => a.id === this.selectedAccountId());
    return selected || list[0];
  });

  readonly accountReadings = computed<UtilityReading[]>(() => {
    const acc = this.currentAccount();
    if (!acc) return [];
    return this.dataService
      .utilityReadings()
      .filter((r) => r.accountId === acc.id)
      .sort((a, b) => b.date.localeCompare(a.date));
  });

  readonly filteredAccountReadings = computed<UtilityReading[]>(() => {
    const list = this.accountReadings();
    const filter = this.filterPurpose();
    if (filter === 'billing') return list.filter((r) => !r.isControlOnly);
    if (filter === 'control') return list.filter((r) => r.isControlOnly);
    return list;
  });

  readonly billingReadingsCount = computed<number>(() => {
    return this.accountReadings().filter((r) => !r.isControlOnly).length;
  });

  readonly controlReadingsCount = computed<number>(() => {
    return this.accountReadings().filter((r) => r.isControlOnly).length;
  });

  readonly latestAnyReading = computed<UtilityReading | null>(() => {
    const list = this.accountReadings();
    return list.length > 0 ? list[0] : null;
  });

  readonly latestBillingReading = computed<UtilityReading | null>(() => {
    const list = this.accountReadings().filter((r) => !r.isControlOnly);
    return list.length > 0 ? list[0] : null;
  });

  readonly prevBillingT1 = computed<number>(() => {
    const latest = this.latestBillingReading();
    if (latest && latest.readingT1 !== undefined && latest.readingT1 !== null) {
      return latest.readingT1;
    }
    const acc = this.currentAccount();
    return acc ? (acc.initialReadingT1 || 0) : 0;
  });

  readonly prevBillingT2 = computed<number>(() => {
    const latest = this.latestBillingReading();
    if (latest && latest.readingT2 !== undefined && latest.readingT2 !== null) {
      return latest.readingT2;
    }
    const acc = this.currentAccount();
    return acc ? (acc.initialReadingT2 || 0) : 0;
  });

  readonly prevAnyT1 = computed<number>(() => {
    const latest = this.latestAnyReading();
    if (latest && latest.readingT1 !== undefined && latest.readingT1 !== null) {
      return latest.readingT1;
    }
    const acc = this.currentAccount();
    return acc ? (acc.initialReadingT1 || 0) : 0;
  });

  readonly prevAnyT2 = computed<number>(() => {
    const latest = this.latestAnyReading();
    if (latest && latest.readingT2 !== undefined && latest.readingT2 !== null) {
      return latest.readingT2;
    }
    const acc = this.currentAccount();
    return acc ? (acc.initialReadingT2 || 0) : 0;
  });

  getEffectivePrevReading(isControl: boolean, targetDate: string, excludeId?: string | null): { t1: number; t2: number; prevDate?: string } {
    const acc = this.currentAccount();
    if (!acc) return { t1: 0, t2: 0 };

    const list = this.accountReadings()
      .filter((r) => (!excludeId || r.id !== excludeId) && (!isControl ? !r.isControlOnly : true))
      .filter((r) => r.date <= targetDate)
      .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));

    const prior = list[0];
    if (prior) {
      return {
        t1: prior.readingT1 ?? acc.initialReadingT1 ?? 0,
        t2: prior.readingT2 ?? acc.initialReadingT2 ?? 0,
        prevDate: prior.date,
      };
    }

    return {
      t1: acc.initialReadingT1 ?? 0,
      t2: acc.initialReadingT2 ?? 0,
    };
  }

  readonly activePrevT1 = computed<number>(() => {
    this.formChangeTrigger();
    const isControl = Boolean(this.readingForm.get('isControlOnly')?.value);
    const date = this.readingForm.get('date')?.value || new Date().toISOString().split('T')[0];
    const editId = this.editingReadingId();
    return this.getEffectivePrevReading(isControl, date, editId).t1;
  });

  readonly activePrevT2 = computed<number>(() => {
    this.formChangeTrigger();
    const isControl = Boolean(this.readingForm.get('isControlOnly')?.value);
    const date = this.readingForm.get('date')?.value || new Date().toISOString().split('T')[0];
    const editId = this.editingReadingId();
    return this.getEffectivePrevReading(isControl, date, editId).t2;
  });

  readonly currentSingleRate = computed<number>(() => {
    const tariffs = this.utilityTariffs();
    const today = new Date().toISOString().split('T')[0];
    return resolveElectricitySingleRate(today, tariffs);
  });

  readonly currentDualRates = computed(() => {
    const tariffs = this.utilityTariffs();
    const today = new Date().toISOString().split('T')[0];
    return resolveElectricityDualRates(today, tariffs);
  });

  // Recharts timeline series
  readonly electricityTimelineData = computed<ElectricityTimelinePoint[]>(() => {
    const readings = [...this.accountReadings()].sort((a, b) => a.date.localeCompare(b.date));
    const acc = this.currentAccount();
    if (!acc || readings.length === 0) return [];

    const isDual = acc.electricityTariffType === 'dual';
    const result: ElectricityTimelinePoint[] = [];

    let lastAnyT1 = acc.initialReadingT1 || 0;
    let lastAnyT2 = acc.initialReadingT2 || 0;
    let lastDate = readings[0].date;

    for (let i = 0; i < readings.length; i++) {
      const r = readings[i];
      const curT1 = r.readingT1 !== undefined ? r.readingT1 : lastAnyT1;
      const curT2 = r.readingT2 !== undefined ? r.readingT2 : lastAnyT2;

      const consT1 = r.consumptionT1 !== undefined ? r.consumptionT1 : Math.max(0, curT1 - lastAnyT1);
      const consT2 = r.consumptionT2 !== undefined ? r.consumptionT2 : Math.max(0, curT2 - lastAnyT2);
      const totalCons = isDual ? Math.round((consT1 + consT2) * 10) / 10 : Math.round(consT1 * 10) / 10;

      const curMs = new Date(r.date).getTime();
      const prevMs = new Date(i === 0 ? r.date : lastDate).getTime();
      const diffDays = Math.max(1, Math.round((curMs - prevMs) / (1000 * 60 * 60 * 24)));
      const dailyRate = i === 0 ? 0 : Math.round((totalCons / diffDays) * 10) / 10;

      result.push({
        id: r.id,
        date: r.date,
        dateFormatted: formatDateUa(r.date, true),
        isControlOnly: Boolean(r.isControlOnly),
        isDual,
        readingT1: curT1,
        readingT2: isDual ? curT2 : undefined,
        consumptionT1: consT1,
        consumptionT2: isDual ? consT2 : undefined,
        totalConsumption: totalCons,
        cost: r.totalCost || 0,
        days: i === 0 ? 0 : diffDays,
        dailyRate,
      });

      lastAnyT1 = curT1;
      lastAnyT2 = curT2;
      lastDate = r.date;
    }

    return result;
  });

  // Recharts monthly aggregated data
  readonly electricityMonthlyData = computed<ElectricityMonthlySummary[]>(() => {
    const list = this.electricityTimelineData();
    const tariffs = this.utilityTariffs();
    const winterLimit = tariffs.electricityDual?.winterLimitKwh || 2000;
    const monthsMap = new Map<string, {
      totalKwh: number;
      dayKwh: number;
      nightKwh: number;
      totalCost: number;
      readingsCount: number;
      controlCount: number;
      billingCount: number;
    }>();

    for (const item of list) {
      const monthKey = item.date.substring(0, 7);
      const current = monthsMap.get(monthKey) || {
        totalKwh: 0,
        dayKwh: 0,
        nightKwh: 0,
        totalCost: 0,
        readingsCount: 0,
        controlCount: 0,
        billingCount: 0,
      };

      current.totalKwh += item.totalConsumption;
      current.dayKwh += item.consumptionT1;
      current.nightKwh += item.consumptionT2 || 0;
      current.totalCost += item.cost;
      current.readingsCount++;
      if (item.isControlOnly) {
        current.controlCount++;
      } else {
        current.billingCount++;
      }
      monthsMap.set(monthKey, current);
    }

    const monthNamesUa: Record<string, string> = {
      '01': 'Січень', '02': 'Лютий', '03': 'Березень', '04': 'Квітень',
      '05': 'Травень', '06': 'Червень', '07': 'Липень', '08': 'Серпень',
      '09': 'Вересень', '10': 'Жовтень', '11': 'Листопад', '12': 'Грудень',
    };
    const monthShortsUa: Record<string, string> = {
      '01': 'Січ', '02': 'Лют', '03': 'Бер', '04': 'Кві',
      '05': 'Тра', '06': 'Чер', '07': 'Лип', '08': 'Сер',
      '09': 'Вер', '10': 'Жов', '11': 'Лис', '12': 'Гру',
    };

    const sortedKeys = Array.from(monthsMap.keys()).sort();
    return sortedKeys.map((key) => {
      const parts = key.split('-');
      const y = parts[0];
      const m = parts[1];
      const data = monthsMap.get(key)!;
      const totalKwh = Math.round(data.totalKwh * 10) / 10;
      const nightKwh = Math.round(data.nightKwh * 10) / 10;
      const nightSharePct = totalKwh > 0 ? Math.round((nightKwh / totalKwh) * 100) : 0;
      const season = getSeasonForDate(`${key}-15`);

      return {
        monthKey: key,
        monthName: `${monthNamesUa[m] || m} ${y}`,
        monthShort: `${monthShortsUa[m] || m} ${y.substring(2)}`,
        totalKwh,
        dayKwh: Math.round(data.dayKwh * 10) / 10,
        nightKwh,
        totalCost: Math.round(data.totalCost * 100) / 100,
        readingsCount: data.readingsCount,
        controlCount: data.controlCount,
        billingCount: data.billingCount,
        nightSharePct,
        winterLimit,
        isWinterSeason: season === 'winter',
      };
    });
  });

  // Recharts KPIs & Insights
  readonly electricityStatsKPIs = computed<ElectricityStatsKPIs>(() => {
    const timeline = this.electricityTimelineData();
    const acc = this.currentAccount();
    const isDualTariff = acc?.electricityTariffType === 'dual';
    const tariffs = this.utilityTariffs();
    const winterLimitKwh = tariffs.electricityDual?.winterLimitKwh || 2000;

    let totalKwhAllTime = 0;
    let totalNightKwh = 0;
    let controlReadingsCount = 0;
    let billingReadingsCount = 0;

    for (const pt of timeline) {
      totalKwhAllTime += pt.totalConsumption;
      totalNightKwh += pt.consumptionT2 || 0;
      if (pt.isControlOnly) {
        controlReadingsCount++;
      } else {
        billingReadingsCount++;
      }
    }

    let avgDailyRateLatest = 0;
    for (let i = timeline.length - 1; i >= 0; i--) {
      if (timeline[i].dailyRate > 0) {
        avgDailyRateLatest = timeline[i].dailyRate;
        break;
      }
    }

    const nowMs = Date.now();
    const ms30Days = 30 * 24 * 60 * 60 * 1000;
    let kwhLast30 = 0;
    let daysLast30 = 0;
    for (const pt of timeline) {
      const ptMs = new Date(pt.date).getTime();
      if (nowMs - ptMs <= ms30Days && pt.days > 0) {
        kwhLast30 += pt.totalConsumption;
        daysLast30 += pt.days;
      }
    }
    const avgDailyRateMonth = daysLast30 > 0 ? Math.round((kwhLast30 / daysLast30) * 10) / 10 : avgDailyRateLatest;

    const effectiveDaily = avgDailyRateLatest > 0 ? avgDailyRateLatest : avgDailyRateMonth;
    const projectedMonthKwh = Math.round(effectiveDaily * 30.5 * 10) / 10;

    const dualRates = resolveElectricityDualRates(new Date().toISOString().split('T')[0], tariffs);
    const savingsPerKwh = Math.max(0, dualRates.dayRate - dualRates.nightRate);
    const nightSavingsUah = Math.round(totalNightKwh * savingsPerKwh * 100) / 100;

    return {
      totalKwhAllTime: Math.round(totalKwhAllTime * 10) / 10,
      avgDailyRateLatest,
      avgDailyRateMonth,
      projectedMonthKwh,
      nightSavingsUah,
      controlReadingsCount,
      billingReadingsCount,
      isDualTariff,
      winterLimitKwh,
    };
  });

  selectAccount(id: string): void {
    this.selectedAccountId.set(id);
    this.dataService.selectDtekAccountForSchedule(id);
  }

  async setAsDefaultHouse(id: string): Promise<void> {
    this.selectedAccountId.set(id);
    await this.dataService.setDefaultUtilityAccount(id);
  }

  formatDate(dateStr: string): string {
    return formatDateUa(dateStr, true);
  }

  totalConsumedKwh(r: UtilityReading): number {
    const t1 = Number(r.consumptionT1) || 0;
    const t2 = Number(r.consumptionT2) || 0;
    return Math.round((t1 + t2) * 10) / 10;
  }

  isWinterLimitExceededReading(r: UtilityReading): boolean {
    if (r.season !== 'winter') return false;
    const acc = this.currentAccount();
    if (acc?.electricityTariffType !== 'dual') return false;
    const total = this.totalConsumedKwh(r);
    const tariffs = this.utilityTariffs();
    const limit = tariffs.electricityDual?.winterLimitKwh ?? 2000;
    return total > limit;
  }

  showReadingBreakdown(r: UtilityReading): void {
    this.selectedReadingForBreakdown.set(r);
  }

  closeReadingBreakdown(): void {
    this.selectedReadingForBreakdown.set(null);
  }

  getReadingBreakdown(r: UtilityReading): ElectricityCostResult {
    const acc = this.currentAccount();
    const tariffs = this.utilityTariffs();
    const tariffType = acc?.electricityTariffType || 'single';
    const diff1 = Number(r.consumptionT1) || 0;
    const diff2 = r.consumptionT2 !== undefined ? Number(r.consumptionT2) : undefined;
    return calculateElectricityCost(r.date, diff1, diff2, tariffType, tariffs);
  }

  calculatedRatesText(): string {
    const acc = this.currentAccount();
    const tariffs = this.utilityTariffs();
    const date = this.readingForm.get('date')?.value || new Date().toISOString().split('T')[0];

    if (acc?.electricityTariffType === 'dual') {
      const dual = resolveElectricityDualRates(date, tariffs);
      const seasonText = dual.season === 'summer' ? 'Літо' : `Зима (ліміт ${dual.winterLimitKwh} кВт·г)`;
      return `Д: ${dual.dayRate} грн, Н: ${dual.nightRate} грн (${seasonText})`;
    } else {
      const single = resolveElectricitySingleRate(date, tariffs);
      return `${single} грн/кВт·г`;
    }
  }

  formConsumedKwhText(): string {
    const acc = this.currentAccount();
    const t1Val = Number(this.readingForm.get('readingT1')?.value) || 0;
    const prev1 = this.activePrevT1();
    const diff1 = Math.max(0, t1Val - prev1);

    if (acc?.electricityTariffType === 'dual') {
      const t2Val = Number(this.readingForm.get('readingT2')?.value) || 0;
      const prev2 = this.activePrevT2();
      const diff2 = Math.max(0, t2Val - prev2);
      return `День (Т2): ${diff1.toFixed(1)} кВт·г • Ніч (Т1): ${diff2.toFixed(1)} кВт·г (Всього: ${(diff1 + diff2).toFixed(1)})`;
    }

    return `${diff1.toFixed(1)} кВт·г`;
  }

  readonly formActiveReadingDelta = computed<number>(() => {
    this.formChangeTrigger();
    const acc = this.currentAccount();
    const t1Val = Number(this.readingForm.get('readingT1')?.value) || 0;
    const prev1 = this.activePrevT1();
    const diff1 = Math.max(0, t1Val - prev1);

    if (acc?.electricityTariffType === 'dual') {
      const t2Val = Number(this.readingForm.get('readingT2')?.value) || 0;
      const prev2 = this.activePrevT2();
      const diff2 = Math.max(0, t2Val - prev2);
      return Math.round((diff1 + diff2) * 10) / 10;
    }
    return Math.round(diff1 * 10) / 10;
  });

  readonly controlReadingNoteAnalysis = computed<ControlReadingNoteAnalysis | null>(() => {
    this.formChangeTrigger();
    const isControl = Boolean(this.readingForm.get('isControlOnly')?.value);
    if (!isControl) return null;
    const note = this.readingForm.get('note')?.value;
    if (!note || !note.trim()) return null;
    const delta = this.formActiveReadingDelta();
    const devices = this.accountDevices();
    return parseControlReadingNote(note, delta, devices);
  });

  getControlNoteAnalysis(r: UtilityReading): ControlReadingNoteAnalysis | null {
    if (!r.note || !r.note.trim()) return null;
    const delta = (Number(r.consumptionT1) || 0) + (Number(r.consumptionT2) || 0);
    const devices = this.accountDevices();
    return parseControlReadingNote(r.note, delta, devices);
  }

  async addDeviceLogFromControlNote(analysis: ControlReadingNoteAnalysis, readingDate?: string): Promise<void> {
    const acc = this.currentAccount();
    if (!acc || !analysis.matchedDeviceId) return;
    const targetDate = readingDate || this.readingForm.get('date')?.value || new Date().toISOString().split('T')[0];
    const targetDevId = analysis.matchedDeviceId;
    const targetDev = this.accountDevices().find((d) => d.id === targetDevId);
    if (!targetDev) return;

    let startTime: string | undefined;
    let endTime: string | undefined;
    const timeMatch = analysis.timeIntervalText.match(/з\s+(\d{2}:\d{2})\s+до\s+(\d{2}:\d{2})/);
    if (timeMatch) {
      startTime = timeMatch[1];
      endTime = timeMatch[2];
    }

    const weather = this.getWeatherForDate(targetDate);

    const newLog: ElectricityDeviceLogEntry = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      date: targetDate,
      periodMonth: targetDate.slice(0, 7),
      consumedKwh: analysis.estimatedKwh,
      entryMode: 'delta',
      durationHours: analysis.durationHours,
      startTime,
      endTime,
      tariffSelection: 'auto_time',
      tempAvgC: weather.tempAvgC,
      tempMinC: weather.tempMinC,
      tempMaxC: weather.tempMaxC,
      weatherCode: weather.weatherCode,
      weatherCondition: weather.condition,
      weatherIcon: weather.icon,
      comment: `З контрольного заміру: ${analysis.rawNote}`,
      createdAt: new Date().toISOString(),
    };

    const nextList = this.accountDevices().map((d) => {
      if (d.id !== targetDevId) return d;
      const existingLogs = Array.isArray(d.logs) ? d.logs : [];
      return {
        ...d,
        logs: [newLog, ...existingLogs],
        updatedAt: new Date().toISOString(),
      };
    });

    this.isSavingDevices.set(true);
    try {
      await this.dataService.saveUtilityAccountDevices(
        acc.id,
        nextList,
        `Запис ${analysis.estimatedKwh} кВт·г додано до приладу «${targetDev.name}»`
      );
    } finally {
      this.isSavingDevices.set(false);
    }
  }

  recalculateFormCost(): void {
    const acc = this.currentAccount();
    if (!acc) return;
    const tariffs = this.utilityTariffs();
    const date = this.readingForm.get('date')?.value || new Date().toISOString().split('T')[0];
    const season = getSeasonForDate(date);
    this.calculatedSeason.set(season);

    this.formChangeTrigger.update((v) => v + 1);

    const isControl = Boolean(this.readingForm.get('isControlOnly')?.value);
    const t1Val = Number(this.readingForm.get('readingT1')?.value) || 0;
    const prev1 = this.activePrevT1();
    const diff1 = Math.max(0, t1Val - prev1);

    let diff2: number | undefined;
    if (acc.electricityTariffType === 'dual') {
      const t2Val = Number(this.readingForm.get('readingT2')?.value) || 0;
      const prev2 = this.activePrevT2();
      diff2 = Math.max(0, t2Val - prev2);
    }

    if (isControl) {
      // Control only reading -> totalCost is 0, no billing calculation
      this.formCalculationResult.set(null);
      this.formTotalCost.set(0);
      return;
    }

    const calc = calculateElectricityCost(date, diff1, diff2, acc.electricityTariffType, tariffs);
    this.formCalculationResult.set(calc);
    this.formTotalCost.set(calc.totalCost);
  }

  openAccountModal(acc: UtilityAccount | null): void {
    this.editingAccount.set(acc);
    if (acc) {
      this.accountForm.patchValue({
        name: acc.name,
        accountNumber: acc.accountNumber,
        city: acc.city || '',
        street: acc.street || '',
        houseNum: acc.houseNum || '',
        dtekQueueGroup: acc.dtekQueueGroup || '',
        address: acc.address || '',
        meterNumber: acc.meterNumber || '',
        electricityTariffType: acc.electricityTariffType || 'single',
        initialReadingT1: acc.initialReadingT1 || 0,
        initialReadingT2: acc.initialReadingT2 || 0,
        notes: acc.notes || '',
      });
      this.formCityQuery.set(acc.city || '');
      this.formStreetQuery.set(acc.street || '');
      if (acc.city) {
        this.dataService.fetchDtekCatalog(acc.city);
      }
    } else {
      this.accountForm.reset({
        name: '',
        accountNumber: '',
        city: '',
        street: '',
        houseNum: '',
        dtekQueueGroup: '',
        address: '',
        meterNumber: '',
        electricityTariffType: 'single',
        initialReadingT1: 0,
        initialReadingT2: 0,
        notes: '',
      });
      this.formCityQuery.set('');
      this.formStreetQuery.set('');
      this.dataService.fetchDtekCatalog('');
    }
    this.showFormCitySuggestions.set(false);
    this.showFormStreetSuggestions.set(false);
    this.isAccountModalOpen.set(true);
  }

  closeAccountModal(): void {
    this.isAccountModalOpen.set(false);
    this.editingAccount.set(null);
    this.showFormCitySuggestions.set(false);
    this.showFormStreetSuggestions.set(false);
  }

  async saveAccount(): Promise<void> {
    if (this.accountForm.invalid) return;
    this.isSubmitting.set(true);
    try {
      const formVal = this.accountForm.getRawValue();
      const existing = this.editingAccount();
      const city = formVal.city?.trim() || '';
      const street = formVal.street?.trim() || '';
      const houseNum = formVal.houseNum?.trim() || '';
      let address = formVal.address?.trim() || '';
      if (!address && (city || street)) {
        address = [city, street, houseNum ? `буд. ${houseNum}` : ''].filter(Boolean).join(', ');
      }

      const payload: Partial<UtilityAccount> = {
        ...(existing ? existing : {}),
        type: existing?.type || 'electricity',
        name: formVal.name?.trim() || '',
        accountNumber: formVal.accountNumber?.trim() || '',
        city,
        street,
        houseNum,
        dtekQueueGroup: formVal.dtekQueueGroup?.trim() || '',
        address,
        meterNumber: formVal.meterNumber?.trim() || '',
        electricityTariffType: formVal.electricityTariffType || 'single',
        initialReadingT1: Number(formVal.initialReadingT1) || 0,
        initialReadingT2: Number(formVal.initialReadingT2) || 0,
        notes: formVal.notes?.trim() || '',
      };

      const saved = await this.dataService.saveUtilityAccount(payload);
      this.selectedAccountId.set(saved.id);
      if (city) this.cardCity.set(city);
      if (street) this.cardStreet.set(street);
      if (houseNum) this.cardHouse.set(houseNum);
      this.closeAccountModal();
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async confirmDeleteAccount(acc: UtilityAccount): Promise<void> {
    const ok = confirm(`Ви дійсно бажаєте видалити особовий рахунок «${acc.name}» (№ ${acc.accountNumber}) та всі зафіксовані по ньому покази?`);
    if (ok) {
      await this.dataService.deleteUtilityAccount(acc.id);
      const remaining = this.electricityAccounts();
      if (remaining.length > 0) {
        this.selectedAccountId.set(remaining[0].id);
      }
    }
  }

  openReadingModal(isControl = false): void {
    const acc = this.currentAccount();
    if (!acc) return;

    this.editingReadingId.set(null);
    this.readingForm.reset({
      date: this.getPreviousDayIsoDate(),
      readingT1: null,
      readingT2: null,
      isControlOnly: isControl,
      isPaid: false,
      note: isControl ? 'Контрольний замір для моніторингу' : '',
    });
    this.formChangeTrigger.update((v) => v + 1);
    this.recalculateFormCost();
    this.isReadingModalOpen.set(true);
  }

  openEditReadingModal(r: UtilityReading): void {
    const acc = this.currentAccount();
    if (!acc) return;

    this.editingReadingId.set(r.id);
    this.readingForm.reset({
      date: r.date,
      readingT1: r.readingT1,
      readingT2: r.readingT2 ?? null,
      isControlOnly: Boolean(r.isControlOnly),
      isPaid: Boolean(r.isPaid),
      note: r.note || '',
    });
    this.formChangeTrigger.update((v) => v + 1);
    this.recalculateFormCost();
    this.isReadingModalOpen.set(true);
  }

  openCameraModal(): void {
    const acc = this.currentAccount();
    if (!acc) return;
    this.isCameraModalOpen.set(true);
  }

  closeCameraModal(): void {
    this.isCameraModalOpen.set(false);
  }

  onCameraReadingApplied(applied: AppliedMeterReading): void {
    const acc = this.currentAccount();
    if (!acc) return;

    this.readingForm.patchValue({
      date: this.readingForm.get('date')?.value || this.getPreviousDayIsoDate(),
      readingT1: applied.readingT1 !== undefined ? applied.readingT1 : null,
      readingT2: applied.readingT2 !== undefined ? applied.readingT2 : null,
      isControlOnly: Boolean(this.readingForm.get('isControlOnly')?.value),
      isPaid: false,
      note: applied.note || 'Розпізнано за фото лічильника',
    });

    this.recalculateFormCost();
    this.isReadingModalOpen.set(true);
  }

  closeReadingModal(): void {
    this.isReadingModalOpen.set(false);
    this.editingReadingId.set(null);
  }

  async saveReading(): Promise<void> {
    const acc = this.currentAccount();
    if (!acc || this.readingForm.invalid) return;

    this.isSubmitting.set(true);
    try {
      const editId = this.editingReadingId();
      const formVal = this.readingForm.getRawValue();
      const date = formVal.date || new Date().toISOString().split('T')[0];
      const isControlOnly = Boolean(formVal.isControlOnly);
      const tariffs = this.utilityTariffs();

      const prev = this.getEffectivePrevReading(isControlOnly, date, editId);
      const t1Val = Number(formVal.readingT1) || 0;
      const diff1 = Math.max(0, t1Val - prev.t1);

      let t2Val: number | undefined;
      let diff2: number | undefined;
      if (acc.electricityTariffType === 'dual') {
        t2Val = Number(formVal.readingT2) || 0;
        diff2 = Math.max(0, t2Val - prev.t2);
      }

      // Elapsed days and daily pace calculation
      let daysSinceLast = 0;
      let dailyAvg = 0;
      if (prev.prevDate) {
        const curMs = new Date(date).getTime();
        const prevMs = new Date(prev.prevDate).getTime();
        daysSinceLast = Math.max(1, Math.round((curMs - prevMs) / (1000 * 60 * 60 * 24)));
        const totalDiff = acc.electricityTariffType === 'dual' ? diff1 + (diff2 || 0) : diff1;
        dailyAvg = Math.round((totalDiff / daysSinceLast) * 10) / 10;
      }

      let totalCost = 0;
      let rate1: number | undefined;
      let rate2: number | undefined;
      let season = getSeasonForDate(date);
      let readingNote = formVal.note?.trim() || '';

      if (isControlOnly) {
        totalCost = 0;
        readingNote = readingNote || 'Контрольний замір для моніторингу';
      } else {
        const calc = calculateElectricityCost(date, diff1, diff2, acc.electricityTariffType, tariffs);
        totalCost = calc.totalCost;
        rate1 = calc.rate1;
        rate2 = calc.rate2;
        season = calc.season;

        if (calc.isWinterExceeded) {
          // Keep note clean and concise without lengthy calculation dump
          if (!readingNote) {
            readingNote = '';
          }
        }
      }

      const reading: Partial<UtilityReading> = {
        ...(editId ? { id: editId } : {}),
        accountId: acc.id,
        utilityType: 'electricity',
        date,
        periodMonth: date.substring(0, 7),
        readingT1: t1Val,
        readingT2: t2Val,
        consumptionT1: diff1,
        consumptionT2: diff2,
        rateT1: rate1,
        rateT2: rate2,
        totalCost,
        season,
        isPaid: isControlOnly ? true : Boolean(formVal.isPaid),
        paidDate: isControlOnly ? undefined : (formVal.isPaid ? date : undefined),
        paidAmount: isControlOnly ? 0 : (formVal.isPaid ? totalCost : undefined),
        note: readingNote,
        isControlOnly,
        readingPurpose: isControlOnly ? 'control' : 'billing',
        daysSinceLastReading: daysSinceLast,
        dailyAvgConsumption: dailyAvg,
      };

      await this.dataService.saveUtilityReading(reading);
      this.closeReadingModal();
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async deleteReading(id: string): Promise<void> {
    const ok = confirm('Видалити цей запис показів лічильника?');
    if (ok) {
      await this.dataService.deleteUtilityReading(id);
    }
  }

  async togglePaidStatus(r: UtilityReading): Promise<void> {
    if (r.isControlOnly) return;
    const isCurrentlyPaid = this.isReadingPaid(r, this.currentAccount());
    const nextStatus = !isCurrentlyPaid;
    await this.dataService.markUtilityReadingPaid(r.id, nextStatus, r.totalCost);
  }

  // ========================================================
  // ELECTRICITY DEVICES & AI SCREENSHOT METHODS & ANALYTICS
  // ========================================================

  isDeviceAttachedToHouse(dev: ElectricityDevice, acc: UtilityAccount): boolean {
    if (!dev || !acc) return false;
    if (dev.accountId && dev.accountId !== acc.id) return false;
    return true;
  }

  readonly accountDevices = computed<ElectricityDevice[]>(() => {
    const acc = this.currentAccount();
    if (!acc || !Array.isArray(acc.devices)) return [];
    const seenIds = new Set<string>();
    const result: ElectricityDevice[] = [];
    for (const d of acc.devices) {
      if (this.isDeviceAttachedToHouse(d, acc) && d.id && !seenIds.has(d.id)) {
        seenIds.add(d.id);
        result.push(d);
      }
    }
    return result;
  });

  async loadWeatherForCurrentAccount(city?: string, month?: string, date?: string): Promise<void> {
    if (typeof window === 'undefined') return;
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

  private buildFallbackDailyWeather(dateStr: string): DailyWeatherPoint {
    const parts = (dateStr || '2026-11-10').split('-');
    const m = Number(parts[1]) || 11;
    const d = Number(parts[2]) || 10;
    const monthlyMeans: Record<number, number> = {
      1: -1.5, 2: -0.2, 3: 4.5, 4: 11.2, 5: 17.4, 6: 21.8,
      7: 24.2, 8: 23.6, 9: 18.0, 10: 11.4, 11: 4.8, 12: 0.4,
    };
    const baseMean = monthlyMeans[m] ?? 5.0;
    const wave = Math.sin(d * 0.55 + m * 1.3) * 3.4 + Math.cos(d * 1.15) * 1.8;
    const tempAvgC = Math.round((baseMean + wave) * 10) / 10;
    const swing = 3.2 + Math.abs(Math.sin(d * 0.7)) * 2.1;
    const tempMinC = Math.round((tempAvgC - swing) * 10) / 10;
    const tempMaxC = Math.round((tempAvgC + swing) * 10) / 10;
    const isSnow = tempAvgC < -0.5;
    const isRain = !isSnow && (d + m) % 4 === 0;
    return {
      date: dateStr,
      tempAvgC,
      tempMinC,
      tempMaxC,
      weatherCode: isSnow ? 71 : isRain ? 61 : 2,
      condition: isSnow ? 'Сніг / Мороз' : isRain ? 'Дощ / Похмуро' : 'Мінлива хмарність',
      icon: isSnow ? 'ac_unit' : isRain ? 'water_drop' : 'partly_cloudy_day',
      emoji: isSnow ? '❄️' : isRain ? '🌧️' : '⛅',
    };
  }

  getWeatherForDate(dateStr?: string | null, endDateStr?: string | null): DailyWeatherPoint {
    const cleanDate = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
      ? dateStr
      : new Date().toISOString().split('T')[0];
    const map = this.weatherData()?.dailyByDate || {};

    if (endDateStr && /^\d{4}-\d{2}-\d{2}$/.test(endDateStr) && endDateStr > cleanDate) {
      const sMs = new Date(cleanDate + 'T12:00:00Z').getTime();
      const eMs = new Date(endDateStr + 'T12:00:00Z').getTime();
      if (!isNaN(sMs) && !isNaN(eMs) && eMs > sMs) {
        const days = Math.min(31, Math.round((eMs - sMs) / (1000 * 60 * 60 * 24)) + 1);
        let sumAvg = 0;
        let minT = 999;
        let maxT = -999;
        let firstPoint: DailyWeatherPoint | null = null;
        for (let i = 0; i < days; i++) {
          const dIso = new Date(sMs + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          const pt = map[dIso] || this.buildFallbackDailyWeather(dIso);
          if (!firstPoint) firstPoint = pt;
          sumAvg += pt.tempAvgC;
          if (pt.tempMinC < minT) minT = pt.tempMinC;
          if (pt.tempMaxC > maxT) maxT = pt.tempMaxC;
        }
        return {
          date: cleanDate,
          tempAvgC: Math.round((sumAvg / days) * 10) / 10,
          tempMinC: minT === 999 ? 0 : minT,
          tempMaxC: maxT === -999 ? 5 : maxT,
          weatherCode: firstPoint?.weatherCode ?? 2,
          condition: firstPoint?.condition ?? 'Мінлива хмарність',
          icon: firstPoint?.icon ?? 'partly_cloudy_day',
          emoji: firstPoint?.emoji ?? '⛅',
        };
      }
    }

    return map[cleanDate] || this.buildFallbackDailyWeather(cleanDate);
  }

  getEffectiveLogWeather(log: ElectricityDeviceLogEntry): DailyWeatherPoint {
    const base = this.getWeatherForDate(log.date, log.endDate);
    const hasCustomTemp = typeof log.tempAvgC === 'number' && !isNaN(log.tempAvgC);
    const tempAvgC = hasCustomTemp ? Number(log.tempAvgC) : base.tempAvgC;
    const condition = log.weatherCondition || base.condition;
    const emoji =
      log.weatherIcon ||
      (tempAvgC <= -1 ? '❄️' : tempAvgC < 6 ? '☁️' : tempAvgC >= 16 ? '☀️' : base.emoji);
    return {
      ...base,
      tempAvgC: Math.round(tempAvgC * 10) / 10,
      tempMinC: typeof log.tempMinC === 'number' ? log.tempMinC : base.tempMinC,
      tempMaxC: typeof log.tempMaxC === 'number' ? log.tempMaxC : base.tempMaxC,
      condition,
      emoji,
    };
  }

  getDeviceCategoryThermalSensitivity(category?: string): {
    pctPerDegreeDrop: number;
    label: string;
    isHighThermal: boolean;
  } {
    switch (category) {
      case 'heating_ac':
        return { pctPerDegreeDrop: 5.5, label: 'Висока (Обігрів / Тепловий насос)', isHighThermal: true };
      case 'heating':
        return { pctPerDegreeDrop: 6.2, label: 'Дуже висока (Електрообігрів)', isHighThermal: true };
      case 'climate':
        return { pctPerDegreeDrop: 3.5, label: 'Підвищена (Клімат-контроль)', isHighThermal: true };
      case 'ev':
        return { pctPerDegreeDrop: 2.5, label: 'Середня (Зарядка авто + пічка/батарея)', isHighThermal: false };
      case 'boiler':
        return { pctPerDegreeDrop: 2.2, label: 'Середня (Нагрів холоднішої води)', isHighThermal: false };
      default:
        return { pctPerDegreeDrop: 0.8, label: 'Базова побутова', isHighThermal: false };
    }
  }

  readonly currentFormLogWeather = computed<DailyWeatherPoint>(() => {
    this.deviceLogFormTrigger();
    const mode = this.deviceLogForm.get('entryMode')?.value;
    const dStart = this.deviceLogForm.get('date')?.value || new Date().toISOString().split('T')[0];
    const dEnd = mode === 'period_range' ? this.deviceLogForm.get('endDate')?.value : undefined;
    return this.getWeatherForDate(dStart, dEnd);
  });

  readonly currentScreenshotWeather = computed<DailyWeatherPoint>(() => {
    const mode = this.screenshotExtractedMode();
    const dStart = this.screenshotDate() || new Date().toISOString().split('T')[0];
    const dEnd = mode === 'period_range' ? this.screenshotEndDate() : undefined;
    return this.getWeatherForDate(dStart, dEnd);
  });

  readonly deviceAnalyticsSummary = computed(() => {
    const acc = this.currentAccount();
    const devices = this.accountDevices();
    // Touch weatherData signal so summary recomputes when weather loads
    const loadedWeather = this.weatherData();
    void loadedWeather;

    const selectedMonth = this.deviceSelectedMonth() || new Date().toISOString().slice(0, 7);
    const [yearStr, monthStr] = selectedMonth.split('-');
    const yearNum = Number(yearStr) || new Date().getFullYear();
    const monthNum = Number(monthStr) || (new Date().getMonth() + 1);
    const daysInMonth = new Date(yearNum, monthNum, 0).getDate();

    const uaMonthNames = [
      'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
      'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
    ];
    const monthLabel = `${uaMonthNames[Math.max(0, Math.min(11, monthNum - 1))]} ${yearNum}`;

    // Determine effective tariff rate (UAH / kWh) for this month
    const refDateForTariff = `${selectedMonth}-15`;
    const tariffs = this.utilityTariffs();
    let effectiveRateUah = this.currentSingleRate();
    let nightRateUah = effectiveRateUah * 0.5;
    if (acc?.electricityTariffType === 'dual') {
      const dualInfo = resolveElectricityDualRates(refDateForTariff, tariffs);
      effectiveRateUah = dualInfo.dayRate;
      nightRateUah = dualInfo.nightRate;
    } else {
      effectiveRateUah = resolveElectricitySingleRate(refDateForTariff, tariffs);
      nightRateUah = effectiveRateUah * 0.5;
    }

    // Today / reference date in month
    const todayStr = new Date().toISOString().split('T')[0];
    let latestLoggedDate = '';

    for (const dev of devices) {
      for (const log of dev.logs || []) {
        if ((log.periodMonth || log.date.slice(0, 7)) === selectedMonth) {
          const effectiveLogEnd = log.endDate && log.endDate > log.date ? log.endDate : log.date;
          if (effectiveLogEnd > latestLoggedDate) latestLoggedDate = effectiveLogEnd;
        }
      }
    }

    let referenceDate = latestLoggedDate;
    if (!referenceDate) {
      referenceDate = todayStr.startsWith(selectedMonth)
        ? todayStr
        : `${selectedMonth}-${String(daysInMonth).padStart(2, '0')}`;
    }
    const daysElapsed = Math.max(1, Math.min(daysInMonth, Number(referenceDate.slice(8, 10)) || 1));
    const daysRemaining = Math.max(0, daysInMonth - daysElapsed);

    // Calculate average outdoor temperature for elapsed days vs remaining days of the month
    let elapsedTempSum = 0;
    for (let d = 1; d <= daysElapsed; d++) {
      const dIso = `${selectedMonth}-${String(d).padStart(2, '0')}`;
      elapsedTempSum += this.getWeatherForDate(dIso).tempAvgC;
    }
    const avgElapsedMonthTempC = Math.round((elapsedTempSum / daysElapsed) * 10) / 10;

    let remainingTempSum = 0;
    const remainingCount = daysRemaining > 0 ? daysRemaining : 7;
    if (daysRemaining > 0) {
      for (let d = daysElapsed + 1; d <= daysInMonth; d++) {
        const dIso = `${selectedMonth}-${String(d).padStart(2, '0')}`;
        remainingTempSum += this.getWeatherForDate(dIso).tempAvgC;
      }
    } else {
      // If month is complete, compare last 7 days of month vs first part
      const startD = Math.max(1, daysInMonth - 6);
      for (let d = startD; d <= daysInMonth; d++) {
        const dIso = `${selectedMonth}-${String(d).padStart(2, '0')}`;
        remainingTempSum += this.getWeatherForDate(dIso).tempAvgC;
      }
    }
    const avgForecastRemainingTempC = Math.round((remainingTempSum / remainingCount) * 10) / 10;

    // Determine House Total Consumption in selectedMonth from meter readings
    const monthReadings = this.accountReadings().filter(
      (r) => (r.periodMonth || r.date.slice(0, 7)) === selectedMonth
    );

    // Analyze notes in all control readings of this month
    const monthControlReadings = monthReadings.filter(
      (r) => r.isControlOnly && r.note && r.note.trim()
    );

    interface AttributedNoteEntry {
      readingDate: string;
      hours: number;
      kwh: number;
      explanation: string;
      action: string;
      rawNote: string;
    }

    const attributedByDeviceId: Record<string, { totalKwh: number; entries: AttributedNoteEntry[] }> = {};
    const unassignedAttributions: Array<AttributedNoteEntry & { category: string; action: string }> = [];

    for (const cr of monthControlReadings) {
      const crKwh = (Number(cr.consumptionT1) || 0) + (Number(cr.consumptionT2) || 0);
      const analysis = parseControlReadingNote(cr.note, crKwh, devices);
      if (analysis && analysis.hasAnalysis) {
        if (analysis.matchedDeviceId) {
          if (!attributedByDeviceId[analysis.matchedDeviceId]) {
            attributedByDeviceId[analysis.matchedDeviceId] = { totalKwh: 0, entries: [] };
          }
          attributedByDeviceId[analysis.matchedDeviceId].totalKwh += analysis.estimatedKwh;
          attributedByDeviceId[analysis.matchedDeviceId].entries.push({
            readingDate: cr.date,
            hours: analysis.durationHours,
            kwh: analysis.estimatedKwh,
            explanation: analysis.explanation,
            action: analysis.detectedAction,
            rawNote: cr.note || '',
          });
        } else {
          unassignedAttributions.push({
            readingDate: cr.date,
            hours: analysis.durationHours,
            kwh: analysis.estimatedKwh,
            explanation: analysis.explanation,
            action: analysis.detectedAction,
            rawNote: cr.note || '',
            category: analysis.matchedDeviceCategory || 'other',
          });
        }
      }
    }

    let totalLogsInMonth = 0;

    const baseDeviceRows = devices.map((dev) => {
      const monthLogs = (dev.logs || [])
        .filter((l) => (l.periodMonth || l.date.slice(0, 7)) === selectedMonth)
        .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

      totalLogsInMonth += monthLogs.length;

      let monthKwh = 0;
      let devLatestDate = '';
      let loggedTempWeightedSum = 0;
      let loggedTempWeight = 0;

      for (const log of monthLogs) {
        const effectiveLogEnd = log.endDate && log.endDate > log.date ? log.endDate : log.date;
        if (effectiveLogEnd > devLatestDate) devLatestDate = effectiveLogEnd;
        const kwhVal = Number(log.consumedKwh) || 0;
        const w = this.getEffectiveLogWeather(log);
        loggedTempWeightedSum += w.tempAvgC * Math.max(0.5, kwhVal);
        loggedTempWeight += Math.max(0.5, kwhVal);

        if (log.entryMode && log.entryMode !== 'cumulative_month') {
          monthKwh += kwhVal;
        } else {
          monthKwh = kwhVal;
        }
      }

      // Check attributed consumption from control reading notes!
      const noteAttr = attributedByDeviceId[dev.id];
      const attributedNoteKwh = noteAttr ? Math.round(noteAttr.totalKwh * 100) / 100 : 0;
      const attributedNotes = noteAttr ? noteAttr.entries : [];

      if (attributedNoteKwh > 0) {
        if (monthKwh === 0) {
          monthKwh = attributedNoteKwh;
          if (!devLatestDate && attributedNotes.length > 0) {
            devLatestDate = attributedNotes[attributedNotes.length - 1].readingDate;
          }
        } else {
          monthKwh = Math.round((monthKwh + attributedNoteKwh) * 100) / 100;
        }
      }

      const isUnmonitoredCatalogDevice = (monthLogs.length === 0) && (attributedNoteKwh === 0);
      monthKwh = Math.max(0, Math.round(monthKwh * 100) / 100);

      // Days elapsed for this device
      let devDaysElapsed = 1;
      if (devLatestDate && devLatestDate.startsWith(selectedMonth)) {
        devDaysElapsed = Math.max(1, Number(devLatestDate.slice(8, 10)) || 1);
      } else if (todayStr.startsWith(selectedMonth)) {
        devDaysElapsed = Math.max(1, Number(todayStr.slice(8, 10)) || 1);
      } else {
        devDaysElapsed = daysInMonth;
      }
      const devDaysRemaining = Math.max(0, daysInMonth - devDaysElapsed);

      const dailyPaceKwh = monthKwh > 0 ? monthKwh / devDaysElapsed : 0;
      const projectedMonthKwh = Math.round(dailyPaceKwh * daysInMonth * 10) / 10;
      const monthCostUah = Math.round(monthKwh * effectiveRateUah * 100) / 100;
      const projectedMonthCostUah = Math.round(projectedMonthKwh * effectiveRateUah * 100) / 100;

      // Weather-adjusted projection for this device
      const devAvgLoggedTempC =
        loggedTempWeight > 0
          ? Math.round((loggedTempWeightedSum / loggedTempWeight) * 10) / 10
          : avgElapsedMonthTempC;
      const thermalInfo = this.getDeviceCategoryThermalSensitivity(dev.category);
      // Empirical refinement if device has >= 2 logs at different temperatures
      let effectivePctPerDegreeDrop = thermalInfo.pctPerDegreeDrop;
      if (monthLogs.length >= 2) {
        const sortedByTemp = [...monthLogs].sort(
          (a, b) => this.getEffectiveLogWeather(a).tempAvgC - this.getEffectiveLogWeather(b).tempAvgC
        );
        const coldest = sortedByTemp[0];
        const warmest = sortedByTemp[sortedByTemp.length - 1];
        const tCold = this.getEffectiveLogWeather(coldest).tempAvgC;
        const tWarm = this.getEffectiveLogWeather(warmest).tempAvgC;
        if (tWarm - tCold >= 1.5 && warmest.consumedKwh > 0 && coldest.consumedKwh > warmest.consumedKwh) {
          const empiricalPct =
            (((coldest.consumedKwh - warmest.consumedKwh) / warmest.consumedKwh) * 100) / (tWarm - tCold);
          effectivePctPerDegreeDrop = Math.round(
            Math.max(1.0, Math.min(11.0, (empiricalPct + thermalInfo.pctPerDegreeDrop) / 2)) * 10
          ) / 10;
        }
      }

      // Temperature drop expected in remaining days (positive when getting colder, negative when getting warmer)
      const tempDropC = Math.round((devAvgLoggedTempC - avgForecastRemainingTempC) * 10) / 10;
      // Also account for cold weather heating load when temp < 12°C
      const coldLoadBonus =
        thermalInfo.isHighThermal && avgForecastRemainingTempC < 8
          ? Math.max(0, (8 - avgForecastRemainingTempC) * 0.015)
          : 0;
      const rawWeatherAdjustmentRatio =
        (tempDropC * (effectivePctPerDegreeDrop / 100)) + coldLoadBonus;
      const weatherMultiplier = Math.max(0.65, Math.min(1.75, 1 + rawWeatherAdjustmentRatio));

      const remainingDaysForCalc = devDaysRemaining > 0 ? devDaysRemaining : Math.round(daysInMonth * 0.35);
      const elapsedPartKwh = devDaysRemaining > 0 ? monthKwh : monthKwh * 0.65;
      const weatherProjectedMonthKwh =
        monthKwh > 0
          ? Math.round((elapsedPartKwh + dailyPaceKwh * remainingDaysForCalc * weatherMultiplier) * 10) / 10
          : 0;
      const weatherProjectedMonthCostUah = Math.round(weatherProjectedMonthKwh * effectiveRateUah * 100) / 100;
      const weatherDeltaKwh = Math.round((weatherProjectedMonthKwh - projectedMonthKwh) * 10) / 10;
      const weatherImpactPct =
        projectedMonthKwh > 0
          ? Math.round(((weatherProjectedMonthKwh - projectedMonthKwh) / projectedMonthKwh) * 1000) / 10
          : 0;

      const empiricalStats = computeDeviceEmpiricalReadingStats(dev);
      const monthAvgKwhPerReading =
        monthLogs.length > 0 ? Math.round((monthKwh / monthLogs.length) * 100) / 100 : empiricalStats.avgKwhPerReading;
      const isAirConditioner = isAirConditionerDevice(dev);
      const acProfile = isAirConditioner
        ? resolveAirConditionerPowerProfile(dev.powerWatts || 1350, 4, dev, devAvgLoggedTempC)
        : null;
      const steadyOperatingWatts = acProfile
        ? acProfile.steadyOperatingWatts
        : dev.powerWatts && dev.powerWatts > 0
          ? dev.powerWatts
          : 0;
      const steadyRangeLabel = acProfile
        ? `${acProfile.operatingMinWatts}–${acProfile.operatingMaxWatts} Вт·г`
        : '';
      const effectiveOperatingWatts =
        empiricalStats.empiricalHourlyWatts && empiricalStats.empiricalHourlyWatts > 0
          ? empiricalStats.empiricalHourlyWatts
          : steadyOperatingWatts;

      const estimatedHoursPerDay =
        effectiveOperatingWatts > 0 && dailyPaceKwh > 0
          ? Math.min(24, (dailyPaceKwh * 1000) / effectiveOperatingWatts)
          : null;

      return {
        device: dev,
        monthLogs: [...monthLogs].reverse(), // newest first for UI list
        latestLogDate: devLatestDate || null,
        monthKwh,
        monthCostUah,
        dailyPaceKwh,
        projectedMonthKwh,
        projectedMonthCostUah,
        weatherProjectedMonthKwh,
        weatherProjectedMonthCostUah,
        weatherDeltaKwh,
        weatherImpactPct,
        devAvgLoggedTempC,
        effectivePctPerDegreeDrop,
        thermalLabel: thermalInfo.label,
        isHighThermal: thermalInfo.isHighThermal,
        estimatedHoursPerDay,
        isAirConditioner,
        steadyOperatingWatts,
        steadyRangeLabel,
        effectiveOperatingWatts,
        avgKwhPerReading: empiricalStats.avgKwhPerReading,
        monthAvgKwhPerReading,
        allLogsCount: empiricalStats.logsCount,
        empiricalHourlyWatts: empiricalStats.empiricalHourlyWatts,
        shareOfHousePercent: 0, // populated after houseReferenceKwh is computed
        attributedNoteKwh,
        attributedNotes,
        hasAttributedConsumption: attributedNoteKwh > 0,
        isUnmonitoredCatalogDevice,
        usageWarning: null as {
          deviceId: string;
          deviceName: string;
          deviceIcon: string;
          deviceColor: string;
          powerWatts?: number;
          actualOrProjectedKwh: number;
          actualOrProjectedCostUah: number;
          monthlyAverageKwh: number;
          excessKwh: number;
          excessCostUah: number;
          excessPercent: number;
          shareOfHousePercent: number;
          normalBarWidthPct: number;
          severity: 'critical' | 'warning';
          baselineLabel: string;
          recommendation: string;
        } | null,
      };
    });

    // Synthesize virtual device rows for appliances detected in notes that don't match any existing device in catalog
    const virtualRows: typeof baseDeviceRows = [];
    for (const item of unassignedAttributions) {
      const vKwh = Math.round(item.kwh * 100) / 100;
      const virtualDev: ElectricityDevice = {
        id: `virtual_note_${item.category}_${item.readingDate}`,
        name: `${item.action} (за приміткою заміру)`,
        category: item.category,
        icon: item.category === 'heating' ? 'local_fire_department' : item.category === 'boiler' ? 'water_heater' : 'bolt',
        color: '#8b5cf6',
        powerWatts: Math.round((vKwh * 1000) / Math.max(1, item.hours)),
        logs: [],
        createdAt: new Date().toISOString(),
      };
      const vDailyPace = vKwh / daysElapsed;
      const vProjectedKwh = Math.round(vDailyPace * daysInMonth * 10) / 10;
      const thermal = this.getDeviceCategoryThermalSensitivity(item.category);
      virtualRows.push({
        device: virtualDev,
        monthLogs: [],
        latestLogDate: item.readingDate,
        monthKwh: vKwh,
        monthCostUah: Math.round(vKwh * effectiveRateUah * 100) / 100,
        dailyPaceKwh: vDailyPace,
        projectedMonthKwh: vProjectedKwh,
        projectedMonthCostUah: Math.round(vProjectedKwh * effectiveRateUah * 100) / 100,
        weatherProjectedMonthKwh: vProjectedKwh,
        weatherProjectedMonthCostUah: Math.round(vProjectedKwh * effectiveRateUah * 100) / 100,
        weatherDeltaKwh: 0,
        weatherImpactPct: 0,
        devAvgLoggedTempC: avgElapsedMonthTempC,
        effectivePctPerDegreeDrop: thermal.pctPerDegreeDrop,
        thermalLabel: thermal.label,
        isHighThermal: thermal.isHighThermal,
        estimatedHoursPerDay: item.hours / daysElapsed,
        isAirConditioner: isAirConditionerDevice(virtualDev),
        steadyOperatingWatts: virtualDev.powerWatts || 600,
        steadyRangeLabel: isAirConditionerDevice(virtualDev) ? '400–800 Вт·г' : '',
        effectiveOperatingWatts: virtualDev.powerWatts || 600,
        avgKwhPerReading: vKwh,
        monthAvgKwhPerReading: vKwh,
        allLogsCount: 1,
        empiricalHourlyWatts: virtualDev.powerWatts || null,
        shareOfHousePercent: 0,
        attributedNoteKwh: vKwh,
        attributedNotes: [item],
        hasAttributedConsumption: true,
        isUnmonitoredCatalogDevice: false,
        usageWarning: null,
      });
    }

    const deviceRows = [...baseDeviceRows, ...virtualRows];

    const totalAttributedNoteKwh =
      Math.round(
        (Object.values(attributedByDeviceId).reduce((s, it) => s + it.totalKwh, 0) +
          unassignedAttributions.reduce((s, it) => s + it.kwh, 0)) * 100
      ) / 100;

    const totalDevicesKwh = Math.round(deviceRows.reduce((sum, r) => sum + r.monthKwh, 0) * 100) / 100;
    const totalDevicesCostUah = Math.round(totalDevicesKwh * effectiveRateUah * 100) / 100;
    const devicesDailyPace = totalDevicesKwh / daysElapsed;
    const projectedDevicesMonthKwh =
      Math.round(deviceRows.reduce((sum, r) => sum + r.projectedMonthKwh, 0) * 10) / 10;
    const projectedDevicesMonthCostUah = Math.round(projectedDevicesMonthKwh * effectiveRateUah * 100) / 100;

    const weatherProjectedDevicesMonthKwh =
      Math.round(deviceRows.reduce((sum, r) => sum + r.weatherProjectedMonthKwh, 0) * 10) / 10;
    const weatherProjectedDevicesMonthCostUah =
      Math.round(weatherProjectedDevicesMonthKwh * effectiveRateUah * 100) / 100;

    const billingMonthReadings = monthReadings.filter((r) => !r.isControlOnly);
    let meterMonthKwh = 0;
    if (billingMonthReadings.length > 0) {
      meterMonthKwh = billingMonthReadings.reduce(
        (sum, r) => sum + (Number(r.consumptionT1) || 0) + (Number(r.consumptionT2) || 0),
        0
      );
    } else if (monthReadings.length > 0) {
      meterMonthKwh = monthReadings.reduce(
        (sum, r) => sum + (Number(r.consumptionT1) || 0) + (Number(r.consumptionT2) || 0),
        0
      );
    }

    const statsKpis = this.electricityStatsKPIs();
    const historicalDailyPace =
      statsKpis.avgDailyRateMonth > 0
        ? statsKpis.avgDailyRateMonth
        : statsKpis.avgDailyRateLatest > 0
          ? statsKpis.avgDailyRateLatest
          : 0;

    const customOverride = this.customMonthHouseKwh();
    let houseReferenceKwh = 0;
    let houseSourceLabel = 'За лічильником';

    if (customOverride !== null && customOverride >= 0) {
      houseReferenceKwh = Math.max(customOverride, totalDevicesKwh);
      houseSourceLabel = 'Вказано вручну';
    } else if (meterMonthKwh > 0) {
      houseReferenceKwh = Math.max(meterMonthKwh, totalDevicesKwh);
      houseSourceLabel = 'За лічильником';
    } else if (historicalDailyPace > 0) {
      houseReferenceKwh = Math.max(
        Math.round(historicalDailyPace * daysElapsed * 10) / 10,
        Math.round(totalDevicesKwh * 1.15 * 10) / 10
      );
      houseSourceLabel = 'Оцінка за темпом лічильника';
    } else {
      houseReferenceKwh = totalDevicesKwh > 0 ? Math.round(totalDevicesKwh * 1.2 * 10) / 10 : 0;
      houseSourceLabel = 'За сумою приладів (+20% фон)';
    }

    const houseReferenceCostUah = Math.round(houseReferenceKwh * effectiveRateUah * 100) / 100;
    const houseDailyPace = houseReferenceKwh > 0 ? houseReferenceKwh / daysElapsed : 0;

    const untrackedKwh = Math.max(0, Math.round((houseReferenceKwh - totalDevicesKwh) * 100) / 100);
    const untrackedCostUah = Math.round(untrackedKwh * effectiveRateUah * 100) / 100;
    const devicesSharePercent =
      houseReferenceKwh > 0 ? Math.min(100, (totalDevicesKwh / houseReferenceKwh) * 100) : 0;
    const untrackedSharePercent =
      houseReferenceKwh > 0 ? Math.max(0, 100 - devicesSharePercent) : 0;

    const projectedUntrackedMonthKwh = Math.round((untrackedKwh / daysElapsed) * daysInMonth * 10) / 10;
    const projectedHouseMonthKwh = Math.max(
      projectedDevicesMonthKwh + projectedUntrackedMonthKwh,
      Math.round(houseDailyPace * daysInMonth * 10) / 10
    );
    const projectedHouseMonthCostUah = Math.round(projectedHouseMonthKwh * effectiveRateUah * 100) / 100;

    // Weather-adjusted house forecast
    const monthTempDropC = Math.round((avgElapsedMonthTempC - avgForecastRemainingTempC) * 10) / 10;
    const untrackedWeatherMult = Math.max(0.85, Math.min(1.25, 1 + monthTempDropC * 0.012));
    const weatherProjectedUntrackedMonthKwh = Math.round(projectedUntrackedMonthKwh * untrackedWeatherMult * 10) / 10;
    const weatherProjectedHouseMonthKwh = Math.round(
      (weatherProjectedDevicesMonthKwh + weatherProjectedUntrackedMonthKwh) * 10
    ) / 10;
    const weatherProjectedHouseMonthCostUah =
      Math.round(weatherProjectedHouseMonthKwh * effectiveRateUah * 100) / 100;
    const weatherHouseDeltaKwh =
      Math.round((weatherProjectedHouseMonthKwh - projectedHouseMonthKwh) * 10) / 10;
    const weatherHouseDeltaCostUah =
      Math.round((weatherProjectedHouseMonthCostUah - projectedHouseMonthCostUah) * 100) / 100;
    const weatherHouseImpactPct =
      projectedHouseMonthKwh > 0
        ? Math.round(((weatherProjectedHouseMonthKwh - projectedHouseMonthKwh) / projectedHouseMonthKwh) * 1000) / 10
        : 0;

    // Populate shareOfHousePercent and sort devices by monthKwh desc
    for (const r of deviceRows) {
      r.shareOfHousePercent =
        houseReferenceKwh > 0 ? Math.min(100, (r.monthKwh / houseReferenceKwh) * 100) : 0;
    }
    deviceRows.sort((a, b) => b.monthKwh - a.monthKwh);

    // =========================================================================
    // USAGE WARNING CALCULATION: Detect appliances consuming significantly more
    // energy than their monthly average (historical month avg or peer month avg)
    // =========================================================================
    const activeTrackedRows = deviceRows.filter((r) => r.monthKwh > 0);
    const averageDeviceMonthKwh =
      activeTrackedRows.length > 0
        ? Math.round((totalDevicesKwh / activeTrackedRows.length) * 10) / 10
        : 0;
    const averageDeviceProjectedMonthKwh =
      activeTrackedRows.length > 0
        ? Math.round((weatherProjectedDevicesMonthKwh / activeTrackedRows.length) * 10) / 10
        : 0;

    const usageWarnings: NonNullable<(typeof deviceRows)[number]['usageWarning']>[] = [];

    for (const r of deviceRows) {
      if (r.monthKwh <= 0) continue;

      // 1) Check if the appliance has historical logs in previous months
      const otherMonthTotals = new Map<string, number>();
      for (const log of r.device.logs || []) {
        const mKey = log.periodMonth || (log.date ? log.date.slice(0, 7) : '');
        if (!mKey || mKey === selectedMonth) continue;
        const kwhVal = Number(log.consumedKwh) || 0;
        if (log.entryMode && log.entryMode !== 'cumulative_month') {
          otherMonthTotals.set(mKey, (otherMonthTotals.get(mKey) || 0) + kwhVal);
        } else {
          otherMonthTotals.set(mKey, Math.max(otherMonthTotals.get(mKey) || 0, kwhVal));
        }
      }

      const pastMonthValues = Array.from(otherMonthTotals.values()).filter((v) => v > 0);
      const historicalMonthlyAvgKwh =
        pastMonthValues.length > 0
          ? pastMonthValues.reduce((s, v) => s + v, 0) / pastMonthValues.length
          : 0;

      let baselineMonthlyAvgKwh = 0;
      let actualOrProjectedKwh = r.monthKwh;
      let baselineLabel = '';

      if (historicalMonthlyAvgKwh > 0) {
        // Pro-rate historical monthly average to elapsed days OR compare full month projection
        const proRatedHistoricalKwh = (historicalMonthlyAvgKwh / 30) * daysElapsed;
        if (r.monthKwh > proRatedHistoricalKwh * 1.15) {
          baselineMonthlyAvgKwh = Math.round(proRatedHistoricalKwh * 10) / 10;
          actualOrProjectedKwh = r.monthKwh;
          baselineLabel = `Історичне середнє за ${daysElapsed} дн. (${pastMonthValues.length} міс.)`;
        } else {
          baselineMonthlyAvgKwh = Math.round(historicalMonthlyAvgKwh * 10) / 10;
          actualOrProjectedKwh = Math.max(r.monthKwh, r.weatherProjectedMonthKwh);
          baselineLabel = `Історичне середнє за місяць (${pastMonthValues.length} міс.)`;
        }
      } else if (activeTrackedRows.length >= 2 && averageDeviceMonthKwh > 0) {
        if (r.monthKwh >= averageDeviceMonthKwh * 1.15) {
          baselineMonthlyAvgKwh = averageDeviceMonthKwh;
          actualOrProjectedKwh = r.monthKwh;
          baselineLabel = 'Середнє споживання серед приладів за місяць';
        } else if (r.weatherProjectedMonthKwh >= averageDeviceProjectedMonthKwh * 1.2) {
          baselineMonthlyAvgKwh = averageDeviceProjectedMonthKwh;
          actualOrProjectedKwh = r.weatherProjectedMonthKwh;
          baselineLabel = 'Середньомісячний прогноз по приладах';
        }
      } else if (r.effectiveOperatingWatts && r.effectiveOperatingWatts > 0) {
        // Fallback when only 1 device is tracked: compare against typical daily usage (3.5h/day at operating power)
        const typicalElapsedKwh = (r.effectiveOperatingWatts / 1000) * 3.5 * daysElapsed;
        if (r.monthKwh >= typicalElapsedKwh * 1.2) {
          baselineMonthlyAvgKwh = Math.round(typicalElapsedKwh * 10) / 10;
          actualOrProjectedKwh = r.monthKwh;
          baselineLabel = r.isAirConditioner
            ? `Типова норма для робочого режиму кондиціонера (${r.steadyOperatingWatts} Вт·г)`
            : 'Типова місячна норма для потужності приладу';
        }
      }

      if (baselineMonthlyAvgKwh > 0 && actualOrProjectedKwh > baselineMonthlyAvgKwh * 1.15) {
        const excessKwh = Math.round((actualOrProjectedKwh - baselineMonthlyAvgKwh) * 10) / 10;
        if (excessKwh >= 1.0) {
          const excessPercent = Math.round(
            ((actualOrProjectedKwh - baselineMonthlyAvgKwh) / baselineMonthlyAvgKwh) * 100
          );
          const excessCostUah = Math.round(excessKwh * effectiveRateUah * 100) / 100;
          const actualOrProjectedCostUah =
            Math.round(actualOrProjectedKwh * effectiveRateUah * 100) / 100;
          const severity: 'critical' | 'warning' =
            excessPercent >= 40 || r.shareOfHousePercent >= 45 ? 'critical' : 'warning';
          const normalBarWidthPct = Math.max(
            18,
            Math.min(85, Math.round((baselineMonthlyAvgKwh / actualOrProjectedKwh) * 100))
          );

          let recommendation = `Споживання перевищує середній показник на +${excessKwh.toFixed(1)} кВт·г (+${excessCostUah.toFixed(0)} грн).`;
          if (r.device.isNightFriendly) {
            recommendation += ' Рекомендовано перенести роботу на нічний тариф (23:00–07:00) для економії 50%.';
          } else if (r.isHighThermal) {
            recommendation += ' Зростання пов’язане з обігрівом/погодою — зниження терморегулятора на 1°C зменшить витрати на ~6%.';
          } else {
            recommendation += ' Перевірте тривалість роботи приладу та фоновий режим очікування.';
          }

          const warnObj = {
            deviceId: r.device.id,
            deviceName: r.device.name,
            deviceIcon: r.device.icon || 'bolt',
            deviceColor: r.device.color || '#f59e0b',
            powerWatts: r.device.powerWatts,
            actualOrProjectedKwh,
            actualOrProjectedCostUah,
            monthlyAverageKwh: baselineMonthlyAvgKwh,
            excessKwh,
            excessCostUah,
            excessPercent,
            shareOfHousePercent: r.shareOfHousePercent,
            normalBarWidthPct,
            severity,
            baselineLabel,
            recommendation,
          };
          r.usageWarning = warnObj;
          usageWarnings.push(warnObj);
        }
      }
    }

    usageWarnings.sort((a, b) => b.excessKwh - a.excessKwh);
    const totalWarningExcessKwh =
      Math.round(usageWarnings.reduce((sum, w) => sum + w.excessKwh, 0) * 10) / 10;
    const totalWarningExcessCostUah =
      Math.round(usageWarnings.reduce((sum, w) => sum + w.excessCostUah, 0) * 100) / 100;

    const maxChartKwh = Math.max(
      10,
      ...deviceRows.map((r) => Math.max(r.monthKwh, r.projectedMonthKwh, r.weatherProjectedMonthKwh)),
      untrackedKwh,
      projectedUntrackedMonthKwh
    );

    // Build chronological date progression points across logged dates in the month (including weather!)
    const uniqueDates = Array.from(
      new Set(
        devices.flatMap((d) =>
          (d.logs || [])
            .filter((l) => (l.periodMonth || l.date.slice(0, 7)) === selectedMonth)
            .map((l) => l.date)
        )
      )
    ).sort();

    let coldDaysKwhSum = 0;
    let coldDaysCount = 0;
    let coldDaysTempSum = 0;
    let warmDaysKwhSum = 0;
    let warmDaysCount = 0;
    let warmDaysTempSum = 0;

    const dateProgressionPoints = uniqueDates.map((dStr) => {
      let sumAtDate = 0;
      let dayAddedKwh = 0;
      const parts: string[] = [];
      let dateLogWeather: DailyWeatherPoint | null = null;

      for (const dev of devices) {
        const logsUpToDate = (dev.logs || [])
          .filter((l) => (l.periodMonth || l.date.slice(0, 7)) === selectedMonth && l.date <= dStr)
          .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
        let devKwhAtDate = 0;
        for (const l of logsUpToDate) {
          if (l.date === dStr && !dateLogWeather) {
            dateLogWeather = this.getEffectiveLogWeather(l);
          }
          if (l.entryMode && l.entryMode !== 'cumulative_month') {
            devKwhAtDate += Number(l.consumedKwh) || 0;
            if (l.date === dStr) dayAddedKwh += Number(l.consumedKwh) || 0;
          } else {
            devKwhAtDate = Number(l.consumedKwh) || 0;
            if (l.date === dStr) dayAddedKwh += Number(l.consumedKwh) || 0;
          }
        }
        if (devKwhAtDate > 0) {
          sumAtDate += devKwhAtDate;
          parts.push(`${dev.name}: ${devKwhAtDate.toFixed(1)}`);
        }
      }

      const wPoint = dateLogWeather || this.getWeatherForDate(dStr);
      if (dayAddedKwh > 0) {
        if (wPoint.tempAvgC < 6) {
          coldDaysKwhSum += dayAddedKwh;
          coldDaysTempSum += wPoint.tempAvgC;
          coldDaysCount++;
        } else {
          warmDaysKwhSum += dayAddedKwh;
          warmDaysTempSum += wPoint.tempAvgC;
          warmDaysCount++;
        }
      }

      return {
        date: dStr,
        cumulativeDevicesKwh: Math.round(sumAtDate * 100) / 100,
        dayAddedKwh: Math.round(dayAddedKwh * 100) / 100,
        tempAvgC: wPoint.tempAvgC,
        tempMinC: wPoint.tempMinC,
        tempMaxC: wPoint.tempMaxC,
        weatherEmoji: wPoint.emoji,
        weatherCondition: wPoint.condition,
        devicesSummary: parts.join(' • '),
      };
    });

    const coldDaysAvgKwh = coldDaysCount > 0 ? Math.round((coldDaysKwhSum / coldDaysCount) * 100) / 100 : null;
    const coldDaysAvgTempC = coldDaysCount > 0 ? Math.round((coldDaysTempSum / coldDaysCount) * 10) / 10 : null;
    const warmDaysAvgKwh = warmDaysCount > 0 ? Math.round((warmDaysKwhSum / warmDaysCount) * 100) / 100 : null;
    const warmDaysAvgTempC = warmDaysCount > 0 ? Math.round((warmDaysTempSum / warmDaysCount) * 10) / 10 : null;

    // Generate analytical insights & recommendations (including weather impact!)
    const insights: {
      title: string;
      description: string;
      badge?: string;
      icon: string;
      tone: 'amber' | 'emerald' | 'indigo' | 'rose';
    }[] = [];

    // Weather-driven insight first!
    const tempTrendText =
      monthTempDropC > 0.4
        ? `Очікується зниження середньої температури з ${avgElapsedMonthTempC > 0 ? '+' : ''}${avgElapsedMonthTempC}°C до ${avgForecastRemainingTempC > 0 ? '+' : ''}${avgForecastRemainingTempC}°C (похолодання на ${monthTempDropC.toFixed(1)}°C).`
        : monthTempDropC < -0.4
          ? `Очікується підвищення середньої температури з ${avgElapsedMonthTempC > 0 ? '+' : ''}${avgElapsedMonthTempC}°C до ${avgForecastRemainingTempC > 0 ? '+' : ''}${avgForecastRemainingTempC}°C (потепління на ${Math.abs(monthTempDropC).toFixed(1)}°C).`
          : `Середня температура утримається близько ${avgForecastRemainingTempC > 0 ? '+' : ''}${avgForecastRemainingTempC}°C.`;

    insights.push({
      title: 'Погодний прогноз споживання (вплив температури)',
      badge: `${weatherProjectedHouseMonthKwh.toFixed(0)} кВт·год (${weatherHouseImpactPct >= 0 ? '+' : ''}${weatherHouseImpactPct.toFixed(1)}%)`,
      icon: monthTempDropC > 0.5 ? 'ac_unit' : 'thermostat',
      tone: monthTempDropC > 1.0 ? 'rose' : 'indigo',
      description: `${tempTrendText} Чим нижча температура на вулиці, тим більше електроенергії витрачається на обігрів, підігрів води у бойлері та зарядку авто. З урахуванням погоди прогноз за місяць становить ~${weatherProjectedHouseMonthKwh.toFixed(0)} кВт·год (~${weatherProjectedHouseMonthCostUah.toFixed(0)} грн) замість лінійних ${projectedHouseMonthKwh.toFixed(0)} кВт·год (${weatherHouseDeltaKwh >= 0 ? '+' : ''}${weatherHouseDeltaKwh.toFixed(1)} кВт·год / ${weatherHouseDeltaCostUah >= 0 ? '+' : ''}${weatherHouseDeltaCostUah.toFixed(0)} грн).`,
    });

    const topDevice = deviceRows[0];
    if (topDevice && topDevice.monthKwh > 0) {
      insights.push({
        title: `Головний споживач: ${topDevice.device.name}`,
        badge: `${topDevice.shareOfHousePercent.toFixed(1)}% від дому`,
        icon: 'local_fire_department',
        tone: 'amber',
        description: `Прилад «${topDevice.device.name}» спожив ${topDevice.monthKwh.toFixed(2)} кВт·год (${topDevice.monthCostUah.toFixed(0)} грн) при середній температурі ${topDevice.devAvgLoggedTempC > 0 ? '+' : ''}${topDevice.devAvgLoggedTempC}°C. Погодний прогноз до кінця місяця: ~${topDevice.weatherProjectedMonthKwh.toFixed(1)} кВт·год (~${topDevice.weatherProjectedMonthCostUah.toFixed(0)} грн).`,
      });
    }

    insights.push({
      title: 'Баланс обліку: Пристрої vs Загальний лічильник',
      badge: `${devicesSharePercent.toFixed(0)}% обліковано`,
      icon: 'balance',
      tone: 'emerald',
      description:
        untrackedKwh > 0
          ? `Відстежувані прилади формують ${devicesSharePercent.toFixed(1)}% (${totalDevicesKwh.toFixed(1)} кВт·год) споживання дому. Залишок ${untrackedKwh.toFixed(1)} кВт·год (${untrackedSharePercent.toFixed(1)}%, ~${untrackedCostUah.toFixed(0)} грн) припадає на освітлення, роутер та дрібну техніку.`
          : `Усі ${totalDevicesKwh.toFixed(1)} кВт·год наразі розподілені між доданими приладами. Ви можете уточнити загальне споживання за лічильником угорі для розрахунку фонового споживання.`,
    });

    const season = getSeasonForDate(referenceDate);
    const winterLimit = 2000;
    insights.push({
      title: 'Контроль зимового ліміту з урахуванням погоди',
      badge: `~${weatherProjectedHouseMonthKwh.toFixed(0)} кВт·год`,
      icon: weatherProjectedHouseMonthKwh > winterLimit && season === 'winter' ? 'warning' : 'trending_up',
      tone: weatherProjectedHouseMonthKwh > winterLimit && season === 'winter' ? 'rose' : 'indigo',
      description:
        season === 'winter'
          ? `За скоригованим на погоду прогнозом споживання за місяць складе ~${weatherProjectedHouseMonthKwh.toFixed(0)} кВт·год (~${weatherProjectedHouseMonthCostUah.toFixed(0)} грн). ${
              weatherProjectedHouseMonthKwh <= winterLimit
                ? `Ви впевнено вкладаєтесь у пільговий зимовий ліміт ${winterLimit} кВт·год (запас ${(winterLimit - weatherProjectedHouseMonthKwh).toFixed(0)} кВт·год).`
                : `Увага: через похолодання прогнозується перевищення зимового ліміту ${winterLimit} кВт·год на ${(weatherProjectedHouseMonthKwh - winterLimit).toFixed(0)} кВт·год!`
            }`
          : `За скоригованим на погоду прогнозом очікуване споживання на кінець місяця становить ~${weatherProjectedHouseMonthKwh.toFixed(0)} кВт·год (~${weatherProjectedHouseMonthCostUah.toFixed(0)} грн).`,
    });

    // Night tariff potential savings for night-friendly devices
    const nightFriendlyRows = deviceRows.filter((r) => r.device.isNightFriendly && r.weatherProjectedMonthKwh > 0);
    if (nightFriendlyRows.length > 0) {
      const shiftableKwh = nightFriendlyRows.reduce((s, r) => s + r.weatherProjectedMonthKwh * 0.7, 0);
      const savingsUah = Math.round(shiftableKwh * (effectiveRateUah - nightRateUah));
      if (savingsUah > 0) {
        insights.push({
          title: 'Оптимізація за нічним тарифом (23:00–07:00)',
          badge: `Економія ~${savingsUah} грн/міс`,
          icon: 'dark_mode',
          tone: 'indigo',
          description: `Прилади (${nightFriendlyRows.map((n) => n.device.name).join(', ')}) можуть працювати за нічним тарифом (${nightRateUah.toFixed(2)} грн/кВт·г). Перенесення 70% їх роботи на ніч заощадить ~${savingsUah} грн щомісяця.`,
        });
      }
    }

    // Smart insight from control reading notes (if any notes explained device consumption)
    if (totalAttributedNoteKwh > 0) {
      const explainedDeviceNames = Array.from(
        new Set([
          ...Object.keys(attributedByDeviceId).map((id) => devices.find((d) => d.id === id)?.name).filter(Boolean),
          ...unassignedAttributions.map((u) => u.action),
        ])
      );

      insights.unshift({
        title: 'Аналіз приміток контрольних замірів',
        badge: `Пояснено ~${totalAttributedNoteKwh.toFixed(1)} кВт·год`,
        icon: 'psychology',
        tone: 'emerald',
        description: `Завдяки аналізу приміток до контрольних замірів розпізнано роботу приладів без окремих смарт-розеток: ${explainedDeviceNames.join(', ')} (~${totalAttributedNoteKwh.toFixed(1)} кВт·год). Це дозволило пояснити частину стрибків споживання та знизити нерозподілений фоновий залишок будинку до ${untrackedKwh.toFixed(1)} кВт·год.`,
      });
    }

    // Unmonitored catalog devices insight
    const unmonitoredCatalogDevices = devices.filter((dev) => {
      const row = deviceRows.find((r) => r.device.id === dev.id);
      return row && row.isUnmonitoredCatalogDevice;
    });

    // Air conditioner two-stage power profile & empirical reading average insight
    const acRows = deviceRows.filter((r) => r.isAirConditioner);
    if (acRows.length > 0) {
      const acDescriptions = acRows.map((r) => {
        const maxW = r.device.powerWatts || 2200;
        const empText =
          r.allLogsCount > 0
            ? `, середнє по наявних показах (${r.allLogsCount} зап.): ${r.avgKwhPerReading.toFixed(2)} кВт·г/показ`
            : '';
        return `«${r.device.name}» (пікова потужність нагріву ${maxW} Вт, робочий режим підтримання температури ${r.steadyRangeLabel} / ~${r.steadyOperatingWatts} Вт·г${empText})`;
      });
      insights.push({
        title: 'Робочий режим кондиціонера (400–800 Вт·г) та середнє по показах',
        badge: `${acRows[0].steadyRangeLabel}`,
        icon: 'ac_unit',
        tone: 'emerald',
        description: `Для кондиціонера вказана потужність є максимальною при старті, а після первинного нагріву приміщення та переходу в робочий режим споживання становить 400–800 Вт·г: ${acDescriptions.join('; ')}. Це враховано при розрахунку тривалості роботи та аналізі замірів.`,
      });
    }

    if (unmonitoredCatalogDevices.length > 0) {
      insights.push({
        title: 'Пристрої будинку без окремих лічильників',
        badge: `${unmonitoredCatalogDevices.length} прилад(ів)`,
        icon: 'devices_other',
        tone: 'indigo',
        description: `У списку будинку наявні прилади, для яких не ведеться окремий облік: ${unmonitoredCatalogDevices.map((d) => d.name + (d.powerWatts ? ` (${isAirConditionerDevice(d) ? `пік ${d.powerWatts} Вт / роб. 400–800 Вт·г` : `${d.powerWatts} Вт`})` : '')).join(', ')}. Вони формують частину фонового споживання будинку (${untrackedKwh.toFixed(1)} кВт·год). Щоб система автоматично розподіляла їх частку, вказуйте час їх увімкнення у примітках до контрольних замірів (наприклад: «Вчора увімкнули опалення з 17-ї до сьогодні 8-ї години»).`,
      });
    }

    return {
      selectedMonth,
      monthLabel,
      referenceDate,
      daysElapsed,
      daysRemaining,
      daysInMonth,
      effectiveRateUah,
      totalLogsInMonth,
      deviceRows,
      totalDevicesKwh,
      totalDevicesCostUah,
      devicesDailyPace,
      projectedDevicesMonthKwh,
      projectedDevicesMonthCostUah,
      weatherProjectedDevicesMonthKwh,
      weatherProjectedDevicesMonthCostUah,
      totalAttributedNoteKwh,
      unmonitoredCatalogDevices,
      houseReferenceKwh,
      houseReferenceCostUah,
      houseDailyPace,
      houseSourceLabel,
      untrackedKwh,
      untrackedCostUah,
      devicesSharePercent,
      untrackedSharePercent,
      projectedUntrackedMonthKwh,
      projectedHouseMonthKwh,
      projectedHouseMonthCostUah,
      weatherProjectedHouseMonthKwh,
      weatherProjectedHouseMonthCostUah,
      weatherHouseDeltaKwh,
      weatherHouseDeltaCostUah,
      weatherHouseImpactPct,
      avgElapsedMonthTempC,
      avgForecastRemainingTempC,
      monthTempDropC,
      coldDaysAvgKwh,
      coldDaysAvgTempC,
      warmDaysAvgKwh,
      warmDaysAvgTempC,
      maxChartKwh,
      dateProgressionPoints,
      insights,
      usageWarnings,
      averageDeviceMonthKwh,
      totalWarningExcessKwh,
      totalWarningExcessCostUah,
    };
  });

  onDeviceMonthChange(monthVal: string): void {
    if (monthVal && /^\d{4}-\d{2}$/.test(monthVal)) {
      this.deviceSelectedMonth.set(monthVal);
      this.customMonthHouseKwh.set(null);
    }
  }

  onCustomMonthHouseKwhChange(valStr: string): void {
    const num = parseFloat(valStr);
    if (!isNaN(num) && num >= 0) {
      this.customMonthHouseKwh.set(Math.round(num * 100) / 100);
    } else {
      this.customMonthHouseKwh.set(null);
    }
  }

  isDeviceLogsExpanded(deviceId: string): boolean {
    return Boolean(this.expandedDeviceIds()[deviceId]);
  }

  toggleDeviceLogsExpand(deviceId: string): void {
    this.expandedDeviceIds.update((prev) => ({
      ...prev,
      [deviceId]: !prev[deviceId],
    }));
  }

  openDeviceModal(): void {
    this.editingDeviceId.set(null);
    this.deviceForm.reset({
      name: '',
      category: 'other',
      icon: 'bolt',
      color: this.deviceColors[this.accountDevices().length % this.deviceColors.length],
      powerWatts: null,
      batteryCapacityKwh: null,
      isNightFriendly: false,
      notes: '',
    });
    this.isDeviceModalOpen.set(true);
  }

  openEditDeviceModal(device: ElectricityDevice): void {
    this.editingDeviceId.set(device.id);
    this.deviceForm.reset({
      name: device.name,
      category: device.category || 'other',
      icon: device.icon || 'bolt',
      color: device.color || '#10b981',
      powerWatts: device.powerWatts ?? null,
      batteryCapacityKwh: device.batteryCapacityKwh ?? null,
      isNightFriendly: Boolean(device.isNightFriendly),
      notes: device.notes || '',
    });
    this.isDeviceModalOpen.set(true);
  }

  closeDeviceModal(): void {
    this.isDeviceModalOpen.set(false);
    this.editingDeviceId.set(null);
  }

  applyDevicePresetToForm(preset: {
    name: string;
    category: string;
    icon: string;
    color: string;
    powerWatts: number;
    batteryCapacityKwh?: number;
    isNightFriendly: boolean;
    notes?: string;
  }): void {
    this.deviceForm.patchValue({
      name: preset.name,
      category: preset.category,
      icon: preset.icon,
      color: preset.color,
      powerWatts: preset.powerWatts,
      batteryCapacityKwh: preset.batteryCapacityKwh ?? null,
      isNightFriendly: preset.isNightFriendly,
      notes: preset.notes || '',
    });
  }

  onPresetSelectChange(name: string): void {
    const found = this.devicePresets.find((p) => p.name === name);
    if (found) {
      this.applyDevicePresetToForm(found);
    }
  }

  async quickAddPresetDevice(preset: {
    name: string;
    category: string;
    icon: string;
    color: string;
    powerWatts: number;
    batteryCapacityKwh?: number;
    isNightFriendly: boolean;
    notes?: string;
  }): Promise<void> {
    const acc = this.currentAccount();
    if (!acc) return;
    const currentUserId = this.dataService.currentUser()?.id || '';
    const currentList = [...this.accountDevices()];
    const newDev: ElectricityDevice = {
      id: `dev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      accountId: acc.id,
      ownerUserId: currentUserId,
      name: preset.name,
      category: preset.category,
      icon: preset.icon,
      color: preset.color,
      powerWatts: preset.powerWatts,
      batteryCapacityKwh: preset.batteryCapacityKwh,
      isNightFriendly: preset.isNightFriendly,
      notes: preset.notes || '',
      logs: [],
      createdAt: new Date().toISOString(),
    };
    this.isSavingDevices.set(true);
    try {
      await this.dataService.saveUtilityAccountDevices(
        acc.id,
        [...currentList, newDev],
        `Пристрій «${newDev.name}» додано!`
      );
    } finally {
      this.isSavingDevices.set(false);
    }
  }

  async saveDevice(): Promise<void> {
    if (this.deviceForm.invalid) return;
    const acc = this.currentAccount();
    if (!acc) return;
    const currentUserId = this.dataService.currentUser()?.id || '';

    const val = this.deviceForm.getRawValue();
    const editId = this.editingDeviceId();
    const currentList = [...this.accountDevices()];

    let nextList: ElectricityDevice[];
    if (editId) {
      nextList = currentList.map((d) =>
        d.id === editId
          ? {
              ...d,
              accountId: acc.id,
              ownerUserId: d.ownerUserId || currentUserId,
              name: (val.name || 'Пристрій').trim(),
              category: val.category || 'other',
              icon: val.icon || 'bolt',
              color: val.color || '#10b981',
              powerWatts: val.powerWatts && val.powerWatts > 0 ? Number(val.powerWatts) : undefined,
              batteryCapacityKwh:
                val.batteryCapacityKwh && val.batteryCapacityKwh > 0 ? Number(val.batteryCapacityKwh) : undefined,
              isNightFriendly: Boolean(val.isNightFriendly),
              notes: val.notes?.trim() || '',
              updatedAt: new Date().toISOString(),
            }
          : d
      );
    } else {
      const newDev: ElectricityDevice = {
        id: `dev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        accountId: acc.id,
        ownerUserId: currentUserId,
        name: (val.name || 'Пристрій').trim(),
        category: val.category || 'other',
        icon: val.icon || 'bolt',
        color: val.color || '#10b981',
        powerWatts: val.powerWatts && val.powerWatts > 0 ? Number(val.powerWatts) : undefined,
        batteryCapacityKwh:
          val.batteryCapacityKwh && val.batteryCapacityKwh > 0 ? Number(val.batteryCapacityKwh) : undefined,
        isNightFriendly: Boolean(val.isNightFriendly),
        notes: val.notes?.trim() || '',
        logs: [],
        createdAt: new Date().toISOString(),
      };
      nextList = [...currentList, newDev];
    }

    this.isSavingDevices.set(true);
    try {
      const ok = await this.dataService.saveUtilityAccountDevices(
        acc.id,
        nextList,
        editId ? 'Пристрій оновлено!' : 'Пристрій успішно додано!'
      );
      if (ok) {
        this.closeDeviceModal();
      }
    } finally {
      this.isSavingDevices.set(false);
    }
  }

  async deleteDevice(deviceId: string): Promise<void> {
    const acc = this.currentAccount();
    if (!acc) return;
    const target = this.accountDevices().find((d) => d.id === deviceId);
    if (!target) return;
    if (!confirm(`Видалити пристрій «${target.name}» та всі його записи споживання?`)) return;

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

  readonly selectedLogDevice = computed<ElectricityDevice | null>(() => {
    this.deviceLogFormTrigger();
    const devId = this.deviceLogForm.get('deviceId')?.value;
    if (!devId) return null;
    return this.accountDevices().find((d) => d.id === devId) || null;
  });

  readonly calculatedLogDurationHours = computed<number | null>(() => {
    this.deviceLogFormTrigger();
    const mode = this.deviceLogForm.get('entryMode')?.value;
    const startDate = this.deviceLogForm.get('date')?.value || '';
    const endDate =
      mode === 'period_range'
        ? this.deviceLogForm.get('endDate')?.value || startDate
        : startDate;
    const startTime = this.deviceLogForm.get('startTime')?.value || '';
    const endTime = this.deviceLogForm.get('endTime')?.value || '';

    return this.computeDurationHours(startDate, endDate, startTime, endTime);
  });

  isSelectedLogDeviceAirConditioner(): boolean {
    const dev = this.selectedLogDevice();
    return isAirConditionerDevice(dev);
  }

  readonly estimatedKwhFromPowerAndDuration = computed<number | null>(() => {
    const dev = this.selectedLogDevice();
    const durH = this.calculatedLogDurationHours();
    if (!dev || !durH || durH <= 0) return null;
    if (isAirConditionerDevice(dev)) {
      const w = this.currentFormLogWeather();
      const acProfile = resolveAirConditionerPowerProfile(dev.powerWatts || 1350, durH, dev, w?.tempAvgC);
      return acProfile.estimatedKwh;
    }
    if (!dev.powerWatts || dev.powerWatts <= 0) return null;
    return Math.round((dev.powerWatts / 1000) * durH * 100) / 100;
  });

  computeDurationHours(
    startDate: string,
    endDate: string,
    startTime: string,
    endTime: string
  ): number | null {
    if (!startDate) return null;
    const effectiveEndDate = endDate || startDate;

    if (startTime && endTime) {
      const startIso = `${startDate}T${startTime}:00`;
      const endIso = `${effectiveEndDate}T${endTime}:00`;
      const startMs = new Date(startIso).getTime();
      let endMs = new Date(endIso).getTime();
      if (isNaN(startMs) || isNaN(endMs)) return null;
      // If same date selected and endTime <= startTime (e.g. 23:00 to 07:00), treat as overnight (+24h)
      if (effectiveEndDate === startDate && endMs <= startMs) {
        endMs += 24 * 60 * 60 * 1000;
      }
      const diffHours = (endMs - startMs) / (1000 * 60 * 60);
      return diffHours > 0 ? Math.round(diffHours * 100) / 100 : null;
    }

    if (effectiveEndDate > startDate) {
      const sMs = new Date(startDate).getTime();
      const eMs = new Date(effectiveEndDate).getTime();
      if (!isNaN(sMs) && !isNaN(eMs) && eMs > sMs) {
        const days = Math.round((eMs - sMs) / (1000 * 60 * 60 * 24));
        return days * 24;
      }
    }
    return null;
  }

  onDeviceLogFormChange(syncWeatherFromDate = true): void {
    this.deviceLogFormTrigger.update((v) => v + 1);
    if (syncWeatherFromDate) {
      const w = this.currentFormLogWeather();
      this.logCustomTempAvgC.set(w.tempAvgC);
      this.logCustomWeatherCondition.set(w.condition);
    }
  }

  resetLogWeatherToAuto(): void {
    const w = this.currentFormLogWeather();
    this.logCustomTempAvgC.set(w.tempAvgC);
    this.logCustomWeatherCondition.set(w.condition);
  }

  setDeviceLogEntryMode(mode: DeviceConsumptionEntryMode): void {
    const curDate = this.deviceLogForm.get('date')?.value || new Date().toISOString().split('T')[0];
    this.deviceLogForm.patchValue({
      entryMode: mode,
      endDate: mode === 'period_range' ? this.deviceLogForm.get('endDate')?.value || curDate : '',
    });
    this.onDeviceLogFormChange();
  }

  applyQuickTimeInterval(startTime: string, endTime: string, isOvernight: boolean): void {
    const startDate = this.deviceLogForm.get('date')?.value || new Date().toISOString().split('T')[0];
    let endDate = startDate;
    if (isOvernight) {
      const d = new Date(startDate);
      if (!isNaN(d.getTime())) {
        d.setDate(d.getDate() + 1);
        endDate = d.toISOString().split('T')[0];
      }
    }
    this.deviceLogForm.patchValue({
      entryMode: 'period_range',
      endDate,
      startTime,
      endTime,
    });
    this.onDeviceLogFormChange();
  }

  applyEstimatedKwhToLogForm(estKwh: number): void {
    this.deviceLogForm.patchValue({ consumedKwh: estKwh });
    this.onDeviceLogFormChange(false);
  }

  calculateEvChargeKwh(batteryCapacityKwh: number): number {
    const s = Math.max(0, Math.min(100, this.evChargeStartPct()));
    const e = Math.max(0, Math.min(100, this.evChargeEndPct()));
    const diffPct = Math.max(0, e - s);
    return Math.round(((diffPct / 100) * batteryCapacityKwh) * 100) / 100;
  }

  applyEvBatteryChargeCalculation(batteryCapacityKwh: number): void {
    const kwh = this.calculateEvChargeKwh(batteryCapacityKwh);
    const s = this.evChargeStartPct();
    const e = this.evChargeEndPct();
    const curComment = this.deviceLogForm.get('comment')?.value?.trim() || '';
    this.deviceLogForm.patchValue({
      consumedKwh: kwh,
      comment: curComment || `Зарядка батареї з ${s}% до ${e}% (${batteryCapacityKwh} кВт·год)`,
    });
    this.onDeviceLogFormChange(false);
  }

  getDeviceLogDateLabel(log: ElectricityDeviceLogEntry): string {
    if (log.entryMode === 'period_range' && log.endDate && log.endDate !== log.date) {
      return `${this.formatDate(log.date)} – ${this.formatDate(log.endDate)}`;
    }
    return this.formatDate(log.date);
  }

  getDeviceLogModeBadge(log: ElectricityDeviceLogEntry): string {
    switch (log.entryMode) {
      case 'single_day':
        return 'За конкретну добу';
      case 'period_range':
        return 'За відрізок часу';
      case 'delta':
        return '+ Додано дельту';
      default:
        return 'Станом на дату (з поч. міс.)';
    }
  }

  getDeviceLogTimeIntervalBadge(log: ElectricityDeviceLogEntry): string {
    const parts: string[] = [];
    if (log.startTime && log.endTime) {
      parts.push(`${log.startTime}–${log.endTime}`);
    } else if (log.startTime) {
      parts.push(`з ${log.startTime}`);
    } else if (log.endTime) {
      parts.push(`до ${log.endTime}`);
    }
    if (log.durationHours && log.durationHours > 0) {
      parts.push(`${log.durationHours} год`);
    }
    return parts.join(' • ');
  }

  getDeviceLogTariffBadge(log: ElectricityDeviceLogEntry): string {
    switch (log.tariffSelection) {
      case 'night_only':
        return '🌙 Ніч (Т1)';
      case 'day_only':
        return '☀️ День (Т2)';
      default:
        return '⏱️ Розраховано по часу';
    }
  }

  openAddDeviceLogModal(deviceId?: string): void {
    const devices = this.accountDevices();
    if (devices.length === 0) {
      this.openDeviceModal();
      return;
    }
    const targetId = deviceId || devices[0].id;
    const today = new Date().toISOString().split('T')[0];
    const selMonth = this.deviceSelectedMonth();
    const defaultDate = today.startsWith(selMonth) ? today : `${selMonth}-15`;

    this.editingDeviceLogId.set(null);
    this.editingDeviceLogOriginalDeviceId.set(null);
    this.deviceLogForm.reset({
      deviceId: targetId,
      date: defaultDate,
      endDate: defaultDate,
      startTime: '',
      endTime: '',
      consumedKwh: null,
      entryMode: 'single_day',
      tariffSelection: 'auto_time',
      comment: '',
    });
    this.onDeviceLogFormChange(true);
    this.isDeviceLogModalOpen.set(true);
  }

  openEditDeviceLogModal(deviceId: string, log: ElectricityDeviceLogEntry): void {
    this.editingDeviceLogId.set(log.id);
    this.editingDeviceLogOriginalDeviceId.set(deviceId);
    this.deviceLogForm.reset({
      deviceId,
      date: log.date,
      endDate: log.endDate || log.date,
      startTime: log.startTime || '',
      endTime: log.endTime || '',
      consumedKwh: log.consumedKwh,
      entryMode: log.entryMode || 'single_day',
      tariffSelection: log.tariffSelection || 'auto_time',
      comment: log.comment || '',
    });
    const effWeather = this.getEffectiveLogWeather(log);
    this.logCustomTempAvgC.set(effWeather.tempAvgC);
    this.logCustomWeatherCondition.set(effWeather.condition);
    this.onDeviceLogFormChange(false);
    this.isDeviceLogModalOpen.set(true);
  }

  closeDeviceLogModal(): void {
    this.isDeviceLogModalOpen.set(false);
    this.editingDeviceLogId.set(null);
    this.editingDeviceLogOriginalDeviceId.set(null);
  }

  async saveDeviceLog(): Promise<void> {
    if (this.deviceLogForm.invalid) return;
    const acc = this.currentAccount();
    if (!acc) return;

    const val = this.deviceLogForm.getRawValue();
    const dateStr = val.date || new Date().toISOString().split('T')[0];
    const entryMode: DeviceConsumptionEntryMode = val.entryMode || 'single_day';
    const endDateStr =
      entryMode === 'period_range' && val.endDate ? val.endDate.trim() : undefined;
    const startTimeStr =
      (entryMode === 'period_range' || entryMode === 'single_day') && val.startTime
        ? val.startTime.trim()
        : undefined;
    const endTimeStr =
      (entryMode === 'period_range' || entryMode === 'single_day') && val.endTime
        ? val.endTime.trim()
        : undefined;
    const durationHours = this.computeDurationHours(
      dateStr,
      endDateStr || dateStr,
      startTimeStr || '',
      endTimeStr || ''
    );
    const periodMonth = dateStr.slice(0, 7);
    const kwh = Math.max(0, Math.round((Number(val.consumedKwh) || 0) * 100) / 100);
    const tariffSelection = val.tariffSelection || 'auto_time';

    // Resolve weather for this log entry
    const baseWeather = this.getWeatherForDate(dateStr, endDateStr);
    const customTemp = this.logCustomTempAvgC();
    const finalTempAvgC =
      customTemp !== null && !isNaN(Number(customTemp))
        ? Math.round(Number(customTemp) * 10) / 10
        : baseWeather.tempAvgC;
    const finalCondition = this.logCustomWeatherCondition().trim() || baseWeather.condition;
    const finalEmoji =
      finalTempAvgC <= -1 ? '❄️' : finalTempAvgC < 6 ? '☁️' : finalTempAvgC >= 16 ? '☀️' : baseWeather.emoji;

    const editLogId = this.editingDeviceLogId();
    const origDeviceId = this.editingDeviceLogOriginalDeviceId();

    if (editLogId) {
      let existingEntry: ElectricityDeviceLogEntry | undefined;
      for (const dev of this.accountDevices()) {
        const found = (dev.logs || []).find((l) => l.id === editLogId);
        if (found) {
          existingEntry = found;
          break;
        }
      }

      const updatedLog: ElectricityDeviceLogEntry = {
        id: editLogId,
        date: dateStr,
        endDate: endDateStr,
        startTime: startTimeStr,
        endTime: endTimeStr,
        durationHours: durationHours ?? undefined,
        periodMonth,
        consumedKwh: kwh,
        entryMode,
        tariffSelection,
        tempAvgC: finalTempAvgC,
        tempMinC: baseWeather.tempMinC,
        tempMaxC: baseWeather.tempMaxC,
        weatherCode: baseWeather.weatherCode,
        weatherCondition: finalCondition,
        weatherIcon: finalEmoji,
        comment: val.comment?.trim() || undefined,
        aiExplanation: existingEntry?.aiExplanation,
        fromScreenshot: existingEntry?.fromScreenshot ?? false,
        createdAt: existingEntry?.createdAt || new Date().toISOString(),
      };

      const nextList = this.accountDevices().map((d) => {
        if (origDeviceId && origDeviceId !== val.deviceId) {
          if (d.id === origDeviceId) {
            return {
              ...d,
              logs: (d.logs || []).filter((l) => l.id !== editLogId),
              updatedAt: new Date().toISOString(),
            };
          }
          if (d.id === val.deviceId) {
            return {
              ...d,
              logs: [...(d.logs || []), updatedLog],
              updatedAt: new Date().toISOString(),
            };
          }
          return d;
        }
        if (d.id === val.deviceId) {
          return {
            ...d,
            logs: (d.logs || []).map((l) => (l.id === editLogId ? updatedLog : l)),
            updatedAt: new Date().toISOString(),
          };
        }
        return d;
      });

      this.isSavingDevices.set(true);
      try {
        const ok = await this.dataService.saveUtilityAccountDevices(
          acc.id,
          nextList,
          `Запис споживання та погоду (${finalTempAvgC > 0 ? '+' : ''}${finalTempAvgC}°C) оновлено!`
        );
        if (ok) {
          this.deviceSelectedMonth.set(periodMonth);
          this.closeDeviceLogModal();
        }
      } finally {
        this.isSavingDevices.set(false);
      }
      return;
    }

    const newLog: ElectricityDeviceLogEntry = {
      id: `dlog_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      date: dateStr,
      endDate: endDateStr,
      startTime: startTimeStr,
      endTime: endTimeStr,
      durationHours: durationHours ?? undefined,
      periodMonth,
      consumedKwh: kwh,
      entryMode,
      tariffSelection,
      tempAvgC: finalTempAvgC,
      tempMinC: baseWeather.tempMinC,
      tempMaxC: baseWeather.tempMaxC,
      weatherCode: baseWeather.weatherCode,
      weatherCondition: finalCondition,
      weatherIcon: finalEmoji,
      comment: val.comment?.trim() || undefined,
      fromScreenshot: false,
      createdAt: new Date().toISOString(),
    };

    const nextList = this.accountDevices().map((d) =>
      d.id === val.deviceId
        ? {
            ...d,
            logs: [...(d.logs || []), newLog],
            updatedAt: new Date().toISOString(),
          }
        : d
    );

    this.isSavingDevices.set(true);
    try {
      const ok = await this.dataService.saveUtilityAccountDevices(
        acc.id,
        nextList,
        `Споживання ${kwh} кВт·год та погоду (${finalTempAvgC > 0 ? '+' : ''}${finalTempAvgC}°C) зафіксовано!`
      );
      if (ok) {
        this.deviceSelectedMonth.set(periodMonth);
        this.closeDeviceLogModal();
      }
    } finally {
      this.isSavingDevices.set(false);
    }
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

  // ========================================================
  // AI SCREENSHOT + COMMENT MODAL WORKFLOW
  // ========================================================

  openScreenshotModal(deviceId?: string): void {
    const devices = this.accountDevices();
    if (deviceId) {
      this.screenshotTargetDeviceId.set(deviceId);
    } else if (devices.length > 0) {
      this.screenshotTargetDeviceId.set(devices[0].id);
    } else {
      this.screenshotTargetDeviceId.set('__new__');
    }
    this.screenshotNewDeviceName.set('');
    this.screenshotNewDeviceWatts.set(null);

    const today = new Date().toISOString().split('T')[0];
    const selMonth = this.deviceSelectedMonth();
    const defaultDate = today.startsWith(selMonth) ? today : `${selMonth}-15`;
    this.screenshotDate.set(defaultDate);
    this.screenshotEndDate.set(defaultDate);
    this.screenshotStartTime.set('');
    this.screenshotEndTime.set('');
    this.screenshotBase64.set('');
    this.screenshotComment.set('');
    this.screenshotError.set(null);
    this.screenshotAnalysisResult.set(null);
    this.screenshotExtractedKwh.set(null);
    this.screenshotExtractedMode.set('single_day');
    this.isScreenshotModalOpen.set(true);
  }

  closeScreenshotModal(): void {
    this.isScreenshotModalOpen.set(false);
  }

  onScreenshotDeviceSelect(val: string): void {
    this.screenshotTargetDeviceId.set(val);
  }

  onScreenshotFileSelected(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl?.files?.[0];
    if (!file) return;
    this.readScreenshotFile(file);
  }

  onScreenshotPaste(event: ClipboardEvent): void {
    const items = event.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          this.readScreenshotFile(file);
          break;
        }
      }
    }
  }

  private readScreenshotFile(file: File): void {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        this.screenshotBase64.set(reader.result);
        this.screenshotError.set(null);
      }
    };
    reader.readAsDataURL(file);
  }

  clearScreenshotImage(): void {
    this.screenshotBase64.set('');
    this.screenshotAnalysisResult.set(null);
    this.screenshotExtractedKwh.set(null);
  }

  async analyzeUploadedScreenshot(): Promise<void> {
    const img = this.screenshotBase64();
    if (!img) {
      this.screenshotError.set('Спочатку завантажте або вставте скріншот');
      return;
    }

    const targetId = this.screenshotTargetDeviceId();
    const existingDev = this.accountDevices().find((d) => d.id === targetId);
    const deviceName =
      targetId === '__new__'
        ? this.screenshotNewDeviceName().trim()
        : existingDev?.name || '';

    this.isAnalyzingScreenshot.set(true);
    this.screenshotError.set(null);

    try {
      const res = await this.dataService.analyzeDeviceScreenshot({
        imageBase64: img,
        comment: this.screenshotComment().trim(),
        deviceName,
        date: this.screenshotDate(),
      });

      if (res && res.success) {
        this.screenshotAnalysisResult.set(res);
        this.screenshotExtractedKwh.set(res.consumedKwh);
        const mode: DeviceConsumptionEntryMode =
          res.valueType === 'single_day' ||
          res.valueType === 'period_range' ||
          res.valueType === 'delta'
            ? res.valueType
            : 'cumulative_month';
        this.screenshotExtractedMode.set(mode);
        if (res.detectedDate && /^\d{4}-\d{2}-\d{2}$/.test(res.detectedDate)) {
          this.screenshotDate.set(res.detectedDate);
        }
        if (res.detectedEndDate && /^\d{4}-\d{2}-\d{2}$/.test(res.detectedEndDate)) {
          this.screenshotEndDate.set(res.detectedEndDate);
        }
        if (res.detectedStartTime) {
          this.screenshotStartTime.set(res.detectedStartTime);
        }
        if (res.detectedEndTime) {
          this.screenshotEndTime.set(res.detectedEndTime);
        }
        if (targetId === '__new__' && !this.screenshotNewDeviceName().trim() && res.detectedDeviceName) {
          this.screenshotNewDeviceName.set(res.detectedDeviceName);
        }
        if (targetId === '__new__' && !this.screenshotNewDeviceWatts() && res.powerWatts) {
          this.screenshotNewDeviceWatts.set(res.powerWatts);
        }
      } else {
        this.screenshotError.set(res?.error || 'Не вдалося розпізнати дані зі скріншоту');
      }
    } catch (err: unknown) {
      const msg =
        (err as { error?: { error?: string } })?.error?.error ||
        'Помилка під час аналізу скріншоту через Gemini AI';
      this.screenshotError.set(msg);
    } finally {
      this.isAnalyzingScreenshot.set(false);
    }
  }

  async applyScreenshotToDevice(): Promise<void> {
    const acc = this.currentAccount();
    if (!acc) return;
    const currentUserId = this.dataService.currentUser()?.id || '';
    const kwh = this.screenshotExtractedKwh();
    if (kwh === null || isNaN(kwh) || kwh < 0) return;

    const dateStr = this.screenshotDate() || new Date().toISOString().split('T')[0];
    const mode = this.screenshotExtractedMode();
    const endDateStr =
      mode === 'period_range' && this.screenshotEndDate() ? this.screenshotEndDate() : undefined;
    const startTimeStr =
      (mode === 'period_range' || mode === 'single_day') && this.screenshotStartTime()
        ? this.screenshotStartTime()
        : undefined;
    const endTimeStr =
      (mode === 'period_range' || mode === 'single_day') && this.screenshotEndTime()
        ? this.screenshotEndTime()
        : undefined;
    const aiRes = this.screenshotAnalysisResult();
    const computedDur =
      this.computeDurationHours(dateStr, endDateStr || dateStr, startTimeStr || '', endTimeStr || '') ??
      aiRes?.detectedDurationHours ??
      undefined;
    const periodMonth = dateStr.slice(0, 7);

    const wPoint = this.getWeatherForDate(dateStr, endDateStr);

    const newLog: ElectricityDeviceLogEntry = {
      id: `dlog_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      date: dateStr,
      endDate: endDateStr,
      startTime: startTimeStr,
      endTime: endTimeStr,
      durationHours: computedDur,
      periodMonth,
      consumedKwh: Math.round(kwh * 100) / 100,
      entryMode: mode,
      tempAvgC: wPoint.tempAvgC,
      tempMinC: wPoint.tempMinC,
      tempMaxC: wPoint.tempMaxC,
      weatherCode: wPoint.weatherCode,
      weatherCondition: wPoint.condition,
      weatherIcon: wPoint.emoji,
      comment: this.screenshotComment().trim() || undefined,
      aiExplanation: aiRes?.explanation || undefined,
      fromScreenshot: true,
      createdAt: new Date().toISOString(),
    };

    const currentList = [...this.accountDevices()];
    let nextList: ElectricityDevice[];
    let targetDeviceName = '';

    if (this.screenshotTargetDeviceId() === '__new__') {
      targetDeviceName =
        this.screenshotNewDeviceName().trim() ||
        aiRes?.detectedDeviceName ||
        `Пристрій ${currentList.length + 1}`;
      const newDev: ElectricityDevice = {
        id: `dev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        accountId: acc.id,
        ownerUserId: currentUserId,
        name: targetDeviceName,
        category: 'smart_plug',
        icon: 'power',
        color: this.deviceColors[currentList.length % this.deviceColors.length],
        powerWatts: this.screenshotNewDeviceWatts() || aiRes?.powerWatts || undefined,
        isNightFriendly: false,
        notes: 'Додано через AI-аналіз скріншоту',
        logs: [newLog],
        createdAt: new Date().toISOString(),
      };
      nextList = [...currentList, newDev];
    } else {
      const targetId = this.screenshotTargetDeviceId();
      nextList = currentList.map((d) => {
        if (d.id === targetId) {
          targetDeviceName = d.name;
          return {
            ...d,
            accountId: acc.id,
            ownerUserId: d.ownerUserId || currentUserId,
            logs: [...(d.logs || []), newLog],
            updatedAt: new Date().toISOString(),
          };
        }
        return d;
      });
    }

    this.isSavingDevices.set(true);
    try {
      const ok = await this.dataService.saveUtilityAccountDevices(
        acc.id,
        nextList,
        `Додано ${newLog.consumedKwh} кВт·год та погоду (${wPoint.tempAvgC > 0 ? '+' : ''}${wPoint.tempAvgC}°C) до «${targetDeviceName}»!`
      );
      if (ok) {
        this.deviceSelectedMonth.set(periodMonth);
        this.activeTab.set('devices');
        this.closeScreenshotModal();
      }
    } finally {
      this.isSavingDevices.set(false);
    }
  }

  // =========================================================================
  // 10 OUTAGE SCHEDULE DISPLAY VARIANTS & NAVIGATION TO SETTINGS
  // =========================================================================
  readonly outageScheduleVariants = OUTAGE_SCHEDULE_VARIANTS;
  readonly activeOutageVariant = this.dataService.outageScheduleViewVariant;
  readonly isInlineVariantBarExpanded = signal(false);

  readonly activeOutageVariantMeta = computed<OutageScheduleVariantMeta>(() => {
    const v = this.activeOutageVariant();
    return (
      this.outageScheduleVariants.find((item) => item.id === v) ||
      this.outageScheduleVariants[0]
    );
  });

  openOutageDisplaySettings(): void {
    this.dataService.openOutageScheduleSettings();
  }

  selectOutageVariantInline(variant: OutageScheduleViewVariant): void {
    void this.dataService.setOutageScheduleViewVariant(variant, true);
  }

  getGroupedIntervals(
    hours: DtekHourSchedule[],
    currentHourNumber = 0,
    currentMinute = 0
  ): OutageChronologicalInterval[] {
    if (!hours || hours.length === 0) return [];
    const halfSlots: {
      slotIdx: number;
      hour: number;
      fromTime: string;
      toTime: string;
      state: 'on' | 'off';
      isNow: boolean;
    }[] = [];

    for (const h of hours) {
      const hZero = h.hour - 1;
      const hh = String(hZero).padStart(2, '0');
      const hhNext = String(h.hour).padStart(2, '0');
      const isCurHour = h.hour === currentHourNumber;
      halfSlots.push({
        slotIdx: hZero * 2,
        hour: h.hour,
        fromTime: `${hh}:00`,
        toTime: `${hh}:30`,
        state: h.firstHalfPower ? 'on' : 'off',
        isNow: isCurHour && currentMinute < 30,
      });
      halfSlots.push({
        slotIdx: hZero * 2 + 1,
        hour: h.hour,
        fromTime: `${hh}:30`,
        toTime: `${hhNext}:00`,
        state: h.secondHalfPower ? 'on' : 'off',
        isNow: isCurHour && currentMinute >= 30,
      });
    }

    const grouped: OutageChronologicalInterval[] = [];
    for (const slot of halfSlots) {
      const prev = grouped[grouped.length - 1];
      if (prev && prev.state === slot.state) {
        prev.toTime = slot.toTime;
        prev.durationHours = Math.round((prev.durationHours + 0.5) * 10) / 10;
        prev.endHour = slot.hour;
        if (slot.isNow) prev.containsCurrentTime = true;
      } else {
        grouped.push({
          id: `${slot.fromTime}_${slot.state}`,
          fromTime: slot.fromTime,
          toTime: slot.toTime,
          durationHours: 0.5,
          state: slot.state,
          containsCurrentTime: slot.isNow,
          startHour: slot.hour,
          endHour: slot.hour,
        });
      }
    }
    return grouped;
  }

  getShiftQuadrants(
    hours: DtekHourSchedule[],
    currentHourNumber = 0
  ): OutageShiftQuadrant[] {
    const defs = [
      {
        id: 'night',
        title: 'Нічна зміна',
        timeRange: '00:00 – 06:00',
        icon: 'dark_mode',
        accentClass: 'from-indigo-950/90 to-slate-900 text-white border-indigo-500/30',
        badgeClass: 'bg-indigo-500/20 text-indigo-200 border-indigo-400/30',
        minH: 1,
        maxH: 6,
      },
      {
        id: 'morning',
        title: 'Ранковий пік',
        timeRange: '06:00 – 12:00',
        icon: 'wb_twilight',
        accentClass: 'from-amber-50 to-orange-50/70 text-slate-900 border-amber-200',
        badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
        minH: 7,
        maxH: 12,
      },
      {
        id: 'afternoon',
        title: 'Денна фаза',
        timeRange: '12:00 – 18:00',
        icon: 'light_mode',
        accentClass: 'from-sky-50 to-emerald-50/50 text-slate-900 border-sky-200',
        badgeClass: 'bg-sky-100 text-sky-900 border-sky-300',
        minH: 13,
        maxH: 18,
      },
      {
        id: 'evening',
        title: 'Вечірній пік',
        timeRange: '18:00 – 24:00',
        icon: 'nights_stay',
        accentClass: 'from-slate-900 to-purple-950/90 text-white border-purple-500/30',
        badgeClass: 'bg-purple-500/20 text-purple-200 border-purple-400/30',
        minH: 19,
        maxH: 24,
      },
    ];

    return defs.map((d) => {
      const slice = (hours || []).filter((h) => h.hour >= d.minH && h.hour <= d.maxH);
      let powerHours = 0;
      let outageHours = 0;
      for (const h of slice) {
        powerHours += (h.firstHalfPower ? 0.5 : 0) + (h.secondHalfPower ? 0.5 : 0);
        outageHours += (!h.firstHalfPower ? 0.5 : 0) + (!h.secondHalfPower ? 0.5 : 0);
      }
      return {
        id: d.id,
        title: d.title,
        timeRange: d.timeRange,
        icon: d.icon,
        accentClass: d.accentClass,
        badgeClass: d.badgeClass,
        powerHours: Math.round(powerHours * 10) / 10,
        outageHours: Math.round(outageHours * 10) / 10,
        containsCurrentHour: currentHourNumber >= d.minH && currentHourNumber <= d.maxH,
        hours: slice,
      };
    });
  }
}

