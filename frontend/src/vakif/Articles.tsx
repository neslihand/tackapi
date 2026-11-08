import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowUpRight, BookOpen, Check, Clock3, Link2, PenLine, Search, X } from 'lucide-react';
import { Link } from '../lib/navigation';
import { currentLang, t } from '../lib/i18n';
import { articlesApi, loadGlossary, type ArticleDetail, type ArticleItem, type ArticleKind, type ArticleList, type GlossaryTerm } from '../lib/articlesApi';
import { articleBlocks, capitalize, markTerms } from '../lib/articleText';
import { vakifApiEnabled } from '../lib/vakifApi';
import { useContent } from '../lib/contentStore';
import { track } from '../lib/analytics';
import { Scene } from '../components/UI';
import { ArticleCard, CoverArt, ReadingTabs, TermMark, formatDay, kindNames } from './ArticleParts';

const PAGE = 12;

function Offline() {
  return <Scene className="rr-scene"><div className="page-shell rr-shell"><ReadingTabs current="articles" />
    <div className="rr-empty"><BookOpen size={30} strokeWidth={1.2} aria-hidden="true" /><h2>{t('Makaleler arka uç bağlantısıyla gelir.', 'Articles come with the backend connection.')}</h2>
      <p>{t('Bu demo sürümünde yalnızca yerleşik eserler var.', 'This demo version has only the built-in works.')}</p></div></div></Scene>;
}

/** /makaleler: city histories, foundation works and waqf culture; filters by kind and city, search, load more. */
export function ArticlesPage({ query }: { query: string }) {
  const params = new URLSearchParams(query);
  const [kind, setKind] = useState<ArticleKind | ''>((params.get('tur') as ArticleKind) || '');
  const [city, setCity] = useState(params.get('sehir') ?? '');
  const [q, setQ] = useState(params.get('q') ?? '');
  const [search, setSearch] = useState(q);
  const [pages, setPages] = useState(1);
  const [data, setData] = useState<ArticleList | null>(null);
  const [items, setItems] = useState<ArticleItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const enabled = vakifApiEnabled();
  useEffect(() => { setPages(1); }, [kind, city, search]);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setLoading(true); setError('');
    articlesApi.list({ kind, city, q: search, page: pages, page_size: PAGE }).then(r => {
      if (!alive) return;
      setData(r); setItems(list => pages === 1 ? r.items : [...list, ...r.items.filter(x => !list.some(y => y.slug === x.slug))]);
    }, e => alive && setError((e as Error).message)).finally(() => alive && setLoading(false));
    const next = new URLSearchParams();
    if (kind) next.set('tur', kind); if (city) next.set('sehir', city); if (search) next.set('q', search);
    history.replaceState(null, '', `#/makaleler${next.toString() ? `?${next}` : ''}`);
    return () => { alive = false; };
  }, [enabled, kind, city, search, pages]);
  if (!enabled) return <Offline />;
  const filtered = Boolean(kind || city || search);
  const [lead, ...rest] = items;
  const showLead = !filtered && lead;
  const kinds = data?.facets.kinds ?? [];
  const total = kinds.reduce((n, k) => n + k.n, 0);
  return <Scene className="rr-scene"><section className="rr-band" data-nav-theme="dark"><div className="page-shell rr-band-inner">
    <ReadingTabs current="articles" />
    <header className="rr-head">
      <div>
        <p className="eyebrow"><span />{t('OKUMA ODASI · MAKALELER', 'READING ROOM · ARTICLES')}</p>
        <h1>{t('Şehirlerin hafızası,', 'The memory of cities,')} <em>{t('vakfın dili.', 'the language of the waqf.')}</em></h1>
        <p className="rr-lede">{t('Envanter kitaplarının şehir tarihleri, vakıf eserleri üzerine yazılar ve vakıf kültürünü anlatan denemeler. Okurken altı noktalı sözcüklere dokun: terimin açıklaması açılır.',
          'City histories from the inventory books, writing on foundation works and essays on waqf culture. Tap a word with a dotted underline while you read to open its explanation.')}</p>
      </div>
      <aside className="rr-head-side">
        <Link className="button gold" to="/makale-yaz"><PenLine size={17} aria-hidden="true" /> {t('Yazı gönder', 'Send an article')}</Link>
        <p>{t('Bir eserin hikâyesini mi biliyorsun? Yazını gönder; editörlerimiz okuyup yayımlasın.', 'Do you know the story of a work? Send your article; our editors will read and publish it.')}</p>
      </aside>
    </header>
  </div></section><div className="page-shell rr-shell rr-after">

    <div className="rr-filters">
      <div className="rr-chips" role="group" aria-label={t('Tür', 'Kind')}>
        <button type="button" aria-pressed={!kind} onClick={() => setKind('')}>{t('Tümü', 'All')}{total ? <small>{total}</small> : null}</button>
        {kinds.map(k => <button type="button" key={k.slug} aria-pressed={kind === k.slug} onClick={() => setKind(kind === k.slug ? '' : k.slug)}>{k.label}<small>{k.n}</small></button>)}
      </div>
      {(data?.facets.cities.length ?? 0) > 1 && <label className="rr-select"><span className="sr-only">{t('Şehir', 'City')}</span>
        <select value={city} onChange={e => setCity(e.target.value)}><option value="">{t('Bütün şehirler', 'All cities')}</option>
          {data!.facets.cities.map(c => <option key={c.slug} value={c.slug}>{c.name} ({c.n})</option>)}</select></label>}
      <form className="rr-search" role="search" onSubmit={(e: FormEvent) => { e.preventDefault(); setSearch(q.trim()); track('search', undefined, { q: q.trim(), where: 'articles' }); }}>
        <Search size={16} aria-hidden="true" /><label className="sr-only" htmlFor="rr-q">{t('Makalelerde ara', 'Search the articles')}</label>
        <input id="rr-q" type="search" value={q} onChange={e => { setQ(e.target.value); if (!e.target.value) setSearch(''); }} placeholder={t('Makalelerde ara…', 'Search the articles…')} />
        {search && <button type="button" aria-label={t('Aramayı temizle', 'Clear the search')} onClick={() => { setQ(''); setSearch(''); }}><X size={15} /></button>}
      </form>
    </div>

    {error && <p className="form-error" role="alert">{error}</p>}
    <p className="sr-only" role="status" aria-live="polite">{loading ? t('Makaleler yükleniyor…', 'Loading articles…') : data ? t(`${data.total} makale`, `${data.total} articles`) : ''}</p>
    {!loading && data && !data.total && <div className="rr-empty">
      <BookOpen size={30} strokeWidth={1.2} aria-hidden="true" />
      {filtered ? <><h2>{t('Bu seçimde makale yok.', 'No articles match this choice.')}</h2><button className="text-link" onClick={() => { setKind(''); setCity(''); setQ(''); setSearch(''); }}>{t('Filtreleri temizle', 'Clear the filters')}</button></>
        : <><h2>{t('İlk makaleler yolda.', 'The first articles are on their way.')}</h2><p>{t('Şehir tarihleri yakında burada. İstersen ilk yazıyı sen gönder.', 'City histories will be here soon. You can send the first article yourself.')}</p><Link className="text-link" to="/makale-yaz">{t('Yazı gönder', 'Send an article')} <ArrowUpRight size={15} /></Link></>}
    </div>}
    {showLead && <ArticleCard a={lead} wide />}
    {(showLead ? rest : items).length > 0 && <ul className="rr-grid">{(showLead ? rest : items).map(a => <li key={a.slug}><ArticleCard a={a} /></li>)}</ul>}
    {loading && !items.length && <ul className="rr-grid" aria-hidden="true">{[0, 1, 2].map(i => <li key={i} className="rr-skeleton" />)}</ul>}
    {data && items.length < data.total && <div className="rr-more"><button className="button line" disabled={loading} onClick={() => setPages(p => p + 1)}>
      {loading ? t('Yükleniyor…', 'Loading…') : t(`Daha fazla göster (${data.total - items.length})`, `Show more (${data.total - items.length})`)}</button></div>}
  </div></Scene>;
}

/** /makale/<slug>: the reading page. */
export function ArticlePage({ slug }: { slug: string }) {
  const [a, setA] = useState<ArticleDetail | null>(null);
  const [error, setError] = useState('');
  const [terms, setTerms] = useState<GlossaryTerm[]>([]);
  const enabled = vakifApiEnabled();
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setA(null); setError('');
    articlesApi.get(slug).then(r => { if (!alive) return; setA(r); document.title = `${r.title} — EŞİK`; track('article_view', undefined, { article: slug, kind: r.kind }); },
      e => alive && setError((e as Error).message));
    loadGlossary().then(list => alive && setTerms(list));
    return () => { alive = false; };
  }, [enabled, slug]);
  if (!enabled) return <Offline />;
  if (error) return <Scene className="rr-scene"><div className="page-shell rr-shell"><div className="rr-empty"><h2>{t('Bu makale bulunamadı.', 'This article could not be found.')}</h2><p>{error}</p>
    <Link className="text-link" to="/makaleler"><ArrowLeft size={15} /> {t('Makalelere dön', 'Back to the articles')}</Link></div></div></Scene>;
  if (!a) return <div className="page-shell loading-state" role="status">{t('Makale açılıyor…', 'Opening the article…')}</div>;
  return <Reader a={a} terms={terms} />;
}

function Reader({ a, terms }: { a: ArticleDetail; terms: GlossaryTerm[] }) {
  const [coverBroken, setCoverBroken] = useState(false);   // the file missing on this server: the drawn cover instead
  const cover = coverBroken ? null : a.cover;
  const { artifacts } = useContent();
  const [child, setChild] = useState(false);
  const [copied, setCopied] = useState(false);
  const [progress, setProgress] = useState(0);
  const body = useRef<HTMLDivElement>(null);
  const blocks = useMemo(() => articleBlocks(a.body), [a.body]);
  const bySlug = useMemo(() => new Map(terms.map(x => [x.slug, x])), [terms]);
  // first occurrence of each term in the whole article; computed once per article and glossary
  const marked = useMemo(() => { const seen = new Set<string>(); return blocks.map(b => b.type === 'h' ? [b.text] : markTerms(b.text, terms, seen)); }, [blocks, terms]);
  const found = useMemo(() => [...new Set(marked.flat().flatMap(p => typeof p === 'string' ? [] : [p.term]))].map(s => bySlug.get(s)!).filter(Boolean), [marked, bySlug]);
  const headings = blocks.filter(b => b.type === 'h');
  const feed = new Set(artifacts.map(x => x.slug));
  const works = a.monuments.filter(m => feed.has(m.slug));
  useEffect(() => {
    const update = () => {
      const el = body.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setProgress(Math.min(1, Math.max(0, (window.innerHeight * .35 - r.top) / Math.max(1, r.height))));
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => { window.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, []);
  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title: a.title, url });
      else { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2400); }
    } catch { /* paylaşım iptal edildi */ }
  }
  const pages = a.source?.pages ? (a.source.pages[0] === a.source.pages[1] ? t(`s. ${a.source.pages[0]}`, `p. ${a.source.pages[0]}`) : t(`s. ${a.source.pages[0]}–${a.source.pages[1]}`, `pp. ${a.source.pages[0]}–${a.source.pages[1]}`)) : '';
  // the editor's note is Turkish; in English the book, section and pages are put together instead
  const composed = a.source ? [a.source.book, a.source.section && `“${a.source.section}”`, pages].filter(Boolean).join(', ') : '';
  const sourceText = a.source && (currentLang() === 'en' && a.source.book ? composed : a.source.note || composed);
  return <Scene className="rr-scene rr-reading">
    <div className="rr-progress" aria-hidden="true"><i style={{ transform: `scaleX(${progress})` }} /></div>
    <header className={`rr-hero ${cover ? 'has-cover' : ''}`} data-nav-theme="dark">
      {cover ? <img className="rr-hero-img" src={cover.src} alt={cover.alt} onError={() => setCoverBroken(true)} /> : <CoverArt kind={a.kind} title={a.title} />}
      <div className="rr-hero-text page-shell">
        <Link className="rr-back" to="/makaleler"><ArrowLeft size={15} aria-hidden="true" /> {t('Makaleler', 'Articles')}</Link>
        <p className="rr-kicker">{a.kind_label}{a.city ? <> · {a.city.name}</> : null}</p>
        <h1 lang={a.lang}>{a.title}</h1>
        {a.summary && <p className="rr-hero-lede" lang={a.lang}>{a.summary}</p>}
        <p className="rr-hero-meta"><span>{a.byline}</span><span aria-hidden="true">·</span><span>{formatDay(a.published_at)}</span><span aria-hidden="true">·</span>
          <span><Clock3 size={14} aria-hidden="true" /> {t(`${a.reading_minutes} dk okuma`, `${a.reading_minutes} min read`)}</span></p>
      </div>
    </header>
    <div className="page-shell rr-layout">
      <aside className="rr-aside">
        {headings.length > 1 && <nav className="rr-toc" aria-label={t('Bu makalede', 'In this article')}><p>{t('BU MAKALEDE', 'IN THIS ARTICLE')}</p>
          <ol>{headings.map(h => <li key={h.id}><a href={`#${h.id}`} onClick={e => { e.preventDefault(); document.getElementById(h.id!)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{h.text}</a></li>)}</ol></nav>}
        {found.length > 0 && <div className="rr-aside-terms"><p>{t('TERİMLER', 'TERMS')}</p>
          <ul>{found.map(x => <li key={x.slug}><Link to={`/terimler?terim=${x.slug}`}>{capitalize(x.term)}</Link></li>)}</ul>
          {currentLang() === 'tr' && found.some(x => x.definition_child) && <label className="rr-switch"><input type="checkbox" checked={child} onChange={e => setChild(e.target.checked)} /><span>{t('Açıklamaları çocuklar için', 'Explain for children')}</span></label>}
        </div>}
        <button type="button" className="rr-share" onClick={share}>{copied ? <><Check size={15} aria-hidden="true" /> {t('Bağlantı kopyalandı', 'Link copied')}</> : <><Link2 size={15} aria-hidden="true" /> {t('Bağlantıyı paylaş', 'Share the link')}</>}</button>
      </aside>
      <article className="rr-article">
        {currentLang() === 'en' && a.lang === 'tr' && <p className="rr-note" lang="en">This article is available in Turkish only.</p>}
        <div className="rr-body" ref={body} lang={a.lang}>{blocks.map((b, i) => {
          if (b.type === 'h') return <h2 key={i} id={b.id}>{b.text}</h2>;
          const content = marked[i].map((p, j) => typeof p === 'string' ? <Fragment key={j}>{p}</Fragment> : <TermMark key={j} text={p.text} term={bySlug.get(p.term)} child={child} />);
          return b.type === 'q' ? <blockquote key={i}>{content}</blockquote> : <p key={i}>{content}</p>;
        })}</div>
        {a.source && <section className="rr-source" aria-labelledby="rr-source-title"><BookOpen size={20} strokeWidth={1.4} aria-hidden="true" />
          <div><h2 id="rr-source-title">{t('Kaynak', 'Source')}</h2>
            <p>{sourceText}</p>
            {a.origin === 'book' && <small>{t('Metin, Vakıf Katılım envanter kitabından alınmıştır; yalnızca biçim ve yazım düzenlenmiştir.', 'The text comes from the Vakıf Katılım inventory book; only its layout and spelling were edited.')}</small>}
            {a.origin === 'visitor' && <small>{t('Bu yazıyı bir ziyaretçi gönderdi; editörlerimiz okuyup yayımladı. Kitaptaki bilgiden ayrıdır.', 'A visitor sent this article; our editors read and published it. It is separate from the book’s information.')}</small>}
          </div></section>}
        {!a.source && a.origin === 'visitor' && <p className="rr-note">{t('Bu yazıyı bir ziyaretçi gönderdi; editörlerimiz okuyup yayımladı. Kitaptaki bilgiden ayrıdır.', 'A visitor sent this article; our editors read and published it. It is separate from the book’s information.')}</p>}
        {works.length > 0 && <section className="rr-works" aria-labelledby="rr-works-title"><h2 id="rr-works-title">{t('Bu yazıdaki eserler', 'Works in this article')}</h2>
          <ul>{works.map(m => <li key={m.slug}><Link to={`/eser/${m.slug}`}>
            <span className="rr-work-img">{m.image ? <img src={m.image.thumb} alt="" loading="lazy" /> : null}</span>
            <span><strong>{m.name}</strong><small>{m.city}</small></span><ArrowUpRight size={16} aria-hidden="true" /></Link></li>)}</ul></section>}
      </article>
    </div>
    {a.related.length > 0 && <section className="page-shell rr-related" aria-labelledby="rr-related-title">
      <h2 id="rr-related-title">{t('Okumaya devam et', 'Keep reading')}</h2>
      <ul className="rr-grid">{a.related.map(r => <li key={r.slug}><ArticleCard a={r} /></li>)}</ul>
    </section>}
    <div className="page-shell rr-write-cta"><p>{t('Senin de anlatacak bir hikâyen mi var?', 'Do you have a story to tell, too?')}</p>
      <Link className="button dark" to="/makale-yaz"><PenLine size={16} aria-hidden="true" /> {t('Yazı gönder', 'Send an article')}</Link></div>
  </Scene>;
}
