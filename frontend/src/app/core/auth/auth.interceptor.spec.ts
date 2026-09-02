import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

class FakeAuthService {
  getAccessToken(): string | null {
    return null;
  }
}

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let fakeAuthService: FakeAuthService;

  beforeEach(() => {
    fakeAuthService = new FakeAuthService();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: fakeAuthService },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('adds the Authorization header for /api/ requests when a token is present', () => {
    fakeAuthService.getAccessToken = () => 'the-token';

    http.get('/api/upload').subscribe();

    const req = httpMock.expectOne('/api/upload');
    expect(req.request.headers.get('Authorization')).toBe('Bearer the-token');
    req.flush({});
  });

  it('omits the Authorization header for /api/ requests when no token is present', () => {
    http.get('/api/upload').subscribe();

    const req = httpMock.expectOne('/api/upload');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('leaves non-/api/ requests untouched even when a token is present', () => {
    fakeAuthService.getAccessToken = () => 'the-token';

    http.get('/assets/i18n/en.json').subscribe();

    const req = httpMock.expectOne('/assets/i18n/en.json');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });
});
