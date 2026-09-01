import { Service, inject, signal } from '@angular/core';
import { AuthConfig, OAuthEvent, OAuthService } from 'angular-oauth2-oidc';
import { environment } from '../../../environments/environment';
import { UserProfile } from './models';

@Service()
export class AuthService {
  private readonly oauthService = inject(OAuthService);

  readonly isAuthenticated = signal(false);
  readonly userProfile = signal<UserProfile | null>(null);

  initialize(): Promise<void> {
    const authConfig: AuthConfig = {
      issuer: environment.auth.issuer,
      clientId: environment.auth.clientId,
      redirectUri: environment.auth.redirectUri,
      responseType: 'code',
      scope: 'openid profile email',
      showDebugInformation: !environment.production,
    };

    this.oauthService.configure(authConfig);
    this.oauthService.setupAutomaticSilentRefresh();
    this.oauthService.events.subscribe((event) => this.onOAuthEvent(event));

    return this.oauthService
      .loadDiscoveryDocumentAndTryLogin()
      .then(() => this.syncStateFromToken())
      .catch((error: unknown) => {
        console.error('Auth initialization failed', error);
        this.isAuthenticated.set(false);
        this.userProfile.set(null);
      });
  }

  login(): void {
    this.oauthService.initLoginFlow();
  }

  logout(): void {
    this.oauthService.logOut();
    this.isAuthenticated.set(false);
    this.userProfile.set(null);
  }

  private onOAuthEvent(event: OAuthEvent): void {
    if (event.type === 'token_received') {
      this.syncStateFromToken();
    }
    if (event.type === 'session_terminated' || event.type === 'session_error') {
      this.isAuthenticated.set(false);
      this.userProfile.set(null);
    }
  }

  private syncStateFromToken(): void {
    const hasValidToken = this.oauthService.hasValidIdToken();
    this.isAuthenticated.set(hasValidToken);
    if (!hasValidToken) {
      this.userProfile.set(null);
      return;
    }
    const claims = this.oauthService.getIdentityClaims() as { name?: string; email?: string } | null;
    this.userProfile.set(claims ? { name: claims.name ?? '', email: claims.email ?? '' } : null);
  }
}
