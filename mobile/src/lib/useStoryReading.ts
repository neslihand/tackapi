// Follows one telling on the work's screen: the handlers go on the scroll view and the text, and onDone fires once when
// storyProgress says it was read (or heard). Time counts only while this screen is in front and the text is in view.
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { AppState, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { COMPLETE_AT, isRead, seenRatio, textInView } from './storyProgress';

type Surface = 'read' | 'listen';
type Options = { telling: string; text: string | null; onStart: () => void; onDone: (ratio: number, surface: Surface) => void };
const TICK_MS = 1000;
const blank = () => ({ ratio: 0, ms: 0, started: false, done: false });

export function useStoryReading(options: Options) {
  const latest = useRef(options);
  useEffect(() => { latest.current = options; });
  const box = useRef({ section: 0, block: 0, height: 0, scroll: 0, viewport: 0 });
  const run = useRef(blank());
  useEffect(() => { run.current = blank(); }, [options.telling]);

  const start = useCallback(() => { if (!run.current.started) { run.current.started = true; latest.current.onStart(); } }, []);
  const finish = useCallback((surface: Surface) => { run.current.done = true; latest.current.onDone(run.current.ratio, surface); }, []);
  const visible = useCallback(() => {
    const { section, block, height, scroll, viewport } = box.current;
    return viewport > 0 && textInView(scroll, scroll + viewport, section + block, height);
  }, []);
  const check = useCallback(() => {
    const { text } = latest.current;
    if (text && !run.current.done && isRead(run.current.ratio, run.current.ms, text)) finish('read');
  }, [finish]);
  const measure = useCallback(() => {
    const { section, block, height, scroll, viewport } = box.current;
    if (!visible()) return;
    run.current.ratio = Math.max(run.current.ratio, seenRatio(scroll + viewport, section + block, height));
    start(); check();
  }, [visible, start, check]);

  useFocusEffect(useCallback(() => {
    const timer = setInterval(() => {
      if (AppState.currentState !== 'active' || run.current.done || !visible()) return;
      run.current.ms += TICK_MS;
      check();
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [visible, check]));

  return {
    onScroll: useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
      box.current.scroll = e.nativeEvent.contentOffset.y; box.current.viewport = e.nativeEvent.layoutMeasurement.height; measure();
    }, [measure]),
    onViewport: useCallback((e: LayoutChangeEvent) => { box.current.viewport = e.nativeEvent.layout.height; measure(); }, [measure]),
    onSection: useCallback((e: LayoutChangeEvent) => { box.current.section = e.nativeEvent.layout.y; measure(); }, [measure]),
    onBlock: useCallback((e: LayoutChangeEvent) => { box.current.block = e.nativeEvent.layout.y; box.current.height = e.nativeEvent.layout.height; measure(); }, [measure]),
    /** The share of the telling the voice has finished. */
    onListened: useCallback((ratio: number) => {
      start();
      run.current.ratio = Math.max(run.current.ratio, ratio);
      if (!run.current.done && ratio >= COMPLETE_AT) finish('listen');
    }, [start, finish]),
  };
}
