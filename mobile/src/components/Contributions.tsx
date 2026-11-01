// "Ziyaretçi katkıları" at the end of a work, as on the site (frontend/src/vakif/Contributions.tsx): approved photos and
// texts, apart from the book. A signed-in visitor can add one; it appears only after an administrator approves it. This is
// not the Hatıra Defteri above it: memories stay on the phone and nothing goes up unless it is sent from here.
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from './Typography';
import { Button, Eyebrow, Notice, Title } from './UI';
import { useAccount } from '@/lib/account';
import { track } from '@/lib/analytics';
import { mediaUrl } from '@/lib/api';
import { canSend, photoProblem, TEXT_MAX, TEXT_MIN, type ContributionKind, type TextKind } from '@/lib/contributionRules';
import { contributionsApi, type Contribution } from '@/lib/contributions';
import { t, useLang } from '@/lib/i18n';
import { pickBase64 } from '@/lib/photos';
import { colors, serif, space } from '@/lib/theme';

export function Contributions({ slug, name }: { slug: string; name: string }) {
  const account = useAccount();
  const { lang } = useLang();
  const [items, setItems] = useState<Contribution[]>([]);
  const [open, setOpen] = useState<ContributionKind | null>(null);
  const [textKind, setTextKind] = useState<TextKind>('memory');
  const [body, setBody] = useState('');
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);      // a second tap before the screen updates must not send it twice
  useEffect(() => {
    let live = true;
    contributionsApi.approved(slug).then(r => { if (live) setItems(r); }, () => {});
    return () => { live = false; };
  }, [slug]);

  function start(kind: ContributionKind) { setOpen(kind); setMessage(null); setError(null); }
  function cancel() { setOpen(null); setError(null); setBody(''); setPhoto(null); }

  async function choosePhoto() {
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { setError(t('Galeri izni verilmedi. Telefonunun ayarlarından izin verebilirsin.', 'Gallery access was not given. You can allow it in your phone’s settings.')); return; }
    const shot = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, exif: false, base64: pickBase64 });
    if (shot.canceled) return;
    const asset = shot.assets[0];
    const problem = photoProblem(asset);
    if (problem === 'too_big') { setError(t('Fotoğraf en çok 10 MB olabilir.', 'The photo can be up to 10 MB.')); return; }
    if (problem === 'wrong_type') { setError(t('Yalnızca JPEG, PNG ya da WebP yüklenebilir.', 'Only JPEG, PNG or WebP can be uploaded.')); return; }
    setPhoto(asset);
  }

  async function send() {
    if (!open || sending.current) return;
    sending.current = true; setBusy(true); setError(null);
    try {
      await contributionsApi.send(slug, { kind: open, textKind, body, photo });
      track('contribution', slug, { kind: open });
      setMessage(t('Teşekkürler! Katkın onay bekliyor; yönetici onaylayınca burada görünecek. Durumunu Hesabım’dan izleyebilirsin.', 'Thank you! Your contribution is awaiting review and will appear here once an administrator approves it. You can follow it in My account.'));
      setOpen(null); setBody(''); setPhoto(null);
    } catch (e) { setError(String((e as Error)?.message ?? e)); }
    finally { sending.current = false; setBusy(false); }
  }

  const when = (iso: string) => new Date(iso).toLocaleDateString(lang === 'en' ? 'en-GB' : 'tr-TR', { month: 'long', year: 'numeric' });
  const left = TEXT_MIN - body.trim().length;
  return <View style={{ gap: space.s + 2 }}>
    <Eyebrow>✦ {t('ZİYARETÇİ KATKILARI', 'VISITOR CONTRIBUTIONS')}</Eyebrow>
    <Title size={28}>{t('Bu eserle ilgili senin hikâyen', 'Your story about this work')}</Title>
    <Text style={s.note}>{t('Ziyaretçilerin eklediği fotoğraf ve anılar. Kitaptaki bilgiden ayrıdır, yönetici onayından geçer ve sohbet asistanının kaynağı değildir.', 'Photos and memories added by visitors. They are separate from the book’s information, are reviewed by an administrator and are not a source for the chat assistant.')}</Text>
    {items.map(c => <View key={c.id} style={s.item}>
      {!!c.image && <Image source={mediaUrl(c.image.thumb)} contentFit="cover" style={[s.photo, c.image.width && c.image.height ? { aspectRatio: c.image.width / c.image.height } : null]} accessibilityLabel={c.body ?? t(`${name}: ziyaretçi fotoğrafı`, `${name}: visitor photo`)} />}
      {c.kind === 'text' && !!c.text_kind_label && <Text style={s.kind}>{c.text_kind_label}</Text>}
      {!!c.body && <Text style={s.body}>{c.body}</Text>}
      <Text style={s.by}>— {c.author}, {when(c.created_at)}</Text>
    </View>)}
    {message && <Notice icon="checkmark-circle-outline">{message}</Notice>}
    {!account.user ? <Button kind="plain" icon="person-circle-outline" label={t('Giriş yap, bu esere katkı ekle', 'Sign in to add to this work')} onPress={() => router.push(`/giris?sonra=${encodeURIComponent(`/eser/${slug}`)}`)} />
      : !open ? <View style={s.row}>
        <Button style={{ flex: 1 }} kind="plain" icon="image-outline" label={t('Fotoğraf ekle', 'Add a photo')} onPress={() => start('photo')} />
        <Button style={{ flex: 1 }} kind="plain" icon="chatbox-ellipses-outline" label={t('Anı ya da bilgi', 'Memory or fact')} onPress={() => start('text')} />
      </View>
      : <View style={s.form}>
        {open === 'photo' ? <>
          <Button kind="plain" icon="images-outline" label={photo ? t('Başka fotoğraf seç', 'Choose another photo') : t('Galeriden fotoğraf seç', 'Choose from the gallery')} onPress={choosePhoto} />
          {!!photo && <Image source={photo.uri} contentFit="cover" style={s.preview} accessibilityLabel={t('Seçtiğin fotoğraf', 'The photo you chose')} />}
          <Text style={s.small}>{t('JPEG, PNG ya da WebP; en çok 10 MB. Konum ve cihaz bilgisi kaydetmeden önce silinir.', 'JPEG, PNG or WebP; up to 10 MB. Location and device details are removed before saving.')}</Text>
        </> : <>
          <Text style={s.label}>{t('Ne eklemek istiyorsun?', 'What would you like to add?')}</Text>
          <View style={s.chips} accessibilityRole="radiogroup">{([['memory', t('Bir anım var', 'I have a memory')], ['info', t('Bir bilgi eklemek istiyorum', 'I want to add a fact')], ['correction', t('Bir hata gördüm', 'I spotted a mistake')]] as [TextKind, string][]).map(([id, label]) =>
            <Pressable key={id} onPress={() => setTextKind(id)} accessibilityRole="radio" accessibilityState={{ checked: textKind === id }} aria-checked={textKind === id} style={[s.chip, textKind === id && s.chipOn]}>
              <Text style={[s.chipText, textKind === id && { color: colors.goldSoft }]}>{label}</Text></Pressable>)}</View>
        </>}
        <Text style={s.label}>{open === 'photo' ? t('Kısa açıklama (isteğe bağlı)', 'Short caption (optional)') : t(`Metin (en az ${TEXT_MIN} karakter)`, `Text (at least ${TEXT_MIN} characters)`)}</Text>
        <TextInput multiline maxLength={TEXT_MAX} value={body} onChangeText={setBody} style={[s.input, { minHeight: open === 'photo' ? 64 : 120 }]} textAlignVertical="top"
          accessibilityLabel={open === 'photo' ? t('Kısa açıklama', 'Short caption') : t('Metin', 'Text')} />
        {open === 'text' && left > 0 && <Text style={s.small}>{t(`${left} karakter daha`, `${left} more characters`)}</Text>}
        {error && <Notice tone="warn" icon="alert-circle-outline">{error}</Notice>}
        <View style={s.row}>
          <Button style={{ flex: 1 }} icon="send-outline" label={busy ? t('Gönderiliyor…', 'Sending…') : t('Gönder', 'Send')} busy={busy} disabled={!canSend(open, body, Boolean(photo))} onPress={send} />
          <Button style={{ flex: 1 }} kind="plain" label={t('Vazgeç', 'Cancel')} onPress={cancel} />
        </View>
      </View>}
    {!open && error && <Notice tone="warn" icon="alert-circle-outline">{error}</Notice>}
  </View>;
}

const s = StyleSheet.create({
  note: { color: colors.soft, fontSize: 14, lineHeight: 20 },
  item: { padding: space.m, borderRadius: 14, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, gap: 6 },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: 10, backgroundColor: colors.parchmentDeep },
  kind: { color: colors.goldText, fontSize: 11, letterSpacing: 1, fontWeight: '700' },
  body: { fontFamily: serif, fontSize: 18, lineHeight: 26, color: colors.ink },
  by: { color: colors.soft, fontSize: 12 },
  row: { flexDirection: 'row', gap: space.s },
  form: { padding: space.m, borderRadius: 14, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.goldLine, gap: space.s },
  preview: { width: '100%', height: 200, borderRadius: 10, backgroundColor: colors.parchmentDeep },
  small: { color: colors.soft, fontSize: 12, lineHeight: 17 },
  label: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.goldLine },
  chipOn: { backgroundColor: colors.emerald },
  chipText: { color: colors.ink, fontSize: 13 },
  input: { borderRadius: 12, borderWidth: 1, borderColor: colors.goldLine, backgroundColor: colors.parchment, padding: 12, color: colors.ink, fontSize: 15, lineHeight: 21 },
});
