import {
  ChangeDetectionStrategy,
  Component,
  Input,
  computed,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ElectricityTimelinePoint,
  ElectricityMonthlySummary,
  ElectricityStatsKPIs,
} from './electricity-chart-wrapper';

@Component({
  selector: 'app-electricity-chart',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="w-full space-y-4">
      <!-- Top Metric Cards -->
      @if (stats) {
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <!-- Metric 1: Avg Daily Rate -->
          <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 shadow-2xs">
            <div class="text-3xs uppercase tracking-wider text-slate-500 font-semibold">
              Поточний темп споживання
            </div>
            <div class="text-xl font-extrabold text-slate-900 mt-1">
              {{ stats.avgDailyRateLatest > 0 ? stats.avgDailyRateLatest.toFixed(1) : '—' }}
              <span class="text-xs font-normal text-slate-500">кВт·г / добу</span>
            </div>
            <div class="text-2xs text-slate-500 mt-1">
              {{ stats.avgDailyRateMonth > 0
                ? 'Середнє за 30 днів: ' + stats.avgDailyRateMonth.toFixed(1) + ' кВт·г/д'
                : 'За останнім заміром' }}
            </div>
          </div>

          <!-- Metric 2: Month Projection -->
          <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 shadow-2xs">
            <div class="text-3xs uppercase tracking-wider text-slate-500 font-semibold">
              Прогноз на місяць
            </div>
            <div class="text-xl font-extrabold text-slate-900 mt-1 flex items-baseline gap-1.5">
              <span>{{ stats.projectedMonthKwh > 0 ? Math.round(stats.projectedMonthKwh) : '—' }}</span>
              <span class="text-xs font-normal text-slate-500">кВт·г</span>
            </div>
            <div class="text-2xs mt-1">
              @if (stats.projectedMonthKwh > stats.winterLimitKwh) {
                <span class="text-amber-700 font-medium">
                  ⚠️ Можливе перевищення ліміту {{ stats.winterLimitKwh }} кВт·г
                </span>
              } @else {
                <span class="text-emerald-700 font-medium">
                  ✓ В межах норми ({{ stats.winterLimitKwh }} кВт·г)
                </span>
              }
            </div>
          </div>

          <!-- Metric 3: Night Savings (for dual) or Total Consumption -->
          @if (stats.isDualTariff) {
            <div class="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200 shadow-2xs">
              <div class="text-3xs uppercase tracking-wider text-indigo-800 font-semibold">
                Заощаджено на нічній зоні
              </div>
              <div class="text-xl font-extrabold text-indigo-950 mt-1">
                {{ stats.nightSavingsUah > 0 ? stats.nightSavingsUah.toFixed(2) : '0.00' }}
                <span class="text-xs font-normal text-indigo-700">грн</span>
              </div>
              <div class="text-2xs text-indigo-800 mt-1">
                Завдяки 50% знижці вночі (23:00 - 07:00)
              </div>
            </div>
          } @else {
            <div class="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 shadow-2xs">
              <div class="text-3xs uppercase tracking-wider text-amber-800 font-semibold">
                Загальне споживання
              </div>
              <div class="text-xl font-extrabold text-amber-950 mt-1">
                {{ Math.round(stats.totalKwhAllTime) }}
                <span class="text-xs font-normal text-amber-700">кВт·г</span>
              </div>
              <div class="text-2xs text-amber-800 mt-1">За весь період обліку</div>
            </div>
          }

          <!-- Metric 4: Control vs Billing Readings -->
          <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 shadow-2xs">
            <div class="text-3xs uppercase tracking-wider text-slate-500 font-semibold">
              Контроль vs Розрахунки
            </div>
            <div class="text-xl font-extrabold text-slate-900 mt-1 flex items-baseline gap-2">
              <span class="text-indigo-600 font-bold" title="Контрольних замірів">
                👁️ {{ stats.controlReadingsCount }}
              </span>
              <span class="text-slate-300 font-light">/</span>
              <span class="text-amber-600 font-bold" title="Офіційних оплат">
                ⚡ {{ stats.billingReadingsCount }}
              </span>
            </div>
            <div class="text-2xs text-slate-500 mt-1">
              Контрольні заміри для динаміки без оплат
            </div>
          </div>
        </div>
      }

      <!-- Chart Control Toolbar -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
        <div class="inline-flex rounded-lg bg-slate-200/80 p-0.5 text-xs">
          <button
            type="button"
            (click)="activeTab.set('timeline')"
            class="px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer"
            [class.bg-white]="activeTab() === 'timeline'"
            [class.text-slate-900]="activeTab() === 'timeline'"
            [class.shadow-2xs]="activeTab() === 'timeline'"
            [class.text-slate-600]="activeTab() !== 'timeline'"
          >
            Динаміка замірів та темп
          </button>
          <button
            type="button"
            (click)="activeTab.set('monthly')"
            class="px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer"
            [class.bg-white]="activeTab() === 'monthly'"
            [class.text-slate-900]="activeTab() === 'monthly'"
            [class.shadow-2xs]="activeTab() === 'monthly'"
            [class.text-slate-600]="activeTab() !== 'monthly'"
          >
            Місячні підсумки (кВт·г)
          </button>
          @if (stats.isDualTariff) {
            <button
              type="button"
              (click)="activeTab.set('nightShare')"
              class="px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer"
              [class.bg-white]="activeTab() === 'nightShare'"
              [class.text-slate-900]="activeTab() === 'nightShare'"
              [class.shadow-2xs]="activeTab() === 'nightShare'"
              [class.text-slate-600]="activeTab() !== 'nightShare'"
            >
              Частка День / Ніч (%)
            </button>
          }
        </div>

        <div class="flex items-center gap-3 text-2xs text-slate-500 flex-wrap">
          <span class="flex items-center gap-1.5">
            <span class="w-2.5 h-2.5 rounded-sm bg-amber-500"></span>
            Офіційний розрахунок
          </span>
          <span class="flex items-center gap-1.5">
            <span class="w-2.5 h-2.5 rounded-sm bg-indigo-500"></span>
            Контрольний замір
          </span>
          <span class="flex items-center gap-1.5">
            <span class="w-2.5 h-1 bg-emerald-500"></span>
            Темп (кВт·г/добу)
          </span>
        </div>
      </div>

      <!-- Chart Canvas -->
      <div class="relative w-full h-[340px] sm:h-[380px] pt-1 select-none">
        @if (activeTab() === 'timeline') {
          @if (timeline.length === 0) {
            <div class="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
              <span>Недостатньо даних для побудови графіків.</span>
              <span class="text-3xs mt-1">Внесіть покази для розрахунку динаміки.</span>
            </div>
          } @else {
            <svg class="w-full h-full overflow-visible" viewBox="0 0 800 320" preserveAspectRatio="none">
              <!-- Grid Lines -->
              @for (g of timelineGrid(); track $index) {
                <line x1="45" [attr.y1]="g.pos" x2="755" [attr.y2]="g.pos" stroke="#f1f5f9" stroke-dasharray="3 3" />
                <text x="40" [attr.y]="g.pos + 4" text-anchor="end" font-size="10" fill="#94a3b8">{{ g.labelKwh }}</text>
                <text x="760" [attr.y]="g.pos + 4" text-anchor="start" font-size="10" fill="#10b981">{{ g.labelRate }}</text>
              }

              <!-- Bars: Dual tariff stacked or single -->
              @for (item of computedTimelinePoints(); track item.data.id; let idx = $index) {
                @if (stats.isDualTariff) {
                  <!-- T1 (day) bar -->
                  <rect
                    [attr.x]="item.barX"
                    [attr.y]="item.t1Y"
                    [attr.width]="item.barW"
                    [attr.height]="item.t1H"
                    [attr.fill]="item.data.isControlOnly ? '#818cf8' : '#f59e0b'"
                    [attr.stroke]="item.data.isControlOnly ? '#4f46e5' : '#d97706'"
                    [attr.stroke-dasharray]="item.data.isControlOnly ? '3 3' : '0'"
                    class="transition-all hover:opacity-90"
                  />
                  <!-- T2 (night) bar stacked on top -->
                  <rect
                    [attr.x]="item.barX"
                    [attr.y]="item.t2Y"
                    [attr.width]="item.barW"
                    [attr.height]="item.t2H"
                    rx="4"
                    [attr.fill]="item.data.isControlOnly ? '#c084fc' : '#6366f1'"
                    [attr.stroke]="item.data.isControlOnly ? '#9333ea' : '#4338ca'"
                    class="transition-all hover:opacity-90"
                  />
                } @else {
                  <rect
                    [attr.x]="item.barX"
                    [attr.y]="item.totalY"
                    [attr.width]="item.barW"
                    [attr.height]="item.totalH"
                    rx="4"
                    [attr.fill]="item.data.isControlOnly ? '#818cf8' : '#f59e0b'"
                    [attr.stroke]="item.data.isControlOnly ? '#4f46e5' : '#d97706'"
                    [attr.stroke-dasharray]="item.data.isControlOnly ? '3 3' : '0'"
                    class="transition-all hover:opacity-90"
                  />
                }
              }

              <!-- Line for Daily Rate -->
              <path [attr.d]="timelineRateLinePath()" fill="none" stroke="#10b981" stroke-width="2.5" />
              @for (item of computedTimelinePoints(); track item.data.id) {
                <circle [attr.cx]="item.centerX" [attr.cy]="item.rateY" r="4" fill="#10b981" stroke="#ffffff" stroke-width="1.5" />
              }

              <!-- X Axis -->
              <line x1="45" y1="270" x2="755" y2="270" stroke="#cbd5e1" stroke-width="1" />
              @for (item of computedTimelinePoints(); track item.data.id) {
                <text
                  [attr.x]="item.centerX"
                  y="290"
                  text-anchor="end"
                  font-size="10"
                  fill="#64748b"
                  transform-origin="item.centerX 290"
                  [attr.transform]="'rotate(-25, ' + item.centerX + ', 290)'"
                >
                  {{ item.data.dateFormatted }}
                </text>
              }

              <!-- Hover Hit Areas -->
              @for (item of computedTimelinePoints(); track item.data.id; let idx = $index) {
                <rect
                  [attr.x]="item.hitX"
                  y="10"
                  [attr.width]="item.hitW"
                  height="260"
                  fill="transparent"
                  class="cursor-pointer"
                  (mouseenter)="hoveredTimelineIndex.set(idx)"
                  (mouseleave)="hoveredTimelineIndex.set(null)"
                />
              }
            </svg>

            <!-- Tooltip for Timeline -->
            @if (activeTimelinePoint(); as data) {
              <div
                class="absolute z-20 pointer-events-none bg-slate-900 text-white p-3.5 rounded-xl shadow-xl border border-slate-700/80 text-xs space-y-2 min-w-[220px] transform -translate-x-1/2 -translate-y-full"
                [style.left.%]="activeTimelinePos()?.leftPct"
                [style.top.%]="activeTimelinePos()?.topPct"
              >
                <div class="font-bold text-sm text-slate-100 border-b border-slate-800 pb-1.5 flex items-center justify-between">
                  <span>{{ data.dateFormatted }}</span>
                  @if (data.isControlOnly) {
                    <span class="px-2 py-0.5 rounded bg-indigo-500/30 text-indigo-300 text-3xs uppercase font-bold border border-indigo-400/40">
                      👁️ Контрольний замір
                    </span>
                  } @else {
                    <span class="px-2 py-0.5 rounded bg-amber-500/30 text-amber-300 text-3xs uppercase font-bold border border-amber-400/40">
                      ⚡ Офіційний розрахунок
                    </span>
                  }
                </div>

                <div class="space-y-1">
                  @if (data.isDual) {
                    <div class="flex justify-between text-amber-300">
                      <span>День (Т1):</span>
                      <strong>{{ data.consumptionT1.toFixed(1) }} кВт·г</strong>
                    </div>
                    <div class="flex justify-between text-indigo-300">
                      <span>Ніч (Т2):</span>
                      <strong>{{ (data.consumptionT2 || 0).toFixed(1) }} кВт·г</strong>
                    </div>
                    <div class="flex justify-between text-slate-100 pt-1 border-t border-slate-800 font-bold">
                      <span>Разом спожито:</span>
                      <span>{{ data.totalConsumption.toFixed(1) }} кВт·г</span>
                    </div>
                  } @else {
                    <div class="flex justify-between text-amber-300 font-bold">
                      <span>Спожито за період:</span>
                      <span>{{ data.totalConsumption.toFixed(1) }} кВт·г</span>
                    </div>
                  }

                  @if (data.days > 0) {
                    <div class="flex justify-between text-emerald-400 pt-1 border-t border-slate-800/80">
                      <span>Темп споживання:</span>
                      <strong>{{ data.dailyRate.toFixed(1) }} кВт·г / добу ({{ data.days }} дн.)</strong>
                    </div>
                  }

                  <div class="flex justify-between text-slate-300 pt-1 border-t border-slate-800/80">
                    <span>Нарахування до оплати:</span>
                    @if (data.isControlOnly) {
                      <span class="text-slate-400 italic">0.00 грн (без оплати)</span>
                    } @else {
                      <strong class="text-emerald-400">{{ data.cost.toFixed(2) }} грн</strong>
                    }
                  </div>
                </div>

                <div class="text-3xs text-slate-400 pt-1 border-t border-slate-800/60 font-mono">
                  Покази: Т1={{ data.readingT1 }} {{ data.readingT2 !== undefined ? '| Т2=' + data.readingT2 : '' }}
                </div>
              </div>
            }
          }
        } @else if (activeTab() === 'monthly') {
          <!-- Monthly Tab -->
          @if (monthly.length === 0) {
            <div class="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
              <span>Немає помісячних даних електроенергії.</span>
            </div>
          } @else {
            <svg class="w-full h-full overflow-visible" viewBox="0 0 800 320" preserveAspectRatio="none">
              <!-- Grid Lines -->
              @for (g of monthlyGrid(); track $index) {
                <line x1="45" [attr.y1]="g.pos" x2="755" [attr.y2]="g.pos" stroke="#f1f5f9" stroke-dasharray="3 3" />
                <text x="40" [attr.y]="g.pos + 4" text-anchor="end" font-size="10" fill="#94a3b8">{{ g.labelKwh }}</text>
                <text x="760" [attr.y]="g.pos + 4" text-anchor="start" font-size="10" fill="#0284c7">{{ g.labelCost }}</text>
              }

              <!-- Winter Limit Reference Line -->
              @if (winterLimitLineY(); as wY) {
                <line x1="45" [attr.y1]="wY" x2="755" [attr.y2]="wY" stroke="#ef4444" stroke-dasharray="4 4" stroke-width="1.5" />
                <text x="750" [attr.y]="wY - 4" text-anchor="end" font-size="10" fill="#ef4444" font-weight="600">
                  Зимовий ліміт {{ stats.winterLimitKwh }} кВт·г
                </text>
              }

              <!-- Bars for totalKwh -->
              @for (item of computedMonthlyPoints(); track item.data.monthKey; let idx = $index) {
                <rect
                  [attr.x]="item.barX"
                  [attr.y]="item.barY"
                  [attr.width]="item.barW"
                  [attr.height]="item.barH"
                  rx="5"
                  [attr.fill]="item.data.totalKwh > stats.winterLimitKwh ? '#ef4444' : '#f59e0b'"
                  class="transition-all hover:opacity-90"
                />
              }

              <!-- Cost Line -->
              <path [attr.d]="monthlyCostLinePath()" fill="none" stroke="#0284c7" stroke-width="3" />
              @for (item of computedMonthlyPoints(); track item.data.monthKey) {
                <circle [attr.cx]="item.centerX" [attr.cy]="item.costY" r="4.5" fill="#0284c7" stroke="#ffffff" stroke-width="1.5" />
              }

              <!-- X Axis -->
              <line x1="45" y1="270" x2="755" y2="270" stroke="#cbd5e1" stroke-width="1" />
              @for (item of computedMonthlyPoints(); track item.data.monthKey) {
                <text [attr.x]="item.centerX" y="290" text-anchor="middle" font-size="11" fill="#64748b">
                  {{ item.data.monthShort }}
                </text>
              }

              <!-- Hover Hit Areas -->
              @for (item of computedMonthlyPoints(); track item.data.monthKey; let idx = $index) {
                <rect
                  [attr.x]="item.hitX"
                  y="10"
                  [attr.width]="item.hitW"
                  height="260"
                  fill="transparent"
                  class="cursor-pointer"
                  (mouseenter)="hoveredMonthlyIndex.set(idx)"
                  (mouseleave)="hoveredMonthlyIndex.set(null)"
                />
              }
            </svg>

            <!-- Tooltip for Monthly -->
            @if (activeMonthlyPoint(); as data) {
              <div
                class="absolute z-20 pointer-events-none bg-slate-900 text-white p-3.5 rounded-xl shadow-xl border border-slate-700/80 text-xs space-y-2 min-w-[220px] transform -translate-x-1/2 -translate-y-full"
                [style.left.%]="activeMonthlyPos()?.leftPct"
                [style.top.%]="activeMonthlyPos()?.topPct"
              >
                <div class="font-bold text-sm text-slate-100 border-b border-slate-800 pb-1.5 flex items-center justify-between">
                  <span>{{ data.monthName }}</span>
                  @if (data.isWinterSeason) {
                    <span class="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 text-3xs font-semibold">
                      ❄️ Зимовий сезон
                    </span>
                  }
                </div>
                <div class="space-y-1">
                  <div class="flex justify-between text-amber-300 font-bold">
                    <span>Всього спожито:</span>
                    <span>{{ data.totalKwh.toFixed(1) }} кВт·г</span>
                  </div>
                  @if (data.dayKwh > 0) {
                    <div class="flex justify-between text-slate-300 text-2xs">
                      <span>День (Т1):</span>
                      <span>{{ data.dayKwh.toFixed(1) }} кВт·г</span>
                    </div>
                  }
                  @if (data.nightKwh > 0) {
                    <div class="flex justify-between text-slate-300 text-2xs">
                      <span>Ніч (Т2, -50%):</span>
                      <span>{{ data.nightKwh.toFixed(1) }} кВт·г ({{ data.nightSharePct }}%)</span>
                    </div>
                  }
                  <div class="flex justify-between text-emerald-400 pt-1 border-t border-slate-800">
                    <span>Оплачено / нараховано:</span>
                    <strong>{{ data.totalCost.toFixed(2) }} грн</strong>
                  </div>
                  <div class="flex justify-between text-slate-400 text-3xs pt-1 border-t border-slate-800">
                    <span>Внесено замірів:</span>
                    <span>{{ data.readingsCount }} (з них контрольних: {{ data.controlCount }})</span>
                  </div>
                </div>
              </div>
            }
          }
        } @else {
          <!-- Night Share Tab -->
          <svg class="w-full h-full overflow-visible" viewBox="0 0 800 320" preserveAspectRatio="none">
            <!-- Grid Lines for 0-100% -->
            @for (pct of [100, 75, 50, 25, 0]; track $index) {
              <line x1="45" [attr.y1]="20 + (100 - pct) * 2.5" x2="755" [attr.y2]="20 + (100 - pct) * 2.5" stroke="#f1f5f9" stroke-dasharray="3 3" />
              <text x="40" [attr.y]="24 + (100 - pct) * 2.5" text-anchor="end" font-size="10" fill="#94a3b8">{{ pct }}%</text>
            }

            <!-- Bars for Night Share -->
            @for (item of computedMonthlyPoints(); track item.data.monthKey; let idx = $index) {
              <rect
                [attr.x]="item.barX"
                [attr.y]="270 - (item.data.nightSharePct / 100) * 250"
                [attr.width]="item.barW"
                [attr.height]="Math.max(2, (item.data.nightSharePct / 100) * 250)"
                rx="5"
                fill="#6366f1"
                class="transition-all hover:opacity-90"
              />
            }

            <!-- X Axis -->
            <line x1="45" y1="270" x2="755" y2="270" stroke="#cbd5e1" stroke-width="1" />
            @for (item of computedMonthlyPoints(); track item.data.monthKey) {
              <text [attr.x]="item.centerX" y="290" text-anchor="middle" font-size="11" fill="#64748b">
                {{ item.data.monthShort }}
              </text>
            }
          </svg>
        }
      </div>
    </div>
  `,
})
export class ElectricityChartComponent {
  @Input() timeline: ElectricityTimelinePoint[] = [];
  @Input() monthly: ElectricityMonthlySummary[] = [];
  @Input() stats!: ElectricityStatsKPIs;

  readonly Math = Math;
  readonly activeTab = signal<'timeline' | 'monthly' | 'nightShare'>('timeline');
  readonly hoveredTimelineIndex = signal<number | null>(null);
  readonly hoveredMonthlyIndex = signal<number | null>(null);

  // Timeline
  readonly maxTimelineKwh = computed(() => {
    let max = 10;
    for (const t of this.timeline) {
      if (t.totalConsumption > max) max = t.totalConsumption;
    }
    return Math.max(10, max * 1.2);
  });

  readonly maxTimelineRate = computed(() => {
    let max = 5;
    for (const t of this.timeline) {
      if (t.dailyRate > max) max = t.dailyRate;
    }
    return Math.max(5, max * 1.2);
  });

  readonly timelineGrid = computed(() => {
    const maxK = this.maxTimelineKwh();
    const maxR = this.maxTimelineRate();
    const steps = [0, 0.33, 0.66, 1];
    return steps.map((s) => {
      const pos = 20 + s * 250;
      const valK = Math.round(maxK * (1 - s));
      const valR = (maxR * (1 - s)).toFixed(1);
      return { pos, labelKwh: `${valK} кВт·г`, labelRate: `${valR} кВт·г/д` };
    });
  });

  readonly computedTimelinePoints = computed(() => {
    const n = this.timeline.length;
    if (n === 0) return [];
    const maxK = this.maxTimelineKwh();
    const maxR = this.maxTimelineRate();
    const chartLeft = 50;
    const chartWidth = 700;
    const chartBaseY = 270;
    const chartH = 250;
    const slotW = chartWidth / n;
    const barW = Math.min(38, slotW - 10);

    return this.timeline.map((item, idx) => {
      const centerX = chartLeft + idx * slotW + slotW / 2;
      const hitX = chartLeft + idx * slotW;
      const barX = centerX - barW / 2;

      const t1H = Math.max(1, (item.consumptionT1 / maxK) * chartH);
      const t2H = Math.max(0, ((item.consumptionT2 || 0) / maxK) * chartH);
      const totalH = Math.max(2, (item.totalConsumption / maxK) * chartH);

      const t1Y = chartBaseY - t1H;
      const t2Y = chartBaseY - t1H - t2H;
      const totalY = chartBaseY - totalH;

      const rateH = Math.max(0, (item.dailyRate / maxR) * chartH);
      const rateY = chartBaseY - rateH;

      return {
        data: item,
        centerX,
        hitX,
        hitW: slotW,
        barX,
        barW,
        t1H,
        t1Y,
        t2H,
        t2Y,
        totalH,
        totalY,
        rateY,
      };
    });
  });

  readonly timelineRateLinePath = computed(() => {
    const pts = this.computedTimelinePoints();
    if (pts.length === 0) return '';
    return pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.centerX} ${p.rateY}`)
      .join(' ');
  });

  readonly activeTimelinePoint = computed(() => {
    const idx = this.hoveredTimelineIndex();
    if (idx === null || !this.timeline[idx]) return null;
    return this.timeline[idx];
  });

  readonly activeTimelinePos = computed(() => {
    const idx = this.hoveredTimelineIndex();
    const pts = this.computedTimelinePoints();
    if (idx === null || !pts[idx]) return null;
    return {
      leftPct: (pts[idx].centerX / 800) * 100,
      topPct: 35,
    };
  });

  // Monthly
  readonly maxMonthlyKwh = computed(() => {
    let max = this.stats?.winterLimitKwh || 100;
    for (const m of this.monthly) {
      if (m.totalKwh > max) max = m.totalKwh;
    }
    return Math.max(100, max * 1.2);
  });

  readonly maxMonthlyCost = computed(() => {
    let max = 100;
    for (const m of this.monthly) {
      if (m.totalCost > max) max = m.totalCost;
    }
    return Math.max(100, max * 1.2);
  });

  readonly monthlyGrid = computed(() => {
    const maxK = this.maxMonthlyKwh();
    const maxC = this.maxMonthlyCost();
    const steps = [0, 0.33, 0.66, 1];
    return steps.map((s) => {
      const pos = 20 + s * 250;
      const valK = Math.round(maxK * (1 - s));
      const valC = Math.round(maxC * (1 - s));
      return { pos, labelKwh: `${valK} кВт·г`, labelCost: `${valC} ₴` };
    });
  });

  readonly winterLimitLineY = computed(() => {
    const limit = this.stats?.winterLimitKwh;
    if (!limit) return null;
    const maxK = this.maxMonthlyKwh();
    const pos = 270 - (limit / maxK) * 250;
    return pos > 20 ? pos : 20;
  });

  readonly computedMonthlyPoints = computed(() => {
    const n = this.monthly.length;
    if (n === 0) return [];
    const maxK = this.maxMonthlyKwh();
    const maxC = this.maxMonthlyCost();
    const chartLeft = 50;
    const chartWidth = 700;
    const chartBaseY = 270;
    const chartH = 250;
    const slotW = chartWidth / n;
    const barW = Math.min(46, slotW - 12);

    return this.monthly.map((item, idx) => {
      const centerX = chartLeft + idx * slotW + slotW / 2;
      const hitX = chartLeft + idx * slotW;
      const barH = Math.max(2, (item.totalKwh / maxK) * chartH);
      const barY = chartBaseY - barH;
      const barX = centerX - barW / 2;

      const costH = Math.max(0, (item.totalCost / maxC) * chartH);
      const costY = chartBaseY - costH;

      return {
        data: item,
        centerX,
        hitX,
        hitW: slotW,
        barX,
        barY,
        barW,
        barH,
        costY,
      };
    });
  });

  readonly monthlyCostLinePath = computed(() => {
    const pts = this.computedMonthlyPoints();
    if (pts.length === 0) return '';
    return pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.centerX} ${p.costY}`)
      .join(' ');
  });

  readonly activeMonthlyPoint = computed(() => {
    const idx = this.hoveredMonthlyIndex();
    if (idx === null || !this.monthly[idx]) return null;
    return this.monthly[idx];
  });

  readonly activeMonthlyPos = computed(() => {
    const idx = this.hoveredMonthlyIndex();
    const pts = this.computedMonthlyPoints();
    if (idx === null || !pts[idx]) return null;
    return {
      leftPct: (pts[idx].centerX / 800) * 100,
      topPct: 35,
    };
  });
}
