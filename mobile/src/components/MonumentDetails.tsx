import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from './Typography';
import { Button, Eyebrow, Notice, SectionHeading } from './UI';
import { HeritageMap } from './HeritageMap';
import { mediaUrl, type Detail, type Image as Photo } from '@/lib/api';
import { t, useLang } from '@/lib/i18n';
import { artworkLabel, eventLabel, roleLabel } from '@/lib/monumentLabels';
import { colors, serif } from '@/lib/theme';

export function PhotoGallery({ images, title }: { images: Photo[]; title: string }) {
  const [index, setIndex] = useState<number | null>(null);
  if (!images.length) return null;
  const photo = index === null ? null : images[index];
  return <View style={{ gap: 12 }}>
    <Eyebrow>{title}</Eyebrow>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>{images.map((img, n) =>
      <Pressable key={`${img.src}:${n}`} onPress={() => setIndex(n)} accessibilityRole="button" accessibilityLabel={t(`Fotoğrafı aç: ${img.alt || title}, ${n + 1}/${images.length}`, `Open photo: ${img.alt || title}, ${n + 1}/${images.length}`)}>
        <Image source={mediaUrl(img.thumb || img.src)} style={{ width: 236, height: 178, backgroundColor: colors.parchmentDeep }} contentFit="cover" alt="" />
      </Pressable>)}</ScrollView>
    <Modal visible={photo !== null} animationType="fade" onRequestClose={() => setIndex(null)}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.emeraldDeep }} accessibilityViewIsModal>
        <View style={{ padding: 16 }}><Button kind="gold" label={t('Fotoğrafı kapat', 'Close photo')} icon="close" onPress={() => setIndex(null)} /></View>
        {photo && <><Image source={mediaUrl(photo.src)} accessibilityLabel={photo.alt || title} style={{ flex: 1 }} contentFit="contain" />
          <ScrollView style={{ maxHeight: '30%' }} contentContainerStyle={{ padding: 20, gap: 8 }}>
            <Text style={{ color: colors.ivory }}>{photo.caption || photo.alt || title}</Text>
            {photo.source && <Text style={{ color: colors.goldSoft }}>{photo.source.book}{photo.source.page ? `, ${t('s.', 'p.')} ${photo.source.page}` : ''}</Text>}
            <Text accessibilityLiveRegion="polite" style={{ color: colors.mist }}>{index! + 1} / {images.length}</Text>
          </ScrollView>
          <View style={{ flexDirection: 'row', padding: 16, gap: 12 }}>
            <Button style={{ flex: 1 }} kind="gold" label={t('Önceki', 'Previous')} disabled={index === 0} onPress={() => setIndex(i => Math.max(0, (i ?? 0) - 1))} />
            <Button style={{ flex: 1 }} kind="gold" label={t('Sonraki', 'Next')} disabled={index === images.length - 1} onPress={() => setIndex(i => Math.min(images.length - 1, (i ?? 0) + 1))} />
          </View></>}
      </SafeAreaView>
    </Modal>
  </View>;
}

function range(value: string | null) {
  const m = value?.match(/^\[(-?\d+),(-?\d+)\)$/);
  return m ? Number(m[1]) === Number(m[2]) - 1 ? m[1] : `${m[1]}–${Number(m[2]) - 1}` : value;
}

export function MonumentDetails({ detail, name, slug }: { detail: Detail; name: string; slug: string }) {
  const { lang } = useLang();
  const c = detail.card;
  const loc = detail.location;
  return <View style={{ gap: 32 }}>
    {!!c?.persons?.length && <View style={s.section}><SectionHeading title={t('Eserin ardındaki insanlar', 'The people behind the work')} />
      {c.persons.map((p, i) => <View key={i} style={s.row}><Eyebrow>{roleLabel(p.role, lang) || t('Kişi', 'Person')}</Eyebrow><Text style={s.name}>{p.name}</Text>{p.detail && <Text style={s.body}>{p.detail}</Text>}</View>)}
    </View>}
    {!!c?.events?.length && <View style={s.section}><SectionHeading title={t('Tarihçe', 'History')} />
      {c.events.map((e, i) => <View key={i} style={s.timeline}><Text style={s.date}>{e.date_text || range(e.years) || '—'}</Text><Eyebrow>{eventLabel(e.kind, lang)}</Eyebrow>
        <Text style={s.body}>{e.description_tr}{e.person ? ` — ${e.person}` : ''}</Text>{e.date_text_hijri && <Text style={s.body}>H. {e.date_text_hijri}</Text>}
        {e.page_start && <Text style={s.source}>{t('Kaynak sayfa', 'Source page')}: {e.page_start}</Text>}</View>)}
    </View>}
    {!!c?.artworks?.length && <View style={s.section}><SectionHeading title={t('Süsleme ve sanat', 'Decoration and art')} />
      {c.artworks.map((a, i) => <View key={i} style={s.row}><Text style={s.name}>{[a.element, a.technique].filter(Boolean).join(' · ') || artworkLabel(a.kind, lang)}</Text>
        <Text style={s.body}>{[a.script, a.artist, a.date_text].filter(Boolean).join(' · ')}</Text>{a.text_translation_tr && <Text style={s.body}>{a.text_translation_tr}</Text>}
        <PhotoGallery images={a.images ?? []} title={artworkLabel(a.kind, lang)} />
        {a.page_start && <Text style={s.source}>{t('Kaynak sayfa', 'Source page')}: {a.page_start}</Text>}
      </View>)}
    </View>}
    {(c?.parent || !!c?.children?.length) && <View style={s.section}><SectionHeading title={t('Bir bütünün parçaları', 'Parts of a whole')} />
      {c.parent && <><Eyebrow>{t('BAĞLI OLDUĞU YAPI', 'PART OF')}</Eyebrow><Text style={s.name}>{c.parent}</Text>{c.parent_slug && <Button kind="plain" label={t('Yapıyı keşfet', 'Explore the work')} onPress={() => router.push(`/eser/${c.parent_slug}`)} />}</>}
      {c.children?.map((child, i) => <Text key={i} style={s.name}>{child.name_tr}</Text>)}
    </View>}
    {loc && <View style={s.section}><SectionHeading title={t('Haritada', 'On the map')} />
      <View style={{ height: 260 }}><HeritageMap here={null} selected={slug} onSelect={() => {}} pins={[{ slug, name, ...loc, radius: loc.radius_m, state: 'open' }]} /></View>
      {loc.approximate && <Notice>{t('Yaklaşık konum: yapı işaretli alanın içinde olabilir; henüz doğrulanmadı.', 'Approximate location: the work may be within this area; it has not been verified.')}</Notice>}
      <Button kind="plain" icon="map-outline" label={t('Miras Haritasında aç', 'Open in Heritage Map')} onPress={() => router.navigate(`/kesfet?eser=${encodeURIComponent(slug)}`)} />
    </View>}
    {c?.current_state && <View style={s.section}><SectionHeading title={t('Bugünkü durumu', 'Current state')} /><Text style={s.body}>{c.current_state}</Text></View>}
  </View>;
}
const s = StyleSheet.create({ section: { gap: 12 }, row: { gap: 8, paddingBottom: 20, borderBottomWidth: 1, borderColor: colors.line },
  name: { fontFamily: serif, color: colors.ink, fontSize: 24 }, body: { color: colors.soft, fontSize: 16, lineHeight: 25 },
  timeline: { paddingLeft: 20, borderLeftWidth: 1, borderColor: colors.goldLine, gap: 8, paddingBottom: 24 },
  date: { fontFamily: serif, color: colors.goldText, fontSize: 28 }, source: { color: colors.soft, fontSize: 12 } });
