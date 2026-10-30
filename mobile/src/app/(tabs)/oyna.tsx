// Oyna & Öğren: the quiz and the discovery routes as quests, each with its steps and a way to walk it.
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Empty, Eyebrow, Title } from '@/components/UI';
import { mediaUrl } from '@/lib/api';
import { t } from '@/lib/i18n';
import type { Quest } from '@/lib/quests';
import { usePassport, useQuests } from '@/lib/store';
import { colors, serif, space } from '@/lib/theme';

export default function Play() {
  const quests = useQuests();
  const { progress } = usePassport();
  return <ScrollView contentContainerStyle={{ padding: space.m, gap: space.m, paddingBottom: space.xl }}>
    <View style={s.quiz}>
      <Eyebrow light>✦ {t('TARİHİN İZİNDE', 'ON THE TRAIL OF HISTORY')}</Eyebrow>
      <Title light size={26}>{t('Bilgi Yarışması', 'Knowledge Quiz')}</Title>
      <Text style={s.quizText}>{t('Beş soru, envanter kitabındaki bilgilerden. Yanlış şıklar da başka eserlerin gerçek bilgileridir.', 'Five questions from the inventory book. The wrong options are real facts about other works too.')}</Text>
      {progress.quiz.completed > 0 && <Text style={s.quizText}>{t(`${progress.quiz.completed} tur · en iyi skor %${progress.quiz.best}`, `${progress.quiz.completed} rounds · best score ${progress.quiz.best}%`)}</Text>}
      <Button kind="gold" icon="play" label={t('Yarışmaya başla', 'Start the quiz')} onPress={() => router.push('/quiz')} />
    </View>

    <Eyebrow>{t('KEŞİF ROTALARI', 'DISCOVERY ROUTES')}</Eyebrow>
    {quests.length ? quests.map(q => <QuestCard key={q.route.id} quest={q} />)
      : <Empty title={t('Henüz rota yok.', 'No routes yet.')} body={t('Keşif rotaları eklendiğinde burada görünecek.', 'Discovery routes will appear here once they are added.')} />}
  </ScrollView>;
}

function QuestCard({ quest }: { quest: Quest }) {
  const next = quest.steps.find(st => !st.done);
  const photos = quest.stops.map(st => mediaUrl(st.image?.thumb)).filter(Boolean).slice(0, 5) as string[];
  const open = (kind: 'read' | 'quiz', slug: string) => router.push(kind === 'quiz' ? `/quiz?eser=${encodeURIComponent(slug)}` : `/eser/${slug}`);
  return <View style={[s.card, quest.complete && { borderColor: colors.gold }]}>
    <View style={s.stops}>{photos.map((p, i) => <Image key={p} source={p} alt="" style={[s.stop, { marginLeft: i ? -14 : 0, zIndex: 10 - i }]} contentFit="cover" accessibilityIgnoresInvertColors />)}
      <Text style={s.stopCount}>{t(`${quest.stops.length} DURAK`, `${quest.stops.length} STOPS`)}</Text></View>
    <Eyebrow>{quest.route.kicker}</Eyebrow>
    <Text style={s.title} accessibilityRole="header">{quest.route.title}</Text>
    <Text style={s.small}>{quest.route.description}</Text>
    <View style={s.bar} accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: quest.steps.length, now: quest.done }} accessibilityLabel={t(`${quest.steps.length} adımın ${quest.done} tanesi tamam`, `${quest.done} of ${quest.steps.length} steps done`)}>
      <View style={[s.barFill, { width: `${(quest.done / quest.steps.length) * 100}%` }]} /></View>
    <Text style={s.small}>{t(`${quest.done}/${quest.steps.length} adım · ${quest.visited}/${quest.stops.length} durak yerinde`, `${quest.done}/${quest.steps.length} steps · ${quest.visited}/${quest.stops.length} stops on the spot`)}</Text>
    {quest.steps.map((st, i) => <Pressable key={i} onPress={() => open(st.kind, st.slug)} style={s.step} accessibilityRole="button" accessibilityLabel={`${st.label}${st.done ? t(', tamamlandı', ', done') : ''}`}>
      <Ionicons name={st.done ? 'checkmark-circle' : st.kind === 'quiz' ? 'help-circle-outline' : 'book-outline'} size={18} color={st.done ? colors.emeraldLight : colors.goldText} />
      <Text style={[s.stepText, st.done && { color: colors.soft, textDecorationLine: 'line-through' }]}>{st.label}</Text>
    </Pressable>)}
    {quest.complete ? <Text style={s.complete}>✦ {t('GÖREV TAMAMLANDI', 'QUEST COMPLETE')}</Text>
      : next && <Button kind="plain" icon="arrow-forward" label={t('Sıradaki adım', 'Next step')} onPress={() => open(next.kind, next.slug)} />}
    <Button icon="walk-outline" label={t('Rotayı yürü', 'Walk the route')} onPress={() => router.push(`/rota/${quest.route.id}`)} />
  </View>;
}

const s = StyleSheet.create({
  quiz: { padding: space.l, borderRadius: 18, backgroundColor: colors.emerald, borderWidth: 1, borderColor: colors.goldLine, gap: space.s },
  quizText: { color: '#e6e2d8', fontSize: 14, lineHeight: 20 },
  card: { padding: space.m, borderRadius: 16, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, gap: space.s },
  stops: { flexDirection: 'row', alignItems: 'center', marginBottom: space.xs },
  stop: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: colors.paper, backgroundColor: colors.parchmentDeep },
  stopCount: { marginLeft: space.s, color: colors.goldText, fontSize: 11, letterSpacing: 1.4, fontWeight: '600' },
  title: { fontFamily: serif, fontSize: 22, color: colors.ink },
  small: { color: colors.soft, fontSize: 13, lineHeight: 19 },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.parchmentDeep, overflow: 'hidden' },
  barFill: { height: 6, backgroundColor: colors.gold },
  step: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 6 },
  stepText: { flex: 1, color: colors.ink, fontSize: 14 },
  complete: { color: colors.goldText, fontWeight: '700', letterSpacing: 1.4, textAlign: 'center', paddingVertical: space.s },
});
