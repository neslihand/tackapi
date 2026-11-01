// Hatıra Defterim: every memory, newest first, with the work it belongs to.
import { FlatList, StyleSheet, View } from 'react-native';
import { Text } from '@/components/Typography';
import { MemoryCard } from '@/components/Journal';
import { Empty, Eyebrow, Loading } from '@/components/UI';
import { t } from '@/lib/i18n';
import { useJournal } from '@/lib/journal';
import { useContent } from '@/lib/store';
import { colors, space } from '@/lib/theme';

export default function MemoryBook() {
  const { memories, ready } = useJournal();
  const { bySlug } = useContent();
  if (!ready) return <Loading />;
  const works = new Set(memories.map(m => m.slug)).size;
  return <FlatList data={memories} keyExtractor={m => m.id} contentContainerStyle={{ padding: space.m, gap: space.s + 4, paddingBottom: space.xl }}
    ListHeaderComponent={<View style={{ gap: 4, marginBottom: space.s }}>
      <Eyebrow>✦ {t('HATIRA DEFTERİM', 'MY MEMORY BOOK')}</Eyebrow>
      {!!memories.length && <Text style={s.lead}>{t(`${works} eserde ${memories.length} hatıra. Yalnızca bu telefonda saklanır.`, `${memories.length} memories at ${works} works. Kept on this phone only.`)}</Text>}
    </View>}
    ListEmptyComponent={<Empty title={t('Defterin henüz boş.', 'Your book is empty for now.')}
      body={t('Bir eserin sayfasında “Hatıra ekle”ye dokun: kendi fotoğrafın ve notunla o anı sakla.', 'Tap “Add a memory” on a work’s page: keep the moment with your own photo and note.')} />}
    renderItem={({ item }) => <MemoryCard m={item} workName={bySlug(item.slug)?.name ?? item.slug} />} />;
}

const s = StyleSheet.create({ lead: { color: colors.soft, fontSize: 14, lineHeight: 20 } });
