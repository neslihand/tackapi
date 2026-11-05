// Ön yüzle (frontend/src/lib/navigation.tsx) aynı hash tabanlı yönlendirme; sorgu dizesi de okunur.
import { useEffect, useState, type AnchorHTMLAttributes } from 'react';

export function navigate(path: string) { window.location.hash = path; }
export function useRoute() {
  const [route, setRoute] = useState(window.location.hash.slice(1) || '/');
  useEffect(() => {
    const update = () => { setRoute(window.location.hash.slice(1) || '/'); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  const [path, query = ''] = route.split('?');
  return { path, params: new URLSearchParams(query) };
}
/** Sayfadaki filtreyi adres çubuğuna yazar (geri tuşu ve paylaşılabilir bağlantı için), sayfayı kaydırmadan. */
export function replaceQuery(path: string, params: Record<string, string | number | boolean | null | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '' && v !== false) p.set(k, String(v));
  const next = `#${path}${p.toString() ? `?${p}` : ''}`;
  if (next !== window.location.hash) history.replaceState(null, '', next);
}
export function Link({ to, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return <a href={`#${to}`} {...rest}>{children}</a>;
}
