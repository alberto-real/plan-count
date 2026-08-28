import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { PlanCalculator } from './plan-calculator';
import { UploadResponse } from './models';
import { UploadService } from './upload.service';

class FakeUploadService {
  response: UploadResponse | null = null;
  errorPayload: unknown = null;

  upload(): Observable<UploadResponse> {
    if (this.errorPayload) {
      return throwError(() => this.errorPayload);
    }
    return of(this.response as UploadResponse);
  }
}

describe('PlanCalculator', () => {
  let fixture: ComponentFixture<PlanCalculator>;
  let component: PlanCalculator;
  let fakeService: FakeUploadService;

  beforeEach(() => {
    fakeService = new FakeUploadService();
    TestBed.configureTestingModule({
      imports: [PlanCalculator],
      providers: [{ provide: UploadService, useValue: fakeService }],
    });
    fixture = TestBed.createComponent(PlanCalculator);
    component = fixture.componentInstance;
  });

  function selectFile(): void {
    component.selectedFile.set(new File(['x'], 'sample.dxf'));
  }

  it('computes area as linearMeters times height in meters', () => {
    fakeService.response = {
      layers: [{ rawLayerName: 'WALLS', materialName: 'Brick', linearMeters: 10 }],
      undeterminedLayers: [],
    };
    component.heightCm.set(300);
    selectFile();
    component.onSubmit();

    expect(component.rows()).toEqual([
      {
        rawLayerName: 'WALLS',
        linearMeters: 10,
        effectiveMaterial: 'Brick',
        isUndetermined: false,
        areaM2: 30,
      },
    ]);
  });

  it('falls back to the raw name and flags undetermined layers', () => {
    fakeService.response = {
      layers: [{ rawLayerName: 'LAY_X', materialName: 'LAY_X', linearMeters: 5 }],
      undeterminedLayers: ['LAY_X'],
    };
    selectFile();
    component.onSubmit();

    const [row] = component.rows();
    expect(row.isUndetermined).toBe(true);
    expect(row.effectiveMaterial).toBe('LAY_X');
  });

  it('applies a manual material override without clearing the undetermined flag', () => {
    fakeService.response = {
      layers: [{ rawLayerName: 'LAY_X', materialName: 'LAY_X', linearMeters: 5 }],
      undeterminedLayers: ['LAY_X'],
    };
    selectFile();
    component.onSubmit();

    component.onAssignMaterial('LAY_X', 'Formigó');

    const [row] = component.rows();
    expect(row.effectiveMaterial).toBe('Formigó');
    expect(row.isUndetermined).toBe(true);
  });

  it('resets overrides when a new upload succeeds', () => {
    fakeService.response = {
      layers: [{ rawLayerName: 'LAY_X', materialName: 'LAY_X', linearMeters: 5 }],
      undeterminedLayers: ['LAY_X'],
    };
    selectFile();
    component.onSubmit();
    component.onAssignMaterial('LAY_X', 'Formigó');

    fakeService.response = {
      layers: [{ rawLayerName: 'LAY_Y', materialName: 'LAY_Y', linearMeters: 8 }],
      undeterminedLayers: ['LAY_Y'],
    };
    selectFile();
    component.onSubmit();

    expect(component.rows()[0].effectiveMaterial).toBe('LAY_Y');
  });

  it('deduplicates and sorts knownMaterials from effective materials in use', () => {
    fakeService.response = {
      layers: [
        { rawLayerName: 'A', materialName: 'Zinc', linearMeters: 1 },
        { rawLayerName: 'B', materialName: 'Brick', linearMeters: 1 },
        { rawLayerName: 'C', materialName: 'Zinc', linearMeters: 1 },
      ],
      undeterminedLayers: [],
    };
    selectFile();
    component.onSubmit();

    expect(component.knownMaterials()).toEqual(['Brick', 'Zinc']);
  });

  it('surfaces the backend detail message on error', () => {
    fakeService.errorPayload = { error: { detail: 'Uploaded file is not a valid DXF' } };
    selectFile();
    component.onSubmit();

    expect(component.status()).toBe('error');
    expect(component.errorMessage()).toBe('Uploaded file is not a valid DXF');
  });

  it('falls back to a generic error message when the backend gives no detail', () => {
    fakeService.errorPayload = { status: 0 };
    selectFile();
    component.onSubmit();

    expect(component.status()).toBe('error');
    expect(component.errorMessage()).toBe("S'ha produït un error inesperat.");
  });

  it('renders the error banner text in the DOM', () => {
    fakeService.errorPayload = { error: { detail: 'Some error' } };
    selectFile();
    component.onSubmit();
    fixture.detectChanges();

    const banner: HTMLElement | null = fixture.nativeElement.querySelector('div.text-red-700');
    expect(banner?.textContent).toContain('Some error');
  });

  it('selects the correct option in the undetermined-row select even when it is not alphabetically first', () => {
    fakeService.response = {
      layers: [
        { rawLayerName: 'LAY_A', materialName: 'Aluminium', linearMeters: 3 },
        { rawLayerName: 'LAY_X', materialName: 'LAY_X', linearMeters: 5 },
      ],
      undeterminedLayers: ['LAY_X'],
    };
    selectFile();
    component.onSubmit();
    component.onAssignMaterial('LAY_X', 'Zinc');
    fixture.detectChanges();

    const row = component.rows().find((r) => r.rawLayerName === 'LAY_X')!;
    expect(row.effectiveMaterial).toBe('Zinc');
    expect(component.knownMaterials()).toEqual(['Aluminium', 'Zinc']);

    const select: HTMLSelectElement | null = fixture.nativeElement.querySelector('select');
    expect(select).not.toBeNull();
    expect(select!.value).toBe('Zinc');
  });

  it('dismisses the error and resets status and message', () => {
    fakeService.errorPayload = { error: { detail: 'Some error' } };
    selectFile();
    component.onSubmit();
    fixture.detectChanges();

    const dismissButton: HTMLButtonElement | null = fixture.nativeElement.querySelector('button[aria-label="Tanca"]');
    expect(dismissButton).not.toBeNull();
    dismissButton!.click();
    fixture.detectChanges();

    expect(component.status()).toBe('idle');
    expect(component.errorMessage()).toBeNull();
  });
});
