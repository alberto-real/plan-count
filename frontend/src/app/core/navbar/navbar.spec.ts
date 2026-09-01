import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { UserProfile } from '../auth/models';
import { AuthService } from '../auth/auth.service';
import { provideTranslocoTesting } from '../i18n/testing/provide-transloco-testing';
import { Navbar } from './navbar';

class FakeAuthService {
  isAuthenticated = signal(false);
  userProfile = signal<UserProfile | null>(null);
  loginCalled = false;
  logoutCalled = false;

  login(): void {
    this.loginCalled = true;
  }

  logout(): void {
    this.logoutCalled = true;
  }
}

describe('Navbar', () => {
  let fixture: ComponentFixture<Navbar>;
  let fakeAuthService: FakeAuthService;

  beforeEach(() => {
    fakeAuthService = new FakeAuthService();
    TestBed.configureTestingModule({
      imports: [Navbar],
      providers: [provideTranslocoTesting(), provideRouter([]), { provide: AuthService, useValue: fakeAuthService }],
    });
    fixture = TestBed.createComponent(Navbar);
    fixture.detectChanges();
  });

  it('shows a login button when not authenticated', () => {
    const button: HTMLButtonElement | null = fixture.nativeElement.querySelector('button[data-testid="navbar-login"]');
    expect(button?.textContent?.trim()).toBe('Log in');
  });

  it('calls authService.login() when the login button is clicked', () => {
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button[data-testid="navbar-login"]');
    button.click();
    expect(fakeAuthService.loginCalled).toBe(true);
  });

  it('shows the user name and a logout button when authenticated', () => {
    fakeAuthService.isAuthenticated.set(true);
    fakeAuthService.userProfile.set({ name: 'Ada Lovelace', email: 'ada@example.com' });
    fixture.detectChanges();

    const nameEl: HTMLElement | null = fixture.nativeElement.querySelector('[data-testid="navbar-username"]');
    const logoutButton: HTMLButtonElement | null = fixture.nativeElement.querySelector('button[data-testid="navbar-logout"]');
    expect(nameEl?.textContent).toContain('Ada Lovelace');
    expect(logoutButton?.textContent?.trim()).toBe('Log out');
  });

  it('calls authService.logout() when the logout button is clicked', () => {
    fakeAuthService.isAuthenticated.set(true);
    fakeAuthService.userProfile.set({ name: 'Ada Lovelace', email: 'ada@example.com' });
    fixture.detectChanges();

    const logoutButton: HTMLButtonElement = fixture.nativeElement.querySelector('button[data-testid="navbar-logout"]');
    logoutButton.click();
    expect(fakeAuthService.logoutCalled).toBe(true);
  });

  it('switches translated text when the language selector changes', () => {
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select[data-testid="navbar-lang"]');
    select.value = 'ca';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button[data-testid="navbar-login"]');
    expect(button.textContent?.trim()).toBe('Inicia sessió');
  });
});
