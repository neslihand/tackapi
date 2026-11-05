import { useEffect, useRef, type ReactNode } from 'react';
import { BookA, BookOpen, Camera, Compass, HelpCircle, House, Info, MapPin, Medal, Puzzle, Settings, ShieldCheck, Smartphone, Stamp, UserRound, X } from 'lucide-react';
import { Brand } from './UI';
import { LangSwitch } from './LangSwitch';
import { useAccount } from '../lib/account';
import { Link } from '../lib/navigation';
import { t } from '../lib/i18n';
import { vakifApiEnabled } from '../lib/vakifApi';
import '../sidemenu.css';

type Item = [to: string, label: string, icon: ReactNode];

// The side menu, after Google Arts & Culture's drawer: every place on the site in three groups (discover, play and
// keep, the visitor and the project), opened from the button at the left of the top bar on every screen size. The
// page being read is marked with a gold pill; a link, the close button, Esc or the shade around it closes it.
export function SideMenu({ route, onClose }: { route: string; onClose: () => void }) {
  const account = useAccount();
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const dialog = ref.current; const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    const before = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { dialog?.close(); document.body.style.overflow = before; if (previous?.isConnected) previous.focus(); };
  }, []);
  const api = vakifApiEnabled();
  const groups: Item[][] = [
    [['/', t('Ana Sayfa', 'Home'), <House />], ['/kesfet', t('Keşfet', 'Explore'), <Compass />], ['/harita', t('Miras Haritası', 'Heritage Map'), <MapPin />],
      ['/kamera', t('Kamera ile Keşfet', 'Discover with the Camera'), <Camera />],
      ...(api ? [['/makaleler', t('Okuma Odası', 'Reading Room'), <BookOpen />], ['/terimler', t('Terimler Sözlüğü', 'Glossary'), <BookA />]] as Item[] : [])],
    [['/oyun', t('Oyna & Öğren', 'Play & Learn'), <Puzzle />], ['/oyun/quiz', t('Bilgi Yarışması', 'Knowledge Quiz'), <HelpCircle />],
      ['/pasaport', t('Miras Pasaportum', 'My Heritage Passport'), <Stamp />], ['/basarimlar', t('Madalyonlar', 'Medallions'), <Medal />]],
    [...(account.enabled ? [[account.user ? '/hesabim' : '/giris', account.user ? t('Hesabım', 'My account') : t('Giriş yap', 'Sign in'), <UserRound />]] as Item[] : []),
      ['/uygulama', t('Mobil Uygulama', 'Mobile App'), <Smartphone />],
      ['/hakkinda', t('Proje & Kaynaklar', 'Project & Sources'), <Info />],
      // the admin page is listed only in the browser-only demo; with the backend, works are managed in the admin panel
      api ? ['/gizlilik', t('Gizlilik ve veriler', 'Privacy and data'), <ShieldCheck />] : ['/yonetim', t('Demo Yönetim Paneli', 'Demo Admin Panel'), <Settings />]],
  ];
  // the page being read: the longest place the route starts with (the quiz before Oyna & Öğren, an article in the room)
  const under = (to: string) => to === '/' ? route === '/' : route === to || route.startsWith(`${to}/`) || (to === '/makaleler' && route.startsWith('/makale/'));
  const active = groups.flat().filter(([to]) => under(to)).sort((a, b) => b[0].length - a[0].length)[0]?.[0];
  return <dialog ref={ref} id="side-menu" className="side-menu" aria-label={t('Site menüsü', 'Site menu')}
    onCancel={e => { e.preventDefault(); close.current(); }}
    onClick={e => { if (e.target === e.currentTarget || (e.target as HTMLElement).closest('a')) close.current(); }}>
    <div className="sm-head">
      <button type="button" className="sm-close" onClick={() => close.current()} aria-label={t('Menüyü kapat', 'Close the menu')}><X size={22} aria-hidden="true" /></button>
      <Brand compact />
    </div>
    <nav className="sm-body" aria-label={t('Tüm sayfalar', 'All pages')}>
      {groups.map((group, i) => <ul key={i}>{group.map(([to, label, icon]) => <li key={to}>
        <Link to={to} className={to === active ? 'on' : ''} aria-current={to === active ? 'page' : undefined}><span aria-hidden="true">{icon}</span>{label}</Link>
      </li>)}</ul>)}
    </nav>
    <div className="sm-foot"><LangSwitch /></div>
  </dialog>;
}
