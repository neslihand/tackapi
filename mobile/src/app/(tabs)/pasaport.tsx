// Miras Pasaportu: the rhythm and the counts, the medallions closest to their goal, every medallion (the site's, then
// the phone's own) and the tiers whose thresholds come from the panel, and the stamps in a book as on the site
// (frontend/src/pages/Collection.tsx): the golden on-the-spot ones apart from the digital ones, because only they prove
// a visit.
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Medallion } from '@/components/brand/Medallion';
import { PassportCover } from '@/components/brand/PassportCover';
import { Card } from '@/components/Card';
import { ProgressBar, StatPill } from '@/components/Controls';
import { SectionHeader } from '@/components/Layout';
import { ShareSheet, type Shared } from '@/components/ShareSheet';
import { Button, Eyebrow, Loading, Notice, WorkCard, type IconName } from '@/components/UI';
import { syncLabel, useAccount } from '@/lib/account';
import type { Item, MedalTiers } from '@/lib/api';
import { currentLang, t, useLang } from '@/lib/i18n';
import { useJournal } from '@/lib/journal';
import { compareKeys, medals, type Medal } from '@/lib/passport';
import { savePassportFile } from '@/lib/passportFile';
import { discoveryProfile } from '@/lib/personal';
import { useQuestionCounts } from '@/lib/questions';
import { longestDailyRun, rhythmState } from '@/lib/rhythm';
import { useContent, useFlags, usePassport, useSettings } from '@/lib/store';
import { colors, fonts, hit, radius, serif, shadow, space, stampBook, type } from '@/lib/theme';
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
    const content = { platform: 'TAÇKAPI — Tarihe Açılan Kapı', exportedAt: new Date().toISOString(), notice: t('Dijital mühürler keşfi, yerinde mühürler eserin önünde basıldığını gösterir.', 'Digital stamps show a discovery; on-the-spot stamps were taken in front of the work.'),
      discoveries: found.map(a => ({ name: a.name, city: a.city.name, discoveredAt: progress.discovered[a.slug], onTheSpotAt: progress.visits[a.slug]?.date ?? null })), achievements: earned.map(a => a.name), quiz: progress.quiz };
    try { await savePassportFile(JSON.stringify(content, null, 2)); } catch (e) { setFileError(String((e as Error)?.message ?? e)); }
  }

  const two = (n: number) => String(n).padStart(2, '0');
  return <ScrollView contentContainerStyle={s.page}>
    {/* the site's opening: a centred serif title with its gold italic half, then the three counts in large figures */}
    <View style={s.head}>
      <Eyebrow>{t('Senin keşif günlüğün', 'Your discovery journal')}</Eyebrow>
      <Text accessibilityRole="header" style={s.headTitle}>{t('Biriktirdiğin', 'The stories')}{'\n'}<Text style={s.headAccent}>{t('hikâyeler.', 'you have gathered.')}</Text></Text>
      <Text style={s.lede}>{t('Bir yerin hikâyesini öğrendiğinde, o yer artık biraz da senindir.', 'Once you learn the story of a place, that place is a little bit yours.')}</Text>
    </View>
    <View style={s.stats}>
      <BigStat value={two(found.length)} label={t('Keşfedilen eser', 'Works discovered')} />
      <View style={s.statRule} />
      <BigStat value={two(cities)} label={t('Farklı şehir', 'Different cities')} />
      <View style={s.statRule} />
      <BigStat value={two(earned.length)} label={t('Kazanılan madalyon', 'Medallions earned')} />
    </View>
    <View style={s.pills}>
      {run && <StatPill icon={run.periodDone ? 'flame' : 'flame-outline'} value={run.count} label={run.unit === 'week' ? t('hafta seri', 'week streak') : t('gün seri', 'day streak')} />}
      <StatPill icon="ribbon-outline" value={onSite.length} label={t('yerinde mühür', 'on the spot')} />
      {run && best > 0 && <StatPill icon="trophy-outline" value={best} label={t('en uzun seri', 'longest streak')} />}
    </View>

    {flags.personalization && <ProfileEntry />}

    {/* the opened booklet: its green cover on top, the stamp paper under it */}
    <View style={s.book}>
      <PassportCover owner={account.user?.display_name} />
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
          <Text style={s.emptyTitle}>{t('İlk mühür,', 'Your first stamp')}{'\n'}<Text style={s.emptyAccent}>{t('ilk hikâyeni bekliyor.', 'is waiting for your first story.')}</Text></Text>
          <Text style={[s.small, { textAlign: 'center' }]}>{t('Bir eserin hikâyesini okuyup bitirdiğinde ilk mührün burada olacak.', 'Finish reading a work’s story and your first stamp will be here.')}</Text>
          <Button kind="ghost" label={t('İlk keşfine başla', 'Start your first discovery')} onPress={() => router.navigate('/kesfet')} />
        </View>}
      </View>
    </View>
    <Text style={s.small}>{t('Dijital mühürler keşfi temsil eder, fiziksel ziyaret doğrulaması değildir. Altın mühürler eserin önünde basıldı.', 'Digital stamps stand for a discovery, not a verified visit. Golden stamps were taken in front of the work.')}</Text>
    {found.length > 0 && <Button kind="ghost" icon="download-outline" label={t('Pasaportumu indir', 'Download my passport')} onPress={saveFile} />}
    {fileError && <Notice tone="warn" icon="alert-circle-outline">{fileError}</Notice>}

    {/* the medallions: the closest goals, then every coin on a shelf */}
    <View style={s.divider} />
    <View style={{ gap: space.xs }}>
      <Eyebrow>{t(`${list.length} madalyondan ${earned.length} tanesi sende`, `You hold ${earned.length} of ${list.length} medallions`)}</Eyebrow>
      <Text accessibilityRole="header" style={s.sectionTitle}>{t('Madalyonların', 'Your medallions')}</Text>
    </View>
    {nextUp.map(m => <Card key={m.id} style={s.next}>
      <View style={s.nextRow} accessible accessibilityLabel={`${t('Sıradaki hedef', 'Next goal')}: ${m.name}. ${m.description} ${Math.min(m.value, m.required)}/${m.required}`}>
        <Medallion metal={m.metal} earned={false} symbol={m.id} size={56} />
        <View style={{ flex: 1, gap: space.xs }}>
          <Text style={s.nextKicker}>{t('SIRADAKİ HEDEF', 'NEXT GOAL')} · {metalName(m.metal).toLocaleUpperCase(lang === 'tr' ? 'tr-TR' : 'en')}</Text>
          <Text style={[s.name, s.left]}>{m.name}</Text>
          <Text style={s.small}>{m.description}</Text>
          <ProgressBar value={Math.min(m.value, m.required)} max={m.required} label={`${Math.min(m.value, m.required)} / ${m.required}`} />
        </View>
      </View>
    </Card>)}
    <View style={s.grid}>{list.map(m => <MedalTile key={m.id} m={m} onShare={setShared} />)}</View>
    <View style={s.shareHint}>
      <Ionicons name="share-social-outline" size={16} color={colors.goldText} />
      <Text style={s.small}>{earned.length
        ? t('Kazandığın bir madalyona dokun; kartını Instagram, WhatsApp ya da istediğin yerde paylaş.', 'Tap a medallion you earned and share its card on Instagram, WhatsApp or anywhere you like.')
        : t('Madalyon kazandığında kartını sosyal medyada paylaşabileceksin.', 'Once you earn a medallion you can share its card on social media.')}</Text>
    </View>

    {flags.tiered_medals && !!site.medal_tiers && <Tiers tiers={site.medal_tiers} onShare={setShared} />}

    {/* the visitor's own books */}
    <View style={s.divider} />
    <Text accessibilityRole="header" style={s.sectionTitle}>{t('Defterlerin', 'Your notebooks')}</Text>
    <View style={s.links}>
      <LinkRow icon="book-outline" label={t('Keşif Defterim', 'My Discovery Notebook')} note={t('İlgini çekenler, öğrendiklerin, gitmek istediklerin', 'What caught your eye, what you learned, where to go')} onPress={() => router.push('/defter')} />
      <LinkRow icon="images-outline" label={memories ? t(`Hatıra Defterim (${memories})`, `My Memory Book (${memories})`) : t('Hatıra Defterim', 'My Memory Book')} note={t('Eserlere eklediğin fotoğraf ve notlar', 'The photos and notes you added to works')} onPress={() => router.push('/hatira')} />
      {flags.question_follow && <QuestionsEntry />}
    </View>
    {!!favorites.length && <><SectionHeader title={t('Favoriler', 'Favourites')} />{favorites.map(i => <WorkCard key={i.slug} item={i} />)}</>}
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

/** A count in the site's large serif figures, its name in small spaced capitals under it. */
function BigStat({ value, label }: { value: string; label: string }) {
  return <View style={s.stat} accessible accessibilityLabel={`${Number(value)} ${label}`}>
    <Text style={s.statValue}>{value}</Text>
    <Text style={s.statLabel}>{label.toLocaleUpperCase(currentLang() === 'tr' ? 'tr-TR' : 'en')}</Text>
  </View>;
}

/** A row leading to one of the visitor's books: a gold-ringed icon, the name in serif and a line about it. */
function LinkRow({ icon, label, note, onPress, badge }: { icon: IconName; label: string; note: string; onPress: () => void; badge?: string }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}${badge ? `, ${badge}` : ''}. ${note}`}
    style={({ pressed }) => [s.linkRow, pressed && { opacity: 0.75 }]}>
    <View style={s.linkIcon}><Ionicons name={icon} size={20} color={colors.goldText} /></View>
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={s.linkLabel}>{label}</Text>
      <Text style={s.small} numberOfLines={2}>{note}</Text>
    </View>
    {!!badge && <Text style={s.badge}>{badge}</Text>}
    <Ionicons name="chevron-forward" size={18} color={colors.goldLine} />
  </Pressable>;
}

/** Only once something is followed: Sorularım is not a promise to everyone. */
function QuestionsEntry() {
  const { total, unread } = useQuestionCounts();
  if (!total) return null;
  return <LinkRow icon="chatbubble-ellipses-outline" label={t('Sorularım', 'My questions')} note={t('Eserlere sorduğun ve takip ettiğin sorular', 'The questions you asked works and follow')}
    badge={unread ? t(`${unread} yeni cevap`, `${unread} new`) : undefined} onPress={() => router.push('/sorularim')} />;
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

/** One coin on the shelf with its name and how far along it is. An earned one opens its shareable card; a locked one
 *  turns over to say what it asks for. */
function MedalTile({ m, onShare }: { m: Medal; onShare: (s: Shared) => void }) {
  const [open, setOpen] = useState(false);
  const done = m.value >= m.required;
  const shown = Math.min(m.value, m.required);
  const status = done ? `${metalName(m.metal)} · ${t('Kazanıldı', 'Earned')}` : `${t('Kilitli', 'Locked')} · ${shown} / ${m.required}`;
  const label = `${m.name}. ${m.description} ${status}.`;
  return <Pressable style={({ pressed }) => [s.medal, pressed && { opacity: 0.85 }]}
    onPress={() => done ? onShare({ kind: 'medal', name: m.name, description: m.description, metal: m.metal, id: m.id }) : setOpen(o => !o)}
    accessibilityRole="button" accessibilityState={done ? undefined : { expanded: open }}
    accessibilityLabel={done ? `${label} ${t('Paylaşmak için dokun.', 'Tap to share.')}` : label}>
    <Medallion metal={m.metal} earned={done} symbol={m.id} size={86} />
    <Text style={s.name} numberOfLines={2}>{m.name}</Text>
    <Text style={[s.status, done && s.statusWon]}>{done ? t('Kazanıldı', 'Earned') : `${shown} / ${m.required}`}{m.mobile ? ` · ${t('mobil', 'mobile')}` : ''}</Text>
    {open && !done && <Text style={s.medalNote}>{m.description}</Text>}
    {done && <View style={s.sharePill}><Ionicons name="share-social-outline" size={12} color={colors.onGold} /><Text style={s.sharePillText}>{t('PAYLAŞ', 'SHARE')}</Text></View>}
  </Pressable>;
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
    <Text accessibilityRole="header" style={s.sectionTitle}>{t('Kademeler', 'Tiers')}</Text>
    <View style={{ gap: space.s }}>{rows.map(r => {
      const status = r.metal ? metalName(r.metal) : t('Henüz başlamadı', 'Not started');
      const to = r.next ? t(`${r.value}/${r.next.at}, sıradaki ${metalName(r.next.metal)}`, `${r.value}/${r.next.at}, next ${metalName(r.next.metal)}`) : t(`${r.value}/${r.max}, son kademe`, `${r.value}/${r.max}, final tier`);
      const content = <View style={s.nextRow}>
        <Medallion metal={r.metal ?? r.next?.metal ?? 'bronze'} earned={!!r.metal} size={52} />
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
  page: { padding: space.m, gap: space.m, paddingBottom: space.xxl },
  head: { alignItems: 'center', gap: space.s, paddingTop: space.l, paddingHorizontal: space.s },
  headTitle: { fontFamily: serif, color: colors.ink, textAlign: 'center', fontSize: 44, lineHeight: 48, fontVariant: ['lining-nums'] },
  headAccent: { fontFamily: fonts.serifItalic, color: colors.goldText },
  lede: { color: colors.soft, textAlign: 'center', ...type.body, maxWidth: 320 },
  stats: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingVertical: space.m, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.ivoryLine },
  stat: { flex: 1, alignItems: 'center', gap: space.xs },
  statRule: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: colors.ivoryLine },
  statValue: { fontFamily: serif, color: colors.goldText, fontSize: 40, lineHeight: 44, fontVariant: ['lining-nums'] },
  statLabel: { color: colors.ink, textAlign: 'center', fontFamily: fonts.sansMedium, fontSize: 10, lineHeight: 14, letterSpacing: 1.2 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.s },
  profile: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  profileName: { fontFamily: serif, color: colors.ink, ...type.heading },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.ivoryLine, marginTop: space.l },
  sectionTitle: { fontFamily: serif, color: colors.ink, ...type.title, fontSize: 32, lineHeight: 36 },
  next: { padding: space.m },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  nextKicker: { color: colors.goldText, ...type.eyebrow, fontSize: 10, letterSpacing: 1.6 },
  left: { textAlign: 'left' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: space.l, paddingTop: space.s },
  medal: { width: '31.5%', alignItems: 'center', gap: space.xs, minHeight: hit },
  name: { ...type.body, fontFamily: serif, fontSize: 16, lineHeight: 19, color: colors.ink, textAlign: 'center' },
  status: { color: colors.soft, textAlign: 'center', ...type.caption, fontFamily: fonts.sansSemi, letterSpacing: 1 },
  statusWon: { color: colors.goldText },
  shareHint: { flexDirection: 'row', alignItems: 'center', gap: space.s, padding: space.s + space.xs, borderRadius: radius.m, backgroundColor: colors.paper, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.ivoryLine },
  sharePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space.s, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.goldSoft },
  sharePillText: { color: colors.onGold, fontFamily: fonts.sansSemi, fontSize: 9.5, letterSpacing: 1.2 },
  medalNote: { color: colors.soft, textAlign: 'center', ...type.caption },
  tierState: { color: colors.goldText, ...type.caption, fontFamily: fonts.sansSemi },
  small: { color: colors.soft, ...type.caption },
  book: { borderRadius: radius.s, ...shadow.card },
  paper: { padding: space.m, backgroundColor: stampBook.paper, borderBottomLeftRadius: radius.s, borderBottomRightRadius: radius.s,
    borderWidth: 1, borderTopWidth: 0, borderColor: stampBook.edge, borderRightWidth: 6, borderRightColor: stampBook.cover, gap: space.m },
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
  empty: { alignItems: 'center', gap: space.s, paddingVertical: space.l },
  emptyTitle: { fontFamily: serif, color: colors.emeraldLight, textAlign: 'center', fontSize: 30, lineHeight: 34 },
  emptyAccent: { fontFamily: fonts.serifItalic, color: colors.goldText },
  links: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.ivoryLine },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.m, minHeight: hit, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.ivoryLine },
  linkIcon: { width: hit, height: hit, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.goldLine, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper },
  linkLabel: { fontFamily: serif, color: colors.ink, ...type.heading, fontSize: 19 },
  badge: { color: colors.onGold, backgroundColor: colors.goldSoft, overflow: 'hidden', borderRadius: radius.pill, paddingHorizontal: space.s, paddingVertical: 2, ...type.caption, fontFamily: fonts.sansSemi },
});
