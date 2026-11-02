// A work as a small upright tile (photo on top) for horizontal rails; `extra` for a distance.
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { mediaUrl, type Item } from '@/lib/api';
import { currentLang } from '@/lib/i18n';
import { colors, serif, space, type } from '@/lib/theme';

export function WorkTile({ item, extra }: { item: Item; extra?: string }) {
  const photo = mediaUrl(item.image?.thumb ?? item.image?.src);
  return <Card padded={false} onPress={() => router.push(`/eser/${item.slug}`)}
    accessibilityLabel={[item.name, item.kind_label, item.city.name, extra].filter(Boolean).join(', ')}>
    {photo ? <Image source={photo} alt="" style={s.photo} contentFit="cover" transition={200} accessibilityIgnoresInvertColors />
      : <View style={[s.photo, s.empty]}><Ionicons name="business-outline" size={28} color={colors.goldLine} /></View>}
    <View style={s.body}>
      <Text style={s.kind} numberOfLines={1}>{item.kind_label.toLocaleUpperCase(currentLang() === 'tr' ? 'tr-TR' : 'en')}</Text>
      <Text style={s.name} numberOfLines={2}>{item.name}</Text>
      {extra && <Text style={s.extra}>{extra}</Text>}
    </View>
  </Card>;
}

const s = StyleSheet.create({
  photo: { height: 110, backgroundColor: colors.parchmentDeep },
  empty: { alignItems: 'center', justifyContent: 'center' },
  body: { padding: space.s + 4, gap: 2 },
  kind: { color: colors.goldText, letterSpacing: 1.2, fontWeight: '600', ...type.caption },
  name: { fontFamily: serif, color: colors.ink, fontSize: 16, lineHeight: 21 },
  extra: { color: colors.emeraldLight, fontWeight: '600', ...type.caption },
});
