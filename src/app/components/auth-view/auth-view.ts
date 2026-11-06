import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { IptvData } from '../../services/iptv-data';

@Component({
  selector: 'app-auth-view',
  imports: [ReactiveFormsModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div class="w-full max-w-lg">
        <!-- Logo & Title -->
        <div class="text-center mb-8">
          <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 mb-3 shadow-lg shadow-emerald-950/50">
            <mat-icon class="text-3xl leading-none">home_work</mat-icon>
          </div>
          <div class="flex items-center justify-center gap-2">
            <h1 class="text-2xl font-black tracking-tight text-white">HomeHub: Сервіси та Облік</h1>
            <span class="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 text-xs font-mono font-bold border border-emerald-500/30">v3.0</span>
          </div>
          <p class="text-xs text-slate-400 mt-1">Єдина система обліку електроенергії (ДТЕК, ООЕК), водопостачання, бюджету та білінгу IPTV</p>
        </div>

        @if (isNewUser()) {
          <!-- PENDING ACCESS CARD -->
          <div class="bg-slate-800/90 border border-amber-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-md relative overflow-hidden">
            <div class="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>

            <div class="text-center">
              <div class="w-14 h-14 mx-auto rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center mb-4">
                <mat-icon class="text-3xl">hourglass_top</mat-icon>
              </div>

              <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-bold mb-3">
                <span class="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                <span>Очікує схвалення адміністратора</span>
              </div>

              <h2 class="text-lg font-bold text-white mb-2">Обліковий запис зареєстровано</h2>
              <p class="text-xs text-slate-300 leading-relaxed max-w-md mx-auto mb-6">
                Ви успішно увійшли через Google. Доступ до функціоналу надає головний адміністратор у своїй панелі управління.
              </p>

              <!-- Profile Details -->
              @if (currentUser(); as user) {
                <div class="p-4 rounded-2xl bg-slate-900/80 border border-slate-700/80 flex items-center gap-3.5 mb-6 text-left">
                  <img
                    [src]="user.picture || 'https://ui-avatars.com/api/?name=' + user.name"
                    [alt]="user.name"
                    class="w-11 h-11 rounded-xl object-cover border border-slate-600 shrink-0"
                    referrerpolicy="no-referrer"
                  />
                  <div class="min-w-0 flex-1">
                    <div class="text-sm font-bold text-white truncate">{{ user.name }}</div>
                    <div class="text-xs text-slate-400 font-mono truncate">{{ user.email }}</div>
                    <div class="text-3xs text-amber-400 font-semibold mt-0.5 flex items-center gap-1">
                      <mat-icon class="text-2xs">shield</mat-icon>
                      <span>Роль: Новий (без доступу)</span>
                    </div>
                  </div>
                </div>
              }

              <!-- Actions -->
              <div class="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  (click)="checkAccess()"
                  [disabled]="isCheckingAccess()"
                  class="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md cursor-pointer transition-all disabled:opacity-50"
                >
                  <mat-icon [class.animate-spin]="isCheckingAccess()" class="text-sm">refresh</mat-icon>
                  <span>{{ isCheckingAccess() ? 'Перевіряємо...' : 'Перевірити статус доступу' }}</span>
                </button>

                <button
                  type="button"
                  (click)="logout()"
                  class="py-3 px-4 rounded-xl bg-slate-700 hover:bg-slate-600 active:bg-slate-800 text-slate-200 font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <mat-icon class="text-sm">logout</mat-icon>
                  <span>Вийти</span>
                </button>
              </div>

              <!-- Roles Explanations -->
              <div class="mt-6 pt-5 border-t border-slate-700/60 text-left text-3xs text-slate-400 space-y-1.5">
                <div class="font-bold text-slate-300 mb-1">Рівні доступу в системі:</div>
                <div class="flex items-center gap-1.5"><span class="text-emerald-400 font-bold">👑 Адмін:</span> повне керування клієнтами, оплатами, тарифами та надання прав іншим.</div>
                <div class="flex items-center gap-1.5"><span class="text-sky-400 font-bold">👁️ Користувач:</span> перегляд клієнтів, аналітики, балансу та історії (без права змін).</div>
                <div class="flex items-center gap-1.5"><span class="text-amber-400 font-bold">⏳ Новий:</span> очікує активації адміністратором.</div>
              </div>
            </div>
          </div>
        } @else {
            <!-- SIGN IN CARD -->
            <div class="bg-slate-800/90 border border-slate-700/80 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-md relative overflow-hidden">
              <div class="text-center mb-6">
                <h2 class="text-lg font-bold text-white">Вхід в особистий кабінет</h2>
                <p class="text-xs text-slate-400 mt-1">Авторизуйтесь за допомогою свого Google акаунту</p>
              </div>

              <!-- Single Primary Google Auth Button -->
              <form [formGroup]="loginForm" (ngSubmit)="submitCustomLogin()" class="space-y-4">
                <div>
                  <label for="auth-email-input" class="block text-2xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                    Ваш Google Email
                  </label>
                  <div class="relative">
                    <mat-icon class="absolute left-3.5 top-3 text-base text-slate-400">mail</mat-icon>
                    <input
                      id="auth-email-input"
                      type="email"
                      formControlName="email"
                      placeholder="user@gmail.com"
                      class="w-full pl-10 pr-3.5 py-3 rounded-xl bg-slate-900/90 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500 font-mono transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label for="auth-name-input" class="block text-2xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                    Ваше імʼя (необовʼязково)
                  </label>
                  <div class="relative">
                    <mat-icon class="absolute left-3.5 top-3 text-base text-slate-400">badge</mat-icon>
                    <input
                      id="auth-name-input"
                      type="text"
                      formControlName="name"
                      placeholder="Ім'я та Прізвище"
                      class="w-full pl-10 pr-3.5 py-3 rounded-xl bg-slate-900/90 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>
                </div>

                <!-- Single Primary Google Sign In Button -->
                <button
                  id="btn-google-sign-in"
                  type="submit"
                  [disabled]="loginForm.invalid || isLoading()"
                  class="w-full py-3.5 px-4 rounded-xl bg-white hover:bg-slate-100 active:bg-slate-200 text-slate-900 font-extrabold text-sm flex items-center justify-center gap-2.5 shadow-xl shadow-slate-950/50 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-98"
                >
                  <svg class="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                  </svg>
                  <span>{{ isLoading() ? 'Авторизація...' : 'Увійти з Google акаунтом' }}</span>
                </button>
              </form>

              <!-- Security Information Note -->
              <div class="mt-6 pt-4 border-t border-slate-700/60 text-3xs text-slate-400 space-y-1.5">
                <div class="flex items-center gap-1.5 text-slate-300 font-semibold">
                  <mat-icon class="text-xs text-emerald-400">verified_user</mat-icon>
                  <span>Захищений доступ за ролями та дозволами</span>
                </div>
                <p class="leading-relaxed">
                  Будь-який сторонній користувач при вході отримує статус <strong>«Новий акаунт»</strong> і не бачить жодних даних адміністратора чи чужих рахунків доти, доки адміністратор не підтвердить доступ у панелі управління.
                </p>
              </div>
            </div>
          }
        </div>
      </div>
    `,
})
export class AuthView {
  private readonly dataService = inject(IptvData);

  readonly currentUser = this.dataService.currentUser;
  readonly isNewUser = this.dataService.isNewUser;
  readonly isLoading = this.dataService.isLoading;
  readonly isCheckingAccess = signal<boolean>(false);

  readonly loginForm = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email]),
    name: new FormControl(''),
  });

  async submitCustomLogin(): Promise<void> {
    if (this.loginForm.invalid) return;
    const { email, name } = this.loginForm.getRawValue();
    if (!email) return;

    await this.dataService.loginWithGoogle({
      email: email.trim().toLowerCase(),
      name: name?.trim() || undefined,
    });
  }

  async checkAccess(): Promise<void> {
    this.isCheckingAccess.set(true);
    try {
      await this.dataService.checkAuth();
    } finally {
      this.isCheckingAccess.set(false);
    }
  }

  async logout(): Promise<void> {
    await this.dataService.logout();
  }
}
