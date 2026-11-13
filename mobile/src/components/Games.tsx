// What the two mini games share: the level chooser, the result with its stars, record and medallions, the status line
// a screen reader hears, and the small pictures on Oyna.
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useCallback, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Typography';
import { levelName, GAME_LEVELS, type GameKind, type GameLevel } from '@/lib/games';
import { t } from '@/lib/i18n';
import { useSettings, type GameOutcome } from '@/lib/store';
import { colors, serif, space } from '@/lib/theme';

/** The last level chosen in a game stays chosen; a level given by a link wins for this visit. */
export function useGameLevel(game: GameKind, requested?: GameLevel) {
  const { settings, change } = useSettings();
  const [level, setLevel] = useState<GameLevel>(requested ?? settings.gameLevel[game] ?? 'kolay');
  const choose = useCallback((next: GameLevel) => {
    setLevel(next);
    change({ gameLevel: { ...settings.gameLevel, [game]: next } });
  }, [change, game, settings.gameLevel]);
  return [level, choose] as const;
}

/** A line on screen that VoiceOver and TalkBack also read out when it changes. */
export function useStatusLine() {
  const [message, setMessage] = useState('');
  const say = useCallback((text: string) => {
    setMessage(text);
    if (text) AccessibilityInfo.announceForAccessibility(text);
  }, []);
  return [message, say] as const;
}

export function LevelPicker({ level, onChange, describe }: { level: GameLevel; onChange: (level: GameLevel) => void; describe: (level: GameLevel) => string }) {
  return <View style={s.levels} accessibilityRole="radiogroup" accessibilityLabel={t('Zorluk seviyesi', 'Difficulty')}>
    {GAME_LEVELS.map(value => <Pressable key={value} onPress={() => { if (value !== level) onChange(value); }} accessibilityRole="radio" accessibilityState={{ checked: level === value }} aria-checked={level === value}
      style={[s.level, level === value && s.levelOn]}>
      <Text style={[s.levelName, level === value && { color: colors.goldSoft }]}>{levelName(value)}</Text>
      <Text style={[s.levelNote, level === value && { color: colors.mist }]}>{describe(value)}</Text>
    </Pressable>)}
  </View>;
}

export type Scored = GameOutcome & { result: number; stars: number };

export function Outcome({ scored, summary, unit }: { scored: Scored; summary: string; unit: string }) {
  const record = scored.previous === undefined ? t('Bu eseri bu seviyede ilk kez çözdün.', 'You solved this work at this level for the first time.')
    : scored.result < scored.previous ? t(`Yeni rekor! Önceki en iyin: ${scored.previous} ${unit}.`, `New record! Your previous best: ${scored.previous} ${unit}.`)
      : t(`Rekorun: ${scored.previous} ${unit}.`, `Your record: ${scored.previous} ${unit}.`);
  return <>
    <View style={s.stars} accessible accessibilityLabel={t(`3 yıldızdan ${scored.stars}`, `${scored.stars} of 3 stars`)}>
      {[0, 1, 2].map(i => <Ionicons key={i} name={i < scored.stars ? 'star' : 'star-outline'} size={26} color={colors.gold} />)}
    </View>
    <Text style={s.score}>{summary} {record}</Text>
    {scored.unlocked.length > 0 && <View style={s.medal}><Ionicons name="medal" size={18} color={colors.gold} />
      <Text style={s.medalText}>{t('Yeni madalyon', 'New medallion')}: {scored.unlocked.join(' · ')}</Text></View>}
  </>;
}

/** Oyna's picture of the puzzle: a real photo in nine pieces, two of them out of place. */
export function PuzzlePreview({ uri }: { uri: string | null }) {
  const [width, setWidth] = useState(0);
  const order = [0, 1, 2, 3, 7, 5, 6, 4, 8];
  const gap = 3, tile = (width - gap * 2) / 3, height = tile * 3 * 0.62 + gap * 2;
  return <View style={[s.preview, { height: Math.max(height, 120) }]} onLayout={e => setWidth(e.nativeEvent.layout.width)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {!!uri && width > 0 && order.map((piece, i) => <View key={i} style={{ position: 'absolute', overflow: 'hidden', borderRadius: 3, left: (i % 3) * (tile + gap), top: Math.floor(i / 3) * (tile * 0.62 + gap), width: tile, height: tile * 0.62 }}>
      <Image source={uri} alt="" contentFit="cover" style={{ position: 'absolute', width: width, height: tile * 0.62 * 3, left: -(piece % 3) * (width / 3), top: -Math.floor(piece / 3) * (tile * 0.62) }} />
    </View>)}
  </View>;
}

/** Oyna's picture of the detective game: a blurred photo under a closed file. */
export function DetectivePreview({ uri }: { uri: string | null }) {
  return <View style={[s.preview, { height: 132 }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {!!uri && <Image source={uri} alt="" contentFit="cover" blurRadius={14} style={StyleSheet.absoluteFill} />}
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#061410a6' }]} />
    <View style={s.file}>
      <Text style={s.fileHead}>{t('TAÇKAPI • GİZLİ DOSYA', 'TAÇKAPI • SECRET FILE')}</Text>
      {[0, 1].map(i => <View key={i} style={s.fileRow}><Ionicons name="search-outline" size={13} color={colors.gold} /><View style={[s.fileLine, { width: i ? '46%' : '62%' }]} /></View>)}
      <View style={s.fileRow}><Ionicons name="lock-closed-outline" size={13} color={colors.goldSoft} /><View style={[s.fileLine, { width: '34%', opacity: .5 }]} /></View>
    </View>
  </View>;
}

const s = StyleSheet.create({
  levels: { flexDirection: 'row', gap: space.s },
  level: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, paddingHorizontal: 4, borderRadius: 12, borderWidth: 1, borderColor: colors.goldLine, backgroundColor: colors.paper },
  levelOn: { backgroundColor: colors.emerald, borderColor: colors.emerald },
  levelName: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  levelNote: { color: colors.soft, fontSize: 11, textAlign: 'center' },
  stars: { flexDirection: 'row', gap: 4 },
  score: { color: colors.ink, fontSize: 15, lineHeight: 22 },
  medal: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, backgroundColor: colors.emerald },
  medalText: { flex: 1, color: colors.goldSoft, fontSize: 14, fontWeight: '600' },
  preview: { borderRadius: 12, overflow: 'hidden', backgroundColor: colors.emerald },
  file: { flex: 1, justifyContent: 'center', gap: 8, padding: space.m },
  fileHead: { color: colors.gold, fontSize: 11, letterSpacing: 1.6, fontWeight: '700' },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fileLine: { height: 7, borderRadius: 4, backgroundColor: colors.goldSoft },
});

export const gameStyles = StyleSheet.create({
  page: { padding: space.m, gap: space.m, paddingBottom: space.xl },
  kicker: { color: colors.goldText, fontSize: 11, letterSpacing: 1.6, fontWeight: '700' },
  intro: { color: colors.soft, fontSize: 14, lineHeight: 20 },
  status: { color: colors.goldText, fontSize: 13, lineHeight: 19, minHeight: 19 },
  result: { padding: space.m, borderRadius: 14, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.gold, gap: space.s },
  resultName: { fontFamily: serif, fontSize: 28, lineHeight: 32, color: colors.ink },
  meta: { color: colors.soft, fontSize: 13 },
  body: { color: colors.ink, fontSize: 15, lineHeight: 22 },
});
