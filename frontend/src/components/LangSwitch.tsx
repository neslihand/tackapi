import { currentLang, setLang, type Lang } from '../lib/i18n';

// Türkçe / English: a small two-part switch. Each part is a button that names its language in that language, and the
// current one is pressed.
const LANGS: [Lang, string, string][] = [['tr', 'TR', 'Türkçe'], ['en', 'EN', 'English']];

export function LangSwitch({ className = '' }: { className?: string }) {
  const lang = currentLang();
  return <div className={`lang-switch ${className}`} role="group" aria-label={lang === 'en' ? 'Language' : 'Dil'}>
    {LANGS.map(([value, short, name]) => <button key={value} type="button" lang={value} aria-pressed={lang === value} aria-label={name} title={name} onClick={() => setLang(value)}>{short}</button>)}
  </div>;
}
