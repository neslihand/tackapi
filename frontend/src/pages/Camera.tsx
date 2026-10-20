import { useEffect, useRef, useState } from 'react';
import { Camera as CameraIcon, ImagePlus, ScanLine, ArrowUpRight, X } from 'lucide-react';
import { useContent } from '../lib/contentStore';
import { PageHeading } from '../components/UI';
import { Link } from '../lib/navigation';
import { demoRecognition } from '../lib/recognition';

export function Camera() {
  const { artifacts } = useContent();
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
  function accept(file: Blob) { setBlob(file); setPreview(URL.createObjectURL(file)); setResult(''); setError(''); stop(); }
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
  return <div className="page-shell camera-page"><PageHeading kicker="BAK, MERAK ET, KEŞFET" title={<>Bir kareden <em>bir hikâyeye.</em></>}>Kamera veya fotoğrafla başlayan keşif akışını deneyimle.</PageHeading><div className="demo-notice"><ScanLine size={22} /><div><strong>Demo Tanıma Deneyimi</strong><p>Bu sürüm görüntü analizi yapmaz. Sonuç, aşağıda senin seçtiğin örnek esere göre gösterilir. Fotoğrafın cihazından ayrılmaz.</p></div></div><div className="camera-layout"><div className="camera-preview">{streaming ? <><video ref={video} autoPlay playsInline muted aria-label="Canlı kamera önizlemesi" /><button className="icon-button camera-stop" onClick={stop} aria-label="Kamerayı kapat"><X /></button><button className="capture-button" onClick={capture} aria-label="Fotoğraf çek" /></> : preview ? <><img src={preview} alt="Yüklediğin fotoğrafın önizlemesi" onError={() => { setError('Görsel okunamadı. JPEG, PNG veya WebP biçiminde başka bir fotoğraf seç.'); setBlob(null); setPreview(''); }} /><button className="icon-button camera-stop" onClick={() => { setPreview(''); setBlob(null); setResult(''); }} aria-label="Fotoğrafı kaldır"><X /></button></> : <div className="camera-empty"><ScanLine size={74} strokeWidth={0.7} /><h3>Merak ettiğin yapıyı<br /><em>kadrajına al.</em></h3><p>Fotoğraf ekle veya kameranı aç.</p></div>}</div><div className="camera-form"><span className="eyebrow">01 · BİR GÖRSEL EKLE</span><button className="button dark" onClick={start} disabled={requesting}><CameraIcon size={18} />{requesting ? 'Kamera izni bekleniyor…' : 'Kamerayı aç'}</button><label className="button upload-button"><ImagePlus size={18} /> Fotoğraf yükle<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { const file = e.target.files?.[0]; if (!file) return; if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) { setError('10 MB altında JPEG, PNG veya WebP fotoğraf seç.'); e.target.value = ''; return; } accept(file); e.target.value = ''; }} /></label><small>JPEG, PNG veya WebP · En fazla 10 MB</small><span className="eyebrow">02 · DEMO İÇİN ESERİ SEN SEÇ</span><label><span className="sr-only">Demo eser seçimi</span><select value={selected} onChange={e => { setSelected(e.target.value); setResult(''); }}><option value="">Örnek eser seç…</option>{artifacts.map(a => <option value={a.id} key={a.id}>{a.name}</option>)}</select></label><button className="button gold" disabled={!blob || !selected} onClick={async () => { if (!blob) return; const response = await demoRecognition.recognize(blob, selected); if (alive.current) setResult(response.artifactId); }}>Seçtiğim eseri göster <ArrowUpRight size={18} /></button>{error && <p className="form-error" role="alert">{error}</p>}{artifact && <div className="recognition-result" role="status"><small>SEÇİMİNE DAYALI DEMO SONUCU</small><h3>{artifact.name}</h3><p>{artifact.city} · {artifact.period}</p><Link className="text-link" to={`/eser/${artifact.slug}`}>Hikâyesine git <ArrowUpRight size={16} /></Link></div>}</div></div></div>;
}
