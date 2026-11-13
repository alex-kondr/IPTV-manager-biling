import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { UtilityAccount, UtilityReading } from "../../../models/utility.model";
import { DtekMeterCheckResult } from "../../../services/iptv-data";
import { formatDateUa } from "../../../models/client.model";
import { getSeasonForDate, resolveElectricityDualRates, resolveElectricitySingleRate } from "../../../models/utility.model";
import { FormatDateUaPipe } from "../electricity-pipes";
import {
  getEstimatedKwhFromOoekBalanceHelper,
  hasHouseAccountNumberHelper,
  resolveOoekBillDate,
} from "../electricity-reading-calc.util";
import { ELECTRICITY_VIEW_CTX } from "../electricity-view.context";

@Component({
  selector: "app-utility-cabinets-sync",
  imports: [CommonModule, MatIconModule, FormatDateUaPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (currentAccount(); as acc) {
          <!-- Personal Cabinets Integration: DTEK OEM & OOEK (Encrypted Credentials) -->
          <div class="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-50 dark:bg-slate-800/90 p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-700">
              <div class="flex items-start sm:items-center gap-3">
                <div class="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                  <mat-icon aria-hidden="true" class="text-lg">vpn_key</mat-icon>
                </div>
                <div>
                  <div class="flex items-center gap-2 flex-wrap">
                    <h4 class="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                      Особисті кабінети будинку: ДТЕК ОЕМ та ТОВ «ООЕК»
                    </h4>
                    <span class="px-2 py-0.5 rounded-full text-3xs font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700 inline-flex items-center gap-1">
                      <mat-icon aria-hidden="true" class="text-3xs leading-none">enhanced_encryption</mat-icon>
                      <span>AES-256-GCM шифрування</span>
                    </span>
                    @if (acc.ooekBalanceUah !== undefined && acc.ooekBalanceUah !== null) {
                      <span class="px-2.5 py-0.5 rounded-full text-2xs font-extrabold bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-700 inline-flex items-center gap-1.5 flex-wrap">
                        <span>ООЕК до сплати: {{ acc.ooekBalanceUah.toFixed(2) }} грн</span>
                        @if (acc.ooekBillUpdatedAt) {
                          <span class="text-3xs font-semibold text-amber-800 dark:text-amber-200">({{ acc.ooekBillUpdatedAt }})</span>
                        } @else if (acc.ooekCabinetLastSync) {
                          <span class="text-3xs font-semibold text-amber-800 dark:text-amber-200">({{ acc.ooekCabinetLastSync | formatDateUa }})</span>
                        }
                      </span>
                    }
                  </div>
                  <p class="text-2xs text-slate-600 dark:text-slate-300 mt-0.5">
                    Безпечне збереження облікових даних для <span class="font-mono text-slate-800 dark:text-slate-200">auth.my.dtek-oem.com.ua</span> (показники) та <span class="font-mono text-slate-800 dark:text-slate-200">personal.ooek.od.ua</span> (нарахована сума до сплати)
                  </p>
                </div>
              </div>

              <div class="flex items-center gap-2 shrink-0 flex-wrap">
                <button
                  type="button"
                  (click)="syncOoekForCurrentAccount()"
                  [disabled]="isSyncingOoek() || !hasHouseAccountNumber(acc)"
                  class="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
                  [title]="!hasHouseAccountNumber(acc) ? 'Особовий рахунок не вказано у налаштуваннях будинку' : 'Підключитися до personal.ooek.od.ua/home/accounts та оновити нараховану суму до сплати по особовому рахунку'"
                >
                  <mat-icon aria-hidden="true" class="text-sm leading-none" [class.animate-spin]="isSyncingOoek()">receipt_long</mat-icon>
                  <span>{{ isSyncingOoek() ? 'Запит ООЕК...' : 'Оновити з ООЕК' }}</span>
                </button>

                <button
                  type="button"
                  (click)="toggleCabinetPanel()"
                  class="px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors flex items-center gap-1.5 cursor-pointer"
                  [class.bg-indigo-600]="isCabinetPanelOpen()"
                  [class.text-white]="isCabinetPanelOpen()"
                  [class.border-indigo-500]="isCabinetPanelOpen()"
                  [class.bg-white]="!isCabinetPanelOpen()"
                  [class.text-slate-700]="!isCabinetPanelOpen()"
                  [class.border-slate-300]="!isCabinetPanelOpen()"
                >
                  <mat-icon aria-hidden="true" class="text-sm leading-none">{{ isCabinetPanelOpen() ? 'expand_less' : 'settings_suggest' }}</mat-icon>
                  <span>{{ isCabinetPanelOpen() ? 'Згорнути кабінети' : 'Логіни та синхронізація' }}</span>
                </button>
              </div>
            </div>

            @if (isCabinetPanelOpen()) {
              <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                <!-- Left Card: OOEK Personal Cabinet (https://personal.ooek.od.ua/home/) -->
                <div class="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-700 shadow-2xs space-y-3 flex flex-col justify-between">
                  <div class="space-y-3">
                    <div class="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
                      <div>
                        <div class="flex items-center gap-2 flex-wrap">
                          <span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-3xs font-bold uppercase">
                            Пряма інтеграція працює
                          </span>
                          <h5 class="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                            Кабінет ТОВ «ООЕК» (Сума + Абонкнижка)
                          </h5>
                        </div>
                        <div class="flex items-center gap-3 flex-wrap mt-0.5">
                          <a
                            href="https://personal.ooek.od.ua/home/"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="text-2xs text-indigo-600 dark:text-indigo-400 hover:underline font-mono inline-flex items-center gap-1"
                          >
                            <span>personal.ooek.od.ua/home</span>
                            <mat-icon aria-hidden="true" class="text-3xs">open_in_new</mat-icon>
                          </a>
                          <a
                            href="https://personal.ooek.od.ua/home/abonbook/cards"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="text-2xs text-emerald-700 dark:text-emerald-400 hover:underline font-mono inline-flex items-center gap-1"
                          >
                            <span>/home/abonbook/cards</span>
                            <mat-icon aria-hidden="true" class="text-3xs">open_in_new</mat-icon>
                          </a>
                        </div>
                      </div>

                      @if (acc.hasOoekPassword) {
                        <span class="px-2 py-0.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-3xs font-bold flex items-center gap-1 shrink-0">
                          <mat-icon aria-hidden="true" class="text-xs leading-none">lock</mat-icon>
                          <span>Пароль зашифровано</span>
                        </span>
                      }
                    </div>

                    @if (!hasHouseAccountNumber(acc)) {
                      <div class="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-200 space-y-2.5 my-1">
                        <div class="flex items-center gap-2 font-bold text-xs text-amber-900 dark:text-amber-300">
                          <mat-icon aria-hidden="true" class="text-amber-600 dark:text-amber-400 text-base leading-none">lock</mat-icon>
                          <span>Кабінет ТОВ «ООЕК» недоступний</span>
                        </div>
                        <p class="text-3xs leading-relaxed text-amber-800 dark:text-amber-300">
                          Особовий рахунок не вказано. Для підключення до кабінету ТОВ «ООЕК» та отримання нарахувань необхідно заповнити особовий рахунок у налаштуваннях будинку.
                        </p>
                        <button
                          type="button"
                          (click)="openAccountModal(acc)"
                          class="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-3xs font-bold inline-flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                        >
                          <mat-icon aria-hidden="true" class="text-xs leading-none">edit</mat-icon>
                          <span>Заповнити особовий рахунок</span>
                        </button>
                      </div>
                    } @else {
                      <!-- Accrued Amount Display Box -->
                      <div class="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between gap-3 flex-wrap">
                        <div class="space-y-0.5">
                          <span class="text-3xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 block">
                            Нарахована сума до сплати (ООЕК • о/р {{ acc.ooekAccountNumber || acc.accountNumber }})
                          </span>
                          @if (acc.ooekBillUpdatedAt) {
                            <span class="text-2xs font-semibold text-emerald-900 dark:text-emerald-200 block">
                              Дата отримання рахунку: {{ acc.ooekBillUpdatedAt }}
                            </span>
                          }
                          @if (acc.ooekCabinetLastSync) {
                            <span class="text-3xs text-emerald-700 dark:text-emerald-300 block">
                              Останнє оновлення: {{ acc.ooekCabinetLastSync | formatDateUa }}
                            </span>
                          } @else {
                            <span class="text-3xs text-slate-500 dark:text-slate-400 block">Ще не синхронізовано</span>
                          }
                        </div>
                        <div class="text-right shrink-0 flex flex-col items-end gap-1">
                          @if (acc.ooekBalanceUah !== undefined && acc.ooekBalanceUah !== null) {
                            <span class="text-lg font-extrabold font-mono text-emerald-950 dark:text-emerald-300 leading-tight">
                              {{ acc.ooekBalanceUah.toFixed(2) }} грн
                            </span>
                            @if (acc.ooekBalanceUah > 0) {
                              <span class="text-3xs font-mono font-semibold text-emerald-800 dark:text-emerald-300">
                                ~{{ getEstimatedKwhFromOoekBalance(acc) }} кВт·г (за тарифом)
                              </span>
                            }
                          } @else {
                            <span class="text-xs font-semibold text-slate-400 italic">— грн</span>
                          }
                          @if (canEdit()) {
                            <button
                              type="button"
                              (click)="addOoekAccruedAmountToHistory(acc)"
                              [disabled]="isSubmitting() || acc.ooekBalanceUah === undefined || acc.ooekBalanceUah === null || acc.ooekBalanceUah <= 0"
                              class="mt-0.5 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-3xs font-bold inline-flex items-center gap-1 cursor-pointer transition-colors shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Додати нараховану суму у блок «Історія передачі показів та розрахунків» (якщо показників немає — кВт·г розраховуються на основі суми та тарифу)"
                            >
                              <mat-icon aria-hidden="true" class="text-xs leading-none">playlist_add</mat-icon>
                              <span>Додати до історії</span>
                            </button>
                          }
                        </div>
                      </div>

                      @if (acc.ooekCabinetStatus) {
                        <div class="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-2xs text-slate-700 dark:text-slate-200 flex items-start gap-1.5">
                          <mat-icon aria-hidden="true" class="text-sm text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5">info</mat-icon>
                          <span>{{ acc.ooekCabinetStatus }}</span>
                        </div>
                      }

                      <!-- OOEK Credentials Inputs (Account Number is automatically taken from House Settings) -->
                      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label for="cabinet-ooek-login-input" class="block text-3xs font-bold text-slate-600 dark:text-slate-300 uppercase mb-1">
                            Логін (Email або телефон ООЕК)
                          </label>
                          <input
                            id="cabinet-ooek-login-input"
                            type="text"
                            [value]="cabinetOoekLogin()"
                            (input)="cabinetOoekLogin.set($any($event.target).value)"
                            placeholder="user@email.com"
                            autocomplete="off"
                            class="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-xs text-slate-900 font-mono focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div>
                          <label for="cabinet-ooek-password-input" class="block text-3xs font-bold text-slate-600 dark:text-slate-300 uppercase mb-1">
                            Пароль ООЕК {{ acc.hasOoekPassword ? '(збережено)' : '' }}
                          </label>
                          <input
                            id="cabinet-ooek-password-input"
                            type="password"
                            [value]="cabinetOoekPassword()"
                            (input)="cabinetOoekPassword.set($any($event.target).value)"
                            [placeholder]="acc.hasOoekPassword ? '•••••••• (залиште порожнім без змін)' : 'Введіть пароль кабінету ООЕК'"
                            autocomplete="new-password"
                            class="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                      </div>
                    }
                  </div>

                  @if (hasHouseAccountNumber(acc)) {
                    <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
                      <button
                        type="button"
                        (click)="saveCabinetCredentialsForCurrentAccount()"
                        [disabled]="isSavingCabinet()"
                        class="px-3 py-2 rounded-xl bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <mat-icon aria-hidden="true" class="text-sm leading-none">lock</mat-icon>
                        <span>Зберегти зашифровано</span>
                      </button>

                      <button
                        type="button"
                        (click)="syncOoekForCurrentAccount()"
                        [disabled]="isSyncingOoek()"
                        class="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-2xs"
                      >
                        <mat-icon aria-hidden="true" class="text-sm leading-none" [class.animate-spin]="isSyncingOoek()">sync</mat-icon>
                        <span>{{ isSyncingOoek() ? 'Підключення...' : 'Отримати суму до сплати' }}</span>
                      </button>
                    </div>
                  }
                </div>

                <!-- Right Card: DTEK OEM Direct Reading Submission (In development...) -->
                <div class="p-4 rounded-xl bg-slate-100 dark:bg-slate-900/90 border border-slate-300 dark:border-slate-700 shadow-2xs space-y-3.5 flex flex-col justify-between">
                  <div class="space-y-3">
                    <div class="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-200 dark:border-slate-800">
                      <div>
                        <div class="flex items-center gap-2 flex-wrap">
                          <span class="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 text-3xs font-bold uppercase inline-flex items-center gap-1">
                            <mat-icon aria-hidden="true" class="text-xs leading-none">construction</mat-icon>
                            <span>В розробці...</span>
                          </span>
                          <h5 class="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200">
                            Передача показів лічильника ДТЕК ОЕМ
                          </h5>
                        </div>
                        <p class="text-2xs text-slate-500 dark:text-slate-400 mt-0.5">
                          @if (hasHouseAccountNumber(acc)) {
                            Швидка передача показів без входу в акаунт за особовим рахунком (<span class="font-mono font-semibold text-slate-600 dark:text-slate-300">{{ acc.accountNumber }}</span> • для ДТЕК: <span class="font-mono font-bold text-amber-700 dark:text-amber-400">{{ getFormattedDtekAccountNumber(acc.accountNumber) }}</span>)
                          } @else {
                            <span class="text-rose-600 dark:text-rose-400 font-semibold">Особовий рахунок не вказано у налаштуваннях будинку</span>
                          }
                        </p>
                      </div>
                    </div>

                    @if (!hasHouseAccountNumber(acc)) {
                      <div class="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-200 space-y-2.5 my-1">
                        <div class="flex items-center gap-2 font-bold text-xs text-amber-900 dark:text-amber-300">
                          <mat-icon aria-hidden="true" class="text-amber-600 dark:text-amber-400 text-base leading-none">lock</mat-icon>
                          <span>Передача показів ДТЕК ОЕМ недоступна</span>
                        </div>
                        <p class="text-3xs leading-relaxed text-amber-800 dark:text-amber-300">
                          Особовий рахунок не вказано. Для перевірки адреси та передачі показів лічильника необхідно заповнити особовий рахунок у налаштуваннях будинку.
                        </p>
                        <button
                          type="button"
                          (click)="openAccountModal(acc)"
                          class="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-3xs font-bold inline-flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                        >
                          <mat-icon aria-hidden="true" class="text-xs leading-none">edit</mat-icon>
                          <span>Заповнити особовий рахунок</span>
                        </button>
                      </div>
                    } @else {
                      <!-- Step 1 Trigger Button: "Хочу передати покази" -->
                      <div class="p-3 rounded-xl bg-amber-50/90 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div class="space-y-0.5 min-w-0">
                          <div class="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                            <mat-icon aria-hidden="true" class="text-sm text-amber-600 leading-none">electric_meter</mat-icon>
                            <span>Крок 1: Запит адреси та лічильника</span>
                          </div>
                          <p class="text-3xs text-slate-500 dark:text-slate-400">
                            О/Р будинку: <strong class="font-mono text-slate-800 dark:text-slate-200">{{ getFormattedDtekAccountNumber(acc.accountNumber) }}</strong>
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
                            <mat-icon aria-hidden="true" class="text-sm leading-none">send</mat-icon>
                            <span>Хочу передати покази</span>
                          }
                        </button>
                      </div>

                      <!-- Step 1 Result Card (when checkAddress returns data) -->
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
                              {{ showDtekMeterRawJson() ? 'Сховати JSON' : 'Переглянути JSON відповідь' }}
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

                      <!-- Meter Reading Inputs (1 field for single-zone, 2 fields for dual-zone) -->
                      @if (acc.electricityTariffType === 'dual') {
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 opacity-70">
                          <div>
                            <label class="block text-3xs font-bold text-slate-500 uppercase mb-1">
                              Покази День (Т2), кВт·год
                            </label>
                            <input
                              type="number"
                              disabled
                              [placeholder]="latestAnyReading()?.readingT1 || 0"
                              class="w-full px-3 py-2 rounded-lg bg-slate-200/70 dark:bg-slate-800/70 border border-slate-300 dark:border-slate-700 text-xs text-slate-500 font-mono cursor-not-allowed"
                            />
                          </div>
                          <div>
                            <label class="block text-3xs font-bold text-slate-500 uppercase mb-1">
                              Покази Ніч (Т1), кВт·год
                            </label>
                            <input
                              type="number"
                              disabled
                              [placeholder]="latestAnyReading()?.readingT2 || 0"
                              class="w-full px-3 py-2 rounded-lg bg-slate-200/70 dark:bg-slate-800/70 border border-slate-300 dark:border-slate-700 text-xs text-slate-500 font-mono cursor-not-allowed"
                            />
                          </div>
                        </div>
                      } @else {
                        <div class="opacity-70">
                          <label class="block text-3xs font-bold text-slate-500 uppercase mb-1">
                            Покази лічильника (Загальний Т1, кВт·год)
                          </label>
                          <input
                            type="number"
                            disabled
                            [placeholder]="latestAnyReading()?.readingT1 || 0"
                            class="w-full px-3 py-2 rounded-lg bg-slate-200/70 dark:bg-slate-800/70 border border-slate-300 dark:border-slate-700 text-xs text-slate-500 font-mono cursor-not-allowed"
                          />
                        </div>
                      }

                      <div class="p-2.5 rounded-lg bg-slate-200/60 dark:bg-slate-800/60 border border-slate-300/80 dark:border-slate-700/80 text-2xs text-slate-600 dark:text-slate-400 flex items-center gap-2">
                        <mat-icon aria-hidden="true" class="text-sm text-slate-500 shrink-0">hourglass_top</mat-icon>
                        <span>В розробці... Крок 1 (перевірка адреси та лічильника) виконано кнопкою «Хочу передати покази». Крок 2 (відправка нових показів) буде підключено на наступному етапі.</span>
                      </div>
                    }
                  </div>

                  @if (hasHouseAccountNumber(acc)) {
                    <div class="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
                      <span class="text-3xs text-slate-400">Крок 2: Відправка показів</span>
                      <button
                        type="button"
                        disabled
                        class="px-3.5 py-2 rounded-xl bg-slate-400 text-white text-xs font-bold flex items-center gap-1.5 cursor-not-allowed opacity-80"
                        title="Буде активовано на наступному кроці розробки"
                      >
                        <mat-icon aria-hidden="true" class="text-sm leading-none">send</mat-icon>
                        <span>Відправити покази</span>
                      </button>
                    </div>
                  }
                </div>
              </div>
            }
          </div>
    }
  `,
})
export class UtilityCabinetsSyncComponent {
  readonly ctx = inject(ELECTRICITY_VIEW_CTX);
  readonly dataService = this.ctx.dataService;
  readonly canEdit = this.ctx.canEdit;
  readonly currentAccount = this.ctx.currentAccount;
  readonly latestAnyReading = this.ctx.latestAnyReading;

  readonly isSubmitting = signal<boolean>(false);
  readonly isCabinetPanelOpen = signal<boolean>(false);
  readonly cabinetDtekLogin = signal<string>("");
  readonly cabinetDtekPassword = signal<string>("");
  readonly cabinetOoekLogin = signal<string>("");
  readonly cabinetOoekPassword = signal<string>("");
  readonly cabinetOoekAccountNumber = signal<string>("");
  readonly isSavingCabinet = signal<boolean>(false);
  readonly isSyncingOoek = signal<boolean>(false);

  readonly isDtekMeterChecking = signal<boolean>(false);
  readonly dtekMeterCheckResult = signal<DtekMeterCheckResult | null>(null);
  readonly dtekMeterCheckError = signal<string | null>(null);
  readonly dtekMeterRawResponse = signal<Record<string, unknown> | null>(null);
  readonly showDtekMeterRawJson = signal<boolean>(false);

  constructor() {
    effect(() => {
      const acc = this.currentAccount();
      untracked(() => {
        this.cabinetDtekLogin.set(acc?.dtekLogin || "");
        this.cabinetDtekPassword.set("");
        this.cabinetOoekLogin.set(acc?.ooekLogin || "");
        this.cabinetOoekPassword.set("");
        this.cabinetOoekAccountNumber.set(acc?.ooekAccountNumber || acc?.accountNumber || "");
      });
    });
  }

  formatDate(dateStr: string): string {
    return formatDateUa(dateStr, true);
  }

  openAccountModal(acc: UtilityAccount | null): void {
    this.ctx.openAccountModal(acc);
  }

  hasHouseAccountNumber(acc?: UtilityAccount | null): boolean {
    return hasHouseAccountNumberHelper(acc || this.currentAccount());
  }

  getFormattedDtekAccountNumber(rawNum?: string | null): string {
    const num =
      (rawNum && rawNum.trim()) ||
      (this.currentAccount()?.accountNumber && this.currentAccount()?.accountNumber.trim()) ||
      "";
    if (!num) return "";
    return this.dataService.formatDtekMeterAccountNumber(num);
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

  toggleShowDtekMeterRawJson(): void {
    this.showDtekMeterRawJson.update((v) => !v);
  }

  toggleCabinetPanel(): void {
    this.isCabinetPanelOpen.update((v) => !v);
  }

  async saveCabinetCredentialsForCurrentAccount(): Promise<void> {
    const acc = this.currentAccount();
    if (!acc) return;
    this.isSavingCabinet.set(true);
    try {
      await this.dataService.saveCabinetCredentials(acc.id, {
        dtekLogin: this.cabinetDtekLogin().trim(),
        ...(this.cabinetDtekPassword() ? { dtekPassword: this.cabinetDtekPassword() } : {}),
        ooekLogin: this.cabinetOoekLogin().trim(),
        ...(this.cabinetOoekPassword() ? { ooekPassword: this.cabinetOoekPassword() } : {}),
        ooekAccountNumber: acc.accountNumber,
      });
      this.cabinetDtekPassword.set("");
      this.cabinetOoekPassword.set("");
    } finally {
      this.isSavingCabinet.set(false);
    }
  }

  async syncOoekForCurrentAccount(): Promise<void> {
    const acc = this.currentAccount();
    if (!acc) return;
    this.isSyncingOoek.set(true);
    try {
      const payload: { ooekLogin?: string; ooekPassword?: string; ooekAccountNumber?: string } = {
        ooekAccountNumber: acc.accountNumber,
      };
      if (this.cabinetOoekLogin().trim()) {
        payload.ooekLogin = this.cabinetOoekLogin().trim();
      }
      if (this.cabinetOoekPassword()) {
        payload.ooekPassword = this.cabinetOoekPassword();
      }
      await this.dataService.syncOoekCabinet(acc.id, payload);
      this.cabinetOoekPassword.set("");
    } finally {
      this.isSyncingOoek.set(false);
    }
  }

  getEstimatedKwhFromOoekBalance(acc: UtilityAccount): number {
    return getEstimatedKwhFromOoekBalanceHelper(acc, this.ctx.utilityTariffs());
  }

  async addOoekAccruedAmountToHistory(acc: UtilityAccount): Promise<void> {
    if (!acc || acc.ooekBalanceUah === undefined || acc.ooekBalanceUah === null) return;
    const amountUah = Math.round(Number(acc.ooekBalanceUah) * 100) / 100;
    if (isNaN(amountUah) || amountUah <= 0) return;

    this.isSubmitting.set(true);
    try {
      const date = resolveOoekBillDate(acc);
      const periodMonth = date.slice(0, 7);
      const tariffs = this.ctx.utilityTariffs();
      const season = getSeasonForDate(date);

      const existingSameBill = this.ctx.accountReadings().find(
        (r) =>
          !r.isControlOnly &&
          r.date === date &&
          (Math.abs((r.totalCost || 0) - amountUah) < 0.05 || (r.note || "").includes("ООЕК"))
      );

      const prev = this.ctx.getEffectivePrevReading(false, date, existingSameBill?.id || null);

      let rate1 = resolveElectricitySingleRate(date, tariffs) || 4.32;
      let rate2: number | undefined;
      if (acc.electricityTariffType === "dual") {
        const dual = resolveElectricityDualRates(date, tariffs);
        rate1 = dual.dayRate || 4.32;
        rate2 = dual.nightRate || 2.16;
      }

      let consT1 = 0;
      let consT2: number | undefined = acc.electricityTariffType === "dual" ? 0 : undefined;
      let readingT1 = 0;
      let readingT2: number | undefined = acc.electricityTariffType === "dual" ? prev.t2 : undefined;
      let calculatedFromSum = false;

      const latestOoekEntry = Array.isArray(acc.ooekHistory) && acc.ooekHistory.length > 0 ? acc.ooekHistory[0] : null;

      if (
        existingSameBill &&
        ((Number(existingSameBill.consumptionT1) || 0) + (Number(existingSameBill.consumptionT2) || 0) > 0)
      ) {
        consT1 = Number(existingSameBill.consumptionT1) || 0;
        consT2 = acc.electricityTariffType === "dual" ? Number(existingSameBill.consumptionT2) || 0 : undefined;
        readingT1 = Number(existingSameBill.readingT1) || Math.round((prev.t1 + consT1) * 10) / 10;
        readingT2 =
          acc.electricityTariffType === "dual"
            ? Number(existingSameBill.readingT2) || Math.round((prev.t2 + (consT2 || 0)) * 10) / 10
            : undefined;
      } else if (latestOoekEntry && latestOoekEntry.readingT1 && latestOoekEntry.readingT1 > prev.t1) {
        readingT1 = Number(latestOoekEntry.readingT1);
        consT1 = Math.max(0, Math.round((readingT1 - prev.t1) * 10) / 10);
        if (acc.electricityTariffType === "dual" && latestOoekEntry.readingT2 && latestOoekEntry.readingT2 >= prev.t2) {
          readingT2 = Number(latestOoekEntry.readingT2);
          consT2 = Math.max(0, Math.round((readingT2 - prev.t2) * 10) / 10);
        }
      } else {
        calculatedFromSum = true;
        const calculatedKwh = Math.round((amountUah / rate1) * 10) / 10;
        consT1 = calculatedKwh;
        readingT1 = Math.round((prev.t1 + consT1) * 10) / 10;
        if (acc.electricityTariffType === "dual") {
          consT2 = 0;
          readingT2 = prev.t2;
        }
      }

      let daysSinceLast = 0;
      let dailyAvg = 0;
      const totalCons = consT1 + (consT2 || 0);
      if (prev.prevDate) {
        const curMs = new Date(date).getTime();
        const prevMs = new Date(prev.prevDate).getTime();
        daysSinceLast = Math.max(1, Math.round((curMs - prevMs) / (1000 * 60 * 60 * 24)));
        dailyAvg = Math.round((totalCons / daysSinceLast) * 10) / 10;
      } else if (totalCons > 0) {
        daysSinceLast = 30;
        dailyAvg = Math.round((totalCons / 30) * 10) / 10;
      }

      const noteText = calculatedFromSum
        ? `Рахунок ООЕК (${amountUah.toFixed(2)} грн • розраховано ~${totalCons} кВт·г за тарифом ${rate1} грн)`
        : `Рахунок ООЕК (${amountUah.toFixed(2)} грн)`;

      const readingPayload: Partial<UtilityReading> = {
        ...(existingSameBill ? { id: existingSameBill.id } : {}),
        accountId: acc.id,
        utilityType: "electricity",
        date,
        periodMonth,
        readingT1,
        readingT2,
        consumptionT1: consT1,
        consumptionT2: consT2,
        rateT1: rate1,
        rateT2: rate2,
        totalCost: amountUah,
        season,
        isPaid: existingSameBill ? Boolean(existingSameBill.isPaid) : false,
        note: noteText,
        isControlOnly: false,
        readingPurpose: "billing",
        daysSinceLastReading: daysSinceLast,
        dailyAvgConsumption: dailyAvg,
      };

      await this.dataService.saveUtilityReading(readingPayload);
      this.ctx.activeTab.set("table");
      this.ctx.isHistoryTableExpanded.set(true);
      if (this.ctx.filterPurpose() === "control") {
        this.ctx.filterPurpose.set("all");
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
