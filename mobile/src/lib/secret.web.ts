// The browser build (development on the computer) has no secure store; the session key stays in this browser's
// storage. Only for following development: the phone keeps it in the keychain (secret.ts).
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'esik:session:web';
export const readSecret = () => AsyncStorage.getItem(KEY).catch(() => null);
export const writeSecret = (value: string) => AsyncStorage.setItem(KEY, value).catch(() => {});
export const clearSecret = () => AsyncStorage.removeItem(KEY).catch(() => {});
