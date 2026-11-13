import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from "@angular/core";
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import { UtilityAccount } from "../../../models/utility.model";
import { ELECTRICITY_VIEW_CTX } from "../electricity-view.context";

@Component({
  selector: "app-utility-account-modal",
  imports: [CommonModule, ReactiveFormsModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
      <div class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4 flex items-end sm:items-center justify-center">
        <div class="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[calc(100dvh-2rem)] pb-safe sm:pb-0 animate-in fade-in duration-150 sm:my-auto">
          <div class="sm:hidden flex justify-center pt-2.5 pb-1 bg-slate-50 shrink-0">
            <div class="w-10 h-1 rounded-full bg-slate-300"></div>
          </div>
          <!-- Pinned Header -->
          <div class="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 bg-slate-50 shrink-0">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                <mat-icon aria-hidden="true">bolt</mat-icon>
              </div>
              <h3 class="text-base font-bold text-slate-900">
                {{ editingAccount() ? 'Редагувати рахунок електроенергії' : 'Новий рахунок електроенергії' }}
              </h3>
            </div>
            <button
              type="button"
              (click)="closeAccountModal()"
              class="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center cursor-pointer transition-colors"
            >
              <mat-icon aria-hidden="true" class="text-lg">close</mat-icon>
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
                  placeholder="Квартира (вул. Шевченка), Будинок або Дача"
                  class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-amber-500"
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
                    placeholder="020014529"
                    class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-medium text-slate-900 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label for="acc-meter" class="block text-xs font-semibold text-slate-700 mb-1">
                    Номер лічильника
                  </label>
                  <input
                    id="acc-meter"
                    type="text"
                    formControlName="meterNumber"
                    placeholder="№ 12849021"
                    class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-medium text-slate-900 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <!-- Structured DTEK Address Section -->
              <div class="space-y-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <div class="flex items-center justify-between flex-wrap gap-1">
                  <span class="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <mat-icon aria-hidden="true" class="text-amber-600 text-sm leading-none">location_city</mat-icon>
                    <span>Адреса об'єкта та прив'язка до графіка ДТЕК</span>
                  </span>
                  @if (isDtekCatalogLoading()) {
                    <span class="text-3xs text-amber-700 flex items-center gap-1">
                      <span class="w-2.5 h-2.5 border border-amber-600 border-t-transparent rounded-full animate-spin"></span>
                      Оновлення каталогу...
                    </span>
                  }
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <!-- City Autocomplete -->
                  <div class="relative">
                    <label for="acc-city" class="block text-xs font-semibold text-slate-700 mb-1">
                      Населений пункт (Одеська обл.) *
                    </label>
                    <input
                      id="acc-city"
                      type="text"
                      [value]="formCityQuery()"
                      (input)="onFormCityInput($any($event.target).value)"
                      (focus)="showFormCitySuggestions.set(true)"
                      placeholder="Введіть або оберіть населений пункт..."
                      autocomplete="off"
                      class="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-amber-500"
                    />

                    <!-- Dropdown -->
                    @if (showFormCitySuggestions() && filteredFormCities().length > 0) {
                      <button
                        type="button"
                        aria-label="Закрити список міст"
                        class="fixed inset-0 z-30 cursor-default bg-transparent border-0"
                        (click)="showFormCitySuggestions.set(false)"
                      ></button>
                      <div class="absolute z-40 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100">
                        @for (c of filteredFormCities(); track c) {
                          <button
                            type="button"
                            (click)="selectFormCity(c)"
                            class="w-full px-3 py-2 text-left text-xs text-slate-800 hover:bg-amber-50 flex items-center justify-between cursor-pointer transition-colors"
                          >
                            <span class="font-medium">{{ c }}</span>
                            <mat-icon aria-hidden="true" class="text-3xs text-slate-400 leading-none">chevron_right</mat-icon>
                          </button>
                        }
                      </div>
                    }
                  </div>

                  <!-- Street Autocomplete -->
                  <div class="relative">
                    <label for="acc-street" class="block text-xs font-semibold text-slate-700 mb-1">
                      Вулиця (підказка за першими літерами) *
                    </label>
                    <input
                      id="acc-street"
                      type="text"
                      [value]="formStreetQuery()"
                      (input)="onFormStreetInput($any($event.target).value)"
                      (focus)="showFormStreetSuggestions.set(true)"
                      placeholder="Почніть вводити назву вулиці..."
                      autocomplete="off"
                      class="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-amber-500"
                    />

                    <!-- Dropdown -->
                    @if (showFormStreetSuggestions() && filteredFormStreets().length > 0) {
                      <button
                        type="button"
                        aria-label="Закрити список вулиць"
                        class="fixed inset-0 z-30 cursor-default bg-transparent border-0"
                        (click)="showFormStreetSuggestions.set(false)"
                      ></button>
                      <div class="absolute z-40 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100">
                        @for (s of filteredFormStreets(); track s) {
                          <button
                            type="button"
                            (click)="selectFormStreet(s)"
                            class="w-full px-3 py-2 text-left text-xs text-slate-800 hover:bg-amber-50 flex items-center justify-between cursor-pointer transition-colors"
                          >
                            <span class="font-medium">{{ s }}</span>
                            <mat-icon aria-hidden="true" class="text-3xs text-slate-400 leading-none">chevron_right</mat-icon>
                          </button>
                        }
                      </div>
                    }
                  </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <!-- House Number -->
                  <div>
                    <label for="acc-housenum" class="block text-xs font-semibold text-slate-700 mb-1">
                      Номер будинку
                    </label>
                    <input
                      id="acc-housenum"
                      type="text"
                      formControlName="houseNum"
                      (input)="onFormHouseInput($any($event.target).value)"
                      placeholder="Введіть номер будинку..."
                      class="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-medium text-slate-900 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <!-- DTEK Queue Group -->
                  <div>
                    <label for="acc-queue" class="block text-xs font-semibold text-slate-700 mb-1">
                      Черга відключення ДТЕК
                    </label>
                    <input
                      id="acc-queue"
                      type="text"
                      formControlName="dtekQueueGroup"
                      placeholder="напр. GPV4.1 (автопідстановка)"
                      class="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-medium text-slate-900 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <!-- Full Address (auto-assembled, editable) -->
                <div>
                  <label for="acc-addr" class="block text-xs font-semibold text-slate-700 mb-1">
                    Повна адреса (для звітів та квитанцій)
                  </label>
                  <input
                    id="acc-addr"
                    type="text"
                    formControlName="address"
                    placeholder="Автоматично сформується з адреси або введіть вручну"
                    class="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <!-- Tariff Type Selection -->
              <div>
                <span class="block text-xs font-semibold text-slate-700 mb-1.5">
                  Тип тарифу для даного акаунту *
                </span>
                <div class="grid grid-cols-2 gap-3">
                  <label
                    class="p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all"
                    [class.border-amber-500]="accountForm.get('electricityTariffType')?.value === 'single'"
                    [class.bg-amber-50/60]="accountForm.get('electricityTariffType')?.value === 'single'"
                    [class.border-slate-200]="accountForm.get('electricityTariffType')?.value !== 'single'"
                  >
                    <input
                      type="radio"
                      value="single"
                      formControlName="electricityTariffType"
                      class="text-amber-500 focus:ring-amber-500"
                    />
                    <div>
                      <div class="text-xs font-bold text-slate-900">Однотарифний</div>
                      <div class="text-3xs text-slate-500">Один тариф на весь рік</div>
                    </div>
                  </label>

                  <label
                    class="p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all"
                    [class.border-amber-500]="accountForm.get('electricityTariffType')?.value === 'dual'"
                    [class.bg-amber-50/60]="accountForm.get('electricityTariffType')?.value === 'dual'"
                    [class.border-slate-200]="accountForm.get('electricityTariffType')?.value !== 'dual'"
                  >
                    <input
                      type="radio"
                      value="dual"
                      formControlName="electricityTariffType"
                      class="text-amber-500 focus:ring-amber-500"
                    />
                    <div>
                      <div class="text-xs font-bold text-slate-900">Двотарифний</div>
                      <div class="text-3xs text-slate-500">День / Ніч та Сезони</div>
                    </div>
                  </label>
                </div>
              </div>

              <!-- Initial Readings -->
              <div class="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <span class="text-3xs font-bold uppercase tracking-wider text-slate-600 block">
                  Початкові покази лічильника (кВт·г)
                </span>
                <p class="text-3xs text-slate-500">
                  Використовуються як точка відліку для розрахунку споживання за першу передачу показів.
                </p>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label for="acc-t1" class="block text-3xs font-semibold text-slate-600 mb-0.5">
                      {{ accountForm.get('electricityTariffType')?.value === 'dual' ? 'Початковий День (Т2)' : 'Початковий показник' }}
                    </label>
                    <input
                      id="acc-t1"
                      type="number"
                      inputmode="decimal"
                      min="0"
                      step="0.1"
                      formControlName="initialReadingT1"
                      placeholder="0"
                      class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  @if (accountForm.get('electricityTariffType')?.value === 'dual') {
                    <div>
                      <label for="acc-t2" class="block text-3xs font-semibold text-slate-600 mb-0.5">
                        Початковий Ніч (Т1)
                      </label>
                      <input
                        id="acc-t2"
                        type="number"
                        inputmode="decimal"
                        min="0"
                        step="0.1"
                        formControlName="initialReadingT2"
                        placeholder="0"
                        class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  }
                </div>
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
                  placeholder="Додаткова інформація про лічильник чи договір"
                  class="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500"
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
                class="px-4 py-2 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white transition-colors cursor-pointer disabled:opacity-50"
              >
                {{ editingAccount() ? 'Оновити акаунт' : 'Зберегти акаунт' }}
              </button>
            </div>
          </form>
        </div>
      </div>
  `,
})
export class UtilityAccountModalComponent {
  readonly ctx = inject(ELECTRICITY_VIEW_CTX);
  readonly dataService = this.ctx.dataService;
  readonly isDtekCatalogLoading = this.dataService.isDtekCatalogLoading;
  readonly dtekCities = this.dataService.dtekCities;
  readonly dtekStreets = this.dataService.dtekStreets;

  readonly editingAccount = this.ctx.editingAccount;
  readonly isSubmitting = signal<boolean>(false);

  readonly formCityQuery = signal<string>("");
  readonly formStreetQuery = signal<string>("");
  readonly showFormCitySuggestions = signal<boolean>(false);
  readonly showFormStreetSuggestions = signal<boolean>(false);

  readonly accountForm = new FormGroup({
    name: new FormControl("", [Validators.required]),
    accountNumber: new FormControl("", [Validators.required]),
    city: new FormControl(""),
    street: new FormControl(""),
    houseNum: new FormControl(""),
    dtekQueueGroup: new FormControl(""),
    address: new FormControl(""),
    meterNumber: new FormControl(""),
    electricityTariffType: new FormControl<"single" | "dual">("single", [Validators.required]),
    initialReadingT1: new FormControl<number>(0),
    initialReadingT2: new FormControl<number>(0),
    notes: new FormControl(""),
  });

  readonly filteredFormCities = computed(() => {
    const q = this.formCityQuery().trim().toLowerCase();
    const all = this.dtekCities();
    if (!q) return all.slice(0, 40);
    return all
      .filter((c) => c.toLowerCase().includes(q))
      .sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.toLowerCase().startsWith(q) ? 0 : 1;
        return aStarts - bStarts || a.localeCompare(b, "uk");
      })
      .slice(0, 40);
  });

  readonly filteredFormStreets = computed(() => {
    const q = this.formStreetQuery().trim().toLowerCase();
    const all = this.dtekStreets();
    if (!q) return all.slice(0, 40);
    return all
      .filter((s) => s.toLowerCase().includes(q))
      .sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.toLowerCase().startsWith(q) ? 0 : 1;
        return aStarts - bStarts || a.localeCompare(b, "uk");
      })
      .slice(0, 40);
  });

  constructor() {
    effect(() => {
      const acc = this.editingAccount();
      if (acc) {
        this.accountForm.patchValue({
          name: acc.name,
          accountNumber: acc.accountNumber,
          city: acc.city || "",
          street: acc.street || "",
          houseNum: acc.houseNum || "",
          dtekQueueGroup: acc.dtekQueueGroup || "",
          address: acc.address || "",
          meterNumber: acc.meterNumber || "",
          electricityTariffType: acc.electricityTariffType || "single",
          initialReadingT1: acc.initialReadingT1 || 0,
          initialReadingT2: acc.initialReadingT2 || 0,
          notes: acc.notes || "",
        });
        this.formCityQuery.set(acc.city || "");
        this.formStreetQuery.set(acc.street || "");
        if (acc.city) {
          this.dataService.fetchDtekCatalog(acc.city);
        }
      } else {
        this.accountForm.reset({
          name: "",
          accountNumber: "",
          city: "",
          street: "",
          houseNum: "",
          dtekQueueGroup: "",
          address: "",
          meterNumber: "",
          electricityTariffType: "single",
          initialReadingT1: 0,
          initialReadingT2: 0,
          notes: "",
        });
        this.formCityQuery.set("");
        this.formStreetQuery.set("");
        this.dataService.fetchDtekCatalog("");
      }
    });
  }

  onFormCityInput(val: string): void {
    this.formCityQuery.set(val);
    this.accountForm.patchValue({ city: val });
    this.showFormCitySuggestions.set(true);
    this.updateFormFullAddress();
  }

  selectFormCity(city: string): void {
    this.formCityQuery.set(city);
    this.accountForm.patchValue({ city, street: "" });
    this.formStreetQuery.set("");
    this.showFormCitySuggestions.set(false);
    this.dataService.fetchDtekCatalog(city);
    this.updateFormFullAddress();
  }

  onFormStreetInput(val: string): void {
    this.formStreetQuery.set(val);
    this.accountForm.patchValue({ street: val });
    this.showFormStreetSuggestions.set(true);
    this.updateFormFullAddress();
  }

  selectFormStreet(street: string): void {
    this.formStreetQuery.set(street);
    this.accountForm.patchValue({ street });
    this.showFormStreetSuggestions.set(false);
    this.updateFormFullAddress();
  }

  onFormHouseInput(val: string): void {
    this.accountForm.patchValue({ houseNum: val });
    this.updateFormFullAddress();
  }

  updateFormFullAddress(): void {
    const city = this.accountForm.get("city")?.value?.trim() || "";
    const street = this.accountForm.get("street")?.value?.trim() || "";
    const house = this.accountForm.get("houseNum")?.value?.trim() || "";
    const parts = [city, street, house ? `буд. ${house}` : ""].filter(Boolean);
    this.accountForm.patchValue({ address: parts.join(", ") });
  }

  closeAccountModal(): void {
    this.ctx.closeAccountModal();
  }

  async saveAccount(): Promise<void> {
    if (this.accountForm.invalid) return;
    this.isSubmitting.set(true);
    try {
      const formVal = this.accountForm.getRawValue();
      const existing = this.editingAccount();
      const city = formVal.city?.trim() || "";
      const street = formVal.street?.trim() || "";
      const houseNum = formVal.houseNum?.trim() || "";
      let address = formVal.address?.trim() || "";
      if (!address && (city || street)) {
        address = [city, street, houseNum ? `буд. ${houseNum}` : ""].filter(Boolean).join(", ");
      }

      const payload: Partial<UtilityAccount> = {
        ...(existing ? existing : {}),
        type: existing?.type || "electricity",
        name: formVal.name?.trim() || "",
        accountNumber: formVal.accountNumber?.trim() || "",
        city,
        street,
        houseNum,
        dtekQueueGroup: formVal.dtekQueueGroup?.trim() || "",
        address,
        meterNumber: formVal.meterNumber?.trim() || "",
        electricityTariffType: formVal.electricityTariffType || "single",
        initialReadingT1: Number(formVal.initialReadingT1) || 0,
        initialReadingT2: Number(formVal.initialReadingT2) || 0,
        notes: formVal.notes?.trim() || "",
      };

      const saved = await this.dataService.saveUtilityAccount(payload);
      this.ctx.selectedAccountId.set(saved.id);
      this.closeAccountModal();
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
