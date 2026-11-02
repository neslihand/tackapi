// The web site's palette (frontend/src/entrance.css, theme.css): night-green stages, gold light, ivory where reading
// happens. The token names stay as before; docs/design-system.md maps them to the new surfaces.
import { Platform } from 'react-native';

export const colors = {
  emerald: '#0A241D',      // night surface: heroes, covers, dark buttons
  emeraldLight: '#255747', // the lit edge of night green; also green text on ivory
  emeraldDeep: '#030A08',  // deepest night: tab bar, status strip
  gold: '#C7A96B',         // gold on night (never text on ivory: too faint)
  goldSoft: '#E6D5AE',     // light gold: titles and accents on night
  goldText: '#765B38',     // gold text on ivory (≥ 5.3:1)
  goldLine: '#977749',     // borders and icons: at least 3:1 on ivory and night
  parchment: '#F3ECDF',    // the ivory screen ground
  parchmentDeep: '#E9E1D0',
  paper: '#F6F1E6',        // ivory cards and fields, a shade lighter than the ground
  ink: '#1D2A25',
  soft: '#4B5448',
  line: '#D9C9A5',         // fine gold hairlines (decorative)
  mist: '#C9CFC8',         // body text on night
  danger: '#8D3A30',
  dangerSoft: '#F6E9E6',   // behind a wrong answer; danger and ink text stay above 4.5:1
  tabInactive: '#8E978F',  // tab labels on emeraldDeep (6.6:1)
  onGold: '#15130D',       // text and icons on the gold button
  nightLine: '#E6D5AE4d',  // goldSoft at 30%: hairlines on night (decorative)
  ivoryLine: '#97774973',  // goldLine at 45%: hairlines on ivory (decorative)
  goldFrame: '#E6D5AE59',  // goldSoft at 35%: the thin frame 4px outside the gold button
  nightStroke: '#E6D5AE73',// goldSoft at 45%: the border of a secondary button on night
  onGoldRule: '#15130D24', // onGold at 14%: the rule between the gold button's icon and its label
  archEdge: '#E6D5AE66',   // goldSoft at 40%: the outline of an arched picture
};

// The gold plate of the primary button and the night plate of the dark one (top → bottom).
export const gradients = {
  gold: ['#F1E5C6', '#D6BC89'],
  night: ['#255747', '#0F2F26'],
};

// Medallion fills; the tier is always written out too, so the metal is never the only clue.
export const metal = { bronze: '#A9773F', silver: '#B7B6B1', gold: colors.gold };

// Loaded in src/app/_layout.tsx. Each weight is its own family on the phone, so pick the family, not a fontWeight.
export const fonts = {
  serif: 'CormorantGaramond_500Medium',
  serifItalic: 'CormorantGaramond_500Medium_Italic',
  sans: 'Inter_400Regular',
  sansMedium: 'Inter_500Medium',
  sansSemi: 'Inter_600SemiBold',
};

export const serif = fonts.serif;

export const space = { xs: 4, s: 8, m: 16, l: 24, xl: 32, gutter: 20 };

// Translucent night laid over photos so gold and ivory text stay readable.
export const overlay = {
  shade: '#030A08b3',
  shadeStrong: '#030A08e6',
  paper: '#F6F1E6e6',       // labels floating over the map
  backdrop: '#030A0899',    // behind sheets and dialogs
};

// Cormorant's default figures are old-style (they dip below the line); dates and counts read better lining.
const lining = ['lining-nums' as const];

// Serif sizes run a step larger than before: Cormorant sets smaller than Georgia at the same size.
export const type = {
  display: { fontSize: 36, lineHeight: 40, fontVariant: lining },
  title: { fontSize: 28, lineHeight: 32, fontVariant: lining },
  heading: { fontSize: 21, lineHeight: 26, fontVariant: lining },
  body: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },      // secondary lines and notices
  reading: { fontSize: 19, lineHeight: 30, fontVariant: lining },   // long serif text on the work screen
  caption: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 16 },
  // spaced capitals; the text is upper-cased with toLocaleUpperCase, never textTransform (Turkish i/İ)
  eyebrow: { fontFamily: fonts.sansSemi, fontSize: 11, lineHeight: 16, letterSpacing: 2.2 },
  button: { fontFamily: fonts.sansSemi, fontSize: 12, lineHeight: 16, letterSpacing: 2 },
  // the large gold italic first letter of a reading (set on its own line part, not measured around the text)
  brand: { fontFamily: fonts.serif, fontSize: 22, lineHeight: 26, letterSpacing: 2 },   // the logo word, .09em
  dropCap: { fontFamily: fonts.serifItalic, fontSize: 56, lineHeight: 56, fontVariant: lining },
};

// The reading column never runs wider than this (about 60–70 characters at the reading size).
export const measure = { reading: 640 };

// Arched pictures: small (a list row) and medium; large takes the full width at this height ratio, up to archMaxHeight.
export const arch = { sm: { width: 56, height: 72 }, md: { width: 120, height: 156 }, lgRatio: 1.25, lgMax: 270 };

// The gold button is 56 high, a secondary one 48; the gold button's icon sits in a square bay of the same height.
export const control = { primary: 56, secondary: 48, frameGap: 4, ghostCircle: 40, tabBar: 64 };

// SVG line drawings use the web's stroke.
export const stroke = { motif: 1.3 };

// The web keeps its edges sharp: hair for the gold button, arch for the top of an arched picture (half its width).
export const radius = { hair: 2, s: 6, m: 12, l: 16, pill: 999 };

// Smallest touch target (WCAG / platform guidelines).
export const hit = 44;

export const shadow = {
  card: Platform.select({
    ios: { shadowColor: '#3E3D3A', shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
    android: { elevation: 2 },
    default: { boxShadow: '0 12px 28px -18px rgba(62, 61, 58, 0.45)' },
  }),
  glow: Platform.select({
    ios: { shadowColor: '#E6D5AE', shadowOpacity: 0.45, shadowRadius: 18, shadowOffset: { width: 0, height: 10 } },
    android: { elevation: 3 },
    default: { boxShadow: '0 18px 36px -20px rgba(230, 213, 174, 0.6)' },
  }),
};

// The short "pop" when a stamp lands (skipped when the phone asks for reduced motion).
export const motion = { popScale: 1.12, popMs: 140, pressScale: 0.98, pressOpacity: 0.88 };
