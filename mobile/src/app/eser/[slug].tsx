// The work: the short summary, the two prepared tellings (story, child) and the book's text, read aloud on request; the
// passport stamps (digital once the story is really read or heard, and on the spot when the phone is near); the
// visitor's notebook labels, the three details and the photos with their sources; "Esere Sor".
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CoverImage } from '@/components/brand/CoverImage';
import { NightGlow } from '@/components/brand/Gradient';
import { Contributions } from '@/components/Contributions';
import { Chip, SegmentedControl } from '@/components/Controls';
import { AddMemory, MemoryCard } from '@/components/Journal';
import { ACTION_BAR_HEIGHT, HorizontalRail, SectionHeader, StickyActionBar, type BarAction } from '@/components/Layout';
import { MonumentDetails, PhotoGallery } from '@/components/MonumentDetails';
import { NotebookChips } from '@/components/Notebook';
import { ShareSheet, type Shared } from '@/components/ShareSheet';
import { ThreeDetails } from '@/components/ThreeDetails';
import { Button, Empty, Eyebrow, Loading, Notice, Title, type IconName } from '@/components/UI';
import { WorkTile } from '@/components/WorkTile';
import { useAccount } from '@/lib/account';
import { track } from '@/lib/analytics';
import { ApiError, loadMonument, makers, mediaUrl, sourceTitle, workLink, type Detail } from '@/lib/api';
import { modeForEvents, readingMode, type ReadingMode } from '@/lib/discovery';
import { hasLocationPermission, openDirections, whereAmI } from '@/lib/geo';
import { t, useLang } from '@/lib/i18n';
import { useJournal } from '@/lib/journal';
import { usePop } from '@/lib/motion';
import { dayKey, distanceM, formatDistance, stampRadius } from '@/lib/passport';
import { rememberOpened } from '@/lib/recent';
import { weekOf } from '@/lib/rhythm';
import { shareLink } from '@/lib/share';
import { speak, stopSpeaking } from '@/lib/speech';
import { spokenSeconds } from '@/lib/storyProgress';
import { useContent, useFlags, usePassport, useSettings } from '@/lib/store';
import { colors, fonts, hit, measure, radius, serif, space, type } from '@/lib/theme';
import { useStoryReading } from '@/lib/useStoryReading';
import { sameCity } from '@/lib/work';

const MODES: ReadingMode[] = ['brief', 'story', 'child', 'text'];

export default function Work() {
  const { slug, dinle, ref: from, anlatim } = useLocalSearchParams<{ slug: string; dinle?: string; ref?: string; anlatim?: string }>();
  const { lang } = useLang();
  const { items, bySlug, site } = useContent();
  const { settings, change } = useSettings();
  const flags = useFlags();
  const passport = usePassport();
  const account = useAccount();
  const insets = useSafeAreaInsets();
  const item = bySlug(slug);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const brief = flags.short_stories ? item?.summary?.trim() || null : null;
  // a link may ask for a telling (Bugün's first card promises one for children); it counts as chosen for this visit
  const [picked, setPicked] = useState<ReadingMode | null>(MODES.includes(anlatim as ReadingMode) ? anlatim as ReadingMode : null);
  const mode = picked ?? readingMode(settings.narration, site.default_mode, { brief, ...detail?.narrations });
  const textOf = (m: ReadingMode) => !detail ? null : m === 'brief' ? brief : m === 'text' ? detail.text?.trim() || null : detail.narrations[m]?.answer?.trim() || null;
  const text = textOf(mode);
  const [voiced, setVoiced] = useState<ReadingMode | null>(null);   // the telling being read aloud
  const [justRead, setJustRead] = useState(false);
  const [checking, setChecking] = useState(false);
  // whether the phone stands by the work, for the location it was measured for
  const [nearAt, setNearAt] = useState<{ at: string; near: boolean } | null>(null);
  const [placeNote, setPlaceNote] = useState<string | null>(null);
  const [shared, setShared] = useState<Shared | null>(null);
  const [linkShown, setLinkShown] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const memories = useJournal().of(slug);
  // the digital stamp comes from reading or hearing three quarters of a telling, never from opening the page
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
  }, [slug, lang, attempt]);
  useEffect(() => { rememberOpened(slug).catch(() => {}); }, [slug]); // Bugün's "Devam et"
  useFocusEffect(useCallback(() => () => { stopSpeaking(); setVoiced(null); }, []));
  useEffect(() => () => stopSpeaking(), [mode]);
  useEffect(() => { track('monument_view', slug); }, [slug]);
  useEffect(() => { if (from === 'share') track('share_opened', slug, { surface: 'app', content_type: 'heritage_item' }); }, [slug, from]);

  const location = detail?.location ?? item?.location ?? null;
  const visited = passport.progress.visits[slug];
  const discovered = passport.progress.discovered[slug];
  // the stamp button and the status chip pop when a stamp lands (digital or on the spot)
  const stampKind = visited ? 'visit' : discovered ? 'digital' : 'none';
  const statusPop = usePop(stampKind);
  // Only when the permission is already given: the dialog opens when the stamp button is pressed, never on opening.
  const spot = location && !visited ? `${location.lat},${location.lon}` : null;
  const near = Boolean(spot && nearAt?.at === spot && nearAt.near);
  useEffect(() => {
    if (!spot || !location) return;
    let live = true;
    hasLocationPermission().then(ok => ok ? whereAmI() : null)
      .then(here => { if (live && here) setNearAt({ at: spot, near: distanceM(here, location) <= stampRadius(location) }); }).catch(() => {});
    return () => { live = false; };
  }, [spot]); // eslint-disable-line react-hooks/exhaustive-deps
  const others = item ? sameCity(items, item, passport.progress) : [];

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

  if (error) return <Empty title={t('Eser açılamadı.', 'The work could not be opened.')} body={error}
    action={<Button label={t('Yeniden dene', 'Try again')} icon="refresh" onPress={() => { setError(null); setAttempt(a => a + 1); }} />} />;
  if (!detail) return <Loading />;

  const name = item?.name ?? (lang === 'en' ? detail.card?.name_en || detail.card?.name_tr : detail.card?.name_tr) ?? t('Eser', 'Work');
  const favorite = passport.progress.favorites.includes(slug);
  const cover = detail.images[0] ?? item?.image;
  const where = item ? [item.neighborhood, item.district, item.city.name].filter(Boolean).join(', ') : [detail.card?.neighborhood, detail.card?.district, detail.card?.city].filter(Boolean).join(', ');
  const by = item && makers(item);
  const upper = (s: string) => s.toLocaleUpperCase(lang === 'tr' ? 'tr-TR' : 'en');
  // the short card right under the title: city · type · date · era
  const card = item ? [item.city.name, item.kind_label, item.built.label, item.period?.name].filter((v): v is string => Boolean(v)) : [];
  const labels: Record<ReadingMode, string> = { brief: t('Özet', 'Summary'), story: t('Hikâye', 'Story'), child: t('Çocuk', 'Kids'), text: t('Kitap', 'Book') };
  const available = MODES.filter(m => textOf(m));
  const heading = mode === 'brief' ? `${t('KISA ÖZET', 'IN BRIEF')}${text ? ` · ${t(`YAKLAŞIK ${spokenSeconds(text)} SANİYE`, `ABOUT ${spokenSeconds(text)} SECONDS`)}` : ''}`
    : mode === 'story' ? t('BİR KAPININ HİKÂYESİ', 'THE STORY OF A DOOR') : mode === 'child' ? t('KÜÇÜK KÂŞİFLER İÇİN', 'FOR LITTLE EXPLORERS') : t('KİTAPTAKİ METİN', 'THE BOOK’S TEXT');

  function choose(id: ReadingMode) {
    setVoiced(null);
    setPicked(id);
    change({ narration: id });
    track('narration_mode', slug, { mode: modeForEvents(id) });
  }

  function listen() {
    if (speaking) { stopSpeaking(); setVoiced(null); return; }
    if (text) listenTo(text);
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

  // the card goes out of the app: a photo only with its rights confirmed in the panel (image.reuse_allowed)
  function shareStamp() {
    if (!discovered) return;
    setShared({ kind: 'stamp', name, place: [item?.district, item?.city.name].filter(Boolean).join(', '), onSpot: Boolean(visited),
      date: new Date(visited?.date ?? discovered).toLocaleDateString(), photo: cover?.reusable ? mediaUrl(cover.src) : null });
  }

  async function shareWork() {
    setLinkShown(null);
    const place = [item?.district, item?.city.name].filter(Boolean).join(', ');
    const url = workLink(slug);
    setLinkShown(await shareLink(place ? `${name}, ${place}` : name, url).catch(() => url));
    track('share_initiated', slug, { content_type: 'heritage_item' });
  }

  const onSpotLabel = t('Yerinde mühürle', 'Stamp on site');
  // the button stamps without reading (no rhythm day); reading three quarters stamps by itself
  const stamp: BarAction = visited ? { label: t('Yerinde mühürlü', 'Stamped on site'), icon: 'ribbon', onPress: () => {}, disabled: true }
    : location && near ? { label: onSpotLabel, icon: 'ribbon', kind: 'gold', onPress: stampHere, busy: checking }
    : !discovered ? { label: t('Mühürle', 'Stamp'), icon: 'bookmark-outline', kind: 'gold', onPress: () => passport.discover(slug, 'manual'),
      accessibilityLabel: t('Pasaportuma mühürle', 'Stamp my passport') }
    : location ? { label: onSpotLabel, icon: 'ribbon-outline', kind: 'gold', onPress: stampHere, busy: checking }
    : { label: t('Mühürlü', 'Stamped'), icon: 'checkmark-circle', onPress: () => {}, disabled: true,
      accessibilityLabel: t('Pasaportunda mühürlü', 'Stamped in your passport') };
  stamp.pop = stampKind;
  const status = visited ? { icon: 'ribbon' as const, label: t('Yerinde mühür', 'On-the-spot stamp') }
    : discovered ? { icon: 'checkmark-circle' as const, label: t('Dijital mühür', 'Digital stamp') }
    : { icon: 'bookmark-outline' as const, label: t('Mühürlenmedi', 'Not stamped') };

  return <View style={s.screen}>
    <Stack.Screen options={{ title: name }} />
    <ScrollView onScroll={story.onScroll} onLayout={story.onViewport} scrollEventThrottle={200}
      contentContainerStyle={{ paddingBottom: ACTION_BAR_HEIGHT + insets.bottom + space.l }}>
      {/* the title sits under the picture, never over it, so it shows whole on every screen size */}
      <View style={s.cover}>
        <NightGlow color={colors.emeraldLight} />
        <CoverImage uri={mediaUrl(cover?.src)} light alt={cover ? cover.alt ?? name : undefined} kind={item?.kind} kind_label={item?.kind_label} />
        <View style={s.coverText}>
          <Title light>{name}</Title>
          {!!card.length && <Eyebrow light>{card.join(' · ')}</Eyebrow>}
        </View>
      </View>

      <View style={s.section}>
        {item && !!item.alt_names.length && <Text style={s.muted}>{item.alt_names.join(' · ')}</Text>}
        <View style={s.facts}>
          {!!where && <Fact icon="location-outline" text={where} />}
          {!!item?.built.label && <Fact icon="calendar-outline" text={item.built.label} />}
          {!!item?.built.basis_label && <Text style={s.small}>{item.built.basis_label}</Text>}
          {!!by && <Fact icon="construct-outline" text={by} />}
        </View>
        {location?.approximate && <Text style={s.small}>{t('Konum otomatik bulundu ve henüz doğrulanmadı; yaklaşık bir alanı gösterir.', 'The location was found automatically and is not yet verified; it marks an approximate area.')}</Text>}
        <Animated.View style={[s.status, statusPop]}><Chip icon={status.icon} label={status.label} accessibilityLabel={`${t('Mühür durumu', 'Stamp')}: ${status.label}`} /></Animated.View>
        {!location && <Text style={s.small}>{t('Bu eserin konumu henüz yok; yerinde mühür açılmaz.', 'This work has no location yet, so there is no on-the-spot stamp.')}</Text>}
        {!discovered && <Text style={s.small}>{t('Bir anlatımın dörtte üçünü okuyunca ya da dinleyince dijital mührün kendiliğinden basılır.', 'Read or hear three quarters of a telling and your digital stamp is taken by itself.')}</Text>}
        {stale && <Notice icon="cloud-offline-outline">{t('Çevrimdışısın: bu eserin cihazda saklanan hâli gösteriliyor.', 'You are offline: the copy of this work kept on the device is shown.')}</Notice>}
        <NotebookChips slug={slug} />
      </View>

      <View onLayout={story.onSection} style={s.section}>
        {available.length > 1 && <SegmentedControl<ReadingMode> accessibilityLabel={t('Anlatım', 'Telling')} value={mode}
          onChange={choose} options={available.map(k => ({ key: k, label: labels[k] }))} />}
        <Eyebrow>{heading}</Eyebrow>
        {text ? <View style={s.reading}>
          {mode === 'text' && detail.text_note && <Text style={s.small}>{detail.text_note}</Text>}
          {mode === 'brief' && <Text style={s.small}>{t('Bu özet kitaptaki bilgilerden derlendi. Kaynak:', 'This summary was compiled from the book. Source:')} {item ? sourceTitle(item.source) : detail.source.book}</Text>}
          {(mode === 'story' || mode === 'child') && <Text style={s.small}>{t('Bu anlatım kitaptaki bilgilere dayanarak yapay zekâyla hazırlandı; hikâyedeki atmosfer yaratıcı anlatımdır.', 'This telling was prepared with AI from the book’s information; the atmosphere of the story is creative narration.')}</Text>}
          <View key={`${slug}:${mode}`} onLayout={story.onBlock} style={s.reading}>
            {text.split(/\n{2,}|\n/).filter(p => p.trim()).map((p, i) => <Paragraph key={i} text={p.trim()} first={i === 0} child={mode === 'child'} />)}
          </View>
          {(mode === 'story' || mode === 'child') && !!detail.narrations[mode]?.sources.length && <View style={s.sources}>
            <Eyebrow>{t('BU ANLATIMIN KAYNAKLARI', 'SOURCES FOR THIS TELLING')}</Eyebrow>
            {detail.narrations[mode]!.sources.map((source, i) => <Text key={i} style={s.small}>{[source.book, source.pages && t(`s. ${source.pages}`, `p. ${source.pages}`)].filter(Boolean).join(', ')}</Text>)}
          </View>}
        </View> : <Notice>{mode === 'brief' ? t('Bu eser için kısa özet henüz hazırlanmadı. Başka bir anlatımı okuyabilir ya da esere soru sorabilirsin.', 'A short summary has not been prepared for this work yet. You can read another telling or ask the work a question.')
          : available.length ? t('Bu anlatım bu eser için henüz hazırlanmadı. Başka bir anlatımı okuyabilir ya da esere soru sorabilirsin.', 'This telling has not been prepared for this work yet. You can read another one or ask the work a question.')
          : t('Bu eser için henüz metin yok; esere soru sorabilirsin.', 'There is no text for this work yet; you can ask the work a question.')}</Notice>}
        {justRead && <View style={s.sealed} accessibilityLiveRegion="polite">
          <Eyebrow>✦ {t('DİJİTAL KEŞİF MÜHRÜ', 'DIGITAL DISCOVERY STAMP')}</Eyebrow>
          <Title>{t('Bu hikâye artık senin.', 'This story is yours now.')}</Title>
          <Text style={s.muted}>{t('Pasaportuna mühürlendi ve defterine “Öğrendim” olarak yazıldı. Bu mühür okuduğunu gösterir; yerinde ziyaret mührü ancak eserin önünde basılır.', 'It is stamped in your passport and marked “Learned” in your notebook. This stamp shows you read it; the on-the-spot stamp can only be taken in front of the work.')}</Text>
          <Button icon="book-outline" label={t('Keşif Defterimi aç', 'Open my notebook')} onPress={() => router.push('/defter')} />
          {!account.user && <Button kind="plain" icon="person-circle-outline" label={t('Pasaportunu cihazlar arasında korumak ister misin?', 'Want to keep your passport across devices?')} onPress={() => router.push('/giris')} />}
        </View>}
      </View>

      <View style={s.icons}>
        {location && <IconAction icon="map-outline" label={t('Yol tarifi', 'Directions')} a11y={t('Yol tarifi al', 'Get directions')}
          onPress={() => openDirections(location.lat, location.lon, name)} />}
        <IconAction icon="share-social-outline" label={t('Mühür', 'Stamp')} onPress={shareStamp} disabled={!discovered}
          a11y={discovered ? t('Mührünü paylaş', 'Share your stamp') : t('Mühürleyince paylaşabilirsin', 'You can share once you stamp it')} />
        <IconAction icon="link-outline" label={t('Bağlantı', 'Link')} a11y={t('Bu eseri paylaş', 'Share this work')} onPress={shareWork} />
        <IconAction icon="add-circle-outline" label={t('Hatıra', 'Memory')} a11y={t('Hatıra ekle', 'Add a memory')} onPress={() => setAdding(true)} />
        <IconAction icon={favorite ? 'heart' : 'heart-outline'} label={t('Favori', 'Favourite')} selected={favorite}
          a11y={favorite ? t('Favorilerden çıkar', 'Remove from favourites') : t('Favorilere ekle', 'Add to favourites')} onPress={() => passport.toggleFavorite(slug)} />
      </View>
      {linkShown && <View style={s.section}><Notice icon="link-outline"><Text selectable>{linkShown}</Text></Notice></View>}

      {flags.three_details && !!detail.details?.length && <View style={s.section}><ThreeDetails key={slug} slug={slug} details={detail.details} /></View>}

      <View style={s.section}>
        <PhotoGallery images={detail.images} title={upper(t('Fotoğraflar', 'Photographs'))} />
        <MonumentDetails detail={detail} name={name} slug={slug} />
      </View>

      <View style={s.section}>
        <SectionHeader title={t('Hatıra Defterim', 'My Memory Book')} />
        {memories.length ? memories.map(m => <MemoryCard key={m.id} m={m} />)
          : <Text style={s.small}>{t('Bu esere kendi fotoğrafını ve notunu ekle; yalnızca bu telefonda kalır.', 'Add your own photo and note to this work; it stays on this phone only.')}</Text>}
        <Button kind="plain" icon="add-circle-outline" label={t('Hatıra ekle', 'Add a memory')} onPress={() => setAdding(true)} />
      </View>

      <View style={s.section}><Contributions slug={slug} name={name} /></View>

      {others.length > 0 && <View style={s.rail}>
        <HorizontalRail title={t('Aynı şehirden', 'From the same city')} data={others} itemWidth={160}
          keyExtractor={w => w.slug} renderItem={w => <WorkTile item={w} />} />
      </View>}

      <View style={s.section}>
        <SectionHeader title={t('Kaynak', 'Source')} />
        <Text style={s.muted}>{item ? sourceTitle(item.source) : detail.source.book}</Text>
        {!!detail.source.credits?.authors?.length && <Text style={s.small}>{t('Yazarlar', 'Authors')}: {detail.source.credits.authors.join(', ')}</Text>}
        {!!detail.source.credits?.editor && <Text style={s.small}>{t('Editör', 'Editor')}: {detail.source.credits.editor}</Text>}
      </View>
    </ScrollView>

    <StickyActionBar note={placeNote ? <View style={s.note}>
      <View style={s.noteText}><Notice icon="navigate-outline">{placeNote}</Notice></View>
      <Pressable accessibilityRole="button" accessibilityLabel={t('Notu kapat', 'Close the note')} onPress={() => setPlaceNote(null)} style={s.noteClose}>
        <Ionicons name="close" size={20} color={colors.goldText} /></Pressable>
    </View> : undefined} actions={[
      { label: speaking ? t('Durdur', 'Stop') : t('Dinle', 'Listen'), icon: speaking ? 'stop-circle-outline' : 'volume-high-outline', onPress: listen, disabled: !text,
        accessibilityLabel: speaking ? t('Dinlemeyi durdur', 'Stop listening') : `${t('Dinle', 'Listen')}: ${labels[mode]}` },
      stamp,
      { label: t('Esere Sor', 'Ask the Work'), icon: 'chatbubbles-outline', onPress: () => router.push(`/sor/${slug}`) },
    ]} />
    <ShareSheet shared={shared} onClose={() => setShared(null)} />
    <AddMemory slug={slug} name={name} onSpot={Boolean(visited)} visible={adding} onClose={() => setAdding(false)} />
  </View>;
}

/** A paragraph of the reading; the first opens with a large gold italic letter (inline, not measured around the text). */
function Paragraph({ text, first, child }: { text: string; first: boolean; child: boolean }) {
  const style = [s.paragraph, child && s.childText];
  if (!first) return <Text style={style}>{text}</Text>;
  const [initial, ...rest] = Array.from(text);
  return <Text style={style}><Text style={s.initial}>{initial}</Text>{rest.join('')}</Text>;
}

function Fact({ icon, text }: { icon: 'location-outline' | 'calendar-outline' | 'construct-outline'; text: string }) {
  return <View style={s.fact}><Ionicons name={icon} size={16} color={colors.goldText} /><Text style={s.factText}>{text}</Text></View>;
}

function IconAction({ icon, label, a11y, onPress, disabled, selected }: { icon: IconName; label: string; a11y: string; onPress: () => void; disabled?: boolean; selected?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={a11y} accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.iconAction, disabled && { opacity: 0.5 }, pressed && { opacity: 0.7 }]}>
    <View style={[s.iconCircle, selected && s.iconOn]}><Ionicons name={icon} size={22} color={selected ? colors.goldSoft : colors.goldText} /></View>
    <Text style={s.iconLabel} numberOfLines={1}>{label}</Text>
  </Pressable>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.parchment },
  cover: { gap: space.m, paddingHorizontal: space.gutter, paddingTop: space.m, paddingBottom: space.l, backgroundColor: colors.emerald },
  coverText: { gap: space.s, width: '100%', maxWidth: measure.reading, alignSelf: 'center' },
  section: { paddingHorizontal: space.m, paddingTop: space.l, gap: space.s + 2 },
  rail: { paddingTop: space.l },
  status: { flexDirection: 'row' },
  facts: { gap: space.xs },
  fact: { flexDirection: 'row', gap: space.s, alignItems: 'center' },
  factText: { color: colors.ink, flex: 1, ...type.body },
  muted: { color: colors.soft, ...type.small },
  small: { color: colors.soft, ...type.caption },
  reading: { gap: space.s + 2, width: '100%', maxWidth: measure.reading, alignSelf: 'center' },
  paragraph: { fontFamily: serif, color: colors.ink, ...type.reading },
  childText: { fontSize: 22, lineHeight: 33 },
  initial: { ...type.dropCap, color: colors.goldText, fontFamily: fonts.serifItalic },
  sources: { borderTopWidth: 1, borderColor: colors.goldLine, paddingTop: space.m, gap: space.s },
  sealed: { padding: space.m, gap: space.s, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.goldLine, borderRadius: radius.m },
  icons: { flexDirection: 'row', justifyContent: 'space-around', marginHorizontal: space.m, marginTop: space.l, paddingVertical: space.s, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line },
  iconAction: { minWidth: hit + space.s, minHeight: hit, alignItems: 'center', gap: space.xs },
  iconCircle: { width: hit, height: hit, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.goldLine, backgroundColor: colors.paper },
  iconOn: { backgroundColor: colors.emerald, borderColor: colors.emerald },
  iconLabel: { color: colors.ink, fontWeight: '500', ...type.caption },
  note: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  noteText: { flex: 1 },
  noteClose: { width: hit, height: hit, alignItems: 'center', justifyContent: 'center' },
});
