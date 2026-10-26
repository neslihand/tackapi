import { useId, useState, type CSSProperties } from 'react';
import { ArrowRight, ArrowUpRight, Check, Compass, Download, LockKeyhole, Rotate3D, Sparkles, Stamp } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTilt } from '../components/PlayScenes';
import { useContent } from '../lib/contentStore';
import { achievements, gameAchievements, type Achievement } from '../lib/progress';
import { useProgress } from '../lib/store';
import { Link } from '../lib/navigation';
import { Modal, PageHeading, symbols, Scene } from '../components/UI';

function Medallion({ achievement, large = false }: { achievement: Achievement; large?: boolean }) {
  const Icon = symbols[achievement.symbol as keyof typeof symbols];
  const arc = useId().replace(/[^\w-]/g, '');
  return <span aria-hidden="true" className={`medallion ${achievement.metal} ${achievement.value >= achievement.required ? 'unlocked' : 'locked'} ${large ? 'large' : ''}`}><span className="medallion-dots" /><span className="medallion-ring"><svg className="medallion-legend" viewBox="0 0 100 100"><path id={arc} d="M9 50A41 41 0 0 1 91 50" fill="none" /><text><textPath href={`#${arc}`} startOffset="50%" textAnchor="middle">EŞİK · ANADOLU MİRASI</textPath></text></svg><Icon strokeWidth={1} /><span className="medallion-laurels">❧ ✧ ❧</span></span></span>;
}
const metals: Record<string, string> = { bronze: 'BRONZ', silver: 'GÜMÜŞ', gold: 'ALTIN' };

// The treasury: an orbit of all medals around the next goal, then the vitrine, tier by tier (bronze, silver, gold).
const tiers = [['bronze', 'I', 'Bronz kademe', 'İlk adımların izi'], ['silver', 'II', 'Gümüş kademe', 'Merakın derinleşir'], ['gold', 'III', 'Altın kademe', 'Mirasın koruyucusu']] as const;

function MedalCard({ a, onInspect }: { a: Achievement; onInspect: () => void }) {
  const unlocked = a.value >= a.required;
  const tilt = useTilt();
  const share = Math.min(1, a.value / a.required);
  return <article className={`medal-card ${unlocked ? 'earned' : 'locked'}`} onPointerMove={tilt.move} onPointerLeave={tilt.leave}>
    <div className="medal-stage">
      <span className="medal-metal">{metals[a.metal] ?? a.metal}</span>
      {unlocked ? <span className="ex-stamp medal-stamp">KOLEKSİYONUNDA<span className="ex-seal" aria-hidden="true">✦</span></span> : <span className="medal-lock"><LockKeyhole size={13} aria-hidden="true" /> KİLİTLİ</span>}
      <span className="medal-spot" aria-hidden="true" />
      <motion.span className="medal-coin" style={tilt.style} aria-hidden="true">
        <svg className="medal-ring" viewBox="0 0 120 120"><circle cx="60" cy="60" r="56" className="track" pathLength={1} /><circle cx="60" cy="60" r="56" className="fill" pathLength={1} style={{ strokeDasharray: `${share} 1` }} /></svg>
        <Medallion achievement={a} />
        {unlocked && <span className="medal-sheen" />}
      </motion.span>
      <span className="medal-plinth" aria-hidden="true" />
    </div>
    <div className="medal-body"><h3>{a.name}</h3><p>{a.description}</p>
      <div className="medal-progress"><span className="medal-progress-bar" aria-hidden="true"><i style={{ width: `${share * 100}%` }} /></span><span>{Math.min(a.value, a.required)} / {a.required} tamamlandı</span></div>
      <button type="button" className="medallion-item" onClick={onInspect}>Madalyonu incele<span className="sr-only">: {a.name}</span> <ArrowUpRight size={15} aria-hidden="true" /></button>
    </div>
  </article>;
}

export function Achievements() {
  const { progress } = useProgress();
  const { artifacts } = useContent();
  const list = achievements(progress, artifacts);
  const [selected, setSelected] = useState<Achievement | null>(null);
  const [flipped, setFlipped] = useState(false);
  const earned = list.filter(a => a.value >= a.required).length;
  const nextGoal = list.filter(a => a.value < a.required).sort((a, b) => (b.value / b.required) - (a.value / a.required))[0];
  const centre = nextGoal ?? list[list.length - 1];
  const inspect = (a: Achievement) => { setSelected(a); setFlipped(false); };
  return <div className="treasury">
    <section className="treasury-hero" data-nav-theme="dark" aria-labelledby="medals-title">
      <div className="treasury-copy">
        <p className="pl-kicker"><span>N° 04</span><i aria-hidden="true" />Madalyonlar · Merakının hazinesi</p>
        <h1 id="medals-title" className="treasury-title"><span>Hikâyeler birikir.</span><em>İzleri sende kalır.</em></h1>
        <p className="treasury-intro">Her madalyon, attığın bir adımın hatırası. Yeni bir hikâye keşfet, koleksiyonunu büyüt.</p>
        <section className="medal-summary" aria-label="Koleksiyon özeti">
          <div className="medal-summary-count"><p><strong>{earned}</strong><span aria-hidden="true"> / {list.length}</span><small><span className="sr-only">{list.length} madalyondan </span>Madalyon koleksiyonunda</small></p></div>
          <div className="medal-summary-bar" aria-hidden="true"><i style={{ width: `${earned / list.length * 100}%` }} /></div>
          <dl className="medal-summary-stats"><div><dt>Keşif</dt><dd>{Object.keys(progress.discovered).length} / {artifacts.length}</dd></div><div><dt>Quiz turu</dt><dd>{progress.quiz.completed}</dd></div><div><dt>En iyi puan</dt><dd>{progress.quiz.best}</dd></div><div><dt>Yapboz / dosya</dt><dd>{Object.keys(progress.games.puzzle).length} / {Object.keys(progress.games.detective).length}</dd></div></dl>
          {nextGoal && <p className="medal-summary-next"><Sparkles size={15} aria-hidden="true" /> Sıradaki hedef: <strong>{nextGoal.name}</strong> · {Math.min(nextGoal.value, nextGoal.required)} / {nextGoal.required}</p>}
        </section>
      </div>
      <div className="orbit-stage" aria-hidden="true">
        <div className="orbit-plane">
          <span className="orbit-path" /><span className="orbit-path inner" />
          {list.map((a, i) => <span key={a.id} className={`orbit-slot ${a.value >= a.required ? 'won' : ''}`} style={{ '--a': `${(360 / list.length) * i}deg` } as CSSProperties}><span className="orbit-coin" onClick={() => inspect(a)}><Medallion achievement={a} /></span></span>)}
        </div>
        <div className="orbit-centre"><span className="orbit-spin"><Medallion achievement={centre} large /></span></div>
        <span className="orbit-caption">{nextGoal ? <>Sıradaki · <b>{nextGoal.name}</b></> : <>Koleksiyon <b>tamamlandı</b></>}</span>
      </div>
      <div className="pl-grain" aria-hidden="true" />
    </section>

    <section className="vitrine" aria-label="Madalyon vitrini">
      {tiers.map(([metal, numeral, title, note]) => {
        const row = list.filter(a => a.metal === metal);
        if (!row.length) return null;
        const won = row.filter(a => a.value >= a.required).length;
        return <div key={metal} className={`vitrine-tier tier-${metal}`}>
          <header className="vitrine-head"><span className="vitrine-numeral" aria-hidden="true">{numeral}</span><div><h2>{title}</h2><p>{note}</p></div><span className="vitrine-count">{won} / {row.length}</span></header>
          <ul className="medal-grid">{row.map((a, i) => <motion.li key={a.id} initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.8, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}><MedalCard a={a} onInspect={() => inspect(a)} /></motion.li>)}</ul>
        </div>;
      })}
      <div className="collection-bottom"><p>Her yeni keşif, <em>yeni bir kapıyı aralar.</em></p><div><Link className="button gold" to="/kesfet">Keşfe devam et <ArrowRight size={18} aria-hidden="true" /></Link><Link className="text-link" to="/pasaport">Pasaportumu aç <ArrowUpRight size={16} aria-hidden="true" /></Link></div></div>
    </section>
{selected && <Modal title={selected.name} onClose={() => setSelected(null)}><span className="medal-modal-metal">{metals[selected.metal] ?? selected.metal} MADALYON</span><button className={`medallion-inspect ${flipped ? 'flipped' : ''}`} onClick={() => setFlipped(!flipped)} aria-label="Madalyonu çevir" aria-pressed={flipped}><span className="medallion-front"><Medallion achievement={selected} large /></span><span className="medallion-back"><Compass size={50} strokeWidth={1} /><strong>{selected.value >= selected.required ? 'BU İZ SENİN' : 'SIRADAKİ KEŞFİN'}</strong><span>EŞİK · MİRAS KOLEKSİYONU</span></span></button><span className="flip-hint"><Rotate3D size={15} aria-hidden="true" /> Çevirmek için madalyona dokun</span><p>{selected.description}</p><p className="achievement-modal-progress">{Math.min(selected.value, selected.required)} / {selected.required} tamamlandı</p><Link className="button dark" to={selected.id === 'quiz' ? '/oyun/quiz' : gameAchievements.includes(selected.id) ? '/oyun/oyunlar' : '/kesfet'} onClick={() => setSelected(null)}>{selected.value >= selected.required ? 'Keşfe devam et' : 'Göreve başla'}<ArrowUpRight size={17} aria-hidden="true" /></Link></Modal>}</div>;
}

export function Passport() {
  const { progress, storageAvailable, notify } = useProgress();
  const { artifacts } = useContent();
  const found = artifacts.filter(a => progress.discovered[a.id]);
  const cities = new Set(found.map(a => a.city)).size;
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(found.length / 4));
  function download() {
    const content = { platform: 'EŞİK — Tarihe Açılan Kapı', exportedAt: new Date().toISOString(), notice: 'Dijital keşif kaydıdır; fiziksel ziyaret doğrulaması içermez.', discoveries: found.map(a => ({ name: a.name, city: a.city, discoveredAt: progress.discovered[a.id] })), achievements: achievements(progress, artifacts).filter(a => a.value >= a.required).map(a => a.name), quiz: progress.quiz };
    const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'esik-miras-pasaportum.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); notify('Pasaportun JSON dosyası olarak indirildi.');
  }
  return <Scene><div className="page-shell passport-page"><PageHeading kicker="SENİN KEŞİF GÜNLÜĞÜN" title={<>Biriktirdiğin <em>hikâyeler.</em></>}>Bir yerin hikâyesini öğrendiğinde, o yer artık biraz da senindir.</PageHeading><div className="passport-stats"><div><strong>{found.length.toString().padStart(2, '0')}</strong><span>KEŞFEDİLEN ESER</span></div><div><strong>{cities.toString().padStart(2, '0')}</strong><span>FARKLI ŞEHİR</span></div><div><strong>{achievements(progress, artifacts).filter(a => a.value >= a.required).length.toString().padStart(2, '0')}</strong><span>KAZANILAN MADALYON</span></div></div><div className="passport-book"><div className="passport-cover"><span>TÜRKİYE KÜLTÜREL MİRASI</span><div className="passport-cover-frame"><Compass size={90} strokeWidth={0.7} /><h2>MİRAS<br />PASAPORTU</h2><div className="cover-rule" /><p>Merakla başlayan<br />bir ömürlük yolculuk.</p></div><span>EŞİK · DİJİTAL KEŞİF GÜNLÜĞÜ</span></div><div className="passport-paper"><div className="paper-heading"><span>KEŞİF MÜHÜRLERİ</span><Stamp size={22} /></div>{!found.length ? <div className="passport-empty"><Compass size={53} strokeWidth={1} /><h3>İlk mühür,<br /><em>ilk hikâyeni bekliyor.</em></h3><p>Bir eserin hikâyesini oku ve sonunda “Pasaportuma mühürle” seçeneğine dokun.</p><Link className="text-link" to="/kesfet">İlk keşfine başla <ArrowUpRight size={17} /></Link></div> : <div className="passport-stamp-grid" key={page}>{found.slice(page * 4, page * 4 + 4).map((a, i) => <Link className={`passport-stamp stamp-${i}`} to={`/eser/${a.slug}`} key={a.id}><span>{a.city.toLocaleUpperCase('tr-TR')}</span><Stamp size={29} strokeWidth={1.2} /><strong>{a.name}</strong><small>{new Date(progress.discovered[a.id]).toLocaleDateString('tr-TR')}</small><span>DİJİTAL KEŞİF · EŞİK</span></Link>)}</div>}<div className="passport-pagination"><button onClick={() => setPage(p => p - 1)} disabled={page === 0} aria-label="Önceki pasaport sayfası">←</button><span role="status">SAYFA {page + 1} / {pages}</span><button onClick={() => setPage(p => p + 1)} disabled={page + 1 >= pages} aria-label="Sonraki pasaport sayfası">→</button></div></div></div><div className="passport-bottom"><p>{storageAvailable ? 'İlerlemen bu tarayıcıda saklanır. Tarayıcı verilerini silmek pasaportunu da siler.' : 'Tarayıcı depolaması kullanılamıyor. İlerlemen yalnızca bu oturumda tutuluyor.'}<br />Mühürler dijital keşfi temsil eder; fiziksel ziyaret doğrulaması değildir.</p><button className="text-link" onClick={download}><Download size={17} /> Pasaportumu indir</button></div></div></Scene>;
}
