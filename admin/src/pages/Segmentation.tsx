import { useState } from 'react';
import { api } from '../lib/api';
import { DECISION_LABELS, decisionMessage, formatDate, RULE_LABELS } from '../lib/format';
import { Link, replaceQuery } from '../lib/navigation';
import type { ParaDecision, SegItem } from '../lib/types';
import { Field, PageHead, Pager, Status, useLoad, useToast } from '../components/UI';
import { ParagraphActions } from '../components/ParagraphActions';

const TABS = [
  { id: 'pending', label: 'Bakılacak', decision: 'pending', source: undefined },
  { id: 'decided', label: 'Karar verilenler', decision: 'decided', source: undefined },
  { id: 'auto', label: 'Otomatik düzeltilenler', decision: 'all', source: 'auto' },
] as const;
const PAGE = 15;

/** Bölümleme kontrolü: başka esere ait görünen paragraflar, önceki ve sonraki paragrafla birlikte. */
export function Segmentation({ params }: { params: URLSearchParams }) {
  const [tab, setTab] = useState<string>(TABS.find(t => t.id === params.get('sekme'))?.id ?? 'pending');
  const [book, setBook] = useState(params.get('book') ?? '');
  const [page, setPage] = useState(Number(params.get('page')) || 1);
  const [busy, setBusy] = useState(false);
  const notify = useToast();
  const t = TABS.find(x => x.id === tab)!;
  const books = useLoad(() => api.books(), []);
  const list = useLoad(() => {
    replaceQuery('/bolumleme', { sekme: tab === 'pending' ? null : tab, book, page: page > 1 ? page : null });
    return api.segmentation({ decision: t.decision, source: t.source, book: book || undefined, page, page_size: PAGE });
  }, [tab, book, page]);
  async function decide(item: SegItem, decision: ParaDecision, target?: string) {
    setBusy(true);
    try { notify(`${item.name_tr} P${item.para_no}: ${decisionMessage(await api.decideFix(item.id, { decision, target }))}`); list.reload(); }
    catch (e) { notify((e as Error).message, true); }
    finally { setBusy(false); }
  }
  const pending = list.data?.counts.find(c => c.decision === 'pending')?.n ?? 0;
  return <>
    <PageHead kicker="Metin kalitesi" title={<>Bölümleme <em>kontrolü.</em></>}>
      Kitaplar eserlere otomatik bölünürken bazı paragraflar komşu esere karışmış. Yapay zekâ bunları işaretledi; ancak bir kısmı yanlış alarm olabilir. Paragrafı önceki ve sonraki paragrafla birlikte okuyup karar verin. <strong>Kitap metni hiçbir durumda değişmez</strong>: kararlar yalnızca ziyaretçinin gördüğü metni ve sohbet asistanının kullandığı parçaları etkiler ve her zaman geri alınabilir.
    </PageHead>
    <div className="tabs" role="tablist" aria-label="Görünüm">{TABS.map(x => <button key={x.id} role="tab" aria-selected={tab === x.id} onClick={() => { setTab(x.id); setPage(1); }}>{x.label}{x.id === 'pending' && pending ? <small>{pending}</small> : null}</button>)}</div>
    <div className="toolbar"><Field label="Kaynak kitap"><select value={book} onChange={e => { setBook(e.target.value); setPage(1); }}>
      <option value="">Tüm kitaplar</option>{books.data?.filter(b => !b.slug.startsWith('panel-')).map(b => <option key={b.slug} value={b.slug}>{b.title}</option>)}</select></Field></div>
    {list.error && <p className="form-error" role="alert">{list.error}</p>}
    {list.data && !list.data.items.length && <div className="empty">{tab === 'pending' ? 'Bakılacak paragraf kalmadı.' : 'Bu görünümde kayıt yok.'}</div>}
    <div className="seg-list" aria-busy={list.loading}>{list.data?.items.map(item => <article key={item.id} className="seg-card" aria-labelledby={`seg-${item.id}`}>
      <header>
        <h2 id={`seg-${item.id}`}><Link to={`/eser/${encodeURIComponent(item.slug)}#P${item.para_no}`}>{item.name_tr}</Link> <span>P{item.para_no} / {item.count}</span></h2>
        <Status value={item.review_status} />
        <span className="admin-badge">{RULE_LABELS[item.rule ?? ''] ?? item.reason}</span>
        {item.book && <span className="admin-help">{item.book}{item.pages.length ? `, s. ${item.pages.join('–')}` : ''}</span>}
      </header>
      <div className="seg-context">
        {item.prev && <p className="seg-around"><b>P{item.para_no - 1}</b>{item.prev}</p>}
        <p className="seg-target"><b>P{item.para_no}</b>{item.text}</p>
        {item.next && <p className="seg-around"><b>P{item.para_no + 1}</b>{item.next}</p>}
      </div>
      {item.decision === 'pending'
        ? <ParagraphActions decision={item.decision} busy={busy} city={item.slug.split('-')[0]}
            suggested={item.suggested_slug ? { slug: item.suggested_slug, name: item.suggested_name ?? item.suggested_slug } : null}
            onDecide={(d, target) => decide(item, d, target)} />
        : <div className="admin-actions"><strong>{DECISION_LABELS[item.decision]}{item.decision === 'move' && item.target_name ? ` → ${item.target_name}` : ''}</strong>
          <span className="admin-help">{item.decided_by ? `${item.decided_by}, ${formatDate(item.decided_at)}` : 'otomatik kural'}</span>
          <ParagraphActions decision={item.decision} busy={busy} onDecide={d => decide(item, d)} /></div>}
    </article>)}</div>
    {list.data && list.data.total > PAGE && <Pager page={page} pageSize={PAGE} total={list.data.total} onPage={setPage} />}
  </>;
}
