import { useState } from 'react';
import { Ban, Check, Link2, RotateCcw, Star, X } from 'lucide-react';
import { api } from '../lib/api';
import { methodLabel } from '../lib/format';
import { Link, replaceQuery } from '../lib/navigation';
import type { AdminImage, ImageStatus } from '../lib/types';
import { Field, Modal, PageHead, Pager, Status, useLoad, useToast } from '../components/UI';
import { MonumentPicker } from '../components/MonumentPicker';

type Tab = { id: string; label: string; status: ImageStatus | ''; unassigned: boolean | null };
const TABS: Tab[] = [
  { id: 'draft', label: 'Kontrol bekleyen', status: 'draft', unassigned: null },
  { id: 'unassigned', label: 'Esere bağlı değil', status: '', unassigned: true },
  { id: 'published', label: 'Yayında', status: 'published', unassigned: null },
  { id: 'rejected', label: 'Atılan', status: 'rejected', unassigned: null },
];
const PAGE = 48;

export function ImageQueue({ params }: { params: URLSearchParams }) {
  const initialTab = params.get('unassigned') ? 'unassigned' : (TABS.find(t => t.status === params.get('status'))?.id ?? 'draft');
  const [tab, setTab] = useState(initialTab);
  const [book, setBook] = useState(params.get('book') ?? '');
  const [page, setPage] = useState(Number(params.get('page')) || 1);
  const [selected, setSelected] = useState<number[]>([]);
  const [zoom, setZoom] = useState<AdminImage | null>(null);
  const [busy, setBusy] = useState(false);
  const notify = useToast();
  const t = TABS.find(x => x.id === tab)!;
  const books = useLoad(() => api.books(), []);
  const list = useLoad(() => {
    replaceQuery('/fotograflar', { status: t.status, unassigned: t.unassigned ? 1 : null, book, page: page > 1 ? page : null });
    return api.images({ status: t.status, unassigned: t.unassigned, book: book || undefined, page, page_size: PAGE });
  }, [tab, book, page]);
  const items = list.data?.items ?? [];
  function choose(next: string) { setTab(next); setPage(1); setSelected([]); }
  const current = books.data?.find(b => b.slug === book);

  async function run(label: string, action: () => Promise<unknown>) {
    setBusy(true);
    try { await action(); notify(label); setSelected([]); list.reload(); books.reload(); }
    catch (e) { notify((e as Error).message, true); }
    finally { setBusy(false); }
  }
  const bulk = (status: ImageStatus, label: string) => run(`${selected.length} fotoğraf: ${label}`, () => api.bulkImages(selected, status));

  return <>
    <PageHead kicker="Fotoğraflar" title={<>Fotoğraf <em>kontrolü.</em></>}>
      Kitaplardan otomatik çıkarılan fotoğrafların çoğu eserlerine kesin olarak bağlandı. Burada, eşleştirmenin emin olamadığı fotoğrafları onaylayın, doğru esere bağlayın ya da atın. Atılan kitap fotoğrafları silinmez; yeniden yüklemede geri gelmez.
    </PageHead>
    <div className="tabs" role="tablist" aria-label="Fotoğraf durumu">{TABS.map(x => <button key={x.id} role="tab" aria-selected={tab === x.id} onClick={() => choose(x.id)}>{x.label}{tab === x.id && list.data ? <small>{list.data.total}</small> : null}</button>)}</div>
    <div className="toolbar">
      <Field label="Kaynak kitap"><select value={book} onChange={e => { setBook(e.target.value); setPage(1); }}>
        <option value="">Tüm kitaplar</option>
        {books.data?.filter(b => b.images).map(b => <option key={b.slug} value={b.slug}>{b.title}{b.images_draft ? ` (${b.images_draft} bekliyor)` : ''}</option>)}
      </select></Field>
      {items.length > 0 && <label className="admin-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, whiteSpace: 'nowrap', minHeight: 44 }}>
        <input type="checkbox" checked={selected.length === items.length} onChange={e => setSelected(e.target.checked ? items.map(i => i.id) : [])} />
        <span>Bu sayfadakilerin tümünü seç</span></label>}
    </div>
    {current && <p className="admin-help" role="status">Çevrimdışı paket ve paylaşım kartı izni: bu kitabın {current.images} fotoğrafından <strong>{current.images_reuse}</strong> tanesinde var. Telif kararıdır; kurumdan teyit almadan vermeyin.{' '}
      {current.images_reuse < current.images && <button className="text-link" disabled={busy} onClick={() => { if (confirm(`“${current.title}” kitabının bütün fotoğraflarının telefonda saklanmasına ve paylaşım kartına basılmasına izin verilsin mi?`)) run('Kitabın fotoğraflarına izin verildi', () => api.setBookReuse(current.slug, true)); }}>Bütün kitaba izin ver</button>}{' '}
      {current.images_reuse > 0 && <button className="text-link danger" disabled={busy} onClick={() => run('Kitabın fotoğraflarından izin kaldırıldı', () => api.setBookReuse(current.slug, false))}>İzni kaldır</button>}</p>}
    {selected.length > 0 && <div className="bulk-bar" role="region" aria-label="Toplu işlem">
      <strong>{selected.length} fotoğraf seçili</strong>
      <button className="button gold small" disabled={busy} onClick={() => bulk('published', 'yayına alındı')}><Check size={15} /> Onayla</button>
      <button className="button line small" disabled={busy} onClick={() => bulk('draft', 'taslağa alındı')}><RotateCcw size={15} /> Taslağa al</button>
      <button className="button line small" disabled={busy} onClick={() => bulk('rejected', 'atıldı')}><Ban size={15} /> At</button>
      <button className="button line small" onClick={() => setSelected([])}><X size={15} /> Seçimi bırak</button>
    </div>}
    {list.error && <p className="form-error" role="alert">{list.error}</p>}
    {list.loading && !list.data && <p role="status">Fotoğraflar yükleniyor…</p>}
    {list.data && !items.length && <div className="empty">Bu görünümde fotoğraf yok. {tab === 'draft' && 'Kontrol bekleyen fotoğraf kalmadı.'}</div>}
    <div className="image-grid" aria-busy={list.loading}>
      {items.map(img => <ImageCard key={img.id} img={img} busy={busy} selected={selected.includes(img.id)}
        onSelect={on => setSelected(s => on ? [...s, img.id] : s.filter(x => x !== img.id))}
        onZoom={() => setZoom(img)} run={run} />)}
    </div>
    {list.data && list.data.total > PAGE && <Pager page={page} pageSize={PAGE} total={list.data.total} onPage={p => { setPage(p); setSelected([]); }} />}
    {zoom && <Modal title={zoom.monument_name ?? 'Esere bağlı olmayan fotoğraf'} onClose={() => setZoom(null)}>
      <div className="lightbox"><img src={zoom.src} alt={zoom.alt_tr ?? ''} />
        <p>{zoom.book_title} · PDF sayfası {zoom.pdf_page ?? '—'} · basılı sayfa {zoom.printed_page ?? '—'} · {zoom.width}×{zoom.height} px<br />{methodLabel(zoom.match_method)}{zoom.section_title ? ` · ${zoom.section_title}` : ''}</p></div>
    </Modal>}
  </>;
}

function ImageCard({ img, selected, busy, onSelect, onZoom, run }: {
  img: AdminImage; selected: boolean; busy: boolean; onSelect: (on: boolean) => void; onZoom: () => void;
  run: (label: string, action: () => Promise<unknown>) => void;
}) {
  const [assigning, setAssigning] = useState(false);
  const [publishToo, setPublishToo] = useState(true);
  const set = (status: ImageStatus, label: string) => run(label, () => api.updateImage(img.id, { review_status: status }));
  const warn = img.match_method?.endsWith('_aralik_disi') || img.match_method === 'baslik_coklu';
  return <article className={`image-card ${selected ? 'selected' : ''}`} aria-label={img.alt_tr ?? `Fotoğraf ${img.id}`}>
    <div className="thumb">
      <button onClick={onZoom} aria-label="Fotoğrafı büyüt"><img src={img.thumb} alt={img.alt_tr ?? ''} loading="lazy" /></button>
      <label><input type="checkbox" checked={selected} onChange={e => onSelect(e.target.checked)}
        aria-label={`Seç: ${img.monument_name ?? 'esere bağlı olmayan fotoğraf'}, ${img.book_title ?? ''} PDF ${img.pdf_page ?? '—'}`} /> Seç</label>
      {img.is_cover && <span className="cover-flag">Kapak</span>}
    </div>
    <div className="meta">
      <span><Status value={img.review_status} /></span>
      {img.monument ? <strong><Link to={`/eser/${encodeURIComponent(img.monument)}`}>{img.monument_name}</Link></strong> : <strong>Esere bağlı değil</strong>}
      <span>{img.book_title ?? 'Panelden yüklendi'}{img.printed_page ? ` · s. ${img.printed_page}` : ''}{img.pdf_page ? ` (PDF ${img.pdf_page})` : ''}</span>
      <span className={warn ? 'warn' : ''}>{methodLabel(img.match_method)}{img.section_title ? ` · ${img.section_title}` : ''}</span>
    </div>
    {assigning && <div style={{ padding: '0 14px 12px' }}>
      <MonumentPicker label="Bağlanacak eser" onPick={m => run(`“${m.name_tr}” eserine bağlandı`, () => api.updateImage(img.id, { monument: m.slug, ...(publishToo ? { review_status: 'published' } : {}) }))} />
      <label style={{ display: 'flex', gap: 8, fontSize: 12.5, marginTop: 8 }}><input type="checkbox" checked={publishToo} onChange={e => setPublishToo(e.target.checked)} /> Bağlarken yayına al</label>
    </div>}
    <div className="card-actions">
      {img.review_status !== 'published' && img.monument && <button className="button gold small" disabled={busy} onClick={() => set('published', 'Fotoğraf yayına alındı')}><Check size={14} /> Onayla</button>}
      <button className="button line small" disabled={busy} aria-expanded={assigning} onClick={() => setAssigning(a => !a)}><Link2 size={14} /> {img.monument ? 'Başka esere' : 'Esere bağla'}</button>
      {img.review_status === 'published' && img.monument && !img.is_cover && <button className="button line small" disabled={busy} onClick={() => run('Kapak fotoğrafı değişti', () => api.updateImage(img.id, { is_cover: true }))}><Star size={14} /> Kapak yap</button>}
      {img.review_status === 'published' && <button className="button line small" disabled={busy} onClick={() => set('draft', 'Fotoğraf taslağa alındı')}><RotateCcw size={14} /> Taslağa al</button>}
      {img.review_status === 'rejected'
        ? <button className="button line small" disabled={busy} onClick={() => set('draft', 'Fotoğraf geri alındı')}><RotateCcw size={14} /> Geri al</button>
        : <button className="button danger small" disabled={busy} onClick={() => set('rejected', 'Fotoğraf atıldı')}><Ban size={14} /> At</button>}
    </div>
  </article>;
}
