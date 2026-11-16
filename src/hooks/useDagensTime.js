import { useCallback, useEffect, useState } from 'react';
import { safeGetItem, safeSetItem } from '../utils/storage.js';
import { getOsloDateParts, getMinutesFromTime } from '../utils/time.js';

/* «Agenda for timen»: tittel, tid, læringsmål og agenda som læreren setter opp for
   én time i dag. Lagres for seg (ikke i klassedataene), gjelder bare denne
   skjermen og bare i dag, så den kan aldri ødelegge timeplanen. */

export const DAGENS_TIME_KEY = 'klasseskjerm.dagensTimer';

/** Minutter før start da timen dukker opp på tavla av seg selv */
export const VIS_FOER_START = 10;

function tosifret(n) {
  return String(n).padStart(2, '0');
}

export function dagensDato(date = new Date()) {
  const { year, month, day } = getOsloDateParts(date);
  return `${year}-${tosifret(month)}-${tosifret(day)}`;
}

/** «10», «1000», «10.00», «10:00» og «9:5» blir «10:00»/«09:05». Ugyldig gir ''. */
export function tolkKlokkeslett(verdi) {
  const raw = String(verdi || '').trim().replace(/[.,;\s]/g, ':');
  let t; let m;
  let treff = raw.match(/^(\d{1,2}):(\d{1,2})$/);
  if (treff) { t = Number(treff[1]); m = Number(treff[2]); }
  else if ((treff = raw.match(/^(\d{1,2})$/))) { t = Number(treff[1]); m = 0; }
  else if ((treff = raw.match(/^(\d{3,4})$/))) {
    const s = treff[1].padStart(4, '0');
    t = Number(s.slice(0, 2)); m = Number(s.slice(2));
  } else return '';
  if (!(t >= 0 && t <= 23 && m >= 0 && m <= 59)) return '';
  return `${tosifret(t)}:${tosifret(m)}`;
}

/** Ett nivå med underpunkter: { tekst, ferdig, under: [{ tekst, ferdig }] } */
function rensPunkter(liste) {
  if (!Array.isArray(liste)) return [];
  return liste
    .filter(p => p && typeof p.tekst === 'string' && p.tekst.trim())
    .map(p => {
      const under = Array.isArray(p.under)
        ? p.under
          .filter(u => u && typeof u.tekst === 'string' && u.tekst.trim())
          .map(u => ({ tekst: u.tekst, ferdig: !!u.ferdig }))
        : [];
      // Et punkt med underpunkter er ferdig når alle underpunktene er det
      const ferdig = under.length ? under.every(u => u.ferdig) : !!p.ferdig;
      return { tekst: p.tekst, ferdig, under };
    });
}

function rensTime(t) {
  if (!t || typeof t !== 'object') return null;
  const fra = tolkKlokkeslett(t.fra);
  const til = tolkKlokkeslett(t.til);
  if (!fra || !til || typeof t.dato !== 'string') return null;
  return {
    id: typeof t.id === 'string' && t.id ? t.id : `time-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    dato: t.dato,
    dag: typeof t.dag === 'string' ? t.dag : '',
    tittel: typeof t.tittel === 'string' ? t.tittel : '',
    // Faget fra timeplanen: vises når tittelen er tom, og velger malen
    fag: typeof t.fag === 'string' ? t.fag : '',
    fagNokkel: typeof t.fagNokkel === 'string' ? t.fagNokkel : '',
    fra,
    til,
    maal: typeof t.maal === 'string' ? t.maal : '',
    punkter: rensPunkter(t.punkter),
    fast: !!t.fast,
    fastVed: Number.isFinite(t.fastVed) ? t.fastVed : null,
    skjult: !!t.skjult,
  };
}

/** Dagens timer slik de er lagret nå (bare i dag). Leser, skriver aldri. */
export function lesTimer() {
  try {
    const raw = safeGetItem(DAGENS_TIME_KEY);
    if (!raw) return [];
    const liste = JSON.parse(raw);
    if (!Array.isArray(liste)) return [];
    const idag = dagensDato();
    // Gamle dager ryddes bort; dagens time er bare for i dag
    return liste.map(rensTime).filter(t => t && t.dato === idag);
  } catch {
    return [];
  }
}

/**
 * Timen som skal stå på tavla nå, eller null.
 * Vises fra ti minutter før start til slutt. «Vis på tavla» fester den i
 * tillegg: da vises den med en gang, og til timen er slutt (eller til den
 * skjules, hvis den ble festet etter at tiden var ute).
 */
export function finnSynligTime(timer, dato, dag, minutter) {
  let iVindu = null;
  let festet = null;
  for (const t of timer) {
    if (t.dato !== dato || t.skjult) continue;
    if (t.dag && dag && t.dag !== dag) continue;
    const start = getMinutesFromTime(t.fra);
    const slutt = getMinutesFromTime(t.til);
    if (minutter >= start - VIS_FOER_START && minutter < slutt) {
      if (!iVindu || start > getMinutesFromTime(iVindu.fra)) iVindu = t;
    } else if (t.fast && (minutter < slutt || (t.fastVed ?? 0) >= slutt)) {
      festet = t;
    }
  }
  return iVindu || festet;
}

/** Det som står øverst på kortet: egen tittel, ellers faget fra timeplanen. */
export function timeTittel(time) {
  return (time?.tittel || '').trim() || time?.fag || '';
}

/**
 * Underpunktene til ferdige punkter skjules, så lista ikke blir lang. Det
 * sist ferdige punktet beholder dem, så et trykk for mye kan angres.
 */
export function sisteFerdigePunkt(punkter) {
  const forsteApne = punkter.findIndex(p => !p.ferdig);
  return (forsteApne === -1 ? punkter.length : forsteApne) - 1;
}

/** «35 min», «1 t 10 min» */
export function minTekst(n) {
  const m = Math.max(0, Math.round(n));
  if (m >= 60) {
    const t = Math.floor(m / 60);
    const r = m % 60;
    return r ? `${t} t ${r} min` : `${t} t`;
  }
  return `${m} min`;
}

/**
 * Hvor timen står akkurat nå: samme tekst på tavla og
 * på elevens iPad. naaIndex er agendapunktet klassen er på (første som ikke
 * er krysset av), bare mens timen pågår.
 */
export function timeStatus(time, minutter) {
  const start = getMinutesFromTime(time.fra);
  const slutt = getMinutesFromTime(time.til);
  const paagaar = minutter >= start && minutter < slutt;
  const foer = minutter < start;
  let status = '';
  if (paagaar) status = `${minTekst(slutt - minutter)} igjen`;
  else if (foer) status = start - minutter <= 90 ? `Starter om ${minTekst(start - minutter)}` : `Starter kl. ${time.fra}`;
  const naaIndex = paagaar ? time.punkter.findIndex(p => !p.ferdig) : -1;
  // Underpunktet klassen er på, inni punktet som pågår
  const naaUnder = naaIndex >= 0 ? (time.punkter[naaIndex].under || []).findIndex(u => !u.ferdig) : -1;
  const framdrift = paagaar ? Math.min(100, Math.max(0, ((minutter - start) / Math.max(1, slutt - start)) * 100)) : null;
  return { start, slutt, paagaar, foer, status, naaIndex, naaUnder, framdrift };
}

export function useDagensTime() {
  const [timer, setTimer] = useState(lesTimer);

  useEffect(() => {
    safeSetItem(DAGENS_TIME_KEY, JSON.stringify(timer));
  }, [timer]);

  // Ved midnatt (eller når fanen har stått åpen over natta) ryddes gårsdagen bort
  useEffect(() => {
    const id = setInterval(() => {
      const idag = dagensDato();
      setTimer(prev => (prev.some(t => t.dato !== idag) ? prev.filter(t => t.dato === idag) : prev));
    }, 60000);
    return () => clearInterval(id);
  }, []);

  const lagreTime = useCallback((time) => {
    const ren = rensTime(time);
    if (!ren) return;
    setTimer(prev => {
      // Samme time (id) eller samme starttid erstattes; ellers legges den til
      const uten = prev.filter(t => t.id !== ren.id && !(t.fra === ren.fra && t.dato === ren.dato));
      const neste = ren.fast ? uten.map(t => (t.fast ? { ...t, fast: false } : t)) : uten;
      return [...neste, ren].sort((a, b) => getMinutesFromTime(a.fra) - getMinutesFromTime(b.fra));
    });
  }, []);

  const slettTime = useCallback((id) => {
    setTimer(prev => prev.filter(t => t.id !== id));
  }, []);

  const skjulTime = useCallback((id) => {
    setTimer(prev => prev.map(t => (t.id === id ? { ...t, skjult: true, fast: false } : t)));
  }, []);

  /**
   * Krysser av et punkt (underIndex null) eller et underpunkt. Et punkt med
   * underpunkter krysser av (eller fjerner) alle underpunktene på én gang, og
   * er ferdig når alle underpunktene er det.
   */
  const vekslePunkt = useCallback((id, index, underIndex = null) => {
    setTimer(prev => prev.map(t => {
      if (t.id !== id) return t;
      const punkter = t.punkter.map((p, i) => {
        if (i !== index) return p;
        const under = p.under || [];
        if (underIndex != null) {
          const nyUnder = under.map((u, j) => (j === underIndex ? { ...u, ferdig: !u.ferdig } : u));
          return { ...p, under: nyUnder, ferdig: nyUnder.length > 0 && nyUnder.every(u => u.ferdig) };
        }
        const ferdig = !p.ferdig;
        return { ...p, ferdig, under: under.map(u => ({ ...u, ferdig })) };
      });
      return { ...t, punkter };
    }));
  }, []);

  return { timer, lagreTime, slettTime, skjulTime, vekslePunkt };
}
