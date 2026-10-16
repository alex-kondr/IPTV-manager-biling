import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { IptvData } from '../../services/iptv-data';
import {
  UtilityAccount,
  UtilityReading,
  resolveWaterRate,
  resolveWasteRate,
} from '../../models/utility.model';
import { formatDateUa } from '../../models/client.model';
import { MeterCameraModal, AppliedMeterReading } from '../meter-camera-modal/meter-camera-modal';

type SubView = 'all' | 'water' | 'waste';

@Component({
  selector: 'app-water-waste-view',
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, MeterCameraModal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div id="water-waste-container" class="space-y-6 max-w-7xl mx-auto">
      <!-- Header Banner -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 sm:p-6 bg-gradient-to-r from-cyan-500/10 via-emerald-500/5 to-transparent rounded-2xl border border-cyan-500/20 shadow-2xs">
        <div class="flex items-center gap-3.5">
          <div class="w-12 h-12 rounded-2xl bg-cyan-600 text-white flex items-center justify-center shadow-sm shadow-cyan-600/30">
            <mat-icon class="text-2xl">water_drop</mat-icon>
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-lg sm:text-xl font-bold text-slate-900">Водопостачання та вивіз сміття</h2>
              <span class="px-2.5 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-cyan-100 text-cyan-800 border border-cyan-200">
                Комунальні послуги
              </span>
            </div>
            <p class="text-xs text-slate-500 mt-0.5">
              Облік показів лічильників води, нарахування за вивіз сміття та контроль оплат
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2.5 flex-wrap">
          @if (canEdit()) {
            <button
              type="button"
              (click)="openAccountModal(null)"
              class="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <mat-icon class="text-base leading-none">add_business</mat-icon>
              <span>Додати акаунт</span>
            </button>
            <button
              type="button"
              (click)="openWaterReadingModal()"
              [disabled]="waterWasteAccounts().length === 0"
              class="px-4 py-2 rounded-xl text-xs font-semibold bg-cyan-600 hover:bg-cyan-700 text-white transition-colors flex items-center gap-1.5 shadow-sm shadow-cyan-600/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <mat-icon class="text-base leading-none">water_drop</mat-icon>
              <span>Внести покази</span>
            </button>
            <button
              type="button"
              (click)="openCameraModal()"
              [disabled]="waterWasteAccounts().length === 0"
              class="px-3.5 py-2 rounded-xl text-xs font-semibold bg-cyan-50 border border-cyan-300 text-cyan-900 hover:bg-cyan-100 transition-colors flex items-center gap-1.5 shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              title="Сфотографувати лічильник води та автоматично розпізнати покази"
            >
              <mat-icon class="text-base text-cyan-600 leading-none">photo_camera</mat-icon>
              <span>Зробити фото</span>
            </button>
            <button
              type="button"
              (click)="openWasteAccrualModal()"
              [disabled]="waterWasteAccounts().length === 0"
              class="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-1.5 shadow-sm shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <mat-icon class="text-base leading-none">delete_outline</mat-icon>
              <span>Нарахувати сміття</span>
            </button>
          }
        </div>
      </div>

      <!-- Accounts Switcher Tabs -->
      @if (waterWasteAccounts().length > 0) {
        <div class="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
          @for (acc of waterWasteAccounts(); track acc.id) {
            <button
              type="button"
              (click)="selectAccount(acc.id)"
              [class.bg-slate-900]="selectedAccountId() === acc.id"
              [class.text-white]="selectedAccountId() === acc.id"
              [class.border-slate-900]="selectedAccountId() === acc.id"
              [class.bg-white]="selectedAccountId() !== acc.id"
              [class.text-slate-700]="selectedAccountId() !== acc.id"
              [class.border-slate-200]="selectedAccountId() !== acc.id"
              class="px-4 py-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2.5 shrink-0 transition-all shadow-2xs cursor-pointer hover:border-slate-400"
            >
              <mat-icon class="text-base" [class.text-cyan-400]="selectedAccountId() === acc.id" [class.text-cyan-600]="selectedAccountId() !== acc.id">
                home
              </mat-icon>
              <div class="text-left">
                <div class="font-bold leading-tight">{{ acc.name }}</div>
                <div class="text-3xs opacity-80">№ {{ acc.accountNumber }}</div>
              </div>
              <div class="flex items-center gap-1">
                @if (acc.waterEnabled !== false) {
                  <span class="w-2 h-2 rounded-full bg-cyan-400" title="Водопостачання"></span>
                }
                @if (acc.wasteEnabled !== false) {
                  <span class="w-2 h-2 rounded-full bg-emerald-400" title="Вивіз сміття"></span>
                }
              </div>
            </button>
          }
        </div>
      } @else {
        <!-- Empty State -->
        <div class="p-8 text-center bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <div class="w-14 h-14 rounded-2xl bg-cyan-50 text-cyan-600 flex items-center justify-center mx-auto mb-3">
            <mat-icon class="text-3xl">water_drop</mat-icon>
          </div>
          <h3 class="text-base font-bold text-slate-900">Немає доданих особових рахунків води та сміття</h3>
          <p class="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
            Додайте рахунок для квартири або приватного будинку, щоб вносити покази лічильника води та вести облік нарахувань за вивіз сміття.
          </p>
          @if (canEdit()) {
            <button
              type="button"
              (click)="openAccountModal(null)"
              class="px-4 py-2.5 rounded-xl text-xs font-semibold bg-cyan-600 hover:bg-cyan-700 text-white transition-colors inline-flex items-center gap-2 cursor-pointer shadow-sm shadow-cyan-600/20"
            >
              <mat-icon class="text-base">add</mat-icon>
              <span>Створити перший особовий рахунок</span>
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
                <span class="text-2xs text-slate-500 font-mono bg-slate-100 px-2 py-0.5 rounded">
                  Особовий № {{ acc.accountNumber }}
                </span>
                @if (acc.meterNumber) {
                  <span class="text-2xs text-cyan-700 font-mono bg-cyan-50 px-2 py-0.5 rounded border border-cyan-200/60">
                    Лічильник води: {{ acc.meterNumber }}
                  </span>
                }
                @if (acc.residentsCount) {
                  <span class="text-2xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60 font-semibold">
                    {{ acc.residentsCount }} осіб (сміття)
                  </span>
                }
              </div>
              @if (acc.address) {
                <p class="text-xs text-slate-500 mt-0.5">Адреса: <span class="text-slate-700">{{ acc.address }}</span></p>
              }
            </div>

            @if (canEdit()) {
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  (click)="openAccountModal(acc)"
                  class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 border border-slate-200 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <mat-icon class="text-sm">edit</mat-icon>
                  <span>Редагувати</span>
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
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <!-- Water Latest Reading -->
            <div class="p-3.5 rounded-xl bg-cyan-50/70 border border-cyan-200/80">
              <span class="text-3xs font-semibold uppercase tracking-wider text-cyan-800 block">Показник води</span>
              @if (latestWaterReading(); as lwr) {
                <div class="text-base font-extrabold text-cyan-950 mt-1">
                  {{ lwr.readingT1 }} <span class="text-xs font-normal text-cyan-700">м³</span>
                </div>
                <span class="text-3xs text-cyan-700 block mt-0.5">Дата: {{ formatDate(lwr.date) }}</span>
              } @else {
                <div class="text-xs text-cyan-700 mt-1 italic">
                  Початковий: {{ acc.initialReadingWater || 0 }} м³
                </div>
              }
            </div>

            <!-- Water Rate -->
            <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <span class="text-3xs font-semibold uppercase tracking-wider text-slate-500 block">Тариф на воду</span>
              <div class="text-base font-extrabold text-slate-900 mt-1">
                {{ currentWaterRate() }} <span class="text-xs font-normal text-slate-500">грн/м³</span>
              </div>
              <span class="text-3xs text-slate-400 block mt-0.5">Діє з {{ formatDate(waterTariffValidFrom()) }}</span>
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
                {{ currentWasteRate() }} <span class="text-xs font-normal text-slate-500">грн/міс</span>
              </div>
              <span class="text-3xs text-slate-400 block mt-0.5">Діє з {{ formatDate(wasteTariffValidFrom()) }}</span>
            </div>
          </div>
        </div>

        <!-- History Records Table -->
        <div class="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 class="text-base font-bold text-slate-900">Історія нарахувань та оплат</h3>
              <p class="text-xs text-slate-500">Покази лічильника води та щомісячні нарахування за вивіз сміття</p>
            </div>

            <div class="flex items-center gap-2 flex-wrap">
              @if (canEdit()) {
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    (click)="openWaterReadingModal()"
                    class="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-cyan-600 hover:bg-cyan-700 text-white transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer shrink-0"
                  >
                    <mat-icon class="text-base leading-none">add</mat-icon>
                    <span>Внести покази</span>
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
                </div>
              }

              <!-- Filter by service -->
              <div class="flex items-center bg-slate-100 p-0.5 rounded-xl text-xs font-semibold text-slate-600">
                <button
                  type="button"
                  (click)="filterType.set('all')"
                  [class.bg-white]="filterType() === 'all'"
                  [class.text-slate-900]="filterType() === 'all'"
                  [class.shadow-2xs]="filterType() === 'all'"
                  class="px-2.5 py-1 rounded-lg cursor-pointer transition-all"
                >
                  Всі
                </button>
                <button
                  type="button"
                  (click)="filterType.set('water')"
                  [class.bg-white]="filterType() === 'water'"
                  [class.text-slate-900]="filterType() === 'water'"
                  [class.shadow-2xs]="filterType() === 'water'"
                  class="px-2.5 py-1 rounded-lg cursor-pointer transition-all flex items-center gap-1"
                >
                  <mat-icon class="text-xs leading-none text-cyan-600">water_drop</mat-icon>
                  Вода
                </button>
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
              </div>
            </div>
          </div>

          <!-- History Table -->
          @if (filteredReadings().length > 0) {
            <div class="overflow-x-auto rounded-xl border border-slate-200">
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
                        <div class="font-bold text-slate-900">{{ formatDate(r.date) }}</div>
                        <div class="text-3xs text-slate-400 font-mono">{{ r.periodMonth || r.date.substring(0, 7) }}</div>
                      </td>

                      <!-- Service Type -->
                      <td class="py-3 px-3.5 whitespace-nowrap">
                        @if (r.utilityType === 'water') {
                          <span class="px-2.5 py-1 rounded-md text-3xs font-bold uppercase inline-flex items-center gap-1 bg-cyan-100 text-cyan-800">
                            <mat-icon class="text-xs leading-none">water_drop</mat-icon> Вода
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
                        <span class="text-xs font-semibold text-slate-700">
                          {{ r.rateT1 }} грн{{ r.utilityType === 'water' ? '/м³' : '/міс' }}
                        </span>
                      </td>

                      <!-- Total Cost -->
                      <td class="py-3 px-3.5 whitespace-nowrap">
                        <span class="font-bold text-slate-900 text-sm">
                          {{ r.totalCost.toFixed(2) }} грн
                        </span>
                      </td>

                      <!-- Status & Pay Toggle -->
                      <td class="py-3 px-3.5 whitespace-nowrap">
                        @if (canEdit()) {
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
              <div class="text-xs font-semibold text-slate-600">Історія нарахувань порожня</div>
              <p class="text-3xs text-slate-400 mt-0.5">Внесіть перші дані лічильника вручну або сфотографуйте табло.</p>
              @if (canEdit()) {
                <div class="flex items-center justify-center gap-2 mt-3">
                  <button
                    type="button"
                    (click)="openWaterReadingModal()"
                    class="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-cyan-600 hover:bg-cyan-700 text-white transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <mat-icon class="text-base leading-none">add</mat-icon>
                    <span>Внести покази</span>
                  </button>
                  <button
                    type="button"
                    (click)="openCameraModal()"
                    class="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-cyan-50 border border-cyan-300 text-cyan-900 hover:bg-cyan-100 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    title="Сфотографувати лічильник води та автоматично розпізнати покази"
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
    </div>

    <!-- ======================================================== -->
    <!-- MODAL: ADD / EDIT ACCOUNT (WATER & WASTE)                -->
    <!-- ======================================================== -->
    @if (isAccountModalOpen()) {
      <div class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs p-2 sm:p-4 flex items-center justify-center">
        <div class="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[calc(100dvh-2rem)] animate-in fade-in zoom-in-95 duration-150 my-auto">
          <!-- Pinned Header -->
          <div class="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 bg-slate-50 shrink-0">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-xl bg-cyan-100 text-cyan-700 flex items-center justify-center shrink-0">
                <mat-icon>water_drop</mat-icon>
              </div>
              <h3 class="text-base font-bold text-slate-900">
                {{ editingAccount() ? 'Редагувати акаунт води та сміття' : 'Новий акаунт води та сміття' }}
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
              <!-- Name -->
            <div>
              <label for="ww-name" class="block text-xs font-semibold text-slate-700 mb-1">
                Назва об'єкта / акаунта *
              </label>
              <input
                id="ww-name"
                type="text"
                formControlName="name"
                placeholder="Квартира або Приватний будинок"
                class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-cyan-600"
              />
            </div>

            <!-- Account Number & Water Meter Number -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label for="ww-acc-num" class="block text-xs font-semibold text-slate-700 mb-1">
                  Особовий рахунок *
                </label>
                <input
                  id="ww-acc-num"
                  type="text"
                  formControlName="accountNumber"
                  placeholder="20491823"
                  class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-medium text-slate-900 focus:outline-none focus:border-cyan-600"
                />
              </div>
              <div>
                <label for="ww-meter" class="block text-xs font-semibold text-slate-700 mb-1">
                  Номер лічильника води
                </label>
                <input
                  id="ww-meter"
                  type="text"
                  formControlName="meterNumber"
                  placeholder="№ 9821430"
                  class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-medium text-slate-900 focus:outline-none focus:border-cyan-600"
                />
              </div>
            </div>

            <!-- Address & Residents Count -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div class="sm:col-span-2">
                <label for="ww-addr" class="block text-xs font-semibold text-slate-700 mb-1">
                  Адреса
                </label>
                <input
                  id="ww-addr"
                  type="text"
                  formControlName="address"
                  placeholder="м. Київ, вул. Садова, 12"
                  class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-cyan-600"
                />
              </div>
              <div>
                <label for="ww-residents" class="block text-xs font-semibold text-slate-700 mb-1">
                  Кількість осіб
                </label>
                <input
                  id="ww-residents"
                  type="number"
                  min="1"
                  formControlName="residentsCount"
                  placeholder="1"
                  class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-cyan-600"
                />
              </div>
            </div>

            <!-- Initial Water Reading -->
            <div>
              <label for="ww-init-water" class="block text-xs font-semibold text-slate-700 mb-1">
                Початковий показник лічильника води (м³)
              </label>
              <input
                id="ww-init-water"
                type="number"
                min="0"
                step="0.01"
                formControlName="initialReadingWater"
                placeholder="0"
                class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-cyan-600"
              />
              <p class="text-3xs text-slate-500 mt-1">Використовується для розрахунку споживання за першу передачу показів.</p>
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
    <!-- MODAL: ADD WATER METER READING                           -->
    <!-- ======================================================== -->
    @if (isWaterModalOpen()) {
      <div class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs p-2 sm:p-4 flex items-center justify-center">
        <div class="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[calc(100dvh-2rem)] animate-in fade-in zoom-in-95 duration-150 my-auto">
          <!-- Pinned Header -->
          <div class="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 bg-slate-50 shrink-0">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-xl bg-cyan-600 text-white flex items-center justify-center shrink-0">
                <mat-icon>water_drop</mat-icon>
              </div>
              <div>
                <h3 class="text-base font-bold text-slate-900">Внесення показів лічильника води</h3>
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
            <div class="p-3 bg-cyan-50/70 border border-cyan-200/80 rounded-xl flex items-center justify-between text-xs">
              <span class="text-slate-600">Попередній зафіксований показник:</span>
              <span class="font-mono font-bold text-cyan-900">{{ prevWaterReading() }} м³</span>
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
                <span class="font-mono font-bold text-cyan-300">{{ formWaterConsumption() }} м³</span>
              </div>
              <div class="flex items-center justify-between text-xs text-slate-300">
                <span>Діючий тариф:</span>
                <span class="font-mono text-slate-300">{{ activeWaterRateForDate() }} грн/м³</span>
              </div>
              <div class="flex items-center justify-between pt-2 border-t border-slate-800 text-sm font-bold">
                <span>До сплати за воду:</span>
                <span class="text-lg font-mono font-extrabold text-cyan-400">{{ formWaterCost().toFixed(2) }} грн</span>
              </div>
            </div>

            <!-- Paid status -->
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

            <!-- Note -->
            <div>
              <label for="water-note" class="block text-xs font-semibold text-slate-700 mb-1">
                Примітка (необов'язково)
              </label>
              <input
                id="water-note"
                type="text"
                formControlName="note"
                placeholder="Наприклад: Оплата онлайн"
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
                class="px-4 py-2 rounded-xl text-xs font-semibold bg-cyan-600 hover:bg-cyan-700 text-white transition-colors cursor-pointer disabled:opacity-50"
              >
                Зафіксувати покази води
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- ======================================================== -->
    <!-- MODAL: ADD WASTE COLLECTION ACCRUAL                      -->
    <!-- ======================================================== -->
    @if (isWasteModalOpen()) {
      <div class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs p-2 sm:p-4 flex items-center justify-center">
        <div class="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[calc(100dvh-2rem)] animate-in fade-in zoom-in-95 duration-150 my-auto">
          <!-- Pinned Header -->
          <div class="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 bg-slate-50 shrink-0">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <mat-icon>delete_outline</mat-icon>
              </div>
              <div>
                <h3 class="text-base font-bold text-slate-900">Нарахування за вивіз сміття</h3>
                <p class="text-2xs text-slate-500">{{ currentAccount()?.name }} • Особовий № {{ currentAccount()?.accountNumber }}</p>
              </div>
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
              <!-- Period Month & Date -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label for="waste-month" class="block text-xs font-semibold text-slate-700 mb-1">
                  Місяць нарахування *
                </label>
                <input
                  id="waste-month"
                  type="month"
                  formControlName="month"
                  (change)="recalcWasteCost()"
                  class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-emerald-600"
                />
              </div>
              <div>
                <label for="waste-date" class="block text-xs font-semibold text-slate-700 mb-1">
                  Дата операції *
                </label>
                <input
                  id="waste-date"
                  type="date"
                  formControlName="date"
                  (change)="recalcWasteCost()"
                  class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-emerald-600"
                />
              </div>
            </div>

            <!-- Calculation Breakdown -->
            <div class="p-4 rounded-xl bg-slate-900 text-white space-y-2">
              <div class="flex items-center justify-between text-xs text-slate-300">
                <span>Тариф на вивіз сміття:</span>
                <span class="font-mono text-slate-300">{{ activeWasteRateForDate() }} грн/міс</span>
              </div>
              <div class="flex items-center justify-between text-xs text-slate-300">
                <span>Кількість зареєстрованих осіб:</span>
                <span class="font-mono font-bold text-emerald-300">{{ currentAccount()?.residentsCount || 1 }}</span>
              </div>
              <div class="flex items-center justify-between pt-2 border-t border-slate-800 text-sm font-bold">
                <span>Сума до сплати:</span>
                <span class="text-lg font-mono font-extrabold text-emerald-400">{{ formWasteCost().toFixed(2) }} грн</span>
              </div>
            </div>

            <!-- Paid status -->
            <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
              <div>
                <label for="waste-ispaid" class="text-xs font-bold text-slate-900 block cursor-pointer">
                  Позначити одразу як сплачено
                </label>
                <span class="text-3xs text-slate-500">Фіксує оплату послуги сміття</span>
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
                placeholder="Наприклад: Оплата за жовтень"
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
                Зберегти нарахування
              </button>
            </div>
          </form>
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

  readonly canEdit = this.dataService.canEdit;
  readonly waterWasteAccounts = this.dataService.waterWasteAccounts;
  readonly utilityTariffs = this.dataService.utilityTariffs;

  readonly selectedAccountId = signal<string>('');
  readonly filterType = signal<SubView>('all');

  readonly isAccountModalOpen = signal<boolean>(false);
  readonly editingAccount = signal<UtilityAccount | null>(null);

  readonly isWaterModalOpen = signal<boolean>(false);
  readonly isWasteModalOpen = signal<boolean>(false);
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
    notes: new FormControl(''),
  });

  readonly waterForm = new FormGroup({
    date: new FormControl(new Date().toISOString().split('T')[0], [Validators.required]),
    reading: new FormControl<number | null>(null, [Validators.required]),
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
    const accounts = this.waterWasteAccounts();
    if (accounts.length > 0 && !this.selectedAccountId()) {
      this.selectedAccountId.set(accounts[0].id);
    }
  }

  readonly currentAccount = computed<UtilityAccount | null>(() => {
    const list = this.waterWasteAccounts();
    if (list.length === 0) return null;
    const selected = list.find((a) => a.id === this.selectedAccountId());
    return selected || list[0];
  });

  readonly accountReadings = computed<UtilityReading[]>(() => {
    const acc = this.currentAccount();
    if (!acc) return [];
    return this.dataService
      .utilityReadings()
      .filter((r) => r.accountId === acc.id && (r.utilityType === 'water' || r.utilityType === 'waste'))
      .sort((a, b) => b.date.localeCompare(a.date));
  });

  readonly filteredReadings = computed<UtilityReading[]>(() => {
    const list = this.accountReadings();
    const f = this.filterType();
    if (f === 'all') return list;
    return list.filter((r) => r.utilityType === f);
  });

  readonly latestWaterReading = computed<UtilityReading | null>(() => {
    const list = this.accountReadings().filter((r) => r.utilityType === 'water');
    return list.length > 0 ? list[0] : null;
  });

  readonly prevWaterReading = computed<number>(() => {
    const latest = this.latestWaterReading();
    if (latest && latest.readingT1 !== undefined && latest.readingT1 !== null) {
      return latest.readingT1;
    }
    const acc = this.currentAccount();
    return acc ? (acc.initialReadingWater || 0) : 0;
  });

  readonly currentWaterRate = computed<number>(() => {
    const tariffs = this.utilityTariffs();
    const today = new Date().toISOString().split('T')[0];
    return resolveWaterRate(today, tariffs);
  });

  readonly waterTariffValidFrom = computed<string>(() => {
    return this.utilityTariffs().water?.validFrom || '2026-01-01';
  });

  readonly currentWasteRate = computed<number>(() => {
    const tariffs = this.utilityTariffs();
    const today = new Date().toISOString().split('T')[0];
    return resolveWasteRate(today, tariffs);
  });

  readonly wasteTariffValidFrom = computed<string>(() => {
    return this.utilityTariffs().waste?.validFrom || '2026-01-01';
  });

  readonly monthlyWasteCharge = computed<number>(() => {
    const acc = this.currentAccount();
    const count = acc?.residentsCount || 1;
    return Math.round(count * this.currentWasteRate() * 100) / 100;
  });

  selectAccount(id: string): void {
    this.selectedAccountId.set(id);
  }

  formatDate(dateStr: string): string {
    return formatDateUa(dateStr, true);
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
        ...(existing ? { id: existing.id } : {}),
        type: 'water_waste',
        name: formVal.name?.trim() || '',
        accountNumber: formVal.accountNumber?.trim() || '',
        address: formVal.address?.trim() || '',
        meterNumber: formVal.meterNumber?.trim() || '',
        residentsCount: Math.max(1, Number(formVal.residentsCount) || 1),
        initialReadingWater: Number(formVal.initialReadingWater) || 0,
        waterEnabled: true,
        wasteEnabled: true,
        electricityTariffType: 'single',
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
    const ok = confirm(`Ви дійсно бажаєте видалити особовий рахунок «${acc.name}» (№ ${acc.accountNumber}) та всі пов'язані з ним записи?`);
    if (ok) {
      await this.dataService.deleteUtilityAccount(acc.id);
      const remaining = this.waterWasteAccounts();
      if (remaining.length > 0) {
        this.selectedAccountId.set(remaining[0].id);
      }
    }
  }

  openWaterReadingModal(): void {
    this.waterForm.reset({
      date: new Date().toISOString().split('T')[0],
      reading: null,
      isPaid: false,
      note: '',
    });
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
      isPaid: false,
      note: applied.note || 'Розпізнано за фото лічильника',
    });

    this.recalcWaterCost();
    this.isWaterModalOpen.set(true);
  }

  closeWaterModal(): void {
    this.isWaterModalOpen.set(false);
  }

  recalcWaterCost(): void {
    const tariffs = this.utilityTariffs();
    const date = this.waterForm.get('date')?.value || new Date().toISOString().split('T')[0];
    const rate = resolveWaterRate(date, tariffs);
    this.activeWaterRateForDate.set(rate);

    const val = Number(this.waterForm.get('reading')?.value) || 0;
    const prev = this.prevWaterReading();
    const diff = Math.max(0, Math.round((val - prev) * 100) / 100);
    this.formWaterConsumption.set(diff);
    this.formWaterCost.set(Math.round(diff * rate * 100) / 100);
  }

  async saveWaterReading(): Promise<void> {
    const acc = this.currentAccount();
    if (!acc || this.waterForm.invalid) return;

    this.isSubmitting.set(true);
    try {
      const formVal = this.waterForm.getRawValue();
      const date = formVal.date || new Date().toISOString().split('T')[0];
      const tariffs = this.utilityTariffs();
      const rate = resolveWaterRate(date, tariffs);

      const val = Number(formVal.reading) || 0;
      const prev = this.prevWaterReading();
      const diff = Math.max(0, Math.round((val - prev) * 100) / 100);
      const totalCost = Math.round(diff * rate * 100) / 100;

      const reading: Partial<UtilityReading> = {
        accountId: acc.id,
        utilityType: 'water',
        date,
        periodMonth: date.substring(0, 7),
        readingT1: val,
        consumptionT1: diff,
        rateT1: rate,
        totalCost,
        isPaid: Boolean(formVal.isPaid),
        paidDate: formVal.isPaid ? date : undefined,
        paidAmount: formVal.isPaid ? totalCost : undefined,
        note: formVal.note?.trim() || '',
      };

      await this.dataService.saveUtilityReading(reading);
      this.closeWaterModal();
    } finally {
      this.isSubmitting.set(false);
    }
  }

  openWasteAccrualModal(): void {
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

  closeWasteModal(): void {
    this.isWasteModalOpen.set(false);
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
      const formVal = this.wasteForm.getRawValue();
      const date = formVal.date || new Date().toISOString().split('T')[0];
      const month = formVal.month || date.substring(0, 7);
      const tariffs = this.utilityTariffs();
      const rate = resolveWasteRate(date, tariffs);
      const count = acc.residentsCount || 1;
      const totalCost = Math.round(count * rate * 100) / 100;

      const reading: Partial<UtilityReading> = {
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
      };

      await this.dataService.saveUtilityReading(reading);
      this.closeWasteModal();
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async deleteReading(id: string): Promise<void> {
    const ok = confirm('Видалити цей запис?');
    if (ok) {
      await this.dataService.deleteUtilityReading(id);
    }
  }

  async togglePaidStatus(r: UtilityReading): Promise<void> {
    const nextStatus = !r.isPaid;
    await this.dataService.markUtilityReadingPaid(r.id, nextStatus, r.totalCost);
  }
}
