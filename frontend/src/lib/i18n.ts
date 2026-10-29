// The site's two languages. The choice is kept in this browser; changing it reloads the collection from the backend
// in that language (lib/vakifApi.ts asks with lang=) and draws the site again, so every component simply reads the
// current language while it renders: t('Türkçe', 'English'). Text the backend only has in Turkish (routes, quiz,
// announcements) stays Turkish.
export type Lang = 'tr' | 'en';
const KEY = 'esik-lang';

function stored(): Lang {
  try { const value = localStorage.getItem(KEY); if (value === 'tr' || value === 'en') return value; } catch { /* storage closed */ }
  return 'tr';
}

let current: Lang = stored();
if (typeof document !== 'undefined') document.documentElement.lang = current;
const listeners = new Set<(lang: Lang) => void>();

export const currentLang = () => current;
/** The text in the current language. */
export const t = (tr: string, en: string) => current === 'en' ? en : tr;
/** The locale for upper-casing, numbers and dates. */
export const locale = () => current === 'en' ? 'en-GB' : 'tr-TR';

export function setLang(lang: Lang) {
  if (lang === current) return;
  current = lang;
  try { localStorage.setItem(KEY, lang); } catch { /* storage closed: this visit only */ }
  document.documentElement.lang = lang;
  listeners.forEach(listener => listener(lang));
}
export function onLangChange(listener: (lang: Lang) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
