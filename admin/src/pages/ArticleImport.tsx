import { useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, FilePlus2 } from 'lucide-react';
import { api } from '../lib/api';
import { ARTICLE_KIND_LABELS, overlapping, pagesLabel, wordCount } from '../lib/format';
import { Link, navigate, replaceQuery } from '../lib/navigation';
import type { ArticleKind, ArticleSourceDetail } from '../lib/types';
import { Field, Issues, PageHead, useLoad, useToast } from '../components/UI';
import { ArticleStatusBadge } from '../components/ArticleBody';

const SUGGESTED: Record<string, ArticleKind> = { city_history: 'city_history', chapter_intro: 'heritage', conclusion: 'culture' };

/**
 * Kitaptan içe aktarma: envanter kitabının eser dışı bölümleri (şehir tarihi, giriş, değerlendirme). Bölüm uzun olduğu
 * için paragraf aralığı seçilip parça parça makaleye dönüştürülür; daha önce aktarılan paragraflar işaretlidir.
 * Taslak; metin, şehir, sayfalar, kitabın yazarları ve kaynak notuyla oluşur.
 */
export function ArticleImport({ params }: { params: URLSearchParams }) {
  const sources = useLoad(() => api.articleSources(), []);
  const [section, setSection] = useState<number | null>(Number(params.get('bolum')) || null);
  const pick = (id: number) => { setSection(id); replaceQuery('/makale-aktar', { bolum: id }); };
  return <>
    <Link className="text-link back-link" to="/makaleler"><ArrowLeft size={15} /> Makaleler</Link>
    <PageHead kicker="MAKALELER" title="Kitaptan içe aktar">Envanter kitaplarının şehir tarihi, giriş ve değerlendirme bölümleri. Bir bölüm seçin,
      makaleye dönüştürmek istediğiniz paragraf aralığını işaretleyin; taslak olarak açılır, yayından önce ara başlık ekleyip düzenleyebilirsiniz.</PageHead>
    {sources.error && <p className="form-error" role="alert">{sources.error}</p>}
    <div className="import-layout">
      <nav className="source-list" aria-label="Kitap bölümleri">{sources.data?.map(s => {
        const share = s.paragraphs ? s.used_paragraphs / s.paragraphs : 0;
        return <button key={s.id} className={`source-item ${section === s.id ? 'on' : ''}`} aria-current={section === s.id ? 'true' : undefined} onClick={() => pick(s.id)}>
          <small>{s.kind_label} · {s.book_title}</small>
          <strong>{s.title_tr}</strong>
          <span className="source-progress" aria-hidden="true"><i style={{ width: `${share * 100}%` }} /></span>
          <small>{s.paragraphs} paragraf{s.page_start ? ` · s. ${s.page_start}–${s.page_end}` : ''} · {s.articles ? `${s.used_paragraphs} paragrafı ${s.articles} makalede` : 'henüz aktarılmadı'}</small>
        </button>;
      })}{sources.data && !sources.data.length && <p className="admin-help">İçe aktarılabilecek bölüm yok.</p>}</nav>
      <div className="import-main">{section ? <SectionPicker key={section} id={section} onDone={sources.reload} />
        : <div className="empty-panel"><BookOpen size={28} strokeWidth={1.2} /><p>Soldan bir kitap bölümü seçin.</p></div>}</div>
    </div>
  </>;
}

function SectionPicker({ id, onDone }: { id: number; onDone: () => void }) {
  const data = useLoad(() => api.articleSource(id), [id]);
  if (data.error) return <p className="form-error" role="alert">{data.error}</p>;
  if (!data.data) return <p role="status">Bölüm yükleniyor…</p>;
  return <Picker s={data.data} onDone={onDone} />;
}

function Picker({ s, onDone }: { s: ArticleSourceDetail; onDone: () => void }) {
  const notify = useToast();
  const firstFree = s.paragraphs.find(p => !s.used.some(u => u.from_para <= p.n && p.n <= u.to_para))?.n ?? 0;
  const [from, setFrom] = useState(firstFree);
  const [to, setTo] = useState(Math.min(firstFree + 4, s.paragraphs.length - 1));
  const [anchor, setAnchor] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<ArticleKind>(SUGGESTED[s.kind] ?? 'heritage');
  const [issues, setIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const chosen = s.paragraphs.slice(from, to + 1);
  const clash = useMemo(() => overlapping(s.used, from, to), [s.used, from, to]);
  const owner = (n: number) => s.used.find(u => u.from_para <= n && n <= u.to_para);
  // Tıklama: ilk tıklama başlangıç, ikincisi bitiş (Shift ile tıklama aralığı genişletir)
  function click(n: number, shift: boolean) {
    if (shift || anchor !== null) { const a = anchor ?? from; setFrom(Math.min(a, n)); setTo(Math.max(a, n)); setAnchor(null); }
    else { setFrom(n); setTo(n); setAnchor(n); }
  }
  async function create() {
    setBusy(true); setIssues([]);
    try {
      const a = await api.importArticle({ section_id: s.id, from_para: from, to_para: to, kind, title_tr: title.trim() || undefined });
      notify('Taslak makale oluşturuldu.'); onDone(); navigate(`/makale/${a.id}`);
    } catch (e) { setIssues([(e as Error).message]); setBusy(false); }
  }
  return <section className="admin-form">
    <fieldset><legend>{s.title_tr}</legend>
      <p className="source-byline">{s.book_title}{s.authors.length ? <><br /><small>{s.authors.join(' · ')}</small></> : null}</p>
      <p className="admin-help">Bir paragrafa tıklayıp başlangıcı, sonra bir başkasına tıklayıp bitişi seçin (Shift + tık da aralığı genişletir). Seçim: <strong>paragraf {from + 1}–{to + 1}</strong> · {chosen.length} paragraf · {wordCount(chosen.map(p => p.text).join(' ')).toLocaleString('tr-TR')} sözcük{pagesLabel(chosen) ? ` · ${pagesLabel(chosen)}` : ''}</p>
      {clash.length > 0 && <p className="admin-note">Seçimin bir kısmı daha önce aktarıldı: {clash.map(c => `“${c.title}” (${c.from_para + 1}–${c.to_para + 1})`).join(', ')}. Yine de yeni taslak oluşturabilirsiniz.</p>}
      <ol className="para-pick" aria-label="Bölümün paragrafları">{s.paragraphs.map(p => {
        const used = owner(p.n), on = p.n >= from && p.n <= to;
        return <li key={p.n} className={`${on ? 'on' : ''} ${used ? 'used' : ''} ${anchor === p.n ? 'anchor' : ''}`}>
          <button type="button" aria-pressed={on} onClick={e => click(p.n, e.shiftKey)}>
            <b>{p.n + 1}</b>
            <span>{p.text}</span>
            <small>{p.pages.length ? `s. ${p.pages.join(', ')}` : ''}{used ? <> · <ArticleStatusBadge value={used.status} /> {used.title}</> : ''}</small>
          </button></li>;
      })}</ol>
    </fieldset>
    <fieldset><legend>Taslak</legend><Issues list={issues} />
      <div className="admin-grid">
        <Field label="Başlık" hint={`Boşsa “${s.title_tr}${from === 0 && to === s.paragraphs.length - 1 ? '' : ` (${from + 1}–${to + 1})`}”`}><input maxLength={160} value={title} onChange={e => setTitle(e.target.value)} /></Field>
        <Field label="Tür"><select value={kind} onChange={e => setKind(e.target.value as ArticleKind)}>{Object.entries(ARTICLE_KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      </div>
      <div className="admin-actions"><button className="button dark" disabled={busy || !chosen.length} onClick={create}><FilePlus2 size={16} /> {chosen.length} paragraftan taslak oluştur</button></div>
    </fieldset>
  </section>;
}
