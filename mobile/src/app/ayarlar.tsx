// Ayarlar: language, the local notifications (all off until the visitor turns them on) and what stays where.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Text, TextInput } from '@/components/Typography';
import { Button, Eyebrow, Notice } from '@/components/UI';
import { syncLabel, useAccount } from '@/lib/account';
import { setConsent, track, useConsent } from '@/lib/analytics';
import { apiBase, request } from '@/lib/api';
import { t, useLang, type Lang } from '@/lib/i18n';
import { allowNotifications, notificationsSupported } from '@/lib/notify';
import { allowedHour, dailySlowed } from '@/lib/notifyPlan';
import { clearPhotoCache, useAllPacks } from '@/lib/offline';
import { formatBytes } from '@/lib/packStatus';
import type { Rhythm } from '@/lib/rhythm';
import { useFlags, useSettings } from '@/lib/store';
import { colors, space } from '@/lib/theme';

const HOURS = [9, 12, 18, 21];   // none in the quiet hours (notifyPlan.ts)

export default function Settings() {
  const { lang, setLang } = useLang();
  const flags = useFlags();
  const { settings, change } = useSettings();
  const account = useAccount();
  const consent = useConsent();
  const [server, setServer] = useState(settings.server);
  const [check, setCheck] = useState<{ busy?: boolean; ok?: boolean; text?: string }>({});
  const [refused, setRefused] = useState(false);

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

  async function toggle(key: 'dailyWork' | 'streakReminder' | 'recallReminder', on: boolean) {
    setRefused(false);
    // in the browser the choice is only saved (nothing can be scheduled there)
    if (on && notificationsSupported && !(await allowNotifications())) {
      change({ [key]: false });
      setRefused(true);
      return;
    }
    change({ [key]: on, ...(key === 'dailyWork' && on ? { notifyOpenedAt: Date.now() } : {}) });
    if (!on) track('notification_opt_out', undefined, { notification_type: key });
  }

  return <ScrollView contentContainerStyle={{ padding: space.m, gap: space.m }}>
    {flags.personalization && <>
      <Eyebrow>{t('SANA GÖRE', 'FOR YOU')}</Eyebrow>
      <Pressable onPress={() => router.push('/tercihler')} accessibilityRole="button" style={[s.card, s.line]}>
        <Ionicons name="options-outline" size={28} color={colors.goldText} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.title}>{t('Keşfet’i bana göre düzenle', 'Arrange Explore for me')}</Text>
          <Text style={s.small}>{t('Şehrin, ilgi alanların ve keşif biçimin.', 'Your city, interests and way of exploring.')}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.goldLine} />
      </Pressable>
    </>}
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

    <Eyebrow>{t('KEŞİF RİTMİ', 'DISCOVERY RHYTHM')}</Eyebrow>
    <View style={s.card}>
      <View style={s.row}>{([['daily', t('Günlük', 'Daily')], ['weekly', t('Haftalık', 'Weekly')], ['off', t('Seri tutma', 'No streak')]] as [Rhythm, string][]).map(([id, label]) =>
        <Pressable key={id} onPress={() => { change({ rhythm: id }); track('rhythm_changed', undefined, { rhythm: id }); }} accessibilityRole="radio" accessibilityState={{ checked: settings.rhythm === id }} aria-checked={settings.rhythm === id} hitSlop={4} style={[s.chip, settings.rhythm === id && s.chipOn]}>
          <Text style={[s.chipText, settings.rhythm === id && { color: colors.goldSoft }]}>{label}</Text></Pressable>)}</View>
      <Text style={s.small}>{settings.rhythm === 'daily' ? t('Her gün zorunlu değil: haftada bir gün boş kalırsa ritmin sürer.', 'Not every day is required: one free day a week keeps your rhythm going.')
        : settings.rhythm === 'weekly' ? t('Haftada bir keşif ritmini sürdürür.', 'One discovery a week keeps your rhythm going.') : t('Seri gösterilmez; pasaportun ve mühürlerin aynen kalır.', 'No streak is shown; your passport and stamps stay as they are.')}</Text>
    </View>

    <Eyebrow>{t('BİLDİRİMLER', 'NOTIFICATIONS')}</Eyebrow>
    {!notificationsSupported && <Notice icon="phone-portrait-outline">{t('Tarayıcı sürümünde bildirim kurulmaz; ayarlar kaydedilir ve telefonda çalışır.', 'The browser version sets up no notifications; the settings are saved and work on the phone.')}</Notice>}
    {refused && <Notice tone="warn" icon="notifications-off-outline">{t('Bildirim izni kapalı, bu yüzden açılmadı. İstersen telefonunun ayarlarından izin verebilirsin; burada tekrar sormayız.', 'Notifications are not allowed, so this stayed off. You can allow them in your phone’s settings; we will not keep asking here.')}</Notice>}
    <View style={s.card}>
      <Line title={t('Günün Eşiği', 'Today’s Threshold')} body={t('Her gün bir eser ve kitabından kısa bir cümle.', 'One work a day with a short line from its book.')}
        value={settings.dailyWork} onChange={v => toggle('dailyWork', v)} />
      {settings.dailyWork && <View style={[s.row, { paddingTop: 4 }]}>{HOURS.map(h => <Pressable key={h} onPress={() => change({ dailyHour: h })}
        accessibilityRole="radio" accessibilityState={{ checked: allowedHour(settings.dailyHour) === h }} aria-checked={allowedHour(settings.dailyHour) === h} hitSlop={4} style={[s.chip, allowedHour(settings.dailyHour) === h && s.chipOn]}>
        <Text style={[s.chipText, allowedHour(settings.dailyHour) === h && { color: colors.goldSoft }]}>{String(h).padStart(2, '0')}:00</Text></Pressable>)}</View>}
      {dailySlowed(settings) && <Text style={s.small}>{t('Son üç bildirimi açmadığın için Günün Eşiği şimdilik haftada bir geliyor. Birini açınca yeniden her güne döner.', 'You did not open the last three, so Today’s Threshold comes once a week for now. Opening one brings it back to every day.')}</Text>}
      {flags.spaced_repetition && <View style={s.divider} />}
      {flags.spaced_repetition && <Line title={t('Hatırla', 'Remember')} body={t('Okuduğun bir eserden soru hazır olduğunda 18:00’de tek bir not.', 'A single note at 18:00 when a question from a work you read is ready.')}
        value={settings.recallReminder} onChange={v => toggle('recallReminder', v)} />}
      {settings.rhythm === 'daily' && <View style={s.divider} />}
      {settings.rhythm === 'daily' && <Line title={t('Ritim hatırlatması', 'Rhythm reminder')} body={t('Ritmin sürüyorsa ve o gün bir eser açmadıysan akşam 19:00’da tek bir not.', 'A single note at 19:00 when your rhythm is alive and you have not opened a work that day.')}
        value={settings.streakReminder} onChange={v => toggle('streakReminder', v)} />}
      <View style={s.divider} />
      <Text style={s.small}>{t('Günde en fazla bir bildirim gelir, 22:00 ile 09:00 arasında hiç gelmez. Aynı güne birden fazlası düşerse Hatırla önce gelir.', 'At most one notification a day, none between 22:00 and 09:00. If more than one falls on a day, Remember comes first.')}</Text>
      {flags.question_follow && <Text style={s.small}>{t('Takip ettiğin sorunun cevabı Sorularım’a gelir; bunun için telefon bildirimi gönderilmez.', 'The answer to a question you follow arrives in My Questions; no phone notification is sent for it.')}</Text>}
    </View>
    <SavedPacks />
    <Eyebrow>{t('VERİ', 'DATA')}</Eyebrow>
    <View style={s.card}>
      <Line title={t('Kullanım verisi paylaş', 'Share usage data')} body={t('Hangi eserlere baktığını ve nasıl keşfettiğini adın ve IP adresin olmadan kaydederiz; uygulamayı geliştirmek ve eser önermek için. Konumun gönderilmez. Kapatınca bekleyen kayıtlar ve bu cihazın kimliği silinir.', 'We record which works you look at and how you explore, without your name or IP address, to improve the app and recommend works. Your location is never sent. Turning it off deletes waiting records and this device’s ID.')}
        value={consent === 'granted'} onChange={v => setConsent(v ? 'granted' : 'denied')} />
    </View>
    <Notice icon="lock-closed-outline">{t('Bildirimler telefonunda kurulur; sunucuya bir şey gönderilmez. Konumun ve ayarların bu cihazda kalır; pasaportun yalnızca giriş yaptıysan hesabınla eşitlenir.', 'Notifications are set up on your phone; nothing is sent to the server. Your location and settings stay on this device; your passport is synced with your account only if you sign in.')}</Notice>
    <Eyebrow>{t('HAKKINDA', 'ABOUT')}</Eyebrow>
    <View style={s.card}>
      <Button kind="plain" icon="library-outline" label={t('Proje ve kaynaklar', 'Project and sources')} onPress={() => router.push('/proje')} />
      <Button kind="plain" icon="lock-closed-outline" label={t('Gizlilik ve veriler', 'Privacy and data')} onPress={() => router.push('/gizlilik')} />
    </View>
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

/** Saved route packs of every language, with a way to remove each. Nothing shows until something is saved. */
function SavedPacks() {
  const { packs, remove } = useAllPacks();
  const [cleared, setCleared] = useState(false);
  if (!packs.length) return null;
  return <>
    <Eyebrow>{t('ÇEVRİMDIŞI PAKETLER', 'OFFLINE PACKS')}</Eyebrow>
    <View style={s.card}>
      {packs.map(({ routeId, pack }) => <View key={`${routeId}:${pack.lang}`} style={s.line}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.title}>{pack.title ?? routeId}</Text>
          <Text style={s.small}>{[pack.lang.toUpperCase(), t(`${pack.works} eser`, `${pack.works} works`), pack.sizeBytes ? formatBytes(pack.sizeBytes) : null, new Date(pack.date).toLocaleDateString()].filter(Boolean).join(' · ')}</Text>
        </View>
        <Button kind="plain" icon="trash-outline" label={t('Kaldır', 'Remove')} onPress={() => remove(routeId, pack.lang)} />
      </View>)}
      <Text style={s.small}>{t('Kaldırınca metinler silinir. Fotoğraflar telefonun önbelleğinde kalır; yer gerektiğinde sistem temizler ya da aşağıdan hepsini silebilirsin. Bu, diğer paketlerin fotoğraflarını da siler.', 'Removing deletes the texts. The photos stay in the phone’s cache; the system clears them when it needs room, or you can delete them all below. That also deletes the photos of your other packs.')}</Text>
      <Button kind="plain" icon="images-outline" label={cleared ? t('Fotoğraflar silindi', 'Photos deleted') : t('Fotoğraf önbelleğini sil', 'Delete the photo cache')} disabled={cleared} onPress={() => { clearPhotoCache().catch(() => {}); setCleared(true); }} />
    </View>
  </>;
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
