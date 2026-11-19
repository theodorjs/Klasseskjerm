import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { aktivSkole } from '../data/skoletema.js';
import { skoleFerier } from '../data/skoler/index.js';
import { bursdagerPaaDag, bursdagUndertekst, bursdagSetning, lagErFridag, osloIDag } from '../utils/bursdager.js';
import {
  skoleTjeneste,
  hentBursdager,
  trengerNyListe,
  lyttTilTjeneste,
  lesTjenesteTilstand,
  startTjenesteTilstand,
  SPRUKKET_KEY,
} from '../utils/ksTjeneste.js';
import { safeGetItem, safeSetItem } from '../utils/storage.js';

const SJEKK_HVER_MS = 60 * 60 * 1000;

function lesSprukket() {
  try {
    const s = JSON.parse(safeGetItem(SPRUKKET_KEY) || 'null');
    return s && Array.isArray(s.nokler) ? s : { dag: null, okt: null, nokler: [] };
  } catch {
    return { dag: null, okt: null, nokler: [] };
  }
}

/**
 * Bursdagene som skal feires i dag for klassene som vises.
 * Henter lista fra skolens tjeneste når den er eldre enn et døgn
 * (sjekkes hver time, så en veggskjerm som står på i ukevis følger med).
 * Svarer { bursdager, ballonger, sprekk(nokkel), blaasOpp(nokkel) }:
 * - bursdager: ballongene som er hele (veggskjermen viser bare disse)
 * - ballonger: alle, med `sprukket`, så en sprukket ballong kan blåses opp igjen
 * En sprukket ballong blåses opp igjen av seg selv når neste time starter
 * (`okt` er starten på timen som pågår eller sist var), eller med et trykk.
 */
export default function useBursdager(klassenavn, okt = null) {
  const skolensTjeneste = useMemo(() => skoleTjeneste(), []);
  const { bursdager: liste, elev } = useSyncExternalStore(lyttTilTjeneste, lesTjenesteTilstand);
  // Elevene får ingen bursdager, og tjenesten spørres ikke
  const tjeneste = elev ? null : skolensTjeneste;

  useEffect(() => {
    if (!tjeneste) return undefined;
    startTjenesteTilstand();
    const sjekk = () => { if (trengerNyListe()) hentBursdager(tjeneste); };
    sjekk();
    const id = setInterval(sjekk, SJEKK_HVER_MS);
    return () => clearInterval(id);
  }, [tjeneste]);

  const idag = osloIDag();
  // Sprukne ballonger gjelder bare timen de ble sprukket i
  const [sprukketLagret, setSprukket] = useState(lesSprukket);
  const sprukket = useMemo(
    () => (sprukketLagret.dag === idag && sprukketLagret.okt === okt ? sprukketLagret.nokler : []),
    [sprukketLagret, idag, okt],
  );

  const erFridag = useMemo(() => lagErFridag(skoleFerier(aktivSkole()?.id)), []);
  const nokkel = (klassenavn || []).join('|');

  const alle = useMemo(() => {
    const klasser = liste?.data?.klasser;
    if (!tjeneste || !klasser) return [];
    const sett = new Set();
    const ut = [];
    for (const klasse of nokkel ? nokkel.split('|') : []) {
      for (const b of bursdagerPaaDag(klasser[klasse], idag, erFridag)) {
        // Datoen er med, så to elever med samme fornavn i klassen holdes fra hverandre
        const id = `${klasse}:${b.fornavn}:${b.bursdag}`;
        if (sett.has(id)) continue;
        sett.add(id);
        ut.push({ ...b, klasse, nokkel: id, undertekst: bursdagUndertekst(b), setning: bursdagSetning(b) });
      }
    }
    return ut;
  }, [tjeneste, liste, nokkel, idag, erFridag]);

  const sprekk = useCallback((id) => {
    setSprukket(prev => {
      const naa = prev.dag === idag && prev.okt === okt ? prev.nokler : [];
      const neste = { dag: idag, okt, nokler: naa.includes(id) ? naa : [...naa, id] };
      safeSetItem(SPRUKKET_KEY, JSON.stringify(neste));
      return neste;
    });
  }, [idag, okt]);

  const blaasOpp = useCallback((id) => {
    setSprukket(prev => {
      const neste = { ...prev, nokler: prev.nokler.filter(k => k !== id) };
      safeSetItem(SPRUKKET_KEY, JSON.stringify(neste));
      return neste;
    });
  }, []);

  const ballonger = useMemo(() => alle.map(b => ({ ...b, sprukket: sprukket.includes(b.nokkel) })), [alle, sprukket]);
  const bursdager = useMemo(() => ballonger.filter(b => !b.sprukket), [ballonger]);
  return { bursdager, ballonger, sprekk, blaasOpp };
}
