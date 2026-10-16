import React, { useState } from 'react';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';

export interface MonthlyChartItem {
  monthKey: string;
  monthName: string;
  totalIncome: number;
  totalExpenses: number;
  netProfit: number;
  paymentsCount: number;
  depositsCount: number;
  usdDeposits: number;
  usdExpenses: number;
  isCurrent?: boolean;
}

interface RechartsDynamicsChartProps {
  data: MonthlyChartItem[];
  providerBalanceUsd: number;
  isProviderBalanceLow: boolean;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const item: MonthlyChartItem = payload[0].payload;
    return (
      <div className="bg-slate-900 text-white p-3.5 rounded-xl shadow-xl border border-slate-700/80 text-xs space-y-2 min-w-[200px]">
        <div className="font-bold text-sm text-slate-100 border-b border-slate-800 pb-1.5 flex items-center justify-between">
          <span>{item.monthName}</span>
          {item.isCurrent && (
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-3xs uppercase font-bold">
              Поточний
            </span>
          )}
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-emerald-400">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              Доходи (₴):
            </span>
            <strong className="font-bold">+{item.totalIncome.toLocaleString('uk-UA')} ₴</strong>
          </div>
          <div className="flex items-center justify-between text-rose-400">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-400"></span>
              Витрати (₴):
            </span>
            <strong className="font-bold">-{item.totalExpenses.toLocaleString('uk-UA')} ₴</strong>
          </div>
          <div className="flex items-center justify-between text-amber-300 pt-1 border-t border-slate-800">
            <span>Чистий прибуток:</span>
            <strong className="font-bold">{item.netProfit.toLocaleString('uk-UA')} ₴</strong>
          </div>
        </div>
        <div className="pt-1.5 border-t border-slate-800/80 text-3xs text-slate-400 space-y-0.5">
          <div className="flex justify-between">
            <span>Оплат від клієнтів:</span>
            <strong className="text-slate-300">{item.paymentsCount} шт</strong>
          </div>
          <div className="flex justify-between">
            <span>Поповнень провайдера:</span>
            <strong className="text-slate-300">${item.usdDeposits} USD</strong>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export const RechartsDynamicsChart: React.FC<RechartsDynamicsChartProps> = ({
  data,
  providerBalanceUsd,
  isProviderBalanceLow,
}) => {
  const [chartType, setChartType] = useState<'composed' | 'bar' | 'area'>('composed');

  return (
    <div className="w-full space-y-4">
      {/* Chart Control Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/80 p-3 rounded-xl border border-slate-200/80">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-700">Вигляд графіку:</span>
          <div className="inline-flex rounded-lg bg-slate-200/80 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setChartType('composed')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                chartType === 'composed'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Комбінований
            </button>
            <button
              type="button"
              onClick={() => setChartType('bar')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                chartType === 'bar'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Стовпчики
            </button>
            <button
              type="button"
              onClick={() => setChartType('area')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                chartType === 'area'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Площини (Об'єм)
            </button>
          </div>
        </div>

        {/* Balance Status Indicator on Chart */}
        <div className="flex items-center gap-2">
          <span className="text-2xs text-slate-500">Баланс провайдера:</span>
          <span
            className={`px-2.5 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 ${
              isProviderBalanceLow
                ? 'bg-rose-100 text-rose-800 border border-rose-300'
                : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isProviderBalanceLow ? 'bg-rose-500 animate-ping' : 'bg-emerald-500'
              }`}
            ></span>
            ${providerBalanceUsd.toFixed(2)} USD
          </span>
        </div>
      </div>

      {/* Chart Canvas Container */}
      <div className="h-[320px] sm:h-[360px] w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'composed' ? (
            <ComposedChart data={data} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <defs>
                <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.2} />
                </linearGradient>
                <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.2} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="monthName" tick={{ fontSize: 11, fill: '#64748b' }} stroke="#cbd5e1" />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} stroke="#cbd5e1" />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
              <Bar dataKey="totalIncome" name="Доходи (₴)" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={40} />
              <Bar dataKey="totalExpenses" name="Витрати (₴)" fill="#f43f5e" radius={[6, 6, 0, 0]} maxBarSize={40} />
              <Line
                type="monotone"
                dataKey="netProfit"
                name="Прибуток (₴)"
                stroke="#0284c7"
                strokeWidth={3}
                dot={{ r: 4, fill: '#0284c7' }}
                activeDot={{ r: 6 }}
              />
            </ComposedChart>
          ) : chartType === 'bar' ? (
            <BarChart data={data} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="monthName" tick={{ fontSize: 11, fill: '#64748b' }} stroke="#cbd5e1" />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} stroke="#cbd5e1" />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
              <Bar dataKey="totalIncome" name="Доходи (₴)" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={45} />
              <Bar dataKey="totalExpenses" name="Витрати (₴)" fill="#f43f5e" radius={[6, 6, 0, 0]} maxBarSize={45} />
            </BarChart>
          ) : (
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <defs>
                <linearGradient id="areaIncomeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="areaExpenseGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="monthName" tick={{ fontSize: 11, fill: '#64748b' }} stroke="#cbd5e1" />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} stroke="#cbd5e1" />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
              <Area
                type="monotone"
                dataKey="totalIncome"
                name="Доходи (₴)"
                stroke="#10b981"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#areaIncomeGrad)"
              />
              <Area
                type="monotone"
                dataKey="totalExpenses"
                name="Витрати (₴)"
                stroke="#f43f5e"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#areaExpenseGrad)"
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// =========================================================================
// CURRENT YEAR REVENUE DYNAMICS (RECHARTS)
// =========================================================================

export interface YearlyIncomeItem {
  monthIndex: number;
  monthKey: string;
  monthName: string;
  monthShort: string;
  year: number;
  totalIncome: number;
  paymentsCount: number;
  averagePayment: number;
  cumulativeIncome: number;
  growthPct: number | null;
  isCurrent: boolean;
  isPast: boolean;
  isFuture: boolean;
}

export interface YearlyIncomeSummary {
  year: number;
  totalYearIncome: number;
  averageMonthlyIncome: number;
  totalYearPaymentsCount: number;
  highestMonth: {
    monthName: string;
    amount: number;
  } | null;
  currentMonthIncome: number;
  projectedYearEndIncome: number;
}

export interface RechartsYearlyIncomeChartProps {
  data: YearlyIncomeItem[];
  summary: YearlyIncomeSummary;
}

const CustomYearlyTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const item: YearlyIncomeItem = payload[0].payload;
    return (
      <div className="bg-slate-900 text-white p-3.5 rounded-xl shadow-xl border border-slate-700/80 text-xs space-y-2 min-w-[220px]">
        <div className="font-bold text-sm text-slate-100 border-b border-slate-800 pb-1.5 flex items-center justify-between">
          <span>{item.monthName} {item.year}</span>
          {item.isCurrent ? (
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-3xs uppercase font-bold tracking-wider flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Поточний
            </span>
          ) : item.isFuture ? (
            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-3xs font-medium">
              Очікується
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-3xs font-medium">
              Минулий
            </span>
          )}
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-emerald-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-emerald-500"></span>
              Дохід за місяць:
            </span>
            <strong className="font-bold text-sm">+{item.totalIncome.toLocaleString('uk-UA')} ₴</strong>
          </div>
          <div className="flex items-center justify-between text-slate-300">
            <span>Кількість оплат:</span>
            <strong className="font-semibold">{item.paymentsCount} шт.</strong>
          </div>
          {item.paymentsCount > 0 && (
            <div className="flex items-center justify-between text-slate-400 text-2xs">
              <span>Середній чек:</span>
              <span>{item.averagePayment.toLocaleString('uk-UA')} ₴</span>
            </div>
          )}
          {item.growthPct !== null && item.growthPct !== undefined && (
            <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-2xs">
              <span>Динаміка росту:</span>
              <span className={`font-bold flex items-center gap-0.5 ${item.growthPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {item.growthPct >= 0 ? '▲ +' : '▼ '}{item.growthPct}%
              </span>
            </div>
          )}
          <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-amber-300">
            <span>Накопичувальний YTD:</span>
            <strong className="font-bold">{item.cumulativeIncome.toLocaleString('uk-UA')} ₴</strong>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export const RechartsYearlyIncomeChart: React.FC<RechartsYearlyIncomeChartProps> = ({
  data,
  summary,
}) => {
  const [viewType, setViewType] = useState<'composed' | 'bars' | 'area'>('composed');

  const currentYear = summary?.year || new Date().getFullYear();
  const avgIncome = summary?.averageMonthlyIncome || 0;

  return (
    <div className="w-full space-y-4">
      {/* Control Bar & Quick Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/90 p-3.5 rounded-xl border border-slate-200/80">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-700">Режим перегляду:</span>
          <div className="inline-flex rounded-lg bg-slate-200/80 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setViewType('composed')}
              className={`px-3 py-1 rounded-md font-medium transition-all cursor-pointer ${
                viewType === 'composed'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Стовпчики + YTD тренд
            </button>
            <button
              type="button"
              onClick={() => setViewType('bars')}
              className={`px-3 py-1 rounded-md font-medium transition-all cursor-pointer ${
                viewType === 'bars'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Тільки місяці
            </button>
            <button
              type="button"
              onClick={() => setViewType('area')}
              className={`px-3 py-1 rounded-md font-medium transition-all cursor-pointer ${
                viewType === 'area'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Градієнтна площа
            </button>
          </div>
        </div>

        {/* Quick Highlights Badge */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200/80 font-medium flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            YTD {currentYear}: <strong className="font-bold font-mono">{(summary?.totalYearIncome || 0).toLocaleString('uk-UA')} ₴</strong>
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 border border-blue-200/80 font-medium">
            Сер.: <strong className="font-bold font-mono">{avgIncome.toLocaleString('uk-UA')} ₴/міс</strong>
          </span>
          {summary?.highestMonth && (
            <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200/80 font-medium">
              Пік: <strong className="font-bold">{summary.highestMonth.monthName}</strong> ({summary.highestMonth.amount.toLocaleString('uk-UA')} ₴)
            </span>
          )}
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="h-[340px] sm:h-[380px] w-full pt-1">
        <ResponsiveContainer width="100%" height="100%">
          {viewType === 'composed' ? (
            <ComposedChart data={data} margin={{ top: 15, right: 15, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="yearlyBarGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="#059669" stopOpacity={0.7} />
                </linearGradient>
                <linearGradient id="yearlyCumulativeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="monthShort"
                tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }}
                stroke="#cbd5e1"
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11, fill: '#64748b' }}
                stroke="#cbd5e1"
                tickFormatter={(v) => `${v.toLocaleString('uk-UA')} ₴`}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 10, fill: '#6366f1' }}
                stroke="#c7d2fe"
                tickFormatter={(v) => `${v.toLocaleString('uk-UA')} ₴`}
              />
              <Tooltip content={<CustomYearlyTooltip />} />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
              {avgIncome > 0 && (
                <ReferenceLine
                  yAxisId="left"
                  y={avgIncome}
                  stroke="#f59e0b"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                />
              )}
              <Bar
                yAxisId="left"
                dataKey="totalIncome"
                name="Дохід за місяць (₴)"
                radius={[6, 6, 0, 0]}
                maxBarSize={38}
              >
                {data.map((entry, index) => {
                  let fill = '#10b981';
                  if (entry.isCurrent) {
                    fill = '#047857'; // Highlight current month
                  } else if (entry.isFuture) {
                    fill = '#e2e8f0'; // Faded for future months
                  } else if (entry.totalIncome === 0) {
                    fill = '#cbd5e1';
                  } else {
                    fill = '#10b981';
                  }
                  return <Cell key={`cell-${index}`} fill={fill} />;
                })}
              </Bar>
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="cumulativeIncome"
                name="Накопичувальний дохід YTD (₴)"
                stroke="#6366f1"
                strokeWidth={3}
                dot={{ r: 3.5, fill: '#6366f1' }}
                activeDot={{ r: 6 }}
              />
            </ComposedChart>
          ) : viewType === 'bars' ? (
            <BarChart data={data} margin={{ top: 15, right: 15, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="monthShort"
                tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }}
                stroke="#cbd5e1"
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748b' }}
                stroke="#cbd5e1"
                tickFormatter={(v) => `${v.toLocaleString('uk-UA')} ₴`}
              />
              <Tooltip content={<CustomYearlyTooltip />} />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
              {avgIncome > 0 && (
                <ReferenceLine
                  y={avgIncome}
                  stroke="#f59e0b"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                />
              )}
              <Bar
                dataKey="totalIncome"
                name="Дохід за місяць (₴)"
                radius={[6, 6, 0, 0]}
                maxBarSize={44}
              >
                {data.map((entry, index) => {
                  let fill = '#10b981';
                  if (entry.isCurrent) {
                    fill = '#047857';
                  } else if (entry.isFuture) {
                    fill = '#e2e8f0';
                  } else if (entry.totalIncome === 0) {
                    fill = '#cbd5e1';
                  }
                  return <Cell key={`bar-${index}`} fill={fill} />;
                })}
              </Bar>
            </BarChart>
          ) : (
            <AreaChart data={data} margin={{ top: 15, right: 15, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="yearlyAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="monthShort"
                tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }}
                stroke="#cbd5e1"
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748b' }}
                stroke="#cbd5e1"
                tickFormatter={(v) => `${v.toLocaleString('uk-UA')} ₴`}
              />
              <Tooltip content={<CustomYearlyTooltip />} />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
              {avgIncome > 0 && (
                <ReferenceLine
                  y={avgIncome}
                  stroke="#f59e0b"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                />
              )}
              <Area
                type="monotone"
                dataKey="totalIncome"
                name="Дохід за місяць (₴)"
                stroke="#059669"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#yearlyAreaGrad)"
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Footer Months Legend & Quick Insight */}
      <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-2xs text-slate-500">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-emerald-700"></span>
            <span>Поточний місяць</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-emerald-500"></span>
            <span>Минулі місяці з оплатами</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-slate-300"></span>
            <span>Майбутні періоди року</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 bg-amber-500"></span>
            <span>Середньомісячний дохід</span>
          </span>
        </div>
        <span className="italic">
          * Дані оновлюються у реальному часі при додаванні оплат абонентів
        </span>
      </div>
    </div>
  );
};
