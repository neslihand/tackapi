// Okuma Odası parts: the article card and the glossary card that opens when a marked term is tapped in an article.
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from './UI';
import { mediaUrl } from '@/lib/api';
import { currentLang, t } from '@/lib/i18n';
import { capitalize, type ArticleItem, type GlossaryTerm } from '@/lib/reading';
import { colors, overlay, serif, space } from '@/lib/theme';

const KIND_COLOR = { city_history: '#255747', heritage: '#765b38', culture: '#3e4f6b' };

export function ArticleCard({ a }: { a: ArticleItem }) {
  const cover = mediaUrl(a.cover?.thumb);
  return <Pressable onPress={() => router.push(`/makale/${a.slug}`)} accessibilityRole="button" accessibilityLabel={`${a.title}, ${a.kind_label}, ${t(`${a.reading_minutes} dakika okuma`, `${a.reading_minutes} minute read`)}`}
    style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }]}>
    {cover ? <Image source={cover} alt="" style={s.cover} contentFit="cover" transition={200} accessibilityIgnoresInvertColors />
      : <View style={[s.cover, s.art, { backgroundColor: KIND_COLOR[a.kind] }]}><Text style={s.artLetter}>{a.title.trim().charAt(0).toLocaleUpperCase('tr-TR')}</Text></View>}
    <View style={s.body}>
      <Text style={s.kicker}>{a.kind_label.toLocaleUpperCase('tr-TR')}{a.city ? ` · ${a.city.name.toLocaleUpperCase('tr-TR')}` : ''}{a.featured ? ` · ${t('ÖNE ÇIKAN', 'FEATURED')}` : ''}</Text>
      <Text style={s.title} numberOfLines={2}>{a.title}</Text>
      {!!a.summary && <Text style={s.summary} numberOfLines={2}>{a.summary}</Text>}
      <Text style={s.meta}>{currentLang() === 'en' && a.lang === 'tr' ? 'In Turkish · ' : ''}{t(`${a.reading_minutes} dk okuma`, `${a.reading_minutes} min read`)} · {a.byline}</Text>
    </View>
  </Pressable>;
}

/** The definition of a term tapped in an article; the child definition when the article is read in the child mode. */
export function TermSheet({ term, onClose }: { term: GlossaryTerm | null; onClose: () => void }) {
  return <Modal visible={term !== null} transparent animationType="slide" onRequestClose={onClose}>
    <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel={t('Kapat', 'Close')}>
      {term && <Pressable style={s.sheet} onPress={() => {}}>
        <View style={s.sheetHead}>
          <Ionicons name="book-outline" size={20} color={colors.goldText} />
          <Text style={s.term}>{capitalize(term.term)}{term.term_en ? <Text style={s.termEn}> · {term.term_en}</Text> : null}</Text>
        </View>
        <Text style={s.definition}>{term.definition}</Text>
        {!!term.definition_child && <Text style={s.child}>{t('Çocuklar için: ', 'For children: ')}{term.definition_child}</Text>}
        <View style={{ flexDirection: 'row', gap: space.s }}>
          <Button style={{ flex: 1 }} kind="plain" label={t('Kapat', 'Close')} onPress={onClose} />
          <Button style={{ flex: 1 }} icon="arrow-forward" label={t('Sözlükte aç', 'Open in glossary')} onPress={() => { onClose(); router.push(`/terim/${term.slug}`); }} />
        </View>
      </Pressable>}
    </Pressable>
  </Modal>;
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', backgroundColor: colors.paper, borderRadius: 14, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  cover: { width: 96, minHeight: 124 },
  art: { alignItems: 'center', justifyContent: 'center' },
  artLetter: { fontFamily: serif, fontSize: 40, color: colors.goldSoft },
  body: { flex: 1, padding: 12, gap: 3 },
  kicker: { color: colors.goldText, fontSize: 10.5, letterSpacing: 1.3, fontWeight: '600' },
  title: { fontFamily: serif, fontSize: 18, color: colors.ink },
  summary: { color: colors.soft, fontSize: 13, lineHeight: 18 },
  meta: { color: colors.soft, fontSize: 12, marginTop: 2 },
  backdrop: { flex: 1, backgroundColor: overlay.backdrop, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.parchment, padding: space.l, gap: space.s + 2, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: 2, borderColor: colors.gold },
  sheetHead: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  term: { fontFamily: serif, fontSize: 22, color: colors.ink, flex: 1 },
  termEn: { fontSize: 16, color: colors.soft, fontStyle: 'italic' },
  definition: { color: colors.ink, fontSize: 16, lineHeight: 24 },
  child: { color: colors.soft, fontSize: 14, lineHeight: 21 },
});
