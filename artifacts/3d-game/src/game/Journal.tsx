import { useGameStore } from './store';
import {
  Backpack,
  BookOpen,
  CheckCircle2,
  DollarSign,
  Heart,
  LockKeyhole,
  MapPinned,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { HUB_ROUTES, isRouteUnlocked, requirementLabel } from './progression';
import { getCurrentObjective, QUEST_DEFINITIONS } from './quests';
import { RIVAL_CHAPTERS } from './storyProgression';
import { useEffect, useState } from 'react';

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
    friends,
    buyHubUpgrade,
    buyStock,
    buyUpgrade,
    toggleJournal,
    rivalStory,
    dayNumber,
    caper,
    districtProgress,
    optionalRewardBoostUntil,
    activateOptionalRewardBoost,
  } = useGameStore();
  const [boostNow, setBoostNow] = useState(() => Date.now());
  const boostRemaining = Math.max(0, Math.ceil((optionalRewardBoostUntil - boostNow) / 1000));

  useEffect(() => {
    if (boostRemaining <= 0) return;
    const timer = window.setInterval(() => setBoostNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [boostRemaining]);

  return (
    <div className="daykare-journal-shell absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center pointer-events-auto z-50 p-4">
      <div className="daykare-journal-book bg-[#fcf8f2] w-full max-w-5xl h-[85vh] rounded-3xl shadow-2xl flex overflow-hidden border-8 border-[#8b5a2b]">
        {/* Left Page */}
        <div className="flex-1 p-8 border-r border-[#d4c3b3] relative overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="font-serif text-4xl font-bold text-[#5c3a21]">My Journal</h2>
              <div className="text-xs font-black uppercase tracking-widest text-[#8b5a2b]/60">Day {dayNumber}</div>
            </div>
            <div className="text-sm font-bold text-green-600 bg-green-100 px-3 py-1 rounded-full">Auto-Saved</div>
          </div>

          <div className="space-y-6">
            <div className="bg-white/50 p-4 rounded-xl border border-[#e5d8cc]">
              <h3 className="font-bold text-xl mb-2 flex items-center gap-2">
                <Backpack className="w-5 h-5 text-orange-600" /> Backpack
              </h3>
              <div className="flex flex-wrap gap-4">
                <div className="flex-1">
                  <div className="text-sm text-muted-foreground mb-1">Items</div>
                  <div className="flex flex-wrap gap-2">
                    {inventory.length === 0 && <span className="text-sm italic">Empty...</span>}
                    {inventory.map(item => (
                      <span key={item} className="bg-orange-100 text-orange-900 px-3 py-1 rounded-full text-sm font-bold border border-orange-300">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex-1">
                  <div className="text-sm text-muted-foreground mb-1">Collectibles</div>
                  <div className="flex flex-wrap gap-2">
                    {collectibles.length === 0 && <span className="text-sm italic">Empty...</span>}
                    {collectibles.map(item => (
                      <span key={item} className="bg-purple-100 text-purple-900 px-3 py-1 rounded-full text-sm font-bold border border-purple-300">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-amber-50/80 p-4 rounded-xl border border-amber-200">
              <h3 className="font-bold text-xl mb-3 flex items-center gap-2 text-[#5c3a21]">
                <Trophy className="w-5 h-5 text-amber-600" /> Hub Progress
              </h3>
              <div className="grid grid-cols-3 gap-2 mb-3">
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
              <div className="text-sm text-amber-950/75 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                Repeat activities, help friends, and run the Juice Club to prepare new routes.
              </div>
              <img
                src={`${import.meta.env.BASE_URL}daykare-assets/20_reward_stickers.png`}
                alt="DayKare reward sticker collection"
                className="mt-3 w-full max-h-28 object-cover rounded-lg border border-amber-200"
              />
              <div className="mt-3 p-3 rounded-lg bg-white/70 border border-amber-200">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-black text-[#5c3a21]">Lost & Found Organizer</div>
                    <div className="text-xs text-amber-950/70">
                      Sends dropped quest toys to a visible recovery shelf. Costs 6 Star Tokens.
                    </div>
                  </div>
                  <button
                    onClick={() => buyHubUpgrade('storage-organizer', 6)}
                    disabled={!progression.trustedHelperPass || progression.tokens < 6 || progression.hubUpgrades.includes('storage-organizer')}
                    className="shrink-0 bg-amber-500 text-white px-3 py-2 rounded-lg text-xs font-black disabled:opacity-45"
                  >
                    {progression.hubUpgrades.includes('storage-organizer')
                      ? 'Installed'
                      : progression.trustedHelperPass
                        ? 'Buy · 6 ★'
                        : 'Helper Pass required'}
                  </button>
                </div>
              </div>
              <div className="mt-3 p-3 rounded-lg bg-violet-50/80 border border-violet-200">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-black text-violet-950">Optional Helper Boost</div>
                    <div className="text-xs text-violet-950/70">
                      Player-chosen 15-second hook. It doubles Star Tokens from ordinary activities; no ad or purchase is used in this build.
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const now = Date.now();
                      activateOptionalRewardBoost(now);
                      setBoostNow(now);
                    }}
                    disabled={boostRemaining > 0}
                    className="shrink-0 bg-violet-600 text-white px-3 py-2 rounded-lg text-xs font-black disabled:opacity-55"
                  >
                    {boostRemaining > 0 ? `${boostRemaining}s` : 'Start 15s'}
                  </button>
                </div>
              </div>
              {progression.trustedHelperPass && (
                <div className="mt-2 text-xs font-bold text-green-700 bg-green-100 px-3 py-2 rounded-lg">
                  Trusted Helper Pass: help at the Lost & Found shelf. The Storage Room remains adults-only.
                </div>
              )}
            </div>

            <div className="bg-violet-50/80 p-4 rounded-xl border border-violet-200">
              <h3 className="font-bold text-xl mb-3 flex items-center gap-2 text-[#5c3a21]">
                <BookOpen className="w-5 h-5 text-violet-600" /> Mae’s Story
              </h3>
              <div className="space-y-2">
                {RIVAL_CHAPTERS.map((chapter) => {
                  const complete = rivalStory.completedChapters.includes(chapter.id);
                  const current = rivalStory.chapter === chapter.chapter && rivalStory.beat !== 'complete';
                  const locked = !complete && !current;
                  return (
                    <div key={chapter.id} className={`p-3 rounded-lg border ${current ? 'bg-white border-violet-300' : 'bg-white/60 border-violet-100'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <strong className="text-sm text-violet-950">{chapter.chapter}. {chapter.title}</strong>
                        <span className="text-[10px] font-black uppercase tracking-wide text-violet-700">
                          {complete ? 'Complete' : current ? 'Current' : 'Locked'}
                        </span>
                      </div>
                      {!locked && <div className="mt-1 text-xs text-violet-950/70">{chapter.summary}</div>}
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
              {rivalStory.unlocks.includes('bridge-builder') && (
                <div className="mt-3 rounded-full bg-violet-600 px-3 py-2 text-center text-xs font-black text-white">
                  Nickname: Bridge Builder
                </div>
              )}
            </div>

            <div className="bg-white/50 p-4 rounded-xl border border-[#e5d8cc]">
              <h3 className="font-bold text-xl mb-3">Quests & Activities</h3>
              <div className="space-y-3">
                {QUEST_DEFINITIONS.map((definition) => {
                  const quest = quests[definition.id];
                  const objective = getCurrentObjective(quests, definition.id);
                  return (
                    <div key={definition.id} className={`p-3 rounded-xl border ${quest.status === 'active' ? 'bg-orange-50 border-orange-200' : 'bg-white/70 border-[#e5d8cc]'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-black text-[#5c3a21]">{definition.title}</div>
                        <span className="text-[10px] font-black uppercase tracking-wider bg-[#e5d8cc] px-2 py-1 rounded">
                          {quest.status}{definition.repeatable && quest.completionCount > 0 ? ` · ${quest.completionCount} done` : ''}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">{definition.summary}</div>
                      {objective && (
                        <div className="mt-2 text-sm text-orange-900">
                          <strong>{objective.label}</strong> — {objective.guidance}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50/70 p-3">
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-sm text-orange-950">Sticker Parade Caper</strong>
                  <span className="text-[10px] font-black uppercase tracking-wide text-orange-700">{caper.step.replace('-', ' ')}</span>
                </div>
                <div className="mt-1 text-xs text-orange-950/70">
                  A nonviolent playground plan with public supplies, fair roles, and teacher approval.
                </div>
                {caper.consequence !== 'none' && (
                  <div className="mt-2 text-xs font-bold text-green-700">Outcome: {caper.consequence.replace('-', ' ')}</div>
                )}
              </div>
            </div>

            <div className="bg-white/50 p-4 rounded-xl border border-[#e5d8cc]">
              <h3 className="font-bold text-xl mb-2 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-green-600" /> Business: Juice Club
              </h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-green-50 p-2 rounded border border-green-200">
                  <div className="text-xs text-green-700">Cash</div>
                  <div className="font-bold">${juiceClubCash}.00</div>
                </div>
                <div className="bg-orange-50 p-2 rounded border border-orange-200">
                  <div className="text-xs text-orange-700">Stock</div>
                  <div className="font-bold">{juiceStock} Juice, {crackerStock} Crackers</div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-bold mb-1">Supplies & Upgrades</div>
                <div className="flex justify-between items-center text-sm border-b border-gray-200 pb-1">
                  <span>Restock (5 Juice & Crackers) - $2</span>
                  <button
                    onClick={() => buyStock('juice', 2, 5)}
                    disabled={juiceClubCash < 2}
                    className="bg-green-500 text-white px-2 py-1 rounded disabled:opacity-50"
                  >Buy</button>
                </div>
                <div className="flex justify-between items-center text-sm border-b border-gray-200 pb-1">
                  <span>Premium Cups (Double Earnings) - $10</span>
                  <button
                    onClick={() => buyUpgrade('premium-cups', 10)}
                    disabled={juiceClubCash < 10 || juiceUpgrades.includes('premium-cups')}
                    className="bg-green-500 text-white px-2 py-1 rounded disabled:opacity-50"
                  >
                    {juiceUpgrades.includes('premium-cups') ? 'Bought' : 'Buy'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="absolute bottom-4 left-8 text-[#d4c3b3] font-serif italic">Page 1</div>
        </div>

        {/* Right Page */}
        <div className="flex-1 p-8 relative bg-texture-paper overflow-y-auto">
          <h2 className="font-serif text-4xl font-bold text-[#5c3a21] mb-6">Friends & Map</h2>

          <div className="bg-[#e9e0d3] p-4 rounded-xl aspect-video border-2 border-[#c2b2a1] mb-6 flex items-center justify-center relative overflow-hidden">
            <div className="text-[#8b5a2b] font-bold opacity-50 rotate-[-10deg] text-xl">Campus Map</div>
            <div className="absolute top-1/4 left-1/4 w-1/4 h-1/4 border-2 border-[#8b5a2b] bg-[#c2b2a1]/20 rounded flex items-center justify-center text-xs text-[#8b5a2b]">Art</div>
            <div className="absolute bottom-1/4 left-1/4 w-1/4 h-1/4 border-2 border-[#8b5a2b] bg-[#c2b2a1]/20 rounded flex items-center justify-center text-xs text-[#8b5a2b]">Storage</div>
            <div className="absolute top-1/4 right-1/4 w-1/3 h-1/2 border-2 border-[#8b5a2b] bg-[#c2b2a1]/20 rounded flex items-center justify-center text-xs text-[#8b5a2b]">Playground</div>
          </div>

          <div className="mb-7">
            <h3 className="font-bold text-xl mb-3 text-[#5c3a21] flex items-center gap-2">
              <MapPinned className="w-5 h-5 text-purple-600" /> Future Routes
            </h3>
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
                      <div className="text-xs text-muted-foreground">
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
          </div>

          <div>
            <h3 className="font-bold text-xl mb-3 text-[#5c3a21] flex items-center gap-2">
              <Heart className="w-5 h-5 text-red-500" /> Friends Met
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(friends).map(([name, data]) => (
                <div key={name} className="bg-white/60 p-3 rounded-lg border border-[#e5d8cc] flex items-center gap-3">
                  <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center font-bold text-orange-800 shrink-0">
                    {name[0]}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-sm truncate">{name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {data.mood} • {data.friendship}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 flex justify-center">
            <button onClick={() => useGameStore.getState().resetGame()} className="text-red-500 text-sm hover:underline">
              Reset Save Data
            </button>
          </div>

          <div className="absolute bottom-4 right-8 text-[#d4c3b3] font-serif italic">Page 2</div>
          <button
            onClick={toggleJournal}
            className="absolute top-6 right-6 bg-[#5c3a21] text-white px-4 py-2 rounded-full font-bold shadow-md hover:scale-105 transition-transform"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}