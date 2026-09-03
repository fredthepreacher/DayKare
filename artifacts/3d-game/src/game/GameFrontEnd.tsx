import {
  Accessibility,
  ArrowLeft,
  Check,
  Eye,
  Settings,
  Sparkles,
  TextCursorInput,
  Volume2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { GameMenu } from "./GameMenu";
import { OnlineLobby } from "./OnlineLobby";
import { useGameStore } from "./store";
import { useModeStore, type FrontEndPanel } from "./modeStore";
import { useSettingsStore } from "./settingsStore";
import { useCloudSyncStore, resolveConflict } from "./cloudSync";
import { formatRelativeTime } from "@workspace/cloud-sync";
import { playGameSound, setGameAudioEnabled } from "./audio";
import { playVoice, unlockAllGameAudio } from "./audioDirector";
import { MonetizationShop } from "./MonetizationShop";
import { AvatarCreator } from "./FinalMasterUI";

const panelCopy: Record<
  Exclude<FrontEndPanel, "menu">,
  { title: string; eyebrow: string }
> = {
  shop: { eyebrow: "Play first · extras optional", title: "Kare Shop" },
  customize: { eyebrow: "Make it yours", title: "Customize" },
  progress: { eyebrow: "Your DayKare story", title: "DayKare Tablet" },
  settings: { eyebrow: "Play your way", title: "Settings" },
  accessibility: { eyebrow: "Everyone belongs here", title: "Accessibility" },
};

function PanelHeader({ panel }: { panel: Exclude<FrontEndPanel, "menu"> }) {
  const backToMenu = useModeStore((state) => state.backToMenu);
  return (
    <header className="daykare-front-panel-header">
      <button
        type="button"
        className="daykare-plain-button"
        onClick={backToMenu}
        data-testid={`button-${panel}-back`}
      >
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
  const backToMenu = useModeStore((state) => state.backToMenu);
  return <AvatarCreator paid onDone={backToMenu} />;
}

function ProgressPanel() {
  const progression = useGameStore((state) => state.progression);
  const rivalStory = useGameStore((state) => state.rivalStory);
  const districtProgress = useGameStore((state) => state.districtProgress);
  const toggleJournal = useGameStore((state) => state.toggleJournal);
  return (
    <div className="daykare-front-panel-content">
      <div className="daykare-progress-hero">
        <div>
          <p className="daykare-eyebrow">Story Mode save</p>
          <h2>Everything you discover stays yours.</h2>
        </div>
        <div className="daykare-stat-row">
          <span>
            <strong>{progression.experience ?? 0}</strong>
            <small>XP</small>
          </span>
          <span>
            <strong>{progression.reputation}</strong>
            <small>REP</small>
          </span>
        </div>
      </div>
      <div className="daykare-progress-grid">
        <div>
          <span>Mae’s story</span>
          <strong>
            Chapter {rivalStory.chapter} ·{" "}
            {rivalStory.beat === "complete" ? "Complete" : "In progress"}
          </strong>
        </div>
        <div>
          <span>Maker Market</span>
          <strong>{districtProgress.makerMarket} / 3 foundations</strong>
        </div>
        <div>
          <span>Storybook Lane</span>
          <strong>{districtProgress.storybookLane} / 3 foundations</strong>
        </div>
      </div>
      <button
        type="button"
        className="daykare-front-action is-primary"
        onClick={() => {
          toggleJournal();
          useModeStore.getState().closeMenu();
        }}
        data-testid="button-open-full-journal"
      >
        <BookMarkIcon />
        <span>
          <strong>Open DayKare Tablet</strong>
          <small>
            Schedule, progress, wallet, activities, heists, property, and help
          </small>
        </span>
        <span aria-hidden="true">Open</span>
      </button>
    </div>
  );
}

function BookMarkIcon() {
  return (
    <span className="daykare-bookmark-icon" aria-hidden="true">
      J
    </span>
  );
}

function SettingsPanel() {
  const quality = useGameStore((state) => state.quality);
  const setQuality = useGameStore((state) => state.setQuality);
  const audioEnabled = useSettingsStore((state) => state.device.audioEnabled);
  const toggleAudioEnabled = useSettingsStore(
    (state) => state.toggleAudioEnabled,
  );
  const musicVolume = useSettingsStore((state) => state.device.musicVolume);
  const sfxVolume = useSettingsStore((state) => state.device.sfxVolume);
  const voiceVolume = useSettingsStore((state) => state.device.voiceVolume);
  const setMusicVolume = useSettingsStore((state) => state.setMusicVolume);
  const setSfxVolume = useSettingsStore((state) => state.setSfxVolume);
  const setVoiceVolume = useSettingsStore((state) => state.setVoiceVolume);
  const volumeRows = [
    {
      id: "music",
      label: "Music",
      detail: "Background soundtrack",
      value: musicVolume,
      set: setMusicVolume,
    },
    {
      id: "sfx",
      label: "Sound effects",
      detail: "Steps, doors and interactions",
      value: sfxVolume,
      set: setSfxVolume,
    },
    {
      id: "voice",
      label: "Voices",
      detail: "Teachers and children",
      value: voiceVolume,
      set: setVoiceVolume,
    },
  ];
  return (
    <div className="daykare-front-panel-content">
      <div className="daykare-setting-row">
        <span>
          <Settings aria-hidden="true" />
          <strong>Visual quality</strong>
          <small>Choose the best fit for this device</small>
        </span>
        <button
          type="button"
          className="daykare-toggle-button"
          onClick={() => setQuality(quality === "high" ? "low" : "high")}
          data-testid="button-toggle-quality"
        >
          {quality === "high" ? "High" : "Low"}
        </button>
      </div>
      <button
        type="button"
        className={`daykare-setting-row daykare-setting-button ${audioEnabled ? "is-on" : ""}`}
        onClick={toggleAudioEnabled}
        data-testid="button-toggle-audio"
      >
        <span>
          <Volume2 aria-hidden="true" />
          <strong>Audio</strong>
          <small>Music, voices and world sounds</small>
        </span>
        <span className="daykare-toggle-button">
          {audioEnabled ? "On" : "Off"}
        </span>
      </button>
      {volumeRows.map((row) => (
        <label className="daykare-setting-row daykare-volume-row" key={row.id}>
          <span>
            <Volume2 aria-hidden="true" />
            <strong>{row.label}</strong>
            <small>{row.detail}</small>
          </span>
          <span className="daykare-volume-control">
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={Math.round(row.value * 100)}
              disabled={!audioEnabled}
              onChange={(event) => row.set(Number(event.target.value) / 100)}
              aria-label={`${row.label} volume`}
              data-testid={`slider-${row.id}-volume`}
            />
            <output>{Math.round(row.value * 100)}%</output>
          </span>
        </label>
      ))}
      <div className="daykare-audio-tests" aria-label="Audio test controls">
        <button
          type="button"
          disabled={!audioEnabled}
          onClick={() => unlockAllGameAudio("menu")}
        >
          Test Music
        </button>
        <button
          type="button"
          disabled={!audioEnabled}
          onClick={() => {
            unlockAllGameAudio("menu");
            playVoice("child-greeting", { force: true });
          }}
        >
          Test Voice
        </button>
        <button
          type="button"
          disabled={!audioEnabled}
          onClick={() => {
            unlockAllGameAudio("menu");
            playGameSound("pickup", "interaction");
          }}
        >
          Test SFX
        </button>
      </div>
      <div className="daykare-lockup-card" data-testid="status-save-separation">
        <Check aria-hidden="true" />
        <div>
          <strong>Save boundaries protected</strong>
          <p>
            Story progression uses its existing save. Online preview data uses a
            separate namespace.
          </p>
        </div>
      </div>
      <CloudSyncStatus />
    </div>
  );
}

/**
 * Truthful about what is actually happening. "Disabled" is not an error and is
 * not dressed up as one: DayKare plays perfectly well without an account.
 */
function ConflictChooser() {
  const conflict = useCloudSyncStore((state) => state.conflict);
  const [busy, setBusy] = useState<"keep-local" | "keep-cloud" | null>(null);
  const [failed, setFailed] = useState(false);

  if (!conflict) return null;

  const choose = async (choice: "keep-local" | "keep-cloud") => {
    if (busy) return;
    setBusy(choice);
    setFailed(false);
    try {
      await resolveConflict(choice);
    } catch {
      // Nothing was destroyed - both saves still exist. Let the player retry.
      setFailed(true);
    } finally {
      setBusy(null);
    }
  };

  const otherDevice = conflict.cloud.deviceLabel;

  /**
   * The two saves side by side, on the rows that actually differ where
   * possible.
   *
   * This card used to read "Day 7, 100 REP" against "Day 7, 100 REP" - two
   * identical lines describing saves that differed by a full Juice Club float.
   * The player was asked to choose and shown nothing to choose on. Every field
   * either side reports is listed, and a field a save does not carry is left
   * blank rather than shown as 0, because "$0" and "no data" mean opposite
   * things and only one of them should talk you out of a save.
   */
  const rowLabels: string[] = [];
  for (const side of [conflict.local, conflict.cloud]) {
    for (const fact of side.facts ?? []) {
      if (!rowLabels.includes(fact.label)) rowLabels.push(fact.label);
    }
  }
  const valueFor = (
    side: { facts?: { label: string; value: string }[] },
    label: string,
  ) => side.facts?.find((f) => f.label === label)?.value ?? null;

  const cloudSavedAt =
    conflict.cloud.updatedAt !== null
      ? formatRelativeTime(conflict.cloud.updatedAt)
      : null;

  const modeName =
    conflict.scope === "online" ? "DayKare Online" : "Story Mode";

  return (
    <div className="daykare-lockup-card" data-testid="panel-cloud-conflict">
      <div>
        <strong>Which {modeName} save do you want to keep?</strong>
        <p>
          Nothing has been overwritten. {conflict.reason} Pick one to carry on
          with - the other one is kept as a backup, not deleted.
        </p>
      </div>
      {rowLabels.length > 0 && (
        <table
          className="daykare-conflict-table"
          data-testid="table-cloud-conflict"
        >
          <thead>
            <tr>
              <th scope="col">
                <span className="daykare-visually-hidden">What</span>
              </th>
              <th scope="col">This device</th>
              <th scope="col">
                {otherDevice ? `Your account (${otherDevice})` : "Your account"}
              </th>
            </tr>
          </thead>
          <tbody>
            {rowLabels.map((label) => {
              const mine = valueFor(conflict.local, label);
              const theirs = valueFor(conflict.cloud, label);
              return (
                <tr
                  key={label}
                  className={mine !== theirs ? "is-different" : ""}
                >
                  <th scope="row">{label}</th>
                  <td>
                    {mine ?? (
                      <span aria-label="not in this save">{"\u2014"}</span>
                    )}
                  </td>
                  <td>
                    {theirs ?? (
                      <span aria-label="not in this save">{"\u2014"}</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {cloudSavedAt && (
              <tr>
                <th scope="row">Last saved</th>
                <td>{"\u2014"}</td>
                <td>{cloudSavedAt}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      <div className="daykare-conflict-choices">
        <button
          type="button"
          className={`daykare-setting-row daykare-setting-button ${conflict.suggested === "keep-local" ? "is-on" : ""}`}
          onClick={() => void choose("keep-local")}
          disabled={busy !== null}
          data-testid="button-conflict-keep-local"
        >
          <span>
            <strong>Keep this device{"\u2019"}s save</strong>
            <span>The progress on this device</span>
          </span>
          {conflict.suggested === "keep-local" ? (
            <Check aria-hidden="true" />
          ) : null}
        </button>
        <button
          type="button"
          className={`daykare-setting-row daykare-setting-button ${conflict.suggested === "keep-cloud" ? "is-on" : ""}`}
          onClick={() => void choose("keep-cloud")}
          disabled={busy !== null}
          data-testid="button-conflict-keep-cloud"
        >
          <span>
            <strong>Use the other save</strong>
            <span>
              The progress saved to your account
              {otherDevice ? ` (from ${otherDevice})` : ""}
            </span>
          </span>
          {conflict.suggested === "keep-cloud" ? (
            <Check aria-hidden="true" />
          ) : null}
        </button>
      </div>
      {busy ? (
        <p data-testid="status-conflict-busy">Applying your choice{"\u2026"}</p>
      ) : null}
      {failed ? (
        <p data-testid="status-conflict-failed">
          That did not go through. Both saves are still safe - try again in a
          moment.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Truthful about what is actually happening. "Disabled" is not an error and is
 * not dressed up as one: DayKare plays perfectly well without an account.
 */
function CloudSyncStatus() {
  const story = useCloudSyncStore((state) => state.story);
  const online = useCloudSyncStore((state) => state.online);
  const conflict = useCloudSyncStore((state) => state.conflict);

  /**
   * Report the worse of the two scopes, not just Story.
   *
   * This card used to read `story` alone. During the Phase 3 preview QA the
   * Online scope failed every read, sat in `error`, and the card cheerfully
   * said "Cloud save on" the whole time - the one state a player would never
   * think to question. A status line that can only report good news is not a
   * status line.
   */
  const severity: Record<string, number> = {
    idle: 0,
    syncing: 1,
    disabled: 2,
    offline: 3,
    error: 4,
    conflict: 5,
  };
  const worst =
    (severity[online.state] ?? 0) > (severity[story.state] ?? 0)
      ? online
      : story;

  const copy: Record<string, { title: string; detail: string }> = {
    disabled: {
      title: "Playing on this device",
      detail: "Your progress is saved here in this browser.",
    },
    offline: {
      title: "Cloud save unavailable",
      detail:
        "Playing from this device. Progress is safe and will sync when the connection returns.",
    },
    idle: {
      title: "Cloud save on",
      detail: "Your progress is backed up to your DayKare account.",
    },
    syncing: {
      title: "Saving to the cloud\u2026",
      detail: "Keep playing - this happens in the background.",
    },
    conflict: {
      title: "Two versions of your save",
      detail:
        "This device and another one both have progress. Nothing has been overwritten.",
    },
    error: {
      title: "Cloud save paused",
      detail: "Playing from this device. Your local progress is untouched.",
    },
  };
  const shown = copy[worst.state] ?? copy.disabled;

  return (
    <>
      <div
        className="daykare-lockup-card"
        data-testid={`status-cloud-sync-${worst.state}`}
      >
        <div>
          <strong>{shown.title}</strong>
          <p>
            {conflict
              ? `${copy.conflict.detail} ${conflict.reason}`
              : shown.detail}
          </p>
        </div>
      </div>
      <ConflictChooser />
    </>
  );
}

function AccessibilityPanel() {
  const reducedMotion = useSettingsStore(
    (state) => state.account.reducedMotion,
  );
  const highContrast = useSettingsStore((state) => state.account.highContrast);
  const largerText = useSettingsStore((state) => state.account.largerText);
  const toggleReducedMotion = useSettingsStore(
    (state) => state.toggleReducedMotion,
  );
  const toggleHighContrast = useSettingsStore(
    (state) => state.toggleHighContrast,
  );
  const toggleLargerText = useSettingsStore((state) => state.toggleLargerText);
  const options = [
    {
      label: "Reduce motion",
      detail: "Shorter transitions and calmer menu movement",
      icon: Sparkles,
      value: reducedMotion,
      toggle: toggleReducedMotion,
      id: "motion",
    },
    {
      label: "Higher contrast",
      detail: "Stronger edges around panels and controls",
      icon: Eye,
      value: highContrast,
      toggle: toggleHighContrast,
      id: "contrast",
    },
    {
      label: "Larger text",
      detail: "Increase menu copy for easier reading",
      icon: TextCursorInput,
      value: largerText,
      toggle: toggleLargerText,
      id: "text",
    },
  ];
  return (
    <div className="daykare-front-panel-content">
      <div className="daykare-feature-card daykare-feature-card-blue">
        <Accessibility aria-hidden="true" />
        <div>
          <p className="daykare-eyebrow">Comfort controls</p>
          <h2>Make the campus feel right.</h2>
          <p>
            These preferences follow your account across devices and never alter
            Story or Online progression.
          </p>
        </div>
      </div>
      {options.map((option) => {
        const Icon = option.icon;
        return (
          <button
            type="button"
            className={`daykare-setting-row daykare-setting-button ${option.value ? "is-on" : ""}`}
            onClick={option.toggle}
            key={option.id}
            data-testid={`button-accessibility-${option.id}`}
          >
            <span>
              <Icon aria-hidden="true" />
              <strong>{option.label}</strong>
              <small>{option.detail}</small>
            </span>
            <span className="daykare-switch" aria-hidden="true">
              <span />
            </span>
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
  const reducedMotion = useSettingsStore(
    (state) => state.account.reducedMotion,
  );
  const highContrast = useSettingsStore((state) => state.account.highContrast);
  const largerText = useSettingsStore((state) => state.account.largerText);
  const audioEnabled = useSettingsStore((state) => state.device.audioEnabled);

  useEffect(() => {
    document.documentElement.classList.toggle(
      "daykare-reduce-motion",
      reducedMotion,
    );
    document.documentElement.classList.toggle(
      "daykare-high-contrast",
      highContrast,
    );
    document.documentElement.classList.toggle(
      "daykare-larger-text",
      largerText,
    );
    setGameAudioEnabled(audioEnabled);
  }, [reducedMotion, highContrast, largerText, audioEnabled]);

  useEffect(() => {
    if (!menuOpen || panel === "menu") return undefined;
    const closePanel = (event: KeyboardEvent) => {
      if (event.key === "Escape") useModeStore.getState().backToMenu();
    };
    window.addEventListener("keydown", closePanel);
    return () => window.removeEventListener("keydown", closePanel);
  }, [menuOpen, panel]);

  if (activeMode === "multiplayer-lobby") {
    return <OnlineLobby />;
  }
  if (!menuOpen) return null;
  if (panel !== "menu") {
    return (
      <div
        className="daykare-front-panel-shell"
        data-testid={`overlay-front-panel-${panel}`}
      >
        <section
          className={`daykare-front-panel ${panel === "shop" ? "daykare-front-panel-shop" : ""}`}
          role="dialog"
          aria-modal="true"
        >
          <PanelHeader panel={panel} />
          {panel === "shop" && <MonetizationShop />}
          {panel === "customize" && <CustomizePanel />}
          {panel === "progress" && <ProgressPanel />}
          {panel === "settings" && <SettingsPanel />}
          {panel === "accessibility" && <AccessibilityPanel />}
        </section>
      </div>
    );
  }
  return (
    <GameMenu
      isOpen
      onClose={() => {
        unlockAllGameAudio();
        closeMenu();
      }}
      onStoryMode={() => {
        unlockAllGameAudio("daycare");
        enterStory();
      }}
      onDayKareOnline={enterOnlinePreview}
      onCustomize={() => openPanel("customize")}
      onProgress={() => openPanel("progress")}
      onShop={() => openPanel("shop")}
      onSettings={() => openPanel("settings")}
      onAccessibility={() => openPanel("accessibility")}
      onlineSeatCount={online.seats.length}
    />
  );
}
