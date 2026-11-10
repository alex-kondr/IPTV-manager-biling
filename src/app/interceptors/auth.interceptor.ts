import { HttpInterceptorFn } from '@angular/common/http';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (typeof localStorage !== 'undefined') {
    try {
      // Purge legacy unauthenticated localStorage keys that previously auto-logged visitors as admin
      localStorage.removeItem('iptv_auth_token');
      localStorage.removeItem('iptv_auth_user');

      const token =
        localStorage.getItem('homehub_gauth3_token') ||
        (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('homehub_gauth3_token') : null);
      const impersonateUid =
        typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('homehub_impersonate_uid') : null;

      const setHeaders: Record<string, string> = {};
      if (token && token.startsWith('gauth3_') && !req.headers.has('Authorization')) {
        setHeaders['Authorization'] = `Bearer ${token}`;
      }
      if (impersonateUid && !req.headers.has('x-impersonate-user-id')) {
        setHeaders['x-impersonate-user-id'] = impersonateUid;
      }

      if (Object.keys(setHeaders).length > 0) {
        return next(req.clone({ setHeaders }));
      }
    } catch {
      // Ignore storage errors
    }
  }
  return next(req);
};

