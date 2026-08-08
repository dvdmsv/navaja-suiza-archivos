import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { SessionService } from './session.service';

/** Añade la cabecera de sesión a todas las llamadas a la API. */
export const sessionInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/')) {
    return next(req);
  }
  const session = inject(SessionService);
  return next(req.clone({ setHeaders: { 'X-Session-Id': session.id } }));
};
