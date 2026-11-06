import { useEffect, useRef, type ReactNode } from 'react';
import { BookA, BookOpen, Camera, Compass, HelpCircle, House, Info, MapPin, Medal, Puzzle, Search, Settings, ShieldCheck, Smartphone, Stamp, UserRound, X } from 'lucide-react';
import { Brand } from './UI';
import { LangSwitch } from './LangSwitch';
import { useAccount } from '../lib/account';
import { Link } from '../lib/navigation';
import { t } from '../lib/i18n';
import { vakifApiEnabled } from '../lib/vakifApi';
import '../sidemenu.css';

type Item = [to: string, label: string, icon: ReactNode];

// The side menu, after Google Arts & Culture's drawer, opened from the button at the left of the top bar on every
// screen size: the search, every page in three named groups, and the visitor's account with the language at the foot.
// The page being read is marked; a link, the close button, Esc or the shade around it closes it.
export function SideMenu({ route, onClose, onSearch }: { route: string; onClose: () => void; onSearch: () => void }) {
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
  const groups: [string, Item[]][] = [
    [t('Keşfet', 'Explore'), [['/', t('Ana Sayfa', 'Home'), <House />], ['/kesfet', t('Eserleri Keşfet', 'Explore the Collection'), <Compass />], ['/harita', t('Miras Haritası', 'Heritage Map'), <MapPin />],
      ['/kamera', t('Kamera ile Keşfet', 'Discover with the Camera'), <Camera />],
      ...(api ? [['/makaleler', t('Okuma Odası', 'Reading Room'), <BookOpen />], ['/terimler', t('Terimler Sözlüğü', 'Glossary'), <BookA />]] as Item[] : [])]],
    [t('Oyna & Öğren', 'Play & Learn'), [['/oyun', t('Oyna & Öğren', 'Play & Learn'), <Puzzle />], ['/oyun/quiz', t('Bilgi Yarışması', 'Knowledge Quiz'), <HelpCircle />],
      ['/pasaport', t('Miras Pasaportum', 'My Heritage Passport'), <Stamp />], ['/basarimlar', t('Madalyonlar', 'Medallions'), <Medal />]]],
    [t('Proje', 'Project'), [['/uygulama', t('Mobil Uygulama', 'Mobile App'), <Smartphone />], ['/hakkinda', t('Proje & Kaynaklar', 'Project & Sources'), <Info />],
      // the admin page is listed only in the browser-only demo; with the backend, works are managed in the admin panel
      api ? ['/gizlilik', t('Gizlilik ve veriler', 'Privacy and data'), <ShieldCheck />] : ['/yonetim', t('Demo Yönetim Paneli', 'Demo Admin Panel'), <Settings />]]],
  ];
  // the page being read: the longest place the route starts with (the quiz before Oyna & Öğren, an article in the room)
  const under = (to: string) => to === '/' ? route === '/' : route === to || route.startsWith(`${to}/`) || (to === '/makaleler' && route.startsWith('/makale/'));
  const active = groups.flatMap(([, items]) => items).filter(([to]) => under(to)).sort((a, b) => b[0].length - a[0].length)[0]?.[0];
  const user = account.user;
  const initial = (user?.display_name || user?.email || '?').trim().charAt(0).toLocaleUpperCase('tr-TR');
  return <dialog ref={ref} id="side-menu" className="side-menu" aria-label={t('Site menüsü', 'Site menu')}
    onCancel={e => { e.preventDefault(); close.current(); }}
    onClick={e => { if (e.target === e.currentTarget || (e.target as HTMLElement).closest('a')) close.current(); }}>
    <div className="sm-head">
      <button type="button" className="sm-close" onClick={() => close.current()} aria-label={t('Menüyü kapat', 'Close the menu')}><X size={20} aria-hidden="true" /></button>
      <Brand compact />
    </div>
    <button type="button" className="sm-search" onClick={onSearch}><Search size={17} aria-hidden="true" /><span>{t('Eser veya şehir ara', 'Search for a work or a city')}</span><kbd aria-hidden="true">/</kbd></button>
    <nav className="sm-body" aria-label={t('Tüm sayfalar', 'All pages')}>
      {groups.map(([title, items]) => <section key={title} className="sm-group" aria-label={title}>
        <p className="sm-label" aria-hidden="true">{title}</p>
        <ul>{items.map(([to, label, icon]) => <li key={to}>
          <Link to={to} className={to === active ? 'on' : ''} aria-current={to === active ? 'page' : undefined}><span aria-hidden="true">{icon}</span>{label}</Link>
        </li>)}</ul>
      </section>)}
    </nav>
    <div className="sm-foot">
      {account.enabled && <Link className={`sm-account ${['/hesabim', '/giris'].includes(route) ? 'on' : ''}`} to={user ? '/hesabim' : '/giris'} aria-current={['/hesabim', '/giris'].includes(route) ? 'page' : undefined}>
        <span className="sm-avatar" aria-hidden="true">{user ? initial : <UserRound size={18} />}</span>
        <span><b>{user ? user.display_name || t('Hesabım', 'My account') : t('Giriş yap', 'Sign in')}</b><small>{user ? t('Hesabım', 'My account') : t('Pasaportun her cihazda', 'Your passport on every device')}</small></span>
      </Link>}
      <LangSwitch />
    </div>
  </dialog>;
}
