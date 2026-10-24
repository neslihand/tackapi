import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, BookOpen, ChevronLeft, ChevronRight, MapPin, Sparkles, X } from 'lucide-react';
import { citedRefs, eventLabel, rangeText, roleLabel, splitCitations, strings, type ChatReply, type Lang, type PublicDetail, type PublicItem } from './model';

type Mode = 'standard' | 'story' | 'child';
const MODES: Mode[] = ['standard', 'story', 'child'];

/**
 * Ziyaretçinin gördüğü eser sayfası. Yalnızca API verisiyle çalışır (ön yüzün hikâye sayfasının görsel dili).
 * chat: anlatım istemek için fonksiyon; null ise (ör. taslak eser) sohbet devre dışı gösterilir.
 */
export function MonumentView({ item, detail, lang, chat, backHref }: {
  item: PublicItem; detail: PublicDetail; lang: Lang; chat: ((mode: Mode) => Promise<ChatReply>) | null; backHref?: string;
}) {
  const s = strings(lang);
  const c = detail.card;
  const hero = detail.images[0] ?? item.image;
  const [zoom, setZoom] = useState<number | null>(null);
  const people = c.persons.filter(p => ['patron', 'founder', 'architect', 'builder', 'calligrapher'].includes(p.role)).slice(0, 4);
  const location = [item.district, item.neighborhood].filter(Boolean).join(', ');
  const paragraphs = (detail.text ?? '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  return <div className="pv" lang={lang}>
    <section className="pv-hero">
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

    <div className="pv-body" id="pv-reading">
      {item.summary && <p className="pv-lead">{item.summary}</p>}
      <Narration lang={lang} chat={chat} />

      {detail.images.length > 1 && <section className="pv-section"><h2>{s.gallery}</h2>
        <div className="pv-gallery">{detail.images.map((img, i) => <button key={img.src} onClick={() => setZoom(i)} aria-label={img.alt ?? `${s.gallery} ${i + 1}`}>
          <img src={img.thumb} alt="" loading="lazy" />{img.review_status && img.review_status !== 'published' && <span className="pv-pending">{s.pending}</span>}
        </button>)}</div></section>}

      {c.events.length > 0 && <section className="pv-section"><h2>{s.timeline}</h2>
        <ol className="pv-timeline">{c.events.map((e, i) => <li key={i}><b>{e.date_text || rangeText(e.years) || '—'}</b>
          <div><strong>{eventLabel(e.kind, lang)}</strong> {e.description_tr}{e.person ? ` — ${e.person}` : ''}{e.date_text_hijri && <small> (H. {e.date_text_hijri})</small>}</div></li>)}</ol>
      </section>}

      {c.artworks.length > 0 && <section className="pv-section"><h2>{s.artworks}</h2>
        <ul className="pv-list">{c.artworks.slice(0, 8).map((a, i) => <li key={i}><strong>{[a.element, a.technique].filter(Boolean).join(' · ') || a.kind}</strong>
          {(a.script || a.artist || a.date_text) && <span>{[a.script, a.artist, a.date_text].filter(Boolean).join(' · ')}</span>}</li>)}</ul></section>}

      {(c.parent || c.children.length > 0) && <section className="pv-section">
        {c.parent && <p className="pv-relation">{s.partOf}: <strong>{c.parent}</strong></p>}
        {c.children.length > 0 && <><h2>{s.children}</h2><ul className="pv-list">{c.children.map(ch => <li key={ch.name_tr}><strong>{ch.name_tr}</strong></li>)}</ul></>}
      </section>}

      {c.current_state && <section className="pv-section pv-visit"><MapPin size={20} /><p><strong>{s.today}:</strong> {c.current_state}</p></section>}

      {c.notes.length > 0 && <section className="pv-section pv-note" role="note"><strong>{s.notes}</strong>{c.notes.map((n, i) => <p key={i}>{n.note_tr}</p>)}</section>}

      {paragraphs.length > 0 && <section className="pv-section"><details className="pv-text"><summary><BookOpen size={17} /> {s.readText}</summary>
        {detail.text_note && <p className="pv-muted">{detail.text_note}</p>}{paragraphs.map((p, i) => <p key={i}>{p}</p>)}</details></section>}

      <section className="pv-sources"><div><h3>{s.sources}</h3>
        <p>{lang === 'tr' ? 'Bu sayfadaki bilgiler Vakıf Katılım envanter kitabından alınmıştır.' : 'Information on this page comes from the Vakıf Katılım inventory book.'}</p></div>
        <ul>{detail.source.book && <li><span>{s.sourceBook}</span><strong>{detail.source.book}{detail.source.pages?.[0] ? `, ${s.pages} ${detail.source.pages[0]}–${detail.source.pages[1]}` : ''}</strong></li>}
          {detail.source.credits?.authors?.length ? <li><span>{s.authors}</span><strong>{detail.source.credits.authors.join(', ')}</strong></li> : null}</ul>
      </section>
    </div>
    {zoom !== null && <Lightbox images={detail.images} index={zoom} lang={lang} onIndex={setZoom} onClose={() => setZoom(null)} />}
  </div>;
}

function Narration({ lang, chat }: { lang: Lang; chat: ((mode: Mode) => Promise<ChatReply>) | null }) {
  const s = strings(lang);
  const [mode, setMode] = useState<Mode>('standard');
  const [replies, setReplies] = useState<Partial<Record<Mode, ChatReply>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function ask(m: Mode) {
    setMode(m);
    if (!chat || replies[m]) return;
    setBusy(true); setError('');
    try { const r = await chat(m); setReplies(x => ({ ...x, [m]: r })); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const reply = replies[mode];
  // Ziyaretçiye yalnızca cevapta atıf yapılan kaynaklar gösterilir (aramada gelip kullanılmayanlar değil)
  const cited = reply ? reply.sources.filter(src => citedRefs(reply.answer).has(src.ref)) : [];
  return <section className="pv-narration" aria-labelledby="pv-mode">
    <div className="pv-tools"><div id="pv-mode"><Sparkles size={18} /> {s.mode}</div>
      <div className="pv-segmented" role="group" aria-labelledby="pv-mode">{MODES.map((m, i) => <button key={m} className={mode === m ? 'active' : ''} aria-pressed={mode === m} disabled={!chat} onClick={() => ask(m)}>{s.modes[i]}</button>)}</div></div>
    {!chat ? <p className="pv-muted">{s.draftChat}</p>
      : !reply ? <div className="pv-ask">{busy ? <p role="status">{s.loading}</p> : <button className="pv-button" onClick={() => ask(mode)}><Sparkles size={16} /> {s.ask}</button>}<p className="pv-muted">{s.askHint}</p>{error && <p className="pv-error" role="alert">{error}</p>}</div>
      : <div className="pv-answer" aria-live="polite">
        {reply.answer.split(/\n\s*\n/).map((para, i) => <p key={i}>{splitCitations(para).map((part, j) => 'text' in part ? part.text
          : <sup key={j}>{part.refs.map(r => <a key={r} href={`#pv-src-${r}`}>{r}</a>)}</sup>)}</p>)}
        {mode === 'story' && <small className="pv-muted">{s.storyNote}</small>}
        {cited.length > 0 && <ol className="pv-cites">{cited.map(src => <li key={src.ref} id={`pv-src-${src.ref}`}><b>{src.ref}</b> {src.book}, {src.pages} — {src.heading}</li>)}</ol>}
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
