export const AVAILABLE_LANGS: readonly string[] = ['ca', 'es', 'en'];

export function detectLanguage(
  navigatorLanguage: string | undefined,
  availableLangs: readonly string[] = AVAILABLE_LANGS,
  fallbackLang = 'en',
): string {
  if (!navigatorLanguage) {
    return fallbackLang;
  }
  const prefix = navigatorLanguage.slice(0, 2).toLowerCase();
  return availableLangs.includes(prefix) ? prefix : fallbackLang;
}
