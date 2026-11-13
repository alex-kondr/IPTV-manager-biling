import { formatDateUa } from "../../models/client.model";
import {
  calculateElectricityCost,
  ControlReadingNoteAnalysis,
  ElectricityCostResult,
  ElectricityDevice,
  getSeasonForDate,
  parseControlReadingNote,
  resolveElectricityDualRates,
  resolveElectricitySingleRate,
  UtilityAccount,
  UtilityReading,
  UtilityTariffsSettings,
} from "../../models/utility.model";
import {
  DtekHourSchedule,
  DtekQueueSchedule,
  DtekShutdownInfo,
} from "../../services/iptv-data";
import {
  ElectricityMonthlySummary,
  ElectricityStatsKPIs,
  ElectricityTimelinePoint,
} from "./electricity-chart-wrapper";
import {
  OutageChronologicalInterval,
  OutageShiftQuadrant,
} from "./outage-schedule-variants";
import { cleanReadingNoteText, formatCostValue } from "./electricity-pipes";

export interface EnrichedUtilityReading extends UtilityReading {
  formattedDate: string;
  cleanedNote: string;
  totalKwh: number;
  isWinterExceeded: boolean;
  isEffectivePaid: boolean;
  formattedCost: string;
  controlAnalysis: ControlReadingNoteAnalysis | null;
}

export function hasAccountAddressHelper(acc: UtilityAccount | null | undefined): boolean {
  if (!acc) return false;
  const hasStructured = Boolean(
    acc.city && acc.city.trim() && acc.street && acc.street.trim() && acc.houseNum && acc.houseNum.trim()
  );
  const hasFreeAddress = Boolean(acc.address && acc.address.trim().length > 3);
  return hasStructured || hasFreeAddress;
}

export function getAccountFormattedAddressHelper(acc: UtilityAccount | null | undefined): string {
  if (!acc) return '';
  if (acc.city && acc.street && acc.houseNum) {
    return `${acc.city}, ${acc.street}, буд. ${acc.houseNum}`;
  }
  return acc.address?.trim() || '';
}

export function hasHouseAccountNumberHelper(acc?: UtilityAccount | null): boolean {
  const num = (acc?.accountNumber || acc?.ooekAccountNumber || '').trim();
  return num.length > 0;
}

export function getFormattedDtekAccountNumberHelper(rawNum?: string | null): string {
  const clean = (rawNum || '').trim();
  if (!clean) return '—';
  return clean.replace(/^100(\d{2}\/\d+)/, '$1');
}

export function resolveOoekBillDate(acc: UtilityAccount): string {
  const rawBillDate = (acc.ooekBillUpdatedAt || '').trim();
  if (rawBillDate) {
    const dmyMatch = rawBillDate.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (dmyMatch) {
      return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;
    }
    const isoMatch = rawBillDate.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }
  }
  if (acc.ooekCabinetLastSync && /^\d{4}-\d{2}-\d{2}/.test(acc.ooekCabinetLastSync)) {
    return acc.ooekCabinetLastSync.slice(0, 10);
  }
  return new Date().toISOString().split('T')[0];
}

export function getHouseDueInfoHelper(
  acc: UtilityAccount | null | undefined,
  readings: UtilityReading[]
): { hasDue: boolean; amount: number; isZeroOrPaid: boolean } {
  if (!acc) return { hasDue: false, amount: 0, isZeroOrPaid: true };

  if (acc.ooekBalanceUah !== undefined && acc.ooekBalanceUah !== null) {
    const amt = Number(acc.ooekBalanceUah) || 0;
    if (amt <= 0) {
      return { hasDue: true, amount: 0, isZeroOrPaid: true };
    }
    return { hasDue: true, amount: amt, isZeroOrPaid: false };
  }

  const houseUnpaid = readings.filter(
    (r) =>
      r.accountId === acc.id &&
      (r.utilityType === 'electricity' || !r.utilityType) &&
      !r.isControlOnly &&
      !r.isPaid &&
      (Number(r.totalCost) || 0) > 0
  );
  if (houseUnpaid.length > 0) {
    const sum = houseUnpaid.reduce((tot, r) => tot + (Number(r.totalCost) || 0), 0);
    return { hasDue: true, amount: Math.round(sum * 100) / 100, isZeroOrPaid: false };
  }

  const hasAnyBilling = readings.some(
    (r) => r.accountId === acc.id && (r.utilityType === 'electricity' || !r.utilityType) && !r.isControlOnly
  );
  if (hasAnyBilling) {
    return { hasDue: true, amount: 0, isZeroOrPaid: true };
  }

  return { hasDue: false, amount: 0, isZeroOrPaid: true };
}

export function isReadingPaidHelper(r: UtilityReading, acc?: UtilityAccount | null): boolean {
  if (!r) return false;
  if (r.isPaid) return true;
  if (r.isControlOnly) return true;
  if (
    acc &&
    acc.id === r.accountId &&
    acc.ooekBalanceUah !== undefined &&
    acc.ooekBalanceUah !== null &&
    acc.ooekBalanceUah <= 0
  ) {
    return true;
  }
  return false;
}

export function getEstimatedKwhFromOoekBalanceHelper(
  acc: UtilityAccount,
  tariffs: UtilityTariffsSettings
): number {
  const amountUah = Number(acc.ooekBalanceUah) || 0;
  if (amountUah <= 0) return 0;
  const date = resolveOoekBillDate(acc);
  const rate =
    acc.electricityTariffType === 'dual'
      ? resolveElectricityDualRates(date, tariffs).dayRate || 4.32
      : resolveElectricitySingleRate(date, tariffs) || 4.32;
  return Math.round((amountUah / rate) * 10) / 10;
}

export function totalConsumedKwhHelper(r: UtilityReading): number {
  const t1 = Number(r.consumptionT1) || 0;
  const t2 = Number(r.consumptionT2) || 0;
  return Math.round((t1 + t2) * 10) / 10;
}

export function isWinterLimitExceededReadingHelper(
  r: UtilityReading,
  acc: UtilityAccount | null | undefined,
  tariffs: UtilityTariffsSettings
): boolean {
  if (r.season !== 'winter') return false;
  if (acc?.electricityTariffType !== 'dual') return false;
  const total = totalConsumedKwhHelper(r);
  const limit = tariffs.electricityDual?.winterLimitKwh ?? 2000;
  return total > limit;
}

export function getReadingBreakdownHelper(
  r: UtilityReading,
  acc: UtilityAccount | null | undefined,
  tariffs: UtilityTariffsSettings
): ElectricityCostResult {
  const tariffType = acc?.electricityTariffType || 'single';
  const diff1 = Number(r.consumptionT1) || 0;
  const diff2 = r.consumptionT2 !== undefined ? Number(r.consumptionT2) : undefined;
  return calculateElectricityCost(r.date, diff1, diff2, tariffType, tariffs);
}

export function getControlNoteAnalysisHelper(
  r: UtilityReading,
  devices: ElectricityDevice[]
): ControlReadingNoteAnalysis | null {
  if (!r.note || !r.note.trim()) return null;
  const delta = (Number(r.consumptionT1) || 0) + (Number(r.consumptionT2) || 0);
  return parseControlReadingNote(r.note, delta, devices);
}

export function enrichReadingRow(
  r: UtilityReading,
  acc: UtilityAccount | null | undefined,
  tariffs: UtilityTariffsSettings,
  devices: ElectricityDevice[]
): EnrichedUtilityReading {
  return {
    ...r,
    formattedDate: formatDateUa(r.date, true),
    cleanedNote: cleanReadingNoteText(r.note),
    totalKwh: totalConsumedKwhHelper(r),
    isWinterExceeded: isWinterLimitExceededReadingHelper(r, acc, tariffs),
    isEffectivePaid: isReadingPaidHelper(r, acc),
    formattedCost: formatCostValue(r.totalCost),
    controlAnalysis: r.isControlOnly ? getControlNoteAnalysisHelper(r, devices) : null,
  };
}

export function getEffectivePrevReadingHelper(
  accountReadings: UtilityReading[],
  acc: UtilityAccount | null | undefined,
  isControl: boolean,
  targetDate: string,
  excludeId?: string | null
): { t1: number; t2: number; prevDate?: string } {
  if (!acc) return { t1: 0, t2: 0 };

  const list = accountReadings
    .filter((r) => (!excludeId || r.id !== excludeId) && (!isControl ? !r.isControlOnly : true))
    .filter((r) => r.date <= targetDate)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));

  const prior = list[0];
  if (prior) {
    return {
      t1: prior.readingT1 ?? acc.initialReadingT1 ?? 0,
      t2: prior.readingT2 ?? acc.initialReadingT2 ?? 0,
      prevDate: prior.date,
    };
  }

  return {
    t1: acc.initialReadingT1 ?? 0,
    t2: acc.initialReadingT2 ?? 0,
  };
}

export function buildElectricityTimelineData(
  accountReadings: UtilityReading[],
  acc: UtilityAccount | null
): ElectricityTimelinePoint[] {
  if (!acc || accountReadings.length === 0) return [];
  const readings = [...accountReadings].sort((a, b) => a.date.localeCompare(b.date));

  const isDual = acc.electricityTariffType === 'dual';
  const result: ElectricityTimelinePoint[] = [];

  let lastAnyT1 = acc.initialReadingT1 || 0;
  let lastAnyT2 = acc.initialReadingT2 || 0;
  let lastDate = readings[0].date;

  for (let i = 0; i < readings.length; i++) {
    const r = readings[i];
    const curT1 = r.readingT1 !== undefined ? r.readingT1 : lastAnyT1;
    const curT2 = r.readingT2 !== undefined ? r.readingT2 : lastAnyT2;

    const consT1 = r.consumptionT1 !== undefined ? r.consumptionT1 : Math.max(0, curT1 - lastAnyT1);
    const consT2 = r.consumptionT2 !== undefined ? r.consumptionT2 : Math.max(0, curT2 - lastAnyT2);
    const totalCons = isDual ? Math.round((consT1 + consT2) * 10) / 10 : Math.round(consT1 * 10) / 10;

    const curMs = new Date(r.date).getTime();
    const prevMs = new Date(i === 0 ? r.date : lastDate).getTime();
    const diffDays = Math.max(1, Math.round((curMs - prevMs) / (1000 * 60 * 60 * 24)));
    const dailyRate = i === 0 ? 0 : Math.round((totalCons / diffDays) * 10) / 10;

    result.push({
      id: r.id,
      date: r.date,
      dateFormatted: formatDateUa(r.date, true),
      isControlOnly: Boolean(r.isControlOnly),
      isDual,
      readingT1: curT1,
      readingT2: isDual ? curT2 : undefined,
      consumptionT1: consT1,
      consumptionT2: isDual ? consT2 : undefined,
      totalConsumption: totalCons,
      cost: r.totalCost || 0,
      days: i === 0 ? 0 : diffDays,
      dailyRate,
    });

    lastAnyT1 = curT1;
    lastAnyT2 = curT2;
    lastDate = r.date;
  }

  return result;
}

export function buildElectricityMonthlyData(
  list: ElectricityTimelinePoint[],
  tariffs: UtilityTariffsSettings
): ElectricityMonthlySummary[] {
  const winterLimit = tariffs.electricityDual?.winterLimitKwh || 2000;
  const monthsMap = new Map<
    string,
    {
      totalKwh: number;
      dayKwh: number;
      nightKwh: number;
      totalCost: number;
      readingsCount: number;
      controlCount: number;
      billingCount: number;
    }
  >();

  for (const item of list) {
    const monthKey = item.date.substring(0, 7);
    const current = monthsMap.get(monthKey) || {
      totalKwh: 0,
      dayKwh: 0,
      nightKwh: 0,
      totalCost: 0,
      readingsCount: 0,
      controlCount: 0,
      billingCount: 0,
    };

    current.totalKwh += item.totalConsumption;
    current.dayKwh += item.consumptionT1;
    current.nightKwh += item.consumptionT2 || 0;
    current.totalCost += item.cost;
    current.readingsCount++;
    if (item.isControlOnly) {
      current.controlCount++;
    } else {
      current.billingCount++;
    }
    monthsMap.set(monthKey, current);
  }

  const monthNamesUa: Record<string, string> = {
    '01': 'Січень',
    '02': 'Лютий',
    '03': 'Березень',
    '04': 'Квітень',
    '05': 'Травень',
    '06': 'Червень',
    '07': 'Липень',
    '08': 'Серпень',
    '09': 'Вересень',
    '10': 'Жовтень',
    '11': 'Листопад',
    '12': 'Грудень',
  };
  const monthShortsUa: Record<string, string> = {
    '01': 'Січ',
    '02': 'Лют',
    '03': 'Бер',
    '04': 'Кві',
    '05': 'Тра',
    '06': 'Чер',
    '07': 'Лип',
    '08': 'Сер',
    '09': 'Вер',
    '10': 'Жов',
    '11': 'Лис',
    '12': 'Гру',
  };

  const sortedKeys = Array.from(monthsMap.keys()).sort();
  return sortedKeys.map((key) => {
    const parts = key.split('-');
    const y = parts[0];
    const m = parts[1];
    const data = monthsMap.get(key)!;
    const totalKwh = Math.round(data.totalKwh * 10) / 10;
    const nightKwh = Math.round(data.nightKwh * 10) / 10;
    const nightSharePct = totalKwh > 0 ? Math.round((nightKwh / totalKwh) * 100) : 0;
    const season = getSeasonForDate(`${key}-15`);

    return {
      monthKey: key,
      monthName: `${monthNamesUa[m] || m} ${y}`,
      monthShort: `${monthShortsUa[m] || m} ${y.substring(2)}`,
      totalKwh,
      dayKwh: Math.round(data.dayKwh * 10) / 10,
      nightKwh,
      totalCost: Math.round(data.totalCost * 100) / 100,
      readingsCount: data.readingsCount,
      controlCount: data.controlCount,
      billingCount: data.billingCount,
      nightSharePct,
      winterLimit,
      isWinterSeason: season === 'winter',
    };
  });
}

export function buildElectricityStatsKPIs(
  timeline: ElectricityTimelinePoint[],
  acc: UtilityAccount | null,
  tariffs: UtilityTariffsSettings
): ElectricityStatsKPIs {
  const isDualTariff = acc?.electricityTariffType === 'dual';
  const winterLimitKwh = tariffs.electricityDual?.winterLimitKwh || 2000;

  let totalKwhAllTime = 0;
  let totalNightKwh = 0;
  let controlReadingsCount = 0;
  let billingReadingsCount = 0;

  for (const pt of timeline) {
    totalKwhAllTime += pt.totalConsumption;
    totalNightKwh += pt.consumptionT2 || 0;
    if (pt.isControlOnly) {
      controlReadingsCount++;
    } else {
      billingReadingsCount++;
    }
  }

  let avgDailyRateLatest = 0;
  for (let i = timeline.length - 1; i >= 0; i--) {
    if (timeline[i].dailyRate > 0) {
      avgDailyRateLatest = timeline[i].dailyRate;
      break;
    }
  }

  const nowMs = Date.now();
  const ms30Days = 30 * 24 * 60 * 60 * 1000;
  let kwhLast30 = 0;
  let daysLast30 = 0;
  for (const pt of timeline) {
    const ptMs = new Date(pt.date).getTime();
    if (nowMs - ptMs <= ms30Days && pt.days > 0) {
      kwhLast30 += pt.totalConsumption;
      daysLast30 += pt.days;
    }
  }
  const avgDailyRateMonth =
    daysLast30 > 0 ? Math.round((kwhLast30 / daysLast30) * 10) / 10 : avgDailyRateLatest;

  const effectiveDaily = avgDailyRateLatest > 0 ? avgDailyRateLatest : avgDailyRateMonth;
  const projectedMonthKwh = Math.round(effectiveDaily * 30.5 * 10) / 10;

  const dualRates = resolveElectricityDualRates(new Date().toISOString().split('T')[0], tariffs);
  const savingsPerKwh = Math.max(0, dualRates.dayRate - dualRates.nightRate);
  const nightSavingsUah = Math.round(totalNightKwh * savingsPerKwh * 100) / 100;

  return {
    totalKwhAllTime: Math.round(totalKwhAllTime * 10) / 10,
    avgDailyRateLatest,
    avgDailyRateMonth,
    projectedMonthKwh,
    nightSavingsUah,
    controlReadingsCount,
    billingReadingsCount,
    isDualTariff,
    winterLimitKwh,
  };
}

export function computeDtekStatusSummary(info: DtekShutdownInfo | null, manualQueue: string | null) {
  if (!info) return null;

  const now = new Date();
  const currentHourNumber = info.currentKyivHour || now.getHours() + 1;
  const currentMinute = now.getMinutes();

  let isFactOutageNow = false;
  if (info.startDate && info.endDate) {
    const start = new Date(info.startDate);
    const end = new Date(info.endDate);
    isFactOutageNow = now >= start && now <= end;
  }

  const chosenQueue = manualQueue || (info.queueGroup ? info.queueGroup.replace('GPV', '') : '3.1');
  const matchedQueue = (info.allQueuesSchedules || []).find(
    (q) => q.queueNumber === chosenQueue || q.queueKey === `GPV${chosenQueue}`
  );
  const scheduleList = matchedQueue?.hourlySchedule || info.hourlySchedule || [];
  const currentHourItem = scheduleList.find((item) => item.hour === currentHourNumber) || null;

  let isScheduledPowerOn = true;
  if (currentHourItem) {
    if (currentMinute < 30) {
      isScheduledPowerOn = currentHourItem.firstHalfPower;
    } else {
      isScheduledPowerOn = currentHourItem.secondHalfPower;
    }
  }

  const isPowerAvailableNow = !isFactOutageNow && isScheduledPowerOn;

  let totalPowerHours = 0;
  let totalOutageHours = 0;

  for (const h of scheduleList) {
    if (h.firstHalfPower && h.secondHalfPower) {
      totalPowerHours += 1;
    } else if (!h.firstHalfPower && !h.secondHalfPower) {
      totalOutageHours += 1;
    } else {
      totalPowerHours += 0.5;
      totalOutageHours += 0.5;
    }
  }

  const dailySchedules = info.dailySchedules || [];
  const tomorrowSchedule =
    info.tomorrowSchedule || (dailySchedules.length > 1 ? dailySchedules[1] : null);

  return {
    info,
    now,
    currentHourNumber,
    currentMinute,
    isFactOutageNow,
    isScheduledPowerOn,
    isPowerAvailableNow,
    currentHourItem,
    totalPowerHours,
    totalOutageHours,
    queueGroup: 'GPV' + chosenQueue,
    scheduleDate: info.scheduleDate || info.updateFact?.split(' ')[0] || '',
    startDate: info.startDate || null,
    endDate: info.endDate || null,
    subType: info.subType || '',
    subStatus: info.subStatus || '',
    updateFact: info.updateFact || '',
    updateFactKyiv: info.updateFact
      ? info.updateFact.includes('Києв')
        ? info.updateFact
        : `${info.updateFact} (за Києвом)`
      : '',
    hourlySchedule: scheduleList,
    dailySchedules,
    tomorrowSchedule,
  };
}

export function buildAllQueuesListHelper(
  info: DtekShutdownInfo | null,
  scheduleDate: string
): DtekQueueSchedule[] {
  const fromServer = info?.allQueuesSchedules;
  if (Array.isArray(fromServer) && fromServer.length > 0) {
    return fromServer;
  }
  const fallbackNumbers = [
    '1.1',
    '1.2',
    '2.1',
    '2.2',
    '3.1',
    '3.2',
    '4.1',
    '4.2',
    '5.1',
    '5.2',
    '6.1',
    '6.2',
  ];
  const defaultHours: DtekHourSchedule[] = [];
  for (let h = 1; h <= 24; h++) {
    const fromHour = String(h - 1).padStart(2, '0');
    const toHour = String(h).padStart(2, '0');
    defaultHours.push({
      hour: h,
      fromTime: `${fromHour}:00`,
      toTime: `${toHour}:00`,
      timeLabel: `${fromHour}:00 - ${toHour}:00`,
      statusKey: 'yes',
      statusLabel: 'Світло є',
      firstHalfPower: true,
      secondHalfPower: true,
    });
  }
  return fallbackNumbers.map((num) => ({
    queueKey: `GPV${num}`,
    queueNumber: num,
    queueTitle: `Черга ${num}`,
    scheduleDate,
    isPowerAvailableNow: true,
    totalPowerHours: 24,
    totalOutageHours: 0,
    outageIntervals: [],
    hourlySchedule: defaultHours,
    tomorrowSchedule: null,
  }));
}

export function getGroupedIntervalsHelper(
  hours: DtekHourSchedule[],
  currentHourNumber = 0,
  currentMinute = 0
): OutageChronologicalInterval[] {
  if (!hours || hours.length === 0) return [];
  const halfSlots: {
    slotIdx: number;
    hour: number;
    fromTime: string;
    toTime: string;
    state: 'on' | 'off';
    isNow: boolean;
  }[] = [];

  for (const h of hours) {
    const hZero = h.hour - 1;
    const hh = String(hZero).padStart(2, '0');
    const hhNext = String(h.hour).padStart(2, '0');
    const isCurHour = h.hour === currentHourNumber;
    halfSlots.push({
      slotIdx: hZero * 2,
      hour: h.hour,
      fromTime: `${hh}:00`,
      toTime: `${hh}:30`,
      state: h.firstHalfPower ? 'on' : 'off',
      isNow: isCurHour && currentMinute < 30,
    });
    halfSlots.push({
      slotIdx: hZero * 2 + 1,
      hour: h.hour,
      fromTime: `${hh}:30`,
      toTime: `${hhNext}:00`,
      state: h.secondHalfPower ? 'on' : 'off',
      isNow: isCurHour && currentMinute >= 30,
    });
  }

  const grouped: OutageChronologicalInterval[] = [];
  for (const slot of halfSlots) {
    const prev = grouped[grouped.length - 1];
    if (prev && prev.state === slot.state) {
      prev.toTime = slot.toTime;
      prev.durationHours = Math.round((prev.durationHours + 0.5) * 10) / 10;
      prev.endHour = slot.hour;
      if (slot.isNow) prev.containsCurrentTime = true;
    } else {
      grouped.push({
        id: `${slot.fromTime}_${slot.state}`,
        fromTime: slot.fromTime,
        toTime: slot.toTime,
        durationHours: 0.5,
        state: slot.state,
        containsCurrentTime: slot.isNow,
        startHour: slot.hour,
        endHour: slot.hour,
      });
    }
  }
  return grouped;
}

export function getShiftQuadrantsHelper(
  hours: DtekHourSchedule[],
  currentHourNumber = 0
): OutageShiftQuadrant[] {
  const defs = [
    {
      id: 'night',
      title: 'Нічна зміна',
      timeRange: '00:00 – 06:00',
      icon: 'dark_mode',
      accentClass: 'from-indigo-950/90 to-slate-900 text-white border-indigo-500/30',
      badgeClass: 'bg-indigo-500/20 text-indigo-200 border-indigo-400/30',
      minH: 1,
      maxH: 6,
    },
    {
      id: 'morning',
      title: 'Ранковий пік',
      timeRange: '06:00 – 12:00',
      icon: 'wb_twilight',
      accentClass: 'from-amber-50 to-orange-50/70 text-slate-900 border-amber-200',
      badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
      minH: 7,
      maxH: 12,
    },
    {
      id: 'afternoon',
      title: 'Денна фаза',
      timeRange: '12:00 – 18:00',
      icon: 'light_mode',
      accentClass: 'from-sky-50 to-emerald-50/50 text-slate-900 border-sky-200',
      badgeClass: 'bg-sky-100 text-sky-900 border-sky-300',
      minH: 13,
      maxH: 18,
    },
    {
      id: 'evening',
      title: 'Вечірній пік',
      timeRange: '18:00 – 24:00',
      icon: 'nights_stay',
      accentClass: 'from-slate-900 to-purple-950/90 text-white border-purple-500/30',
      badgeClass: 'bg-purple-500/20 text-purple-200 border-purple-400/30',
      minH: 19,
      maxH: 24,
    },
  ];

  return defs.map((d) => {
    const slice = (hours || []).filter((h) => h.hour >= d.minH && h.hour <= d.maxH);
    let powerHours = 0;
    let outageHours = 0;
    for (const h of slice) {
      powerHours += (h.firstHalfPower ? 0.5 : 0) + (h.secondHalfPower ? 0.5 : 0);
      outageHours += (!h.firstHalfPower ? 0.5 : 0) + (!h.secondHalfPower ? 0.5 : 0);
    }
    return {
      id: d.id,
      title: d.title,
      timeRange: d.timeRange,
      icon: d.icon,
      accentClass: d.accentClass,
      badgeClass: d.badgeClass,
      powerHours: Math.round(powerHours * 10) / 10,
      outageHours: Math.round(outageHours * 10) / 10,
      containsCurrentHour: currentHourNumber >= d.minH && currentHourNumber <= d.maxH,
      hours: slice,
    };
  });
}
