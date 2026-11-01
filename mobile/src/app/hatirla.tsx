// Hatırla: today's review cards, one at a time. A work card asks a quiz.ts question built from the work's own record
// (multiple choice); a term card shows the glossary definition and asks whether it was remembered. A summary ends it.
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { AnswerOption, ProgressBar } from '@/components/Controls';
import { Button, Empty, Eyebrow, Loading, Notice, Title } from '@/components/UI';
import { mediaUrl } from '@/lib/api';
import { t, useLang } from '@/lib/i18n';
import { capitalize, type GlossaryTerm } from '@/lib/reading';
import { daysUntil, nextDue, parseCardId, questionFor, type Candidate } from '@/lib/recall';
import { useRecall } from '@/lib/recall-state';
import { useContent } from '@/lib/store';
import { colors, hit, radius, serif, space, type } from '@/lib/theme';

type Result = { card: Candidate; correct: boolean; due: string | null };

const when = (days: number) => (days <= 0 ? t('bugün', 'today') : days === 1 ? t('yarın', 'tomorrow') : t(`${days} gün sonra`, `in ${days} days`));
const fieldLabel = (field: string) => ({ city: t('ŞEHİR', 'CITY'), architect: t('MİMAR / USTA', 'ARCHITECT / MASTER'), century: t('YÜZYIL', 'CENTURY'), period: t('DÖNEM', 'ERA') })[field] ?? '';
const goHome = () => (router.canGoBack() ? router.back() : router.replace('/'));

export default function Recall() {
  const { items, bySlug } = useContent();
  const { lang } = useLang();
  const { ready, session, candidates, state, glossary, termsMissing, answer, finish } = useRecall();
  const [cards, setCards] = useState<Candidate[] | null>(null);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  // a work card: the picked option (-1: "show me"); a term card: whether the definition is shown
  const [chosen, setChosen] = useState<number | null>(null);
  const [shown, setShown] = useState(false);
  const ended = useRef(false);

  // the session is picked once when the screen opens, so answering never reshuffles it
  useEffect(() => {
    if (ready && cards === null)
      setCards(session.filter(c => (c.kind === 'work' ? questionFor(c.id, items, new Date()) : glossary?.some(g => g.slug === c.slug))));
  }, [ready, cards, session, items, glossary]);

  // the session ends at the summary, or on leaving after at least one answer: it counts for the streak once
  const end = useCallback(() => { if (!ended.current) { ended.current = true; finish(); } }, [finish]);
  const leave = useRef(() => {});
  leave.current = () => { if (results.length) end(); };
  useEffect(() => () => leave.current(), []);

  const card = cards?.[index];
  const field = card ? parseCardId(card.id) : null;
  const question = useMemo(() => (card?.kind === 'work' ? questionFor(card.id, items, new Date()) : null), [card, items, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const term: GlossaryTerm | undefined = card?.kind === 'term' ? glossary?.find(g => g.slug === card.slug) : undefined;
  const result = results[index];

  if (!ready || cards === null) return <Loading />;

  if (!cards.length) {
    if (!candidates.length) return <Empty title={t('Henüz hatırlanacak bir şey yok', 'Nothing to recall yet')}
      body={t('Bir eserin hikâyesini okuyup pasaportuna ekle ya da sözlükte bir terim aç; ertesi gün kartı burada olur.', 'Read a work’s story to add it to your passport, or open a term in the glossary; its card is here the next day.')}
      action={<Button icon="compass-outline" label={t('Keşfet’e git', 'Go to Explore')} onPress={() => router.push('/kesfet')} />} />;
    const next = state && nextDue(state, candidates);
    return <Empty title={t('Bugünlük bu kadar', 'That’s all for today')}
      body={next ? t(`Sıradaki kart ${when(daysUntil(next, new Date()))} gelecek.`, `The next card comes ${when(daysUntil(next, new Date()))}.`) : undefined}
      action={<Button icon="home-outline" label={t('Bugün’e dön', 'Back to Today')} onPress={goHome} />} />;
  }

  if (!card) return <Summary results={results} bySlug={slug => bySlug(slug)?.name} termName={slug => capitalize(glossary?.find(g => g.slug === slug)?.term ?? slug)} />;

  const record = (correct: boolean) => {
    const next = answer(card.id, correct);
    setResults(r => [...r, { card, correct, due: next?.cards[card.id]?.due ?? null }]);
  };
  const advance = () => {
    setChosen(null); setShown(false);
    if (index + 1 === cards.length) end();
    setIndex(i => i + 1);
  };
  const item = card.kind === 'work' ? bySlug(card.slug) : undefined;
  const photo = mediaUrl(item?.image?.thumb ?? item?.image?.src);
  const answerText = question ? question.options[question.answer] : '';

  return <ScrollView contentContainerStyle={s.page}>
    <View style={s.head}>
      <Eyebrow>✦ {t(`HATIRLA · ${index + 1}/${cards.length}`, `RECALL · ${index + 1}/${cards.length}`)}</Eyebrow>
      <ProgressBar value={results.length} max={cards.length} accessibilityLabel={t('Cevaplanan kartlar', 'Cards answered')} />
    </View>
    {termsMissing && index === 0 && <Notice icon="cloud-offline-outline">{t('Sözlük bu cihazda yok; terim kartları bağlanınca gelecek.', 'The glossary is not on this device; term cards come back once you are online.')}</Notice>}

    {question && field?.kind === 'work' && <Card style={s.card}>
      <Eyebrow>{t('ESER', 'WORK')} · {fieldLabel(field.field)}</Eyebrow>
      <View style={s.row}>
        {photo && <Image source={photo} alt="" style={s.photo} contentFit="cover" accessibilityIgnoresInvertColors />}
        <Text style={s.question} accessibilityRole="header">{question.question}</Text>
      </View>
      <View style={s.options}>
        {question.options.map((o, i) => <AnswerOption key={o} label={o} onPress={() => { setChosen(i); record(i === question.answer); }}
          state={!result ? 'open' : i === question.answer ? 'right' : i === chosen ? 'wrong' : 'other'} />)}
      </View>
      {!result && <Button kind="plain" icon="eye-outline" label={t('Bilmiyorum, cevabı göster', 'I don’t know, show me')} onPress={() => { setChosen(-1); record(false); }} />}
    </Card>}

    {term && <Card style={s.card}>
      <Eyebrow>{t('TERİM', 'TERM')}{term.category_label ? ` · ${term.category_label.toLocaleUpperCase(lang === 'tr' ? 'tr-TR' : 'en')}` : ''}</Eyebrow>
      <Title size={type.title.fontSize}>{capitalize(term.term)}</Title>
      {!!term.term_en && <Text style={s.en}>{term.term_en}</Text>}
      {!shown ? <Button kind="gold" icon="eye-outline" label={t('Cevabı göster', 'Show the answer')} onPress={() => setShown(true)} /> : <>
        <Text style={s.definition} accessibilityLiveRegion="polite">{term.definition}</Text>
        {term.definition_lang !== lang && <Text style={s.small}>{term.definition_lang === 'tr' ? t('Tanım Türkçe.', 'Definition in Turkish.') : t('Tanım İngilizce.', 'Definition in English.')}</Text>}
        {!result && <View style={s.pair}>
          <Button kind="gold" icon="checkmark" label={t('Biliyordum', 'I knew it')} style={s.half} onPress={() => record(true)} />
          <Button kind="plain" icon="close" label={t('Bilmiyordum', 'I didn’t know')} style={s.half} onPress={() => record(false)} />
        </View>}
      </>}
    </Card>}

    {result && <View style={s.feedback} accessibilityLiveRegion="polite">
      <View style={s.feedbackHead}>
        <Ionicons name={result.correct ? 'checkmark-circle' : 'refresh-circle'} size={24} color={result.correct ? colors.emeraldLight : colors.danger} />
        <Text style={s.feedbackTitle}>{card.kind === 'term' ? (result.correct ? t('Güzel, biliyordun.', 'Nice, you knew it.') : t('Bunu yeniden soracağız.', 'We’ll ask this one again.'))
          : result.correct ? t('Doğru!', 'Right!') : chosen === -1 ? t(`Doğrusu: ${answerText}`, `The answer: ${answerText}`) : t(`Yanlış. Doğrusu: ${answerText}`, `Not quite. The answer: ${answerText}`)}</Text>
      </View>
      {question && <Text style={s.feedbackText}>{question.explanation}</Text>}
      {result.due && <Text style={s.small}>{t(`Bu kartı ${when(daysUntil(result.due, new Date()))} yeniden göreceksin.`, `You’ll see this card again ${when(daysUntil(result.due, new Date()))}.`)}</Text>}
      <View style={s.pair}>
        <Button icon="arrow-forward" label={index + 1 < cards.length ? t('Sonraki kart', 'Next card') : t('Bitir', 'Finish')} style={s.half} onPress={advance} />
        {card.kind === 'work' && <Button kind="plain" icon="book-outline" label={t('Eser', 'Work')} onPress={() => router.push(`/eser/${card.slug}`)} />}
        {card.kind === 'term' && <Button kind="plain" icon="book-outline" label={t('Terim', 'Term')} onPress={() => router.push(`/terim/${card.slug}`)} />}
      </View>
    </View>}
  </ScrollView>;
}

/** The closing card: the counts come from this session's answers. */
function Summary({ results, bySlug, termName }: { results: Result[]; bySlug: (slug: string) => string | undefined; termName: (slug: string) => string }) {
  const right = results.filter(r => r.correct);
  const works = new Set(right.filter(r => r.card.kind === 'work').map(r => r.card.slug)).size;
  const terms = right.filter(r => r.card.kind === 'term').length;
  const again = results.length - right.length;
  const remembered = works || terms
    ? t(`Bugün ${[works && `${works} eseri`, terms && `${terms} terimi`].filter(Boolean).join(' ve ')} hatırladın.`,
      `Today you remembered ${[works && `${works} ${works === 1 ? 'work' : 'works'}`, terms && `${terms} ${terms === 1 ? 'term' : 'terms'}`].filter(Boolean).join(' and ')}.`)
    : t('Bugünkü kartlar zorladı; yarın yeniden deneriz.', 'Today’s cards were tricky; we’ll try again tomorrow.');
  const later = again ? t(`${again} kartı yarın yeniden soracağız.`, `We’ll ask ${again} ${again === 1 ? 'card' : 'cards'} again tomorrow.`)
    : t('Hepsini bildin; kartlar daha uzun aralarla dönecek.', 'You knew them all; the cards will come back after longer breaks.');
  const missed = results.find(r => !r.correct && r.card.kind === 'work');

  return <ScrollView contentContainerStyle={s.page}>
    <Card style={s.card}>
      <Eyebrow>✦ {t('BUGÜNLÜK BİTTİ', 'DONE FOR TODAY')}</Eyebrow>
      <View style={s.score} accessible accessibilityLabel={t(`${results.length} kartın ${right.length} tanesini bildin`, `You got ${right.length} of ${results.length} cards right`)}>
        <Title size={type.display.fontSize}>{right.length}/{results.length}</Title>
        <Text style={s.scoreText}>{t('kartı bildin', results.length === 1 ? 'card right' : 'cards right')}</Text>
      </View>
      <Text style={s.body}>{remembered} {later}</Text>
      <View style={s.list}>
        {results.map(r => <View key={r.card.id} style={s.line} accessible accessibilityLabel={`${r.card.kind === 'work' ? bySlug(r.card.slug) : termName(r.card.slug)}, ${r.correct ? t('bildin', 'right') : t('tekrar edilecek', 'to review')}${r.due ? `, ${when(daysUntil(r.due, new Date()))}` : ''}`}>
          <Ionicons name={r.correct ? 'checkmark-circle' : 'close-circle'} size={20} color={r.correct ? colors.emeraldLight : colors.danger} />
          <Text style={s.lineName} numberOfLines={1}>{r.card.kind === 'work' ? bySlug(r.card.slug) : termName(r.card.slug)}</Text>
          {r.due && <Text style={s.small}>{when(daysUntil(r.due, new Date()))}</Text>}
        </View>)}
      </View>
      <View style={s.pair}>
        <Button icon="home-outline" label={t('Bugün’e dön', 'Back to Today')} style={s.half} onPress={goHome} />
        {missed && <Button kind="plain" icon="book-outline" label={t('Eseri aç', 'Open the work')} style={s.half} onPress={() => router.push(`/eser/${missed.card.slug}`)} />}
      </View>
    </Card>
  </ScrollView>;
}

const s = StyleSheet.create({
  page: { padding: space.m, gap: space.m, paddingBottom: space.xl },
  head: { gap: space.xs },
  card: { gap: space.m },
  row: { flexDirection: 'row', gap: space.m, alignItems: 'center' },
  photo: { width: hit * 2, height: hit * 2, borderRadius: radius.m, backgroundColor: colors.parchmentDeep },
  question: { flex: 1, fontFamily: serif, color: colors.ink, ...type.heading },
  options: { gap: space.s },
  en: { color: colors.soft, fontStyle: 'italic', marginTop: -space.s, ...type.body },
  definition: { fontFamily: serif, color: colors.ink, ...type.reading },
  small: { color: colors.soft, ...type.caption },
  pair: { flexDirection: 'row', gap: space.s, flexWrap: 'wrap' },
  half: { flex: 1, paddingHorizontal: space.s },
  feedback: { padding: space.m, gap: space.s, borderRadius: radius.m, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderLeftWidth: 3, borderLeftColor: colors.gold },
  feedbackHead: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  feedbackTitle: { flex: 1, fontWeight: '700', color: colors.ink, ...type.body },
  feedbackText: { color: colors.soft, ...type.body },
  score: { flexDirection: 'row', alignItems: 'baseline', gap: space.s },
  scoreText: { color: colors.soft, ...type.heading },
  body: { color: colors.ink, ...type.body },
  list: { gap: space.xs },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.s, minHeight: hit - space.s },
  lineName: { flex: 1, color: colors.ink, ...type.body },
});
