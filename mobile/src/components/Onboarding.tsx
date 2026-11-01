// S00, the first screen: one question and five ways in. No account, location, notification or data permission is asked
// here. Every choice leads to real content, and it can be skipped.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from './Typography';
import { Button, Eyebrow, Title, type IconName } from './UI';
import { track } from '@/lib/analytics';
import type { Item } from '@/lib/api';
import { t } from '@/lib/i18n';
import { useAccount } from '@/lib/account';
import { NARRATION_FOR } from '@/lib/personal';
import { useSettings, type Intent } from '@/lib/store';
import { colors, serif, space } from '@/lib/theme';

export function Onboarding({ work, onClose }: { work: Item | undefined; onClose: () => void }) {
  const { change } = useSettings();
  const account = useAccount();
  const choices: { id: Intent; icon: IconName; title: string; body: string }[] = [
    { id: 'listen', icon: 'headset-outline', title: t('Hikâye dinle', 'Listen to a story'), body: t('Yarım dakikalık, kaynağı belli bir anlatım.', 'Half a minute, with its source.') },
    { id: 'nearby', icon: 'navigate-outline', title: t('Yakınımda gez', 'Explore near me'), body: t('Konumunla ya da seçtiğin şehirle.', 'By your location or a city you choose.') },
    { id: 'play', icon: 'extension-puzzle-outline', title: t('Oyna', 'Play'), body: t('Eserlerin gerçek bilgilerinden sorular.', 'Questions from the works’ real records.') },
    { id: 'family', icon: 'people-outline', title: t('Çocuğumla keşfet', 'Explore with my child'), body: t('Çocuklar için hazırlanmış anlatımlar.', 'Tellings prepared for children.') },
    { id: 'deep', icon: 'library-outline', title: t('Derinlemesine öğren', 'Learn in depth'), body: t('Kitaptaki ayrıntılı metin ve kaynakları.', 'The book’s detailed text and sources.') },
  ];

  function go(intent: Intent) {
    track('onboarding_intent_selected', undefined, { intent, is_guest: !account.user });
    change({ onboarded: true, intent, ...(NARRATION_FOR[intent] ? { narration: NARRATION_FOR[intent] } : {}) });
    onClose();
    if (intent === 'nearby') router.navigate('/yakin?gorunum=liste');
    else if (intent === 'play') router.navigate('/oyna');
    else if (work) router.push(`/eser/${work.slug}${intent === 'listen' ? '?dinle=1' : ''}`);
  }
  function skip() { change({ onboarded: true }); onClose(); }

  return <Modal visible animationType="fade" onRequestClose={skip}>
    <SafeAreaView style={s.page} accessibilityViewIsModal>
      <ScrollView contentContainerStyle={s.body}>
        <Eyebrow light>{t('TARİHE AÇILAN KAPI', 'A DOOR TO HISTORY')}</Eyebrow>
        <Title light size={38}>{t('Bugün nasıl keşfetmek istersin?', 'How would you like to explore today?')}</Title>
        <View style={{ marginTop: space.s }}>{choices.map(c => <Pressable key={c.id} onPress={() => go(c.id)} accessibilityRole="button" accessibilityLabel={`${c.title}. ${c.body}`} style={({ pressed }) => [s.choice, pressed && { opacity: .75 }]}>
          <Ionicons name={c.icon} size={24} color={colors.gold} />
          <View style={{ flex: 1, gap: 2 }}><Text style={s.title}>{c.title}</Text><Text style={s.text}>{c.body}</Text></View>
          <Ionicons name="arrow-forward" size={20} color={colors.goldSoft} />
        </Pressable>)}</View>
        <Button kind="gold" icon="compass-outline" label={t('Şimdi keşfet', 'Explore now')} onPress={skip} style={{ marginTop: space.m }} />
        <Text style={s.note}>{t('Hesap gerekmez. Konum ya da bildirim izni istemiyoruz.', 'No account needed. We are not asking for location or notifications.')}</Text>
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.emerald },
  body: { padding: space.l, gap: space.s, flexGrow: 1, justifyContent: 'center' },
  choice: { flexDirection: 'row', alignItems: 'center', gap: space.m, minHeight: 76, paddingVertical: 12, borderTopWidth: 1, borderColor: colors.darkLine },
  title: { fontFamily: serif, fontSize: 25, lineHeight: 29, color: colors.ivory },
  text: { color: colors.lightMuted, fontSize: 13, lineHeight: 19 },
  note: { color: colors.lightMuted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: space.s },
});
