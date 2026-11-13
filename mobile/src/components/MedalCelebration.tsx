// The moment a medallion is earned: the struck coin, its name and what it was for, with "Paylaş" (the shareable card,
// ShareSheet) and the way to the passport. Each medallion is celebrated once (lib/medalSeen.ts); several earned at once
// come one after another. Mounted once in the root layout, over every screen.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Medallion } from '@/components/brand/Medallion';
import { NightGlow } from '@/components/brand/Gradient';
import { ShareSheet, type Shared } from '@/components/ShareSheet';
import { Button } from '@/components/UI';
import { currentLang, t } from '@/lib/i18n';
import { newlyEarned } from '@/lib/medalSeen';
import { buzz, useReducedMotion } from '@/lib/motion';
import { medals, type Medal } from '@/lib/passport';
import { useContent, usePassport } from '@/lib/store';
import { colors, fonts, hit, overlay, radius, serif, space, type } from '@/lib/theme';

const KEY = 'tackapi:medals-seen:v1';
const metalName = (m: Medal['metal']) => m === 'gold' ? t('Altın', 'Gold') : m === 'silver' ? t('Gümüş', 'Silver') : t('Bronz', 'Bronze');

export function MedalCelebration() {
  const { items, loading } = useContent();
  const { progress, ready } = usePassport();
  const [seen, setSeen] = useState<string[] | null | undefined>(undefined);   // undefined: not read yet
  const [queue, setQueue] = useState<Medal[]>([]);
  const [shared, setShared] = useState<Shared | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(KEY).then(raw => setSeen(raw ? JSON.parse(raw) as string[] : null), () => setSeen(null));
  }, []);
  const list = useMemo(() => medals(progress, items), [progress, items]);
  const earned = list.filter(m => m.value >= m.required).map(m => m.id).join();
  useEffect(() => {
    // only once the passport and the whole collection are in: a half-loaded list would hide and then "award" medals
    if (seen === undefined || !ready || loading || !items.length) return;
    const { fresh, seen: next } = newlyEarned(seen, earned ? earned.split(',') : []);
    if (seen !== null && !fresh.length) return;
    setSeen(next);
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
    if (fresh.length) {
      setQueue(q => [...q, ...list.filter(m => fresh.includes(m.id))]);
      buzz('success');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seen, ready, loading, items.length, earned]);

  const now = queue[0];
  const next = () => setQueue(q => q.slice(1));
  return <>
    <Modal visible={!!now && !shared} transparent animationType="fade" onRequestClose={next}>
      {now && <Celebration m={now} more={queue.length - 1}
        onShare={() => { setShared({ kind: 'medal', name: now.name, description: now.description, metal: now.metal, id: now.id }); }}
        onPassport={() => { next(); router.navigate('/pasaport'); }} onClose={next} />}
    </Modal>
    <ShareSheet shared={shared} onClose={() => { setShared(null); next(); }} />
  </>;
}

function Celebration({ m, more, onShare, onPassport, onClose }: { m: Medal; more: number; onShare: () => void; onPassport: () => void; onClose: () => void }) {
  const still = useReducedMotion();
  const pop = useRef(new Animated.Value(still ? 1 : 0.6)).current;
  useEffect(() => {
    if (still) return;
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }).start();
  }, [pop, still]);
  const upper = (x: string) => x.toLocaleUpperCase(currentLang() === 'tr' ? 'tr-TR' : 'en');
  return <View style={s.backdrop}>
    <View style={s.card} accessibilityViewIsModal accessibilityLiveRegion="assertive"
      accessibilityLabel={t(`Yeni madalyon: ${m.name}. ${m.description}`, `New medallion: ${m.name}. ${m.description}`)}>
      <NightGlow color={colors.gold} opacity={0.35} />
      <Text style={s.kicker}>✦ {upper(t('Yeni madalyon', 'New medallion'))} ✦</Text>
      <Animated.View style={{ transform: [{ scale: pop }] }}><Medallion metal={m.metal} earned symbol={m.id} size={170} /></Animated.View>
      <Text style={s.metal}>{upper(t(`${metalName(m.metal)} madalyon`, `${metalName(m.metal)} medallion`))}</Text>
      <Text style={s.name} accessibilityRole="header">{m.name}</Text>
      <Text style={s.body}>{m.description}</Text>
      <Text style={s.cheer}>{t('Bu iz artık senin. Arkadaşlarınla paylaş, onlar da keşfe çıksın.', 'This trace is yours now. Share it so your friends set out too.')}</Text>
      <Button kind="gold" icon="share-social-outline" label={t('Başarımı paylaş', 'Share my achievement')} onPress={onShare} style={s.wide} />
      <View style={s.row}>
        <Button kind="dark" light icon="ribbon-outline" label={t('Pasaportum', 'My passport')} onPress={onPassport} style={s.half} />
        <Button kind="dark" light label={more ? t(`Sıradaki (${more})`, `Next (${more})`) : t('Kapat', 'Close')} onPress={onClose} style={s.half} />
      </View>
    </View>
    <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('Kapat', 'Close')} importantForAccessibility="no" accessibilityElementsHidden />
  </View>;
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: overlay.shadeStrong, alignItems: 'center', justifyContent: 'center', padding: space.m },
  card: { zIndex: 1, width: '100%', maxWidth: 380, overflow: 'hidden', alignItems: 'center', gap: space.s, padding: space.l, borderRadius: radius.l,
    backgroundColor: colors.emerald, borderWidth: 1, borderColor: colors.nightStroke },
  kicker: { color: colors.gold, ...type.eyebrow, marginBottom: space.s },
  metal: { color: colors.goldSoft, ...type.eyebrow, marginTop: space.s },
  name: { fontFamily: serif, color: colors.ivory, fontSize: 32, lineHeight: 36, textAlign: 'center' },
  body: { color: colors.mist, ...type.body, textAlign: 'center' },
  cheer: { fontFamily: fonts.serifItalic, color: colors.goldSoft, fontSize: 18, lineHeight: 24, textAlign: 'center', marginVertical: space.s },
  wide: { alignSelf: 'stretch' },
  row: { flexDirection: 'row', gap: space.s, alignSelf: 'stretch', marginTop: space.xs },
  half: { flex: 1, minHeight: hit, paddingHorizontal: space.s },
});
