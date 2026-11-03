import {
  ChangeDetectionStrategy,
  Component,
  Input,
  computed,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MonthlyChartItem } from './recharts-wrapper';

@Component({
  selector: 'app-recharts-chart',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="w-full space-y-4">
      <!-- Chart Control Header -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/80 p-3 rounded-xl border border-slate-200/80">
        <div class="flex items-center gap-2">
          <span class="text-xs font-semibold text-slate-700">Вигляд графіку:</span>
          <div class="inline-flex rounded-lg bg-slate-200/80 p-0.5 text-xs">
            <button
              type="button"
              (click)="chartType.set('composed')"
              class="px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer"
              [class.bg-white]="chartType() === 'composed'"
              [class.text-slate-900]="chartType() === 'composed'"
              [class.shadow-2xs]="chartType() === 'composed'"
              [class.font-bold]="chartType() === 'composed'"
              [class.text-slate-600]="chartType() !== 'composed'"
            >
              Комбінований
            </button>
            <button
              type="button"
              (click)="chartType.set('bar')"
              class="px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer"
              [class.bg-white]="chartType() === 'bar'"
              [class.text-slate-900]="chartType() === 'bar'"
              [class.shadow-2xs]="chartType() === 'bar'"
              [class.font-bold]="chartType() === 'bar'"
              [class.text-slate-600]="chartType() !== 'bar'"
            >
              Стовпчики
            </button>
            <button
              type="button"
              (click)="chartType.set('area')"
              class="px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer"
              [class.bg-white]="chartType() === 'area'"
              [class.text-slate-900]="chartType() === 'area'"
              [class.shadow-2xs]="chartType() === 'area'"
              [class.font-bold]="chartType() === 'area'"
              [class.text-slate-600]="chartType() !== 'area'"
            >
              Площини (Об'єм)
            </button>
          </div>
        </div>

        <!-- Balance Status Indicator on Chart -->
        <div class="flex items-center gap-2">
          <span class="text-2xs text-slate-500">Баланс провайдера:</span>
          <span
            class="px-2.5 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1.5"
            [class.bg-rose-100]="isProviderBalanceLow"
            [class.text-rose-800]="isProviderBalanceLow"
            [class.border]="true"
            [class.border-rose-300]="isProviderBalanceLow"
            [class.bg-emerald-100]="!isProviderBalanceLow"
            [class.text-emerald-800]="!isProviderBalanceLow"
            [class.border-emerald-300]="!isProviderBalanceLow"
          >
            <span
              class="w-2 h-2 rounded-full"
              [class.bg-rose-500]="isProviderBalanceLow"
              [class.animate-ping]="isProviderBalanceLow"
              [class.bg-emerald-500]="!isProviderBalanceLow"
            ></span>
            \${{ providerBalanceUsd.toFixed(2) }} USD
          </span>
        </div>
      </div>

      <!-- Chart Canvas Container -->
      <div class="relative w-full h-[320px] sm:h-[360px] pt-2 select-none">
        @if (data.length === 0) {
          <div class="h-full flex items-center justify-center text-slate-400 text-xs">
            Немає даних для побудови графіка
          </div>
        } @else {
          <svg class="w-full h-full overflow-visible" viewBox="0 0 800 320" preserveAspectRatio="none">
            <defs>
              <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stop-color="#10b981" stop-opacity="0.8" />
                <stop offset="95%" stop-color="#10b981" stop-opacity="0.15" />
              </linearGradient>
              <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stop-color="#f43f5e" stop-opacity="0.8" />
                <stop offset="95%" stop-color="#f43f5e" stop-opacity="0.15" />
              </linearGradient>
            </defs>

            <!-- Horizontal Grid lines -->
            @for (y of gridYLines(); track $index) {
              <line
                x1="40"
                [attr.y1]="y.pos"
                x2="780"
                [attr.y2]="y.pos"
                stroke="#e2e8f0"
                stroke-dasharray="3 3"
                stroke-width="1"
              />
              <text
                x="35"
                [attr.y]="y.pos + 4"
                text-anchor="end"
                font-size="10"
                fill="#94a3b8"
              >{{ y.label }}</text>
            }

            <!-- Area fills if chartType === 'area' -->
            @if (chartType() === 'area') {
              <path [attr.d]="incomeAreaPath()" fill="url(#incomeGrad)" />
              <path [attr.d]="expenseAreaPath()" fill="url(#expenseGrad)" />
              <path [attr.d]="incomeLinePath()" fill="none" stroke="#10b981" stroke-width="2.5" />
              <path [attr.d]="expenseLinePath()" fill="none" stroke="#f43f5e" stroke-width="2.5" />
            }

            <!-- Bars if composed or bar -->
            @if (chartType() === 'composed' || chartType() === 'bar') {
              @for (item of computedPoints(); track item.data.monthKey; let idx = $index) {
                <!-- Income bar -->
                <rect
                  [attr.x]="item.incomeBarX"
                  [attr.y]="item.incomeBarY"
                  [attr.width]="item.barWidth"
                  [attr.height]="item.incomeBarH"
                  rx="4"
                  fill="#10b981"
                  class="transition-all hover:opacity-90"
                />
                <!-- Expense bar -->
                <rect
                  [attr.x]="item.expenseBarX"
                  [attr.y]="item.expenseBarY"
                  [attr.width]="item.barWidth"
                  [attr.height]="item.expenseBarH"
                  rx="4"
                  fill="#f43f5e"
                  class="transition-all hover:opacity-90"
                />
              }
            }

            <!-- Line for Net Profit (in composed mode) -->
            @if (chartType() === 'composed') {
              <path [attr.d]="profitLinePath()" fill="none" stroke="#0284c7" stroke-width="3" />
              @for (item of computedPoints(); track item.data.monthKey) {
                <circle
                  [attr.cx]="item.centerX"
                  [attr.cy]="item.profitY"
                  r="4.5"
                  fill="#0284c7"
                  stroke="#ffffff"
                  stroke-width="1.5"
                />
              }
            }

            <!-- X Axis and Labels -->
            <line x1="40" y1="270" x2="780" y2="270" stroke="#cbd5e1" stroke-width="1" />
            @for (item of computedPoints(); track item.data.monthKey) {
              <text
                [attr.x]="item.centerX"
                y="290"
                text-anchor="middle"
                font-size="11"
                fill="#64748b"
                [attr.font-weight]="item.data.isCurrent ? '700' : '400'"
              >
                {{ item.data.monthName }}
              </text>
            }

            <!-- Interactive hover areas -->
            @for (item of computedPoints(); track item.data.monthKey; let idx = $index) {
              <rect
                [attr.x]="item.hitX"
                y="10"
                [attr.width]="item.hitWidth"
                height="260"
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
              class="absolute z-20 pointer-events-none bg-slate-900 text-white p-3.5 rounded-xl shadow-xl border border-slate-700/80 text-xs space-y-2 min-w-[210px] transform -translate-x-1/2 -translate-y-full"
              [style.left.%]="activeItemPos()?.leftPct"
              [style.top.%]="activeItemPos()?.topPct"
            >
              <div class="font-bold text-sm text-slate-100 border-b border-slate-800 pb-1.5 flex items-center justify-between">
                <span>{{ item.monthName }}</span>
                @if (item.isCurrent) {
                  <span class="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-3xs uppercase font-bold">
                    Поточний
                  </span>
                }
              </div>
              <div class="space-y-1">
                <div class="flex items-center justify-between text-emerald-400">
                  <span class="flex items-center gap-1">
                    <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                    Доходи (₴):
                  </span>
                  <strong class="font-bold">+{{ item.totalIncome.toLocaleString('uk-UA') }} ₴</strong>
                </div>
                <div class="flex items-center justify-between text-rose-400">
                  <span class="flex items-center gap-1">
                    <span class="w-2 h-2 rounded-full bg-rose-400"></span>
                    Витрати (₴):
                  </span>
                  <strong class="font-bold">-{{ item.totalExpenses.toLocaleString('uk-UA') }} ₴</strong>
                </div>
                <div class="flex items-center justify-between text-amber-300 pt-1 border-t border-slate-800">
                  <span>Чистий прибуток:</span>
                  <strong class="font-bold">{{ item.netProfit.toLocaleString('uk-UA') }} ₴</strong>
                </div>
              </div>
              <div class="pt-1.5 border-t border-slate-800/80 text-3xs text-slate-400 space-y-0.5">
                <div class="flex justify-between">
                  <span>Оплат від клієнтів:</span>
                  <strong class="text-slate-300">{{ item.paymentsCount }} шт</strong>
                </div>
                <div class="flex justify-between">
                  <span>Поповнень провайдера:</span>
                  <strong class="text-slate-300">\${{ item.usdDeposits }} USD</strong>
                </div>
              </div>
            </div>
          }
        }
      </div>

      <!-- Legend -->
      <div class="flex items-center justify-center gap-6 pt-2 text-xs text-slate-600">
        <div class="flex items-center gap-2">
          <span class="w-3 h-3 rounded bg-emerald-500"></span>
          <span>Доходи (₴)</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-3 h-3 rounded bg-rose-500"></span>
          <span>Витрати (₴)</span>
        </div>
        @if (chartType() === 'composed') {
          <div class="flex items-center gap-2">
            <span class="w-4 h-1 bg-sky-600 rounded"></span>
            <span>Прибуток (₴)</span>
          </div>
        }
      </div>
    </div>
  `,
})
export class RechartsChartComponent {
  @Input() data: MonthlyChartItem[] = [];
  @Input() providerBalanceUsd = 0;
  @Input() isProviderBalanceLow = false;

  readonly chartType = signal<'composed' | 'bar' | 'area'>('composed');
  readonly hoveredIndex = signal<number | null>(null);

  readonly maxVal = computed(() => {
    let max = 1000;
    for (const d of this.data) {
      if (d.totalIncome > max) max = d.totalIncome;
      if (d.totalExpenses > max) max = d.totalExpenses;
      if (d.netProfit > max) max = d.netProfit;
    }
    return Math.ceil(max * 1.15);
  });

  readonly gridYLines = computed(() => {
    const max = this.maxVal();
    const steps = [0, 0.25, 0.5, 0.75, 1];
    return steps.map((s) => {
      const val = Math.round(max * (1 - s));
      const pos = 20 + s * 250;
      return { val, pos, label: `${val.toLocaleString('uk-UA')} ₴` };
    });
  });

  readonly computedPoints = computed(() => {
    const n = this.data.length;
    if (n === 0) return [];
    const max = this.maxVal();
    const chartLeft = 50;
    const chartWidth = 720;
    const chartBaseY = 270;
    const chartH = 250;
    const slotW = chartWidth / n;

    return this.data.map((item, idx) => {
      const centerX = chartLeft + idx * slotW + slotW / 2;
      const hitX = chartLeft + idx * slotW;
      const barW = Math.min(26, (slotW - 12) / 2);

      const incomeH = Math.max(2, (item.totalIncome / max) * chartH);
      const expenseH = Math.max(2, (item.totalExpenses / max) * chartH);

      const incomeBarX = centerX - barW - 1;
      const incomeBarY = chartBaseY - incomeH;

      const expenseBarX = centerX + 1;
      const expenseBarY = chartBaseY - expenseH;

      const profitH = Math.max(0, (item.netProfit / max) * chartH);
      const profitY = chartBaseY - profitH;

      return {
        data: item,
        centerX,
        hitX,
        hitWidth: slotW,
        barWidth: barW,
        incomeBarX,
        incomeBarY,
        incomeBarH: incomeH,
        expenseBarX,
        expenseBarY,
        expenseBarH: expenseH,
        profitY,
      };
    });
  });

  readonly incomeLinePath = computed(() => {
    const pts = this.computedPoints();
    if (pts.length === 0) return '';
    return pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.centerX} ${p.incomeBarY}`)
      .join(' ');
  });

  readonly expenseLinePath = computed(() => {
    const pts = this.computedPoints();
    if (pts.length === 0) return '';
    return pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.centerX} ${p.expenseBarY}`)
      .join(' ');
  });

  readonly incomeAreaPath = computed(() => {
    const pts = this.computedPoints();
    if (pts.length === 0) return '';
    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.centerX} ${p.incomeBarY}`).join(' ');
    const last = pts[pts.length - 1];
    const first = pts[0];
    return `${line} L ${last.centerX} 270 L ${first.centerX} 270 Z`;
  });

  readonly expenseAreaPath = computed(() => {
    const pts = this.computedPoints();
    if (pts.length === 0) return '';
    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.centerX} ${p.expenseBarY}`).join(' ');
    const last = pts[pts.length - 1];
    const first = pts[0];
    return `${line} L ${last.centerX} 270 L ${first.centerX} 270 Z`;
  });

  readonly profitLinePath = computed(() => {
    const pts = this.computedPoints();
    if (pts.length === 0) return '';
    return pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.centerX} ${p.profitY}`)
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
