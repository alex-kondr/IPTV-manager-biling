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
import { AppUser, UserRole, formatDateUa } from '../../models/client.model';

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
            <h2 class="text-lg font-bold text-slate-900">Користувачі та Права Доступу</h2>
            <span class="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold font-mono">
              {{ users().length }}
            </span>
          </div>
          <p class="text-xs text-slate-500 mt-1">
            Керування доступом до системи IPTV. Три типи користувачів: Адмін (всі права), Користувач (тільки перегляд), Новий (без доступу).
          </p>
        </div>

        <div class="flex items-center gap-2">
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
          <div class="text-3xs text-emerald-600 font-medium mt-0.5">👑 Повний доступ (всі права)</div>
        </div>

        <!-- Viewers -->
        <div class="bg-white p-4 rounded-2xl border border-sky-200/80 shadow-xs">
          <div class="flex items-center justify-between">
            <span class="text-2xs font-bold text-sky-700 uppercase tracking-wider">Користувачі</span>
            <div class="w-7 h-7 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center">
              <mat-icon class="text-base">visibility</mat-icon>
            </div>
          </div>
          <div class="text-2xl font-black text-sky-700 mt-2">{{ viewerCount() }}</div>
          <div class="text-3xs text-sky-600 font-medium mt-0.5">👁️ Тільки перегляд (без змін)</div>
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
                Надайте користувачам роль «Користувач (Тільки перегляд)» або «Адміністратор», щоб відкрити доступ.
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
            👁️ Перегляд ({{ viewerCount() }})
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
      <div class="space-y-3">
        @for (user of filteredUsers(); track user.id) {
          <div
            class="bg-white rounded-2xl border p-4 sm:p-5 shadow-xs transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
            [class.border-amber-300]="user.role === 'new'"
            [class.bg-amber-50/20]="user.role === 'new'"
            [class.border-slate-200]="user.role !== 'new'"
          >
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
                        <mat-icon class="text-xs">visibility</mat-icon>
                        <span>Користувач (Тільки перегляд)</span>
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

            <!-- Role Change Actions -->
            <div class="flex items-center gap-2 flex-wrap shrink-0 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
              @if (user.role === 'new') {
                <!-- Quick Approve for New Users -->
                <button
                  type="button"
                  (click)="setRole(user, 'user')"
                  [disabled]="isLoading()"
                  class="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white font-bold text-xs flex items-center gap-1 shadow-xs cursor-pointer transition-colors"
                  title="Надати доступ у режимі перегляду"
                >
                  <mat-icon class="text-sm">visibility</mat-icon>
                  <span>Дозволити (Перегляд)</span>
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
                    <option value="user">👁️ Користувач (Тільки перегляд)</option>
                    <option value="new">⏳ Новий (Без доступу)</option>
                  </select>
                </div>
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
        } @empty {
          <div class="text-center py-12 bg-white rounded-2xl border border-slate-200 p-8">
            <mat-icon class="text-4xl text-slate-300 mb-2">person_search</mat-icon>
            <div class="text-sm font-bold text-slate-700">Користувачів не знайдено</div>
            <div class="text-xs text-slate-400 mt-1">Змініть фільтр або додайте нового користувача через кнопку вище.</div>
          </div>
        }
      </div>

      <!-- ADD USER MODAL -->
      @if (isAddModalOpen()) {
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
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
                  <option value="user">👁️ Користувач (Тільки перегляд)</option>
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

  readonly users = this.dataService.usersList;
  readonly currentUser = this.dataService.currentUser;
  readonly isLoading = this.dataService.isLoading;
  readonly pendingCount = this.dataService.pendingUsersCount;

  readonly selectedRoleFilter = signal<UserFilterRole>('all');
  readonly searchControl = new FormControl('');
  readonly isAddModalOpen = signal<boolean>(false);

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

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    return formatDateUa(dateStr);
  }

  isCurrentLoggedInUser(user: AppUser): boolean {
    const curr = this.currentUser();
    return !!curr && (curr.id === user.id || curr.email.toLowerCase() === user.email.toLowerCase());
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
