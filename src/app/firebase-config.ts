const getEnv = (key: string, fallback: string): string => {
  if (typeof process !== 'undefined' && process && process.env && process.env[key]) {
    return process.env[key]!;
  }
  return fallback;
};

export const FIREBASE_APPLET_CONFIG = {
  projectId: getEnv('FIREBASE_PROJECT_ID', 'modern-realm-9nm8c'),
  appId: getEnv('FIREBASE_APP_ID', '1:456176021961:web:db9544efa01c8747833818'),
  apiKey: getEnv('FIREBASE_API_KEY', 'AIzaSyBBMsI-BiZJ7UhttBKwwkB61lylubSehTM'),
  authDomain: getEnv('FIREBASE_AUTH_DOMAIN', 'modern-realm-9nm8c.firebaseapp.com'),
  firestoreDatabaseId: getEnv('FIREBASE_FIRESTORE_DATABASE_ID', 'ai-studio-iptv-d3d15c62-7975-482f-a649-5dcbe2bedaf3'),
  storageBucket: getEnv('FIREBASE_STORAGE_BUCKET', 'modern-realm-9nm8c.firebasestorage.app'),
  messagingSenderId: getEnv('FIREBASE_MESSAGING_SENDER_ID', '456176021961'),
  measurementId: getEnv('FIREBASE_MEASUREMENT_ID', ''),
  oAuthClientId: getEnv('FIREBASE_OAUTH_CLIENT_ID', '456176021961-2gleh35u10blqc3agin83fed09a2fqev.apps.googleusercontent.com'),
  recaptchaSiteKey: getEnv('FIREBASE_RECAPTCHA_SITE_KEY', ''),
};
