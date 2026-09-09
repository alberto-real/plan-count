import { Service, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthConfig, OAuthEvent, OAuthService } from 'angular-oauth2-oidc';
import { environment } from '../../../environments/environment';
import { UserProfile } from './models';

@Service()
export class AuthService {
  private readonly oauthService = inject(OAuthService);
  private readonly router = inject(Router);

  private readonly _isAuthenticated = signal(false);
  private readonly _userProfile = signal<UserProfile | null>(null);

  readonly isAuthenticated = this._isAuthenticated.asReadonly();
  readonly userProfile = this._userProfile.asReadonly();

  initialize(): Promise<void> {
    if (environment.authDisabled) {
      // Local dev has no Keycloak realm configured — skip the OIDC flow
      // entirely and treat every session as already authenticated.
      this._isAuthenticated.set(true);
      this._userProfile.set({ name: 'Dev', email: 'dev@localhost' });
      return Promise.resolve();
    }

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
        this._isAuthenticated.set(false);
        this._userProfile.set(null);
      });
  }

  login(): void {
    this.oauthService.initLoginFlow();
  }

  logout(): void {
    this.oauthService.logOut();
    this._isAuthenticated.set(false);
    this._userProfile.set(null);
    this.router.navigateByUrl('/');
  }

  getAccessToken(): string | null {
    return this.oauthService.getAccessToken() || null;
  }

  private onOAuthEvent(event: OAuthEvent): void {
    if (event.type === 'token_received') {
      this.syncStateFromToken();
    }
    if (event.type === 'session_terminated' || event.type === 'session_error') {
      this._isAuthenticated.set(false);
      this._userProfile.set(null);
    }
  }

  private syncStateFromToken(): void {
    const hasValidToken = this.oauthService.hasValidIdToken();
    this._isAuthenticated.set(hasValidToken);
    if (!hasValidToken) {
      this._userProfile.set(null);
      return;
    }
    const claims = this.oauthService.getIdentityClaims() as { name?: string; email?: string } | null;
    this._userProfile.set(claims ? { name: claims.name ?? '', email: claims.email ?? '' } : null);
  }
}
