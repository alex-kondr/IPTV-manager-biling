import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
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

          <button
            type="button"
            (click)="openOutageDisplaySettings()"
            class="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-2xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs self-start sm:self-auto shrink-0"
            title="Перейти у загальні налаштування для детального вибору варіанту відображення графіку"
          >
            <mat-icon class="text-xs leading-none">settings</mat-icon>
            <span>Налаштування вигляду графіку (10 варіантів) →</span>
          </button>
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
              @let nextTr = getNextTransitionSummary(status.hourlySchedule, status.currentHourNumber, status.currentMinute);
              <div class="space-y-3">
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
                            <span>Останнє оновлення: <strong>{{ lastUpdated() }}</strong></span>
                          </span>
                        }
                      </div>

                      <div class="text-base sm:text-xl font-black leading-tight mt-1">
                        {{ nextTr.label }} {{ nextTr.time }}
                      </div>
                    </div>

                    <!-- Counters below on left side -->
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
                    </div>
                  </div>

                  <!-- Right side: Symmetric button positioned at top right -->
                  <div class="shrink-0 self-start">
                    <button
                      type="button"
                      (click)="refresh.emit()"
                      [disabled]="isRefreshing()"
                      class="w-11 h-11 sm:w-12 sm:h-12 aspect-square rounded-xl bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-all cursor-pointer backdrop-blur border border-white/25 disabled:opacity-50 shadow-md hover:scale-105 active:scale-95"
                      title="Оновити графік з сайту ДТЕК"
                      aria-label="Оновити графік"
                    >
                      <mat-icon class="text-xl sm:text-2xl leading-none" [class.animate-spin]="isRefreshing()">sync</mat-icon>
                    </button>
                  </div>
                </div>

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

      <!-- 24-Hour Schedule Timeline Grid: Next Day -->
      @if (status.tomorrowSchedule; as tomorrow) {
        <div class="space-y-2.5 pt-3 border-t border-slate-200/80">
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
              Плановий графік на наступну добу за даними ДТЕК
            </span>
          </div>

          @if (activeOutageVariant() === 'v10_minimal_pills') {
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
                  <span
                    class="relative z-10 text-white leading-none tracking-tight drop-shadow-xs"
                  >
                    {{ hItem.fromTime }}–{{ hItem.toTime }}
                  </span>
                </div>
              }
            </div>
          } @else {
            <div class="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-1.5 pt-1">
              @for (hItem of tomorrow.hourlySchedule; track hItem.hour) {
                @let isFullPower = hItem.firstHalfPower && hItem.secondHalfPower;
                @let isFullOutage = !hItem.firstHalfPower && !hItem.secondHalfPower;
                <div
                  class="p-2 rounded-xl border text-center transition-all select-none shadow-2xs"
                  [class.bg-emerald-50]="isFullPower"
                  [class.border-emerald-300]="isFullPower"
                  [class.text-emerald-900]="isFullPower"
                  [class.bg-rose-50]="isFullOutage"
                  [class.border-rose-300]="isFullOutage"
                  [class.text-rose-900]="isFullOutage"
                  [class.bg-amber-50]="!isFullPower && !isFullOutage"
                  [class.border-amber-300]="!isFullPower && !isFullOutage"
                  [class.text-amber-900]="!isFullPower && !isFullOutage"
                  [title]="'Завтра ' + hItem.timeLabel + ': ' + hItem.statusLabel"
                >
                  <div class="text-3xs font-mono font-bold">{{ hItem.fromTime }}</div>
                  <div class="text-xs font-black mt-0.5">
                    {{ isFullPower ? 'Є' : (isFullOutage ? 'Ні' : '0.5') }}
                  </div>
                </div>
              }
            </div>
          }
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
  readonly isRefreshing = input<boolean>(false);
  readonly refresh = output<void>();

  readonly outageScheduleVariants = OUTAGE_SCHEDULE_VARIANTS;
  readonly activeOutageVariant = this.dataService.outageScheduleViewVariant;

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
