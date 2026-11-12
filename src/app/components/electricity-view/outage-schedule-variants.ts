import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { IptvData, DtekDaySchedule, DtekHourSchedule } from '../../services/iptv-data';
import {
  OutageScheduleViewVariant,
  OUTAGE_SCHEDULE_VARIANTS,
  OutageScheduleVariantMeta,
} from '../../models/utility.model';

export interface DtekAddressScheduleStatus {
  currentHourNumber: number;
  currentMinute: number;
  isPowerAvailableNow: boolean;
  totalPowerHours: number;
  totalOutageHours: number;
  queueGroup: string;
  scheduleDate: string;
  hourlySchedule: DtekHourSchedule[];
  tomorrowSchedule?: DtekDaySchedule | null;
}

export interface OutageChronologicalInterval {
  id: string;
  fromTime: string;
  toTime: string;
  durationHours: number;
  state: 'on' | 'off';
  containsCurrentTime: boolean;
  startHour: number;
  endHour: number;
}

export interface OutageShiftQuadrant {
  id: string;
  title: string;
  timeRange: string;
  icon: string;
  accentClass: string;
  badgeClass: string;
  powerHours: number;
  outageHours: number;
  containsCurrentHour: boolean;
  hours: DtekHourSchedule[];
}

export interface OutageRadarWedge {
  index: number;
  hour: number;
  half: 1 | 2;
  timeRange: string;
  hasPower: boolean;
  isCurrentHalf: boolean;
  pathD: string;
  labelX?: number;
  labelY?: number;
  hourLabel?: string;
}

@Component({
  selector: 'app-outage-schedule-variants',
  imports: [CommonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (status(); as status) {
      <!-- ================================================================ -->
      <!-- 10 SCHEDULE DISPLAY VARIANTS BAR + SETTINGS NAVIGATION BUTTON    -->
      <!-- ================================================================ -->
      <div class="p-3.5 rounded-xl bg-gradient-to-r from-amber-50/90 via-slate-50 to-indigo-50/60 border border-amber-200/80 space-y-2.5">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 text-white text-2xs font-extrabold">
              <mat-icon class="text-xs text-amber-400 leading-none">{{ activeOutageVariantMeta().icon }}</mat-icon>
              <span>{{ activeOutageVariantMeta().name }}</span>
            </span>
            <span class="text-2xs text-slate-600 hidden md:inline">
              {{ activeOutageVariantMeta().description }}
            </span>
          </div>

          <div class="flex items-center gap-2 self-start sm:self-auto shrink-0 flex-wrap">
            <button
              type="button"
              (click)="shareScheduleAsImage('today')"
              class="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-2xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              title="Створити зображення графіку ДТЕК та поділитися у вибраний застосунок"
            >
              <mat-icon class="text-xs text-amber-400 leading-none">share</mat-icon>
              <span>Поділитися</span>
            </button>

            <button
              type="button"
              (click)="openOutageDisplaySettings()"
              class="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-2xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              title="Перейти у загальні налаштування для детального вибору варіанту відображення графіку"
            >
              <mat-icon class="text-xs leading-none">settings</mat-icon>
              <span>Налаштування вигляду графіку (11 варіантів) →</span>
            </button>
          </div>
        </div>

        <!-- 10 Quick Variant Selector Pills -->
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
              [class.shadow-2xs]="isSelected"
              [class.bg-white]="!isSelected"
              [class.text-slate-700]="!isSelected"
              [class.border-slate-200]="!isSelected"
              [class.hover:border-amber-400]="!isSelected"
              [title]="v.name + ' — ' + v.description"
            >
              <mat-icon class="text-xs leading-none" [class.text-amber-400]="isSelected" [class.text-slate-500]="!isSelected">{{ v.icon }}</mat-icon>
              <span>{{ v.shortName }}</span>
            </button>
          }
        </div>
      </div>

      <!-- ================================================================ -->
      <!-- 24-HOUR SCHEDULE DISPLAY: 10 DISTINCT VISUAL VARIANTS            -->
      <!-- ================================================================ -->
      @if (status.hourlySchedule.length > 0) {
        <div class="space-y-4 pt-3 border-t border-slate-100">
          <!-- Common Schedule Header & Legend -->
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="px-2 py-0.5 rounded-md bg-indigo-600 text-white text-3xs font-bold uppercase tracking-wide">
                Поточний день
              </span>
              <h4 class="text-xs sm:text-sm font-bold text-slate-900">
                Графік на {{ status.scheduleDate || 'сьогодні' }} (24 години)
              </h4>
            </div>

            <!-- Legend -->
            <div class="flex items-center gap-3 text-3xs font-medium text-slate-600 flex-wrap">
              <span class="inline-flex items-center gap-1">
                <span class="w-2.5 h-2.5 rounded bg-emerald-500 inline-block"></span> Світло є
              </span>
              <span class="inline-flex items-center gap-1">
                <span class="w-2.5 h-2.5 rounded bg-rose-500 inline-block"></span> Відключення
              </span>
              <span class="inline-flex items-center gap-1">
                <span class="w-2.5 h-2.5 rounded inline-flex overflow-hidden border border-black/10">
                  <span class="w-1/2 h-full bg-emerald-500"></span>
                  <span class="w-1/2 h-full bg-rose-500"></span>
                </span>
                30 хв (1/2 години)
              </span>
            </div>
          </div>

          <!-- ========================================================== -->
          <!-- COMMON CURRENT INTERVAL FOCUS BANNER (FOR ALL VARIANTS)    -->
          <!-- ========================================================== -->
          @let nextTr = getNextTransitionSummary(status.hourlySchedule, status.currentHourNumber, status.currentMinute);
          <div
            class="p-4 sm:p-5 rounded-2xl border flex items-start justify-between gap-3 sm:gap-4 bg-gradient-to-r relative"
            [class.from-emerald-600]="status.isPowerAvailableNow"
            [class.to-teal-700]="status.isPowerAvailableNow"
            [class.border-emerald-500]="status.isPowerAvailableNow"
            [class.from-rose-600]="!status.isPowerAvailableNow"
            [class.to-red-800]="!status.isPowerAvailableNow"
            [class.border-rose-500]="!status.isPowerAvailableNow"
          >
            <!-- Left side: Titles + Last update + Status till HH:MM + Counters -->
            <div class="flex flex-col gap-3 text-white min-w-0 flex-1">
              <div>
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-2xs uppercase tracking-wider font-bold text-white/80">
                    Фокус поточного інтервалу
                  </span>
                  @if (lastUpdated()) {
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/20 text-white/90 text-3xs font-medium backdrop-blur border border-white/10">
                      <mat-icon class="text-3xs leading-none">update</mat-icon>
                      <span>ДТЕК: <strong>{{ lastUpdated() }}</strong></span>
                    </span>
                  }
                  @if (lastDtekFetchAt()) {
                    <span
                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/25 text-amber-200 text-3xs font-medium backdrop-blur border border-amber-300/25"
                      [title]="'Графік зберігається у базі даних для всіх користувачів і синхронізується з сайтом ДТЕК кожні ' + dtekSyncIntervalMinutes() + ' хвилин'"
                    >
                      <mat-icon class="text-3xs leading-none">storage</mat-icon>
                      <span>Запит у БД: <strong>{{ lastDtekFetchAt() }}</strong> (кожні {{ dtekSyncIntervalMinutes() }} хв)</span>
                    </span>
                  }
                </div>

                <div class="text-base sm:text-xl font-black leading-tight mt-1">
                  {{ nextTr.label }} {{ nextTr.time }}
                </div>
              </div>

              <!-- Counters + Subscribe to Schedule Changes & Enable Notifications button -->
              <div class="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-wrap pt-0.5">
                <div class="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-black/20 text-white text-center">
                  <div class="text-3xs opacity-80">Світло</div>
                  <div class="text-xs sm:text-sm font-black font-mono">{{ status.totalPowerHours }} год</div>
                </div>
                <div class="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-black/20 text-white text-center">
                  <div class="text-3xs opacity-80">Відкл.</div>
                  <div class="text-xs sm:text-sm font-black font-mono">{{ status.totalOutageHours }} год</div>
                </div>
                @if (status.queueGroup) {
                  <div class="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-white/20 backdrop-blur text-white text-center border border-white/20">
                    <div class="text-3xs opacity-80">Черга</div>
                    <div class="text-xs sm:text-sm font-black font-mono">{{ status.queueGroup }}</div>
                  </div>
                }

                <!-- Subscribe / Unsubscribe to Schedule Changes Button -->
                @if (!isPushSubscribed()) {
                  <button
                    id="btn-schedule-subscribe-notifications"
                    type="button"
                    (click)="enableSchedulePushNotifications()"
                    [disabled]="isPushLoading()"
                    class="px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-2xs sm:text-xs inline-flex items-center gap-1.5 transition-all cursor-pointer shadow-md border border-amber-300 disabled:opacity-50"
                    title="Отримувати фонові сповіщення на телефон при зміні графіку відключень ДТЕК ({{ status.queueGroup || 'Черга' }})"
                  >
                    <mat-icon class="text-sm sm:text-base leading-none shrink-0">notifications_active</mat-icon>
                    <span class="text-left leading-tight">
                      {{ isPushLoading() ? 'Підключення...' : 'Підписатись' }}
                    </span>
                  </button>
                } @else {
                  <button
                    id="btn-schedule-subscribe-notifications"
                    type="button"
                    (click)="disableSchedulePushNotifications()"
                    [disabled]="isPushLoading()"
                    class="px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-white/25 hover:bg-white/35 backdrop-blur text-white font-extrabold text-2xs sm:text-xs inline-flex items-center gap-1.5 transition-all cursor-pointer border border-white/30 shadow-xs disabled:opacity-50"
                    title="Вимкнути фонові сповіщення про зміни графіку"
                  >
                    <mat-icon class="text-sm sm:text-base leading-none shrink-0">notifications_off</mat-icon>
                    <span class="text-left leading-tight">
                      {{ isPushLoading() ? 'Відключення...' : 'Відписатись' }}
                    </span>
                  </button>
                }
              </div>

              @if (pushStatusMessage()) {
                <div class="text-2xs font-semibold text-amber-100 bg-black/25 border border-white/15 px-2.5 py-1 rounded-lg inline-flex items-center gap-1.5 w-fit">
                  <mat-icon class="text-xs text-amber-300 leading-none">info</mat-icon>
                  <span>{{ pushStatusMessage() }}</span>
                </div>
              }
            </div>

            <!-- Right side: Share + Refresh buttons positioned at top right -->
            <div class="shrink-0 self-start flex items-center gap-2">
              <button
                type="button"
                (click)="shareScheduleAsImage('today')"
                class="w-11 h-11 sm:w-12 sm:h-12 aspect-square rounded-xl bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-all cursor-pointer backdrop-blur border border-white/25 shadow-md hover:scale-105 active:scale-95"
                title="Поділитися графіком (створити зображення та надіслати у вибраний застосунок)"
                aria-label="Поділитися графіком"
              >
                <mat-icon class="text-xl sm:text-2xl leading-none">share</mat-icon>
              </button>
              <button
                type="button"
                (click)="refresh.emit()"
                [disabled]="isRefreshing()"
                class="w-11 h-11 sm:w-12 sm:h-12 aspect-square rounded-xl bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-all cursor-pointer backdrop-blur border border-white/25 disabled:opacity-50 shadow-md hover:scale-105 active:scale-95"
                [title]="minutesUntilNextRefresh() > 0 ? 'Оновити графік (у БД: ' + lastDtekFetchAt() + ', наступний запит на сайт ДТЕК через ' + minutesUntilNextRefresh() + ' хв)' : 'Оновити графік з сайту ДТЕК та зберегти в БД'"
                aria-label="Оновити графік"
              >
                <mat-icon class="text-xl sm:text-2xl leading-none" [class.animate-spin]="isRefreshing()">sync</mat-icon>
              </button>
            </div>
          </div>

          @switch (activeOutageVariant()) {
            <!-- ========================================================== -->
            <!-- VARIANT 2: LINEAR RIBBON TIMELINE (48 HALF-HOUR SEGMENTS)  -->
            <!-- ========================================================== -->
            @case ('v2_linear_ribbon') {
              @let livePct = getLiveTimelinePercent(status.currentHourNumber, status.currentMinute);
              <div class="p-4 rounded-2xl bg-slate-900 text-white space-y-4 shadow-sm">
                <div class="flex items-center justify-between flex-wrap gap-2">
                  <div class="flex items-center gap-2">
                    <mat-icon class="text-amber-400 text-base leading-none">view_timeline</mat-icon>
                    <span class="text-xs font-bold">Безперервна 24-годинна шкала (48 півгодинних сегментів)</span>
                  </div>
                  <span class="px-2.5 py-0.5 rounded-full bg-amber-400/20 border border-amber-400/40 text-amber-300 text-3xs font-mono font-bold">
                    Маркер часу: {{ kyivTime() || (status.currentHourNumber - 1) + ':00' }} ({{ livePct }}% доби)
                  </span>
                </div>

                <div class="relative pt-6 pb-5">
                  <div
                    class="absolute top-0 bottom-2 z-20 pointer-events-none flex flex-col items-center -translate-x-1/2"
                    [style.left.%]="livePct"
                  >
                    <span class="px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 text-4xs font-black uppercase tracking-wider shadow">
                      ЗАРАЗ
                    </span>
                    <div class="w-0.5 flex-1 bg-amber-400 shadow-[0_0_8px_#fbbf24]"></div>
                  </div>

                  <div class="grid grid-cols-24 h-11 rounded-xl overflow-hidden border-2 border-slate-700 bg-slate-950 p-0.5 gap-px">
                    @for (hItem of status.hourlySchedule; track hItem.hour) {
                      @let isCur = hItem.hour === status.currentHourNumber;
                      <div
                        class="flex h-full gap-px relative"
                        [class.ring-1]="isCur"
                        [class.ring-amber-400]="isCur"
                        [title]="hItem.timeLabel + ': ' + hItem.statusLabel"
                      >
                        <div
                          class="flex-1 h-full transition-colors"
                          [class.bg-emerald-500]="hItem.firstHalfPower"
                          [class.bg-rose-600]="!hItem.firstHalfPower"
                        ></div>
                        <div
                          class="flex-1 h-full transition-colors"
                          [class.bg-emerald-500]="hItem.secondHalfPower"
                          [class.bg-rose-600]="!hItem.secondHalfPower"
                        ></div>
                      </div>
                    }
                  </div>

                  <div class="grid grid-cols-12 sm:grid-cols-24 mt-1.5 text-center">
                    @for (hItem of status.hourlySchedule; track hItem.hour) {
                      <span
                        class="text-4xs font-mono font-bold"
                        [class.text-amber-400]="hItem.hour === status.currentHourNumber"
                        [class.text-slate-400]="hItem.hour !== status.currentHourNumber"
                      >
                        {{ hItem.fromTime.substring(0, 2) }}
                      </span>
                    }
                  </div>
                </div>

                <div class="flex items-center gap-2 flex-wrap pt-2 border-t border-slate-800">
                  <span class="text-3xs font-bold uppercase tracking-wider text-slate-400">Інтервали доби:</span>
                  @for (iv of getGroupedIntervals(status.hourlySchedule, status.currentHourNumber, status.currentMinute); track iv.id) {
                    <span
                      class="px-2.5 py-1 rounded-lg text-2xs font-mono font-bold inline-flex items-center gap-1.5 border"
                      [class.bg-emerald-500/20]="iv.state === 'on'"
                      [class.border-emerald-500/40]="iv.state === 'on'"
                      [class.text-emerald-300]="iv.state === 'on'"
                      [class.bg-rose-500/25]="iv.state === 'off'"
                      [class.border-rose-500/50]="iv.state === 'off'"
                      [class.text-rose-300]="iv.state === 'off'"
                      [class.ring-2]="iv.containsCurrentTime"
                      [class.ring-amber-400]="iv.containsCurrentTime"
                    >
                      <span>{{ iv.state === 'on' ? '⚡' : '🔌' }} {{ iv.fromTime }}–{{ iv.toTime }}</span>
                      <span class="opacity-75">({{ iv.durationHours }}г)</span>
                    </span>
                  }
                </div>
              </div>
            }

            <!-- ========================================================== -->
            <!-- VARIANT 3: CIRCULAR 24-HOUR RADAR / CLOCK DIAL (SVG)       -->
            <!-- ========================================================== -->
            @case ('v3_circular_radar') {
              @let wedges = getRadarWedges(status.hourlySchedule, status.currentHourNumber, status.currentMinute);
              @let intervals = getGroupedIntervals(status.hourlySchedule, status.currentHourNumber, status.currentMinute);
              <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center p-4 rounded-2xl bg-slate-950 text-white border border-slate-800">
                <div class="lg:col-span-6 flex flex-col items-center justify-center">
                  <svg viewBox="0 0 300 300" class="w-full max-w-[310px] h-auto select-none">
                    <circle cx="150" cy="150" r="144" fill="#0f172a" stroke="#1e293b" stroke-width="2" />
                    <circle cx="150" cy="150" r="52" fill="#020617" stroke="#334155" stroke-width="1.5" />

                    @for (w of wedges; track w.index) {
                      <path
                        [attr.d]="w.pathD"
                        [attr.fill]="w.hasPower ? '#10b981' : '#e11d48'"
                        [attr.stroke]="w.isCurrentHalf ? '#fbbf24' : '#020617'"
                        [attr.stroke-width]="w.isCurrentHalf ? '2.5' : '0.8'"
                        class="transition-opacity hover:opacity-85"
                      >
                        <title>{{ w.timeRange }}: {{ w.hasPower ? 'Світло є' : 'Відключення' }}{{ w.isCurrentHalf ? ' (ЗАРАЗ)' : '' }}</title>
                      </path>
                      @if (w.hourLabel !== undefined) {
                        <text
                          [attr.x]="w.labelX"
                          [attr.y]="w.labelY"
                          text-anchor="middle"
                          dominant-baseline="central"
                          class="text-[8px] font-mono font-bold"
                          [attr.fill]="w.hour === status.currentHourNumber ? '#fbbf24' : '#94a3b8'"
                        >
                          {{ w.hourLabel }}
                        </text>
                      }
                    }

                    <text x="150" y="136" text-anchor="middle" class="fill-slate-400 text-[8px] font-bold uppercase">
                      Черга {{ status.queueGroup }}
                    </text>
                    <text
                      x="150"
                      y="153"
                      text-anchor="middle"
                      class="text-[13px] font-black"
                      [attr.fill]="status.isPowerAvailableNow ? '#34d399' : '#fb7185'"
                    >
                      {{ status.isPowerAvailableNow ? 'СВІТЛО Є' : 'БЕЗ СВІТЛА' }}
                    </text>
                    <text x="150" y="169" text-anchor="middle" class="fill-amber-400 text-[9px] font-mono font-bold">
                      +{{ status.totalPowerHours }}г / -{{ status.totalOutageHours }}г
                    </text>
                  </svg>
                </div>

                <div class="lg:col-span-6 space-y-3">
                  <div class="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <div>
                      <div class="text-xs font-bold text-amber-400 uppercase tracking-wider">24-годинний радар доби</div>
                      <div class="text-sm font-black text-white">Хронологія чергування фаз світла</div>
                    </div>
                    <span class="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono font-bold text-slate-200">
                      {{ status.scheduleDate }}
                    </span>
                  </div>

                  <div class="space-y-2 max-h-64 overflow-y-auto pr-1">
                    @for (iv of intervals; track iv.id) {
                      <div
                        class="p-2.5 rounded-xl border flex items-center justify-between gap-3"
                        [class.bg-emerald-950/60]="iv.state === 'on'"
                        [class.border-emerald-500/40]="iv.state === 'on'"
                        [class.bg-rose-950/60]="iv.state === 'off'"
                        [class.border-rose-500/40]="iv.state === 'off'"
                        [class.ring-2]="iv.containsCurrentTime"
                        [class.ring-amber-400]="iv.containsCurrentTime"
                      >
                        <div class="flex items-center gap-2.5">
                          <span
                            class="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-xs"
                            [class.bg-emerald-600]="iv.state === 'on'"
                            [class.bg-rose-600]="iv.state === 'off'"
                          >
                            <mat-icon class="text-base leading-none">{{ iv.state === 'on' ? 'bolt' : 'power_off' }}</mat-icon>
                          </span>
                          <div>
                            <div class="text-xs font-mono font-extrabold text-white flex items-center gap-1.5">
                              <span>{{ iv.fromTime }} – {{ iv.toTime }}</span>
                              @if (iv.containsCurrentTime) {
                                <span class="px-1.5 py-0.2 rounded bg-amber-400 text-slate-950 text-4xs font-black uppercase">ЗАРАЗ</span>
                              }
                            </div>
                            <div class="text-2xs" [class.text-emerald-300]="iv.state === 'on'" [class.text-rose-300]="iv.state === 'off'">
                              {{ iv.state === 'on' ? 'Електропостачання за графіком' : 'Стабілізаційне відключення' }}
                            </div>
                          </div>
                        </div>
                        <span class="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 font-mono text-xs font-black text-white shrink-0">
                          {{ iv.durationHours }} год
                        </span>
                      </div>
                    }
                  </div>
                </div>
              </div>
            }

            <!-- ========================================================== -->
            <!-- VARIANT 4: 4 SHIFT QUADRANTS (NIGHT/MORNING/DAY/EVENING)   -->
            <!-- ========================================================== -->
            @case ('v4_shift_quadrants') {
              @let shifts = getShiftQuadrants(status.hourlySchedule, status.currentHourNumber);
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                @for (sh of shifts; track sh.id) {
                  <div
                    [class]="'p-4 rounded-2xl border bg-gradient-to-br space-y-3 transition-all ' + sh.accentClass + (sh.containsCurrentHour ? ' ring-2 ring-amber-500' : '')"
                  >
                    <div class="flex items-center justify-between gap-2">
                      <div class="flex items-center gap-2.5">
                        <div class="w-9 h-9 rounded-xl bg-black/15 flex items-center justify-center">
                          <mat-icon class="text-lg leading-none">{{ sh.icon }}</mat-icon>
                        </div>
                        <div>
                          <div class="flex items-center gap-1.5">
                            <span class="text-xs sm:text-sm font-black">{{ sh.title }}</span>
                            @if (sh.containsCurrentHour) {
                              <span class="px-1.5 py-0.2 rounded bg-amber-400 text-slate-950 text-4xs font-black uppercase">Поточна фаза</span>
                            }
                          </div>
                          <div class="text-2xs font-mono opacity-80">{{ sh.timeRange }} (6 годин)</div>
                        </div>
                      </div>

                      <div class="flex items-center gap-1.5 text-2xs font-mono font-bold">
                        <span class="px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-600 border border-emerald-500/30">
                          ⚡ {{ sh.powerHours }}г
                        </span>
                        <span class="px-2 py-0.5 rounded-lg bg-rose-500/20 text-rose-500 border border-rose-500/30">
                          🔌 {{ sh.outageHours }}г
                        </span>
                      </div>
                    </div>

                    <div class="grid grid-cols-6 gap-1.5">
                      @for (hItem of sh.hours; track hItem.hour) {
                        @let isCur = hItem.hour === status.currentHourNumber;
                        <div
                          class="p-2 rounded-xl border bg-white/95 text-slate-900 flex flex-col items-center gap-1 shadow-2xs"
                          [class.ring-2]="isCur"
                          [class.ring-amber-400]="isCur"
                          [class.border-slate-900]="isCur"
                          [class.border-slate-200]="!isCur"
                        >
                          <span class="text-2xs font-mono font-black">{{ hItem.fromTime.substring(0, 2) }}:00</span>
                          <div class="w-full h-4 rounded flex overflow-hidden gap-0.5 p-0.5 bg-slate-100">
                            <div class="flex-1 h-full rounded-xs" [class.bg-emerald-500]="hItem.firstHalfPower" [class.bg-rose-500]="!hItem.firstHalfPower"></div>
                            <div class="flex-1 h-full rounded-xs" [class.bg-emerald-500]="hItem.secondHalfPower" [class.bg-rose-500]="!hItem.secondHalfPower"></div>
                          </div>
                          <span
                            class="text-4xs font-extrabold uppercase"
                            [class.text-emerald-700]="hItem.firstHalfPower && hItem.secondHalfPower"
                            [class.text-rose-700]="!hItem.firstHalfPower && !hItem.secondHalfPower"
                            [class.text-amber-700]="hItem.firstHalfPower !== hItem.secondHalfPower"
                          >
                            {{ hItem.statusKey === 'yes' ? 'Світло' : (hItem.statusKey === 'no' ? 'Відкл.' : '30 хв') }}
                          </span>
                        </div>
                      }
                    </div>
                  </div>
                }
              </div>
            }

            <!-- ========================================================== -->
            <!-- VARIANT 5: CHRONOLOGICAL INTERVAL CARDS (ON / OFF BLOCKS)  -->
            <!-- ========================================================== -->
            @case ('v5_interval_cards') {
              @let intervals = getGroupedIntervals(status.hourlySchedule, status.currentHourNumber, status.currentMinute);
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                @for (iv of intervals; track iv.id; let idx = $index) {
                  <div
                    class="p-4 rounded-2xl border flex flex-col justify-between gap-3 transition-all"
                    [class.bg-emerald-50/70]="iv.state === 'on'"
                    [class.border-emerald-300]="iv.state === 'on'"
                    [class.bg-rose-50/80]="iv.state === 'off'"
                    [class.border-rose-300]="iv.state === 'off'"
                    [class.ring-2]="iv.containsCurrentTime"
                    [class.ring-slate-900]="iv.containsCurrentTime"
                    [class.shadow-md]="iv.containsCurrentTime"
                  >
                    <div class="flex items-start justify-between gap-2">
                      <div class="flex items-center gap-2.5">
                        <div
                          class="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold shadow-2xs shrink-0"
                          [class.bg-emerald-600]="iv.state === 'on'"
                          [class.bg-rose-600]="iv.state === 'off'"
                        >
                          <mat-icon>{{ iv.state === 'on' ? 'lightbulb' : 'power_off' }}</mat-icon>
                        </div>
                        <div>
                          <div class="flex items-center gap-1.5 flex-wrap">
                            <span class="text-sm sm:text-base font-black font-mono text-slate-900">
                              {{ iv.fromTime }} – {{ iv.toTime }}
                            </span>
                            @if (iv.containsCurrentTime) {
                              <span class="px-2 py-0.5 rounded-full bg-slate-900 text-amber-400 text-4xs font-black uppercase">
                                ЗАРАЗ
                              </span>
                            }
                          </div>
                          <div
                            class="text-xs font-bold mt-0.5"
                            [class.text-emerald-800]="iv.state === 'on'"
                            [class.text-rose-800]="iv.state === 'off'"
                          >
                            {{ iv.state === 'on' ? '⚡ Період зі світлом' : '🔌 Стабілізаційне відключення' }}
                          </div>
                        </div>
                      </div>

                      <span
                        class="px-2.5 py-1 rounded-xl font-mono text-xs font-black border shrink-0"
                        [class.bg-emerald-600]="iv.state === 'on'"
                        [class.text-white]="iv.state === 'on'"
                        [class.border-emerald-700]="iv.state === 'on'"
                        [class.bg-rose-600]="iv.state === 'off'"
                        [class.text-white]="iv.state === 'off'"
                        [class.border-rose-700]="iv.state === 'off'"
                      >
                        {{ iv.durationHours }} год
                      </span>
                    </div>

                    <div class="space-y-1">
                      <div class="flex items-center justify-between text-3xs font-semibold text-slate-600">
                        <span>Блок #{{ idx + 1 }}</span>
                        <span>Частка доби: {{ ((iv.durationHours / 24) * 100).toFixed(0) }}%</span>
                      </div>
                      <div class="w-full h-2 rounded-full bg-white/80 overflow-hidden border border-slate-200/80">
                        <div
                          class="h-full rounded-full"
                          [class.bg-emerald-500]="iv.state === 'on'"
                          [class.bg-rose-500]="iv.state === 'off'"
                          [style.width.%]="(iv.durationHours / 24) * 100"
                        ></div>
                      </div>
                    </div>
                  </div>
                }
              </div>
            }

            <!-- ========================================================== -->
            <!-- VARIANT 6: MATRIX 4x6 (LARGE TOUCH TILES)                  -->
            <!-- ========================================================== -->
            @case ('v6_matrix_4x6') {
              @let rows4x6 = getMatrix4x6Rows(status.hourlySchedule);
              <div class="space-y-2.5">
                @for (row of rows4x6; track $index) {
                  <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                    @for (hItem of row; track hItem.hour) {
                      @let isCur = hItem.hour === status.currentHourNumber;
                      <div
                        class="p-3 rounded-2xl border flex flex-col justify-between gap-2 transition-all"
                        [class.bg-emerald-50/70]="hItem.firstHalfPower && hItem.secondHalfPower"
                        [class.border-emerald-300]="hItem.firstHalfPower && hItem.secondHalfPower"
                        [class.bg-rose-50/80]="!hItem.firstHalfPower && !hItem.secondHalfPower"
                        [class.border-rose-300]="!hItem.firstHalfPower && !hItem.secondHalfPower"
                        [class.bg-amber-50/80]="hItem.firstHalfPower !== hItem.secondHalfPower"
                        [class.border-amber-300]="hItem.firstHalfPower !== hItem.secondHalfPower"
                        [class.ring-2]="isCur"
                        [class.ring-slate-900]="isCur"
                        [class.shadow-md]="isCur"
                      >
                        <div class="flex items-center justify-between gap-1">
                          <span class="text-xs font-mono font-black text-slate-900">
                            {{ hItem.timeLabel }}
                          </span>
                          @if (isCur) {
                            <span class="px-1.5 py-0.2 rounded bg-slate-900 text-amber-400 text-4xs font-black uppercase">ЗАРАЗ</span>
                          }
                        </div>

                        <div class="grid grid-cols-2 gap-1.5">
                          <div
                            class="p-1.5 rounded-lg text-center border text-4xs font-bold"
                            [class.bg-emerald-500]="hItem.firstHalfPower"
                            [class.text-white]="hItem.firstHalfPower"
                            [class.border-emerald-600]="hItem.firstHalfPower"
                            [class.bg-rose-600]="!hItem.firstHalfPower"
                            [class.text-white]="!hItem.firstHalfPower"
                            [class.border-rose-700]="!hItem.firstHalfPower"
                          >
                            00–30: {{ hItem.firstHalfPower ? 'Є' : 'Ні' }}
                          </div>
                          <div
                            class="p-1.5 rounded-lg text-center border text-4xs font-bold"
                            [class.bg-emerald-500]="hItem.secondHalfPower"
                            [class.text-white]="hItem.secondHalfPower"
                            [class.border-emerald-600]="hItem.secondHalfPower"
                            [class.bg-rose-600]="!hItem.secondHalfPower"
                            [class.text-white]="!hItem.secondHalfPower"
                            [class.border-rose-700]="!hItem.secondHalfPower"
                          >
                            30–60: {{ hItem.secondHalfPower ? 'Є' : 'Ні' }}
                          </div>
                        </div>

                        <div class="flex items-center justify-between text-3xs font-bold pt-1 border-t border-black/5">
                          <span
                            [class.text-emerald-900]="hItem.firstHalfPower && hItem.secondHalfPower"
                            [class.text-rose-900]="!hItem.firstHalfPower && !hItem.secondHalfPower"
                            [class.text-amber-900]="hItem.firstHalfPower !== hItem.secondHalfPower"
                          >
                            {{ hItem.statusLabel }}
                          </span>
                          <span class="font-mono text-slate-500">
                            {{ isNightTariffHour(hItem.hour) ? '🌙 Ніч' : '☀️ День' }}
                          </span>
                        </div>
                      </div>
                    }
                  </div>
                }
              </div>
            }

            <!-- ========================================================== -->
            <!-- VARIANT 7: COMPACT HOURLY SCHEDULE TABLE                   -->
            <!-- ========================================================== -->
            @case ('v7_compact_table') {
              <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                <table class="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr class="bg-slate-900 text-white text-3xs uppercase tracking-wider font-bold">
                      <th class="py-2.5 px-3">Година доби</th>
                      <th class="py-2.5 px-3">00 – 30 хв</th>
                      <th class="py-2.5 px-3">30 – 60 хв</th>
                      <th class="py-2.5 px-3">Статус сьогодні</th>
                      <th class="py-2.5 px-3">Тарифна зона</th>
                      @if (status.tomorrowSchedule) {
                        <th class="py-2.5 px-3">Завтра ({{ status.tomorrowSchedule.scheduleDate }})</th>
                      }
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100">
                    @for (hItem of status.hourlySchedule; track hItem.hour; let idx = $index) {
                      @let isCur = hItem.hour === status.currentHourNumber;
                      @let tomItem = status.tomorrowSchedule?.hourlySchedule?.[idx];
                      <tr
                        class="transition-colors"
                        [class.bg-amber-50/90]="isCur"
                        [class.hover:bg-slate-50]="!isCur"
                      >
                        <td class="py-2 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                          <div class="flex items-center gap-1.5">
                            <span>{{ hItem.timeLabel }}</span>
                            @if (isCur) {
                              <span class="px-1.5 py-0.2 rounded bg-indigo-600 text-white text-4xs font-black uppercase">ЗАРАЗ</span>
                            }
                          </div>
                        </td>
                        <td class="py-2 px-3 whitespace-nowrap">
                          <span
                            class="px-2 py-0.5 rounded-md text-3xs font-bold inline-flex items-center gap-1"
                            [class.bg-emerald-100]="hItem.firstHalfPower"
                            [class.text-emerald-900]="hItem.firstHalfPower"
                            [class.bg-rose-100]="!hItem.firstHalfPower"
                            [class.text-rose-900]="!hItem.firstHalfPower"
                          >
                            {{ hItem.firstHalfPower ? '⚡ Світло є' : '🔌 Відключено' }}
                          </span>
                        </td>
                        <td class="py-2 px-3 whitespace-nowrap">
                          <span
                            class="px-2 py-0.5 rounded-md text-3xs font-bold inline-flex items-center gap-1"
                            [class.bg-emerald-100]="hItem.secondHalfPower"
                            [class.text-emerald-900]="hItem.secondHalfPower"
                            [class.bg-rose-100]="!hItem.secondHalfPower"
                            [class.text-rose-900]="!hItem.secondHalfPower"
                          >
                            {{ hItem.secondHalfPower ? '⚡ Світло є' : '🔌 Відключено' }}
                          </span>
                        </td>
                        <td class="py-2 px-3 font-semibold text-slate-800">
                          {{ hItem.statusLabel }}
                        </td>
                        <td class="py-2 px-3 whitespace-nowrap">
                          @if (isNightTariffHour(hItem.hour)) {
                            <span class="px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 text-3xs font-bold">
                              🌙 Нічний (0.5x)
                            </span>
                          } @else {
                            <span class="px-2 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200 text-3xs font-bold">
                              ☀️ Денний (1.0x)
                            </span>
                          }
                        </td>
                        @if (status.tomorrowSchedule) {
                          <td class="py-2 px-3 whitespace-nowrap">
                            @if (tomItem) {
                              <span
                                class="px-2 py-0.5 rounded text-3xs font-bold"
                                [class.bg-emerald-50]="tomItem.firstHalfPower && tomItem.secondHalfPower"
                                [class.text-emerald-800]="tomItem.firstHalfPower && tomItem.secondHalfPower"
                                [class.bg-rose-50]="!tomItem.firstHalfPower && !tomItem.secondHalfPower"
                                [class.text-rose-800]="!tomItem.firstHalfPower && !tomItem.secondHalfPower"
                                [class.bg-amber-50]="tomItem.firstHalfPower !== tomItem.secondHalfPower"
                                [class.text-amber-800]="tomItem.firstHalfPower !== tomItem.secondHalfPower"
                              >
                                {{ tomItem.statusLabel }}
                              </span>
                            }
                          </td>
                        }
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }

            <!-- ========================================================== -->
            <!-- VARIANT 8: CYBER SCADA TELEMETRY MONITOR                   -->
            <!-- ========================================================== -->
            @case ('v8_cyber_scada') {
              @let polyPoints = getScadaOscillogramPoints(status.hourlySchedule);
              <div class="p-5 rounded-2xl bg-slate-950 text-emerald-400 border-2 border-slate-800 font-mono space-y-4 shadow-lg">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
                  <div class="flex items-center gap-2.5">
                    <span
                      class="w-3 h-3 rounded-full animate-ping"
                      [class.bg-emerald-400]="status.isPowerAvailableNow"
                      [class.bg-rose-500]="!status.isPowerAvailableNow"
                    ></span>
                    <span class="text-xs sm:text-sm font-black tracking-wider uppercase text-white">
                      SCADA DTEK-ODESKA // ЧЕРГА {{ status.queueGroup }} // {{ status.scheduleDate }}
                    </span>
                  </div>
                  <div class="flex items-center gap-3 text-2xs">
                    <span class="px-2 py-0.5 rounded bg-slate-900 border border-emerald-500/40 text-emerald-300">
                      UPTIME: {{ ((status.totalPowerHours / 24) * 100).toFixed(1) }}%
                    </span>
                    <span class="px-2 py-0.5 rounded bg-slate-900 border border-rose-500/40 text-rose-400">
                      OUTAGE: {{ status.totalOutageHours }}H
                    </span>
                  </div>
                </div>

                <div class="p-3 rounded-xl bg-black/70 border border-slate-800/90 space-y-1.5">
                  <div class="flex items-center justify-between text-3xs text-slate-400">
                    <span>ОСЦИЛОГРАМА НАПРУГИ ЛІНІЇ (24 ГОДИНИ • 48 ВІДЛІКІВ)</span>
                    <span class="text-emerald-400">HIGH = 230V ON • LOW = 0V OFF</span>
                  </div>
                  <div class="w-full overflow-x-auto">
                    <svg viewBox="0 0 720 82" class="w-full min-w-[520px] h-20">
                      <line x1="0" y1="18" x2="720" y2="18" stroke="#064e3b" stroke-dasharray="3 3" stroke-width="1" />
                      <line x1="0" y1="62" x2="720" y2="62" stroke="#4c0519" stroke-dasharray="3 3" stroke-width="1" />
                      <polyline
                        fill="none"
                        stroke="#10b981"
                        stroke-width="3"
                        [attr.points]="polyPoints"
                      />
                      <line
                        [attr.x1]="(status.currentHourNumber - 1) * 30 + 15"
                        y1="4"
                        [attr.x2]="(status.currentHourNumber - 1) * 30 + 15"
                        y2="76"
                        stroke="#fbbf24"
                        stroke-width="2"
                      />
                    </svg>
                  </div>
                </div>

                <div class="grid grid-cols-6 sm:grid-cols-12 lg:grid-cols-24 gap-1.5">
                  @for (hItem of status.hourlySchedule; track hItem.hour) {
                    @let isCur = hItem.hour === status.currentHourNumber;
                    <div
                      class="p-1.5 rounded-lg border flex flex-col items-center gap-1 bg-slate-900/90"
                      [class.border-amber-400]="isCur"
                      [class.ring-1]="isCur"
                      [class.ring-amber-400]="isCur"
                      [class.border-slate-800]="!isCur"
                    >
                      <span class="text-3xs font-bold" [class.text-amber-300]="isCur" [class.text-slate-400]="!isCur">
                        {{ hItem.fromTime.substring(0, 2) }}
                      </span>
                      <div class="w-full flex gap-0.5 h-4">
                        <div
                          class="flex-1 rounded-xs"
                          [class.bg-emerald-400]="hItem.firstHalfPower"
                          [class.shadow-[0_0_8px_#34d399]]="hItem.firstHalfPower"
                          [class.bg-rose-600]="!hItem.firstHalfPower"
                        ></div>
                        <div
                          class="flex-1 rounded-xs"
                          [class.bg-emerald-400]="hItem.secondHalfPower"
                          [class.shadow-[0_0_8px_#34d399]]="hItem.secondHalfPower"
                          [class.bg-rose-600]="!hItem.secondHalfPower"
                        ></div>
                      </div>
                      <span
                        class="text-4xs font-bold"
                        [class.text-emerald-400]="hItem.firstHalfPower && hItem.secondHalfPower"
                        [class.text-rose-400]="!hItem.firstHalfPower && !hItem.secondHalfPower"
                        [class.text-amber-300]="hItem.firstHalfPower !== hItem.secondHalfPower"
                      >
                        {{ hItem.statusKey === 'yes' ? 'ON' : (hItem.statusKey === 'no' ? 'OFF' : '50%') }}
                      </span>
                    </div>
                  }
                </div>
              </div>
            }

            <!-- ========================================================== -->
            <!-- VARIANT 9: DUAL DAY COMPARE (TODAY VS TOMORROW SYNCED)     -->
            <!-- ========================================================== -->
            @case ('v9_dual_day_compare') {
              <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div class="flex items-center justify-between flex-wrap gap-2">
                  <div class="flex items-center gap-2">
                    <mat-icon class="text-indigo-600 text-base leading-none">compare_arrows</mat-icon>
                    <span class="text-xs sm:text-sm font-bold text-slate-900">
                      Синхронне порівняння «Сьогодні vs Завтра» година-в-годину
                    </span>
                  </div>
                  @if (status.tomorrowSchedule; as tom) {
                    <span class="text-2xs font-mono font-bold text-slate-700">
                      Сьогодні: +{{ status.totalPowerHours }}г • Завтра ({{ tom.scheduleDate }}): +{{ tom.totalPowerHours }}г
                    </span>
                  } @else {
                    <span class="text-2xs text-amber-800 bg-amber-100 px-2 py-0.5 rounded font-semibold">
                      Графік на завтра від ДТЕК ще не опубліковано (відображено поточну добу)
                    </span>
                  }
                </div>

                <div class="grid grid-cols-6 sm:grid-cols-12 lg:grid-cols-24 gap-1">
                  @for (hItem of status.hourlySchedule; track hItem.hour; let idx = $index) {
                    @let isCur = hItem.hour === status.currentHourNumber;
                    @let tomItem = status.tomorrowSchedule?.hourlySchedule?.[idx];
                    <div
                      class="p-1.5 rounded-xl border bg-white flex flex-col items-center gap-1"
                      [class.border-indigo-600]="isCur"
                      [class.ring-2]="isCur"
                      [class.ring-indigo-500/30]="isCur"
                      [class.border-slate-200]="!isCur"
                    >
                      <span class="text-3xs font-mono font-black text-slate-800">{{ hItem.fromTime.substring(0, 2) }}</span>
                      <div class="w-full space-y-0.5">
                        <span class="text-[8px] font-bold text-indigo-700 block text-center">Сьог</span>
                        <div class="w-full h-3.5 rounded flex overflow-hidden gap-0.5 p-0.5 bg-slate-100">
                          <div class="flex-1 rounded-xs" [class.bg-emerald-500]="hItem.firstHalfPower" [class.bg-rose-500]="!hItem.firstHalfPower"></div>
                          <div class="flex-1 rounded-xs" [class.bg-emerald-500]="hItem.secondHalfPower" [class.bg-rose-500]="!hItem.secondHalfPower"></div>
                        </div>
                      </div>
                      <div class="w-full space-y-0.5 pt-0.5 border-t border-slate-100">
                        <span class="text-[8px] font-bold text-amber-700 block text-center">Завт</span>
                        @if (tomItem) {
                          <div class="w-full h-3.5 rounded flex overflow-hidden gap-0.5 p-0.5 bg-slate-100">
                            <div class="flex-1 rounded-xs" [class.bg-emerald-500]="tomItem.firstHalfPower" [class.bg-rose-500]="!tomItem.firstHalfPower"></div>
                            <div class="flex-1 rounded-xs" [class.bg-emerald-500]="tomItem.secondHalfPower" [class.bg-rose-500]="!tomItem.secondHalfPower"></div>
                          </div>
                        } @else {
                          <div class="w-full h-3.5 rounded bg-slate-100 flex items-center justify-center text-[8px] text-slate-400">—</div>
                        }
                      </div>
                    </div>
                  }
                </div>
              </div>
            }

            <!-- ========================================================== -->
            <!-- VARIANT 10: MINIMAL PILLS + CURRENT HOUR SPOTLIGHT         -->
            <!-- ========================================================== -->
            @case ('v10_minimal_pills') {
              <div class="space-y-3">
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2 pt-1">
                  @for (hItem of status.hourlySchedule; track hItem.hour) {
                    @let isCur = hItem.hour === status.currentHourNumber;
                    @let isFullPower = hItem.firstHalfPower && hItem.secondHalfPower;
                    @let isFullOutage = !hItem.firstHalfPower && !hItem.secondHalfPower;
                    @let isMixed = !isFullPower && !isFullOutage;

                    <div
                      class="h-9 px-2.5 rounded-full border text-xs font-mono font-bold flex items-center justify-center transition-all select-none w-full shadow-2xs relative overflow-hidden"
                      [class.bg-emerald-500]="isFullPower"
                      [class.border-emerald-600]="isFullPower"
                      [class.bg-rose-600]="isFullOutage"
                      [class.border-rose-700]="isFullOutage"
                      [class.border-amber-500]="isMixed"
                      [class.ring-2]="isCur"
                      [class.ring-slate-900]="isCur"
                      [class.ring-offset-1]="isCur"
                      [class.shadow-md]="isCur"
                      [title]="hItem.timeLabel + ': ' + hItem.statusLabel"
                    >
                      <!-- Two-tone split background for half-and-half hours (30 min on / 30 min off) -->
                      @if (isMixed) {
                        <div class="absolute inset-0 flex pointer-events-none">
                          <div
                            class="w-1/2 h-full border-r border-black/10"
                            [class.bg-emerald-500]="hItem.firstHalfPower"
                            [class.bg-rose-600]="!hItem.firstHalfPower"
                          ></div>
                          <div
                            class="w-1/2 h-full"
                            [class.bg-emerald-500]="hItem.secondHalfPower"
                            [class.bg-rose-600]="!hItem.secondHalfPower"
                          ></div>
                        </div>
                      }

                      <!-- Clear time interval without redundant emoji/symbol -->
                      <span
                        class="relative z-10 text-white leading-none tracking-tight drop-shadow-xs"
                      >
                        {{ hItem.fromTime }}–{{ hItem.toTime }}
                      </span>
                    </div>
                  }
                </div>
              </div>
            }

            <!-- ========================================================== -->
            <!-- VARIANT 11: OFFICIAL DTEK ODESA GRIDS SHEET + SHARE IMAGE  -->
            <!-- ========================================================== -->
            @case ('v11_dtek_official_sheet') {
              <div class="p-4 sm:p-6 rounded-2xl bg-white border border-slate-200 shadow-xs text-slate-950 space-y-4 relative">
                <!-- Share / Download Toolbar at Top Right -->
                <div class="flex items-center justify-end gap-2 flex-wrap">
                  <button
                    type="button"
                    (click)="shareScheduleAsImage('today')"
                    class="px-3.5 py-2 rounded-xl bg-[#FFE600] hover:bg-amber-400 text-slate-950 text-xs font-extrabold inline-flex items-center gap-1.5 transition-all cursor-pointer shadow-xs border border-amber-400/80"
                    title="Створити PNG-зображення графіку та надіслати у вибраний застосунок (Telegram, Viber тощо)"
                  >
                    <mat-icon class="text-sm leading-none">share</mat-icon>
                    <span>Поділитися графіком</span>
                  </button>
                  <button
                    type="button"
                    (click)="downloadDirectSchedulePng('today')"
                    class="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold inline-flex items-center gap-1.5 transition-all cursor-pointer border border-slate-200"
                    title="Завантажити графік як PNG-картинку"
                  >
                    <mat-icon class="text-sm leading-none">download</mat-icon>
                    <span class="hidden sm:inline">Завантажити PNG</span>
                  </button>
                </div>

                <!-- Official DTEK | ОДЕСЬКІ ЕЛЕКТРОМЕРЕЖІ Branding Header -->
                <div class="flex flex-col items-center justify-center gap-3 pt-1">
                  <div class="flex items-center justify-center gap-3 sm:gap-4 select-none">
                    <!-- DTEK Geometric Logo with Yellow Top Stem on D -->
                    <div class="flex items-center font-black tracking-tighter text-3xl sm:text-4xl text-slate-950 leading-none">
                      <span class="relative inline-flex items-center">
                        <!-- Custom SVG for authentic DTEK logo -->
                        <svg viewBox="0 0 156 44" class="h-8 sm:h-10 w-auto" aria-label="DTEK">
                          <!-- Yellow top segment of D stem -->
                          <rect x="2" y="4" width="8.5" height="9" fill="#FFE600" />
                          <!-- Black bottom segment of D stem -->
                          <rect x="2" y="15" width="8.5" height="25" fill="#000000" />
                          <!-- D curved bowl -->
                          <path d="M12 4 H25 C35 4 41 11 41 22 C41 33 35 40 25 40 H12 V32 H24 C29.5 32 32.5 28 32.5 22 C32.5 16 29.5 12 24 12 H12 Z" fill="#000000" />
                          <!-- T -->
                          <path d="M45 4 H77 V12 H65.25 V40 H56.75 V12 H45 Z" fill="#000000" />
                          <!-- E (stylized DTEK rounded E) -->
                          <path d="M95 4 H114 V12 H95 C90.5 12 88 14.5 88 18.5 H111 V25.5 H88 C88 29.5 90.5 32 95 32 H114 V40 H94 C84.5 40 79.5 33.5 79.5 22 C79.5 10.5 84.5 4 95 4 Z" fill="#000000" />
                          <!-- K -->
                          <path d="M120 4 H128.5 V18.5 L143.5 4 H154.5 L137 21 L155.5 40 H144.5 L128.5 23.5 V40 H120 Z" fill="#000000" />
                        </svg>
                      </span>
                    </div>

                    <!-- Vertical Divider -->
                    <div class="w-[1.5px] h-9 sm:h-11 bg-slate-900 shrink-0"></div>

                    <!-- ОДЕСЬКІ ЕЛЕКТРОМЕРЕЖІ -->
                    <div class="flex flex-col justify-center text-left font-extrabold text-xs sm:text-base tracking-[0.14em] leading-snug text-slate-950 uppercase">
                      <span>ОДЕСЬКІ</span>
                      <span>ЕЛЕКТРОМЕРЕЖІ</span>
                    </div>
                  </div>

                  <!-- Yellow Pill: Черга X.X -->
                  <div class="px-7 py-1.5 rounded-full bg-[#FFE600] text-slate-950 font-extrabold text-base sm:text-xl tracking-tight shadow-2xs">
                    Черга {{ formatQueueNumber(status.queueGroup) }}
                  </div>

                  <!-- Main Title: Графік відключень на: -->
                  <div class="text-lg sm:text-2xl font-normal text-slate-950 text-center pt-0.5">
                    Графік відключень на:
                  </div>
                </div>

                <!-- 24-Hour Official DTEK Sheet Table -->
                <div class="overflow-x-auto pb-1">
                  <div class="min-w-[700px] border border-slate-300 rounded-xl overflow-hidden bg-white">
                    <!-- Header Row: Часові проміжки + 00-01 .. 23-24 vertical -->
                    <div class="flex border-b border-slate-300 bg-white">
                      <div class="w-32 sm:w-36 shrink-0 px-3 py-2.5 border-r border-slate-300 flex flex-col justify-center text-left bg-white">
                        <span class="text-xs font-bold text-slate-900 leading-tight">Часові</span>
                        <span class="text-xs font-bold text-slate-900 leading-tight">проміжки</span>
                      </div>
                      @for (hItem of status.hourlySchedule; track hItem.hour) {
                        @let isCur = hItem.hour === status.currentHourNumber;
                        <div
                          class="flex-1 min-w-[23px] h-16 border-r last:border-r-0 border-slate-300 flex items-center justify-center relative select-none"
                          [class.bg-amber-50]="isCur"
                          [class.bg-white]="!isCur"
                          [title]="hItem.timeLabel"
                        >
                          <span
                            class="text-[11px] font-bold tracking-tight whitespace-nowrap -rotate-90"
                            [class.text-amber-900]="isCur"
                            [class.text-slate-900]="!isCur"
                          >
                            {{ formatDtekHourSlot(hItem.hour) }}
                          </span>
                        </div>
                      }
                    </div>

                    <!-- Today Data Row: Сьогодні DD.MM -->
                    <div class="flex bg-white">
                      <div class="w-32 sm:w-36 shrink-0 px-3 py-2.5 border-r border-slate-300 flex items-center text-left bg-white">
                        <span class="text-xs font-bold text-slate-950 whitespace-nowrap">
                          Сьогодні {{ formatShortDayMonth(status.scheduleDate) }}
                        </span>
                      </div>
                      @for (hItem of status.hourlySchedule; track hItem.hour) {
                        @let isCur = hItem.hour === status.currentHourNumber;
                        @let isFullPower = hItem.firstHalfPower && hItem.secondHalfPower;
                        @let isFullOutage = !hItem.firstHalfPower && !hItem.secondHalfPower;
                        @let isFirstHalfOutage = !hItem.firstHalfPower && hItem.secondHalfPower;
                        @let isSecondHalfOutage = hItem.firstHalfPower && !hItem.secondHalfPower;

                        <div
                          class="flex-1 min-w-[23px] h-12 border-r last:border-r-0 border-slate-300 relative flex items-center justify-center overflow-hidden"
                          [class.bg-white]="isFullPower"
                          [class.bg-[#d6d8db]]="isFullOutage"
                          [class.ring-2]="isCur"
                          [class.ring-inset]="isCur"
                          [class.ring-amber-400]="isCur"
                          [title]="hItem.timeLabel + ': ' + hItem.statusLabel"
                        >
                          <!-- Half-hour split background when 30 min off -->
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

                          <!-- Crossed-out lightning bolt icon -->
                          @if (isFullOutage) {
                            <svg viewBox="0 0 24 24" class="w-4 h-4 relative z-10 text-slate-900" aria-hidden="true">
                              <path d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z" fill="#1e293b" />
                              <line x1="3.5" y1="5.5" x2="20.5" y2="18.5" stroke="#1e293b" stroke-width="2.2" stroke-linecap="round" />
                            </svg>
                          }
                          @if (isFirstHalfOutage || isSecondHalfOutage) {
                            <svg viewBox="0 0 24 24" class="w-4 h-4 relative z-10" aria-hidden="true">
                              <path d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z" fill="#eab308" stroke="#1e293b" stroke-width="1.2" stroke-linejoin="round" />
                              <line x1="3.5" y1="5.5" x2="20.5" y2="18.5" stroke="#1e293b" stroke-width="2" stroke-linecap="round" />
                            </svg>
                          }
                        </div>
                      }
                    </div>
                  </div>
                </div>

                <!-- Official 4-Item Legend -->
                <div class="flex items-center justify-center gap-4 sm:gap-7 flex-wrap pt-2 text-xs text-slate-600">
                  <!-- 1. Світло є -->
                  <div class="flex items-center gap-2.5">
                    <div class="w-8 h-8 border border-slate-300 bg-white shrink-0"></div>
                    <span>Світло є</span>
                  </div>

                  <!-- 2. Світла немає -->
                  <div class="flex items-center gap-2.5">
                    <div class="w-8 h-8 border border-slate-300 bg-[#d6d8db] flex items-center justify-center shrink-0">
                      <svg viewBox="0 0 24 24" class="w-4 h-4" aria-hidden="true">
                        <path d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z" fill="#1e293b" />
                        <line x1="3.5" y1="5.5" x2="20.5" y2="18.5" stroke="#1e293b" stroke-width="2.2" stroke-linecap="round" />
                      </svg>
                    </div>
                    <span>Світла немає</span>
                  </div>

                  <!-- 3. Світла не буде перші 30 хв. -->
                  <div class="flex items-center gap-2.5">
                    <div class="w-8 h-8 border border-slate-300 relative flex items-center justify-center overflow-hidden shrink-0">
                      <div class="absolute inset-0 flex pointer-events-none">
                        <div class="w-1/2 h-full bg-[#d6d8db]"></div>
                        <div class="w-1/2 h-full bg-white"></div>
                      </div>
                      <svg viewBox="0 0 24 24" class="w-4 h-4 relative z-10" aria-hidden="true">
                        <path d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z" fill="#eab308" stroke="#1e293b" stroke-width="1.2" stroke-linejoin="round" />
                        <line x1="3.5" y1="5.5" x2="20.5" y2="18.5" stroke="#1e293b" stroke-width="2" stroke-linecap="round" />
                      </svg>
                    </div>
                    <span class="leading-tight">Світла не буде<br />перші 30 хв.</span>
                  </div>

                  <!-- 4. Світла не буде другі 30 хв. -->
                  <div class="flex items-center gap-2.5">
                    <div class="w-8 h-8 border border-slate-300 relative flex items-center justify-center overflow-hidden shrink-0">
                      <div class="absolute inset-0 flex pointer-events-none">
                        <div class="w-1/2 h-full bg-white"></div>
                        <div class="w-1/2 h-full bg-[#d6d8db]"></div>
                      </div>
                      <svg viewBox="0 0 24 24" class="w-4 h-4 relative z-10" aria-hidden="true">
                        <path d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z" fill="#eab308" stroke="#1e293b" stroke-width="1.2" stroke-linejoin="round" />
                        <line x1="3.5" y1="5.5" x2="20.5" y2="18.5" stroke="#1e293b" stroke-width="2" stroke-linecap="round" />
                      </svg>
                    </div>
                    <span class="leading-tight">Світла не буде<br />другі 30 хв.</span>
                  </div>
                </div>
              </div>
            }

            <!-- ========================================================== -->
            <!-- VARIANT 1 (DEFAULT): CLASSIC 24-HOUR GRID                  -->
            <!-- ========================================================== -->
            @default {
              <div class="grid grid-cols-6 sm:grid-cols-12 lg:grid-cols-24 gap-1 pt-1">
                @for (hItem of status.hourlySchedule; track hItem.hour) {
                  @let isCurrentHour = hItem.hour === status.currentHourNumber;
                  @let isFirstHalfNow = isCurrentHour && status.currentMinute < 30;
                  @let isSecondHalfNow = isCurrentHour && status.currentMinute >= 30;
                  <div
                    class="p-1 rounded-lg border flex flex-col items-center justify-between text-center transition-all relative group"
                    [class.bg-white]="!isCurrentHour"
                    [class.border-slate-200]="!isCurrentHour"
                    [class.ring-2]="isCurrentHour"
                    [class.ring-indigo-500]="isCurrentHour"
                    [class.border-indigo-500]="isCurrentHour"
                    [class.bg-indigo-50/40]="isCurrentHour"
                    [title]="'Сьогодні ' + hItem.timeLabel + ': ' + hItem.statusLabel + (isCurrentHour ? ' (Поточна година)' : '')"
                  >
                    <span
                      class="text-3xs font-mono font-bold leading-none mb-1"
                      [class.text-indigo-700]="isCurrentHour"
                      [class.text-slate-600]="!isCurrentHour"
                    >
                      {{ hItem.fromTime.substring(0, 2) }}
                    </span>

                    <div class="w-full h-5 rounded flex overflow-visible gap-0.5 p-0.5 bg-slate-100">
                      <div
                        class="h-full flex-1 rounded-xs transition-all"
                        [class.bg-emerald-500]="hItem.firstHalfPower"
                        [class.bg-rose-500]="!hItem.firstHalfPower"
                        [class.animate-pulse]="isFirstHalfNow"
                        [class.ring-2]="isFirstHalfNow"
                        [class.ring-slate-900]="isFirstHalfNow"
                        [class.scale-110]="isFirstHalfNow"
                        [class.z-10]="isFirstHalfNow"
                        [title]="'00-30 хв: ' + (hItem.firstHalfPower ? 'Є світло' : 'Відключено') + (isFirstHalfNow ? ' • ЗАРАЗ' : '')"
                      ></div>
                      <div
                        class="h-full flex-1 rounded-xs transition-all"
                        [class.bg-emerald-500]="hItem.secondHalfPower"
                        [class.bg-rose-500]="!hItem.secondHalfPower"
                        [class.animate-pulse]="isSecondHalfNow"
                        [class.ring-2]="isSecondHalfNow"
                        [class.ring-slate-900]="isSecondHalfNow"
                        [class.scale-110]="isSecondHalfNow"
                        [class.z-10]="isSecondHalfNow"
                        [title]="'30-60 хв: ' + (hItem.secondHalfPower ? 'Є світло' : 'Відключено') + (isSecondHalfNow ? ' • ЗАРАЗ' : '')"
                      ></div>
                    </div>

                    <span
                      class="text-4xs font-semibold leading-tight mt-1 truncate w-full"
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

      <!-- 24-Hour Schedule Timeline Grid: Next Day (Same Variant Style as Current Day from Settings) -->
      @if (status.tomorrowSchedule; as tomorrow) {
        <div class="space-y-4 pt-4 border-t border-slate-200/80">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="px-2 py-0.5 rounded-md bg-amber-500 text-white text-3xs font-bold uppercase tracking-wide">
                Наступний день
              </span>
              <h4 class="text-xs sm:text-sm font-bold text-slate-900">
                Графік на завтра, {{ tomorrow.scheduleDate }} (24 години)
              </h4>
              <span class="text-3xs text-slate-500 font-mono">Черга {{ tomorrow.queueGroup || status.queueGroup }}</span>
              <span class="text-3xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                Світло: {{ tomorrow.totalPowerHours }} год
              </span>
              <span class="text-3xs font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                Відключення: {{ tomorrow.totalOutageHours }} год
              </span>
            </div>
            <span class="text-3xs text-slate-500 font-medium">
              Стиль відображення: {{ activeOutageVariantMeta().shortName }}
            </span>
          </div>

          @switch (activeOutageVariant()) {
            <!-- VARIANT 2: LINEAR RIBBON TIMELINE (TOMORROW) -->
            @case ('v2_linear_ribbon') {
              <div class="p-4 rounded-2xl bg-slate-900 text-white space-y-4 shadow-sm">
                <div class="flex items-center justify-between flex-wrap gap-2">
                  <div class="flex items-center gap-2">
                    <mat-icon class="text-amber-400 text-base leading-none">view_timeline</mat-icon>
                    <span class="text-xs font-bold">Безперервна 24-годинна шкала на завтра ({{ tomorrow.scheduleDate }})</span>
                  </div>
                  <span class="px-2.5 py-0.5 rounded-full bg-amber-400/20 border border-amber-400/40 text-amber-300 text-3xs font-mono font-bold">
                    +{{ tomorrow.totalPowerHours }}г світла / -{{ tomorrow.totalOutageHours }}г відкл.
                  </span>
                </div>

                <div class="pt-1 pb-1">
                  <div class="grid grid-cols-24 h-11 rounded-xl overflow-hidden border-2 border-slate-700 bg-slate-950 p-0.5 gap-px">
                    @for (hItem of tomorrow.hourlySchedule; track hItem.hour) {
                      <div
                        class="flex h-full gap-px relative"
                        [title]="'Завтра (' + tomorrow.scheduleDate + ') ' + hItem.timeLabel + ': ' + hItem.statusLabel"
                      >
                        <div
                          class="flex-1 h-full transition-colors"
                          [class.bg-emerald-500]="hItem.firstHalfPower"
                          [class.bg-rose-600]="!hItem.firstHalfPower"
                        ></div>
                        <div
                          class="flex-1 h-full transition-colors"
                          [class.bg-emerald-500]="hItem.secondHalfPower"
                          [class.bg-rose-600]="!hItem.secondHalfPower"
                        ></div>
                      </div>
                    }
                  </div>

                  <div class="grid grid-cols-12 sm:grid-cols-24 mt-1.5 text-center">
                    @for (hItem of tomorrow.hourlySchedule; track hItem.hour) {
                      <span class="text-4xs font-mono font-bold text-slate-400">
                        {{ hItem.fromTime.substring(0, 2) }}
                      </span>
                    }
                  </div>
                </div>

                <div class="flex items-center gap-2 flex-wrap pt-2 border-t border-slate-800">
                  <span class="text-3xs font-bold uppercase tracking-wider text-slate-400">Інтервали завтрашньої доби:</span>
                  @for (iv of getGroupedIntervals(tomorrow.hourlySchedule, 0, 0); track iv.id) {
                    <span
                      class="px-2.5 py-1 rounded-lg text-2xs font-mono font-bold inline-flex items-center gap-1.5 border"
                      [class.bg-emerald-500/20]="iv.state === 'on'"
                      [class.border-emerald-500/40]="iv.state === 'on'"
                      [class.text-emerald-300]="iv.state === 'on'"
                      [class.bg-rose-500/25]="iv.state === 'off'"
                      [class.border-rose-500/50]="iv.state === 'off'"
                      [class.text-rose-300]="iv.state === 'off'"
                    >
                      <span>{{ iv.state === 'on' ? '⚡' : '🔌' }} {{ iv.fromTime }}–{{ iv.toTime }}</span>
                      <span class="opacity-75">({{ iv.durationHours }}г)</span>
                    </span>
                  }
                </div>
              </div>
            }

            <!-- VARIANT 3: CIRCULAR 24-HOUR RADAR / CLOCK DIAL (TOMORROW) -->
            @case ('v3_circular_radar') {
              @let tomWedges = getRadarWedges(tomorrow.hourlySchedule, 0, 0);
              @let tomIntervals = getGroupedIntervals(tomorrow.hourlySchedule, 0, 0);
              <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center p-4 rounded-2xl bg-slate-950 text-white border border-slate-800">
                <div class="lg:col-span-6 flex flex-col items-center justify-center">
                  <svg viewBox="0 0 300 300" class="w-full max-w-[310px] h-auto select-none">
                    <circle cx="150" cy="150" r="144" fill="#0f172a" stroke="#1e293b" stroke-width="2" />
                    <circle cx="150" cy="150" r="52" fill="#020617" stroke="#334155" stroke-width="1.5" />

                    @for (w of tomWedges; track w.index) {
                      <path
                        [attr.d]="w.pathD"
                        [attr.fill]="w.hasPower ? '#10b981' : '#e11d48'"
                        stroke="#020617"
                        stroke-width="0.8"
                        class="transition-opacity hover:opacity-85"
                      >
                        <title>Завтра {{ w.timeRange }}: {{ w.hasPower ? 'Світло є' : 'Відключення' }}</title>
                      </path>
                      @if (w.hourLabel !== undefined) {
                        <text
                          [attr.x]="w.labelX"
                          [attr.y]="w.labelY"
                          text-anchor="middle"
                          dominant-baseline="central"
                          class="text-[8px] font-mono font-bold fill-slate-400"
                        >
                          {{ w.hourLabel }}
                        </text>
                      }
                    }

                    <text x="150" y="136" text-anchor="middle" class="fill-slate-400 text-[8px] font-bold uppercase">
                      Черга {{ tomorrow.queueGroup || status.queueGroup }}
                    </text>
                    <text x="150" y="153" text-anchor="middle" class="text-[12px] font-black fill-amber-400">
                      ЗАВТРА
                    </text>
                    <text x="150" y="169" text-anchor="middle" class="fill-emerald-400 text-[9px] font-mono font-bold">
                      +{{ tomorrow.totalPowerHours }}г / -{{ tomorrow.totalOutageHours }}г
                    </text>
                  </svg>
                </div>

                <div class="lg:col-span-6 space-y-3">
                  <div class="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <div>
                      <div class="text-xs font-bold text-amber-400 uppercase tracking-wider">24-годинний радар на завтра</div>
                      <div class="text-sm font-black text-white">Хронологія чергування фаз світла</div>
                    </div>
                    <span class="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono font-bold text-slate-200">
                      {{ tomorrow.scheduleDate }}
                    </span>
                  </div>

                  <div class="space-y-2 max-h-64 overflow-y-auto pr-1">
                    @for (iv of tomIntervals; track iv.id) {
                      <div
                        class="p-2.5 rounded-xl border flex items-center justify-between gap-3"
                        [class.bg-emerald-950/60]="iv.state === 'on'"
                        [class.border-emerald-500/40]="iv.state === 'on'"
                        [class.bg-rose-950/60]="iv.state === 'off'"
                        [class.border-rose-500/40]="iv.state === 'off'"
                      >
                        <div class="flex items-center gap-2.5">
                          <span
                            class="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-xs"
                            [class.bg-emerald-600]="iv.state === 'on'"
                            [class.bg-rose-600]="iv.state === 'off'"
                          >
                            <mat-icon class="text-base leading-none">{{ iv.state === 'on' ? 'bolt' : 'power_off' }}</mat-icon>
                          </span>
                          <div>
                            <div class="text-xs font-mono font-extrabold text-white">
                              {{ iv.fromTime }} – {{ iv.toTime }}
                            </div>
                            <div class="text-2xs" [class.text-emerald-300]="iv.state === 'on'" [class.text-rose-300]="iv.state === 'off'">
                              {{ iv.state === 'on' ? 'Електропостачання за графіком' : 'Стабілізаційне відключення' }}
                            </div>
                          </div>
                        </div>
                        <span class="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 font-mono text-xs font-black text-white shrink-0">
                          {{ iv.durationHours }} год
                        </span>
                      </div>
                    }
                  </div>
                </div>
              </div>
            }

            <!-- VARIANT 4: 4 SHIFT QUADRANTS (TOMORROW) -->
            @case ('v4_shift_quadrants') {
              @let tomShifts = getShiftQuadrants(tomorrow.hourlySchedule, 0);
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                @for (sh of tomShifts; track sh.id) {
                  <div [class]="'p-4 rounded-2xl border bg-gradient-to-br space-y-3 transition-all ' + sh.accentClass">
                    <div class="flex items-center justify-between gap-2">
                      <div class="flex items-center gap-2.5">
                        <div class="w-9 h-9 rounded-xl bg-black/15 flex items-center justify-center">
                          <mat-icon class="text-lg leading-none">{{ sh.icon }}</mat-icon>
                        </div>
                        <div>
                          <div class="text-xs sm:text-sm font-black">{{ sh.title }}</div>
                          <div class="text-2xs font-mono opacity-80">{{ sh.timeRange }} (6 годин)</div>
                        </div>
                      </div>

                      <div class="flex items-center gap-1.5 text-2xs font-mono font-bold">
                        <span class="px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-600 border border-emerald-500/30">
                          ⚡ {{ sh.powerHours }}г
                        </span>
                        <span class="px-2 py-0.5 rounded-lg bg-rose-500/20 text-rose-500 border border-rose-500/30">
                          🔌 {{ sh.outageHours }}г
                        </span>
                      </div>
                    </div>

                    <div class="grid grid-cols-6 gap-1.5">
                      @for (hItem of sh.hours; track hItem.hour) {
                        <div class="p-2 rounded-xl border border-slate-200 bg-white/95 text-slate-900 flex flex-col items-center gap-1 shadow-2xs">
                          <span class="text-2xs font-mono font-black">{{ hItem.fromTime.substring(0, 2) }}:00</span>
                          <div class="w-full h-4 rounded flex overflow-hidden gap-0.5 p-0.5 bg-slate-100">
                            <div class="flex-1 h-full rounded-xs" [class.bg-emerald-500]="hItem.firstHalfPower" [class.bg-rose-500]="!hItem.firstHalfPower"></div>
                            <div class="flex-1 h-full rounded-xs" [class.bg-emerald-500]="hItem.secondHalfPower" [class.bg-rose-500]="!hItem.secondHalfPower"></div>
                          </div>
                          <span
                            class="text-4xs font-extrabold uppercase"
                            [class.text-emerald-700]="hItem.firstHalfPower && hItem.secondHalfPower"
                            [class.text-rose-700]="!hItem.firstHalfPower && !hItem.secondHalfPower"
                            [class.text-amber-700]="hItem.firstHalfPower !== hItem.secondHalfPower"
                          >
                            {{ hItem.statusKey === 'yes' ? 'Світло' : (hItem.statusKey === 'no' ? 'Відкл.' : '30 хв') }}
                          </span>
                        </div>
                      }
                    </div>
                  </div>
                }
              </div>
            }

            <!-- VARIANT 5: CHRONOLOGICAL INTERVAL CARDS (TOMORROW) -->
            @case ('v5_interval_cards') {
              @let tomIntervals = getGroupedIntervals(tomorrow.hourlySchedule, 0, 0);
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                @for (iv of tomIntervals; track iv.id; let idx = $index) {
                  <div
                    class="p-4 rounded-2xl border flex flex-col justify-between gap-3 transition-all"
                    [class.bg-emerald-50/70]="iv.state === 'on'"
                    [class.border-emerald-300]="iv.state === 'on'"
                    [class.bg-rose-50/80]="iv.state === 'off'"
                    [class.border-rose-300]="iv.state === 'off'"
                  >
                    <div class="flex items-start justify-between gap-2">
                      <div class="flex items-center gap-2.5">
                        <div
                          class="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold shadow-2xs shrink-0"
                          [class.bg-emerald-600]="iv.state === 'on'"
                          [class.bg-rose-600]="iv.state === 'off'"
                        >
                          <mat-icon>{{ iv.state === 'on' ? 'lightbulb' : 'power_off' }}</mat-icon>
                        </div>
                        <div>
                          <div class="text-sm sm:text-base font-black font-mono text-slate-900">
                            {{ iv.fromTime }} – {{ iv.toTime }}
                          </div>
                          <div
                            class="text-xs font-bold mt-0.5"
                            [class.text-emerald-800]="iv.state === 'on'"
                            [class.text-rose-800]="iv.state === 'off'"
                          >
                            {{ iv.state === 'on' ? '⚡ Період зі світлом' : '🔌 Стабілізаційне відключення' }}
                          </div>
                        </div>
                      </div>

                      <span
                        class="px-2.5 py-1 rounded-xl font-mono text-xs font-black border shrink-0"
                        [class.bg-emerald-600]="iv.state === 'on'"
                        [class.text-white]="iv.state === 'on'"
                        [class.border-emerald-700]="iv.state === 'on'"
                        [class.bg-rose-600]="iv.state === 'off'"
                        [class.text-white]="iv.state === 'off'"
                        [class.border-rose-700]="iv.state === 'off'"
                      >
                        {{ iv.durationHours }} год
                      </span>
                    </div>

                    <div class="space-y-1">
                      <div class="flex items-center justify-between text-3xs font-semibold text-slate-600">
                        <span>Блок #{{ idx + 1 }} (Завтра)</span>
                        <span>Частка доби: {{ ((iv.durationHours / 24) * 100).toFixed(0) }}%</span>
                      </div>
                      <div class="w-full h-2 rounded-full bg-white/80 overflow-hidden border border-slate-200/80">
                        <div
                          class="h-full rounded-full"
                          [class.bg-emerald-500]="iv.state === 'on'"
                          [class.bg-rose-500]="iv.state === 'off'"
                          [style.width.%]="(iv.durationHours / 24) * 100"
                        ></div>
                      </div>
                    </div>
                  </div>
                }
              </div>
            }

            <!-- VARIANT 6: MATRIX 4x6 (TOMORROW) -->
            @case ('v6_matrix_4x6') {
              @let tomRows4x6 = getMatrix4x6Rows(tomorrow.hourlySchedule);
              <div class="space-y-2.5">
                @for (row of tomRows4x6; track $index) {
                  <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                    @for (hItem of row; track hItem.hour) {
                      <div
                        class="p-3 rounded-2xl border flex flex-col justify-between gap-2 transition-all"
                        [class.bg-emerald-50/70]="hItem.firstHalfPower && hItem.secondHalfPower"
                        [class.border-emerald-300]="hItem.firstHalfPower && hItem.secondHalfPower"
                        [class.bg-rose-50/80]="!hItem.firstHalfPower && !hItem.secondHalfPower"
                        [class.border-rose-300]="!hItem.firstHalfPower && !hItem.secondHalfPower"
                        [class.bg-amber-50/80]="hItem.firstHalfPower !== hItem.secondHalfPower"
                        [class.border-amber-300]="hItem.firstHalfPower !== hItem.secondHalfPower"
                      >
                        <div class="flex items-center justify-between gap-1">
                          <span class="text-xs font-mono font-black text-slate-900">
                            {{ hItem.timeLabel }}
                          </span>
                        </div>

                        <div class="grid grid-cols-2 gap-1.5">
                          <div
                            class="p-1.5 rounded-lg text-center border text-4xs font-bold text-white"
                            [class.bg-emerald-500]="hItem.firstHalfPower"
                            [class.border-emerald-600]="hItem.firstHalfPower"
                            [class.bg-rose-600]="!hItem.firstHalfPower"
                            [class.border-rose-700]="!hItem.firstHalfPower"
                          >
                            00–30: {{ hItem.firstHalfPower ? 'Є' : 'Ні' }}
                          </div>
                          <div
                            class="p-1.5 rounded-lg text-center border text-4xs font-bold text-white"
                            [class.bg-emerald-500]="hItem.secondHalfPower"
                            [class.border-emerald-600]="hItem.secondHalfPower"
                            [class.bg-rose-600]="!hItem.secondHalfPower"
                            [class.border-rose-700]="!hItem.secondHalfPower"
                          >
                            30–60: {{ hItem.secondHalfPower ? 'Є' : 'Ні' }}
                          </div>
                        </div>

                        <div class="flex items-center justify-between text-3xs font-bold pt-1 border-t border-black/5">
                          <span
                            [class.text-emerald-900]="hItem.firstHalfPower && hItem.secondHalfPower"
                            [class.text-rose-900]="!hItem.firstHalfPower && !hItem.secondHalfPower"
                            [class.text-amber-900]="hItem.firstHalfPower !== hItem.secondHalfPower"
                          >
                            {{ hItem.statusLabel }}
                          </span>
                          <span class="font-mono text-slate-500">
                            {{ isNightTariffHour(hItem.hour) ? '🌙 Ніч' : '☀️ День' }}
                          </span>
                        </div>
                      </div>
                    }
                  </div>
                }
              </div>
            }

            <!-- VARIANT 7: COMPACT HOURLY SCHEDULE TABLE (TOMORROW) -->
            @case ('v7_compact_table') {
              <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                <table class="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr class="bg-slate-900 text-white text-3xs uppercase tracking-wider font-bold">
                      <th class="py-2.5 px-3">Година доби ({{ tomorrow.scheduleDate }})</th>
                      <th class="py-2.5 px-3">00 – 30 хв</th>
                      <th class="py-2.5 px-3">30 – 60 хв</th>
                      <th class="py-2.5 px-3">Статус завтра</th>
                      <th class="py-2.5 px-3">Тарифна зона</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100">
                    @for (hItem of tomorrow.hourlySchedule; track hItem.hour) {
                      <tr class="hover:bg-slate-50 transition-colors">
                        <td class="py-2 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                          {{ hItem.timeLabel }}
                        </td>
                        <td class="py-2 px-3 whitespace-nowrap">
                          <span
                            class="px-2 py-0.5 rounded-md text-3xs font-bold inline-flex items-center gap-1"
                            [class.bg-emerald-100]="hItem.firstHalfPower"
                            [class.text-emerald-900]="hItem.firstHalfPower"
                            [class.bg-rose-100]="!hItem.firstHalfPower"
                            [class.text-rose-900]="!hItem.firstHalfPower"
                          >
                            {{ hItem.firstHalfPower ? '⚡ Світло є' : '🔌 Відключено' }}
                          </span>
                        </td>
                        <td class="py-2 px-3 whitespace-nowrap">
                          <span
                            class="px-2 py-0.5 rounded-md text-3xs font-bold inline-flex items-center gap-1"
                            [class.bg-emerald-100]="hItem.secondHalfPower"
                            [class.text-emerald-900]="hItem.secondHalfPower"
                            [class.bg-rose-100]="!hItem.secondHalfPower"
                            [class.text-rose-900]="!hItem.secondHalfPower"
                          >
                            {{ hItem.secondHalfPower ? '⚡ Світло є' : '🔌 Відключено' }}
                          </span>
                        </td>
                        <td class="py-2 px-3 font-semibold text-slate-800">
                          {{ hItem.statusLabel }}
                        </td>
                        <td class="py-2 px-3 whitespace-nowrap">
                          @if (isNightTariffHour(hItem.hour)) {
                            <span class="px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 text-3xs font-bold">
                              🌙 Нічний (0.5x)
                            </span>
                          } @else {
                            <span class="px-2 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200 text-3xs font-bold">
                              ☀️ Денний (1.0x)
                            </span>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }

            <!-- VARIANT 8: CYBER SCADA TELEMETRY MONITOR (TOMORROW) -->
            @case ('v8_cyber_scada') {
              @let tomPolyPoints = getScadaOscillogramPoints(tomorrow.hourlySchedule);
              <div class="p-5 rounded-2xl bg-slate-950 text-emerald-400 border-2 border-slate-800 font-mono space-y-4 shadow-lg">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
                  <div class="flex items-center gap-2.5">
                    <span class="w-3 h-3 rounded-full bg-amber-400"></span>
                    <span class="text-xs sm:text-sm font-black tracking-wider uppercase text-white">
                      SCADA ЗАВТРА // ЧЕРГА {{ tomorrow.queueGroup || status.queueGroup }} // {{ tomorrow.scheduleDate }}
                    </span>
                  </div>
                  <div class="flex items-center gap-3 text-2xs">
                    <span class="px-2 py-0.5 rounded bg-slate-900 border border-emerald-500/40 text-emerald-300">
                      UPTIME: {{ ((tomorrow.totalPowerHours / 24) * 100).toFixed(1) }}%
                    </span>
                    <span class="px-2 py-0.5 rounded bg-slate-900 border border-rose-500/40 text-rose-400">
                      OUTAGE: {{ tomorrow.totalOutageHours }}H
                    </span>
                  </div>
                </div>

                <div class="p-3 rounded-xl bg-black/70 border border-slate-800/90 space-y-1.5">
                  <div class="flex items-center justify-between text-3xs text-slate-400">
                    <span>ОСЦИЛОГРАМА НАПРУГИ НА ЗАВТРА (24 ГОДИНИ • 48 ВІДЛІКІВ)</span>
                    <span class="text-emerald-400">HIGH = 230V ON • LOW = 0V OFF</span>
                  </div>
                  <div class="w-full overflow-x-auto">
                    <svg viewBox="0 0 720 82" class="w-full min-w-[520px] h-20">
                      <line x1="0" y1="18" x2="720" y2="18" stroke="#064e3b" stroke-dasharray="3 3" stroke-width="1" />
                      <line x1="0" y1="62" x2="720" y2="62" stroke="#4c0519" stroke-dasharray="3 3" stroke-width="1" />
                      <polyline
                        fill="none"
                        stroke="#10b981"
                        stroke-width="3"
                        [attr.points]="tomPolyPoints"
                      />
                    </svg>
                  </div>
                </div>

                <div class="grid grid-cols-6 sm:grid-cols-12 lg:grid-cols-24 gap-1.5">
                  @for (hItem of tomorrow.hourlySchedule; track hItem.hour) {
                    <div class="p-1.5 rounded-lg border border-slate-800 flex flex-col items-center gap-1 bg-slate-900/90">
                      <span class="text-3xs font-bold text-slate-400">
                        {{ hItem.fromTime.substring(0, 2) }}
                      </span>
                      <div class="w-full flex gap-0.5 h-4">
                        <div
                          class="flex-1 rounded-xs"
                          [class.bg-emerald-400]="hItem.firstHalfPower"
                          [class.shadow-[0_0_8px_#34d399]]="hItem.firstHalfPower"
                          [class.bg-rose-600]="!hItem.firstHalfPower"
                        ></div>
                        <div
                          class="flex-1 rounded-xs"
                          [class.bg-emerald-400]="hItem.secondHalfPower"
                          [class.shadow-[0_0_8px_#34d399]]="hItem.secondHalfPower"
                          [class.bg-rose-600]="!hItem.secondHalfPower"
                        ></div>
                      </div>
                      <span
                        class="text-4xs font-bold"
                        [class.text-emerald-400]="hItem.firstHalfPower && hItem.secondHalfPower"
                        [class.text-rose-400]="!hItem.firstHalfPower && !hItem.secondHalfPower"
                        [class.text-amber-300]="hItem.firstHalfPower !== hItem.secondHalfPower"
                      >
                        {{ hItem.statusKey === 'yes' ? 'ON' : (hItem.statusKey === 'no' ? 'OFF' : '50%') }}
                      </span>
                    </div>
                  }
                </div>
              </div>
            }

            <!-- VARIANT 10: MINIMAL PILLS (TOMORROW) -->
            @case ('v10_minimal_pills') {
              <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2 pt-1">
                @for (hItem of tomorrow.hourlySchedule; track hItem.hour) {
                  @let isFullPower = hItem.firstHalfPower && hItem.secondHalfPower;
                  @let isFullOutage = !hItem.firstHalfPower && !hItem.secondHalfPower;
                  @let isMixed = !isFullPower && !isFullOutage;

                  <div
                    class="h-9 px-2.5 rounded-full border text-xs font-mono font-bold flex items-center justify-center transition-all select-none w-full shadow-2xs relative overflow-hidden"
                    [class.bg-emerald-500]="isFullPower"
                    [class.border-emerald-600]="isFullPower"
                    [class.bg-rose-600]="isFullOutage"
                    [class.border-rose-700]="isFullOutage"
                    [class.border-amber-500]="isMixed"
                    [title]="'Завтра (' + tomorrow.scheduleDate + ') ' + hItem.timeLabel + ': ' + hItem.statusLabel"
                  >
                    @if (isMixed) {
                      <div class="absolute inset-0 flex pointer-events-none">
                        <div
                          class="w-1/2 h-full border-r border-black/10"
                          [class.bg-emerald-500]="hItem.firstHalfPower"
                          [class.bg-rose-600]="!hItem.firstHalfPower"
                        ></div>
                        <div
                          class="w-1/2 h-full"
                          [class.bg-emerald-500]="hItem.secondHalfPower"
                          [class.bg-rose-600]="!hItem.secondHalfPower"
                        ></div>
                      </div>
                    }
                    <span
                      class="relative z-10 text-white leading-none tracking-tight drop-shadow-xs"
                    >
                      {{ hItem.fromTime }}–{{ hItem.toTime }}
                    </span>
                  </div>
                }
              </div>
            }

            <!-- VARIANT 1 & 9 (DEFAULT): CLASSIC 24-HOUR GRID (TOMORROW) -->
            @default {
              <div class="grid grid-cols-6 sm:grid-cols-12 lg:grid-cols-24 gap-1 pt-1">
                @for (hItem of tomorrow.hourlySchedule; track hItem.hour) {
                  <div
                    class="p-1 rounded-lg border border-slate-200 bg-white flex flex-col items-center justify-between text-center transition-all relative group"
                    [title]="'Завтра (' + tomorrow.scheduleDate + ') ' + hItem.timeLabel + ': ' + hItem.statusLabel"
                  >
                    <span class="text-3xs font-mono font-bold leading-none mb-1 text-slate-600">
                      {{ hItem.fromTime.substring(0, 2) }}
                    </span>

                    <div class="w-full h-5 rounded flex overflow-visible gap-0.5 p-0.5 bg-slate-100">
                      <div
                        class="h-full flex-1 rounded-xs transition-all"
                        [class.bg-emerald-500]="hItem.firstHalfPower"
                        [class.bg-rose-500]="!hItem.firstHalfPower"
                        [title]="'00-30 хв: ' + (hItem.firstHalfPower ? 'Є світло' : 'Відключено')"
                      ></div>
                      <div
                        class="h-full flex-1 rounded-xs transition-all"
                        [class.bg-emerald-500]="hItem.secondHalfPower"
                        [class.bg-rose-500]="!hItem.secondHalfPower"
                        [title]="'30-60 хв: ' + (hItem.secondHalfPower ? 'Є світло' : 'Відключено')"
                      ></div>
                    </div>

                    <span
                      class="text-4xs font-semibold leading-tight mt-1 truncate w-full"
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

            <!-- VARIANT 11: OFFICIAL DTEK ODESA GRIDS SHEET (TOMORROW) -->
            @case ('v11_dtek_official_sheet') {
              <div class="p-4 sm:p-6 rounded-2xl bg-white border border-slate-200 shadow-xs text-slate-950 space-y-4">
                <div class="flex items-center justify-between gap-2 flex-wrap">
                  <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FFE600] text-slate-950 font-extrabold text-xs sm:text-sm">
                    <span>Черга {{ formatQueueNumber(status.queueGroup) }} • Завтра {{ formatShortDayMonth(tomorrow.scheduleDate) }}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      (click)="shareScheduleAsImage('tomorrow')"
                      class="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-2xs font-bold inline-flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <mat-icon class="text-xs text-amber-400 leading-none">share</mat-icon>
                      <span>Поділитися графіком на завтра</span>
                    </button>
                  </div>
                </div>

                <div class="overflow-x-auto pb-1">
                  <div class="min-w-[700px] border border-slate-300 rounded-xl overflow-hidden bg-white">
                    <div class="flex border-b border-slate-300 bg-white">
                      <div class="w-32 sm:w-36 shrink-0 px-3 py-2 border-r border-slate-300 flex flex-col justify-center text-left bg-white">
                        <span class="text-xs font-bold text-slate-900 leading-tight">Часові</span>
                        <span class="text-xs font-bold text-slate-900 leading-tight">проміжки</span>
                      </div>
                      @for (hItem of tomorrow.hourlySchedule; track hItem.hour) {
                        <div class="flex-1 min-w-[23px] h-16 border-r last:border-r-0 border-slate-300 flex items-center justify-center bg-white select-none">
                          <span class="text-[11px] font-bold text-slate-900 tracking-tight whitespace-nowrap -rotate-90">
                            {{ formatDtekHourSlot(hItem.hour) }}
                          </span>
                        </div>
                      }
                    </div>

                    <div class="flex bg-white">
                      <div class="w-32 sm:w-36 shrink-0 px-3 py-2.5 border-r border-slate-300 flex items-center text-left bg-white">
                        <span class="text-xs font-bold text-slate-950 whitespace-nowrap">
                          Завтра {{ formatShortDayMonth(tomorrow.scheduleDate) }}
                        </span>
                      </div>
                      @for (hItem of tomorrow.hourlySchedule; track hItem.hour) {
                        @let isFullPower = hItem.firstHalfPower && hItem.secondHalfPower;
                        @let isFullOutage = !hItem.firstHalfPower && !hItem.secondHalfPower;
                        @let isFirstHalfOutage = !hItem.firstHalfPower && hItem.secondHalfPower;
                        @let isSecondHalfOutage = hItem.firstHalfPower && !hItem.secondHalfPower;

                        <div
                          class="flex-1 min-w-[23px] h-12 border-r last:border-r-0 border-slate-300 relative flex items-center justify-center overflow-hidden"
                          [class.bg-white]="isFullPower"
                          [class.bg-[#d6d8db]]="isFullOutage"
                          [title]="'Завтра (' + tomorrow.scheduleDate + ') ' + hItem.timeLabel + ': ' + hItem.statusLabel"
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
                            <svg viewBox="0 0 24 24" class="w-4 h-4 relative z-10" aria-hidden="true">
                              <path d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z" fill="#1e293b" />
                              <line x1="3.5" y1="5.5" x2="20.5" y2="18.5" stroke="#1e293b" stroke-width="2.2" stroke-linecap="round" />
                            </svg>
                          }
                          @if (isFirstHalfOutage || isSecondHalfOutage) {
                            <svg viewBox="0 0 24 24" class="w-4 h-4 relative z-10" aria-hidden="true">
                              <path d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z" fill="#eab308" stroke="#1e293b" stroke-width="1.2" stroke-linejoin="round" />
                              <line x1="3.5" y1="5.5" x2="20.5" y2="18.5" stroke="#1e293b" stroke-width="2" stroke-linecap="round" />
                            </svg>
                          }
                        </div>
                      }
                    </div>
                  </div>
                </div>
              </div>
            }
          }
        </div>
      }

      <!-- ================================================================ -->
      <!-- SHARE SCHEDULE IMAGE MODAL (PNG PREVIEW + WEB SHARE / COPY / DL) -->
      <!-- ================================================================ -->
      @if (shareModalOpen()) {
        <div
          class="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5"
          (click)="closeShareModal()"
        >
          <div
            class="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-4xl w-full overflow-hidden flex flex-col max-h-[92vh]"
            (click)="$event.stopPropagation()"
          >
            <!-- Modal Header -->
            <div class="px-4 sm:px-6 py-3.5 bg-slate-900 text-white flex items-center justify-between gap-3">
              <div class="flex items-center gap-2.5">
                <div class="w-8 h-8 rounded-lg bg-[#FFE600] text-slate-950 flex items-center justify-center shrink-0">
                  <mat-icon class="text-base leading-none">share</mat-icon>
                </div>
                <div>
                  <h3 class="text-sm sm:text-base font-extrabold leading-tight">
                    Поділитися графіком відключень ({{ activeOutageVariantMeta().shortName }})
                  </h3>
                  <p class="text-2xs text-slate-300">
                    Поточний вигляд: {{ activeOutageVariantMeta().name }} — готово до надсилання у Telegram, Viber або інший месенджер
                  </p>
                </div>
              </div>
              <button
                type="button"
                (click)="closeShareModal()"
                class="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer transition-colors"
                aria-label="Закрити"
              >
                <mat-icon class="text-base leading-none">close</mat-icon>
              </button>
            </div>

            <!-- Day Mode Selector (Today / Tomorrow / Both) -->
            @if (status.tomorrowSchedule && status.tomorrowSchedule.hourlySchedule.length > 0) {
              <div class="px-4 sm:px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
                <span class="text-xs font-bold text-slate-700">Які дні включити на картинку:</span>
                <div class="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    (click)="switchShareMode('today')"
                    class="px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border"
                    [class.bg-slate-900]="shareMode() === 'today'"
                    [class.text-white]="shareMode() === 'today'"
                    [class.border-slate-900]="shareMode() === 'today'"
                    [class.bg-white]="shareMode() !== 'today'"
                    [class.text-slate-700]="shareMode() !== 'today'"
                    [class.border-slate-200]="shareMode() !== 'today'"
                  >
                    Сьогодні ({{ formatShortDayMonth(status.scheduleDate) }})
                  </button>
                  <button
                    type="button"
                    (click)="switchShareMode('tomorrow')"
                    class="px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border"
                    [class.bg-slate-900]="shareMode() === 'tomorrow'"
                    [class.text-white]="shareMode() === 'tomorrow'"
                    [class.border-slate-900]="shareMode() === 'tomorrow'"
                    [class.bg-white]="shareMode() !== 'tomorrow'"
                    [class.text-slate-700]="shareMode() !== 'tomorrow'"
                    [class.border-slate-200]="shareMode() !== 'tomorrow'"
                  >
                    Завтра ({{ formatShortDayMonth(status.tomorrowSchedule.scheduleDate) }})
                  </button>
                  <button
                    type="button"
                    (click)="switchShareMode('both')"
                    class="px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border"
                    [class.bg-slate-900]="shareMode() === 'both'"
                    [class.text-white]="shareMode() === 'both'"
                    [class.border-slate-900]="shareMode() === 'both'"
                    [class.bg-white]="shareMode() !== 'both'"
                    [class.text-slate-700]="shareMode() !== 'both'"
                    [class.border-slate-200]="shareMode() !== 'both'"
                  >
                    Сьогодні + Завтра
                  </button>
                </div>
              </div>
            }

            <!-- Generated Image Preview -->
            <div class="p-4 sm:p-6 bg-slate-100 overflow-y-auto flex-1 flex flex-col items-center justify-center gap-3">
              @if (sharePreviewDataUrl()) {
                <div class="rounded-xl overflow-hidden border border-slate-300 shadow-sm bg-white max-w-full">
                  <img
                    [src]="sharePreviewDataUrl()"
                    alt="Графік відключень ДТЕК"
                    class="w-full h-auto block max-h-[55vh] object-contain"
                  />
                </div>
              }
              @if (shareFeedbackMessage()) {
                <div class="px-3.5 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2">
                  <mat-icon class="text-sm text-emerald-600 leading-none">check_circle</mat-icon>
                  <span>{{ shareFeedbackMessage() }}</span>
                </div>
              }
            </div>

            <!-- Action Buttons Footer -->
            <div class="px-4 sm:px-6 py-3.5 bg-white border-t border-slate-200 flex items-center justify-between flex-wrap gap-2.5">
              <div class="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  (click)="triggerNativeShareFromModal()"
                  class="px-4 py-2.5 rounded-xl bg-[#FFE600] hover:bg-amber-400 text-slate-950 text-xs font-extrabold inline-flex items-center gap-2 transition-all cursor-pointer shadow-xs border border-amber-400"
                >
                  <mat-icon class="text-base leading-none">send</mat-icon>
                  <span>Надіслати у вибраний застосунок</span>
                </button>

                <button
                  type="button"
                  (click)="copyScheduleImageToClipboard()"
                  class="px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <mat-icon class="text-base text-amber-400 leading-none">content_copy</mat-icon>
                  <span>Скопіювати картинку</span>
                </button>

                <button
                  type="button"
                  (click)="downloadScheduleImageFromModal()"
                  class="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold inline-flex items-center gap-1.5 transition-all cursor-pointer border border-slate-200"
                >
                  <mat-icon class="text-base leading-none">download</mat-icon>
                  <span>Завантажити PNG</span>
                </button>
              </div>

              <button
                type="button"
                (click)="closeShareModal()"
                class="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Закрити
              </button>
            </div>
          </div>
        </div>
      }
    }
  `,
})
export class OutageScheduleVariantsComponent {
  private readonly dataService = inject(IptvData);

  readonly status = input.required<DtekAddressScheduleStatus>();
  readonly kyivTime = input<string>('');
  readonly lastUpdated = input<string>('');
  readonly lastDtekFetchAt = input<string>('');
  readonly minutesUntilNextRefresh = input<number>(0);
  readonly isRefreshing = input<boolean>(false);
  readonly refresh = output<void>();

  readonly outageScheduleVariants = OUTAGE_SCHEDULE_VARIANTS;
  readonly activeOutageVariant = this.dataService.outageScheduleViewVariant;
  readonly dtekSyncIntervalMinutes = this.dataService.dtekSyncIntervalMinutes;

  // Background Web Push Notification state for Schedule Changes
  readonly isPushSubscribed = this.dataService.isPushSubscribed;
  readonly isPushLoading = this.dataService.isPushLoading;
  readonly pushStatusMessage = this.dataService.pushStatusMessage;
  readonly pushCountdownSeconds = this.dataService.pushCountdownSeconds;

  enableSchedulePushNotifications(): void {
    void this.dataService.enableWebPushNotifications();
  }

  disableSchedulePushNotifications(): void {
    void this.dataService.disableWebPushNotifications();
  }

  testSchedulePushNotifications(): void {
    void this.dataService.triggerDelayedWebPushTest(5, true);
  }

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

  // =========================================================================
  // SHARE SCHEDULE AS PNG IMAGE (RENDERS ACTIVE VIEW VARIANT 1..11)
  // =========================================================================
  readonly shareModalOpen = signal<boolean>(false);
  readonly shareMode = signal<'today' | 'tomorrow' | 'both'>('today');
  readonly sharePreviewDataUrl = signal<string>('');
  readonly shareFeedbackMessage = signal<string>('');

  formatQueueNumber(queueGroup: string): string {
    if (!queueGroup) return '—';
    return queueGroup.replace(/^Черга\s+/i, '').trim() || queueGroup;
  }

  formatDtekHourSlot(hour: number): string {
    const start = String(Math.max(0, hour - 1)).padStart(2, '0');
    const end = String(Math.max(1, hour)).padStart(2, '0');
    return `${start}-${end}`;
  }

  formatShortDayMonth(dateStr: string): string {
    if (!dateStr) return '';
    const trimmed = dateStr.trim();
    const parts = trimmed.split('.');
    if (parts.length >= 2) {
      return `${parts[0]}.${parts[1]}`;
    }
    return trimmed;
  }

  closeShareModal(): void {
    this.shareModalOpen.set(false);
    this.shareFeedbackMessage.set('');
  }

  switchShareMode(mode: 'today' | 'tomorrow' | 'both'): void {
    this.shareMode.set(mode);
    const st = this.status();
    if (!st) return;
    const dataUrl = this.renderActiveVariantScheduleDataUrl(st, mode);
    this.sharePreviewDataUrl.set(dataUrl);
    this.shareFeedbackMessage.set('');
  }

  shareScheduleAsImage(initialMode: 'today' | 'tomorrow' | 'both' = 'today'): void {
    const st = this.status();
    if (!st) return;

    this.shareMode.set(initialMode);
    const dataUrl = this.renderActiveVariantScheduleDataUrl(st, initialMode);
    this.sharePreviewDataUrl.set(dataUrl);
    this.shareFeedbackMessage.set('');
    this.shareModalOpen.set(true);

    // Immediately invoke native Web Share API within user gesture if file sharing is supported
    this.invokeWebShareWithDataUrl(dataUrl, st, initialMode, true);
  }

  triggerNativeShareFromModal(): void {
    const st = this.status();
    const dataUrl = this.sharePreviewDataUrl();
    if (!st || !dataUrl) return;
    this.invokeWebShareWithDataUrl(dataUrl, st, this.shareMode(), false);
  }

  private invokeWebShareWithDataUrl(
    dataUrl: string,
    st: DtekAddressScheduleStatus,
    mode: 'today' | 'tomorrow' | 'both',
    silentFallback: boolean
  ): void {
    try {
      const file = this.dataUrlToPngFile(dataUrl, this.buildShareFileName(st, mode));
      const queueNum = this.formatQueueNumber(st.queueGroup);
      const dateLabel =
        mode === 'tomorrow' && st.tomorrowSchedule
          ? st.tomorrowSchedule.scheduleDate
          : st.scheduleDate;
      const shareTitle = `Графік відключень ДТЕК — Черга ${queueNum}`;
      const shareText = `Графік відключень світла ДТЕК (Черга ${queueNum}) на ${dateLabel} (${this.activeOutageVariantMeta().shortName})`;

      const nav = typeof navigator !== 'undefined' ? navigator : null;
      if (nav && typeof nav.share === 'function') {
        const canShareFiles =
          typeof nav.canShare === 'function' ? nav.canShare({ files: [file] }) : true;
        if (canShareFiles) {
          nav
            .share({
              files: [file],
              title: shareTitle,
              text: shareText,
            })
            .then(() => {
              this.shareFeedbackMessage.set('Зображення графіку надіслано у вибраний застосунок.');
            })
            .catch((err: unknown) => {
              const msg = err instanceof Error ? err.message : String(err);
              if (!msg.toLowerCase().includes('abort')) {
                if (!silentFallback) {
                  this.shareFeedbackMessage.set(
                    'Системне меню поширення недоступне у цьому вікні — скористайтеся кнопками «Скопіювати картинку» або «Завантажити PNG».'
                  );
                }
              }
            });
          return;
        }
      }

      if (!silentFallback) {
        this.shareFeedbackMessage.set(
          'Ваш браузер не підтримує пряму передачу файлу через Web Share — зображення можна скопіювати в буфер або завантажити як PNG.'
        );
      }
    } catch {
      if (!silentFallback) {
        this.shareFeedbackMessage.set('Використайте кнопку «Скопіювати картинку» або «Завантажити PNG».');
      }
    }
  }

  async copyScheduleImageToClipboard(): Promise<void> {
    const dataUrl = this.sharePreviewDataUrl();
    if (!dataUrl) return;
    try {
      const file = this.dataUrlToPngFile(dataUrl, 'dtek-schedule.png');
      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        typeof ClipboardItem !== 'undefined'
      ) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'image/png': file,
          }),
        ]);
        this.shareFeedbackMessage.set('Зображення скопійовано в буфер обміну! Вставте його (Ctrl+V) у месенджер.');
        return;
      }
      this.downloadScheduleImageFromModal();
    } catch {
      this.downloadScheduleImageFromModal();
      this.shareFeedbackMessage.set('Зображення завантажено у форматі PNG.');
    }
  }

  downloadDirectSchedulePng(mode: 'today' | 'tomorrow' | 'both' = 'today'): void {
    const st = this.status();
    if (!st) return;
    const dataUrl = this.renderActiveVariantScheduleDataUrl(st, mode);
    this.triggerDownloadDataUrl(dataUrl, this.buildShareFileName(st, mode));
  }

  downloadScheduleImageFromModal(): void {
    const st = this.status();
    const dataUrl = this.sharePreviewDataUrl();
    if (!st || !dataUrl) return;
    this.triggerDownloadDataUrl(dataUrl, this.buildShareFileName(st, this.shareMode()));
    this.shareFeedbackMessage.set('Файл PNG успішно збережено на пристрій.');
  }

  private triggerDownloadDataUrl(dataUrl: string, fileName: string): void {
    if (typeof document === 'undefined') return;
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  private buildShareFileName(
    st: DtekAddressScheduleStatus,
    mode: 'today' | 'tomorrow' | 'both'
  ): string {
    const q = this.formatQueueNumber(st.queueGroup).replace(/[^0-9A-Za-z._-]/g, '_');
    const d = this.formatShortDayMonth(
      mode === 'tomorrow' && st.tomorrowSchedule ? st.tomorrowSchedule.scheduleDate : st.scheduleDate
    ).replace(/[^0-9.]/g, '');
    const v = this.activeOutageVariant().split('_')[0] || 'v';
    return `dtek-cherga-${q || 'grafik'}-${d || 'today'}-${v}.png`;
  }

  private dataUrlToPngFile(dataUrl: string, fileName: string): File {
    const parts = dataUrl.split(',');
    const byteString = typeof atob === 'function' ? atob(parts[1] || '') : '';
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return new File([ia], fileName, { type: 'image/png' });
  }

  private renderActiveVariantScheduleDataUrl(
    st: DtekAddressScheduleStatus,
    mode: 'today' | 'tomorrow' | 'both'
  ): string {
    const variant = this.activeOutageVariant();
    if (variant === 'v11_dtek_official_sheet') {
      return this.renderDtekOfficialSheetDataUrl(st, mode);
    }
    return this.renderCurrentVariantCanvasDataUrl(st, mode, variant);
  }

  private renderCurrentVariantCanvasDataUrl(
    st: DtekAddressScheduleStatus,
    mode: 'today' | 'tomorrow' | 'both',
    variant: OutageScheduleViewVariant
  ): string {
    if (typeof document === 'undefined') return '';
    const days: {
      badge: string;
      badgeBg: string;
      title: string;
      hours: DtekHourSchedule[];
      totalPowerHours: number;
      totalOutageHours: number;
      isToday: boolean;
    }[] = [];

    if (mode === 'today' || mode === 'both') {
      days.push({
        badge: 'ПОТОЧНИЙ ДЕНЬ',
        badgeBg: '#4f46e5',
        title: `Графік на ${st.scheduleDate || 'сьогодні'} (24 години)`,
        hours: st.hourlySchedule || [],
        totalPowerHours: st.totalPowerHours,
        totalOutageHours: st.totalOutageHours,
        isToday: true,
      });
    }
    if ((mode === 'tomorrow' || mode === 'both') && st.tomorrowSchedule?.hourlySchedule?.length) {
      days.push({
        badge: 'НАСТУПНИЙ ДЕНЬ (ЗАВТРА)',
        badgeBg: '#7c3aed',
        title: `Графік на ${st.tomorrowSchedule.scheduleDate || 'завтра'} (24 години)`,
        hours: st.tomorrowSchedule.hourlySchedule,
        totalPowerHours: st.tomorrowSchedule.totalPowerHours,
        totalOutageHours: st.tomorrowSchedule.totalOutageHours,
        isToday: false,
      });
    }
    if (days.length === 0) {
      days.push({
        badge: 'ПОТОЧНИЙ ДЕНЬ',
        badgeBg: '#4f46e5',
        title: `Графік на ${st.scheduleDate || 'сьогодні'} (24 години)`,
        hours: st.hourlySchedule || [],
        totalPowerHours: st.totalPowerHours,
        totalOutageHours: st.totalOutageHours,
        isToday: true,
      });
    }

    const getDayBodyHeight = (hours: DtekHourSchedule[]): number => {
      switch (variant) {
        case 'v10_minimal_pills':
          return 236;
        case 'v1_classic_grid':
          return 316;
        case 'v2_linear_ribbon':
          return 225;
        case 'v3_circular_radar':
          return 360;
        case 'v4_shift_quadrants':
          return 330;
        case 'v5_interval_cards': {
          const ivs = this.getGroupedIntervals(hours, st.currentHourNumber, st.currentMinute);
          const rowsCount = Math.max(1, Math.ceil(ivs.length / 3));
          return rowsCount * 108 + 20;
        }
        case 'v6_matrix_4x6':
          return 300;
        case 'v7_compact_table': {
          const ivs = this.getGroupedIntervals(hours, st.currentHourNumber, st.currentMinute);
          return Math.max(1, ivs.length) * 56 + 24;
        }
        case 'v8_cyber_scada':
          return 250;
        case 'v9_dual_day_compare':
          return 250;
        default:
          return 260;
      }
    };

    const width = 1240;
    const padX = 36;
    const contentW = width - padX * 2;
    const focusBannerH = 158;
    const topHeaderH = 66;
    const daySectionHeaderH = 48;

    let totalDaysH = 0;
    for (const d of days) {
      totalDaysH += daySectionHeaderH + getDayBodyHeight(d.hours) + 28;
    }

    const height = topHeaderH + focusBannerH + totalDaysH + 46;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    const fontSans = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const fontMono = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

    // Canvas Background
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, width, height);

    // 1. Top Variant Badge & Legend Bar
    const vMeta = this.activeOutageVariantMeta();
    let curY = 20;

    // Dark badge with variant name
    ctx.font = `800 15px ${fontSans}`;
    const badgeText = vMeta.name;
    const badgeW = Math.max(220, ctx.measureText(badgeText).width + 36);
    this.drawRoundedRect(ctx, padX, curY, badgeW, 34, 10);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(padX + 16, curY + 17, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, padX + 28, curY + 17.5);

    // Right side legend: Світло є | Відключення | 30 хв (1/2 години)
    const legY = curY + 17;
    let legX = width - padX;
    ctx.font = `600 14px ${fontSans}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#475569';
    ctx.fillText('30 хв (1/2 години)', legX, legY);
    legX -= ctx.measureText('30 хв (1/2 години)').width + 22;
    ctx.fillStyle = '#10b981';
    ctx.fillRect(legX, legY - 6, 7, 12);
    ctx.fillStyle = '#f43f5e';
    ctx.fillRect(legX + 7, legY - 6, 7, 12);

    legX -= 22;
    ctx.fillStyle = '#475569';
    ctx.fillText('Відключення', legX, legY);
    legX -= ctx.measureText('Відключення').width + 18;
    ctx.fillStyle = '#f43f5e';
    this.drawRoundedRect(ctx, legX, legY - 6, 12, 12, 3);
    ctx.fill();

    legX -= 22;
    ctx.fillStyle = '#475569';
    ctx.fillText('Світло є', legX, legY);
    legX -= ctx.measureText('Світло є').width + 18;
    ctx.fillStyle = '#10b981';
    this.drawRoundedRect(ctx, legX, legY - 6, 12, 12, 3);
    ctx.fill();

    curY += 48;

    // 2. Focus Banner («Фокус поточного інтервалу»)
    const nextTr = this.getNextTransitionSummary(
      st.hourlySchedule,
      st.currentHourNumber,
      st.currentMinute
    );
    this.drawRoundedRect(ctx, padX, curY, contentW, focusBannerH, 20);
    const grad = ctx.createLinearGradient(padX, curY, padX + contentW, curY);
    if (st.isPowerAvailableNow) {
      grad.addColorStop(0, '#059669');
      grad.addColorStop(1, '#0f766e');
    } else {
      grad.addColorStop(0, '#e11d48');
      grad.addColorStop(1, '#991b1b');
    }
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.font = `800 13px ${fontSans}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('ФОКУС ПОТОЧНОГО ІНТЕРВАЛУ', padX + 24, curY + 20);

    if (this.lastUpdated()) {
      const updText = `ДТЕК: ${this.lastUpdated()}`;
      ctx.font = `700 12px ${fontSans}`;
      const updW = ctx.measureText(updText).width + 20;
      this.drawRoundedRect(ctx, padX + 260, curY + 16, updW, 22, 6);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.fillText(updText, padX + 270, curY + 27);
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = `900 28px ${fontSans}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`${nextTr.label} ${nextTr.time}`, padX + 24, curY + 48);

    // Counters inside Focus Banner (Світло / Відкл. / Черга)
    const drawFocusCounter = (
      x: number,
      y: number,
      label: string,
      val: string,
      lightBg: boolean
    ): number => {
      const w = 132;
      const h = 50;
      this.drawRoundedRect(ctx, x, y, w, h, 12);
      ctx.fillStyle = lightBg ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.22)';
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.82)';
      ctx.font = `600 12px ${fontSans}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(label, x + w / 2, y + 8);
      ctx.fillStyle = '#ffffff';
      ctx.font = `900 17px ${fontMono}`;
      ctx.fillText(val, x + w / 2, y + 25);
      return w + 10;
    };

    let cntX = padX + 24;
    const cntY = curY + 92;
    cntX += drawFocusCounter(cntX, cntY, 'Світло', `${st.totalPowerHours} год`, false);
    cntX += drawFocusCounter(cntX, cntY, 'Відкл.', `${st.totalOutageHours} год`, false);
    if (st.queueGroup) {
      drawFocusCounter(
        cntX,
        cntY,
        'Черга',
        `Черга ${this.formatQueueNumber(st.queueGroup)}`,
        true
      );
    }

    curY += focusBannerH + 22;

    // 3. Render Each Requested Day in Current Active Variant
    for (const day of days) {
      // Day Section Header
      ctx.font = `800 12px ${fontSans}`;
      const bW = ctx.measureText(day.badge).width + 20;
      this.drawRoundedRect(ctx, padX, curY + 4, bW, 24, 6);
      ctx.fillStyle = day.badgeBg;
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(day.badge, padX + 10, curY + 16);

      ctx.fillStyle = '#0f172a';
      ctx.font = `800 18px ${fontSans}`;
      ctx.fillText(day.title, padX + bW + 12, curY + 16);

      // Right summary for day
      ctx.textAlign = 'right';
      ctx.font = `700 14px ${fontSans}`;
      ctx.fillStyle = '#047857';
      ctx.fillText(
        `Світло: ${day.totalPowerHours} год   |   Відкл.: ${day.totalOutageHours} год`,
        width - padX,
        curY + 16
      );

      curY += daySectionHeaderH;
      const bodyH = getDayBodyHeight(day.hours);
      const curHour = day.isToday ? st.currentHourNumber : -1;
      const curMin = day.isToday ? st.currentMinute : 0;

      if (variant === 'v10_minimal_pills') {
        // 8 columns x 3 rows of rounded-full pills
        const cols = 8;
        const gapX = 12;
        const gapY = 14;
        const pillW = (contentW - (cols - 1) * gapX) / cols;
        const pillH = 62;

        for (let i = 0; i < 24; i++) {
          const h = day.hours[i] || {
            hour: i + 1,
            timeRange: `${String(i).padStart(2, '0')}:00–${String(i + 1).padStart(2, '0')}:00`,
            firstHalfPower: true,
            secondHalfPower: true,
            hasPower: true,
            rawState: 'yes' as const,
          };
          const col = i % cols;
          const row = Math.floor(i / cols);
          const px = padX + col * (pillW + gapX);
          const py = curY + row * (pillH + gapY);

          ctx.save();
          this.drawRoundedRect(ctx, px, py, pillW, pillH, 31);
          ctx.clip();

          // Left half (first 30m)
          ctx.fillStyle = h.firstHalfPower ? '#ecfdf5' : '#fff1f2';
          ctx.fillRect(px, py, pillW / 2, pillH);
          // Right half (second 30m)
          ctx.fillStyle = h.secondHalfPower ? '#ecfdf5' : '#fff1f2';
          ctx.fillRect(px + pillW / 2, py, pillW / 2, pillH);

          // Bottom 6px color strip inside pill
          ctx.fillStyle = h.firstHalfPower ? '#10b981' : '#f43f5e';
          ctx.fillRect(px, py + pillH - 6, pillW / 2, 6);
          ctx.fillStyle = h.secondHalfPower ? '#10b981' : '#f43f5e';
          ctx.fillRect(px + pillW / 2, py + pillH - 6, pillW / 2, 6);
          ctx.restore();

          // Border
          this.drawRoundedRect(ctx, px, py, pillW, pillH, 31);
          const isCur = h.hour === curHour;
          ctx.strokeStyle = isCur
            ? '#f59e0b'
            : h.firstHalfPower && h.secondHalfPower
              ? '#6ee7b7'
              : !h.firstHalfPower && !h.secondHalfPower
                ? '#fda4af'
                : '#fcd34d';
          ctx.lineWidth = isCur ? 3 : 1.5;
          ctx.stroke();

          // Hour text (00:00)
          const hhLabel = `${String(h.hour - 1).padStart(2, '0')}:00`;
          ctx.fillStyle = '#0f172a';
          ctx.font = `900 16px ${fontMono}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(hhLabel, px + pillW / 2, py + 23);

          // Sub-status text
          ctx.font = `800 11px ${fontSans}`;
          if (h.firstHalfPower && h.secondHalfPower) {
            ctx.fillStyle = '#047857';
            ctx.fillText('Світло є', px + pillW / 2, py + 43);
          } else if (!h.firstHalfPower && !h.secondHalfPower) {
            ctx.fillStyle = '#be123c';
            ctx.fillText('Відкл.', px + pillW / 2, py + 43);
          } else {
            ctx.fillStyle = '#b45309';
            ctx.fillText(h.firstHalfPower ? '1-ша пол.' : '2-га пол.', px + pillW / 2, py + 43);
          }
        }
      } else if (variant === 'v1_classic_grid') {
        const cols = 8;
        const gapX = 12;
        const gapY = 12;
        const cardW = (contentW - (cols - 1) * gapX) / cols;
        const cardH = 92;

        for (let i = 0; i < 24; i++) {
          const h = day.hours[i];
          if (!h) continue;
          const col = i % cols;
          const row = Math.floor(i / cols);
          const cx = padX + col * (cardW + gapX);
          const cy = curY + row * (cardH + gapY);

          this.drawRoundedRect(ctx, cx, cy, cardW, cardH, 14);
          ctx.fillStyle =
            h.firstHalfPower && h.secondHalfPower
              ? '#ecfdf5'
              : !h.firstHalfPower && !h.secondHalfPower
                ? '#fff1f2'
                : '#fffbeb';
          ctx.fill();
          ctx.strokeStyle =
            h.hour === curHour
              ? '#f59e0b'
              : h.firstHalfPower && h.secondHalfPower
                ? '#a7f3d0'
                : !h.firstHalfPower && !h.secondHalfPower
                  ? '#fecdd3'
                  : '#fde68a';
          ctx.lineWidth = h.hour === curHour ? 3 : 1.5;
          ctx.stroke();

          ctx.fillStyle = '#0f172a';
          ctx.font = `800 13px ${fontMono}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          const rangeText = `${String(h.hour - 1).padStart(2, '0')}:00–${String(h.hour).padStart(2, '0')}:00`;
          ctx.fillText(rangeText, cx + cardW / 2, cy + 12);

          // Split bar in middle
          const barW = cardW - 24;
          const barX = cx + 12;
          const barY = cy + 38;
          ctx.fillStyle = h.firstHalfPower ? '#10b981' : '#f43f5e';
          ctx.fillRect(barX, barY, barW / 2 - 1, 12);
          ctx.fillStyle = h.secondHalfPower ? '#10b981' : '#f43f5e';
          ctx.fillRect(barX + barW / 2 + 1, barY, barW / 2 - 1, 12);

          ctx.font = `800 12px ${fontSans}`;
          ctx.fillStyle =
            h.firstHalfPower && h.secondHalfPower
              ? '#047857'
              : !h.firstHalfPower && !h.secondHalfPower
                ? '#be123c'
                : '#b45309';
          const stLabel =
            h.firstHalfPower && h.secondHalfPower
              ? 'Є світло'
              : !h.firstHalfPower && !h.secondHalfPower
                ? 'Відключення'
                : h.firstHalfPower
                  ? ':00–:30 є'
                  : ':30–:00 є';
          ctx.fillText(stLabel, cx + cardW / 2, cy + 62);
        }
      } else if (variant === 'v2_linear_ribbon') {
        this.drawRoundedRect(ctx, padX, curY, contentW, 205, 18);
        ctx.fillStyle = '#0f172a';
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = `800 15px ${fontSans}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(
          'Безперервна 24-годинна шкала (48 півгодинних сегментів)',
          padX + 22,
          curY + 18
        );

        const ribX = padX + 22;
        const ribY = curY + 54;
        const ribW = contentW - 44;
        const ribH = 54;
        const segW = ribW / 48;

        for (let i = 0; i < 24; i++) {
          const h = day.hours[i];
          if (!h) continue;
          ctx.fillStyle = h.firstHalfPower ? '#10b981' : '#f43f5e';
          ctx.fillRect(ribX + i * 2 * segW, ribY, segW - 1, ribH);
          ctx.fillStyle = h.secondHalfPower ? '#10b981' : '#f43f5e';
          ctx.fillRect(ribX + (i * 2 + 1) * segW, ribY, segW - 1, ribH);
        }

        // Hour ticks
        ctx.fillStyle = '#94a3b8';
        ctx.font = `700 11px ${fontMono}`;
        ctx.textAlign = 'center';
        for (let i = 0; i <= 24; i += 2) {
          const tx = ribX + (i / 24) * ribW;
          ctx.fillText(`${String(i).padStart(2, '0')}:00`, tx, ribY + ribH + 14);
        }

        // Grouped interval chips at bottom of ribbon
        const ivs = this.getGroupedIntervals(day.hours, curHour, curMin);
        let chipX = ribX;
        const chipY = ribY + ribH + 38;
        ctx.font = `800 12px ${fontMono}`;
        ctx.textAlign = 'left';
        for (const iv of ivs.slice(0, 7)) {
          const txt = `${iv.fromTime}–${iv.toTime} (${iv.durationHours} год)`;
          const cw = ctx.measureText(txt).width + 24;
          if (chipX + cw > padX + contentW - 22) break;
          this.drawRoundedRect(ctx, chipX, chipY, cw, 28, 8);
          ctx.fillStyle = iv.state === 'on' ? 'rgba(16,185,129,0.2)' : 'rgba(244,63,94,0.22)';
          ctx.fill();
          ctx.fillStyle = iv.state === 'on' ? '#6ee7b7' : '#fda4af';
          ctx.fillText(txt, chipX + 12, chipY + 8);
          chipX += cw + 10;
        }
      } else if (variant === 'v3_circular_radar') {
        this.drawRoundedRect(ctx, padX, curY, contentW, 340, 18);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const cx = padX + 210;
        const cy = curY + 170;
        const innerR = 64;
        const outerR = 132;
        for (let i = 0; i < 48; i++) {
          const h = day.hours[Math.floor(i / 2)];
          const hasP = h ? (i % 2 === 0 ? h.firstHalfPower : h.secondHalfPower) : true;
          const a1 = ((i * 7.5 - 90 + 0.4) * Math.PI) / 180;
          const a2 = (((i + 1) * 7.5 - 90 - 0.4) * Math.PI) / 180;
          ctx.beginPath();
          ctx.arc(cx, cy, outerR, a1, a2);
          ctx.arc(cx, cy, innerR, a2, a1, true);
          ctx.closePath();
          ctx.fillStyle = hasP ? '#10b981' : '#f43f5e';
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(cx, cy, innerR - 6, 0, Math.PI * 2);
        ctx.fillStyle = '#0f172a';
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = `900 15px ${fontSans}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`Черга ${this.formatQueueNumber(st.queueGroup)}`, cx, cy - 8);
        ctx.font = `700 12px ${fontMono}`;
        ctx.fillStyle = '#6ee7b7';
        ctx.fillText(`${day.totalPowerHours} год світла`, cx, cy + 12);

        // Intervals list on the right of radar
        const ivs = this.getGroupedIntervals(day.hours, curHour, curMin);
        const listX = padX + 430;
        let listY = curY + 24;
        ctx.fillStyle = '#0f172a';
        ctx.font = `800 15px ${fontSans}`;
        ctx.textAlign = 'left';
        ctx.fillText('Хронологія інтервалів доби (24 години):', listX, listY);
        listY += 26;

        for (const iv of ivs.slice(0, 7)) {
          this.drawRoundedRect(ctx, listX, listY, contentW - 455, 36, 10);
          ctx.fillStyle = iv.state === 'on' ? '#ecfdf5' : '#fff1f2';
          ctx.fill();
          ctx.fillStyle = iv.state === 'on' ? '#047857' : '#be123c';
          ctx.font = `800 14px ${fontMono}`;
          ctx.fillText(`${iv.fromTime} – ${iv.toTime}`, listX + 14, listY + 18);
          ctx.font = `800 13px ${fontSans}`;
          ctx.fillText(
            iv.state === 'on'
              ? `Світло є (${iv.durationHours} год)`
              : `Відключення (${iv.durationHours} год)`,
            listX + 165,
            listY + 18
          );
          listY += 42;
        }
      } else if (variant === 'v4_shift_quadrants') {
        const quads = this.getShiftQuadrants(day.hours, curHour);
        const qw = (contentW - 16) / 2;
        const qh = 150;
        quads.forEach((q, idx) => {
          const col = idx % 2;
          const row = Math.floor(idx / 2);
          const qx = padX + col * (qw + 16);
          const qy = curY + row * (qh + 14);
          this.drawRoundedRect(ctx, qx, qy, qw, qh, 16);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.fillStyle = '#0f172a';
          ctx.font = `800 16px ${fontSans}`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText(`${q.title} (${q.timeRange})`, qx + 18, qy + 16);

          ctx.textAlign = 'right';
          ctx.font = `700 13px ${fontMono}`;
          ctx.fillStyle = '#047857';
          ctx.fillText(`+${q.powerHours} год / -${q.outageHours} год`, qx + qw - 18, qy + 18);

          const tileGap = 8;
          const tileW = (qw - 36 - 5 * tileGap) / 6;
          const tileY = qy + 52;
          q.hours.forEach((h, hIdx) => {
            const tx = qx + 18 + hIdx * (tileW + tileGap);
            this.drawRoundedRect(ctx, tx, tileY, tileW, 78, 10);
            ctx.fillStyle =
              h.firstHalfPower && h.secondHalfPower
                ? '#ecfdf5'
                : !h.firstHalfPower && !h.secondHalfPower
                  ? '#fff1f2'
                  : '#fffbeb';
            ctx.fill();
            ctx.fillStyle = '#0f172a';
            ctx.font = `800 13px ${fontMono}`;
            ctx.textAlign = 'center';
            ctx.fillText(`${String(h.hour - 1).padStart(2, '0')}:00`, tx + tileW / 2, tileY + 14);
            ctx.fillStyle = h.firstHalfPower ? '#10b981' : '#f43f5e';
            ctx.fillRect(tx + 8, tileY + 46, (tileW - 16) / 2 - 1, 14);
            ctx.fillStyle = h.secondHalfPower ? '#10b981' : '#f43f5e';
            ctx.fillRect(tx + 8 + (tileW - 16) / 2 + 1, tileY + 46, (tileW - 16) / 2 - 1, 14);
          });
        });
      } else if (variant === 'v5_interval_cards') {
        const ivs = this.getGroupedIntervals(day.hours, curHour, curMin);
        const cols = 3;
        const gap = 14;
        const cw = (contentW - (cols - 1) * gap) / cols;
        const ch = 94;
        ivs.forEach((iv, idx) => {
          const col = idx % cols;
          const row = Math.floor(idx / cols);
          const ix = padX + col * (cw + gap);
          const iy = curY + row * (ch + gap);
          this.drawRoundedRect(ctx, ix, iy, cw, ch, 16);
          ctx.fillStyle = iv.state === 'on' ? '#ecfdf5' : '#fff1f2';
          ctx.fill();
          ctx.strokeStyle = iv.state === 'on' ? '#6ee7b7' : '#fda4af';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.fillStyle = iv.state === 'on' ? '#047857' : '#be123c';
          ctx.font = `800 12px ${fontSans}`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText(
            iv.state === 'on' ? 'СВІТЛО ЗА ГРАФІКОМ' : 'ВІДКЛЮЧЕННЯ',
            ix + 18,
            iy + 16
          );

          ctx.fillStyle = '#0f172a';
          ctx.font = `900 22px ${fontMono}`;
          ctx.fillText(`${iv.fromTime} – ${iv.toTime}`, ix + 18, iy + 42);

          ctx.textAlign = 'right';
          ctx.font = `800 15px ${fontMono}`;
          ctx.fillStyle = iv.state === 'on' ? '#047857' : '#be123c';
          ctx.fillText(`${iv.durationHours} год`, ix + cw - 18, iy + 46);
        });
      } else if (variant === 'v6_matrix_4x6') {
        const rows = this.getMatrix4x6Rows(day.hours);
        const rowLabels = ['00:00 – 06:00', '06:00 – 12:00', '12:00 – 18:00', '18:00 – 24:00'];
        const labelW = 160;
        const cellGap = 10;
        const cellW = (contentW - labelW - 6 * cellGap) / 6;
        const cellH = 62;
        rows.forEach((rHours, rIdx) => {
          const ry = curY + rIdx * (cellH + 10);
          this.drawRoundedRect(ctx, padX, ry, labelW - 10, cellH, 12);
          ctx.fillStyle = '#0f172a';
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.font = `800 13px ${fontMono}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(rowLabels[rIdx] || '', padX + (labelW - 10) / 2, ry + cellH / 2);

          rHours.forEach((h, cIdx) => {
            const cx = padX + labelW + cIdx * (cellW + cellGap);
            ctx.save();
            this.drawRoundedRect(ctx, cx, ry, cellW, cellH, 12);
            ctx.clip();
            ctx.fillStyle = h.firstHalfPower ? '#10b981' : '#f43f5e';
            ctx.fillRect(cx, ry, cellW / 2, cellH);
            ctx.fillStyle = h.secondHalfPower ? '#10b981' : '#f43f5e';
            ctx.fillRect(cx + cellW / 2, ry, cellW / 2, cellH);
            ctx.restore();

            ctx.fillStyle = '#ffffff';
            ctx.font = `900 15px ${fontMono}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(
              `${String(h.hour - 1).padStart(2, '0')}:00`,
              cx + cellW / 2,
              ry + cellH / 2
            );
          });
        });
      } else if (variant === 'v7_compact_table') {
        const ivs = this.getGroupedIntervals(day.hours, curHour, curMin);
        ivs.forEach((iv, idx) => {
          const ay = curY + idx * 54;
          this.drawRoundedRect(ctx, padX, ay, contentW, 46, 12);
          ctx.fillStyle = iv.state === 'on' ? '#ecfdf5' : '#fff1f2';
          ctx.fill();
          ctx.strokeStyle = iv.state === 'on' ? '#a7f3d0' : '#fecdd3';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.fillStyle = '#0f172a';
          ctx.font = `900 15px ${fontMono}`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${iv.fromTime} – ${iv.toTime}`, padX + 20, ay + 23);

          ctx.fillStyle = iv.state === 'on' ? '#047857' : '#be123c';
          ctx.font = `800 14px ${fontSans}`;
          ctx.fillText(
            iv.state === 'on' ? 'Електропостачання за графіком' : 'Планове відключення',
            padX + 190,
            ay + 23
          );

          ctx.textAlign = 'right';
          ctx.font = `800 14px ${fontMono}`;
          ctx.fillText(`${iv.durationHours} год`, padX + contentW - 20, ay + 23);
        });
      } else if (variant === 'v8_cyber_scada') {
        this.drawRoundedRect(ctx, padX, curY, contentW, 230, 18);
        ctx.fillStyle = '#020617';
        ctx.fill();

        ctx.fillStyle = '#38bdf8';
        ctx.font = `800 13px ${fontMono}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(
          'SCADA WAVEFORM // 24H POWER STATE OSCILLOGRAM (HIGH=220V / LOW=0V)',
          padX + 22,
          curY + 16
        );

        const waveX = padX + 22;
        const waveY = curY + 52;
        const waveW = contentW - 44;
        const highY = waveY + 28;
        const lowY = waveY + 112;
        const slotW = waveW / 48;

        ctx.strokeStyle = 'rgba(148,163,184,0.18)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(waveX, highY);
        ctx.lineTo(waveX + waveW, highY);
        ctx.moveTo(waveX, lowY);
        ctx.lineTo(waveX + waveW, lowY);
        ctx.stroke();

        ctx.beginPath();
        let prevY = highY;
        for (let i = 0; i < 48; i++) {
          const h = day.hours[Math.floor(i / 2)];
          const on = h ? (i % 2 === 0 ? h.firstHalfPower : h.secondHalfPower) : true;
          const y = on ? highY : lowY;
          const x1 = waveX + i * slotW;
          const x2 = x1 + slotW;
          if (i === 0) {
            ctx.moveTo(x1, y);
          } else if (prevY !== y) {
            ctx.lineTo(x1, y);
          }
          ctx.lineTo(x2, y);
          prevY = y;
        }
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 3.5;
        ctx.stroke();

        // Bottom 24h labels
        ctx.fillStyle = '#94a3b8';
        ctx.font = `700 11px ${fontMono}`;
        ctx.textAlign = 'center';
        for (let h = 0; h < 24; h++) {
          const hx = waveX + (h + 0.5) * (waveW / 24);
          ctx.fillText(String(h).padStart(2, '0'), hx, waveY + 148);
        }
      } else if (variant === 'v9_dual_day_compare') {
        this.drawRoundedRect(ctx, padX, curY, contentW, 230, 18);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const barAreaX = padX + 22;
        const barAreaW = contentW - 44;
        const colGap = 8;
        const colW = (barAreaW - 23 * colGap) / 24;
        const topY = curY + 28;
        const halfH = 68;

        for (let i = 0; i < 24; i++) {
          const h = day.hours[i];
          if (!h) continue;
          const bx = barAreaX + i * (colW + colGap);
          this.drawRoundedRect(ctx, bx, topY, colW, halfH, 6);
          ctx.fillStyle = h.firstHalfPower ? '#10b981' : '#f43f5e';
          ctx.fill();

          this.drawRoundedRect(ctx, bx, topY + halfH + 6, colW, halfH, 6);
          ctx.fillStyle = h.secondHalfPower ? '#10b981' : '#f43f5e';
          ctx.fill();

          ctx.fillStyle = '#334155';
          ctx.font = `800 11px ${fontMono}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(String(i).padStart(2, '0'), bx + colW / 2, topY + halfH * 2 + 18);
        }
      }

      curY += bodyH + 28;
    }

    return canvas.toDataURL('image/png');
  }

  private renderDtekOfficialSheetDataUrl(
    st: DtekAddressScheduleStatus,
    mode: 'today' | 'tomorrow' | 'both'
  ): string {
    if (typeof document === 'undefined') return '';
    const rows: { label: string; hours: DtekHourSchedule[] }[] = [];

    if (mode === 'today' || mode === 'both') {
      rows.push({
        label: `Сьогодні ${this.formatShortDayMonth(st.scheduleDate)}`.trim(),
        hours: st.hourlySchedule || [],
      });
    }
    if ((mode === 'tomorrow' || mode === 'both') && st.tomorrowSchedule?.hourlySchedule?.length) {
      rows.push({
        label: `Завтра ${this.formatShortDayMonth(st.tomorrowSchedule.scheduleDate)}`.trim(),
        hours: st.tomorrowSchedule.hourlySchedule,
      });
    }
    if (rows.length === 0) {
      rows.push({
        label: `Сьогодні ${this.formatShortDayMonth(st.scheduleDate)}`.trim(),
        hours: st.hourlySchedule || [],
      });
    }

    const width = 1280;
    const rowHeight = 64;
    const headerRowHeight = 84;
    const tableHeight = headerRowHeight + rows.length * rowHeight;
    const height = 435 + tableHeight;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // 1. White Canvas Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    const fontSans = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

    // 2. Top Branding: DTEK | ОДЕСЬКІ ЕЛЕКТРОМЕРЕЖІ
    const brandCenterX = width / 2;
    const brandTopY = 38;

    // Draw DTEK Logo on the left of divider
    const logoScale = 1.25;
    const logoOffsetX = brandCenterX - 245;
    const logoOffsetY = brandTopY + 4;
    ctx.save();
    ctx.translate(logoOffsetX, logoOffsetY);
    ctx.scale(logoScale, logoScale);

    // Yellow top segment of D
    ctx.fillStyle = '#FFE600';
    ctx.fillRect(2, 4, 8.5, 9);
    // Black bottom segment of D
    ctx.fillStyle = '#000000';
    ctx.fillRect(2, 15, 8.5, 25);

    const drawSvgPath = (pathStr: string, fillStyle: string) => {
      if (typeof Path2D !== 'undefined') {
        const p = new Path2D(pathStr);
        ctx.fillStyle = fillStyle;
        ctx.fill(p);
      }
    };
    drawSvgPath(
      'M12 4 H25 C35 4 41 11 41 22 C41 33 35 40 25 40 H12 V32 H24 C29.5 32 32.5 28 32.5 22 C32.5 16 29.5 12 24 12 H12 Z',
      '#000000'
    );
    drawSvgPath('M45 4 H77 V12 H65.25 V40 H56.75 V12 H45 Z', '#000000');
    drawSvgPath(
      'M95 4 H114 V12 H95 C90.5 12 88 14.5 88 18.5 H111 V25.5 H88 C88 29.5 90.5 32 95 32 H114 V40 H94 C84.5 40 79.5 33.5 79.5 22 C79.5 10.5 84.5 4 95 4 Z',
      '#000000'
    );
    drawSvgPath(
      'M120 4 H128.5 V18.5 L143.5 4 H154.5 L137 21 L155.5 40 H144.5 L128.5 23.5 V40 H120 Z',
      '#000000'
    );
    ctx.restore();

    // Vertical divider
    const divX = brandCenterX - 28;
    ctx.fillStyle = '#111827';
    ctx.fillRect(divX, brandTopY, 2, 62);

    // ОДЕСЬКІ ЕЛЕКТРОМЕРЕЖІ
    ctx.fillStyle = '#0f172a';
    ctx.font = `800 22px ${fontSans}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('ОДЕСЬКІ', divX + 20, brandTopY + 5);
    ctx.fillText('ЕЛЕКТРОМЕРЕЖІ', divX + 20, brandTopY + 34);

    // 3. Yellow Pill: Черга X.X
    const queueText = `Черга ${this.formatQueueNumber(st.queueGroup)}`;
    const pillW = 240;
    const pillH = 52;
    const pillX = (width - pillW) / 2;
    const pillY = 122;

    this.drawRoundedRect(ctx, pillX, pillY, pillW, pillH, 26);
    ctx.fillStyle = '#FFE600';
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.font = `800 28px ${fontSans}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(queueText, width / 2, pillY + pillH / 2 + 1);

    // 4. Title: Графік відключень на:
    ctx.fillStyle = '#0f172a';
    ctx.font = `400 36px ${fontSans}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Графік відключень на:', width / 2, 196);

    // 5. 24-Hour Table
    const tableX = 44;
    const tableY = 262;
    const tableW = width - 88;
    const firstColW = 192;
    const hourColW = (tableW - firstColW) / 24;

    ctx.save();
    this.drawRoundedRect(ctx, tableX, tableY, tableW, tableHeight, 14);
    ctx.clip();

    // Fill table white
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(tableX, tableY, tableW, tableHeight);

    // Header Row: Часові проміжки
    ctx.fillStyle = '#0f172a';
    ctx.font = `700 18px ${fontSans}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Часові', tableX + 18, tableY + headerRowHeight / 2 - 12);
    ctx.fillText('проміжки', tableX + 18, tableY + headerRowHeight / 2 + 12);

    // 24 Rotated Hour Headers
    for (let h = 1; h <= 24; h++) {
      const colX = tableX + firstColW + (h - 1) * hourColW;
      const cx = colX + hourColW / 2;
      const cy = tableY + headerRowHeight / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = '#0f172a';
      ctx.font = `700 16px ${fontSans}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.formatDtekHourSlot(h), 0, 0);
      ctx.restore();
    }

    // Data Rows
    rows.forEach((row, rIdx) => {
      const rowY = tableY + headerRowHeight + rIdx * rowHeight;

      // Label cell
      ctx.fillStyle = '#0f172a';
      ctx.font = `700 18px ${fontSans}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(row.label, tableX + 18, rowY + rowHeight / 2);

      // 24 Hour cells
      for (let h = 1; h <= 24; h++) {
        const hItem = row.hours.find((item) => item.hour === h) || row.hours[h - 1];
        const colX = tableX + firstColW + (h - 1) * hourColW;
        const firstOn = hItem ? hItem.firstHalfPower : true;
        const secondOn = hItem ? hItem.secondHalfPower : true;

        if (!firstOn && !secondOn) {
          ctx.fillStyle = '#d6d8db';
          ctx.fillRect(colX, rowY, hourColW, rowHeight);
          this.drawCrossedBoltOnCanvas(ctx, colX + hourColW / 2, rowY + rowHeight / 2, false);
        } else if (!firstOn && secondOn) {
          ctx.fillStyle = '#d6d8db';
          ctx.fillRect(colX, rowY, hourColW / 2, rowHeight);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(colX + hourColW / 2, rowY, hourColW / 2, rowHeight);
          this.drawCrossedBoltOnCanvas(ctx, colX + hourColW / 2, rowY + rowHeight / 2, true);
        } else if (firstOn && !secondOn) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(colX, rowY, hourColW / 2, rowHeight);
          ctx.fillStyle = '#d6d8db';
          ctx.fillRect(colX + hourColW / 2, rowY, hourColW / 2, rowHeight);
          this.drawCrossedBoltOnCanvas(ctx, colX + hourColW / 2, rowY + rowHeight / 2, true);
        }
      }
    });

    // Grid lines inside table
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.25;

    // Horizontal lines
    ctx.beginPath();
    ctx.moveTo(tableX, tableY + headerRowHeight);
    ctx.lineTo(tableX + tableW, tableY + headerRowHeight);
    for (let r = 1; r < rows.length; r++) {
      const y = tableY + headerRowHeight + r * rowHeight;
      ctx.moveTo(tableX, y);
      ctx.lineTo(tableX + tableW, y);
    }
    ctx.stroke();

    // Vertical lines
    ctx.beginPath();
    ctx.moveTo(tableX + firstColW, tableY);
    ctx.lineTo(tableX + firstColW, tableY + tableHeight);
    for (let h = 1; h < 24; h++) {
      const x = tableX + firstColW + h * hourColW;
      ctx.moveTo(x, tableY);
      ctx.lineTo(x, tableY + tableHeight);
    }
    ctx.stroke();
    ctx.restore();

    // Outer rounded border of table
    this.drawRoundedRect(ctx, tableX, tableY, tableW, tableHeight, 14);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 6. Bottom 4-Item Legend
    const legendY = tableY + tableHeight + 40;
    const boxSize = 46;

    const legendItems: {
      type: 'yes' | 'no' | 'first' | 'second';
      lines: string[];
      x: number;
    }[] = [
      { type: 'yes', lines: ['Світло є'], x: 115 },
      { type: 'no', lines: ['Світла немає'], x: 345 },
      { type: 'first', lines: ['Світла не буде', 'перші 30 хв.'], x: 625 },
      { type: 'second', lines: ['Світла не буде', 'другі 30 хв.'], x: 935 },
    ];

    for (const item of legendItems) {
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(item.x, legendY, boxSize, boxSize);

      if (item.type === 'no') {
        ctx.fillStyle = '#d6d8db';
        ctx.fillRect(item.x, legendY, boxSize, boxSize);
        this.drawCrossedBoltOnCanvas(ctx, item.x + boxSize / 2, legendY + boxSize / 2, false);
      } else if (item.type === 'first') {
        ctx.fillStyle = '#d6d8db';
        ctx.fillRect(item.x, legendY, boxSize / 2, boxSize);
        this.drawCrossedBoltOnCanvas(ctx, item.x + boxSize / 2, legendY + boxSize / 2, true);
      } else if (item.type === 'second') {
        ctx.fillStyle = '#d6d8db';
        ctx.fillRect(item.x + boxSize / 2, legendY, boxSize / 2, boxSize);
        this.drawCrossedBoltOnCanvas(ctx, item.x + boxSize / 2, legendY + boxSize / 2, true);
      }

      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(item.x, legendY, boxSize, boxSize);

      ctx.fillStyle = '#475569';
      ctx.font = `500 19px ${fontSans}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      if (item.lines.length === 1) {
        ctx.fillText(item.lines[0], item.x + boxSize + 14, legendY + boxSize / 2);
      } else {
        ctx.fillText(item.lines[0], item.x + boxSize + 14, legendY + boxSize / 2 - 11);
        ctx.fillText(item.lines[1], item.x + boxSize + 14, legendY + boxSize / 2 + 12);
      }
      ctx.restore();
    }

    return canvas.toDataURL('image/png');
  }

  private drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  private drawCrossedBoltOnCanvas(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    isHalfYellow: boolean
  ): void {
    ctx.save();
    ctx.translate(cx - 12, cy - 12);
    if (typeof Path2D !== 'undefined') {
      const bolt = new Path2D('M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z');
      ctx.fillStyle = isHalfYellow ? '#eab308' : '#1e293b';
      ctx.fill(bolt);
      if (isHalfYellow) {
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1.2;
        ctx.stroke(bolt);
      }
    }
    ctx.beginPath();
    ctx.moveTo(3.5, 5.5);
    ctx.lineTo(20.5, 18.5);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
  }

  getLiveTimelinePercent(currentHourNumber: number, currentMinute: number): number {
    const hIdx = Math.max(0, Math.min(23, (currentHourNumber || 1) - 1));
    const min = Math.max(0, Math.min(59, currentMinute || 0));
    return Math.round(((hIdx + min / 60) / 24) * 1000) / 10;
  }

  isNightTariffHour(hourNumber: number): boolean {
    return hourNumber <= 7 || hourNumber === 24;
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

  getMatrix4x6Rows(hours: DtekHourSchedule[]): DtekHourSchedule[][] {
    const list = hours || [];
    return [
      list.slice(0, 6),
      list.slice(6, 12),
      list.slice(12, 18),
      list.slice(18, 24),
    ].filter((r) => r.length > 0);
  }

  getRadarWedges(
    hours: DtekHourSchedule[],
    currentHourNumber = 0,
    currentMinute = 0
  ): OutageRadarWedge[] {
    if (!hours || hours.length === 0) return [];
    const cx = 150;
    const cy = 150;
    const innerR = 56;
    const outerR = 118;
    const labelR = 133;
    const gapDeg = 0.7;
    const stepDeg = 360 / 48;
    const wedges: OutageRadarWedge[] = [];

    const polarToCartesian = (r: number, angleDeg: number) => {
      const rad = ((angleDeg - 90) * Math.PI) / 180;
      return {
        x: Math.round((cx + r * Math.cos(rad)) * 100) / 100,
        y: Math.round((cy + r * Math.sin(rad)) * 100) / 100,
      };
    };

    const buildSectorPath = (r1: number, r2: number, startAngle: number, endAngle: number) => {
      const p1 = polarToCartesian(r2, startAngle);
      const p2 = polarToCartesian(r2, endAngle);
      const p3 = polarToCartesian(r1, endAngle);
      const p4 = polarToCartesian(r1, startAngle);
      return `M ${p1.x} ${p1.y} A ${r2} ${r2} 0 0 1 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${r1} ${r1} 0 0 0 ${p4.x} ${p4.y} Z`;
    };

    for (const h of hours) {
      const hZero = h.hour - 1;
      const hh = String(hZero).padStart(2, '0');
      const hhNext = String(h.hour).padStart(2, '0');

      const idx1 = hZero * 2;
      const s1 = idx1 * stepDeg + gapDeg / 2;
      const e1 = (idx1 + 1) * stepDeg - gapDeg / 2;
      const lblPt = polarToCartesian(labelR, hZero * 15);

      wedges.push({
        index: idx1,
        hour: h.hour,
        half: 1,
        timeRange: `${hh}:00–${hh}:30`,
        hasPower: h.firstHalfPower,
        isCurrentHalf: h.hour === currentHourNumber && currentMinute < 30,
        pathD: buildSectorPath(innerR, outerR, s1, e1),
        labelX: lblPt.x,
        labelY: lblPt.y,
        hourLabel: hh,
      });

      const idx2 = hZero * 2 + 1;
      const s2 = idx2 * stepDeg + gapDeg / 2;
      const e2 = (idx2 + 1) * stepDeg - gapDeg / 2;
      wedges.push({
        index: idx2,
        hour: h.hour,
        half: 2,
        timeRange: `${hh}:30–${hhNext}:00`,
        hasPower: h.secondHalfPower,
        isCurrentHalf: h.hour === currentHourNumber && currentMinute >= 30,
        pathD: buildSectorPath(innerR, outerR, s2, e2),
      });
    }
    return wedges;
  }

  getScadaOscillogramPoints(hours: DtekHourSchedule[]): string {
    if (!hours || hours.length === 0) return '';
    const pts: string[] = [];
    for (const h of hours) {
      const hZero = h.hour - 1;
      const x1 = hZero * 30;
      const xMid = x1 + 15;
      const x2 = x1 + 30;
      const y1 = h.firstHalfPower ? 18 : 62;
      const y2 = h.secondHalfPower ? 18 : 62;
      pts.push(`${x1},${y1}`, `${xMid},${y1}`, `${xMid},${y2}`, `${x2},${y2}`);
    }
    return pts.join(' ');
  }

  getNextTransitionSummary(
    hours: DtekHourSchedule[],
    currentHourNumber: number,
    currentMinute: number
  ): { label: string; time: string; remainingHoursText: string; isCurrentlyOn: boolean } {
    const intervals = this.getGroupedIntervals(hours, currentHourNumber, currentMinute);
    const active = intervals.find((iv) => iv.containsCurrentTime) || intervals[0];
    if (!active) {
      return {
        label: 'За графіком',
        time: '24:00',
        remainingHoursText: '—',
        isCurrentlyOn: true,
      };
    }
    return {
      label: active.state === 'on' ? 'Світло за графіком до' : 'Відключення за графіком до',
      time: active.toTime,
      remainingHoursText: `${active.fromTime} – ${active.toTime} (${active.durationHours} год)`,
      isCurrentlyOn: active.state === 'on',
    };
  }
}
