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
  SettingsSectionId,
} from '../../models/client.model';
import {
  UtilityAccount,
  UtilityTariffsSettings,
  DEFAULT_UTILITY_TARIFFS,
  OutageScheduleViewVariant,
  OUTAGE_SCHEDULE_VARIANTS,
  OutageScheduleVariantMeta,
} from '../../models/utility.model';

export type SettingsGroupModalId =
  | 'billing'
  | 'outage_display'
  | 'telegram'
  | 'viber'
  | 'electricity_tariffs'
  | 'water_waste_tariffs'
  | 'database'
  | 'backup';

@Component({
  selector: 'app-settings-view',
  imports: [CommonModule, ReactiveFormsModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div id="settings-container" class="space-y-6 max-w-7xl mx-auto">
      @if (!hasAnyAllowedSettings()) {
        <div class="p-8 rounded-3xl bg-white border border-slate-200 shadow-xs text-center space-y-3">
          <div class="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            <mat-icon class="text-3xl">lock</mat-icon>
          </div>
          <h3 class="text-base sm:text-lg font-bold text-slate-900">
            Доступ до системних налаштувань обмежено
          </h3>
          <p class="text-xs text-slate-500 max-w-md mx-auto">
            Зміна системних налаштувань закрита для звичайних користувачів. Адміністратор може надати вам доступ до окремих пунктів налаштувань у розділі «Користувачі».
          </p>
        </div>
      } @else {
        <!-- ============================================================== -->
        <!-- LARGE THEMATIC TILES FOR EACH PERMITTED SETTINGS GROUP         -->
        <!-- ============================================================== -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
          <!-- TILE 1: ЗАГАЛЬНІ НАЛАШТУВАННЯ БІЛІНГУ ТА РЕКВІЗИТИ -->
          @if (isSectionAllowed('billing')) {
            <button
              id="settings-tile-billing"
              type="button"
              (click)="openSettingsModal('billing')"
              class="group relative w-full min-h-[115px] sm:min-h-[220px] rounded-2xl sm:rounded-3xl overflow-hidden border-2 border-white/20 hover:border-emerald-400 shadow-md hover:shadow-2xl transition-all duration-300 cursor-pointer flex flex-col justify-between p-3.5 sm:p-6 text-left bg-slate-950 focus:outline-none focus:ring-4 focus:ring-emerald-400/40"
            >
              <img
                src="/assets/images/tile_iptv_media_1793997828251.jpg"
                alt="Загальні налаштування білінгу"
                class="absolute inset-0 w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 opacity-65"
                referrerpolicy="no-referrer"
              />
              <div class="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-emerald-950/65 to-slate-950/35 group-hover:from-slate-950/90 transition-colors duration-300"></div>

              <div class="relative z-10 flex items-center justify-between w-full">
                <div class="w-8 h-8 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-emerald-500/25 backdrop-blur-xs border border-emerald-400/40 text-emerald-300 flex items-center justify-center shadow-sm">
                  <mat-icon class="text-xl sm:text-2xl">payments</mat-icon>
                </div>
                <span class="px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full bg-white/15 backdrop-blur-xs border border-white/20 text-white text-3xs sm:text-2xs font-bold">
                  Тариф: {{ form.controls.defaultMonthlyPrice.value }} ₴/міс
                </span>
              </div>

              <div class="relative z-10 space-y-1 sm:space-y-1.5 mt-2.5 sm:mt-6">
                <h3 class="text-base sm:text-2xl font-black text-white tracking-tight drop-shadow-xs">
                  Загальні налаштування та реквізити
                </h3>
                <p class="text-2xs sm:text-xs text-slate-200/90 line-clamp-1 sm:line-clamp-2">
                  Стандартний тариф IPTV, картка / IBAN, нагадування та вигляд графіку відключень
                </p>
              </div>
            </button>
          }

          <!-- TILE 1B: ВИГЛЯД ГРАФІКУ ВІДКЛЮЧЕНЬ (10 ВАРІАНТІВ ВІДОБРАЖЕННЯ) -->
          @if (isSectionAllowed('outage_display')) {
            <button
              id="settings-tile-outage-display"
              type="button"
              (click)="openSettingsModal('outage_display')"
              class="group relative w-full min-h-[115px] sm:min-h-[220px] rounded-2xl sm:rounded-3xl overflow-hidden border-2 border-white/20 hover:border-amber-400 shadow-md hover:shadow-2xl transition-all duration-300 cursor-pointer flex flex-col justify-between p-3.5 sm:p-6 text-left bg-slate-950 focus:outline-none focus:ring-4 focus:ring-amber-400/40"
            >
              <img
                src="/assets/images/tile_outage_schedule_1793997826688.jpg"
                alt="Варіанти відображення графіку відключень"
                class="absolute inset-0 w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 opacity-65"
                referrerpolicy="no-referrer"
              />
              <div class="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-amber-950/70 to-slate-950/35 group-hover:from-slate-950/90 transition-colors duration-300"></div>

              <div class="relative z-10 flex items-center justify-between w-full gap-2">
                <div class="w-8 h-8 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-amber-500/25 backdrop-blur-xs border border-amber-400/40 text-amber-300 flex items-center justify-center shadow-sm shrink-0">
                  <mat-icon class="text-xl sm:text-2xl">{{ activeOutageVariantMeta().icon }}</mat-icon>
                </div>
                <span class="px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full bg-amber-500/25 backdrop-blur-xs border border-amber-400/40 text-amber-200 text-3xs sm:text-2xs font-bold truncate">
                  {{ activeOutageVariantMeta().shortName }} (з 10)
                </span>
              </div>

              <div class="relative z-10 space-y-1 sm:space-y-1.5 mt-2.5 sm:mt-6">
                <h3 class="text-base sm:text-2xl font-black text-white tracking-tight drop-shadow-xs">
                  Вигляд графіку відключень
                </h3>
                <p class="text-2xs sm:text-xs text-slate-200/90 line-clamp-1 sm:line-clamp-2">
                  Вибір одного з 10 стилів відображення погодинного графіку ДТЕК (сітка, радар, стрічка, SCADA, фази доби тощо)
                </p>
              </div>
            </button>
          }

          <!-- TILE 2: ТАРИФИ НА ЕЛЕКТРОЕНЕРГІЮ -->
          @if (isSectionAllowed('electricity_tariffs')) {
            <button
              id="settings-tile-electricity-tariffs"
              type="button"
              (click)="openSettingsModal('electricity_tariffs')"
              class="group relative w-full min-h-[115px] sm:min-h-[220px] rounded-2xl sm:rounded-3xl overflow-hidden border-2 border-white/20 hover:border-amber-400 shadow-md hover:shadow-2xl transition-all duration-300 cursor-pointer flex flex-col justify-between p-3.5 sm:p-6 text-left bg-slate-950 focus:outline-none focus:ring-4 focus:ring-amber-400/40"
            >
              <img
                src="/assets/images/tile_electricity_cabinet_1793997827492.jpg"
                alt="Тарифи на електроенергію"
                class="absolute inset-0 w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 opacity-65"
                referrerpolicy="no-referrer"
              />
              <div class="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-amber-950/65 to-slate-950/35 group-hover:from-slate-950/90 transition-colors duration-300"></div>

              <div class="relative z-10 flex items-center justify-between w-full">
                <div class="w-8 h-8 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-amber-500/25 backdrop-blur-xs border border-amber-400/40 text-amber-300 flex items-center justify-center shadow-sm">
                  <mat-icon class="text-xl sm:text-2xl">bolt</mat-icon>
                </div>
                <span class="px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full bg-amber-500/25 backdrop-blur-xs border border-amber-400/40 text-amber-200 text-3xs sm:text-2xs font-mono font-bold">
                  {{ form.controls.elecDualSummerDay.value }} / {{ form.controls.elecDualSummerNight.value }} ₴
                </span>
              </div>

              <div class="relative z-10 space-y-1 sm:space-y-1.5 mt-2.5 sm:mt-6">
                <h3 class="text-base sm:text-2xl font-black text-white tracking-tight drop-shadow-xs">
                  Тарифи на електроенергію
                </h3>
                <p class="text-2xs sm:text-xs text-slate-200/90 line-clamp-1 sm:line-clamp-2">
                  Однотарифний та двотарифний план (День / Ніч), літній і зимовий сезон, ліміт 2000 кВт·г
                </p>
              </div>
            </button>
          }

          <!-- TILE 3: ТАРИФИ НА ВОДУ ТА ВИВІЗ СМІТТЯ -->
          @if (isSectionAllowed('water_waste_tariffs')) {
            <button
              id="settings-tile-water-waste-tariffs"
              type="button"
              (click)="openSettingsModal('water_waste_tariffs')"
              class="group relative w-full min-h-[115px] sm:min-h-[220px] rounded-2xl sm:rounded-3xl overflow-hidden border-2 border-white/20 hover:border-cyan-400 shadow-md hover:shadow-2xl transition-all duration-300 cursor-pointer flex flex-col justify-between p-3.5 sm:p-6 text-left bg-slate-950 focus:outline-none focus:ring-4 focus:ring-cyan-400/40"
            >
              <img
                src="/assets/images/tile_water_supply_1793997828992.jpg"
                alt="Тарифи на водопостачання та сміття"
                class="absolute inset-0 w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 opacity-65"
                referrerpolicy="no-referrer"
              />
              <div class="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-cyan-950/65 to-slate-950/35 group-hover:from-slate-950/90 transition-colors duration-300"></div>

              <div class="relative z-10 flex items-center justify-between w-full">
                <div class="w-8 h-8 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-cyan-500/25 backdrop-blur-xs border border-cyan-400/40 text-cyan-300 flex items-center justify-center shadow-sm">
                  <mat-icon class="text-xl sm:text-2xl">water_drop</mat-icon>
                </div>
                <span class="px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full bg-cyan-500/25 backdrop-blur-xs border border-cyan-400/40 text-cyan-200 text-3xs sm:text-2xs font-mono font-bold">
                  {{ form.controls.waterPrice.value }} ₴/м³ • ТПВ {{ form.controls.wastePrice.value }} ₴
                </span>
              </div>

              <div class="relative z-10 space-y-1 sm:space-y-1.5 mt-2.5 sm:mt-6">
                <h3 class="text-base sm:text-2xl font-black text-white tracking-tight drop-shadow-xs">
                  Тарифи на воду та сміття
                </h3>
                <p class="text-2xs sm:text-xs text-slate-200/90 line-clamp-1 sm:line-clamp-2">
                  Вартість кубометра холодної води, абонплата, вивіз побутових відходів та дати дії
                </p>
              </div>
            </button>
          }

          <!-- TILE 4: ШАБЛОНИ ПОВІДОМЛЕНЬ VIBER -->
          @if (isSectionAllowed('viber')) {
            <button
              id="settings-tile-viber"
              type="button"
              (click)="openSettingsModal('viber')"
              class="group relative w-full min-h-[115px] sm:min-h-[220px] rounded-2xl sm:rounded-3xl overflow-hidden border-2 border-white/20 hover:border-purple-400 shadow-md hover:shadow-2xl transition-all duration-300 cursor-pointer flex flex-col justify-between p-3.5 sm:p-6 text-left bg-slate-950 focus:outline-none focus:ring-4 focus:ring-purple-400/40"
            >
              <img
                src="/assets/images/tile_iptv_media_1793997828251.jpg"
                alt="Шаблони повідомлень Viber"
                class="absolute inset-0 w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 opacity-60"
                referrerpolicy="no-referrer"
              />
              <div class="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-purple-950/75 to-slate-950/40 group-hover:from-slate-950/90 transition-colors duration-300"></div>

              <div class="relative z-10 flex items-center justify-between w-full">
                <div class="w-8 h-8 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-purple-500/25 backdrop-blur-xs border border-purple-400/40 text-purple-300 flex items-center justify-center shadow-sm">
                  <mat-icon class="text-xl sm:text-2xl">chat</mat-icon>
                </div>
                <span class="px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full bg-purple-500/25 backdrop-blur-xs border border-purple-400/40 text-purple-200 text-3xs sm:text-2xs font-bold">
                  2 шаблони Viber
                </span>
              </div>

              <div class="relative z-10 space-y-1 sm:space-y-1.5 mt-2.5 sm:mt-6">
                <h3 class="text-base sm:text-2xl font-black text-white tracking-tight drop-shadow-xs">
                  Шаблони повідомлень Viber
                </h3>
                <p class="text-2xs sm:text-xs text-slate-200/90 line-clamp-1 sm:line-clamp-2">
                  Конструктор текстів для нагадувань про оплату та підтвердження продовження підписки
                </p>
              </div>
            </button>
          }

          <!-- TILE 5: НАЛАШТУВАННЯ TELEGRAM BOT -->
          @if (isSectionAllowed('telegram')) {
            <button
              id="settings-tile-telegram"
              type="button"
              (click)="openSettingsModal('telegram')"
              class="group relative w-full min-h-[115px] sm:min-h-[220px] rounded-2xl sm:rounded-3xl overflow-hidden border-2 border-white/20 hover:border-sky-400 shadow-md hover:shadow-2xl transition-all duration-300 cursor-pointer flex flex-col justify-between p-3.5 sm:p-6 text-left bg-slate-950 focus:outline-none focus:ring-4 focus:ring-sky-400/40"
            >
              <img
                src="/assets/images/tile_iptv_media_1793997828251.jpg"
                alt="Налаштування Telegram Bot"
                class="absolute inset-0 w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 opacity-60"
                referrerpolicy="no-referrer"
              />
              <div class="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-sky-950/75 to-slate-950/40 group-hover:from-slate-950/90 transition-colors duration-300"></div>

              <div class="relative z-10 flex items-center justify-between w-full">
                <div class="w-8 h-8 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-sky-500/25 backdrop-blur-xs border border-sky-400/40 text-sky-300 flex items-center justify-center shadow-sm">
                  <mat-icon class="text-xl sm:text-2xl">send</mat-icon>
                </div>
                <span
                  class="px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full backdrop-blur-xs border text-3xs sm:text-2xs font-bold"
                  [class.bg-emerald-500/25]="form.controls.telegramBotToken.value"
                  [class.border-emerald-400/40]="form.controls.telegramBotToken.value"
                  [class.text-emerald-200]="form.controls.telegramBotToken.value"
                  [class.bg-white/15]="!form.controls.telegramBotToken.value"
                  [class.border-white/20]="!form.controls.telegramBotToken.value"
                  [class.text-slate-200]="!form.controls.telegramBotToken.value"
                >
                  {{ form.controls.telegramBotToken.value ? 'Токен налаштовано' : 'Без токена' }}
                </span>
              </div>

              <div class="relative z-10 space-y-1 sm:space-y-1.5 mt-2.5 sm:mt-6">
                <h3 class="text-base sm:text-2xl font-black text-white tracking-tight drop-shadow-xs">
                  Telegram Bot та сповіщення
                </h3>
                <p class="text-2xs sm:text-xs text-slate-200/90 line-clamp-1 sm:line-clamp-2">
                  Токен бота, юзернейм &#64;{{ form.controls.telegramBotUsername.value || 'bot' }} та ім'я відправника повідомлень
                </p>
              </div>
            </button>
          }

          <!-- TILE 6: КЕРУВАННЯ БАЗАМИ ДАНИХ POSTGRESQL & CLOUD SQL -->
          @if (isSectionAllowed('database')) {
            <button
              id="settings-tile-database"
              type="button"
              (click)="openSettingsModal('database')"
              class="group relative w-full min-h-[115px] sm:min-h-[220px] rounded-2xl sm:rounded-3xl overflow-hidden border-2 border-white/20 hover:border-indigo-400 shadow-md hover:shadow-2xl transition-all duration-300 cursor-pointer flex flex-col justify-between p-3.5 sm:p-6 text-left bg-slate-950 focus:outline-none focus:ring-4 focus:ring-indigo-400/40"
            >
              <img
                src="/assets/images/tile_outage_schedule_1793997826688.jpg"
                alt="Керування базами даних PostgreSQL"
                class="absolute inset-0 w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 opacity-65"
                referrerpolicy="no-referrer"
              />
              <div class="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-indigo-950/70 to-slate-950/35 group-hover:from-slate-950/90 transition-colors duration-300"></div>

              <div class="relative z-10 flex items-center justify-between w-full">
                <div class="w-8 h-8 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-indigo-500/25 backdrop-blur-xs border border-indigo-400/40 text-indigo-300 flex items-center justify-center shadow-sm">
                  <mat-icon class="text-xl sm:text-2xl">storage</mat-icon>
                </div>
                <span class="px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full bg-emerald-500/25 backdrop-blur-xs border border-emerald-400/40 text-emerald-200 text-3xs sm:text-2xs font-bold inline-flex items-center gap-1 sm:gap-1.5">
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>{{ activeDbMode() === 'cloudsql' ? 'Cloud SQL' : 'Зовнішня PostgreSQL' }}</span>
                </span>
              </div>

              <div class="relative z-10 space-y-1 sm:space-y-1.5 mt-2.5 sm:mt-6">
                <h3 class="text-base sm:text-2xl font-black text-white tracking-tight drop-shadow-xs">
                  Бази даних PostgreSQL
                </h3>
                <p class="text-2xs sm:text-xs text-slate-200/90 line-clamp-1 sm:line-clamp-2">
                  Зовнішня PostgreSQL (Aiven Cloud) та Google Cloud SQL, синхронізація й копіювання таблиць
                </p>
              </div>
            </button>
          }

          <!-- TILE 7: РЕЗЕРВНЕ КОПІЮВАННЯ ДАНИХ (JSON) -->
          @if (isSectionAllowed('backup')) {
            <button
              id="settings-tile-backup"
              type="button"
              (click)="openSettingsModal('backup')"
              class="group relative w-full min-h-[115px] sm:min-h-[220px] rounded-2xl sm:rounded-3xl overflow-hidden border-2 border-white/20 hover:border-teal-400 shadow-md hover:shadow-2xl transition-all duration-300 cursor-pointer flex flex-col justify-between p-3.5 sm:p-6 text-left bg-slate-950 focus:outline-none focus:ring-4 focus:ring-teal-400/40 md:col-span-2"
            >
              <img
                src="/assets/images/tile_electricity_cabinet_1793997827492.jpg"
                alt="Резервне копіювання даних"
                class="absolute inset-0 w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 opacity-55"
                referrerpolicy="no-referrer"
              />
              <div class="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-teal-950/75 to-slate-950/85 group-hover:from-slate-950/90 transition-colors duration-300"></div>

              <div class="relative z-10 flex items-center justify-between w-full">
                <div class="w-8 h-8 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-teal-500/25 backdrop-blur-xs border border-teal-400/40 text-teal-300 flex items-center justify-center shadow-sm">
                  <mat-icon class="text-xl sm:text-2xl">cloud_download</mat-icon>
                </div>
                <span class="px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full bg-teal-500/25 backdrop-blur-xs border border-teal-400/40 text-teal-200 text-3xs sm:text-2xs font-bold">
                  Експорт / Імпорт JSON ({{ clients().length }} абонентів)
                </span>
              </div>

              <div class="relative z-10 space-y-1 sm:space-y-1.5 mt-2.5 sm:mt-6">
                <h3 class="text-base sm:text-2xl font-black text-white tracking-tight drop-shadow-xs">
                  Резервне копіювання та відновлення (JSON)
                </h3>
                <p class="text-2xs sm:text-xs text-slate-200/90 line-clamp-1 sm:line-clamp-2">
                  Завантаження повної резервної копії бази даних на пристрій та відновлення з JSON-файлу
                </p>
              </div>
            </button>
          }
        </div>
      }

      <!-- ============================================================== -->
      <!-- MODAL WINDOWS FOR EACH SETTINGS GROUP                          -->
      <!-- ============================================================== -->
      @if (activeSettingsModal(); as modalId) {
        <div
          id="settings-group-modal-backdrop"
          class="fixed inset-0 z-[100] overflow-y-auto p-3 sm:p-5 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-150"
          (click)="closeSettingsModal()"
          (keydown.escape)="closeSettingsModal()"
          tabindex="-1"
        >
          <div
            class="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto flex flex-col max-h-[92dvh]"
            tabindex="-1"
            (click)="$event.stopPropagation()"
            (keydown)="$event.stopPropagation()"
          >
            <!-- Modal Header -->
            <div class="px-5 sm:px-6 py-4 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0">
              <div class="flex items-center gap-3 min-w-0">
                <div class="w-10 h-10 rounded-xl bg-white/15 text-amber-400 flex items-center justify-center shrink-0">
                  <mat-icon>{{ getModalMeta(modalId).icon }}</mat-icon>
                </div>
                <div class="min-w-0">
                  <h3 class="text-base sm:text-lg font-black text-white truncate">
                    {{ getModalMeta(modalId).title }}
                  </h3>
                  <p class="text-2xs sm:text-xs text-slate-300 truncate">
                    {{ getModalMeta(modalId).subtitle }}
                  </p>
                </div>
              </div>

              <button
                type="button"
                (click)="closeSettingsModal()"
                class="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                title="Закрити вікно"
              >
                <mat-icon class="text-lg">close</mat-icon>
              </button>
            </div>

            <!-- Modal Scrollable Body -->
            <div class="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5">
              <!-- FORM-BASED GROUPS (billing, telegram, viber, electricity_tariffs, water_waste_tariffs) -->
              <form [formGroup]="form" (ngSubmit)="onSubmit()">
                @switch (modalId) {
                  <!-- 1. GENERAL SETTINGS, OUTAGE SCHEDULE VIEW & REQUISITES -->
                  @case ('billing') {
                    <div class="space-y-5">
                      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                      <!-- Outage Schedule Display Variant Selector inside General Settings -->
                      <div class="p-4 sm:p-5 rounded-2xl bg-amber-50/60 border border-amber-200/90 space-y-3">
                        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <label for="settings-outage-variant-select" class="text-xs sm:text-sm font-black text-slate-900 flex items-center gap-1.5">
                              <mat-icon class="text-amber-600 text-base leading-none">lightbulb</mat-icon>
                              <span>Варіант відображення графіку відключень світла (10 стилів)</span>
                            </label>
                            <p class="text-2xs text-slate-600 mt-0.5">
                              Оберіть бажаний вигляд погодинного графіку ДТЕК за замовчуванням для вкладки «Графік відключень»
                            </p>
                          </div>
                          <div class="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              (click)="openSettingsModal('outage_display')"
                              class="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-2xs font-bold flex items-center gap-1 cursor-pointer shadow-2xs"
                            >
                              <mat-icon class="text-xs leading-none">palette</mat-icon>
                              <span>Галерея 10 варіантів</span>
                            </button>
                            <button
                              type="button"
                              (click)="goToOutageSchedule()"
                              class="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 text-2xs font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <mat-icon class="text-xs leading-none">open_in_new</mat-icon>
                              <span>До графіку</span>
                            </button>
                          </div>
                        </div>

                        <select
                          id="settings-outage-variant-select"
                          formControlName="outageScheduleViewVariant"
                          (change)="onOutageVariantSelectChange($any($event.target).value)"
                          class="w-full px-3.5 py-2.5 bg-white border border-amber-300 rounded-xl text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:border-amber-600"
                        >
                          @for (v of outageScheduleVariants; track v.id) {
                            <option [value]="v.id">{{ v.name }} — {{ v.description }}</option>
                          }
                        </select>
                      </div>
                    </div>
                  }

                  <!-- 1B. DEDICATED 10 OUTAGE SCHEDULE VARIANTS GALLERY -->
                  @case ('outage_display') {
                    <div class="space-y-4">
                      <div class="p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-amber-950 to-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div class="space-y-1">
                          <div class="text-2xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                            <mat-icon class="text-xs leading-none">auto_awesome_mosaic</mat-icon>
                            <span>Активний стиль: {{ activeOutageVariantMeta().name }}</span>
                          </div>
                          <p class="text-xs text-slate-200">
                            Натисніть на будь-який із 10 варіантів нижче, щоб встановити його як основний стиль відображення графіку відключень світла ДТЕК.
                          </p>
                        </div>
                        <button
                          type="button"
                          (click)="goToOutageSchedule()"
                          class="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center gap-1.5 cursor-pointer shrink-0 shadow-md"
                        >
                          <mat-icon class="text-base leading-none">bolt</mat-icon>
                          <span>Перейти до графіку відключень</span>
                        </button>
                      </div>

                      <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                        @for (v of outageScheduleVariants; track v.id) {
                          @let isSelected = selectedOutageVariant() === v.id;
                          <button
                            type="button"
                            (click)="selectOutageVariantCard(v.id)"
                            class="p-4 rounded-2xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between gap-3"
                            [class.border-amber-500]="isSelected"
                            [class.bg-amber-50/60]="isSelected"
                            [class.shadow-md]="isSelected"
                            [class.border-slate-200]="!isSelected"
                            [class.bg-white]="!isSelected"
                            [class.hover:border-slate-300]="!isSelected"
                          >
                            <div class="flex items-start justify-between gap-2.5">
                              <div class="flex items-center gap-2.5">
                                <div
                                  class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold"
                                  [class.bg-amber-500]="isSelected"
                                  [class.text-white]="isSelected"
                                  [class.bg-slate-100]="!isSelected"
                                  [class.text-slate-700]="!isSelected"
                                >
                                  <mat-icon>{{ v.icon }}</mat-icon>
                                </div>
                                <div>
                                  <div class="flex items-center gap-1.5 flex-wrap">
                                    <span class="px-2 py-0.5 rounded-md text-3xs font-mono font-black bg-slate-900 text-white">
                                      #{{ v.number }}
                                    </span>
                                    <h4 class="text-xs sm:text-sm font-black text-slate-900">{{ v.shortName }}</h4>
                                  </div>
                                  <p class="text-2xs text-slate-600 mt-1 leading-relaxed">
                                    {{ v.description }}
                                  </p>
                                </div>
                              </div>

                              @if (isSelected) {
                                <span class="px-2.5 py-1 rounded-full bg-emerald-600 text-white text-3xs font-bold flex items-center gap-1 shrink-0">
                                  <mat-icon class="text-xs leading-none">check_circle</mat-icon>
                                  <span>Обрано</span>
                                </span>
                              } @else {
                                <span class="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-3xs font-semibold shrink-0">
                                  Обрати
                                </span>
                              }
                            </div>

                            <!-- Mini visual schematic preview bar -->
                            <div class="pt-2 border-t border-slate-200/70 flex items-center justify-between text-3xs text-slate-500">
                              <span class="font-medium">{{ v.name }}</span>
                              <div class="flex items-center gap-0.5">
                                <span class="w-3 h-2 rounded-xs bg-emerald-500"></span>
                                <span class="w-3 h-2 rounded-xs bg-emerald-500"></span>
                                <span class="w-3 h-2 rounded-xs bg-rose-500"></span>
                                <span class="w-3 h-2 rounded-xs bg-amber-500"></span>
                                <span class="w-3 h-2 rounded-xs bg-emerald-500"></span>
                              </div>
                            </div>
                          </button>
                        }
                      </div>
                    </div>
                  }

                  <!-- 2. TELEGRAM BOT -->
                  @case ('telegram') {
                    <div class="space-y-4">
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
                            Юзернейм бота (&#64;)
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
                  }

                  <!-- 3. VIBER TEMPLATES -->
                  @case ('viber') {
                    <div class="space-y-5">
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
                          >
                            + &#123;name&#125; <span class="text-slate-400 font-sans font-normal">(Ім'я)</span>
                          </button>
                          <button
                            type="button"
                            (click)="insertTag('{login}')"
                            class="px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:border-purple-500 hover:text-purple-700 text-slate-700 font-mono font-semibold transition-all cursor-pointer text-2xs"
                          >
                            + &#123;login&#125; <span class="text-slate-400 font-sans font-normal">(Логін)</span>
                          </button>
                          <button
                            type="button"
                            (click)="insertTag('{active_until}')"
                            class="px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:border-purple-500 hover:text-purple-700 text-slate-700 font-mono font-semibold transition-all cursor-pointer text-2xs"
                          >
                            + &#123;active_until&#125; <span class="text-slate-400 font-sans font-normal">(Дата дії)</span>
                          </button>
                          <button
                            type="button"
                            (click)="insertTag('{amount}')"
                            class="px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:border-purple-500 hover:text-purple-700 text-slate-700 font-mono font-semibold transition-all cursor-pointer text-2xs"
                          >
                            + &#123;amount&#125; <span class="text-slate-400 font-sans font-normal">(Сума ₴)</span>
                          </button>
                          <button
                            type="button"
                            (click)="insertTag('{current_date}')"
                            class="px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:border-purple-500 hover:text-purple-700 text-slate-700 font-mono font-semibold transition-all cursor-pointer text-2xs"
                          >
                            + &#123;current_date&#125; <span class="text-slate-400 font-sans font-normal">(Поточна дата)</span>
                          </button>
                          <button
                            type="button"
                            (click)="insertTag('{card}')"
                            class="px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:border-purple-500 hover:text-purple-700 text-slate-700 font-mono font-semibold transition-all cursor-pointer text-2xs"
                          >
                            + &#123;card&#125; <span class="text-slate-400 font-sans font-normal">(Номер карти)</span>
                          </button>
                          <button
                            type="button"
                            (click)="insertTag('{price}')"
                            class="px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:border-purple-500 hover:text-purple-700 text-slate-700 font-mono font-semibold transition-all cursor-pointer text-2xs"
                          >
                            + &#123;price&#125; <span class="text-slate-400 font-sans font-normal">(Тариф)</span>
                          </button>
                          <button
                            type="button"
                            (click)="insertTag('{device}')"
                            class="px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:border-purple-500 hover:text-purple-700 text-slate-700 font-mono font-semibold transition-all cursor-pointer text-2xs"
                          >
                            + &#123;device&#125; <span class="text-slate-400 font-sans font-normal">(Пристрій)</span>
                          </button>
                          <button
                            type="button"
                            (click)="insertTag('{notes}')"
                            class="px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:border-purple-500 hover:text-purple-700 text-slate-700 font-mono font-semibold transition-all cursor-pointer text-2xs"
                          >
                            + &#123;notes&#125; <span class="text-slate-400 font-sans font-normal">(Нотатки)</span>
                          </button>
                        </div>
                      </div>

                      <!-- TYPE 1: Viber Reminder Template -->
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

                      <!-- TYPE 2: Viber Renewal Template -->
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
                  }

                  <!-- 4. ELECTRICITY TARIFFS -->
                  @case ('electricity_tariffs') {
                    <div class="space-y-5">
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
                            Ще немає доданих акаунтів електроенергії.
                          </div>
                        }
                      </div>

                      <!-- Single-Rate Tariff Configuration -->
                      <div class="p-4 sm:p-5 rounded-xl border border-slate-200 bg-white space-y-3">
                        <div class="flex items-center gap-2">
                          <span class="w-6 h-6 rounded-md bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-xs">1</span>
                          <div>
                            <h4 class="text-xs sm:text-sm font-bold text-slate-900">Однотарифний план (єдиний на весь рік)</h4>
                            <p class="text-2xs text-slate-500">Фіксована ціна за 1 кВт·год протягом доби</p>
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
                            <label for="set-elec-single-date-to" class="block text-2xs font-semibold text-slate-700 mb-1">
                              Дата закінчення дії тарифу
                            </label>
                            <input
                              id="set-elec-single-date-to"
                              type="date"
                              formControlName="elecSingleValidTo"
                              class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-amber-500"
                            />
                          </div>
                        </div>
                      </div>

                      <!-- Dual-Rate Tariff Configuration -->
                      <div class="p-4 sm:p-5 rounded-xl border border-slate-200 bg-white space-y-4">
                        <div class="flex items-center gap-2">
                          <span class="w-6 h-6 rounded-md bg-purple-100 text-purple-800 flex items-center justify-center font-bold text-xs">2</span>
                          <div>
                            <h4 class="text-xs sm:text-sm font-bold text-slate-900">Двотарифний план (по періоду доби та по сезону)</h4>
                            <p class="text-2xs text-slate-500">Ділиться окремо на денний/нічний час та на літній/зимовий період</p>
                          </div>
                        </div>

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
                            <label for="set-elec-dual-date-to" class="block text-2xs font-semibold text-slate-700 mb-1">
                              Дата закінчення дії двотарифного плану
                            </label>
                            <input
                              id="set-elec-dual-date-to"
                              type="date"
                              formControlName="elecDualValidTo"
                              class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-amber-500"
                            />
                          </div>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <!-- Summer Season -->
                          <div class="p-3.5 rounded-xl bg-amber-50/60 border border-amber-200/80 space-y-3">
                            <div class="flex items-center justify-between">
                              <div class="flex items-center gap-1.5 font-bold text-xs text-amber-900">
                                <mat-icon class="text-base text-amber-600 leading-none">wb_sunny</mat-icon>
                                Літній період
                              </div>
                              <span class="text-3xs text-amber-700 font-medium">01.05 – 30.09</span>
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
                              <span class="text-3xs text-indigo-700 font-medium">01.10 – 30.04</span>
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
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  }

                  <!-- 5. WATER & WASTE TARIFFS -->
                  @case ('water_waste_tariffs') {
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <!-- Water Supply Tariff Card -->
                      <div class="p-4 sm:p-5 rounded-xl border border-slate-200 bg-white space-y-3">
                        <div class="flex items-center gap-2 pb-2 border-b border-slate-100">
                          <mat-icon class="text-cyan-600">water_drop</mat-icon>
                          <h4 class="text-xs sm:text-sm font-bold text-slate-900">Водопостачання (холодна вода)</h4>
                        </div>

                        <div class="space-y-3">
                          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                                placeholder="32.00"
                                class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-cyan-600"
                              />
                            </div>

                            <div>
                              <label for="set-water-fee" class="block text-2xs font-semibold text-slate-700 mb-1">
                                Місячна абоноплата (грн/міс)
                              </label>
                              <input
                                id="set-water-fee"
                                type="number"
                                step="0.01"
                                min="0"
                                formControlName="waterMonthlyFee"
                                placeholder="0.00"
                                class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-cyan-600"
                              />
                            </div>
                          </div>

                          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label for="set-water-date" class="block text-2xs font-semibold text-slate-700 mb-1">
                                Дата початку дії *
                              </label>
                              <input
                                id="set-water-date"
                                type="date"
                                formControlName="waterValidFrom"
                                class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-cyan-600"
                              />
                            </div>

                            <div>
                              <label for="set-water-date-to" class="block text-2xs font-semibold text-slate-700 mb-1">
                                Дата закінчення дії
                              </label>
                              <input
                                id="set-water-date-to"
                                type="date"
                                formControlName="waterValidTo"
                                class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-cyan-600"
                              />
                            </div>
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

                          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label for="set-waste-date" class="block text-2xs font-semibold text-slate-700 mb-1">
                                Дата початку дії *
                              </label>
                              <input
                                id="set-waste-date"
                                type="date"
                                formControlName="wasteValidFrom"
                                class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-emerald-600"
                              />
                            </div>

                            <div>
                              <label for="set-waste-date-to" class="block text-2xs font-semibold text-slate-700 mb-1">
                                Дата закінчення дії
                              </label>
                              <input
                                id="set-waste-date-to"
                                type="date"
                                formControlName="wasteValidTo"
                                class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-emerald-600"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  }
                }
              </form>

              <!-- 6. DATABASE MANAGEMENT MODAL CONTENT -->
              @if (modalId === 'database') {
                <div class="space-y-5">
                  <!-- Header status bar & versioning -->
                  <div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-900 text-white shadow-2xs">
                        <mat-icon class="text-xs text-amber-400">speed</mat-icon>
                        <span>Схема: {{ getDbVersion(activeDbMode()) }}</span>
                      </span>

                      @if (dbStatus()?.connected !== false) {
                        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          <span class="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
                          Активна БД: {{ dbStatus()?.provider || 'PostgreSQL' }}
                        </span>
                      } @else {
                        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-300">
                          <span class="w-2 h-2 rounded-full bg-red-600"></span>
                          Помилка підключення
                        </span>
                      }

                      @if (dbStatus()?.lastSync) {
                        <span class="text-2xs text-slate-500 font-mono">
                          Оновлено: {{ dbStatus()?.lastSync }}
                        </span>
                      }
                    </div>

                    <div class="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                      <button
                        type="button"
                        (click)="runBenchmark()"
                        [disabled]="isBenchmarking()"
                        class="px-2.5 py-1.5 sm:px-3 sm:py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 rounded-xl text-2xs sm:text-xs font-bold flex items-center gap-1 sm:gap-1.5 transition-colors cursor-pointer shadow-2xs"
                        title="Виміряти час затримки та швидкодію виконання запитів для кожної підключеної бази даних"
                      >
                        <mat-icon [class.animate-spin]="isBenchmarking()" class="text-sm sm:text-base text-indigo-600">bolt</mat-icon>
                        <span>{{ isBenchmarking() ? 'Тестування...' : 'Тест швидкодії' }}</span>
                      </button>

                      <button
                        type="button"
                        (click)="isAddDbModalOpen.set(!isAddDbModalOpen())"
                        class="px-2.5 py-1.5 sm:px-3 sm:py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-2xs sm:text-xs font-bold flex items-center gap-1 sm:gap-1.5 transition-colors cursor-pointer shadow-2xs"
                      >
                        <mat-icon class="text-sm sm:text-base leading-none">add</mat-icon>
                        <span>+ Додати БД</span>
                      </button>

                      <button
                        type="button"
                        (click)="refreshDbStatus()"
                        [disabled]="isRefreshingDb() || isSyncingCloud() || isSwitchingDb() || isCopyingDb()"
                        class="px-2.5 py-1.5 sm:px-3 sm:py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 rounded-xl text-2xs sm:text-xs font-semibold flex items-center gap-1 sm:gap-1.5 transition-colors cursor-pointer border border-slate-200"
                      >
                        <mat-icon [class.animate-spin]="isRefreshingDb()" class="text-sm sm:text-base leading-none">refresh</mat-icon>
                        <span>{{ isRefreshingDb() ? 'Оновлення...' : 'Оновити' }}</span>
                      </button>
                    </div>
                  </div>

                  <!-- Form to Add Custom Database -->
                  @if (isAddDbModalOpen()) {
                    <div class="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200 space-y-3 animate-fadeIn">
                      <div class="flex items-center justify-between">
                        <div class="text-xs font-bold text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                          <mat-icon class="text-base text-indigo-600">storage</mat-icon>
                          <span>Додавання нової бази даних для порівняння швидкодії</span>
                        </div>
                        <button
                          type="button"
                          (click)="isAddDbModalOpen.set(false)"
                          class="text-indigo-600 hover:text-indigo-900 cursor-pointer"
                        >
                          <mat-icon class="text-base">close</mat-icon>
                        </button>
                      </div>

                      <form [formGroup]="addDbForm" (ngSubmit)="submitNewCustomDb()" class="space-y-3">
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <div>
                            <label class="block text-2xs font-bold text-indigo-900 mb-1">Назва бази даних *</label>
                            <input
                              type="text"
                              formControlName="name"
                              placeholder="Наприклад: Neon Postgres Read-Replica"
                              class="w-full px-3 py-1.5 bg-white border border-indigo-200 rounded-xl text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            />
                          </div>
                          <div>
                            <label class="block text-2xs font-bold text-indigo-900 mb-1">Тип СУБД *</label>
                            <select
                              formControlName="type"
                              class="w-full px-3 py-1.5 bg-white border border-indigo-200 rounded-xl text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            >
                              <option value="postgresql">PostgreSQL (Cloud SQL / Aiven / Neon)</option>
                              <option value="sqlite">SQLite (Local In-Memory Cache)</option>
                              <option value="firestore">Google Firestore DB</option>
                              <option value="mysql">MySQL / MariaDB Cluster</option>
                            </select>
                          </div>
                          <div>
                            <label class="block text-2xs font-bold text-indigo-900 mb-1">Ім'я бази / Database ID *</label>
                            <input
                              type="text"
                              formControlName="database"
                              placeholder="iptv_production_db"
                              class="w-full px-3 py-1.5 bg-white border border-indigo-200 rounded-xl text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            />
                          </div>
                        </div>

                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label class="block text-2xs font-bold text-indigo-900 mb-1">Хост / Хостинг сервера</label>
                            <input
                              type="text"
                              formControlName="host"
                              placeholder="db-cluster.us-east-2.cloud.net:5432"
                              class="w-full px-3 py-1.5 bg-white border border-indigo-200 rounded-xl text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono"
                            />
                          </div>
                          <div>
                            <label class="block text-2xs font-bold text-indigo-900 mb-1">Короткий опис або примітка</label>
                            <input
                              type="text"
                              formControlName="description"
                              placeholder="Для тестування локальної швидкодії"
                              class="w-full px-3 py-1.5 bg-white border border-indigo-200 rounded-xl text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            />
                          </div>
                        </div>

                        <div class="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            (click)="isAddDbModalOpen.set(false)"
                            class="px-3 py-1.5 bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-xl text-2xs sm:text-xs font-semibold cursor-pointer"
                          >
                            Скасувати
                          </button>
                          <button
                            type="submit"
                            class="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-2xs sm:text-xs font-bold cursor-pointer shadow-xs"
                          >
                            Зберегти конфігурацію БД
                          </button>
                        </div>
                      </form>
                    </div>
                  }

                  <!-- Database Selector & Performance Comparison Cards -->
                  <div class="space-y-3">
                    <div class="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                      <span>Список підключених баз даних та показники затримки (Latency)</span>
                      <span class="text-2xs text-slate-400 font-normal normal-case">
                        Для звичайних користувачів використовується тільки <strong>Активна БД</strong>
                      </span>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">

                      <!-- Option 2: External PostgreSQL -->
                      <div
                        class="p-4 rounded-2xl border-2 transition-all space-y-3 flex flex-col justify-between"
                        [class.border-emerald-600]="activeDbMode() === 'external'"
                        [class.bg-emerald-50/40]="activeDbMode() === 'external'"
                        [class.border-slate-200]="activeDbMode() !== 'external'"
                        [class.bg-white]="activeDbMode() !== 'external'"
                      >
                        <div class="space-y-2">
                          <div class="flex items-start justify-between gap-2">
                            <div class="flex items-center gap-2">
                              <div class="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                                <mat-icon class="text-lg">public</mat-icon>
                              </div>
                              <div>
                                <div class="text-xs sm:text-sm font-bold text-slate-900">Зовнішня PostgreSQL (Aiven Cloud)</div>
                                <div class="text-3xs text-slate-500 font-mono break-all">
                                  {{ dbStatus()?.instances?.['external']?.host || 'aivencloud.com:13316' }}
                                </div>
                              </div>
                            </div>
                            @if (activeDbMode() === 'external') {
                              <span class="px-2.5 py-0.5 rounded-md text-2xs font-bold uppercase bg-emerald-600 text-white shrink-0 shadow-2xs">
                                Активна БД
                              </span>
                            } @else {
                              <span class="px-2 py-0.5 rounded-md text-2xs font-semibold bg-slate-100 text-slate-600 shrink-0 border border-slate-200">
                                Фонова
                              </span>
                            }
                          </div>

                          <div class="grid grid-cols-2 gap-2 pt-1">
                            <div class="p-2 rounded-xl bg-slate-50 border border-slate-200/80">
                              <span class="text-3xs font-bold uppercase text-slate-400 block">Швидкодія / Затримка</span>
                              <span class="text-xs font-mono font-bold text-emerald-700 flex items-center gap-1">
                                <mat-icon class="text-xs">bolt</mat-icon>
                                <span>{{ dbStatus()?.benchmarks?.['external']?.latencyMs ?? 38 }} ms</span>
                                <span class="text-3xs font-sans text-slate-500 font-normal">(Швидка)</span>
                              </span>
                            </div>
                            <div class="p-2 rounded-xl bg-slate-50 border border-slate-200/80">
                              <span class="text-3xs font-bold uppercase text-slate-400 block">Записів у БД (всі сутності)</span>
                              <span class="text-3xs font-bold text-slate-800 font-mono leading-relaxed block mt-0.5">
                                {{ getDbCountsFormatted('external') }}
                              </span>
                            </div>
                          </div>

                          <div class="text-3xs text-slate-500 font-mono pt-0.5 flex flex-wrap items-center justify-between gap-1">
                            <div class="flex items-center gap-1">
                              <mat-icon class="text-xs text-emerald-600">access_time</mat-icon>
                              <span>Останнє оновлення: {{ getDbLastUpdateTime('external') }}</span>
                            </div>
                            <span class="px-2 py-0.5 rounded-md bg-emerald-900 text-emerald-200 font-bold font-mono text-3xs shadow-2xs">
                              Версія: {{ getDbVersion('external') }}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          (click)="selectDatabaseMode('external')"
                          [disabled]="activeDbMode() === 'external' || isSwitchingDb() || isCopyingDb() || !canEdit()"
                          class="w-full px-3.5 py-2 rounded-xl text-2xs sm:text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
                          [class.bg-emerald-600]="activeDbMode() === 'external'"
                          [class.text-white]="true"
                          [class.bg-slate-900]="activeDbMode() !== 'external'"
                        >
                          <mat-icon class="text-base leading-none">
                            {{ activeDbMode() === 'external' ? 'check_circle' : 'swap_horiz' }}
                          </mat-icon>
                          <span>
                            {{
                              activeDbMode() === 'external'
                                ? 'Використовується для всіх користувачів'
                                : 'Обрати як Активну БД'
                            }}
                          </span>
                        </button>
                      </div>

                      <!-- Option 3: Google Cloud SQL -->
                      <div
                        class="p-4 rounded-2xl border-2 transition-all space-y-3 flex flex-col justify-between"
                        [class.border-emerald-600]="activeDbMode() === 'cloudsql'"
                        [class.bg-emerald-50/40]="activeDbMode() === 'cloudsql'"
                        [class.border-slate-200]="activeDbMode() !== 'cloudsql'"
                        [class.bg-white]="activeDbMode() !== 'cloudsql'"
                      >
                        <div class="space-y-2">
                          <div class="flex items-start justify-between gap-2">
                            <div class="flex items-center gap-2">
                              <div class="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                                <mat-icon class="text-lg">cloud_queue</mat-icon>
                              </div>
                              <div>
                                <div class="text-xs sm:text-sm font-bold text-slate-900">Google Cloud SQL (PostgreSQL)</div>
                                <div class="text-3xs text-slate-500 font-mono break-all">
                                  {{ dbStatus()?.instances?.['cloudsql']?.host || 'cloud_sql_development_database' }}
                                </div>
                              </div>
                            </div>
                            @if (activeDbMode() === 'cloudsql') {
                              <span class="px-2.5 py-0.5 rounded-md text-2xs font-bold uppercase bg-emerald-600 text-white shrink-0 shadow-2xs">
                                Активна БД
                              </span>
                            } @else {
                              <span class="px-2 py-0.5 rounded-md text-2xs font-semibold bg-slate-100 text-slate-600 shrink-0 border border-slate-200">
                                Фонова
                              </span>
                            }
                          </div>

                          <div class="grid grid-cols-2 gap-2 pt-1">
                            <div class="p-2 rounded-xl bg-slate-50 border border-slate-200/80">
                              <span class="text-3xs font-bold uppercase text-slate-400 block">Швидкодія / Затримка</span>
                              <span class="text-xs font-mono font-bold text-indigo-700 flex items-center gap-1">
                                <mat-icon class="text-xs">bolt</mat-icon>
                                <span>{{ dbStatus()?.benchmarks?.['cloudsql']?.latencyMs ?? 14 }} ms</span>
                                <span class="text-3xs font-sans text-indigo-600 font-bold">(Ультра-швидка)</span>
                              </span>
                            </div>
                            <div class="p-2 rounded-xl bg-slate-50 border border-slate-200/80">
                              <span class="text-3xs font-bold uppercase text-slate-400 block">Записів у БД (всі сутності)</span>
                              <span class="text-3xs font-bold text-slate-800 font-mono leading-relaxed block mt-0.5">
                                {{ getDbCountsFormatted('cloudsql') }}
                              </span>
                            </div>
                          </div>

                          <div class="text-3xs text-slate-500 font-mono pt-0.5 flex flex-wrap items-center justify-between gap-1">
                            <div class="flex items-center gap-1">
                              <mat-icon class="text-xs text-blue-600">access_time</mat-icon>
                              <span>Останнє оновлення: {{ getDbLastUpdateTime('cloudsql') }}</span>
                            </div>
                            <span class="px-2 py-0.5 rounded-md bg-blue-900 text-blue-200 font-bold font-mono text-3xs shadow-2xs">
                              Версія: {{ getDbVersion('cloudsql') }}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          (click)="selectDatabaseMode('cloudsql')"
                          [disabled]="activeDbMode() === 'cloudsql' || isSwitchingDb() || isCopyingDb() || !canEdit()"
                          class="w-full px-3.5 py-2 rounded-xl text-2xs sm:text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
                          [class.bg-emerald-600]="activeDbMode() === 'cloudsql'"
                          [class.text-white]="true"
                          [class.bg-slate-900]="activeDbMode() !== 'cloudsql'"
                        >
                          <mat-icon class="text-base leading-none">
                            {{ activeDbMode() === 'cloudsql' ? 'check_circle' : 'swap_horiz' }}
                          </mat-icon>
                          <span>
                            {{
                              activeDbMode() === 'cloudsql'
                                ? 'Використовується для всіх користувачів'
                                : 'Обрати як Активну БД'
                            }}
                          </span>
                        </button>
                      </div>

                      <!-- Option 4: Google Firebase Firestore DB -->
                      <div class="p-4 rounded-2xl border border-slate-200 bg-white space-y-3 flex flex-col justify-between">
                        <div class="space-y-2">
                          <div class="flex items-start justify-between gap-2">
                            <div class="flex items-center gap-2">
                              <div class="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                                <mat-icon class="text-lg">local_fire_department</mat-icon>
                              </div>
                              <div>
                                <div class="text-xs sm:text-sm font-bold text-slate-900">Google Firebase Firestore DB</div>
                                <div class="text-3xs text-slate-500 font-mono">firestore.googleapis.com</div>
                              </div>
                            </div>
                            <span class="px-2 py-0.5 rounded-md text-2xs font-semibold bg-amber-100 text-amber-800 shrink-0 border border-amber-200">
                              Фонова NoSQL
                            </span>
                          </div>

                          <div class="grid grid-cols-2 gap-2 pt-1">
                            <div class="p-2 rounded-xl bg-slate-50 border border-slate-200/80">
                              <span class="text-3xs font-bold uppercase text-slate-400 block">Швидкодія / Затримка</span>
                              <span class="text-xs font-mono font-bold text-amber-700 flex items-center gap-1">
                                <mat-icon class="text-xs">bolt</mat-icon>
                                <span>{{ dbStatus()?.benchmarks?.['firestore']?.latencyMs ?? 45 }} ms</span>
                              </span>
                            </div>
                            <div class="p-2 rounded-xl bg-slate-50 border border-slate-200/80">
                              <span class="text-3xs font-bold uppercase text-slate-400 block">Записів у документі (всі сутності)</span>
                              <span class="text-3xs font-bold text-slate-800 font-mono leading-relaxed block mt-0.5">
                                {{ getDbCountsFormatted('firestore') }}
                              </span>
                            </div>
                          </div>

                          <div class="text-3xs text-slate-500 font-mono pt-0.5 flex flex-wrap items-center justify-between gap-1">
                            <div class="flex items-center gap-1">
                              <mat-icon class="text-xs text-amber-600">access_time</mat-icon>
                              <span>Останнє оновлення: {{ getDbLastUpdateTime('firestore') }}</span>
                            </div>
                            <span class="px-2 py-0.5 rounded-md bg-amber-900 text-amber-200 font-bold font-mono text-3xs shadow-2xs">
                              Версія: {{ getDbVersion('firestore') }}
                            </span>
                          </div>
                        </div>

                        <div class="text-3xs text-slate-400 italic text-center">Фонова синхронізація у режимі реального часу</div>
                      </div>

                      <!-- Option 5: Custom User Databases -->
                      @for (customDb of dbStatus()?.customDatabases || []; track customDb.id) {
                        <div class="p-4 rounded-2xl border border-slate-200 bg-white space-y-3 flex flex-col justify-between">
                          <div class="space-y-2">
                            <div class="flex items-start justify-between gap-2">
                              <div class="flex items-center gap-2">
                                <div class="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-800 flex items-center justify-center shrink-0">
                                  <mat-icon class="text-lg">database</mat-icon>
                                </div>
                                <div>
                                  <div class="text-xs font-bold text-slate-900 truncate max-w-[180px]">{{ customDb.name }}</div>
                                  <div class="text-3xs text-slate-500 font-mono truncate max-w-[180px]">{{ customDb.database }}</div>
                                </div>
                              </div>
                              <button
                                type="button"
                                (click)="deleteCustomDb(customDb.id)"
                                class="text-slate-400 hover:text-rose-600 cursor-pointer p-1"
                                title="Видалити"
                              >
                                <mat-icon class="text-base">delete</mat-icon>
                              </button>
                            </div>

                            <div class="p-2 rounded-xl bg-slate-50 border border-slate-200/80">
                              <span class="text-3xs font-bold uppercase text-slate-400 block">Затримка відгуку</span>
                              <span class="text-xs font-mono font-bold text-slate-800 flex items-center gap-1">
                                <mat-icon class="text-xs">bolt</mat-icon>
                                <span>{{ dbStatus()?.benchmarks?.[customDb.id]?.latencyMs ?? 22 }} ms</span>
                              </span>
                            </div>

                            <div class="text-3xs text-slate-500 font-mono pt-0.5 flex items-center gap-1">
                              <mat-icon class="text-xs text-slate-500">access_time</mat-icon>
                              <span>Останнє оновлення: {{ dbStatus()?.dbLastUpdateTimes?.[customDb.id] || dbStatus()?.globalLastUpdate || 'Підключено' }}</span>
                            </div>
                          </div>
                        </div>
                      }
                    </div>
                  </div>

                  <!-- Menu for Copying Data Between Databases (Left Source -> Right Destination) -->
                  <div class="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-300 space-y-3.5 shadow-2xs">
                    <div>
                      <h4 class="text-xs font-bold uppercase tracking-wider text-amber-950 flex items-center gap-2">
                        <mat-icon class="text-base text-amber-700">swap_horizontal_circle</mat-icon>
                        <span>Меню копіювання даних: Звідки скопіювати ➔ Куди перенести</span>
                      </h4>
                      <p class="text-2xs text-amber-800 mt-1">
                        Оберіть вихідну базу даних зліва та цільову базу справа для повного перенесення всіх таблиць, користувачів та показань.
                      </p>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      <!-- Left Dropdown: Source DB -->
                      <div>
                        <label class="block text-2xs font-bold text-amber-950 mb-1 flex items-center gap-1">
                          <mat-icon class="text-xs text-amber-700">input</mat-icon>
                          <span>1. З якої бази даних скопіювати (Source)</span>
                        </label>
                        <select
                          [value]="copySourceDb()"
                          (change)="copySourceDb.set($any($event.target).value)"
                          class="w-full px-3 py-2 sm:px-3.5 sm:py-2.5 bg-white border border-amber-300 rounded-xl text-xs font-bold text-slate-900 shadow-2xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                        >
                          <option value="external">Зовнішня PostgreSQL (Aiven Cloud)</option>
                          <option value="cloudsql">Google Cloud SQL (PostgreSQL)</option>
                          <option value="firestore">Google Firebase Firestore DB</option>
                          @for (cdb of dbStatus()?.customDatabases || []; track cdb.id) {
                            <option [value]="cdb.id">{{ cdb.name }} ({{ cdb.database }})</option>
                          }
                        </select>
                      </div>

                      <!-- Right Dropdown: Target DB -->
                      <div>
                        <label class="block text-2xs font-bold text-amber-950 mb-1 flex items-center gap-1">
                          <mat-icon class="text-xs text-amber-700">output</mat-icon>
                          <span>2. Куди скопіювати всі дані (Destination)</span>
                        </label>
                        <select
                          [value]="copyTargetDb()"
                          (change)="copyTargetDb.set($any($event.target).value)"
                          class="w-full px-3 py-2 sm:px-3.5 sm:py-2.5 bg-white border border-amber-300 rounded-xl text-xs font-bold text-slate-900 shadow-2xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                        >
                          <option value="cloudsql">Google Cloud SQL (PostgreSQL)</option>
                          <option value="external">Зовнішня PostgreSQL (Aiven Cloud)</option>
                          <option value="firestore">Google Firebase Firestore DB</option>
                          @for (cdb of dbStatus()?.customDatabases || []; track cdb.id) {
                            <option [value]="cdb.id">{{ cdb.name }} ({{ cdb.database }})</option>
                          }
                        </select>
                      </div>
                    </div>

                    <div class="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-amber-200">
                      <div class="flex items-center gap-2 text-2xs text-amber-900 font-medium">
                        <mat-icon class="text-sm text-amber-600">sync</mat-icon>
                        <span>Автоматичний фоновий перенос у всі бази даних активовано</span>
                      </div>

                      <button
                        type="button"
                        (click)="executeDualCopy()"
                        [disabled]="isCopyingDb() || isSwitchingDb() || !canEdit()"
                        class="w-full sm:w-auto px-4 py-2 sm:px-5 sm:py-2.5 bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white rounded-xl text-2xs sm:text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md active:scale-95"
                      >
                        <mat-icon [class.animate-spin]="isCopyingDb()" class="text-sm sm:text-base leading-none">content_copy</mat-icon>
                        <span>
                          {{ isCopyingDb() ? 'Копіювання таблиць...' : 'Скопіювати всі дані між базами' }}
                        </span>
                      </button>
                    </div>

                    @if (lastCopyResult(); as copyRes) {
                      <div class="p-3 rounded-xl bg-white border border-emerald-300 text-xs text-slate-800 space-y-1 animate-fadeIn">
                        <div class="font-bold text-emerald-800 flex items-center gap-1.5">
                          <mat-icon class="text-base text-emerald-600">check_circle</mat-icon>
                          <span>
                            Успішно переношено {{ copyRes.totalCopied }} записів з «{{ copyRes.sourceProvider }}» у «{{ copyRes.targetProvider }}»!
                          </span>
                        </div>
                        <div class="text-3xs text-slate-500 font-mono">
                          Версія схеми: {{ getDbVersion(activeDbMode()) }} | Дата синхронізації: {{ dbStatus()?.lastSync || getDbLastUpdateTime(activeDbMode()) }}
                        </div>
                      </div>
                    }
                  </div>

                  <div class="flex flex-wrap items-center gap-2 sm:gap-3 pt-1">
                    <button
                      type="button"
                      (click)="syncWithCloud()"
                      [disabled]="isSyncingCloud() || isSwitchingDb() || isCopyingDb()"
                      class="px-3 py-1.5 sm:px-4 sm:py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-2xs sm:text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                    >
                      <mat-icon [class.animate-spin]="isSyncingCloud()" class="text-sm sm:text-base leading-none">sync</mat-icon>
                      <span>{{ isSyncingCloud() ? 'Синхронізація...' : 'Перечитати дані з активної БД' }}</span>
                    </button>

                    <button
                      type="button"
                      (click)="pushAllToCloud()"
                      [disabled]="isSyncingCloud() || isSwitchingDb() || isCopyingDb()"
                      class="px-3 py-1.5 sm:px-4 sm:py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-xl text-2xs sm:text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                    >
                      <mat-icon class="text-sm sm:text-base leading-none">cloud_upload</mat-icon>
                      <span>Зберегти в активну БД</span>
                    </button>
                  </div>
                </div>
              }

              <!-- 7. BACKUP & RESTORE MODAL CONTENT -->
              @if (modalId === 'backup') {
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div class="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                    <div class="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                      <mat-icon class="text-lg sm:text-xl">file_download</mat-icon>
                    </div>
                    <h4 class="text-xs sm:text-sm font-bold text-slate-900">Експорт бази (JSON)</h4>
                    <p class="text-2xs sm:text-xs text-slate-500">
                      Завантажте повну резервну копію абонентів ({{ clients().length }}), платежів ({{ payments().length }}) та налаштувань на свій комп'ютер чи смартфон.
                    </p>
                    <button
                      id="btn-export-backup"
                      type="button"
                      (click)="exportData()"
                      class="mt-2 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-2xs sm:text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                    >
                      <mat-icon class="text-sm sm:text-base">file_download</mat-icon>
                      <span>Завантажити копію JSON</span>
                    </button>
                  </div>

                  <div class="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                    <div class="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                      <mat-icon class="text-lg sm:text-xl">upload_file</mat-icon>
                    </div>
                    <h4 class="text-xs sm:text-sm font-bold text-slate-900">Імпорт / Відновлення</h4>
                    <p class="text-2xs sm:text-xs text-slate-500">
                      Відновлення бази даних із раніше збереженого резервного JSON-файлу.
                    </p>
                    <label class="mt-2 inline-flex px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-2xs sm:text-xs font-bold items-center gap-1.5 transition-colors cursor-pointer shadow-2xs">
                      <mat-icon class="text-sm sm:text-base text-indigo-600">upload_file</mat-icon>
                      <span>Вибрати файл JSON</span>
                      <input type="file" accept=".json" (change)="importData($event)" class="hidden" />
                    </label>
                  </div>
                </div>
              }
            </div>

            <!-- Modal Footer -->
            <div class="px-4 sm:px-6 py-3 sm:py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2.5 shrink-0">
              <button
                type="button"
                (click)="closeSettingsModal()"
                class="px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-2xs sm:text-xs font-bold transition-colors cursor-pointer"
              >
                Закрити
              </button>

              @if (isFormModal(modalId)) {
                @if (canSaveActiveSection(modalId)) {
                  <button
                    id="btn-save-settings"
                    type="button"
                    (click)="saveAndCloseModal()"
                    [disabled]="isSaving()"
                    class="px-3.5 py-2 sm:px-5 sm:py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs sm:text-sm font-bold transition-colors flex items-center gap-1.5 sm:gap-2 cursor-pointer shadow-sm"
                  >
                    <mat-icon class="text-sm sm:text-base">save</mat-icon>
                    <span>{{ isSaving() ? 'Збереження...' : 'Зберегти налаштування' }}</span>
                  </button>
                } @else {
                  <div class="text-xs text-slate-500 italic flex items-center gap-1">
                    <mat-icon class="text-sm">lock</mat-icon>
                    <span>Немає прав на зміну цього розділу</span>
                  </div>
                }
              }
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class SettingsView implements OnInit {
  private readonly dataService = inject(IptvData);

  @ViewChild('reminderInput') reminderInputRef?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('renewalInput') renewalInputRef?: ElementRef<HTMLTextAreaElement>;

  readonly activeSettingsModal = signal<SettingsGroupModalId | null>(null);
  readonly isSaving = signal(false);
  readonly canEdit = this.dataService.canEdit;
  readonly allowedSettingsSections = this.dataService.allowedSettingsSections;
  readonly hasAnyAllowedSettings = computed<boolean>(
    () => this.dataService.isAdmin() || this.allowedSettingsSections().length > 0
  );
  readonly isSyncingCloud = this.dataService.isSyncingCloud;
  readonly isSwitchingDb = this.dataService.isSwitchingDb;
  readonly isCopyingDb = this.dataService.isCopyingDb;
  readonly lastCopyResult = this.dataService.lastCopyResult;
  readonly dbStatus = this.dataService.dbStatus;
  readonly activeDbMode = computed<string>(
    () => this.dbStatus()?.activeMode || 'external'
  );
  readonly clients = this.dataService.clients;
  readonly payments = this.dataService.payments;
  readonly electricityAccounts = this.dataService.electricityAccounts;

  activeTemplateField: 'reminder' | 'renewal' = 'reminder';

  readonly outageScheduleVariants = OUTAGE_SCHEDULE_VARIANTS;
  readonly selectedOutageVariant = computed<OutageScheduleViewVariant>(() => {
    return this.dataService.outageScheduleViewVariant();
  });
  readonly activeOutageVariantMeta = computed<OutageScheduleVariantMeta>(() => {
    const cur = this.selectedOutageVariant();
    return (
      this.outageScheduleVariants.find((v) => v.id === cur) ||
      this.outageScheduleVariants[0]
    );
  });

  isSectionAllowed(sectionId: SettingsSectionId): boolean {
    return this.dataService.isSettingsSectionAllowed(sectionId);
  }

  canSaveActiveSection(modalId: SettingsGroupModalId): boolean {
    return this.dataService.isAdmin() || this.isSectionAllowed(modalId as SettingsSectionId);
  }

  openSettingsModal(modalId: SettingsGroupModalId): void {
    if (!this.isSectionAllowed(modalId as SettingsSectionId)) return;
    this.activeSettingsModal.set(modalId);
  }

  closeSettingsModal(): void {
    this.activeSettingsModal.set(null);
  }

  goToOutageSchedule(): void {
    this.closeSettingsModal();
    this.dataService.openOutageScheduleTab();
  }

  async selectOutageVariantCard(variant: OutageScheduleViewVariant): Promise<void> {
    this.form.controls.outageScheduleViewVariant.setValue(variant);
    this.form.controls.outageScheduleViewVariant.markAsDirty();
    await this.dataService.setOutageScheduleViewVariant(variant, true);
  }

  async onOutageVariantSelectChange(val: string): Promise<void> {
    const variant = val as OutageScheduleViewVariant;
    await this.dataService.setOutageScheduleViewVariant(variant, false);
  }

  isFormModal(modalId: SettingsGroupModalId): boolean {
    return (
      modalId === 'billing' ||
      modalId === 'outage_display' ||
      modalId === 'telegram' ||
      modalId === 'viber' ||
      modalId === 'electricity_tariffs' ||
      modalId === 'water_waste_tariffs'
    );
  }

  getModalMeta(modalId: SettingsGroupModalId): { title: string; subtitle: string; icon: string } {
    switch (modalId) {
      case 'billing':
        return {
          title: 'Загальні налаштування, графік та реквізити',
          subtitle: 'Стандартний тариф IPTV, картка / IBAN, нагадування та стиль графіку відключень',
          icon: 'payments',
        };
      case 'outage_display':
        return {
          title: 'Варіанти відображення графіку відключень (10 стилів)',
          subtitle: 'Оберіть зручний візуальний формат погодинного графіку світла ДТЕК',
          icon: 'view_timeline',
        };
      case 'telegram':
        return {
          title: 'Налаштування Telegram Bot',
          subtitle: 'Параметри підключення бота для автоматичних сповіщень',
          icon: 'send',
        };
      case 'viber':
        return {
          title: 'Шаблони повідомлень Viber',
          subtitle: 'Тексти для нагадування про оплату та підтвердження продовження підписки',
          icon: 'chat',
        };
      case 'electricity_tariffs':
        return {
          title: 'Тарифи на електроенергію',
          subtitle: 'Однотарифний та двотарифний (День / Ніч) плани, сезонність і ліміти',
          icon: 'bolt',
        };
      case 'water_waste_tariffs':
        return {
          title: 'Тарифи на водопостачання та вивіз сміття',
          subtitle: 'Вартість 1 м³ холодної води, абонплата та тариф на ТПВ',
          icon: 'water_drop',
        };
      case 'database':
        return {
          title: 'Керування базами даних: Зовнішня PostgreSQL та Cloud SQL',
          subtitle: 'Вибір активної бази даних, синхронізація та повне копіювання таблиць',
          icon: 'storage',
        };
      case 'backup':
        return {
          title: 'Резервне копіювання та відновлення даних (JSON)',
          subtitle: 'Експорт та імпорт повної резервної копії бази даних',
          icon: 'cloud_download',
        };
    }
  }

  async saveAndCloseModal(): Promise<void> {
    await this.onSubmit();
    if (!this.form.invalid) {
      this.closeSettingsModal();
    }
  }

  readonly form = new FormGroup({
    defaultMonthlyPrice: new FormControl(100, [Validators.required, Validators.min(0)]),
    cardRequisites: new FormControl(''),
    reminderDaysBefore: new FormControl(7, [Validators.required, Validators.min(1)]),
    outageScheduleViewVariant: new FormControl<OutageScheduleViewVariant>('v10_minimal_pills'),
    viberReminderMessageTemplate: new FormControl(''),
    viberRenewalMessageTemplate: new FormControl(''),
    telegramBotToken: new FormControl(''),
    telegramBotUsername: new FormControl('iptv_billing_bot'),
    telegramSenderName: new FormControl('IPTV Підтримка'),
    // Utility Tariffs Controls
    waterPrice: new FormControl<number>(32, [Validators.required, Validators.min(0)]),
    waterMonthlyFee: new FormControl<number>(0, [Validators.min(0)]),
    waterValidFrom: new FormControl<string>('2026-01-01', [Validators.required]),
    waterValidTo: new FormControl<string>(''),
    waterValidPeriod: new FormControl<string>('Безстроково'),
    wastePrice: new FormControl<number>(45.0, [Validators.required, Validators.min(0)]),
    wasteValidFrom: new FormControl<string>('2026-01-01', [Validators.required]),
    wasteValidTo: new FormControl<string>(''),
    wasteValidPeriod: new FormControl<string>('Безстроково'),
    elecSingleRate: new FormControl<number>(4.32, [Validators.required, Validators.min(0)]),
    elecSingleValidFrom: new FormControl<string>('2026-06-01', [Validators.required]),
    elecSingleValidTo: new FormControl<string>(''),
    elecSingleValidPeriod: new FormControl<string>('1 рік (на весь рік)'),
    elecDualValidFrom: new FormControl<string>('2026-06-01', [Validators.required]),
    elecDualValidTo: new FormControl<string>(''),
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
      const reqModal = this.dataService.requestedSettingsModal();
      if (reqModal) {
        if (this.isSectionAllowed(reqModal as SettingsSectionId)) {
          this.activeSettingsModal.set(reqModal as SettingsGroupModalId);
        }
        this.dataService.requestedSettingsModal.set(null);
      }
    });

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
    const outageVariant: OutageScheduleViewVariant =
      tariffs.outageScheduleViewVariant ||
      (s.outageScheduleViewVariant as OutageScheduleViewVariant) ||
      'v10_minimal_pills';

    this.form.patchValue(
      {
        defaultMonthlyPrice: s.defaultMonthlyPrice ?? 100,
        cardRequisites: s.cardRequisites || '',
        reminderDaysBefore: s.reminderDaysBefore ?? 7,
        outageScheduleViewVariant: outageVariant,
        viberReminderMessageTemplate: reminderTmpl,
        viberRenewalMessageTemplate: renewalTmpl,
        telegramBotToken: s.telegramBotToken || '',
        telegramBotUsername: s.telegramBotUsername || 'iptv_billing_bot',
        telegramSenderName: s.telegramSenderName || 'IPTV Підтримка',
        waterPrice: tariffs.water?.price ?? 32,
        waterMonthlyFee: tariffs.water?.monthlyFee ?? 0,
        waterValidFrom: tariffs.water?.validFrom ?? '2026-01-01',
        waterValidTo: tariffs.water?.validTo ?? '',
        waterValidPeriod: 'Безстроково',
        wastePrice: tariffs.waste?.price ?? 45.0,
        wasteValidFrom: tariffs.waste?.validFrom ?? '2026-01-01',
        wasteValidTo: tariffs.waste?.validTo ?? '',
        wasteValidPeriod: 'Безстроково',
        elecSingleRate: tariffs.electricitySingle?.rate ?? 4.32,
        elecSingleValidFrom: tariffs.electricitySingle?.validFrom ?? '2026-06-01',
        elecSingleValidTo: tariffs.electricitySingle?.validTo ?? '',
        elecSingleValidPeriod: '1 рік (на весь рік)',
        elecDualValidFrom: tariffs.electricityDual?.validFrom ?? '2026-06-01',
        elecDualValidTo: tariffs.electricityDual?.validTo ?? '',
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
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.isSaving.set(true);
    try {
      const val = this.form.getRawValue();
      const current = this.dataService.settings();

      const currentTariffs = current.utilityTariffsSettings;
      const waterPrice =
        Number(val.waterPrice) > 0 ? Number(val.waterPrice) : (currentTariffs?.water?.price ?? 32);
      const waterMonthlyFee = Number(val.waterMonthlyFee) >= 0 ? Number(val.waterMonthlyFee) : 0;
      const waterValidFrom = val.waterValidFrom || currentTariffs?.water?.validFrom || '2026-01-01';
      const waterValidTo = val.waterValidTo || '';

      let waterHist = [...(currentTariffs?.water?.history || [])];
      if (waterHist.length === 0 || (waterHist.length === 1 && waterHist[0].id === 'wh_1')) {
        waterHist = [
          {
            id: 'wh_1',
            price: waterPrice,
            monthlyFee: waterMonthlyFee,
            validFrom: waterValidFrom,
            validTo: waterValidTo,
            note: 'Тариф на воду',
          },
        ];
      } else {
        const matchWater = waterHist.find((h) => h.validFrom === waterValidFrom);
        if (matchWater) {
          matchWater.price = waterPrice;
          matchWater.monthlyFee = waterMonthlyFee;
          matchWater.validTo = waterValidTo;
        } else {
          waterHist.push({
            id: `wh_${Date.now()}`,
            price: waterPrice,
            monthlyFee: waterMonthlyFee,
            validFrom: waterValidFrom,
            validTo: waterValidTo,
            note: 'Тариф на воду',
          });
        }
      }
      waterHist.sort((a, b) => b.validFrom.localeCompare(a.validFrom));

      const wastePrice = Number(val.wastePrice) > 0 ? Number(val.wastePrice) : 45.0;
      const wasteValidFrom = val.wasteValidFrom || '2026-01-01';
      const wasteValidTo = val.wasteValidTo || '';
      let wasteHist = [...(current.utilityTariffsSettings?.waste?.history || [])];
      if (wasteHist.length === 0 || (wasteHist.length === 1 && wasteHist[0].id === 'wsh_1')) {
        wasteHist = [
          {
            id: 'wsh_1',
            price: wastePrice,
            validFrom: wasteValidFrom,
            validTo: wasteValidTo,
            note: 'Тариф на вивіз сміття',
          },
        ];
      } else {
        const match = wasteHist.find((h) => h.validFrom === wasteValidFrom);
        if (match) {
          match.price = wastePrice;
          match.validTo = wasteValidTo;
        } else {
          wasteHist.push({
            id: `wsh_${Date.now()}`,
            price: wastePrice,
            validFrom: wasteValidFrom,
            validTo: wasteValidTo,
            note: 'Тариф на вивіз сміття',
          });
        }
      }

      const elecSingleRate = Number(val.elecSingleRate) > 0 ? Number(val.elecSingleRate) : 4.32;
      const elecSingleValidFrom = val.elecSingleValidFrom || '2026-06-01';
      const elecSingleValidTo = val.elecSingleValidTo || '';
      let elecSingleHist = [...(current.utilityTariffsSettings?.electricitySingle?.history || [])];
      if (elecSingleHist.length === 0 || (elecSingleHist.length === 1 && elecSingleHist[0].id === 'esh_1')) {
        elecSingleHist = [
          {
            id: 'esh_1',
            rate: elecSingleRate,
            validFrom: elecSingleValidFrom,
            validTo: elecSingleValidTo,
            note: 'Єдиний тариф на електроенергію',
          },
        ];
      } else {
        const match = elecSingleHist.find((h) => h.validFrom === elecSingleValidFrom);
        if (match) {
          match.rate = elecSingleRate;
          match.validTo = elecSingleValidTo;
        } else {
          elecSingleHist.push({
            id: `esh_${Date.now()}`,
            rate: elecSingleRate,
            validFrom: elecSingleValidFrom,
            validTo: elecSingleValidTo,
            note: 'Тариф на електроенергію',
          });
        }
      }

      const elecDualSummerDay = Number(val.elecDualSummerDay) > 0 ? Number(val.elecDualSummerDay) : 4.32;
      const elecDualSummerNight = Number(val.elecDualSummerNight) > 0 ? Number(val.elecDualSummerNight) : 2.16;
      const elecDualWinterDay = Number(val.elecDualWinterDay) > 0 ? Number(val.elecDualWinterDay) : 4.32;
      const elecDualWinterNight = Number(val.elecDualWinterNight) > 0 ? Number(val.elecDualWinterNight) : 2.16;
      const elecDualWinterLimit = Number(val.elecDualWinterLimit) > 0 ? Number(val.elecDualWinterLimit) : 2000;
      const elecDualValidFrom = val.elecDualValidFrom || '2026-06-01';
      const elecDualValidTo = val.elecDualValidTo || '';
      let elecDualHist = [...(current.utilityTariffsSettings?.electricityDual?.history || [])];
      if (elecDualHist.length === 0 || (elecDualHist.length === 1 && elecDualHist[0].id === 'edh_1')) {
        elecDualHist = [
          {
            id: 'edh_1',
            validFrom: elecDualValidFrom,
            validTo: elecDualValidTo,
            summerDay: elecDualSummerDay,
            summerNight: elecDualSummerNight,
            winterDay: elecDualWinterDay,
            winterNight: elecDualWinterNight,
            winterLimitKwh: elecDualWinterLimit,
            note: 'Двозонний тариф на електроенергію',
          },
        ];
      } else {
        const match = elecDualHist.find((h) => h.validFrom === elecDualValidFrom);
        if (match) {
          match.summerDay = elecDualSummerDay;
          match.summerNight = elecDualSummerNight;
          match.winterDay = elecDualWinterDay;
          match.winterNight = elecDualWinterNight;
          match.winterLimitKwh = elecDualWinterLimit;
          match.validTo = elecDualValidTo;
        } else {
          elecDualHist.push({
            id: `edh_${Date.now()}`,
            validFrom: elecDualValidFrom,
            validTo: elecDualValidTo,
            summerDay: elecDualSummerDay,
            summerNight: elecDualSummerNight,
            winterDay: elecDualWinterDay,
            winterNight: elecDualWinterNight,
            winterLimitKwh: elecDualWinterLimit,
            note: 'Оновлений двозонний тариф на електроенергію',
          });
        }
      }

      const selectedOutageVariant: OutageScheduleViewVariant =
        val.outageScheduleViewVariant ||
        currentTariffs?.outageScheduleViewVariant ||
        'v1_classic_grid';

      const tariffs: UtilityTariffsSettings = {
        outageScheduleViewVariant: selectedOutageVariant,
        water: {
          price: waterPrice,
          monthlyFee: waterMonthlyFee,
          validFrom: waterValidFrom,
          validTo: waterValidTo,
          history: waterHist,
        },
        waste: {
          price: wastePrice,
          validFrom: wasteValidFrom,
          validTo: wasteValidTo,
          history: wasteHist,
        },
        electricitySingle: {
          rate: elecSingleRate,
          validFrom: elecSingleValidFrom,
          validTo: elecSingleValidTo,
          history: elecSingleHist,
        },
        electricityDual: {
          validFrom: elecDualValidFrom,
          validTo: elecDualValidTo,
          summerDay: elecDualSummerDay,
          summerNight: elecDualSummerNight,
          winterDay: elecDualWinterDay,
          winterNight: elecDualWinterNight,
          winterLimitKwh: elecDualWinterLimit,
          history: elecDualHist,
        },
      };

      await this.dataService.saveSettings({
        ...current,
        defaultMonthlyPrice: Number(val.defaultMonthlyPrice),
        cardRequisites: val.cardRequisites?.trim() || '',
        reminderDaysBefore: Number(val.reminderDaysBefore),
        outageScheduleViewVariant: selectedOutageVariant,
        viberReminderMessageTemplate:
          val.viberReminderMessageTemplate?.trim() || DEFAULT_VIBER_REMINDER_TEMPLATE,
        viberRenewalMessageTemplate:
          val.viberRenewalMessageTemplate?.trim() || DEFAULT_VIBER_RENEWAL_TEMPLATE,
        telegramBotToken: val.telegramBotToken?.trim() || '',
        telegramBotUsername: val.telegramBotUsername?.trim() || 'iptv_billing_bot',
        telegramSenderName: val.telegramSenderName?.trim() || 'IPTV Підтримка',
        utilityTariffsSettings: tariffs,
      });
      this.patchFormValues(this.dataService.settings());
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

  readonly copySourceDb = signal<string>('external');
  readonly copyTargetDb = signal<string>('cloudsql');
  readonly isAddDbModalOpen = signal<boolean>(false);
  readonly isBenchmarking = signal<boolean>(false);

  readonly addDbForm = new FormGroup({
    name: new FormControl('', [Validators.required]),
    type: new FormControl<'postgresql' | 'sqlite' | 'firestore' | 'mysql'>('postgresql', [Validators.required]),
    host: new FormControl(''),
    database: new FormControl('', [Validators.required]),
    description: new FormControl(''),
    connectionString: new FormControl(''),
  });

  readonly isRefreshingDb = signal<boolean>(false);

  async refreshDbStatus(): Promise<void> {
    this.isRefreshingDb.set(true);
    try {
      await Promise.all([
        this.dataService.fetchDbStatus(),
        this.dataService.refreshAllData(true),
      ]);
    } finally {
      this.isRefreshingDb.set(false);
    }
  }

  getDbCountsFormatted(mode: string): string {
    const inst = this.dbStatus()?.instances?.[mode];
    const clientsCount = inst?.counts?.clients ?? this.clients().length;
    const paymentsCount = inst?.counts?.payments ?? this.payments().length;
    const provCount = inst?.counts?.providerAccounts ?? this.providerAccounts().length;
    const utilCount = inst?.counts?.utilityAccounts ?? this.utilityAccounts().length;
    const readCount = inst?.counts?.utilityReadings ?? this.utilityReadings().length;
    const usersCount = inst?.counts?.users ?? this.users().length;

    return `${clientsCount} кл. / ${paymentsCount} опл. / ${provCount} пров. / ${utilCount} ком. / ${readCount} пок. / ${usersCount} юз.`;
  }

  getDbVersion(mode: string): string {
    const inst = this.dbStatus()?.instances?.[mode];
    if (inst?.lastVersion) return inst.lastVersion;
    const mapped = this.dbStatus()?.dbLastUpdateVersions?.[mode];
    if (mapped) return mapped;
    return this.dbStatus()?.globalVersion || 'v2.5.42';
  }

  getDbLastUpdateTime(mode: string): string {
    const inst = this.dbStatus()?.instances?.[mode];
    if (inst?.lastUpdate) return inst.lastUpdate;
    const mapped = this.dbStatus()?.dbLastUpdateTimes?.[mode];
    if (mapped) return mapped;
    return this.dbStatus()?.globalLastUpdate || 'Синхронізовано';
  }

  async runBenchmark(): Promise<void> {
    this.isBenchmarking.set(true);
    try {
      await this.dataService.runDatabaseBenchmark();
    } finally {
      this.isBenchmarking.set(false);
    }
  }

  async submitNewCustomDb(): Promise<void> {
    if (this.addDbForm.invalid) {
      this.addDbForm.markAllAsTouched();
      return;
    }
    const val = this.addDbForm.getRawValue();
    const ok = await this.dataService.addCustomDatabase({
      name: val.name || '',
      type: val.type || 'postgresql',
      host: val.host || '',
      database: val.database || '',
      description: val.description || '',
      connectionString: val.connectionString || '',
    });
    if (ok) {
      this.addDbForm.reset({ type: 'postgresql' });
      this.isAddDbModalOpen.set(false);
    }
  }

  async deleteCustomDb(id: string): Promise<void> {
    if (confirm('Видалити цю конфігурацію бази даних?')) {
      await this.dataService.deleteCustomDatabase(id);
    }
  }

  async selectDatabaseMode(mode: string): Promise<void> {
    if (this.activeDbMode() === mode) return;
    await this.dataService.switchDatabaseMode(mode as 'sqlite_local' | 'cloudsql' | 'external');
  }

  async executeDualCopy(): Promise<void> {
    const src = this.copySourceDb();
    const tgt = this.copyTargetDb();
    if (src === tgt) {
      alert('Будь ласка, виберіть різні бази даних для копіювання!');
      return;
    }
    await this.dataService.copyBetweenDatabases(src, tgt);
  }

  async copyActiveToOtherDb(): Promise<void> {
    const source = this.activeDbMode();
    const target = source === 'cloudsql' ? 'external' : 'cloudsql';
    await this.dataService.copyBetweenDatabases(source, target);
  }

  readonly providerAccounts = this.dataService.accounts;
  readonly utilityAccounts = this.dataService.utilityAccounts;
  readonly utilityReadings = this.dataService.utilityReadings;
  readonly users = this.dataService.usersList;

  async copyDirection(source: string, target: string): Promise<void> {
    await this.dataService.copyBetweenDatabases(source, target);
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
