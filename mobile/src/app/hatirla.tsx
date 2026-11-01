// Hatırla (S08): the cards due today. Each answer gets its explanation and a way to the work and its source. Having no
// card is a good thing to hear, never a reproach.
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/Typography';
import { Button, Empty, Eyebrow, Loading } from '@/components/UI';
import { track } from '@/lib/analytics';
import { sourceTitle } from '@/lib/api';
import { t } from '@/lib/i18n';
import { dueCards, type RecallAnswer } from '@/lib/recall';
import { quizPool } from '@/lib/quiz';
import { useContent, usePassport } from '@/lib/store';
import { colors, serif, space } from '@/lib/theme';

export default function Recall() {
  const { items, quiz, loading, bySlug } = useContent();
  const passport = usePassport();
  // the round is fixed once the passport and the collection are there (a notification may open this screen first): answering
  // must not reshuffle the card under the visitor's finger
  const [round, setRound] = useState<ReturnType<typeof dueCards> | null>(null);
  if (round === null && passport.ready && (items.length > 0 || !loading)) setRound(dueCards(quizPool(quiz, items), passport.progress));
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<{ result: RecallAnswer; chosen: number | null } | null>(null);
  const current = round?.[index];
  const work = useMemo(() => current && bySlug(current.card.artifactId), [current, bySlug]);

  if (round === null) return <Loading />;
  if (!current) return <Empty title={t('Bugün tekrar kartın yok.', 'No cards to review today.')} body={round.length ? t('Bugünkü kartları bitirdin. Yenileri zamanı gelince burada olacak.', 'You finished today’s cards. New ones will be here when their time comes.')
    : t('Keşfettiğin eserlerin kartları ertesi günden itibaren burada açılır.', 'Cards for the works you discover open here from the next day on.')}
    action={<Button label={t('Yeni bir eser keşfet', 'Discover a new work')} icon="compass-outline" onPress={() => router.navigate('/')} />} />;

  const { card, state } = current;
  function respond(result: RecallAnswer, chosen: number | null) {
    if (answer) return;
    setAnswer({ result, chosen });
    passport.answerCard(card.id, result);
    track('knowledge_recalled', card.artifactId, { card_id: card.id, correct: result === 'right', answer: result, repetition_step: state?.step ?? 0,
      first_attempt_correct: state ? state.first : result === 'right' }, `recall:${card.id}:${state?.last ?? 'ilk'}`);
  }
  const next = () => { setIndex(index + 1); setAnswer(null); };

  return <ScrollView contentContainerStyle={{ padding: space.m, gap: space.m, paddingBottom: space.xl }}>
    <Eyebrow>{t(`KART ${index + 1}/${round.length}`, `CARD ${index + 1}/${round.length}`)}</Eyebrow>
    <Text style={s.question} accessibilityRole="header">{card.question}</Text>
    <View style={{ gap: space.s }} accessibilityRole="radiogroup">
      {card.options.map((option, i) => {
        const look = !answer ? 'open' : i === card.answer ? 'right' : i === answer.chosen ? 'wrong' : 'other';
        return <Pressable key={i} onPress={() => respond(i === card.answer ? 'right' : 'wrong', i)} disabled={!!answer} accessibilityRole="radio" accessibilityState={{ checked: answer?.chosen === i, disabled: !!answer }} aria-checked={answer?.chosen === i}
          accessibilityLabel={`${option}${look === 'right' ? t(', doğru cevap', ', the right answer') : look === 'wrong' ? t(', yanlış', ', wrong') : ''}`}
          style={[s.option, look === 'right' && s.right, look === 'wrong' && s.wrong, look === 'other' && { opacity: 0.55 }]}>
          <Text style={[s.optionText, look === 'right' && { color: colors.goldSoft }]}>{option}</Text>
        </Pressable>;
      })}
    </View>
    {!answer && <Button kind="plain" icon="help-outline" label={t('Hatırlayamadım', 'I can’t remember')} onPress={() => respond('forgot', null)} />}
    {answer && <View style={s.explain} accessibilityLiveRegion="polite">
      <Text style={s.head}>{answer.result === 'right' ? t('Doğru, hatırladın.', 'Right, you remembered.') : answer.result === 'forgot' ? t('Olur böyle, yarın yeniden sorarız.', 'That happens; we will ask again tomorrow.') : t('Bu sefer olmadı, yarın yeniden sorarız.', 'Not this time; we will ask again tomorrow.')}</Text>
      {!!card.explanation && <Text style={s.body}>{card.explanation}</Text>}
      {work && <Text style={s.source}>{t('Kaynak', 'Source')}: {sourceTitle(work.source)}</Text>}
      <View style={{ flexDirection: 'row', gap: space.s }}>
        <Button style={{ flex: 1 }} icon="arrow-forward" label={index + 1 < round.length ? t('Sonraki kart', 'Next card') : t('Bitir', 'Finish')} onPress={next} />
        <Button kind="plain" icon="book-outline" label={t('Eser', 'Work')} onPress={() => router.push(`/eser/${card.artifactId}`)} />
      </View>
    </View>}
  </ScrollView>;
}

const s = StyleSheet.create({
  question: { fontFamily: serif, fontSize: 28, lineHeight: 34, color: colors.ink },
  option: { minHeight: 54, justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 3, borderWidth: 1, borderColor: colors.goldLine, backgroundColor: colors.paper },
  optionText: { color: colors.ink, fontSize: 16 },
  right: { backgroundColor: colors.emerald, borderColor: colors.gold },
  wrong: { borderColor: colors.danger },
  explain: { padding: space.m, gap: space.s, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderLeftWidth: 3, borderLeftColor: colors.gold },
  head: { fontFamily: serif, fontSize: 22, color: colors.ink },
  body: { color: colors.soft, fontSize: 14, lineHeight: 21 },
  source: { color: colors.soft, fontSize: 12, lineHeight: 17 },
});
