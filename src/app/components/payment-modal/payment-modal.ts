import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  OnInit,
} from '@angular/core';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import {
  Client,
  calculateExtension,
  formatDateUa,
  DEFAULT_VIBER_RENEWAL_TEMPLATE,
  interpolateViberMessage,
} from '../../models/client.model';
import { IptvData } from '../../services/iptv-data';

@Component({
  selector: 'app-payment-modal',
  imports: [ReactiveFormsModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      id="payment-modal-overlay"
      class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 flex items-center justify-center"
    >
      <div
        id="payment-modal-container"
        class="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden my-auto border border-slate-200 flex flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)]"
      >
        @if (!showViberProposal()) {
          <!-- Header (pinned at top) -->
          <div class="flex items-center justify-between px-5 sm:px-6 py-4 bg-emerald-700 text-white shrink-0">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                <mat-icon class="text-xl">payments</mat-icon>
              </div>
              <div>
                <h2 class="text-base font-semibold tracking-tight">Внесення оплати за IPTV</h2>
                <p class="text-xs text-emerald-100">Автоматичне продовження терміну дії число в число</p>
              </div>
            </div>
            <button
              id="btn-close-payment-modal"
              type="button"
              (click)="modalClose.emit()"
              class="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-emerald-800 border-0 bg-transparent cursor-pointer"
            >
              <mat-icon>close</mat-icon>
            </button>
          </div>

          <!-- Client Brief Summary (pinned) -->
          <div class="px-5 sm:px-6 py-3 bg-emerald-50/70 border-b border-emerald-100 flex items-center justify-between text-xs shrink-0">
            <div>
              <div class="flex items-center gap-2">
                <strong class="text-sm font-semibold text-slate-900">{{ client().fullName }}</strong>
                <span class="px-2 py-0.5 rounded text-2xs font-bold bg-emerald-200/80 text-emerald-900">
                  {{ client().subscriptionPlan === '2usd' ? 'Тариф $2 (150 грн)' : 'Тариф $1 (100 грн)' }}
                </span>
              </div>
              <span class="text-slate-600 mt-0.5 block">Логін: <code class="font-mono">{{ client().iptvLogin }}</code></span>
            </div>
            <div class="text-right">
              <div class="text-slate-500">Поточний термін:</div>
              <strong class="text-slate-900 font-semibold">{{ formatDate(client().activeUntil) }}</strong>
            </div>
          </div>

          <!-- Payment Calculation Form -->
          <form [formGroup]="form" (ngSubmit)="onSubmit()" class="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div class="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1 overscroll-contain">
              <!-- Quick Preset Amount Buttons -->
              <div>
                <span class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Швидкий вибір суми (місяці)
                </span>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    (click)="setQuickMonths(1)"
                    [class.border-emerald-600]="form.controls.amount.value === client().monthlyPrice * 1"
                    [class.bg-emerald-50]="form.controls.amount.value === client().monthlyPrice * 1"
                    [class.text-emerald-900]="form.controls.amount.value === client().monthlyPrice * 1"
                    [class.font-bold]="form.controls.amount.value === client().monthlyPrice * 1"
                    class="py-2 px-1 text-center rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/70 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
                  >
                    1 міс ({{ client().monthlyPrice }} ₴)
                  </button>
                  <button
                    type="button"
                    (click)="setQuickMonths(2)"
                    [class.border-emerald-600]="form.controls.amount.value === client().monthlyPrice * 2"
                    [class.bg-emerald-50]="form.controls.amount.value === client().monthlyPrice * 2"
                    [class.text-emerald-900]="form.controls.amount.value === client().monthlyPrice * 2"
                    [class.font-bold]="form.controls.amount.value === client().monthlyPrice * 2"
                    class="py-2 px-1 text-center rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/70 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
                  >
                    2 міс ({{ client().monthlyPrice * 2 }} ₴)
                  </button>
                  <button
                    type="button"
                    (click)="setQuickMonths(3)"
                    [class.border-emerald-600]="form.controls.amount.value === client().monthlyPrice * 3"
                    [class.bg-emerald-50]="form.controls.amount.value === client().monthlyPrice * 3"
                    [class.text-emerald-900]="form.controls.amount.value === client().monthlyPrice * 3"
                    [class.font-bold]="form.controls.amount.value === client().monthlyPrice * 3"
                    class="py-2 px-1 text-center rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/70 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
                  >
                    3 міс ({{ client().monthlyPrice * 3 }} ₴)
                  </button>
                  <button
                    type="button"
                    (click)="setQuickMonths(4)"
                    [class.border-emerald-600]="form.controls.amount.value === client().monthlyPrice * 4"
                    [class.bg-emerald-50]="form.controls.amount.value === client().monthlyPrice * 4"
                    [class.text-emerald-900]="form.controls.amount.value === client().monthlyPrice * 4"
                    [class.font-bold]="form.controls.amount.value === client().monthlyPrice * 4"
                    class="py-2 px-1 text-center rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/70 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
                  >
                    4 міс ({{ client().monthlyPrice * 4 }} ₴)
                  </button>
                  <button
                    type="button"
                    (click)="setQuickMonths(5)"
                    [class.border-emerald-600]="form.controls.amount.value === client().monthlyPrice * 5"
                    [class.bg-emerald-50]="form.controls.amount.value === client().monthlyPrice * 5"
                    [class.text-emerald-900]="form.controls.amount.value === client().monthlyPrice * 5"
                    [class.font-bold]="form.controls.amount.value === client().monthlyPrice * 5"
                    class="py-2 px-1 text-center rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/70 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
                  >
                    5 міс ({{ client().monthlyPrice * 5 }} ₴)
                  </button>
                  <button
                    type="button"
                    (click)="setQuickMonths(6)"
                    [class.border-emerald-600]="form.controls.amount.value === client().monthlyPrice * 6"
                    [class.bg-emerald-50]="form.controls.amount.value === client().monthlyPrice * 6"
                    [class.text-emerald-900]="form.controls.amount.value === client().monthlyPrice * 6"
                    [class.font-bold]="form.controls.amount.value === client().monthlyPrice * 6"
                    class="py-2 px-1 text-center rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/70 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
                  >
                    6 міс ({{ client().monthlyPrice * 6 }} ₴)
                  </button>
                  <button
                    type="button"
                    (click)="setQuickMonths(12)"
                    [class.border-emerald-600]="form.controls.amount.value === client().monthlyPrice * 12"
                    [class.bg-emerald-50]="form.controls.amount.value === client().monthlyPrice * 12"
                    [class.text-emerald-900]="form.controls.amount.value === client().monthlyPrice * 12"
                    [class.font-bold]="form.controls.amount.value === client().monthlyPrice * 12"
                    class="col-span-2 py-2 px-1 text-center rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/70 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
                  >
                    12 міс / 1 рік ({{ client().monthlyPrice * 12 }} ₴)
                  </button>
                </div>
              </div>

              <!-- Deposit Amount & Monthly Price info -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label for="payment-amount-input" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Сума внесених коштів (грн) <span class="text-rose-500">*</span>
                  </label>
                  <div class="relative">
                    <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 font-bold">
                      ₴
                    </span>
                    <input
                      id="payment-amount-input"
                      type="number"
                      min="1"
                      step="5"
                      formControlName="amount"
                      class="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-base font-bold text-emerald-800 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                    />
                  </div>
                </div>

                <div>
                  <span class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Тариф абонента
                  </span>
                  <div class="py-2.5 px-3.5 bg-slate-100 rounded-xl text-sm font-semibold text-slate-700">
                    {{ client().monthlyPrice }} ₴ / місяць
                  </div>
                </div>
              </div>

              <!-- LIVE AUTO-CALCULATION RESULTS BOX -->
              <div class="p-4 rounded-xl bg-slate-900 text-white space-y-3">
                <div class="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span class="text-xs font-medium text-slate-400">Розрахунок білінгу:</span>
                  <span class="text-xs font-mono text-emerald-400">Число-в-число</span>
                </div>

                <div class="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span class="text-slate-400 block">Попередній баланс:</span>
                    <strong class="text-slate-200 text-sm">{{ client().balance || 0 }} ₴</strong>
                  </div>
                  <div>
                    <span class="text-slate-400 block">Доступно до розподілу:</span>
                    <strong class="text-emerald-400 text-sm font-bold">{{ calculation().totalAvailable }} ₴</strong>
                  </div>
                </div>

                <div class="pt-2 border-t border-slate-800 flex items-center justify-between">
                  <div>
                    <span class="text-slate-400 text-xs block">Буде продовжено на:</span>
                    <span class="text-base font-bold text-white">
                      +{{ calculation().monthsAdded }} {{ calculation().monthsAdded === 1 ? 'місяць' : (calculation().monthsAdded >= 2 && calculation().monthsAdded <= 4 ? 'місяці' : 'місяців') }}
                    </span>
                  </div>
                  <div class="text-right">
                    <span class="text-slate-400 text-xs block">Залишок на балансі:</span>
                    <span class="text-base font-bold text-amber-300">
                      {{ calculation().leftoverBalance }} ₴
                    </span>
                  </div>
                </div>

                <!-- New Expiration Date Display -->
                <div class="pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs">
                  <div class="flex items-center gap-1.5 text-emerald-300">
                    <mat-icon class="text-base">calendar_today</mat-icon>
                    <span>
                      Новий термін: <strong>{{ formatDate(calculation().newActiveUntil) }}</strong>
                    </span>
                  </div>
                  <div class="text-emerald-400 font-semibold text-2xs flex items-center gap-1">
                    <mat-icon class="text-xs">arrow_upward</mat-icon>
                    <span>Дохід: +{{ form.controls.amount.value || 0 }} ₴</span>
                  </div>
                </div>
              </div>

              <!-- Note / Comment -->
              <div>
                <label for="payment-note-input" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Примітка або номер квитанції
                </label>
                <input
                  id="payment-note-input"
                  type="text"
                  formControlName="note"
                  placeholder="напр. Оплата на картку Монобанк"
                  class="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-emerald-600"
                />
              </div>
            </div>

            <!-- Actions Footer -->
            <div class="flex items-center justify-end gap-3 px-5 sm:px-6 py-3.5 bg-slate-50 border-t border-slate-200 shrink-0">
              <button
                id="btn-cancel-payment"
                type="button"
                (click)="modalClose.emit()"
                class="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Скасувати
              </button>
              <button
                id="btn-submit-payment"
                type="submit"
                [disabled]="form.invalid || isProcessing()"
                class="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white text-sm font-semibold shadow-xs flex items-center gap-2 transition-colors cursor-pointer border-0"
              >
                <mat-icon class="text-base">check_circle</mat-icon>
                <span>{{ isProcessing() ? 'Збереження...' : 'Провести оплату (' + form.controls.amount.value + ' ₴)' }}</span>
              </button>
            </div>
          </form>
        @} @else {
          <!-- VIBER MESSAGE PROPOSAL SCREEN -->
          <div class="flex flex-col flex-1">
            <!-- Header -->
            <div class="px-6 py-5 bg-purple-700 text-white flex items-center gap-3 shrink-0">
              <div class="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <mat-icon class="text-xl">chat</mat-icon>
              </div>
              <div>
                <h3 class="text-base font-bold">Оплату успішно проведено! 🎉</h3>
                <p class="text-xs text-purple-200">Бажаєте надіслати підтвердження у Viber?</p>
              </div>
            </div>

            <!-- Body -->
            <div class="p-6 space-y-4 flex-1">
              <p class="text-xs text-slate-600">
                Запис оплати успішно додано до бази даних. Скористайтеся можливістю миттєво надіслати квитанцію абоненту <strong>{{ client().fullName }}</strong> на Viber:
              </p>

              <!-- Viber Phone and Template Preview -->
              <div class="p-4 bg-purple-50 rounded-xl border border-purple-200/80 space-y-2.5 text-xs">
                <div class="flex justify-between items-center text-purple-950 font-semibold">
                  <span>Номер телефону:</span>
                  <span class="font-mono bg-purple-200/50 px-2 py-0.5 rounded">{{ client().phone || '—' }}</span>
                </div>
                <div class="pt-2 border-t border-purple-200/50">
                  <span class="text-purple-900 font-bold block mb-1">Текст повідомлення:</span>
                  <div class="p-3 bg-white rounded-lg border border-purple-100 font-medium text-slate-700 whitespace-pre-wrap leading-relaxed select-all">
                    {{ viberMessageText() }}
                  </div>
                </div>
              </div>

              <div class="text-3xs text-slate-400 italic">
                * Натискання кнопки нижче відкриє застосунок Viber з цим повідомленням у вікні введення чату з абонентом.
              </div>
            </div>

            <!-- Actions Footer -->
            <div class="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-200">
              <button
                type="button"
                (click)="closeAndFinish()"
                class="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-100 transition-colors cursor-pointer bg-white"
              >
                Пропустити
              </button>
              <button
                type="button"
                (click)="sendViberConfirmation()"
                class="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white text-sm font-semibold flex items-center gap-2 transition-colors border-0 cursor-pointer shadow-md"
              >
                <mat-icon class="text-base">send</mat-icon>
                <span>Надіслати у Viber</span>
              </button>
            </div>
          </div>
        @}
      </div>
    </div>
  `,
})
export class PaymentModal implements OnInit {
  private readonly dataService = inject(IptvData);

  readonly client = input.required<Client>();
  readonly modalClose = output<void>();
  readonly paymentCompleted = output<unknown>();

  readonly isProcessing = signal(false);
  readonly showViberProposal = signal(false);
  readonly viberMessageText = signal('');

  readonly form = new FormGroup({
    amount: new FormControl<number>(100, [Validators.required, Validators.min(1)]),
    note: new FormControl('Оплата на картку'),
  });

  readonly calculation = computed(() => {
    const c = this.client();
    const amount = Number(this.form.controls.amount.value) || 0;
    return calculateExtension(c.activeUntil, c.monthlyPrice, c.balance || 0, amount);
  });

  ngOnInit(): void {
    const price = this.client().monthlyPrice || 100;
    this.form.patchValue({
      amount: price,
      note: 'Оплата за послуги IPTV',
    });
  }

  setQuickMonths(months: number): void {
    const target = this.client().monthlyPrice * months;
    this.form.patchValue({ amount: target });
  }

  formatDate(dateStr: string): string {
    return formatDateUa(dateStr, true);
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;

    this.isProcessing.set(true);
    const val = this.form.getRawValue();

    try {
      const res = await this.dataService.processPayment({
        clientId: this.client().id,
        amount: Number(val.amount),
        note: val.note || '',
        sendViberReceipt: false, // Disables automatic Telegram bot receipts, Viber is offered in prompt UI instead
      });

      // Prepare Viber notification text using customized template
      const settings = this.dataService.settings();
      const tmpl = settings.viberRenewalMessageTemplate || DEFAULT_VIBER_RENEWAL_TEMPLATE;
      const newExpiry = this.formatDate(this.calculation().newActiveUntil);
      const todayFormatted = formatDateUa(new Date().toISOString().split('T')[0], true);

      const generatedText = interpolateViberMessage(tmpl, {
        name: this.client().fullName,
        login: this.client().iptvLogin,
        phone: this.client().phone,
        activeUntil: newExpiry,
        currentDate: todayFormatted,
        amount: Number(val.amount),
        price: this.client().monthlyPrice || settings.defaultMonthlyPrice || 100,
        card: settings.cardRequisites || '',
        balance: this.calculation().newBalance,
        months: this.calculation().monthsAdded,
        device: this.client().deviceInfo || '',
        notes: this.client().notes || '',
      });

      this.viberMessageText.set(generatedText);

      this.paymentCompleted.emit(res);
      this.showViberProposal.set(true);
    } finally {
      this.isProcessing.set(false);
    }
  }

  sendViberConfirmation(): void {
    const c = this.client();
    const cleanPhone = c.phone.replace(/\D/g, '');
    let formattedPhone = cleanPhone;
    if (cleanPhone.length === 9) {
      formattedPhone = `380${cleanPhone}`;
    } else if (cleanPhone.length === 10 && cleanPhone.startsWith('0')) {
      formattedPhone = `380${cleanPhone.substring(1)}`;
    }

    const text = this.viberMessageText();
    const viberUrl = `viber://chat?number=${formattedPhone}&draft=${encodeURIComponent(text)}`;
    window.open(viberUrl, '_blank');
    this.modalClose.emit();
  }

  closeAndFinish(): void {
    this.modalClose.emit();
  }
}
