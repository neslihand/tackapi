import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, Circle, Eye, Monitor, Rocket, Smartphone } from 'lucide-react';
import { api } from '../lib/api';
import { Link, replaceQuery } from '../lib/navigation';
import { useLoad, useToast } from '../components/UI';
import { MonumentView } from '../public/MonumentView';
import { MonumentCard } from '../public/MonumentCard';
import type { Lang, NarrationMode, Preview } from '../public/model';
import '../public/public.css';

const MODE_LABEL: Record<NarrationMode, string> = { story: 'Hikâye anlatımı', child: 'Çocuk anlatımı' };

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
  // Hikâye ve çocuk anlatımı bir kez üretilip kaydedilir; ziyaretçi sayfası yalnızca kayıtlı metni gösterir
  async function generate(mode: NarrationMode) {
    const edited = p?.narrations.find(n => n.mode === mode && n.lang === lang && n.edited_by);
    if (edited && !confirm(`Bu anlatım ${edited.edited_by} tarafından elle düzeltilmiş. Yeniden üretilirse düzeltmeler kaybolur. Devam edilsin mi?`)) return;
    const r = await api.generateNarration(slug, { mode, lang });
    const bad = [...r.verification.unsupported_years, ...r.verification.unsupported_names];
    notify(bad.length ? `Anlatım kaydedildi, ancak bağlamda olmayan bilgi içeriyor olabilir: ${bad.join(', ')}. Okuyup gerekirse yeniden üretin.`
      : 'Anlatım üretildi ve kaydedildi; ziyaretçiler artık bu metni görüyor.', bad.length > 0);
    data.reload();
  }
  // Yazım hatası gibi küçük düzeltmeler için: yapay zekâ çağrılmaz, metin olduğu gibi kaydedilir
  async function edit(mode: NarrationMode, text: string) {
    await api.editNarration(slug, mode, { lang, answer: text });
    notify('Düzeltme kaydedildi; ziyaretçiler artık bu metni görüyor.');
    data.reload();
  }
  if (data.error) return <div className="content"><p className="form-error" role="alert">{data.error}</p><Link className="text-link" to="/eserler">Eser listesine dön</Link></div>;
  if (!p) return <p role="status" className="content">Önizleme hazırlanıyor…</p>;
  if (frame) return <MonumentView item={p.item} detail={p.detail} lang={lang} generate={generate} edit={edit} />;
  const warnings = (p.narrations ?? []).filter(n => n.lang === lang && (n.stale || n.unsupported.length));

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
        {warnings.map(n => <p key={n.mode} className="admin-note" style={{ marginTop: 12 }}>
          <strong>{MODE_LABEL[n.mode]}:</strong> {n.stale ? 'eserin metni anlatım üretildikten sonra değişti. ' : ''}
          {n.unsupported.length ? `Kaynakta doğrulanamayan bilgi: ${n.unsupported.join(', ')}. ` : ''}Aşağıdan düzeltebilir ya da yeniden üretebilirsiniz.</p>)}
        {(p.narrations ?? []).filter(n => n.lang === lang && n.edited_by).map(n => <p key={`e-${n.mode}`} className="admin-note" style={{ marginTop: 12 }}>
          <strong>{MODE_LABEL[n.mode]}:</strong> {n.edited_by} tarafından elle düzeltildi{n.edited_at ? ` (${new Date(n.edited_at).toLocaleString('tr-TR')})` : ''}.</p>)}
        {drafts && <p className="admin-note" style={{ marginTop: 12 }}>Onay bekleyen fotoğraflar “onay bekliyor” etiketiyle gösteriliyor; ziyaretçiler onları görmez.</p>}
      </div>
      <div className="preview-card"><p className="eyebrow"><span />Keşfet listesinde</p><MonumentCard item={p.item} lang={lang} /></div>
    </section>
    {mobile
      // Yalnızca '#' sonrası değişen adres çerçeveyi yeniden yüklemez; ayar değişince çerçeve baştan kurulsun (key)
      ? <div className="preview-device"><iframe key={`${lang}-${drafts}`} title="Mobil önizleme"
          src={`/#/onizleme/${encodeURIComponent(slug)}?cerceve=1&lang=${lang}${drafts ? '&drafts=1' : ''}`} /></div>
      : <div className="preview-frame"><MonumentView item={p.item} detail={p.detail} lang={lang} generate={generate} edit={edit} /></div>}
  </div>;
}
