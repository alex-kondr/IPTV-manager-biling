import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import {
  OUTAGE_SCHEDULE_VARIANTS,
  OutageScheduleVariantMeta,
  OutageScheduleViewVariant,
  UtilityAccount,
} from "../../../models/utility.model";
import {
  DtekHourSchedule,
  DtekQueueSchedule,
} from "../../../services/iptv-data";
import {
  buildAllQueuesListHelper,
  computeDtekStatusSummary,
  getGroupedIntervalsHelper,
  getShiftQuadrantsHelper,
  hasAccountAddressHelper,
} from "../electricity-reading-calc.util";
import { ELECTRICITY_VIEW_CTX } from "../electricity-view.context";
import {
  OutageChronologicalInterval,
  OutageScheduleVariantsComponent,
  OutageShiftQuadrant,
} from "../outage-schedule-variants";

@Component({
  selector: "app-dtek-schedule-section",
  imports: [CommonModule, MatIconModule, OutageScheduleVariantsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
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
                  <mat-icon aria-hidden="true">view_comfy_alt</mat-icon>
                </div>
                <div>
                  <div class="flex items-center gap-2 flex-wrap">
                    <h3 class="text-sm sm:text-base font-bold text-slate-900">
                      Список черг стабілізаційних відключень ДТЕК
                    </h3>
                    @if (!hasHouseWithAddress()) {
                      <span class="px-2.5 py-0.5 rounded-full text-2xs font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                        <mat-icon aria-hidden="true" class="text-xs leading-none">info</mat-icon>
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
                      <mat-icon aria-hidden="true" class="text-xs text-emerald-600 leading-none">update</mat-icon>
                      <span>Оновлено ДТЕК: <strong>{{ dtekInfo()?.dtekJsonUpdatedAt || dtekInfo()?.updateFact || '—' }}</strong></span>
                    </span>
                    @if (dtekInfo()?.lastDtekFetchAt || dtekInfo()?.fetchedAt) {
                      <span
                        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-200 font-semibold"
                        [title]="'Графік зберігається у спільній базі даних та оновлюється з сайту ДТЕК кожні ' + (dtekInfo()?.syncIntervalMinutes || dataService.dtekSyncIntervalMinutes()) + ' хвилин'"
                      >
                        <mat-icon aria-hidden="true" class="text-xs text-amber-600 leading-none">storage</mat-icon>
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
                        <mat-icon aria-hidden="true" class="text-sm text-sky-600 dark:text-sky-400 leading-none">{{ w.current.icon || 'wb_sunny' }}</mat-icon>
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
                    <mat-icon aria-hidden="true" class="text-base leading-none">home_pin</mat-icon>
                    <span>Графік за адресою будинку</span>
                  </button>
                } @else if (canEdit()) {
                  <button
                    type="button"
                    (click)="openAccountModal(currentAccount())"
                    class="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <mat-icon aria-hidden="true" class="text-base leading-none">add_location_alt</mat-icon>
                    <span>{{ currentAccount() ? 'Вказати адресу будинку' : '+ Додати будинок з адресою' }}</span>
                  </button>
                }

                <button
                  type="button"
                  (click)="refreshDtekSchedule()"
                  [disabled]="isDtekLoading()"
                  class="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white transition-colors flex items-center gap-1.5 shadow-2xs disabled:opacity-50 cursor-pointer"
                >
                  <mat-icon aria-hidden="true" class="text-base leading-none" [class.animate-spin]="isDtekLoading()">sync</mat-icon>
                  <span>{{ isDtekLoading() ? 'Оновлення...' : 'Оновити черги' }}</span>
                </button>
              </div>
            </div>

            <!-- Quick 10-Variant Switcher Bar inside Queues Card -->
            <div class="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col gap-2">
              <div class="flex items-center justify-between gap-2 flex-wrap">
                <div class="flex items-center gap-2">
                  <mat-icon aria-hidden="true" class="text-sm text-amber-600 leading-none">{{ activeOutageVariantMeta().icon }}</mat-icon>
                  <span class="text-xs font-bold text-slate-800">
                    Активний стиль графіку: <span class="text-amber-700">{{ activeOutageVariantMeta().name }}</span>
                  </span>
                </div>
                <button
                  type="button"
                  (click)="openOutageDisplaySettings()"
                  class="text-2xs font-bold text-indigo-700 hover:text-indigo-900 inline-flex items-center gap-1 cursor-pointer"
                >
                  <mat-icon aria-hidden="true" class="text-xs leading-none">settings</mat-icon>
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
                    <mat-icon aria-hidden="true" class="text-xs leading-none" [class.text-amber-400]="isSelected" [class.text-slate-500]="!isSelected">{{ v.icon }}</mat-icon>
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
                      <mat-icon aria-hidden="true"
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
              <mat-icon aria-hidden="true" class="text-sm leading-none">{{ dtekStatus()?.isPowerAvailableNow ? 'lightbulb' : 'power_off' }}</mat-icon>
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
                    <mat-icon aria-hidden="true" class="text-sm text-sky-600 dark:text-sky-400 leading-none">{{ w.current.icon || 'wb_sunny' }}</mat-icon>
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
              <mat-icon aria-hidden="true" class="text-base text-amber-300 leading-none">view_comfy_alt</mat-icon>
              <span>Всі черги ДТЕК</span>
            </button>
          </div>
        </div>

        <!-- Address Search & Autocomplete Bar -->
        @if (isCardAddressOpen()) {
          <div class="p-4 rounded-xl bg-slate-50/90 border border-slate-200 space-y-3">
            <div class="flex items-center justify-between flex-wrap gap-2">
              <span class="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <mat-icon aria-hidden="true" class="text-amber-600 text-sm leading-none">search</mat-icon>
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
                      <mat-icon aria-hidden="true" class="text-xs leading-none">close</mat-icon>
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
                        <mat-icon aria-hidden="true" class="text-3xs text-slate-400 leading-none">chevron_right</mat-icon>
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
                      <mat-icon aria-hidden="true" class="text-xs leading-none">close</mat-icon>
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
                        <mat-icon aria-hidden="true" class="text-3xs text-slate-400 leading-none">chevron_right</mat-icon>
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
                <mat-icon aria-hidden="true" class="text-xs text-slate-400 leading-none">info</mat-icon>
                Запит формується з поточною датою та часом за Києвом
              </span>
              @if (currentAccount(); as acc) {
                <button
                  type="button"
                  (click)="saveCardAddressToCurrentAccount()"
                  class="text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer"
                  title="Зберегти обрану адресу в поточний особовий рахунок електроенергії"
                >
                  <mat-icon aria-hidden="true" class="text-xs leading-none">save</mat-icon>
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
                  <mat-icon aria-hidden="true" class="text-lg">cloud_off</mat-icon>
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
                <mat-icon aria-hidden="true" class="text-sm">refresh</mat-icon>
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

          @defer {
<app-outage-schedule-variants
            [status]="status"
            [kyivTime]="liveKyivTime() || dtekInfo()?.kyivTime || ''"
            [lastUpdated]="dtekInfo()?.dtekJsonUpdatedAt || dtekInfo()?.updateFact || ''"
            [lastDtekFetchAt]="dtekInfo()?.lastDtekFetchAt || dtekInfo()?.fetchedAt || ''"
            [minutesUntilNextRefresh]="dtekInfo()?.minutesUntilNextRefresh || 0"
            [isRefreshing]="isDtekLoading()"
            (refresh)="refreshDtekSchedule()"
          />
} @placeholder {
  <div class="h-48 rounded-2xl bg-slate-100/70 animate-pulse"></div>
}
        }
      </div>
        }
  `,
})
export class DtekScheduleSectionComponent {
  readonly ctx = inject(ELECTRICITY_VIEW_CTX);
  readonly dataService = this.ctx.dataService;
  readonly canEdit = this.ctx.canEdit;
  readonly liveKyivTime = this.ctx.liveKyivTime;
  readonly weatherData = this.ctx.weatherData;
  readonly currentAccount = this.ctx.currentAccount;

  readonly availableQueues = ["1.1", "1.2", "2.1", "2.2", "3.1", "3.2", "4.1", "4.2", "5.1", "5.2", "6.1", "6.2"];
  readonly manualQueue = signal<string | null>(null);

  readonly dtekInfo = this.dataService.dtekShutdownInfo;
  readonly isDtekLoading = this.dataService.isDtekLoading;
  readonly dtekError = this.dataService.dtekError;
  readonly dtekCities = this.dataService.dtekCities;
  readonly dtekStreets = this.dataService.dtekStreets;
  readonly isDtekCatalogLoading = this.dataService.isDtekCatalogLoading;

  readonly forceShowQueuesMode = signal<boolean>(false);
  readonly expandedQueueKeys = signal<Record<string, boolean>>({});

  readonly isCardAddressOpen = signal<boolean>(false);
  readonly cardCity = signal<string>("с-ще Окни");
  readonly cardStreet = signal<string>("вул. Шкільна");
  readonly cardHouse = signal<string>("11");
  readonly cardCityQuery = signal<string>("с-ще Окни");
  readonly cardStreetQuery = signal<string>("вул. Шкільна");
  readonly cardHouseInput = signal<string>("11");
  readonly showCardCitySuggestions = signal<boolean>(false);
  readonly showCardStreetSuggestions = signal<boolean>(false);

  readonly activeDtekCity = computed(() => this.cardCity() || "с-ще Окни");
  readonly activeDtekStreet = computed(() => this.cardStreet() || "вул. Шкільна");
  readonly activeDtekHouse = computed(() => this.cardHouse() || "11");

  readonly dtekStatus = computed(() => computeDtekStatusSummary(this.dtekInfo(), this.manualQueue()));

  readonly hasHouseWithAddress = computed<boolean>(() => hasAccountAddressHelper(this.currentAccount()));

  readonly allQueuesList = computed<DtekQueueSchedule[]>(() =>
    buildAllQueuesListHelper(this.dtekInfo(), this.dtekStatus()?.scheduleDate || "")
  );

  readonly filteredCardCities = computed(() => {
    const q = this.cardCityQuery().trim().toLowerCase();
    const all = this.dtekCities();
    if (!q) return all.slice(0, 40);
    return all
      .filter((c) => c.toLowerCase().includes(q))
      .sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.toLowerCase().startsWith(q) ? 0 : 1;
        return aStarts - bStarts || a.localeCompare(b, "uk");
      })
      .slice(0, 40);
  });

  readonly filteredCardStreets = computed(() => {
    const q = this.cardStreetQuery().trim().toLowerCase();
    const all = this.dtekStreets();
    if (!q) return all.slice(0, 40);
    return all
      .filter((s) => s.toLowerCase().includes(q))
      .sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.toLowerCase().startsWith(q) ? 0 : 1;
        return aStarts - bStarts || a.localeCompare(b, "uk");
      })
      .slice(0, 40);
  });

  readonly outageScheduleVariants = OUTAGE_SCHEDULE_VARIANTS;
  readonly activeOutageVariant = this.dataService.outageScheduleViewVariant;

  readonly activeOutageVariantMeta = computed<OutageScheduleVariantMeta>(() => {
    const current = this.activeOutageVariant();
    return (
      OUTAGE_SCHEDULE_VARIANTS.find((v) => v.id === current) ||
      OUTAGE_SCHEDULE_VARIANTS[0]
    );
  });

  constructor() {
    effect(() => {
      const acc = this.currentAccount();
      const city = acc?.city || "с-ще Окни";
      const street = acc?.street || "вул. Шкільна";
      const house = acc?.houseNum || "11";
      untracked(() => {
        this.cardCity.set(city);
        this.cardStreet.set(street);
        this.cardHouse.set(house);
        this.cardCityQuery.set(city);
        this.cardStreetQuery.set(street);
        this.cardHouseInput.set(house);
      });
    });
  }

  selectManualQueue(q: string | null): void {
    this.manualQueue.set(q);
  }

  isQueueDropdownOpen(queueKey: string): boolean {
    return !!this.expandedQueueKeys()[queueKey];
  }

  toggleQueueDropdown(queueKey: string): void {
    this.expandedQueueKeys.update((prev) => ({
      ...prev,
      [queueKey]: !prev[queueKey],
    }));
  }

  refreshDtekSchedule(): void {
    this.dataService.fetchDtekShutdowns(
      this.activeDtekCity(),
      this.activeDtekStreet(),
      this.activeDtekHouse()
    );
  }

  onCardCityInput(val: string): void {
    this.cardCityQuery.set(val);
    this.showCardCitySuggestions.set(true);
  }

  selectCardCity(city: string): void {
    this.cardCity.set(city);
    this.cardCityQuery.set(city);
    this.showCardCitySuggestions.set(false);
    this.cardStreet.set("");
    this.cardStreetQuery.set("");
    this.dataService.fetchDtekCatalog(city);
  }

  onCardStreetInput(val: string): void {
    this.cardStreetQuery.set(val);
    this.showCardStreetSuggestions.set(true);
  }

  selectCardStreet(street: string): void {
    this.cardStreet.set(street);
    this.cardStreetQuery.set(street);
    this.showCardStreetSuggestions.set(false);
  }

  applyCardAddress(): void {
    const city = this.cardCityQuery().trim() || "с-ще Окни";
    const street = this.cardStreetQuery().trim() || "вул. Шкільна";
    const house = this.cardHouseInput().trim() || "11";
    this.cardCity.set(city);
    this.cardStreet.set(street);
    this.cardHouse.set(house);
    this.showCardCitySuggestions.set(false);
    this.showCardStreetSuggestions.set(false);
    this.dataService.fetchDtekShutdowns(city, street, house);
  }

  async saveCardAddressToCurrentAccount(): Promise<void> {
    const acc = this.currentAccount();
    const city = this.cardCityQuery().trim() || "с-ще Окни";
    const street = this.cardStreetQuery().trim() || "вул. Шкільна";
    const houseNum = this.cardHouseInput().trim() || "11";
    this.applyCardAddress();
    if (!acc) return;
    const address = [city, street, houseNum ? `буд. ${houseNum}` : ""].filter(Boolean).join(", ");
    await this.dataService.saveUtilityAccount({
      ...acc,
      city,
      street,
      houseNum,
      address,
    });
    this.isCardAddressOpen.set(false);
  }

  openAccountModal(acc: UtilityAccount | null): void {
    this.ctx.openAccountModal(acc);
  }

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
    return getGroupedIntervalsHelper(hours, currentHourNumber, currentMinute);
  }

  getShiftQuadrants(hours: DtekHourSchedule[], currentHourNumber = 0): OutageShiftQuadrant[] {
    return getShiftQuadrantsHelper(hours, currentHourNumber);
  }
}
