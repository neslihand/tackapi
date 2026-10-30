// The web site's palette (frontend/src/theme.css): dark emerald stages, gold light, parchment where reading happens.
import { Platform } from 'react-native';

export const colors = {
  emerald: '#0F2F26',
  emeraldLight: '#255747',
  emeraldDeep: '#082119',
  gold: '#C3A869',
  goldSoft: '#E7DCB9',
  goldText: '#765B38',
  goldLine: '#A8916E',
  parchment: '#F7F3EB',
  parchmentDeep: '#EEE8DB',
  paper: '#FDFAF4',
  ink: '#192F28',
  soft: '#50594D',
  line: '#BBBAB6',
  danger: '#8D3A30',
};

export const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

export const space = { xs: 4, s: 8, m: 16, l: 24, xl: 32 };
