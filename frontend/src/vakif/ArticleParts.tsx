import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUpRight, BookA, Clock3, Newspaper } from 'lucide-react';
import { Link } from '../lib/navigation';
import { currentLang, locale, t } from '../lib/i18n';
import type { ArticleItem, ArticleKind, GlossaryTerm } from '../lib/articlesApi';
import { capitalize } from '../lib/articleText';
import './articles.css';

export const kindNames = (): Record<ArticleKind, string> => ({
  city_history: t('Şehir tarihi', 'City history'), heritage: t('Vakıf eserleri', 'Foundation works'), culture: t('Vakıf kültürü', 'Waqf culture'),
});
export const formatDay = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' }) : '';

/** "Makaleler | Terimler sözlüğü": the two halves of the reading room. */
export function ReadingTabs({ current }: { current: 'articles' | 'terms' }) {
  return <nav className="rr-tabs" aria-label={t('Okuma odası', 'Reading room')}>
    <Link to="/makaleler" aria-current={current === 'articles' ? 'page' : undefined}><Newspaper size={16} aria-hidden="true" />{t('Makaleler', 'Articles')}</Link>
    <Link to="/terimler" aria-current={current === 'terms' ? 'page' : undefined}><BookA size={16} aria-hidden="true" />{t('Terimler sözlüğü', 'Glossary')}</Link>
  </nav>;
}

/** A cover without a photograph: an arch drawn over the kind's colour, with the first letter of the title. */
export function CoverArt({ kind, title }: { kind: ArticleKind; title: string }) {
  return <span className={`rr-art ${kind}`} aria-hidden="true">
    <svg viewBox="0 0 120 150" preserveAspectRatio="xMidYMid slice"><path d="M14 150V64Q14 18 60 6Q106 18 106 64V150" /><path d="M30 150V68Q30 34 60 24Q90 34 90 68V150" /><path d="M60 24V150" /></svg>
    <b>{title.trim().charAt(0).toLocaleUpperCase(locale())}</b>
  </span>;
}

export function ArticleCard({ a, wide = false }: { a: ArticleItem; wide?: boolean }) {
  return <article className={`rr-card ${wide ? 'wide' : ''}`}>
    <Link to={`/makale/${a.slug}`} className="rr-card-link" aria-label={`${a.title} — ${a.kind_label}`}>
      <span className="rr-card-cover">{a.cover ? <img src={wide ? a.cover.src : a.cover.thumb} alt="" loading={wide ? 'eager' : 'lazy'} /> : <CoverArt kind={a.kind} title={a.title} />}</span>
      <span className="rr-card-text">
        <span className="rr-kicker">{a.kind_label}{a.city ? <> · {a.city.name}</> : null}{a.featured && wide ? <> · <em>{t('Öne çıkan', 'Featured')}</em></> : null}</span>
        <strong lang={a.lang}>{a.title}</strong>
        <span className="rr-summary" lang={a.lang}>{a.summary}</span>
        <span className="rr-meta">{currentLang() === 'en' && a.lang === 'tr' && <span className="rr-lang">In Turkish</span>}<Clock3 size={13} aria-hidden="true" />{t(`${a.reading_minutes} dk okuma`, `${a.reading_minutes} min read`)}<span aria-hidden="true">·</span>{a.byline}
          {wide && <ArrowUpRight size={15} className="rr-go" aria-hidden="true" />}</span>
      </span>
    </Link>
  </article>;
}

/**
 * A glossary term inside an article: a dotted underline that opens a small card with the definition (click, tap or
 * keyboard; hover on a mouse). Escape or a click elsewhere closes it.
 */
export function TermMark({ text, term, child }: { text: string; term?: GlossaryTerm; child: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  if (!term) return <>{text}</>;
  const definition = (child && term.definition_child) || term.definition;
  return <span className="rr-term" ref={box} onPointerEnter={e => { if (e.pointerType === 'mouse') setOpen(true); }} onPointerLeave={e => { if (e.pointerType === 'mouse') setOpen(false); }}>
    <button type="button" className="rr-term-word" aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)}>{text}</button>
    <span id={id} role="note" className={`rr-term-card ${open ? 'open' : ''}`} hidden={!open}>
      <b>{capitalize(term.term)}{term.term_en ? <i lang="en"> · {term.term_en}</i> : null}</b>
      <span lang={term.definition_lang}>{definition}</span>
      <Link to={`/terimler?terim=${term.slug}`}>{t('Sözlükte aç', 'Open in the glossary')} <ArrowUpRight size={13} aria-hidden="true" /></Link>
    </span>
  </span>;
}
