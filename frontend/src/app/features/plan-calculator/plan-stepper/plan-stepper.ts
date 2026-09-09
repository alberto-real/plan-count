import { Component, input, output } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';

export type PlanStep = 'legend' | 'plan' | 'summary';

const STEPS: readonly PlanStep[] = ['legend', 'plan', 'summary'];

@Component({
  selector: 'app-plan-stepper',
  imports: [TranslocoModule],
  templateUrl: './plan-stepper.html',
  host: { class: 'block w-full' },
})
export class PlanStepper {
  readonly currentStep = input.required<PlanStep>();

  readonly stepSelected = output<PlanStep>();

  readonly steps = STEPS;

  stepState(step: PlanStep): 'done' | 'active' | 'pending' {
    const currentIndex = STEPS.indexOf(this.currentStep());
    const stepIndex = STEPS.indexOf(step);
    if (stepIndex < currentIndex) {
      return 'done';
    }
    if (stepIndex === currentIndex) {
      return 'active';
    }
    return 'pending';
  }

  onStepClick(step: PlanStep): void {
    this.stepSelected.emit(step);
  }
}
