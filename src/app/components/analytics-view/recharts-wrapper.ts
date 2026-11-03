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
