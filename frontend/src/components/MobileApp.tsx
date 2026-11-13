import { useMemo, useRef, type ReactNode } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { encode } from 'uqr';
import { ArrowUpRight, BellRing, Compass, Download, Headphones, Navigation, Play, Puzzle, Route, ScanLine, Smartphone, Stamp, Sun, UserRound, WifiOff } from 'lucide-react';
import { Chapter } from './PlayScenes';
import { PageHeading, Scene } from './UI';
import { Link } from '../lib/navigation';
import { t } from '../lib/i18n';
import { useContent } from '../lib/contentStore';
import { useAccount } from '../lib/account';
import '../mobileapp.css';

// The mobile app (../mobile, Expo): what the phone adds to the site and where to get it, as a chapter of the home page
// and as its own page (/uygulama). The Android build is an APK from EAS (docs/mobile/README.md); its address comes from
// VITE_MOBILE_APK_URL. Until there is one the section says the app is on its way instead of offering a download.
export const apkUrl = () => String(import.meta.env?.VITE_MOBILE_APK_URL ?? '').trim();

const title = () => <>{t('Kapı,', 'The gate,')} <em>{t('cebinde.', 'in your pocket.')}</em></>;
const lede = () => t('Sitede kapıyı ekrandan aralarsın; uygulamayla kapının önünde durursun. Bir eserin yanına gittiğinde pasaportun mühürlenir, hikâyesini yürürken dinlersin.', 'On the site you open the door from a screen; with the app you stand before it. Reach a work and your passport is stamped; listen to its story as you walk.');

// Only what the phone brings and the site cannot: the app's own features (docs/mobile/mobil-plan.md §1). The keys pick
// the few the app's card (AppPromo.tsx) names.
export type AppFeature = 'stamp' | 'near' | 'route' | 'audio' | 'offline' | 'daily';
export const features = (): [AppFeature, ReactNode, string, string][] => [
  ['stamp', <Stamp />, t('Yerinde mühür', 'On-site stamp'), t('Bir eserin yaklaşık 150 metre yakınına geldiğinde pasaportuna altın bir “yerinde” mühür basılır.', 'Come within about 150 metres of a work and a gold “on site” stamp is pressed into your passport.')],
  ['near', <Navigation />, t('Yakınımdaki kapılar', 'Gates near me'), t('Sana en yakın eserler, uzaklıkları ve telefonunun haritasıyla yol tarifi.', 'The works nearest you, how far away they are and directions in your phone’s map app.')],
  ['route', <Route />, t('Rota yürüyüşü', 'Route walk'), t('Bir keşif sezonunu durak durak yürü; vardığında mühür kendiliğinden basılır.', 'Walk a discovery season stop by stop; the stamp is pressed as you arrive.')],
  ['audio', <Headphones />, t('Sesli rehber', 'Audio guide'), t('Anlatımları telefonun sesi okur; gezerken ekrana bakmadan dinlersin.', 'Your phone reads the narrations aloud, so you can listen as you walk without looking at the screen.')],
  ['offline', <WifiOff />, t('Çevrimdışı okuma', 'Offline reading'), t('Açtığın eserler ve indirdiğin rotalar telefonunda kalır; çekmeyen bir avluda da okursun.', 'The works you open and the routes you download stay on your phone, so you can read in a courtyard with no signal.')],
  ['daily', <BellRing />, t('Günün kapısı', 'Gate of the day'), t('Her sabah bir eser ve kitabından kısa bir cümle bildirim olarak gelir.', 'Every morning a work and a short line from its book arrive as a notification.')],
];

// the app's five tabs (mobile/src/app/(tabs)/_layout.tsx), the first one open, and the reading modes of its work screen
// (mobile/src/app/eser/[slug].tsx)
const tabs = (): [ReactNode, string][] => [[<Sun />, t('Bugün', 'Today')], [<Compass />, t('Keşfet', 'Explore')], [<ScanLine />, t('Tara', 'Scan')], [<Puzzle />, t('Oyna', 'Play')], [<UserRound />, t('Profil', 'Profile')]];
const modes = () => [t('Özet', 'Summary'), t('Hikâye', 'Story'), t('Çocuk', 'Kids'), t('Kitap', 'Book')];

// A phone drawn in the app's own colours, open on a work of the collection: its picture takes the on-site stamp when
// the phone comes into view, and the audio guide plays under its text.
function Phone({ work }: { work?: { name: string; city: string; image: string; description: string } }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.5 });
  const still = Boolean(useReducedMotion());
  const pressed = { opacity: 1, scale: 1, rotate: -12 };
  return <div ref={ref} className="ma-phone" role="img" aria-label={t('TAÇKAPI uygulamasında bir eser: fotoğrafında yerinde mühür, altında sesli rehber.', 'A work in the TAÇKAPI app: an on-site stamp on its photo and the audio guide beneath it.')}>
    <div className="ma-screen" aria-hidden="true">
      <div className="ma-status"><span>09:41</span><i /><span className="ma-signal"><b /><b /><b /></span></div>
      <div className="ma-bar"><svg viewBox="0 0 32 42"><path d="M3 39V18Q3 6 16 2Q29 6 29 18V39M8 39V19Q8 10 16 7Q24 10 24 19V39M16 15V39" /></svg><b>TAÇKAPI</b></div>
      <div className="ma-work">
        <div className="ma-art">
          {work?.image && <img src={work.image} alt="" loading="lazy" />}
          <motion.span className="ma-stamp" initial={still ? pressed : { opacity: 0, scale: 1.9, rotate: -32 }} animate={seen || still ? pressed : undefined}
            transition={{ delay: 0.45, duration: 0.4, ease: [0.2, 0.9, 0.3, 1.25] }}><b>{t('YERİNDE', 'ON SITE')}</b><i>{t('mühür', 'stamp')}</i></motion.span>
        </div>
        {work && <><small>{work.city}</small><strong>{work.name}</strong></>}
        <span className="ma-modes">{modes().map((mode, i) => <span key={mode} className={i === 0 ? 'on' : ''}>{mode}</span>)}</span>
        {work?.description && <p className="ma-text">{work.description}</p>}
        <div className="ma-audio"><span className="ma-play"><Play /></span><span>{t('Sesli rehber', 'Audio guide')}</span><i className="ma-wave"><b /><b /><b /><b /><b /><b /></i></div>
      </div>
      <div className="ma-tabs">{tabs().map(([icon, label], i) => <span key={label} className={i === 0 ? 'on' : ''}>{icon}<small>{label}</small></span>)}</div>
    </div>
  </div>;
}

// The download address as a QR code, for a visitor reading on a computer: the dark modules as one path on ivory, inside
// the four-module quiet zone the standard asks for (uqr's border, part of `size`).
export function QrCode({ value, label }: { value: string; label: string }) {
  const { size, data } = useMemo(() => encode(value, { ecc: 'M', border: 4 }), [value]);
  const modules = data.flatMap((row, y) => row.map((dark, x) => dark ? `M${x} ${y}h1v1h-1z` : '')).join('');
  return <svg className="ma-qr-code" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges">
    <rect width={size} height={size} fill="#fffdf8" /><path d={modules} fill="#17201c" />
  </svg>;
}

// The phone beside what the app adds, then how to get it.
function MobileAppBody() {
  const { artifacts } = useContent();
  const account = useAccount();
  // a work with a picture, but not today's (the home page's closing section brings that one forward)
  const pictured = artifacts.filter(a => a.image);
  const work = pictured.length ? pictured[(Math.floor(Date.now() / 86400000) + 3) % pictured.length] : undefined;
  const url = apkUrl();
  return <div className="ma-body">
    <Phone work={work} />
    <div className="ma-side">
      <ul className="ma-features">{features().map(([, icon, name, text]) => <li key={name}><span aria-hidden="true">{icon}</span><div><b>{name}</b><p>{text}</p></div></li>)}</ul>
      <div className="ma-get">
        {/* on a computer the phone reads the address from the screen; on a phone the button is the way (the code is hidden) */}
        {url && <figure className="ma-qr"><QrCode value={url} label={t('Android uygulamasını indirme bağlantısının QR kodu', 'QR code for the Android app download link')} />
          <figcaption>{t('Telefonunun kamerasıyla okut, indirme başlasın.', 'Scan it with your phone’s camera to start the download.')}</figcaption></figure>}
        <div className="ma-get-main">
          {url
            ? <a className="ma-key" href={url} download><Download size={18} aria-hidden="true" /><span>{t('Android için indir', 'Download for Android')}</span><small>APK</small></a>
            : <p className="ma-soon"><Smartphone size={20} aria-hidden="true" /><span><b>{t('Android sürümü yolda.', 'The Android version is on its way.')}</b> {t('İndirme bağlantısı burada açılacak.', 'The download link will appear here.')}</span></p>}
          <p className="ma-note">{t('Uygulamada da aynı hesapla giriş yaparsın; mühürlerin ve madalyonların iki yerde de seninle olur.', 'Sign in with the same account in the app, and your stamps and medallions go with you in both places.')}
            {account.enabled && !account.user && <> <Link to="/giris">{t('Giriş yap ya da hesap aç', 'Sign in or open an account')}<ArrowUpRight size={15} aria-hidden="true" /></Link></>}</p>
        </div>
      </div>
    </div>
  </div>;
}

/** The home page's chapter on the app, after the passport. */
export function MobileAppChapter() {
  return <Chapter id="mobil" tone="ivory" kicker={t('MOBİL UYGULAMA', 'THE MOBILE APP')} titleId="mobile-title" className="hp-mobile" title={title()} lede={<p>{lede()}</p>}>
    <MobileAppBody />
  </Chapter>;
}

/** The same, as a page of its own (/uygulama) for the side menu and the footer. */
export function MobileAppPage() {
  return <Scene className="ma-scene"><div className="page-shell ma-page">
    <PageHeading kicker={t('MOBİL UYGULAMA', 'THE MOBILE APP')} title={title()}>{lede()}</PageHeading>
    <MobileAppBody />
  </div></Scene>;
}
