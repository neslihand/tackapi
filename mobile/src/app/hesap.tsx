// Hesabım: who is signed in, the sync state, the nickname, signing out and deleting the account (KVKK). Deleting
// asks twice on the screen itself (Alert does not show in the browser build).
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Eyebrow, Notice, Title } from '@/components/UI';
import { syncLabel, useAccount } from '@/lib/account';
import { t } from '@/lib/i18n';
import { usePassport } from '@/lib/store';
import { colors, space } from '@/lib/theme';

export default function Account() {
  const account = useAccount();
  const { progress } = usePassport();
  const [name, setName] = useState(account.user?.display_name ?? '');
  const [saved, setSaved] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (account.ready && !account.user) router.replace('/giris'); }, [account.ready, account.user]);
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

    <View style={s.card}>
      <Text style={s.head}>{t('Takma ad', 'Nickname')}</Text>
      <TextInput value={name} onChangeText={v => { setName(v); setSaved(false); }} style={s.input} maxLength={40} accessibilityLabel={t('Takma ad', 'Nickname')} />
      <Button kind="plain" icon="checkmark" label={saved ? t('Kaydedildi', 'Saved') : t('Kaydet', 'Save')} busy={busy}
        disabled={name.trim().length < 2 || name.trim() === (account.user.display_name ?? '')}
        onPress={() => run(() => account.update({ display_name: name.trim() }).then(() => setSaved(true)))} />
    </View>

    {error && <Notice tone="warn" icon="alert-circle-outline">{error}</Notice>}
    <Button icon="log-out-outline" label={t('Çıkış yap', 'Sign out')} onPress={() => run(account.logout)} busy={busy} />
    <Text style={s.small}>{t('Çıkış yapınca mühürlerin bu telefonda kalır; tekrar giriş yapınca yeniden birleşir.', 'Your stamps stay on this phone when you sign out; they are joined again when you sign back in.')}</Text>

    <View style={[s.card, { borderColor: '#c99a90' }]}>
      <Text style={s.head}>{t('Hesabı sil', 'Delete the account')}</Text>
      <Text style={s.body}>{t('E-postan, profilin, sunucudaki pasaportun, katkıların ve yazıların silinir. Bu geri alınamaz.', 'Your email, profile, the passport on the server, your contributions and articles are deleted. This cannot be undone.')}</Text>
      {confirm ? <>
        <Notice tone="warn" icon="warning-outline">{t('Emin misin? Hesabın kalıcı olarak silinecek.', 'Are you sure? Your account will be deleted for good.')}</Notice>
        <View style={{ flexDirection: 'row', gap: space.s }}>
          <Button style={{ flex: 1 }} kind="plain" label={t('Vazgeç', 'Cancel')} onPress={() => setConfirm(false)} />
          <Button light style={{ flex: 1, backgroundColor: colors.danger, borderColor: colors.danger }} icon="trash-outline" label={t('Evet, sil', 'Yes, delete')} busy={busy} onPress={() => run(account.remove)} />
        </View>
      </> : <Button kind="plain" icon="trash-outline" label={t('Hesabımı sil', 'Delete my account')} onPress={() => setConfirm(true)} />}
    </View>
  </ScrollView>;
}

const s = StyleSheet.create({
  body: { color: colors.soft, fontSize: 15, lineHeight: 22 },
  small: { color: colors.soft, fontSize: 12, lineHeight: 17 },
  head: { color: colors.ink, fontSize: 16, fontWeight: '600' },
  card: { padding: space.m, borderRadius: 14, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, gap: space.s },
  input: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.goldLine, paddingHorizontal: 14, color: colors.ink, fontSize: 16 },
});
