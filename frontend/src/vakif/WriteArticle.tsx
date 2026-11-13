import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Check, Eye, Heading2, ImagePlus, PenLine, Quote, Send, X } from 'lucide-react';
import { Link } from '../lib/navigation';
import { t } from '../lib/i18n';
import { articlesApi, type ArticleKind, type MyArticle } from '../lib/articlesApi';
import { articleBlocks, fold, readingMinutes, submissionIssues, wordCount } from '../lib/articleText';
import { vakifApiEnabled, vakifItem } from '../lib/vakifApi';
import { useAccount } from '../lib/account';
import { useContent } from '../lib/contentStore';
import { track } from '../lib/analytics';
import { Scene } from '../components/UI';
import { kindNames } from './ArticleParts';

type Draft = { kind: ArticleKind; title: string; summary: string; body: string; city: string; monuments: string[]; cover_alt: string };
const EMPTY: Draft = { kind: 'heritage', title: '', summary: '', body: '', city: '', monuments: [], cover_alt: '' };
const DRAFT_KEY = 'tackapi-article-draft';
const kindNotes = (): Record<ArticleKind, string> => ({
  city_history: t('Bir şehrin ya da semtin geçmişi, vakıflarla şekillenen hayatı.', 'The past of a city or quarter, its life shaped by foundations.'),
  heritage: t('Bir caminin, hanın, çeşmenin ya da külliyenin hikâyesi.', 'The story of a mosque, han, fountain or complex.'),
  culture: t('Vakıf geleneği, imaret, mahalle dayanışması, gündelik hayat.', 'The waqf tradition, soup kitchens, neighbourhood solidarity, daily life.'),
});

function readDraft(): Draft | null {
  try { const raw = localStorage.getItem(DRAFT_KEY); return raw ? { ...EMPTY, ...JSON.parse(raw) } : null; } catch { return null; }
}
function saveDraft(d: Draft | null) {
  try { if (d) localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); else localStorage.removeItem(DRAFT_KEY); } catch { /* storage closed */ }
}

/** /makale-yaz (and ?duzenle=<id>): a visitor writes an article; it waits for an editor's approval. */
export function WriteArticlePage({ query }: { query: string }) {
  const editId = Number(new URLSearchParams(query).get('duzenle')) || null;
  const { user, ready } = useAccount();
  const [existing, setExisting] = useState<MyArticle | null | 'missing'>(null);
  useEffect(() => {
    if (!user || !editId) return;
    articlesApi.mine().then(list => setExisting(list.find(a => a.id === editId) ?? 'missing'), () => setExisting('missing'));
  }, [user, editId]);
  if (!vakifApiEnabled()) return <Scene className="rr-scene"><div className="page-shell rr-shell"><div className="rr-empty"><h2>{t('Yazı göndermek arka uç bağlantısıyla açılır.', 'Sending articles needs the backend connection.')}</h2></div></div></Scene>;
  if (!ready) return <div className="page-shell loading-state" role="status">…</div>;
  if (!user) return <Scene className="rr-scene"><div className="page-shell rr-shell rr-write-gate">
    <p className="eyebrow"><span />{t('YAZI GÖNDER', 'SEND AN ARTICLE')}</p>
    <h1>{t('Hikâyeni', 'Tell your')} <em>{t('anlat.', 'story.')}</em></h1>
    <p className="rr-lede">{t('Bildiğin bir eserin, büyüdüğün mahallenin ya da bir vakıf geleneğinin hikâyesini yaz. Editörlerimiz okuyup onaylayınca “Makaleler” sayfasında takma adınla yayımlanır.',
      'Write the story of a work you know, the quarter you grew up in or a waqf tradition. Once our editors read and approve it, it is published on the “Articles” page under your nickname.')}</p>
    <Link className="button dark" to={`/giris?sonra=${encodeURIComponent('/makale-yaz')}`}>{t('Giriş yap ya da hesap aç', 'Sign in or open an account')}</Link>
  </div></Scene>;
  if (editId && existing === null) return <div className="page-shell loading-state" role="status">{t('Yazın açılıyor…', 'Opening your article…')}</div>;
  if (editId && existing === 'missing') return <Scene className="rr-scene"><div className="page-shell rr-shell"><div className="rr-empty"><h2>{t('Bu yazı bulunamadı.', 'This article could not be found.')}</h2><Link className="text-link" to="/hesabim">{t('Hesabım', 'My account')}</Link></div></div></Scene>;
  return <Writer key={editId ?? 'new'} existing={existing && existing !== 'missing' ? existing : null} />;
}

function Writer({ existing }: { existing: MyArticle | null }) {
  const { artifacts } = useContent();
  const [d, setD] = useState<Draft>(() => existing ? { kind: existing.kind, title: existing.title, summary: existing.summary ?? '', body: existing.body,
    city: existing.city ?? '', monuments: existing.monuments.map(m => m.slug), cover_alt: existing.cover?.alt ?? '' } : readDraft() ?? EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(existing?.cover?.thumb ?? null);
  const [dropCover, setDropCover] = useState(false);
  const [view, setView] = useState<'write' | 'preview'>('write');
  const [issues, setIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<MyArticle | null>(null);
  const [pick, setPick] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD(p => ({ ...p, [k]: v }));
  useEffect(() => { if (!existing && !sent) saveDraft(d); }, [d, existing, sent]);
  useEffect(() => () => { if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview); }, [preview]);
  const cities = useMemo(() => {
    const out = new Map<string, string>();
    for (const a of artifacts) { const c = vakifItem(a.slug)?.city; if (c) out.set(c.slug, c.name); }
    return [...out].sort((a, b) => a[1].localeCompare(b[1], 'tr'));
  }, [artifacts]);
  const matches = useMemo(() => {
    const needle = fold(pick.trim());
    if (needle.length < 2) return [];
    return artifacts.filter(a => !d.monuments.includes(a.slug) && fold(`${a.name} ${a.city}`).includes(needle)).slice(0, 6);
  }, [pick, artifacts, d.monuments]);
  const chars = d.body.trim().length;
  function mark(prefix: '## ' | '> ') {
    const el = area.current;
    if (!el) return;
    const start = el.selectionStart, text = el.value, lineStart = text.lastIndexOf('\n', start - 1) + 1;
    const next = text.slice(0, lineStart) + (text.startsWith(prefix, lineStart) ? text.slice(lineStart + prefix.length) : prefix + text.slice(lineStart));
    set('body', next);
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = start + (next.length - text.length); });
  }
  function chooseFile(f: File | null) {
    if (f && f.size > 10 * 1024 * 1024) { setIssues([t('Fotoğraf en çok 10 MB olabilir.', 'The photo can be at most 10 MB.')]); return; }
    setFile(f); setDropCover(false);
    setPreview(f ? URL.createObjectURL(f) : null);
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    const list = submissionIssues(d, t);
    setIssues(list);
    if (list.length) { document.getElementById('rr-issues')?.focus(); return; }
    setBusy(true);
    try {
      const body = { ...d, file, remove_cover_file: dropCover && !file };
      const out = existing ? await articlesApi.update(existing.id, body) : await articlesApi.submit(body);
      track('article_submit', undefined, { kind: d.kind, edit: Boolean(existing) });
      if (!existing) saveDraft(null);
      setSent(out); window.scrollTo({ top: 0 });
    } catch (err) { setIssues([(err as Error).message]); } finally { setBusy(false); }
  }
  if (sent) return <Scene className="rr-scene"><div className="page-shell rr-shell rr-sent" role="status">
    <span className="rr-sent-mark" aria-hidden="true"><Check size={30} /></span>
    <h1>{t('Yazın', 'Your article')} <em>{t('ulaştı.', 'has arrived.')}</em></h1>
    <p className="rr-lede">{t(`“${sent.title}” editörlerimizin onayını bekliyor. Onaylanınca “Makaleler” sayfasında yayımlanır; durumunu “Hesabım” sayfasından izleyebilirsin.`,
      `“${sent.title}” is waiting for our editors’ approval. Once approved it is published on the “Articles” page; you can follow it on the “My account” page.`)}</p>
    <div className="v-actions"><Link className="button dark" to="/hesabim">{t('Yazılarım', 'My articles')}</Link><Link className="text-link" to="/makaleler">{t('Makalelere dön', 'Back to the articles')}</Link></div>
  </div></Scene>;
  const blocks = articleBlocks(d.body);
  return <Scene className="rr-scene"><div className="page-shell rr-shell rr-write">
    <Link className="rr-back dark" to={existing ? '/hesabim' : '/makaleler'}><ArrowLeft size={15} aria-hidden="true" /> {existing ? t('Hesabım', 'My account') : t('Makaleler', 'Articles')}</Link>
    <header className="rr-write-head">
      <p className="eyebrow"><span />{existing ? t('YAZINI DÜZENLE', 'EDIT YOUR ARTICLE') : t('YAZI GÖNDER', 'SEND AN ARTICLE')}</p>
      <h1>{t('Hikâyeni', 'Tell your')} <em>{t('anlat.', 'story.')}</em></h1>
      {existing?.status === 'rejected' && existing.reject_reason && <p className="rr-note warn">{t('Editör notu', 'Editor’s note')}: {existing.reject_reason}</p>}
    </header>
    <form className="rr-write-grid" onSubmit={submit} noValidate>
      <div className="rr-write-main v-form">
        {issues.length > 0 && <div id="rr-issues" className="rr-issues" role="alert" tabIndex={-1}><b>{t('Göndermeden önce:', 'Before sending:')}</b><ul>{issues.map(i => <li key={i}>{i}</li>)}</ul></div>}
        <fieldset className="rr-kinds"><legend>{t('Ne hakkında yazıyorsun?', 'What are you writing about?')}</legend>
          {(Object.keys(kindNames()) as ArticleKind[]).map(k => <label key={k} className={d.kind === k ? 'on' : ''}>
            <input type="radio" name="kind" checked={d.kind === k} onChange={() => set('kind', k)} /><b>{kindNames()[k]}</b><small>{kindNotes()[k]}</small></label>)}
        </fieldset>
        <label className="v-field"><span>{t('Başlık', 'Title')}</span><input className="rr-title-input" maxLength={160} value={d.title} onChange={e => set('title', e.target.value)}
          placeholder={t('ör. Muradiye’de Bir Sabah', 'e.g. A Morning at Muradiye')} /><small>{d.title.length} / 160</small></label>
        <label className="v-field"><span>{t('Kısa özet (isteğe bağlı)', 'Short summary (optional)')}</span><textarea rows={2} maxLength={400} value={d.summary} onChange={e => set('summary', e.target.value)}
          placeholder={t('Listede başlığın altında görünecek bir iki cümle.', 'One or two sentences shown under the title in the list.')} /><small>{d.summary.length} / 400</small></label>
        <div className="v-field rr-editor">
          <span id="rr-body-label">{t('Metin', 'Text')}</span>
          <div className="rr-editor-bar">
            <div className="rr-seg" role="tablist" aria-label={t('Görünüm', 'View')}>
              <button type="button" role="tab" aria-selected={view === 'write'} onClick={() => setView('write')}><PenLine size={14} aria-hidden="true" /> {t('Yaz', 'Write')}</button>
              <button type="button" role="tab" aria-selected={view === 'preview'} onClick={() => setView('preview')}><Eye size={14} aria-hidden="true" /> {t('Önizle', 'Preview')}</button></div>
            {view === 'write' && <><button type="button" className="rr-tool" onClick={() => mark('## ')}><Heading2 size={15} aria-hidden="true" /> {t('Ara başlık', 'Subheading')}</button>
              <button type="button" className="rr-tool" onClick={() => mark('> ')}><Quote size={15} aria-hidden="true" /> {t('Alıntı', 'Quote')}</button></>}
            <small className={chars < 400 ? 'short' : ''}>{chars < 400 ? t(`${400 - chars} karakter daha`, `${400 - chars} more characters`) : t(`${wordCount(d.body)} sözcük · ${readingMinutes(d.body)} dk`, `${wordCount(d.body)} words · ${readingMinutes(d.body)} min`)}</small>
          </div>
          {view === 'write' ? <textarea ref={area} aria-labelledby="rr-body-label" className="rr-body-input" value={d.body} onChange={e => set('body', e.target.value)} maxLength={40000}
            placeholder={t('Paragrafları boş bir satırla ayır.\n\nAra başlık için satırın başına ## yaz.\n\nBildiklerini kaynağıyla anlat; kitaptan ya da bir kaynaktan aldığın bilgiyi belirt.', 'Separate paragraphs with a blank line.\n\nStart a line with ## for a subheading.\n\nTell what you know with its source.')} />
            : <div className="rr-body rr-body-preview">{blocks.length ? blocks.map((b, i) => b.type === 'h' ? <h2 key={i}>{b.text}</h2> : b.type === 'q' ? <blockquote key={i}>{b.text}</blockquote> : <p key={i}>{b.text}</p>)
              : <p className="rr-muted">{t('Önizlenecek metin yok.', 'There is no text to preview.')}</p>}</div>}
        </div>
      </div>
      <aside className="rr-write-side">
        <section className="rr-panel"><h2>{t('Kapak fotoğrafı', 'Cover photo')}</h2>
          {preview && !dropCover ? <figure className="rr-cover-pick"><img src={preview} alt="" /><button type="button" onClick={() => { if (file) chooseFile(null); else { setDropCover(true); } }} aria-label={t('Fotoğrafı kaldır', 'Remove the photo')}><X size={16} /></button></figure> : null}
          <label className="rr-file"><ImagePlus size={17} aria-hidden="true" /> {preview && !dropCover ? t('Başka fotoğraf seç', 'Choose another photo') : t('Fotoğraf seç (isteğe bağlı)', 'Choose a photo (optional)')}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => chooseFile(e.target.files?.[0] ?? null)} /></label>
          {(file || (preview && !dropCover)) && <label className="v-field"><span>{t('Fotoğrafta ne var?', 'What is in the photo?')}</span><input maxLength={300} value={d.cover_alt} onChange={e => set('cover_alt', e.target.value)} /></label>}
          <small className="v-note">{t('Kendi çektiğin bir fotoğraf olsun. Konum bilgisi kaydedilmeden silinir. Fotoğraf yoksa bağladığın eserin fotoğrafı kullanılır.', 'Use a photo you took yourself. Location data is removed before saving. Without one, the photo of a linked work is used.')}</small>
        </section>
        <section className="rr-panel"><h2>{t('Şehir ve eserler', 'City and works')}</h2>
          <label className="v-field"><span>{t('Şehir', 'City')}</span><select value={d.city} onChange={e => set('city', e.target.value)}><option value="">{t('Belirli bir şehir değil', 'Not a particular city')}</option>
            {cities.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}</select></label>
          <div className="v-field"><span>{t('Yazıda geçen eserler', 'Works in your article')}</span>
            {d.monuments.length > 0 && <ul className="rr-picked">{d.monuments.map(s => <li key={s}>{artifacts.find(a => a.slug === s)?.name ?? s}
              <button type="button" aria-label={t('Çıkar', 'Remove')} onClick={() => set('monuments', d.monuments.filter(x => x !== s))}><X size={13} /></button></li>)}</ul>}
            <input type="search" value={pick} onChange={e => setPick(e.target.value)} placeholder={t('Eser adı yaz…', 'Type a work’s name…')} aria-label={t('Eser ara', 'Search a work')} />
            {matches.length > 0 && <ul className="rr-matches">{matches.map(a => <li key={a.slug}><button type="button" onClick={() => { set('monuments', [...d.monuments, a.slug].slice(0, 30)); setPick(''); }}>
              <b>{a.name}</b><small>{a.city}</small></button></li>)}</ul>}
          </div>
        </section>
        <section className="rr-panel rr-guide"><h2>{t('Yazarken', 'While writing')}</h2><ul>
          <li>{t('Bildiğini anlat, uydurma: tarih ve ad verirken kaynağını yaz.', 'Tell what you know, do not invent: give the source for dates and names.')}</li>
          <li>{t('Başkasına ait metni kopyalama; alıntıyı “>” ile belirt.', 'Do not copy someone else’s text; mark quotes with “>”.')}</li>
          <li>{t('Kişisel bilgi (telefon, adres) paylaşma.', 'Do not share personal details (phone, address).')}</li>
          <li>{t('Editörler yazını yayımlamadan önce düzeltebilir.', 'Editors may correct your article before publishing it.')}</li></ul>
          {!existing && <small className="v-note">{t('Taslağın bu tarayıcıda kendiliğinden saklanır.', 'Your draft is saved in this browser automatically.')}</small>}
        </section>
        <button className="button gold rr-send" disabled={busy}><Send size={17} aria-hidden="true" /> {busy ? t('Gönderiliyor…', 'Sending…') : existing ? t('Düzeltip yeniden gönder', 'Send it again') : t('Onaya gönder', 'Send for approval')}</button>
        {!existing && (d.title || d.body) && <button type="button" className="text-link rr-clear" onClick={() => { if (confirm(t('Taslak silinsin mi?', 'Delete the draft?'))) { setD(EMPTY); saveDraft(null); } }}>{t('Taslağı temizle', 'Clear the draft')}</button>}
      </aside>
    </form>
  </div></Scene>;
}

/** Hesabım → "Yazıların ve terim önerilerin". */
export function MyWriting() {
  const [articles, setArticles] = useState<MyArticle[] | null>(null);
  const [terms, setTerms] = useState<Awaited<ReturnType<typeof articlesApi.myTerms>>>([]);
  const [error, setError] = useState('');
  const load = () => { articlesApi.mine().then(setArticles, e => { setArticles([]); setError((e as Error).message); }); articlesApi.myTerms().then(setTerms, () => {}); };
  useEffect(load, []);
  const STATUS = { draft: t('Taslak', 'Draft'), pending: t('Onay bekliyor', 'Awaiting review'), published: t('Yayında', 'Published'), rejected: t('Düzeltme istendi', 'Changes requested') };
  async function withdraw(id: number, published: boolean) {
    if (!confirm(published ? t('Yazı yayından kalkacak ve silinecek. Emin misin?', 'The article will be taken down and deleted. Are you sure?') : t('Yazı geri çekilsin mi?', 'Withdraw the article?'))) return;
    try { await articlesApi.withdraw(id); load(); } catch (e) { setError((e as Error).message); }
  }
  return <section className="v-section rr-mine"><h2>{t('Yazıların ve terim önerilerin', 'Your articles and term suggestions')}</h2>
    <div className="v-actions"><Link className="button line" to="/makale-yaz"><PenLine size={16} aria-hidden="true" /> {t('Yazı gönder', 'Send an article')}</Link><Link className="text-link" to="/terimler">{t('Terim öner', 'Suggest a term')}</Link></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {articles && !articles.length && !terms.length && <p className="v-note">{t('Henüz yazı ya da terim önerin yok.', 'You have no articles or term suggestions yet.')}</p>}
    {articles && articles.length > 0 && <ul className="v-list rr-mine-list">{articles.map(a => <li key={a.id}>
      <span><b>{a.title}</b><small>{kindNames()[a.kind]}</small></span><strong className={`v-status ${a.status === 'published' ? 'approved' : a.status}`}>{STATUS[a.status]}</strong>
      {a.status === 'rejected' && a.reject_reason && <small>{t('Editör notu', 'Editor’s note')}: {a.reject_reason}</small>}
      <span className="rr-mine-actions">{a.status === 'published' ? <Link className="text-link" to={`/makale/${a.slug}`}>{t('Oku', 'Read')}</Link>
        : <Link className="text-link" to={`/makale-yaz?duzenle=${a.id}`}>{t('Düzenle', 'Edit')}</Link>}
        <button className="text-link danger" onClick={() => withdraw(a.id, a.status === 'published')}>{t('Geri çek', 'Withdraw')}</button></span>
    </li>)}</ul>}
    {terms.length > 0 && <><h3 className="rr-mine-sub">{t('Terim önerilerin', 'Your term suggestions')}</h3><ul className="v-list rr-mine-list">{terms.map(x => <li key={x.id}>
      <span><b>{x.term}</b><small>{x.definition}</small></span><strong className={`v-status ${x.status === 'published' ? 'approved' : x.status}`}>{STATUS[x.status]}</strong>
      {x.status === 'rejected' && x.reject_reason && <small>{t('Editör notu', 'Editor’s note')}: {x.reject_reason}</small>}
      {x.status !== 'published' && <span className="rr-mine-actions"><button className="text-link danger" onClick={async () => { await articlesApi.withdrawTerm(x.id).catch(() => {}); load(); }}>{t('Geri çek', 'Withdraw')}</button></span>}
    </li>)}</ul></>}
  </section>;
}
