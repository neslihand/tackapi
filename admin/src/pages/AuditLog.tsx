import { useState } from 'react';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';
import { Link } from '../lib/navigation';
import type { LogRow } from '../lib/types';
import { Field, PageHead, useLoad } from '../components/UI';

const ACTIONS: Record<string, string> = {
  'article.create': 'makale yazdı', 'article.import': 'kitaptan makale aktardı', 'article.update': 'makaleyi düzenledi',
  'article.published': 'makaleyi yayımladı', 'article.draft': 'makaleyi yayından kaldırdı', 'article.rejected': 'makaleyi reddetti',
  'article.pending': 'makaleyi onay kuyruğuna aldı', 'article.delete': 'makaleyi sildi', 'article.cover': 'makale kapağı yükledi',
  'article.cover_remove': 'makale kapağını kaldırdı', 'term.create': 'terim ekledi', 'term.update': 'terimi düzenledi',
  'term.published': 'terimi yayımladı', 'term.draft': 'terimi yayından kaldırdı', 'term.rejected': 'terim önerisini reddetti',
  'term.delete': 'terimi sildi',
  'monument.update': 'eseri düzenledi', 'monument.create': 'eser ekledi', 'monument.text': 'eser metnini kaydetti',
  'monument.delete': 'eseri sildi', 'image.update': 'fotoğrafı düzenledi', 'image.upload': 'fotoğraf yükledi',
  'image.delete': 'fotoğrafı sildi', 'image.reject': 'fotoğrafı attı', 'image.bulk_published': 'fotoğrafları toplu onayladı',
  'image.bulk_rejected': 'fotoğrafları toplu attı', 'image.bulk_draft': 'fotoğrafları taslağa aldı', 'city.create': 'şehir ekledi',
  'note.update': 'kalite notunun durumunu değiştirdi', 'monument.remove': 'eseri kaldırdı', 'monument.restore': 'eseri geri getirdi',
  'monument.split': 'paragraflardan yeni eser ayırdı', 'monument.pilot': 'pilot seçkiyi değiştirdi',
  'paragraph.decide': 'paragraf kararı verdi', 'paragraph.move_range': 'paragrafları taşıdı', 'artwork.images': 'süsleme fotoğraflarını değiştirdi',
  'narration.generate': 'anlatım üretti', 'narration.edit': 'anlatımı düzeltti',
};

/** Kayıt satırını okunur bir cümleye çevirir (pano da kullanır). */
export function describe(r: LogRow) {
  const eser = (slug: unknown) => slug ? <Link className="text-link" to={`/eser/${encodeURIComponent(String(slug))}`}>{String(slug)}</Link> : <>esere bağlı değil</>;
  const moved = r.detail?.monument;  // fotoğraf düzenlemesinde [eski, yeni], yüklemede tek slug
  const title = r.detail?.title ?? r.detail?.term;
  const target = r.target === 'image:*' ? <>fotoğraflar</>
    : r.target.startsWith('article:') ? (r.action === 'article.delete' ? <>{String(title ?? r.target)}</> : <Link className="text-link" to={`/makale/${r.target.slice(8)}`}>{String(title ?? r.target)}</Link>)
    : r.target.startsWith('term:') ? <>{String(title ?? r.target)}</>
    : r.target.startsWith('image:') ? (Array.isArray(moved) ? <>{eser(moved[0])} → {eser(moved[1])}</> : moved ? eser(moved) : r.target)
    : r.action.startsWith('city.') ? r.target : eser(r.target);
  const fields = r.action === 'monument.update' || r.action === 'image.update' ? Object.keys(r.detail ?? {}).join(', ') : '';
  const count = Array.isArray(r.detail?.ids) ? ` (${(r.detail.ids as unknown[]).length})` : '';
  return <>{ACTIONS[r.action] ?? r.action}{count}: {target}{fields && <span className="log-detail"> — {fields}</span>}</>;
}

export function AuditLog({ params }: { params: URLSearchParams }) {
  const [target, setTarget] = useState(params.get('target') ?? '');
  const [applied, setApplied] = useState(target);
  const log = useLoad(() => api.log(applied || undefined), [applied]);
  return <>
    <PageHead kicker="Denetim" title={<>Değişiklik <em>kaydı.</em></>}>Panelden yapılan her değişiklik kimin yaptığıyla birlikte kaydedilir; ayrıntıda eski ve yeni değerler görünür.</PageHead>
    <form className="toolbar" onSubmit={e => { e.preventDefault(); setApplied(target.trim()); }}>
      <Field label="Esere göre süz (slug)"><input type="search" value={target} onChange={e => setTarget(e.target.value)} placeholder="bursa-osmangazi-…" /></Field>
      <button className="button line">Süz</button>
    </form>
    {log.error && <p className="form-error" role="alert">{log.error}</p>}
    {log.data && (log.data.length ? <table className="admin-table"><caption className="sr-only">Değişiklik kaydı</caption>
      <thead><tr><th scope="col">Zaman</th><th scope="col">Kişi</th><th scope="col">İşlem</th><th scope="col">Ayrıntı</th></tr></thead>
      <tbody>{log.data.map((r, i) => <tr key={i}><td style={{ whiteSpace: 'nowrap' }}>{formatDate(r.at)}</td><td>{r.actor}</td><td>{describe(r)}</td>
        <td><details><summary>göster</summary><pre className="log-detail" style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(r.detail, null, 1)}</pre></details></td></tr>)}</tbody>
    </table> : <div className="empty">Kayıt yok.</div>)}
  </>;
}
