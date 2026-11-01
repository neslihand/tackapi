// Detay Avı (S07): the day's close-up. A wrong guess crosses out the option in words as well as in colour and opens the
// next hint; the end says the answer with its explanation and source. No task today is a calm note with other ways on.
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/Typography';
import { Button, Empty, Eyebrow, Loading, Notice } from '@/components/UI';
import { track } from '@/lib/analytics';
import { apiBase, mediaUrl, sourceTitle } from '@/lib/api';
import { huntDate, huntFinished, huntShareText, type HuntReveal, type HuntToday } from '@/lib/hunt';
import { loadHints, loadHunt, loadReveal, sendGuess } from '@/lib/huntApi';
import { t } from '@/lib/i18n';
import { shareLink } from '@/lib/share';
import { answerable } from '@/lib/quiz';
import { useContent, useFlags, usePassport, useSettings } from '@/lib/store';
import { colors, serif, space } from '@/lib/theme';

export default function DetailHunt() {
  const passport = usePassport();
  const flags = useFlags();
  const { items, quiz } = useContent();
  const { settings } = useSettings();
  const [hunt, setHunt] = useState<HuntToday | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [hints, setHints] = useState<string[]>([]);
  const [reveal, setReveal] = useState<HuntReveal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkShown, setLinkShown] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    loadHunt().then(h => { if (live) setHunt(h); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [retry, settings.server]);

  const day = hunt?.available ? hunt.day : null;
  const state = day ? passport.progress.hunt[day] : undefined;
  const finished = hunt?.available ? huntFinished(state, hunt.max_attempts) : false;
  const wrong = state?.wrong ?? [];
  const attempts = state?.attempts ?? 0;
  const id = hunt?.available ? hunt.id : null;
  // the game goes on where it stopped, on this device or another: the hints opened so far, and the answer only at the end
  useEffect(() => {
    if (id === null || finished || !attempts) return;
    let live = true;
    loadHints(id, attempts).then(h => { if (live) setHints(h); }, () => {});
    return () => { live = false; };
  }, [id, finished, attempts]);
  const noted = state?.work;
  const answerWork = reveal?.monument.slug;
  const { noteHuntWork: noteWork } = passport;
  useEffect(() => { if (day && answerWork && noted !== answerWork) noteWork(day, answerWork); }, [day, answerWork, noted, noteWork]);
  useEffect(() => {
    if (id !== null && finished && !reveal) loadReveal(id).then(setReveal, () => setError(t('Sonuç alınamadı. Bağlantını kontrol et.', 'The result could not be fetched. Check your connection.')));
  }, [id, finished, reveal]);

  if (failed) return <Empty title={t('Detay Avı açılamadı.', 'The Detail Hunt could not be opened.')} body={t('Tahminler sunucuda kontrol edildiği için bağlantı gerekiyor.', 'Guesses are checked on the server, so it needs a connection.')}
    action={<Button icon="refresh" label={t('Yeniden dene', 'Try again')} onPress={() => { setFailed(false); setRetry(n => n + 1); }} />} />;
  if (!hunt) return <Loading />;
  if (!hunt.available) return <Empty title={t('Bugünün Detay Avı henüz hazır değil.', 'Today’s Detail Hunt is not ready yet.')}
    body={t('Her görevi bir editör seçip kaynağıyla onaylıyor. O zamana kadar başka bir kapı açabilirsin.', 'An editor chooses each task and approves it with its source. Until then you can open another door.')}
    action={<View style={{ gap: space.s, alignSelf: 'stretch' }}>
      <Button icon="compass-outline" label={t('Bir eser keşfet', 'Discover a work')} onPress={() => router.navigate('/')} />
      <Button kind="plain" icon="sync-outline" label={t('Hatırla kartlarına bak', 'See the Remember cards')} onPress={() => router.push('/hatirla')} />
    </View>} />;

  const { question, options, image, max_attempts: limit } = hunt;
  const left = limit - attempts;

  async function guess(choice: number) {
    if (busy || finished || !hunt?.available) return;
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
    if (!hunt?.available || !state) return;
    const url = apiBase();
    setLinkShown(null);
    const text = huntShareText(hunt.day, state.attempts, state.solved, limit);
    const shown = await shareLink(text, url).catch(() => url);
    setLinkShown(shown ? text : null);
    track('share_initiated', undefined, { content_type: 'daily_hunt', challenge_id: hunt.id });
  }

  return <ScrollView contentContainerStyle={{ padding: space.m, gap: space.m, paddingBottom: space.xl }}>
    <Eyebrow>✦ {t('DETAY AVI', 'DETAIL HUNT')} · {huntDate(hunt.day).toLocaleUpperCase(t('tr-TR', 'en-GB'))}</Eyebrow>
    <Image source={mediaUrl(image.src)} style={[s.photo, image.width && image.height ? { aspectRatio: image.width / image.height } : null]} contentFit="cover" transition={200}
      accessibilityLabel={reveal?.image_alt ?? t('Bugünün yakın çekim görseli. Açıklaması cevabı söyleyeceği için oyun bitince okunur.', 'Today’s close-up. Its description would give the answer, so it is read when the game ends.')} />
    <Text style={s.question} accessibilityRole="header">{question}</Text>
    <View style={{ gap: space.s }}>
      {options.map((option, i) => {
        const look = reveal ? (i === reveal.answer ? 'right' : wrong.includes(i) ? 'wrong' : 'other') : wrong.includes(i) ? 'wrong' : 'open';
        const after = look === 'right' ? t(', doğru cevap', ', the right answer') : look === 'wrong' ? t(', yanlış', ', wrong') : '';
        return <Pressable key={option} onPress={() => guess(i)} disabled={busy || finished || look === 'wrong'} accessibilityRole="button" accessibilityState={{ disabled: busy || finished || look === 'wrong' }}
          accessibilityLabel={`${option}${after}`} style={[s.option, look === 'right' && s.right, look === 'wrong' && s.wrong, look === 'other' && { opacity: .55 }]}>
          <Text style={[s.optionText, look === 'right' && { color: colors.goldSoft }, look === 'wrong' && { textDecorationLine: 'line-through' }]}>{option}{look === 'wrong' ? t(' (yanlış)', ' (wrong)') : look === 'right' ? t(' (doğru)', ' (right)') : ''}</Text>
        </Pressable>;
      })}
    </View>
    {!finished && <Text style={s.small} accessibilityLiveRegion="polite">{t(`${left} deneme hakkın var.`, `${left} ${left === 1 ? 'try' : 'tries'} left.`)}</Text>}
    {hints.map((hint, i) => <Notice key={i} icon="bulb-outline">{t(`İpucu ${i + 1}`, `Hint ${i + 1}`)}: {hint}</Notice>)}
    {error && <Notice tone="warn" icon="alert-circle-outline">{error}</Notice>}
    {finished && <View style={s.end} accessibilityLiveRegion="polite">
      <Text style={s.endHead}>{state?.solved ? t(`${attempts}. denemede buldun.`, `You found it on try ${attempts}.`) : t('Bu kez olmadı.', 'Not this time.')}</Text>
      {reveal && <>
        <Text style={s.body}>{t('Cevap', 'Answer')}: {reveal.answer_text}</Text>
        <Text style={s.body}>{reveal.explanation}</Text>
        <Text style={s.small}>{reveal.monument.name} · {t('Kaynak', 'Source')}: {sourceTitle(reveal.source)}</Text>
        <Button icon="arrow-forward" label={t('Eseri aç', 'Open the work')} onPress={() => router.push(`/eser/${reveal.monument.slug}`)} />
        {flags.spaced_repetition && !passport.progress.discovered[reveal.monument.slug] && answerable(quiz, items).has(reveal.monument.slug) && <Text style={s.small}>{t('Bu eserden bir soru Hatırla kartlarına eklendi.', 'A question from this work was added to your Remember cards.')}</Text>}
      </>}
      <Button kind="plain" icon="share-social-outline" label={t('Sonucu paylaş (cevabı söylemez)', 'Share the result (keeps the answer)')} onPress={share} />
      {linkShown && <Notice icon="share-social-outline"><Text selectable>{linkShown}</Text></Notice>}
    </View>}
  </ScrollView>;
}

const s = StyleSheet.create({
  photo: { width: '100%', aspectRatio: 4 / 3, maxHeight: 360, borderRadius: 14, backgroundColor: colors.parchmentDeep },
  question: { fontFamily: serif, fontSize: 24, lineHeight: 30, color: colors.ink },
  option: { minHeight: 52, justifyContent: 'center', padding: 14, borderRadius: 14, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.goldLine },
  optionText: { color: colors.ink, fontSize: 16 },
  right: { backgroundColor: colors.emerald, borderColor: colors.emerald },
  wrong: { borderColor: colors.line, opacity: .7 },
  small: { color: colors.soft, fontSize: 13, lineHeight: 19 },
  end: { padding: space.m, borderRadius: 14, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.gold, gap: space.s },
  endHead: { fontFamily: serif, fontSize: 22, color: colors.ink },
  body: { color: colors.ink, fontSize: 15, lineHeight: 22 },
});
