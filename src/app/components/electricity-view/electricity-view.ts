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
  resolveElectricitySingleRate,
  resolveElectricityDualRates,
  getSeasonForDate,
  calculateElectricityCost,
  ElectricityCostResult,
} from '../../models/utility.model';
import { formatDateUa } from '../../models/client.model';
import { MeterCameraModal, AppliedMeterReading } from '../meter-camera-modal/meter-camera-modal';
import { ElectricityChartComponent } from './electricity-chart.component';
import {
  ElectricityTimelinePoint,
  ElectricityMonthlySummary,
  ElectricityStatsKPIs,
} from './electricity-chart-wrapper';

@Component({
  selector: 'app-electricity-view',
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, MeterCameraModal, ElectricityChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div id="electricity-container" class="space-y-6 max-w-7xl mx-auto">
      <!-- Header Banner -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 sm:p-6 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent rounded-2xl border border-amber-500/20 shadow-2xs">
        <div class="flex items-center gap-3.5">
          <div class="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-sm shadow-amber-500/30">
            <mat-icon class="text-2xl">bolt</mat-icon>
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-lg sm:text-xl font-bold text-slate-900">Облік електроенергії</h2>
              <span class="px-2.5 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200">
                Комунальні послуги
              </span>
            </div>
            <p class="text-xs text-slate-500 mt-0.5">
              Облік показів лічильників, розрахунок споживання, контрольні проміжні заміри та аналітика тенденцій
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
              (click)="openReadingModal(false)"
              [disabled]="electricityAccounts().length === 0"
              class="px-4 py-2 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white transition-colors flex items-center gap-1.5 shadow-sm shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              title="Внести офіційні покази для розрахунку оплати"
            >
              <mat-icon class="text-base leading-none">speed</mat-icon>
              <span>Внести покази</span>
            </button>
            <button
              type="button"
              (click)="openReadingModal(true)"
              [disabled]="electricityAccounts().length === 0"
              class="px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-50 border border-indigo-300 text-indigo-900 hover:bg-indigo-100 transition-colors flex items-center gap-1.5 shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              title="Додати контрольний показник тільки для аналізу тенденцій (не рахується для оплати)"
            >
              <mat-icon class="text-base text-indigo-600 leading-none">visibility</mat-icon>
              <span>Контрольний замір</span>
            </button>
            <button
              type="button"
              (click)="openCameraModal()"
              [disabled]="electricityAccounts().length === 0"
              class="px-3.5 py-2 rounded-xl text-xs font-semibold bg-amber-50 border border-amber-300 text-amber-900 hover:bg-amber-100 transition-colors flex items-center gap-1.5 shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              title="Сфотографувати лічильник та автоматично розпізнати покази"
            >
              <mat-icon class="text-base text-amber-600 leading-none">photo_camera</mat-icon>
              <span>Зробити фото</span>
            </button>
          }
        </div>
      </div>

      <!-- Accounts Switcher Tabs -->
      @if (electricityAccounts().length > 0) {
        <div class="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
          @for (acc of electricityAccounts(); track acc.id) {
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
              <mat-icon class="text-base" [class.text-amber-400]="selectedAccountId() === acc.id" [class.text-amber-500]="selectedAccountId() !== acc.id">
                {{ acc.electricityTariffType === 'dual' ? 'timelapse' : 'power' }}
              </mat-icon>
              <div class="text-left">
                <div class="font-bold leading-tight">{{ acc.name }}</div>
                <div class="text-3xs opacity-80">№ {{ acc.accountNumber }}</div>
              </div>
              <span
                class="px-1.5 py-0.5 rounded text-3xs font-bold uppercase"
                [class.bg-white/20]="selectedAccountId() === acc.id"
                [class.text-white]="selectedAccountId() === acc.id"
                [class.bg-slate-100]="selectedAccountId() !== acc.id"
                [class.text-slate-600]="selectedAccountId() !== acc.id"
              >
                {{ acc.electricityTariffType === 'dual' ? '2-зонний' : '1-зонний' }}
              </span>
            </button>
          }
        </div>
      } @else {
        <!-- Empty Accounts State -->
        <div class="p-8 text-center bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <div class="w-14 h-14 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center mx-auto mb-3">
            <mat-icon class="text-3xl">bolt</mat-icon>
          </div>
          <h3 class="text-base font-bold text-slate-900">Немає доданих особових рахунків електроенергії</h3>
          <p class="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
            Додайте свій перший рахунок (наприклад, «Квартира», «Будинок» або «Дача»), щоб передавати покази та рахувати споживання.
          </p>
          @if (canEdit()) {
            <button
              type="button"
              (click)="openAccountModal(null)"
              class="px-4 py-2.5 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white transition-colors inline-flex items-center gap-2 cursor-pointer shadow-sm shadow-amber-500/20"
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
                <span class="px-2.5 py-0.5 rounded-full text-2xs font-bold"
                  [class.bg-emerald-100]="acc.electricityTariffType === 'dual'"
                  [class.text-emerald-800]="acc.electricityTariffType === 'dual'"
                  [class.bg-blue-100]="acc.electricityTariffType === 'single'"
                  [class.text-blue-800]="acc.electricityTariffType === 'single'"
                >
                  {{ acc.electricityTariffType === 'dual' ? 'Двотарифний (День / Ніч)' : 'Однотарифний (Єдиний)' }}
                </span>
                @if (acc.meterNumber) {
                  <span class="text-2xs text-slate-500 font-mono bg-slate-100 px-2 py-0.5 rounded">
                    Лічильник № {{ acc.meterNumber }}
                  </span>
                }
              </div>
              <p class="text-xs text-slate-500 mt-0.5">
                Особовий рахунок: <span class="font-semibold text-slate-700 font-mono">{{ acc.accountNumber }}</span>
                @if (acc.address) {
                  • <span class="text-slate-600">{{ acc.address }}</span>
                }
              </p>
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

          <!-- Stat Cards -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <!-- Latest Reading -->
            <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <span class="text-3xs font-semibold uppercase tracking-wider text-slate-500 block">Останні покази</span>
              @if (latestAnyReading(); as lr) {
                @if (acc.electricityTariffType === 'dual') {
                  <div class="text-sm font-extrabold text-slate-900 mt-1">
                    Т1: {{ lr.readingT1 }} <span class="text-2xs font-normal text-slate-500">кВт·г</span>
                  </div>
                  <div class="text-sm font-extrabold text-slate-900">
                    Т2: {{ lr.readingT2 }} <span class="text-2xs font-normal text-slate-500">кВт·г</span>
                  </div>
                } @else {
                  <div class="text-base font-extrabold text-slate-900 mt-1">
                    {{ lr.readingT1 }} <span class="text-xs font-normal text-slate-500">кВт·г</span>
                  </div>
                }
                <div class="flex items-center gap-1.5 mt-1 flex-wrap">
                  <span class="text-3xs text-slate-500">{{ formatDate(lr.date) }}</span>
                  @if (lr.isControlOnly) {
                    <span class="px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800 text-3xs font-bold border border-indigo-200">
                      Контрольний
                    </span>
                  }
                </div>
              } @else {
                <div class="text-xs text-slate-400 mt-1 italic">
                  Початкові: {{ acc.electricityTariffType === 'dual' ? (acc.initialReadingT1 || 0) + ' / ' + (acc.initialReadingT2 || 0) : (acc.initialReadingT1 || 0) }} кВт·г
                </div>
              }
            </div>

            <!-- Last Consumption -->
            <div class="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200/80">
              <span class="text-3xs font-semibold uppercase tracking-wider text-amber-800 block">Спожито за період</span>
              @if (latestAnyReading(); as lr) {
                <div class="text-base font-extrabold text-amber-950 mt-1">
                  {{ totalConsumedKwh(lr) }} <span class="text-xs font-normal text-amber-700">кВт·г</span>
                </div>
                @if (acc.electricityTariffType === 'dual') {
                  <div class="text-2xs text-amber-800 mt-0.5">
                    День: {{ lr.consumptionT1 || 0 }} • Ніч: {{ lr.consumptionT2 || 0 }}
                  </div>
                }
                @if (lr.isControlOnly) {
                  <span class="text-3xs text-indigo-700 font-semibold mt-0.5 block">Для моніторингу</span>
                }
              } @else {
                <div class="text-xs text-amber-600 mt-1 italic">Немає розрахунків</div>
              }
            </div>

            <!-- Last Billing Accrual / Paid Status (Only official billing readings) -->
            <div class="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200/80">
              <span class="text-3xs font-semibold uppercase tracking-wider text-emerald-800 block">Сума за останній розрахунок</span>
              @if (latestBillingReading(); as lbr) {
                <div class="text-base font-extrabold text-emerald-950 mt-1">
                  {{ lbr.totalCost.toFixed(2) }} <span class="text-xs font-normal text-emerald-700">грн</span>
                </div>
                <div class="mt-1 flex items-center justify-between">
                  @if (lbr.isPaid) {
                    <span class="inline-flex items-center gap-1 text-3xs font-bold text-emerald-700 bg-emerald-100/90 px-2 py-0.5 rounded">
                      <mat-icon class="text-xs leading-none">check_circle</mat-icon> Оплачено
                    </span>
                  } @else {
                    <span class="inline-flex items-center gap-1 text-3xs font-bold text-rose-700 bg-rose-100/90 px-2 py-0.5 rounded">
                      <mat-icon class="text-xs leading-none">pending</mat-icon> До сплати
                    </span>
                  }
                  <span class="text-3xs text-slate-500 font-mono">{{ formatDate(lbr.date) }}</span>
                </div>
              } @else {
                <div class="text-xs text-emerald-600 mt-1 italic">0.00 грн (немає оплат)</div>
              }
            </div>

            <!-- Current Tariff Applied -->
            <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <span class="text-3xs font-semibold uppercase tracking-wider text-slate-500 block">Діючий тариф</span>
              <div class="mt-1">
                @if (acc.electricityTariffType === 'dual') {
                  @let dualRates = currentDualRates();
                  <div class="text-xs font-bold text-slate-900">
                    День: {{ dualRates.dayRate }} <span class="text-3xs text-slate-500 font-normal">грн</span>
                  </div>
                  <div class="text-xs font-bold text-slate-900">
                    Ніч: {{ dualRates.nightRate }} <span class="text-3xs text-slate-500 font-normal">грн</span>
                  </div>
                  <span class="inline-block mt-1 text-3xs font-semibold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200/60">
                    {{ dualRates.season === 'summer' ? 'Літній сезон (01.05 – 30.09)' : 'Зимовий сезон (01.10 – 30.04)' }}
                  </span>
                } @else {
                  <div class="text-base font-extrabold text-slate-900">
                    {{ currentSingleRate() }} <span class="text-xs font-normal text-slate-500">грн/кВт·г</span>
                  </div>
                  <span class="inline-block mt-1 text-3xs font-semibold text-slate-600 bg-slate-200/60 px-1.5 py-0.5 rounded">
                    Єдиний на весь рік
                  </span>
                }
              </div>
            </div>
          </div>
        </div>

        <!-- Mode Switcher: History Table vs Trend Analytics -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-slate-200/90 shadow-2xs">
          <div class="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-semibold">
            <button
              type="button"
              (click)="activeTab.set('table')"
              [class.bg-white]="activeTab() === 'table'"
              [class.text-slate-900]="activeTab() === 'table'"
              [class.shadow-2xs]="activeTab() === 'table'"
              [class.text-slate-600]="activeTab() !== 'table'"
              class="px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <mat-icon class="text-base text-amber-500">table_chart</mat-icon>
              <span>Журнал показів ({{ accountReadings().length }})</span>
            </button>
            <button
              type="button"
              (click)="activeTab.set('analytics')"
              [class.bg-white]="activeTab() === 'analytics'"
              [class.text-slate-900]="activeTab() === 'analytics'"
              [class.shadow-2xs]="activeTab() === 'analytics'"
              [class.text-slate-600]="activeTab() !== 'analytics'"
              class="px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <mat-icon class="text-base text-indigo-600">query_stats</mat-icon>
              <span>Графіки та аналітика тенденцій</span>
            </button>
          </div>

          @if (activeTab() === 'table') {
            <!-- Filter Pills -->
            <div class="flex items-center gap-1.5 overflow-x-auto text-2xs">
              <span class="text-slate-400 text-3xs uppercase font-semibold">Показати:</span>
              <button
                type="button"
                (click)="filterPurpose.set('all')"
                [class.bg-slate-900]="filterPurpose() === 'all'"
                [class.text-white]="filterPurpose() === 'all'"
                [class.bg-slate-100]="filterPurpose() !== 'all'"
                [class.text-slate-600]="filterPurpose() !== 'all'"
                class="px-2.5 py-1 rounded-lg font-semibold cursor-pointer transition-colors"
              >
                Всі ({{ accountReadings().length }})
              </button>
              <button
                type="button"
                (click)="filterPurpose.set('billing')"
                [class.bg-amber-600]="filterPurpose() === 'billing'"
                [class.text-white]="filterPurpose() === 'billing'"
                [class.bg-amber-50]="filterPurpose() !== 'billing'"
                [class.text-amber-800]="filterPurpose() !== 'billing'"
                class="px-2.5 py-1 rounded-lg font-semibold cursor-pointer transition-colors"
              >
                ⚡ Офіційні ({{ billingReadingsCount() }})
              </button>
              <button
                type="button"
                (click)="filterPurpose.set('control')"
                [class.bg-indigo-600]="filterPurpose() === 'control'"
                [class.text-white]="filterPurpose() === 'control'"
                [class.bg-indigo-50]="filterPurpose() !== 'control'"
                [class.text-indigo-800]="filterPurpose() !== 'control'"
                class="px-2.5 py-1 rounded-lg font-semibold cursor-pointer transition-colors"
              >
                👁️ Контрольні ({{ controlReadingsCount() }})
              </button>
            </div>
          }
        </div>

        @if (activeTab() === 'analytics') {
          <!-- Charts Section -->
          <div class="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 class="text-base font-bold text-slate-900 flex items-center gap-2">
                  <mat-icon class="text-indigo-600">query_stats</mat-icon>
                  <span>Аналітика споживання та тенденцій</span>
                </h3>
                <p class="text-xs text-slate-500">
                  Аналіз темпу кВт·г/добу, контроль лімітів та перевірка ефективності 2-зонного тарифу
                </p>
              </div>
              @if (canEdit()) {
                <button
                  type="button"
                  (click)="openReadingModal(true)"
                  class="px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <mat-icon class="text-sm text-indigo-600">visibility</mat-icon>
                  <span>+ Контрольний замір</span>
                </button>
              }
            </div>

            <app-electricity-chart
              [timeline]="electricityTimelineData()"
              [monthly]="electricityMonthlyData()"
              [stats]="electricityStatsKPIs()"
            />
          </div>
        } @else {
          <!-- Readings History Section -->
          <div class="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 class="text-base font-bold text-slate-900">Історія передачі показів та розрахунків</h3>
                <p class="text-xs text-slate-500">Усі зафіксовані покази по поточному особовому рахунку</p>
              </div>
              @if (canEdit()) {
                <div class="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    (click)="openReadingModal(false)"
                    class="px-3.5 py-2 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer shrink-0"
                  >
                    <mat-icon class="text-base leading-none">add</mat-icon>
                    <span>Внести покази</span>
                  </button>
                  <button
                    type="button"
                    (click)="openReadingModal(true)"
                    class="px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-50 border border-indigo-300 text-indigo-900 hover:bg-indigo-100 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer shrink-0"
                    title="Внести контрольний замір"
                  >
                    <mat-icon class="text-base text-indigo-600 leading-none">visibility</mat-icon>
                    <span>Контрольний замір</span>
                  </button>
                  <button
                    type="button"
                    (click)="openCameraModal()"
                    class="px-3 py-2 rounded-xl text-xs font-semibold bg-amber-50 border border-amber-300 text-amber-900 hover:bg-amber-100 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer shrink-0"
                    title="Сфотографувати лічильник та розпізнати покази"
                  >
                    <mat-icon class="text-base text-amber-600 leading-none">photo_camera</mat-icon>
                    <span>Зробити фото</span>
                  </button>
                </div>
              }
            </div>

            <!-- History Table -->
            @if (filteredAccountReadings().length > 0) {
              <div class="overflow-x-auto rounded-xl border border-slate-200">
                <table class="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr class="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-3xs tracking-wider">
                      <th class="py-3 px-3.5">Дата передачі</th>
                      <th class="py-3 px-3.5">Покази лічильника</th>
                      <th class="py-3 px-3.5">Спожито (кВт·г)</th>
                      <th class="py-3 px-3.5">Тариф (грн)</th>
                      <th class="py-3 px-3.5">Сума до сплати</th>
                      <th class="py-3 px-3.5">Статус</th>
                      @if (canEdit()) {
                        <th class="py-3 px-3.5 text-right">Дії</th>
                      }
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 text-slate-800">
                    @for (r of filteredAccountReadings(); track r.id) {
                      <tr class="hover:bg-slate-50/80 transition-colors">
                        <!-- Date -->
                        <td class="py-3 px-3.5 whitespace-nowrap">
                          <div class="flex items-center gap-1.5">
                            <div class="font-bold text-slate-900">{{ formatDate(r.date) }}</div>
                            @if (r.isControlOnly) {
                              <span class="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800 text-3xs font-bold border border-indigo-200">
                                <mat-icon class="text-3xs leading-none">visibility</mat-icon> Контрольний
                              </span>
                            }
                          </div>
                          <div class="text-3xs text-slate-400 font-mono">{{ r.periodMonth || r.date.substring(0, 7) }}</div>
                        </td>

                        <!-- Meter Readings -->
                        <td class="py-3 px-3.5 whitespace-nowrap">
                          @if (acc.electricityTariffType === 'dual') {
                            <div class="font-mono text-xs">
                              <span class="text-amber-600 font-bold">День (Т1):</span> {{ r.readingT1 }}
                            </div>
                            <div class="font-mono text-xs">
                              <span class="text-indigo-600 font-bold">Ніч (Т2):</span> {{ r.readingT2 }}
                            </div>
                          } @else {
                            <div class="font-mono text-xs font-bold text-slate-900">
                              {{ r.readingT1 }} кВт·г
                            </div>
                          }
                        </td>

                        <!-- Consumption -->
                        <td class="py-3 px-3.5 whitespace-nowrap">
                          <div class="font-bold text-slate-900 text-sm">
                            {{ totalConsumedKwh(r) }} <span class="text-2xs font-normal text-slate-500">кВт·г</span>
                          </div>
                          @if (acc.electricityTariffType === 'dual') {
                            <div class="text-3xs text-slate-500">
                              Т1: {{ r.consumptionT1 || 0 }} • Т2: {{ r.consumptionT2 || 0 }}
                            </div>
                          }
                          @if (r.dailyAvgConsumption && r.dailyAvgConsumption > 0) {
                            <div class="text-3xs text-emerald-600 font-medium">
                              ~{{ r.dailyAvgConsumption }} кВт·г/добу
                            </div>
                          }
                        </td>

                        <!-- Rates -->
                        <td class="py-3 px-3.5 whitespace-nowrap">
                          @if (r.isControlOnly) {
                            <span class="text-2xs text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded font-medium border border-indigo-200/60 inline-flex items-center gap-1">
                              <mat-icon class="text-3xs">query_stats</mat-icon> Тільки контроль
                            </span>
                          } @else if (acc.electricityTariffType === 'dual') {
                            <div class="text-2xs text-slate-600">
                              Д: {{ r.rateT1 || '—' }} / Н: {{ r.rateT2 || '—' }}
                            </div>
                            <div class="flex items-center gap-1.5 mt-0.5">
                              <span class="text-3xs uppercase font-semibold" [class.text-indigo-600]="r.season === 'winter'" [class.text-amber-600]="r.season === 'summer'">
                                {{ r.season === 'summer' ? 'Літо' : 'Зима' }}
                              </span>
                              @if (isWinterLimitExceededReading(r)) {
                                <button
                                  type="button"
                                  (click)="showReadingBreakdown(r)"
                                  class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-3xs font-bold bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200 transition-colors"
                                  title="Перевищено зимовий ліміт 2000 кВт·г. Натисніть для перегляду пропорційного розрахунку"
                                >
                                  <span>❄️ >2000 кВт·г</span>
                                  <mat-icon class="text-xs leading-none">info</mat-icon>
                                </button>
                              }
                            </div>
                          } @else {
                            <span class="text-xs font-semibold text-slate-700">
                              {{ r.rateT1 || currentSingleRate() }} грн
                            </span>
                          }
                        </td>

                        <!-- Total Cost -->
                        <td class="py-3 px-3.5 whitespace-nowrap">
                          @if (r.isControlOnly) {
                            <span class="font-semibold text-slate-400 text-sm">
                              0.00 грн
                            </span>
                            <div class="text-3xs text-indigo-600 font-medium">Без оплати</div>
                          } @else {
                            <span class="font-bold text-slate-900 text-sm">
                              {{ r.totalCost.toFixed(2) }} грн
                            </span>
                          }
                          @if (r.note) {
                            <div class="text-3xs text-slate-400 max-w-xs truncate" [title]="r.note">{{ r.note }}</div>
                          }
                        </td>

                        <!-- Status & Pay Toggle -->
                        <td class="py-3 px-3.5 whitespace-nowrap">
                          @if (r.isControlOnly) {
                            <span class="px-2.5 py-1 rounded-full text-2xs font-semibold bg-slate-100 text-slate-600 inline-flex items-center gap-1 border border-slate-200">
                              <mat-icon class="text-xs leading-none">visibility</mat-icon>
                              <span>Моніторинг</span>
                            </span>
                          } @else if (canEdit()) {
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
                              (click)="openEditReadingModal(r)"
                              class="p-1 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer mr-1"
                              title="Редагувати запис"
                            >
                              <mat-icon class="text-base leading-none">edit</mat-icon>
                            </button>
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
                <div class="text-xs font-semibold text-slate-600">Записів за обраним фільтром не знайдено</div>
                <p class="text-3xs text-slate-400 mt-0.5">Внесіть перші дані лічильника вручну або сфотографуйте табло.</p>
                @if (canEdit()) {
                  <div class="flex items-center justify-center gap-2 mt-3">
                    <button
                      type="button"
                      (click)="openReadingModal(false)"
                      class="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <mat-icon class="text-base leading-none">add</mat-icon>
                      <span>Внести покази</span>
                    </button>
                    <button
                      type="button"
                      (click)="openCameraModal()"
                      class="px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-50 border border-amber-300 text-amber-900 hover:bg-amber-100 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <mat-icon class="text-base text-amber-600 leading-none">photo_camera</mat-icon>
                      <span>Зробити фото</span>
                    </button>
                  </div>
                }
              </div>
            }
          </div>
        }
      }
    </div>

    <!-- ======================================================== -->
    <!-- MODAL: ADD / EDIT UTILITY ACCOUNT                        -->
    <!-- ======================================================== -->
    @if (isAccountModalOpen()) {
      <div class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs p-2 sm:p-4 flex items-center justify-center">
        <div class="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[calc(100dvh-2rem)] animate-in fade-in zoom-in-95 duration-150 my-auto">
          <!-- Pinned Header -->
          <div class="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 bg-slate-50 shrink-0">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                <mat-icon>bolt</mat-icon>
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
              <mat-icon class="text-lg">close</mat-icon>
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

              <!-- Address -->
              <div>
                <label for="acc-addr" class="block text-xs font-semibold text-slate-700 mb-1">
                  Адреса об'єкта
                </label>
                <input
                  id="acc-addr"
                  type="text"
                  formControlName="address"
                  placeholder="м. Київ, вул. Хрещатик, буд. 1, кв. 10"
                  class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500"
                />
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
                      {{ accountForm.get('electricityTariffType')?.value === 'dual' ? 'Початковий День (Т1)' : 'Початковий показник' }}
                    </label>
                    <input
                      id="acc-t1"
                      type="number"
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
                        Початковий Ніч (Т2)
                      </label>
                      <input
                        id="acc-t2"
                        type="number"
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
    }

    <!-- ======================================================== -->
    <!-- MODAL: ADD NEW METER READINGS (BILLING OR CONTROL)       -->
    <!-- ======================================================== -->
    @if (isReadingModalOpen()) {
      <div class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs p-2 sm:p-4 flex items-center justify-center">
        <div class="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[calc(100dvh-2rem)] animate-in fade-in zoom-in-95 duration-150 my-auto">
          <!-- Pinned Header -->
          <div class="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 bg-slate-50 shrink-0">
            <div class="flex items-center gap-2.5">
              <div
                class="w-9 h-9 rounded-xl text-white flex items-center justify-center shrink-0"
                [class.bg-amber-500]="!readingForm.get('isControlOnly')?.value"
                [class.bg-indigo-600]="readingForm.get('isControlOnly')?.value"
              >
                <mat-icon>{{ readingForm.get('isControlOnly')?.value ? 'visibility' : 'speed' }}</mat-icon>
              </div>
              <div>
                <h3 class="text-base font-bold text-slate-900">
                  @if (editingReadingId()) {
                    {{ readingForm.get('isControlOnly')?.value ? 'Редагувати контрольний замір' : 'Редагувати показник лічильника' }}
                  } @else {
                    {{ readingForm.get('isControlOnly')?.value ? 'Контрольний замір електроенергії' : 'Внесення показів електроенергії' }}
                  }
                </h3>
                <p class="text-2xs text-slate-500">{{ currentAccount()?.name }} • Особовий № {{ currentAccount()?.accountNumber }}</p>
              </div>
            </div>
            <button
              type="button"
              (click)="closeReadingModal()"
              class="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center cursor-pointer transition-colors"
            >
              <mat-icon class="text-lg">close</mat-icon>
            </button>
          </div>

          <!-- Form with scrollable body and pinned footer -->
          <form [formGroup]="readingForm" (ngSubmit)="saveReading()" class="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div class="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 overscroll-contain">
              <!-- Purpose Switcher: Billing vs Control Only -->
              <div class="space-y-1.5">
                <span class="block text-xs font-semibold text-slate-700">Призначення показу *</span>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label
                    class="p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all"
                    [class.border-amber-500]="!readingForm.get('isControlOnly')?.value"
                    [class.bg-amber-50/70]="!readingForm.get('isControlOnly')?.value"
                    [class.border-slate-200]="readingForm.get('isControlOnly')?.value"
                  >
                    <input
                      type="radio"
                      [value]="false"
                      formControlName="isControlOnly"
                      (change)="recalculateFormCost()"
                      class="mt-0.5 text-amber-500 focus:ring-amber-500"
                    />
                    <div>
                      <div class="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <span>⚡ Розрахунковий</span>
                        <span class="text-3xs text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded font-bold">Для оплати</span>
                      </div>
                      <div class="text-3xs text-slate-500 mt-0.5">Офіційний білінг та нарахування до сплати</div>
                    </div>
                  </label>

                  <label
                    class="p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all"
                    [class.border-indigo-500]="readingForm.get('isControlOnly')?.value"
                    [class.bg-indigo-50/70]="readingForm.get('isControlOnly')?.value"
                    [class.border-slate-200]="!readingForm.get('isControlOnly')?.value"
                  >
                    <input
                      type="radio"
                      [value]="true"
                      formControlName="isControlOnly"
                      (change)="recalculateFormCost()"
                      class="mt-0.5 text-indigo-600 focus:ring-indigo-600"
                    />
                    <div>
                      <div class="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <span>👁️ Контрольний</span>
                        <span class="text-3xs text-indigo-800 bg-indigo-100 px-1.5 py-0.2 rounded font-bold">Без оплати</span>
                      </div>
                      <div class="text-3xs text-slate-500 mt-0.5">Для аналізу тенденцій та середньодобового темпу</div>
                    </div>
                  </label>
                </div>
              </div>

              <!-- Informational Banner for Control Readings -->
              @if (readingForm.get('isControlOnly')?.value) {
                <div class="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs flex items-start gap-2">
                  <mat-icon class="text-indigo-600 shrink-0 text-base">info</mat-icon>
                  <div class="text-2xs leading-relaxed">
                    <strong>Контрольний показник:</strong> використовується виключно для графіків, відстеження тенденцій та розрахунку середньодобового темпу споживання. <strong>Плата не нараховується (0.00 грн)</strong>, а наступний розрахунковий показник автоматично охопить весь обсяг з моменту останньої оплати.
                  </div>
                </div>
              }

              <!-- Reading Date -->
              <div>
                <label for="read-date" class="block text-xs font-semibold text-slate-700 mb-1">
                  Дата зняття показів *
                </label>
                <input
                  id="read-date"
                  type="date"
                  formControlName="date"
                  (change)="recalculateFormCost()"
                  class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-amber-500"
                />
              </div>

              <!-- Current Account Tariff Details & Previous Readings -->
              <div
                class="p-3 border rounded-xl space-y-1 text-xs"
                [class.bg-amber-50/70]="!readingForm.get('isControlOnly')?.value"
                [class.border-amber-200/80]="!readingForm.get('isControlOnly')?.value"
                [class.bg-indigo-50/70]="readingForm.get('isControlOnly')?.value"
                [class.border-indigo-200/80]="readingForm.get('isControlOnly')?.value"
              >
                <div class="flex items-center justify-between text-3xs uppercase tracking-wider font-bold">
                  <span [class.text-amber-900]="!readingForm.get('isControlOnly')?.value" [class.text-indigo-900]="readingForm.get('isControlOnly')?.value">
                    {{ readingForm.get('isControlOnly')?.value ? 'Попередні покази для розрахунку темпу:' : 'Попередній розрахунковий показник:' }}
                  </span>
                  @if (!readingForm.get('isControlOnly')?.value) {
                    <span class="text-purple-700 font-semibold">{{ calculatedSeason() === 'summer' ? 'Літній сезон (01.05 – 30.09)' : 'Зимовий сезон (01.10 – 30.04)' }}</span>
                  }
                </div>
                <div class="text-xs font-mono font-medium" [class.text-amber-950]="!readingForm.get('isControlOnly')?.value" [class.text-indigo-950]="readingForm.get('isControlOnly')?.value">
                  @if (currentAccount()?.electricityTariffType === 'dual') {
                    День (Т1): <span class="font-bold">{{ activePrevT1() }}</span> кВт·г • Ніч (Т2): <span class="font-bold">{{ activePrevT2() }}</span> кВт·г
                  } @else {
                    Попередній: <span class="font-bold">{{ activePrevT1() }}</span> кВт·г
                  }
                </div>
              </div>

              <!-- Current Reading Section Header with Camera Action -->
              <div class="flex items-center justify-between pb-0.5">
                <span class="text-xs font-bold text-slate-800">Поточні покази лічильника:</span>
                <button
                  type="button"
                  (click)="openCameraModal()"
                  class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 transition-colors cursor-pointer shadow-2xs"
                  title="Сфотографувати лічильник для автоматичного заповнення"
                >
                  <mat-icon class="text-sm text-amber-600 leading-none">photo_camera</mat-icon>
                  <span>Зробити фото</span>
                </button>
              </div>

              <!-- Meter Reading Inputs -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label for="read-t1" class="block text-xs font-semibold text-slate-700 mb-1">
                    {{ currentAccount()?.electricityTariffType === 'dual' ? 'Показник День (Т1) *' : 'Показник лічильника *' }}
                  </label>
                  <input
                    id="read-t1"
                    type="number"
                    step="0.1"
                    min="0"
                    formControlName="readingT1"
                    (input)="recalculateFormCost()"
                    placeholder="Введіть число"
                    class="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-mono font-extrabold text-slate-900 focus:outline-none focus:border-amber-500"
                  />
                </div>

                @if (currentAccount()?.electricityTariffType === 'dual') {
                  <div>
                    <label for="read-t2" class="block text-xs font-semibold text-slate-700 mb-1">
                      Показник Ніч (Т2) *
                    </label>
                    <input
                      id="read-t2"
                      type="number"
                      step="0.1"
                      min="0"
                      formControlName="readingT2"
                      (input)="recalculateFormCost()"
                      placeholder="Введіть число"
                      class="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-mono font-extrabold text-slate-900 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                }
              </div>

              <!-- Live Calculation Summary Card -->
              <div class="p-4 rounded-xl bg-slate-900 text-white space-y-2.5 shadow-sm">
                <div class="text-3xs uppercase tracking-wider text-slate-400 font-semibold flex items-center justify-between">
                  <span>{{ readingForm.get('isControlOnly')?.value ? 'Контрольний розрахунок темпу' : 'Автоматичний розрахунок нарахування' }}</span>
                  @if (!readingForm.get('isControlOnly')?.value) {
                    <span class="text-amber-400 font-bold">Тариф: {{ calculatedRatesText() }}</span>
                  } @else {
                    <span class="text-indigo-300 font-bold">Без нарахування оплати</span>
                  }
                </div>

                <div class="flex items-center justify-between pt-1 border-t border-slate-800">
                  <span class="text-xs text-slate-300">Споживання за період:</span>
                  <span class="text-xs font-mono font-bold text-amber-300">
                    {{ formConsumedKwhText() }}
                  </span>
                </div>

                <div class="flex items-center justify-between pt-1 border-t border-slate-800">
                  <span class="text-sm font-bold text-white">До сплати:</span>
                  @if (readingForm.get('isControlOnly')?.value) {
                    <span class="text-base font-mono font-bold text-indigo-300">
                      0.00 грн (тільки аналіз)
                    </span>
                  } @else {
                    <span class="text-lg font-mono font-extrabold text-emerald-400">
                      {{ formTotalCost().toFixed(2) }} грн
                    </span>
                  }
                </div>
              </div>

              <!-- Winter Consumption Limit Exceeded Breakdown Card -->
              @if (!readingForm.get('isControlOnly')?.value && formCalculationResult(); as calc) {
                @if (calc.isWinterExceeded) {
                  <div class="p-3.5 rounded-xl bg-indigo-950/90 border border-indigo-500/40 text-indigo-100 space-y-2.5 text-xs shadow-sm animate-in fade-in duration-200">
                    <div class="flex items-center justify-between pb-2 border-b border-indigo-800/60">
                      <div class="flex items-center gap-1.5 font-bold text-amber-300">
                        <mat-icon class="text-base text-amber-400">warning_amber</mat-icon>
                        <span>Перевищення зимового ліміту {{ calc.winterLimitKwh }} кВт·г</span>
                      </div>
                      <span class="px-2 py-0.5 rounded text-3xs font-mono font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30">
                        +{{ calc.excessKwh?.toFixed(1) }} кВт·г понад норму
                      </span>
                    </div>

                    <div class="text-3xs text-indigo-200">
                      Розподіл день/ніч пропорційно споживанню: <span class="font-bold text-white">Т1 (День) {{ calc.ratioDay }}%</span>, <span class="font-bold text-white">Т2 (Ніч) {{ calc.ratioNight }}%</span>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-2xs">
                      <!-- Winter portion -->
                      <div class="p-2.5 rounded-lg bg-indigo-900/60 border border-indigo-700/50 space-y-1">
                        <div class="font-bold text-indigo-300 flex items-center justify-between">
                          <span>❄️ До {{ calc.winterLimitKwh }} кВт·г (зимовий):</span>
                          <span class="font-mono text-white">{{ calc.winterTotalCost?.toFixed(2) }} грн</span>
                        </div>
                        <div class="text-slate-300 font-mono text-3xs">
                          День: {{ calc.winterDayKwh?.toFixed(1) }} кВт·г × {{ currentDualRates().winterDay }} грн
                        </div>
                        <div class="text-slate-300 font-mono text-3xs">
                          Ніч: {{ calc.winterNightKwh?.toFixed(1) }} кВт·г × {{ currentDualRates().winterNight }} грн
                        </div>
                      </div>

                      <!-- Summer portion (excess) -->
                      <div class="p-2.5 rounded-lg bg-amber-950/60 border border-amber-700/50 space-y-1">
                        <div class="font-bold text-amber-300 flex items-center justify-between">
                          <span>☀️ Понад {{ calc.winterLimitKwh }} кВт·г (літній):</span>
                          <span class="font-mono text-white">{{ calc.summerTotalCost?.toFixed(2) }} грн</span>
                        </div>
                        <div class="text-amber-200/90 font-mono text-3xs">
                          День: {{ calc.summerDayKwh?.toFixed(1) }} кВт·г × {{ currentDualRates().summerDay }} грн
                        </div>
                        <div class="text-amber-200/90 font-mono text-3xs">
                          Ніч: {{ calc.summerNightKwh?.toFixed(1) }} кВт·г × {{ currentDualRates().summerNight }} грн
                        </div>
                      </div>
                    </div>
                  </div>
                }
              }

              <!-- Payment status checkbox (Only for billing readings) -->
              @if (!readingForm.get('isControlOnly')?.value) {
                <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                  <div>
                    <label for="read-ispaid" class="text-xs font-bold text-slate-900 block cursor-pointer">
                      Позначити одразу як сплачено
                    </label>
                    <span class="text-3xs text-slate-500">Встановлює статус сплати для даного рахунку</span>
                  </div>
                  <input
                    id="read-ispaid"
                    type="checkbox"
                    formControlName="isPaid"
                    class="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 cursor-pointer"
                  />
                </div>
              }

              <!-- Note -->
              <div>
                <label for="read-note" class="block text-xs font-semibold text-slate-700 mb-1">
                  Примітка (необов'язково)
                </label>
                <input
                  id="read-note"
                  type="text"
                  formControlName="note"
                  placeholder="Наприклад: Контрольна перевірка, або Оплачено через Приват24"
                  class="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <!-- Pinned Footer -->
            <div class="flex items-center justify-end gap-2.5 p-4 border-t border-slate-200 bg-slate-50/90 shrink-0">
              <button
                type="button"
                (click)="closeReadingModal()"
                class="px-4 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Скасувати
              </button>
              <button
                type="submit"
                [disabled]="readingForm.invalid || isSubmitting()"
                class="px-4 py-2 rounded-xl text-xs font-semibold text-white transition-colors cursor-pointer disabled:opacity-50"
                [class.bg-amber-500]="!readingForm.get('isControlOnly')?.value"
                [class.hover:bg-amber-600]="!readingForm.get('isControlOnly')?.value"
                [class.bg-indigo-600]="readingForm.get('isControlOnly')?.value"
                [class.hover:bg-indigo-700]="readingForm.get('isControlOnly')?.value"
              >
                @if (editingReadingId()) {
                  Зберегти зміни
                } @else if (readingForm.get('isControlOnly')?.value) {
                  Зберегти контрольний замір
                } @else {
                  Зафіксувати покази
                }
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- ======================================================== -->
    <!-- MODAL: READING BREAKDOWN DETAILS                         -->
    <!-- ======================================================== -->
    @if (selectedReadingForBreakdown(); as sel) {
      @let bDown = getReadingBreakdown(sel);
      <div class="fixed inset-0 z-50 overflow-y-auto p-3 sm:p-4 flex items-center justify-center">
        <!-- Backdrop button for closing -->
        <button
          type="button"
          aria-label="Закрити вікно деталей"
          class="fixed inset-0 w-full h-full bg-slate-900/60 backdrop-blur-xs cursor-default -z-10"
          (click)="closeReadingBreakdown()"
        ></button>

        <div class="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto flex flex-col max-h-[92dvh] animate-in fade-in zoom-in-95 duration-150">
          <!-- Header -->
          <div class="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/80 shrink-0">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <mat-icon class="text-lg">calculate</mat-icon>
              </div>
              <div>
                <h3 class="text-sm font-bold text-slate-900">Деталізація нарахування за електроенергію</h3>
                <p class="text-3xs text-slate-500">Дата: {{ formatDate(sel.date) }} • {{ currentAccount()?.name }}</p>
              </div>
            </div>
            <button
              type="button"
              (click)="closeReadingBreakdown()"
              class="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors"
            >
              <mat-icon class="text-base">close</mat-icon>
            </button>
          </div>

          <!-- Body -->
          <div class="p-5 space-y-4 overflow-y-auto">
            <!-- Alert badge if exceeded -->
            @if (bDown.isWinterExceeded) {
              <div class="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                <mat-icon class="text-amber-600 shrink-0 text-lg">warning</mat-icon>
                <div>
                  <div class="font-bold">Зимове споживання понад норму {{ bDown.winterLimitKwh }} кВт·г</div>
                  <div class="text-3xs text-amber-800 mt-0.5">
                    Загальне споживання: <span class="font-bold">{{ bDown.totalKwh }} кВт·г</span>.
                    Зимовий тариф діє на перші <span class="font-bold">{{ bDown.winterLimitKwh }} кВт·г</span>, а все що понад норму (<span class="font-bold">{{ bDown.excessKwh }} кВт·г</span>) розраховано за літнім тарифом. День/ніч розподілено строго пропорційно (Т1: {{ bDown.ratioDay }}%, Т2: {{ bDown.ratioNight }}%).
                  </div>
                </div>
              </div>
            }

            <!-- Consumption Summary -->
            <div class="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <div>
                <span class="text-3xs text-slate-500 block">Т1 (Денне споживання):</span>
                <span class="font-bold text-slate-900 font-mono">{{ bDown.diff1 }} кВт·г</span>
              </div>
              <div>
                <span class="text-3xs text-slate-500 block">Т2 (Нічне споживання):</span>
                <span class="font-bold text-slate-900 font-mono">{{ bDown.diff2 }} кВт·г</span>
              </div>
            </div>

            <!-- Calculation sections -->
            @if (bDown.isWinterExceeded) {
              <div class="space-y-3">
                <!-- Winter Block -->
                <div class="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200 space-y-2">
                  <div class="flex items-center justify-between text-xs font-bold text-indigo-950 pb-1.5 border-b border-indigo-200/80">
                    <span class="flex items-center gap-1.5">
                      <mat-icon class="text-sm text-indigo-600">ac_unit</mat-icon>
                      Зимовий тариф (до {{ bDown.winterLimitKwh }} кВт·г)
                    </span>
                    <span class="font-mono">{{ bDown.winterTotalCost?.toFixed(2) }} грн</span>
                  </div>
                  <div class="text-2xs text-indigo-900 space-y-1">
                    <div class="flex justify-between">
                      <span>День ({{ bDown.winterDayKwh }} кВт·г × {{ currentDualRates().winterDay }} грн):</span>
                      <span class="font-mono font-semibold">{{ bDown.winterDayCost?.toFixed(2) }} грн</span>
                    </div>
                    <div class="flex justify-between">
                      <span>Ніч ({{ bDown.winterNightKwh }} кВт·г × {{ currentDualRates().winterNight }} грн):</span>
                      <span class="font-mono font-semibold">{{ bDown.winterNightCost?.toFixed(2) }} грн</span>
                    </div>
                  </div>
                </div>

                <!-- Summer Block -->
                <div class="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2">
                  <div class="flex items-center justify-between text-xs font-bold text-amber-950 pb-1.5 border-b border-amber-200/80">
                    <span class="flex items-center gap-1.5">
                      <mat-icon class="text-sm text-amber-600">wb_sunny</mat-icon>
                      Літній тариф (понад норму {{ bDown.excessKwh }} кВт·г)
                    </span>
                    <span class="font-mono">{{ bDown.summerTotalCost?.toFixed(2) }} грн</span>
                  </div>
                  <div class="text-2xs text-amber-900 space-y-1">
                    <div class="flex justify-between">
                      <span>День ({{ bDown.summerDayKwh }} кВт·г × {{ currentDualRates().summerDay }} грн):</span>
                      <span class="font-mono font-semibold">{{ bDown.summerDayCost?.toFixed(2) }} грн</span>
                    </div>
                    <div class="flex justify-between">
                      <span>Ніч ({{ bDown.summerNightKwh }} кВт·г × {{ currentDualRates().summerNight }} грн):</span>
                      <span class="font-mono font-semibold">{{ bDown.summerNightCost?.toFixed(2) }} грн</span>
                    </div>
                  </div>
                </div>
              </div>
            }

            <!-- Final total box -->
            <div class="p-3.5 rounded-xl bg-slate-900 text-white flex items-center justify-between">
              <div>
                <span class="text-3xs text-slate-400 uppercase tracking-wider block">Загальна сума до сплати</span>
                <span class="text-xs text-slate-300">Спожито {{ bDown.totalKwh }} кВт·г</span>
              </div>
              <span class="text-xl font-mono font-extrabold text-emerald-400">
                {{ sel.totalCost.toFixed(2) }} грн
              </span>
            </div>

            @if (sel.note) {
              <div class="text-2xs text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span class="font-bold text-slate-700 block mb-0.5">Примітка до запису:</span>
                {{ sel.note }}
              </div>
            }
          </div>

          <!-- Footer -->
          <div class="px-5 py-3 border-t border-slate-100 bg-slate-50/80 flex justify-end shrink-0">
            <button
              type="button"
              (click)="closeReadingBreakdown()"
              class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition-colors"
            >
              Закрити
            </button>
          </div>
        </div>
      </div>
    }

    <!-- ======================================================== -->
    <!-- MODAL: CAMERA SCANNER MODAL                              -->
    <!-- ======================================================== -->
    @if (isCameraModalOpen()) {
      <app-meter-camera-modal
        utilityType="electricity"
        [electricityTariffType]="currentAccount()?.electricityTariffType || 'single'"
        [accountName]="currentAccount()?.name || 'Електроенергія'"
        (closeModal)="closeCameraModal()"
        (readingApplied)="onCameraReadingApplied($event)"
      />
    }
  `,
})
export class ElectricityView {
  readonly dataService = inject(IptvData);

  readonly canEdit = this.dataService.canEdit;
  readonly electricityAccounts = this.dataService.electricityAccounts;
  readonly utilityTariffs = this.dataService.utilityTariffs;

  readonly selectedAccountId = signal<string>('');
  readonly activeTab = signal<'table' | 'analytics'>('table');
  readonly filterPurpose = signal<'all' | 'billing' | 'control'>('all');

  readonly isAccountModalOpen = signal<boolean>(false);
  readonly editingAccount = signal<UtilityAccount | null>(null);

  readonly isReadingModalOpen = signal<boolean>(false);
  readonly editingReadingId = signal<string | null>(null);
  readonly formChangeTrigger = signal<number>(0);
  readonly isCameraModalOpen = signal<boolean>(false);
  readonly isSubmitting = signal<boolean>(false);

  // Form calculated cost
  readonly formTotalCost = signal<number>(0);
  readonly calculatedSeason = signal<'summer' | 'winter'>('summer');
  readonly formCalculationResult = signal<ElectricityCostResult | null>(null);
  readonly selectedReadingForBreakdown = signal<UtilityReading | null>(null);

  readonly accountForm = new FormGroup({
    name: new FormControl('', [Validators.required]),
    accountNumber: new FormControl('', [Validators.required]),
    address: new FormControl(''),
    meterNumber: new FormControl(''),
    electricityTariffType: new FormControl<'single' | 'dual'>('single', [Validators.required]),
    initialReadingT1: new FormControl<number>(0),
    initialReadingT2: new FormControl<number>(0),
    notes: new FormControl(''),
  });

  readonly readingForm = new FormGroup({
    date: new FormControl(new Date().toISOString().split('T')[0], [Validators.required]),
    readingT1: new FormControl<number | null>(null, [Validators.required]),
    readingT2: new FormControl<number | null>(null),
    isControlOnly: new FormControl<boolean>(false),
    isPaid: new FormControl<boolean>(false),
    note: new FormControl(''),
  });

  constructor() {
    // Select first account if none selected
    const accounts = this.electricityAccounts();
    if (accounts.length > 0 && !this.selectedAccountId()) {
      this.selectedAccountId.set(accounts[0].id);
    }
  }

  readonly currentAccount = computed<UtilityAccount | null>(() => {
    const list = this.electricityAccounts();
    if (list.length === 0) return null;
    const selected = list.find((a) => a.id === this.selectedAccountId());
    return selected || list[0];
  });

  readonly accountReadings = computed<UtilityReading[]>(() => {
    const acc = this.currentAccount();
    if (!acc) return [];
    return this.dataService
      .utilityReadings()
      .filter((r) => r.accountId === acc.id)
      .sort((a, b) => b.date.localeCompare(a.date));
  });

  readonly filteredAccountReadings = computed<UtilityReading[]>(() => {
    const list = this.accountReadings();
    const filter = this.filterPurpose();
    if (filter === 'billing') return list.filter((r) => !r.isControlOnly);
    if (filter === 'control') return list.filter((r) => r.isControlOnly);
    return list;
  });

  readonly billingReadingsCount = computed<number>(() => {
    return this.accountReadings().filter((r) => !r.isControlOnly).length;
  });

  readonly controlReadingsCount = computed<number>(() => {
    return this.accountReadings().filter((r) => r.isControlOnly).length;
  });

  readonly latestAnyReading = computed<UtilityReading | null>(() => {
    const list = this.accountReadings();
    return list.length > 0 ? list[0] : null;
  });

  readonly latestBillingReading = computed<UtilityReading | null>(() => {
    const list = this.accountReadings().filter((r) => !r.isControlOnly);
    return list.length > 0 ? list[0] : null;
  });

  readonly prevBillingT1 = computed<number>(() => {
    const latest = this.latestBillingReading();
    if (latest && latest.readingT1 !== undefined && latest.readingT1 !== null) {
      return latest.readingT1;
    }
    const acc = this.currentAccount();
    return acc ? (acc.initialReadingT1 || 0) : 0;
  });

  readonly prevBillingT2 = computed<number>(() => {
    const latest = this.latestBillingReading();
    if (latest && latest.readingT2 !== undefined && latest.readingT2 !== null) {
      return latest.readingT2;
    }
    const acc = this.currentAccount();
    return acc ? (acc.initialReadingT2 || 0) : 0;
  });

  readonly prevAnyT1 = computed<number>(() => {
    const latest = this.latestAnyReading();
    if (latest && latest.readingT1 !== undefined && latest.readingT1 !== null) {
      return latest.readingT1;
    }
    const acc = this.currentAccount();
    return acc ? (acc.initialReadingT1 || 0) : 0;
  });

  readonly prevAnyT2 = computed<number>(() => {
    const latest = this.latestAnyReading();
    if (latest && latest.readingT2 !== undefined && latest.readingT2 !== null) {
      return latest.readingT2;
    }
    const acc = this.currentAccount();
    return acc ? (acc.initialReadingT2 || 0) : 0;
  });

  getEffectivePrevReading(isControl: boolean, targetDate: string, excludeId?: string | null): { t1: number; t2: number; prevDate?: string } {
    const acc = this.currentAccount();
    if (!acc) return { t1: 0, t2: 0 };

    const list = this.accountReadings()
      .filter((r) => (!excludeId || r.id !== excludeId) && (!isControl ? !r.isControlOnly : true))
      .filter((r) => r.date <= targetDate)
      .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));

    const prior = list[0];
    if (prior) {
      return {
        t1: prior.readingT1 ?? acc.initialReadingT1 ?? 0,
        t2: prior.readingT2 ?? acc.initialReadingT2 ?? 0,
        prevDate: prior.date,
      };
    }

    return {
      t1: acc.initialReadingT1 ?? 0,
      t2: acc.initialReadingT2 ?? 0,
    };
  }

  readonly activePrevT1 = computed<number>(() => {
    this.formChangeTrigger();
    const isControl = Boolean(this.readingForm.get('isControlOnly')?.value);
    const date = this.readingForm.get('date')?.value || new Date().toISOString().split('T')[0];
    const editId = this.editingReadingId();
    return this.getEffectivePrevReading(isControl, date, editId).t1;
  });

  readonly activePrevT2 = computed<number>(() => {
    this.formChangeTrigger();
    const isControl = Boolean(this.readingForm.get('isControlOnly')?.value);
    const date = this.readingForm.get('date')?.value || new Date().toISOString().split('T')[0];
    const editId = this.editingReadingId();
    return this.getEffectivePrevReading(isControl, date, editId).t2;
  });

  readonly currentSingleRate = computed<number>(() => {
    const tariffs = this.utilityTariffs();
    const today = new Date().toISOString().split('T')[0];
    return resolveElectricitySingleRate(today, tariffs);
  });

  readonly currentDualRates = computed(() => {
    const tariffs = this.utilityTariffs();
    const today = new Date().toISOString().split('T')[0];
    return resolveElectricityDualRates(today, tariffs);
  });

  // Recharts timeline series
  readonly electricityTimelineData = computed<ElectricityTimelinePoint[]>(() => {
    const readings = [...this.accountReadings()].sort((a, b) => a.date.localeCompare(b.date));
    const acc = this.currentAccount();
    if (!acc || readings.length === 0) return [];

    const isDual = acc.electricityTariffType === 'dual';
    const result: ElectricityTimelinePoint[] = [];

    let lastAnyT1 = acc.initialReadingT1 || 0;
    let lastAnyT2 = acc.initialReadingT2 || 0;
    let lastDate = readings[0].date;

    for (let i = 0; i < readings.length; i++) {
      const r = readings[i];
      const curT1 = r.readingT1 !== undefined ? r.readingT1 : lastAnyT1;
      const curT2 = r.readingT2 !== undefined ? r.readingT2 : lastAnyT2;

      const consT1 = r.consumptionT1 !== undefined ? r.consumptionT1 : Math.max(0, curT1 - lastAnyT1);
      const consT2 = r.consumptionT2 !== undefined ? r.consumptionT2 : Math.max(0, curT2 - lastAnyT2);
      const totalCons = isDual ? Math.round((consT1 + consT2) * 10) / 10 : Math.round(consT1 * 10) / 10;

      const curMs = new Date(r.date).getTime();
      const prevMs = new Date(i === 0 ? r.date : lastDate).getTime();
      const diffDays = Math.max(1, Math.round((curMs - prevMs) / (1000 * 60 * 60 * 24)));
      const dailyRate = i === 0 ? 0 : Math.round((totalCons / diffDays) * 10) / 10;

      result.push({
        id: r.id,
        date: r.date,
        dateFormatted: formatDateUa(r.date, true),
        isControlOnly: Boolean(r.isControlOnly),
        isDual,
        readingT1: curT1,
        readingT2: isDual ? curT2 : undefined,
        consumptionT1: consT1,
        consumptionT2: isDual ? consT2 : undefined,
        totalConsumption: totalCons,
        cost: r.totalCost || 0,
        days: i === 0 ? 0 : diffDays,
        dailyRate,
      });

      lastAnyT1 = curT1;
      lastAnyT2 = curT2;
      lastDate = r.date;
    }

    return result;
  });

  // Recharts monthly aggregated data
  readonly electricityMonthlyData = computed<ElectricityMonthlySummary[]>(() => {
    const list = this.electricityTimelineData();
    const tariffs = this.utilityTariffs();
    const winterLimit = tariffs.electricityDual?.winterLimitKwh || 2000;
    const monthsMap = new Map<string, {
      totalKwh: number;
      dayKwh: number;
      nightKwh: number;
      totalCost: number;
      readingsCount: number;
      controlCount: number;
      billingCount: number;
    }>();

    for (const item of list) {
      const monthKey = item.date.substring(0, 7);
      const current = monthsMap.get(monthKey) || {
        totalKwh: 0,
        dayKwh: 0,
        nightKwh: 0,
        totalCost: 0,
        readingsCount: 0,
        controlCount: 0,
        billingCount: 0,
      };

      current.totalKwh += item.totalConsumption;
      current.dayKwh += item.consumptionT1;
      current.nightKwh += item.consumptionT2 || 0;
      current.totalCost += item.cost;
      current.readingsCount++;
      if (item.isControlOnly) {
        current.controlCount++;
      } else {
        current.billingCount++;
      }
      monthsMap.set(monthKey, current);
    }

    const monthNamesUa: Record<string, string> = {
      '01': 'Січень', '02': 'Лютий', '03': 'Березень', '04': 'Квітень',
      '05': 'Травень', '06': 'Червень', '07': 'Липень', '08': 'Серпень',
      '09': 'Вересень', '10': 'Жовтень', '11': 'Листопад', '12': 'Грудень',
    };
    const monthShortsUa: Record<string, string> = {
      '01': 'Січ', '02': 'Лют', '03': 'Бер', '04': 'Кві',
      '05': 'Тра', '06': 'Чер', '07': 'Лип', '08': 'Сер',
      '09': 'Вер', '10': 'Жов', '11': 'Лис', '12': 'Гру',
    };

    const sortedKeys = Array.from(monthsMap.keys()).sort();
    return sortedKeys.map((key) => {
      const parts = key.split('-');
      const y = parts[0];
      const m = parts[1];
      const data = monthsMap.get(key)!;
      const totalKwh = Math.round(data.totalKwh * 10) / 10;
      const nightKwh = Math.round(data.nightKwh * 10) / 10;
      const nightSharePct = totalKwh > 0 ? Math.round((nightKwh / totalKwh) * 100) : 0;
      const season = getSeasonForDate(`${key}-15`);

      return {
        monthKey: key,
        monthName: `${monthNamesUa[m] || m} ${y}`,
        monthShort: `${monthShortsUa[m] || m} ${y.substring(2)}`,
        totalKwh,
        dayKwh: Math.round(data.dayKwh * 10) / 10,
        nightKwh,
        totalCost: Math.round(data.totalCost * 100) / 100,
        readingsCount: data.readingsCount,
        controlCount: data.controlCount,
        billingCount: data.billingCount,
        nightSharePct,
        winterLimit,
        isWinterSeason: season === 'winter',
      };
    });
  });

  // Recharts KPIs & Insights
  readonly electricityStatsKPIs = computed<ElectricityStatsKPIs>(() => {
    const timeline = this.electricityTimelineData();
    const acc = this.currentAccount();
    const isDualTariff = acc?.electricityTariffType === 'dual';
    const tariffs = this.utilityTariffs();
    const winterLimitKwh = tariffs.electricityDual?.winterLimitKwh || 2000;

    let totalKwhAllTime = 0;
    let totalNightKwh = 0;
    let controlReadingsCount = 0;
    let billingReadingsCount = 0;

    for (const pt of timeline) {
      totalKwhAllTime += pt.totalConsumption;
      totalNightKwh += pt.consumptionT2 || 0;
      if (pt.isControlOnly) {
        controlReadingsCount++;
      } else {
        billingReadingsCount++;
      }
    }

    let avgDailyRateLatest = 0;
    for (let i = timeline.length - 1; i >= 0; i--) {
      if (timeline[i].dailyRate > 0) {
        avgDailyRateLatest = timeline[i].dailyRate;
        break;
      }
    }

    const nowMs = Date.now();
    const ms30Days = 30 * 24 * 60 * 60 * 1000;
    let kwhLast30 = 0;
    let daysLast30 = 0;
    for (const pt of timeline) {
      const ptMs = new Date(pt.date).getTime();
      if (nowMs - ptMs <= ms30Days && pt.days > 0) {
        kwhLast30 += pt.totalConsumption;
        daysLast30 += pt.days;
      }
    }
    const avgDailyRateMonth = daysLast30 > 0 ? Math.round((kwhLast30 / daysLast30) * 10) / 10 : avgDailyRateLatest;

    const effectiveDaily = avgDailyRateLatest > 0 ? avgDailyRateLatest : avgDailyRateMonth;
    const projectedMonthKwh = Math.round(effectiveDaily * 30.5 * 10) / 10;

    const dualRates = resolveElectricityDualRates(new Date().toISOString().split('T')[0], tariffs);
    const savingsPerKwh = Math.max(0, dualRates.dayRate - dualRates.nightRate);
    const nightSavingsUah = Math.round(totalNightKwh * savingsPerKwh * 100) / 100;

    return {
      totalKwhAllTime: Math.round(totalKwhAllTime * 10) / 10,
      avgDailyRateLatest,
      avgDailyRateMonth,
      projectedMonthKwh,
      nightSavingsUah,
      controlReadingsCount,
      billingReadingsCount,
      isDualTariff,
      winterLimitKwh,
    };
  });

  selectAccount(id: string): void {
    this.selectedAccountId.set(id);
  }

  formatDate(dateStr: string): string {
    return formatDateUa(dateStr, true);
  }

  totalConsumedKwh(r: UtilityReading): number {
    const t1 = Number(r.consumptionT1) || 0;
    const t2 = Number(r.consumptionT2) || 0;
    return Math.round((t1 + t2) * 10) / 10;
  }

  isWinterLimitExceededReading(r: UtilityReading): boolean {
    if (r.season !== 'winter') return false;
    const acc = this.currentAccount();
    if (acc?.electricityTariffType !== 'dual') return false;
    const total = this.totalConsumedKwh(r);
    const tariffs = this.utilityTariffs();
    const limit = tariffs.electricityDual?.winterLimitKwh ?? 2000;
    return total > limit;
  }

  showReadingBreakdown(r: UtilityReading): void {
    this.selectedReadingForBreakdown.set(r);
  }

  closeReadingBreakdown(): void {
    this.selectedReadingForBreakdown.set(null);
  }

  getReadingBreakdown(r: UtilityReading): ElectricityCostResult {
    const acc = this.currentAccount();
    const tariffs = this.utilityTariffs();
    const tariffType = acc?.electricityTariffType || 'single';
    const diff1 = Number(r.consumptionT1) || 0;
    const diff2 = r.consumptionT2 !== undefined ? Number(r.consumptionT2) : undefined;
    return calculateElectricityCost(r.date, diff1, diff2, tariffType, tariffs);
  }

  calculatedRatesText(): string {
    const acc = this.currentAccount();
    const tariffs = this.utilityTariffs();
    const date = this.readingForm.get('date')?.value || new Date().toISOString().split('T')[0];

    if (acc?.electricityTariffType === 'dual') {
      const dual = resolveElectricityDualRates(date, tariffs);
      const seasonText = dual.season === 'summer' ? 'Літо' : `Зима (ліміт ${dual.winterLimitKwh} кВт·г)`;
      return `Д: ${dual.dayRate} грн, Н: ${dual.nightRate} грн (${seasonText})`;
    } else {
      const single = resolveElectricitySingleRate(date, tariffs);
      return `${single} грн/кВт·г`;
    }
  }

  formConsumedKwhText(): string {
    const acc = this.currentAccount();
    const t1Val = Number(this.readingForm.get('readingT1')?.value) || 0;
    const prev1 = this.activePrevT1();
    const diff1 = Math.max(0, t1Val - prev1);

    if (acc?.electricityTariffType === 'dual') {
      const t2Val = Number(this.readingForm.get('readingT2')?.value) || 0;
      const prev2 = this.activePrevT2();
      const diff2 = Math.max(0, t2Val - prev2);
      return `Т1 (День): ${diff1.toFixed(1)} кВт·г • Т2 (Ніч): ${diff2.toFixed(1)} кВт·г (Всього: ${(diff1 + diff2).toFixed(1)})`;
    }

    return `${diff1.toFixed(1)} кВт·г`;
  }

  recalculateFormCost(): void {
    const acc = this.currentAccount();
    if (!acc) return;
    const tariffs = this.utilityTariffs();
    const date = this.readingForm.get('date')?.value || new Date().toISOString().split('T')[0];
    const season = getSeasonForDate(date);
    this.calculatedSeason.set(season);

    this.formChangeTrigger.update((v) => v + 1);

    const isControl = Boolean(this.readingForm.get('isControlOnly')?.value);
    const t1Val = Number(this.readingForm.get('readingT1')?.value) || 0;
    const prev1 = this.activePrevT1();
    const diff1 = Math.max(0, t1Val - prev1);

    let diff2: number | undefined;
    if (acc.electricityTariffType === 'dual') {
      const t2Val = Number(this.readingForm.get('readingT2')?.value) || 0;
      const prev2 = this.activePrevT2();
      diff2 = Math.max(0, t2Val - prev2);
    }

    if (isControl) {
      // Control only reading -> totalCost is 0, no billing calculation
      this.formCalculationResult.set(null);
      this.formTotalCost.set(0);
      return;
    }

    const calc = calculateElectricityCost(date, diff1, diff2, acc.electricityTariffType, tariffs);
    this.formCalculationResult.set(calc);
    this.formTotalCost.set(calc.totalCost);
  }

  openAccountModal(acc: UtilityAccount | null): void {
    this.editingAccount.set(acc);
    if (acc) {
      this.accountForm.patchValue({
        name: acc.name,
        accountNumber: acc.accountNumber,
        address: acc.address || '',
        meterNumber: acc.meterNumber || '',
        electricityTariffType: acc.electricityTariffType || 'single',
        initialReadingT1: acc.initialReadingT1 || 0,
        initialReadingT2: acc.initialReadingT2 || 0,
        notes: acc.notes || '',
      });
    } else {
      this.accountForm.reset({
        name: '',
        accountNumber: '',
        address: '',
        meterNumber: '',
        electricityTariffType: 'single',
        initialReadingT1: 0,
        initialReadingT2: 0,
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
        type: 'electricity',
        name: formVal.name?.trim() || '',
        accountNumber: formVal.accountNumber?.trim() || '',
        address: formVal.address?.trim() || '',
        meterNumber: formVal.meterNumber?.trim() || '',
        electricityTariffType: formVal.electricityTariffType || 'single',
        initialReadingT1: Number(formVal.initialReadingT1) || 0,
        initialReadingT2: Number(formVal.initialReadingT2) || 0,
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
    const ok = confirm(`Ви дійсно бажаєте видалити особовий рахунок «${acc.name}» (№ ${acc.accountNumber}) та всі зафіксовані по ньому покази?`);
    if (ok) {
      await this.dataService.deleteUtilityAccount(acc.id);
      const remaining = this.electricityAccounts();
      if (remaining.length > 0) {
        this.selectedAccountId.set(remaining[0].id);
      }
    }
  }

  openReadingModal(isControl = false): void {
    const acc = this.currentAccount();
    if (!acc) return;

    this.editingReadingId.set(null);
    this.readingForm.reset({
      date: new Date().toISOString().split('T')[0],
      readingT1: null,
      readingT2: null,
      isControlOnly: isControl,
      isPaid: false,
      note: isControl ? 'Контрольний замір для моніторингу' : '',
    });
    this.formChangeTrigger.update((v) => v + 1);
    this.recalculateFormCost();
    this.isReadingModalOpen.set(true);
  }

  openEditReadingModal(r: UtilityReading): void {
    const acc = this.currentAccount();
    if (!acc) return;

    this.editingReadingId.set(r.id);
    this.readingForm.reset({
      date: r.date,
      readingT1: r.readingT1,
      readingT2: r.readingT2 ?? null,
      isControlOnly: Boolean(r.isControlOnly),
      isPaid: Boolean(r.isPaid),
      note: r.note || '',
    });
    this.formChangeTrigger.update((v) => v + 1);
    this.recalculateFormCost();
    this.isReadingModalOpen.set(true);
  }

  openCameraModal(): void {
    const acc = this.currentAccount();
    if (!acc) return;
    this.isCameraModalOpen.set(true);
  }

  closeCameraModal(): void {
    this.isCameraModalOpen.set(false);
  }

  onCameraReadingApplied(applied: AppliedMeterReading): void {
    const acc = this.currentAccount();
    if (!acc) return;

    this.readingForm.patchValue({
      date: new Date().toISOString().split('T')[0],
      readingT1: applied.readingT1 !== undefined ? applied.readingT1 : null,
      readingT2: applied.readingT2 !== undefined ? applied.readingT2 : null,
      isControlOnly: false,
      isPaid: false,
      note: applied.note || 'Розпізнано за фото лічильника',
    });

    this.recalculateFormCost();
    this.isReadingModalOpen.set(true);
  }

  closeReadingModal(): void {
    this.isReadingModalOpen.set(false);
    this.editingReadingId.set(null);
  }

  async saveReading(): Promise<void> {
    const acc = this.currentAccount();
    if (!acc || this.readingForm.invalid) return;

    this.isSubmitting.set(true);
    try {
      const editId = this.editingReadingId();
      const formVal = this.readingForm.getRawValue();
      const date = formVal.date || new Date().toISOString().split('T')[0];
      const isControlOnly = Boolean(formVal.isControlOnly);
      const tariffs = this.utilityTariffs();

      const prev = this.getEffectivePrevReading(isControlOnly, date, editId);
      const t1Val = Number(formVal.readingT1) || 0;
      const diff1 = Math.max(0, t1Val - prev.t1);

      let t2Val: number | undefined;
      let diff2: number | undefined;
      if (acc.electricityTariffType === 'dual') {
        t2Val = Number(formVal.readingT2) || 0;
        diff2 = Math.max(0, t2Val - prev.t2);
      }

      // Elapsed days and daily pace calculation
      let daysSinceLast = 0;
      let dailyAvg = 0;
      if (prev.prevDate) {
        const curMs = new Date(date).getTime();
        const prevMs = new Date(prev.prevDate).getTime();
        daysSinceLast = Math.max(1, Math.round((curMs - prevMs) / (1000 * 60 * 60 * 24)));
        const totalDiff = acc.electricityTariffType === 'dual' ? diff1 + (diff2 || 0) : diff1;
        dailyAvg = Math.round((totalDiff / daysSinceLast) * 10) / 10;
      }

      let totalCost = 0;
      let rate1: number | undefined;
      let rate2: number | undefined;
      let season = getSeasonForDate(date);
      let readingNote = formVal.note?.trim() || '';

      if (isControlOnly) {
        totalCost = 0;
        readingNote = readingNote || 'Контрольний замір для моніторингу';
      } else {
        const calc = calculateElectricityCost(date, diff1, diff2, acc.electricityTariffType, tariffs);
        totalCost = calc.totalCost;
        rate1 = calc.rate1;
        rate2 = calc.rate2;
        season = calc.season;

        if (calc.isWinterExceeded) {
          const excessNote = `[Зима >${calc.winterLimitKwh} кВт·г: до ліміту ${calc.winterTotalCost?.toFixed(2)} грн, понад норму (${calc.excessKwh?.toFixed(1)} кВт·г) ${calc.summerTotalCost?.toFixed(2)} грн за літнім тарифом]`;
          if (!readingNote.includes('Зима >')) {
            readingNote = readingNote ? `${readingNote} ${excessNote}` : excessNote;
          }
        }
      }

      const reading: Partial<UtilityReading> = {
        ...(editId ? { id: editId } : {}),
        accountId: acc.id,
        utilityType: 'electricity',
        date,
        periodMonth: date.substring(0, 7),
        readingT1: t1Val,
        readingT2: t2Val,
        consumptionT1: diff1,
        consumptionT2: diff2,
        rateT1: rate1,
        rateT2: rate2,
        totalCost,
        season,
        isPaid: isControlOnly ? true : Boolean(formVal.isPaid),
        paidDate: isControlOnly ? undefined : (formVal.isPaid ? date : undefined),
        paidAmount: isControlOnly ? 0 : (formVal.isPaid ? totalCost : undefined),
        note: readingNote,
        isControlOnly,
        readingPurpose: isControlOnly ? 'control' : 'billing',
        daysSinceLastReading: daysSinceLast,
        dailyAvgConsumption: dailyAvg,
      };

      await this.dataService.saveUtilityReading(reading);
      this.closeReadingModal();
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async deleteReading(id: string): Promise<void> {
    const ok = confirm('Видалити цей запис показів лічильника?');
    if (ok) {
      await this.dataService.deleteUtilityReading(id);
    }
  }

  async togglePaidStatus(r: UtilityReading): Promise<void> {
    if (r.isControlOnly) return;
    const nextStatus = !r.isPaid;
    await this.dataService.markUtilityReadingPaid(r.id, nextStatus, r.totalCost);
  }
}
