// Miras Pasaportu: the rhythm and the counts, the medallions closest to their goal, every medallion (the site's, then
// the phone's own) and the tiers whose thresholds come from the panel, and the stamps in a book as on the site
// (frontend/src/pages/Collection.tsx): the golden on-the-spot ones apart from the digital ones, because only they prove
// a visit.
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { ProgressBar, StatPill } from '@/components/Controls';
import { SectionHeader } from '@/components/Layout';
import { ShareSheet, type Shared } from '@/components/ShareSheet';
import { Button, Eyebrow, Loading, Notice, Title, WorkCard } from '@/components/UI';
import { syncLabel, useAccount } from '@/lib/account';
import type { Item, MedalTiers } from '@/lib/api';
import { t, useLang } from '@/lib/i18n';
import { useJournal } from '@/lib/journal';
import { compareKeys, medals, type Medal } from '@/lib/passport';
import { savePassportFile } from '@/lib/passportFile';
import { discoveryProfile } from '@/lib/personal';
import { useQuestionCounts } from '@/lib/questions';
import { longestDailyRun, rhythmState } from '@/lib/rhythm';
import { useContent, useFlags, usePassport, useSettings } from '@/lib/store';
import { colors, fonts, hit, metal, radius, serif, space, stampBook, type } from '@/lib/theme';
import { tierTracks, type Metal } from '@/lib/tiers';
import { usePreferences } from '@/lib/usePreferences';

const PAGE = 4;
const metalName = (m: Metal) => m === 'bronze' ? t('Bronz', 'Bronze') : m === 'silver' ? t('Gümüş', 'Silver') : t('Altın', 'Gold');

export default function Passport() {
  const { items, site, loading } = useContent();
  const flags = useFlags();
  const { progress } = usePassport();
  const account = useAccount();
  const { lang } = useLang();
  const { settings } = useSettings();
  const [shared, setShared] = useState<Shared | null>(null);
  const [page, setPage] = useState(0);
  const [fileError, setFileError] = useState<string | null>(null);
  const memories = useJournal().memories.length;
  const found = useMemo(() => items.filter(i => progress.discovered[i.slug]).sort((a, b) => compareKeys(progress.discovered[b.slug], progress.discovered[a.slug])), [items, progress]);
  const onSite = found.filter(i => progress.visits[i.slug]);
  const digital = found.filter(i => !progress.visits[i.slug]);
  const cities = new Set(found.map(i => i.city.slug)).size;
  const run = rhythmState(flags.flexible_streak ? settings.rhythm : 'daily', progress.days);
  const best = useMemo(() => longestDailyRun(progress.days), [progress.days]);
  const list = useMemo(() => medals(progress, items), [progress, items]);
  const earned = list.filter(m => m.value >= m.required);
  const nextUp = list.filter(m => m.value < m.required).sort((a, b) => b.value / b.required - a.value / a.required).slice(0, 3);
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

  return <ScrollView contentContainerStyle={s.page}>
    <Card tone="dark" style={s.cover}>
      <Eyebrow light>✦ {t('MİRAS PASAPORTUM', 'MY HERITAGE PASSPORT')}</Eyebrow>
      <Title light accent={1}>{t('Biriktirdiğin hikâyeler', 'The stories you have gathered')}</Title>
      <View style={s.pills}>
        {run && <StatPill tone="dark" icon={run.periodDone ? 'flame' : 'flame-outline'} value={run.count} label={run.unit === 'week' ? t('hafta seri', 'week streak') : t('gün seri', 'day streak')} />}
        <StatPill tone="dark" icon="book-outline" value={found.length} label={t('eser', 'works')} />
        <StatPill tone="dark" icon="ribbon-outline" value={onSite.length} label={t('yerinde mühür', 'on the spot')} />
        <StatPill tone="dark" icon="map-outline" value={cities} label={t('şehir', 'cities')} />
        <StatPill tone="dark" icon="medal-outline" value={earned.length} label={t('madalyon', 'medallions')} />
      </View>
      <Text style={s.coverNote}>{run && best ? t(`En uzun serin: ${best} gün. `, `Your longest streak: ${best} days. `) : ''}{t('Bir yerin hikâyesini öğrendiğinde, o yer artık biraz da senindir.', 'Once you learn the story of a place, that place is a little bit yours.')}</Text>
    </Card>

    {flags.personalization && <ProfileEntry />}

    <SectionHeader title={t('Mühürler', 'Stamps')} />
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
        </> : loading && !items.length ? <Loading /> : <View style={s.empty}>
          {/* the stamps are shown with their works: wait for them before saying the passport is empty */}
          <Ionicons name="compass-outline" size={52} color={colors.goldLine} />
          <Text style={s.emptyTitle}>{t('İlk mühür ilk hikâyeni bekliyor.', 'Your first stamp is waiting for your first story.')}</Text>
          <Text style={[s.small, { textAlign: 'center' }]}>{t('Bir eserin hikâyesini okuyup bitirdiğinde ilk mührün burada olacak.', 'Finish reading a work’s story and your first stamp will be here.')}</Text>
          <Button icon="compass-outline" label={t('İlk keşfine başla', 'Start your first discovery')} onPress={() => router.navigate('/kesfet')} />
        </View>}
      </View>
    </View>
    <Text style={s.small}>{t('Dijital mühürler keşfi temsil eder, fiziksel ziyaret doğrulaması değildir. Altın mühürler eserin önünde basıldı.', 'Digital stamps stand for a discovery, not a verified visit. Golden stamps were taken in front of the work.')}</Text>
    {found.length > 0 && <Button kind="plain" icon="download-outline" label={t('Pasaportumu indir', 'Download my passport')} onPress={saveFile} />}
    {fileError && <Notice tone="warn" icon="alert-circle-outline">{fileError}</Notice>}

    {nextUp.length > 0 && <>
      <SectionHeader title={t('Sıradaki madalyonların', 'Your next medallions')} />
      {nextUp.map(m => <Card key={m.id} style={s.next}>
        <View style={s.nextRow} accessible accessibilityLabel={`${m.name}. ${m.description} ${Math.min(m.value, m.required)}/${m.required}`}>
          <Disc metal={null} />
          <View style={{ flex: 1, gap: space.xs }}>
            <Text style={[s.name, s.left]}>{m.name}</Text>
            <Text style={s.small}>{m.description}</Text>
            <ProgressBar value={Math.min(m.value, m.required)} max={m.required} label={`${Math.min(m.value, m.required)} / ${m.required}`} />
          </View>
        </View>
      </Card>)}
    </>}

    <SectionHeader title={t(`Tüm madalyonlar · ${earned.length} / ${list.length}`, `All medallions · ${earned.length} / ${list.length}`)} />
    <View style={s.grid}>{list.map(m => <MedalTile key={m.id} m={m} onShare={setShared} />)}</View>

    {flags.tiered_medals && !!site.medal_tiers && <Tiers tiers={site.medal_tiers} onShare={setShared} />}

    <Button kind="plain" icon="book-outline" label={t('Keşif Defterim', 'My Discovery Notebook')} onPress={() => router.push('/defter')} />
    <Button kind="plain" icon="images-outline" onPress={() => router.push('/hatira')}
      label={memories ? t(`Hatıra Defterim (${memories})`, `My Memory Book (${memories})`) : t('Hatıra Defterim', 'My Memory Book')} />
    {!!favorites.length && <><SectionHeader title={t('Favoriler', 'Favourites')} />{favorites.map(i => <WorkCard key={i.slug} item={i} />)}</>}
    {flags.question_follow && <QuestionsEntry />}
    {account.user ? <Text style={s.small}>{t('Pasaportun hesabınla eşitleniyor.', 'Your passport is synced with your account.')} {syncLabel(account.sync, account.lastSync)}</Text>
      : <>
        <Text style={s.small}>{t('Pasaportun bu telefonda saklanır. Uygulamayı silmek onu da siler.', 'Your passport is kept on this phone. Deleting the app deletes it too.')}</Text>
        <Button kind="plain" icon="person-circle-outline" label={t('Giriş yap, pasaportun kaybolmasın', 'Sign in so your passport is never lost')} onPress={() => router.push('/giris?sonra=/pasaport')} />
      </>}
    <ShareSheet shared={shared} onClose={() => setShared(null)} />
  </ScrollView>;
}

/** How this person explores, once something is known, with the way to change it. */
function ProfileEntry() {
  const { progress } = usePassport();
  const { prefs, narration } = usePreferences();
  const profile = prefs.on ? discoveryProfile(prefs, narration, progress) : null;
  if (!profile) return <Button kind="plain" icon="options-outline" label={t('Keşfet’i bana göre düzenle', 'Arrange Explore for me')} onPress={() => router.push('/tercihler')} />;
  return <Card onPress={() => router.push('/tercihler')} accessibilityLabel={t(`Keşif biçimin: ${profile.name}. Değiştir`, `How you explore: ${profile.name}. Change`)} style={s.profile}>
    <Ionicons name="compass-outline" size={24} color={colors.goldText} />
    <View style={{ flex: 1, gap: 2 }}><Text style={s.profileName}>{t('Keşif biçimin', 'How you explore')}: {profile.name}</Text><Text style={s.small}>{profile.because}.</Text></View>
    <Ionicons name="chevron-forward" size={18} color={colors.goldLine} />
  </Card>;
}

/** Only once something is followed: Sorularım is not a promise to everyone. */
function QuestionsEntry() {
  const { total, unread } = useQuestionCounts();
  if (!total) return null;
  return <Button kind={unread ? 'gold' : 'plain'} icon="chatbubble-ellipses-outline" label={unread ? t(`Sorularım · ${unread} yeni cevap`, `My questions · ${unread} new`) : t('Sorularım', 'My questions')} onPress={() => router.push('/sorularim')} />;
}

/** A round stamp as on the site: burgundy and green ink in turn, slightly crooked. The golden one was taken on the spot. */
function StampMark({ item, date, index, onSpot = false }: { item: Item; date: string; index: number; onSpot?: boolean }) {
  const ink = onSpot ? stampBook.goldInk : index % 2 ? stampBook.greenInk : stampBook.redInk;
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

/** The medallion: filled with its metal once earned, otherwise grey with a lock (the metal is written next to it either way). */
function Disc({ metal: m }: { metal: Metal | null }) {
  return <View style={[s.disc, m ? { backgroundColor: metal[m] } : s.discLocked]}>
    <Ionicons name={m ? 'medal' : 'lock-closed-outline'} size={20} color={m ? colors.emeraldDeep : colors.soft} />
  </View>;
}

/** One medallion with what it asks for and how far along it is; an earned one opens its shareable card. */
function MedalTile({ m, onShare }: { m: Medal; onShare: (s: Shared) => void }) {
  const done = m.value >= m.required;
  const shown = Math.min(m.value, m.required);
  const status = done ? `${metalName(m.metal)} · ${t('Kazanıldı', 'Earned')}` : `${t('Kilitli', 'Locked')} · ${shown} / ${m.required}`;
  const body = <>
    <Disc metal={done ? m.metal : null} />
    <Text style={s.name}>{m.name}</Text>
    <Text style={s.status}>{m.description}</Text>
    <Text style={s.status}>{status}{m.mobile ? ` · ${t('mobil', 'mobile')}` : ''}</Text>
    {done && <Ionicons name="share-social-outline" size={14} color={colors.goldText} />}
  </>;
  const label = `${m.name}. ${m.description} ${status}.`;
  return done
    ? <Pressable style={({ pressed }) => [s.medal, pressed && { opacity: 0.85 }]} onPress={() => onShare({ kind: 'medal', name: m.name, description: m.description, metal: m.metal })}
      accessibilityRole="button" accessibilityLabel={`${label} ${t('Paylaşmak için dokun.', 'Tap to share.')}`}>{body}</Pressable>
    : <View style={[s.medal, s.locked]} accessible accessibilityLabel={label}>{body}</View>;
}

/** Bronze, silver and gold, in words as well as in colour; the thresholds come from the panel. An earned row opens its
 *  shareable card. */
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
    <SectionHeader title={t('Kademeler', 'Tiers')} />
    <View style={{ gap: space.s }}>{rows.map(r => {
      const status = r.metal ? metalName(r.metal) : t('Henüz başlamadı', 'Not started');
      const to = r.next ? t(`${r.value}/${r.next.at}, sıradaki ${metalName(r.next.metal)}`, `${r.value}/${r.next.at}, next ${metalName(r.next.metal)}`) : t(`${r.value}/${r.max}, son kademe`, `${r.value}/${r.max}, final tier`);
      const content = <View style={s.nextRow}>
        <Disc metal={r.metal} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[s.name, s.left]}>{r.name}</Text>
          <Text style={s.tierState}>{status} · {to}</Text>
          <Text style={s.small}>{r.body}</Text>
          {!!r.extra && <Text style={s.small}>{r.extra}</Text>}
          {r.next && <ProgressBar value={r.value} max={r.next.at} label="" accessibilityLabel={to} />}
        </View>
        {!!r.metal && <Ionicons name="share-social-outline" size={15} color={colors.goldText} />}
      </View>;
      const label = `${r.name}. ${status}. ${to}. ${r.body}${r.extra ? ` ${r.extra}` : ''}`;
      return r.metal
        ? <Card key={r.id} style={s.next} onPress={() => onShare({ kind: 'medal', name: `${r.name} · ${metalName(r.metal!)}`, description: r.body, metal: r.metal! })}
          accessibilityLabel={`${label} ${t('Paylaşmak için dokun.', 'Tap to share.')}`}>{content}</Card>
        : <Card key={r.id} style={s.next}><View accessible accessibilityLabel={label}>{content}</View></Card>;
    })}</View>
  </>;
}

const s = StyleSheet.create({
  page: { padding: space.m, gap: space.m, paddingBottom: space.xl },
  cover: { padding: space.l, gap: space.s },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s, marginTop: space.s },
  coverNote: { color: colors.goldSoft, marginTop: space.xs, ...type.caption },
  profile: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  profileName: { fontFamily: serif, color: colors.ink, ...type.heading },
  next: { padding: space.m },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  left: { textAlign: 'left' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  medal: { width: '48.5%', alignItems: 'center', padding: space.m - space.xs, borderRadius: radius.m, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.goldLine, gap: space.xs },
  locked: { backgroundColor: colors.parchment, borderColor: colors.line },
  disc: { width: hit, height: hit, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.goldLine, alignItems: 'center', justifyContent: 'center' },
  discLocked: { backgroundColor: colors.parchmentDeep, borderColor: colors.soft, borderStyle: 'dashed' },
  name: { ...type.body, fontFamily: serif, color: colors.ink, textAlign: 'center' },
  status: { color: colors.soft, textAlign: 'center', ...type.caption },
  tierState: { color: colors.goldText, ...type.caption, fontFamily: fonts.sansSemi },
  small: { color: colors.soft, ...type.caption },
  book: { marginRight: 6, borderRadius: radius.s, backgroundColor: stampBook.cover, paddingRight: 5, borderWidth: 1, borderColor: stampBook.edge },
  paper: { padding: space.m, borderRadius: radius.s, backgroundColor: stampBook.paper, borderRightWidth: 1, borderRightColor: stampBook.edge, gap: space.m },
  paperHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: space.s, borderBottomWidth: 1, borderBottomColor: colors.line },
  paperTitle: { color: colors.soft, letterSpacing: 1.8, ...type.caption },
  paperPart: { color: colors.goldText, ...type.eyebrow },
  stamps: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.m, justifyContent: 'space-between' },
  stamp: { width: '48%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 15, borderRadius: radius.pill, borderWidth: 2, borderStyle: 'dashed' },
  stampGold: { borderStyle: 'solid', backgroundColor: stampBook.goldWash },
  stampRing: { position: 'absolute', top: 5, bottom: 5, left: 5, right: 5, borderRadius: radius.pill, borderWidth: 1 },
  stampCity: { fontSize: 9.5, letterSpacing: 1 },
  stampName: { fontFamily: serif, fontSize: 15, lineHeight: 17, textAlign: 'center' },
  stampDate: { fontSize: 10 },
  stampKind: { fontSize: 7.5, letterSpacing: .8 },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: space.s, borderTopWidth: 1, borderTopColor: colors.line },
  pagerKey: { width: hit, height: hit, alignItems: 'center', justifyContent: 'center' },
  pagerText: { color: colors.soft, letterSpacing: 1.6, ...type.caption },
  empty: { alignItems: 'center', gap: space.s, paddingVertical: space.m },
  emptyTitle: { fontFamily: serif, color: colors.ink, textAlign: 'center', ...type.heading },
});
