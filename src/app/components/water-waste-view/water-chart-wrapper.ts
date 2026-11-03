export interface WaterTimelinePoint {
  id: string;
  date: string;
  dateFormatted: string;
  isControlOnly: boolean;
  reading: number;
  consumptionM3: number;
  litersPerDay: number;
  days: number;
  cost: number;
}

export interface WaterMonthlySummary {
  monthKey: string;
  monthName: string;
  monthShort: string;
  waterM3: number;
  waterCost: number;
  wasteCost: number;
  totalCost: number;
  readingsCount: number;
  controlCount: number;
  billingCount: number;
}

export interface WaterStatsKPIs {
  avgLitersPerDay: number;
  avgLitersPerPersonPerDay: number;
  residentsCount: number;
  totalWaterM3AllTime: number;
  projectedMonthM3: number;
  projectedMonthCost: number;
  controlCount: number;
  billingCount: number;
}
