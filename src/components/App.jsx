import { useEffect, useState } from 'react';
import { useAppState } from '../hooks/useAppState.js';
import { getOsloTimeAndDay, getMinutesFromTime } from '../utils/time.js';
import { getClassScheduleState, normalizeActiveTimelineClassNames, getTempScheduleKey } from '../utils/schedule.js';

import Stars from './Stars.jsx';
import { applyBodyClasses } from '../utils/tema.js';
import StatusBar from './StatusBar.jsx';
import MainContainer from './MainContainer.jsx';
import ElevPortrett from './ElevPortrett.jsx';
import Timeline from './Timeline.jsx';
import Toolbox from './Toolbox.jsx';
import TimePicker from './TimePicker.jsx';
import CountdownStack from './CountdownStack.jsx';
import TimerPanel from './TimerPanel.jsx';
import NotePanel from './NotePanel.jsx';
import SplitScreen from './SplitScreen.jsx';
import ShareModal from './ShareModal.jsx';
import ReceiveShareModal from './ReceiveShareModal.jsx';
import { readShareTokenFromLocation, clearShareHashFromLocation, decodeShareToken } from '../utils/share.js';
import { getCurrentSubjectColor } from '../utils/color.js';
import WallScreen from './WallScreen.jsx';
import ForsteMote from './ForsteMote.jsx';
import { DagensTimeKort, PlanleggTimeDialog } from './DagensTime.jsx';
import { useDagensTime, finnSynligTime, dagensDato, timeTittel, agendaFor } from '../hooks/useDagensTime.js';
import { formatMinutesAsTime } from '../utils/time.js';
import { normalizeSubjectLabel, getStoredSubjectEmoji, formatExpandedActivityLabel } from '../utils/schedule.js';

/** Klassen (og faget per klasse) som sist ble valgt i agendavinduet */
const AGENDA_KLASSE_KEY = 'klasseskjerm.agendaKlasse';
const AGENDA_FAG_KEY = 'klasseskjerm.agendaFag';
/** Ikke fag: kommer ikke med i fagmenyen */
const IKKE_FAG = new Set(['Pause', 'Mat', 'Storefri', 'FRI', 'Fri']);
import useBursdager from '../hooks/useBursdager.js';
import { readWallModePreference, WALL_MODE_KEY } from '../utils/wallMode.js';
import { safeGetItem, safeSetItem, safeRemoveItem } from '../utils/storage.js';
import {
  EditModal,
  CountdownModal,
  LoginModal,
  ColorDetailModal,
} from './Modals.jsx';

export default function App() {
  const state = useAppState();
  const {
    classes,
    currentClassName,
    currentClass,
    activeTimelineClassNames,
    tempScheduleChanges,
    editPermission,
    simState,
    themeMode,
    timerPanelOpen, setTimerPanelOpen,
    noteOpen, setNoteOpen,
    underTheHoodOpen, setUnderTheHoodOpen,
    underTheHoodView, setUnderTheHoodView,
    scheduleEditorDraft, setScheduleEditorDraft,  // eslint-disable-line no-unused-vars
    timePickerOpen, setTimePickerOpen,
    editModal, setEditModal,
    countdownModal, setCountdownModal,
    loginModalOpen, setLoginModalOpen,
    colorDetailModal, setColorDetailModal,
    selectClass,
    toggleTimelineClass,
    renameCurrentClass,
    deleteCurrentClass,
    addNewClass,
    setThemeMode,
    grantEditPermission,
    revokeEditPermission,
    resetToRealTime,
    applySimTime,
    updateTempSchedule,
    saveCountdown,
    deleteCountdown,
    toggleCountdownVisibility,
    lagreTimeMal,
    saveSubjectColor,
    generatePalette,
    saveScheduleFromDraft,  // eslint-disable-line no-unused-vars
    saveScheduleV2,
    importSharedClass,
    undoLastImport,
    canUndoImport,
    lastImportInfo,
  } = state;

  // «Agenda for timen»: tittel, tid, mål og agenda på tavla
  const dagensTime = useDagensTime();
  const [planleggOpen, setPlanleggOpen] = useState(false);
  const [planleggId, setPlanleggId] = useState(null);
  // Forslaget fryses når dialogen åpnes, så faget ikke bytter ved et timeskifte
  const [planleggForslag, setPlanleggForslag] = useState(null);
  const [planleggValg, setPlanleggValg] = useState({ klasse: '', fagNokkel: '' });
  // Åpnet fra blyanten på tavla: fagmenyen endrer ikke klassevalget læreren har
  const [planleggHusk, setPlanleggHusk] = useState(true);
  // Ny runde = vinduet bygges på nytt (ny agenda åpnet, eller «Start på nytt»)
  const [planleggRunde, setPlanleggRunde] = useState(0);

  // Clock tick state
  const [tick, setTick] = useState(0);  // eslint-disable-line no-unused-vars

  // Veggskjerm: egen visning for en liten skjerm langt unna
  const [wallMode, setWallMode] = useState(readWallModePreference);
  function enterWallMode() {
    safeSetItem(WALL_MODE_KEY, 'vegg');
    setWallMode(true);
  }
  function exitWallMode() {
    safeRemoveItem(WALL_MODE_KEY);
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('visning')) {
        url.searchParams.delete('visning');
        window.history.replaceState(null, '', url.pathname + url.search + url.hash);
      }
    } catch { /* adressen lar seg ikke endre; visningen bytter uansett */ }
    setWallMode(false);
  }

  // Deling av timeplan via lenke
  const [shareOpen, setShareOpen] = useState(false);
  const [receiveState, setReceiveState] = useState(null); // { status, payload, error, replaced }

  useEffect(() => {
    // Kjøres ved oppstart og hver gang #-delen endres. Hashen fjernes med en
    // gang, så StrictMode sin andre kjøring og en ny klikk på samme lenke
    // begge oppfører seg riktig.
    function handleIncomingLink() {
      const token = readShareTokenFromLocation();
      if (!token) return;
      clearShareHashFromLocation();
      try {
        const payload = decodeShareToken(token);
        setReceiveState({ status: 'ask', payload });
      } catch (err) {
        setReceiveState({ status: 'error', error: err?.message || 'Lenken kunne ikke leses.' });
      }
    }
    handleIncomingLink();
    window.addEventListener('hashchange', handleIncomingLink);
    return () => window.removeEventListener('hashchange', handleIncomingLink);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Apply theme body classes
  useEffect(() => {
    applyBodyClasses(themeMode);
  }, [themeMode]);

  // Apply under-the-hood class to body
  useEffect(() => {
    if (underTheHoodOpen) document.body.classList.add('under-the-hood-active');
    else document.body.classList.remove('under-the-hood-active');
  }, [underTheHoodOpen]);

  useEffect(() => {
    document.body.classList.toggle('vegg-aktiv', wallMode);
    return () => document.body.classList.remove('vegg-aktiv');
  }, [wallMode]);

  // Compute current time info
  const { osloTime, currentDay, realDay, realOsloTime } = getOsloTimeAndDay(simState);
  const isSim = !!(simState.simDay || simState.simHour != null || simState.simMinute != null);
  const currentTime = isSim ? osloTime : realOsloTime;
  const currentMinutes = getMinutesFromTime(currentTime);
  const realMinutes = getMinutesFromTime(realOsloTime);
  const currentSeconds = isSim ? 0 : new Date().getSeconds();

  // Status bar date
  const now = new Date();
  const dateStr = now.toLocaleDateString('no-NO', { day: 'numeric', month: 'long', timeZone: 'Europe/Oslo' });
  const [currentHour, currentMinute] = currentTime.split(':').map(Number);

  // Compute schedule states
  const timelineClassNames = normalizeActiveTimelineClassNames(activeTimelineClassNames, classes, currentClassName);
  const primaryState = getClassScheduleState(currentClassName, currentDay, currentMinutes, classes, tempScheduleChanges);
  const displayStates = timelineClassNames
    .map(name => getClassScheduleState(name, currentDay, currentMinutes, classes, tempScheduleChanges))
    .filter(Boolean);
  // Bursdagene for klassene som vises (bare på skolens egen adresse).
  // En sprukket ballong blåses opp igjen når neste time starter: «økta» er
  // starten på timen som pågår, eller timen som var sist (i friminuttet).
  const okt = (primaryState?.normalizedDayEvents || [])
    .filter(e => e.type === 'class' && e.start <= currentMinutes)
    .reduce((siste, e) => Math.max(siste, e.start), -1);
  const { bursdager, ballonger, sprekk: sprekkBallong, blaasOpp: blaasOppBallong } = useBursdager(displayStates.map(s => s.className), okt);

  const isWeekend = (now.getDay() === 0 || now.getDay() === 6) && !isSim;

  // Nedtelleren følger fargen til faget som pågår
  const currentSubject = getCurrentSubjectColor(primaryState);

  // Count downs for stack
  const countdowns = currentClass?.customCountdowns || [];
  const countdownsVisible = currentClass?.countdownsVisible !== false;

  // Subject color for modal
  const colorModalSubject = colorDetailModal?.subject;
  const colorModalCurrentColor = colorModalSubject
    ? (currentClass?.subjectColors?.[colorModalSubject] || '#ffffff')
    : '#ffffff';
  const colorModalCurrentEmoji = colorModalSubject
    ? (currentClass?.subjectEmojis?.[colorModalSubject] || 'palette')
    : 'palette';

  // Timen som står på tavla nå, og forslag til tid når en ny time settes opp
  const synligTime = finnSynligTime(dagensTime.timer, dagensDato(), currentDay, currentMinutes);
  const planleggEksisterende = planleggId ? (dagensTime.timer.find(t => t.id === planleggId) || null) : null;
  // Agendaer fra før de fikk klasse: knyttes til klassen som vises
  const giAgendaKlasse = dagensTime.giKlasse;
  useEffect(() => { if (currentClassName) giAgendaKlasse(currentClassName); }, [currentClassName, giAgendaKlasse]);

  // ── «Agenda for timen»: én agenda per klasse og fag ──
  // Klassene læreren har aktive i tidslinja; valget i agendavinduet huskes
  const agendaKlasser = timelineClassNames.filter(n => classes[n]);
  function huskAgendaKlasse() {
    const lagret = safeGetItem(AGENDA_KLASSE_KEY);
    return lagret && agendaKlasser.includes(lagret) ? lagret : currentClassName;
  }
  function okterFor(klasse) {
    const state = klasse === currentClassName
      ? primaryState
      : getClassScheduleState(klasse, currentDay, currentMinutes, classes, tempScheduleChanges);
    return (state?.normalizedDayEvents || []).filter(e => e.type === 'class');
  }
  // Alle fagene i en time («Kroppsøving 8. / Matematikk 9.» har to)
  function fagIOkt(okt) {
    const aktivitet = okt.displayActivity || okt.activity;
    return String(aktivitet || '').split('/').map(a => normalizeSubjectLabel(a.trim())).filter(Boolean);
  }
  // Fagene i klassens timeplan, til nedtrekksmenyen
  function fagValg(klasse) {
    const fag = new Set();
    Object.values(classes[klasse]?.schedule || {}).forEach(dag => (dag || []).forEach(e => {
      String(e?.activity || '').split('/').forEach(a => {
        const n = normalizeSubjectLabel(a.trim());
        if (n && !IKKE_FAG.has(n)) fag.add(n);
      });
    }));
    return [...fag]
      .map(nokkel => ({ nokkel, navn: formatExpandedActivityLabel(nokkel) }))
      .sort((a, b) => a.navn.localeCompare(b.navn, 'nb'));
  }
  // Faget som er nå (eller neste time) i klassen. Har timen flere fag, velges
  // det læreren sist valgte for klassen, hvis det er ett av dem.
  function naavaerendeFag(klasse) {
    const okter = okterFor(klasse);
    const okt = okter.find(e => currentMinutes >= e.start && currentMinutes < e.end)
      || okter.find(e => e.start > currentMinutes);
    if (!okt) return '';
    const deler = fagIOkt(okt);
    const sist = safeGetItem(`${AGENDA_FAG_KEY}.${klasse}`);
    return sist && deler.includes(sist) ? sist : (deler[0] || '');
  }
  // Tid for agendaen: fagets time i dag (pågår, ellers neste, ellers siste).
  // Har faget ingen time i dag (eller agendaen er uten fag), lånes ikke tiden
  // til et annet fag: da foreslås de neste 45 minuttene, og tiden vises.
  function lagForslag(klasse, fagNokkel) {
    const fag = fagNokkel ? formatExpandedActivityLabel(fagNokkel) : '';
    const avFaget = fagNokkel ? okterFor(klasse).filter(e => fagIOkt(e).includes(fagNokkel)) : [];
    const okt = avFaget.find(e => currentMinutes >= e.start && currentMinutes < e.end)
      || avFaget.find(e => e.start > currentMinutes)
      || avFaget[avFaget.length - 1];
    if (okt) return { fra: formatMinutesAsTime(okt.start), til: formatMinutesAsTime(okt.end), fag, fagNokkel, fraTimeplan: true };
    const start = Math.min(23 * 60, Math.ceil((currentMinutes + 1) / 5) * 5);
    return { fra: formatMinutesAsTime(start), til: formatMinutesAsTime(Math.min(start + 45, 23 * 60 + 59)), fag, fagNokkel, fraTimeplan: false };
  }
  // Fagets symbol og farge, som på «Akkurat nå»: øverst på kortet og i vinduet
  function fagMerke(fagNokkel, klasse = currentClassName) {
    const data = classes[klasse || currentClassName];
    if (!fagNokkel || !data) return null;
    const navn = klasse || currentClassName;
    const symbol = getStoredSubjectEmoji(navn, fagNokkel, { [navn]: data });
    const farge = getCurrentSubjectColor({ currentActivity: fagNokkel, classData: data })?.color || null;
    return { symbol: symbol && symbol !== 'circle-help' ? symbol : null, farge };
  }
  /**
   * Åpner (eller bytter til) agendaen for en klasse og et fag. Uten fag:
   * faget som er nå i klassen, ellers det som sist ble valgt for klassen.
   * `husk`: valget i menyene blir stående til læreren endrer det.
   */
  function velgAgenda(klasse, fagNokkel, husk = true, id = null) {
    const fag = fagNokkel ?? (naavaerendeFag(klasse) || safeGetItem(`${AGENDA_FAG_KEY}.${klasse}`) || '');
    if (husk) {
      safeSetItem(AGENDA_KLASSE_KEY, klasse);
      safeSetItem(`${AGENDA_FAG_KEY}.${klasse}`, fag);
    }
    setPlanleggHusk(husk);
    setPlanleggValg({ klasse, fagNokkel: fag });
    setPlanleggForslag(lagForslag(klasse, fag));
    setPlanleggId(id ?? agendaFor(dagensTime.timer, klasse, fag, currentClassName)?.id ?? null);
    setPlanleggRunde(n => n + 1);
    setPlanleggOpen(true);
  }
  function openPlanlegg(id) {
    // Blyanten på tavla: akkurat den agendaen (klassevalget i menyen står)
    const valgt = id && dagensTime.timer.find(t => t.id === id);
    if (valgt) {
      velgAgenda(valgt.klasse || currentClassName, valgt.fagNokkel || '', false, valgt.id);
      return;
    }
    // Ellers: klassen læreren sist valgte, med faget som er nå
    velgAgenda(huskAgendaKlasse(), null);
  }

  // Handler: open edit modal from timeline
  function handleOpenEditModal({ eventKey, legacyEventKey, displayActivity, hasTempActivity }) {
    setEditModal({ eventKey, legacyEventKey, displayActivity, hasTempActivity });
  }

  // Handler: lock toggle
  function handleToggleLock() {
    if (editPermission) {
      if (confirm('Vil du låse igjen? Da kan ingen endre timeplan, fag og klasser før noen låser opp.')) {
        revokeEditPermission();
        // Låsen står i «Klasse og timeplan»: bli der, men tilbake til klassevalget
        setUnderTheHoodView('classGrid');
      }
    } else {
      setLoginModalOpen(true);
    }
  }

  if (wallMode) {
    return (
      <>
        <Stars />
        <WallScreen
          primaryState={primaryState}
          displayStates={displayStates}
          currentMinutes={currentMinutes}
          currentDay={currentDay}
          currentTime={currentTime}
          dateStr={dateStr}
          isWeekend={isWeekend}
          classes={classes}
          activeTimelineClassNames={activeTimelineClassNames}
          tempScheduleChanges={tempScheduleChanges}
          realMinutes={realMinutes}
          isSim={isSim}
          themeMode={themeMode}
          bursdager={bursdager}
          onExit={exitWallMode}
        />
        <TimerPanel
          open={timerPanelOpen}
          onClose={() => setTimerPanelOpen(false)}
          onRequestOpen={() => setTimerPanelOpen(true)}
          subjectColor={currentSubject?.color || null}
          subjectName={currentSubject?.name || null}
        />
        <ReceiveShareModal
          state={receiveState}
          hasExisting={!!(receiveState?.payload && Object.hasOwn(classes, receiveState.payload.name))}
          canUndo={canUndoImport}
          onAccept={() => {
            if (!receiveState?.payload) return;
            try {
              const { replaced } = importSharedClass(receiveState.payload);
              setReceiveState(prev => ({ ...prev, status: 'done', replaced }));
            } catch (err) {
              console.error('Import av delt timeplan feilet:', err);
              setReceiveState({ status: 'error', error: 'Kunne ikke legge til timeplanen.' });
            }
          }}
          onUndo={() => { undoLastImport(); setReceiveState(null); }}
          onClose={() => setReceiveState(null)}
        />
      </>
    );
  }

  return (
    <>
      <div className="noise-bg"></div>
      <Stars />

      <div className="split-surface">
        <div
          id="split-top"
          className="split-layer"
          style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: '5vh' }}
        >
          <Toolbox
            themeMode={themeMode}
            onSetTheme={setThemeMode}
            onOpenTimer={() => setTimerPanelOpen(true)}
            onOpenPlanlegg={() => openPlanlegg()}
            onOpenNote={() => setNoteOpen(true)}
            onOpenClass={() => { setUnderTheHoodOpen(true); setUnderTheHoodView('classGrid'); }}
            currentClass={currentClass}
            onAddCountdown={() => setCountdownModal({ index: null })}
            onToggleCountdownVisibility={toggleCountdownVisibility}
            onEnterWallMode={enterWallMode}
          />
          {synligTime ? (
            <DagensTimeKort
              time={synligTime}
              merke={fagMerke(synligTime.fagNokkel, synligTime.klasse)}
              minutter={currentMinutes}
              onEndre={() => openPlanlegg(synligTime.id)}
              onSkjul={() => dagensTime.skjulTime(synligTime.id)}
              onVekslePunkt={(i, j) => dagensTime.vekslePunkt(synligTime.id, i, j)}
            />
          ) : (
            <MainContainer
              primaryState={primaryState}
              displayStates={displayStates}
              currentMinutes={currentMinutes}
              currentSeconds={currentSeconds}
              isWeekend={isWeekend}
              currentDay={currentDay}
            />
          )}
          <ElevPortrett
            primaryState={primaryState}
            displayStates={displayStates}
            currentMinutes={currentMinutes}
            currentSeconds={currentSeconds}
            currentDay={currentDay}
            isWeekend={isWeekend}
            classes={classes}
            currentClassName={currentClassName}
            tempScheduleChanges={tempScheduleChanges}
            editPermission={editPermission}
            onOpenEditModal={handleOpenEditModal}
            countdowns={countdowns}
            countdownsVisible={countdownsVisible}
            onEditCountdown={(index) => setCountdownModal({ index })}
            dagensTime={synligTime}
            onOpenTimer={() => setTimerPanelOpen(true)}
            bursdager={ballonger}
            onSprekk={sprekkBallong}
            onBlaasOpp={blaasOppBallong}
          />
        </div>

        <div
          id="split-bottom"
          className="split-layer"
          style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', paddingTop: '5vh' }}
        >
          <Timeline
            classes={classes}
            currentDay={currentDay}
            currentMinutes={currentMinutes}
            useRealTime={!isSim}
            realMinutes={realMinutes}
            activeTimelineClassNames={activeTimelineClassNames}
            tempScheduleChanges={tempScheduleChanges}
            editPermission={editPermission}
            themeMode={themeMode}
            onOpenEditModal={handleOpenEditModal}
          />
        </div>
      </div>

      <ForsteMote
        klassenavn={currentClassName}
        skjult={!!receiveState || underTheHoodOpen}
        onOpenPlanlegg={() => openPlanlegg()}
        onOpenTimer={() => setTimerPanelOpen(true)}
        onOpenNote={() => setNoteOpen(true)}
        onOpenClass={() => { setUnderTheHoodOpen(true); setUnderTheHoodView('classGrid'); }}
      />

      <StatusBar
        currentDay={currentDay}
        currentHour={currentHour}
        currentMinute={currentMinute}
        dateStr={dateStr}
        isSim={isSim}
        onResetSim={resetToRealTime}
      />

      <CountdownStack
        countdowns={countdowns}
        countdownsVisible={countdownsVisible}
        onEditCountdown={(index) => setCountdownModal({ index })}
        bursdager={ballonger}
        onSprekk={sprekkBallong}
        onBlaasOpp={blaasOppBallong}
      />

      <TimerPanel
        open={timerPanelOpen}
        onClose={() => setTimerPanelOpen(false)}
        onRequestOpen={() => setTimerPanelOpen(true)}
        subjectColor={currentSubject?.color || null}
        subjectName={currentSubject?.name || null}
        lessonTitle={synligTime ? (timeTittel(synligTime) || null) : null}
      />

      <TimePicker
        open={timePickerOpen}
        onApply={(day, hour, minute) => {
          applySimTime(day, parseInt(hour, 10), parseInt(minute, 10));
          setTimePickerOpen(false);
        }}
        onClose={() => setTimePickerOpen(false)}
      />

      <SplitScreen
        open={underTheHoodOpen}
        view={underTheHoodView}
        setView={setUnderTheHoodView}
        classes={classes}
        currentClassName={currentClassName}
        currentClass={currentClass}
        activeTimelineClassNames={activeTimelineClassNames}
        editPermission={editPermission}
        onClose={() => setUnderTheHoodOpen(false)}
        onToggleLock={handleToggleLock}
        onOpenTimePicker={() => { setUnderTheHoodOpen(false); setTimePickerOpen(true); }}
        onSelectClass={selectClass}
        onToggleTimelineClass={toggleTimelineClass}
        onAddNewClass={addNewClass}
        onRenameClass={(gammelt, nytt) => {
          renameCurrentClass(gammelt, nytt);
          // Agendaene, menyvalget og utkastene følger klassen
          dagensTime.byttKlasseNavn(gammelt, nytt);
          if (safeGetItem(AGENDA_KLASSE_KEY) === gammelt) safeSetItem(AGENDA_KLASSE_KEY, nytt);
          const sistFag = safeGetItem(`${AGENDA_FAG_KEY}.${gammelt}`);
          if (sistFag !== null) safeSetItem(`${AGENDA_FAG_KEY}.${nytt}`, sistFag);
        }}
        onDeleteClass={deleteCurrentClass}
        onSaveScheduleV2={saveScheduleV2}
        onPickColor={(subject) => setColorDetailModal({ subject })}
        onGeneratePalette={() => { generatePalette(); }}
        onOpenColorModal={(subject) => setColorDetailModal({ subject })}
        onOpenShare={() => setShareOpen(true)}
        canUndoImport={canUndoImport}
        lastImportInfo={lastImportInfo}
        onUndoImport={undoLastImport}
      />

      <ShareModal
        open={shareOpen}
        classData={currentClass}
        className={currentClassName}
        onClose={() => setShareOpen(false)}
      />

      <ReceiveShareModal
        state={receiveState}
        hasExisting={!!(receiveState?.payload && Object.hasOwn(classes, receiveState.payload.name))}
        canUndo={canUndoImport}
        onAccept={() => {
          if (!receiveState?.payload) return;
          try {
            const { replaced } = importSharedClass(receiveState.payload);
            setReceiveState(prev => ({ ...prev, status: 'done', replaced }));
          } catch (err) {
            console.error('Import av delt timeplan feilet:', err);
            setReceiveState({ status: 'error', error: 'Kunne ikke legge til timeplanen.' });
          }
        }}
        onUndo={() => { undoLastImport(); setReceiveState(null); }}
        onClose={() => setReceiveState(null)}
      />

      <NotePanel
        open={noteOpen}
        onClose={() => setNoteOpen(false)}
      />

      <PlanleggTimeDialog
        key={planleggRunde}
        open={planleggOpen}
        eksisterende={planleggEksisterende}
        forslag={planleggForslag}
        klasse={planleggValg.klasse}
        fagNokkel={planleggValg.fagNokkel}
        klasser={agendaKlasser}
        fagValg={fagValg}
        onVelg={(klasse, fag, fraKlassemenyen) => velgAgenda(klasse, fag, fraKlassemenyen || planleggHusk)}
        maler={classes[planleggValg.klasse]?.timeMaler || {}}
        merkeFor={(nokkel) => fagMerke(nokkel, planleggValg.klasse)}
        editPermission={editPermission}
        onLagreMal={(nokkel, mal) => lagreTimeMal(nokkel, mal, planleggValg.klasse)}
        minutter={currentMinutes}
        dag={currentDay}
        onLagre={(time) => { dagensTime.lagreTime(time); setPlanleggOpen(false); }}
        onAvbryt={() => setPlanleggOpen(false)}
        onTom={(id) => {
          // «Tøm»: agendaen fjernes, og vinduet står klart for en ny
          if (id) dagensTime.slettTime(id);
          setPlanleggId(null);
          setPlanleggForslag(lagForslag(planleggValg.klasse, planleggValg.fagNokkel));
          setPlanleggRunde(n => n + 1);
        }}
      />

      {/* Modals */}
      <EditModal
        open={!!editModal}
        displayActivity={editModal?.displayActivity || ''}
        hasTempActivity={editModal?.hasTempActivity || false}
        onSave={(newActivity) => {
          if (editModal) {
            updateTempSchedule(prev => ({
              ...prev,
              changes: {
                ...prev.changes,
                [editModal.eventKey]: newActivity,
              }
            }));
          }
          setEditModal(null);
        }}
        onReset={() => {
          if (editModal) {
            updateTempSchedule(prev => {
              const next = { ...prev, changes: { ...prev.changes } };
              delete next.changes[editModal.eventKey];
              delete next.changes[editModal.legacyEventKey];
              return next;
            });
          }
          setEditModal(null);
        }}
        onCancel={() => setEditModal(null)}
      />

      <CountdownModal
        open={!!countdownModal}
        editingIndex={countdownModal?.index ?? null}
        existingItem={countdownModal?.index != null ? (currentClass?.customCountdowns?.[countdownModal.index] || null) : null}
        onSave={(payload, editingIndex) => {
          saveCountdown(payload, editingIndex);
          setCountdownModal(null);
        }}
        onDelete={(index) => {
          deleteCountdown(index);
          setCountdownModal(null);
        }}
        onCancel={() => setCountdownModal(null)}
      />

      <LoginModal
        open={loginModalOpen}
        onSuccess={() => {
          grantEditPermission();
          setLoginModalOpen(false);
        }}
        onCancel={() => setLoginModalOpen(false)}
      />

      <ColorDetailModal
        open={!!colorDetailModal}
        subject={colorModalSubject || ''}
        currentColor={colorModalCurrentColor}
        currentEmoji={colorModalCurrentEmoji}
        onSave={(subject, color, emoji) => {
          saveSubjectColor(subject, color, emoji);
          setColorDetailModal(null);
        }}
        onCancel={() => setColorDetailModal(null)}
      />
    </>
  );
}
