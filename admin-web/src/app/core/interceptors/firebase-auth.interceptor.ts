import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { Auth } from '@angular/fire/auth';
import { from, switchMap } from 'rxjs';

const protectedApiRoots = ['/api', '/detector-api', '/anpr-api'];

const isProtectedPath = (path: string) =>
  protectedApiRoots.some(root => path === root || path.startsWith(`${root}/`));

const isProtectedApi = (url: string) => {
  if (isProtectedPath(url.split(/[?#]/, 1)[0])) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('.trycloudflare.com') &&
      isProtectedPath(parsed.pathname);
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
