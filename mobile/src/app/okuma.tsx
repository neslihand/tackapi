// Okuma Odası: the articles (city history, waqf works, waqf culture) and the glossary, as on the site.
// ?bolum=terimler opens on the glossary.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ArticleCard } from '@/components/Reading';
import { Button, Empty, Eyebrow, Loading, Notice } from '@/components/UI';
import { t, useLang } from '@/lib/i18n';
import { normalize } from '@/lib/passport';
import { capitalize, letterGroups, loadArticles, loadTerms, type ArticleList, type GlossaryTerm } from '@/lib/reading';
import { colors, serif, space } from '@/lib/theme';

type Part = 'articles' | 'terms';

export default function ReadingRoom() {
  const { bolum } = useLocalSearchParams<{ bolum?: string }>();
  const [part, setPart] = useState<Part>(bolum === 'terimler' ? 'terms' : 'articles');
  return <View style={{ flex: 1 }}>
    <View style={s.tabs} accessibilityRole="tablist">{([['articles', t('Makaleler', 'Articles')], ['terms', t('Terimler sözlüğü', 'Glossary')]] as const).map(([id, label]) =>
      <Pressable key={id} onPress={() => setPart(id)} accessibilityRole="tab" accessibilityState={{ selected: part === id }} style={[s.tab, part === id && s.tabOn]}>
        <Text style={[s.tabText, part === id && { color: colors.goldSoft }]}>{label}</Text></Pressable>)}</View>
    {part === 'articles' ? <Articles toGlossary={() => setPart('terms')} /> : <Glossary />}
  </View>;
}

function Articles({ toGlossary }: { toGlossary: () => void }) {
  const { lang } = useLang();
  const [data, setData] = useState<ArticleList | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  useEffect(() => { loadArticles().then(r => { setData(r.data); setStale(r.stale); }, e => setError(String(e?.message ?? e))); }, [lang]);
  const shown = useMemo(() => {
    const q = normalize(query.trim());
    return (data?.items ?? []).filter(a => (!kind || a.kind === kind) && (!city || a.city?.slug === city)
      && (!q || normalize(`${a.title} ${a.summary} ${a.city?.name ?? ''}`).includes(q)));
  }, [data, query, kind, city]);

  if (error && !data) return <Empty title={t('Makaleler açılamadı.', 'The articles could not be opened.')} body={error} />;
  if (!data) return <Loading />;
  if (!data.enabled || !data.items.length) return <Empty title={t('Okuma Odası henüz boş.', 'The Reading Room is empty for now.')}
    body={t('Makaleler yayımlandığında burada okuyabileceksin. Terimler sözlüğüne göz atabilirsin.', 'You will be able to read the articles here once they are published. You can look at the glossary meanwhile.')}
    action={<View style={{ gap: space.s, alignSelf: 'stretch' }}>
      <Button icon="book-outline" label={t('Sözlüğe geç', 'Go to the glossary')} onPress={toGlossary} />
      <Button kind="plain" icon="create-outline" label={t('İlk yazıyı sen gönder', 'Send the first article')} onPress={() => router.push('/yazi')} />
    </View>} />;
  return <ScrollView contentContainerStyle={{ padding: space.m, gap: space.s + 4, paddingBottom: space.xl }}>
    <Eyebrow>✦ {t('OKUMA ODASI', 'READING ROOM')}</Eyebrow>
    <Text style={s.lead}>{t('Şehirlerin tarihi, vakıf eserleri ve vakıf kültürü üzerine yazılar; envanter kitaplarından ve editörlerden.', 'Writing on the cities’ history, the waqf works and waqf culture, from the inventory books and the editors.')}</Text>
    {stale && <Notice icon="cloud-offline-outline">{t('Çevrimdışısın: cihazdaki son liste gösteriliyor.', 'You are offline: the last list on this device is shown.')}</Notice>}
    <TextInput value={query} onChangeText={setQuery} placeholder={t('Makalelerde ara', 'Search the articles')} placeholderTextColor={colors.soft}
      style={s.search} accessibilityLabel={t('Makalelerde ara', 'Search the articles')} />
    <Chips options={data.facets.kinds.map(k => [k.slug, `${k.label} (${k.n})`])} value={kind} onChange={setKind} all={t('Tüm türler', 'All kinds')} />
    <Chips options={data.facets.cities.map(c => [c.slug, `${c.name} (${c.n})`])} value={city} onChange={setCity} all={t('Tüm şehirler', 'All cities')} />
    {shown.length ? shown.map(a => <ArticleCard key={a.slug} a={a} />) : <Empty title={t('Bu aramayla eşleşen makale yok.', 'No article matches this search.')} />}
    <Button kind="plain" icon="create-outline" label={t('Sen de yaz: yazı gönder', 'Write too: send an article')} onPress={() => router.push('/yazi')} />
  </ScrollView>;
}

function Glossary() {
  const { lang } = useLang();
  const [terms, setTerms] = useState<GlossaryTerm[] | null>(null);
  const [cats, setCats] = useState<{ slug: string; label: string; n: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  useEffect(() => { loadTerms().then(r => { setTerms(r.data.items); setCats(r.data.categories); }, e => setError(String(e?.message ?? e))); }, [lang]);
  const shown = useMemo(() => {
    const q = normalize(query.trim());
    return (terms ?? []).filter(x => (!cat || x.category === cat) && (!q || normalize(`${x.term} ${x.term_en ?? ''} ${x.definition}`).includes(q)));
  }, [terms, query, cat]);

  if (error && !terms) return <Empty title={t('Sözlük açılamadı.', 'The glossary could not be opened.')} body={error} />;
  if (!terms) return <Loading />;
  return <ScrollView contentContainerStyle={{ padding: space.m, gap: space.s + 4, paddingBottom: space.xl }} keyboardShouldPersistTaps="handled">
    <Eyebrow>✦ {t('TERİMLER SÖZLÜĞÜ', 'GLOSSARY')}</Eyebrow>
    <Text style={s.lead}>{t(`Vakıf mimarisinin ${terms.length} terimi, envanter kitaplarının sözlüğünden.`, `${terms.length} terms of waqf architecture, from the inventory books’ glossary.`)}</Text>
    <TextInput value={query} onChangeText={setQuery} placeholder={t('Terim ara (ör. mihrap, revak)', 'Search a term (e.g. mihrab, portico)')} placeholderTextColor={colors.soft}
      style={s.search} accessibilityLabel={t('Terimlerde ara', 'Search the terms')} autoCapitalize="none" />
    <Chips options={cats.map(c => [c.slug, `${c.label} (${c.n})`])} value={cat} onChange={setCat} all={t('Tümü', 'All')} />
    <Button kind="plain" icon="add-circle-outline" label={t('Sözlükte olmayan bir terim öner', 'Suggest a term the glossary lacks')} onPress={() => router.push('/terim-oner')} />
    {shown.length ? letterGroups(shown).map(([letter, list]) => <View key={letter} style={{ gap: space.s }}>
      <Text style={s.letter} accessibilityRole="header">{letter}</Text>
      {list.map(x => <Pressable key={x.slug} onPress={() => router.push(`/terim/${x.slug}`)} style={s.term} accessibilityRole="button" accessibilityLabel={`${x.term}. ${x.definition}`}>
        <Text style={s.termName}>{capitalize(x.term)}{x.term_en ? <Text style={s.termEn}> · {x.term_en}</Text> : null}</Text>
        <Text style={s.termDef} numberOfLines={2}>{x.definition}</Text>
      </Pressable>)}
    </View>) : <Empty title={t('Bu aramayla eşleşen terim yok.', 'No term matches this search.')} />}
  </ScrollView>;
}

function Chips({ options, value, onChange, all }: { options: [string, string][]; value: string | null; onChange: (v: string | null) => void; all: string }) {
  if (options.length < 2) return null;
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s }}>
    {[[null, all] as [string | null, string], ...options].map(([id, label]) => <Pressable key={id ?? 'all'} onPress={() => onChange(id)} accessibilityRole="button"
      accessibilityState={{ selected: value === id }} style={[s.chip, value === id && s.chipOn]}><Text style={[s.chipText, value === id && { color: colors.goldSoft }]}>{label}</Text></Pressable>)}
  </ScrollView>;
}

const s = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 6, padding: space.m, paddingBottom: space.s, backgroundColor: colors.parchment, borderBottomWidth: 1, borderBottomColor: colors.line },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: colors.goldLine },
  tabOn: { backgroundColor: colors.emerald },
  tabText: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  lead: { color: colors.soft, fontSize: 14, lineHeight: 20 },
  search: { minHeight: 46, borderRadius: 999, borderWidth: 1, borderColor: colors.goldLine, backgroundColor: colors.paper, paddingHorizontal: 18, color: colors.ink, fontSize: 15 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.goldLine, backgroundColor: '#ffffff80' },
  chipOn: { backgroundColor: colors.emerald },
  chipText: { color: colors.ink, fontSize: 13 },
  letter: { fontFamily: serif, fontSize: 26, color: colors.goldText, marginTop: space.s },
  term: { padding: 12, borderRadius: 12, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, gap: 3 },
  termName: { fontFamily: serif, fontSize: 18, color: colors.ink },
  termEn: { fontSize: 14, color: colors.soft, fontStyle: 'italic' },
  termDef: { color: colors.soft, fontSize: 13, lineHeight: 18 },
});
