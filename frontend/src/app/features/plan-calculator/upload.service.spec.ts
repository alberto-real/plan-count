import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { UploadResponse } from './models';
import { UploadService } from './upload.service';

describe('UploadService', () => {
  let service: UploadService;
  let httpMock: HttpTestingController;

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

  it('posts the file as FormData under the "file" field to /api/upload', () => {
    const file = new File(['dummy content'], 'sample.dxf', { type: 'application/dxf' });
    const mockResponse: UploadResponse = {
      layers: [{ rawLayerName: 'WALLS', materialName: 'Brick', linearMeters: 10 }],
      undeterminedLayers: [],
    };

    let result: UploadResponse | undefined;
    service.upload(file).subscribe((res) => (result = res));

    const req = httpMock.expectOne('/api/upload');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBeInstanceOf(FormData);
    expect((req.request.body as FormData).get('file')).toBe(file);

    req.flush(mockResponse);
    expect(result).toEqual(mockResponse);
  });

  it('propagates an HTTP error to the caller', () => {
    const file = new File(['bad'], 'broken.dxf');
    let error: unknown;

    service.upload(file).subscribe({
      error: (err) => (error = err),
    });

    const req = httpMock.expectOne('/api/upload');
    req.flush({ detail: 'Uploaded file is not a valid DXF' }, { status: 400, statusText: 'Bad Request' });

    expect(error).toBeTruthy();
  });
});
