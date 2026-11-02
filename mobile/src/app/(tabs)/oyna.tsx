// Oyna & Öğren: the quiz and the discovery routes as quests, each with its steps and a way to walk it.
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { ProgressBar } from '@/components/Controls';
import { huntScore } from '@/components/HuntZoom';
import { SectionHeader } from '@/components/Layout';
import { Button, Empty, Eyebrow, Loading, Title } from '@/components/UI';
import { mediaUrl } from '@/lib/api';
import { outcome } from '@/lib/hunt';
import { useHunt } from '@/lib/hunt-state';
import { t } from '@/lib/i18n';
import type { Quest } from '@/lib/quests';
import { useContent, usePassport, useQuests } from '@/lib/store';
import { colors, hit, radius, serif, space, type } from '@/lib/theme';

export default function Play() {
  const quests = useQuests();
  const { progress } = usePassport();
  const { items, loading } = useContent();
  return <ScrollView contentContainerStyle={{ padding: space.m, gap: space.m, paddingBottom: space.xl }}>
    <HuntEntry />
    <Card tone="dark" style={s.quiz}>
      <Eyebrow light>✦ {t('TARİHİN İZİNDE', 'ON THE TRAIL OF HISTORY')}</Eyebrow>
      <Title light>{t('Bilgi Yarışması', 'Knowledge Quiz')}</Title>
      <Text style={s.quizText}>{t('Beş soru, envanter kitabındaki bilgilerden. Yanlış şıklar da başka eserlerin gerçek bilgileridir.', 'Five questions from the inventory book. The wrong options are real facts about other works too.')}</Text>
      {progress.quiz.completed > 0 && <Text style={s.quizText}>{t(`${progress.quiz.completed} tur · en iyi skor %${progress.quiz.best}`, `${progress.quiz.completed} rounds · best score ${progress.quiz.best}%`)}</Text>}
      <Button kind="gold" icon="play" label={t('Yarışmaya başla', 'Start the quiz')} onPress={() => router.push('/quiz')} />
    </Card>

    <SectionHeader title={t('Keşif rotaları', 'Discovery routes')} />
    {quests.length ? quests.map(q => <QuestCard key={q.route.id} quest={q} />)
      // the routes are built from the works: wait for them before saying there is none
      : loading && !items.length ? <Loading /> : <Empty title={t('Henüz rota yok.', 'No routes yet.')} body={t('Keşif rotaları eklendiğinde burada görünecek.', 'Discovery routes will appear here once they are added.')} />}
  </ScrollView>;
}

/** Today's Detay Avı, the same puzzle as Bugün's card. */
function HuntEntry() {
  const { ready, number, puzzle } = useHunt();
  if (!ready || !puzzle) return null;
  const o = outcome(puzzle);
  const line = o.over ? huntScore(o.solved, puzzle.guesses.length, 'you') : t('Bir yakın çekim, dört eser. Herkes için aynı bulmaca.', 'One close-up, four works. The same puzzle for everyone.');
  const title = t('Günün Detay Avı', 'Today’s Detail Hunt');
  return <Card onPress={() => router.push('/detay-avi')} accessibilityLabel={`${title} #${number}. ${line}`} style={s.hunt}>
    <View style={s.huntIcon}><Ionicons name={o.over ? 'checkmark' : 'search'} size={22} color={colors.goldSoft} /></View>
    <View style={{ flex: 1 }}>
      <Eyebrow>✦ {t(`DETAY AVI #${number}`, `DETAIL HUNT #${number}`)}</Eyebrow>
      <Text style={s.huntTitle}>{title}</Text>
      <Text style={s.small}>{line}</Text>
    </View>
    <Ionicons name="chevron-forward" size={20} color={colors.goldLine} />
  </Card>;
}

function QuestCard({ quest }: { quest: Quest }) {
  const next = quest.steps.find(st => !st.done);
  const photos = quest.stops.map(st => mediaUrl(st.image?.thumb)).filter(Boolean).slice(0, 5) as string[];
  const open = (kind: 'read' | 'quiz', slug: string) => router.push(kind === 'quiz' ? `/quiz?eser=${encodeURIComponent(slug)}` : `/eser/${slug}`);
  return <Card style={[s.card, quest.complete && { borderColor: colors.gold }]}>
    <View style={s.stops}>{photos.map((p, i) => <Image key={p} source={p} alt="" style={[s.stop, { marginLeft: i ? -14 : 0, zIndex: 10 - i }]} contentFit="cover" accessibilityIgnoresInvertColors />)}
      <Text style={s.stopCount}>{t(`${quest.stops.length} DURAK`, `${quest.stops.length} STOPS`)}</Text></View>
    <Eyebrow>{quest.route.kicker}</Eyebrow>
    <Text style={s.title} accessibilityRole="header">{quest.route.title}</Text>
    <Text style={s.small}>{quest.route.description}</Text>
    <ProgressBar value={quest.done} max={quest.steps.length} label="" accessibilityLabel={t(`${quest.steps.length} adımın ${quest.done} tanesi tamam`, `${quest.done} of ${quest.steps.length} steps done`)} />
    <Text style={s.small}>{t(`${quest.done}/${quest.steps.length} adım · ${quest.visited}/${quest.stops.length} durak yerinde`, `${quest.done}/${quest.steps.length} steps · ${quest.visited}/${quest.stops.length} stops on the spot`)}</Text>
    {quest.steps.map((st, i) => <Pressable key={i} onPress={() => open(st.kind, st.slug)} style={s.step} accessibilityRole="button" accessibilityLabel={`${st.label}${st.done ? t(', tamamlandı', ', done') : ''}`}>
      <Ionicons name={st.done ? 'checkmark-circle' : st.kind === 'quiz' ? 'help-circle-outline' : 'book-outline'} size={18} color={st.done ? colors.emeraldLight : colors.goldText} />
      <Text style={[s.stepText, st.done && { color: colors.soft, textDecorationLine: 'line-through' }]}>{st.label}</Text>
    </Pressable>)}
    {quest.complete ? <Text style={s.complete}>✦ {t('GÖREV TAMAMLANDI', 'QUEST COMPLETE')}</Text>
      : next && <Button kind="plain" icon="arrow-forward" label={t('Sıradaki adım', 'Next step')} onPress={() => open(next.kind, next.slug)} />}
    <Button icon="walk-outline" label={t('Rotayı yürü', 'Walk the route')} onPress={() => router.push(`/rota/${quest.route.id}`)} />
  </Card>;
}

const s = StyleSheet.create({
  hunt: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  huntIcon: { width: hit, height: hit, borderRadius: hit / 2, backgroundColor: colors.emerald, alignItems: 'center', justifyContent: 'center' },
  huntTitle: { fontFamily: serif, color: colors.ink, ...type.heading },
  quiz: { padding: space.l, gap: space.s },
  quizText: { color: colors.parchment, ...type.small },
  card: { gap: space.s },
  stops: { flexDirection: 'row', alignItems: 'center', marginBottom: space.xs },
  stop: { width: hit, height: hit, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.paper, backgroundColor: colors.parchmentDeep },
  stopCount: { marginLeft: space.s, color: colors.goldText, letterSpacing: 1.4, fontWeight: '600', ...type.caption },
  title: { fontFamily: serif, color: colors.ink, ...type.title },
  small: { color: colors.soft, ...type.small },
  step: { flexDirection: 'row', gap: space.s, alignItems: 'center', minHeight: hit },
  stepText: { flex: 1, color: colors.ink, ...type.small },
  complete: { color: colors.goldText, fontWeight: '700', letterSpacing: 1.4, textAlign: 'center', paddingVertical: space.s },
});
