import { useRef } from 'react';
import type { SplitPart } from '../lib/types';

export type TextRange = { start: number; end: number };

/**
 * Kitap paragrafını, yöneticinin fareyle seçim yapabileceği biçimde gösterir. Metnin tamamı (gizlenen kısımlar dahil)
 * olduğu gibi yazılır; böylece seçimin karakter konumları kitap metnindekilerle birebir aynıdır.
 * spans: gizlenen kısımlar (kırmızı çizili) · split: bölünmüşse kararın uygulandığı kısım (gri çizili)
 * onSelect: seçim bırakılınca {start, end}; yalnızca tıklandıysa start = end (bölme noktası).
 */
export function ParagraphText({ text, spans = [], split = null, mark = null, onSelect }: {
  text: string; spans?: [number, number][]; split?: { at: number; part: SplitPart } | null; mark?: TextRange | null;
  onSelect?: (r: TextRange) => void;
}) {
  const box = useRef<HTMLSpanElement>(null);
  const cuts = new Set<number>([0, text.length, ...spans.flat(), ...(split ? [split.at] : []), ...(mark ? [mark.start, mark.end] : [])]);
  const points = [...cuts].filter(n => n >= 0 && n <= text.length).sort((a, b) => a - b);
  const segs = points.slice(0, -1).map((start, i) => ({ start, end: points[i + 1] })).filter(s => s.end > s.start);
  const cls = (s: { start: number; end: number }) => [
    spans.some(([a, b]) => s.start >= a && s.end <= b) ? 'pt-hidden' : '',
    split && (split.part === 'tail' ? s.start >= split.at : s.end <= split.at) ? 'pt-off' : '',
    mark && s.start >= mark.start && s.end <= mark.end && mark.end > mark.start ? 'pt-mark' : '',
  ].filter(Boolean).join(' ');
  function pick() {
    const sel = window.getSelection();
    if (!onSelect || !sel || !sel.rangeCount || !box.current) return;
    const r = sel.getRangeAt(0);
    if (!box.current.contains(r.startContainer) || !box.current.contains(r.endContainer)) return;
    const offset = (node: Node, off: number) => {
      const pre = document.createRange();
      pre.selectNodeContents(box.current!);
      pre.setEnd(node, off);
      return pre.toString().length;
    };
    onSelect({ start: offset(r.startContainer, r.startOffset), end: offset(r.endContainer, r.endOffset) });
  }
  return <span ref={box} className={`para-text pt ${onSelect ? 'pt-selectable' : ''}`} onMouseUp={pick} onKeyUp={pick}>
    {segs.map(s => <span key={s.start} className={cls(s)}>{text.slice(s.start, s.end)}</span>)}
  </span>;
}
