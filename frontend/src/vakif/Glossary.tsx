import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, BookA, ChevronDown, Lightbulb, Plus, Search, X } from 'lucide-react';
import { Link } from '../lib/navigation';
import { currentLang, t } from '../lib/i18n';
import { articlesApi, type GlossaryTerm, type TermDetail } from '../lib/articlesApi';
import { TURKISH_ALPHABET, capitalize, fold, letterGroups } from '../lib/articleText';
import { vakifApiEnabled } from '../lib/vakifApi';
import { useAccount } from '../lib/account';
import { useContent } from '../lib/contentStore';
import { track } from '../lib/analytics';
import { Modal, Scene } from '../components/UI';
import { ReadingTabs } from './ArticleParts';

const categoryNames = (): Record<string, string> => ({
  architecture: t('Mimari', 'Architecture'), decoration: t('Süsleme', 'Decoration'), waqf: t('Vakıf', 'Waqf'),
  title: t('Unvan ve görev', 'Titles and offices'), daily_life: t('Gündelik hayat', 'Daily life'), other: t('Diğer', 'Other'),
});

/** /terimler: the glossary, A to Z, with search, categories, a children's telling and where each term appears. */
export function GlossaryPage({ query }: { query: string }) {
  const wanted = new URLSearchParams(query).get('terim');
  const [all, setAll] = useState<GlossaryTerm[] | null>(null);
  const [categories, setCategories] = useState<{ slug: string; label: string; n: number }[]>([]);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [child, setChild] = useState(false);
  const [open, setOpen] = useState<string | null>(wanted);
  const [suggesting, setSuggesting] = useState(false);
  const enabled = vakifApiEnabled();
  useEffect(() => {
    if (!enabled) return;
    articlesApi.terms().then(r => { setAll(r.items); setCategories(r.categories); }, e => setError((e as Error).message));
  }, [enabled]);
  // a link from an article (?terim=slug) opens the term and brings it into view
  useEffect(() => {
    if (!wanted || !all) return;
    setOpen(wanted);
    requestAnimationFrame(() => document.getElementById(`terim-${wanted}`)?.scrollIntoView({ block: 'center' }));
  }, [wanted, all]);
  const shown = useMemo(() => {
    const needle = fold(q.trim());
    return (all ?? []).filter(x => (!category || x.category === category)
      && (!needle || fold([x.term, x.term_en, x.definition].filter(Boolean).join(' ')).includes(needle)));
  }, [all, q, category]);
  const groups = letterGroups(shown);
  const letters = new Set(groups.map(([l]) => l));
  if (!enabled) return <Scene className="rr-scene"><div className="page-shell rr-shell"><ReadingTabs current="terms" />
    <div className="rr-empty"><BookA size={30} strokeWidth={1.2} aria-hidden="true" /><h2>{t('Sözlük arka uç bağlantısıyla gelir.', 'The glossary comes with the backend connection.')}</h2></div></div></Scene>;
  return <Scene className="rr-scene"><div className="page-shell rr-shell">
    <ReadingTabs current="terms" />
    <header className="rr-head">
      <div>
        <p className="eyebrow"><span />{t('OKUMA ODASI · TERİMLER SÖZLÜĞÜ', 'READING ROOM · GLOSSARY')}</p>
        <h1>{t('Taşın, ahşabın,', 'The words of stone,')} <em>{t('vakfın sözcükleri.', 'wood and waqf.')}</em></h1>
        <p className="rr-lede">{t('Mukarnastan bânîye, kündekâriden imarete: eser sayfalarında ve makalelerde karşılaştığın terimler, sade açıklamalarıyla.',
          'From muqarnas to patron, from kündekâri to imaret: the terms you meet on the work pages and in the articles, simply explained.')}</p>
      </div>
      <aside className="rr-head-side">
        <button className="button gold" onClick={() => setSuggesting(true)}><Plus size={17} aria-hidden="true" /> {t('Terim öner', 'Suggest a term')}</button>
        <p>{t('Sözlükte olmayan bir terim mi gördün? Öner; editörlerimiz bakıp eklesin.', 'Spotted a term that is missing? Suggest it; our editors will check and add it.')}</p>
      </aside>
    </header>

    <div className="rr-filters">
      <form className="rr-search wide" role="search" onSubmit={(e: FormEvent) => { e.preventDefault(); track('term_search', undefined, { q: q.trim() }); }}>
        <Search size={16} aria-hidden="true" /><label className="sr-only" htmlFor="gl-q">{t('Terim ara', 'Search the terms')}</label>
        <input id="gl-q" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={t('Terim ya da anlam ara… (ör. kubbe)', 'Search a term or meaning… (e.g. dome)')} />
        {q && <button type="button" aria-label={t('Aramayı temizle', 'Clear the search')} onClick={() => setQ('')}><X size={15} /></button>}
      </form>
      {categories.length > 1 && <div className="rr-chips" role="group" aria-label={t('Kategori', 'Category')}>
        <button type="button" aria-pressed={!category} onClick={() => setCategory('')}>{t('Tümü', 'All')}</button>
        {categories.map(c => <button type="button" key={c.slug} aria-pressed={category === c.slug} onClick={() => setCategory(category === c.slug ? '' : c.slug)}>{c.label}<small>{c.n}</small></button>)}
      </div>}
      {currentLang() === 'tr' && (all ?? []).some(x => x.definition_child) && <label className="rr-switch"><input type="checkbox" checked={child} onChange={e => setChild(e.target.checked)} /><span><Lightbulb size={15} aria-hidden="true" /> Çocuklar için anlat</span></label>}
    </div>

    {error && <p className="form-error" role="alert">{error}</p>}
    {!all && !error && <p className="loading-state" role="status">{t('Sözlük açılıyor…', 'Opening the glossary…')}</p>}
    {all && <nav className="gl-letters" aria-label={t('Harfler', 'Letters')}>{TURKISH_ALPHABET.map(l => letters.has(l)
      ? <a key={l} href={`#harf-${l}`} onClick={e => { e.preventDefault(); document.getElementById(`harf-${l}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{l}</a>
      : <span key={l} aria-hidden="true">{l}</span>)}</nav>}
    <p className="sr-only" role="status" aria-live="polite">{all ? t(`${shown.length} terim`, `${shown.length} terms`) : ''}</p>
    {all && !shown.length && <div className="rr-empty"><h2>{t('Bu aramaya uyan terim yok.', 'No term matches this search.')}</h2>
      <button className="text-link" onClick={() => setSuggesting(true)}>{t('Bu terimi öner', 'Suggest this term')} <ArrowUpRight size={15} /></button></div>}
    <div className="gl-groups">{groups.map(([letter, items]) => <section key={letter} className="gl-group" aria-labelledby={`harf-${letter}`}>
      <h2 id={`harf-${letter}`}>{letter}</h2>
      <dl>{items.map(x => <TermEntry key={x.slug} x={x} child={child} open={open === x.slug} onToggle={() => setOpen(open === x.slug ? null : x.slug)} />)}</dl>
    </section>)}</div>
    {suggesting && <SuggestTerm initial={q} onClose={() => setSuggesting(false)} />}
  </div></Scene>;
}

function TermEntry({ x, child, open, onToggle }: { x: GlossaryTerm; child: boolean; open: boolean; onToggle: () => void }) {
  const [detail, setDetail] = useState<TermDetail | null>(null);
  const { artifacts } = useContent();
  useEffect(() => { if (open && !detail) articlesApi.term(x.slug).then(setDetail, () => {}); }, [open, detail, x.slug]);
  const feed = new Set(artifacts.map(a => a.slug));
  const works = detail?.monuments.filter(m => feed.has(m.slug)) ?? [];
  const definition = (child && x.definition_child) || x.definition;
  return <div className={`gl-entry ${open ? 'open' : ''}`} id={`terim-${x.slug}`}>
    <dt><span className="gl-term">{capitalize(x.term)}</span>{x.term_en && <i lang="en">{x.term_en}</i>}{x.category_label && <small>{x.category_label}</small>}</dt>
    <dd>
      <p lang={x.definition_lang}>{definition}</p>
      {x.origin === 'visitor' && <p className="gl-by">{t(`${x.author} önerdi; editörlerce onaylandı.`, `Suggested by ${x.author}; approved by the editors.`)}</p>}
      <button type="button" className="gl-more" aria-expanded={open} onClick={onToggle}>{t('Geçtiği yerler', 'Where it appears')} <ChevronDown size={15} aria-hidden="true" /></button>
      {open && <div className="gl-where">{!detail ? <p role="status">{t('Aranıyor…', 'Looking…')}</p>
        : !works.length && !detail.articles.length ? <p>{t('Henüz bir eser ya da makalede geçmiyor.', 'It does not appear in a work or article yet.')}</p>
        : <>{works.length > 0 && <><b>{t('Eserler', 'Works')}</b><ul>{works.map(m => <li key={m.slug}><Link to={`/eser/${m.slug}`}>{m.name}</Link> <small>{m.city}</small></li>)}</ul></>}
          {detail.articles.length > 0 && <><b>{t('Makaleler', 'Articles')}</b><ul>{detail.articles.map(a => <li key={a.slug}><Link to={`/makale/${a.slug}`}>{a.title}</Link> <small>{a.kind_label}</small></li>)}</ul></>}</>}
      </div>}
    </dd>
  </div>;
}

function SuggestTerm({ initial, onClose }: { initial: string; onClose: () => void }) {
  const { user, ready } = useAccount();
  const [f, setF] = useState({ term_tr: initial.trim(), term_en: '', definition_tr: '', definition_child_tr: '', category: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof f, v: string) => setF(p => ({ ...p, [k]: v }));
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (f.term_tr.trim().length < 2) { setError(t('Terimi yazın.', 'Write the term.')); first.current?.focus(); return; }
    if (f.definition_tr.trim().length < 10) { setError(t('Tanım en az 10 karakter olmalı.', 'The definition must be at least 10 characters.')); return; }
    setBusy(true); setError('');
    try {
      await articlesApi.suggestTerm({ term_tr: f.term_tr.trim(), term_en: f.term_en.trim() || undefined, definition_tr: f.definition_tr.trim(),
        definition_child_tr: f.definition_child_tr.trim() || undefined, category: f.category || undefined });
      track('term_submit'); setDone(true);
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return <Modal title={t('Terim öner', 'Suggest a term')} onClose={onClose} className="rr-modal">
    {!ready ? <p role="status">…</p> : !user ? <div className="rr-gate"><p>{t('Terim önermek için giriş yapman gerekiyor. Önerin, editörlerimiz onaylayınca sözlükte görünür.', 'You need to sign in to suggest a term. It appears in the glossary once our editors approve it.')}</p>
      <Link className="button dark" to={`/giris?sonra=${encodeURIComponent('/terimler')}`}>{t('Giriş yap ya da hesap aç', 'Sign in or open an account')}</Link></div>
    : done ? <div className="rr-gate" role="status"><h3>{t('Teşekkürler!', 'Thank you!')}</h3><p>{t('Önerin editörlerimize ulaştı. Durumunu “Hesabım” sayfasından izleyebilirsin.', 'Your suggestion has reached our editors. You can follow it on the “My account” page.')}</p>
      <div className="v-actions"><button className="button dark" onClick={onClose}>{t('Sözlüğe dön', 'Back to the glossary')}</button><Link className="text-link" to="/hesabim">{t('Hesabım', 'My account')}</Link></div></div>
    : <form className="v-form" onSubmit={submit} noValidate>
      <div className="rr-two">
        <label className="v-field"><span>{t('Terim', 'Term')}</span><input ref={first} autoFocus maxLength={80} value={f.term_tr} onChange={e => set('term_tr', e.target.value)} placeholder={t('ör. Muvakkithane', 'e.g. Muvakkithane')} /></label>
        <label className="v-field"><span>{t('İngilizce karşılığı (isteğe bağlı)', 'English equivalent (optional)')}</span><input maxLength={120} value={f.term_en} onChange={e => set('term_en', e.target.value)} lang="en" /></label>
      </div>
      <label className="v-field"><span>{t('Tanım', 'Definition')}</span><textarea rows={3} maxLength={1200} value={f.definition_tr} onChange={e => set('definition_tr', e.target.value)}
        placeholder={t('Kısa ve sade bir açıklama. Tarihî bilgi değil, kavramın anlamı.', 'A short, plain explanation of what the word means.')} /><small>{f.definition_tr.length} / 1200</small></label>
      <label className="v-field"><span>{t('Çocuklar için tanım (isteğe bağlı)', 'Definition for children (optional)')}</span><textarea rows={2} maxLength={600} value={f.definition_child_tr} onChange={e => set('definition_child_tr', e.target.value)} /></label>
      <label className="v-field"><span>{t('Kategori', 'Category')}</span><select value={f.category} onChange={e => set('category', e.target.value)}><option value="">{t('Emin değilim', 'Not sure')}</option>
        {Object.entries(categoryNames()).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="v-actions"><button className="button dark" disabled={busy}>{busy ? t('Gönderiliyor…', 'Sending…') : t('Öneriyi gönder', 'Send the suggestion')}</button>
        <button type="button" className="text-link" onClick={onClose}>{t('Vazgeç', 'Cancel')}</button></div>
    </form>}
  </Modal>;
}
