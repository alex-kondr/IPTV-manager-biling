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
} from '../../models/client.model';
import { TelegramWebApp } from '../../services/telegram-web-app';

type LedgerFilter = 'all' | 'income' | 'expense' | 'deduction';

@Component({
  selector: 'app-budget-view',
  imports: [ReactiveFormsModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div id="budget-dashboard-container" class="space-y-4 sm:space-y-6">
      <!-- Top Cards: Dual Currency Accounting (USD for Provider, UAH for Owner Budget) -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <!-- Card 1: Provider Balance USD -->
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
              <div class="text-3xl font-extrabold font-mono text-white tracking-tight">
                \${{ (budgetSummary()?.providerBalanceUsd || 0).toFixed(2) }}
              </div>
              <p class="text-xs text-slate-300 mt-1">
                Списується щомісяця автоматично за діючими лініями IPTV
              </p>
            </div>
          </div>

          <div class="mt-4 pt-3 border-t border-slate-700/60 flex items-center justify-between text-2xs text-slate-300 font-mono">
            <span>Всього поповнено: \${{ (budgetSummary()?.totalDepositedUsd || 0).toFixed(2) }}</span>
            <span class="text-rose-300">Списано: -\${{ (budgetSummary()?.totalDeductedUsd || 0).toFixed(2) }}</span>
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

        <!-- Card 4: Effective Average Rate & Top Up Button -->
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

          <div class="mt-4 pt-3 border-t border-slate-100">
            <button
              id="btn-open-deposit-modal"
              type="button"
              (click)="openAddDepositModal()"
              class="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <mat-icon class="text-base">add_card</mat-icon>
              <span>Поповнити акаунт ($ / ₴)</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Main Ledger & Deposit History Section -->
      <div class="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <!-- Section Header with Sub-tabs and Search/Filter -->
        <div class="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div class="flex items-center gap-2">
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

          <!-- Quick Filters if in Ledger mode -->
          @if (activeViewMode() === 'ledger') {
            <div class="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs self-start sm:self-auto">
              <button
                type="button"
                (click)="ledgerFilter.set('all')"
                [class.bg-white]="ledgerFilter() === 'all'"
                [class.text-slate-900]="ledgerFilter() === 'all'"
                [class.shadow-2xs]="ledgerFilter() === 'all'"
                [class.text-slate-500]="ledgerFilter() !== 'all'"
                class="px-2.5 py-1 rounded-lg font-medium cursor-pointer transition-all"
              >
                Всі операції
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
                Поповнення (-)
              </button>
            </div>
          }
        </div>

        <!-- VIEW 1: COMBINED CASHFLOW LEDGER -->
        @if (activeViewMode() === 'ledger') {
          <div class="overflow-x-auto">
            @if (filteredLedger().length === 0) {
              <div class="p-8 text-center text-slate-500 text-sm">
                Записів у журналі не знайдено.
              </div>
            } @else {
              <table class="w-full text-left text-xs sm:text-sm">
                <thead class="bg-slate-50 text-slate-500 uppercase tracking-wider text-2xs border-b border-slate-200">
                  <tr>
                    <th class="px-4 py-3 font-semibold">Дата</th>
                    <th class="px-4 py-3 font-semibold">Тип операції</th>
                    <th class="px-4 py-3 font-semibold">Опис / Абонент</th>
                    <th class="px-4 py-3 font-semibold">Деталі</th>
                    <th class="px-4 py-3 font-semibold text-right">Сума (грн у білінгу)</th>
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
                            Поповнення провайдера (-)
                          </span>
                        } @else {
                          <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-2xs font-bold">
                            <mat-icon class="text-xs">sync_alt</mat-icon>
                            Списання лінії ($)
                          </span>
                        }
                      </td>
                      <td class="px-4 py-3">
                        <strong class="text-slate-900 block font-semibold">{{ item.title }}</strong>
                        <span class="text-slate-500 text-2xs">{{ item.subtitle }}</span>
                      </td>
                      <td class="px-4 py-3 text-slate-600 text-2xs">
                        @if (item.paymentMethod) {
                          <span class="px-1.5 py-0.5 bg-slate-100 rounded text-slate-700 font-medium mr-1.5">
                            {{ item.paymentMethod }}
                          </span>
                        }
                        @if (item.amountUsd) {
                          <span class="font-mono text-slate-800 font-semibold">
                            (\${{ item.amountUsd }})
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
                        {{ item.amountUah > 0 ? '+' : '' }}{{ item.amountUah !== 0 ? item.amountUah.toLocaleString('uk-UA') + ' ₴' : (item.amountUsd ? '-$' + Math.abs(item.amountUsd) : '—') }}
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
            }
          </div>
        }

        <!-- VIEW 2: PROVIDER DEPOSITS LIST -->
        @if (activeViewMode() === 'deposits') {
          <div class="overflow-x-auto">
            @if (deposits().length === 0) {
              <div class="p-8 text-center text-slate-500 text-sm">
                Поповнень ще не зафіксовано. Натисніть кнопку вище, щоб додати суму поповнення.
              </div>
            } @else {
              <table class="w-full text-left text-xs sm:text-sm">
                <thead class="bg-slate-50 text-slate-500 uppercase tracking-wider text-2xs border-b border-slate-200">
                  <tr>
                    <th class="px-4 py-3 font-semibold">Дата поповнення</th>
                    <th class="px-4 py-3 font-semibold text-right">Сума на баланс ($)</th>
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
                      <td class="px-4 py-3 text-right font-mono font-bold text-rose-600 whitespace-nowrap text-sm">
                        -{{ dep.spentUah.toLocaleString('uk-UA') }} ₴
                      </td>
                      <td class="px-4 py-3 text-right font-mono text-slate-700 whitespace-nowrap">
                        {{ (dep.exchangeRate || (dep.spentUah / dep.amountUsd)).toFixed(2) }} ₴/$
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
            }
          </div>
        }
      </div>

      <!-- MODAL: ADD / EDIT PROVIDER DEPOSIT -->
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
                      placeholder="Монобанк, Крипта, USDT"
                      class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>

                <!-- Note -->
                <div>
                  <label for="deposit-note" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Примітка
                  </label>
                  <input
                    id="deposit-note"
                    type="text"
                    formControlName="note"
                    placeholder="напр. Поповнення на 3 місяці вперед"
                    class="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              <!-- Actions (pinned at bottom) -->
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
                  <mat-icon class="text-base">{{ editingDepositId() ? 'save' : 'check' }}</mat-icon>
                  <span>{{ editingDepositId() ? 'Зберегти зміни' : 'Зафіксувати поповнення' }}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- MODAL: EDIT PAYMENT (FROM LEDGER) -->
      @if (isEditPaymentModalOpen()) {
        <div class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 flex items-center justify-center">
          <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden my-auto border border-slate-200 flex flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)]">
            <div class="flex items-center justify-between px-5 sm:px-6 py-4 bg-slate-900 text-white shrink-0">
              <div class="flex items-center gap-2.5">
                <div class="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                  <mat-icon class="text-xl">edit_note</mat-icon>
                </div>
                <div>
                  <h2 class="text-base font-semibold tracking-tight">Редагування оплати абонента</h2>
                  <p class="text-xs text-slate-400">Коригування надходження у білінг</p>
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
                      Сума внеску (₴) <span class="text-rose-500">*</span>
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
  private readonly dataService = inject(IptvData);
  private readonly tgApp = inject(TelegramWebApp);
  readonly Math = Math;

  readonly budgetSummary = this.dataService.budgetSummary;
  readonly deposits = this.dataService.deposits;
  readonly ledger = this.dataService.ledger;
  readonly accounts = this.dataService.accounts;

  readonly activeViewMode = signal<'ledger' | 'deposits'>('ledger');
  readonly ledgerFilter = signal<LedgerFilter>('all');
  readonly isDepositModalOpen = signal(false);
  readonly editingDepositId = signal<string | null>(null);

  readonly isEditPaymentModalOpen = signal(false);
  readonly editingPaymentId = signal<string | null>(null);

  readonly isSubmitting = signal(false);

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

  readonly calculatedRate = computed(() => {
    const usd = Number(this.depositForm.controls.amountUsd.value) || 0;
    const uah = Number(this.depositForm.controls.spentUah.value) || 0;
    if (usd <= 0) return '0.00';
    return (uah / usd).toFixed(2);
  });

  readonly runwayMonths = computed(() => {
    const balance = this.budgetSummary()?.providerBalanceUsd || 0;
    const burn = this.budgetSummary()?.monthlyBurnUsd || 0;
    if (burn <= 0) return 0;
    return Math.floor(balance / burn);
  });

  readonly filteredLedger = computed(() => {
    const list = this.ledger();
    const filter = this.ledgerFilter();
    if (filter === 'all') return list;
    return list.filter((i) => i.type === filter);
  });

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

  editLedgerItem(item: BudgetLedgerItem): void {
    if (item.type === 'income') {
      // Find matching payment
      const payment = this.dataService.payments().find((p) => p.id === item.id);
      if (payment) {
        this.editingPaymentId.set(payment.id);
        this.editPaymentForm.setValue({
          clientName: payment.clientName,
          amount: payment.amount,
          date: payment.date ? payment.date.split('T')[0] : '',
          note: payment.note || '',
        });
        this.isEditPaymentModalOpen.set(true);
      } else {
        this.editingPaymentId.set(item.id);
        this.editPaymentForm.setValue({
          clientName: item.title.replace('Оплата від абонента: ', ''),
          amount: item.amountUah,
          date: item.date ? item.date.split('T')[0] : '',
          note: item.note || '',
        });
        this.isEditPaymentModalOpen.set(true);
      }
    } else if (item.type === 'expense') {
      const dep = this.deposits().find((d) => d.id === item.id);
      if (dep) {
        this.openEditDepositModal(dep);
      } else {
        this.openAddDepositModal();
      }
    } else {
      // Deduction: find account with this renewal
      alert(`Списання за акаунт "${item.title}". Ви можете налаштувати або продовжити його у вкладці "Акаунти IPTV".`);
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

  async deleteLedgerItem(item: BudgetLedgerItem): Promise<void> {
    this.tgApp.hapticImpact('medium');
    if (item.type === 'income') {
      const ok = confirm(`Ви дійсно бажаєте видалити запис про надходження ${item.amountUah} грн (${item.title})?`);
      if (ok) {
        await this.dataService.deletePayment(item.id);
        this.tgApp.hapticNotification('warning');
      }
    } else if (item.type === 'expense') {
      const dep = this.deposits().find((d) => d.id === item.id);
      if (dep) {
        await this.deleteDepositConfirm(dep);
      } else {
        await this.dataService.deleteDeposit(item.id);
      }
    } else {
      // Deduction from renewal
      const ok = confirm(`Ви дійсно бажаєте видалити запис про списання "${item.title}"?`);
      if (ok) {
        // Search through accounts
        for (const acc of this.accounts()) {
          const ren = acc.renewals?.find((r) => r.id === item.id);
          if (ren) {
            await this.dataService.deleteAccountRenewal(acc.id, ren.id);
            break;
          }
        }
      }
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
