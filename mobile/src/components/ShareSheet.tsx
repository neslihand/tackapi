// The shareable card of a stamp or a medallion, previewed in a sheet; "Paylaş" turns the card into a picture
// (share.ts). The card says only what the passport says: which work, where, when and how it was stamped.
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRef, useState, type ComponentRef } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/Typography';
import { Button, Notice } from './UI';
import { track } from '@/lib/analytics';
import { t } from '@/lib/i18n';
import { CARD_HEIGHT, CARD_WIDTH, shareCard, shareVerb } from '@/lib/share';
import { colors, serif } from '@/lib/theme';

const ARCH = require('../../assets/icon.png');
const METAL = { bronze: '#a9773f', silver: '#b7b6b1', gold: colors.gold };

export type Shared =
  | { kind: 'stamp'; name: string; place: string; date: string; onSpot: boolean; photo: string | null }
  | { kind: 'medal'; name: string; description: string; metal: keyof typeof METAL };

export function ShareSheet({ shared, onClose }: { shared: Shared | null; onClose: () => void }) {
  const card = useRef<ComponentRef<typeof View>>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function share() {
    if (!shared) return;
    setBusy(true); setError(null);
    try { await shareCard(card, shared.name); track('share_initiated', undefined, { content_type: shared.kind }); }
    catch (e) { setError(String((e as Error)?.message ?? e)); }
    finally { setBusy(false); }
  }
  return <Modal visible={shared !== null} transparent animationType="fade" onRequestClose={onClose}>
    <View style={s.backdrop}>
      <View style={s.sheet}>
        <Pressable onPress={onClose} style={s.close} accessibilityRole="button" accessibilityLabel={t('Kapat', 'Close')} hitSlop={10}>
          <Ionicons name="close" size={22} color={colors.goldSoft} /></Pressable>
        {shared && <View ref={card} collapsable={false} style={s.card}>
          {shared.kind === 'stamp' && shared.photo && <Image source={shared.photo} alt="" style={StyleSheet.absoluteFill} contentFit="cover" />}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: shared.kind === 'stamp' && shared.photo ? '#082119c4' : colors.emerald }]} />
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
            <View style={[s.disc, { backgroundColor: METAL[shared.metal] }]}><Ionicons name="medal" size={40} color={colors.emeraldDeep} /></View>
            <Text style={s.name}>{shared.name}</Text>
            <Text style={[s.line, { textAlign: 'center' }]}>{shared.description}</Text>
          </View>}
          <Text style={s.foot}>EŞİK · {t('Tarihe Açılan Kapı', 'A Door to History')}</Text>
        </View>}
        {error && <Notice tone="warn" icon="alert-circle-outline">{error}</Notice>}
        <Button kind="gold" icon="share-social-outline" label={shareVerb()} onPress={share} busy={busy} style={{ alignSelf: 'stretch' }} />
      </View>
    </View>
  </Modal>;
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000000b3', alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: { alignItems: 'center', gap: 14, width: CARD_WIDTH },
  close: { alignSelf: 'flex-end', padding: 4 },
  card: { width: CARD_WIDTH, height: CARD_HEIGHT, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.emerald, justifyContent: 'space-between', padding: 26 },
  frame: { ...StyleSheet.absoluteFill, margin: 10, borderRadius: 12, borderWidth: 1, borderColor: '#c3a86980' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  arch: { width: 34, height: 34, borderRadius: 8 },
  kicker: { color: colors.gold, fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  middle: { alignItems: 'center', gap: 8 },
  seal: { width: 58, height: 58, borderRadius: 29, borderWidth: 2, borderColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  sealText: { color: colors.gold, fontSize: 11, letterSpacing: 1.8, fontWeight: '700' },
  disc: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.goldSoft },
  name: { fontFamily: serif, color: colors.goldSoft, fontSize: 27, lineHeight: 33, textAlign: 'center' },
  line: { color: '#e6e2d8', fontSize: 14, lineHeight: 20 },
  date: { color: '#cfcab9', fontSize: 13 },
  foot: { color: colors.gold, fontSize: 12, letterSpacing: 1, textAlign: 'center', fontFamily: serif },
});
