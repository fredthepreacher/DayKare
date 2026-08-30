import {
  ArrowLeft,
  Check,
  Copy,
  Globe2,
  LockKeyhole,
  Users,
  UserRoundPlus,
} from 'lucide-react';
import { useState } from 'react';
import { ONLINE_MAX_PLAYERS, useModeStore, type OnlineSeat, type OnlineVisibility } from './modeStore';

const visibilityOptions: Array<{
  value: OnlineVisibility;
  label: string;
  detail: string;
  icon: typeof Globe2;
}> = [
  { value: 'public', label: 'Public discovery', detail: 'A future matchmaking doorway', icon: Globe2 },
  { value: 'friends', label: 'Friends only', detail: 'A future friends-list doorway', icon: Users },
  { value: 'invite', label: 'Invite code', detail: 'Share a code with your playgroup', icon: LockKeyhole },
];

const outfitNames = ['Sunbeam', 'Garden Scout', 'Storybook', 'Juice Club'];
const accessoryNames = ['No extra', 'Star satchel', 'Rain boots', 'Sticker roll'];

function SeatCard({ seat }: { seat: OnlineSeat }) {
  return (
    <div className="daykare-seat-card" data-testid={`card-online-seat-${seat.id}`}>
      <span className="daykare-seat-avatar" style={{ backgroundColor: seat.color }} aria-hidden="true">
        {seat.role === 'staff' ? 'S' : seat.role === 'you' ? 'Y' : seat.name.slice(0, 1)}
      </span>
      <span className="min-w-0">
        <strong data-testid={`text-online-seat-name-${seat.id}`}>{seat.name}</strong>
        <small>{seat.role === 'staff' ? 'Staff guide' : seat.role === 'you' ? 'Your toddler' : 'NPC toddler'}</small>
      </span>
      <span className={`daykare-seat-status ${seat.role === 'you' ? 'is-ready' : ''}`}>
        {seat.role === 'you' ? <Check aria-hidden="true" /> : 'NPC'}
      </span>
    </div>
  );
}

export function OnlineLobby() {
  const {
    online,
    backToMenu,
    enterStory,
    setOnlineVisibility,
    cycleOnlineOutfit,
    cycleOnlineAccessory,
  } = useModeStore();
  const [copied, setCopied] = useState(false);

  const copyInviteCode = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(online.inviteCode);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="daykare-online-shell" data-testid="overlay-online-lobby">
      <section className="daykare-online-panel" role="dialog" aria-modal="true" aria-labelledby="online-title">
        <header className="daykare-online-header">
          <button type="button" className="daykare-plain-button" onClick={backToMenu} data-testid="button-online-back">
            <ArrowLeft aria-hidden="true" />
            Menu
          </button>
          <div className="daykare-online-title-row">
            <span className="daykare-online-mark" aria-hidden="true"><Globe2 /></span>
            <div>
              <p className="daykare-eyebrow">DayKare Online</p>
              <h1 id="online-title">Playground lobby</h1>
            </div>
          </div>
          <span className="daykare-preview-pill" data-testid="status-online-preview">Preview only</span>
        </header>

        <div className="daykare-online-notice" role="status" data-testid="status-networking">
          <span className="daykare-notice-dot" aria-hidden="true" />
          <div>
            <strong>Networking is not connected yet.</strong>
            <p>This lobby shows the future room shape with safe local preview seats. No players are being matched or connected.</p>
          </div>
        </div>

        <div className="daykare-online-grid">
          <div className="daykare-online-main-column">
            <div className="daykare-online-section-heading">
              <div>
                <p className="daykare-eyebrow">Local preview room</p>
                <h2><Users aria-hidden="true" /> {online.seats.length} / {ONLINE_MAX_PLAYERS} seats</h2>
              </div>
              <span className="daykare-seat-count">NPCs fill the room</span>
            </div>
            <div className="daykare-seat-grid">
              {online.seats.map((seat) => <SeatCard key={seat.id} seat={seat} />)}
              {Array.from({ length: ONLINE_MAX_PLAYERS - online.seats.length }).map((_, index) => (
                <div className="daykare-seat-card is-open" key={`open-${index}`} data-testid={`card-online-open-seat-${index}`}>
                  <span className="daykare-seat-avatar is-open" aria-hidden="true"><UserRoundPlus /></span>
                  <span><strong>Open seat</strong><small>Reserved for future players</small></span>
                </div>
              ))}
            </div>

            <div className="daykare-online-section-heading compact">
              <div>
                <p className="daykare-eyebrow">Room doorway</p>
                <h2>Who can find this room?</h2>
              </div>
            </div>
            <div className="daykare-visibility-list" role="radiogroup" aria-label="Room visibility">
              {visibilityOptions.map((option) => {
                const Icon = option.icon;
                const selected = online.visibility === option.value;
                return (
                  <button
                    type="button"
                    key={option.value}
                    className={`daykare-visibility-option ${selected ? 'is-selected' : ''}`}
                    onClick={() => setOnlineVisibility(option.value)}
                    role="radio"
                    aria-checked={selected}
                    data-testid={`button-online-visibility-${option.value}`}
                  >
                    <Icon aria-hidden="true" />
                    <span><strong>{option.label}</strong><small>{option.detail}</small></span>
                    <span className="daykare-radio-dot" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
            {online.visibility === 'invite' && (
              <div className="daykare-invite-code" data-testid="status-online-invite-code">
                <span>Preview invite code</span>
                <strong>{online.inviteCode}</strong>
                <button type="button" onClick={copyInviteCode} data-testid="button-copy-online-code" aria-label="Copy preview invite code">
                  {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                </button>
              </div>
            )}
          </div>

          <aside className="daykare-online-side-column">
            <div className="daykare-customize-card">
              <p className="daykare-eyebrow">Toddler customization hooks</p>
              <h2>Make your seat yours</h2>
              <p className="daykare-muted-copy">These local choices are ready for a future connected profile.</p>
              <button type="button" className="daykare-choice-button" onClick={cycleOnlineOutfit} data-testid="button-online-outfit">
                <span>Outfit</span><strong>{outfitNames[online.selectedOutfit]}</strong><span aria-hidden="true">Next</span>
              </button>
              <button type="button" className="daykare-choice-button" onClick={cycleOnlineAccessory} data-testid="button-online-accessory">
                <span>Accessory</span><strong>{accessoryNames[online.selectedAccessory]}</strong><span aria-hidden="true">Next</span>
              </button>
            </div>
            <div className="daykare-online-safety-card">
              <p className="daykare-eyebrow">Playground promise</p>
              <strong>Kind play, clear boundaries.</strong>
              <p>No purchases, loot boxes, or progression shortcuts belong in this room.</p>
            </div>
            <button type="button" className="daykare-online-story-button" onClick={enterStory} data-testid="button-return-story">
              Return to Story Mode
            </button>
          </aside>
        </div>
      </section>
    </div>
  );
}