import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { IptvData } from '../../services/iptv-data';
import {
  formatDateUa,
  ProviderDeposit,
  BudgetLedgerItem,
  LedgerCategory,
  LedgerEntryType,
  ProviderBalanceAdjustment,
} from '../../models/client.model';
import { TelegramWebApp } from '../../services/telegram-web-app';

type LedgerFilter = 'all' | 'income' | 'expense' | 'deduction';
type BalanceCalibTab = 'exact' | 'delta';

@Component({
  selector: 'app-budget-view',
  imports: [ReactiveFormsModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div id="budget-dashboard-container" class="space-y-4 sm:space-y-6">
      <!-- Shared Household & Budget Invite Link Banner -->
      <div class="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 text-white border border-teal-500/30 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
        <div class="flex items-start sm:items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-400/40 text-teal-300 flex items-center justify-center shrink-0">
            <mat-icon class="text-xl">family_restroom</mat-icon>
          </div>
          <div>
            <div class="flex items-center gap-2 flex-wrap">
              <h3 class="text-xs sm:text-sm font-extrabold text-white">
                Спільний бюджет та Спільний дім
              </h3>
              <span class="px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-400/30 text-3xs font-bold">
                Доступ за Invite-посиланням
              </span>
            </div>
            <p class="text-2xs text-slate-300 mt-0.5">
              Запрошуйте членів сім'ї або близьких до спільного бюджету та вашого будинку (режим «Тільки для перегляду» за замовчуванням або «Повний доступ» + теги Сім'я, Друг, Подруга, Донька, Син, Знайомий).
            </p>
          </div>
        </div>
        <button
          id="btn-budget-invite-link"
          type="button"
          (click)="dataService.openSharedHouseholdModal()"
          class="px-4 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer shrink-0 shadow-xs transition-all"
        >
          <mat-icon class="text-base">add_link</mat-icon>
          <span>Invite Link • Спільний дім</span>
        </button>
      </div>

      <!-- Top Cards: Dual Currency Accounting (USD for Provider, UAH for Owner Budget) -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <!-- Card 1: Provider Balance USD & Management Trigger -->
        <div class="p-5 bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl shadow-sm border border-slate-700/80 flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <mat-icon class="text-base">account_balance_wallet</mat-icon>
                Баланс провайдера
              </span>
              <span class="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-mono text-xs border border-emerald-500/30">
                USD ($)
              </span>
            </div>
            <div class="mt-3">
              <div class="text-3xl font-extrabold font-mono text-white tracking-tight flex items-baseline gap-2">
                <span>\${{ providerBalanceUsd().toFixed(2) }}</span>
                @if (providerAdjustments().length > 0) {
                  <span class="text-2xs font-sans px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 border border-slate-600" title="Враховано ручні коригування">
                    скориговано
                  </span>
                }
              </div>
              <p class="text-xs text-slate-300 mt-1">
                Списується автоматично на день підключення за лініями IPTV
              </p>
            </div>
          </div>

          <div class="mt-4 pt-3 border-t border-slate-700/60 space-y-2">
            <div class="flex items-center justify-between text-2xs text-slate-300 font-mono">
              <span>Поповнено: \${{ (budgetSummary()?.totalDepositedUsd || 0).toFixed(2) }}</span>
              <span class="text-rose-300">Списано: -\${{ (budgetSummary()?.totalDeductedUsd || 0).toFixed(2) }}</span>
            </div>
            <button
              id="btn-manage-provider-balance"
              type="button"
              (click)="openBalanceAdjustmentModal()"
              class="w-full py-1.5 px-3 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 hover:text-white font-semibold text-xs flex items-center justify-center gap-1.5 border border-emerald-500/40 transition-colors cursor-pointer"
            >
              <mat-icon class="text-sm">tune</mat-icon>
              <span>Звірка та управління балансом</span>
            </button>
          </div>
        </div>

        <!-- Card 2: Monthly Burn Rate in USD -->
        <div class="p-5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Витрати в місяць ($)</span>
              <div class="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <mat-icon class="text-base">trending_down</mat-icon>
              </div>
            </div>
            <div class="mt-3">
              <div class="text-3xl font-extrabold font-mono text-slate-900">
                -\${{ (budgetSummary()?.monthlyBurnUsd || 0).toFixed(2) }}
                <span class="text-xs font-normal text-slate-500 font-sans">/ міс</span>
              </div>
              <p class="text-xs text-slate-500 mt-1">
                @if (runwayMonths() > 0) {
                  Балансу вистачить на ~<strong>{{ runwayMonths() }} міс.</strong> роботи
                } @else {
                  Потрібно поповнити рахунок провайдера
                }
              </p>
            </div>
          </div>

          <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-2xs text-slate-500">
            <span>Тарифи ліній:</span>
            <span class="font-semibold text-slate-700">$1 або $2 на місяць</span>
          </div>
        </div>

        <!-- Card 3: Net Profit in UAH (My Real Budget in Hryvnia) -->
        <div class="p-5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Чистий прибуток (₴)</span>
              <div
                class="w-8 h-8 rounded-lg flex items-center justify-center font-bold"
                [class.bg-emerald-50]="(budgetSummary()?.netProfitUah || 0) >= 0"
                [class.text-emerald-700]="(budgetSummary()?.netProfitUah || 0) >= 0"
                [class.bg-rose-50]="(budgetSummary()?.netProfitUah || 0) < 0"
                [class.text-rose-700]="(budgetSummary()?.netProfitUah || 0) < 0"
              >
                ₴
              </div>
            </div>
            <div class="mt-3">
              <div
                class="text-3xl font-extrabold tracking-tight"
                [class.text-emerald-700]="(budgetSummary()?.netProfitUah || 0) >= 0"
                [class.text-rose-600]="(budgetSummary()?.netProfitUah || 0) < 0"
              >
                {{ (budgetSummary()?.netProfitUah || 0) >= 0 ? '+' : '' }}{{ (budgetSummary()?.netProfitUah || 0).toLocaleString('uk-UA') }} ₴
              </div>
              <p class="text-xs text-slate-500 mt-1">
                Доходи від абонентів мінус витрати на поповнення
              </p>
            </div>
          </div>

          <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-2xs text-slate-500">
            <span>Доходи: +{{ (budgetSummary()?.totalIncomeUah || 0).toLocaleString('uk-UA') }} ₴</span>
            <span class="text-rose-600">Витрати: -{{ (budgetSummary()?.totalExpensesUah || 0).toLocaleString('uk-UA') }} ₴</span>
          </div>
        </div>

        <!-- Card 4: Effective Average Rate & Quick Actions -->
        <div class="p-5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Сер. курс закупівлі</span>
              <div class="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
                <mat-icon class="text-base">currency_exchange</mat-icon>
              </div>
            </div>
            <div class="mt-3">
              <div class="text-3xl font-extrabold font-mono text-slate-900">
                {{ (budgetSummary()?.averageExchangeRate || 0).toFixed(2) }}
                <span class="text-xs font-normal text-slate-500 font-sans">грн / $</span>
              </div>
              <p class="text-xs text-slate-500 mt-1">
                Фактичний курс з урахуванням усіх комісій
              </p>
            </div>
          </div>

          <div class="mt-4 pt-3 border-t border-slate-100 flex gap-2">
            <button
              id="btn-open-deposit-modal"
              type="button"
              (click)="openAddDepositModal()"
              class="flex-1 py-2 px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <mat-icon class="text-sm">add_card</mat-icon>
              <span>Поповнити ($ / ₴)</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Main Ledger & Deposit History Section -->
      <div class="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <!-- Section Header with Sub-tabs, Add Button and Search/Filter -->
        <div class="p-4 sm:p-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              (click)="activeViewMode.set('ledger')"
              [class.bg-slate-900]="activeViewMode() === 'ledger'"
              [class.text-white]="activeViewMode() === 'ledger'"
              [class.bg-slate-100]="activeViewMode() !== 'ledger'"
              [class.text-slate-700]="activeViewMode() !== 'ledger'"
              class="px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <mat-icon class="text-base">receipt_long</mat-icon>
              <span>Журнал руху коштів (Білінг)</span>
              <span class="px-1.5 py-0.2 rounded-full text-2xs font-mono" [class.bg-slate-700]="activeViewMode() === 'ledger'" [class.bg-slate-200]="activeViewMode() !== 'ledger'">
                {{ ledger().length }}
              </span>
            </button>

            <button
              type="button"
              (click)="activeViewMode.set('deposits')"
              [class.bg-slate-900]="activeViewMode() === 'deposits'"
              [class.text-white]="activeViewMode() === 'deposits'"
              [class.bg-slate-100]="activeViewMode() !== 'deposits'"
              [class.text-slate-700]="activeViewMode() !== 'deposits'"
              class="px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <mat-icon class="text-base">payments</mat-icon>
              <span>Поповнення провайдера ($)</span>
              <span class="px-1.5 py-0.2 rounded-full text-2xs font-mono" [class.bg-slate-700]="activeViewMode() === 'deposits'" [class.bg-slate-200]="activeViewMode() !== 'deposits'">
                {{ deposits().length }}
              </span>
            </button>
          </div>

          <div class="flex flex-wrap items-center gap-2 self-start lg:self-auto">
            <!-- Add Ledger Entry Button -->
            <button
              id="btn-add-ledger-entry"
              type="button"
              (click)="openAddLedgerModal()"
              class="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <mat-icon class="text-base">add_circle</mat-icon>
              <span>Додати запис до журналу</span>
            </button>

            <!-- Quick Calibration / Balance Fix Button -->
            <button
              id="btn-quick-calibrate-balance"
              type="button"
              (click)="openBalanceAdjustmentModal()"
              class="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              title="Швидке калібрування або виправлення залишку балансу провайдера за даними білінгу"
            >
              <mat-icon class="text-base">tune</mat-icon>
              <span>Виправити залишок ($)</span>
            </button>

            <!-- Quick Filters if in Ledger mode -->
            @if (activeViewMode() === 'ledger') {
              <div class="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
                <button
                  type="button"
                  (click)="ledgerFilter.set('all')"
                  [class.bg-white]="ledgerFilter() === 'all'"
                  [class.text-slate-900]="ledgerFilter() === 'all'"
                  [class.shadow-2xs]="ledgerFilter() === 'all'"
                  [class.text-slate-500]="ledgerFilter() !== 'all'"
                  class="px-2.5 py-1 rounded-lg font-medium cursor-pointer transition-all"
                >
                  Всі
                </button>
                <button
                  type="button"
                  (click)="ledgerFilter.set('income')"
                  [class.bg-white]="ledgerFilter() === 'income'"
                  [class.text-emerald-800]="ledgerFilter() === 'income'"
                  [class.shadow-2xs]="ledgerFilter() === 'income'"
                  [class.text-slate-500]="ledgerFilter() !== 'income'"
                  class="px-2.5 py-1 rounded-lg font-medium cursor-pointer transition-all flex items-center gap-1"
                >
                  <mat-icon class="text-xs text-emerald-600">arrow_downward</mat-icon>
                  Доходи (+)
                </button>
                <button
                  type="button"
                  (click)="ledgerFilter.set('expense')"
                  [class.bg-white]="ledgerFilter() === 'expense'"
                  [class.text-rose-800]="ledgerFilter() === 'expense'"
                  [class.shadow-2xs]="ledgerFilter() === 'expense'"
                  [class.text-slate-500]="ledgerFilter() !== 'expense'"
                  class="px-2.5 py-1 rounded-lg font-medium cursor-pointer transition-all flex items-center gap-1"
                >
                  <mat-icon class="text-xs text-rose-600">arrow_upward</mat-icon>
                  Витрати (-)
                </button>
              </div>
            }
          </div>
        </div>

        <!-- VIEW 1: COMBINED CASHFLOW LEDGER -->
        @if (activeViewMode() === 'ledger') {
          <div>
            @if (filteredLedger().length === 0) {
              <div class="p-8 text-center text-slate-500 text-sm">
                Записів у журналі не знайдено. Натисніть кнопку вище, щоб додати запис.
              </div>
            } @else {
              <!-- Mobile Card View (< md) -->
              <div class="md:hidden divide-y divide-slate-100">
                @for (item of filteredLedger(); track item.id) {
                  <div class="p-4 space-y-2.5 hover:bg-slate-50/70 transition-colors">
                    <div class="flex items-start justify-between gap-2">
                      <div class="min-w-0">
                        <div class="font-bold text-sm text-slate-900">{{ item.title }}</div>
                        <div class="text-2xs text-slate-500 mt-0.5">{{ item.subtitle }}</div>
                        <div class="text-3xs text-slate-400 mt-0.5">{{ formatDateTime(item.date) }}</div>
                      </div>
                      <div class="text-right shrink-0">
                        <div
                          class="font-bold font-mono text-sm"
                          [class.text-emerald-700]="item.amountUah > 0"
                          [class.text-rose-600]="item.amountUah < 0"
                          [class.text-slate-600]="item.amountUah === 0"
                        >
                          {{ (item.amountUah || 0) > 0 ? '+' : '' }}{{ (item.amountUah || 0) !== 0 ? (item.amountUah || 0).toLocaleString('uk-UA') + ' ₴' : (item.amountUsd ? (item.amountUsd > 0 ? '+$' : '-$') + Math.abs(item.amountUsd) + ' USD' : '—') }}
                        </div>
                        @if (item.amountUsd !== undefined && item.amountUsd !== 0) {
                          <span class="text-3xs font-mono font-semibold" [class.text-emerald-700]="item.amountUsd > 0" [class.text-rose-600]="item.amountUsd < 0">
                            ({{ item.amountUsd > 0 ? '+' : '' }}\${{ item.amountUsd }} USD)
                          </span>
                        }
                      </div>
                    </div>

                    <div class="flex flex-wrap items-center justify-between gap-2 bg-slate-50 rounded-xl p-2.5 border border-slate-100 text-2xs">
                      <div class="flex flex-wrap items-center gap-1.5">
                        @if (item.type === 'income') {
                          <span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">Надходження (+)</span>
                        } @else if (item.type === 'expense') {
                          <span class="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold">Витрата (-)</span>
                        } @else if (item.type === 'adjustment') {
                          <span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold">Коригування ($)</span>
                        } @else {
                          <span class="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-bold">Списання лінії ($)</span>
                        }
                        @if (item.clientName) {
                          <span class="px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200">Клієнт: {{ item.clientName }}</span>
                        }
                        @if (item.accountName) {
                          <span class="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">Акаунт: {{ item.accountName }}</span>
                        }
                        @if (item.paymentMethod) {
                          <span class="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700">{{ item.paymentMethod }}</span>
                        }
                      </div>

                      @if (item.balanceBeforeUsd !== undefined && item.balanceAfterUsd !== undefined) {
                        <div class="font-mono text-2xs text-slate-600">
                          Баланс $: <b>\${{ item.balanceBeforeUsd.toFixed(2) }}</b> → <b class="text-slate-900">\${{ item.balanceAfterUsd.toFixed(2) }}</b>
                        </div>
                      }
                    </div>

                    @if (item.note) {
                      <div class="text-2xs text-slate-500 italic">"{{ item.note }}"</div>
                    }

                    <div class="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                      <button
                        type="button"
                        (click)="editLedgerItem(item)"
                        class="px-2.5 py-1 text-xs rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <mat-icon class="text-xs">edit</mat-icon>
                        <span>Редагувати</span>
                      </button>
                      <button
                        type="button"
                        (click)="deleteLedgerItem(item)"
                        class="px-2.5 py-1 text-xs rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <mat-icon class="text-xs">delete</mat-icon>
                        <span>Видалити</span>
                      </button>
                    </div>
                  </div>
                }
              </div>

              <!-- Desktop Table (>= md) -->
              <div class="hidden md:block overflow-x-auto">
                <table class="w-full text-left text-xs sm:text-sm">
                  <thead class="bg-slate-50 text-slate-500 uppercase tracking-wider text-2xs border-b border-slate-200">
                    <tr>
                      <th class="px-4 py-3 font-semibold">Дата</th>
                      <th class="px-4 py-3 font-semibold">Тип операції</th>
                      <th class="px-4 py-3 font-semibold">Призначення / Опис</th>
                      <th class="px-4 py-3 font-semibold">Деталі / Спосіб</th>
                      <th class="px-4 py-3 font-semibold text-right">Сума (грн / $)</th>
                      <th class="px-4 py-3 font-semibold text-center whitespace-nowrap">Баланс провайдера ($)</th>
                      <th class="px-4 py-3 font-semibold text-right">Дії</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100">
                    @for (item of filteredLedger(); track item.id) {
                      <tr class="hover:bg-slate-50/70 transition-colors">
                        <td class="px-4 py-3 text-slate-500 whitespace-nowrap">
                          {{ formatDateTime(item.date) }}
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap">
                          @if (item.type === 'income') {
                            <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-2xs font-bold">
                              <mat-icon class="text-xs">add</mat-icon>
                              Надходження (+)
                            </span>
                          } @else if (item.type === 'expense') {
                            <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-2xs font-bold">
                              <mat-icon class="text-xs">remove</mat-icon>
                              Витрата (-)
                            </span>
                          } @else if (item.type === 'adjustment') {
                            <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-2xs font-bold">
                              <mat-icon class="text-xs">tune</mat-icon>
                              Коригування ($)
                            </span>
                          } @else {
                            <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-2xs font-bold">
                              <mat-icon class="text-xs">sync_alt</mat-icon>
                              Списання лінії ($)
                            </span>
                          }
                        </td>
                        <td class="px-4 py-3">
                          <div class="flex items-center gap-1.5 flex-wrap">
                            <strong class="text-slate-900 font-semibold">{{ item.title }}</strong>
                            @if (item.clientName) {
                              <span class="px-1.5 py-0.2 rounded bg-sky-50 text-sky-700 border border-sky-200 text-2xs">
                                Клієнт: {{ item.clientName }}
                              </span>
                            }
                            @if (item.accountName) {
                              <span class="px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 border border-purple-200 text-2xs">
                                Акаунт: {{ item.accountName }}
                              </span>
                            }
                            @if (item.isCustom) {
                              <span class="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-2xs">
                                Ручний запис
                              </span>
                            }
                          </div>
                          <span class="text-slate-500 text-2xs block mt-0.5">{{ item.subtitle }}</span>
                        </td>
                        <td class="px-4 py-3 text-slate-600 text-2xs">
                          @if (item.paymentMethod) {
                            <span class="px-1.5 py-0.5 bg-slate-100 rounded text-slate-700 font-medium mr-1.5">
                              {{ item.paymentMethod }}
                            </span>
                          }
                          @if (item.amountUsd !== undefined && item.amountUsd !== 0) {
                            <span class="font-mono font-semibold" [class.text-emerald-700]="item.amountUsd > 0" [class.text-rose-600]="item.amountUsd < 0">
                              ({{ item.amountUsd > 0 ? '+' : '' }}\${{ item.amountUsd }} USD)
                            </span>
                          }
                          @if (item.note) {
                            <span class="text-slate-500 italic ml-1">"{{ item.note }}"</span>
                          }
                        </td>
                        <td
                          class="px-4 py-3 text-right font-bold font-mono text-sm whitespace-nowrap"
                          [class.text-emerald-700]="item.amountUah > 0"
                          [class.text-rose-600]="item.amountUah < 0"
                          [class.text-slate-500]="item.amountUah === 0"
                        >
                          {{ (item.amountUah || 0) > 0 ? '+' : '' }}{{ (item.amountUah || 0) !== 0 ? (item.amountUah || 0).toLocaleString('uk-UA') + ' ₴' : (item.amountUsd ? (item.amountUsd > 0 ? '+$' : '-$') + Math.abs(item.amountUsd) + ' USD' : '—') }}
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap text-center">
                          @if (item.balanceBeforeUsd !== undefined && item.balanceAfterUsd !== undefined) {
                            <div class="inline-flex flex-col items-center">
                              <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200/90 font-mono text-xs">
                                <span class="text-slate-500 font-medium" title="Баланс до операції">\${{ item.balanceBeforeUsd.toFixed(2) }}</span>
                                <mat-icon class="text-xs text-slate-400">arrow_forward</mat-icon>
                                <span
                                  class="font-bold"
                                  [class.text-emerald-700]="item.balanceAfterUsd > item.balanceBeforeUsd"
                                  [class.text-rose-600]="item.balanceAfterUsd < item.balanceBeforeUsd"
                                  [class.text-slate-800]="item.balanceAfterUsd === item.balanceBeforeUsd"
                                  title="Баланс після операції"
                                >
                                  \${{ item.balanceAfterUsd.toFixed(2) }}
                                </span>
                              </div>
                              <span class="text-3xs text-slate-400 mt-0.5 font-medium">до → після</span>
                            </div>
                          } @else {
                            <span class="text-slate-300 font-mono text-xs" title="Не впливає на баланс провайдера">—</span>
                          }
                        </td>
                        <td class="px-4 py-3 text-right whitespace-nowrap">
                          <div class="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              (click)="editLedgerItem(item)"
                              class="p-1.5 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                              title="Редагувати цей запис"
                            >
                              <mat-icon class="text-base">edit</mat-icon>
                            </button>
                            <button
                              type="button"
                              (click)="deleteLedgerItem(item)"
                              class="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Видалити цей запис"
                            >
                              <mat-icon class="text-base">delete</mat-icon>
                            </button>
                          </div>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
        }

        <!-- VIEW 2: PROVIDER DEPOSITS LIST -->
        @if (activeViewMode() === 'deposits') {
          <div>
            @if (deposits().length === 0) {
              <div class="p-8 text-center text-slate-500 text-sm">
                Поповнень ще не зафіксовано. Натисніть кнопку вище, щоб додати суму поповнення.
              </div>
            } @else {
              <!-- Mobile Card View (< md) -->
              <div class="md:hidden divide-y divide-slate-100">
                @for (dep of deposits(); track dep.id) {
                  <div class="p-4 space-y-2.5 hover:bg-slate-50/70 transition-colors">
                    <div class="flex items-start justify-between gap-2">
                      <div>
                        <div class="font-bold text-sm text-slate-900">{{ formatDate(dep.date) }}</div>
                        <span class="inline-block mt-1 px-2 py-0.5 rounded bg-slate-100 text-2xs font-medium text-slate-700">
                          {{ dep.paymentMethod || 'Картка' }}
                        </span>
                      </div>
                      <div class="text-right">
                        <div class="font-mono font-bold text-emerald-700 text-sm">+\${{ dep.amountUsd.toFixed(2) }}</div>
                        <div class="font-mono font-semibold text-rose-600 text-xs">-{{ (dep.spentUah || 0).toLocaleString('uk-UA') }} ₴</div>
                      </div>
                    </div>

                    <div class="grid grid-cols-2 gap-2 bg-slate-50 rounded-xl p-2.5 border border-slate-100 text-xs">
                      <div>
                        <span class="text-3xs text-slate-400 uppercase font-semibold block">Фактичний курс</span>
                        <strong class="font-mono text-slate-800">{{ (dep.exchangeRate || ((dep.spentUah || 0) / (dep.amountUsd || 1))).toFixed(2) }} ₴/$</strong>
                      </div>
                      <div class="text-right">
                        <span class="text-3xs text-slate-400 uppercase font-semibold block">Баланс провайдера</span>
                        @if (dep.balanceBeforeUsd !== undefined && dep.balanceAfterUsd !== undefined) {
                          <strong class="font-mono text-emerald-700">\${{ dep.balanceBeforeUsd.toFixed(2) }} → \${{ dep.balanceAfterUsd.toFixed(2) }}</strong>
                        } @else {
                          <span class="text-slate-400">—</span>
                        }
                      </div>
                    </div>

                    @if (dep.note) {
                      <div class="text-2xs text-slate-500 italic">{{ dep.note }}</div>
                    }

                    <div class="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                      <button
                        type="button"
                        (click)="openEditDepositModal(dep)"
                        class="px-2.5 py-1 text-xs rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <mat-icon class="text-xs">edit</mat-icon>
                        <span>Редагувати</span>
                      </button>
                      <button
                        type="button"
                        (click)="deleteDepositConfirm(dep)"
                        class="px-2.5 py-1 text-xs rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <mat-icon class="text-xs">delete</mat-icon>
                        <span>Видалити</span>
                      </button>
                    </div>
                  </div>
                }
              </div>

              <!-- Desktop Table (>= md) -->
              <div class="hidden md:block overflow-x-auto">
                <table class="w-full text-left text-xs sm:text-sm">
                  <thead class="bg-slate-50 text-slate-500 uppercase tracking-wider text-2xs border-b border-slate-200">
                    <tr>
                      <th class="px-4 py-3 font-semibold">Дата поповнення</th>
                      <th class="px-4 py-3 font-semibold text-right">Сума на баланс ($)</th>
                      <th class="px-4 py-3 font-semibold text-center whitespace-nowrap">Баланс провайдера ($)</th>
                      <th class="px-4 py-3 font-semibold text-right">Витрачено в гривнях (₴)</th>
                      <th class="px-4 py-3 font-semibold text-right">Фактичний курс</th>
                      <th class="px-4 py-3 font-semibold">Спосіб оплати</th>
                      <th class="px-4 py-3 font-semibold">Примітка</th>
                      <th class="px-4 py-3 text-right font-semibold">Дії</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100">
                    @for (dep of deposits(); track dep.id) {
                      <tr class="hover:bg-slate-50/70 transition-colors">
                        <td class="px-4 py-3 text-slate-600 whitespace-nowrap font-medium">
                          {{ formatDate(dep.date) }}
                        </td>
                        <td class="px-4 py-3 text-right font-mono font-bold text-emerald-700 whitespace-nowrap text-sm">
                          +\${{ dep.amountUsd.toFixed(2) }}
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap text-center">
                          @if (dep.balanceBeforeUsd !== undefined && dep.balanceAfterUsd !== undefined) {
                            <div class="inline-flex flex-col items-center">
                              <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50/80 border border-emerald-200/80 font-mono text-xs">
                                <span class="text-slate-500 font-medium" title="Баланс до поповнення">\${{ dep.balanceBeforeUsd.toFixed(2) }}</span>
                                <mat-icon class="text-xs text-emerald-500">arrow_forward</mat-icon>
                                <span class="font-bold text-emerald-700" title="Баланс після поповнення">
                                  \${{ dep.balanceAfterUsd.toFixed(2) }}
                                </span>
                              </div>
                              <span class="text-3xs text-slate-400 mt-0.5 font-medium">до → після</span>
                            </div>
                          } @else {
                            <span class="text-slate-300 font-mono text-xs">—</span>
                          }
                        </td>
                        <td class="px-4 py-3 text-right font-mono font-bold text-rose-600 whitespace-nowrap text-sm">
                          -{{ (dep.spentUah || 0).toLocaleString('uk-UA') }} ₴
                        </td>
                        <td class="px-4 py-3 text-right font-mono text-slate-700 whitespace-nowrap">
                          {{ (dep.exchangeRate || ((dep.spentUah || 0) / (dep.amountUsd || 1))).toFixed(2) }} ₴/$
                        </td>
                        <td class="px-4 py-3 text-slate-700 whitespace-nowrap">
                          <span class="px-2 py-0.5 rounded bg-slate-100 text-2xs font-medium">
                            {{ dep.paymentMethod || 'Картка' }}
                          </span>
                        </td>
                        <td class="px-4 py-3 text-slate-500 text-xs truncate max-w-xs" [title]="dep.note || ''">
                          {{ dep.note || '—' }}
                        </td>
                        <td class="px-4 py-3 text-right whitespace-nowrap">
                          <div class="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              (click)="openEditDepositModal(dep)"
                              class="p-1.5 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                              title="Редагувати запис поповнення"
                            >
                              <mat-icon class="text-base">edit</mat-icon>
                            </button>
                            <button
                              type="button"
                              (click)="deleteDepositConfirm(dep)"
                              class="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Видалити запис"
                            >
                              <mat-icon class="text-base">delete</mat-icon>
                            </button>
                          </div>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
        }
      </div>

      <!-- ======================================================== -->
      <!-- MODAL: ADD / EDIT CUSTOM LEDGER ENTRY (Журнал руху коштів) -->
      <!-- ======================================================== -->
      @if (isCustomLedgerModalOpen()) {
        <div class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 flex items-center justify-center">
          <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden my-auto border border-slate-200 flex flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)]">
            <!-- Modal Header -->
            <div class="flex items-center justify-between px-5 sm:px-6 py-4 bg-slate-900 text-white shrink-0">
              <div class="flex items-center gap-2.5">
                <div class="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                  <mat-icon class="text-xl">{{ editingLedgerId() ? 'edit_note' : 'add_circle' }}</mat-icon>
                </div>
                <div>
                  <h2 class="text-base font-semibold tracking-tight">
                    {{ editingLedgerId() ? 'Редагувати запис журналу' : 'Додати запис до журналу руху коштів' }}
                  </h2>
                  <p class="text-xs text-slate-400">Враховується у доходах, витратах або балансі провайдера</p>
                </div>
              </div>
              <button
                type="button"
                (click)="isCustomLedgerModalOpen.set(false)"
                class="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <mat-icon>close</mat-icon>
              </button>
            </div>

            <!-- Form -->
            <form [formGroup]="customLedgerForm" (ngSubmit)="saveCustomLedgerEntry()" class="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div class="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1 overscroll-contain">
                <!-- Type Selection: Income (+) vs Expense (-) -->
                <div>
                  <span class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Тип операції <span class="text-rose-500">*</span>
                  </span>
                  <div class="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      (click)="setLedgerType('income')"
                      [class.bg-emerald-600]="customLedgerForm.controls.type.value === 'income'"
                      [class.text-white]="customLedgerForm.controls.type.value === 'income'"
                      [class.bg-slate-100]="customLedgerForm.controls.type.value !== 'income'"
                      [class.text-slate-700]="customLedgerForm.controls.type.value !== 'income'"
                      class="py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer border"
                      [class.border-emerald-600]="customLedgerForm.controls.type.value === 'income'"
                      [class.border-slate-200]="customLedgerForm.controls.type.value !== 'income'"
                    >
                      <mat-icon class="text-sm">arrow_downward</mat-icon>
                      <span>Надходження / Дохід (+)</span>
                    </button>
                    <button
                      type="button"
                      (click)="setLedgerType('expense')"
                      [class.bg-rose-600]="customLedgerForm.controls.type.value === 'expense'"
                      [class.text-white]="customLedgerForm.controls.type.value === 'expense'"
                      [class.bg-slate-100]="customLedgerForm.controls.type.value !== 'expense'"
                      [class.text-slate-700]="customLedgerForm.controls.type.value !== 'expense'"
                      class="py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer border"
                      [class.border-rose-600]="customLedgerForm.controls.type.value === 'expense'"
                      [class.border-slate-200]="customLedgerForm.controls.type.value !== 'expense'"
                    >
                      <mat-icon class="text-sm">arrow_upward</mat-icon>
                      <span>Витрата / Списання (-)</span>
                    </button>
                  </div>
                </div>

                <!-- Category Selection -->
                <div>
                  <label for="ledger-category" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Категорія / За що оплата
                  </label>
                  <select
                    id="ledger-category"
                    formControlName="category"
                    (change)="onLedgerCategoryChange()"
                    class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:border-emerald-600"
                  >
                    <option value="client_payment">Оплата від клієнта (за абонента)</option>
                    <option value="account_payment">Оплата за акаунт провайдера</option>
                    <option value="provider_topup">Поповнення балансу провайдера</option>
                    <option value="provider_adjustment">Коригування балансу провайдера</option>
                    <option value="custom">Інше / Довільний запис</option>
                  </select>
                </div>

                <!-- Client Selector (if client_payment) -->
                @if (customLedgerForm.controls.category.value === 'client_payment') {
                  <div class="p-3 bg-sky-50/70 border border-sky-200/80 rounded-xl space-y-2">
                    <label for="ledger-client-select" class="block text-xs font-semibold text-sky-900 uppercase tracking-wider">
                      Оберіть клієнта з бази:
                    </label>
                    <select
                      id="ledger-client-select"
                      formControlName="clientId"
                      (change)="onClientSelected()"
                      class="w-full px-3 py-2 bg-white border border-sky-300 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:border-sky-600"
                    >
                      <option value="">— Оберіть абонента —</option>
                      @for (c of clients(); track c.id) {
                        <option [value]="c.id">
                          {{ c.fullName }} (логін: {{ c.iptvLogin }}{{ c.phone ? ', ' + c.phone : '' }}) — {{ c.monthlyPrice }} ₴/міс
                        </option>
                      }
                    </select>
                  </div>
                }

                <!-- Account Selector (if account_payment) -->
                @if (customLedgerForm.controls.category.value === 'account_payment') {
                  <div class="p-3 bg-purple-50/70 border border-purple-200/80 rounded-xl space-y-2">
                    <label for="ledger-account-select" class="block text-xs font-semibold text-purple-900 uppercase tracking-wider">
                      Оберіть акаунт провайдера:
                    </label>
                    <select
                      id="ledger-account-select"
                      formControlName="accountId"
                      (change)="onAccountSelected()"
                      class="w-full px-3 py-2 bg-white border border-purple-300 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:border-purple-600"
                    >
                      <option value="">— Оберіть акаунт —</option>
                      @for (acc of accounts(); track acc.id) {
                        <option [value]="acc.id">
                          {{ acc.name }} (логін: {{ acc.login }}) — \${{ acc.pricePerMonthUsd }}/міс
                        </option>
                      }
                    </select>
                  </div>
                }

                <!-- Title / Description -->
                <div>
                  <label for="ledger-title" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Назва / Опис операції <span class="text-rose-500">*</span>
                  </label>
                  <input
                    id="ledger-title"
                    type="text"
                    formControlName="title"
                    placeholder="напр. Оплата від абонента: Іванов І."
                    class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <!-- Amounts: UAH and USD -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <!-- UAH -->
                  <div>
                    <label for="ledger-amount-uah" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                      Сума в гривнях (₴ UAH) <span class="text-rose-500">*</span>
                    </label>
                    <div class="relative">
                      <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 font-bold text-sm">
                        ₴
                      </span>
                      <input
                        id="ledger-amount-uah"
                        type="number"
                        min="0"
                        step="1"
                        formControlName="amountUah"
                        placeholder="100"
                        class="w-full pl-8 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-base font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                      />
                    </div>
                    <p class="text-2xs text-slate-500 mt-1">
                      {{ customLedgerForm.controls.type.value === 'income' ? 'Буде враховано як дохід (+)' : 'Буде враховано як витрата (-)' }}
                    </p>
                  </div>

                  <!-- USD (Optional) -->
                  <div>
                    <label for="ledger-amount-usd" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                      Сума в USD ($ - необов'язково)
                    </label>
                    <div class="relative">
                      <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 font-bold text-sm">
                        $
                      </span>
                      <input
                        id="ledger-amount-usd"
                        type="number"
                        min="0"
                        step="0.5"
                        formControlName="amountUsd"
                        placeholder="напр. 2"
                        class="w-full pl-8 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-base font-bold focus:outline-none focus:border-emerald-600"
                        [class.text-rose-700]="customLedgerForm.controls.type.value === 'expense' && customLedgerForm.controls.category.value !== 'provider_topup'"
                        [class.text-emerald-700]="customLedgerForm.controls.type.value === 'income' || customLedgerForm.controls.category.value === 'provider_topup'"
                      />
                    </div>
                    <p class="text-2xs mt-1">
                      @if (customLedgerForm.controls.type.value === 'expense' && customLedgerForm.controls.category.value !== 'provider_topup') {
                        <span class="text-rose-600 font-medium">Буде списано з балансу провайдера (-$ USD)</span>
                      } @else if (customLedgerForm.controls.category.value === 'provider_topup' || customLedgerForm.controls.type.value === 'income') {
                        <span class="text-emerald-700 font-medium">Буде додано на баланс провайдера (+$ USD)</span>
                      } @else {
                        <span class="text-slate-500">Впливає на залишок балансу провайдера ($)</span>
                      }
                    </p>
                  </div>
                </div>

                <!-- Date & Payment Method -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label for="ledger-date" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                      Дата операції <span class="text-rose-500">*</span>
                    </label>
                    <input
                      id="ledger-date"
                      type="date"
                      formControlName="date"
                      class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
                    />
                  </div>

                  <div>
                    <label for="ledger-payment-method" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                      Спосіб оплати
                    </label>
                    <input
                      id="ledger-payment-method"
                      type="text"
                      formControlName="paymentMethod"
                      placeholder="Монобанк, Готівка, USDT..."
                      class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>

                <!-- Notes / Comment -->
                <div>
                  <label for="ledger-note" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Коментар / Примітка
                  </label>
                  <input
                    id="ledger-note"
                    type="text"
                    formControlName="note"
                    placeholder="Будь-які додаткові деталі"
                    class="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              <!-- Actions -->
              <div class="flex items-center justify-between gap-3 px-5 sm:px-6 py-3.5 bg-slate-50 border-t border-slate-200 shrink-0">
                @if (editingLedgerId()) {
                  <button
                    type="button"
                    (click)="deleteCurrentEditingLedgerItem()"
                    [disabled]="isSubmitting()"
                    class="px-3 py-2 rounded-xl text-rose-600 hover:bg-rose-50 border border-rose-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Видалити цей запис з журналу"
                  >
                    <mat-icon class="text-sm">delete</mat-icon>
                    <span>Видалити запис</span>
                  </button>
                } @else {
                  <div></div>
                }
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    (click)="isCustomLedgerModalOpen.set(false)"
                    class="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    Скасувати
                  </button>
                  <button
                    type="submit"
                    [disabled]="customLedgerForm.invalid || isSubmitting()"
                    class="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white text-sm font-semibold flex items-center gap-2 cursor-pointer transition-colors shadow-xs"
                  >
                    <mat-icon class="text-base">save</mat-icon>
                    <span>{{ editingLedgerId() ? 'Зберегти зміни' : 'Додати до журналу' }}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- ======================================================== -->
      <!-- MODAL: PROVIDER BALANCE AUDIT & ADJUSTMENT (Управління)    -->
      <!-- ======================================================== -->
      @if (isBalanceAdjustmentModalOpen()) {
        <div class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 flex items-center justify-center">
          <div class="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden my-auto border border-slate-200 flex flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)]">
            <!-- Modal Header -->
            <div class="flex items-center justify-between px-5 sm:px-6 py-4 bg-slate-900 text-white shrink-0">
              <div class="flex items-center gap-2.5">
                <div class="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                  <mat-icon class="text-xl">tune</mat-icon>
                </div>
                <div>
                  <h2 class="text-base font-semibold tracking-tight">
                    Управління та звірка балансу провайдера
                  </h2>
                  <p class="text-xs text-slate-400">Перевірка розрахункового залишку, виправлення розбіжностей та бонуси</p>
                </div>
              </div>
              <button
                type="button"
                (click)="isBalanceAdjustmentModalOpen.set(false)"
                class="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <mat-icon>close</mat-icon>
              </button>
            </div>

            <!-- Body -->
            <div class="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1 overscroll-contain">
              <!-- Summary breakdown box -->
              <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div class="flex items-center justify-between">
                  <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Поточний баланс за білінгом:</span>
                  <span class="text-xl font-extrabold font-mono text-slate-900">
                    \${{ providerBalanceUsd().toFixed(2) }}
                  </span>
                </div>
                <div class="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200 text-2xs font-mono">
                  <div>
                    <span class="text-slate-400 block">Поповнення:</span>
                    <strong class="text-emerald-700">+\${{ (budgetSummary()?.totalDepositedUsd || 0).toFixed(2) }}</strong>
                  </div>
                  <div>
                    <span class="text-slate-400 block">Списання ліній:</span>
                    <strong class="text-rose-600">-\${{ (budgetSummary()?.totalDeductedUsd || 0).toFixed(2) }}</strong>
                  </div>
                  <div>
                    <span class="text-slate-400 block">Коригування:</span>
                    <strong class="text-slate-700">{{ (budgetSummary()?.providerBalanceAdjustmentsSum || 0) >= 0 ? '+' : '' }}\${{ (budgetSummary()?.providerBalanceAdjustmentsSum || 0).toFixed(2) }}</strong>
                  </div>
                </div>
              </div>

              <!-- Calibration Tab Switch -->
              <div class="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
                <button
                  type="button"
                  (click)="balanceCalibTab.set('exact')"
                  [class.bg-white]="balanceCalibTab() === 'exact'"
                  [class.text-slate-900]="balanceCalibTab() === 'exact'"
                  [class.shadow-2xs]="balanceCalibTab() === 'exact'"
                  [class.text-slate-500]="balanceCalibTab() !== 'exact'"
                  class="flex-1 py-1.5 rounded-lg font-semibold cursor-pointer transition-all flex items-center justify-center gap-1"
                >
                  <mat-icon class="text-xs">pin</mat-icon>
                  <span>Точний баланс з кабінету</span>
                </button>
                <button
                  type="button"
                  (click)="balanceCalibTab.set('delta')"
                  [class.bg-white]="balanceCalibTab() === 'delta'"
                  [class.text-slate-900]="balanceCalibTab() === 'delta'"
                  [class.shadow-2xs]="balanceCalibTab() === 'delta'"
                  [class.text-slate-500]="balanceCalibTab() !== 'delta'"
                  class="flex-1 py-1.5 rounded-lg font-semibold cursor-pointer transition-all flex items-center justify-center gap-1"
                >
                  <mat-icon class="text-xs">add_road</mat-icon>
                  <span>Ручна зміна (+/- $)</span>
                </button>
              </div>

              <!-- Tab 1: Set Exact Balance from provider website -->
              @if (balanceCalibTab() === 'exact') {
                <div class="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200/80 space-y-3">
                  <div class="flex items-center gap-2">
                    <mat-icon class="text-emerald-700 text-sm">verified</mat-icon>
                    <span class="text-xs font-bold text-emerald-950">
                      Швидка синхронізація з кабінетом провайдера
                    </span>
                  </div>
                  <p class="text-2xs text-slate-600">
                    Введіть точну суму в доларах, яка зараз відображається в панелі провайдера IPTV. Система автоматично розрахує різницю і створить калібрувальний запис.
                  </p>

                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                    <div>
                      <label for="exact-balance-input" class="block text-2xs font-semibold text-slate-700 uppercase mb-1">
                        Фактичний баланс ($ USD):
                      </label>
                      <div class="relative">
                        <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 font-bold text-sm">$</span>
                        <input
                          id="exact-balance-input"
                          type="number"
                          step="0.01"
                          [formControl]="exactBalanceControl"
                          placeholder="напр. 15.50"
                          class="w-full pl-8 pr-3 py-2 bg-white border border-emerald-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                        />
                      </div>
                    </div>

                    <div class="p-2.5 bg-white rounded-xl border border-slate-200 text-xs">
                      <span class="text-slate-500 block text-2xs">Різниця для коригування:</span>
                      <strong class="font-mono text-sm" [class.text-emerald-700]="calculatedAdjustmentDelta() > 0" [class.text-rose-600]="calculatedAdjustmentDelta() < 0">
                        {{ calculatedAdjustmentDelta() >= 0 ? '+' : '' }}\${{ calculatedAdjustmentDelta().toFixed(2) }}
                      </strong>
                    </div>
                  </div>

                  <div>
                    <label for="exact-balance-note" class="block text-2xs font-semibold text-slate-700 uppercase mb-1">
                      Примітка калібрування:
                    </label>
                    <input
                      id="exact-balance-note"
                      type="text"
                      [formControl]="exactBalanceNoteControl"
                      placeholder="Звірка з білінгом провайдера"
                      class="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
                    />
                  </div>

                  <button
                    type="button"
                    (click)="applyExactBalanceCalibration()"
                    [disabled]="exactBalanceControl.value === null || isSubmitting()"
                    class="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                  >
                    <mat-icon class="text-sm">check_circle</mat-icon>
                    <span>Зафіксувати точний баланс</span>
                  </button>
                </div>
              }

              <!-- Tab 2: Manual Delta Adjustment (+/- $) -->
              @if (balanceCalibTab() === 'delta') {
                <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <div class="flex items-center gap-2">
                    <mat-icon class="text-slate-700 text-sm">edit_attributes</mat-icon>
                    <span class="text-xs font-bold text-slate-800">
                      Ручне коригування залишку ($)
                    </span>
                  </div>

                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label for="delta-amount-input" class="block text-2xs font-semibold text-slate-700 uppercase mb-1">
                        Сума (+ або - в $):
                      </label>
                      <input
                        id="delta-amount-input"
                        type="number"
                        step="0.1"
                        [formControl]="deltaAmountControl"
                        placeholder="напр. +5 або -2"
                        class="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                      />
                    </div>

                    <div>
                      <label for="delta-date-input" class="block text-2xs font-semibold text-slate-700 uppercase mb-1">
                        Дата коригування:
                      </label>
                      <input
                        id="delta-date-input"
                        type="date"
                        [formControl]="deltaDateControl"
                        class="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
                      />
                    </div>
                  </div>

                  <div>
                    <label for="delta-note-input" class="block text-2xs font-semibold text-slate-700 uppercase mb-1">
                      Причина / Примітка:
                    </label>
                    <input
                      id="delta-note-input"
                      type="text"
                      [formControl]="deltaNoteControl"
                      placeholder="Бонус від провайдера / комісія / тощо"
                      class="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
                    />
                  </div>

                  <button
                    type="button"
                    (click)="applyDeltaAdjustment()"
                    [disabled]="!deltaAmountControl.value || isSubmitting()"
                    class="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                  >
                    <mat-icon class="text-sm">save</mat-icon>
                    <span>Зберегти коригування</span>
                  </button>
                </div>
              }

              <!-- Adjustment History Table -->
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <h4 class="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Історія калібрувань та коригувань ({{ providerAdjustments().length }})
                  </h4>
                </div>

                @if (providerAdjustments().length === 0) {
                  <p class="text-2xs text-slate-400 italic">Коригувань ще не вносилось. Баланс розраховується автоматично (Поповнення мінус списання).</p>
                } @else {
                  <div class="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-48 overflow-y-auto">
                    @for (adj of providerAdjustments(); track adj.id) {
                      <div class="p-2.5 flex items-center justify-between bg-white text-xs hover:bg-slate-50 transition-colors">
                        <div>
                          <div class="flex items-center gap-2">
                            <span class="font-mono font-bold" [class.text-emerald-700]="adj.amountUsd >= 0" [class.text-rose-600]="adj.amountUsd < 0">
                              {{ adj.amountUsd >= 0 ? '+' : '' }}\${{ adj.amountUsd.toFixed(2) }}
                            </span>
                            <span class="text-2xs text-slate-400 font-mono">{{ formatDate(adj.date) }}</span>
                          </div>
                          <span class="text-2xs text-slate-600 block">{{ adj.note || 'Коригування' }}</span>
                        </div>
                        <button
                          type="button"
                          (click)="deleteAdjustmentConfirm(adj)"
                          class="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                          title="Видалити запис коригування"
                        >
                          <mat-icon class="text-sm">delete</mat-icon>
                        </button>
                      </div>
                    }
                  </div>
                }
              </div>
            </div>

            <!-- Modal Footer -->
            <div class="flex items-center justify-between px-5 sm:px-6 py-3.5 bg-slate-50 border-t border-slate-200 shrink-0">
              <button
                type="button"
                (click)="openAddDepositModalFromBalance()"
                class="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <mat-icon class="text-sm">add_card</mat-icon>
                <span>Поповнити баланс ($)</span>
              </button>

              <button
                type="button"
                (click)="isBalanceAdjustmentModalOpen.set(false)"
                class="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-medium hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Закрити
              </button>
            </div>
          </div>
        </div>
      }

      <!-- ======================================================== -->
      <!-- MODAL: ADD / EDIT PROVIDER DEPOSIT                       -->
      <!-- ======================================================== -->
      @if (isDepositModalOpen()) {
        <div class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 flex items-center justify-center">
          <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden my-auto border border-slate-200 flex flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)]">
            <!-- Modal Header (pinned at top) -->
            <div class="flex items-center justify-between px-5 sm:px-6 py-4 bg-slate-900 text-white shrink-0">
              <div class="flex items-center gap-2.5">
                <div class="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                  <mat-icon class="text-xl">{{ editingDepositId() ? 'edit_note' : 'add_card' }}</mat-icon>
                </div>
                <div>
                  <h2 class="text-base font-semibold tracking-tight">
                    {{ editingDepositId() ? 'Редагування поповнення рахунку' : 'Поповнення акаунту провайдера' }}
                  </h2>
                  <p class="text-xs text-slate-400">Внесення суми в $ та витрат у гривнях з комісією</p>
                </div>
              </div>
              <button
                type="button"
                (click)="isDepositModalOpen.set(false)"
                class="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <mat-icon>close</mat-icon>
              </button>
            </div>

            <!-- Form (Scrollable body with pinned actions) -->
            <form [formGroup]="depositForm" (ngSubmit)="saveDeposit()" class="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div class="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1 overscroll-contain">
                <!-- USD Amount -->
                <div>
                  <label for="deposit-amount-usd" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Сума, що зарахована на рахунок ($ USD) <span class="text-rose-500">*</span>
                  </label>
                  <div class="relative">
                    <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 font-bold text-sm">
                      $
                    </span>
                    <input
                      id="deposit-amount-usd"
                      type="number"
                      min="1"
                      step="1"
                      formControlName="amountUsd"
                      placeholder="напр. 50"
                      class="w-full pl-8 pr-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-base font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                  <p class="text-2xs text-slate-500 mt-1">Ця сума в доларах буде списуватись за абонентів ($1 або $2)</p>
                </div>

                <!-- Spent UAH (including commission) -->
                <div>
                  <label for="deposit-spent-uah" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Витрачено в гривнях (₴ UAH з урахуванням комісії) <span class="text-rose-500">*</span>
                  </label>
                  <div class="relative">
                    <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 font-bold text-sm">
                      ₴
                    </span>
                    <input
                      id="deposit-spent-uah"
                      type="number"
                      min="1"
                      step="10"
                      formControlName="spentUah"
                      placeholder="напр. 2100"
                      class="w-full pl-8 pr-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-base font-bold text-rose-700 focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                  <p class="text-2xs text-slate-500 mt-1">
                    Ця сума піде в <strong>мінус (-)</strong> у вашому гривневому бюджеті
                  </p>
                </div>

                <!-- Live Calculated Effective Rate -->
                <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs flex items-center justify-between">
                  <span class="text-slate-600">Розрахунковий курс (з комісією):</span>
                  <strong class="text-slate-900 font-mono text-sm">
                    {{ calculatedRate() }} ₴ / $
                  </strong>
                </div>

                <!-- Date & Payment Method -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label for="deposit-date" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                      Дата поповнення
                    </label>
                    <input
                      id="deposit-date"
                      type="date"
                      formControlName="date"
                      class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
                    />
                  </div>

                  <div>
                    <label for="deposit-method" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                      Спосіб оплати
                    </label>
                    <input
                      id="deposit-method"
                      type="text"
                      formControlName="paymentMethod"
                      placeholder="Монобанк, Крипта..."
                      class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>

                <!-- Note -->
                <div>
                  <label for="deposit-note" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Примітка / Коментар
                  </label>
                  <input
                    id="deposit-note"
                    type="text"
                    formControlName="note"
                    placeholder="напр. Поповнення через P2P"
                    class="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              <!-- Action Buttons -->
              <div class="flex items-center justify-end gap-3 px-5 sm:px-6 py-3.5 bg-slate-50 border-t border-slate-200 shrink-0">
                <button
                  type="button"
                  (click)="isDepositModalOpen.set(false)"
                  class="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  [disabled]="depositForm.invalid || isSubmitting()"
                  class="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white text-sm font-semibold flex items-center gap-2 cursor-pointer transition-colors shadow-xs"
                >
                  <mat-icon class="text-base">save</mat-icon>
                  <span>{{ editingDepositId() ? 'Зберегти зміни' : 'Внести поповнення' }}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- ======================================================== -->
      <!-- MODAL: EDIT CLIENT PAYMENT FROM LEDGER                   -->
      <!-- ======================================================== -->
      @if (isEditPaymentModalOpen()) {
        <div class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 flex items-center justify-center">
          <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden my-auto border border-slate-200 flex flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)]">
            <div class="flex items-center justify-between px-5 sm:px-6 py-4 bg-slate-900 text-white shrink-0">
              <div class="flex items-center gap-2.5">
                <div class="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                  <mat-icon class="text-xl">edit_note</mat-icon>
                </div>
                <div>
                  <h2 class="text-base font-semibold tracking-tight">Редагування оплати клієнта</h2>
                  <p class="text-xs text-slate-400">Оновлення суми або коментаря</p>
                </div>
              </div>
              <button
                type="button"
                (click)="isEditPaymentModalOpen.set(false)"
                class="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <mat-icon>close</mat-icon>
              </button>
            </div>

            <form [formGroup]="editPaymentForm" (ngSubmit)="saveLedgerPaymentEdit()" class="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div class="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1 overscroll-contain">
                <div>
                  <label for="ledger-edit-client" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Ім'я абонента
                  </label>
                  <input
                    id="ledger-edit-client"
                    type="text"
                    formControlName="clientName"
                    class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label for="ledger-edit-amount" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                      Сума (грн) <span class="text-rose-500">*</span>
                    </label>
                    <div class="relative">
                      <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 font-bold text-sm">₴</span>
                      <input
                        id="ledger-edit-amount"
                        type="number"
                        min="1"
                        step="10"
                        formControlName="amount"
                        class="w-full pl-8 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-base font-bold text-emerald-700 focus:outline-none focus:border-emerald-600"
                      />
                    </div>
                  </div>

                  <div>
                    <label for="ledger-edit-date" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                      Дата оплати
                    </label>
                    <input
                      id="ledger-edit-date"
                      type="date"
                      formControlName="date"
                      class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>

                <div>
                  <label for="ledger-edit-note" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Примітка
                  </label>
                  <input
                    id="ledger-edit-note"
                    type="text"
                    formControlName="note"
                    placeholder="Коментар"
                    class="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              <div class="flex items-center justify-end gap-3 px-5 sm:px-6 py-3.5 bg-slate-50 border-t border-slate-200 shrink-0">
                <button
                  type="button"
                  (click)="isEditPaymentModalOpen.set(false)"
                  class="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  [disabled]="editPaymentForm.invalid || isSubmitting()"
                  class="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white text-sm font-semibold flex items-center gap-2 cursor-pointer transition-colors shadow-xs"
                >
                  <mat-icon class="text-base">save</mat-icon>
                  <span>Зберегти зміни</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      }
    </div>
  `,
})
export class BudgetView {
  readonly dataService = inject(IptvData);
  private readonly tgApp = inject(TelegramWebApp);
  readonly Math = Math;

  readonly budgetSummary = this.dataService.budgetSummary;
  readonly deposits = this.dataService.deposits;
  readonly ledger = this.dataService.ledger;
  readonly accounts = this.dataService.accounts;
  readonly clients = this.dataService.clients;
  readonly providerAdjustments = this.dataService.providerAdjustments;
  readonly providerBalanceUsd = this.dataService.providerBalanceUsd;

  readonly activeViewMode = signal<'ledger' | 'deposits'>('ledger');
  readonly ledgerFilter = signal<LedgerFilter>('all');
  readonly isDepositModalOpen = signal(false);
  readonly editingDepositId = signal<string | null>(null);

  readonly isEditPaymentModalOpen = signal(false);
  readonly editingPaymentId = signal<string | null>(null);

  // Custom Ledger Modal
  readonly isCustomLedgerModalOpen = signal(false);
  readonly editingLedgerId = signal<string | null>(null);

  // Balance Adjustment / Audit Modal
  readonly isBalanceAdjustmentModalOpen = signal(false);
  readonly balanceCalibTab = signal<BalanceCalibTab>('exact');

  readonly isSubmitting = signal(false);

  // Forms
  readonly depositForm = new FormGroup({
    amountUsd: new FormControl<number>(50, [Validators.required, Validators.min(1)]),
    spentUah: new FormControl<number>(2100, [Validators.required, Validators.min(1)]),
    date: new FormControl(new Date().toISOString().split('T')[0]),
    paymentMethod: new FormControl('Монобанк'),
    note: new FormControl(''),
  });

  readonly editPaymentForm = new FormGroup({
    clientName: new FormControl<string>('', [Validators.required]),
    amount: new FormControl<number>(100, [Validators.required, Validators.min(1)]),
    date: new FormControl<string>(''),
    note: new FormControl<string>(''),
  });

  readonly customLedgerForm = new FormGroup({
    type: new FormControl<LedgerEntryType>('income', [Validators.required]),
    category: new FormControl<LedgerCategory>('client_payment', [Validators.required]),
    clientId: new FormControl<string>(''),
    accountId: new FormControl<string>(''),
    title: new FormControl<string>('', [Validators.required]),
    amountUah: new FormControl<number>(100, [Validators.required, Validators.min(0)]),
    amountUsd: new FormControl<number | null>(null),
    date: new FormControl<string>(new Date().toISOString().split('T')[0], [Validators.required]),
    paymentMethod: new FormControl<string>('Монобанк'),
    note: new FormControl<string>(''),
  });

  // Balance Controls
  readonly exactBalanceControl = new FormControl<number | null>(null);
  readonly exactBalanceNoteControl = new FormControl<string>('Калібрування за даними білінгу провайдера');

  readonly deltaAmountControl = new FormControl<number | null>(null);
  readonly deltaDateControl = new FormControl<string>(new Date().toISOString().split('T')[0]);
  readonly deltaNoteControl = new FormControl<string>('Коригування балансу');

  readonly calculatedRate = computed(() => {
    const usd = Number(this.depositForm.controls.amountUsd.value) || 0;
    const uah = Number(this.depositForm.controls.spentUah.value) || 0;
    if (usd <= 0) return '0.00';
    return (uah / usd).toFixed(2);
  });

  readonly runwayMonths = computed(() => {
    const balance = this.providerBalanceUsd();
    const burn = this.budgetSummary()?.monthlyBurnUsd || 0;
    if (burn <= 0) return 0;
    return Math.floor(balance / burn);
  });

  readonly filteredLedger = computed(() => {
    const list = this.ledger();
    const filter = this.ledgerFilter();
    if (filter === 'all') return list;
    if (filter === 'income') return list.filter((i) => i.type === 'income');
    if (filter === 'expense') return list.filter((i) => i.type === 'expense' || i.type === 'deduction');
    return list.filter((i) => i.type === filter);
  });

  readonly calculatedAdjustmentDelta = computed(() => {
    const target = Number(this.exactBalanceControl.value);
    if (isNaN(target)) return 0;
    const current = this.providerBalanceUsd();
    return Math.round((target - current) * 100) / 100;
  });

  // DEPOSIT ACTIONS
  openAddDepositModal(): void {
    this.editingDepositId.set(null);
    const today = new Date().toISOString().split('T')[0];
    this.depositForm.reset({
      amountUsd: 50,
      spentUah: 2150,
      date: today,
      paymentMethod: 'Монобанк',
      note: '',
    });
    this.tgApp.hapticImpact('light');
    this.isDepositModalOpen.set(true);
  }

  openAddDepositModalFromBalance(): void {
    this.isBalanceAdjustmentModalOpen.set(false);
    this.openAddDepositModal();
  }

  openEditDepositModal(dep: ProviderDeposit): void {
    this.editingDepositId.set(dep.id);
    this.depositForm.setValue({
      amountUsd: dep.amountUsd,
      spentUah: dep.spentUah,
      date: dep.date || new Date().toISOString().split('T')[0],
      paymentMethod: dep.paymentMethod || 'Картка банку',
      note: dep.note || '',
    });
    this.tgApp.hapticImpact('light');
    this.isDepositModalOpen.set(true);
  }

  async saveDeposit(): Promise<void> {
    if (this.depositForm.invalid) return;
    this.isSubmitting.set(true);
    try {
      const val = this.depositForm.getRawValue();
      const editId = this.editingDepositId();

      let success = false;
      if (editId) {
        success = await this.dataService.updateDeposit(editId, {
          amountUsd: Number(val.amountUsd),
          spentUah: Number(val.spentUah),
          date: val.date || undefined,
          paymentMethod: val.paymentMethod || undefined,
          note: val.note || undefined,
        });
      } else {
        success = await this.dataService.addDeposit({
          amountUsd: Number(val.amountUsd),
          spentUah: Number(val.spentUah),
          date: val.date || undefined,
          paymentMethod: val.paymentMethod || undefined,
          note: val.note || undefined,
        });
      }

      if (success) {
        this.tgApp.hapticNotification('success');
        this.isDepositModalOpen.set(false);
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async deleteDepositConfirm(dep: ProviderDeposit): Promise<void> {
    this.tgApp.hapticImpact('medium');
    const ok = confirm(`Ви дійсно бажаєте видалити запис поповнення на $${dep.amountUsd} (${dep.spentUah} грн)?`);
    if (ok) {
      await this.dataService.deleteDeposit(dep.id);
      this.tgApp.hapticNotification('warning');
    }
  }

  // CUSTOM LEDGER ENTRY ACTIONS
  openAddLedgerModal(): void {
    this.editingLedgerId.set(null);
    const today = new Date().toISOString().split('T')[0];
    this.customLedgerForm.reset({
      type: 'income',
      category: 'client_payment',
      clientId: '',
      accountId: '',
      title: 'Оплата від абонента',
      amountUah: 100,
      amountUsd: null,
      date: today,
      paymentMethod: 'Монобанк',
      note: '',
    });
    this.tgApp.hapticImpact('light');
    this.isCustomLedgerModalOpen.set(true);
  }

  setLedgerType(type: LedgerEntryType): void {
    this.customLedgerForm.controls.type.setValue(type);
  }

  onLedgerCategoryChange(): void {
    const cat = this.customLedgerForm.controls.category.value;
    if (cat === 'client_payment') {
      this.customLedgerForm.controls.type.setValue('income');
      this.customLedgerForm.controls.title.setValue('Оплата від абонента');
    } else if (cat === 'account_payment') {
      this.customLedgerForm.controls.type.setValue('expense');
      this.customLedgerForm.controls.title.setValue('Оплата за акаунт провайдера');
    } else if (cat === 'provider_topup') {
      this.customLedgerForm.controls.type.setValue('expense');
      this.customLedgerForm.controls.title.setValue('Поповнення балансу провайдера');
    } else if (cat === 'provider_adjustment') {
      this.customLedgerForm.controls.title.setValue('Коригування балансу провайдера');
    }
  }

  onClientSelected(): void {
    const cId = this.customLedgerForm.controls.clientId.value;
    if (!cId) return;
    const client = this.clients().find((c) => c.id === cId);
    if (client) {
      this.customLedgerForm.controls.title.setValue(`Оплата від абонента: ${client.fullName}`);
      this.customLedgerForm.controls.amountUah.setValue(client.monthlyPrice || 100);
      this.customLedgerForm.controls.type.setValue('income');
    }
  }

  onAccountSelected(): void {
    const accId = this.customLedgerForm.controls.accountId.value;
    if (!accId) return;
    const acc = this.accounts().find((a) => a.id === accId);
    if (acc) {
      this.customLedgerForm.controls.title.setValue(`Оплата за акаунт: ${acc.name}`);
      this.customLedgerForm.controls.amountUsd.setValue(acc.pricePerMonthUsd || 1);
      this.customLedgerForm.controls.type.setValue('expense');
    }
  }

  async saveCustomLedgerEntry(): Promise<void> {
    if (this.customLedgerForm.invalid) return;
    this.isSubmitting.set(true);
    try {
      const val = this.customLedgerForm.getRawValue();
      const editId = this.editingLedgerId();

      let clientName: string | undefined;
      if (val.clientId) {
        const c = this.clients().find((item) => item.id === val.clientId);
        if (c) clientName = c.fullName;
      }

      let accountName: string | undefined;
      if (val.accountId) {
        const a = this.accounts().find((item) => item.id === val.accountId);
        if (a) accountName = a.name;
      }

      const numUah = Number(val.amountUah) || 0;
      const signedUah = val.type === 'expense' ? -Math.abs(numUah) : Math.abs(numUah);
      const rawUsd = val.amountUsd !== null && val.amountUsd !== undefined ? Number(val.amountUsd) : undefined;
      
      let numUsd: number | undefined = undefined;
      if (rawUsd !== undefined && !isNaN(rawUsd) && rawUsd !== 0) {
        if (val.type === 'expense' && val.category !== 'provider_topup') {
          numUsd = -Math.abs(rawUsd);
        } else if (val.category === 'provider_topup' || val.type === 'income') {
          numUsd = Math.abs(rawUsd);
        } else {
          numUsd = rawUsd;
        }
      }

      let success = false;
      if (editId) {
        success = await this.dataService.updateLedgerEntry(editId, {
          type: val.type || 'income',
          category: val.category || 'custom',
          clientId: val.clientId || undefined,
          clientName,
          accountId: val.accountId || undefined,
          accountName,
          title: val.title?.trim() || 'Операція білінгу',
          amountUah: signedUah,
          amountUsd: numUsd,
          date: val.date || new Date().toISOString().split('T')[0],
          paymentMethod: val.paymentMethod || undefined,
          note: val.note || undefined,
        });
      } else {
        success = await this.dataService.addLedgerEntry({
          type: val.type || 'income',
          category: val.category || 'custom',
          clientId: val.clientId || undefined,
          clientName,
          accountId: val.accountId || undefined,
          accountName,
          title: val.title?.trim() || 'Операція білінгу',
          amountUah: signedUah,
          amountUsd: numUsd,
          date: val.date || new Date().toISOString().split('T')[0],
          paymentMethod: val.paymentMethod || undefined,
          note: val.note || undefined,
        });
      }

      if (success) {
        this.tgApp.hapticNotification('success');
        this.isCustomLedgerModalOpen.set(false);
        this.editingLedgerId.set(null);
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }

  // GENERAL LEDGER ACTIONS
  editLedgerItem(item: BudgetLedgerItem): void {
    this.editingLedgerId.set(item.id);

    let formType: LedgerEntryType = 'expense';
    if (item.type === 'income') {
      formType = 'income';
    } else {
      formType = 'expense';
    }

    let formCategory: LedgerCategory = 'custom';
    if (item.category) {
      formCategory = item.category;
    } else if (item.type === 'deduction') {
      formCategory = 'account_payment';
    } else if (item.type === 'income') {
      formCategory = 'client_payment';
    }

    const absUah = Math.abs(item.amountUah || 0);
    const usdVal = item.amountUsd !== undefined && item.amountUsd !== null ? Math.abs(item.amountUsd) : null;

    this.customLedgerForm.setValue({
      type: formType,
      category: formCategory,
      clientId: item.clientId || '',
      accountId: item.accountId || '',
      title: item.title,
      amountUah: absUah,
      amountUsd: usdVal,
      date: item.date ? item.date.split('T')[0] : new Date().toISOString().split('T')[0],
      paymentMethod: item.paymentMethod || 'Монобанк',
      note: item.note || '',
    });

    this.tgApp.hapticImpact('light');
    this.isCustomLedgerModalOpen.set(true);
  }

  deleteCurrentEditingLedgerItem(): void {
    const editId = this.editingLedgerId();
    if (!editId) return;
    const item = this.ledger().find((l) => l.id === editId);
    if (item) {
      this.deleteLedgerItem(item);
    }
  }

  async deleteLedgerItem(item: BudgetLedgerItem): Promise<void> {
    this.tgApp.hapticImpact('medium');

    const desc = item.amountUah !== 0
      ? `${item.amountUah > 0 ? '+' : ''}${item.amountUah} ₴`
      : (item.amountUsd ? `${item.amountUsd > 0 ? '+' : ''}$${item.amountUsd} USD` : '');

    const ok = confirm(
      `Ви дійсно бажаєте видалити цей запис:\n"${item.title}" (${this.formatDate(item.date)}${desc ? ', ' + desc : ''})?\n\nЗапис буде видалено з журналу, а залишок балансу провайдера та бюджет буде автоматично перераховано.`
    );

    if (ok) {
      this.isSubmitting.set(true);
      try {
        const success = await this.dataService.deleteLedgerEntry(item.id);
        if (success) {
          this.tgApp.hapticNotification('warning');
          this.isCustomLedgerModalOpen.set(false);
          this.editingLedgerId.set(null);
        }
      } finally {
        this.isSubmitting.set(false);
      }
    }
  }

  // BALANCE AUDIT & ADJUSTMENT ACTIONS
  openBalanceAdjustmentModal(): void {
    const curBalance = this.providerBalanceUsd();
    this.exactBalanceControl.setValue(curBalance);
    this.exactBalanceNoteControl.setValue('Калібрування за даними білінгу провайдера');
    this.deltaAmountControl.setValue(null);
    this.deltaDateControl.setValue(new Date().toISOString().split('T')[0]);
    this.deltaNoteControl.setValue('Коригування балансу');
    this.balanceCalibTab.set('exact');
    this.tgApp.hapticImpact('light');
    this.isBalanceAdjustmentModalOpen.set(true);
  }

  async applyExactBalanceCalibration(): Promise<void> {
    const target = this.exactBalanceControl.value;
    if (target === null || isNaN(Number(target))) return;

    this.isSubmitting.set(true);
    try {
      const success = await this.dataService.adjustProviderBalance({
        targetBalanceUsd: Number(target),
        note: this.exactBalanceNoteControl.value || `Калібрування до балансу $${target}`,
      });
      if (success) {
        this.tgApp.hapticNotification('success');
        this.isBalanceAdjustmentModalOpen.set(false);
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async applyDeltaAdjustment(): Promise<void> {
    const delta = this.deltaAmountControl.value;
    if (delta === null || isNaN(Number(delta))) return;

    this.isSubmitting.set(true);
    try {
      const success = await this.dataService.adjustProviderBalance({
        amountUsd: Number(delta),
        date: this.deltaDateControl.value || undefined,
        note: this.deltaNoteControl.value || 'Ручне коригування балансу',
      });
      if (success) {
        this.tgApp.hapticNotification('success');
        this.isBalanceAdjustmentModalOpen.set(false);
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async deleteAdjustmentConfirm(adj: ProviderBalanceAdjustment): Promise<void> {
    this.tgApp.hapticImpact('medium');
    const ok = confirm(`Ви дійсно бажаєте видалити коригування на $${adj.amountUsd} (${adj.note || 'без примітки'})?`);
    if (ok) {
      await this.dataService.deleteProviderAdjustment(adj.id);
      this.tgApp.hapticNotification('warning');
    }
  }

  async saveLedgerPaymentEdit(): Promise<void> {
    const id = this.editingPaymentId();
    if (!id || this.editPaymentForm.invalid) return;

    this.isSubmitting.set(true);
    try {
      const val = this.editPaymentForm.getRawValue();
      const success = await this.dataService.updatePayment(id, {
        clientName: val.clientName || undefined,
        amount: Number(val.amount),
        date: val.date || undefined,
        note: val.note || '',
      });
      if (success) {
        this.tgApp.hapticNotification('success');
        this.isEditPaymentModalOpen.set(false);
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }

  formatDate(dateStr?: string): string {
    if (!dateStr) return '—';
    return formatDateUa(dateStr, true);
  }

  formatDateTime(isoDate?: string): string {
    if (!isoDate) return '—';
    try {
      const parts = isoDate.split('T');
      const datePart = formatDateUa(parts[0], true);
      if (parts[1]) {
        const timePart = parts[1].substring(0, 5);
        return `${datePart}, ${timePart}`;
      }
      return datePart;
    } catch {
      return isoDate;
    }
  }
}
