export const AVAILABLE_LANGS: readonly string[] = ['ca', 'es', 'en'];

const STORAGE_KEY = 'plancount.lang';

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

/** Reads the user's last manually selected language, if any was stored.
 * Returns null when nothing was stored yet or storage is unavailable
 * (e.g. private browsing, SSR). */
export function getStoredLanguage(availableLangs: readonly string[] = AVAILABLE_LANGS): string | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored && availableLangs.includes(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** Persists the user's language choice so it survives a full page reload —
 * notably the Keycloak login redirect, which otherwise re-runs browser
 * language detection and discards the user's selection. */
export function setStoredLanguage(lang: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Storage unavailable — the selection just won't survive a reload.
  }
}
