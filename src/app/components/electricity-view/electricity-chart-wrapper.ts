export interface ElectricityTimelinePoint {
  id: string;
  date: string;
  dateFormatted: string;
  isControlOnly: boolean;
  isDual: boolean;
  readingT1: number;
  readingT2?: number;
  consumptionT1: number;
  consumptionT2?: number;
  totalConsumption: number;
  cost: number;
  days: number;
  dailyRate: number; // кВт·г/добу
}

export interface ElectricityMonthlySummary {
  monthKey: string;
  monthName: string;
  monthShort: string;
  totalKwh: number;
  dayKwh: number;
  nightKwh: number;
  totalCost: number;
  readingsCount: number;
  controlCount: number;
  billingCount: number;
  nightSharePct: number;
  winterLimit: number;
  isWinterSeason: boolean;
}

export interface ElectricityStatsKPIs {
  totalKwhAllTime: number;
  avgDailyRateLatest: number;
  avgDailyRateMonth: number;
  projectedMonthKwh: number;
  nightSavingsUah: number;
  controlReadingsCount: number;
  billingReadingsCount: number;
  isDualTariff: boolean;
  winterLimitKwh: number;
}
