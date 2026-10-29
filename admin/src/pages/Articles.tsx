import { useState, type FormEvent } from 'react';
import { BookOpen, FileText, Plus, Search, Star, UserRound } from 'lucide-react';
import { api } from '../lib/api';
import { ARTICLE_KIND_LABELS, ARTICLE_ORIGIN_LABELS, formatDate } from '../lib/format';
import { Link, navigate, replaceQuery } from '../lib/navigation';
import type { ArticleKind, ArticleOrigin, ArticleStatus } from '../lib/types';
import { Field, Issues, Modal, PageHead, Pager, useLoad, useToast } from '../components/UI';
import { ArticleStatusBadge } from '../components/ArticleBody';

const TABS: [ArticleStatus | '', string][] = [['pending', 'Onay bekleyen'], ['draft', 'Taslak'], ['published', 'Yayında'], ['rejected', 'Reddedilen'], ['', 'Tümü']];
const ORIGIN_ICONS: Record<ArticleOrigin, typeof BookOpen> = { book: BookOpen, editorial: FileText, visitor: UserRound };

/**
 * Makaleler: sitedeki "Makaleler" sayfası. Üç kaynaktan gelir: envanter kitabının şehir tarihi bölümlerinden (paragraf
 * aralığıyla, parça parça), panelde yazılanlar ve ziyaretçilerin gönderdikleri (onay bekler). Hiçbiri yapay zekâyla
 * yazılmaz; makaleler sohbet asistanının kaynağı değildir.
 */
export function ArticlesPage({ params }: { params: URLSearchParams }) {
  const initial = TABS.find(([s]) => s === (params.get('durum') ?? 'pending'))?.[0] ?? 'pending';
  const [status, setStatus] = useState<ArticleStatus | ''>(initial);
  const [kind, setKind] = useState<ArticleKind | ''>((params.get('tur') as ArticleKind) || '');
  const [origin, setOrigin] = useState<ArticleOrigin | ''>((params.get('kaynak') as ArticleOrigin) || '');
  const [q, setQ] = useState(params.get('q') ?? '');
  const [query, setQuery] = useState(q);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const data = useLoad(() => api.articles({ status: status || null, kind: kind || null, origin: origin || null, q: query, page }), [status, kind, origin, query, page]);
  const d = data.data;
  const count = (s: ArticleStatus | '') => s ? d?.counts.find(c => c.status === s)?.n ?? 0 : d?.counts.reduce((n, c) => n + c.n, 0) ?? 0;
  const sync = (next: Record<string, string>) => replaceQuery('/makaleler', { durum: status, tur: kind, kaynak: origin, q: query, ...next });
  return <>
    <PageHead kicker="SİTE" title="Makaleler" actions={<>
      <Link className="button line" to="/makale-aktar"><BookOpen size={16} /> Kitaptan içe aktar</Link>
      <button className="button dark" onClick={() => setCreating(true)}><Plus size={16} /> Yeni makale</button></>}>
      Şehir tarihleri, vakıf eserleri ve vakıf kültürü üzerine yazılar. Kitap bölümlerini paragraf aralığı seçerek parça parça
      yayımlayabilir, kendiniz yazabilir ya da ziyaretçilerin gönderdiklerini onaylayabilirsiniz.
    </PageHead>
    {data.error && <p className="form-error" role="alert">{data.error}</p>}
    {d && !d.enabled && <p className="admin-note">Makale tabloları yok: önce <code>python migrate.py --apply</code> (göç 017).</p>}
    <div className="tabs" role="tablist" aria-label="Yayın durumu">{TABS.map(([s, label]) => <button key={s || 'all'} role="tab" aria-selected={status === s}
      onClick={() => { setStatus(s); setPage(1); sync({ durum: s }); }}>{label}{d ? <small>{count(s)}</small> : null}</button>)}</div>
    <form className="toolbar" role="search" onSubmit={(e: FormEvent) => { e.preventDefault(); setQuery(q.trim()); setPage(1); sync({ q: q.trim() }); }}>
      <Field label="Ara"><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Başlık ya da adres…" /></Field>
      <Field label="Tür"><select value={kind} onChange={e => { setKind(e.target.value as ArticleKind | ''); setPage(1); sync({ tur: e.target.value }); }}>
        <option value="">Hepsi</option>{Object.entries(ARTICLE_KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      <Field label="Kaynak"><select value={origin} onChange={e => { setOrigin(e.target.value as ArticleOrigin | ''); setPage(1); sync({ kaynak: e.target.value }); }}>
        <option value="">Hepsi</option>{Object.entries(ARTICLE_ORIGIN_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      <button className="button line small"><Search size={15} /> Ara</button>
    </form>
    {d?.enabled && !d.items.length && <div className="empty-panel">
      <p>{status === 'pending' ? 'Onay bekleyen makale yok. Ziyaretçiler makale gönderdiğinde burada sıraya girer.' : 'Bu listede makale yok.'}</p>
      {status !== 'pending' && <Link className="text-link" to="/makale-aktar">Kitabın şehir tarihi bölümünden ilk makaleyi oluşturun →</Link>}
    </div>}
    <ul className="article-list">{d?.items.map(a => {
      const Icon = ORIGIN_ICONS[a.origin];
      return <li key={a.id}><Link className="article-row" to={`/makale/${a.id}`}>
        <span className="article-thumb">{a.cover ? <img src={a.cover.thumb} alt="" loading="lazy" /> : <FileText size={22} strokeWidth={1.3} />}</span>
        <span className="article-row-main">
          <span className="article-row-meta"><ArticleStatusBadge value={a.status} /><span>{ARTICLE_KIND_LABELS[a.kind]}</span>
            {a.city && <span>· {a.city}</span>}{a.featured && <span className="article-flag"><Star size={12} /> Öne çıkan</span>}
            {a.has_english && <span className="article-flag">EN</span>}</span>
          <strong>{a.title_tr}</strong>
          <small><Icon size={13} /> {ARTICLE_ORIGIN_LABELS[a.origin]} · {a.byline} · {a.words.toLocaleString('tr-TR')} sözcük
            {a.monuments_count ? ` · ${a.monuments_count} eser` : ''} · {a.status === 'published' ? `yayın ${formatDate(a.published_at)}` : `güncelleme ${formatDate(a.updated_at)}`}</small>
        </span>
      </Link></li>;
    })}</ul>
    {d && d.total > 50 && <Pager page={page} pageSize={50} total={d.total} onPage={setPage} />}
    {creating && <NewArticle onClose={() => setCreating(false)} />}
  </>;
}

function NewArticle({ onClose }: { onClose: () => void }) {
  const notify = useToast();
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<ArticleKind>('heritage');
  const [issues, setIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  async function create(e: FormEvent) {
    e.preventDefault();
    if (title.trim().length < 5) { setIssues(['Başlık en az 5 karakter olmalı.']); return; }
    setBusy(true);
    try { const a = await api.createArticle({ title_tr: title.trim(), kind, body_tr: '' }); notify('Taslak oluşturuldu. Metni yazıp yayına alabilirsiniz.'); navigate(`/makale/${a.id}`); }
    catch (err) { setIssues([(err as Error).message]); setBusy(false); }
  }
  return <Modal title="Yeni makale" onClose={onClose}>
    <form className="admin-form" onSubmit={create} noValidate><Issues list={issues} />
      <Field label="Başlık"><input autoFocus maxLength={160} value={title} onChange={e => setTitle(e.target.value)} placeholder="Örn. Bursa’da Vakıf ve Çarşı" /></Field>
      <div className="choice-row" role="radiogroup" aria-label="Tür">{Object.entries(ARTICLE_KIND_LABELS).map(([k, l]) =>
        <label key={k} className={kind === k ? 'on' : ''}><input type="radio" name="kind" checked={kind === k} onChange={() => setKind(k as ArticleKind)} />{l}</label>)}</div>
      <div className="admin-actions"><button className="button dark" disabled={busy}><Plus size={16} /> Taslağı oluştur</button>
        <button type="button" className="text-link" onClick={onClose}>Vazgeç</button></div>
    </form>
  </Modal>;
}
