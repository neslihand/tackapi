// Karşılama: the three-step first-run welcome (what EŞİK is, how to explore, today's work). Skippable; no permission
// is asked and no account. Leaving it in any way marks it seen; Ayarlar can show it again.
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HeroCard } from '@/components/HeroCard';
import { Button, Eyebrow, Notice, Title, type IconName } from '@/components/UI';
import { mediaUrl } from '@/lib/api';
import { dailyPicks, teaser } from '@/lib/daily';
import { t } from '@/lib/i18n';
import { useContent, usePassport, useSettings } from '@/lib/store';
import { colors, hit, radius, serif, space, type } from '@/lib/theme';
import { choiceSettings, setOnboarded, WELCOME_CHOICES, type WelcomeChoice } from '@/lib/welcome';

const STEPS = 3;

function choiceText(c: WelcomeChoice): { icon: IconName; title: string; body: string } {
  switch (c) {
    case 'story': return { icon: 'headset-outline', title: t('Hikâye dinle', 'Listen to stories'), body: t('Eserleri kısa hikâyeleriyle tanı.', 'Meet the works through their short stories.') };
    case 'nearby': return { icon: 'navigate-outline', title: t('Yakınımda gez', 'Explore near me'), body: t('Çevrendeki eserler Bugün’de öne çıkar.', 'The works around you come first on Today.') };
    case 'play': return { icon: 'game-controller-outline', title: t('Oyna', 'Play'), body: t('Günlük bulmaca ve sorularla öğren.', 'Learn with a daily puzzle and questions.') };
    case 'child': return { icon: 'happy-outline', title: t('Çocuğumla', 'With my child'), body: t('Çocuklar için sade anlatım.', 'A simple telling for children.') };
    case 'deep': return { icon: 'library-outline', title: t('Derinlemesine öğren', 'Learn in depth'), body: t('Envanter kitabının kendi metni.', 'The inventory book’s own text.') };
  }
}

export default function Welcome() {
  const insets = useSafeAreaInsets();
  const { items, loading } = useContent();
  const { progress } = usePassport();
  const { change } = useSettings();
  const [step, setStep] = useState(1);
  const [choice, setChoice] = useState<WelcomeChoice | null>(null);
  // the same work as Bugün's Günün Eşiği card
  const today = useMemo(() => dailyPicks(items, progress, new Date(), 1)[0], [items, progress]);

  // skipped, finished or left with the back button: seen either way
  useEffect(() => () => { setOnboarded(); }, []);

  const toToday = () => { if (router.canGoBack()) router.back(); else router.replace('/'); };
  const pick = (c: WelcomeChoice) => { setChoice(c); change(choiceSettings(c)); };
  const openToday = () => { if (today) router.replace(`/eser/${today.slug}`); else toToday(); };

  return <View style={[s.page, { paddingTop: insets.top + space.s, paddingBottom: insets.bottom + space.m }]}>
    <View style={s.top}>
      <View accessible accessibilityRole="text" accessibilityLabel={t(`Adım ${step} / ${STEPS}`, `Step ${step} of ${STEPS}`)} style={s.steps}>
        {Array.from({ length: STEPS }, (_, i) => <View key={i} style={[s.dot, i + 1 === step && s.dotOn]} />)}
        <Text style={s.stepText}>{step}/{STEPS}</Text>
      </View>
      <Pressable onPress={toToday} accessibilityRole="button" accessibilityLabel={t('Karşılamayı atla', 'Skip the welcome')} style={s.skip}>
        <Text style={s.skipText}>{t('Atla', 'Skip')}</Text>
      </Pressable>
    </View>

    <ScrollView contentContainerStyle={s.body}>
      {step === 1 && <View style={s.hero}>
        <Image source={require('../../assets/splash-icon.png')} alt="" style={s.logo} contentFit="contain" accessibilityIgnoresInvertColors />
        <Text accessibilityRole="header" style={s.lead}>{t('Önünden geçtiğin her tarihî kapının ardındaki gerçek hikâye.', 'The true story behind every historic door you walk past.')}</Text>
        <Text style={[s.note, s.centered]}>{t('Bursa, Konya ve Hatay’daki vakıf eserleri, envanter kitaplarının kendi sözleriyle.', 'The foundation works of Bursa, Konya and Hatay, in the words of their inventory books.')}</Text>
      </View>}

      {step === 2 && <View style={s.stack}>
        <Eyebrow light>{t('SENİN YOLUN', 'YOUR WAY')}</Eyebrow>
        <Title light size={type.title.fontSize}>{t('Nasıl keşfetmek istersin?', 'How do you want to explore?')}</Title>
        <Text style={s.note}>{t('Eserlerin hangi anlatımla açılacağını ve Bugün’ün sırasını belirler. Ayarı her eserde değiştirebilirsin.', 'Sets how works open and the order of Today. You can switch on every work.')}</Text>
        <View accessibilityRole="radiogroup" style={s.stack}>
          {WELCOME_CHOICES.map(c => {
            const { icon, title, body } = choiceText(c);
            const on = choice === c;
            return <Pressable key={c} onPress={() => pick(c)} accessibilityRole="radio" accessibilityState={{ checked: on }} aria-checked={on}
              accessibilityLabel={`${title}. ${body}`} style={({ pressed }) => [s.option, on && s.optionOn, pressed && { opacity: 0.85 }]}>
              <Ionicons name={icon} size={24} color={colors.goldText} />
              <View style={s.optionText}>
                <Text style={s.optionTitle}>{title}</Text>
                <Text style={s.optionBody}>{body}</Text>
              </View>
              <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={on ? colors.emeraldLight : colors.goldLine} />
            </Pressable>;
          })}
        </View>
      </View>}

      {step === 3 && <View style={s.stack}>
        <Eyebrow light>{t('BAŞLAYALIM', 'LET’S BEGIN')}</Eyebrow>
        <Title light size={type.title.fontSize}>{t('İlk eşiğin hazır', 'Your first threshold is ready')}</Title>
        <Text style={s.note}>{t('Her gün bir eser seni bekler. Bugünkü:', 'One work waits for you every day. Today’s:')}</Text>
        {today
          ? <HeroCard image={mediaUrl(today.image?.src) ?? undefined} eyebrow={`✦ ${t('GÜNÜN EŞİĞİ', 'TODAY’S THRESHOLD')}`}
              title={today.name} body={teaser(today)} onPress={openToday}
              accessibilityLabel={`${t('Günün Eşiği', 'Today’s Threshold')}: ${today.name}. ${teaser(today)}`} />
          : loading
            ? <Notice icon="hourglass-outline">{t('Eserler yükleniyor…', 'The works are loading…')}</Notice>
            : <Notice icon="cloud-offline-outline">{t('Eserler şu an açılamadı; Bugün ekranından yeniden deneyebilirsin.', 'The works could not be opened now; you can try again from Today.')}</Notice>}
      </View>}
    </ScrollView>

    <View style={s.actions}>
      {step > 1 && <Button kind="dark" icon="arrow-back" label={t('Geri', 'Back')} onPress={() => setStep(step - 1)} style={s.back} />}
      {step === 1 && <Button kind="gold" icon="arrow-forward" label={t('Başla', 'Start')} onPress={() => setStep(2)} style={s.main} />}
      {step === 2 && <Button kind="gold" icon="arrow-forward" label={t('Devam', 'Continue')} disabled={!choice} onPress={() => setStep(3)} style={s.main} />}
      {step === 3 && (today
        ? <Button kind="gold" icon="book-outline" label={t('Eşiği aç', 'Open the threshold')} onPress={openToday} style={s.main} />
        : <Button kind="gold" icon="sunny-outline" label={t('Bugün’e geç', 'Go to Today')} onPress={toToday} style={s.main} />)}
    </View>
  </View>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.emerald, paddingHorizontal: space.m },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: hit },
  steps: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  dot: { width: space.s, height: space.s, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.gold },
  dotOn: { width: space.l, backgroundColor: colors.gold },
  stepText: { color: colors.goldSoft, marginLeft: space.xs, ...type.caption },
  skip: { minWidth: hit, minHeight: hit, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.s },
  skipText: { color: colors.goldSoft, fontWeight: '600', textDecorationLine: 'underline', ...type.body },
  body: { flexGrow: 1, justifyContent: 'center', paddingVertical: space.l },
  hero: { alignItems: 'center', gap: space.l },
  logo: { width: '55%', aspectRatio: 600 / 760 },
  lead: { fontFamily: serif, color: colors.goldSoft, textAlign: 'center', ...type.title },
  note: { color: colors.parchment, ...type.body },
  centered: { textAlign: 'center' },
  stack: { gap: space.s },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.m, minHeight: hit, padding: space.m, borderRadius: radius.l,
    backgroundColor: colors.paper, borderWidth: 2, borderColor: colors.paper },
  optionOn: { borderColor: colors.gold, backgroundColor: colors.goldSoft },
  optionText: { flex: 1, gap: 2 },
  optionTitle: { color: colors.ink, fontWeight: '700', ...type.heading },
  optionBody: { color: colors.soft, ...type.caption },
  actions: { flexDirection: 'row', gap: space.s },
  back: { paddingHorizontal: space.m },
  main: { flex: 1 },
});
