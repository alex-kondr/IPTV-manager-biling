import appletConfigJson from '../../firebase-applet-config.json';

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

const cleanStr = (val: unknown): string => {
  if (typeof val !== 'string') return '';
  return val.trim().replace(/^["']+|["']+$/g, '').trim();
};

const getEnv = (key: string): string => {
  if (typeof process !== 'undefined' && process && process.env && process.env[key]) {
    return cleanStr(process.env[key]);
  }
  return '';
};

const isValidFirebaseApiKey = (val: string): boolean => {
  return val.startsWith('AIza') && val.length >= 30;
};

const envApiKey = getEnv('FIREBASE_API_KEY');
const jsonApiKey = cleanStr(appletConfigJson?.apiKey);

export const FIREBASE_APPLET_CONFIG: FirebaseAppletConfig = {
  projectId: getEnv('FIREBASE_PROJECT_ID') || cleanStr(appletConfigJson?.projectId),
  appId: getEnv('FIREBASE_APP_ID') || cleanStr(appletConfigJson?.appId),
  apiKey: isValidFirebaseApiKey(envApiKey) ? envApiKey : jsonApiKey,
  authDomain: getEnv('FIREBASE_AUTH_DOMAIN') || cleanStr(appletConfigJson?.authDomain),
  firestoreDatabaseId:
    getEnv('FIREBASE_FIRESTORE_DATABASE_ID') || cleanStr(appletConfigJson?.firestoreDatabaseId),
  storageBucket: getEnv('FIREBASE_STORAGE_BUCKET') || cleanStr(appletConfigJson?.storageBucket),
  messagingSenderId:
    getEnv('FIREBASE_MESSAGING_SENDER_ID') || cleanStr(appletConfigJson?.messagingSenderId),
  measurementId: getEnv('FIREBASE_MEASUREMENT_ID') || cleanStr(appletConfigJson?.measurementId),
  oAuthClientId:
    getEnv('FIREBASE_OAUTH_CLIENT_ID') ||
    getEnv('GOOGLE_CLIENT_ID') ||
    cleanStr(appletConfigJson?.oAuthClientId),
  recaptchaSiteKey:
    getEnv('FIREBASE_RECAPTCHA_SITE_KEY') || cleanStr(appletConfigJson?.recaptchaSiteKey),
};

export function setFirebaseAppletConfig(partial?: Partial<FirebaseAppletConfig> | null): void {
  if (!partial || typeof partial !== 'object') return;
  const projectId = cleanStr(partial.projectId);
  const appId = cleanStr(partial.appId);
  const apiKey = cleanStr(partial.apiKey);
  const authDomain = cleanStr(partial.authDomain);
  const firestoreDatabaseId = cleanStr(partial.firestoreDatabaseId);
  const storageBucket = cleanStr(partial.storageBucket);
  const messagingSenderId = cleanStr(partial.messagingSenderId);
  const oAuthClientId = cleanStr(partial.oAuthClientId);

  if (projectId) FIREBASE_APPLET_CONFIG.projectId = projectId;
  if (appId) FIREBASE_APPLET_CONFIG.appId = appId;
  if (isValidFirebaseApiKey(apiKey)) FIREBASE_APPLET_CONFIG.apiKey = apiKey;
  if (authDomain) FIREBASE_APPLET_CONFIG.authDomain = authDomain;
  if (firestoreDatabaseId) FIREBASE_APPLET_CONFIG.firestoreDatabaseId = firestoreDatabaseId;
  if (storageBucket) FIREBASE_APPLET_CONFIG.storageBucket = storageBucket;
  if (messagingSenderId) FIREBASE_APPLET_CONFIG.messagingSenderId = messagingSenderId;
  if (partial.measurementId !== undefined) {
    FIREBASE_APPLET_CONFIG.measurementId = cleanStr(partial.measurementId);
  }
  if (oAuthClientId) FIREBASE_APPLET_CONFIG.oAuthClientId = oAuthClientId;
  if (partial.recaptchaSiteKey !== undefined) {
    FIREBASE_APPLET_CONFIG.recaptchaSiteKey = cleanStr(partial.recaptchaSiteKey);
  }
}

let inFlightConfigLoad: Promise<FirebaseAppletConfig> | null = null;

export async function ensureFirebaseClientConfigLoaded(): Promise<FirebaseAppletConfig> {
  if (typeof window === 'undefined') {
    return FIREBASE_APPLET_CONFIG;
  }
  if (isValidFirebaseApiKey(FIREBASE_APPLET_CONFIG.apiKey) && FIREBASE_APPLET_CONFIG.oAuthClientId) {
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
