// Detay Avı (S07): the day's close-up. When an editor has chosen and sourced today's task, the server checks every guess,
// a wrong one opens the next hint and the end says the answer with its explanation and source (master plan M07). Without
// a task (or without a connection) the day's automatic puzzle stands in: a close-up from the collection's photos, four
// works to choose from, each wrong guess zooming out.
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { HuntMarks, huntScore, HuntZoom, triesLeft } from '@/components/HuntZoom';
import { ShareSheet, type Shared } from '@/components/ShareSheet';
import { Button, Empty, Eyebrow, Loading, Notice, Title } from '@/components/UI';
import { track } from '@/lib/analytics';
import { apiBase, mediaUrl, sourceTitle, type Item } from '@/lib/api';
import { guessMarks, outcome, scaleFor } from '@/lib/autoHunt';
import { teaser } from '@/lib/daily';
import { huntDate, huntFinished, huntShareText, type HuntReveal, type HuntToday } from '@/lib/hunt';
import { loadHints, loadHunt, loadReveal, sendGuess } from '@/lib/huntApi';
import { useHunt } from '@/lib/hunt-state';
import { t } from '@/lib/i18n';
import { buzz } from '@/lib/motion';
import { answerable } from '@/lib/quiz';
import { shareLink } from '@/lib/share';
import { useContent, useFlags, usePassport, useSettings } from '@/lib/store';
import { colors, hit, radius, serif, space, type } from '@/lib/theme';

export default function DetailHunt() {
  const { settings } = useSettings();
  // null: still asking; 'none': no editor task today, or the server could not be reached
  const [hunt, setHunt] = useState<Extract<HuntToday, { available: true }> | 'none' | null>(null);
  useEffect(() => {
    let live = true;
    loadHunt().then(h => { if (live) setHunt(h.available ? h : 'none'); }, () => { if (live) setHunt('none'); });
    return () => { live = false; };
  }, [settings.server]);
  if (hunt === null) return <Loading />;
  return hunt === 'none' ? <AutoHunt /> : <EditorHunt hunt={hunt} />;
}

/** The editor's task of the day: the server checks every guess and opens a hint after each wrong one. */
function EditorHunt({ hunt }: { hunt: Extract<HuntToday, { available: true }> }) {
  const passport = usePassport();
  const flags = useFlags();
  const { items, quiz } = useContent();
  const [hints, setHints] = useState<string[]>([]);
  const [reveal, setReveal] = useState<HuntReveal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkShown, setLinkShown] = useState<string | null>(null);

  const day = hunt.day;
  const state = passport.progress.hunt[day];
  const finished = huntFinished(state, hunt.max_attempts);
  const wrong = state?.wrong ?? [];
  const attempts = state?.attempts ?? 0;
  const id = hunt.id;
  // the game goes on where it stopped, on this device or another: the hints opened so far, and the answer only at the end
  useEffect(() => {
    if (finished || !attempts) return;
    let live = true;
    loadHints(id, attempts).then(h => { if (live) setHints(h); }, () => {});
    return () => { live = false; };
  }, [id, finished, attempts]);
  const noted = state?.work;
  const answerWork = reveal?.monument.slug;
  const { noteHuntWork: noteWork } = passport;
  useEffect(() => { if (answerWork && noted !== answerWork) noteWork(day, answerWork); }, [day, answerWork, noted, noteWork]);
  useEffect(() => {
    if (finished && !reveal) loadReveal(id).then(setReveal, () => setError(t('Sonuç alınamadı. Bağlantını kontrol et.', 'The result could not be fetched. Check your connection.')));
  }, [id, finished, reveal]);

  const { question, options, image, max_attempts: limit } = hunt;
  const left = limit - attempts;

  async function guess(choice: number) {
    if (busy || finished) return;
    const attempt = attempts + 1;
    setBusy(true); setError(null);
    try {
      const r = await sendGuess(hunt.id, choice, attempt);
      if (attempt === 1) track('daily_hunt_started', undefined, { challenge_id: hunt.id }, `hunt:start:${hunt.id}`);
      passport.recordHunt(hunt.day, attempt, r.correct, r.correct ? null : choice, r.finished);
      if (r.reveal) setReveal(r.reveal);
      if (r.finished) track('daily_hunt_completed', r.reveal?.monument.slug, { challenge_id: hunt.id, attempt_count: attempt, is_correct: r.correct }, `hunt:done:${hunt.id}`);
    } catch (e) { setError(String((e as Error)?.message ?? e)); }
    finally { setBusy(false); }
  }

  async function share() {
    if (!state) return;
    const url = apiBase();
    setLinkShown(null);
    const text = huntShareText(hunt.day, state.attempts, state.solved, limit);
    const shown = await shareLink(text, url).catch(() => url);
    setLinkShown(shown ? text : null);
    track('share_initiated', undefined, { content_type: 'daily_hunt', challenge_id: hunt.id });
  }

  return <ScrollView contentContainerStyle={s.page}>
    <Eyebrow>✦ {t('DETAY AVI', 'DETAIL HUNT')} · {huntDate(hunt.day).toLocaleUpperCase(t('tr-TR', 'en-GB'))}</Eyebrow>
    <Image source={mediaUrl(image.src)} style={[e.photo, image.width && image.height ? { aspectRatio: image.width / image.height } : null]} contentFit="cover" transition={200}
      accessibilityLabel={reveal?.image_alt ?? t('Bugünün yakın çekim görseli. Açıklaması cevabı söyleyeceği için oyun bitince okunur.', 'Today’s close-up. Its description would give the answer, so it is read when the game ends.')} />
    <Text style={e.question} accessibilityRole="header">{question}</Text>
    <View style={{ gap: space.s }}>
      {options.map((option, i) => {
        const look = reveal ? (i === reveal.answer ? 'right' : wrong.includes(i) ? 'wrong' : 'other') : wrong.includes(i) ? 'wrong' : 'open';
        const after = look === 'right' ? t(', doğru cevap', ', the right answer') : look === 'wrong' ? t(', yanlış', ', wrong') : '';
        return <Pressable key={option} onPress={() => guess(i)} disabled={busy || finished || look === 'wrong'} accessibilityRole="button" accessibilityState={{ disabled: busy || finished || look === 'wrong' }}
          accessibilityLabel={`${option}${after}`} style={[e.option, look === 'right' && e.right, look === 'wrong' && e.wrong, look === 'other' && { opacity: .55 }]}>
          <Text style={[e.optionText, look === 'right' && { color: colors.goldSoft }, look === 'wrong' && { textDecorationLine: 'line-through' }]}>{option}{look === 'wrong' ? t(' (yanlış)', ' (wrong)') : look === 'right' ? t(' (doğru)', ' (right)') : ''}</Text>
        </Pressable>;
      })}
    </View>
    {!finished && <Text style={e.small} accessibilityLiveRegion="polite">{t(`${left} deneme hakkın var.`, `${left} ${left === 1 ? 'try' : 'tries'} left.`)}</Text>}
    {hints.map((hint, i) => <Notice key={i} icon="bulb-outline">{t(`İpucu ${i + 1}`, `Hint ${i + 1}`)}: {hint}</Notice>)}
    {error && <Notice tone="warn" icon="alert-circle-outline">{error}</Notice>}
    {finished && <View style={e.end} accessibilityLiveRegion="polite">
      <Text style={e.endHead}>{state?.solved ? t(`${attempts}. denemede buldun.`, `You found it on try ${attempts}.`) : t('Bu kez olmadı.', 'Not this time.')}</Text>
      {reveal && <>
        <Text style={e.body}>{t('Cevap', 'Answer')}: {reveal.answer_text}</Text>
        <Text style={e.body}>{reveal.explanation}</Text>
        <Text style={e.small}>{reveal.monument.name} · {t('Kaynak', 'Source')}: {sourceTitle(reveal.source)}</Text>
        <Button icon="arrow-forward" label={t('Eseri aç', 'Open the work')} onPress={() => router.push(`/eser/${reveal.monument.slug}`)} />
        {flags.spaced_repetition && !passport.progress.discovered[reveal.monument.slug] && answerable(quiz, items).has(reveal.monument.slug) && <Text style={e.small}>{t('Bu eserden bir soru Hatırla kartlarına eklendi.', 'A question from this work was added to your Remember cards.')}</Text>}
      </>}
      <Button kind="plain" icon="share-social-outline" label={t('Sonucu paylaş (cevabı söylemez)', 'Share the result (keeps the answer)')} onPress={share} />
      {linkShown && <Notice icon="share-social-outline"><Text selectable>{linkShown}</Text></Notice>}
    </View>}
  </ScrollView>;
}

/** No editor task today (or no connection): the automatic close-up from the collection's photos. */
function AutoHunt() {
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
      <Title>{!o.over ? t('Bu ayrıntı hangi esere ait?', 'Which work is this detail from?')
        : o.solved ? t('Buldun!', 'You found it!') : t('Bu sefer olmadı', 'Not this time')}</Title>
    </View>

    {broken ? <Card padded={false}><Empty title={t('Bugünün fotoğrafı açılamadı.', 'Today’s photo could not open.')}
      body={t('Fotoğraf daha önce yüklenmediyse bağlantı gerekir. Bağlanınca yeniden dene.', 'If the photo was not loaded before, it needs a connection. Try again once you are online.')}
      action={<Button icon="refresh" label={t('Yeniden dene', 'Try again')} onPress={retry} />} /></Card>
      : <HuntZoom key={round} src={photo} focus={puzzle.focus} scale={scaleFor(puzzle)} onError={() => setBroken(true)} style={s.zoom}
        label={o.over ? t(`${answer.name} fotoğrafı`, `Photo of ${answer.name}`) : undefined} />}

    <View style={s.tries}>
      <HuntMarks marks={marks} label={o.over ? score : triesLeft(o.left)} />
      <Text style={s.triesText}>{o.over ? score : triesLeft(o.left)}</Text>
    </View>

    {o.over && <Card style={s.result}>
      <Eyebrow>{t('CEVAP', 'THE ANSWER')}</Eyebrow>
      <Text style={s.answer} accessibilityRole="header">{answer.name}</Text>
      <Text style={s.meta}>{[answer.kind_label, answer.city.name, answer.built.label].filter(Boolean).join(' · ')}</Text>
      <Text style={s.teaser}>{teaser(answer)}</Text>
      <View style={s.actions}>
        <Button kind="gold" icon="book-outline" label={t('Eseri aç', 'Open the work')} onPress={() => router.push(`/eser/${answer.slug}`)} />
        <Button kind="plain" icon="share-social-outline" label={t('Paylaş', 'Share')}
          onPress={() => setShared({ kind: 'hunt', number, marks, solved: o.solved, photo: answer.image?.reusable ? photo : null, focus: puzzle.focus })} />
      </View>
    </Card>}

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

// the editor task keeps its own look: the question is a sentence, not a choice of works
const e = StyleSheet.create({
  photo: { width: '100%', aspectRatio: 4 / 3, maxHeight: 360, borderRadius: radius.l, backgroundColor: colors.parchmentDeep },
  question: { fontFamily: serif, color: colors.ink, ...type.title },
  option: { minHeight: hit + space.s, justifyContent: 'center', padding: 14, borderRadius: radius.m, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.goldLine },
  optionText: { color: colors.ink, ...type.body },
  right: { backgroundColor: colors.emerald, borderColor: colors.emerald },
  wrong: { borderColor: colors.line, opacity: .7 },
  small: { color: colors.soft, ...type.caption },
  end: { padding: space.m, borderRadius: radius.m, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.gold, gap: space.s },
  endHead: { fontFamily: serif, color: colors.ink, ...type.heading },
  body: { color: colors.ink, ...type.body },
});

const s = StyleSheet.create({
  page: { padding: space.m, gap: space.m, paddingBottom: space.xl },
  zoom: { borderRadius: radius.l, borderWidth: 1, borderColor: colors.goldLine },
  tries: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  triesText: { color: colors.soft, ...type.body },
  result: { gap: space.s, borderColor: colors.gold },
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
