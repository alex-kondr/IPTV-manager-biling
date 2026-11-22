import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import {
  calculateElectricityCost,
  getSeasonForDate,
  UtilityAccount,
  UtilityReading,
} from "../../../models/utility.model";
import { DtekMeterCheckResult } from "../../../services/iptv-data";
import {
  hasHouseAccountNumberHelper,
  resolveBillingMonthLastDayIsoDate,
} from "../electricity-reading-calc.util";
import { ELECTRICITY_VIEW_CTX } from "../electricity-view.context";

@Component({
  selector: "app-dtek-reading-submit-modal",
  imports: [CommonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (currentAccount(); as acc) {
      <div
        class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4 flex items-end sm:items-center justify-center"
        (click)="closeModal()"
        (keydown.escape)="closeModal()"
        tabindex="-1"
      >
        <div
          class="w-full max-w-lg bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[calc(100dvh-2rem)] pb-safe sm:pb-0 animate-in fade-in duration-150 sm:my-auto"
          tabindex="-1"
          (click)="$event.stopPropagation()"
          (keydown)="$event.stopPropagation()"
        >
          <div class="sm:hidden flex justify-center pt-2.5 pb-1 bg-slate-50 dark:bg-slate-950/80 shrink-0">
            <div class="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700"></div>
          </div>

          <!-- Header -->
          <div class="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 shrink-0">
            <div class="flex items-center gap-2.5 min-w-0">
              <div class="w-9 h-9 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0 shadow-2xs">
                <mat-icon aria-hidden="true">send</mat-icon>
              </div>
              <div class="min-w-0">
                <h3 class="text-base font-bold text-slate-900 dark:text-white truncate">
                  Передача показів ДТЕК ОЕМ
                </h3>
                <p class="text-2xs text-slate-500 dark:text-slate-400 truncate">
                  {{ acc.name }} • О/Р {{ getFormattedDtekAccountNumber(acc.accountNumber) }}
                </p>
              </div>
            </div>
            <button
              type="button"
              (click)="closeModal()"
              aria-label="Закрити"
              class="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 flex items-center justify-center cursor-pointer transition-colors shrink-0"
            >
              <mat-icon aria-hidden="true" class="text-lg">close</mat-icon>
            </button>
          </div>

          <!-- Body -->
          <div class="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 overscroll-contain">
            @if (!hasHouseAccountNumber(acc)) {
              <div class="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-200 space-y-2.5">
                <div class="flex items-center gap-2 font-bold text-xs text-amber-900 dark:text-amber-300">
                  <mat-icon aria-hidden="true" class="text-amber-600 dark:text-amber-400 text-base leading-none">lock</mat-icon>
                  <span>Передача показів ДТЕК ОЕМ недоступна</span>
                </div>
                <p class="text-3xs leading-relaxed text-amber-800 dark:text-amber-300">
                  Особовий рахунок не вказано. Для перевірки адреси та передачі показів лічильника необхідно заповнити особовий рахунок у налаштуваннях будинку.
                </p>
                <button
                  type="button"
                  (click)="openAccountSettings(acc)"
                  class="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-3xs font-bold inline-flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                >
                  <mat-icon aria-hidden="true" class="text-xs leading-none">edit</mat-icon>
                  <span>Заповнити особовий рахунок</span>
                </button>
              </div>
            } @else {
              <!-- Step 1: Request Address & Counter -->
              <div class="p-3 rounded-xl bg-amber-50/90 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div class="space-y-0.5 min-w-0">
                  <div class="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <mat-icon aria-hidden="true" class="text-sm text-amber-600 leading-none">electric_meter</mat-icon>
                    <span>Крок 1: Запит адреси та лічильника</span>
                  </div>
                  <p class="text-3xs text-slate-500 dark:text-slate-400">
                    О/Р для ДТЕК: <strong class="font-mono text-slate-800 dark:text-slate-200">{{ getFormattedDtekAccountNumber(acc.accountNumber) }}</strong>
                  </p>
                </div>
                <button
                  type="button"
                  id="btn-dtek-want-submit-readings"
                  (click)="onWantToSubmitDtekReadings(acc)"
                  [disabled]="isDtekMeterChecking() || !hasHouseAccountNumber(acc)"
                  class="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-95 disabled:opacity-60 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-sm shrink-0"
                >
                  @if (isDtekMeterChecking()) {
                    <span class="w-3.5 h-3.5 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin"></span>
                    <span>Запит до ДТЕК...</span>
                  } @else {
                    <mat-icon aria-hidden="true" class="text-sm leading-none">search</mat-icon>
                    <span>Перевірити ДТЕК</span>
                  }
                </button>
              </div>

              @if (dtekMeterCheckResult(); as res) {
                <div class="p-3 rounded-xl bg-emerald-50/90 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 space-y-2.5">
                  <div class="flex items-start justify-between gap-2 flex-wrap">
                    <div class="flex items-center gap-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                      <mat-icon aria-hidden="true" class="text-sm text-emerald-600 leading-none">verified</mat-icon>
                      <span>Дані отримано з ДТЕК ОЕМ:</span>
                    </div>
                    <button
                      type="button"
                      (click)="toggleShowDtekMeterRawJson()"
                      class="text-3xs font-mono font-semibold px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-slate-700 cursor-pointer transition-colors"
                    >
                      {{ showDtekMeterRawJson() ? 'Сховати JSON' : 'JSON відповідь' }}
                    </button>
                  </div>

                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-2xs">
                    <div class="space-y-0.5">
                      <span class="text-3xs uppercase font-bold text-slate-400">Адреса ДТЕК:</span>
                      <div class="font-medium text-slate-800 dark:text-slate-200 leading-tight">
                        {{ res.personalAccountAddressText || res.address || '—' }}
                      </div>
                    </div>
                    <div class="space-y-0.5">
                      <span class="text-3xs uppercase font-bold text-slate-400">Особовий рахунок:</span>
                      <div class="font-mono font-bold text-slate-800 dark:text-slate-200 leading-tight">
                        {{ res.personalAccountNumberText || ('О/Р ' + getFormattedDtekAccountNumber(acc.accountNumber)) }}
                      </div>
                    </div>
                    <div class="space-y-0.5">
                      <span class="text-3xs uppercase font-bold text-slate-400">Лічильник:</span>
                      <div class="font-mono font-medium text-slate-800 dark:text-slate-200">
                        {{ res.counterModel || '—' }} (№ {{ res.counterNumber || '—' }})
                      </div>
                    </div>
                    <div class="space-y-0.5">
                      <span class="text-3xs uppercase font-bold text-slate-400">EIC код:</span>
                      <div class="font-mono font-semibold text-slate-700 dark:text-slate-300 truncate">
                        {{ res.profile?.eicCode || '—' }}
                      </div>
                    </div>
                  </div>

                  @if (res.data && res.data.length > 0) {
                    <div class="pt-2 border-t border-emerald-200/80 dark:border-emerald-800/40">
                      <div class="text-3xs uppercase font-bold text-slate-500 dark:text-slate-400 mb-1">Попередні зафіксовані покази:</div>
                      <div class="grid grid-cols-2 gap-2">
                        @for (zone of res.data; track zone.codeZone) {
                          <div class="px-2.5 py-1.5 rounded-lg bg-white/90 dark:bg-slate-800/90 border border-emerald-200 dark:border-emerald-700/50">
                            <div class="text-3xs text-slate-500 font-semibold">{{ zone.name }} ({{ zone.codeZone }})</div>
                            <div class="text-xs font-mono font-black text-slate-900 dark:text-slate-100">
                              {{ zone.old }} кВт·год
                            </div>
                          </div>
                        }
                      </div>
                    </div>
                  }

                  @if (showDtekMeterRawJson()) {
                    <div class="pt-2 border-t border-emerald-200 dark:border-emerald-800/40">
                      <div class="text-3xs font-bold text-slate-500 dark:text-slate-400 mb-1">Сирий JSON (відповідь /ua/ajax checkAddress):</div>
                      <pre class="p-2.5 rounded-lg bg-slate-950 text-emerald-400 text-3xs font-mono max-h-48 overflow-auto whitespace-pre-wrap select-all">{{ dtekMeterRawResponse() | json }}</pre>
                    </div>
                  }
                </div>
              }

              @if (dtekMeterCheckError()) {
                <div class="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-2xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                  <mat-icon aria-hidden="true" class="text-sm text-rose-600 shrink-0">error_outline</mat-icon>
                  <span>{{ dtekMeterCheckError() }}</span>
                </div>
              }

              <!-- Step 2: Reading Inputs -->
              <div class="space-y-3">
                <div class="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <span class="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                      Крок 2: Введення поточних показів
                    </span>
                    <span class="text-3xs text-slate-500 dark:text-slate-400">
                      Фіксація на <strong class="font-mono text-slate-700 dark:text-slate-200">{{ getTargetBillingDateInfo().displayDate }}</strong>
                    </span>
                  </div>
                  <button
                    type="button"
                    (click)="openCameraModal()"
                    class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-100 dark:bg-amber-950/80 hover:bg-amber-200 dark:hover:bg-amber-900 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700 transition-colors cursor-pointer shadow-2xs shrink-0"
                    title="Розпізнати покази лічильника для автоматичного заповнення"
                  >
                    <mat-icon aria-hidden="true" class="text-sm text-amber-600 dark:text-amber-400 leading-none">photo_camera</mat-icon>
                    <span>Розпізнати покази</span>
                  </button>
                </div>

                @if (isDualZoneCounter(acc)) {
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label for="dtek-modal-t1" class="block text-3xs font-bold text-slate-600 dark:text-slate-300 uppercase mb-1">
                        Покази День (Т2), кВт·год *
                      </label>
                      <input
                        id="dtek-modal-t1"
                        type="number"
                        inputmode="decimal"
                        step="1"
                        min="0"
                        [value]="dtekReadingT1()"
                        (input)="dtekReadingT1.set($any($event.target).value)"
                        [placeholder]="getZonePlaceholder('day')"
                        class="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white font-mono font-bold focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label for="dtek-modal-t2" class="block text-3xs font-bold text-slate-600 dark:text-slate-300 uppercase mb-1">
                        Покази Ніч (Т1), кВт·год *
                      </label>
                      <input
                        id="dtek-modal-t2"
                        type="number"
                        inputmode="decimal"
                        step="1"
                        min="0"
                        [value]="dtekReadingT2()"
                        (input)="dtekReadingT2.set($any($event.target).value)"
                        [placeholder]="getZonePlaceholder('night')"
                        class="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white font-mono font-bold focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                } @else {
                  <div>
                    <label for="dtek-modal-single" class="block text-3xs font-bold text-slate-600 dark:text-slate-300 uppercase mb-1">
                      Покази лічильника (Загальний Т1, кВт·год) *
                    </label>
                    <input
                      id="dtek-modal-single"
                      type="number"
                      inputmode="decimal"
                      step="1"
                      min="0"
                      [value]="dtekReadingT1()"
                      (input)="dtekReadingT1.set($any($event.target).value)"
                      [placeholder]="getZonePlaceholder('day')"
                      class="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white font-mono font-bold focus:outline-none focus:border-amber-500"
                    />
                  </div>
                }
              </div>
            }
          </div>

          <!-- Footer -->
          <div class="flex items-center justify-end gap-2.5 p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/90 shrink-0">
            <button
              type="button"
              (click)="closeModal()"
              class="px-4 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
            >
              Закрити
            </button>
            @if (hasHouseAccountNumber(acc)) {
              <button
                type="button"
                (click)="onSubmitDtekReadings(acc)"
                [disabled]="isSubmitting() || !canSubmitDtekReadings(acc)"
                class="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:bg-slate-400 text-slate-950 disabled:text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 shadow-2xs transition-colors"
              >
                <mat-icon aria-hidden="true" class="text-sm leading-none">send</mat-icon>
                <span>{{ isSubmitting() ? 'Відправка в ДТЕК...' : 'Відправити покази' }}</span>
              </button>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class DtekReadingSubmitModalComponent {
  readonly ctx = inject(ELECTRICITY_VIEW_CTX);
  readonly dataService = this.ctx.dataService;
  readonly currentAccount = this.ctx.currentAccount;
  readonly latestAnyReading = this.ctx.latestAnyReading;

  readonly isSubmitting = signal<boolean>(false);
  readonly isDtekMeterChecking = signal<boolean>(false);
  readonly dtekMeterCheckResult = signal<DtekMeterCheckResult | null>(null);
  readonly dtekMeterCheckError = signal<string | null>(null);
  readonly dtekMeterRawResponse = signal<Record<string, unknown> | null>(null);
  readonly showDtekMeterRawJson = signal<boolean>(false);
  readonly dtekReadingT1 = signal<string>("");
  readonly dtekReadingT2 = signal<string>("");

  constructor() {
    effect(() => {
      const acc = this.currentAccount();
      untracked(() => {
        this.dtekReadingT1.set("");
        this.dtekReadingT2.set("");
        this.dtekMeterCheckResult.set(null);
        this.dtekMeterCheckError.set(null);
        this.dtekMeterRawResponse.set(null);
        this.showDtekMeterRawJson.set(false);
        if (acc && this.hasHouseAccountNumber(acc)) {
          void this.onWantToSubmitDtekReadings(acc);
        }
      });
    });

    effect(() => {
      const applied = this.ctx.appliedCameraReading();
      if (applied) {
        untracked(() => {
          if (applied.readingT1 !== undefined && applied.readingT1 !== null) {
            this.dtekReadingT1.set(String(applied.readingT1));
          }
          if (applied.readingT2 !== undefined && applied.readingT2 !== null) {
            this.dtekReadingT2.set(String(applied.readingT2));
          }
        });
      }
    });
  }

  closeModal(): void {
    this.ctx.closeDtekSubmitModal();
  }

  openCameraModal(): void {
    this.ctx.openCameraModal();
  }

  openAccountSettings(acc: UtilityAccount): void {
    this.ctx.closeDtekSubmitModal();
    this.ctx.openAccountModal(acc);
  }

  hasHouseAccountNumber(acc?: UtilityAccount | null): boolean {
    return hasHouseAccountNumberHelper(acc || this.currentAccount());
  }

  getTargetBillingDateInfo() {
    return resolveBillingMonthLastDayIsoDate();
  }

  getFormattedDtekAccountNumber(rawNum?: string | null): string {
    const num =
      (rawNum && rawNum.trim()) ||
      (this.currentAccount()?.accountNumber && this.currentAccount()?.accountNumber.trim()) ||
      "";
    if (!num) return "";
    return this.dataService.formatDtekMeterAccountNumber(num);
  }

  isDualZoneCounter(acc?: UtilityAccount | null): boolean {
    const targetAcc = acc || this.currentAccount();
    if (targetAcc?.electricityTariffType === "dual") return true;
    const dtekZones = this.dtekMeterCheckResult()?.data;
    return Array.isArray(dtekZones) && dtekZones.length >= 2;
  }

  getZonePlaceholder(zoneType: "day" | "night"): string {
    const dtekZones = this.dtekMeterCheckResult()?.data;
    if (Array.isArray(dtekZones) && dtekZones.length > 0) {
      if (zoneType === "day") {
        const dayZone =
          dtekZones.find(
            (z) =>
              z.alias === "day" ||
              z.codeZone === "04" ||
              z.codeScale === "001" ||
              (z.name && z.name.toLowerCase().includes("день"))
          ) || dtekZones[0];
        if (dayZone?.old) return `Попер. ДТЕК: ${dayZone.old}`;
      } else {
        const nightZone =
          dtekZones.find(
            (z) =>
              z.alias === "night" ||
              z.codeZone === "05" ||
              z.codeScale === "002" ||
              (z.name && z.name.toLowerCase().includes("ніч"))
          ) || dtekZones[1];
        if (nightZone?.old) return `Попер. ДТЕК: ${nightZone.old}`;
      }
    }
    const latest = this.latestAnyReading();
    return `Попер.: ${zoneType === "day" ? latest?.readingT1 || 0 : latest?.readingT2 || 0}`;
  }

  canSubmitDtekReadings(acc: UtilityAccount): boolean {
    const rawT1 = this.dtekReadingT1().toString().trim();
    if (!rawT1 || isNaN(Number(rawT1)) || Number(rawT1) < 0) return false;
    if (this.isDualZoneCounter(acc)) {
      const rawT2 = this.dtekReadingT2().toString().trim();
      if (!rawT2 || isNaN(Number(rawT2)) || Number(rawT2) < 0) return false;
    }
    return true;
  }

  toggleShowDtekMeterRawJson(): void {
    this.showDtekMeterRawJson.update((v) => !v);
  }

  async onWantToSubmitDtekReadings(acc?: UtilityAccount | null): Promise<void> {
    const targetAcc = acc || this.currentAccount();
    const rawNum = (targetAcc?.accountNumber && targetAcc.accountNumber.trim()) || "";
    const targetId = targetAcc?.id;

    if (!rawNum) {
      this.dtekMeterCheckError.set(
        "Особовий рахунок не вказано у налаштуваннях будинку. Будь ласка, заповніть його для перевірки."
      );
      return;
    }

    this.isDtekMeterChecking.set(true);
    this.dtekMeterCheckError.set(null);

    try {
      const res = await this.dataService.checkDtekMeterAddress(rawNum, targetId);
      if (res.success && res.data && res.data.result !== false) {
        this.dtekMeterCheckResult.set(res.data);
        this.dtekMeterRawResponse.set(res.data as Record<string, unknown>);
      } else {
        const errMsg =
          res.error ||
          (typeof res.data?.address === "string" ? res.data.address : "") ||
          "ДТЕК ОЕМ не повернув дані адреси";
        this.dtekMeterCheckError.set(errMsg);
      }
    } catch (err: unknown) {
      let errMsg = "Помилка звернення до сервера ДТЕК ОЕМ";
      if (err && typeof err === "object") {
        const httpErr = err as { error?: { error?: string; message?: string }; message?: string };
        if (httpErr.error?.error) {
          errMsg = httpErr.error.error;
        } else if (httpErr.error?.message) {
          errMsg = httpErr.error.message;
        } else if (httpErr.message) {
          errMsg = httpErr.message;
        }
      }
      this.dtekMeterCheckError.set(errMsg);
    } finally {
      this.isDtekMeterChecking.set(false);
    }
  }

  async onSubmitDtekReadings(acc: UtilityAccount): Promise<void> {
    if (!acc || !this.canSubmitDtekReadings(acc)) return;

    this.isSubmitting.set(true);
    this.dtekMeterCheckError.set(null);
    try {
      const rawT1 = this.dtekReadingT1().toString().trim();
      const rawT2 = this.dtekReadingT2().toString().trim();
      const checkRes = this.dtekMeterCheckResult();
      const allZones =
        checkRes?.data && Array.isArray(checkRes.data) && checkRes.data.length > 0
          ? checkRes.data
          : null;
      const firstZone = allZones ? allZones[0] : null;
      const profileObj = checkRes?.profile || null;

      // Send saveReceptionMeter POST request to DTEK OEM using all zones in data + profile + block-id: 237
      const dtekSubmitRes = await this.dataService.submitDtekMeterReading({
        accountNumber: acc.accountNumber || "",
        accountId: acc.id,
        value: rawT1,
        readingT1: rawT1,
        readingT2: this.isDualZoneCounter(acc) ? rawT2 : undefined,
        zoneData: firstZone,
        zonesData: allZones,
        profile: profileObj,
      });

      if (dtekSubmitRes.data || dtekSubmitRes.sentPayload) {
        this.dtekMeterRawResponse.set({
          checkAddress: checkRes,
          saveReceptionMeterRequest: dtekSubmitRes.sentPayload,
          saveReceptionMeterResponse: dtekSubmitRes.data,
        });
      }

      if (!dtekSubmitRes.success) {
        this.dtekMeterCheckError.set(
          dtekSubmitRes.error || "Не вдалося передати покази на сайт ДТЕК ОЕМ"
        );
        return;
      }

      const billingDateInfo = resolveBillingMonthLastDayIsoDate();
      const date = billingDateInfo.isoDate;
      const periodMonth = billingDateInfo.periodMonth;
      const tariffs = this.ctx.utilityTariffs();

      const existingSameDateBilling = this.ctx.accountReadings().find(
        (r) => !r.isControlOnly && r.date === date
      );

      const prev = this.ctx.getEffectivePrevReading(
        false,
        date,
        existingSameDateBilling?.id || null
      );

      const isDual = this.isDualZoneCounter(acc);
      const t1Val = Math.round(Number(this.dtekReadingT1()) * 10) / 10;
      const diff1 = Math.max(0, Math.round((t1Val - prev.t1) * 10) / 10);

      let t2Val: number | undefined;
      let diff2: number | undefined;
      if (isDual) {
        t2Val = Math.round(Number(this.dtekReadingT2()) * 10) / 10;
        diff2 = Math.max(0, Math.round((t2Val - prev.t2) * 10) / 10);
      }

      let daysSinceLast = 0;
      let dailyAvg = 0;
      const totalDiff = isDual ? diff1 + (diff2 || 0) : diff1;
      if (prev.prevDate) {
        const curMs = new Date(date).getTime();
        const prevMs = new Date(prev.prevDate).getTime();
        daysSinceLast = Math.max(1, Math.round((curMs - prevMs) / (1000 * 60 * 60 * 24)));
        dailyAvg = Math.round((totalDiff / daysSinceLast) * 10) / 10;
      } else if (totalDiff > 0) {
        daysSinceLast = 30;
        dailyAvg = Math.round((totalDiff / 30) * 10) / 10;
      }

      const calc = calculateElectricityCost(
        date,
        diff1,
        diff2,
        isDual ? "dual" : acc.electricityTariffType,
        tariffs
      );
      const season = getSeasonForDate(date);

      const formattedOr = this.getFormattedDtekAccountNumber(acc.accountNumber);
      const noteText = `Передано покази ДТЕК ОЕМ за ${billingDateInfo.monthLabelUa} (о/р ${formattedOr || acc.accountNumber})`;

      const readingPayload: Partial<UtilityReading> = {
        ...(existingSameDateBilling ? { id: existingSameDateBilling.id } : {}),
        accountId: acc.id,
        utilityType: "electricity",
        date,
        periodMonth,
        readingT1: t1Val,
        readingT2: t2Val,
        consumptionT1: diff1,
        consumptionT2: diff2,
        rateT1: calc.rate1,
        rateT2: calc.rate2,
        totalCost: calc.totalCost,
        season,
        isPaid: existingSameDateBilling ? Boolean(existingSameDateBilling.isPaid) : false,
        note: noteText,
        isControlOnly: false,
        readingPurpose: "billing",
        daysSinceLastReading: daysSinceLast,
        dailyAvgConsumption: dailyAvg,
      };

      await this.dataService.saveUtilityReading(readingPayload);
      this.dtekReadingT1.set("");
      this.dtekReadingT2.set("");
      this.ctx.activeTab.set("table");
      this.ctx.isHistoryTableExpanded.set(true);
      if (this.ctx.filterPurpose() === "control") {
        this.ctx.filterPurpose.set("all");
      }
      this.closeModal();
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
