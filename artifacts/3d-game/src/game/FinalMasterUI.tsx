import { useEffect, useMemo, useState } from 'react';
import { Gem, Home, Sparkles, Users, X } from 'lucide-react';
import { ANIMATION_CLIPS, DEFAULT_AVATAR, FULL_REDESIGN_PRICE, HEIST_STEPS, STARTER_HOME_PRICE, TUTORIAL_CHAPTERS, type AvatarProfile } from './finalMaster';
import { deleteDayKareSave, useFinalMasterStore } from './finalMasterStore';
import { useGameStore } from './store';
import { useModeStore } from './modeStore';
import { useStorybookLaneStore } from './storybookLaneStore';

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

export function FinalMasterOverlay() {
  const state = useFinalMasterStore();
  const activeInteractable = useGameStore((game) => game.activeInteractable);
  const dayNumber = useGameStore((game) => game.dayNumber);
  const zone = useGameStore((game) => game.zone);
  const menuOpen = useModeStore((mode) => mode.menuOpen);
  const rb = useStorybookLaneStore((lane) => lane.ribbonBucks);
  const [notice, setNotice] = useState('');
  const chapter = TUTORIAL_CHAPTERS[state.tutorialChapter];
  const heist = HEIST_STEPS[Math.min(state.heistStep, HEIST_STEPS.length - 1)];
  const interact = () => {
    if (activeInteractable === 'final-miss-leslie') {
      if (state.heistStatus === 'available' || state.heistStatus === 'complete') setNotice(state.startHeist() ? 'Miss Leslie: “Mia, Noah—quiet feet. Let’s make this parade sparkle.”' : 'Finish your DayKare orientation first.');
      else setNotice('Miss Leslie: “Keep going. Your team is right with you.”');
    } else if (activeInteractable === 'final-heist-objective') {
      const title = heist.title;
      if (state.advanceHeist()) setNotice(`${title} complete. Mia and Noah regrouped safely.`);
    }
  };
  useEffect(() => {
    if (!state.activeAnimation) return undefined;
    const timer = window.setTimeout(() => state.playAnimation(null), 2800);
    return () => window.clearTimeout(timer);
  }, [state.activeAnimation]);
  const animationName = useMemo(() => ANIMATION_CLIPS.find(([id]) => id === state.activeAnimation)?.[1], [state.activeAnimation]);
  if (menuOpen) return null;
  if (!state.avatarConfirmed) return <AvatarCreator />;
  if (state.insideHome) return <><div className="final-home-banner"><Home />Your Starter Home <button onClick={() => { state.leaveHome(); useGameStore.getState().setPlayerPosition([-13, 0, -8.7]); useGameStore.getState().triggerTeleport(); }}>Exit to Storybook Lane</button></div><div className="final-economy-pill">🎭 {rb.toLocaleString()} RB · <Gem /> {state.gems}</div></>;
  return <>
    <div className="final-economy-pill" data-testid="final-economy"><span>🎭 {rb.toLocaleString()} Rascal Bucks</span><span><Gem /> {state.gems} Gems</span>{rb >= 10_000 && <button onClick={() => state.convertRbToGem()}>10,000 RB → 1 Gem</button>}</div>
    {!state.tutorialComplete && chapter && <section className="final-objective-card" data-testid="final-tutorial"><small>Orientation {state.tutorialChapter + 1} / 7</small><strong>{chapter.title}</strong><span>{chapter.objective}</span><em>Reward: +{chapter.xp} XP{'reputation' in chapter ? ` · +${chapter.reputation} REP` : ''}</em><button onClick={() => { state.playAnimation(ANIMATION_CLIPS[state.tutorialChapter][0]); state.completeTutorialChapter(); }}>Complete this guided practice</button></section>}
    {state.tutorialComplete && <section className="final-objective-card final-heist-card" data-testid="final-heist-status"><small><Users /> Miss Leslie’s Heist Board</small><strong>{state.heistStatus === 'active' ? heist.title : state.firstHeistComplete ? 'Daily Sticker Parade Replay' : 'A new plan is waiting'}</strong><span>{state.heistStatus === 'active' ? heist.objective : state.firstHeistComplete ? 'Complete one replay per in-game day for 5,000 RB, $1,000, and 250 XP.' : 'Find Miss Leslie near the Heist Board.'}</span>{state.firstHeistComplete && state.heistStatus !== 'active' && <button onClick={() => setNotice(state.claimReplayReward(dayNumber) ? 'Daily replay started. Regroup with Mia and Noah.' : 'Today’s replay was already completed.')}>Start today’s replay</button>}</section>}
    {(activeInteractable === 'final-miss-leslie' || activeInteractable === 'final-heist-objective') && <button className="final-world-interact" onClick={interact}>{activeInteractable === 'final-miss-leslie' ? 'Talk to Miss Leslie' : `Complete: ${heist.title}`}</button>}
    {state.heistStatus === 'reward-choice' && <div className="final-modal-backdrop"><section className="final-reward-choice"><Sparkles /><small>First finale complete · $1,000 + 250 XP already awarded</small><h2>Choose one permanent reward</h2><button onClick={() => state.chooseFirstReward('rb')}><strong>14,000 Rascal Bucks</strong><span>Build toward any property or collectible.</span></button><button onClick={() => state.chooseFirstReward('home')}><strong>Free 25,000 RB starter home</strong><span>A one-use voucher for the eligible Storybook home.</span></button></section></div>}
    {zone === 'storybook' && <div className="final-property-tip"><Home /><span>{state.ownedStarterHome ? 'Your home is ready—use the MY HOME door.' : `Starter home: ${STARTER_HOME_PRICE.toLocaleString()} RB${state.homeVoucher ? ' · voucher ready' : ''}`}</span></div>}
    {animationName && <div className="final-animation-banner">Now playing: {animationName}</div>}
    {notice && <button className="final-toast" onClick={() => setNotice('')}>{notice}</button>}
  </>;
}
