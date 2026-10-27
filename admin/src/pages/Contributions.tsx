import { useState } from 'react';
import { Check, ImageIcon, RotateCcw, Type, X } from 'lucide-react';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';
import { Link, replaceQuery } from '../lib/navigation';
import type { Contribution, ContributionStatus } from '../lib/types';
import { PageHead, Pager, useLoad, useToast } from '../components/UI';

const TABS: [ContributionStatus, string][] = [['pending', 'Onay bekleyen'], ['approved', 'Onaylanan'], ['rejected', 'Reddedilen']];
const TEXT_KINDS: Record<string, string> = { memory: 'Anı', info: 'Bilgi', correction: 'Düzeltme önerisi' };

/**
 * Ziyaretçi katkıları: fotoğraf ve metin (anı, bilgi, düzeltme önerisi). Onaylanan katkı eser sayfasında
 * "Ziyaretçi katkıları" bölümünde, kitap bilgisinden ayrı görünür; sohbet asistanı bunları kaynak olarak kullanmaz.
 * Reddedilen katkının gerekçesini katkıyı yapan kendi sayfasında görür.
 */
export function ContributionsPage({ params }: { params: URLSearchParams }) {
  const [status, setStatus] = useState<ContributionStatus>((TABS.find(([s]) => s === params.get('status'))?.[0]) ?? 'pending');
  const [page, setPage] = useState(1);
  const data = useLoad(() => api.contributions(status, page), [status, page]);
  const d = data.data;
  const count = (s: ContributionStatus) => d?.counts.find(c => c.status === s)?.n ?? 0;
  return <>
    <PageHead kicker="SİTE" title="Ziyaretçi katkıları">Ziyaretçilerin eserlere eklediği fotoğraflar ve metinler. Onaylananlar eser sayfasında “Ziyaretçi katkıları” olarak, kitaptaki bilgiden ayrı görünür; sohbet asistanı bunları kaynak olarak kullanmaz.</PageHead>
    {data.error && <p className="form-error" role="alert">{data.error}</p>}
    {d && !d.enabled && <p className="admin-note">Katkı tablosu yok: önce <code>python migrate.py --apply</code> (göç 015).</p>}
    <div className="tabs" role="tablist">{TABS.map(([s, label]) => <button key={s} role="tab" aria-selected={status === s}
      onClick={() => { setStatus(s); setPage(1); replaceQuery('/katkilar', { status: s }); }}>{label}{d ? ` (${count(s)})` : ''}</button>)}</div>
    {d?.enabled && !d.items.length && <p className="admin-help" style={{ marginTop: 16 }}>Bu listede katkı yok.</p>}
    <ul className="contrib-list">{d?.items.map(c => <li key={c.id}><ContributionCard c={c} onChange={data.reload} /></li>)}</ul>
    {d && d.total > 50 && <Pager page={page} pageSize={50} total={d.total} onPage={setPage} />}
  </>;
}

function ContributionCard({ c, onChange }: { c: Contribution; onChange: () => void }) {
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  async function review(status: ContributionStatus, reject_reason?: string) {
    setBusy(true);
    try {
      await api.reviewContribution(c.id, { status, reject_reason: reject_reason ?? null });
      notify(status === 'approved' ? 'Katkı onaylandı; eser sayfasında görünüyor.' : status === 'rejected' ? 'Katkı reddedildi.' : 'Katkı yeniden onay kuyruğunda.');
      onChange();
    } catch (e) { notify((e as Error).message, true); }
    finally { setBusy(false); }
  }
  return <article className={`contrib-card ${c.kind}`}>
    {c.kind === 'photo' && c.src && <a className="contrib-photo" href={c.src} target="_blank" rel="noreferrer"><img src={c.thumb} alt={c.body ?? 'Ziyaretçi fotoğrafı'} /></a>}
    <div className="contrib-body">
      <p className="contrib-meta">{c.kind === 'photo' ? <><ImageIcon size={14} /> Fotoğraf</> : <><Type size={14} /> {TEXT_KINDS[c.text_kind ?? ''] ?? 'Metin'}</>}
        <span>·</span><Link className="text-link" to={`/eser/${encodeURIComponent(c.monument)}`}>{c.monument_name}</Link>
        <span>·</span>{c.author_deleted ? 'silinmiş hesap' : (c.author || 'takma adsız ziyaretçi')}{c.author_total > 1 ? ` (${c.author_total} katkı)` : ''}
        <span>·</span>{formatDate(c.created_at)}</p>
      {c.body && <p className={c.kind === 'text' ? 'contrib-text' : 'admin-help'}>{c.body}</p>}
      {c.text_kind === 'correction' && <p className="admin-help">Düzeltme önerisi kitap metnini değiştirmez; doğruysa künyeyi ya da paragraf kararını panelden siz düzeltin.</p>}
      {c.status === 'rejected' && c.reject_reason && <p className="admin-help">Red gerekçesi: {c.reject_reason}</p>}
      {c.reviewed_by && <p className="admin-help">{c.status === 'approved' ? 'Onaylayan' : 'İnceleyen'}: {c.reviewed_by}{c.reviewed_at ? `, ${formatDate(c.reviewed_at)}` : ''}</p>}
      {rejecting ? <div className="contrib-reject">
        <label className="admin-field"><span>Red gerekçesi (katkıyı yapan görür)</span><input maxLength={300} value={reason} onChange={e => setReason(e.target.value)} autoFocus /></label>
        <div className="admin-actions"><button className="button dark small" disabled={busy || reason.trim().length < 3} onClick={() => review('rejected', reason.trim())}>Reddet</button>
          <button className="text-link" onClick={() => setRejecting(false)}>Vazgeç</button></div>
      </div> : <div className="admin-actions">
        {c.status !== 'approved' && <button className="button dark small" disabled={busy} onClick={() => review('approved')}><Check size={15} /> Onayla</button>}
        {c.status !== 'rejected' && <button className="button line small" disabled={busy} onClick={() => setRejecting(true)}><X size={15} /> Reddet</button>}
        {c.status !== 'pending' && <button className="text-link" disabled={busy} onClick={() => review('pending')}><RotateCcw size={14} /> Kuyruğa geri al</button>}
      </div>}
    </div>
  </article>;
}
