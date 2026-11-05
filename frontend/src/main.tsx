import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { loadPilotFeed, vakifApiEnabled } from './lib/vakifApi';
import { currentLang, onLangChange, t } from './lib/i18n';
import './styles.css';
import './play.css';
import './explore.css';
import './map.css';
import './hero.css';
import './accessibility.css';
import './theme.css';
import './story.css';
import './medals.css';
import './chat.css';
import './ring.css';
import './motion.css';
import './scenes.css';
import './storytelling.css';
import './entrance.css';
import './playroom.css';
import './home.css';
import './catalogue.css';
import './atlas.css';
import './camera.css';
import './facade.css';
import './footer.css';
import './chrome.css';

// A work whose photo is missing on the server: its picture is marked and hidden (styles.css), so the card's drawn ground
// shows instead of the browser's broken-image icon; a later successful load (a new src) shows it again.
document.addEventListener('error', event => { if (event.target instanceof HTMLImageElement) event.target.dataset.broken = ''; }, true);
document.addEventListener('load', event => { if (event.target instanceof HTMLImageElement) delete event.target.dataset.broken; }, true);

const root = ReactDOM.createRoot(document.getElementById('root')!);
// The collection comes from the backend: wait for it once, then the site runs as a read-only feed.
// If the backend cannot be reached the page says so instead of falling back to demo data; how to start the backend
// and the raw error are shown only in development, never to visitors.
// A change of language loads the collection again in that language and draws the site afresh (key=lang).
function start() {
  root.render(<div className="page-shell loading-state" role="status">{t('Eserler yükleniyor…', 'Loading the collection…')}</div>);
  loadPilotFeed().then(
    feed => root.render(<React.StrictMode><App key={currentLang()} artifactFeed={feed} /></React.StrictMode>),
    (error: Error) => root.render(<main className="page-shell empty-state" role="alert"><h1>{t('Eserler şu an yüklenemedi.', 'The collection could not be loaded right now.')}</h1>
      <p>{t('Bağlantınızı kontrol edip biraz sonra yeniden deneyin.', 'Please check your connection and try again in a moment.')}</p>
      {import.meta.env.DEV && <p><small>{t('Arka uç çalışıyor mu? backend klasöründe:', 'Is the backend running? In the backend folder:')} <code>python -m uvicorn api:app --app-dir pipeline --port 8000</code> · {error.message}</small></p>}
      <button className="button dark" onClick={start}>{t('Yeniden dene', 'Try again')}</button></main>));
}
const local = () => root.render(<React.StrictMode><App key={currentLang()} /></React.StrictMode>);
if (vakifApiEnabled()) start();
else local();
onLangChange(() => { window.scrollTo(0, 0); if (vakifApiEnabled()) start(); else local(); });
