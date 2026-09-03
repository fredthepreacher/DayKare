import { useEffect, useMemo, useRef, useState } from 'react';
import { Home, Map, Sparkles, Timer, Users, X } from 'lucide-react';
import { ANIMATION_CLIPS, CAPER_HEIST_RB, DEFAULT_AVATAR, FIRST_HEIST_RB, FULL_REDESIGN_PRICE, HEIST_STEPS, REPLAY_HEIST_RB, STARTER_HOME_PRICE, TUTORIAL_CHAPTERS, type AvatarProfile } from './finalMaster';
import { deleteDayKareSave, useFinalMasterStore } from './finalMasterStore';
import { useGameStore } from './store';
import { caperStepLabel } from './questBoard';
import { useModeStore } from './modeStore';
import { useStorybookLaneStore } from './storybookLaneStore';
import { useToastStore } from './toastStore';
import { interactWithHeistTarget, interactWithMissLeslie } from './missLeslieInteraction';
import { ROUTE_PLANNER_NODES, TIMING_GRID_ROUNDS, TIMING_GRID_PASS_SCORE, advanceRoutePlanner, commitTimingGrid, createRoutePlannerState, createTimingGridState, routePlannerOptions, timingGridPassed, timingGridRound, type RoutePlannerNodeId } from './heistPlanning';

const skinTones = ['#f6d0b3', '#e7b48e', '#c98562', '#9a5d3c', '#6b3d2a'];
const hairColors = ['#241a18', '#4a2d25', '#713f32', '#b46b3f', '#e3bc75'];
const topColors = ['#e76f51', '#f2c94c', '#54b9bd', '#7654bd', '#e98ab2'];

export function AvatarCreator({ paid = false, onDone }: { paid?: boolean; onDone?: () => void }) {
  const saved = useFinalMasterStore((state) => state.avatar);
  const saveAvatar = useFinalMasterStore((state) => state.saveAvatar);
  const rb = useStorybookLaneStore((state) => state.ribbonBucks);
  const [avatar, setAvatar] = useState<AvatarProfile>(saved ?? DEFAULT_AVATAR);
  const [message, setMessage] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const update = <K extends keyof AvatarProfile>(key: K, value: AvatarProfile[K]) => setAvatar((current) => ({ ...current, [key]: value }));
  const commit = () => {
    const result = saveAvatar(avatar, paid);
    if (result === 'insufficient') { setMessage(`You need ${FULL_REDESIGN_PRICE.toLocaleString()} RB for a full redesign.`); return; }
    setMessage(paid ? 'Redesign saved. Progress and unlocks were preserved.' : 'Character ready!');
    onDone?.();
  };
  return <div className="final-modal-backdrop" data-testid="final-avatar-creator"><section className="final-avatar-card" role="dialog" aria-modal="true" aria-label="Character creator">
    <header><div><small>{paid ? `Full redesign · ${FULL_REDESIGN_PRICE.toLocaleString()} RB` : 'First creation is free'}</small><h1>Create your DayKare kid</h1></div>{paid && <button aria-label="Close" onClick={onDone}><X /></button>}</header>
    <div className="final-avatar-layout">
      <div className="final-avatar-preview" style={{ '--skin': avatar.skinColor, '--hair': avatar.hairColor, '--top': avatar.topColor, '--bottom': avatar.bottomColor, '--height': avatar.height, '--build': avatar.bodyBuild === 'slim' ? .82 : avatar.bodyBuild === 'broad' ? 1.12 : avatar.bodyBuild === 'chubby' ? 1.2 : 1 } as React.CSSProperties}>
        <div className="final-avatar-hair">{avatar.hairStyle === 'pigtails' ? '● ●' : avatar.hairStyle === 'curls' ? '●●●' : '●'}</div><div className="final-avatar-head"><i /><i /></div><div className="final-avatar-body" /><div className="final-avatar-legs" />
        <strong>{avatar.name || 'New Kid'}</strong><small>Live preview · {avatar.bodyBuild} · {Math.round(avatar.height * 100)}%</small>
      </div>
      <div className="final-avatar-controls">
        <label>Name<input value={avatar.name} maxLength={20} onChange={(event) => update('name', event.target.value)} /></label>
        <Choice label="Skin tone" values={skinTones} value={avatar.skinColor} onChange={(v) => update('skinColor', v)} colors />
        <Choice label="Hair" values={['bob', 'curls', 'ponytail', 'pigtails', 'cap', 'sprout']} value={avatar.hairStyle} onChange={(v) => update('hairStyle', v as AvatarProfile['hairStyle'])} />
        <Choice label="Hair color" values={hairColors} value={avatar.hairColor} onChange={(v) => update('hairColor', v)} colors />
        <Choice label="Eyes" values={['round', 'soft', 'wide']} value={avatar.eyeShape} onChange={(v) => update('eyeShape', v as AvatarProfile['eyeShape'])} />
        <Choice label="Ears" values={['small', 'round', 'wide']} value={avatar.earShape} onChange={(v) => update('earShape', v as AvatarProfile['earShape'])} />
        <Choice label="Build" values={['slim', 'average', 'broad', 'chubby']} value={avatar.bodyBuild} onChange={(v) => update('bodyBuild', v as AvatarProfile['bodyBuild'])} />
        <label>Height <output>{Math.round(avatar.height * 100)}%</output><input type="range" min="0.88" max="1.12" step="0.02" value={avatar.height} onChange={(event) => update('height', Number(event.target.value))} /></label>
        <Choice label="Starter top" values={topColors} value={avatar.topColor} onChange={(v) => update('topColor', v)} colors />
      </div>
    </div>
    <footer><span>{paid ? `${rb.toLocaleString()} RB available` : 'You can change individual clothes later.'}</span><button className="final-primary" onClick={commit}>{paid ? 'Buy redesign & save' : 'Start my first day'}</button></footer>
    {message && <p className="final-message">{message}</p>}
    {paid && <div className="final-delete"><button onClick={() => setConfirmDelete(true)}>Delete character & all progress</button>{confirmDelete && <div><strong>This permanently removes this browser’s DayKare character, currencies, homes, and progression.</strong><button onClick={deleteDayKareSave}>Yes, delete everything</button><button onClick={() => setConfirmDelete(false)}>Cancel</button></div>}</div>}
  </section></div>;
}

function Choice({ label, values, value, onChange, colors = false }: { label: string; values: readonly string[]; value: string; onChange: (value: string) => void; colors?: boolean }) {
  return <fieldset><legend>{label}</legend><div className="final-choice-row">{values.map((option) => <button type="button" key={option} className={value === option ? 'is-active' : ''} onClick={() => onChange(option)} aria-label={option} style={colors ? { backgroundColor: option } : undefined}>{colors ? '' : option}</button>)}</div></fieldset>;
}

/**
 * Timing Grid practice. The marker's position is derived from the clock
 * rather than from React state, so the value judged on commit is the
 * value the player actually saw, and no per-frame re-render is needed.
 */
/**
 * Both jobs on the board.
 *
 * The Sticker Parade Caper is the original crew job and still lives in the
 * game store; it is reconnected here rather than rebuilt, so its steps,
 * roles and consequences are unchanged. Miss Leslie's Sticker Parade stays
 * the primary story heist.
 */
function HeistJobList() {
  const caper = useGameStore((game) => game.caper);
  const trustedHelperPass = useGameStore((game) => game.progression.trustedHelperPass);
  const heistStatus = useFinalMasterStore((state) => state.heistStatus);
  const firstHeistComplete = useFinalMasterStore((state) => state.firstHeistComplete);

  const caperStatus = !trustedHelperPass
    ? 'Locked · return Binky to Leo first'
    : caper.step === 'complete'
      ? `Complete · ${caper.attempts} run${caper.attempts === 1 ? '' : 's'}`
      : caper.step === 'idle'
        ? 'Ready at the caper board by the playground'
        : `In progress · ${caperStepLabel(caper.step)}`;

  return <div className="final-board-jobs">
    <h3>Jobs on the board</h3>
    <article className="is-primary">
      <strong>The Sticker Parade</strong>
      <small>Miss Leslie · story heist</small>
      <em>{heistStatus === 'active' ? 'In progress' : firstHeistComplete ? 'Daily replay available' : 'Talk to Miss Leslie to begin'}</em>
      <b>{REPLAY_HEIST_RB.toLocaleString()} RB per replay</b>
    </article>
    <article className={trustedHelperPass ? '' : 'is-locked'}>
      <strong>Sticker Parade Caper</strong>
      <small>The original crew job · caper board by the playground</small>
      <em>{caperStatus}</em>
      <b>{CAPER_HEIST_RB.toLocaleString()} RB · +3 Star Tokens · +2 REP</b>
    </article>
  </div>;
}

function TimingGrid() {
  const completeTimingGrid = useFinalMasterStore((s) => s.completeTimingGrid);
  const bestScore = useFinalMasterStore((s) => s.timingGridBestScore);
  const [grid, setGrid] = useState(createTimingGridState);
  const trackRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<HTMLDivElement>(null);
  const startedAt = useRef(0);
  const round = timingGridRound(grid);
  const roundIndex = grid.round;

  useEffect(() => {
    if (!round) return undefined;
    startedAt.current = performance.now();
    let frame = 0;
    const step = () => {
      const marker = markerRef.current;
      if (marker) marker.style.left = `${markerPosition(round.sweepSeconds) * 100}%`;
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [round, roundIndex]);

  function markerPosition(sweepSeconds: number) {
    const cycle = ((performance.now() - startedAt.current) / 1000) % (sweepSeconds * 2);
    return cycle <= sweepSeconds ? cycle / sweepSeconds : 2 - cycle / sweepSeconds;
  }

  const commit = () => {
    if (!round) return;
    const next = commitTimingGrid(grid, markerPosition(round.sweepSeconds));
    setGrid(next);
    if (next.complete && timingGridPassed(next)) completeTimingGrid(next.score);
  };

  return <div className="final-timing-grid">
    <p>Stop the marker inside the green window. {TIMING_GRID_PASS_SCORE} of {TIMING_GRID_ROUNDS.length} banks the practice score.</p>
    {round ? <>
      <strong className="final-timing-round">{round.label} · round {grid.round + 1}/{TIMING_GRID_ROUNDS.length}</strong>
      <div className="final-timing-track" ref={trackRef} aria-label={`${round.label} timing track`}>
        <span className="final-timing-safe" style={{ left: `${round.safeFrom * 100}%`, width: `${(round.safeTo - round.safeFrom) * 100}%` }} />
        <div className="final-timing-marker" ref={markerRef} />
      </div>
      <button type="button" className="final-timing-commit" onClick={commit}>Go now</button>
    </> : <div className="final-timing-result">
      <strong>{timingGridPassed(grid) ? 'Timing banked!' : 'Not quite — try the rhythm again.'}</strong>
      <span>{grid.score}/{TIMING_GRID_ROUNDS.length} safe windows</span>
      <button type="button" className="final-route-reset" onClick={() => setGrid(createTimingGridState())}>Run it again</button>
    </div>}
    <div className="final-timing-dots">{grid.results.map((result, index) => <b key={index} className={result === 'hit' ? 'is-hit' : 'is-miss'}>{result === 'hit' ? '\u2713' : '\u00d7'}</b>)}</div>
    {bestScore !== null && <small>Best run: {bestScore}/{TIMING_GRID_ROUNDS.length} · practice XP already banked</small>}
  </div>;
}

function HeistBoardModal({ dayNumber, rb }: { dayNumber: number; rb: number }) {
  const state = useFinalMasterStore();
  const modalRef = useRef<HTMLElement>(null);
  const [route, setRoute] = useState(createRoutePlannerState);
  const [practiceTab, setPracticeTab] = useState<'route' | 'timing'>('route');
  const options = routePlannerOptions(route);
  const activeStep = HEIST_STEPS[Math.min(state.heistStep, HEIST_STEPS.length - 1)];
  const done = (stepIndex: number, event: string) => state.heistStep > stepIndex || state.heistCompletedEvents.includes(event);
  const chooseNode = (node: RoutePlannerNodeId) => {
    const next = advanceRoutePlanner(route, node);
    setRoute(next);
    if (!route.complete && next.complete) state.completeRoutePlanner(next.risk);
  };
  useEffect(() => {
    const frame = requestAnimationFrame(() => modalRef.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); state.closeHeistBoard(); return; }
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      const controls = Array.from(modalRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? []);
      if (!controls.length) return;
      event.preventDefault();
      const current = Math.max(0, controls.indexOf(document.activeElement as HTMLButtonElement));
      controls[(current + (event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1) + controls.length) % controls.length].focus();
    };
    window.addEventListener('keydown', onKey);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('keydown', onKey); };
  }, [state.closeHeistBoard]);
  useEffect(() => {
    let frame = 0;
    let previousConfirm = false;
    let previousDirection = false;
    const poll = () => {
      const pad = typeof navigator !== 'undefined' ? Array.from(navigator.getGamepads?.() ?? []).find(Boolean) : null;
      const confirm = Boolean(pad?.buttons[0]?.pressed);
      const direction = Boolean(pad && (pad.buttons[12]?.pressed || pad.buttons[13]?.pressed || pad.buttons[14]?.pressed || pad.buttons[15]?.pressed));
      const controls = Array.from(modalRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? []);
      if (direction && !previousDirection && controls.length) {
        const current = Math.max(0, controls.indexOf(document.activeElement as HTMLButtonElement));
        controls[(current + 1) % controls.length].focus();
      }
      if (confirm && !previousConfirm && document.activeElement instanceof HTMLButtonElement && modalRef.current?.contains(document.activeElement)) document.activeElement.click();
      previousConfirm = confirm;
      previousDirection = direction;
      frame = requestAnimationFrame(poll);
    };
    frame = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(frame);
  }, []);
  return <div className="final-modal-backdrop final-board-backdrop" data-testid="heist-board-modal"><section ref={modalRef} className="final-heist-board-ui" role="dialog" aria-modal="true" aria-label="Miss Leslie heist planning board">
    <header><div><small>MISS LESLIE'S HEIST HUB</small><h2>The Sticker Parade</h2><p>{state.firstHeistComplete ? 'Daily replay' : 'First story heist'} · {state.heistStatus}</p></div><button type="button" onClick={state.closeHeistBoard} aria-label="Close heist board"><X /></button></header>
    <div className="final-board-columns">
      <div className="final-board-progress">
        <HeistJobList />
        <h3>Progress</h3>
        <strong>SCOPE</strong>
        {HEIST_STEPS[1].events.map((event) => <span key={event}>{done(1, event) ? '✓' : '○'} {event.replace('scope-', '').replaceAll('-', ' ')}</span>)}
        <strong>SETUPS</strong>
        {HEIST_STEPS.slice(2, 5).map((step, offset) => <span key={step.id}>{state.heistStep > offset + 2 ? '✓' : state.heistStep === offset + 2 ? '◐' : '○'} {step.title}</span>)}
        <strong>FINALE</strong><span>{state.heistStep >= 5 ? `${done(5, 'finale-regroup') ? '✓' : '◐'} Parade finale` : '🔒 Locked'}</span>
        <div className="final-board-current"><b>{state.heistStatus === 'active' ? activeStep.title : 'Current heist'}</b><p>{state.heistStatus === 'active' ? activeStep.objective : 'Talk to Miss Leslie to begin or replay.'}</p><small>Replay payout: 5,000 RB · Current wallet: {rb.toLocaleString()} RB</small></div>
      </div>
      <div className="final-route-planner">
        <div className="final-practice-tabs" role="tablist" aria-label="Practice minigames">
          <button type="button" role="tab" aria-selected={practiceTab === 'route'} className={practiceTab === 'route' ? 'is-active' : ''} onClick={() => setPracticeTab('route')}><Map /> Route Planner</button>
          <button type="button" role="tab" aria-selected={practiceTab === 'timing'} className={practiceTab === 'timing' ? 'is-active' : ''} onClick={() => setPracticeTab('timing')}><Timer /> Timing Grid</button>
        </div>
        {practiceTab === 'timing' ? <TimingGrid /> : <>
        <p>Connect the Hub to the Sticker Cart. Avoid the teacher marker and finish in five moves.</p>
        <div className="final-route-map" aria-label="Route planner map">
          {ROUTE_PLANNER_NODES.map((node) => {
            const visited = route.path.includes(node.id);
            const available = options.includes(node.id);
            return <button key={node.id} type="button" style={{ left: `${node.x}%`, top: `${node.y}%` }} className={`${visited ? 'is-visited' : ''} ${available ? 'is-next' : ''} ${node.id === 'patrol' ? 'is-risk' : ''}`} disabled={!available} onClick={() => chooseNode(node.id)}>{node.label}</button>;
          })}
        </div>
        <div className="final-route-status"><span>Moves {route.moves}/5</span><span>Risk {route.risk}</span><span>{route.complete ? 'Route ready!' : route.failed ? 'Route blocked' : 'Choose a glowing node'}</span></div>
        {(route.complete || route.failed) && <button type="button" className="final-route-reset" onClick={() => setRoute(createRoutePlannerState())}>{route.complete ? 'Plan another route' : 'Try again'}</button>}
        {state.routePlannerComplete && <small>✓ Setup advantage saved · Best risk: {state.routePlannerBestRisk}</small>}
        </>}
      </div>
    </div>
    <footer className="final-board-stats"><span><b>{state.heistsCompleted}</b> Heists</span><span><b>{state.successfulFinales}</b> Finales</span><span><b>{state.totalHeistRbEarned.toLocaleString()}</b> Lifetime RB</span><span><b>{state.firstRewardChoice ?? 'Not yet'}</b> First-clear reward</span><span><b>{state.firstHeistComplete ? 'Sticker Parade' : 'None'}</b> Last heist</span><span><b>{state.lastReplayDay === dayNumber ? 'Claimed' : 'Available'}</b> Daily replay</span></footer>
  </section></div>;
}

export function FinalMasterOverlay() {
  const state = useFinalMasterStore();
  const activeInteractable = useGameStore((game) => game.activeInteractable);
  const dayNumber = useGameStore((game) => game.dayNumber);
  const zone = useGameStore((game) => game.zone);
  const menuOpen = useModeStore((mode) => mode.menuOpen);
  const rb = useStorybookLaneStore((lane) => lane.ribbonBucks);
  const enqueueToast = useToastStore((toast) => toast.enqueue);
  const [objectiveMode, setObjectiveMode] = useState<'expanded' | 'collapsed' | 'hidden'>('collapsed');
  const objectiveExpanded = objectiveMode === 'expanded';
  const chapter = TUTORIAL_CHAPTERS[state.tutorialChapter];
  const heist = HEIST_STEPS[Math.min(state.heistStep, HEIST_STEPS.length - 1)];
  const interact = () => {
    if (activeInteractable === 'final-miss-leslie') interactWithMissLeslie();
    else if (activeInteractable === 'final-heist-board') state.openHeistBoard();
    else if (activeInteractable?.startsWith('final-heist-')) interactWithHeistTarget(activeInteractable);
  };
  useEffect(() => {
    if (!state.activeAnimation) return undefined;
    const timer = window.setTimeout(() => state.playAnimation(null), 2800);
    return () => window.clearTimeout(timer);
  }, [state.activeAnimation]);
  useEffect(() => {
    if ((menuOpen || zone !== 'hub' || state.insideHome) && state.heistBoardOpen) state.closeHeistBoard();
  }, [menuOpen, zone, state.insideHome, state.heistBoardOpen, state.closeHeistBoard]);
  const animationName = useMemo(() => ANIMATION_CLIPS.find(([id]) => id === state.activeAnimation)?.[1], [state.activeAnimation]);
  if (menuOpen) return null;
  if (!state.avatarConfirmed) return <AvatarCreator />;
  if (zone === 'home') return <div className="final-home-banner"><Home />Your Starter Home <button onClick={() => { state.leaveHome(); }}>Exit to Storybook Lane</button></div>;
  return <>
    {state.heistBoardOpen && <HeistBoardModal dayNumber={dayNumber} rb={rb} />}
    {objectiveMode === 'hidden' && <button className="final-objective-reopen" onClick={() => setObjectiveMode('collapsed')} aria-label="Reopen objective tracker" data-testid="final-objective-reopen">📋</button>}
    {objectiveMode !== 'hidden' && !state.tutorialComplete && chapter && <section className={`final-objective-card ${objectiveExpanded ? 'is-expanded' : ''}`} data-testid="final-tutorial"><div className="final-objective-header"><button className="final-objective-toggle" onClick={() => setObjectiveMode(objectiveExpanded ? 'collapsed' : 'expanded')}><span><small>Orientation {state.tutorialChapter + 1} / 7</small><strong>{chapter.title}</strong><em>{state.tutorialCompletedSteps.length}/{chapter.steps.length}</em></span><b>{objectiveExpanded ? '−' : '+'}</b></button><button className="final-objective-hide" onClick={() => setObjectiveMode('hidden')} aria-label="Hide objective tracker">×</button></div>{objectiveExpanded && <><span>{chapter.objective}</span><ul>{chapter.steps.map((step) => <li key={step.id} className={state.tutorialCompletedSteps.includes(step.id) ? 'is-done' : ''}>{state.tutorialCompletedSteps.includes(step.id) ? '✓' : '○'} {step.label}</li>)}</ul><em>Reward: +{chapter.xp} XP{'reputation' in chapter ? ` · +${chapter.reputation} REP` : ''}</em>{!state.tutorialStarted ? <button onClick={() => state.startTutorial()}>Start Guided Practice</button> : <button onClick={() => enqueueToast({ title: chapter.title, detail: chapter.objective })}>Show Me</button>}</>}</section>}
    {objectiveMode !== 'hidden' && state.tutorialComplete && <section className={`final-objective-card final-heist-card ${objectiveExpanded ? 'is-expanded' : ''}`} data-testid="final-heist-status"><div className="final-objective-header"><button className="final-objective-toggle" onClick={() => setObjectiveMode(objectiveExpanded ? 'collapsed' : 'expanded')}><span><small><Users /> Miss Leslie’s Heist Board</small><strong>{state.heistStatus === 'active' ? heist.title : state.firstHeistComplete ? 'Daily Sticker Parade Replay' : 'A new plan is waiting'}</strong><em>{state.heistStatus === 'active' ? `${heist.events.filter((event) => state.heistCompletedEvents.includes(event)).length}/${heist.events.length}` : 'Optional story'}</em></span><b>{objectiveExpanded ? '−' : '+'}</b></button><button className="final-objective-hide" onClick={() => setObjectiveMode('hidden')} aria-label="Hide objective tracker">×</button></div>{objectiveExpanded && <><span>{state.heistStatus === 'active' ? heist.objective : state.firstHeistComplete ? 'Complete one replay per in-game day for 5,000 RB, $1,000, and 250 XP.' : 'Physically find and interact with Miss Leslie near the Heist Board.'}</span>{state.heistStatus === 'active' && <ul>{heist.events.map((event) => <li key={event} className={state.heistCompletedEvents.includes(event) ? 'is-done' : ''}>{state.heistCompletedEvents.includes(event) ? '✓' : '○'} {event.replaceAll('-', ' ')}</li>)}</ul>}</>}</section>}
    {(activeInteractable === 'final-miss-leslie' || activeInteractable?.startsWith('final-heist-')) && !state.heistBoardOpen && <button className="final-world-interact" onClick={interact}>{activeInteractable === 'final-miss-leslie' ? 'Talk to Miss Leslie' : activeInteractable === 'final-heist-board' ? 'View Heist Board' : `Interact: ${activeInteractable.replace('final-heist-', '').replaceAll('-', ' ')}`}</button>}
    {state.homeRewardRecoveryPending && state.heistStatus !== 'reward-choice' && <div className="final-modal-backdrop"><section className="final-reward-choice" data-testid="home-reward-recovery"><Sparkles /><small>Your finished heist never recorded which reward you took</small><h2>Pick the one you are owed</h2><button onClick={() => state.resolveHomeRewardRecovery('rb')}><strong>{FIRST_HEIST_RB.toLocaleString()} Rascal Bucks</strong><span>Paid straight into your wallet.</span></button><button onClick={() => state.resolveHomeRewardRecovery('home')}><strong>Free starter-home voucher</strong><span>Claim Wavy Manor from a Stony Brook realtor.</span></button></section></div>}
        {state.heistStatus === 'reward-choice' && <div className="final-modal-backdrop"><section className="final-reward-choice"><Sparkles /><small>First finale complete · $1,000 + 250 XP already awarded</small><h2>Choose one permanent reward</h2><button onClick={() => state.chooseFirstReward('rb')}><strong>14,000 Rascal Bucks</strong><span>Build toward any property or collectible.</span></button><button onClick={() => state.chooseFirstReward('home')}><strong>Free 25,000 RB starter home</strong><span>A one-use voucher for the eligible Storybook home.</span></button></section></div>}
    {zone === 'storybook' && <div className="final-property-tip"><Home /><span>{state.ownedStarterHome ? 'Your home is ready—use the MY HOME door.' : `Starter home: ${STARTER_HOME_PRICE.toLocaleString()} RB${state.homeVoucher ? ' · voucher ready' : ''}`}</span></div>}
    {animationName && <div className="final-animation-banner">Now playing: {animationName}</div>}
  </>;
}
