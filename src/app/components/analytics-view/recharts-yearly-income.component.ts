import {
  ChangeDetectionStrategy,
  Component,
  Input,
  computed,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { YearlyIncomeItem, YearlyIncomeSummary } from './recharts-wrapper';

@Component({
  selector: 'app-recharts-yearly-income',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="w-full space-y-4">
      <!-- Control Bar & Quick Stats -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/90 p-3.5 rounded-xl border border-slate-200/80">
        <div class="flex items-center gap-2">
          <span class="text-xs font-semibold text-slate-700">Режим перегляду:</span>
          <div class="inline-flex rounded-lg bg-slate-200/80 p-0.5 text-xs">
            <button
              type="button"
              (click)="viewType.set('composed')"
              class="px-3 py-1 rounded-md font-medium transition-all cursor-pointer"
              [class.bg-white]="viewType() === 'composed'"
              [class.text-slate-900]="viewType() === 'composed'"
              [class.shadow-2xs]="viewType() === 'composed'"
              [class.font-bold]="viewType() === 'composed'"
              [class.text-slate-600]="viewType() !== 'composed'"
            >
              Стовпчики + YTD тренд
            </button>
            <button
              type="button"
              (click)="viewType.set('bars')"
              class="px-3 py-1 rounded-md font-medium transition-all cursor-pointer"
              [class.bg-white]="viewType() === 'bars'"
              [class.text-slate-900]="viewType() === 'bars'"
              [class.shadow-2xs]="viewType() === 'bars'"
              [class.font-bold]="viewType() === 'bars'"
              [class.text-slate-600]="viewType() !== 'bars'"
            >
              Тільки місяці
            </button>
            <button
              type="button"
              (click)="viewType.set('area')"
              class="px-3 py-1 rounded-md font-medium transition-all cursor-pointer"
              [class.bg-white]="viewType() === 'area'"
              [class.text-slate-900]="viewType() === 'area'"
              [class.shadow-2xs]="viewType() === 'area'"
              [class.font-bold]="viewType() === 'area'"
              [class.text-slate-600]="viewType() !== 'area'"
            >
              Градієнтна площа
            </button>
          </div>
        </div>

        <!-- Quick Highlights Badge -->
        <div class="flex flex-wrap items-center gap-2 text-xs">
          <span class="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200/80 font-medium flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
            YTD {{ currentYear() }}: <strong class="font-bold font-mono">{{ (summary?.totalYearIncome || 0).toLocaleString('uk-UA') }} ₴</strong>
          </span>
          <span class="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 border border-blue-200/80 font-medium">
            Сер.: <strong class="font-bold font-mono">{{ (summary?.averageMonthlyIncome || 0).toLocaleString('uk-UA') }} ₴/міс</strong>
          </span>
          @if (summary?.highestMonth; as highest) {
            <span class="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200/80 font-medium">
              Пік: <strong class="font-bold">{{ highest.monthName }}</strong> ({{ highest.amount.toLocaleString('uk-UA') }} ₴)
            </span>
          }
        </div>
      </div>

      <!-- Chart Canvas -->
      <div class="relative w-full h-[340px] sm:h-[380px] pt-1 select-none">
        @if (data.length === 0) {
          <div class="h-full flex items-center justify-center text-slate-400 text-xs">
            Немає даних за поточний рік
          </div>
        } @else {
          <svg class="w-full h-full overflow-visible" viewBox="0 0 800 340" preserveAspectRatio="none">
            <defs>
              <linearGradient id="yearlyBarGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#10b981" stop-opacity="0.9" />
                <stop offset="100%" stop-color="#059669" stop-opacity="0.7" />
              </linearGradient>
              <linearGradient id="yearlyAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stop-color="#10b981" stop-opacity="0.6" />
                <stop offset="95%" stop-color="#10b981" stop-opacity="0.05" />
              </linearGradient>
            </defs>

            <!-- Grid Lines -->
            @for (g of gridLines(); track $index) {
              <line
                x1="40"
                [attr.y1]="g.pos"
                x2="780"
                [attr.y2]="g.pos"
                stroke="#e2e8f0"
                stroke-dasharray="3 3"
                stroke-width="1"
              />
              <text x="35" [attr.y]="g.pos + 4" text-anchor="end" font-size="10" fill="#94a3b8">
                {{ g.label }}
              </text>
            }

            <!-- Average Income Line -->
            @if (avgLineY(); as avgY) {
              <line
                x1="40"
                [attr.y1]="avgY"
                x2="780"
                [attr.y2]="avgY"
                stroke="#f59e0b"
                stroke-dasharray="4 4"
                stroke-width="1.5"
              />
              <text x="775" [attr.y]="avgY - 4" text-anchor="end" font-size="9" fill="#f59e0b" font-weight="600">
                Сер.: {{ (summary?.averageMonthlyIncome || 0).toLocaleString('uk-UA') }} ₴
              </text>
            }

            <!-- Area fill if viewType === 'area' -->
            @if (viewType() === 'area') {
              <path [attr.d]="areaPath()" fill="url(#yearlyAreaGrad)" />
              <path [attr.d]="incomeLinePath()" fill="none" stroke="#059669" stroke-width="2.5" />
            }

            <!-- Bars if composed or bars -->
            @if (viewType() === 'composed' || viewType() === 'bars') {
              @for (item of computedPoints(); track item.data.monthKey; let idx = $index) {
                <rect
                  [attr.x]="item.barX"
                  [attr.y]="item.barY"
                  [attr.width]="item.barW"
                  [attr.height]="item.barH"
                  rx="5"
                  [attr.fill]="item.fillColor"
                  class="transition-all hover:opacity-90"
                />
              }
            }

            <!-- Line for Cumulative YTD Income (composed mode) -->
            @if (viewType() === 'composed') {
              <path [attr.d]="cumulativeLinePath()" fill="none" stroke="#6366f1" stroke-width="3" />
              @for (item of computedPoints(); track item.data.monthKey) {
                @if (item.data.cumulativeIncome > 0) {
                  <circle
                    [attr.cx]="item.centerX"
                    [attr.cy]="item.cumulativeY"
                    r="4"
                    fill="#6366f1"
                    stroke="#ffffff"
                    stroke-width="1.5"
                  />
                }
              }
            }

            <!-- X Axis -->
            <line x1="40" y1="280" x2="780" y2="280" stroke="#cbd5e1" stroke-width="1" />
            @for (item of computedPoints(); track item.data.monthKey) {
              <text
                [attr.x]="item.centerX"
                y="300"
                text-anchor="middle"
                font-size="11"
                [attr.fill]="item.data.isCurrent ? '#047857' : '#475569'"
                [attr.font-weight]="item.data.isCurrent ? '700' : '500'"
              >
                {{ item.data.monthShort }}
              </text>
            }

            <!-- Hover Hit areas -->
            @for (item of computedPoints(); track item.data.monthKey; let idx = $index) {
              <rect
                [attr.x]="item.hitX"
                y="10"
                [attr.width]="item.hitW"
                height="270"
                fill="transparent"
                class="cursor-pointer"
                (mouseenter)="hoveredIndex.set(idx)"
                (mouseleave)="hoveredIndex.set(null)"
              />
            }
          </svg>

          <!-- Interactive Tooltip overlay -->
          @if (activeItem(); as item) {
            <div
              class="absolute z-20 pointer-events-none bg-slate-900 text-white p-3.5 rounded-xl shadow-xl border border-slate-700/80 text-xs space-y-2 min-w-[220px] transform -translate-x-1/2 -translate-y-full"
              [style.left.%]="activeItemPos()?.leftPct"
              [style.top.%]="activeItemPos()?.topPct"
            >
              <div class="font-bold text-sm text-slate-100 border-b border-slate-800 pb-1.5 flex items-center justify-between">
                <span>{{ item.monthName }} {{ item.year }}</span>
                @if (item.isCurrent) {
                  <span class="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-3xs uppercase font-bold tracking-wider flex items-center gap-1">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    Поточний
                  </span>
                } @else if (item.isFuture) {
                  <span class="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-3xs font-medium">
                    Очікується
                  </span>
                } @else {
                  <span class="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-3xs font-medium">
                    Минулий
                  </span>
                }
              </div>
              <div class="space-y-1.5">
                <div class="flex items-center justify-between text-emerald-400">
                  <span class="flex items-center gap-1.5">
                    <span class="w-2.5 h-2.5 rounded bg-emerald-500"></span>
                    Дохід за місяць:
                  </span>
                  <strong class="font-bold text-sm">+{{ item.totalIncome.toLocaleString('uk-UA') }} ₴</strong>
                </div>
                <div class="flex items-center justify-between text-slate-300">
                  <span>Кількість оплат:</span>
                  <strong class="font-semibold">{{ item.paymentsCount }} шт.</strong>
                </div>
                @if (item.paymentsCount > 0) {
                  <div class="flex items-center justify-between text-slate-400 text-2xs">
                    <span>Середній чек:</span>
                    <span>{{ item.averagePayment.toLocaleString('uk-UA') }} ₴</span>
                  </div>
                }
                @if (item.growthPct !== null && item.growthPct !== undefined) {
                  <div class="flex items-center justify-between pt-1 border-t border-slate-800 text-2xs">
                    <span>Динаміка росту:</span>
                    <span
                      class="font-bold flex items-center gap-0.5"
                      [class.text-emerald-400]="item.growthPct >= 0"
                      [class.text-rose-400]="item.growthPct < 0"
                    >
                      {{ item.growthPct >= 0 ? '▲ +' : '▼ ' }}{{ item.growthPct }}%
                    </span>
                  </div>
                }
                <div class="flex items-center justify-between pt-1 border-t border-slate-800 text-amber-300">
                  <span>Накопичувальний YTD:</span>
                  <strong class="font-bold">{{ item.cumulativeIncome.toLocaleString('uk-UA') }} ₴</strong>
                </div>
              </div>
            </div>
          }
        }
      </div>

      <!-- Footer Months Legend & Quick Insight -->
      <div class="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-2xs text-slate-500">
        <div class="flex items-center gap-3">
          <span class="flex items-center gap-1.5">
            <span class="w-2.5 h-2.5 rounded bg-emerald-700"></span>
            <span>Поточний місяць</span>
          </span>
          <span class="flex items-center gap-1.5">
            <span class="w-2.5 h-2.5 rounded bg-emerald-500"></span>
            <span>Минулі місяці з оплатами</span>
          </span>
          <span class="flex items-center gap-1.5">
            <span class="w-2.5 h-2.5 rounded bg-slate-300"></span>
            <span>Майбутні періоди року</span>
          </span>
          <span class="flex items-center gap-1.5">
            <span class="w-4 h-0.5 bg-amber-500"></span>
            <span>Середньомісячний дохід</span>
          </span>
          @if (viewType() === 'composed') {
            <span class="flex items-center gap-1.5">
              <span class="w-4 h-1 bg-indigo-500 rounded"></span>
              <span>Накопичувальний YTD</span>
            </span>
          }
        </div>
        <span class="italic">
          * Дані оновлюються у реальному часі при додаванні оплат абонентів
        </span>
      </div>
    </div>
  `,
})
export class RechartsYearlyIncomeComponent {
  @Input() data: YearlyIncomeItem[] = [];
  @Input() summary: YearlyIncomeSummary | null = null;

  readonly viewType = signal<'composed' | 'bars' | 'area'>('composed');
  readonly hoveredIndex = signal<number | null>(null);

  readonly currentYear = computed(() => this.summary?.year || new Date().getFullYear());

  readonly maxIncome = computed(() => {
    let max = 1000;
    for (const d of this.data) {
      if (d.totalIncome > max) max = d.totalIncome;
    }
    return Math.ceil(max * 1.15);
  });

  readonly maxCumulative = computed(() => {
    let max = 1000;
    for (const d of this.data) {
      if (d.cumulativeIncome > max) max = d.cumulativeIncome;
    }
    return Math.ceil(max * 1.1);
  });

  readonly gridLines = computed(() => {
    const max = this.maxIncome();
    const steps = [0, 0.33, 0.66, 1];
    return steps.map((s) => {
      const val = Math.round(max * (1 - s));
      const pos = 20 + s * 260;
      return { val, pos, label: `${val.toLocaleString('uk-UA')} ₴` };
    });
  });

  readonly avgLineY = computed(() => {
    const avg = this.summary?.averageMonthlyIncome || 0;
    if (avg <= 0) return null;
    const max = this.maxIncome();
    const pos = 280 - (avg / max) * 260;
    return pos > 20 ? pos : 20;
  });

  readonly computedPoints = computed(() => {
    const n = this.data.length;
    if (n === 0) return [];
    const maxInc = this.maxIncome();
    const maxCum = this.maxCumulative();
    const chartLeft = 50;
    const chartWidth = 720;
    const chartBaseY = 280;
    const chartH = 260;
    const slotW = chartWidth / n;
    const barW = Math.min(36, slotW - 14);

    return this.data.map((item, idx) => {
      const centerX = chartLeft + idx * slotW + slotW / 2;
      const hitX = chartLeft + idx * slotW;
      const incH = Math.max(item.totalIncome > 0 ? 3 : 0, (item.totalIncome / maxInc) * chartH);
      const barY = chartBaseY - incH;
      const barX = centerX - barW / 2;

      let fillColor = '#10b981';
      if (item.isCurrent) {
        fillColor = '#047857';
      } else if (item.isFuture) {
        fillColor = '#cbd5e1';
      } else if (item.totalIncome === 0) {
        fillColor = '#e2e8f0';
      }

      const cumH = Math.max(0, (item.cumulativeIncome / maxCum) * chartH);
      const cumulativeY = chartBaseY - cumH;

      return {
        data: item,
        centerX,
        hitX,
        hitW: slotW,
        barX,
        barY,
        barW,
        barH: incH,
        fillColor,
        cumulativeY,
      };
    });
  });

  readonly incomeLinePath = computed(() => {
    const pts = this.computedPoints();
    if (pts.length === 0) return '';
    return pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.centerX} ${p.barY}`)
      .join(' ');
  });

  readonly areaPath = computed(() => {
    const pts = this.computedPoints();
    if (pts.length === 0) return '';
    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.centerX} ${p.barY}`).join(' ');
    const last = pts[pts.length - 1];
    const first = pts[0];
    return `${line} L ${last.centerX} 280 L ${first.centerX} 280 Z`;
  });

  readonly cumulativeLinePath = computed(() => {
    const pts = this.computedPoints().filter((p) => p.data.cumulativeIncome > 0);
    if (pts.length === 0) return '';
    return pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.centerX} ${p.cumulativeY}`)
      .join(' ');
  });

  readonly activeItem = computed(() => {
    const idx = this.hoveredIndex();
    if (idx === null || !this.data[idx]) return null;
    return this.data[idx];
  });

  readonly activeItemPos = computed(() => {
    const idx = this.hoveredIndex();
    const pts = this.computedPoints();
    if (idx === null || !pts[idx]) return null;
    const pt = pts[idx];
    return {
      leftPct: (pt.centerX / 800) * 100,
      topPct: 40,
    };
  });
}
