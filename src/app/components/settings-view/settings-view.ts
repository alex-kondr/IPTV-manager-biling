import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { IptvData } from '../../services/iptv-data';
import {
  DEFAULT_VIBER_REMINDER_TEMPLATE,
  DEFAULT_VIBER_RENEWAL_TEMPLATE,
  interpolateViberMessage,
  formatDateUa,
  AppSettings,
} from '../../models/client.model';
import {
  UtilityAccount,
  UtilityTariffsSettings,
  DEFAULT_UTILITY_TARIFFS,
} from '../../models/utility.model';

@Component({
  selector: 'app-settings-view',
  imports: [CommonModule, ReactiveFormsModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div id="settings-container" class="space-y-6 max-w-4xl mx-auto">
      <!-- General Billing Configuration -->
      <form [formGroup]="form" (ngSubmit)="onSubmit()" class="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-6">
        <div class="flex items-center gap-3 pb-4 border-b border-slate-200">
          <div class="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <mat-icon>settings</mat-icon>
          </div>
          <div>
            <h3 class="text-base font-bold text-slate-900">Загальні налаштування білінгу</h3>
            <p class="text-xs text-slate-500">Параметри тарифів, реквізити картки та строки нагадування</p>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <!-- Default Monthly Price -->
          <div>
            <label for="settings-default-price" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Стандартний тариф за замовчуванням (грн/міс)
            </label>
            <input
              id="settings-default-price"
              type="number"
              min="0"
              step="10"
              formControlName="defaultMonthlyPrice"
              class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
            />
          </div>

          <!-- Days before expiry for notification -->
          <div>
            <label for="settings-reminder-days" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Нагадувати за скільки днів до закінчення
            </label>
            <input
              id="settings-reminder-days"
              type="number"
              min="1"
              max="30"
              formControlName="reminderDaysBefore"
              class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-emerald-600"
            />
            <p class="text-xs text-slate-500 mt-1">За замовчуванням: 7 днів</p>
          </div>

          <!-- Card / IBAN Requisites -->
          <div class="sm:col-span-2">
            <label for="settings-card-requisites" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Реквізити для оплати (номер карти, IBAN, банк)
            </label>
            <input
              id="settings-card-requisites"
              type="text"
              formControlName="cardRequisites"
              placeholder="4441 1144 5566 7788 (Монобанк, Шевченко А.)"
              class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-emerald-600"
            />
            <p class="text-xs text-slate-500 mt-1">
              Використовується в автоматичній підстановці тегу &#123;card&#125; для повідомлень абонентам.
            </p>
          </div>
        </div>

        <!-- ======================================================== -->
        <!-- TELEGRAM BOT CONFIGURATION SECTION                       -->
        <!-- ======================================================== -->
        <div class="pt-5 border-t border-slate-200 space-y-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-200/60">
              <mat-icon>send</mat-icon>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h3 class="text-base font-bold text-slate-900">Налаштування Telegram Bot</h3>
                <span
                  class="px-2 py-0.5 rounded-full text-2xs font-semibold"
                  [class.bg-emerald-100]="form.controls.telegramBotToken.value"
                  [class.text-emerald-800]="form.controls.telegramBotToken.value"
                  [class.bg-slate-100]="!form.controls.telegramBotToken.value"
                  [class.text-slate-600]="!form.controls.telegramBotToken.value"
                >
                  {{ form.controls.telegramBotToken.value ? 'Токен налаштовано' : 'Не налаштовано' }}
                </span>
              </div>
              <p class="text-xs text-slate-500">
                Параметри підключення бота для автоматичних сповіщень та розсилки в Telegram
              </p>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div class="sm:col-span-2">
              <label for="settings-telegram-token" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Telegram Bot Token
              </label>
              <input
                id="settings-telegram-token"
                type="text"
                formControlName="telegramBotToken"
                placeholder="8508491517:AAFgSfvnHmEg6RiC-tYfqiFvmflTbeacZf0"
                class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-mono text-slate-900 focus:outline-none focus:border-sky-600"
              />
            </div>
            <div>
              <label for="settings-telegram-username" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Юзернейм бота (@)
              </label>
              <input
                id="settings-telegram-username"
                type="text"
                formControlName="telegramBotUsername"
                placeholder="iptv_billing_bot"
                class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-sky-600"
              />
            </div>
            <div class="sm:col-span-3">
              <label for="settings-telegram-sender" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Ім'я відправника (підпис бота)
              </label>
              <input
                id="settings-telegram-sender"
                type="text"
                formControlName="telegramSenderName"
                placeholder="IPTV Підтримка"
                class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-sky-600"
              />
            </div>
          </div>
        </div>

        <!-- ======================================================== -->
        <!-- VIBER TEMPLATES CONFIGURATION SECTION                    -->
        <!-- ======================================================== -->
        <div class="pt-5 border-t border-slate-200 space-y-6">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center border border-purple-200/60">
                <mat-icon>chat</mat-icon>
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <h3 class="text-base font-bold text-slate-900">Шаблони повідомлень Viber</h3>
                  <span class="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-2xs font-semibold">
                    2 типи повідомлень
                  </span>
                </div>
                <p class="text-xs text-slate-500">
                  Налаштуйте тексти для нагадування про оплату та підтвердження продовження підписки
                </p>
              </div>
            </div>
          </div>

          <!-- Dynamic Placeholders Legend -->
          <div class="p-4 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2.5">
            <div class="flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <mat-icon class="text-sm text-purple-600">data_object</mat-icon>
              <span>Динамічні поля для вставки в текст (клікніть, щоб вставити):</span>
            </div>
            <div class="flex flex-wrap gap-1.5 text-xs">
              <button
                type="button"
                (click)="insertTag('{name}')"
                class="px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:border-purple-500 hover:text-purple-700 text-slate-700 font-mono font-semibold transition-all cursor-pointer text-2xs"
                title="Ім'я абонента"
              >
                + &#123;name&#125; <span class="text-slate-400 font-sans font-normal">(Ім'я)</span>
              </button>
              <button
                type="button"
                (click)="insertTag('{login}')"
                class="px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:border-purple-500 hover:text-purple-700 text-slate-700 font-mono font-semibold transition-all cursor-pointer text-2xs"
                title="Логін IPTV"
              >
                + &#123;login&#125; <span class="text-slate-400 font-sans font-normal">(Логін)</span>
              </button>
              <button
                type="button"
                (click)="insertTag('{active_until}')"
                class="px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:border-purple-500 hover:text-purple-700 text-slate-700 font-mono font-semibold transition-all cursor-pointer text-2xs"
                title="Дата закінчення / нова дата"
              >
                + &#123;active_until&#125; <span class="text-slate-400 font-sans font-normal">(Дата дії)</span>
              </button>
              <button
                type="button"
                (click)="insertTag('{amount}')"
                class="px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:border-purple-500 hover:text-purple-700 text-slate-700 font-mono font-semibold transition-all cursor-pointer text-2xs"
                title="Сума до сплати / оплачена"
              >
                + &#123;amount&#125; <span class="text-slate-400 font-sans font-normal">(Сума ₴)</span>
              </button>
              <button
                type="button"
                (click)="insertTag('{current_date}')"
                class="px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:border-purple-500 hover:text-purple-700 text-slate-700 font-mono font-semibold transition-all cursor-pointer text-2xs"
                title="Поточна дата"
              >
                + &#123;current_date&#125; <span class="text-slate-400 font-sans font-normal">(Поточна дата)</span>
              </button>
              <button
                type="button"
                (click)="insertTag('{card}')"
                class="px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:border-purple-500 hover:text-purple-700 text-slate-700 font-mono font-semibold transition-all cursor-pointer text-2xs"
                title="Реквізити картки"
              >
                + &#123;card&#125; <span class="text-slate-400 font-sans font-normal">(Номер карти)</span>
              </button>
              <button
                type="button"
                (click)="insertTag('{price}')"
                class="px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:border-purple-500 hover:text-purple-700 text-slate-700 font-mono font-semibold transition-all cursor-pointer text-2xs"
                title="Місячний тариф"
              >
                + &#123;price&#125; <span class="text-slate-400 font-sans font-normal">(Тариф)</span>
              </button>
              <button
                type="button"
                (click)="insertTag('{device}')"
                class="px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:border-purple-500 hover:text-purple-700 text-slate-700 font-mono font-semibold transition-all cursor-pointer text-2xs"
                title="Пристрій / Модель"
              >
                + &#123;device&#125; <span class="text-slate-400 font-sans font-normal">(Пристрій)</span>
              </button>
              <button
                type="button"
                (click)="insertTag('{notes}')"
                class="px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:border-purple-500 hover:text-purple-700 text-slate-700 font-mono font-semibold transition-all cursor-pointer text-2xs"
                title="Нотатки / Коментар"
              >
                + &#123;notes&#125; <span class="text-slate-400 font-sans font-normal">(Нотатки)</span>
              </button>
            </div>
            <p class="text-3xs text-slate-500">
              Порада: оберіть потрібне поле вводу нижче, а потім натисніть кнопку тегу для миттєвої вставки у вибране місце курсору.
            </p>
          </div>

          <!-- TYPE 1: Viber Reminder Template (Планове нагадування) -->
          <div class="p-4 sm:p-5 rounded-xl border border-slate-200 bg-white space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs">
                  1
                </span>
                <div>
                  <h4 class="text-sm font-bold text-slate-900">Тип 1: Повідомлення-нагадування про закінчення</h4>
                  <p class="text-2xs text-slate-500">Надсилається за {{ form.controls.reminderDaysBefore.value }} днів до закінчення підписки</p>
                </div>
              </div>
              <button
                type="button"
                (click)="resetReminderTemplateToDefault()"
                class="text-xs text-purple-700 hover:text-purple-900 font-semibold cursor-pointer underline flex items-center gap-1"
              >
                <mat-icon class="text-sm">restart_alt</mat-icon>
                <span>Стандартний</span>
              </button>
            </div>

            <textarea
              #reminderInput
              rows="3"
              formControlName="viberReminderMessageTemplate"
              (focus)="activeTemplateField = 'reminder'"
              placeholder="Введіть текст нагадування..."
              class="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-purple-600 font-sans leading-relaxed"
            ></textarea>

            <!-- Live Preview for Reminder -->
            <div class="p-3 bg-purple-50/70 border border-purple-100 rounded-xl space-y-1">
              <div class="flex items-center justify-between text-3xs font-bold text-purple-900 uppercase tracking-wider">
                <span class="flex items-center gap-1">
                  <mat-icon class="text-sm leading-none">visibility</mat-icon>
                  Попередній перегляд у Viber (зразок):
                </span>
                <span class="text-purple-600 font-normal normal-case">Тестові дані</span>
              </div>
              <div class="p-2.5 bg-white rounded-lg border border-purple-200/80 text-xs text-slate-700 leading-relaxed whitespace-pre-wrap select-all">
                {{ previewReminderText() }}
              </div>
            </div>
          </div>

          <!-- TYPE 2: Viber Renewal Template (Підтвердження продовження) -->
          <div class="p-4 sm:p-5 rounded-xl border border-slate-200 bg-white space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs">
                  2
                </span>
                <div>
                  <h4 class="text-sm font-bold text-slate-900">Тип 2: Повідомлення про продовження підписки</h4>
                  <p class="text-2xs text-slate-500">Пропонується до надсилання одразу після проведення оплати абонента</p>
                </div>
              </div>
              <button
                type="button"
                (click)="resetRenewalTemplateToDefault()"
                class="text-xs text-purple-700 hover:text-purple-900 font-semibold cursor-pointer underline flex items-center gap-1"
              >
                <mat-icon class="text-sm">restart_alt</mat-icon>
                <span>Стандартний</span>
              </button>
            </div>

            <textarea
              #renewalInput
              rows="3"
              formControlName="viberRenewalMessageTemplate"
              (focus)="activeTemplateField = 'renewal'"
              placeholder="Введіть текст підтвердження продовження..."
              class="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-purple-600 font-sans leading-relaxed"
            ></textarea>

            <!-- Live Preview for Renewal -->
            <div class="p-3 bg-purple-50/70 border border-purple-100 rounded-xl space-y-1">
              <div class="flex items-center justify-between text-3xs font-bold text-purple-900 uppercase tracking-wider">
                <span class="flex items-center gap-1">
                  <mat-icon class="text-sm leading-none">visibility</mat-icon>
                  Попередній перегляд у Viber (зразок):
                </span>
                <span class="text-purple-600 font-normal normal-case">Тестові дані</span>
              </div>
              <div class="p-2.5 bg-white rounded-lg border border-purple-200/80 text-xs text-slate-700 leading-relaxed whitespace-pre-wrap select-all">
                {{ previewRenewalText() }}
              </div>
            </div>
          </div>
        </div>

        <!-- ======================================================== -->
        <!-- UTILITY TARIFFS SETTINGS SECTION (ELECTRICITY, WATER, WASTE) -->
        <!-- ======================================================== -->
        <div class="pt-6 border-t border-slate-200 space-y-6">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200/60">
              <mat-icon>bolt</mat-icon>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h3 class="text-base font-bold text-slate-900">Тарифи на електроенергію</h3>
                <span class="px-2 py-0.5 rounded-full text-3xs font-bold uppercase bg-amber-100 text-amber-800">
                  Комунальні послуги
                </span>
              </div>
              <p class="text-xs text-slate-500">
                Вибір типу тарифу для кожного акаунту (однотарифний / двотарифний) та налаштування цін і строків дії
              </p>
            </div>
          </div>

          <!-- Account tariff selector list -->
          <div class="p-4 sm:p-5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Тип тарифу для кожного окремого акаунту:
              </span>
              <span class="text-2xs text-slate-500">Зберігається автоматично</span>
            </div>

            @if (electricityAccounts().length > 0) {
              <div class="space-y-2">
                @for (acc of electricityAccounts(); track acc.id) {
                  <div class="p-3 bg-white rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                    <div>
                      <div class="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                        <mat-icon class="text-sm text-amber-500 leading-none">bolt</mat-icon>
                        {{ acc.name }}
                        <span class="text-3xs text-slate-400 font-mono font-normal">№ {{ acc.accountNumber }}</span>
                      </div>
                      @if (acc.address) {
                        <div class="text-3xs text-slate-500 mt-0.5">{{ acc.address }}</div>
                      }
                    </div>

                    <div class="flex items-center gap-2 shrink-0">
                      @if (canEdit()) {
                        <div class="inline-flex rounded-lg p-0.5 bg-slate-100 text-2xs font-semibold text-slate-600">
                          <button
                            type="button"
                            (click)="setAccountTariffType(acc, 'single')"
                            [class.bg-white]="acc.electricityTariffType === 'single'"
                            [class.text-slate-900]="acc.electricityTariffType === 'single'"
                            [class.shadow-2xs]="acc.electricityTariffType === 'single'"
                            class="px-2.5 py-1 rounded-md cursor-pointer transition-all"
                          >
                            Однотарифний
                          </button>
                          <button
                            type="button"
                            (click)="setAccountTariffType(acc, 'dual')"
                            [class.bg-white]="acc.electricityTariffType === 'dual'"
                            [class.text-slate-900]="acc.electricityTariffType === 'dual'"
                            [class.shadow-2xs]="acc.electricityTariffType === 'dual'"
                            class="px-2.5 py-1 rounded-md cursor-pointer transition-all"
                          >
                            Двотарифний (День/Ніч)
                          </button>
                        </div>
                      } @else {
                        <span class="px-2 py-0.5 rounded text-2xs font-bold bg-slate-100 text-slate-700">
                          {{ acc.electricityTariffType === 'dual' ? 'Двотарифний' : 'Однотарифний' }}
                        </span>
                      }
                    </div>
                  </div>
                }
              </div>
            } @else {
              <div class="text-xs text-slate-500 italic py-2">
                Ще немає доданих акаунтів електроенергії. Ви зможете обрати тип тарифу після додавання рахунку у вкладці «Електроенергія».
              </div>
            }
          </div>

          <!-- Single-Rate Tariff Configuration -->
          <div class="p-4 sm:p-5 rounded-xl border border-slate-200 bg-white space-y-3">
            <div class="flex items-center gap-2">
              <span class="w-6 h-6 rounded-md bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-xs">1</span>
              <div>
                <h4 class="text-xs sm:text-sm font-bold text-slate-900">Однотарифний план (єдиний на весь рік)</h4>
                <p class="text-2xs text-slate-500">Фіксована ціна за 1 кВт·год, однакова вдень і вночі протягом усього року</p>
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label for="set-elec-single-rate" class="block text-2xs font-semibold text-slate-700 mb-1">
                  Тариф (грн / кВт·год) *
                </label>
                <input
                  id="set-elec-single-rate"
                  type="number"
                  step="0.01"
                  min="0"
                  formControlName="elecSingleRate"
                  class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label for="set-elec-single-date" class="block text-2xs font-semibold text-slate-700 mb-1">
                  Дата початку дії тарифу *
                </label>
                <input
                  id="set-elec-single-date"
                  type="date"
                  formControlName="elecSingleValidFrom"
                  class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label for="set-elec-single-period" class="block text-2xs font-semibold text-slate-700 mb-1">
                  Строк дії тарифу
                </label>
                <input
                  id="set-elec-single-period"
                  type="text"
                  formControlName="elecSingleValidPeriod"
                  placeholder="Весь рік (12 місяців)"
                  class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          </div>

          <!-- Dual-Rate Tariff Configuration (Day/Night & Summer/Winter) -->
          <div class="p-4 sm:p-5 rounded-xl border border-slate-200 bg-white space-y-4">
            <div class="flex items-center gap-2">
              <span class="w-6 h-6 rounded-md bg-purple-100 text-purple-800 flex items-center justify-center font-bold text-xs">2</span>
              <div>
                <h4 class="text-xs sm:text-sm font-bold text-slate-900">Двотарифний план (по періоду доби та по сезону)</h4>
                <p class="text-2xs text-slate-500">Ділиться окремо на денний/нічний час та на літній/зимовий період</p>
              </div>
            </div>

            <!-- Validity dates -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-3 border-b border-slate-100">
              <div>
                <label for="set-elec-dual-date" class="block text-2xs font-semibold text-slate-700 mb-1">
                  Дата початку дії двотарифного плану *
                </label>
                <input
                  id="set-elec-dual-date"
                  type="date"
                  formControlName="elecDualValidFrom"
                  class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label for="set-elec-dual-period" class="block text-2xs font-semibold text-slate-700 mb-1">
                  Строк дії тарифів
                </label>
                <input
                  id="set-elec-dual-period"
                  type="text"
                  formControlName="elecDualValidPeriod"
                  placeholder="1 рік / до наступного перегляду"
                  class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <!-- Summer and Winter grids -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <!-- Summer Season -->
              <div class="p-3.5 rounded-xl bg-amber-50/60 border border-amber-200/80 space-y-3">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-1.5 font-bold text-xs text-amber-900">
                    <mat-icon class="text-base text-amber-600 leading-none">wb_sunny</mat-icon>
                    Літній період
                  </div>
                  <span class="text-3xs text-amber-700 font-medium">01.05 – 30.09 (1 травня – 30 вересня)</span>
                </div>

                <div class="grid grid-cols-2 gap-2.5">
                  <div>
                    <label for="set-elec-sd" class="block text-3xs font-bold text-amber-900 mb-0.5">
                      Денний (грн/кВт·г) *
                    </label>
                    <input
                      id="set-elec-sd"
                      type="number"
                      step="0.01"
                      min="0"
                      formControlName="elecDualSummerDay"
                      class="w-full px-3 py-2 bg-white border border-amber-300 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500"
                    />
                    <span class="text-3xs text-slate-400 mt-0.5 block">07:00 – 23:00</span>
                  </div>

                  <div>
                    <label for="set-elec-sn" class="block text-3xs font-bold text-amber-900 mb-0.5">
                      Нічний (грн/кВт·г) *
                    </label>
                    <input
                      id="set-elec-sn"
                      type="number"
                      step="0.01"
                      min="0"
                      formControlName="elecDualSummerNight"
                      class="w-full px-3 py-2 bg-white border border-amber-300 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500"
                    />
                    <span class="text-3xs text-slate-400 mt-0.5 block">23:00 – 07:00</span>
                  </div>
                </div>
              </div>

              <!-- Winter Season -->
              <div class="p-3.5 rounded-xl bg-indigo-50/60 border border-indigo-200/80 space-y-3">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-1.5 font-bold text-xs text-indigo-900">
                    <mat-icon class="text-base text-indigo-600 leading-none">ac_unit</mat-icon>
                    Зимовий період
                  </div>
                  <span class="text-3xs text-indigo-700 font-medium">01.10 – 30.04 (1 жовтня – 30 квітня)</span>
                </div>

                <div class="grid grid-cols-2 gap-2.5">
                  <div>
                    <label for="set-elec-wd" class="block text-3xs font-bold text-indigo-900 mb-0.5">
                      Денний (грн/кВт·г) *
                    </label>
                    <input
                      id="set-elec-wd"
                      type="number"
                      step="0.01"
                      min="0"
                      formControlName="elecDualWinterDay"
                      class="w-full px-3 py-2 bg-white border border-indigo-300 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                    />
                    <span class="text-3xs text-slate-400 mt-0.5 block">07:00 – 23:00</span>
                  </div>

                  <div>
                    <label for="set-elec-wn" class="block text-3xs font-bold text-indigo-900 mb-0.5">
                      Нічний (грн/кВт·г) *
                    </label>
                    <input
                      id="set-elec-wn"
                      type="number"
                      step="0.01"
                      min="0"
                      formControlName="elecDualWinterNight"
                      class="w-full px-3 py-2 bg-white border border-indigo-300 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                    />
                    <span class="text-3xs text-slate-400 mt-0.5 block">23:00 – 07:00</span>
                  </div>

                  <!-- Winter Consumption Limit (2000 kWh standard in Ukraine) -->
                  <div class="col-span-2 pt-2 border-t border-indigo-200/60">
                    <label for="set-elec-wlimit" class="block text-3xs font-bold text-indigo-900 mb-0.5 flex items-center justify-between">
                      <span>Ліміт зимового тарифу (кВт·год / місяць) *</span>
                      <span class="text-indigo-600 font-semibold">до 2000 кВт·г</span>
                    </label>
                    <input
                      id="set-elec-wlimit"
                      type="number"
                      step="50"
                      min="100"
                      formControlName="elecDualWinterLimit"
                      class="w-full px-3 py-2 bg-white border border-indigo-300 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-500 font-mono"
                    />
                    <span class="text-3xs text-indigo-800/80 mt-1 block">
                      ⚡ Зимовий період (01.10 – 30.04): тариф діє для споживання до вказаного ліміту (2000 кВт·г). Усе спожите понад норму нараховується за літнім тарифом із пропорційним розподілом день/ніч відповідно до загального споживання за місяць.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- WATER SUPPLY AND WASTE REMOVAL TARIFFS -->
        <div class="pt-6 border-t border-slate-200 space-y-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center border border-cyan-200/60">
              <mat-icon>water_drop</mat-icon>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h3 class="text-base font-bold text-slate-900">Тарифи на водопостачання та вивіз сміття</h3>
                <span class="px-2 py-0.5 rounded-full text-3xs font-bold uppercase bg-cyan-100 text-cyan-800">
                  Ціна та дата початку дії
                </span>
              </div>
              <p class="text-xs text-slate-500">Встановлення вартості та дат набрання чинності для води та сміття</p>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Water Supply Tariff Card -->
            <div class="p-4 sm:p-5 rounded-xl border border-slate-200 bg-white space-y-3">
              <div class="flex items-center gap-2 pb-2 border-b border-slate-100">
                <mat-icon class="text-cyan-600">water_drop</mat-icon>
                <h4 class="text-xs sm:text-sm font-bold text-slate-900">Водопостачання (холодна вода)</h4>
              </div>

              <div class="space-y-3">
                <div>
                  <label for="set-water-price" class="block text-2xs font-semibold text-slate-700 mb-1">
                    Ціна за 1 м³ (грн) *
                  </label>
                  <input
                    id="set-water-price"
                    type="number"
                    step="0.01"
                    min="0"
                    formControlName="waterPrice"
                    placeholder="30.38"
                    class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-cyan-600"
                  />
                </div>

                <div>
                  <label for="set-water-date" class="block text-2xs font-semibold text-slate-700 mb-1">
                    Дата з якої починає діяти тариф *
                  </label>
                  <input
                    id="set-water-date"
                    type="date"
                    formControlName="waterValidFrom"
                    class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-cyan-600"
                  />
                </div>

                <div>
                  <label for="set-water-period" class="block text-2xs font-semibold text-slate-700 mb-1">
                    Строк дії тарифу
                  </label>
                  <input
                    id="set-water-period"
                    type="text"
                    formControlName="waterValidPeriod"
                    placeholder="Безстроково / До затвердження нового"
                    class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-cyan-600"
                  />
                </div>
              </div>
            </div>

            <!-- Waste Removal Tariff Card -->
            <div class="p-4 sm:p-5 rounded-xl border border-slate-200 bg-white space-y-3">
              <div class="flex items-center gap-2 pb-2 border-b border-slate-100">
                <mat-icon class="text-emerald-600">delete_outline</mat-icon>
                <h4 class="text-xs sm:text-sm font-bold text-slate-900">Вивіз сміття (ТПВ)</h4>
              </div>

              <div class="space-y-3">
                <div>
                  <label for="set-waste-price" class="block text-2xs font-semibold text-slate-700 mb-1">
                    Ціна на місяць за 1 особу (грн) *
                  </label>
                  <input
                    id="set-waste-price"
                    type="number"
                    step="0.01"
                    min="0"
                    formControlName="wastePrice"
                    placeholder="45.00"
                    class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label for="set-waste-date" class="block text-2xs font-semibold text-slate-700 mb-1">
                    Дата з якої починає діяти тариф *
                  </label>
                  <input
                    id="set-waste-date"
                    type="date"
                    formControlName="wasteValidFrom"
                    class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label for="set-waste-period" class="block text-2xs font-semibold text-slate-700 mb-1">
                    Строк дії тарифу
                  </label>
                  <input
                    id="set-waste-period"
                    type="text"
                    formControlName="wasteValidPeriod"
                    placeholder="Безстроково / До рішення міськради"
                    class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="flex items-center justify-end pt-4 border-t border-slate-200">
          @if (canEdit()) {
            <button
              id="btn-save-settings"
              type="submit"
              [disabled]="isSaving()"
              class="px-5 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-sm font-semibold transition-colors flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <mat-icon class="text-base">save</mat-icon>
              <span>{{ isSaving() ? 'Збереження...' : 'Зберегти всі налаштування та шаблони' }}</span>
            </button>
          } @else {
            <div class="text-xs text-slate-500 italic flex items-center gap-1">
              <mat-icon class="text-sm">lock</mat-icon>
              <span>Зміна налаштувань доступна лише адміністраторам</span>
            </div>
          }
        </div>
      </form>

      <!-- Cloud Database & Cloud SQL Synchronization -->
      <div class="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
        <div class="flex items-center justify-between pb-3 border-b border-slate-200">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <mat-icon>storage</mat-icon>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h3 class="text-base font-bold text-slate-900">Хмарна база даних {{ dbStatus()?.provider || 'Google Cloud SQL (PostgreSQL)' }}</h3>
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                  {{ dbStatus()?.connected !== false ? 'Підключено' : 'Помилка підключення' }}
                </span>
              </div>
              <p class="text-xs text-slate-500">Автоматичне збереження та синхронізація клієнтів, оплат і білінгу в хмарі PostgreSQL</p>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <span class="text-2xs font-bold text-slate-400 uppercase tracking-wider block">Тип / Провайдер БД</span>
            <span class="text-xs font-mono font-semibold text-slate-800 break-all">{{ dbStatus()?.provider || 'Google Cloud SQL (PostgreSQL)' }}</span>
          </div>
          <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <span class="text-2xs font-bold text-slate-400 uppercase tracking-wider block">Database Name / ID</span>
            <span class="text-xs font-mono font-semibold text-slate-800 truncate block" [title]="dbStatus()?.databaseId || 'postgres'">
              {{ dbStatus()?.databaseId || 'postgres' }}
            </span>
          </div>
          <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <span class="text-2xs font-bold text-slate-400 uppercase tracking-wider block">Остання синхронізація</span>
            <span class="text-xs font-semibold text-emerald-700">
              {{ dbStatus()?.lastSync ? (dbStatus()?.lastSync | slice:0:19) : 'В режимі реального часу' }}
            </span>
          </div>
          <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <span class="text-2xs font-bold text-slate-400 uppercase tracking-wider block">Записів у базі</span>
            <span class="text-xs font-bold text-slate-900">
              {{ clients().length }} клієнтів, {{ payments().length }} оплат
            </span>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            (click)="syncWithCloud()"
            [disabled]="isSyncingCloud()"
            class="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer shadow-xs"
          >
            <mat-icon [class.animate-spin]="isSyncingCloud()" class="text-base leading-none">sync</mat-icon>
            <span>{{ isSyncingCloud() ? 'Синхронізація...' : 'Синхронізувати з хмарною БД' }}</span>
          </button>

          <button
            type="button"
            (click)="pushAllToCloud()"
            [disabled]="isSyncingCloud()"
            class="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer shadow-xs"
          >
            <mat-icon class="text-base leading-none">cloud_upload</mat-icon>
            <span>Зберегти всю поточну базу у хмару</span>
          </button>

          <button
            type="button"
            (click)="refreshDbStatus()"
            class="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <mat-icon class="text-base leading-none">refresh</mat-icon>
            <span>Оновити статус</span>
          </button>
        </div>
      </div>

      <!-- Backup & Data Persistence Card -->
      <div class="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
        <div class="flex items-center gap-3 pb-4 border-b border-slate-200">
          <div class="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <mat-icon>cloud_download</mat-icon>
          </div>
          <div>
            <h3 class="text-base font-bold text-slate-900">Резервне копіювання даних</h3>
            <p class="text-xs text-slate-500">Збереження та відновлення бази абонентів і транзакцій</p>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-700">Експорт бази (JSON)</h4>
            <p class="text-xs text-slate-500">
              Завантажте повну резервну копію абонентів, платежів та налаштувань на свій комп'ютер чи телефон.
            </p>
            <button
              id="btn-export-backup"
              type="button"
              (click)="exportData()"
              class="mt-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <mat-icon class="text-base">file_download</mat-icon>
              <span>Завантажити копію</span>
            </button>
          </div>

          <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-700">Імпорт / Відновлення</h4>
            <p class="text-xs text-slate-500">
              Відновлення бази з раніше збереженого JSON-файлу.
            </p>
            <label class="mt-2 inline-flex px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold items-center gap-1.5 transition-colors cursor-pointer">
              <mat-icon class="text-base">upload_file</mat-icon>
              <span>Вибрати файл JSON</span>
              <input type="file" accept=".json" (change)="importData($event)" class="hidden" />
            </label>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class SettingsView implements OnInit {
  private readonly dataService = inject(IptvData);

  @ViewChild('reminderInput') reminderInputRef?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('renewalInput') renewalInputRef?: ElementRef<HTMLTextAreaElement>;

  readonly isSaving = signal(false);
  readonly canEdit = this.dataService.canEdit;
  readonly isSyncingCloud = this.dataService.isSyncingCloud;
  readonly dbStatus = this.dataService.dbStatus;
  readonly clients = this.dataService.clients;
  readonly payments = this.dataService.payments;
  readonly electricityAccounts = this.dataService.electricityAccounts;

  activeTemplateField: 'reminder' | 'renewal' = 'reminder';

  readonly form = new FormGroup({
    defaultMonthlyPrice: new FormControl(100, [Validators.required, Validators.min(0)]),
    cardRequisites: new FormControl(''),
    reminderDaysBefore: new FormControl(7, [Validators.required, Validators.min(1)]),
    viberReminderMessageTemplate: new FormControl(''),
    viberRenewalMessageTemplate: new FormControl(''),
    telegramBotToken: new FormControl(''),
    telegramBotUsername: new FormControl('iptv_billing_bot'),
    telegramSenderName: new FormControl('IPTV Підтримка'),
    // Utility Tariffs Controls
    waterPrice: new FormControl<number>(30.38, [Validators.required, Validators.min(0)]),
    waterValidFrom: new FormControl<string>('2026-01-01', [Validators.required]),
    waterValidPeriod: new FormControl<string>('Безстроково'),
    wastePrice: new FormControl<number>(45.00, [Validators.required, Validators.min(0)]),
    wasteValidFrom: new FormControl<string>('2026-01-01', [Validators.required]),
    wasteValidPeriod: new FormControl<string>('Безстроково'),
    elecSingleRate: new FormControl<number>(4.32, [Validators.required, Validators.min(0)]),
    elecSingleValidFrom: new FormControl<string>('2026-06-01', [Validators.required]),
    elecSingleValidPeriod: new FormControl<string>('1 рік (на весь рік)'),
    elecDualValidFrom: new FormControl<string>('2026-06-01', [Validators.required]),
    elecDualValidPeriod: new FormControl<string>('1 рік (диференційований)'),
    elecDualSummerDay: new FormControl<number>(4.32, [Validators.required, Validators.min(0)]),
    elecDualSummerNight: new FormControl<number>(2.16, [Validators.required, Validators.min(0)]),
    elecDualWinterDay: new FormControl<number>(4.32, [Validators.required, Validators.min(0)]),
    elecDualWinterNight: new FormControl<number>(2.16, [Validators.required, Validators.min(0)]),
    elecDualWinterLimit: new FormControl<number>(2000, [Validators.required, Validators.min(100)]),
  });

  // Reactive signals for live preview updates
  readonly reminderTemplateVal = signal<string>(DEFAULT_VIBER_REMINDER_TEMPLATE);
  readonly renewalTemplateVal = signal<string>(DEFAULT_VIBER_RENEWAL_TEMPLATE);

  constructor() {
    effect(() => {
      const s = this.dataService.settings();
      if (this.form.pristine) {
        this.patchFormValues(s);
      }
    });
  }

  async setAccountTariffType(acc: UtilityAccount, type: 'single' | 'dual'): Promise<void> {
    await this.dataService.saveUtilityAccount({
      ...acc,
      electricityTariffType: type,
    });
  }

  private patchFormValues(s: AppSettings): void {
    const reminderTmpl = s.viberReminderMessageTemplate || DEFAULT_VIBER_REMINDER_TEMPLATE;
    const renewalTmpl = s.viberRenewalMessageTemplate || DEFAULT_VIBER_RENEWAL_TEMPLATE;
    const tariffs = s.utilityTariffsSettings || DEFAULT_UTILITY_TARIFFS;

    this.form.patchValue(
      {
        defaultMonthlyPrice: s.defaultMonthlyPrice ?? 100,
        cardRequisites: s.cardRequisites || '',
        reminderDaysBefore: s.reminderDaysBefore ?? 7,
        viberReminderMessageTemplate: reminderTmpl,
        viberRenewalMessageTemplate: renewalTmpl,
        telegramBotToken: s.telegramBotToken || '',
        telegramBotUsername: s.telegramBotUsername || 'iptv_billing_bot',
        telegramSenderName: s.telegramSenderName || 'IPTV Підтримка',
        waterPrice: tariffs.water?.price ?? 30.38,
        waterValidFrom: tariffs.water?.validFrom ?? '2026-01-01',
        waterValidPeriod: 'Безстроково',
        wastePrice: tariffs.waste?.price ?? 45.00,
        wasteValidFrom: tariffs.waste?.validFrom ?? '2026-01-01',
        wasteValidPeriod: 'Безстроково',
        elecSingleRate: tariffs.electricitySingle?.rate ?? 4.32,
        elecSingleValidFrom: tariffs.electricitySingle?.validFrom ?? '2026-06-01',
        elecSingleValidPeriod: '1 рік (на весь рік)',
        elecDualValidFrom: tariffs.electricityDual?.validFrom ?? '2026-06-01',
        elecDualValidPeriod: '1 рік (диференційований)',
        elecDualSummerDay: tariffs.electricityDual?.summerDay ?? 4.32,
        elecDualSummerNight: tariffs.electricityDual?.summerNight ?? 2.16,
        elecDualWinterDay: tariffs.electricityDual?.winterDay ?? 4.32,
        elecDualWinterNight: tariffs.electricityDual?.winterNight ?? 2.16,
        elecDualWinterLimit: tariffs.electricityDual?.winterLimitKwh ?? 2000,
      },
      { emitEvent: false }
    );

    this.reminderTemplateVal.set(reminderTmpl);
    this.renewalTemplateVal.set(renewalTmpl);
  }

  readonly previewReminderText = computed(() => {
    const tmpl = this.reminderTemplateVal() || DEFAULT_VIBER_REMINDER_TEMPLATE;
    const card = this.form.controls.cardRequisites.value || '4441 1144 5566 7788 (Монобанк)';
    const price = this.form.controls.defaultMonthlyPrice.value || 100;
    const todayFormatted = formatDateUa(new Date().toISOString().split('T')[0], true);
    
    // Future date calculation for sample
    const sampleDate = new Date();
    sampleDate.setDate(sampleDate.getDate() + (Number(this.form.controls.reminderDaysBefore.value) || 7));
    const sampleDateStr = formatDateUa(sampleDate.toISOString().split('T')[0], true);

    return interpolateViberMessage(tmpl, {
      name: 'Олександр Коваленко',
      login: 'iptv_user77',
      phone: '+380971234567',
      activeUntil: sampleDateStr,
      currentDate: todayFormatted,
      amount: price,
      price: price,
      card: card,
      balance: 0,
      months: 1,
      device: 'Samsung Smart TV',
      notes: 'ТВ у вітальні',
    });
  });

  readonly previewRenewalText = computed(() => {
    const tmpl = this.renewalTemplateVal() || DEFAULT_VIBER_RENEWAL_TEMPLATE;
    const card = this.form.controls.cardRequisites.value || '4441 1144 5566 7788 (Монобанк)';
    const price = this.form.controls.defaultMonthlyPrice.value || 100;
    const todayFormatted = formatDateUa(new Date().toISOString().split('T')[0], true);

    const renewalDate = new Date();
    renewalDate.setMonth(renewalDate.getMonth() + 1);
    const renewalDateStr = formatDateUa(renewalDate.toISOString().split('T')[0], true);

    return interpolateViberMessage(tmpl, {
      name: 'Олександр Коваленко',
      login: 'iptv_user77',
      phone: '+380971234567',
      activeUntil: renewalDateStr,
      currentDate: todayFormatted,
      amount: price,
      price: price,
      card: card,
      balance: 0,
      months: 1,
      device: 'Samsung Smart TV',
      notes: 'ТВ у вітальні',
    });
  });

  ngOnInit(): void {
    this.patchFormValues(this.dataService.settings());

    // Live preview updates when any form control changes
    this.form.valueChanges.subscribe(() => {
      this.reminderTemplateVal.set(this.form.controls.viberReminderMessageTemplate.value || '');
      this.renewalTemplateVal.set(this.form.controls.viberRenewalMessageTemplate.value || '');
    });
  }

  insertTag(tag: string): void {
    const isReminder = this.activeTemplateField === 'reminder';
    const control = isReminder
      ? this.form.controls.viberReminderMessageTemplate
      : this.form.controls.viberRenewalMessageTemplate;
    const textarea = isReminder
      ? this.reminderInputRef?.nativeElement
      : this.renewalInputRef?.nativeElement;

    if (textarea) {
      const start = textarea.selectionStart ?? textarea.value.length;
      const end = textarea.selectionEnd ?? textarea.value.length;
      const currentVal = textarea.value;
      const newVal = currentVal.substring(0, start) + tag + currentVal.substring(end);
      control.setValue(newVal);
      control.markAsDirty();

      // Re-focus and set cursor position after inserted tag
      setTimeout(() => {
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = start + tag.length;
      }, 0);
    } else {
      const currentVal = control.value || '';
      control.setValue(currentVal + ' ' + tag);
      control.markAsDirty();
    }
  }

  resetReminderTemplateToDefault(): void {
    this.form.controls.viberReminderMessageTemplate.setValue(DEFAULT_VIBER_REMINDER_TEMPLATE);
    this.form.controls.viberReminderMessageTemplate.markAsDirty();
    this.reminderTemplateVal.set(DEFAULT_VIBER_REMINDER_TEMPLATE);
  }

  resetRenewalTemplateToDefault(): void {
    this.form.controls.viberRenewalMessageTemplate.setValue(DEFAULT_VIBER_RENEWAL_TEMPLATE);
    this.form.controls.viberRenewalMessageTemplate.markAsDirty();
    this.renewalTemplateVal.set(DEFAULT_VIBER_RENEWAL_TEMPLATE);
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;
    this.isSaving.set(true);
    try {
      const val = this.form.getRawValue();
      const current = this.dataService.settings();

      const tariffs: UtilityTariffsSettings = {
        water: {
          price: Number(val.waterPrice) || 30.38,
          validFrom: val.waterValidFrom || '2026-01-01',
          history: current.utilityTariffsSettings?.water?.history || [],
        },
        waste: {
          price: Number(val.wastePrice) || 45.00,
          validFrom: val.wasteValidFrom || '2026-01-01',
          history: current.utilityTariffsSettings?.waste?.history || [],
        },
        electricitySingle: {
          rate: Number(val.elecSingleRate) || 4.32,
          validFrom: val.elecSingleValidFrom || '2026-06-01',
          history: current.utilityTariffsSettings?.electricitySingle?.history || [],
        },
        electricityDual: {
          validFrom: val.elecDualValidFrom || '2026-06-01',
          summerDay: Number(val.elecDualSummerDay) || 4.32,
          summerNight: Number(val.elecDualSummerNight) || 2.16,
          winterDay: Number(val.elecDualWinterDay) || 4.32,
          winterNight: Number(val.elecDualWinterNight) || 2.16,
          winterLimitKwh: Number(val.elecDualWinterLimit) || 2000,
          history: current.utilityTariffsSettings?.electricityDual?.history || [],
        },
      };

      await this.dataService.saveSettings({
        ...current,
        defaultMonthlyPrice: Number(val.defaultMonthlyPrice),
        cardRequisites: val.cardRequisites?.trim() || '',
        reminderDaysBefore: Number(val.reminderDaysBefore),
        viberReminderMessageTemplate: val.viberReminderMessageTemplate?.trim() || DEFAULT_VIBER_REMINDER_TEMPLATE,
        viberRenewalMessageTemplate: val.viberRenewalMessageTemplate?.trim() || DEFAULT_VIBER_RENEWAL_TEMPLATE,
        telegramBotToken: val.telegramBotToken?.trim() || '',
        telegramBotUsername: val.telegramBotUsername?.trim() || 'iptv_billing_bot',
        telegramSenderName: val.telegramSenderName?.trim() || 'IPTV Підтримка',
        utilityTariffsSettings: tariffs,
      });
      this.form.markAsPristine();
    } finally {
      this.isSaving.set(false);
    }
  }

  exportData(): void {
    const jsonStr = this.dataService.exportBackup();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `iptv_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async syncWithCloud(): Promise<void> {
    await this.dataService.syncCloudDatabase();
  }

  async pushAllToCloud(): Promise<void> {
    await this.dataService.pushAllToCloud();
  }

  async refreshDbStatus(): Promise<void> {
    await this.dataService.fetchDbStatus();
  }

  importData(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        this.dataService.importBackup(content);
      }
    };
    reader.readAsText(file);
    input.value = '';
  }
}
