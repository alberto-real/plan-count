import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { PlanCalculator } from './plan-calculator';
import { LegendEntry, LegendProposalResponse, UploadResponse } from './models';
import { UploadService } from './upload.service';
import { provideTranslocoTesting } from '../../core/i18n/testing/provide-transloco-testing';

class FakeUploadService {
  responses: UploadResponse[] = [];
  errorPayload: unknown = null;

  readLegend(): Observable<LegendProposalResponse> {
    return of({ entries: [] });
  }

  upload(): Observable<UploadResponse> {
    if (this.errorPayload) {
      return throwError(() => this.errorPayload);
    }
    return of(this.responses.shift() as UploadResponse);
  }
}

const sampleLegend: LegendEntry[] = [
  { key: 'WALL', label: 'Wall', colorHex: '#ff0000', linetype: 'CONTINUOUS', lineweight: 25, isDashed: false },
];

describe('PlanCalculator', () => {
  let fixture: ComponentFixture<PlanCalculator>;
  let component: PlanCalculator;
  let fakeService: FakeUploadService;

  beforeEach(() => {
    fakeService = new FakeUploadService();
    TestBed.configureTestingModule({
      imports: [PlanCalculator],
      providers: [provideTranslocoTesting(), { provide: UploadService, useValue: fakeService }],
    });
    fixture = TestBed.createComponent(PlanCalculator);
    component = fixture.componentInstance;
  });

  function selectFile(): void {
    const planId = component.planFiles()[0].id;
    component.onPlanFileSelected(planId, new File(['x'], 'sample.dxf'));
  }

  function confirmLegend(legend: LegendEntry[] = sampleLegend): void {
    component.onLegendConfirmed(legend);
  }

  it('does not render the upload UI until the legend has been confirmed', () => {
    fixture.detectChanges();

    const buttonTexts = [...fixture.nativeElement.querySelectorAll('button')].map((b: HTMLButtonElement) =>
      b.textContent?.trim(),
    );
    expect(buttonTexts).not.toContain('Analyze');
    expect(fixture.nativeElement.querySelector('app-legend-step')).not.toBeNull();
  });

  it('renders the upload UI once onLegendConfirmed has been called', () => {
    confirmLegend();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-file-picker-button')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-legend-step')).toBeNull();
  });

  it('does not allow submitting while no file has been chosen', () => {
    confirmLegend();

    expect(component.canSubmit()).toBe(false);
  });

  it('computes areaM2 as linearMeters times height in meters for matched rows, in meters by default', () => {
    fakeService.responses = [
      { matched: [{ key: 'WALL', label: 'Wall', colorHex: '#ff0000', linearMeters: 10, isDashed: false }], undetermined: [], detectedUnit: 'm' },
    ];
    confirmLegend();
    component.heightCm.set(300);
    selectFile();
    component.onSubmit();

    expect(component.reports()[0].rows).toEqual([
      {
        key: 'WALL',
        label: 'Wall',
        colorHex: '#ff0000',
        isDashed: false,
        linearMeters: 10,
        areaM2: 30,
      },
    ]);
  });

  it('adopts the response detectedUnit and scales linearMeters/areaM2 accordingly', () => {
    fakeService.responses = [
      { matched: [{ key: 'WALL', label: 'Wall', colorHex: '#ff0000', linearMeters: 10000, isDashed: false }], undetermined: [], detectedUnit: 'mm' },
    ];
    confirmLegend();
    component.heightCm.set(300);
    selectFile();
    component.onSubmit();

    expect(component.unit()).toBe('mm');
    expect(component.reports()[0].rows[0]).toEqual({
      key: 'WALL',
      label: 'Wall',
      colorHex: '#ff0000',
      isDashed: false,
      linearMeters: 10, // 10000mm -> 10m
      areaM2: 30,
    });
  });

  it('recomputes rows when the unit is changed after the result arrives', () => {
    fakeService.responses = [
      { matched: [{ key: 'WALL', label: 'Wall', colorHex: '#ff0000', linearMeters: 10, isDashed: false }], undetermined: [], detectedUnit: 'm' },
    ];
    confirmLegend();
    component.heightCm.set(100);
    selectFile();
    component.onSubmit();

    component.unit.set('cm');

    expect(component.reports()[0].rows[0].linearMeters).toBeCloseTo(0.1); // 10cm -> 0.1m
    expect(component.reports()[0].rows[0].areaM2).toBeCloseTo(0.1);
  });

  it('carries isDashed through from the matched entry into the plan row', () => {
    fakeService.responses = [
      { matched: [{ key: 'WALL', label: 'Wall', colorHex: '#ff0000', linearMeters: 10, isDashed: true }], undetermined: [], detectedUnit: 'm' },
    ];
    confirmLegend();
    selectFile();
    component.onSubmit();

    expect(component.reports()[0].rows[0].isDashed).toBe(true);
  });

  it('exposes result().undetermined through the report, scaled by unit', () => {
    const undetermined = [{ colorHex: '#00ff00', linetype: 'DASHED', lineweight: 13, linearMeters: 4, isDashed: true }];
    fakeService.responses = [{ matched: [], undetermined, detectedUnit: 'm' }];
    confirmLegend();
    selectFile();
    component.onSubmit();

    expect(component.reports()[0].undetermined).toEqual(undetermined);
  });

  it('returns an empty reports array when there is no result yet', () => {
    confirmLegend();

    expect(component.reports()).toEqual([]);
  });

  it('lets the user promote unmatched geometry into the materials table with a custom label', () => {
    const group = { colorHex: '#00ff00', linetype: 'DASHED', lineweight: 13, linearMeters: 4, isDashed: true };
    fakeService.responses = [{ matched: [], undetermined: [group], detectedUnit: 'm' }];
    confirmLegend();
    selectFile();
    component.onSubmit();

    const planId = component.reports()[0].id;
    component.promoteGroup(planId, group, 'Insulation');

    const report = component.reports()[0];
    expect(report.undetermined).toEqual([]);
    expect(report.rows.some((r) => r.label === 'Insulation')).toBe(true);
  });

  it('lets the user remove a previously promoted row', () => {
    const group = { colorHex: '#00ff00', linetype: 'DASHED', lineweight: 13, linearMeters: 4, isDashed: true };
    fakeService.responses = [{ matched: [], undetermined: [group], detectedUnit: 'm' }];
    confirmLegend();
    selectFile();
    component.onSubmit();

    const planId = component.reports()[0].id;
    component.promoteGroup(planId, group, 'Insulation');
    component.unpromoteGroup(planId, group);

    const report = component.reports()[0];
    expect(report.rows).toEqual([]);
    expect(report.undetermined).toEqual([group]);
  });

  it('aggregates rows across multiple plans into totalRows by material key', () => {
    fakeService.responses = [
      { matched: [{ key: 'WALL', label: 'Wall', colorHex: '#ff0000', linearMeters: 10, isDashed: false }], undetermined: [], detectedUnit: 'm' },
      { matched: [{ key: 'WALL', label: 'Wall', colorHex: '#ff0000', linearMeters: 5, isDashed: false }], undetermined: [], detectedUnit: 'm' },
    ];
    confirmLegend();
    selectFile();
    component.addPlanFile();
    component.onPlanFileSelected(component.planFiles()[1].id, new File(['y'], 'second.dxf'));
    component.onSubmit();

    expect(component.totalRows()).toEqual([
      { key: 'WALL', label: 'Wall', colorHex: '#ff0000', isDashed: false, linearMeters: 15, areaM2: 15 * 2.5 },
    ]);
  });

  it('returns a solid background style for a non-dashed style group', () => {
    const style = component.swatchStyle({ colorHex: '#ff0000', isDashed: false });

    expect(style['background-color']).toBe('#ff0000');
  });

  it('returns a striped background-image style for a dashed style group', () => {
    const style = component.swatchStyle({ colorHex: '#00ff00', isDashed: true });

    expect(style['background-image']).toContain('#00ff00');
  });

  it('surfaces the backend detail message on error', () => {
    fakeService.errorPayload = { error: { detail: 'Uploaded file is not a valid DXF' } };
    confirmLegend();
    selectFile();
    component.onSubmit();

    const plan = component.planFiles()[0];
    expect(plan.status).toBe('error');
    expect(plan.errorMessage).toBe('Uploaded file is not a valid DXF');
  });

  it('falls back to a translated generic error message when the backend gives no detail', () => {
    fakeService.errorPayload = { status: 0 };
    confirmLegend();
    selectFile();
    component.onSubmit();

    const plan = component.planFiles()[0];
    expect(plan.status).toBe('error');
    expect(plan.errorMessage).toBe('An unexpected error occurred.');
  });

  it('renders the error banner text in the DOM', () => {
    fakeService.errorPayload = { error: { detail: 'Some error' } };
    confirmLegend();
    selectFile();
    component.onSubmit();
    fixture.detectChanges();

    const banner: HTMLElement | null = fixture.nativeElement.querySelector('div.text-danger');
    expect(banner?.textContent).toContain('Some error');
  });

  it('dismisses the error and resets status and message', () => {
    fakeService.errorPayload = { error: { detail: 'Some error' } };
    confirmLegend();
    selectFile();
    component.onSubmit();
    fixture.detectChanges();

    const dismissButton: HTMLButtonElement | null = fixture.nativeElement.querySelector('button[data-testid="dismiss-error"]');
    expect(dismissButton).not.toBeNull();
    dismissButton!.click();
    fixture.detectChanges();

    const plan = component.planFiles()[0];
    expect(plan.status).toBe('idle');
    expect(plan.errorMessage).toBeNull();
  });

  it('lets the user navigate back to a previous step via the stepper', () => {
    confirmLegend();

    component.onStepSelected('legend');

    expect(component.viewStep()).toBe('legend');
  });

  it('adds and removes additional floor entries', () => {
    expect(component.planFiles().length).toBe(1);

    component.addPlanFile();
    expect(component.planFiles().length).toBe(2);

    component.removePlanFile(component.planFiles()[1].id);
    expect(component.planFiles().length).toBe(1);
  });

  it('does not remove the last remaining floor entry', () => {
    component.removePlanFile(component.planFiles()[0].id);

    expect(component.planFiles().length).toBe(1);
  });
});
