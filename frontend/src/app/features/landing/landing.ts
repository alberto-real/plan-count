import { Component, inject } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-landing',
  imports: [RouterLink, TranslocoModule, NgOptimizedImage],
  templateUrl: './landing.html',
})
export class Landing {
  private readonly authService = inject(AuthService);

  readonly isAuthenticated = this.authService.isAuthenticated;

  login(): void {
    this.authService.login();
  }
}
