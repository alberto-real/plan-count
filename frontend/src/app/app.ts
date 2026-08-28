import { Component } from '@angular/core';
import { PlanCalculator } from './features/plan-calculator/plan-calculator';

@Component({
  imports: [PlanCalculator],
  selector: 'app-root',
  templateUrl: './app.html',
})
export class App {}
