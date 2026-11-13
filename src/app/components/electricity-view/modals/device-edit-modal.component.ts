import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, effect, inject } from "@angular/core";
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import { ElectricityDevice } from "../../../models/utility.model";
import { DEVICE_COLORS, DEVICE_PRESETS, DevicePresetItem } from "../electricity-device-analytics.util";
import { ELECTRICITY_VIEW_CTX } from "../electricity-view.context";

@Component({
  selector: "app-device-edit-modal",
  imports: [CommonModule, ReactiveFormsModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
      <div class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4 flex items-end sm:items-center justify-center">
        <div class="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] pb-safe sm:pb-0 animate-in fade-in duration-150 sm:my-auto">
          <div class="sm:hidden flex justify-center pt-2.5 pb-1 bg-slate-50 shrink-0">
            <div class="w-10 h-1 rounded-full bg-slate-300"></div>
          </div>
          <div class="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 bg-slate-50 shrink-0">
            <div class="flex items-center gap-2.5">
              <div
                class="w-9 h-9 rounded-xl text-white flex items-center justify-center shrink-0"
                [style.background-color]="deviceForm.get('color')?.value || '#10b981'"
              >
                <mat-icon aria-hidden="true">{{ deviceForm.get('icon')?.value || 'electrical_services' }}</mat-icon>
              </div>
              <div>
                <h3 class="text-base font-bold text-slate-900">
                  {{ editingDeviceId() ? 'Редагувати пристрій' : 'Додати електроприлад' }}
                </h3>
                <p class="text-3xs text-slate-500">{{ currentAccount()?.name }}</p>
              </div>
            </div>
            <button
              type="button"
              (click)="closeDeviceModal()"
              class="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center cursor-pointer"
            >
              <mat-icon aria-hidden="true" class="text-lg">close</mat-icon>
            </button>
          </div>

          <form [formGroup]="deviceForm" (ngSubmit)="saveDevice()" class="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div class="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
              <!-- Quick Templates Dropdown -->
              @if (!editingDeviceId()) {
                <div>
                  <label for="dev-template-select" class="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                    <span>Шаблони приладів (оберіть для автозаповнення):</span>
                    <span class="text-3xs text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      {{ devicePresets.length }} шаблонів
                    </span>
                  </label>
                  <select
                    id="dev-template-select"
                    (change)="onPresetSelectChange($any($event.target).value)"
                    class="w-full px-3.5 py-2.5 bg-emerald-50/60 border border-emerald-300 rounded-xl text-xs font-bold text-emerald-950 focus:outline-none focus:border-emerald-600 cursor-pointer shadow-2xs"
                  >
                    <option value="" disabled selected>-- Оберіть готовий шаблон приладу --</option>
                    @for (preset of devicePresets; track preset.name) {
                      <option [value]="preset.name">
                        {{ preset.name }} {{ preset.powerWatts ? '(' + preset.powerWatts + ' Вт)' : '' }} {{ preset.batteryCapacityKwh ? '[' + preset.batteryCapacityKwh + ' кВт·год]' : '' }}
                      </option>
                    }
                  </select>
                </div>
              }

              <div>
                <label for="dev-name" class="block text-xs font-semibold text-slate-700 mb-1">
                  Назва пристрою *
                </label>
                <input
                  id="dev-name"
                  type="text"
                  formControlName="name"
                  placeholder="Напр. Бойлер (ванна), Кондиціонер спальня, EcoFlow, Пральна машина"
                  class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label for="dev-power" class="block text-xs font-semibold text-slate-700 mb-1">
                    Потужність (Вт)
                  </label>
                  <input
                    id="dev-power"
                    type="number"
                    inputmode="numeric"
                    min="0"
                    formControlName="powerWatts"
                    placeholder="Напр. 1350 або 3600"
                    class="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label for="dev-battery" class="block text-xs font-semibold text-slate-700 mb-1">
                    Батарея (кВт·год, для авто/ДБЖ)
                  </label>
                  <input
                    id="dev-battery"
                    type="number"
                    inputmode="decimal"
                    step="0.5"
                    min="0"
                    formControlName="batteryCapacityKwh"
                    placeholder="Напр. 24 (VW E-Golf)"
                    class="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <span class="block text-xs font-semibold text-slate-700 mb-1">
                    Колір на графіку
                  </span>
                  <div class="flex items-center gap-1.5 pt-1 flex-wrap">
                    @for (c of deviceColors; track c) {
                      <button
                        type="button"
                        (click)="deviceForm.patchValue({ color: c })"
                        [attr.aria-label]="'Обрати колір ' + c"
                        class="w-5 h-5 rounded-full cursor-pointer transition-transform"
                        [style.background-color]="c"
                        [class.scale-125]="deviceForm.get('color')?.value === c"
                        [class.ring-2]="deviceForm.get('color')?.value === c"
                        [class.ring-slate-900]="deviceForm.get('color')?.value === c"
                      >
                        <span class="sr-only">{{ c }}</span>
                      </button>
                    }
                  </div>
                </div>
              </div>

              <!-- Night Tariff Friendly Toggle -->
              <label class="p-3 rounded-xl bg-indigo-50/60 border border-indigo-200/80 flex items-center justify-between gap-3 cursor-pointer">
                <div class="flex items-center gap-2.5">
                  <mat-icon aria-hidden="true" class="text-indigo-600">dark_mode</mat-icon>
                  <div>
                    <div class="text-xs font-bold text-slate-900">Можна вмикати вночі (23:00 – 07:00)</div>
                    <div class="text-3xs text-slate-500">Враховувати прилад у розрахунку потенційної економії за нічним тарифом Ніч (Т1)</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  formControlName="isNightFriendly"
                  class="w-4 h-4 text-indigo-600 rounded cursor-pointer"
                />
              </label>

              <div>
                <label for="dev-notes" class="block text-xs font-semibold text-slate-700 mb-1">
                  Примітка (модель / параметри / розташування)
                </label>
                <input
                  id="dev-notes"
                  type="text"
                  formControlName="notes"
                  placeholder="Напр. Кондиціонер на обігрів або Volkswagen E-Golf 2014 24кВт·год"
                  class="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div class="flex items-center justify-end gap-2.5 p-4 border-t border-slate-200 bg-slate-50 shrink-0">
              <button
                type="button"
                (click)="closeDeviceModal()"
                class="px-4 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Скасувати
              </button>
              <button
                type="submit"
                [disabled]="deviceForm.invalid || isSavingDevices()"
                class="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer disabled:opacity-50"
              >
                {{ editingDeviceId() ? 'Зберегти зміни' : 'Додати пристрій' }}
              </button>
            </div>
          </form>
        </div>
      </div>
  `,
})
export class DeviceEditModalComponent {
  readonly ctx = inject(ELECTRICITY_VIEW_CTX);
  readonly dataService = this.ctx.dataService;
  readonly isSavingDevices = this.ctx.isSavingDevices;
  readonly editingDeviceId = this.ctx.editingDeviceId;
  readonly currentAccount = this.ctx.currentAccount;
  readonly deviceColors = DEVICE_COLORS;
  readonly devicePresets = DEVICE_PRESETS;

  readonly deviceForm = new FormGroup({
    name: new FormControl("", [Validators.required]),
    category: new FormControl("other"),
    icon: new FormControl("bolt"),
    color: new FormControl("#10b981"),
    powerWatts: new FormControl<number | null>(null),
    batteryCapacityKwh: new FormControl<number | null>(null),
    isNightFriendly: new FormControl<boolean>(false),
    notes: new FormControl(""),
  });

  constructor() {
    effect(() => {
      const dev = this.ctx.editingDeviceObj();
      if (dev) {
        this.deviceForm.reset({
          name: dev.name,
          category: dev.category || "other",
          icon: dev.icon || "bolt",
          color: dev.color || "#10b981",
          powerWatts: dev.powerWatts ?? null,
          batteryCapacityKwh: dev.batteryCapacityKwh ?? null,
          isNightFriendly: Boolean(dev.isNightFriendly),
          notes: dev.notes || "",
        });
      } else {
        this.deviceForm.reset({
          name: "",
          category: "other",
          icon: "bolt",
          color: this.deviceColors[this.ctx.accountDevices().length % this.deviceColors.length],
          powerWatts: null,
          batteryCapacityKwh: null,
          isNightFriendly: false,
          notes: "",
        });
      }
    });
  }

  applyDevicePresetToForm(preset: DevicePresetItem): void {
    this.deviceForm.patchValue({
      name: preset.name,
      category: preset.category,
      icon: preset.icon,
      color: preset.color,
      powerWatts: preset.powerWatts,
      batteryCapacityKwh: preset.batteryCapacityKwh ?? null,
      isNightFriendly: preset.isNightFriendly,
      notes: preset.notes || "",
    });
  }

  onPresetSelectChange(name: string): void {
    const found = this.devicePresets.find((p) => p.name === name);
    if (found) {
      this.applyDevicePresetToForm(found);
    }
  }

  closeDeviceModal(): void {
    this.ctx.closeDeviceModal();
  }

  async saveDevice(): Promise<void> {
    if (this.deviceForm.invalid) return;
    const acc = this.currentAccount();
    if (!acc) return;
    const currentUserId = this.dataService.currentUser()?.id || "";

    const val = this.deviceForm.getRawValue();
    const editId = this.editingDeviceId();
    const currentList = [...this.ctx.accountDevices()];

    let nextList: ElectricityDevice[];
    if (editId) {
      nextList = currentList.map((d) =>
        d.id === editId
          ? {
              ...d,
              accountId: acc.id,
              ownerUserId: d.ownerUserId || currentUserId,
              name: (val.name || "Пристрій").trim(),
              category: val.category || "other",
              icon: val.icon || "bolt",
              color: val.color || "#10b981",
              powerWatts: val.powerWatts && val.powerWatts > 0 ? Number(val.powerWatts) : undefined,
              batteryCapacityKwh:
                val.batteryCapacityKwh && val.batteryCapacityKwh > 0 ? Number(val.batteryCapacityKwh) : undefined,
              isNightFriendly: Boolean(val.isNightFriendly),
              notes: val.notes?.trim() || "",
              updatedAt: new Date().toISOString(),
            }
          : d
      );
    } else {
      const newDev: ElectricityDevice = {
        id: `dev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        accountId: acc.id,
        ownerUserId: currentUserId,
        name: (val.name || "Пристрій").trim(),
        category: val.category || "other",
        icon: val.icon || "bolt",
        color: val.color || "#10b981",
        powerWatts: val.powerWatts && val.powerWatts > 0 ? Number(val.powerWatts) : undefined,
        batteryCapacityKwh:
          val.batteryCapacityKwh && val.batteryCapacityKwh > 0 ? Number(val.batteryCapacityKwh) : undefined,
        isNightFriendly: Boolean(val.isNightFriendly),
        notes: val.notes?.trim() || "",
        logs: [],
        createdAt: new Date().toISOString(),
      };
      nextList = [...currentList, newDev];
    }

    this.isSavingDevices.set(true);
    try {
      const ok = await this.dataService.saveUtilityAccountDevices(
        acc.id,
        nextList,
        editId ? "Пристрій оновлено!" : "Пристрій успішно додано!"
      );
      if (ok) {
        this.closeDeviceModal();
      }
    } finally {
      this.isSavingDevices.set(false);
    }
  }
}
