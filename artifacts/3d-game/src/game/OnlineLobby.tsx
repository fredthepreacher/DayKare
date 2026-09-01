import { ArrowLeft, Globe2, LoaderCircle, Users } from 'lucide-react';
import { useState } from 'react';
import { isCloudConfigured } from '@workspace/cloud-sync';
import { connectMultiplayer, disconnectMultiplayer, useMultiplayerStore } from './multiplayer';
import { ONLINE_MAX_PLAYERS, useModeStore } from './modeStore';

export function OnlineLobby() {
  const online = useModeStore((state) => state.online);
  const backToMenu = useModeStore((state) => state.backToMenu);
  const startMultiplayer = useModeStore((state) => state.startMultiplayer);
  const setDisplayName = useModeStore((state) => state.setDisplayName);
  const status = useMultiplayerStore((state) => state.status);
  const error = useMultiplayerStore((state) => state.error);
  const occupancy = useMultiplayerStore((state) => state.occupancy);
  const configured = isCloudConfigured(import.meta.env as unknown as Record<string, unknown>);
  const [name, setName] = useState(online.displayName);

  const join = async () => {
    const displayName = name.trim().slice(0, 24) || 'New Kid';
    if (await connectMultiplayer(online.roomId, displayName)) {
      setDisplayName(displayName);
      startMultiplayer();
    }
  };

  const leaveLobby = () => {
    void disconnectMultiplayer();
    backToMenu();
  };

  return (
    <div className="daykare-online-shell" data-testid="overlay-online-lobby">
      <section className="daykare-online-panel" role="dialog" aria-modal="true" aria-labelledby="online-title">
        <header className="daykare-online-header">
          <button type="button" className="daykare-plain-button" onClick={leaveLobby} data-testid="button-online-back"><ArrowLeft /> Menu</button>
          <div className="daykare-online-title-row">
            <span className="daykare-online-mark"><Globe2 /></span>
            <div><p className="daykare-eyebrow">DayKare Multiplayer</p><h1 id="online-title">Friends room</h1></div>
          </div>
          <span className="daykare-preview-pill">Up to {ONLINE_MAX_PLAYERS}</span>
        </header>

        <div className="daykare-online-notice" role="status" data-testid="status-networking">
          <span className="daykare-notice-dot" />
          <div>
            <strong>{configured ? 'Realtime room ready.' : 'Multiplayer service is not configured on this deployment.'}</strong>
            <p>{configured ? 'Friends opening the same DayKare link join the same authenticated room. Positions and animations update ten times per second.' : 'Single-player remains available. Add the public Supabase URL/key, enable anonymous sign-ins, and apply the multiplayer migration to turn this room on.'}</p>
          </div>
        </div>

        <div className="daykare-online-grid">
          <div className="daykare-online-main-column">
            <div className="daykare-online-section-heading">
              <div><p className="daykare-eyebrow">DayKare Room</p><h2><Users /> {occupancy} / {ONLINE_MAX_PLAYERS} players</h2></div>
              <span className="daykare-seat-count">Room code: {online.roomId.toUpperCase()}</span>
            </div>
            <label className="daykare-customize-card">
              <span className="daykare-eyebrow">Your display name</span>
              <input
                value={name}
                maxLength={24}
                onChange={(event) => setName(event.target.value)}
                className="mt-3 w-full rounded-2xl border-2 border-[#d4c3b3] bg-white px-4 py-3 text-lg font-black text-[#5c3a21] outline-none focus:border-[#33cccc]"
                data-testid="input-multiplayer-name"
                autoComplete="nickname"
              />
            </label>
            {(error || status === 'room-full') && (
              <div className="daykare-online-safety-card" role="alert" data-testid="status-multiplayer-error">
                <strong>{status === 'room-full' ? 'This room is full.' : 'Could not connect.'}</strong>
                <p>{error ?? 'Try again after a friend leaves.'}</p>
              </div>
            )}
          </div>
          <aside className="daykare-online-side-column">
            <div className="daykare-online-safety-card">
              <p className="daykare-eyebrow">Friends-only MVP</p>
              <strong>Shared daycare, Garden, and Storybook Lane.</strong>
              <p>Movement, direction, animation, names, pets, and recovery poses replicate. Personal quests and UI stay local.</p>
            </div>
            <button
              type="button"
              className="daykare-online-story-button"
              onClick={() => void join()}
              disabled={!configured || status === 'connecting' || !name.trim()}
              data-testid="button-join-multiplayer"
            >
              {status === 'connecting' ? <><LoaderCircle className="animate-spin" /> Connecting…</> : 'Join DayKare Room'}
            </button>
          </aside>
        </div>
      </section>
    </div>
  );
}
