import { useEffect } from 'react';
import { getCountdownRemainingDisplay } from '../utils/schedule.js';
import Ballong from './Ballong.jsx';
import useSprekkBallong from '../hooks/useSprekkBallong.js';

export default function CountdownStack({ countdowns, countdownsVisible, onEditCountdown, bursdager = [], onSprekk, onBlaasOpp }) {
  const visNedtellinger = countdowns.length > 0 && countdownsVisible !== false;
  // Bursdagene står i samme rad, så de får plassen raden alltid har
  const shouldShow = visNedtellinger || bursdager.length > 0;
  const { sprekker, sprekk, blaases, blaas } = useSprekkBallong(onSprekk, onBlaasOpp);

  // Hovedkortet gir plass til raden med «Dager til» når den vises
  useEffect(() => {
    document.body.classList.toggle('har-dager-til', shouldShow);
    return () => document.body.classList.remove('har-dager-til');
  }, [shouldShow]);

  return (
    <div className={`countdown-stack${shouldShow ? ' active' : ''}`} aria-live="polite">
      {bursdager.map(b => {
        // Sprukket: en liten slapp ballong blir igjen, og et trykk blåser den opp igjen
        if (b.sprukket) {
          return (
            <button
              key={`${b.nokkel}-slapp`}
              type="button"
              className="countdown-card bursdag-slapp"
              onClick={() => blaas(b.nokkel)}
              title={`Blås opp ballongen til ${b.fornavn} igjen`}
              aria-label={`Blås opp ballongen til ${b.fornavn} igjen`}
            >
              <Ballong navn={b.fornavn} className="bursdag-ballong" slapp />
            </button>
          );
        }
        const smell = sprekker.includes(b.nokkel);
        return (
        <button
          key={b.nokkel}
          type="button"
          className={`countdown-card bursdag-kort${b.tid === 'i-dag' ? ' er-i-dag' : ''}${smell ? ' sprekker' : ''}`}
          onClick={() => sprekk(b.nokkel)}
          title="Trykk for å sprekke ballongen"
          aria-label={`${b.setning[0]}${b.fornavn}${b.setning[1]} Trykk for å sprekke ballongen.`}
        >
          <Ballong navn={b.fornavn} className="bursdag-ballong" sprekker={smell} blaases={blaases.includes(b.nokkel)} />
          <span className="bursdag-tekst">
            <span className="bursdag-navn">{b.fornavn}</span>
            <span className="bursdag-nar">{b.undertekst}</span>
          </span>
        </button>
        );
      })}
      {visNedtellinger && countdowns.map((item, index) => {
        const display = getCountdownRemainingDisplay(item.targetDate, item.targetTime);
        return (
          <button
            key={item.id || index}
            type="button"
            className="countdown-card"
            onClick={() => onEditCountdown(index)}
            title="Endre eller slett"
          >
            <span className="countdown-card-title">{item.title}</span>
            <span className="countdown-card-number">{display.value}</span>
            <span className="countdown-card-unit">{display.unit}</span>
          </button>
        );
      })}
    </div>
  );
}
