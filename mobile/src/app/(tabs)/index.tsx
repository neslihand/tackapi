import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams, usePathname } from 'expo-router';
import { Fragment, useMemo, useRef, useState, type ReactNode } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Agenda, AskPreferences, ForYou, LeadCard, Popular, Weekly } from '@/components/Discoveries';
import { Onboarding } from '@/components/Onboarding';
import { Text, TextInput } from '@/components/Typography';
import { Button, Choice, Empty, Eyebrow, Loading, Notice, SectionHeading, Title, WorkCard } from '@/components/UI';
import { useAccount } from '@/lib/account';
import { setConsent, useConsent } from '@/lib/analytics';
import { mediaUrl, type Item } from '@/lib/api';
import { t } from '@/lib/i18n';
import { dailyPicks, teaser } from '@/lib/daily';
import { emptyFilters, filterWorks, type Filters } from '@/lib/discovery';
import { catalogOrder, cityNameOf, homeOrder, leadFor, leadWork, preferenceTiers, routesFirst, type HomeBlock } from '@/lib/personal';
import { quizPool } from '@/lib/quiz';
import { dueCards } from '@/lib/recall';
import { rhythmLine } from '@/lib/rhythm';
import { useContent, useFlags, usePassport, useSettings } from '@/lib/store';
import { colors, serif, space } from '@/lib/theme';
import { usePreferences } from '@/lib/usePreferences';

export default function Explore() {
  const { items, seasons, quiz, site, loading, error, stale, reload } = useContent();
  const flags = useFlags();
  const { progress, ready: passportReady } = usePassport();
  const { settings, ready: settingsReady } = useSettings();
  const consent = useConsent();
  const [welcomed, setWelcomed] = useState(false);
  const params = useLocalSearchParams<{ city?: string; period?: string; season?: string }>();
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [view, setView] = useState<'list' | 'catalog'>('list');
  const list = useRef<FlatList<Item>>(null);
  const catalogY = useRef(0);
  // a link with a city, era or route sets those filters; the rest of what the visitor chose stays
  const [linked, setLinked] = useState('');
  const link = [params.city, params.period, params.season].join('|');
  if (link !== linked) {
    setLinked(link);
    setFilters(f => ({ ...f, city: params.city ?? '', period: params.period ?? '', season: params.season ?? '' }));
  }
  const change = (key: keyof Filters, value: string | boolean) => setFilters(f => ({ ...f, [key]: value }));
  const { prefs } = usePreferences();
  const account = useAccount();
  // what fits this person first, unless they are looking for something themselves
  const looking = Boolean(filters.query || filters.city || filters.period || filters.kind || filters.season || filters.favorites);
  const ordered = useMemo(() => looking ? items : catalogOrder(items, progress, prefs), [looking, items, progress, prefs]);
  const shown = useMemo(() => filterWorks(ordered, seasons, progress.favorites, filters), [ordered, seasons, progress.favorites, filters]);
  const today = useMemo(() => dailyPicks(items, progress, new Date(), 1, preferenceTiers(prefs))[0], [items, progress, prefs]);
  const pick = useMemo(() => leadWork(items, progress, prefs, today), [items, progress, prefs, today]);
  const lead = useMemo(() => leadFor(prefs, pick, cityNameOf(prefs.homeCity, items)), [prefs, pick, items]);
  const routes = useMemo(() => routesFirst(seasons, (r, city) => r.artifactIds.some(id => items.find(i => i.slug === id)?.city.slug === city), prefs), [seasons, items, prefs]);
  const rhythm = flags.flexible_streak ? settings.rhythm : 'daily';
  const line = rhythmLine(rhythm, progress.days);
  const due = useMemo(() => flags.spaced_repetition ? dueCards(quizPool(quiz, items), progress).length : 0, [flags.spaced_repetition, quiz, items, progress]);
  // the first screen is for someone new: a passport with stamps has already found its way. Keşfet also sits mounted
  // under a work opened from a shared link; that visitor reads the work first and meets this on the way back.
  const showing = usePathname() === '/';
  const welcome = showing && flags.onboarding_v2 && settingsReady && passportReady && !settings.onboarded && !welcomed && !Object.keys(progress.discovered).length;
  const selectedRoute = seasons.find(s => s.id === filters.season);
  const active = Object.entries(filters).filter(([key, value]) => key !== 'query' && Boolean(value)).length;
  const options = (key: 'city' | 'period' | 'kind'): [string, string][] => [...new Map(items.flatMap(i => key === 'kind' ? [[i.kind, i.kind_label] as const] : i[key] ? [[i[key]!.slug, i[key]!.name] as const] : []))];
  const catalog = () => list.current?.scrollToOffset({ offset: catalogY.current, animated: true });
  if (loading && !items.length) return <Loading />;
  if (error && !items.length) return <Empty title={t('Eserler açılamadı.', 'The works could not be opened.')} body={error} action={<Button label={t('Yeniden dene', 'Try again')} onPress={reload} icon="refresh" />} />;

  return <><FlatList ref={list} data={shown} keyExtractor={i => i.slug} contentContainerStyle={{ paddingBottom: space.xxl }}
    refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.gold} />}
    ListHeaderComponent={<>
      <View style={[s.hero, !!lead && s.heroShort]}>
        <Eyebrow light>N° 01  ───  {t('TARİHE AÇILAN KAPI', 'A DOOR TO HISTORY')}</Eyebrow>
        {lead ? <>
          {/* someone we know: the first thing they see is theirs, not the same welcome as everyone */}
          <Text accessibilityRole="header" style={s.shortTitle}>{t('Her kapı, bir hikâye.', 'Every door, a story.')}</Text>
          {!!account.user?.display_name && <Text style={s.hello}>{t(`Hoş geldin, ${account.user.display_name}.`, `Welcome, ${account.user.display_name}.`)}</Text>}
        </> : <>
          <Title light size={44}>{t('Her kapı,', 'Every door,')}</Title>
          <Text accessibilityRole="header" style={s.italic}>{t('bir hikâye.', 'a story.')}</Text>
          {!!account.user?.display_name && prefs.on && <Text style={s.hello}>{t(`Hoş geldin, ${account.user.display_name}.`, `Welcome, ${account.user.display_name}.`)}</Text>}
          <Text style={s.lede}>{t('Anadolu’nun mirasını kaynağıyla keşfet. Merakının götürdüğü kapıyı arala.', 'Discover Anatolia’s heritage through its sources. Open the door your curiosity leads you to.')}</Text>
          <Button kind="gold" label={t('Eserleri keşfet', 'Explore the works')} icon="arrow-down" onPress={catalog} />
        </>}
        <View style={[s.quickLinks, !!lead && s.quickShort]}>
          <Quick icon="map-outline" title={t('Harita', 'Map')} onPress={() => router.navigate('/yakin')} />
          <Quick icon="newspaper-outline" title={t('Okuma Odası', 'Reading Room')} onPress={() => router.push('/okuma')} />
          <Quick icon="extension-puzzle-outline" title={t('Oyna', 'Play')} onPress={() => router.navigate('/oyna')} />
        </View>
      </View>
      <View style={s.section}>
        {stale && <Notice icon="cloud-offline-outline">{t('Cihazdaki son koleksiyon gösteriliyor.', 'Showing the last collection saved on this device.')}</Notice>}
        {homeOrder(prefs).map(block => <Fragment key={block}>{({
          lead: lead && <LeadCard lead={lead} />,
          ask: <AskPreferences />,
          weekly: flags.weekly_discovery && <Weekly />,
          agenda: <Agenda />,
          today: today && <Pressable accessibilityRole="button" accessibilityLabel={`${t('Günün Eşiği', 'Today’s Threshold')}: ${today.name}`} onPress={() => router.push(`/eser/${today.slug}`)} style={s.today}>
            <View style={s.arch}>{mediaUrl(today.image?.src) && <Image source={mediaUrl(today.image?.src)} style={StyleSheet.absoluteFill} contentFit="cover" alt="" />}</View>
            <View style={{ flex: 1, gap: 8 }}><Eyebrow>{t('GÜNÜN EŞİĞİ', 'TODAY’S THRESHOLD')}</Eyebrow><Title size={27}>{today.name}</Title><Text numberOfLines={3} style={s.copy}>{teaser(today)}</Text></View>
          </Pressable>,
          status: <>
            {line && <View style={s.streak}><Ionicons name="footsteps-outline" size={22} color={colors.goldText} /><Text style={[s.copy, { flex: 1 }]}>{line}</Text></View>}
            {due > 0 && <Button kind="plain" icon="sync-outline" label={t(`Hatırla: bugün ${due} kartın var`, `Remember: ${due} ${due === 1 ? 'card' : 'cards'} today`)} onPress={() => router.push('/hatirla')} />}
            {consent === null && Object.keys(progress.discovered).length > 0 && <View style={s.consent}>
              <Text style={s.consentTitle}>{t('Keşfini birlikte geliştirelim mi?', 'Shall we improve your discovery together?')}</Text>
              <Text style={s.copy}>{t('İzin verirsen hangi eserlere baktığını ve nasıl keşfettiğini adın ve IP adresin olmadan kaydederiz. Konumun gönderilmez. Kararını Ayarlar’dan değiştirebilirsin.', 'With your permission we record which works you look at and how you explore them, without your name or IP address. Your location is never sent. You can change this in Settings.')}</Text>
              <View style={s.row}><Button kind="gold" label={t('İzin ver', 'Allow')} onPress={() => setConsent('granted')} /><Button kind="plain" label={t('Hayır, teşekkürler', 'No, thank you')} onPress={() => setConsent('denied')} /></View>
            </View>}
          </>,
          forYou: <ForYou skip={[today?.slug, pick?.item.slug]} />,
          routes: !!routes.length && <><SectionHeading title={t('Kendi izini bul.', 'Find your own trail.')} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>{routes.map(route => <Pressable key={route.id} accessibilityRole="button" onPress={() => router.push(`/rota/${route.id}`)} style={s.route}>
              <Eyebrow light>{route.id === site.featured_route ? t('ÖNE ÇIKAN ROTA', 'FEATURED ROUTE') : route.kicker}</Eyebrow><Title light size={26}>{route.title}</Title>
              <Text style={s.routeNote}>{route.artifactIds.filter(id => progress.discovered[id]).length}/{route.artifactIds.length} {t('durak mühürlendi', 'stops stamped')}</Text>
              <Ionicons name="arrow-forward" color={colors.goldSoft} size={22} />
            </Pressable>)}</ScrollView></>,
          popular: <Popular />,
          reading: <View style={s.reading}>
            <Eyebrow>✦ {t('OKUMA ODASI', 'READING ROOM')}</Eyebrow>
            <Title size={28}>{t('Şehirlerin hafızası, vakfın dili.', 'The memory of cities, the language of the waqf.')}</Title>
            <Text style={s.copy}>{t('Şehir tarihleri, vakıf eserleri üzerine yazılar ve terimler sözlüğü.', 'City histories, writing on foundation works and the glossary.')}</Text>
            <View style={s.row}>
              <Button style={{ flex: 1 }} icon="newspaper-outline" label={t('Makaleler', 'Articles')} onPress={() => router.push('/okuma')} />
              <Button style={{ flex: 1 }} kind="plain" icon="book-outline" label={t('Sözlük', 'Glossary')} onPress={() => router.push('/okuma?bolum=terimler')} />
            </View>
          </View>,
        } satisfies Record<HomeBlock, ReactNode>)[block]}</Fragment>)}
      </View>
      <View onLayout={e => { catalogY.current = e.nativeEvent.layout.y; }} style={s.catalog}>
        <SectionHeading index="02" title={t('Merakın nereye götürür?', 'Where will your curiosity lead?')} subtitle={t('Şehre, döneme, rotaya ya da eser türüne göre keşfet.', 'Explore by city, era, route or type of work.')} />
        <View style={s.search}><Ionicons name="search-outline" size={20} color={colors.goldText} /><TextInput style={s.input} value={filters.query} onChangeText={value => change('query', value)} placeholder={t('Bir eser veya şehir ara…', 'Search a work or city…')} placeholderTextColor={colors.soft} accessibilityLabel={t('Eserlerde ara', 'Search works')} returnKeyType="search" />
          {!!filters.query && <Pressable style={s.iconButton} accessibilityRole="button" accessibilityLabel={t('Aramayı temizle', 'Clear search')} onPress={() => change('query', '')}><Ionicons name="close" size={20} /></Pressable>}</View>
        <View style={s.row}><Button kind="plain" icon="options-outline" label={`${t('Filtreler', 'Filters')}${active ? ` (${active})` : ''}`} onPress={() => setFiltersOpen(!filtersOpen)} />
          <Choice label={t('Favorilerim', 'My favourites')} selected={filters.favorites} onPress={() => change('favorites', !filters.favorites)} /></View>
        {filtersOpen && <View style={s.filters}>
          {(['city', 'period', 'kind', 'season'] as const).map(key => <View key={key} style={{ gap: 8 }}><Eyebrow>{{ city: t('ŞEHİR', 'CITY'), period: t('DÖNEM', 'ERA'), kind: t('ESER TÜRÜ', 'TYPE'), season: t('ROTA', 'ROUTE') }[key]}</Eyebrow>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Choice label={t('Tümü', 'All')} selected={!filters[key]} onPress={() => change(key, '')} />
              {(key === 'season' ? seasons.map(r => [r.id, r.title]) : options(key)).map(([id, name]) => <Choice key={id} label={name} selected={filters[key] === id || filters[key] === name} onPress={() => change(key, id)} />)}
            </ScrollView></View>)}
          <Button label={t(`${shown.length} eseri göster`, `Show ${shown.length} works`)} onPress={() => setFiltersOpen(false)} />
        </View>}
        {!!active && <View style={s.row}>{(['city', 'period', 'kind', 'season'] as const).filter(k => filters[k]).map(key => <Choice key={key} selected label={`${(key === 'season' ? seasons.map(r => [r.id, r.title]) : options(key)).find(([id, name]) => id === filters[key] || name === filters[key])?.[1] ?? filters[key]} ×`} onPress={() => change(key, '')} />)}</View>}
        {(!!active || !!filters.query) && <Button kind="plain" label={t('Filtreleri temizle', 'Clear filters')} icon="close" onPress={() => setFilters({ ...emptyFilters })} />}
        {!looking && ordered !== items && <Pressable accessibilityRole="link" onPress={() => router.push('/tercihler')} style={{ minHeight: 32, justifyContent: 'center' }}><Text style={s.sorted}>{t('Sana göre sıralandı. Tercihlerimi değiştir', 'Arranged for you. Change my choices')}</Text></Pressable>}
        {selectedRoute && <Notice icon="trail-sign-outline">{selectedRoute.title} · {selectedRoute.description}</Notice>}
        <View style={[s.row, { justifyContent: 'space-between', marginTop: 12 }]}><Title size={30}>{shown.length} {t('eser', 'works')}</Title><View style={s.row}>
          <Choice label={t('Liste', 'List')} selected={view === 'list'} onPress={() => setView('list')} /><Choice label={t('Kartlar', 'Cards')} selected={view === 'catalog'} onPress={() => setView('catalog')} />
        </View></View>
      </View>
    </>}
    renderItem={({ item, index }) => <View style={{ paddingHorizontal: space.l }}><WorkCard item={item} variant={view} number={index + 1} stamped={progress.visits[item.slug] ? 'visit' : progress.discovered[item.slug] ? 'digital' : undefined} /></View>}
    ListEmptyComponent={<Empty title={t('Bu iz henüz koleksiyonda yok.', 'This trail is not in the collection yet.')} body={t('Başka bir kelime deneyebilir veya filtreleri kaldırabilirsin.', 'Try another word or clear the filters.')} action={<Button label={t('Tüm eserleri göster', 'Show every work')} onPress={() => setFilters({ ...emptyFilters })} />} />} />
    {welcome && <Onboarding work={today} onClose={() => setWelcomed(true)} />}
  </>;
}

function Quick({ icon, title, onPress }: { icon: 'map-outline' | 'newspaper-outline' | 'extension-puzzle-outline'; title: string; onPress: () => void }) {
  return <Pressable onPress={onPress} accessibilityRole="button" style={s.quick}><Ionicons name={icon} color={colors.goldSoft} size={21} /><Text style={s.quickText}>{title}</Text></Pressable>;
}
const s = StyleSheet.create({
  hero: { padding: 24, paddingTop: 32, paddingBottom: 28, backgroundColor: colors.emerald, gap: 12 },
  heroShort: { paddingTop: 20, paddingBottom: 10, gap: 8 },
  shortTitle: { fontFamily: serif, fontStyle: 'italic', fontSize: 28, lineHeight: 34, color: colors.goldSoft },
  quickShort: { marginTop: 6, paddingTop: 8 },
  hello: { color: colors.goldSoft, fontSize: 16, lineHeight: 22 },
  sorted: { color: colors.goldText, fontSize: 13, textDecorationLine: 'underline' },
  italic: { fontFamily: serif, fontStyle: 'italic', fontSize: 46, lineHeight: 52, color: colors.goldSoft, marginTop: -10 },
  lede: { fontSize: 15, lineHeight: 24, color: colors.lightMuted, marginBottom: 8 },
  quickLinks: { flexDirection: 'row', gap: 8, borderTopWidth: 1, borderColor: colors.darkLine, marginTop: 16, paddingTop: 16 },
  quick: { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 8, minHeight: 70 }, quickText: { color: colors.ivory, fontSize: 12, textAlign: 'center' },
  reading: { gap: 8, padding: 16, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.goldLine, borderRadius: 3 },
  consent: { gap: 12, padding: 16, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.goldLine, borderRadius: 3 }, consentTitle: { fontFamily: serif, fontSize: 22, color: colors.ink },
  section: { padding: 24, gap: 24 }, today: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  arch: { width: 108, height: 156, backgroundColor: colors.parchmentDeep, borderTopLeftRadius: 70, borderTopRightRadius: 70, overflow: 'hidden' },
  copy: { color: colors.soft, fontSize: 14, lineHeight: 22 }, streak: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, paddingVertical: 16 },
  route: { width: 252, padding: 22, backgroundColor: colors.emerald, gap: 12, borderRadius: 3 }, routeNote: { color: colors.lightMuted, fontSize: 12 },
  catalog: { padding: 24, gap: 16, backgroundColor: colors.paper, borderTopWidth: 1, borderColor: colors.line },
  search: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: colors.goldLine, gap: 10 },
  input: { flex: 1, minHeight: 54, fontFamily: serif, fontSize: 22, color: colors.ink }, iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }, filters: { gap: 20, paddingVertical: 16 },
});
