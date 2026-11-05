// Okuma Odası, as on the site (frontend/src/vakif/Articles.tsx, Glossary.tsx): the articles (city history, waqf works,
// waqf culture) filtered and paged by the server, and the glossary with its letters, the children's telling and where each
// term appears. ?bolum=terimler opens on the glossary.
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Text, TextInput } from '@/components/Typography';
import { ArticleCard, ReadingBand } from '@/components/Reading';
import { Button, Empty, Loading, Notice } from '@/components/UI';
import { useContent } from '@/lib/store';
import { track } from '@/lib/analytics';
import { currentLang, t, useLang } from '@/lib/i18n';
import { capitalize, fold, letterGroups, loadArticles, loadTerm, loadTerms, TURKISH_ALPHABET, type ArticleItem, type ArticleKind, type ArticleList, type GlossaryTerm, type TermDetail } from '@/lib/reading';
import { colors, serif, space } from '@/lib/theme';

type Part = 'articles' | 'terms';

export default function ReadingRoom() {
  const { bolum } = useLocalSearchParams<{ bolum?: string }>();
  const [part, setPart] = useState<Part>(bolum === 'terimler' ? 'terms' : 'articles');
  return <View style={{ flex: 1 }}>
    <View style={s.tabs} accessibilityRole="tablist">{([['articles', t('Makaleler', 'Articles'), 'newspaper-outline'], ['terms', t('Terimler sözlüğü', 'Glossary'), 'book-outline']] as const).map(([id, label, icon]) =>
      <Pressable key={id} onPress={() => setPart(id)} accessibilityRole="tab" accessibilityState={{ selected: part === id }} style={[s.tab, part === id && s.tabOn]}>
        <Ionicons name={icon} size={16} color={part === id ? colors.goldSoft : colors.ink} />
        <Text style={[s.tabText, part === id && { color: colors.goldSoft }]}>{label}</Text></Pressable>)}</View>
    {part === 'articles' ? <Articles toGlossary={() => setPart('terms')} /> : <Glossary />}
  </View>;
}

function Articles({ toGlossary }: { toGlossary: () => void }) {
  const { lang } = useLang();
  const [kind, setKind] = useState<ArticleKind | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [data, setData] = useState<ArticleList | null>(null);
  const [items, setItems] = useState<ArticleItem[]>([]);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answered, setAnswered] = useState<string | null>(null);
  // a new choice starts again from the first page; a failed page leaves what is already on screen
  const choice = `${kind}|${city}|${search}|${lang}`;
  const [shownChoice, setShownChoice] = useState(choice);
  if (choice !== shownChoice) { setShownChoice(choice); setPage(1); }
  const request = `${choice}|${page}|${retry}`;
  const loading = answered !== request;
  useEffect(() => {
    let live = true;
    loadArticles({ kind, city, q: search, page }).then(r => {
      if (!live) return;
      setData(r.data); setStale(r.stale); setError(null);
      setItems(list => page === 1 ? r.data.items : [...list, ...r.data.items.filter(x => !list.some(y => y.slug === x.slug))]);
    }, e => { if (live) setError(String(e?.message ?? e)); }).finally(() => { if (live) setAnswered(request); });
    return () => { live = false; };
  }, [kind, city, search, page, lang, retry, request]);

  const filtered = Boolean(kind || city || search);
  const clear = () => { setKind(null); setCity(null); setDraft(''); setSearch(''); };
  function submit() { setSearch(draft.trim()); if (draft.trim()) track('search', undefined, { q: draft.trim(), where: 'articles' }); }
  const kinds = data?.facets.kinds ?? [];
  const cities = data?.facets.cities ?? [];
  const total = kinds.reduce((n, k) => n + k.n, 0);
  const showLead = !filtered && items.length > 0;

  return <ScrollView contentContainerStyle={{ padding: space.m, gap: space.s + 4, paddingBottom: space.xl }} keyboardShouldPersistTaps="handled">
    <ReadingBand kicker={t('OKUMA ODASI · MAKALELER', 'READING ROOM · ARTICLES')} title={t('Şehirlerin hafızası,', 'The memory of cities,')} italic={t('vakfın dili.', 'the language of the waqf.')}
      lede={t('Envanter kitaplarının şehir tarihleri, vakıf eserleri üzerine yazılar ve vakıf kültürünü anlatan denemeler. Okurken altı noktalı sözcüklere dokun: terimin açıklaması açılır.', 'City histories from the inventory books, writing on foundation works and essays on waqf culture. Tap a word with a dotted underline while you read to open its explanation.')}
      note={t('Bir eserin hikâyesini mi biliyorsun? Yazını gönder; editörlerimiz okuyup yayımlasın.', 'Do you know the story of a work? Send your article; our editors will read and publish it.')}
      action={<Button kind="gold" icon="create-outline" label={t('Yazı gönder', 'Send an article')} onPress={() => router.push('/yazi')} />} />

    {stale && <Notice icon="cloud-offline-outline">{t('Çevrimdışısın: cihazdaki son liste gösteriliyor. Arama ve filtreler yalnızca daha önce indirilenleri kapsar.', 'You are offline: the last list on this device is shown. Search and filters cover only what was downloaded before.')}</Notice>}
    <Search value={draft} onChange={v => { setDraft(v); if (!v) setSearch(''); }} onSubmit={submit} onClear={() => { setDraft(''); setSearch(''); }} placeholder={t('Makalelerde ara…', 'Search the articles…')} label={t('Makalelerde ara', 'Search the articles')} />
    {kinds.length > 0 && <Chips options={kinds.map(k => [k.slug, `${k.label} (${k.n})`])} value={kind} onChange={v => setKind(v as ArticleKind | null)} all={`${t('Tümü', 'All')}${total ? ` (${total})` : ''}`} />}
    {cities.length > 1 && <Chips options={cities.map(c => [c.slug, `${c.name} (${c.n})`])} value={city} onChange={setCity} all={t('Bütün şehirler', 'All cities')} />}

    {error && <Notice tone="warn" icon="cloud-offline-outline">{items.length ? t('Bu istek tamamlanamadı; önceki liste gösteriliyor.', 'This request could not finish; the previous list is shown.') : error}</Notice>}
    {error && <Button kind="plain" icon="refresh" label={t('Yeniden dene', 'Try again')} onPress={() => setRetry(n => n + 1)} />}
    {loading && !items.length && !error && <Loading />}

    {!loading && !error && data && !data.total && (filtered
      ? <Empty title={t('Bu seçimde makale yok.', 'No articles match this choice.')} action={<Button kind="plain" icon="close" label={t('Filtreleri temizle', 'Clear the filters')} onPress={clear} />} />
      : <Empty title={t('İlk makaleler yolda.', 'The first articles are on their way.')} body={t('Şehir tarihleri yakında burada. İstersen ilk yazıyı sen gönder ya da sözlüğe göz at.', 'City histories will be here soon. You can send the first article yourself or look at the glossary.')}
        action={<View style={{ gap: space.s, alignSelf: 'stretch' }}>
          <Button icon="book-outline" label={t('Sözlüğe geç', 'Go to the glossary')} onPress={toGlossary} />
          <Button kind="plain" icon="create-outline" label={t('İlk yazıyı sen gönder', 'Send the first article')} onPress={() => router.push('/yazi')} />
        </View>} />)}

    {items.map((a, i) => <ArticleCard key={a.slug} a={a} wide={showLead && i === 0} />)}
    {data && items.length < data.total && <Button kind="plain" busy={loading} icon="chevron-down" label={t(`Daha fazla göster (${data.total - items.length})`, `Show more (${data.total - items.length})`)} onPress={() => setPage(p => p + 1)} />}
    <Text style={s.hidden} accessibilityLiveRegion="polite">{loading ? t('Makaleler yükleniyor…', 'Loading articles…') : data ? t(`${data.total} makale`, `${data.total} articles`) : ''}</Text>
  </ScrollView>;
}

function Glossary() {
  const { lang } = useLang();
  const [terms, setTerms] = useState<GlossaryTerm[] | null>(null);
  const [cats, setCats] = useState<{ slug: string; label: string; n: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [child, setChild] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const page = useRef<ComponentRef<typeof ScrollView>>(null);
  const letterY = useRef<Record<string, number>>({});
  useEffect(() => { loadTerms().then(r => { setTerms(r.data.items); setCats(r.data.categories); }, e => setError(String(e?.message ?? e))); }, [lang]);
  const shown = useMemo(() => {
    const needle = fold(query.trim());
    return (terms ?? []).filter(x => (!cat || x.category === cat) && (!needle || fold([x.term, x.term_en, x.definition].filter(Boolean).join(' ')).includes(needle)));
  }, [terms, query, cat]);
  const groups = useMemo(() => letterGroups(shown), [shown]);
  const present = new Set(groups.map(([l]) => l));

  if (error && !terms) return <Empty title={t('Sözlük açılamadı.', 'The glossary could not be opened.')} body={error} />;
  if (!terms) return <Loading />;
  const suggest = (word = '') => router.push(word ? `/terim-oner?terim=${encodeURIComponent(word)}` : '/terim-oner');
  return <ScrollView ref={page} contentContainerStyle={{ padding: space.m, gap: space.s + 4, paddingBottom: space.xl }} keyboardShouldPersistTaps="handled">
    <ReadingBand kicker={t('OKUMA ODASI · TERİMLER SÖZLÜĞÜ', 'READING ROOM · GLOSSARY')} title={t('Taşın, ahşabın,', 'The words of stone,')} italic={t('vakfın sözcükleri.', 'wood and waqf.')}
      lede={t('Mukarnastan bânîye, kündekâriden imarete: eser sayfalarında ve makalelerde karşılaştığın terimler, sade açıklamalarıyla.', 'From muqarnas to patron, from kündekâri to imaret: the terms you meet on the work pages and in the articles, simply explained.')}
      note={t('Sözlükte olmayan bir terim mi gördün? Öner; editörlerimiz bakıp eklesin.', 'Spotted a term that is missing? Suggest it; our editors will check and add it.')}
      action={<Button kind="gold" icon="add" label={t('Terim öner', 'Suggest a term')} onPress={() => suggest()} />} />
    <Search value={query} onChange={setQuery} onSubmit={() => { if (query.trim()) track('term_search', undefined, { q: query.trim() }); }} onClear={() => setQuery('')} placeholder={t('Terim ya da anlam ara… (ör. kubbe)', 'Search a term or meaning… (e.g. dome)')} label={t('Terim ara', 'Search the terms')} />
    {cats.length > 1 && <Chips options={cats.map(c => [c.slug, `${c.label} (${c.n})`])} value={cat} onChange={setCat} all={t('Tümü', 'All')} />}
    {currentLang() === 'tr' && terms.some(x => x.definition_child) && <View style={s.switch}>
      <Ionicons name="bulb-outline" size={18} color={colors.goldText} />
      <Text style={s.switchText}>Çocuklar için anlat</Text>
      <Switch value={child} onValueChange={setChild} accessibilityLabel="Çocuklar için anlat" trackColor={{ true: colors.emeraldLight, false: colors.line }} thumbColor={child ? colors.gold : '#f4f3f0'} />
    </View>}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 2 }} accessibilityLabel={t('Harfler', 'Letters')}>
      {TURKISH_ALPHABET.map(l => present.has(l)
        ? <Pressable key={l} onPress={() => page.current?.scrollTo({ y: letterY.current[l] ?? 0, animated: true })} accessibilityRole="button" accessibilityLabel={t(`${l} harfine git`, `Go to the letter ${l}`)} style={s.letterKey}><Text style={s.letterOn}>{l}</Text></Pressable>
        : <View key={l} style={s.letterKey} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Text style={s.letterOff}>{l}</Text></View>)}
    </ScrollView>
    <Text style={s.hidden} accessibilityLiveRegion="polite">{t(`${shown.length} terim`, `${shown.length} terms`)}</Text>
    {!shown.length && <Empty title={t('Bu aramaya uyan terim yok.', 'No term matches this search.')} action={<Button kind="plain" icon="add" label={t('Bu terimi öner', 'Suggest this term')} onPress={() => suggest(query.trim())} />} />}
    {groups.map(([letter, list]) => <View key={letter} style={{ gap: space.s }} onLayout={e => { letterY.current[letter] = e.nativeEvent.layout.y; }}>
      <Text style={s.letter} accessibilityRole="header">{letter}</Text>
      {list.map(x => <TermEntry key={x.slug} x={x} child={child} open={open === x.slug} onToggle={() => setOpen(open === x.slug ? null : x.slug)} />)}
    </View>)}
  </ScrollView>;
}

function TermEntry({ x, child, open, onToggle }: { x: GlossaryTerm; child: boolean; open: boolean; onToggle: () => void }) {
  const [detail, setDetail] = useState<TermDetail | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!open || detail) return;
    let live = true;
    loadTerm(x.slug).then(r => { if (live) setDetail(r.data); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [open, detail, x.slug]);
  // every published work is in the app; one missing from the collection (not yet loaded or taken down) is left out
  const { bySlug } = useContent();
  const works = detail?.monuments.filter(m => bySlug(m.slug)) ?? [];
  return <View style={s.term}>
    <Text style={s.termName}>{capitalize(x.term)}{x.term_en ? <Text style={s.termEn}> · {x.term_en}</Text> : null}</Text>
    {!!x.category_label && <Text style={s.termCat}>{x.category_label}</Text>}
    <Text style={s.termDef}>{(child && x.definition_child) || x.definition}</Text>
    {x.origin === 'visitor' && <Text style={s.small}>{t(`${x.author} önerdi; editörlerce onaylandı.`, `Suggested by ${x.author}; approved by the editors.`)}</Text>}
    <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }} hitSlop={6} style={s.more}>
      <Text style={s.moreText}>{t('Geçtiği yerler', 'Where it appears')}</Text>
      <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={15} color={colors.goldText} />
    </Pressable>
    {open && <View style={{ gap: 6 }} accessibilityLiveRegion="polite">
      {failed && !detail ? <Text style={s.small}>{t('Şu anda açılamadı. Bağlantını kontrol et.', 'It could not be opened now. Check your connection.')}</Text>
        : !detail ? <Text style={s.small}>{t('Aranıyor…', 'Looking…')}</Text>
          : !works.length && !detail.articles.length ? <Text style={s.small}>{t('Henüz bir eser ya da makalede geçmiyor.', 'It does not appear in a work or article yet.')}</Text>
            : <>
              {works.length > 0 && <Text style={s.whereHead}>{t('Eserler', 'Works')}</Text>}
              {works.map(m => <Pressable key={m.slug} onPress={() => router.push(`/eser/${m.slug}`)} accessibilityRole="link" style={s.where}><Text style={s.whereName}>{m.name}</Text><Text style={s.small}>{m.city}</Text></Pressable>)}
              {detail.articles.length > 0 && <Text style={s.whereHead}>{t('Makaleler', 'Articles')}</Text>}
              {detail.articles.map(a => <Pressable key={a.slug} onPress={() => router.push(`/makale/${a.slug}`)} accessibilityRole="link" style={s.where}><Text style={s.whereName}>{a.title}</Text><Text style={s.small}>{a.kind_label}</Text></Pressable>)}
            </>}
    </View>}
  </View>;
}

function Search({ value, onChange, onSubmit, onClear, placeholder, label }: { value: string; onChange: (v: string) => void; onSubmit: () => void; onClear: () => void; placeholder: string; label: string }) {
  return <View style={s.search}>
    <Ionicons name="search" size={17} color={colors.soft} />
    <TextInput value={value} onChangeText={onChange} onSubmitEditing={onSubmit} returnKeyType="search" placeholder={placeholder} placeholderTextColor={colors.soft} style={s.searchInput} accessibilityLabel={label} autoCapitalize="none" autoCorrect={false} />
    {!!value && <Pressable onPress={onClear} accessibilityRole="button" accessibilityLabel={t('Aramayı temizle', 'Clear the search')} hitSlop={10}><Ionicons name="close" size={18} color={colors.soft} /></Pressable>}
  </View>;
}

function Chips({ options, value, onChange, all }: { options: [string, string][]; value: string | null; onChange: (v: string | null) => void; all: string }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s }}>
    {[[null, all] as [string | null, string], ...options].map(([id, label]) => <Pressable key={id ?? 'all'} onPress={() => onChange(value === id ? null : id)} accessibilityRole="button"
      accessibilityState={{ selected: value === id }} hitSlop={4} style={[s.chip, value === id && s.chipOn]}><Text style={[s.chipText, value === id && { color: colors.goldSoft }]}>{label}</Text></Pressable>)}
  </ScrollView>;
}

const s = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 6, padding: space.m, paddingBottom: space.s, backgroundColor: colors.parchment, borderBottomWidth: 1, borderBottomColor: colors.line },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, borderRadius: 999, borderWidth: 1, borderColor: colors.goldLine },
  tabOn: { backgroundColor: colors.emerald },
  tabText: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  hidden: { height: 1, opacity: 0 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46, borderRadius: 999, borderWidth: 1, borderColor: colors.goldLine, backgroundColor: colors.paper, paddingHorizontal: 16 },
  searchInput: { flex: 1, minHeight: 44, color: colors.ink, fontSize: 15 },
  chip: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.goldLine, backgroundColor: '#ffffff80' },
  chipOn: { backgroundColor: colors.emerald },
  chipText: { color: colors.ink, fontSize: 13 },
  switch: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  switchText: { flex: 1, color: colors.ink, fontSize: 14 },
  letterKey: { width: 34, height: 44, alignItems: 'center', justifyContent: 'center' },
  letterOn: { fontFamily: serif, fontSize: 20, color: colors.goldText, fontWeight: '600' },
  letterOff: { fontFamily: serif, fontSize: 20, color: colors.line },
  letter: { fontFamily: serif, fontSize: 30, color: colors.goldText, marginTop: space.s },
  term: { padding: 12, borderRadius: 12, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, gap: 4 },
  termName: { fontFamily: serif, fontSize: 20, color: colors.ink },
  termEn: { fontSize: 14, color: colors.soft, fontStyle: 'italic' },
  termCat: { color: colors.goldText, fontSize: 11, letterSpacing: 1, fontWeight: '600' },
  termDef: { color: colors.ink, fontSize: 14, lineHeight: 21 },
  small: { color: colors.soft, fontSize: 12, lineHeight: 17 },
  more: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, alignSelf: 'flex-start' },
  moreText: { color: colors.goldText, fontSize: 13, fontWeight: '600' },
  whereHead: { color: colors.ink, fontSize: 13, fontWeight: '700', marginTop: 4 },
  where: { minHeight: 44, justifyContent: 'center', paddingVertical: 4, borderTopWidth: 1, borderTopColor: colors.line },
  whereName: { fontFamily: serif, fontSize: 16, color: colors.ink },
});
