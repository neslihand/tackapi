// The shareable card of a stamp or a medallion, previewed in a sheet; "Paylaş" turns the card into a picture
// (share.ts). The card says only what the passport says: which work, where, when and how it was stamped. A Detay Avı
// card never names the work: only the puzzle's number, the tries and a blurred close-up.
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRef, useState, type ComponentRef } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/Typography';
import { Medallion } from './brand/Medallion';
import { HuntMarks, huntScore, HuntZoom } from './HuntZoom';
import { Button, Notice } from './UI';
import { track } from '@/lib/analytics';
import type { Focus } from '@/lib/autoHunt';
import { t } from '@/lib/i18n';
import { CARD_HEIGHT, CARD_WIDTH, shareCard, shareVerb } from '@/lib/share';
import { colors, metal as METAL, overlay, serif, space } from '@/lib/theme';

const ARCH = require('../../assets/icon.png');

export type Shared =
  | { kind: 'stamp'; name: string; place: string; date: string; onSpot: boolean; photo: string | null }
  | { kind: 'medal'; name: string; description: string; metal: keyof typeof METAL; id?: string }
  | { kind: 'hunt'; number: number; marks: ('right' | 'wrong')[]; solved: boolean; photo: string | null; focus: Focus };

const metalWord = (m: keyof typeof METAL) => m === 'gold' ? t('ALTIN MADALYON KAZANDIM', 'I EARNED A GOLD MEDALLION') : m === 'silver' ? t('GÜMÜŞ MADALYON KAZANDIM', 'I EARNED A SILVER MEDALLION') : t('BRONZ MADALYON KAZANDIM', 'I EARNED A BRONZE MEDALLION');
const huntTitle = (n: number) => t(`TAÇKAPI Detay Avı #${n}`, `TAÇKAPI Detail Hunt #${n}`);

export function ShareSheet({ shared, onClose }: { shared: Shared | null; onClose: () => void }) {
  const card = useRef<ComponentRef<typeof View>>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function share() {
    if (!shared) return;
    setBusy(true); setError(null);
    try { await shareCard(card, shared.kind === 'hunt' ? huntTitle(shared.number) : shared.name); track('share_initiated', undefined, { content_type: shared.kind }); }
    catch (e) { setError(String((e as Error)?.message ?? e)); }
    finally { setBusy(false); }
  }
  return <Modal visible={shared !== null} transparent animationType="fade" onRequestClose={onClose}>
    <View style={s.backdrop}>
      <View style={s.sheet}>
        <Pressable onPress={onClose} style={s.close} accessibilityRole="button" accessibilityLabel={t('Kapat', 'Close')} hitSlop={10}>
          <Ionicons name="close" size={22} color={colors.goldSoft} /></Pressable>
        {shared?.kind === 'hunt' ? <View ref={card} collapsable={false} style={s.card} accessible
          accessibilityLabel={`${huntTitle(shared.number)}. ${huntScore(shared.solved, shared.marks.length, 'me')}`}>
          <HuntZoom src={shared.photo} focus={shared.focus} scale={4} size={CARD_HEIGHT} blur={14} label=""
            style={{ position: 'absolute', top: 0, left: (CARD_WIDTH - CARD_HEIGHT) / 2 }} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: shared.photo ? overlay.shadeStrong : colors.emerald }]} />
          <View style={s.frame} />
          <View style={s.top}>
            <Image source={ARCH} alt="" style={s.arch} contentFit="cover" />
            <Text style={s.kicker}>✦ {t('TAÇKAPI DETAY AVI', 'TAÇKAPI DETAIL HUNT')}</Text>
          </View>
          <View style={s.middle}>
            <Text style={s.number}>#{shared.number}</Text>
            <HuntMarks light marks={shared.marks} size={space.xl} label="" />
            <Text style={[s.line, { textAlign: 'center' }]}>{huntScore(shared.solved, shared.marks.length, 'me')}</Text>
            <Text style={[s.date, { textAlign: 'center' }]}>{t('Bugünün ayrıntısını sen de bul.', 'Find today’s detail too.')}</Text>
          </View>
          <Text style={s.foot}>TAÇKAPI · {t('Tarihe Açılan Kapı', 'A Door to History')}</Text>
        </View> : shared && <View ref={card} collapsable={false} style={s.card}>
          {shared.kind === 'stamp' && shared.photo && <Image source={shared.photo} alt="" style={StyleSheet.absoluteFill} contentFit="cover" />}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: shared.kind === 'stamp' && shared.photo ? overlay.shade : colors.emerald }]} />
          <View style={s.frame} />
          <View style={s.top}>
            <Image source={ARCH} alt="" style={s.arch} contentFit="cover" />
            <Text style={s.kicker}>✦ {shared.kind === 'stamp' ? t('MİRAS PASAPORTU', 'HERITAGE PASSPORT') : t('MİRAS MADALYONU', 'HERITAGE MEDALLION')}</Text>
          </View>
          {shared.kind === 'stamp' ? <View style={s.middle}>
            <View style={[s.seal, shared.onSpot && { backgroundColor: colors.gold }]}>
              <Ionicons name={shared.onSpot ? 'ribbon' : 'checkmark'} size={26} color={shared.onSpot ? colors.emeraldDeep : colors.gold} />
            </View>
            <Text style={s.sealText}>{shared.onSpot ? t('YERİNDE MÜHÜRLENDİ', 'STAMPED ON THE SPOT') : t('PASAPORTA MÜHÜRLENDİ', 'STAMPED IN THE PASSPORT')}</Text>
            <Text style={s.name} numberOfLines={3}>{shared.name}</Text>
            <Text style={s.line}>{shared.place}</Text>
            <Text style={s.date}>{shared.date}</Text>
          </View> : <View style={s.middle}>
            <Medallion metal={shared.metal} earned symbol={shared.id} size={150} />
            <Text style={s.sealText}>{metalWord(shared.metal)}</Text>
            <Text style={s.name}>{shared.name}</Text>
            <Text style={[s.line, { textAlign: 'center' }]}>{shared.description}</Text>
          </View>}
          <Text style={s.foot}>TAÇKAPI · {t('Tarihe Açılan Kapı', 'A Door to History')}</Text>
        </View>}
        {error && <Notice tone="warn" icon="alert-circle-outline">{error}</Notice>}
        <Button kind="gold" icon="share-social-outline" label={shareVerb()} onPress={share} busy={busy} style={{ alignSelf: 'stretch' }} />
      </View>
    </View>
  </Modal>;
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: overlay.backdrop, alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: { alignItems: 'center', gap: 14, width: CARD_WIDTH },
  close: { alignSelf: 'flex-end', padding: 4 },
  card: { width: CARD_WIDTH, height: CARD_HEIGHT, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.emerald, justifyContent: 'space-between', padding: 26 },
  frame: { ...StyleSheet.absoluteFill, margin: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.goldLine },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  arch: { width: 34, height: 34, borderRadius: 8 },
  kicker: { color: colors.gold, fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  middle: { alignItems: 'center', gap: 8 },
  seal: { width: 58, height: 58, borderRadius: 29, borderWidth: 2, borderColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  sealText: { color: colors.gold, fontSize: 11, letterSpacing: 1.8, fontWeight: '700' },
  number: { fontFamily: serif, color: colors.goldSoft, fontSize: 64, lineHeight: 72 },
  name: { fontFamily: serif, color: colors.goldSoft, fontSize: 27, lineHeight: 33, textAlign: 'center' },
  line: { color: colors.mist, fontSize: 14, lineHeight: 20 },
  date: { color: colors.mist, fontSize: 13 },
  foot: { color: colors.gold, fontSize: 12, letterSpacing: 1, textAlign: 'center', fontFamily: serif },
});
