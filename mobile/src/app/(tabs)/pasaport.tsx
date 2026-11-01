// Miras Pasaportu, as on the site (frontend/src/pages/Collection.tsx): the gathered stories in numbers, the stamps in a
// book, the medallions with what is next. The phone adds the golden on-the-spot stamps, kept apart from the digital ones
// because only they prove a visit, its own three medallions, the rhythm and the tiers, whose thresholds come from the panel.
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState, type ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/Typography';
import { ShareSheet, type Shared } from '@/components/ShareSheet';
import { Button, Eyebrow, Notice, Title, WorkCard } from '@/components/UI';
import { syncLabel, useAccount } from '@/lib/account';
import type { Item, MedalTiers } from '@/lib/api';
import { t, useLang } from '@/lib/i18n';
import { useJournal } from '@/lib/journal';
import { longestStreak, medals, type Medal } from '@/lib/passport';
import { savePassportFile } from '@/lib/passportFile';
import { dailyRun, rhythmLine, weeklyRun } from '@/lib/rhythm';
import { discoveryProfile } from '@/lib/personal';
import { useQuestionCounts } from '@/lib/questions';
import { useContent, useFlags, usePassport, useSettings } from '@/lib/store';
import { colors, serif, space } from '@/lib/theme';
import { tierTracks, type Metal } from '@/lib/tiers';
import { usePreferences } from '@/lib/usePreferences';

const METAL = { bronze: '#a9773f', silver: '#9a9a96', gold: colors.gold };
const PAGE = 4;
const two = (n: number) => String(n).padStart(2, '0');
const metalName = (m: Metal) => m === 'bronze' ? t('Bronz', 'Bronze') : m === 'silver' ? t('Gümüş', 'Silver') : t('Altın', 'Gold');
type IconName = ComponentProps<typeof Ionicons>['name'];
const MEDAL_ICON: Record<string, IconName> = { first: 'enter-outline', architect: 'business-outline', traveler: 'compass-outline', cities: 'map-outline', guardian: 'shield-checkmark-outline', quiz: 'sparkles-outline',
  puzzler: 'extension-puzzle-outline', detective: 'search-outline', sharp: 'eye-outline', witness: 'ribbon-outline', pilgrim: 'walk-outline', companion: 'footsteps-outline' };

export default function Passport() {
  const { items, site } = useContent();
  const flags = useFlags();
  const { progress } = usePassport();
  const account = useAccount();
  const { lang } = useLang();
  const { settings } = useSettings();
  const [shared, setShared] = useState<Shared | null>(null);
  const [page, setPage] = useState(0);
  const [fileError, setFileError] = useState<string | null>(null);
  const memories = useJournal().memories.length;
  const found = useMemo(() => items.filter(i => progress.discovered[i.slug]).sort((a, b) => progress.discovered[b.slug].localeCompare(progress.discovered[a.slug])), [items, progress]);
  const onSite = found.filter(i => progress.visits[i.slug]);
  const digital = found.filter(i => !progress.visits[i.slug]);
  const cities = new Set(found.map(i => i.city.slug)).size;
  const line = rhythmLine(settings.rhythm, progress.days);
  const list = medals(progress, items);
  const earned = list.filter(m => m.value >= m.required);
  const next = list.filter(m => m.value < m.required).sort((a, b) => b.value / b.required - a.value / a.required)[0];
  const favorites = items.filter(i => progress.favorites.includes(i.slug));
  const pages = Math.max(1, Math.ceil(digital.length / PAGE));
  const at = Math.min(page, pages - 1);
  const locale = lang === 'en' ? 'en-GB' : 'tr-TR';
  const dated = (iso: string) => new Date(iso).toLocaleDateString(locale);

  async function saveFile() {
    setFileError(null);
    const content = { platform: 'EŞİK — Tarihe Açılan Kapı', exportedAt: new Date().toISOString(), notice: t('Dijital mühürler keşfi, yerinde mühürler eserin önünde basıldığını gösterir.', 'Digital stamps show a discovery; on-the-spot stamps were taken in front of the work.'),
      discoveries: found.map(a => ({ name: a.name, city: a.city.name, discoveredAt: progress.discovered[a.slug], onTheSpotAt: progress.visits[a.slug]?.date ?? null })), achievements: earned.map(a => a.name), quiz: progress.quiz };
    try { await savePassportFile(JSON.stringify(content, null, 2)); } catch (e) { setFileError(String((e as Error)?.message ?? e)); }
  }

  return <ScrollView contentContainerStyle={{ padding: space.m, gap: space.m, paddingBottom: space.xl }}>
    <View style={s.head}>
      <Eyebrow>{t('SENİN KEŞİF GÜNLÜĞÜN', 'YOUR DISCOVERY JOURNAL')}</Eyebrow>
      <Title size={42}>{t('Biriktirdiğin', 'The stories')}</Title>
      <Text style={s.headItalic}>{t('hikâyeler.', 'you have gathered.')}</Text>
      <Text style={s.lede}>{t('Bir yerin hikâyesini öğrendiğinde, o yer artık biraz da senindir.', 'Once you learn the story of a place, that place is a little bit yours.')}</Text>
    </View>
    <View style={s.stats}>
      <Stat n={two(found.length)} label={t('KEŞFEDİLEN ESER', 'WORKS DISCOVERED')} />
      <Stat n={two(onSite.length)} label={t('YERİNDE MÜHÜR', 'ON-THE-SPOT STAMPS')} />
      <Stat n={two(cities)} label={t('FARKLI ŞEHİR', 'DIFFERENT CITIES')} />
      <Stat n={two(earned.length)} label={t('KAZANILAN MADALYON', 'MEDALLIONS EARNED')} />
    </View>
    {settings.rhythm !== 'off' && <Text style={s.rhythm}>{[settings.rhythm === 'daily' ? t(`${dailyRun(progress.days).days} gün ritim`, `${dailyRun(progress.days).days}-day rhythm`) : t(`${weeklyRun(progress.days)} hafta ritim`, `${weeklyRun(progress.days)}-week rhythm`), line, t(`En uzun serin: ${longestStreak(progress.days)} gün.`, `Your longest streak: ${longestStreak(progress.days)} days.`)].filter(Boolean).join(' · ')}</Text>}

    {flags.personalization && <ProfileEntry />}

    <View style={s.book}>
      <View style={s.paper}>
        <View style={s.paperHead}>
          <Text style={s.paperTitle}>{t('KEŞİF MÜHÜRLERİ', 'DISCOVERY STAMPS')}</Text>
          <MaterialCommunityIcons name="stamper" size={22} color={colors.soft} />
        </View>
        {found.length ? <>
          <Text style={s.paperPart} accessibilityRole="header">{t(`YERİNDE ZİYARET MÜHÜRLERİ (${onSite.length})`, `ON-THE-SPOT STAMPS (${onSite.length})`)}</Text>
          {onSite.length ? <View style={s.stamps}>{onSite.map((i, n) => <StampMark key={i.slug} item={i} date={dated(progress.visits[i.slug].date)} onSpot index={n} />)}</View>
            : <Text style={s.small}>{t('Henüz yok. Bir eserin önündeyken onun sayfasından basabilirsin.', 'None yet. You can take one from a work’s page when you stand in front of it.')}</Text>}
          <Text style={s.paperPart} accessibilityRole="header">{t(`DİJİTAL KEŞİF MÜHÜRLERİ (${digital.length})`, `DIGITAL DISCOVERY STAMPS (${digital.length})`)}</Text>
          {digital.length > 0 && <View style={s.stamps}>{digital.slice(at * PAGE, at * PAGE + PAGE).map((i, n) => <StampMark key={i.slug} item={i} date={dated(progress.discovered[i.slug])} index={n} />)}</View>}
          {pages > 1 && <View style={s.pager}>
            <Pressable onPress={() => setPage(at - 1)} disabled={at === 0} accessibilityRole="button" accessibilityState={{ disabled: at === 0 }} accessibilityLabel={t('Önceki pasaport sayfası', 'Previous passport page')} style={s.pagerKey}><Ionicons name="arrow-back" size={22} color={at === 0 ? colors.line : colors.ink} /></Pressable>
            <Text style={s.pagerText} accessibilityLiveRegion="polite">{t('SAYFA', 'PAGE')} {at + 1} / {pages}</Text>
            <Pressable onPress={() => setPage(at + 1)} disabled={at + 1 >= pages} accessibilityRole="button" accessibilityState={{ disabled: at + 1 >= pages }} accessibilityLabel={t('Sonraki pasaport sayfası', 'Next passport page')} style={s.pagerKey}><Ionicons name="arrow-forward" size={22} color={at + 1 >= pages ? colors.line : colors.ink} /></Pressable>
          </View>}
        </> : <View style={s.empty}>
          <Ionicons name="compass-outline" size={52} color={colors.goldLine} />
          <Text style={s.emptyTitle}>{t('İlk mühür,', 'Your first stamp')}</Text>
          <Text style={s.emptyItalic}>{t('ilk hikâyeni bekliyor.', 'is waiting for your first story.')}</Text>
          <Text style={[s.small, { textAlign: 'center' }]}>{t('Bir eserin hikâyesini okuyup bitirdiğinde ilk mührün burada olacak.', 'Finish reading a work’s story and your first stamp will be here.')}</Text>
          <Button icon="compass-outline" label={t('İlk keşfine başla', 'Start your first discovery')} onPress={() => router.navigate('/')} />
        </View>}
      </View>
    </View>
    <Text style={s.small}>{t('Dijital mühürler keşfi temsil eder, fiziksel ziyaret doğrulaması değildir. Altın mühürler eserin önünde basıldı.', 'Digital stamps stand for a discovery, not a verified visit. Golden stamps were taken in front of the work.')}</Text>
    {found.length > 0 && <Button kind="plain" icon="download-outline" label={t('Pasaportumu indir', 'Download my passport')} onPress={saveFile} />}
    {fileError && <Notice tone="warn" icon="alert-circle-outline">{fileError}</Notice>}

    <Button kind="plain" icon="book-outline" label={t('Keşif Defterim', 'My Discovery Notebook')} onPress={() => router.push('/defter')} />
    <Button kind="plain" icon="images-outline" onPress={() => router.push('/hatira')}
      label={memories ? t(`Hatıra Defterim (${memories})`, `My Memory Book (${memories})`) : t('Hatıra Defterim', 'My Memory Book')} />

    <View style={s.vault}>
      <Eyebrow light>{t('MADALYONLAR · MERAKININ HAZİNESİ', 'MEDALLIONS · THE TREASURE OF YOUR CURIOSITY')}</Eyebrow>
      <Title light size={32}>{t('Hikâyeler birikir.', 'Stories gather.')}</Title>
      <Text style={s.vaultItalic}>{t('İzleri sende kalır.', 'Their traces stay with you.')}</Text>
      <View style={s.vaultCount} accessible accessibilityLabel={t(`${list.length} madalyondan ${earned.length} tanesi koleksiyonunda`, `${earned.length} of ${list.length} medallions in your collection`)}>
        <Text style={s.vaultN}>{earned.length}<Text style={s.vaultOf}> / {list.length}</Text></Text>
        <Text style={s.vaultLabel}>{t('MADALYON KOLEKSİYONUNDA', 'MEDALLIONS IN YOUR COLLECTION')}</Text>
      </View>
      <View style={s.vaultBar}><View style={[s.vaultFill, { width: `${list.length ? earned.length / list.length * 100 : 0}%` }]} /></View>
      <View style={s.vaultStats}>
        <VaultStat label={t('KEŞİF', 'DISCOVERIES')} value={`${found.length} / ${items.length}`} />
        <VaultStat label={t('QUIZ TURU', 'QUIZ ROUNDS')} value={String(progress.quiz.completed)} />
        <VaultStat label={t('EN İYİ PUAN', 'BEST SCORE')} value={String(progress.quiz.best)} />
        <VaultStat label={t('YAPBOZ / DOSYA', 'PUZZLES / FILES')} value={`${Object.keys(progress.games.puzzle).length} / ${Object.keys(progress.games.detective).length}`} />
      </View>
      {next && <View style={s.nextGoal}><Ionicons name="sparkles-outline" size={15} color={colors.gold} /><Text style={s.nextText}>{t('Sıradaki hedef', 'Next goal')}: <Text style={{ fontWeight: '700' }}>{next.name}</Text> · {Math.min(next.value, next.required)} / {next.required}</Text></View>}
    </View>
    <View style={s.medals}>{list.map(m => <MedalCard key={m.id} m={m} onShare={setShared} />)}</View>

    {flags.tiered_medals && !!site.medal_tiers && <Tiers tiers={site.medal_tiers} onShare={setShared} />}

    {!!favorites.length && <><Eyebrow>{t('FAVORİLER', 'FAVOURITES')}</Eyebrow>{favorites.map(i => <WorkCard key={i.slug} item={i} />)}</>}
    {flags.question_follow && <QuestionsEntry />}
    {account.user ? <Text style={s.small}>{t('Pasaportun hesabınla eşitleniyor.', 'Your passport is synced with your account.')} {syncLabel(account.sync, account.lastSync)}</Text>
      : <>
        <Text style={s.small}>{t('Pasaportun bu telefonda saklanır. Uygulamayı silmek onu da siler.', 'Your passport is kept on this phone. Deleting the app deletes it too.')}</Text>
        <Button kind="plain" icon="person-circle-outline" label={t('Giriş yap, pasaportun kaybolmasın', 'Sign in so your passport is never lost')} onPress={() => router.push('/giris?sonra=/pasaport')} />
      </>}
    <ShareSheet shared={shared} onClose={() => setShared(null)} />
  </ScrollView>;
}

/** A round stamp as on the site: burgundy and green ink in turn, slightly crooked. The golden one was taken on the spot. */
/** How this person explores, once something is known, with the way to change it. */
function ProfileEntry() {
  const { progress } = usePassport();
  const { prefs, narration } = usePreferences();
  const profile = prefs.on ? discoveryProfile(prefs, narration, progress) : null;
  if (!profile) return <Button kind="plain" icon="options-outline" label={t('Keşfet’i bana göre düzenle', 'Arrange Explore for me')} onPress={() => router.push('/tercihler')} />;
  return <Pressable onPress={() => router.push('/tercihler')} accessibilityRole="button" accessibilityLabel={t(`Keşif biçimin: ${profile.name}. Değiştir`, `How you explore: ${profile.name}. Change`)} style={s.profile}>
    <Ionicons name="compass-outline" size={24} color={colors.goldText} />
    <View style={{ flex: 1, gap: 2 }}><Text style={s.profileName}>{t('Keşif biçimin', 'How you explore')}: {profile.name}</Text><Text style={s.small}>{profile.because}.</Text></View>
    <Ionicons name="chevron-forward" size={18} color={colors.goldLine} />
  </Pressable>;
}

/** Only once something is followed: Sorularım is not a promise to everyone. */
function QuestionsEntry() {
  const { total, unread } = useQuestionCounts();
  if (!total) return null;
  return <Button kind={unread ? 'gold' : 'plain'} icon="chatbubble-ellipses-outline" label={unread ? t(`Sorularım · ${unread} yeni cevap`, `My questions · ${unread} new`) : t('Sorularım', 'My questions')} onPress={() => router.push('/sorularim')} />;
}

function StampMark({ item, date, index, onSpot = false }: { item: Item; date: string; index: number; onSpot?: boolean }) {
  const ink = onSpot ? '#7a5b1e' : index % 2 ? '#326055' : '#87554a';
  const kind = onSpot ? t('YERİNDE MÜHÜR', 'ON THE SPOT') : t('DİJİTAL KEŞİF', 'DIGITAL DISCOVERY');
  return <Pressable onPress={() => router.push(`/eser/${item.slug}`)} accessibilityRole="button" accessibilityLabel={`${item.name}, ${item.city.name}, ${date}, ${kind.toLocaleLowerCase('tr-TR')}`}
    style={[s.stamp, { borderColor: `${ink}9a`, transform: [{ rotate: index % 2 ? '6deg' : '-7deg' }] }, onSpot && s.stampGold]}>
    <View style={[s.stampRing, { borderColor: `${ink}66` }]} pointerEvents="none" />
    <Text style={[s.stampCity, { color: ink }]} numberOfLines={1}>{item.city.name.toLocaleUpperCase('tr-TR')}</Text>
    <MaterialCommunityIcons name={onSpot ? 'seal-variant' : 'stamper'} size={18} color={ink} />
    <Text style={[s.stampName, { color: ink }]} numberOfLines={3}>{item.name}</Text>
    <Text style={[s.stampDate, { color: ink }]}>{date}</Text>
    <Text style={[s.stampKind, { color: ink }]} numberOfLines={1}>{kind}</Text>
  </Pressable>;
}

function Stat({ n, label }: { n: string; label: string }) {
  return <View style={s.stat} accessible accessibilityLabel={`${Number(n)} ${label.toLocaleLowerCase('tr-TR')}`}><Text style={s.statN}>{n}</Text><Text style={s.statLabel}>{label}</Text></View>;
}

function VaultStat({ label, value }: { label: string; value: string }) {
  return <View style={s.vaultStat} accessible accessibilityLabel={`${label}: ${value}`}><Text style={s.vaultStatLabel}>{label}</Text><Text style={s.vaultStatValue}>{value}</Text></View>;
}

/** The medallion with what it asks for and how far along it is; an earned one opens its shareable card. */
function MedalCard({ m, onShare }: { m: Medal; onShare: (s: Shared) => void }) {
  const done = m.value >= m.required;
  const shown = Math.min(m.value, m.required);
  return <Pressable style={[s.medal, done && { borderColor: METAL[m.metal] }]} disabled={!done} accessibilityRole={done ? 'button' : undefined}
    onPress={() => onShare({ kind: 'medal', name: m.name, description: m.description, metal: m.metal })}
    accessibilityLabel={`${m.name}. ${m.description} ${done ? t('Kazanıldı. Paylaşmak için dokun.', 'Earned. Tap to share.') : `${shown}/${m.required}`}`}>
    <View style={s.medalTop}>
      <Text style={s.medalMetal}>{metalName(m.metal).toLocaleUpperCase('tr-TR')}</Text>
      {done ? <Ionicons name="share-social-outline" size={14} color={colors.goldText} /> : <Ionicons name="lock-closed-outline" size={13} color={colors.goldLine} />}
    </View>
    <View style={[s.coin, { borderColor: METAL[m.metal], backgroundColor: done ? METAL[m.metal] : 'transparent' }]}>
      <Ionicons name={MEDAL_ICON[m.id] ?? 'medal-outline'} size={26} color={done ? colors.emeraldDeep : METAL[m.metal]} />
    </View>
    <Text style={s.medalName}>{m.name}</Text>
    <Text style={s.medalText}>{m.description}</Text>
    <View style={s.medalBar}><View style={[s.medalFill, { width: `${shown / m.required * 100}%`, backgroundColor: METAL[m.metal] }]} /></View>
    <Text style={s.medalState}>{done ? t('Kazanıldı', 'Earned') : `${shown} / ${m.required}`}{m.mobile ? ` · ${t('mobil', 'mobile')}` : ''}</Text>
  </Pressable>;
}

/** Bronze, silver and gold, in words as well as in colour. An earned row opens its shareable card. */
function Tiers({ tiers, onShare }: { tiers: MedalTiers; onShare: (s: Shared) => void }) {
  const { items } = useContent();
  const { progress } = usePassport();
  const { overall, cities } = useMemo(() => tierTracks(progress, items, tiers), [progress, items, tiers]);
  const words: Record<string, { name: string; body: string }> = {
    read: { name: t('Hikâye Okuyucusu', 'Story Reader'), body: t('Hikâyesini gerçekten okuduğun ya da dinlediğin eserler.', 'Works whose story you really read or heard.') },
    onsite: { name: t('Yerinde Gezgin', 'On-the-Spot Traveller'), body: t('Önünde durup mühürlediğin eserler. Evden kazanılmaz.', 'Works you stamped standing in front of them. Not earned from home.') },
    recall: { name: t('Hatırlayan', 'Rememberer'), body: t('Hatırla kartlarında doğru yanıtladığın eserler.', 'Works you answered right in Remember cards.') },
  };
  const rows = [...overall.map(o => ({ ...o, ...words[o.id], extra: null as string | null })),
    ...cities.map(c => ({ ...c,
      // the title above gold: the same city, on the spot
      name: c.master ? t(`${c.name} Ustası`, `Master of ${c.name}`) : t(`${c.name} Kâşifi`, `${c.name} Explorer`),
      body: c.master ? t('Eserlerini okudun, önünde durdun.', 'You read its works and stood before them.') : t('Bu şehirde hikâyesini okuduğun eserler.', 'Works in this city whose story you read.'),
      extra: c.master || !c.onSiteGoal ? null : t(`${c.name} Ustası için altın kademe ve ${c.onSiteGoal} yerinde mühür gerekir (${c.onSite}/${c.onSiteGoal}).`, `Master of ${c.name} takes gold and ${c.onSiteGoal} on-the-spot stamps (${c.onSite}/${c.onSiteGoal}).`) }))];
  return <>
    <Eyebrow>{t('KADEMELER', 'TIERS')}</Eyebrow>
    <View style={{ gap: space.s }}>{rows.map(r => {
      const status = r.metal ? metalName(r.metal) : t('Henüz başlamadı', 'Not started');
      const to = r.next ? t(`${r.value}/${r.next.at}, sıradaki ${metalName(r.next.metal)}`, `${r.value}/${r.next.at}, next ${metalName(r.next.metal)}`) : t(`${r.value}/${r.max}, son kademe`, `${r.value}/${r.max}, final tier`);
      return <Pressable key={r.id} disabled={!r.metal} style={s.tier} accessibilityRole={r.metal ? 'button' : undefined} accessibilityLabel={`${r.name}. ${status}. ${to}. ${r.body}${r.extra ? ` ${r.extra}` : ''}${r.metal ? ` ${t('Paylaşmak için dokun.', 'Tap to share.')}` : ''}`}
        onPress={() => r.metal && onShare({ kind: 'medal', name: `${r.name} · ${metalName(r.metal)}`, description: r.body, metal: r.metal })}>
        <View style={[s.tierDisc, r.metal ? { backgroundColor: METAL[r.metal], borderColor: METAL[r.metal] } : { borderColor: colors.goldLine }]}>
          <Ionicons name={r.metal ? 'medal' : 'lock-closed-outline'} size={18} color={r.metal ? colors.emeraldDeep : colors.goldLine} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.tierName}>{r.name}</Text>
          <Text style={s.tierState}>{status} · {to}</Text>
          <Text style={s.small}>{r.body}</Text>
          {!!r.extra && <Text style={s.small}>{r.extra}</Text>}
        </View>
        {!!r.metal && <Ionicons name="share-social-outline" size={15} color={colors.goldText} />}
      </Pressable>;
    })}</View>
  </>;
}

const s = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: space.s + 4, padding: space.m, borderRadius: 14, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  profileName: { fontFamily: serif, fontSize: 18, color: colors.ink },
  head: { alignItems: 'center', gap: 2, paddingTop: space.s },
  headItalic: { fontFamily: serif, fontStyle: 'italic', fontSize: 42, lineHeight: 48, color: colors.goldText },
  lede: { color: colors.soft, fontSize: 15, lineHeight: 23, textAlign: 'center', marginTop: space.s },
  stats: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.m },
  stat: { width: '50%', alignItems: 'center', gap: 2 },
  statN: { fontFamily: serif, fontSize: 40, lineHeight: 46, color: colors.goldText },
  statLabel: { color: colors.ink, fontSize: 11, letterSpacing: 1.2, textAlign: 'center' },
  rhythm: { color: colors.soft, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  book: { marginRight: 6, borderRadius: 8, backgroundColor: '#cfc8b6', paddingRight: 5, paddingLeft: 0, borderWidth: 1, borderColor: '#b9b2a1' },
  paper: { padding: space.m, borderRadius: 7, backgroundColor: '#ebe6da', borderRightWidth: 1, borderRightColor: '#b9b2a1', gap: space.m },
  paperHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: space.s, borderBottomWidth: 1, borderBottomColor: colors.line },
  paperTitle: { color: colors.soft, fontSize: 12, letterSpacing: 1.8 },
  paperPart: { color: colors.goldText, fontSize: 11, letterSpacing: 1.4, fontWeight: '700' },
  small: { color: colors.soft, fontSize: 12, lineHeight: 18 },
  stamps: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.m, justifyContent: 'space-between' },
  stamp: { width: '48%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 15, borderRadius: 999, borderWidth: 2, borderStyle: 'dashed' },
  stampGold: { borderStyle: 'solid', backgroundColor: '#c7a96b26' },
  stampRing: { position: 'absolute', top: 5, bottom: 5, left: 5, right: 5, borderRadius: 999, borderWidth: 1 },
  stampCity: { fontSize: 9.5, letterSpacing: 1 },
  stampName: { fontFamily: serif, fontSize: 14, lineHeight: 16, textAlign: 'center' },
  stampDate: { fontSize: 10 },
  stampKind: { fontSize: 7.5, letterSpacing: .8 },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: space.s, borderTopWidth: 1, borderTopColor: colors.line },
  pagerKey: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  pagerText: { color: colors.soft, fontSize: 12, letterSpacing: 1.6 },
  empty: { alignItems: 'center', gap: space.s, paddingVertical: space.m },
  emptyTitle: { fontFamily: serif, fontSize: 26, color: colors.ink },
  emptyItalic: { fontFamily: serif, fontStyle: 'italic', fontSize: 26, color: colors.goldText, textAlign: 'center' },
  vault: { padding: space.l, borderRadius: 18, backgroundColor: colors.emerald, borderWidth: 1, borderColor: colors.goldLine, gap: space.s },
  vaultItalic: { fontFamily: serif, fontStyle: 'italic', fontSize: 32, lineHeight: 37, color: colors.gold, marginTop: -space.s },
  vaultCount: { marginTop: space.s },
  vaultN: { fontFamily: serif, fontSize: 56, lineHeight: 62, color: colors.ivory },
  vaultOf: { fontFamily: serif, fontSize: 26, color: colors.goldSoft },
  vaultLabel: { color: colors.goldSoft, fontSize: 11, letterSpacing: 1.6, fontWeight: '600' },
  vaultBar: { height: 3, borderRadius: 2, backgroundColor: '#e6d5ae33', overflow: 'hidden' },
  vaultFill: { height: 3, backgroundColor: colors.gold },
  vaultStats: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.s, marginTop: space.xs },
  vaultStat: { width: '50%', gap: 1 },
  vaultStatLabel: { color: colors.gold, fontSize: 10.5, letterSpacing: 1.2, fontWeight: '600' },
  vaultStatValue: { fontFamily: serif, fontSize: 24, color: colors.ivory },
  nextGoal: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: space.xs, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: colors.darkLine },
  nextText: { flex: 1, color: colors.lightMuted, fontSize: 13 },
  medals: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s, justifyContent: 'space-between' },
  medal: { width: '48.5%', alignItems: 'center', padding: 12, borderRadius: 14, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, gap: 5 },
  medalTop: { flexDirection: 'row', alignSelf: 'stretch', alignItems: 'center', justifyContent: 'space-between' },
  medalMetal: { color: colors.goldText, fontSize: 10, letterSpacing: 1.4, fontWeight: '600' },
  coin: { width: 60, height: 60, borderRadius: 30, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginVertical: 2 },
  medalName: { fontFamily: serif, color: colors.ink, fontSize: 17, lineHeight: 20, textAlign: 'center' },
  medalText: { flex: 1, color: colors.soft, fontSize: 11.5, lineHeight: 16, textAlign: 'center' },
  medalBar: { alignSelf: 'stretch', height: 3, borderRadius: 2, backgroundColor: colors.parchmentDeep, overflow: 'hidden', marginTop: 2 },
  medalFill: { height: 3 },
  medalState: { color: colors.soft, fontSize: 11.5 },
  tier: { flexDirection: 'row', alignItems: 'center', gap: space.m, padding: 12, borderRadius: 14, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  tierDisc: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  tierName: { fontFamily: serif, color: colors.ink, fontSize: 17 },
  tierState: { color: colors.goldText, fontSize: 12, fontWeight: '600' },
});
