import {
  ChangeDetectionStrategy,
  Component,
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
  SubscriptionPlanType,
  SUBSCRIPTION_PLANS,
  addMonthsExact,
} from '../../models/client.model';
import { IptvData } from '../../services/iptv-data';

@Component({
  selector: 'app-client-modal',
  imports: [ReactiveFormsModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      id="client-modal-overlay"
      class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4 flex items-end sm:items-center justify-center"
    >
      <div
        id="client-modal-container"
        class="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden my-0 sm:my-auto border border-slate-200 flex flex-col max-h-[92dvh] sm:max-h-[calc(100dvh-2rem)]"
      >
        <!-- Header (pinned at top) -->
        <div class="flex items-center justify-between px-5 sm:px-6 py-4 bg-slate-900 text-white shrink-0">
          <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <mat-icon class="text-xl leading-none">{{ isEditing() ? 'edit_calendar' : 'person_add' }}</mat-icon>
            </div>
            <div>
              <h2 class="text-base font-semibold tracking-tight">
                {{ isEditing() ? 'Редагувати абонента і підписку' : 'Новий абонент IPTV' }}
              </h2>
              <p class="text-xs text-slate-400">
                Ціна, термін дії, баланс та акаунт IPTV
              </p>
            </div>
          </div>
          <button
            id="btn-close-client-modal"
            type="button"
            (click)="modalClose.emit()"
            class="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <mat-icon>close</mat-icon>
          </button>
        </div>

        <!-- Form (Scrollable body with pinned actions) -->
        <form [formGroup]="form" (ngSubmit)="onSubmit()" class="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div class="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1 overscroll-contain">
          <!-- Full Name -->
          <div>
            <label for="client-name-input" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              ПІБ або Ім'я клієнта <span class="text-rose-500">*</span>
            </label>
            <div class="relative">
              <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                <mat-icon class="text-lg">person</mat-icon>
              </span>
              <input
                id="client-name-input"
                type="text"
                formControlName="fullName"
                placeholder="напр. Коваленко Олександр"
                class="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
              />
            </div>
            @if (form.controls.fullName.touched && form.controls.fullName.invalid) {
              <p class="text-xs text-rose-500 mt-1">Будь ласка, вкажіть ім'я абонента</p>
            }
          </div>

          <!-- Notes / Comment (Immediately below Full Name) -->
          <div>
            <label for="client-notes-input" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span>Нотатки / Коментар</span>
              <span class="text-2xs text-slate-400 normal-case font-normal">(адреса, ТВ на кухні тощо)</span>
            </label>
            <textarea
              id="client-notes-input"
              rows="2"
              formControlName="notes"
              placeholder="Адреса, додатковий ТВ або коментар..."
              class="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-emerald-600 resize-none"
            ></textarea>
          </div>

          <!-- Phone & IPTV Login (2 columns on sm+) -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label for="client-phone-input" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Номер телефону <span class="text-rose-500">*</span>
              </label>
              <div class="relative">
                <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                  <mat-icon class="text-lg">phone</mat-icon>
                </span>
                <input
                  id="client-phone-input"
                  type="tel"
                  formControlName="phone"
                  placeholder="+380971234567"
                  class="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                />
              </div>
            </div>

            <div>
              <label for="client-login-input" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Логін / MAC IPTV <span class="text-rose-500">*</span>
              </label>
              <div class="relative">
                <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                  <mat-icon class="text-lg">tv</mat-icon>
                </span>
                <input
                  id="client-login-input"
                  type="text"
                  formControlName="iptvLogin"
                  placeholder="iptv_user01 або 00:1A:..."
                  class="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 font-mono"
                />
              </div>
            </div>
          </div>

          <!-- PLAN SELECTION: 1$ (100 грн) vs 2$ (150 грн) -->
          <div class="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200/90 space-y-2">
            <div class="flex items-center justify-between">
              <span class="block text-xs font-bold text-emerald-950 uppercase tracking-wider">
                Тип підписки IPTV
              </span>
              <span class="text-2xs text-emerald-700">Списання в $ / Оплата в грн</span>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                (click)="selectPlan('1usd')"
                [class.bg-emerald-600]="selectedPlan() === '1usd'"
                [class.text-white]="selectedPlan() === '1usd'"
                [class.shadow-xs]="selectedPlan() === '1usd'"
                [class.bg-white]="selectedPlan() !== '1usd'"
                [class.text-slate-700]="selectedPlan() !== '1usd'"
                [class.border]="selectedPlan() !== '1usd'"
                [class.border-emerald-300]="selectedPlan() !== '1usd'"
                class="p-2.5 rounded-xl text-left transition-all cursor-pointer"
              >
                <div class="flex items-center justify-between">
                  <strong class="text-xs font-bold">Тариф $1</strong>
                  <span class="text-2xs font-mono font-bold" [class.text-emerald-100]="selectedPlan() === '1usd'" [class.text-emerald-700]="selectedPlan() !== '1usd'">-$1 з балансу</span>
                </div>
                <div class="text-xs font-semibold mt-1">100 грн / місяць</div>
                <div class="text-2xs opacity-80 mt-0.5">Базовий пакет каналів</div>
              </button>

              <button
                type="button"
                (click)="selectPlan('2usd')"
                [class.bg-emerald-600]="selectedPlan() === '2usd'"
                [class.text-white]="selectedPlan() === '2usd'"
                [class.shadow-xs]="selectedPlan() === '2usd'"
                [class.bg-white]="selectedPlan() !== '2usd'"
                [class.text-slate-700]="selectedPlan() !== '2usd'"
                [class.border]="selectedPlan() !== '2usd'"
                [class.border-emerald-300]="selectedPlan() !== '2usd'"
                class="p-2.5 rounded-xl text-left transition-all cursor-pointer"
              >
                <div class="flex items-center justify-between">
                  <strong class="text-xs font-bold">Тариф $2</strong>
                  <span class="text-2xs font-mono font-bold" [class.text-emerald-100]="selectedPlan() === '2usd'" [class.text-emerald-700]="selectedPlan() !== '2usd'">-$2 з балансу</span>
                </div>
                <div class="text-xs font-semibold mt-1">150 грн / місяць</div>
                <div class="text-2xs opacity-80 mt-0.5">Преміум канали + Full HD</div>
              </button>
            </div>
          </div>

          <!-- Monthly Price & Balance (editable with quick mobile presets) -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label for="client-price-input" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span>Ціна підписки (грн/міс)</span>
                <span class="text-rose-500 font-bold">*</span>
              </label>
              <div class="relative">
                <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 font-semibold text-sm">
                  ₴
                </span>
                <input
                  id="client-price-input"
                  type="number"
                  min="0"
                  step="10"
                  formControlName="monthlyPrice"
                  class="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:border-emerald-600"
                />
              </div>
              <!-- Quick Price Chips for Mobile -->
              <div class="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <button
                  type="button"
                  (click)="setMonthlyPrice(100)"
                  class="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-semibold cursor-pointer active:scale-95 transition-transform"
                >
                  100 ₴
                </button>
                <button
                  type="button"
                  (click)="setMonthlyPrice(150)"
                  class="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-semibold cursor-pointer active:scale-95 transition-transform"
                >
                  150 ₴
                </button>
                <button
                  type="button"
                  (click)="setMonthlyPrice(200)"
                  class="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-semibold cursor-pointer active:scale-95 transition-transform"
                >
                  200 ₴
                </button>
              </div>
            </div>

            <div>
              <label for="client-balance-input" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Залишок на балансі (грн)
              </label>
              <div class="relative">
                <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 font-semibold text-sm">
                  ₴
                </span>
                <input
                  id="client-balance-input"
                  type="number"
                  min="0"
                  formControlName="balance"
                  class="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-emerald-600"
                />
              </div>
              <!-- Quick Balance Chips for Mobile -->
              <div class="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <button
                  type="button"
                  (click)="setBalance(0)"
                  class="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-semibold cursor-pointer active:scale-95 transition-transform"
                >
                  0 ₴
                </button>
                <button
                  type="button"
                  (click)="setBalance(50)"
                  class="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-semibold cursor-pointer active:scale-95 transition-transform"
                >
                  50 ₴
                </button>
                <button
                  type="button"
                  (click)="addBalance(50)"
                  class="px-2.5 py-1 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-xs font-semibold cursor-pointer active:scale-95 transition-transform"
                >
                  +50 ₴
                </button>
              </div>
            </div>
          </div>

          <!-- PROVIDER ACCOUNT ATTACHMENT (Max 2 users rule) -->
          <div>
            <label for="client-provider-account" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span>Прив'язка до акаунту провайдера</span>
              <span class="text-2xs text-slate-400 normal-case font-normal">(макс 2 клієнти на акаунт)</span>
            </label>
            <div class="relative">
              <select
                id="client-provider-account"
                formControlName="providerAccountId"
                class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-emerald-600"
              >
                <option value="">-- Без прив'язки (видати пізніше) --</option>
                @for (acc of accounts(); track acc.id) {
                  @let isAssignedToThis = client()?.providerAccountId === acc.id;
                  @let count = acc.assignedClientIds.length || 0;
                  @let isFull = count >= 2 && !isAssignedToThis;
                  <option [value]="acc.id" [disabled]="isFull">
                    {{ acc.name }} — {{ acc.login }} [{{ count }}/2 слоти] {{ isFull ? '(Повний)' : (isAssignedToThis ? '✓ Поточний' : '(Вільний слот)') }}
                  </option>
                }
              </select>
            </div>
            <p class="text-2xs text-slate-500 mt-1">
              Один акаунт провайдера видається не більше ніж двом користувачам.
            </p>
          </div>

          <!-- Subscription Dates: Start Date & Active Until (Date to date) -->
          <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                <mat-icon class="text-base text-emerald-600">event_repeat</mat-icon>
                Термін дії підписки (число в число)
              </span>
              <button
                type="button"
                (click)="recalculateOneMonth()"
                class="text-xs text-emerald-700 hover:text-emerald-800 font-semibold underline cursor-pointer"
              >
                +1 міс точно
              </button>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label for="client-start-date" class="block text-xs text-slate-600 mb-1">
                  Дата старту
                </label>
                <input
                  id="client-start-date"
                  type="date"
                  formControlName="startDate"
                  (change)="onStartDateChange()"
                  class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label for="client-active-until" class="block text-xs text-slate-600 mb-1 flex items-center justify-between">
                  <span>Оплачено до (включно)</span>
                  <span class="text-emerald-700 font-bold text-2xs">Активність</span>
                </label>
                <input
                  id="client-active-until"
                  type="date"
                  formControlName="activeUntil"
                  class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-emerald-800 focus:outline-none focus:border-emerald-600"
                />
              </div>
            </div>

            <!-- Quick Mobile Extension Chips for Active Until -->
            <div class="pt-1 border-t border-slate-200/60 flex items-center gap-1.5 flex-wrap">
              <span class="text-2xs text-slate-500 font-medium mr-1">Швидке подовження:</span>
              <button
                type="button"
                (click)="extendActiveUntil(1)"
                class="px-2.5 py-1 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 text-xs font-semibold hover:bg-emerald-100 cursor-pointer active:scale-95 transition-transform"
              >
                +1 міс
              </button>
              <button
                type="button"
                (click)="extendActiveUntil(3)"
                class="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer active:scale-95 transition-transform"
              >
                +3 міс
              </button>
              <button
                type="button"
                (click)="extendActiveUntil(6)"
                class="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer active:scale-95 transition-transform"
              >
                +6 міс
              </button>
              <button
                type="button"
                (click)="extendActiveUntil(12)"
                class="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer active:scale-95 transition-transform"
              >
                +1 рік
              </button>
            </div>
          </div>

          <!-- Device info & notes -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label for="client-device-input" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Пристрій / Модель
              </label>
              <input
                id="client-device-input"
                type="text"
                formControlName="deviceInfo"
                placeholder="Samsung Smart TV, X96"
                class="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-emerald-600"
              />
            </div>

            <div>
              <label for="client-telegram-input" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Акаунт Viber (нік або номер)
              </label>
              <input
                id="client-telegram-input"
                type="text"
                formControlName="telegramUsername"
                placeholder="напр. @username або телефон"
                class="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-emerald-600"
              />
            </div>
          </div>

          </div>

          <!-- Actions Footer (pinned at bottom) -->
          <div class="flex items-center justify-end gap-3 px-5 sm:px-6 py-3.5 bg-slate-50 border-t border-slate-200 shrink-0">
            <button
              id="btn-cancel-client-form"
              type="button"
              (click)="modalClose.emit()"
              class="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Скасувати
            </button>
            <button
              id="btn-save-client-form"
              type="submit"
              [disabled]="form.invalid || isSubmitting()"
              class="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white text-sm font-semibold shadow-xs flex items-center gap-2 transition-colors cursor-pointer"
            >
              <mat-icon class="text-base">check</mat-icon>
              <span>{{ isEditing() ? 'Зберегти зміни' : 'Створити абонента' }}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class ClientModal implements OnInit {
  private readonly dataService = inject(IptvData);

  readonly client = input<Client | null>(null);
  readonly modalClose = output<void>();
  readonly clientSaved = output<Client>();

  readonly isSubmitting = signal(false);
  readonly isEditing = signal(false);
  readonly selectedPlan = signal<SubscriptionPlanType>('1usd');

  readonly accounts = this.dataService.accounts;

  readonly form = new FormGroup({
    fullName: new FormControl('', [Validators.required]),
    phone: new FormControl('', [Validators.required]),
    iptvLogin: new FormControl('', [Validators.required]),
    deviceInfo: new FormControl(''),
    subscriptionPlan: new FormControl<SubscriptionPlanType>('1usd'),
    costUsd: new FormControl<number>(1),
    monthlyPrice: new FormControl<number>(100, [Validators.required, Validators.min(0)]),
    startDate: new FormControl('', [Validators.required]),
    activeUntil: new FormControl('', [Validators.required]),
    balance: new FormControl<number>(0, [Validators.min(0)]),
    providerAccountId: new FormControl<string>(''),
    telegramUsername: new FormControl(''),
    notes: new FormControl(''),
  });

  ngOnInit(): void {
    const existing = this.client();
    const today = new Date().toISOString().split('T')[0];

    if (existing) {
      this.isEditing.set(true);
      const plan = existing.subscriptionPlan || (existing.monthlyPrice >= 150 ? '2usd' : '1usd');
      this.selectedPlan.set(plan);

      this.form.patchValue({
        fullName: existing.fullName,
        phone: existing.phone,
        iptvLogin: existing.iptvLogin,
        deviceInfo: existing.deviceInfo || '',
        subscriptionPlan: plan,
        costUsd: existing.costUsd || (plan === '2usd' ? 2 : 1),
        monthlyPrice: existing.monthlyPrice,
        startDate: existing.startDate,
        activeUntil: existing.activeUntil,
        balance: existing.balance,
        providerAccountId: existing.providerAccountId || '',
        telegramUsername: existing.telegramUsername || existing.viberId || '',
        notes: existing.notes || '',
      });
    } else {
      this.isEditing.set(false);
      this.selectedPlan.set('1usd');
      const nextMonthExact = addMonthsExact(today, 1);

      this.form.patchValue({
        startDate: today,
        activeUntil: nextMonthExact,
        subscriptionPlan: '1usd',
        costUsd: 1,
        monthlyPrice: 100,
        balance: 0,
        providerAccountId: '',
        telegramUsername: '',
      });
    }
  }

  setMonthlyPrice(price: number): void {
    this.form.patchValue({ monthlyPrice: price });
  }

  setBalance(amount: number): void {
    this.form.patchValue({ balance: amount });
  }

  addBalance(amount: number): void {
    const current = Number(this.form.controls.balance.value) || 0;
    this.form.patchValue({ balance: current + amount });
  }

  extendActiveUntil(months: number): void {
    const currentActiveUntil = this.form.controls.activeUntil.value || new Date().toISOString().split('T')[0];
    const newActiveUntil = addMonthsExact(currentActiveUntil, months);
    this.form.patchValue({ activeUntil: newActiveUntil });
  }

  selectPlan(plan: SubscriptionPlanType): void {
    this.selectedPlan.set(plan);
    const planDef = SUBSCRIPTION_PLANS[plan];
    this.form.patchValue({
      subscriptionPlan: plan,
      costUsd: planDef.costUsd,
      monthlyPrice: planDef.priceUah,
    });
  }

  onStartDateChange(): void {
    const start = this.form.controls.startDate.value;
    if (start && !this.isEditing()) {
      const nextMonth = addMonthsExact(start, 1);
      this.form.patchValue({ activeUntil: nextMonth });
    }
  }

  recalculateOneMonth(): void {
    const start = this.form.controls.startDate.value || new Date().toISOString().split('T')[0];
    const nextMonth = addMonthsExact(start, 1);
    this.form.patchValue({ activeUntil: nextMonth });
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    const val = this.form.getRawValue();

    try {
      const plan = this.selectedPlan();
      const cost = plan === '2usd' ? 2 : 1;
      const tgUser = val.telegramUsername ? val.telegramUsername.trim() : '';

      if (this.isEditing() && this.client()) {
        const id = this.client()!.id;
        await this.dataService.updateClient(id, {
          fullName: val.fullName!,
          phone: val.phone!,
          iptvLogin: val.iptvLogin!,
          deviceInfo: val.deviceInfo || '',
          subscriptionPlan: plan,
          costUsd: cost,
          monthlyPrice: Number(val.monthlyPrice),
          startDate: val.startDate!,
          activeUntil: val.activeUntil!,
          balance: Number(val.balance),
          providerAccountId: val.providerAccountId || undefined,
          telegramUsername: tgUser,
          viberId: tgUser,
          notes: val.notes || '',
        });

        // If provider account was selected or unselected, sync account slots
        const prevAccountId = this.client()!.providerAccountId;
        const newAccountId = val.providerAccountId;
        if (newAccountId !== prevAccountId) {
          if (prevAccountId) {
            await this.dataService.assignClientToAccount(prevAccountId, id, 'unassign');
          }
          if (newAccountId) {
            await this.dataService.assignClientToAccount(newAccountId, id, 'assign');
          }
        }

        this.modalClose.emit();
      } else {
        const created = await this.dataService.addClient({
          fullName: val.fullName!,
          phone: val.phone!,
          iptvLogin: val.iptvLogin!,
          deviceInfo: val.deviceInfo || '',
          subscriptionPlan: plan,
          costUsd: cost,
          monthlyPrice: Number(val.monthlyPrice),
          startDate: val.startDate!,
          activeUntil: val.activeUntil!,
          balance: Number(val.balance),
          providerAccountId: val.providerAccountId || undefined,
          telegramUsername: tgUser,
          viberId: tgUser,
          notes: val.notes || '',
        });

        if (val.providerAccountId && created && created.id) {
          await this.dataService.assignClientToAccount(val.providerAccountId, created.id, 'assign');
        }

        this.clientSaved.emit(created);
        this.modalClose.emit();
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
