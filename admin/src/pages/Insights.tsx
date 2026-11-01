import { useEffect, useState, type ReactNode } from 'react';
import { Save } from 'lucide-react';
import { api } from '../lib/api';
import { Link } from '../lib/navigation';
import type { Insights, SiteSettings } from '../lib/types';
import { BarList, DataTable, LineChart } from '../components/Charts';
import { PageHead, useLoad, useToast } from '../components/UI';

const pct = (a: number, b: number) => (b ? Math.round(a / b * 100) : 0);
const MODE_LABELS: Record<string, string> = { auto: 'Veriye göre (otomatik)', short: 'Detaylı Anlatım', story: 'Hikâyeleştirerek', child: 'Çocuklar İçin' };
const CAMERA: Record<string, string> = { match: 'Eser bulundu', unsure: 'Emin olunamadı (adaylar)', none: 'Bulunamadı' };
const KIND_LABELS: Record<string, string> = { gap: 'Eksik içerik', drop: 'Yarım bırakılıyor', question: 'Cevapsız soru', search: 'Sonuçsuz arama', segment: 'Az ulaşılan kesim' };

/**
 * Veriyle gelişen döngü: Etkileşim → Analiz → İçgörü → Yeni Keşif. Olaylar yalnızca izin veren ziyaretçilerden gelir;
 * ziyaretçi = tarayıcı. Deneme verisi (demo_activity.py) ayrı işaretlidir ve buradan gizlenebilir.
 */
export function InsightsPage() {
  const [days, setDays] = useState(30);
  const [demo, setDemo] = useState(true);
  const data = useLoad(() => api.insights(days, demo), [days, demo]);
  type Option = { id: string; label: string };
  const options = useLoad(() => fetch('/api/profile-options').then(r => r.json()) as Promise<{ age_ranges: Option[]; purposes: Option[]; interests: Option[] }>, []);
  const d = data.data;
  const label = (list: 'age_ranges' | 'purposes' | 'interests', id: string) => options.data?.[list].find(o => o.id === id)?.label ?? id;
  return <>
    <PageHead kicker="VERİYLE GELİŞEN DÖNGÜ" title="Ziyaretçi analitiği"
      actions={<div className="insights-filters">
        <label>Dönem <select value={days} onChange={e => setDays(Number(e.target.value))}>{[7, 30, 90].map(n => <option key={n} value={n}>Son {n} gün</option>)}</select></label>
        <label className="pilot-toggle"><input type="checkbox" checked={demo} onChange={e => setDemo(e.target.checked)} /> Deneme verisini göster</label>
      </div>}>
      Etkileşim → Analiz → İçgörü → Yeni Keşif. Olaylar yalnızca izin veren ziyaretçilerden, kimliksiz toplanır (IP saklanmaz); “ziyaretçi” bir tarayıcıdır.
    </PageHead>
    {data.error && <p className="form-error" role="alert">{data.error}</p>}
    {!d && !data.error && <p role="status">Pano hazırlanıyor…</p>}
    {d && <>
      {d.demo && d.totals.demo_events > 0 && <p className="admin-note">Bu görünümde {d.totals.demo_events.toLocaleString('tr-TR')} deneme olayı var (sunum için üretilmiş; gerçek ziyaretçi değildir). Gizlemek için “Deneme verisini göster”i kapatın.</p>}
      <section className="kpi-row" aria-label="Genel sayılar">
        <Kpi value={d.totals.visitors} label="ziyaretçi" />
        <Kpi value={d.totals.events} label="etkileşim" />
        <Kpi value={d.totals.views_per_visitor} label="eser / ziyaretçi" />
        <Kpi value={d.totals.registered} label="kayıtlı hesap" note={`${d.totals.active_users} tanesi bu dönemde etkin`} />
      </section>

      <Step n={1} title="Etkileşim" lede="Ziyaretçiler ne yapıyor?">
        <div className="insights-grid">
          <Card title="Günlük ziyaretçi" wide><LineChart title="Günlük ziyaretçi" label="ziyaretçi" points={d.daily.map(r => ({ x: r.day, y: r.visitors }))} /></Card>
          <Card title="Haftalık anlamlı keşif (WMHE)" wide note="Haftada en az bir kez hikâyenin %75'ini okuyan ya da dinleyen, yerinde mühür alan, soruyu doğru yanıtlayan, rotayı bitiren ya da katkısı onaylanan tekil kişi. Uygulamayı açmak sayılmaz.">
            <LineChart title="Haftalık anlamlı keşif" label="kişi" points={d.wmhe.map(r => ({ x: r.week, y: r.explorers }))} />
            <DataTable title="WMHE haftalık dökümü" head={['Hafta', 'Kişi', 'Mobil', 'Hikâye', 'Yerinde', 'Doğru yanıt', 'Rota', 'Katkı']}
              rows={d.wmhe.map(r => [r.week, r.explorers, r.mobile, r.stories, r.onsite, r.recalled, r.routes, r.contributions])} />
          </Card>
          <Card title="Pilot kohortları" wide note="Kohort: kişinin ilk geldiği hafta. Aktive: ilk 24 saatte bir hikâyeyi gerçekten okudu. Dönüş yalnızca anlamlı eylemle sayılır, uygulamayı açmak sayılmaz. Payda o günü doldurmuş kişilerdir. 20 kişinin altında yüzde gösterilmez; hedef ilk dört haftanın verisinden sonra konur.">
            <PlainTable title="Haftalık kohortlar" head={['Hafta', 'Kişi', 'Aktive (24 sa)', 'Anlamlı (7 gün)', 'D1', 'D7', 'D30', '4 haftanın 2’si']}
              rows={d.cohorts.map(r => [r.week, r.people, rate(r.activated, r.people), rate(r.meaningful_7d, r.people), rate(r.d1, r.d1_of), rate(r.d7, r.d7_of), rate(r.d30, r.d30_of), rate(r.two_of_four, r.weeks_of)])} />
            <PlainTable title="Öğrenme, saha, yayılma, kalite" head={['Ölçü', 'Değer']}
              rows={[['Hikâye tamamlama (%75)', rate(d.kpis.stories_completed, d.kpis.stories_started)], ['Hatırla 7 ve 21 gün doğru', rate(d.kpis.long_recalls_right, d.kpis.long_recalls)],
                ['Rota tamamlama', rate(d.kpis.routes_completed, d.kpis.routes_started)], ['Yerinde mühür alan kişi', rate(d.kpis.onsite_people, d.kpis.active_people)],
                ['Paylaşım / bağlantıdan açılış', `${d.kpis.shares} / ${d.kpis.shares_opened}`], ['Çevrimdışı paket', d.kpis.offline_packages],
                ['Bildirim kapatma', d.kpis.notification_opt_outs], ['Sunucu hatası', d.kpis.api_errors]]} />
          </Card>
          <Card title="Platform" note="Mobil olaylar platform alanıyla ayrılır; geliştirme derlemesi sayılmaz.">
            <BarList title="Platform" rows={d.platforms.map(r => ({ key: r.platform, label: r.platform === 'mobile' ? 'Mobil uygulama' : 'Web sitesi', value: r.visitors, detail: `${r.events.toLocaleString('tr-TR')} olay` }))} />
          </Card>
          <Card title="Keşif hunisi" note="Dönemdeki ziyaretçilerin her adıma ulaşanı">
            <BarList title="Keşif hunisi" max={d.funnel.visited} rows={([['visited', 'Siteye geldi'], ['viewed', 'Bir eser açtı'], ['read', 'Metnin sonuna yaklaştı'],
              ['asked', '“Esere Sor”a sordu'], ['stamped', 'Pasaportuna mühürledi'], ['contributed', 'Katkı yaptı']] as const).map(([k, l]) =>
              ({ key: k, label: l, value: d.funnel[k], detail: `Gelenlerin %${pct(d.funnel[k], d.funnel.visited)}'i` }))} />
          </Card>
          <Card title="Anlatım biçimi tercihi">
            <BarList title="Anlatım biçimi tercihi" rows={d.modes.map(m => ({ key: m.mode, label: m.label, value: m.n,
              detail: `Seçimlerin %${pct(m.n, d.modes.reduce((s, x) => s + x.n, 0))}'i` }))} />
          </Card>
        </div>
      </Step>

      <Step n={2} title="Analiz" lede="Kimler, neyi, nasıl keşfediyor?">
        <div className="insights-grid">
          <Card title="Ziyaretçi profilleri" wide note="Davranıştan açık kurallarla çıkar; bir ziyaretçi birden çok profile girebilir, burada baskın olanı sayılır.">
            <BarList title="Ziyaretçi profilleri" max={d.totals.visitors} rows={d.segments.map(s => ({ key: s.id, value: s.visitors, muted: s.id === 'browser',
              label: <span className="seg-label"><strong>{s.name}</strong><small>{s.description}</small></span>,
              detail: `%${pct(s.visitors, d.totals.visitors)} baskın · ${s.any} ziyaretçide görülüyor · tercih: ${topMode(s.modes)}` }))} />
          </Card>
          <Card title="En çok ilgi gören eserler" wide>
            <BarList title="En çok ilgi gören eserler" rows={d.monuments.slice(0, 12).map(m => ({ key: m.slug, value: m.visitors,
              label: <Link className="text-link" to={`/eser/${encodeURIComponent(m.slug)}`}>{m.name_tr} <small>· {m.city}</small></Link>,
              detail: `${m.avg_seconds ?? 0} sn ortalama okuma · ${m.deep} sonuna yakın okuyan · ${m.questions} soru · ${m.stamps} mühür · ${m.favorites} favori` }))} unit=" ziyaretçi" />
          </Card>
          <Card title="Kamera ile keşif">
            <BarList title="Kamera ile keşif" rows={d.camera.map(c => ({ key: c.result, label: CAMERA[c.result] ?? c.result, value: c.n }))} />
          </Card>
          <Card title="Aramalar" note="Sonuçsuz aramalar ayrıca sayılır">
            {d.searches.length ? <table className="insights-table"><thead><tr><th>Aranan</th><th>Kez</th><th>Sonuçsuz</th></tr></thead>
              <tbody>{d.searches.slice(0, 10).map(s => <tr key={s.q}><th scope="row">{s.q}</th><td>{s.n}</td><td>{s.empty}</td></tr>)}</tbody></table>
              : <p className="admin-help">Henüz arama yok.</p>}
          </Card>
          <Card title="“Esere Sor” soruları" wide note="“Bilgi yok”: kaynakta cevabı bulunamadı">
            {d.questions.length ? <table className="insights-table"><thead><tr><th>Soru</th><th>Eser</th><th>Kez</th><th>Bilgi yok</th></tr></thead>
              <tbody>{d.questions.slice(0, 12).map(q => <tr key={`${q.slug}-${q.question}`}><th scope="row">{q.question}</th><td>{q.slug}</td><td>{q.n}</td><td>{q.no_info}</td></tr>)}</tbody></table>
              : <p className="admin-help">Henüz soru yok.</p>}
          </Card>
          <Card title="Kayıtlı kullanıcıların beyanı" wide note="İsteğe bağlı kayıt bilgileri; boş bırakanlar “belirtilmedi”">
            <div className="insights-grid inner">
              <BarList showTitle title="Yaş aralığı" rows={d.profile.age_range.map(r => ({ key: r.value, label: label('age_ranges', r.value), value: r.n }))} empty="Kayıtlı kullanıcı yok." />
              <BarList showTitle title="Yaşadığı şehir" rows={d.profile.home_city.map(r => ({ key: r.value, label: r.value, value: r.n }))} empty="—" />
              <BarList showTitle title="Ziyaret amacı" rows={d.profile.purposes.map(r => ({ key: r.value, label: label('purposes', r.value), value: r.n }))} empty="—" />
              <BarList showTitle title="İlgi alanları" rows={d.profile.interests.map(r => ({ key: r.value, label: label('interests', r.value), value: r.n }))} empty="—" />
            </div>
          </Card>
        </div>
      </Step>

      <Step n={3} title="İçgörü" lede="Veriler neyi geliştirmemizi söylüyor?">
        {d.suggestions.length ? <ul className="suggestions">{d.suggestions.map((s, i) => <li key={i} className={`suggestion ${s.kind}`}>
          <small>{KIND_LABELS[s.kind]}</small><strong>{s.slug ? <Link className="text-link" to={`/eser/${encodeURIComponent(s.slug)}`}>{s.title}</Link> : s.title}</strong>
          <span>{s.detail}</span><em>{s.action}</em></li>)}</ul>
          : <p className="admin-help">Bu dönem için öneri yok; daha çok veri birikince öneriler çıkar.</p>}
      </Step>

      <Step n={4} title="Yeni Keşif" lede="Site öğrendiklerini ziyaretçiye nasıl geri veriyor?">
        <div className="insights-grid">
          <Card title="Varsayılan deneyim"><SettingsForm settings={d.settings} onSaved={data.reload} /></Card>
          <Card title="Sitede kendiliğinden değişenler">
            <ul className="loop-list">
              <li><strong>Senin için</strong> — her ziyaretçiye baktığı şehir, dönem ve türe, sevdiği anlatım biçimine ve beyan ettiği ilgilere göre görmediği eserler önerilir (gerekçesiyle).</li>
              <li><strong>En çok merak edilenler</strong> — son 7 günde en çok ziyaretçinin baktığı eserler ana sayfada ve keşifte.</li>
              <li><strong>Varsayılan anlatım biçimi ve öne çıkan rota</strong> — “veriye göre” seçiliyse son 30 günün tercihine göre.</li>
              <li>Deneme verisi bu üçünde hiç kullanılmaz.</li>
            </ul>
          </Card>
        </div>
      </Step>
    </>}
  </>;
}

function topMode(modes: Record<string, number>) {
  const best = Object.entries(modes).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] ? MODE_LABELS[best[0]] : 'henüz yok';
}

function Kpi({ value, label, note }: { value: number; label: string; note?: string }) {
  return <div className="kpi"><strong>{value.toLocaleString('tr-TR')}</strong><span>{label}</span>{note && <small>{note}</small>}</div>;
}

function Step({ n, title, lede, children }: { n: number; title: string; lede: string; children: React.ReactNode }) {
  return <section className="loop-step" aria-labelledby={`step-${n}`}><header><span className="loop-n">{n}</span><div><h2 id={`step-${n}`}>{title}</h2><p>{lede}</p></div></header>{children}</section>;
}

function Card({ title, note, wide, children }: { title: string; note?: string; wide?: boolean; children: React.ReactNode }) {
  return <article className={`insight-card ${wide ? 'wide' : ''}`}><h3>{title}</h3>{note && <p className="admin-help">{note}</p>}{children}</article>;
}

/** Küçük örneklemde yüzde yanıltıcıdır: 20 kişinin altında yalnızca sayı. Paydası olmayan oran boş kalır. */
const rate = (n: number, of: number) => !of ? '—' : of < 20 ? `${n}/${of}` : `${n}/${of} (%${Math.round(n / of * 100)})`;

function PlainTable({ title, head, rows }: { title: string; head: string[]; rows: ReactNode[][] }) {
  return <table className="insights-table"><caption className="sr-only">{title}</caption><thead><tr>{head.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, k) => k === 0 ? <th key={k} scope="row">{c}</th> : <td key={k}>{c}</td>)}</tr>)}</tbody></table>;
}

const FLAG_ROWS: [string, string][] = [['onboarding_v2', 'Karşılama ekranı'], ['short_stories', 'Kısa özet'], ['three_details', 'Üç detay'], ['weekly_discovery', 'Haftanın Keşfi'], ['flexible_streak', 'Esnek ritim'],
  ['spaced_repetition', 'Hatırla'], ['tiered_medals', 'Kademeli madalyonlar'], ['daily_hunt', 'Detay Avı'], ['mini_games', 'Mini oyunlar ve bilgi kartları'], ['question_follow', 'Soru takibi'], ['personalization', 'Kişiselleştirme (Sana göre)']];
const TIER_NAMES = ['bronz', 'gümüş', 'altın'];
const TIER_ROWS: ['read' | 'onsite' | 'recall' | 'city_read', string][] = [['read', 'Okunan hikâye (eser sayısı)'], ['onsite', 'Yerinde mühür (eser sayısı)'],
  ['recall', 'Hatırla kartı (eser sayısı)'], ['city_read', 'Şehirde okunan (eserlerin yüzdesi)']];

function SettingsForm({ settings, onSaved }: { settings: Insights['settings']; onSaved: () => void }) {
  const notify = useToast();
  const routes = useLoad(() => api.routes(), []);
  const [f, setF] = useState<SiteSettings>(settings.stored);
  useEffect(() => setF(settings.stored), [settings.stored]);
  const [busy, setBusy] = useState(false);
  const options = [...(routes.data?.routes.filter(r => r.published).map(r => ({ id: r.slug, title: r.title })) ?? []),
    ...(routes.data?.auto.map(r => ({ id: r.id, title: r.title })) ?? [])];
  async function save() {
    const steps = [f.medal_tiers.read, f.medal_tiers.onsite, f.medal_tiers.recall, f.medal_tiers.city_read];
    if (steps.some(([a, b, c]) => !(a >= 1 && a < b && b < c)) || f.medal_tiers.city_read[2] > 100) { notify('Madalyon eşikleri soldan sağa artan pozitif sayılar olmalı; yüzde 100’ü geçemez.', true); return; }
    setBusy(true);
    try { await api.saveSettings(f); notify('Ayarlar kaydedildi'); onSaved(); }
    catch (e) { notify((e as Error).message, true); }
    finally { setBusy(false); }
  }
  const eff = settings.effective;
  return <div className="admin-form flat">
    <label className="admin-field"><span>Varsayılan anlatım biçimi</span>
      <select value={f.default_mode} onChange={e => setF({ ...f, default_mode: e.target.value })}>{Object.entries(MODE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <small>Şu an sitede: <strong>{MODE_LABELS[eff.default_mode]}</strong> ({eff.source.default_mode}). Ziyaretçi kendi seçimini yaparsa onunki geçerlidir.</small></label>
    <label className="admin-field"><span>Öne çıkan rota</span>
      <select value={f.featured_route ?? 'auto'} onChange={e => setF({ ...f, featured_route: e.target.value })}>
        <option value="auto">Veriye göre (otomatik)</option><option value="none">Yok</option>
        {options.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}</select>
      <small>Şu an sitede: <strong>{options.find(o => o.id === eff.featured_route)?.title ?? (eff.featured_route || 'yok')}</strong> ({eff.source.featured_route}).</small></label>
    <fieldset className="admin-field"><legend>Kademeli madalyon eşikleri</legend>
      <small>Telefonda pasaportta görünür; uygulama güncellemesi gerekmez. Başlangıç değerleri varsayımdır, gerçek kullanım görülünce ayarlanmalı. Her satır bronz, gümüş, altın; artan olmalı.</small>
      {TIER_ROWS.map(([key, label]) => <label key={key}><span>{label}</span>
        <span style={{ display: 'flex', gap: 8 }}>{f.medal_tiers[key].map((n, i) => <input key={i} type="number" min={1} value={n} aria-label={`${label}, ${TIER_NAMES[i]}`} style={{ width: 80 }}
          onChange={e => setF({ ...f, medal_tiers: { ...f.medal_tiers, [key]: f.medal_tiers[key].map((x, j) => j === i ? Number(e.target.value) : x) } })} />)}</span></label>)}
      <label><span>Şehir Ustası: şehrin yerinde mühürlenmiş eser yüzdesi</span>
        <span style={{ display: 'flex' }}><input type="number" min={1} max={100} value={f.medal_tiers.master_onsite} style={{ width: 80 }} onChange={e => setF({ ...f, medal_tiers: { ...f.medal_tiers, master_onsite: Number(e.target.value) } })} /></span></label>
    </fieldset>
    <fieldset className="admin-field"><legend>Telefondaki modüller</legend>
      <small>Bir modül sorun çıkarırsa buradan kapatılır, uygulama güncellemesi gerekmez. Kapatılan modül bir sonraki açılışta kaybolur; sunucuya ulaşamayan telefon son bildiği durumda kalır.</small>
      {FLAG_ROWS.map(([key, label]) => <label key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={f.app_flags?.[key] !== false} onChange={e => setF({ ...f, app_flags: { ...f.app_flags, [key]: e.target.checked } })} /><span>{label}</span></label>)}
    </fieldset>
    <div className="admin-actions"><button className="button dark small" disabled={busy} onClick={save}><Save size={15} /> Kaydet</button></div>
    <DataTable title="Ayarlar" head={['Ayar', 'Kayıtlı', 'Sitede']} rows={[['Anlatım biçimi', MODE_LABELS[f.default_mode], MODE_LABELS[eff.default_mode]],
      ['Öne çıkan rota', f.featured_route ?? 'auto', eff.featured_route ?? 'yok']]} />
  </div>;
}
