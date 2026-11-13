import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from "@angular/core";
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import { ElectricityDeviceLogEntry, UtilityReading } from "../../../models/utility.model";
import {
  calculateElectricityCost,
  ControlReadingNoteAnalysis,
  ElectricityCostResult,
  getSeasonForDate,
  parseControlReadingNote,
  resolveElectricityDualRates,
  resolveElectricitySingleRate,
} from "../../../models/utility.model";
import { ELECTRICITY_VIEW_CTX } from "../electricity-view.context";

@Component({
  selector: "app-meter-reading-modal",
  imports: [CommonModule, ReactiveFormsModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
      <div class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4 flex items-end sm:items-center justify-center">
        <div class="w-full max-w-lg bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[calc(100dvh-2rem)] pb-safe sm:pb-0 animate-in fade-in duration-150 sm:my-auto">
          <div class="sm:hidden flex justify-center pt-2.5 pb-1 bg-slate-50 dark:bg-slate-950/80 shrink-0">
            <div class="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700"></div>
          </div>
          <!-- Pinned Header -->
          <div class="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 shrink-0">
            <div class="flex items-center gap-2.5">
              <div
                class="w-9 h-9 rounded-xl text-white flex items-center justify-center shrink-0"
                [class.bg-amber-500]="!readingForm.get('isControlOnly')?.value"
                [class.bg-indigo-600]="readingForm.get('isControlOnly')?.value"
              >
                <mat-icon aria-hidden="true">{{ readingForm.get('isControlOnly')?.value ? 'visibility' : 'speed' }}</mat-icon>
              </div>
              <div>
                <h3 class="text-base font-bold text-slate-900 dark:text-white">
                  @if (editingReadingId()) {
                    {{ readingForm.get('isControlOnly')?.value ? 'Редагувати контрольний замір' : 'Редагувати показник лічильника' }}
                  } @else {
                    {{ readingForm.get('isControlOnly')?.value ? 'Контрольний замір електроенергії' : 'Внесення показів електроенергії' }}
                  }
                </h3>
                <p class="text-2xs text-slate-500 dark:text-slate-400">{{ currentAccount()?.name }} • Особовий № {{ currentAccount()?.accountNumber }}</p>
              </div>
            </div>
            <button
              type="button"
              (click)="closeReadingModal()"
              class="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 flex items-center justify-center cursor-pointer transition-colors"
            >
              <mat-icon aria-hidden="true" class="text-lg">close</mat-icon>
            </button>
          </div>

          <!-- Form with scrollable body and pinned footer -->
          <form [formGroup]="readingForm" (ngSubmit)="saveReading()" class="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div class="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 overscroll-contain">
              <!-- Purpose Switcher: Billing vs Control Only -->
              <div class="space-y-1.5">
                <span class="block text-xs font-semibold text-slate-700 dark:text-slate-300">Призначення показу *</span>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label
                    class="p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all"
                    [class.border-amber-500]="!readingForm.get('isControlOnly')?.value"
                    [class.bg-amber-50/70]="!readingForm.get('isControlOnly')?.value"
                    [class.dark:bg-amber-950/30]="!readingForm.get('isControlOnly')?.value"
                    [class.border-slate-200]="readingForm.get('isControlOnly')?.value"
                    [class.dark:border-slate-700]="readingForm.get('isControlOnly')?.value"
                  >
                    <input
                      type="radio"
                      [value]="false"
                      formControlName="isControlOnly"
                      (change)="recalculateFormCost()"
                      class="mt-0.5 text-amber-500 focus:ring-amber-500"
                    />
                    <div>
                      <div class="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <span>⚡ Розрахунковий</span>
                        <span class="text-3xs text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/80 px-1.5 py-0.2 rounded font-bold">Для оплати</span>
                      </div>
                      <div class="text-3xs text-slate-500 dark:text-slate-400 mt-0.5">Офіційний білінг та нарахування до сплати</div>
                    </div>
                  </label>

                  <label
                    class="p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all"
                    [class.border-indigo-500]="readingForm.get('isControlOnly')?.value"
                    [class.bg-indigo-50/70]="readingForm.get('isControlOnly')?.value"
                    [class.dark:bg-indigo-950/30]="readingForm.get('isControlOnly')?.value"
                    [class.border-slate-200]="!readingForm.get('isControlOnly')?.value"
                    [class.dark:border-slate-700]="!readingForm.get('isControlOnly')?.value"
                  >
                    <input
                      type="radio"
                      [value]="true"
                      formControlName="isControlOnly"
                      (change)="recalculateFormCost()"
                      class="mt-0.5 text-indigo-600 focus:ring-indigo-600"
                    />
                    <div>
                      <div class="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <span>👁️ Контрольний</span>
                        <span class="text-3xs text-indigo-800 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-950/80 px-1.5 py-0.2 rounded font-bold">Без оплати</span>
                      </div>
                      <div class="text-3xs text-slate-500 dark:text-slate-400 mt-0.5">Для аналізу тенденцій та споживання приладів</div>
                    </div>
                  </label>
                </div>
              </div>

              <!-- Informational Banner for Control Readings -->
              @if (readingForm.get('isControlOnly')?.value) {
                <div class="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200 text-xs flex items-start gap-2">
                  <mat-icon aria-hidden="true" class="text-indigo-600 dark:text-indigo-400 shrink-0 text-base">info</mat-icon>
                  <div class="text-2xs leading-relaxed">
                    <strong>Контрольний показник:</strong> використовується виключно для графіків, відстеження тенденцій та аналізу роботи приладів з приміток. <strong>Плата не нараховується (0.00 грн)</strong>, а наступний розрахунковий показник автоматично охопить весь обсяг з моменту останньої оплати.
                  </div>
                </div>
              }

              <!-- Reading Date -->
              <div>
                <label for="read-date" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Дата зняття показів *
                </label>
                <input
                  id="read-date"
                  type="date"
                  formControlName="date"
                  (change)="recalculateFormCost()"
                  class="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <!-- Current Account Tariff Details & Previous Readings -->
              <div
                class="p-3 border rounded-xl space-y-1 text-xs"
                [class.bg-amber-50/70]="!readingForm.get('isControlOnly')?.value"
                [class.dark:bg-amber-950/30]="!readingForm.get('isControlOnly')?.value"
                [class.border-amber-200/80]="!readingForm.get('isControlOnly')?.value"
                [class.dark:border-amber-800/60]="!readingForm.get('isControlOnly')?.value"
                [class.bg-indigo-50/70]="readingForm.get('isControlOnly')?.value"
                [class.dark:bg-indigo-950/30]="readingForm.get('isControlOnly')?.value"
                [class.border-indigo-200/80]="readingForm.get('isControlOnly')?.value"
                [class.dark:border-indigo-800/60]="readingForm.get('isControlOnly')?.value"
              >
                <div class="flex items-center justify-between text-3xs uppercase tracking-wider font-bold">
                  <span [class.text-amber-900]="!readingForm.get('isControlOnly')?.value" [class.dark:text-amber-300]="!readingForm.get('isControlOnly')?.value" [class.text-indigo-900]="readingForm.get('isControlOnly')?.value" [class.dark:text-indigo-300]="readingForm.get('isControlOnly')?.value">
                    {{ readingForm.get('isControlOnly')?.value ? 'Попередні покази для розрахунку темпу:' : 'Попередній розрахунковий показник:' }}
                  </span>
                  @if (!readingForm.get('isControlOnly')?.value) {
                    <span class="text-purple-700 dark:text-purple-300 font-semibold">{{ calculatedSeason() === 'summer' ? 'Літній сезон (01.05 – 30.09)' : 'Зимовий сезон (01.10 – 30.04)' }}</span>
                  }
                </div>
                <div class="text-xs font-mono font-medium" [class.text-amber-950]="!readingForm.get('isControlOnly')?.value" [class.dark:text-amber-100]="!readingForm.get('isControlOnly')?.value" [class.text-indigo-950]="readingForm.get('isControlOnly')?.value" [class.dark:text-indigo-100]="readingForm.get('isControlOnly')?.value">
                  @if (currentAccount()?.electricityTariffType === 'dual') {
                    День (Т2): <span class="font-bold">{{ activePrevT1() }}</span> кВт·г • Ніч (Т1): <span class="font-bold">{{ activePrevT2() }}</span> кВт·г
                  } @else {
                    Попередній: <span class="font-bold">{{ activePrevT1() }}</span> кВт·г
                  }
                </div>
              </div>

              <!-- Current Reading Section Header with Camera Action -->
              <div class="flex items-center justify-between pb-0.5">
                <span class="text-xs font-bold text-slate-800 dark:text-slate-200">Поточні покази лічильника:</span>
                <button
                  type="button"
                  (click)="openCameraModal()"
                  class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-amber-100 dark:bg-amber-950/80 hover:bg-amber-200 dark:hover:bg-amber-900 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700 transition-colors cursor-pointer shadow-2xs"
                  title="Сфотографувати лічильник для автоматичного заповнення"
                >
                  <mat-icon aria-hidden="true" class="text-sm text-amber-600 dark:text-amber-400 leading-none">photo_camera</mat-icon>
                  <span>Зробити фото</span>
                </button>
              </div>

              <!-- Meter Reading Inputs -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label for="read-t1" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {{ currentAccount()?.electricityTariffType === 'dual' ? 'Показник День (Т2) *' : 'Показник лічильника *' }}
                  </label>
                  <input
                    id="read-t1"
                    type="number"
                    inputmode="decimal"
                    step="0.1"
                    min="0"
                    formControlName="readingT1"
                    (input)="recalculateFormCost()"
                    placeholder="Введіть число"
                    class="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-mono font-extrabold text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                @if (currentAccount()?.electricityTariffType === 'dual') {
                  <div>
                    <label for="read-t2" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Показник Ніч (Т1) *
                    </label>
                    <input
                      id="read-t2"
                      type="number"
                      inputmode="decimal"
                      step="0.1"
                      min="0"
                      formControlName="readingT2"
                      (input)="recalculateFormCost()"
                      placeholder="Введіть число"
                      class="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-mono font-extrabold text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                }
              </div>

              <!-- Live Calculation Summary Card -->
              <div class="p-4 rounded-xl bg-slate-900 text-white space-y-2.5 shadow-sm">
                <div class="text-3xs uppercase tracking-wider text-slate-400 font-semibold flex items-center justify-between">
                  <span>{{ readingForm.get('isControlOnly')?.value ? 'Контрольний розрахунок темпу' : 'Автоматичний розрахунок нарахування' }}</span>
                  @if (!readingForm.get('isControlOnly')?.value) {
                    <span class="text-amber-400 font-bold">Тариф: {{ calculatedRatesText() }}</span>
                  } @else {
                    <span class="text-indigo-300 font-bold">Без нарахування оплати</span>
                  }
                </div>

                <div class="flex items-center justify-between pt-1 border-t border-slate-800">
                  <span class="text-xs text-slate-300">Споживання за період:</span>
                  <span class="text-xs font-mono font-bold text-amber-300">
                    {{ formConsumedKwhText() }}
                  </span>
                </div>

                <div class="flex items-center justify-between pt-1 border-t border-slate-800">
                  <span class="text-sm font-bold text-white">До сплати:</span>
                  @if (readingForm.get('isControlOnly')?.value) {
                    <span class="text-base font-mono font-bold text-indigo-300">
                      0.00 грн (тільки аналіз)
                    </span>
                  } @else {
                    <span class="text-lg font-mono font-extrabold text-emerald-400">
                      {{ formTotalCost().toFixed(2) }} грн
                    </span>
                  }
                </div>
              </div>

              <!-- Winter Consumption Limit Exceeded Breakdown Card -->
              @if (!readingForm.get('isControlOnly')?.value && formCalculationResult(); as calc) {
                @if (calc.isWinterExceeded) {
                  <div class="p-3.5 rounded-xl bg-indigo-950/90 border border-indigo-500/40 text-indigo-100 space-y-2.5 text-xs shadow-sm animate-in fade-in duration-200">
                    <div class="flex items-center justify-between pb-2 border-b border-indigo-800/60">
                      <div class="flex items-center gap-1.5 font-bold text-amber-300">
                        <mat-icon aria-hidden="true" class="text-base text-amber-400">warning_amber</mat-icon>
                        <span>Перевищення зимового ліміту {{ calc.winterLimitKwh }} кВт·г</span>
                      </div>
                      <span class="px-2 py-0.5 rounded text-3xs font-mono font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30">
                        +{{ calc.excessKwh?.toFixed(1) }} кВт·г понад норму
                      </span>
                    </div>

                    <div class="text-3xs text-indigo-200">
                      Розподіл день/ніч пропорційно споживанню: <span class="font-bold text-white">День (Т2) {{ calc.ratioDay }}%</span>, <span class="font-bold text-white">Ніч (Т1) {{ calc.ratioNight }}%</span>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-2xs">
                      <!-- Winter portion -->
                      <div class="p-2.5 rounded-lg bg-indigo-900/60 border border-indigo-700/50 space-y-1">
                        <div class="font-bold text-indigo-300 flex items-center justify-between">
                          <span>❄️ До {{ calc.winterLimitKwh }} кВт·г (зимовий):</span>
                          <span class="font-mono text-white">{{ calc.winterTotalCost?.toFixed(2) }} грн</span>
                        </div>
                        <div class="text-slate-300 font-mono text-3xs">
                          День: {{ calc.winterDayKwh?.toFixed(1) }} кВт·г × {{ currentDualRates().winterDay }} грн
                        </div>
                        <div class="text-slate-300 font-mono text-3xs">
                          Ніч: {{ calc.winterNightKwh?.toFixed(1) }} кВт·г × {{ currentDualRates().winterNight }} грн
                        </div>
                      </div>

                      <!-- Summer portion (excess) -->
                      <div class="p-2.5 rounded-lg bg-amber-950/60 border border-amber-700/50 space-y-1">
                        <div class="font-bold text-amber-300 flex items-center justify-between">
                          <span>☀️ Понад {{ calc.winterLimitKwh }} кВт·г (літній):</span>
                          <span class="font-mono text-white">{{ calc.summerTotalCost?.toFixed(2) }} грн</span>
                        </div>
                        <div class="text-amber-200/90 font-mono text-3xs">
                          День: {{ calc.summerDayKwh?.toFixed(1) }} кВт·г × {{ currentDualRates().summerDay }} грн
                        </div>
                        <div class="text-amber-200/90 font-mono text-3xs">
                          Ніч: {{ calc.summerNightKwh?.toFixed(1) }} кВт·г × {{ currentDualRates().summerNight }} грн
                        </div>
                      </div>
                    </div>
                  </div>
                }
              }

              <!-- Payment status checkbox (Only for billing readings) -->
              @if (!readingForm.get('isControlOnly')?.value) {
                <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                  <div>
                    <label for="read-ispaid" class="text-xs font-bold text-slate-900 block cursor-pointer">
                      Позначити одразу як сплачено
                    </label>
                    <span class="text-3xs text-slate-500">Встановлює статус сплати для даного рахунку</span>
                  </div>
                  <input
                    id="read-ispaid"
                    type="checkbox"
                    formControlName="isPaid"
                    class="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 cursor-pointer"
                  />
                </div>
              }

              <!-- Note -->
              <div>
                <div class="flex items-center justify-between mb-1">
                  <label for="read-note" class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Примітка (необов'язково)
                  </label>
                  @if (readingForm.get('isControlOnly')?.value) {
                    <span class="text-3xs text-indigo-600 dark:text-indigo-400 font-bold flex items-center gap-0.5">
                      <mat-icon aria-hidden="true" class="text-3xs leading-none">auto_awesome</mat-icon>
                      <span>Розумний аналіз приміток</span>
                    </span>
                  }
                </div>
                <input
                  id="read-note"
                  type="text"
                  formControlName="note"
                  (input)="recalculateFormCost()"
                  [placeholder]="readingForm.get('isControlOnly')?.value ? 'Наприклад: Вчора увімкнули опалення з 17-ї до сьогодні 8-ї години' : 'Наприклад: Контрольна перевірка, або Оплачено через Приват24'"
                  class="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                />
                @if (readingForm.get('isControlOnly')?.value && !controlReadingNoteAnalysis()) {
                  <p class="text-3xs text-slate-500 dark:text-slate-400 mt-1">
                    💡 Підказка: якщо прилад (обігрів, котел, бойлер) не має окремої смарт-розетки, вкажіть час роботи у примітці (наприклад: «Вчора увімкнули опалення з 17-ї до сьогодні 8-ї години»). Система автоматично розрахує спожиті кВт·год за номіналом приладу зі списку.
                  </p>
                }
              </div>

              <!-- Live Smart Note Analysis Card for Control Readings -->
              @if (readingForm.get('isControlOnly')?.value && controlReadingNoteAnalysis(); as analysis) {
                <div class="p-3.5 rounded-xl bg-indigo-950/90 border border-indigo-500/50 text-indigo-100 space-y-2.5 text-xs shadow-md animate-in fade-in duration-150">
                  <div class="flex items-center justify-between pb-2 border-b border-indigo-800/70">
                    <div class="flex items-center gap-1.5 font-bold text-amber-300">
                      <mat-icon aria-hidden="true" class="text-base text-amber-400">psychology</mat-icon>
                      <span>Розумний аналіз примітки контрольного заміру</span>
                    </div>
                    <span class="px-2 py-0.5 rounded text-3xs font-mono font-bold bg-emerald-400/20 text-emerald-300 border border-emerald-400/40">
                      ~{{ analysis.estimatedKwh.toFixed(1) }} кВт·год розпізнано
                    </span>
                  </div>

                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-2xs">
                    <div class="p-2 rounded-lg bg-indigo-900/60 border border-indigo-800/60 space-y-0.5">
                      <span class="text-3xs text-indigo-300 block font-semibold">Розпізнаний прилад / дія:</span>
                      <span class="font-bold text-white block truncate" [title]="analysis.matchedDeviceName || analysis.detectedAction">
                        {{ analysis.matchedDeviceName || analysis.detectedAction }}
                      </span>
                      <span class="text-3xs text-indigo-300">
                        {{ analysis.deviceMatchedFromList ? '✓ Знайдено у списку приладів будинку' : 'Категорія приладу' }}
                      </span>
                    </div>

                    <div class="p-2 rounded-lg bg-indigo-900/60 border border-indigo-800/60 space-y-0.5">
                      <span class="text-3xs text-indigo-300 block font-semibold">Період та тривалість:</span>
                      <span class="font-bold text-amber-300 block">
                        {{ analysis.timeIntervalText }}
                      </span>
                      <span class="text-3xs text-indigo-300">
                        Потужність: {{ analysis.powerWatts }} Вт
                      </span>
                    </div>
                  </div>

                  @if (formActiveReadingDelta() > 0) {
                    <div class="p-2 rounded-lg bg-indigo-900/40 border border-indigo-800/40 text-3xs space-y-1">
                      <div class="flex items-center justify-between text-indigo-200">
                        <span>Зафіксований замір: <strong class="text-white">{{ formActiveReadingDelta() }} кВт·г</strong></span>
                        <span>Пояснено приміткою: <strong class="text-amber-300">{{ analysis.coveragePercent }}%</strong></span>
                      </div>
                      <div class="w-full h-1.5 rounded-full bg-indigo-950 overflow-hidden flex">
                        <div class="h-full bg-emerald-400 transition-all duration-300" [style.width.%]="analysis.coveragePercent"></div>
                        <div class="h-full bg-indigo-600/60 transition-all duration-300" [style.width.%]="100 - analysis.coveragePercent"></div>
                      </div>
                      <div class="flex items-center justify-between text-indigo-300">
                        <span>Прилад: ~{{ analysis.estimatedKwh.toFixed(1) }} кВт·г</span>
                        <span>Залишковий фон будинку: ~{{ analysis.residualKwh.toFixed(1) }} кВт·г</span>
                      </div>
                    </div>
                  }

                  <p class="text-2xs text-indigo-200 leading-relaxed">
                    {{ analysis.explanation }}
                  </p>

                  @if (analysis.matchedDeviceId && canEdit()) {
                    <div class="pt-1.5 border-t border-indigo-800/60 flex items-center justify-between gap-2 flex-wrap">
                      <span class="text-3xs text-indigo-300">Хочете продублювати запис окремо в історію приладу?</span>
                      <button
                        type="button"
                        (click)="addDeviceLogFromControlNote(analysis)"
                        class="px-2.5 py-1 rounded-lg text-3xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white transition-colors cursor-pointer flex items-center gap-1 shadow-2xs shrink-0"
                        title="Створити окремий запис споживання в історії приладу"
                      >
                        <mat-icon aria-hidden="true" class="text-xs leading-none">add_circle</mat-icon>
                        <span>Внести у «{{ analysis.matchedDeviceName }}»</span>
                      </button>
                    </div>
                  }
                </div>
              }
            </div>

            <!-- Pinned Footer -->
            <div class="flex items-center justify-end gap-2.5 p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/90 shrink-0">
              <button
                type="button"
                (click)="closeReadingModal()"
                class="px-4 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
              >
                Скасувати
              </button>
              <button
                type="submit"
                [disabled]="readingForm.invalid || isSubmitting()"
                class="px-4 py-2 rounded-xl text-xs font-semibold text-white transition-colors cursor-pointer disabled:opacity-50"
                [class.bg-amber-500]="!readingForm.get('isControlOnly')?.value"
                [class.hover:bg-amber-600]="!readingForm.get('isControlOnly')?.value"
                [class.bg-indigo-600]="readingForm.get('isControlOnly')?.value"
                [class.hover:bg-indigo-700]="readingForm.get('isControlOnly')?.value"
              >
                @if (editingReadingId()) {
                  Зберегти зміни
                } @else if (readingForm.get('isControlOnly')?.value) {
                  Зберегти контрольний замір
                } @else {
                  Зафіксувати покази
                }
              </button>
            </div>
          </form>
        </div>
      </div>
  `,
})
export class MeterReadingModalComponent {
  readonly ctx = inject(ELECTRICITY_VIEW_CTX);
  readonly dataService = this.ctx.dataService;
  readonly canEdit = this.ctx.canEdit;
  readonly currentAccount = this.ctx.currentAccount;
  readonly currentDualRates = this.ctx.currentDualRates;
  readonly editingReadingId = this.ctx.editingReadingId;

  readonly isSubmitting = signal<boolean>(false);
  readonly formChangeTrigger = signal<number>(0);
  readonly formTotalCost = signal<number>(0);
  readonly calculatedSeason = signal<"summer" | "winter">("summer");
  readonly formCalculationResult = signal<ElectricityCostResult | null>(null);

  readonly readingForm = new FormGroup({
    date: new FormControl(this.getPreviousDayIsoDate(), [Validators.required]),
    readingT1: new FormControl<number | null>(null, [Validators.required, Validators.min(0)]),
    readingT2: new FormControl<number | null>(null),
    isControlOnly: new FormControl<boolean>(false),
    isPaid: new FormControl<boolean>(false),
    note: new FormControl(""),
  });

  readonly activePrevT1 = computed<number>(() => {
    this.formChangeTrigger();
    const isControl = Boolean(this.readingForm.get("isControlOnly")?.value);
    const date = this.readingForm.get("date")?.value || new Date().toISOString().split("T")[0];
    const editId = this.editingReadingId();
    return this.ctx.getEffectivePrevReading(isControl, date, editId).t1;
  });

  readonly activePrevT2 = computed<number>(() => {
    this.formChangeTrigger();
    const isControl = Boolean(this.readingForm.get("isControlOnly")?.value);
    const date = this.readingForm.get("date")?.value || new Date().toISOString().split("T")[0];
    const editId = this.editingReadingId();
    return this.ctx.getEffectivePrevReading(isControl, date, editId).t2;
  });

  readonly formActiveReadingDelta = computed<number>(() => {
    this.formChangeTrigger();
    const acc = this.currentAccount();
    const t1Val = Number(this.readingForm.get("readingT1")?.value) || 0;
    const prev1 = this.activePrevT1();
    const diff1 = Math.max(0, t1Val - prev1);

    if (acc?.electricityTariffType === "dual") {
      const t2Val = Number(this.readingForm.get("readingT2")?.value) || 0;
      const prev2 = this.activePrevT2();
      const diff2 = Math.max(0, t2Val - prev2);
      return Math.round((diff1 + diff2) * 10) / 10;
    }
    return Math.round(diff1 * 10) / 10;
  });

  readonly controlReadingNoteAnalysis = computed<ControlReadingNoteAnalysis | null>(() => {
    this.formChangeTrigger();
    const isControl = Boolean(this.readingForm.get("isControlOnly")?.value);
    if (!isControl) return null;
    const note = this.readingForm.get("note")?.value;
    if (!note || !note.trim()) return null;
    const delta = this.formActiveReadingDelta();
    const devices = this.ctx.accountDevices();
    return parseControlReadingNote(note, delta, devices);
  });

  constructor() {
    effect(() => {
      const r = this.ctx.editingReadingObj();
      const isControl = this.ctx.readingModalInitialControl();
      if (r) {
        this.readingForm.reset({
          date: r.date,
          readingT1: r.readingT1,
          readingT2: r.readingT2 ?? null,
          isControlOnly: Boolean(r.isControlOnly),
          isPaid: Boolean(r.isPaid),
          note: r.note || "",
        });
      } else {
        this.readingForm.reset({
          date: this.getPreviousDayIsoDate(),
          readingT1: null,
          readingT2: null,
          isControlOnly: isControl,
          isPaid: false,
          note: isControl ? "Контрольний замір для моніторингу" : "",
        });
      }
      this.formChangeTrigger.update((v) => v + 1);
      this.recalculateFormCost();
    });

    effect(() => {
      const applied = this.ctx.appliedCameraReading();
      if (applied) {
        this.readingForm.patchValue({
          date: this.readingForm.get("date")?.value || this.getPreviousDayIsoDate(),
          readingT1: applied.readingT1 !== undefined ? applied.readingT1 : null,
          readingT2: applied.readingT2 !== undefined ? applied.readingT2 : null,
          isControlOnly: Boolean(this.readingForm.get("isControlOnly")?.value),
          isPaid: false,
          note: applied.note || "Розпізнано за фото лічильника",
        });
        this.recalculateFormCost();
      }
    });
  }

  getPreviousDayIsoDate(): string {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  calculatedRatesText(): string {
    const acc = this.currentAccount();
    const tariffs = this.ctx.utilityTariffs();
    const date = this.readingForm.get("date")?.value || new Date().toISOString().split("T")[0];

    if (acc?.electricityTariffType === "dual") {
      const dual = resolveElectricityDualRates(date, tariffs);
      const seasonText = dual.season === "summer" ? "Літо" : `Зима (ліміт ${dual.winterLimitKwh} кВт·г)`;
      return `Д: ${dual.dayRate} грн, Н: ${dual.nightRate} грн (${seasonText})`;
    } else {
      const single = resolveElectricitySingleRate(date, tariffs);
      return `${single} грн/кВт·г`;
    }
  }

  formConsumedKwhText(): string {
    const acc = this.currentAccount();
    const t1Val = Number(this.readingForm.get("readingT1")?.value) || 0;
    const prev1 = this.activePrevT1();
    const diff1 = Math.max(0, t1Val - prev1);

    if (acc?.electricityTariffType === "dual") {
      const t2Val = Number(this.readingForm.get("readingT2")?.value) || 0;
      const prev2 = this.activePrevT2();
      const diff2 = Math.max(0, t2Val - prev2);
      return `День (Т2): ${diff1.toFixed(1)} кВт·г • Ніч (Т1): ${diff2.toFixed(1)} кВт·г (Всього: ${(diff1 + diff2).toFixed(1)})`;
    }

    return `${diff1.toFixed(1)} кВт·г`;
  }

  recalculateFormCost(): void {
    const acc = this.currentAccount();
    if (!acc) return;
    const tariffs = this.ctx.utilityTariffs();
    const date = this.readingForm.get("date")?.value || new Date().toISOString().split("T")[0];
    const season = getSeasonForDate(date);
    this.calculatedSeason.set(season);

    this.formChangeTrigger.update((v) => v + 1);

    const isControl = Boolean(this.readingForm.get("isControlOnly")?.value);
    const t1Val = Number(this.readingForm.get("readingT1")?.value) || 0;
    const prev1 = this.activePrevT1();
    const diff1 = Math.max(0, t1Val - prev1);

    let diff2: number | undefined;
    if (acc.electricityTariffType === "dual") {
      const t2Val = Number(this.readingForm.get("readingT2")?.value) || 0;
      const prev2 = this.activePrevT2();
      diff2 = Math.max(0, t2Val - prev2);
    }

    if (isControl) {
      this.formCalculationResult.set(null);
      this.formTotalCost.set(0);
      return;
    }

    const calc = calculateElectricityCost(date, diff1, diff2, acc.electricityTariffType, tariffs);
    this.formCalculationResult.set(calc);
    this.formTotalCost.set(calc.totalCost);
  }

  async addDeviceLogFromControlNote(analysis: ControlReadingNoteAnalysis, readingDate?: string): Promise<void> {
    const acc = this.currentAccount();
    if (!acc || !analysis.matchedDeviceId) return;
    const targetDate = readingDate || this.readingForm.get("date")?.value || new Date().toISOString().split("T")[0];
    const targetDevId = analysis.matchedDeviceId;
    const targetDev = this.ctx.accountDevices().find((d) => d.id === targetDevId);
    if (!targetDev) return;

    let startTime: string | undefined;
    let endTime: string | undefined;
    const timeMatch = analysis.timeIntervalText.match(/з\s+(\d{2}:\d{2})\s+до\s+(\d{2}:\d{2})/);
    if (timeMatch) {
      startTime = timeMatch[1];
      endTime = timeMatch[2];
    }

    const weather = this.ctx.getWeatherForDate(targetDate);

    const newLog: ElectricityDeviceLogEntry = {
      id: "log_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
      date: targetDate,
      periodMonth: targetDate.slice(0, 7),
      consumedKwh: analysis.estimatedKwh,
      entryMode: "delta",
      durationHours: analysis.durationHours,
      startTime,
      endTime,
      tariffSelection: "auto_time",
      tempAvgC: weather.tempAvgC,
      tempMinC: weather.tempMinC,
      tempMaxC: weather.tempMaxC,
      weatherCode: weather.weatherCode,
      weatherCondition: weather.condition,
      weatherIcon: weather.icon,
      comment: `З контрольного заміру: ${analysis.rawNote}`,
      createdAt: new Date().toISOString(),
    };

    const nextList = this.ctx.accountDevices().map((d) => {
      if (d.id !== targetDevId) return d;
      const existingLogs = Array.isArray(d.logs) ? d.logs : [];
      return {
        ...d,
        logs: [newLog, ...existingLogs],
        updatedAt: new Date().toISOString(),
      };
    });

    this.ctx.isSavingDevices.set(true);
    try {
      await this.dataService.saveUtilityAccountDevices(
        acc.id,
        nextList,
        `Запис ${analysis.estimatedKwh} кВт·г додано до приладу «${targetDev.name}»`
      );
    } finally {
      this.ctx.isSavingDevices.set(false);
    }
  }

  openCameraModal(): void {
    this.ctx.openCameraModal();
  }

  closeReadingModal(): void {
    this.ctx.closeReadingModal();
  }

  async saveReading(): Promise<void> {
    const acc = this.currentAccount();
    if (!acc || this.readingForm.invalid) return;

    this.isSubmitting.set(true);
    try {
      const editId = this.editingReadingId();
      const formVal = this.readingForm.getRawValue();
      const date = formVal.date || new Date().toISOString().split("T")[0];
      const isControlOnly = Boolean(formVal.isControlOnly);
      const tariffs = this.ctx.utilityTariffs();

      const prev = this.ctx.getEffectivePrevReading(isControlOnly, date, editId);
      const t1Val = Number(formVal.readingT1) || 0;
      const diff1 = Math.max(0, t1Val - prev.t1);

      let t2Val: number | undefined;
      let diff2: number | undefined;
      if (acc.electricityTariffType === "dual") {
        t2Val = Number(formVal.readingT2) || 0;
        diff2 = Math.max(0, t2Val - prev.t2);
      }

      let daysSinceLast = 0;
      let dailyAvg = 0;
      if (prev.prevDate) {
        const curMs = new Date(date).getTime();
        const prevMs = new Date(prev.prevDate).getTime();
        daysSinceLast = Math.max(1, Math.round((curMs - prevMs) / (1000 * 60 * 60 * 24)));
        const totalDiff = acc.electricityTariffType === "dual" ? diff1 + (diff2 || 0) : diff1;
        dailyAvg = Math.round((totalDiff / daysSinceLast) * 10) / 10;
      }

      let totalCost = 0;
      let rate1: number | undefined;
      let rate2: number | undefined;
      let season = getSeasonForDate(date);
      let readingNote = formVal.note?.trim() || "";

      if (isControlOnly) {
        totalCost = 0;
        readingNote = readingNote || "Контрольний замір для моніторингу";
      } else {
        const calc = calculateElectricityCost(date, diff1, diff2, acc.electricityTariffType, tariffs);
        totalCost = calc.totalCost;
        rate1 = calc.rate1;
        rate2 = calc.rate2;
        season = calc.season;
      }

      const reading: Partial<UtilityReading> = {
        ...(editId ? { id: editId } : {}),
        accountId: acc.id,
        utilityType: "electricity",
        date,
        periodMonth: date.substring(0, 7),
        readingT1: t1Val,
        readingT2: t2Val,
        consumptionT1: diff1,
        consumptionT2: diff2,
        rateT1: rate1,
        rateT2: rate2,
        totalCost,
        season,
        isPaid: isControlOnly ? true : Boolean(formVal.isPaid),
        paidDate: isControlOnly ? undefined : formVal.isPaid ? date : undefined,
        paidAmount: isControlOnly ? 0 : formVal.isPaid ? totalCost : undefined,
        note: readingNote,
        isControlOnly,
        readingPurpose: isControlOnly ? "control" : "billing",
        daysSinceLastReading: daysSinceLast,
        dailyAvgConsumption: dailyAvg,
      };

      await this.dataService.saveUtilityReading(reading);
      this.ctx.isHistoryTableExpanded.set(true);
      if (isControlOnly && this.ctx.filterPurpose() === "billing") {
        this.ctx.filterPurpose.set("all");
      } else if (!isControlOnly && this.ctx.filterPurpose() === "control") {
        this.ctx.filterPurpose.set("all");
      }
      this.closeReadingModal();
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
