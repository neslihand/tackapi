// Oyna & Öğren, as on the site: the two mini games, the quiz, the knowledge cards, what was played in this visit and the
// discovery routes as quests, each with its steps and a way to walk it. The phone adds Detay Avı and Hatırla on top.
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/Typography';
import { DetectivePreview, PuzzlePreview } from '@/components/Games';
import { Button, Choice, Empty, Eyebrow, Title, type IconName } from '@/components/UI';
import { mediaUrl } from '@/lib/api';
import { huntFinished } from '@/lib/hunt';
import { useHuntToday } from '@/lib/huntApi';
import { t } from '@/lib/i18n';
import { usePlaySession } from '@/lib/playSession';
import type { Quest, QuestStep } from '@/lib/quests';
import { routesFirst } from '@/lib/personal';
import { quizPool } from '@/lib/quiz';
import { ROUND_SIZE } from '@/lib/quizRound';
import { dueCards } from '@/lib/recall';
import { durationChip, timeLabel } from '@/lib/routeLabels';
import { durationsOf, planRoute, withDuration } from '@/lib/routePlan';
import { useContent, useFlags, usePassport, useQuests } from '@/lib/store';
import { colors, serif, space } from '@/lib/theme';
import { usePreferences } from '@/lib/usePreferences';

export default function Play() {
  const quests = useQuests();
  const flags = useFlags();
  const { progress } = usePassport();
  const { items, quiz } = useContent();
  const [length, setLength] = useState<number | null>(null);
  const { prefs } = usePreferences();
  const ordered = useMemo(() => routesFirst(quests, (q, city) => q.stops.some(st => st.city.slug === city), prefs), [quests, prefs]);
  const routes = useMemo(() => ordered.map(q => q.route), [ordered]);
  const lengths = durationsOf(routes);
  const chosen = length !== null && lengths.includes(length) ? length : null;
  const shownRoutes = withDuration(routes, chosen);
  const due = useMemo(() => dueCards(quizPool(quiz, items), progress).length, [quiz, items, progress]);
  const pictured = items.filter(i => i.image);
  const solved = { puzzle: Object.keys(progress.games.puzzle).length, detective: Object.keys(progress.games.detective).length };
  return <ScrollView contentContainerStyle={{ padding: space.m, gap: space.m, paddingBottom: space.xl }}>
    <View style={s.hero}>
      <Eyebrow light>N° 03  ───  {t('OYNA & ÖĞREN', 'PLAY & LEARN')}</Eyebrow>
      <Title light size={34}>{t('Tarihi sadece keşfetme.', 'Do not just discover history.')}</Title>
      <Text style={s.heroItalic}>{t('Onunla oyna.', 'Play with it.')}</Text>
      <Text style={s.quizText}>{t('Parçaları birleştir, ipuçlarını takip et, bir soruyla yeni bir kapı aç.', 'Put the pieces together, follow the clues, open a new door with a question.')}</Text>
    </View>
    {flags.daily_hunt && <HuntEntry />}
    {flags.spaced_repetition && <View style={[s.card, { borderColor: due ? colors.gold : colors.line }]}>
      <Eyebrow>✦ {t('HATIRLA', 'REMEMBER')}</Eyebrow>
      <Text style={s.title} accessibilityRole="header">{due ? t(`Bugün ${due} kartın var`, `${due} ${due === 1 ? 'card' : 'cards'} for today`) : t('Bugün tekrar kartın yok', 'No cards to review today')}</Text>
      <Text style={s.small}>{t('Keşfettiğin eserlerden kısa sorular: 1, 3, 7 ve 21 gün sonra.', 'Short questions from the works you discovered: after 1, 3, 7 and 21 days.')}</Text>
      {due > 0 && <Button icon="sync-outline" label={t('Kartları aç', 'Open the cards')} onPress={() => router.push('/hatirla')} />}
    </View>}

    {flags.mini_games && <>
      <Eyebrow>{t('MİNİ OYUNLAR', 'MINI GAMES')}</Eyebrow>
      <Text style={s.small}>{t('İkisinin de üç seviyesi var, kendi hızında oynanır. Sonuçlar madalyonlarına sayılır; pasaport mührü yalnızca hikâye keşfinden gelir.', 'Both have three levels and are played at your own pace. Results count towards your medallions; a passport stamp comes only from discovering a story.')}</Text>
      <GameCard number="01" kind={t('GÖRSEL YAPBOZ', 'PICTURE PUZZLE')} title={t('Kayıp Parçalar', 'The Lost Pieces')}
        body={t('Tarihin birbirinden ayrılan parçalarını buluştur. Motifi tamamla, ardındaki hikâyeyi keşfet.', 'Bring history’s scattered pieces back together. Complete the motif and discover the story behind it.')}
        meta={t('3 seviye · 3×3’ten 5×5’e', '3 levels · from 3×3 to 5×5')} solved={solved.puzzle} icon="extension-puzzle-outline" cta={t('Oyunu dene', 'Try the game')} onPress={() => router.push('/yapboz')}
        picture={<PuzzlePreview uri={mediaUrl(pictured[0]?.image?.src)} />} />
      <GameCard number="02" kind={t('İPUCU DEDEKTİFLİĞİ', 'CLUE DETECTIVE')} title={t('Miras Dedektifi', 'Heritage Detective')}
        body={t('Gizemli bir eserin kimliğini ortaya çıkar. Her yeni ipucunu incele, tahminini yap.', 'Uncover the identity of a mysterious work. Study each new clue and make your guess.')}
        meta={t('3 seviye · eser kaydından ipuçları', '3 levels · clues from the work’s record')} solved={solved.detective} icon="search-outline" cta={t('Dosyayı aç', 'Open the file')} onPress={() => router.push('/dedektif')}
        picture={<DetectivePreview uri={mediaUrl(pictured[pictured.length - 1]?.image?.src)} />} />
    </>}

    <View style={s.quiz}>
      <Eyebrow light>✦ {t('TARİHİN İZİNDE', 'ON THE TRAIL OF HISTORY')}</Eyebrow>
      <Title light size={26}>{t('Bilgi Yarışması', 'Knowledge Quiz')}</Title>
      <Text style={s.quizText}>{t(`${ROUND_SIZE} soru, her doğru cevap ${100 / ROUND_SIZE} puan. Yanlış şıklar da başka eserlerin gerçek bilgileridir.`, `${ROUND_SIZE} questions, ${100 / ROUND_SIZE} points for each right answer. The wrong options are real facts about other works too.`)}</Text>
      {progress.quiz.completed > 0 && <Text style={s.quizText}>{t(`${progress.quiz.completed} tur · en iyi puanın ${progress.quiz.best} / 100`, `${progress.quiz.completed} rounds · best score ${progress.quiz.best} / 100`)}</Text>}
      <Button kind="gold" icon="play" label={t('Yarışmaya başla', 'Start the quiz')} onPress={() => router.push('/quiz')} />
    </View>

    {flags.mini_games && <>
      <View style={s.card}>
        <Eyebrow>✦ {t('BİLGİ KARTLARI', 'KNOWLEDGE CARDS')}</Eyebrow>
        <Text style={s.title} accessibilityRole="header">{t('Bir kart, bir hikâye.', 'One card, one story.')}</Text>
        <Text style={s.small}>{t('Kartın arkasını çevir, eserin kısa hikâyesini oku; sonra hikâyenin tamamına ya da haritadaki yerine geç.', 'Turn the card over and read the work’s short story; then go to the whole story or its place on the map.')}</Text>
        <Button icon="albums-outline" label={t('Kartları aç', 'Open the cards')} onPress={() => router.push('/kartlar')} />
      </View>
      <Session cards={items.map(i => i.slug)} />
    </>}

    <Eyebrow>{t('KEŞİF ROTALARI', 'DISCOVERY ROUTES')}</Eyebrow>
    {lengths.length > 0 && <View style={{ gap: space.xs }}>
      <Text style={s.small}>{t('Süresini editörün kontrol ettiği rotalar:', 'Routes whose duration an editor checked:')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Choice label={t('Hepsi', 'All')} selected={chosen === null} onPress={() => setLength(null)} />
        {lengths.map(m => <Choice key={m} label={durationChip(m)} selected={chosen === m} onPress={() => setLength(m)} />)}
      </ScrollView>
    </View>}
    {quests.length ? ordered.filter(q => shownRoutes.includes(q.route)).map(q => <QuestCard key={q.route.id} quest={q} />)
      : <Empty title={t('Henüz rota yok.', 'No routes yet.')} body={t('Keşif rotaları eklendiğinde burada görünecek.', 'Discovery routes will appear here once they are added.')} />}
  </ScrollView>;
}

function GameCard({ number, kind, title, body, meta, solved, icon, cta, onPress, picture }: { number: string; kind: string; title: string; body: string; meta: string; solved: number; icon: IconName; cta: string; onPress: () => void; picture: ReactNode }) {
  return <View style={s.card}>
    {picture}
    <Eyebrow>{number} · {kind}</Eyebrow>
    <Text style={s.title} accessibilityRole="header">{title}</Text>
    <Text style={s.small}>{body}</Text>
    <Text style={s.meta}>{meta}{solved ? ` · ${t(`${solved} eser çözüldü`, `${solved} works solved`)}` : ''}</Text>
    <Button kind="gold" icon={icon} label={cta} onPress={onPress} />
  </View>;
}

/** This visit only: it clears when the app closes, and none of it adds a stamp. The site calls it Keşif Defteri; the phone
 *  already has a notebook of that name for what the visitor keeps, so the words here stay "bu oturum". */
function Session({ cards }: { cards: string[] }) {
  const session = usePlaySession();
  const flipped = session.flipped.filter(slug => cards.includes(slug)).length;
  const rows: { id: string; label: string; icon: IconName; done: boolean; note?: string }[] = [
    { id: 'puzzle', label: t('Yapboz', 'Puzzle'), icon: 'extension-puzzle-outline', done: session.puzzle },
    { id: 'detective', label: t('Dedektif', 'Detective'), icon: 'search-outline', done: session.detective },
    { id: 'quiz', label: t('Yarışma', 'Quiz'), icon: 'help-circle-outline', done: session.quiz },
    { id: 'cards', label: t('Kartlar', 'Cards'), icon: 'albums-outline', done: cards.length > 0 && flipped >= cards.length, note: `${flipped} / ${cards.length}` },
  ];
  const done = rows.filter(r => r.done).length;
  return <View style={s.card}>
    <Eyebrow>✦ {t('BU OTURUM', 'THIS VISIT')}</Eyebrow>
    <Text style={s.title} accessibilityRole="header">{t(`${rows.length} etkinliğin ${done} tanesi tamam`, `${done} of ${rows.length} activities done`)}</Text>
    <View style={s.activities}>{rows.map(r => <View key={r.id} style={s.activity} accessible accessibilityLabel={`${r.label}: ${r.done ? t('tamamlandı', 'done') : t('henüz tamamlanmadı', 'not done yet')}${r.note ? `, ${r.note}` : ''}`}>
      <Ionicons name={r.done ? 'checkmark-circle' : r.icon} size={26} color={r.done ? colors.emeraldLight : colors.goldLine} />
      <Text style={s.activityText}>{r.label}</Text>
      {!!r.note && <Text style={s.note}>{r.note}</Text>}
    </View>)}</View>
    <Text style={s.small}>{t('Yalnızca bu oturumu gösterir, uygulama kapanınca sıfırlanır. Oyun ve yarışma sonuçların madalyonlar için saklanır, kart ilerlemen saklanmaz. Hiçbiri pasaportuna mühür eklemez.', 'This shows only this visit and resets when the app closes. Your game and quiz results are kept for the medallions; your card progress is not. None of them adds a stamp to your passport.')}</Text>
  </View>;
}

function QuestCard({ quest }: { quest: Quest }) {
  const next = quest.steps.find(st => !st.done);
  const photos = quest.stops.map(st => mediaUrl(st.image?.thumb)).filter(Boolean).slice(0, 5) as string[];
  const open = (kind: QuestStep['kind'], slug: string) => router.push(kind === 'quiz' ? `/quiz?eser=${encodeURIComponent(slug)}` : kind === 'puzzle' ? `/yapboz?eser=${encodeURIComponent(slug)}` : `/eser/${slug}`);
  return <View style={[s.card, quest.complete && { borderColor: colors.gold }]}>
    <View style={s.stops}>{photos.map((p, i) => <Image key={p} source={p} alt="" style={[s.stop, { marginLeft: i ? -14 : 0, zIndex: 10 - i }]} contentFit="cover" accessibilityIgnoresInvertColors />)}
      <Text style={s.stopCount}>{t(`${quest.stops.length} DURAK`, `${quest.stops.length} STOPS`)}</Text></View>
    <Eyebrow>{quest.route.kicker}</Eyebrow>
    <Text style={s.title} accessibilityRole="header">{quest.route.title}</Text>
    <Text style={s.small}>{quest.route.description}</Text>
    <Text style={s.small}>{timeLabel(quest.route.minutes, planRoute(quest.stops))}{quest.route.auto ? ` · ${t('otomatik derlendi, editör kontrolünden geçmedi', 'compiled automatically, not checked by an editor')}` : ''}</Text>
    <View style={s.bar} accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: quest.steps.length, now: quest.done }} accessibilityLabel={t(`${quest.steps.length} adımın ${quest.done} tanesi tamam`, `${quest.done} of ${quest.steps.length} steps done`)}>
      <View style={[s.barFill, { width: `${(quest.done / quest.steps.length) * 100}%` }]} /></View>
    <Text style={s.small}>{t(`${quest.done}/${quest.steps.length} adım · ${quest.visited}/${quest.stops.length} durak yerinde`, `${quest.done}/${quest.steps.length} steps · ${quest.visited}/${quest.stops.length} stops on the spot`)}</Text>
    {quest.steps.map((st, i) => <Pressable key={i} onPress={() => open(st.kind, st.slug)} style={s.step} accessibilityRole="button" accessibilityLabel={`${st.label}${st.done ? t(', tamamlandı', ', done') : ''}`}>
      <Ionicons name={st.done ? 'checkmark-circle' : st.kind === 'quiz' ? 'help-circle-outline' : st.kind === 'puzzle' ? 'extension-puzzle-outline' : 'book-outline'} size={18} color={st.done ? colors.emeraldLight : colors.goldText} />
      <Text style={[s.stepText, st.done && { color: colors.soft, textDecorationLine: 'line-through' }]}>{st.label}</Text>
    </Pressable>)}
    {quest.complete ? <Text style={s.complete}>✦ {t('GÖREV TAMAMLANDI', 'QUEST COMPLETE')}</Text>
      : next && <Button kind="plain" icon="arrow-forward" label={t('Sıradaki adım', 'Next step')} onPress={() => open(next.kind, next.slug)} />}
    <Button icon="walk-outline" label={t('Rotayı yürü', 'Walk the route')} onPress={() => router.push(`/rota/${quest.route.id}`)} />
  </View>;
}

/** Only says what is true today: no task means no entry, an open task says it can be played. */
function HuntEntry() {
  const hunt = useHuntToday();
  const { progress } = usePassport();
  if (!hunt) return null;
  const done = huntFinished(progress.hunt[hunt.day], hunt.max_attempts);
  return <View style={[s.card, { borderColor: done ? colors.line : colors.gold }]}>
    <Eyebrow>✦ {t('DETAY AVI', 'DETAIL HUNT')}</Eyebrow>
    <Text style={s.title} accessibilityRole="header">{done ? t('Bugünkü görevi oynadın', 'You played today’s task') : t('Bugünün yakın çekimi hazır', 'Today’s close-up is ready')}</Text>
    <Button icon={done ? 'eye-outline' : 'search-outline'} label={done ? t('Sonucu gör', 'See the result') : t('Oyna', 'Play')} onPress={() => router.push('/detay-avi')} />
  </View>;
}

const s = StyleSheet.create({
  hero: { padding: space.l, borderRadius: 18, backgroundColor: colors.emerald, borderWidth: 1, borderColor: colors.goldLine, gap: space.xs },
  heroItalic: { fontFamily: serif, fontStyle: 'italic', fontSize: 34, lineHeight: 38, color: colors.gold },
  meta: { color: colors.goldText, fontSize: 12, fontWeight: '600' },
  activities: { flexDirection: 'row', gap: space.s },
  activity: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: space.s, borderRadius: 12, backgroundColor: colors.parchment },
  activityText: { color: colors.ink, fontSize: 12 },
  note: { color: colors.soft, fontSize: 11 },
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
