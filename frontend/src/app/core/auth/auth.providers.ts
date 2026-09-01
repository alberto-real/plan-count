import { EnvironmentProviders, inject, provideAppInitializer, Provider } from '@angular/core';
import { provideOAuthClient } from 'angular-oauth2-oidc';
import { AuthService } from './auth.service';

export function provideAuth(): (Provider | EnvironmentProviders)[] {
  return [provideOAuthClient(), provideAppInitializer(() => inject(AuthService).initialize())];
}
