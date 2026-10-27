import { useEffect, useState } from 'react';
import { consent, onConsentChange, setConsent } from '../lib/analytics';
import { Link } from '../lib/navigation';
import { vakifApiEnabled } from '../lib/vakifApi';

/** İzin bandı: ziyaretçi karar verene kadar hiçbir olay gönderilmez. Karar "Hesabım" ve aydınlatma sayfasından değişir. */
export function ConsentBanner() {
  const [state, setState] = useState(consent);
  useEffect(() => onConsentChange(() => setState(consent())), []);
  if (!vakifApiEnabled() || state !== null) return null;
  return <aside className="consent-banner" role="dialog" aria-live="polite" aria-labelledby="consent-title">
    <div><strong id="consent-title">Keşfini birlikte geliştirelim mi?</strong>
      <p>İzin verirsen hangi eserlere baktığını ve nasıl keşfettiğini (anlatım biçimi, okuma, arama, harita) adın ve IP adresin olmadan kaydederiz. Bunu siteyi geliştirmek ve sana eser önermek için kullanırız. <Link to="/gizlilik">Ayrıntılar</Link></p></div>
    <div className="consent-actions">
      <button className="button gold" onClick={() => setConsent('granted')}>İzin ver</button>
      <button className="button line" onClick={() => setConsent('denied')}>Hayır, teşekkürler</button>
    </div>
  </aside>;
}
