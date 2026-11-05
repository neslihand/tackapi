// "Bir Eser, Üç Detay": written by an editor with its source, opened one at a time. A work without them shows nothing, so no
// empty promise on the page. Opening one counts once as a detail explored; it is not a stamp and not a qualifying action.
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Typography';
import { Eyebrow } from './UI';
import { track } from '@/lib/analytics';
import type { WorkDetail } from '@/lib/api';
import { t } from '@/lib/i18n';
import { colors, serif, space } from '@/lib/theme';

const title = (kind: WorkDetail['kind']) => ({ why: t('Neden yapıldı?', 'Why was it built?'), look: t('Neye dikkat etmelisin?', 'What should you look for?'), today: t('Bugün neden önemli?', 'Why does it matter today?') }[kind]);

export function ThreeDetails({ slug, details }: { slug: string; details: WorkDetail[] }) {
  const [open, setOpen] = useState<WorkDetail['kind'] | null>(null);
  if (!details.length) return null;
  function toggle(kind: WorkDetail['kind']) {
    if (open !== kind) track('heritage_detail_explored', slug, { detail_id: kind }, `detail:${slug}:${kind}`);
    setOpen(open === kind ? null : kind);
  }
  return <View style={s.box}>
    <Eyebrow>✦ {t('BİR ESER, ÜÇ DETAY', 'ONE WORK, THREE DETAILS')}</Eyebrow>
    {details.map(d => <View key={d.kind} style={s.row}>
      <Pressable onPress={() => toggle(d.kind)} style={s.head} accessibilityRole="button" accessibilityState={{ expanded: open === d.kind }} aria-expanded={open === d.kind}>
        <Text style={s.title}>{title(d.kind)}</Text>
        <Ionicons name={open === d.kind ? 'chevron-up' : 'chevron-down'} size={20} color={colors.goldText} />
      </Pressable>
      {open === d.kind && <View style={{ gap: space.xs, paddingBottom: space.s }}>
        <Text style={s.body}>{d.body}</Text>
        <Text style={s.source}>{t('Kaynak', 'Source')}: {d.source}</Text>
      </View>}
    </View>)}
  </View>;
}

const s = StyleSheet.create({
  box: { padding: space.m, gap: space.xs, borderRadius: 14, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  row: { borderTopWidth: 1, borderTopColor: colors.line },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s, minHeight: 48 },
  title: { flex: 1, fontFamily: serif, fontSize: 19, color: colors.ink },
  body: { color: colors.ink, fontSize: 15, lineHeight: 23 },
  source: { color: colors.soft, fontSize: 12, lineHeight: 17 },
});
