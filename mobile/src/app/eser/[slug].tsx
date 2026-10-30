// The work: the book's text and the two prepared tellings (story, child), read aloud on request; the photos with their
// sources; the passport stamps (digital, and on the spot when the phone is near); "Esere Sor".
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Empty, Eyebrow, Loading, Notice, Title } from '@/components/UI';
import { ApiError, loadMonument, makers, mediaUrl, sourceTitle, type Detail } from '@/lib/api';
import { openDirections, whereAmI } from '@/lib/geo';
import { t, useLang } from '@/lib/i18n';
import { distanceM, formatDistance, stampRadius } from '@/lib/passport';
import { speak, stopSpeaking } from '@/lib/speech';
import { useContent, usePassport } from '@/lib/store';
import { colors, serif, space } from '@/lib/theme';

type Mode = 'text' | 'story' | 'child';

export default function Work() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { lang } = useLang();
  const { bySlug } = useContent();
  const passport = usePassport();
  const item = bySlug(slug);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('text');
  const [speaking, setSpeaking] = useState(false);
  const [checking, setChecking] = useState(false);
  const [placeNote, setPlaceNote] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setDetail(null); setError(null);
    loadMonument(slug).then(r => { if (live) { setDetail(r.data); setStale(r.stale); } },
      e => { if (live) setError(e instanceof ApiError && e.status === 404 ? t('Bu eser yayında değil.', 'This work is not published.') : String(e?.message ?? e)); });
    return () => { live = false; };
  }, [slug, lang]);
  useEffect(() => () => stopSpeaking(), []);
  useEffect(() => { stopSpeaking(); setSpeaking(false); }, [mode]);

  if (error) return <Empty title={t('Eser açılamadı.', 'The work could not be opened.')} body={error} />;
  if (!detail) return <Loading />;

  const name = item?.name ?? slug;
  const location = detail.location ?? item?.location ?? null;
  const text = mode === 'text' ? detail.text : detail.narrations[mode]?.answer ?? null;
  const visited = passport.progress.visits[slug];
  const discovered = passport.progress.discovered[slug];
  const favorite = passport.progress.favorites.includes(slug);
  const cover = detail.images[0];
  const where = item ? [item.neighborhood, item.district, item.city.name].filter(Boolean).join(', ') : '';
  const by = item && makers(item);

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

  const modes: [Mode, string][] = [['text', t('Detaylı Anlatım', 'In Detail')], ['story', t('Hikâyeleştirerek', 'As a Story')], ['child', t('Çocuklar İçin', 'For Children')]];
  return <ScrollView contentContainerStyle={{ paddingBottom: space.xl * 2 }}>
    <Stack.Screen options={{ title: name, headerRight: () => <Pressable onPress={() => passport.toggleFavorite(slug)} hitSlop={12} accessibilityRole="button"
      accessibilityLabel={favorite ? t('Favorilerden çıkar', 'Remove from favourites') : t('Favorilere ekle', 'Add to favourites')} accessibilityState={{ selected: favorite }}>
      <Ionicons name={favorite ? 'heart' : 'heart-outline'} size={22} color={colors.gold} /></Pressable> }} />
    {cover ? <Image source={mediaUrl(cover.src)} style={s.cover} contentFit="cover" transition={250} accessibilityLabel={cover.alt ?? name} />
      : <View style={[s.cover, s.coverEmpty]}><Ionicons name="business-outline" size={48} color={colors.goldLine} /></View>}

    <View style={s.section}>
      {item && <Eyebrow>{item.kind_label.toLocaleUpperCase('tr-TR')}{item.period ? ` · ${item.period.name.toLocaleUpperCase('tr-TR')}` : ''}</Eyebrow>}
      <Title>{name}</Title>
      {item && !!item.alt_names.length && <Text style={s.muted}>{item.alt_names.join(' · ')}</Text>}
      <View style={s.facts}>
        {!!where && <Fact icon="location-outline" text={where} />}
        {!!item?.built.label && <Fact icon="calendar-outline" text={item.built.label} />}
        {!!by && <Fact icon="construct-outline" text={by} />}
      </View>
      {stale && <Notice icon="cloud-offline-outline">{t('Çevrimdışısın: bu eserin cihazda saklanan hâli gösteriliyor.', 'You are offline: the copy of this work kept on the device is shown.')}</Notice>}
    </View>

    <View style={[s.section, s.stamps]}>
      <Eyebrow>✦ {t('MİRAS PASAPORTU', 'HERITAGE PASSPORT')}</Eyebrow>
      <Button kind={discovered ? 'plain' : 'dark'} icon={discovered ? 'checkmark-circle' : 'bookmark-outline'} onPress={() => passport.discover(slug)} disabled={Boolean(discovered)}
        label={discovered ? t('Pasaportunda mühürlü', 'Stamped in your passport') : t('Pasaportuma mühürle', 'Stamp my passport')} />
      {location ? <>
        <Button kind={visited ? 'plain' : 'gold'} icon="ribbon" onPress={stampHere} busy={checking} disabled={Boolean(visited)}
          label={visited ? t('Yerinde mühürlendi', 'Stamped on the spot') : t('Yerinde mühürle', 'Stamp on the spot')} />
        {placeNote && <Notice icon="navigate-outline">{placeNote}</Notice>}
        <Button kind="plain" icon="map-outline" label={t('Yol tarifi al', 'Get directions')} onPress={() => openDirections(location.lat, location.lon, name)} />
        {location.approximate && <Text style={s.small}>{t('Konum otomatik bulundu ve henüz doğrulanmadı; yaklaşık bir alanı gösterir.', 'The location was found automatically and is not yet verified; it marks an approximate area.')}</Text>}
      </> : <Text style={s.small}>{t('Bu eserin konumu henüz yok; yerinde mühür açılmaz.', 'This work has no location yet, so there is no on-the-spot stamp.')}</Text>}
    </View>

    <View style={s.section}>
      <View style={s.modes} accessibilityRole="tablist">
        {modes.map(([id, label]) => <Pressable key={id} onPress={() => setMode(id)} accessibilityRole="tab" accessibilityState={{ selected: mode === id }} style={[s.mode, mode === id && s.modeOn]}>
          <Text style={[s.modeText, mode === id && { color: colors.goldSoft }]}>{label}</Text></Pressable>)}
      </View>
      {text ? <>
        <Button kind="plain" icon={speaking ? 'stop-circle-outline' : 'volume-high-outline'} onPress={listen}
          label={speaking ? t('Dinlemeyi durdur', 'Stop listening') : t('Sesli rehberle dinle', 'Listen with the audio guide')} />
        {mode === 'text' && detail.text_note && <Text style={s.small}>{detail.text_note}</Text>}
        {mode !== 'text' && <Text style={s.small}>{t('Bu anlatım kitaptaki bilgilere dayanarak yapay zekâyla hazırlandı; hikâyedeki atmosfer yaratıcı anlatımdır.', 'This telling was prepared with AI from the book’s information; the atmosphere of the story is creative narration.')}</Text>}
        {text.split(/\n{2,}|\n/).filter(p => p.trim()).map((p, i) => <Text key={i} style={s.paragraph}>{p.trim()}</Text>)}
      </> : <Notice>{t('Bu anlatım henüz hazırlanmadı. Detaylı anlatımı okuyabilir ya da esere soru sorabilirsin.', 'This telling is not ready yet. You can read the detailed text or ask the work a question.')}</Notice>}
      <Button icon="chatbubbles-outline" label={t('Esere Sor', 'Ask the Work')} onPress={() => router.push(`/sor/${slug}`)} />
    </View>

    {detail.images.length > 1 && <View style={s.section}>
      <Eyebrow>{t('FOTOĞRAFLAR', 'PHOTOS')}</Eyebrow>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s }}>
        {detail.images.map((img, i) => <View key={img.src} style={{ width: 240 }}>
          <Image source={mediaUrl(img.thumb ?? img.src)} style={s.photo} contentFit="cover" accessibilityLabel={img.alt ?? `${name}, ${i + 1}`} />
          {!!(img.caption || img.source) && <Text style={s.small} numberOfLines={3}>{[img.caption, img.source && `${img.source.book}${img.source.page ? `, s. ${img.source.page}` : ''}`].filter(Boolean).join(' · ')}</Text>}
        </View>)}
      </ScrollView>
    </View>}

    <View style={s.section}>
      <Eyebrow>{t('KAYNAK', 'SOURCE')}</Eyebrow>
      <Text style={s.muted}>{item ? sourceTitle(item.source) : detail.source.book}</Text>
      {!!detail.source.credits && <Text style={s.small}>{detail.source.credits}</Text>}
    </View>
  </ScrollView>;
}

function Fact({ icon, text }: { icon: 'location-outline' | 'calendar-outline' | 'construct-outline'; text: string }) {
  return <View style={s.fact}><Ionicons name={icon} size={16} color={colors.goldText} /><Text style={s.factText}>{text}</Text></View>;
}

const s = StyleSheet.create({
  cover: { width: '100%', height: 260, backgroundColor: colors.parchmentDeep },
  coverEmpty: { alignItems: 'center', justifyContent: 'center' },
  section: { paddingHorizontal: space.m, paddingTop: space.l, gap: space.s + 2 },
  stamps: { marginHorizontal: space.m, marginTop: space.l, paddingBottom: space.m, borderRadius: 16, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, paddingTop: space.m },
  facts: { gap: 6, marginVertical: space.xs },
  fact: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  factText: { color: colors.ink, fontSize: 14, flex: 1 },
  muted: { color: colors.soft, fontSize: 14, lineHeight: 20 },
  small: { color: colors.soft, fontSize: 12, lineHeight: 17 },
  modes: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  mode: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.goldLine },
  modeOn: { backgroundColor: colors.emerald },
  modeText: { color: colors.ink, fontSize: 13 },
  paragraph: { fontFamily: serif, color: colors.ink, fontSize: 17, lineHeight: 27 },
  photo: { width: 240, height: 170, borderRadius: 12, backgroundColor: colors.parchmentDeep, marginBottom: 4 },
});
