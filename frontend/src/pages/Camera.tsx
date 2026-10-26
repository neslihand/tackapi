import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Camera as CameraIcon, ImagePlus, ScanLine, ArrowUpRight, X, Check, ChevronDown } from 'lucide-react';
import { useContent } from '../lib/contentStore';
import { Girih } from '../components/PlayArt';
import { Link } from '../lib/navigation';
import { demoRecognition } from '../lib/recognition';
import { findByPhoto, vakifApiEnabled, type VisualResult } from '../lib/vakifApi';

const pad = (n: number) => String(n).padStart(2, '0');

// One numbered step of the flow; its number turns into a tick once the step is done.
function Step({ no, title, done, now, children }: { no: number; title: string; done: boolean; now: boolean; children: ReactNode }) {
  return <li className={`cm-step${done ? ' done' : ''}${now ? ' now' : ''}`}>
    <span className="cm-no" aria-hidden="true">{done ? <Check size={17} strokeWidth={2.2} /> : pad(no)}</span>
    <h2>{title}{done && <span className="sr-only"> (tamamlandı)</span>}</h2>
    <div className="cm-body">{children}</div>
  </li>;
}

export function Camera() {
  const { artifacts } = useContent();
  // With the backend the photo is compared with the book photos (POST /api/visual-search) and is not stored; without
  // it the page is the demo where the visitor picks the artifact. An uncertain match is never shown as one answer.
  const api = vakifApiEnabled();
  const [found, setFound] = useState<VisualResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState('');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [selected, setSelected] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; stream.current?.getTracks().forEach(t => t.stop()); }; }, []);
  useEffect(() => { return () => { if (preview) URL.revokeObjectURL(preview); }; }, [preview]);
  useEffect(() => { if (streaming && video.current && stream.current) video.current.srcObject = stream.current; }, [streaming]);
  function stop() { stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; setStreaming(false); }
  function accept(file: Blob) { setBlob(file); setPreview(URL.createObjectURL(file)); setResult(''); setFound(null); setError(''); stop(); }
  async function search() {
    if (!blob) return;
    setBusy(true); setError(''); setFound(null); setResult('');
    try {
      const r = await findByPhoto(blob);
      if (!alive.current) return;
      setFound(r);
      if (r.confident && r.match && artifacts.some(a => a.id === r.match)) setResult(r.match);
    } catch (e) { if (alive.current) setError((e as Error).message || 'Fotoğraf karşılaştırılamadı. Biraz sonra yeniden dene.'); }
    finally { if (alive.current) setBusy(false); }
  }
  async function start() {
    setError(''); setRequesting(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Kamera bu tarayıcıda kullanılamıyor. Fotoğraf yükleyebilirsin.');
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      if (!alive.current) { media.getTracks().forEach(t => t.stop()); return; }
      stream.current?.getTracks().forEach(t => t.stop()); stream.current = media; setStreaming(true); setResult('');
    } catch { if (alive.current) setError('Kamera açılamadı veya izin verilmedi. Fotoğraf yükleyerek devam edebilirsin.'); }
    finally { if (alive.current) setRequesting(false); }
  }
  function capture() {
    if (!video.current?.videoWidth) { setError('Kamera henüz hazır değil. Biraz bekleyip tekrar dene.'); return; }
    const canvas = document.createElement('canvas'); canvas.width = video.current.videoWidth; canvas.height = video.current.videoHeight;
    canvas.getContext('2d')?.drawImage(video.current, 0, 0);
    canvas.toBlob(file => { if (file && alive.current) accept(file); }, 'image/jpeg', 0.85);
  }
  const artifact = artifacts.find(a => a.id === result);
  const current = !blob ? 0 : api ? (found ? -1 : 2) : !selected ? 1 : !artifact ? 2 : -1;
  const state = streaming ? 'Canlı' : busy ? 'Karşılaştırılıyor' : artifact ? (api ? 'Eşleşme' : 'Demo eşleşme') : found ? 'Sonuç' : preview ? 'Kare hazır' : 'Vizör bekliyor';
  // Only monuments in the collection on show (the pilot selection) are offered as candidates.
  const candidates = !found || artifact ? [] : found.candidates.flatMap(c => { const a = artifacts.find(x => x.id === c.slug); return a ? [{ ...c, artifact: a }] : []; }).slice(0, 3);
  return <div className="camera-scene" data-nav-theme="dark">
    <Girih className="cm-girih" />
    <div className="page-shell cm-page">
      <header className="cm-head">
        <p className="cm-index"><span>N° 01</span><i aria-hidden="true" />Bak, merak et, keşfet</p>
        <h1 className="cm-title"><span className="cm-line"><span>Bir kareden</span></span> <span className="cm-line"><em>bir hikâyeye.</em></span></h1>
        <p className="cm-lede">{api ? 'Yapının fotoğrafını çek ya da yükle; envanter kitaplarındaki fotoğraflarla karşılaştırıp hangi eser olduğunu bulalım.' : 'Kamera veya fotoğrafla başlayan keşif akışını deneyimle.'}</p>
      </header>
      {api ? <div className="cm-notice"><ScanLine size={20} aria-hidden="true" /><strong>Fotoğrafla eser bulma</strong><p>Fotoğrafın yalnızca karşılaştırma için sunucuya gönderilir ve saklanmaz. Emin olamadığımızda tek bir eser söylemeyiz, en çok benzeyenleri gösteririz.</p></div>
        : <div className="cm-notice"><ScanLine size={20} aria-hidden="true" /><strong>Demo Tanıma Deneyimi</strong><p>Bu sürüm görüntü analizi yapmaz. Sonuç, aşağıda senin seçtiğin örnek esere göre gösterilir. Fotoğrafın cihazından ayrılmaz.</p></div>}
      <div className="cm-layout">
        {/* The viewfinder: corner marks and an arch to frame the building in; thirds while the camera is live. */}
        <div className={`cm-finder${streaming ? ' live' : preview ? ' framed' : ''}${artifact ? ' matched' : ''}`}>
          {streaming ? <video ref={video} autoPlay playsInline muted aria-label="Canlı kamera önizlemesi" />
            : preview ? <img src={preview} alt="Yüklediğin fotoğrafın önizlemesi" onError={() => { setError('Görsel okunamadı. JPEG, PNG veya WebP biçiminde başka bir fotoğraf seç.'); setBlob(null); setPreview(''); }} />
            : <div className="cm-empty"><p className="cm-empty-title">Merak ettiğin yapıyı<br /><em>kadrajına al.</em></p><p className="cm-empty-note">Fotoğraf ekle veya kameranı aç.</p></div>}
          <span className="cm-guide" aria-hidden="true">
            <i /><i /><i /><i />
            <span className="cm-thirds" />
            <svg className="cm-arch" viewBox="0 0 400 500" preserveAspectRatio="xMidYMax meet">
              <path className="a0" pathLength={1} d="M35 470V209.6C35 125.6 147.2 83.6 200 50C252.8 83.6 365 125.6 365 209.6V470" />
              <path className="a1" pathLength={1} d="M49 470V227C49 148.6 151.7 109.4 200 78C248.3 109.4 351 148.6 351 227V470" />
              <path className="base" pathLength={1} d="M10 470H390" />
            </svg>
          </span>
          <p className="cm-readout" aria-hidden="true"><i />{state}</p>
          {streaming && <><button type="button" className="cm-close" onClick={stop} aria-label="Kamerayı kapat"><X size={18} /></button><button type="button" className="cm-shutter" onClick={capture} aria-label="Fotoğraf çek" /></>}
          {!streaming && preview && <button type="button" className="cm-close" onClick={() => { setPreview(''); setBlob(null); setResult(''); setFound(null); }} aria-label="Fotoğrafı kaldır"><X size={18} /></button>}
        </div>
        <ol className="cm-steps">
          <Step no={1} title="Bir görsel ekle" done={Boolean(blob)} now={current === 0}>
            <div className="cm-actions">
              <button type="button" className="button en-key cm-key" onClick={start} disabled={requesting}><span className="en-key-icon" aria-hidden="true"><CameraIcon size={17} /></span><span className="en-key-label">{requesting ? 'Kamera izni bekleniyor…' : 'Kamerayı aç'}</span></button>
              <label className="en-link cm-link cm-upload"><span>Fotoğraf yükle</span><span className="en-link-arrow" aria-hidden="true"><ImagePlus size={16} /></span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { const file = e.target.files?.[0]; if (!file) return; if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) { setError('10 MB altında JPEG, PNG veya WebP fotoğraf seç.'); e.target.value = ''; return; } accept(file); e.target.value = ''; }} /></label>
            </div>
            <small>JPEG, PNG veya WebP · En fazla 10 MB</small>
            {error && <p className="cm-error" role="alert">{error}</p>}
          </Step>
          {!api && <Step no={2} title="Demo için eseri sen seç" done={Boolean(selected)} now={current === 1}>
            <label className="cm-select"><span className="cm-label">Örnek eser</span><select value={selected} onChange={e => { setSelected(e.target.value); setResult(''); }}><option value="">Örnek eser seç…</option>{artifacts.map(a => <option value={a.id} key={a.id}>{a.name}</option>)}</select><ChevronDown size={18} aria-hidden="true" /></label>
          </Step>}
          <Step no={api ? 2 : 3} title={api ? 'Hangi eser olduğunu bul' : 'Hikâyesini bul'} done={api ? Boolean(found) : Boolean(artifact)} now={current === 2}>
            {api ? <button type="button" className="button en-key cm-key cm-show" disabled={!blob || busy} aria-describedby={!blob ? 'cm-show-hint' : undefined} onClick={search}><span className="en-key-label">{busy ? 'Kitap fotoğraflarıyla karşılaştırılıyor…' : 'Eseri bul'}</span><span className="en-key-arrow" aria-hidden="true"><ArrowUpRight size={17} /></span></button>
              : <button type="button" className="button en-key cm-key cm-show" disabled={!blob || !selected} aria-describedby={!blob || !selected ? 'cm-show-hint' : undefined} onClick={async () => { if (!blob) return; const response = await demoRecognition.recognize(blob, selected); if (alive.current) setResult(response.artifactId); }}><span className="en-key-label">Seçtiğim eseri göster</span><span className="en-key-arrow" aria-hidden="true"><ArrowUpRight size={17} /></span></button>}
            {(!blob || (!api && !selected)) && <p className="cm-hint" id="cm-show-hint">{!blob ? 'Önce bir görsel ekle.' : 'Şimdi bir örnek eser seç.'}</p>}
            {artifact && <div className="cm-result" role="status">
              <span className="cm-result-media"><img src={artifact.image} alt="" /></span>
              <span className="cm-result-copy"><small>{api ? 'Fotoğraftaki eser büyük olasılıkla bu' : `Seçimine dayalı demo sonucu · N° ${pad(artifacts.indexOf(artifact) + 1)}`}</small><h3>{artifact.name}</h3><p>{artifact.city} · {artifact.period}</p><Link className="cm-result-link" to={`/eser/${artifact.slug}`}>Hikâyesine git <ArrowUpRight size={16} aria-hidden="true" /></Link></span>
            </div>}
            {found && !artifact && (candidates.length ? <div role="status"><p className="cm-hint">Emin olamadık. Fotoğrafına en çok benzeyen eserler:</p>
              {candidates.map(c => <div className="cm-result" key={c.slug}>
                <span className="cm-result-media"><img src={c.photo} alt="" /></span>
                <span className="cm-result-copy"><small>Benzeyen kitap fotoğrafı</small><h3>{c.artifact.name}</h3><p>{c.artifact.city} · {c.artifact.period}</p><Link className="cm-result-link" to={`/eser/${c.artifact.slug}`}>Bu mu? Hikâyesine git <ArrowUpRight size={16} aria-hidden="true" /></Link></span>
              </div>)}</div>
              : <p className="cm-hint" role="status">Fotoğrafa benzeyen bir eser bulamadık. Yapının tamamını gösteren, net bir fotoğrafla yeniden dene.</p>)}
          </Step>
        </ol>
      </div>
    </div>
  </div>;
}
