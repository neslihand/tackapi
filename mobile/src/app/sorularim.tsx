// Sorularım: questions the visitor chose to follow when the sources had no answer. An editor's answer arrives here with its
// source. It is not a chat: the answer was written by a person, and a question can also come back as "not found".
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/Typography';
import { Button, Empty, Eyebrow, Loading, Notice, Title } from '@/components/UI';
import { useAccount } from '@/lib/account';
import { track } from '@/lib/analytics';
import { t } from '@/lib/i18n';
import { statusLabel, type Ticket } from '@/lib/questionRules';
import { questionsApi } from '@/lib/questions';
import { colors, serif, space } from '@/lib/theme';

export default function MyQuestions() {
  const account = useAccount();
  const who = account.user?.id ?? null;
  const [list, setList] = useState<Ticket[] | null>(null);
  const [fresh, setFresh] = useState<number[]>([]);    // closed since the last look: they stay marked during this visit
  const [error, setError] = useState<string | null>(null);
  // another account must not see these, not even for a moment
  const [shownFor, setShownFor] = useState(who);
  if (who !== shownFor) { setShownFor(who); setList(null); setFresh([]); setError(null); }
  const load = useCallback(() => {
    setError(null);
    questionsApi.mine().then(rows => {
      setList(rows);
      const unread = rows.filter(q => q.unread);
      if (unread.length) setFresh(old => [...new Set([...old, ...unread.map(q => q.id)])]);
      for (const q of unread) questionsApi.seen(q.id).then(r => {
        if (r.first) track('question_answered', q.monument, { ticket_id: q.id, status: q.status, time_to_answer_hours: r.hours }, `question_answered:${q.id}:${q.answered_at}`);
      }, () => {});
    }, e => setError(String(e?.message ?? e)));
  }, []);
  useFocusEffect(useCallback(() => { if (who !== null) load(); }, [who, load]));

  if (who === null) return <Empty title={t('Sorularını görmek için giriş yap.', 'Sign in to see your questions.')} body={t('Takip ettiğin sorular hesabına bağlıdır; böylece cevap hangi cihazda olursan ol sana gelir.', 'The questions you follow belong to your account, so the answer reaches you on any device.')}
    action={<Button icon="person-circle-outline" label={t('Giriş yap', 'Sign in')} onPress={() => router.push(`/giris?sonra=${encodeURIComponent('/sorularim')}`)} />} />;
  if (error && !list) return <Empty title={t('Soruların açılamadı.', 'Your questions could not be opened.')} body={error} action={<Button label={t('Yeniden dene', 'Try again')} onPress={load} />} />;
  if (!list) return <Loading />;
  if (!list.length) return <Empty title={t('Takip ettiğin soru yok.', 'You are not following any questions.')} body={t('Esere Sor kaynakta cevap bulamazsa soruyu buradan takip edebilirsin.', 'When Ask the Work finds nothing in the sources, you can follow the question here.')} />;
  return <ScrollView contentContainerStyle={{ padding: space.m, gap: space.m, paddingBottom: space.xl }}>
    <Eyebrow>✦ {t('SORULARIM', 'MY QUESTIONS')}</Eyebrow>
    <Title size={28}>{t('Kaynağıyla gelen cevaplar', 'Answers that come with a source')}</Title>
    <Text style={s.small}>{t('Bu cevapları editörler yazar, yalnızca takip edenler görür. Yanıt garantisi yoktur: kaynakta bulunmayan bir şey için “bulunamadı” denir.', 'These answers are written by editors and seen only by those following. An answer is not guaranteed: what is not in the sources is reported as not found.')}</Text>
    {error && <Notice tone="warn" icon="cloud-offline-outline">{error}</Notice>}
    {list.map(q => <QuestionCard key={q.id} q={q} fresh={fresh.includes(q.id)} onRemoved={() => setList(rows => rows && rows.filter(x => x.id !== q.id))} />)}
  </ScrollView>;
}

function QuestionCard({ q, fresh, onRemoved }: { q: Ticket; fresh: boolean; onRemoved: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const remove = () => questionsApi.remove(q.id).then(onRemoved, e => setProblem(String(e?.message ?? e)));
  return <View style={[s.card, fresh && { borderColor: colors.gold }]}>
    <Text style={s.status} accessibilityLiveRegion={fresh ? 'polite' : undefined}>{fresh ? `${t('YENİ', 'NEW')} · ` : ''}{statusLabel(q.status)}</Text>
    <Text style={s.question} accessibilityRole="header">{q.question}</Text>
    <Text style={s.small}>{q.monument_name}</Text>
    {!!q.answer && <View style={{ gap: space.xs }}><Text style={s.answer}>{q.answer}</Text>{!!q.answer_source && <Text style={s.small}>{t('Kaynak', 'Source')}: {q.answer_source}</Text>}</View>}
    {!!q.note && <Text style={s.answer}>{q.note}</Text>}
    {problem && <Notice tone="warn" icon="alert-circle-outline">{problem}</Notice>}
    <View style={s.row}>
      <Button style={{ flex: 1 }} kind="plain" icon="arrow-forward" label={t('Eseri aç', 'Open the work')} onPress={() => router.push(`/eser/${q.monument}`)} />
      {confirm ? <Button style={{ flex: 1 }} kind="plain" icon="trash-outline" label={t('Evet, bırak', 'Yes, stop')} onPress={remove} />
        : <Button style={{ flex: 1 }} kind="plain" icon="close" label={t('Takibi bırak', 'Stop following')} onPress={() => setConfirm(true)} />}
    </View>
  </View>;
}

const s = StyleSheet.create({
  card: { padding: space.m, gap: space.s, borderRadius: 14, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  status: { color: colors.goldText, fontSize: 11, letterSpacing: 1, fontWeight: '700' },
  question: { fontFamily: serif, fontSize: 21, lineHeight: 26, color: colors.ink },
  answer: { color: colors.ink, fontSize: 15, lineHeight: 23 },
  small: { color: colors.soft, fontSize: 13, lineHeight: 19 },
  row: { flexDirection: 'row', gap: space.s },
});
