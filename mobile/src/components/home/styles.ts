// Shared spacing for Bugün's cards: each card sets its own side margin so a full-width rail can skip it.
import { StyleSheet } from 'react-native';
import { colors, space, type } from '@/lib/theme';

export const home = StyleSheet.create({
  pad: { marginHorizontal: space.m },
  gap: { gap: space.s },
  small: { color: colors.soft, ...type.caption },
  body: { color: colors.soft, ...type.body },
});
