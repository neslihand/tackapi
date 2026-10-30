// Yazı gönder (and ?duzenle=<id>: correct a rejected or waiting article). The article waits for an editor's approval
// and is published under the visitor's nickname. The unsent draft is kept on the device.
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import type { ImagePickerAsset } from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputSelectionChangeEvent } from 'react-native';
import { Button, Empty, Eyebrow, Loading, Notice, Title } from '@/components/UI';
import { useAccount } from '@/lib/account';
import { mediaUrl } from '@/lib/api';
import { t } from '@/lib/i18n';
import { pickPhoto } from '@/lib/journal';
import { normalize } from '@/lib/passport';
import { articleBlocks, type ArticleKind } from '@/lib/reading';
import { useContent } from '@/lib/store';
import { colors, serif, space } from '@/lib/theme';
import { articleIssues, EMPTY_DRAFT, kindName, kindNote, LIMITS, readDraft, readingMinutes, saveDraft, wordCount, writingApi, type Draft, type MyArticle } from '@/lib/writing';

export default function WriteArticle() {
  const { duzenle } = useLocalSearchParams<{ duzenle?: string }>();
  const editId = Number(duzenle) || null;
  const account = useAccount();
  const [existing, setExisting] = useState<MyArticle | null | 'missing'>(null);
  useEffect(() => {
    if (!account.user || !editId) return;
    writingApi.mine().then(list => setExisting(list.find(a => a.id === editId) ?? 'missing'), () => setExisting('missing'));
  }, [account.user, editId]);

  if (!account.ready) return <Loading />;
  if (!account.user) return <ScrollView contentContainerStyle={{ padding: space.l, gap: space.m, flexGrow: 1, justifyContent: 'center' }}>
    <Eyebrow>✦ {t('YAZI GÖNDER', 'SEND AN ARTICLE')}</Eyebrow>
    <Title>{t('Hikâyeni anlat.', 'Tell your story.')}</Title>
    <Text style={s.body}>{t('Bildiğin bir eserin, büyüdüğün mahallenin ya da bir vakıf geleneğinin hikâyesini yaz. Editörler okuyup onaylayınca Okuma Odası’nda takma adınla yayımlanır.',
      'Write the story of a work you know, the quarter you grew up in or a waqf tradition. Once the editors read and approve it, it is published in the Reading Room under your nickname.')}</Text>
    <Button icon="person-circle-outline" label={t('Giriş yap ya da hesap aç', 'Sign in or create an account')} onPress={() => router.push('/giris')} />
  </ScrollView>;
  if (editId && existing === null) return <Loading />;
  if (editId && existing === 'missing') return <Empty title={t('Bu yazı bulunamadı.', 'This article could not be found.')} />;
  return <Writer key={editId ?? 'new'} existing={existing && existing !== 'missing' ? existing : null} />;
}

function Writer({ existing }: { existing: MyArticle | null }) {
  const { items } = useContent();
  const [d, setD] = useState<Draft>(() => existing ? { kind: existing.kind, title: existing.title, summary: existing.summary ?? '', body: existing.body,
    city: existing.city ?? '', monuments: existing.monuments.map(m => m.slug), cover_alt: existing.cover?.alt ?? '' } : EMPTY_DRAFT);
  const [draftReady, setDraftReady] = useState(Boolean(existing));
  const [cover, setCover] = useState<ImagePickerAsset | null>(null);
  const [dropCover, setDropCover] = useState(false);
  const [preview, setPreview] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<MyArticle | null>(null);
  const [pick, setPick] = useState('');
  const [caret, setCaret] = useState(0);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD(p => ({ ...p, [k]: v }));
  useEffect(() => { if (!existing) readDraft().then(saved => { if (saved) setD(saved); }).finally(() => setDraftReady(true)); }, [existing]);
  useEffect(() => { if (!existing && draftReady && !sent) saveDraft(d); }, [d, existing, draftReady, sent]);

  const cities = useMemo(() => [...new Map(items.map(i => [i.city.slug, i.city.name]))].sort((a, b) => a[1].localeCompare(b[1], 'tr')), [items]);
  const matches = useMemo(() => {
    const needle = normalize(pick.trim());
    if (needle.length < 2) return [];
    return items.filter(a => !d.monuments.includes(a.slug) && normalize(`${a.name} ${a.city.name}`).includes(needle)).slice(0, 6);
  }, [pick, items, d.monuments]);
  const chars = d.body.trim().length;
  const oldCover = existing?.cover && !dropCover ? mediaUrl(existing.cover.thumb) : null;

  // "## " / "> " at the start of the line the cursor is on (again: taken off)
  function mark(prefix: '## ' | '> ') {
    const text = d.body, start = Math.min(caret, text.length), lineStart = text.lastIndexOf('\n', start - 1) + 1;
    set('body', text.slice(0, lineStart) + (text.startsWith(prefix, lineStart) ? text.slice(lineStart + prefix.length) : prefix + text.slice(lineStart)));
  }
  async function chooseCover() {
    try { const p = await pickPhoto('library'); if (p) { setCover(p); setDropCover(false); } }
    catch (e) { setIssues([String((e as Error)?.message ?? e)]); }
  }
  async function submit() {
    const list = articleIssues(d);
    setIssues(list);
    if (list.length) return;
    setBusy(true);
    try {
      const out = existing ? await writingApi.update(existing.id, d, cover, dropCover && !cover) : await writingApi.submit(d, cover);
      if (!existing) saveDraft(null);
      setSent(out);
    } catch (e) { setIssues([String((e as Error)?.message ?? e)]); }
    finally { setBusy(false); }
  }

  if (sent) return <ScrollView contentContainerStyle={{ padding: space.l, gap: space.m, flexGrow: 1, justifyContent: 'center' }}>
    <View style={s.sentMark}><Ionicons name="checkmark" size={34} color={colors.emeraldDeep} /></View>
    <Title>{t('Yazın ulaştı.', 'Your article has arrived.')}</Title>
    <Text style={s.body}>{t(`“${sent.title}” editörlerin onayını bekliyor. Onaylanınca Okuma Odası’nda yayımlanır; durumunu “Yazılarım” ekranından izleyebilirsin.`,
      `“${sent.title}” is waiting for the editors’ approval. Once approved it is published in the Reading Room; you can follow it on the “My writing” screen.`)}</Text>
    <Button icon="document-text-outline" label={t('Yazılarım', 'My writing')} onPress={() => router.replace('/yazilarim')} />
    <Button kind="plain" label={t('Okuma Odası’na dön', 'Back to the Reading Room')} onPress={() => router.replace('/okuma')} />
  </ScrollView>;

  const blocks = articleBlocks(d.body);
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
    <ScrollView contentContainerStyle={{ padding: space.m, gap: space.m, paddingBottom: space.xl * 2 }} keyboardShouldPersistTaps="handled">
      <Eyebrow>✦ {existing ? t('YAZINI DÜZENLE', 'EDIT YOUR ARTICLE') : t('YAZI GÖNDER', 'SEND AN ARTICLE')}</Eyebrow>
      <Title>{t('Hikâyeni anlat.', 'Tell your story.')}</Title>
      {existing?.status === 'rejected' && existing.reject_reason && <Notice tone="warn" icon="create-outline">{t('Editör notu', 'Editor’s note')}: {existing.reject_reason}</Notice>}

      <Text style={s.label}>{t('Ne hakkında yazıyorsun?', 'What are you writing about?')}</Text>
      <View style={{ gap: space.s }} accessibilityRole="radiogroup">{(['heritage', 'city_history', 'culture'] as ArticleKind[]).map(k =>
        <Pressable key={k} onPress={() => set('kind', k)} accessibilityRole="radio" accessibilityLabel={`${kindName(k)}. ${kindNote(k)}`} accessibilityState={{ checked: d.kind === k }} style={[s.kind, d.kind === k && s.kindOn]}>
          <Text style={[s.kindName, d.kind === k && { color: colors.goldSoft }]}>{kindName(k)}</Text>
          <Text style={[s.small, d.kind === k && { color: '#e6e2d8' }]}>{kindNote(k)}</Text>
        </Pressable>)}</View>

      <Field label={t('Başlık', 'Title')} count={`${d.title.length} / ${LIMITS.title[1]}`}>
        <TextInput value={d.title} onChangeText={v => set('title', v)} maxLength={LIMITS.title[1]} style={[s.input, s.titleInput]} placeholder={t('ör. Muradiye’de Bir Sabah', 'e.g. A Morning at Muradiye')} placeholderTextColor={colors.soft} accessibilityLabel={t('Başlık', 'Title')} />
      </Field>
      <Field label={t('Kısa özet (isteğe bağlı)', 'Short summary (optional)')} count={`${d.summary.length} / ${LIMITS.summary}`}>
        <TextInput value={d.summary} onChangeText={v => set('summary', v)} maxLength={LIMITS.summary} multiline style={[s.input, { minHeight: 64 }]} placeholderTextColor={colors.soft}
          placeholder={t('Listede başlığın altında görünecek bir iki cümle.', 'One or two sentences shown under the title in the list.')} accessibilityLabel={t('Kısa özet', 'Short summary')} />
      </Field>

      <View style={{ gap: 6 }}>
        <View style={s.bar}>
          <Text style={s.label}>{t('Metin', 'Text')}</Text>
          <Pressable onPress={() => setPreview(p => !p)} accessibilityRole="button" accessibilityLabel={preview ? t('Yaz', 'Write') : t('Önizle', 'Preview')} style={s.tool}><Ionicons name={preview ? 'create-outline' : 'eye-outline'} size={15} color={colors.goldText} /><Text style={s.toolText}>{preview ? t('Yaz', 'Write') : t('Önizle', 'Preview')}</Text></Pressable>
          {!preview && <><Pressable onPress={() => mark('## ')} accessibilityRole="button" accessibilityLabel={t('Ara başlık ekle', 'Add a subheading')} style={s.tool}><Text style={s.toolText}>{t('Ara başlık', 'Subheading')}</Text></Pressable>
            <Pressable onPress={() => mark('> ')} accessibilityRole="button" accessibilityLabel={t('Alıntı ekle', 'Add a quote')} style={s.tool}><Text style={s.toolText}>{t('Alıntı', 'Quote')}</Text></Pressable></>}
        </View>
        {preview ? <View style={s.preview}>{blocks.length ? blocks.map((b, i) => <Text key={i} style={b.type === 'h' ? s.h : b.type === 'q' ? s.quote : s.p}>{b.text}</Text>)
          : <Text style={s.small}>{t('Önizlenecek metin yok.', 'There is no text to preview.')}</Text>}</View>
          : <TextInput value={d.body} onChangeText={v => set('body', v)} multiline maxLength={LIMITS.body[1]} style={[s.input, s.bodyInput]} textAlignVertical="top"
            onSelectionChange={(e: TextInputSelectionChangeEvent) => setCaret(e.nativeEvent.selection.start)} placeholderTextColor={colors.soft}
            placeholder={t('Paragrafları boş bir satırla ayır. Ara başlık için satırın başına ## yaz. Bildiklerini kaynağıyla anlat.', 'Separate paragraphs with a blank line. Start a line with ## for a subheading. Tell what you know with its source.')}
            accessibilityLabel={t('Metin', 'Text')} />}
        <Text style={[s.small, chars < LIMITS.body[0] && { color: colors.danger }]}>{chars < LIMITS.body[0] ? t(`${LIMITS.body[0] - chars} karakter daha`, `${LIMITS.body[0] - chars} more characters`)
          : t(`${wordCount(d.body)} sözcük · ${readingMinutes(d.body)} dk okuma`, `${wordCount(d.body)} words · ${readingMinutes(d.body)} min read`)}</Text>
      </View>

      <View style={s.panel}>
        <Text style={s.panelHead}>{t('Kapak fotoğrafı', 'Cover photo')}</Text>
        {(cover || oldCover) && <View>
          <Image source={cover?.uri ?? oldCover} style={s.cover} contentFit="cover" accessibilityLabel={t('Kapak fotoğrafı', 'Cover photo')} />
          <Pressable onPress={() => { if (cover) setCover(null); else setDropCover(true); }} style={s.uncover} accessibilityRole="button" accessibilityLabel={t('Fotoğrafı kaldır', 'Remove the photo')}><Ionicons name="close" size={18} color="#fff" /></Pressable>
        </View>}
        <Button kind="plain" icon="image-outline" label={cover || oldCover ? t('Başka fotoğraf seç', 'Choose another photo') : t('Fotoğraf seç (isteğe bağlı)', 'Choose a photo (optional)')} onPress={chooseCover} />
        {(cover || oldCover) && <TextInput value={d.cover_alt} onChangeText={v => set('cover_alt', v)} maxLength={300} style={s.input} placeholder={t('Fotoğrafta ne var?', 'What is in the photo?')} placeholderTextColor={colors.soft} accessibilityLabel={t('Fotoğrafta ne var?', 'What is in the photo?')} />}
        <Text style={s.small}>{t('Kendi çektiğin bir fotoğraf olsun. Konum bilgisi kaydedilmeden silinir. Fotoğraf yoksa bağladığın eserin fotoğrafı kullanılır.', 'Use a photo you took yourself. Location data is removed before saving. Without one, the photo of a linked work is used.')}</Text>
      </View>

      <View style={s.panel}>
        <Text style={s.panelHead}>{t('Şehir ve eserler', 'City and works')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s }}>
          {[['', t('Belirli bir şehir değil', 'No particular city')] as [string, string], ...cities].map(([slug, name]) => <Pressable key={slug || 'none'} onPress={() => set('city', slug)} accessibilityLabel={name}
            accessibilityRole="radio" accessibilityState={{ checked: d.city === slug }} style={[s.chip, d.city === slug && s.chipOn]}><Text style={[s.chipText, d.city === slug && { color: colors.goldSoft }]}>{name}</Text></Pressable>)}
        </ScrollView>
        {d.monuments.map(slug => <View key={slug} style={s.picked}><Text style={[s.chipText, { flex: 1 }]}>{items.find(a => a.slug === slug)?.name ?? slug}</Text>
          <Pressable onPress={() => set('monuments', d.monuments.filter(x => x !== slug))} accessibilityRole="button" accessibilityLabel={t('Çıkar', 'Remove')} hitSlop={8}><Ionicons name="close" size={16} color={colors.soft} /></Pressable></View>)}
        <TextInput value={pick} onChangeText={setPick} style={s.input} placeholder={t('Yazıda geçen bir eserin adını yaz…', 'Type the name of a work in your article…')} placeholderTextColor={colors.soft} accessibilityLabel={t('Eser ara', 'Search a work')} />
        {matches.map(a => <Pressable key={a.slug} onPress={() => { set('monuments', [...d.monuments, a.slug].slice(0, 30)); setPick(''); }} style={s.match} accessibilityRole="button">
          <Text style={s.chipText}>{a.name}</Text><Text style={s.small}>{a.city.name}</Text></Pressable>)}
      </View>

      <View style={s.panel}>
        <Text style={s.panelHead}>{t('Yazarken', 'While writing')}</Text>
        {[t('Bildiğini anlat, uydurma: tarih ve ad verirken kaynağını yaz.', 'Tell what you know, do not invent: give the source for dates and names.'),
          t('Başkasına ait metni kopyalama; alıntıyı “>” ile belirt.', 'Do not copy someone else’s text; mark quotes with “>”.'),
          t('Kişisel bilgi (telefon, adres) paylaşma.', 'Do not share personal details (phone, address).'),
          t('Editörler yazını yayımlamadan önce düzeltebilir.', 'Editors may correct your article before publishing it.')].map(x => <Text key={x} style={s.small}>• {x}</Text>)}
        {!existing && <Text style={s.small}>{t('Taslağın bu telefonda kendiliğinden saklanır.', 'Your draft is kept on this phone automatically.')}</Text>}
      </View>

      {issues.length > 0 && <Notice tone="warn" icon="alert-circle-outline">{t('Göndermeden önce: ', 'Before sending: ')}{issues.join(' ')}</Notice>}
      <Button kind="gold" icon="send" label={existing ? t('Düzeltip yeniden gönder', 'Send it again') : t('Onaya gönder', 'Send for approval')} onPress={submit} busy={busy} />
      {!existing && (d.title || d.body) && <Button kind="plain" icon="trash-outline" label={t('Taslağı temizle', 'Clear the draft')} onPress={() => { setD(EMPTY_DRAFT); saveDraft(null); setCover(null); }} />}
    </ScrollView>
  </KeyboardAvoidingView>;
}

function Field({ label, count, children }: { label: string; count: string; children: ReactNode }) {
  return <View style={{ gap: 4 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={s.label}>{label}</Text><Text style={s.small}>{count}</Text></View>
    {children}
  </View>;
}

const s = StyleSheet.create({
  body: { color: colors.soft, fontSize: 15, lineHeight: 22 },
  small: { color: colors.soft, fontSize: 12, lineHeight: 17 },
  label: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  input: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.goldLine, backgroundColor: colors.paper, paddingHorizontal: 14, paddingVertical: 10, color: colors.ink, fontSize: 15 },
  titleInput: { fontFamily: serif, fontSize: 19 },
  bodyInput: { minHeight: 260, fontFamily: serif, fontSize: 16, lineHeight: 24 },
  kind: { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.goldLine, backgroundColor: colors.paper, gap: 2 },
  kindOn: { backgroundColor: colors.emerald, borderColor: colors.gold },
  kindName: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  tool: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: colors.goldLine },
  toolText: { color: colors.goldText, fontSize: 12, fontWeight: '600' },
  preview: { minHeight: 200, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper, gap: 10 },
  h: { fontFamily: serif, fontSize: 20, color: colors.ink },
  p: { fontFamily: serif, fontSize: 16, lineHeight: 25, color: colors.ink },
  quote: { fontFamily: serif, fontSize: 16, lineHeight: 25, color: colors.soft, fontStyle: 'italic', borderLeftWidth: 3, borderLeftColor: colors.gold, paddingLeft: 10 },
  panel: { padding: space.m, borderRadius: 14, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, gap: space.s },
  panelHead: { color: colors.ink, fontSize: 16, fontWeight: '600' },
  cover: { width: '100%', height: 170, borderRadius: 12, backgroundColor: colors.parchmentDeep },
  uncover: { position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: '#000000a0', alignItems: 'center', justifyContent: 'center' },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.goldLine },
  chipOn: { backgroundColor: colors.emerald },
  chipText: { color: colors.ink, fontSize: 13 },
  picked: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, backgroundColor: colors.parchmentDeep },
  match: { padding: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.line, gap: 2 },
  sentMark: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
});
