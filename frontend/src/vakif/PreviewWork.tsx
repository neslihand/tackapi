import { useEffect, useMemo, useRef, useState } from 'react';
import { ArtifactCard } from '../components/ArtifactCard';
import { adaptArtifactFeed } from '../lib/artifactAdapter';
import { currentLang, setLang, t, type Lang } from '../lib/i18n';
import { toRecord, type VakifItem } from '../lib/vakifApi';
import { VakifWork } from './VakifStory';
import type { PublicDetail, PublicItem } from './model';

type Preview = { item: PublicItem; detail: PublicDetail };
const TOKEN_KEY = 'tackapi:admin-token';   // the panel keeps its key under this name (admin/src/lib/api.ts)

// the panel's address, the only other page allowed to hand over its key (same address in the single-server demo)
function panelOrigin() {
  try { return new URL(String(import.meta.env.VITE_ADMIN_URL ?? '').trim() || 'http://127.0.0.1:5174', location.href).origin; } catch { return location.origin; }
}

function sessionKey() {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}

/**
 * The admin panel's preview (admin/src/pages/Preview.tsx shows this page in a frame, at desktop and phone width): a
 * work as visitors will see it, drafts and photos waiting for approval included, drawn by the site's own work page so
 * the preview never falls behind the site's design. gorunum=kart shows only its card in the collection.
 * The record comes from GET /api/admin/preview/{slug} with the panel's key: read from this tab when the panel runs on
 * the same address (/yonetim/), otherwise handed over by the panel with postMessage. Nothing here is counted.
 */
export function PreviewWork({ slug, query }: { slug: string; query: string }) {
  const params = new URLSearchParams(query);
  const lang: Lang = params.get('lang') === 'en' ? 'en' : 'tr';
  const drafts = params.get('drafts') === '1';
  const card = params.get('gorunum') === 'kart';
  const [token, setToken] = useState(sessionKey);
  const [data, setData] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const box = useRef<HTMLDivElement>(null);

  // the panel's language for this page only; the visitor's own choice in this browser stays as it was
  useEffect(() => { setLang(lang, false); }, [lang]);
  useEffect(() => {
    if (token) return;
    const allowed = [location.origin, panelOrigin()];
    const take = (e: MessageEvent) => {
      if (allowed.includes(e.origin) && e.data?.type === 'tackapi:preview-token' && typeof e.data.token === 'string') setToken(e.data.token);
    };
    window.addEventListener('message', take);
    window.parent?.postMessage({ type: 'tackapi:preview-ready' }, '*');   // carries nothing; the panel answers to this page's address only
    const late = setTimeout(() => setError(t('Önizleme için yönetim panelinden açılmalı.', 'The preview has to be opened from the admin panel.')), 4000);
    return () => { window.removeEventListener('message', take); clearTimeout(late); };
  }, [token]);
  useEffect(() => {
    if (!token || currentLang() !== lang) return;
    let alive = true;
    setError('');
    fetch(`/api/admin/preview/${encodeURIComponent(slug)}?lang=${lang}${drafts ? '&drafts=1' : ''}`, { headers: { accept: 'application/json', Authorization: `Bearer ${token}` } })
      .then(async r => {
        if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { detail?: string } | null)?.detail || t(`Sunucu ${r.status} döndü.`, `The server returned ${r.status}.`));
        return r.json() as Promise<Preview>;
      })
      .then(d => { if (alive) setData(d); }, e => { if (alive) setError((e as Error).message); });
    return () => { alive = false; };
  }, [token, slug, lang, drafts]);
  // the card's frame in the panel takes the card's height
  useEffect(() => {
    const el = box.current;
    if (!card || !el || typeof ResizeObserver === 'undefined') return;
    const tell = () => window.parent?.postMessage({ type: 'tackapi:preview-height', height: Math.ceil(el.getBoundingClientRect().height) }, '*');
    const watch = new ResizeObserver(tell);
    watch.observe(el); tell();
    return () => watch.disconnect();
  });
  const artifact = useMemo(() => {
    if (!data) return null;
    const feed = adaptArtifactFeed({ schemaVersion: 1, items: [toRecord(data.item as unknown as VakifItem)], seasons: [], quizQuestions: [] });
    return feed.ok ? feed.artifacts[0] : null;
  }, [data]);

  if (error) return <div className="page-shell empty-state" role="alert"><h1>{t('Önizleme açılamadı.', 'The preview could not be opened.')}</h1><p>{error}</p></div>;
  if (!data || !artifact) return <div className="page-shell loading-state" role="status">{t('Önizleme hazırlanıyor…', 'Preparing the preview…')}</div>;
  // inside the collection's own grid, so it takes the same width and shortened text as on the Keşfet page
  if (card) return <div className="explore-page preview-card-only" ref={box}><div className="ex-lower"><ul className="ex-results ex-results-cards"><li><ArtifactCard artifact={artifact} number={t('ESER 01', 'WORK 01')} variant="catalog" eager /></li></ul></div></div>;
  return <VakifWork artifact={artifact} item={data.item} detail={data.detail} />;
}
