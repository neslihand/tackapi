import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, Circle, Eye, Monitor, Rocket, Smartphone } from 'lucide-react';
import { api } from '../lib/api';
import { Link, replaceQuery } from '../lib/navigation';
import { useLoad, useToast } from '../components/UI';
import { MonumentView } from '../public/MonumentView';
import { MonumentCard } from '../public/MonumentCard';
import type { Lang, Preview } from '../public/model';
import '../public/public.css';

const QUESTION: Record<Lang, string> = { tr: 'Bu eseri anlat.', en: 'Tell me about this monument.' };

/** Eserin ziyaretçiye nasıl görüneceği: taslakken de. cerceve=1 → yalnızca sayfa (mobil önizlemenin iframe'i). */
export function PreviewPage({ slug, params }: { slug: string; params: URLSearchParams }) {
  const [lang, setLang] = useState<Lang>(params.get('lang') === 'en' ? 'en' : 'tr');
  const [drafts, setDrafts] = useState(params.get('drafts') === '1');
  const [mobile, setMobile] = useState(params.get('cihaz') === 'mobil');
  const [publishing, setPublishing] = useState(false);
  const frame = params.get('cerceve') === '1';
  const notify = useToast();
  const data = useLoad(() => api.preview(slug, lang, drafts), [slug, lang, drafts]);
  useEffect(() => { if (!frame) replaceQuery(`/onizleme/${encodeURIComponent(slug)}`, { lang: lang === 'en' ? 'en' : null, drafts: drafts ? 1 : null, cihaz: mobile ? 'mobil' : null }); }, [slug, lang, drafts, mobile, frame]);
  useEffect(() => { document.title = `Önizleme: ${data.data?.item.name ?? slug} — EŞİK`; }, [data.data, slug]);
  const p = data.data;
  const chat = p?.review_status === 'published' ? (mode: 'standard' | 'story' | 'child') => api.chat({ slug, question: QUESTION[lang], mode, lang }) : null;
  if (data.error) return <div className="content"><p className="form-error" role="alert">{data.error}</p><Link className="text-link" to="/eserler">Eser listesine dön</Link></div>;
  if (!p) return <p role="status" className="content">Önizleme hazırlanıyor…</p>;
  if (frame) return <MonumentView item={p.item} detail={p.detail} lang={lang} chat={chat} />;

  const published = p.review_status === 'published';
  const missing = p.checks.filter(c => c.required && !c.ok);
  async function publish() {
    if (missing.length && !confirm(`Eksik zorunlu bilgi var: ${missing.map(m => m.label).join(', ')}. Yine de yayına alınsın mı?`)) return;
    setPublishing(true);
    try { await api.updateMonument(slug, { review_status: 'published' }); notify('Eser yayına alındı; artık sitede görünüyor.'); data.reload(); }
    catch (e) { notify((e as Error).message, true); }
    finally { setPublishing(false); }
  }
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
        {drafts && <p className="admin-note" style={{ marginTop: 12 }}>Onay bekleyen fotoğraflar “onay bekliyor” etiketiyle gösteriliyor; ziyaretçiler onları görmez.</p>}
      </div>
      <div className="preview-card"><p className="eyebrow"><span />Keşfet listesinde</p><MonumentCard item={p.item} lang={lang} /></div>
    </section>
    {mobile
      // Yalnızca '#' sonrası değişen adres çerçeveyi yeniden yüklemez; ayar değişince çerçeve baştan kurulsun (key)
      ? <div className="preview-device"><iframe key={`${lang}-${drafts}`} title="Mobil önizleme"
          src={`/#/onizleme/${encodeURIComponent(slug)}?cerceve=1&lang=${lang}${drafts ? '&drafts=1' : ''}`} /></div>
      : <div className="preview-frame"><MonumentView item={p.item} detail={p.detail} lang={lang} chat={chat} /></div>}
  </div>;
}
