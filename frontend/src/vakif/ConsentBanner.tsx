import { useEffect, useState } from 'react';
import { consent, onConsentChange, setConsent } from '../lib/analytics';
import { Link } from '../lib/navigation';
import { t } from '../lib/i18n';
import { vakifApiEnabled } from '../lib/vakifApi';

/** İzin bandı: ziyaretçi karar verene kadar hiçbir olay gönderilmez. Karar "Hesabım" ve aydınlatma sayfasından değişir. */
export function ConsentBanner() {
  const [state, setState] = useState(consent);
  useEffect(() => onConsentChange(() => setState(consent())), []);
  if (!vakifApiEnabled() || state !== null) return null;
  return <aside className="consent-banner" role="dialog" aria-live="polite" aria-labelledby="consent-title">
    <div><strong id="consent-title">{t('Keşfini birlikte geliştirelim mi?', 'Shall we improve your discovery together?')}</strong>
      <p>{t('İzin verirsen hangi eserlere baktığını ve nasıl keşfettiğini (anlatım biçimi, okuma, arama, harita) adın ve IP adresin olmadan kaydederiz. Bunu siteyi geliştirmek ve sana eser önermek için kullanırız.', 'With your permission we record which works you look at and how you explore them (narration style, reading, search, map), without your name or IP address. We use this to improve the site and to recommend works to you.')} <Link to="/gizlilik">{t('Ayrıntılar', 'Details')}</Link></p></div>
    <div className="consent-actions">
      <button className="button gold" onClick={() => setConsent('granted')}>{t('İzin ver', 'Allow')}</button>
      <button className="button line" onClick={() => setConsent('denied')}>{t('Hayır, teşekkürler', 'No, thank you')}</button>
    </div>
  </aside>;
}
