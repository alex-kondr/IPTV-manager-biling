import { HttpInterceptorFn } from '@angular/common/http';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Only intercept /api/ requests
  if (!req.url.startsWith('/api') && !req.url.includes('/api/')) {
    return next(req);
  }

  let token: string | null = null;
  let userId: string | null = null;
  let userEmail: string | null = null;

  try {
    if (typeof localStorage !== 'undefined') {
      token = localStorage.getItem('iptv_auth_token');
      const rawUser = localStorage.getItem('iptv_auth_user');
      if (rawUser) {
        const parsed = JSON.parse(rawUser);
        userId = parsed?.id || null;
        userEmail = parsed?.email || null;
      }
    }
  } catch {
    // Ignore localStorage parse errors
  }

  let headers = req.headers;

  if (token && !headers.has('Authorization')) {
    headers = headers.set('Authorization', `Bearer ${token}`);
  }
  if (userId && !headers.has('x-auth-user-id')) {
    headers = headers.set('x-auth-user-id', userId);
  }
  if (userEmail && !headers.has('x-auth-user-email')) {
    headers = headers.set('x-auth-user-email', userEmail);
  }

  const clonedReq = req.clone({ headers });
  return next(clonedReq);
};
