// Miras Dedektifi: which work is in the file? The clues open one by one, each from the work's own record; a wrong guess
// does not end the game, it only costs a step. The rules are in lib/games.ts; the result goes to the passport as a record.
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/Typography';
import { gameStyles as g, LevelPicker, Outcome, useGameLevel, useStatusLine, type Scored } from '@/components/Games';
import { Button, Empty, Loading, Notice } from '@/components/UI';
import { mediaUrl } from '@/lib/api';
import { canBeMystery, clueCount, detectiveClues, detectiveOptions, detectiveStars, isGameLevel, levelName, nextLevel, pickNext, pickOptions, toGameWork, type Clue, type GameLevel, type GameWork } from '@/lib/games';
import { t } from '@/lib/i18n';
import { completeActivity } from '@/lib/playSession';
import { useContent, usePassport } from '@/lib/store';
import { colors, serif, space } from '@/lib/theme';

type Case = { mystery: GameWork; options: GameWork[]; clues: Clue[] };

export default function Detective() {
  const { seviye } = useLocalSearchParams<{ seviye?: string }>();
  const { items, loading } = useContent();
  if (loading && !items.length) return <Loading />;
  if (items.length < 2) return <Empty title={t('Dedektif oyunu için koleksiyonda en az iki eser olmalı.', 'The detective game needs at least two works in the collection.')} />;
  return <Game requestedLevel={isGameLevel(seviye) ? seviye : undefined} />;
}

function Game({ requestedLevel }: { requestedLevel?: GameLevel }) {
  const { items, bySlug } = useContent();
  const { progress, finishGame } = usePassport();
  const [level, setLevel] = useGameLevel('detective', requestedLevel);
  const works = useMemo(() => items.map(toGameWork), [items]);
  const open = (at: GameLevel, previous?: GameWork): Case | null => {
    const mystery = pickNext(works.filter(w => canBeMystery(w, at)), w => progress.games.detective[w.id]?.[at] !== undefined, previous);
    return mystery ? { mystery, options: pickOptions(mystery, works, at), clues: detectiveClues(mystery, at) } : null;
  };
  const [round, setRound] = useState(() => open(level));
  const [revealed, setRevealed] = useState(1);
  const [wrong, setWrong] = useState<string[]>([]);
  const [scored, setScored] = useState<Scored | null>(null);
  const [message, say] = useStatusLine();
  const solved = scored !== null;
  const harder = nextLevel(level);

  function begin(at: GameLevel, previous: GameWork | undefined, text: string) {
    if (at !== level) setLevel(at);
    setRound(open(at, previous)); setRevealed(1); setWrong([]); setScored(null); say(text);
  }
  function reveal() {
    if (!round || revealed >= round.clues.length) return;
    const clue = round.clues[revealed];
    setRevealed(revealed + 1);
    say(t(`İpucu ${revealed + 1}, ${clue.label}: ${clue.text}`, `Clue ${revealed + 1}, ${clue.label}: ${clue.text}`));
  }
  function guess(work: GameWork) {
    if (solved || !round || wrong.includes(work.id)) return;
    if (work.id === round.mystery.id) {
      const cost = revealed + wrong.length;
      const stars = detectiveStars(cost);
      const outcome = finishGame('detective', work.id, level, cost);
      setScored({ ...outcome, result: cost, stars });
      completeActivity('detective');
      say(t(`Dosya çözüldü: ${work.name}. 3 yıldızdan ${stars}.`, `File solved: ${work.name}. ${stars} of 3 stars.`) + (outcome.unlocked.length ? ` ${t('Yeni madalyon', 'New medallion')}: ${outcome.unlocked.join(', ')}.` : ''));
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    setWrong([...wrong, work.id]);
    say(`${t(`${work.name} değil.`, `It is not ${work.name}.`)} ${revealed < round.clues.length ? t('Yeni bir ipucu açabilir ya da başka bir tahmin yapabilirsin.', 'You can open a new clue or make another guess.') : t('Kalan seçeneklerden birini dene.', 'Try one of the remaining options.')}`);
  }

  const item = round ? bySlug(round.mystery.id) : undefined;
  return <ScrollView contentContainerStyle={g.page}>
    <Text style={g.kicker}>02 · {t('İPUCU DEDEKTİFLİĞİ', 'CLUE DETECTIVE')}</Text>
    <LevelPicker level={level} describe={at => t(`${clueCount(at)} ipucu · ${Math.min(detectiveOptions[at], works.length)} seçenek`, `${clueCount(at)} clues · ${Math.min(detectiveOptions[at], works.length)} options`)}
      onChange={at => begin(at, round?.mystery, t(`${levelName(at)} seviye: yeni bir dosya açıldı.`, `${levelName(at)} level: a new file has been opened.`))} />
    {!solved && <Text style={g.intro}>{t('Dosyadaki eser hangisi? İpuçlarını sırayla aç, hazır olduğunda tahminini yap. Yanlış tahmin oyunu bitirmez; ne kadar az ipucu ve tahminle çözersen o kadar çok yıldız kazanırsın.', 'Which work is in the file? Open the clues one by one and make your guess when you are ready. A wrong guess does not end the game; the fewer clues and guesses you need, the more stars you earn.')}</Text>}

    {!round ? <Notice icon="information-circle-outline">{t('Bu seviyede ipucu çıkarılabilecek bir eser yok. Daha kolay bir seviye seçebilirsin.', 'No work has enough clues for this level. You can choose an easier level.')}</Notice> : <>
      <View style={s.file}>
        <View style={s.fileHead}>
          <Text style={s.fileTitle}>{t('EŞİK • GİZLİ DOSYA', 'EŞİK • SECRET FILE')}</Text>
          <Text style={s.fileCount}>{t(`${revealed} / ${round.clues.length} ipucu açık`, `${revealed} / ${round.clues.length} clues open`)}</Text>
        </View>
        {round.clues.map((clue, i) => i < revealed
          ? <View key={i} style={s.clue} accessible accessibilityLabel={t(`İpucu ${i + 1}, ${clue.label}: ${clue.text}`, `Clue ${i + 1}, ${clue.label}: ${clue.text}`)}>
            <Text style={s.clueLabel}>{t('İPUCU', 'CLUE')} {i + 1} · {clue.label}</Text>
            <Text style={s.clueText}>{clue.text}</Text>
          </View>
          : <View key={i} style={[s.clue, s.locked]} accessible accessibilityLabel={t(`İpucu ${i + 1}, kilitli`, `Clue ${i + 1}, locked`)}>
            <Ionicons name="lock-closed-outline" size={15} color={colors.goldSoft} />
            <Text style={s.clueLabel}>{t('İPUCU', 'CLUE')} {i + 1} · {t('Kilitli', 'Locked')}</Text>
          </View>)}
        {!solved && revealed < round.clues.length && <Button kind="gold" icon="search-outline" label={t('Yeni ipucu aç', 'Open a new clue')} onPress={reveal} />}
      </View>

      <Text style={g.status} accessibilityLiveRegion="polite">{message}</Text>

      {solved && scored ? <View style={g.result}>
        <Text style={g.kicker}>{t('DOSYA ÇÖZÜLDÜ', 'FILE SOLVED')} · {levelName(level).toLocaleUpperCase(t('tr-TR', 'en-GB'))} · {t(`${revealed}. İPUCUNDA`, `AT CLUE ${revealed}`)}</Text>
        <Text style={g.resultName} accessibilityRole="header">{round.mystery.name}</Text>
        {item?.image && <Image source={mediaUrl(item.image.src)} contentFit="cover" style={s.photo} accessibilityLabel={item.image.alt ?? round.mystery.name} />}
        <Outcome scored={scored} unit={t('adım', 'steps')} summary={t(`${revealed}. ipucunda ${wrong.length ? `${wrong.length} yanlış tahminle` : 'hatasız'} çözdün: toplam ${scored.result} adım.`, `You solved it at clue ${revealed} ${wrong.length ? `with ${wrong.length} wrong guesses` : 'without a mistake'}: ${scored.result} steps in all.`)} />
        {!!item?.summary && <Text style={g.body}>{item.summary}</Text>}
        <Button icon="book-outline" label={t('Hikâyeyi oku', 'Read the story')} onPress={() => router.push(`/eser/${round.mystery.id}`)} />
        {harder && <Button kind="plain" icon="trending-up-outline" label={t(`${levelName(harder)} seviyede yeni dosya`, `New ${levelName(harder).toLowerCase()} file`)} onPress={() => begin(harder, round.mystery, t(`${levelName(harder)} seviye: yeni bir dosya açıldı.`, `${levelName(harder)} level: a new file has been opened.`))} />}
        <Button kind="plain" icon="folder-open-outline" label={t('Yeni dosya', 'New file')} onPress={() => begin(level, round.mystery, t('Yeni bir dosya açıldı.', 'A new file has been opened.'))} />
      </View> : <View style={{ gap: space.s }}>
        <Text style={s.guessHead} accessibilityRole="header">{t('Tahminin', 'Your guess')}</Text>
        {round.options.map(work => {
          const ruledOut = wrong.includes(work.id);
          return <Pressable key={work.id} onPress={() => guess(work)} disabled={ruledOut} accessibilityRole="button" accessibilityState={{ disabled: ruledOut }}
            accessibilityLabel={`${work.name}${ruledOut ? t(', bu eser değil', ', not this work') : ''}`} style={[s.option, ruledOut && s.ruledOut]}>
            <Text style={[s.optionText, ruledOut && { textDecorationLine: 'line-through' }]}>{work.name}</Text>
            {ruledOut && <Text style={s.optionNote}>{t('Bu eser değil', 'Not this work')}</Text>}
          </Pressable>;
        })}
      </View>}
    </>}
  </ScrollView>;
}

const s = StyleSheet.create({
  file: { padding: space.m, borderRadius: 14, backgroundColor: colors.emerald, borderWidth: 1, borderColor: colors.goldLine, gap: space.s },
  fileHead: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: space.s, paddingBottom: space.xs },
  fileTitle: { color: colors.gold, fontSize: 11, letterSpacing: 1.6, fontWeight: '700' },
  fileCount: { color: colors.mist, fontSize: 12 },
  clue: { padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.nightLine, backgroundColor: '#ffffff0d', gap: 4 },
  locked: { flexDirection: 'row', alignItems: 'center', gap: 8, borderStyle: 'dashed', backgroundColor: 'transparent' },
  clueLabel: { color: colors.goldSoft, fontSize: 11, letterSpacing: 1.2, fontWeight: '600' },
  clueText: { fontFamily: serif, color: colors.ivory, fontSize: 20, lineHeight: 26 },
  photo: { width: '100%', aspectRatio: 16 / 10, borderRadius: 10, backgroundColor: colors.parchmentDeep },
  guessHead: { fontFamily: serif, fontSize: 24, color: colors.ink },
  option: { minHeight: 52, justifyContent: 'center', padding: 14, borderRadius: 14, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.goldLine },
  ruledOut: { borderColor: colors.line, opacity: .7 },
  optionText: { color: colors.ink, fontSize: 16 },
  optionNote: { color: colors.soft, fontSize: 12, marginTop: 2 },
});
