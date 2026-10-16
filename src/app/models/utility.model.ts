export type UtilityType = 'electricity' | 'water' | 'waste';
export type ElectricityTariffType = 'single' | 'dual';
export type SeasonType = 'summer' | 'winter';

export interface UtilityAccount {
  id: string;
  type: 'electricity' | 'water_waste';
  name: string; // e.g. "Квартира (вул. Шевченка)", "Дача", "Гараж"
  accountNumber: string; // Особовий рахунок
  address?: string;
  meterNumber?: string; // Номер лічильника
  electricityTariffType: ElectricityTariffType; // 'single' | 'dual'
  residentsCount?: number; // Кількість зареєстрованих осіб (для сміття)
  initialReadingT1?: number; // Початковий показник день/загальний
  initialReadingT2?: number; // Початковий показник ніч
  initialReadingWater?: number; // Початковий показник лічильника води
  waterEnabled?: boolean;
  wasteEnabled?: boolean;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface UtilityReading {
  id: string;
  accountId: string;
  utilityType: UtilityType; // 'electricity' | 'water' | 'waste'
  date: string; // YYYY-MM-DD (дата передачі показів)
  periodMonth?: string; // YYYY-MM
  readingT1?: number; // Електро T1 (або загальний), або Вода показник
  readingT2?: number; // Електро T2 (ніч)
  consumptionT1?: number; // Споживання День/Загальне (кВт·год або м³)
  consumptionT2?: number; // Споживання Ніч (кВт·год)
  rateT1?: number; // Застосований тариф День
  rateT2?: number; // Застосований тариф Ніч
  totalCost: number; // Нараховано до сплати (грн)
  season?: SeasonType; // 'summer' | 'winter'
  isPaid?: boolean;
  paidDate?: string;
  paidAmount?: number;
  note?: string;
  createdAt: string;
}

export interface TariffHistoryItem {
  id: string;
  validFrom: string; // YYYY-MM-DD
  price?: number; // для води та сміття
  rate?: number; // для однотарифного
  summerDay?: number; // для двотарифного
  summerNight?: number;
  winterDay?: number;
  winterNight?: number;
  winterLimitKwh?: number; // Ліміт зимового тарифу (кВт·год)
  note?: string;
}

export interface UtilityTariffsSettings {
  water: {
    price: number; // грн за 1 м³
    validFrom: string; // YYYY-MM-DD
    history: TariffHistoryItem[];
  };
  waste: {
    price: number; // грн на місяць
    validFrom: string; // YYYY-MM-DD
    history: TariffHistoryItem[];
  };
  electricitySingle: {
    rate: number; // грн за 1 кВт·год
    validFrom: string; // YYYY-MM-DD
    history: TariffHistoryItem[];
  };
  electricityDual: {
    validFrom: string; // YYYY-MM-DD
    summerDay: number; // Літній день (грн/кВт·год)
    summerNight: number; // Літня ніч (грн/кВт·год)
    winterDay: number; // Зимовий день (грн/кВт·год)
    winterNight: number; // Зимова ніч (грн/кВт·год)
    winterLimitKwh?: number; // Ліміт споживання за зимовим тарифом (за замовчуванням 2000 кВт·год)
    history: TariffHistoryItem[];
  };
}

export const DEFAULT_UTILITY_TARIFFS: UtilityTariffsSettings = {
  water: {
    price: 30.38,
    validFrom: '2026-01-01',
    history: [
      { id: 'wh_1', price: 30.38, validFrom: '2026-01-01', note: 'Базовий тариф на воду' },
    ],
  },
  waste: {
    price: 45.00,
    validFrom: '2026-01-01',
    history: [
      { id: 'wsh_1', price: 45.00, validFrom: '2026-01-01', note: 'Базовий тариф на вивіз сміття' },
    ],
  },
  electricitySingle: {
    rate: 4.32,
    validFrom: '2026-06-01',
    history: [
      { id: 'esh_1', rate: 4.32, validFrom: '2026-06-01', note: 'Єдиний тариф на рік' },
    ],
  },
  electricityDual: {
    validFrom: '2026-06-01',
    summerDay: 4.32,
    summerNight: 2.16,
    winterDay: 4.32,
    winterNight: 2.16,
    winterLimitKwh: 2000,
    history: [
      {
        id: 'edh_1',
        validFrom: '2026-06-01',
        summerDay: 4.32,
        summerNight: 2.16,
        winterDay: 4.32,
        winterNight: 2.16,
        winterLimitKwh: 2000,
        note: 'Базовий двозонний тариф (коефіцієнт 0.5 ніч, ліміт 2000 кВт·г)',
      },
    ],
  },
};

/**
 * Determines whether a given date falls into summer or winter season in Ukraine.
 * Winter: October 1 – April 30 (01.10 – 30.04)
 * Summer: May 1 – September 30 (01.05 – 30.09)
 */
export function getSeasonForDate(dateStr: string): SeasonType {
  if (!dateStr) return 'summer';
  const parts = dateStr.split('-');
  const m = Number(parts[1]);
  if (isNaN(m)) return 'summer';

  // Summer: May (5) through September (9)
  if (m >= 5 && m <= 9) return 'summer';

  // Winter: October (10) through April (4) [01.10 по 30.04]
  return 'winter';
}

/**
 * Resolves water rate effective on a specific date.
 */
export function resolveWaterRate(dateStr: string, tariffs: UtilityTariffsSettings): number {
  const history = tariffs.water?.history || [];
  const applicable = history
    .filter((h) => h.validFrom <= dateStr && typeof h.price === 'number')
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom));

  if (applicable.length > 0 && applicable[0].price !== undefined) {
    return applicable[0].price;
  }
  return tariffs.water?.price ?? DEFAULT_UTILITY_TARIFFS.water.price;
}

/**
 * Resolves waste removal rate effective on a specific date.
 */
export function resolveWasteRate(dateStr: string, tariffs: UtilityTariffsSettings): number {
  const history = tariffs.waste?.history || [];
  const applicable = history
    .filter((h) => h.validFrom <= dateStr && typeof h.price === 'number')
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom));

  if (applicable.length > 0 && applicable[0].price !== undefined) {
    return applicable[0].price;
  }
  return tariffs.waste?.price ?? DEFAULT_UTILITY_TARIFFS.waste.price;
}

/**
 * Resolves single-rate electricity tariff effective on a specific date.
 */
export function resolveElectricitySingleRate(dateStr: string, tariffs: UtilityTariffsSettings): number {
  const history = tariffs.electricitySingle?.history || [];
  const applicable = history
    .filter((h) => h.validFrom <= dateStr && typeof h.rate === 'number')
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom));

  if (applicable.length > 0 && applicable[0].rate !== undefined) {
    return applicable[0].rate;
  }
  return tariffs.electricitySingle?.rate ?? DEFAULT_UTILITY_TARIFFS.electricitySingle.rate;
}

export interface ElectricityDualRatesInfo {
  dayRate: number;
  nightRate: number;
  season: SeasonType;
  summerDay: number;
  summerNight: number;
  winterDay: number;
  winterNight: number;
  winterLimitKwh: number;
}

/**
 * Resolves dual-rate electricity tariffs (Day & Night) effective on a specific date and season.
 */
export function resolveElectricityDualRates(
  dateStr: string,
  tariffs: UtilityTariffsSettings
): ElectricityDualRatesInfo {
  const season = getSeasonForDate(dateStr);
  const history = tariffs.electricityDual?.history || [];
  const applicable = history
    .filter((h) => h.validFrom <= dateStr)
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom));

  const target = applicable.length > 0 ? applicable[0] : tariffs.electricityDual;

  const summerDay = target?.summerDay ?? DEFAULT_UTILITY_TARIFFS.electricityDual.summerDay;
  const summerNight = target?.summerNight ?? DEFAULT_UTILITY_TARIFFS.electricityDual.summerNight;
  const winterDay = target?.winterDay ?? DEFAULT_UTILITY_TARIFFS.electricityDual.winterDay;
  const winterNight = target?.winterNight ?? DEFAULT_UTILITY_TARIFFS.electricityDual.winterNight;
  const winterLimitKwh = target?.winterLimitKwh ?? tariffs.electricityDual?.winterLimitKwh ?? 2000;

  return {
    dayRate: season === 'summer' ? summerDay : winterDay,
    nightRate: season === 'summer' ? summerNight : winterNight,
    season,
    summerDay,
    summerNight,
    winterDay,
    winterNight,
    winterLimitKwh,
  };
}

export interface ElectricityCostResult {
  totalCost: number;
  season: SeasonType;
  totalKwh: number;
  diff1: number;
  diff2: number;
  rate1: number;
  rate2?: number;
  isWinterExceeded: boolean;
  winterLimitKwh: number;
  winterKwh?: number;
  excessKwh?: number;
  winterDayKwh?: number;
  winterNightKwh?: number;
  summerDayKwh?: number;
  summerNightKwh?: number;
  winterDayCost?: number;
  winterNightCost?: number;
  winterTotalCost?: number;
  summerDayCost?: number;
  summerNightCost?: number;
  summerTotalCost?: number;
  ratioDay?: number; // % Day
  ratioNight?: number; // % Night
  summaryText: string;
}

/**
 * Calculates electricity cost for a period taking into account:
 * 1. Single or Dual tariff
 * 2. Summer period (01.05 – 30.09) or Winter period (01.10 – 30.04)
 * 3. Winter limitation: winter rates apply up to 2000 kWh (winterLimitKwh).
 *    Any consumption exceeding 2000 kWh is billed at the summer rate,
 *    with Day and Night distributed proportionally to total Day/Night consumption.
 */
export function calculateElectricityCost(
  dateStr: string,
  diff1: number,
  diff2: number | undefined,
  tariffType: ElectricityTariffType,
  tariffs: UtilityTariffsSettings
): ElectricityCostResult {
  const season = getSeasonForDate(dateStr);
  const t1 = Math.max(0, diff1 || 0);
  const t2 = Math.max(0, diff2 || 0);
  const total = Math.round((tariffType === 'dual' ? t1 + t2 : t1) * 10) / 10;

  if (tariffType === 'single') {
    const rate1 = resolveElectricitySingleRate(dateStr, tariffs);
    const totalCost = Math.round(t1 * rate1 * 100) / 100;
    return {
      totalCost,
      season,
      totalKwh: t1,
      diff1: t1,
      diff2: 0,
      rate1,
      isWinterExceeded: false,
      winterLimitKwh: 2000,
      summaryText: `${t1.toFixed(1)} кВт·г × ${rate1} грн = ${totalCost.toFixed(2)} грн`,
    };
  }

  // Dual tariff
  const dual = resolveElectricityDualRates(dateStr, tariffs);
  const winterLimit = dual.winterLimitKwh || 2000;

  if (season === 'summer' || total <= winterLimit) {
    const rate1 = season === 'summer' ? dual.summerDay : dual.winterDay;
    const rate2 = season === 'summer' ? dual.summerNight : dual.winterNight;
    const dayCost = t1 * rate1;
    const nightCost = t2 * rate2;
    const totalCost = Math.round((dayCost + nightCost) * 100) / 100;

    const seasonLabel = season === 'summer' ? 'Літній період' : 'Зимовий період (до ліміту)';
    return {
      totalCost,
      season,
      totalKwh: total,
      diff1: t1,
      diff2: t2,
      rate1,
      rate2,
      isWinterExceeded: false,
      winterLimitKwh: winterLimit,
      winterKwh: season === 'winter' ? total : undefined,
      winterDayKwh: season === 'winter' ? t1 : undefined,
      winterNightKwh: season === 'winter' ? t2 : undefined,
      winterDayCost: season === 'winter' ? Math.round(dayCost * 100) / 100 : undefined,
      winterNightCost: season === 'winter' ? Math.round(nightCost * 100) / 100 : undefined,
      winterTotalCost: season === 'winter' ? totalCost : undefined,
      summaryText: `${seasonLabel}: День ${t1.toFixed(1)} кВт·г × ${rate1} грн + Ніч ${t2.toFixed(1)} кВт·г × ${rate2} грн = ${totalCost.toFixed(2)} грн`,
    };
  }

  // Winter season AND total > winterLimit!
  // Winter rate applies up to winterLimit (e.g. 2000 kWh).
  // Excess beyond winterLimit is billed at summer tariff!
  // Day/night is split proportionally to overall day/night consumption!
  const excessKwh = Math.round((total - winterLimit) * 10) / 10;
  const ratioDay = total > 0 ? t1 / total : 0.5;
  const ratioNight = total > 0 ? t2 / total : 0.5;

  // Split winter limit
  const winterDayKwh = winterLimit * ratioDay;
  const winterNightKwh = winterLimit * ratioNight;

  // Split excess
  const summerDayKwh = excessKwh * ratioDay;
  const summerNightKwh = excessKwh * ratioNight;

  const winterDayCost = winterDayKwh * dual.winterDay;
  const winterNightCost = winterNightKwh * dual.winterNight;
  const winterTotalCost = winterDayCost + winterNightCost;

  const summerDayCost = summerDayKwh * dual.summerDay;
  const summerNightCost = summerNightKwh * dual.summerNight;
  const summerTotalCost = summerDayCost + summerNightCost;

  const totalCost = Math.round((winterTotalCost + summerTotalCost) * 100) / 100;

  const summaryText =
    `Зимовий період (понад ${winterLimit} кВт·г): ` +
    `Зимовий тариф (до ${winterLimit} кВт·г): День ${winterDayKwh.toFixed(1)} кВт·г (по ${dual.winterDay} грн) + Ніч ${winterNightKwh.toFixed(1)} кВт·г (по ${dual.winterNight} грн) = ${(Math.round(winterTotalCost * 100) / 100).toFixed(2)} грн. ` +
    `Літній тариф (понад норму, ${excessKwh.toFixed(1)} кВт·г): День ${summerDayKwh.toFixed(1)} кВт·г (по ${dual.summerDay} грн) + Ніч ${summerNightKwh.toFixed(1)} кВт·г (по ${dual.summerNight} грн) = ${(Math.round(summerTotalCost * 100) / 100).toFixed(2)} грн. ` +
    `Разом до сплати: ${totalCost.toFixed(2)} грн.`;

  return {
    totalCost,
    season,
    totalKwh: total,
    diff1: t1,
    diff2: t2,
    rate1: dual.winterDay,
    rate2: dual.winterNight,
    isWinterExceeded: true,
    winterLimitKwh: winterLimit,
    winterKwh: winterLimit,
    excessKwh,
    winterDayKwh: Math.round(winterDayKwh * 10) / 10,
    winterNightKwh: Math.round(winterNightKwh * 10) / 10,
    summerDayKwh: Math.round(summerDayKwh * 10) / 10,
    summerNightKwh: Math.round(summerNightKwh * 10) / 10,
    winterDayCost: Math.round(winterDayCost * 100) / 100,
    winterNightCost: Math.round(winterNightCost * 100) / 100,
    winterTotalCost: Math.round(winterTotalCost * 100) / 100,
    summerDayCost: Math.round(summerDayCost * 100) / 100,
    summerNightCost: Math.round(summerNightCost * 100) / 100,
    summerTotalCost: Math.round(summerTotalCost * 100) / 100,
    ratioDay: Math.round(ratioDay * 1000) / 10, // %
    ratioNight: Math.round(ratioNight * 1000) / 10, // %
    summaryText,
  };
}
