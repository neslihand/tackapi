import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, Circle, Eye, Monitor, Pencil, Rocket, Smartphone, Sparkles } from 'lucide-react';
import { api, getToken } from '../lib/api';
import { Link, replaceQuery } from '../lib/navigation';
import { useLoad, useToast } from '../components/UI';
import type { Lang, NarrationMode, Preview } from '../public/model';
import '../public/public.css';

const MODE_LABEL: Record<NarrationMode, string> = { story: 'Hikâye anlatımı', child: 'Çocuk anlatımı' };

// The site the preview shows: its own work page (frontend/src/vakif/PreviewWork.tsx), so the preview is always the
// site's current design. The same address in the single-server demo (/), the site's dev server otherwise.
const SITE = String(import.meta.env.VITE_SITE_URL ?? '').trim() || (import.meta.env.DEV ? 'http://127.0.0.1:5173/' : '/');
const siteOrigin = () => new URL(SITE, location.href).origin;
const siteUrl = (slug: string, query: Record<string, string | null>) =>
  `${SITE.replace(/#.*$/, '')}#/onizleme/${encodeURIComponent(slug)}?${new URLSearchParams(Object.entries(query).filter((e): e is [string, string] => e[1] !== null))}`;

/** The site's preview page asks for the panel's key (it cannot read this tab's session from another address); it is
 *  sent only to the site's own address. */
function useHandKeyToSite(onCardHeight: (height: number) => void) {
  useEffect(() => {
    const answer = (e: MessageEvent) => {
      if (e.origin !== siteOrigin()) return;
      if (e.data?.type === 'esik:preview-height' && typeof e.data.height === 'number') onCardHeight(Math.min(900, Math.max(200, e.data.height)));
      if (e.data?.type !== 'esik:preview-ready') return;
      (e.source as Window | null)?.postMessage({ type: 'esik:preview-token', token: getToken() }, siteOrigin());
    };
    window.addEventListener('message', answer);
    return () => window.removeEventListener('message', answer);
  }, [onCardHeight]);
}

/** Eserin ziyaretçiye nasıl görüneceği: taslakken de. Sayfa sitenin kendisi çizer (masaüstü ve telefon genişliğinde). */
export function PreviewPage({ slug, params }: { slug: string; params: URLSearchParams }) {
  const [lang, setLang] = useState<Lang>(params.get('lang') === 'en' ? 'en' : 'tr');
  const [drafts, setDrafts] = useState(params.get('drafts') === '1');
  const [mobile, setMobile] = useState(params.get('cihaz') === 'mobil');
  const [publishing, setPublishing] = useState(false);
  const [version, setVersion] = useState(0);   // a saved change draws the site's frames again
  const [cardHeight, setCardHeight] = useState(480);
  const notify = useToast();
  useHandKeyToSite(setCardHeight);
  const data = useLoad(() => api.preview(slug, lang, drafts), [slug, lang, drafts, version]);
  useEffect(() => { replaceQuery(`/onizleme/${encodeURIComponent(slug)}`, { lang: lang === 'en' ? 'en' : null, drafts: drafts ? 1 : null, cihaz: mobile ? 'mobil' : null }); }, [slug, lang, drafts, mobile]);
  useEffect(() => { document.title = `Önizleme: ${data.data?.item.name ?? slug} — EŞİK`; }, [data.data, slug]);
  const p = data.data;
  // Hikâye ve çocuk anlatımı bir kez üretilip kaydedilir; ziyaretçi sayfası yalnızca kayıtlı metni gösterir
  async function generate(mode: NarrationMode) {
    const edited = p?.narrations.find(n => n.mode === mode && n.lang === lang && n.edited_by);
    if (edited && !confirm(`Bu anlatım ${edited.edited_by} tarafından elle düzeltilmiş. Yeniden üretilirse düzeltmeler kaybolur. Devam edilsin mi?`)) return;
    const r = await api.generateNarration(slug, { mode, lang });
    const bad = [...r.verification.unsupported_years, ...r.verification.unsupported_names];
    notify(bad.length ? `Anlatım kaydedildi, ancak bağlamda olmayan bilgi içeriyor olabilir: ${bad.join(', ')}. Okuyup gerekirse yeniden üretin.`
      : 'Anlatım üretildi ve kaydedildi; ziyaretçiler artık bu metni görüyor.', bad.length > 0);
    setVersion(v => v + 1);
  }
  // Yazım hatası gibi küçük düzeltmeler için: yapay zekâ çağrılmaz, metin olduğu gibi kaydedilir
  async function edit(mode: NarrationMode, text: string) {
    await api.editNarration(slug, mode, { lang, answer: text });
    notify('Düzeltme kaydedildi; ziyaretçiler artık bu metni görüyor.');
    setVersion(v => v + 1);
  }
  if (data.error) return <div className="content"><p className="form-error" role="alert">{data.error}</p><Link className="text-link" to="/eserler">Eser listesine dön</Link></div>;
  if (!p) return <p role="status" className="content">Önizleme hazırlanıyor…</p>;
  const warnings = (p.narrations ?? []).filter(n => n.lang === lang && (n.stale || n.unsupported.length));

  const published = p.review_status === 'published';
  const missing = p.checks.filter(c => c.required && !c.ok);
  async function publish() {
    if (missing.length && !confirm(`Eksik zorunlu bilgi var: ${missing.map(m => m.label).join(', ')}. Yine de yayına alınsın mı?`)) return;
    setPublishing(true);
    try { await api.updateMonument(slug, { review_status: 'published' }); notify('Eser yayına alındı; artık sitede görünüyor.'); setVersion(v => v + 1); }
    catch (e) { notify((e as Error).message, true); }
    finally { setPublishing(false); }
  }
  const query = { lang, drafts: drafts ? '1' : null, v: String(version) };
  return <div className="preview-page">
    <header className="preview-bar">
      <Link className="text-link" to={`/eser/${encodeURIComponent(slug)}`}><ArrowLeft size={15} /> Düzenlemeye dön</Link>
      <span className={`preview-state ${published ? 'live' : ''}`}><Eye size={15} />{published ? 'Yayında — ziyaretçiler bu sayfayı görüyor' : 'Taslak — bu sayfa henüz sitede görünmüyor'}</span>
      <div className="preview-controls">
        <div className="pv-segmented" role="group" aria-label="Dil">{(['tr', 'en'] as Lang[]).map(l => <button key={l} className={lang === l ? 'active' : ''} aria-pressed={lang === l} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}</div>
        <div className="pv-segmented" role="group" aria-label="Cihaz">
          <button className={!mobile ? 'active' : ''} aria-pressed={!mobile} onClick={() => setMobile(false)}><Monitor size={15} /> Masaüstü</button>
          <button className={mobile ? 'active' : ''} aria-pressed={mobile} onClick={() => setMobile(true)}><Smartphone size={15} /> Mobil</button></div>
        <label className="preview-toggle"><input type="checkbox" checked={drafts} onChange={e => setDrafts(e.target.checked)} /> Onay bekleyen fotoğrafları da göster</label>
        {!published && <button className="button gold small" disabled={publishing} onClick={publish}><Rocket size={15} /> Yayına al</button>}
      </div>
    </header>
    <section className="preview-panel" aria-label="Yayın kontrolü">
      <div><h2>Yayın öncesi kontrol</h2>
        <ul className="preview-checks">{p.checks.map(c => <li key={c.key} className={c.ok ? 'ok' : c.required ? 'missing' : 'optional'}>
          {c.ok ? <Check size={16} aria-label="tamam" /> : c.required ? <AlertTriangle size={16} aria-label="eksik" /> : <Circle size={16} aria-label="isteğe bağlı" />}
          <span><strong>{c.label}</strong>{!c.ok && c.hint && <small>{c.hint}</small>}</span></li>)}</ul>
        {warnings.map(n => <p key={n.mode} className="admin-note" style={{ marginTop: 12 }}>
          <strong>{MODE_LABEL[n.mode]}:</strong> {n.stale ? 'eserin metni anlatım üretildikten sonra değişti. ' : ''}
          {n.unsupported.length ? `Kaynakta doğrulanamayan bilgi: ${n.unsupported.join(', ')}. ` : ''}Aşağıdan düzeltebilir ya da yeniden üretebilirsiniz.</p>)}
        {drafts && <p className="admin-note" style={{ marginTop: 12 }}>Onay bekleyen fotoğraflar “onay bekliyor” etiketiyle gösteriliyor; ziyaretçiler onları görmez.</p>}
        <NarrationTools preview={p} lang={lang} generate={generate} edit={edit} />
      </div>
      <div className="preview-card"><p className="eyebrow"><span />Keşfet listesinde</p>
        <iframe className="preview-card-frame" style={{ height: cardHeight }} key={`card-${lang}-${drafts}-${version}`} title="Keşfet listesindeki kart" src={siteUrl(slug, { ...query, gorunum: 'kart' })} /></div>
    </section>
    {/* the site's own work page; a new key draws it again when a setting or a saved text changes */}
    {mobile
      ? <div className="preview-device"><iframe key={`m-${lang}-${drafts}-${version}`} title="Telefonda önizleme" src={siteUrl(slug, query)} /></div>
      : <div className="preview-frame"><iframe key={`d-${lang}-${drafts}-${version}`} title="Masaüstünde önizleme" src={siteUrl(slug, query)} /></div>}
  </div>;
}

/** The two saved tellings in the language shown: whether each is ready, and generating, regenerating or correcting it.
 *  The visitor's page shows only the saved text; nothing is generated when they open it. */
function NarrationTools({ preview, lang, generate, edit }: { preview: Preview; lang: Lang; generate: (mode: NarrationMode) => Promise<void>; edit: (mode: NarrationMode, text: string) => Promise<void> }) {
  const [busy, setBusy] = useState<NarrationMode | null>(null);
  const [draft, setDraft] = useState<{ mode: NarrationMode; text: string } | null>(null);
  const [error, setError] = useState('');
  async function act(mode: NarrationMode, job: () => Promise<void>) {
    setBusy(mode); setError('');
    try { await job(); setDraft(null); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }
  return <div className="preview-tellings">
    <h2>Anlatımlar</h2>
    <ul>{(['story', 'child'] as NarrationMode[]).map(mode => {
      const text = preview.detail.narrations?.[mode]?.answer ?? '';
      const status = preview.narrations.find(n => n.mode === mode && n.lang === lang);
      const state = !text ? 'Hazırlanmadı' : status?.edited_by ? `Hazır · ${status.edited_by} elle düzeltti` : status?.stale ? 'Hazır · metin değiştiği için eskimiş' : 'Hazır';
      return <li key={mode}>
        <span><strong>{MODE_LABEL[mode]}</strong><small>{state}</small></span>
        {busy === mode ? <span role="status" className="muted">Hazırlanıyor…</span> : <span className="preview-telling-actions">
          {text && <button className="button small" onClick={() => { setDraft({ mode, text }); setError(''); }}><Pencil size={14} /> Metni düzenle</button>}
          <button className={`button small ${text ? '' : 'gold'}`} onClick={() => act(mode, () => generate(mode))}><Sparkles size={14} /> {text ? 'Yeniden üret' : 'Anlatımı üret'}</button>
        </span>}
      </li>;
    })}</ul>
    {draft && <div className="preview-telling-edit">
      <label htmlFor="pv-edit-text">{MODE_LABEL[draft.mode]} — paragrafları boş satırla ayırın</label>
      <textarea id="pv-edit-text" value={draft.text} onChange={e => setDraft({ ...draft, text: e.target.value })} rows={14} disabled={busy !== null} />
      <div className="preview-telling-actions">
        <button className="button gold small" disabled={busy !== null || draft.text.trim().length < 50} onClick={() => act(draft.mode, () => edit(draft.mode, draft.text))}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
        <button className="text-link" disabled={busy !== null} onClick={() => { setDraft(null); setError(''); }}>Vazgeç</button></div>
      <p className="muted">Kaydedilen metin yapay zekâya yeniden yazdırılmaz; ziyaretçiler doğrudan bu metni görür.</p>
    </div>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
