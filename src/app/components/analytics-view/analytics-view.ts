import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { IptvData } from '../../services/iptv-data';
import { RechartsChartComponent } from './recharts-chart.component';
import { RechartsYearlyIncomeComponent } from './recharts-yearly-income.component';

@Component({
  selector: 'app-analytics-view',
  standalone: true,
  imports: [MatIconModule, RechartsChartComponent, RechartsYearlyIncomeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div id="analytics-container" class="space-y-6">
      <!-- Real-Time Stats Metric Grid -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <!-- 1. Current Month Revenue -->
        <div class="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Дохід за цей місяць
            </span>
            <div class="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <mat-icon class="text-lg">paid</mat-icon>
            </div>
          </div>
          <div class="text-2xl font-bold text-slate-900 tracking-tight">
            {{ stats().currentMonthRevenue.toLocaleString('uk-UA') }} ₴
          </div>
          <div class="text-xs text-slate-500 mt-1 flex items-center gap-1">
            <mat-icon class="text-xs text-emerald-600">check</mat-icon>
            <span>Оплат цього місяця: <strong>{{ stats().paymentsThisMonthCount }}</strong></span>
          </div>
        </div>

        <!-- 2. Projected Monthly Revenue -->
        <div class="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Очікуваний дохід / План
            </span>
            <div class="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <mat-icon class="text-lg">trending_up</mat-icon>
            </div>
          </div>
          <div class="text-2xl font-bold text-slate-900 tracking-tight">
            {{ stats().projectedMonthlyRevenue.toLocaleString('uk-UA') }} ₴
          </div>
          <div class="text-xs text-slate-500 mt-1">
            Сума абонплат активних клієнтів
          </div>
        </div>

        <!-- 3. Active Subscribers -->
        <div class="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Активні абоненти
            </span>
            <div class="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <mat-icon class="text-lg">live_tv</mat-icon>
            </div>
          </div>
          <div class="text-2xl font-bold text-slate-900 tracking-tight">
            {{ stats().activeClients }}
            <span class="text-xs font-normal text-slate-400">/ {{ stats().totalClients }} всього</span>
          </div>
          <div class="text-xs text-amber-700 mt-1 font-medium flex items-center gap-1">
            <mat-icon class="text-xs">notification_important</mat-icon>
            <span>Закінчуються за 7 днів: {{ stats().expiringSoonClients }}</span>
          </div>
        </div>

        <!-- 4. Provider Balance & Health Indicator -->
        <div
          class="p-4 rounded-2xl bg-white border shadow-2xs transition-colors"
          [class.border-rose-300]="isProviderBalanceLow()"
          [class.border-slate-200/90]="!isProviderBalanceLow()"
        >
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Баланс провайдера ($)
            </span>
            <div
              class="w-8 h-8 rounded-lg flex items-center justify-center"
              [class.bg-rose-100]="isProviderBalanceLow()"
              [class.text-rose-600]="isProviderBalanceLow()"
              [class.bg-emerald-50]="!isProviderBalanceLow()"
              [class.text-emerald-600]="!isProviderBalanceLow()"
            >
              <mat-icon class="text-lg">account_balance</mat-icon>
            </div>
          </div>
          <div
            class="text-2xl font-bold tracking-tight"
            [class.text-rose-600]="isProviderBalanceLow()"
            [class.text-slate-900]="!isProviderBalanceLow()"
          >
            \${{ providerBalanceUsd().toFixed(2) }} USD
          </div>
          <div class="text-xs mt-1 flex items-center gap-1 font-medium">
            @if (isProviderBalanceLow()) {
              <span class="text-rose-600 flex items-center gap-1 font-bold">
                <mat-icon class="text-xs">warning</mat-icon> Потребує поповнення (&lt; $5)
              </span>
            } @else {
              <span class="text-emerald-600 flex items-center gap-1">
                <mat-icon class="text-xs">check_circle</mat-icon> Баланс у нормі
              </span>
            }
          </div>
        </div>
      </div>

      <!-- NEW: Recharts Dynamic Chart for Current Year Revenue (Січень - Грудень) -->
      <div class="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200/90 shadow-2xs">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-100">
          <div>
            <div class="flex items-center gap-2">
              <span class="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                <mat-icon class="text-xl">insights</mat-icon>
              </span>
              <h3 class="text-base sm:text-lg font-bold text-slate-900">
                Динаміка доходів по місяцях поточного {{ yearlySummary().year }} року
              </h3>
            </div>
            <p class="text-xs text-slate-500 mt-1">
              Помісячні надходження від абонентів (Січень — Грудень {{ yearlySummary().year }} р.), накопичувальний підсумок та середньомісячний орієнтир.
            </p>
          </div>
          <div class="flex items-center gap-2 self-start sm:self-auto">
            <span class="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
              Поточний {{ yearlySummary().year }} рік
            </span>
          </div>
        </div>

        <!-- 4 KPI Badges for the Current Year -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div class="p-3 rounded-xl bg-slate-50 border border-slate-200/70">
            <span class="text-3xs font-semibold uppercase text-slate-500 tracking-wider">Дохід за рік (YTD)</span>
            <div class="text-lg font-bold text-emerald-600 mt-0.5 font-mono">
              {{ yearlySummary().totalYearIncome.toLocaleString('uk-UA') }} ₴
            </div>
          </div>
          <div class="p-3 rounded-xl bg-slate-50 border border-slate-200/70">
            <span class="text-3xs font-semibold uppercase text-slate-500 tracking-wider">Середній дохід / міс</span>
            <div class="text-lg font-bold text-slate-800 mt-0.5 font-mono">
              {{ yearlySummary().averageMonthlyIncome.toLocaleString('uk-UA') }} ₴
            </div>
          </div>
          <div class="p-3 rounded-xl bg-slate-50 border border-slate-200/70">
            <span class="text-3xs font-semibold uppercase text-slate-500 tracking-wider">Піковий місяць</span>
            <div class="text-lg font-bold text-slate-800 mt-0.5 truncate">
              @if (yearlySummary().highestMonth) {
                {{ yearlySummary().highestMonth!.monthName }} ({{ yearlySummary().highestMonth!.amount.toLocaleString('uk-UA') }} ₴)
              } @else {
                —
              }
            </div>
          </div>
          <div class="p-3 rounded-xl bg-slate-50 border border-slate-200/70">
            <span class="text-3xs font-semibold uppercase text-slate-500 tracking-wider">Всього оплат за рік</span>
            <div class="text-lg font-bold text-indigo-600 mt-0.5 font-mono">
              {{ yearlySummary().totalYearPaymentsCount }} шт.
            </div>
          </div>
        </div>

        <!-- Recharts Interactive Graph for Current Year Income -->
        <div class="pt-1">
          <app-recharts-yearly-income
            [data]="yearlyIncomeData()"
            [summary]="yearlySummary()"
          ></app-recharts-yearly-income>
        </div>
      </div>

      <!-- Recharts Interactive Graph (Dynamics of Income & Expenses) -->
      <div class="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200/90 shadow-2xs">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 class="text-base font-bold text-slate-900 flex items-center gap-2">
              <mat-icon class="text-emerald-600">bar_chart</mat-icon>
              <span>Загальна динаміка: Доходи vs Витрати</span>
            </h3>
            <p class="text-xs text-slate-500">
              Аналітика фактичних надходжень від абонентів (₴) та витрат на поповнення провайдера (₴/$).
            </p>
          </div>
          <span class="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 text-slate-700 self-start sm:self-auto">
            Останні {{ chartData().length }} місяців
          </span>
        </div>

        <!-- Recharts Component Container -->
        <div class="pt-2">
          <app-recharts-chart
            [data]="chartData()"
            [providerBalanceUsd]="providerBalanceUsd()"
            [isProviderBalanceLow]="isProviderBalanceLow()"
          ></app-recharts-chart>
        </div>
      </div>

      <!-- Monthly Breakdown Table -->
      <div class="rounded-2xl bg-white border border-slate-200/90 shadow-2xs overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
          <h3 class="text-sm font-bold text-slate-900">Деталізація помісячних фінансових показників</h3>
          <span class="text-xs text-slate-500">Роздільний облік (₴ / $)</span>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs sm:text-sm">
            <thead class="bg-slate-50 text-slate-600 uppercase tracking-wider text-2xs border-b border-slate-200">
              <tr>
                <th class="px-4 py-3 font-semibold">Місяць</th>
                <th class="px-4 py-3 font-semibold text-right">Доходи (₴)</th>
                <th class="px-4 py-3 font-semibold text-right">Витрати (₴)</th>
                <th class="px-4 py-3 font-semibold text-right">Чистий прибуток</th>
                <th class="px-4 py-3 font-semibold text-center">Оплат від клієнтів</th>
                <th class="px-4 py-3 font-semibold text-right">Провайдер ($)</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (row of chartData(); track row.monthKey) {
                <tr class="hover:bg-slate-50/70 transition-colors">
                  <td class="px-4 py-3.5 font-medium text-slate-900 flex items-center gap-2">
                    <span
                      class="w-2 h-2 rounded-full"
                      [class.bg-emerald-500]="row.isCurrent"
                      [class.bg-slate-300]="!row.isCurrent"
                    ></span>
                    {{ row.monthName }}
                    @if (row.isCurrent) {
                      <span class="text-2xs px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
                        Поточний
                      </span>
                    }
                  </td>
                  <td class="px-4 py-3.5 text-right font-bold text-emerald-700">
                    +{{ row.totalIncome.toLocaleString('uk-UA') }} ₴
                  </td>
                  <td class="px-4 py-3.5 text-right font-semibold text-rose-600">
                    {{ row.totalExpenses > 0 ? '-' + row.totalExpenses.toLocaleString('uk-UA') + ' ₴' : '0 ₴' }}
                  </td>
                  <td class="px-4 py-3.5 text-right font-bold" [class.text-emerald-800]="row.netProfit >= 0" [class.text-rose-700]="row.netProfit < 0">
                    {{ row.netProfit.toLocaleString('uk-UA') }} ₴
                  </td>
                  <td class="px-4 py-3.5 text-center text-slate-600 font-medium">
                    {{ row.paymentsCount }}
                  </td>
                  <td class="px-4 py-3.5 text-right text-slate-700 font-medium">
                    \${{ row.usdDeposits || 0 }} USD
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
})
export class AnalyticsView {
  private readonly dataService = inject(IptvData);
  readonly Math = Math;

  readonly stats = this.dataService.stats;
  readonly monthlyStats = this.dataService.monthlyStats;
  readonly yearlyIncomeData = this.dataService.currentYearIncomeStats;
  readonly yearlySummary = this.dataService.currentYearSummary;
  readonly providerBalanceUsd = this.dataService.providerBalanceUsd;
  readonly isProviderBalanceLow = this.dataService.isProviderBalanceLow;

  readonly chartData = computed(() => {
    const raw = this.monthlyStats();
    if (!raw || raw.length === 0) return [];

    const now = new Date();
    const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    return raw.map((item) => ({
      ...item,
      isCurrent: item.monthKey === curKey,
    }));
  });
}


