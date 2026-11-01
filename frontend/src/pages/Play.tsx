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
import { t } from '../lib/i18n';
import { usePlaySession } from '../lib/playSession';
import { useProgress } from '../lib/store';
import { KnowledgeCards } from './KnowledgeCards';
import { DetectiveGame, PuzzleGame } from './MiniGames';
import { QuizStage } from './Quiz';
import { QuestBoard } from './Quests';

// Every section has its own route (/oyun/quiz, …) so other pages can link straight to it.
export const playSections = [['oyunlar', 'Mini oyunlar', 'games-title'], ['gorevler', 'Keşif görevleri', 'quests-title'], ['quiz', 'Bilgi yarışması', 'quiz-title'], ['bilgi-kartlari', 'Bilgi kartları', 'cards-title'], ['kesif-defteri', 'Keşif defteri', 'notebook-title']] as const;
// A section's name in the current language (the table above keeps the Turkish one, which the routes are named after).
const sectionName = (id: string) => ({ oyunlar: t('Mini oyunlar', 'Mini games'), gorevler: t('Keşif görevleri', 'Discovery quests'), quiz: t('Bilgi yarışması', 'Quiz'), 'bilgi-kartlari': t('Bilgi kartları', 'Knowledge cards'), 'kesif-defteri': t('Keşif defteri', 'Discovery journal') } as Record<string, string>)[id] ?? id;
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
const sectionNotes = (): Record<PlaySection, string> => ({ oyunlar: t('Yapboz ve dedektif', 'Puzzle and detective'), gorevler: t('Rotaları tamamla', 'Complete the routes'), quiz: t('Dört soru, 100 puan', 'Four questions, 100 points'), 'bilgi-kartlari': t('Çevir ve oku', 'Turn and read'), 'kesif-defteri': t('Bugünkü izlerin', 'Today’s traces') });

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
  return <nav className={`pl-rail ${current ? 'on' : ''}`} aria-label={t('Sayfada gezin', 'Move around the page')}>
    {playSections.map(([id], i) => <SectionLink key={id} section={id} className={current === id ? 'current' : ''} aria-current={current === id ? 'true' : undefined}><i aria-hidden="true">{String(i + 1).padStart(2, '0')}</i><span>{sectionName(id)}</span></SectionLink>)}
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
    { id: 'puzzle', label: t('Yapboz', 'Puzzle'), icon: <Puzzle size={26} strokeWidth={1.5} />, done: session.puzzle },
    { id: 'detective', label: t('Dedektif', 'Detective'), icon: <Search size={26} strokeWidth={1.5} />, done: session.detective },
    { id: 'quiz', label: t('Yarışma', 'Quiz'), icon: <span className="play-activity-glyph">?</span>, done: session.quiz },
    { id: 'cards', label: t('Kartlar', 'Cards'), icon: <Sparkle size={26} strokeWidth={1.5} />, done: artifacts.length > 0 && flipped >= artifacts.length, note: `${flipped} / ${artifacts.length} ${t('kart', 'cards')}` },
  ];
  const done = activities.filter(a => a.done).length;
  const current = miniGames().find(g => g.id === game);
  const still = Boolean(useReducedMotion());
  const [preview, setPreview] = useState<MiniGameId | null>(null);
  const pictured = artifacts.filter(a => a.image && !a.image.includes('placeholder'));
  const puzzleArt = pictured.find(a => a.id === 'selimiye') ?? pictured[0];
  const detectiveArt = pictured.find(a => a.id === 'divrigi') ?? pictured[pictured.length - 1];

  return <div className="play-page playroom">
    <PlayHero artifacts={artifacts} footer={<div className="pl-hero-foot">
      <nav className="pl-hero-index" aria-label={t('Oyna & Öğren bölümleri', 'Play & Learn sections')}>{playSections.map(([id], i) => <SectionLink key={id} section={id}><i aria-hidden="true">{String(i + 1).padStart(2, '0')}</i><b>{sectionName(id)}</b><small>{sectionNotes()[id]}</small></SectionLink>)}</nav>
      <span className="pl-scroll" aria-hidden="true"><ArrowDown size={15} /></span>
    </div>}>
      <p className="pl-kicker">{t('Oyna & Öğren · Eşik Atölyesi', 'Play & Learn · The Eşik Workshop')}</p>
      <h1 id="play-title" className="pl-title"><span className="pl-title-a">{t('Tarihi sadece keşfetme.', 'Do not just discover history.')}</span><em className="pl-title-b">{t('Onunla oyna.', 'Play with it.')}</em></h1>
      <p className="pl-intro">{t('Parçaları birleştir, ipuçlarını takip et, bir soruyla yeni bir kapı aç. Geçmişle kendi hikâyeni kur.', 'Put the pieces together, follow the clues, open a new door with a question. Build your own story with the past.')}</p>
      <div className="pl-actions">
        <SectionLink section="oyunlar" className="pl-cta en-key" onPointerMove={magnet} onPointerLeave={release}><span className="en-key-icon" aria-hidden="true"><KeyRound size={17} /></span><span className="en-key-label">{t('Oyunları keşfet', 'Discover the games')}</span><span className="en-key-arrow" aria-hidden="true"><ArrowRight size={17} /></span></SectionLink>
        <SectionLink section="quiz" className="pl-link en-link" onPointerMove={magnet} onPointerLeave={release}><span>{t('Bilgini sına', 'Test what you know')}</span><span className="en-link-arrow" aria-hidden="true"><ArrowUpRight size={16} /></span></SectionLink>
      </div>
    </PlayHero>
    <SectionRail />

    <Chapter id="bolum-oyunlar" tone="ivory" n={1} kicker={t('MİNİ OYUNLAR', 'MINI GAMES')} titleId="games-title" title={<>{t('İki oyun,', 'Two games,')} <em>{t('tek bir merak.', 'one curiosity.')}</em></>} lede={<p>{t('Parçaları birleştir ya da gizli dosyayı çöz. İkisinin de üç seviyesi var ve ikisi de kendi hızında oynanır. Sonuçların bu tarayıcıda madalyonlarına sayılır; pasaport mührü yalnızca hikâye keşfinden gelir.', 'Put the pieces together or crack the secret file. Both have three levels and both are played at your own pace. Your results count towards your medallions in this browser; a passport stamp comes only from discovering a story.')}</p>}>
      <div className="pl-games">{miniGames().map(g => <article key={g.id} className={`pl-game pl-game-${g.id}`} aria-labelledby={`game-${g.id}`} onPointerEnter={() => setPreview(g.id)} onPointerLeave={() => setPreview(null)} onFocus={() => setPreview(g.id)} onBlur={() => setPreview(null)}>
        <div className="pl-game-stage" role="img" aria-label={g.id === 'puzzle' ? t(`${puzzleArt?.name ?? 'Bir eser'} görselinden on iki parçalı bir yapboz; son parça yerine oturmayı bekliyor.`, `A twelve-piece puzzle from the picture of ${puzzleArt?.name ?? 'a work'}; the last piece is waiting to drop into place.`) : t('Bulanık bir eser görseli üzerinde gezinen bir büyüteç ve iki açık, bir kilitli ipucu.', 'A magnifier moving over a blurred picture of a work, with two open clues and one locked.')}>
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
          <ul className="pl-game-meta"><li>{g.meta}</li><li>{Object.keys(progress.games[g.id]).length ? t(`${Object.keys(progress.games[g.id]).length} eser çözüldü`, `${Object.keys(progress.games[g.id]).length} works solved`) : t('Oynanabilir demo', 'Playable demo')}</li></ul>
        </div>
      </article>)}</div>
    </Chapter>

    <Chapter id="bolum-gorevler" tone="night" n={2} kicker={t('KEŞİF GÖREVLERİ', 'DISCOVERY QUESTS')} titleId="quests-title" title={<>{t('Bir rota seç,', 'Choose a route,')} <em>{t('izini tamamla.', 'complete its trail.')}</em></>} lede={<p>{t('Her görev bir keşif rotasının eserlerinden kurulur: hikâyeyi okuyup mühürle, bir eserin yapbozunu çöz, bir soruyu doğru yanıtla. Adımları istediğin sırayla yapabilirsin; ilerlemen bu tarayıcıda saklanır.', 'Each quest is built from the works of a discovery route: read and stamp a story, solve a work’s puzzle, answer a question right. Do the steps in any order; your progress is kept in this browser.')}</p>}>
      <QuestBoard />
    </Chapter>

    <Chapter id="bolum-quiz" tone="ivory" n={3} kicker={t('BİLGİ YARIŞMASI', 'QUIZ')} titleId="quiz-title" className="pl-quiz" title={<>{t('Tarihin', 'On the trail')} <em>{t('izinde.', 'of history.')}</em></>} lede={<><p>{t('Dört soru, her doğru cevap 25 puan. Sorular editörlerin yazdığı sorulardan ve eser verisinden seçilir. Süre sınırı yok: seçeneklere Tab ile geçip Enter veya boşluk tuşuyla yanıt verebilirsin. Turu bitirdiğinde puanın ve Bilgi Avcısı madalyonun bu tarayıcıda kaydedilir.', 'Four questions, 25 points for each right answer. The questions come from those written by the editors and from the works’ data. There is no time limit: move to the options with Tab and answer with Enter or the space bar. When you finish the round, your score and the Knowledge Hunter medallion are saved in this browser.')}</p>{progress.quiz.completed > 0 && <p className="play-quiz-best">{t(`${progress.quiz.completed} tur tamamladın · En iyi puanın ${progress.quiz.best} / 100`, `${progress.quiz.completed} rounds completed · Your best score ${progress.quiz.best} / 100`)}</p>}</>}>
      <QuizStage key={quizFocus ?? ''} focus={quizFocus} onFinish={() => complete('quiz')} />
    </Chapter>

    <Chapter id="bolum-bilgi-kartlari" tone="night" n={4} kicker={t('BİLGİ KARTLARI', 'KNOWLEDGE CARDS')} titleId="cards-title" className="pl-cards" title={<>{t('Bir kart,', 'One card,')} <em>{t('bir hikâye.', 'one story.')}</em></>} lede={<p>{t('Kartın arkasını çevir, eserin kısa hikâyesini oku; ardından hikâyenin tamamına ya da haritadaki yerine geç.', 'Turn the card over and read the work’s short story; then go to the whole story or to its place on the map.')}</p>}>
      <KnowledgeCards flipped={session.flipped} onFlip={flip} />
    </Chapter>

    <Chapter id="bolum-kesif-defteri" tone="ivory" n={5} kicker={t('KEŞİF DEFTERİ', 'DISCOVERY JOURNAL')} titleId="notebook-title" className="play-notebook" title={<>{t('Her cevap,', 'Every answer,')} <em>{t('yeni bir iz.', 'a new trace.')}</em></>} lede={<><p className="play-notebook-lead">{t('Dört deneyim, tek bir keşif yolculuğu. Tamamladıklarını burada takip et.', 'Four experiences, one journey of discovery. Follow what you have completed here.')}</p><p className="play-notebook-note"><Info size={16} aria-hidden="true" />{t('Bu defter yalnızca bugünkü oturumu gösterir ve sekme kapanınca sıfırlanır. Yapboz, dedektif ve bilgi yarışması sonuçların madalyonlar için bu tarayıcıda saklanır; kart ilerlemen saklanmaz. Hiçbiri pasaportuna mühür eklemez.', 'This journal shows only today’s visit and resets when the tab closes. Your puzzle, detective and quiz results are kept in this browser for the medallions; your card progress is not. None of them adds a stamp to your passport.')}</p></>}>
      <div className="play-notebook-panel">
        <div className="pl-ledger-ring" aria-hidden="true"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" className="track" /><motion.circle cx="60" cy="60" r="52" className="fill" initial={still ? false : { pathLength: 0 }} whileInView={{ pathLength: done / activities.length }} viewport={{ once: true }} transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }} style={still ? { pathLength: done / activities.length } : undefined} /></svg></div>
        <div className="play-notebook-head"><p><i aria-hidden="true">✦</i> {t('BUGÜNKÜ KEŞİFLERİN', 'TODAY’S DISCOVERIES')}</p><p>DEMO • {activities.length} {t('ETKİNLİK', 'ACTIVITIES')}</p></div>
        <div className="play-notebook-body">
          <p className="play-notebook-count"><span aria-hidden="true"><strong>{done}</strong>/{activities.length}</span><small><span className="sr-only">{done} / {activities.length} </span>{t('Tamamlanan etkinlik', 'Activities completed')}</small></p>
          <ul className="play-activities">{activities.map(a => <li key={a.id} className={a.done ? 'done' : ''}>
            <span className="play-activity-icon" aria-hidden="true">{a.icon}{a.done && <span className="play-activity-badge"><Check size={14} strokeWidth={3} /></span>}</span>
            <span className="play-activity-label">{a.label}<span className="sr-only">: {a.done ? t('tamamlandı', 'done') : t('henüz tamamlanmadı', 'not done yet')}</span></span>
            {a.note && <small>{a.note}</small>}
          </li>)}</ul>
        </div>
        <p className="play-notebook-motto">{t('Kendi hızında öğren, merakını takip et.', 'Learn at your own pace, follow your curiosity.')} <i aria-hidden="true">✦</i></p>
        <nav className="play-notebook-foot" aria-label={t('Keşfe devam et', 'Carry on exploring')}><p>{t('KEŞFE DEVAM ET', 'CARRY ON EXPLORING')}</p><div><Link to="/pasaport">{t('Miras Pasaportu', 'Heritage Passport')} <ArrowUpRight size={17} aria-hidden="true" /></Link><Link to="/basarimlar">{t('Madalyonlar', 'Medallions')} <ArrowUpRight size={17} aria-hidden="true" /></Link></div></nav>
      </div>
    </Chapter>

    {current && <Modal className="play-modal" title={current.title} onClose={closeGame}>{current.id === 'puzzle' ? <PuzzleGame onComplete={() => complete('puzzle')} artifactId={launch.artifactId} requestedLevel={launch.level} /> : <DetectiveGame onComplete={() => complete('detective')} requestedLevel={launch.level} />}</Modal>}
  </div>;
}
