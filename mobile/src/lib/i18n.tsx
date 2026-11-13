// Turkish/English, like the site's t('tr', 'en'). The language lives in a module variable so plain functions (api,
// notifications) read it too; LangProvider re-renders the screens when it changes.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Lang = 'tr' | 'en';
const KEY = 'tackapi:lang:v1';
let lang: Lang = 'tr';

export const currentLang = () => lang;
export const t = (tr: string, en: string) => (lang === 'en' ? en : tr);

const Context = createContext<{ lang: Lang; setLang: (l: Lang) => void; ready: boolean }>({ lang: 'tr', setLang: () => {}, ready: true });

export function LangProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<Lang>('tr');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(KEY).then(v => { if (v === 'en' || v === 'tr') { lang = v; setValue(v); } }).finally(() => setReady(true));
  }, []);
  const ctx = useMemo(() => ({
    lang: value, ready,
    setLang: (l: Lang) => { lang = l; setValue(l); AsyncStorage.setItem(KEY, l).catch(() => {}); },
  }), [value, ready]);
  return <Context.Provider value={ctx}>{children}</Context.Provider>;
}

export const useLang = () => useContext(Context);
