import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { PlanCalculator } from './plan-calculator';
import { LegendEntry, LegendProposalResponse, UploadResponse } from './models';
import { UploadService } from './upload.service';
import { provideTranslocoTesting } from '../../core/i18n/testing/provide-transloco-testing';

class FakeUploadService {
  response: UploadResponse | null = null;
  errorPayload: unknown = null;
  legendResponse: LegendProposalResponse | null = null;

  readLegend(): Observable<LegendProposalResponse> {
    return of(this.legendResponse as LegendProposalResponse);
  }

  upload(): Observable<UploadResponse> {
    if (this.errorPayload) {
      return throwError(() => this.errorPayload);
    }
    return of(this.response as UploadResponse);
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
    component.selectedFile.set(new File(['x'], 'sample.dxf'));
  }

  function confirmLegend(legend: LegendEntry[] = sampleLegend): void {
    component.onLegendConfirmed(legend);
  }

  it('does not render the upload UI until the legend has been confirmed', () => {
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('#dxf-file')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-legend-step')).not.toBeNull();
  });

  it('renders the upload UI once onLegendConfirmed has been called', () => {
    confirmLegend();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('#dxf-file')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-legend-step')).toBeNull();
  });

  it('does not submit while no legend is confirmed', () => {
    selectFile();
    component.onSubmit();

    expect(component.status()).toBe('idle');
  });

  it('computes areaM2 as linearMeters times height in meters for matched rows, in meters by default', () => {
    fakeService.response = {
      matched: [{ key: 'WALL', label: 'Wall', colorHex: '#ff0000', linearMeters: 10, isDashed: false }],
      undetermined: [],
      detectedUnit: 'm',
    };
    confirmLegend();
    component.heightCm.set(300);
    selectFile();
    component.onSubmit();

    expect(component.matchedRows()).toEqual([
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
    fakeService.response = {
      matched: [{ key: 'WALL', label: 'Wall', colorHex: '#ff0000', linearMeters: 10000, isDashed: false }],
      undetermined: [],
      detectedUnit: 'mm',
    };
    confirmLegend();
    component.heightCm.set(300);
    selectFile();
    component.onSubmit();

    expect(component.unit()).toBe('mm');
    expect(component.matchedRows()).toEqual([
      {
        key: 'WALL',
        label: 'Wall',
        colorHex: '#ff0000',
        isDashed: false,
        linearMeters: 10, // 10000mm -> 10m
        areaM2: 30,
      },
    ]);
  });

  it('recomputes matchedRows when the unit is changed after the result arrives', () => {
    fakeService.response = {
      matched: [{ key: 'WALL', label: 'Wall', colorHex: '#ff0000', linearMeters: 10, isDashed: false }],
      undetermined: [],
      detectedUnit: 'm',
    };
    confirmLegend();
    component.heightCm.set(100);
    selectFile();
    component.onSubmit();

    component.unit.set('cm');

    expect(component.matchedRows()[0].linearMeters).toBeCloseTo(0.1); // 10cm -> 0.1m
    expect(component.matchedRows()[0].areaM2).toBeCloseTo(0.1);
  });

  it('carries isDashed through from the matched entry into the plan row', () => {
    fakeService.response = {
      matched: [{ key: 'WALL', label: 'Wall', colorHex: '#ff0000', linearMeters: 10, isDashed: true }],
      undetermined: [],
      detectedUnit: 'm',
    };
    confirmLegend();
    selectFile();
    component.onSubmit();

    expect(component.matchedRows()[0].isDashed).toBe(true);
  });

  it('passes result().undetermined through to undeterminedGroups, scaled by unit', () => {
    const undetermined = [
      { colorHex: '#00ff00', linetype: 'DASHED', lineweight: 13, linearMeters: 4, isDashed: true },
    ];
    fakeService.response = {
      matched: [],
      undetermined,
      detectedUnit: 'm',
    };
    confirmLegend();
    selectFile();
    component.onSubmit();

    expect(component.undeterminedGroups()).toEqual(undetermined);
  });

  it('returns an empty undeterminedGroups array when there is no result yet', () => {
    confirmLegend();

    expect(component.undeterminedGroups()).toEqual([]);
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

    expect(component.status()).toBe('error');
    expect(component.errorMessage()).toBe('Uploaded file is not a valid DXF');
  });

  it('falls back to a translated generic error message when the backend gives no detail', () => {
    fakeService.errorPayload = { status: 0 };
    confirmLegend();
    selectFile();
    component.onSubmit();

    expect(component.status()).toBe('error');
    expect(component.errorMessage()).toBe('An unexpected error occurred.');
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

    expect(component.status()).toBe('idle');
    expect(component.errorMessage()).toBeNull();
  });
});
