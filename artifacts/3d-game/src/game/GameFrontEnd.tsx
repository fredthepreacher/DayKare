import {
  Accessibility,
  ArrowLeft,
  Check,
  Eye,
  Settings,
  Sparkles,
  TextCursorInput,
  Volume2,
} from 'lucide-react';
import { useEffect } from 'react';
import { GameMenu } from './GameMenu';
import { OnlineLobby } from './OnlineLobby';
import { useGameStore } from './store';
import { useModeStore, type FrontEndPanel } from './modeStore';
import { useSettingsStore } from './settingsStore';
import { useCloudSyncStore } from './cloudSync';
import { setGameAudioEnabled } from './audio';

const panelCopy: Record<Exclude<FrontEndPanel, 'menu'>, { title: string; eyebrow: string }> = {
  customize: { eyebrow: 'Make it yours', title: 'Customize' },
  progress: { eyebrow: 'Your DayKare story', title: 'Journal & Map' },
  settings: { eyebrow: 'Play your way', title: 'Settings' },
  accessibility: { eyebrow: 'Everyone belongs here', title: 'Accessibility' },
};

function PanelHeader({ panel }: { panel: Exclude<FrontEndPanel, 'menu'> }) {
  const backToMenu = useModeStore((state) => state.backToMenu);
  return (
    <header className="daykare-front-panel-header">
      <button type="button" className="daykare-plain-button" onClick={backToMenu} data-testid={`button-${panel}-back`}>
        <ArrowLeft aria-hidden="true" />
        Menu
      </button>
      <div>
        <p className="daykare-eyebrow">{panelCopy[panel].eyebrow}</p>
        <h1>{panelCopy[panel].title}</h1>
      </div>
    </header>
  );
}

function CustomizePanel() {
  const tricycleColorIndex = useGameStore((state) => state.tricycleColorIndex);
  const cycleTricycleColor = useGameStore((state) => state.cycleTricycleColor);
  const colors = ['Sunset red', 'Sky blue', 'Berry pink', 'Mint green'];
  return (
    <div className="daykare-front-panel-content">
      <div className="daykare-feature-card daykare-feature-card-pink">
        <Sparkles aria-hidden="true" />
        <div>
          <p className="daykare-eyebrow">Story wardrobe</p>
          <h2>Small details, big adventures.</h2>
          <p>Outfit styling is ready for the next story wardrobe update. Your tricycle color is live now.</p>
        </div>
      </div>
      <button type="button" className="daykare-front-action" onClick={cycleTricycleColor} data-testid="button-cycle-tricycle-color">
        <span className="daykare-color-swatch" style={{ backgroundColor: colors[tricycleColorIndex] === 'Sunset red' ? '#d62828' : colors[tricycleColorIndex] === 'Sky blue' ? '#3a86ff' : colors[tricycleColorIndex] === 'Berry pink' ? '#ff006e' : '#06d6a0' }} aria-hidden="true" />
        <span><strong>Tricycle color</strong><small>{colors[tricycleColorIndex]}</small></span>
        <span aria-hidden="true">Next</span>
      </button>
      <div className="daykare-lockup-card" data-testid="status-customize-outfit-hook">
        <Check aria-hidden="true" />
        <div><strong>Outfit hooks connected</strong><p>Story and Online will keep their profiles separate.</p></div>
      </div>
    </div>
  );
}

function ProgressPanel() {
  const progression = useGameStore((state) => state.progression);
  const rivalStory = useGameStore((state) => state.rivalStory);
  const districtProgress = useGameStore((state) => state.districtProgress);
  const toggleJournal = useGameStore((state) => state.toggleJournal);
  return (
    <div className="daykare-front-panel-content">
      <div className="daykare-progress-hero">
        <div><p className="daykare-eyebrow">Story Mode save</p><h2>Everything you discover stays yours.</h2></div>
        <div className="daykare-stat-row">
          <span><strong>{progression.tokens}</strong><small>Star Tokens</small></span>
          <span><strong>{progression.reputation}</strong><small>REP</small></span>
        </div>
      </div>
      <div className="daykare-progress-grid">
        <div><span>Mae’s story</span><strong>Chapter {rivalStory.chapter} · {rivalStory.beat === 'complete' ? 'Complete' : 'In progress'}</strong></div>
        <div><span>Maker Market</span><strong>{districtProgress.makerMarket} / 3 foundations</strong></div>
        <div><span>Storybook Lane</span><strong>{districtProgress.storybookLane} / 3 foundations</strong></div>
      </div>
      <button type="button" className="daykare-front-action is-primary" onClick={() => { toggleJournal(); useModeStore.getState().closeMenu(); }} data-testid="button-open-full-journal">
        <BookMarkIcon />
        <span><strong>Open full Kid Journal</strong><small>Quests, friends, business, and route notes</small></span>
        <span aria-hidden="true">Open</span>
      </button>
    </div>
  );
}

function BookMarkIcon() {
  return <span className="daykare-bookmark-icon" aria-hidden="true">J</span>;
}

function SettingsPanel() {
  const quality = useGameStore((state) => state.quality);
  const setQuality = useGameStore((state) => state.setQuality);
  const audioEnabled = useSettingsStore((state) => state.device.audioEnabled);
  const toggleAudioEnabled = useSettingsStore((state) => state.toggleAudioEnabled);
  return (
    <div className="daykare-front-panel-content">
      <div className="daykare-setting-row">
        <span><Settings aria-hidden="true" /><strong>Visual quality</strong><small>Choose the best fit for this device</small></span>
        <button type="button" className="daykare-toggle-button" onClick={() => setQuality(quality === 'high' ? 'low' : 'high')} data-testid="button-toggle-quality">{quality === 'high' ? 'High' : 'Low'}</button>
      </div>
      <button type="button" className={`daykare-setting-row daykare-setting-button ${audioEnabled ? 'is-on' : ''}`} onClick={toggleAudioEnabled} data-testid="button-toggle-audio">
        <span><Volume2 aria-hidden="true" /><strong>Audio</strong><small>Game sounds stay enabled in this preview</small></span>
        <span className="daykare-toggle-button">{audioEnabled ? 'On' : 'Off'}</span>
      </button>
      <div className="daykare-lockup-card" data-testid="status-save-separation">
        <Check aria-hidden="true" />
        <div><strong>Save boundaries protected</strong><p>Story progression uses its existing save. Online preview data uses a separate namespace.</p></div>
      </div>
      <CloudSyncStatus />
    </div>
  );
}

/**
 * Truthful about what is actually happening. "Disabled" is not an error and is
 * not dressed up as one: DayKare plays perfectly well without an account.
 */
function CloudSyncStatus() {
  const story = useCloudSyncStore((state) => state.story);
  const conflict = useCloudSyncStore((state) => state.conflict);

  const copy: Record<string, { title: string; detail: string }> = {
    disabled: { title: 'Playing on this device', detail: 'Your progress is saved here in this browser.' },
    offline: { title: 'Cloud save unavailable', detail: 'Playing from this device. Progress is safe and will sync when the connection returns.' },
    idle: { title: 'Cloud save on', detail: 'Your progress is backed up to your DayKare account.' },
    syncing: { title: 'Saving to the cloud…', detail: 'Keep playing — this happens in the background.' },
    conflict: { title: 'Two versions of your save', detail: 'This device and another one both have progress. Nothing has been overwritten.' },
    error: { title: 'Cloud save paused', detail: 'Playing from this device. Your local progress is untouched.' },
  };
  const shown = copy[story.state] ?? copy.disabled;

  return (
    <div className="daykare-lockup-card" data-testid={`status-cloud-sync-${story.state}`}>
      <div>
        <strong>{shown.title}</strong>
        <p>{conflict ? `${copy.conflict.detail} ${conflict.reason}` : shown.detail}</p>
      </div>
    </div>
  );
}

function AccessibilityPanel() {
  const reducedMotion = useSettingsStore((state) => state.account.reducedMotion);
  const highContrast = useSettingsStore((state) => state.account.highContrast);
  const largerText = useSettingsStore((state) => state.account.largerText);
  const toggleReducedMotion = useSettingsStore((state) => state.toggleReducedMotion);
  const toggleHighContrast = useSettingsStore((state) => state.toggleHighContrast);
  const toggleLargerText = useSettingsStore((state) => state.toggleLargerText);
  const options = [
    { label: 'Reduce motion', detail: 'Shorter transitions and calmer menu movement', icon: Sparkles, value: reducedMotion, toggle: toggleReducedMotion, id: 'motion' },
    { label: 'Higher contrast', detail: 'Stronger edges around panels and controls', icon: Eye, value: highContrast, toggle: toggleHighContrast, id: 'contrast' },
    { label: 'Larger text', detail: 'Increase menu copy for easier reading', icon: TextCursorInput, value: largerText, toggle: toggleLargerText, id: 'text' },
  ];
  return (
    <div className="daykare-front-panel-content">
      <div className="daykare-feature-card daykare-feature-card-blue">
        <Accessibility aria-hidden="true" />
        <div><p className="daykare-eyebrow">Comfort controls</p><h2>Make the campus feel right.</h2><p>These preferences follow your account across devices and never alter Story or Online progression.</p></div>
      </div>
      {options.map((option) => {
        const Icon = option.icon;
        return (
          <button type="button" className={`daykare-setting-row daykare-setting-button ${option.value ? 'is-on' : ''}`} onClick={option.toggle} key={option.id} data-testid={`button-accessibility-${option.id}`}>
            <span><Icon aria-hidden="true" /><strong>{option.label}</strong><small>{option.detail}</small></span>
            <span className="daykare-switch" aria-hidden="true"><span /></span>
          </button>
        );
      })}
    </div>
  );
}

export function GameFrontEnd() {
  const activeMode = useModeStore((state) => state.activeMode);
  const menuOpen = useModeStore((state) => state.menuOpen);
  const panel = useModeStore((state) => state.panel);
  const enterStory = useModeStore((state) => state.enterStory);
  const enterOnlinePreview = useModeStore((state) => state.enterOnlinePreview);
  const openPanel = useModeStore((state) => state.openPanel);
  const closeMenu = useModeStore((state) => state.closeMenu);
  const online = useModeStore((state) => state.online);
  const reducedMotion = useSettingsStore((state) => state.account.reducedMotion);
  const highContrast = useSettingsStore((state) => state.account.highContrast);
  const largerText = useSettingsStore((state) => state.account.largerText);
  const audioEnabled = useSettingsStore((state) => state.device.audioEnabled);

  useEffect(() => {
    document.documentElement.classList.toggle('daykare-reduce-motion', reducedMotion);
    document.documentElement.classList.toggle('daykare-high-contrast', highContrast);
    document.documentElement.classList.toggle('daykare-larger-text', largerText);
    setGameAudioEnabled(audioEnabled);
  }, [reducedMotion, highContrast, largerText, audioEnabled]);

  if (activeMode === 'online-preview') {
    return <OnlineLobby />;
  }
  if (!menuOpen) return null;
  if (panel !== 'menu') {
    return (
      <div className="daykare-front-panel-shell" data-testid={`overlay-front-panel-${panel}`}>
        <section className="daykare-front-panel" role="dialog" aria-modal="true">
          <PanelHeader panel={panel} />
          {panel === 'customize' && <CustomizePanel />}
          {panel === 'progress' && <ProgressPanel />}
          {panel === 'settings' && <SettingsPanel />}
          {panel === 'accessibility' && <AccessibilityPanel />}
        </section>
      </div>
    );
  }
  return (
    <GameMenu
      isOpen
      onClose={closeMenu}
      onStoryMode={enterStory}
      onDayKareOnline={enterOnlinePreview}
      onCustomize={() => openPanel('customize')}
      onProgress={() => openPanel('progress')}
      onSettings={() => openPanel('settings')}
      onAccessibility={() => openPanel('accessibility')}
      onlineSeatCount={online.seats.length}
    />
  );
}