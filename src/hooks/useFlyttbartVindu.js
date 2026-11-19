import { useCallback, useEffect, useRef, useState } from 'react';
import { safeGetItem, safeSetItem } from '../utils/storage.js';

/*
 * Et vindu som kan flyttes (dra i toppen) og endre størrelse (dra i hjørnet),
 * med finger på iPad like godt som med mus. Plassen og størrelsen huskes i
 * nettleseren. Uten lagret ramme bestemmer CSS hvor vinduet står.
 *
 * Rammen er { x, y, b, h } i piksler. Den holdes alltid innenfor skjermen,
 * også når skjermen snus eller nettleservinduet blir mindre.
 */

const MARG = 8;

function les(nokkel) {
  try {
    const r = JSON.parse(safeGetItem(nokkel) || 'null');
    if (r && [r.x, r.y, r.b, r.h].every(Number.isFinite)) return r;
  } catch { /* ugyldig lagret verdi */ }
  return null;
}

function innenfor(r, minB, minH) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const b = Math.max(Math.min(minB, vw - 2 * MARG), Math.min(r.b, vw - 2 * MARG));
  const h = Math.max(Math.min(minH, vh - 2 * MARG), Math.min(r.h, vh - 2 * MARG));
  const x = Math.min(Math.max(MARG, r.x), vw - b - MARG);
  const y = Math.min(Math.max(MARG, r.y), vh - h - MARG);
  return { x, y, b, h };
}

export default function useFlyttbartVindu(nokkel, { minB = 320, minH = 280 } = {}) {
  const ref = useRef(null);
  const [ramme, setRamme] = useState(() => les(nokkel));
  const drag = useRef(null);

  // Snus skjermen, skal vinduet fortsatt være helt synlig
  useEffect(() => {
    function tilpass() {
      setRamme(r => (r ? innenfor(r, minB, minH) : r));
    }
    tilpass();
    window.addEventListener('resize', tilpass);
    return () => window.removeEventListener('resize', tilpass);
  }, [minB, minH]);

  const naaRamme = useCallback(() => {
    if (ramme) return ramme;
    const rect = ref.current?.getBoundingClientRect();
    return rect ? { x: rect.left, y: rect.top, b: rect.width, h: rect.height } : null;
  }, [ramme]);

  function start(e, type) {
    if (e.button != null && e.button !== 0) return;
    // Knapper og felt i toppen skal virke som vanlig
    if (type === 'flytt' && e.target.closest('button, input, select, textarea, a, label')) return;
    const r = naaRamme();
    if (!r) return;
    drag.current = { type, sx: e.clientX, sy: e.clientY, r, id: e.pointerId };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* eldre nettlesere */ }
    e.preventDefault();
  }

  function flytt(e) {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (d.type === 'flytt') {
      setRamme(innenfor({ ...d.r, x: d.r.x + dx, y: d.r.y + dy }, minB, minH));
      return;
    }
    // Hjørnet: vinduet vokser mot høyre og ned fra der det står, og stopper ved
    // skjermkanten i stedet for å skyve hele vinduet
    const maksB = window.innerWidth - d.r.x - MARG;
    const maksH = window.innerHeight - d.r.y - MARG;
    setRamme({
      ...d.r,
      b: Math.max(Math.min(minB, maksB), Math.min(maksB, d.r.b + dx)),
      h: Math.max(Math.min(minH, maksH), Math.min(maksH, d.r.h + dy)),
    });
  }

  function slipp(e) {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignorer */ }
    setRamme(r => {
      if (r) safeSetItem(nokkel, JSON.stringify(r));
      return r;
    });
  }

  /** Flytter vinduet til motsatt side av skjermen (samme høyde og størrelse) */
  function tilAndreSide() {
    const r = naaRamme();
    if (!r) return;
    const midt = r.x + r.b / 2;
    const x = midt > window.innerWidth / 2 ? MARG * 2 : window.innerWidth - r.b - MARG * 2;
    const ny = innenfor({ ...r, x }, minB, minH);
    setRamme(ny);
    safeSetItem(nokkel, JSON.stringify(ny));
  }

  const handlere = { onPointerMove: flytt, onPointerUp: slipp, onPointerCancel: slipp };

  return {
    ref,
    stil: ramme ? { left: ramme.x, top: ramme.y, width: ramme.b, height: ramme.h, right: 'auto', bottom: 'auto' } : undefined,
    flyttHandlere: { onPointerDown: e => start(e, 'flytt'), ...handlere },
    skalerHandlere: { onPointerDown: e => start(e, 'skaler'), ...handlere },
    tilAndreSide,
    // Uten lagret ramme står vinduet til høyre (CSS)
    tilVenstre: !!ramme && ramme.x + ramme.b / 2 < window.innerWidth / 2,
  };
}
