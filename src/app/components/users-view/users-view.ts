import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { IptvData } from '../../services/iptv-data';
import {
  AppUser,
  UserRole,
  UserAccountStatus,
  HouseholdAccessLevel,
  MemberRelationTag,
  MemberRelationTagMeta,
  MEMBER_RELATION_TAGS,
  HouseholdInvite,
  isUserAccountActive,
  AppTabId,
  SettingsSectionId,
  ALL_USER_ASSIGNABLE_TABS,
  ALL_SETTINGS_SECTIONS,
  DEFAULT_USER_TABS,
  extractAllowedSettingsFromUser,
  formatDateUa,
  Client,
} from '../../models/client.model';
import { UtilityAccount, UtilityServiceTabId } from '../../models/utility.model';

type UserFilterRole = 'all' | 'new' | 'user' | 'admin' | 'inactive';

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
            <h2 class="text-lg font-bold text-slate-900">Доступ та Користувачі</h2>
            <span class="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold font-mono">
              {{ users().length }}
            </span>
          </div>
          <p class="text-xs text-slate-500 mt-1">
            Натисніть на користувача зі списку, щоб відкрити модальне вікно з усіма індивідуальними налаштуваннями, вкладками, будинками та тарифами.
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
            (click)="openInvitePanel()"
            class="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 active:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
          >
            <mat-icon class="text-sm">add_link</mat-icon>
            <span>Створити Invite Link (Спільний дім)</span>
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

      <!-- SHARED HOUSEHOLD & BUDGET INVITE LINK PANEL -->
      <div class="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-5 sm:p-6 border border-indigo-500/30 shadow-md space-y-4">
        <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div class="flex items-start gap-3.5">
            <div class="w-12 h-12 rounded-2xl bg-teal-500/20 border border-teal-400/40 text-teal-300 flex items-center justify-center shrink-0">
              <mat-icon class="text-2xl">cottage</mat-icon>
            </div>
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <h3 class="text-base sm:text-lg font-extrabold text-white">
                  Спільний дім та Спільний бюджет (Invite Link)
                </h3>
                <span class="px-2.5 py-0.5 rounded-full bg-teal-500/20 border border-teal-400/30 text-teal-300 text-2xs font-bold">
                  Запрошення за посиланням
                </span>
              </div>
              <p class="text-xs text-slate-300 mt-1 max-w-3xl">
                Створюйте персональне посилання-запрошення для інших зареєстрованих користувачів, щоб надати їм доступ до вашого будинку та спільного бюджету. За замовчуванням встановлюється режим <strong>«Тільки для перегляду»</strong> або <strong>«Повний доступ»</strong>, а також тематичні теги (Сім'я, Друг, Подруга, Донька, Син, Знайомий).
              </p>
            </div>
          </div>

          <div class="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              (click)="isInviteCreatorExpanded.set(!isInviteCreatorExpanded())"
              class="px-4 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer transition-all shadow-sm"
            >
              <mat-icon class="text-base">{{ isInviteCreatorExpanded() ? 'expand_less' : 'add_link' }}</mat-icon>
              <span>{{ isInviteCreatorExpanded() ? 'Згорнути конструктор' : 'Створити Invite-посилання' }}</span>
            </button>
            <button
              type="button"
              (click)="openGlobalHouseholdModal()"
              class="px-3.5 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white border border-white/20 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <mat-icon class="text-base">qr_code_2</mat-icon>
              <span>Приєднатися за кодом</span>
            </button>
            <button
              type="button"
              (click)="shareCleanAppFromUsersView()"
              title="Поділитися чистим посиланням на застосунок https://homehub3.ai.studio/ без приєднання"
              class="px-3.5 py-2.5 rounded-xl bg-indigo-500/25 hover:bg-indigo-500/35 text-indigo-200 border border-indigo-400/30 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <mat-icon class="text-base">{{ copiedCleanApp() ? 'check' : 'ios_share' }}</mat-icon>
              <span>{{ copiedCleanApp() ? 'Скопійовано https://homehub3.ai.studio/' : 'Поділитись застосунком' }}</span>
            </button>
          </div>
        </div>

        @if (isInviteCreatorExpanded()) {
          <div class="pt-4 border-t border-white/15 grid grid-cols-1 lg:grid-cols-12 gap-5">
            <!-- Left: Invite Configuration Form -->
            <div class="lg:col-span-7 bg-slate-950/60 rounded-2xl p-4 sm:p-5 border border-white/10 space-y-4">
              <div class="text-xs font-extrabold uppercase tracking-wider text-teal-300 flex items-center gap-1.5">
                <mat-icon class="text-base">tune</mat-icon>
                <span>Параметри нового Invite-посилання</span>
              </div>

              <!-- 1. Access Level Selector ("Тільки для перегляду" default vs "Повний доступ") -->
              <div class="space-y-2">
                <span class="block text-xs font-bold text-slate-200">
                  1. Рівень доступу до будинку та бюджету:
                </span>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    (click)="inviteAccessLevel.set('view_only')"
                    class="p-3 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-2.5"
                    [class.bg-amber-500/20]="inviteAccessLevel() === 'view_only'"
                    [class.border-amber-400]="inviteAccessLevel() === 'view_only'"
                    [class.bg-slate-900/80]="inviteAccessLevel() !== 'view_only'"
                    [class.border-white/10]="inviteAccessLevel() !== 'view_only'"
                  >
                    <div
                      class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                      [class.bg-amber-400]="inviteAccessLevel() === 'view_only'"
                      [class.text-slate-950]="inviteAccessLevel() === 'view_only'"
                      [class.bg-slate-800]="inviteAccessLevel() !== 'view_only'"
                      [class.text-slate-400]="inviteAccessLevel() !== 'view_only'"
                    >
                      <mat-icon class="text-base">visibility</mat-icon>
                    </div>
                    <div>
                      <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="text-xs font-extrabold text-white">Тільки для перегляду</span>
                        <span class="px-1.5 py-0.2 rounded bg-amber-400/25 text-amber-300 text-3xs font-bold">За замовчуванням</span>
                      </div>
                      <p class="text-2xs text-slate-300 mt-0.5">
                        Перегляд графіку світла, показів лічильників, пристроїв та спільного бюджету без права редагування.
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    (click)="inviteAccessLevel.set('full')"
                    class="p-3 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-2.5"
                    [class.bg-emerald-500/20]="inviteAccessLevel() === 'full'"
                    [class.border-emerald-400]="inviteAccessLevel() === 'full'"
                    [class.bg-slate-900/80]="inviteAccessLevel() !== 'full'"
                    [class.border-white/10]="inviteAccessLevel() !== 'full'"
                  >
                    <div
                      class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                      [class.bg-emerald-500]="inviteAccessLevel() === 'full'"
                      [class.text-white]="inviteAccessLevel() === 'full'"
                      [class.bg-slate-800]="inviteAccessLevel() !== 'full'"
                      [class.text-slate-400]="inviteAccessLevel() !== 'full'"
                    >
                      <mat-icon class="text-base">edit_note</mat-icon>
                    </div>
                    <div>
                      <div class="text-xs font-extrabold text-white">Повний доступ</div>
                      <p class="text-2xs text-slate-300 mt-0.5">
                        Повне право вносити покази лічильників, керувати пристроями та вести спільний бюджет.
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              <!-- 2. Single-Select Relationship Dropdown -->
              <div class="space-y-2">
                <label for="users-invite-relation-select" class="block text-xs font-bold text-slate-200">
                  2. Статус запрошеного учасника (однозначний вибір):
                </label>
                @let selectedInviteRel = getSelectedInviteRelation();
                @let selectedInviteRelMeta = getRelationTagMeta(selectedInviteRel);
                <div class="flex flex-col sm:flex-row sm:items-center gap-2.5">
                  <div class="relative flex-1">
                    <select
                      id="users-invite-relation-select"
                      [value]="selectedInviteRel"
                      (change)="setInviteRelation($any($event.target).value)"
                      class="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/20 text-xs font-extrabold text-white focus:outline-none focus:ring-2 focus:ring-teal-400 cursor-pointer"
                    >
                      @for (tag of relationTagsCatalog; track tag.id) {
                        <option [value]="tag.id" [selected]="selectedInviteRel === tag.id" class="bg-slate-900 text-white">
                          {{ tag.label }}
                        </option>
                      }
                    </select>
                  </div>
                  @if (selectedInviteRelMeta) {
                    <div
                      [class]="'px-3.5 py-2 rounded-xl border text-xs font-extrabold inline-flex items-center gap-2 shrink-0 ' + selectedInviteRelMeta.activeClass"
                    >
                      <mat-icon class="text-base leading-none">{{ selectedInviteRelMeta.icon }}</mat-icon>
                      <span>{{ selectedInviteRelMeta.label }}</span>
                    </div>
                  }
                </div>
              </div>

              <!-- 3. Select Houses & Shared Budget -->
              <div class="space-y-2">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-xs font-bold text-slate-200">3. Будинки для спільного доступу:</span>
                  <label class="inline-flex items-center gap-2 text-xs font-semibold text-teal-300 cursor-pointer">
                    <input
                      type="checkbox"
                      [checked]="inviteIncludeSharedBudget()"
                      (change)="inviteIncludeSharedBudget.set($any($event.target).checked)"
                      class="w-4 h-4 rounded accent-teal-500 cursor-pointer"
                    />
                    <span>Спільний бюджет ($ / ₴)</span>
                  </label>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
                  @for (house of allUtilityAccounts(); track house.id) {
                    @let hChecked = isInviteHouseSelected(house.id);
                    <button
                      type="button"
                      (click)="toggleInviteHouse(house.id)"
                      class="p-2.5 rounded-xl border text-left flex items-center justify-between gap-2 transition-all cursor-pointer"
                      [class.bg-teal-500/20]="hChecked"
                      [class.border-teal-400]="hChecked"
                      [class.bg-slate-900/70]="!hChecked"
                      [class.border-white/10]="!hChecked"
                    >
                      <div class="flex items-center gap-2 min-w-0">
                        <mat-icon class="text-base text-teal-300 shrink-0">home_work</mat-icon>
                        <div class="min-w-0">
                          <div class="text-xs font-bold text-white truncate">{{ house.name || house.address }}</div>
                          <div class="text-3xs text-slate-400 truncate">{{ house.address || house.accountNumber }}</div>
                        </div>
                      </div>
                      <mat-icon class="text-base shrink-0" [class.text-teal-300]="hChecked" [class.text-slate-600]="!hChecked">
                        {{ hChecked ? 'check_box' : 'check_box_outline_blank' }}
                      </mat-icon>
                    </button>
                  }
                </div>
              </div>

              <div class="pt-1 flex items-center gap-2.5 flex-wrap">
                <button
                  type="button"
                  (click)="generateNewInviteLink()"
                  [disabled]="isCreatingInvite()"
                  class="px-5 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-extrabold text-xs flex items-center gap-2 cursor-pointer shadow-md transition-all disabled:opacity-50"
                >
                  <mat-icon class="text-base">link</mat-icon>
                  <span>{{ isCreatingInvite() ? 'Генерація посилання...' : 'Згенерувати Invite Link' }}</span>
                </button>
                @if (lastCreatedInviteUrl()) {
                  <button
                    type="button"
                    (click)="copyInviteLink(lastCreatedInviteCode())"
                    class="px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer border border-white/20"
                  >
                    <mat-icon class="text-sm">{{ copiedInviteCode() === lastCreatedInviteCode() ? 'check' : 'content_copy' }}</mat-icon>
                    <span>{{ copiedInviteCode() === lastCreatedInviteCode() ? 'Скопійовано!' : 'Скопіювати посилання' }}</span>
                  </button>
                }
              </div>
            </div>

            <!-- Right: Active Invites List -->
            <div class="lg:col-span-5 bg-slate-950/60 rounded-2xl p-4 sm:p-5 border border-white/10 flex flex-col justify-between space-y-3">
              <div class="space-y-3">
                <div class="flex items-center justify-between">
                  <span class="text-xs font-extrabold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
                    <mat-icon class="text-base">share</mat-icon>
                    <span>Активні Invite-посилання ({{ householdInvites().length }})</span>
                  </span>
                </div>

                <div class="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                  @for (inv of householdInvites(); track inv.id) {
                    <div class="p-3 rounded-xl bg-slate-900/90 border border-white/10 space-y-2">
                      <div class="flex items-center justify-between gap-2">
                        <div class="flex items-center gap-1.5 flex-wrap">
                          @if (inv.accessLevel === 'full') {
                            <span class="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-3xs font-bold inline-flex items-center gap-1">
                              <mat-icon class="text-3xs">edit_note</mat-icon>
                              <span>Повний доступ</span>
                            </span>
                          } @else {
                            <span class="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30 text-3xs font-bold inline-flex items-center gap-1">
                              <mat-icon class="text-3xs">visibility</mat-icon>
                              <span>Тільки для перегляду</span>
                            </span>
                          }
                          @for (tagId of inv.memberTags || []; track tagId) {
                            @if (getRelationTagMeta(tagId); as tMeta) {
                              <span class="px-2 py-0.5 rounded-full bg-white/10 text-white text-3xs font-bold inline-flex items-center gap-1">
                                <mat-icon class="text-3xs">{{ tMeta.icon }}</mat-icon>
                                <span>{{ tMeta.label }}</span>
                              </span>
                            }
                          }
                        </div>
                        <button
                          type="button"
                          (click)="removeInvite(inv.id)"
                          class="text-slate-400 hover:text-rose-400 bg-transparent border-0 p-1 cursor-pointer"
                          title="Видалити запрошення"
                        >
                          <mat-icon class="text-sm">delete_outline</mat-icon>
                        </button>
                      </div>

                      <div class="text-2xs text-slate-300 truncate">
                        Будинки: <strong>{{ inv.houseNames.length ? inv.houseNames.join(', ') : 'Всі будинки' }}</strong>
                        @if (inv.includeSharedBudget) {
                          <span class="text-teal-300"> • + Спільний бюджет</span>
                        }
                      </div>

                      <div class="flex items-center gap-2">
                        <input
                          type="text"
                          readonly
                          [value]="getInviteUrl(inv.code)"
                          class="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-white/10 text-2xs font-mono text-slate-300 select-all"
                        />
                        <button
                          type="button"
                          (click)="copyInviteLink(inv.code)"
                          class="px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-extrabold text-2xs inline-flex items-center gap-1 cursor-pointer shrink-0"
                        >
                          <mat-icon class="text-xs">{{ copiedInviteCode() === inv.code ? 'check' : 'content_copy' }}</mat-icon>
                          <span>{{ copiedInviteCode() === inv.code ? 'Скопійовано' : 'Копіювати' }}</span>
                        </button>
                      </div>
                    </div>
                  } @empty {
                    <div class="p-6 rounded-xl bg-slate-900/50 border border-dashed border-white/15 text-center space-y-1">
                      <mat-icon class="text-2xl text-slate-400">add_link</mat-icon>
                      <div class="text-xs font-bold text-slate-300">Ще немає створених запрошень</div>
                      <div class="text-2xs text-slate-400">Оберіть параметри ліворуч та натисніть «Згенерувати Invite Link»</div>
                    </div>
                  }
                </div>
              </div>
            </div>
          </div>
        }
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
          <div class="text-3xs text-emerald-600 font-medium mt-0.5">Повний доступ (всі вкладки і будинки)</div>
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
          <div class="text-3xs text-sky-600 font-medium mt-0.5">Індивідуальні налаштування та будинки</div>
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
          <div class="text-3xs text-amber-700 font-medium mt-0.5">Нові запити (без доступу)</div>
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
                Натисніть на користувача у списку нижче, щоб налаштувати його роль, дозволені вкладки та прив'язані будинки.
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
            <span>Очікують</span>
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
            Користувачі ({{ viewerCount() }})
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
            Адміни ({{ adminCount() }})
          </button>

          <button
            type="button"
            (click)="selectedRoleFilter.set('inactive')"
            class="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap flex items-center gap-1"
            [class.bg-rose-600]="selectedRoleFilter() === 'inactive'"
            [class.text-white]="selectedRoleFilter() === 'inactive'"
            [class.shadow-xs]="selectedRoleFilter() === 'inactive'"
            [class.text-slate-600]="selectedRoleFilter() !== 'inactive'"
          >
            <span>Неактивні ({{ inactiveCount() }})</span>
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

      <!-- Compact Users List (Click user to open settings modal) -->
      <div class="bg-white rounded-2xl border border-slate-200/80 shadow-xs divide-y divide-slate-100 overflow-hidden">
        @for (user of filteredUsers(); track user.id) {
          @let userActive = isUserActive(user);
          <div
            (click)="openPermissionsModal(user)"
            class="p-4 sm:px-5 hover:bg-slate-50/90 active:bg-slate-100/80 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
            [class.bg-rose-50/25]="!userActive"
          >
            <!-- Left: Avatar with Status Dot + Name + Email + Status Badge + Role -->
            <div class="flex items-center gap-3.5 min-w-0">
              <div class="relative shrink-0">
                <img
                  [src]="user.picture || 'https://ui-avatars.com/api/?name=' + user.name + '&background=0284c7&color=fff'"
                  [alt]="user.name"
                  class="w-11 h-11 rounded-2xl object-cover border border-slate-200 shadow-2xs group-hover:border-indigo-300 transition-colors"
                  [class.opacity-60]="!userActive"
                  referrerpolicy="no-referrer"
                />
                <span
                  class="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white"
                  [class.bg-emerald-500]="userActive"
                  [class.bg-rose-500]="!userActive"
                  [title]="userActive ? 'Стан: Активний' : 'Стан: Неактивний (Доступ заблоковано)'"
                ></span>
              </div>

              <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span
                    class="text-sm font-bold group-hover:text-indigo-700 transition-colors truncate"
                    [class.text-slate-900]="userActive"
                    [class.text-slate-500]="!userActive"
                    [class.line-through]="!userActive"
                  >
                    {{ user.name }}
                  </span>

                  <!-- User Active / Inactive Status Indicator Badge -->
                  @if (userActive) {
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-3xs font-bold">
                      <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span>Активний</span>
                    </span>
                  } @else {
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-3xs font-bold">
                      <span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                      <span>Неактивний</span>
                    </span>
                  }

                  @if (isCurrentLoggedInUser(user)) {
                    <span class="px-1.5 py-0.2 rounded-md bg-slate-900 text-white text-3xs font-bold">
                      Це ви
                    </span>
                  }

                  @if (user.id === 'user_test_sandbox') {
                    <span class="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-300 text-3xs font-extrabold inline-flex items-center gap-1">
                      <mat-icon class="text-3xs leading-none">science</mat-icon>
                      <span>Тестовий акаунт</span>
                    </span>
                  }

                  <!-- Role Badge -->
                  @switch (user.role) {
                    @case ('admin') {
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-3xs font-bold border border-emerald-200">
                        <mat-icon class="text-3xs">shield</mat-icon>
                        <span>Адміністратор</span>
                      </span>
                    }
                    @case ('user') {
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 text-3xs font-bold border border-sky-200">
                        <mat-icon class="text-3xs">person</mat-icon>
                        <span>Користувач</span>
                      </span>
                    }
                    @case ('new') {
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-3xs font-bold border border-amber-300 animate-pulse">
                        <mat-icon class="text-3xs">lock_clock</mat-icon>
                        <span>Новий (Очікує доступу)</span>
                      </span>
                    }
                  }
                  <!-- Access Level Badge (Тільки для перегляду vs Повний доступ) -->
                  @if (getUserAccessLevel(user) === 'view_only') {
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300 text-3xs font-bold" title="Доступ тільки для перегляду">
                      <mat-icon class="text-3xs">visibility</mat-icon>
                      <span>Тільки для перегляду</span>
                    </span>
                  } @else {
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200 text-3xs font-bold" title="Повний доступ до будинку та бюджету">
                      <mat-icon class="text-3xs">edit_note</mat-icon>
                      <span>Повний доступ</span>
                    </span>
                  }

                  <!-- Member Relationship Tags with Thematic Icons -->
                  @for (tagId of getUserRelationTags(user); track tagId) {
                    @if (getRelationTagMeta(tagId); as tagMeta) {
                      <span
                        class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-3xs font-extrabold"
                        [class]="tagMeta.badgeClass"
                      >
                        <mat-icon [class]="'text-xs leading-none ' + tagMeta.iconColorClass">{{ tagMeta.icon }}</mat-icon>
                        <span>{{ tagMeta.label }}</span>
                      </span>
                    }
                  }
                </div>

                <div class="flex items-center gap-2.5 text-xs text-slate-500 font-mono mt-0.5 truncate">
                  <span>{{ user.email }}</span>
                  @if (user.invitedByUserName) {
                    <span class="text-slate-300 font-sans">•</span>
                    <span class="text-3xs text-teal-700 font-sans font-semibold">Запросив: {{ user.invitedByUserName }}</span>
                  }
                  @if (user.lastLoginAt) {
                    <span class="text-slate-300 font-sans">•</span>
                    <span class="text-3xs text-slate-400 font-sans">Вхід: {{ formatDate(user.lastLoginAt) }}</span>
                  }
                </div>
              </div>
            </div>

            <!-- Right: Summary Counters & Open Settings Indicator -->
            <div class="flex items-center justify-between sm:justify-end gap-2.5 shrink-0 border-t sm:border-t-0 pt-2.5 sm:pt-0 border-slate-100">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-2xs font-semibold inline-flex items-center gap-1" title="Доступні вкладки">
                  <mat-icon class="text-xs text-indigo-600">tab</mat-icon>
                  <span>{{ getUserAllowedTabs(user).length }} вкл.</span>
                </span>
                <span class="px-2 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200/70 text-2xs font-semibold inline-flex items-center gap-1" title="Прив'язані будинки">
                  <mat-icon class="text-xs text-amber-600">home_work</mat-icon>
                  <span>{{ getUserBoundHouses(user).length }} буд.</span>
                </span>
                @if (getUserBoundClients(user).length > 0) {
                  <span class="px-2 py-1 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-200/70 text-2xs font-semibold inline-flex items-center gap-1" title="Прив'язані IPTV клієнти">
                    <mat-icon class="text-xs text-indigo-600">groups</mat-icon>
                    <span>{{ getUserBoundClients(user).length }} абон.</span>
                  </span>
                }
              </div>

              <div class="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 group-hover:bg-indigo-600 text-slate-700 group-hover:text-white text-xs font-bold transition-colors">
                <mat-icon class="text-sm">tune</mat-icon>
                <span class="hidden md:inline">Налаштування</span>
                <mat-icon class="text-sm">chevron_right</mat-icon>
              </div>
            </div>
          </div>
        } @empty {
          <div class="text-center py-12 p-8">
            <mat-icon class="text-4xl text-slate-300 mb-2">person_search</mat-icon>
            <div class="text-sm font-bold text-slate-700">Користувачів не знайдено</div>
            <div class="text-xs text-slate-400 mt-1">Змініть фільтр або додайте нового користувача через кнопку вище.</div>
          </div>
        }
      </div>

      <!-- MODAL: FULL USER SETTINGS (Role, Tabs, Settings, Bound Houses + Per-Tab Visibility, Individual Tariffs, IPTV Clients) -->
      @if (editingUserForPermissions(); as targetUser) {
        <div
          class="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs"
          (click)="closePermissionsModal()"
        >
          <div
            class="bg-white rounded-t-3xl sm:rounded-3xl p-5 sm:p-7 max-w-3xl w-full shadow-2xl border border-slate-200 max-h-[92dvh] flex flex-col pb-safe"
            (click)="$event.stopPropagation()"
          >
            <div class="sm:hidden flex justify-center -mt-2 mb-2 shrink-0">
              <span class="w-10 h-1 rounded-full bg-slate-300"></span>
            </div>
            <!-- Header -->
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 shrink-0">
              <div class="flex items-center gap-3 min-w-0">
                <img
                  [src]="targetUser.picture || 'https://ui-avatars.com/api/?name=' + targetUser.name + '&background=0284c7&color=fff'"
                  [alt]="targetUser.name"
                  class="w-11 h-11 rounded-2xl object-cover border border-slate-200 shrink-0 shadow-2xs"
                  referrerpolicy="no-referrer"
                />
                <div class="min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <h3 class="text-base font-bold text-slate-900 truncate">
                      {{ targetUser.name }}
                    </h3>
                    @if (isCurrentLoggedInUser(targetUser)) {
                      <span class="px-1.5 py-0.2 rounded-md bg-slate-900 text-white text-3xs font-bold">Це ви</span>
                    }
                  </div>
                  <p class="text-xs text-slate-500 font-mono truncate">{{ targetUser.email }}</p>
                </div>
              </div>

              <div class="flex items-center gap-2 shrink-0">
                @if (targetUser.role !== 'admin') {
                  <button
                    type="button"
                    (click)="impersonateFromModal(targetUser)"
                    [disabled]="isLoading()"
                    class="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                    title="Перемкнутись на цей акаунт і побачити застосунок очима цього користувача"
                  >
                    <mat-icon class="text-sm">visibility</mat-icon>
                    <span>Увійти як користувач</span>
                  </button>
                }
                <button
                  type="button"
                  (click)="deleteUserFromModal(targetUser)"
                  [disabled]="isLoading() || (targetUser.role === 'admin' && adminCount() <= 1)"
                  class="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Видалити користувача"
                >
                  <mat-icon class="text-base">delete_outline</mat-icon>
                </button>
                <button
                  type="button"
                  (click)="closePermissionsModal()"
                  class="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  <mat-icon class="text-base">close</mat-icon>
                </button>
              </div>
            </div>

            <!-- Scrollable Body -->
            <div class="py-4 space-y-5 overflow-y-auto flex-1 pr-1">
              <!-- Instant Access Block Toggle Switch Banner -->
              @let modalIsActive = modalUserStatus() === 'active' && modalRole() !== 'new';
              <div
                class="p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors"
                [class.bg-emerald-50/70]="modalIsActive"
                [class.border-emerald-200]="modalIsActive"
                [class.bg-rose-50/80]="!modalIsActive"
                [class.border-rose-300]="!modalIsActive"
              >
                <div class="flex items-start sm:items-center gap-3">
                  <div
                    class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    [class.bg-emerald-600]="modalIsActive"
                    [class.text-white]="modalIsActive"
                    [class.bg-rose-600]="!modalIsActive"
                    [class.text-white]="!modalIsActive"
                  >
                    <mat-icon class="text-xl">{{ modalIsActive ? 'verified_user' : 'block' }}</mat-icon>
                  </div>
                  <div>
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="text-xs font-bold text-slate-900">
                        Стан доступу до застосунку:
                      </span>
                      @if (modalIsActive) {
                        <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-2xs font-bold">
                          <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                          <span>Активний (Доступ дозволено)</span>
                        </span>
                      } @else {
                        <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 text-2xs font-bold">
                          <span class="w-2 h-2 rounded-full bg-rose-600"></span>
                          <span>Неактивний (Доступ заблоковано)</span>
                        </span>
                      }
                    </div>
                    <p class="text-2xs text-slate-600 mt-0.5">
                      Перемикач миттєво блокує або відновлює доступ користувача до застосунку без видалення його даних.
                    </p>
                  </div>
                </div>

                <!-- Instant Toggle Switch -->
                <div class="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
                  <span class="text-xs font-bold" [class.text-rose-700]="!modalIsActive" [class.text-emerald-800]="modalIsActive">
                    {{ modalIsActive ? 'Активний' : 'Заблоковано' }}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    [attr.aria-checked]="modalIsActive"
                    (click)="onInstantToggleUserAccess(targetUser)"
                    [disabled]="isLoading() || (targetUser.role === 'admin' && adminCount() <= 1 && modalIsActive)"
                    class="relative inline-flex h-7 w-13 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                    [class.bg-emerald-600]="modalIsActive"
                    [class.bg-rose-600]="!modalIsActive"
                    title="Миттєво увімкнути або заблокувати доступ до застосунку"
                  >
                    <span
                      class="pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out flex items-center justify-center"
                      [class.translate-x-6]="modalIsActive"
                      [class.translate-x-0]="!modalIsActive"
                    >
                      <mat-icon
                        class="text-xs leading-none"
                        [class.text-emerald-600]="modalIsActive"
                        [class.text-rose-600]="!modalIsActive"
                      >
                        {{ modalIsActive ? 'check' : 'lock' }}
                      </mat-icon>
                    </span>
                  </button>
                </div>
              </div>

              <!-- Section 0: User Role & Household Access Level ("Тільки для перегляду" vs "Повний доступ") -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <label for="modal-user-role-select" class="block text-xs font-bold text-slate-900">
                    Роль у системі
                  </label>
                  <select
                    id="modal-user-role-select"
                    [value]="modalRole()"
                    (change)="onModalRoleChange($any($event.target).value)"
                    [disabled]="targetUser.role === 'admin' && adminCount() <= 1"
                    class="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 text-xs font-semibold focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="admin">Адміністратор (Повний доступ)</option>
                    <option value="user">Користувач (Спільний дім / Індивідуальний)</option>
                    <option value="new">Новий (Без доступу)</option>
                  </select>
                  <div class="text-3xs text-slate-500">
                    Створено: {{ formatDate(targetUser.createdAt) }}
                  </div>
                </div>

                <!-- Household Access Level Switcher -->
                <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <div class="text-xs font-bold text-slate-900 flex items-center justify-between">
                    <span>Доступ до спільного будинку та бюджету</span>
                    <span class="text-3xs font-semibold text-amber-700">За замовчуванням: Перегляд</span>
                  </div>
                  <div class="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      (click)="setModalAccessLevel('view_only')"
                      class="p-2.5 rounded-xl border text-left flex items-center gap-2 transition-all cursor-pointer"
                      [class.bg-amber-50]="modalAccessLevel() === 'view_only'"
                      [class.border-amber-400]="modalAccessLevel() === 'view_only'"
                      [class.text-amber-900]="modalAccessLevel() === 'view_only'"
                      [class.bg-white]="modalAccessLevel() !== 'view_only'"
                      [class.border-slate-200]="modalAccessLevel() !== 'view_only'"
                      [class.text-slate-600]="modalAccessLevel() !== 'view_only'"
                    >
                      <mat-icon class="text-base text-amber-600 shrink-0">visibility</mat-icon>
                      <div class="min-w-0">
                        <div class="text-2xs font-extrabold truncate">Тільки для перегляду</div>
                        <div class="text-3xs opacity-75 truncate">Без змін даних</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      (click)="setModalAccessLevel('full')"
                      class="p-2.5 rounded-xl border text-left flex items-center gap-2 transition-all cursor-pointer"
                      [class.bg-emerald-50]="modalAccessLevel() === 'full'"
                      [class.border-emerald-500]="modalAccessLevel() === 'full'"
                      [class.text-emerald-900]="modalAccessLevel() === 'full'"
                      [class.bg-white]="modalAccessLevel() !== 'full'"
                      [class.border-slate-200]="modalAccessLevel() !== 'full'"
                      [class.text-slate-600]="modalAccessLevel() !== 'full'"
                    >
                      <mat-icon class="text-base text-emerald-600 shrink-0">edit_note</mat-icon>
                      <div class="min-w-0">
                        <div class="text-2xs font-extrabold truncate">Повний доступ</div>
                        <div class="text-3xs opacity-75 truncate">Внесення та зміни</div>
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              <!-- Section 0.5: Single-Choice Member Relationship Dropdown -->
              <div class="p-4 rounded-2xl bg-gradient-to-r from-rose-50/50 via-indigo-50/40 to-teal-50/50 border border-slate-200/90 space-y-2.5">
                <div class="flex items-center justify-between flex-wrap gap-2">
                  <label for="modal-user-relation-select" class="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <mat-icon class="text-base text-rose-500">diversity_3</mat-icon>
                    <span>Статус користувача (Сім'я та близькі)</span>
                  </label>
                  <span class="text-2xs text-slate-500">
                    Однозначний вибір зі списку
                  </span>
                </div>
                @let selectedModalRel = getSelectedModalMemberRelation();
                @let selectedModalRelMeta = getRelationTagMeta(selectedModalRel);
                <div class="flex flex-col sm:flex-row sm:items-center gap-2.5">
                  <div class="relative flex-1">
                    <select
                      id="modal-user-relation-select"
                      [value]="selectedModalRel"
                      (change)="setModalMemberRelation($any($event.target).value)"
                      class="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-extrabold text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
                    >
                      @for (tag of relationTagsCatalog; track tag.id) {
                        <option [value]="tag.id" [selected]="selectedModalRel === tag.id">
                          {{ tag.label }}
                        </option>
                      }
                    </select>
                  </div>
                  @if (selectedModalRelMeta) {
                    <div
                      [class]="'px-3.5 py-2 rounded-xl border text-xs font-extrabold inline-flex items-center gap-2 shrink-0 ' + selectedModalRelMeta.badgeClass"
                    >
                      <mat-icon [class]="'text-base leading-none ' + selectedModalRelMeta.iconColorClass">{{ selectedModalRelMeta.icon }}</mat-icon>
                      <span>Обрано: {{ selectedModalRelMeta.label }}</span>
                    </div>
                  }
                </div>
              </div>

              <!-- Section 1: Allowed Application Tabs -->
              <div class="space-y-2.5 p-4 rounded-2xl bg-slate-50/60 border border-slate-200/80">
                <div class="flex items-center justify-between flex-wrap gap-2">
                  <div class="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <mat-icon class="text-base text-indigo-600">tab</mat-icon>
                    <span>Доступні вкладки застосунку</span>
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
                      Тільки Комунальні
                    </button>
                  </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  @for (tabItem of assignableTabs; track tabItem.id) {
                    @let checked = modalAllowedTabs().includes(tabItem.id);
                    <button
                      type="button"
                      (click)="toggleModalTab(tabItem.id)"
                      class="p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer"
                      [class.bg-emerald-50/90]="checked"
                      [class.border-emerald-400]="checked"
                      [class.bg-white]="!checked"
                      [class.border-slate-200]="!checked"
                    >
                      <div class="flex items-center gap-2 min-w-0">
                        <div
                          class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                          [class.bg-emerald-600]="checked"
                          [class.text-white]="checked"
                          [class.bg-slate-100]="!checked"
                          [class.text-slate-500]="!checked"
                        >
                          <mat-icon class="text-sm">{{ tabItem.icon }}</mat-icon>
                        </div>
                        <div class="min-w-0">
                          <div class="text-xs font-bold text-slate-900 truncate">{{ tabItem.label }}</div>
                          <div class="text-3xs text-slate-500">{{ checked ? 'Відкрито' : 'Приховано' }}</div>
                        </div>
                      </div>
                      <mat-icon
                        class="text-base shrink-0"
                        [class.text-emerald-600]="checked"
                        [class.text-slate-300]="!checked"
                      >
                        {{ checked ? 'check_box' : 'check_box_outline_blank' }}
                      </mat-icon>
                    </button>
                  }
                </div>
              </div>

              <!-- Section 2: Granular Settings Sections Access -->
              <div class="space-y-2.5 p-4 rounded-2xl bg-slate-50/60 border border-slate-200/80">
                <div class="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div class="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <mat-icon class="text-base text-slate-700">settings</mat-icon>
                      <span>Доступ до пунктів вкладки «Налаштування»</span>
                    </div>
                    <p class="text-2xs text-slate-500 mt-0.5">
                      Оберіть, які розділи налаштувань бачитиме цей користувач (Тариф електро, Тариф на воду, Тариф на вивіз сміття тощо).
                    </p>
                  </div>
                  <div class="flex items-center gap-2 text-2xs flex-wrap">
                    <button
                      type="button"
                      (click)="selectDefaultUserModalSettings()"
                      class="text-emerald-700 hover:underline font-semibold cursor-pointer"
                    >
                      Користувацькі (за замовчуванням)
                    </button>
                    <span class="text-slate-300">•</span>
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
                    @let isUserScoped = isSettingUserScoped(sec.id);
                    <button
                      type="button"
                      (click)="toggleModalSettingsSection(sec.id)"
                      class="p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer"
                      [class.bg-indigo-50/90]="secChecked"
                      [class.border-indigo-400]="secChecked"
                      [class.bg-white]="!secChecked"
                      [class.border-slate-200]="!secChecked"
                    >
                      <div class="flex items-center gap-2.5 min-w-0">
                        <div
                          class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                          [class.bg-indigo-600]="secChecked"
                          [class.text-white]="secChecked"
                          [class.bg-slate-100]="!secChecked"
                          [class.text-slate-500]="!secChecked"
                        >
                          <mat-icon class="text-sm">{{ sec.icon }}</mat-icon>
                        </div>
                        <div class="min-w-0">
                          <div class="flex items-center gap-1.5 flex-wrap">
                            <span class="text-xs font-bold text-slate-900 truncate">{{ sec.label }}</span>
                            @if (isUserScoped) {
                              <span class="px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-3xs font-bold">Користувацьке</span>
                            } @else {
                              <span class="px-1.5 py-0.5 rounded-md bg-slate-200 text-slate-600 text-3xs font-semibold">Системне</span>
                            }
                          </div>
                          <div class="text-3xs text-slate-500 truncate">{{ sec.subtitle }}</div>
                        </div>
                      </div>
                      <mat-icon
                        class="text-base shrink-0"
                        [class.text-indigo-600]="secChecked"
                        [class.text-slate-300]="!secChecked"
                      >
                        {{ secChecked ? 'check_box' : 'check_box_outline_blank' }}
                      </mat-icon>
                    </button>
                  }
                </div>
              </div>

              <!-- Section 3: Bound Houses + Individual Per-User House Visibility per Tab -->
              <div class="space-y-3 p-4 rounded-2xl bg-amber-50/40 border border-amber-200/80">
                <div>
                  <div class="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <mat-icon class="text-base text-amber-600">home_work</mat-icon>
                    <span>Привʼязка будинків та індивідуальна видимість по вкладках для {{ targetUser.name }}</span>
                  </div>
                  <p class="text-2xs text-slate-500 mt-0.5">
                    Навіть якщо будинок спільний для декількох користувачів, налаштування показу чи приховування будинку на вкладках («Графік», «Електро», «Вода», «Сміття») зберігається індивідуально для цього користувача.
                  </p>
                </div>

                @if (allUtilityAccounts().length > 0) {
                  <div class="space-y-2">
                    @for (acc of allUtilityAccounts(); track acc.id) {
                      @let isOwner = isAccountOwnedByUser(acc, targetUser);
                      @let isBound = modalAssignedUtilityIds().includes(acc.id);
                      <div
                        class="p-3 rounded-xl border transition-all space-y-2.5"
                        [class.bg-white]="isBound"
                        [class.border-amber-300]="isBound"
                        [class.bg-slate-50/70]="!isBound"
                        [class.border-slate-200]="!isBound"
                      >
                        <div class="flex items-center justify-between gap-3">
                          <div
                            (click)="toggleModalUtilityAccount(acc.id)"
                            class="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer"
                          >
                            <div
                              class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-white"
                              [class.bg-amber-500]="acc.type === 'electricity'"
                              [class.bg-cyan-600]="acc.type === 'water_waste'"
                            >
                              <mat-icon class="text-sm">{{ acc.type === 'electricity' ? 'bolt' : 'water_drop' }}</mat-icon>
                            </div>
                            <div class="min-w-0">
                              <div class="flex items-center gap-2 flex-wrap">
                                <span class="text-xs font-bold text-slate-900">{{ acc.name }}</span>
                                <span class="px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-mono text-3xs font-semibold">
                                  № {{ acc.accountNumber }}
                                </span>
                                @if (isOwner) {
                                  <span class="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 text-3xs font-bold">
                                    Створив цей користувач
                                  </span>
                                } @else if (acc.ownerUserId) {
                                  <span class="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-3xs font-semibold">
                                    Власник: {{ getHouseOwnerLabel(acc) }}
                                  </span>
                                }
                              </div>
                              @if (acc.address) {
                                <div class="text-3xs text-slate-500 truncate">{{ acc.address }}</div>
                              }
                            </div>
                          </div>

                          <button
                            type="button"
                            (click)="toggleModalUtilityAccount(acc.id)"
                            class="px-2.5 py-1 rounded-lg text-2xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                            [class.bg-emerald-100]="isBound"
                            [class.text-emerald-800]="isBound"
                            [class.bg-slate-200]="!isBound"
                            [class.text-slate-600]="!isBound"
                          >
                            <mat-icon class="text-xs">{{ isBound ? 'link' : 'link_off' }}</mat-icon>
                            <span>{{ isBound ? 'Привʼязано' : 'Привʼязати' }}</span>
                          </button>
                        </div>

                        <!-- Per-user individual visibility toggles per tab -->
                        @if (isBound) {
                          <div class="pt-2 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2">
                            <span class="text-3xs font-bold text-slate-500 uppercase tracking-wider">
                              Показувати цей будинок користувачу на вкладках:
                            </span>
                            <div class="flex items-center gap-1.5 flex-wrap">
                              @for (ht of houseTabsList; track ht.id) {
                                @let isHidden = isHouseHiddenForTargetUser(targetUser.id, acc, ht.id);
                                <button
                                  type="button"
                                  (click)="toggleHouseVisibilityForTargetUser(targetUser.id, acc.id, ht.id)"
                                  class="px-2 py-1 rounded-lg text-3xs font-bold border flex items-center gap-1 cursor-pointer transition-all"
                                  [class.bg-emerald-50]="!isHidden"
                                  [class.border-emerald-300]="!isHidden"
                                  [class.text-emerald-800]="!isHidden"
                                  [class.bg-slate-100]="isHidden"
                                  [class.border-slate-200]="isHidden"
                                  [class.text-slate-400]="isHidden"
                                  [title]="!isHidden ? 'Відображається на вкладці «' + ht.label + '» (натисніть, щоб приховати для цього користувача)' : 'Приховано на вкладці «' + ht.label + '» (натисніть, щоб показати)'"
                                >
                                  <mat-icon class="text-3xs">{{ !isHidden ? 'visibility' : 'visibility_off' }}</mat-icon>
                                  <span>{{ ht.label }}</span>
                                </button>
                              }
                            </div>
                          </div>
                        }
                      </div>
                    }
                  </div>
                } @else {
                  <div class="p-4 rounded-xl bg-white border border-slate-200 text-xs text-slate-500 text-center">
                    У системі ще немає створених будинків.
                  </div>
                }
              </div>

              <!-- Section 4: Individual User Tariffs (Тариф електро, Тариф на воду, Тариф на вивіз сміття) -->
              <div class="space-y-3 p-4 rounded-2xl bg-indigo-50/40 border border-indigo-200/80">
                <div>
                  <div class="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <mat-icon class="text-base text-indigo-600">payments</mat-icon>
                    <span>Індивідуальні тарифи користувача ({{ targetUser.name }})</span>
                  </div>
                  <p class="text-2xs text-slate-500 mt-0.5">
                    Окремі налаштування «Тариф електро», «Тариф на воду» та «Тариф на вивіз сміття» для цього користувача (зберігаються в таблиці БД <code>user_settings</code>).
                  </p>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <!-- 1. Тариф електро -->
                  <div class="p-3 rounded-xl bg-white border border-amber-200 space-y-2">
                    <div class="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                      <mat-icon class="text-sm text-amber-600">bolt</mat-icon>
                      <span>Тариф електро</span>
                    </div>
                    <div class="space-y-1.5">
                      <div>
                        <label class="block text-3xs font-semibold text-slate-500">Однозонний (грн/кВт·год)</label>
                        <input
                          type="number"
                          inputmode="decimal"
                          step="0.01"
                          [value]="modalElecSingle()"
                          (input)="modalElecSingle.set(+$any($event.target).value)"
                          class="w-full px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-300 text-xs font-mono text-slate-900"
                        />
                      </div>
                      <div class="grid grid-cols-2 gap-1.5">
                        <div>
                          <label class="block text-3xs font-semibold text-slate-500">День (грн)</label>
                          <input
                            type="number"
                            inputmode="decimal"
                            step="0.01"
                            [value]="modalElecDay()"
                            (input)="modalElecDay.set(+$any($event.target).value)"
                            class="w-full px-2 py-1 rounded-lg bg-slate-50 border border-slate-300 text-xs font-mono text-slate-900"
                          />
                        </div>
                        <div>
                          <label class="block text-3xs font-semibold text-slate-500">Ніч (грн)</label>
                          <input
                            type="number"
                            inputmode="decimal"
                            step="0.01"
                            [value]="modalElecNight()"
                            (input)="modalElecNight.set(+$any($event.target).value)"
                            class="w-full px-2 py-1 rounded-lg bg-slate-50 border border-slate-300 text-xs font-mono text-slate-900"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- 2. Тариф на воду -->
                  <div class="p-3 rounded-xl bg-white border border-cyan-200 space-y-2">
                    <div class="flex items-center gap-1.5 text-xs font-bold text-cyan-900">
                      <mat-icon class="text-sm text-cyan-600">water_drop</mat-icon>
                      <span>Тариф на воду</span>
                    </div>
                    <div class="space-y-1.5">
                      <div>
                        <label class="block text-3xs font-semibold text-slate-500">Водопостачання (грн/м³)</label>
                        <input
                          type="number"
                          inputmode="decimal"
                          step="0.01"
                          [value]="modalWaterPerM3()"
                          (input)="modalWaterPerM3.set(+$any($event.target).value)"
                          class="w-full px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-300 text-xs font-mono text-slate-900"
                        />
                      </div>
                      <div>
                        <label class="block text-3xs font-semibold text-slate-500">Абонплата (грн/міс)</label>
                        <input
                          type="number"
                          inputmode="decimal"
                          step="0.01"
                          [value]="modalWaterSubFee()"
                          (input)="modalWaterSubFee.set(+$any($event.target).value)"
                          class="w-full px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-300 text-xs font-mono text-slate-900"
                        />
                      </div>
                    </div>
                  </div>

                  <!-- 3. Тариф на вивіз сміття -->
                  <div class="p-3 rounded-xl bg-white border border-emerald-200 space-y-2">
                    <div class="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                      <mat-icon class="text-sm text-emerald-600">delete_sweep</mat-icon>
                      <span>Тариф на вивіз сміття</span>
                    </div>
                    <div class="space-y-1.5">
                      <div>
                        <label class="block text-3xs font-semibold text-slate-500">За 1 мешканця (грн/міс)</label>
                        <input
                          type="number"
                          inputmode="decimal"
                          step="0.01"
                          [value]="modalWastePerPerson()"
                          (input)="modalWastePerPerson.set(+$any($event.target).value)"
                          class="w-full px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-300 text-xs font-mono text-slate-900"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Section 5: Bind IPTV Clients from "Клієнти та групи" -->
              <div class="space-y-2.5 p-4 rounded-2xl bg-slate-50/60 border border-slate-200/80">
                <div>
                  <div class="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <mat-icon class="text-base text-indigo-600">groups</mat-icon>
                    <span>Привʼязка абонентів з розділу «Клієнти та групи»</span>
                  </div>
                  <p class="text-2xs text-slate-500 mt-0.5">
                    Оберіть IPTV клієнтів, яких бачитиме цей користувач.
                  </p>
                </div>

                @if (allClients().length > 0) {
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                    @for (c of allClients(); track c.id) {
                      @let isClientBound = isClientBoundInModal(c.id, c.ownerUserId);
                      <button
                        type="button"
                        (click)="toggleModalClient(c.id)"
                        class="p-2.5 rounded-xl border text-left flex items-center justify-between gap-2 transition-all cursor-pointer"
                        [class.bg-indigo-50/90]="isClientBound"
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
                          class="text-base shrink-0"
                          [class.text-indigo-600]="isClientBound"
                          [class.text-slate-300]="!isClientBound"
                        >
                          {{ isClientBound ? 'check_box' : 'check_box_outline_blank' }}
                        </mat-icon>
                      </button>
                    }
                  </div>
                } @else {
                  <div class="p-3.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-500 text-center">
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
                <span>Зберегти всі налаштування користувача</span>
              </button>
            </div>
          </div>
        </div>
      }

      <!-- ADD USER MODAL -->
      @if (isAddModalOpen()) {
        <div class="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div class="bg-white rounded-t-3xl sm:rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-200 max-h-[92dvh] overflow-y-auto pb-safe">
            <div class="sm:hidden flex justify-center -mt-3 mb-3">
              <span class="w-10 h-1 rounded-full bg-slate-300"></span>
            </div>
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
                  <option value="user">Користувач (Власні дані + вибрані вкладки/будинки)</option>
                  <option value="admin">Адміністратор (Всі права)</option>
                  <option value="new">Новий (Без доступу)</option>
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

  readonly houseTabsList: { id: UtilityServiceTabId; label: string }[] = [
    { id: 'outage_schedule', label: 'Графік' },
    { id: 'electricity', label: 'Електро' },
    { id: 'water', label: 'Вода' },
    { id: 'waste', label: 'Сміття' },
  ];

  async enterTestSandbox(): Promise<void> {
    await this.dataService.switchToTestUser();
  }

  async impersonateUser(user: AppUser): Promise<void> {
    await this.dataService.switchToTestUser(user);
  }

  async impersonateFromModal(user: AppUser): Promise<void> {
    this.closePermissionsModal();
    await this.dataService.switchToTestUser(user);
  }

  async deleteUserFromModal(user: AppUser): Promise<void> {
    const ok = await this.dataService.openConfirmDialog({
      title: 'Видалити користувача?',
      message: `Ви впевнені, що бажаєте видалити користувача ${user.email}?`,
      confirmText: 'Видалити',
      cancelText: 'Скасувати',
      tone: 'danger',
      icon: 'person_remove',
    });
    if (ok) {
      this.closePermissionsModal();
      await this.dataService.deleteUser(user.id);
    }
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
  readonly searchQuery = toSignal(this.searchControl.valueChanges, { initialValue: '' });
  readonly isAddModalOpen = signal<boolean>(false);

  // Invite Link Creator state
  readonly relationTagsCatalog: MemberRelationTagMeta[] = MEMBER_RELATION_TAGS;
  readonly householdInvites = this.dataService.householdInvites;
  readonly isCreatingInvite = this.dataService.isCreatingInvite;
  readonly isInviteCreatorExpanded = signal<boolean>(false);
  readonly inviteAccessLevel = signal<HouseholdAccessLevel>('view_only'); // Default "Тільки для перегляду"
  readonly inviteIncludeSharedBudget = signal<boolean>(true);
  readonly inviteSelectedTags = signal<MemberRelationTag[]>(['family']);
  readonly inviteSelectedHouseIds = signal<string[]>([]);
  readonly lastCreatedInviteCode = signal<string>('');
  readonly lastCreatedInviteUrl = signal<string>('');
  readonly copiedInviteCode = signal<string>('');

  // Full User Settings Modal state
  readonly editingUserForPermissions = signal<AppUser | null>(null);
  readonly modalRole = signal<UserRole>('user');
  readonly modalUserStatus = signal<UserAccountStatus>('active');
  readonly modalAllowedTabs = signal<AppTabId[]>([]);
  readonly modalAllowedSettings = signal<SettingsSectionId[]>([]);
  readonly modalAssignedUtilityIds = signal<string[]>([]);
  readonly modalAssignedClientIds = signal<string[]>([]);
  readonly modalCanManageOwnData = signal<boolean>(false);
  readonly modalAccessLevel = signal<HouseholdAccessLevel>('view_only');
  readonly modalMemberTags = signal<MemberRelationTag[]>([]);

  // Individual user tariffs in modal
  readonly modalElecSingle = signal<number>(4.32);
  readonly modalElecDay = signal<number>(4.32);
  readonly modalElecNight = signal<number>(2.16);
  readonly modalWaterPerM3 = signal<number>(35.16);
  readonly modalWaterSubFee = signal<number>(21.5);
  readonly modalWastePerPerson = signal<number>(35.0);

  readonly allClients = computed<Client[]>(() => this.dataService.clients());

  readonly addUserForm = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email]),
    name: new FormControl(''),
    role: new FormControl<UserRole>('user', [Validators.required]),
  });

  readonly adminCount = computed(() => this.users().filter((u) => u.role === 'admin').length);
  readonly viewerCount = computed(() => this.users().filter((u) => u.role === 'user').length);
  readonly inactiveCount = computed(
    () => this.users().filter((u) => !isUserAccountActive(u)).length
  );

  readonly filteredUsers = computed(() => {
    const list = this.users();
    const filter = this.selectedRoleFilter();
    const query = (this.searchQuery() || '').trim().toLowerCase();

    return list.filter((user) => {
      if (filter === 'inactive') {
        if (isUserAccountActive(user)) return false;
      } else if (filter !== 'all' && user.role !== filter) {
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
    void this.dataService.fetchUsers();
    void this.dataService.fetchHouseholdInvites();
  }

  openInvitePanel(): void {
    this.isInviteCreatorExpanded.set(true);
    if (this.inviteSelectedHouseIds().length === 0) {
      this.inviteSelectedHouseIds.set(this.allUtilityAccounts().map((a) => a.id));
    }
    void this.dataService.fetchHouseholdInvites();
  }

  readonly copiedCleanApp = signal<boolean>(false);

  openGlobalHouseholdModal(): void {
    this.dataService.openSharedHouseholdModal();
  }

  async shareCleanAppFromUsersView(): Promise<void> {
    const url = this.dataService.publicAppBaseUrl;
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    if (nav && typeof nav.share === 'function') {
      try {
        await nav.share({
          title: 'HomeHub — Комунальні послуги, графік ДТЕК та бюджет',
          text: 'Застосунок для обліку комунальних послуг, графіків відключень світла ДТЕК та домашнього бюджету:',
          url,
        });
        return;
      } catch {
        // fallback to clipboard
      }
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(url);
      this.copiedCleanApp.set(true);
      setTimeout(() => this.copiedCleanApp.set(false), 2500);
    }
  }

  getRelationTagMeta(tagId: string): MemberRelationTagMeta | undefined {
    return this.relationTagsCatalog.find((t) => t.id === tagId);
  }

  getUserRelationTags(user: AppUser): MemberRelationTag[] {
    return Array.isArray(user.memberTags) ? user.memberTags : [];
  }

  getUserAccessLevel(user: AppUser): HouseholdAccessLevel {
    if (user.householdAccessLevel === 'view_only' || user.householdAccessLevel === 'full') {
      return user.householdAccessLevel;
    }
    return user.canManageOwnData === false ? 'view_only' : 'full';
  }

  getSelectedInviteRelation(): MemberRelationTag {
    const tags = this.inviteSelectedTags();
    return tags.length > 0 ? tags[0] : 'family';
  }

  setInviteRelation(tagId: string): void {
    const clean = (tagId || '').trim() as MemberRelationTag;
    this.inviteSelectedTags.set(clean ? [clean] : ['family']);
  }

  toggleInviteTag(tagId: MemberRelationTag): void {
    this.inviteSelectedTags.set([tagId]);
  }

  isInviteHouseSelected(houseId: string): boolean {
    const sel = this.inviteSelectedHouseIds();
    if (sel.length === 0) return true;
    return sel.includes(houseId);
  }

  toggleInviteHouse(houseId: string): void {
    const allIds = this.allUtilityAccounts().map((a) => a.id);
    const curr = this.inviteSelectedHouseIds().length > 0 ? this.inviteSelectedHouseIds() : allIds;
    if (curr.includes(houseId)) {
      if (curr.length <= 1) return;
      this.inviteSelectedHouseIds.set(curr.filter((id) => id !== houseId));
    } else {
      this.inviteSelectedHouseIds.set([...curr, houseId]);
    }
  }

  async generateNewInviteLink(): Promise<void> {
    const allIds = this.allUtilityAccounts().map((a) => a.id);
    const houseIds =
      this.inviteSelectedHouseIds().length > 0 ? this.inviteSelectedHouseIds() : allIds;
    const primaryTag = this.getSelectedInviteRelation();
    const inv = await this.dataService.createHouseholdInvite({
      houseIds,
      accessLevel: this.inviteAccessLevel(),
      includeSharedBudget: this.inviteIncludeSharedBudget(),
      memberTags: [primaryTag],
    });
    if (inv) {
      this.lastCreatedInviteCode.set(inv.code);
      this.lastCreatedInviteUrl.set(this.dataService.buildInviteUrl(inv.code));
      this.copyInviteLink(inv.code);
    }
  }

  getInviteUrl(code: string): string {
    return this.dataService.buildInviteUrl(code);
  }

  copyInviteLink(code: string): void {
    const url = this.dataService.buildInviteUrl(code);
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(url);
      this.copiedInviteCode.set(code);
      setTimeout(() => {
        if (this.copiedInviteCode() === code) {
          this.copiedInviteCode.set('');
        }
      }, 2500);
    }
  }

  async removeInvite(id: string): Promise<void> {
    await this.dataService.deleteHouseholdInvite(id);
  }

  setModalAccessLevel(level: HouseholdAccessLevel): void {
    this.modalAccessLevel.set(level);
    this.modalCanManageOwnData.set(level === 'full');
  }

  getSelectedModalMemberRelation(): MemberRelationTag {
    const tags = this.modalMemberTags();
    return tags.length > 0 ? tags[0] : 'family';
  }

  setModalMemberRelation(tagId: string): void {
    const clean = (tagId || '').trim() as MemberRelationTag;
    this.modalMemberTags.set(clean ? [clean] : ['family']);
  }

  toggleModalMemberTag(tagId: MemberRelationTag): void {
    this.modalMemberTags.set([tagId]);
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
    const rawTabs = Array.isArray(user.allowedTabs)
      ? (user.allowedTabs.filter(
          (t) =>
            typeof t === 'string' &&
            !t.startsWith('settings:') &&
            !t.startsWith('tag:') &&
            !t.startsWith('access:') &&
            !t.startsWith('invitedBy:') &&
            !t.startsWith('invitedByName:')
        ) as AppTabId[])
      : [];
    const base =
      rawTabs.length > 0
        ? rawTabs
        : user.role === 'admin'
          ? this.assignableTabs.map((t) => t.id)
          : [...DEFAULT_USER_TABS];
    const expanded = new Set<AppTabId>(base);
    if (expanded.has('water_waste')) {
      expanded.add('water');
      expanded.add('waste');
    }
    if (user.role === 'admin' || this.getUserAllowedSettings(user).length > 0) {
      expanded.add('settings');
    }
    return Array.from(expanded);
  }

  getUserAllowedSettings(user: AppUser): SettingsSectionId[] {
    const scopes = this.dataService.systemSettingsConfig().scopesConfig || {};
    return extractAllowedSettingsFromUser(user, scopes);
  }

  isSettingUserScoped(sectionId: SettingsSectionId): boolean {
    return this.dataService.getSettingScope(sectionId) === 'user';
  }

  isAccountOwnedByUser(acc: UtilityAccount, user: AppUser): boolean {
    return Boolean(acc.ownerUserId && acc.ownerUserId === user.id);
  }

  getHouseOwnerLabel(acc: UtilityAccount): string {
    if (!acc.ownerUserId) return 'Не вказано';
    const found = this.users().find((u) => u.id === acc.ownerUserId);
    return found ? found.name || found.email : acc.ownerUserId;
  }

  getUserBoundHouses(user: AppUser): UtilityAccount[] {
    const all = this.allUtilityAccounts();
    const assignedSet = new Set(user.assignedUtilityAccountIds || []);
    return all.filter(
      (acc) =>
        this.isAccountOwnedByUser(acc, user) ||
        assignedSet.has(acc.id) ||
        (Array.isArray(acc.assignedUserIds) && acc.assignedUserIds.includes(user.id))
    );
  }

  getUserBoundClients(user: AppUser): Client[] {
    const assignedSet = new Set(user.assignedClientIds || []);
    return this.allClients().filter(
      (c) => assignedSet.has(String(c.id)) || c.ownerUserId === user.id
    );
  }

  isHouseHiddenForTargetUser(userId: string, account: UtilityAccount, tabId: UtilityServiceTabId): boolean {
    return this.dataService.isHouseHiddenInTabForUser(userId, account, tabId);
  }

  async toggleHouseVisibilityForTargetUser(
    userId: string,
    accountId: string,
    tabId: UtilityServiceTabId
  ): Promise<void> {
    await this.dataService.toggleHouseVisibilityInTabForUser(userId, accountId, tabId);
  }

  isUserActive(user: AppUser): boolean {
    return isUserAccountActive(user);
  }

  onModalRoleChange(newRole: UserRole): void {
    this.modalRole.set(newRole);
    if (newRole === 'new') {
      this.modalUserStatus.set('inactive');
    } else {
      this.modalUserStatus.set('active');
    }
  }

  async onInstantToggleUserAccess(user: AppUser): Promise<void> {
    const currentlyActive = this.modalUserStatus() === 'active' && this.modalRole() !== 'new';
    const nextStatus: UserAccountStatus = currentlyActive ? 'inactive' : 'active';
    this.modalUserStatus.set(nextStatus);
    if (nextStatus === 'active' && this.modalRole() === 'new') {
      this.modalRole.set('user');
    }
    const ok = await this.dataService.toggleUserAccessStatus(user.id, nextStatus);
    if (ok) {
      const refreshed = this.users().find((u) => u.id === user.id);
      if (refreshed) {
        this.editingUserForPermissions.set(refreshed);
      }
    }
  }

  openPermissionsModal(user: AppUser): void {
    this.editingUserForPermissions.set(user);
    this.modalRole.set(user.role);
    this.modalUserStatus.set(isUserAccountActive(user) ? 'active' : 'inactive');
    this.modalAllowedTabs.set([...this.getUserAllowedTabs(user)]);
    this.modalAllowedSettings.set([...this.getUserAllowedSettings(user)]);

    const assignedHouseSet = new Set(user.assignedUtilityAccountIds || []);
    for (const acc of this.allUtilityAccounts()) {
      if (
        (Array.isArray(acc.assignedUserIds) && acc.assignedUserIds.includes(user.id)) ||
        (acc.ownerUserId && acc.ownerUserId === user.id)
      ) {
        assignedHouseSet.add(acc.id);
      }
    }
    this.modalAssignedUtilityIds.set(Array.from(assignedHouseSet));
    this.modalAssignedClientIds.set([...(user.assignedClientIds || [])]);
    const effectiveAccess = this.getUserAccessLevel(user);
    this.modalAccessLevel.set(effectiveAccess);
    this.modalCanManageOwnData.set(effectiveAccess === 'full');
    this.modalMemberTags.set([...this.getUserRelationTags(user)]);

    // Load individual tariffs for this user
    const userTariffs = this.dataService.getUserEffectiveTariffs(user.id);
    this.modalElecSingle.set(userTariffs.electricitySingle?.rate ?? 4.32);
    this.modalElecDay.set(userTariffs.electricityDual?.summerDay ?? 4.32);
    this.modalElecNight.set(userTariffs.electricityDual?.summerNight ?? 2.16);
    this.modalWaterPerM3.set(userTariffs.water?.price ?? 32);
    this.modalWaterSubFee.set(userTariffs.water?.monthlyFee ?? 0);
    this.modalWastePerPerson.set(userTariffs.waste?.price ?? 45);
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

  selectDefaultUserModalSettings(): void {
    this.modalAllowedSettings.set(this.dataService.getUserScopedSettingsSections());
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
    this.modalAllowedTabs.set(['electricity', 'water', 'waste', 'settings']);
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

    const newRole = this.modalRole();
    if (newRole !== user.role) {
      await this.dataService.updateUserRole(user.id, newRole);
    }

    const settingsSecs = this.modalAllowedSettings();
    const baseTabs = this.modalAllowedTabs().filter((t) => t !== 'settings');
    const finalTabs: AppTabId[] = settingsSecs.length > 0 ? [...baseTabs, 'settings'] : baseTabs;

    await this.dataService.updateUserPermissions(user.id, {
      role: newRole,
      status: this.modalUserStatus(),
      allowedTabs: finalTabs,
      allowedSettings: settingsSecs,
      assignedUtilityAccountIds: this.modalAssignedUtilityIds(),
      assignedClientIds: this.modalAssignedClientIds(),
      canManageOwnData: this.modalAccessLevel() === 'full',
      householdAccessLevel: this.modalAccessLevel(),
      memberTags: this.modalMemberTags(),
    });

    const baseTariffs = this.dataService.getUserEffectiveTariffs(user.id);
    const singleRate = Number(this.modalElecSingle()) || 4.32;
    const dayRate = Number(this.modalElecDay()) || 4.32;
    const nightRate = Number(this.modalElecNight()) || 2.16;
    const waterPrice = Number(this.modalWaterPerM3()) || 32;
    const waterFee = Number(this.modalWaterSubFee()) || 0;
    const wastePrice = Number(this.modalWastePerPerson()) || 45;

    await this.dataService.updateUtilityTariffs(
      {
        ...baseTariffs,
        electricitySingle: {
          ...baseTariffs.electricitySingle,
          rate: singleRate,
        },
        electricityDual: {
          ...baseTariffs.electricityDual,
          summerDay: dayRate,
          summerNight: nightRate,
          winterDay: dayRate,
          winterNight: nightRate,
        },
        water: {
          ...baseTariffs.water,
          price: waterPrice,
          monthlyFee: waterFee,
        },
        waste: {
          ...baseTariffs.waste,
          price: wastePrice,
        },
      },
      { targetUserId: user.id }
    );

    this.closePermissionsModal();
  }

  async refreshUsers(): Promise<void> {
    await this.dataService.fetchUsers();
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
