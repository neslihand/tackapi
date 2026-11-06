// The two prepared tellings of a work, drawn as on the site (frontend/src/components/StoryScenes.tsx):
//   StoryReader — "Hikâye": one calm serif column on night green, the work's building drawn faintly behind the title,
//                 gold dust, a diamond rule and ✦ between paragraphs, a gold italic first letter;
//   TaleBook    — "Çocuk": a picture book on a dawn sky: a cover with the building in an arched window, Hüdhüd the
//                 hoopoe who talks when tapped, white pages with a page number and a sticker, a star for every page read.
// Only the stored text is shown; the drawings are decorative and never stand for the actual building.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Motif } from '@/components/brand/motifs';
import { t } from '@/lib/i18n';
import { buildingFor } from '@/lib/motifs';
import { colors, fonts, hit, radius, reader, serif, space, tale } from '@/lib/theme';

type Work = { name: string; kind?: string | null; kind_label?: string | null; meta: string[] };
const hidden = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const, pointerEvents: 'none' as const };

/** Paragraphs of a stored text: blank lines (or single breaks) part them. */
export const paragraphsOf = (text: string) => text.split(/\n{2,}|\n/).map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean);

// Specks of gold dust in the night: [x %, y %, size px].
const MOTES: [number, number, number][] = Array.from({ length: 16 }, (_, i) => {
  const r = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
  return [Math.round(r(1) * 100), Math.round(r(2) * 100), 1.5 + Math.round(r(3) * 20) / 10];
});

export function StoryReader({ work, text, onLayout }: { work: Work; text: string; onLayout?: (e: LayoutChangeEvent) => void }) {
  const parts = paragraphsOf(text);
  return <View style={r.panel} onLayout={onLayout}>
    <View style={StyleSheet.absoluteFill} {...hidden}>
      <Svg width="100%" height="100%">
        <Defs><RadialGradient id="srglow" cx="0.5" cy="0.06" r="0.6"><Stop offset="0" stopColor={reader.gold} stopOpacity={0.22} /><Stop offset="1" stopColor={reader.gold} stopOpacity={0} /></RadialGradient></Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#srglow)" />
        {MOTES.map(([x, y, size], i) => <Circle key={i} cx={`${x}%`} cy={`${y}%`} r={size} fill={reader.mote} opacity={i % 3 ? 0.25 : 0.55} />)}
      </Svg>
    </View>
    <View style={r.head}>
      <View style={r.motif} {...hidden}>
        <Svg width={190} height={190} viewBox="0 0 200 200" style={StyleSheet.absoluteFill}>
          <Circle cx={100} cy={100} r={96} fill="none" stroke={reader.gold} strokeWidth={0.8} strokeDasharray="1.5 7" strokeLinecap="round" opacity={0.5} />
          <Circle cx={100} cy={100} r={84} fill="none" stroke={reader.gold} strokeWidth={0.8} opacity={0.35} />
        </Svg>
        <Motif id={buildingFor(work)} color={reader.gold} width={118} height={142} />
      </View>
      <Text style={r.kicker}>{t('HİKÂYELEŞTİREREK', 'AS A STORY')}</Text>
      <Text style={r.title} accessibilityRole="header">{work.name}</Text>
      {!!work.meta.length && <Text style={r.meta}>{work.meta.join(' · ')}</Text>}
      <View style={r.rule} {...hidden}><View style={r.ruleLine} /><View style={r.diamond} /><View style={r.ruleLine} /></View>
    </View>
    {parts.map((p, i) => <View key={i}>
      {i > 0 && <Text style={r.star} {...hidden}>✦</Text>}
      {i === 0 ? <Text style={r.text}><Text style={r.initial}>{Array.from(p)[0]}</Text>{Array.from(p).slice(1).join('')}</Text>
        : <Text style={r.text}>{p}</Text>}
    </View>)}
  </View>;
}

// ——— Çocuk: the picture book ———

/** An ellipse turned by `deg` degrees around (ox, oy), as a path (SVG transforms leak an invalid attribute on the web). */
function turnedEllipse(cx: number, cy: number, rx: number, ry: number, deg: number, ox: number, oy: number) {
  const a = deg * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
  const pts = Array.from({ length: 24 }, (_, i) => {
    const u = i / 24 * Math.PI * 2, x = cx + rx * Math.cos(u) - ox, y = cy + ry * Math.sin(u) - oy;
    return `${(ox + x * cos - y * sin).toFixed(2)} ${(oy + x * sin + y * cos).toFixed(2)}`;
  });
  return `M${pts.join(' L')} Z`;
}


/** Hüdhüd the hoopoe, the guide of the children's pages (the site's drawing). */
export function Hoopoe({ size = 96 }: { size?: number }) {
  const b = tale.bird;
  return <Svg width={size} height={size * 120 / 130} viewBox="0 0 130 120">
    {[-52, -30, -8, 14, 36].map((a, i) => <G key={a}>
      <Path d={turnedEllipse(84, 22 + (i % 2) * 2, 6, 16, a, 84, 46)} fill={b.head} /><Path d={turnedEllipse(84, 9 + (i % 2) * 2, 4.6, 5, a, 84, 46)} fill={b.dark} />
    </G>)}
    <Path d="M30 78 6 92 12 74 4 64 32 68Z" fill={b.dark} />
    <Ellipse cx={58} cy={76} rx={32} ry={25} fill={b.body} />
    <Path d="M30 70Q52 58 76 74 64 98 36 92 26 84 30 70Z" fill={b.dark} />
    {[0, 1, 2].map(i => <Path key={i} d={`M${36 + i * 11} ${70 + i * 2}q6 6 2 16`} fill="none" stroke={b.stripe} strokeWidth={4} strokeLinecap="round" />)}
    <Circle cx={86} cy={54} r={17} fill={b.head} />
    <Circle cx={80} cy={60} r={4.5} fill={b.cheek} opacity={0.55} />
    <Circle cx={90} cy={51} r={5.2} fill={b.eye} /><Circle cx={91} cy={51.5} r={3} fill={b.pupil} /><Circle cx={92} cy={50} r={1} fill={b.eye} />
    <Path d="M101 56Q114 60 124 70" fill="none" stroke={b.beak} strokeWidth={3.2} strokeLinecap="round" />
    <Path d="M52 99V110M64 99V110M48 110H57M60 110H69" stroke={b.legs} strokeWidth={3} strokeLinecap="round" />
  </Svg>;
}

/** A soft white cloud. */
function Cloud({ style, scale = 1 }: { style: object; scale?: number }) {
  return <View style={[{ position: 'absolute', transform: [{ scale }] }, style]} {...hidden}>
    <View style={[c.puff, { width: 120, height: 36, top: 14 }]} />
    <View style={[c.puff, { width: 54, height: 44, left: 22, top: 0 }]} />
    <View style={[c.puff, { width: 44, height: 34, left: 62, top: 6 }]} />
  </View>;
}

// The stickers on the pages: an eight-point star, a rosette, a tulip and a crescent with its star, in the four inks.
const STICKER_INKS = [tale.turquoise, tale.terracotta, tale.sunInk, tale.emerald];
function Sticker({ k }: { k: number }) {
  const ink = STICKER_INKS[k % STICKER_INKS.length];
  const shape = k % 4;
  return <View style={[c.sticker, { borderColor: ink }, { right: k % 2 ? space.l : space.xl + space.l }]} {...hidden}>
    <Svg width={40} height={40} viewBox="0 0 40 40" fill="none" stroke={ink} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round">
      {shape === 0 && <><Rect x={9} y={9} width={22} height={22} /><Polygon points="20,4.4 35.6,20 20,35.6 4.4,20" /><Circle cx={20} cy={20} r={4} /></>}
      {shape === 1 && <>{[0, 60, 120, 180, 240, 300].map(a => <Path key={a} d={turnedEllipse(20, 10, 5, 9, a, 20, 20)} />)}<Circle cx={20} cy={20} r={3.5} fill={ink} /></>}
      {shape === 2 && <><Path d="M20 34 V20" /><Path d="M20 22 C10 20 9 9 13 6 C15 11 18 12 20 13 C22 12 25 11 27 6 C31 9 30 20 20 22 Z" /><Path d="M20 30 C15 29 12 26 11 23 M20 30 C25 29 28 26 29 23" /></>}
      {shape === 3 && <><Path d="M24 8 A13 13 0 1 0 24 32 A10 10 0 1 1 24 8 Z" /><Polygon points="30,15 31.5,19 35.5,19 32.3,21.5 33.5,25.5 30,23 26.5,25.5 27.7,21.5 24.5,19 28.5,19" /></>}
    </Svg>
  </View>;
}

const guideLines = () => [
  t('Merhaba! Ben Hüdhüd. Bu yapının masalını birlikte okuyalım mı?', 'Hello! I am Hüdhüd the hoopoe. Shall we read this building’s tale together?'),
  t('Her sayfayı okudukça bir yıldız kazanıyorsun. Hepsini toplayabilir misin?', 'You win a star for every page you read. Can you collect them all?'),
  t('Kapaktaki çizime bak: kaç kubbe, kaç pencere sayabilirsin?', 'Look at the drawing on the cover: how many domes and windows can you count?'),
  t('Harika! Eski yapıları korumak hepimizin görevi.', 'Wonderful! Looking after old buildings is a job for all of us.'),
];

/** `seen`: how far down the pages the reader has scrolled, in points from the top of the book; a page whose middle has
 *  come into view earns its star. */
export function TaleBook({ work, text, seen, onLayout }: { work: Work; text: string; seen: number; onLayout?: (e: LayoutChangeEvent) => void }) {
  const parts = paragraphsOf(text);
  const [talking, setTalking] = useState(false);
  const [tips, setTips] = useState(0);
  const [mids, setMids] = useState<Record<number, number>>({});
  const [pagesTop, setPagesTop] = useState(0);
  const read = parts.filter((_, k) => mids[k] !== undefined && seen >= pagesTop + mids[k]).length;
  const done = parts.length > 0 && read >= parts.length;
  const line = guideLines()[done ? 3 : tips % 3];
  const talk = () => { if (talking) setTips(n => n + 1); setTalking(true); };
  return <View style={c.book} onLayout={onLayout}>
    <View style={StyleSheet.absoluteFill} {...hidden}>
      <Svg width="100%" height="100%">
        <Defs><LinearGradient id="krsky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={tale.skyTop} /><Stop offset="0.3" stopColor={tale.skyMid} /><Stop offset="1" stopColor={tale.skyBottom} />
        </LinearGradient></Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#krsky)" />
      </Svg>
    </View>
    <Cloud style={{ top: 8, left: -10 }} /><Cloud style={{ top: 160, right: -30 }} scale={0.75} /><Cloud style={{ top: '55%', left: -30 }} scale={0.7} />

    {/* the cover: the building in a dawn window */}
    <View style={c.cover}>
      <View style={c.window} {...hidden}>
        <Svg width="100%" height="100%" viewBox="0 0 200 220" preserveAspectRatio="xMidYMid slice" style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="krdawn" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={tale.windowTop} /><Stop offset="0.7" stopColor={tale.windowBottom} /></LinearGradient>
            <RadialGradient id="krsun" cx="0.5" cy="0.5" r="0.5"><Stop offset="0" stopColor={tale.sunCore} /><Stop offset="0.6" stopColor={tale.sun} /><Stop offset="1" stopColor={tale.sun} stopOpacity={0} /></RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="200" height="220" fill="url(#krdawn)" />
          <Circle cx={100} cy={58} r={40} fill="url(#krsun)" />
          <Ellipse cx={80} cy={232} rx={150} ry={60} fill={tale.hillBack} />
          <Ellipse cx={160} cy={240} rx={110} ry={50} fill={tale.hillFront} />
        </Svg>
        <View style={c.building}><Motif id={buildingFor(work)} color={tale.ink} width={150} height={180} /></View>
      </View>
      <Text style={c.chip}>{t('ÇOCUKLAR İÇİN', 'FOR CHILDREN')}</Text>
      <Text style={c.title} accessibilityRole="header">{work.name}</Text>
      <Text style={c.sub}>{[work.meta[0], t(`${parts.length} sayfalık bir masal`, `a tale in ${parts.length} pages`)].filter(Boolean).join(' · ')}</Text>
    </View>

    {/* Hüdhüd and the stars, then the pages */}
    <View style={c.guideRow}>
      <Pressable onPress={talk} accessibilityRole="button" accessibilityLabel={t('Rehber kuş Hüdhüd ile konuş', 'Talk to Hüdhüd, the guide bird')}
        accessibilityState={{ expanded: talking }} style={({ pressed }) => [c.guide, pressed && { transform: [{ scale: 0.95 }] }]}>
        <Hoopoe size={88} />
      </Pressable>
      <View style={{ flex: 1, gap: space.s }}>
        <View style={c.bubble} accessibilityLiveRegion="polite">
          <Text style={c.bubbleText}>{talking ? line : t('Bana dokun, sana bir şey söyleyeyim!', 'Tap me and I will tell you something!')}</Text>
        </View>
        <View style={c.stars} accessible accessibilityLabel={t(`Okunan sayfa: ${read} / ${parts.length}`, `Pages read: ${read} of ${parts.length}`)}>
          {parts.map((_, k) => <Text key={k} style={[c.star, k < read && c.starOn]}>★</Text>)}
        </View>
      </View>
    </View>

    <View style={c.pages} onLayout={e => setPagesTop(e.nativeEvent.layout.y)}>
      {parts.map((p, k) => {
        const isRead = mids[k] !== undefined && seen >= pagesTop + mids[k];
        return <View key={k} style={[c.page, isRead && c.pageRead, { transform: [{ rotate: k % 2 ? '0.4deg' : '-0.4deg' }] }]}
          onLayout={e => { const { y, height } = e.nativeEvent.layout; setMids(m => m[k] === y + height / 2 ? m : { ...m, [k]: y + height / 2 }); }}>
          <Text style={c.pageNo}>{t(`Sayfa ${k + 1} / ${parts.length}`, `Page ${k + 1} / ${parts.length}`)}{isRead ? ' ★' : ''}</Text>
          <Sticker k={k} />
          <Text style={c.pageText}>{p}</Text>
        </View>;
      })}
    </View>

    {done && <View style={c.finish} accessibilityLiveRegion="polite">
      <View style={c.medal}><Text style={c.medalStar}>★</Text></View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={c.finishTitle}>{t('Masalın sonuna geldin!', 'You reached the end of the tale!')}</Text>
        <Text style={c.finishText}>{t(`${read} yıldız topladın. Şimdi bu yapının yapbozunu çözebilir ya da bilgi yarışmasında kendini deneyebilirsin.`, `You collected ${read} stars. Now you can solve this building’s puzzle or try the quiz.`)}</Text>
      </View>
    </View>}
  </View>;
}

const r = StyleSheet.create({
  panel: { overflow: 'hidden', backgroundColor: colors.emerald, paddingHorizontal: space.l, paddingTop: space.l, paddingBottom: space.xl },
  head: { alignItems: 'center', paddingBottom: space.l },
  motif: { width: 190, height: 190, alignItems: 'center', justifyContent: 'center', marginBottom: space.s, opacity: 0.85 },
  kicker: { color: reader.gold, fontFamily: fonts.sansSemi, fontSize: 11, letterSpacing: 2.6 },
  title: { fontFamily: serif, color: reader.head, textAlign: 'center', fontSize: 34, lineHeight: 38, marginTop: space.s },
  meta: { color: reader.meta, textAlign: 'center', fontSize: 13, lineHeight: 18, marginTop: space.s, letterSpacing: 0.4 },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: space.l },
  ruleLine: { width: 64, height: 1, backgroundColor: reader.gold, opacity: 0.6 },
  diamond: { width: 7, height: 7, borderWidth: 1, borderColor: reader.gold, transform: [{ rotate: '45deg' }] },
  star: { color: reader.gold, opacity: 0.6, textAlign: 'center', fontSize: 11, marginVertical: space.m },
  text: { fontFamily: serif, color: reader.text, fontSize: 19, lineHeight: 34, fontVariant: ['lining-nums'] },
  initial: { fontFamily: fonts.serifItalic, color: colors.goldSoft, fontSize: 60, lineHeight: 60 },
});

const c = StyleSheet.create({
  book: { overflow: 'hidden', paddingHorizontal: space.gutter, paddingTop: space.l, paddingBottom: space.xl, gap: space.l },
  puff: { position: 'absolute', borderRadius: radius.pill, backgroundColor: tale.page, opacity: 0.9 },
  cover: { alignItems: 'center', gap: space.s },
  window: { width: 230, height: 253, overflow: 'hidden', borderWidth: 6, borderColor: tale.page, borderTopLeftRadius: 115, borderTopRightRadius: 115,
    borderBottomLeftRadius: 22, borderBottomRightRadius: 22, backgroundColor: tale.windowBottom, marginBottom: space.s,
    shadowColor: tale.chipText, shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 14 }, elevation: 4 },
  building: { position: 'absolute', left: 34, right: 34, bottom: 10, alignItems: 'center' },
  chip: { overflow: 'hidden', paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: tale.chip, color: tale.chipText,
    fontFamily: fonts.sansSemi, fontSize: 11, letterSpacing: 2 },
  title: { fontFamily: serif, color: tale.ink, textAlign: 'center', fontSize: 36, lineHeight: 40 },
  sub: { color: tale.soft, textAlign: 'center', fontSize: 15, lineHeight: 22 },
  guideRow: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  guide: { minWidth: hit, minHeight: hit, alignItems: 'center', justifyContent: 'center' },
  bubble: { padding: space.m, borderRadius: 22, backgroundColor: tale.page, borderWidth: 1, borderColor: colors.goldLine },
  bubbleText: { fontFamily: fonts.serifItalic, color: tale.ink, fontSize: 18, lineHeight: 24 },
  stars: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingHorizontal: space.s },
  star: { fontSize: 22, lineHeight: 26, color: tale.starOff },
  starOn: { color: tale.starOn },
  pages: { gap: space.xl, paddingTop: space.m },
  page: { paddingTop: space.xl + space.s, paddingBottom: space.l, paddingHorizontal: space.l, borderRadius: 24, backgroundColor: tale.page,
    borderWidth: 1, borderColor: tale.pageLine, shadowColor: tale.chipText, shadowOpacity: 0.15, shadowRadius: 18, shadowOffset: { width: 0, height: 12 }, elevation: 2 },
  pageRead: { borderColor: tale.starOn, borderWidth: 2 },
  pageNo: { position: 'absolute', top: -14, left: space.l, overflow: 'hidden', paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.pill,
    backgroundColor: tale.emerald, color: tale.page, fontFamily: fonts.sansSemi, fontSize: 11, letterSpacing: 1.3 },
  sticker: { position: 'absolute', top: -28, width: 62, height: 62, borderRadius: radius.pill, borderWidth: 3, backgroundColor: tale.page,
    alignItems: 'center', justifyContent: 'center' },
  pageText: { fontFamily: fonts.sans, color: tale.ink, fontSize: 18, lineHeight: 31 },
  finish: { flexDirection: 'row', alignItems: 'center', gap: space.m, padding: space.m, borderRadius: 24, backgroundColor: tale.page, borderWidth: 2, borderColor: tale.starOn },
  medal: { width: 56, height: 56, borderRadius: radius.pill, backgroundColor: tale.sun, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: tale.page },
  medalStar: { fontSize: 28, color: tale.chipText },
  finishTitle: { fontFamily: serif, color: tale.ink, fontSize: 22, lineHeight: 26 },
  finishText: { color: tale.soft, fontSize: 14, lineHeight: 20 },
});
