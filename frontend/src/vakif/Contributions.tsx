import { useEffect, useState, type FormEvent } from 'react';
import { ImagePlus, MessageSquareText } from 'lucide-react';
import { useAccount } from '../lib/account';
import { track } from '../lib/analytics';
import { Link } from '../lib/navigation';
import { t } from '../lib/i18n';
import './visitor.css';

type Item = { id: number; kind: 'photo' | 'text'; text_kind_label: string | null; body: string | null; author: string; created_at: string;
  image: { src: string; thumb: string; width: number | null; height: number | null } | null };

/**
 * Eser sayfasının sonundaki "Ziyaretçi katkıları": onaylanmış fotoğraf ve metinler, kitaptaki bilgiden ayrı.
 * Giriş yapan ziyaretçi katkı ekleyebilir; yönetici onaylayınca burada görünür.
 */
export function Contributions({ slug, name }: { slug: string; name: string }) {
  const { user } = useAccount();
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState<'photo' | 'text' | null>(null);
  const [textKind, setTextKind] = useState('memory');
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch(`/api/monuments/${encodeURIComponent(slug)}/contributions`).then(r => r.ok ? r.json() : []).then(setItems, () => {});
  }, [slug]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!open) return;
    setError(''); setBusy(true);
    const form = new FormData();
    form.set('kind', open);
    if (body.trim()) form.set('body', body.trim());
    if (open === 'text') form.set('text_kind', textKind);
    if (open === 'photo' && file) form.set('file', file);
    try {
      const r = await fetch(`/api/monuments/${encodeURIComponent(slug)}/contributions`, { method: 'POST', body: form, credentials: 'same-origin' });
      if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { detail?: string } | null)?.detail ?? t('Katkı gönderilemedi.', 'The contribution could not be sent.'));
      track('contribution', slug, { kind: open });
      setMessage(t('Teşekkürler! Katkın yönetici onayından sonra burada görünecek. Durumunu “Hesabım”dan izleyebilirsin.', 'Thank you! Your contribution will appear here once an administrator approves it. You can follow its status in “My account”.'));
      setOpen(null); setBody(''); setFile(null);
    } catch (e) { setError(typeof (e as Error).message === 'string' ? (e as Error).message : t('Katkı gönderilemedi.', 'The contribution could not be sent.')); }
    finally { setBusy(false); }
  }
  return <section className="v-contrib page-shell" aria-labelledby="contrib-title">
    <p className="eyebrow">{t('ZİYARETÇİ KATKILARI', 'VISITOR CONTRIBUTIONS')}</p>
    <h2 id="contrib-title">{t('Bu eserle ilgili', 'Your story')} <em>{t('senin hikâyen', 'about this work')}</em></h2>
    <p className="v-note">{t('Ziyaretçilerin eklediği fotoğraf ve anılar. Kitaptaki bilgiden ayrıdır, yönetici onayından geçer ve sohbet asistanının kaynağı değildir.', 'Photos and memories added by visitors. They are separate from the book’s information, are reviewed by an administrator and are not a source for the chat assistant.')}</p>
    {items.length > 0 && <ul className="v-contrib-list">{items.map(c => <li key={c.id} className={c.kind}>
      {c.image && <a href={c.image.src} target="_blank" rel="noreferrer"><img src={c.image.thumb} alt={c.body ?? `${name}: ${t('ziyaretçi fotoğrafı', 'visitor photo')}`} loading="lazy" /></a>}
      <div>{c.kind === 'text' && <small>{c.text_kind_label}</small>}{c.body && <p>{c.body}</p>}
        <span>— {c.author}, {new Date(c.created_at).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}</span></div>
    </li>)}</ul>}
    {message && <p className="v-note" role="status">{message}</p>}
    {!user ? <p className="v-note"><Link className="text-link" to={`/giris?sonra=${encodeURIComponent(`/eser/${slug}`)}`}>{t('Giriş yap ya da hesap aç', 'Sign in or open an account')}</Link>{t(', bu esere fotoğraf, anı ya da bilgi ekle.', ' to add a photo, memory or fact to this work.')}</p>
      : !open ? <div className="v-actions">
        <button className="button line" onClick={() => { setOpen('photo'); setMessage(''); }}><ImagePlus size={16} /> {t('Fotoğraf ekle', 'Add a photo')}</button>
        <button className="button line" onClick={() => { setOpen('text'); setMessage(''); }}><MessageSquareText size={16} /> {t('Anı ya da bilgi ekle', 'Add a memory or fact')}</button>
      </div>
      : <form className="v-form" onSubmit={submit}>
        {open === 'photo' ? <label className="v-field"><span>{t('Fotoğraf (JPEG, PNG ya da WebP; en çok 10 MB)', 'Photo (JPEG, PNG or WebP; up to 10 MB)')}</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" required onChange={e => setFile(e.target.files?.[0] ?? null)} />
          <small>{t('Fotoğrafın konum ve cihaz bilgisi kaydetmeden önce silinir.', 'The photo’s location and device details are removed before saving.')}</small></label>
          : <label className="v-field"><span>{t('Ne eklemek istiyorsun?', 'What would you like to add?')}</span><select value={textKind} onChange={e => setTextKind(e.target.value)}>
            <option value="memory">{t('Bir anım var', 'I have a memory')}</option><option value="info">{t('Bir bilgi eklemek istiyorum', 'I want to add a fact')}</option><option value="correction">{t('Bir hata gördüm', 'I spotted a mistake')}</option></select></label>}
        <label className="v-field"><span>{open === 'photo' ? t('Kısa açıklama (isteğe bağlı)', 'Short caption (optional)') : t('Metin (en az 20 karakter)', 'Text (at least 20 characters)')}</span>
          <textarea rows={open === 'photo' ? 2 : 5} maxLength={2000} value={body} onChange={e => setBody(e.target.value)} required={open === 'text'} /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="v-actions"><button className="button dark" disabled={busy || (open === 'photo' ? !file : body.trim().length < 20)}>{busy ? t('Gönderiliyor…', 'Sending…') : t('Gönder', 'Send')}</button>
          <button type="button" className="text-link" onClick={() => { setOpen(null); setError(''); }}>{t('Vazgeç', 'Cancel')}</button></div>
      </form>}
  </section>;
}
