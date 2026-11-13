// The green leather cover of the heritage passport, as on the site (frontend/src/pages/Collection.tsx .passport-cover):
// small capitals above and below, a double frame with the compass, the title and the motto. Sits on top of the stamp
// paper, so the two read as one opened booklet.
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { currentLang, t } from '@/lib/i18n';
import { fonts, passportCover, serif, space, type } from '@/lib/theme';

const upper = (s: string) => s.toLocaleUpperCase(currentLang() === 'tr' ? 'tr-TR' : 'en');

/** The leather's faint diagonal grain. */
function Grain() {
  return <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Svg width="100%" height="100%">
      {Array.from({ length: 60 }, (_, i) => <Line key={i} x1={-200 + i * 12} y1={0} x2={i * 12} y2={900} stroke={passportCover.grain} strokeWidth={1} />)}
    </Svg>
  </View>;
}

export function PassportCover({ owner }: { owner?: string | null }) {
  return <View style={s.cover} accessible accessibilityRole="header" accessibilityLabel={t('Miras Pasaportu', 'Heritage Passport')}>
    <Grain />
    <Text style={s.small}>{upper(t('Türkiye kültürel mirası', 'Cultural heritage of Türkiye'))}</Text>
    <View style={s.outer}><View style={s.frame}>
      <Ionicons name="compass-outline" size={58} color={passportCover.letters} />
      <Text style={s.title}>{upper(t('Miras', 'Heritage'))}{'\n'}{upper(t('Pasaportu', 'Passport'))}</Text>
      <View style={s.rule}><View style={s.ruleLine} /><Text style={s.ruleMark}>✦</Text><View style={s.ruleLine} /></View>
      <Text style={s.motto}>{t('Merakla başlayan\nbir ömürlük yolculuk.', 'A lifelong journey\nthat starts with curiosity.')}</Text>
      {!!owner && <Text style={s.owner} numberOfLines={1}>{owner}</Text>}
    </View></View>
    <Text style={s.small}>{upper(t('TAÇKAPI · Dijital keşif günlüğü', 'TAÇKAPI · Digital discovery journal'))}</Text>
  </View>;
}

const s = StyleSheet.create({
  cover: { overflow: 'hidden', alignItems: 'center', gap: space.m, paddingVertical: space.l, paddingHorizontal: space.l, backgroundColor: passportCover.leather,
    borderTopLeftRadius: 6, borderTopRightRadius: 6, borderWidth: 6, borderColor: passportCover.rim },
  small: { color: passportCover.letters, textAlign: 'center', fontFamily: fonts.sansMedium, fontSize: 10, lineHeight: 14, letterSpacing: 1.6 },
  outer: { width: '100%', padding: 5, borderWidth: 1, borderColor: passportCover.grain },
  frame: { alignItems: 'center', gap: space.m, paddingVertical: space.l, paddingHorizontal: space.s, borderWidth: 1, borderColor: passportCover.frame },
  title: { fontFamily: serif, color: passportCover.letters, textAlign: 'center', fontSize: 30, lineHeight: 36, letterSpacing: 3 },
  rule: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  ruleLine: { width: 44, height: StyleSheet.hairlineWidth, backgroundColor: passportCover.letters },
  ruleMark: { color: passportCover.letters, fontSize: 10 },
  motto: { fontFamily: fonts.serifItalic, color: passportCover.motto, textAlign: 'center', ...type.heading, fontSize: 18, lineHeight: 25 },
  owner: { color: passportCover.letters, fontFamily: fonts.sansSemi, fontSize: 11, letterSpacing: 1.4 },
});
