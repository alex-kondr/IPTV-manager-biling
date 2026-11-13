import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { IptvData } from '../../services/iptv-data';
import {
  UtilityAccount,
  UtilityReading,
  UtilityServiceTabId,
  resolveWaterRate,
  resolveWasteRate,
  resolveWaterMonthlyFee,
  calculateWaterPrediction,
  WaterPredictionResult,
} from '../../models/utility.model';
import { formatDateUa } from '../../models/client.model';
import { MeterCameraModal, AppliedMeterReading } from '../meter-camera-modal/meter-camera-modal';
import { WaterChartComponent } from './water-chart.component';
import {
  WaterTimelinePoint,
  WaterMonthlySummary,
  WaterStatsKPIs,
} from './water-chart-wrapper';

type SubFilterType = 'all' | 'water' | 'water_control' | 'waste';

@Component({
  selector: 'app-water-waste-view',
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, MeterCameraModal, WaterChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div id="water-waste-container" class="space-y-6 max-w-7xl mx-auto">
      @if (canEdit()) {
        <div class="flex items-center justify-end">
          <button
            type="button"
            (click)="openAccountModal(null)"
            class="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <mat-icon class="text-base leading-none">add_business</mat-icon>
            <span>Додати будинок</span>
          </button>
        </div>
      }

      <!-- Unified House / Account Selector with Per-Tab Visibility -->
      @if (visibleAccountsForCurrentTab().length > 0 || hiddenAccountsForCurrentTab().length > 0) {
        <div class="p-3 sm:p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-2">
          <div class="flex items-center justify-between gap-1.5 flex-wrap">
            <div class="flex items-center gap-1.5 min-w-0">
              <mat-icon class="text-base shrink-0" [class.text-cyan-600]="serviceMode() !== 'waste'" [class.text-emerald-600]="serviceMode() === 'waste'">home_pin</mat-icon>
              <span class="text-xs font-bold text-slate-800 truncate">
                Будинок ({{ visibleAccountsForCurrentTab().length }}):
              </span>
            </div>

            <div class="flex items-center gap-1.5 flex-wrap justify-end">
              @if (currentAccount(); as activeAcc) {
                @if (defaultDtekAccountId() !== activeAcc.id) {
                  <button
                    type="button"
                    (click)="setAsDefaultHouse(activeAcc.id)"
                    [disabled]="isSavingDefaultHouse()"
                    class="px-2 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-2xs font-bold inline-flex items-center gap-1 transition-colors cursor-pointer shadow-2xs disabled:opacity-50 shrink-0"
                    title="Встановити цей будинок за замовчуванням"
                  >
                    <mat-icon class="text-xs">star</mat-icon>
                    <span>{{ isSavingDefaultHouse() ? '...' : 'За замовч.' }}</span>
                  </button>
                }
                @if (canEdit()) {
                  <button
                    type="button"
                    (click)="toggleHideHouseInCurrentTab(activeAcc.id)"
                    class="px-2 py-1 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 hover:border-rose-200 text-2xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                    title="Приховати цей будинок лише на поточній вкладці, якщо для нього не нараховується ця послуга"
                  >
                    <mat-icon class="text-xs">visibility_off</mat-icon>
                    <span>Сховати</span>
                  </button>
                }
              }
              @if (hiddenAccountsForCurrentTab().length > 0) {
                <button
                  type="button"
                  (click)="showHiddenHousesPanel.set(!showHiddenHousesPanel())"
                  class="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-2xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                  title="Показати або сховати список прихованих будинків на цій вкладці"
                >
                  <mat-icon class="text-xs text-slate-500">{{ showHiddenHousesPanel() ? 'visibility' : 'visibility_off' }}</mat-icon>
                  <span>Приховані ({{ hiddenAccountsForCurrentTab().length }})</span>
                </button>
              }
            </div>
          </div>

          @if (visibleAccountsForCurrentTab().length > 0) {
            <div class="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
              @for (acc of visibleAccountsForCurrentTab(); track acc.id) {
                <button
                  type="button"
                  (click)="selectAccount(acc.id)"
                  [class.bg-slate-900]="currentAccount()?.id === acc.id"
                  [class.text-white]="currentAccount()?.id === acc.id"
                  [class.border-slate-900]="currentAccount()?.id === acc.id"
                  [class.bg-slate-50]="currentAccount()?.id !== acc.id"
                  [class.text-slate-700]="currentAccount()?.id !== acc.id"
                  [class.border-slate-200]="currentAccount()?.id !== acc.id"
                  class="px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2.5 shrink-0 transition-all shadow-2xs cursor-pointer hover:border-slate-400"
                >
                  <mat-icon class="text-base" [class.text-cyan-400]="currentAccount()?.id === acc.id" [class.text-cyan-600]="currentAccount()?.id !== acc.id">
                    {{ defaultDtekAccountId() === acc.id ? 'star' : 'home' }}
                  </mat-icon>
                  <div class="text-left">
                    <div class="font-bold leading-tight flex items-center gap-1.5">
                      <span>{{ acc.name }}</span>
                      @if (defaultDtekAccountId() === acc.id) {
                        <span
                          class="px-1.5 py-0.2 rounded text-3xs font-extrabold uppercase"
                          [class.bg-amber-400]="currentAccount()?.id === acc.id"
                          [class.text-slate-950]="currentAccount()?.id === acc.id"
                          [class.bg-amber-100]="currentAccount()?.id !== acc.id"
                          [class.text-amber-900]="currentAccount()?.id !== acc.id"
                        >
                          За замовч.
                        </span>
                      }
                    </div>
                    <div class="text-3xs opacity-80">
                      @if (acc.accountNumber) {
                        № {{ acc.accountNumber }}
                      }
                      @if (acc.address || (acc.city && acc.street)) {
                        • {{ acc.address || (acc.city + ', ' + acc.street + (acc.houseNum ? ', ' + acc.houseNum : '')) }}
                      }
                    </div>
                  </div>
                </button>
              }
            </div>
          } @else {
            <div class="p-3 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-900 flex items-center justify-between gap-2 flex-wrap">
              <span>Всі будинки приховано на цій вкладці. Натисніть «Повернути», щоб знову відобразити потрібний будинок.</span>
            </div>
          }

          @if (hiddenAccountsForCurrentTab().length > 0 && (showHiddenHousesPanel() || visibleAccountsForCurrentTab().length === 0)) {
            <div class="pt-2 border-t border-slate-100 flex items-center gap-2 flex-wrap">
              <span class="text-2xs font-bold text-slate-500">Приховані будинки:</span>
              @for (hAcc of hiddenAccountsForCurrentTab(); track hAcc.id) {
                <button
                  type="button"
                  (click)="toggleHideHouseInCurrentTab(hAcc.id)"
                  class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border border-slate-200 hover:border-emerald-300 text-2xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Повернути будинок на цю вкладку"
                >
                  <mat-icon class="text-xs text-emerald-600">visibility</mat-icon>
                  <span>{{ hAcc.name }}</span>
                  <span class="text-3xs text-emerald-700 font-bold">(Повернути)</span>
                </button>
              }
            </div>
          }
        </div>
      } @else {
        <!-- Empty State -->
        <div class="p-8 text-center bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <div class="w-14 h-14 rounded-2xl bg-cyan-50 text-cyan-600 flex items-center justify-center mx-auto mb-3">
            <mat-icon class="text-3xl">{{ serviceMode() === 'waste' ? 'delete_outline' : 'water_drop' }}</mat-icon>
          </div>
          <h3 class="text-base font-bold text-slate-900">Немає доданих будинків</h3>
          <p class="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
            Додайте будинок, щоб вести облік показів лічильника води та нарахувань за вивіз сміття.
          </p>
          @if (canEdit()) {
            <button
              type="button"
              (click)="openAccountModal(null)"
              class="px-4 py-2.5 rounded-xl text-xs font-semibold bg-cyan-600 hover:bg-cyan-700 text-white transition-colors inline-flex items-center gap-2 cursor-pointer shadow-sm shadow-cyan-600/20"
            >
              <mat-icon class="text-base">add_business</mat-icon>
              <span>Додати будинок</span>
            </button>
          }
        </div>
      }

      @if (currentAccount(); as acc) {
        <!-- Active Account Details Card -->
        <div class="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <h3 class="text-base font-bold text-slate-900">{{ acc.name }}</h3>
                @if (acc.accountNumber) {
                  <span class="text-2xs text-slate-500 font-mono bg-slate-100 px-2 py-0.5 rounded">
                    Особовий № {{ acc.accountNumber }}
                  </span>
                }
                @if (serviceMode() !== 'waste' && acc.meterNumber) {
                  <span class="text-2xs text-cyan-700 font-mono bg-cyan-50 px-2 py-0.5 rounded border border-cyan-200/60">
                    Лічильник: {{ acc.meterNumber }}
                  </span>
                }
              </div>
              <p class="text-xs text-slate-500 mt-0.5">
                Кількість зареєстрованих осіб: <span class="font-semibold text-slate-700">{{ acc.residentsCount || 1 }}</span>
                @if (acc.address || (acc.city && acc.street)) {
                  • <span class="text-slate-600">{{ acc.address || (acc.city + ', ' + acc.street + (acc.houseNum ? ', буд. ' + acc.houseNum : '')) }}</span>
                }
              </p>
            </div>

            @if (canEdit()) {
              <div class="flex items-center gap-2 flex-wrap">
                @if (serviceMode() === 'waste') {
                  <button
                    type="button"
                    (click)="openWasteAccrualModal()"
                    class="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                  >
                    <mat-icon class="text-sm">delete_outline</mat-icon>
                    <span>+ Нарахувати сміття</span>
                  </button>
                }
                <button
                  type="button"
                  (click)="openAccountModal(acc)"
                  class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 border border-slate-200 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <mat-icon class="text-sm">edit</mat-icon>
                  <span>Редагувати будинок</span>
                </button>
                <button
                  type="button"
                  (click)="confirmDeleteAccount(acc)"
                  class="px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <mat-icon class="text-sm">delete</mat-icon>
                  <span>Видалити</span>
                </button>
              </div>
            }
          </div>

          <!-- Stat Overview Cards -->
          @if (serviceMode() === 'water') {
            <!-- Balance and predictions are cleanly handled by the dedicated banner below -->
          } @else if (serviceMode() === 'waste') {
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <!-- Residents Count -->
              <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <span class="text-3xs font-semibold uppercase tracking-wider text-slate-500 block">Зареєстровано мешканців</span>
                <div class="text-base font-extrabold text-slate-900 mt-1">
                  {{ acc.residentsCount || 1 }} <span class="text-xs font-normal text-slate-500">осіб</span>
                </div>
                <span class="text-3xs text-slate-400 block mt-0.5">
                  Використовується для розрахунку ТПВ
                </span>
              </div>

              <!-- Waste Monthly Charge -->
              <div class="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200/80">
                <span class="text-3xs font-semibold uppercase tracking-wider text-emerald-800 block">Вивіз сміття (місяць)</span>
                <div class="text-base font-extrabold text-emerald-950 mt-1">
                  {{ monthlyWasteCharge() }} <span class="text-xs font-normal text-emerald-700">грн/міс</span>
                </div>
                <span class="text-3xs text-emerald-700 block mt-0.5">
                  {{ acc.residentsCount || 1 }} осіб × {{ currentWasteRate() }} грн
                </span>
              </div>

              <!-- Waste Rate & Effective Date -->
              <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <span class="text-3xs font-semibold uppercase tracking-wider text-slate-500 block">Тариф на сміття</span>
                <div class="text-base font-extrabold text-slate-900 mt-1">
                  {{ currentWasteRate() }} <span class="text-xs font-normal text-slate-500">грн/особа/міс</span>
                </div>
                <span class="text-3xs text-slate-400 block mt-0.5">
                  Діє з {{ formatDate(wasteTariffValidFrom()) }}
                  @if (wasteTariffValidTo()) {
                    до {{ formatDate(wasteTariffValidTo()) }}
                  }
                </span>
              </div>
            </div>
          } @else {
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <!-- Waste Monthly Charge -->
              <div class="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200/80">
                <span class="text-3xs font-semibold uppercase tracking-wider text-emerald-800 block">Вивіз сміття (місяць)</span>
                <div class="text-base font-extrabold text-emerald-950 mt-1">
                  {{ monthlyWasteCharge() }} <span class="text-xs font-normal text-emerald-700">грн/міс</span>
                </div>
                <span class="text-3xs text-emerald-700 block mt-0.5">
                  {{ acc.residentsCount || 1 }} осіб × {{ currentWasteRate() }} грн
                </span>
              </div>

              <!-- Waste Rate & Effective Date -->
              <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <span class="text-3xs font-semibold uppercase tracking-wider text-slate-500 block">Тариф на сміття</span>
                <div class="text-base font-extrabold text-slate-900 mt-1">
                  {{ currentWasteRate() }} <span class="text-xs font-normal text-slate-500">грн/міс</span>
                </div>
                <span class="text-3xs text-slate-400 block mt-0.5">
                  Діє з {{ formatDate(wasteTariffValidFrom()) }}
                  @if (wasteTariffValidTo()) {
                    до {{ formatDate(wasteTariffValidTo()) }}
                  }
                </span>
              </div>
            </div>
          }

          <!-- Water Account Balance Prediction Banner (only on Water or All mode) -->
          @if (serviceMode() !== 'waste' && waterPrediction(); as pred) {
            <div class="p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-cyan-950 to-slate-900 text-white shadow-md border border-cyan-800/60 space-y-3">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-cyan-800/60">
                <div class="flex items-center gap-2.5">
                  <div class="w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-300 flex items-center justify-center border border-cyan-400/30">
                    <mat-icon>insights</mat-icon>
                  </div>
                  <div>
                    <h4 class="text-sm font-bold text-white flex items-center gap-2">
                      Прогноз залишку коштів та показів лічильника
                    </h4>
                    <p class="text-3xs text-cyan-200">
                      Динамічний відрахунок щомісячної абоноплати та вартості використаної води від залишку
                    </p>
                  </div>
                </div>
                @if (canEdit()) {
                  <button
                    type="button"
                    (click)="openQuickBalanceModal()"
                    class="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-sm shrink-0 self-start sm:self-auto"
                  >
                    <mat-icon class="text-sm">account_balance_wallet</mat-icon>
                    <span>Змінити залишок ({{ (acc.balanceUah || 0).toFixed(2) }} грн)</span>
                  </button>
                }
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div class="p-3 bg-white/5 rounded-xl border border-white/10">
                  <span class="text-3xs text-cyan-200 block uppercase tracking-wider font-semibold">Баланс рахунку</span>
                  <div class="text-lg font-extrabold text-emerald-300 mt-0.5">
                    {{ pred.balanceUah.toFixed(2) }} грн
                  </div>
                  <div class="text-3xs text-slate-300 mt-1">
                    Абонплата: <span class="font-bold text-cyan-200">{{ pred.monthlyFee }} грн/міс</span>
                  </div>
                </div>

                <div class="p-3 bg-cyan-500/10 rounded-xl border border-cyan-400/30">
                  <span class="text-3xs text-cyan-200 block uppercase tracking-wider font-semibold">Доступно води</span>
                  <div class="text-lg font-extrabold text-cyan-300 mt-0.5">
                    +{{ pred.availableM3 }} м³
                  </div>
                  <div class="text-3xs text-cyan-200 mt-1">
                    Після абонплати ({{ pred.usableBalanceForWater.toFixed(2) }} грн)
                  </div>
                </div>

                <div class="p-3 bg-emerald-500/10 rounded-xl border border-emerald-400/30">
                  <span class="text-3xs text-emerald-200 block uppercase tracking-wider font-semibold">Вистачить до показника</span>
                  <div class="text-xl font-black text-emerald-300 mt-0.5 font-mono">
                    {{ pred.predictedReadingM3 }} м³
                  </div>
                  <div class="text-3xs text-emerald-200 mt-1 font-medium">
                    (поточні покази: <span class="font-mono font-bold text-white">{{ pred.currentReadingM3 }} м³</span>)
                  </div>
                </div>
              </div>

              @if (pred.estimatedDaysCovered && pred.estimatedDaysCovered > 0) {
                <div class="p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between text-2xs text-cyan-100 flex-wrap gap-2">
                  <div class="flex items-center gap-2">
                    <mat-icon class="text-cyan-400 text-sm">schedule</mat-icon>
                    <span>
                      Орієнтовно залишку вистачить ще на <strong>~{{ pred.estimatedDaysCovered }} днів</strong> (до {{ formatDate(pred.estimatedDate) }}).
                    </span>
                  </div>
                  @if (pred.dailyAvgM3) {
                    <span class="text-3xs text-slate-300 font-mono">
                      Середній темп: {{ Math.round((pred.dailyAvgM3 * 1000)) }} л/день
                    </span>
                  }
                </div>
              }
            </div>
          }
        </div>

        <!-- Mode Switcher: Table History vs Analytics (only when not in waste-only mode) -->
        @if (serviceMode() !== 'waste') {
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-slate-200/90 shadow-2xs">
            <div class="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-semibold">
              <button
                type="button"
                (click)="activeMode.set('table')"
                [class.bg-white]="activeMode() === 'table'"
                [class.text-slate-900]="activeMode() === 'table'"
                [class.shadow-2xs]="activeMode() === 'table'"
                [class.text-slate-600]="activeMode() !== 'table'"
                class="px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <mat-icon class="text-base text-cyan-600">table_chart</mat-icon>
                <span>Журнал показів води ({{ accountReadings().length }})</span>
              </button>
              <button
                type="button"
                (click)="activeMode.set('analytics')"
                [class.bg-white]="activeMode() === 'analytics'"
                [class.text-slate-900]="activeMode() === 'analytics'"
                [class.shadow-2xs]="activeMode() === 'analytics'"
                [class.text-slate-600]="activeMode() !== 'analytics'"
                class="px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <mat-icon class="text-base text-indigo-600">query_stats</mat-icon>
                <span>Графіки та статистика споживання</span>
              </button>
            </div>

            @if (activeMode() === 'table') {
              <div class="flex items-center bg-slate-100 p-0.5 rounded-xl text-xs font-semibold text-slate-600 overflow-x-auto">
                <button
                  type="button"
                  (click)="filterType.set('all')"
                  [class.bg-white]="filterType() === 'all'"
                  [class.text-slate-900]="filterType() === 'all'"
                  [class.shadow-2xs]="filterType() === 'all'"
                  class="px-2.5 py-1 rounded-lg cursor-pointer transition-all"
                >
                  Всі ({{ accountReadings().length }})
                </button>
                <button
                  type="button"
                  (click)="filterType.set('water')"
                  [class.bg-white]="filterType() === 'water'"
                  [class.text-cyan-900]="filterType() === 'water'"
                  [class.shadow-2xs]="filterType() === 'water'"
                  class="px-2.5 py-1 rounded-lg cursor-pointer transition-all flex items-center gap-1"
                >
                  <mat-icon class="text-xs leading-none text-cyan-600">water_drop</mat-icon>
                  Розрахункові
                </button>
                <button
                  type="button"
                  (click)="filterType.set('water_control')"
                  [class.bg-white]="filterType() === 'water_control'"
                  [class.text-indigo-900]="filterType() === 'water_control'"
                  [class.shadow-2xs]="filterType() === 'water_control'"
                  class="px-2.5 py-1 rounded-lg cursor-pointer transition-all flex items-center gap-1"
                >
                  <mat-icon class="text-xs leading-none text-indigo-600">visibility</mat-icon>
                  Контрольні
                </button>
                @if (serviceMode() === 'all') {
                  <button
                    type="button"
                    (click)="filterType.set('waste')"
                    [class.bg-white]="filterType() === 'waste'"
                    [class.text-slate-900]="filterType() === 'waste'"
                    [class.shadow-2xs]="filterType() === 'waste'"
                    class="px-2.5 py-1 rounded-lg cursor-pointer transition-all flex items-center gap-1"
                  >
                    <mat-icon class="text-xs leading-none text-emerald-600">delete_outline</mat-icon>
                    Сміття
                  </button>
                }
              </div>
            }
          </div>
        }

        @if (serviceMode() !== 'waste' && activeMode() === 'analytics') {
          <!-- Water Statistics & Trends Charts -->
          <div class="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 class="text-base font-bold text-slate-900 flex items-center gap-2">
                  <mat-icon class="text-cyan-600">query_stats</mat-icon>
                  <span>Аналітика споживання води та тенденцій</span>
                </h3>
                <p class="text-xs text-slate-500">
                  Середньодобове споживання води в літрах, місячні витрати та динаміка контрольних замірів
                </p>
              </div>
              @if (canEdit()) {
                <button
                  type="button"
                  (click)="openWaterReadingModal(true)"
                  class="px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <mat-icon class="text-sm text-indigo-600">visibility</mat-icon>
                  <span>+ Контрольний замір води</span>
                </button>
              }
            </div>

            <app-water-chart
              [timeline]="waterTimelineData()"
              [monthly]="waterMonthlyData()"
              [stats]="waterStatsKPIs()"
            />
          </div>
        } @else {
          <!-- History Records Table -->
          <div class="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 class="text-base font-bold text-slate-900">
                  {{ serviceMode() === 'waste' ? 'Історія нарахувань за вивіз сміття' : serviceMode() === 'water' ? 'Історія показів води та оплат' : 'Історія нарахувань та оплат' }}
                </h3>
                <p class="text-xs text-slate-500">
                  {{ serviceMode() === 'waste' ? 'Щомісячні нарахування за вивіз твердих побутових відходів (ТПВ)' : 'Покази лічильника води, контрольні заміри та розрахунки' }}
                </p>
              </div>

              <div class="flex items-center gap-2 flex-wrap">
                @if (canEdit()) {
                  <div class="flex items-center gap-2 flex-wrap">
                    @if (serviceMode() !== 'waste') {
                      <button
                        type="button"
                        (click)="openWaterReadingModal(false)"
                        class="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-cyan-600 hover:bg-cyan-700 text-white transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer shrink-0"
                      >
                        <mat-icon class="text-base leading-none">add</mat-icon>
                        <span>Внести покази води</span>
                      </button>
                      <button
                        type="button"
                        (click)="openWaterReadingModal(true)"
                        class="px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-50 border border-indigo-300 text-indigo-900 hover:bg-indigo-100 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer shrink-0"
                        title="Внести контрольний замір води"
                      >
                        <mat-icon class="text-base text-indigo-600 leading-none">visibility</mat-icon>
                        <span>Контрольний замір</span>
                      </button>
                      <button
                        type="button"
                        (click)="openCameraModal()"
                        class="px-3 py-1.5 rounded-xl text-xs font-semibold bg-cyan-50 border border-cyan-300 text-cyan-900 hover:bg-cyan-100 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer shrink-0"
                        title="Сфотографувати лічильник води та розпізнати покази"
                      >
                        <mat-icon class="text-base text-cyan-600 leading-none">photo_camera</mat-icon>
                        <span>Зробити фото</span>
                      </button>
                    }
                    @if (serviceMode() !== 'water') {
                      <button
                        type="button"
                        (click)="openWasteAccrualModal()"
                        class="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer shrink-0"
                      >
                        <mat-icon class="text-base leading-none">delete_outline</mat-icon>
                        <span>Нарахувати сміття</span>
                      </button>
                    }
                  </div>
                }
              </div>
            </div>

            <!-- History Table -->
            @if (filteredReadings().length > 0) {
              <!-- Mobile Card List -->
              <div class="md:hidden space-y-2.5">
                @for (r of filteredReadings(); track r.id) {
                  <div class="p-3.5 rounded-2xl border border-slate-200 bg-white shadow-2xs space-y-2.5">
                    <div class="flex items-start justify-between gap-2">
                      <div class="min-w-0">
                        <div class="flex items-center gap-1.5 flex-wrap">
                          <span class="text-sm font-bold text-slate-900">{{ formatDate(r.date) }}</span>
                          @if (r.isControlOnly) {
                            <span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 text-3xs font-bold border border-indigo-200">
                              <mat-icon class="text-3xs leading-none">visibility</mat-icon> Контрольний
                            </span>
                          }
                        </div>
                        <div class="text-3xs text-slate-400 font-mono mt-0.5">{{ r.periodMonth || r.date.substring(0, 7) }}</div>
                      </div>
                      @if (r.utilityType === 'water') {
                        <span
                          class="px-2 py-0.5 rounded-md text-3xs font-bold uppercase inline-flex items-center gap-1 shrink-0"
                          [class.bg-cyan-100]="!r.isControlOnly"
                          [class.text-cyan-800]="!r.isControlOnly"
                          [class.bg-indigo-100]="r.isControlOnly"
                          [class.text-indigo-800]="r.isControlOnly"
                        >
                          <mat-icon class="text-xs leading-none">{{ r.isControlOnly ? 'visibility' : 'water_drop' }}</mat-icon>
                          {{ r.isControlOnly ? 'Вода (контроль)' : 'Вода' }}
                        </span>
                      } @else {
                        <span class="px-2 py-0.5 rounded-md text-3xs font-bold uppercase inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 shrink-0">
                          <mat-icon class="text-xs leading-none">delete_outline</mat-icon> Сміття
                        </span>
                      }
                    </div>

                    <div class="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                      @if (r.utilityType === 'water') {
                        <div>
                          <div class="text-3xs text-slate-500">Показник</div>
                          <div class="font-mono font-bold text-slate-900">{{ r.readingT1 }} м³</div>
                          <div class="text-3xs text-slate-500 mt-0.5">
                            Спожито: {{ r.consumptionT1 || 0 }} м³
                            @if (r.dailyAvgConsumption && r.dailyAvgConsumption > 0) {
                              <span class="text-emerald-600 font-medium">(~{{ Math.round(r.dailyAvgConsumption * 1000) }} л/д)</span>
                            }
                          </div>
                        </div>
                      } @else {
                        <div>
                          <div class="text-3xs text-slate-500">Нарахування</div>
                          <div class="font-semibold text-slate-800">Абонплата</div>
                          <div class="text-3xs text-slate-400 truncate">{{ r.note || 'Вивіз ТПВ' }}</div>
                        </div>
                      }
                      <div class="text-right">
                        <div class="text-3xs text-slate-500">
                          @if (r.isControlOnly) {
                            Тільки контроль
                          } @else {
                            Тариф: {{ r.rateT1 }} грн{{ r.utilityType === 'water' ? '/м³' : '/міс' }}
                          }
                        </div>
                        @if (r.isControlOnly) {
                          <div class="font-semibold text-slate-400 text-base font-mono mt-0.5">0.00 грн</div>
                          <div class="text-3xs text-indigo-600 font-medium">Без оплати</div>
                        } @else {
                          <div class="font-extrabold text-slate-900 text-base font-mono mt-0.5">{{ formatCost(r.totalCost) }} грн</div>
                        }
                      </div>
                    </div>

                    <div class="flex items-center justify-between gap-2 pt-0.5">
                      <div>
                        @if (r.isControlOnly) {
                          <span class="px-2.5 py-1.5 rounded-full text-2xs font-semibold bg-slate-100 text-slate-600 inline-flex items-center gap-1 border border-slate-200">
                            <mat-icon class="text-xs leading-none">visibility</mat-icon>
                            <span>Моніторинг</span>
                          </span>
                        } @else if (canEdit()) {
                          <button
                            type="button"
                            (click)="togglePaidStatus(r)"
                            class="px-3 py-1.5 rounded-full text-2xs font-bold inline-flex items-center gap-1 cursor-pointer transition-colors min-h-9"
                            [class.bg-emerald-100]="r.isPaid"
                            [class.text-emerald-800]="r.isPaid"
                            [class.hover:bg-emerald-200]="r.isPaid"
                            [class.bg-rose-100]="!r.isPaid"
                            [class.text-rose-800]="!r.isPaid"
                            [class.hover:bg-rose-200]="!r.isPaid"
                          >
                            <mat-icon class="text-xs leading-none">{{ r.isPaid ? 'check_circle' : 'pending' }}</mat-icon>
                            <span>{{ r.isPaid ? 'Сплачено' : 'До сплати' }}</span>
                          </button>
                        } @else {
                          <span
                            class="px-2.5 py-1 rounded-full text-2xs font-bold inline-flex items-center gap-1"
                            [class.bg-emerald-100]="r.isPaid"
                            [class.text-emerald-800]="r.isPaid"
                            [class.bg-rose-100]="!r.isPaid"
                            [class.text-rose-800]="!r.isPaid"
                          >
                            <mat-icon class="text-xs leading-none">{{ r.isPaid ? 'check_circle' : 'pending' }}</mat-icon>
                            <span>{{ r.isPaid ? 'Сплачено' : 'До сплати' }}</span>
                          </span>
                        }
                      </div>
                      @if (canEdit()) {
                        <div class="flex items-center gap-1.5">
                          <button
                            type="button"
                            (click)="r.utilityType === 'water' ? openEditWaterReadingModal(r) : openEditWasteAccrualModal(r)"
                            class="w-9 h-9 rounded-xl text-slate-500 hover:text-cyan-600 bg-slate-100 hover:bg-cyan-50 flex items-center justify-center transition-colors cursor-pointer"
                            title="Редагувати запис"
                          >
                            <mat-icon class="text-base leading-none">edit</mat-icon>
                          </button>
                          <button
                            type="button"
                            (click)="deleteReading(r.id)"
                            class="w-9 h-9 rounded-xl text-slate-500 hover:text-rose-600 bg-slate-100 hover:bg-rose-50 flex items-center justify-center transition-colors cursor-pointer"
                            title="Видалити запис"
                          >
                            <mat-icon class="text-base leading-none">delete</mat-icon>
                          </button>
                        </div>
                      }
                    </div>
                  </div>
                }
              </div>

              <!-- Desktop Table -->
              <div class="hidden md:block overflow-x-auto rounded-xl border border-slate-200">
                <table class="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr class="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-3xs tracking-wider">
                      <th class="py-3 px-3.5">Дата</th>
                      <th class="py-3 px-3.5">Послуга</th>
                      <th class="py-3 px-3.5">Показник / Обсяг</th>
                      <th class="py-3 px-3.5">Тариф</th>
                      <th class="py-3 px-3.5">Сума до сплати</th>
                      <th class="py-3 px-3.5">Статус</th>
                      @if (canEdit()) {
                        <th class="py-3 px-3.5 text-right">Дії</th>
                      }
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 text-slate-800">
                    @for (r of filteredReadings(); track r.id) {
                      <tr class="hover:bg-slate-50/80 transition-colors">
                        <!-- Date -->
                        <td class="py-3 px-3.5 whitespace-nowrap">
                          <div class="flex items-center gap-1.5">
                            <div class="font-bold text-slate-900">{{ formatDate(r.date) }}</div>
                            @if (r.isControlOnly) {
                              <span class="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800 text-3xs font-bold border border-indigo-200">
                                <mat-icon class="text-3xs leading-none">visibility</mat-icon> Контрольний
                              </span>
                            }
                          </div>
                          <div class="text-3xs text-slate-400 font-mono">{{ r.periodMonth || r.date.substring(0, 7) }}</div>
                        </td>

                        <!-- Service Type -->
                        <td class="py-3 px-3.5 whitespace-nowrap">
                          @if (r.utilityType === 'water') {
                            <span
                              class="px-2.5 py-1 rounded-md text-3xs font-bold uppercase inline-flex items-center gap-1"
                              [class.bg-cyan-100]="!r.isControlOnly"
                              [class.text-cyan-800]="!r.isControlOnly"
                              [class.bg-indigo-100]="r.isControlOnly"
                              [class.text-indigo-800]="r.isControlOnly"
                            >
                              <mat-icon class="text-xs leading-none">{{ r.isControlOnly ? 'visibility' : 'water_drop' }}</mat-icon>
                              {{ r.isControlOnly ? 'Вода (контроль)' : 'Вода' }}
                            </span>
                          } @else {
                            <span class="px-2.5 py-1 rounded-md text-3xs font-bold uppercase inline-flex items-center gap-1 bg-emerald-100 text-emerald-800">
                              <mat-icon class="text-xs leading-none">delete_outline</mat-icon> Сміття
                            </span>
                          }
                        </td>

                        <!-- Volume / Reading -->
                        <td class="py-3 px-3.5 whitespace-nowrap">
                          @if (r.utilityType === 'water') {
                            <div class="font-mono text-xs font-bold text-slate-900">
                              Показник: {{ r.readingT1 }} м³
                            </div>
                            <div class="text-3xs text-slate-500">
                              Спожито: {{ r.consumptionT1 || 0 }} м³
                              @if (r.dailyAvgConsumption && r.dailyAvgConsumption > 0) {
                                <span class="text-emerald-600 font-medium ml-1">
                                  (~{{ Math.round(r.dailyAvgConsumption * 1000) }} л/день)
                                </span>
                              }
                            </div>
                          } @else {
                            <div class="font-semibold text-slate-700">
                              Абонплата за місяць
                            </div>
                            <div class="text-3xs text-slate-400">
                              {{ r.note || 'Вивіз твердих побутових відходів' }}
                            </div>
                          }
                        </td>

                        <!-- Applied Rate -->
                        <td class="py-3 px-3.5 whitespace-nowrap">
                          @if (r.isControlOnly) {
                            <span class="text-2xs text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded font-medium border border-indigo-200/60 inline-flex items-center gap-1">
                              <mat-icon class="text-3xs">query_stats</mat-icon> Тільки контроль
                            </span>
                          } @else {
                            <span class="text-xs font-semibold text-slate-700">
                              {{ r.rateT1 }} грн{{ r.utilityType === 'water' ? '/м³' : '/міс' }}
                            </span>
                          }
                        </td>

                        <!-- Total Cost -->
                        <td class="py-3 px-3.5 whitespace-nowrap">
                          @if (r.isControlOnly) {
                            <span class="font-semibold text-slate-400 text-sm">
                              0.00 грн
                            </span>
                            <div class="text-3xs text-indigo-600 font-medium">Без оплати</div>
                          } @else {
                            <span class="font-bold text-slate-900 text-sm">
                              {{ formatCost(r.totalCost) }} грн
                            </span>
                          }
                        </td>

                        <!-- Status & Pay Toggle -->
                        <td class="py-3 px-3.5 whitespace-nowrap">
                          @if (r.isControlOnly) {
                            <span class="px-2.5 py-1 rounded-full text-2xs font-semibold bg-slate-100 text-slate-600 inline-flex items-center gap-1 border border-slate-200">
                              <mat-icon class="text-xs leading-none">visibility</mat-icon>
                              <span>Моніторинг</span>
                            </span>
                          } @else if (canEdit()) {
                            <button
                              type="button"
                              (click)="togglePaidStatus(r)"
                              class="px-2.5 py-1 rounded-full text-2xs font-bold inline-flex items-center gap-1 cursor-pointer transition-colors"
                              [class.bg-emerald-100]="r.isPaid"
                              [class.text-emerald-800]="r.isPaid"
                              [class.hover:bg-emerald-200]="r.isPaid"
                              [class.bg-rose-100]="!r.isPaid"
                              [class.text-rose-800]="!r.isPaid"
                              [class.hover:bg-rose-200]="!r.isPaid"
                            >
                              <mat-icon class="text-xs leading-none">{{ r.isPaid ? 'check_circle' : 'pending' }}</mat-icon>
                              <span>{{ r.isPaid ? 'Сплачено' : 'До сплати' }}</span>
                            </button>
                          } @else {
                            <span
                              class="px-2.5 py-1 rounded-full text-2xs font-bold inline-flex items-center gap-1"
                              [class.bg-emerald-100]="r.isPaid"
                              [class.text-emerald-800]="r.isPaid"
                              [class.bg-rose-100]="!r.isPaid"
                              [class.text-rose-800]="!r.isPaid"
                            >
                              <mat-icon class="text-xs leading-none">{{ r.isPaid ? 'check_circle' : 'pending' }}</mat-icon>
                              <span>{{ r.isPaid ? 'Сплачено' : 'До сплати' }}</span>
                            </span>
                          }
                        </td>

                        <!-- Actions -->
                        @if (canEdit()) {
                          <td class="py-3 px-3.5 whitespace-nowrap text-right">
                            <button
                              type="button"
                              (click)="r.utilityType === 'water' ? openEditWaterReadingModal(r) : openEditWasteAccrualModal(r)"
                              class="p-1 rounded-lg text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 transition-colors cursor-pointer mr-1"
                              title="Редагувати запис"
                            >
                              <mat-icon class="text-base leading-none">edit</mat-icon>
                            </button>
                            <button
                              type="button"
                              (click)="deleteReading(r.id)"
                              class="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Видалити запис"
                            >
                              <mat-icon class="text-base leading-none">delete</mat-icon>
                            </button>
                          </td>
                        }
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <div class="py-10 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300">
                <mat-icon class="text-3xl text-slate-400 mb-1">history</mat-icon>
                <div class="text-xs font-semibold text-slate-600">Записів за обраним фільтром не знайдено</div>
                <p class="text-3xs text-slate-400 mt-0.5">Внесіть перші дані лічильника вручну або сфотографуйте табло.</p>
                @if (canEdit()) {
                  <div class="flex items-center justify-center gap-2 mt-3">
                    <button
                      type="button"
                      (click)="openWaterReadingModal(false)"
                      class="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-cyan-600 hover:bg-cyan-700 text-white transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <mat-icon class="text-base leading-none">add</mat-icon>
                      <span>Внести покази</span>
                    </button>
                    <button
                      type="button"
                      (click)="openCameraModal()"
                      class="px-3 py-1.5 rounded-xl text-xs font-semibold bg-cyan-50 border border-cyan-300 text-cyan-900 hover:bg-cyan-100 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <mat-icon class="text-base text-cyan-600 leading-none">photo_camera</mat-icon>
                      <span>Зробити фото</span>
                    </button>
                  </div>
                }
              </div>
            }
          </div>
        }
      }
    </div>

    <!-- ======================================================== -->
    <!-- MODAL: ADD / EDIT UTILITY ACCOUNT                        -->
    <!-- ======================================================== -->
    @if (isAccountModalOpen()) {
      <div class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4 flex items-end sm:items-center justify-center">
        <div class="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[calc(100dvh-2rem)] pb-safe sm:pb-0 animate-in fade-in duration-150 sm:my-auto">
          <div class="sm:hidden flex justify-center pt-2.5 pb-1 bg-slate-50 shrink-0">
            <div class="w-10 h-1 rounded-full bg-slate-300"></div>
          </div>
          <!-- Pinned Header -->
          <div class="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 bg-slate-50 shrink-0">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-xl bg-cyan-600 text-white flex items-center justify-center shrink-0">
                <mat-icon>home</mat-icon>
              </div>
              <h3 class="text-base font-bold text-slate-900">
                {{ editingAccount() ? 'Редагувати особовий рахунок' : 'Новий особовий рахунок (Вода та Сміття)' }}
              </h3>
            </div>
            <button
              type="button"
              (click)="closeAccountModal()"
              class="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center cursor-pointer transition-colors"
            >
              <mat-icon class="text-lg">close</mat-icon>
            </button>
          </div>

          <!-- Form with scrollable body and pinned footer -->
          <form [formGroup]="accountForm" (ngSubmit)="saveAccount()" class="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div class="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 overscroll-contain">
              <!-- Account Name -->
              <div>
                <label for="acc-name" class="block text-xs font-semibold text-slate-700 mb-1">
                  Назва об'єкта / акаунта *
                </label>
                <input
                  id="acc-name"
                  type="text"
                  formControlName="name"
                  placeholder="Квартира (вул. Франка), Будинок або Дача"
                  class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-cyan-600"
                />
              </div>

              <!-- Account Number & Meter Number -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label for="acc-num" class="block text-xs font-semibold text-slate-700 mb-1">
                    Особовий рахунок *
                  </label>
                  <input
                    id="acc-num"
                    type="text"
                    formControlName="accountNumber"
                    placeholder="04510098"
                    class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-medium text-slate-900 focus:outline-none focus:border-cyan-600"
                  />
                </div>
                <div>
                  <label for="acc-meter" class="block text-xs font-semibold text-slate-700 mb-1">
                    Номер лічильника води
                  </label>
                  <input
                    id="acc-meter"
                    type="text"
                    formControlName="meterNumber"
                    placeholder="№ 459102"
                    class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-medium text-slate-900 focus:outline-none focus:border-cyan-600"
                  />
                </div>
              </div>

              <!-- Address & Residents -->
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div class="sm:col-span-2">
                  <label for="acc-addr" class="block text-xs font-semibold text-slate-700 mb-1">
                    Адреса
                  </label>
                  <input
                    id="acc-addr"
                    type="text"
                    formControlName="address"
                    placeholder="м. Львів, вул. Франка, 15"
                    class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-cyan-600"
                  />
                </div>
                <div>
                  <label for="acc-res" class="block text-xs font-semibold text-slate-700 mb-1">
                    Кількість осіб
                  </label>
                  <input
                    id="acc-res"
                    type="number"
                    inputmode="numeric"
                    min="1"
                    formControlName="residentsCount"
                    class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-cyan-600"
                  />
                </div>
              </div>

              <!-- Initial Water Reading & Balance -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <label for="acc-init-water" class="text-3xs font-bold uppercase tracking-wider text-slate-600 block">
                    Початковий показник (м³)
                  </label>
                  <input
                    id="acc-init-water"
                    type="number"
                    inputmode="decimal"
                    min="0"
                    step="0.01"
                    formControlName="initialReadingWater"
                    placeholder="0"
                    class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-cyan-600"
                  />
                </div>
                <div class="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200/80 space-y-1">
                  <label for="acc-balance" class="text-3xs font-bold uppercase tracking-wider text-emerald-800 block">
                    Залишок коштів (грн)
                  </label>
                  <input
                    id="acc-balance"
                    type="number"
                    inputmode="decimal"
                    step="0.01"
                    formControlName="balanceUah"
                    placeholder="0"
                    class="w-full px-3 py-2 bg-white border border-emerald-300 rounded-lg text-xs font-mono font-bold text-emerald-950 focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              <!-- Active Database Tariffs Preview -->
              <div class="p-3.5 bg-cyan-50/70 border border-cyan-200/80 rounded-xl space-y-1.5">
                <div class="flex items-center gap-1.5 text-xs font-bold text-cyan-950">
                  <mat-icon class="text-sm text-cyan-700">info</mat-icon>
                  <span>Діючі тарифи з бази даних для цього акаунта</span>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                  <div class="bg-white/80 p-2.5 rounded-lg border border-cyan-100">
                    <span class="text-3xs text-slate-500 block">Тариф на воду:</span>
                    <span class="font-mono font-extrabold text-cyan-900 text-sm">{{ currentWaterRate() }} грн/м³</span>
                    <span class="text-3xs text-slate-400 block mt-0.5">
                      Абонплата: {{ currentWaterMonthlyFee() }} грн/міс
                    </span>
                  </div>
                  <div class="bg-white/80 p-2.5 rounded-lg border border-cyan-100">
                    <span class="text-3xs text-slate-500 block">Тариф на вивіз сміття:</span>
                    <span class="font-mono font-extrabold text-emerald-900 text-sm">{{ currentWasteRate() }} грн/особа/міс</span>
                    <span class="text-3xs text-slate-400 block mt-0.5">Діє з {{ formatDate(wasteTariffValidFrom()) }}</span>
                  </div>
                </div>
                <p class="text-3xs text-slate-500 pt-0.5">
                  Тарифи підтягуються безпосередньо з бази даних та діють для всіх розрахунків і нарахувань.
                </p>
              </div>

              <!-- Notes -->
              <div>
                <label for="acc-notes" class="block text-xs font-semibold text-slate-700 mb-1">
                  Примітки
                </label>
                <input
                  id="acc-notes"
                  type="text"
                  formControlName="notes"
                  placeholder="Додаткова інформація"
                  class="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-cyan-600"
                />
              </div>
            </div>

            <!-- Pinned Footer -->
            <div class="flex items-center justify-end gap-2.5 p-4 border-t border-slate-200 bg-slate-50/90 shrink-0">
              <button
                type="button"
                (click)="closeAccountModal()"
                class="px-4 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Скасувати
              </button>
              <button
                type="submit"
                [disabled]="accountForm.invalid || isSubmitting()"
                class="px-4 py-2 rounded-xl text-xs font-semibold bg-cyan-600 hover:bg-cyan-700 text-white transition-colors cursor-pointer disabled:opacity-50"
              >
                {{ editingAccount() ? 'Оновити акаунт' : 'Зберегти акаунт' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- ======================================================== -->
    <!-- MODAL: ADD WATER METER READING (BILLING OR CONTROL)      -->
    <!-- ======================================================== -->
    @if (isWaterModalOpen()) {
      <div class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4 flex items-end sm:items-center justify-center">
        <div class="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[calc(100dvh-2rem)] pb-safe sm:pb-0 animate-in fade-in duration-150 sm:my-auto">
          <div class="sm:hidden flex justify-center pt-2.5 pb-1 bg-slate-50 shrink-0">
            <div class="w-10 h-1 rounded-full bg-slate-300"></div>
          </div>
          <!-- Pinned Header -->
          <div class="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 bg-slate-50 shrink-0">
            <div class="flex items-center gap-2.5">
              <div
                class="w-9 h-9 rounded-xl text-white flex items-center justify-center shrink-0"
                [class.bg-cyan-600]="!waterForm.get('isControlOnly')?.value"
                [class.bg-indigo-600]="waterForm.get('isControlOnly')?.value"
              >
                <mat-icon>{{ waterForm.get('isControlOnly')?.value ? 'visibility' : 'water_drop' }}</mat-icon>
              </div>
              <div>
                <h3 class="text-base font-bold text-slate-900">
                  @if (editingReadingId()) {
                    {{ waterForm.get('isControlOnly')?.value ? 'Редагувати контрольний замір води' : 'Редагувати покази лічильника води' }}
                  } @else {
                    {{ waterForm.get('isControlOnly')?.value ? 'Контрольний замір води' : 'Внесення показів лічильника води' }}
                  }
                </h3>
                <p class="text-2xs text-slate-500">{{ currentAccount()?.name }} • Лічильник № {{ currentAccount()?.meterNumber || currentAccount()?.accountNumber }}</p>
              </div>
            </div>
            <button
              type="button"
              (click)="closeWaterModal()"
              class="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center cursor-pointer transition-colors"
            >
              <mat-icon class="text-lg">close</mat-icon>
            </button>
          </div>

          <!-- Form with scrollable body and pinned footer -->
          <form [formGroup]="waterForm" (ngSubmit)="saveWaterReading()" class="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div class="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 overscroll-contain">
              <!-- Purpose Selection: Billing vs Control Only -->
              <div class="space-y-1.5">
                <span class="block text-xs font-semibold text-slate-700">Призначення показу *</span>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label
                    class="p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all"
                    [class.border-cyan-600]="!waterForm.get('isControlOnly')?.value"
                    [class.bg-cyan-50/70]="!waterForm.get('isControlOnly')?.value"
                    [class.border-slate-200]="waterForm.get('isControlOnly')?.value"
                  >
                    <input
                      type="radio"
                      [value]="false"
                      formControlName="isControlOnly"
                      (change)="recalcWaterCost()"
                      class="mt-0.5 text-cyan-600 focus:ring-cyan-600"
                    />
                    <div>
                      <div class="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <span>💧 Розрахунковий</span>
                        <span class="text-3xs text-cyan-800 bg-cyan-100 px-1.5 py-0.2 rounded font-bold">Для оплати</span>
                      </div>
                      <div class="text-3xs text-slate-500 mt-0.5">Офіційний білінг та нарахування до сплати</div>
                    </div>
                  </label>

                  <label
                    class="p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all"
                    [class.border-indigo-500]="waterForm.get('isControlOnly')?.value"
                    [class.bg-indigo-50/70]="waterForm.get('isControlOnly')?.value"
                    [class.border-slate-200]="!waterForm.get('isControlOnly')?.value"
                  >
                    <input
                      type="radio"
                      [value]="true"
                      formControlName="isControlOnly"
                      (change)="recalcWaterCost()"
                      class="mt-0.5 text-indigo-600 focus:ring-indigo-600"
                    />
                    <div>
                      <div class="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <span>👁️ Контрольний</span>
                        <span class="text-3xs text-indigo-800 bg-indigo-100 px-1.5 py-0.2 rounded font-bold">Без оплати</span>
                      </div>
                      <div class="text-3xs text-slate-500 mt-0.5">Для аналізу тенденцій та розрахунку темпу (л/день)</div>
                    </div>
                  </label>
                </div>
              </div>

              <!-- Informational Banner for Control Readings -->
              @if (waterForm.get('isControlOnly')?.value) {
                <div class="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs flex items-start gap-2">
                  <mat-icon class="text-indigo-600 shrink-0 text-base">info</mat-icon>
                  <div class="text-2xs leading-relaxed">
                    <strong>Контрольний показник води:</strong> використовується виключно для графіків, відстеження тенденцій та розрахунку середньодобового темпу (літрів/добу). <strong>Плата не нараховується (0.00 грн)</strong>, а наступний розрахунковий показник автоматично охопить весь об'єм з моменту останньої оплати.
                  </div>
                </div>
              }

              <!-- Date -->
              <div>
                <label for="water-date" class="block text-xs font-semibold text-slate-700 mb-1">
                  Дата зняття показів *
                </label>
                <input
                  id="water-date"
                  type="date"
                  formControlName="date"
                  (change)="recalcWaterCost()"
                  class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-cyan-600"
                />
              </div>

              <!-- Previous reading display -->
              <div
                class="p-3 border rounded-xl flex items-center justify-between text-xs"
                [class.bg-cyan-50/70]="!waterForm.get('isControlOnly')?.value"
                [class.border-cyan-200/80]="!waterForm.get('isControlOnly')?.value"
                [class.bg-indigo-50/70]="waterForm.get('isControlOnly')?.value"
                [class.border-indigo-200/80]="waterForm.get('isControlOnly')?.value"
              >
                <span class="text-slate-600">
                  {{ waterForm.get('isControlOnly')?.value ? 'Попередній показник для розрахунку темпу:' : 'Попередній розрахунковий показник:' }}
                </span>
                <span class="font-mono font-bold" [class.text-cyan-900]="!waterForm.get('isControlOnly')?.value" [class.text-indigo-900]="waterForm.get('isControlOnly')?.value">
                  {{ activePrevWaterReading() }} м³
                </span>
              </div>

              <!-- Current Reading with Camera Button -->
              <div>
                <div class="flex items-center justify-between pb-1">
                  <label for="water-reading" class="block text-xs font-semibold text-slate-700">
                    Поточний показник лічильника води (м³) *
                  </label>
                  <button
                    type="button"
                    (click)="openCameraModal()"
                    class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-cyan-50 hover:bg-cyan-100 text-cyan-900 border border-cyan-300 transition-colors cursor-pointer shadow-2xs"
                    title="Сфотографувати лічильник води для автоматичного заповнення"
                  >
                    <mat-icon class="text-sm text-cyan-600 leading-none">photo_camera</mat-icon>
                    <span>Зробити фото</span>
                  </button>
                </div>
                <input
                  id="water-reading"
                  type="number"
                  inputmode="decimal"
                  step="0.01"
                  min="0"
                  formControlName="reading"
                  (input)="recalcWaterCost()"
                  placeholder="Введіть показник"
                  class="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-base font-mono font-extrabold text-slate-900 focus:outline-none focus:border-cyan-600"
                />
              </div>

              <!-- Calculation Preview -->
              <div class="p-4 rounded-xl bg-slate-900 text-white space-y-2">
                <div class="flex items-center justify-between text-xs text-slate-300">
                  <span>Спожито води:</span>
                  <span class="font-mono font-bold text-cyan-300">
                    {{ formWaterConsumption() }} м³ ({{ Math.round(formWaterConsumption() * 1000) }} л)
                  </span>
                </div>
                @if (!waterForm.get('isControlOnly')?.value) {
                  <div class="flex items-center justify-between text-xs text-slate-300">
                    <span>Діючий тариф:</span>
                    <span class="font-mono text-slate-300">{{ activeWaterRateForDate() }} грн/м³</span>
                  </div>
                  <div class="flex items-center justify-between pt-2 border-t border-slate-800 text-sm font-bold">
                    <span>До сплати за воду:</span>
                    <span class="text-lg font-mono font-extrabold text-cyan-400">{{ formWaterCost().toFixed(2) }} грн</span>
                  </div>
                } @else {
                  <div class="flex items-center justify-between pt-2 border-t border-slate-800 text-sm font-bold">
                    <span>До сплати:</span>
                    <span class="text-base font-mono font-bold text-indigo-300">0.00 грн (тільки аналіз)</span>
                  </div>
                }
              </div>

              <!-- Paid status (Only for billing readings) -->
              @if (!waterForm.get('isControlOnly')?.value) {
                <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                  <div>
                    <label for="water-ispaid" class="text-xs font-bold text-slate-900 block cursor-pointer">
                      Позначити одразу як сплачено
                    </label>
                    <span class="text-3xs text-slate-500">Фіксує оплату в історії</span>
                  </div>
                  <input
                    id="water-ispaid"
                    type="checkbox"
                    formControlName="isPaid"
                    class="w-4 h-4 text-cyan-600 rounded focus:ring-cyan-500 cursor-pointer"
                  />
                </div>
              }

              <!-- Note -->
              <div>
                <label for="water-note" class="block text-xs font-semibold text-slate-700 mb-1">
                  Примітка (необов'язково)
                </label>
                <input
                  id="water-note"
                  type="text"
                  formControlName="note"
                  placeholder="Наприклад: Контрольна перевірка, або Оплата онлайн"
                  class="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-cyan-600"
                />
              </div>
            </div>

            <!-- Pinned Footer -->
            <div class="flex items-center justify-end gap-2.5 p-4 border-t border-slate-200 bg-slate-50/90 shrink-0">
              <button
                type="button"
                (click)="closeWaterModal()"
                class="px-4 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Скасувати
              </button>
              <button
                type="submit"
                [disabled]="waterForm.invalid || isSubmitting()"
                class="px-4 py-2 rounded-xl text-xs font-semibold text-white transition-colors cursor-pointer disabled:opacity-50"
                [class.bg-cyan-600]="!waterForm.get('isControlOnly')?.value"
                [class.hover:bg-cyan-700]="!waterForm.get('isControlOnly')?.value"
                [class.bg-indigo-600]="waterForm.get('isControlOnly')?.value"
                [class.hover:bg-indigo-700]="waterForm.get('isControlOnly')?.value"
              >
                @if (editingReadingId()) {
                  Зберегти зміни
                } @else if (waterForm.get('isControlOnly')?.value) {
                  Зберегти контрольний замір
                } @else {
                  Зафіксувати покази води
                }
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- ======================================================== -->
    <!-- MODAL: WASTE MONTHLY ACCRUAL                             -->
    <!-- ======================================================== -->
    @if (isWasteModalOpen()) {
      <div class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4 flex items-end sm:items-center justify-center">
        <div class="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[calc(100dvh-2rem)] pb-safe sm:pb-0 animate-in fade-in duration-150 sm:my-auto">
          <div class="sm:hidden flex justify-center pt-2.5 pb-1 bg-slate-50 shrink-0">
            <div class="w-10 h-1 rounded-full bg-slate-300"></div>
          </div>
          <!-- Pinned Header -->
          <div class="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 bg-slate-50 shrink-0">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <mat-icon>delete_outline</mat-icon>
              </div>
              <h3 class="text-base font-bold text-slate-900">
                {{ editingReadingId() ? 'Редагувати нарахування за сміття' : 'Нарахування за вивіз сміття' }}
              </h3>
            </div>
            <button
              type="button"
              (click)="closeWasteModal()"
              class="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center cursor-pointer transition-colors"
            >
              <mat-icon class="text-lg">close</mat-icon>
            </button>
          </div>

          <!-- Form with scrollable body and pinned footer -->
          <form [formGroup]="wasteForm" (ngSubmit)="saveWasteAccrual()" class="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div class="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 overscroll-contain">
              <!-- Month -->
              <div>
                <label for="waste-month" class="block text-xs font-semibold text-slate-700 mb-1">
                  Період нарахування (Місяць) *
                </label>
                <input
                  id="waste-month"
                  type="month"
                  formControlName="month"
                  class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <!-- Date -->
              <div>
                <label for="waste-date" class="block text-xs font-semibold text-slate-700 mb-1">
                  Дата нарахування *
                </label>
                <input
                  id="waste-date"
                  type="date"
                  formControlName="date"
                  (change)="recalcWasteCost()"
                  class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <!-- Calculation preview -->
              <div class="p-4 rounded-xl bg-slate-900 text-white space-y-2">
                <div class="flex items-center justify-between text-xs text-slate-300">
                  <span>Зареєстровано осіб:</span>
                  <span class="font-bold text-white">{{ currentAccount()?.residentsCount || 1 }}</span>
                </div>
                <div class="flex items-center justify-between text-xs text-slate-300">
                  <span>Тариф за одну особу:</span>
                  <span class="font-mono text-slate-300">{{ activeWasteRateForDate() }} грн/міс</span>
                </div>
                <div class="flex items-center justify-between pt-2 border-t border-slate-800 text-sm font-bold">
                  <span>Нараховано до сплати:</span>
                  <span class="text-lg font-mono font-extrabold text-emerald-400">{{ formWasteCost().toFixed(2) }} грн</span>
                </div>
              </div>

              <!-- Paid status -->
              <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <label for="waste-ispaid" class="text-xs font-bold text-slate-900 block cursor-pointer">
                    Позначити одразу як сплачено
                  </label>
                  <span class="text-3xs text-slate-500">Фіксує оплату в історії</span>
                </div>
                <input
                  id="waste-ispaid"
                  type="checkbox"
                  formControlName="isPaid"
                  class="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 cursor-pointer"
                />
              </div>

              <!-- Note -->
              <div>
                <label for="waste-note" class="block text-xs font-semibold text-slate-700 mb-1">
                  Примітка (необов'язково)
                </label>
                <input
                  id="waste-note"
                  type="text"
                  formControlName="note"
                  placeholder="Додатковий коментар"
                  class="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
                />
              </div>
            </div>

            <!-- Pinned Footer -->
            <div class="flex items-center justify-end gap-2.5 p-4 border-t border-slate-200 bg-slate-50/90 shrink-0">
              <button
                type="button"
                (click)="closeWasteModal()"
                class="px-4 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Скасувати
              </button>
              <button
                type="submit"
                [disabled]="wasteForm.invalid || isSubmitting()"
                class="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer disabled:opacity-50"
              >
                {{ editingReadingId() ? 'Зберегти зміни' : 'Зафіксувати нарахування' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- ======================================================== -->
    <!-- MODAL: QUICK BALANCE UPDATE                              -->
    <!-- ======================================================== -->
    @if (isQuickBalanceModalOpen()) {
      <div class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4 flex items-end sm:items-center justify-center">
        <div class="w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] sm:my-auto pb-safe sm:pb-0 animate-in fade-in duration-150">
          <div class="sm:hidden flex justify-center pt-2.5 pb-1 bg-emerald-50/50 shrink-0">
            <div class="w-10 h-1 rounded-full bg-emerald-300/70"></div>
          </div>
          <div class="flex items-center justify-between p-4 border-b border-slate-200 bg-emerald-50/50">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <mat-icon>account_balance_wallet</mat-icon>
              </div>
              <div>
                <h3 class="text-base font-bold text-slate-900">Залишок коштів на рахунку</h3>
                <p class="text-2xs text-slate-500">{{ currentAccount()?.name }}</p>
              </div>
            </div>
            <button
              type="button"
              (click)="closeQuickBalanceModal()"
              class="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center cursor-pointer transition-colors"
            >
              <mat-icon class="text-lg">close</mat-icon>
            </button>
          </div>

          <div class="p-5 space-y-4">
            <div>
              <label for="quick-balance-input" class="block text-xs font-semibold text-slate-700 mb-1">
                Поточний залишок коштів (грн)
              </label>
              <input
                id="quick-balance-input"
                type="number"
                inputmode="decimal"
                step="0.01"
                [value]="quickBalanceInput()"
                (input)="quickBalanceInput.set(+($any($event.target).value) || 0)"
                placeholder="Вкажіть суму залишку"
                class="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-lg font-mono font-extrabold text-slate-900 focus:outline-none focus:border-emerald-600"
              />
              <p class="text-3xs text-slate-500 mt-1">
                Вкажіть актуальний передплачений залишок коштів водопостачання для розрахунку прогнозу показників.
              </p>
            </div>

            <div class="flex items-center gap-2 pt-1">
              <button
                type="button"
                (click)="quickBalanceInput.set(quickBalanceInput() + 100)"
                class="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-2xs font-bold hover:bg-emerald-100 transition-colors cursor-pointer"
              >
                +100 грн
              </button>
              <button
                type="button"
                (click)="quickBalanceInput.set(quickBalanceInput() + 200)"
                class="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-2xs font-bold hover:bg-emerald-100 transition-colors cursor-pointer"
              >
                +200 грн
              </button>
              <button
                type="button"
                (click)="quickBalanceInput.set(quickBalanceInput() + 500)"
                class="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-2xs font-bold hover:bg-emerald-100 transition-colors cursor-pointer"
              >
                +500 грн
              </button>
              <button
                type="button"
                (click)="quickBalanceInput.set(0)"
                class="px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 text-2xs font-bold hover:bg-slate-200 transition-colors cursor-pointer ml-auto"
              >
                0 грн
              </button>
            </div>
          </div>

          <div class="flex items-center justify-end gap-2.5 p-4 border-t border-slate-200 bg-slate-50">
            <button
              type="button"
              (click)="closeQuickBalanceModal()"
              class="px-4 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Скасувати
            </button>
            <button
              type="button"
              (click)="saveQuickBalance()"
              [disabled]="isSubmitting()"
              class="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              Зберегти залишок
            </button>
          </div>
        </div>
      </div>
    }

    <!-- ======================================================== -->
    <!-- MODAL: CAMERA SCANNER MODAL                              -->
    <!-- ======================================================== -->
    @if (isCameraModalOpen()) {
      <app-meter-camera-modal
        utilityType="water"
        [accountName]="currentAccount()?.name || 'Водопостачання'"
        (closeModal)="closeCameraModal()"
        (readingApplied)="onCameraWaterReadingApplied($event)"
      />
    }
  `,
})
export class WaterWasteView {
  readonly dataService = inject(IptvData);
  readonly serviceMode = input<'water' | 'waste' | 'all'>('all');
  protected readonly Math = Math;

  readonly canEdit = this.dataService.canEdit;
  readonly waterWasteAccounts = this.dataService.waterWasteAccounts;
  readonly isSavingDefaultHouse = this.dataService.isSavingDefaultHouse;
  readonly currentUtilityTab = computed<UtilityServiceTabId>(() => {
    const mode = this.serviceMode();
    return mode === 'waste' ? 'waste' : 'water';
  });
  readonly visibleAccountsForCurrentTab = computed<UtilityAccount[]>(() =>
    this.dataService.getVisibleAccountsForTab(this.currentUtilityTab())
  );
  readonly hiddenAccountsForCurrentTab = computed<UtilityAccount[]>(() =>
    this.dataService.getHiddenAccountsForTab(this.currentUtilityTab())
  );
  readonly defaultDtekAccountId = computed<string>(() => {
    const list =
      this.visibleAccountsForCurrentTab().length > 0
        ? this.visibleAccountsForCurrentTab()
        : this.waterWasteAccounts();
    if (list.length === 1) return list[0].id;
    const userDefault = this.dataService.currentUser()?.defaultUtilityAccountId;
    if (userDefault && list.some((a) => a.id === userDefault)) {
      return userDefault;
    }
    return list[0]?.id || '';
  });
  readonly showHiddenHousesPanel = signal<boolean>(false);
  readonly utilityTariffs = this.dataService.utilityTariffs;

  readonly selectedAccountId = signal<string>('');
  readonly filterType = signal<SubFilterType>('all');
  readonly activeMode = signal<'table' | 'analytics'>('table');

  readonly isAccountModalOpen = signal<boolean>(false);
  readonly editingAccount = signal<UtilityAccount | null>(null);

  readonly isQuickBalanceModalOpen = signal<boolean>(false);
  readonly quickBalanceInput = signal<number>(0);

  readonly isWaterModalOpen = signal<boolean>(false);
  readonly isWasteModalOpen = signal<boolean>(false);
  readonly editingReadingId = signal<string | null>(null);
  readonly formChangeTrigger = signal<number>(0);
  readonly isCameraModalOpen = signal<boolean>(false);
  readonly isSubmitting = signal<boolean>(false);

  // Form calculated values
  readonly formWaterConsumption = signal<number>(0);
  readonly formWaterCost = signal<number>(0);
  readonly activeWaterRateForDate = signal<number>(0);

  readonly formWasteCost = signal<number>(0);
  readonly activeWasteRateForDate = signal<number>(0);

  readonly accountForm = new FormGroup({
    name: new FormControl('', [Validators.required]),
    accountNumber: new FormControl('', [Validators.required]),
    address: new FormControl(''),
    meterNumber: new FormControl(''),
    residentsCount: new FormControl<number>(1, [Validators.min(1)]),
    initialReadingWater: new FormControl<number>(0),
    balanceUah: new FormControl<number>(0),
    notes: new FormControl(''),
  });

  readonly waterForm = new FormGroup({
    date: new FormControl(new Date().toISOString().split('T')[0], [Validators.required]),
    reading: new FormControl<number | null>(null, [Validators.required]),
    isControlOnly: new FormControl<boolean>(false),
    isPaid: new FormControl<boolean>(false),
    note: new FormControl(''),
  });

  readonly wasteForm = new FormGroup({
    month: new FormControl(new Date().toISOString().substring(0, 7), [Validators.required]),
    date: new FormControl(new Date().toISOString().split('T')[0], [Validators.required]),
    isPaid: new FormControl<boolean>(false),
    note: new FormControl(''),
  });

  constructor() {
    const activeDefault = this.dataService.activeDtekAccount();
    const accounts = this.visibleAccountsForCurrentTab();
    if (activeDefault && accounts.some((a) => a.id === activeDefault.id) && !this.selectedAccountId()) {
      this.selectedAccountId.set(activeDefault.id);
    } else if (accounts.length > 0 && !this.selectedAccountId()) {
      this.selectedAccountId.set(accounts[0].id);
    }

    effect(() => {
      const defAcc = this.dataService.activeDtekAccount();
      const currSelected = this.selectedAccountId();
      const list = this.visibleAccountsForCurrentTab();
      if (defAcc && list.some((a) => a.id === defAcc.id) && (!currSelected || !list.some((a) => a.id === currSelected))) {
        untracked(() => {
          this.selectedAccountId.set(defAcc.id);
        });
      }
    });
  }

  async setAsDefaultHouse(accountId: string): Promise<void> {
    this.selectedAccountId.set(accountId);
    await this.dataService.setDefaultUtilityAccount(accountId);
  }

  async toggleHideHouseInCurrentTab(accountId: string): Promise<void> {
    await this.dataService.toggleHouseVisibilityInTab(accountId, this.currentUtilityTab());
    const visible = this.visibleAccountsForCurrentTab();
    if (visible.length > 0 && !visible.some((a) => a.id === this.selectedAccountId())) {
      this.selectedAccountId.set(visible[0].id);
    }
  }

  readonly currentAccount = computed<UtilityAccount | null>(() => {
    const list = this.visibleAccountsForCurrentTab();
    if (list.length === 0) return null;
    const selected = list.find((a) => a.id === this.selectedAccountId());
    return selected || list[0];
  });

  formatCost(value: unknown): string {
    return (Number(value) || 0).toFixed(2);
  }

  readonly accountReadings = computed<UtilityReading[]>(() => {
    const acc = this.currentAccount();
    if (!acc) return [];
    const mode = this.serviceMode();
    return this.dataService
      .utilityReadings()
      .filter((r) => {
        if (r.accountId !== acc.id) return false;
        if (mode === 'water') return r.utilityType === 'water';
        if (mode === 'waste') return r.utilityType === 'waste';
        return r.utilityType === 'water' || r.utilityType === 'waste';
      })
      .sort(
        (a, b) =>
          (b.date || '').localeCompare(a.date || '') ||
          (b.createdAt || '').localeCompare(a.createdAt || '')
      );
  });

  readonly filteredReadings = computed<UtilityReading[]>(() => {
    const list = this.accountReadings();
    const mode = this.serviceMode();
    if (mode === 'waste') {
      return list.filter((r) => r.utilityType === 'waste');
    }
    const f = this.filterType();
    if (f === 'all') return list;
    if (f === 'water') return list.filter((r) => r.utilityType === 'water' && !r.isControlOnly);
    if (f === 'water_control') return list.filter((r) => r.utilityType === 'water' && r.isControlOnly);
    if (f === 'waste') return list.filter((r) => r.utilityType === 'waste');
    return list;
  });

  readonly latestWaterReading = computed<UtilityReading | null>(() => {
    const list = this.accountReadings().filter((r) => r.utilityType === 'water');
    return list.length > 0 ? list[0] : null;
  });

  readonly latestBillingWaterReading = computed<UtilityReading | null>(() => {
    const list = this.accountReadings().filter((r) => r.utilityType === 'water' && !r.isControlOnly);
    return list.length > 0 ? list[0] : null;
  });

  readonly prevBillingWaterReading = computed<number>(() => {
    const latest = this.latestBillingWaterReading();
    if (latest && latest.readingT1 !== undefined && latest.readingT1 !== null) {
      return latest.readingT1;
    }
    const acc = this.currentAccount();
    return acc ? (acc.initialReadingWater || 0) : 0;
  });

  readonly prevAnyWaterReading = computed<number>(() => {
    const latest = this.latestWaterReading();
    if (latest && latest.readingT1 !== undefined && latest.readingT1 !== null) {
      return latest.readingT1;
    }
    const acc = this.currentAccount();
    return acc ? (acc.initialReadingWater || 0) : 0;
  });

  getEffectivePrevWaterReading(isControl: boolean, targetDate: string, excludeId?: string | null): { reading: number; prevDate?: string } {
    const acc = this.currentAccount();
    if (!acc) return { reading: 0 };

    const list = this.accountReadings()
      .filter((r) => r.utilityType === 'water' && (!excludeId || r.id !== excludeId) && (!isControl ? !r.isControlOnly : true))
      .filter((r) => r.date <= targetDate)
      .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));

    const prior = list[0];
    if (prior && prior.readingT1 !== undefined && prior.readingT1 !== null) {
      return { reading: prior.readingT1, prevDate: prior.date };
    }

    return { reading: acc.initialReadingWater || 0 };
  }

  readonly activePrevWaterReading = computed<number>(() => {
    this.formChangeTrigger();
    const isControl = Boolean(this.waterForm.get('isControlOnly')?.value);
    const date = this.waterForm.get('date')?.value || new Date().toISOString().split('T')[0];
    const editId = this.editingReadingId();
    return this.getEffectivePrevWaterReading(isControl, date, editId).reading;
  });

  readonly currentWaterRate = computed<number>(() => {
    const tariffs = this.utilityTariffs();
    const today = new Date().toISOString().split('T')[0];
    return resolveWaterRate(today, tariffs);
  });

  readonly currentWaterMonthlyFee = computed<number>(() => {
    const tariffs = this.utilityTariffs();
    const today = new Date().toISOString().split('T')[0];
    return resolveWaterMonthlyFee(today, tariffs);
  });

  readonly waterTariffValidFrom = computed<string>(() => {
    return this.utilityTariffs().water?.validFrom || '2026-01-01';
  });

  readonly waterTariffValidTo = computed<string>(() => {
    return this.utilityTariffs().water?.validTo || '';
  });

  readonly currentWasteRate = computed<number>(() => {
    const tariffs = this.utilityTariffs();
    const today = new Date().toISOString().split('T')[0];
    return resolveWasteRate(today, tariffs);
  });

  readonly wasteTariffValidFrom = computed<string>(() => {
    return this.utilityTariffs().waste?.validFrom || '2026-01-01';
  });

  readonly wasteTariffValidTo = computed<string>(() => {
    return this.utilityTariffs().waste?.validTo || '';
  });

  readonly monthlyWasteCharge = computed<number>(() => {
    const acc = this.currentAccount();
    const count = acc?.residentsCount || 1;
    return Math.round(count * this.currentWasteRate() * 100) / 100;
  });

  // Dynamic forecast for water account balance
  readonly waterPrediction = computed<WaterPredictionResult | null>(() => {
    const acc = this.currentAccount();
    if (!acc) return null;
    const balance = acc.balanceUah || 0;
    const currentReading = this.prevAnyWaterReading();
    const ratePerM3 = this.currentWaterRate();
    const monthlyFee = this.currentWaterMonthlyFee();

    const kpis = this.waterStatsKPIs();
    const dailyAvgM3 = kpis.avgLitersPerDay > 0 ? kpis.avgLitersPerDay / 1000 : 0.2; // default ~200L/day if no readings

    return calculateWaterPrediction(balance, currentReading, ratePerM3, monthlyFee, dailyAvgM3);
  });

  // Recharts timeline series for water
  readonly waterTimelineData = computed<WaterTimelinePoint[]>(() => {
    const waterReadings = this.accountReadings()
      .filter((r) => r.utilityType === 'water')
      .sort((a, b) => a.date.localeCompare(b.date));

    const acc = this.currentAccount();
    if (!acc || waterReadings.length === 0) return [];

    const result: WaterTimelinePoint[] = [];
    let lastAny = acc.initialReadingWater || 0;
    let lastDate = waterReadings[0].date;

    for (let i = 0; i < waterReadings.length; i++) {
      const r = waterReadings[i];
      const curVal = r.readingT1 !== undefined ? r.readingT1 : lastAny;
      const consM3 = r.consumptionT1 !== undefined ? r.consumptionT1 : Math.max(0, Math.round((curVal - lastAny) * 100) / 100);

      const curMs = new Date(r.date).getTime();
      const prevMs = new Date(i === 0 ? r.date : lastDate).getTime();
      const diffDays = Math.max(1, Math.round((curMs - prevMs) / (1000 * 60 * 60 * 24)));
      const litersPerDay = i === 0 ? 0 : Math.round((consM3 * 1000) / diffDays);

      result.push({
        id: r.id,
        date: r.date,
        dateFormatted: formatDateUa(r.date, true),
        isControlOnly: Boolean(r.isControlOnly),
        reading: curVal,
        consumptionM3: consM3,
        litersPerDay,
        days: i === 0 ? 0 : diffDays,
        cost: r.totalCost || 0,
      });

      lastAny = curVal;
      lastDate = r.date;
    }

    return result;
  });

  // Recharts monthly data
  readonly waterMonthlyData = computed<WaterMonthlySummary[]>(() => {
    const all = this.accountReadings();
    const monthsMap = new Map<string, {
      waterM3: number;
      waterCost: number;
      wasteCost: number;
      totalCost: number;
      readingsCount: number;
      controlCount: number;
      billingCount: number;
    }>();

    for (const r of all) {
      const monthKey = r.periodMonth || r.date.substring(0, 7);
      const current = monthsMap.get(monthKey) || {
        waterM3: 0,
        waterCost: 0,
        wasteCost: 0,
        totalCost: 0,
        readingsCount: 0,
        controlCount: 0,
        billingCount: 0,
      };

      if (r.utilityType === 'water') {
        current.waterM3 += r.consumptionT1 || 0;
        current.waterCost += r.totalCost || 0;
        current.readingsCount++;
        if (r.isControlOnly) {
          current.controlCount++;
        } else {
          current.billingCount++;
        }
      } else if (r.utilityType === 'waste') {
        current.wasteCost += r.totalCost || 0;
      }
      current.totalCost += r.totalCost || 0;
      monthsMap.set(monthKey, current);
    }

    const monthNamesUa: Record<string, string> = {
      '01': 'Січень', '02': 'Лютий', '03': 'Березень', '04': 'Квітень',
      '05': 'Травень', '06': 'Червень', '07': 'Липень', '08': 'Серпень',
      '09': 'Вересень', '10': 'Жовтень', '11': 'Листопад', '12': 'Грудень',
    };
    const monthShortsUa: Record<string, string> = {
      '01': 'Січ', '02': 'Лют', '03': 'Бер', '04': 'Кві',
      '05': 'Тра', '06': 'Чер', '07': 'Лип', '08': 'Сер',
      '09': 'Вер', '10': 'Жов', '11': 'Лис', '12': 'Гру',
    };

    const sortedKeys = Array.from(monthsMap.keys()).sort();
    return sortedKeys.map((key) => {
      const parts = key.split('-');
      const y = parts[0];
      const m = parts[1];
      const data = monthsMap.get(key)!;

      return {
        monthKey: key,
        monthName: `${monthNamesUa[m] || m} ${y}`,
        monthShort: `${monthShortsUa[m] || m} ${y.substring(2)}`,
        waterM3: Math.round(data.waterM3 * 100) / 100,
        waterCost: Math.round(data.waterCost * 100) / 100,
        wasteCost: Math.round(data.wasteCost * 100) / 100,
        totalCost: Math.round(data.totalCost * 100) / 100,
        readingsCount: data.readingsCount,
        controlCount: data.controlCount,
        billingCount: data.billingCount,
      };
    });
  });

  // Recharts KPIs & Insights for water
  readonly waterStatsKPIs = computed<WaterStatsKPIs>(() => {
    const timeline = this.waterTimelineData();
    const acc = this.currentAccount();
    const residentsCount = acc?.residentsCount || 1;
    const currentRate = this.currentWaterRate();

    let totalWaterM3AllTime = 0;
    let controlCount = 0;
    let billingCount = 0;

    for (const pt of timeline) {
      totalWaterM3AllTime += pt.consumptionM3;
      if (pt.isControlOnly) {
        controlCount++;
      } else {
        billingCount++;
      }
    }

    // Latest daily rate (liters per day)
    let avgLitersPerDay = 0;
    for (let i = timeline.length - 1; i >= 0; i--) {
      if (timeline[i].litersPerDay > 0) {
        avgLitersPerDay = timeline[i].litersPerDay;
        break;
      }
    }

    const avgLitersPerPersonPerDay = residentsCount > 0 ? Math.round(avgLitersPerDay / residentsCount) : avgLitersPerDay;
    const projectedMonthM3 = Math.round((avgLitersPerDay * 30.5) / 1000 * 10) / 10;
    const projectedMonthCost = Math.round(projectedMonthM3 * currentRate * 100) / 100;

    return {
      avgLitersPerDay,
      avgLitersPerPersonPerDay,
      residentsCount,
      totalWaterM3AllTime: Math.round(totalWaterM3AllTime * 100) / 100,
      projectedMonthM3,
      projectedMonthCost,
      controlCount,
      billingCount,
    };
  });

  selectAccount(id: string): void {
    this.selectedAccountId.set(id);
  }

  formatDate(dateStr?: string): string {
    if (!dateStr) return '';
    return formatDateUa(dateStr, true);
  }

  openQuickBalanceModal(): void {
    const acc = this.currentAccount();
    if (!acc) return;
    this.quickBalanceInput.set(acc.balanceUah || 0);
    this.isQuickBalanceModalOpen.set(true);
  }

  closeQuickBalanceModal(): void {
    this.isQuickBalanceModalOpen.set(false);
  }

  async saveQuickBalance(): Promise<void> {
    const acc = this.currentAccount();
    if (!acc) return;
    this.isSubmitting.set(true);
    try {
      const newBal = Number(this.quickBalanceInput()) || 0;
      await this.dataService.saveUtilityAccount({
        ...acc,
        balanceUah: newBal,
      });
      this.closeQuickBalanceModal();
    } finally {
      this.isSubmitting.set(false);
    }
  }

  openAccountModal(acc: UtilityAccount | null): void {
    this.editingAccount.set(acc);
    if (acc) {
      this.accountForm.patchValue({
        name: acc.name,
        accountNumber: acc.accountNumber,
        address: acc.address || '',
        meterNumber: acc.meterNumber || '',
        residentsCount: acc.residentsCount || 1,
        initialReadingWater: acc.initialReadingWater || 0,
        balanceUah: acc.balanceUah || 0,
        notes: acc.notes || '',
      });
    } else {
      this.accountForm.reset({
        name: '',
        accountNumber: '',
        address: '',
        meterNumber: '',
        residentsCount: 1,
        initialReadingWater: 0,
        balanceUah: 0,
        notes: '',
      });
    }
    this.isAccountModalOpen.set(true);
  }

  closeAccountModal(): void {
    this.isAccountModalOpen.set(false);
    this.editingAccount.set(null);
  }

  async saveAccount(): Promise<void> {
    if (this.accountForm.invalid) return;
    this.isSubmitting.set(true);
    try {
      const formVal = this.accountForm.getRawValue();
      const existing = this.editingAccount();
      const payload: Partial<UtilityAccount> = {
        ...(existing ? existing : {}),
        type: existing?.type || 'water_waste',
        name: formVal.name?.trim() || '',
        accountNumber: formVal.accountNumber?.trim() || '',
        address: formVal.address?.trim() || existing?.address || '',
        meterNumber: formVal.meterNumber?.trim() || existing?.meterNumber || '',
        residentsCount: Math.max(1, Number(formVal.residentsCount) || 1),
        initialReadingWater: Number(formVal.initialReadingWater) || 0,
        balanceUah: Number(formVal.balanceUah) || 0,
        waterEnabled: true,
        wasteEnabled: true,
        electricityTariffType: existing?.electricityTariffType || 'single',
        notes: formVal.notes?.trim() || '',
      };

      const saved = await this.dataService.saveUtilityAccount(payload);
      this.selectedAccountId.set(saved.id);
      this.closeAccountModal();
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async confirmDeleteAccount(acc: UtilityAccount): Promise<void> {
    const ok = await this.dataService.openConfirmDialog({
      title: 'Видалити особовий рахунок?',
      message: `Ви дійсно бажаєте видалити особовий рахунок «${acc.name}» (№ ${acc.accountNumber}) та всі пов'язані з ним записи?`,
      confirmText: 'Видалити',
      cancelText: 'Скасувати',
      tone: 'danger',
      icon: 'delete_forever',
    });
    if (ok) {
      await this.dataService.deleteUtilityAccount(acc.id);
      const remaining = this.waterWasteAccounts();
      if (remaining.length > 0) {
        this.selectedAccountId.set(remaining[0].id);
      }
    }
  }

  openWaterReadingModal(isControl = false): void {
    const acc = this.currentAccount();
    if (!acc) return;

    this.editingReadingId.set(null);
    this.waterForm.reset({
      date: new Date().toISOString().split('T')[0],
      reading: null,
      isControlOnly: isControl,
      isPaid: false,
      note: isControl ? 'Контрольний замір води для аналізу' : '',
    });
    this.formChangeTrigger.update((v) => v + 1);
    this.recalcWaterCost();
    this.isWaterModalOpen.set(true);
  }

  openEditWaterReadingModal(r: UtilityReading): void {
    const acc = this.currentAccount();
    if (!acc) return;

    this.editingReadingId.set(r.id);
    this.waterForm.reset({
      date: r.date,
      reading: r.readingT1,
      isControlOnly: Boolean(r.isControlOnly),
      isPaid: Boolean(r.isPaid),
      note: r.note || '',
    });
    this.formChangeTrigger.update((v) => v + 1);
    this.recalcWaterCost();
    this.isWaterModalOpen.set(true);
  }

  openCameraModal(): void {
    const acc = this.currentAccount();
    if (!acc) return;
    this.isCameraModalOpen.set(true);
  }

  closeCameraModal(): void {
    this.isCameraModalOpen.set(false);
  }

  onCameraWaterReadingApplied(applied: AppliedMeterReading): void {
    const acc = this.currentAccount();
    if (!acc) return;

    this.waterForm.patchValue({
      date: new Date().toISOString().split('T')[0],
      reading: applied.readingWater !== undefined ? applied.readingWater : null,
      isControlOnly: false,
      isPaid: false,
      note: applied.note || 'Розпізнано за фото лічильника',
    });

    this.recalcWaterCost();
    this.isWaterModalOpen.set(true);
  }

  closeWaterModal(): void {
    this.isWaterModalOpen.set(false);
    this.editingReadingId.set(null);
  }

  recalcWaterCost(): void {
    const tariffs = this.utilityTariffs();
    const date = this.waterForm.get('date')?.value || new Date().toISOString().split('T')[0];
    const isControl = Boolean(this.waterForm.get('isControlOnly')?.value);
    const rate = resolveWaterRate(date, tariffs);
    this.activeWaterRateForDate.set(rate);

    this.formChangeTrigger.update((v) => v + 1);

    const val = Number(this.waterForm.get('reading')?.value) || 0;
    const prev = this.getEffectivePrevWaterReading(isControl, date, this.editingReadingId()).reading;
    const diff = Math.max(0, Math.round((val - prev) * 100) / 100);
    this.formWaterConsumption.set(diff);

    if (isControl) {
      this.formWaterCost.set(0);
    } else {
      this.formWaterCost.set(Math.round(diff * rate * 100) / 100);
    }
  }

  async saveWaterReading(): Promise<void> {
    const acc = this.currentAccount();
    if (!acc || this.waterForm.invalid) return;

    this.isSubmitting.set(true);
    try {
      const editId = this.editingReadingId();
      const formVal = this.waterForm.getRawValue();
      const date = formVal.date || new Date().toISOString().split('T')[0];
      const isControlOnly = Boolean(formVal.isControlOnly);
      const tariffs = this.utilityTariffs();
      const rate = resolveWaterRate(date, tariffs);

      const val = Number(formVal.reading) || 0;
      const prevInfo = this.getEffectivePrevWaterReading(isControlOnly, date, editId);
      const diff = Math.max(0, Math.round((val - prevInfo.reading) * 100) / 100);
      const totalCost = isControlOnly ? 0 : Math.round(diff * rate * 100) / 100;

      // Elapsed days and daily pace calculation
      let daysSinceLast = 0;
      let dailyAvg = 0;
      if (prevInfo.prevDate) {
        const curMs = new Date(date).getTime();
        const prevMs = new Date(prevInfo.prevDate).getTime();
        daysSinceLast = Math.max(1, Math.round((curMs - prevMs) / (1000 * 60 * 60 * 24)));
        dailyAvg = Math.round((diff / daysSinceLast) * 1000) / 1000;
      }

      let note = formVal.note?.trim() || '';
      if (isControlOnly && !note) {
        note = 'Контрольний замір води для аналізу';
      }

      const reading: Partial<UtilityReading> = {
        ...(editId ? { id: editId } : {}),
        accountId: acc.id,
        utilityType: 'water',
        date,
        periodMonth: date.substring(0, 7),
        readingT1: val,
        consumptionT1: diff,
        rateT1: isControlOnly ? undefined : rate,
        totalCost,
        isPaid: isControlOnly ? true : Boolean(formVal.isPaid),
        paidDate: isControlOnly ? undefined : (formVal.isPaid ? date : undefined),
        paidAmount: isControlOnly ? 0 : (formVal.isPaid ? totalCost : undefined),
        note,
        isControlOnly,
        readingPurpose: isControlOnly ? 'control' : 'billing',
        daysSinceLastReading: daysSinceLast,
        dailyAvgConsumption: dailyAvg,
      };

      await this.dataService.saveUtilityReading(reading);
      if (isControlOnly && (this.filterType() === 'water' || this.filterType() === 'waste')) {
        this.filterType.set('all');
      } else if (!isControlOnly && (this.filterType() === 'water_control' || this.filterType() === 'waste')) {
        this.filterType.set('all');
      }
      this.closeWaterModal();
    } finally {
      this.isSubmitting.set(false);
    }
  }

  openWasteAccrualModal(): void {
    this.editingReadingId.set(null);
    const now = new Date();
    this.wasteForm.reset({
      month: now.toISOString().substring(0, 7),
      date: now.toISOString().split('T')[0],
      isPaid: false,
      note: '',
    });
    this.recalcWasteCost();
    this.isWasteModalOpen.set(true);
  }

  openEditWasteAccrualModal(r: UtilityReading): void {
    this.editingReadingId.set(r.id);
    this.wasteForm.reset({
      month: r.periodMonth || r.date.substring(0, 7),
      date: r.date,
      isPaid: Boolean(r.isPaid),
      note: r.note || '',
    });
    this.recalcWasteCost();
    this.isWasteModalOpen.set(true);
  }

  closeWasteModal(): void {
    this.isWasteModalOpen.set(false);
    this.editingReadingId.set(null);
  }

  recalcWasteCost(): void {
    const acc = this.currentAccount();
    const tariffs = this.utilityTariffs();
    const date = this.wasteForm.get('date')?.value || new Date().toISOString().split('T')[0];
    const rate = resolveWasteRate(date, tariffs);
    this.activeWasteRateForDate.set(rate);

    const count = acc?.residentsCount || 1;
    this.formWasteCost.set(Math.round(count * rate * 100) / 100);
  }

  async saveWasteAccrual(): Promise<void> {
    const acc = this.currentAccount();
    if (!acc || this.wasteForm.invalid) return;

    this.isSubmitting.set(true);
    try {
      const editId = this.editingReadingId();
      const formVal = this.wasteForm.getRawValue();
      const date = formVal.date || new Date().toISOString().split('T')[0];
      const month = formVal.month || date.substring(0, 7);
      const tariffs = this.utilityTariffs();
      const rate = resolveWasteRate(date, tariffs);
      const count = acc.residentsCount || 1;
      const totalCost = Math.round(count * rate * 100) / 100;

      const reading: Partial<UtilityReading> = {
        ...(editId ? { id: editId } : {}),
        accountId: acc.id,
        utilityType: 'waste',
        date,
        periodMonth: month,
        rateT1: rate,
        totalCost,
        isPaid: Boolean(formVal.isPaid),
        paidDate: formVal.isPaid ? date : undefined,
        paidAmount: formVal.isPaid ? totalCost : undefined,
        note: formVal.note?.trim() || `Вивіз сміття за ${month} (${count} осіб)`,
        isControlOnly: false,
        readingPurpose: 'billing',
      };

      await this.dataService.saveUtilityReading(reading);
      if (this.filterType() === 'water' || this.filterType() === 'water_control') {
        this.filterType.set('all');
      }
      this.closeWasteModal();
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async deleteReading(id: string): Promise<void> {
    const ok = await this.dataService.openConfirmDialog({
      title: 'Видалити запис?',
      message: 'Ви дійсно бажаєте видалити цей запис? Цю дію неможливо скасувати.',
      confirmText: 'Видалити',
      cancelText: 'Скасувати',
      tone: 'danger',
      icon: 'delete',
    });
    if (ok) {
      await this.dataService.deleteUtilityReading(id);
    }
  }

  async togglePaidStatus(r: UtilityReading): Promise<void> {
    if (r.isControlOnly) return;
    const nextStatus = !r.isPaid;
    await this.dataService.markUtilityReadingPaid(r.id, nextStatus, r.totalCost);
  }
}
