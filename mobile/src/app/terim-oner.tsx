// Terim öner: a visitor suggests a glossary term; it appears in the glossary once an editor approves it (it is never
// a source for the chat assistant).
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '@/components/Typography';
import { Button, Eyebrow, Loading, Notice, Title } from '@/components/UI';
import { useAccount } from '@/lib/account';
import { t } from '@/lib/i18n';
import { colors, serif, space } from '@/lib/theme';
import { CATEGORIES, categoryName, LIMITS, termIssues, writingApi, type MyTerm, type TermDraft } from '@/lib/writing';

const EMPTY: TermDraft = { term_tr: '', term_en: '', definition_tr: '', definition_child_tr: '', category: '' };

export default function SuggestTerm() {
  const account = useAccount();
  const { terim } = useLocalSearchParams<{ terim?: string }>();      // a word the glossary search did not find
  const [d, setD] = useState<TermDraft>(() => ({ ...EMPTY, term_tr: terim ?? '' }));
  const [issues, setIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<MyTerm | null>(null);
  const set = (k: keyof TermDraft, v: string) => setD(p => ({ ...p, [k]: v }));

  if (!account.ready) return <Loading />;
  if (!account.user) return <ScrollView contentContainerStyle={{ padding: space.l, gap: space.m, flexGrow: 1, justifyContent: 'center' }}>
    <Eyebrow>✦ {t('TERİM ÖNER', 'SUGGEST A TERM')}</Eyebrow>
    <Title>{t('Sözlüğe bir kelime kat.', 'Add a word to the glossary.')}</Title>
    <Text style={s.body}>{t('Sözlükte olmayan bir mimari ya da vakıf terimini öner; editörler onaylayınca sözlükte görünür.', 'Suggest an architecture or waqf term the glossary does not have; once the editors approve it, it appears in the glossary.')}</Text>
    <Button icon="person-circle-outline" label={t('Giriş yap ya da hesap aç', 'Sign in or create an account')} onPress={() => router.push(`/giris?sonra=${encodeURIComponent(`/terim-oner${terim ? `?terim=${terim}` : ''}`)}`)} />
  </ScrollView>;

  async function submit() {
    const list = termIssues(d);
    setIssues(list);
    if (list.length) return;
    setBusy(true);
    try { setSent(await writingApi.suggestTerm(d)); }
    catch (e) { setIssues([String((e as Error)?.message ?? e)]); }
    finally { setBusy(false); }
  }

  if (sent) return <ScrollView contentContainerStyle={{ padding: space.l, gap: space.m, flexGrow: 1, justifyContent: 'center' }}>
    <View style={s.sentMark}><Ionicons name="checkmark" size={34} color={colors.emeraldDeep} /></View>
    <Title>{t('Önerin ulaştı.', 'Your suggestion has arrived.')}</Title>
    <Text style={s.body}>{t(`“${sent.term}” editörlerin onayını bekliyor. Onaylanınca sözlükte görünür.`, `“${sent.term}” is waiting for the editors’ approval. Once approved it appears in the glossary.`)}</Text>
    <Button icon="add" label={t('Bir terim daha öner', 'Suggest another term')} onPress={() => { setD(EMPTY); setSent(null); }} />
    <Button kind="plain" icon="document-text-outline" label={t('Yazılarım ve önerilerim', 'My writing and suggestions')} onPress={() => router.replace('/yazilarim')} />
  </ScrollView>;

  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
    <ScrollView contentContainerStyle={{ padding: space.m, gap: space.m, paddingBottom: space.xl }} keyboardShouldPersistTaps="handled">
      <Eyebrow>✦ {t('TERİM ÖNER', 'SUGGEST A TERM')}</Eyebrow>
      <Title>{t('Sözlüğe bir kelime kat.', 'Add a word to the glossary.')}</Title>
      <Field label={t('Terim', 'Term')} count={`${d.term_tr.length} / ${LIMITS.term[1]}`}>
        <TextInput value={d.term_tr} onChangeText={v => set('term_tr', v)} maxLength={LIMITS.term[1]} style={[s.input, { fontFamily: serif, fontSize: 18 }]} placeholder={t('ör. Şadırvan', 'e.g. Şadırvan')} placeholderTextColor={colors.soft} accessibilityLabel={t('Terim', 'Term')} />
      </Field>
      <Field label={t('İngilizcesi (isteğe bağlı)', 'In English (optional)')}>
        <TextInput value={d.term_en} onChangeText={v => set('term_en', v)} maxLength={120} style={s.input} placeholder={t('ör. Ablution fountain', 'e.g. Ablution fountain')} placeholderTextColor={colors.soft} accessibilityLabel={t('İngilizcesi', 'In English')} />
      </Field>
      <Field label={t('Tanım', 'Definition')} count={`${d.definition_tr.length} / ${LIMITS.definition[1]}`}>
        <TextInput value={d.definition_tr} onChangeText={v => set('definition_tr', v)} maxLength={LIMITS.definition[1]} multiline textAlignVertical="top" style={[s.input, { minHeight: 110 }]}
          placeholder={t('Kısa ve kaynağa dayalı bir açıklama.', 'A short explanation based on a source.')} placeholderTextColor={colors.soft} accessibilityLabel={t('Tanım', 'Definition')} />
      </Field>
      <Field label={t('Çocuklar için (isteğe bağlı)', 'For children (optional)')} count={`${d.definition_child_tr.length} / ${LIMITS.child}`}>
        <TextInput value={d.definition_child_tr} onChangeText={v => set('definition_child_tr', v)} maxLength={LIMITS.child} multiline textAlignVertical="top" style={[s.input, { minHeight: 80 }]}
          placeholder={t('Bir çocuğun anlayacağı bir iki cümle.', 'One or two sentences a child understands.')} placeholderTextColor={colors.soft} accessibilityLabel={t('Çocuklar için tanım', 'Definition for children')} />
      </Field>
      <Text style={s.label}>{t('Kategori (isteğe bağlı)', 'Category (optional)')}</Text>
      <View style={s.chips} accessibilityRole="radiogroup">{CATEGORIES.map(c => <Pressable key={c} onPress={() => set('category', d.category === c ? '' : c)} accessibilityRole="radio" accessibilityLabel={categoryName(c)}
        accessibilityState={{ checked: d.category === c }} aria-checked={d.category === c} hitSlop={4} style={[s.chip, d.category === c && s.chipOn]}><Text style={[s.chipText, d.category === c && { color: colors.goldSoft }]}>{categoryName(c)}</Text></Pressable>)}</View>
      {issues.length > 0 && <Notice tone="warn" icon="alert-circle-outline">{issues.join(' ')}</Notice>}
      <Button kind="gold" icon="send" label={t('Onaya gönder', 'Send for approval')} onPress={submit} busy={busy} />
    </ScrollView>
  </KeyboardAvoidingView>;
}

function Field({ label, count, children }: { label: string; count?: string; children: ReactNode }) {
  return <View style={{ gap: 4 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={s.label}>{label}</Text>{count && <Text style={s.small}>{count}</Text>}</View>
    {children}
  </View>;
}

const s = StyleSheet.create({
  body: { color: colors.soft, fontSize: 15, lineHeight: 22 },
  small: { color: colors.soft, fontSize: 12 },
  label: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  input: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.goldLine, backgroundColor: colors.paper, paddingHorizontal: 14, paddingVertical: 10, color: colors.ink, fontSize: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  chip: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.goldLine },
  chipOn: { backgroundColor: colors.emerald },
  chipText: { color: colors.ink, fontSize: 13 },
  sentMark: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
});
