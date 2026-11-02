// A large photo card with a dark shade, eyebrow, title, short text and up to two actions.
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Eyebrow, type IconName } from '@/components/UI';
import { colors, overlay, radius, serif, shadow, space, type } from '@/lib/theme';

export type HeroAction = { label: string; icon?: IconName; onPress: () => void; kind?: 'dark' | 'gold' | 'plain' };

export function HeroCard({ image, eyebrow, title, body, actions = [], onPress, accessibilityLabel }: {
  image?: string; eyebrow?: string; title: string; body?: string;
  actions?: [] | [HeroAction] | [HeroAction, HeroAction];
  onPress?: () => void; accessibilityLabel?: string;
}) {
  const text = <>
    {eyebrow && <Eyebrow light>{eyebrow}</Eyebrow>}
    <Text accessibilityRole="header" style={styles.title}>{title}</Text>
    {body && <Text style={styles.body} numberOfLines={3}>{body}</Text>}
  </>;
  return <View style={styles.card}>
    {image ? <Image source={image} alt="" style={StyleSheet.absoluteFill} contentFit="cover" transition={200} accessibilityIgnoresInvertColors />
      : null}
    <View style={[StyleSheet.absoluteFill, { backgroundColor: image ? overlay.shade : colors.emerald }]} />
    {image && <View style={styles.band} />}
    <View style={styles.content}>
      {onPress
        ? <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? [eyebrow, title, body].filter(Boolean).join(', ')}
            onPress={onPress} style={({ pressed }) => [styles.text, pressed && { opacity: 0.85 }]}>{text}</Pressable>
        : <View style={styles.text}>{text}</View>}
      {actions.length > 0 && <View style={styles.actions}>
        {actions.map((a, i) => <Button key={a.label} label={a.label} icon={a.icon} onPress={a.onPress}
          kind={a.kind ?? (i === 0 ? 'gold' : 'dark')} light style={styles.action} />)}
      </View>}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  card: { minHeight: 240, borderRadius: radius.l, borderWidth: 1, borderColor: colors.goldLine, overflow: 'hidden', backgroundColor: colors.emerald, justifyContent: 'flex-end', ...shadow.card },
  band: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%', backgroundColor: overlay.shadeStrong, opacity: 0.6 },
  content: { padding: space.m, gap: space.m },
  text: { gap: space.xs },
  title: { fontFamily: serif, color: colors.goldSoft, ...type.title },
  body: { color: colors.parchment, ...type.body },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  action: { flexGrow: 1, paddingHorizontal: space.m },
});
