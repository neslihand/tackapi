// Ayarlar: language, the two local notifications (both off until the visitor turns them on) and what stays where.
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Eyebrow, Notice } from '@/components/UI';
import { apiBase } from '@/lib/api';
import { t, useLang, type Lang } from '@/lib/i18n';
import { allowNotifications, notificationsSupported } from '@/lib/notify';
import { useSettings } from '@/lib/store';
import { colors, space } from '@/lib/theme';

const HOURS = [8, 9, 12, 18, 21];

export default function Settings() {
  const { lang, setLang } = useLang();
  const { settings, change } = useSettings();

  async function toggle(key: 'dailyWork' | 'streakReminder', on: boolean) {
    // in the browser the choice is only saved (nothing can be scheduled there)
    if (on && notificationsSupported && !(await allowNotifications())) {
      change({ [key]: false });
      return;
    }
    change({ [key]: on });
  }

  return <ScrollView contentContainerStyle={{ padding: space.m, gap: space.m }}>
    <Eyebrow>{t('DİL', 'LANGUAGE')}</Eyebrow>
    <View style={s.row}>{([['tr', 'Türkçe'], ['en', 'English']] as [Lang, string][]).map(([id, label]) =>
      <Pressable key={id} onPress={() => setLang(id)} accessibilityRole="radio" accessibilityState={{ checked: lang === id }} style={[s.chip, lang === id && s.chipOn]}>
        <Text style={[s.chipText, lang === id && { color: colors.goldSoft }]}>{label}</Text></Pressable>)}</View>

    <Eyebrow>{t('BİLDİRİMLER', 'NOTIFICATIONS')}</Eyebrow>
    {!notificationsSupported && <Notice icon="phone-portrait-outline">{t('Tarayıcı sürümünde bildirim kurulmaz; ayarlar kaydedilir ve telefonda çalışır.', 'The browser version sets up no notifications; the settings are saved and work on the phone.')}</Notice>}
    <View style={s.card}>
      <Line title={t('Günün Eşiği', 'Today’s Threshold')} body={t('Her gün bir eser ve kitabından kısa bir cümle.', 'One work a day with a short line from its book.')}
        value={settings.dailyWork} onChange={v => toggle('dailyWork', v)} />
      {settings.dailyWork && <View style={[s.row, { paddingTop: 4 }]}>{HOURS.map(h => <Pressable key={h} onPress={() => change({ dailyHour: h })}
        accessibilityRole="radio" accessibilityState={{ checked: settings.dailyHour === h }} style={[s.chip, settings.dailyHour === h && s.chipOn]}>
        <Text style={[s.chipText, settings.dailyHour === h && { color: colors.goldSoft }]}>{String(h).padStart(2, '0')}:00</Text></Pressable>)}</View>}
      <View style={s.divider} />
      <Line title={t('Seri hatırlatması', 'Streak reminder')} body={t('Serin sürüyorsa ve o gün bir eser açmadıysan akşam 19:00’da tek bir not.', 'A single note at 19:00 when your streak is alive and you have not opened a work that day.')}
        value={settings.streakReminder} onChange={v => toggle('streakReminder', v)} />
    </View>
    <Notice icon="lock-closed-outline">{t('Bildirimler telefonunda kurulur; sunucuya bir şey gönderilmez. Pasaportun, konumun ve ayarların bu cihazda kalır.', 'Notifications are set up on your phone; nothing is sent to the server. Your passport, location and settings stay on this device.')}</Notice>
    <Text style={s.small}>{t('Sunucu', 'Server')}: {apiBase()}</Text>
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
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.goldLine },
  chipOn: { backgroundColor: colors.emerald },
  chipText: { color: colors.ink, fontSize: 14 },
  card: { padding: space.m, borderRadius: 14, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, gap: space.s },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  title: { color: colors.ink, fontSize: 16, fontWeight: '600' },
  small: { color: colors.soft, fontSize: 12, lineHeight: 17 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: space.s },
});
