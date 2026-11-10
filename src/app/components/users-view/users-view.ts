import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { IptvData } from '../../services/iptv-data';
import {
  AppUser,
  UserRole,
  AppTabId,
  SettingsSectionId,
  ALL_USER_ASSIGNABLE_TABS,
  ALL_SETTINGS_SECTIONS,
  DEFAULT_USER_TABS,
  extractAllowedSettingsFromUser,
  formatDateUa,
  Client,
} from '../../models/client.model';
import { UtilityAccount } from '../../models/utility.model';

type UserFilterRole = 'all' | 'new' | 'user' | 'admin';

@Component({
  selector: 'app-users-view',
  imports: [ReactiveFormsModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <!-- Top Title & Overview Banner -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div class="flex items-center gap-2">
            <h2 class="text-lg font-bold text-slate-900">Користувачі, Привʼязка Будинків та Доступ до Вкладок</h2>
            <span class="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold font-mono">
              {{ users().length }}
            </span>
          </div>
          <p class="text-xs text-slate-500 mt-1">
            Кожен користувач бачить лише власні дані та будинки, привʼязані адміністратором. Адміністратор може вмикати та вимикати доступ до окремих вкладок для кожного користувача.
          </p>
        </div>

        <div class="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            (click)="enterTestSandbox()"
            [disabled]="isLoading()"
            class="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            title="Перемкнутись на тестовий акаунт та перевірити відображення даних і дозволів очима іншого користувача"
          >
            <mat-icon class="text-sm">science</mat-icon>
            <span>Увійти в Тестовий акаунт</span>
          </button>

          <button
            type="button"
            (click)="refreshUsers()"
            [disabled]="isLoading()"
            class="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200"
            title="Оновити список"
          >
            <mat-icon [class.animate-spin]="isLoading()" class="text-sm">refresh</mat-icon>
            <span>Оновити</span>
          </button>

          <button
            type="button"
            (click)="isAddModalOpen.set(true)"
            class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
          >
            <mat-icon class="text-sm">person_add</mat-icon>
            <span>+ Додати користувача</span>
          </button>
        </div>
      </div>

      <!-- Stats Grid -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <!-- Total Users -->
        <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div class="flex items-center justify-between">
            <span class="text-2xs font-bold text-slate-500 uppercase tracking-wider">Всього акаунтів</span>
            <div class="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
              <mat-icon class="text-base">group</mat-icon>
            </div>
          </div>
          <div class="text-2xl font-black text-slate-900 mt-2">{{ users().length }}</div>
          <div class="text-3xs text-slate-400 mt-0.5">Зареєстровані Google акаунти</div>
        </div>

        <!-- Admins -->
        <div class="bg-white p-4 rounded-2xl border border-emerald-200/80 shadow-xs">
          <div class="flex items-center justify-between">
            <span class="text-2xs font-bold text-emerald-700 uppercase tracking-wider">Адміністратори</span>
            <div class="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <mat-icon class="text-base">admin_panel_settings</mat-icon>
            </div>
          </div>
          <div class="text-2xl font-black text-emerald-700 mt-2">{{ adminCount() }}</div>
          <div class="text-3xs text-emerald-600 font-medium mt-0.5">👑 Повний доступ (всі вкладки і будинки)</div>
        </div>

        <!-- Users -->
        <div class="bg-white p-4 rounded-2xl border border-sky-200/80 shadow-xs">
          <div class="flex items-center justify-between">
            <span class="text-2xs font-bold text-sky-700 uppercase tracking-wider">Користувачі</span>
            <div class="w-7 h-7 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center">
              <mat-icon class="text-base">manage_accounts</mat-icon>
            </div>
          </div>
          <div class="text-2xl font-black text-sky-700 mt-2">{{ viewerCount() }}</div>
          <div class="text-3xs text-sky-600 font-medium mt-0.5">👤 Власні дані + привʼязані будинки</div>
        </div>

        <!-- Pending New Users -->
        <div
          class="p-4 rounded-2xl border shadow-xs transition-colors"
          [class.bg-amber-50]="pendingCount() > 0"
          [class.border-amber-300]="pendingCount() > 0"
          [class.bg-white]="pendingCount() === 0"
          [class.border-slate-200]="pendingCount() === 0"
        >
          <div class="flex items-center justify-between">
            <span class="text-2xs font-bold text-amber-800 uppercase tracking-wider">Очікують доступу</span>
            <div class="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center relative">
              <mat-icon class="text-base">hourglass_top</mat-icon>
              @if (pendingCount() > 0) {
                <span class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping"></span>
              }
            </div>
          </div>
          <div class="text-2xl font-black text-amber-700 mt-2">{{ pendingCount() }}</div>
          <div class="text-3xs text-amber-700 font-medium mt-0.5">⏳ Нові запити (без доступу)</div>
        </div>
      </div>

      <!-- Pending Alert Banner if any new users -->
      @if (pendingCount() > 0) {
        <div class="p-4 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 flex items-center justify-between gap-4 shadow-xs">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-700 flex items-center justify-center shrink-0">
              <mat-icon class="text-xl">notification_important</mat-icon>
            </div>
            <div>
              <div class="text-xs font-bold text-amber-900">
                Є {{ pendingCount() }} новий(х) запит(ів) на доступ до застосунку!
              </div>
              <div class="text-2xs text-amber-700 mt-0.5">
                Надайте користувачам роль «Користувач» (та оберіть дозволені вкладки й будинки) або «Адміністратор».
              </div>
            </div>
          </div>

          <button
            type="button"
            (click)="selectedRoleFilter.set('new')"
            class="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shrink-0 cursor-pointer shadow-xs transition-colors"
          >
            Показати нових
          </button>
        </div>
      }

      <!-- Search & Filters -->
      <div class="flex flex-col sm:flex-row items-center justify-between gap-3">
        <!-- Role Filter Tabs -->
        <div class="flex items-center p-1 bg-slate-200/80 rounded-xl w-full sm:w-auto overflow-x-auto">
          <button
            type="button"
            (click)="selectedRoleFilter.set('all')"
            class="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap"
            [class.bg-white]="selectedRoleFilter() === 'all'"
            [class.text-slate-900]="selectedRoleFilter() === 'all'"
            [class.shadow-xs]="selectedRoleFilter() === 'all'"
            [class.text-slate-600]="selectedRoleFilter() !== 'all'"
          >
            Всі ({{ users().length }})
          </button>

          <button
            type="button"
            (click)="selectedRoleFilter.set('new')"
            class="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap flex items-center gap-1"
            [class.bg-amber-500]="selectedRoleFilter() === 'new'"
            [class.text-white]="selectedRoleFilter() === 'new'"
            [class.shadow-xs]="selectedRoleFilter() === 'new'"
            [class.text-slate-600]="selectedRoleFilter() !== 'new'"
          >
            <span>⏳ Очікують</span>
            @if (pendingCount() > 0) {
              <span class="px-1.5 py-0.2 rounded-full text-3xs font-bold" [class.bg-white]="selectedRoleFilter() === 'new'" [class.text-amber-700]="selectedRoleFilter() === 'new'" [class.bg-amber-100]="selectedRoleFilter() !== 'new'" [class.text-amber-800]="selectedRoleFilter() !== 'new'">
                {{ pendingCount() }}
              </span>
            }
          </button>

          <button
            type="button"
            (click)="selectedRoleFilter.set('user')"
            class="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap"
            [class.bg-white]="selectedRoleFilter() === 'user'"
            [class.text-sky-700]="selectedRoleFilter() === 'user'"
            [class.shadow-xs]="selectedRoleFilter() === 'user'"
            [class.text-slate-600]="selectedRoleFilter() !== 'user'"
          >
            👤 Користувачі ({{ viewerCount() }})
          </button>

          <button
            type="button"
            (click)="selectedRoleFilter.set('admin')"
            class="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap"
            [class.bg-white]="selectedRoleFilter() === 'admin'"
            [class.text-emerald-700]="selectedRoleFilter() === 'admin'"
            [class.shadow-xs]="selectedRoleFilter() === 'admin'"
            [class.text-slate-600]="selectedRoleFilter() !== 'admin'"
          >
            👑 Адміни ({{ adminCount() }})
          </button>
        </div>

        <!-- Search Input -->
        <div class="relative w-full sm:w-72">
          <mat-icon class="absolute left-3 top-2 text-base text-slate-400">search</mat-icon>
          <input
            type="text"
            [formControl]="searchControl"
            placeholder="Пошук за email або ім'ям..."
            class="w-full pl-9 pr-3 py-1.5 rounded-xl bg-white border border-slate-300 text-slate-900 placeholder-slate-400 text-xs focus:outline-none focus:border-emerald-500 shadow-2xs"
          />
        </div>
      </div>

      <!-- Users List Cards -->
      <div class="space-y-4">
        @for (user of filteredUsers(); track user.id) {
          <div
            class="bg-white rounded-2xl border p-4 sm:p-5 shadow-xs transition-all space-y-4"
            [class.border-amber-300]="user.role === 'new'"
            [class.bg-amber-50/20]="user.role === 'new'"
            [class.border-slate-200]="user.role !== 'new'"
          >
            <!-- Top Row: User Info + Role Actions -->
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <!-- User Info -->
              <div class="flex items-start sm:items-center gap-3.5 min-w-0">
                <img
                  [src]="user.picture || 'https://ui-avatars.com/api/?name=' + user.name + '&background=0284c7&color=fff'"
                  [alt]="user.name"
                  class="w-12 h-12 rounded-2xl object-cover border border-slate-200 shrink-0 shadow-2xs"
                  referrerpolicy="no-referrer"
                />

                <div class="min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-sm font-bold text-slate-900 truncate">{{ user.name }}</span>

                    @if (isCurrentLoggedInUser(user)) {
                      <span class="px-1.5 py-0.2 rounded-md bg-slate-900 text-white text-3xs font-bold">
                        Це ви
                      </span>
                    }

                    @if (user.id === 'user_test_sandbox') {
                      <span class="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-300 text-2xs font-extrabold inline-flex items-center gap-1">
                        <mat-icon class="text-xs leading-none">science</mat-icon>
                        <span>Тестовий акаунт для перевірки</span>
                      </span>
                    }

                    <!-- Role Badge -->
                    @switch (user.role) {
                      @case ('admin') {
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-2xs font-bold border border-emerald-200">
                          <mat-icon class="text-xs">shield</mat-icon>
                          <span>Адміністратор (Повний доступ)</span>
                        </span>
                      }
                      @case ('user') {
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-800 text-2xs font-bold border border-sky-200">
                          <mat-icon class="text-xs">person</mat-icon>
                          <span>Користувач (Власні + привʼязані дані)</span>
                        </span>
                      }
                      @case ('new') {
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-2xs font-bold border border-amber-300 animate-pulse">
                          <mat-icon class="text-xs">lock_clock</mat-icon>
                          <span>Новий (Без доступу)</span>
                        </span>
                      }
                    }
                  </div>

                  <div class="text-xs text-slate-600 font-mono mt-0.5">{{ user.email }}</div>

                  <div class="flex items-center gap-3 text-3xs text-slate-400 mt-1.5 flex-wrap">
                    <span>Створено: {{ formatDate(user.createdAt) }}</span>
                    @if (user.lastLoginAt) {
                      <span>•</span>
                      <span>Останній вхід: {{ formatDate(user.lastLoginAt) }}</span>
                    }
                  </div>
                </div>
              </div>

              <!-- Role Change & Quick Actions -->
              <div class="flex items-center gap-2 flex-wrap shrink-0 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                @if (user.role === 'new') {
                  <!-- Quick Approve for New Users -->
                  <button
                    type="button"
                    (click)="setRole(user, 'user')"
                    [disabled]="isLoading()"
                    class="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white font-bold text-xs flex items-center gap-1 shadow-xs cursor-pointer transition-colors"
                    title="Надати доступ користувача"
                  >
                    <mat-icon class="text-sm">check_circle</mat-icon>
                    <span>Надати доступ (Користувач)</span>
                  </button>

                  <button
                    type="button"
                    (click)="setRole(user, 'admin')"
                    [disabled]="isLoading()"
                    class="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 shadow-xs cursor-pointer transition-colors"
                    title="Надати повний доступ адміністратора"
                  >
                    <mat-icon class="text-sm">shield</mat-icon>
                    <span>Зробити Адміном</span>
                  </button>
                } @else {
                  <!-- Role Select Dropdown -->
                  <div class="flex items-center gap-1.5">
                    <span class="text-2xs text-slate-500 font-medium">Роль:</span>
                    <select
                      [value]="user.role"
                      (change)="onRoleSelectChange(user, $event)"
                      [disabled]="isLoading() || (user.role === 'admin' && adminCount() <= 1)"
                      class="px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-800 text-xs font-semibold focus:outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      <option value="admin">👑 Адміністратор (Всі права)</option>
                      <option value="user">👤 Користувач (Індивідуальний доступ)</option>
                      <option value="new">⏳ Новий (Без доступу)</option>
                    </select>
                  </div>

                  @if (user.role === 'user') {
                    <button
                      type="button"
                      (click)="openPermissionsModal(user)"
                      class="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <mat-icon class="text-sm">tune</mat-icon>
                      <span>Вкладки та Будинки</span>
                    </button>
                  }
                }

                @if (user.role !== 'admin') {
                  <button
                    type="button"
                    (click)="impersonateUser(user)"
                    [disabled]="isLoading()"
                    class="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                    title="Перемкнутись на цей акаунт і побачити застосунок очима цього користувача"
                  >
                    <mat-icon class="text-sm">visibility</mat-icon>
                    <span>Увійти як користувач</span>
                  </button>
                }

                <!-- Delete User -->
                <button
                  type="button"
                  (click)="deleteUser(user)"
                  [disabled]="isLoading() || (user.role === 'admin' && adminCount() <= 1)"
                  class="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Видалити користувача"
                >
                  <mat-icon class="text-base">delete_outline</mat-icon>
                </button>
              </div>
            </div>

            <!-- Extended Per-User Controls: Allowed Tabs + Settings Sections + Assigned Houses (for non-admin users) -->
            @if (user.role === 'user') {
              <div class="pt-3 border-t border-slate-100 grid grid-cols-1 lg:grid-cols-12 gap-4">
                <!-- Left Column: Allowed Tabs & Granular Settings Toggles -->
                <div class="lg:col-span-7 space-y-3">
                  <div class="space-y-2">
                    <div class="flex items-center justify-between flex-wrap gap-2">
                      <span class="text-2xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                        <mat-icon class="text-sm text-indigo-600">tab</mat-icon>
                        <span>Доступні вкладки застосунку (натисніть, щоб увімкнути/вимкнути):</span>
                      </span>
                      <label class="inline-flex items-center gap-1.5 text-2xs font-semibold text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          [checked]="user.canManageOwnData !== false"
                          (change)="toggleUserCanManageOwnData(user, $any($event.target).checked)"
                          class="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span>Дозволити додавати/редагувати свої дані</span>
                      </label>
                    </div>

                    <div class="flex items-center gap-1.5 flex-wrap">
                      @for (tabItem of assignableTabs; track tabItem.id) {
                        @let isEnabled = isUserTabEnabled(user, tabItem.id);
                        <button
                          type="button"
                          (click)="quickToggleUserTab(user, tabItem.id)"
                          class="px-2.5 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-all duration-150 cursor-pointer select-none active:scale-95"
                          [class.bg-emerald-600]="isEnabled"
                          [class.text-white]="isEnabled"
                          [class.border-emerald-600]="isEnabled"
                          [class.shadow-2xs]="isEnabled"
                          [class.bg-slate-50]="!isEnabled"
                          [class.text-slate-500]="!isEnabled"
                          [class.border-slate-200]="!isEnabled"
                          [title]="isEnabled ? 'Вимкнути вкладку «' + tabItem.label + '»' : 'Увімкнути вкладку «' + tabItem.label + '»'"
                        >
                          <mat-icon class="text-sm leading-none">{{ tabItem.icon }}</mat-icon>
                          <span>{{ tabItem.label }}</span>
                          <mat-icon class="text-xs leading-none">{{ isEnabled ? 'check_circle' : 'block' }}</mat-icon>
                        </button>
                      }
                    </div>
                  </div>

                  <!-- Granular Settings Sections Access -->
                  <div class="pt-2.5 border-t border-slate-100 space-y-2">
                    <div class="flex items-center justify-between flex-wrap gap-2">
                      <span class="text-2xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                        <mat-icon class="text-sm text-slate-700">settings</mat-icon>
                        <span>Доступ до окремих пунктів системних налаштувань ({{ getUserAllowedSettings(user).length }}/{{ allSettingsSections.length }}):</span>
                      </span>
                      @if (getUserAllowedSettings(user).length === 0) {
                        <span class="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-3xs font-semibold flex items-center gap-1">
                          <mat-icon class="text-3xs">lock</mat-icon>
                          <span>Системні налаштування закрито</span>
                        </span>
                      }
                    </div>

                    <div class="flex items-center gap-1.5 flex-wrap">
                      @for (sec of allSettingsSections; track sec.id) {
                        @let secEnabled = isUserSettingsSectionEnabled(user, sec.id);
                        <button
                          type="button"
                          (click)="quickToggleUserSettingsSection(user, sec.id)"
                          class="px-2.5 py-1 rounded-xl text-2xs font-semibold border flex items-center gap-1 transition-all duration-150 cursor-pointer select-none active:scale-95"
                          [class.bg-indigo-600]="secEnabled"
                          [class.text-white]="secEnabled"
                          [class.border-indigo-600]="secEnabled"
                          [class.shadow-2xs]="secEnabled"
                          [class.bg-slate-50]="!secEnabled"
                          [class.text-slate-500]="!secEnabled"
                          [class.border-slate-200]="!secEnabled"
                          [title]="sec.subtitle"
                        >
                          <mat-icon class="text-xs leading-none">{{ sec.icon }}</mat-icon>
                          <span>{{ sec.label }}</span>
                          <mat-icon class="text-3xs leading-none">{{ secEnabled ? 'check_circle' : 'lock' }}</mat-icon>
                        </button>
                      }
                    </div>
                  </div>
                </div>

                <!-- Right Column: Bound Houses / Utility Accounts -->
                <div class="lg:col-span-5 space-y-2 lg:border-l lg:border-slate-100 lg:pl-4">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-2xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                      <mat-icon class="text-sm text-amber-600">home_work</mat-icon>
                      <span>Привʼязані будинки / рахунки ({{ getUserBoundHouses(user).length }}):</span>
                    </span>
                    <button
                      type="button"
                      (click)="openPermissionsModal(user)"
                      class="text-2xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5 cursor-pointer"
                    >
                      <mat-icon class="text-xs">add_link</mat-icon>
                      <span>Привʼязати будинок</span>
                    </button>
                  </div>

                  @if (getUserBoundHouses(user).length > 0) {
                    <div class="flex items-center gap-1.5 flex-wrap">
                      @for (house of getUserBoundHouses(user); track house.id) {
                        <span
                          class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-2xs font-semibold border bg-amber-50 border-amber-200 text-amber-900"
                        >
                          <mat-icon class="text-xs leading-none">home</mat-icon>
                          <span>{{ house.name }} ({{ house.accountNumber }})</span>
                          @if (house.ownerUserId === user.id) {
                            <span class="px-1 py-0.2 rounded bg-white/80 text-3xs font-bold">Власний</span>
                          } @else {
                            <button
                              type="button"
                              (click)="quickToggleHouseAssignment(user, house.id)"
                              class="hover:text-rose-600 cursor-pointer ml-0.5"
                              title="Відкріпити будинок від користувача"
                            >
                              <mat-icon class="text-xs leading-none">close</mat-icon>
                            </button>
                          }
                        </span>
                      }
                    </div>
                  } @else {
                    <div class="text-2xs text-slate-400 italic bg-slate-50 rounded-xl px-3 py-2 border border-slate-200/70">
                      Немає привʼязаних будинків адміна. Користувач бачитиме лише свої рахунки.
                    </div>
                  }

                  <!-- Bound IPTV Clients (Клієнти та групи) -->
                  <div class="pt-2 border-t border-slate-100 space-y-1.5">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-2xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                        <mat-icon class="text-sm text-indigo-600">groups</mat-icon>
                        <span>Прив'язані IPTV Абоненти ({{ getUserBoundClients(user).length }}):</span>
                      </span>
                      <button
                        type="button"
                        (click)="openPermissionsModal(user)"
                        class="text-2xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5 cursor-pointer"
                      >
                        <mat-icon class="text-xs">add_link</mat-icon>
                        <span>Прив'язати акаунт</span>
                      </button>
                    </div>

                    @if (getUserBoundClients(user).length > 0) {
                      <div class="flex items-center gap-1.5 flex-wrap">
                        @for (c of getUserBoundClients(user); track c.id) {
                          <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-2xs font-semibold border bg-indigo-50 border-indigo-200 text-indigo-900">
                            <mat-icon class="text-xs leading-none text-indigo-600">person</mat-icon>
                            <span>{{ c.fullName }} ({{ c.balance }} ₴)</span>
                          </span>
                        }
                      </div>
                    } @else {
                      <div class="text-3xs text-slate-400 italic">Абонентів з «Клієнти та групи» не прив'язано</div>
                    }
                  </div>
                </div>
              </div>
            }
          </div>
        } @empty {
          <div class="text-center py-12 bg-white rounded-2xl border border-slate-200 p-8">
            <mat-icon class="text-4xl text-slate-300 mb-2">person_search</mat-icon>
            <div class="text-sm font-bold text-slate-700">Користувачів не знайдено</div>
            <div class="text-xs text-slate-400 mt-1">Змініть фільтр або додайте нового користувача через кнопку вище.</div>
          </div>
        }
      </div>

      <!-- MODAL: PERMISSIONS, TABS & HOUSE BINDING -->
      @if (editingUserForPermissions(); as targetUser) {
        <div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div class="bg-white rounded-3xl p-6 sm:p-7 max-w-2xl w-full shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
            <!-- Header -->
            <div class="flex items-center justify-between pb-4 border-b border-slate-100 shrink-0">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                  <mat-icon class="text-xl">admin_panel_settings</mat-icon>
                </div>
                <div>
                  <h3 class="text-base font-bold text-slate-900">
                    Налаштування доступу: {{ targetUser.name }}
                  </h3>
                  <p class="text-xs text-slate-500 font-mono">{{ targetUser.email }}</p>
                </div>
              </div>
              <button
                type="button"
                (click)="closePermissionsModal()"
                class="text-slate-400 hover:text-slate-600 cursor-pointer p-1"
              >
                <mat-icon>close</mat-icon>
              </button>
            </div>

            <!-- Scrollable Body -->
            <div class="py-4 space-y-5 overflow-y-auto flex-1 pr-1">
              <!-- Section 1: Data Editing Permission -->
              <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-4">
                <div>
                  <div class="text-xs font-bold text-slate-900">Дозвіл на внесення показів та створення власних рахунків</div>
                  <div class="text-2xs text-slate-500 mt-0.5">
                    Якщо увімкнено, користувач може додавати власні будинки та вносити покази лічильників.
                  </div>
                </div>
                <input
                  type="checkbox"
                  [checked]="modalCanManageOwnData()"
                  (change)="modalCanManageOwnData.set($any($event.target).checked)"
                  class="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer shrink-0"
                />
              </div>

              <!-- Section 2: Allowed Application Tabs -->
              <div class="space-y-2.5">
                <div class="flex items-center justify-between">
                  <div class="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <mat-icon class="text-base text-indigo-600">tab</mat-icon>
                    <span>Доступ до вкладок застосунку</span>
                  </div>
                  <div class="flex items-center gap-2 text-2xs">
                    <button
                      type="button"
                      (click)="selectAllModalTabs()"
                      class="text-indigo-600 hover:underline font-semibold cursor-pointer"
                    >
                      Увімкнути всі
                    </button>
                    <span class="text-slate-300">•</span>
                    <button
                      type="button"
                      (click)="selectUtilityOnlyModalTabs()"
                      class="text-amber-700 hover:underline font-semibold cursor-pointer"
                    >
                      Тільки Комунальні (Електро + Вода)
                    </button>
                  </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  @for (tabItem of assignableTabs; track tabItem.id) {
                    @let checked = modalAllowedTabs().includes(tabItem.id);
                    <button
                      type="button"
                      (click)="toggleModalTab(tabItem.id)"
                      class="p-3 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer"
                      [class.bg-emerald-50/80]="checked"
                      [class.border-emerald-400]="checked"
                      [class.bg-white]="!checked"
                      [class.border-slate-200]="!checked"
                    >
                      <div class="flex items-center gap-2.5">
                        <div
                          class="w-8 h-8 rounded-lg flex items-center justify-center"
                          [class.bg-emerald-600]="checked"
                          [class.text-white]="checked"
                          [class.bg-slate-100]="!checked"
                          [class.text-slate-500]="!checked"
                        >
                          <mat-icon class="text-base">{{ tabItem.icon }}</mat-icon>
                        </div>
                        <div>
                          <div class="text-xs font-bold text-slate-900">{{ tabItem.label }}</div>
                          <div class="text-3xs text-slate-500">{{ checked ? 'Доступ відкрито' : 'Приховано' }}</div>
                        </div>
                      </div>
                      <mat-icon
                        class="text-lg"
                        [class.text-emerald-600]="checked"
                        [class.text-slate-300]="!checked"
                      >
                        {{ checked ? 'check_box' : 'check_box_outline_blank' }}
                      </mat-icon>
                    </button>
                  }
                </div>
              </div>

              <!-- Section 2B: Granular System Settings Permissions -->
              <div class="space-y-2.5">
                <div class="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div class="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <mat-icon class="text-base text-slate-700">settings</mat-icon>
                      <span>Доступ до окремих пунктів Системних налаштувань</span>
                    </div>
                    <p class="text-2xs text-slate-500 mt-0.5">
                      За замовчуванням системні налаштування закриті для користувачів. Оберіть окремі пункти, до яких потрібно відкрити доступ.
                    </p>
                  </div>
                  <div class="flex items-center gap-2 text-2xs">
                    <button
                      type="button"
                      (click)="selectAllModalSettings()"
                      class="text-indigo-600 hover:underline font-semibold cursor-pointer"
                    >
                      Відкрити всі
                    </button>
                    <span class="text-slate-300">•</span>
                    <button
                      type="button"
                      (click)="clearAllModalSettings()"
                      class="text-rose-600 hover:underline font-semibold cursor-pointer"
                    >
                      Закрити всі
                    </button>
                  </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  @for (sec of allSettingsSections; track sec.id) {
                    @let secChecked = modalAllowedSettings().includes(sec.id);
                    <button
                      type="button"
                      (click)="toggleModalSettingsSection(sec.id)"
                      class="p-3 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer"
                      [class.bg-indigo-50/80]="secChecked"
                      [class.border-indigo-400]="secChecked"
                      [class.bg-white]="!secChecked"
                      [class.border-slate-200]="!secChecked"
                    >
                      <div class="flex items-center gap-2.5 min-w-0">
                        <div
                          class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          [class.bg-indigo-600]="secChecked"
                          [class.text-white]="secChecked"
                          [class.bg-slate-100]="!secChecked"
                          [class.text-slate-500]="!secChecked"
                        >
                          <mat-icon class="text-base">{{ sec.icon }}</mat-icon>
                        </div>
                        <div class="min-w-0">
                          <div class="text-xs font-bold text-slate-900 truncate">{{ sec.label }}</div>
                          <div class="text-3xs text-slate-500 truncate">{{ sec.subtitle }}</div>
                        </div>
                      </div>
                      <mat-icon
                        class="text-lg shrink-0"
                        [class.text-indigo-600]="secChecked"
                        [class.text-slate-300]="!secChecked"
                      >
                        {{ secChecked ? 'check_box' : 'check_box_outline_blank' }}
                      </mat-icon>
                    </button>
                  }
                </div>
              </div>

              <!-- Section 3: Bind Existing Houses / Utility Accounts -->
              <div class="space-y-2.5">
                <div>
                  <div class="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <mat-icon class="text-base text-amber-600">home_work</mat-icon>
                    <span>Привʼязка будинків (особових рахунків електроенергії та води)</span>
                  </div>
                  <p class="text-2xs text-slate-500 mt-0.5">
                    Оберіть будинки, створені адміністратором, щоб привʼязати їх до акаунту цього користувача. Користувач бачитиме їхні графіки, покази та нарахування.
                  </p>
                </div>

                @if (allUtilityAccounts().length > 0) {
                  <div class="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto pr-1">
                    @for (acc of allUtilityAccounts(); track acc.id) {
                      @let isOwner = acc.ownerUserId === targetUser.id;
                      @let isBound = isOwner || modalAssignedUtilityIds().includes(acc.id);
                      <button
                        type="button"
                        (click)="!isOwner && toggleModalUtilityAccount(acc.id)"
                        class="p-3 rounded-xl border text-left flex items-center justify-between gap-3 transition-all cursor-pointer"
                        [class.bg-amber-50/70]="isBound && acc.type === 'electricity'"
                        [class.border-amber-400]="isBound && acc.type === 'electricity'"
                        [class.bg-cyan-50/70]="isBound && acc.type === 'water_waste'"
                        [class.border-cyan-400]="isBound && acc.type === 'water_waste'"
                        [class.bg-white]="!isBound"
                        [class.border-slate-200]="!isBound"
                      >
                        <div class="flex items-center gap-3 min-w-0">
                          <div
                            class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                            [class.bg-amber-500]="acc.type === 'electricity'"
                            [class.bg-cyan-600]="acc.type === 'water_waste'"
                            class="text-white"
                          >
                            <mat-icon class="text-base">{{ acc.type === 'electricity' ? 'bolt' : 'water_drop' }}</mat-icon>
                          </div>
                          <div class="min-w-0">
                            <div class="flex items-center gap-2 flex-wrap">
                              <span class="text-xs font-bold text-slate-900">{{ acc.name }}</span>
                              <span class="px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-mono text-3xs font-semibold">
                                № {{ acc.accountNumber }}
                              </span>
                              <span class="text-3xs font-bold uppercase px-1.5 py-0.2 rounded"
                                [class.bg-amber-100]="acc.type === 'electricity'"
                                [class.text-amber-800]="acc.type === 'electricity'"
                                [class.bg-cyan-100]="acc.type === 'water_waste'"
                                [class.text-cyan-800]="acc.type === 'water_waste'"
                              >
                                {{ acc.type === 'electricity' ? 'Електроенергія' : 'Вода та сміття' }}
                              </span>
                              @if (isOwner) {
                                <span class="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 text-3xs font-bold">
                                  Створено цим користувачем
                                </span>
                              }
                            </div>
                            @if (acc.address) {
                              <div class="text-2xs text-slate-500 truncate mt-0.5">{{ acc.address }}</div>
                            }
                          </div>
                        </div>

                        <mat-icon
                          class="text-lg shrink-0"
                          [class.text-emerald-600]="isBound"
                          [class.text-slate-300]="!isBound"
                        >
                          {{ isBound ? 'check_circle' : 'radio_button_unchecked' }}
                        </mat-icon>
                      </button>
                    }
                  </div>
                } @else {
                  <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 text-center">
                    У системі ще немає створених будинків (особових рахунків електроенергії або води).
                  </div>
                }
              </div>

              <!-- Section 4: Bind IPTV Clients from "Клієнти та групи" -->
              <div class="space-y-2.5">
                <div>
                  <div class="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <mat-icon class="text-base text-indigo-600">groups</mat-icon>
                    <span>Привʼязка акаунтів абонентів з розділу «Клієнти та групи»</span>
                  </div>
                  <p class="text-2xs text-slate-500 mt-0.5">
                    Адміністратор може привʼязати конкретного IPTV клієнта / групу підписок до даного користувача для перегляду та керування його балансом і підписками.
                  </p>
                </div>

                @if (allClients().length > 0) {
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                    @for (c of allClients(); track c.id) {
                      @let isClientBound = isClientBoundInModal(c.id, c.ownerUserId);
                      <button
                        type="button"
                        (click)="toggleModalClient(c.id)"
                        class="p-2.5 rounded-xl border text-left flex items-center justify-between gap-2 transition-all cursor-pointer"
                        [class.bg-indigo-50/80]="isClientBound"
                        [class.border-indigo-400]="isClientBound"
                        [class.bg-white]="!isClientBound"
                        [class.border-slate-200]="!isClientBound"
                      >
                        <div class="min-w-0">
                          <div class="flex items-center gap-1.5 flex-wrap">
                            <span class="text-xs font-bold text-slate-900 truncate">{{ c.fullName }}</span>
                            @if (c.groupName) {
                              <span class="px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800 text-3xs font-semibold">
                                {{ c.groupName }}
                              </span>
                            }
                          </div>
                          <div class="text-3xs text-slate-500 truncate mt-0.5">
                            Баланс: {{ c.balance }} ₴ | План: {{ c.subscriptionPlan }}
                          </div>
                        </div>

                        <mat-icon
                          class="text-lg shrink-0"
                          [class.text-indigo-600]="isClientBound"
                          [class.text-slate-300]="!isClientBound"
                        >
                          {{ isClientBound ? 'check_box' : 'check_box_outline_blank' }}
                        </mat-icon>
                      </button>
                    }
                  </div>
                } @else {
                  <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 text-center">
                    У розділі «Клієнти та групи» ще немає створених абонентів.
                  </div>
                }
              </div>
            </div>

            <!-- Footer -->
            <div class="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                (click)="closePermissionsModal()"
                class="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
              >
                Скасувати
              </button>
              <button
                type="button"
                (click)="saveModalPermissions()"
                [disabled]="isLoading()"
                class="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <mat-icon class="text-sm">save</mat-icon>
                <span>Зберегти налаштування користувача</span>
              </button>
            </div>
          </div>
        </div>
      }

      <!-- ADD USER MODAL -->
      @if (isAddModalOpen()) {
        <div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div class="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-200">
            <div class="flex items-center justify-between mb-5">
              <div class="flex items-center gap-2.5">
                <div class="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <mat-icon class="text-xl">person_add</mat-icon>
                </div>
                <h3 class="text-base font-bold text-slate-900">Додати / Схвалити Google акаунт</h3>
              </div>
              <button
                type="button"
                (click)="isAddModalOpen.set(false)"
                class="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <mat-icon>close</mat-icon>
              </button>
            </div>

            <form [formGroup]="addUserForm" (ngSubmit)="submitAddUser()" class="space-y-4">
              <div>
                <label for="add-user-email-input" class="block text-2xs font-bold text-slate-700 uppercase tracking-wider mb-1">Google Email *</label>
                <input
                  id="add-user-email-input"
                  type="email"
                  formControlName="email"
                  placeholder="user@gmail.com"
                  class="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label for="add-user-name-input" class="block text-2xs font-bold text-slate-700 uppercase tracking-wider mb-1">Імʼя користувача</label>
                <input
                  id="add-user-name-input"
                  type="text"
                  formControlName="name"
                  placeholder="Олександр Петренко"
                  class="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label for="add-user-role-select" class="block text-2xs font-bold text-slate-700 uppercase tracking-wider mb-1">Рівень доступу (Роль)</label>
                <select
                  id="add-user-role-select"
                  formControlName="role"
                  class="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs font-semibold focus:outline-none focus:border-emerald-500"
                >
                  <option value="user">👤 Користувач (Власні дані + вибрані вкладки/будинки)</option>
                  <option value="admin">👑 Адміністратор (Всі права)</option>
                  <option value="new">⏳ Новий (Без доступу)</option>
                </select>
              </div>

              <div class="pt-2 flex gap-2">
                <button
                  type="button"
                  (click)="isAddModalOpen.set(false)"
                  class="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
                >
                  Скасувати
                </button>

                <button
                  type="submit"
                  [disabled]="addUserForm.invalid || isLoading()"
                  class="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  Зберегти доступ
                </button>
              </div>
            </form>
          </div>
        </div>
      }
    </div>
  `,
})
export class UsersView {
  private readonly dataService = inject(IptvData);

  async enterTestSandbox(): Promise<void> {
    await this.dataService.switchToTestUser();
  }

  async impersonateUser(user: AppUser): Promise<void> {
    await this.dataService.switchToTestUser(user);
  }

  readonly users = this.dataService.usersList;
  readonly currentUser = this.dataService.currentUser;
  readonly isLoading = this.dataService.isLoading;
  readonly pendingCount = this.dataService.pendingUsersCount;
  readonly assignableTabs = ALL_USER_ASSIGNABLE_TABS;
  readonly allSettingsSections = ALL_SETTINGS_SECTIONS;

  readonly allUtilityAccounts = computed<UtilityAccount[]>(() => {
    const adminList = this.dataService.adminUtilityAccounts();
    if (adminList.length > 0) return adminList;
    return this.dataService.utilityAccounts();
  });

  readonly selectedRoleFilter = signal<UserFilterRole>('all');
  readonly searchControl = new FormControl('');
  readonly isAddModalOpen = signal<boolean>(false);

  // Permissions, House & Client Binding Modal state
  readonly editingUserForPermissions = signal<AppUser | null>(null);
  readonly modalAllowedTabs = signal<AppTabId[]>([]);
  readonly modalAllowedSettings = signal<SettingsSectionId[]>([]);
  readonly modalAssignedUtilityIds = signal<string[]>([]);
  readonly modalAssignedClientIds = signal<string[]>([]);
  readonly modalCanManageOwnData = signal<boolean>(true);

  readonly allClients = computed<Client[]>(() => this.dataService.clients());

  readonly addUserForm = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email]),
    name: new FormControl(''),
    role: new FormControl<UserRole>('user', [Validators.required]),
  });

  readonly adminCount = computed(() => this.users().filter((u) => u.role === 'admin').length);
  readonly viewerCount = computed(() => this.users().filter((u) => u.role === 'user').length);

  readonly filteredUsers = computed(() => {
    const list = this.users();
    const filter = this.selectedRoleFilter();
    const query = (this.searchControl.value || '').trim().toLowerCase();

    return list.filter((user) => {
      if (filter !== 'all' && user.role !== filter) {
        return false;
      }
      if (query) {
        const matchesEmail = user.email.toLowerCase().includes(query);
        const matchesName = (user.name || '').toLowerCase().includes(query);
        return matchesEmail || matchesName;
      }
      return true;
    });
  });

  constructor() {
    this.dataService.fetchAdminUtilityAccounts();
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    return formatDateUa(dateStr);
  }

  isCurrentLoggedInUser(user: AppUser): boolean {
    const curr = this.currentUser();
    return !!curr && (curr.id === user.id || curr.email.toLowerCase() === user.email.toLowerCase());
  }

  getUserAllowedTabs(user: AppUser): AppTabId[] {
    if (user.role === 'admin') {
      return this.assignableTabs.map((t) => t.id);
    }
    if (Array.isArray(user.allowedTabs)) {
      const expanded = new Set<AppTabId>(user.allowedTabs);
      if (expanded.has('water_waste')) {
        expanded.add('water');
        expanded.add('waste');
      }
      return Array.from(expanded);
    }
    return [...DEFAULT_USER_TABS];
  }

  getUserAllowedSettings(user: AppUser): SettingsSectionId[] {
    return extractAllowedSettingsFromUser(user);
  }

  isUserSettingsSectionEnabled(user: AppUser, sectionId: SettingsSectionId): boolean {
    return this.getUserAllowedSettings(user).includes(sectionId);
  }

  async quickToggleUserSettingsSection(user: AppUser, sectionId: SettingsSectionId): Promise<void> {
    const currentSecs = this.getUserAllowedSettings(user);
    const nextSecs: SettingsSectionId[] = currentSecs.includes(sectionId)
      ? currentSecs.filter((s) => s !== sectionId)
      : [...currentSecs, sectionId];
    const currentTabs = this.getUserAllowedTabs(user).filter((t) => t !== 'settings');
    const nextTabs: AppTabId[] = nextSecs.length > 0 ? [...currentTabs, 'settings'] : currentTabs;
    await this.dataService.updateUserPermissions(user.id, {
      allowedTabs: nextTabs,
      allowedSettings: nextSecs,
    });
  }

  isUserTabEnabled(user: AppUser, tabId: AppTabId): boolean {
    if (tabId === 'settings') {
      return user.role === 'admin' || this.getUserAllowedSettings(user).length > 0;
    }
    return this.getUserAllowedTabs(user).includes(tabId);
  }

  async quickToggleUserTab(user: AppUser, tabId: AppTabId): Promise<void> {
    const currentTabs = this.getUserAllowedTabs(user);
    let nextTabs: AppTabId[];
    if (currentTabs.includes(tabId)) {
      nextTabs = currentTabs.filter((t) => t !== tabId && !( (tabId === 'water' || tabId === 'waste') && t === 'water_waste' ));
    } else {
      nextTabs = [...currentTabs, tabId];
    }
    await this.dataService.updateUserPermissions(user.id, {
      allowedTabs: nextTabs,
    });
  }

  async toggleUserCanManageOwnData(user: AppUser, canManage: boolean): Promise<void> {
    await this.dataService.updateUserPermissions(user.id, {
      canManageOwnData: canManage,
    });
  }

  getUserBoundHouses(user: AppUser): UtilityAccount[] {
    const all = this.allUtilityAccounts();
    const assignedSet = new Set(user.assignedUtilityAccountIds || []);
    return all.filter(
      (acc) =>
        acc.ownerUserId === user.id ||
        assignedSet.has(acc.id) ||
        (Array.isArray(acc.assignedUserIds) && acc.assignedUserIds.includes(user.id))
    );
  }

  async quickToggleHouseAssignment(user: AppUser, accountId: string): Promise<void> {
    const currentAssigned = new Set(user.assignedUtilityAccountIds || []);
    for (const acc of this.allUtilityAccounts()) {
      if (Array.isArray(acc.assignedUserIds) && acc.assignedUserIds.includes(user.id)) {
        currentAssigned.add(acc.id);
      }
    }
    if (currentAssigned.has(accountId)) {
      currentAssigned.delete(accountId);
    } else {
      currentAssigned.add(accountId);
    }
    await this.dataService.updateUserPermissions(user.id, {
      assignedUtilityAccountIds: Array.from(currentAssigned),
    });
  }

  getUserBoundClients(user: AppUser): Client[] {
    const assignedSet = new Set(user.assignedClientIds || []);
    return this.allClients().filter(
      (c) => assignedSet.has(String(c.id)) || c.ownerUserId === user.id
    );
  }

  openPermissionsModal(user: AppUser): void {
    this.editingUserForPermissions.set(user);
    this.modalAllowedTabs.set([...this.getUserAllowedTabs(user)]);
    this.modalAllowedSettings.set([...this.getUserAllowedSettings(user)]);

    const assignedHouseSet = new Set(user.assignedUtilityAccountIds || []);
    for (const acc of this.allUtilityAccounts()) {
      if (Array.isArray(acc.assignedUserIds) && acc.assignedUserIds.includes(user.id)) {
        assignedHouseSet.add(acc.id);
      }
    }
    this.modalAssignedUtilityIds.set(Array.from(assignedHouseSet));
    this.modalAssignedClientIds.set([...(user.assignedClientIds || [])]);
    this.modalCanManageOwnData.set(user.canManageOwnData !== false);
  }

  closePermissionsModal(): void {
    this.editingUserForPermissions.set(null);
  }

  toggleModalTab(tabId: AppTabId): void {
    const cur = this.modalAllowedTabs();
    if (cur.includes(tabId)) {
      if (cur.length <= 1) return;
      this.modalAllowedTabs.set(
        cur.filter((t) => t !== tabId && !((tabId === 'water' || tabId === 'waste') && t === 'water_waste'))
      );
    } else {
      this.modalAllowedTabs.set([...cur, tabId]);
    }
  }

  toggleModalSettingsSection(sectionId: SettingsSectionId): void {
    const cur = this.modalAllowedSettings();
    if (cur.includes(sectionId)) {
      this.modalAllowedSettings.set(cur.filter((s) => s !== sectionId));
    } else {
      this.modalAllowedSettings.set([...cur, sectionId]);
    }
  }

  selectAllModalSettings(): void {
    this.modalAllowedSettings.set(this.allSettingsSections.map((s) => s.id));
  }

  clearAllModalSettings(): void {
    this.modalAllowedSettings.set([]);
  }

  selectAllModalTabs(): void {
    this.modalAllowedTabs.set(this.assignableTabs.map((t) => t.id));
  }

  selectUtilityOnlyModalTabs(): void {
    this.modalAllowedTabs.set(['electricity', 'water', 'waste']);
  }

  toggleModalUtilityAccount(accountId: string): void {
    const cur = this.modalAssignedUtilityIds();
    if (cur.includes(accountId)) {
      this.modalAssignedUtilityIds.set(cur.filter((id) => id !== accountId));
    } else {
      this.modalAssignedUtilityIds.set([...cur, accountId]);
    }
  }

  isClientBoundInModal(clientId: string | number, ownerUserId?: string): boolean {
    const targetUser = this.editingUserForPermissions();
    const strId = String(clientId);
    return (
      this.modalAssignedClientIds().includes(strId) ||
      (!!ownerUserId && !!targetUser && ownerUserId === targetUser.id)
    );
  }

  toggleModalClient(clientId: string | number): void {
    const cur = this.modalAssignedClientIds();
    const strId = String(clientId);
    if (cur.includes(strId)) {
      this.modalAssignedClientIds.set(cur.filter((id) => id !== strId));
    } else {
      this.modalAssignedClientIds.set([...cur, strId]);
    }
  }

  async saveModalPermissions(): Promise<void> {
    const user = this.editingUserForPermissions();
    if (!user) return;
    const settingsSecs = this.modalAllowedSettings();
    const baseTabs = this.modalAllowedTabs().filter((t) => t !== 'settings');
    const finalTabs: AppTabId[] = settingsSecs.length > 0 ? [...baseTabs, 'settings'] : baseTabs;
    const ok = await this.dataService.updateUserPermissions(user.id, {
      allowedTabs: finalTabs,
      allowedSettings: settingsSecs,
      assignedUtilityAccountIds: this.modalAssignedUtilityIds(),
      assignedClientIds: this.modalAssignedClientIds(),
      canManageOwnData: this.modalCanManageOwnData(),
    });
    if (ok) {
      this.closePermissionsModal();
    }
  }

  async refreshUsers(): Promise<void> {
    await this.dataService.fetchUsers();
  }

  async setRole(user: AppUser, role: UserRole): Promise<void> {
    await this.dataService.updateUserRole(user.id, role);
  }

  async onRoleSelectChange(user: AppUser, event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement;
    const newRole = select.value as UserRole;
    if (newRole && newRole !== user.role) {
      await this.dataService.updateUserRole(user.id, newRole);
    }
  }

  async deleteUser(user: AppUser): Promise<void> {
    if (confirm(`Ви впевнені, що бажаєте видалити користувача ${user.email}?`)) {
      await this.dataService.deleteUser(user.id);
    }
  }

  async submitAddUser(): Promise<void> {
    if (this.addUserForm.invalid) return;
    const { email, name, role } = this.addUserForm.getRawValue();
    if (!email) return;

    const res = await this.dataService.addUser(email, name || undefined, role || 'user');
    if (res) {
      this.isAddModalOpen.set(false);
      this.addUserForm.reset({ role: 'user' });
    }
  }
}
