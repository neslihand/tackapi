import { useEffect, useState } from 'react';
import { ArrowRightLeft, Ban, BookOpen, Check, ChevronLeft, ChevronRight, Link2, Unlink, X } from 'lucide-react';
import { api } from '../lib/api';
import type { MonumentDetail, PagePhoto } from '../lib/types';
import { Link } from '../lib/navigation';
import { Status, useLoad, useToast } from './UI';
import { MonumentPicker } from './MonumentPicker';

/**
 * Eserin kitap sayfalarındaki bütün fotoğraflar: yanlış esere bağlanmış, bağlanmamış ya da yanlışlıkla atılmış
 * fotoğrafları düzeltmek için. Hangi fotoğrafın hangi esere ait olduğuna yönetici karar verir; kitabın PDF sayfası
 * yanında açılabilir.
 */
export function PagePhotos({ d, onChange }: { d: MonumentDetail; onChange: () => void }) {
  const notify = useToast();
  const [pad, setPad] = useState(1);
  const data = useLoad(() => api.pagePhotos(d.slug, pad), [d.slug, pad, d.updated_at, d.images.length]);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  if (d.from_panel) return null;
  const pages = data.data?.pages;
  async function run(label: string, action: () => Promise<unknown>) {
    setBusy(true);
    try { await action(); notify(label); data.reload(); onChange(); } catch (e) { notify((e as Error).message, true); } finally { setBusy(false); }
  }
  const photos = data.data?.photos ?? [];
  const byPage = new Map<number, PagePhoto[]>();
  for (const p of photos) byPage.set(p.printed_page, [...(byPage.get(p.printed_page) ?? []), p]);
  const elsewhere = photos.filter(p => !p.here && p.in_range && p.review_status !== 'rejected').length;
  return <section id="sayfa-fotograflari" style={{ marginTop: 34 }} aria-labelledby="page-photos-title">
    <h2 id="page-photos-title" style={{ fontSize: 26, marginBottom: 6 }}>Kitap sayfalarındaki fotoğraflar{pages ? ` (s. ${pages[0]}${pages[1] !== pages[0] ? `–${pages[1]}` : ''})` : ''}</h2>
    <p className="admin-help" style={{ marginBottom: 10 }}>
      Eserin kaynak sayfalarında ve {pad ? `önceki/sonraki ${pad} sayfada` : 'yalnızca bu sayfalarda'} bulunan bütün fotoğraflar. Yanlış esere bağlanmış olanı “Bu esere bağla” ile alın,
      bu esere ait olmayanı asıl eserine taşıyın. Emin değilseniz “Kitap sayfasını gör” ile PDF'teki sayfaya bakın. Sayfa aralığı yanlışsa yukarıdaki “Kaynak sayfası” alanlarından düzeltin.
      {elsewhere > 0 && <b> Bu sayfalarda başka esere ya da hiçbir esere bağlı {elsewhere} fotoğraf var.</b>}
    </p>
    <div className="admin-actions" style={{ marginBottom: 12, padding: 0 }}>
      <label className="admin-help">Çevre sayfalar:{' '}
        <select value={pad} onChange={e => setPad(Number(e.target.value))}>{[0, 1, 2, 4].map(n => <option key={n} value={n}>{n === 0 ? 'yok' : `± ${n}`}</option>)}</select></label>
    </div>
    {data.error && <p className="form-error" role="alert">{data.error}</p>}
    {!pages && !data.loading && <div className="empty">Eserin sayfa aralığı yok. Yukarıdan “Kaynak sayfası” girin.</div>}
    {[...byPage.entries()].map(([page, list]) => <div key={page} className="page-photos-group">
      <div className="page-photos-head">
        <b>s. {page}</b>{pages && (page < pages[0] || page > pages[1]) && <span className="admin-help"> · eserin aralığı dışında</span>}
        <button type="button" className="text-link" onClick={() => setViewing(page)}><BookOpen size={14} /> Kitap sayfasını gör</button>
      </div>
      <div className="image-grid">{list.map(p => <PageCard key={p.id} p={p} d={d} busy={busy} run={run} />)}</div>
    </div>)}
    {pages && !photos.length && !data.loading && <div className="empty">Bu sayfalarda fotoğraf bulunmadı. <button type="button" className="text-link" onClick={() => setViewing(pages[0])}>Kitap sayfasını gör</button></div>}
    {viewing !== null && data.data?.book && <PdfViewer book={data.data.book} page={viewing} onClose={() => setViewing(null)} />}
  </section>;
}

function PageCard({ p, d, busy, run }: { p: PagePhoto; d: MonumentDetail; busy: boolean; run: (label: string, action: () => Promise<unknown>) => void }) {
  const [moving, setMoving] = useState(false);
  const owner = p.here ? <span className="pp-owner here">Bu eserde</span>
    : p.monument ? <span className="pp-owner other">Başka eserde: <Link className="text-link" to={`/eser/${encodeURIComponent(p.monument)}`}>{p.monument_name}</Link></span>
      : <span className="pp-owner none">Hiçbir esere bağlı değil</span>;
  return <article className={`image-card${p.here ? ' pp-here' : ''}`} aria-label={p.alt_tr ?? `Fotoğraf ${p.id}`}>
    <div className="thumb"><a href={p.src} target="_blank" rel="noreferrer" aria-label="Fotoğrafı yeni sekmede büyük aç"><img src={p.thumb} alt={p.alt_tr ?? ''} loading="lazy" /></a>{p.is_cover && <span className="cover-flag">Kapak</span>}</div>
    <div className="meta">
      {owner}
      <span><Status value={p.review_status} /> · s. {p.printed_page}</span>
    </div>
    <div className="card-actions">
      {!p.here && <button className="button gold small" disabled={busy} onClick={() => run(`Fotoğraf “${d.name_tr}” eserine bağlandı`, () => api.updateImage(p.id, { monument: d.slug, review_status: 'published' }))}><Link2 size={14} /> Bu esere bağla</button>}
      {p.here && p.review_status !== 'published' && <button className="button gold small" disabled={busy} onClick={() => run('Fotoğraf yayına alındı', () => api.updateImage(p.id, { review_status: 'published' }))}><Check size={14} /> Onayla</button>}
      {p.here && <button className="button line small" disabled={busy} aria-expanded={moving} onClick={() => setMoving(m => !m)}><ArrowRightLeft size={14} /> Başka esere taşı</button>}
      {p.here && <button className="button line small" disabled={busy} onClick={() => run('Fotoğrafın eser bağlantısı kaldırıldı', () => api.updateImage(p.id, { monument: '', review_status: 'draft' }))}><Unlink size={14} /> Bağlantıyı kaldır</button>}
      {p.review_status !== 'rejected' && <button className="button danger small" disabled={busy} onClick={() => run('Fotoğraf atıldı', () => api.updateImage(p.id, { review_status: 'rejected' }))}><Ban size={14} /> At</button>}
    </div>
    {moving && <div style={{ padding: '0 12px 12px' }}><MonumentPicker label="Fotoğrafın asıl eseri" city={d.city} onPick={m => { setMoving(false); run(`Fotoğraf “${m.name_tr}” eserine taşındı`, () => api.updateImage(p.id, { monument: m.slug, review_status: 'published' })); }} /></div>}
  </article>;
}

/** Kitabın PDF açılımı (iki sayfa yan yana). Önceki/sonraki açılıma geçilebilir. */
function PdfViewer({ book, page, onClose }: { book: string; page: number; onClose: () => void }) {
  const [printed, setPrinted] = useState(page);
  const [img, setImg] = useState<{ url: string; pages: number[]; pdf_page: number } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => setPrinted(page), [page]);
  useEffect(() => {
    let alive = true, url = '';
    setError('');
    api.pdfPage(book, printed).then(r => { url = r.url; if (alive) setImg(r); else URL.revokeObjectURL(r.url); })
      .catch((e: Error) => alive && setError(e.message));
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [book, printed]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  const first = img?.pages[0] ?? printed, last = img?.pages[img.pages.length - 1] ?? printed;
  return <div className="pdf-viewer" role="dialog" aria-modal="true" aria-label={`Kitap sayfası ${printed}`}>
    <div className="pdf-viewer-bar">
      <button type="button" className="button line small" onClick={() => setPrinted(Math.max(1, first - 1))} aria-label="Önceki sayfalar"><ChevronLeft size={16} /></button>
      <span>{img ? `s. ${img.pages.join('–')} · PDF sayfası ${img.pdf_page}` : `s. ${printed}`}</span>
      <button type="button" className="button line small" onClick={() => setPrinted(last + 1)} aria-label="Sonraki sayfalar"><ChevronRight size={16} /></button>
      <button type="button" className="button line small" onClick={onClose} autoFocus><X size={16} /> Kapat</button>
    </div>
    {error ? <p className="form-error" role="alert">{error}</p>
      : img ? <img src={img.url} alt={`Kitap sayfası ${img.pages.join('–')}`} /> : <p role="status">Sayfa hazırlanıyor…</p>}
  </div>;
}
