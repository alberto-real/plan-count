import { ActivatedRouteSnapshot, provideRouter, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';

class FakeAuthService {
  isAuthenticated = signal(false);
}

describe('authGuard', () => {
  let fakeAuthService: FakeAuthService;

  beforeEach(() => {
    fakeAuthService = new FakeAuthService();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: fakeAuthService }],
    });
  });

  it('allows navigation when authenticated', () => {
    fakeAuthService.isAuthenticated.set(true);

    const result = TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, { url: '/app' } as RouterStateSnapshot),
    );

    expect(result).toBe(true);
  });

  it('redirects to /login with a returnUrl when not authenticated', () => {
    const router = TestBed.inject(Router);

    const result = TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, { url: '/app' } as RouterStateSnapshot),
    );

    expect(router.serializeUrl(result as UrlTree)).toBe('/login?returnUrl=%2Fapp');
  });
});
