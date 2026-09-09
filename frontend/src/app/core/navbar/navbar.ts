import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../auth/auth.service';
import { setStoredLanguage } from '../i18n/language-detection';

@Component({
  selector: 'app-navbar',
  imports: [RouterLink, TranslocoModule],
  templateUrl: './navbar.html',
})
export class Navbar {
  private readonly authService = inject(AuthService);
  private readonly translocoService = inject(TranslocoService);

  readonly isAuthenticated = this.authService.isAuthenticated;
  readonly userProfile = this.authService.userProfile;
  readonly availableLangs = ['ca', 'es', 'en'] as const;
  readonly activeLang = toSignal(this.translocoService.langChanges$, {
    initialValue: this.translocoService.getActiveLang(),
  });

  login(): void {
    this.authService.login();
  }

  logout(): void {
    this.authService.logout();
  }

  onLangChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.translocoService.setActiveLang(value);
    setStoredLanguage(value);
  }
}
