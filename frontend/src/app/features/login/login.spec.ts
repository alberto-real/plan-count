import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AuthService } from '../../core/auth/auth.service';
import { provideTranslocoTesting } from '../../core/i18n/testing/provide-transloco-testing';
import { Login } from './login';

@Component({ selector: 'app-stub', template: 'stub' })
class StubComponent {}

class FakeAuthService {
  isAuthenticated = signal(false);
  loginCalled = false;

  login(): void {
    this.loginCalled = true;
  }
}

describe('Login', () => {
  let fakeAuthService: FakeAuthService;
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    fakeAuthService = new FakeAuthService();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'login', component: Login },
          { path: 'app', component: StubComponent },
        ]),
        provideTranslocoTesting(),
        { provide: AuthService, useValue: fakeAuthService },
      ],
    });
    harness = await RouterTestingHarness.create();
  });

  it('shows a "Log in with Keycloak" button when not authenticated', async () => {
    await harness.navigateByUrl('/login');
    const button: HTMLButtonElement | null | undefined = harness.routeNativeElement?.querySelector('button');
    expect(button?.textContent?.trim()).toBe('Log in with Keycloak');
  });

  it('calls authService.login() when the button is clicked', async () => {
    await harness.navigateByUrl('/login');
    const button: HTMLButtonElement = harness.routeNativeElement!.querySelector('button')!;
    button.click();
    expect(fakeAuthService.loginCalled).toBe(true);
  });

  it('redirects to /app when the user becomes authenticated', async () => {
    await harness.navigateByUrl('/login');

    fakeAuthService.isAuthenticated.set(true);
    await harness.fixture.whenStable();

    const router = TestBed.inject(Router);
    expect(router.url).toBe('/app');
  });
});
