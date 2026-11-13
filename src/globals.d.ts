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

export type { BeforeInstallPromptEvent };
