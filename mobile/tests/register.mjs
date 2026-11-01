// Lets `node --test` load the app's plain lib modules: a relative import without an extension is the .ts file, and
// i18n (which needs the phone's storage) is replaced by its Turkish default.
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, next) {
    if (/\/i18n$/.test(specifier)) return { url: 'data:text/javascript,export const t = tr => tr; export const currentLang = () => "tr";', shortCircuit: true };
    if (specifier.startsWith('.') && !/\.\w+$/.test(specifier)) return next(`${specifier}.ts`, context);
    return next(specifier, context);
  },
});
