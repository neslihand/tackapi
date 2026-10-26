import { useState } from 'react';
import { isGameLevel, type GameKind, type GameLevel } from './games';

export const narrationModes = [['short', 'Kısa ve Öz'], ['story', 'Hikâyeleştirerek'], ['child', 'Çocuklar İçin']] as const;
export type NarrationMode = typeof narrationModes[number][0];

const KEY = 'esik:narration:v1';
const isMode = (value: unknown): value is NarrationMode => narrationModes.some(([mode]) => mode === value);

export function useNarrationMode(fallback: NarrationMode) {
  const [mode, setMode] = useState<NarrationMode>(() => {
    try { const saved = localStorage.getItem(KEY); return isMode(saved) ? saved : fallback; } catch { return fallback; }
  });
  function choose(next: NarrationMode) {
    setMode(next);
    try { localStorage.setItem(KEY, next); } catch { /* Storage may be unavailable; the choice still applies to this page. */ }
  }
  return [mode, choose] as const;
}

// The last level chosen in each mini game, e.g. { "puzzle": "orta" }. A level given by a link wins for this visit.
const LEVEL_KEY = 'esik:games:level:v1';
function savedLevels(): Record<string, unknown> {
  try { const data = JSON.parse(localStorage.getItem(LEVEL_KEY) ?? '{}'); return typeof data === 'object' && data !== null && !Array.isArray(data) ? data : {}; } catch { return {}; }
}
export function useGameLevel(game: GameKind, requested?: GameLevel) {
  const [level, setLevel] = useState<GameLevel>(() => {
    if (requested) return requested;
    const saved = savedLevels()[game];
    return isGameLevel(saved) ? saved : 'kolay';
  });
  function choose(next: GameLevel) {
    setLevel(next);
    try { localStorage.setItem(LEVEL_KEY, JSON.stringify({ ...savedLevels(), [game]: next })); } catch { /* Storage may be unavailable; the level still applies to this game. */ }
  }
  return [level, choose] as const;
}
