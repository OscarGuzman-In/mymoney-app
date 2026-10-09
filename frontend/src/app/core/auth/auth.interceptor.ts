import {
  HttpContextToken,
  HttpErrorResponse,
  HttpInterceptorFn,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthSessionService } from './auth-session.service';
import { TokenStorageService } from './token-storage.service';

const RETRIED_AFTER_REFRESH = new HttpContextToken<boolean>(() => false);

function isAuthEndpoint(url: string): boolean {
  return (
    url.includes('/auth/login') ||
    url.includes('/auth/register') ||
    url.includes('/auth/refresh')
  );
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const tokens = inject(TokenStorageService);
  const session = inject(AuthSessionService);

  const accessToken = tokens.getAccessToken();
  const authReq =
    accessToken && !isAuthEndpoint(req.url) && !req.headers.has('Authorization')
      ? req.clone({ setHeaders: { Authorization: `Bearer ${accessToken}` } })
      : req;

  return next(authReq).pipe(
    catchError((error: unknown) => {
      const isUnauthorized =
        error instanceof HttpErrorResponse && error.status === 401;

      if (
        !isUnauthorized ||
        isAuthEndpoint(req.url) ||
        req.context.get(RETRIED_AFTER_REFRESH)
      ) {
        return throwError(() => error);
      }

      return session.refreshAccessToken().pipe(
        switchMap(() => {
          const refreshedToken = tokens.getAccessToken();
          const retryReq = authReq.clone({
            context: authReq.context.set(RETRIED_AFTER_REFRESH, true),
            setHeaders: refreshedToken
              ? { Authorization: `Bearer ${refreshedToken}` }
              : {},
          });
          return next(retryReq);
        }),
        catchError(() => {
          session.handleAuthFailure();
          return throwError(() => error);
        }),
      );
    }),
  );
};
