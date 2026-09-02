import { provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { ApplicationConfig } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';

import { routes } from './app.routes';
import { sessionInterceptor } from './core/session.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    // `withXhr()` no es herencia del pasado: desde Angular 22 el cliente HTTP
    // usa `fetch` por defecto, y fetch **no informa del progreso de subida**.
    // Sin esto, la barra que enseña `app-file-queue` al subir un archivo grande
    // se quedaría a cero hasta terminar de golpe.
    provideHttpClient(withXhr(), withInterceptors([sessionInterceptor])),
  ],
};
