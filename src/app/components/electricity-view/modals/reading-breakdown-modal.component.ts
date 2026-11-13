import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { UtilityReading } from "../../../models/utility.model";
import { formatDateUa } from "../../../models/client.model";
import { ElectricityCostResult } from "../../../models/utility.model";
import { FormatDateUaPipe } from "../electricity-pipes";
import { getReadingBreakdownHelper } from "../electricity-reading-calc.util";
import { ELECTRICITY_VIEW_CTX } from "../electricity-view.context";

@Component({
  selector: "app-reading-breakdown-modal",
  imports: [CommonModule, MatIconModule, FormatDateUaPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (selectedReadingForBreakdown(); as sel) {
      @let bDown = getReadingBreakdown(sel);
      <div class="fixed inset-0 z-50 overflow-y-auto p-0 sm:p-4 flex items-end sm:items-center justify-center">
        <!-- Backdrop button for closing -->
        <button
          type="button"
          aria-label="Закрити вікно деталей"
          class="fixed inset-0 w-full h-full bg-slate-900/60 backdrop-blur-xs cursor-default -z-10"
          (click)="closeReadingBreakdown()"
        ></button>

        <div class="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 overflow-hidden sm:my-auto flex flex-col max-h-[92dvh] pb-safe sm:pb-0 animate-in fade-in duration-150">
          <div class="sm:hidden flex justify-center pt-2.5 pb-1 bg-slate-50/80 shrink-0">
            <div class="w-10 h-1 rounded-full bg-slate-300"></div>
          </div>
          <!-- Header -->
          <div class="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/80 shrink-0">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <mat-icon aria-hidden="true" class="text-lg">calculate</mat-icon>
              </div>
              <div>
                <h3 class="text-sm font-bold text-slate-900">Деталізація нарахування за електроенергію</h3>
                <p class="text-3xs text-slate-500">Дата: {{ sel.date | formatDateUa }} • {{ currentAccount()?.name }}</p>
              </div>
            </div>
            <button
              type="button"
              (click)="closeReadingBreakdown()"
              class="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors"
            >
              <mat-icon aria-hidden="true" class="text-base">close</mat-icon>
            </button>
          </div>

          <!-- Body -->
          <div class="p-5 space-y-4 overflow-y-auto">
            <!-- Alert badge if exceeded -->
            @if (bDown.isWinterExceeded) {
              <div class="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                <mat-icon aria-hidden="true" class="text-amber-600 shrink-0 text-lg">warning</mat-icon>
                <div>
                  <div class="font-bold">Зимове споживання понад норму {{ bDown.winterLimitKwh }} кВт·г</div>
                  <div class="text-3xs text-amber-800 mt-0.5">
                    Загальне споживання: <span class="font-bold">{{ bDown.totalKwh }} кВт·г</span>.
                    Зимовий тариф діє на перші <span class="font-bold">{{ bDown.winterLimitKwh }} кВт·г</span>, а все що понад норму (<span class="font-bold">{{ bDown.excessKwh }} кВт·г</span>) розраховано за літнім тарифом. День/ніч розподілено строго пропорційно (День (Т2): {{ bDown.ratioDay }}%, Ніч (Т1): {{ bDown.ratioNight }}%).
                  </div>
                </div>
              </div>
            }

            <!-- Consumption Summary -->
            <div class="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <div>
                <span class="text-3xs text-slate-500 block">День (Т2):</span>
                <span class="font-bold text-slate-900 font-mono">{{ bDown.diff1 }} кВт·г</span>
              </div>
              <div>
                <span class="text-3xs text-slate-500 block">Ніч (Т1):</span>
                <span class="font-bold text-slate-900 font-mono">{{ bDown.diff2 }} кВт·г</span>
              </div>
            </div>

            <!-- Calculation sections -->
            @if (bDown.isWinterExceeded) {
              <div class="space-y-3">
                <!-- Winter Block -->
                <div class="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200 space-y-2">
                  <div class="flex items-center justify-between text-xs font-bold text-indigo-950 pb-1.5 border-b border-indigo-200/80">
                    <span class="flex items-center gap-1.5">
                      <mat-icon aria-hidden="true" class="text-sm text-indigo-600">ac_unit</mat-icon>
                      Зимовий тариф (до {{ bDown.winterLimitKwh }} кВт·г)
                    </span>
                    <span class="font-mono">{{ bDown.winterTotalCost?.toFixed(2) }} грн</span>
                  </div>
                  <div class="text-2xs text-indigo-900 space-y-1">
                    <div class="flex justify-between">
                      <span>День ({{ bDown.winterDayKwh }} кВт·г × {{ currentDualRates().winterDay }} грн):</span>
                      <span class="font-mono font-semibold">{{ bDown.winterDayCost?.toFixed(2) }} грн</span>
                    </div>
                    <div class="flex justify-between">
                      <span>Ніч ({{ bDown.winterNightKwh }} кВт·г × {{ currentDualRates().winterNight }} грн):</span>
                      <span class="font-mono font-semibold">{{ bDown.winterNightCost?.toFixed(2) }} грн</span>
                    </div>
                  </div>
                </div>

                <!-- Summer Block -->
                <div class="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2">
                  <div class="flex items-center justify-between text-xs font-bold text-amber-950 pb-1.5 border-b border-amber-200/80">
                    <span class="flex items-center gap-1.5">
                      <mat-icon aria-hidden="true" class="text-sm text-amber-600">wb_sunny</mat-icon>
                      Літній тариф (понад норму {{ bDown.excessKwh }} кВт·г)
                    </span>
                    <span class="font-mono">{{ bDown.summerTotalCost?.toFixed(2) }} грн</span>
                  </div>
                  <div class="text-2xs text-amber-900 space-y-1">
                    <div class="flex justify-between">
                      <span>День ({{ bDown.summerDayKwh }} кВт·г × {{ currentDualRates().summerDay }} грн):</span>
                      <span class="font-mono font-semibold">{{ bDown.summerDayCost?.toFixed(2) }} грн</span>
                    </div>
                    <div class="flex justify-between">
                      <span>Ніч ({{ bDown.summerNightKwh }} кВт·г × {{ currentDualRates().summerNight }} грн):</span>
                      <span class="font-mono font-semibold">{{ bDown.summerNightCost?.toFixed(2) }} грн</span>
                    </div>
                  </div>
                </div>
              </div>
            }

            <!-- Final total box -->
            <div class="p-3.5 rounded-xl bg-slate-900 text-white flex items-center justify-between">
              <div>
                <span class="text-3xs text-slate-400 uppercase tracking-wider block">Загальна сума до сплати</span>
                <span class="text-xs text-slate-300">Спожито {{ bDown.totalKwh }} кВт·г</span>
              </div>
              <span class="text-xl font-mono font-extrabold text-emerald-400">
                {{ sel.totalCost.toFixed(2) }} грн
              </span>
            </div>

            @if (sel.note) {
              <div class="text-2xs text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span class="font-bold text-slate-700 block mb-0.5">Примітка до запису:</span>
                {{ sel.note }}
              </div>
            }
          </div>

          <!-- Footer -->
          <div class="px-5 py-3 border-t border-slate-100 bg-slate-50/80 flex justify-end shrink-0">
            <button
              type="button"
              (click)="closeReadingBreakdown()"
              class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition-colors"
            >
              Закрити
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ReadingBreakdownModalComponent {
  readonly ctx = inject(ELECTRICITY_VIEW_CTX);
  readonly selectedReadingForBreakdown = this.ctx.selectedReadingForBreakdown;
  readonly currentAccount = this.ctx.currentAccount;
  readonly currentDualRates = this.ctx.currentDualRates;

  formatDate(dateStr: string): string {
    return formatDateUa(dateStr, true);
  }

  getReadingBreakdown(r: UtilityReading): ElectricityCostResult {
    return getReadingBreakdownHelper(r, this.currentAccount(), this.ctx.utilityTariffs());
  }

  closeReadingBreakdown(): void {
    this.ctx.closeReadingBreakdown();
  }
}
