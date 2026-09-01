import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { vi } from 'vitest';
import { AuthConfig, OAuthEvent, OAuthService } from 'angular-oauth2-oidc';
import { AuthService } from './auth.service';

class FakeOAuthService {
  events = new Subject<OAuthEvent>();
  configureCalledWith: AuthConfig | null = null;
  initLoginFlowCalled = false;
  logOutCalled = false;
  validIdToken = false;
  identityClaims: { name?: string; email?: string } | null = null;
  discoveryResult: Promise<boolean> = Promise.resolve(true);

  configure(config: AuthConfig): void {
    this.configureCalledWith = config;
  }

  loadDiscoveryDocumentAndTryLogin(): Promise<boolean> {
    return this.discoveryResult;
  }

  hasValidIdToken(): boolean {
    return this.validIdToken;
  }

  getIdentityClaims(): unknown {
    return this.identityClaims;
  }

  initLoginFlow(): void {
    this.initLoginFlowCalled = true;
  }

  logOut(): void {
    this.logOutCalled = true;
  }

  setupAutomaticSilentRefresh(): void {
    // Placeholder for setupAutomaticSilentRefresh
  }
}

describe('AuthService', () => {
  let service: AuthService;
  let fakeOAuthService: FakeOAuthService;

  beforeEach(() => {
    fakeOAuthService = new FakeOAuthService();
    TestBed.configureTestingModule({
      providers: [AuthService, provideRouter([]), { provide: OAuthService, useValue: fakeOAuthService }],
    });
    service = TestBed.inject(AuthService);
  });

  it('configures OAuthService with the environment auth settings on initialize()', async () => {
    await service.initialize();
    expect(fakeOAuthService.configureCalledWith).not.toBeNull();
    expect(fakeOAuthService.configureCalledWith?.responseType).toBe('code');
  });

  it('sets isAuthenticated and userProfile from claims when a valid token is present', async () => {
    fakeOAuthService.validIdToken = true;
    fakeOAuthService.identityClaims = { name: 'Ada Lovelace', email: 'ada@example.com' };

    await service.initialize();

    expect(service.isAuthenticated()).toBe(true);
    expect(service.userProfile()).toEqual({ name: 'Ada Lovelace', email: 'ada@example.com' });
  });

  it('leaves isAuthenticated false and userProfile null when there is no valid token', async () => {
    fakeOAuthService.validIdToken = false;

    await service.initialize();

    expect(service.isAuthenticated()).toBe(false);
    expect(service.userProfile()).toBeNull();
  });

  it('login() delegates to OAuthService.initLoginFlow()', () => {
    service.login();
    expect(fakeOAuthService.initLoginFlowCalled).toBe(true);
  });

  it('logout() delegates to OAuthService.logOut() and resets state', async () => {
    fakeOAuthService.validIdToken = true;
    fakeOAuthService.identityClaims = { name: 'Ada Lovelace', email: 'ada@example.com' };
    await service.initialize();

    service.logout();

    expect(fakeOAuthService.logOutCalled).toBe(true);
    expect(service.isAuthenticated()).toBe(false);
    expect(service.userProfile()).toBeNull();
  });

  it('logout() navigates away from the current route', async () => {
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');
    fakeOAuthService.validIdToken = true;
    await service.initialize();

    service.logout();

    expect(navigateSpy).toHaveBeenCalledWith('/');
  });

  it('re-syncs state when OAuthService emits a token_received event', async () => {
    await service.initialize();
    expect(service.isAuthenticated()).toBe(false);

    fakeOAuthService.validIdToken = true;
    fakeOAuthService.identityClaims = { name: 'Ada Lovelace', email: 'ada@example.com' };
    fakeOAuthService.events.next({ type: 'token_received' } as OAuthEvent);

    expect(service.isAuthenticated()).toBe(true);
    expect(service.userProfile()).toEqual({ name: 'Ada Lovelace', email: 'ada@example.com' });
  });

  it('clears state when OAuthService emits a session_terminated event', async () => {
    fakeOAuthService.validIdToken = true;
    fakeOAuthService.identityClaims = { name: 'Ada Lovelace', email: 'ada@example.com' };
    await service.initialize();
    expect(service.isAuthenticated()).toBe(true);

    fakeOAuthService.events.next({ type: 'session_terminated' } as OAuthEvent);

    expect(service.isAuthenticated()).toBe(false);
    expect(service.userProfile()).toBeNull();
  });
});
