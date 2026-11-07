// Okuma Odası parts: the dark opening, the article card and the glossary card that opens when a marked term is tapped.
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from '@/components/Typography';
import { Button, Eyebrow, Title } from './UI';
import { mediaUrl } from '@/lib/api';
import { currentLang, t } from '@/lib/i18n';
import { capitalize, type ArticleItem, type ArticleKind, type GlossaryTerm } from '@/lib/reading';
import { colors, measure, overlay, serif, space } from '@/lib/theme';

const KIND_COLOR = { city_history: '#255747', heritage: '#765b38', culture: '#3e4f6b' };

/** The dark opening of each half of the room. */
export function ReadingBand({ kicker, title, italic, lede, note, action }: { kicker: string; title: string; italic: string; lede: string; note: string; action: ReactNode }) {
  return <View style={s.band}>
    <Eyebrow light>{kicker}</Eyebrow>
    <Title light>{title}</Title>
    <Text style={s.bandItalic}>{italic}</Text>
    <Text style={s.bandLede}>{lede}</Text>
    {action}
    <Text style={s.bandNote}>{note}</Text>
  </View>;
}

/** A cover without a photograph: an arch over the kind's colour, with the first letter of the title. */
export function CoverArt({ kind, title, style }: { kind: ArticleKind; title: string; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.art, style, { backgroundColor: KIND_COLOR[kind] }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <View style={[s.arch, { width: '74%', height: '86%' }]} />
    <View style={[s.arch, { width: '48%', height: '70%' }]} />
    <Text style={s.artLetter}>{title.trim().charAt(0).toLocaleUpperCase(currentLang() === 'en' ? 'en-GB' : 'tr-TR')}</Text>
  </View>;
}

export function ArticleCard({ a, wide = false }: { a: ArticleItem; wide?: boolean }) {
  // a cover whose file is missing on the server (uploaded on another machine) falls back to the drawn cover
  const [broken, setBroken] = useState(false);
  const cover = broken ? null : mediaUrl(wide ? a.cover?.src : a.cover?.thumb);
  return <Pressable onPress={() => router.push(`/makale/${a.slug}`)} accessibilityRole="button" accessibilityLabel={`${a.title}, ${a.kind_label}, ${t(`${a.reading_minutes} dakika okuma`, `${a.reading_minutes} minute read`)}`}
    style={({ pressed }) => [s.card, wide && s.cardWide, pressed && { opacity: 0.85 }]}>
    {cover ? <Image source={cover} alt="" style={wide ? s.coverWide : s.cover} contentFit="cover" transition={200} onError={() => setBroken(true)} accessibilityIgnoresInvertColors />
      : <CoverArt kind={a.kind} title={a.title} style={wide ? s.coverWide : s.cover} />}
    <View style={s.body}>
      <Text style={s.kicker}>{a.kind_label.toLocaleUpperCase('tr-TR')}{a.city ? ` · ${a.city.name.toLocaleUpperCase('tr-TR')}` : ''}{a.featured && wide ? ` · ${t('ÖNE ÇIKAN', 'FEATURED')}` : ''}</Text>
      <Text style={[s.title, wide && s.titleWide]} numberOfLines={wide ? 3 : 2}>{a.title}</Text>
      {!!a.summary && <Text style={s.summary} numberOfLines={wide ? 4 : 2}>{a.summary}</Text>}
      <Text style={s.meta}>{currentLang() === 'en' && a.lang === 'tr' ? 'In Turkish · ' : ''}{t(`${a.reading_minutes} dk okuma`, `${a.reading_minutes} min read`)} · {a.byline}</Text>
    </View>
  </Pressable>;
}

/** The definition of a term tapped in an article, in the words for children when the reader asked for them. */
export function TermSheet({ term, child = false, onClose }: { term: GlossaryTerm | null; child?: boolean; onClose: () => void }) {
  return <Modal visible={term !== null} transparent animationType="slide" onRequestClose={onClose}>
    <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel={t('Kapat', 'Close')}>
      {term && <Pressable style={s.sheet} onPress={() => {}}>
        <View style={s.sheetHead}>
          <Ionicons name="book-outline" size={20} color={colors.goldText} />
          <Text style={s.term}>{capitalize(term.term)}{term.term_en ? <Text style={s.termEn}> · {term.term_en}</Text> : null}</Text>
        </View>
        <Text style={s.definition}>{(child && term.definition_child) || term.definition}</Text>
        <View style={{ flexDirection: 'row', gap: space.s }}>
          <Button style={{ flex: 1 }} kind="plain" label={t('Kapat', 'Close')} onPress={onClose} />
          <Button style={{ flex: 1 }} icon="arrow-forward" label={t('Sözlükte aç', 'Open in glossary')} onPress={() => { onClose(); router.push(`/terim/${term.slug}`); }} />
        </View>
      </Pressable>}
    </Pressable>
  </Modal>;
}

const s = StyleSheet.create({
  band: { padding: space.l, borderRadius: 18, backgroundColor: colors.emerald, borderWidth: 1, borderColor: colors.goldLine, gap: space.s },
  bandItalic: { fontFamily: serif, fontStyle: 'italic', fontSize: 34, lineHeight: 38, color: colors.gold, marginTop: -space.s },
  bandLede: { color: '#e6e2d8', fontSize: 14, lineHeight: 21 },
  bandNote: { color: colors.mist, fontSize: 12, lineHeight: 18 },
  card: { flexDirection: 'row', backgroundColor: colors.paper, borderRadius: 14, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  cardWide: { flexDirection: 'column' },
  cover: { width: 96, minHeight: 124 },
  coverWide: { width: '100%', height: 190 },
  art: { alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' },
  arch: { position: 'absolute', bottom: 0, borderTopLeftRadius: 999, borderTopRightRadius: 999, borderWidth: 1, borderBottomWidth: 0, borderColor: '#e6d5ae55' },
  artLetter: { fontFamily: serif, fontSize: 40, color: colors.goldSoft, marginBottom: 12 },
  body: { flex: 1, padding: 12, gap: 3 },
  kicker: { color: colors.goldText, fontSize: 10.5, letterSpacing: 1.3, fontWeight: '600' },
  title: { fontFamily: serif, fontSize: 18, color: colors.ink },
  titleWide: { fontSize: 26, lineHeight: 31 },
  summary: { color: colors.soft, fontSize: 13, lineHeight: 18 },
  meta: { color: colors.soft, fontSize: 12, marginTop: 2 },
  backdrop: { flex: 1, backgroundColor: overlay.backdrop, justifyContent: 'flex-end' },
  sheet: { width: '100%', maxWidth: measure.app, alignSelf: 'center', backgroundColor: colors.parchment, padding: space.l, gap: space.s + 2, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: 2, borderColor: colors.gold },
  sheetHead: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  term: { fontFamily: serif, fontSize: 22, color: colors.ink, flex: 1 },
  termEn: { fontSize: 16, color: colors.soft, fontStyle: 'italic' },
  definition: { color: colors.ink, fontSize: 16, lineHeight: 24 },
  child: { color: colors.soft, fontSize: 14, lineHeight: 21 },
});
