import { HttpInterceptorFn } from '@angular/common/http';

// Unique per-tab client instance ID so the server can tag emitted signals
// and the originating browser tab can safely ignore its own mutation echo.
export const CLIENT_INSTANCE_ID = `cli_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

// Keep impersonation strictly in-memory so page reloads / preview restarts
// never trap an administrator inside an impersonated user session.
let activeImpersonateUid: string | null = null;

export function setActiveImpersonateUid(uid: string | null): void {
  activeImpersonateUid = uid && uid.trim() ? uid.trim() : null;
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.removeItem('homehub_impersonate_uid');
    } catch {
      // Ignore storage errors
    }
  }
}

export function getActiveImpersonateUid(): string | null {
  return activeImpersonateUid;
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const setHeaders: Record<string, string> = {};
  if (!req.headers.has('x-client-instance-id')) {
    setHeaders['x-client-instance-id'] = CLIENT_INSTANCE_ID;
  }

  if (typeof localStorage !== 'undefined') {
    try {
      // Purge legacy unauthenticated localStorage keys and any stale persisted impersonation key
      localStorage.removeItem('iptv_auth_token');
      localStorage.removeItem('iptv_auth_user');
      if (typeof sessionStorage !== 'undefined' && !activeImpersonateUid) {
        sessionStorage.removeItem('homehub_impersonate_uid');
      }

      const token =
        localStorage.getItem('homehub_gauth3_token') ||
        (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('homehub_gauth3_token') : null);

      if (token && token.startsWith('gauth3_') && !req.headers.has('Authorization')) {
        setHeaders['Authorization'] = `Bearer ${token}`;
      }
      if (activeImpersonateUid && !req.headers.has('x-impersonate-user-id')) {
        setHeaders['x-impersonate-user-id'] = activeImpersonateUid;
      }
    } catch {
      // Ignore storage errors
    }
  }

  if (Object.keys(setHeaders).length > 0) {
    return next(req.clone({ setHeaders }));
  }
  return next(req);
};


