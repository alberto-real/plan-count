import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners, isDevMode } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { provideAuth } from './core/auth/auth.providers';
import { detectLanguage } from './core/i18n/language-detection';
import { TranslocoHttpLoader } from './core/i18n/transloco-http.loader';
import { environment } from '../environments/environment';
import { provideServiceWorker } from '@angular/service-worker';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideRouter(routes),
    provideTransloco({
      config: {
        availableLangs: ['ca', 'es', 'en'],
        defaultLang: 'en',
        reRenderOnLangChange: true,
        prodMode: environment.production,
      },
      loader: TranslocoHttpLoader,
    }),
    provideAppInitializer(() => {
      const translocoService = inject(TranslocoService);
      const lang = detectLanguage(navigator.language);
      translocoService.setActiveLang(lang);
      return firstValueFrom(translocoService.load(lang));
    }),
    ...provideAuth(), provideServiceWorker('ngsw-worker.js', {
            enabled: !isDevMode(),
            registrationStrategy: 'registerWhenStable:30000'
          }),
  ]
};
