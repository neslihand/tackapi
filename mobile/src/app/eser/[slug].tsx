// The work: the summary, the two prepared tellings (story, child) and the book's text, read aloud on request; the photos
// with their sources; the passport stamps (digital, and on the spot when the phone is near); "Esere Sor".
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip, SegmentedControl } from '@/components/Controls';
import { AddMemory, MemoryCard } from '@/components/Journal';
import { ACTION_BAR_HEIGHT, HorizontalRail, StickyActionBar, type BarAction } from '@/components/Layout';
import { ShareSheet, type Shared } from '@/components/ShareSheet';
import { Button, Empty, Eyebrow, Loading, Notice, Title, type IconName } from '@/components/UI';
import { WorkTile } from '@/components/WorkTile';
import { ApiError, loadMonument, makers, mediaUrl, sourceTitle, type Detail } from '@/lib/api';
import { hasLocationPermission, openDirections, whereAmI } from '@/lib/geo';
import { t, useLang } from '@/lib/i18n';
import { useJournal } from '@/lib/journal';
import { distanceM, formatDistance, stampRadius } from '@/lib/passport';
import { rememberOpened } from '@/lib/recent';
import { speak, stopSpeaking } from '@/lib/speech';
import { useContent, usePassport, useSettings } from '@/lib/store';
import { colors, hit, overlay, radius, serif, space, type } from '@/lib/theme';
import { availableTellings, pickTelling, sameCity, tellingTexts, type Telling } from '@/lib/work';

export default function Work() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { lang } = useLang();
  const { items, bySlug } = useContent();
  const { settings, change } = useSettings();
  const passport = usePassport();
  const insets = useSafeAreaInsets();
  const item = bySlug(slug);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [checking, setChecking] = useState(false);
  const [near, setNear] = useState(false);
  const [placeNote, setPlaceNote] = useState<string | null>(null);
  const [shared, setShared] = useState<Shared | null>(null);
  const [adding, setAdding] = useState(false);
  const memories = useJournal().of(slug);

  useEffect(() => {
    let live = true;
    setDetail(null); setError(null);
    loadMonument(slug).then(r => { if (live) { setDetail(r.data); setStale(r.stale); } },
      e => { if (live) setError(e instanceof ApiError && e.status === 404 ? t('Bu eser yayında değil.', 'This work is not published.') : String(e?.message ?? e)); });
    return () => { live = false; };
  }, [slug, lang]);
  useEffect(() => { rememberOpened(slug).catch(() => {}); }, [slug]); // Bugün's "Devam et"
  useEffect(() => () => stopSpeaking(), []);

  const location = detail?.location ?? item?.location ?? null;
  const visited = passport.progress.visits[slug];
  const discovered = passport.progress.discovered[slug];
  // Only when the permission is already given: the dialog opens when the stamp button is pressed, never on opening.
  useEffect(() => {
    setNear(false);
    if (!location || visited) return;
    let live = true;
    hasLocationPermission().then(ok => ok ? whereAmI() : null)
      .then(here => { if (live && here) setNear(distanceM(here, location) <= stampRadius(location)); }).catch(() => {});
    return () => { live = false; };
  }, [location?.lat, location?.lon, Boolean(visited)]); // eslint-disable-line react-hooks/exhaustive-deps

  const texts = useMemo(() => detail ? tellingTexts(item, detail) : null, [item, detail]);
  const available = texts ? availableTellings(texts) : [];
  const telling = pickTelling(available, settings.telling);
  useEffect(() => { stopSpeaking(); setSpeaking(false); }, [telling]);
  const others = useMemo(() => item ? sameCity(items, item, passport.progress) : [], [items, item, passport.progress]);

  if (error) return <Empty title={t('Eser açılamadı.', 'The work could not be opened.')} body={error} />;
  if (!detail || !texts) return <Loading />;

  const name = item?.name ?? slug;
  const text = telling ? texts[telling] : null;
  const favorite = passport.progress.favorites.includes(slug);
  const cover = detail.images[0];
  const where = item ? [item.neighborhood, item.district, item.city.name].filter(Boolean).join(', ') : '';
  const by = item && makers(item);
  const upper = (s: string) => s.toLocaleUpperCase(lang === 'tr' ? 'tr-TR' : 'en');
  const labels: Record<Telling, string> = { summary: t('Özet', 'Summary'), story: t('Hikâye', 'Story'), child: t('Çocuk', 'Kids'), text: t('Kitap', 'Book') };

  function listen() {
    if (speaking) { stopSpeaking(); setSpeaking(false); return; }
    if (!text) return;
    setSpeaking(true);
    speak(`${name}. ${text}`, () => setSpeaking(false));
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

  function share() {
    if (!discovered) return;
    setShared({ kind: 'stamp', name, place: [item?.district, item?.city.name].filter(Boolean).join(', '), onSpot: Boolean(visited),
      date: new Date(visited?.date ?? discovered).toLocaleDateString(), photo: mediaUrl(cover?.src) });
  }

  const onSpotLabel = t('Yerinde mühürle', 'Stamp on site');
  const stamp: BarAction = visited ? { label: t('Yerinde mühürlü', 'Stamped on site'), icon: 'ribbon', onPress: () => {}, disabled: true }
    : location && near ? { label: onSpotLabel, icon: 'ribbon', kind: 'gold', onPress: stampHere, busy: checking }
    : !discovered ? { label: t('Mühürle', 'Stamp'), icon: 'bookmark-outline', kind: 'dark', onPress: () => passport.discover(slug),
      accessibilityLabel: t('Pasaportuma mühürle', 'Stamp my passport') }
    : location ? { label: onSpotLabel, icon: 'ribbon-outline', onPress: stampHere, busy: checking }
    : { label: t('Mühürlü', 'Stamped'), icon: 'checkmark-circle', onPress: () => {}, disabled: true,
      accessibilityLabel: t('Pasaportunda mühürlü', 'Stamped in your passport') };
  const status = visited ? { icon: 'ribbon' as const, label: t('Yerinde mühür', 'On-the-spot stamp') }
    : discovered ? { icon: 'checkmark-circle' as const, label: t('Dijital mühür', 'Digital stamp') }
    : { icon: 'bookmark-outline' as const, label: t('Mühürlenmedi', 'Not stamped') };

  return <View style={s.screen}>
    <Stack.Screen options={{ title: name }} />
    <ScrollView contentContainerStyle={{ paddingBottom: ACTION_BAR_HEIGHT + insets.bottom + space.l }}>
      <View style={s.cover}>
        {cover ? <Image source={mediaUrl(cover.src)} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} accessibilityLabel={cover.alt ?? name} />
          : <View style={[StyleSheet.absoluteFill, s.coverEmpty]}><Ionicons name="business-outline" size={48} color={colors.gold} /></View>}
        <View style={s.coverText}>
          {item && <Eyebrow light>{upper(item.kind_label)}{item.period ? ` · ${upper(item.period.name)}` : ''}</Eyebrow>}
          <Title light size={type.title.fontSize}>{name}</Title>
        </View>
      </View>

      <View style={s.section}>
        {item && !!item.alt_names.length && <Text style={s.muted}>{item.alt_names.join(' · ')}</Text>}
        <View style={s.facts}>
          {!!where && <Fact icon="location-outline" text={where} />}
          {!!item?.built.label && <Fact icon="calendar-outline" text={item.built.label} />}
          {!!by && <Fact icon="construct-outline" text={by} />}
        </View>
        {location?.approximate && <Text style={s.small}>{t('Konum otomatik bulundu ve henüz doğrulanmadı; yaklaşık bir alanı gösterir.', 'The location was found automatically and is not yet verified; it marks an approximate area.')}</Text>}
        <View style={s.status}><Chip icon={status.icon} label={status.label} accessibilityLabel={`${t('Mühür durumu', 'Stamp')}: ${status.label}`} /></View>
        {!location && <Text style={s.small}>{t('Bu eserin konumu henüz yok; yerinde mühür açılmaz.', 'This work has no location yet, so there is no on-the-spot stamp.')}</Text>}
        {stale && <Notice icon="cloud-offline-outline">{t('Çevrimdışısın: bu eserin cihazda saklanan hâli gösteriliyor.', 'You are offline: the copy of this work kept on the device is shown.')}</Notice>}
      </View>

      <View style={s.section}>
        {available.length > 1 && telling && <SegmentedControl accessibilityLabel={t('Anlatım', 'Telling')} value={telling}
          onChange={k => change({ telling: k })} options={available.map(k => ({ key: k, label: labels[k] }))} />}
        {telling && text ? <View style={s.reading}>
          {available.length === 1 && <Eyebrow>{upper(labels[telling])}</Eyebrow>}
          {telling === 'text' && detail.text_note && <Text style={s.small}>{detail.text_note}</Text>}
          {(telling === 'story' || telling === 'child') && <Text style={s.small}>{t('Bu anlatım kitaptaki bilgilere dayanarak yapay zekâyla hazırlandı; hikâyedeki atmosfer yaratıcı anlatımdır.', 'This telling was prepared with AI from the book’s information; the atmosphere of the story is creative narration.')}</Text>}
          {text.split(/\n{2,}|\n/).filter(p => p.trim()).map((p, i) => <Text key={i} style={s.paragraph}>{p.trim()}</Text>)}
        </View> : <Notice>{t('Bu eser için henüz metin yok; esere soru sorabilirsin.', 'There is no text for this work yet; you can ask the work a question.')}</Notice>}
      </View>

      <View style={s.icons}>
        {location && <IconAction icon="map-outline" label={t('Yol tarifi', 'Directions')} a11y={t('Yol tarifi al', 'Get directions')}
          onPress={() => openDirections(location.lat, location.lon, name)} />}
        <IconAction icon="share-social-outline" label={t('Paylaş', 'Share')} onPress={share} disabled={!discovered}
          a11y={discovered ? t('Mührünü paylaş', 'Share your stamp') : t('Mühürleyince paylaşabilirsin', 'You can share once you stamp it')} />
        <IconAction icon="add-circle-outline" label={t('Hatıra', 'Memory')} a11y={t('Hatıra ekle', 'Add a memory')} onPress={() => setAdding(true)} />
        <IconAction icon={favorite ? 'heart' : 'heart-outline'} label={t('Favori', 'Favourite')} selected={favorite}
          a11y={favorite ? t('Favorilerden çıkar', 'Remove from favourites') : t('Favorilere ekle', 'Add to favourites')} onPress={() => passport.toggleFavorite(slug)} />
      </View>

      {detail.images.length > 1 && <View style={s.section}>
        <Eyebrow>{t('FOTOĞRAFLAR', 'PHOTOS')}</Eyebrow>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s }}>
          {detail.images.map((img, i) => <View key={img.src} style={s.photoBox}>
            <Image source={mediaUrl(img.thumb ?? img.src)} style={s.photo} contentFit="cover" accessibilityLabel={img.alt ?? `${name}, ${i + 1}`} />
            {!!(img.caption || img.source) && <Text style={s.small} numberOfLines={3}>{[img.caption, img.source && `${img.source.book}${img.source.page ? `, s. ${img.source.page}` : ''}`].filter(Boolean).join(' · ')}</Text>}
          </View>)}
        </ScrollView>
      </View>}

      <View style={s.section}>
        <Eyebrow>✦ {t('HATIRA DEFTERİM', 'MY MEMORY BOOK')}</Eyebrow>
        {memories.length ? memories.map(m => <MemoryCard key={m.id} m={m} />)
          : <Text style={s.small}>{t('Bu esere kendi fotoğrafını ve notunu ekle; yalnızca bu telefonda kalır.', 'Add your own photo and note to this work; it stays on this phone only.')}</Text>}
        <Button kind="plain" icon="add-circle-outline" label={t('Hatıra ekle', 'Add a memory')} onPress={() => setAdding(true)} />
      </View>

      {others.length > 0 && <View style={s.rail}>
        <HorizontalRail title={t('Aynı şehirden', 'From the same city')} data={others} itemWidth={160}
          keyExtractor={w => w.slug} renderItem={w => <WorkTile item={w} />} />
      </View>}

      <View style={s.section}>
        <Eyebrow>{t('KAYNAK', 'SOURCE')}</Eyebrow>
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
        accessibilityLabel: speaking ? t('Dinlemeyi durdur', 'Stop listening') : telling ? `${t('Dinle', 'Listen')}: ${labels[telling]}` : t('Dinle', 'Listen') },
      stamp,
      { label: t('Esere Sor', 'Ask the Work'), icon: 'chatbubbles-outline', onPress: () => router.push(`/sor/${slug}`) },
    ]} />
    <ShareSheet shared={shared} onClose={() => setShared(null)} />
    <AddMemory slug={slug} name={name} onSpot={Boolean(visited)} visible={adding} onClose={() => setAdding(false)} />
  </View>;
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
  cover: { height: 280, justifyContent: 'flex-end', backgroundColor: colors.emerald },
  coverEmpty: { alignItems: 'center', justifyContent: 'center', paddingBottom: space.xl * 2 },
  coverText: { paddingHorizontal: space.m, paddingTop: space.l, paddingBottom: space.m, backgroundColor: overlay.shade },
  section: { paddingHorizontal: space.m, paddingTop: space.l, gap: space.s + 2 },
  rail: { paddingTop: space.l },
  status: { flexDirection: 'row' },
  facts: { gap: 6 },
  fact: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  factText: { color: colors.ink, flex: 1, ...type.body },
  muted: { color: colors.soft, fontSize: 14, lineHeight: 20 },
  small: { color: colors.soft, ...type.caption },
  reading: { gap: space.s + 2, maxWidth: 640 },
  paragraph: { fontFamily: serif, color: colors.ink, ...type.reading },
  icons: { flexDirection: 'row', justifyContent: 'space-around', marginHorizontal: space.m, marginTop: space.l, paddingVertical: space.s, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line },
  iconAction: { minWidth: hit + space.l, minHeight: hit, alignItems: 'center', gap: space.xs },
  iconCircle: { width: hit, height: hit, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.goldLine, backgroundColor: colors.paper },
  iconOn: { backgroundColor: colors.emerald, borderColor: colors.emerald },
  iconLabel: { color: colors.ink, fontWeight: '500', ...type.caption },
  note: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  noteText: { flex: 1 },
  noteClose: { width: hit, height: hit, alignItems: 'center', justifyContent: 'center' },
  photoBox: { width: 240 },
  photo: { width: 240, height: 170, borderRadius: radius.m, backgroundColor: colors.parchmentDeep, marginBottom: space.xs },
});
