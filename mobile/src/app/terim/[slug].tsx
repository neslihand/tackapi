// A glossary term: its definition (and the one for children), where it comes from, the works and articles it
// appears in.
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Empty, Eyebrow, Loading, Notice, Title } from '@/components/UI';
import { ApiError } from '@/lib/api';
import { t, useLang } from '@/lib/i18n';
import { capitalize, loadTerm, type TermDetail } from '@/lib/reading';
import { rememberTerm } from '@/lib/recall-state';
import { useContent } from '@/lib/store';
import { colors, serif, space } from '@/lib/theme';

export default function Term() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { lang } = useLang();
  const [term, setTerm] = useState<TermDetail | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // every published work is in the app; one missing from the collection (not yet loaded or taken down) stays a label
  const { bySlug } = useContent();
  const inApp = (work: string) => Boolean(bySlug(work));
  useEffect(() => {
    setTerm(null); setError(null);
    loadTerm(slug).then(r => { setTerm(r.data); setStale(r.stale); rememberTerm(slug); },
      e => setError(e instanceof ApiError && e.status === 404 ? t('Bu terim sözlükte yok.', 'This term is not in the glossary.') : String(e?.message ?? e)));
  }, [slug, lang]);

  if (error) return <Empty title={t('Terim açılamadı.', 'The term could not be opened.')} body={error} />;
  if (!term) return <Loading />;
  const origin = term.origin === 'book' ? t('Envanter kitaplarının sözlüğünden.', 'From the inventory books’ glossary.')
    : term.origin === 'editorial' ? t('Editörlerin eklediği terim.', 'Added by the editors.')
      : t(`Bir ziyaretçinin önerisi${term.author ? ` (${term.author})` : ''}; editörlerce gözden geçirildi.`, `Suggested by a visitor${term.author ? ` (${term.author})` : ''}; reviewed by the editors.`);

  return <ScrollView contentContainerStyle={{ padding: space.m, gap: space.m, paddingBottom: space.xl }}>
    <Stack.Screen options={{ title: capitalize(term.term) }} />
    <Eyebrow>✦ {t('TERİMLER SÖZLÜĞÜ', 'GLOSSARY')}{term.category_label ? ` · ${term.category_label.toLocaleUpperCase('tr-TR')}` : ''}</Eyebrow>
    <Title>{capitalize(term.term)}</Title>
    {!!term.term_en && <Text style={s.en}>{term.term_en}</Text>}
    {stale && <Notice icon="cloud-offline-outline">{t('Çevrimdışısın: cihazdaki son hâli gösteriliyor.', 'You are offline: the copy on this device is shown.')}</Notice>}
    <Text style={s.definition}>{term.definition}</Text>
    {!!term.definition_child && <View style={s.child}><Text style={s.childHead}>{t('Çocuklar için', 'For children')}</Text><Text style={s.childText}>{term.definition_child}</Text></View>}
    <Text style={s.small}>{origin}</Text>

    {!!term.monuments.length && <><Eyebrow>{t('GEÇTİĞİ ESERLER', 'WORKS WITH THIS TERM')}</Eyebrow>
      {term.monuments.map(m => <Pressable key={m.slug} disabled={!inApp(m.slug)} onPress={() => router.push(`/eser/${m.slug}`)} style={s.row} accessibilityRole={inApp(m.slug) ? 'button' : undefined}>
        <View style={{ flex: 1 }}><Text style={s.rowName}>{m.name}</Text><Text style={s.small}>{m.city}{inApp(m.slug) ? '' : t(' · uygulamada henüz yok', ' · not in the app yet')}</Text></View>
        {inApp(m.slug) && <Ionicons name="chevron-forward" size={18} color={colors.goldLine} />}
      </Pressable>)}</>}

    {!!term.articles.length && <><Eyebrow>{t('GEÇTİĞİ YAZILAR', 'ARTICLES WITH THIS TERM')}</Eyebrow>
      {term.articles.map(a => <Pressable key={a.slug} onPress={() => router.push(`/makale/${a.slug}`)} style={s.row} accessibilityRole="button">
        <View style={{ flex: 1 }}><Text style={s.rowName}>{a.title}</Text><Text style={s.small}>{a.kind_label}</Text></View>
        <Ionicons name="chevron-forward" size={18} color={colors.goldLine} />
      </Pressable>)}</>}
  </ScrollView>;
}

const s = StyleSheet.create({
  en: { color: colors.soft, fontSize: 16, fontStyle: 'italic', marginTop: -space.s },
  definition: { fontFamily: serif, fontSize: 19, lineHeight: 29, color: colors.ink },
  child: { padding: space.m, borderRadius: 14, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderLeftWidth: 3, borderLeftColor: colors.gold, gap: 4 },
  childHead: { color: colors.goldText, fontWeight: '700', fontSize: 13 },
  childText: { color: colors.ink, fontSize: 15, lineHeight: 22 },
  small: { color: colors.soft, fontSize: 12, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  rowName: { fontFamily: serif, fontSize: 16, color: colors.ink },
});
