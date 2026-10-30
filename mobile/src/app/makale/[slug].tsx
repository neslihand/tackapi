// An article: the cover, the text with its subheadings and quotations, the glossary terms marked where they first
// appear (tap: the definition), read aloud on request; then its source, the works it is about and related articles.
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ArticleCard, TermSheet } from '@/components/Reading';
import { Button, Empty, Eyebrow, Loading, Notice, Title } from '@/components/UI';
import { ApiError, mediaUrl } from '@/lib/api';
import { currentLang, t, useLang } from '@/lib/i18n';
import { articleBlocks, loadArticle, loadTerms, markTerms, type ArticleDetail, type GlossaryTerm } from '@/lib/reading';
import { speak, stopSpeaking } from '@/lib/speech';
import { colors, serif, space } from '@/lib/theme';

export default function Article() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { lang } = useLang();
  const [a, setA] = useState<ArticleDetail | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [terms, setTerms] = useState<GlossaryTerm[]>([]);
  const [open, setOpen] = useState<GlossaryTerm | null>(null);
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    setA(null); setError(null);
    loadArticle(slug).then(r => { setA(r.data); setStale(r.stale); },
      e => setError(e instanceof ApiError && e.status === 404 ? t('Bu makale yayında değil.', 'This article is not published.') : String(e?.message ?? e)));
    loadTerms().then(r => setTerms(r.data.items), () => {});
  }, [slug, lang]);
  useEffect(() => () => stopSpeaking(), []);

  // terms are marked once per article: `seen` runs through the paragraphs in order
  const blocks = useMemo(() => {
    if (!a) return [];
    const seen = new Set<string>();
    return articleBlocks(a.body).map(b => ({ ...b, pieces: b.type === 'h' ? [b.text] : markTerms(b.text, terms, seen) }));
  }, [a, terms]);
  const bySlug = useMemo(() => new Map(terms.map(x => [x.slug, x])), [terms]);

  if (error) return <Empty title={t('Makale açılamadı.', 'The article could not be opened.')} body={error} />;
  if (!a) return <Loading />;

  function listen() {
    if (speaking) { stopSpeaking(); setSpeaking(false); return; }
    setSpeaking(true);
    speak(`${a!.title}. ${articleBlocks(a!.body).map(b => b.text).join(' ')}`, () => setSpeaking(false));
  }
  const cover = mediaUrl(a.cover?.src);
  const source = a.source && [a.source.book, a.source.section, a.source.pages ? `s. ${a.source.pages[0]}${a.source.pages[1] !== a.source.pages[0] ? `–${a.source.pages[1]}` : ''}` : null].filter(Boolean).join(', ');

  return <ScrollView contentContainerStyle={{ paddingBottom: space.xl * 2 }}>
    <Stack.Screen options={{ title: a.kind_label }} />
    {cover && <Image source={cover} style={s.cover} contentFit="cover" transition={250} accessibilityLabel={a.cover?.alt || a.title} />}
    <View style={s.section}>
      <Eyebrow>{a.kind_label.toLocaleUpperCase('tr-TR')}{a.city ? ` · ${a.city.name.toLocaleUpperCase('tr-TR')}` : ''}</Eyebrow>
      <Title>{a.title}</Title>
      <Text style={s.meta}>{a.byline} · {t(`${a.reading_minutes} dk okuma`, `${a.reading_minutes} min read`)}</Text>
      {currentLang() === 'en' && a.lang === 'tr' && <Notice>This article is available in Turkish only.</Notice>}
      {stale && <Notice icon="cloud-offline-outline">{t('Çevrimdışısın: makalenin cihazda saklanan hâli gösteriliyor.', 'You are offline: the copy of this article kept on the device is shown.')}</Notice>}
      {a.origin === 'visitor' && <Text style={s.small}>{t('Bir ziyaretçinin yazısıdır; editörlerce gözden geçirilip yayımlandı.', 'Written by a visitor; reviewed and published by the editors.')}</Text>}
      {!!a.summary && <Text style={s.summary}>{a.summary}</Text>}
      <Button kind="plain" icon={speaking ? 'stop-circle-outline' : 'volume-high-outline'} label={speaking ? t('Dinlemeyi durdur', 'Stop listening') : t('Sesli dinle', 'Listen')} onPress={listen} />
      {blocks.map((b, i) => b.type === 'h' ? <Text key={i} style={s.h} accessibilityRole="header">{b.text}</Text>
        : <Text key={i} style={b.type === 'q' ? s.quote : s.p}>{b.pieces.map((p, j) => typeof p === 'string' ? p
          : <Text key={j} style={s.mark} onPress={() => setOpen(bySlug.get(p.term) ?? null)} accessibilityRole="button"
            accessibilityHint={t('Terimin açıklamasını açar', 'Opens the term’s definition')}>{p.text}</Text>)}</Text>)}
      {terms.length > 0 && <Text style={s.small}>{t('Altı noktalı sözcükler sözlükte; dokununca açıklaması açılır.', 'Dotted words are in the glossary; tap one for its definition.')}</Text>}
    </View>

    {!!source && <View style={s.section}>
      <Eyebrow>{t('KAYNAK', 'SOURCE')}</Eyebrow>
      <Text style={s.small}>{source}{a.source?.note ? `\n${a.source.note}` : ''}</Text>
    </View>}

    {!!a.monuments.length && <View style={s.section}>
      <Eyebrow>{t('YAZIDAKİ ESERLER', 'WORKS IN THIS ARTICLE')}</Eyebrow>
      {a.monuments.map(m => <Pressable key={m.slug} disabled={!m.pilot} onPress={() => router.push(`/eser/${m.slug}`)} style={s.work} accessibilityRole={m.pilot ? 'button' : undefined}>
        {m.image ? <Image source={mediaUrl(m.image.thumb)} alt="" style={s.thumb} contentFit="cover" accessibilityIgnoresInvertColors /> : <View style={[s.thumb, { backgroundColor: colors.parchmentDeep }]} />}
        <View style={{ flex: 1 }}><Text style={s.workName}>{m.name}</Text><Text style={s.small}>{m.city}{m.pilot ? '' : t(' · uygulamada henüz yok', ' · not in the app yet')}</Text></View>
        {m.pilot && <Ionicons name="chevron-forward" size={18} color={colors.goldLine} />}
      </Pressable>)}
    </View>}

    {!!a.related.length && <View style={s.section}>
      <Eyebrow>{t('İLGİLİ YAZILAR', 'RELATED ARTICLES')}</Eyebrow>
      {a.related.map(r => <ArticleCard key={r.slug} a={r} />)}
    </View>}
    <TermSheet term={open} onClose={() => setOpen(null)} />
  </ScrollView>;
}

const s = StyleSheet.create({
  cover: { width: '100%', height: 220, backgroundColor: colors.parchmentDeep },
  section: { paddingHorizontal: space.m, paddingTop: space.l, gap: space.s + 2 },
  meta: { color: colors.soft, fontSize: 13 },
  small: { color: colors.soft, fontSize: 12, lineHeight: 17 },
  summary: { fontFamily: serif, fontSize: 18, lineHeight: 27, color: colors.soft, fontStyle: 'italic' },
  h: { fontFamily: serif, fontSize: 22, color: colors.ink, marginTop: space.s },
  p: { fontFamily: serif, fontSize: 17, lineHeight: 27, color: colors.ink },
  quote: { fontFamily: serif, fontSize: 17, lineHeight: 27, color: colors.soft, fontStyle: 'italic', borderLeftWidth: 3, borderLeftColor: colors.gold, paddingLeft: 12 },
  mark: { color: colors.emeraldLight, textDecorationLine: 'underline', textDecorationStyle: 'dotted' },
  work: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, borderRadius: 12, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  thumb: { width: 56, height: 56, borderRadius: 8 },
  workName: { fontFamily: serif, fontSize: 16, color: colors.ink },
});
