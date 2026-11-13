import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import {
  DailyWeatherPoint,
  DeviceConsumptionEntryMode,
  ElectricityDevice,
  ElectricityDeviceLogEntry,
  ElectricityScreenshotAnalysisResult,
} from "../../../models/utility.model";
import { formatDateUa } from "../../../models/client.model";
import { computeDurationHoursHelper, DEVICE_COLORS } from "../electricity-device-analytics.util";
import { FormatDateUaPipe } from "../electricity-pipes";
import { ELECTRICITY_VIEW_CTX } from "../electricity-view.context";

@Component({
  selector: "app-device-screenshot-ai-modal",
  imports: [CommonModule, MatIconModule, FormatDateUaPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
      <div
        class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/65 backdrop-blur-xs p-0 sm:p-4 flex items-end sm:items-center justify-center"
        (paste)="onScreenshotPaste($event)"
      >
        <div class="w-full max-w-xl bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[94dvh] pb-safe sm:pb-0 animate-in fade-in duration-150 sm:my-auto">
          <div class="sm:hidden flex justify-center pt-2.5 pb-1 bg-emerald-50/40 shrink-0">
            <div class="w-10 h-1 rounded-full bg-emerald-300/70"></div>
          </div>
          <!-- Header -->
          <div class="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-white shrink-0">
            <div class="flex items-center gap-2.5">
              <div class="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                <mat-icon aria-hidden="true">add_photo_alternate</mat-icon>
              </div>
              <div>
                <h3 class="text-base font-bold text-slate-900">
                  Аналіз скріншоту споживання електроенергії (ШІ)
                </h3>
                <p class="text-3xs text-slate-500">
                  Завантажте скріншот, додайте коментар-пояснення та виберіть пристрій для зарахування кВт·год
                </p>
              </div>
            </div>
            <button
              type="button"
              (click)="closeScreenshotModal()"
              class="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center cursor-pointer"
            >
              <mat-icon aria-hidden="true" class="text-lg">close</mat-icon>
            </button>
          </div>

          <div class="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
            <!-- Step 1: Select Device (or create new inline) & Date -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div class="sm:col-span-2">
                <label for="scr-device-select" class="block text-xs font-semibold text-slate-700 mb-1">
                  Пристрій, до якого додати споживання *
                </label>
                <select
                  id="scr-device-select"
                  [value]="screenshotTargetDeviceId()"
                  (change)="onScreenshotDeviceSelect($any($event.target).value)"
                  class="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-500"
                >
                  @for (dev of accountDevices(); track dev.id) {
                    <option [value]="dev.id">{{ dev.name }} {{ dev.powerWatts ? '(' + dev.powerWatts + ' Вт)' : '' }}</option>
                  }
                  <option value="__new__">+ Створити новий пристрій прямо зараз...</option>
                </select>
              </div>

              <div>
                <label for="scr-date" class="block text-xs font-semibold text-slate-700 mb-1">
                  Станом на дату *
                </label>
                <input
                  id="scr-date"
                  type="date"
                  [value]="screenshotDate()"
                  (change)="screenshotDate.set($any($event.target).value)"
                  class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <!-- Weather on Screenshot Date -->
            @if (currentScreenshotWeather(); as scrW) {
              <div class="p-2.5 rounded-xl bg-sky-50 dark:bg-slate-800 border border-sky-200 dark:border-slate-700 flex items-center justify-between gap-2 text-2xs">
                <div class="flex items-center gap-2">
                  <mat-icon aria-hidden="true" class="text-base text-sky-600 dark:text-sky-400 leading-none">{{ scrW.icon }}</mat-icon>
                  <span class="text-slate-800 dark:text-slate-200">
                    Погода на <b>{{ scrW.date | formatDateUa }}</b>:
                    <b class="font-mono text-sky-800 dark:text-sky-300">{{ scrW.tempAvgC > 0 ? '+' : '' }}{{ scrW.tempAvgC }}°C</b>
                    ({{ scrW.tempMinC > 0 ? '+' : '' }}{{ scrW.tempMinC }}°..{{ scrW.tempMaxC > 0 ? '+' : '' }}{{ scrW.tempMaxC }}°C, {{ scrW.condition }}) — додасться до показу
                  </span>
                </div>
              </div>
            }

            <!-- Inline New Device Name if __new__ is selected -->
            @if (screenshotTargetDeviceId() === '__new__') {
              <div class="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-2.5">
                <div class="text-2xs font-bold text-emerald-900 flex items-center gap-1.5">
                  <mat-icon aria-hidden="true" class="text-sm text-emerald-600 leading-none">add_circle</mat-icon>
                  <span>Новий пристрій буде створено автоматично при збереженні:</span>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div class="sm:col-span-2">
                    <input
                      type="text"
                      [value]="screenshotNewDeviceName()"
                      (input)="screenshotNewDeviceName.set($any($event.target).value)"
                      placeholder="Назва пристрою (напр. Бойлер, Кондиціонер, Пральна машина)"
                      class="w-full px-3 py-2 bg-white border border-emerald-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                  <div>
                    <input
                      type="number"
                      inputmode="numeric"
                      min="0"
                      [value]="screenshotNewDeviceWatts() || ''"
                      (input)="screenshotNewDeviceWatts.set(+$any($event.target).value || null)"
                      placeholder="Потужність (Вт)"
                      class="w-full px-3 py-2 bg-white border border-emerald-300 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>
              </div>
            }

            <!-- Step 2: Upload / Paste Screenshot Image -->
            <div>
              <span class="block text-xs font-semibold text-slate-700 mb-1">
                Скріншот або фото (можна вибрати файл або вставити через Ctrl+V) *
              </span>
              @if (!screenshotBase64()) {
                <label
                  class="flex flex-col items-center justify-center p-6 border-2 border-dashed border-emerald-300 hover:border-emerald-500 rounded-2xl bg-emerald-50/30 hover:bg-emerald-50/60 transition-colors cursor-pointer text-center"
                >
                  <mat-icon aria-hidden="true" class="text-3xl text-emerald-600 mb-1.5">cloud_upload</mat-icon>
                  <span class="text-xs font-bold text-slate-800">
                    Натисніть, щоб обрати скріншот, або вставте з буфера (Ctrl+V)
                  </span>
                  <span class="text-3xs text-slate-500 mt-0.5">
                    Підтримуються скріншоти з Tuya, Smart Life, Tapo, Sonoff, EcoFlow, Xiaomi та фото ватметрів
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    (change)="onScreenshotFileSelected($event)"
                    class="hidden"
                  />
                </label>
              } @else {
                <div class="relative rounded-2xl border border-slate-200 bg-slate-900/5 p-2 flex items-center justify-center max-h-56 overflow-hidden">
                  <img
                    [src]="screenshotBase64()"
                    alt="Скріншот споживання"
                    class="max-h-52 w-auto object-contain rounded-xl"
                  />
                  <button
                    type="button"
                    (click)="clearScreenshotImage()"
                    class="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-slate-900/80 hover:bg-rose-600 text-white text-2xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <mat-icon aria-hidden="true" class="text-xs leading-none">delete</mat-icon>
                    <span>Змінити фото</span>
                  </button>
                </div>
              }
            </div>

            <!-- Step 3: User Comment / Explanation of what is shown -->
            <div>
              <label for="scr-comment" class="block text-xs font-semibold text-slate-700 mb-1">
                Коментар до цього фото (пояснення, що відображено) *
              </label>
              <textarea
                id="scr-comment"
                rows="2"
                [value]="screenshotComment()"
                (input)="screenshotComment.set($any($event.target).value)"
                placeholder="Наприклад: Це скріншот з розумної розетки бойлера за поточний місяць, візьми число за жовтень (або: тут у Вт·год, переведи у кВт·год)"
                class="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
              ></textarea>
            </div>

            <!-- Analyze Button -->
            <div class="flex items-center justify-between gap-3">
              <button
                type="button"
                (click)="analyzeUploadedScreenshot()"
                [disabled]="!screenshotBase64() || isAnalyzingScreenshot()"
                class="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-sm transition-all"
              >
                @if (isAnalyzingScreenshot()) {
                  <span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>ШІ аналізує скріншот та ваш коментар...</span>
                } @else {
                  <mat-icon aria-hidden="true" class="text-base leading-none">auto_awesome</mat-icon>
                  <span>Проаналізувати скріншот за коментарем</span>
                }
              </button>
            </div>

            @if (screenshotError()) {
              <div class="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                <mat-icon aria-hidden="true" class="text-rose-600 text-base shrink-0">error_outline</mat-icon>
                <span>{{ screenshotError() }}</span>
              </div>
            }

            <!-- Step 4: AI Analysis Result & Adjustable kWh before saving -->
            @if (screenshotAnalysisResult(); as aiRes) {
              <div class="p-4 rounded-2xl bg-teal-50/70 border border-teal-300 space-y-3 animate-in fade-in duration-150">
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-1.5 text-xs font-bold text-teal-950">
                    <mat-icon aria-hidden="true" class="text-teal-600 text-base leading-none">check_circle</mat-icon>
                    <span>Результат AI-аналізу скріншоту та коментаря</span>
                  </div>
                  <span class="px-2 py-0.5 rounded-full text-3xs font-bold uppercase bg-teal-200/80 text-teal-900">
                    Розпізнано успішно
                  </span>
                </div>

                <p class="text-xs text-teal-900 bg-white/90 p-3 rounded-xl border border-teal-200 leading-relaxed">
                  {{ aiRes.explanation }}
                </p>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label for="scr-parsed-kwh" class="block text-2xs font-bold text-teal-900 mb-1">
                      Кількість спожитої електроенергії (кВт·год)
                    </label>
                    <input
                      id="scr-parsed-kwh"
                      type="number"
                      inputmode="decimal"
                      step="0.01"
                      min="0"
                      [value]="screenshotExtractedKwh()"
                      (input)="screenshotExtractedKwh.set(+$any($event.target).value || 0)"
                      class="w-full px-3.5 py-2 bg-white border border-teal-400 rounded-xl text-base font-mono font-black text-slate-900 focus:outline-none focus:border-teal-600"
                    />
                  </div>
                  <div>
                    <label for="scr-parsed-mode" class="block text-2xs font-bold text-teal-900 mb-1">
                      Період / режим зарахування
                    </label>
                    <select
                      id="scr-parsed-mode"
                      [value]="screenshotExtractedMode()"
                      (change)="screenshotExtractedMode.set($any($event.target).value)"
                      class="w-full px-3 py-2.5 bg-white border border-teal-400 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-teal-600"
                    >
                      <option value="single_day">За конкретну добу (+ до місяця)</option>
                      <option value="period_range">За відрізок часу / період (+ до місяця)</option>
                      <option value="cumulative_month">Станом на дату (з початку місяця)</option>
                      <option value="delta">+ Додати до вже внесеного (дельта)</option>
                    </select>
                  </div>
                </div>

                @if (screenshotExtractedMode() === 'single_day' || screenshotExtractedMode() === 'period_range') {
                  <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                    @if (screenshotExtractedMode() === 'period_range') {
                      <div>
                        <label for="scr-end-date" class="block text-3xs font-bold text-teal-900 mb-1">
                          Дата завершення
                        </label>
                        <input
                          id="scr-end-date"
                          type="date"
                          [value]="screenshotEndDate()"
                          (change)="screenshotEndDate.set($any($event.target).value)"
                          class="w-full px-2.5 py-1.5 bg-white border border-teal-300 rounded-lg text-xs text-slate-900"
                        />
                      </div>
                    }
                    <div>
                      <label for="scr-start-time" class="block text-3xs font-bold text-teal-900 mb-1">
                        Час початку (ГГ:ХХ)
                      </label>
                      <input
                        id="scr-start-time"
                        type="time"
                        [value]="screenshotStartTime()"
                        (change)="screenshotStartTime.set($any($event.target).value)"
                        class="w-full px-2.5 py-1.5 bg-white border border-teal-300 rounded-lg text-xs font-mono text-slate-900"
                      />
                    </div>
                    <div>
                      <label for="scr-end-time" class="block text-3xs font-bold text-teal-900 mb-1">
                        Час завершення (ГГ:ХХ)
                      </label>
                      <input
                        id="scr-end-time"
                        type="time"
                        [value]="screenshotEndTime()"
                        (change)="screenshotEndTime.set($any($event.target).value)"
                        class="w-full px-2.5 py-1.5 bg-white border border-teal-300 rounded-lg text-xs font-mono text-slate-900"
                      />
                    </div>
                  </div>
                }
              </div>
            }
          </div>

          <!-- Footer -->
          <div class="flex items-center justify-end gap-2.5 p-4 border-t border-slate-200 bg-slate-50 shrink-0">
            <button
              type="button"
              (click)="closeScreenshotModal()"
              class="px-4 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Скасувати
            </button>
            <button
              type="button"
              (click)="applyScreenshotToDevice()"
              [disabled]="screenshotExtractedKwh() === null || screenshotExtractedKwh()! < 0 || isSavingDevices()"
              class="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-2xs"
            >
              <mat-icon aria-hidden="true" class="text-sm leading-none">add_task</mat-icon>
              <span>Додати {{ screenshotExtractedKwh() ?? 0 }} кВт·год до пристрою</span>
            </button>
          </div>
        </div>
      </div>
  `,
})
export class DeviceScreenshotAiModalComponent {
  readonly ctx = inject(ELECTRICITY_VIEW_CTX);
  readonly dataService = this.ctx.dataService;
  readonly isSavingDevices = this.ctx.isSavingDevices;
  readonly accountDevices = this.ctx.accountDevices;
  readonly deviceColors = DEVICE_COLORS;

  readonly screenshotTargetDeviceId = signal<string>("");
  readonly screenshotNewDeviceName = signal<string>("");
  readonly screenshotNewDeviceWatts = signal<number | null>(null);
  readonly screenshotDate = signal<string>(new Date().toISOString().split("T")[0]);
  readonly screenshotEndDate = signal<string>("");
  readonly screenshotStartTime = signal<string>("");
  readonly screenshotEndTime = signal<string>("");
  readonly screenshotBase64 = signal<string>("");
  readonly screenshotComment = signal<string>("");
  readonly isAnalyzingScreenshot = signal<boolean>(false);
  readonly screenshotError = signal<string | null>(null);
  readonly screenshotAnalysisResult = signal<ElectricityScreenshotAnalysisResult | null>(null);
  readonly screenshotExtractedKwh = signal<number | null>(null);
  readonly screenshotExtractedMode = signal<DeviceConsumptionEntryMode>("single_day");

  readonly currentScreenshotWeather = computed<DailyWeatherPoint>(() => {
    const mode = this.screenshotExtractedMode();
    const dStart = this.screenshotDate() || new Date().toISOString().split("T")[0];
    const dEnd = mode === "period_range" ? this.screenshotEndDate() : undefined;
    return this.ctx.getWeatherForDate(dStart, dEnd);
  });

  constructor() {
    effect(() => {
      const initId = this.ctx.screenshotInitialDeviceId();
      const devices = this.accountDevices();
      if (initId) {
        this.screenshotTargetDeviceId.set(initId);
      } else if (devices.length > 0) {
        this.screenshotTargetDeviceId.set(devices[0].id);
      } else {
        this.screenshotTargetDeviceId.set("__new__");
      }
      const today = new Date().toISOString().split("T")[0];
      const selMonth = this.ctx.deviceSelectedMonth();
      const defaultDate = today.startsWith(selMonth) ? today : `${selMonth}-15`;
      this.screenshotDate.set(defaultDate);
      this.screenshotEndDate.set(defaultDate);
    });
  }

  formatDate(dateStr: string): string {
    return formatDateUa(dateStr, true);
  }

  closeScreenshotModal(): void {
    this.ctx.closeScreenshotModal();
  }

  onScreenshotDeviceSelect(val: string): void {
    this.screenshotTargetDeviceId.set(val);
  }

  onScreenshotFileSelected(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl?.files?.[0];
    if (!file) return;
    this.readScreenshotFile(file);
  }

  onScreenshotPaste(event: ClipboardEvent): void {
    const items = event.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          this.readScreenshotFile(file);
          break;
        }
      }
    }
  }

  private readScreenshotFile(file: File): void {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        this.screenshotBase64.set(reader.result);
        this.screenshotError.set(null);
      }
    };
    reader.readAsDataURL(file);
  }

  clearScreenshotImage(): void {
    this.screenshotBase64.set("");
    this.screenshotAnalysisResult.set(null);
    this.screenshotExtractedKwh.set(null);
  }

  async analyzeUploadedScreenshot(): Promise<void> {
    const img = this.screenshotBase64();
    if (!img) {
      this.screenshotError.set("Спочатку завантажте або вставте скріншот");
      return;
    }

    const targetId = this.screenshotTargetDeviceId();
    const existingDev = this.accountDevices().find((d) => d.id === targetId);
    const deviceName =
      targetId === "__new__"
        ? this.screenshotNewDeviceName().trim()
        : existingDev?.name || "";

    this.isAnalyzingScreenshot.set(true);
    this.screenshotError.set(null);

    try {
      const res = await this.dataService.analyzeDeviceScreenshot({
        imageBase64: img,
        comment: this.screenshotComment().trim(),
        deviceName,
        date: this.screenshotDate(),
      });

      if (res && res.success) {
        this.screenshotAnalysisResult.set(res);
        this.screenshotExtractedKwh.set(res.consumedKwh);
        const mode: DeviceConsumptionEntryMode =
          res.valueType === "single_day" ||
          res.valueType === "period_range" ||
          res.valueType === "delta"
            ? res.valueType
            : "cumulative_month";
        this.screenshotExtractedMode.set(mode);
        if (res.detectedDate && /^\d{4}-\d{2}-\d{2}$/.test(res.detectedDate)) {
          this.screenshotDate.set(res.detectedDate);
        }
        if (res.detectedEndDate && /^\d{4}-\d{2}-\d{2}$/.test(res.detectedEndDate)) {
          this.screenshotEndDate.set(res.detectedEndDate);
        }
        if (res.detectedStartTime) {
          this.screenshotStartTime.set(res.detectedStartTime);
        }
        if (res.detectedEndTime) {
          this.screenshotEndTime.set(res.detectedEndTime);
        }
        if (targetId === "__new__" && !this.screenshotNewDeviceName().trim() && res.detectedDeviceName) {
          this.screenshotNewDeviceName.set(res.detectedDeviceName);
        }
        if (targetId === "__new__" && !this.screenshotNewDeviceWatts() && res.powerWatts) {
          this.screenshotNewDeviceWatts.set(res.powerWatts);
        }
      } else {
        this.screenshotError.set(res?.error || "Не вдалося розпізнати дані зі скріншоту");
      }
    } catch (err: unknown) {
      const msg =
        (err as { error?: { error?: string } })?.error?.error ||
        "Помилка під час аналізу скріншоту через Gemini AI";
      this.screenshotError.set(msg);
    } finally {
      this.isAnalyzingScreenshot.set(false);
    }
  }

  async applyScreenshotToDevice(): Promise<void> {
    const acc = this.ctx.currentAccount();
    if (!acc) return;
    const currentUserId = this.dataService.currentUser()?.id || "";
    const kwh = this.screenshotExtractedKwh();
    if (kwh === null || isNaN(kwh) || kwh < 0) return;

    const dateStr = this.screenshotDate() || new Date().toISOString().split("T")[0];
    const mode = this.screenshotExtractedMode();
    const endDateStr =
      mode === "period_range" && this.screenshotEndDate() ? this.screenshotEndDate() : undefined;
    const startTimeStr =
      (mode === "period_range" || mode === "single_day") && this.screenshotStartTime()
        ? this.screenshotStartTime()
        : undefined;
    const endTimeStr =
      (mode === "period_range" || mode === "single_day") && this.screenshotEndTime()
        ? this.screenshotEndTime()
        : undefined;
    const aiRes = this.screenshotAnalysisResult();
    const computedDur =
      computeDurationHoursHelper(dateStr, endDateStr || dateStr, startTimeStr || "", endTimeStr || "") ??
      aiRes?.detectedDurationHours ??
      undefined;
    const periodMonth = dateStr.slice(0, 7);

    const wPoint = this.ctx.getWeatherForDate(dateStr, endDateStr);

    const newLog: ElectricityDeviceLogEntry = {
      id: `dlog_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      date: dateStr,
      endDate: endDateStr,
      startTime: startTimeStr,
      endTime: endTimeStr,
      durationHours: computedDur,
      periodMonth,
      consumedKwh: Math.round(kwh * 100) / 100,
      entryMode: mode,
      tempAvgC: wPoint.tempAvgC,
      tempMinC: wPoint.tempMinC,
      tempMaxC: wPoint.tempMaxC,
      weatherCode: wPoint.weatherCode,
      weatherCondition: wPoint.condition,
      weatherIcon: wPoint.emoji,
      comment: this.screenshotComment().trim() || undefined,
      aiExplanation: aiRes?.explanation || undefined,
      fromScreenshot: true,
      createdAt: new Date().toISOString(),
    };

    const currentList = [...this.accountDevices()];
    let nextList: ElectricityDevice[];
    let targetDeviceName = "";

    if (this.screenshotTargetDeviceId() === "__new__") {
      targetDeviceName =
        this.screenshotNewDeviceName().trim() ||
        aiRes?.detectedDeviceName ||
        `Пристрій ${currentList.length + 1}`;
      const newDev: ElectricityDevice = {
        id: `dev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        accountId: acc.id,
        ownerUserId: currentUserId,
        name: targetDeviceName,
        category: "smart_plug",
        icon: "power",
        color: this.deviceColors[currentList.length % this.deviceColors.length],
        powerWatts: this.screenshotNewDeviceWatts() || aiRes?.powerWatts || undefined,
        isNightFriendly: false,
        notes: "Додано через AI-аналіз скріншоту",
        logs: [newLog],
        createdAt: new Date().toISOString(),
      };
      nextList = [...currentList, newDev];
    } else {
      const targetId = this.screenshotTargetDeviceId();
      nextList = currentList.map((d) => {
        if (d.id === targetId) {
          targetDeviceName = d.name;
          return {
            ...d,
            accountId: acc.id,
            ownerUserId: d.ownerUserId || currentUserId,
            logs: [...(d.logs || []), newLog],
            updatedAt: new Date().toISOString(),
          };
        }
        return d;
      });
    }

    this.isSavingDevices.set(true);
    try {
      const ok = await this.dataService.saveUtilityAccountDevices(
        acc.id,
        nextList,
        `Додано ${newLog.consumedKwh} кВт·год та погоду (${wPoint.tempAvgC > 0 ? "+" : ""}${wPoint.tempAvgC}°C) до «${targetDeviceName}»!`
      );
      if (ok) {
        this.ctx.deviceSelectedMonth.set(periodMonth);
        this.ctx.activeTab.set("devices");
        this.closeScreenshotModal();
      }
    } finally {
      this.isSavingDevices.set(false);
    }
  }
}
