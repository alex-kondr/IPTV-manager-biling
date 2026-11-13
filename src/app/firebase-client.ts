import { FIREBASE_APPLET_CONFIG } from './firebase-config';

export interface FirebasePopupLoginResult {
  idToken?: string;
  accessToken?: string;
  email?: string;
  name?: string;
  picture?: string;
  sub?: string;
}

interface GisTokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
}

interface GisWindow {
  google?: {
    accounts?: {
      oauth2?: {
        initTokenClient: (config: {
          client_id: string;
          scope: string;
          prompt?: string;
          callback: (resp: { access_token?: string; error?: string }) => void;
          error_callback?: (err: { type?: string; message?: string }) => void;
        }) => GisTokenClient;
      };
    };
  };
}

function loadGisScript(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve();
  }
  const w = window as unknown as GisWindow;
  if (w.google?.accounts?.oauth2) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Не вдалося завантажити Google Identity Services')));
      setTimeout(() => resolve(), 1500);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Не вдалося завантажити Google Identity Services'));
    document.head.appendChild(script);
  });
}

async function triggerGisOAuthPopup(): Promise<FirebasePopupLoginResult | null> {
  await loadGisScript();
  const w = window as unknown as GisWindow;
  const oauth2 = w.google?.accounts?.oauth2;
  if (!oauth2) {
    throw new Error('Google Identity Services недоступний у браузері');
  }

  const accessToken = await new Promise<string>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: FIREBASE_APPLET_CONFIG.oAuthClientId,
      scope: 'openid email profile',
      prompt: 'select_account',
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject({ code: 'auth/popup-closed-by-user', message: resp.error || 'Скасовано' });
          return;
        }
        resolve(resp.access_token);
      },
      error_callback: (err) => {
        if (err?.type === 'popup_failed_to_open') {
          reject({ code: 'auth/popup-blocked', message: 'Спливаюче вікно заблоковано' });
        } else {
          reject({ code: 'auth/popup-closed-by-user', message: err?.message || 'Вікно закрито' });
        }
      },
    });
    client.requestAccessToken({ prompt: 'select_account' });
  });

  const userInfoResp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!userInfoResp.ok) {
    throw new Error('Не вдалося отримати дані профілю Google');
  }
  const profile = (await userInfoResp.json()) as Record<string, unknown>;
  return {
    accessToken,
    email: typeof profile['email'] === 'string' ? profile['email'] : undefined,
    name: typeof profile['name'] === 'string' ? profile['name'] : undefined,
    picture: typeof profile['picture'] === 'string' ? profile['picture'] : undefined,
    sub: typeof profile['sub'] === 'string' ? profile['sub'] : undefined,
  };
}

export async function triggerFirebaseGooglePopup(): Promise<FirebasePopupLoginResult | null> {
  if (typeof window === 'undefined') {
    return null;
  }

  // 1. Try Firebase Auth popup first if modules load cleanly
  try {
    const { initializeApp, getApps, getApp } = await import('firebase/app');
    const { getAuth, GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');

    const app = getApps().length > 0 ? getApp() : initializeApp(FIREBASE_APPLET_CONFIG);
    const auth = getAuth(app);

    const provider = new GoogleAuthProvider();
    provider.addScope('email');
    provider.addScope('profile');
    provider.setCustomParameters({
      prompt: 'select_account',
    });

    const result = await signInWithPopup(auth, provider);
    const idToken = await result.user.getIdToken();

    return {
      idToken,
      email: result.user.email || undefined,
      name: result.user.displayName || undefined,
      picture: result.user.photoURL || undefined,
      sub: result.user.uid,
    };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code || '';
    const errString = String(err || '');

    // User explicitly cancelled or closed popup
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      throw err;
    }
    if (code === 'auth/popup-blocked') {
      throw err;
    }

    // If dynamic chunk loading failed (e.g. stale Vite/Rollup chunk in browser cache),
    // or domain is unauthorized in Firebase console, smoothly fall back to Google Identity Services
    if (
      errString.includes('Failed to fetch dynamically imported module') ||
      errString.includes('dynamically imported module') ||
      code === 'auth/unauthorized-domain' ||
      code === 'auth/operation-not-supported-in-this-environment' ||
      code === 'auth/configuration-not-found'
    ) {
      console.warn('Falling back to Google Identity Services OAuth popup:', err);
      return await triggerGisOAuthPopup();
    }
    throw err;
  }
}

export async function triggerFirebaseSignOut(): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    const { getApps, getApp } = await import('firebase/app');
    const { getAuth, signOut } = await import('firebase/auth');
    if (getApps().length > 0) {
      const auth = getAuth(getApp());
      await signOut(auth);
    }
  } catch (e) {
    console.debug('Firebase signOut error:', e);
  }
}
