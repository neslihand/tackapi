// Bugün's "Yakınında": the five closest located works. With the permission already given the phone is located at
// once; otherwise a button asks for it, and only then. Hidden when no work has a location.
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { HorizontalRail, SectionHeader } from '@/components/Layout';
import { Button, Notice } from '@/components/UI';
import { WorkTile } from '@/components/WorkTile';
import { byDistance, placed } from '@/lib/explore';
import { useHereIfAllowed, whereAmI, type Here } from '@/lib/geo';
import { t } from '@/lib/i18n';
import { formatDistance } from '@/lib/passport';
import { useContent } from '@/lib/store';
import { home } from './styles';

export function NearbyCard() {
  const { items } = useContent();
  const [here, setHere] = useState<Here | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const located = useMemo(() => placed(items).length, [items]);
  // with the permission already given, the reading Bugün's other cards share
  const allowed = useHereIfAllowed();
  const at = here ?? allowed;
  const near = useMemo(() => at ? byDistance(items, at, 5) : [], [items, at]);
  const locate = () => {
    setBusy(true); setError(null);
    whereAmI().then(setHere, e => setError(String(e?.message ?? e))).finally(() => setBusy(false));
  };
  if (!located) return null;

  if (near.length) return <HorizontalRail title={t('Yakınında', 'Near you')} kicker={t('Etrafındaki kapılar', 'Doors around you')} actionLabel={t('Tümü', 'See all')} onAction={() => router.push('/kesfet')}
    data={near} keyExtractor={n => n.item.slug} itemWidth={180}
    renderItem={({ item, m }) => <WorkTile item={item} extra={`${formatDistance(m)}${item.location?.approximate ? ` · ${t('yaklaşık', 'approx.')}` : ''}`} />} />;

  return <View style={[home.pad, home.gap]}>
    <SectionHeader kicker={t('Etrafındaki kapılar', 'Doors around you')} title={t('Yakınında', 'Near you')} />
    <Card style={home.gap}>
      <Text style={home.body}>{t('Sana en yakın beş eseri gösterelim. Konumun yalnızca bu telefonda mesafe ölçmek için kullanılır, sunucuya gönderilmez.', 'We can show the five works closest to you. Your location is only used on this phone to measure distances; it is not sent to the server.')}</Text>
      {error && <Notice tone="warn" icon="alert-circle-outline">{error}</Notice>}
      <Button icon="navigate" label={t('Yakınımdaki eserleri göster', 'Show the works near me')} onPress={locate} busy={busy} />
    </Card>
  </View>;
}
