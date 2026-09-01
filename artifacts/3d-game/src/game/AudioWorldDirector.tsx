import { useEffect } from "react";
import { useGameStore } from "./store";
import { useModeStore } from "./modeStore";
import { useSettingsStore } from "./settingsStore";
import { playGameSound } from "./audio";
import {
  configureRichGameAudio,
  getAudioDebugSnapshot,
  playAssetSfx,
  playVoice,
  setAudioDialogueDucked,
  setAudioScene,
  unlockRichGameAudio,
} from "./audioDirector";
import { voiceGroupForAmbientContext, type AudioScene } from "./audioAssets";

function sceneFor(
  menuOpen: boolean,
  zone: string,
  schedule: string,
): AudioScene {
  if (menuOpen) return "menu";
  if (zone === "garden") return "garden";
  if (zone === "storybook") return "storybook";
  if (schedule === "recess" || schedule === "outdoor-play") return "garden";
  if (schedule === "juice-club") return "juice-club";
  if (schedule === "nap") return "nap";
  return "daycare";
}

/** One world-level director owns music, ambience, voices and browser unlocking. */
export function AudioWorldDirector() {
  const menuOpen = useModeStore((state) => state.menuOpen);
  const zone = useGameStore((state) => state.zone);
  const schedule = useGameStore((state) => state.schedule);
  const activeDialogue = useGameStore((state) => state.activeDialogue);
  const zoneTransitioning = useGameStore((state) => state.zoneTransitioning);
  const device = useSettingsStore((state) => state.device);
  const currentScene = sceneFor(menuOpen, zone, schedule);

  useEffect(() => {
    configureRichGameAudio({
      enabled: device.audioEnabled,
      musicVolume: device.musicVolume,
      sfxVolume: device.sfxVolume,
      voiceVolume: device.voiceVolume,
    });
  }, [
    device.audioEnabled,
    device.musicVolume,
    device.sfxVolume,
    device.voiceVolume,
  ]);

  useEffect(() => setAudioScene(currentScene), [currentScene]);
  useEffect(
    () => setAudioDialogueDucked(Boolean(activeDialogue) || zoneTransitioning),
    [activeDialogue, zoneTransitioning],
  );

  useEffect(() => {
    const handleVisibility = () => {
      const visible = document.visibilityState === "visible";
      configureRichGameAudio({
        enabled: visible && device.audioEnabled,
        musicVolume: device.musicVolume,
        sfxVolume: device.sfxVolume,
        voiceVolume: device.voiceVolume,
      });
      if (visible && getAudioDebugSnapshot().unlocked) unlockRichGameAudio(currentScene);
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [
    currentScene,
    device.audioEnabled,
    device.musicVolume,
    device.sfxVolume,
    device.voiceVolume,
  ]);

  useEffect(() => {
    if (menuOpen || zoneTransitioning || activeDialogue) return undefined;
    const speak = () => {
      const state = useGameStore.getState();
      if (state.activeDialogue || state.journalOpen || state.zoneTransitioning)
        return;
      const liveScene = sceneFor(
        useModeStore.getState().menuOpen,
        state.zone,
        state.schedule,
      );
      if (liveScene === "nap") return;
      playVoice(voiceGroupForAmbientContext(state.schedule, liveScene), {
        ambient: true,
        attenuation: 0.82,
      });
    };
    // A fresh player hears a real character early, then the 18-second global
    // cooldown and randomized interval keep the room alive without a voice wall.
    const first = window.setTimeout(speak, 7000);
    const interval = window.setInterval(
      speak,
      23000 + Math.floor(Math.random() * 7000),
    );
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [menuOpen, zone, zoneTransitioning, activeDialogue]);

  useEffect(() => {
    if (menuOpen || zoneTransitioning || activeDialogue) return undefined;
    const accent = () => {
      if (currentScene === "garden") playGameSound("garden-bird", "ambient");
      else if (currentScene === "juice-club")
        playGameSound("juice-service", "ambient");
      else if (currentScene === "storybook")
        playAssetSfx("audio/storybook-lane/pet_happy_chirp.wav", 0.22);
      else if (currentScene === "daycare") playGameSound("play", "ambient");
    };
    const first = window.setTimeout(accent, 4200);
    const interval = window.setInterval(
      accent,
      currentScene === "garden" ? 12500 : 16000,
    );
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [currentScene, menuOpen, zoneTransitioning, activeDialogue]);

  useEffect(() => {
    if (!zoneTransitioning) return;
    playGameSound("door", "interaction");
  }, [zoneTransitioning]);

  return null;
}
