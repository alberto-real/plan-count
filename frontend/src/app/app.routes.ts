import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { Landing } from './features/landing/landing';
import { Login } from './features/login/login';
import { PlanCalculator } from './features/plan-calculator/plan-calculator';

export const routes: Routes = [
  { path: '', component: Landing },
  { path: 'login', component: Login },
  { path: 'app', component: PlanCalculator, canActivate: [authGuard] },
];
