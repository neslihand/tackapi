import { useState } from 'react';
import { ArrowRightLeft, Check, EyeOff, Merge, RotateCcw } from 'lucide-react';
import { MonumentPicker } from './MonumentPicker';
import type { ParaDecision } from '../lib/types';

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
          <button className="button danger small" disabled={busy} onClick={() => onDecide('hide')} title="Ziyaretçi metninden ve sohbetten çıkar"><EyeOff size={14} /> Gizle</button>
          {!compact && <button className="button line small" disabled={busy} onClick={() => onDecide('merge_prev')} title="Satır kırılmasıyla bölünmüş cümleyi önceki paragrafa ekle"><Merge size={14} /> Öncekiyle birleştir</button>}
          {suggested && <button className="button gold small" disabled={busy} onClick={() => onDecide('move', suggested.slug)}><ArrowRightLeft size={14} /> “{suggested.name}” eserine taşı</button>}
          <button className="button line small" disabled={busy} aria-expanded={picking} onClick={() => setPicking(p => !p)}><ArrowRightLeft size={14} /> {suggested ? 'Başka esere' : 'Başka esere taşı'}</button>
        </>}
    </div>
    {picking && !decided && <div style={{ marginTop: 10, maxWidth: 520 }}>
      <MonumentPicker label="Paragrafın asıl sahibi olan eser" city={city} onPick={m => { setPicking(false); onDecide('move', m.slug); }} />
    </div>}
  </div>;
}
