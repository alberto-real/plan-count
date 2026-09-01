import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { provideTranslocoTesting } from './provide-transloco-testing';

describe('provideTranslocoTesting', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideTranslocoTesting()],
    });
  });

  it('resolves keys for the default language without any HTTP call', () => {
    const translocoService = TestBed.inject(TranslocoService);
    expect(translocoService.translate('navbar.login')).toBe('Log in');
  });

  it('resolves keys for a non-default language once activated', async () => {
    const translocoService = TestBed.inject(TranslocoService);
    await translocoService.load('ca').toPromise();
    translocoService.setActiveLang('ca');
    expect(translocoService.translate('navbar.login')).toBe('Inicia sessió');
  });
});
