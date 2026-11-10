import {
  ChangeDetectionStrategy,
  Component,
  inject,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { IptvData } from '../../services/iptv-data';

@Component({
  selector: 'app-auth-view',
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div class="w-full max-w-md">
        <!-- Logo & Title -->
        <div class="text-center mb-8">
          <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 mb-3 shadow-lg shadow-emerald-950/50">
            <mat-icon class="text-3xl leading-none">home_work</mat-icon>
          </div>
          <div class="flex items-center justify-center gap-2">
            <h1 class="text-2xl font-black tracking-tight text-white">HomeHub: Сервіси та Облік</h1>
            <span class="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 text-xs font-mono font-bold border border-emerald-500/30">v3.0</span>
          </div>
          <p class="text-xs text-slate-400 mt-1">Єдина система обліку електроенергії (ДТЕК, ООЕК), водопостачання та вивозу сміття</p>
        </div>

        <!-- SIGN IN CARD -->
        <div class="bg-slate-800/90 border border-slate-700/80 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-md relative overflow-hidden">
          <div class="text-center mb-6">
            <h2 class="text-lg font-bold text-white">Вхід в особистий кабінет</h2>
            <p class="text-xs text-slate-400 mt-1">Авторизуйтесь через свій обліковий запис Google для доступу до застосунку</p>
          </div>

          @if (errorMessage()) {
            <div class="mb-4 p-3.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-2">
              <mat-icon class="text-base text-rose-400 shrink-0">error</mat-icon>
              <span>{{ errorMessage() }}</span>
            </div>
          }

          <!-- Single Google Sign-In Button -->
          <button
            id="btn-google-sign-in"
            type="button"
            (click)="handleGoogleButtonClick()"
            [disabled]="isLoading()"
            class="w-full py-3.5 px-4 rounded-xl bg-white hover:bg-slate-100 active:bg-slate-200 text-slate-900 font-extrabold text-sm flex items-center justify-center gap-2.5 shadow-xl shadow-slate-950/50 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-98"
          >
            <svg class="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            <span>{{ isLoading() ? 'Авторизація через Google...' : 'Увійти з Google акаунтом' }}</span>
          </button>

          <!-- Information Note -->
          <div class="mt-6 pt-4 border-t border-slate-700/60 text-3xs text-slate-400 space-y-2">
            <div class="flex items-center gap-1.5 text-slate-300 font-semibold">
              <mat-icon class="text-xs text-emerald-400">verified_user</mat-icon>
              <span>Правила доступу для користувачів</span>
            </div>
            <p class="leading-relaxed">
              • <strong>Нові користувачі</strong> після входу за замовчуванням отримують доступ до комунальних вкладок: <strong>Графік світла ДТЕК, Електроенергія, Вода та Вивіз сміття</strong>.
            </p>
            <p class="leading-relaxed">
              • Список будинків у нового користувача <strong>порожній за замовчуванням</strong> — кожен користувач може додавати власні будинки або отримати доступ до об'єктів від адміністратора.
            </p>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class AuthView {
  private readonly dataService = inject(IptvData);

  readonly isLoading = this.dataService.isLoading;
  readonly errorMessage = this.dataService.errorMessage;

  async handleGoogleButtonClick(): Promise<void> {
    await this.dataService.signInWithGooglePopup();
  }
}

