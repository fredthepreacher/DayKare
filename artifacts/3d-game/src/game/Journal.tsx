import { useGameStore } from './store';
import {
  Backpack,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  DollarSign,
  Heart,
  LockKeyhole,
  Map as MapIcon,
  MapPinned,
  Sparkles,
  Target,
  Trophy,
} from 'lucide-react';
import { HUB_ROUTES, isRouteUnlocked, requirementLabel } from './progression';
import { RIVAL_CHAPTERS } from './storyProgression';
import { useEffect, useMemo, useState } from 'react';
import {
  BOARD_STATUS_LABELS,
  boardSection,
  buildQuestBoard,
  caperStepLabel,
  primaryObjective,
  type BoardEntry,
  type BoardStatus,
} from './questBoard';
import { WorldMap } from './WorldMap';
import { DripPanel } from './DripPanel';

/**
 * The Journal.
 *
 * The old layout was a two-page book with five always-mounted sections stacked
 * on one scroll. On a phone the pages became a single column, which put the
 * ONLY close button below every section of page one - so a touch player who
 * opened the Journal had no visible way out, and there is no Escape handler and
 * no scrim dismissal either. That is fixed here first: the close control lives
 * on the book frame, not on a page.
 *
 * The rest is a split by intent rather than by machine. Every row's status comes
 * from questBoard, so Story quests, repeatable Activities and businesses can no
 * longer describe themselves in three different vocabularies.
 */

type TabId = 'active' | 'story' | 'activities' | 'business' | 'drip' | 'completed' | 'map' | 'kit';

const TABS: { id: TabId; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'story', label: 'Story' },
  { id: 'activities', label: 'Activities' },
  { id: 'business', label: 'Business' },
  { id: 'drip', label: 'Drip' },
  { id: 'completed', label: 'Completed' },
  { id: 'map', label: 'Map' },
  { id: 'kit', label: 'Backpack' },
];

const STATUS_STYLE: Record<BoardStatus, string> = {
  active: 'bg-orange-500 text-white',
  available: 'bg-emerald-500 text-white',
  locked: 'bg-stone-300 text-stone-700',
  complete: 'bg-green-100 text-green-800 border border-green-300',
  repeatable: 'bg-sky-500 text-white',
  cooldown: 'bg-amber-200 text-amber-900',
  'story-required': 'bg-violet-200 text-violet-900',
};

function StatusBadge({ status }: { status: BoardStatus }) {
  return (
    <span className={`daykare-status-badge ${STATUS_STYLE[status]}`}>
      {BOARD_STATUS_LABELS[status]}
    </span>
  );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  if (total <= 0) return null;
  const pct = Math.round((Math.min(done, total) / total) * 100);
  return (
    <div className="daykare-progress-track" aria-hidden="true">
      <div className="daykare-progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

function EntryCard({ entry, emphasised = false }: { entry: BoardEntry; emphasised?: boolean }) {
  const dimmed = entry.status === 'locked' || entry.status === 'story-required';
  return (
    <article className={`daykare-entry-card ${emphasised ? 'daykare-entry-card-primary' : ''} ${dimmed ? 'daykare-entry-card-dim' : ''}`}>
      <header className="flex items-start justify-between gap-2">
        <h4 className="font-black text-[#5c3a21] leading-tight">{entry.title}</h4>
        <StatusBadge status={entry.status} />
      </header>

      <p className="text-xs text-[#7a6353] mt-1">{entry.summary}</p>

      {entry.nextAction && (
        <p className="daykare-entry-next">
          <Target className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{entry.nextAction}</span>
        </p>
      )}

      {entry.requirement && (
        <p className="daykare-entry-requirement">
          <LockKeyhole className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{entry.requirement}</span>
        </p>
      )}

      {entry.roundProgress && entry.roundProgress.total > 0 && (
        <div className="mt-2">
          <div className="flex items-center justify-between text-[11px] font-bold text-[#8b5a2b]">
            <span>{entry.roundProgress.label}</span>
          </div>
          <ProgressBar done={entry.roundProgress.done} total={entry.roundProgress.total} />
        </div>
      )}

      {entry.roundProgress && entry.roundProgress.total === 0 && (
        <div className="mt-2 text-[11px] font-bold text-[#8b5a2b]">{entry.roundProgress.label}</div>
      )}

      <footer className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#8b5a2b]/85">
        {entry.location && <span>📍 {entry.location}</span>}
        {/* Lifetime totals are labelled as such. The old badge appended "· 7 done"
            to the status, which read as progress toward finishing the quest. */}
        {entry.lifetime && <span>🏅 {entry.lifetime}</span>}
        {entry.reward && <span>★ {entry.reward}</span>}
      </footer>

      {entry.unlocks && entry.unlocks.length > 0 && (
        <div className="daykare-entry-unlocks">Opens {entry.unlocks.join(' · ')}</div>
      )}
    </article>
  );
}

function Collapsible({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="daykare-collapsible">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="daykare-collapsible-head">
        <span>{title}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && <div className="daykare-collapsible-body">{children}</div>}
    </section>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="daykare-empty-note">{children}</p>;
}

export function Journal() {
  const {
    inventory,
    collectibles,
    progression,
    quests,
    juiceClubCash,
    juiceStock,
    crackerStock,
    juiceUpgrades,
    juiceClubCustomersServed,
    friends,
    buyHubUpgrade,
    buyStock,
    buyUpgrade,
    toggleJournal,
    rivalStory,
    dayNumber,
    caper,
    districtProgress,
    schedule,
    optionalRewardBoostUntil,
    activateOptionalRewardBoost,
  } = useGameStore();

  const [tab, setTab] = useState<TabId>('active');
  const [boostNow, setBoostNow] = useState(() => Date.now());
  const boostRemaining = Math.max(0, Math.ceil((optionalRewardBoostUntil - boostNow) / 1000));

  useEffect(() => {
    if (boostRemaining <= 0) return;
    const timer = window.setInterval(() => setBoostNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [boostRemaining]);

  // Escape closes the Journal. Its absence was part of why the mobile
  // close-button bug was unrecoverable rather than merely awkward.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') toggleJournal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleJournal]);

  const board = useMemo(
    () => buildQuestBoard({
      quests,
      caper,
      rivalStory,
      progression,
      juiceStock,
      crackerStock,
      juiceClubCash,
      juiceClubCustomersServed,
      schedule,
    }),
    [quests, caper, rivalStory, progression, juiceStock, crackerStock, juiceClubCash, juiceClubCustomersServed, schedule],
  );

  const primary = primaryObjective(board);
  const storyEntries = boardSection(board, 'story');
  const activityEntries = boardSection(board, 'activities');
  const businessEntries = boardSection(board, 'businesses');
  const completedEntries = boardSection(board, 'completed');

  return (
    <div className="daykare-journal-shell absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center pointer-events-auto z-50 p-4">
      <div className="daykare-journal-book bg-[#fcf8f2] w-full max-w-3xl rounded-3xl shadow-2xl border-8 border-[#8b5a2b]">
        {/* The frame header stays put on every tab and at every screen size, so
            the way out is always one tap away. */}
        <header className="daykare-journal-header">
          <div className="min-w-0">
            <h2 className="font-serif text-3xl font-bold text-[#5c3a21] leading-none">My Journal</h2>
            <div className="text-[10px] font-black uppercase tracking-widest text-[#8b5a2b]/60 mt-1">
              Day {dayNumber} · Auto-Saved
            </div>
          </div>
          <button type="button" onClick={toggleJournal} className="daykare-journal-close" aria-label="Close journal">
            Close
          </button>
        </header>

        <nav className="daykare-journal-tabs" aria-label="Journal sections">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTab(entry.id)}
              aria-current={tab === entry.id ? 'page' : undefined}
              className={`daykare-journal-tab ${tab === entry.id ? 'daykare-journal-tab-active' : ''}`}
            >
              {entry.label}
            </button>
          ))}
        </nav>

        <div className="daykare-journal-body">
          {tab === 'active' && (
            <div className="space-y-4">
              <div>
                <h3 className="daykare-section-head"><Target className="w-5 h-5 text-orange-600" /> Right now</h3>
                {primary
                  ? <EntryCard entry={primary} emphasised />
                  : <EmptyNote>Nothing is waiting on you. Try an activity or visit the Juice Club.</EmptyNote>}
              </div>

              {board.filter((entry) => entry.status === 'active' && entry.id !== primary?.id).length > 0 && (
                <div>
                  <h3 className="daykare-section-head"><Sparkles className="w-5 h-5 text-amber-600" /> Also in progress</h3>
                  <div className="space-y-2">
                    {board
                      .filter((entry) => entry.status === 'active' && entry.id !== primary?.id)
                      .map((entry) => <EntryCard key={entry.id} entry={entry} />)}
                  </div>
                </div>
              )}

              <div className="bg-amber-50/80 p-3 rounded-xl border border-amber-200">
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-white/70 p-2 rounded-lg text-center">
                    <div className="text-xl font-black text-amber-700">{progression.reputation}</div>
                    <div className="text-[10px] uppercase font-bold text-amber-900/60">Reputation</div>
                  </div>
                  <div className="bg-white/70 p-2 rounded-lg text-center">
                    <div className="text-xl font-black text-amber-700">{progression.tokens}</div>
                    <div className="text-[10px] uppercase font-bold text-amber-900/60">Star Tokens</div>
                  </div>
                  <div className="bg-white/70 p-2 rounded-lg text-center">
                    <div className="text-xl font-black text-amber-700">{progression.activityRuns['rainbow-tidy-up'] ?? 0}</div>
                    <div className="text-[10px] uppercase font-bold text-amber-900/60">Tidy Rounds</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'story' && (
            <div className="space-y-4">
              <div>
                <h3 className="daykare-section-head"><BookOpen className="w-5 h-5 text-violet-600" /> Story</h3>
                <div className="space-y-2">
                  {storyEntries.length === 0
                    ? <EmptyNote>Every Story thread so far is finished. Check Completed.</EmptyNote>
                    : storyEntries.map((entry) => <EntryCard key={entry.id} entry={entry} />)}
                </div>
              </div>

              <Collapsible title="Mae's chapters">
                <div className="space-y-2">
                  {RIVAL_CHAPTERS.map((chapter) => {
                    const complete = rivalStory.completedChapters.includes(chapter.id);
                    const current = rivalStory.chapter === chapter.chapter && rivalStory.beat !== 'complete';
                    return (
                      <div key={chapter.id} className={`p-2.5 rounded-lg border ${current ? 'bg-white border-violet-300' : 'bg-white/60 border-violet-100'}`}>
                        <div className="flex items-center justify-between gap-2">
                          <strong className="text-sm text-violet-950">{chapter.chapter}. {chapter.title}</strong>
                          <span className="text-[10px] font-black uppercase tracking-wide text-violet-700">
                            {complete ? 'Complete' : current ? 'Current' : 'Locked'}
                          </span>
                        </div>
                        {(complete || current) && <div className="mt-1 text-xs text-violet-950/70">{chapter.summary}</div>}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-lg bg-white/70 p-2">
                    <div className="text-lg font-black text-violet-700">{rivalStory.trust}</div>
                    <div className="text-[10px] uppercase font-bold text-violet-900/60">Mutual trust</div>
                  </div>
                  <div className="rounded-lg bg-white/70 p-2">
                    <div className="text-lg font-black text-violet-700">{rivalStory.unlocks.length}</div>
                    <div className="text-[10px] uppercase font-bold text-violet-900/60">Story keepsakes</div>
                  </div>
                </div>
              </Collapsible>

              {caper.role !== 'none' && (
                <Collapsible title="Caper notes">
                  <div className="grid grid-cols-2 gap-2 text-xs text-orange-950">
                    <span><strong>Step:</strong> {caperStepLabel(caper.step)}</span>
                    <span><strong>Role:</strong> {caper.role.replace(/-/g, ' ')}</span>
                    <span><strong>Helper:</strong> {caper.helper}</span>
                    {caper.interruptions > 0 && <span><strong>Safe resets:</strong> {caper.interruptions}</span>}
                  </div>
                </Collapsible>
              )}
            </div>
          )}

          {tab === 'activities' && (
            <div className="space-y-3">
              <h3 className="daykare-section-head"><Sparkles className="w-5 h-5 text-sky-600" /> Activities</h3>
              <p className="daykare-empty-note">
                Activities repeat as often as you like. They never block Story progress.
              </p>
              {activityEntries.map((entry) => <EntryCard key={entry.id} entry={entry} />)}
            </div>
          )}

          {tab === 'business' && (
            <div className="space-y-3">
              <h3 className="daykare-section-head"><DollarSign className="w-5 h-5 text-green-600" /> Juice Club</h3>
              {businessEntries.map((entry) => <EntryCard key={entry.id} entry={entry} />)}

              <div className="bg-white/60 p-3 rounded-xl border border-[#e5d8cc] space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-green-50 p-2 rounded border border-green-200">
                    <div className="text-[10px] uppercase font-bold text-green-700">Cash</div>
                    <div className="font-black">${juiceClubCash}.00</div>
                  </div>
                  <div className="bg-orange-50 p-2 rounded border border-orange-200">
                    <div className="text-[10px] uppercase font-bold text-orange-700">Stock</div>
                    <div className="font-black">{juiceStock} juice · {crackerStock} crackers</div>
                  </div>
                </div>
                <div className="flex justify-between items-center gap-2 text-sm border-b border-[#e5d8cc] pb-2">
                  <span>Restock (5 Juice &amp; Crackers) — $2</span>
                  <button
                    onClick={() => buyStock('supplies', 2, 5)}
                    disabled={juiceClubCash < 2}
                    className="daykare-journal-action bg-green-600"
                  >Buy</button>
                </div>
                <div className="flex justify-between items-center gap-2 text-sm">
                  <span>Premium Cups (double earnings) — $10</span>
                  <button
                    onClick={() => buyUpgrade('premium-cups', 10)}
                    disabled={juiceClubCash < 10 || juiceUpgrades.includes('premium-cups')}
                    className="daykare-journal-action bg-green-600"
                  >
                    {juiceUpgrades.includes('premium-cups') ? 'Bought' : 'Buy'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === 'drip' && <DripPanel />}

          {tab === 'completed' && (
            <div className="space-y-3">
              <h3 className="daykare-section-head"><CheckCircle2 className="w-5 h-5 text-green-600" /> Completed</h3>
              {completedEntries.length === 0
                ? <EmptyNote>Nothing finished yet. Your first completed quest will be kept here.</EmptyNote>
                : completedEntries.map((entry) => <EntryCard key={entry.id} entry={entry} />)}
            </div>
          )}

          {tab === 'map' && (
            <div>
              <h3 className="daykare-section-head"><MapIcon className="w-5 h-5 text-[#8b5a2b]" /> Map</h3>
              <WorldMap />

              <h3 className="daykare-section-head"><MapPinned className="w-5 h-5 text-purple-600" /> Routes</h3>
              <div className="space-y-2">
                {HUB_ROUTES.map((route) => {
                  const unlocked = isRouteUnlocked(route, progression);
                  return (
                    <div key={route.id} className={`p-3 rounded-xl border flex items-start gap-3 ${unlocked ? 'bg-green-50 border-green-200' : 'bg-white/60 border-[#e5d8cc]'}`}>
                      <div className={`w-9 h-9 shrink-0 rounded-lg grid place-items-center ${unlocked ? 'bg-green-100 text-green-700' : 'bg-stone-100 text-stone-500'}`}>
                        {unlocked ? <CheckCircle2 className="w-5 h-5" /> : <LockKeyhole className="w-5 h-5" />}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-[#5c3a21]">{route.label}</div>
                        <div className="text-xs text-[#7a6353]">
                          {unlocked
                            ? route.id === 'maker-market'
                              ? `Entrance foundation ${districtProgress.makerMarket}/3`
                              : route.id === 'storybook-lane'
                                ? `Entrance foundation ${districtProgress.storybookLane}/3`
                                : 'Open connected route'
                            : requirementLabel(route)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="daykare-empty-note mt-3">
                Districts are reached by walking to their gates. The map shows where they are.
              </p>
            </div>
          )}

          {tab === 'kit' && (
            <div className="space-y-4">
              <div>
                <h3 className="daykare-section-head"><Backpack className="w-5 h-5 text-orange-600" /> Backpack</h3>
                <div className="text-xs text-[#7a6353] mb-1">Items</div>
                <div className="flex flex-wrap gap-2">
                  {inventory.length === 0 && <span className="text-sm italic text-[#8b5a2b]/70">Empty…</span>}
                  {inventory.map((item) => (
                    <span key={item} className="bg-orange-100 text-orange-900 px-3 py-1 rounded-full text-sm font-bold border border-orange-300">{item}</span>
                  ))}
                </div>
                <div className="text-xs text-[#7a6353] mt-3 mb-1">Collectibles</div>
                <div className="flex flex-wrap gap-2">
                  {collectibles.length === 0 && <span className="text-sm italic text-[#8b5a2b]/70">Empty…</span>}
                  {collectibles.map((item) => (
                    <span key={item} className="bg-purple-100 text-purple-900 px-3 py-1 rounded-full text-sm font-bold border border-purple-300">{item}</span>
                  ))}
                </div>
              </div>

              <div className="bg-amber-50/80 p-3 rounded-xl border border-amber-200 space-y-3">
                <h3 className="daykare-section-head mb-0"><Trophy className="w-5 h-5 text-amber-600" /> Upgrades</h3>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-black text-[#5c3a21]">Lost &amp; Found Organizer</div>
                    <div className="text-xs text-amber-950/70">Sends dropped quest toys to a visible recovery shelf.</div>
                  </div>
                  <button
                    onClick={() => buyHubUpgrade('storage-organizer', 6)}
                    disabled={!progression.trustedHelperPass || progression.tokens < 6 || progression.hubUpgrades.includes('storage-organizer')}
                    className="daykare-journal-action bg-amber-600"
                  >
                    {progression.hubUpgrades.includes('storage-organizer')
                      ? 'Installed'
                      : progression.trustedHelperPass ? 'Buy · 6 ★' : 'Pass needed'}
                  </button>
                </div>
                <div className="flex items-center justify-between gap-3 pt-2 border-t border-amber-200">
                  <div>
                    <div className="text-sm font-black text-violet-950">Optional Helper Boost</div>
                    <div className="text-xs text-violet-950/70">
                      A player-chosen 45-second boost. It doubles Star Tokens from ordinary activities; no ad or purchase is used in this build.
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const now = Date.now();
                      activateOptionalRewardBoost(now);
                      setBoostNow(now);
                    }}
                    disabled={boostRemaining > 0}
                    className="daykare-journal-action bg-violet-600"
                  >
                    {boostRemaining > 0 ? `${boostRemaining}s` : 'Start 45s'}
                  </button>
                </div>
                {progression.trustedHelperPass && (
                  <div className="text-xs font-bold text-green-700 bg-green-100 px-3 py-2 rounded-lg">
                    Trusted Helper Pass earned. The Storage Room remains adults-only.
                  </div>
                )}
              </div>

              <div>
                <h3 className="daykare-section-head"><Heart className="w-5 h-5 text-red-500" /> Friends met</h3>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(friends).map(([name, data]) => (
                    <div key={name} className="bg-white/60 p-2.5 rounded-lg border border-[#e5d8cc] flex items-center gap-2">
                      <div className="w-9 h-9 bg-orange-100 rounded-full flex items-center justify-center font-bold text-orange-800 shrink-0">{name[0]}</div>
                      <div className="min-w-0">
                        <div className="font-bold text-sm truncate">{name}</div>
                        <div className="text-xs text-[#7a6353] truncate">{data.mood} • {data.friendship}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-center pt-2">
                <button onClick={() => useGameStore.getState().resetGame()} className="daykare-journal-danger">
                  Reset Save Data
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
