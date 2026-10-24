import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../lib/api';
import { formatDate, KIND_LABELS } from '../lib/format';
import { Link, replaceQuery } from '../lib/navigation';
import { Field, PageHead, Pager, Status, useLoad } from '../components/UI';

const PAGE = 50;

export function Monuments({ params }: { params: URLSearchParams }) {
  const [q, setQ] = useState(params.get('q') ?? '');
  const [query, setQuery] = useState(q);
  const [city, setCity] = useState(params.get('city') ?? '');
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [hasImage, setHasImage] = useState(params.get('has_image') ?? '');
  const [page, setPage] = useState(Number(params.get('page')) || 1);
  useEffect(() => { const t = setTimeout(() => { setQuery(q); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  const cities = useLoad(() => api.cities(), []);
  const list = useLoad(() => {
    replaceQuery('/eserler', { q: query, city, status, has_image: hasImage, page: page > 1 ? page : null });
    return api.monuments({ q: query || undefined, city: city || undefined, status: status || undefined,
      has_image: hasImage === '' ? null : hasImage === '1', page, page_size: PAGE });
  }, [query, city, status, hasImage, page]);
  return <>
    <PageHead kicker="Eserler" title={<>Eser <em>kayıtları.</em></>} actions={<Link className="button dark" to="/yeni-eser"><Plus size={16} /> Yeni eser</Link>}>
      Taslaklar dahil bütün eserler. Envanter kitabından gelen eserlerin kitap metni değiştirilemez; künye bilgileri düzenlenebilir.
    </PageHead>
    <div className="toolbar" role="search">
      <Field label="Ara"><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Ad ya da slug" /></Field>
      <Field label="Şehir"><select value={city} onChange={e => { setCity(e.target.value); setPage(1); }}><option value="">Tümü</option>{cities.data?.map(c => <option key={c.slug} value={c.slug}>{c.name_tr}</option>)}</select></Field>
      <Field label="Yayın durumu"><select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">Tümü</option><option value="published">Yayında</option><option value="reviewed">Gözden geçirildi</option><option value="draft">Taslak</option></select></Field>
      <Field label="Fotoğraf"><select value={hasImage} onChange={e => { setHasImage(e.target.value); setPage(1); }}><option value="">Tümü</option><option value="1">Yayında fotoğrafı var</option><option value="0">Yayında fotoğrafı yok</option></select></Field>
    </div>
    {list.error && <p className="form-error" role="alert">{list.error}</p>}
    {list.data && (list.data.items.length ? <div style={{ overflowX: 'auto' }}><table className="admin-table" aria-busy={list.loading}>
      <caption className="sr-only">Eser listesi</caption>
      <thead><tr><th scope="col">Eser</th><th scope="col">Tür</th><th scope="col">Şehir / ilçe</th><th scope="col">Durum</th><th scope="col">Fotoğraf</th><th scope="col">Son değişiklik</th><th scope="col"><span className="sr-only">Önizleme</span></th></tr></thead>
      <tbody>{list.data.items.map(m => <tr key={m.slug}>
        <th scope="row"><Link to={`/eser/${encodeURIComponent(m.slug)}`}>{m.name_tr}</Link>{m.from_panel && <> <span className="admin-badge">panel</span></>}{m.qa_flags?.includes('duplicate_title') && <> <span className="admin-badge" title="Aynı adda başka bir kayıt var">yinelenen ad?</span></>}{m.qa_flags?.includes('merged') && <> <span className="admin-badge" title="Bölümleme hatasıyla ayrılmış parça; metni, fotoğrafları ve sohbet parçaları asıl kayda taşındı">birleştirildi</span></>}</th>
        <td>{KIND_LABELS[m.kind]}</td><td>{m.city}{m.district ? ` / ${m.district}` : ''}</td><td><Status value={m.review_status} /></td>
        <td>{m.images}{m.images_pending ? <> · <Link className="text-link" to={`/eser/${encodeURIComponent(m.slug)}#fotograflar`}>{m.images_pending} bekliyor</Link></> : null}</td>
        <td>{formatDate(m.updated_at)}</td>
        <td><Link className="text-link" to={`/onizleme/${encodeURIComponent(m.slug)}`} aria-label={`${m.name_tr}: sitede nasıl görünür`}>Önizle</Link></td>
      </tr>)}</tbody></table></div> : <div className="empty">Bu filtrelere uyan eser yok.</div>)}
    {list.data && <Pager page={page} pageSize={PAGE} total={list.data.total} onPage={setPage} />}
  </>;
}
