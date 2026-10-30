import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Camera as CameraIcon, ImagePlus, ScanLine, ArrowUpRight, X, Check, ChevronDown } from 'lucide-react';
import { useContent } from '../lib/contentStore';
import { Girih } from '../components/PlayArt';
import { Link } from '../lib/navigation';
import { t } from '../lib/i18n';
import { demoRecognition } from '../lib/recognition';
import { findByPhoto, vakifApiEnabled, type VisualResult } from '../lib/vakifApi';
import { track } from '../lib/analytics';

const pad = (n: number) => String(n).padStart(2, '0');

// One numbered step of the flow; its number turns into a tick once the step is done.
function Step({ no, title, done, now, children }: { no: number; title: string; done: boolean; now: boolean; children: ReactNode }) {
  return <li className={`cm-step${done ? ' done' : ''}${now ? ' now' : ''}`}>
    <span className="cm-no" aria-hidden="true">{done ? <Check size={17} strokeWidth={2.2} /> : pad(no)}</span>
    <h2>{title}{done && <span className="sr-only">{t(' (tamamlandı)', ' (done)')}</span>}</h2>
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
      const matched = r.confident && r.match && artifacts.some(a => a.id === r.match);
      track('camera_search', matched ? r.match! : undefined, { result: matched ? 'match' : r.candidates.length ? 'unsure' : 'none' });
      if (matched) setResult(r.match!);
    } catch (e) { if (alive.current) setError((e as Error).message || t('Fotoğraf karşılaştırılamadı. Biraz sonra yeniden dene.', 'The photo could not be compared. Try again in a moment.')); }
    finally { if (alive.current) setBusy(false); }
  }
  async function start() {
    setError(''); setRequesting(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error(t('Kamera bu tarayıcıda kullanılamıyor. Fotoğraf yükleyebilirsin.', 'The camera cannot be used in this browser. You can upload a photo.'));
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      if (!alive.current) { media.getTracks().forEach(t => t.stop()); return; }
      stream.current?.getTracks().forEach(t => t.stop()); stream.current = media; setStreaming(true); setResult('');
    } catch { if (alive.current) setError(t('Kamera açılamadı veya izin verilmedi. Fotoğraf yükleyerek devam edebilirsin.', 'The camera could not be opened or permission was not given. You can carry on by uploading a photo.')); }
    finally { if (alive.current) setRequesting(false); }
  }
  function capture() {
    if (!video.current?.videoWidth) { setError(t('Kamera henüz hazır değil. Biraz bekleyip tekrar dene.', 'The camera is not ready yet. Wait a moment and try again.')); return; }
    const canvas = document.createElement('canvas'); canvas.width = video.current.videoWidth; canvas.height = video.current.videoHeight;
    canvas.getContext('2d')?.drawImage(video.current, 0, 0);
    canvas.toBlob(file => { if (file && alive.current) accept(file); }, 'image/jpeg', 0.85);
  }
  const artifact = artifacts.find(a => a.id === result);
  const current = !blob ? 0 : api ? (found ? -1 : 2) : !selected ? 1 : !artifact ? 2 : -1;
  const state = streaming ? t('Canlı', 'Live') : busy ? t('Karşılaştırılıyor', 'Comparing') : artifact ? (api ? t('Eşleşme', 'Match') : t('Demo eşleşme', 'Demo match')) : found ? t('Sonuç', 'Result') : preview ? t('Kare hazır', 'Frame ready') : t('Vizör bekliyor', 'Viewfinder waiting');
  // Only monuments in the collection on show (the pilot selection) are offered as candidates.
  const candidates = !found || artifact ? [] : found.candidates.flatMap(c => { const a = artifacts.find(x => x.id === c.slug); return a ? [{ ...c, artifact: a }] : []; }).slice(0, 3);
  return <div className="camera-scene" data-nav-theme="dark">
    <Girih className="cm-girih" />
    <div className="page-shell cm-page">
      <header className="cm-head">
        <p className="cm-index"><span>N° 01</span><i aria-hidden="true" />{t('Bak, merak et, keşfet', 'Look, wonder, discover')}</p>
        <h1 className="cm-title"><span className="cm-line"><span>{t('Bir kareden', 'From one frame')}</span></span> <span className="cm-line"><em>{t('bir hikâyeye.', 'to a story.')}</em></span></h1>
        <p className="cm-lede">{api ? t('Yapının fotoğrafını çek ya da yükle; envanter kitaplarındaki fotoğraflarla karşılaştırıp hangi eser olduğunu bulalım.', 'Take or upload a photo of the building; we compare it with the photos in the inventory books and find which work it is.') : t('Kamera veya fotoğrafla başlayan keşif akışını deneyimle.', 'Try the discovery flow that starts with the camera or a photo.')}</p>
      </header>
      {api ? <div className="cm-notice"><ScanLine size={20} aria-hidden="true" /><strong>{t('Fotoğrafla eser bulma', 'Finding a work by photo')}</strong><p>{t('Fotoğrafın yalnızca karşılaştırma için sunucuya gönderilir ve saklanmaz. Emin olamadığımızda tek bir eser söylemeyiz, en çok benzeyenleri gösteririz.', 'Your photo is sent to the server only to be compared, and is not kept. When we are not sure, we do not name one work; we show the closest ones.')}</p></div>
        : <div className="cm-notice"><ScanLine size={20} aria-hidden="true" /><strong>{t('Demo Tanıma Deneyimi', 'Demo Recognition')}</strong><p>{t('Bu sürüm görüntü analizi yapmaz. Sonuç, aşağıda senin seçtiğin örnek esere göre gösterilir. Fotoğrafın cihazından ayrılmaz.', 'This version does not analyse pictures. The result follows the sample work you choose below. Your photo does not leave your device.')}</p></div>}
      <div className="cm-layout">
        {/* The viewfinder: corner marks and an arch to frame the building in; thirds while the camera is live. */}
        <div className={`cm-finder${streaming ? ' live' : preview ? ' framed' : ''}${artifact ? ' matched' : ''}`}>
          {streaming ? <video ref={video} autoPlay playsInline muted aria-label={t('Canlı kamera önizlemesi', 'Live camera preview')} />
            : preview ? <img src={preview} alt={t('Yüklediğin fotoğrafın önizlemesi', 'Preview of the photo you uploaded')} onError={() => { setError(t('Görsel okunamadı. JPEG, PNG veya WebP biçiminde başka bir fotoğraf seç.', 'The picture could not be read. Choose another photo in JPEG, PNG or WebP.')); setBlob(null); setPreview(''); }} />
            : <div className="cm-empty"><p className="cm-empty-title">{t('Merak ettiğin yapıyı', 'Frame the building')}<br /><em>{t('kadrajına al.', 'you wonder about.')}</em></p><p className="cm-empty-note">{t('Fotoğraf ekle veya kameranı aç.', 'Add a photo or open your camera.')}</p></div>}
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
          {streaming && <><button type="button" className="cm-close" onClick={stop} aria-label={t('Kamerayı kapat', 'Close the camera')}><X size={18} /></button><button type="button" className="cm-shutter" onClick={capture} aria-label={t('Fotoğraf çek', 'Take a photo')} /></>}
          {!streaming && preview && <button type="button" className="cm-close" onClick={() => { setPreview(''); setBlob(null); setResult(''); setFound(null); }} aria-label={t('Fotoğrafı kaldır', 'Remove the photo')}><X size={18} /></button>}
        </div>
        <ol className="cm-steps">
          <Step no={1} title={t('Bir görsel ekle', 'Add a picture')} done={Boolean(blob)} now={current === 0}>
            <div className="cm-actions">
              <button type="button" className="button en-key cm-key" onClick={start} disabled={requesting}><span className="en-key-icon" aria-hidden="true"><CameraIcon size={17} /></span><span className="en-key-label">{requesting ? t('Kamera izni bekleniyor…', 'Waiting for camera permission…') : t('Kamerayı aç', 'Open the camera')}</span></button>
              <label className="en-link cm-link cm-upload"><span>{t('Fotoğraf yükle', 'Upload a photo')}</span><span className="en-link-arrow" aria-hidden="true"><ImagePlus size={16} /></span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { const file = e.target.files?.[0]; if (!file) return; if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) { setError(t('10 MB altında JPEG, PNG veya WebP fotoğraf seç.', 'Choose a JPEG, PNG or WebP photo under 10 MB.')); e.target.value = ''; return; } accept(file); e.target.value = ''; }} /></label>
            </div>
            <small>{t('JPEG, PNG veya WebP · En fazla 10 MB', 'JPEG, PNG or WebP · Up to 10 MB')}</small>
            {error && <p className="cm-error" role="alert">{error}</p>}
          </Step>
          {!api && <Step no={2} title={t('Demo için eseri sen seç', 'Choose the work for the demo')} done={Boolean(selected)} now={current === 1}>
            <label className="cm-select"><span className="cm-label">{t('Örnek eser', 'Sample work')}</span><select value={selected} onChange={e => { setSelected(e.target.value); setResult(''); }}><option value="">{t('Örnek eser seç…', 'Choose a sample work…')}</option>{artifacts.map(a => <option value={a.id} key={a.id}>{a.name}</option>)}</select><ChevronDown size={18} aria-hidden="true" /></label>
          </Step>}
          <Step no={api ? 2 : 3} title={api ? t('Hangi eser olduğunu bul', 'Find which work it is') : t('Hikâyesini bul', 'Find its story')} done={api ? Boolean(found) : Boolean(artifact)} now={current === 2}>
            {api ? <button type="button" className="button en-key cm-key cm-show" disabled={!blob || busy} aria-describedby={!blob ? 'cm-show-hint' : undefined} onClick={search}><span className="en-key-label">{busy ? t('Kitap fotoğraflarıyla karşılaştırılıyor…', 'Comparing with the book photos…') : t('Eseri bul', 'Find the work')}</span><span className="en-key-arrow" aria-hidden="true"><ArrowUpRight size={17} /></span></button>
              : <button type="button" className="button en-key cm-key cm-show" disabled={!blob || !selected} aria-describedby={!blob || !selected ? 'cm-show-hint' : undefined} onClick={async () => { if (!blob) return; const response = await demoRecognition.recognize(blob, selected); if (alive.current) setResult(response.artifactId); }}><span className="en-key-label">{t('Seçtiğim eseri göster', 'Show the work I chose')}</span><span className="en-key-arrow" aria-hidden="true"><ArrowUpRight size={17} /></span></button>}
            {(!blob || (!api && !selected)) && <p className="cm-hint" id="cm-show-hint">{!blob ? t('Önce bir görsel ekle.', 'Add a picture first.') : t('Şimdi bir örnek eser seç.', 'Now choose a sample work.')}</p>}
            {artifact && <div className="cm-result" role="status">
              <span className="cm-result-media"><img src={artifact.image} alt="" /></span>
              <span className="cm-result-copy"><small>{api ? t('Fotoğraftaki eser büyük olasılıkla bu', 'The work in the photo is most likely this one') : `${t('Seçimine dayalı demo sonucu', 'Demo result from your choice')} · N° ${pad(artifacts.indexOf(artifact) + 1)}`}</small><h3>{artifact.name}</h3><p>{artifact.city} · {artifact.period}</p><Link className="cm-result-link" to={`/eser/${artifact.slug}`}>{t('Hikâyesine git', 'Go to its story')} <ArrowUpRight size={16} aria-hidden="true" /></Link></span>
            </div>}
            {found && !artifact && (candidates.length ? <div role="status"><p className="cm-hint">{t('Emin olamadık. Fotoğrafına en çok benzeyen eserler:', 'We are not sure. The works closest to your photo:')}</p>
              {candidates.map(c => <div className="cm-result" key={c.slug}>
                <span className="cm-result-media"><img src={c.photo} alt="" /></span>
                <span className="cm-result-copy"><small>{t('Benzeyen kitap fotoğrafı', 'A similar book photo')}</small><h3>{c.artifact.name}</h3><p>{c.artifact.city} · {c.artifact.period}</p><Link className="cm-result-link" to={`/eser/${c.artifact.slug}`}>{t('Bu mu? Hikâyesine git', 'Is this it? Go to its story')} <ArrowUpRight size={16} aria-hidden="true" /></Link></span>
              </div>)}</div>
              : <p className="cm-hint" role="status">{t('Fotoğrafa benzeyen bir eser bulamadık. Yapının tamamını gösteren, net bir fotoğrafla yeniden dene.', 'We found no work like the photo. Try again with a sharp photo that shows the whole building.')}</p>)}
          </Step>
        </ol>
      </div>
    </div>
  </div>;
}
