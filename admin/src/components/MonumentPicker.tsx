import { useEffect, useId, useRef, useState } from 'react';
import { api } from '../lib/api';
import { KIND_LABELS } from '../lib/format';
import type { MonumentRow } from '../lib/types';

/** Eser arama kutusu (WAI-ARIA combobox): yazdıkça arar; ok tuşları, Enter ve Escape ile kullanılır. */
export function MonumentPicker({ label, onPick, initial = '', city }: { label: string; onPick: (m: MonumentRow) => void; initial?: string; city?: string }) {
  const [q, setQ] = useState(initial);
  const [items, setItems] = useState<MonumentRow[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const picked = useRef(initial);     // seçilen adı aramaya yeniden sokmaz: liste kapanmış kalır
  useEffect(() => {
    if (q.trim().length < 2 || q === picked.current) { setItems([]); return; }
    let alive = true;
    const t = setTimeout(() => api.monuments({ q: q.trim(), city, page_size: 12 })
      .then(r => { if (alive) { setItems(r.items); setActive(0); setOpen(true); } }).catch(() => {}), 250);
    return () => { alive = false; clearTimeout(t); };
  }, [q, city]);
  function pick(m: MonumentRow) { picked.current = m.name_tr; onPick(m); setQ(m.name_tr); setOpen(false); }
  return <div className="combo admin-field"><span id={`${id}-label`}>{label}</span>
    <input ref={input} type="search" role="combobox" aria-labelledby={`${id}-label`} aria-expanded={open && items.length > 0}
      aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={open && items[active] ? `${id}-${active}` : undefined}
      placeholder="Eser adı ya da slug yazın…" value={q} onChange={e => { setQ(e.target.value); setOpen(true); }}
      onBlur={() => setTimeout(() => setOpen(false), 150)}
      onKeyDown={e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, items.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
        else if (e.key === 'Enter' && open && items[active]) { e.preventDefault(); pick(items[active]); }
        else if (e.key === 'Escape') setOpen(false);
      }} />
    {open && items.length > 0 && <ul id={`${id}-list`} role="listbox" aria-labelledby={`${id}-label`}>
      {items.map((m, i) => <li key={m.slug} id={`${id}-${i}`} role="option" aria-selected={i === active}
        onMouseDown={e => { e.preventDefault(); pick(m); }}>{m.name_tr}<small>{KIND_LABELS[m.kind]} · {m.city}{m.district ? ` / ${m.district}` : ''} · {m.slug}</small></li>)}
    </ul>}
    {open && q.trim().length >= 2 && !items.length && <small>Eşleşen eser yok.</small>}
  </div>;
}
