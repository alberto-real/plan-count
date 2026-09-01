import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { AuthService } from './core/auth/auth.service';
import { UserProfile } from './core/auth/models';
import { provideTranslocoTesting } from './core/i18n/testing/provide-transloco-testing';

class FakeAuthService {
  isAuthenticated = signal(false);
  userProfile = signal<UserProfile | null>(null);

  login(): void {}
  logout(): void {}
}

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        provideTranslocoTesting(),
        { provide: AuthService, useValue: new FakeAuthService() },
      ],
    }).compileComponents();
  });

  it('creates the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the navbar and a router outlet', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const compiled: HTMLElement = fixture.nativeElement;
    expect(compiled.querySelector('app-navbar')).toBeTruthy();
    expect(compiled.querySelector('router-outlet')).toBeTruthy();
  });
});
