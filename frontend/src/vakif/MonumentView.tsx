// Kopya: admin/src/public (MonumentView.tsx). Panel önizlemesi ile site aynı eser sayfasını gösterir; birleştirmede tek kaynağa
// indirilecek. Burada yapılan değişikliği oraya da uygula (ön yüze özgü farklar 'site:' notuyla işaretli).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowLeft, BookOpen, ChevronLeft, ChevronRight, MapPin, Pencil, Sparkles, X } from 'lucide-react';
import { MonumentMap } from './MonumentMap';
import { track } from '../lib/analytics';   // site: fotoğraf açma olayı
import { artworkLabel, eventLabel, rangeText, roleLabel, strings, type Card, type Lang, type NarrationMode, type PublicDetail, type PublicImage, type PublicItem } from './model';

type Mode = 'detail' | NarrationMode;
const MODES: Mode[] = ['detail', 'story', 'child'];

/**
 * Ziyaretçinin gördüğü eser sayfası. Yalnızca API verisiyle çalışır (ön yüzün hikâye sayfasının görsel dili).
 * Anlatımlar: "Detaylı" kitaptaki paragrafların tamamıdır; hikâye ve çocuk anlatımı önceden üretilip kaydedilmiştir
 * (detail.narrations), sayfa yapay zekâyı çağırmaz.
 * generate / edit: yalnızca yönetici önizlemesinde; anlatımı üretir, yeniler ya da elle düzeltir. Ziyaretçi sayfasında verilmez.
 */
export function MonumentView({ item, detail, lang, generate, edit, backHref, actions }: {
  item: PublicItem; detail: PublicDetail; lang: Lang; backHref?: string; actions?: ReactNode;   // site: actions (favori, mühür, Esere Sor)
  generate?: (mode: NarrationMode) => Promise<void>; edit?: (mode: NarrationMode, text: string) => Promise<void>;
}) {
  const s = strings(lang);
  const c = detail.card;
  const hero = detail.images[0] ?? item.image;
  const people = c.persons.filter(p => ['patron', 'founder', 'architect', 'builder', 'calligrapher'].includes(p.role)).slice(0, 4);
  const location = [item.district, item.neighborhood].filter(Boolean).join(', ');
  const paragraphs = (detail.text ?? '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  return <div className="pv" lang={lang}>
    <section className="pv-hero" data-nav-theme="dark">
      {hero ? <img className="pv-hero-image" src={hero.src} alt={hero.alt ?? ''} /> : <div className="pv-hero-image pv-hero-empty" />}
      <div className="pv-hero-shade" />
      <a className="pv-back" href={backHref ?? '#'} onClick={e => { if (!backHref) e.preventDefault(); }}><ArrowLeft size={17} /> {s.back}</a>
      <div className="pv-hero-copy">
        <p className="pv-eyebrow light"><span />{item.city.name.toLocaleUpperCase(lang === 'tr' ? 'tr-TR' : 'en')}{item.built.label ? ` · ${item.built.label}` : ''}</p>
        <h1>{item.name}</h1>
        {item.summary && <p>{item.summary}</p>}
        <a className="pv-scroll" href="#pv-reading" onClick={e => { e.preventDefault(); document.getElementById('pv-reading')?.scrollIntoView({ behavior: 'smooth' }); }}><span><ArrowDown size={18} /></span>{s.explore}</a>
      </div>
      {hero?.alt && <span className="pv-art-note">{hero.alt}</span>}
    </section>

    <section className="pv-facts" aria-label={lang === 'tr' ? 'Künye' : 'Key facts'}>
      <div><small>{s.kind}</small><strong>{item.kind_label}</strong></div>
      <div><small>{s.period}</small><strong>{item.period?.name ?? '—'}</strong></div>
      <div><small>{s.date}</small><strong>{item.built.label ?? '—'}</strong>{item.built.basis_label && item.built.label && <em>{item.built.basis_label}</em>}</div>
      <div><small>{s.location}</small><strong>{location || item.city.name}</strong></div>
      {people.length > 0 && <div className="wide"><small>{s.people}</small><strong>{people.map(p => `${p.name}${roleLabel(p.role, lang) ? ` (${roleLabel(p.role, lang)})` : ''}`).join(' · ')}</strong></div>}
    </section>

    {actions && <div className="pv-actions">{actions}</div>}

    <div className="pv-body" id="pv-reading">
      {item.summary && <p className="pv-lead">{item.summary}</p>}
      <Narration lang={lang} detail={detail} paragraphs={paragraphs} generate={generate} edit={edit} />

      <MonumentSections item={item} detail={detail} lang={lang} />

      <section className="pv-sources"><div><h3>{s.sources}</h3>
        <p>{lang === 'tr' ? 'Bu sayfadaki bilgiler Vakıf Katılım envanter kitabından alınmıştır.' : 'Information on this page comes from the Vakıf Katılım inventory book.'}</p></div>
        <ul>{detail.source.book && <li><span>{s.sourceBook}</span><strong>{detail.source.book}{detail.source.pages?.[0] ? `, ${s.pages} ${detail.source.pages[0]}–${detail.source.pages[1]}` : ''}</strong></li>}
          {detail.source.credits?.authors?.length ? <li><span>{s.authors}</span><strong>{detail.source.credits.authors.join(', ')}</strong></li> : null}</ul>
      </section>
    </div>
  </div>;
}

/**
 * site: eser sayfasının künye dışındaki bölümleri (fotoğraflar, tarihçe, süsleme, bağlı yapılar, harita, bugünkü
 * durumu). MonumentView'da ve sitenin sinematik hikâye sayfasının altında aynı bileşen kullanılır.
 */
export function MonumentSections({ item, detail, lang }: { item: PublicItem; detail: PublicDetail; lang: Lang }) {
  const s = strings(lang);
  const c = detail.card;
  const [zoom, setZoom] = useState<number | null>(null);
  const [artZoom, setArtZoom] = useState<{ images: PublicImage[]; index: number } | null>(null);
  const artTitle = (a: Card['artworks'][number]) => [a.element, a.technique].filter(Boolean).join(' · ') || artworkLabel(a.kind, lang);
  const artworksWithPhotos = c.artworks.filter(a => a.images?.length);
  const artworksText = c.artworks.filter(a => !a.images?.length).slice(0, 8);
  return <>
      {detail.images.length > 1 && <section className="pv-section"><h2>{s.gallery}</h2>
        <div className="pv-gallery">{detail.images.map((img, i) => <button key={img.src} onClick={() => { setZoom(i); track('photo_open', item.slug); }} aria-label={img.alt ?? `${s.gallery} ${i + 1}`}>
          <img src={img.thumb} alt="" loading="lazy" />{img.review_status && img.review_status !== 'published' && <span className="pv-pending">{s.pending}</span>}
        </button>)}</div></section>}

      {c.events.length > 0 && <section className="pv-section"><h2>{s.timeline}</h2>
        <ol className="pv-timeline">{c.events.map((e, i) => <li key={i}><b>{e.date_text || rangeText(e.years) || '—'}</b>
          <div><strong>{eventLabel(e.kind, lang)}</strong> {e.description_tr}{e.person ? ` — ${e.person}` : ''}{e.date_text_hijri && <small> (H. {e.date_text_hijri})</small>}</div></li>)}</ol>
      </section>}

      {c.artworks.length > 0 && <section className="pv-section"><h2>{s.artworks}</h2>
        {/* fotoğrafı olan kayıtlar önce, fotoğraflı kart olarak; diğerleri metin listesi */}
        {artworksWithPhotos.length > 0 && <div className="pv-art-grid">{artworksWithPhotos.map((a, i) => <figure key={i} className="pv-art-card">
          <button onClick={() => setArtZoom({ images: a.images, index: 0 })} aria-label={`${artTitle(a)}: ${s.gallery}`}>
            <img src={a.images[0].thumb} alt={a.images[0].alt ?? ''} loading="lazy" />
            {a.images.length > 1 && <span className="pv-art-count">+{a.images.length - 1}</span>}
            {a.images[0].review_status && a.images[0].review_status !== 'published' && <span className="pv-pending">{s.pending}</span>}</button>
          <figcaption><small>{artworkLabel(a.kind, lang)}</small><strong>{artTitle(a)}</strong>
            {(a.script || a.artist || a.date_text) && <span>{[a.script, a.artist, a.date_text].filter(Boolean).join(' · ')}</span>}</figcaption>
        </figure>)}</div>}
        {artworksText.length > 0 && <ul className="pv-list">{artworksText.map((a, i) => <li key={i}><strong>{artTitle(a)}</strong>
          {(a.script || a.artist || a.date_text) && <span>{[a.script, a.artist, a.date_text].filter(Boolean).join(' · ')}</span>}</li>)}</ul>}</section>}

      {(c.parent || c.children.length > 0) && <section className="pv-section">
        {c.parent && <p className="pv-relation">{s.partOf}: <strong>{c.parent}</strong></p>}
        {c.children.length > 0 && <><h2>{s.children}</h2><ul className="pv-list">{c.children.map(ch => <li key={ch.name_tr}><strong>{ch.name_tr}</strong></li>)}</ul></>}
      </section>}

      {detail.location && <MonumentMap location={detail.location} name={item.name} lang={lang} />}

      {c.current_state && <section className="pv-section pv-visit"><MapPin size={20} /><p><strong>{s.today}:</strong> {c.current_state}</p></section>}
    {zoom !== null && <Lightbox images={detail.images} index={zoom} lang={lang} onIndex={setZoom} onClose={() => setZoom(null)} />}
    {artZoom && <Lightbox images={artZoom.images} index={artZoom.index} lang={lang} onIndex={i => setArtZoom({ ...artZoom, index: i })} onClose={() => setArtZoom(null)} />}
  </>;
}

function Narration({ lang, detail, paragraphs, generate, edit }: {
  lang: Lang; detail: PublicDetail; paragraphs: string[]; generate?: (mode: NarrationMode) => Promise<void>;
  edit?: (mode: NarrationMode, text: string) => Promise<void>;
}) {
  const s = strings(lang);
  const [mode, setMode] = useState<Mode>('detail');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<string | null>(null);   // düzenleme kutusu açıkken metin
  async function act(job: () => Promise<void>) {
    setBusy(true); setError('');
    try { await job(); setDraft(null); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const run = (m: NarrationMode) => generate && act(() => generate(m));
  const reply = mode === 'detail' ? null : detail.narrations?.[mode] ?? null;
  return <section className="pv-narration" aria-labelledby="pv-mode">
    <div className="pv-tools"><div id="pv-mode"><Sparkles size={18} /> {s.mode}</div>
      <div className="pv-segmented" role="group" aria-labelledby="pv-mode">{MODES.map((m, i) => <button key={m} className={mode === m ? 'active' : ''} aria-pressed={mode === m} onClick={() => { setMode(m); setError(''); setDraft(null); }}>{s.modes[i]}</button>)}</div></div>
    {mode === 'detail'
      ? <div className="pv-fulltext"><small className="pv-muted"><BookOpen size={14} /> {s.text}{detail.text_note ? ` · ${detail.text_note}` : ''}</small>
        {paragraphs.length ? paragraphs.map((p, i) => <p key={i}>{p}</p>) : <p className="pv-muted">{s.noText}</p>}</div>
      : !reply ? <div className="pv-ask"><p className="pv-muted">{s.notReady}</p>
        {generate && (busy ? <p role="status">{s.loading}</p> : <button className="pv-button" onClick={() => run(mode)}><Sparkles size={16} /> Anlatımı üret</button>)}
        {error && <p className="pv-error" role="alert">{error}</p>}</div>
      : draft !== null && edit ? <div className="pv-edit">
        <label htmlFor="pv-edit-text">Anlatım metni — paragrafları boş satırla ayırın</label>
        <textarea id="pv-edit-text" value={draft} onChange={e => setDraft(e.target.value)} rows={18} disabled={busy} />
        <div className="pv-edit-actions">
          <button className="pv-button" disabled={busy || draft.trim().length < 50} onClick={() => act(() => edit(mode as NarrationMode, draft))}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
          <button className="pv-link" disabled={busy} onClick={() => { setDraft(null); setError(''); }}>Vazgeç</button></div>
        <p className="pv-muted">Kaydedilen metin yapay zekâya yeniden yazdırılmaz; ziyaretçiler doğrudan bu metni görür.</p>
        {error && <p className="pv-error" role="alert">{error}</p>}</div>
      : <div className="pv-answer" aria-live="polite">
        {reply.answer.split(/\n\s*\n/).map((para, i) => <p key={i}>{para}</p>)}
        {mode === 'story' && <small className="pv-muted">{s.storyNote}</small>}
        {reply.sources.length > 0 && <><h3 className="pv-cites-title">{s.usedSources}</h3>
          <ul className="pv-cites">{reply.sources.map(src => <li key={`${src.book}-${src.pages}`}>{src.book}, {src.pages} — {src.heading}</li>)}</ul></>}
        <small className="pv-muted">{s.aiNote}</small>
        {(generate || edit) && <div className="pv-ask pv-admin-actions">{busy ? <p role="status">{s.loading}</p> : <div className="pv-edit-actions">
            {edit && <button className="pv-button" onClick={() => { setDraft(reply.answer); setError(''); }}><Pencil size={16} /> Metni düzenle</button>}
            {generate && <button className="pv-link" onClick={() => run(mode)}><Sparkles size={15} /> Yeniden üret</button>}</div>}
          {error && <p className="pv-error" role="alert">{error}</p>}</div>}
      </div>}
  </section>;
}

function Lightbox({ images, index, lang, onIndex, onClose }: { images: PublicDetail['images']; index: number; lang: Lang; onIndex: (i: number) => void; onClose: () => void }) {
  const s = strings(lang);
  const ref = useRef<HTMLDialogElement>(null);
  const img = images[index];
  useEffect(() => { const d = ref.current; d?.showModal(); return () => d?.close(); }, []);
  const go = (step: number) => onIndex((index + step + images.length) % images.length);
  return <dialog ref={ref} className="pv-lightbox" aria-label={img.alt ?? s.gallery} onCancel={e => { e.preventDefault(); onClose(); }}
    onKeyDown={e => { if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); }}>
    <button className="pv-lb-close" onClick={onClose} aria-label={s.close}><X /></button>
    <figure><img src={img.src} alt={img.alt ?? ''} /><figcaption>{img.alt}{img.caption ? ` — ${img.caption}` : ''}{img.source ? ` · ${s.photoSource}: ${img.source.book}${img.source.page ? `, s. ${img.source.page}` : ''}` : ''} · {index + 1} / {images.length}</figcaption></figure>
    {images.length > 1 && <><button className="pv-lb-nav prev" onClick={() => go(-1)} aria-label={s.prev}><ChevronLeft /></button><button className="pv-lb-nav next" onClick={() => go(1)} aria-label={s.next}><ChevronRight /></button></>}
  </dialog>;
}
