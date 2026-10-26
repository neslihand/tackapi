import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, Check, Info, KeyRound, Puzzle, Search, Sparkle } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { magnet, release } from '../components/Atmosphere';
import { Chapter, DetectivePreview, PlayHero, PuzzlePreview } from '../components/PlayScenes';
import { miniGames, type MiniGameId } from '../data/games';
import { isGameLevel, type GameLevel } from '../lib/games';
import { Modal } from '../components/UI';
import { useContent } from '../lib/contentStore';
import { Link } from '../lib/navigation';
import { usePlaySession } from '../lib/playSession';
import { useProgress } from '../lib/store';
import { KnowledgeCards } from './KnowledgeCards';
import { DetectiveGame, PuzzleGame } from './MiniGames';
import { QuizStage } from './Quiz';
import { QuestBoard } from './Quests';

// Every section has its own route (/oyun/quiz, …) so other pages can link straight to it.
export const playSections = [['oyunlar', 'Mini oyunlar', 'games-title'], ['gorevler', 'Keşif görevleri', 'quests-title'], ['quiz', 'Bilgi yarışması', 'quiz-title'], ['bilgi-kartlari', 'Bilgi kartları', 'cards-title'], ['kesif-defteri', 'Keşif defteri', 'notebook-title']] as const;
export type PlaySection = typeof playSections[number][0];

function showSection(section: PlaySection) {
  const heading = document.getElementById(playSections.find(([id]) => id === section)?.[2] ?? '');
  heading?.closest('section')?.scrollIntoView({ block: 'start' });
  heading?.focus({ preventScroll: true });
}

function SectionLink({ section, children, ...rest }: { section: PlaySection; children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  // Following the link to the section already in the address bar fires no hashchange, so scroll by hand.
  const again = (event: MouseEvent) => { if (window.location.hash === `#/oyun/${section}`) { event.preventDefault(); showSection(section); } };
  return <Link {...rest} to={`/oyun/${section}`} onClick={again}>{children}</Link>;
}

// What waits in each part of the page, for the index under the opening and the rail.
const sectionNotes: Record<PlaySection, string> = { oyunlar: 'Yapboz ve dedektif', gorevler: 'Rotaları tamamla', quiz: 'Dört soru, 100 puan', 'bilgi-kartlari': 'Çevir ve oku', 'kesif-defteri': 'Bugünkü izlerin' };

// A rail on the right edge of wide screens: where the reader is on the page, and a way to any part of it.
function SectionRail() {
  const [current, setCurrent] = useState<string | null>(null);
  useEffect(() => {
    const sections = playSections.map(([id]) => document.getElementById(`bolum-${id}`)).filter((el): el is HTMLElement => Boolean(el));
    const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) setCurrent(entry.target.id.replace('bolum-', '')); }), { rootMargin: '-45% 0px -45% 0px' });
    sections.forEach(section => observer.observe(section));
    const hero = document.querySelector('.pl-hero');
    const top = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setCurrent(null); }, { rootMargin: '-45% 0px -45% 0px' });
    if (hero) top.observe(hero);
    return () => { observer.disconnect(); top.disconnect(); };
  }, []);
  return <nav className={`pl-rail ${current ? 'on' : ''}`} aria-label="Sayfada gezin">
    {playSections.map(([id, label], i) => <SectionLink key={id} section={id} className={current === id ? 'current' : ''} aria-current={current === id ? 'true' : undefined}><i aria-hidden="true">{String(i + 1).padStart(2, '0')}</i><span>{label}</span></SectionLink>)}
  </nav>;
}

// Links name the games in Turkish: /oyun/oyunlar?oyun=yapboz&eser=<id>&seviye=orta.
const gameParam: Record<string, MiniGameId> = { yapboz: 'puzzle', dedektif: 'detective' };

export function Play({ section, query = '' }: { section?: PlaySection; query?: string }) {
  const { artifacts } = useContent();
  const { progress } = useProgress();
  const { session, complete, flip } = usePlaySession();
  const [game, setGame] = useState<MiniGameId | null>(null);
  const [launch, setLaunch] = useState<{ artifactId?: string; level?: GameLevel }>({});
  // A quest step links to /oyun/quiz?eser=<id>: that round opens with a question about the artifact.
  const quizFocus = section === 'quiz' ? new URLSearchParams(query).get('eser') ?? undefined : undefined;
  useEffect(() => {
    const params = new URLSearchParams(query);
    const id = gameParam[params.get('oyun') ?? ''];
    if (!id) return;
    const level = params.get('seviye');
    // Only the puzzle opens on a chosen artifact: naming the detective's artifact would give the answer away.
    setLaunch({ artifactId: id === 'puzzle' ? params.get('eser') ?? undefined : undefined, level: isGameLevel(level) ? level : undefined });
    setGame(id);
  }, [query]);
  function closeGame() {
    setGame(null); setLaunch({});
    // Drop the opening link from the address bar so a reload does not reopen the game.
    if (new URLSearchParams(query).has('oyun')) history.replaceState(null, '', '#/oyun/oyunlar');
  }
  useEffect(() => {
    if (!section) return;
    // Waits for the router, which focuses <main> after every route change.
    const timer = setTimeout(() => showSection(section));
    return () => clearTimeout(timer);
  }, [section]);
  const flipped = session.flipped.filter(id => artifacts.some(a => a.id === id)).length;
  const activities: { id: string; label: string; icon: ReactNode; done: boolean; note?: string }[] = [
    { id: 'puzzle', label: 'Yapboz', icon: <Puzzle size={26} strokeWidth={1.5} />, done: session.puzzle },
    { id: 'detective', label: 'Dedektif', icon: <Search size={26} strokeWidth={1.5} />, done: session.detective },
    { id: 'quiz', label: 'Yarışma', icon: <span className="play-activity-glyph">?</span>, done: session.quiz },
    { id: 'cards', label: 'Kartlar', icon: <Sparkle size={26} strokeWidth={1.5} />, done: artifacts.length > 0 && flipped >= artifacts.length, note: `${flipped} / ${artifacts.length} kart` },
  ];
  const done = activities.filter(a => a.done).length;
  const current = miniGames.find(g => g.id === game);
  const still = Boolean(useReducedMotion());
  const [preview, setPreview] = useState<MiniGameId | null>(null);
  const pictured = artifacts.filter(a => a.image && !a.image.includes('placeholder'));
  const puzzleArt = pictured.find(a => a.id === 'selimiye') ?? pictured[0];
  const detectiveArt = pictured.find(a => a.id === 'divrigi') ?? pictured[pictured.length - 1];

  return <div className="play-page playroom">
    <PlayHero artifacts={artifacts} footer={<div className="pl-hero-foot">
      <nav className="pl-hero-index" aria-label="Oyna & Öğren bölümleri">{playSections.map(([id, label], i) => <SectionLink key={id} section={id}><i aria-hidden="true">{String(i + 1).padStart(2, '0')}</i><b>{label}</b><small>{sectionNotes[id]}</small></SectionLink>)}</nav>
      <span className="pl-scroll" aria-hidden="true"><ArrowDown size={15} /></span>
    </div>}>
      <p className="pl-kicker"><span>N° 03</span><i aria-hidden="true" />Oyna & Öğren · Eşik Atölyesi</p>
      <h1 id="play-title" className="pl-title"><span className="pl-title-a">Tarihi sadece keşfetme.</span><em className="pl-title-b">Onunla oyna.</em></h1>
      <p className="pl-intro">Parçaları birleştir, ipuçlarını takip et, bir soruyla yeni bir kapı aç. Geçmişle kendi hikâyeni kur.</p>
      <div className="pl-actions">
        <SectionLink section="oyunlar" className="pl-cta en-key" onPointerMove={magnet} onPointerLeave={release}><span className="en-key-icon" aria-hidden="true"><KeyRound size={17} /></span><span className="en-key-label">Oyunları keşfet</span><span className="en-key-arrow" aria-hidden="true"><ArrowRight size={17} /></span></SectionLink>
        <SectionLink section="quiz" className="pl-link en-link" onPointerMove={magnet} onPointerLeave={release}><span>Bilgini sına</span><span className="en-link-arrow" aria-hidden="true"><ArrowUpRight size={16} /></span></SectionLink>
      </div>
    </PlayHero>
    <SectionRail />

    <Chapter id="bolum-oyunlar" tone="ivory" n={1} kicker="MİNİ OYUNLAR" titleId="games-title" title={<>İki oyun, <em>tek bir merak.</em></>} lede={<p>Parçaları birleştir ya da gizli dosyayı çöz. İkisinin de üç seviyesi var ve ikisi de kendi hızında oynanır. Sonuçların bu tarayıcıda madalyonlarına sayılır; pasaport mührü yalnızca hikâye keşfinden gelir.</p>}>
      <div className="pl-games">{miniGames.map(g => <article key={g.id} className={`pl-game pl-game-${g.id}`} aria-labelledby={`game-${g.id}`} onPointerEnter={() => setPreview(g.id)} onPointerLeave={() => setPreview(null)} onFocus={() => setPreview(g.id)} onBlur={() => setPreview(null)}>
        <div className="pl-game-stage" role="img" aria-label={g.id === 'puzzle' ? `${puzzleArt?.name ?? 'Bir eser'} görselinden on iki parçalı bir yapboz; son parça yerine oturmayı bekliyor.` : 'Bulanık bir eser görseli üzerinde gezinen bir büyüteç ve iki açık, bir kilitli ipucu.'}>
          {g.id === 'puzzle' ? puzzleArt && <PuzzlePreview artifact={puzzleArt} solved={preview === 'puzzle'} /> : detectiveArt && <DetectivePreview artifact={detectiveArt} />}
        </div>
        <div className="pl-game-label">
          <p className="pl-game-kind"><span>{g.number}</span>{g.kind}</p>
          <h3 id={`game-${g.id}`}>{g.title}</h3>
          <p className="pl-game-text">{g.description}</p>
          <p className="pl-game-tags">{g.tags.join(' · ')}</p>
          <button type="button" className="pl-game-cta" data-game={g.id} aria-haspopup="dialog" aria-describedby={`game-${g.id}`} onClick={() => setGame(g.id)} onPointerMove={magnet} onPointerLeave={release}>
            <span className="pl-game-cta-icon" aria-hidden="true">{g.id === 'puzzle' ? <Puzzle size={18} /> : <Search size={18} />}</span><span className="pl-game-cta-label">{g.cta}</span><span className="pl-game-cta-arrow" aria-hidden="true"><ArrowUpRight size={17} /></span>
          </button>
          <ul className="pl-game-meta"><li>{g.meta}</li><li>{Object.keys(progress.games[g.id]).length ? `${Object.keys(progress.games[g.id]).length} eser çözüldü` : 'Oynanabilir demo'}</li></ul>
        </div>
      </article>)}</div>
    </Chapter>

    <Chapter id="bolum-gorevler" tone="night" n={2} kicker="KEŞİF GÖREVLERİ" titleId="quests-title" title={<>Bir rota seç, <em>izini tamamla.</em></>} lede={<p>Her görev bir keşif rotasının eserlerinden kurulur: hikâyeyi okuyup mühürle, bir eserin yapbozunu çöz, bir soruyu doğru yanıtla. Adımları istediğin sırayla yapabilirsin; ilerlemen bu tarayıcıda saklanır.</p>}>
      <QuestBoard />
    </Chapter>

    <Chapter id="bolum-quiz" tone="ivory" n={3} kicker="BİLGİ YARIŞMASI" titleId="quiz-title" className="pl-quiz" title={<>Tarihin <em>izinde.</em></>} lede={<><p>Dört soru, her doğru cevap 25 puan. Sorular editörlerin yazdığı sorulardan ve eser verisinden seçilir. Süre sınırı yok: seçeneklere Tab ile geçip Enter veya boşluk tuşuyla yanıt verebilirsin. Turu bitirdiğinde puanın ve Bilgi Avcısı madalyonun bu tarayıcıda kaydedilir.</p>{progress.quiz.completed > 0 && <p className="play-quiz-best">{progress.quiz.completed} tur tamamladın · En iyi puanın {progress.quiz.best} / 100</p>}</>}>
      <QuizStage key={quizFocus ?? ''} focus={quizFocus} onFinish={() => complete('quiz')} />
    </Chapter>

    <Chapter id="bolum-bilgi-kartlari" tone="night" n={4} kicker="BİLGİ KARTLARI" titleId="cards-title" className="pl-cards" title={<>Bir kart, <em>bir hikâye.</em></>} lede={<p>Kartın arkasını çevir, eserin kısa hikâyesini oku; ardından hikâyenin tamamına ya da haritadaki yerine geç.</p>}>
      <KnowledgeCards flipped={session.flipped} onFlip={flip} />
    </Chapter>

    <Chapter id="bolum-kesif-defteri" tone="ivory" n={5} kicker="KEŞİF DEFTERİ" titleId="notebook-title" className="play-notebook" title={<>Her cevap, <em>yeni bir iz.</em></>} lede={<><p className="play-notebook-lead">Dört deneyim, tek bir keşif yolculuğu. Tamamladıklarını burada takip et.</p><p className="play-notebook-note"><Info size={16} aria-hidden="true" />Bu defter yalnızca bugünkü oturumu gösterir ve sekme kapanınca sıfırlanır. Yapboz, dedektif ve bilgi yarışması sonuçların madalyonlar için bu tarayıcıda saklanır; kart ilerlemen saklanmaz. Hiçbiri pasaportuna mühür eklemez.</p></>}>
      <div className="play-notebook-panel">
        <div className="pl-ledger-ring" aria-hidden="true"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" className="track" /><motion.circle cx="60" cy="60" r="52" className="fill" initial={still ? false : { pathLength: 0 }} whileInView={{ pathLength: done / activities.length }} viewport={{ once: true }} transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }} style={still ? { pathLength: done / activities.length } : undefined} /></svg></div>
        <div className="play-notebook-head"><p><i aria-hidden="true">✦</i> BUGÜNKÜ KEŞİFLERİN</p><p>DEMO • {activities.length} ETKİNLİK</p></div>
        <div className="play-notebook-body">
          <p className="play-notebook-count"><span aria-hidden="true"><strong>{done}</strong>/{activities.length}</span><small><span className="sr-only">{done} / {activities.length} </span>Tamamlanan etkinlik</small></p>
          <ul className="play-activities">{activities.map(a => <li key={a.id} className={a.done ? 'done' : ''}>
            <span className="play-activity-icon" aria-hidden="true">{a.icon}{a.done && <span className="play-activity-badge"><Check size={14} strokeWidth={3} /></span>}</span>
            <span className="play-activity-label">{a.label}<span className="sr-only">: {a.done ? 'tamamlandı' : 'henüz tamamlanmadı'}</span></span>
            {a.note && <small>{a.note}</small>}
          </li>)}</ul>
        </div>
        <p className="play-notebook-motto">Kendi hızında öğren, merakını takip et. <i aria-hidden="true">✦</i></p>
        <nav className="play-notebook-foot" aria-label="Keşfe devam et"><p>KEŞFE DEVAM ET</p><div><Link to="/pasaport">Miras Pasaportu <ArrowUpRight size={17} aria-hidden="true" /></Link><Link to="/basarimlar">Madalyonlar <ArrowUpRight size={17} aria-hidden="true" /></Link></div></nav>
      </div>
    </Chapter>

    {current && <Modal className="play-modal" title={current.title} onClose={closeGame}>{current.id === 'puzzle' ? <PuzzleGame onComplete={() => complete('puzzle')} artifactId={launch.artifactId} requestedLevel={launch.level} /> : <DetectiveGame onComplete={() => complete('detective')} requestedLevel={launch.level} />}</Modal>}
  </div>;
}
