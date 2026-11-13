import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { ArrowUpRight, Award, Eye, Hash, LockKeyhole, Search, Shuffle } from 'lucide-react';
import type { DiscoveryArtifact as Artifact } from '../lib/artifactContract';
import { imageAlt, PLACEHOLDER_IMAGE } from '../lib/content';
import { useContent } from '../lib/contentStore';
import { canBeMystery, clueCount, detectiveClues, detectiveOptions, detectiveStars, gameLevels, inPlace, levelName, minSwaps, nextLevel, pickNext, pickOptions, puzzleSize, puzzleStars, scramble, type Clue, type GameLevel } from '../lib/games';
import { Link } from '../lib/navigation';
import { locale, t } from '../lib/i18n';
import { useGameLevel } from '../lib/preferences';
import { useProgress, type GameOutcome } from '../lib/store';

const cell = (i: number, size: number) => t(`${Math.floor(i / size) + 1}. satır, ${i % size + 1}. sütun`, `row ${Math.floor(i / size) + 1}, column ${i % size + 1}`);
const upper = (text: string) => text.toLocaleUpperCase(locale());
type Scored = GameOutcome & { result: number; stars: number };

function LevelPicker({ level, onChange, describe }: { level: GameLevel; onChange: (level: GameLevel) => void; describe: (level: GameLevel) => string }) {
  return <div className="segmented mg-levels" role="group" aria-label={t('Zorluk seviyesi', 'Difficulty')}>{gameLevels.map(([value]) => <button key={value} type="button" className={level === value ? 'active' : ''} aria-pressed={level === value} onClick={() => { if (value !== level) onChange(value); }}>{levelName(value)}<small>{describe(value)}</small></button>)}</div>;
}

// Stars, the record and any medal, all in text: the page toast cannot reach a screen reader while the dialog is open.
function Outcome({ scored, summary, unit }: { scored: Scored; summary: string; unit: string }) {
  const record = scored.previous === undefined ? t('Bu eseri bu seviyede ilk kez çözdün.', 'You solved this work at this level for the first time.')
    : scored.result < scored.previous ? t(`Yeni rekor! Önceki en iyin: ${scored.previous} ${unit}.`, `New record! Your previous best: ${scored.previous} ${unit}.`) : t(`Rekorun: ${scored.previous} ${unit}.`, `Your record: ${scored.previous} ${unit}.`);
  return <>
    <div className="mg-stars"><span aria-hidden="true">{'★'.repeat(scored.stars)}{'☆'.repeat(3 - scored.stars)}</span><small>{t(`3 yıldızdan ${scored.stars}`, `${scored.stars} of 3 stars`)}</small></div>
    <p className="mg-score">{summary} {record}</p>
    {scored.unlocked.length > 0 && <div className="mg-medal"><Award size={18} aria-hidden="true" />Yeni madalyon: {scored.unlocked.join(' · ')}</div>}
  </>;
}

function freshBoard(size: number) {
  const order = scramble(size);
  return { size, order, least: minSwaps(order) };
}

export function PuzzleGame({ onComplete, artifactId, requestedLevel }: { onComplete: () => void; artifactId?: string; requestedLevel?: GameLevel }) {
  const { artifacts } = useContent();
  const { progress, finishGame } = useProgress();
  const [level, setLevel] = useGameLevel('puzzle', requestedLevel);
  const pictured = artifacts.filter(a => a.image !== PLACEHOLDER_IMAGE);
  const choose = (at: GameLevel, previous?: Artifact) => pickNext(pictured, a => progress.games.puzzle[a.id]?.[at] !== undefined, previous);
  const [artifact, setArtifact] = useState(() => pictured.find(a => a.id === artifactId) ?? choose(level));
  const [board, setBoard] = useState(() => freshBoard(puzzleSize[level]));
  const [selected, setSelected] = useState<number | null>(null);
  const [focus, setFocus] = useState(0);
  const [moves, setMoves] = useState(0);
  const [numbers, setNumbers] = useState(false);
  const [preview, setPreview] = useState(false);
  const [message, setMessage] = useState('');
  const [scored, setScored] = useState<Scored | null>(null);
  const tiles = useRef<(HTMLButtonElement | null)[]>([]);
  const result = useRef<HTMLHeadingElement>(null);
  const { size, order, least } = board;
  const placed = inPlace(order);
  const solved = placed === order.length;
  useEffect(() => { if (solved) result.current?.focus(); }, [solved]);

  if (!artifact) return <p className="mg-intro">{t('Yapboz için görseli olan bir eser henüz yok.', 'There is no work with a picture for the puzzle yet.')}</p>;
  const best = progress.games.puzzle[artifact.id]?.[level];
  const harder = nextLevel(level);

  function start(next: Artifact | undefined, at: GameLevel, text: string, focusBoard: boolean) {
    if (at !== level) setLevel(at);
    setArtifact(next); setBoard(freshBoard(puzzleSize[at])); setSelected(null); setFocus(0); setMoves(0); setPreview(false); setScored(null); setMessage(text);
    if (focusBoard) requestAnimationFrame(() => tiles.current[0]?.focus());
  }
  function pick(i: number) {
    if (solved || !artifact) return;
    setFocus(i);
    if (selected === null) { setSelected(i); setMessage(t(`Parça ${order[i] + 1} seçildi. Yerini değiştirmek için başka bir parça seç.`, `Piece ${order[i] + 1} selected. Choose another piece to swap it with.`)); return; }
    if (selected === i) { setSelected(null); setMessage(t('Seçim kaldırıldı.', 'Selection cleared.')); return; }
    const next = [...order];
    [next[selected], next[i]] = [next[i], next[selected]];
    const count = moves + 1;
    setBoard({ ...board, order: next }); setSelected(null); setMoves(count);
    if (inPlace(next) === next.length) {
      const stars = puzzleStars(count, least, size);
      const outcome = finishGame('puzzle', artifact.id, level, count);
      setScored({ ...outcome, result: count, stars });
      setMessage(t(`Yapboz tamamlandı: ${count} hamlede ${artifact.name} görseli birleşti. 3 yıldızdan ${stars}.`, `Puzzle complete: the picture of ${artifact.name} came together in ${count} moves. ${stars} of 3 stars.`) + (outcome.unlocked.length ? ` ${t('Yeni madalyon', 'New medallion')}: ${outcome.unlocked.join(', ')}.` : ''));
      onComplete();
    } else setMessage(t(`Parça ${order[selected] + 1} ile parça ${order[i] + 1} yer değiştirdi. ${inPlace(next)} / ${next.length} parça yerinde.`, `Pieces ${order[selected] + 1} and ${order[i] + 1} swapped. ${inPlace(next)} / ${next.length} pieces in place.`));
  }
  // One tab stop for the whole board; arrows move between pieces, Home/End go to the ends of the row.
  function move(event: KeyboardEvent<HTMLButtonElement>, i: number) {
    const row = Math.floor(i / size), column = i % size;
    let target = i;
    if (event.key === 'ArrowRight' && column < size - 1) target = i + 1;
    else if (event.key === 'ArrowLeft' && column > 0) target = i - 1;
    else if (event.key === 'ArrowDown' && row < size - 1) target = i + size;
    else if (event.key === 'ArrowUp' && row > 0) target = i - size;
    else if (event.key === 'Home') target = row * size;
    else if (event.key === 'End') target = row * size + size - 1;
    else if (event.key === 'Escape' && selected !== null) {
      // Esc first drops the selection; only the next Esc closes the dialog.
      event.preventDefault(); event.stopPropagation();
      setSelected(null); setMessage(t('Seçim kaldırıldı.', 'Selection cleared.'));
      return;
    } else return;
    event.preventDefault();
    setFocus(target);
    tiles.current[target]?.focus();
  }

  return <div className="mg-game">
    <p className="mg-kicker">01 · {t('GÖRSEL YAPBOZ · OYNANABİLİR DEMO', 'PICTURE PUZZLE · PLAYABLE DEMO')}</p>
    <LevelPicker level={level} describe={at => `${puzzleSize[at]}×${puzzleSize[at]}`} onChange={at => start(artifact, at, t(`${levelName(at)} seviye: ${puzzleSize[at]}×${puzzleSize[at]} yapboz. Yeni tur başladı.`, `${levelName(at)} level: a ${puzzleSize[at]}×${puzzleSize[at]} puzzle. A new round has started.`), false)} />
    <p className="mg-intro" id="puzzle-help">{t(`Önce bir parçaya, sonra onunla yer değiştirecek parçaya dokun. Her parçanın numarası doğru yerini gösterir: 1 sol üst köşe, ${size * size} sağ alt köşe. Klavyede ok tuşlarıyla gezin, Enter ile seç; Esc seçimi kaldırır.`, `Tap a piece, then the piece to swap it with. Each piece’s number shows its right place: 1 is the top-left corner, ${size * size} the bottom-right. On the keyboard, move with the arrow keys and pick with Enter; Esc clears the selection.`)}</p>
    <div className={`mg-puzzle ${solved ? 'solved' : ''}`} data-size={size}>
      <div className="mg-board" role="group" aria-label={t(`Yapboz tahtası: ${size} satır, ${size} sütun`, `Puzzle board: ${size} rows, ${size} columns`)} aria-describedby="puzzle-help" style={{ '--size': size } as CSSProperties}>
        {order.map((piece, i) => <button key={i} ref={el => { tiles.current[i] = el; }} type="button" tabIndex={i === focus ? 0 : -1} className={`mg-tile ${selected === i ? 'selected' : ''}`} onClick={() => pick(i)} onKeyDown={e => move(e, i)} onFocus={() => setFocus(i)} disabled={solved} aria-pressed={selected === i} aria-label={`${cell(i, size)}: ${t('parça', 'piece')} ${piece + 1}${piece === i ? t(', doğru yerde', ', in the right place') : ''}`}>
          <img src={artifact.image} alt="" draggable={false} style={{ width: `${size * 100}%`, height: `${size * 100}%`, left: `${-(piece % size) * 100}%`, top: `${-Math.floor(piece / size) * 100}%` }} />
          {numbers && !solved && <span className="mg-tile-number" aria-hidden="true">{piece + 1}</span>}
        </button>)}
      </div>
      {solved ? <section className="mg-result" aria-labelledby="puzzle-result">
        <p className="mg-kicker">{t('MOTİF TAMAMLANDI', 'MOTIF COMPLETE')} · {upper(levelName(level))} · {moves} {t('HAMLE', 'MOVES')}</p>
        <h3 id="puzzle-result" ref={result} tabIndex={-1}>{artifact.name}</h3>
        {scored && <Outcome scored={scored} unit={t('hamle', 'moves')} summary={t(`En az ${least} hamle mümkündü; sen ${moves} hamlede çözdün.`, `It could be done in ${least} moves; you solved it in ${moves}.`)} />}
        <p className="mg-meta">{artifact.city} · {artifact.year} · {artifact.architect}</p>
        <p>{artifact.chapters[0]?.short ?? artifact.description}</p>
        <div className="mg-actions">
          <Link className="mg-button primary" to={`/eser/${artifact.slug}`}>{t('Hikâyeyi oku', 'Read the story')} <ArrowUpRight size={17} aria-hidden="true" /></Link>
          {harder && <button type="button" className="mg-button" onClick={() => start(artifact, harder, t(`${levelName(harder)} seviye: ${artifact.name}, ${puzzleSize[harder]}×${puzzleSize[harder]} yapboz.`, `${levelName(harder)} level: ${artifact.name}, a ${puzzleSize[harder]}×${puzzleSize[harder]} puzzle.`), true)}>{t(`${levelName(harder)} seviyede dene`, `Try ${levelName(harder).toLowerCase()}`)}</button>}
          <button type="button" className="mg-button" onClick={() => start(choose(level, artifact), level, t('Yeni bir görsel karıştırıldı.', 'A new picture has been shuffled.'), true)}>{t('Yeni yapboz', 'New puzzle')}</button>
        </div>
      </section> : <div className="mg-side">
        <dl className="mg-stats"><div><dt>{t('Hamle', 'Moves')}</dt><dd>{moves}</dd></div><div><dt>{t('Yerinde', 'In place')}</dt><dd>{placed} / {order.length}</dd></div></dl>
        {best !== undefined && <p className="mg-best">Bu eserde {levelName(level).toLocaleLowerCase('tr-TR')} seviye rekorun: {best} hamle</p>}
        <button type="button" className="mg-button" aria-pressed={numbers} onClick={() => setNumbers(!numbers)}><Hash size={16} aria-hidden="true" /> {t('Numaraları göster', 'Show the numbers')}</button>
        <button type="button" className="mg-button" aria-expanded={preview} aria-controls="puzzle-preview" onClick={() => setPreview(!preview)}><Eye size={16} aria-hidden="true" /> {t('Tamamlanmış görsel', 'The finished picture')}</button>
        <img id="puzzle-preview" className="mg-preview" src={artifact.image} alt={`${t('Hedef görsel.', 'The target picture.')} ${imageAlt(artifact)}`} hidden={!preview} />
        <button type="button" className="mg-button" onClick={() => start(artifact, level, t('Parçalar yeniden karıştırıldı.', 'The pieces have been shuffled again.'), false)}><Shuffle size={16} aria-hidden="true" /> {t('Yeniden karıştır', 'Shuffle again')}</button>
      </div>}
    </div>
    <p className="mg-status" role="status">{message}</p>
  </div>;
}

type Case = { mystery: Artifact; options: Artifact[]; clues: Clue[] };

export function DetectiveGame({ onComplete, requestedLevel }: { onComplete: () => void; requestedLevel?: GameLevel }) {
  const { artifacts } = useContent();
  const { progress, finishGame } = useProgress();
  const [level, setLevel] = useGameLevel('detective', requestedLevel);
  const open = (at: GameLevel, previous?: Artifact): Case | null => {
    if (artifacts.length < 2) return null;
    const mystery = pickNext(artifacts.filter(a => canBeMystery(a, at)), a => progress.games.detective[a.id]?.[at] !== undefined, previous);
    return mystery ? { mystery, options: pickOptions(mystery, artifacts, at), clues: detectiveClues(mystery, at) } : null;
  };
  const [round, setRound] = useState(() => open(level));
  const [revealed, setRevealed] = useState(1);
  const [wrong, setWrong] = useState<string[]>([]);
  const [scored, setScored] = useState<Scored | null>(null);
  const [message, setMessage] = useState('');
  const clues = useRef<(HTMLLIElement | null)[]>([]);
  const result = useRef<HTMLHeadingElement>(null);
  const opened = useRef(false);
  const solved = scored !== null;
  useEffect(() => { if (opened.current) clues.current[revealed - 1]?.focus(); opened.current = false; }, [revealed]);
  useEffect(() => { if (solved) result.current?.focus(); }, [solved]);

  if (artifacts.length < 2) return <p className="mg-intro">{t('Dedektif oyunu için koleksiyonda en az iki eser olmalı.', 'The detective game needs at least two works in the collection.')}</p>;
  const harder = nextLevel(level);

  function begin(at: GameLevel, previous: Artifact | undefined, text: string, focusClue: boolean) {
    if (at !== level) setLevel(at);
    setRound(open(at, previous)); setRevealed(1); setWrong([]); setScored(null); setMessage(text);
    if (focusClue) requestAnimationFrame(() => clues.current[0]?.focus());
  }
  function reveal() { if (!round || revealed >= round.clues.length) return; opened.current = true; setRevealed(revealed + 1); setMessage(''); }
  function guess(artifact: Artifact) {
    if (solved || !round || wrong.includes(artifact.id)) return;
    if (artifact.id === round.mystery.id) {
      const cost = revealed + wrong.length;
      const stars = detectiveStars(cost);
      const outcome = finishGame('detective', artifact.id, level, cost);
      setScored({ ...outcome, result: cost, stars });
      setMessage(t(`Dosya çözüldü: ${artifact.name}. 3 yıldızdan ${stars}.`, `File solved: ${artifact.name}. ${stars} of 3 stars.`) + (outcome.unlocked.length ? ` ${t('Yeni madalyon', 'New medallion')}: ${outcome.unlocked.join(', ')}.` : ''));
      onComplete();
      return;
    }
    setWrong([...wrong, artifact.id]);
    setMessage(`${t(`${artifact.name} değil.`, `It is not ${artifact.name}.`)} ${revealed < round.clues.length ? t('Yeni bir ipucu açabilir ya da başka bir tahmin yapabilirsin.', 'You can open a new clue or make another guess.') : t('Kalan seçeneklerden birini dene.', 'Try one of the remaining options.')}`);
  }

  return <div className="mg-game">
    <p className="mg-kicker">02 · {t('İPUCU DEDEKTİFLİĞİ · OYNANABİLİR DEMO', 'CLUE DETECTIVE · PLAYABLE DEMO')}</p>
    <LevelPicker level={level} describe={at => t(`${clueCount(at)} ipucu · ${Math.min(detectiveOptions[at], artifacts.length)} seçenek`, `${clueCount(at)} clues · ${Math.min(detectiveOptions[at], artifacts.length)} options`)} onChange={at => begin(at, round?.mystery, t(`${levelName(at)} seviye: ${clueCount(at)} ipucu. Yeni bir dosya açıldı.`, `${levelName(at)} level: ${clueCount(at)} clues. A new file has been opened.`), false)} />
    <p className="mg-intro">{t('Dosyadaki eser hangisi? İpuçlarını sırayla aç, hazır olduğunda tahminini yap. Yanlış bir tahmin oyunu bitirmez; ne kadar az ipucu ve tahminle çözersen o kadar çok yıldız kazanırsın.', 'Which work is in the file? Open the clues one by one and make your guess when you are ready. A wrong guess does not end the game; the fewer clues and guesses you need, the more stars you earn.')}</p>
    {!round ? <p className="mg-intro" role="status">{t('Bu seviyede ipucu çıkarılabilecek bir eser yok. Daha kolay bir seviye seçebilirsin.', 'No work has enough clues for this level. You can choose an easier level.')}</p> : <div className="mg-dossier">
      <div className="mg-file">
        <p className="mg-file-head"><span>{t('TAÇKAPI • GİZLİ DOSYA', 'TAÇKAPI • SECRET FILE')}</span><span>{t(`${revealed} / ${round.clues.length} ipucu açık`, `${revealed} / ${round.clues.length} clues open`)}</span></p>
        <ol className="mg-clues">{round.clues.map((clue, i) => i < revealed
          ? <li key={i} className="open" ref={el => { clues.current[i] = el; }} tabIndex={-1}><span>{t('İPUCU', 'CLUE')} {i + 1} · {clue.label}</span><p>{clue.text}</p></li>
          : <li key={i} className="locked"><LockKeyhole size={16} aria-hidden="true" /><span>{t('İPUCU', 'CLUE')} {i + 1} · {t('Kilitli', 'Locked')}</span></li>)}
        </ol>
        {!solved && revealed < round.clues.length && <button type="button" className="mg-button" onClick={reveal}><Search size={16} aria-hidden="true" /> {t('Yeni ipucu aç', 'Open a new clue')}</button>}
      </div>
      {solved && scored ? <section className="mg-result" aria-labelledby="detective-result">
        <p className="mg-kicker">{t('DOSYA ÇÖZÜLDÜ', 'FILE SOLVED')} · {upper(levelName(level))} · {t(`${revealed}. İPUCUNDA`, `AT CLUE ${revealed}`)}</p>
        <h3 id="detective-result" ref={result} tabIndex={-1}>{round.mystery.name}</h3>
        {round.mystery.image !== PLACEHOLDER_IMAGE && <img className="mg-result-image" src={round.mystery.image} alt={imageAlt(round.mystery)} />}
        <Outcome scored={scored} unit={t('adım', 'steps')} summary={t(`${revealed}. ipucunda ${wrong.length ? `${wrong.length} yanlış tahminle` : 'hatasız'} çözdün: toplam ${scored.result} adım.`, `You solved it at clue ${revealed} ${wrong.length ? `with ${wrong.length} wrong ${wrong.length === 1 ? 'guess' : 'guesses'}` : 'without a mistake'}: ${scored.result} steps in all.`)} />
        <p>{round.mystery.chapters[0]?.short ?? round.mystery.description}</p>
        <div className="mg-actions">
          <Link className="mg-button primary" to={`/eser/${round.mystery.slug}`}>{t('Hikâyeyi oku', 'Read the story')} <ArrowUpRight size={17} aria-hidden="true" /></Link>
          {harder && <button type="button" className="mg-button" onClick={() => begin(harder, round.mystery, t(`${levelName(harder)} seviye: yeni bir dosya açıldı.`, `${levelName(harder)} level: a new file has been opened.`), true)}>{t(`${levelName(harder)} seviyede yeni dosya`, `New ${levelName(harder).toLowerCase()} file`)}</button>}
          <button type="button" className="mg-button" onClick={() => begin(level, round.mystery, t('Yeni bir dosya açıldı.', 'A new file has been opened.'), true)}>{t('Yeni dosya', 'New file')}</button>
        </div>
      </section> : <div className="mg-guess">
        <h3 id="detective-guess">{t('Tahminin', 'Your guess')}</h3>
        <div className="mg-options" role="group" aria-labelledby="detective-guess">{round.options.map(artifact => {
          const ruledOut = wrong.includes(artifact.id);
          return <button key={artifact.id} type="button" className={`mg-option ${ruledOut ? 'wrong' : ''}`} aria-disabled={ruledOut || undefined} onClick={() => guess(artifact)}><span>{artifact.name}</span>{ruledOut && <small>{t('Bu eser değil', 'Not this work')}</small>}</button>;
        })}</div>
      </div>}
    </div>}
    <p className="mg-status" role="status">{message}</p>
  </div>;
}
