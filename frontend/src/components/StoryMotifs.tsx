import type { ReactNode } from 'react';

// Line drawings for the story telling: a building of the work's type and the ornaments of its era, drawn in one gold
// stroke so they sit on the night green like the gilding of a manuscript. They are decorative, not documentary: no
// drawing stands for the actual building.

// ——— Buildings: viewBox 0 0 200 240, ground at y = 222 ———
const ground = <path d="M14 222 H186" />;
const dome = (cx: number, base: number, r: number, h = r * 0.9) => `M${cx - r} ${base} Q${cx - r} ${base - h} ${cx} ${base - h - 2} Q${cx + r} ${base - h} ${cx + r} ${base}`;
const alem = (x: number, y: number) => <><path d={`M${x} ${y} V${y - 12}`} /><circle cx={x} cy={y - 16} r={3.2} /></>;
const minaret = (x: number, top = 58) => <>
  <path d={`M${x - 6} 222 V${top + 30} M${x + 6} 222 V${top + 30}`} />
  <path d={`M${x - 10} ${top + 74} H${x + 10} M${x - 9} ${top + 30} H${x + 9}`} />
  <path d={`M${x - 6} ${top + 30} L${x} ${top} L${x + 6} ${top + 30}`} />{alem(x, top)}
</>;
const archDoor = (x: number, w: number, top: number) => `M${x - w} 222 V${top + w} Q${x - w} ${top} ${x} ${top - 4} Q${x + w} ${top} ${x + w} ${top + w} V222`;
const windows = (xs: number[], y: number, w = 5) => xs.map(x => <path key={x} d={`M${x - w} ${y + 14} V${y + w} Q${x} ${y - 2} ${x + w} ${y + w} V${y + 14}`} />);

const BUILDINGS: Record<string, ReactNode> = {
  mosque: <>{ground}{minaret(172)}
    <path d="M30 222 V164 H150 V222" /><path d="M42 164 V150 H138 V164" /><path d={dome(90, 150, 46)} />{alem(90, 102)}
    <path d={dome(46, 164, 14, 12)} /><path d={dome(134, 164, 14, 12)} />
    <path d={archDoor(90, 12, 192)} />{windows([52, 70, 110, 128], 178)}{windows([64, 90, 116], 132, 4)}
  </>,
  complex: <>{ground}{minaret(28, 62)}{minaret(176, 62)}
    <path d="M44 222 V160 H156 V222" /><path d={dome(100, 160, 42)} />{alem(100, 116)}
    <path d="M10 222 V196 H44 M156 196 H190 V222" />
    <path d={dome(18, 196, 8, 8)} /><path d={dome(36, 196, 8, 8)} /><path d={dome(164, 196, 8, 8)} /><path d={dome(182, 196, 8, 8)} />
    <path d={archDoor(100, 11, 196)} />{windows([62, 80, 120, 138], 176)}
  </>,
  masjid: <>{ground}<path d="M48 222 V150 H152 V222" /><path d="M40 150 L100 112 L160 150" /><path d="M150 132 V108 H160 V138" />
    <path d="M155 108 L155 92" /><circle cx={155} cy={88} r={3} />
    <path d={archDoor(100, 12, 192)} />{windows([70, 130], 170)}<path d="M40 150 H160" />
  </>,
  madrasa: <>{ground}<path d="M16 222 V150 H184 V222" /><path d="M16 150 H184" />
    {[34, 66, 100, 134, 166].map(x => <path key={x} d={dome(x, 150, 14, 12)} />)}
    {[34, 66, 134, 166].map(x => <path key={x} d={`M${x - 11} 222 V188 Q${x - 11} 172 ${x} 170 Q${x + 11} 172 ${x + 11} 188 V222`} />)}
    <path d="M84 222 V176 Q84 154 100 150 Q116 154 116 176 V222" /><path d="M78 222 V146 H122 V222" />{alem(100, 136)}
  </>,
  tomb: <>{ground}<path d="M60 222 V128 H140 V222" /><path d="M60 128 L100 66 L140 128" /><path d="M76 128 L100 66 L124 128" />
    <path d="M60 140 H140 M60 210 H140" /><path d={archDoor(100, 11, 190)} /><path d="M72 156 L100 150 L128 156" />
    <path d="M100 66 V54" /><circle cx={100} cy={50} r={3} />
  </>,
  imaret: <>{ground}<path d="M24 222 V156 H176 V222" /><path d={dome(64, 156, 30)} /><path d={dome(136, 156, 30)} />
    {[48, 80, 120, 152].map(x => <path key={x} d={`M${x} 140 V118 H${x + 6} V140`} />)}
    <path d={archDoor(100, 12, 192)} />{windows([44, 156], 176)}{alem(64, 126)}{alem(136, 126)}
  </>,
  bath: <>{ground}<path d="M20 222 V170 H180 V222" /><path d={dome(76, 170, 40)} /><path d={dome(146, 170, 26)} />
    {[[62, 150], [76, 142], [90, 150], [70, 160], [84, 160], [138, 158], [152, 158], [145, 150]].map(([x, y]) => <path key={`${x}${y}`} d={`M${x} ${y - 3} L${x + 1} ${y} L${x} ${y + 3} L${x - 1} ${y} Z`} />)}
    <path d={dome(32, 170, 10, 10)} /><path d={archDoor(40, 10, 196)} />{windows([120, 168], 186)}
  </>,
  fountain: <>{ground}<path d="M44 222 V96 H156 V222" /><path d="M32 96 H168 L156 84 H44 Z" />
    <path d="M62 222 V150 Q62 116 100 110 Q138 116 138 150 V222" /><path d="M72 150 Q72 126 100 122 Q128 126 128 150" />
    <path d="M100 168 V176 Q100 182 106 182" /><path d="M74 222 V204 H126 V222" /><path d="M56 106 H144" />
    <circle cx={100} cy={142} r={7} /><path d="M100 135 V149 M93 142 H107" />
  </>,
  han: <>{ground}<path d="M16 222 V120 H184 V222" /><path d="M16 172 H184" />
    {[30, 50, 70, 130, 150, 170].map(x => <path key={x} d={`M${x - 7} 172 V146 Q${x - 7} 134 ${x} 132 Q${x + 7} 134 ${x + 7} 146 V172 M${x - 7} 222 V198 Q${x - 7} 186 ${x} 184 Q${x + 7} 186 ${x + 7} 198 V222`} />)}
    <path d="M82 222 V100 H118 V222" /><path d={archDoor(100, 12, 160)} /><path d="M86 140 Q100 118 114 140" />
  </>,
  bedesten: <>{ground}<path d="M14 222 V160 H186 V222" />
    {[34, 78, 122, 166].map(x => <path key={x} d={dome(x, 160, 20, 18)} />)}
    {[34, 78, 122, 166].map(x => <g key={x}>{alem(x, 140)}</g>)}
    {[34, 78, 122, 166].map(x => <path key={x} d={`M${x - 9} 222 V196 Q${x} 184 ${x + 9} 196 V222`} />)}
  </>,
  zawiya: <>{ground}<path d="M54 222 V150 H146 V222" /><path d={dome(100, 150, 40)} />{alem(100, 112)}
    <path d="M16 222 V178 H54 M146 178 H184 V222" /><path d="M10 178 L35 162 L60 178 M140 178 L165 162 L190 178" />
    <path d={archDoor(100, 11, 192)} />{windows([30, 170], 192, 4)}
  </>,
  graveyard: <>{ground}{[[40, 150, 'turban'], [80, 132, 'turban'], [120, 146, 'flat'], [160, 128, 'turban']].map(([x, top, cap]) => <g key={x as number}>
    <path d={`M${(x as number) - 9} 222 V${(top as number) + 10} Q${x} ${(top as number) + 2} ${(x as number) + 9} ${(top as number) + 10} V222`} />
    {cap === 'turban' ? <path d={`M${(x as number) - 10} ${(top as number) + 6} Q${x} ${(top as number) - 18} ${(x as number) + 10} ${(top as number) + 6} Z M${(x as number) - 8} ${(top as number) - 2} H${(x as number) + 8}`} /> : <path d={`M${(x as number) - 12} ${top} H${(x as number) + 12}`} />}
  </g>)}<path d="M20 206 Q60 196 100 206 T180 206" />
  </>,
  bridge: <><path d="M6 150 H194" /><path d="M6 162 H194" />
    <path d="M6 222 Q6 178 40 172 Q74 178 74 222" /><path d="M74 222 Q74 160 100 156 Q126 160 126 222" /><path d="M126 222 Q126 178 160 172 Q194 178 194 222" />
    <path d="M90 150 V138 H110 V150" /><path d="M6 206 Q30 200 56 206 T106 206 T156 206 T196 206" opacity={0.6} />
  </>,
  library: <>{ground}<path d="M50 222 V140 H150 V222" /><path d={dome(100, 140, 36)} />{alem(100, 106)}
    <path d="M40 222 V200 H160 V222" /><path d={archDoor(100, 11, 182)} />
    {[66, 72, 78, 122, 128, 134].map(x => <path key={x} d={`M${x} 176 V156`} />)}<path d="M62 176 H82 M118 176 H138" />
  </>,
  church: <>{ground}<path d="M40 222 V140 H130 V222" /><path d="M30 140 L85 100 L140 140" /><path d="M130 222 V80 H162 V222" />
    <path d="M130 80 L146 56 L162 80" /><path d="M146 56 V40 M140 46 H152" /><path d={archDoor(85, 12, 190)} />
    <circle cx={85} cy={150} r={10} /><path d={archDoor(146, 7, 114).replace('V222', 'V128')} />
  </>,
  house: <>{ground}<path d="M30 222 V150 H170 V222" /><path d="M20 150 L100 106 L180 150" />
    <path d="M100 150 V126 H170 V150" /><path d="M96 126 H174" />
    {[46, 66, 120, 140, 160].map(x => <path key={x} d={`M${x} 190 V172 H${x + 12} V190 Z M${x + 6} 172 V190`} />)}
    {[112, 132, 152].map(x => <path key={x} d={`M${x} 146 V132 H${x + 10} V146`} />)}<path d="M84 222 V196 H100 V222" />
  </>,
  arch: <>{ground}<path d="M40 222 V80 H160 V222" /><path d="M52 222 V128 Q52 92 100 84 Q148 92 148 128 V222" />
    <path d="M64 222 V132 Q64 104 100 98 Q136 104 136 132 V222" />
    {[0, 1, 2, 3].map(r => <path key={r} d={`M${70 + r * 4} ${118 - r * 6} Q100 ${100 - r * 7} ${130 - r * 4} ${118 - r * 6}`} />)}
    <path d="M40 92 H160" />
  </>,
};

// ——— Ornaments of an era: viewBox 0 0 200 200, centred ———
const petals = (n: number, r: number, w: number) => Array.from({ length: n }, (_, i) => <path key={i} transform={`rotate(${(360 / n) * i} 100 100)`} d={`M100 100 Q${100 - w} ${100 - r / 2} 100 ${100 - r} Q${100 + w} ${100 - r / 2} 100 100`} />);
const ORNAMENTS: Record<string, ReactNode> = {
  star: <><rect x={46} y={46} width={108} height={108} /><rect x={46} y={46} width={108} height={108} transform="rotate(45 100 100)" />
    <circle cx={100} cy={100} r={30} /><rect x={78} y={78} width={44} height={44} transform="rotate(45 100 100)" /><circle cx={100} cy={100} r={84} /></>,
  muqarnas: <>{[0, 1, 2, 3].map(row => Array.from({ length: 4 - row }, (_, i) => {
    const w = 36, x = 100 - ((4 - row) * w) / 2 + i * w, y = 40 + row * 34;
    return <path key={`${row}-${i}`} d={`M${x} ${y + 34} V${y + 14} Q${x} ${y} ${x + w / 2} ${y - 2} Q${x + w} ${y} ${x + w} ${y + 14} V${y + 34}`} />;
  }))}<path d="M28 182 H172" /></>,
  knot: <><circle cx={100} cy={100} r={70} />{[0, 60, 120].map(a => <ellipse key={a} cx={100} cy={100} rx={70} ry={26} transform={`rotate(${a} 100 100)`} />)}<circle cx={100} cy={100} r={12} /></>,
  tile: <><path d="M100 22 L168 61 V139 L100 178 L32 139 V61 Z" /><path d="M100 40 L152 70 V130 L100 160 L48 130 V70 Z" />{petals(6, 46, 14)}<circle cx={100} cy={100} r={8} /></>,
  masonry: <>{[0, 1, 2, 3, 4, 5].map(r => <g key={r}>{r % 2 ? <rect x={30} y={30 + r * 24} width={140} height={20} /> : [0, 1, 2, 3].map(i => <rect key={i} x={30 + i * 35} y={30 + r * 24} width={33} height={20} />)}</g>)}</>,
  palmette: <><path d="M100 176 V120" />{[-60, -36, -12, 12, 36, 60].map(a => <path key={a} transform={`rotate(${a} 100 120)`} d="M100 120 Q88 80 100 40 Q112 80 100 120" />)}<path d="M70 176 Q100 150 130 176" /></>,
  tulip: <><path d="M100 184 V112" /><path d="M100 150 Q70 140 62 112 Q90 118 100 140" /><path d="M100 112 Q74 104 76 62 Q90 82 100 76 Q110 82 124 62 Q126 104 100 112" /><path d="M100 76 Q96 52 100 30 Q104 52 100 76" /></>,
  carnation: <><path d="M100 184 V108" /><path d="M100 140 Q126 132 132 110 Q110 114 100 132" />{[-40, -20, 0, 20, 40].map(a => <path key={a} transform={`rotate(${a} 100 108)`} d="M100 108 L94 70 L100 76 L106 70 Z" />)}<path d="M86 108 Q100 118 114 108" /></>,
  cintamani: <>{[[78, 70], [122, 70], [100, 104]].map(([x, y]) => <g key={x + y}><circle cx={x} cy={y} r={16} /><circle cx={x} cy={y} r={6} /></g>)}
    <path d="M40 140 Q60 126 80 140 T120 140 T160 140" /><path d="M40 160 Q60 146 80 160 T120 160 T160 160" /></>,
  saz: <><path d="M40 170 Q60 60 160 30 Q120 120 40 170 Z" /><path d="M40 170 Q100 100 160 30" />{[0, 1, 2, 3, 4].map(i => <path key={i} d={`M${70 + i * 16} ${140 - i * 22} l12 -4`} />)}</>,
  scroll: <><path d="M40 150 Q40 100 80 100 Q110 100 110 126 Q110 146 90 146 Q74 146 74 132" /><path d="M160 50 Q160 100 120 100 Q90 100 90 74 Q90 54 110 54 Q126 54 126 68" /><circle cx={100} cy={100} r={5} /></>,
  shell: <><path d="M30 150 Q100 10 170 150 Z" />{[-56, -34, -12, 12, 34, 56].map(a => <path key={a} transform={`rotate(${a} 100 150)`} d="M100 150 V60" />)}<path d="M80 150 Q100 170 120 150" /></>,
  vase: <><path d="M80 182 H120 M86 182 Q70 150 84 130 Q76 118 86 112 H114 Q124 118 116 130 Q130 150 114 182" /><path d="M100 112 V76" />{petals(5, 30, 10).map((p, i) => <g key={i} transform="translate(0 -36)">{p}</g>)}<path d="M100 96 Q80 92 72 74 M100 96 Q120 92 128 74" /></>,
  crescent: <><path d="M100 34 A54 54 0 1 0 150 120 A42 42 0 1 1 100 34 Z" /><path d="M136 72 l6 12 l13 2 l-10 9 l3 13 l-12 -7 l-12 7 l3 -13 l-10 -9 l13 -2 Z" /></>,
  capital: <><path d="M50 70 H150" /><path d="M64 70 Q50 70 50 84 Q50 98 64 98 Q74 98 74 88 Q74 80 66 80" /><path d="M136 70 Q150 70 150 84 Q150 98 136 98 Q126 98 126 88 Q126 80 134 80" />
    <path d="M74 92 H126" /><path d="M82 98 V182 M118 98 V182" />{[90, 100, 110].map(x => <path key={x} d={`M${x} 102 V182`} />)}<path d="M70 182 H130" /></>,
  laurel: <><path d="M100 180 Q40 140 60 40" /><path d="M100 180 Q160 140 140 40" />{[0, 1, 2, 3, 4].map(i => <g key={i}><ellipse cx={66 + i * 2} cy={150 - i * 24} rx={10} ry={5} transform={`rotate(-40 ${66 + i * 2} ${150 - i * 24})`} /><ellipse cx={134 - i * 2} cy={150 - i * 24} rx={10} ry={5} transform={`rotate(40 ${134 - i * 2} ${150 - i * 24})`} /></g>)}</>,
  cross: <><circle cx={100} cy={100} r={70} /><path d="M100 40 V160 M40 100 H160" /><path d="M86 54 Q100 44 114 54 M86 146 Q100 156 114 146 M54 86 Q44 100 54 114 M146 86 Q156 100 146 114" /></>,
};

export function Motif({ id }: { id: string }) {
  const building = BUILDINGS[id];
  return <svg className={`motif ${building ? 'motif-building' : 'motif-ornament'}`} viewBox={building ? '0 0 200 240' : '0 0 200 200'}
    fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {building ?? ORNAMENTS[id] ?? ORNAMENTS.star}
  </svg>;
}
