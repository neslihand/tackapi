import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowUpRight, Download, X } from 'lucide-react';
import { apkUrl, features, QrCode, type AppFeature } from './MobileApp';
import { Link } from '../lib/navigation';
import { t } from '../lib/i18n';
import { STAMPED_EVENT, useProgress } from '../lib/store';
import { useAccount } from '../lib/account';
import { consent, track } from '../lib/analytics';
import { vakifApiEnabled } from '../lib/vakifApi';
import { eligible, interest, localDay, markShown, parsePromo, PROMO_KEY, snooze, turnOff, visit, type PromoState } from '../lib/appPromo';

// The mobile app, offered to a visitor who keeps coming back (when and how often: lib/appPromo.ts). A small card in a
// corner, never a pop-up over the page: it takes no focus, closes with one tap, goes when the page changes and never
// shows while the consent banner, the menu, the search or the chat is open. iPhones are left alone (the app is Android
// only for now). Nothing about it is sent anywhere except the usual consented events (app_promo).
type Moment = 'stamp' | 'passport';
const NAMED: AppFeature[] = ['stamp', 'offline', 'audio'];
const BUSY = 'dialog[open], [aria-modal="true"], .chat-panel.open, .consent-banner';

function load(): PromoState | null {
  try { return parsePromo(localStorage.getItem(PROMO_KEY)); } catch { return null; }
}
function save(state: PromoState) {
  try { localStorage.setItem(PROMO_KEY, JSON.stringify(state)); } catch { /* storage off: the card is never offered */ }
}
const platform = () => {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  return { ios: /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1), android: /Android/i.test(ua) };
};

export function AppPromo({ route }: { route: string }) {
  const { progress } = useProgress();
  const account = useAccount();
  const [shown, setShown] = useState<Moment | null>(null);
  const card = useRef<HTMLElement>(null);
  const latest = useRef(progress);
  latest.current = progress;
  const stamps = Object.keys(progress.discovered).length;

  // today counts as a day the site was opened
  useEffect(() => { const state = load(); if (state) save(visit(state, localDay(new Date()))); }, []);

  function offer(moment: Moment, delay: number) {
    let tries = 0;
    let timer = setTimeout(function attempt() {
      const state = load(), today = localDay(new Date());
      if (!state || platform().ios || !eligible(state, interest(latest.current), today)) return;
      if ((vakifApiEnabled() && consent() === null) || document.querySelector(BUSY)) {
        if (++tries < 8) timer = setTimeout(attempt, 4000);   // wait for the visitor to finish there, then try again
        return;
      }
      save(markShown(state, today));
      setShown(moment);
      track('app_promo', undefined, { action: 'shown', trigger: moment });
    }, delay);
    return () => clearTimeout(timer);
  }
  // the moments: just after stamping a work (once the stamp's own message has gone), or looking at the passport
  useEffect(() => {
    let cancel = () => {};
    const stamped = () => { cancel(); cancel = offer('stamp', 5500); };
    window.addEventListener(STAMPED_EVENT, stamped);
    return () => { window.removeEventListener(STAMPED_EVENT, stamped); cancel(); };
  }, []);
  useEffect(() => {
    setShown(null);   // a new page takes the card away (it already counts as shown)
    if (route === '/pasaport' || route === '/basarimlar') return offer('passport', 2500);
  }, [route]);
  // the chat button on phones rises above the card, as it does above the consent banner
  useEffect(() => {
    const node = card.current, root = document.documentElement;
    if (!node) return;
    const observer = new ResizeObserver(() => root.style.setProperty('--promo-space', `${node.offsetHeight + 12}px`));
    observer.observe(node);
    return () => { observer.disconnect(); root.style.removeProperty('--promo-space'); };
  }, [shown]);

  if (!shown) return null;
  const today = localDay(new Date());
  const close = (action: 'later' | 'never' | 'open' | 'download') => {
    const state = load();
    if (state) save(action === 'later' ? snooze(state, today) : turnOff(state));
    track('app_promo', undefined, { action, trigger: shown });
    // the download starts from the link first, then the card goes
    if (action === 'download') setTimeout(() => setShown(null), 1200);
    else setShown(null);
  };
  const keys = (event: KeyboardEvent) => { if (event.key === 'Escape') close('later'); };
  const url = apkUrl();
  const { android } = platform();
  const named = features().filter(([key]) => NAMED.includes(key));
  return <aside ref={card} className="app-promo" aria-labelledby="app-promo-title" onKeyDown={keys}>
    <button type="button" className="app-promo-close" onClick={() => close('later')} aria-label={t('Şimdi değil, kapat', 'Not now, close')}><X size={18} aria-hidden="true" /></button>
    <p className="app-promo-kicker">{t('MOBİL UYGULAMA', 'THE MOBILE APP')}</p>
    <h2 id="app-promo-title" aria-live="polite">{stamps
      ? <>{t(`${stamps} eseri mühürledin.`, `You have stamped ${stamps} ${stamps === 1 ? 'work' : 'works'}.`)} <em>{t('Sıradakini yerinde bas.', 'Press the next one on site.')}</em></>
      : <>{t('Keşfin sürüyor.', 'Your discovery goes on.')} <em>{t('Bir sonrakini yerinde yaşa.', 'Live the next one on site.')}</em></>}</h2>
    <p className="app-promo-text">{t('Uygulamada bir eserin yanına gittiğinde pasaportun kendiliğinden mühürlenir; hikâyesini yürürken dinlersin.', 'In the app your passport is stamped when you reach a work, and you listen to its story as you walk.')}
      {account.user && <> {t('Aynı hesapla girersen mühürlerin orada da seninle.', 'Sign in with the same account and your stamps come with you.')}</>}</p>
    <ul className="app-promo-features">{named.map(([key, icon, name]) => <li key={key}><span aria-hidden="true">{icon}</span>{name}</li>)}</ul>
    <div className="app-promo-get">
      {url && !android && <figure className="app-promo-qr"><QrCode value={url} label={t('Android uygulamasını indirme bağlantısının QR kodu', 'QR code for the Android app download link')} />
        <figcaption>{t('Telefonunun kamerasıyla okut.', 'Scan it with your phone’s camera.')}</figcaption></figure>}
      <div className="app-promo-actions">
        {url && android
          ? <a className="button gold" href={url} download onClick={() => close('download')}><Download size={17} aria-hidden="true" /> {t('Android için indir', 'Download for Android')}</a>
          : <Link className="button gold" to="/uygulama" onClick={() => close('open')}>{t('Uygulamayı tanı', 'Meet the app')} <ArrowUpRight size={17} aria-hidden="true" /></Link>}
        <button type="button" className="app-promo-never" onClick={() => close('never')}>{t('Bir daha gösterme', 'Don’t show this again')}</button>
      </div>
    </div>
  </aside>;
}
