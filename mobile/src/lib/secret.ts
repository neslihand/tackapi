// The session key, kept in the phone's keychain/keystore (expo-secure-store). The browser build uses secret.web.ts.
import * as SecureStore from 'expo-secure-store';

const KEY = 'tackapi.session';
export const readSecret = () => SecureStore.getItemAsync(KEY).catch(() => null);
export const writeSecret = (value: string) => SecureStore.setItemAsync(KEY, value).catch(() => {});
export const clearSecret = () => SecureStore.deleteItemAsync(KEY).catch(() => {});
