// Hatıra Defteri parts: a memory card (photo, note, date; removed with a second tap) and the sheet that adds one.
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import type { ImagePickerAsset } from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Notice } from './UI';
import { t } from '@/lib/i18n';
import { NOTE_MAX, pickPhoto, useJournal, type Memory } from '@/lib/journal';
import { colors, overlay, serif, space } from '@/lib/theme';

export function MemoryCard({ m, workName }: { m: Memory; workName?: string }) {
  const { remove } = useJournal();
  const [confirm, setConfirm] = useState(false);
  const date = new Date(m.date).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  return <View style={s.card}>
    {m.photo && <Image source={m.photo} style={s.photo} contentFit="cover" accessibilityLabel={t('Hatıra fotoğrafın', 'Your memory photo')} />}
    <View style={s.cardBody}>
      {workName && <Pressable onPress={() => router.push(`/eser/${m.slug}`)} accessibilityRole="button"><Text style={s.work}>{workName}</Text></Pressable>}
      <Text style={s.date}>{date}{m.onSpot ? ` · ${t('yerinde', 'on the spot')}` : ''}</Text>
      {!!m.note && <Text style={s.note}>{m.note}</Text>}
      <Pressable onPress={() => { if (confirm) remove(m.id); else setConfirm(true); }} onBlur={() => setConfirm(false)} style={s.remove} accessibilityRole="button" hitSlop={8}
        accessibilityLabel={confirm ? t('Hatırayı silmek için yeniden dokun', 'Tap again to delete the memory') : t('Hatırayı sil', 'Delete the memory')}>
        <Ionicons name="trash-outline" size={15} color={confirm ? colors.danger : colors.soft} />
        <Text style={[s.removeText, confirm && { color: colors.danger, fontWeight: '700' }]}>{confirm ? t('Silmek için yeniden dokun', 'Tap again to delete') : t('Sil', 'Delete')}</Text>
      </Pressable>
    </View>
  </View>;
}

export function AddMemory({ slug, name, onSpot, visible, onClose }: { slug: string; name: string; onSpot: boolean; visible: boolean; onClose: () => void }) {
  const { add } = useJournal();
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<ImagePickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => { setNote(''); setPhoto(null); setError(null); onClose(); };

  async function choose(source: 'camera' | 'library') {
    setError(null);
    try { const p = await pickPhoto(source); if (p) setPhoto(p); }
    catch (e) { setError(String((e as Error)?.message ?? e)); }
  }
  async function save() {
    if (!note.trim() && !photo) { setError(t('Bir not yaz ya da fotoğraf ekle.', 'Write a note or add a photo.')); return; }
    setBusy(true);
    try { await add({ slug, note, photo, onSpot }); close(); }
    catch (e) { setError(String((e as Error)?.message ?? e)); }
    finally { setBusy(false); }
  }

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
    <KeyboardAvoidingView style={s.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.sheet}>
        <View style={s.head}>
          <Text style={s.title}>{t('Hatıra ekle', 'Add a memory')}</Text>
          <Pressable onPress={close} accessibilityRole="button" accessibilityLabel={t('Kapat', 'Close')} hitSlop={10}><Ionicons name="close" size={22} color={colors.ink} /></Pressable>
        </View>
        <Text style={s.date}>{name}{onSpot ? ` · ${t('yerinde mühürlü', 'stamped on the spot')}` : ''}</Text>
        {photo ? <View>
          <Image source={photo.uri} style={s.preview} contentFit="cover" accessibilityLabel={t('Seçtiğin fotoğraf', 'The photo you chose')} />
          <Pressable onPress={() => setPhoto(null)} style={s.unphoto} accessibilityRole="button" accessibilityLabel={t('Fotoğrafı çıkar', 'Remove the photo')}><Ionicons name="close" size={18} color="#fff" /></Pressable>
        </View> : <View style={{ flexDirection: 'row', gap: space.s }}>
          <Button style={{ flex: 1 }} kind="plain" icon="camera-outline" label={t('Fotoğraf çek', 'Take a photo')} onPress={() => choose('camera')} />
          <Button style={{ flex: 1 }} kind="plain" icon="images-outline" label={t('Galeriden', 'From gallery')} onPress={() => choose('library')} />
        </View>}
        <TextInput value={note} onChangeText={setNote} placeholder={t('Bugün burada ne gördün, ne hissettin?', 'What did you see and feel here today?')} placeholderTextColor={colors.soft}
          multiline maxLength={NOTE_MAX} style={s.input} accessibilityLabel={t('Hatıra notu', 'Memory note')} />
        <Text style={s.small}>{t('Hatıraların yalnızca bu telefonda kalır; hesabına ya da sunucuya gönderilmez.', 'Your memories stay on this phone only; they are not sent to your account or the server.')}</Text>
        {error && <Notice tone="warn" icon="alert-circle-outline">{error}</Notice>}
        <Button kind="gold" icon="bookmark" label={t('Deftere ekle', 'Add to the book')} onPress={save} busy={busy} />
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.paper, borderRadius: 14, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  photo: { width: '100%', height: 200, backgroundColor: colors.parchmentDeep },
  cardBody: { padding: 12, gap: 4 },
  work: { fontFamily: serif, fontSize: 17, color: colors.ink },
  date: { color: colors.goldText, fontSize: 12, fontWeight: '600' },
  note: { fontFamily: serif, color: colors.ink, fontSize: 16, lineHeight: 24 },
  remove: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-end', paddingTop: 4 },
  removeText: { color: colors.soft, fontSize: 12 },
  backdrop: { flex: 1, backgroundColor: overlay.backdrop, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.parchment, padding: space.l, gap: space.s + 2, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: 2, borderColor: colors.gold },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: serif, fontSize: 22, color: colors.ink },
  preview: { width: '100%', height: 180, borderRadius: 12, backgroundColor: colors.parchmentDeep },
  unphoto: { position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: '#000000a0', alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 100, maxHeight: 180, borderRadius: 12, borderWidth: 1, borderColor: colors.goldLine, backgroundColor: colors.paper, padding: 12, color: colors.ink, fontSize: 15, textAlignVertical: 'top' },
  small: { color: colors.soft, fontSize: 12, lineHeight: 17 },
});
