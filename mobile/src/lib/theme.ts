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

export const space = { xs: 4, s: 8, m: 16, l: 24, xl: 32 };

// Translucent night laid over photos so gold and ivory text stay readable.
export const overlay = {
  shade: '#030A08b3',
  shadeStrong: '#030A08e6',
  paper: '#F6F1E6e6',       // labels floating over the map
  backdrop: '#030A0899',    // behind sheets and dialogs
};

// Serif sizes run a step larger than before: Cormorant sets smaller than Georgia at the same size.
export const type = {
  display: { fontSize: 36, lineHeight: 40 },
  title: { fontSize: 28, lineHeight: 32 },
  heading: { fontSize: 21, lineHeight: 26 },
  body: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },      // secondary lines and notices
  reading: { fontSize: 19, lineHeight: 30 },   // long serif text on the work screen
  caption: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 16 },
};

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
