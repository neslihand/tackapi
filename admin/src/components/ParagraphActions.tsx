import { useState } from 'react';
import { ArrowRightLeft, Check, EyeOff, Merge, RotateCcw } from 'lucide-react';
import { MonumentPicker } from './MonumentPicker';
import type { ParaDecision, SplitPart } from '../lib/types';

export type Split = { at: number; part: SplitPart };

/**
 * Bir paragraf için bölümleme kararı düğmeleri. Kitap metni hiçbir durumda değişmez; karar her zaman geri alınabilir.
 * suggested: taşıma önerisi (paragrafın başında adı geçen eser).
 */
export function ParagraphActions({ decision, suggested, city, busy, onDecide, compact = false }: {
  decision: ParaDecision | null; suggested?: { slug: string; name: string } | null; city?: string; busy: boolean; compact?: boolean;
  onDecide: (decision: ParaDecision, target?: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const decided = decision && decision !== 'pending';
  return <div className="para-actions">
    <div className="admin-actions" style={{ gap: 6, padding: 0 }}>
      {decided
        ? <button className="button line small" disabled={busy} onClick={() => onDecide('pending')}><RotateCcw size={14} /> Kararı geri al</button>
        : <>
          <button className="button line small" disabled={busy} onClick={() => onDecide('keep')} title="Yanlış alarm: paragraf bu esere ait"><Check size={14} /> Bu esere ait</button>
          <button className="button danger small" disabled={busy} onClick={() => onDecide('hide')} title="Ziyaretçi metninden ve sohbetten çıkar"><EyeOff size={14} /> Paragrafı gizle</button>
          {!compact && <button className="button line small" disabled={busy} onClick={() => onDecide('merge_prev')} title="Satır kırılmasıyla bölünmüş cümleyi önceki paragrafa ekle"><Merge size={14} /> Öncekiyle birleştir</button>}
          {suggested && <button className="button gold small" disabled={busy} onClick={() => onDecide('move', suggested.slug)}><ArrowRightLeft size={14} /> “{suggested.name}” eserine taşı</button>}
          <button className="button line small" disabled={busy} aria-expanded={picking} onClick={() => setPicking(p => !p)}><ArrowRightLeft size={14} /> {suggested ? 'Başka esere' : 'Paragrafı başka esere taşı'}</button>
        </>}
    </div>
    {picking && !decided && <div style={{ marginTop: 10, maxWidth: 520 }}>
      <MonumentPicker label="Paragrafın asıl sahibi olan eser" city={city} onPick={m => { setPicking(false); onDecide('move', m.slug); }} />
    </div>}
  </div>;
}

/**
 * Yöneticinin seçtiği noktadan paragrafı böl: başka esere ait kısım (sondaki / baştaki) ve o kısım için karar
 * (asıl eserine taşı / gizle). Diğer kısım bu eserde kalır.
 */
export function SplitForm({ text, at, spans = [], city, busy, onDecide, onCancel }: {
  text: string; at: number; spans?: [number, number][]; city?: string; busy: boolean; onCancel: () => void;
  onDecide: (decision: ParaDecision, target: string | undefined, split: Split) => void;
}) {
  const [part, setPart] = useState<SplitPart>('tail');
  const [moving, setMoving] = useState(false);
  // önizlemede gizlenen kısımlar çıkarılır (ziyaretçinin göreceği gibi)
  const visible = (from: number, to: number) => [...text.slice(from, to)].filter((_, i) => !spans.some(([a, b]) => from + i >= a && from + i < b))
    .join('').replace(/\s{2,}/g, ' ').trim();
  const head = visible(0, at), tail = visible(at, text.length);
  const short = (s: string, end: boolean) => s.length > 90 ? (end ? `…${s.slice(-90)}` : `${s.slice(0, 90)}…`) : s;
  return <div className="split-form">
    <div className="split-preview">
      <p className={part === 'head' ? 'off' : ''}><b>Baştaki kısım</b> {short(head, true)}</p>
      <p className={part === 'tail' ? 'off' : ''}><b>Sondaki kısım</b> {short(tail, false)}</p>
    </div>
    <div className="pv-segmented" role="group" aria-label="Başka esere ait kısım">
      <button type="button" className={part === 'tail' ? 'active' : ''} aria-pressed={part === 'tail'} onClick={() => setPart('tail')}>Sondaki kısım başka esere ait</button>
      <button type="button" className={part === 'head' ? 'active' : ''} aria-pressed={part === 'head'} onClick={() => setPart('head')}>Baştaki kısım başka esere ait</button>
    </div>
    <p className="admin-help">Çizili kısım bu eserden çıkar; diğeri kalır. Taşınan kısım hedef eserde kitaptaki sırasına göre yerleşir.</p>
    <div className="admin-actions" style={{ gap: 6, padding: 0 }}>
      <button className="button line small" disabled={busy} aria-expanded={moving} onClick={() => setMoving(m => !m)}><ArrowRightLeft size={14} /> Çizili kısmı asıl eserine taşı</button>
      <button className="button danger small" disabled={busy} onClick={() => onDecide('hide', undefined, { at, part })}><EyeOff size={14} /> Çizili kısmı gizle</button>
      <button className="button line small" disabled={busy} onClick={onCancel}>Vazgeç</button>
    </div>
    {moving && <div style={{ maxWidth: 520 }}><MonumentPicker label="Çizili kısmın asıl sahibi olan eser" city={city} onPick={m => onDecide('move', m.slug, { at, part })} /></div>}
  </div>;
}
