// Keşfet's optional parts: the panel's notices and what the server suggests. They load on their own and quietly stay away
// when the server has nothing or cannot be reached: the collection never waits for them.
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Typography';
import { Button, Eyebrow, Title } from './UI';
import { useAccount } from '@/lib/account';
import { analyticsSession, track, useConsent } from '@/lib/analytics';
import { mediaUrl, request, type Item } from '@/lib/api';
import { currentLang, t, useLang } from '@/lib/i18n';
import { discoveryProfile, suggestFor, type Lead } from '@/lib/personal';
import { useContent, usePassport, useSettings } from '@/lib/store';
import { usePreferences } from '@/lib/usePreferences';
import { capitalizeReason, openableWorks, pickForYou, pickPopular, type Announcement, type ForYou as ForYouList, type Popular as PopularWork, type WeeklyDiscovery } from '@/lib/suggestions';
import { colors, serif, space } from '@/lib/theme';

const LIMIT = 4;

/** "Haftanın Keşfi": one work, one detail and perhaps a route, chosen by an editor for this week. No week's entry, no card;
 *  nothing is lost by missing it. */
export function Weekly() {
  const { bySlug, seasons } = useContent();
  const { settings } = useSettings();
  const [week, setWeek] = useState<WeeklyDiscovery | null>(null);
  useEffect(() => {
    let live = true;
    request<WeeklyDiscovery>('/api/weekly').then(r => { if (live) setWeek(r); }, () => {});
    return () => { live = false; };
  }, [settings.server]);
  const item = week?.available ? bySlug(week.slug) : undefined;
  if (!week?.available || !item) return null;
  const route = seasons.find(r => r.id === week.route);
  const photo = mediaUrl(item.image?.thumb);
  return <View style={s.week}>
    <Eyebrow>✦ {t('HAFTANIN KEŞFİ', 'DISCOVERY OF THE WEEK')}</Eyebrow>
    {!!photo && <Image source={photo} alt="" contentFit="cover" style={s.weekPhoto} accessibilityIgnoresInvertColors />}
    <Text style={s.noticeTitle} accessibilityRole="header">{item.name}</Text>
    <Text style={s.weekHook}>{week.hook}</Text>
    <Text style={s.noticeBody}>{t('Bu hafta bak', 'Look for this')}: {week.detail}</Text>
    <Text style={s.tileNote}>{t('Kaynak', 'Source')}: {week.source}</Text>
    <Button icon="book-outline" label={t('Hikâyeyi oku', 'Read the story')} onPress={() => { track('recommendation_click', item.slug, { list: 'weekly', week: week.week }); router.push(`/eser/${item.slug}`); }} />
    {route && <Button kind="plain" icon="walk-outline" label={t(`Rota: ${route.title}`, `Route: ${route.title}`)} onPress={() => { track('recommendation_click', item.slug, { list: 'weekly_route', week: week.week }); router.push(`/rota/${route.id}`); }} />}
  </View>;
}

/** "Gündem": notices published in the panel while their dates last. Nothing is drawn when there are none. */
export function Agenda() {
  const { bySlug } = useContent();
  const { settings } = useSettings();
  const [notices, setNotices] = useState<Announcement[]>([]);
  useEffect(() => {
    let live = true;
    request<Announcement[]>('/api/announcements?pilot=true').then(r => { if (live) setNotices(r); }, () => {});
    return () => { live = false; };
  }, [settings.server]);
  if (!notices.length) return null;
  return <>{notices.map(a => <View key={a.id} style={s.notice}>
    <Eyebrow>✦ {t('GÜNDEM', 'AGENDA')}</Eyebrow>
    <Text style={s.noticeTitle} accessibilityRole="header">{a.title}</Text>
    <Text style={s.noticeBody}>{a.body}</Text>
    {openableWorks(a, slug => Boolean(bySlug(slug))).map(slug => <Pressable key={slug} accessibilityRole="link" style={s.noticeLink}
      onPress={() => { track('recommendation_click', slug, { list: 'agenda', announcement: a.id }); router.push(`/eser/${slug}`); }}>
      <Text style={s.noticeLinkText}>{bySlug(slug)!.name}</Text><Ionicons name="arrow-forward" size={15} color={colors.goldText} />
    </Pressable>)}
  </View>)}</>;
}

/** The first card on Keşfet: one thing to do now, the way this person likes it. */
export function LeadCard({ lead }: { lead: Lead }) {
  return <View style={s.lead}>
    <View style={s.leadHead}><Ionicons name={lead.icon} size={22} color={colors.gold} /><Eyebrow light>✦ {lead.kicker}</Eyebrow></View>
    <Title light size={28}>{lead.title}</Title>
    <Text style={s.leadBody}>{lead.body}</Text>
    <Button kind="gold" icon="arrow-forward" label={lead.cta} onPress={() => { track('recommendation_click', undefined, { list: 'lead', source: 'device' }); router.push(lead.href as never); }} />
    <Pressable accessibilityRole="link" onPress={() => router.push('/tercihler')} style={s.leadLink}><Text style={s.leadLinkText}>{t('Tercihlerimi değiştir', 'Change my choices')}</Text></Pressable>
  </View>;
}

/** Asked once, after the first screen and never on it: the first visit needs no answers (master plan M01). */
export function AskPreferences() {
  const { settings, change } = useSettings();
  const { prefs } = usePreferences();
  if (settings.personalAsked || !settings.onboarded || prefs.homeCity || prefs.interests.length) return null;
  return <View style={s.notice}>
    <Eyebrow>✦ {t('SANA GÖRE', 'FOR YOU')}</Eyebrow>
    <Text style={s.noticeTitle} accessibilityRole="header">{t('Keşfet senin gibi olsun mu?', 'Shall Explore be more like you?')}</Text>
    <Text style={s.noticeBody}>{t('Şehrini ve ilgi alanlarını seçersen öneriler, harita ve Günün Eşiği ona göre gelir. Yalnızca bu telefonda kalır.', 'Choose your city and interests, and suggestions, the map and Today’s Threshold will follow them. It stays on this phone only.')}</Text>
    <View style={{ flexDirection: 'row', gap: space.s }}>
      <Button style={{ flex: 1 }} icon="options-outline" label={t('Seçeyim', 'Choose')} onPress={() => { change({ personalAsked: true }); router.push('/tercihler'); }} />
      <Button style={{ flex: 1 }} kind="plain" label={t('Şimdi değil', 'Not now')} onPress={() => change({ personalAsked: true })} />
    </View>
  </View>;
}

/** "Senin için": what this phone can say from the visitor's own choices and reading, each with its reason, needing no account or
 *  permission. The server's suggestions fill the rest, and only when they really are personal. */
export function ForYou({ skip = [] }: { skip?: readonly (string | undefined)[] }) {
  const { items, bySlug } = useContent();
  const { progress } = usePassport();
  const { settings } = useSettings();
  const { prefs, narration } = usePreferences();
  const account = useAccount();
  const consent = useConsent();
  const [mine, setMine] = useState<ForYouList | null>(null);
  // another account must not see the previous one's suggestions, not even for a moment
  const who = account.user?.id ?? null;
  const [shownFor, setShownFor] = useState(who);
  if (who !== shownFor) { setShownFor(who); setMine(null); }
  useEffect(() => {
    if (!account.ready || !prefs.on) return;
    let live = true;
    const sid = analyticsSession();
    request<ForYouList>(`/api/recommendations?limit=${LIMIT}${sid ? `&session_id=${sid}` : ''}`).then(r => { if (live) setMine(r); }, () => {});
    return () => { live = false; };
  }, [account.ready, who, consent, settings.server, prefs.on]);
  const skipped = skip.join();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const local = useMemo(() => suggestFor(items, progress, prefs, LIMIT, skip), [items, progress, prefs, skipped]);
  if (!prefs.on) return null;
  const known = new Set(local.map(r => r.item.slug));
  const server = pickForYou(mine, slug => Boolean(bySlug(slug)) && !skip.includes(slug) && !known.has(slug) && !progress.discovered[slug]).slice(0, LIMIT - local.length);
  const profile = discoveryProfile(prefs, narration, progress);
  const label = profile?.name ?? mine?.segments[0]?.name;
  return <View style={{ gap: space.s }}>
    {(local.length > 0 || server.length > 0) && <>
      <Eyebrow>{t('SENİN İÇİN', 'FOR YOU')}</Eyebrow>
      <Title size={26}>{t('Keşfine göre sıradaki kapılar', 'Next doors for your discovery')}</Title>
      {!!label && <Pressable accessibilityRole="link" onPress={() => router.push('/tercihler')} style={{ minHeight: 28, justifyContent: 'center' }}><Text style={s.segment}>{label}</Text></Pressable>}
      {local.map((r, i) => <Tile key={r.item.slug} item={r.item} note={r.reason} onOpen={() => track('recommendation_click', r.item.slug, { list: 'for_you', source: 'device', rank: i + 1 })} />)}
      {server.map((r, i) => <Tile key={r.slug} item={bySlug(r.slug)!} note={r.reason && currentLang() === 'tr' ? capitalizeReason(r.reason) : t('Önerilen', 'Recommended')}
        onOpen={() => track('recommendation_click', r.slug, { list: 'for_you', source: 'server', rank: local.length + i + 1 })} />)}
    </>}
    {prefs.interests.includes('photography') && <Button kind="plain" icon="camera-outline" label={t('Fotoğrafını çek, eseri tanıyalım', 'Take a photo and we will recognise the work')} onPress={() => router.navigate('/kamera')} />}
  </View>;
}

/** "En çok merak edilenler", from the last seven days. Nothing is drawn when the server has nothing or cannot be reached. */
export function Popular() {
  const { bySlug } = useContent();
  const { settings } = useSettings();
  const { lang } = useLang();
  const [popular, setPopular] = useState<PopularWork[]>([]);
  useEffect(() => {
    let live = true;
    request<PopularWork[]>(`/api/popular?limit=${LIMIT}`).then(r => { if (live) setPopular(r); }, () => {});
    return () => { live = false; };
  }, [settings.server]);
  const trending = pickPopular(popular, slug => Boolean(bySlug(slug)));
  if (!trending.length) return null;
  const locale = lang === 'en' ? 'en-GB' : 'tr-TR';
  return <View style={{ gap: space.s }}>
    <Eyebrow>{t('EN ÇOK MERAK EDİLENLER', 'MOST WONDERED ABOUT')}</Eyebrow>
    <Title size={26}>{t('Bu hafta en çok bakılanlar', 'Most viewed this week')}</Title>
    {trending.map((p, i) => <Tile key={p.slug} item={bySlug(p.slug)!} rank={i + 1} note={t(`${p.visitors.toLocaleString(locale)} ziyaretçi baktı`, `${p.visitors.toLocaleString(locale)} visitors looked`)}
      onOpen={() => track('recommendation_click', p.slug, { list: 'popular', rank: i + 1 })} />)}
  </View>;
}

function Tile({ item, note, rank, onOpen }: { item: Item; note: string; rank?: number; onOpen: () => void }) {
  const photo = mediaUrl(item.image?.thumb);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${rank ? `${rank}. ` : ''}${item.name}, ${item.city.name}. ${note}`} style={({ pressed }) => [s.tile, pressed && { opacity: .85 }]}
    onPress={() => { onOpen(); router.push(`/eser/${item.slug}`); }}>
    <View style={s.tileArt}>{!!photo && <Image source={photo} alt="" contentFit="cover" style={StyleSheet.absoluteFill} accessibilityIgnoresInvertColors />}</View>
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={s.tileCity}>{rank ? `${rank}. · ` : ''}{item.city.name.toLocaleUpperCase('tr-TR')}</Text>
      <Text style={s.tileName} numberOfLines={2}>{item.name}</Text>
      <Text style={s.tileNote} numberOfLines={2}>{note}</Text>
    </View>
    <Ionicons name="arrow-forward" size={16} color={colors.goldLine} />
  </Pressable>;
}

const s = StyleSheet.create({
  lead: { gap: space.s, padding: space.l, borderRadius: 16, backgroundColor: colors.emerald, borderWidth: 1, borderColor: colors.goldLine },
  leadHead: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  leadBody: { color: colors.lightMuted, fontSize: 15, lineHeight: 22 },
  leadLink: { minHeight: 36, justifyContent: 'center', alignSelf: 'center' },
  leadLinkText: { color: colors.goldSoft, fontSize: 13, textDecorationLine: 'underline' },
  week: { gap: space.s, padding: space.m, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.goldLine, borderRadius: 16 },
  weekPhoto: { width: '100%', aspectRatio: 16 / 9, borderRadius: 10, backgroundColor: colors.parchmentDeep },
  weekHook: { fontFamily: serif, fontStyle: 'italic', fontSize: 19, lineHeight: 25, color: colors.goldText },
  notice: { gap: 6, padding: 16, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.gold, borderLeftWidth: 3, borderRadius: 3 },
  noticeTitle: { fontFamily: serif, fontSize: 22, lineHeight: 27, color: colors.ink },
  noticeBody: { color: colors.soft, fontSize: 14, lineHeight: 21 },
  noticeLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s, minHeight: 44, borderTopWidth: 1, borderTopColor: colors.line },
  noticeLinkText: { flex: 1, fontFamily: serif, fontSize: 17, color: colors.ink },
  segment: { color: colors.goldText, fontSize: 13 },
  tile: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, borderRadius: 12, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  tileArt: { width: 68, height: 68, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.parchmentDeep },
  tileCity: { color: colors.goldText, fontSize: 10.5, letterSpacing: 1.2, fontWeight: '600' },
  tileName: { fontFamily: serif, fontSize: 18, lineHeight: 22, color: colors.ink },
  tileNote: { color: colors.soft, fontSize: 12, lineHeight: 17 },
});
