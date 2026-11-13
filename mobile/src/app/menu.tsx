// The menu, after the site's side menu (frontend/src/components/SideMenu.tsx): every place of the app in four groups on
// night green (discover, play and learn, the passport and its books, the visitor and the project), the language at the
// foot. Opened from the button at the left of every tab's header; a row or the close button closes it.
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Brand } from '@/components/brand/Brand';
import { NightGlow } from '@/components/brand/Gradient';
import type { IconName } from '@/components/UI';
import { useAccount } from '@/lib/account';
import { currentLang, t, useLang } from '@/lib/i18n';
import { useFlags } from '@/lib/store';
import { colors, fonts, hit, measure, radius, serif, space, type } from '@/lib/theme';

type Row = { to: string; label: string; note?: string; icon: IconName };
const upper = (s: string) => s.toLocaleUpperCase(currentLang() === 'tr' ? 'tr-TR' : 'en');

export default function Menu() {
  const { lang, setLang } = useLang();
  const account = useAccount();
  const flags = useFlags();
  const insets = useSafeAreaInsets();
  const { from: here = '/' } = useLocalSearchParams<{ from?: string }>(); // the place the menu was opened from
  const groups: { title: string; rows: Row[] }[] = [
    { title: t('Keşfet', 'Discover'), rows: [
      { to: '/', label: t('Bugün', 'Today'), note: t('Günün Kapısı ve sana göre öneriler', 'The day’s gate and picks for you'), icon: 'sunny-outline' },
      { to: '/kesfet', label: t('Eserleri keşfet', 'Explore the works'), note: t('Harita, şehirler ve dönemler', 'Map, cities and eras'), icon: 'compass-outline' },
      { to: '/kamera', label: t('Tara', 'Scan'), note: t('Bir yapının fotoğrafından eseri bul', 'Find the work from a photo of a building'), icon: 'scan-outline' },
      { to: '/okuma', label: t('Okuma Odası', 'Reading Room'), note: t('Makaleler', 'Articles'), icon: 'newspaper-outline' },
      { to: '/okuma?bolum=terimler', label: t('Terimler sözlüğü', 'Glossary'), icon: 'book-outline' },
    ] },
    { title: t('Oyna & Öğren', 'Play & Learn'), rows: [
      { to: '/oyna', label: t('Oyna & Öğren', 'Play & Learn'), note: t('Görevler, rotalar ve oyunlar', 'Quests, routes and games'), icon: 'extension-puzzle-outline' },
      { to: '/quiz', label: t('Tarihin İzinde', 'On the Trail of History'), note: t('Bilgi yarışması', 'Knowledge quiz'), icon: 'help-circle-outline' },
      ...(flags.daily_hunt ? [{ to: '/detay-avi', label: t('Detay Avı', 'Detail Hunt'), icon: 'search-outline' as IconName }] : []),
      ...(flags.spaced_repetition ? [{ to: '/hatirla', label: t('Hatırla', 'Recall'), icon: 'refresh-circle-outline' as IconName }] : []),
      ...(flags.mini_games ? [
        { to: '/yapboz', label: t('Kayıp Parçalar', 'The Lost Pieces'), icon: 'grid-outline' as IconName },
        { to: '/dedektif', label: t('Miras Dedektifi', 'Heritage Detective'), icon: 'finger-print-outline' as IconName },
        { to: '/kartlar', label: t('Bilgi Kartları', 'Knowledge Cards'), icon: 'albums-outline' as IconName },
      ] : []),
    ] },
    { title: t('Pasaportum', 'My passport'), rows: [
      { to: '/pasaport', label: t('Miras Pasaportum', 'My Heritage Passport'), note: t('Mühürler ve madalyonlar', 'Stamps and medallions'), icon: 'ribbon-outline' },
      { to: '/defter', label: t('Keşif Defterim', 'My Discovery Notebook'), icon: 'bookmarks-outline' },
      { to: '/hatira', label: t('Hatıra Defterim', 'My Memory Book'), icon: 'images-outline' },
      ...(flags.question_follow ? [{ to: '/sorularim', label: t('Sorularım', 'My questions'), icon: 'chatbubble-ellipses-outline' as IconName }] : []),
      { to: '/yazilarim', label: t('Yazılarım', 'My writing'), icon: 'create-outline' },
    ] },
    { title: t('Sen ve proje', 'You and the project'), rows: [
      account.user ? { to: '/hesap', label: t('Hesabım', 'My account'), note: account.user.display_name ?? account.user.email, icon: 'person-circle-outline' }
        : { to: '/giris', label: t('Giriş yap', 'Sign in'), note: t('Pasaportun kaybolmasın', 'Keep your passport safe'), icon: 'person-circle-outline' },
      ...(flags.personalization ? [{ to: '/tercihler', label: t('Sana göre', 'For you'), icon: 'options-outline' as IconName }] : []),
      { to: '/ayarlar', label: t('Ayarlar', 'Settings'), icon: 'settings-outline' },
      { to: '/gizlilik', label: t('Gizlilik', 'Privacy'), icon: 'shield-checkmark-outline' },
      { to: '/proje', label: t('Proje ve kaynaklar', 'Project and sources'), icon: 'information-circle-outline' },
    ] },
  ];
  const go = (to: string) => {
    router.back();
    // the tabs are reached by name, the rest is pushed over them
    setTimeout(() => (['/', '/kesfet', '/kamera', '/oyna', '/pasaport'].includes(to) ? router.navigate : router.push)(to as Href), 0);
  };
  return <View style={[s.screen, { paddingTop: insets.top }]}>
    <NightGlow color={colors.emeraldLight} opacity={0.5} />
    <View style={s.head}>
      <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t('Menüyü kapat', 'Close the menu')} style={s.close}>
        <Ionicons name="close" size={26} color={colors.goldSoft} />
      </Pressable>
      <Brand />
      <View style={s.close} />
    </View>
    <ScrollView contentContainerStyle={[s.body, { paddingBottom: insets.bottom + space.xl }]}>
      <Text style={s.motto}>{t('Tarihe açılan kapı', 'A door to history')}</Text>
      {groups.map(g => <View key={g.title} style={s.group}>
        <View style={s.groupHead}><View style={s.groupRule} /><Text style={s.groupTitle} accessibilityRole="header">{upper(g.title)}</Text></View>
        {g.rows.map(r => {
          const on = r.to === here;
          return <Pressable key={r.to} onPress={() => go(r.to)} accessibilityRole="link" accessibilityState={{ selected: on }}
            accessibilityLabel={r.note ? `${r.label}. ${r.note}` : r.label} style={({ pressed }) => [s.row, on && s.rowOn, pressed && { opacity: 0.7 }]}>
            <Ionicons name={r.icon} size={20} color={on ? colors.onGold : colors.goldSoft} />
            <View style={{ flex: 1 }}>
              <Text style={[s.label, on && s.labelOn]}>{r.label}</Text>
              {!!r.note && <Text style={[s.note, on && s.noteOn]} numberOfLines={2}>{r.note}</Text>}
            </View>
            <Ionicons name="arrow-forward" size={16} color={on ? colors.onGold : colors.nightStroke} />
          </Pressable>;
        })}
      </View>)}
      <View style={s.foot}>
        <Text style={s.groupTitle}>{upper(t('Dil', 'Language'))}</Text>
        <View style={s.langs}>{(['tr', 'en'] as const).map(l => <Pressable key={l} onPress={() => setLang(l)} accessibilityRole="button" accessibilityState={{ selected: lang === l }}
          accessibilityLabel={l === 'tr' ? 'Türkçe' : 'English'} style={[s.lang, lang === l && s.langOn]}>
          <Text style={[s.langText, lang === l && s.langTextOn]}>{l === 'tr' ? 'Türkçe' : 'English'}</Text>
        </Pressable>)}</View>
      </View>
    </ScrollView>
  </View>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.emerald },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.s, paddingVertical: space.s,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.nightLine },
  close: { width: hit, height: hit, alignItems: 'center', justifyContent: 'center' },
  // iOS draws a full-screen modal over the whole window, outside the app's column: the menu keeps to it on a tablet
  body: { width: '100%', maxWidth: measure.app, alignSelf: 'center', paddingHorizontal: space.gutter, paddingTop: space.l, gap: space.l },
  motto: { fontFamily: fonts.serifItalic, color: colors.goldSoft, fontSize: 30, lineHeight: 34 },
  group: { gap: space.xs },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: space.s, marginBottom: space.xs },
  groupRule: { width: 22, height: 1, backgroundColor: colors.gold },
  groupTitle: { color: colors.gold, ...type.eyebrow },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.m, minHeight: hit + 4, paddingHorizontal: space.m, paddingVertical: space.s, borderRadius: radius.pill },
  rowOn: { backgroundColor: colors.goldSoft },
  label: { fontFamily: serif, color: colors.ivory, fontSize: 20, lineHeight: 24 },
  labelOn: { color: colors.onGold },
  note: { color: colors.mist, ...type.caption },
  noteOn: { color: colors.onGold },
  foot: { gap: space.s, paddingTop: space.m, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.nightLine },
  langs: { flexDirection: 'row', gap: space.s },
  lang: { minHeight: hit, paddingHorizontal: space.l, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: colors.nightStroke },
  langOn: { backgroundColor: colors.goldSoft, borderColor: colors.goldSoft },
  langText: { color: colors.ivory, ...type.small, fontFamily: fonts.sansMedium },
  langTextOn: { color: colors.onGold },
});
