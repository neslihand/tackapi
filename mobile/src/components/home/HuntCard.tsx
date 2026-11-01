// Bugün's "Detay Avı": today's close-up, blurred, until it is played; then the result and the spoiler-free share card.
// Hidden while the list of works is loading or has no puzzle.
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { HuntMarks, huntScore, HuntZoom, triesLeft } from '@/components/HuntZoom';
import { ShareSheet, type Shared } from '@/components/ShareSheet';
import { Button, Eyebrow } from '@/components/UI';
import { mediaUrl } from '@/lib/api';
import { guessMarks, HUNT_SCALES, outcome } from '@/lib/hunt';
import { useHunt } from '@/lib/hunt-state';
import { t } from '@/lib/i18n';
import { colors, hit, radius, serif, space, type } from '@/lib/theme';
import { home } from './styles';

export function HuntCard() {
  const { ready, number, puzzle, answer } = useHunt();
  const [shared, setShared] = useState<Shared | null>(null);
  if (!ready || !puzzle || !answer) return null;

  const o = outcome(puzzle);
  const marks = guessMarks(puzzle);
  const photo = mediaUrl(answer.image?.src);
  const open = () => router.push('/detay-avi');
  const score = huntScore(o.solved, puzzle.guesses.length, 'you');

  return <View style={home.pad}>
    <Card style={home.gap}>
      <View style={s.row}>
        {/* before the end only a blurred close-up: the photo would give the answer away */}
        <HuntZoom src={photo} focus={puzzle.focus} size={hit * 2} scale={o.over ? 1 : HUNT_SCALES[0]} blur={o.over ? undefined : 6}
          label={o.over ? t(`${answer.name} fotoğrafı`, `Photo of ${answer.name}`) : undefined} style={s.photo} />
        <View style={s.text}>
          <Eyebrow>✦ {t(`DETAY AVI #${number}`, `DETAIL HUNT #${number}`)}</Eyebrow>
          {o.over ? <>
            <Text style={s.title} numberOfLines={2}>{answer.name}</Text>
            <HuntMarks marks={marks} label={score} />
            <Text style={home.small}>{score}</Text>
          </> : <>
            <Text style={s.title}>{t('Bugünün detayını bul', 'Find today’s detail')}</Text>
            <Text style={home.small}>{puzzle.guesses.length ? triesLeft(o.left) : t('Yakın çekim hangi esere ait? Her yanlışta görüntü açılır.', 'Which work is the close-up from? Each wrong guess zooms out.')}</Text>
          </>}
        </View>
      </View>
      {o.over ? <View style={s.actions}>
        <Button kind="gold" icon="share-social-outline" label={t('Paylaş', 'Share')} style={s.action}
          onPress={() => setShared({ kind: 'hunt', number, marks, solved: o.solved, photo, focus: puzzle.focus })} />
        <Button kind="plain" icon="eye-outline" label={t('Sonucu gör', 'See the result')} style={s.action} onPress={open} />
      </View> : <Button kind="gold" icon="search" label={puzzle.guesses.length ? t('Devam et', 'Continue') : t('Tahmin et', 'Make a guess')} onPress={open} />}
    </Card>
    <ShareSheet shared={shared} onClose={() => setShared(null)} />
  </View>;
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.m, alignItems: 'center' },
  photo: { borderRadius: radius.m },
  text: { flex: 1, gap: space.xs },
  title: { fontFamily: serif, color: colors.ink, ...type.heading },
  actions: { flexDirection: 'row', gap: space.s },
  action: { flex: 1, paddingHorizontal: space.s },
});
