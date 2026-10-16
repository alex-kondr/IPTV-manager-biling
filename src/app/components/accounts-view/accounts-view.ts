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
  ProviderAccountDetailed,
  formatDateUa,
  cleanPhoneNumber,
  addMonthsExact,
  getDaysRemaining,
} from '../../models/client.model';
import { getGoogleCalendarUrl, generateIcsFile } from '../../utils/calendar-event';

@Component({
  selector: 'app-accounts-view',
  imports: [ReactiveFormsModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div id="provider-accounts-container" class="space-y-6">
      <!-- Top Overview & Action Bar -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- KPI 1: Total Accounts -->
        <div class="p-4 bg-white rounded-2xl border border-slate-200/90 shadow-2xs">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Акаунтів провайдера</span>
            <div class="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <mat-icon class="text-base">dns</mat-icon>
            </div>
          </div>
          <div class="mt-2 flex items-baseline gap-2">
            <span class="text-2xl font-bold text-slate-900">{{ accounts().length }}</span>
            <span class="text-xs text-slate-500">ліній</span>
          </div>
        </div>

        <!-- KPI 2: Slots Capacity (Max 2 per account) -->
        <div class="p-4 bg-white rounded-2xl border border-slate-200/90 shadow-2xs">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Слоти (макс 2 на акаунт)</span>
            <div class="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
              <mat-icon class="text-base">group_work</mat-icon>
            </div>
          </div>
          <div class="mt-2 flex items-baseline gap-2">
            <span class="text-2xl font-bold text-slate-900">{{ totalOccupiedSlots() }} / {{ totalCapacity() }}</span>
            <span class="text-xs font-medium" [class.text-emerald-600]="totalFreeSlots() > 0" [class.text-rose-600]="totalFreeSlots() === 0">
              ({{ totalFreeSlots() }} вільних)
            </span>
          </div>
        </div>

        <!-- KPI 3: Provider Balance in USD -->
        <div class="p-4 bg-white rounded-2xl border border-slate-200/90 shadow-2xs">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Баланс провайдера</span>
            <div class="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <mat-icon class="text-base">account_balance_wallet</mat-icon>
            </div>
          </div>
          <div class="mt-2 flex items-baseline gap-2">
            <span
              class="text-2xl font-bold font-mono"
              [class.text-emerald-700]="(budgetSummary()?.providerBalanceUsd || 0) > 0"
              [class.text-rose-600]="(budgetSummary()?.providerBalanceUsd || 0) <= 0"
            >
              \${{ (budgetSummary()?.providerBalanceUsd || 0).toFixed(2) }}
            </span>
            <span class="text-2xs text-slate-400">USD</span>
          </div>
        </div>

        <!-- KPI 4: Monthly Burn USD -->
        <div class="p-4 bg-white rounded-2xl border border-slate-200/90 shadow-2xs">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Списання ліній в міс</span>
            <div class="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <mat-icon class="text-base">trending_down</mat-icon>
            </div>
          </div>
          <div class="mt-2 flex items-baseline gap-2">
            <span class="text-2xl font-bold font-mono text-purple-700">
              -\${{ (budgetSummary()?.monthlyBurnUsd || 0).toFixed(2) }}
            </span>
            <span class="text-xs text-slate-500">/ міс</span>
          </div>
        </div>
      </div>

      <!-- Header & Add Button -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-white rounded-2xl border border-slate-200/90 shadow-2xs">
        <div>
          <h2 class="text-base font-bold text-slate-900 flex items-center gap-2">
            <mat-icon class="text-emerald-600">tune</mat-icon>
            Керування акаунтами провайдера
          </h2>
          <p class="text-xs text-slate-500 mt-0.5">
            Кожен акаунт списує плату ($1 або $2/міс) з вашого основного доларового балансу та вміщує <strong>до 2 абонентів</strong>.
          </p>
        </div>

        @if (canEdit()) {
          <button
            id="btn-add-provider-account"
            type="button"
            (click)="openAddAccountModal()"
            class="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold text-xs flex items-center gap-2 shadow-xs transition-colors cursor-pointer shrink-0"
          >
            <mat-icon class="text-base">add_circle</mat-icon>
            <span>Додати акаунт</span>
          </button>
        }
      </div>

      <!-- Filters, Search & Sorting Bar -->
      @if (accounts().length > 0) {
        <div class="p-4 bg-white rounded-2xl border border-slate-200/90 shadow-2xs space-y-3.5">
          <div class="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <!-- Search input -->
            <div class="relative flex-1 max-w-md">
              <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                <mat-icon class="text-base">search</mat-icon>
              </span>
              <input
                type="text"
                [value]="searchQuery()"
                (input)="searchQuery.set($any($event.target).value)"
                placeholder="Пошук за назвою, логіном або підключеним абонентом..."
                class="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
              />
              @if (searchQuery()) {
                <button
                  type="button"
                  (click)="searchQuery.set('')"
                  class="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer border-0 bg-transparent"
                >
                  <mat-icon class="text-sm">close</mat-icon>
                </button>
              }
            </div>

            <!-- Sorting selector (days_asc by default) -->
            <div class="flex items-center gap-2 shrink-0">
              <span class="text-xs font-semibold text-slate-500 whitespace-nowrap flex items-center gap-1">
                <mat-icon class="text-sm text-slate-400">sort</mat-icon>
                Сортування:
              </span>
              <select
                [value]="sortBy()"
                (change)="sortBy.set($any($event.target).value)"
                class="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-emerald-600 cursor-pointer"
              >
                <option value="days_asc">Дні дії: Скоро поповнювати (за замовчуванням ↑)</option>
                <option value="days_desc">Дні дії: Найбільше днів (↓)</option>
                <option value="slots_free">Заповнення: Спочатку вільні слоти (0/2 або 1/2)</option>
                <option value="slots_full">Заповнення: Спочатку повні (2/2)</option>
                <option value="name">За назвою (А-Я)</option>
              </select>
            </div>
          </div>

          <!-- Slot filtering pills -->
          <div class="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="text-2xs font-semibold text-slate-400 uppercase tracking-wider mr-1">Заповнення слотів:</span>
              <button
                type="button"
                (click)="filterSlots.set('all')"
                [class]="filterSlots() === 'all' ? 'bg-slate-900 text-white shadow-2xs font-bold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'"
                class="px-2.5 py-1 rounded-lg text-xs transition-colors cursor-pointer border-0"
              >
                Всі ({{ accounts().length }})
              </button>
              <button
                type="button"
                (click)="filterSlots.set('free')"
                [class]="filterSlots() === 'free' ? 'bg-emerald-600 text-white shadow-2xs font-bold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'"
                class="px-2.5 py-1 rounded-lg text-xs transition-colors cursor-pointer border-0"
              >
                Є вільні слоти ({{ freeAccountsCount() }})
              </button>
              <button
                type="button"
                (click)="filterSlots.set('partial')"
                [class]="filterSlots() === 'partial' ? 'bg-teal-600 text-white shadow-2xs font-bold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'"
                class="px-2.5 py-1 rounded-lg text-xs transition-colors cursor-pointer border-0"
              >
                1 вільний слот ({{ partialAccountsCount() }})
              </button>
              <button
                type="button"
                (click)="filterSlots.set('empty')"
                [class]="filterSlots() === 'empty' ? 'bg-amber-600 text-white shadow-2xs font-bold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'"
                class="px-2.5 py-1 rounded-lg text-xs transition-colors cursor-pointer border-0"
              >
                Порожні 0/2 ({{ emptyAccountsCount() }})
              </button>
              <button
                type="button"
                (click)="filterSlots.set('full')"
                [class]="filterSlots() === 'full' ? 'bg-indigo-600 text-white shadow-2xs font-bold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'"
                class="px-2.5 py-1 rounded-lg text-xs transition-colors cursor-pointer border-0"
              >
                Заповнені 2/2 ({{ fullAccountsCount() }})
              </button>
            </div>

            <div class="text-2xs text-slate-400 font-medium">
              Показано: <strong class="text-slate-800 font-bold">{{ filteredAndSortedAccounts().length }}</strong> з {{ accounts().length }}
            </div>
          </div>
        </div>
      }

      <!-- Accounts Grid -->
      @if (accounts().length === 0) {
        <div class="p-12 text-center bg-white rounded-2xl border border-slate-200/90 shadow-2xs">
          <div class="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
            <mat-icon class="text-3xl">dns</mat-icon>
          </div>
          <h3 class="text-base font-bold text-slate-800">Акаунтів провайдера ще немає</h3>
          <p class="text-xs text-slate-500 max-w-sm mx-auto mt-1">
            Додайте перший акаунт провайдера, щоб прив'язувати до нього абонентів (до 2 на один акаунт) та відстежувати списання в доларах.
          </p>
          <button
            type="button"
            (click)="openAddAccountModal()"
            class="mt-4 px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold text-xs inline-flex items-center gap-1.5 cursor-pointer"
          >
            <mat-icon class="text-base">add</mat-icon>
            <span>Створити акаунт</span>
          </button>
        </div>
      } @else if (filteredAndSortedAccounts().length === 0) {
        <div class="p-8 text-center bg-white rounded-2xl border border-slate-200/90 shadow-2xs space-y-2">
          <mat-icon class="text-3xl text-slate-300">search_off</mat-icon>
          <h3 class="text-sm font-bold text-slate-800">Не знайдено акаунтів за вашими фільтрами</h3>
          <p class="text-xs text-slate-500">Спробуйте змінити фільтр заповнення слотів або очистити пошуковий запит.</p>
          <button
            type="button"
            (click)="resetFilters()"
            class="mt-2 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer border-0"
          >
            Скинути фільтри
          </button>
        </div>
      } @else {
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
          @for (acc of filteredAndSortedAccounts(); track acc.id) {
            @let occupied = (acc.assignedClientIds.length || 0);
            @let isFull = occupied >= 2;
            <div
              class="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs flex flex-col justify-between transition-all"
              [class.ring-2]="isFull"
              [class.ring-slate-300]="isFull"
            >
              <div>
                <!-- Card Header (Responsive wrap to prevent overflow on mobile) -->
                <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-2 pb-3 border-b border-slate-100">
                  <div class="flex items-center gap-2.5 min-w-0">
                    <div
                      class="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center font-bold text-xs sm:text-sm shrink-0"
                      [class.bg-emerald-100]="acc.status === 'active'"
                      [class.text-emerald-800]="acc.status === 'active'"
                      [class.bg-amber-100]="acc.status === 'expiring_soon'"
                      [class.text-amber-800]="acc.status === 'expiring_soon'"
                      [class.bg-rose-100]="acc.status === 'expired'"
                      [class.text-rose-800]="acc.status === 'expired'"
                    >
                      <mat-icon class="text-base sm:text-lg">tv</mat-icon>
                    </div>
                    <div class="min-w-0">
                      <div class="flex items-center gap-1.5 flex-wrap">
                        <h3 class="font-bold text-slate-900 text-sm sm:text-base leading-tight truncate">{{ acc.name }}</h3>
                        <!-- Plan badge at provider -->
                        <span
                          class="px-1.5 py-0.5 rounded text-3xs sm:text-2xs font-bold shrink-0"
                          [class.bg-emerald-100]="acc.pricePerMonthUsd === 1"
                          [class.text-emerald-800]="acc.pricePerMonthUsd === 1"
                          [class.bg-blue-100]="acc.pricePerMonthUsd === 2"
                          [class.text-blue-800]="acc.pricePerMonthUsd === 2"
                        >
                          \${{ acc.pricePerMonthUsd }}/міс
                        </span>
                      </div>
                      <span class="text-2xs sm:text-xs text-slate-400">ID: {{ acc.id }}</span>
                    </div>
                  </div>

                  <!-- Slot Capacity Badge (Responsive, never overflows card) -->
                  <div class="flex items-center self-start sm:self-auto shrink-0">
                    <span
                      class="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-2xs sm:text-xs font-bold inline-flex items-center gap-1 max-w-full"
                      [class.bg-indigo-100]="isFull"
                      [class.text-indigo-900]="isFull"
                      [class.bg-emerald-100]="occupied === 1"
                      [class.text-emerald-800]="occupied === 1"
                      [class.bg-slate-100]="occupied === 0"
                      [class.text-slate-700]="occupied === 0"
                    >
                      <mat-icon class="text-xs leading-none">people</mat-icon>
                      <span>{{ occupied }}/2 слоти {{ isFull ? '(Повний)' : (occupied === 1 ? '(1 вільний)' : '(Вільний)') }}</span>
                    </span>
                  </div>
                </div>

                <!-- Provider Subscription & Expiry Row -->
                <div class="my-3 p-2.5 sm:p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <!-- Validity info -->
                    <div class="flex items-center gap-2 min-w-0">
                      <mat-icon class="text-base text-slate-500 shrink-0">event_available</mat-icon>
                      <div>
                        <div class="flex items-center gap-1.5 flex-wrap">
                          <span class="text-2xs sm:text-xs font-medium text-slate-600">Дійсний у провайдера до:</span>
                          <strong class="text-2xs sm:text-xs font-bold text-slate-900">
                            {{ acc.validUntil ? formatDate(acc.validUntil) : 'Без обмежень' }}
                          </strong>
                        </div>
                        <div class="text-3xs sm:text-2xs text-slate-400">
                          Всього списано за лінію: <strong class="text-slate-700">\${{ acc.totalDeductedUsd || 0 }} USD</strong>
                        </div>
                      </div>
                    </div>

                    <!-- Expiration Status Badge -->
                    <div>
                      @if (acc.status === 'expired') {
                        <span class="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-2xs sm:text-xs font-bold bg-rose-100 text-rose-800 inline-flex items-center gap-1">
                          <mat-icon class="text-xs">error</mat-icon>
                          <span>Закінчився</span>
                        </span>
                      } @else if (acc.status === 'expiring_soon') {
                        <span class="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-2xs sm:text-xs font-bold bg-amber-100 text-amber-800 inline-flex items-center gap-1">
                          <mat-icon class="text-xs">warning</mat-icon>
                          <span>Закінчується: {{ acc.daysRemaining }} дн.</span>
                        </span>
                      } @else {
                        <span class="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-2xs sm:text-xs font-bold bg-emerald-100 text-emerald-800 inline-flex items-center gap-1">
                          <mat-icon class="text-xs">check_circle</mat-icon>
                          <span>Діє ще {{ acc.daysRemaining }} дн.</span>
                        </span>
                      }
                    </div>
                  </div>

                  <!-- Quick Action Buttons for Account Validity & Google Calendar -->
                  <div class="pt-2 border-t border-slate-200/60 flex items-center justify-between gap-2 flex-wrap">
                    <div class="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        (click)="openRenewModal(acc)"
                        class="px-2.5 sm:px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold text-2xs sm:text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                      >
                        <mat-icon class="text-sm">autorenew</mat-icon>
                        <span>Продовжити акаунт (+міс)</span>
                      </button>

                      <!-- Google Calendar Button (10:00 AM & 7-day reminder) -->
                      <a
                        [href]="getGoogleCalendarUrlForAccount(acc)"
                        target="_blank"
                        rel="noopener"
                        class="px-2.5 sm:px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 font-semibold text-2xs sm:text-xs inline-flex items-center gap-1.5 transition-colors"
                        title="Додати нагадування в Google Calendar (о 10:00 та за 7 днів до списання)"
                      >
                        <mat-icon class="text-sm text-blue-600">event</mat-icon>
                        <span>+ Google Calendar</span>
                      </a>

                      <!-- Direct .ics Download Button -->
                      <button
                        type="button"
                        (click)="downloadAccountIcs(acc)"
                        class="p-1.5 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 border border-slate-200 text-xs transition-colors cursor-pointer"
                        title="Завантажити календарний файл (.ics) з авто-нагадуванням за 7 днів та в день оплати о 10:00"
                      >
                        <mat-icon class="text-sm">calendar_month</mat-icon>
                      </button>
                    </div>

                    <button
                      type="button"
                      (click)="toggleRenewalsHistory(acc.id)"
                      class="px-2 py-1 rounded-lg text-3xs sm:text-2xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 inline-flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <mat-icon class="text-xs">history</mat-icon>
                      <span>Історія ({{ (acc.renewals?.length || 0) }})</span>
                    </button>
                  </div>

                  <!-- Accordion History of Renewals -->
                  @if (expandedHistoryAccountId() === acc.id) {
                    <div class="mt-2 pt-2 border-t border-slate-200/60 space-y-1.5 max-h-48 overflow-y-auto">
                      <span class="text-2xs font-semibold text-slate-500 uppercase tracking-wider block">
                        Історія поповнень лінії у провайдера:
                      </span>
                      @if (!acc.renewals || acc.renewals.length === 0) {
                        <p class="text-2xs text-slate-400 italic">Ще немає окремих записів про продовження</p>
                      } @else {
                        @for (ren of acc.renewals; track ren.id) {
                          <div class="p-2 rounded-lg bg-white border border-slate-200/70 text-2xs flex items-center justify-between gap-2">
                            <div>
                              <div class="flex items-center gap-1.5">
                                <span class="font-bold text-slate-900">+{{ ren.months }} міс.</span>
                                <span class="text-slate-400">(\${{ ren.pricePerMonthUsd }}/міс)</span>
                                <span class="text-emerald-700 font-semibold font-mono">-\${{ ren.totalCostUsd }} USD</span>
                              </div>
                              <span class="text-slate-500">Дійсний до: {{ formatDate(ren.newValidUntil) }}</span>
                              @if (ren.note) {
                                <p class="text-slate-400 italic mt-0.5 truncate max-w-[260px]">{{ ren.note }}</p>
                              }
                            </div>
                            <span class="text-slate-400 text-3xs font-mono shrink-0">{{ formatDate(ren.date) }}</span>
                          </div>
                        }
                      }
                    </div>
                  }
                </div>

                <!-- Credentials Strip -->
                <div class="my-3.5 p-3 bg-slate-50 rounded-xl border border-slate-200/70 text-xs space-y-2 font-mono">
                  <div class="flex items-center justify-between">
                    <span class="text-slate-500 font-sans">Логін IPTV:</span>
                    <div class="flex items-center gap-1.5">
                      <strong class="text-slate-900 font-semibold">{{ acc.login }}</strong>
                      <button
                        type="button"
                        (click)="copyText(acc.login, 'login-' + acc.id)"
                        class="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors cursor-pointer"
                        title="Скопіювати логін"
                      >
                        <mat-icon class="text-xs">
                          {{ copiedKey() === 'login-' + acc.id ? 'done' : 'content_copy' }}
                        </mat-icon>
                      </button>
                    </div>
                  </div>

                  @if (acc.password) {
                    <div class="flex items-center justify-between">
                      <span class="text-slate-500 font-sans">Пароль:</span>
                      <div class="flex items-center gap-1.5">
                        <span class="text-slate-800">
                          {{ showPasswordMap()[acc.id] ? acc.password : '••••••••' }}
                        </span>
                        <button
                          type="button"
                          (click)="toggleShowPassword(acc.id)"
                          class="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors cursor-pointer"
                          title="Показати/приховати"
                        >
                          <mat-icon class="text-xs">
                            {{ showPasswordMap()[acc.id] ? 'visibility_off' : 'visibility' }}
                          </mat-icon>
                        </button>
                        <button
                          type="button"
                          (click)="copyText(acc.password, 'pwd-' + acc.id)"
                          class="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors cursor-pointer"
                          title="Скопіювати пароль"
                        >
                          <mat-icon class="text-xs">
                            {{ copiedKey() === 'pwd-' + acc.id ? 'done' : 'content_copy' }}
                          </mat-icon>
                        </button>
                      </div>
                    </div>
                  }

                  @if (acc.serverUrl) {
                    <div class="flex items-center justify-between">
                      <span class="text-slate-500 font-sans">Сервер:</span>
                      <div class="flex items-center gap-1.5 truncate max-w-[200px]">
                        <span class="text-slate-700 truncate" [title]="acc.serverUrl">{{ acc.serverUrl }}</span>
                        <button
                          type="button"
                          (click)="copyText(acc.serverUrl, 'srv-' + acc.id)"
                          class="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors cursor-pointer shrink-0"
                          title="Скопіювати сервер"
                        >
                          <mat-icon class="text-xs">
                            {{ copiedKey() === 'srv-' + acc.id ? 'done' : 'content_copy' }}
                          </mat-icon>
                        </button>
                      </div>
                    </div>
                  }

                  @if (acc.playlistUrl) {
                    <div class="flex items-center justify-between">
                      <span class="text-slate-500 font-sans">Плейлист (M3U):</span>
                      <div class="flex items-center gap-1.5 truncate max-w-[200px]">
                        <span class="text-slate-700 truncate" [title]="acc.playlistUrl">{{ acc.playlistUrl }}</span>
                        <button
                          type="button"
                          (click)="copyText(acc.playlistUrl, 'pl-' + acc.id)"
                          class="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors cursor-pointer shrink-0"
                          title="Скопіювати плейлист"
                        >
                          <mat-icon class="text-xs">
                            {{ copiedKey() === 'pl-' + acc.id ? 'done' : 'content_copy' }}
                          </mat-icon>
                        </button>
                      </div>
                    </div>
                  }
                </div>

                <!-- Assigned Clients Section -->
                <div class="space-y-2 mt-4">
                  <div class="flex items-center justify-between text-xs font-semibold text-slate-700">
                    <span class="flex items-center gap-1.5">
                      <mat-icon class="text-xs text-emerald-600">group</mat-icon>
                      Підключені абоненти ({{ occupied }} / 2)
                    </span>
                    @if (!isFull) {
                      <button
                        type="button"
                        (click)="openAssignClientDialog(acc)"
                        class="text-xs text-emerald-700 hover:text-emerald-800 font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <mat-icon class="text-xs">add</mat-icon>
                        Підключити абонента
                      </button>
                    }
                  </div>

                  <!-- List of clients in slot 1 and slot 2 -->
                  <div class="space-y-2">
                    @if (acc.clients && acc.clients.length > 0) {
                      @for (c of acc.clients; track c.id; let idx = $index) {
                        <div class="p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 flex items-center justify-between gap-3 text-xs">
                          <div class="flex items-center gap-2.5">
                            <span class="w-6 h-6 rounded-full bg-emerald-200 text-emerald-800 font-bold text-2xs flex items-center justify-center shrink-0">
                              #{{ idx + 1 }}
                            </span>
                            <div>
                              <strong class="text-slate-900 font-semibold block">{{ c.fullName }}</strong>
                              <div class="flex items-center gap-2 text-2xs text-slate-500">
                                <span>{{ c.phone }}</span>
                                <span>•</span>
                                <span class="font-mono">{{ c.iptvLogin }}</span>
                              </div>
                            </div>
                          </div>

                          <div class="flex items-center gap-2">
                            <!-- Plan badge -->
                            <span
                              class="px-2 py-0.5 rounded text-2xs font-bold"
                              [class.bg-emerald-100]="c.subscriptionPlan === '1usd'"
                              [class.text-emerald-800]="c.subscriptionPlan === '1usd'"
                              [class.bg-blue-100]="c.subscriptionPlan === '2usd'"
                              [class.text-blue-800]="c.subscriptionPlan === '2usd'"
                            >
                              {{ c.subscriptionPlan === '2usd' ? '$2 (150 грн)' : '$1 (100 грн)' }}
                            </span>

                            <!-- Unassign button -->
                            <button
                              type="button"
                              (click)="unassignClient(acc.id, c.id, c.fullName)"
                              class="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                              title="Відкріпити від акаунту"
                            >
                              <mat-icon class="text-base">link_off</mat-icon>
                            </button>
                          </div>
                        </div>
                      }
                    }

                    <!-- Empty slots placeholder -->
                    @if (occupied < 2) {
                      @for (emptySlot of [].constructor(2 - occupied); track $index) {
                        <button
                          type="button"
                          (click)="openAssignClientDialog(acc)"
                          class="w-full p-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 hover:bg-emerald-50/50 hover:border-emerald-300 flex items-center justify-between text-xs text-slate-400 transition-colors cursor-pointer text-left"
                        >
                          <div class="flex items-center gap-2">
                            <span class="w-6 h-6 rounded-full bg-slate-200 text-slate-500 font-bold text-2xs flex items-center justify-center">
                              #{{ occupied + $index + 1 }}
                            </span>
                            <span class="italic">Вільний слот IPTV (натисніть для підключення)</span>
                          </div>
                          <span class="text-xs font-semibold text-emerald-600">+ Підключити</span>
                        </button>
                      }
                    }
                  </div>
                </div>

                @if (acc.notes) {
                  <p class="text-2xs text-slate-400 italic mt-3 truncate">
                    Примітка: {{ acc.notes }}
                  </p>
                }
              </div>

              <!-- Footer action row -->
              <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <span class="text-2xs text-slate-400">
                  Створено: {{ formatDate(acc.createdAt) }}
                </span>
                <div class="flex items-center gap-1">
                  <button
                    type="button"
                    (click)="openRenewModal(acc)"
                    class="px-2 py-1 text-emerald-700 hover:bg-emerald-50 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                    title="Продовжити термін"
                  >
                    <mat-icon class="text-sm">autorenew</mat-icon>
                    <span>Продовжити</span>
                  </button>
                  <button
                    type="button"
                    (click)="openEditAccountModal(acc)"
                    class="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                    title="Редагувати акаунт"
                  >
                    <mat-icon class="text-base">edit</mat-icon>
                  </button>
                  <button
                    type="button"
                    (click)="deleteAccountConfirm(acc)"
                    class="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                    title="Видалити акаунт"
                  >
                    <mat-icon class="text-base">delete</mat-icon>
                  </button>
                </div>
              </div>
            </div>
          }
        </div>
      }

      <!-- MODAL: RENEW PROVIDER ACCOUNT (+MONTHS) -->
      @if (renewModalAccount()) {
        <div class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 flex items-center justify-center">
          <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden my-auto border border-slate-200 flex flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)]">
            <!-- Modal Header (pinned at top) -->
            <div class="flex items-center justify-between px-5 sm:px-6 py-4 bg-slate-900 text-white shrink-0">
              <div class="flex items-center gap-2.5">
                <div class="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                  <mat-icon class="text-xl">autorenew</mat-icon>
                </div>
                <div>
                  <h2 class="text-base font-semibold tracking-tight">
                    Продовження акаунту: {{ renewModalAccount()!.name }}
                  </h2>
                  <p class="text-xs text-slate-400">
                    Списання коштів з основного доларового балансу провайдера
                  </p>
                </div>
              </div>
              <button
                type="button"
                (click)="renewModalAccount.set(null)"
                class="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <mat-icon>close</mat-icon>
              </button>
            </div>

            <form [formGroup]="renewForm" (ngSubmit)="submitRenewAccount()" class="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div class="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1 overscroll-contain">
              <!-- Current Expiry Status Banner -->
              <div class="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between text-xs">
                <div>
                  <span class="text-slate-500 block">Поточний термін дії лінії:</span>
                  <strong class="text-slate-900 font-bold text-sm">
                    {{ renewModalAccount()!.validUntil ? formatDate(renewModalAccount()!.validUntil) : 'Не встановлено' }}
                  </strong>
                </div>
                <div class="text-right">
                  <span class="text-slate-500 block">Залишок на балансі:</span>
                  <strong
                    class="font-mono font-bold text-sm"
                    [class.text-emerald-700]="(budgetSummary()?.providerBalanceUsd || 0) > 0"
                    [class.text-rose-600]="(budgetSummary()?.providerBalanceUsd || 0) <= 0"
                  >
                    \${{ (budgetSummary()?.providerBalanceUsd || 0).toFixed(2) }} USD
                  </strong>
                </div>
              </div>

              <!-- Price Per Month ($1 or $2) -->
              <div>
                <span class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                  Тариф лінії у провайдера <span class="text-rose-500">*</span>
                </span>
                <div class="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    (click)="renewForm.patchValue({ pricePerMonthUsd: 1 })"
                    class="p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between"
                    [class.border-emerald-600]="renewForm.value.pricePerMonthUsd === 1"
                    [class.bg-emerald-50/50]="renewForm.value.pricePerMonthUsd === 1"
                    [class.ring-2]="renewForm.value.pricePerMonthUsd === 1"
                    [class.ring-emerald-600]="renewForm.value.pricePerMonthUsd === 1"
                    [class.border-slate-300]="renewForm.value.pricePerMonthUsd !== 1"
                  >
                    <div>
                      <strong class="text-slate-900 font-bold text-sm block">$1 / місяць</strong>
                      <span class="text-2xs text-slate-500">Стандартний тариф</span>
                    </div>
                    @if (renewForm.value.pricePerMonthUsd === 1) {
                      <mat-icon class="text-emerald-600 text-lg">check_circle</mat-icon>
                    }
                  </button>

                  <button
                    type="button"
                    (click)="renewForm.patchValue({ pricePerMonthUsd: 2 })"
                    class="p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between"
                    [class.border-blue-600]="renewForm.value.pricePerMonthUsd === 2"
                    [class.bg-blue-50/50]="renewForm.value.pricePerMonthUsd === 2"
                    [class.ring-2]="renewForm.value.pricePerMonthUsd === 2"
                    [class.ring-blue-600]="renewForm.value.pricePerMonthUsd === 2"
                    [class.border-slate-300]="renewForm.value.pricePerMonthUsd !== 2"
                  >
                    <div>
                      <strong class="text-slate-900 font-bold text-sm block">$2 / місяць</strong>
                      <span class="text-2xs text-slate-500">Розширений тариф</span>
                    </div>
                    @if (renewForm.value.pricePerMonthUsd === 2) {
                      <mat-icon class="text-blue-600 text-lg">check_circle</mat-icon>
                    }
                  </button>
                </div>
              </div>

              <!-- Number of months to extend -->
              <div>
                <div class="flex items-center justify-between mb-2">
                  <label for="renew-months-input" class="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Кількість місяців продовження <span class="text-rose-500">*</span>
                  </label>
                  <span class="text-2xs text-slate-400">Швидкий вибір:</span>
                </div>

                <!-- Quick Buttons -->
                <div class="flex items-center gap-2 mb-2.5">
                  @for (m of [1, 2, 3, 6, 12]; track m) {
                    <button
                      type="button"
                      (click)="setRenewMonths(m)"
                      class="flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer text-center"
                      [class.bg-emerald-600]="renewForm.value.months === m"
                      [class.text-white]="renewForm.value.months === m"
                      [class.border-emerald-600]="renewForm.value.months === m"
                      [class.bg-white]="renewForm.value.months !== m"
                      [class.text-slate-700]="renewForm.value.months !== m"
                      [class.border-slate-300]="renewForm.value.months !== m"
                      [class.hover:bg-slate-100]="renewForm.value.months !== m"
                    >
                      +{{ m }} міс
                    </button>
                  }
                </div>

                <div class="relative">
                  <input
                    id="renew-months-input"
                    type="number"
                    min="1"
                    max="60"
                    formControlName="months"
                    class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-emerald-600 font-mono"
                  />
                  <span class="absolute right-3.5 top-2.5 text-xs text-slate-400 pointer-events-none">місяців</span>
                </div>
              </div>

              <!-- Live Calculation Box -->
              <div class="p-4 bg-emerald-50 rounded-xl border border-emerald-200 space-y-2">
                <div class="flex items-center justify-between text-xs">
                  <span class="text-emerald-900 font-medium">Буде списано з $ балансу:</span>
                  <strong class="text-base font-bold font-mono text-emerald-800">
                    -\${{ calculatedRenewCost() }} USD
                  </strong>
                </div>
                <div class="flex items-center justify-between text-xs pt-1.5 border-t border-emerald-200/80">
                  <span class="text-emerald-900 font-medium">Новий термін дії лінії:</span>
                  <strong class="text-xs font-bold text-emerald-950">
                    до {{ calculatedRenewNewValidUntil() }}
                  </strong>
                </div>
              </div>

              <!-- Note -->
              <div>
                <label for="renew-note-input" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Примітка (опціонально)
                </label>
                <input
                  id="renew-note-input"
                  type="text"
                  formControlName="note"
                  placeholder="напр. Продовження на 6 міс. через кабінет Edem"
                  class="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
                />
              </div>

              </div>

              <!-- Actions (pinned at bottom) -->
              <div class="flex items-center justify-end gap-3 px-5 sm:px-6 py-3.5 bg-slate-50 border-t border-slate-200 shrink-0">
                <button
                  type="button"
                  (click)="renewModalAccount.set(null)"
                  class="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  [disabled]="renewForm.invalid"
                  class="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold flex items-center gap-2 cursor-pointer transition-colors shadow-xs"
                >
                  <mat-icon class="text-base">check</mat-icon>
                  <span>Списати \${{ calculatedRenewCost() }} та продовжити</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- MODAL: ADD / EDIT ACCOUNT -->
      @if (isAccountModalOpen()) {
        <div class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 flex items-center justify-center">
          <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden my-auto border border-slate-200 flex flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)]">
            <!-- Modal Header (pinned at top) -->
            <div class="flex items-center justify-between px-5 sm:px-6 py-4 bg-slate-900 text-white shrink-0">
              <div class="flex items-center gap-2.5">
                <div class="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                  <mat-icon class="text-xl">dns</mat-icon>
                </div>
                <div>
                  <h2 class="text-base font-semibold tracking-tight">
                    {{ editingAccount() ? 'Редагувати акаунт провайдера' : 'Новий акаунт IPTV' }}
                  </h2>
                  <p class="text-xs text-slate-400">Підтримує 2 слоти для підключення клієнтів</p>
                </div>
              </div>
              <button
                type="button"
                (click)="isAccountModalOpen.set(false)"
                class="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <mat-icon>close</mat-icon>
              </button>
            </div>

            <!-- Form (Scrollable body with pinned actions) -->
            <form [formGroup]="accountForm" (ngSubmit)="saveAccount()" class="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div class="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1 overscroll-contain">
              <div>
                <label for="acc-name-input" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Назва акаунту <span class="text-rose-500">*</span>
                </label>
                <input
                  id="acc-name-input"
                  type="text"
                  formControlName="name"
                  placeholder="напр. Акаунт IPTV #1 (OttClub / Edem)"
                  class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <!-- If creating a new account: Setup initial subscription price & months -->
              @if (!editingAccount()) {
                <div class="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <div>
                    <span class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                      Тариф лінії у провайдера <span class="text-rose-500">*</span>
                    </span>
                    <div class="grid grid-cols-2 gap-2">
                      <label
                        class="p-2.5 rounded-lg border flex items-center justify-between text-xs cursor-pointer transition-colors"
                        [class.border-emerald-600]="accountForm.value.pricePerMonthUsd === 1"
                        [class.bg-emerald-50/50]="accountForm.value.pricePerMonthUsd === 1"
                        [class.border-slate-300]="accountForm.value.pricePerMonthUsd !== 1"
                      >
                        <div class="flex items-center gap-2">
                          <input
                            type="radio"
                            name="pricePerMonthUsd"
                            [value]="1"
                            formControlName="pricePerMonthUsd"
                            class="text-emerald-600 focus:ring-emerald-500"
                          />
                          <span class="font-bold text-slate-900">$1 / міс</span>
                        </div>
                        <span class="text-2xs text-slate-500">(100 грн)</span>
                      </label>

                      <label
                        class="p-2.5 rounded-lg border flex items-center justify-between text-xs cursor-pointer transition-colors"
                        [class.border-blue-600]="accountForm.value.pricePerMonthUsd === 2"
                        [class.bg-blue-50/50]="accountForm.value.pricePerMonthUsd === 2"
                        [class.border-slate-300]="accountForm.value.pricePerMonthUsd !== 2"
                      >
                        <div class="flex items-center gap-2">
                          <input
                            type="radio"
                            name="pricePerMonthUsd"
                            [value]="2"
                            formControlName="pricePerMonthUsd"
                            class="text-blue-600 focus:ring-blue-500"
                          />
                          <span class="font-bold text-slate-900">$2 / міс</span>
                        </div>
                        <span class="text-2xs text-slate-500">(150 грн)</span>
                      </label>
                    </div>
                  </div>

                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label for="acc-months-input" class="block text-2xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                        Місяців підключення
                      </label>
                      <input
                        id="acc-months-input"
                        type="number"
                        min="1"
                        max="60"
                        formControlName="monthsCount"
                        class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-emerald-600 font-mono"
                      />
                    </div>
                    <div>
                      <label for="acc-startdate-input" class="block text-2xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                        Дата початку
                      </label>
                      <input
                        id="acc-startdate-input"
                        type="date"
                        formControlName="startDate"
                        class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
                      />
                    </div>
                  </div>

                  <div class="p-2.5 bg-emerald-50 rounded-lg border border-emerald-200 text-2xs text-emerald-900 flex items-center justify-between">
                    <span>Списання з балансу: <strong class="font-mono font-bold">-\${{ calculatedNewAccountCost() }} USD</strong></span>
                    <span>Діятиме до: <strong>{{ calculatedNewAccountValidUntil() }}</strong></span>
                  </div>
                </div>
              }

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label for="acc-login-input" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Логін / Юзернейм <span class="text-rose-500">*</span>
                  </label>
                  <input
                    id="acc-login-input"
                    type="text"
                    formControlName="login"
                    placeholder="iptv_login01"
                    class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-emerald-600 font-mono"
                  />
                </div>

                <div>
                  <label for="acc-pwd-input" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Пароль провайдера
                  </label>
                  <input
                    id="acc-pwd-input"
                    type="text"
                    formControlName="password"
                    placeholder="пароль або ключ"
                    class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-emerald-600 font-mono"
                  />
                </div>
              </div>

              <div>
                <label for="acc-server-input" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Сервер / Хост порталу
                </label>
                <input
                  id="acc-server-input"
                  type="text"
                  formControlName="serverUrl"
                  placeholder="напр. http://iptv.server.com:80"
                  class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label for="acc-m3u-input" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  URL M3U плейлиста
                </label>
                <input
                  id="acc-m3u-input"
                  type="text"
                  formControlName="playlistUrl"
                  placeholder="http://iptv.server.com/playlist.m3u8?token=..."
                  class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label for="acc-notes-input" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Нотатки
                </label>
                <textarea
                  id="acc-notes-input"
                  rows="2"
                  formControlName="notes"
                  placeholder="Особливості налаштування, реквізити кабінету тощо"
                  class="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-emerald-600 resize-none"
                ></textarea>
              </div>

              </div>

              <!-- Actions (pinned at bottom) -->
              <div class="flex items-center justify-end gap-3 px-5 sm:px-6 py-3.5 bg-slate-50 border-t border-slate-200 shrink-0">
                <button
                  type="button"
                  (click)="isAccountModalOpen.set(false)"
                  class="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  [disabled]="accountForm.invalid"
                  class="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold flex items-center gap-2 cursor-pointer transition-colors shadow-xs"
                >
                  <mat-icon class="text-base">check</mat-icon>
                  <span>{{ editingAccount() ? 'Зберегти зміни' : 'Створити акаунт' }}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- MODAL: ASSIGN CLIENT TO ACCOUNT -->
      @if (targetAccountForAssign()) {
        <div class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 flex items-center justify-center">
          <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden my-auto border border-slate-200 flex flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)]">
            <!-- Header (pinned at top) -->
            <div class="flex items-center justify-between px-5 sm:px-6 py-4 bg-slate-900 text-white shrink-0">
              <div class="flex items-center gap-2.5">
                <mat-icon class="text-emerald-400">person_add</mat-icon>
                <div>
                  <h3 class="text-base font-semibold">Підключити до {{ targetAccountForAssign()!.name }}</h3>
                  <p class="text-xs text-slate-400">Оберіть клієнта для прив'язки до вільного слоту (макс 2)</p>
                </div>
              </div>
              <button
                type="button"
                (click)="targetAccountForAssign.set(null)"
                class="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <mat-icon>close</mat-icon>
              </button>
            </div>

            <!-- Scrollable Content -->
            <div class="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1 overscroll-contain">
              <div class="relative">
                <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                  <mat-icon class="text-base">search</mat-icon>
                </span>
                <input
                  type="text"
                  [formControl]="clientSearchControl"
                  placeholder="Швидкий пошук клієнта за іменем або телефоном..."
                  class="w-full pl-9 pr-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div class="max-h-64 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50/50">
                @if (assignableClients().length === 0) {
                  <div class="p-6 text-center text-xs text-slate-500">
                    Немає вільних клієнтів для прив'язки
                  </div>
                } @else {
                  @for (c of assignableClients(); track c.id) {
                    <div
                      class="p-3 hover:bg-emerald-50/60 transition-colors flex items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <strong class="text-slate-900 font-semibold block">{{ c.fullName }}</strong>
                        <span class="text-slate-500 text-2xs">{{ c.phone }} • Логін: {{ c.iptvLogin }}</span>
                      </div>
                      <div class="flex items-center gap-2 shrink-0">
                        <span class="text-2xs font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                          {{ c.subscriptionPlan === '2usd' ? '$2 (150 грн)' : '$1 (100 грн)' }}
                        </span>
                        <button
                          type="button"
                          (click)="assignClient(c.id)"
                          class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-2xs flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <mat-icon class="text-xs">add</mat-icon>
                          Прив'язати
                        </button>
                      </div>
                    </div>
                  }
                }
              </div>
            </div>

            <!-- Footer (pinned at bottom) -->
            <div class="px-5 sm:px-6 py-3 bg-slate-50 border-t border-slate-200 text-right shrink-0">
              <button
                type="button"
                (click)="targetAccountForAssign.set(null)"
                class="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-medium hover:bg-slate-100 cursor-pointer"
              >
                Закрити
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class AccountsView {
  private readonly dataService = inject(IptvData);

  readonly canEdit = this.dataService.canEdit;
  readonly accounts = this.dataService.accounts;
  readonly clients = this.dataService.clients;
  readonly budgetSummary = this.dataService.budgetSummary;

  // Search in assign modal
  readonly clientSearchControl = new FormControl('');

  // Password visibility map
  readonly showPasswordMap = signal<Record<string, boolean>>({});
  readonly copiedKey = signal<string | null>(null);

  // History accordion toggle
  readonly expandedHistoryAccountId = signal<string | null>(null);

  // Modals state
  readonly isAccountModalOpen = signal(false);
  readonly editingAccount = signal<ProviderAccountDetailed | null>(null);
  readonly targetAccountForAssign = signal<ProviderAccountDetailed | null>(null);

  // Renew Account Modal
  readonly renewModalAccount = signal<ProviderAccountDetailed | null>(null);
  readonly renewForm = new FormGroup({
    months: new FormControl(1, [Validators.required, Validators.min(1)]),
    pricePerMonthUsd: new FormControl(1, [Validators.required]),
    note: new FormControl(''),
  });

  readonly accountForm = new FormGroup({
    name: new FormControl('', [Validators.required]),
    login: new FormControl('', [Validators.required]),
    password: new FormControl(''),
    serverUrl: new FormControl(''),
    playlistUrl: new FormControl(''),
    notes: new FormControl(''),
    pricePerMonthUsd: new FormControl(1),
    monthsCount: new FormControl(1, [Validators.required, Validators.min(1)]),
    startDate: new FormControl(new Date().toISOString().split('T')[0]),
  });

  readonly totalCapacity = computed(() => this.accounts().length * 2);

  readonly totalOccupiedSlots = computed(() => {
    return this.accounts().reduce((acc, curr) => acc + (curr.assignedClientIds?.length || 0), 0);
  });

  readonly totalFreeSlots = computed(() => {
    return Math.max(0, this.totalCapacity() - this.totalOccupiedSlots());
  });

  // Sorting & Filtering state (default: days_asc - expiring soonest at top)
  readonly sortBy = signal<'days_asc' | 'days_desc' | 'slots_free' | 'slots_full' | 'name'>('days_asc');
  readonly filterSlots = signal<'all' | 'free' | 'full' | 'empty' | 'partial'>('all');
  readonly searchQuery = signal<string>('');

  readonly freeAccountsCount = computed(() => {
    return this.accounts().filter((a) => (a.assignedClientIds?.length || 0) < 2).length;
  });

  readonly partialAccountsCount = computed(() => {
    return this.accounts().filter((a) => (a.assignedClientIds?.length || 0) === 1).length;
  });

  readonly fullAccountsCount = computed(() => {
    return this.accounts().filter((a) => (a.assignedClientIds?.length || 0) >= 2).length;
  });

  readonly emptyAccountsCount = computed(() => {
    return this.accounts().filter((a) => (a.assignedClientIds?.length || 0) === 0).length;
  });

  readonly filteredAndSortedAccounts = computed(() => {
    let list = [...this.accounts()];
    const query = this.searchQuery().toLowerCase().trim();
    const slotFilter = this.filterSlots();
    const sort = this.sortBy();

    // 1. Search Query
    if (query) {
      list = list.filter((acc) => {
        const matchName = acc.name?.toLowerCase().includes(query);
        const matchLogin = acc.login?.toLowerCase().includes(query);
        const matchNotes = acc.notes?.toLowerCase().includes(query);
        const matchClients = acc.clients?.some(
          (c) =>
            c.fullName.toLowerCase().includes(query) ||
            c.phone.includes(query) ||
            c.iptvLogin.toLowerCase().includes(query),
        );
        return matchName || matchLogin || matchNotes || matchClients;
      });
    }

    // 2. Slot Filter
    if (slotFilter !== 'all') {
      list = list.filter((acc) => {
        const occ = acc.assignedClientIds?.length || 0;
        if (slotFilter === 'free') return occ < 2;
        if (slotFilter === 'full') return occ >= 2;
        if (slotFilter === 'empty') return occ === 0;
        if (slotFilter === 'partial') return occ === 1;
        return true;
      });
    }

    // 3. Sorting (days_asc by default)
    list.sort((a, b) => {
      const daysA = a.validUntil ? (a.daysRemaining ?? getDaysRemaining(a.validUntil)) : 999999;
      const daysB = b.validUntil ? (b.daysRemaining ?? getDaysRemaining(b.validUntil)) : 999999;
      const occA = a.assignedClientIds?.length || 0;
      const occB = b.assignedClientIds?.length || 0;
      const freeA = 2 - occA;
      const freeB = 2 - occB;

      switch (sort) {
        case 'days_asc':
          return daysA - daysB;
        case 'days_desc':
          return daysB - daysA;
        case 'slots_free':
          if (freeB !== freeA) return freeB - freeA;
          return daysA - daysB;
        case 'slots_full':
          if (occB !== occA) return occB - occA;
          return daysA - daysB;
        case 'name':
          return (a.name || '').localeCompare(b.name || '', 'uk');
        default:
          return daysA - daysB;
      }
    });

    return list;
  });

  resetFilters(): void {
    this.searchQuery.set('');
    this.filterSlots.set('all');
    this.sortBy.set('days_asc');
  }

  getGoogleCalendarUrlForAccount(acc: ProviderAccountDetailed): string {
    const dateStr = acc.validUntil ? acc.validUntil.split('T')[0] : new Date().toISOString().split('T')[0];
    const clientNames = acc.clients && acc.clients.length > 0
      ? acc.clients.map((c) => `${c.fullName} (${c.phone || c.iptvLogin})`).join(', ')
      : 'Немає підключених абонентів';

    const title = `Поповнення IPTV: ${acc.name}`;
    const details = [
      `🔔 НАГАДУВАННЯ: Поповнення акаунту провайдера IPTV!`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `📺 Акаунт: ${acc.name}`,
      `🔑 Логін: ${acc.login}`,
      `💳 Вартість: $${acc.pricePerMonthUsd}/місяць`,
      `📅 Дійсний до: ${this.formatDate(acc.validUntil)} о 10:00`,
      `👥 Підключені абоненти (${acc.assignedClientIds?.length || 0}/2): ${clientNames}`,
      `\n⏰ ПЛАН НАГАДУВАНЬ:`,
      `1. За 7 днів до закінчення: перевірити баланс та нагадати абонентам`,
      `2. В день закінчення о 10:00: продовжити акаунт у провайдера`,
    ].join('\n');

    return getGoogleCalendarUrl({
      title,
      details,
      dateStr,
      startHour: 10,
      endHour: 11,
    });
  }

  downloadAccountIcs(acc: ProviderAccountDetailed): void {
    const dateStr = acc.validUntil ? acc.validUntil.split('T')[0] : new Date().toISOString().split('T')[0];
    const clientNames = acc.clients && acc.clients.length > 0
      ? acc.clients.map((c) => `${c.fullName} (${c.phone || c.iptvLogin})`).join(', ')
      : 'Немає підключених абонентів';

    const title = `Поповнення IPTV: ${acc.name}`;
    const details = [
      `🔔 НАГАДУВАННЯ: Поповнення акаунту провайдера IPTV!`,
      `📺 Акаунт: ${acc.name}`,
      `🔑 Логін: ${acc.login}`,
      `💳 Вартість: $${acc.pricePerMonthUsd}/місяць`,
      `📅 Дійсний до: ${this.formatDate(acc.validUntil)} о 10:00`,
      `👥 Підключені абоненти (${acc.assignedClientIds?.length || 0}/2): ${clientNames}`,
      `\n⏰ НАГАДУВАННЯ: За 7 днів та в день списання о 10:00!`,
    ].join('\n');

    generateIcsFile({
      title,
      details,
      dateStr,
      startHour: 10,
      endHour: 11,
    });
  }

  readonly assignableClients = computed(() => {
    const list = this.clients();
    const query = (this.clientSearchControl.value || '').toLowerCase().trim();
    const currentTarget = this.targetAccountForAssign();

    return list.filter((c) => {
      // Exclude if already assigned to this account
      if (currentTarget && currentTarget.assignedClientIds?.includes(c.id)) {
        return false;
      }
      if (!query) return true;
      return (
        c.fullName.toLowerCase().includes(query) ||
        c.phone.includes(query) ||
        c.iptvLogin.toLowerCase().includes(query)
      );
    });
  });

  // Renew calculations
  readonly calculatedRenewCost = computed(() => {
    const m = Math.max(1, Number(this.renewForm.value.months) || 1);
    const p = Number(this.renewForm.value.pricePerMonthUsd) === 2 ? 2 : 1;
    return m * p;
  });

  readonly calculatedRenewNewValidUntil = computed(() => {
    const acc = this.renewModalAccount();
    if (!acc) return '—';
    const m = Math.max(1, Number(this.renewForm.value.months) || 1);
    const todayStr = new Date().toISOString().split('T')[0];
    const isCurrentlyValid = acc.validUntil && getDaysRemaining(acc.validUntil) > 0;
    const baseDate = isCurrentlyValid ? acc.validUntil : todayStr;
    return formatDateUa(addMonthsExact(baseDate, m), true);
  });

  readonly calculatedNewAccountCost = computed(() => {
    const m = Math.max(1, Number(this.accountForm.value.monthsCount) || 1);
    const p = Number(this.accountForm.value.pricePerMonthUsd) === 2 ? 2 : 1;
    return m * p;
  });

  readonly calculatedNewAccountValidUntil = computed(() => {
    const m = Math.max(1, Number(this.accountForm.value.monthsCount) || 1);
    const start = this.accountForm.value.startDate || new Date().toISOString().split('T')[0];
    return formatDateUa(addMonthsExact(start, m), true);
  });

  openAddAccountModal(): void {
    this.editingAccount.set(null);
    this.accountForm.reset({
      name: `Акаунт IPTV #${this.accounts().length + 1}`,
      login: '',
      password: '',
      serverUrl: '',
      playlistUrl: '',
      notes: '',
      pricePerMonthUsd: 1,
      monthsCount: 1,
      startDate: new Date().toISOString().split('T')[0],
    });
    this.isAccountModalOpen.set(true);
  }

  openEditAccountModal(acc: ProviderAccountDetailed): void {
    this.editingAccount.set(acc);
    this.accountForm.patchValue({
      name: acc.name,
      login: acc.login,
      password: acc.password || '',
      serverUrl: acc.serverUrl || '',
      playlistUrl: acc.playlistUrl || '',
      notes: acc.notes || '',
      pricePerMonthUsd: acc.pricePerMonthUsd || 1,
      monthsCount: acc.monthsCount || 1,
      startDate: acc.createdAt ? acc.createdAt.split('T')[0] : new Date().toISOString().split('T')[0],
    });
    this.isAccountModalOpen.set(true);
  }

  openRenewModal(acc: ProviderAccountDetailed): void {
    this.renewModalAccount.set(acc);
    this.renewForm.reset({
      months: 1,
      pricePerMonthUsd: acc.pricePerMonthUsd || 1,
      note: '',
    });
  }

  setRenewMonths(months: number): void {
    this.renewForm.patchValue({ months });
  }

  toggleRenewalsHistory(accountId: string): void {
    this.expandedHistoryAccountId.update((curr) => (curr === accountId ? null : accountId));
  }

  async submitRenewAccount(): Promise<void> {
    const acc = this.renewModalAccount();
    if (!acc || this.renewForm.invalid) return;

    const val = this.renewForm.getRawValue();
    const ok = await this.dataService.renewAccount({
      accountId: acc.id,
      months: Math.max(1, Number(val.months) || 1),
      pricePerMonthUsd: Number(val.pricePerMonthUsd) === 2 ? 2 : 1,
      note: val.note || undefined,
    });

    if (ok) {
      this.renewModalAccount.set(null);
    }
  }

  async saveAccount(): Promise<void> {
    if (this.accountForm.invalid) return;
    const val = this.accountForm.getRawValue();

    const target = this.editingAccount();
    if (target) {
      await this.dataService.updateAccount(target.id, {
        name: val.name!,
        login: val.login!,
        password: val.password || '',
        serverUrl: val.serverUrl || '',
        playlistUrl: val.playlistUrl || '',
        notes: val.notes || '',
        pricePerMonthUsd: Number(val.pricePerMonthUsd) === 2 ? 2 : 1,
      });
    } else {
      await this.dataService.addAccount({
        name: val.name!,
        login: val.login!,
        password: val.password || '',
        serverUrl: val.serverUrl || '',
        playlistUrl: val.playlistUrl || '',
        notes: val.notes || '',
        maxSlots: 2,
        pricePerMonthUsd: Number(val.pricePerMonthUsd) === 2 ? 2 : 1,
        monthsCount: Math.max(1, Number(val.monthsCount) || 1),
        startDate: val.startDate || new Date().toISOString().split('T')[0],
      } as Partial<ProviderAccountDetailed>);
    }
    this.isAccountModalOpen.set(false);
  }

  async deleteAccountConfirm(acc: ProviderAccountDetailed): Promise<void> {
    const ok = confirm(`Ви дійсно бажаєте видалити акаунт "${acc.name}"? Клієнти будуть відкріплені.`);
    if (ok) {
      await this.dataService.deleteAccount(acc.id);
    }
  }

  openAssignClientDialog(acc: ProviderAccountDetailed): void {
    if ((acc.assignedClientIds?.length || 0) >= 2) {
      alert('Цей акаунт вже має максимальну кількість підключень (2 користувачі).');
      return;
    }
    this.clientSearchControl.setValue('');
    this.targetAccountForAssign.set(acc);
  }

  async assignClient(clientId: string): Promise<void> {
    const target = this.targetAccountForAssign();
    if (!target) return;
    const success = await this.dataService.assignClientToAccount(target.id, clientId, 'assign');
    if (success) {
      this.targetAccountForAssign.set(null);
    }
  }

  async unassignClient(accountId: string, clientId: string, clientName: string): Promise<void> {
    const ok = confirm(`Відкріпити абонента ${clientName} від цього акаунту?`);
    if (ok) {
      await this.dataService.assignClientToAccount(accountId, clientId, 'unassign');
    }
  }

  toggleShowPassword(id: string): void {
    this.showPasswordMap.update((map) => ({
      ...map,
      [id]: !map[id],
    }));
  }

  copyText(text: string, key: string): void {
    navigator.clipboard.writeText(text);
    this.copiedKey.set(key);
    setTimeout(() => {
      if (this.copiedKey() === key) {
        this.copiedKey.set(null);
      }
    }, 2000);
  }

  formatDate(dateStr?: string): string {
    if (!dateStr) return '—';
    return formatDateUa(dateStr, true);
  }

  getCleanPhone(phone: string): string {
    return cleanPhoneNumber(phone);
  }
}
