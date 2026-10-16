import { Injectable, signal, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { TelegramWebUser, BeforeInstallPromptEvent } from '../../globals';

@Injectable({
  providedIn: 'root',
})
export class TelegramWebApp {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  // Telegram state
  readonly isInsideTelegram = signal<boolean>(false);
  readonly telegramUser = signal<TelegramWebUser | null>(null);
  readonly telegramPlatform = signal<string>('browser');
  readonly colorScheme = signal<'light' | 'dark'>('light');

  // PWA state
  readonly canInstallPwa = signal<boolean>(false);
  readonly isPwaInstalled = signal<boolean>(false);
  readonly isOnline = signal<boolean>(true);

  private deferredPrompt: BeforeInstallPromptEvent | null = null;

  constructor() {
    if (this.isBrowser) {
      this.initTelegramWebApp();
      this.initPwa();
    }
  }

  private initTelegramWebApp(): void {
    const tg = window.Telegram?.WebApp;
    if (tg && tg.initData) {
      this.isInsideTelegram.set(true);
      try {
        tg.ready();
        tg.expand();
        this.telegramPlatform.set(tg.platform || 'unknown');
        this.colorScheme.set(tg.colorScheme || 'light');

        if (tg.initDataUnsafe?.user) {
          this.telegramUser.set(tg.initDataUnsafe.user);
        }

        // Apply Telegram status bar styling
        try {
          tg.setHeaderColor('#0284c7');
        } catch {
          // ignore if unsupported in older client
        }
      } catch (e) {
        console.warn('Telegram WebApp init notice:', e);
      }
    } else {
      // Check if launched with tgWebAppData query param or fallback
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has('tgWebAppVersion') || urlParams.has('tgWebAppData')) {
        this.isInsideTelegram.set(true);
      }
    }
  }

  private initPwa(): void {
    // Check if running in standalone mode (installed PWA)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      ('standalone' in window.navigator && Boolean((window.navigator as unknown as { standalone?: boolean }).standalone));
    this.isPwaInstalled.set(isStandalone);

    // Online/offline tracking
    this.isOnline.set(navigator.onLine);
    window.addEventListener('online', () => this.isOnline.set(true));
    window.addEventListener('offline', () => this.isOnline.set(false));

    // Register service worker if available
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then(() => {
            console.log('PWA Service Worker registered');
          })
          .catch((err) => {
            console.warn('Service Worker registration skipped:', err);
          });
      });
    }

    // Capture install prompt
    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      this.deferredPrompt = e as BeforeInstallPromptEvent;
      this.canInstallPwa.set(true);
    });

    window.addEventListener('appinstalled', () => {
      this.isPwaInstalled.set(true);
      this.canInstallPwa.set(false);
      this.deferredPrompt = null;
    });
  }

  /**
   * Trigger PWA installation prompt
   */
  async promptInstallPwa(): Promise<boolean> {
    if (!this.deferredPrompt) {
      return false;
    }
    await this.deferredPrompt.prompt();
    const { outcome } = await this.deferredPrompt.userChoice;
    this.deferredPrompt = null;
    this.canInstallPwa.set(false);
    return outcome === 'accepted';
  }

  /**
   * Haptic vibration feedback for mobile & Telegram Mini App
   */
  hapticImpact(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'medium'): void {
    if (this.isBrowser && window.Telegram?.WebApp?.HapticFeedback) {
      try {
        window.Telegram.WebApp.HapticFeedback.impactOccurred(style);
        return;
      } catch {
        // fallback
      }
    }
    if (this.isBrowser && 'vibrate' in navigator) {
      navigator.vibrate(style === 'heavy' ? 35 : 15);
    }
  }

  hapticNotification(type: 'error' | 'success' | 'warning'): void {
    if (this.isBrowser && window.Telegram?.WebApp?.HapticFeedback) {
      try {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred(type);
        return;
      } catch {
        // fallback
      }
    }
    if (this.isBrowser && 'vibrate' in navigator) {
      navigator.vibrate(type === 'success' ? [15, 30, 15] : [30, 50, 30]);
    }
  }

  /**
   * Open link in Telegram or external browser
   */
  openLink(url: string): void {
    if (!this.isBrowser) return;

    if (window.Telegram?.WebApp?.openLink) {
      window.Telegram.WebApp.openLink(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }
}
