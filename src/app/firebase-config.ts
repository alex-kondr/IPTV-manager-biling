export interface FirebaseAppletConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId: string;
  storageBucket: string;
  messagingSenderId: string;
  measurementId: string;
  oAuthClientId: string;
  recaptchaSiteKey: string;
}

const getEnv = (key: string): string => {
  if (typeof process !== 'undefined' && process && process.env && process.env[key]) {
    return process.env[key]!.trim();
  }
  return '';
};

export const FIREBASE_APPLET_CONFIG: FirebaseAppletConfig = {
  projectId: getEnv('FIREBASE_PROJECT_ID'),
  appId: getEnv('FIREBASE_APP_ID'),
  apiKey: getEnv('FIREBASE_API_KEY'),
  authDomain: getEnv('FIREBASE_AUTH_DOMAIN'),
  firestoreDatabaseId: getEnv('FIREBASE_FIRESTORE_DATABASE_ID'),
  storageBucket: getEnv('FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: getEnv('FIREBASE_MESSAGING_SENDER_ID'),
  measurementId: getEnv('FIREBASE_MEASUREMENT_ID'),
  oAuthClientId: getEnv('FIREBASE_OAUTH_CLIENT_ID') || getEnv('GOOGLE_CLIENT_ID'),
  recaptchaSiteKey: getEnv('FIREBASE_RECAPTCHA_SITE_KEY'),
};

export function setFirebaseAppletConfig(partial?: Partial<FirebaseAppletConfig> | null): void {
  if (!partial || typeof partial !== 'object') return;
  if (partial.projectId) FIREBASE_APPLET_CONFIG.projectId = partial.projectId;
  if (partial.appId) FIREBASE_APPLET_CONFIG.appId = partial.appId;
  if (partial.apiKey) FIREBASE_APPLET_CONFIG.apiKey = partial.apiKey;
  if (partial.authDomain) FIREBASE_APPLET_CONFIG.authDomain = partial.authDomain;
  if (partial.firestoreDatabaseId) FIREBASE_APPLET_CONFIG.firestoreDatabaseId = partial.firestoreDatabaseId;
  if (partial.storageBucket) FIREBASE_APPLET_CONFIG.storageBucket = partial.storageBucket;
  if (partial.messagingSenderId) FIREBASE_APPLET_CONFIG.messagingSenderId = partial.messagingSenderId;
  if (partial.measurementId !== undefined) FIREBASE_APPLET_CONFIG.measurementId = partial.measurementId;
  if (partial.oAuthClientId) FIREBASE_APPLET_CONFIG.oAuthClientId = partial.oAuthClientId;
  if (partial.recaptchaSiteKey !== undefined) FIREBASE_APPLET_CONFIG.recaptchaSiteKey = partial.recaptchaSiteKey;
}

let inFlightConfigLoad: Promise<FirebaseAppletConfig> | null = null;

export async function ensureFirebaseClientConfigLoaded(): Promise<FirebaseAppletConfig> {
  if (FIREBASE_APPLET_CONFIG.apiKey && FIREBASE_APPLET_CONFIG.oAuthClientId) {
    return FIREBASE_APPLET_CONFIG;
  }
  if (typeof window === 'undefined') {
    return FIREBASE_APPLET_CONFIG;
  }
  if (!inFlightConfigLoad) {
    inFlightConfigLoad = (async () => {
      try {
        const resp = await fetch('/api/firebase-config', { cache: 'no-store' });
        if (resp.ok) {
          const data = (await resp.json()) as Partial<FirebaseAppletConfig>;
          setFirebaseAppletConfig(data);
        }
      } catch {
        // Ignore transient network errors
      } finally {
        inFlightConfigLoad = null;
      }
      return FIREBASE_APPLET_CONFIG;
    })();
  }
  return inFlightConfigLoad;
}
