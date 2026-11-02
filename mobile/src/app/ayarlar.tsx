// Ayarlar: language, the two local notifications (both off until the visitor turns them on), what stays where and the
// welcome shown again. Seven taps on the version line open the hidden "Sunum" section for the stage demo.
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Card } from '@/components/Card';
import { Chip, SegmentedControl } from '@/components/Controls';
import { DemoPicker } from '@/components/DemoPicker';
import { Button, Eyebrow, Notice } from '@/components/UI';
import { syncLabel, useAccount } from '@/lib/account';
import { apiBase, request } from '@/lib/api';
import { placeOf, TAPS_TO_UNLOCK } from '@/lib/demo';
import { useDemo } from '@/lib/demo-state';
import { resetHuntToday } from '@/lib/hunt-state';
import { t, useLang, type Lang } from '@/lib/i18n';
import { allowNotifications, notificationsSupported } from '@/lib/notify';
import { bringRecallForward } from '@/lib/recall-state';
import { useContent, usePassport, useSettings } from '@/lib/store';
import { colors, hit, radius, space, type } from '@/lib/theme';
import { clearOnboarded } from '@/lib/welcome';

const HOURS = [8, 9, 12, 18, 21];
const VERSION = Constants.expoConfig?.version ?? '';

function showWelcome() {
  clearOnboarded().then(() => router.push('/karsilama'));
}

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
    <Card onPress={() => router.push(account.user ? '/hesap' : '/giris')} style={s.line}
      accessibilityLabel={account.user ? `${t('Hesabım', 'My account')}: ${account.user.display_name || account.user.email}` : t('Giriş yap ya da hesap aç', 'Sign in or create an account')}>
      <Ionicons name={account.user ? 'person-circle' : 'person-circle-outline'} size={30} color={colors.goldText} />
      <View style={s.lineText}>
        <Text style={s.title}>{account.user ? account.user.display_name || account.user.email : t('Giriş yap ya da hesap aç', 'Sign in or create an account')}</Text>
        <Text style={s.small}>{account.user ? syncLabel(account.sync, account.lastSync) : t('Pasaportun telefonla web sitesi arasında eşitlensin.', 'Keep your passport in step between the phone and the website.')}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.goldLine} />
    </Card>

    <Eyebrow>{t('DİL', 'LANGUAGE')}</Eyebrow>
    <View style={s.row} accessibilityRole="radiogroup" accessibilityLabel={t('Dil', 'Language')}>{([['tr', 'Türkçe'], ['en', 'English']] as [Lang, string][]).map(([id, label]) =>
      <Chip key={id} radio label={label} selected={lang === id} onPress={() => setLang(id)} />)}</View>

    <Eyebrow>{t('BİLDİRİMLER', 'NOTIFICATIONS')}</Eyebrow>
    {!notificationsSupported && <Notice icon="phone-portrait-outline">{t('Tarayıcı sürümünde bildirim kurulmaz; ayarlar kaydedilir ve telefonda çalışır.', 'The browser version sets up no notifications; the settings are saved and work on the phone.')}</Notice>}
    <Card style={s.stack}>
      <Line title={t('Günün Eşiği', 'Today’s Threshold')} body={t('Her gün bir eser ve kitabından kısa bir cümle.', 'One work a day with a short line from its book.')}
        value={settings.dailyWork} onChange={v => toggle('dailyWork', v)} />
      {settings.dailyWork && <View style={[s.row, { paddingTop: space.xs }]} accessibilityRole="radiogroup" accessibilityLabel={t('Bildirim saati', 'Notification time')}>{HOURS.map(h =>
        <Chip key={h} radio label={`${String(h).padStart(2, '0')}:00`} selected={settings.dailyHour === h} onPress={() => change({ dailyHour: h })} />)}</View>}
      <View style={s.divider} />
      <Line title={t('Seri hatırlatması', 'Streak reminder')} body={settings.streakMode === 'weekly'
        ? t('Serin sürüyorsa ve bu hafta henüz bir eser açmadıysan Pazar akşamı 19:00’da tek bir not.', 'A single note at 19:00 on Sunday when your streak is alive and you have not opened a work this week.')
        : t('Serin sürüyorsa, bu haftanın izin günü kullanıldıysa ve bugün bir eser açmadıysan akşam 19:00’da tek bir not.', 'A single note at 19:00 when your streak is alive, this week’s rest day is used and you have not opened a work today.')}
        value={settings.streakReminder} onChange={v => toggle('streakReminder', v)} />
      <View style={s.divider} />
      <Text style={s.title}>{t('Seri türü', 'Streak type')}</Text>
      <SegmentedControl accessibilityLabel={t('Seri türü', 'Streak type')} value={settings.streakMode} onChange={streakMode => change({ streakMode })}
        options={[{ key: 'daily', label: t('Günlük', 'Daily') }, { key: 'weekly', label: t('Haftalık', 'Weekly') }]} />
      <Text style={s.small}>{settings.streakMode === 'weekly' ? t('Her hafta en az bir eser.', 'At least one work every week.') : t('Her gün bir eser; haftada bir gün izinli.', 'One work a day; one rest day a week.')}</Text>
    </Card>
    <Notice icon="lock-closed-outline">{t('Bildirimler telefonunda kurulur; sunucuya bir şey gönderilmez. Konumun ve ayarların bu cihazda kalır; pasaportun yalnızca giriş yaptıysan hesabınla eşitlenir.', 'Notifications are set up on your phone; nothing is sent to the server. Your location and settings stay on this device; your passport is synced with your account only if you sign in.')}</Notice>
    <Eyebrow>{t('KARŞILAMA', 'WELCOME')}</Eyebrow>
    <Card style={s.stack}>
      <Text style={s.small}>{t('İlk açılıştaki üç adımı yeniden gör; keşif biçimini baştan seçebilirsin.', 'See the three first-run steps again; you can choose how to explore anew.')}</Text>
      <Button kind="plain" icon="refresh-outline" label={t('Karşılamayı yeniden göster', 'Show the welcome again')}
        onPress={showWelcome} />
    </Card>
    <Eyebrow>{t('SUNUCU', 'SERVER')}</Eyebrow>
    <Card style={s.stack}>
      <Text style={s.small}>{t('Uygulamanın bağlandığı arka uç. Boş bırakırsan yerleşik adres kullanılır. Demoda bilgisayarın yerel ağ adresini yaz, ör. http://192.168.1.20:8000.', 'The backend the app talks to. Leave it empty for the built-in address. At a demo, type the laptop’s local address, e.g. http://192.168.1.20:8000.')}</Text>
      <TextInput value={server} onChangeText={setServer} placeholder={apiBase()} placeholderTextColor={colors.soft} autoCapitalize="none" autoCorrect={false}
        keyboardType="url" style={s.input} accessibilityLabel={t('Sunucu adresi', 'Server address')} />
      <Button kind="plain" icon="pulse-outline" label={t('Kaydet ve bağlantıyı dene', 'Save and test the connection')} onPress={tryServer} busy={check.busy} />
      {check.text && <Notice tone={check.ok ? 'info' : 'warn'} icon={check.ok ? 'checkmark-circle-outline' : 'alert-circle-outline'}>{check.text}</Notice>}
    </Card>
    <Presentation />
  </ScrollView>;
}

/** The version line and, after seven taps on it, the "Sunum" section; it stays open until hidden. */
function Presentation() {
  const demo = useDemo();
  const { items, bySlug } = useContent();
  const { progress } = usePassport();
  const { lang } = useLang();
  const [taps, setTaps] = useState(0);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ text: string; warn?: boolean } | null>(null);
  const unlocked = demo.state?.unlocked ?? false;
  const place = demo.state?.place ?? null;
  const placeName = place ? bySlug(place.slug)?.name ?? place.slug : null;

  function tap() {
    if (unlocked || !demo.state) return;
    const n = taps + 1;
    setTaps(n);
    if (n >= TAPS_TO_UNLOCK) { demo.unlock(); setTaps(0); setDone({ text: t('Sunum bölümü açıldı.', 'The presentation section is open.') }); }
  }

  async function bringCards() {
    if (!Object.keys(progress.discovered).length) { setDone({ text: t('Önce bir eser keşfet; Hatırla kartları keşfettiğin eserlerden gelir.', 'Discover a work first; recall cards come from the works you discover.'), warn: true }); return; }
    setBusy(true);
    const n = await bringRecallForward(progress, items, lang);
    setBusy(false);
    setDone(n ? { text: t(`${n} Hatırla kartı şimdi hazır.`, `${n} recall cards are ready now.`) }
      : { text: t('Getirilecek kart yok; keşfettiğin eserlerden soru çıkmadı.', 'No cards to bring; no questions came from the works you discovered.'), warn: true });
  }

  return <>
    {unlocked && <>
      <Eyebrow>{t('SUNUM', 'PRESENTATION')}</Eyebrow>
      <Card style={s.stack}>
        <Text style={s.title}>{t('Demo konumu', 'Demo location')}</Text>
        <Text style={s.small}>{placeName ? t(`Açık: telefon ${placeName} yanındaymış gibi davranır. Gerçek konum okunmaz.`, `On: the phone acts as if it stood by ${placeName}. The real location is not read.`)
          : t('Kapalı. Seçtiğin eserin yanındaymış gibi davranır; sahnede yerinde mühür göstermek için.', 'Off. The phone acts as if it stood by the work you choose, to show the on-the-spot stamp on stage.')}</Text>
        <View style={s.row}>
          <Button kind="plain" icon="location-outline" label={picking ? t('Seçiciyi kapat', 'Close the picker') : placeName ? t('Eseri değiştir', 'Change the work') : t('Eser seç', 'Choose a work')}
            onPress={() => setPicking(p => !p)} />
          {placeName && <Button kind="plain" icon="close-circle-outline" label={t('Demo konumunu kapat', 'Turn the demo location off')}
            onPress={() => { demo.choose(null); setDone({ text: t('Demo konumu kapandı; gerçek konum yeniden kullanılır.', 'The demo location is off; the real location is used again.') }); }} />}
        </View>
        {picking && <DemoPicker items={items} selected={place?.slug ?? null} onPick={item => {
          const next = placeOf(item);
          if (!next) return;
          demo.choose(next); setPicking(false);
          setDone({ text: t(`Demo konumu: ${item.name}.`, `Demo location: ${item.name}.`) });
        }} />}
        <View style={s.divider} />
        <Button kind="plain" icon="albums-outline" label={t('Hatırla kartlarını şimdi getir', 'Bring the recall cards now')} busy={busy} onPress={bringCards} />
        <Button kind="plain" icon="search-outline" label={t('Detay Avı’nı sıfırla', 'Reset the Detail Hunt')}
          onPress={() => { resetHuntToday(new Date()).then(() => setDone({ text: t('Bugünün Detay Avı baştan başlar.', 'Today’s Detail Hunt starts over.') })); }} />
        <Button kind="plain" icon="refresh-outline" label={t('Karşılamayı göster', 'Show the welcome')} onPress={showWelcome} />
        <View style={s.divider} />
        <Button kind="plain" icon="eye-off-outline" label={t('Sunum bölümünü gizle', 'Hide the presentation section')}
          onPress={() => { demo.hide(); setPicking(false); setDone({ text: t('Sunum bölümü gizlendi; demo konumu kapandı.', 'The presentation section is hidden; the demo location is off.') }); }} />
      </Card>
    </>}
    {done && <Notice tone={done.warn ? 'warn' : 'info'} icon={done.warn ? 'alert-circle-outline' : 'checkmark-circle-outline'}>{done.text}</Notice>}
    <Pressable onPress={tap} accessibilityRole="button" accessibilityLabel={t(`Sürüm ${VERSION}`, `Version ${VERSION}`)} style={s.version}>
      <Text style={s.small}>{t(`EŞİK · Sürüm ${VERSION}`, `EŞİK · Version ${VERSION}`)}</Text>
    </Pressable>
  </>;
}

function Line({ title, body, value, onChange }: { title: string; body: string; value: boolean; onChange: (v: boolean) => void }) {
  return <View style={s.line}>
    <View style={s.lineText}><Text style={s.title}>{title}</Text><Text style={s.small}>{body}</Text></View>
    <Switch value={value} onValueChange={onChange} accessibilityLabel={title} trackColor={{ true: colors.emeraldLight, false: colors.line }} thumbColor={value ? colors.gold : colors.paper} />
  </View>;
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.s, flexWrap: 'wrap' },
  stack: { gap: space.s },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  lineText: { flex: 1, gap: space.xs / 2 },
  title: { color: colors.ink, fontWeight: '600', ...type.body },
  small: { color: colors.soft, ...type.caption },
  input: { minHeight: hit, borderRadius: radius.m, borderWidth: 1, borderColor: colors.goldLine, paddingHorizontal: space.m, color: colors.ink, ...type.body },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: space.s },
  version: { minHeight: hit, alignItems: 'center', justifyContent: 'center' },
});
