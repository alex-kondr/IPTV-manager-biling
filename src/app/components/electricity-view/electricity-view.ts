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
import { IptvData, DtekQueueSchedule, DtekHourSchedule } from '../../services/iptv-data';
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
  DeviceConsumptionEntryMode,
  OutageScheduleViewVariant,
  OUTAGE_SCHEDULE_VARIANTS,
  OutageScheduleVariantMeta,
  UtilityServiceTabId,
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
                    <span
                      class="px-1.5 py-0.5 rounded text-3xs font-bold uppercase"
                      [class.bg-white/20]="currentAccount()?.id === acc.id"
                      [class.text-white]="currentAccount()?.id === acc.id"
                      [class.bg-slate-200/80]="currentAccount()?.id !== acc.id"
                      [class.text-slate-700]="currentAccount()?.id !== acc.id"
                    >
                      {{ acc.electricityTariffType === 'dual' ? '2-зонний' : '1-зонний' }}
                    </span>
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
                      <span>Останнє оновлення: <strong>{{ dtekInfo()?.dtekJsonUpdatedAt || dtekInfo()?.updateFact || '—' }}</strong></span>
                    </span>
                    <span>•</span>
                    <span class="text-slate-500">Натисніть на плитку черги, щоб відкрити графік як випадаючий список</span>
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

                        <!-- Tomorrow 24-Hour Timeline inside Dropdown (if available) -->
                        @if (q.tomorrowSchedule; as tom) {
                          <div class="space-y-1.5 pt-2.5 border-t border-slate-200/80">
                            <div class="flex items-center gap-2 flex-wrap">
                              <span class="px-2 py-0.5 rounded bg-amber-500 text-white text-3xs font-bold uppercase">
                                Завтра ({{ tom.scheduleDate }})
                              </span>
                              <span class="text-3xs font-bold text-emerald-700">Світло: {{ tom.totalPowerHours }} год</span>
                              <span class="text-3xs font-bold text-rose-700">Відключення: {{ tom.totalOutageHours }} год</span>
                            </div>
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
            <div class="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <span>Графік погодинних відключень ДТЕК</span>
              <span class="text-slate-300">•</span>
              <span class="text-indigo-600 font-mono font-bold inline-flex items-center gap-1.5 bg-indigo-50 px-2.5 py-0.5 rounded-lg border border-indigo-200/80 shadow-2xs">
                <span class="relative flex h-2 w-2">
                  <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span>Київський час: {{ liveKyivTime() || dtekInfo()?.kyivTime || '—' }}</span>
              </span>
            </div>
          </div>

          <div class="flex items-center gap-2 shrink-0 self-start sm:self-auto flex-wrap">
            <button
              type="button"
              (click)="forceShowQueuesMode.set(true)"
              class="px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-900 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="Переглянути графік по всіх чергах ДТЕК (1.1 – 6.2)"
            >
              <mat-icon class="text-base text-indigo-600 leading-none">view_comfy_alt</mat-icon>
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
        <div class="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <h3 class="text-base font-bold text-slate-900">{{ acc.name }}</h3>
                <span class="px-2.5 py-0.5 rounded-full text-2xs font-bold"
                  [class.bg-emerald-100]="acc.electricityTariffType === 'dual'"
                  [class.text-emerald-800]="acc.electricityTariffType === 'dual'"
                  [class.bg-blue-100]="acc.electricityTariffType === 'single'"
                  [class.text-blue-800]="acc.electricityTariffType === 'single'"
                >
                  {{ acc.electricityTariffType === 'dual' ? 'Двотарифний (День / Ніч)' : 'Однотарифний (Єдиний)' }}
                </span>
                @if (acc.meterNumber) {
                  <span class="text-2xs text-slate-500 font-mono bg-slate-100 px-2 py-0.5 rounded">
                    Лічильник № {{ acc.meterNumber }}
                  </span>
                }
              </div>
              <p class="text-xs text-slate-500 mt-0.5">
                Особовий рахунок: <span class="font-semibold text-slate-700 font-mono">{{ acc.accountNumber }}</span>
                @if (acc.address) {
                  • <span class="text-slate-600">{{ acc.address }}</span>
                }
              </p>
            </div>

            @if (canEdit()) {
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  (click)="openAccountModal(acc)"
                  class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 border border-slate-200 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <mat-icon class="text-sm">edit</mat-icon>
                  <span>Редагувати</span>
                </button>
                <button
                  type="button"
                  (click)="confirmDeleteAccount(acc)"
                  class="px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <mat-icon class="text-sm">delete</mat-icon>
                  <span>Видалити</span>
                </button>
              </div>
            }
          </div>

          <!-- Stat Cards -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <!-- Latest Reading -->
            <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <span class="text-3xs font-semibold uppercase tracking-wider text-slate-500 block">Останні покази</span>
              @if (latestAnyReading(); as lr) {
                @if (acc.electricityTariffType === 'dual') {
                  <div class="text-sm font-extrabold text-slate-900 mt-1">
                    Т1: {{ lr.readingT1 }} <span class="text-2xs font-normal text-slate-500">кВт·г</span>
                  </div>
                  <div class="text-sm font-extrabold text-slate-900">
                    Т2: {{ lr.readingT2 }} <span class="text-2xs font-normal text-slate-500">кВт·г</span>
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
              @if (latestBillingReading(); as lbr) {
                <div class="text-base font-extrabold text-emerald-950 mt-1">
                  {{ lbr.totalCost.toFixed(2) }} <span class="text-xs font-normal text-emerald-700">грн</span>
                </div>
                <div class="mt-1 flex items-center justify-between">
                  @if (lbr.isPaid) {
                    <span class="inline-flex items-center gap-1 text-3xs font-bold text-emerald-700 bg-emerald-100/90 px-2 py-0.5 rounded">
                      <mat-icon class="text-xs leading-none">check_circle</mat-icon> Оплачено
                    </span>
                  } @else {
                    <span class="inline-flex items-center gap-1 text-3xs font-bold text-rose-700 bg-rose-100/90 px-2 py-0.5 rounded">
                      <mat-icon class="text-xs leading-none">pending</mat-icon> До сплати
                    </span>
                  }
                  <span class="text-3xs text-slate-500 font-mono">{{ formatDate(lbr.date) }}</span>
                </div>
              } @else {
                <div class="text-xs text-emerald-600 mt-1 italic">0.00 грн (немає оплат)</div>
              }
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
          <div class="pt-3 border-t border-slate-100 space-y-3">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-50/90 p-3.5 rounded-xl border border-slate-200/90">
              <div class="flex items-start sm:items-center gap-3">
                <div class="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                  <mat-icon class="text-lg">vpn_key</mat-icon>
                </div>
                <div>
                  <div class="flex items-center gap-2 flex-wrap">
                    <h4 class="text-xs sm:text-sm font-bold text-slate-900">
                      Особисті кабінети будинку: ДТЕК ОЕМ та ТОВ «ООЕК»
                    </h4>
                    <span class="px-2 py-0.5 rounded-full text-3xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 inline-flex items-center gap-1">
                      <mat-icon class="text-3xs leading-none">enhanced_encryption</mat-icon>
                      <span>AES-256-GCM шифрування</span>
                    </span>
                    @if (acc.ooekBalanceUah !== undefined && acc.ooekBalanceUah !== null) {
                      <span class="px-2.5 py-0.5 rounded-full text-2xs font-extrabold bg-amber-100 text-amber-900 border border-amber-300">
                        ООЕК до сплати: {{ acc.ooekBalanceUah.toFixed(2) }} грн
                      </span>
                    }
                  </div>
                  <p class="text-2xs text-slate-500 mt-0.5">
                    Безпечне збереження облікових даних для <span class="font-mono text-slate-700">auth.my.dtek-oem.com.ua</span> (показники) та <span class="font-mono text-slate-700">personal.ooek.od.ua</span> (нарахована сума до сплати)
                  </p>
                </div>
              </div>

              <div class="flex items-center gap-2 shrink-0 flex-wrap">
                <button
                  type="button"
                  (click)="syncOoekForCurrentAccount()"
                  [disabled]="isSyncingOoek()"
                  class="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-2xs"
                  title="Підключитися до personal.ooek.od.ua/home/abonbook/cards та оновити нараховану суму, історію оплат і споживання по особовому рахунку"
                >
                  <mat-icon class="text-sm leading-none" [class.animate-spin]="isSyncingOoek()">receipt_long</mat-icon>
                  <span>{{ isSyncingOoek() ? 'Запит ООЕК...' : 'Оновити з ООЕК' }}</span>
                </button>

                <button
                  type="button"
                  (click)="toggleCabinetPanel()"
                  class="px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors flex items-center gap-1.5 cursor-pointer"
                  [class.bg-slate-900]="isCabinetPanelOpen()"
                  [class.text-white]="isCabinetPanelOpen()"
                  [class.border-slate-900]="isCabinetPanelOpen()"
                  [class.bg-white]="!isCabinetPanelOpen()"
                  [class.text-slate-700]="!isCabinetPanelOpen()"
                  [class.border-slate-300]="!isCabinetPanelOpen()"
                >
                  <mat-icon class="text-sm leading-none">{{ isCabinetPanelOpen() ? 'expand_less' : 'settings_suggest' }}</mat-icon>
                  <span>{{ isCabinetPanelOpen() ? 'Згорнути кабінети' : 'Логіни та синхронізація' }}</span>
                </button>
              </div>
            </div>

            <!-- Collapsible OOEK Payment & Electricity Consumption History (from https://personal.ooek.od.ua/home/abonbook/cards by Personal Account) -->
            <div class="rounded-xl border border-emerald-200/90 bg-emerald-50/40 overflow-hidden transition-all">
              <div
                class="px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-emerald-50/80 transition-colors"
              >
                <div class="flex items-center gap-2.5 flex-wrap">
                  <div class="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                    <mat-icon class="text-sm leading-none">history_edu</mat-icon>
                  </div>
                  <div>
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="text-xs font-bold text-slate-900">
                        Абонкнижка ООЕК: історія оплат та спожитої електроенергії
                      </span>
                      <span class="px-2 py-0.5 rounded-md bg-white border border-emerald-300 text-emerald-900 text-3xs font-mono font-bold">
                        О/р: {{ acc.ooekAccountNumber || acc.accountNumber }}
                      </span>
                      <span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-3xs font-bold">
                        {{ (acc.ooekHistory || []).length }} зап.
                      </span>
                    </div>
                    <p class="text-3xs text-slate-500">
                      Дані зі сторінки <span class="font-mono text-slate-700">personal.ooek.od.ua/home/abonbook/cards</span> для обраної домівки по особовому рахунку
                    </p>
                  </div>
                </div>

                <div class="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  @if ((acc.ooekHistory || []).length > 0) {
                    @let latestH = (acc.ooekHistory || [])[0];
                    <div class="hidden md:flex items-center gap-2 text-2xs font-mono">
                      @if (latestH.consumedKwh !== undefined && latestH.consumedKwh !== null) {
                        <span class="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold">
                          {{ latestH.consumedKwh }} кВт·год
                        </span>
                      }
                      @if (latestH.paidUah !== undefined && latestH.paidUah !== null) {
                        <span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-bold">
                          Оплата: {{ latestH.paidUah.toFixed(2) }} грн
                        </span>
                      }
                    </div>
                  }
                  <button
                    type="button"
                    (click)="toggleOoekHistoryExpanded()"
                    class="px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-100/70 text-emerald-900 border border-emerald-300 text-2xs font-bold inline-flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <span>{{ isOoekHistoryExpanded() ? 'Згорнути список' : 'Розгорнути список' }}</span>
                    <mat-icon class="text-sm leading-none transition-transform duration-200" [class.rotate-180]="isOoekHistoryExpanded()">
                      expand_more
                    </mat-icon>
                  </button>
                </div>
              </div>

              @if (isOoekHistoryExpanded()) {
                <div class="border-t border-emerald-200/80 bg-white p-3.5 space-y-3">
                  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div class="flex items-center gap-2 flex-wrap text-2xs text-slate-600">
                      <span>Особовий рахунок для вибірки з <code class="font-mono text-emerald-800">abonbook/cards</code>:</span>
                      <span class="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {{ acc.ooekAccountNumber || acc.accountNumber }}
                      </span>
                      @if (acc.ooekCabinetLastSync) {
                        <span class="text-3xs text-slate-400">• Синхр.: {{ formatDate(acc.ooekCabinetLastSync) }}</span>
                      }
                    </div>
                    <div class="flex items-center gap-2">
                      <a
                        href="https://personal.ooek.od.ua/home/abonbook/cards"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-2xs font-semibold inline-flex items-center gap-1"
                      >
                        <span>Відкрити abonbook/cards</span>
                        <mat-icon class="text-3xs leading-none">open_in_new</mat-icon>
                      </a>
                      <button
                        type="button"
                        (click)="syncOoekForCurrentAccount()"
                        [disabled]="isSyncingOoek()"
                        class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-2xs font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <mat-icon class="text-xs leading-none" [class.animate-spin]="isSyncingOoek()">sync</mat-icon>
                        <span>{{ isSyncingOoek() ? 'Оновлення...' : 'Завантажити з сайту' }}</span>
                      </button>
                    </div>
                  </div>

                  @if ((acc.ooekHistory || []).length > 0) {
                    <div class="overflow-x-auto rounded-xl border border-slate-200">
                      <table class="w-full text-left border-collapse">
                        <thead>
                          <tr class="bg-slate-50 text-slate-500 text-3xs font-extrabold uppercase tracking-wider border-b border-slate-200">
                            <th class="py-2 px-3">Період / Дата</th>
                            <th class="py-2 px-3 text-right">Спожито (кВт·год)</th>
                            <th class="py-2 px-3 text-right">Нараховано (грн)</th>
                            <th class="py-2 px-3 text-right">Оплачено (грн)</th>
                            <th class="py-2 px-3 text-right">Сальдо / Борг (грн)</th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100 text-xs">
                          @for (item of (acc.ooekHistory || []); track item.id) {
                            <tr class="hover:bg-slate-50/90 transition-colors">
                              <td class="py-2 px-3 font-semibold text-slate-900 whitespace-nowrap">
                                <div>{{ item.period }}</div>
                                @if (item.date && item.date !== item.period) {
                                  <div class="text-3xs text-slate-400 font-mono">{{ item.date }}</div>
                                }
                              </td>
                              <td class="py-2 px-3 text-right font-mono">
                                @if (item.consumedKwh !== undefined && item.consumedKwh !== null) {
                                  <span class="px-2 py-0.5 rounded bg-amber-50 text-amber-900 font-bold border border-amber-200/80">
                                    {{ item.consumedKwh }} кВт·г
                                  </span>
                                } @else {
                                  <span class="text-slate-300">—</span>
                                }
                              </td>
                              <td class="py-2 px-3 text-right font-mono font-semibold text-slate-700">
                                @if (item.accruedUah !== undefined && item.accruedUah !== null) {
                                  {{ item.accruedUah.toFixed(2) }} грн
                                } @else {
                                  <span class="text-slate-300">—</span>
                                }
                              </td>
                              <td class="py-2 px-3 text-right font-mono font-bold text-emerald-700">
                                @if (item.paidUah !== undefined && item.paidUah !== null) {
                                  +{{ item.paidUah.toFixed(2) }} грн
                                } @else {
                                  <span class="text-slate-300">—</span>
                                }
                              </td>
                              <td class="py-2 px-3 text-right font-mono font-semibold">
                                @if (item.balanceUah !== undefined && item.balanceUah !== null) {
                                  <span [class.text-rose-700]="item.balanceUah > 0" [class.text-emerald-700]="item.balanceUah <= 0">
                                    {{ item.balanceUah.toFixed(2) }} грн
                                  </span>
                                } @else {
                                  <span class="text-slate-300">—</span>
                                }
                              </td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                  } @else {
                    <div class="p-4 rounded-xl bg-slate-50 border border-slate-200/80 text-center space-y-2">
                      <p class="text-xs font-semibold text-slate-700">
                        Історія оплат та споживання з абонкнижки ООЕК для особового рахунку <span class="font-mono font-bold">{{ acc.ooekAccountNumber || acc.accountNumber }}</span> ще не завантажена.
                      </p>
                      <p class="text-2xs text-slate-500">
                        Збережіть логін/пароль ООЕК та натисніть «Завантажити з сайту», щоб отримати інформацію з <span class="font-mono">personal.ooek.od.ua/home/abonbook/cards</span>.
                      </p>
                    </div>
                  }
                </div>
              }
            </div>

            @if (isCabinetPanelOpen()) {
              <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 rounded-2xl bg-slate-50/70 border border-slate-200">
                <!-- Left Card: OOEK Personal Cabinet (https://personal.ooek.od.ua/home/) -->
                <div class="p-4 rounded-xl bg-white border border-slate-200/90 shadow-2xs space-y-3 flex flex-col justify-between">
                  <div class="space-y-3">
                    <div class="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100">
                      <div>
                        <div class="flex items-center gap-2 flex-wrap">
                          <span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-3xs font-bold uppercase">
                            Пряма інтеграція працює
                          </span>
                          <h5 class="text-xs sm:text-sm font-bold text-slate-900">
                            Кабінет ТОВ «ООЕК» (Сума + Абонкнижка)
                          </h5>
                        </div>
                        <div class="flex items-center gap-3 flex-wrap mt-0.5">
                          <a
                            href="https://personal.ooek.od.ua/home/"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="text-2xs text-indigo-600 hover:underline font-mono inline-flex items-center gap-1"
                          >
                            <span>personal.ooek.od.ua/home</span>
                            <mat-icon class="text-3xs">open_in_new</mat-icon>
                          </a>
                          <a
                            href="https://personal.ooek.od.ua/home/abonbook/cards"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="text-2xs text-emerald-700 hover:underline font-mono inline-flex items-center gap-1"
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

                    <!-- Accrued Amount Display Box -->
                    <div class="p-3 rounded-xl bg-emerald-50/80 border border-emerald-200 flex items-center justify-between">
                      <div>
                        <span class="text-3xs font-bold uppercase tracking-wider text-emerald-800 block">
                          Нарахована сума до сплати (ООЕК)
                        </span>
                        @if (acc.ooekCabinetLastSync) {
                          <span class="text-3xs text-emerald-700">
                            Оновлено: {{ formatDate(acc.ooekCabinetLastSync) }}
                          </span>
                        } @else {
                          <span class="text-3xs text-slate-500">Ще не синхронізовано</span>
                        }
                      </div>
                      <div class="text-right">
                        @if (acc.ooekBalanceUah !== undefined && acc.ooekBalanceUah !== null) {
                          <span class="text-lg font-extrabold font-mono text-emerald-950">
                            {{ acc.ooekBalanceUah.toFixed(2) }} грн
                          </span>
                        } @else {
                          <span class="text-xs font-semibold text-slate-400 italic">— грн</span>
                        }
                      </div>
                    </div>

                    @if (acc.ooekCabinetStatus) {
                      <div class="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-2xs text-slate-700 flex items-start gap-1.5">
                        <mat-icon class="text-sm text-indigo-600 shrink-0 mt-0.5">info</mat-icon>
                        <span>{{ acc.ooekCabinetStatus }}</span>
                      </div>
                    }

                    <!-- OOEK Credentials & Personal Account Number Inputs -->
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label for="cabinet-ooek-acc-input" class="block text-3xs font-bold text-slate-600 uppercase mb-1">
                          Особовий рахунок ООЕК (домівка)
                        </label>
                        <input
                          id="cabinet-ooek-acc-input"
                          type="text"
                          [value]="cabinetOoekAccountNumber()"
                          (input)="cabinetOoekAccountNumber.set($any($event.target).value)"
                          [placeholder]="acc.accountNumber || '572000...'"
                          autocomplete="off"
                          class="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-xs text-slate-900 font-mono focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label for="cabinet-ooek-login-input" class="block text-3xs font-bold text-slate-600 uppercase mb-1">
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
                        <label for="cabinet-ooek-password-input" class="block text-3xs font-bold text-slate-600 uppercase mb-1">
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

                    @if ((acc.ooekDiscoveredAccounts || []).length > 1) {
                      <div class="p-2 rounded-lg bg-emerald-50/70 border border-emerald-200/80 flex items-center gap-1.5 flex-wrap">
                        <span class="text-3xs font-bold text-emerald-900">Знайдені рахунки в кабінеті:</span>
                        @for (discAcc of (acc.ooekDiscoveredAccounts || []); track discAcc) {
                          <button
                            type="button"
                            (click)="cabinetOoekAccountNumber.set(discAcc)"
                            [class.bg-emerald-600]="cabinetOoekAccountNumber() === discAcc"
                            [class.text-white]="cabinetOoekAccountNumber() === discAcc"
                            [class.bg-white]="cabinetOoekAccountNumber() !== discAcc"
                            [class.text-emerald-900]="cabinetOoekAccountNumber() !== discAcc"
                            class="px-2 py-0.5 rounded text-3xs font-mono font-bold border border-emerald-300 cursor-pointer transition-colors"
                          >
                            {{ discAcc }}
                          </button>
                        }
                      </div>
                    }
                  </div>

                  <div class="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                    <button
                      type="button"
                      (click)="saveCabinetCredentialsForCurrentAccount()"
                      [disabled]="isSavingCabinet()"
                      class="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
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
                      <span>{{ isSyncingOoek() ? 'Підключення...' : 'Отримати суму та історію' }}</span>
                    </button>
                  </div>
                </div>

                <!-- Right Card: DTEK OEM Personal Cabinet (https://auth.my.dtek-oem.com.ua/login) -->
                <div class="p-4 rounded-xl bg-white border border-slate-200/90 shadow-2xs space-y-3 flex flex-col justify-between">
                  <div class="space-y-3">
                    <div class="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100">
                      <div>
                        <div class="flex items-center gap-2 flex-wrap">
                          <span class="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-3xs font-bold uppercase">
                            OAuth API + захист Imperva WAF
                          </span>
                          <h5 class="text-xs sm:text-sm font-bold text-slate-900">
                            Кабінет ДТЕК ОЕМ (Показники)
                          </h5>
                        </div>
                        <a
                          href="https://auth.my.dtek-oem.com.ua/login"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="text-2xs text-indigo-600 hover:underline font-mono inline-flex items-center gap-1 mt-0.5"
                        >
                          <span>https://auth.my.dtek-oem.com.ua/login</span>
                          <mat-icon class="text-3xs">open_in_new</mat-icon>
                        </a>
                      </div>

                      @if (acc.hasDtekPassword) {
                        <span class="px-2 py-0.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-3xs font-bold flex items-center gap-1 shrink-0">
                          <mat-icon class="text-xs leading-none">lock</mat-icon>
                          <span>Пароль зашифровано</span>
                        </span>
                      }
                    </div>

                    <!-- Technical Security & WAF Explanation Box -->
                    <div class="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200 text-2xs text-amber-950 space-y-1">
                      <div class="font-bold flex items-center gap-1">
                        <mat-icon class="text-xs text-amber-700 leading-none">security</mat-icon>
                        <span>Як захищені паролі та особливість сайту ДТЕК:</span>
                      </div>
                      <p class="text-3xs text-amber-900 leading-relaxed">
                        Паролі шифруються на сервері алгоритмом <strong>AES-256-GCM</strong> (ключ <span class="font-mono">CABINET_ENCRYPTION_KEY</span> у <span class="font-mono">.env</span>) і ніколи не повертаються у браузер у відкритому вигляді. Сайт <span class="font-mono">auth.my.dtek-oem.com.ua</span> використовує захист <strong>Imperva Incapsula WAF</strong> проти серверних запитів: сервер пробує прямий вхід через <span class="font-mono">/api/oauth/api/auth/login</span>, а якщо WAF вимагає браузерну перевірку — фіксує покази в базі та відкриває кабінет для підтвердження.
                      </p>
                    </div>

                    @if (acc.dtekCabinetStatus) {
                      <div class="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-2xs text-slate-700 flex items-start gap-1.5">
                        <mat-icon class="text-sm text-amber-600 shrink-0 mt-0.5">info</mat-icon>
                        <span>{{ acc.dtekCabinetStatus }}</span>
                      </div>
                    }

                    <!-- DTEK Credentials Inputs -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label for="cabinet-dtek-login-input" class="block text-3xs font-bold text-slate-600 uppercase mb-1">
                          Логін ДТЕК (+380XXXXXXXXX або Email)
                        </label>
                        <input
                          id="cabinet-dtek-login-input"
                          type="text"
                          [value]="cabinetDtekLogin()"
                          (input)="cabinetDtekLogin.set($any($event.target).value)"
                          placeholder="+380671234567"
                          autocomplete="off"
                          class="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-xs text-slate-900 font-mono focus:outline-none focus:border-amber-500"
                        />
                      </div>
                      <div>
                        <label for="cabinet-dtek-password-input" class="block text-3xs font-bold text-slate-600 uppercase mb-1">
                          Пароль ДТЕК {{ acc.hasDtekPassword ? '(збережено)' : '' }}
                        </label>
                        <input
                          id="cabinet-dtek-password-input"
                          type="password"
                          [value]="cabinetDtekPassword()"
                          (input)="cabinetDtekPassword.set($any($event.target).value)"
                          [placeholder]="acc.hasDtekPassword ? '•••••••• (залиште порожнім без змін)' : 'Введіть пароль кабінету ДТЕК'"
                          autocomplete="new-password"
                          class="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div class="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                    <button
                      type="button"
                      (click)="syncDtekCabinetForCurrentAccount()"
                      [disabled]="isSyncingDtekCabinet()"
                      class="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-2xs"
                    >
                      <mat-icon class="text-sm leading-none" [class.animate-spin]="isSyncingDtekCabinet()">sync</mat-icon>
                      <span>{{ isSyncingDtekCabinet() ? 'Перевірка...' : 'Перевірити вхід ДТЕК' }}</span>
                    </button>

                    @if (latestAnyReading(); as lr) {
                      <button
                        type="button"
                        (click)="submitLatestReadingToDtek(lr)"
                        [disabled]="isSyncingDtekCabinet()"
                        class="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-2xs"
                        title="Передати останні внесені покази в кабінет ДТЕК"
                      >
                        <mat-icon class="text-sm leading-none">send</mat-icon>
                        <span>Передати покази ({{ lr.readingT1 }}{{ acc.electricityTariffType === 'dual' ? '/' + lr.readingT2 : '' }})</span>
                      </button>
                    }
                  </div>
                </div>
              </div>
            }
          </div>
        </div>

        <!-- Mode Switcher: History Table vs Devices vs Trend Analytics -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white p-2.5 rounded-2xl border border-slate-200/90 shadow-2xs">
          <div class="flex items-center overflow-x-auto rounded-xl bg-slate-100 p-1 text-2xs sm:text-xs font-semibold gap-1 scrollbar-thin">
            <button
              type="button"
              (click)="activeTab.set('table')"
              [class.bg-white]="activeTab() === 'table'"
              [class.text-slate-900]="activeTab() === 'table'"
              [class.shadow-2xs]="activeTab() === 'table'"
              [class.text-slate-600]="activeTab() !== 'table'"
              class="px-2.5 sm:px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <mat-icon class="text-sm sm:text-base text-amber-500">table_chart</mat-icon>
              <span>Журнал ({{ accountReadings().length }})</span>
            </button>
            <button
              type="button"
              (click)="activeTab.set('devices')"
              [class.bg-white]="activeTab() === 'devices'"
              [class.text-slate-900]="activeTab() === 'devices'"
              [class.shadow-2xs]="activeTab() === 'devices'"
              [class.text-slate-600]="activeTab() !== 'devices'"
              class="px-2.5 sm:px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <mat-icon class="text-sm sm:text-base text-emerald-600">electrical_services</mat-icon>
              <span>Пристрої ({{ accountDevices().length }})</span>
            </button>
            <button
              type="button"
              (click)="activeTab.set('analytics')"
              [class.bg-white]="activeTab() === 'analytics'"
              [class.text-slate-900]="activeTab() === 'analytics'"
              [class.shadow-2xs]="activeTab() === 'analytics'"
              [class.text-slate-600]="activeTab() !== 'analytics'"
              class="px-2.5 sm:px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <mat-icon class="text-sm sm:text-base text-indigo-600">query_stats</mat-icon>
              <span>Графіки</span>
            </button>
          </div>

          @if (activeTab() === 'table') {
            <div class="flex items-center justify-between sm:justify-end gap-2 flex-wrap">
              <!-- Quick AI Screenshot & Devices shortcut -->
              @if (canEdit()) {
                <button
                  type="button"
                  (click)="openScreenshotModal()"
                  class="px-2.5 py-1 rounded-lg text-2xs font-bold bg-emerald-50 border border-emerald-300 text-emerald-800 hover:bg-emerald-100 flex items-center gap-1 cursor-pointer transition-colors"
                  title="Завантажити скріншот споживання пристрою з коментарем для AI-аналізу"
                >
                  <mat-icon class="text-xs leading-none text-emerald-600">add_photo_alternate</mat-icon>
                  <span>Скріншот пристрою (ШІ)</span>
                </button>
              }
              <!-- Filter Pills -->
              <div class="flex items-center gap-1.5 overflow-x-auto text-2xs">
                <span class="text-slate-400 text-3xs uppercase font-semibold">Показати:</span>
                <button
                  type="button"
                  (click)="filterPurpose.set('all')"
                  [class.bg-slate-900]="filterPurpose() === 'all'"
                  [class.text-white]="filterPurpose() === 'all'"
                  [class.bg-slate-100]="filterPurpose() !== 'all'"
                  [class.text-slate-600]="filterPurpose() !== 'all'"
                  class="px-2.5 py-1 rounded-lg font-semibold cursor-pointer transition-colors"
                >
                  Всі ({{ accountReadings().length }})
                </button>
                <button
                  type="button"
                  (click)="filterPurpose.set('billing')"
                  [class.bg-amber-600]="filterPurpose() === 'billing'"
                  [class.text-white]="filterPurpose() === 'billing'"
                  [class.bg-amber-50]="filterPurpose() !== 'billing'"
                  [class.text-amber-800]="filterPurpose() !== 'billing'"
                  class="px-2.5 py-1 rounded-lg font-semibold cursor-pointer transition-colors"
                >
                  ⚡ Офіційні ({{ billingReadingsCount() }})
                </button>
                <button
                  type="button"
                  (click)="filterPurpose.set('control')"
                  [class.bg-indigo-600]="filterPurpose() === 'control'"
                  [class.text-white]="filterPurpose() === 'control'"
                  [class.bg-indigo-50]="filterPurpose() !== 'control'"
                  [class.text-indigo-800]="filterPurpose() !== 'control'"
                  class="px-2.5 py-1 rounded-lg font-semibold cursor-pointer transition-colors"
                >
                  👁️ Контрольні ({{ controlReadingsCount() }})
                </button>
              </div>
            </div>
          } @else if (activeTab() === 'devices') {
            <div class="flex items-center gap-2 flex-wrap">
              <div class="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-xl border border-slate-200">
                <mat-icon class="text-xs text-slate-500 leading-none">calendar_month</mat-icon>
                <span class="text-3xs font-bold uppercase text-slate-500">Місяць:</span>
                <input
                  type="month"
                  [value]="deviceSelectedMonth()"
                  (change)="onDeviceMonthChange($any($event.target).value)"
                  class="bg-transparent text-xs font-bold text-slate-900 focus:outline-none cursor-pointer"
                />
              </div>
              @if (canEdit()) {
                <button
                  type="button"
                  (click)="openScreenshotModal()"
                  class="px-3 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <mat-icon class="text-sm leading-none">add_photo_alternate</mat-icon>
                  <span>Завантажити скріншот + коментар</span>
                </button>
                <button
                  type="button"
                  (click)="openAddDeviceLogModal()"
                  class="px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-50 border border-amber-300 text-amber-900 hover:bg-amber-100 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <mat-icon class="text-sm text-amber-600 leading-none">playlist_add</mat-icon>
                  <span>+ Споживання на дату</span>
                </button>
                <button
                  type="button"
                  (click)="openDeviceModal()"
                  class="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <mat-icon class="text-sm leading-none">add</mat-icon>
                  <span>Додати пристрій</span>
                </button>
              }
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
            <div class="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-5">
              <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div class="flex items-start gap-3">
                  <div class="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 flex items-center justify-center shrink-0">
                    <mat-icon class="text-2xl">electrical_services</mat-icon>
                  </div>
                  <div>
                    <div class="flex items-center gap-2 flex-wrap">
                      <h3 class="text-base sm:text-lg font-bold text-slate-900">
                        Моніторинг електроприладів та AI-аналіз за {{ dSummary.monthLabel }}
                      </h3>
                      <span class="px-2 py-0.5 rounded-md text-3xs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
                        Станом на {{ formatDate(dSummary.referenceDate) }} (день {{ dSummary.daysElapsed }} з {{ dSummary.daysInMonth }})
                      </span>
                    </div>
                    <p class="text-xs text-slate-500 mt-0.5">
                      Додавайте спожиту електроенергію по окремих приладах на обрану дату або завантажуйте скріншоти з розумних розеток (Tuya, Tapo, EcoFlow) з вашим коментарем
                    </p>
                  </div>
                </div>

                <!-- Reference Total House kWh Override / Indicator -->
                <div class="flex items-center gap-2 bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200 shrink-0">
                  <div>
                    <div class="text-3xs font-bold uppercase tracking-wider text-slate-500">
                      Загальне споживання дому ({{ dSummary.houseSourceLabel }})
                    </div>
                    <div class="flex items-center gap-2 mt-0.5">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        [value]="customMonthHouseKwh() !== null ? customMonthHouseKwh() : dSummary.houseReferenceKwh"
                        (change)="onCustomMonthHouseKwhChange($any($event.target).value)"
                        title="Ви можете уточнити загальне споживання будинку на цю дату для точного порівняння з пристроями"
                        class="w-24 px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-emerald-500"
                      />
                      <span class="text-xs font-bold text-slate-700">кВт·год</span>
                      @if (customMonthHouseKwh() !== null) {
                        <button
                          type="button"
                          (click)="customMonthHouseKwh.set(null)"
                          class="text-3xs text-slate-500 hover:text-rose-600 underline cursor-pointer"
                          title="Скинути до автоматичного розрахунку за лічильником"
                        >
                          Авто
                        </button>
                      }
                    </div>
                  </div>
                </div>
              </div>

              <!-- 4 KPI Cards: House Total vs Devices Total vs Untracked vs Month Forecast -->
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <!-- Card 1: Total House Consumption -->
                <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 flex flex-col justify-between">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-3xs font-bold uppercase tracking-wider text-slate-500">
                      Загалом по будинку
                    </span>
                    <mat-icon class="text-amber-500 text-lg leading-none">home_iot_device</mat-icon>
                  </div>
                  <div class="mt-2">
                    <div class="text-xl font-black font-mono text-slate-900">
                      {{ dSummary.houseReferenceKwh.toFixed(1) }}
                      <span class="text-xs font-semibold text-slate-500">кВт·год</span>
                    </div>
                    <div class="text-xs font-bold text-amber-700 mt-0.5">
                      ≈ {{ dSummary.houseReferenceCostUah.toFixed(2) }} грн
                    </div>
                  </div>
                  <div class="mt-2 pt-2 border-t border-slate-200/70 flex items-center justify-between text-3xs text-slate-500">
                    <span>Темп: ~{{ dSummary.houseDailyPace.toFixed(2) }} кВт·г/добу</span>
                    <span class="font-semibold text-slate-700">{{ dSummary.houseSourceLabel }}</span>
                  </div>
                </div>

                <!-- Card 2: Consumed by Tracked Devices -->
                <div class="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200 flex flex-col justify-between">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-3xs font-bold uppercase tracking-wider text-emerald-800">
                      Окремі пристрої ({{ accountDevices().length }})
                    </span>
                    <mat-icon class="text-emerald-600 text-lg leading-none">power</mat-icon>
                  </div>
                  <div class="mt-2">
                    <div class="flex items-baseline gap-2">
                      <span class="text-xl font-black font-mono text-emerald-950">
                        {{ dSummary.totalDevicesKwh.toFixed(2) }}
                      </span>
                      <span class="text-xs font-semibold text-emerald-700">кВт·год</span>
                      <span class="ml-auto px-2 py-0.5 rounded-full text-2xs font-extrabold bg-emerald-200/80 text-emerald-900">
                        {{ dSummary.devicesSharePercent.toFixed(1) }}%
                      </span>
                    </div>
                    <div class="text-xs font-bold text-emerald-800 mt-0.5">
                      ≈ {{ dSummary.totalDevicesCostUah.toFixed(2) }} грн
                    </div>
                  </div>
                  <div class="mt-2 pt-2 border-t border-emerald-200/70 flex items-center justify-between text-3xs text-emerald-800">
                    <span>Темп приладів: {{ dSummary.devicesDailyPace.toFixed(2) }} кВт·г/добу</span>
                    <span>Записів: {{ dSummary.totalLogsInMonth }}</span>
                  </div>
                </div>

                <!-- Card 3: Untracked / Other Household Consumption -->
                <div class="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-200/80 flex flex-col justify-between">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-3xs font-bold uppercase tracking-wider text-indigo-800">
                      Інші прилади (поза моніторингом)
                    </span>
                    <mat-icon class="text-indigo-600 text-lg leading-none">lightbulb</mat-icon>
                  </div>
                  <div class="mt-2">
                    <div class="flex items-baseline gap-2">
                      <span class="text-xl font-black font-mono text-indigo-950">
                        {{ dSummary.untrackedKwh.toFixed(2) }}
                      </span>
                      <span class="text-xs font-semibold text-indigo-700">кВт·год</span>
                      <span class="ml-auto px-2 py-0.5 rounded-full text-2xs font-extrabold bg-indigo-200/70 text-indigo-900">
                        {{ dSummary.untrackedSharePercent.toFixed(1) }}%
                      </span>
                    </div>
                    <div class="text-xs font-bold text-indigo-800 mt-0.5">
                      ≈ {{ dSummary.untrackedCostUah.toFixed(2) }} грн
                    </div>
                  </div>
                  <div class="mt-2 pt-2 border-t border-indigo-200/60 text-3xs text-indigo-700">
                    Освітлення, роутер, зарядки, дрібна побутова техніка
                  </div>
                </div>

                <!-- Card 4: End-of-Month Forecast -->
                <div class="p-4 rounded-2xl bg-gradient-to-br from-amber-50 via-orange-50/50 to-white border border-amber-300/80 flex flex-col justify-between">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-3xs font-bold uppercase tracking-wider text-amber-900">
                      Прогноз на кінець місяця ({{ dSummary.daysInMonth }} дн.)
                    </span>
                    <mat-icon class="text-amber-600 text-lg leading-none">trending_up</mat-icon>
                  </div>
                  <div class="mt-2">
                    <div class="text-xl font-black font-mono text-slate-900">
                      {{ dSummary.projectedHouseMonthKwh.toFixed(0) }}
                      <span class="text-xs font-semibold text-slate-600">кВт·год</span>
                    </div>
                    <div class="text-xs font-bold text-amber-800 mt-0.5">
                      Очікуваний рахунок: ~{{ dSummary.projectedHouseMonthCostUah.toFixed(0) }} грн
                    </div>
                  </div>
                  <div class="mt-2 pt-2 border-t border-amber-200/80 flex items-center justify-between text-3xs text-amber-900">
                    <span>Пристрої: ~{{ dSummary.projectedDevicesMonthKwh.toFixed(0) }} кВт·г</span>
                    <span class="font-bold">({{ dSummary.projectedDevicesMonthCostUah.toFixed(0) }} грн)</span>
                  </div>
                </div>
              </div>


            </div>

            <!-- ======================================================== -->
            <!-- INDIVIDUAL DEVICE CARDS & DATE CONSUMPTION LOGS          -->
            <!-- ======================================================== -->
            @if (dSummary.deviceRows.length > 0) {
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                @for (item of dSummary.deviceRows; track item.device.id) {
                  <div class="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs flex flex-col justify-between gap-4 hover:border-slate-300 transition-all">
                    <!-- Device Header -->
                    <div class="flex items-start justify-between gap-3">
                      <div class="flex items-center gap-3">
                        <div
                          class="w-11 h-11 rounded-xl flex items-center justify-center text-white shadow-2xs shrink-0"
                          [style.background-color]="item.device.color || '#10b981'"
                        >
                          <mat-icon class="text-xl">{{ item.device.icon || 'bolt' }}</mat-icon>
                        </div>
                        <div>
                          <div class="flex items-center gap-2 flex-wrap">
                            <h4 class="text-sm sm:text-base font-bold text-slate-900">{{ item.device.name }}</h4>
                            @if (item.device.powerWatts) {
                              <span class="px-2 py-0.5 rounded-md text-3xs font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                {{ item.device.powerWatts }} Вт
                              </span>
                            }
                            @if (item.device.batteryCapacityKwh) {
                              <span class="px-2 py-0.5 rounded-md text-3xs font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-0.5">
                                <mat-icon class="text-3xs leading-none">battery_charging_full</mat-icon>
                                <span>{{ item.device.batteryCapacityKwh }} кВт·год</span>
                              </span>
                            }
                            @if (item.device.category === 'heating_ac') {
                              <span class="px-2 py-0.5 rounded-md text-3xs font-bold bg-orange-50 text-orange-700 border border-orange-200 flex items-center gap-0.5">
                                <mat-icon class="text-3xs leading-none">mode_heat</mat-icon>
                                <span>Обігрів</span>
                              </span>
                            }
                            @if (item.device.isNightFriendly) {
                              <span
                                class="px-2 py-0.5 rounded-md text-3xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-0.5"
                                title="Прилад підходить для роботи у нічний тариф (23:00–07:00)"
                              >
                                <mat-icon class="text-3xs leading-none">dark_mode</mat-icon>
                                <span>Нічний тариф</span>
                              </span>
                            }
                          </div>
                          <div class="text-3xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                            @if (item.latestLogDate) {
                              <span>Останній запис: <b>{{ formatDate(item.latestLogDate) }}</b></span>
                            } @else {
                              <span>Немає записів за {{ dSummary.monthLabel }}</span>
                            }
                            @if (item.device.notes) {
                              <span>• {{ item.device.notes }}</span>
                            }
                          </div>
                        </div>
                      </div>

                      @if (canEdit()) {
                        <div class="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            (click)="openEditDeviceModal(item.device)"
                            class="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                            title="Редагувати пристрій"
                          >
                            <mat-icon class="text-base leading-none">edit</mat-icon>
                          </button>
                          <button
                            type="button"
                            (click)="deleteDevice(item.device.id)"
                            class="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Видалити пристрій"
                          >
                            <mat-icon class="text-base leading-none">delete</mat-icon>
                          </button>
                        </div>
                      }
                    </div>

                    <!-- Metrics & Progress Bar -->
                    <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2.5">
                      <div class="grid grid-cols-3 gap-2">
                        <div>
                          <div class="text-3xs font-semibold uppercase text-slate-400">Спожито за місяць</div>
                          <div class="text-base sm:text-lg font-black font-mono text-slate-900">
                            {{ item.monthKwh.toFixed(2) }}
                            <span class="text-3xs font-normal text-slate-500">кВт·г</span>
                          </div>
                          <div class="text-2xs font-bold text-emerald-700">
                            {{ item.monthCostUah.toFixed(2) }} грн
                          </div>
                        </div>
                        <div>
                          <div class="text-3xs font-semibold uppercase text-slate-400">Середньодобово</div>
                          <div class="text-sm sm:text-base font-bold font-mono text-slate-800">
                            {{ item.dailyPaceKwh.toFixed(2) }}
                            <span class="text-3xs font-normal text-slate-500">кВт·г/д</span>
                          </div>
                          @if (item.estimatedHoursPerDay !== null) {
                            <div class="text-3xs text-slate-500">
                              ~{{ item.estimatedHoursPerDay.toFixed(1) }} год/добу роботи
                            </div>
                          }
                        </div>
                        <div>
                          <div class="text-3xs font-semibold uppercase text-slate-400">Прогноз на місяць</div>
                          <div class="text-sm sm:text-base font-bold font-mono text-amber-800">
                            {{ item.projectedMonthKwh.toFixed(1) }}
                            <span class="text-3xs font-normal text-amber-700">кВт·г</span>
                          </div>
                          <div class="text-2xs font-semibold text-amber-700">
                            ~{{ item.projectedMonthCostUah.toFixed(0) }} грн
                          </div>
                        </div>
                      </div>

                      <!-- Share Progress Bar -->
                      <div class="space-y-1">
                        <div class="flex items-center justify-between text-3xs font-semibold">
                          <span class="text-slate-600">Частка від загального споживання будинку</span>
                          <span class="font-mono font-bold text-slate-900">{{ item.shareOfHousePercent.toFixed(1) }}%</span>
                        </div>
                        <div class="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                          <div
                            class="h-full rounded-full transition-all duration-500"
                            [style.width.%]="Math.min(100, item.shareOfHousePercent)"
                            [style.background-color]="item.device.color || '#10b981'"
                          ></div>
                        </div>
                      </div>
                    </div>

                    <!-- Action Buttons & Collapsible History -->
                    <div class="flex items-center justify-between gap-2 flex-wrap pt-1">
                      @if (canEdit()) {
                        <div class="flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            (click)="openAddDeviceLogModal(item.device.id)"
                            class="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                          >
                            <mat-icon class="text-sm leading-none">add</mat-icon>
                            <span>Внести кВт·г (доба / час / дата)</span>
                          </button>
                          <button
                            type="button"
                            (click)="openScreenshotModal(item.device.id)"
                            class="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 border border-emerald-300 text-emerald-900 hover:bg-emerald-100 transition-colors flex items-center gap-1 cursor-pointer"
                            title="Завантажити скріншот та коментар для цього пристрою"
                          >
                            <mat-icon class="text-sm text-emerald-600 leading-none">add_photo_alternate</mat-icon>
                            <span>Скріншот + коментар</span>
                          </button>
                        </div>
                      }

                      <button
                        type="button"
                        (click)="toggleDeviceLogsExpand(item.device.id)"
                        class="px-2.5 py-1.5 rounded-xl text-2xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1 cursor-pointer transition-colors ml-auto"
                      >
                        <mat-icon class="text-sm leading-none">
                          {{ isDeviceLogsExpanded(item.device.id) ? 'expand_less' : 'history' }}
                        </mat-icon>
                        <span>Записи за місяць ({{ item.monthLogs.length }})</span>
                      </button>
                    </div>

                    <!-- Expanded Logs for this Device in Selected Month -->
                    @if (isDeviceLogsExpanded(item.device.id)) {
                      <div class="border-t border-slate-200 pt-3 space-y-2">
                        @if (item.monthLogs.length > 0) {
                          <div class="max-h-60 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl bg-slate-50/60">
                            @for (log of item.monthLogs; track log.id) {
                              <div class="p-2.5 flex items-start justify-between gap-2 text-xs">
                                <div class="space-y-0.5">
                                  <div class="flex items-center gap-1.5 flex-wrap">
                                    <span class="font-bold text-slate-900">{{ getDeviceLogDateLabel(log) }}</span>
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
                                      <span class="px-1.5 py-0.2 rounded bg-slate-200/80 text-slate-800 text-3xs font-mono font-semibold flex items-center gap-0.5">
                                        <mat-icon class="text-3xs leading-none">schedule</mat-icon>
                                        <span>{{ getDeviceLogTimeIntervalBadge(log) }}</span>
                                      </span>
                                    }
                                    @if (log.fromScreenshot) {
                                      <span class="px-1.5 py-0.2 rounded bg-teal-100 text-teal-800 text-3xs font-bold flex items-center gap-0.5">
                                        <mat-icon class="text-3xs leading-none">auto_awesome</mat-icon>
                                        <span>AI Скріншот</span>
                                      </span>
                                    }
                                  </div>
                                  @if (log.comment) {
                                    <div class="text-2xs text-slate-700">
                                      <span class="font-semibold text-slate-500">Коментар:</span> {{ log.comment }}
                                    </div>
                                  }
                                  @if (log.aiExplanation) {
                                    <div class="text-3xs text-teal-800 bg-teal-50/80 px-2 py-1 rounded border border-teal-200/70 mt-1">
                                      <span class="font-bold">AI:</span> {{ log.aiExplanation }}
                                    </div>
                                  }
                                </div>
                                <div class="flex items-center gap-2 shrink-0">
                                  <span class="font-mono font-bold text-slate-900 text-sm">
                                    {{ log.entryMode && log.entryMode !== 'cumulative_month' ? '+' : '' }}{{ log.consumedKwh }} кВт·г
                                  </span>
                                  @if (canEdit()) {
                                    <button
                                      type="button"
                                      (click)="deleteDeviceLog(item.device.id, log.id)"
                                      class="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                      title="Видалити запис"
                                    >
                                      <mat-icon class="text-sm leading-none">delete_outline</mat-icon>
                                    </button>
                                  }
                                </div>
                              </div>
                            }
                          </div>
                        } @else {
                          <div class="text-center py-3 text-2xs text-slate-400">
                            За {{ dSummary.monthLabel }} ще немає записів споживання для цього пристрою.
                          </div>
                        }
                      </div>
                    }
                  </div>
                }
              </div>
            } @else {
              <!-- Empty State when no devices added yet -->
              <div class="p-8 text-center rounded-2xl bg-white border border-dashed border-slate-300 space-y-3">
                <div class="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                  <mat-icon class="text-3xl">electrical_services</mat-icon>
                </div>
                <div>
                  <h4 class="text-sm font-bold text-slate-800">Ще не додано жодного електроприладу</h4>
                  <p class="text-xs text-slate-500 max-w-lg mx-auto mt-1">
                    Додайте бойлер, кондиціонер, пральну машину, обігрівач або розумну розетку, щоб фіксувати спожиту електроенергію на конкретну дату або розпізнавати її зі скріншотів за допомогою ШІ.
                  </p>
                </div>
                @if (canEdit()) {
                  <div class="flex items-center justify-center gap-2.5 flex-wrap pt-2">
                    <button
                      type="button"
                      (click)="openDeviceModal()"
                      class="px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white flex items-center gap-1.5 cursor-pointer"
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

            <!-- ======================================================== -->
            <!-- CHARTS, BREAKDOWN & FORECAST ANALYTICS                   -->
            <!-- ======================================================== -->
            @if (dSummary.deviceRows.length > 0) {
              <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
                <!-- Left 7 cols: Visual Structure & SVG Forecast Chart -->
                <div class="lg:col-span-7 p-5 sm:p-6 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-5">
                  <div class="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div>
                      <h4 class="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                        <mat-icon class="text-emerald-600">pie_chart</mat-icon>
                        <span>Структура споживання та прогноз на кінець місяця</span>
                      </h4>
                      <p class="text-2xs text-slate-500">
                        Порівняння фактичного споживання окремих пристроїв із загальним споживанням будинку
                      </p>
                    </div>
                  </div>

                  <!-- Multi-segment Stacked Bar (All Devices + Untracked) -->
                  <div class="space-y-2">
                    <div class="flex items-center justify-between text-2xs font-semibold text-slate-600">
                      <span>Розподіл спожитих {{ dSummary.houseReferenceKwh.toFixed(1) }} кВт·год за {{ dSummary.monthLabel }}</span>
                      <span>100% ({{ dSummary.houseReferenceCostUah.toFixed(0) }} грн)</span>
                    </div>
                    <div class="w-full h-5 rounded-xl bg-slate-100 overflow-hidden flex border border-slate-200 p-0.5 gap-0.5">
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
                          class="h-full bg-slate-300 last:rounded-r-lg transition-all duration-500"
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
                          <span class="font-semibold text-slate-700">{{ item.device.name }}</span>
                          <span class="font-mono text-slate-500">({{ item.shareOfHousePercent.toFixed(1) }}%)</span>
                        </div>
                      }
                      <div class="flex items-center gap-1.5 text-2xs">
                        <span class="w-2.5 h-2.5 rounded-xs bg-slate-300 shrink-0"></span>
                        <span class="font-semibold text-slate-600">Інші прилади (фонове)</span>
                        <span class="font-mono text-slate-500">({{ dSummary.untrackedSharePercent.toFixed(1) }}%)</span>
                      </div>
                    </div>
                  </div>

                  <!-- SVG Grouped Bar Chart: Fact vs End-of-Month Forecast per Device -->
                  <div class="pt-2 space-y-2">
                    <div class="flex items-center justify-between text-xs font-bold text-slate-800">
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

                    <div class="w-full overflow-x-auto bg-slate-50/70 rounded-xl border border-slate-200/80 p-3">
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
                            class="fill-slate-800 text-[11px] font-bold"
                          >
                            {{ item.device.name.length > 18 ? item.device.name.slice(0, 18) + '…' : item.device.name }}
                          </text>
                          <text
                            x="4"
                            [attr.y]="yPos + 29"
                            class="fill-slate-400 text-[9px] font-mono"
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
                            class="fill-slate-800 text-[10px] font-mono font-bold"
                          >
                            {{ item.monthKwh.toFixed(1) }} → {{ item.projectedMonthKwh.toFixed(1) }} кВт·г ({{ item.projectedMonthCostUah.toFixed(0) }} грн)
                          </text>
                        }

                        <!-- Untracked row -->
                        @let unY = dSummary.deviceRows.length * 44 + 12;
                        @let unFactW = dSummary.maxChartKwh > 0 ? Math.max(4, (dSummary.untrackedKwh / dSummary.maxChartKwh) * 340) : 4;
                        @let unProjW = dSummary.maxChartKwh > 0 ? Math.max(4, (dSummary.projectedUntrackedMonthKwh / dSummary.maxChartKwh) * 340) : 4;
                        <text x="4" [attr.y]="unY + 15" class="fill-slate-600 text-[11px] font-semibold">
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
                          class="fill-slate-600 text-[10px] font-mono font-semibold"
                        >
                          {{ dSummary.untrackedKwh.toFixed(1) }} → {{ dSummary.projectedUntrackedMonthKwh.toFixed(1) }} кВт·г
                        </text>
                      </svg>
                    </div>
                  </div>

                  <!-- Daily Timeline Progression across logged dates in the month -->
                  @if (dSummary.dateProgressionPoints.length > 0) {
                    <div class="pt-2 space-y-2 border-t border-slate-100">
                      <div class="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <mat-icon class="text-sm text-indigo-600 leading-none">timeline</mat-icon>
                        <span>Динаміка внесеного споживання пристроїв по датах місяця</span>
                      </div>
                      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        @for (pt of dSummary.dateProgressionPoints; track pt.date) {
                          <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                            <div class="text-3xs font-semibold text-slate-500">{{ formatDate(pt.date) }}</div>
                            <div class="text-sm font-black font-mono text-slate-900 mt-0.5">
                              {{ pt.cumulativeDevicesKwh.toFixed(2) }} <span class="text-3xs font-normal">кВт·г</span>
                            </div>
                            <div class="text-3xs text-emerald-700 font-medium truncate" [title]="pt.devicesSummary">
                              {{ pt.devicesSummary }}
                            </div>
                          </div>
                        }
                      </div>
                    </div>
                  }
                </div>

                <!-- Right 5 cols: Smart Analysis, Insights & Forecast Recommendations -->
                <div class="lg:col-span-5 p-5 sm:p-6 rounded-2xl bg-white border border-slate-200/90 shadow-2xs flex flex-col justify-between space-y-4">
                  <div class="space-y-4">
                    <div class="border-b border-slate-100 pb-3">
                      <h4 class="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                        <mat-icon class="text-amber-500">lightbulb</mat-icon>
                        <span>Аналіз споживання та прогнози</span>
                      </h4>
                      <p class="text-2xs text-slate-500">
                        Автоматичні висновки на основі показів лічильника та окремих електроприладів
                      </p>
                    </div>

                    <div class="space-y-3">
                      @for (insight of dSummary.insights; track insight.title) {
                        <div
                          class="p-3.5 rounded-xl border space-y-1"
                          [class.bg-amber-50/70]="insight.tone === 'amber'"
                          [class.border-amber-200]="insight.tone === 'amber'"
                          [class.bg-emerald-50/70]="insight.tone === 'emerald'"
                          [class.border-emerald-200]="insight.tone === 'emerald'"
                          [class.bg-indigo-50/70]="insight.tone === 'indigo'"
                          [class.border-indigo-200]="insight.tone === 'indigo'"
                          [class.bg-rose-50/70]="insight.tone === 'rose'"
                          [class.border-rose-200]="insight.tone === 'rose'"
                        >
                          <div class="flex items-center justify-between gap-2">
                            <div class="flex items-center gap-1.5 text-xs font-bold text-slate-900">
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
                              <span class="px-2 py-0.5 rounded-full text-3xs font-mono font-bold bg-white/90 text-slate-800 border border-slate-200">
                                {{ insight.badge }}
                              </span>
                            }
                          </div>
                          <p class="text-2xs text-slate-700 leading-relaxed">
                            {{ insight.description }}
                          </p>
                        </div>
                      }
                    </div>
                  </div>

                  <!-- Quick CTA to upload screenshot -->
                  @if (canEdit()) {
                    <div class="p-3.5 rounded-xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-transparent border border-emerald-500/20 flex items-center justify-between gap-3">
                      <div class="text-2xs text-slate-700">
                        <span class="font-bold text-slate-900 block">Маєте скріншот з додатка розумної розетки?</span>
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
          <div class="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 class="text-base font-bold text-slate-900 flex items-center gap-2">
                  <mat-icon class="text-indigo-600">query_stats</mat-icon>
                  <span>Аналітика споживання та тенденцій</span>
                </h3>
                <p class="text-xs text-slate-500">
                  Аналіз темпу кВт·г/добу, контроль лімітів та перевірка ефективності 2-зонного тарифу
                </p>
              </div>
              <div class="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  (click)="activeTab.set('devices')"
                  class="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <mat-icon class="text-sm text-emerald-600">electrical_services</mat-icon>
                  <span>Пристрої та AI-прогнози ({{ accountDevices().length }})</span>
                </button>
                @if (canEdit()) {
                  <button
                    type="button"
                    (click)="openReadingModal(true)"
                    class="px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <mat-icon class="text-sm text-indigo-600">visibility</mat-icon>
                    <span>+ Контрольний замір</span>
                  </button>
                }
              </div>
            </div>

            <app-electricity-chart
              [timeline]="electricityTimelineData()"
              [monthly]="electricityMonthlyData()"
              [stats]="electricityStatsKPIs()"
            />
          </div>
        } @else {
          <!-- Readings History Section -->
          <div class="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div>
                <h3 class="text-sm sm:text-base font-bold text-slate-900">Історія передачі показів та розрахунків</h3>
                <p class="text-3xs sm:text-xs text-slate-500">Усі зафіксовані покази по поточному особовому рахунку</p>
              </div>
              @if (canEdit()) {
                <div class="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-thin">
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
                    class="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-2xs sm:text-xs font-semibold bg-indigo-50 border border-indigo-300 text-indigo-900 hover:bg-indigo-100 transition-colors flex items-center gap-1 sm:gap-1.5 shadow-2xs cursor-pointer shrink-0"
                    title="Внести контрольний замір"
                  >
                    <mat-icon class="text-sm sm:text-base text-indigo-600 leading-none">visibility</mat-icon>
                    <span>Контрольний замір</span>
                  </button>
                  <button
                    type="button"
                    (click)="openCameraModal()"
                    class="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-2xs sm:text-xs font-semibold bg-amber-50 border border-amber-300 text-amber-900 hover:bg-amber-100 transition-colors flex items-center gap-1 sm:gap-1.5 shadow-2xs cursor-pointer shrink-0"
                    title="Сфотографувати лічильник та розпізнати покази"
                  >
                    <mat-icon class="text-sm sm:text-base text-amber-600 leading-none">photo_camera</mat-icon>
                    <span>Зробити фото</span>
                  </button>
                </div>
              }
            </div>

            <!-- History Table -->
            @if (filteredAccountReadings().length > 0) {
              <div class="overflow-x-auto rounded-xl border border-slate-200">
                <table class="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr class="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-3xs tracking-wider">
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
                  <tbody class="divide-y divide-slate-100 text-slate-800">
                    @for (r of filteredAccountReadings(); track r.id) {
                      <tr class="hover:bg-slate-50/80 transition-colors">
                        <!-- Date -->
                        <td class="py-3 px-3.5 whitespace-nowrap">
                          <div class="flex items-center gap-1.5">
                            <div class="font-bold text-slate-900">{{ formatDate(r.date) }}</div>
                            @if (r.isControlOnly) {
                              <span class="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800 text-3xs font-bold border border-indigo-200">
                                <mat-icon class="text-3xs leading-none">visibility</mat-icon> Контрольний
                              </span>
                            }
                          </div>
                          <div class="text-3xs text-slate-400 font-mono">{{ r.periodMonth || r.date.substring(0, 7) }}</div>
                        </td>

                        <!-- Meter Readings -->
                        <td class="py-3 px-3.5 whitespace-nowrap">
                          @if (acc.electricityTariffType === 'dual') {
                            <div class="font-mono text-xs">
                              <span class="text-amber-600 font-bold">День (Т1):</span> {{ r.readingT1 }}
                            </div>
                            <div class="font-mono text-xs">
                              <span class="text-indigo-600 font-bold">Ніч (Т2):</span> {{ r.readingT2 }}
                            </div>
                          } @else {
                            <div class="font-mono text-xs font-bold text-slate-900">
                              {{ r.readingT1 }} кВт·г
                            </div>
                          }
                        </td>

                        <!-- Consumption -->
                        <td class="py-3 px-3.5 whitespace-nowrap">
                          <div class="font-bold text-slate-900 text-sm">
                            {{ totalConsumedKwh(r) }} <span class="text-2xs font-normal text-slate-500">кВт·г</span>
                          </div>
                          @if (acc.electricityTariffType === 'dual') {
                            <div class="text-3xs text-slate-500">
                              Т1: {{ r.consumptionT1 || 0 }} • Т2: {{ r.consumptionT2 || 0 }}
                            </div>
                          }
                          @if (r.dailyAvgConsumption && r.dailyAvgConsumption > 0) {
                            <div class="text-3xs text-emerald-600 font-medium">
                              ~{{ r.dailyAvgConsumption }} кВт·г/добу
                            </div>
                          }
                        </td>

                        <!-- Rates -->
                        <td class="py-3 px-3.5 whitespace-nowrap">
                          @if (r.isControlOnly) {
                            <span class="text-2xs text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded font-medium border border-indigo-200/60 inline-flex items-center gap-1">
                              <mat-icon class="text-3xs">query_stats</mat-icon> Тільки контроль
                            </span>
                          } @else if (acc.electricityTariffType === 'dual') {
                            <div class="text-2xs text-slate-600">
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
                                  class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-3xs font-bold bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200 transition-colors"
                                  title="Перевищено зимовий ліміт 2000 кВт·г. Натисніть для перегляду пропорційного розрахунку"
                                >
                                  <span>❄️ >2000 кВт·г</span>
                                  <mat-icon class="text-xs leading-none">info</mat-icon>
                                </button>
                              }
                            </div>
                          } @else {
                            <span class="text-xs font-semibold text-slate-700">
                              {{ r.rateT1 || currentSingleRate() }} грн
                            </span>
                          }
                        </td>

                        <!-- Total Cost -->
                        <td class="py-3 px-3.5 whitespace-nowrap">
                          @if (r.isControlOnly) {
                            <span class="font-semibold text-slate-400 text-sm">
                              0.00 грн
                            </span>
                            <div class="text-3xs text-indigo-600 font-medium">Без оплати</div>
                          } @else {
                            <span class="font-bold text-slate-900 text-sm">
                              {{ r.totalCost.toFixed(2) }} грн
                            </span>
                          }
                          @if (cleanReadingNote(r.note)) {
                            <div class="text-3xs text-slate-400 max-w-xs truncate" [title]="cleanReadingNote(r.note)">{{ cleanReadingNote(r.note) }}</div>
                          }
                        </td>

                        <!-- Status & Pay Toggle -->
                        <td class="py-3 px-3.5 whitespace-nowrap">
                          @if (r.isControlOnly) {
                            <span class="px-2.5 py-1 rounded-full text-2xs font-semibold bg-slate-100 text-slate-600 inline-flex items-center gap-1 border border-slate-200">
                              <mat-icon class="text-xs leading-none">visibility</mat-icon>
                              <span>Моніторинг</span>
                            </span>
                          } @else if (canEdit()) {
                            <button
                              type="button"
                              (click)="togglePaidStatus(r)"
                              class="px-2.5 py-1 rounded-full text-2xs font-bold inline-flex items-center gap-1 cursor-pointer transition-colors"
                              [class.bg-emerald-100]="r.isPaid"
                              [class.text-emerald-800]="r.isPaid"
                              [class.hover:bg-emerald-200]="r.isPaid"
                              [class.bg-rose-100]="!r.isPaid"
                              [class.text-rose-800]="!r.isPaid"
                              [class.hover:bg-rose-200]="!r.isPaid"
                            >
                              <mat-icon class="text-xs leading-none">{{ r.isPaid ? 'check_circle' : 'pending' }}</mat-icon>
                              <span>{{ r.isPaid ? 'Сплачено' : 'До сплати' }}</span>
                            </button>
                          } @else {
                            <span
                              class="px-2.5 py-1 rounded-full text-2xs font-bold inline-flex items-center gap-1"
                              [class.bg-emerald-100]="r.isPaid"
                              [class.text-emerald-800]="r.isPaid"
                              [class.bg-rose-100]="!r.isPaid"
                              [class.text-rose-800]="!r.isPaid"
                            >
                              <mat-icon class="text-xs leading-none">{{ r.isPaid ? 'check_circle' : 'pending' }}</mat-icon>
                              <span>{{ r.isPaid ? 'Сплачено' : 'До сплати' }}</span>
                            </span>
                          }
                        </td>

                        <!-- Actions -->
                        @if (canEdit()) {
                          <td class="py-3 px-3.5 whitespace-nowrap text-right">
                            <button
                              type="button"
                              (click)="openEditReadingModal(r)"
                              class="p-1 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer mr-1"
                              title="Редагувати запис"
                            >
                              <mat-icon class="text-base leading-none">edit</mat-icon>
                            </button>
                            <button
                              type="button"
                              (click)="deleteReading(r.id)"
                              class="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
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
              <div class="py-10 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300">
                <mat-icon class="text-3xl text-slate-400 mb-1">history</mat-icon>
                <div class="text-xs font-semibold text-slate-600">Записів за обраним фільтром не знайдено</div>
                <p class="text-3xs text-slate-400 mt-0.5">Внесіть перші дані лічильника вручну або сфотографуйте табло.</p>
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
                      class="px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-50 border border-amber-300 text-amber-900 hover:bg-amber-100 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <mat-icon class="text-base text-amber-600 leading-none">photo_camera</mat-icon>
                      <span>Зробити фото</span>
                    </button>
                  </div>
                }
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
                      placeholder="напр. с-ще Окни або м. Одеса"
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
                      placeholder="11 або 24/А"
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
                    placeholder="с-ще Окни, вул. Шкільна, буд. 11"
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
                      {{ accountForm.get('electricityTariffType')?.value === 'dual' ? 'Початковий День (Т1)' : 'Початковий показник' }}
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
                        Початковий Ніч (Т2)
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
        <div class="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[calc(100dvh-2rem)] animate-in fade-in zoom-in-95 duration-150 my-auto">
          <!-- Pinned Header -->
          <div class="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 bg-slate-50 shrink-0">
            <div class="flex items-center gap-2.5">
              <div
                class="w-9 h-9 rounded-xl text-white flex items-center justify-center shrink-0"
                [class.bg-amber-500]="!readingForm.get('isControlOnly')?.value"
                [class.bg-indigo-600]="readingForm.get('isControlOnly')?.value"
              >
                <mat-icon>{{ readingForm.get('isControlOnly')?.value ? 'visibility' : 'speed' }}</mat-icon>
              </div>
              <div>
                <h3 class="text-base font-bold text-slate-900">
                  @if (editingReadingId()) {
                    {{ readingForm.get('isControlOnly')?.value ? 'Редагувати контрольний замір' : 'Редагувати показник лічильника' }}
                  } @else {
                    {{ readingForm.get('isControlOnly')?.value ? 'Контрольний замір електроенергії' : 'Внесення показів електроенергії' }}
                  }
                </h3>
                <p class="text-2xs text-slate-500">{{ currentAccount()?.name }} • Особовий № {{ currentAccount()?.accountNumber }}</p>
              </div>
            </div>
            <button
              type="button"
              (click)="closeReadingModal()"
              class="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center cursor-pointer transition-colors"
            >
              <mat-icon class="text-lg">close</mat-icon>
            </button>
          </div>

          <!-- Form with scrollable body and pinned footer -->
          <form [formGroup]="readingForm" (ngSubmit)="saveReading()" class="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div class="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 overscroll-contain">
              <!-- Purpose Switcher: Billing vs Control Only -->
              <div class="space-y-1.5">
                <span class="block text-xs font-semibold text-slate-700">Призначення показу *</span>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label
                    class="p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all"
                    [class.border-amber-500]="!readingForm.get('isControlOnly')?.value"
                    [class.bg-amber-50/70]="!readingForm.get('isControlOnly')?.value"
                    [class.border-slate-200]="readingForm.get('isControlOnly')?.value"
                  >
                    <input
                      type="radio"
                      [value]="false"
                      formControlName="isControlOnly"
                      (change)="recalculateFormCost()"
                      class="mt-0.5 text-amber-500 focus:ring-amber-500"
                    />
                    <div>
                      <div class="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <span>⚡ Розрахунковий</span>
                        <span class="text-3xs text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded font-bold">Для оплати</span>
                      </div>
                      <div class="text-3xs text-slate-500 mt-0.5">Офіційний білінг та нарахування до сплати</div>
                    </div>
                  </label>

                  <label
                    class="p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all"
                    [class.border-indigo-500]="readingForm.get('isControlOnly')?.value"
                    [class.bg-indigo-50/70]="readingForm.get('isControlOnly')?.value"
                    [class.border-slate-200]="!readingForm.get('isControlOnly')?.value"
                  >
                    <input
                      type="radio"
                      [value]="true"
                      formControlName="isControlOnly"
                      (change)="recalculateFormCost()"
                      class="mt-0.5 text-indigo-600 focus:ring-indigo-600"
                    />
                    <div>
                      <div class="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <span>👁️ Контрольний</span>
                        <span class="text-3xs text-indigo-800 bg-indigo-100 px-1.5 py-0.2 rounded font-bold">Без оплати</span>
                      </div>
                      <div class="text-3xs text-slate-500 mt-0.5">Для аналізу тенденцій та середньодобового темпу</div>
                    </div>
                  </label>
                </div>
              </div>

              <!-- Informational Banner for Control Readings -->
              @if (readingForm.get('isControlOnly')?.value) {
                <div class="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs flex items-start gap-2">
                  <mat-icon class="text-indigo-600 shrink-0 text-base">info</mat-icon>
                  <div class="text-2xs leading-relaxed">
                    <strong>Контрольний показник:</strong> використовується виключно для графіків, відстеження тенденцій та розрахунку середньодобового темпу споживання. <strong>Плата не нараховується (0.00 грн)</strong>, а наступний розрахунковий показник автоматично охопить весь обсяг з моменту останньої оплати.
                  </div>
                </div>
              }

              <!-- Reading Date -->
              <div>
                <label for="read-date" class="block text-xs font-semibold text-slate-700 mb-1">
                  Дата зняття показів *
                </label>
                <input
                  id="read-date"
                  type="date"
                  formControlName="date"
                  (change)="recalculateFormCost()"
                  class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-amber-500"
                />
              </div>

              <!-- Current Account Tariff Details & Previous Readings -->
              <div
                class="p-3 border rounded-xl space-y-1 text-xs"
                [class.bg-amber-50/70]="!readingForm.get('isControlOnly')?.value"
                [class.border-amber-200/80]="!readingForm.get('isControlOnly')?.value"
                [class.bg-indigo-50/70]="readingForm.get('isControlOnly')?.value"
                [class.border-indigo-200/80]="readingForm.get('isControlOnly')?.value"
              >
                <div class="flex items-center justify-between text-3xs uppercase tracking-wider font-bold">
                  <span [class.text-amber-900]="!readingForm.get('isControlOnly')?.value" [class.text-indigo-900]="readingForm.get('isControlOnly')?.value">
                    {{ readingForm.get('isControlOnly')?.value ? 'Попередні покази для розрахунку темпу:' : 'Попередній розрахунковий показник:' }}
                  </span>
                  @if (!readingForm.get('isControlOnly')?.value) {
                    <span class="text-purple-700 font-semibold">{{ calculatedSeason() === 'summer' ? 'Літній сезон (01.05 – 30.09)' : 'Зимовий сезон (01.10 – 30.04)' }}</span>
                  }
                </div>
                <div class="text-xs font-mono font-medium" [class.text-amber-950]="!readingForm.get('isControlOnly')?.value" [class.text-indigo-950]="readingForm.get('isControlOnly')?.value">
                  @if (currentAccount()?.electricityTariffType === 'dual') {
                    День (Т1): <span class="font-bold">{{ activePrevT1() }}</span> кВт·г • Ніч (Т2): <span class="font-bold">{{ activePrevT2() }}</span> кВт·г
                  } @else {
                    Попередній: <span class="font-bold">{{ activePrevT1() }}</span> кВт·г
                  }
                </div>
              </div>

              <!-- Current Reading Section Header with Camera Action -->
              <div class="flex items-center justify-between pb-0.5">
                <span class="text-xs font-bold text-slate-800">Поточні покази лічильника:</span>
                <button
                  type="button"
                  (click)="openCameraModal()"
                  class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 transition-colors cursor-pointer shadow-2xs"
                  title="Сфотографувати лічильник для автоматичного заповнення"
                >
                  <mat-icon class="text-sm text-amber-600 leading-none">photo_camera</mat-icon>
                  <span>Зробити фото</span>
                </button>
              </div>

              <!-- Meter Reading Inputs -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label for="read-t1" class="block text-xs font-semibold text-slate-700 mb-1">
                    {{ currentAccount()?.electricityTariffType === 'dual' ? 'Показник День (Т1) *' : 'Показник лічильника *' }}
                  </label>
                  <input
                    id="read-t1"
                    type="number"
                    step="0.1"
                    min="0"
                    formControlName="readingT1"
                    (input)="recalculateFormCost()"
                    placeholder="Введіть число"
                    class="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-mono font-extrabold text-slate-900 focus:outline-none focus:border-amber-500"
                  />
                </div>

                @if (currentAccount()?.electricityTariffType === 'dual') {
                  <div>
                    <label for="read-t2" class="block text-xs font-semibold text-slate-700 mb-1">
                      Показник Ніч (Т2) *
                    </label>
                    <input
                      id="read-t2"
                      type="number"
                      step="0.1"
                      min="0"
                      formControlName="readingT2"
                      (input)="recalculateFormCost()"
                      placeholder="Введіть число"
                      class="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-mono font-extrabold text-slate-900 focus:outline-none focus:border-amber-500"
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
                      Розподіл день/ніч пропорційно споживанню: <span class="font-bold text-white">Т1 (День) {{ calc.ratioDay }}%</span>, <span class="font-bold text-white">Т2 (Ніч) {{ calc.ratioNight }}%</span>
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
                <label for="read-note" class="block text-xs font-semibold text-slate-700 mb-1">
                  Примітка (необов'язково)
                </label>
                <input
                  id="read-note"
                  type="text"
                  formControlName="note"
                  placeholder="Наприклад: Контрольна перевірка, або Оплачено через Приват24"
                  class="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <!-- Pinned Footer -->
            <div class="flex items-center justify-end gap-2.5 p-4 border-t border-slate-200 bg-slate-50/90 shrink-0">
              <button
                type="button"
                (click)="closeReadingModal()"
                class="px-4 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
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
                    Зимовий тариф діє на перші <span class="font-bold">{{ bDown.winterLimitKwh }} кВт·г</span>, а все що понад норму (<span class="font-bold">{{ bDown.excessKwh }} кВт·г</span>) розраховано за літнім тарифом. День/ніч розподілено строго пропорційно (Т1: {{ bDown.ratioDay }}%, Т2: {{ bDown.ratioNight }}%).
                  </div>
                </div>
              </div>
            }

            <!-- Consumption Summary -->
            <div class="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <div>
                <span class="text-3xs text-slate-500 block">Т1 (Денне споживання):</span>
                <span class="font-bold text-slate-900 font-mono">{{ bDown.diff1 }} кВт·г</span>
              </div>
              <div>
                <span class="text-3xs text-slate-500 block">Т2 (Нічне споживання):</span>
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
                    <div class="text-3xs text-slate-500">Враховувати прилад у розрахунку потенційної економії за нічним тарифом Т2</div>
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
                <mat-icon>playlist_add</mat-icon>
              </div>
              <div>
                <h3 class="text-base font-bold text-slate-900">Внести споживання приладу</h3>
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
                        За потужністю приладу ({{ selectedLogDevice()?.powerWatts }} Вт × {{ calculatedLogDurationHours() }} год):
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
                      🌙 Нічний тариф T2 (23:00–07:00)
                    </span>
                  } @else if (deviceLogForm.get('tariffSelection')?.value === 'day_only') {
                    <span class="text-3xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                      ☀️ Денний тариф T1 (07:00–23:00)
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
                Додати споживання
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
  // ELECTRICITY DEVICES & AI SCREENSHOT STATE
  // ========================================================
  readonly deviceSelectedMonth = signal<string>(new Date().toISOString().slice(0, 7));
  readonly customMonthHouseKwh = signal<number | null>(null);
  readonly expandedDeviceIds = signal<Record<string, boolean>>({});
  readonly isSavingDevices = signal<boolean>(false);

  readonly isDeviceModalOpen = signal<boolean>(false);
  readonly editingDeviceId = signal<string | null>(null);

  readonly isDeviceLogModalOpen = signal<boolean>(false);
  readonly deviceLogFormTrigger = signal<number>(0);
  readonly evChargeStartPct = signal<number>(20);
  readonly evChargeEndPct = signal<number>(80);
  private readonly seededRequiredDevicesAccountIds = new Set<string>();

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

  readonly readingForm = new FormGroup({
    date: new FormControl(new Date().toISOString().split('T')[0], [Validators.required]),
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
        }
      });
    });

    // Automatically ensure requested devices (AC Heating Mode & Volkswagen E-Golf 2014 24 kWh) exist on the current account
    effect(() => {
      if (typeof window === 'undefined') return;
      const acc = this.currentAccount();
      const editable = this.canEdit();
      if (!acc || !editable) return;
      if (this.seededRequiredDevicesAccountIds.has(acc.id)) return;

      const existingDevices = Array.isArray(acc.devices) ? acc.devices : [];
      const hasAcHeating = existingDevices.some(
        (d) =>
          d.category === 'heating_ac' ||
          (d.name.toLowerCase().includes('кондиціонер') && d.name.toLowerCase().includes('обігрів'))
      );
      const hasVwEgolf = existingDevices.some(
        (d) =>
          d.category === 'ev' ||
          d.name.toLowerCase().includes('e-golf') ||
          d.name.toLowerCase().includes('volkswagen')
      );

      this.seededRequiredDevicesAccountIds.add(acc.id);

      if (!hasAcHeating || !hasVwEgolf) {
        const additions: ElectricityDevice[] = [];
        const nowIso = new Date().toISOString();
        if (!hasAcHeating) {
          additions.push({
            id: `dev_ac_heat_${Date.now()}`,
            name: 'Кондиціонер (режим обігріву)',
            category: 'heating_ac',
            icon: 'mode_heat',
            color: '#ea580c',
            powerWatts: 1350,
            isNightFriendly: true,
            notes: 'Обігрів кондиціонером / тепловим насосом',
            logs: [],
            createdAt: nowIso,
          });
        }
        if (!hasVwEgolf) {
          additions.push({
            id: `dev_vw_egolf_${Date.now() + 1}`,
            name: 'Volkswagen E-Golf 2014 (24 кВт·год)',
            category: 'ev',
            icon: 'electric_car',
            color: '#2563eb',
            powerWatts: 3600,
            batteryCapacityKwh: 24,
            isNightFriendly: true,
            notes: 'Електромобіль VW e-Golf 2014, батарея 24 кВт·год',
            logs: [],
            createdAt: nowIso,
          });
        }
        untracked(() => {
          void this.dataService.saveUtilityAccountDevices(acc.id, [...existingDevices, ...additions], undefined, true);
        });
      }
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
        ooekAccountNumber: this.cabinetOoekAccountNumber().trim() || acc.ooekAccountNumber || acc.accountNumber,
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
        ooekAccountNumber: this.cabinetOoekAccountNumber().trim() || acc.ooekAccountNumber || acc.accountNumber,
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
      return `Т1 (День): ${diff1.toFixed(1)} кВт·г • Т2 (Ніч): ${diff2.toFixed(1)} кВт·г (Всього: ${(diff1 + diff2).toFixed(1)})`;
    }

    return `${diff1.toFixed(1)} кВт·г`;
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
        city: 'с-ще Окни',
        street: 'вул. Шкільна',
        houseNum: '11',
        dtekQueueGroup: '',
        address: 'с-ще Окни, вул. Шкільна, буд. 11',
        meterNumber: '',
        electricityTariffType: 'single',
        initialReadingT1: 0,
        initialReadingT2: 0,
        notes: '',
      });
      this.formCityQuery.set('с-ще Окни');
      this.formStreetQuery.set('вул. Шкільна');
      this.dataService.fetchDtekCatalog('с-ще Окни');
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
      date: new Date().toISOString().split('T')[0],
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
      date: new Date().toISOString().split('T')[0],
      readingT1: applied.readingT1 !== undefined ? applied.readingT1 : null,
      readingT2: applied.readingT2 !== undefined ? applied.readingT2 : null,
      isControlOnly: false,
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
    const nextStatus = !r.isPaid;
    await this.dataService.markUtilityReadingPaid(r.id, nextStatus, r.totalCost);
  }

  // ========================================================
  // ELECTRICITY DEVICES & AI SCREENSHOT METHODS & ANALYTICS
  // ========================================================

  readonly accountDevices = computed<ElectricityDevice[]>(() => {
    const acc = this.currentAccount();
    if (!acc || !Array.isArray(acc.devices)) return [];
    return acc.devices;
  });

  readonly deviceAnalyticsSummary = computed(() => {
    const acc = this.currentAccount();
    const devices = this.accountDevices();
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

    let totalLogsInMonth = 0;

    const deviceRows = devices.map((dev) => {
      const monthLogs = (dev.logs || [])
        .filter((l) => (l.periodMonth || l.date.slice(0, 7)) === selectedMonth)
        .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

      totalLogsInMonth += monthLogs.length;

      let monthKwh = 0;
      let devLatestDate = '';
      for (const log of monthLogs) {
        const effectiveLogEnd = log.endDate && log.endDate > log.date ? log.endDate : log.date;
        if (effectiveLogEnd > devLatestDate) devLatestDate = effectiveLogEnd;
        if (effectiveLogEnd > latestLoggedDate) latestLoggedDate = effectiveLogEnd;
        if (log.entryMode && log.entryMode !== 'cumulative_month') {
          // 'single_day', 'period_range', and 'delta' add to the device's monthly consumption
          monthKwh += Number(log.consumedKwh) || 0;
        } else {
          // 'cumulative_month' sets the consumed total as of that date
          monthKwh = Number(log.consumedKwh) || 0;
        }
      }
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

      const dailyPaceKwh = monthKwh > 0 ? monthKwh / devDaysElapsed : 0;
      const projectedMonthKwh = Math.round(dailyPaceKwh * daysInMonth * 10) / 10;
      const monthCostUah = Math.round(monthKwh * effectiveRateUah * 100) / 100;
      const projectedMonthCostUah = Math.round(projectedMonthKwh * effectiveRateUah * 100) / 100;

      const estimatedHoursPerDay =
        dev.powerWatts && dev.powerWatts > 0 && dailyPaceKwh > 0
          ? Math.min(24, (dailyPaceKwh * 1000) / dev.powerWatts)
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
        estimatedHoursPerDay,
        shareOfHousePercent: 0, // populated after houseReferenceKwh is computed
      };
    });

    // Reference date in the month
    let referenceDate = latestLoggedDate;
    if (!referenceDate) {
      referenceDate = todayStr.startsWith(selectedMonth) ? todayStr : `${selectedMonth}-${String(daysInMonth).padStart(2, '0')}`;
    }
    const daysElapsed = Math.max(1, Math.min(daysInMonth, Number(referenceDate.slice(8, 10)) || 1));

    const totalDevicesKwh = Math.round(deviceRows.reduce((sum, r) => sum + r.monthKwh, 0) * 100) / 100;
    const totalDevicesCostUah = Math.round(totalDevicesKwh * effectiveRateUah * 100) / 100;
    const devicesDailyPace = totalDevicesKwh / daysElapsed;
    const projectedDevicesMonthKwh =
      Math.round(deviceRows.reduce((sum, r) => sum + r.projectedMonthKwh, 0) * 10) / 10;
    const projectedDevicesMonthCostUah = Math.round(projectedDevicesMonthKwh * effectiveRateUah * 100) / 100;

    // Determine House Total Consumption in selectedMonth from meter readings or historical pace
    const monthReadings = this.accountReadings().filter(
      (r) => (r.periodMonth || r.date.slice(0, 7)) === selectedMonth
    );
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

    // Populate shareOfHousePercent and sort devices by monthKwh desc
    for (const r of deviceRows) {
      r.shareOfHousePercent =
        houseReferenceKwh > 0 ? Math.min(100, (r.monthKwh / houseReferenceKwh) * 100) : 0;
    }
    deviceRows.sort((a, b) => b.monthKwh - a.monthKwh);

    const maxChartKwh = Math.max(
      10,
      ...deviceRows.map((r) => Math.max(r.monthKwh, r.projectedMonthKwh)),
      untrackedKwh,
      projectedUntrackedMonthKwh
    );

    // Build chronological date progression points across logged dates in the month
    const uniqueDates = Array.from(
      new Set(
        devices.flatMap((d) =>
          (d.logs || [])
            .filter((l) => (l.periodMonth || l.date.slice(0, 7)) === selectedMonth)
            .map((l) => l.date)
        )
      )
    ).sort();

    const dateProgressionPoints = uniqueDates.map((dStr) => {
      let sumAtDate = 0;
      const parts: string[] = [];
      for (const dev of devices) {
        const logsUpToDate = (dev.logs || [])
          .filter((l) => (l.periodMonth || l.date.slice(0, 7)) === selectedMonth && l.date <= dStr)
          .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
        let devKwhAtDate = 0;
        for (const l of logsUpToDate) {
          if (l.entryMode && l.entryMode !== 'cumulative_month') devKwhAtDate += Number(l.consumedKwh) || 0;
          else devKwhAtDate = Number(l.consumedKwh) || 0;
        }
        if (devKwhAtDate > 0) {
          sumAtDate += devKwhAtDate;
          parts.push(`${dev.name}: ${devKwhAtDate.toFixed(1)}`);
        }
      }
      return {
        date: dStr,
        cumulativeDevicesKwh: Math.round(sumAtDate * 100) / 100,
        devicesSummary: parts.join(' • '),
      };
    });

    // Generate analytical insights & recommendations
    const insights: {
      title: string;
      description: string;
      badge?: string;
      icon: string;
      tone: 'amber' | 'emerald' | 'indigo' | 'rose';
    }[] = [];

    const topDevice = deviceRows[0];
    if (topDevice && topDevice.monthKwh > 0) {
      insights.push({
        title: `Головний споживач: ${topDevice.device.name}`,
        badge: `${topDevice.shareOfHousePercent.toFixed(1)}% від дому`,
        icon: 'local_fire_department',
        tone: 'amber',
        description: `Прилад «${topDevice.device.name}» спожив ${topDevice.monthKwh.toFixed(2)} кВт·год (${topDevice.monthCostUah.toFixed(0)} грн) із середнім темпом ${topDevice.dailyPaceKwh.toFixed(2)} кВт·год/добу. До кінця місяця очікується ~${topDevice.projectedMonthKwh.toFixed(1)} кВт·год (~${topDevice.projectedMonthCostUah.toFixed(0)} грн).`,
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
      title: 'Прогноз до кінця місяця',
      badge: `~${projectedHouseMonthKwh.toFixed(0)} кВт·год`,
      icon: projectedHouseMonthKwh > winterLimit && season === 'winter' ? 'warning' : 'trending_up',
      tone: projectedHouseMonthKwh > winterLimit && season === 'winter' ? 'rose' : 'indigo',
      description:
        season === 'winter'
          ? `За поточного темпу (${houseDailyPace.toFixed(2)} кВт·год/добу) загальне споживання за місяць складе ~${projectedHouseMonthKwh.toFixed(0)} кВт·год (~${projectedHouseMonthCostUah.toFixed(0)} грн), з яких прилади споживуть ~${projectedDevicesMonthKwh.toFixed(0)} кВт·год. ${
              projectedHouseMonthKwh <= winterLimit
                ? `Ви впевнено вкладаєтесь у пільговий зимовий ліміт ${winterLimit} кВт·год (запас ${(winterLimit - projectedHouseMonthKwh).toFixed(0)} кВт·год).`
                : `Увага: прогнозується перевищення зимового ліміту ${winterLimit} кВт·год на ${(projectedHouseMonthKwh - winterLimit).toFixed(0)} кВт·год!`
            }`
          : `За поточного темпу (${houseDailyPace.toFixed(2)} кВт·год/добу) очікуване споживання на кінець місяця становить ~${projectedHouseMonthKwh.toFixed(0)} кВт·год (~${projectedHouseMonthCostUah.toFixed(0)} грн).`,
    });

    // Night tariff potential savings for night-friendly devices
    const nightFriendlyRows = deviceRows.filter((r) => r.device.isNightFriendly && r.projectedMonthKwh > 0);
    if (nightFriendlyRows.length > 0) {
      const shiftableKwh = nightFriendlyRows.reduce((s, r) => s + r.projectedMonthKwh * 0.7, 0);
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

    return {
      selectedMonth,
      monthLabel,
      referenceDate,
      daysElapsed,
      daysInMonth,
      effectiveRateUah,
      totalLogsInMonth,
      deviceRows,
      totalDevicesKwh,
      totalDevicesCostUah,
      devicesDailyPace,
      projectedDevicesMonthKwh,
      projectedDevicesMonthCostUah,
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
      maxChartKwh,
      dateProgressionPoints,
      insights,
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
    const currentList = [...this.accountDevices()];
    const newDev: ElectricityDevice = {
      id: `dev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
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

    const val = this.deviceForm.getRawValue();
    const editId = this.editingDeviceId();
    const currentList = [...this.accountDevices()];

    let nextList: ElectricityDevice[];
    if (editId) {
      nextList = currentList.map((d) =>
        d.id === editId
          ? {
              ...d,
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

  readonly estimatedKwhFromPowerAndDuration = computed<number | null>(() => {
    const dev = this.selectedLogDevice();
    const durH = this.calculatedLogDurationHours();
    if (!dev?.powerWatts || dev.powerWatts <= 0 || !durH || durH <= 0) return null;
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

  onDeviceLogFormChange(): void {
    this.deviceLogFormTrigger.update((v) => v + 1);
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
    this.onDeviceLogFormChange();
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
    this.onDeviceLogFormChange();
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
        return '🌙 Нічний тариф (Т2)';
      case 'day_only':
        return '☀️ Денний тариф (Т1)';
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
    this.onDeviceLogFormChange();
    this.isDeviceLogModalOpen.set(true);
  }

  closeDeviceLogModal(): void {
    this.isDeviceLogModalOpen.set(false);
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
        `Споживання ${kwh} кВт·год зафіксовано (${this.getDeviceLogModeBadge(newLog)})!`
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
        `Додано ${newLog.consumedKwh} кВт·год до «${targetDeviceName}» (${this.getDeviceLogModeBadge(newLog)})!`
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

