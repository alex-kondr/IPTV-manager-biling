import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { DailyWeatherPoint, ElectricityDevice, ElectricityDeviceLogEntry } from "../../../models/utility.model";
import { formatDateUa } from "../../../models/client.model";
import {
  getDeviceLogDateLabelHelper,
  getDeviceLogModeBadgeHelper,
  getDeviceLogTariffBadgeHelper,
  getDeviceLogTimeIntervalBadgeHelper,
  getSmartCardArchetypeInfo,
  getSmartCardDailyChartInfo,
  getSmartCardLeftMetricInfo,
  getSmartCardRightMetricInfo,
  getSmartCardStatusInfoHelper,
} from "../electricity-device-analytics.util";
import { FormatDateUaPipe } from "../electricity-pipes";
import { ELECTRICITY_VIEW_CTX } from "../electricity-view.context";

@Component({
  selector: "app-electricity-devices-dashboard",
  imports: [CommonModule, MatIconModule, FormatDateUaPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
          @let dSummary = deviceAnalyticsSummary();
          <!-- ======================================================== -->
          <!-- DEVICES & AI SCREENSHOT CONSUMPTION ANALYSIS SECTION     -->
          <!-- ======================================================== -->
          <div class="space-y-5">
            <!-- Top Overview Banner & KPIs -->
            <div class="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs space-y-4">
              <div
                class="flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                [class.border-b]="isOverviewKpiExpanded()"
                [class.border-slate-100]="isOverviewKpiExpanded()"
                [class.dark:border-slate-800]="isOverviewKpiExpanded()"
                [class.pb-3]="isOverviewKpiExpanded()"
              >
                <div class="flex items-start gap-3">
                  <button
                    type="button"
                    (click)="isOverviewKpiExpanded.update(v => !v)"
                    class="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0 cursor-pointer hover:bg-emerald-500/25 transition-colors"
                    [title]="isOverviewKpiExpanded() ? 'Згорнути блок моніторингу' : 'Розгорнути блок моніторингу'"
                  >
                    <mat-icon aria-hidden="true" class="text-xl transition-transform duration-200" [class.rotate-180]="!isOverviewKpiExpanded()">
                      expand_more
                    </mat-icon>
                  </button>
                  <div>
                    <div class="flex items-center gap-2 flex-wrap">
                      <h3
                        class="text-base sm:text-lg font-bold text-slate-900 dark:text-white cursor-pointer hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                        (click)="isOverviewKpiExpanded.update(v => !v)"
                      >
                        Моніторинг електроприладів та AI-аналіз за {{ dSummary.monthLabel }}
                      </h3>
                      <span class="px-2 py-0.5 rounded-md text-3xs font-bold uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        Станом на {{ dSummary.referenceDate | formatDateUa }} (день {{ dSummary.daysElapsed }} з {{ dSummary.daysInMonth }})
                      </span>
                      <span class="px-2 py-0.5 rounded-md text-3xs font-bold bg-indigo-100 dark:bg-indigo-950/80 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 inline-flex items-center gap-1">
                        <mat-icon aria-hidden="true" class="text-3xs leading-none">home_pin</mat-icon>
                        <span>Будинок: {{ acc.name }} • Прилади будинку</span>
                      </span>
                    </div>
                    @if (isOverviewKpiExpanded()) {
                      <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Додавайте спожиту електроенергію по окремих приладах або завантажуйте скріншоти розумних розеток з коментарем для ШІ-аналізу
                      </p>
                    }
                  </div>
                </div>

                <!-- Reference Total House kWh Override -->
                <div class="flex items-center gap-2.5 shrink-0 flex-wrap">
                  <div class="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div>
                      <div class="text-3xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Загальне споживання дому ({{ dSummary.houseSourceLabel }})
                      </div>
                      <div class="flex items-center gap-2 mt-0.5">
                        <input
                          type="number"
                          inputmode="decimal"
                          step="0.1"
                          min="0"
                          [value]="customMonthHouseKwh() !== null ? customMonthHouseKwh() : dSummary.houseReferenceKwh"
                          (change)="onCustomMonthHouseKwhChange($any($event.target).value)"
                          title="Уточнити загальне споживання будинку на цю дату"
                          class="w-24 px-2 py-0.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                        />
                        <span class="text-xs font-bold text-slate-700 dark:text-slate-300">кВт·год</span>
                        @if (customMonthHouseKwh() !== null) {
                          <button
                            type="button"
                            (click)="customMonthHouseKwh.set(null)"
                            class="text-3xs text-slate-500 hover:text-rose-600 underline cursor-pointer"
                            title="Скинути до автоматичного розрахунку"
                          >
                            Авто
                          </button>
                        }
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              @if (isOverviewKpiExpanded()) {
                <!-- ======================================================== -->
                <!-- WEATHER NOW, 7-DAY FORECAST & TEMPERATURE CORRELATION    -->
                <!-- ======================================================== -->
                @if (weatherData(); as weather) {
                  <div class="p-3.5 sm:p-4 rounded-2xl bg-sky-50/70 dark:bg-slate-800/90 border border-sky-200 dark:border-slate-700 space-y-3">
                    <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-2 border-b border-sky-200/70 dark:border-slate-700">
                      <!-- Current Weather Now -->
                      <div class="flex items-center gap-3">
                        <div>
                          <div class="flex items-center gap-2 flex-wrap">
                            <span
                              class="text-xs font-bold uppercase tracking-wider text-sky-900 dark:text-sky-300 cursor-pointer hover:underline"
                              (click)="isWeatherSectionExpanded.update(v => !v)"
                            >
                              Погода зараз ({{ weather.resolvedLocation || weather.city }}):
                            </span>
                            <span class="text-base sm:text-lg font-black font-mono text-slate-900 dark:text-white">
                              {{ weather.current.tempC > 0 ? '+' : '' }}{{ weather.current.tempC }}°C
                            </span>
                            <span class="px-2 py-0.5 rounded-full text-2xs font-bold bg-sky-100 dark:bg-sky-950 text-sky-900 dark:text-sky-200 border border-sky-300 dark:border-sky-700">
                              {{ weather.current.condition }}
                            </span>
                          </div>
                          <div class="text-2xs text-slate-600 dark:text-slate-300 mt-0.5 flex items-center gap-2 flex-wrap">
                            <span>Відчувається: <strong class="font-mono text-slate-900 dark:text-white">{{ weather.current.feelsLikeC > 0 ? '+' : '' }}{{ weather.current.feelsLikeC }}°C</strong></span>
                            <span>•</span>
                            <span>Вітер: <strong>{{ weather.current.windSpeedKmh }} км/г</strong></span>
                            <span>•</span>
                            <span>Вологість: <strong>{{ weather.current.humidityPct }}%</strong></span>
                          </div>
                        </div>
                      </div>

                      <!-- Temperature Impact Summary Pill & Refresh -->
                      <div class="flex items-center gap-2 flex-wrap">
                        <div class="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-700 text-2xs space-y-0.5">
                          <div class="text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1">
                            <mat-icon aria-hidden="true" class="text-xs text-amber-500 leading-none">thermostat</mat-icon>
                            <span>Температурний тренд ({{ dSummary.monthLabel }}):</span>
                          </div>
                          <div class="font-mono font-bold text-slate-900 dark:text-slate-100">
                            Минулі: {{ dSummary.avgElapsedMonthTempC !== null ? ((dSummary.avgElapsedMonthTempC > 0 ? '+' : '') + dSummary.avgElapsedMonthTempC + '°C') : '—' }}
                            → Залишок: {{ dSummary.avgForecastRemainingTempC !== null ? ((dSummary.avgForecastRemainingTempC > 0 ? '+' : '') + dSummary.avgForecastRemainingTempC + '°C') : '—' }}
                            @if (dSummary.monthTempDropC > 0.5) {
                              <span class="text-sky-700 dark:text-sky-300 ml-1">(❄️ похолодання -{{ dSummary.monthTempDropC }}°C)</span>
                            } @else if (dSummary.monthTempDropC < -0.5) {
                              <span class="text-amber-700 dark:text-amber-300 ml-1">(☀️ потепління +{{ (-dSummary.monthTempDropC).toFixed(1) }}°C)</span>
                            }
                          </div>
                        </div>

                        <button
                          type="button"
                          (click)="loadWeatherForCurrentAccount()"
                          [disabled]="isWeatherLoading()"
                          class="p-2 rounded-xl bg-white dark:bg-slate-900 hover:bg-sky-100 dark:hover:bg-slate-700 border border-sky-200 dark:border-slate-700 text-sky-700 dark:text-sky-300 cursor-pointer transition-colors"
                          title="Оновити метеодані"
                        >
                          <mat-icon aria-hidden="true" class="text-base leading-none" [class.animate-spin]="isWeatherLoading()">refresh</mat-icon>
                        </button>
                      </div>
                    </div>

                    @if (isWeatherSectionExpanded()) {
                      <!-- 7-Day Weather Forecast Strip -->
                      @if (weather.forecastDays.length > 0) {
                        <div>
                          <div class="flex items-center justify-between text-2xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                            <span>Прогноз погоди на найближчі дні:</span>
                            <span class="text-3xs text-slate-500 dark:text-slate-400">Нижча температура → більше споживання тепла</span>
                          </div>
                          <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                            @for (day of weather.forecastDays; track day.date; let idx = $index) {
                              <div class="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-700 flex flex-col justify-between gap-1 text-center">
                                <div class="text-3xs font-bold text-slate-600 dark:text-slate-300">
                                  {{ idx === 0 ? 'Сьогодні' : formatDate(day.date) }}
                                </div>
                                <div class="flex items-center justify-center gap-1 my-0.5">
                                  <mat-icon aria-hidden="true" class="text-base text-sky-600 dark:text-sky-400 leading-none">{{ day.icon }}</mat-icon>
                                  <span class="text-xs font-black font-mono text-slate-900 dark:text-white">
                                    {{ day.tempAvgC > 0 ? '+' : '' }}{{ day.tempAvgC }}°C
                                  </span>
                                </div>
                                <div class="text-3xs font-mono text-slate-500 dark:text-slate-400">
                                  {{ day.tempMinC > 0 ? '+' : '' }}{{ day.tempMinC }}° .. {{ day.tempMaxC > 0 ? '+' : '' }}{{ day.tempMaxC }}°C
                                </div>
                                <div class="text-3xs font-semibold text-sky-800 dark:text-sky-300 truncate" [title]="day.condition">
                                  {{ day.condition }}
                                </div>
                              </div>
                            }
                          </div>
                        </div>
                      }

                      <!-- Weather-Correlated Consumption Forecast Breakdown -->
                      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                        <div class="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
                          <div>
                            <span class="text-3xs font-bold uppercase text-slate-500 dark:text-slate-400 block">Холодні vs Теплі дні</span>
                            @if (dSummary.coldDaysAvgKwh !== null && dSummary.warmDaysAvgKwh !== null) {
                              <div class="text-xs font-bold text-slate-900 dark:text-white mt-0.5">
                                ❄️ {{ dSummary.coldDaysAvgKwh.toFixed(2) }} кВт·г vs ☀️ {{ dSummary.warmDaysAvgKwh.toFixed(2) }} кВт·г
                              </div>
                              <span class="text-3xs text-slate-500 dark:text-slate-400">середнє за запис по погоді</span>
                            } @else {
                              <div class="text-xs font-bold text-slate-900 dark:text-white mt-0.5">
                                Вплив погоди: {{ dSummary.weatherHouseImpactPct > 0 ? '+' : '' }}{{ dSummary.weatherHouseImpactPct }}% до прогнозу
                              </div>
                              <span class="text-3xs text-slate-500 dark:text-slate-400">модель теплового навантаження дому</span>
                            }
                          </div>
                          <mat-icon aria-hidden="true" class="text-sky-600 dark:text-sky-400 text-xl shrink-0">ac_unit</mat-icon>
                        </div>

                        <div class="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
                          <div>
                            <span class="text-3xs font-bold uppercase text-slate-500 dark:text-slate-400 block">Лінійний прогноз (без погоди)</span>
                            <div class="text-xs sm:text-sm font-black font-mono text-slate-900 dark:text-white mt-0.5">
                              {{ dSummary.projectedHouseMonthKwh.toFixed(0) }} кВт·год (~{{ dSummary.projectedHouseMonthCostUah.toFixed(0) }} грн)
                            </div>
                            <span class="text-3xs text-slate-500 dark:text-slate-400">При незмінній температурі</span>
                          </div>
                          <mat-icon aria-hidden="true" class="text-slate-400 text-xl shrink-0">trending_flat</mat-icon>
                        </div>

                        <div class="p-3 rounded-xl bg-amber-50/80 dark:bg-slate-900 border border-amber-300 dark:border-amber-700 flex items-center justify-between gap-2">
                          <div>
                            <span class="text-3xs font-bold uppercase text-amber-900 dark:text-amber-300 block">Точний прогноз за погодою</span>
                            <div class="text-xs sm:text-sm font-black font-mono text-slate-900 dark:text-white mt-0.5">
                              {{ dSummary.weatherProjectedHouseMonthKwh.toFixed(0) }} кВт·год (~{{ dSummary.weatherProjectedHouseMonthCostUah.toFixed(0) }} грн)
                            </div>
                            <span class="text-3xs font-semibold text-amber-800 dark:text-amber-300">
                              @let diffKwh = dSummary.weatherProjectedHouseMonthKwh - dSummary.projectedHouseMonthKwh;
                              @if (Math.abs(diffKwh) >= 1) {
                                {{ diffKwh > 0 ? '+' : '' }}{{ diffKwh.toFixed(0) }} кВт·г через зміну температури
                              } @else {
                                Температура стабільна — без відхилень
                              }
                            </span>
                          </div>
                          <mat-icon aria-hidden="true" class="text-amber-600 dark:text-amber-400 text-xl shrink-0">wb_twilight</mat-icon>
                        </div>
                      </div>
                    }
                  </div>
                }

                <!-- 4 KPI Cards: House Total vs Devices Total vs Untracked vs Month Forecast -->
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  <!-- Card 1: Total House Consumption -->
                  <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/90 dark:border-slate-700 flex flex-col justify-between">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-3xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Загалом по будинку
                      </span>
                      <mat-icon aria-hidden="true" class="text-amber-500 text-lg leading-none">home_iot_device</mat-icon>
                    </div>
                    <div class="mt-2">
                      <div class="text-xl font-black font-mono text-slate-900 dark:text-white">
                        {{ dSummary.houseReferenceKwh.toFixed(1) }}
                        <span class="text-xs font-semibold text-slate-500 dark:text-slate-400">кВт·год</span>
                      </div>
                      <div class="text-xs font-bold text-amber-700 dark:text-amber-400 mt-0.5">
                        ≈ {{ dSummary.houseReferenceCostUah.toFixed(2) }} грн
                      </div>
                    </div>
                    <div class="mt-2 pt-2 border-t border-slate-200/70 dark:border-slate-700 flex items-center justify-between text-3xs text-slate-500 dark:text-slate-400">
                      <span>Темп: ~{{ dSummary.houseDailyPace.toFixed(2) }} кВт·г/добу</span>
                      <span class="font-semibold text-slate-700 dark:text-slate-300">{{ dSummary.houseSourceLabel }}</span>
                    </div>
                  </div>

                  <!-- Card 2: Consumed by Tracked Devices -->
                  <div class="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex flex-col justify-between">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-3xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                        Окремі пристрої ({{ accountDevices().length }})
                      </span>
                      <mat-icon aria-hidden="true" class="text-emerald-600 dark:text-emerald-400 text-lg leading-none">power</mat-icon>
                    </div>
                    <div class="mt-2">
                      <div class="flex items-baseline gap-2">
                        <span class="text-xl font-black font-mono text-emerald-950 dark:text-emerald-200">
                          {{ dSummary.totalDevicesKwh.toFixed(2) }}
                        </span>
                        <span class="text-xs font-semibold text-emerald-700 dark:text-emerald-400">кВт·год</span>
                        <span class="ml-auto px-2 py-0.5 rounded-full text-2xs font-extrabold bg-emerald-200/80 dark:bg-emerald-800 text-emerald-900 dark:text-emerald-100">
                          {{ dSummary.devicesSharePercent.toFixed(1) }}%
                        </span>
                      </div>
                      <div class="text-xs font-bold text-emerald-800 dark:text-emerald-300 mt-0.5">
                        ≈ {{ dSummary.totalDevicesCostUah.toFixed(2) }} грн
                      </div>
                    </div>
                    <div class="mt-2 pt-2 border-t border-emerald-200/70 dark:border-emerald-800 flex items-center justify-between text-3xs text-emerald-800 dark:text-emerald-300">
                      <span>Темп: {{ dSummary.devicesDailyPace.toFixed(2) }} кВт·г/добу</span>
                      <span>
                        Записів: {{ dSummary.totalLogsInMonth }}
                        @if (dSummary.totalAttributedNoteKwh > 0) {
                          <span class="font-bold ml-1 text-emerald-900 dark:text-emerald-200">• ~{{ dSummary.totalAttributedNoteKwh }} кВт·г ШІ</span>
                        }
                      </span>
                    </div>
                  </div>

                  <!-- Card 3: Untracked / Other Household Consumption -->
                  <div class="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800 flex flex-col justify-between">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-3xs font-bold uppercase tracking-wider text-indigo-800 dark:text-indigo-300">
                        Інші прилади (поза моніторингом)
                      </span>
                      <mat-icon aria-hidden="true" class="text-indigo-600 dark:text-indigo-400 text-lg leading-none">lightbulb</mat-icon>
                    </div>
                    <div class="mt-2">
                      <div class="flex items-baseline gap-2">
                        <span class="text-xl font-black font-mono text-indigo-950 dark:text-indigo-200">
                          {{ dSummary.untrackedKwh.toFixed(2) }}
                        </span>
                        <span class="text-xs font-semibold text-indigo-700 dark:text-indigo-400">кВт·год</span>
                        <span class="ml-auto px-2 py-0.5 rounded-full text-2xs font-extrabold bg-indigo-200/70 dark:bg-indigo-800 text-indigo-900 dark:text-indigo-100">
                          {{ dSummary.untrackedSharePercent.toFixed(1) }}%
                        </span>
                      </div>
                      <div class="text-xs font-bold text-indigo-800 dark:text-indigo-300 mt-0.5">
                        ≈ {{ dSummary.untrackedCostUah.toFixed(2) }} грн
                      </div>
                    </div>
                    <div class="mt-2 pt-2 border-t border-indigo-200/60 dark:border-indigo-800 text-3xs text-indigo-700 dark:text-indigo-300">
                      @if (dSummary.unmonitoredCatalogDevices.length > 0) {
                        <span>Включає {{ dSummary.unmonitoredCatalogDevices.length }} прилад(ів) будинку без смарт-розеток + світло</span>
                      } @else {
                        <span>Освітлення, роутер, зарядки, техніка</span>
                      }
                    </div>
                  </div>

                  <!-- Card 4: Weather-Adjusted End-of-Month Forecast -->
                  <div class="p-4 rounded-2xl bg-amber-50/70 dark:bg-slate-800 border border-amber-300/80 dark:border-amber-700 flex flex-col justify-between">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-3xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-300">
                        Прогноз за погодою ({{ dSummary.daysInMonth }} дн.)
                      </span>
                      <mat-icon aria-hidden="true" class="text-amber-600 text-lg leading-none">thermostat_auto</mat-icon>
                    </div>
                    <div class="mt-2">
                      <div class="text-xl font-black font-mono text-slate-900 dark:text-white">
                        {{ dSummary.weatherProjectedHouseMonthKwh.toFixed(0) }}
                        <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">кВт·год</span>
                      </div>
                      <div class="text-xs font-bold text-amber-800 dark:text-amber-300 mt-0.5">
                        Рахунок: ~{{ dSummary.weatherProjectedHouseMonthCostUah.toFixed(0) }} грн
                      </div>
                    </div>
                    <div class="mt-2 pt-2 border-t border-amber-200/80 dark:border-slate-700 flex items-center justify-between text-3xs text-amber-900 dark:text-amber-200">
                      <span>Пристрої: ~{{ dSummary.weatherProjectedDevicesMonthKwh.toFixed(0) }} кВт·г</span>
                      <span class="font-bold">(~{{ dSummary.weatherProjectedDevicesMonthCostUah.toFixed(0) }} грн)</span>
                    </div>
                  </div>
                </div>
              } @else {
                <!-- Compact Summary Line when Overview Section is Collapsed -->
                <div class="px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/90 dark:border-slate-700 flex items-center justify-between gap-3 text-2xs flex-wrap">
                  <div class="flex items-center gap-3.5 flex-wrap">
                    @if (weatherData(); as weather) {
                      <span class="inline-flex items-center gap-1 font-bold text-sky-700 dark:text-sky-300">
                        <mat-icon aria-hidden="true" class="text-xs leading-none">{{ weather.current.icon || 'wb_sunny' }}</mat-icon>
                        <span>{{ weather.current.tempC > 0 ? '+' : '' }}{{ weather.current.tempC }}°C</span>
                      </span>
                      <span>•</span>
                    }
                    <span>Загалом дім: <strong class="font-mono text-slate-900 dark:text-white">{{ dSummary.houseReferenceKwh.toFixed(1) }} кВт·г</strong> (≈{{ dSummary.houseReferenceCostUah.toFixed(0) }} грн)</span>
                    <span>•</span>
                    <span>Окремі прилади: <strong class="font-mono text-emerald-700 dark:text-emerald-400">{{ dSummary.totalDevicesKwh.toFixed(1) }} кВт·г</strong> ({{ dSummary.devicesSharePercent.toFixed(1) }}%)</span>
                    <span>•</span>
                    <span>Інші: <strong class="font-mono text-indigo-700 dark:text-indigo-400">{{ dSummary.untrackedKwh.toFixed(1) }} кВт·г</strong> ({{ dSummary.untrackedSharePercent.toFixed(1) }}%)</span>
                    <span>•</span>
                    <span>Прогноз за погодою: <strong class="font-mono text-amber-800 dark:text-amber-300">~{{ dSummary.weatherProjectedHouseMonthKwh.toFixed(0) }} кВт·г</strong> (~{{ dSummary.weatherProjectedHouseMonthCostUah.toFixed(0) }} грн)</span>
                  </div>
                  <button
                    type="button"
                    (click)="isOverviewKpiExpanded.set(true)"
                    class="text-3xs text-emerald-600 dark:text-emerald-400 hover:underline font-semibold cursor-pointer"
                  >
                    Розгорнути блок
                  </button>
                </div>
              }
            </div>

            <!-- ======================================================== -->
            <!-- USAGE WARNING COMPONENT (HIGH CONSUMPTION APPLIANCES)    -->
            <!-- ======================================================== -->
            @if (dSummary.usageWarnings.length > 0) {
              <div class="rounded-2xl bg-gradient-to-r from-amber-50/90 via-orange-50/70 to-rose-50/80 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900 border border-amber-300/90 dark:border-amber-700/80 shadow-2xs overflow-hidden">
                <!-- Warning Header -->
                <div class="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-200/70 dark:border-slate-800">
                  <div class="flex items-center gap-3">
                    <button
                      type="button"
                      (click)="isUsageWarningExpanded.update(v => !v)"
                      class="w-9 h-9 rounded-xl bg-amber-500/20 dark:bg-amber-500/15 border border-amber-500/40 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0 cursor-pointer hover:bg-amber-500/30 transition-colors"
                      [title]="isUsageWarningExpanded() ? 'Згорнути попередження про споживання' : 'Розгорнути попередження про споживання'"
                    >
                      <mat-icon aria-hidden="true" class="text-xl transition-transform duration-200" [class.rotate-180]="!isUsageWarningExpanded()">
                        warning_amber
                      </mat-icon>
                    </button>
                    <div>
                      <div class="flex items-center gap-2 flex-wrap">
                        <h4
                          class="text-sm sm:text-base font-bold text-slate-900 dark:text-white cursor-pointer hover:text-amber-700 dark:hover:text-amber-400 transition-colors"
                          (click)="isUsageWarningExpanded.update(v => !v)"
                        >
                          Попередження про підвищене споживання (Usage Warning)
                        </h4>
                        <span class="px-2 py-0.5 rounded-full text-2xs font-extrabold bg-rose-100 dark:bg-rose-950/90 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                          {{ dSummary.usageWarnings.length }} прилад(ів) вище норми
                        </span>
                        <span class="px-2 py-0.5 rounded-full text-2xs font-mono font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                          Перевищення: +{{ dSummary.totalWarningExcessKwh.toFixed(1) }} кВт·г (~{{ dSummary.totalWarningExcessCostUah.toFixed(0) }} грн)
                        </span>
                      </div>
                      <p class="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                        Прилади, що споживають значно більше електроенергії за своє середнє місячне значення (середнє по приладу: {{ dSummary.averageDeviceMonthKwh.toFixed(1) }} кВт·г)
                      </p>
                    </div>
                  </div>

                  <div class="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <button
                      type="button"
                      (click)="isUsageWarningExpanded.update(v => !v)"
                      class="p-1.5 rounded-xl bg-white/80 dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-amber-200 dark:border-slate-700 transition-colors cursor-pointer"
                      [title]="isUsageWarningExpanded() ? 'Згорнути попередження' : 'Розгорнути попередження'"
                    >
                      <mat-icon aria-hidden="true" class="text-base leading-none">
                        {{ isUsageWarningExpanded() ? 'expand_less' : 'expand_more' }}
                      </mat-icon>
                    </button>
                  </div>
                </div>

                @if (isUsageWarningExpanded()) {
                  <div class="p-3.5 sm:p-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
                    @for (warn of dSummary.usageWarnings; track warn.deviceId) {
                      <div
                        class="p-3.5 rounded-xl bg-white dark:bg-slate-800/90 border transition-all flex flex-col justify-between gap-2.5 shadow-2xs"
                        [class.border-rose-300]="warn.severity === 'critical'"
                        [class.dark:border-rose-800/80]="warn.severity === 'critical'"
                        [class.border-amber-300]="warn.severity === 'warning'"
                        [class.dark:border-amber-700/70]="warn.severity === 'warning'"
                      >
                        <div class="flex items-start justify-between gap-2.5">
                          <div class="flex items-center gap-2.5 min-w-0">
                            <div
                              class="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0 shadow-2xs"
                              [style.background-color]="warn.deviceColor || '#f59e0b'"
                            >
                              <mat-icon aria-hidden="true" class="text-lg">{{ warn.deviceIcon || 'bolt' }}</mat-icon>
                            </div>
                            <div class="min-w-0">
                              <div class="flex items-center gap-1.5 flex-wrap">
                                <span class="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                                  {{ warn.deviceName }}
                                </span>
                                @if (warn.powerWatts) {
                                  <span class="px-1.5 py-0.2 rounded text-3xs font-mono font-semibold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                    {{ warn.powerWatts }} Вт
                                  </span>
                                }
                              </div>
                              <div class="text-3xs text-slate-500 dark:text-slate-400 mt-0.5">
                                База порівняння: <span class="font-semibold text-slate-700 dark:text-slate-300">{{ warn.baselineLabel }}</span>
                              </div>
                            </div>
                          </div>

                          <span
                            class="px-2 py-0.5 rounded-lg text-2xs font-extrabold font-mono shrink-0 flex items-center gap-1 border"
                            [class.bg-rose-100]="warn.severity === 'critical'"
                            [class.dark:bg-rose-950]="warn.severity === 'critical'"
                            [class.text-rose-800]="warn.severity === 'critical'"
                            [class.dark:text-rose-300]="warn.severity === 'critical'"
                            [class.border-rose-300]="warn.severity === 'critical'"
                            [class.dark:border-rose-800]="warn.severity === 'critical'"
                            [class.bg-amber-100]="warn.severity === 'warning'"
                            [class.dark:bg-amber-950]="warn.severity === 'warning'"
                            [class.text-amber-900]="warn.severity === 'warning'"
                            [class.dark:text-amber-300]="warn.severity === 'warning'"
                            [class.border-amber-300]="warn.severity === 'warning'"
                            [class.dark:border-amber-800]="warn.severity === 'warning'"
                          >
                            <mat-icon aria-hidden="true" class="text-xs leading-none">trending_up</mat-icon>
                            <span>+{{ warn.excessPercent }}% вище норми</span>
                          </span>
                        </div>

                        <!-- Metrics Comparison Bar -->
                        <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-700/80 space-y-1.5">
                          <div class="grid grid-cols-3 gap-2 text-2xs">
                            <div>
                              <span class="text-3xs text-slate-500 dark:text-slate-400 block">Поточне / Прогноз</span>
                              <span class="font-mono font-black text-slate-900 dark:text-white">
                                {{ warn.actualOrProjectedKwh.toFixed(1) }} кВт·г
                              </span>
                              <span class="text-3xs text-slate-500 dark:text-slate-400 block">
                                ≈ {{ warn.actualOrProjectedCostUah.toFixed(0) }} грн
                              </span>
                            </div>
                            <div>
                              <span class="text-3xs text-slate-500 dark:text-slate-400 block">Середнє за місяць</span>
                              <span class="font-mono font-bold text-slate-700 dark:text-slate-300">
                                {{ warn.monthlyAverageKwh.toFixed(1) }} кВт·г
                              </span>
                              <span class="text-3xs text-slate-500 dark:text-slate-400 block">
                                Частка дому: {{ warn.shareOfHousePercent.toFixed(1) }}%
                              </span>
                            </div>
                            <div class="text-right">
                              <span class="text-3xs text-slate-500 dark:text-slate-400 block">Перевищення</span>
                              <span
                                class="font-mono font-black"
                                [class.text-rose-600]="warn.severity === 'critical'"
                                [class.dark:text-rose-400]="warn.severity === 'critical'"
                                [class.text-amber-700]="warn.severity === 'warning'"
                                [class.dark:text-amber-400]="warn.severity === 'warning'"
                              >
                                +{{ warn.excessKwh.toFixed(1) }} кВт·г
                              </span>
                              <span class="text-3xs font-bold text-rose-600 dark:text-rose-400 block">
                                +{{ warn.excessCostUah.toFixed(0) }} грн
                              </span>
                            </div>
                          </div>

                          <!-- Visual Progress Ratio -->
                          <div class="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden flex">
                            <div
                              class="h-full bg-emerald-500 transition-all"
                              [style.width.%]="warn.normalBarWidthPct"
                              title="Середній рівень споживання"
                            ></div>
                            <div
                              class="h-full transition-all"
                              [class.bg-rose-500]="warn.severity === 'critical'"
                              [class.bg-amber-500]="warn.severity === 'warning'"
                              [style.width.%]="100 - warn.normalBarWidthPct"
                              title="Перевищення середнього споживання"
                            ></div>
                          </div>
                        </div>

                        <!-- Explanation & Quick Action -->
                        <div class="flex items-center justify-between gap-2 pt-0.5">
                          <p class="text-2xs text-slate-600 dark:text-slate-300 leading-snug">
                            {{ warn.recommendation }}
                          </p>
                          <button
                            type="button"
                            (click)="focusAndExpandDeviceFromWarning(warn.deviceId)"
                            class="px-2.5 py-1 rounded-lg text-2xs font-bold bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 transition-colors shrink-0 flex items-center gap-1 cursor-pointer"
                          >
                            <mat-icon aria-hidden="true" class="text-xs leading-none">visibility</mat-icon>
                            <span>Деталі</span>
                          </button>
                        </div>
                      </div>
                    }
                  </div>
                }
              </div>
            }

            <!-- ======================================================== -->
            <!-- INDIVIDUAL DEVICES (ULTRA-COMPACT EXPANDABLE LIST VIEW)   -->
            <!-- ======================================================== -->
            <div class="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs space-y-0 overflow-hidden">
              <!-- Section Header & Controls -->
              <div class="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800">
                <div class="flex items-center gap-3">
                  <button
                    type="button"
                    (click)="isDevicesSectionExpanded.update(v => !v)"
                    class="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0 cursor-pointer hover:bg-emerald-500/25 transition-colors"
                    [title]="isDevicesSectionExpanded() ? 'Згорнути список приладів' : 'Розгорнути список приладів'"
                  >
                    <mat-icon aria-hidden="true" class="text-xl transition-transform duration-200" [class.rotate-180]="!isDevicesSectionExpanded()">
                      expand_more
                    </mat-icon>
                  </button>
                  <div>
                    <div class="flex items-center gap-2 flex-wrap">
                      <h4
                        class="text-sm sm:text-base font-bold text-slate-900 dark:text-white cursor-pointer hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                        (click)="isDevicesSectionExpanded.update(v => !v)"
                      >
                        Список електроприладів
                      </h4>
                      <span class="px-2 py-0.5 rounded-full text-2xs font-extrabold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                        {{ dSummary.deviceRows.length }} прилад(ів)
                      </span>
                    </div>
                    <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {{ deviceViewLayout() === 'cards' ? 'Картки приладів зі споживанням, потужністю, журналами та аналітикою' : 'Компактний список: натисніть на рядок пристрою, щоб відкрити деталі' }}
                    </p>
                  </div>
                </div>

                <!-- Section Actions & View Mode Toggle -->
                <div class="flex items-center gap-2 flex-wrap">
                  <!-- Layout Switcher: Cards vs List -->
                  <div class="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
                    <button
                      type="button"
                      (click)="deviceViewLayout.set('cards')"
                      class="px-2.5 py-1 rounded-lg text-2xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                      [class.bg-white]="deviceViewLayout() === 'cards'"
                      [class.dark:bg-slate-900]="deviceViewLayout() === 'cards'"
                      [class.text-emerald-700]="deviceViewLayout() === 'cards'"
                      [class.dark:text-emerald-400]="deviceViewLayout() === 'cards'"
                      [class.shadow-2xs]="deviceViewLayout() === 'cards'"
                      [class.text-slate-600]="deviceViewLayout() !== 'cards'"
                      [class.dark:text-slate-400]="deviceViewLayout() !== 'cards'"
                      title="Відобразити у вигляді карток"
                    >
                      <mat-icon aria-hidden="true" class="text-xs leading-none">grid_view</mat-icon>
                      <span>Картки</span>
                    </button>
                    <button
                      type="button"
                      (click)="deviceViewLayout.set('list')"
                      class="px-2.5 py-1 rounded-lg text-2xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                      [class.bg-white]="deviceViewLayout() === 'list'"
                      [class.dark:bg-slate-900]="deviceViewLayout() === 'list'"
                      [class.text-emerald-700]="deviceViewLayout() === 'list'"
                      [class.dark:text-emerald-400]="deviceViewLayout() === 'list'"
                      [class.shadow-2xs]="deviceViewLayout() === 'list'"
                      [class.text-slate-600]="deviceViewLayout() !== 'list'"
                      [class.dark:text-slate-400]="deviceViewLayout() !== 'list'"
                      title="Відобразити у вигляді компактного списку"
                    >
                      <mat-icon aria-hidden="true" class="text-xs leading-none">view_list</mat-icon>
                      <span>Список</span>
                    </button>
                  </div>

                  @if (canEdit()) {
                    <button
                      type="button"
                      (click)="openAddDeviceLogModal()"
                      class="px-2.5 py-1.5 rounded-xl text-2xs font-bold bg-amber-500 hover:bg-amber-600 text-white transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                      title="Внести споживання для приладу"
                    >
                      <mat-icon aria-hidden="true" class="text-xs leading-none">add</mat-icon>
                      <span>+ Запис кВт·г</span>
                    </button>

                    <button
                      type="button"
                      (click)="openScreenshotModal()"
                      class="px-2.5 py-1.5 rounded-xl text-2xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                      title="Завантажити скріншот з розетки"
                    >
                      <mat-icon aria-hidden="true" class="text-xs leading-none">add_photo_alternate</mat-icon>
                      <span>Скріншот (ШІ)</span>
                    </button>

                    <button
                      type="button"
                      (click)="openDeviceModal()"
                      class="px-2.5 py-1.5 rounded-xl text-2xs font-semibold bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white transition-colors flex items-center gap-1 cursor-pointer border border-slate-800 dark:border-slate-700 shadow-2xs"
                    >
                      <mat-icon aria-hidden="true" class="text-xs leading-none">add_circle</mat-icon>
                      <span>Новий прилад</span>
                    </button>
                  }
                </div>
              </div>

              <!-- Device Rows: Cards or List -->
              @if (isDevicesSectionExpanded()) {
                @if (dSummary.deviceRows.length > 0) {
                  @if (deviceViewLayout() === 'cards') {
                    <!-- ============================================== -->
                    <!-- SMART-HOME NEON-CYAN CARDS GRID VIEW (DEFAULT) -->
                    <!-- ============================================== -->
                    <div class="p-4 sm:p-6 bg-slate-950/95">
                      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                        @for (item of dSummary.deviceRows; track item.device.id) {
                          @let archetype = getSmartCardArchetype(item);
                          @let statusInfo = getSmartCardStatusInfo(item);
                          @let leftMetric = getSmartCardLeftMetric(item);
                          @let rightMetric = getSmartCardRightMetric(item);
                          @let dailyChart = getSmartCardDailyChart(item);
                          @let isOn = isDevicePowerOn(item.device.id);
                          <div
                            class="cv-device-card relative rounded-[28px] bg-gradient-to-br from-[#0c2147] via-[#091836] to-[#061024] border transition-all duration-300 shadow-[0_14px_34px_rgba(2,8,24,0.75)] flex flex-col justify-between overflow-hidden text-white select-none"
                            [class.border-rose-500/70]="item.usageWarning?.severity === 'critical'"
                            [class.border-amber-400/70]="item.usageWarning?.severity === 'warning'"
                            [class.border-sky-400/25]="!item.usageWarning"
                            [class.ring-2]="isCompactDeviceExpanded(item.device.id)"
                            [class.ring-sky-400/40]="isCompactDeviceExpanded(item.device.id)"
                          >
                            <!-- Ambient Top-Left Cyan Glow -->
                            <div
                              class="hidden md:block pointer-events-none absolute -top-12 -left-12 w-48 h-48 rounded-full md:blur-3xl transition-opacity duration-300"
                              [class.bg-sky-400/20]="isOn"
                              [class.bg-slate-600/10]="!isOn"
                            ></div>

                            <!-- Main Card Content -->
                            <div class="relative z-10 p-5 sm:p-6 space-y-4 flex-1 flex flex-col">
                              <!-- Quick Top-Right Utility Badges (Usage Warning + Quick Log) -->
                              <div class="flex items-center justify-between gap-2">
                                <div class="flex items-center gap-1.5 flex-wrap">
                                  <span class="px-2 py-0.5 rounded-full text-3xs font-mono font-bold bg-sky-500/15 text-sky-300 border border-sky-400/25">
                                    {{ item.monthKwh.toFixed(1) }} кВт·г • {{ item.monthCostUah.toFixed(0) }} грн
                                  </span>
                                  <span class="px-2 py-0.5 rounded-full text-3xs font-mono font-semibold bg-white/5 text-slate-300 border border-white/10">
                                    {{ item.shareOfHousePercent.toFixed(1) }}% будинку
                                  </span>
                                  @if (item.usageWarning; as uw) {
                                    <span
                                      class="px-2 py-0.5 rounded-full text-3xs font-extrabold inline-flex items-center gap-0.5 border"
                                      [class.bg-rose-500/25]="uw.severity === 'critical'"
                                      [class.text-rose-200]="uw.severity === 'critical'"
                                      [class.border-rose-400/50]="uw.severity === 'critical'"
                                      [class.bg-amber-500/25]="uw.severity === 'warning'"
                                      [class.text-amber-200]="uw.severity === 'warning'"
                                      [class.border-amber-400/50]="uw.severity === 'warning'"
                                      [title]="'Споживання перевищує середнє (' + uw.monthlyAverageKwh.toFixed(1) + ' кВт·г) на +' + uw.excessPercent + '%'"
                                    >
                                      <mat-icon aria-hidden="true" class="text-3xs leading-none">warning_amber</mat-icon>
                                      <span>+{{ uw.excessPercent }}%</span>
                                    </span>
                                  }
                                </div>

                                @if (canEdit()) {
                                  <div class="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      (click)="openAddDeviceLogModal(item.device.id)"
                                      class="px-2 py-1 rounded-lg text-3xs font-bold bg-sky-500/20 hover:bg-sky-500/35 text-sky-200 border border-sky-400/30 transition-colors cursor-pointer flex items-center gap-0.5"
                                      title="Внести споживання кВт·г"
                                    >
                                      <mat-icon aria-hidden="true" class="text-xs leading-none">add</mat-icon>
                                      <span>кВт·г</span>
                                    </button>
                                    <button
                                      type="button"
                                      (click)="openScreenshotModal(item.device.id)"
                                      class="p-1 rounded-lg text-sky-300/80 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/15 transition-colors cursor-pointer"
                                      title="Завантажити скріншот (ШІ)"
                                    >
                                      <mat-icon aria-hidden="true" class="text-xs leading-none">add_photo_alternate</mat-icon>
                                    </button>
                                  </div>
                                }
                              </div>

                              <!-- Header Row: Glowing Neon-Cyan Line-Art SVG Icon + Title & Specs -->
                              <div class="flex items-center gap-4 pt-0.5">
                                <!-- Neon-Cyan SVG Illustration -->
                                <div class="w-20 h-20 sm:w-22 sm:h-22 shrink-0 flex items-center justify-center relative">
                                  @switch (archetype) {
                                    @case ('ac') {
                                      <!-- Air Conditioner Glowing Line-Art SVG -->
                                      <svg
                                        viewBox="0 0 96 96"
                                        class="w-full h-full overflow-visible transition-opacity duration-300"
                                        [class.opacity-50]="!isOn"
                                        style="filter: drop-shadow(0 0 10px rgba(56, 189, 248, 0.75));"
                                        fill="none"
                                      >
                                        <rect x="8" y="14" width="80" height="40" rx="8" stroke="#38bdf8" stroke-width="3.2" fill="rgba(14, 165, 233, 0.08)" />
                                        <circle cx="19" cy="24" r="2.2" fill="#7dd3fc" />
                                        <circle cx="27" cy="24" r="2.2" fill="#7dd3fc" />
                                        <circle cx="35" cy="24" r="2.2" fill="#7dd3fc" />
                                        <path d="M16 44 H80 C82 44 83 46 83 48 V51 H13 V48 C13 46 14 44 16 44 Z" stroke="#38bdf8" stroke-width="2.6" fill="rgba(56, 189, 248, 0.12)" />
                                        <path d="M29 60 C29 68 25 74 18 79" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" />
                                        <path d="M41 60 C41 69 39 76 34 83" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" />
                                        <path d="M49 60 V83" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" />
                                        <path d="M58 60 C58 69 61 76 66 82" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" />
                                        <path d="M70 60 C71 67 75 73 82 77" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" />
                                      </svg>
                                    }
                                    @case ('boiler') {
                                      <!-- Water Heater / Boiler Glowing Line-Art SVG -->
                                      <svg
                                        viewBox="0 0 96 96"
                                        class="w-full h-full overflow-visible transition-opacity duration-300"
                                        [class.opacity-50]="!isOn"
                                        style="filter: drop-shadow(0 0 10px rgba(56, 189, 248, 0.75));"
                                        fill="none"
                                      >
                                        <rect x="22" y="10" width="52" height="68" rx="14" stroke="#38bdf8" stroke-width="3.2" fill="rgba(14, 165, 233, 0.08)" />
                                        <circle cx="48" cy="31" r="9.5" stroke="#38bdf8" stroke-width="3" fill="rgba(14, 165, 233, 0.15)" />
                                        <path d="M48 31 L53 26" stroke="#7dd3fc" stroke-width="2.8" stroke-linecap="round" />
                                        <rect x="38" y="52" width="20" height="10" rx="2.5" stroke="#38bdf8" stroke-width="2.6" fill="rgba(56, 189, 248, 0.14)" />
                                        <path d="M42 66 H54" stroke="#7dd3fc" stroke-width="2.5" stroke-linecap="round" />
                                        <rect x="33" y="78" width="7" height="7" rx="1.5" stroke="#38bdf8" stroke-width="2.6" />
                                        <rect x="56" y="78" width="7" height="7" rx="1.5" stroke="#38bdf8" stroke-width="2.6" />
                                      </svg>
                                    }
                                    @case ('ev') {
                                      <!-- Electric Vehicle with Plug Glowing Line-Art SVG -->
                                      <svg
                                        viewBox="0 0 96 96"
                                        class="w-full h-full overflow-visible transition-opacity duration-300"
                                        [class.opacity-50]="!isOn"
                                        style="filter: drop-shadow(0 0 10px rgba(56, 189, 248, 0.75));"
                                        fill="none"
                                      >
                                        <path d="M29 14 H37 M29 22 H37" stroke="#38bdf8" stroke-width="2.8" stroke-linecap="round" />
                                        <path d="M37 11 H46 C50 11 53 14 53 18 C53 22 50 25 46 25 H37 Z" stroke="#38bdf8" stroke-width="2.8" fill="rgba(56, 189, 248, 0.15)" />
                                        <path d="M53 18 H68 C76 18 81 24 81 31 C81 38 75 43 68 44" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" />
                                        <path d="M24 50 L30 35 C32 31 36 29 41 29 H55 C60 29 64 31 66 35 L72 50" stroke="#38bdf8" stroke-width="3" stroke-linejoin="round" fill="rgba(14, 165, 233, 0.08)" />
                                        <rect x="15" y="45" width="8" height="5" rx="2.5" stroke="#38bdf8" stroke-width="2.5" />
                                        <rect x="73" y="45" width="8" height="5" rx="2.5" stroke="#38bdf8" stroke-width="2.5" />
                                        <rect x="19" y="50" width="58" height="24" rx="8" stroke="#38bdf8" stroke-width="3.2" fill="rgba(14, 165, 233, 0.12)" />
                                        <path d="M25 58 L35 61" stroke="#7dd3fc" stroke-width="3.2" stroke-linecap="round" />
                                        <path d="M71 58 L61 61" stroke="#7dd3fc" stroke-width="3.2" stroke-linecap="round" />
                                        <path d="M40 66 H56" stroke="#38bdf8" stroke-width="2.8" stroke-linecap="round" />
                                        <path d="M22 74 V82 C22 84 24 85 26 85 H31 C33 85 35 84 35 82 V74" stroke="#38bdf8" stroke-width="3" />
                                        <path d="M61 74 V82 C61 84 63 85 65 85 H70 C72 85 74 84 74 82 V74" stroke="#38bdf8" stroke-width="3" />
                                      </svg>
                                    }
                                    @default {
                                      <!-- Glowing Neon-Cyan Appliance Frame for Other Devices -->
                                      <div
                                        class="w-18 h-18 rounded-2xl border-2 border-sky-400 bg-sky-500/10 flex items-center justify-center text-sky-300 transition-opacity duration-300"
                                        [class.opacity-50]="!isOn"
                                        style="filter: drop-shadow(0 0 10px rgba(56, 189, 248, 0.65));"
                                      >
                                        <mat-icon aria-hidden="true" class="text-4xl leading-none" style="width: 36px; height: 36px; font-size: 36px;">
                                          {{ item.device.icon || 'bolt' }}
                                        </mat-icon>
                                      </div>
                                    }
                                  }
                                </div>

                                <!-- Device Title & Technical Subtitle -->
                                <div class="min-w-0 flex-1">
                                  <h4
                                    class="text-lg sm:text-xl font-bold text-white leading-snug line-clamp-2"
                                    [title]="item.device.name"
                                  >
                                    {{ item.device.name }}
                                  </h4>
                                  <div class="text-xs sm:text-sm mt-1 font-medium">
                                    <span class="text-slate-400">{{ statusInfo.prefix }} </span>
                                    <span
                                      class="font-semibold"
                                      [class.text-sky-400]="isOn"
                                      [class.text-slate-500]="!isOn"
                                    >
                                      {{ statusInfo.value }}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <!-- Two Translucent Metric Tiles: Hourly Average + Monthly Total -->
                              <div class="grid grid-cols-2 gap-3">
                                <!-- Left Metric Tile: Average Consumption per Hour -->
                                <div class="rounded-2xl bg-[#11264e]/85 border border-sky-300/12 px-3 py-3 text-center flex flex-col justify-center min-h-[96px] shadow-inner">
                                  <div class="flex items-baseline justify-center gap-1">
                                    <span class="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-mono">
                                      {{ leftMetric.value }}
                                    </span>
                                    <span class="text-xs sm:text-sm font-semibold text-slate-300">
                                      {{ leftMetric.unit }}
                                    </span>
                                  </div>
                                  <div class="text-2xs sm:text-xs text-slate-200 mt-1 font-medium">
                                    {{ leftMetric.label }}
                                  </div>
                                  @if (leftMetric.subnote) {
                                    <div class="text-3xs text-sky-300/80 mt-0.5 truncate" [title]="leftMetric.subnote">
                                      {{ leftMetric.subnote }}
                                    </div>
                                  }
                                </div>

                                <!-- Right Metric Tile: Monthly Consumption & Reading Average -->
                                <div class="rounded-2xl bg-[#11264e]/85 border border-sky-300/12 px-3 py-3 text-center flex flex-col justify-center min-h-[96px] shadow-inner">
                                  <div class="flex items-baseline justify-center gap-1">
                                    <span class="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-mono">
                                      {{ rightMetric.value }}
                                    </span>
                                    <span class="text-xs sm:text-sm font-semibold text-slate-300">
                                      {{ rightMetric.unit }}
                                    </span>
                                  </div>
                                  <div class="text-2xs sm:text-xs text-slate-200 mt-1 font-medium">
                                    {{ rightMetric.label }}
                                  </div>
                                  @if (rightMetric.sublabel) {
                                    <div class="text-3xs text-slate-400 mt-0.5 truncate" [title]="rightMetric.sublabel">
                                      {{ rightMetric.sublabel }}
                                    </div>
                                  }
                                </div>
                              </div>

                              <!-- Energy Consumption Spline Box by Recorded Days ("Споживання електроенергії") -->
                              <div class="rounded-2xl bg-[#11264e]/85 border border-sky-300/12 p-4 space-y-2 shadow-inner">
                                <div class="flex items-center justify-between gap-2">
                                  <span class="text-xs sm:text-sm font-medium text-slate-200">
                                    Споживання електроенергії
                                  </span>
                                  <span class="text-3xs font-mono text-sky-300/90" title="Прогноз до кінця місяця з урахуванням погоди">
                                    ⛅ ~{{ item.weatherProjectedMonthKwh.toFixed(0) }} кВт·г/міс
                                  </span>
                                </div>

                                <!-- Glowing Neon-Cyan Smooth Area Spline SVG by Recorded Days -->
                                <div class="pt-1">
                                  <svg viewBox="0 0 300 72" class="w-full h-18 overflow-visible">
                                    <defs>
                                      <linearGradient [attr.id]="'cardSplineGrad_' + item.device.id" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.42" />
                                        <stop offset="100%" stop-color="#0ea5e9" stop-opacity="0.0" />
                                      </linearGradient>
                                    </defs>
                                    <!-- Filled Area under curve -->
                                    <path
                                      [attr.d]="dailyChart.areaPath"
                                      [attr.fill]="'url(#cardSplineGrad_' + item.device.id + ')'"
                                    />
                                    <!-- Glowing Cyan Spline Line -->
                                    <path
                                      [attr.d]="dailyChart.linePath"
                                      fill="none"
                                      stroke="#38bdf8"
                                      stroke-width="2.8"
                                      stroke-linecap="round"
                                      style="filter: drop-shadow(0 0 6px rgba(56, 189, 248, 0.8));"
                                    />
                                    <!-- Data Points & Values for Recorded Days -->
                                    @for (pt of dailyChart.points; track pt.dateLabel + '_' + $index) {
                                      <g>
                                        <circle
                                          [attr.cx]="pt.x"
                                          [attr.cy]="pt.y"
                                          r="3.4"
                                          fill="#e0f2fe"
                                          stroke="#0284c7"
                                          stroke-width="1.5"
                                        >
                                          <title>{{ pt.dateLabel }}: {{ pt.kwh }} кВт·г</title>
                                        </circle>
                                        @if (pt.kwh > 0) {
                                          <text
                                            [attr.x]="pt.x"
                                            [attr.y]="Math.max(10, pt.y - 6)"
                                            text-anchor="middle"
                                            fill="#bae6fd"
                                            font-size="8.5"
                                            font-family="monospace"
                                            font-weight="700"
                                          >
                                            {{ pt.kwh >= 10 ? pt.kwh.toFixed(0) : pt.kwh.toFixed(1) }}
                                          </text>
                                        }
                                      </g>
                                    }
                                  </svg>

                                  <!-- X-Axis Labels: Recorded Dates by Day -->
                                  @if (dailyChart.hasData && dailyChart.points.length > 0) {
                                    <div class="flex items-center justify-between text-3xs sm:text-2xs text-slate-300 pt-1 font-mono font-medium px-1">
                                      @for (pt of dailyChart.points; track pt.dateLabel + '_lbl_' + $index) {
                                        <span>{{ pt.dateLabel }}</span>
                                      }
                                    </div>
                                  } @else {
                                    <div class="text-center text-3xs text-slate-400 pt-1">
                                      Ще немає записаних показників по днях
                                    </div>
                                  }
                                </div>
                              </div>

                              <!-- Bottom Controls Row: "Ввімкнено" Toggle Switch + "Налаштувати" Button -->
                              <div class="grid grid-cols-2 gap-3 pt-1">
                                <!-- Left Pill: Glowing Toggle Switch -->
                                <button
                                  type="button"
                                  (click)="toggleDevicePowerState(item.device.id)"
                                  class="rounded-full p-1.5 pr-3.5 flex items-center gap-2.5 border transition-all cursor-pointer"
                                  [class.bg-[#0d2244]]="isOn"
                                  [class.border-emerald-400/35]="isOn"
                                  [class.bg-slate-900/80]="!isOn"
                                  [class.border-slate-700]="!isOn"
                                  [title]="isOn ? 'Натисніть, щоб перевести у режим очікування' : 'Натисніть, щоб увімкнути'"
                                >
                                  <!-- Switch Track -->
                                  <div
                                    class="w-13 h-7 rounded-full p-0.5 flex items-center transition-all duration-300 shrink-0"
                                    [class.bg-gradient-to-r]="isOn"
                                    [class.from-emerald-400]="isOn"
                                    [class.to-cyan-400]="isOn"
                                    [class.justify-end]="isOn"
                                    [class.shadow-[0_0_14px_rgba(52,211,153,0.6)]]="isOn"
                                    [class.bg-slate-700]="!isOn"
                                    [class.justify-start]="!isOn"
                                  >
                                    <div class="w-6 h-6 rounded-full bg-white shadow-md"></div>
                                  </div>
                                  <span
                                    class="text-xs sm:text-sm font-semibold truncate"
                                    [class.text-emerald-400]="isOn"
                                    [class.text-slate-400]="!isOn"
                                  >
                                    {{ isOn ? 'Ввімкнено' : 'Вимкнено' }}
                                  </span>
                                </button>

                                <!-- Right Pill: "Налаштувати" Button -->
                                <button
                                  type="button"
                                  (click)="toggleCompactDevice(item.device.id)"
                                  class="rounded-full bg-[#152a54]/90 hover:bg-[#1d376e] border border-sky-300/25 px-4 py-2 flex items-center justify-center gap-2 text-slate-100 font-semibold text-xs sm:text-sm transition-all cursor-pointer"
                                  [class.ring-2]="isCompactDeviceExpanded(item.device.id)"
                                  [class.ring-sky-400/50]="isCompactDeviceExpanded(item.device.id)"
                                  title="Налаштування приладу та журнал споживання"
                                >
                                  <mat-icon aria-hidden="true" class="text-base leading-none text-slate-300">settings</mat-icon>
                                  <span class="truncate">Налаштувати</span>
                                </button>
                              </div>
                            </div>

                            <!-- Expandable Settings & Logs Drawer inside Dark Card -->
                            @if (isCompactDeviceExpanded(item.device.id)) {
                              <div class="relative z-10 px-5 py-4 bg-[#071226]/95 border-t border-sky-400/20 space-y-3 text-xs">
                                <!-- Device Management Toolbar -->
                                <div class="flex items-center justify-between gap-2 flex-wrap pb-2 border-b border-white/10">
                                  <span class="font-bold text-sky-300 flex items-center gap-1">
                                    <mat-icon aria-hidden="true" class="text-sm leading-none">tune</mat-icon>
                                    <span>Керування та журнал ({{ item.monthLogs.length }})</span>
                                  </span>
                                  @if (canEdit()) {
                                    <div class="flex items-center gap-1.5 flex-wrap">
                                      <button
                                        type="button"
                                        (click)="openAddDeviceLogModal(item.device.id)"
                                        class="px-2.5 py-1 rounded-lg text-2xs font-bold bg-amber-500 hover:bg-amber-600 text-white transition-colors cursor-pointer flex items-center gap-1"
                                      >
                                        <mat-icon aria-hidden="true" class="text-xs leading-none">add</mat-icon>
                                        <span>+ Запис кВт·г</span>
                                      </button>
                                      <button
                                        type="button"
                                        (click)="openScreenshotModal(item.device.id)"
                                        class="px-2.5 py-1 rounded-lg text-2xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer flex items-center gap-1"
                                      >
                                        <mat-icon aria-hidden="true" class="text-xs leading-none">add_photo_alternate</mat-icon>
                                        <span>Фото (ШІ)</span>
                                      </button>
                                      <button
                                        type="button"
                                        (click)="openEditDeviceModal(item.device)"
                                        class="px-2.5 py-1 rounded-lg text-2xs font-semibold bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer flex items-center gap-1"
                                        title="Змінити назву, потужність або категорію"
                                      >
                                        <mat-icon aria-hidden="true" class="text-xs leading-none">edit</mat-icon>
                                        <span>Параметри</span>
                                      </button>
                                      <button
                                        type="button"
                                        (click)="deleteDevice(item.device.id)"
                                        class="p-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/35 text-rose-300 transition-colors cursor-pointer"
                                        title="Видалити прилад"
                                      >
                                        <mat-icon aria-hidden="true" class="text-xs leading-none">delete</mat-icon>
                                      </button>
                                    </div>
                                  }
                                </div>

                                @if (item.hasAttributedConsumption) {
                                  <div class="p-2.5 rounded-xl bg-emerald-950/70 border border-emerald-500/30 text-2xs text-emerald-200">
                                    Обліковано за примітками контрольних замірів лічильника: <strong class="font-mono">~{{ item.attributedNoteKwh.toFixed(1) }} кВт·г</strong>
                                  </div>
                                }

                                <!-- Logs List -->
                                @if (item.monthLogs.length > 0) {
                                  <div class="max-h-56 overflow-y-auto divide-y divide-white/10 border border-white/10 rounded-xl bg-[#0b1b38]/90">
                                    @for (log of item.monthLogs; track log.id) {
                                      @let logW = getEffectiveLogWeather(log);
                                      <div class="p-2.5 flex items-start justify-between gap-2 text-xs hover:bg-white/5 transition-colors">
                                        <div class="space-y-0.5 min-w-0 flex-1">
                                          <div class="flex items-center gap-1.5 flex-wrap">
                                            <span class="font-bold text-2xs text-white">{{ getDeviceLogDateLabel(log) }}</span>
                                            @if (logW) {
                                              <span class="px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-200 border border-sky-400/30 text-3xs font-mono font-bold inline-flex items-center gap-0.5">
                                                <mat-icon aria-hidden="true" class="text-3xs text-sky-300 leading-none">{{ logW.icon }}</mat-icon>
                                                <span>{{ logW.tempAvgC > 0 ? '+' : '' }}{{ logW.tempAvgC }}°C</span>
                                              </span>
                                            }
                                            <span class="px-1.5 py-0.2 rounded text-3xs font-bold bg-white/10 text-sky-200">
                                              {{ getDeviceLogModeBadge(log) }}
                                            </span>
                                            @if (log.fromScreenshot) {
                                              <span class="px-1 py-0.2 rounded bg-teal-500/25 text-teal-200 text-3xs font-bold">
                                                AI
                                              </span>
                                            }
                                          </div>
                                          @if (log.comment) {
                                            <div class="text-3xs text-slate-300 truncate">
                                              {{ log.comment }}
                                            </div>
                                          }
                                        </div>
                                        <div class="flex items-center gap-1 shrink-0">
                                          <span class="font-mono font-bold text-sky-300 text-xs mr-1">
                                            {{ log.entryMode && log.entryMode !== 'cumulative_month' ? '+' : '' }}{{ log.consumedKwh }} кВт·г
                                          </span>
                                          @if (canEdit()) {
                                            <button
                                              type="button"
                                              (click)="openEditDeviceLogModal(item.device.id, log)"
                                              class="p-1 rounded text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer transition-colors"
                                              title="Редагувати запис"
                                            >
                                              <mat-icon aria-hidden="true" class="text-xs leading-none">edit</mat-icon>
                                            </button>
                                            <button
                                              type="button"
                                              (click)="deleteDeviceLog(item.device.id, log.id)"
                                              class="p-1 rounded text-rose-400 hover:text-rose-200 hover:bg-rose-500/20 cursor-pointer transition-colors"
                                              title="Видалити запис"
                                            >
                                              <mat-icon aria-hidden="true" class="text-xs leading-none">delete</mat-icon>
                                            </button>
                                          }
                                        </div>
                                      </div>
                                    }
                                  </div>
                                } @else if (item.attributedNotes.length > 0) {
                                  <div class="space-y-1.5 border border-emerald-500/30 rounded-xl bg-emerald-950/40 p-2.5">
                                    <div class="text-3xs font-bold text-emerald-300 flex items-center gap-1">
                                      <mat-icon aria-hidden="true" class="text-xs leading-none">psychology</mat-icon>
                                      <span>За примітками контрольних замірів:</span>
                                    </div>
                                    <div class="divide-y divide-emerald-500/20">
                                      @for (an of item.attributedNotes; track an.readingDate + an.rawNote) {
                                        <div class="py-1 flex items-start justify-between gap-1 text-3xs">
                                          <div>
                                            <span class="font-bold text-white">{{ an.readingDate | formatDateUa }} • {{ an.hours }} год</span>
                                            <span class="text-slate-300 block">{{ an.explanation }}</span>
                                          </div>
                                          <span class="font-mono font-bold text-emerald-300 shrink-0">~{{ an.kwh.toFixed(1) }} кВт·г</span>
                                        </div>
                                      }
                                    </div>
                                  </div>
                                } @else {
                                  <div class="text-center py-2.5 text-2xs text-slate-400 bg-[#0b1b38]/60 rounded-xl border border-white/10">
                                    За {{ dSummary.monthLabel }} ще немає записів споживання.
                                  </div>
                                }
                              </div>
                            }
                          </div>
                        }
                      </div>
                    </div>
                  } @else {
                    <!-- ============================================== -->
                    <!-- COMPACT LIST VIEW                              -->
                    <!-- ============================================== -->
                    <div class="divide-y divide-slate-100 dark:divide-slate-800/80">
                    @for (item of dSummary.deviceRows; track item.device.id) {
                      <div
                        class="transition-colors"
                        [class.bg-slate-50/60]="isCompactDeviceExpanded(item.device.id)"
                        [class.dark:bg-slate-800/40]="isCompactDeviceExpanded(item.device.id)"
                      >
                        <!-- Ultra-Compact Row Header Bar (~48px) -->
                        <div
                          (click)="toggleCompactDevice(item.device.id)"
                          class="px-3.5 py-2.5 sm:px-4 sm:py-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors select-none"
                        >
                          <!-- Left: Device Icon & Identity Badges -->
                          <div class="flex items-center gap-2.5 min-w-0 flex-1">
                            <div
                              class="w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-2xs shrink-0"
                              [style.background-color]="item.device.color || '#10b981'"
                            >
                              <mat-icon aria-hidden="true" class="text-base">{{ item.device.icon || 'bolt' }}</mat-icon>
                            </div>

                            <div class="min-w-0 flex-1">
                              <div class="flex items-center gap-1.5 flex-wrap">
                                <span class="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                                  {{ item.device.name }}
                                </span>

                                @if (item.isAirConditioner) {
                                  <span
                                    class="px-1.5 py-0.2 rounded text-3xs font-mono font-bold bg-sky-50 dark:bg-sky-950/80 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800"
                                    title="Вказана потужність є максимальною при запуску/нагріві, а в робочому режимі споживання становить 400–800 Вт·г"
                                  >
                                    Макс {{ item.device.powerWatts || 2200 }} Вт • Робочий {{ item.steadyRangeLabel }} (~{{ item.steadyOperatingWatts }} Вт·г)
                                  </span>
                                } @else if (item.device.powerWatts) {
                                  <span class="px-1.5 py-0.2 rounded text-3xs font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                    {{ item.device.powerWatts }} Вт
                                  </span>
                                }
                                @if (item.allLogsCount > 0 && item.avgKwhPerReading > 0) {
                                  <span
                                    class="px-1.5 py-0.2 rounded text-3xs font-mono font-bold bg-teal-50 dark:bg-teal-950/80 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800"
                                    [title]="'Середнє споживання по наявних показах (' + item.allLogsCount + ' записів)'"
                                  >
                                    Сер. по показах: {{ item.avgKwhPerReading.toFixed(2) }} кВт·г
                                  </span>
                                }
                                @if (item.device.batteryCapacityKwh) {
                                  <span class="px-1.5 py-0.2 rounded text-3xs font-mono font-bold bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                    {{ item.device.batteryCapacityKwh }} кВт·г
                                  </span>
                                }
                                @if (item.device.category === 'heating_ac') {
                                  <span class="px-1.5 py-0.2 rounded text-3xs font-bold bg-orange-50 dark:bg-orange-950/80 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800">
                                    Обігрів
                                  </span>
                                }
                                @if (item.device.isNightFriendly) {
                                  <span class="px-1.5 py-0.2 rounded text-3xs font-bold bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                    Ніч
                                  </span>
                                }
                                @if (item.hasAttributedConsumption) {
                                  <span class="px-1.5 py-0.2 rounded text-3xs font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                                    ~{{ item.attributedNoteKwh.toFixed(1) }} кВт·г ШІ
                                  </span>
                                }
                                @if (item.isUnmonitoredCatalogDevice) {
                                  <span class="px-1.5 py-0.2 rounded text-3xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                                    Фонове
                                  </span>
                                }
                                @if (item.usageWarning; as uw) {
                                  <span
                                    class="px-1.5 py-0.2 rounded text-3xs font-extrabold inline-flex items-center gap-0.5 border"
                                    [class.bg-rose-100]="uw.severity === 'critical'"
                                    [class.dark:bg-rose-950/90]="uw.severity === 'critical'"
                                    [class.text-rose-800]="uw.severity === 'critical'"
                                    [class.dark:text-rose-300]="uw.severity === 'critical'"
                                    [class.border-rose-300]="uw.severity === 'critical'"
                                    [class.dark:border-rose-800]="uw.severity === 'critical'"
                                    [class.bg-amber-100]="uw.severity === 'warning'"
                                    [class.dark:bg-amber-950/90]="uw.severity === 'warning'"
                                    [class.text-amber-900]="uw.severity === 'warning'"
                                    [class.dark:text-amber-300]="uw.severity === 'warning'"
                                    [class.border-amber-300]="uw.severity === 'warning'"
                                    [class.dark:border-amber-800]="uw.severity === 'warning'"
                                    [title]="'Споживання перевищує середнє (' + uw.monthlyAverageKwh.toFixed(1) + ' кВт·г) на +' + uw.excessPercent + '%'"
                                  >
                                    <mat-icon aria-hidden="true" class="text-3xs leading-none">warning_amber</mat-icon>
                                    <span>+{{ uw.excessPercent }}% вище сер.</span>
                                  </span>
                                }
                              </div>
                            </div>
                          </div>

                          <!-- Center/Right: Metrics, Share, Forecast, Quick Actions & Chevron -->
                          <div class="flex items-center gap-2.5 sm:gap-3.5 shrink-0">
                            <!-- Month Fact & Cost -->
                            <div class="text-right">
                              <div class="font-mono font-black text-xs sm:text-sm text-slate-900 dark:text-white">
                                {{ item.monthKwh.toFixed(1) }}
                                <span class="text-3xs font-normal text-slate-500 dark:text-slate-400">кВт·г</span>
                              </div>
                              <div class="text-3xs font-bold text-emerald-700 dark:text-emerald-400">
                                {{ item.monthCostUah.toFixed(0) }} грн
                              </div>
                            </div>

                            <!-- Share % & Progress bar -->
                            <div class="hidden sm:flex flex-col items-end w-16 lg:w-20">
                              <div class="text-3xs font-bold text-slate-600 dark:text-slate-300 font-mono">
                                {{ item.shareOfHousePercent.toFixed(1) }}%
                              </div>
                              <div class="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden mt-0.5">
                                <div
                                  class="h-full rounded-full transition-all duration-300"
                                  [style.width.%]="Math.min(100, item.shareOfHousePercent)"
                                  [style.background-color]="item.device.color || '#10b981'"
                                ></div>
                              </div>
                            </div>

                            <!-- Weather Projected -->
                            <div class="hidden md:block text-right">
                              <span
                                class="px-2 py-0.5 rounded-md text-3xs font-mono font-bold bg-amber-50 dark:bg-amber-950/70 text-amber-900 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                                title="Прогноз до кінця місяця з урахуванням погоди"
                              >
                                ⛅ ~{{ item.weatherProjectedMonthKwh.toFixed(0) }} кВт·г
                              </span>
                            </div>

                            <!-- Quick Actions -->
                            @if (canEdit()) {
                              <div class="flex items-center gap-1" (click)="$event.stopPropagation()">
                                <button
                                  type="button"
                                  (click)="openAddDeviceLogModal(item.device.id)"
                                  class="p-1 sm:px-2 sm:py-1 rounded-lg text-3xs font-bold bg-amber-500 hover:bg-amber-600 text-white transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                                  title="Внести споживання кВт·г"
                                >
                                  <mat-icon aria-hidden="true" class="text-xs leading-none">add</mat-icon>
                                  <span class="hidden xl:inline">+ кВт·г</span>
                                </button>

                                <button
                                  type="button"
                                  (click)="openScreenshotModal(item.device.id)"
                                  class="p-1 sm:px-2 sm:py-1 rounded-lg text-3xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                                  title="Завантажити скріншот"
                                >
                                  <mat-icon aria-hidden="true" class="text-xs leading-none">add_photo_alternate</mat-icon>
                                  <span class="hidden xl:inline">Фото</span>
                                </button>

                                <button
                                  type="button"
                                  (click)="openEditDeviceModal(item.device)"
                                  class="p-1 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                  title="Редагувати пристрій"
                                >
                                  <mat-icon aria-hidden="true" class="text-xs leading-none">edit</mat-icon>
                                </button>

                                <button
                                  type="button"
                                  (click)="deleteDevice(item.device.id)"
                                  class="p-1 rounded-lg text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/60 transition-colors cursor-pointer"
                                  title="Видалити пристрій"
                                >
                                  <mat-icon aria-hidden="true" class="text-xs leading-none">delete</mat-icon>
                                </button>
                              </div>
                            }

                            <!-- Expand Chevron -->
                            <button
                              type="button"
                              (click)="$event.stopPropagation(); toggleCompactDevice(item.device.id)"
                              class="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                              [title]="isCompactDeviceExpanded(item.device.id) ? 'Згорнути деталі' : 'Розгорнути деталі'"
                            >
                              <mat-icon aria-hidden="true" class="text-base leading-none transition-transform duration-200" [class.rotate-180]="isCompactDeviceExpanded(item.device.id)">
                                expand_more
                              </mat-icon>
                            </button>
                          </div>
                        </div>

                        <!-- ============================================== -->
                        <!-- EXPANDED DETAILS DRAWER FOR THIS DEVICE        -->
                        <!-- ============================================== -->
                        @if (isCompactDeviceExpanded(item.device.id)) {
                          <div class="px-4 py-4 sm:p-5 bg-slate-50/80 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 space-y-4">
                            <!-- Attributed Note or Unmonitored Banner -->
                            @if (item.hasAttributedConsumption) {
                              <div class="p-2.5 rounded-xl bg-emerald-50/90 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-2xs space-y-1">
                                <div class="flex items-center justify-between text-emerald-900 dark:text-emerald-200 font-bold">
                                  <span class="flex items-center gap-1">
                                    <mat-icon aria-hidden="true" class="text-xs text-emerald-600 dark:text-emerald-400 leading-none">psychology</mat-icon>
                                    <span>Обліковано за контрольними замірами лічильника:</span>
                                  </span>
                                  <span class="font-mono text-emerald-700 dark:text-emerald-300">~{{ item.attributedNoteKwh.toFixed(1) }} кВт·г</span>
                                </div>
                                <p class="text-3xs text-emerald-800/90 dark:text-emerald-300/90">
                                  Споживання розраховано за примітками до контрольних замірів для цього приладу ({{ item.attributedNotes.length }} замір(и)).
                                </p>
                              </div>
                            } @else if (item.isUnmonitoredCatalogDevice) {
                              <div class="p-2.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-3xs text-slate-600 dark:text-slate-300 space-y-0.5">
                                <div class="font-bold flex items-center gap-1 text-slate-800 dark:text-slate-200">
                                  <mat-icon aria-hidden="true" class="text-xs text-indigo-500 leading-none">info</mat-icon>
                                  <span>Споживання не ведеться окремо</span>
                                </div>
                                <p class="text-slate-500 dark:text-slate-400">
                                  Прилад враховано у фоновому споживанні будинку (номінал {{ item.device.powerWatts || 1200 }} Вт). Вказуйте години роботи у примітках контрольних замірів для авто-розрахунку.
                                </p>
                              </div>
                            }

                            <!-- Full 4-Column Metrics Grid & Progress Bar -->
                            <div class="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700 space-y-2.5">
                              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                <div>
                                  <div class="text-3xs font-semibold uppercase text-slate-400 dark:text-slate-400">Спожито за місяць</div>
                                  <div class="text-base sm:text-lg font-black font-mono text-slate-900 dark:text-white">
                                    {{ item.monthKwh.toFixed(2) }}
                                    <span class="text-3xs font-normal text-slate-500 dark:text-slate-400">кВт·г</span>
                                  </div>
                                  <div class="text-2xs font-bold text-emerald-700 dark:text-emerald-400">
                                    {{ item.monthCostUah.toFixed(2) }} грн
                                  </div>
                                </div>

                                <div>
                                  <div class="text-3xs font-semibold uppercase text-slate-400 dark:text-slate-400">Середньодобово</div>
                                  <div class="text-sm sm:text-base font-bold font-mono text-slate-800 dark:text-slate-200">
                                    {{ item.dailyPaceKwh.toFixed(2) }}
                                    <span class="text-3xs font-normal text-slate-500 dark:text-slate-400">кВт·г/д</span>
                                  </div>
                                  @if (item.estimatedHoursPerDay !== null) {
                                    <div class="text-3xs text-slate-500 dark:text-slate-400">
                                      ~{{ item.estimatedHoursPerDay.toFixed(1) }} год/добу {{ item.isAirConditioner ? '(робочий ' + item.steadyOperatingWatts + ' Вт·г)' : 'роботи' }}
                                    </div>
                                  }
                                </div>

                                <div>
                                  <div class="text-3xs font-semibold uppercase text-slate-400 dark:text-slate-400">Середнє по показах</div>
                                  @if (item.allLogsCount > 0) {
                                    <div class="text-sm sm:text-base font-bold font-mono text-teal-800 dark:text-teal-300">
                                      {{ item.avgKwhPerReading.toFixed(2) }}
                                      <span class="text-3xs font-normal text-teal-700 dark:text-teal-400">кВт·г/показ</span>
                                    </div>
                                    <div class="text-3xs text-slate-500 dark:text-slate-400">
                                      За {{ item.allLogsCount }} показ(ами)
                                      @if (item.monthLogs.length > 0) {
                                        <span>• міс.: {{ item.monthAvgKwhPerReading.toFixed(2) }} кВт·г</span>
                                      }
                                    </div>
                                  } @else {
                                    <div class="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
                                      Немає показів
                                    </div>
                                  }
                                  @if (item.isAirConditioner) {
                                    <div class="text-3xs font-semibold text-sky-700 dark:text-sky-300 mt-0.5">
                                      Пік {{ item.device.powerWatts || 2200 }} Вт → Роб. {{ item.steadyRangeLabel }}
                                    </div>
                                  }
                                </div>

                                <div>
                                  <div class="text-3xs font-semibold uppercase text-slate-400 dark:text-slate-400">Прогноз (з погодою)</div>
                                  <div class="text-sm sm:text-base font-bold font-mono text-amber-800 dark:text-amber-300">
                                    {{ item.weatherProjectedMonthKwh.toFixed(1) }}
                                    <span class="text-3xs font-normal text-amber-700 dark:text-amber-400">кВт·г</span>
                                  </div>
                                  <div class="text-2xs font-semibold text-amber-700 dark:text-amber-400">
                                    ~{{ item.weatherProjectedMonthCostUah.toFixed(0) }} грн
                                    @if (Math.abs(item.weatherProjectedMonthKwh - item.projectedMonthKwh) >= 0.4) {
                                      <span class="text-3xs text-slate-500 dark:text-slate-400 block font-normal">
                                        (лін.: {{ item.projectedMonthKwh.toFixed(1) }} кВт·г)
                                      </span>
                                    }
                                  </div>
                                </div>
                              </div>

                              <!-- Share Progress Bar -->
                              <div class="space-y-1 pt-1 border-t border-slate-100 dark:border-slate-800">
                                <div class="flex items-center justify-between text-3xs font-semibold">
                                  <span class="text-slate-600 dark:text-slate-400">Частка від споживання будинку</span>
                                  <span class="font-mono font-bold text-slate-900 dark:text-white">{{ item.shareOfHousePercent.toFixed(1) }}%</span>
                                </div>
                                <div class="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                                  <div
                                    class="h-full rounded-full transition-all duration-500"
                                    [style.width.%]="Math.min(100, item.shareOfHousePercent)"
                                    [style.background-color]="item.device.color || '#10b981'"
                                  ></div>
                                </div>
                              </div>
                            </div>

                            <!-- Logs History Section for this Device -->
                            <div class="space-y-2">
                              <div class="flex items-center justify-between text-2xs font-bold text-slate-700 dark:text-slate-300">
                                <span>Журнал записів за {{ dSummary.monthLabel }} ({{ item.monthLogs.length }} запис(ів)):</span>
                                @if (canEdit()) {
                                  <div class="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      (click)="openAddDeviceLogModal(item.device.id)"
                                      class="px-2 py-1 rounded-lg text-3xs font-bold bg-amber-500 hover:bg-amber-600 text-white transition-colors cursor-pointer flex items-center gap-0.5"
                                    >
                                      <mat-icon aria-hidden="true" class="text-xs leading-none">add</mat-icon>
                                      <span>Додати запис</span>
                                    </button>
                                    <button
                                      type="button"
                                      (click)="openScreenshotModal(item.device.id)"
                                      class="px-2 py-1 rounded-lg text-3xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer flex items-center gap-0.5"
                                    >
                                      <mat-icon aria-hidden="true" class="text-xs leading-none">add_photo_alternate</mat-icon>
                                      <span>Скріншот</span>
                                    </button>
                                  </div>
                                }
                              </div>

                              @if (item.monthLogs.length > 0) {
                                <div class="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900">
                                  @for (log of item.monthLogs; track log.id) {
                                    @let logW = getEffectiveLogWeather(log);
                                    <div class="p-2.5 flex items-start justify-between gap-2 text-xs hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                                      <div class="space-y-1 min-w-0 flex-1">
                                        <div class="flex items-center gap-1.5 flex-wrap">
                                          <span class="font-bold text-slate-900 dark:text-slate-100">{{ getDeviceLogDateLabel(log) }}</span>
                                          @if (logW) {
                                            <span
                                              class="px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-950/90 text-sky-900 dark:text-sky-200 border border-sky-200 dark:border-sky-800 text-3xs font-mono font-bold inline-flex items-center gap-1"
                                              [title]="'Погода на ' + log.date + ': ' + logW.condition + ' (від ' + logW.tempMinC + '°C до ' + logW.tempMaxC + '°C)'"
                                            >
                                              <mat-icon aria-hidden="true" class="text-3xs text-sky-600 dark:text-sky-300 leading-none">{{ logW.icon }}</mat-icon>
                                              <span>{{ logW.tempAvgC > 0 ? '+' : '' }}{{ logW.tempAvgC }}°C ({{ logW.condition }})</span>
                                            </span>
                                          }
                                          <span
                                            class="px-1.5 py-0.2 rounded text-3xs font-bold"
                                            [class.bg-emerald-100]="log.entryMode === 'cumulative_month' || !log.entryMode"
                                            [class.text-emerald-800]="log.entryMode === 'cumulative_month' || !log.entryMode"
                                            [class.bg-sky-100]="log.entryMode === 'single_day'"
                                            [class.text-sky-800]="log.entryMode === 'single_day'"
                                            [class.bg-indigo-100]="log.entryMode === 'period_range'"
                                            [class.text-indigo-800]="log.entryMode === 'period_range'"
                                            [class.bg-amber-100]="log.entryMode === 'delta'"
                                            [class.text-amber-800]="log.entryMode === 'delta'"
                                          >
                                            {{ getDeviceLogModeBadge(log) }}
                                          </span>
                                          @if (log.tariffSelection) {
                                            <span
                                              class="px-1.5 py-0.2 rounded text-3xs font-bold"
                                              [class.bg-indigo-100]="log.tariffSelection === 'night_only'"
                                              [class.text-indigo-800]="log.tariffSelection === 'night_only'"
                                              [class.bg-amber-100]="log.tariffSelection === 'day_only'"
                                              [class.text-amber-800]="log.tariffSelection === 'day_only'"
                                              [class.bg-slate-100]="log.tariffSelection === 'auto_time'"
                                              [class.text-slate-700]="log.tariffSelection === 'auto_time'"
                                            >
                                              {{ getDeviceLogTariffBadge(log) }}
                                            </span>
                                          }
                                          @if (log.startTime || log.endTime || log.durationHours) {
                                            <span class="px-1.5 py-0.2 rounded bg-slate-200/80 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-3xs font-mono font-semibold flex items-center gap-0.5">
                                              <mat-icon aria-hidden="true" class="text-3xs leading-none">schedule</mat-icon>
                                              <span>{{ getDeviceLogTimeIntervalBadge(log) }}</span>
                                            </span>
                                          }
                                          @if (log.fromScreenshot) {
                                            <span class="px-1.5 py-0.2 rounded bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-200 text-3xs font-bold flex items-center gap-0.5">
                                              <mat-icon aria-hidden="true" class="text-3xs leading-none">auto_awesome</mat-icon>
                                              <span>AI Скріншот</span>
                                            </span>
                                          }
                                        </div>
                                        @if (log.comment) {
                                          <div class="text-2xs text-slate-700 dark:text-slate-300">
                                            <span class="font-semibold text-slate-500 dark:text-slate-400">Коментар:</span> {{ log.comment }}
                                          </div>
                                        }
                                        @if (log.aiExplanation) {
                                          <div class="text-3xs text-teal-800 dark:text-teal-200 bg-teal-50/80 dark:bg-teal-950/60 px-2 py-1 rounded border border-teal-200/70 dark:border-teal-800 mt-1">
                                            <span class="font-bold">AI:</span> {{ log.aiExplanation }}
                                          </div>
                                        }
                                      </div>
                                      <div class="flex items-center gap-1.5 shrink-0">
                                        <span class="font-mono font-bold text-slate-900 dark:text-white text-sm mr-1">
                                          {{ log.entryMode && log.entryMode !== 'cumulative_month' ? '+' : '' }}{{ log.consumedKwh }} кВт·г
                                        </span>
                                        @if (canEdit()) {
                                          <button
                                            type="button"
                                            (click)="openEditDeviceLogModal(item.device.id, log)"
                                            class="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-100 hover:bg-indigo-50 dark:hover:bg-indigo-900/70 hover:text-indigo-700 dark:hover:text-indigo-200 cursor-pointer transition-colors inline-flex items-center gap-1 text-3xs font-semibold shadow-2xs"
                                            title="Редагувати запис"
                                          >
                                            <mat-icon aria-hidden="true" class="text-xs leading-none">edit</mat-icon>
                                            <span class="hidden sm:inline">Ред.</span>
                                          </button>
                                          <button
                                            type="button"
                                            (click)="deleteDeviceLog(item.device.id, log.id)"
                                            class="px-2 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/90 border border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-200 hover:bg-rose-100 dark:hover:bg-rose-900 cursor-pointer transition-colors inline-flex items-center gap-1 text-3xs font-semibold shadow-2xs"
                                            title="Видалити запис"
                                          >
                                            <mat-icon aria-hidden="true" class="text-xs leading-none">delete</mat-icon>
                                            <span class="hidden sm:inline">Видалити</span>
                                          </button>
                                        }
                                      </div>
                                    </div>
                                  }
                                </div>
                              } @else if (item.attributedNotes.length > 0) {
                                <div class="space-y-2 border border-emerald-200 dark:border-emerald-800 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/40 p-2.5">
                                  <div class="text-3xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                                    <mat-icon aria-hidden="true" class="text-xs leading-none">psychology</mat-icon>
                                    <span>Розраховано за примітками контрольних замірів лічильника:</span>
                                  </div>
                                  <div class="divide-y divide-emerald-200/60 dark:divide-emerald-800/60">
                                    @for (an of item.attributedNotes; track an.readingDate + an.rawNote) {
                                      <div class="py-1.5 flex items-start justify-between gap-2 text-2xs">
                                        <div>
                                          <div class="font-bold text-slate-900 dark:text-slate-100">{{ an.readingDate | formatDateUa }} • {{ an.hours }} год роботи</div>
                                          <div class="text-3xs text-slate-600 dark:text-slate-300">Примітка: «{{ an.rawNote }}»</div>
                                          <div class="text-3xs text-emerald-700 dark:text-emerald-300 mt-0.5">{{ an.explanation }}</div>
                                        </div>
                                        <span class="font-mono font-bold text-emerald-800 dark:text-emerald-300 shrink-0">~{{ an.kwh.toFixed(1) }} кВт·г</span>
                                      </div>
                                    }
                                  </div>
                                </div>
                              } @else {
                                <div class="text-center py-3 text-2xs text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                                  За {{ dSummary.monthLabel }} ще немає записів споживання для цього пристрою.
                                </div>
                              }
                            </div>
                          </div>
                        }
                      </div>
                    }
                  </div>
                }
              } @else {
                  <!-- Empty State when no devices added yet -->
                  <div class="p-8 text-center rounded-2xl bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 space-y-3 m-4">
                    <div class="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                      <mat-icon aria-hidden="true" class="text-3xl">electrical_services</mat-icon>
                    </div>
                    <div>
                      <h4 class="text-sm font-bold text-slate-800 dark:text-slate-200">Ще не додано жодного електроприладу</h4>
                      <p class="text-xs text-slate-500 dark:text-slate-400 max-w-lg mx-auto mt-1">
                        Додайте бойлер, кондиціонер, пральну машину, обігрівач або розумну розетку, щоб фіксувати спожиту електроенергію на конкретну дату або розпізнавати її зі скріншотів за допомогою ШІ.
                      </p>
                    </div>
                    @if (canEdit()) {
                      <div class="flex items-center justify-center gap-2.5 flex-wrap pt-2">
                        <button
                          type="button"
                          (click)="openDeviceModal()"
                          class="px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        >
                          <mat-icon aria-hidden="true" class="text-base leading-none">add</mat-icon>
                          <span>Додати перший пристрій</span>
                        </button>
                        <button
                          type="button"
                          (click)="openScreenshotModal()"
                          class="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        >
                          <mat-icon aria-hidden="true" class="text-base leading-none">add_photo_alternate</mat-icon>
                          <span>Завантажити скріншот з коментарем (ШІ)</span>
                        </button>
                      </div>
                    }
                  </div>
                }
              }
            </div>

            <!-- ======================================================== -->
            <!-- CHARTS, BREAKDOWN & FORECAST ANALYTICS                   -->
            <!-- ======================================================== -->
            @if (dSummary.deviceRows.length > 0) {
              <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
                <!-- Left 7 cols: Visual Structure & SVG Forecast Chart -->
                <div class="lg:col-span-7 p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs space-y-4">
                  <div class="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                    <div class="flex items-center gap-2.5">
                      <button
                        type="button"
                        (click)="isChartsSectionExpanded.update(v => !v)"
                        class="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0 cursor-pointer hover:bg-emerald-500/25 transition-colors"
                        [title]="isChartsSectionExpanded() ? 'Згорнути графік структури' : 'Розгорнути графік структури'"
                      >
                        <mat-icon aria-hidden="true" class="text-lg leading-none transition-transform duration-200" [class.rotate-180]="!isChartsSectionExpanded()">
                          expand_more
                        </mat-icon>
                      </button>
                      <div>
                        <h4
                          class="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-1.5 cursor-pointer hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                          (click)="isChartsSectionExpanded.update(v => !v)"
                        >
                          <mat-icon aria-hidden="true" class="text-emerald-600 dark:text-emerald-400 text-lg">pie_chart</mat-icon>
                          <span>Структура споживання та прогноз</span>
                        </h4>
                        <p class="text-2xs text-slate-500 dark:text-slate-400">
                          Порівняння споживання пристроїв із загальним показником будинку
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      (click)="isChartsSectionExpanded.update(v => !v)"
                      class="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                      [title]="isChartsSectionExpanded() ? 'Згорнути' : 'Розгорнути'"
                    >
                      <mat-icon aria-hidden="true" class="text-base leading-none">
                        {{ isChartsSectionExpanded() ? 'expand_less' : 'expand_more' }}
                      </mat-icon>
                    </button>
                  </div>

                  @if (isChartsSectionExpanded()) {
                    <!-- Multi-segment Stacked Bar (All Devices + Untracked) -->
                    <div class="space-y-2">
                      <div class="flex items-center justify-between text-2xs font-semibold text-slate-600 dark:text-slate-400">
                        <span>Розподіл спожитих {{ dSummary.houseReferenceKwh.toFixed(1) }} кВт·год за {{ dSummary.monthLabel }}</span>
                        <span>100% ({{ dSummary.houseReferenceCostUah.toFixed(0) }} грн)</span>
                      </div>
                      <div class="w-full h-5 rounded-xl bg-slate-100 dark:bg-slate-800 overflow-hidden flex border border-slate-200 dark:border-slate-700 p-0.5 gap-0.5">
                        @for (item of dSummary.deviceRows; track item.device.id) {
                          @if (item.shareOfHousePercent > 0) {
                            <div
                              class="h-full first:rounded-l-lg last:rounded-r-lg transition-all duration-500"
                              [style.width.%]="Math.max(2, item.shareOfHousePercent)"
                              [style.background-color]="item.device.color || '#10b981'"
                              [title]="item.device.name + ': ' + item.monthKwh.toFixed(2) + ' кВт·год (' + item.shareOfHousePercent.toFixed(1) + '%)'"
                            ></div>
                          }
                        }
                        @if (dSummary.untrackedSharePercent > 0) {
                          <div
                            class="h-full bg-slate-300 dark:bg-slate-600 last:rounded-r-lg transition-all duration-500"
                            [style.width.%]="dSummary.untrackedSharePercent"
                            [title]="'Інші прилади (поза моніторингом): ' + dSummary.untrackedKwh.toFixed(2) + ' кВт·год (' + dSummary.untrackedSharePercent.toFixed(1) + '%)'"
                          ></div>
                        }
                      </div>
                      <!-- Legend -->
                      <div class="flex items-center gap-3 flex-wrap pt-1">
                        @for (item of dSummary.deviceRows; track item.device.id) {
                          <div class="flex items-center gap-1.5 text-2xs">
                            <span class="w-2.5 h-2.5 rounded-xs shrink-0" [style.background-color]="item.device.color || '#10b981'"></span>
                            <span class="font-semibold text-slate-700 dark:text-slate-300">{{ item.device.name }}</span>
                            <span class="font-mono text-slate-500 dark:text-slate-400">({{ item.shareOfHousePercent.toFixed(1) }}%)</span>
                          </div>
                        }
                        <div class="flex items-center gap-1.5 text-2xs">
                          <span class="w-2.5 h-2.5 rounded-xs bg-slate-300 dark:bg-slate-600 shrink-0"></span>
                          <span class="font-semibold text-slate-600 dark:text-slate-400">Інші прилади (фонове)</span>
                          <span class="font-mono text-slate-500 dark:text-slate-400">({{ dSummary.untrackedSharePercent.toFixed(1) }}%)</span>
                        </div>
                      </div>
                    </div>

                    <!-- SVG Grouped Bar Chart: Fact vs End-of-Month Forecast per Device -->
                    <div class="pt-2 space-y-2">
                      <div class="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                        <span>Графік: Спожито на дату vs Прогноз до кінця місяця (кВт·год)</span>
                        <div class="flex items-center gap-3 text-3xs font-semibold">
                          <span class="flex items-center gap-1">
                            <span class="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block"></span> Факт на дату
                          </span>
                          <span class="flex items-center gap-1">
                            <span class="w-2.5 h-2.5 rounded-xs bg-amber-300 border border-amber-500 inline-block"></span> Прогноз ({{ dSummary.daysInMonth }} дн.)
                          </span>
                        </div>
                      </div>

                      <div class="w-full overflow-x-auto bg-slate-50/70 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700 p-3">
                        <svg
                          [attr.viewBox]="'0 0 600 ' + (Math.max(1, dSummary.deviceRows.length + 1) * 44 + 20)"
                          class="w-full h-auto min-w-[440px]"
                        >
                          @for (item of dSummary.deviceRows; track item.device.id; let idx = $index) {
                            @let yPos = idx * 44 + 12;
                            @let factW = dSummary.maxChartKwh > 0 ? Math.max(4, (item.monthKwh / dSummary.maxChartKwh) * 340) : 4;
                            @let projW = dSummary.maxChartKwh > 0 ? Math.max(4, (item.projectedMonthKwh / dSummary.maxChartKwh) * 340) : 4;
                            <!-- Device label -->
                            <text
                              x="4"
                              [attr.y]="yPos + 15"
                              class="fill-slate-800 dark:fill-slate-200 text-[11px] font-bold"
                            >
                              {{ item.device.name.length > 18 ? item.device.name.slice(0, 18) + '…' : item.device.name }}
                            </text>
                            <text
                              x="4"
                              [attr.y]="yPos + 29"
                              class="fill-slate-400 dark:fill-slate-400 text-[9px] font-mono"
                            >
                              ~{{ item.dailyPaceKwh.toFixed(2) }} кВт·г/д ({{ item.shareOfHousePercent.toFixed(0) }}%)
                            </text>

                            <!-- Projected bar (background) -->
                            <rect
                              x="145"
                              [attr.y]="yPos + 4"
                              [attr.width]="projW"
                              height="24"
                              rx="6"
                              fill="#fde68a"
                              stroke="#f59e0b"
                              stroke-width="1"
                              stroke-dasharray="3 2"
                            />
                            <!-- Actual bar (foreground) -->
                            <rect
                              x="145"
                              [attr.y]="yPos + 4"
                              [attr.width]="factW"
                              height="24"
                              rx="6"
                              [attr.fill]="item.device.color || '#10b981'"
                            />

                            <!-- Value label -->
                            <text
                              [attr.x]="153 + Math.max(factW, projW)"
                              [attr.y]="yPos + 20"
                              class="fill-slate-800 dark:fill-slate-200 text-[10px] font-mono font-bold"
                            >
                              {{ item.monthKwh.toFixed(1) }} → {{ item.projectedMonthKwh.toFixed(1) }} кВт·г ({{ item.projectedMonthCostUah.toFixed(0) }} грн)
                            </text>
                          }

                          <!-- Untracked row -->
                          @let unY = dSummary.deviceRows.length * 44 + 12;
                          @let unFactW = dSummary.maxChartKwh > 0 ? Math.max(4, (dSummary.untrackedKwh / dSummary.maxChartKwh) * 340) : 4;
                          @let unProjW = dSummary.maxChartKwh > 0 ? Math.max(4, (dSummary.projectedUntrackedMonthKwh / dSummary.maxChartKwh) * 340) : 4;
                          <text x="4" [attr.y]="unY + 15" class="fill-slate-600 dark:fill-slate-300 text-[11px] font-semibold">
                            Інші прилади (фонове)
                          </text>
                          <text x="4" [attr.y]="unY + 29" class="fill-slate-400 text-[9px] font-mono">
                            поза моніторингом ({{ dSummary.untrackedSharePercent.toFixed(0) }}%)
                          </text>
                          <rect
                            x="145"
                            [attr.y]="unY + 4"
                            [attr.width]="unProjW"
                            height="22"
                            rx="6"
                            fill="#e2e8f0"
                            stroke="#94a3b8"
                            stroke-width="1"
                            stroke-dasharray="3 2"
                          />
                          <rect
                            x="145"
                            [attr.y]="unY + 4"
                            [attr.width]="unFactW"
                            height="22"
                            rx="6"
                            fill="#64748b"
                          />
                          <text
                            [attr.x]="153 + Math.max(unFactW, unProjW)"
                            [attr.y]="unY + 19"
                            class="fill-slate-600 dark:fill-slate-300 text-[10px] font-mono font-semibold"
                          >
                            {{ dSummary.untrackedKwh.toFixed(1) }} → {{ dSummary.projectedUntrackedMonthKwh.toFixed(1) }} кВт·г
                          </text>
                        </svg>
                      </div>
                    </div>

                    <!-- Daily Timeline Progression -->
                    @if (dSummary.dateProgressionPoints.length > 0) {
                      <div class="pt-2 space-y-2 border-t border-slate-100 dark:border-slate-800">
                        <div class="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <mat-icon aria-hidden="true" class="text-sm text-indigo-600 dark:text-indigo-400 leading-none">timeline</mat-icon>
                          <span>Динаміка внесеного споживання пристроїв по датах місяця</span>
                        </div>
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          @for (pt of dSummary.dateProgressionPoints; track pt.date) {
                            <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700">
                              <div class="text-3xs font-semibold text-slate-500 dark:text-slate-400">{{ pt.date | formatDateUa }}</div>
                              <div class="text-sm font-black font-mono text-slate-900 dark:text-white mt-0.5">
                                {{ pt.cumulativeDevicesKwh.toFixed(2) }} <span class="text-3xs font-normal">кВт·г</span>
                              </div>
                              <div class="text-3xs text-emerald-700 dark:text-emerald-400 font-medium truncate" [title]="pt.devicesSummary">
                                {{ pt.devicesSummary }}
                              </div>
                            </div>
                          }
                        </div>
                      </div>
                    }
                  } @else {
                    <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-2xs text-slate-600 dark:text-slate-300 flex items-center justify-between gap-2">
                      <span>Розподіл: прилади {{ dSummary.totalDevicesKwh.toFixed(1) }} кВт·г ({{ dSummary.devicesSharePercent.toFixed(0) }}%) vs інші {{ dSummary.untrackedKwh.toFixed(1) }} кВт·г</span>
                      <button
                        type="button"
                        (click)="isChartsSectionExpanded.set(true)"
                        class="text-3xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                      >
                        Розгорнути графік
                      </button>
                    </div>
                  }
                </div>

                <!-- Right 5 cols: Smart Analysis, Insights & Forecast Recommendations -->
                <div class="lg:col-span-5 p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs flex flex-col justify-between space-y-4">
                  <div class="space-y-4">
                    <div class="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                      <div class="flex items-center gap-2.5">
                        <button
                          type="button"
                          (click)="isInsightsSectionExpanded.update(v => !v)"
                          class="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 cursor-pointer hover:bg-amber-500/25 transition-colors"
                          [title]="isInsightsSectionExpanded() ? 'Згорнути інсайти' : 'Розгорнути інсайти'"
                        >
                          <mat-icon aria-hidden="true" class="text-lg leading-none transition-transform duration-200" [class.rotate-180]="!isInsightsSectionExpanded()">
                            expand_more
                          </mat-icon>
                        </button>
                        <div>
                          <h4
                            class="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-1.5 cursor-pointer hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                            (click)="isInsightsSectionExpanded.update(v => !v)"
                          >
                            <mat-icon aria-hidden="true" class="text-amber-500 text-lg">lightbulb</mat-icon>
                            <span>Аналіз та прогнози</span>
                          </h4>
                          <p class="text-2xs text-slate-500 dark:text-slate-400">
                            Висновки на основі показів лічильника та приладів
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        (click)="isInsightsSectionExpanded.update(v => !v)"
                        class="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                        [title]="isInsightsSectionExpanded() ? 'Згорнути' : 'Розгорнути'"
                      >
                        <mat-icon aria-hidden="true" class="text-base leading-none">
                          {{ isInsightsSectionExpanded() ? 'expand_less' : 'expand_more' }}
                        </mat-icon>
                      </button>
                    </div>

                    @if (isInsightsSectionExpanded()) {
                      <div class="space-y-3">
                        @for (insight of dSummary.insights; track insight.title) {
                          <div
                            class="p-3.5 rounded-xl border space-y-1"
                            [class.bg-amber-50/70]="insight.tone === 'amber'"
                            [class.dark:bg-amber-950/30]="insight.tone === 'amber'"
                            [class.border-amber-200]="insight.tone === 'amber'"
                            [class.dark:border-amber-800]="insight.tone === 'amber'"
                            [class.bg-emerald-50/70]="insight.tone === 'emerald'"
                            [class.dark:bg-emerald-950/30]="insight.tone === 'emerald'"
                            [class.border-emerald-200]="insight.tone === 'emerald'"
                            [class.dark:border-emerald-800]="insight.tone === 'emerald'"
                            [class.bg-indigo-50/70]="insight.tone === 'indigo'"
                            [class.dark:bg-indigo-950/30]="insight.tone === 'indigo'"
                            [class.border-indigo-200]="insight.tone === 'indigo'"
                            [class.dark:border-indigo-800]="insight.tone === 'indigo'"
                            [class.bg-rose-50/70]="insight.tone === 'rose'"
                            [class.dark:bg-rose-950/30]="insight.tone === 'rose'"
                            [class.border-rose-200]="insight.tone === 'rose'"
                            [class.dark:border-rose-800]="insight.tone === 'rose'"
                          >
                            <div class="flex items-center justify-between gap-2">
                              <div class="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
                                <mat-icon aria-hidden="true"
                                  class="text-base leading-none"
                                  [class.text-amber-600]="insight.tone === 'amber'"
                                  [class.text-emerald-600]="insight.tone === 'emerald'"
                                  [class.text-indigo-600]="insight.tone === 'indigo'"
                                  [class.text-rose-600]="insight.tone === 'rose'"
                                >
                                  {{ insight.icon }}
                                </mat-icon>
                                <span>{{ insight.title }}</span>
                              </div>
                              @if (insight.badge) {
                                <span class="px-2.5 py-0.5 rounded-full text-3xs font-mono font-extrabold bg-slate-900 dark:bg-slate-950 text-amber-300 dark:text-emerald-300 border border-slate-700 shrink-0 shadow-2xs">
                                  {{ insight.badge }}
                                </span>
                              }
                            </div>
                            <p class="text-2xs text-slate-700 dark:text-slate-200 leading-relaxed">
                              {{ insight.description }}
                            </p>
                          </div>
                        }
                      </div>
                    } @else {
                      <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-2xs text-slate-600 dark:text-slate-300 flex items-center justify-between gap-2">
                        <span>{{ dSummary.insights.length }} AI-інсайтів сформовано для цього будинку</span>
                        <button
                          type="button"
                          (click)="isInsightsSectionExpanded.set(true)"
                          class="text-3xs font-semibold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                        >
                          Розгорнути інсайти
                        </button>
                      </div>
                    }
                  </div>

                  <!-- Quick CTA to upload screenshot -->
                  @if (canEdit()) {
                    <div class="p-3.5 rounded-xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-transparent border border-emerald-500/20 flex items-center justify-between gap-3">
                      <div class="text-2xs text-slate-700 dark:text-slate-300">
                        <span class="font-bold text-slate-900 dark:text-white block">Маєте скріншот з додатка розумної розетки?</span>
                        Завантажте фото та додайте коментар — ШІ сам порахує кВт·год і додасть до приладу.
                      </div>
                      <button
                        type="button"
                        (click)="openScreenshotModal()"
                        class="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-2xs font-bold flex items-center gap-1 shrink-0 cursor-pointer shadow-2xs"
                      >
                        <mat-icon aria-hidden="true" class="text-sm leading-none">add_photo_alternate</mat-icon>
                        <span>Аналіз фото</span>
                      </button>
                    </div>
                  }
                </div>
              </div>
            }
          </div>
  `,
})
export class ElectricityDevicesDashboardComponent {
  readonly ctx = inject(ELECTRICITY_VIEW_CTX);
  readonly Math = Math;

  readonly canEdit = this.ctx.canEdit;
  readonly weatherData = this.ctx.weatherData;
  readonly isWeatherLoading = this.ctx.isWeatherLoading;
  readonly accountDevices = this.ctx.accountDevices;
  readonly currentAccount = this.ctx.currentAccount;
  get acc() {
    return this.ctx.currentAccount()!;
  }
  readonly customMonthHouseKwh = this.ctx.customMonthHouseKwh;
  readonly deviceAnalyticsSummary = this.ctx.deviceAnalyticsSummary;

  readonly isWeatherSectionExpanded = signal<boolean>(true);
  readonly isOverviewKpiExpanded = signal<boolean>(true);
  readonly isUsageWarningExpanded = signal<boolean>(true);
  readonly isDevicesSectionExpanded = signal<boolean>(true);
  readonly isChartsSectionExpanded = signal<boolean>(true);
  readonly isInsightsSectionExpanded = signal<boolean>(true);

  readonly deviceViewLayout = signal<"cards" | "list">("cards");
  readonly devicePowerStates = signal<Record<string, boolean>>({});
  readonly expandedCompactDeviceIds = signal<Record<string, boolean>>({});

  formatDate(dateStr: string): string {
    return formatDateUa(dateStr, true);
  }

  isDevicePowerOn(deviceId: string): boolean {
    const map = this.devicePowerStates();
    return map[deviceId] !== undefined ? map[deviceId] : true;
  }

  toggleDevicePowerState(deviceId: string): void {
    this.devicePowerStates.update((prev) => ({
      ...prev,
      [deviceId]: prev[deviceId] !== undefined ? !prev[deviceId] : false,
    }));
  }

  getSmartCardArchetype(item: { device: ElectricityDevice; isAirConditioner?: boolean }) {
    return getSmartCardArchetypeInfo(item);
  }

  getSmartCardStatusInfo(item: {
    device: ElectricityDevice;
    isAirConditioner?: boolean;
    allLogsCount?: number;
  }) {
    return getSmartCardStatusInfoHelper(item, this.isDevicePowerOn(item.device.id));
  }

  getSmartCardLeftMetric(item: {
    device: ElectricityDevice;
    isAirConditioner?: boolean;
    steadyOperatingWatts?: number;
    effectiveOperatingWatts?: number;
    empiricalHourlyWatts?: number | null;
    dailyPaceKwh: number;
    avgKwhPerReading: number;
    allLogsCount: number;
    attributedNotes?: Array<{ hours: number; kwh: number }>;
  }) {
    return getSmartCardLeftMetricInfo(item, this.isDevicePowerOn(item.device.id));
  }

  getSmartCardRightMetric(item: {
    device: ElectricityDevice;
    isAirConditioner?: boolean;
    monthKwh: number;
    monthCostUah: number;
    avgKwhPerReading: number;
    allLogsCount: number;
    shareOfHousePercent: number;
  }) {
    return getSmartCardRightMetricInfo(item);
  }

  getSmartCardDailyChart(item: {
    device: ElectricityDevice;
    monthLogs: ElectricityDeviceLogEntry[];
    attributedNotes?: Array<{ readingDate: string; kwh: number; hours: number }>;
  }) {
    return getSmartCardDailyChartInfo(item);
  }

  isCompactDeviceExpanded(deviceId: string): boolean {
    return Boolean(this.expandedCompactDeviceIds()[deviceId]);
  }

  toggleCompactDevice(deviceId: string): void {
    this.expandedCompactDeviceIds.update((prev) => ({
      ...prev,
      [deviceId]: !prev[deviceId],
    }));
  }

  focusAndExpandDeviceFromWarning(deviceId: string): void {
    this.isDevicesSectionExpanded.set(true);
    this.expandedCompactDeviceIds.update((prev) => ({
      ...prev,
      [deviceId]: true,
    }));
  }

  loadWeatherForCurrentAccount(city?: string, month?: string, date?: string): Promise<void> {
    return this.ctx.loadWeatherForCurrentAccount(city, month, date);
  }

  getEffectiveLogWeather(log: ElectricityDeviceLogEntry): DailyWeatherPoint {
    return this.ctx.getEffectiveLogWeather(log);
  }

  onCustomMonthHouseKwhChange(valStr: string): void {
    const trimmed = valStr.trim();
    if (!trimmed) {
      this.customMonthHouseKwh.set(null);
      return;
    }
    const num = Number(trimmed);
    this.customMonthHouseKwh.set(!isNaN(num) && num >= 0 ? num : null);
  }

  openDeviceModal(): void {
    this.ctx.openDeviceModal();
  }

  openEditDeviceModal(device: ElectricityDevice): void {
    this.ctx.openEditDeviceModal(device);
  }

  deleteDevice(deviceId: string): Promise<void> {
    return this.ctx.deleteDevice(deviceId);
  }

  getDeviceLogDateLabel(log: ElectricityDeviceLogEntry): string {
    return getDeviceLogDateLabelHelper(log);
  }

  getDeviceLogModeBadge(log: ElectricityDeviceLogEntry): string {
    return getDeviceLogModeBadgeHelper(log);
  }

  getDeviceLogTimeIntervalBadge(log: ElectricityDeviceLogEntry): string {
    return getDeviceLogTimeIntervalBadgeHelper(log);
  }

  getDeviceLogTariffBadge(log: ElectricityDeviceLogEntry): string {
    return getDeviceLogTariffBadgeHelper(log);
  }

  openAddDeviceLogModal(deviceId?: string): void {
    this.ctx.openAddDeviceLogModal(deviceId);
  }

  openEditDeviceLogModal(deviceId: string, log: ElectricityDeviceLogEntry): void {
    this.ctx.openEditDeviceLogModal(deviceId, log);
  }

  deleteDeviceLog(deviceId: string, logId: string): Promise<void> {
    return this.ctx.deleteDeviceLog(deviceId, logId);
  }

  openScreenshotModal(deviceId?: string): void {
    this.ctx.openScreenshotModal(deviceId);
  }
}
