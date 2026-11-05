// The optional profile, the same fields as on the site (frontend/src/vakif/AccountPages.tsx): used at sign-up and in Hesabım.
// Full name and date of birth are never asked. The choices come from the server.
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from './Typography';
import { accountApi, type ProfileFields, type ProfileOptions } from '@/lib/account';
import { t } from '@/lib/i18n';
import { colors, serif, space } from '@/lib/theme';

export function useProfileOptions() {
  const [options, setOptions] = useState<ProfileOptions | null>(null);
  useEffect(() => { accountApi.options().then(setOptions, () => {}); }, []);
  return options;
}

const toggle = (list: string[] | undefined, id: string) => (list ?? []).includes(id) ? (list ?? []).filter(x => x !== id) : [...(list ?? []), id];

export function ProfileInputs({ value, onChange, options }: { value: ProfileFields; onChange: (v: ProfileFields) => void; options: ProfileOptions | null }) {
  return <View style={{ gap: space.s + 4 }}>
    <Text style={s.head} accessibilityRole="header">{t('Seni biraz tanıyalım', 'Tell us a little about you')} <Text style={s.small}>{t('(hepsi isteğe bağlı)', '(all optional)')}</Text></Text>
    <View style={{ gap: 4 }}>
      <Text style={s.label}>{t('Takma ad', 'Nickname')}</Text>
      <TextInput value={value.display_name ?? ''} onChangeText={v => onChange({ ...value, display_name: v })} maxLength={40} placeholder={t('Katkılarında görünür', 'Shown on your contributions')} placeholderTextColor={colors.soft} autoComplete="nickname" style={s.input} accessibilityLabel={t('Takma ad', 'Nickname')} />
    </View>
    <View style={{ gap: 4 }}>
      <Text style={s.label}>{t('Yaş aralığı', 'Age range')}</Text>
      <View style={s.chips} accessibilityRole="radiogroup" accessibilityLabel={t('Yaş aralığı', 'Age range')}>
        {[{ id: '', label: t('Belirtmek istemiyorum', 'I would rather not say') }, ...(options?.age_ranges ?? [])].map(o => {
          const on = (value.age_range ?? '') === o.id;
          return <Pressable key={o.id || 'none'} onPress={() => onChange({ ...value, age_range: o.id || null })} accessibilityRole="radio" accessibilityState={{ checked: on }} aria-checked={on} style={[s.chip, on && s.chipOn]}><Text style={[s.chipText, on && s.chipTextOn]}>{o.label}</Text></Pressable>;
        })}
      </View>
    </View>
    <View style={{ gap: 4 }}>
      <Text style={s.label}>{t('Yaşadığın şehir', 'Your home city')}</Text>
      <TextInput value={value.home_city ?? ''} onChangeText={v => onChange({ ...value, home_city: v })} maxLength={60} style={s.input} accessibilityLabel={t('Yaşadığın şehir', 'Your home city')} />
    </View>
    <Many label={t('Bu uygulamaya neden geldin?', 'Why did you come to this app?')} options={options?.purposes} value={value.purposes} onToggle={id => onChange({ ...value, purposes: toggle(value.purposes, id) })} />
    <Many label={t('En çok neyi merak ediyorsun?', 'What are you most curious about?')} options={options?.interests} value={value.interests} onToggle={id => onChange({ ...value, interests: toggle(value.interests, id) })} />
  </View>;
}

function Many({ label, options, value, onToggle }: { label: string; options?: { id: string; label: string }[]; value?: string[]; onToggle: (id: string) => void }) {
  if (!options?.length) return null;
  return <View style={{ gap: 4 }}>
    <Text style={s.label}>{label}</Text>
    <View style={s.chips} accessibilityLabel={label}>{options.map(o => {
      const on = value?.includes(o.id) ?? false;
      return <Pressable key={o.id} onPress={() => onToggle(o.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} aria-checked={on} style={[s.chip, on && s.chipOn]}><Text style={[s.chipText, on && s.chipTextOn]}>{o.label}</Text></Pressable>;
    })}</View>
  </View>;
}

const s = StyleSheet.create({
  head: { fontFamily: serif, fontSize: 22, color: colors.ink },
  small: { fontSize: 13, color: colors.soft },
  label: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  input: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.goldLine, backgroundColor: colors.paper, paddingHorizontal: 14, color: colors.ink, fontSize: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.goldLine, backgroundColor: '#ffffff80' },
  chipOn: { backgroundColor: colors.emerald },
  chipText: { color: colors.ink, fontSize: 13 },
  chipTextOn: { color: colors.goldSoft },
});
