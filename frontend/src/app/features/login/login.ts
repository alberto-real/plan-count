import { Component, effect, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  imports: [TranslocoModule],
  templateUrl: './login.html',
})
export class Login {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  constructor() {
    effect(() => {
      if (this.authService.isAuthenticated()) {
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/app';
        this.router.navigateByUrl(returnUrl);
      }
    });
  }

  login(): void {
    this.authService.login();
  }
}
