// The Sunum section as saved on the phone (tackapi:demo:v1, apart from the passport); every change also reaches geo.ts,
// the one place the demo location is used.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { DEMO_KEY, parseDemo, type DemoPlace, type DemoState } from './demo';
import { setDemoPlace } from './geo';

export function useDemo() {
  const [state, setState] = useState<DemoState | null>(null);

  useFocusEffect(useCallback(() => {
    let live = true;
    AsyncStorage.getItem(DEMO_KEY).then(v => { if (live) setState(parseDemo(v)); }, () => { if (live) setState(parseDemo(null)); });
    return () => { live = false; };
  }, []));

  const save = useCallback((next: DemoState) => {
    setState(next);
    setDemoPlace(next.place);
    AsyncStorage.setItem(DEMO_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  return {
    state,
    unlock: () => save({ version: 1, unlocked: true, place: state?.place ?? null }),
    // hiding the section also ends the demo location, so no DEMO strip is left without a way to turn it off
    hide: () => save({ version: 1, unlocked: false, place: null }),
    choose: (place: DemoPlace | null) => save({ version: 1, unlocked: true, place }),
  };
}
