// Hesabım: who is signed in, the sync state, the optional profile, the contributions and their status, the permission for
// usage data, signing out and deleting the account (KVKK). Deleting asks twice on the screen itself (Alert does not show in
// the browser build).
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Text } from '@/components/Typography';
import { ProfileInputs, useProfileOptions } from '@/components/ProfileInputs';
import { Button, ButtonRow, Eyebrow, Notice, Title } from '@/components/UI';
import { syncLabel, useAccount, type ProfileFields } from '@/lib/account';
import { setConsent, useConsent } from '@/lib/analytics';
import { contributionsApi, type MyContribution } from '@/lib/contributions';
import { t } from '@/lib/i18n';
import { citySlugOf } from '@/lib/personal';
import { useContent, useFlags, usePassport, useSettings } from '@/lib/store';
import { colors, space } from '@/lib/theme';

export default function Account() {
  const account = useAccount();
  const flags = useFlags();
  const { change } = useSettings();
  const { items } = useContent();
  const { progress } = usePassport();
  const options = useProfileOptions();
  const consent = useConsent();
  const u = account.user;
  const [profile, setProfile] = useState<ProfileFields>({});
  // the saved session is read after the first draw: the form fills when the account is known, so saving can never send it empty
  const [filledFor, setFilledFor] = useState<number | null>(null);
  if (u && filledFor !== u.id) {
    setFilledFor(u.id);
    setProfile({ display_name: u.display_name, age_range: u.age_range, home_city: u.home_city, purposes: u.purposes, interests: u.interests });
  }
  const [saved, setSaved] = useState(false);
  const [mine, setMine] = useState<MyContribution[] | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (account.ready && !account.user) router.replace('/giris'); }, [account.ready, account.user]);
  const signedIn = Boolean(account.user);
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    contributionsApi.mine().then(r => { if (live) setMine(r); }, () => {});
    return () => { live = false; };
  }, [signedIn]);
  if (!account.user) return null;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(String((e as Error)?.message ?? e)); } finally { setBusy(false); }
  }

  return <ScrollView contentContainerStyle={{ padding: space.m, gap: space.m }}>
    <Eyebrow>✦ {t('HESABIM', 'MY ACCOUNT')}</Eyebrow>
    <Title>{account.user.display_name || account.user.email}</Title>
    <Text style={s.body}>{account.user.email}</Text>

    <View style={s.card}>
      <Text style={s.head}>{t('Pasaport eşitleme', 'Passport sync')}</Text>
      <Text style={s.body}>{t(`${Object.keys(progress.discovered).length} keşif, ${Object.keys(progress.visits).length} yerinde mühür ve ${progress.days.length} keşif günü hesabında.`, `${Object.keys(progress.discovered).length} discoveries, ${Object.keys(progress.visits).length} on-the-spot stamps and ${progress.days.length} discovery days in your account.`)}</Text>
      <Text style={s.small} accessibilityLiveRegion="polite">{syncLabel(account.sync, account.lastSync)}</Text>
      <Button kind="plain" icon="sync" label={t('Şimdi eşitle', 'Sync now')} onPress={account.syncNow} busy={account.sync === 'syncing'} />
    </View>

    <Button icon="document-text-outline" label={t('Yazılarım ve terim önerilerim', 'My articles and term suggestions')} onPress={() => router.push('/yazilarim')} />
    {flags.personalization && <Button kind="plain" icon="options-outline" label={t('Keşfet’i bana göre düzenle', 'Arrange Explore for me')} onPress={() => router.push('/tercihler')} />}
    {flags.question_follow && <Button kind="plain" icon="chatbubble-ellipses-outline" label={t('Takip ettiğim sorular', 'Questions I follow')} onPress={() => router.push('/sorularim')} />}

    <View style={s.card}>
      <ProfileInputs value={profile} onChange={v => { setProfile(v); setSaved(false); }} options={options} />
      <Button icon="checkmark" label={saved ? t('Kaydedildi', 'Saved') : t('Bilgilerimi kaydet', 'Save my details')} busy={busy}
        onPress={() => run(() => account.update({ ...profile, display_name: profile.display_name?.trim() || null, home_city: profile.home_city?.trim() || null }).then(() => {
          // the phone's own copy follows, so an emptied field does not come back from it
          change({ homeCity: citySlugOf(profile.home_city, items), interests: profile.interests ?? [] });
          setSaved(true);
        }))} />
    </View>

    <View style={s.card}>
      <Text style={s.head} accessibilityRole="header">{t('Katkıların', 'Your contributions')}</Text>
      {mine === null ? <Text style={s.small}>{t('Katkıların açılıyor…', 'Opening your contributions…')}</Text>
        : !mine.length ? <Text style={s.body}>{t('Henüz katkın yok. Bir eser sayfasının sonundaki “Ziyaretçi katkıları” bölümünden fotoğraf, anı ya da bilgi ekleyebilirsin.', 'No contributions yet. You can add a photo, memory or fact from the “Visitor contributions” section at the end of a work’s page.')}</Text>
          : mine.map(c => <Pressable key={c.id} onPress={() => router.push(`/eser/${c.monument}`)} accessibilityRole="link" style={s.mine}>
            <Text style={s.mineName}>{c.monument_name}</Text>
            <Text style={s.small}>{c.kind === 'photo' ? t('Fotoğraf', 'Photo') : c.text_kind_label}</Text>
            <Text style={[s.status, c.status === 'approved' && { color: colors.emeraldLight }, c.status === 'rejected' && { color: colors.danger }]}>{c.status === 'pending' ? t('Onay bekliyor', 'Awaiting review') : c.status === 'approved' ? t('Yayında', 'Published') : t('Yayınlanmadı', 'Not published')}</Text>
            {!!c.reject_reason && <Text style={s.small}>{t('Gerekçe', 'Reason')}: {c.reject_reason}</Text>}
          </Pressable>)}
    </View>

    <View style={s.card}>
      <Text style={s.head} accessibilityRole="header">{t('Gizlilik', 'Privacy')}</Text>
      <View style={s.line}>
        <Text style={[s.body, { flex: 1 }]}>{t('Keşfimin (baktığım eserler, anlatım biçimi, arama) adım olmadan kaydedilmesine izin veriyorum.', 'I allow my discovery (the works I view, narration style, searches) to be recorded without my name.')}</Text>
        <Switch value={consent === 'granted'} onValueChange={v => setConsent(v ? 'granted' : 'denied')} accessibilityLabel={t('Kullanım verisi izni', 'Permission for usage data')} trackColor={{ true: colors.emeraldLight, false: colors.line }} thumbColor={consent === 'granted' ? colors.gold : '#f4f3f0'} />
      </View>
      <Button kind="plain" icon="document-text-outline" label={t('Aydınlatma metni', 'Privacy notice')} onPress={() => router.push('/gizlilik')} />
    </View>

    {error && <Notice tone="warn" icon="alert-circle-outline">{error}</Notice>}
    <Button icon="log-out-outline" label={t('Çıkış yap', 'Sign out')} onPress={() => run(account.logout)} busy={busy} />
    <Text style={s.small}>{t('Çıkış yapınca mühürlerin bu telefonda kalır; tekrar giriş yapınca yeniden birleşir.', 'Your stamps stay on this phone when you sign out; they are joined again when you sign back in.')}</Text>

    <View style={[s.card, { borderColor: '#c99a90' }]}>
      <Text style={s.head}>{t('Hesabı sil', 'Delete the account')}</Text>
      <Text style={s.body}>{t('E-postan, profilin, sunucudaki pasaportun, katkıların ve yazıların silinir. Bu geri alınamaz.', 'Your email, profile, the passport on the server, your contributions and articles are deleted. This cannot be undone.')}</Text>
      {confirm ? <>
        <Notice tone="warn" icon="warning-outline">{t('Emin misin? Hesabın kalıcı olarak silinecek.', 'Are you sure? Your account will be deleted for good.')}</Notice>
        <ButtonRow>
          <Button fit kind="plain" label={t('Vazgeç', 'Cancel')} onPress={() => setConfirm(false)} />
          <Button fit light style={{ backgroundColor: colors.danger, borderColor: colors.danger }} icon="trash-outline" label={t('Evet, sil', 'Yes, delete')} busy={busy} onPress={() => run(account.remove)} />
        </ButtonRow>
      </> : <Button kind="plain" icon="trash-outline" label={t('Hesabımı sil', 'Delete my account')} onPress={() => setConfirm(true)} />}
    </View>
  </ScrollView>;
}

const s = StyleSheet.create({
  body: { color: colors.soft, fontSize: 15, lineHeight: 22 },
  small: { color: colors.soft, fontSize: 12, lineHeight: 17 },
  head: { color: colors.ink, fontSize: 16, fontWeight: '600' },
  card: { padding: space.m, borderRadius: 14, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, gap: space.s },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  mine: { minHeight: 44, paddingVertical: space.s, borderTopWidth: 1, borderTopColor: colors.line, gap: 2 },
  mineName: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  status: { color: colors.goldText, fontSize: 13, fontWeight: '700' },
});
