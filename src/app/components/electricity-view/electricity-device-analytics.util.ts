import { formatDateUa } from "../../models/client.model";
import {
  computeDeviceEmpiricalReadingStats,
  DailyWeatherPoint,
  ElectricityDevice,
  ElectricityDeviceLogEntry,
  getSeasonForDate,
  isAirConditionerDevice,
  parseControlReadingNote,
  resolveAirConditionerPowerProfile,
  resolveElectricityDualRates,
  resolveElectricitySingleRate,
  UtilityAccount,
  UtilityReading,
  UtilityTariffsSettings,
  UtilityWeatherResponse,
} from "../../models/utility.model";
import { ElectricityStatsKPIs } from "./electricity-chart-wrapper";

export const DEVICE_COLORS: string[] = [
  "#10b981", // emerald
  "#2563eb", // blue (EV)
  "#ea580c", // deep orange (AC Heating)
  "#0ea5e9", // sky
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#6366f1", // indigo
];

export interface DevicePresetItem {
  name: string;
  category: string;
  icon: string;
  color: string;
  powerWatts: number;
  batteryCapacityKwh?: number;
  isNightFriendly: boolean;
  notes?: string;
}

export const DEVICE_PRESETS: DevicePresetItem[] = [
  {
    name: "Кондиціонер (режим обігріву)",
    category: "heating_ac",
    icon: "mode_heat",
    color: "#ea580c",
    powerWatts: 1350,
    isNightFriendly: true,
    notes: "Обігрів кондиціонером / тепловим насосом",
  },
  {
    name: "Volkswagen E-Golf 2014 (24 кВт·год)",
    category: "ev",
    icon: "electric_car",
    color: "#2563eb",
    powerWatts: 3600,
    batteryCapacityKwh: 24,
    isNightFriendly: true,
    notes: "Електромобіль VW e-Golf 2014, батарея 24 кВт·год",
  },
  { name: "Бойлер", category: "boiler", icon: "water_drop", color: "#0ea5e9", powerWatts: 1800, isNightFriendly: true },
  { name: "Кондиціонер (охолодження)", category: "climate", icon: "ac_unit", color: "#06b6d4", powerWatts: 1100, isNightFriendly: false },
  { name: "Електрокотел / Обігрівач", category: "heating", icon: "local_fire_department", color: "#f97316", powerWatts: 2200, isNightFriendly: true },
  { name: "Пральна машина", category: "laundry", icon: "local_laundry_service", color: "#8b5cf6", powerWatts: 2000, isNightFriendly: true },
  { name: "Холодильник", category: "kitchen", icon: "kitchen", color: "#10b981", powerWatts: 200, isNightFriendly: false },
  { name: "Електроплита / Духовка", category: "kitchen", icon: "soup_kitchen", color: "#f59e0b", powerWatts: 2200, isNightFriendly: false },
  { name: "Комп’ютер / Робоче місце", category: "pc", icon: "computer", color: "#6366f1", powerWatts: 400, isNightFriendly: false },
  { name: "Зарядна станція / Інвертор", category: "power_station", icon: "battery_charging_full", color: "#14b8a6", powerWatts: 1500, isNightFriendly: true },
];

export function buildFallbackDailyWeather(dateStr: string): DailyWeatherPoint {
  const parts = (dateStr || "2026-11-10").split("-");
  const m = Number(parts[1]) || 11;
  const d = Number(parts[2]) || 10;
  const monthlyMeans: Record<number, number> = {
    1: -1.5, 2: -0.2, 3: 4.5, 4: 11.2, 5: 17.4, 6: 21.8,
    7: 24.2, 8: 23.6, 9: 18.0, 10: 11.4, 11: 4.8, 12: 0.4,
  };
  const baseMean = monthlyMeans[m] ?? 5.0;
  const wave = Math.sin(d * 0.55 + m * 1.3) * 3.4 + Math.cos(d * 1.15) * 1.8;
  const tempAvgC = Math.round((baseMean + wave) * 10) / 10;
  const swing = 3.2 + Math.abs(Math.sin(d * 0.7)) * 2.1;
  const tempMinC = Math.round((tempAvgC - swing) * 10) / 10;
  const tempMaxC = Math.round((tempAvgC + swing) * 10) / 10;
  const isSnow = tempAvgC < -0.5;
  const isRain = !isSnow && (d + m) % 4 === 0;
  return {
    date: dateStr,
    tempAvgC,
    tempMinC,
    tempMaxC,
    weatherCode: isSnow ? 71 : isRain ? 61 : 2,
    condition: isSnow ? "Сніг / Мороз" : isRain ? "Дощ / Похмуро" : "Мінлива хмарність",
    icon: isSnow ? "ac_unit" : isRain ? "water_drop" : "partly_cloudy_day",
    emoji: isSnow ? "❄️" : isRain ? "🌧️" : "⛅",
  };
}

export function getWeatherForDateFromResponse(
  weatherData: UtilityWeatherResponse | null | undefined,
  dateStr?: string | null,
  endDateStr?: string | null
): DailyWeatherPoint {
  const cleanDate =
    dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
      ? dateStr
      : new Date().toISOString().split("T")[0];
  const map = weatherData?.dailyByDate || {};

  if (endDateStr && /^\d{4}-\d{2}-\d{2}$/.test(endDateStr) && endDateStr > cleanDate) {
    const sMs = new Date(cleanDate + "T12:00:00Z").getTime();
    const eMs = new Date(endDateStr + "T12:00:00Z").getTime();
    if (!isNaN(sMs) && !isNaN(eMs) && eMs > sMs) {
      const days = Math.min(31, Math.round((eMs - sMs) / (1000 * 60 * 60 * 24)) + 1);
      let sumAvg = 0;
      let minT = 999;
      let maxT = -999;
      let firstPoint: DailyWeatherPoint | null = null;
      for (let i = 0; i < days; i++) {
        const dIso = new Date(sMs + i * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
        const pt = map[dIso] || buildFallbackDailyWeather(dIso);
        if (!firstPoint) firstPoint = pt;
        sumAvg += pt.tempAvgC;
        if (pt.tempMinC < minT) minT = pt.tempMinC;
        if (pt.tempMaxC > maxT) maxT = pt.tempMaxC;
      }
      return {
        date: cleanDate,
        tempAvgC: Math.round((sumAvg / days) * 10) / 10,
        tempMinC: minT === 999 ? 0 : minT,
        tempMaxC: maxT === -999 ? 5 : maxT,
        weatherCode: firstPoint?.weatherCode ?? 2,
        condition: firstPoint?.condition ?? "Мінлива хмарність",
        icon: firstPoint?.icon ?? "partly_cloudy_day",
        emoji: firstPoint?.emoji ?? "⛅",
      };
    }
  }

  return map[cleanDate] || buildFallbackDailyWeather(cleanDate);
}

export function getEffectiveLogWeatherPoint(
  weatherData: UtilityWeatherResponse | null | undefined,
  log: ElectricityDeviceLogEntry
): DailyWeatherPoint {
  const base = getWeatherForDateFromResponse(weatherData, log.date, log.endDate);
  const hasCustomTemp = typeof log.tempAvgC === "number" && !isNaN(log.tempAvgC);
  const tempAvgC = hasCustomTemp ? Number(log.tempAvgC) : base.tempAvgC;
  const condition = log.weatherCondition || base.condition;
  const emoji =
    log.weatherIcon ||
    (tempAvgC <= -1 ? "❄️" : tempAvgC < 6 ? "☁️" : tempAvgC >= 16 ? "☀️" : base.emoji);
  return {
    ...base,
    tempAvgC: Math.round(tempAvgC * 10) / 10,
    tempMinC: typeof log.tempMinC === "number" ? log.tempMinC : base.tempMinC,
    tempMaxC: typeof log.tempMaxC === "number" ? log.tempMaxC : base.tempMaxC,
    condition,
    emoji,
  };
}

export function getDeviceCategoryThermalSensitivityInfo(category?: string): {
  pctPerDegreeDrop: number;
  label: string;
  isHighThermal: boolean;
} {
  switch (category) {
    case "heating_ac":
      return { pctPerDegreeDrop: 5.5, label: "Висока (Обігрів / Тепловий насос)", isHighThermal: true };
    case "heating":
      return { pctPerDegreeDrop: 6.2, label: "Дуже висока (Електрообігрів)", isHighThermal: true };
    case "climate":
      return { pctPerDegreeDrop: 3.5, label: "Підвищена (Клімат-контроль)", isHighThermal: true };
    case "ev":
      return { pctPerDegreeDrop: 2.5, label: "Середня (Зарядка авто + пічка/батарея)", isHighThermal: false };
    case "boiler":
      return { pctPerDegreeDrop: 2.2, label: "Середня (Нагрів холоднішої води)", isHighThermal: false };
    default:
      return { pctPerDegreeDrop: 0.8, label: "Базова побутова", isHighThermal: false };
  }
}

export function computeDurationHoursHelper(
  startDate: string,
  endDate: string,
  startTime: string,
  endTime: string
): number | null {
  if (!startDate) return null;
  const effectiveEndDate = endDate || startDate;

  if (startTime && endTime) {
    const startIso = `${startDate}T${startTime}:00`;
    const endIso = `${effectiveEndDate}T${endTime}:00`;
    const startMs = new Date(startIso).getTime();
    let endMs = new Date(endIso).getTime();
    if (isNaN(startMs) || isNaN(endMs)) return null;
    if (effectiveEndDate === startDate && endMs <= startMs) {
      endMs += 24 * 60 * 60 * 1000;
    }
    const diffHours = (endMs - startMs) / (1000 * 60 * 60);
    return diffHours > 0 ? Math.round(diffHours * 100) / 100 : null;
  }

  if (effectiveEndDate > startDate) {
    const sMs = new Date(startDate).getTime();
    const eMs = new Date(effectiveEndDate).getTime();
    if (!isNaN(sMs) && !isNaN(eMs) && eMs > sMs) {
      const days = Math.round((eMs - sMs) / (1000 * 60 * 60 * 24));
      return days * 24;
    }
  }
  return null;
}

export function getDeviceLogDateLabelHelper(log: ElectricityDeviceLogEntry): string {
  if (log.entryMode === "period_range" && log.endDate && log.endDate !== log.date) {
    return `${formatDateUa(log.date, true)} – ${formatDateUa(log.endDate, true)}`;
  }
  return formatDateUa(log.date, true);
}

export function getDeviceLogModeBadgeHelper(log: ElectricityDeviceLogEntry): string {
  switch (log.entryMode) {
    case "single_day":
      return "За конкретну добу";
    case "period_range":
      return "За відрізок часу";
    case "delta":
      return "+ Додано дельту";
    default:
      return "Станом на дату (з поч. міс.)";
  }
}

export function getDeviceLogTimeIntervalBadgeHelper(log: ElectricityDeviceLogEntry): string {
  const parts: string[] = [];
  if (log.startTime && log.endTime) {
    parts.push(`${log.startTime}–${log.endTime}`);
  } else if (log.startTime) {
    parts.push(`з ${log.startTime}`);
  } else if (log.endTime) {
    parts.push(`до ${log.endTime}`);
  }
  if (log.durationHours && log.durationHours > 0) {
    parts.push(`${log.durationHours} год`);
  }
  return parts.join(" • ");
}

export function getDeviceLogTariffBadgeHelper(log: ElectricityDeviceLogEntry): string {
  switch (log.tariffSelection) {
    case "night_only":
      return "🌙 Ніч (Т1)";
    case "day_only":
      return "☀️ День (Т2)";
    default:
      return "⏱️ Розраховано по часу";
  }
}

export function getSmartCardArchetypeInfo(item: {
    device: ElectricityDevice;
    isAirConditioner?: boolean;
  }): 'ac' | 'boiler' | 'ev' | 'other' {
    const dev = item.device;
    const nameLower = (dev.name || '').toLowerCase();
    if (
      dev.category === 'ev' ||
      dev.icon === 'electric_car' ||
      /golf|авто|електромобіль|ev|tesla|leaf|car/i.test(nameLower) ||
      (dev.batteryCapacityKwh && dev.batteryCapacityKwh >= 12)
    ) {
      return 'ev';
    }
    if (
      dev.category === 'boiler' ||
      dev.icon === 'water_heater' ||
      /бойлер|водонагрівач|boiler/i.test(nameLower)
    ) {
      return 'boiler';
    }
    if (
      item.isAirConditioner ||
      dev.category === 'climate' ||
      dev.category === 'heating_ac' ||
      dev.icon === 'ac_unit' ||
      /кондиціонер|клімат|спліт/i.test(nameLower)
    ) {
      return 'ac';
    }
    return 'other';
  }

export function getSmartCardStatusInfoHelper(item: {
    device: ElectricityDevice;
    isAirConditioner?: boolean;
    allLogsCount?: number;
  }, isPowerOn = true): { prefix: string; value: string } {
    if (!isPowerOn) {
      return { prefix: 'Статус:', value: 'Вимкнено' };
    }
    const archetype = getSmartCardArchetypeInfo(item);
    if (archetype === 'ac') {
      const maxKw = ((item.device.powerWatts || 2200) / 1000).toFixed(1);
      return {
        prefix: 'Потужність:',
        value: `Пік ${maxKw} кВт • Роб. 0.4–0.8 кВт·г`,
      };
    }
    if (archetype === 'ev') {
      const kw = item.device.powerWatts
        ? `${(item.device.powerWatts / 1000).toFixed(1)} кВт`
        : '3.6 кВт';
      const bat = item.device.batteryCapacityKwh
        ? ` • Батарея ${item.device.batteryCapacityKwh} кВт·г`
        : '';
      return {
        prefix: 'Параметри:',
        value: `${kw}${bat}`,
      };
    }
    if (archetype === 'boiler') {
      const kw = ((item.device.powerWatts || 2000) / 1000).toFixed(1);
      return {
        prefix: 'Потужність:',
        value: `Номінал ${kw} кВт`,
      };
    }
    if (item.device.powerWatts) {
      return {
        prefix: 'Потужність:',
        value: `Номінал ${(item.device.powerWatts / 1000).toFixed(1)} кВт`,
      };
    }
    return {
      prefix: 'Облік:',
      value: item.allLogsCount ? `${item.allLogsCount} запис(ів)` : 'Активний',
    };
  }

export function getSmartCardLeftMetricInfo(item: {
    device: ElectricityDevice;
    isAirConditioner?: boolean;
    steadyOperatingWatts?: number;
    effectiveOperatingWatts?: number;
    empiricalHourlyWatts?: number | null;
    dailyPaceKwh: number;
    avgKwhPerReading: number;
    allLogsCount: number;
    attributedNotes?: Array<{ hours: number; kwh: number }>;
  }, isPowerOn = true): { value: string; unit: string; label: string; subnote?: string } {
    const label = 'Середнє за годину';
    if (!isPowerOn) {
      return { value: '0.00', unit: 'кВт·г', label, subnote: 'Прилад вимкнено' };
    }

    // 1. If logs have explicit durationHours -> exact empirical hourly kWh
    if (item.empiricalHourlyWatts !== null && item.empiricalHourlyWatts !== undefined && item.empiricalHourlyWatts > 0) {
      const hourlyKwh = item.empiricalHourlyWatts / 1000;
      return {
        value: hourlyKwh >= 1 ? hourlyKwh.toFixed(1) : hourlyKwh.toFixed(2),
        unit: 'кВт·г',
        label,
        subnote: `По часу роботи (${item.dailyPaceKwh.toFixed(2)} кВт·г/д)`,
      };
    }

    // 2. If attributed notes from meter readings have hours & kwh
    if (item.attributedNotes && item.attributedNotes.length > 0) {
      const sumH = item.attributedNotes.reduce((s, n) => s + (Number(n.hours) || 0), 0);
      const sumK = item.attributedNotes.reduce((s, n) => s + (Number(n.kwh) || 0), 0);
      if (sumH > 0 && sumK > 0) {
        const hourlyKwh = sumK / sumH;
        return {
          value: hourlyKwh >= 1 ? hourlyKwh.toFixed(1) : hourlyKwh.toFixed(2),
          unit: 'кВт·г',
          label,
          subnote: `За замірами (${sumH} год)`,
        };
      }
    }

    // 3. If monthly consumption is present -> compute hourly average from daily pace (24h)
    if (item.dailyPaceKwh > 0) {
      const avgHourly24 = item.dailyPaceKwh / 24;
      const formatted = avgHourly24 >= 1 ? avgHourly24.toFixed(1) : avgHourly24.toFixed(2);
      const sub = item.isAirConditioner
        ? `${item.dailyPaceKwh.toFixed(2)} кВт·г/д • Роб. ~${((item.steadyOperatingWatts || 600) / 1000).toFixed(1)} кВт·г/год`
        : `Темп: ${item.dailyPaceKwh.toFixed(2)} кВт·г/добу`;
      return {
        value: formatted,
        unit: 'кВт·г',
        label,
        subnote: sub,
      };
    }

    // 4. Fallback to all-time readings average if available
    if (item.allLogsCount > 0 && item.avgKwhPerReading > 0) {
      const avgHourly = item.avgKwhPerReading / 24;
      return {
        value: avgHourly >= 1 ? avgHourly.toFixed(1) : avgHourly.toFixed(2),
        unit: 'кВт·г',
        label,
        subnote: `Сер. показ: ${item.avgKwhPerReading.toFixed(2)} кВт·г`,
      };
    }

    // 5. If no readings yet, show 0.00 (or steady operating rate note for AC)
    return {
      value: '0.00',
      unit: 'кВт·г',
      label,
      subnote: item.isAirConditioner ? 'Робочий режим: 0.4–0.8 кВт·г' : 'Немає показів за місяць',
    };
  }

export function getSmartCardRightMetricInfo(item: {
    device: ElectricityDevice;
    isAirConditioner?: boolean;
    monthKwh: number;
    monthCostUah: number;
    avgKwhPerReading: number;
    allLogsCount: number;
    shareOfHousePercent: number;
  }): { value: string; unit: string; label: string; sublabel?: string } {
    return {
      value: item.monthKwh.toFixed(1),
      unit: 'кВт·г',
      label: 'Спожито за місяць',
      sublabel:
        item.allLogsCount > 0 && item.avgKwhPerReading > 0
          ? `${item.monthCostUah.toFixed(0)} грн • Сер. показ: ${item.avgKwhPerReading.toFixed(1)} кВт·г`
          : `${item.monthCostUah.toFixed(0)} грн • ${item.shareOfHousePercent.toFixed(1)}% будинку`,
    };
  }

export function getSmartCardDailyChartInfo(item: {
    device: ElectricityDevice;
    monthLogs: ElectricityDeviceLogEntry[];
    attributedNotes?: Array<{ readingDate: string; kwh: number; hours: number }>;
  }): {
    hasData: boolean;
    linePath: string;
    areaPath: string;
    points: Array<{ x: number; y: number; dateLabel: string; kwh: number }>;
  } {
    const formatShortDay = (isoDate: string): string => {
      if (!isoDate || isoDate.length < 10) return isoDate || '—';
      const parts = isoDate.slice(0, 10).split('-');
      return parts.length === 3 ? `${parts[2]}.${parts[1]}` : isoDate;
    };

    // Collect daily readings in chronological order
    let rawPoints: Array<{ date: string; dateLabel: string; kwh: number }> = [];

    if (item.monthLogs && item.monthLogs.length > 0) {
      const chronological = [...item.monthLogs].sort(
        (a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || '').localeCompare(b.createdAt || '')
      );
      const byDay = new Map<string, number>();
      let prevCum = 0;
      for (const l of chronological) {
        const dKey = (l.date || '').slice(0, 10);
        if (!dKey) continue;
        const val = Number(l.consumedKwh) || 0;
        if (val <= 0) continue;
        if (!l.entryMode || l.entryMode === 'cumulative_month') {
          const dayVal = val >= prevCum && prevCum > 0 ? Math.round((val - prevCum) * 100) / 100 : val;
          prevCum = Math.max(prevCum, val);
          byDay.set(dKey, Math.round(((byDay.get(dKey) || 0) + dayVal) * 100) / 100);
        } else {
          byDay.set(dKey, Math.round(((byDay.get(dKey) || 0) + val) * 100) / 100);
        }
      }
      rawPoints = Array.from(byDay.entries()).map(([date, kwh]) => ({
        date,
        dateLabel: formatShortDay(date),
        kwh,
      }));
    } else if (item.attributedNotes && item.attributedNotes.length > 0) {
      const sortedNotes = [...item.attributedNotes].sort((a, b) =>
        (a.readingDate || '').localeCompare(b.readingDate || '')
      );
      const byDay = new Map<string, number>();
      for (const n of sortedNotes) {
        const dKey = (n.readingDate || '').slice(0, 10);
        if (!dKey) continue;
        byDay.set(dKey, Math.round(((byDay.get(dKey) || 0) + (Number(n.kwh) || 0)) * 100) / 100);
      }
      rawPoints = Array.from(byDay.entries()).map(([date, kwh]) => ({
        date,
        dateLabel: formatShortDay(date),
        kwh,
      }));
    } else if (item.device.logs && item.device.logs.length > 0) {
      // Fallback to recent historical logs across months if selected month has none yet
      const chronological = [...item.device.logs].sort(
        (a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || '').localeCompare(b.createdAt || '')
      );
      const byDay = new Map<string, number>();
      for (const l of chronological) {
        const dKey = (l.date || '').slice(0, 10);
        if (!dKey) continue;
        const val = Number(l.consumedKwh) || 0;
        if (val > 0) {
          byDay.set(dKey, val);
        }
      }
      rawPoints = Array.from(byDay.entries()).map(([date, kwh]) => ({
        date,
        dateLabel: formatShortDay(date),
        kwh,
      }));
    }

    // Keep up to last 7 recorded days so X-axis labels are clean
    if (rawPoints.length > 7) {
      rawPoints = rawPoints.slice(rawPoints.length - 7);
    }

    // If no recorded points exist at all
    if (rawPoints.length === 0) {
      return {
        hasData: false,
        linePath: 'M 16 58 L 284 58',
        areaPath: 'M 16 58 L 284 58 L 284 66 L 16 66 Z',
        points: [],
      };
    }

    // If only 1 recorded day exists, prepend the 1st of that month with 0 kWh so a line can be drawn
    if (rawPoints.length === 1) {
      const only = rawPoints[0];
      const monthPrefix = only.date.slice(0, 7);
      const startDay = `${monthPrefix}-01`;
      if (only.date !== startDay) {
        rawPoints = [
          { date: startDay, dateLabel: formatShortDay(startDay), kwh: 0 },
          only,
        ];
      } else {
        rawPoints = [
          { date: startDay, dateLabel: 'Поч.', kwh: 0 },
          only,
        ];
      }
    }

    const maxKwh = Math.max(...rawPoints.map((p) => p.kwh), 0.1);
    const minX = 20;
    const maxX = 280;
    const topY = 16;
    const bottomY = 56;
    const n = rawPoints.length;

    const coords = rawPoints.map((p, idx) => {
      const x = n === 1 ? 150 : Math.round((minX + (idx / (n - 1)) * (maxX - minX)) * 10) / 10;
      const ratio = Math.max(0, Math.min(1, p.kwh / maxKwh));
      const y = Math.round((bottomY - ratio * (bottomY - topY)) * 10) / 10;
      return {
        x,
        y,
        dateLabel: p.dateLabel,
        kwh: p.kwh,
      };
    });

    // Build smooth cubic bezier path through coords
    let linePath = `M ${coords[0].x} ${coords[0].y}`;
    for (let i = 0; i < coords.length - 1; i++) {
      const curr = coords[i];
      const next = coords[i + 1];
      const midX = Math.round(((curr.x + next.x) / 2) * 10) / 10;
      linePath += ` C ${midX} ${curr.y}, ${midX} ${next.y}, ${next.x} ${next.y}`;
    }

    const areaPath = `${linePath} L ${coords[coords.length - 1].x} 66 L ${coords[0].x} 66 Z`;

    return {
      hasData: true,
      linePath,
      areaPath,
      points: coords,
    };
  }

export interface BuildDeviceAnalyticsParams {
  acc: UtilityAccount | null;
  devices: ElectricityDevice[];
  weatherData: UtilityWeatherResponse | null;
  selectedMonth: string;
  tariffs: UtilityTariffsSettings;
  currentSingleRate: number;
  accountReadings: UtilityReading[];
  electricityStatsKPIs: ElectricityStatsKPIs;
  customMonthHouseKwh: number | null;
}

export function buildDeviceAnalyticsSummary(params: BuildDeviceAnalyticsParams) {
  const acc = params.acc;
  const devices = params.devices;
    const selectedMonth = params.selectedMonth || new Date().toISOString().slice(0, 7);
    const [yearStr, monthStr] = selectedMonth.split('-');
    const yearNum = Number(yearStr) || new Date().getFullYear();
    const monthNum = Number(monthStr) || (new Date().getMonth() + 1);
    const daysInMonth = new Date(yearNum, monthNum, 0).getDate();

    const uaMonthNames = [
      'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
      'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
    ];
    const monthLabel = `${uaMonthNames[Math.max(0, Math.min(11, monthNum - 1))]} ${yearNum}`;

    // Determine effective tariff rate (UAH / kWh) for this month
    const refDateForTariff = `${selectedMonth}-15`;
    const tariffs = params.tariffs;
    let effectiveRateUah = params.currentSingleRate;
    let nightRateUah = effectiveRateUah * 0.5;
    if (acc?.electricityTariffType === 'dual') {
      const dualInfo = resolveElectricityDualRates(refDateForTariff, tariffs);
      effectiveRateUah = dualInfo.dayRate;
      nightRateUah = dualInfo.nightRate;
    } else {
      effectiveRateUah = resolveElectricitySingleRate(refDateForTariff, tariffs);
      nightRateUah = effectiveRateUah * 0.5;
    }

    // Today / reference date in month
    const todayStr = new Date().toISOString().split('T')[0];
    let latestLoggedDate = '';

    for (const dev of devices) {
      for (const log of dev.logs || []) {
        if ((log.periodMonth || log.date.slice(0, 7)) === selectedMonth) {
          const effectiveLogEnd = log.endDate && log.endDate > log.date ? log.endDate : log.date;
          if (effectiveLogEnd > latestLoggedDate) latestLoggedDate = effectiveLogEnd;
        }
      }
    }

    let referenceDate = latestLoggedDate;
    if (!referenceDate) {
      referenceDate = todayStr.startsWith(selectedMonth)
        ? todayStr
        : `${selectedMonth}-${String(daysInMonth).padStart(2, '0')}`;
    }
    const daysElapsed = Math.max(1, Math.min(daysInMonth, Number(referenceDate.slice(8, 10)) || 1));
    const daysRemaining = Math.max(0, daysInMonth - daysElapsed);

    // Calculate average outdoor temperature for elapsed days vs remaining days of the month
    let elapsedTempSum = 0;
    for (let d = 1; d <= daysElapsed; d++) {
      const dIso = `${selectedMonth}-${String(d).padStart(2, '0')}`;
      elapsedTempSum += getWeatherForDateFromResponse(params.weatherData, dIso).tempAvgC;
    }
    const avgElapsedMonthTempC = Math.round((elapsedTempSum / daysElapsed) * 10) / 10;

    let remainingTempSum = 0;
    const remainingCount = daysRemaining > 0 ? daysRemaining : 7;
    if (daysRemaining > 0) {
      for (let d = daysElapsed + 1; d <= daysInMonth; d++) {
        const dIso = `${selectedMonth}-${String(d).padStart(2, '0')}`;
        remainingTempSum += getWeatherForDateFromResponse(params.weatherData, dIso).tempAvgC;
      }
    } else {
      // If month is complete, compare last 7 days of month vs first part
      const startD = Math.max(1, daysInMonth - 6);
      for (let d = startD; d <= daysInMonth; d++) {
        const dIso = `${selectedMonth}-${String(d).padStart(2, '0')}`;
        remainingTempSum += getWeatherForDateFromResponse(params.weatherData, dIso).tempAvgC;
      }
    }
    const avgForecastRemainingTempC = Math.round((remainingTempSum / remainingCount) * 10) / 10;

    // Determine House Total Consumption in selectedMonth from meter readings
    const monthReadings = params.accountReadings.filter(
      (r) => (r.periodMonth || r.date.slice(0, 7)) === selectedMonth
    );

    // Analyze notes in all control readings of this month
    const monthControlReadings = monthReadings.filter(
      (r) => r.isControlOnly && r.note && r.note.trim()
    );

    interface AttributedNoteEntry {
      readingDate: string;
      hours: number;
      kwh: number;
      explanation: string;
      action: string;
      rawNote: string;
    }

    const attributedByDeviceId: Record<string, { totalKwh: number; entries: AttributedNoteEntry[] }> = {};
    const unassignedAttributions: Array<AttributedNoteEntry & { category: string; action: string }> = [];

    for (const cr of monthControlReadings) {
      const crKwh = (Number(cr.consumptionT1) || 0) + (Number(cr.consumptionT2) || 0);
      const analysis = parseControlReadingNote(cr.note, crKwh, devices);
      if (analysis && analysis.hasAnalysis) {
        if (analysis.matchedDeviceId) {
          if (!attributedByDeviceId[analysis.matchedDeviceId]) {
            attributedByDeviceId[analysis.matchedDeviceId] = { totalKwh: 0, entries: [] };
          }
          attributedByDeviceId[analysis.matchedDeviceId].totalKwh += analysis.estimatedKwh;
          attributedByDeviceId[analysis.matchedDeviceId].entries.push({
            readingDate: cr.date,
            hours: analysis.durationHours,
            kwh: analysis.estimatedKwh,
            explanation: analysis.explanation,
            action: analysis.detectedAction,
            rawNote: cr.note || '',
          });
        } else {
          unassignedAttributions.push({
            readingDate: cr.date,
            hours: analysis.durationHours,
            kwh: analysis.estimatedKwh,
            explanation: analysis.explanation,
            action: analysis.detectedAction,
            rawNote: cr.note || '',
            category: analysis.matchedDeviceCategory || 'other',
          });
        }
      }
    }

    let totalLogsInMonth = 0;

    const baseDeviceRows = devices.map((dev) => {
      const monthLogs = (dev.logs || [])
        .filter((l) => (l.periodMonth || l.date.slice(0, 7)) === selectedMonth)
        .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

      totalLogsInMonth += monthLogs.length;

      let monthKwh = 0;
      let devLatestDate = '';
      let loggedTempWeightedSum = 0;
      let loggedTempWeight = 0;

      for (const log of monthLogs) {
        const effectiveLogEnd = log.endDate && log.endDate > log.date ? log.endDate : log.date;
        if (effectiveLogEnd > devLatestDate) devLatestDate = effectiveLogEnd;
        const kwhVal = Number(log.consumedKwh) || 0;
        const w = getEffectiveLogWeatherPoint(params.weatherData, log);
        loggedTempWeightedSum += w.tempAvgC * Math.max(0.5, kwhVal);
        loggedTempWeight += Math.max(0.5, kwhVal);

        if (log.entryMode && log.entryMode !== 'cumulative_month') {
          monthKwh += kwhVal;
        } else {
          monthKwh = kwhVal;
        }
      }

      // Check attributed consumption from control reading notes!
      const noteAttr = attributedByDeviceId[dev.id];
      const attributedNoteKwh = noteAttr ? Math.round(noteAttr.totalKwh * 100) / 100 : 0;
      const attributedNotes = noteAttr ? noteAttr.entries : [];

      if (attributedNoteKwh > 0) {
        if (monthKwh === 0) {
          monthKwh = attributedNoteKwh;
          if (!devLatestDate && attributedNotes.length > 0) {
            devLatestDate = attributedNotes[attributedNotes.length - 1].readingDate;
          }
        } else {
          monthKwh = Math.round((monthKwh + attributedNoteKwh) * 100) / 100;
        }
      }

      const isUnmonitoredCatalogDevice = (monthLogs.length === 0) && (attributedNoteKwh === 0);
      monthKwh = Math.max(0, Math.round(monthKwh * 100) / 100);

      // Days elapsed for this device
      let devDaysElapsed = 1;
      if (devLatestDate && devLatestDate.startsWith(selectedMonth)) {
        devDaysElapsed = Math.max(1, Number(devLatestDate.slice(8, 10)) || 1);
      } else if (todayStr.startsWith(selectedMonth)) {
        devDaysElapsed = Math.max(1, Number(todayStr.slice(8, 10)) || 1);
      } else {
        devDaysElapsed = daysInMonth;
      }
      const devDaysRemaining = Math.max(0, daysInMonth - devDaysElapsed);

      const dailyPaceKwh = monthKwh > 0 ? monthKwh / devDaysElapsed : 0;
      const projectedMonthKwh = Math.round(dailyPaceKwh * daysInMonth * 10) / 10;
      const monthCostUah = Math.round(monthKwh * effectiveRateUah * 100) / 100;
      const projectedMonthCostUah = Math.round(projectedMonthKwh * effectiveRateUah * 100) / 100;

      // Weather-adjusted projection for this device
      const devAvgLoggedTempC =
        loggedTempWeight > 0
          ? Math.round((loggedTempWeightedSum / loggedTempWeight) * 10) / 10
          : avgElapsedMonthTempC;
      const thermalInfo = getDeviceCategoryThermalSensitivityInfo(dev.category);
      // Empirical refinement if device has >= 2 logs at different temperatures
      let effectivePctPerDegreeDrop = thermalInfo.pctPerDegreeDrop;
      if (monthLogs.length >= 2) {
        const sortedByTemp = [...monthLogs].sort(
          (a, b) => getEffectiveLogWeatherPoint(params.weatherData, a).tempAvgC - getEffectiveLogWeatherPoint(params.weatherData, b).tempAvgC
        );
        const coldest = sortedByTemp[0];
        const warmest = sortedByTemp[sortedByTemp.length - 1];
        const tCold = getEffectiveLogWeatherPoint(params.weatherData, coldest).tempAvgC;
        const tWarm = getEffectiveLogWeatherPoint(params.weatherData, warmest).tempAvgC;
        if (tWarm - tCold >= 1.5 && warmest.consumedKwh > 0 && coldest.consumedKwh > warmest.consumedKwh) {
          const empiricalPct =
            (((coldest.consumedKwh - warmest.consumedKwh) / warmest.consumedKwh) * 100) / (tWarm - tCold);
          effectivePctPerDegreeDrop = Math.round(
            Math.max(1.0, Math.min(11.0, (empiricalPct + thermalInfo.pctPerDegreeDrop) / 2)) * 10
          ) / 10;
        }
      }

      // Temperature drop expected in remaining days (positive when getting colder, negative when getting warmer)
      const tempDropC = Math.round((devAvgLoggedTempC - avgForecastRemainingTempC) * 10) / 10;
      // Also account for cold weather heating load when temp < 12°C
      const coldLoadBonus =
        thermalInfo.isHighThermal && avgForecastRemainingTempC < 8
          ? Math.max(0, (8 - avgForecastRemainingTempC) * 0.015)
          : 0;
      const rawWeatherAdjustmentRatio =
        (tempDropC * (effectivePctPerDegreeDrop / 100)) + coldLoadBonus;
      const weatherMultiplier = Math.max(0.65, Math.min(1.75, 1 + rawWeatherAdjustmentRatio));

      const remainingDaysForCalc = devDaysRemaining > 0 ? devDaysRemaining : Math.round(daysInMonth * 0.35);
      const elapsedPartKwh = devDaysRemaining > 0 ? monthKwh : monthKwh * 0.65;
      const weatherProjectedMonthKwh =
        monthKwh > 0
          ? Math.round((elapsedPartKwh + dailyPaceKwh * remainingDaysForCalc * weatherMultiplier) * 10) / 10
          : 0;
      const weatherProjectedMonthCostUah = Math.round(weatherProjectedMonthKwh * effectiveRateUah * 100) / 100;
      const weatherDeltaKwh = Math.round((weatherProjectedMonthKwh - projectedMonthKwh) * 10) / 10;
      const weatherImpactPct =
        projectedMonthKwh > 0
          ? Math.round(((weatherProjectedMonthKwh - projectedMonthKwh) / projectedMonthKwh) * 1000) / 10
          : 0;

      const empiricalStats = computeDeviceEmpiricalReadingStats(dev);
      const monthAvgKwhPerReading =
        monthLogs.length > 0 ? Math.round((monthKwh / monthLogs.length) * 100) / 100 : empiricalStats.avgKwhPerReading;
      const isAirConditioner = isAirConditionerDevice(dev);
      const acProfile = isAirConditioner
        ? resolveAirConditionerPowerProfile(dev.powerWatts || 1350, 4, dev, devAvgLoggedTempC)
        : null;
      const steadyOperatingWatts = acProfile
        ? acProfile.steadyOperatingWatts
        : dev.powerWatts && dev.powerWatts > 0
          ? dev.powerWatts
          : 0;
      const steadyRangeLabel = acProfile
        ? `${acProfile.operatingMinWatts}–${acProfile.operatingMaxWatts} Вт·г`
        : '';
      const effectiveOperatingWatts =
        empiricalStats.empiricalHourlyWatts && empiricalStats.empiricalHourlyWatts > 0
          ? empiricalStats.empiricalHourlyWatts
          : steadyOperatingWatts;

      const estimatedHoursPerDay =
        effectiveOperatingWatts > 0 && dailyPaceKwh > 0
          ? Math.min(24, (dailyPaceKwh * 1000) / effectiveOperatingWatts)
          : null;

      return {
        device: dev,
        monthLogs: [...monthLogs].reverse(), // newest first for UI list
        latestLogDate: devLatestDate || null,
        monthKwh,
        monthCostUah,
        dailyPaceKwh,
        projectedMonthKwh,
        projectedMonthCostUah,
        weatherProjectedMonthKwh,
        weatherProjectedMonthCostUah,
        weatherDeltaKwh,
        weatherImpactPct,
        devAvgLoggedTempC,
        effectivePctPerDegreeDrop,
        thermalLabel: thermalInfo.label,
        isHighThermal: thermalInfo.isHighThermal,
        estimatedHoursPerDay,
        isAirConditioner,
        steadyOperatingWatts,
        steadyRangeLabel,
        effectiveOperatingWatts,
        avgKwhPerReading: empiricalStats.avgKwhPerReading,
        monthAvgKwhPerReading,
        allLogsCount: empiricalStats.logsCount,
        empiricalHourlyWatts: empiricalStats.empiricalHourlyWatts,
        shareOfHousePercent: 0, // populated after houseReferenceKwh is computed
        attributedNoteKwh,
        attributedNotes,
        hasAttributedConsumption: attributedNoteKwh > 0,
        isUnmonitoredCatalogDevice,
        usageWarning: null as {
          deviceId: string;
          deviceName: string;
          deviceIcon: string;
          deviceColor: string;
          powerWatts?: number;
          actualOrProjectedKwh: number;
          actualOrProjectedCostUah: number;
          monthlyAverageKwh: number;
          excessKwh: number;
          excessCostUah: number;
          excessPercent: number;
          shareOfHousePercent: number;
          normalBarWidthPct: number;
          severity: 'critical' | 'warning';
          baselineLabel: string;
          recommendation: string;
        } | null,
      };
    });

    // Synthesize virtual device rows for appliances detected in notes that don't match any existing device in catalog
    const virtualRows: typeof baseDeviceRows = [];
    for (const item of unassignedAttributions) {
      const vKwh = Math.round(item.kwh * 100) / 100;
      const virtualDev: ElectricityDevice = {
        id: `virtual_note_${item.category}_${item.readingDate}`,
        name: `${item.action} (за приміткою заміру)`,
        category: item.category,
        icon: item.category === 'heating' ? 'local_fire_department' : item.category === 'boiler' ? 'water_heater' : 'bolt',
        color: '#8b5cf6',
        powerWatts: Math.round((vKwh * 1000) / Math.max(1, item.hours)),
        logs: [],
        createdAt: new Date().toISOString(),
      };
      const vDailyPace = vKwh / daysElapsed;
      const vProjectedKwh = Math.round(vDailyPace * daysInMonth * 10) / 10;
      const thermal = getDeviceCategoryThermalSensitivityInfo(item.category);
      virtualRows.push({
        device: virtualDev,
        monthLogs: [],
        latestLogDate: item.readingDate,
        monthKwh: vKwh,
        monthCostUah: Math.round(vKwh * effectiveRateUah * 100) / 100,
        dailyPaceKwh: vDailyPace,
        projectedMonthKwh: vProjectedKwh,
        projectedMonthCostUah: Math.round(vProjectedKwh * effectiveRateUah * 100) / 100,
        weatherProjectedMonthKwh: vProjectedKwh,
        weatherProjectedMonthCostUah: Math.round(vProjectedKwh * effectiveRateUah * 100) / 100,
        weatherDeltaKwh: 0,
        weatherImpactPct: 0,
        devAvgLoggedTempC: avgElapsedMonthTempC,
        effectivePctPerDegreeDrop: thermal.pctPerDegreeDrop,
        thermalLabel: thermal.label,
        isHighThermal: thermal.isHighThermal,
        estimatedHoursPerDay: item.hours / daysElapsed,
        isAirConditioner: isAirConditionerDevice(virtualDev),
        steadyOperatingWatts: virtualDev.powerWatts || 600,
        steadyRangeLabel: isAirConditionerDevice(virtualDev) ? '400–800 Вт·г' : '',
        effectiveOperatingWatts: virtualDev.powerWatts || 600,
        avgKwhPerReading: vKwh,
        monthAvgKwhPerReading: vKwh,
        allLogsCount: 1,
        empiricalHourlyWatts: virtualDev.powerWatts || null,
        shareOfHousePercent: 0,
        attributedNoteKwh: vKwh,
        attributedNotes: [item],
        hasAttributedConsumption: true,
        isUnmonitoredCatalogDevice: false,
        usageWarning: null,
      });
    }

    const deviceRows = [...baseDeviceRows, ...virtualRows];

    const totalAttributedNoteKwh =
      Math.round(
        (Object.values(attributedByDeviceId).reduce((s, it) => s + it.totalKwh, 0) +
          unassignedAttributions.reduce((s, it) => s + it.kwh, 0)) * 100
      ) / 100;

    const totalDevicesKwh = Math.round(deviceRows.reduce((sum, r) => sum + r.monthKwh, 0) * 100) / 100;
    const totalDevicesCostUah = Math.round(totalDevicesKwh * effectiveRateUah * 100) / 100;
    const devicesDailyPace = totalDevicesKwh / daysElapsed;
    const projectedDevicesMonthKwh =
      Math.round(deviceRows.reduce((sum, r) => sum + r.projectedMonthKwh, 0) * 10) / 10;
    const projectedDevicesMonthCostUah = Math.round(projectedDevicesMonthKwh * effectiveRateUah * 100) / 100;

    const weatherProjectedDevicesMonthKwh =
      Math.round(deviceRows.reduce((sum, r) => sum + r.weatherProjectedMonthKwh, 0) * 10) / 10;
    const weatherProjectedDevicesMonthCostUah =
      Math.round(weatherProjectedDevicesMonthKwh * effectiveRateUah * 100) / 100;

    const billingMonthReadings = monthReadings.filter((r) => !r.isControlOnly);
    let meterMonthKwh = 0;
    if (billingMonthReadings.length > 0) {
      meterMonthKwh = billingMonthReadings.reduce(
        (sum, r) => sum + (Number(r.consumptionT1) || 0) + (Number(r.consumptionT2) || 0),
        0
      );
    } else if (monthReadings.length > 0) {
      meterMonthKwh = monthReadings.reduce(
        (sum, r) => sum + (Number(r.consumptionT1) || 0) + (Number(r.consumptionT2) || 0),
        0
      );
    }

    const statsKpis = params.electricityStatsKPIs;
    const historicalDailyPace =
      statsKpis.avgDailyRateMonth > 0
        ? statsKpis.avgDailyRateMonth
        : statsKpis.avgDailyRateLatest > 0
          ? statsKpis.avgDailyRateLatest
          : 0;

    const customOverride = params.customMonthHouseKwh;
    let houseReferenceKwh = 0;
    let houseSourceLabel = 'За лічильником';

    if (customOverride !== null && customOverride >= 0) {
      houseReferenceKwh = Math.max(customOverride, totalDevicesKwh);
      houseSourceLabel = 'Вказано вручну';
    } else if (meterMonthKwh > 0) {
      houseReferenceKwh = Math.max(meterMonthKwh, totalDevicesKwh);
      houseSourceLabel = 'За лічильником';
    } else if (historicalDailyPace > 0) {
      houseReferenceKwh = Math.max(
        Math.round(historicalDailyPace * daysElapsed * 10) / 10,
        Math.round(totalDevicesKwh * 1.15 * 10) / 10
      );
      houseSourceLabel = 'Оцінка за темпом лічильника';
    } else {
      houseReferenceKwh = totalDevicesKwh > 0 ? Math.round(totalDevicesKwh * 1.2 * 10) / 10 : 0;
      houseSourceLabel = 'За сумою приладів (+20% фон)';
    }

    const houseReferenceCostUah = Math.round(houseReferenceKwh * effectiveRateUah * 100) / 100;
    const houseDailyPace = houseReferenceKwh > 0 ? houseReferenceKwh / daysElapsed : 0;

    const untrackedKwh = Math.max(0, Math.round((houseReferenceKwh - totalDevicesKwh) * 100) / 100);
    const untrackedCostUah = Math.round(untrackedKwh * effectiveRateUah * 100) / 100;
    const devicesSharePercent =
      houseReferenceKwh > 0 ? Math.min(100, (totalDevicesKwh / houseReferenceKwh) * 100) : 0;
    const untrackedSharePercent =
      houseReferenceKwh > 0 ? Math.max(0, 100 - devicesSharePercent) : 0;

    const projectedUntrackedMonthKwh = Math.round((untrackedKwh / daysElapsed) * daysInMonth * 10) / 10;
    const projectedHouseMonthKwh = Math.max(
      projectedDevicesMonthKwh + projectedUntrackedMonthKwh,
      Math.round(houseDailyPace * daysInMonth * 10) / 10
    );
    const projectedHouseMonthCostUah = Math.round(projectedHouseMonthKwh * effectiveRateUah * 100) / 100;

    // Weather-adjusted house forecast
    const monthTempDropC = Math.round((avgElapsedMonthTempC - avgForecastRemainingTempC) * 10) / 10;
    const untrackedWeatherMult = Math.max(0.85, Math.min(1.25, 1 + monthTempDropC * 0.012));
    const weatherProjectedUntrackedMonthKwh = Math.round(projectedUntrackedMonthKwh * untrackedWeatherMult * 10) / 10;
    const weatherProjectedHouseMonthKwh = Math.round(
      (weatherProjectedDevicesMonthKwh + weatherProjectedUntrackedMonthKwh) * 10
    ) / 10;
    const weatherProjectedHouseMonthCostUah =
      Math.round(weatherProjectedHouseMonthKwh * effectiveRateUah * 100) / 100;
    const weatherHouseDeltaKwh =
      Math.round((weatherProjectedHouseMonthKwh - projectedHouseMonthKwh) * 10) / 10;
    const weatherHouseDeltaCostUah =
      Math.round((weatherProjectedHouseMonthCostUah - projectedHouseMonthCostUah) * 100) / 100;
    const weatherHouseImpactPct =
      projectedHouseMonthKwh > 0
        ? Math.round(((weatherProjectedHouseMonthKwh - projectedHouseMonthKwh) / projectedHouseMonthKwh) * 1000) / 10
        : 0;

    // Populate shareOfHousePercent and sort devices by monthKwh desc
    for (const r of deviceRows) {
      r.shareOfHousePercent =
        houseReferenceKwh > 0 ? Math.min(100, (r.monthKwh / houseReferenceKwh) * 100) : 0;
    }
    deviceRows.sort((a, b) => b.monthKwh - a.monthKwh);

    // =========================================================================
    // USAGE WARNING CALCULATION: Detect appliances consuming significantly more
    // energy than their monthly average (historical month avg or peer month avg)
    // =========================================================================
    const activeTrackedRows = deviceRows.filter((r) => r.monthKwh > 0);
    const averageDeviceMonthKwh =
      activeTrackedRows.length > 0
        ? Math.round((totalDevicesKwh / activeTrackedRows.length) * 10) / 10
        : 0;
    const averageDeviceProjectedMonthKwh =
      activeTrackedRows.length > 0
        ? Math.round((weatherProjectedDevicesMonthKwh / activeTrackedRows.length) * 10) / 10
        : 0;

    const usageWarnings: NonNullable<(typeof deviceRows)[number]['usageWarning']>[] = [];

    for (const r of deviceRows) {
      if (r.monthKwh <= 0) continue;

      // 1) Check if the appliance has historical logs in previous months
      const otherMonthTotals = new Map<string, number>();
      for (const log of r.device.logs || []) {
        const mKey = log.periodMonth || (log.date ? log.date.slice(0, 7) : '');
        if (!mKey || mKey === selectedMonth) continue;
        const kwhVal = Number(log.consumedKwh) || 0;
        if (log.entryMode && log.entryMode !== 'cumulative_month') {
          otherMonthTotals.set(mKey, (otherMonthTotals.get(mKey) || 0) + kwhVal);
        } else {
          otherMonthTotals.set(mKey, Math.max(otherMonthTotals.get(mKey) || 0, kwhVal));
        }
      }

      const pastMonthValues = Array.from(otherMonthTotals.values()).filter((v) => v > 0);
      const historicalMonthlyAvgKwh =
        pastMonthValues.length > 0
          ? pastMonthValues.reduce((s, v) => s + v, 0) / pastMonthValues.length
          : 0;

      let baselineMonthlyAvgKwh = 0;
      let actualOrProjectedKwh = r.monthKwh;
      let baselineLabel = '';

      if (historicalMonthlyAvgKwh > 0) {
        // Pro-rate historical monthly average to elapsed days OR compare full month projection
        const proRatedHistoricalKwh = (historicalMonthlyAvgKwh / 30) * daysElapsed;
        if (r.monthKwh > proRatedHistoricalKwh * 1.15) {
          baselineMonthlyAvgKwh = Math.round(proRatedHistoricalKwh * 10) / 10;
          actualOrProjectedKwh = r.monthKwh;
          baselineLabel = `Історичне середнє за ${daysElapsed} дн. (${pastMonthValues.length} міс.)`;
        } else {
          baselineMonthlyAvgKwh = Math.round(historicalMonthlyAvgKwh * 10) / 10;
          actualOrProjectedKwh = Math.max(r.monthKwh, r.weatherProjectedMonthKwh);
          baselineLabel = `Історичне середнє за місяць (${pastMonthValues.length} міс.)`;
        }
      } else if (activeTrackedRows.length >= 2 && averageDeviceMonthKwh > 0) {
        if (r.monthKwh >= averageDeviceMonthKwh * 1.15) {
          baselineMonthlyAvgKwh = averageDeviceMonthKwh;
          actualOrProjectedKwh = r.monthKwh;
          baselineLabel = 'Середнє споживання серед приладів за місяць';
        } else if (r.weatherProjectedMonthKwh >= averageDeviceProjectedMonthKwh * 1.2) {
          baselineMonthlyAvgKwh = averageDeviceProjectedMonthKwh;
          actualOrProjectedKwh = r.weatherProjectedMonthKwh;
          baselineLabel = 'Середньомісячний прогноз по приладах';
        }
      } else if (r.effectiveOperatingWatts && r.effectiveOperatingWatts > 0) {
        // Fallback when only 1 device is tracked: compare against typical daily usage (3.5h/day at operating power)
        const typicalElapsedKwh = (r.effectiveOperatingWatts / 1000) * 3.5 * daysElapsed;
        if (r.monthKwh >= typicalElapsedKwh * 1.2) {
          baselineMonthlyAvgKwh = Math.round(typicalElapsedKwh * 10) / 10;
          actualOrProjectedKwh = r.monthKwh;
          baselineLabel = r.isAirConditioner
            ? `Типова норма для робочого режиму кондиціонера (${r.steadyOperatingWatts} Вт·г)`
            : 'Типова місячна норма для потужності приладу';
        }
      }

      if (baselineMonthlyAvgKwh > 0 && actualOrProjectedKwh > baselineMonthlyAvgKwh * 1.15) {
        const excessKwh = Math.round((actualOrProjectedKwh - baselineMonthlyAvgKwh) * 10) / 10;
        if (excessKwh >= 1.0) {
          const excessPercent = Math.round(
            ((actualOrProjectedKwh - baselineMonthlyAvgKwh) / baselineMonthlyAvgKwh) * 100
          );
          const excessCostUah = Math.round(excessKwh * effectiveRateUah * 100) / 100;
          const actualOrProjectedCostUah =
            Math.round(actualOrProjectedKwh * effectiveRateUah * 100) / 100;
          const severity: 'critical' | 'warning' =
            excessPercent >= 40 || r.shareOfHousePercent >= 45 ? 'critical' : 'warning';
          const normalBarWidthPct = Math.max(
            18,
            Math.min(85, Math.round((baselineMonthlyAvgKwh / actualOrProjectedKwh) * 100))
          );

          let recommendation = `Споживання перевищує середній показник на +${excessKwh.toFixed(1)} кВт·г (+${excessCostUah.toFixed(0)} грн).`;
          if (r.device.isNightFriendly) {
            recommendation += ' Рекомендовано перенести роботу на нічний тариф (23:00–07:00) для економії 50%.';
          } else if (r.isHighThermal) {
            recommendation += ' Зростання пов’язане з обігрівом/погодою — зниження терморегулятора на 1°C зменшить витрати на ~6%.';
          } else {
            recommendation += ' Перевірте тривалість роботи приладу та фоновий режим очікування.';
          }

          const warnObj = {
            deviceId: r.device.id,
            deviceName: r.device.name,
            deviceIcon: r.device.icon || 'bolt',
            deviceColor: r.device.color || '#f59e0b',
            powerWatts: r.device.powerWatts,
            actualOrProjectedKwh,
            actualOrProjectedCostUah,
            monthlyAverageKwh: baselineMonthlyAvgKwh,
            excessKwh,
            excessCostUah,
            excessPercent,
            shareOfHousePercent: r.shareOfHousePercent,
            normalBarWidthPct,
            severity,
            baselineLabel,
            recommendation,
          };
          r.usageWarning = warnObj;
          usageWarnings.push(warnObj);
        }
      }
    }

    usageWarnings.sort((a, b) => b.excessKwh - a.excessKwh);
    const totalWarningExcessKwh =
      Math.round(usageWarnings.reduce((sum, w) => sum + w.excessKwh, 0) * 10) / 10;
    const totalWarningExcessCostUah =
      Math.round(usageWarnings.reduce((sum, w) => sum + w.excessCostUah, 0) * 100) / 100;

    const maxChartKwh = Math.max(
      10,
      ...deviceRows.map((r) => Math.max(r.monthKwh, r.projectedMonthKwh, r.weatherProjectedMonthKwh)),
      untrackedKwh,
      projectedUntrackedMonthKwh
    );

    // Build chronological date progression points across logged dates in the month (including weather!)
    const uniqueDates = Array.from(
      new Set(
        devices.flatMap((d) =>
          (d.logs || [])
            .filter((l) => (l.periodMonth || l.date.slice(0, 7)) === selectedMonth)
            .map((l) => l.date)
        )
      )
    ).sort();

    let coldDaysKwhSum = 0;
    let coldDaysCount = 0;
    let coldDaysTempSum = 0;
    let warmDaysKwhSum = 0;
    let warmDaysCount = 0;
    let warmDaysTempSum = 0;

    const dateProgressionPoints = uniqueDates.map((dStr) => {
      let sumAtDate = 0;
      let dayAddedKwh = 0;
      const parts: string[] = [];
      let dateLogWeather: DailyWeatherPoint | null = null;

      for (const dev of devices) {
        const logsUpToDate = (dev.logs || [])
          .filter((l) => (l.periodMonth || l.date.slice(0, 7)) === selectedMonth && l.date <= dStr)
          .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
        let devKwhAtDate = 0;
        for (const l of logsUpToDate) {
          if (l.date === dStr && !dateLogWeather) {
            dateLogWeather = getEffectiveLogWeatherPoint(params.weatherData, l);
          }
          if (l.entryMode && l.entryMode !== 'cumulative_month') {
            devKwhAtDate += Number(l.consumedKwh) || 0;
            if (l.date === dStr) dayAddedKwh += Number(l.consumedKwh) || 0;
          } else {
            devKwhAtDate = Number(l.consumedKwh) || 0;
            if (l.date === dStr) dayAddedKwh += Number(l.consumedKwh) || 0;
          }
        }
        if (devKwhAtDate > 0) {
          sumAtDate += devKwhAtDate;
          parts.push(`${dev.name}: ${devKwhAtDate.toFixed(1)}`);
        }
      }

      const wPoint = dateLogWeather || getWeatherForDateFromResponse(params.weatherData, dStr);
      if (dayAddedKwh > 0) {
        if (wPoint.tempAvgC < 6) {
          coldDaysKwhSum += dayAddedKwh;
          coldDaysTempSum += wPoint.tempAvgC;
          coldDaysCount++;
        } else {
          warmDaysKwhSum += dayAddedKwh;
          warmDaysTempSum += wPoint.tempAvgC;
          warmDaysCount++;
        }
      }

      return {
        date: dStr,
        cumulativeDevicesKwh: Math.round(sumAtDate * 100) / 100,
        dayAddedKwh: Math.round(dayAddedKwh * 100) / 100,
        tempAvgC: wPoint.tempAvgC,
        tempMinC: wPoint.tempMinC,
        tempMaxC: wPoint.tempMaxC,
        weatherEmoji: wPoint.emoji,
        weatherCondition: wPoint.condition,
        devicesSummary: parts.join(' • '),
      };
    });

    const coldDaysAvgKwh = coldDaysCount > 0 ? Math.round((coldDaysKwhSum / coldDaysCount) * 100) / 100 : null;
    const coldDaysAvgTempC = coldDaysCount > 0 ? Math.round((coldDaysTempSum / coldDaysCount) * 10) / 10 : null;
    const warmDaysAvgKwh = warmDaysCount > 0 ? Math.round((warmDaysKwhSum / warmDaysCount) * 100) / 100 : null;
    const warmDaysAvgTempC = warmDaysCount > 0 ? Math.round((warmDaysTempSum / warmDaysCount) * 10) / 10 : null;

    // Generate analytical insights & recommendations (including weather impact!)
    const insights: {
      title: string;
      description: string;
      badge?: string;
      icon: string;
      tone: 'amber' | 'emerald' | 'indigo' | 'rose';
    }[] = [];

    // Weather-driven insight first!
    const tempTrendText =
      monthTempDropC > 0.4
        ? `Очікується зниження середньої температури з ${avgElapsedMonthTempC > 0 ? '+' : ''}${avgElapsedMonthTempC}°C до ${avgForecastRemainingTempC > 0 ? '+' : ''}${avgForecastRemainingTempC}°C (похолодання на ${monthTempDropC.toFixed(1)}°C).`
        : monthTempDropC < -0.4
          ? `Очікується підвищення середньої температури з ${avgElapsedMonthTempC > 0 ? '+' : ''}${avgElapsedMonthTempC}°C до ${avgForecastRemainingTempC > 0 ? '+' : ''}${avgForecastRemainingTempC}°C (потепління на ${Math.abs(monthTempDropC).toFixed(1)}°C).`
          : `Середня температура утримається близько ${avgForecastRemainingTempC > 0 ? '+' : ''}${avgForecastRemainingTempC}°C.`;

    insights.push({
      title: 'Погодний прогноз споживання (вплив температури)',
      badge: `${weatherProjectedHouseMonthKwh.toFixed(0)} кВт·год (${weatherHouseImpactPct >= 0 ? '+' : ''}${weatherHouseImpactPct.toFixed(1)}%)`,
      icon: monthTempDropC > 0.5 ? 'ac_unit' : 'thermostat',
      tone: monthTempDropC > 1.0 ? 'rose' : 'indigo',
      description: `${tempTrendText} Чим нижча температура на вулиці, тим більше електроенергії витрачається на обігрів, підігрів води у бойлері та зарядку авто. З урахуванням погоди прогноз за місяць становить ~${weatherProjectedHouseMonthKwh.toFixed(0)} кВт·год (~${weatherProjectedHouseMonthCostUah.toFixed(0)} грн) замість лінійних ${projectedHouseMonthKwh.toFixed(0)} кВт·год (${weatherHouseDeltaKwh >= 0 ? '+' : ''}${weatherHouseDeltaKwh.toFixed(1)} кВт·год / ${weatherHouseDeltaCostUah >= 0 ? '+' : ''}${weatherHouseDeltaCostUah.toFixed(0)} грн).`,
    });

    const topDevice = deviceRows[0];
    if (topDevice && topDevice.monthKwh > 0) {
      insights.push({
        title: `Головний споживач: ${topDevice.device.name}`,
        badge: `${topDevice.shareOfHousePercent.toFixed(1)}% від дому`,
        icon: 'local_fire_department',
        tone: 'amber',
        description: `Прилад «${topDevice.device.name}» спожив ${topDevice.monthKwh.toFixed(2)} кВт·год (${topDevice.monthCostUah.toFixed(0)} грн) при середній температурі ${topDevice.devAvgLoggedTempC > 0 ? '+' : ''}${topDevice.devAvgLoggedTempC}°C. Погодний прогноз до кінця місяця: ~${topDevice.weatherProjectedMonthKwh.toFixed(1)} кВт·год (~${topDevice.weatherProjectedMonthCostUah.toFixed(0)} грн).`,
      });
    }

    insights.push({
      title: 'Баланс обліку: Пристрої vs Загальний лічильник',
      badge: `${devicesSharePercent.toFixed(0)}% обліковано`,
      icon: 'balance',
      tone: 'emerald',
      description:
        untrackedKwh > 0
          ? `Відстежувані прилади формують ${devicesSharePercent.toFixed(1)}% (${totalDevicesKwh.toFixed(1)} кВт·год) споживання дому. Залишок ${untrackedKwh.toFixed(1)} кВт·год (${untrackedSharePercent.toFixed(1)}%, ~${untrackedCostUah.toFixed(0)} грн) припадає на освітлення, роутер та дрібну техніку.`
          : `Усі ${totalDevicesKwh.toFixed(1)} кВт·год наразі розподілені між доданими приладами. Ви можете уточнити загальне споживання за лічильником угорі для розрахунку фонового споживання.`,
    });

    const season = getSeasonForDate(referenceDate);
    const winterLimit = 2000;
    insights.push({
      title: 'Контроль зимового ліміту з урахуванням погоди',
      badge: `~${weatherProjectedHouseMonthKwh.toFixed(0)} кВт·год`,
      icon: weatherProjectedHouseMonthKwh > winterLimit && season === 'winter' ? 'warning' : 'trending_up',
      tone: weatherProjectedHouseMonthKwh > winterLimit && season === 'winter' ? 'rose' : 'indigo',
      description:
        season === 'winter'
          ? `За скоригованим на погоду прогнозом споживання за місяць складе ~${weatherProjectedHouseMonthKwh.toFixed(0)} кВт·год (~${weatherProjectedHouseMonthCostUah.toFixed(0)} грн). ${
              weatherProjectedHouseMonthKwh <= winterLimit
                ? `Ви впевнено вкладаєтесь у пільговий зимовий ліміт ${winterLimit} кВт·год (запас ${(winterLimit - weatherProjectedHouseMonthKwh).toFixed(0)} кВт·год).`
                : `Увага: через похолодання прогнозується перевищення зимового ліміту ${winterLimit} кВт·год на ${(weatherProjectedHouseMonthKwh - winterLimit).toFixed(0)} кВт·год!`
            }`
          : `За скоригованим на погоду прогнозом очікуване споживання на кінець місяця становить ~${weatherProjectedHouseMonthKwh.toFixed(0)} кВт·год (~${weatherProjectedHouseMonthCostUah.toFixed(0)} грн).`,
    });

    // Night tariff potential savings for night-friendly devices
    const nightFriendlyRows = deviceRows.filter((r) => r.device.isNightFriendly && r.weatherProjectedMonthKwh > 0);
    if (nightFriendlyRows.length > 0) {
      const shiftableKwh = nightFriendlyRows.reduce((s, r) => s + r.weatherProjectedMonthKwh * 0.7, 0);
      const savingsUah = Math.round(shiftableKwh * (effectiveRateUah - nightRateUah));
      if (savingsUah > 0) {
        insights.push({
          title: 'Оптимізація за нічним тарифом (23:00–07:00)',
          badge: `Економія ~${savingsUah} грн/міс`,
          icon: 'dark_mode',
          tone: 'indigo',
          description: `Прилади (${nightFriendlyRows.map((n) => n.device.name).join(', ')}) можуть працювати за нічним тарифом (${nightRateUah.toFixed(2)} грн/кВт·г). Перенесення 70% їх роботи на ніч заощадить ~${savingsUah} грн щомісяця.`,
        });
      }
    }

    // Smart insight from control reading notes (if any notes explained device consumption)
    if (totalAttributedNoteKwh > 0) {
      const explainedDeviceNames = Array.from(
        new Set([
          ...Object.keys(attributedByDeviceId).map((id) => devices.find((d) => d.id === id)?.name).filter(Boolean),
          ...unassignedAttributions.map((u) => u.action),
        ])
      );

      insights.unshift({
        title: 'Аналіз приміток контрольних замірів',
        badge: `Пояснено ~${totalAttributedNoteKwh.toFixed(1)} кВт·год`,
        icon: 'psychology',
        tone: 'emerald',
        description: `Завдяки аналізу приміток до контрольних замірів розпізнано роботу приладів без окремих смарт-розеток: ${explainedDeviceNames.join(', ')} (~${totalAttributedNoteKwh.toFixed(1)} кВт·год). Це дозволило пояснити частину стрибків споживання та знизити нерозподілений фоновий залишок будинку до ${untrackedKwh.toFixed(1)} кВт·год.`,
      });
    }

    // Unmonitored catalog devices insight
    const unmonitoredCatalogDevices = devices.filter((dev) => {
      const row = deviceRows.find((r) => r.device.id === dev.id);
      return row && row.isUnmonitoredCatalogDevice;
    });

    // Air conditioner two-stage power profile & empirical reading average insight
    const acRows = deviceRows.filter((r) => r.isAirConditioner);
    if (acRows.length > 0) {
      const acDescriptions = acRows.map((r) => {
        const maxW = r.device.powerWatts || 2200;
        const empText =
          r.allLogsCount > 0
            ? `, середнє по наявних показах (${r.allLogsCount} зап.): ${r.avgKwhPerReading.toFixed(2)} кВт·г/показ`
            : '';
        return `«${r.device.name}» (пікова потужність нагріву ${maxW} Вт, робочий режим підтримання температури ${r.steadyRangeLabel} / ~${r.steadyOperatingWatts} Вт·г${empText})`;
      });
      insights.push({
        title: 'Робочий режим кондиціонера (400–800 Вт·г) та середнє по показах',
        badge: `${acRows[0].steadyRangeLabel}`,
        icon: 'ac_unit',
        tone: 'emerald',
        description: `Для кондиціонера вказана потужність є максимальною при старті, а після первинного нагріву приміщення та переходу в робочий режим споживання становить 400–800 Вт·г: ${acDescriptions.join('; ')}. Це враховано при розрахунку тривалості роботи та аналізі замірів.`,
      });
    }

    if (unmonitoredCatalogDevices.length > 0) {
      insights.push({
        title: 'Пристрої будинку без окремих лічильників',
        badge: `${unmonitoredCatalogDevices.length} прилад(ів)`,
        icon: 'devices_other',
        tone: 'indigo',
        description: `У списку будинку наявні прилади, для яких не ведеться окремий облік: ${unmonitoredCatalogDevices.map((d) => d.name + (d.powerWatts ? ` (${isAirConditionerDevice(d) ? `пік ${d.powerWatts} Вт / роб. 400–800 Вт·г` : `${d.powerWatts} Вт`})` : '')).join(', ')}. Вони формують частину фонового споживання будинку (${untrackedKwh.toFixed(1)} кВт·год). Щоб система автоматично розподіляла їх частку, вказуйте час їх увімкнення у примітках до контрольних замірів (наприклад: «Вчора увімкнули опалення з 17-ї до сьогодні 8-ї години»).`,
      });
    }

    return {
      selectedMonth,
      monthLabel,
      referenceDate,
      daysElapsed,
      daysRemaining,
      daysInMonth,
      effectiveRateUah,
      totalLogsInMonth,
      deviceRows,
      totalDevicesKwh,
      totalDevicesCostUah,
      devicesDailyPace,
      projectedDevicesMonthKwh,
      projectedDevicesMonthCostUah,
      weatherProjectedDevicesMonthKwh,
      weatherProjectedDevicesMonthCostUah,
      totalAttributedNoteKwh,
      unmonitoredCatalogDevices,
      houseReferenceKwh,
      houseReferenceCostUah,
      houseDailyPace,
      houseSourceLabel,
      untrackedKwh,
      untrackedCostUah,
      devicesSharePercent,
      untrackedSharePercent,
      projectedUntrackedMonthKwh,
      projectedHouseMonthKwh,
      projectedHouseMonthCostUah,
      weatherProjectedHouseMonthKwh,
      weatherProjectedHouseMonthCostUah,
      weatherHouseDeltaKwh,
      weatherHouseDeltaCostUah,
      weatherHouseImpactPct,
      avgElapsedMonthTempC,
      avgForecastRemainingTempC,
      monthTempDropC,
      coldDaysAvgKwh,
      coldDaysAvgTempC,
      warmDaysAvgKwh,
      warmDaysAvgTempC,
      maxChartKwh,
      dateProgressionPoints,
      insights,
      usageWarnings,
      averageDeviceMonthKwh,
      totalWarningExcessKwh,
      totalWarningExcessCostUah,
    };
}

export type DeviceAnalyticsSummaryResult = ReturnType<typeof buildDeviceAnalyticsSummary>;

export const EMPTY_DEVICE_ANALYTICS_SUMMARY: DeviceAnalyticsSummaryResult = {
  selectedMonth: new Date().toISOString().slice(0, 7),
  monthLabel: "",
  referenceDate: new Date().toISOString().split("T")[0],
  daysElapsed: 1,
  daysRemaining: 0,
  daysInMonth: 30,
  effectiveRateUah: 4.32,
  totalLogsInMonth: 0,
  deviceRows: [],
  totalDevicesKwh: 0,
  totalDevicesCostUah: 0,
  devicesDailyPace: 0,
  projectedDevicesMonthKwh: 0,
  projectedDevicesMonthCostUah: 0,
  weatherProjectedDevicesMonthKwh: 0,
  weatherProjectedDevicesMonthCostUah: 0,
  totalAttributedNoteKwh: 0,
  unmonitoredCatalogDevices: [],
  houseReferenceKwh: 0,
  houseReferenceCostUah: 0,
  houseDailyPace: 0,
  houseSourceLabel: "Очікування даних",
  untrackedKwh: 0,
  untrackedCostUah: 0,
  devicesSharePercent: 0,
  untrackedSharePercent: 100,
  projectedUntrackedMonthKwh: 0,
  projectedHouseMonthKwh: 0,
  projectedHouseMonthCostUah: 0,
  weatherProjectedHouseMonthKwh: 0,
  weatherProjectedHouseMonthCostUah: 0,
  weatherHouseDeltaKwh: 0,
  weatherHouseDeltaCostUah: 0,
  weatherHouseImpactPct: 0,
  avgElapsedMonthTempC: 0,
  avgForecastRemainingTempC: 0,
  monthTempDropC: 0,
  coldDaysAvgKwh: null,
  coldDaysAvgTempC: null,
  warmDaysAvgKwh: null,
  warmDaysAvgTempC: null,
  maxChartKwh: 1,
  dateProgressionPoints: [],
  insights: [],
  usageWarnings: [],
  averageDeviceMonthKwh: 0,
  totalWarningExcessKwh: 0,
  totalWarningExcessCostUah: 0,
};
