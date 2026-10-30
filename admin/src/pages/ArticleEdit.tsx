import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, BookOpen, Check, Eye, EyeOff, ExternalLink, Heading2, ImagePlus, Quote, RotateCcw, Save, Star, Trash2, UserRound, X } from 'lucide-react';
import { api } from '../lib/api';
import { ARTICLE_KIND_LABELS, ARTICLE_ORIGIN_LABELS, articleIssues, formatDate, readingMinutes, wordCount } from '../lib/format';
import { Link, navigate } from '../lib/navigation';
import type { Article, ArticleFields, ArticleKind, ArticleMonument, ArticleStatus } from '../lib/types';
import { Field, Issues, PageHead, useLoad, useToast } from '../components/UI';
import { MonumentPicker } from '../components/MonumentPicker';
import { ArticleBody, ArticleStatusBadge } from '../components/ArticleBody';

type Form = { title_tr: string; title_en: string; summary_tr: string; summary_en: string; body_tr: string; body_en: string; kind: ArticleKind;
  city: string; authors: string; source_note: string; page_start: string; page_end: string; slug: string; featured: boolean; cover_alt: string };

const formOf = (a: Article): Form => ({
  title_tr: a.title_tr, title_en: a.title_en ?? '', summary_tr: a.summary_tr ?? '', summary_en: a.summary_en ?? '', body_tr: a.body_tr,
  body_en: a.body_en ?? '', kind: a.kind, city: a.city_slug ?? '', authors: a.authors.join(', '), source_note: a.source_note ?? '',
  page_start: a.page_start?.toString() ?? '', page_end: a.page_end?.toString() ?? '', slug: a.slug, featured: a.featured, cover_alt: a.cover_alt ?? '',
});

/** Formdan yalnızca değişen alanlar (boş metin null olur). */
function changes(a: Article, f: Form, monuments: ArticleMonument[]): ArticleFields {
  const base = formOf(a), out: ArticleFields = {};
  const text = (k: 'title_en' | 'summary_tr' | 'summary_en' | 'body_en' | 'source_note' | 'cover_alt') => { if (f[k] !== base[k]) out[k] = f[k].trim() || null; };
  if (f.title_tr !== base.title_tr) out.title_tr = f.title_tr.trim();
  if (f.body_tr !== base.body_tr) out.body_tr = f.body_tr;
  (['title_en', 'summary_tr', 'summary_en', 'body_en', 'source_note', 'cover_alt'] as const).forEach(text);
  if (f.kind !== base.kind) out.kind = f.kind;
  if (f.city !== base.city) out.city = f.city || '';
  if (f.authors !== base.authors) out.authors = f.authors.split(',').map(s => s.trim()).filter(Boolean);
  if (f.page_start !== base.page_start) out.page_start = f.page_start ? Number(f.page_start) : null;
  if (f.page_end !== base.page_end) out.page_end = f.page_end ? Number(f.page_end) : null;
  if (f.slug !== base.slug && f.slug.trim()) out.slug = f.slug.trim();
  if (f.featured !== base.featured) out.featured = f.featured;
  if (monuments.map(m => m.slug).join() !== a.monuments.map(m => m.slug).join()) out.monuments = monuments.map(m => m.slug);
  return out;
}

export function ArticleEdit({ id }: { id: number }) {
  const data = useLoad(() => api.article(id), [id]);
  const cities = useLoad(() => api.cities(), []);
  if (data.error) return <><BackLink /><p className="form-error" role="alert">{data.error}</p></>;
  if (!data.data) return <p role="status">Makale yükleniyor…</p>;
  return <Editor key={data.data.updated_at} article={data.data} cities={cities.data ?? []} onSaved={data.reload} />;
}

const BackLink = () => <Link className="text-link back-link" to="/makaleler"><ArrowLeft size={15} /> Makaleler</Link>;

function Editor({ article: a, cities, onSaved }: { article: Article; cities: { slug: string; name_tr: string }[]; onSaved: () => void }) {
  const notify = useToast();
  const [f, setF] = useState<Form>(() => formOf(a));
  const [monuments, setMonuments] = useState<ArticleMonument[]>(a.monuments);
  const [lang, setLang] = useState<'tr' | 'en'>('tr');
  const [view, setView] = useState<'write' | 'split' | 'preview'>('split');
  const [issues, setIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState(a.reject_reason ?? '');
  const area = useRef<HTMLTextAreaElement>(null);
  const diff = useMemo(() => changes(a, f, monuments), [a, f, monuments]);
  const dirty = Object.keys(diff).length > 0;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF(prev => ({ ...prev, [k]: v }));
  const bodyKey = lang === 'tr' ? 'body_tr' : 'body_en';
  const body = f[bodyKey];

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function run(job: () => Promise<unknown>, message: string, after?: () => void) {
    setBusy(true);
    try { await job(); notify(message); after?.(); onSaved(); }
    catch (e) { const m = (e as Error).message; setIssues([m]); notify(m, true); }
    finally { setBusy(false); }
  }
  function save(status?: ArticleStatus, reject_reason?: string) {
    const publishing = (status ?? a.status) === 'published';
    const list = articleIssues(f, publishing);
    setIssues(list);
    if (list.length) return;
    const body: ArticleFields = { ...diff, ...(status ? { status } : {}), ...(reject_reason ? { reject_reason } : {}) };
    if (!Object.keys(body).length) return;
    const message = status === 'published' ? 'Makale yayında.' : status === 'rejected' ? 'Makale reddedildi; gönderen gerekçeyi görecek.'
      : status === 'draft' ? 'Makale yayından kaldırıldı (taslak).' : status === 'pending' ? 'Makale onay kuyruğuna geri alındı.' : 'Kaydedildi.';
    run(() => api.updateArticle(a.id, body), message);
  }
  // Ara başlık ya da alıntıyı imlecin bulunduğu paragrafa uygular
  function mark(prefix: '## ' | '> ') {
    const el = area.current;
    if (!el) return;
    const start = el.selectionStart, text = el.value;
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    const next = text.slice(0, lineStart) + (text.startsWith(prefix, lineStart) ? text.slice(lineStart + prefix.length) : prefix + text.slice(lineStart));
    set(bodyKey, next);
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = start + (next.length - text.length); });
  }
  const move = (i: number, step: number) => setMonuments(list => { const n = [...list]; [n[i], n[i + step]] = [n[i + step], n[i]]; return n; });
  const visitor = a.origin === 'visitor';
  const siteUrl = `/#/makale/${a.slug}`;

  return <>
    <BackLink />
    <PageHead kicker={`${ARTICLE_ORIGIN_LABELS[a.origin].toLocaleUpperCase('tr-TR')} · ${ARTICLE_KIND_LABELS[a.kind].toLocaleUpperCase('tr-TR')}`}
      title={f.title_tr || 'Başlıksız makale'} actions={<>
        <ArticleStatusBadge value={a.status} />
        {a.status === 'published' && <a className="text-link" href={siteUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Sitede aç</a>}
        <button className="button dark" disabled={busy || !dirty} onClick={() => save()}><Save size={16} /> {dirty ? 'Kaydet' : 'Kaydedildi'}</button></>}>
      {a.byline} · {readingMinutes(f.body_tr)} dk okuma · son değişiklik {formatDate(a.updated_at)}{a.published_at ? ` · ilk yayın ${formatDate(a.published_at)}` : ''}
    </PageHead>
    <Issues list={issues} />
    <div className="article-editor">
      <div className="admin-form">
        <fieldset><legend>Başlık ve özet</legend><div className="admin-grid">
          <Field label="Başlık (Türkçe)" wide><input maxLength={160} value={f.title_tr} onChange={e => set('title_tr', e.target.value)} /></Field>
          <Field label="Özet (Türkçe)" wide hint={`Liste kartında ve paylaşımda görünür. Boşsa ilk paragrafın başı kullanılır. ${f.summary_tr.length}/400`}>
            <textarea rows={2} maxLength={400} value={f.summary_tr} onChange={e => set('summary_tr', e.target.value)} /></Field>
          <Field label="Başlık (İngilizce)" hint="İngilizce başlık ve metin birlikte yazılırsa İngilizce sitede gösterilir."><input maxLength={160} value={f.title_en} onChange={e => set('title_en', e.target.value)} /></Field>
          <Field label="Özet (İngilizce)"><textarea rows={2} maxLength={400} value={f.summary_en} onChange={e => set('summary_en', e.target.value)} /></Field>
        </div></fieldset>

        <fieldset className="article-writer"><legend>Metin</legend>
          <div className="writer-bar">
            <div className="segmented" role="tablist" aria-label="Metin dili">
              <button role="tab" aria-selected={lang === 'tr'} onClick={() => setLang('tr')}>Türkçe</button>
              <button role="tab" aria-selected={lang === 'en'} onClick={() => setLang('en')}>İngilizce{f.body_en ? '' : ' (boş)'}</button></div>
            <button type="button" className="button line small" onClick={() => mark('## ')} title="İmlecin bulunduğu satırı ara başlık yapar"><Heading2 size={15} /> Ara başlık</button>
            <button type="button" className="button line small" onClick={() => mark('> ')} title="İmlecin bulunduğu paragrafı alıntı yapar"><Quote size={15} /> Alıntı</button>
            <div className="segmented" role="group" aria-label="Görünüm">
              {(['write', 'split', 'preview'] as const).map(v => <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>{{ write: 'Yaz', split: 'Yan yana', preview: 'Önizle' }[v]}</button>)}</div>
            <small>{wordCount(body).toLocaleString('tr-TR')} sözcük · {readingMinutes(body)} dk</small>
          </div>
          <div className={`writer-panes ${view}`}>
            {view !== 'preview' && <label className="admin-field"><span className="sr-only">Makale metni ({lang === 'tr' ? 'Türkçe' : 'İngilizce'})</span>
              <textarea ref={area} className="writer-area" value={body} onChange={e => set(bodyKey, e.target.value)} spellCheck lang={lang}
                placeholder={'Paragrafları boş bir satırla ayırın.\n\n## Ara başlık\n\n> Alıntı paragrafı'} /></label>}
            {view !== 'write' && <div className="writer-preview" aria-label="Önizleme"><h2>{(lang === 'en' ? f.title_en : f.title_tr) || 'Başlık'}</h2><ArticleBody body={body} /></div>}
          </div>
          <p className="admin-help">Biçim: boş satır yeni paragraf, <code>## </code> ile başlayan satır ara başlık, <code>&gt; </code> ile başlayan paragraf alıntı. Kitap metninde yalnızca biçim ve yazım düzeltin; tarihî bilgi eklemeyin.</p>
        </fieldset>

        <fieldset><legend>Bağlı eserler ({monuments.length})</legend>
          <p className="admin-help">Makalenin sonunda kart olarak gösterilir; yayında olmayan eserler sitede görünmez. İlk eserin kapak fotoğrafı, makalenin kendi kapağı yoksa kapak olur.</p>
          <ol className="route-stops">{monuments.map((m, i) => <li key={m.slug}>
            <span><strong>{m.name_tr}</strong> <small>{m.city}{m.pilot ? ' · pilot' : ''}{m.review_status !== 'published' ? ' · yayında değil' : ''}</small></span>
            <button type="button" className="icon-button" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`${m.name_tr}: yukarı taşı`}><ArrowUp size={15} /></button>
            <button type="button" className="icon-button" disabled={i === monuments.length - 1} onClick={() => move(i, 1)} aria-label={`${m.name_tr}: aşağı taşı`}><ArrowDown size={15} /></button>
            <button type="button" className="icon-button" onClick={() => setMonuments(monuments.filter(x => x.slug !== m.slug))} aria-label={`${m.name_tr}: çıkar`}><X size={15} /></button>
          </li>)}</ol>
          <MonumentPicker label="Eser ekle" city={f.city || undefined} onPick={m => setMonuments(list => list.some(x => x.slug === m.slug) ? list
            : [...list, { slug: m.slug, name_tr: m.name_tr, city: m.city, review_status: m.review_status, pilot: Boolean(m.pilot) }])} />
        </fieldset>
      </div>

      <aside className="article-side">
        <section className="side-card"><h2>Yayın</h2>
          <p className="side-status"><ArticleStatusBadge value={a.status} />{a.reviewed_by && <small>{a.reviewed_by}, {formatDate(a.reviewed_at)}</small>}</p>
          {a.status === 'rejected' && a.reject_reason && <p className="admin-help">Gerekçe: {a.reject_reason}</p>}
          {rejecting ? <div className="contrib-reject">
            <Field label="Red gerekçesi (gönderen görür)"><textarea rows={3} maxLength={400} autoFocus value={reason} onChange={e => setReason(e.target.value)} /></Field>
            <div className="admin-actions"><button className="button dark small" disabled={busy || reason.trim().length < 3} onClick={() => { save('rejected', reason.trim()); setRejecting(false); }}>Reddet</button>
              <button className="text-link" onClick={() => setRejecting(false)}>Vazgeç</button></div>
          </div> : <div className="side-actions">
            {a.status !== 'published' && <button className="button gold" disabled={busy} onClick={() => save('published')}><Eye size={16} /> {dirty ? 'Kaydet ve yayına al' : 'Yayına al'}</button>}
            {a.status === 'published' && <button className="button line" disabled={busy} onClick={() => save('draft')}><EyeOff size={16} /> Yayından kaldır</button>}
            {visitor && a.status !== 'rejected' && <button className="button line danger" disabled={busy} onClick={() => setRejecting(true)}><X size={16} /> Reddet</button>}
            {visitor && a.status !== 'pending' && <button className="text-link" disabled={busy} onClick={() => save('pending')}><RotateCcw size={14} /> Onay kuyruğuna al</button>}
          </div>}
          {visitor && <p className="admin-help">Ziyaretçi yazısını yayımlamadan önce düzeltebilirsiniz. Yayındaki yazıyı gönderen değiştiremez, yalnızca geri çekebilir.</p>}
        </section>

        {visitor && <section className="side-card"><h2><UserRound size={17} /> Gönderen</h2>
          <p>{a.user_deleted ? 'Silinmiş hesap' : a.user_name || 'Takma adsız ziyaretçi'}</p>
          <small className="admin-help">Gönderim {formatDate(a.created_at)}</small></section>}

        <CoverCard article={a} alt={f.cover_alt} setAlt={v => set('cover_alt', v)} onSaved={onSaved} />

        <section className="side-card"><h2>Ayrıntılar</h2>
          <div className="choice-row compact" role="radiogroup" aria-label="Tür">{Object.entries(ARTICLE_KIND_LABELS).map(([k, l]) =>
            <label key={k} className={f.kind === k ? 'on' : ''}><input type="radio" name="kind" checked={f.kind === k} onChange={() => set('kind', k as ArticleKind)} />{l}</label>)}</div>
          <Field label="Şehir"><select value={f.city} onChange={e => set('city', e.target.value)}><option value="">Şehre bağlı değil</option>
            {cities.map(c => <option key={c.slug} value={c.slug}>{c.name_tr}</option>)}</select></Field>
          <Field label="Yazarlar" hint="Virgülle ayırın. Boşsa “EŞİK editörleri” (ziyaretçide takma adı)."><input value={f.authors} onChange={e => set('authors', e.target.value)} /></Field>
          <Field label="Adres" hint={`Sitede: #/makale/${f.slug || '…'}`}><input value={f.slug} onChange={e => set('slug', e.target.value)} /></Field>
          <label className="pilot-toggle"><input type="checkbox" checked={f.featured} onChange={e => set('featured', e.target.checked)} /><Star size={14} /> Öne çıkan (listenin başında)</label>
        </section>

        <section className="side-card"><h2><BookOpen size={17} /> Kaynak</h2>
          {a.origin === 'book' && <p className="admin-help">{a.book_title} · “{a.section_title}”{a.source_paras ? ` · paragraf ${a.source_paras[0] + 1}–${a.source_paras[1] + 1}` : ''}</p>}
          <Field label="Kaynak notu" hint="Makalenin sonunda kaynakça olarak görünür."><textarea rows={2} maxLength={400} value={f.source_note} onChange={e => set('source_note', e.target.value)} /></Field>
          <div className="inline-pair"><Field label="Sayfa (ilk)"><input inputMode="numeric" value={f.page_start} onChange={e => set('page_start', e.target.value.replace(/\D/g, ''))} /></Field>
            <Field label="Sayfa (son)"><input inputMode="numeric" value={f.page_end} onChange={e => set('page_end', e.target.value.replace(/\D/g, ''))} /></Field></div>
        </section>

        <section className="side-card danger-zone"><button className="text-link danger" disabled={busy} onClick={() => {
          if (confirm(`“${a.title_tr}” kalıcı olarak silinsin mi? Bu geri alınamaz.${a.origin === 'book' ? ' Kitap metni etkilenmez; aynı paragrafları yeniden içe aktarabilirsiniz.' : ''}`))
            run(() => api.deleteArticle(a.id), 'Makale silindi.', () => navigate('/makaleler'));
        }}><Trash2 size={14} /> Makaleyi sil</button></section>
      </aside>
    </div>
    {dirty && <div className="save-bar" role="status"><span>Kaydedilmemiş değişiklikler var.</span>
      <button className="text-link" onClick={() => { setF(formOf(a)); setMonuments(a.monuments); setIssues([]); }}>Geri al</button>
      <button className="button gold small" disabled={busy} onClick={() => save()}><Check size={15} /> Kaydet</button></div>}
  </>;
}

function CoverCard({ article: a, alt, setAlt, onSaved }: { article: Article; alt: string; setAlt: (v: string) => void; onSaved: () => void }) {
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  async function upload(file: File) {
    setBusy(true);
    try { await api.uploadArticleCover(a.id, file, alt); notify('Kapak fotoğrafı yüklendi.'); onSaved(); }
    catch (e) { notify((e as Error).message, true); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  }
  return <section className="side-card"><h2><ImagePlus size={17} /> Kapak</h2>
    {a.cover ? <figure className="cover-preview"><img src={a.cover.thumb} alt={a.cover.alt} /><figcaption>{a.cover.own ? 'Makalenin kapağı' : 'İlk bağlı eserin fotoğrafı (kendi kapağı yok)'}</figcaption></figure>
      : <p className="admin-help">Kapak yok: sitede desenli bir kapak gösterilir. Fotoğraf yükleyin ya da fotoğraflı bir eser bağlayın.</p>}
    <Field label="Kapak açıklaması (alt metin)"><input maxLength={300} value={alt} onChange={e => setAlt(e.target.value)} placeholder="Fotoğrafta ne görünüyor?" /></Field>
    <div className="admin-actions">
      <label className="button line small file-button"><ImagePlus size={15} /> {busy ? 'Yükleniyor…' : a.cover?.own ? 'Kapağı değiştir' : 'Fotoğraf yükle'}
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (file) upload(file); }} /></label>
      {a.cover?.own && <button className="text-link danger" disabled={busy} onClick={async () => {
        setBusy(true);
        try { await api.removeArticleCover(a.id); notify('Kapak kaldırıldı.'); onSaved(); } catch (e) { notify((e as Error).message, true); } finally { setBusy(false); }
      }}>Kaldır</button>}
    </div>
    <small className="admin-help">JPEG, PNG ya da WebP · en çok 10 MB. Konum bilgisi kaydedilmeden önce silinir.</small>
  </section>;
}
