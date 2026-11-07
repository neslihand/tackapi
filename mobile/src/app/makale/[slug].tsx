// An article, as on the site (frontend/src/vakif/Articles.tsx): the cover and a dark opening; how far the reader is; the
// parts of the article to jump to; the text with its subheadings and quotations, the glossary terms marked where they
// first appear (tap: the definition, for children if asked), read aloud on request; a link to share; then its source, the
// works it is about and what to read next.
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Switch, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Text } from '@/components/Typography';
import { ArticleCard, CoverArt, TermSheet } from '@/components/Reading';
import { Button, ButtonRow, Empty, Eyebrow, Loading, Notice, Title } from '@/components/UI';
import { track } from '@/lib/analytics';
import { ApiError, apiBase, mediaUrl } from '@/lib/api';
import { currentLang, t, useLang } from '@/lib/i18n';
import { articleBlocks, capitalize, formatDay, loadArticle, loadTerms, markTerms, type ArticleDetail, type GlossaryTerm } from '@/lib/reading';
import { shareLink } from '@/lib/share';
import { speak, stopSpeaking } from '@/lib/speech';
import { useContent } from '@/lib/store';
import { colors, serif, space } from '@/lib/theme';

export default function Article() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { lang } = useLang();
  const [a, setA] = useState<ArticleDetail | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [terms, setTerms] = useState<GlossaryTerm[]>([]);
  const [open, setOpen] = useState<GlossaryTerm | null>(null);
  const [child, setChild] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [linkShown, setLinkShown] = useState<string | null>(null);
  // moved directly: the whole text is not drawn again for every scrolled pixel
  const [read] = useState(() => new Animated.Value(0));
  const page = useRef<ComponentRef<typeof ScrollView>>(null);
  const body = useRef({ y: 0, height: 1 });
  const headingY = useRef<Record<string, number>>({});
  const showing = `${slug}|${lang}`;
  const [shown, setShown] = useState(showing);
  if (showing !== shown) { setShown(showing); setA(null); setError(null); }
  // every published work is in the app; one missing from the collection (not yet loaded or taken down) stays a label
  const works = useContent();
  const inApp = (work: string) => Boolean(works.bySlug(work));
  useEffect(() => {
    let live = true;
    loadArticle(slug).then(r => { if (!live) return; setA(r.data); setStale(r.stale); track('article_view', undefined, { article: slug, kind: r.data.kind }); },
      e => { if (live) setError(e instanceof ApiError && e.status === 404 ? t('Bu makale yayında değil.', 'This article is not published.') : String(e?.message ?? e)); });
    loadTerms().then(r => { if (live) setTerms(r.data.items); }, () => {});
    return () => { live = false; };
  }, [slug, lang]);
  useEffect(() => () => stopSpeaking(), []);

  // terms are marked once per article: `seen` runs through the paragraphs in order
  const blocks = useMemo(() => {
    if (!a) return [];
    const seen = new Set<string>();
    return articleBlocks(a.body).map(b => ({ ...b, pieces: b.type === 'h' ? [b.text] : markTerms(b.text, terms, seen) }));
  }, [a, terms]);
  const bySlug = useMemo(() => new Map(terms.map(x => [x.slug, x])), [terms]);
  const found = useMemo(() => [...new Set(blocks.flatMap(b => b.pieces.flatMap(p => typeof p === 'string' ? [] : [p.term])))].map(x => bySlug.get(x)).filter((x): x is GlossaryTerm => Boolean(x)), [blocks, bySlug]);

  if (error) return <Empty title={t('Bu makale bulunamadı.', 'This article could not be found.')} body={error} action={<Button kind="plain" icon="arrow-back" label={t('Makalelere dön', 'Back to the articles')} onPress={() => router.replace('/okuma')} />} />;
  if (!a) return <Loading label={t('Makale açılıyor…', 'Opening the article…')} />;

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, layoutMeasurement } = e.nativeEvent;
    read.setValue(Math.min(1, Math.max(0, (contentOffset.y + layoutMeasurement.height * .35 - body.current.y) / Math.max(1, body.current.height))));
  }
  function listen() {
    if (speaking) { stopSpeaking(); setSpeaking(false); return; }
    setSpeaking(true);
    speak(`${a!.title}. ${articleBlocks(a!.body).map(b => b.text).join(' ')}`, () => setSpeaking(false));
  }
  async function share() {
    setLinkShown(null);
    const url = `${apiBase()}/#/makale/${encodeURIComponent(slug)}`;
    setLinkShown(await shareLink(a!.title, url).catch(() => url));
    track('share_initiated', undefined, { content_type: 'article', article: slug });
  }
  const cover = mediaUrl(a.cover?.src);
  const headings = blocks.filter(b => b.type === 'h');
  const pages = a.source?.pages ? (a.source.pages[0] === a.source.pages[1] ? t(`s. ${a.source.pages[0]}`, `p. ${a.source.pages[0]}`) : t(`s. ${a.source.pages[0]}–${a.source.pages[1]}`, `pp. ${a.source.pages[0]}–${a.source.pages[1]}`)) : '';
  // the editor's note is Turkish; in English the book, section and pages are put together instead
  const composed = a.source ? [a.source.book, a.source.section && `“${a.source.section}”`, pages].filter(Boolean).join(', ') : '';
  const source = a.source && (currentLang() === 'en' && a.source.book ? composed : a.source.note || composed);
  const fromVisitor = t('Bu yazıyı bir ziyaretçi gönderdi; editörlerimiz okuyup yayımladı. Kitaptaki bilgiden ayrıdır.', 'A visitor sent this article; our editors read and published it. It is separate from the book’s information.');

  return <View style={{ flex: 1 }}>
    <Stack.Screen options={{ title: a.kind_label }} />
    <ScrollView ref={page} onScroll={onScroll} scrollEventThrottle={32} contentContainerStyle={{ paddingBottom: space.xl * 2 }}>
      {cover ? <Image source={cover} style={s.cover} contentFit="cover" transition={250} accessibilityLabel={a.cover?.alt || a.title} /> : <CoverArt kind={a.kind} title={a.title} style={s.cover} />}
      <View style={s.hero}>
        <Eyebrow light>{a.kind_label.toLocaleUpperCase('tr-TR')}{a.city ? ` · ${a.city.name.toLocaleUpperCase('tr-TR')}` : ''}</Eyebrow>
        <Title light>{a.title}</Title>
        {!!a.summary && <Text style={s.lede}>{a.summary}</Text>}
        <Text style={s.heroMeta}>{[a.byline, formatDay(a.published_at), t(`${a.reading_minutes} dk okuma`, `${a.reading_minutes} min read`)].filter(Boolean).join(' · ')}</Text>
      </View>

      <View style={s.section}>
        {currentLang() === 'en' && a.lang === 'tr' && <Notice>This article is available in Turkish only.</Notice>}
        {stale && <Notice icon="cloud-offline-outline">{t('Çevrimdışısın: makalenin cihazda saklanan hâli gösteriliyor.', 'You are offline: the copy of this article kept on the device is shown.')}</Notice>}
        {headings.length > 1 && <View style={s.toc}>
          <Eyebrow>{t('BU MAKALEDE', 'IN THIS ARTICLE')}</Eyebrow>
          {headings.map(h => <Pressable key={h.id} onPress={() => page.current?.scrollTo({ y: body.current.y + (headingY.current[h.id!] ?? 0) - space.s, animated: true })} accessibilityRole="button" style={s.tocRow}>
            <Text style={s.tocText}>{h.text}</Text><Ionicons name="arrow-down" size={15} color={colors.goldLine} />
          </Pressable>)}
        </View>}
        <ButtonRow>
          <Button fit kind="plain" icon={speaking ? 'stop-circle-outline' : 'volume-high-outline'} label={speaking ? t('Durdur', 'Stop') : t('Sesli dinle', 'Listen')} onPress={listen} />
          <Button fit kind="plain" icon="link-outline" label={t('Paylaş', 'Share')} onPress={share} />
        </ButtonRow>
        {linkShown && <Notice icon="link-outline"><Text selectable>{linkShown}</Text></Notice>}
      </View>

      <View style={s.section} onLayout={e => { body.current = { y: e.nativeEvent.layout.y, height: e.nativeEvent.layout.height }; }}>
        {blocks.map((b, i) => b.type === 'h' ? <Text key={i} style={s.h} accessibilityRole="header" onLayout={e => { headingY.current[b.id!] = e.nativeEvent.layout.y; }}>{b.text}</Text>
          : <Text key={i} style={b.type === 'q' ? s.quote : s.p}>{b.pieces.map((p, j) => typeof p === 'string' ? p
            : <Text key={j} style={s.mark} onPress={() => setOpen(bySlug.get(p.term) ?? null)} accessibilityRole="button"
              accessibilityHint={t('Terimin açıklamasını açar', 'Opens the term’s definition')}>{p.text}</Text>)}</Text>)}
      </View>

      {found.length > 0 && <View style={s.section}>
        <Eyebrow>{t('TERİMLER', 'TERMS')}</Eyebrow>
        <Text style={s.small}>{t('Altı noktalı sözcükler sözlükte; dokununca açıklaması açılır.', 'Dotted words are in the glossary; tap one for its definition.')}</Text>
        <View style={s.chips}>{found.map(x => <Pressable key={x.slug} onPress={() => router.push(`/terim/${x.slug}`)} accessibilityRole="link" style={s.chip}><Text style={s.chipText}>{capitalize(x.term)}</Text></Pressable>)}</View>
        {currentLang() === 'tr' && found.some(x => x.definition_child) && <View style={s.switch}>
          <Text style={s.switchText}>Açıklamaları çocuklar için</Text>
          <Switch value={child} onValueChange={setChild} accessibilityLabel="Açıklamaları çocuklar için" trackColor={{ true: colors.emeraldLight, false: colors.line }} thumbColor={child ? colors.gold : '#f4f3f0'} />
        </View>}
      </View>}

      {!!source && <View style={s.section}>
        <Eyebrow>{t('KAYNAK', 'SOURCE')}</Eyebrow>
        <Text style={s.sourceText}>{source}</Text>
        {a.origin === 'book' && <Text style={s.small}>{t('Metin, Vakıf Katılım envanter kitabından alınmıştır; yalnızca biçim ve yazım düzenlenmiştir.', 'The text comes from the Vakıf Katılım inventory book; only its layout and spelling were edited.')}</Text>}
        {a.origin === 'visitor' && <Text style={s.small}>{fromVisitor}</Text>}
      </View>}
      {!source && a.origin === 'visitor' && <View style={s.section}><Text style={s.small}>{fromVisitor}</Text></View>}

      {!!a.monuments.length && <View style={s.section}>
        <Eyebrow>{t('BU YAZIDAKİ ESERLER', 'WORKS IN THIS ARTICLE')}</Eyebrow>
        {a.monuments.map(m => <Pressable key={m.slug} disabled={!inApp(m.slug)} onPress={() => router.push(`/eser/${m.slug}`)} style={s.work} accessibilityRole={inApp(m.slug) ? 'button' : undefined}>
          {m.image ? <Image source={mediaUrl(m.image.thumb)} alt="" style={s.thumb} contentFit="cover" accessibilityIgnoresInvertColors /> : <View style={[s.thumb, { backgroundColor: colors.parchmentDeep }]} />}
          <View style={{ flex: 1 }}><Text style={s.workName}>{m.name}</Text><Text style={s.small}>{m.city}{inApp(m.slug) ? '' : t(' · uygulamada henüz yok', ' · not in the app yet')}</Text></View>
          {inApp(m.slug) && <Ionicons name="chevron-forward" size={18} color={colors.goldLine} />}
        </Pressable>)}
      </View>}

      {!!a.related.length && <View style={s.section}>
        <Eyebrow>{t('OKUMAYA DEVAM ET', 'KEEP READING')}</Eyebrow>
        {a.related.map(r => <ArticleCard key={r.slug} a={r} />)}
      </View>}

      <View style={s.section}>
        <View style={s.cta}>
          <Text style={s.ctaText}>{t('Senin de anlatacak bir hikâyen mi var?', 'Do you have a story to tell, too?')}</Text>
          <Button icon="create-outline" label={t('Yazı gönder', 'Send an article')} onPress={() => router.push('/yazi')} />
        </View>
      </View>
    </ScrollView>
    <View style={s.progress} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[s.progressFill, { width: read.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
    </View>
    <TermSheet term={open} child={child} onClose={() => setOpen(null)} />
  </View>;
}

const s = StyleSheet.create({
  cover: { width: '100%', height: 220, backgroundColor: colors.parchmentDeep },
  hero: { padding: space.m, paddingBottom: space.l, gap: space.s, backgroundColor: colors.emerald },
  lede: { fontFamily: serif, fontSize: 19, lineHeight: 27, color: colors.goldSoft, fontStyle: 'italic' },
  heroMeta: { color: colors.mist, fontSize: 13, lineHeight: 19 },
  section: { paddingHorizontal: space.m, paddingTop: space.l, gap: space.s + 2 },
  progress: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: '#0000' },
  progressFill: { height: 3, backgroundColor: colors.gold },
  toc: { padding: space.m, borderRadius: 14, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, gap: 2 },
  tocRow: { flexDirection: 'row', alignItems: 'center', gap: space.s, minHeight: 44 },
  tocText: { flex: 1, fontFamily: serif, fontSize: 18, color: colors.ink },
  small: { color: colors.soft, fontSize: 12, lineHeight: 17 },
  h: { fontFamily: serif, fontSize: 26, lineHeight: 31, color: colors.ink, marginTop: space.s },
  p: { fontFamily: serif, fontSize: 18, lineHeight: 28, color: colors.ink },
  quote: { fontFamily: serif, fontSize: 18, lineHeight: 28, color: colors.soft, fontStyle: 'italic', borderLeftWidth: 3, borderLeftColor: colors.gold, paddingLeft: 12 },
  mark: { fontFamily: serif, color: colors.emeraldLight, textDecorationLine: 'underline', textDecorationStyle: 'dotted' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  chip: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.goldLine, backgroundColor: colors.paper },
  chipText: { color: colors.ink, fontSize: 13 },
  switch: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  switchText: { flex: 1, color: colors.ink, fontSize: 14 },
  sourceText: { color: colors.ink, fontSize: 14, lineHeight: 21 },
  work: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, borderRadius: 12, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  thumb: { width: 56, height: 56, borderRadius: 8 },
  workName: { fontFamily: serif, fontSize: 16, color: colors.ink },
  cta: { padding: space.m, borderRadius: 14, borderWidth: 1, borderColor: colors.goldLine, gap: space.s },
  ctaText: { fontFamily: serif, fontSize: 22, lineHeight: 27, color: colors.ink },
});
