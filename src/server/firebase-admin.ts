import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import bundledFirebaseConfig from '../../firebase-applet-config.json';

export interface ServerFirebaseConfig {
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

const isValidFirebaseApiKey = (val: string): boolean => {
  return val.startsWith('AIza') && val.length >= 30;
};

let cachedDiskFirebaseConfig: Partial<ServerFirebaseConfig> | null = null;

function readDiskFirebaseConfig(): Partial<ServerFirebaseConfig> {
  if (cachedDiskFirebaseConfig) return cachedDiskFirebaseConfig;
  const base: Partial<ServerFirebaseConfig> = {
    ...(bundledFirebaseConfig as Partial<ServerFirebaseConfig>),
  };
  try {
    const cfgPath = resolve(process.cwd(), 'firebase-applet-config.json');
    if (existsSync(cfgPath)) {
      const disk = JSON.parse(readFileSync(cfgPath, 'utf8')) as Partial<ServerFirebaseConfig>;
      cachedDiskFirebaseConfig = { ...base, ...disk };
      return cachedDiskFirebaseConfig;
    }
  } catch {
    // Ignore file read errors and use bundled config
  }
  cachedDiskFirebaseConfig = base;
  return cachedDiskFirebaseConfig;
}

export function getServerFirebaseConfig(): ServerFirebaseConfig {
  const disk = readDiskFirebaseConfig();
  const envApiKey = cleanStr(process.env['FIREBASE_API_KEY']);
  const diskApiKey = cleanStr(disk.apiKey);

  return {
    projectId: cleanStr(process.env['FIREBASE_PROJECT_ID']) || cleanStr(disk.projectId) || '',
    appId: cleanStr(process.env['FIREBASE_APP_ID']) || cleanStr(disk.appId) || '',
    apiKey: isValidFirebaseApiKey(envApiKey) ? envApiKey : diskApiKey,
    authDomain: cleanStr(process.env['FIREBASE_AUTH_DOMAIN']) || cleanStr(disk.authDomain) || '',
    firestoreDatabaseId:
      cleanStr(process.env['FIREBASE_FIRESTORE_DATABASE_ID']) ||
      cleanStr(disk.firestoreDatabaseId) ||
      '',
    storageBucket:
      cleanStr(process.env['FIREBASE_STORAGE_BUCKET']) || cleanStr(disk.storageBucket) || '',
    messagingSenderId:
      cleanStr(process.env['FIREBASE_MESSAGING_SENDER_ID']) ||
      cleanStr(disk.messagingSenderId) ||
      '',
    measurementId:
      cleanStr(process.env['FIREBASE_MEASUREMENT_ID']) || cleanStr(disk.measurementId) || '',
    oAuthClientId:
      cleanStr(process.env['FIREBASE_OAUTH_CLIENT_ID']) ||
      cleanStr(process.env['GOOGLE_CLIENT_ID']) ||
      cleanStr(disk.oAuthClientId) ||
      '',
    recaptchaSiteKey:
      cleanStr(process.env['FIREBASE_RECAPTCHA_SITE_KEY']) || cleanStr(disk.recaptchaSiteKey) || '',
  };
}

export interface VerifiedGoogleTokenPayload {
  email?: string;
  name?: string;
  picture?: string;
  uid?: string;
}

function getAllowedGoogleClientIds(includeProjectId = false): string[] {
  const cfg = getServerFirebaseConfig();
  const candidates = [
    process.env['GOOGLE_CLIENT_ID'],
    process.env['FIREBASE_OAUTH_CLIENT_ID'],
    cfg.oAuthClientId,
    ...(includeProjectId ? [process.env['FIREBASE_PROJECT_ID'], cfg.projectId] : []),
  ];
  return Array.from(
    new Set(
      candidates
        .map((c) => cleanStr(c))
        .filter((c) => c.length > 0)
    )
  );
}

function isAudienceAllowed(aud: unknown, azp: unknown, allowedIds: string[]): boolean {
  if (allowedIds.length === 0) return false;
  const audStr = typeof aud === 'string' ? aud.trim() : '';
  const azpStr = typeof azp === 'string' ? azp.trim() : '';
  return allowedIds.includes(audStr) || allowedIds.includes(azpStr);
}

/**
 * Cryptographically / server-side verifies a Firebase ID token or Google OAuth ID token
 * (NEVER trusts unverified local JWT payload decoding).
 */
export async function verifyFirebaseTokenSafe(
  idToken: string
): Promise<VerifiedGoogleTokenPayload | null> {
  if (!idToken || idToken.startsWith('gauth3_') || idToken.startsWith('tok_')) {
    return null;
  }

  // 1. Verify Firebase Auth ID token via Firebase Identity Toolkit accounts:lookup
  const cfg = getServerFirebaseConfig();
  const apiKey = cfg.apiKey;
  if (apiKey) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const refererOrigin = cfg.authDomain
        ? `https://${cfg.authDomain}/`
        : 'https://modern-realm-9nm8c.firebaseapp.com/';
      const resp = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Referer: refererOrigin,
          },
          body: JSON.stringify({ idToken }),
          signal: controller.signal,
        }
      );
      clearTimeout(timer);
      if (resp.ok) {
        const data = (await resp.json()) as {
          users?: Array<{
            localId?: string;
            email?: string;
            emailVerified?: boolean;
            displayName?: string;
            photoUrl?: string;
          }>;
        };
        const u = data.users?.[0];
        if (u?.email && u.emailVerified !== false) {
          return {
            email: u.email,
            name: u.displayName,
            picture: u.photoUrl,
            uid: u.localId,
          };
        }
      }
    } catch {
      // Fall through to Google tokeninfo verification
    }
  }

  // 2. Verify Google/Firebase ID token via Google OAuth2 tokeninfo endpoint + aud/azp validation
  const allowedClientIds = getAllowedGoogleClientIds(true);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
      { signal: controller.signal }
    );
    clearTimeout(timer);
    if (resp.ok) {
      const data = (await resp.json()) as Record<string, unknown>;
      if (!isAudienceAllowed(data['aud'], data['azp'], allowedClientIds)) {
        return null;
      }
      const email = typeof data['email'] === 'string' ? data['email'] : undefined;
      const emailVerified = data['email_verified'] === 'true' || data['email_verified'] === true;
      const name = typeof data['name'] === 'string' ? data['name'] : undefined;
      const picture = typeof data['picture'] === 'string' ? data['picture'] : undefined;
      const uid = typeof data['sub'] === 'string' ? data['sub'] : undefined;
      if (email && emailVerified) {
        return { email, name, picture, uid };
      }
    }
  } catch {
    // Ignore network timeout
  }

  return null;
}

/**
 * Verifies a Google OAuth access token via tokeninfo (aud/azp + expiry) and userinfo.
 */
export async function verifyGoogleAccessTokenSafe(
  accessToken: string
): Promise<VerifiedGoogleTokenPayload | null> {
  if (!accessToken || typeof accessToken !== 'string') {
    return null;
  }
  const allowedClientIds = getAllowedGoogleClientIds();
  try {
    const tokenInfoController = new AbortController();
    const tokenInfoTimer = setTimeout(() => tokenInfoController.abort(), 5000);
    const tokenInfoResp = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
      { signal: tokenInfoController.signal }
    );
    clearTimeout(tokenInfoTimer);
    if (!tokenInfoResp.ok) {
      return null;
    }
    const tokenInfo = (await tokenInfoResp.json()) as Record<string, unknown>;
    const expiresIn = Number(tokenInfo['expires_in'] ?? 0);
    if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
      return null;
    }
    if (!isAudienceAllowed(tokenInfo['aud'], tokenInfo['azp'], allowedClientIds)) {
      return null;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (resp.ok) {
      const data = (await resp.json()) as Record<string, unknown>;
      const email = typeof data['email'] === 'string' ? data['email'] : undefined;
      const emailVerified = data['email_verified'] === true || data['email_verified'] === 'true';
      const name = typeof data['name'] === 'string' ? data['name'] : undefined;
      const picture = typeof data['picture'] === 'string' ? data['picture'] : undefined;
      const uid = typeof data['sub'] === 'string' ? data['sub'] : undefined;

      const tokenInfoSub = typeof tokenInfo['sub'] === 'string' ? tokenInfo['sub'] : undefined;
      const tokenInfoEmail = typeof tokenInfo['email'] === 'string' ? tokenInfo['email'].toLowerCase() : undefined;
      if (tokenInfoSub && uid && tokenInfoSub !== uid) {
        return null;
      }
      if (tokenInfoEmail && email && tokenInfoEmail !== email.toLowerCase()) {
        return null;
      }

      if (email && emailVerified) {
        return { email, name, picture, uid };
      }
    }
  } catch {
    // Ignore network timeout
  }
  return null;
}
