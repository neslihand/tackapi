// The work: the book's text and the two prepared tellings (story, child), read aloud on request; the photos with their
// sources; the passport stamps (digital, and on the spot when the phone is near); "Esere Sor".
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/Typography';
import { Contributions } from '@/components/Contributions';
import { AddMemory, MemoryCard } from '@/components/Journal';
import { MonumentDetails, PhotoGallery } from '@/components/MonumentDetails';
import { ThreeDetails } from '@/components/ThreeDetails';
import { NotebookChips } from '@/components/Notebook';
import { useAccount } from '@/lib/account';
import { track } from '@/lib/analytics';
import { modeForEvents, readingMode, type ReadingMode } from '@/lib/discovery';
import { ShareSheet, type Shared } from '@/components/ShareSheet';
import { Button, Empty, Eyebrow, Loading, Notice, Title } from '@/components/UI';
import { ApiError, loadMonument, makers, mediaUrl, sourceTitle, workLink, type Detail } from '@/lib/api';
import { openDirections, whereAmI } from '@/lib/geo';
import { t, useLang } from '@/lib/i18n';
import { useJournal } from '@/lib/journal';
import { dayKey, distanceM, formatDistance, stampRadius } from '@/lib/passport';
import { weekOf } from '@/lib/rhythm';
import { shareLink } from '@/lib/share';
import { speak, stopSpeaking } from '@/lib/speech';
import { spokenSeconds } from '@/lib/storyProgress';
import { useContent, useFlags, usePassport, useSettings } from '@/lib/store';
import { colors, serif, space } from '@/lib/theme';
import { useStoryReading } from '@/lib/useStoryReading';

export default function Work() {
  const { slug, dinle, ref: from, anlatim } = useLocalSearchParams<{ slug: string; dinle?: string; ref?: string; anlatim?: string }>();
  const { lang } = useLang();
  const { bySlug, items, site } = useContent();
  const { settings, change } = useSettings();
  const flags = useFlags();
  const passport = usePassport();
  const item = bySlug(slug);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const brief = flags.short_stories ? item?.summary?.trim() || null : null;
  // a tab chosen here stays selected even when this work lacks that telling: the visitor is told so instead of nothing happening
  // a link may ask for one (the first card on Keşfet promises a telling for children); it counts as chosen for this visit
  const [picked, setPicked] = useState<ReadingMode | null>(anlatim === 'child' || anlatim === 'text' || anlatim === 'story' || anlatim === 'brief' ? anlatim : null);
  const mode = picked ?? readingMode(settings.narration, site.default_mode, { brief, ...detail?.narrations });
  const text = !detail ? null : mode === 'brief' ? brief : mode === 'text' ? detail.text : detail.narrations[mode]?.answer ?? null;
  const [justRead, setJustRead] = useState(false);
  const [retry, setRetry] = useState(0);
  const [voiced, setVoiced] = useState<ReadingMode | null>(null);   // the telling being read aloud
  const [checking, setChecking] = useState(false);
  const [placeNote, setPlaceNote] = useState<string | null>(null);
  const [shared, setShared] = useState<Shared | null>(null);
  const [linkShown, setLinkShown] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const memories = useJournal().of(slug);
  const account = useAccount();
  const story = useStoryReading({ telling: `${slug}:${mode}`, text,
    onStart: () => track('heritage_story_started', slug, { mode: modeForEvents(mode) }),
    onDone: (ratio, surface) => {
      track('heritage_story_completed', slug, { mode: modeForEvents(mode), completion_ratio: Math.round(ratio * 100) / 100, surface }, `story:${slug}:${mode}:${weekOf(dayKey())}`);
      passport.discover(slug, surface === 'listen' ? 'listen_75' : 'read_75');
      passport.label(slug, 'learned', true);
      setJustRead(true);
    } });

  const showing = `${slug}|${lang}`;
  const [shown, setShown] = useState(showing);
  if (showing !== shown) { setShown(showing); setDetail(null); setError(null); setPicked(null); setJustRead(false); }
  useEffect(() => {
    let live = true;
    loadMonument(slug).then(r => { if (live) { setDetail(r.data); setStale(r.stale); } },
      e => { if (live) setError(e instanceof ApiError && e.status === 404 ? t('Bu eser yayında değil.', 'This work is not published.') : String(e?.message ?? e)); });
    return () => { live = false; };
  }, [slug, lang, retry]);
  useFocusEffect(useCallback(() => () => { stopSpeaking(); setVoiced(null); }, []));
  useEffect(() => () => stopSpeaking(), [mode]);
  useEffect(() => { track('monument_view', slug); }, [slug]);
  useEffect(() => { if (from === 'share') track('share_opened', slug, { surface: 'app', content_type: 'heritage_item' }); }, [slug, from]);
  const speaking = voiced === mode;
  function listenTo(telling: string) {
    setVoiced(mode);
    speak(telling, () => setVoiced(null), story.onListened);
  }
  // "Hikâye dinle" on the first screen: the visitor asked for the voice, so it starts by itself once
  const autoListen = useRef(dinle === '1');
  useEffect(() => {
    if (!autoListen.current || !text) return;
    autoListen.current = false;
    listenTo(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  if (error) return <Empty title={t('Eser açılamadı.', 'The work could not be opened.')} body={error} action={<Button label={t('Yeniden dene', 'Try again')} onPress={() => { setError(null); setRetry(n => n + 1); }} />} />;
  if (!detail) return <Loading />;

  const name = item?.name ?? (lang === 'en' ? detail.card?.name_en || detail.card?.name_tr : detail.card?.name_tr) ?? t('Eser', 'Work');
  const next = items.length > 1 ? items[(items.findIndex(i => i.slug === slug) + 1) % items.length] : undefined;
  const location = detail.location ?? item?.location ?? null;
  const visited = passport.progress.visits[slug];
  const discovered = passport.progress.discovered[slug];
  const favorite = passport.progress.favorites.includes(slug);
  const cover = detail.images[0] ?? item?.image;
  const where = item ? [item.neighborhood, item.district, item.city.name].filter(Boolean).join(', ') : [detail.card?.neighborhood, detail.card?.district, detail.card?.city].filter(Boolean).join(', ');
  const by = item && makers(item);

  function listen() {
    if (speaking) { stopSpeaking(); setVoiced(null); return; }
    if (text) listenTo(text);
  }

  async function shareWork() {
    setLinkShown(null);
    const place = [item?.district, item?.city.name].filter(Boolean).join(', ');
    const url = workLink(slug);
    setLinkShown(await shareLink(place ? `${name}, ${place}` : name, url).catch(() => url));
    track('share_initiated', slug, { content_type: 'heritage_item' });
  }

  async function stampHere() {
    if (!location) return;
    setChecking(true); setPlaceNote(null);
    try {
      const here = await whereAmI();
      const m = distanceM(here, location);
      if (m <= stampRadius(location)) passport.visit(slug, location.approximate);
      else setPlaceNote(t(`Esere ${formatDistance(m)} uzaktasın. Yerinde mühür için yanına gel (yaklaşık ${formatDistance(stampRadius(location))}).`,
        `You are ${formatDistance(m)} from the work. Come closer for the on-the-spot stamp (about ${formatDistance(stampRadius(location))}).`));
    } catch (e) { setPlaceNote(String((e as Error)?.message ?? e)); }
    finally { setChecking(false); }
  }

  const modes: [ReadingMode, string][] = [...(flags.short_stories ? [['brief', t('Kısa Özet', 'In Brief')] as [ReadingMode, string]] : []),
    ['story', t('Hikâyeleştirerek', 'As a Story')], ['child', t('Çocuklar İçin', 'For Children')], ['text', t('Detaylı Anlatım', 'In Detail')]];
  function choose(id: ReadingMode) {
    setVoiced(null);
    setPicked(id);
    change({ narration: id });
    track('narration_mode', slug, { mode: modeForEvents(id) });
  }
  return <ScrollView onScroll={story.onScroll} onLayout={story.onViewport} scrollEventThrottle={200} contentContainerStyle={{ paddingBottom: space.xl * 2 }}>
    <Stack.Screen options={{ title: name, headerRight: () => <Pressable onPress={() => passport.toggleFavorite(slug)} hitSlop={12} accessibilityRole="button"
      accessibilityLabel={favorite ? t('Favorilerden çıkar', 'Remove from favourites') : t('Favorilere ekle', 'Add to favourites')} accessibilityState={{ selected: favorite }}>
      <Ionicons name={favorite ? 'heart' : 'heart-outline'} size={22} color={colors.gold} /></Pressable> }} />
    {cover ? <Image source={mediaUrl(cover.src)} style={s.cover} contentFit="cover" transition={250} accessibilityLabel={cover.alt ?? name} />
      : <View style={[s.cover, s.coverEmpty]}><Ionicons name="business-outline" size={48} color={colors.goldLine} /></View>}

    <View style={s.section}>
      {item && <Eyebrow>{item.kind_label.toLocaleUpperCase('tr-TR')}{item.period ? ` · ${item.period.name.toLocaleUpperCase('tr-TR')}` : ''}</Eyebrow>}
      <Title size={40}>{name}</Title>
      {!!item?.summary && mode !== 'brief' && <Text style={[s.paragraph, { fontStyle: 'italic', color: colors.goldText }]}>{item.summary}</Text>}
      {item && !!item.alt_names.length && <Text style={s.muted}>{item.alt_names.join(' · ')}</Text>}
      <View style={s.facts}>
        {!!where && <Fact icon="location-outline" text={where} />}
        {!!item?.built.label && <Fact icon="calendar-outline" text={item.built.label} />}
        {!!item?.built.basis_label && <Text style={s.small}>{item.built.basis_label}</Text>}
        {!!by && <Fact icon="construct-outline" text={by} />}
      </View>
      {stale && <Notice icon="cloud-offline-outline">{t('Çevrimdışısın: bu eserin cihazda saklanan hâli gösteriliyor.', 'You are offline: the copy of this work kept on the device is shown.')}</Notice>}
    </View>

    <View style={[s.section, s.stamps]}>
      <Eyebrow>✦ {t('MİRAS PASAPORTU', 'HERITAGE PASSPORT')}</Eyebrow>
      <Button kind={discovered ? 'plain' : 'dark'} icon={discovered ? 'checkmark-circle' : 'bookmark-outline'} onPress={() => passport.discover(slug, 'manual')} disabled={Boolean(discovered)}
        label={discovered ? t('Pasaportunda mühürlü', 'Stamped in your passport') : t('Pasaportuma mühürle', 'Stamp my passport')} />
      {location ? <>
        <Button kind={visited ? 'plain' : 'gold'} icon="ribbon" onPress={stampHere} busy={checking} disabled={Boolean(visited)}
          label={visited ? t('Yerinde mühürlendi', 'Stamped on the spot') : t('Yerinde mühürle', 'Stamp on the spot')} />
        {placeNote && <Notice icon="navigate-outline">{placeNote}</Notice>}
        <Button kind="plain" icon="map-outline" label={t('Yol tarifi al', 'Get directions')} onPress={() => openDirections(location.lat, location.lon, name)} />
        {location.approximate && <Text style={s.small}>{t('Konum otomatik bulundu ve henüz doğrulanmadı; yaklaşık bir alanı gösterir.', 'The location was found automatically and is not yet verified; it marks an approximate area.')}</Text>}
      </> : <Text style={s.small}>{t('Bu eserin konumu henüz yok; yerinde mühür açılmaz.', 'This work has no location yet, so there is no on-the-spot stamp.')}</Text>}
      {discovered && <Button kind="plain" icon="share-social-outline" label={t('Mührünü paylaş', 'Share your stamp')}
        onPress={() => setShared({ kind: 'stamp', name, place: [item?.district, item?.city.name].filter(Boolean).join(', '), onSpot: Boolean(visited),
          date: new Date(visited?.date ?? discovered).toLocaleDateString(), photo: cover?.reusable ? mediaUrl(cover.src) : null })} />}
      <Button kind="plain" icon="link-outline" label={t('Bu eseri paylaş', 'Share this work')} onPress={shareWork} />
      {linkShown && <Notice icon="link-outline"><Text selectable>{linkShown}</Text></Notice>}
    </View>
    <ShareSheet shared={shared} onClose={() => setShared(null)} />
    <View style={s.section}><NotebookChips slug={slug} /></View>
    {flags.three_details && !!detail.details?.length && <View style={s.section}><ThreeDetails key={slug} slug={slug} details={detail.details} /></View>}

    <View onLayout={story.onSection} style={[s.section, mode === 'story' && s.story, mode === 'child' && s.child]}>
      <Eyebrow>{mode === 'brief' ? `${t('KISA ÖZET', 'IN BRIEF')}${text ? ` · ${t(`YAKLAŞIK ${spokenSeconds(text)} SANİYE`, `ABOUT ${spokenSeconds(text)} SECONDS`)}` : ''}` : mode === 'story' ? t('BİR KAPININ HİKÂYESİ', 'THE STORY OF A DOOR') : mode === 'child' ? t('KÜÇÜK KÂŞİFLER İÇİN', 'FOR LITTLE EXPLORERS') : t('KİTAPTAKİ METİN', 'FROM THE BOOK')}</Eyebrow>
      <View style={s.modes} accessibilityRole="tablist">
        {modes.map(([id, label]) => <Pressable key={id} onPress={() => choose(id)} accessibilityRole="tab" accessibilityState={{ selected: mode === id }} style={[s.mode, mode === id && s.modeOn]}>
          <Text style={[s.modeText, mode === id && { color: colors.goldSoft }]}>{label}</Text></Pressable>)}
      </View>
      {text ? <>
        <Button kind="plain" icon={speaking ? 'stop-circle-outline' : 'volume-high-outline'} onPress={listen}
          label={speaking ? t('Dinlemeyi durdur', 'Stop listening') : t('Sesli rehberle dinle', 'Listen with the audio guide')} />
        {mode === 'text' && detail.text_note && <Text style={s.small}>{detail.text_note}</Text>}
        {mode === 'brief' && <Text style={s.small}>{t('Bu özet kitaptaki bilgilerden derlendi. Kaynak:', 'This summary was compiled from the book. Source:')} {item ? sourceTitle(item.source) : detail.source.book}</Text>}
        {(mode === 'story' || mode === 'child') && <Text style={s.small}>{t('Bu anlatım kitaptaki bilgilere dayanarak yapay zekâyla hazırlandı; hikâyedeki atmosfer yaratıcı anlatımdır.', 'This telling was prepared with AI from the book’s information; the atmosphere of the story is creative narration.')}</Text>}
        <View key={`${slug}:${mode}`} onLayout={story.onBlock} style={{ gap: space.m }}>
          {text.split(/\n{2,}|\n/).filter(p => p.trim()).map((p, i) => <View key={i} style={{ gap: 8 }}>{mode === 'story' && <Text style={s.chapter}>{String(i + 1).padStart(2, '0')}</Text>}<Text style={[s.paragraph, mode === 'child' && { fontSize: 23, lineHeight: 34 }]}>{p.trim()}</Text></View>)}
        </View>
        {(mode === 'story' || mode === 'child') && !!detail.narrations[mode]?.sources.length && <View style={s.sources}><Eyebrow>{t('BU ANLATIMIN KAYNAKLARI', 'SOURCES FOR THIS TELLING')}</Eyebrow>{detail.narrations[mode]!.sources.map((source, i) => <Text key={i} style={s.small}>{[source.book, source.pages, source.heading].filter(Boolean).join(' · ')}</Text>)}</View>}
      </> : <Notice>{mode === 'brief' ? t('Bu eser için kısa özet henüz hazırlanmadı. Başka bir anlatımı okuyabilir ya da esere soru sorabilirsin.', 'A short summary has not been prepared for this work yet. You can read another telling or ask the work a question.')
        : t('Bu anlatım henüz hazırlanmadı. Detaylı anlatımı okuyabilir ya da esere soru sorabilirsin.', 'This telling is not ready yet. You can read the detailed text or ask the work a question.')}</Notice>}
      {justRead && <View style={s.sealed} accessibilityLiveRegion="polite">
        <Eyebrow>✦ {t('DİJİTAL KEŞİF MÜHRÜ', 'DIGITAL DISCOVERY STAMP')}</Eyebrow>
        <Title size={26}>{t('Bu hikâye artık senin.', 'This story is yours now.')}</Title>
        <Text style={s.muted}>{t('Pasaportuna mühürlendi ve defterine “Öğrendim” olarak yazıldı. Bu mühür okuduğunu gösterir; yerinde ziyaret mührü ancak eserin önünde basılır.', 'It is stamped in your passport and marked “Learned” in your notebook. This stamp shows you read it; the on-the-spot stamp can only be taken in front of the work.')}</Text>
        <Button icon="book-outline" label={t('Keşif Defterimi aç', 'Open my notebook')} onPress={() => router.push('/defter')} />
        {!account.user && <Button kind="plain" icon="person-circle-outline" label={t('Pasaportunu cihazlar arasında korumak ister misin?', 'Want to keep your passport across devices?')} onPress={() => router.push('/giris')} />}
      </View>}
      <Button icon="chatbubbles-outline" label={t('Esere Sor', 'Ask the Work')} onPress={() => router.push(`/sor/${slug}`)} />
    </View>

    <View style={s.section}><PhotoGallery images={detail.images} title={t('FOTOĞRAFLAR', 'PHOTOGRAPHS')} />
      <MonumentDetails detail={detail} name={name} slug={slug} />
    </View>

    <View style={s.section}>
      <Eyebrow>✦ {t('HATIRA DEFTERİM', 'MY MEMORY BOOK')}</Eyebrow>
      {memories.length ? memories.map(m => <MemoryCard key={m.id} m={m} />)
        : <Text style={s.small}>{t('Bu esere kendi fotoğrafını ve notunu ekle; yalnızca bu telefonda kalır.', 'Add your own photo and note to this work; it stays on this phone only.')}</Text>}
      <Button kind="plain" icon="add-circle-outline" label={t('Hatıra ekle', 'Add a memory')} onPress={() => setAdding(true)} />
    </View>
    <AddMemory slug={slug} name={name} onSpot={Boolean(visited)} visible={adding} onClose={() => setAdding(false)} />

    <View style={s.section}>
      <Eyebrow>{t('KAYNAK', 'SOURCE')}</Eyebrow>
      <Text style={s.muted}>{item ? sourceTitle(item.source) : detail.source.book}</Text>
      {!!detail.source.credits?.authors?.length && <Text style={s.small}>{t('Yazarlar', 'Authors')}: {detail.source.credits.authors.join(', ')}</Text>}
      {!!detail.source.credits?.editor && <Text style={s.small}>{t('Editör', 'Editor')}: {detail.source.credits.editor}</Text>}
    </View>
    <View style={s.section}><Contributions slug={slug} name={name} /></View>
    {next && next.slug !== slug && <View style={s.section}><Eyebrow>{t('SIRADAKİ KAPI', 'THE NEXT DOOR')}</Eyebrow><Title>{next.name}</Title><Button icon="arrow-forward" label={t('Hikâyeyi keşfet', 'Explore the story')} onPress={() => router.push(`/eser/${next.slug}`)} /></View>}
  </ScrollView>;
}

function Fact({ icon, text }: { icon: 'location-outline' | 'calendar-outline' | 'construct-outline'; text: string }) {
  return <View style={s.fact}><Ionicons name={icon} size={16} color={colors.goldText} /><Text style={s.factText}>{text}</Text></View>;
}

const s = StyleSheet.create({
  story: { marginTop: 32, backgroundColor: '#E8E0D0', paddingBottom: 32 },
  child: { marginTop: 32, backgroundColor: colors.paper, paddingBottom: 32, borderTopWidth: 2, borderColor: colors.gold },
  chapter: { fontFamily: serif, fontStyle: 'italic', color: colors.goldText, fontSize: 36 },
  sources: { borderTopWidth: 1, borderColor: colors.goldLine, paddingTop: 16, gap: 8 },
  sealed: { padding: space.m, gap: space.s, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.goldLine, borderRadius: 3 },
  cover: { width: '100%', height: 360, backgroundColor: colors.parchmentDeep },
  coverEmpty: { alignItems: 'center', justifyContent: 'center' },
  section: { paddingHorizontal: space.l, paddingTop: space.xl, gap: space.m },
  stamps: { marginHorizontal: space.m, marginTop: space.l, paddingBottom: space.m, borderRadius: 16, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, paddingTop: space.m },
  facts: { gap: 6, marginVertical: space.xs },
  fact: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  factText: { color: colors.ink, fontSize: 14, flex: 1 },
  muted: { color: colors.soft, fontSize: 14, lineHeight: 20 },
  small: { color: colors.soft, fontSize: 12, lineHeight: 17 },
  modes: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  mode: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.goldLine },
  modeOn: { backgroundColor: colors.emerald },
  modeText: { color: colors.ink, fontSize: 13 },
  paragraph: { fontFamily: serif, color: colors.ink, fontSize: 22, lineHeight: 33 },
  photo: { width: 240, height: 170, borderRadius: 12, backgroundColor: colors.parchmentDeep, marginBottom: 4 },
});
