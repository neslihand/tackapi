// Ayarlar: "Sana göre", the account, language, the discovery rhythm, the local notifications (all off until the visitor
// turns them on), the offline packs, the usage data choice, what stays where and the welcome shown again. Seven taps on
// the version line open the hidden "Sunum" section for the stage demo.
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { Chip, SegmentedControl } from '@/components/Controls';
import { DemoPicker } from '@/components/DemoPicker';
import { TextInput } from '@/components/Typography';
import { Button, Eyebrow, Notice } from '@/components/UI';
import { syncLabel, useAccount } from '@/lib/account';
import { setConsent, track, useConsent } from '@/lib/analytics';
import { apiBase, request } from '@/lib/api';
import { placeOf, TAPS_TO_UNLOCK } from '@/lib/demo';
import { useDemo } from '@/lib/demo-state';
import { resetHuntToday } from '@/lib/hunt-state';
import { t, useLang, type Lang } from '@/lib/i18n';
import { allowNotifications, notificationsSupported } from '@/lib/notify';
import { allowedHour, dailySlowed } from '@/lib/notifyPlan';
import { clearPhotoCache, useAllPacks } from '@/lib/offline';
import { formatBytes } from '@/lib/packStatus';
import { bringRecallForward } from '@/lib/recall-state';
import type { Rhythm } from '@/lib/rhythm';
import { useContent, useFlags, usePassport, useSettings } from '@/lib/store';
import { colors, hit, radius, space, type } from '@/lib/theme';

const HOURS = [9, 12, 18, 21];   // none in the quiet hours (notifyPlan.ts)
const VERSION = Constants.expoConfig?.version ?? '';

export default function Settings() {
  const { lang, setLang } = useLang();
  const flags = useFlags();
  const { settings, change } = useSettings();
  const account = useAccount();
  const consent = useConsent();
  const [server, setServer] = useState(settings.server);
  const [check, setCheck] = useState<{ busy?: boolean; ok?: boolean; text?: string }>({});
  const [refused, setRefused] = useState(false);
  const showWelcome = () => { change({ onboarded: false }); router.push('/karsilama'); };

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

  return <ScrollView contentContainerStyle={s.page}>
    {flags.personalization && <>
      <Eyebrow>{t('SANA GÖRE', 'FOR YOU')}</Eyebrow>
      <Card onPress={() => router.push('/tercihler')} style={s.line} accessibilityLabel={t('Keşfet’i bana göre düzenle', 'Arrange Explore for me')}>
        <Ionicons name="options-outline" size={28} color={colors.goldText} />
        <View style={s.lineText}>
          <Text style={s.title}>{t('Keşfet’i bana göre düzenle', 'Arrange Explore for me')}</Text>
          <Text style={s.small}>{t('Şehrin, ilgi alanların ve keşif biçimin.', 'Your city, interests and way of exploring.')}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.goldLine} />
      </Card>
    </>}
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

    {flags.flexible_streak && <>
      <Eyebrow>{t('KEŞİF RİTMİ', 'DISCOVERY RHYTHM')}</Eyebrow>
      <Card style={s.stack}>
        <SegmentedControl<Rhythm> accessibilityLabel={t('Keşif ritmi', 'Discovery rhythm')} value={settings.rhythm}
          onChange={rhythm => { change({ rhythm }); track('rhythm_changed', undefined, { rhythm }); }}
          options={[{ key: 'daily', label: t('Günlük', 'Daily') }, { key: 'weekly', label: t('Haftalık', 'Weekly') }, { key: 'off', label: t('Seri tutma', 'No streak') }]} />
        <Text style={s.small}>{settings.rhythm === 'daily' ? t('Her gün zorunlu değil: haftada bir gün boş kalırsa ritmin sürer.', 'Not every day is required: one free day a week keeps your rhythm going.')
          : settings.rhythm === 'weekly' ? t('Haftada bir keşif ritmini sürdürür.', 'One discovery a week keeps your rhythm going.') : t('Seri gösterilmez; pasaportun ve mühürlerin aynen kalır.', 'No streak is shown; your passport and stamps stay as they are.')}</Text>
      </Card>
    </>}

    <Eyebrow>{t('BİLDİRİMLER', 'NOTIFICATIONS')}</Eyebrow>
    {!notificationsSupported && <Notice icon="phone-portrait-outline">{t('Tarayıcı sürümünde bildirim kurulmaz; ayarlar kaydedilir ve telefonda çalışır.', 'The browser version sets up no notifications; the settings are saved and work on the phone.')}</Notice>}
    {refused && <Notice tone="warn" icon="notifications-off-outline">{t('Bildirim izni kapalı, bu yüzden açılmadı. İstersen telefonunun ayarlarından izin verebilirsin; burada tekrar sormayız.', 'Notifications are not allowed, so this stayed off. You can allow them in your phone’s settings; we will not keep asking here.')}</Notice>}
    <Card style={s.stack}>
      <Line title={t('Günün Eşiği', 'Today’s Threshold')} body={t('Her gün bir eser ve kitabından kısa bir cümle.', 'One work a day with a short line from its book.')}
        value={settings.dailyWork} onChange={v => toggle('dailyWork', v)} />
      {settings.dailyWork && <View style={[s.row, { paddingTop: space.xs }]} accessibilityRole="radiogroup" accessibilityLabel={t('Bildirim saati', 'Notification time')}>{HOURS.map(h =>
        <Chip key={h} radio label={`${String(h).padStart(2, '0')}:00`} selected={allowedHour(settings.dailyHour) === h} onPress={() => change({ dailyHour: h })} />)}</View>}
      {dailySlowed(settings) && <Text style={s.small}>{t('Son üç bildirimi açmadığın için Günün Eşiği şimdilik haftada bir geliyor. Birini açınca yeniden her güne döner.', 'You did not open the last three, so Today’s Threshold comes once a week for now. Opening one brings it back to every day.')}</Text>}
      {flags.spaced_repetition && <View style={s.divider} />}
      {flags.spaced_repetition && <Line title={t('Hatırla', 'Recall')} body={t('Okuduğun bir eserden ya da açtığın bir terimden kart hazır olduğunda 18:00’de tek bir not.', 'A single note at 18:00 when a card from a work you read or a term you opened is ready.')}
        value={settings.recallReminder} onChange={v => toggle('recallReminder', v)} />}
      {settings.rhythm === 'daily' && <View style={s.divider} />}
      {settings.rhythm === 'daily' && <Line title={t('Ritim hatırlatması', 'Rhythm reminder')} body={t('Ritmin sürüyorsa ve o gün bir eser açmadıysan akşam 19:00’da tek bir not.', 'A single note at 19:00 when your rhythm is alive and you have not opened a work that day.')}
        value={settings.streakReminder} onChange={v => toggle('streakReminder', v)} />}
      <View style={s.divider} />
      <Text style={s.small}>{t('Günde en fazla bir bildirim gelir, 22:00 ile 09:00 arasında hiç gelmez. Aynı güne birden fazlası düşerse Hatırla önce gelir.', 'At most one notification a day, none between 22:00 and 09:00. If more than one falls on a day, Recall comes first.')}</Text>
      {flags.question_follow && <Text style={s.small}>{t('Takip ettiğin sorunun cevabı Sorularım’a gelir; bunun için telefon bildirimi gönderilmez.', 'The answer to a question you follow arrives in My Questions; no phone notification is sent for it.')}</Text>}
    </Card>
    <SavedPacks />
    <Eyebrow>{t('VERİ', 'DATA')}</Eyebrow>
    <Card style={s.stack}>
      <Line title={t('Kullanım verisi paylaş', 'Share usage data')} body={t('Hangi eserlere baktığını ve nasıl keşfettiğini adın ve IP adresin olmadan kaydederiz; uygulamayı geliştirmek ve eser önermek için. Konumun gönderilmez. Kapatınca bekleyen kayıtlar ve bu cihazın kimliği silinir.', 'We record which works you look at and how you explore, without your name or IP address, to improve the app and recommend works. Your location is never sent. Turning it off deletes waiting records and this device’s ID.')}
        value={consent === 'granted'} onChange={v => setConsent(v ? 'granted' : 'denied')} />
    </Card>
    <Notice icon="lock-closed-outline">{t('Bildirimler telefonunda kurulur; sunucuya bir şey gönderilmez. Konumun ve ayarların bu cihazda kalır; pasaportun yalnızca giriş yaptıysan hesabınla eşitlenir.', 'Notifications are set up on your phone; nothing is sent to the server. Your location and settings stay on this device; your passport is synced with your account only if you sign in.')}</Notice>
    <Eyebrow>{t('KARŞILAMA', 'WELCOME')}</Eyebrow>
    <Card style={s.stack}>
      <Text style={s.small}>{t('İlk açılıştaki soruyu yeniden gör; keşif biçimini baştan seçebilirsin.', 'See the first-run question again; you can choose how to explore anew.')}</Text>
      <Button kind="plain" icon="refresh-outline" label={t('Karşılamayı yeniden göster', 'Show the welcome again')} onPress={showWelcome} />
    </Card>
    <Eyebrow>{t('HAKKINDA', 'ABOUT')}</Eyebrow>
    <Card style={s.stack}>
      <Button kind="plain" icon="library-outline" label={t('Proje ve kaynaklar', 'Project and sources')} onPress={() => router.push('/proje')} />
      <Button kind="plain" icon="lock-closed-outline" label={t('Gizlilik ve veriler', 'Privacy and data')} onPress={() => router.push('/gizlilik')} />
    </Card>
    <Eyebrow>{t('SUNUCU', 'SERVER')}</Eyebrow>
    <Card style={s.stack}>
      <Text style={s.small}>{t('Uygulamanın bağlandığı arka uç. Boş bırakırsan yerleşik adres kullanılır. Demoda bilgisayarın yerel ağ adresini yaz, ör. http://192.168.1.20:8000.', 'The backend the app talks to. Leave it empty for the built-in address. At a demo, type the laptop’s local address, e.g. http://192.168.1.20:8000.')}</Text>
      <TextInput value={server} onChangeText={setServer} placeholder={apiBase()} placeholderTextColor={colors.soft} autoCapitalize="none" autoCorrect={false}
        keyboardType="url" style={s.input} accessibilityLabel={t('Sunucu adresi', 'Server address')} />
      <Button kind="plain" icon="pulse-outline" label={t('Kaydet ve bağlantıyı dene', 'Save and test the connection')} onPress={tryServer} busy={check.busy} />
      {check.text && <Notice tone={check.ok ? 'info' : 'warn'} icon={check.ok ? 'checkmark-circle-outline' : 'alert-circle-outline'}>{check.text}</Notice>}
    </Card>
    <Presentation showWelcome={showWelcome} />
  </ScrollView>;
}

/** Saved route packs of every language, with a way to remove each. Nothing shows until something is saved. */
function SavedPacks() {
  const { packs, remove } = useAllPacks();
  const [cleared, setCleared] = useState(false);
  if (!packs.length) return null;
  return <>
    <Eyebrow>{t('ÇEVRİMDIŞI PAKETLER', 'OFFLINE PACKS')}</Eyebrow>
    <Card style={s.stack}>
      {packs.map(({ routeId, pack }) => <View key={`${routeId}:${pack.lang}`} style={s.line}>
        <View style={s.lineText}>
          <Text style={s.title}>{pack.title ?? routeId}</Text>
          <Text style={s.small}>{[pack.lang.toUpperCase(), t(`${pack.works} eser`, `${pack.works} works`), pack.sizeBytes ? formatBytes(pack.sizeBytes) : null, new Date(pack.date).toLocaleDateString()].filter(Boolean).join(' · ')}</Text>
        </View>
        <Button kind="plain" icon="trash-outline" label={t('Kaldır', 'Remove')} onPress={() => remove(routeId, pack.lang)} />
      </View>)}
      <Text style={s.small}>{t('Kaldırınca metinler silinir. Fotoğraflar telefonun önbelleğinde kalır; yer gerektiğinde sistem temizler ya da aşağıdan hepsini silebilirsin. Bu, diğer paketlerin fotoğraflarını da siler.', 'Removing deletes the texts. The photos stay in the phone’s cache; the system clears them when it needs room, or you can delete them all below. That also deletes the photos of your other packs.')}</Text>
      <Button kind="plain" icon="images-outline" label={cleared ? t('Fotoğraflar silindi', 'Photos deleted') : t('Fotoğraf önbelleğini sil', 'Delete the photo cache')} disabled={cleared} onPress={() => { clearPhotoCache().catch(() => {}); setCleared(true); }} />
    </Card>
  </>;
}

/** The version line and, after seven taps on it, the "Sunum" section; it stays open until hidden. Nothing here writes to
 *  the passport: the demo location, the cards brought forward and the automatic puzzle's reset stay on this phone. */
function Presentation({ showWelcome }: { showWelcome: () => void }) {
  const demo = useDemo();
  const { items, bySlug } = useContent();
  const { progress } = usePassport();
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
    await bringRecallForward();
    setBusy(false);
    setDone({ text: t('Bugün için bütün Hatırla kartların hazır.', 'All your recall cards are ready for today.') });
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
        <Button kind="plain" icon="search-outline" label={t('Otomatik Detay Avı’nı sıfırla', 'Reset the automatic Detail Hunt')}
          onPress={() => { resetHuntToday(new Date()).then(() => setDone({ text: t('Bugünün otomatik bulmacası baştan başlar. Editör görevi varsa o hesabında kalır.', 'Today’s automatic puzzle starts over. An editor’s task stays as played in the passport.') })); }} />
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
  page: { padding: space.m, gap: space.m },
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
