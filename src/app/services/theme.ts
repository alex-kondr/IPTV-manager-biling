import { Injectable, signal, computed } from '@angular/core';

export type ThemeMode = 'system' | 'light' | 'dark';
export type DesignVersion = 'v5';

const STORAGE_KEY = 'homehub_theme_mode_v2';
const DESIGN_STORAGE_KEY = 'homehub_design_version_v1';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  readonly themeMode = signal<ThemeMode>('light');
  readonly designVersion = signal<DesignVersion>('v5');
  readonly systemPrefersDark = signal<boolean>(false);

  readonly isDark = computed<boolean>(() => {
    const mode = this.themeMode();
    if (mode === 'dark') return true;
    if (mode === 'light') return false;
    return this.systemPrefersDark();
  });

  readonly isClassicDesign = computed<boolean>(() => true);

  constructor() {
    if (typeof window !== 'undefined') {
      // 1. Read saved theme from localStorage (defaults to 'light')
      const savedMode = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
      if (savedMode === 'light' || savedMode === 'dark' || savedMode === 'system') {
        this.themeMode.set(savedMode);
      } else {
        this.themeMode.set('light');
      }

      // 1b. Classic style is the sole active interface style
      this.designVersion.set('v5');
      localStorage.setItem(DESIGN_STORAGE_KEY, 'v5');

      // 2. Read system color scheme preference
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      this.systemPrefersDark.set(mediaQuery.matches);

      // Listen for system theme changes
      const handleMediaChange = (e: MediaQueryListEvent) => {
        this.systemPrefersDark.set(e.matches);
        this.applyDOMTheme();
      };

      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', handleMediaChange);
      } else if ('addListener' in mediaQuery) {
        // Fallback for older browsers
        (mediaQuery as any).addListener(handleMediaChange);
      }

      // 3. Initial application to DOM
      this.applyDOMTheme();
    }
  }

  setThemeMode(mode: ThemeMode): void {
    this.themeMode.set(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, mode);
      this.applyDOMTheme();
    }
  }

  setDesignVersion(_version?: DesignVersion): void {
    this.designVersion.set('v5');
    if (typeof window !== 'undefined') {
      localStorage.setItem(DESIGN_STORAGE_KEY, 'v5');
      this.applyDOMTheme();
    }
  }

  toggleTheme(): void {
    const current = this.effectiveMode();
    const next: ThemeMode = current === 'dark' ? 'light' : 'dark';
    this.setThemeMode(next);
  }

  private effectiveMode(): 'light' | 'dark' {
    return this.isDark() ? 'dark' : 'light';
  }

  private applyDOMTheme(): void {
    if (typeof document === 'undefined') return;

    const darkActive = this.isDark();
    const root = document.documentElement;

    if (darkActive) {
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
    }

    root.classList.add('design-v5');
  }
}
