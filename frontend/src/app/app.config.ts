import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { detectLanguage } from './core/i18n/language-detection';
import { TranslocoHttpLoader } from './core/i18n/transloco-http.loader';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(),
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
      translocoService.setActiveLang(detectLanguage(navigator.language));
    }),
    provideAppInitializer(() => inject(AuthService).initialize()),
  ]
};
