import { useEffect, useState } from 'react';

export type PlayActivity = 'puzzle' | 'detective' | 'quiz';
export type PlaySession = Record<PlayActivity, boolean> & { flipped: string[] };
const KEY = 'esik:play-session:v1';

function read(): PlaySession {
  try {
    const data = JSON.parse(sessionStorage.getItem(KEY) ?? '{}');
    return { puzzle: data.puzzle === true, detective: data.detective === true, quiz: data.quiz === true, flipped: Array.isArray(data.flipped) ? data.flipped.filter((id: unknown) => typeof id === 'string') : [] };
  } catch { return { puzzle: false, detective: false, quiz: false, flipped: [] }; }
}

export function usePlaySession() {
  const [session, setSession] = useState(read);
  useEffect(() => {
    try { sessionStorage.setItem(KEY, JSON.stringify(session)); } catch { /* Without storage the notebook still follows this page view. */ }
  }, [session]);
  return {
    session,
    complete: (activity: PlayActivity) => setSession(s => s[activity] ? s : { ...s, [activity]: true }),
    flip: (id: string) => setSession(s => s.flipped.includes(id) ? s : { ...s, flipped: [...s.flipped, id] }),
  };
}
