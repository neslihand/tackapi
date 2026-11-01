// "Tarihin İzinde": a round of five questions. ?eser=<slug> opens the round with a question about that work (a quest
// step). The finished round goes to the passport: its score and the works answered right.
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AnswerOption } from '@/components/Controls';
import { Button, Empty, Eyebrow, Loading } from '@/components/UI';
import { t } from '@/lib/i18n';
import { pickRound, quizPool } from '@/lib/quiz';
import { useContent, usePassport } from '@/lib/store';
import { colors, serif, space } from '@/lib/theme';

export default function Quiz() {
  const { eser } = useLocalSearchParams<{ eser?: string }>();
  const { items, quiz, loading, bySlug } = useContent();
  const passport = usePassport();
  const [round, setRound] = useState(0);
  const questions = useMemo(() => pickRound(quizPool(quiz, items), undefined, round === 0 ? eser : undefined), [quiz, items, eser, round]);
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [right, setRight] = useState<string[]>([]);
  const [finished, setFinished] = useState(false);

  if (loading && !items.length) return <Loading />;
  if (!questions.length) return <Empty title={t('Şimdilik soru yok.', 'No questions for now.')} body={t('Koleksiyonda soru kurulacak kadar bilgi yok.', 'The collection does not have enough information for questions yet.')} />;

  function answer(i: number) {
    if (chosen !== null) return;
    setChosen(i);
    const ok = i === q.answer;
    Haptics.notificationAsync(ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {});
    if (ok) setRight(r => [...r, q.artifactId]);
  }
  function next() {
    if (index + 1 < questions.length) { setIndex(index + 1); setChosen(null); return; }
    // chosen is the last answer; right already holds it
    passport.recordQuiz((right.length / questions.length) * 100, right);
    setFinished(true);
  }
  function again() { setRound(r => r + 1); setIndex(0); setChosen(null); setRight([]); setFinished(false); }

  if (finished) {
    const score = Math.round((right.length / questions.length) * 100);
    const asked = [...new Set(questions.map(x => x.artifactId))].map(bySlug).filter(Boolean);
    return <ScrollView contentContainerStyle={{ padding: space.m, gap: space.m }}>
      <View style={s.result}>
        <Eyebrow light>✦ {t('TUR TAMAMLANDI', 'ROUND COMPLETE')}</Eyebrow>
        <Text style={s.score}>{right.length}/{questions.length}</Text>
        <Text style={s.resultText}>{score === 100 ? t('Kusursuz! Tarihin izini iyi sürüyorsun.', 'Flawless! You follow history’s trail well.') : score >= 60 ? t('Güzel tur. Kaçırdıklarını eserlerin sayfasında bulabilirsin.', 'A good round. You can find what you missed on the works’ pages.') : t('Her yanlış yeni bir kapı: eserlere göz at ve yeniden dene.', 'Every miss is a new door: look at the works and try again.')}</Text>
        <Button kind="gold" icon="refresh" label={t('Yeni tur', 'New round')} onPress={again} />
      </View>
      <Eyebrow>{t('BU TURDAKİ ESERLER', 'WORKS IN THIS ROUND')}</Eyebrow>
      {asked.map(a => <Pressable key={a!.slug} onPress={() => router.push(`/eser/${a!.slug}`)} style={s.work} accessibilityRole="button">
        <Ionicons name={right.includes(a!.slug) ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={right.includes(a!.slug) ? colors.emeraldLight : colors.goldLine} />
        <Text style={s.workText}>{a!.name}</Text><Ionicons name="chevron-forward" size={18} color={colors.goldLine} />
      </Pressable>)}
    </ScrollView>;
  }

  const q = questions[index];
  return <ScrollView contentContainerStyle={{ padding: space.m, gap: space.m }}>
    <View style={s.head}>
      <Eyebrow>{t(`SORU ${index + 1}/${questions.length}`, `QUESTION ${index + 1}/${questions.length}`)}</Eyebrow>
      <View style={s.dots}>{questions.map((_, i) => <View key={i} style={[s.dot, i < index && { backgroundColor: colors.goldLine }, i === index && { backgroundColor: colors.gold }]} />)}</View>
    </View>
    <Text style={s.question} accessibilityRole="header">{q.question}</Text>
    <View style={{ gap: space.s }}>
      {q.options.map((o, i) => <AnswerOption key={i} label={o} onPress={() => answer(i)}
        state={chosen === null ? 'open' : i === q.answer ? 'right' : i === chosen ? 'wrong' : 'other'} />)}
    </View>
    {chosen !== null && <View style={s.explain} accessibilityLiveRegion="polite">
      <Text style={s.explainHead}>{chosen === q.answer ? t('Doğru!', 'Right!') : t('Bu sefer olmadı.', 'Not this time.')}</Text>
      <Text style={s.explainText}>{q.explanation}</Text>
      <View style={{ flexDirection: 'row', gap: space.s }}>
        <Button style={{ flex: 1 }} label={index + 1 < questions.length ? t('Sonraki soru', 'Next question') : t('Sonucu gör', 'See the result')} icon="arrow-forward" onPress={next} />
        <Button kind="plain" icon="book-outline" label={t('Eser', 'Work')} onPress={() => router.push(`/eser/${q.artifactId}`)} />
      </View>
    </View>}
  </ScrollView>;
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.parchmentDeep, borderWidth: 1, borderColor: colors.goldLine },
  question: { fontFamily: serif, fontSize: 24, lineHeight: 31, color: colors.ink },
  explain: { padding: space.m, borderRadius: 14, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderLeftWidth: 3, borderLeftColor: colors.gold, gap: space.s },
  explainHead: { fontFamily: serif, fontSize: 19, color: colors.ink },
  explainText: { color: colors.soft, fontSize: 14, lineHeight: 20 },
  result: { padding: space.l, borderRadius: 18, backgroundColor: colors.emerald, borderWidth: 1, borderColor: colors.goldLine, gap: space.s, alignItems: 'center' },
  score: { fontFamily: serif, fontSize: 56, color: colors.gold },
  resultText: { color: '#e6e2d8', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  work: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  workText: { flex: 1, color: colors.ink, fontSize: 15 },
});
