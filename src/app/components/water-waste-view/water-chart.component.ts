import {
  ChangeDetectionStrategy,
  Component,
  Input,
  computed,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  WaterTimelinePoint,
  WaterMonthlySummary,
  WaterStatsKPIs,
} from './water-chart-wrapper';

@Component({
  selector: 'app-water-chart',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="w-full space-y-4">
      <!-- Top Metric Cards -->
      @if (stats) {
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <!-- Metric 1: Daily Consumption Rate -->
          <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 shadow-2xs">
            <div class="text-3xs uppercase tracking-wider text-slate-500 font-semibold">
              Темп споживання води
            </div>
            <div class="text-xl font-extrabold text-slate-900 mt-1">
              {{ stats.avgLitersPerDay > 0 ? Math.round(stats.avgLitersPerDay) : '—' }}
              <span class="text-xs font-normal text-slate-500">літрів / добу</span>
            </div>
            <div class="text-2xs text-slate-500 mt-1">
              {{ stats.avgLitersPerPersonPerDay > 0
                ? '~' + Math.round(stats.avgLitersPerPersonPerDay) + ' л на особу (' + stats.residentsCount + ' ос.)'
                : 'За останніми замірами' }}
            </div>
          </div>

          <!-- Metric 2: Monthly Projection -->
          <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 shadow-2xs">
            <div class="text-3xs uppercase tracking-wider text-slate-500 font-semibold">
              Прогноз на місяць
            </div>
            <div class="text-xl font-extrabold text-slate-900 mt-1 flex items-baseline gap-1.5">
              <span>{{ stats.projectedMonthM3 > 0 ? stats.projectedMonthM3.toFixed(1) : '—' }}</span>
              <span class="text-xs font-normal text-slate-500">м³</span>
            </div>
            <div class="text-2xs text-slate-500 mt-1">
              {{ stats.projectedMonthCost > 0
                ? 'Орієнтовно: ~' + stats.projectedMonthCost.toFixed(2) + ' грн'
                : 'На основі поточного темпу' }}
            </div>
          </div>

          <!-- Metric 3: Total Water Volume -->
          <div class="p-3.5 rounded-xl bg-cyan-50/70 border border-cyan-200 shadow-2xs">
            <div class="text-3xs uppercase tracking-wider text-cyan-800 font-semibold">
              Всього спожито води
            </div>
            <div class="text-xl font-extrabold text-cyan-950 mt-1">
              {{ stats.totalWaterM3AllTime.toFixed(1) }}
              <span class="text-xs font-normal text-cyan-700">м³</span>
            </div>
            <div class="text-2xs text-cyan-800 mt-1">
              {{ Math.round(stats.totalWaterM3AllTime * 1000).toLocaleString('uk-UA') }} літрів за весь час
            </div>
          </div>

          <!-- Metric 4: Control vs Billing -->
          <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 shadow-2xs">
            <div class="text-3xs uppercase tracking-wider text-slate-500 font-semibold">
              Контроль vs Розрахунки
            </div>
            <div class="text-xl font-extrabold text-slate-900 mt-1 flex items-baseline gap-2">
              <span class="text-indigo-600 font-bold" title="Контрольних замірів">
                👁️ {{ stats.controlCount }}
              </span>
              <span class="text-slate-300 font-light">/</span>
              <span class="text-cyan-600 font-bold" title="Офіційних розрахунків">
                💧 {{ stats.billingCount }}
              </span>
            </div>
            <div class="text-2xs text-slate-500 mt-1">
              Контрольні покази для моніторингу без оплат
            </div>
          </div>
        </div>
      }

      <!-- Chart Toolbar -->
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
            Динаміка споживання води (м³)
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
            Місячні витрати (Вода та Сміття)
          </button>
        </div>

        <div class="flex items-center gap-3 text-2xs text-slate-500 flex-wrap">
          <span class="flex items-center gap-1.5">
            <span class="w-2.5 h-2.5 rounded-sm bg-cyan-600"></span>
            Офіційний розрахунок
          </span>
          <span class="flex items-center gap-1.5">
            <span class="w-2.5 h-2.5 rounded-sm bg-indigo-500"></span>
            Контрольний замір
          </span>
          <span class="flex items-center gap-1.5">
            <span class="w-2.5 h-1 bg-emerald-500"></span>
            Темп (л/добу)
          </span>
        </div>
      </div>

      <!-- Canvas -->
      <div class="relative w-full h-[340px] sm:h-[380px] pt-1 select-none">
        @if (activeTab() === 'timeline') {
          @if (timeline.length === 0) {
            <div class="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
              <span>Недостатньо показів для побудови графіків.</span>
              <span class="text-3xs mt-1">Внесіть покази лічильника води для перегляду аналізу.</span>
            </div>
          } @else {
            <svg class="w-full h-full overflow-visible" viewBox="0 0 800 320" preserveAspectRatio="none">
              <!-- Grid -->
              @for (g of timelineGridLines(); track $index) {
                <line x1="45" [attr.y1]="g.pos" x2="755" [attr.y2]="g.pos" stroke="#f1f5f9" stroke-dasharray="3 3" />
                <text x="40" [attr.y]="g.pos + 4" text-anchor="end" font-size="10" fill="#94a3b8">{{ g.labelM3 }}</text>
                <text x="760" [attr.y]="g.pos + 4" text-anchor="start" font-size="10" fill="#10b981">{{ g.labelLiters }}</text>
              }

              <!-- Bars for Consumption m³ -->
              @for (item of computedTimelinePoints(); track item.data.id; let idx = $index) {
                <rect
                  [attr.x]="item.barX"
                  [attr.y]="item.barY"
                  [attr.width]="item.barW"
                  [attr.height]="item.barH"
                  rx="4"
                  [attr.fill]="item.data.isControlOnly ? '#818cf8' : '#0891b2'"
                  [attr.stroke]="item.data.isControlOnly ? '#4f46e5' : '#0e7490'"
                  [attr.stroke-dasharray]="item.data.isControlOnly ? '3 3' : '0'"
                  class="transition-all hover:opacity-90"
                />
              }

              <!-- Line for Liters per Day -->
              <path [attr.d]="timelineLitersLinePath()" fill="none" stroke="#10b981" stroke-width="2.5" />
              @for (item of computedTimelinePoints(); track item.data.id) {
                <circle [attr.cx]="item.centerX" [attr.cy]="item.litersY" r="4" fill="#10b981" stroke="#ffffff" stroke-width="1.5" />
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

            <!-- Tooltip for Timeline Point -->
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
                    <span class="px-2 py-0.5 rounded bg-cyan-500/30 text-cyan-300 text-3xs uppercase font-bold border border-cyan-400/40">
                      💧 Офіційний розрахунок
                    </span>
                  }
                </div>

                <div class="space-y-1">
                  <div class="flex justify-between text-cyan-300 font-bold">
                    <span>Спожито за період:</span>
                    <span>{{ data.consumptionM3.toFixed(2) }} м³ ({{ Math.round(data.consumptionM3 * 1000) }} л)</span>
                  </div>

                  @if (data.days > 0) {
                    <div class="flex justify-between text-emerald-400 pt-1 border-t border-slate-800/80">
                      <span>Середньодобове:</span>
                      <strong>{{ Math.round(data.litersPerDay) }} л/добу ({{ data.days }} дн.)</strong>
                    </div>
                  }

                  <div class="flex justify-between text-slate-300 pt-1 border-t border-slate-800/80">
                    <span>Нараховано до сплати:</span>
                    @if (data.isControlOnly) {
                      <span class="text-slate-400 italic">0.00 грн (без оплати)</span>
                    } @else {
                      <strong class="text-emerald-400">{{ data.cost.toFixed(2) }} грн</strong>
                    }
                  </div>
                </div>

                <div class="text-3xs text-slate-400 pt-1 border-t border-slate-800/60 font-mono">
                  Показник лічильника: {{ data.reading }} м³
                </div>
              </div>
            }
          }
        } @else {
          <!-- Monthly Tab -->
          @if (monthly.length === 0) {
            <div class="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
              <span>Немає помісячних даних водопостачання та сміття.</span>
            </div>
          } @else {
            <svg class="w-full h-full overflow-visible" viewBox="0 0 800 320" preserveAspectRatio="none">
              <!-- Grid -->
              @for (g of monthlyGridLines(); track $index) {
                <line x1="45" [attr.y1]="g.pos" x2="755" [attr.y2]="g.pos" stroke="#f1f5f9" stroke-dasharray="3 3" />
                <text x="40" [attr.y]="g.pos + 4" text-anchor="end" font-size="10" fill="#94a3b8">{{ g.labelM3 }}</text>
                <text x="760" [attr.y]="g.pos + 4" text-anchor="start" font-size="10" fill="#059669">{{ g.labelCost }}</text>
              }

              <!-- Monthly Bars for Water m³ -->
              @for (item of computedMonthlyPoints(); track item.data.monthKey; let idx = $index) {
                <rect
                  [attr.x]="item.barX"
                  [attr.y]="item.barY"
                  [attr.width]="item.barW"
                  [attr.height]="item.barH"
                  rx="5"
                  fill="#0891b2"
                  class="transition-all hover:opacity-90"
                />
              }

              <!-- Monthly Cost Line -->
              <path [attr.d]="monthlyCostLinePath()" fill="none" stroke="#059669" stroke-width="3" />
              @for (item of computedMonthlyPoints(); track item.data.monthKey) {
                <circle [attr.cx]="item.centerX" [attr.cy]="item.costY" r="4.5" fill="#059669" stroke="#ffffff" stroke-width="1.5" />
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

            <!-- Monthly Tooltip -->
            @if (activeMonthlyPoint(); as data) {
              <div
                class="absolute z-20 pointer-events-none bg-slate-900 text-white p-3.5 rounded-xl shadow-xl border border-slate-700/80 text-xs space-y-2 min-w-[220px] transform -translate-x-1/2 -translate-y-full"
                [style.left.%]="activeMonthlyPos()?.leftPct"
                [style.top.%]="activeMonthlyPos()?.topPct"
              >
                <div class="font-bold text-sm text-slate-100 border-b border-slate-800 pb-1.5 flex items-center justify-between">
                  <span>{{ data.monthName }}</span>
                </div>
                <div class="space-y-1">
                  <div class="flex justify-between text-cyan-300 font-bold">
                    <span>Водопостачання:</span>
                    <span>{{ data.waterM3.toFixed(2) }} м³ ({{ data.waterCost.toFixed(2) }} ₴)</span>
                  </div>
                  @if (data.wasteCost > 0) {
                    <div class="flex justify-between text-emerald-300">
                      <span>Вивіз сміття:</span>
                      <span>{{ data.wasteCost.toFixed(2) }} ₴</span>
                    </div>
                  }
                  <div class="flex justify-between text-white font-bold pt-1 border-t border-slate-800">
                    <span>Разом за місяць:</span>
                    <span class="text-emerald-400">{{ data.totalCost.toFixed(2) }} ₴</span>
                  </div>
                  <div class="flex justify-between text-slate-400 text-3xs pt-1 border-t border-slate-800">
                    <span>Внесено замірів води:</span>
                    <span>{{ data.readingsCount }} (з них контрольних: {{ data.controlCount }})</span>
                  </div>
                </div>
              </div>
            }
          }
        }
      </div>
    </div>
  `,
})
export class WaterChartComponent {
  @Input() timeline: WaterTimelinePoint[] = [];
  @Input() monthly: WaterMonthlySummary[] = [];
  @Input() stats!: WaterStatsKPIs;

  readonly Math = Math;
  readonly activeTab = signal<'timeline' | 'monthly'>('timeline');
  readonly hoveredTimelineIndex = signal<number | null>(null);
  readonly hoveredMonthlyIndex = signal<number | null>(null);

  // Timeline calculations
  readonly maxTimelineM3 = computed(() => {
    let max = 1;
    for (const t of this.timeline) {
      if (t.consumptionM3 > max) max = t.consumptionM3;
    }
    return Math.max(1, max * 1.2);
  });

  readonly maxTimelineLiters = computed(() => {
    let max = 50;
    for (const t of this.timeline) {
      if (t.litersPerDay > max) max = t.litersPerDay;
    }
    return Math.max(50, max * 1.2);
  });

  readonly timelineGridLines = computed(() => {
    const maxM3 = this.maxTimelineM3();
    const maxL = this.maxTimelineLiters();
    const steps = [0, 0.33, 0.66, 1];
    return steps.map((s) => {
      const pos = 20 + s * 250;
      const valM3 = (maxM3 * (1 - s)).toFixed(1);
      const valL = Math.round(maxL * (1 - s));
      return { pos, labelM3: `${valM3} м³`, labelLiters: `${valL} л/д` };
    });
  });

  readonly computedTimelinePoints = computed(() => {
    const n = this.timeline.length;
    if (n === 0) return [];
    const maxM3 = this.maxTimelineM3();
    const maxL = this.maxTimelineLiters();
    const chartLeft = 50;
    const chartWidth = 700;
    const chartBaseY = 270;
    const chartH = 250;
    const slotW = chartWidth / n;
    const barW = Math.min(36, slotW - 10);

    return this.timeline.map((item, idx) => {
      const centerX = chartLeft + idx * slotW + slotW / 2;
      const hitX = chartLeft + idx * slotW;
      const barH = Math.max(2, (item.consumptionM3 / maxM3) * chartH);
      const barY = chartBaseY - barH;
      const barX = centerX - barW / 2;

      const litersH = Math.max(0, (item.litersPerDay / maxL) * chartH);
      const litersY = chartBaseY - litersH;

      return {
        data: item,
        centerX,
        hitX,
        hitW: slotW,
        barX,
        barY,
        barW,
        barH,
        litersY,
      };
    });
  });

  readonly timelineLitersLinePath = computed(() => {
    const pts = this.computedTimelinePoints();
    if (pts.length === 0) return '';
    return pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.centerX} ${p.litersY}`)
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

  // Monthly calculations
  readonly maxMonthlyM3 = computed(() => {
    let max = 1;
    for (const m of this.monthly) {
      if (m.waterM3 > max) max = m.waterM3;
    }
    return Math.max(1, max * 1.2);
  });

  readonly maxMonthlyCost = computed(() => {
    let max = 50;
    for (const m of this.monthly) {
      if (m.totalCost > max) max = m.totalCost;
    }
    return Math.max(50, max * 1.2);
  });

  readonly monthlyGridLines = computed(() => {
    const maxM3 = this.maxMonthlyM3();
    const maxCost = this.maxMonthlyCost();
    const steps = [0, 0.33, 0.66, 1];
    return steps.map((s) => {
      const pos = 20 + s * 250;
      const valM3 = (maxM3 * (1 - s)).toFixed(1);
      const valCost = Math.round(maxCost * (1 - s));
      return { pos, labelM3: `${valM3} м³`, labelCost: `${valCost} ₴` };
    });
  });

  readonly computedMonthlyPoints = computed(() => {
    const n = this.monthly.length;
    if (n === 0) return [];
    const maxM3 = this.maxMonthlyM3();
    const maxCost = this.maxMonthlyCost();
    const chartLeft = 50;
    const chartWidth = 700;
    const chartBaseY = 270;
    const chartH = 250;
    const slotW = chartWidth / n;
    const barW = Math.min(42, slotW - 12);

    return this.monthly.map((item, idx) => {
      const centerX = chartLeft + idx * slotW + slotW / 2;
      const hitX = chartLeft + idx * slotW;
      const barH = Math.max(2, (item.waterM3 / maxM3) * chartH);
      const barY = chartBaseY - barH;
      const barX = centerX - barW / 2;

      const costH = Math.max(0, (item.totalCost / maxCost) * chartH);
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
