import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { formatDateUa } from "../../../models/client.model";
import { FormatDateUaPipe } from "../electricity-pipes";
import { isReadingPaidHelper, totalConsumedKwhHelper } from "../electricity-reading-calc.util";
import { ELECTRICITY_VIEW_CTX } from "../electricity-view.context";

@Component({
  selector: "app-house-info-modal",
  imports: [CommonModule, MatIconModule, FormatDateUaPipe],
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
          class="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[calc(100dvh-2rem)] pb-safe sm:pb-0 animate-in fade-in duration-150 sm:my-auto"
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
              <div class="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <mat-icon aria-hidden="true">bolt</mat-icon>
              </div>
              <div class="min-w-0">
                <h3 class="text-base font-bold text-slate-900 dark:text-white truncate">
                  {{ acc.name }} — інформація по будинку
                </h3>
                <p class="text-2xs text-slate-500 dark:text-slate-400 truncate">
                  Особовий рахунок: <span class="font-mono font-semibold">{{ acc.accountNumber || "—" }}</span>
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

          <!-- Body: 4 Stat Cards -->
          <div class="p-4 sm:p-5 overflow-y-auto flex-1 overscroll-contain">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <!-- Latest Reading -->
              <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80">
                <span class="text-3xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">Останні покази</span>
                @if (latestAnyReading(); as lr) {
                  @if (acc.electricityTariffType === 'dual') {
                    <div class="text-sm font-extrabold text-slate-900 dark:text-white mt-1">
                      День (Т2): {{ lr.readingT1 }} <span class="text-2xs font-normal text-slate-500 dark:text-slate-400">кВт·г</span>
                    </div>
                    <div class="text-sm font-extrabold text-slate-900 dark:text-white">
                      Ніч (Т1): {{ lr.readingT2 }} <span class="text-2xs font-normal text-slate-500 dark:text-slate-400">кВт·г</span>
                    </div>
                  } @else {
                    <div class="text-base font-extrabold text-slate-900 dark:text-white mt-1">
                      {{ lr.readingT1 }} <span class="text-xs font-normal text-slate-500 dark:text-slate-400">кВт·г</span>
                    </div>
                  }
                  <div class="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span class="text-3xs text-slate-500 dark:text-slate-400">{{ lr.date | formatDateUa }}</span>
                    @if (lr.isControlOnly) {
                      <span class="px-1.5 py-0.2 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-200 text-3xs font-bold border border-indigo-200 dark:border-indigo-800">
                        Контрольний
                      </span>
                    }
                  </div>
                } @else {
                  <div class="text-xs text-slate-400 mt-1 italic">
                    Початкові: {{ acc.electricityTariffType === 'dual' ? (acc.initialReadingT1 || 0) + ' / ' + (acc.initialReadingT2 || 0) : (acc.initialReadingT1 || 0) }} кВт·г
                  </div>
                }
              </div>

              <!-- Last Consumption -->
              <div class="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/70">
                <span class="text-3xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300 block">Спожито за період</span>
                @if (latestAnyReading(); as lr) {
                  <div class="text-base font-extrabold text-amber-950 dark:text-amber-100 mt-1">
                    {{ totalConsumedKwh(lr) }} <span class="text-xs font-normal text-amber-700 dark:text-amber-300">кВт·г</span>
                  </div>
                  @if (acc.electricityTariffType === 'dual') {
                    <div class="text-2xs text-amber-800 dark:text-amber-200 mt-0.5">
                      День: {{ lr.consumptionT1 || 0 }} • Ніч: {{ lr.consumptionT2 || 0 }}
                    </div>
                  }
                  @if (lr.isControlOnly) {
                    <span class="text-3xs text-indigo-700 dark:text-indigo-300 font-semibold mt-0.5 block">Для моніторингу</span>
                  }
                } @else {
                  <div class="text-xs text-amber-600 dark:text-amber-400 mt-1 italic">Немає розрахунків</div>
                }
              </div>

              <!-- Last Billing Accrual / Paid Status -->
              <div class="p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/70">
                <span class="text-3xs font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 block">Сума за останній розрахунок</span>
                @let lbr = latestBillingReading();
                @let predictedAmt = lbr ? lbr.totalCost.toFixed(2) : '0.00';
                @let ooekAmt = (acc.ooekBalanceUah !== undefined && acc.ooekBalanceUah !== null) ? acc.ooekBalanceUah.toFixed(2) : '—';
                <div class="text-xs sm:text-sm font-extrabold text-emerald-950 dark:text-emerald-100 mt-1 leading-snug">
                  Прогнозована {{ predictedAmt }} грн / ООЕК {{ ooekAmt }} грн
                </div>
                <div class="mt-1.5 flex items-center justify-between gap-1 flex-wrap">
                  @if (lbr) {
                    @if (isReadingPaid(lbr)) {
                      <span class="inline-flex items-center gap-1 text-3xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100/90 dark:bg-emerald-900/60 px-2 py-0.5 rounded">
                        <mat-icon aria-hidden="true" class="text-xs leading-none">check_circle</mat-icon> Оплачено
                      </span>
                    } @else {
                      <span class="inline-flex items-center gap-1 text-3xs font-bold text-rose-700 dark:text-rose-300 bg-rose-100/90 dark:bg-rose-900/60 px-2 py-0.5 rounded">
                        <mat-icon aria-hidden="true" class="text-xs leading-none">pending</mat-icon> До сплати
                      </span>
                    }
                    <span class="text-3xs text-slate-500 dark:text-slate-400 font-mono">{{ acc.ooekBillUpdatedAt || formatDate(lbr.date) }}</span>
                  } @else if (acc.ooekBillUpdatedAt) {
                    <span class="text-3xs text-emerald-800 dark:text-emerald-300 font-mono">Рахунок ООЕК: {{ acc.ooekBillUpdatedAt }}</span>
                  } @else {
                    <span class="text-3xs text-emerald-600 dark:text-emerald-400 italic">Немає розрахунків</span>
                  }
                </div>
              </div>

              <!-- Current Tariff Applied -->
              <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80">
                <span class="text-3xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">Діючий тариф</span>
                <div class="mt-1">
                  @if (acc.electricityTariffType === 'dual') {
                    @let dualRates = currentDualRates();
                    <div class="text-xs font-bold text-slate-900 dark:text-white">
                      День: {{ dualRates.dayRate }} <span class="text-3xs text-slate-500 dark:text-slate-400 font-normal">грн</span>
                    </div>
                    <div class="text-xs font-bold text-slate-900 dark:text-white">
                      Ніч: {{ dualRates.nightRate }} <span class="text-3xs text-slate-500 dark:text-slate-400 font-normal">грн</span>
                    </div>
                    <span class="inline-block mt-1 text-3xs font-semibold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 px-1.5 py-0.5 rounded border border-purple-200/60 dark:border-purple-800/60">
                      {{ dualRates.season === 'summer' ? 'Літній сезон (01.05 – 30.09)' : 'Зимовий сезон (01.10 – 30.04)' }}
                    </span>
                  } @else {
                    <div class="text-base font-extrabold text-slate-900 dark:text-white">
                      {{ currentSingleRate() }} <span class="text-xs font-normal text-slate-500 dark:text-slate-400">грн/кВт·г</span>
                    </div>
                    <span class="inline-block mt-1 text-3xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-200/60 dark:bg-slate-700/70 px-1.5 py-0.5 rounded">
                      Єдиний на весь рік
                    </span>
                  }
                </div>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="flex items-center justify-end p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/90 shrink-0">
            <button
              type="button"
              (click)="closeModal()"
              class="px-4 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
            >
              Закрити
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class HouseInfoModalComponent {
  readonly ctx = inject(ELECTRICITY_VIEW_CTX);
  readonly currentAccount = this.ctx.currentAccount;
  readonly latestAnyReading = this.ctx.latestAnyReading;
  readonly latestBillingReading = this.ctx.latestBillingReading;
  readonly currentSingleRate = this.ctx.currentSingleRate;
  readonly currentDualRates = this.ctx.currentDualRates;

  closeModal(): void {
    this.ctx.closeHouseInfoModal();
  }

  totalConsumedKwh(r: NonNullable<ReturnType<typeof this.latestAnyReading>>): number {
    return totalConsumedKwhHelper(r);
  }

  isReadingPaid(r: NonNullable<ReturnType<typeof this.latestBillingReading>>): boolean {
    return isReadingPaidHelper(r, this.currentAccount());
  }

  formatDate(dateStr: string): string {
    return formatDateUa(dateStr, true);
  }
}
