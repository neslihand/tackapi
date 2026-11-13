import { useId, useState, type CSSProperties } from 'react';
import { ArrowRight, ArrowUpRight, Check, Compass, Download, LockKeyhole, Rotate3D, Sparkles, Stamp } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTilt } from '../components/PlayScenes';
import { useContent } from '../lib/contentStore';
import { achievements, gameAchievements, type Achievement } from '../lib/progress';
import type { DiscoveryArtifact } from '../lib/artifactContract';
import { useProgress } from '../lib/store';
import { useKeptIn } from '../lib/account';
import { Link } from '../lib/navigation';
import { locale, t } from '../lib/i18n';
import { Modal, PageHeading, symbols, Scene } from '../components/UI';

function Medallion({ achievement, large = false }: { achievement: Achievement; large?: boolean }) {
  const Icon = symbols[achievement.symbol as keyof typeof symbols];
  const arc = useId().replace(/[^\w-]/g, '');
  return <span aria-hidden="true" className={`medallion ${achievement.metal} ${achievement.value >= achievement.required ? 'unlocked' : 'locked'} ${large ? 'large' : ''}`}><span className="medallion-dots" /><span className="medallion-ring"><svg className="medallion-legend" viewBox="0 0 100 100"><path id={arc} d="M9 50A41 41 0 0 1 91 50" fill="none" /><text><textPath href={`#${arc}`} startOffset="50%" textAnchor="middle">{t('TAÇKAPI · ANADOLU MİRASI', 'TAÇKAPI · ANATOLIAN HERITAGE')}</textPath></text></svg><Icon strokeWidth={1} /><span className="medallion-laurels">❧ ✧ ❧</span></span></span>;
}
const metals = (): Record<string, string> => ({ bronze: t('BRONZ', 'BRONZE'), silver: t('GÜMÜŞ', 'SILVER'), gold: t('ALTIN', 'GOLD') });

/** Every medallion small in one row, the earned ones lit and the others with how far along they are; each opens the
 *  medal room. On the passport page and in Hesabım. */
export function MedalShelf({ list }: { list: Achievement[] }) {
  return <ul className="medal-shelf">{list.map(a => {
    const won = a.value >= a.required;
    return <li key={a.id} className={won ? 'won' : ''}><Link to="/basarimlar">
      <span className="medal-shelf-coin"><Medallion achievement={a} /></span>
      <strong>{a.name}</strong>
      <small>{won ? t('Kazanıldı', 'Earned') : `${Math.min(a.value, a.required)} / ${a.required}`}</small>
    </Link></li>;
  })}</ul>;
}

/** One stamp of the passport: the work's city, its name and the day it was stamped; opens the work. */
export function PassportStamp({ artifact, at, index }: { artifact: DiscoveryArtifact; at: string; index: number }) {
  return <Link className={`passport-stamp stamp-${index}`} to={`/eser/${artifact.slug}`}><span>{artifact.city.toLocaleUpperCase(locale())}</span><Stamp size={29} strokeWidth={1.2} /><strong>{artifact.name}</strong><small>{new Date(at).toLocaleDateString(locale())}</small><span>{t('DİJİTAL KEŞİF · TAÇKAPI', 'DIGITAL DISCOVERY · TAÇKAPI')}</span></Link>;
}

// The treasury: an orbit of all medals around the next goal, then the vitrine, tier by tier (bronze, silver, gold).
const tiers = () => [['bronze', 'I', t('Bronz kademe', 'Bronze tier'), t('İlk adımların izi', 'The trace of your first steps')], ['silver', 'II', t('Gümüş kademe', 'Silver tier'), t('Merakın derinleşir', 'Your curiosity deepens')], ['gold', 'III', t('Altın kademe', 'Gold tier'), t('Mirasın koruyucusu', 'Guardian of heritage')]] as const;

function MedalCard({ a, onInspect }: { a: Achievement; onInspect: () => void }) {
  const unlocked = a.value >= a.required;
  const tilt = useTilt();
  const share = Math.min(1, a.value / a.required);
  return <article className={`medal-card ${unlocked ? 'earned' : 'locked'}`} onPointerMove={tilt.move} onPointerLeave={tilt.leave}>
    <div className="medal-stage">
      <span className="medal-metal">{metals()[a.metal] ?? a.metal}</span>
      {unlocked ? <span className="ex-stamp medal-stamp">{t('KOLEKSİYONUNDA', 'IN YOUR COLLECTION')}<span className="ex-seal" aria-hidden="true">✦</span></span> : <span className="medal-lock"><LockKeyhole size={13} aria-hidden="true" /> {t('KİLİTLİ', 'LOCKED')}</span>}
      <span className="medal-spot" aria-hidden="true" />
      <motion.span className="medal-coin" style={tilt.style} aria-hidden="true">
        <svg className="medal-ring" viewBox="0 0 120 120"><circle cx="60" cy="60" r="56" className="track" pathLength={1} /><circle cx="60" cy="60" r="56" className="fill" pathLength={1} style={{ strokeDasharray: `${share} 1` }} /></svg>
        <Medallion achievement={a} />
        {unlocked && <span className="medal-sheen" />}
      </motion.span>
      <span className="medal-plinth" aria-hidden="true" />
    </div>
    <div className="medal-body"><h3>{a.name}</h3><p>{a.description}</p>
      <div className="medal-progress"><span className="medal-progress-bar" aria-hidden="true"><i style={{ width: `${share * 100}%` }} /></span><span>{Math.min(a.value, a.required)} / {a.required} {t('tamamlandı', 'done')}</span></div>
      <button type="button" className="medallion-item" onClick={onInspect}>{t('Madalyonu incele', 'Look at the medallion')}<span className="sr-only">: {a.name}</span> <ArrowUpRight size={15} aria-hidden="true" /></button>
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
        <p className="pl-kicker">{t('Madalyonlar · Merakının hazinesi', 'Medallions · The treasury of your curiosity')}</p>
        <h1 id="medals-title" className="treasury-title"><span>{t('Hikâyeler birikir.', 'Stories add up.')}</span><em>{t('İzleri sende kalır.', 'Their traces stay with you.')}</em></h1>
        <p className="treasury-intro">{t('Her madalyon, attığın bir adımın hatırası. Yeni bir hikâye keşfet, koleksiyonunu büyüt.', 'Every medallion is the memory of a step you took. Discover a new story and grow your collection.')}</p>
        <section className="medal-summary" aria-label={t('Koleksiyon özeti', 'Collection summary')}>
          <div className="medal-summary-count"><p><strong>{earned}</strong><span aria-hidden="true"> / {list.length}</span><small><span className="sr-only">{t(`${list.length} madalyondan `, `of ${list.length} medallions `)}</span>{t('Madalyon koleksiyonunda', 'Medallions in your collection')}</small></p></div>
          <div className="medal-summary-bar" aria-hidden="true"><i style={{ width: `${earned / list.length * 100}%` }} /></div>
          <dl className="medal-summary-stats"><div><dt>{t('Keşif', 'Discoveries')}</dt><dd>{Object.keys(progress.discovered).length} / {artifacts.length}</dd></div><div><dt>{t('Quiz turu', 'Quiz rounds')}</dt><dd>{progress.quiz.completed}</dd></div><div><dt>{t('En iyi puan', 'Best score')}</dt><dd>{progress.quiz.best}</dd></div><div><dt>{t('Yapboz / dosya', 'Puzzles / files')}</dt><dd>{Object.keys(progress.games.puzzle).length} / {Object.keys(progress.games.detective).length}</dd></div></dl>
          {nextGoal && <p className="medal-summary-next"><Sparkles size={15} aria-hidden="true" /> {t('Sıradaki hedef', 'Next goal')}: <strong>{nextGoal.name}</strong> · {Math.min(nextGoal.value, nextGoal.required)} / {nextGoal.required}</p>}
        </section>
      </div>
      <div className="orbit-stage" aria-hidden="true">
        <div className="orbit-plane">
          <span className="orbit-path" /><span className="orbit-path inner" />
          {list.map((a, i) => <span key={a.id} className={`orbit-slot ${a.value >= a.required ? 'won' : ''}`} style={{ '--a': `${(360 / list.length) * i}deg` } as CSSProperties}><span className="orbit-coin" onClick={() => inspect(a)}><Medallion achievement={a} /></span></span>)}
        </div>
        <div className="orbit-centre"><span className="orbit-spin"><Medallion achievement={centre} large /></span></div>
        <span className="orbit-caption">{nextGoal ? <>{t('Sıradaki', 'Next')} · <b>{nextGoal.name}</b></> : <>{t('Koleksiyon', 'Collection')} <b>{t('tamamlandı', 'complete')}</b></>}</span>
      </div>
      <div className="pl-grain" aria-hidden="true" />
    </section>

    <section className="vitrine" aria-label={t('Madalyon vitrini', 'Medallion showcase')}>
      {tiers().map(([metal, numeral, title, note]) => {
        const row = list.filter(a => a.metal === metal);
        if (!row.length) return null;
        const won = row.filter(a => a.value >= a.required).length;
        return <div key={metal} className={`vitrine-tier tier-${metal}`}>
          <header className="vitrine-head"><span className="vitrine-numeral" aria-hidden="true">{numeral}</span><div><h2>{title}</h2><p>{note}</p></div><span className="vitrine-count">{won} / {row.length}</span></header>
          <ul className="medal-grid">{row.map((a, i) => <motion.li key={a.id} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.05 }} transition={{ duration: 0.28, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}><MedalCard a={a} onInspect={() => inspect(a)} /></motion.li>)}</ul>
        </div>;
      })}
      <div className="collection-bottom"><p>{t('Her yeni keşif,', 'Every new discovery')} <em>{t('yeni bir kapıyı aralar.', 'opens a new door.')}</em></p><div><Link className="button gold" to="/kesfet">{t('Keşfe devam et', 'Carry on exploring')} <ArrowRight size={18} aria-hidden="true" /></Link><Link className="text-link" to="/pasaport">{t('Pasaportumu aç', 'Open my passport')} <ArrowUpRight size={16} aria-hidden="true" /></Link></div></div>
    </section>
{selected && <Modal title={selected.name} onClose={() => setSelected(null)}><span className="medal-modal-metal">{t(`${metals()[selected.metal] ?? selected.metal} MADALYON`, `${metals()[selected.metal] ?? selected.metal} MEDALLION`)}</span><button className={`medallion-inspect ${flipped ? 'flipped' : ''}`} onClick={() => setFlipped(!flipped)} aria-label={t('Madalyonu çevir', 'Turn the medallion')} aria-pressed={flipped}><span className="medallion-front"><Medallion achievement={selected} large /></span><span className="medallion-back"><Compass size={50} strokeWidth={1} /><strong>{selected.value >= selected.required ? t('BU İZ SENİN', 'THIS TRACE IS YOURS') : t('SIRADAKİ KEŞFİN', 'YOUR NEXT DISCOVERY')}</strong><span>{t('TAÇKAPI · MİRAS KOLEKSİYONU', 'TAÇKAPI · HERITAGE COLLECTION')}</span></span></button><span className="flip-hint"><Rotate3D size={15} aria-hidden="true" /> {t('Çevirmek için madalyona dokun', 'Tap the medallion to turn it')}</span><p>{selected.description}</p><p className="achievement-modal-progress">{Math.min(selected.value, selected.required)} / {selected.required} {t('tamamlandı', 'done')}</p><Link className="button dark" to={selected.id === 'quiz' ? '/oyun/quiz' : gameAchievements.includes(selected.id) ? '/oyun/oyunlar' : '/kesfet'} onClick={() => setSelected(null)}>{selected.value >= selected.required ? t('Keşfe devam et', 'Carry on exploring') : t('Göreve başla', 'Start the quest')}<ArrowUpRight size={17} aria-hidden="true" /></Link></Modal>}</div>;
}

export function Passport() {
  const { progress, storageAvailable, notify } = useProgress();
  const kept = useKeptIn();
  const { artifacts } = useContent();
  const found = artifacts.filter(a => progress.discovered[a.id]);
  const cities = new Set(found.map(a => a.city)).size;
  const medals = achievements(progress, artifacts);
  const earned = medals.filter(a => a.value >= a.required);
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(found.length / 4));
  function download() {
    const content = { platform: 'TAÇKAPI — Tarihe Açılan Kapı', exportedAt: new Date().toISOString(), notice: t('Dijital keşif kaydıdır; fiziksel ziyaret doğrulaması içermez.', 'A record of digital discovery; it does not verify a physical visit.'), discoveries: found.map(a => ({ name: a.name, city: a.city, discoveredAt: progress.discovered[a.id] })), achievements: earned.map(a => a.name), quiz: progress.quiz };
    const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'tackapi-miras-pasaportum.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); notify(t('Pasaportun JSON dosyası olarak indirildi.', 'Your passport was downloaded as a JSON file.'));
  }
  return <Scene><div className="page-shell passport-page"><PageHeading kicker={t('SENİN KEŞİF GÜNLÜĞÜN', 'YOUR DISCOVERY JOURNAL')} title={<>{t('Biriktirdiğin', 'The stories')} <em>{t('hikâyeler.', 'you have gathered.')}</em></>}>{t('Bir yerin hikâyesini öğrendiğinde, o yer artık biraz da senindir.', 'Once you learn the story of a place, that place is a little bit yours.')}</PageHeading><div className="passport-stats"><div><strong>{found.length.toString().padStart(2, '0')}</strong><span>{t('KEŞFEDİLEN ESER', 'WORKS DISCOVERED')}</span></div><div><strong>{cities.toString().padStart(2, '0')}</strong><span>{t('FARKLI ŞEHİR', 'DIFFERENT CITIES')}</span></div><div><strong>{earned.length.toString().padStart(2, '0')}</strong><span>{t('KAZANILAN MADALYON', 'MEDALLIONS EARNED')}</span></div></div><div className="passport-book"><div className="passport-cover"><span>{t('TÜRKİYE KÜLTÜREL MİRASI', 'CULTURAL HERITAGE OF TÜRKİYE')}</span><div className="passport-cover-frame"><Compass size={90} strokeWidth={0.7} /><h2>{t('MİRAS', 'HERITAGE')}<br />{t('PASAPORTU', 'PASSPORT')}</h2><div className="cover-rule" /><p>{t('Merakla başlayan', 'A lifelong journey')}<br />{t('bir ömürlük yolculuk.', 'that starts with curiosity.')}</p></div><span>{t('TAÇKAPI · DİJİTAL KEŞİF GÜNLÜĞÜ', 'TAÇKAPI · DIGITAL DISCOVERY JOURNAL')}</span></div><div className="passport-paper"><div className="paper-heading"><span>{t('KEŞİF MÜHÜRLERİ', 'DISCOVERY STAMPS')}</span><Stamp size={22} /></div>{!found.length ? <div className="passport-empty"><Compass size={53} strokeWidth={1} /><h3>{t('İlk mühür,', 'Your first stamp')}<br /><em>{t('ilk hikâyeni bekliyor.', 'is waiting for your first story.')}</em></h3><p>{t('Bir eserin hikâyesini oku ve sonunda “Pasaportuma mühürle” seçeneğine dokun.', 'Read the story of a work and tap “Stamp my passport” at the end.')}</p><Link className="text-link" to="/kesfet">{t('İlk keşfine başla', 'Start your first discovery')} <ArrowUpRight size={17} /></Link></div> : <div className="passport-stamp-grid" key={page}>{found.slice(page * 4, page * 4 + 4).map((a, i) => <PassportStamp key={a.id} artifact={a} at={progress.discovered[a.id]} index={i} />)}</div>}<div className="passport-pagination"><button onClick={() => setPage(p => p - 1)} disabled={page === 0} aria-label={t('Önceki pasaport sayfası', 'Previous passport page')}>←</button><span role="status">{t('SAYFA', 'PAGE')} {page + 1} / {pages}</span><button onClick={() => setPage(p => p + 1)} disabled={page + 1 >= pages} aria-label={t('Sonraki pasaport sayfası', 'Next passport page')}>→</button></div></div></div><div className="passport-bottom"><p>{kept.synced ? t('Pasaportun hesabına kaydedilir; giriş yaptığın her cihazda aynıdır.', 'Your passport is saved to your account and is the same on every device you sign in on.') : storageAvailable ? t('İlerlemen şimdilik bu tarayıcıda saklanır. Tarayıcı verilerini silmek pasaportunu da siler.', 'For now your progress is kept in this browser. Clearing the browser’s data also clears your passport.') : t('Tarayıcı depolaması kullanılamıyor. İlerlemen yalnızca bu oturumda tutuluyor.', 'Browser storage is not available. Your progress is kept for this visit only.')}<br />{t('Mühürler dijital keşfi temsil eder; fiziksel ziyaret doğrulaması değildir.', 'Stamps stand for digital discovery; they do not verify a physical visit.')}{kept.offer && <> <Link className="passport-keep" to="/giris?sonra=/pasaport">{t('Giriş yaparak pasaportunu koru', 'Sign in to keep your passport safe')} →</Link></>}</p><button className="text-link" onClick={download}><Download size={17} /> {t('Pasaportumu indir', 'Download my passport')}</button></div>
    <section className="passport-medals" aria-labelledby="passport-medals-title">
      <header><div><p className="eyebrow">{t(`${medals.length} MADALYONDAN ${earned.length} TANESİ SENDE`, `YOU HOLD ${earned.length} OF ${medals.length} MEDALLIONS`)}</p><h2 id="passport-medals-title">{t('Madalyonların', 'Your medallions')}</h2></div>
        <Link className="text-link" to="/basarimlar">{t('Madalyon odasını aç', 'Open the medal room')} <ArrowUpRight size={16} aria-hidden="true" /></Link></header>
      <MedalShelf list={medals} />
    </section></div></Scene>;
}
