import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { Auth } from '@angular/fire/auth';
import { from, switchMap } from 'rxjs';

const isProtectedApi = (url: string) => {
  if (['/api/', '/detector-api/', '/anpr-api/'].some(prefix => url.startsWith(prefix))) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('.trycloudflare.com') &&
      ['/api/', '/detector-api/', '/anpr-api/'].some(prefix => parsed.pathname.startsWith(prefix));
  } catch {
    return false;
  }
};

export const firebaseAuthInterceptor: HttpInterceptorFn = (request, next) => {
  if (!isProtectedApi(request.url)) return next(request);

  const currentUser = inject(Auth).currentUser;
  if (!currentUser) return next(request);

  return from(currentUser.getIdToken()).pipe(
    switchMap(token => next(request.clone({
      setHeaders: { Authorization: `Bearer ${token}` }
    })))
  );
};
