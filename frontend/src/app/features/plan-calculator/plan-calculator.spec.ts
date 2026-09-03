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
  { key: 'WALL', label: 'Wall', colorHex: '#ff0000', linetype: 'CONTINUOUS', lineweight: 25 },
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

  it('computes areaM2 as linearMeters times height in meters for matched rows', () => {
    fakeService.response = {
      matched: [{ key: 'WALL', label: 'Wall', colorHex: '#ff0000', linearMeters: 10 }],
      undetermined: [],
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
        linearMeters: 10,
        areaM2: 30,
      },
    ]);
  });

  it('passes result().undetermined through to undeterminedGroups', () => {
    const undetermined = [{ colorHex: '#00ff00', linetype: 'DASHED', lineweight: 13, linearMeters: 4 }];
    fakeService.response = {
      matched: [],
      undetermined,
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

    const banner: HTMLElement | null = fixture.nativeElement.querySelector('div.text-red-700');
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
