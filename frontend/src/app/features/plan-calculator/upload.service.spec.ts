import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { LegendEntry, LegendProposalResponse, UploadResponse } from './models';
import { UploadService } from './upload.service';

describe('UploadService', () => {
  let service: UploadService;
  let httpMock: HttpTestingController;

  const sampleLegend: LegendEntry[] = [
    { key: 'WALL', label: 'Wall', colorHex: '#ff0000', linetype: 'CONTINUOUS', lineweight: 25 },
    { key: 'DOOR', label: 'Door', colorHex: '#00ff00', linetype: 'DASHED', lineweight: 13 },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), UploadService],
    });
    service = TestBed.inject(UploadService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('posts the file and the JSON-stringified legend as FormData to /api/upload', () => {
    const file = new File(['dummy content'], 'sample.dxf', { type: 'application/dxf' });
    const mockResponse: UploadResponse = {
      matched: [{ key: 'WALL', label: 'Wall', colorHex: '#ff0000', linearMeters: 10 }],
      undetermined: [],
      detectedUnit: 'm',
    };

    let result: UploadResponse | undefined;
    service.upload(file, sampleLegend).subscribe((res) => (result = res));

    const req = httpMock.expectOne('/api/upload');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBeInstanceOf(FormData);
    expect((req.request.body as FormData).get('file')).toBe(file);
    expect((req.request.body as FormData).get('legend')).toBe(JSON.stringify(sampleLegend));

    req.flush(mockResponse);
    expect(result).toEqual(mockResponse);
  });

  it('propagates an HTTP error to the caller from /api/upload', () => {
    const file = new File(['bad'], 'broken.dxf');
    let error: unknown;

    service.upload(file, sampleLegend).subscribe({
      error: (err) => (error = err),
    });

    const req = httpMock.expectOne('/api/upload');
    req.flush({ detail: 'Uploaded file is not a valid DXF' }, { status: 400, statusText: 'Bad Request' });

    expect(error).toBeTruthy();
  });

  it('posts the file as FormData under the "file" field to /api/legend and returns the parsed legend', () => {
    const file = new File(['dummy content'], 'legend.dxf', { type: 'application/dxf' });
    const mockResponse: LegendProposalResponse = { entries: sampleLegend };

    let result: LegendProposalResponse | undefined;
    service.readLegend(file).subscribe((res) => (result = res));

    const req = httpMock.expectOne('/api/legend');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBeInstanceOf(FormData);
    expect((req.request.body as FormData).get('file')).toBe(file);

    req.flush(mockResponse);
    expect(result).toEqual(mockResponse);
  });

  it('propagates an HTTP error to the caller from /api/legend', () => {
    const file = new File(['bad'], 'broken.dxf');
    let error: unknown;

    service.readLegend(file).subscribe({
      error: (err) => (error = err),
    });

    const req = httpMock.expectOne('/api/legend');
    req.flush({ detail: 'Legend file is not a valid DXF' }, { status: 400, statusText: 'Bad Request' });

    expect(error).toBeTruthy();
  });
});
