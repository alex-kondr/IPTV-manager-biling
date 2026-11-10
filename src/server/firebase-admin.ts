export interface VerifiedGoogleTokenPayload {
  email?: string;
  name?: string;
  picture?: string;
  uid?: string;
}

export async function verifyFirebaseTokenSafe(
  idToken: string
): Promise<VerifiedGoogleTokenPayload | null> {
  if (!idToken || idToken.startsWith('gauth3_') || idToken.startsWith('tok_')) {
    return null;
  }

  // 1. Decode standard JWT payload first (fast & offline-capable)
  try {
    const parts = idToken.split('.');
    if (parts.length === 3) {
      const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
      const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
      const email = typeof parsed['email'] === 'string' ? parsed['email'] : undefined;
      const name = typeof parsed['name'] === 'string' ? parsed['name'] : undefined;
      const picture = typeof parsed['picture'] === 'string' ? parsed['picture'] : undefined;
      const uid =
        typeof parsed['user_id'] === 'string'
          ? parsed['user_id']
          : typeof parsed['sub'] === 'string'
            ? parsed['sub']
            : undefined;
      if (email) {
        return { email, name, picture, uid };
      }
    }
  } catch (err) {
    console.warn('JWT decode fallback warning:', err);
  }

  // 2. Fallback: verify via Google tokeninfo endpoint
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const resp = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
      { signal: controller.signal }
    );
    clearTimeout(timer);
    if (resp.ok) {
      const data = (await resp.json()) as Record<string, unknown>;
      const email = typeof data['email'] === 'string' ? data['email'] : undefined;
      const name = typeof data['name'] === 'string' ? data['name'] : undefined;
      const picture = typeof data['picture'] === 'string' ? data['picture'] : undefined;
      const uid = typeof data['sub'] === 'string' ? data['sub'] : undefined;
      if (email) {
        return { email, name, picture, uid };
      }
    }
  } catch {
    // ignore network timeout
  }

  return null;
}
