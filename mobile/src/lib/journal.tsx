// Hatıra Defteri: the visitor's own notes and photos attached to a work. Kept only on this device (not in the
// account, not sent to the server): a memory is personal, and the photos may show people.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { t } from './i18n';
import { dropPhoto, keepPhoto, pickBase64 } from './photos';

export type Memory = { id: string; slug: string; date: string; note: string; photo: string | null; onSpot: boolean };
const KEY = 'tackapi:journal:v1';
export const NOTE_MAX = 1000;

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

function parse(value: string | null): Memory[] {
  try {
    const data = JSON.parse(value ?? '[]');
    return Array.isArray(data) ? data.filter((m): m is Memory => typeof m?.id === 'string' && typeof m?.slug === 'string' && typeof m?.date === 'string') : [];
  } catch { return []; }
}

/** Camera or gallery; null when the visitor cancels. Throws when permission is refused. */
export async function pickPhoto(source: 'camera' | 'library'): Promise<ImagePicker.ImagePickerAsset | null> {
  const permission = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error(t('İzin verilmedi. Ayarlardan izin verebilirsin.', 'Permission was not given. You can allow it in Settings.'));
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6, exif: false, base64: pickBase64, allowsEditing: false };
  const shot = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  return shot.canceled ? null : shot.assets[0] ?? null;
}

type Journal = {
  memories: Memory[]; ready: boolean;
  of: (slug: string) => Memory[];
  add: (m: { slug: string; note: string; photo: ImagePicker.ImagePickerAsset | null; onSpot: boolean }) => Promise<void>;
  remove: (id: string) => void;
};
const Context = createContext<Journal | null>(null);

export function JournalProvider({ children }: { children: ReactNode }) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [ready, setReady] = useState(false);
  const loaded = useRef(false);
  useEffect(() => { AsyncStorage.getItem(KEY).then(v => setMemories(parse(v)), () => {}).finally(() => { loaded.current = true; setReady(true); }); }, []);
  useEffect(() => { if (loaded.current) AsyncStorage.setItem(KEY, JSON.stringify(memories)).catch(() => {}); }, [memories]);

  const add = useCallback<Journal['add']>(async ({ slug, note, photo, onSpot }) => {
    const id = newId();
    const kept = photo ? await keepPhoto(photo, id) : null;
    setMemories(list => [{ id, slug, date: new Date().toISOString(), note: note.trim().slice(0, NOTE_MAX), photo: kept, onSpot }, ...list]);
  }, []);
  const remove = useCallback((id: string) => setMemories(list => {
    dropPhoto(list.find(m => m.id === id)?.photo ?? null);
    return list.filter(m => m.id !== id);
  }), []);
  const value = useMemo<Journal>(() => ({ memories, ready, add, remove, of: slug => memories.filter(m => m.slug === slug) }), [memories, ready, add, remove]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useJournal() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('JournalProvider eksik');
  return ctx;
}
