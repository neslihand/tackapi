// Detay Avı: the day's close-up, four works to choose from; each wrong guess zooms out. The answer's name and its
// book sentence come only after the puzzle ends, then the work opens or the result is shared without the name.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { HuntMarks, huntScore, HuntZoom, triesLeft } from '@/components/HuntZoom';
import { ShareSheet, type Shared } from '@/components/ShareSheet';
import { Button, Empty, Eyebrow, Loading, Title } from '@/components/UI';
import { mediaUrl, type Item } from '@/lib/api';
import { teaser } from '@/lib/daily';
import { guessMarks, outcome, scaleFor } from '@/lib/hunt';
import { buzz } from '@/lib/motion';
import { useHunt } from '@/lib/hunt-state';
import { t } from '@/lib/i18n';
import { useContent } from '@/lib/store';
import { colors, hit, radius, serif, space, type } from '@/lib/theme';

export default function DetailHunt() {
  const { reload } = useContent();
  const { ready, number, puzzle, answer, options, guess } = useHunt();
  const [broken, setBroken] = useState(false);
  const [round, setRound] = useState(0);
  const [shared, setShared] = useState<Shared | null>(null);

  if (!ready) return <Loading />;
  if (!puzzle || !answer || options.length < 2) return <Empty title={t('Bugünün bulmacası şimdi açılamıyor.', 'Today’s puzzle can’t open right now.')}
    body={t('Eser listesi yüklenince burada olacak. Bağlantını kontrol edip yeniden dene.', 'It appears once the list of works has loaded. Check your connection and try again.')}
    action={<Button icon="refresh" label={t('Yeniden dene', 'Try again')} onPress={reload} />} />;

  const o = outcome(puzzle);
  const marks = guessMarks(puzzle);
  const photo = mediaUrl(answer.image?.src);
  const score = huntScore(o.solved, puzzle.guesses.length, 'you');
  const retry = () => { setBroken(false); setRound(r => r + 1); };

  return <ScrollView contentContainerStyle={s.page}>
    <View>
      <Eyebrow>✦ {t(`DETAY AVI #${number}`, `DETAIL HUNT #${number}`)}</Eyebrow>
      <Title size={type.title.fontSize}>{!o.over ? t('Bu ayrıntı hangi esere ait?', 'Which work is this detail from?')
        : o.solved ? t('Buldun!', 'You found it!') : t('Bu sefer olmadı', 'Not this time')}</Title>
    </View>

    {broken ? <View style={s.broken}><Empty title={t('Bugünün fotoğrafı açılamadı.', 'Today’s photo could not open.')}
      body={t('Fotoğraf daha önce yüklenmediyse bağlantı gerekir. Bağlanınca yeniden dene.', 'If the photo was not loaded before, it needs a connection. Try again once you are online.')}
      action={<Button icon="refresh" label={t('Yeniden dene', 'Try again')} onPress={retry} />} /></View>
      : <HuntZoom key={round} src={photo} focus={puzzle.focus} scale={scaleFor(puzzle)} onError={() => setBroken(true)} style={s.zoom}
        label={o.over ? t(`${answer.name} fotoğrafı`, `Photo of ${answer.name}`) : undefined} />}

    <View style={s.tries}>
      <HuntMarks marks={marks} label={o.over ? score : triesLeft(o.left)} />
      <Text style={s.triesText}>{o.over ? score : triesLeft(o.left)}</Text>
    </View>

    {o.over && <View style={s.result}>
      <Text style={s.answerKicker}>{t('CEVAP', 'THE ANSWER')}</Text>
      <Text style={s.answer} accessibilityRole="header">{answer.name}</Text>
      <Text style={s.meta}>{[answer.kind_label, answer.city.name, answer.built.label].filter(Boolean).join(' · ')}</Text>
      <Text style={s.teaser}>{teaser(answer)}</Text>
      <View style={s.actions}>
        <Button kind="gold" icon="book-outline" label={t('Eseri aç', 'Open the work')} onPress={() => router.push(`/eser/${answer.slug}`)} />
        <Button icon="share-social-outline" label={t('Paylaş', 'Share')}
          onPress={() => setShared({ kind: 'hunt', number, marks, solved: o.solved, photo, focus: puzzle.focus })} />
      </View>
    </View>}

    {/* no guessing blind: without the photo the options wait */}
    {(!broken || o.over) && <View style={s.options}>
      {options.map(item => <Option key={item.slug} item={item} wrong={puzzle.guesses.includes(item.slug) && item.slug !== puzzle.slug}
        right={o.over && item.slug === puzzle.slug} locked={o.over} onPress={() => { if (item.slug === puzzle.slug) buzz('success'); guess(item.slug); }} />)}
    </View>}
    <ShareSheet shared={shared} onClose={() => setShared(null)} />
  </ScrollView>;
}

function Option({ item, wrong, right, locked, onPress }: { item: Item; wrong: boolean; right: boolean; locked: boolean; onPress: () => void }) {
  const state = wrong ? t(', yanlış', ', wrong') : right ? t(', doğru cevap', ', the right answer') : '';
  return <Pressable onPress={onPress} disabled={wrong || locked} accessibilityRole="button" accessibilityState={{ disabled: wrong || locked }}
    accessibilityLabel={`${item.name}, ${item.city.name}${state}`}
    style={({ pressed }) => [s.option, wrong && s.optionWrong, right && s.optionRight, pressed && { opacity: 0.85 }]}>
    <Ionicons name={wrong ? 'close-circle' : right ? 'checkmark-circle' : 'ellipse-outline'} size={22}
      color={wrong ? colors.danger : right ? colors.emeraldLight : colors.goldLine} />
    <View style={{ flex: 1 }}>
      <Text style={[s.optionName, wrong && s.struck]}>{item.name}</Text>
      <Text style={s.optionCity}>{item.city.name}</Text>
    </View>
    {wrong && <Text style={s.wrongTag}>{t('yanlış', 'wrong')}</Text>}
    {right && <Text style={s.rightTag}>{t('doğru', 'right')}</Text>}
  </Pressable>;
}

const s = StyleSheet.create({
  page: { padding: space.m, gap: space.m, paddingBottom: space.xl },
  zoom: { borderRadius: radius.l, borderWidth: 1, borderColor: colors.goldLine },
  broken: { borderRadius: radius.l, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  tries: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  triesText: { color: colors.soft, ...type.body },
  result: { gap: space.s, padding: space.m, borderRadius: radius.l, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.gold },
  answerKicker: { color: colors.goldText, ...type.caption, letterSpacing: 2, fontWeight: '600' },
  answer: { fontFamily: serif, color: colors.ink, ...type.title },
  meta: { color: colors.soft, ...type.caption },
  teaser: { color: colors.ink, ...type.body },
  actions: { gap: space.s, marginTop: space.xs },
  options: { gap: space.s },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.s, minHeight: hit + space.s, paddingHorizontal: space.m, paddingVertical: space.s,
    borderRadius: radius.m, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  optionWrong: { backgroundColor: colors.parchmentDeep, borderColor: colors.danger },
  optionRight: { borderColor: colors.emeraldLight, borderWidth: 2 },
  optionName: { fontFamily: serif, color: colors.ink, ...type.heading },
  optionCity: { color: colors.soft, ...type.caption },
  struck: { textDecorationLine: 'line-through', color: colors.soft },
  wrongTag: { color: colors.danger, ...type.caption, fontWeight: '700' },
  rightTag: { color: colors.emeraldLight, ...type.caption, fontWeight: '700' },
});
