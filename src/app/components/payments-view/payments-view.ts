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
  Client,
  PaymentTransaction,
  formatDateUa,
  getDaysRemaining,
  DEFAULT_VIBER_REMINDER_TEMPLATE,
  interpolateViberMessage,
} from '../../models/client.model';
import { PaymentModal } from '../payment-modal/payment-modal';

@Component({
  selector: 'app-payments-view',
  imports: [ReactiveFormsModule, MatIconModule, PaymentModal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div id="payments-history-container" class="space-y-6">
      <!-- VIEW TOGGLE & SUMMARY HEADER -->
      <div class="p-4 bg-white rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <!-- Tab Mode Switcher -->
        <div class="flex items-center p-1 bg-slate-100 rounded-xl">
          <button
            type="button"
            (click)="activeTab.set('upcoming')"
            [class]="activeTab() === 'upcoming' ? 'bg-white text-emerald-800 shadow-2xs font-semibold' : 'text-slate-600 hover:text-slate-900'"
            class="px-3.5 py-1.5 text-xs sm:text-sm rounded-lg transition-all flex items-center gap-2 cursor-pointer border-0"
          >
            <mat-icon class="text-base">event</mat-icon>
            <span>Події списання (активні)</span>
            @if (expiringSoonCount() > 0) {
              <span class="px-1.5 py-0.2 rounded-full text-2xs bg-rose-100 text-rose-700 font-bold">
                {{ expiringSoonCount() }}
              </span>
            }
          </button>
          <button
            type="button"
            (click)="activeTab.set('history')"
            [class]="activeTab() === 'history' ? 'bg-white text-emerald-800 shadow-2xs font-semibold' : 'text-slate-600 hover:text-slate-900'"
            class="px-3.5 py-1.5 text-xs sm:text-sm rounded-lg transition-all flex items-center gap-2 cursor-pointer border-0"
          >
            <mat-icon class="text-base">receipt_long</mat-icon>
            <span>Історія поповнень</span>
          </button>
        </div>

        <div class="flex items-center gap-2 text-xs text-slate-500">
          <mat-icon class="text-base text-slate-400">info_outline</mat-icon>
          <span>Швидке створення подій в Google Calendar</span>
        </div>
      </div>

      <!-- TAB 1: LIST OF EXPIRATION EVENTS -->
      @if (activeTab() === 'upcoming') {
        <div class="space-y-4">
          <!-- Filter and Search -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-slate-200/90 shadow-2xs">
            <h3 class="text-sm font-bold text-slate-900">Майбутні закінчення термінів дії (списання)</h3>
            <div class="text-xs text-slate-500">
              Всього активних абонентів: <strong class="text-slate-800">{{ upcomingExpirations().length }}</strong>
            </div>
          </div>

          <!-- Chronological Expirations List -->
          <div class="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
            @if (upcomingExpirations().length === 0) {
              <div class="p-8 text-center text-slate-500 text-sm">
                <mat-icon class="text-3xl text-slate-300 mb-1">sentiment_dissatisfied</mat-icon>
                <p>Немає активних абонентів із запланованими списаннями.</p>
              </div>
            } @else {
              <!-- Mobile view -->
              <div class="sm:hidden divide-y divide-slate-100">
                @for (c of upcomingExpirations(); track c.id) {
                  <div class="p-4 space-y-3 hover:bg-slate-50/50 transition-colors">
                    <div class="flex items-start justify-between gap-2">
                      <div>
                        <div class="font-bold text-sm text-slate-900">{{ c.fullName }}</div>
                        <div class="text-2xs text-slate-500 font-mono mt-0.5">
                          Логін: {{ c.iptvLogin }} • {{ c.phone || 'Без телефону' }}
                        </div>
                      </div>
                      <span
                        [class]="
                          c.daysLeft < 0
                            ? 'bg-rose-100 text-rose-800'
                            : (c.daysLeft <= 7 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800')
                        "
                        class="px-2.5 py-0.5 rounded-full text-2xs font-bold shrink-0 shadow-2xs"
                      >
                        {{ getDaysText(c.daysLeft) }}
                      </span>
                    </div>

                    <div class="flex items-center justify-between text-xs bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                      <div>
                        <span class="text-slate-400 text-3xs block">Дата списання:</span>
                        <strong class="text-slate-800">{{ formatDate(c.activeUntil) }}</strong>
                      </div>
                      <div class="text-right">
                        <span class="text-slate-400 text-3xs block">Тариф:</span>
                        <strong class="text-emerald-700 font-bold">{{ c.monthlyPrice }} ₴/міс</strong>
                      </div>
                    </div>

                    <!-- Actions -->
                    <div class="flex flex-wrap items-center justify-end gap-2 pt-1 border-t border-slate-100">
                      <button
                        type="button"
                        (click)="sendViberReminder(c)"
                        class="px-2.5 py-2 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 text-xs font-semibold flex items-center gap-1 transition-colors border border-purple-100 cursor-pointer"
                      >
                        <mat-icon class="text-sm">chat</mat-icon>
                        <span>Viber</span>
                      </button>

                      <button
                        type="button"
                        (click)="openPaymentModalForClient(c)"
                        class="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1 transition-colors shadow-2xs cursor-pointer border-0"
                      >
                        <mat-icon class="text-sm">payments</mat-icon>
                        <span>Поповнити</span>
                      </button>
                    </div>
                  </div>
                }
              </div>

              <!-- Desktop table view -->
              <div class="hidden sm:block overflow-x-auto">
                <table class="w-full text-left text-xs sm:text-sm">
                  <thead class="bg-slate-50 text-slate-600 uppercase tracking-wider text-2xs border-b border-slate-200">
                    <tr>
                      <th class="px-4 py-3.5 font-semibold">Дата списання</th>
                      <th class="px-4 py-3.5 font-semibold">Статус</th>
                      <th class="px-4 py-3.5 font-semibold">Абонент</th>
                      <th class="px-4 py-3.5 font-semibold font-mono">Логін IPTV</th>
                      <th class="px-4 py-3.5 font-semibold">Телефон</th>
                      <th class="px-4 py-3.5 font-semibold text-right">Тариф</th>
                      <th class="px-4 py-3.5 font-semibold text-right">Баланс</th>
                      <th class="px-4 py-3.5 font-semibold text-right">Дії</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100">
                    @for (c of upcomingExpirations(); track c.id) {
                      <tr class="hover:bg-slate-50/60 transition-colors">
                        <td class="px-4 py-3.5 font-bold text-slate-900 whitespace-nowrap">
                          {{ formatDate(c.activeUntil) }}
                        </td>
                        <td class="px-4 py-3.5 whitespace-nowrap">
                          <span
                            [class]="
                              c.daysLeft < 0
                                ? 'bg-rose-100 text-rose-800 border-rose-200'
                                : (c.daysLeft <= 7 ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-emerald-100 text-emerald-800 border-emerald-200')
                            "
                            class="px-2 py-0.5 rounded-full text-2xs font-bold border"
                          >
                            {{ getDaysText(c.daysLeft) }}
                          </span>
                        </td>
                        <td class="px-4 py-3.5 font-semibold text-slate-800 whitespace-nowrap">
                          {{ c.fullName }}
                        </td>
                        <td class="px-4 py-3.5 font-mono text-xs text-slate-600">
                          {{ c.iptvLogin }}
                        </td>
                        <td class="px-4 py-3.5 text-slate-600 whitespace-nowrap">
                          {{ c.phone || '—' }}
                        </td>
                        <td class="px-4 py-3.5 text-right font-bold text-slate-900">
                          {{ c.monthlyPrice }} ₴
                        </td>
                        <td class="px-4 py-3.5 text-right font-semibold text-slate-600">
                          {{ c.balance || 0 }} ₴
                        </td>
                        <td class="px-4 py-3.5 whitespace-nowrap">
                          <div class="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              (click)="sendViberReminder(c)"
                              class="px-2 py-1.5 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 text-2xs font-semibold flex items-center gap-1 transition-all border border-purple-100 cursor-pointer"
                              title="Надіслати нагадування у Viber"
                            >
                              <mat-icon class="text-sm">chat</mat-icon>
                              <span>Нагадати Viber</span>
                            </button>

                            <button
                              type="button"
                              (click)="openPaymentModalForClient(c)"
                              class="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-2xs font-semibold flex items-center gap-1 transition-all cursor-pointer border-0 shadow-2xs"
                            >
                              <mat-icon class="text-sm">payments</mat-icon>
                              <span>Оплата</span>
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
        </div>
      }

      <!-- TAB 2: PAYMENTS TRANSACTIONS HISTORY TABLE -->
      @if (activeTab() === 'history') {
        <div class="space-y-4">
          <!-- Search & Filters Header -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-slate-200/90 shadow-2xs">
            <div class="relative flex-1 max-w-md">
              <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                <mat-icon class="text-lg">search</mat-icon>
              </span>
              <input
                id="payments-search-input"
                type="text"
                [formControl]="searchControl"
                placeholder="Пошук оплат за абонентом або приміткою..."
                class="w-full pl-10 pr-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-emerald-600 transition-colors"
              />
            </div>

            <div class="flex items-center gap-4 text-xs text-slate-600">
              <span>Всього платежів: <strong class="text-slate-900">{{ filteredPayments().length }}</strong></span>
              <span>Загальна сума: <strong class="text-emerald-700 text-sm font-bold">{{ totalFilteredSum().toLocaleString('uk-UA') }} ₴</strong></span>
            </div>
          </div>

          <!-- Transactions List -->
          <div class="rounded-2xl bg-white border border-slate-200/90 shadow-2xs overflow-hidden">
            @if (filteredPayments().length === 0) {
              <div class="p-8 text-center text-slate-500 text-sm">
                <mat-icon class="text-3xl text-slate-300 mb-1">receipt_long</mat-icon>
                <p>Платежів за вашим запитом не знайдено.</p>
              </div>
            } @else {
              <!-- Mobile Payment History Cards (sm:hidden) -->
              <div class="sm:hidden divide-y divide-slate-100">
                @for (p of filteredPayments(); track p.id) {
                  <div class="p-4 hover:bg-slate-50/80 transition-colors space-y-2.5">
                    <div class="flex items-start justify-between gap-2">
                      <div>
                        <div class="font-bold text-sm text-slate-900">{{ p.clientName }}</div>
                        <div class="text-2xs text-slate-500 mt-0.5 flex items-center gap-1">
                          <mat-icon class="text-xs text-slate-400">schedule</mat-icon>
                          <span>{{ formatDateTime(p.date) }}</span>
                        </div>
                      </div>
                      <div class="text-right">
                        <span class="inline-flex items-center px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 font-bold text-xs">
                          +{{ p.amount }} ₴
                        </span>
                        <span class="block text-3xs text-emerald-700 font-semibold mt-0.5">
                          +{{ p.monthsAdded }} міс.
                        </span>
                      </div>
                    </div>

                    <div class="grid grid-cols-2 gap-2 text-xs bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                      <div>
                        <span class="text-slate-400 text-2xs block">Новий термін:</span>
                        <strong class="text-slate-800 text-xs">до {{ formatDate(p.newActiveUntil) }}</strong>
                      </div>
                      <div class="text-right">
                        <span class="text-slate-400 text-2xs block">Залишок:</span>
                        <strong class="text-slate-700 text-xs">{{ p.newBalance }} ₴</strong>
                      </div>
                    </div>

                    @if (p.note) {
                      <p class="text-2xs text-slate-500 italic bg-amber-50/60 p-2 rounded-lg border border-amber-100">
                        {{ p.note }}
                      </p>
                    }

                    <div class="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                      <button
                        type="button"
                        (click)="openEditPaymentModal(p)"
                        class="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 active:bg-slate-200 inline-flex items-center gap-1 cursor-pointer"
                        title="Редагувати платіж"
                      >
                        <mat-icon class="text-xs text-slate-500">edit</mat-icon>
                        <span>Редагувати</span>
                      </button>
                      <button
                        type="button"
                        (click)="confirmDeletePayment(p)"
                        class="px-2.5 py-1.5 text-xs rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 active:bg-rose-100 inline-flex items-center gap-1 cursor-pointer"
                        title="Видалити платіж"
                      >
                        <mat-icon class="text-xs text-rose-500">delete</mat-icon>
                        <span>Видалити</span>
                      </button>
                    </div>
                  </div>
                }
              </div>

              <!-- Desktop Table (hidden sm:block) -->
              <div class="hidden sm:block overflow-x-auto">
                <table class="w-full text-left text-xs sm:text-sm">
                  <thead class="bg-slate-50 text-slate-600 uppercase tracking-wider text-2xs border-b border-slate-200">
                    <tr>
                      <th class="px-4 py-3 font-semibold">Дата оплати</th>
                      <th class="px-4 py-3 font-semibold">Абонент</th>
                      <th class="px-4 py-3 font-semibold text-right">Сума внеску</th>
                      <th class="px-4 py-3 font-semibold text-center">Продовжено</th>
                      <th class="px-4 py-3 font-semibold">Новий термін</th>
                      <th class="px-4 py-3 font-semibold text-right">Залишок</th>
                      <th class="px-4 py-3 font-semibold">Примітка</th>
                      <th class="px-4 py-3 font-semibold text-right">Дії</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100">
                    @for (p of filteredPayments(); track p.id) {
                      <tr class="hover:bg-slate-50/70 transition-colors">
                        <td class="px-4 py-3 text-slate-500 whitespace-nowrap">
                          {{ formatDateTime(p.date) }}
                        </td>
                        <td class="px-4 py-3 font-semibold text-slate-900">
                          {{ p.clientName }}
                        </td>
                        <td class="px-4 py-3 text-right whitespace-nowrap">
                          <span class="inline-flex items-center px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-bold font-mono">
                            +{{ p.amount }} ₴
                          </span>
                        </td>
                        <td class="px-4 py-3 text-center text-slate-700 font-medium">
                          +{{ p.monthsAdded }} міс.
                        </td>
                        <td class="px-4 py-3 font-bold text-slate-800 whitespace-nowrap">
                          до {{ formatDate(p.newActiveUntil) }}
                        </td>
                        <td class="px-4 py-3 text-right font-mono text-slate-600">
                          {{ p.newBalance }} ₴
                        </td>
                        <td class="px-4 py-3 text-slate-500 italic max-w-xs truncate" [title]="p.note">
                          {{ p.note || '—' }}
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap text-right">
                          <div class="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              (click)="openEditPaymentModal(p)"
                              class="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 cursor-pointer"
                              title="Редагувати платіж"
                            >
                              <mat-icon class="text-sm">edit</mat-icon>
                            </button>
                            <button
                              type="button"
                              (click)="confirmDeletePayment(p)"
                              class="p-1.5 rounded-lg border border-rose-200 text-rose-500 hover:text-rose-700 hover:bg-rose-50 cursor-pointer"
                              title="Видалити платіж"
                            >
                              <mat-icon class="text-sm">delete</mat-icon>
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
        </div>
      }
    </div>

    <!-- Pinned payment modal when requested -->
    @if (selectedClientForPayment(); as client) {
      <app-payment-modal
        [client]="client"
        (modalClose)="selectedClientForPayment.set(null)"
        (paymentCompleted)="onPaymentModalCompleted()"
      ></app-payment-modal>
    }

    <!-- Edit payment modal dialog overlay -->
    @if (isEditModalOpen()) {
      <div class="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 flex items-center justify-center">
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
          <div class="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
            <h3 class="text-sm font-bold">Редагувати платіжну транзакцію</h3>
            <button type="button" (click)="isEditModalOpen.set(false)" class="text-slate-400 hover:text-white border-0 bg-transparent cursor-pointer">
              <mat-icon>close</mat-icon>
            </button>
          </div>
          <form [formGroup]="editForm" (ngSubmit)="savePaymentEdit()" class="p-5 space-y-4">
            <div>
              <label for="edit-client-name" class="block text-2xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Абонент</label>
              <input id="edit-client-name" type="text" formControlName="clientName" class="w-full px-3 py-2 bg-slate-100 rounded-xl text-xs font-semibold" readonly />
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label for="edit-payment-amount" class="block text-2xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Сума (₴)</label>
                <input id="edit-payment-amount" type="number" formControlName="amount" class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold" />
              </div>
              <div>
                <label for="edit-payment-months" class="block text-2xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Продовжено (міс)</label>
                <input id="edit-payment-months" type="number" formControlName="monthsAdded" class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs" />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label for="edit-payment-active-until" class="block text-2xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Діє до</label>
                <input id="edit-payment-active-until" type="date" formControlName="newActiveUntil" class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs" />
              </div>
              <div>
                <label for="edit-payment-balance" class="block text-2xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Залишок (₴)</label>
                <input id="edit-payment-balance" type="number" formControlName="newBalance" class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold" />
              </div>
            </div>

            <div>
              <label for="edit-payment-note" class="block text-2xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Примітка</label>
              <input id="edit-payment-note" type="text" formControlName="note" class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs" />
            </div>

            <div class="flex items-center justify-end gap-2 pt-2">
              <button type="button" (click)="isEditModalOpen.set(false)" class="px-4 py-2 text-xs font-semibold text-slate-500 bg-slate-50 rounded-xl hover:bg-slate-100 cursor-pointer border-0">Скасувати</button>
              <button type="submit" [disabled]="editForm.invalid || isSubmitting()" class="px-5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl cursor-pointer border-0">Зберегти</button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
})
export class PaymentsView {
  private readonly dataService = inject(IptvData);

  readonly activeTab = signal<'upcoming' | 'history'>('upcoming');

  readonly selectedClientForPayment = signal<Client | null>(null);

  readonly searchControl = new FormControl('');
  readonly payments = this.dataService.payments;
  readonly clients = this.dataService.clients;

  readonly isEditModalOpen = signal<boolean>(false);
  readonly isSubmitting = signal<boolean>(false);
  readonly currentEditingPaymentId = signal<string | null>(null);

  readonly editForm = new FormGroup({
    clientName: new FormControl<string>('', [Validators.required]),
    amount: new FormControl<number>(100, [Validators.required, Validators.min(1)]),
    date: new FormControl<string>(''),
    monthsAdded: new FormControl<number>(1, [Validators.required, Validators.min(0)]),
    newActiveUntil: new FormControl<string>('', [Validators.required]),
    newBalance: new FormControl<number>(0, [Validators.required, Validators.min(0)]),
    note: new FormControl<string>(''),
    syncWithClient: new FormControl<boolean>(true),
  });

  readonly upcomingExpirations = computed(() => {
    const list = this.clients();
    return list
      .filter((c) => c.status !== 'paused' && c.activeUntil)
      .map((c) => {
        const daysLeft = getDaysRemaining(c.activeUntil);
        return {
          ...c,
          daysLeft,
          expiryFormatted: formatDateUa(c.activeUntil, true),
        };
      })
      .sort((a, b) => new Date(a.activeUntil).getTime() - new Date(b.activeUntil).getTime());
  });

  readonly expiringSoonCount = computed(() => {
    const daysLimit = this.dataService.settings().reminderDaysBefore || 7;
    return this.upcomingExpirations().filter((c) => c.daysLeft <= daysLimit && c.daysLeft >= 0).length;
  });

  readonly filteredPayments = computed(() => {
    const list = this.payments();
    const query = (this.searchControl.value || '').toLowerCase().trim();

    if (!query) return list;
    return list.filter(
      (p) =>
        p.clientName.toLowerCase().includes(query) ||
        (p.note && p.note.toLowerCase().includes(query))
    );
  });

  readonly totalFilteredSum = computed(() => {
    return this.filteredPayments().reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
  });

  formatDate(dateStr: string): string {
    return formatDateUa(dateStr, true);
  }

  formatDateTime(isoStr: string): string {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return isoStr;
    }
  }

  getDaysText(days: number): string {
    if (days < 0) return `Прострочено на ${Math.abs(days)} дн.`;
    if (days === 0) return 'Сьогодні!';
    if (days === 1) return 'Завтра';
    return `Залишилось ${days} дн.`;
  }

  sendViberReminder(client: Client): void {
    const cleanPhone = client.phone.replace(/\D/g, '');
    let formattedPhone = cleanPhone;
    if (cleanPhone.length === 9) {
      formattedPhone = `380${cleanPhone}`;
    } else if (cleanPhone.length === 10 && cleanPhone.startsWith('0')) {
      formattedPhone = `380${cleanPhone.substring(1)}`;
    }
    const settings = this.dataService.settings();
    const tmpl = settings.viberReminderMessageTemplate || DEFAULT_VIBER_REMINDER_TEMPLATE;
    const expiry = this.formatDate(client.activeUntil);
    const todayFormatted = formatDateUa(new Date().toISOString().split('T')[0], true);
    const amount = client.monthlyPrice || settings.defaultMonthlyPrice || 100;

    const text = interpolateViberMessage(tmpl, {
      name: client.fullName,
      login: client.iptvLogin,
      phone: client.phone,
      activeUntil: expiry,
      currentDate: todayFormatted,
      amount: amount,
      price: client.monthlyPrice || settings.defaultMonthlyPrice || 100,
      card: settings.cardRequisites || '',
      balance: client.balance || 0,
      months: 1,
      device: client.deviceInfo || '',
      notes: client.notes || '',
    });

    const viberUrl = `viber://chat?number=${formattedPhone}&draft=${encodeURIComponent(text)}`;
    window.open(viberUrl, '_blank');
  }

  openPaymentModalForClient(client: Client): void {
    this.selectedClientForPayment.set(client);
  }

  onPaymentModalCompleted(): void {
    this.selectedClientForPayment.set(null);
  }

  openEditPaymentModal(payment: PaymentTransaction): void {
    this.currentEditingPaymentId.set(payment.id);
    const dateStr = payment.date ? payment.date.split('T')[0] : new Date().toISOString().split('T')[0];

    this.editForm.setValue({
      clientName: payment.clientName || '',
      amount: payment.amount || 0,
      date: dateStr,
      monthsAdded: payment.monthsAdded || 0,
      newActiveUntil: payment.newActiveUntil || '',
      newBalance: payment.newBalance || 0,
      note: payment.note || '',
      syncWithClient: true,
    });

    this.isEditModalOpen.set(true);
  }

  async savePaymentEdit(): Promise<void> {
    const id = this.currentEditingPaymentId();
    if (!id || this.editForm.invalid) return;

    this.isSubmitting.set(true);
    try {
      const val = this.editForm.getRawValue();
      const success = await this.dataService.updatePayment(id, {
        clientName: val.clientName || undefined,
        amount: Number(val.amount),
        date: val.date || undefined,
        monthsAdded: Number(val.monthsAdded),
        newActiveUntil: val.newActiveUntil || undefined,
        newBalance: Number(val.newBalance),
        note: val.note || '',
        syncWithClient: Boolean(val.syncWithClient),
      });

      if (success) {
        this.isEditModalOpen.set(false);
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async confirmDeletePayment(payment: PaymentTransaction): Promise<void> {
    const ok = confirm(
      `Ви дійсно бажаєте видалити запис оплати на ${payment.amount} грн для абонента "${payment.clientName}"?`
    );
    if (ok) {
      await this.dataService.deletePayment(payment.id);
    }
  }
}
