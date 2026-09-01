import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TranslocoHttpLoader } from './transloco-http.loader';

describe('TranslocoHttpLoader', () => {
  let loader: TranslocoHttpLoader;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), TranslocoHttpLoader],
    });
    loader = TestBed.inject(TranslocoHttpLoader);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('fetches the translation file for the given language from /i18n/<lang>.json', () => {
    let result: unknown;
    loader.getTranslation('ca').subscribe((res) => (result = res));

    const req = httpMock.expectOne('/i18n/ca.json');
    expect(req.request.method).toBe('GET');
    req.flush({ navbar: { appName: 'PlanCount' } });

    expect(result).toEqual({ navbar: { appName: 'PlanCount' } });
  });
});
