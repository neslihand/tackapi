// The bottom bar: night green under a fine gold line, the active place lit in gold with a small arch over its icon, and
// Tara raised in the middle as the gold key (the site's .en-key), since scanning a building is the phone's own gesture.
import { Ionicons } from '@expo/vector-icons';
import type { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { VerticalFill } from '@/components/brand/Gradient';
import type { IconName } from '@/components/UI';
import { buzz } from '@/lib/motion';
import { colors, control, fonts, gradients, hit, radius, shadow, space, type } from '@/lib/theme';

type BarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

// each tab's icon, outlined at rest and filled when it is the place being looked at
const ICONS: Record<string, [IconName, IconName]> = {
  index: ['sunny-outline', 'sunny'], kesfet: ['compass-outline', 'compass'], kamera: ['scan-outline', 'scan'],
  oyna: ['extension-puzzle-outline', 'extension-puzzle'], pasaport: ['book-outline', 'book'],
};
const CENTRE = 'kamera';
const KEY = 58;

/** A small arch drawn over the active icon, the site's door in miniature. */
function Arch() {
  return <Svg width={30} height={9} viewBox="0 0 30 9" style={s.arch} pointerEvents="none">
    <Path d="M2 9 V6 Q2 1 15 1 Q28 1 28 6 V9" fill="none" stroke={colors.goldSoft} strokeWidth={1.3} strokeLinecap="round" />
  </Svg>;
}

export function TabBar({ state, descriptors, emitter, navigateToTab, insets }: BarProps) {
  return <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, space.s) }]}>
    {state.routes.map((route, i) => {
      const { options } = descriptors[route.key];
      const focused = state.index === i;
      const label = typeof options.title === 'string' ? options.title : route.name;
      const [rest, lit] = ICONS[route.name] ?? ['ellipse-outline', 'ellipse'];
      const press = () => {
        const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
        if (!focused && !event.defaultPrevented) { buzz('light'); navigateToTab(route.key); }
      };
      const a11y = { accessibilityRole: 'tab' as const, accessibilityLabel: label, accessibilityState: { selected: focused }, onPress: press,
        onLongPress: () => emitter.emit({ type: 'tabLongPress', target: route.key }) };
      if (route.name === CENTRE) return <Pressable key={route.key} {...a11y} style={({ pressed }) => [s.tab, pressed && s.pressed]}>
        <View style={s.keyFrame}>
          <View style={s.key}><View style={s.keyPlate}><VerticalFill colors={gradients.gold} /></View>
            <Ionicons name={focused ? lit : rest} size={26} color={colors.onGold} /></View>
        </View>
        <Text style={[s.label, s.keyLabel, focused && s.labelOn]}>{label}</Text>
      </Pressable>;
      return <Pressable key={route.key} {...a11y} style={({ pressed }) => [s.tab, pressed && s.pressed]}>
        <View style={s.iconBox}>
          {focused && <Arch />}
          <Ionicons name={focused ? lit : rest} size={22} color={focused ? colors.goldSoft : colors.tabInactive} />
        </View>
        <Text style={[s.label, focused && s.labelOn]} numberOfLines={1}>{label}</Text>
        {/* the active tab is also marked by a dot, so it is not told by colour alone */}
        <View style={[s.dot, focused && s.dotOn]} />
      </Pressable>;
    })}
  </View>;
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'flex-end', paddingTop: space.xs, paddingHorizontal: space.xs, backgroundColor: colors.emeraldDeep,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.nightStroke },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', minHeight: control.tabBar - space.s, minWidth: hit, gap: 2 },
  pressed: { opacity: 0.8 },
  iconBox: { width: 36, height: 30, alignItems: 'center', justifyContent: 'flex-end' },
  arch: { position: 'absolute', top: 0 },
  label: { ...type.caption, fontSize: 11, fontFamily: fonts.sansMedium, color: colors.tabInactive, letterSpacing: 0.3 },
  labelOn: { color: colors.goldSoft },
  dot: { width: 4, height: 4, borderRadius: radius.pill, marginTop: 1 },
  dotOn: { backgroundColor: colors.goldSoft },
  // the raised gold key, with the thin frame 4px outside it
  keyFrame: { marginTop: -KEY / 2 - space.xs, padding: control.frameGap, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.goldFrame, backgroundColor: colors.emeraldDeep },
  key: { width: KEY, height: KEY, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', ...shadow.glow },
  keyPlate: { ...StyleSheet.absoluteFill, borderRadius: radius.pill, overflow: 'hidden' },
  keyLabel: { marginBottom: 5 },
});
