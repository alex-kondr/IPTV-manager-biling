import { FIREBASE_APPLET_CONFIG } from '../app/firebase-config';

export interface VerifiedGoogleTokenPayload {
  email?: string;
  name?: string;
  picture?: string;
  uid?: string;
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

  // 2. Verify Google ID token via Google OAuth2 tokeninfo endpoint
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
 * Verifies a Google OAuth access token obtained via GIS TokenClient popup against Google userinfo.
 */
export async function verifyGoogleAccessTokenSafe(
  accessToken: string
): Promise<VerifiedGoogleTokenPayload | null> {
  if (!accessToken || typeof accessToken !== 'string') {
    return null;
  }
  try {
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
      if (email && emailVerified) {
        return { email, name, picture, uid };
      }
    }
  } catch {
    // Ignore network timeout
  }
  return null;
}
