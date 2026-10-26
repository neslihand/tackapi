import { useEffect, useRef, useState } from 'react';
import { ImagePlus, ScanSearch } from 'lucide-react';
import { MonumentCard } from './MonumentCard';
import { strings, type Lang, type VisualSearchResult } from './model';

const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX = 10 * 1024 * 1024;

/**
 * Fotoğrafla eser bulma (POST /api/visual-search). Yalnızca API'ye bağlıdır; ön yüzün kamera sayfasına taşınabilir.
 * Emin olunan sonuçta tek eser, emin olunmayanda en yakın adaylar gösterilir: düşük güvenle tek eser kesin gibi sunulmaz.
 * showScores: benzerlik puanlarını ve eşleşen kitap fotoğrafını gösterir (yönetici denemesi için).
 */
export function VisualSearch({ lang, search, hrefFor, showScores = false }: {
  lang: Lang; search: (file: Blob) => Promise<VisualSearchResult>; hrefFor: (slug: string) => string; showScores?: boolean;
}) {
  const s = strings(lang);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<VisualSearchResult | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(''); setResult(null);
    if (!TYPES.includes(file.type)) { setError(s.vsBadType); return; }
    if (file.size > MAX) { setError(s.vsTooBig); return; }
    setPreview(URL.createObjectURL(file));
    setBusy(true);
    try { setResult(await search(file)); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  }

  const shown = result ? (result.confident ? result.candidates.slice(0, 1) : result.candidates) : [];
  return <section className="pv-vs" aria-labelledby="pv-vs-title">
    <div className="pv-vs-pick">
      <div className="pv-vs-frame">{preview ? <img src={preview} alt={s.vsYours} /> : <div className="pv-vs-empty"><ScanSearch size={56} strokeWidth={0.8} aria-hidden="true" /></div>}</div>
      <div className="pv-vs-copy">
        <h2 id="pv-vs-title">{s.vsTitle}</h2>
        <label className="pv-button pv-vs-upload"><ImagePlus size={18} aria-hidden="true" /> {preview ? s.vsChange : s.vsUpload}
          <input ref={input} type="file" accept={TYPES.join(',')} disabled={busy} onChange={e => pick(e.target.files?.[0])} /></label>
        <p className="pv-muted">{s.vsHint}</p>
        {busy && <p role="status">{s.vsSearching}</p>}
        {error && <p className="pv-error" role="alert">{error}</p>}
      </div>
    </div>
    {result && <div className="pv-vs-result" aria-live="polite">
      <p className="pv-vs-verdict">{!result.candidates.length ? s.vsNone : result.confident ? s.vsMatch : s.vsUnsure}</p>
      {shown.length > 0 && <div className={`pv-vs-grid ${result.confident ? 'single' : ''}`}>{shown.map((c, i) => <div key={c.item.slug} className="pv-vs-cand">
        <MonumentCard item={c.item} lang={lang} index={i} href={hrefFor(c.item.slug)} />
        {showScores && <div className="pv-vs-debug"><img src={c.photo.thumb} alt={s.vsMatched} /><span>{s.vsMatched}<br /><b>{c.score.toFixed(3)}</b> {s.vsSimilarity}</span></div>}
      </div>)}</div>}
    </div>}
  </section>;
}
