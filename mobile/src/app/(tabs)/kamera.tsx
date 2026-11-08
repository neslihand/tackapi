// Kamera: a photo from the camera or the gallery is compared with the book's photos (POST /api/visual-search).
// The photo is not stored. When the match is not confident, the closest works are offered as "we are not sure".
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { Card } from '@/components/Card';
import { Text } from '@/components/Typography';
import { Button, ButtonRow, Eyebrow, Notice, Title } from '@/components/UI';
import { findByPhoto, mediaUrl, type VisualResult } from '@/lib/api';
import { t } from '@/lib/i18n';
import { useContent } from '@/lib/store';
import { colors, radius, serif, space, type } from '@/lib/theme';

export default function Camera() {
  const { bySlug } = useContent();
  const [photo, setPhoto] = useState<string | null>(null);
  const [result, setResult] = useState<VisualResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(source: 'camera' | 'library') {
    setError(null);
    const permission = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { setError(t('İzin verilmedi. Ayarlardan izin verebilirsin.', 'Permission was not given. You can allow it in Settings.')); return; }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7, exif: false };
    const shot = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (shot.canceled || !shot.assets[0]) return;
    const asset = shot.assets[0];
    setPhoto(asset.uri); setResult(null); setBusy(true);
    try { setResult(await findByPhoto(asset.uri, asset.mimeType ?? 'image/jpeg')); }
    catch (e) { setError(String((e as Error)?.message ?? e)); }
    finally { setBusy(false); }
  }

  // a confident match outside the pilot list still opens; its name comes from the candidates
  const found = result?.confident && result.match ? result.match : null;
  const item = found ? bySlug(found) : undefined;
  const match = found ? { slug: found, name: item?.name ?? result?.candidates.find(c => c.slug === found)?.name ?? found,
    district: item?.district ?? null, city: { name: item?.city.name ?? '' } } : undefined;
  return <ScrollView contentContainerStyle={{ padding: space.m, gap: space.m, paddingBottom: space.xl }}>
    <Eyebrow>✦ {t('KAMERA İLE KEŞFET', 'DISCOVER WITH THE CAMERA')}</Eyebrow>
    <Title>{t('Önündeki yapı hangi eser?', 'Which work is in front of you?')}</Title>
    <Text style={s.body}>{t('Yapının fotoğrafını çek; envanter kitabındaki fotoğraflarla karşılaştırıp hangi eser olduğunu bulmaya çalışırız.', 'Take a photo of the building; we compare it with the photos in the inventory book and try to find which work it is.')}</Text>
    <ButtonRow>
      <Button fit icon="camera" label={t('Fotoğraf çek', 'Take a photo')} onPress={() => pick('camera')} busy={busy} />
      <Button fit kind="plain" icon="images-outline" label={t('Galeriden', 'From gallery')} onPress={() => pick('library')} disabled={busy} />
    </ButtonRow>
    <Notice icon="lock-closed-outline">{t('Fotoğrafın yalnızca karşılaştırma için gönderilir ve saklanmaz.', 'Your photo is sent only for the comparison and is not stored.')}</Notice>
    {photo && <Image source={photo} style={s.preview} contentFit="cover" accessibilityLabel={t('Çektiğin fotoğraf', 'Your photo')} />}
    {error && <Notice tone="warn" icon="alert-circle-outline">{error}</Notice>}
    {result && (match ? <Card style={s.result}>
      <Eyebrow>{t('BULDUK', 'FOUND IT')}</Eyebrow>
      <Text style={s.name}>{match.name}</Text>
      <Text style={s.body}>{[match.district, match.city.name].filter(Boolean).join(', ')}</Text>
      <Button label={t('Hikâyesini aç', 'Open its story')} icon="arrow-forward" onPress={() => router.push(`/eser/${match.slug}`)} />
    </Card> : <Card style={s.result}>
      <Eyebrow>{t('EMİN DEĞİLİZ', 'WE ARE NOT SURE')}</Eyebrow>
      <Text style={s.body}>{result.candidates.length ? t('Fotoğraf şu eserlere benziyor. Hangisi olduğuna sen karar ver:', 'The photo looks like these works. You decide which one it is:') : t('Benzeyen bir eser bulamadık. Başka bir açıdan dene.', 'We found no similar work. Try another angle.')}</Text>
      {result.candidates.map(c => <Pressable key={c.slug} onPress={() => router.push(`/eser/${c.slug}`)} style={s.candidate} accessibilityRole="button" accessibilityLabel={c.name}>
        <Image source={mediaUrl(c.photo)} alt="" style={s.thumb} contentFit="cover" accessibilityIgnoresInvertColors />
        <Text style={[s.body, { flex: 1, color: colors.ink }]}>{c.name}</Text>
      </Pressable>)}
    </Card>)}
  </ScrollView>;
}

const s = StyleSheet.create({
  body: { color: colors.soft, ...type.body },
  preview: { width: '100%', height: 240, borderRadius: radius.l, borderWidth: 2, borderColor: colors.gold },
  result: { gap: space.s },
  name: { fontFamily: serif, color: colors.ink, ...type.title },
  candidate: { flexDirection: 'row', alignItems: 'center', gap: space.s + space.xs, padding: space.s, borderRadius: radius.m, borderWidth: 1, borderColor: colors.line },
  thumb: { width: 64, height: 64, borderRadius: radius.s, backgroundColor: colors.parchmentDeep },
});
