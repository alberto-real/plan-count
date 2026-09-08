import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { LegendStep } from './legend-step';
import { LegendEntry, LegendProposalResponse } from '../models';
import { UploadService } from '../upload.service';
import { provideTranslocoTesting } from '../../../core/i18n/testing/provide-transloco-testing';

class FakeUploadService {
  response: LegendProposalResponse | null = null;
  errorPayload: unknown = null;

  readLegend(): Observable<LegendProposalResponse> {
    if (this.errorPayload) {
      return throwError(() => this.errorPayload);
    }
    return of(this.response as LegendProposalResponse);
  }
}

function makeFileInputEvent(file: File | null): Event {
  const input = document.createElement('input');
  input.type = 'file';
  if (file) {
    Object.defineProperty(input, 'files', { value: [file] });
  }
  return { target: input } as unknown as Event;
}

describe('LegendStep', () => {
  let fixture: ComponentFixture<LegendStep>;
  let component: LegendStep;
  let fakeService: FakeUploadService;

  const sampleEntries: LegendEntry[] = [
    { key: 'WALL', label: 'Wall', colorHex: '#ff0000', linetype: 'CONTINUOUS', lineweight: 25, isDashed: false },
    { key: 'DOOR', label: 'Door', colorHex: '#00ff00', linetype: 'DASHED', lineweight: 13, isDashed: true },
  ];

  beforeEach(() => {
    fakeService = new FakeUploadService();
    TestBed.configureTestingModule({
      imports: [LegendStep],
      providers: [provideTranslocoTesting(), { provide: UploadService, useValue: fakeService }],
    });
    fixture = TestBed.createComponent(LegendStep);
    component = fixture.componentInstance;
  });

  it('reads the legend on file selection and moves to ready with entries populated', () => {
    fakeService.response = { entries: sampleEntries };
    const file = new File(['x'], 'legend.dxf');

    component.onFileSelected(makeFileInputEvent(file));

    expect(component.status()).toBe('ready');
    expect(component.entries()).toEqual(sampleEntries);
  });

  it('does nothing when no file is selected', () => {
    component.onFileSelected(makeFileInputEvent(null));

    expect(component.status()).toBe('idle');
    expect(component.entries()).toEqual([]);
  });

  it('surfaces the backend detail message when reading fails', () => {
    fakeService.errorPayload = { error: { detail: 'Legend file is not a valid DXF' } };
    const file = new File(['bad'], 'legend.dxf');

    component.onFileSelected(makeFileInputEvent(file));

    expect(component.status()).toBe('error');
    expect(component.errorMessage()).toBe('Legend file is not a valid DXF');
  });

  it('falls back to a translated generic error message when the backend gives no detail', () => {
    fakeService.errorPayload = { status: 0 };
    const file = new File(['bad'], 'legend.dxf');

    component.onFileSelected(makeFileInputEvent(file));

    expect(component.status()).toBe('error');
    expect(component.errorMessage()).toBe('An unexpected error occurred while reading the legend.');
  });

  it('updates only the targeted entry key on onKeyChange', () => {
    fakeService.response = { entries: sampleEntries };
    component.onFileSelected(makeFileInputEvent(new File(['x'], 'legend.dxf')));

    const input = document.createElement('input');
    input.value = 'WALL2';
    component.onKeyChange(0, { target: input } as unknown as Event);

    expect(component.entries()[0].key).toBe('WALL2');
    expect(component.entries()[1]).toEqual(sampleEntries[1]);
  });

  it('updates only the targeted entry label on onLabelChange', () => {
    fakeService.response = { entries: sampleEntries };
    component.onFileSelected(makeFileInputEvent(new File(['x'], 'legend.dxf')));

    const input = document.createElement('input');
    input.value = 'Exterior wall';
    component.onLabelChange(1, { target: input } as unknown as Event);

    expect(component.entries()[1].label).toBe('Exterior wall');
    expect(component.entries()[0]).toEqual(sampleEntries[0]);
  });

  it('emits the current entries via legendConfirmed on confirm', () => {
    fakeService.response = { entries: sampleEntries };
    component.onFileSelected(makeFileInputEvent(new File(['x'], 'legend.dxf')));

    let emitted: LegendEntry[] | null = null;
    component.legendConfirmed.subscribe((entries) => (emitted = entries));

    component.onConfirm();

    expect(emitted).toEqual(sampleEntries);
  });

  it('dismisses the error and resets status and message', () => {
    fakeService.errorPayload = { error: { detail: 'Some error' } };
    component.onFileSelected(makeFileInputEvent(new File(['bad'], 'legend.dxf')));

    component.dismissError();

    expect(component.status()).toBe('idle');
    expect(component.errorMessage()).toBeNull();
  });

  it('renders the error banner text in the DOM', () => {
    fakeService.errorPayload = { error: { detail: 'Legend parsing failed' } };
    component.onFileSelected(makeFileInputEvent(new File(['bad'], 'legend.dxf')));
    fixture.detectChanges();

    const banner: HTMLElement | null = fixture.nativeElement.querySelector('div.text-danger');
    expect(banner?.textContent).toContain('Legend parsing failed');
  });

  it('returns a solid background style for a non-dashed entry', () => {
    const style = component.swatchStyle(sampleEntries[0]);

    expect(style['background-color']).toBe('#ff0000');
    expect(style['background-image']).toBeUndefined();
  });

  it('returns a striped background-image style for a dashed entry', () => {
    const style = component.swatchStyle(sampleEntries[1]);

    expect(style['background-image']).toContain('#00ff00');
    expect(style['background-color']).toBeUndefined();
  });
});
