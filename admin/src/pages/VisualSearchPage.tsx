import { useState } from 'react';
import { api } from '../lib/api';
import { PageHead } from '../components/UI';
import { VisualSearch } from '../public/VisualSearch';
import type { Lang } from '../public/model';
import '../public/public.css';

/** Görselle aramayı ziyaretçinin göreceği bileşenle dener; benzerlik puanları ve eşleşen kitap fotoğrafı da görünür. */
export function VisualSearchPage() {
  const [lang, setLang] = useState<Lang>('tr');
  return <>
    <PageHead kicker="Ziyaretçi özelliği" title="Görselle arama"
      actions={<div className="pv-segmented" role="group" aria-label="Dil">{(['tr', 'en'] as Lang[]).map(l => <button key={l} className={lang === l ? 'active' : ''} aria-pressed={lang === l} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}</div>}>
      Bir eser fotoğrafı yükleyin; site fotoğrafı kitaplardaki fotoğraflarla karşılaştırıp eseri bulur. Yalnızca yayındaki eserlerin yayımlanmış fotoğraflarıyla karşılaştırılır. Fotoğrafı henüz vektöre çevrilmemiş eserler bulunamaz (<code>python visual_search.py</code>).
    </PageHead>
    <div className="pv vs-admin"><VisualSearch lang={lang} showScores search={file => api.visualSearch(file, lang)} hrefFor={slug => `#/onizleme/${encodeURIComponent(slug)}`} /></div>
  </>;
}
