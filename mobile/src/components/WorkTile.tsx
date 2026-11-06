// A work as a small upright tile for horizontal rails, as the site's arched gallery (home.css): the photo (or the
// type's drawing) under an arch with a fine gold frame, then the type, the name and `extra` (a distance) below it.
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ArchPlaceholder } from '@/components/brand/ArchPlaceholder';
import { mediaUrl, type Item } from '@/lib/api';
import { currentLang } from '@/lib/i18n';
import { colors, fonts, motion, radius, serif, space, type } from '@/lib/theme';

const ARCH_H = 190;

export function WorkTile({ item, extra }: { item: Item; extra?: string }) {
  const photo = mediaUrl(item.image?.thumb ?? item.image?.src);
  return <Pressable onPress={() => router.push(`/eser/${item.slug}`)} accessibilityRole="button"
    accessibilityLabel={[item.name, item.kind_label, item.city.name, extra].filter(Boolean).join(', ')}
    style={({ pressed }) => [s.tile, pressed && { opacity: motion.pressOpacity, transform: [{ scale: motion.pressScale }] }]}>
    <View style={s.frame}>
      <View style={s.arch}>
        {photo ? <Image source={photo} alt="" style={StyleSheet.absoluteFill} contentFit="cover" transition={200} accessibilityIgnoresInvertColors />
          : <ArchPlaceholder kind={item.kind} kind_label={item.kind_label} width={160} height={ARCH_H} />}
      </View>
    </View>
    <View style={s.body}>
      <Text style={s.kind} numberOfLines={1}>{item.kind_label.toLocaleUpperCase(currentLang() === 'tr' ? 'tr-TR' : 'en')} · {item.city.name.toLocaleUpperCase(currentLang() === 'tr' ? 'tr-TR' : 'en')}</Text>
      <Text style={s.name} numberOfLines={2}>{item.name}</Text>
      {extra && <Text style={s.extra}>{extra}</Text>}
    </View>
  </Pressable>;
}

const s = StyleSheet.create({
  tile: { gap: space.s },
  // the gold hairline sits 4px outside the arched picture
  frame: { padding: 4, borderWidth: 1, borderColor: colors.ivoryLine, borderTopLeftRadius: radius.pill, borderTopRightRadius: radius.pill, borderBottomLeftRadius: radius.hair, borderBottomRightRadius: radius.hair },
  arch: { height: ARCH_H, overflow: 'hidden', backgroundColor: colors.emerald, borderTopLeftRadius: radius.pill, borderTopRightRadius: radius.pill, borderBottomLeftRadius: radius.hair, borderBottomRightRadius: radius.hair },
  body: { gap: 2, paddingHorizontal: 2 },
  kind: { color: colors.goldText, ...type.eyebrow, fontSize: 9.5, lineHeight: 13, letterSpacing: 1.4 },
  name: { fontFamily: serif, color: colors.ink, fontSize: 18, lineHeight: 21 },
  extra: { color: colors.emeraldLight, ...type.caption, fontFamily: fonts.sansSemi },
});
