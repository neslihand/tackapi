// The site's two languages. The choice is kept in this browser; changing it reloads the collection from the backend
// in that language (lib/vakifApi.ts asks with lang=) and draws the site again, so every component simply reads the
// current language while it renders: t('Türkçe', 'English'). Text the backend only has in Turkish (routes, quiz,
// announcements) stays Turkish.
export type Lang = 'tr' | 'en';
const KEY = 'tackapi-lang';

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
/** 1st, 2nd, 3rd, 4th… */
export const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
/** '16. yüzyıl' / '16th century'. */
export const centuryName = (n: number) => t(`${n}. yüzyıl`, `${ordinal(n)} century`);

/** persist: false switches for this page only (the panel's preview), leaving the visitor's saved choice as it was. */
export function setLang(lang: Lang, persist = true) {
  if (lang === current) return;
  current = lang;
  if (persist) try { localStorage.setItem(KEY, lang); } catch { /* storage closed: this visit only */ }
  document.documentElement.lang = lang;
  listeners.forEach(listener => listener(lang));
}
export function onLangChange(listener: (lang: Lang) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
