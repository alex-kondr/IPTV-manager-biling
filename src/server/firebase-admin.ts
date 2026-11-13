import { FIREBASE_APPLET_CONFIG } from '../app/firebase-config';

export interface VerifiedGoogleTokenPayload {
  email?: string;
  name?: string;
  picture?: string;
  uid?: string;
}

function getAllowedGoogleClientIds(): string[] {
  const candidates = [
    process.env['GOOGLE_CLIENT_ID'],
    process.env['FIREBASE_OAUTH_CLIENT_ID'],
    FIREBASE_APPLET_CONFIG?.oAuthClientId,
  ];
  return Array.from(
    new Set(
      candidates
        .map((c) => (typeof c === 'string' ? c.trim() : ''))
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
  const apiKey = FIREBASE_APPLET_CONFIG?.apiKey;
  if (apiKey) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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

  // 2. Verify Google ID token via Google OAuth2 tokeninfo endpoint + aud/azp validation
  const allowedClientIds = getAllowedGoogleClientIds();
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
