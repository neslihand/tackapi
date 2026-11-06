import { useEffect, useState, type ReactNode } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, BookOpen, Camera, Eye, Gamepad2, Heart, KeyRound, Map as MapIcon, MessageCircleQuestion, MessageSquareHeart,
  Monitor, Newspaper, NotebookPen, RefreshCw, Route, Search, Share2, Smartphone, Sparkles, Stamp, UserPlus, Users, BookA } from 'lucide-react';
import { api } from '../lib/api';
import { KIND_LABELS } from '../lib/format';
import { Link } from '../lib/navigation';
import type { Delta, FeedItem, Overview } from '../lib/types';
import { Sparkline, TrendChart } from '../components/Charts';
import { useLoad } from '../components/UI';

const fmt = (n: number) => n.toLocaleString('tr-TR');
const REFRESH_MS = 60_000;

/** Değişim yüzdesi; önceki dönem boşsa yüzde yerine "yeni". */
export function change(d: Delta): { pct: number | null; dir: 'up' | 'down' | 'flat' } {
  if (!d.prev) return { pct: null, dir: d.now ? 'up' : 'flat' };
  const pct = Math.round((d.now - d.prev) / d.prev * 100);
  return { pct, dir: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' };
}

export function ago(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return 'az önce';
  if (s < 3600) return `${Math.round(s / 60)} dk önce`;
  if (s < 86400) return `${Math.round(s / 3600)} sa önce`;
  return `${Math.round(s / 86400)} gün önce`;
}

// Canlı akış: olay türü → simge ve kısa etiket (eser adı ayrı satırda; Türkçe ek sorunu olmasın diye)
const FEED: Record<string, [ReactNode, string]> = {
  monument_view: [<Eye size={15} />, 'Eser sayfası açıldı'],
  chat_question: [<MessageCircleQuestion size={15} />, '“Esere Sor”a soru'],
  stamp: [<Stamp size={15} />, 'Pasaporta mühür'],
  favorite: [<Heart size={15} />, 'Favorilere eklendi'],
  search: [<Search size={15} />, 'Arama'],
  camera_search: [<Camera size={15} />, 'Kamerayla eser arama'],
  route_open: [<Route size={15} />, 'Keşif rotası açıldı'],
  route_started: [<Route size={15} />, 'Rotaya başlandı'],
  route_completed: [<MapIcon size={15} />, 'Rota tamamlandı'],
  quiz_finish: [<Gamepad2 size={15} />, 'Bilgi yarışması bitti'],
  game_finish: [<Gamepad2 size={15} />, 'Mini oyun bitti'],
  contribution: [<MessageSquareHeart size={15} />, 'Katkı gönderildi'],
  heritage_story_completed: [<BookOpen size={15} />, 'Hikâye sonuna kadar okundu'],
  article_view: [<Newspaper size={15} />, 'Makale okundu'],
  daily_hunt_completed: [<Search size={15} />, 'Detay Avı tamamlandı'],
  share_initiated: [<Share2 size={15} />, 'Paylaşıldı'],
  knowledge_recalled: [<Sparkles size={15} />, 'Hatırla kartı yanıtlandı'],
};
const CAMERA: Record<string, string> = { match: 'eser bulundu', unsure: 'adaylar gösterildi', none: 'bulunamadı' };

function feedDetail(f: FeedItem) {
  if (f.type === 'search' && f.text) return `“${f.text}”`;
  if (f.type === 'chat_question' && f.text) return `“${f.text}”`;
  if (f.type === 'camera_search') return f.result ? CAMERA[f.result] ?? '' : '';
  return '';
}

function Trend({ d, inverse = false }: { d: Delta; inverse?: boolean }) {
  const c = change(d);
  if (c.dir === 'flat') return <span className="ov-delta flat">değişmedi</span>;
  const good = (c.dir === 'up') !== inverse;
  return <span className={`ov-delta ${good ? 'good' : 'bad'}`} title={`Önceki dönem: ${fmt(d.prev)}`}>
    {c.dir === 'up' ? <ArrowUpRight size={14} aria-hidden="true" /> : <ArrowDownRight size={14} aria-hidden="true" />}
    {c.pct === null ? 'yeni' : `%${Math.abs(c.pct)}`}<span className="sr-only">{c.dir === 'up' ? ' artış' : ' azalış'}</span></span>;
}

function Kpi({ icon, label, d, spark, to }: { icon: ReactNode; label: string; d: Delta; spark?: number[]; to?: string }) {
  const body = <>
    <span className="ov-kpi-top"><span className="ov-kpi-icon" aria-hidden="true">{icon}</span><span>{label}</span></span>
    <strong>{fmt(d.now)}</strong>
    <span className="ov-kpi-foot"><Trend d={d} /><small>önceki: {fmt(d.prev)}</small></span>
    {spark && <Sparkline values={spark} />}
  </>;
  return to ? <Link to={to} className="ov-kpi">{body}</Link> : <div className="ov-kpi">{body}</div>;
}

type Range = 'day' | 'week';

/**
 * Panelin ilk sayfası: sitenin şu anki hâli. Canlı ziyaretçi, son 24 saat / 7 gün (öncekiyle karşılaştırmalı),
 * saatlik ve günlük trafik, canlı etkinlik akışı, en çok bakılan eserler, şehirler, aramalar, asistanın önerileri
 * ve bekleyen moderasyon işleri. Her dakika kendiliğinden tazelenir.
 */
export function Dashboard({ user }: { user?: string }) {
  const [range, setRange] = useState<Range>(() => (sessionStorage.getItem('esik:ov-range') as Range) || 'day');
  const [demo, setDemo] = useState(true);
  const [tick, setTick] = useState(0);
  const ov = useLoad(() => api.overview(demo), [demo, tick]);
  const stats = useLoad(() => api.stats(), [tick]);
  const agent = useLoad(() => api.agent('open').catch(() => null), []);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => { setTick(n => n + 1); setNow(Date.now()); }, REFRESH_MS);
    const c = setInterval(() => setNow(Date.now()), 15_000);
    return () => { clearInterval(t); clearInterval(c); };
  }, []);
  useEffect(() => { try { sessionStorage.setItem('esik:ov-range', range); } catch { /* yok */ } }, [range]);
  const o = ov.data;
  const s = stats.data;
  const hour = new Date().getHours();
  const hello = hour < 6 ? 'İyi geceler' : hour < 12 ? 'Günaydın' : hour < 18 ? 'İyi günler' : 'İyi akşamlar';
  const first = user?.split(/\s+/)[0];
  const name = first ? first.charAt(0).toLocaleUpperCase('tr-TR') + first.slice(1) : '';
  const c = o?.compare[range];
  const series = o ? (range === 'day'
    ? o.hourly.map(h => ({ label: new Date(h.hour).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }), tick: `${new Date(h.hour).getHours()}:00`, now: h.visitors, prev: h.prev }))
    : o.daily.map(d => ({ label: new Date(d.day).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'short' }), tick: new Date(d.day).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }), now: d.visitors }))) : [];
  const spark = (k: 'visitors' | 'views') => o ? (range === 'day' ? o.hourly.map(h => h[k]) : o.daily.slice(-14).map(d => d[k])) : undefined;
  const platformTotal = o?.platforms.reduce((a, p) => a + p.visitors, 0) ?? 0;
  const mobile = o?.platforms.find(p => p.platform === 'mobile')?.visitors ?? 0;
  const cityMax = Math.max(1, ...(o?.cities.map(x => x.visitors) ?? [1]));
  const pending: [number, string, string, ReactNode][] = s ? ([
    [s.contributions_pending ?? 0, 'Ziyaretçi katkısı', '/katkilar', <MessageSquareHeart size={16} />],
    [s.questions_pending ?? 0, 'Cevap bekleyen soru', '/bekleyen-sorular', <MessageCircleQuestion size={16} />],
    [s.articles_pending ?? 0, 'Makale önerisi', '/makaleler?durum=pending', <Newspaper size={16} />],
    [s.terms_pending ?? 0, 'Terim önerisi', '/terimler?durum=pending', <BookA size={16} />],
    [s.author_submitted ?? 0, 'Yazar metni', '/yazar-metinleri', <NotebookPen size={16} />],
  ] as [number, string, string, ReactNode][]) : [];
  const waiting = pending.reduce((a, [n]) => a + n, 0);
  const suggestions = agent.data?.items.slice(0, 3) ?? [];

  return <div className="ov">
    <header className="ov-head">
      <div>
        <p className="eyebrow"><span />{new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        <h1>{hello}{name ? `, ${name}` : ''}. <em>Site bugün böyle.</em></h1>
      </div>
      <div className="ov-head-side">
        {o && <span className={`ov-live ${o.live.m15 ? 'on' : ''}`} title={`Son 60 dakikada ${fmt(o.live.m60)} ziyaretçi`}>
          <i aria-hidden="true" /> Şu an sitede <b>{fmt(o.live.m15)}</b> ziyaretçi</span>}
        <div className="segmented" role="tablist" aria-label="Dönem">
          <button role="tab" aria-selected={range === 'day'} onClick={() => setRange('day')}>Son 24 saat</button>
          <button role="tab" aria-selected={range === 'week'} onClick={() => setRange('week')}>Son 7 gün</button>
        </div>
        <button className="icon-button ov-refresh" onClick={() => setTick(n => n + 1)} title="Şimdi tazele" aria-label="Verileri tazele">
          <RefreshCw size={16} className={ov.loading ? 'spin' : ''} /></button>
      </div>
    </header>

    {ov.error && <p className="form-error" role="alert">{ov.error}</p>}
    {!o && !ov.error && <div className="ov-skeleton" role="status" aria-label="Pano yükleniyor">{Array.from({ length: 6 }, (_, i) => <span key={i} />)}</div>}

    {o && c && <>
      <section className="ov-kpis" aria-label={range === 'day' ? 'Son 24 saat' : 'Son 7 gün'}>
        <Kpi icon={<Users size={16} />} label="Ziyaretçi" d={c.visitors} spark={spark('visitors')} to="/analitik" />
        <Kpi icon={<Eye size={16} />} label="Eser görüntüleme" d={c.views} spark={spark('views')} to="/analitik" />
        <Kpi icon={<BookOpen size={16} />} label="Sonuna kadar okunan" d={c.reads} />
        <Kpi icon={<MessageCircleQuestion size={16} />} label="“Esere Sor” sorusu" d={c.questions} />
        <Kpi icon={<Stamp size={16} />} label="Pasaport mührü" d={c.stamps} />
        {range === 'week' ? <Kpi icon={<UserPlus size={16} />} label="Yeni üye" d={o.compare.week.signups} />
          : <Kpi icon={<Search size={16} />} label="Arama (metin ve kamera)" d={c.searches} />}
      </section>

      <div className="ov-grid">
        <section className="ov-card ov-traffic" aria-labelledby="ov-traffic">
          <header><div><h2 id="ov-traffic">Trafik</h2>
            <p>{range === 'day' ? 'Saat saat tekil ziyaretçi; kesik çizgi dünün aynı saatleri.' : 'Son 30 günün günlük tekil ziyaretçisi.'}</p></div>
            <Link className="text-link" to="/analitik">Ayrıntılı analitik <ArrowRight size={14} /></Link></header>
          <TrendChart points={series} title={range === 'day' ? 'Saatlik ziyaretçi' : 'Günlük ziyaretçi'} unit="ziyaretçi"
            nowLabel={range === 'day' ? 'Son 24 saat' : 'Ziyaretçi'} prevLabel={range === 'day' ? 'Önceki gün' : undefined} />
          <div className="ov-split">
            <div><small>Platform</small>
              <div className="ov-platform" role="img" aria-label={`Mobil %${platformTotal ? Math.round(mobile / platformTotal * 100) : 0}, web %${platformTotal ? 100 - Math.round(mobile / platformTotal * 100) : 0}`}>
                <i style={{ width: `${platformTotal ? mobile / platformTotal * 100 : 0}%` }} /></div>
              <p><span><Smartphone size={13} /> Mobil {fmt(mobile)}</span><span><Monitor size={13} /> Web {fmt(platformTotal - mobile)}</span></p></div>
            <div><small>Kayıtlı üye</small><strong>{fmt(o.registered)}</strong></div>
            <div><small>Yayındaki eser</small><strong>{fmt(o.published)}</strong></div>
          </div>
        </section>

        <section className="ov-card ov-feed" aria-labelledby="ov-feed">
          <header><div><h2 id="ov-feed"><span className="ov-dot" aria-hidden="true" />Canlı akış</h2><p>Ziyaretçilerin son hareketleri</p></div></header>
          {o.feed.length ? <ol>{o.feed.map(f => { const [icon, label] = FEED[f.type] ?? [<Eye size={15} />, f.type]; const detail = feedDetail(f);
            return <li key={f.id}>
              <span className={`ov-feed-icon t-${f.type}`} aria-hidden="true">{icon}</span>
              <div><p><strong>{label}</strong>{detail && <span> {detail}</span>}</p>
                {f.slug && f.name_tr ? <Link to={`/eser/${encodeURIComponent(f.slug)}`}>{f.name_tr}<small> · {f.city}</small></Link> : null}</div>
              <span className="ov-feed-meta">{f.platform === 'mobile' ? <Smartphone size={12} aria-label="Mobil" /> : <Monitor size={12} aria-label="Web" />}
                <time dateTime={f.at} title={new Date(f.at).toLocaleString('tr-TR')}>{ago(f.at, now)}</time></span>
            </li>; })}</ol>
            : <p className="admin-help">Son günlerde ziyaretçi hareketi yok.</p>}
        </section>

        <section className="ov-card ov-top" aria-labelledby="ov-top">
          <header><div><h2 id="ov-top">Bu hafta en çok bakılanlar</h2><p>Tekil ziyaretçi; ok önceki haftaya göre</p></div>
            <Link className="text-link" to="/eserler?status=published">Eserler <ArrowRight size={14} /></Link></header>
          {o.top.length ? <ol>{o.top.map((m, i) => <li key={m.slug}>
            <span className="ov-rank">{i + 1}</span>
            <span className="ov-thumb">{m.thumb ? <img src={m.thumb} alt="" loading="lazy" onError={e => { e.currentTarget.style.display = 'none'; }} /> : <Eye size={16} aria-hidden="true" />}</span>
            <Link to={`/eser/${encodeURIComponent(m.slug)}`} className="ov-top-name"><strong>{m.name_tr}</strong>
              <small>{m.city} · {KIND_LABELS[m.kind] ?? m.kind}{m.questions ? ` · ${m.questions} soru` : ''}{m.avg_seconds ? ` · ort. ${m.avg_seconds} sn okuma` : ''}</small></Link>
            <span className="ov-top-n"><b>{fmt(m.visitors)}</b><Trend d={{ now: m.visitors, prev: m.visitors_prev }} /></span>
          </li>)}</ol> : <p className="admin-help">Bu hafta henüz eser görüntülenmedi.</p>}
        </section>

        <section className="ov-card ov-cities" aria-labelledby="ov-cities">
          <header><div><h2 id="ov-cities">Şehirler</h2><p>Hangi şehrin eserlerine bakılıyor (7 gün)</p></div></header>
          {o.cities.length ? <ul className="ov-bars">{o.cities.map(x => <li key={x.slug}>
            <span>{x.city}</span><span className="ov-bar"><i style={{ width: `${x.visitors / cityMax * 100}%` }} /></span><b>{fmt(x.visitors)}</b></li>)}</ul>
            : <p className="admin-help">Veri yok.</p>}
          <h3 className="ov-sub">Ne aranıyor?</h3>
          {o.searches.length ? <ul className="ov-searches">{o.searches.map(q => <li key={q.q}><span>{q.q}</span><small>{q.n}×</small>
            {q.empty > 0 && <em title="Sonuç bulunamayan arama">{q.empty} sonuçsuz</em>}</li>)}</ul>
            : <p className="admin-help">Bu hafta arama yapılmadı.</p>}
        </section>

        <section className="ov-card ov-assistant" aria-labelledby="ov-assistant">
          <header><div><h2 id="ov-assistant"><Sparkles size={18} aria-hidden="true" /> Asistan ne öneriyor?</h2>
            <p>Takvim ve ziyaretçi verisinden çıkan, yapılacak işler</p></div>
            <Link className="text-link" to="/asistan">Tümü{agent.data?.counts.open ? ` (${agent.data.counts.open})` : ''} <ArrowRight size={14} /></Link></header>
          {suggestions.length ? <ul>{suggestions.map(sg => <li key={sg.id}>
            <Link to="/asistan"><span className={`ov-tag k-${sg.kind}`}>{({ calendar: 'Takvim', anniversary: 'Yıl dönümü', experience: 'Deneyim', engagement: 'Süreklilik', content: 'İçerik' } as const)[sg.kind]}</span>
              <strong>{sg.title}</strong>{sg.action && <small>{sg.action}</small>}</Link></li>)}</ul>
            : <p className="admin-help">{agent.loading ? 'Öneriler yükleniyor…' : 'Şu an açık öneri yok.'}</p>}
        </section>

        <section className="ov-card ov-pending" aria-labelledby="ov-pending">
          <header><div><h2 id="ov-pending">Onay bekleyenler</h2><p>{waiting ? `${fmt(waiting)} iş sırada` : 'Sırada iş yok'}</p></div></header>
          <ul>{pending.map(([n, label, to, icon]) => <li key={to} className={n ? 'has' : ''}>
            <Link to={to}><span aria-hidden="true">{icon}</span><span>{label}</span><b>{fmt(n)}</b><ArrowRight size={14} aria-hidden="true" /></Link></li>)}
            <li><Link to="/yazarlar"><span aria-hidden="true"><KeyRound size={16} /></span><span>Yazar hesapları</span><ArrowRight size={14} aria-hidden="true" /></Link></li></ul>
        </section>
      </div>

      <footer className="ov-foot">
        <span>Son güncelleme {new Date(o.generated_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} · her dakika tazelenir</span>
        <label className="ov-demo"><input type="checkbox" checked={!demo} onChange={e => setDemo(!e.target.checked)} /> Yalnızca gerçek ziyaretçiler</label>
      </footer>
    </>}
  </div>;
}
