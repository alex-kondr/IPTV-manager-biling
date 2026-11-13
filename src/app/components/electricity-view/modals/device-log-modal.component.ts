import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from "@angular/core";
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import {
  DailyWeatherPoint,
  DeviceConsumptionEntryMode,
  ElectricityDevice,
  ElectricityDeviceLogEntry,
} from "../../../models/utility.model";
import { formatDateUa } from "../../../models/client.model";
import { isAirConditionerDevice, resolveAirConditionerPowerProfile } from "../../../models/utility.model";
import { computeDurationHoursHelper } from "../electricity-device-analytics.util";
import { FormatDateUaPipe } from "../electricity-pipes";
import { ELECTRICITY_VIEW_CTX } from "../electricity-view.context";

@Component({
  selector: "app-device-log-modal",
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, FormatDateUaPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
      <div class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4 flex items-end sm:items-center justify-center">
        <div class="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[94dvh] pb-safe sm:pb-0 animate-in fade-in duration-150 sm:my-auto">
          <div class="sm:hidden flex justify-center pt-2.5 pb-1 bg-slate-50 shrink-0">
            <div class="w-10 h-1 rounded-full bg-slate-300"></div>
          </div>
          <div class="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 bg-slate-50 shrink-0">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                <mat-icon aria-hidden="true">{{ editingDeviceLogId() ? 'edit_note' : 'playlist_add' }}</mat-icon>
              </div>
              <div>
                <h3 class="text-base font-bold text-slate-900">
                  {{ editingDeviceLogId() ? 'Редагувати запис споживання' : 'Внести споживання приладу' }}
                </h3>
                <p class="text-3xs text-slate-500">За конкретну добу, відрізок часу або станом на дату з початку місяця</p>
              </div>
            </div>
            <button
              type="button"
              (click)="closeDeviceLogModal()"
              class="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center cursor-pointer"
            >
              <mat-icon aria-hidden="true" class="text-lg">close</mat-icon>
            </button>
          </div>

          <form [formGroup]="deviceLogForm" (ngSubmit)="saveDeviceLog()" class="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div class="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
              <!-- Select Device -->
              <div>
                <label for="dlog-device" class="block text-xs font-semibold text-slate-700 mb-1">
                  Оберіть пристрій *
                </label>
                <select
                  id="dlog-device"
                  formControlName="deviceId"
                  (change)="onDeviceLogFormChange()"
                  class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500"
                >
                  @for (dev of accountDevices(); track dev.id) {
                    <option [value]="dev.id">
                      {{ dev.name }}
                      {{ dev.powerWatts ? '(' + dev.powerWatts + ' Вт)' : '' }}
                      {{ dev.batteryCapacityKwh ? '[' + dev.batteryCapacityKwh + ' кВт·год]' : '' }}
                    </option>
                  }
                </select>
              </div>

              <!-- Entry Mode Selector Cards (Specific Day / Time Interval / Cumulative Month / Delta) -->
              <div>
                <span class="block text-xs font-semibold text-slate-700 mb-1.5">
                  Оберіть період або спосіб обліку споживання *
                </span>
                <div class="grid grid-cols-2 gap-2">
                  <!-- Option 1: Specific Day -->
                  <button
                    type="button"
                    (click)="setDeviceLogEntryMode('single_day')"
                    class="p-2.5 rounded-xl border text-left flex items-start gap-2 cursor-pointer transition-all"
                    [class.border-sky-500]="deviceLogForm.get('entryMode')?.value === 'single_day'"
                    [class.bg-sky-50/70]="deviceLogForm.get('entryMode')?.value === 'single_day'"
                    [class.border-slate-200]="deviceLogForm.get('entryMode')?.value !== 'single_day'"
                  >
                    <mat-icon aria-hidden="true"
                      class="text-base leading-none mt-0.5 shrink-0"
                      [class.text-sky-600]="deviceLogForm.get('entryMode')?.value === 'single_day'"
                      [class.text-slate-400]="deviceLogForm.get('entryMode')?.value !== 'single_day'"
                    >
                      today
                    </mat-icon>
                    <div>
                      <div class="text-xs font-bold text-slate-900">За конкретну добу</div>
                      <div class="text-3xs text-slate-500">Спожито за обраний день (+ до місяця)</div>
                    </div>
                  </button>

                  <!-- Option 2: Time Interval / Period Range -->
                  <button
                    type="button"
                    (click)="setDeviceLogEntryMode('period_range')"
                    class="p-2.5 rounded-xl border text-left flex items-start gap-2 cursor-pointer transition-all"
                    [class.border-indigo-500]="deviceLogForm.get('entryMode')?.value === 'period_range'"
                    [class.bg-indigo-50/70]="deviceLogForm.get('entryMode')?.value === 'period_range'"
                    [class.border-slate-200]="deviceLogForm.get('entryMode')?.value !== 'period_range'"
                  >
                    <mat-icon aria-hidden="true"
                      class="text-base leading-none mt-0.5 shrink-0"
                      [class.text-indigo-600]="deviceLogForm.get('entryMode')?.value === 'period_range'"
                      [class.text-slate-400]="deviceLogForm.get('entryMode')?.value !== 'period_range'"
                    >
                      schedule
                    </mat-icon>
                    <div>
                      <div class="text-xs font-bold text-slate-900">За відрізок часу</div>
                      <div class="text-3xs text-slate-500">Часовий інтервал (ГГ:ХХ–ГГ:ХХ) або дні</div>
                    </div>
                  </button>

                  <!-- Option 3: Cumulative Month as of Date -->
                  <button
                    type="button"
                    (click)="setDeviceLogEntryMode('cumulative_month')"
                    class="p-2.5 rounded-xl border text-left flex items-start gap-2 cursor-pointer transition-all"
                    [class.border-emerald-500]="deviceLogForm.get('entryMode')?.value === 'cumulative_month'"
                    [class.bg-emerald-50/70]="deviceLogForm.get('entryMode')?.value === 'cumulative_month'"
                    [class.border-slate-200]="deviceLogForm.get('entryMode')?.value !== 'cumulative_month'"
                  >
                    <mat-icon aria-hidden="true"
                      class="text-base leading-none mt-0.5 shrink-0"
                      [class.text-emerald-600]="deviceLogForm.get('entryMode')?.value === 'cumulative_month'"
                      [class.text-slate-400]="deviceLogForm.get('entryMode')?.value !== 'cumulative_month'"
                    >
                      calendar_month
                    </mat-icon>
                    <div>
                      <div class="text-xs font-bold text-slate-900">З початку місяця</div>
                      <div class="text-3xs text-slate-500">Сумарний показник станом на дату</div>
                    </div>
                  </button>

                  <!-- Option 4: Delta -->
                  <button
                    type="button"
                    (click)="setDeviceLogEntryMode('delta')"
                    class="p-2.5 rounded-xl border text-left flex items-start gap-2 cursor-pointer transition-all"
                    [class.border-amber-500]="deviceLogForm.get('entryMode')?.value === 'delta'"
                    [class.bg-amber-50/70]="deviceLogForm.get('entryMode')?.value === 'delta'"
                    [class.border-slate-200]="deviceLogForm.get('entryMode')?.value !== 'delta'"
                  >
                    <mat-icon aria-hidden="true"
                      class="text-base leading-none mt-0.5 shrink-0"
                      [class.text-amber-600]="deviceLogForm.get('entryMode')?.value === 'delta'"
                      [class.text-slate-400]="deviceLogForm.get('entryMode')?.value !== 'delta'"
                    >
                      add_circle_outline
                    </mat-icon>
                    <div>
                      <div class="text-xs font-bold text-slate-900">+ Додати дельту</div>
                      <div class="text-3xs text-slate-500">Додати кВт·год до місячного підсумку</div>
                    </div>
                  </button>
                </div>
              </div>

              <!-- Dynamic Date & Time Interval Section -->
              @if (deviceLogForm.get('entryMode')?.value === 'period_range') {
                <div class="p-3.5 rounded-xl bg-indigo-50/60 border border-indigo-200 space-y-3">
                  <div class="flex items-center justify-between gap-2 flex-wrap">
                    <span class="text-2xs font-bold text-indigo-950 flex items-center gap-1">
                      <mat-icon aria-hidden="true" class="text-sm text-indigo-600 leading-none">date_range</mat-icon>
                      <span>Вкажіть відрізок часу (початок та завершення):</span>
                    </span>
                    @if (calculatedLogDurationHours(); as durH) {
                      <span class="px-2 py-0.5 rounded-full bg-indigo-200/80 text-indigo-950 text-3xs font-mono font-bold">
                        Тривалість: {{ durH }} год
                      </span>
                    }
                  </div>

                  <!-- Quick Time Interval Presets -->
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      (click)="applyQuickTimeInterval('23:00', '07:00', true)"
                      class="px-2 py-1 rounded-lg bg-white hover:bg-indigo-100 border border-indigo-200 text-3xs font-semibold text-indigo-900 cursor-pointer"
                    >
                      🌙 Ніч 23:00–07:00 (8 год)
                    </button>
                    <button
                      type="button"
                      (click)="applyQuickTimeInterval('18:00', '23:00', false)"
                      class="px-2 py-1 rounded-lg bg-white hover:bg-indigo-100 border border-indigo-200 text-3xs font-semibold text-indigo-900 cursor-pointer"
                    >
                      🌆 Вечір 18:00–23:00 (5 год)
                    </button>
                    <button
                      type="button"
                      (click)="applyQuickTimeInterval('09:00', '17:00', false)"
                      class="px-2 py-1 rounded-lg bg-white hover:bg-indigo-100 border border-indigo-200 text-3xs font-semibold text-indigo-900 cursor-pointer"
                    >
                      ☀️ День 09:00–17:00 (8 год)
                    </button>
                    <button
                      type="button"
                      (click)="applyQuickTimeInterval('20:00', '22:00', false)"
                      class="px-2 py-1 rounded-lg bg-white hover:bg-indigo-100 border border-indigo-200 text-3xs font-semibold text-indigo-900 cursor-pointer"
                    >
                      ⏱️ 2 години (20:00–22:00)
                    </button>
                  </div>

                  <div class="grid grid-cols-2 gap-2.5">
                    <div>
                      <label for="dlog-start-date" class="block text-3xs font-bold uppercase text-indigo-900 mb-1">
                        Дата початку *
                      </label>
                      <input
                        id="dlog-start-date"
                        type="date"
                        formControlName="date"
                        (change)="onDeviceLogFormChange()"
                        class="w-full px-3 py-1.5 bg-white border border-indigo-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-indigo-600"
                      />
                    </div>
                    <div>
                      <label for="dlog-start-time" class="block text-3xs font-bold uppercase text-indigo-900 mb-1">
                        Час початку (ГГ:ХХ)
                      </label>
                      <input
                        id="dlog-start-time"
                        type="time"
                        formControlName="startTime"
                        (change)="onDeviceLogFormChange()"
                        class="w-full px-3 py-1.5 bg-white border border-indigo-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-indigo-600"
                      />
                    </div>
                    <div>
                      <label for="dlog-end-date" class="block text-3xs font-bold uppercase text-indigo-900 mb-1">
                        Дата завершення
                      </label>
                      <input
                        id="dlog-end-date"
                        type="date"
                        formControlName="endDate"
                        (change)="onDeviceLogFormChange()"
                        class="w-full px-3 py-1.5 bg-white border border-indigo-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-indigo-600"
                      />
                    </div>
                    <div>
                      <label for="dlog-end-time" class="block text-3xs font-bold uppercase text-indigo-900 mb-1">
                        Час завершення (ГГ:ХХ)
                      </label>
                      <input
                        id="dlog-end-time"
                        type="time"
                        formControlName="endTime"
                        (change)="onDeviceLogFormChange()"
                        class="w-full px-3 py-1.5 bg-white border border-indigo-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-indigo-600"
                      />
                    </div>
                  </div>

                  @if (estimatedKwhFromPowerAndDuration(); as estKwh) {
                    <div class="flex items-center justify-between gap-2 pt-1 border-t border-indigo-200/80">
                      <span class="text-3xs text-indigo-900">
                        @if (isSelectedLogDeviceAirConditioner()) {
                          За профілем кондиціонера (пік {{ selectedLogDevice()?.powerWatts || 2200 }} Вт → робочий 400–800 Вт·г × {{ calculatedLogDurationHours() }} год):
                        } @else {
                          За потужністю приладу ({{ selectedLogDevice()?.powerWatts }} Вт × {{ calculatedLogDurationHours() }} год):
                        }
                        <b>~{{ estKwh }} кВт·год</b>
                      </span>
                      <button
                        type="button"
                        (click)="applyEstimatedKwhToLogForm(estKwh)"
                        class="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-3xs font-bold cursor-pointer shrink-0"
                      >
                        Підставити {{ estKwh }} кВт·год
                      </button>
                    </div>
                  }
                </div>
              } @else if (deviceLogForm.get('entryMode')?.value === 'single_day') {
                <div class="p-3.5 rounded-xl bg-sky-50/60 border border-sky-200 space-y-2.5">
                  <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label for="dlog-day-date" class="block text-3xs font-bold uppercase text-sky-900 mb-1">
                        Конкретна доба (дата) *
                      </label>
                      <input
                        id="dlog-day-date"
                        type="date"
                        formControlName="date"
                        (change)="onDeviceLogFormChange()"
                        class="w-full px-3 py-1.5 bg-white border border-sky-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-sky-600"
                      />
                    </div>
                    <div>
                      <label for="dlog-day-start" class="block text-3xs font-bold uppercase text-sky-900 mb-1">
                        З (час, необов'язково)
                      </label>
                      <input
                        id="dlog-day-start"
                        type="time"
                        formControlName="startTime"
                        (change)="onDeviceLogFormChange()"
                        class="w-full px-3 py-1.5 bg-white border border-sky-300 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:border-sky-600"
                      />
                    </div>
                    <div>
                      <label for="dlog-day-end" class="block text-3xs font-bold uppercase text-sky-900 mb-1">
                        До (час, необов'язково)
                      </label>
                      <input
                        id="dlog-day-end"
                        type="time"
                        formControlName="endTime"
                        (change)="onDeviceLogFormChange()"
                        class="w-full px-3 py-1.5 bg-white border border-sky-300 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:border-sky-600"
                      />
                    </div>
                  </div>
                </div>
              } @else {
                <div>
                  <label for="dlog-date" class="block text-xs font-semibold text-slate-700 mb-1">
                    Дата у цьому місяці *
                  </label>
                  <input
                    id="dlog-date"
                    type="date"
                    formControlName="date"
                    (change)="onDeviceLogFormChange()"
                    class="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-amber-500"
                  />
                </div>
              }

              <!-- Automatic Weather Attachment for Selected Date -->
              @if (currentFormLogWeather(); as logDayW) {
                <div class="p-3 rounded-xl bg-sky-50 dark:bg-slate-800 border border-sky-200 dark:border-slate-700 flex items-center justify-between gap-3">
                  <div class="flex items-center gap-2.5">
                    <div class="w-8 h-8 rounded-lg bg-sky-600 text-white flex items-center justify-center shrink-0">
                      <mat-icon aria-hidden="true" class="text-base">{{ logDayW.icon }}</mat-icon>
                    </div>
                    <div>
                      <div class="text-2xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                        <span>Погода на {{ logDayW.date | formatDateUa }}:</span>
                        <span class="font-mono text-sky-700 dark:text-sky-300">{{ logDayW.tempAvgC > 0 ? '+' : '' }}{{ logDayW.tempAvgC }}°C ({{ logDayW.tempMinC > 0 ? '+' : '' }}{{ logDayW.tempMinC }}°..{{ logDayW.tempMaxC > 0 ? '+' : '' }}{{ logDayW.tempMaxC }}°C)</span>
                        <span>• {{ logDayW.condition }}</span>
                      </div>
                      <div class="text-3xs text-slate-500 dark:text-slate-400">
                        Дані про температуру автоматично збережуться у записі для точного прогнозу споживання
                      </div>
                    </div>
                  </div>
                  <span class="px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-200 border border-sky-300 dark:border-sky-700 text-3xs font-bold shrink-0">
                    Авто-погода
                  </span>
                </div>
              }

              <!-- EV Battery Charge Helper (when Volkswagen E-Golf 2014 24 kWh or any EV/battery device is selected) -->
              @if (selectedLogDevice()?.batteryCapacityKwh; as batCap) {
                <div class="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 space-y-2.5">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-2xs font-bold text-blue-950 flex items-center gap-1.5">
                      <mat-icon aria-hidden="true" class="text-sm text-blue-600 leading-none">electric_car</mat-icon>
                      <span>Швидкий розрахунок зарядки батареї ({{ batCap }} кВт·год):</span>
                    </span>
                  </div>
                  <div class="grid grid-cols-3 gap-2 items-end">
                    <div>
                      <label for="ev-soc-start" class="block text-3xs font-semibold text-blue-900 mb-1">
                        Заряд ДО (%)
                      </label>
                      <input
                        id="ev-soc-start"
                        type="number"
                        inputmode="numeric"
                        min="0"
                        max="100"
                        [value]="evChargeStartPct()"
                        (input)="evChargeStartPct.set(+$any($event.target).value || 0)"
                        class="w-full px-2.5 py-1.5 bg-white border border-blue-300 rounded-lg text-xs font-mono font-bold text-slate-900"
                      />
                    </div>
                    <div>
                      <label for="ev-soc-end" class="block text-3xs font-semibold text-blue-900 mb-1">
                        Заряд ПІСЛЯ (%)
                      </label>
                      <input
                        id="ev-soc-end"
                        type="number"
                        inputmode="numeric"
                        min="0"
                        max="100"
                        [value]="evChargeEndPct()"
                        (input)="evChargeEndPct.set(+$any($event.target).value || 0)"
                        class="w-full px-2.5 py-1.5 bg-white border border-blue-300 rounded-lg text-xs font-mono font-bold text-slate-900"
                      />
                    </div>
                    <button
                      type="button"
                      (click)="applyEvBatteryChargeCalculation(batCap)"
                      class="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-2xs font-bold cursor-pointer"
                    >
                      = {{ calculateEvChargeKwh(batCap) }} кВт·г
                    </button>
                  </div>
                </div>
              }

              <!-- Tariff Rate Zone Selector (NIGHT / DAY / AUTO TIME) -->
              <div>
                <label for="dlog-tariff-selection" class="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between flex-wrap gap-1">
                  <span>Режим розрахунку тарифу *</span>
                  @if (deviceLogForm.get('tariffSelection')?.value === 'night_only') {
                    <span class="text-3xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                      🌙 Ніч (Т1) (23:00–07:00)
                    </span>
                  } @else if (deviceLogForm.get('tariffSelection')?.value === 'day_only') {
                    <span class="text-3xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                      ☀️ День (Т2) (07:00–23:00)
                    </span>
                  } @else {
                    <span class="text-3xs font-medium text-slate-500">
                      ⏱️ Авторозрахунок по часу
                    </span>
                  }
                </label>
                <select
                  id="dlog-tariff-selection"
                  formControlName="tariffSelection"
                  class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500 shadow-2xs"
                >
                  <option value="night_only">Спожито за нічним тарифом</option>
                  <option value="day_only">Спожито за денним тарифом</option>
                  <option value="auto_time">Розрахувати по часу</option>
                </select>
              </div>

              <!-- Consumed kWh & Comment -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label for="dlog-kwh" class="block text-xs font-semibold text-slate-700 mb-1">
                    Спожито електроенергії (кВт·год) *
                  </label>
                  <input
                    id="dlog-kwh"
                    type="number"
                    inputmode="decimal"
                    step="0.01"
                    min="0"
                    formControlName="consumedKwh"
                    placeholder="Напр. 12.5"
                    class="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono font-bold text-slate-900 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label for="dlog-comment" class="block text-xs font-semibold text-slate-700 mb-1">
                    Коментар (необов'язково)
                  </label>
                  <input
                    id="dlog-comment"
                    type="text"
                    formControlName="comment"
                    placeholder="Напр. Обігрів ввечері / Зарядка авто"
                    class="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </div>

            <div class="flex items-center justify-end gap-2.5 p-4 border-t border-slate-200 bg-slate-50 shrink-0">
              <button
                type="button"
                (click)="closeDeviceLogModal()"
                class="px-4 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Скасувати
              </button>
              <button
                type="submit"
                [disabled]="deviceLogForm.invalid || isSavingDevices()"
                class="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white cursor-pointer disabled:opacity-50"
              >
                {{ editingDeviceLogId() ? 'Зберегти зміни' : 'Додати споживання' }}
              </button>
            </div>
          </form>
        </div>
      </div>
  `,
})
export class DeviceLogModalComponent {
  readonly ctx = inject(ELECTRICITY_VIEW_CTX);
  readonly dataService = this.ctx.dataService;
  readonly isSavingDevices = this.ctx.isSavingDevices;
  readonly editingDeviceLogId = this.ctx.editingDeviceLogId;
  readonly accountDevices = this.ctx.accountDevices;

  readonly deviceLogFormTrigger = signal<number>(0);
  readonly evChargeStartPct = signal<number>(20);
  readonly evChargeEndPct = signal<number>(80);
  readonly logCustomTempAvgC = signal<number | null>(null);
  readonly logCustomWeatherCondition = signal<string>("");

  readonly deviceLogForm = new FormGroup({
    deviceId: new FormControl("", [Validators.required]),
    date: new FormControl(new Date().toISOString().split("T")[0], [Validators.required]),
    endDate: new FormControl(""),
    startTime: new FormControl(""),
    endTime: new FormControl(""),
    consumedKwh: new FormControl<number | null>(null, [Validators.required, Validators.min(0)]),
    entryMode: new FormControl<DeviceConsumptionEntryMode>("single_day", [Validators.required]),
    tariffSelection: new FormControl<"auto_time" | "night_only" | "day_only">("auto_time"),
    comment: new FormControl(""),
  });

  readonly currentFormLogWeather = computed<DailyWeatherPoint>(() => {
    this.deviceLogFormTrigger();
    const mode = this.deviceLogForm.get("entryMode")?.value;
    const dStart = this.deviceLogForm.get("date")?.value || new Date().toISOString().split("T")[0];
    const dEnd = mode === "period_range" ? this.deviceLogForm.get("endDate")?.value : undefined;
    return this.ctx.getWeatherForDate(dStart, dEnd);
  });

  readonly selectedLogDevice = computed<ElectricityDevice | null>(() => {
    this.deviceLogFormTrigger();
    const devId = this.deviceLogForm.get("deviceId")?.value;
    if (!devId) return null;
    return this.accountDevices().find((d) => d.id === devId) || null;
  });

  readonly calculatedLogDurationHours = computed<number | null>(() => {
    this.deviceLogFormTrigger();
    const mode = this.deviceLogForm.get("entryMode")?.value;
    const startDate = this.deviceLogForm.get("date")?.value || "";
    const endDate =
      mode === "period_range"
        ? this.deviceLogForm.get("endDate")?.value || startDate
        : startDate;
    const startTime = this.deviceLogForm.get("startTime")?.value || "";
    const endTime = this.deviceLogForm.get("endTime")?.value || "";

    return computeDurationHoursHelper(startDate, endDate, startTime, endTime);
  });

  readonly estimatedKwhFromPowerAndDuration = computed<number | null>(() => {
    const dev = this.selectedLogDevice();
    const durH = this.calculatedLogDurationHours();
    if (!dev || !durH || durH <= 0) return null;
    if (isAirConditionerDevice(dev)) {
      const w = this.currentFormLogWeather();
      const acProfile = resolveAirConditionerPowerProfile(dev.powerWatts || 1350, durH, dev, w?.tempAvgC);
      return acProfile.estimatedKwh;
    }
    if (!dev.powerWatts || dev.powerWatts <= 0) return null;
    return Math.round((dev.powerWatts / 1000) * durH * 100) / 100;
  });

  constructor() {
    effect(() => {
      const log = this.ctx.editingDeviceLogObj();
      const origDevId = this.ctx.editingDeviceLogOriginalDeviceId();
      const initDevId = this.ctx.initialLogDeviceId();
      const devices = this.accountDevices();

      if (log && origDevId) {
        this.deviceLogForm.reset({
          deviceId: origDevId,
          date: log.date,
          endDate: log.endDate || log.date,
          startTime: log.startTime || "",
          endTime: log.endTime || "",
          consumedKwh: log.consumedKwh,
          entryMode: log.entryMode || "single_day",
          tariffSelection: log.tariffSelection || "auto_time",
          comment: log.comment || "",
        });
        const effWeather = this.ctx.getEffectiveLogWeather(log);
        this.logCustomTempAvgC.set(effWeather.tempAvgC);
        this.logCustomWeatherCondition.set(effWeather.condition);
        this.onDeviceLogFormChange(false);
      } else {
        const targetId = initDevId || (devices[0]?.id ?? "");
        const today = new Date().toISOString().split("T")[0];
        const selMonth = this.ctx.deviceSelectedMonth();
        const defaultDate = today.startsWith(selMonth) ? today : `${selMonth}-15`;
        this.deviceLogForm.reset({
          deviceId: targetId,
          date: defaultDate,
          endDate: defaultDate,
          startTime: "",
          endTime: "",
          consumedKwh: null,
          entryMode: "single_day",
          tariffSelection: "auto_time",
          comment: "",
        });
        this.onDeviceLogFormChange(true);
      }
    });
  }

  formatDate(dateStr: string): string {
    return formatDateUa(dateStr, true);
  }

  isSelectedLogDeviceAirConditioner(): boolean {
    return isAirConditionerDevice(this.selectedLogDevice());
  }

  onDeviceLogFormChange(syncWeatherFromDate = true): void {
    this.deviceLogFormTrigger.update((v) => v + 1);
    if (syncWeatherFromDate) {
      const w = this.currentFormLogWeather();
      this.logCustomTempAvgC.set(w.tempAvgC);
      this.logCustomWeatherCondition.set(w.condition);
    }
  }

  setDeviceLogEntryMode(mode: DeviceConsumptionEntryMode): void {
    const curDate = this.deviceLogForm.get("date")?.value || new Date().toISOString().split("T")[0];
    this.deviceLogForm.patchValue({
      entryMode: mode,
      endDate: mode === "period_range" ? this.deviceLogForm.get("endDate")?.value || curDate : "",
    });
    this.onDeviceLogFormChange();
  }

  applyQuickTimeInterval(startTime: string, endTime: string, isOvernight: boolean): void {
    const startDate = this.deviceLogForm.get("date")?.value || new Date().toISOString().split("T")[0];
    let endDate = startDate;
    if (isOvernight) {
      const d = new Date(startDate);
      if (!isNaN(d.getTime())) {
        d.setDate(d.getDate() + 1);
        endDate = d.toISOString().split("T")[0];
      }
    }
    this.deviceLogForm.patchValue({
      entryMode: "period_range",
      endDate,
      startTime,
      endTime,
    });
    this.onDeviceLogFormChange();
  }

  applyEstimatedKwhToLogForm(estKwh: number): void {
    this.deviceLogForm.patchValue({ consumedKwh: estKwh });
    this.onDeviceLogFormChange(false);
  }

  calculateEvChargeKwh(batteryCapacityKwh: number): number {
    const s = Math.max(0, Math.min(100, this.evChargeStartPct()));
    const e = Math.max(0, Math.min(100, this.evChargeEndPct()));
    const diffPct = Math.max(0, e - s);
    return Math.round(((diffPct / 100) * batteryCapacityKwh) * 100) / 100;
  }

  applyEvBatteryChargeCalculation(batteryCapacityKwh: number): void {
    const kwh = this.calculateEvChargeKwh(batteryCapacityKwh);
    const s = this.evChargeStartPct();
    const e = this.evChargeEndPct();
    const curComment = this.deviceLogForm.get("comment")?.value?.trim() || "";
    this.deviceLogForm.patchValue({
      consumedKwh: kwh,
      comment: curComment || `Зарядка батареї з ${s}% до ${e}% (${batteryCapacityKwh} кВт·год)`,
    });
    this.onDeviceLogFormChange(false);
  }

  closeDeviceLogModal(): void {
    this.ctx.closeDeviceLogModal();
  }

  async saveDeviceLog(): Promise<void> {
    if (this.deviceLogForm.invalid) return;
    const acc = this.ctx.currentAccount();
    if (!acc) return;

    const val = this.deviceLogForm.getRawValue();
    const dateStr = val.date || new Date().toISOString().split("T")[0];
    const entryMode: DeviceConsumptionEntryMode = val.entryMode || "single_day";
    const endDateStr =
      entryMode === "period_range" && val.endDate ? val.endDate.trim() : undefined;
    const startTimeStr =
      (entryMode === "period_range" || entryMode === "single_day") && val.startTime
        ? val.startTime.trim()
        : undefined;
    const endTimeStr =
      (entryMode === "period_range" || entryMode === "single_day") && val.endTime
        ? val.endTime.trim()
        : undefined;
    const durationHours = computeDurationHoursHelper(
      dateStr,
      endDateStr || dateStr,
      startTimeStr || "",
      endTimeStr || ""
    );
    const periodMonth = dateStr.slice(0, 7);
    const kwh = Math.max(0, Math.round((Number(val.consumedKwh) || 0) * 100) / 100);
    const tariffSelection = val.tariffSelection || "auto_time";

    const baseWeather = this.ctx.getWeatherForDate(dateStr, endDateStr);
    const customTemp = this.logCustomTempAvgC();
    const finalTempAvgC =
      customTemp !== null && !isNaN(Number(customTemp))
        ? Math.round(Number(customTemp) * 10) / 10
        : baseWeather.tempAvgC;
    const finalCondition = this.logCustomWeatherCondition().trim() || baseWeather.condition;
    const finalEmoji =
      finalTempAvgC <= -1 ? "❄️" : finalTempAvgC < 6 ? "☁️" : finalTempAvgC >= 16 ? "☀️" : baseWeather.emoji;

    const editLogId = this.editingDeviceLogId();
    const origDeviceId = this.ctx.editingDeviceLogOriginalDeviceId();

    if (editLogId) {
      let existingEntry: ElectricityDeviceLogEntry | undefined;
      for (const dev of this.accountDevices()) {
        const found = (dev.logs || []).find((l) => l.id === editLogId);
        if (found) {
          existingEntry = found;
          break;
        }
      }

      const updatedLog: ElectricityDeviceLogEntry = {
        id: editLogId,
        date: dateStr,
        endDate: endDateStr,
        startTime: startTimeStr,
        endTime: endTimeStr,
        durationHours: durationHours ?? undefined,
        periodMonth,
        consumedKwh: kwh,
        entryMode,
        tariffSelection,
        tempAvgC: finalTempAvgC,
        tempMinC: baseWeather.tempMinC,
        tempMaxC: baseWeather.tempMaxC,
        weatherCode: baseWeather.weatherCode,
        weatherCondition: finalCondition,
        weatherIcon: finalEmoji,
        comment: val.comment?.trim() || undefined,
        aiExplanation: existingEntry?.aiExplanation,
        fromScreenshot: existingEntry?.fromScreenshot ?? false,
        createdAt: existingEntry?.createdAt || new Date().toISOString(),
      };

      const nextList = this.accountDevices().map((d) => {
        if (origDeviceId && origDeviceId !== val.deviceId) {
          if (d.id === origDeviceId) {
            return {
              ...d,
              logs: (d.logs || []).filter((l) => l.id !== editLogId),
              updatedAt: new Date().toISOString(),
            };
          }
          if (d.id === val.deviceId) {
            return {
              ...d,
              logs: [...(d.logs || []), updatedLog],
              updatedAt: new Date().toISOString(),
            };
          }
          return d;
        }
        if (d.id === val.deviceId) {
          return {
            ...d,
            logs: (d.logs || []).map((l) => (l.id === editLogId ? updatedLog : l)),
            updatedAt: new Date().toISOString(),
          };
        }
        return d;
      });

      this.isSavingDevices.set(true);
      try {
        const ok = await this.dataService.saveUtilityAccountDevices(
          acc.id,
          nextList,
          `Запис споживання та погоду (${finalTempAvgC > 0 ? "+" : ""}${finalTempAvgC}°C) оновлено!`
        );
        if (ok) {
          this.ctx.deviceSelectedMonth.set(periodMonth);
          this.closeDeviceLogModal();
        }
      } finally {
        this.isSavingDevices.set(false);
      }
      return;
    }

    const newLog: ElectricityDeviceLogEntry = {
      id: `dlog_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      date: dateStr,
      endDate: endDateStr,
      startTime: startTimeStr,
      endTime: endTimeStr,
      durationHours: durationHours ?? undefined,
      periodMonth,
      consumedKwh: kwh,
      entryMode,
      tariffSelection,
      tempAvgC: finalTempAvgC,
      tempMinC: baseWeather.tempMinC,
      tempMaxC: baseWeather.tempMaxC,
      weatherCode: baseWeather.weatherCode,
      weatherCondition: finalCondition,
      weatherIcon: finalEmoji,
      comment: val.comment?.trim() || undefined,
      fromScreenshot: false,
      createdAt: new Date().toISOString(),
    };

    const nextList = this.accountDevices().map((d) =>
      d.id === val.deviceId
        ? {
            ...d,
            logs: [...(d.logs || []), newLog],
            updatedAt: new Date().toISOString(),
          }
        : d
    );

    this.isSavingDevices.set(true);
    try {
      const ok = await this.dataService.saveUtilityAccountDevices(
        acc.id,
        nextList,
        `Споживання ${kwh} кВт·год та погоду (${finalTempAvgC > 0 ? "+" : ""}${finalTempAvgC}°C) зафіксовано!`
      );
      if (ok) {
        this.ctx.deviceSelectedMonth.set(periodMonth);
        this.closeDeviceLogModal();
      }
    } finally {
      this.isSavingDevices.set(false);
    }
  }
}
