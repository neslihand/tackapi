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

const root = ReactDOM.createRoot(document.getElementById('root')!);
// The collection comes from the backend: wait for it once, then the site runs as a read-only feed.
// If the backend cannot be reached the page says so (and how to start it) instead of falling back to demo data.
// A change of language loads the collection again in that language and draws the site afresh (key=lang).
function start() {
  root.render(<div className="page-shell loading-state" role="status">{t('Eserler yükleniyor…', 'Loading the collection…')}</div>);
  loadPilotFeed().then(
    feed => root.render(<React.StrictMode><App key={currentLang()} artifactFeed={feed} /></React.StrictMode>),
    (error: Error) => root.render(<main className="page-shell empty-state" role="alert"><h1>{t('Eserler arka uçtan alınamadı.', 'The collection could not be loaded from the backend.')}</h1>
      <p>{t('Arka uç çalışıyor mu? backend klasöründe:', 'Is the backend running? In the backend folder:')} <code>python -m uvicorn api:app --app-dir pipeline --port 8000</code></p>
      <p><small>{error.message}</small></p><button className="button dark" onClick={start}>{t('Yeniden dene', 'Try again')}</button></main>));
}
const local = () => root.render(<React.StrictMode><App key={currentLang()} /></React.StrictMode>);
if (vakifApiEnabled()) start();
else local();
onLangChange(() => { window.scrollTo(0, 0); if (vakifApiEnabled()) start(); else local(); });
