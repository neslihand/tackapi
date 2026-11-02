// Sana göre: what the visitor tells the app about themselves, and what the app concluded, in one place. Nothing here is needed to
// use the app. It stays on the phone; with an account the city and interests are the same ones as in Hesabım.
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Text } from '@/components/Typography';
import { Choice, Eyebrow, Notice, Title } from '@/components/UI';
import { useAccount } from '@/lib/account';
import type { ReadingMode } from '@/lib/discovery';
import { t } from '@/lib/i18n';
import { citySlugOf, discoveryProfile, INTENTS, intentLabel, INTERESTS, interestLabel, NARRATION_FOR, type Intent } from '@/lib/personal';
import { useContent, usePassport, useSettings } from '@/lib/store';
import { colors, serif, space } from '@/lib/theme';
import { usePreferences } from '@/lib/usePreferences';

export default function Preferences() {
  const { items } = useContent();
  const { progress } = usePassport();
  const { settings, change } = useSettings();
  const account = useAccount();
  const { prefs, save, narration } = usePreferences();
  const [problem, setProblem] = useState<string | null>(null);
  const cities = [...new Map(items.map(i => [i.city.slug, i.city.name]))];
  const profile = discoveryProfile(prefs, narration, progress);
  const elsewhere = account.user?.home_city && !citySlugOf(account.user.home_city, items) ? account.user.home_city : null;
  const tellings: [ReadingMode, string][] = [['brief', t('Kısa Özet', 'In Brief')], ['story', t('Hikâyeleştirerek', 'As a Story')], ['child', t('Çocuklar İçin', 'For Children')], ['text', t('Detaylı Anlatım', 'In Detail')]];
  const store = (patch: Parameters<typeof save>[0]) => { setProblem(null); save(patch).catch(e => setProblem(String(e?.message ?? e))); };
  function chooseIntent(id: Intent) {
    const next = prefs.intent === id ? null : id;
    if (next && NARRATION_FOR[next]) change({ narration: NARRATION_FOR[next] });
    store({ intent: next });
  }
  const toggleInterest = (id: string) => store({ interests: prefs.interests.includes(id) ? prefs.interests.filter(x => x !== id) : [...prefs.interests, id] });
  const signals = Object.keys(progress.read).length + Object.keys(progress.visits).length + progress.favorites.length + Object.keys(progress.notebook).length;

  return <ScrollView contentContainerStyle={{ padding: space.m, gap: space.m, paddingBottom: space.xl }}>
    <Eyebrow>✦ {t('SANA GÖRE', 'FOR YOU')}</Eyebrow>
    <Title>{t('Keşfet senin gibi olsun', 'Make Explore yours')}</Title>
    <Text style={s.small}>{account.user ? t('Şehrin ve ilgi alanların hesabına yazılır, Hesabım’dakilerle aynıdır. Diğerleri bu telefonda kalır. Yaşın öneride kullanılmaz.', 'Your city and interests are kept on your account, the same as in My Account. The rest stays on this phone. Your age is not used for suggestions.')
      : t('Hepsi yalnızca bu telefonda kalır; hesap ya da izin gerekmez. Hiçbirini seçmek zorunda değilsin.', 'All of this stays on this phone only; no account or permission is needed. You do not have to choose any of it.')}</Text>

    <View style={[s.card, s.line]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.head}>{t('Keşfet’i bana göre düzenle', 'Arrange Explore for me')}</Text>
        <Text style={s.small}>{t('Kapatınca herkesin gördüğü sıra ve liste gelir; seçimlerin silinmez.', 'Turned off, you get the order and list everyone sees; your choices are not deleted.')}</Text>
      </View>
      <Switch value={settings.personalize} onValueChange={v => store({ personalize: v })} accessibilityLabel={t('Keşfet’i bana göre düzenle', 'Arrange Explore for me')} trackColor={{ true: colors.emeraldLight, false: colors.line }} />
    </View>
    {problem && <Notice tone="warn" icon="cloud-offline-outline">{t('Telefonda kaydedildi, hesabına yazılamadı:', 'Saved on the phone, not on your account:')} {problem}</Notice>}

    <Group title={t('Nasıl keşfetmek istersin?', 'How would you like to explore?')} note={t('Keşfet’in ilk kartlarını belirler.', 'Decides the first cards on Explore.')}>
      {INTENTS.map(id => <Choice key={id} label={intentLabel(id)} selected={prefs.intent === id} onPress={() => chooseIntent(id)} />)}
    </Group>
    <Group title={t('Şehrin', 'Your city')} note={t('Önerilerde, haritada ve Günün Eşiği’nde önce bu şehir gelir.', 'This city comes first in suggestions, on the map and in Today’s Threshold.')}>
      {cities.map(([slug, name]) => <Choice key={slug} label={name} selected={prefs.homeCity === slug} onPress={() => store({ homeCity: prefs.homeCity === slug ? null : slug })} />)}
    </Group>
    {elsewhere && <Text style={s.small}>{t(`Hesabındaki şehir: ${elsewhere}. Koleksiyonda henüz yok, bu yüzden önerilerde kullanılmıyor.`, `The city on your account: ${elsewhere}. It is not in the collection yet, so it is not used for suggestions.`)}</Text>}
    <Group title={t('En çok neyi merak ediyorsun?', 'What are you most curious about?')} note={t('İstediğin kadar seç.', 'Choose as many as you like.')}>
      {INTERESTS.map(id => <Choice key={id} label={interestLabel(id)} selected={prefs.interests.includes(id)} onPress={() => toggleInterest(id)} />)}
    </Group>
    <Group title={t('Eserleri nasıl okumak istersin?', 'How would you like to read the works?')} note={t('Her eserde başka bir biçim de seçebilirsin.', 'You can choose another on any work.')}>
      {tellings.map(([id, label]) => <Choice key={id} label={label} selected={settings.narration === id} onPress={() => change({ narration: settings.narration === id ? null : id })} />)}
    </Group>

    <View style={s.card}>
      <Eyebrow>{t('KEŞİF BİÇİMİN', 'HOW YOU EXPLORE')}</Eyebrow>
      {profile ? <><Title>{profile.name}</Title><Text style={s.small}>{profile.because}.</Text></>
        : <Text style={s.small}>{t('Henüz bilmiyoruz. Bir seçim yapınca ya da birkaç eser okuyunca burada görünür.', 'We do not know yet. It appears here once you choose something or read a few works.')}</Text>}
      <Text style={s.small}>{signals ? t(`Öneriler ayrıca okuduğun, kaydettiğin ve ziyaret ettiğin eserlerden çıkar (${signals} kayıt). Bunları Keşif Defteri’nden ve pasaporttan görebilirsin.`, `Suggestions also come from the works you read, saved and visited (${signals} records). You can see them in your notebook and passport.`)
        : t('Öneriler ayrıca okuduğun, kaydettiğin ve ziyaret ettiğin eserlerden çıkar.', 'Suggestions also come from the works you read, saved and visited.')}</Text>
      {account.user ? null : <Text style={s.link} accessibilityRole="link" onPress={() => router.push('/gizlilik')}>{t('Verilerin nasıl kullanılıyor?', 'How is your data used?')}</Text>}
    </View>
  </ScrollView>;
}

function Group({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return <View style={{ gap: space.s }} accessibilityLabel={title}>
    <View style={{ gap: 2 }}><Text style={s.head} accessibilityRole="header">{title}</Text><Text style={s.small}>{note}</Text></View>
    <View style={s.chips}>{children}</View>
  </View>;
}

const s = StyleSheet.create({
  card: { padding: space.m, gap: space.s, borderRadius: 14, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  head: { fontFamily: serif, fontSize: 20, lineHeight: 25, color: colors.ink },
  small: { color: colors.soft, fontSize: 13, lineHeight: 19 },
  link: { color: colors.goldText, fontSize: 14, textDecorationLine: 'underline', minHeight: 32, paddingTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
