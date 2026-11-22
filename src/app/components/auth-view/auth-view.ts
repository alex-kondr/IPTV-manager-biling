import {
  ChangeDetectionStrategy,
  Component,
  inject,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { IptvData } from '../../services/iptv-data';
import { ThemeService } from '../../services/theme';

@Component({
  selector: 'app-auth-view',
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      [class]="themeService.isClassicDesign()
        ? 'min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100 flex flex-col items-center justify-center p-4 transition-colors duration-300 relative'
        : 'min-h-screen bg-[#f4f5f7] dark:bg-[#090d16] text-slate-900 dark:text-slate-100 flex flex-col items-center justify-center p-4 transition-colors duration-300 relative'"
    >
      <!-- Theme toggle in top-right -->
      <div class="fixed top-4 right-4 z-20 flex items-center gap-2">
        <button
          type="button"
          (click)="themeService.toggleTheme()"
          aria-label="Змінити тему"
          class="p-2.5 rounded-xl bg-white dark:bg-[#111827] text-slate-700 dark:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 shadow-sm transition-all active:scale-95 cursor-pointer"
        >
          <mat-icon class="header-icon leading-none">
            @if (themeService.isDark()) { light_mode } @else { dark_mode }
          </mat-icon>
        </button>
      </div>

      <div class="w-full max-w-md animate-fade-in">
        <!-- Brand Header -->
        <div class="text-center mb-7">
          <div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-500 text-white mb-4 shadow-lg shadow-indigo-500/25">
            <mat-icon class="text-3xl leading-none">layers</mat-icon>
          </div>
          <div class="flex items-center justify-center gap-2">
            <h1
              [class]="themeService.isClassicDesign()
                ? 'text-2xl sm:text-3xl font-extrabold tracking-tight text-white'
                : 'text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white'"
            >
              Home<span class="text-indigo-500">Hub</span>
            </h1>
            <span class="px-2 py-0.5 rounded-lg bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-xs font-mono font-bold border border-indigo-200/80 dark:border-indigo-500/30">
              v6.0
            </span>
          </div>
          <p
            [class]="themeService.isClassicDesign()
              ? 'text-xs sm:text-sm text-slate-300 mt-1.5 max-w-sm mx-auto'
              : 'text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1.5 max-w-sm mx-auto'"
          >
            Комунальний простір для обліку електроенергії (ДТЕК, ООЕК), води, вивозу сміття та графіків відключень
          </p>
        </div>

        <!-- Sign-In Card -->
        <div
          [class]="themeService.isClassicDesign()
            ? 'bg-slate-900/90 border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden backdrop-blur-md text-slate-100'
            : 'bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm relative overflow-hidden'"
        >
          <div class="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-violet-500 via-indigo-500 to-sky-500"></div>

          <div class="text-center mb-6 pt-1">
            <h2
              [class]="themeService.isClassicDesign()
                ? 'text-lg font-extrabold text-white'
                : 'text-lg font-extrabold text-slate-900 dark:text-white'"
            >
              Вхід в особистий кабінет
            </h2>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Авторизуйтесь через свій обліковий запис Google для доступу до дашборду
            </p>
          </div>

          @if (errorMessage()) {
            <div class="mb-4 p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-200 text-xs flex items-start gap-2">
              <mat-icon class="text-base text-rose-500 dark:text-rose-400 shrink-0">error</mat-icon>
              <span>{{ errorMessage() }}</span>
            </div>
          }

          <button
            id="btn-google-sign-in"
            type="button"
            (click)="handleGoogleButtonClick()"
            [disabled]="isLoading()"
            class="w-full py-3.5 px-4 rounded-2xl bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold text-sm flex items-center justify-center gap-2.5 shadow-md cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-98"
          >
            <svg class="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            <span>{{ isLoading() ? 'Авторизація через Google...' : 'Увійти з Google акаунтом' }}</span>
          </button>

          <div class="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-2xs text-slate-500 dark:text-slate-400 space-y-2">
            <div class="flex items-center gap-1.5 text-slate-700 dark:text-slate-200 font-semibold">
              <mat-icon class="text-sm text-emerald-500">verified_user</mat-icon>
              <span>Правила доступу для користувачів</span>
            </div>
            <p class="leading-relaxed">
              • <strong class="text-slate-700 dark:text-slate-300">Нові користувачі</strong> одразу отримують доступ до комунальних розділів: Електроенергія, Вода, Вивіз сміття та Графік відключень ДТЕК.
            </p>
            <p class="leading-relaxed">
              • Ви можете додати власні будинки або підключитися до «Спільного дому» за запрошенням родини.
            </p>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class AuthView {
  private readonly dataService = inject(IptvData);
  readonly themeService = inject(ThemeService);

  readonly isLoading = this.dataService.isLoading;
  readonly errorMessage = this.dataService.errorMessage;

  async handleGoogleButtonClick(): Promise<void> {
    await this.dataService.signInWithGooglePopup();
  }
}
