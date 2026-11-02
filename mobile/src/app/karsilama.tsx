// Karşılama (S00, master plan M01): one question and five ways in, each a single tap that leads to real content. No
// account, location, notification or data permission is asked here, and it can be skipped. The choice sets the default
// telling of a work and the order of Bugün (personal.ts); leaving it in any way marks it seen. Ayarlar can show it again.
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Eyebrow, Title, type IconName } from '@/components/UI';
import { useAccount } from '@/lib/account';
import { track } from '@/lib/analytics';
import { dailyPicks } from '@/lib/daily';
import { t } from '@/lib/i18n';
import { NARRATION_FOR, preferenceTiers, type Intent } from '@/lib/personal';
import { useContent, usePassport, useSettings } from '@/lib/store';
import { colors, hit, radius, serif, space, type } from '@/lib/theme';
import { usePreferences } from '@/lib/usePreferences';

function choiceText(c: Intent): { icon: IconName; title: string; body: string } {
  switch (c) {
    case 'listen': return { icon: 'headset-outline', title: t('Hikâye dinle', 'Listen to a story'), body: t('Yarım dakikalık, kaynağı belli bir anlatım.', 'Half a minute, with its source.') };
    case 'nearby': return { icon: 'navigate-outline', title: t('Yakınımda gez', 'Explore near me'), body: t('Konumunla ya da seçtiğin şehirle.', 'By your location or a city you choose.') };
    case 'play': return { icon: 'game-controller-outline', title: t('Oyna', 'Play'), body: t('Eserlerin gerçek bilgilerinden bulmaca ve sorular.', 'Puzzles and questions from the works’ real records.') };
    case 'family': return { icon: 'happy-outline', title: t('Çocuğumla keşfet', 'Explore with my child'), body: t('Çocuklar için hazırlanmış anlatımlar.', 'Tellings prepared for children.') };
    case 'deep': return { icon: 'library-outline', title: t('Derinlemesine öğren', 'Learn in depth'), body: t('Envanter kitabının kendi metni ve kaynakları.', 'The inventory book’s own text and sources.') };
  }
}
const INTENTS: Intent[] = ['listen', 'nearby', 'play', 'family', 'deep'];

export default function Welcome() {
  const insets = useSafeAreaInsets();
  const { items } = useContent();
  const { progress } = usePassport();
  const { change } = useSettings();
  const { prefs } = usePreferences();
  const account = useAccount();
  // the same work as Bugün's Günün Eşiği card
  const today = useMemo(() => dailyPicks(items, progress, new Date(), 1, preferenceTiers(prefs))[0], [items, progress, prefs]);

  // skipped, chosen or left with the back button: seen either way
  useEffect(() => () => change({ onboarded: true }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const leave = (to?: Href) => {
    if (to) router.replace(to);
    else if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  const go = (intent: Intent) => {
    track('onboarding_intent_selected', undefined, { intent, is_guest: !account.user });
    change({ onboarded: true, intent, ...(NARRATION_FOR[intent] ? { narration: NARRATION_FOR[intent] } : {}) });
    if (intent === 'nearby') leave('/kesfet?gorunum=yakin');
    else if (intent === 'play') leave('/oyna');
    else leave(today ? `/eser/${today.slug}${intent === 'listen' ? '?dinle=1' : ''}` : undefined);
  };

  return <View style={[s.page, { paddingTop: insets.top + space.s, paddingBottom: insets.bottom + space.m }]}>
    <View style={s.top}>
      <Pressable onPress={() => leave()} accessibilityRole="button" accessibilityLabel={t('Karşılamayı atla', 'Skip the welcome')} style={s.skip}>
        <Text style={s.skipText}>{t('Atla', 'Skip')}</Text>
      </Pressable>
    </View>

    <ScrollView style={s.scroll} contentContainerStyle={s.body}>
      <View style={s.hero}>
        <Image source={require('../../assets/splash-icon.png')} alt="" style={s.logo} contentFit="contain" accessibilityIgnoresInvertColors />
        <Text style={[s.note, s.centered]}>{t('Bursa, Konya ve Hatay’daki vakıf eserleri, envanter kitaplarının kendi sözleriyle.', 'The foundation works of Bursa, Konya and Hatay, in the words of their inventory books.')}</Text>
      </View>
      <View style={s.stack}>
        <Eyebrow light>{t('TARİHE AÇILAN KAPI', 'A DOOR TO HISTORY')}</Eyebrow>
        <Title light>{t('Bugün nasıl keşfetmek istersin?', 'How would you like to explore today?')}</Title>
        <View style={s.stack}>
          {INTENTS.map(c => {
            const { icon, title, body } = choiceText(c);
            return <Pressable key={c} onPress={() => go(c)} accessibilityRole="button" accessibilityLabel={`${title}. ${body}`}
              style={({ pressed }) => [s.option, pressed && { opacity: 0.85 }]}>
              <Ionicons name={icon} size={24} color={colors.goldText} />
              <View style={s.optionText}>
                <Text style={s.optionTitle}>{title}</Text>
                <Text style={s.optionBody}>{body}</Text>
              </View>
              <Ionicons name="arrow-forward" size={20} color={colors.goldLine} />
            </Pressable>;
          })}
        </View>
      </View>
    </ScrollView>

    <View style={s.actions}>
      <Button kind="gold" icon="compass-outline" label={t('Şimdi keşfet', 'Explore now')} onPress={() => leave()} />
      <Text style={[s.small, s.centered]}>{t('Hesap gerekmez. Konum ya da bildirim izni istemiyoruz.', 'No account needed. We are not asking for location or notifications.')}</Text>
    </View>
  </View>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.emerald, paddingHorizontal: space.m },
  top: { flexDirection: 'row', justifyContent: 'flex-end', minHeight: hit },
  skip: { minWidth: hit, minHeight: hit, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.s },
  skipText: { color: colors.goldSoft, fontWeight: '600', textDecorationLine: 'underline', ...type.body },
  scroll: { flex: 1 },
  body: { flexGrow: 1, justifyContent: 'center', gap: space.l, paddingVertical: space.m },
  hero: { alignItems: 'center', gap: space.s },
  logo: { width: '30%', aspectRatio: 600 / 760 },
  note: { color: colors.parchment, ...type.body },
  small: { color: colors.mist, ...type.caption },
  centered: { textAlign: 'center' },
  stack: { gap: space.s },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.m, minHeight: hit, padding: space.m, borderRadius: radius.l, backgroundColor: colors.paper },
  optionText: { flex: 1, gap: 2 },
  optionTitle: { fontFamily: serif, color: colors.ink, ...type.heading },
  optionBody: { color: colors.soft, ...type.caption },
  actions: { gap: space.s },
});
