// Miras Pasaportu: digital stamps and the golden on-the-spot ones, the streak, and the medallions (the phone adds
// three of its own: on-the-spot visits and the seven-day streak).
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Empty, Eyebrow, Title, WorkCard } from '@/components/UI';
import { syncLabel, useAccount } from '@/lib/account';
import { t } from '@/lib/i18n';
import { longestStreak, medals, streak } from '@/lib/passport';
import { useContent, usePassport } from '@/lib/store';
import { colors, serif, space } from '@/lib/theme';

const METAL = { bronze: '#a9773f', silver: '#9a9a96', gold: colors.gold };

export default function Passport() {
  const { items } = useContent();
  const { progress } = usePassport();
  const account = useAccount();
  const found = useMemo(() => items.filter(i => progress.discovered[i.slug]).sort((a, b) => progress.discovered[b.slug].localeCompare(progress.discovered[a.slug])), [items, progress]);
  const visits = Object.keys(progress.visits).length;
  const cities = new Set(found.map(i => i.city.slug)).size;
  const run = streak(progress);
  const list = medals(progress, items);
  const favorites = items.filter(i => progress.favorites.includes(i.slug));

  return <ScrollView contentContainerStyle={{ padding: space.m, gap: space.m, paddingBottom: space.xl }}>
    <View style={s.cover}>
      <Eyebrow light>✦ {t('MİRAS PASAPORTUM', 'MY HERITAGE PASSPORT')}</Eyebrow>
      <Title light>{t('Açtığın kapılar', 'The doors you opened')}</Title>
      <View style={s.stats}>
        <Stat n={found.length} label={t('keşif', 'discoveries')} />
        <Stat n={visits} label={t('yerinde', 'on the spot')} />
        <Stat n={cities} label={t('şehir', 'cities')} />
        <Stat n={run.days} label={t('gün seri', 'day streak')} />
      </View>
      <Text style={s.coverNote}>{t(`En uzun serin: ${longestStreak(progress.days)} gün. Altın mühürler eserin önünde basıldı.`, `Your longest streak: ${longestStreak(progress.days)} days. Golden stamps were taken in front of the work.`)}</Text>
    </View>

    <Eyebrow>{t('MADALYONLAR', 'MEDALLIONS')}</Eyebrow>
    <View style={s.medals}>
      {list.map(m => {
        const done = m.value >= m.required;
        return <View key={m.id} style={[s.medal, !done && { opacity: 0.6 }]} accessible
          accessibilityLabel={`${m.name}. ${m.description} ${done ? t('Kazanıldı.', 'Earned.') : `${Math.min(m.value, m.required)}/${m.required}`}`}>
          <View style={[s.disc, { borderColor: METAL[m.metal], backgroundColor: done ? METAL[m.metal] : 'transparent' }]}>
            <Ionicons name={done ? 'medal' : 'lock-closed-outline'} size={22} color={done ? colors.emeraldDeep : METAL[m.metal]} />
          </View>
          <Text style={s.medalName}>{m.name}</Text>
          <Text style={s.medalText}>{done ? t('Kazanıldı', 'Earned') : `${Math.min(m.value, m.required)}/${m.required}`}{m.mobile ? ` · ${t('mobil', 'mobile')}` : ''}</Text>
        </View>;
      })}
    </View>

    <Eyebrow>{t('MÜHÜRLER', 'STAMPS')}</Eyebrow>
    {found.length ? found.map(i => <WorkCard key={i.slug} item={i} stamped={progress.visits[i.slug] ? 'visit' : 'digital'}
      extra={new Date(progress.visits[i.slug]?.date ?? progress.discovered[i.slug]).toLocaleDateString()} />)
      : <Empty title={t('Pasaportun seni bekliyor.', 'Your passport is waiting.')} body={t('Bir eserin hikâyesini oku ve “Pasaportuma mühürle”ye dokun.', 'Read a work’s story and tap “Stamp my passport”.')} />}

    {!!favorites.length && <><Eyebrow>{t('FAVORİLER', 'FAVOURITES')}</Eyebrow>{favorites.map(i => <WorkCard key={i.slug} item={i} />)}</>}
    {account.user ? <Text style={s.small}>{t('Pasaportun hesabınla eşitleniyor.', 'Your passport is synced with your account.')} {syncLabel(account.sync, account.lastSync)}</Text>
      : <Button kind="plain" icon="person-circle-outline" label={t('Giriş yap, pasaportun kaybolmasın', 'Sign in so your passport is never lost')} onPress={() => router.push('/giris')} />}
  </ScrollView>;
}

function Stat({ n, label }: { n: number; label: string }) {
  return <View style={{ alignItems: 'center', flex: 1 }}><Text style={s.statN}>{n}</Text><Text style={s.statLabel}>{label}</Text></View>;
}

const s = StyleSheet.create({
  cover: { padding: space.l, borderRadius: 18, backgroundColor: colors.emerald, borderWidth: 1, borderColor: colors.goldLine, gap: space.s },
  stats: { flexDirection: 'row', marginTop: space.s },
  statN: { fontFamily: serif, fontSize: 30, color: colors.gold },
  statLabel: { color: '#e6e2d8', fontSize: 12 },
  coverNote: { color: '#cfcab9', fontSize: 12, marginTop: space.xs },
  medals: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  medal: { width: '31%', alignItems: 'center', padding: 10, borderRadius: 14, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, gap: 4 },
  disc: { width: 46, height: 46, borderRadius: 23, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  medalName: { fontFamily: serif, color: colors.ink, fontSize: 13, textAlign: 'center' },
  medalText: { color: colors.soft, fontSize: 11, textAlign: 'center' },
  small: { color: colors.soft, fontSize: 12 },
});
