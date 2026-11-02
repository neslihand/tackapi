// Small controls: chips, segmented control, progress bar, answer option and stat pill.
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { IconName } from '@/components/UI';
import { t } from '@/lib/i18n';
import { colors, hit, radius, space, type } from '@/lib/theme';

/** A filter chip; selected chips are filled and show a check, so state is not told by colour alone. Without onPress
 *  it is a read-only label, as low as a StatPill (no touch target needed). `radio` for one choice out of a few. */
export function Chip({ label, selected, icon, onPress, accessibilityLabel, radio }: {
  label: string; selected?: boolean; icon?: IconName; onPress?: () => void; accessibilityLabel?: string; radio?: boolean;
}) {
  const fg = selected ? colors.goldSoft : colors.ink;
  const iconName = selected ? 'checkmark' : icon;
  return <Pressable accessibilityRole={!onPress ? 'text' : radio ? 'radio' : 'button'} accessibilityLabel={accessibilityLabel ?? label}
    accessibilityState={radio ? { checked: !!selected } : { selected: !!selected }} aria-checked={radio ? !!selected : undefined} aria-pressed={radio || !onPress ? undefined : !!selected}
    disabled={!onPress} onPress={onPress}
    style={({ pressed }) => [styles.chip, !onPress && styles.chipStatic, selected && styles.chipOn, pressed && { opacity: 0.8 }]}>
    {iconName && <Ionicons name={iconName} size={16} color={fg} />}
    <Text style={[styles.chipText, { color: fg }]}>{label}</Text>
  </Pressable>;
}

/** 2–4 mutually exclusive segments, announced as tabs. */
export function SegmentedControl<K extends string>({ options, value, onChange, accessibilityLabel }: {
  options: readonly { key: K; label: string }[]; value: K; onChange: (key: K) => void; accessibilityLabel: string;
}) {
  return <View accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} style={styles.segments}>
    {options.map(o => {
      const on = o.key === value;
      return <Pressable key={o.key} accessibilityRole="tab" accessibilityLabel={o.label} accessibilityState={{ selected: on }} aria-selected={on}
        onPress={() => !on && onChange(o.key)} style={[styles.segment, on && styles.segmentOn]}>
        <Text style={[styles.segmentText, on && styles.segmentTextOn]} numberOfLines={1}>{o.label}</Text>
      </Pressable>;
    })}
  </View>;
}

/** value of max; screen readers hear "3/5" (or the given label). */
export function ProgressBar({ value, max, label, accessibilityLabel, tone = 'light' }: {
  value: number; max: number; label?: string; accessibilityLabel?: string; tone?: 'light' | 'dark';
}) {
  const now = Math.max(0, Math.min(value, max));
  const pct = max > 0 ? (now / max) * 100 : 0;
  // without its own name a progress bar is named by its visible label
  return <View accessibilityRole="progressbar" accessibilityLabel={accessibilityLabel ?? (label || `${now}/${max}`)}
    accessibilityValue={{ min: 0, max, now, text: label ?? `${now}/${max}` }} style={styles.progress}>
    <View style={[styles.track, tone === 'dark' && styles.trackDark]}>
      <View style={[styles.fill, tone === 'dark' && { backgroundColor: colors.gold }, { width: `${pct}%` }]} />
    </View>
    {label !== '' && <Text style={[styles.progressText, tone === 'dark' && { color: colors.goldSoft }]}>{label ?? `${now}/${max}`}</Text>}
  </View>;
}

/** A multiple-choice answer. Once answered the right one shows a check and the picked wrong one a cross, each with a
 *  written tag, so the result is not told by colour alone. */
export function AnswerOption({ label, state, onPress }: { label: string; state: 'open' | 'right' | 'wrong' | 'other'; onPress: () => void }) {
  const tag = state === 'right' ? t('Doğru cevap', 'The right answer') : state === 'wrong' ? t('Senin cevabın', 'Your answer') : null;
  return <Pressable accessibilityRole="button" accessibilityLabel={tag ? `${label}, ${tag}` : label} accessibilityState={{ disabled: state !== 'open' }}
    disabled={state !== 'open'} onPress={onPress}
    style={({ pressed }) => [styles.option, state === 'right' && styles.optionRight, state === 'wrong' && styles.optionWrong, pressed && { opacity: 0.85 }]}>
    <View style={styles.optionBody}>
      <Text style={[styles.optionText, state === 'right' && { color: colors.goldSoft }, state === 'other' && { color: colors.soft }]}>{label}</Text>
      {tag && <Text style={[styles.optionTag, { color: state === 'right' ? colors.gold : colors.danger }]}>{tag}</Text>}
    </View>
    {state === 'right' && <Ionicons name="checkmark-circle" size={22} color={colors.gold} />}
    {state === 'wrong' && <Ionicons name="close-circle" size={22} color={colors.danger} />}
  </Pressable>;
}

/** Icon + number + label, e.g. a streak; read as one phrase. */
export function StatPill({ icon, value, label, tone = 'light' }: { icon: IconName; value: number | string; label: string; tone?: 'light' | 'dark' }) {
  const dark = tone === 'dark';
  return <View accessible accessibilityRole="text" accessibilityLabel={`${value} ${label}`} style={[styles.pill, dark && styles.pillDark]}>
    <Ionicons name={icon} size={16} color={dark ? colors.gold : colors.goldText} />
    <Text style={[styles.pillValue, dark && { color: colors.goldSoft }]}>{value}</Text>
    <Text style={[styles.pillLabel, dark && { color: colors.goldSoft }]}>{label}</Text>
  </View>;
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: hit, paddingHorizontal: space.m, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.goldLine, backgroundColor: colors.paper },
  chipStatic: { minHeight: 32, alignSelf: 'flex-start' },
  chipOn: { backgroundColor: colors.emerald, borderColor: colors.emerald },
  chipText: { fontWeight: '500', ...type.body },
  segments: { flexDirection: 'row', padding: space.xs, gap: space.xs, borderRadius: radius.m, borderWidth: 1, borderColor: colors.goldLine, backgroundColor: colors.parchmentDeep },
  segment: { flex: 1, minHeight: hit, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xs, borderRadius: radius.s },
  segmentOn: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.goldLine },
  segmentText: { color: colors.soft, fontWeight: '500', ...type.body },
  segmentTextOn: { color: colors.ink, fontWeight: '700' },
  progress: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  track: { flex: 1, height: 8, borderRadius: radius.pill, backgroundColor: colors.parchmentDeep, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  trackDark: { backgroundColor: colors.emeraldDeep, borderColor: colors.goldLine },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.emeraldLight },
  progressText: { color: colors.soft, fontWeight: '600', ...type.caption },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.s, minHeight: hit + space.s, paddingHorizontal: space.m, paddingVertical: space.s, borderRadius: radius.m, borderWidth: 1, borderColor: colors.goldLine, backgroundColor: colors.paper },
  optionRight: { backgroundColor: colors.emerald, borderColor: colors.gold },
  optionWrong: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  optionBody: { flex: 1, gap: 2 },
  optionText: { color: colors.ink, ...type.body },
  optionTag: { fontWeight: '700', ...type.caption },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, paddingHorizontal: space.m - 4, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.goldLine, backgroundColor: colors.paper, alignSelf: 'flex-start' },
  pillDark: { backgroundColor: colors.emeraldDeep },
  pillValue: { color: colors.ink, fontWeight: '700', ...type.body },
  pillLabel: { color: colors.soft, ...type.caption },
});
