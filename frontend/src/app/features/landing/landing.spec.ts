import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { provideTranslocoTesting } from '../../core/i18n/testing/provide-transloco-testing';
import { Landing } from './landing';

class FakeAuthService {
  isAuthenticated = signal(false);
  loginCalled = false;

  login(): void {
    this.loginCalled = true;
  }
}

describe('Landing', () => {
  let fixture: ComponentFixture<Landing>;
  let fakeAuthService: FakeAuthService;

  beforeEach(() => {
    fakeAuthService = new FakeAuthService();
    TestBed.configureTestingModule({
      imports: [Landing],
      providers: [
        provideRouter([]),
        provideTranslocoTesting(),
        { provide: AuthService, useValue: fakeAuthService },
      ],
    });
    fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
  });

  it('shows a call-to-action button that triggers login when unauthenticated', () => {
    const button: HTMLButtonElement | null = fixture.nativeElement.querySelector('button[data-testid="landing-cta"]');
    expect(button).not.toBeNull();
    button!.click();
    expect(fakeAuthService.loginCalled).toBe(true);
  });

  it('shows a link to /app instead of a button when authenticated', () => {
    fakeAuthService.isAuthenticated.set(true);
    fixture.detectChanges();

    const link: HTMLAnchorElement | null = fixture.nativeElement.querySelector('a[data-testid="landing-cta"]');
    const button: HTMLButtonElement | null = fixture.nativeElement.querySelector('button[data-testid="landing-cta"]');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toBe('/app');
    expect(button).toBeNull();
  });
});
