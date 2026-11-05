// Keşif Defteri labels on a work: four independent choices. "Ziyaret ettim" is the visitor's own record; only the phone
// being near the work (the on-the-spot stamp) is a verified visit, and the words keep the two apart.
import { View } from 'react-native';
import { Text } from '@/components/Typography';
import { Choice, Eyebrow } from './UI';
import { t } from '@/lib/i18n';
import { hasLabel, NOTEBOOK_LABELS, type NotebookLabel } from '@/lib/passport';
import { usePassport } from '@/lib/store';
import { colors } from '@/lib/theme';

export const labelName = (label: NotebookLabel) => ({ interested: t('İlgimi çekti', 'Caught my eye'), learned: t('Öğrendim', 'Learned'),
  want_to_go: t('Gitmek istiyorum', 'Want to go'), visited: t('Ziyaret ettim', 'I visited') })[label];

export function NotebookChips({ slug }: { slug: string }) {
  const { progress, label } = usePassport();
  const verified = Boolean(progress.visits[slug]);
  return <View style={{ gap: 10 }}>
    <Eyebrow>✦ {t('KEŞİF DEFTERİM', 'MY NOTEBOOK')}</Eyebrow>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {NOTEBOOK_LABELS.map(id => { const on = hasLabel(progress, slug, id); return <Choice key={id} label={labelName(id)} selected={on} onPress={() => label(slug, id, !on)} />; })}
    </View>
    <Text style={{ color: colors.soft, fontSize: 12, lineHeight: 17 }}>{verified ? t('Bu ziyaret yerinde mühürle doğrulandı.', 'This visit is verified by the on-the-spot stamp.')
      : t('“Ziyaret ettim” kendi kaydındır; yerinde mühür yerine geçmez.', '“I visited” is your own note; it does not replace the on-the-spot stamp.')}</Text>
  </View>;
}
