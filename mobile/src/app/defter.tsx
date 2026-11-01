// Keşif Defterim (S09): the works the visitor marked, by label. Works without an account: the labels live in the passport
// on this phone and join the account at sign-in. Personal notes stay in the Hatıra Defteri, on this device only.
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { labelName } from '@/components/Notebook';
import { Text } from '@/components/Typography';
import { Button, Choice, Empty, Notice, WorkCard } from '@/components/UI';
import { useAccount } from '@/lib/account';
import { t } from '@/lib/i18n';
import { hasLabel, NOTEBOOK_LABELS, type NotebookLabel } from '@/lib/passport';
import { useContent, usePassport } from '@/lib/store';
import { colors, space } from '@/lib/theme';

export default function Notebook() {
  const { items } = useContent();
  const { progress, label } = usePassport();
  const account = useAccount();
  const [shown, setShown] = useState<NotebookLabel>('learned');
  // a verified visit always belongs under "Ziyaret ettim", marked or not
  const inLabel = (id: NotebookLabel, slug: string) => hasLabel(progress, slug, id) || (id === 'visited' && Boolean(progress.visits[slug]));
  const list = useMemo(() => items.filter(i => inLabel(shown, i.slug)), [items, shown, progress]); // eslint-disable-line react-hooks/exhaustive-deps

  return <FlatList data={list} keyExtractor={i => i.slug} contentContainerStyle={{ padding: space.m, gap: space.s, paddingBottom: space.xl }}
    ListHeaderComponent={<View style={{ gap: space.m, marginBottom: space.s }}>
      {!account.user && <Notice icon="phone-portrait-outline">{t('Defterin şimdilik bu telefonda. Hesap açarsan kayıtların hesabınla birleşir, hiçbiri kaybolmaz.', 'Your notebook lives on this phone for now. If you create an account your records join it and none is lost.')}</Notice>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} accessibilityRole="tablist">
        {NOTEBOOK_LABELS.map(id => <Choice key={id} label={`${labelName(id)} (${items.filter(i => inLabel(id, i.slug)).length})`} selected={shown === id} onPress={() => setShown(id)} />)}
      </View>
    </View>}
    ListEmptyComponent={<Empty title={t('Bu sayfa henüz boş.', 'This page is still empty.')}
      body={shown === 'learned' ? t('Bir hikâyeyi okuyup bitirdiğinde burada görünür.', 'A story appears here once you finish reading it.') : t('Bir eserin sayfasındaki defter seçeneklerinden ekleyebilirsin.', 'You can add one from the notebook choices on a work’s page.')}
      action={<Button label={t('Eserleri keşfet', 'Explore the works')} icon="compass-outline" onPress={() => router.navigate('/')} />} />}
    renderItem={({ item }) => <View style={{ gap: 4 }}>
      <WorkCard item={item} stamped={progress.visits[item.slug] ? 'visit' : progress.discovered[item.slug] ? 'digital' : undefined} />
      {hasLabel(progress, item.slug, shown) && <Text accessibilityRole="button" onPress={() => label(item.slug, shown, false)} style={{ color: colors.soft, fontSize: 13, paddingVertical: 12, minHeight: 44 }}>{t('Bu sayfadan çıkar', 'Remove from this page')}</Text>}
    </View>} />;
}
