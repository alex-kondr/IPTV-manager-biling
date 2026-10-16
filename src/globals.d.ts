interface TelegramWebUser {
  id?: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

interface TelegramWebAppThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
}

interface TelegramWebAppSDK {
  ready(): void;
  expand(): void;
  close(): void;
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  platform: string;
  version: string;
  colorScheme: 'light' | 'dark';
  themeParams: TelegramWebAppThemeParams;
  initData: string;
  initDataUnsafe: {
    query_id?: string;
    user?: TelegramWebUser;
    receiver?: TelegramWebUser;
    start_param?: string;
    auth_date?: string;
    hash?: string;
  };
  MainButton: {
    text: string;
    color: string;
    textColor: string;
    isVisible: boolean;
    isActive: boolean;
    isProgressVisible: boolean;
    setText(text: string): void;
    onClick(callback: () => void): void;
    offClick(callback: () => void): void;
    show(): void;
    hide(): void;
    enable(): void;
    disable(): void;
    showProgress(leaveActive?: boolean): void;
    hideProgress(): void;
  };
  BackButton: {
    isVisible: boolean;
    onClick(callback: () => void): void;
    offClick(callback: () => void): void;
    show(): void;
    hide(): void;
  };
  HapticFeedback: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
    selectionChanged(): void;
  };
  openLink(url: string, options?: { try_instant_view?: boolean }): void;
  openTelegramLink(url: string): void;
  showAlert(message: string, callback?: () => void): void;
  showConfirm(message: string, callback?: (confirmed: boolean) => void): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
}

interface BeforeInstallPromptChoice {
  outcome: 'accepted' | 'dismissed';
  platform: string;
}

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<BeforeInstallPromptChoice>;
  prompt(): Promise<void>;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebAppSDK;
    };
    beforeInstallPromptEvent?: BeforeInstallPromptEvent;
    google?: {
      accounts: {
        id: {
          initialize(config: { client_id: string; callback: (response: { credential: string }) => void; auto_select?: boolean }): void;
          renderButton(parent: HTMLElement, options: { theme?: string; size?: string; width?: number; text?: string; shape?: string; logo_alignment?: string }): void;
          prompt(): void;
          disableAutoSelect(): void;
        };
        oauth2: {
          initTokenClient(config: { client_id: string; scope: string; callback: (response: { access_token?: string; error?: string }) => void }): { requestAccessToken: () => void };
        };
      };
    };
  }
}

export type { TelegramWebUser, TelegramWebAppSDK, BeforeInstallPromptEvent };
