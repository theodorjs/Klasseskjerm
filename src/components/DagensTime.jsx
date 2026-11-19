import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useFlyttbartVindu from '../hooks/useFlyttbartVindu.js';
import Info from './Info.jsx';
import Ikon, { FagSymbol } from './Ikon.jsx';
import { getMinutesFromTime, formatMinutesAsTime } from '../utils/time.js';
import { tolkKlokkeslett, dagensDato, timeStatus, timeTittel, sisteFerdigePunkt, lesUtkast, lagreUtkast, slettUtkast, VIS_FOER_START } from '../hooks/useDagensTime.js';
import { getReadableAgendaTextColor } from '../utils/color.js';
import { erElev, skoleTjeneste } from '../utils/ksTjeneste.js';

/* «Agenda for timen»: kortet på tavla (glass, for elevene) og dialogen der
   læreren setter den opp (instrument). Rask vei: faget og tiden hentes fra
   timeplanen, så læreren bare skriver punktene. Full vei: tittel, tid og mål.
   Hvert fag kan ha en mal som hentes med ett trykk. */

const BOKSTAVER = 'abcdefghijklmnopqrstuvwxyz';

function bokstav(j) { return BOKSTAVER[j] || String(j + 1); }

/* Dialogen redigerer punktene som en flat liste med nivå (0 = punkt,
   1 = underpunkt). På tavla og i malene lagres de nøstet: { tekst, under }. */
function tilRader(punkter) {
  const rader = [];
  (punkter || []).forEach(p => {
    const tekst = typeof p === 'string' ? p : (p?.tekst || '');
    rader.push({ tekst, nivaa: 0 });
    const under = typeof p === 'string' ? [] : (p?.under || []);
    under.forEach(u => rader.push({ tekst: typeof u === 'string' ? u : (u?.tekst || ''), nivaa: 1 }));
  });
  return rader.length ? rader : [{ tekst: '', nivaa: 0 }];
}

function tilStruktur(rader) {
  const ut = [];
  // Et tomt punkt tas ikke med; underpunktene dets blir da vanlige punkter,
  // i stedet for å havne under punktet over
  let forelderTom = true;
  rader.forEach(r => {
    const tekst = r.tekst.trim();
    if (r.nivaa === 0) forelderTom = !tekst;
    if (!tekst) return;
    if (r.nivaa === 1 && ut.length && !forelderTom) ut[ut.length - 1].under.push(tekst);
    else ut.push({ tekst, under: [] });
  });
  return ut;
}

/** «1», «2» for punkter, «a», «b» for underpunktene under hvert punkt */
function radMerker(rader) {
  let n = 0;
  let u = 0;
  return rader.map(r => {
    if (r.nivaa === 1 && n > 0) { u += 1; return { merke: bokstav(u - 1), navn: `Underpunkt ${n}${bokstav(u - 1)}` }; }
    n += 1; u = 0;
    return { merke: String(n), navn: `Punkt ${n}` };
  });
}

/**
 * Innlimt tekst: én rad per linje. Linjer med mer innrykk enn de minst
 * innrykkede blir underpunkter. Limes det inn i et underpunkt, blir alt
 * underpunkter. Punkttegn fjernes; tall og bokstaver («1.», «a)») bare når
 * alle linjene har dem, så «2. verdenskrig» og «s. 34» står i fred.
 */
function tolkLinjer(tekst, grunnNivaa = 0) {
  const linjer = tekst.split(/\r?\n/).filter(l => l.trim());
  if (!linjer.length) return [];
  const innrykk = l => l.match(/^[\t ]*/)[0].replace(/\t/g, '    ').length;
  const minst = Math.min(...linjer.map(innrykk));
  const nummerert = linjer.every(l => /^(\d+|[a-zA-Z])[.)]\s+\S/.test(l.trim()));
  return linjer
    .map(linje => {
      let t = linje.trim().replace(/^[-–—•◦▪·*o]\s+/, '');
      if (nummerert) t = t.replace(/^(\d+|[a-zA-Z])[.)]\s+/, '');
      return { nivaa: Math.min(1, grunnNivaa + (innrykk(linje) > minst ? 1 : 0)), tekst: t.trim() };
    })
    .filter(r => r.tekst);
}

/** Lite fagmerke med symbol og fagfarge, som på «Akkurat nå» */
function FagMerke({ merke, className = '' }) {
  if (!merke) return null;
  const stil = merke.farge ? { background: merke.farge, color: getReadableAgendaTextColor(merke.farge) } : undefined;
  return (
    <span className={`dt-fagmerke${merke.farge ? '' : ' is-noytral'} ${className}`.trim()} style={stil} aria-hidden="true">
      <FagSymbol verdi={merke.symbol} reserve="book-open" />
    </span>
  );
}

// ─── Kortet elevene ser ─────────────────────────────────────────────────────

export function DagensTimeKort({ time, minutter, merke, onEndre, onSkjul, onVekslePunkt }) {
  const { status, naaIndex, naaUnder, framdrift } = timeStatus(time, minutter);
  const listeRef = useRef(null);
  const sisteFerdig = sisteFerdigePunkt(time.punkter);

  // Lang agenda ruller inni kortet: punktet klassen er på holdes i syne
  useEffect(() => {
    const ol = listeRef.current;
    if (!ol || naaIndex < 0 || ol.scrollHeight <= ol.clientHeight) return;
    const li = ol.children[naaIndex];
    if (!li) return;
    // Underpunktet klassen er på, ellers selve punktet (bare knapperaden)
    const maal = (naaUnder >= 0 && li.querySelector('.dt-under')?.children[naaUnder])
      || li.querySelector(':scope > .dt-punkt') || li;
    const boks = ol.getBoundingClientRect();
    const rad = maal.getBoundingClientRect();
    if (rad.top < boks.top || rad.bottom > boks.bottom) {
      ol.scrollTop += rad.top - boks.top - 8;
    }
  }, [naaIndex, naaUnder]);
  const tittel = timeTittel(time);

  return (
    <div className="container dagens-time" id="main-container" aria-live="polite">
      <div className="dt-verktoy">
        <button type="button" className="dt-knapp" onClick={onEndre} aria-label="Endre agendaen" title="Endre agendaen">
          <Ikon navn="pencil" />
        </button>
        <button type="button" className="dt-knapp" onClick={onSkjul} aria-label="Skjul timen fra tavla" title="Skjul fra tavla">
          <Ikon navn="x" />
        </button>
      </div>

      <div className="dt-topp">
        {tittel && (
          <h1 className="dt-tittel">
            {!time.tittel?.trim() && <FagMerke merke={merke} />}
            {tittel}
          </h1>
        )}
        <div className="dt-tid">
          <span className="dt-klokke">{time.fra}–{time.til}</span>
          {status && <span className="dt-status">{status}</span>}
        </div>
      </div>
      {framdrift !== null && (
        <div className="dt-framdrift" aria-hidden="true"><span style={{ width: `${framdrift}%` }} /></div>
      )}

      {time.maal && (
        <div className="dt-maal">
          <span className="dt-maal-merke"><Ikon navn="target" /> Mål</span>
          <span className="dt-maal-tekst">{time.maal}</span>
        </div>
      )}

      {time.punkter.length > 0 && (
        <ol className="dt-agenda" ref={listeRef}>
          {time.punkter.map((p, i) => (
            <li key={i} className={`${p.ferdig ? 'er-ferdig' : ''}${i === naaIndex ? ' er-naa' : ''}`.trim() || undefined}>
              <button
                type="button"
                className="dt-punkt"
                onClick={() => onVekslePunkt(i)}
                aria-pressed={p.ferdig ? 'true' : 'false'}
                title={p.ferdig ? 'Marker som ikke ferdig' : 'Marker som ferdig'}
              >
                <span className="dt-nr">{p.ferdig ? <Ikon navn="check" strek={3} /> : i + 1}</span>
                <span className="dt-punkt-tekst">{p.tekst}</span>
              </button>
              {/* Underpunktene: skjules når hele punktet er ferdig, så lista ikke blir lang */}
              {p.under?.length > 0 && (!p.ferdig || i === sisteFerdig) && (
                <ol className="dt-under">
                  {p.under.map((u, j) => (
                    <li key={j} className={`${u.ferdig ? 'er-ferdig' : ''}${i === naaIndex && j === naaUnder ? ' er-naa' : ''}`.trim() || undefined}>
                      <button
                        type="button"
                        className="dt-punkt dt-punkt--under"
                        onClick={() => onVekslePunkt(i, j)}
                        aria-pressed={u.ferdig ? 'true' : 'false'}
                        title={u.ferdig ? 'Marker som ikke ferdig' : 'Marker som ferdig'}
                      >
                        <span className="dt-nr">{u.ferdig ? <Ikon navn="check" strek={3} /> : bokstav(j)}</span>
                        <span className="dt-punkt-tekst">{u.tekst}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ─── Dialogen læreren fyller ut ─────────────────────────────────────────────

function PlanleggTimeInner({
  eksisterende, forslag, fagVed, minutter, dag, maler, merkeFor, editPermission,
  onLagre, onLagreMal, onAvbryt, onTom,
}) {
  // Utkastet: det læreren skrev sist, men ikke viste på tavla. Vinduet åpner der.
  const gjelder = eksisterende?.id || 'ny';
  const [utkast] = useState(() => lesUtkast(gjelder));
  const u = utkast?.data || null;
  // En ny agenda, eller en som er tatt med fra en tidligere dag, får tid og fag
  // fra timen som er nå. Et utkast for en ny agenda beholder sin tid bare når
  // det ble skrevet for den samme timen.
  const nyTime = !eksisterende || !!eksisterende.overfort;
  const tidFraUtkast = !!u && (!nyTime || u.forslagFra === forslag.fra);
  const [forst] = useState(() => (tidFraUtkast
    ? { fra: u.fra, til: u.til, fag: u.fag || '', fagNokkel: u.fagNokkel || '', tilRort: !!u.tilRort }
    : nyTime
      ? { fra: forslag.fra, til: forslag.til, fag: forslag.fag || '', fagNokkel: forslag.fagNokkel || '', tilRort: false }
      : { fra: eksisterende.fra, til: eksisterende.til, fag: eksisterende.fag || '', fagNokkel: eksisterende.fagNokkel || '', tilRort: true }));

  // Faget følger starttiden: endrer læreren tiden til en annen time, byttes
  // faget (og malen) til den timen
  const [{ fag, fagNokkel }, setFagInfo] = useState({ fag: forst.fag, fagNokkel: forst.fagNokkel });
  const merke = merkeFor?.(fagNokkel) || null;
  const mal = fagNokkel ? maler?.[fagNokkel] : null;
  // Rask vei: en time fra timeplanen. Da står faget og tiden på én linje, og
  // markøren står i første punkt. Bestemmes én gang, når vinduet åpnes.
  const [rask] = useState(() => nyTime && !!forst.fag);

  const [utvidet, setUtvidet] = useState(tidFraUtkast ? !!u.utvidet : !rask);
  const [visMaal, setVisMaal] = useState(u ? !!u.visMaal : (!rask || !!eksisterende?.maal));
  const [tittel, setTittel] = useState(u ? u.tittel : (eksisterende?.tittel || ''));
  const [fra, setFra] = useState(forst.fra);
  const [til, setTil] = useState(forst.til);
  const [maal, setMaal] = useState(u ? u.maal : (eksisterende?.maal || ''));
  const [rader, setRader] = useState(() => (u?.rader?.length ? u.rader : tilRader(eksisterende?.punkter)));
  const [tilRort, setTilRort] = useState(forst.tilRort);

  // Lagrer utkastet mens læreren skriver. Er ingenting endret fra det som
  // er lagret (eller tomt for en ny agenda), finnes det ikke noe utkast.
  const [utgangspunkt] = useState(() => JSON.stringify({
    tittel: eksisterende?.tittel || '', fra: forst.fra, til: forst.til,
    maal: eksisterende?.maal || '', punkter: tilStruktur(tilRader(eksisterende?.punkter)),
  }));
  useEffect(() => {
    const innhold = { tittel, fra, til, maal, punkter: tilStruktur(rader) };
    const tomt = !tittel.trim() && !maal.trim() && !innhold.punkter.length;
    if ((!eksisterende && tomt) || JSON.stringify(innhold) === utgangspunkt) {
      slettUtkast(gjelder);
      return;
    }
    lagreUtkast(gjelder, { tittel, fra, til, maal, rader, fag, fagNokkel, utvidet, visMaal, tilRort, forslagFra: forslag.fra });
  }, [tittel, fra, til, maal, rader, fag, fagNokkel, utvidet, visMaal, tilRort, eksisterende, gjelder, utgangspunkt, forslag.fra]);
  const [visFeil, setVisFeil] = useState(false);
  const [malMelding, setMalMelding] = useState('');

  const tittelRef = useRef(null);
  const fraRef = useRef(null);
  const tilRef = useRef(null);
  const maalRef = useRef(null);
  const punktRefs = useRef([]);
  const fokusPunkt = useRef(null);
  const fokusFelt = useRef(null);

  useEffect(() => {
    const id = setTimeout(() => {
      const el = (rask ? punktRefs.current[0] : tittelRef.current) || punktRefs.current[0];
      if (!el) return;
      el.focus();
      // Et tomt felt markeres; står det tekst der (fra et utkast), havner markøren bakerst
      const len = el.value?.length || 0;
      try { if (len) el.setSelectionRange(len, len); else el.select?.(); } catch { /* ikke alle felt */ }
    }, 50);
    return () => clearTimeout(id);
  }, [rask]);

  // Etter at et punkt er lagt til eller fjernet: fokus dit læreren skriver
  useEffect(() => {
    if (fokusPunkt.current == null) return;
    const el = punktRefs.current[fokusPunkt.current];
    fokusPunkt.current = null;
    if (el) {
      el.focus();
      const len = el.value.length;
      try { el.setSelectionRange(len, len); } catch { /* ikke alle felt kan markeres */ }
    }
  }, [rader]);

  // Et felt som nettopp ble vist (Endre, + Læringsmål), får fokus
  useEffect(() => {
    const el = fokusFelt.current?.current;
    fokusFelt.current = null;
    el?.focus();
  }, [utvidet, visMaal]);

  const fraOk = tolkKlokkeslett(fra);
  const tilOk = tolkKlokkeslett(til);
  const start = fraOk ? getMinutesFromTime(fraOk) : null;
  const slutt = tilOk ? getMinutesFromTime(tilOk) : null;
  const varighet = start != null && slutt != null ? slutt - start : null;
  const tidOk = varighet != null && varighet > 0;
  const struktur = tilStruktur(rader);
  const harInnhold = !!(tittel.trim() || maal.trim() || struktur.length);
  const merker = radMerker(rader);
  const kanLagre = tidOk && harInnhold;

  let tidFeil = '';
  if (!fraOk) tidFeil = 'Skriv starttid som 10:00 (eller bare 1000).';
  else if (!tilOk) tidFeil = 'Skriv sluttid som 10:45 (eller bare 1045).';
  else if (!tidOk) tidFeil = 'Timen må slutte etter at den starter.';

  // Sluttiden følger starttiden (samme lengde) til læreren endrer den selv
  function endreFra(v) {
    setFra(v);
    const ny = tolkKlokkeslett(v);
    if (ny && fagVed) setFagInfo(fagVed(getMinutesFromTime(ny)));
    if (tilRort) return;
    const gammelStart = tolkKlokkeslett(fra);
    const gammelSlutt = tolkKlokkeslett(til);
    if (!ny) return;
    const lengde = gammelStart && gammelSlutt
      ? Math.max(5, getMinutesFromTime(gammelSlutt) - getMinutesFromTime(gammelStart))
      : 45;
    const s = getMinutesFromTime(ny) + lengde;
    if (s < 24 * 60) setTil(formatMinutesAsTime(s));
  }

  // Pent format når feltet forlates: «1000» blir «10:00»
  function pyntTid(v, sett) {
    const t = tolkKlokkeslett(v);
    if (t) sett(t);
  }

  function lagre(fest) {
    if (!kanLagre) {
      setVisFeil(true);
      // Feil i tiden kan bare rettes når tidsfeltene vises
      if (!tidOk) setUtvidet(true);
      return;
    }
    slettUtkast(gjelder);
    onLagre({
      id: eksisterende?.id || null, // ny time får id når den lagres
      dato: dagensDato(),
      dag,
      tittel: tittel.trim(),
      fag,
      fagNokkel,
      fra: fraOk,
      til: tilOk,
      maal: maal.trim(),
      // Avkrysninger beholdes for punkter (og underpunkter) med samme tekst
      punkter: struktur.map((p, i) => {
        // Samme tekst, ellers samme plass (en rettet skrivefeil skal ikke nullstille hakene)
        const gammel = eksisterende?.punkter?.find(x => x.tekst === p.tekst) || eksisterende?.punkter?.[i];
        const under = p.under.map(tekst => ({
          tekst,
          ferdig: !!gammel?.under?.find(u => u.tekst === tekst)?.ferdig,
        }));
        return { tekst: p.tekst, ferdig: under.length ? under.every(u => u.ferdig) : !!gammel?.ferdig, under };
      }),
      fast: fest,
      fastVed: fest ? minutter : null,
      skjult: false,
    });
  }

  function hurtigLagre(e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      lagre(true);
      return true;
    }
    return false;
  }

  function videreMedEnter(e, neste) {
    if (hurtigLagre(e)) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      neste?.current?.focus();
      neste?.current?.select?.();
    }
  }

  function endrePunkt(i, v) {
    setRader(prev => prev.map((r, j) => (j === i ? { ...r, tekst: v } : r)));
  }

  function leggTilPunkt(etter, nivaa = 0) {
    setRader(prev => {
      const neste = [...prev];
      neste.splice(etter + 1, 0, { tekst: '', nivaa });
      fokusPunkt.current = etter + 1;
      return neste;
    });
  }

  function fjernPunkt(i) {
    setRader(prev => {
      if (prev.length <= 1) { fokusPunkt.current = 0; return [{ tekst: '', nivaa: 0 }]; }
      fokusPunkt.current = Math.max(0, i - 1);
      const neste = prev.filter((_, j) => j !== i);
      // Øverste rad kan ikke være et underpunkt
      if (neste[0].nivaa === 1) neste[0] = { ...neste[0], nivaa: 0 };
      return neste;
    });
  }

  // Underpunkt ↔ punkt. Første rad har ikke noe punkt over seg og forblir et punkt.
  function settNivaa(i, nivaa) {
    if (i === 0 && nivaa === 1) return;
    setRader(prev => prev.map((r, j) => (j === i ? { ...r, nivaa } : r)));
    fokusPunkt.current = i;
  }

  function punktTast(e, i) {
    if (hurtigLagre(e)) return;
    const rad = rader[i];
    if (e.key === 'Tab') {
      // Tabulator gir underpunkt, Shift+Tabulator tilbake (på tastatur)
      if (e.shiftKey ? rad.nivaa === 1 : (i > 0 && rad.nivaa === 0)) {
        e.preventDefault();
        settNivaa(i, e.shiftKey ? 0 : 1);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!rad.tekst.trim()) {
        // Enter i et tomt underpunkt gjør det til et vanlig punkt, som i en tekstbehandler
        if (rad.nivaa === 1) settNivaa(i, 0);
        return;
      }
      if (rad.nivaa === 0 && rader[i + 1]?.nivaa === 1) {
        // Punktet har underpunkter: neste punkt kommer etter dem, så de blir der de er
        let slutt = i + 1;
        while (rader[slutt + 1]?.nivaa === 1) slutt += 1;
        leggTilPunkt(slutt, 0);
        return;
      }
      leggTilPunkt(i, rad.nivaa);
    } else if (e.key === 'Backspace' && !rad.tekst) {
      if (rad.nivaa === 1) { e.preventDefault(); settNivaa(i, 0); return; }
      if (rader.length > 1) { e.preventDefault(); fjernPunkt(i); }
    }
  }

  function limInn(e, i) {
    const tekst = e.clipboardData?.getData('text') || '';
    if (!tekst.includes('\n')) return;
    e.preventDefault();
    const nye = tolkLinjer(tekst, rader[i].nivaa);
    if (!nye.length) return;
    setRader(prev => {
      const neste = [...prev];
      const beholdes = prev[i].tekst.trim() ? [prev[i]] : [];
      neste.splice(i, 1, ...beholdes, ...nye);
      if (neste[0].nivaa === 1) neste[0] = { ...neste[0], nivaa: 0 };
      fokusPunkt.current = i + beholdes.length + nye.length - 1;
      return neste;
    });
  }

  function visFelt(ref, sett) {
    fokusFelt.current = ref;
    sett(true);
  }

  // ── Malen for faget ──
  const malStruktur = tilStruktur(tilRader(mal?.punkter));
  const punkterLikMal = !!mal && JSON.stringify(malStruktur) === JSON.stringify(struktur);
  const likMal = punkterLikMal && (mal.maal || '') === maal.trim();
  const visBrukMal = !!mal && malStruktur.length > 0 && !punkterLikMal;
  const elevmodus = !!skoleTjeneste() && erElev();

  function brukMal() {
    if (struktur.length && !confirm(`Erstatte punktene du har skrevet med malen for ${fag}?`)) return;
    const nye = tilRader(mal.punkter);
    setRader(nye);
    if (mal.maal && !maal.trim()) {
      setMaal(mal.maal);
      setVisMaal(true);
    }
    fokusPunkt.current = Math.max(0, nye.length - 1);
    setMalMelding('');
  }

  function lagreMal() {
    if (!editPermission || !struktur.length) return;
    if (mal && !confirm(`Erstatte malen for ${fag}?`)) return;
    onLagreMal(fagNokkel, {
      maal: maal.trim(),
      punkter: struktur.map(p => (p.under.length ? { tekst: p.tekst, under: p.under } : p.tekst)),
    });
    setMalMelding(`Lagret som mal for ${fag}. Neste gang henter du den med ett trykk.`);
  }

  const naa = minutter;
  const passert = slutt != null && naa >= slutt;
  const langtFram = start != null && naa < start - VIS_FOER_START;

  return (
    <AgendaVindu tittel={eksisterende ? 'Endre agendaen' : 'Agenda for timen'} onLukk={onAvbryt}>
      {eksisterende?.overfort && !utkast && (
        <div className="dt-utkast" role="status">Det som ikke ble krysset av sist, står her fortsatt. Trykk «Tøm» for å begynne på nytt.</div>
      )}
      {utkast && (
        <div className="dt-utkast" role="status">
          Fortsetter det du skrev kl. {new Date(utkast.lagret).toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' })}.
        </div>
      )}
      {!utvidet ? (
        <div className="dt-sammendrag">
          <FagMerke merke={merke || { symbol: null, farge: null }} />
          <span className="dt-sammendrag-fag">{fag}</span>
          <span className="dt-sammendrag-tid">{fraOk || fra}–{tilOk || til}</span>
          <button
            type="button"
            className="k-btn k-btn--liten dt-sammendrag-endre"
            id="time-endre"
            onClick={() => visFelt(tittelRef, setUtvidet)}
          ><Ikon navn="pencil" /> Endre</button>
        </div>
      ) : (
        <>
          <Info>Vises stort på tavla. Gjelder i dag, på denne skjermen.</Info>

          <label className="k-field">
            <span>Tittel</span>
            <input
              ref={tittelRef}
              type="text"
              id="time-tittel"
              className="k-input k-input--stor"
              placeholder={fag ? `${fag} (eller for eksempel «${fag} – tema»)` : 'For eksempel «Matematikk – brøk»'}
              value={tittel}
              onChange={e => setTittel(e.target.value)}
              onKeyDown={e => videreMedEnter(e, fraRef)}
              autoComplete="off"
            />
          </label>

          <div className="dt-tidsrad">
            <label className="k-field dt-tidsfelt">
              <span>Fra</span>
              <input
                ref={fraRef}
                type="text"
                id="time-fra"
                className="k-input k-input--stor dt-tid-input"
                inputMode="numeric"
                placeholder="10:00"
                maxLength={5}
                value={fra}
                onFocus={e => e.target.select()}
                onChange={e => endreFra(e.target.value)}
                onBlur={e => pyntTid(e.target.value, setFra)}
                onKeyDown={e => videreMedEnter(e, tilRef)}
                aria-invalid={visFeil && !fraOk ? true : undefined}
                autoComplete="off"
              />
            </label>
            <span className="dt-tidsstrek" aria-hidden="true">–</span>
            <label className="k-field dt-tidsfelt">
              <span>Til</span>
              <input
                ref={tilRef}
                type="text"
                id="time-til"
                className="k-input k-input--stor dt-tid-input"
                inputMode="numeric"
                placeholder="10:45"
                maxLength={5}
                value={til}
                onFocus={e => e.target.select()}
                onChange={e => { setTil(e.target.value); setTilRort(true); }}
                onBlur={e => pyntTid(e.target.value, setTil)}
                onKeyDown={e => videreMedEnter(e, visMaal ? maalRef : { current: punktRefs.current[0] })}
                aria-invalid={visFeil && !tidOk ? true : undefined}
                autoComplete="off"
              />
            </label>
            <span className="dt-varighet" aria-live="polite">{tidOk ? `${varighet} min` : ''}</span>
          </div>
          {tidFeil && (visFeil || (fra && til && fra.length >= 4 && til.length >= 4)) && (
            <p className="k-feil" role="alert">{tidFeil}</p>
          )}
        </>
      )}

      {(visMaal || utvidet) && (
        <label className="k-field">
          <span>Læringsmål</span>
          <input
            ref={maalRef}
            type="text"
            id="time-maal"
            className="k-input k-input--stor"
            placeholder="For eksempel «Jeg kan sammenligne brøker»"
            value={maal}
            onChange={e => setMaal(e.target.value)}
            onKeyDown={e => videreMedEnter(e, { current: punktRefs.current[0] })}
            autoComplete="off"
          />
        </label>
      )}

      <div className="k-field">
        <span id="time-agenda-tittel">Agenda <span className="dt-hint">Enter gir nytt punkt, <Ikon navn="corner-down-right" /> gjør det til et underpunkt</span></span>
        {visBrukMal && (
          <button type="button" className="k-btn k-btn--rediger dt-bruk-mal" id="time-bruk-mal" onClick={brukMal}>
            <Ikon navn="clipboard-list" /> Bruk malen for {fag}
            <span className="dt-bruk-mal-antall"> ({malStruktur.length} {malStruktur.length === 1 ? 'punkt' : 'punkter'})</span>
          </button>
        )}
        <ol className="dt-punktliste" aria-labelledby="time-agenda-tittel">
          {rader.map((r, i) => (
            <li key={i} className={`dt-punktrad${r.nivaa === 1 ? ' dt-punktrad--under' : ''}`}>
              <span className="dt-punktnr" aria-hidden="true">{merker[i].merke}</span>
              <input
                ref={el => { punktRefs.current[i] = el; }}
                type="text"
                className="k-input"
                id={i === 0 ? 'time-punkt-1' : undefined}
                aria-label={merker[i].navn}
                placeholder={i === 0 ? 'For eksempel «Oppstart»' : (r.nivaa === 1 ? 'Delsteg' : 'Neste punkt')}
                value={r.tekst}
                onChange={e => endrePunkt(i, e.target.value)}
                onKeyDown={e => punktTast(e, i)}
                onPaste={e => limInn(e, i)}
                autoComplete="off"
              />
              <button
                type="button"
                className={`k-close dt-nivaa${r.nivaa === 1 ? ' er-under' : ''}`}
                aria-label={r.nivaa === 1 ? `Gjør ${merker[i].navn.toLowerCase()} til et vanlig punkt` : `Gjør ${merker[i].navn.toLowerCase()} til et underpunkt`}
                title={r.nivaa === 1 ? 'Gjør til vanlig punkt' : 'Gjør til underpunkt'}
                disabled={i === 0}
                onClick={() => settNivaa(i, r.nivaa === 1 ? 0 : 1)}
              ><Ikon navn={r.nivaa === 1 ? 'arrow-left' : 'corner-down-right'} /></button>
              {(rader.length > 1 || r.tekst) && (
                <button type="button" className="k-close dt-fjern" aria-label={`Fjern ${merker[i].navn.toLowerCase()}`} onClick={() => fjernPunkt(i)}>
                  <Ikon navn="x" />
                </button>
              )}
            </li>
          ))}
        </ol>
        <div className="dt-tillegg">
          <button type="button" className="k-btn k-btn--ny k-btn--liten dt-nytt-punkt" onClick={() => leggTilPunkt(rader.length - 1)}>
            <Ikon navn="plus" /> Nytt punkt
          </button>
          {!visMaal && !utvidet && (
            <button type="button" className="k-btn k-btn--liten dt-vis-maal" id="time-vis-maal" onClick={() => visFelt(maalRef, setVisMaal)}>
              <Ikon navn="target" /> Læringsmål
            </button>
          )}
        </div>
      </div>

      {visFeil && !harInnhold && <p className="k-feil" role="alert">Skriv minst ett agendapunkt (eller et mål).</p>}
      {passert && tidOk && (
        <Info>Tiden er passert i dag. Agendaen står på tavla til du skjuler den.</Info>
      )}

      <div className="k-dialog-actions">
        <button type="button" id="time-vis" className="k-btn k-btn--ny k-btn--fylt" onClick={() => lagre(true)}>
          <Ikon navn="check" /> Vis på tavla
        </button>
        {langtFram && tidOk && (
          <button type="button" id="time-lagre-senere" className="k-btn k-btn--tilbake" onClick={() => lagre(false)}>
            Vis først kl. {formatMinutesAsTime(start - VIS_FOER_START)}
          </button>
        )}
        <button type="button" className="k-btn k-btn--tilbake" onClick={onAvbryt} title="Det du har skrevet tas vare på til neste gang">Lukk</button>
        {(eksisterende || utkast || harInnhold) && (
          <button
            type="button"
            className="k-btn k-btn--slett"
            id="time-tom"
            title="Fjerner punktene, målet og tittelen, så du kan begynne på nytt"
            onClick={() => {
              if (!confirm('Tømme agendaen? Punktene, målet og tittelen fjernes.')) return;
              slettUtkast(gjelder);
              onTom?.(eksisterende?.id || null);
            }}
          ><Ikon navn="trash-2" /> Tøm</button>
        )}
      </div>

      {fagNokkel && (
        <div className="dt-mal-rad">
          <button
            type="button"
            className="k-btn k-btn--liten dt-lagre-mal"
            id="time-lagre-mal"
            disabled={!editPermission || !struktur.length || likMal}
            onClick={lagreMal}
          ><Ikon navn="download" /> Lagre som mal for {fag}</button>
          <span className="dt-mal-hint" role="status">
            {malMelding || (!editPermission
              ? (elevmodus
                ? 'Logg inn som lærer i «Klasse og timeplan» for å lagre maler.'
                : 'Trykk «Lås opp» i «Klasse og timeplan» for å lagre maler.')
              : (likMal ? 'Agendaen er lik malen.' : ''))}
          </span>
        </div>
      )}
    </AgendaVindu>
  );
}

/**
 * Vinduet rundt agendaen: ligger over tavla uten å dekke den, kan dras i
 * toppen og endres i størrelse i hjørnet, så det kan stå ved siden av
 * nedtelleren. Plassen huskes.
 */
function AgendaVindu({ tittel, onLukk, children }) {
  const { ref, stil, flyttHandlere, skalerHandlere, tilAndreSide, tilVenstre } = useFlyttbartVindu('klasseskjerm.agendaVindu', { minB: 340, minH: 300 });

  // Nedtelleren legger seg på motsatt side, så de kan stå side om side
  useEffect(() => {
    document.body.classList.add('agenda-vindu-apen');
    document.body.classList.toggle('agenda-til-venstre', tilVenstre);
    return () => document.body.classList.remove('agenda-vindu-apen', 'agenda-til-venstre');
  }, [tilVenstre]);

  // Ligger vinduene oppå hverandre (stående iPad), kommer det man sist rørte, øverst
  useEffect(() => {
    document.body.classList.add('agenda-forrest');
    function vedTrykk(e) {
      const iAgenda = ref.current?.contains(e.target);
      const iNedteller = e.target.closest?.('#timer-panel');
      if (iAgenda) document.body.classList.add('agenda-forrest');
      else if (iNedteller) document.body.classList.remove('agenda-forrest');
    }
    document.addEventListener('pointerdown', vedTrykk, true);
    return () => {
      document.removeEventListener('pointerdown', vedTrykk, true);
      document.body.classList.remove('agenda-forrest');
    };
  }, [ref]);

  // Escape lukker når markøren står i vinduet (utkastet tas vare på)
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (!ref.current?.contains(document.activeElement)) return;
      e.preventDefault();
      onLukk?.();
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onLukk, ref]);

  return createPortal(
    <section
      ref={ref}
      className="agenda-vindu"
      style={stil}
      role="dialog"
      aria-modal="false"
      aria-label={tittel}
    >
      <header className="agenda-vindu-hode" {...flyttHandlere}>
        <h2 className="agenda-vindu-tittel">{tittel}</h2>
        <button
          type="button"
          className="k-close agenda-vindu-knapp"
          aria-label={tilVenstre ? 'Flytt vinduet til høyre side' : 'Flytt vinduet til venstre side'}
          title={tilVenstre ? 'Flytt til høyre' : 'Flytt til venstre'}
          onClick={tilAndreSide}
        ><Ikon navn="columns-2" /></button>
        <button type="button" className="k-close agenda-vindu-knapp" aria-label="Lukk (utkastet tas vare på)" title="Lukk" onClick={onLukk}>
          <Ikon navn="x" />
        </button>
      </header>
      <div className="k-dialog k-dialog--time agenda-vindu-innhold">
        {children}
      </div>
      <div className="agenda-vindu-grep" aria-hidden="true" {...skalerHandlere} />
    </section>,
    document.body,
  );
}

export function PlanleggTimeDialog(props) {
  return props.open ? <PlanleggTimeInner {...props} /> : null;
}
