import { AVAILABLE_LANGS, detectLanguage } from './language-detection';

describe('detectLanguage', () => {
  it('matches a supported language from a region-qualified tag', () => {
    expect(detectLanguage('ca-ES')).toBe('ca');
    expect(detectLanguage('es-ES')).toBe('es');
    expect(detectLanguage('en-US')).toBe('en');
  });

  it('is case-insensitive', () => {
    expect(detectLanguage('CA-es')).toBe('ca');
  });

  it('falls back to "en" when the language is not supported', () => {
    expect(detectLanguage('fr-FR')).toBe('en');
  });

  it('falls back to "en" when no language is provided', () => {
    expect(detectLanguage(undefined)).toBe('en');
  });

  it('respects a custom fallback language', () => {
    expect(detectLanguage('fr-FR', AVAILABLE_LANGS, 'ca')).toBe('ca');
  });

  it('respects a custom list of available languages', () => {
    expect(detectLanguage('es-ES', ['ca', 'en'])).toBe('en');
  });
});
