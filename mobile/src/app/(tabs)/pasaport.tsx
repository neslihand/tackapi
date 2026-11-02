// Miras Pasaportu: the streak and the counts, the medallions closest to their next tier, every medallion family
// (bronze, silver, gold) and the stamps, digital and the golden on-the-spot ones.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { ProgressBar, StatPill } from '@/components/Controls';
import { SectionHeader } from '@/components/Layout';
import { ShareSheet, type Shared } from '@/components/ShareSheet';
import { Button, Empty, Eyebrow, Loading, Title, WorkCard } from '@/components/UI';
import { syncLabel, useAccount } from '@/lib/account';
import { t } from '@/lib/i18n';
import { useJournal } from '@/lib/journal';
import { earnedText, fullName, medalFamilies, nextText, nextUp, tierName, type MedalFamily } from '@/lib/medals';
import { compareKeys } from '@/lib/passport';
import { useContent, usePassport, useSettings } from '@/lib/store';
import { bestStreak, streakState } from '@/lib/streak';
import { colors, hit, metal, radius, serif, space, type } from '@/lib/theme';

export default function Passport() {
  const { items, loading } = useContent();
  const { progress } = usePassport();
  const { settings } = useSettings();
  const account = useAccount();
  const [shared, setShared] = useState<Shared | null>(null);
  const memories = useJournal().memories.length;
  const found = useMemo(() => items.filter(i => progress.discovered[i.slug]).sort((a, b) => compareKeys(progress.discovered[b.slug], progress.discovered[a.slug])), [items, progress]);
  const visits = Object.keys(progress.visits).length;
  const cities = new Set(found.map(i => i.city.slug)).size;
  const run = streakState(progress.days, settings.streakMode, new Date());
  const best = useMemo(() => bestStreak(progress.days), [progress.days]);
  const families = useMemo(() => medalFamilies(progress, items), [progress, items]);
  const favorites = items.filter(i => progress.favorites.includes(i.slug));
  const share = (f: MedalFamily) => f.tier && setShared({ kind: 'medal', name: fullName(f), description: earnedText(f), metal: f.tier });
  const rest = run.unit === 'day' && run.count
    ? (run.freezeUsedThisWeek ? t(' Bu haftanın izin günü kullanıldı.', ' This week’s rest day is used.') : t(' Bu haftanın izin günü duruyor.', ' This week’s rest day is still there.'))
    : '';

  return <ScrollView contentContainerStyle={{ padding: space.m, gap: space.m, paddingBottom: space.xl }}>
    <Card tone="dark" style={s.cover}>
      <Eyebrow light>✦ {t('MİRAS PASAPORTUM', 'MY HERITAGE PASSPORT')}</Eyebrow>
      <Title light>{t('Açtığın kapılar', 'The doors you opened')}</Title>
      <View style={s.pills}>
        <StatPill tone="dark" icon={run.periodDone ? 'flame' : 'flame-outline'} value={run.count} label={run.unit === 'week' ? t('hafta seri', 'week streak') : t('gün seri', 'day streak')} />
        <StatPill tone="dark" icon="book-outline" value={found.length} label={t('eser', 'works')} />
        <StatPill tone="dark" icon="ribbon-outline" value={visits} label={t('yerinde mühür', 'on the spot')} />
        <StatPill tone="dark" icon="map-outline" value={cities} label={t('şehir', 'cities')} />
      </View>
      <Text style={s.coverNote}>{t(`En uzun serin: ${best} gün.`, `Your longest streak: ${best} days.`)}{rest} {t('Altın mühürler eserin önünde basıldı.', 'Golden stamps were taken in front of the work.')}</Text>
    </Card>

    <SectionHeader title={t('Sıradaki madalyonların', 'Your next medallions')} />
    {nextUp(families, 3).map(f => <Card key={f.id} style={s.next}>
      <View style={s.nextRow} accessible accessibilityLabel={`${fullName(f)}. ${nextText(f)}`}>
      <Disc tier={f.tier} />
      <View style={{ flex: 1, gap: space.xs }}>
        <Text style={[s.name, s.nextName]}>{fullName(f)}</Text>
        <ProgressBar value={f.value} max={f.next!.required} label={nextText(f)} />
      </View>
      </View>
    </Card>)}

    <SectionHeader title={t('Tüm madalyonlar', 'All medallions')} />
    <View style={s.grid}>
      {families.map(f => {
        const status = f.tier ? `${tierName(f.tier)}${f.next ? ` · ${nextText(f)}` : ''}` : `${t('Kilitli', 'Locked')} · ${nextText(f)}`;
        const body = <>
          <Disc tier={f.tier} />
          <Text style={s.name}>{f.name}</Text>
          {f.subtitle && <Text style={s.subtitle}>{f.subtitle}</Text>}
          <Text style={s.status}>{status}{f.mobile ? ` · ${t('mobil', 'mobile')}` : ''}</Text>
          {f.tier && <Ionicons name="share-social-outline" size={14} color={colors.goldText} />}
        </>;
        const label = `${fullName(f)}. ${status}.`;
        // an earned tier opens its shareable card
        return f.tier
          ? <Pressable key={f.id} style={({ pressed }) => [s.medal, pressed && { opacity: 0.85 }]} onPress={() => share(f)} accessibilityRole="button"
            accessibilityLabel={`${label} ${t('Paylaşmak için dokun.', 'Tap to share.')}`}>{body}</Pressable>
          : <View key={f.id} style={[s.medal, s.locked]} accessible accessibilityLabel={label}>{body}</View>;
      })}
    </View>

    <SectionHeader title={t('Mühürler', 'Stamps')} />
    {found.length ? found.map(i => <WorkCard key={i.slug} item={i} stamped={progress.visits[i.slug] ? 'visit' : 'digital'}
      extra={new Date(progress.visits[i.slug]?.date ?? progress.discovered[i.slug]).toLocaleDateString()} />)
      // the stamps are shown with their works: wait for them before saying the passport is empty
      : loading && !items.length ? <Loading /> : <Empty title={t('Pasaportun seni bekliyor.', 'Your passport is waiting.')} body={t('Bir eserin hikâyesini oku ve “Pasaportuma mühürle”ye dokun.', 'Read a work’s story and tap “Stamp my passport”.')} />}

    <Button kind="plain" icon="images-outline" onPress={() => router.push('/hatira')}
      label={memories ? t(`Hatıra Defterim (${memories})`, `My Memory Book (${memories})`) : t('Hatıra Defterim', 'My Memory Book')} />
    {!!favorites.length && <><SectionHeader title={t('Favoriler', 'Favourites')} />{favorites.map(i => <WorkCard key={i.slug} item={i} />)}</>}
    {account.user ? <Text style={s.small}>{t('Pasaportun hesabınla eşitleniyor.', 'Your passport is synced with your account.')} {syncLabel(account.sync, account.lastSync)}</Text>
      : <Button kind="plain" icon="person-circle-outline" label={t('Giriş yap, pasaportun kaybolmasın', 'Sign in so your passport is never lost')} onPress={() => router.push('/giris')} />}
    <ShareSheet shared={shared} onClose={() => setShared(null)} />
  </ScrollView>;
}

/** The medallion: filled with its metal once a tier is earned, otherwise grey with a lock (the tier is written next
 *  to it either way). */
function Disc({ tier }: { tier: MedalFamily['tier'] }) {
  return <View style={[s.disc, tier ? { backgroundColor: metal[tier] } : s.discLocked]}>
    <Ionicons name={tier ? 'medal' : 'lock-closed-outline'} size={20} color={tier ? colors.emeraldDeep : colors.soft} />
  </View>;
}

const s = StyleSheet.create({
  cover: { padding: space.l, gap: space.s },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s, marginTop: space.s },
  coverNote: { color: colors.goldSoft, marginTop: space.xs, ...type.caption },
  next: { padding: space.m },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  nextName: { textAlign: 'left' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  medal: { width: '48.5%', alignItems: 'center', padding: space.m - space.xs, borderRadius: radius.m, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.goldLine, gap: space.xs },
  locked: { backgroundColor: colors.parchment, borderColor: colors.line },
  disc: { width: hit, height: hit, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.goldLine, alignItems: 'center', justifyContent: 'center' },
  discLocked: { backgroundColor: colors.parchmentDeep, borderColor: colors.soft, borderStyle: 'dashed' },
  name: { ...type.body, fontFamily: serif, color: colors.ink, textAlign: 'center' },
  subtitle: { color: colors.ink, fontWeight: '600', textAlign: 'center', ...type.caption },
  status: { color: colors.soft, textAlign: 'center', ...type.caption },
  small: { color: colors.soft, ...type.caption },
});
