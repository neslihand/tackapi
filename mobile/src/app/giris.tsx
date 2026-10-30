// Giriş / hesap aç: the site's account. Whatever this phone has gathered goes into the account at sign-in and is
// merged with the other devices' passports.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Button, Eyebrow, Notice, Title } from '@/components/UI';
import { accountApi, useAccount } from '@/lib/account';
import { t } from '@/lib/i18n';
import { usePassport } from '@/lib/store';
import { colors, space } from '@/lib/theme';

export default function SignIn() {
  const account = useAccount();
  const { progress } = usePassport();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [min, setMin] = useState(8);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { accountApi.options().then(o => setMin(o.password_min), () => {}); }, []);
  useEffect(() => { if (account.user) router.replace('/hesap'); }, [account.user]);

  const found = Object.keys(progress.discovered).length;
  async function submit() {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError(t('Geçerli bir e-posta adresi yaz.', 'Enter a valid email address.')); return; }
    if (mode === 'register' && password.length < min) { setError(t(`Şifre en az ${min} karakter olmalı.`, `The password needs at least ${min} characters.`)); return; }
    if (mode === 'register' && !agreed) { setError(t('Hesap açmak için aydınlatma metnini onaylaman gerekiyor.', 'To open an account you need to accept the privacy notice.')); return; }
    setBusy(true);
    try {
      if (mode === 'login') await account.login(email.trim(), password);
      else await account.register({ email: email.trim(), password, consent: true, display_name: name.trim() || undefined });
    } catch (e) { setError(String((e as Error)?.message ?? e)); }
    finally { setBusy(false); }
  }

  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={{ padding: space.m, gap: space.m }} keyboardShouldPersistTaps="handled">
      <Eyebrow>✦ {t('HESAP', 'ACCOUNT')}</Eyebrow>
      <Title>{mode === 'login' ? t('Tekrar hoş geldin.', 'Welcome back.') : t('Pasaportunu her yerde taşı.', 'Carry your passport everywhere.')}</Title>
      <Text style={s.body}>{t('Web sitesindeki hesabınla aynıdır. Mühürlerin, madalyonların ve serin telefonla sitede birleşir.', 'It is the same account as on the website. Your stamps, medallions and streak are joined between the phone and the site.')}
        {found ? t(` Bu telefondaki ${found} keşif hesabına eklenecek.`, ` The ${found} discoveries on this phone will be added to the account.`) : ''}</Text>

      <View style={s.tabs} accessibilityRole="tablist">{([['login', t('Giriş yap', 'Sign in')], ['register', t('Hesap aç', 'Create account')]] as const).map(([id, label]) =>
        <Pressable key={id} onPress={() => { setMode(id); setError(null); }} accessibilityRole="tab" accessibilityState={{ selected: mode === id }} style={[s.tab, mode === id && s.tabOn]}>
          <Text style={[s.tabText, mode === id && { color: colors.goldSoft }]}>{label}</Text></Pressable>)}</View>

      <Field label={t('E-posta', 'Email')} value={email} onChange={setEmail} keyboardType="email-address" autoComplete="email" />
      <Field label={t('Şifre', 'Password')} value={password} onChange={setPassword} secure autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        hint={mode === 'register' ? t(`En az ${min} karakter.`, `At least ${min} characters.`) : undefined} />
      {mode === 'register' && <>
        <Field label={t('Takma ad (isteğe bağlı)', 'Nickname (optional)')} value={name} onChange={setName} autoComplete="nickname" />
        <View style={s.consent}>
          <Switch value={agreed} onValueChange={setAgreed} accessibilityLabel={t('Aydınlatma metnini onaylıyorum', 'I accept the privacy notice')}
            trackColor={{ true: colors.emeraldLight, false: colors.line }} thumbColor={agreed ? colors.gold : '#f4f3f0'} />
          <Text style={[s.small, { flex: 1 }]}>{t('Aydınlatma metnini okudum; e-postamın ve isteğe bağlı profil bilgilerimin hesabım için işlenmesini kabul ediyorum. 13 yaşından büyüğüm.', 'I have read the privacy notice and agree that my email and optional profile details are processed for my account. I am over 13.')}</Text>
        </View>
        <Notice icon="lock-closed-outline">{t('Hesapta e-postan, takma adın ve pasaportun tutulur. Konumun sunucuya gitmez; yalnızca hangi eseri yerinde mühürlediğin pasaporta yazılır. Hesabını istediğin an silebilirsin.', 'The account keeps your email, nickname and passport. Your location never goes to the server; only which work you stamped on the spot is written in the passport. You can delete the account at any time.')}</Notice>
      </>}
      {error && <Notice tone="warn" icon="alert-circle-outline">{error}</Notice>}
      <Button label={mode === 'login' ? t('Giriş yap', 'Sign in') : t('Hesap aç', 'Create account')} icon="arrow-forward" onPress={submit} busy={busy} />
    </ScrollView>
  </KeyboardAvoidingView>;
}

function Field({ label, value, onChange, secure, hint, keyboardType, autoComplete }: {
  label: string; value: string; onChange: (v: string) => void; secure?: boolean; hint?: string;
  keyboardType?: 'email-address'; autoComplete?: 'email' | 'current-password' | 'new-password' | 'nickname';
}) {
  return <View style={{ gap: 4 }}>
    <Text style={s.label}>{label}</Text>
    <TextInput value={value} onChangeText={onChange} secureTextEntry={secure} keyboardType={keyboardType} autoComplete={autoComplete}
      autoCapitalize="none" autoCorrect={false} accessibilityLabel={label} style={s.input} />
    {hint && <Text style={s.small}>{hint}</Text>}
  </View>;
}

const s = StyleSheet.create({
  body: { color: colors.soft, fontSize: 15, lineHeight: 22 },
  small: { color: colors.soft, fontSize: 12, lineHeight: 17 },
  label: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  input: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.goldLine, backgroundColor: colors.paper, paddingHorizontal: 14, color: colors.ink, fontSize: 16 },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: colors.goldLine },
  tabOn: { backgroundColor: colors.emerald },
  tabText: { color: colors.ink, fontSize: 15 },
  consent: { flexDirection: 'row', alignItems: 'center', gap: space.s },
});
