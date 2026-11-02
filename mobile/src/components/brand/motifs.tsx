// The web's line drawings of building types (frontend/src/components/StoryMotifs.tsx), redrawn with react-native-svg
// for ArchPlaceholder. Decorative, not documentary: no drawing stands for the actual building.
import type { ReactNode } from 'react';
import Svg, { Circle, G, Path } from 'react-native-svg';
import type { BuildingId } from '@/lib/motifs';
import { stroke } from '@/lib/theme';

// ——— viewBox 0 0 200 240, ground at y = 222 ———
const ground = <Path d="M14 222 H186" />;
const dome = (cx: number, base: number, r: number, h = r * 0.9) => `M${cx - r} ${base} Q${cx - r} ${base - h} ${cx} ${base - h - 2} Q${cx + r} ${base - h} ${cx + r} ${base}`;
const alem = (x: number, y: number) => <><Path d={`M${x} ${y} V${y - 12}`} /><Circle cx={x} cy={y - 16} r={3.2} /></>;
const minaret = (x: number, top = 58) => <>
  <Path d={`M${x - 6} 222 V${top + 30} M${x + 6} 222 V${top + 30}`} />
  <Path d={`M${x - 10} ${top + 74} H${x + 10} M${x - 9} ${top + 30} H${x + 9}`} />
  <Path d={`M${x - 6} ${top + 30} L${x} ${top} L${x + 6} ${top + 30}`} />{alem(x, top)}
</>;
const archDoor = (x: number, w: number, top: number) => `M${x - w} 222 V${top + w} Q${x - w} ${top} ${x} ${top - 4} Q${x + w} ${top} ${x + w} ${top + w} V222`;
const windows = (xs: number[], y: number, w = 5) => xs.map(x => <Path key={x} d={`M${x - w} ${y + 14} V${y + w} Q${x} ${y - 2} ${x + w} ${y + w} V${y + 14}`} />);

const BUILDINGS: Record<BuildingId, ReactNode> = {
  mosque: <>{ground}{minaret(172)}
    <Path d="M30 222 V164 H150 V222" /><Path d="M42 164 V150 H138 V164" /><Path d={dome(90, 150, 46)} />{alem(90, 102)}
    <Path d={dome(46, 164, 14, 12)} /><Path d={dome(134, 164, 14, 12)} />
    <Path d={archDoor(90, 12, 192)} />{windows([52, 70, 110, 128], 178)}{windows([64, 90, 116], 132, 4)}
  </>,
  complex: <>{ground}{minaret(28, 62)}{minaret(176, 62)}
    <Path d="M44 222 V160 H156 V222" /><Path d={dome(100, 160, 42)} />{alem(100, 116)}
    <Path d="M10 222 V196 H44 M156 196 H190 V222" />
    <Path d={dome(18, 196, 8, 8)} /><Path d={dome(36, 196, 8, 8)} /><Path d={dome(164, 196, 8, 8)} /><Path d={dome(182, 196, 8, 8)} />
    <Path d={archDoor(100, 11, 196)} />{windows([62, 80, 120, 138], 176)}
  </>,
  masjid: <>{ground}<Path d="M48 222 V150 H152 V222" /><Path d="M40 150 L100 112 L160 150" /><Path d="M150 132 V108 H160 V138" />
    <Path d="M155 108 L155 92" /><Circle cx={155} cy={88} r={3} />
    <Path d={archDoor(100, 12, 192)} />{windows([70, 130], 170)}<Path d="M40 150 H160" />
  </>,
  madrasa: <>{ground}<Path d="M16 222 V150 H184 V222" /><Path d="M16 150 H184" />
    {[34, 66, 100, 134, 166].map(x => <Path key={x} d={dome(x, 150, 14, 12)} />)}
    {[34, 66, 134, 166].map(x => <Path key={x} d={`M${x - 11} 222 V188 Q${x - 11} 172 ${x} 170 Q${x + 11} 172 ${x + 11} 188 V222`} />)}
    <Path d="M84 222 V176 Q84 154 100 150 Q116 154 116 176 V222" /><Path d="M78 222 V146 H122 V222" />{alem(100, 136)}
  </>,
  tomb: <>{ground}<Path d="M60 222 V128 H140 V222" /><Path d="M60 128 L100 66 L140 128" /><Path d="M76 128 L100 66 L124 128" />
    <Path d="M60 140 H140 M60 210 H140" /><Path d={archDoor(100, 11, 190)} /><Path d="M72 156 L100 150 L128 156" />
    <Path d="M100 66 V54" /><Circle cx={100} cy={50} r={3} />
  </>,
  imaret: <>{ground}<Path d="M24 222 V156 H176 V222" /><Path d={dome(64, 156, 30)} /><Path d={dome(136, 156, 30)} />
    {[48, 80, 120, 152].map(x => <Path key={x} d={`M${x} 140 V118 H${x + 6} V140`} />)}
    <Path d={archDoor(100, 12, 192)} />{windows([44, 156], 176)}{alem(64, 126)}{alem(136, 126)}
  </>,
  bath: <>{ground}<Path d="M20 222 V170 H180 V222" /><Path d={dome(76, 170, 40)} /><Path d={dome(146, 170, 26)} />
    {[[62, 150], [76, 142], [90, 150], [70, 160], [84, 160], [138, 158], [152, 158], [145, 150]].map(([x, y]) => <Path key={`${x}${y}`} d={`M${x} ${y - 3} L${x + 1} ${y} L${x} ${y + 3} L${x - 1} ${y} Z`} />)}
    <Path d={dome(32, 170, 10, 10)} /><Path d={archDoor(40, 10, 196)} />{windows([120, 168], 186)}
  </>,
  fountain: <>{ground}<Path d="M44 222 V96 H156 V222" /><Path d="M32 96 H168 L156 84 H44 Z" />
    <Path d="M62 222 V150 Q62 116 100 110 Q138 116 138 150 V222" /><Path d="M72 150 Q72 126 100 122 Q128 126 128 150" />
    <Path d="M100 168 V176 Q100 182 106 182" /><Path d="M74 222 V204 H126 V222" /><Path d="M56 106 H144" />
    <Circle cx={100} cy={142} r={7} /><Path d="M100 135 V149 M93 142 H107" />
  </>,
  han: <>{ground}<Path d="M16 222 V120 H184 V222" /><Path d="M16 172 H184" />
    {[30, 50, 70, 130, 150, 170].map(x => <Path key={x} d={`M${x - 7} 172 V146 Q${x - 7} 134 ${x} 132 Q${x + 7} 134 ${x + 7} 146 V172 M${x - 7} 222 V198 Q${x - 7} 186 ${x} 184 Q${x + 7} 186 ${x + 7} 198 V222`} />)}
    <Path d="M82 222 V100 H118 V222" /><Path d={archDoor(100, 12, 160)} /><Path d="M86 140 Q100 118 114 140" />
  </>,
  bedesten: <>{ground}<Path d="M14 222 V160 H186 V222" />
    {[34, 78, 122, 166].map(x => <Path key={x} d={dome(x, 160, 20, 18)} />)}
    {[34, 78, 122, 166].map(x => <G key={x}>{alem(x, 140)}</G>)}
    {[34, 78, 122, 166].map(x => <Path key={x} d={`M${x - 9} 222 V196 Q${x} 184 ${x + 9} 196 V222`} />)}
  </>,
  zawiya: <>{ground}<Path d="M54 222 V150 H146 V222" /><Path d={dome(100, 150, 40)} />{alem(100, 112)}
    <Path d="M16 222 V178 H54 M146 178 H184 V222" /><Path d="M10 178 L35 162 L60 178 M140 178 L165 162 L190 178" />
    <Path d={archDoor(100, 11, 192)} />{windows([30, 170], 192, 4)}
  </>,
  graveyard: <>{ground}{[[40, 150, 'turban'], [80, 132, 'turban'], [120, 146, 'flat'], [160, 128, 'turban']].map(([x, top, cap]) => <G key={x as number}>
    <Path d={`M${(x as number) - 9} 222 V${(top as number) + 10} Q${x} ${(top as number) + 2} ${(x as number) + 9} ${(top as number) + 10} V222`} />
    {cap === 'turban' ? <Path d={`M${(x as number) - 10} ${(top as number) + 6} Q${x} ${(top as number) - 18} ${(x as number) + 10} ${(top as number) + 6} Z M${(x as number) - 8} ${(top as number) - 2} H${(x as number) + 8}`} /> : <Path d={`M${(x as number) - 12} ${top} H${(x as number) + 12}`} />}
  </G>)}<Path d="M20 206 Q60 196 100 206 T180 206" />
  </>,
  bridge: <><Path d="M6 150 H194" /><Path d="M6 162 H194" />
    <Path d="M6 222 Q6 178 40 172 Q74 178 74 222" /><Path d="M74 222 Q74 160 100 156 Q126 160 126 222" /><Path d="M126 222 Q126 178 160 172 Q194 178 194 222" />
    <Path d="M90 150 V138 H110 V150" /><Path d="M6 206 Q30 200 56 206 T106 206 T156 206 T196 206" opacity={0.6} />
  </>,
  library: <>{ground}<Path d="M50 222 V140 H150 V222" /><Path d={dome(100, 140, 36)} />{alem(100, 106)}
    <Path d="M40 222 V200 H160 V222" /><Path d={archDoor(100, 11, 182)} />
    {[66, 72, 78, 122, 128, 134].map(x => <Path key={x} d={`M${x} 176 V156`} />)}<Path d="M62 176 H82 M118 176 H138" />
  </>,
  church: <>{ground}<Path d="M40 222 V140 H130 V222" /><Path d="M30 140 L85 100 L140 140" /><Path d="M130 222 V80 H162 V222" />
    <Path d="M130 80 L146 56 L162 80" /><Path d="M146 56 V40 M140 46 H152" /><Path d={archDoor(85, 12, 190)} />
    <Circle cx={85} cy={150} r={10} /><Path d={archDoor(146, 7, 114).replace('V222', 'V128')} />
  </>,
  house: <>{ground}<Path d="M30 222 V150 H170 V222" /><Path d="M20 150 L100 106 L180 150" />
    <Path d="M100 150 V126 H170 V150" /><Path d="M96 126 H174" />
    {[46, 66, 120, 140, 160].map(x => <Path key={x} d={`M${x} 190 V172 H${x + 12} V190 Z M${x + 6} 172 V190`} />)}
    {[112, 132, 152].map(x => <Path key={x} d={`M${x} 146 V132 H${x + 10} V146`} />)}<Path d="M84 222 V196 H100 V222" />
  </>,
  arch: <>{ground}<Path d="M40 222 V80 H160 V222" /><Path d="M52 222 V128 Q52 92 100 84 Q148 92 148 128 V222" />
    <Path d="M64 222 V132 Q64 104 100 98 Q136 104 136 132 V222" />
    {[0, 1, 2, 3].map(r => <Path key={r} d={`M${70 + r * 4} ${118 - r * 6} Q100 ${100 - r * 7} ${130 - r * 4} ${118 - r * 6}`} />)}
    <Path d="M40 92 H160" />
  </>,
};

/** One building drawing in a single stroke of `color`; sized by its box (keeps the 200×240 proportion). */
export function Motif({ id, color, width, height }: { id: BuildingId; color: string; width: number; height: number }) {
  return <Svg width={width} height={height} viewBox="0 0 200 240" fill="none" stroke={color} strokeWidth={stroke.motif}
    strokeLinecap="round" strokeLinejoin="round">
    {BUILDINGS[id] ?? BUILDINGS.arch}
  </Svg>;
}
