// Ayarlar: language, the two local notifications (both off until the visitor turns them on) and what stays where.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Button, Eyebrow, Notice } from '@/components/UI';
import { syncLabel, useAccount } from '@/lib/account';
import { apiBase, request } from '@/lib/api';
import { t, useLang, type Lang } from '@/lib/i18n';
import { allowNotifications, notificationsSupported } from '@/lib/notify';
import { useSettings } from '@/lib/store';
import { colors, space } from '@/lib/theme';

const HOURS = [8, 9, 12, 18, 21];

export default function Settings() {
  const { lang, setLang } = useLang();
  const { settings, change } = useSettings();
  const account = useAccount();
  const [server, setServer] = useState(settings.server);
  const [check, setCheck] = useState<{ busy?: boolean; ok?: boolean; text?: string }>({});

  async function tryServer() {
    const url = server.trim();
    if (url && !/^https?:\/\/[^\s/]+/.test(url)) { setCheck({ ok: false, text: t('Adres http:// ya da https:// ile başlamalı.', 'The address must start with http:// or https://.') }); return; }
    change({ server: url });
    setCheck({ busy: true });
    try {
      const cities = await request<unknown[]>('/api/cities');
      setCheck({ ok: true, text: t(`Bağlandı: ${apiBase()} (${cities.length} şehir).`, `Connected: ${apiBase()} (${cities.length} cities).`) });
    } catch (e) { setCheck({ ok: false, text: String((e as Error)?.message ?? e) }); }
  }

  async function toggle(key: 'dailyWork' | 'streakReminder', on: boolean) {
    // in the browser the choice is only saved (nothing can be scheduled there)
    if (on && notificationsSupported && !(await allowNotifications())) {
      change({ [key]: false });
      return;
    }
    change({ [key]: on });
  }

  return <ScrollView contentContainerStyle={{ padding: space.m, gap: space.m }}>
    <Eyebrow>{t('HESAP', 'ACCOUNT')}</Eyebrow>
    <Pressable onPress={() => router.push(account.user ? '/hesap' : '/giris')} accessibilityRole="button" style={[s.card, s.line]}>
      <Ionicons name={account.user ? 'person-circle' : 'person-circle-outline'} size={30} color={colors.goldText} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.title}>{account.user ? account.user.display_name || account.user.email : t('Giriş yap ya da hesap aç', 'Sign in or create an account')}</Text>
        <Text style={s.small}>{account.user ? syncLabel(account.sync, account.lastSync) : t('Pasaportun telefonla web sitesi arasında eşitlensin.', 'Keep your passport in step between the phone and the website.')}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.goldLine} />
    </Pressable>

    <Eyebrow>{t('DİL', 'LANGUAGE')}</Eyebrow>
    <View style={s.row}>{([['tr', 'Türkçe'], ['en', 'English']] as [Lang, string][]).map(([id, label]) =>
      <Pressable key={id} onPress={() => setLang(id)} accessibilityRole="radio" accessibilityState={{ checked: lang === id }} aria-checked={lang === id} hitSlop={4} style={[s.chip, lang === id && s.chipOn]}>
        <Text style={[s.chipText, lang === id && { color: colors.goldSoft }]}>{label}</Text></Pressable>)}</View>

    <Eyebrow>{t('BİLDİRİMLER', 'NOTIFICATIONS')}</Eyebrow>
    {!notificationsSupported && <Notice icon="phone-portrait-outline">{t('Tarayıcı sürümünde bildirim kurulmaz; ayarlar kaydedilir ve telefonda çalışır.', 'The browser version sets up no notifications; the settings are saved and work on the phone.')}</Notice>}
    <View style={s.card}>
      <Line title={t('Günün Eşiği', 'Today’s Threshold')} body={t('Her gün bir eser ve kitabından kısa bir cümle.', 'One work a day with a short line from its book.')}
        value={settings.dailyWork} onChange={v => toggle('dailyWork', v)} />
      {settings.dailyWork && <View style={[s.row, { paddingTop: 4 }]}>{HOURS.map(h => <Pressable key={h} onPress={() => change({ dailyHour: h })}
        accessibilityRole="radio" accessibilityState={{ checked: settings.dailyHour === h }} aria-checked={settings.dailyHour === h} hitSlop={4} style={[s.chip, settings.dailyHour === h && s.chipOn]}>
        <Text style={[s.chipText, settings.dailyHour === h && { color: colors.goldSoft }]}>{String(h).padStart(2, '0')}:00</Text></Pressable>)}</View>}
      <View style={s.divider} />
      <Line title={t('Seri hatırlatması', 'Streak reminder')} body={t('Serin sürüyorsa ve o gün bir eser açmadıysan akşam 19:00’da tek bir not.', 'A single note at 19:00 when your streak is alive and you have not opened a work that day.')}
        value={settings.streakReminder} onChange={v => toggle('streakReminder', v)} />
    </View>
    <Notice icon="lock-closed-outline">{t('Bildirimler telefonunda kurulur; sunucuya bir şey gönderilmez. Konumun ve ayarların bu cihazda kalır; pasaportun yalnızca giriş yaptıysan hesabınla eşitlenir.', 'Notifications are set up on your phone; nothing is sent to the server. Your location and settings stay on this device; your passport is synced with your account only if you sign in.')}</Notice>
    <Eyebrow>{t('SUNUCU', 'SERVER')}</Eyebrow>
    <View style={s.card}>
      <Text style={s.small}>{t('Uygulamanın bağlandığı arka uç. Boş bırakırsan yerleşik adres kullanılır. Demoda bilgisayarın yerel ağ adresini yaz, ör. http://192.168.1.20:8000.', 'The backend the app talks to. Leave it empty for the built-in address. At a demo, type the laptop’s local address, e.g. http://192.168.1.20:8000.')}</Text>
      <TextInput value={server} onChangeText={setServer} placeholder={apiBase()} placeholderTextColor={colors.soft} autoCapitalize="none" autoCorrect={false}
        keyboardType="url" style={s.input} accessibilityLabel={t('Sunucu adresi', 'Server address')} />
      <Button kind="plain" icon="pulse-outline" label={t('Kaydet ve bağlantıyı dene', 'Save and test the connection')} onPress={tryServer} busy={check.busy} />
      {check.text && <Notice tone={check.ok ? 'info' : 'warn'} icon={check.ok ? 'checkmark-circle-outline' : 'alert-circle-outline'}>{check.text}</Notice>}
    </View>
  </ScrollView>;
}

function Line({ title, body, value, onChange }: { title: string; body: string; value: boolean; onChange: (v: boolean) => void }) {
  return <View style={s.line}>
    <View style={{ flex: 1, gap: 2 }}><Text style={s.title}>{title}</Text><Text style={s.small}>{body}</Text></View>
    <Switch value={value} onValueChange={onChange} accessibilityLabel={title} trackColor={{ true: colors.emeraldLight, false: colors.line }} thumbColor={value ? colors.gold : '#f4f3f0'} />
  </View>;
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.goldLine },
  chipOn: { backgroundColor: colors.emerald },
  chipText: { color: colors.ink, fontSize: 14 },
  card: { padding: space.m, borderRadius: 14, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, gap: space.s },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  title: { color: colors.ink, fontSize: 16, fontWeight: '600' },
  small: { color: colors.soft, fontSize: 12, lineHeight: 17 },
  input: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.goldLine, paddingHorizontal: 14, color: colors.ink, fontSize: 15 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: space.s },
});
