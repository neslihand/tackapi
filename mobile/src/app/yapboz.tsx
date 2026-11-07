// Kayıp Parçalar: a work's own photo in pieces. Tap a piece, then the piece to swap it with. ?eser=<slug> opens that work
// (a quest step) and ?seviye= a level. The rules are in lib/games.ts; the result goes to the passport as a record.
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/Typography';
import { gameStyles as g, LevelPicker, Outcome, useGameLevel, useStatusLine, type Scored } from '@/components/Games';
import { Button, Empty, Loading } from '@/components/UI';
import { mediaUrl, type Item } from '@/lib/api';
import { inPlace, isGameLevel, levelName, minSwaps, nextLevel, pickNext, puzzleSize, puzzleStars, scramble, type GameLevel } from '@/lib/games';
import { t } from '@/lib/i18n';
import { useAppWidth } from '@/lib/layout';
import { completeActivity } from '@/lib/playSession';
import { useContent, usePassport } from '@/lib/store';
import { colors, serif, space } from '@/lib/theme';

const place = (i: number, size: number) => t(`${Math.floor(i / size) + 1}. satır, ${i % size + 1}. sütun`, `row ${Math.floor(i / size) + 1}, column ${i % size + 1}`);
const freshBoard = (size: number) => { const order = scramble(size); return { size, order, least: minSwaps(order) }; };
const OUTER = space.m * 2, FRAME = 6, MAX_WIDTH = 520;

export default function Puzzle() {
  const { eser, seviye } = useLocalSearchParams<{ eser?: string; seviye?: string }>();
  const { items, loading } = useContent();
  const pictured = useMemo(() => items.filter(i => i.image), [items]);
  if (loading && !items.length) return <Loading />;
  if (!pictured.length) return <Empty title={t('Yapboz için görseli olan bir eser henüz yok.', 'There is no work with a picture for the puzzle yet.')} />;
  return <Game pictured={pictured} requested={eser} requestedLevel={isGameLevel(seviye) ? seviye : undefined} />;
}

function Game({ pictured, requested, requestedLevel }: { pictured: Item[]; requested?: string; requestedLevel?: GameLevel }) {
  const { progress, finishGame } = usePassport();
  const [level, setLevel] = useGameLevel('puzzle', requestedLevel);
  const works = useMemo(() => pictured.map(item => ({ id: item.slug, item })), [pictured]);
  const choose = (at: GameLevel, previous?: Item) => pickNext(works, w => progress.games.puzzle[w.id]?.[at] !== undefined, previous && { id: previous.slug, item: previous })?.item;
  const [work, setWork] = useState<Item | undefined>(() => pictured.find(i => i.slug === requested) ?? choose(level));
  const [board, setBoard] = useState(() => freshBoard(puzzleSize[level]));
  const [selected, setSelected] = useState<number | null>(null);
  const [moves, setMoves] = useState(0);
  const [numbers, setNumbers] = useState(false);
  const [preview, setPreview] = useState(false);
  const [scored, setScored] = useState<Scored | null>(null);
  const [message, say] = useStatusLine();
  const screen = useAppWidth();
  if (!work) return null;

  const { size, order, least } = board;
  const placed = inPlace(order);
  const solved = placed === order.length;
  const best = progress.games.puzzle[work.slug]?.[level];
  const harder = nextLevel(level);
  const uri = mediaUrl(work.image!.src);
  // the photo's own shape, kept between square and 4:3 so every level still has pieces a finger can hit
  const shape = Math.min(4 / 3, Math.max(1, (work.image!.width ?? 4) / (work.image!.height ?? 3)));
  const inner = Math.min(screen - OUTER, MAX_WIDTH) - FRAME * 2;
  const gap = solved ? 0 : size === 5 ? 2 : 3;
  const width = (inner - gap * (size - 1)) / size, height = (inner / shape - gap * (size - 1)) / size;

  function start(next: Item | undefined, at: GameLevel, text: string) {
    if (at !== level) setLevel(at);
    setWork(next); setBoard(freshBoard(puzzleSize[at])); setSelected(null); setMoves(0); setPreview(false); setScored(null); say(text);
  }
  function pick(i: number) {
    if (solved || !work) return;
    if (selected === null) { setSelected(i); Haptics.selectionAsync().catch(() => {}); say(t(`Parça ${order[i] + 1} seçildi. Yerini değiştirmek için başka bir parça seç.`, `Piece ${order[i] + 1} selected. Choose another piece to swap it with.`)); return; }
    if (selected === i) { setSelected(null); say(t('Seçim kaldırıldı.', 'Selection cleared.')); return; }
    const next = [...order];
    [next[selected], next[i]] = [next[i], next[selected]];
    const count = moves + 1;
    setBoard({ ...board, order: next }); setSelected(null); setMoves(count);
    if (inPlace(next) === next.length) {
      const stars = puzzleStars(count, least, size);
      const outcome = finishGame('puzzle', work.slug, level, count);
      setScored({ ...outcome, result: count, stars });
      completeActivity('puzzle');
      say(t(`Yapboz tamamlandı: ${count} hamlede ${work.name} görseli birleşti. 3 yıldızdan ${stars}.`, `Puzzle complete: the picture of ${work.name} came together in ${count} moves. ${stars} of 3 stars.`) + (outcome.unlocked.length ? ` ${t('Yeni madalyon', 'New medallion')}: ${outcome.unlocked.join(', ')}.` : ''));
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      say(t(`Parça ${order[selected] + 1} ile parça ${order[i] + 1} yer değiştirdi. ${inPlace(next)} / ${next.length} parça yerinde.`, `Pieces ${order[selected] + 1} and ${order[i] + 1} swapped. ${inPlace(next)} / ${next.length} pieces in place.`));
    }
  }

  return <ScrollView contentContainerStyle={g.page}>
    <Text style={g.kicker}>01 · {t('GÖRSEL YAPBOZ', 'PICTURE PUZZLE')}</Text>
    <LevelPicker level={level} describe={at => `${puzzleSize[at]}×${puzzleSize[at]}`}
      onChange={at => start(work, at, t(`${levelName(at)} seviye: ${puzzleSize[at]}×${puzzleSize[at]} yapboz. Yeni tur başladı.`, `${levelName(at)} level: a ${puzzleSize[at]}×${puzzleSize[at]} puzzle. A new round has started.`))} />
    {!solved && <Text style={g.intro}>{t(`Önce bir parçaya, sonra onunla yer değiştirecek parçaya dokun. Numaralar doğru yeri gösterir: 1 sol üst köşe, ${size * size} sağ alt köşe.`, `Tap a piece, then the piece to swap it with. The numbers show the right place: 1 is the top-left corner, ${size * size} the bottom-right.`)}</Text>}

    <View style={[s.board, { width: inner + FRAME * 2, gap }]} accessibilityLabel={t(`Yapboz tahtası: ${size} satır, ${size} sütun`, `Puzzle board: ${size} rows, ${size} columns`)}>
      {order.map((piece, i) => <Pressable key={i} onPress={() => pick(i)} disabled={solved} accessibilityRole="button" accessibilityState={{ selected: selected === i, disabled: solved }}
        accessibilityLabel={`${place(i, size)}: ${t('parça', 'piece')} ${piece + 1}${piece === i ? t(', doğru yerde', ', in the right place') : ''}`}
        style={[s.tile, { width, height, borderRadius: solved ? 0 : 4 }, selected === i && s.tileOn]}>
        <Image source={uri} alt="" contentFit="cover" accessibilityIgnoresInvertColors
          style={{ position: 'absolute', width: inner, height: inner / shape, left: -(piece % size) * (inner / size), top: -Math.floor(piece / size) * (inner / shape / size) }} />
        {numbers && !solved && <View style={s.number}><Text style={s.numberText}>{piece + 1}</Text></View>}
      </Pressable>)}
    </View>

    <Text style={g.status} accessibilityLiveRegion="polite">{message}</Text>

    {solved ? <View style={g.result}>
      <Text style={g.kicker}>{t('MOTİF TAMAMLANDI', 'MOTIF COMPLETE')} · {levelName(level).toLocaleUpperCase(t('tr-TR', 'en-GB'))} · {moves} {t('HAMLE', 'MOVES')}</Text>
      <Text style={g.resultName} accessibilityRole="header">{work.name}</Text>
      {scored && <Outcome scored={scored} unit={t('hamle', 'moves')} summary={t(`En az ${least} hamle mümkündü; sen ${moves} hamlede çözdün.`, `It could be done in ${least} moves; you solved it in ${moves}.`)} />}
      <Text style={g.meta}>{[work.city.name, work.built.label, work.architect || work.builder].filter(Boolean).join(' · ')}</Text>
      {!!work.summary && <Text style={g.body}>{work.summary}</Text>}
      <Button icon="book-outline" label={t('Hikâyeyi oku', 'Read the story')} onPress={() => router.push(`/eser/${work.slug}`)} />
      {harder && <Button kind="plain" icon="trending-up-outline" label={t(`${levelName(harder)} seviyede dene`, `Try ${levelName(harder).toLowerCase()}`)}
        onPress={() => start(work, harder, t(`${levelName(harder)} seviye: ${work.name}, ${puzzleSize[harder]}×${puzzleSize[harder]} yapboz.`, `${levelName(harder)} level: ${work.name}, a ${puzzleSize[harder]}×${puzzleSize[harder]} puzzle.`))} />}
      <Button kind="plain" icon="shuffle" label={t('Yeni yapboz', 'New puzzle')} onPress={() => start(choose(level, work), level, t('Yeni bir görsel karıştırıldı.', 'A new picture has been shuffled.'))} />
    </View> : <View style={{ gap: space.s }}>
      <View style={s.stats}>
        <Stat label={t('Hamle', 'Moves')} value={String(moves)} />
        <Stat label={t('Yerinde', 'In place')} value={`${placed} / ${order.length}`} />
      </View>
      {best !== undefined && <Text style={g.meta}>{t(`Bu eserde ${levelName(level).toLocaleLowerCase('tr-TR')} seviye rekorun: ${best} hamle`, `Your ${levelName(level).toLowerCase()} record on this work: ${best} moves`)}</Text>}
      <View style={s.tools}>
        <Tool icon="keypad-outline" label={numbers ? t('Numaraları gizle', 'Hide the numbers') : t('Numaraları göster', 'Show the numbers')} on={numbers} onPress={() => setNumbers(!numbers)} />
        <Tool icon="eye-outline" label={preview ? t('Görseli gizle', 'Hide the picture') : t('Tamamlanmış görsel', 'The finished picture')} on={preview} onPress={() => setPreview(!preview)} />
      </View>
      {preview && <Image source={uri} contentFit="cover" style={[s.preview, { aspectRatio: shape }]} accessibilityLabel={`${t('Hedef görsel.', 'The target picture.')} ${work.image!.alt ?? ''}`} />}
      <Button kind="plain" icon="shuffle" label={t('Yeniden karıştır', 'Shuffle again')} onPress={() => start(work, level, t('Parçalar yeniden karıştırıldı.', 'The pieces have been shuffled again.'))} />
    </View>}
  </ScrollView>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <View style={s.stat} accessible accessibilityLabel={`${label}: ${value}`}><Text style={s.statValue}>{value}</Text><Text style={s.statLabel}>{label}</Text></View>;
}

function Tool({ icon, label, on, onPress }: { icon: 'keypad-outline' | 'eye-outline'; label: string; on: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={label} style={[s.tool, on && s.toolOn]}>
    <Ionicons name={icon} size={17} color={on ? colors.goldSoft : colors.ink} />
    <Text style={[s.toolText, on && { color: colors.goldSoft }]}>{label}</Text>
  </Pressable>;
}

const s = StyleSheet.create({
  board: { alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', padding: FRAME, borderRadius: 10, backgroundColor: colors.emerald },
  tile: { overflow: 'hidden', backgroundColor: colors.emeraldLight },
  tileOn: { transform: [{ scale: .92 }], borderWidth: 3, borderColor: colors.goldSoft, zIndex: 1 },
  number: { position: 'absolute', top: 3, left: 3, minWidth: 22, height: 22, paddingHorizontal: 4, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#061410d9' },
  numberText: { color: colors.goldSoft, fontSize: 12, fontWeight: '700' },
  stats: { flexDirection: 'row', gap: space.s },
  stat: { flex: 1, padding: 10, borderRadius: 12, alignItems: 'center', backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  statValue: { fontFamily: serif, fontSize: 26, color: colors.ink },
  statLabel: { color: colors.soft, fontSize: 12 },
  tools: { flexDirection: 'row', gap: space.s },
  tool: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.goldLine, backgroundColor: colors.paper },
  toolOn: { backgroundColor: colors.emerald, borderColor: colors.emerald },
  toolText: { flexShrink: 1, color: colors.ink, fontSize: 13, textAlign: 'center' },
  preview: { width: '100%', borderRadius: 10, backgroundColor: colors.parchmentDeep },
});
