// The web site's palette (frontend/src/theme.css): dark emerald stages, gold light, parchment where reading happens.
import { Platform } from 'react-native';

export const colors = {
  emerald: '#0F2F26',
  emeraldLight: '#255747',
  emeraldDeep: '#082119',
  gold: '#C3A869',
  goldSoft: '#E7DCB9',
  goldText: '#765B38',
  goldLine: '#977749',     // borders and icons: at least 3:1 on parchment, paper and emerald
  parchment: '#F7F3EB',
  parchmentDeep: '#EEE8DB',
  paper: '#FDFAF4',
  ink: '#192F28',
  soft: '#50594D',
  line: '#BBBAB6',
  danger: '#8D3A30',
  dangerSoft: '#F6E9E6',   // behind a wrong answer; danger and ink text stay above 4.5:1
  tabInactive: '#A4A29F',  // tab labels on emeraldDeep
};

// Medallion fills; the tier is always written out too, so the metal is never the only clue.
export const metal = { bronze: '#A9773F', silver: '#B7B6B1', gold: colors.gold };

export const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

export const space = { xs: 4, s: 8, m: 16, l: 24, xl: 32 };

// Translucent deep emerald laid over photos so gold and parchment text stay readable.
export const overlay = {
  shade: '#082119b3',
  shadeStrong: '#082119e6',
  paper: '#fdfaf4e6',       // labels floating over the map
};

export const type = {
  display: { fontSize: 34, lineHeight: 40 },
  title: { fontSize: 26, lineHeight: 31 },
  heading: { fontSize: 18, lineHeight: 24 },
  body: { fontSize: 15, lineHeight: 22 },
  reading: { fontSize: 17, lineHeight: 27 },   // long serif text on the work screen
  caption: { fontSize: 12, lineHeight: 16 },
};

export const radius = { s: 8, m: 12, l: 16, pill: 999 };

// Smallest touch target (WCAG / platform guidelines).
export const hit = 44;

export const shadow = {
  card: Platform.select({
    ios: { shadowColor: colors.emeraldDeep, shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
    android: { elevation: 2 },
    default: { boxShadow: '0 2px 8px rgba(8, 33, 25, 0.08)' },
  }),
};

// The short "pop" when a stamp lands (skipped when the phone asks for reduced motion).
export const motion = { popScale: 1.12, popMs: 140 };
