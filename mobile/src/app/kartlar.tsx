// Bilgi kartları: a work on each card, its story on the back. Move with a swipe or the buttons; turn with the button.
// Everything on a card is the work's own record, nothing is filled in for what is missing. Turned cards are counted for
// this visit only (lib/playSession.ts).
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { AccessibilityInfo, Animated, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Text } from '@/components/Typography';
import { Button, Empty, Loading } from '@/components/UI';
import { mediaUrl, type Item } from '@/lib/api';
import { t } from '@/lib/i18n';
import { flipCard, usePlaySession } from '@/lib/playSession';
import { useContent } from '@/lib/store';
import { colors, serif, space } from '@/lib/theme';

const pad = (n: number) => String(n).padStart(2, '0');
const CARD_MAX = 420;
// cards drawn on each side of the one in view
const DRAWN = 2;

export default function Cards() {
  const { items, loading } = useContent();
  const session = usePlaySession();
  const window = useWindowDimensions();
  const [active, setActive] = useState(0);
  const deck = useRef<ComponentRef<typeof ScrollView>>(null);
  if (loading && !items.length) return <Loading />;
  if (!items.length) return <Empty title={t('Bu koleksiyonda henüz bilgi kartı yok.', 'There are no knowledge cards in this collection yet.')} />;

  const n = items.length;
  const page = window.width;
  const seen = items.filter(i => session.flipped.includes(i.slug)).length;
  const current = items[Math.min(active, n - 1)];
  function go(index: number) {
    const next = (index + n) % n;
    setActive(next);
    deck.current?.scrollTo({ x: next * page, animated: true });
  }
  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const at = Math.round(e.nativeEvent.contentOffset.x / page);
    if (at !== active && at >= 0 && at < n) setActive(at);
  }

  return <ScrollView contentContainerStyle={{ paddingVertical: space.m, gap: space.m, paddingBottom: space.xl }}>
    <View style={s.bar}>
      <Text style={s.count}><Text style={s.countN}>{seen}</Text> / {n} {t('KART KEŞFEDİLDİ', 'CARDS DISCOVERED')}</Text>
      <Text style={s.small}>{t('Bu oturumda', 'This visit')}</Text>
    </View>
    <ScrollView ref={deck} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={64} accessibilityLabel={t('Bilgi kartları destesi', 'Deck of knowledge cards')}>
      {/* the deck holds the whole collection: only the cards next to the one in view are drawn, the rest keep their place */}
      {items.map((item, i) => <View key={item.slug} style={{ width: page, alignItems: 'center', paddingHorizontal: space.m }}>
        {Math.abs(i - active) <= DRAWN && <Card item={item} number={i + 1} front={i === active} width={Math.min(page - space.m * 2, CARD_MAX)} />}
      </View>)}
    </ScrollView>
    <View style={s.controls}>
      <Arrow icon="arrow-back" label={t('Önceki kart', 'Previous card')} onPress={() => go(active - 1)} />
      <View style={{ flex: 1, alignItems: 'center' }} accessibilityLiveRegion="polite">
        <Text style={s.position}>{pad(active + 1)} / {pad(n)}</Text>
        <Text style={s.now} numberOfLines={1}>{current.name}</Text>
        <Text style={s.small} numberOfLines={1}>{[current.city.name, current.built.label].filter(Boolean).join(' · ')}</Text>
      </View>
      <Arrow icon="arrow-forward" label={t('Sonraki kart', 'Next card')} onPress={() => go(active + 1)} />
    </View>
  </ScrollView>;
}

function Arrow({ icon, label, onPress }: { icon: 'arrow-back' | 'arrow-forward'; label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6} style={s.arrow}><Ionicons name={icon} size={20} color={colors.goldSoft} /></Pressable>;
}

function Card({ item, number, front, width }: { item: Item; number: number; front: boolean; width: number }) {
  const [turned, setTurned] = useState(false);
  const [still, setStill] = useState(false);
  const [spin] = useState(() => new Animated.Value(0));
  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(setStill).catch(() => {}); }, []);
  // only one face exists at a time, so a screen reader or a Tab key never lands on the side turned away
  function turn(next: boolean) {
    if (next) flipCard(item.slug);
    if (still) { setTurned(next); return; }
    Animated.timing(spin, { toValue: 1, duration: 140, useNativeDriver: Platform.OS !== 'web' }).start(() => {
      setTurned(next);
      Animated.timing(spin, { toValue: 0, duration: 160, useNativeDriver: Platform.OS !== 'web' }).start();
    });
  }
  const code = `${t('ESER', 'WORK')} ${String(number).padStart(3, '0')}`;
  const rotateY = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] });
  const photo = mediaUrl(item.image?.src);
  const makers = item.architect?.trim() || item.builder?.trim();
  return <Animated.View style={[s.card, { width, height: width * 1.36, transform: [{ perspective: 1000 }, { rotateY }] }]} accessibilityElementsHidden={!front} importantForAccessibility={front ? 'auto' : 'no-hide-descendants'}>
    {!turned ? <View style={{ flex: 1 }}>
      {photo ? <Image source={photo} alt="" contentFit="cover" transition={200} style={StyleSheet.absoluteFill} accessibilityIgnoresInvertColors />
        : <View style={[StyleSheet.absoluteFill, s.noPhoto]}><Ionicons name="business-outline" size={48} color={colors.goldLine} /></View>}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#06141066' }]} />
      <View style={s.top}><Text style={s.topText}>{code}</Text><Text style={s.topText}>✦</Text><Text style={s.topText}>{item.kind_label.toLocaleUpperCase('tr-TR')}</Text></View>
      <View style={s.caption}>
        <Text style={s.name} accessibilityRole="header">{item.name}</Text>
        <Text style={s.place}>{[item.district, item.city.name].filter(Boolean).join(', ')}</Text>
        <Button kind="gold" icon="sync-outline" label={t('Arkasını çevir', 'Turn over')} onPress={() => turn(true)} />
      </View>
    </View> : <View style={s.back}>
      <View style={s.topDark}><Text style={s.topDarkText}>{code}</Text><Text style={s.topDarkText}>✦</Text><Text style={s.topDarkText}>{item.built.label ?? ''}</Text></View>
      <Text style={s.backHead} accessibilityRole="header">{t('Eserin hikâyesi', 'The work’s story')}</Text>
      <ScrollView style={{ flex: 1 }} nestedScrollEnabled showsVerticalScrollIndicator focusable accessibilityLabel={t('Eserin hikâyesi', 'The work’s story')}>
        <Text style={s.story}>{item.summary?.trim() || [item.kind_label, item.city.name].join(', ')}</Text>
        <View style={s.facts}>
          {!!item.period && <Text style={s.fact}>{item.period.name} · {item.kind_label}</Text>}
          {!!makers && <Text style={s.fact}>{makers}</Text>}
          <Text style={s.fact}>{item.name}, {item.city.name}</Text>
        </View>
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: space.s }}>
        <Button style={{ flex: 1 }} icon="book-outline" label={t('Keşfet', 'Explore')} onPress={() => router.push(`/eser/${item.slug}`)} />
        {!!item.location && <Button style={{ flex: 1 }} kind="plain" icon="map-outline" label={t('Haritada', 'On the map')} onPress={() => router.navigate(`/kesfet?eser=${encodeURIComponent(item.slug)}`)} />}
      </View>
      <Button kind="plain" icon="return-up-back-outline" label={t('Öne dön', 'Back to the front')} onPress={() => turn(false)} />
    </View>}
  </Animated.View>;
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: space.m },
  count: { color: colors.goldText, fontSize: 11, letterSpacing: 1.4, fontWeight: '700' },
  countN: { fontFamily: serif, fontSize: 22, color: colors.ink },
  small: { color: colors.soft, fontSize: 12 },
  card: { borderRadius: 18, overflow: 'hidden', backgroundColor: colors.emerald, borderWidth: 1, borderColor: colors.goldLine },
  noPhoto: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.emerald },
  top: { flexDirection: 'row', justifyContent: 'space-between', padding: space.m, gap: space.s },
  topText: { color: colors.goldSoft, fontSize: 11, letterSpacing: 1.4, fontWeight: '700' },
  caption: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.m, gap: space.s, backgroundColor: '#061410cc' },
  name: { fontFamily: serif, fontSize: 30, lineHeight: 34, color: colors.ivory },
  place: { color: colors.goldSoft, fontSize: 13 },
  back: { flex: 1, padding: space.m, gap: space.s, backgroundColor: colors.paper },
  topDark: { flexDirection: 'row', justifyContent: 'space-between', gap: space.s },
  topDarkText: { color: colors.goldText, fontSize: 11, letterSpacing: 1.4, fontWeight: '700' },
  backHead: { fontFamily: serif, fontSize: 24, color: colors.ink },
  story: { color: colors.ink, fontSize: 15, lineHeight: 22 },
  facts: { marginTop: space.s, paddingTop: space.s, borderTopWidth: 1, borderTopColor: colors.line, gap: 2 },
  fact: { color: colors.soft, fontSize: 13, lineHeight: 19 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: space.s, paddingHorizontal: space.m },
  arrow: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.emerald },
  position: { color: colors.goldText, fontSize: 12, letterSpacing: 1.2, fontWeight: '700' },
  now: { fontFamily: serif, fontSize: 20, color: colors.ink },
});
