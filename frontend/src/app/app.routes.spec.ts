import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { provideTranslocoTesting } from './core/i18n/testing/provide-transloco-testing';

class FakeAuthService {
  isAuthenticated = signal(false);
  userProfile = signal(null);

  login(): void {}
  logout(): void {}
}

describe('app.routes', () => {
  let fakeAuthService: FakeAuthService;
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    fakeAuthService = new FakeAuthService();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideTranslocoTesting(),
        { provide: AuthService, useValue: fakeAuthService },
      ],
    });
    harness = await RouterTestingHarness.create();
  });

  it('redirects to /login with a returnUrl when navigating to /app while unauthenticated', async () => {
    await harness.navigateByUrl('/app');

    const router = TestBed.inject(Router);
    expect(router.url).toBe('/login?returnUrl=%2Fapp');
  });

  it('renders PlanCalculator when navigating to /app while authenticated, starting on the legend step', async () => {
    fakeAuthService.isAuthenticated.set(true);

    await harness.navigateByUrl('/app');

    const legendFileInput = harness.routeNativeElement?.querySelector('#legend-file');
    expect(legendFileInput).not.toBeNull();
    const dxfFileInput = harness.routeNativeElement?.querySelector('#dxf-file');
    expect(dxfFileInput).toBeNull();
  });

  it('renders Landing when navigating to /', async () => {
    await harness.navigateByUrl('/');

    const cta = harness.routeNativeElement?.querySelector('[data-testid="landing-cta"]');
    expect(cta).not.toBeNull();
  });
});
