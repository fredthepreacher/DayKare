import { useMemo, useState } from 'react';
import { Lock, Shirt, Sparkles, Star } from 'lucide-react';
import { useGameStore } from './store';
import {
  DRIP_CATALOG,
  DRIP_CATEGORIES,
  DRIP_CATEGORY_LABELS,
  achievementProgress,
  achievementsEarned,
  describeDripItem,
  repTierName,
  type DripCategory,
  type DripStatus,
  type DripView,
} from './drip';
import { evaluateAllAreaAccess } from './areaAccess';

/**
 * The wardrobe and shop.
 *
 * One list, not two. A separate "shop" and "wardrobe" would hide the thing that
 * actually motivates: seeing the item you cannot afford yet, next to the ones
 * you own, with the exact reason it is out of reach. Every locked card states
 * its requirement in plain words and shows real progress toward it - no
 * "???", no teasing.
 *
 * Nothing here decides eligibility. It calls the same `describeDripItem` and
 * `canPurchase` the store action uses, so the button can never offer a purchase
 * the store would refuse.
 */

const STATUS_STYLE: Record<DripStatus, string> = {
  owned: 'bg-green-100 text-green-800 border border-green-300',
  buyable: 'bg-emerald-500 text-white',
  'needs-rep': 'bg-violet-200 text-violet-900',
  'needs-cash': 'bg-amber-200 text-amber-900',
  'needs-achievement': 'bg-stone-300 text-stone-700',
  'earned-pending': 'bg-sky-200 text-sky-900',
};

const STATUS_LABEL: Record<DripStatus, string> = {
  owned: 'Owned',
  buyable: 'Available',
  'needs-rep': 'Needs REP',
  'needs-cash': 'Needs cash',
  'needs-achievement': 'Earn it',
  'earned-pending': 'Earned',
};

const RARITY_STYLE: Record<string, string> = {
  Common: 'text-stone-600',
  Uncommon: 'text-sky-700',
  Rare: 'text-violet-700',
  Epic: 'text-amber-700',
  Legendary: 'text-rose-700',
};

function DripCard({ view, onBuy, onEquip, onUnequip }: {
  view: DripView;
  onBuy: (id: string) => void;
  onEquip: (id: string) => void;
  onUnequip: (category: DripCategory) => void;
}) {
  const { item, status, owned, equipped } = view;
  return (
    <article className={`daykare-drip-card ${equipped ? 'daykare-drip-card-equipped' : ''}`}>
      <div className="daykare-drip-swatch" style={{ background: item.color }} aria-hidden="true">
        {item.accent && <span className="daykare-drip-swatch-accent" style={{ background: item.accent }} />}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-black text-[#5c3a21] leading-tight truncate">{item.name}</div>
            <div className={`text-[10px] font-black uppercase tracking-wider ${RARITY_STYLE[item.rarity] ?? ''}`}>
              {item.rarity}{item.prestige ? ' · Prestige' : ''}
            </div>
          </div>
          <span className={`daykare-status-badge ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>
        </div>

        {!owned && view.requirement && (
          <p className="daykare-entry-requirement">
            <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{view.requirement}</span>
          </p>
        )}

        {!owned && status === 'buyable' && (
          <p className="text-[11px] text-[#7a6353] mt-1.5">
            {item.priceCash > 0 ? `$${item.priceCash}` : 'Free'}
            {item.repRequired > 0 ? ` · ${item.repRequired} REP met` : ''}
          </p>
        )}

        <div className="mt-2 flex gap-2">
          {status === 'buyable' && (
            <button type="button" onClick={() => onBuy(item.id)} className="daykare-journal-action bg-emerald-600">
              Buy ${item.priceCash}
            </button>
          )}
          {owned && !equipped && (
            <button type="button" onClick={() => onEquip(item.id)} className="daykare-journal-action bg-[#5c3a21]">
              Wear
            </button>
          )}
          {owned && equipped && (
            <button type="button" onClick={() => onUnequip(item.category)} className="daykare-journal-action bg-stone-500">
              Take off
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export function DripPanel() {
  const progression = useGameStore((state) => state.progression);
  const juiceClubCash = useGameStore((state) => state.juiceClubCash);
  const dripOwned = useGameStore((state) => state.dripOwned);
  const dripEquipped = useGameStore((state) => state.dripEquipped);
  const quests = useGameStore((state) => state.quests);
  const caper = useGameStore((state) => state.caper);
  const friends = useGameStore((state) => state.friends);
  const juiceClubCustomersServed = useGameStore((state) => state.juiceClubCustomersServed);
  const rivalStory = useGameStore((state) => state.rivalStory);
  const purchaseDripItem = useGameStore((state) => state.purchaseDripItem);
  const equipDripItem = useGameStore((state) => state.equipDripItem);
  const unequipDripCategory = useGameStore((state) => state.unequipDripCategory);

  const [category, setCategory] = useState<DripCategory | 'all'>('all');

  const evidence = useMemo(() => ({
    binkyComplete: quests['where-binky']?.status === 'complete',
    caperComplete: caper.step === 'complete',
    rainbowRounds: progression.activityRuns['rainbow-tidy-up'] ?? 0,
    gardenRuns: progression.activityRuns['garden-planting'] ?? 0,
    juiceCustomersServed: juiceClubCustomersServed,
    artActivities: progression.activityRuns['garden-planting'] ?? 0,
    bestFriendship: Object.values(friends).reduce((best, friend) => Math.max(best, friend?.friendship ?? 0), 0),
  }), [quests, caper.step, progression.activityRuns, juiceClubCustomersServed, friends]);

  const earned = useMemo(() => achievementsEarned(evidence), [evidence]);
  const ownedSet = useMemo(() => new Set(dripOwned), [dripOwned]);

  const views = useMemo(
    () => DRIP_CATALOG.map((item) => describeDripItem(
      item,
      { reputation: progression.reputation, cash: juiceClubCash },
      earned,
      ownedSet,
      dripEquipped,
    )),
    [progression.reputation, juiceClubCash, earned, ownedSet, dripEquipped],
  );

  const shown = category === 'all' ? views : views.filter((view) => view.item.category === category);
  const ownedCount = views.filter((view) => view.owned).length;

  const areas = useMemo(() => evaluateAllAreaAccess({
    progression,
    cash: juiceClubCash,
    quests,
    storyChapter: rivalStory.chapter,
    gardenRuns: progression.activityRuns['garden-planting'] ?? 0,
  }), [progression, juiceClubCash, quests, rivalStory.chapter]);

  return (
    <div className="space-y-4">
      <h3 className="daykare-section-head"><Shirt className="w-5 h-5 text-violet-600" /> Drip</h3>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white/70 p-2 rounded-lg text-center border border-[#e5d8cc]">
          <div className="text-lg font-black text-violet-700">{progression.reputation}</div>
          <div className="text-[10px] uppercase font-bold text-violet-900/60">REP · {repTierName(progression.reputation)}</div>
        </div>
        <div className="bg-white/70 p-2 rounded-lg text-center border border-[#e5d8cc]">
          <div className="text-lg font-black text-green-700">${juiceClubCash}</div>
          <div className="text-[10px] uppercase font-bold text-green-900/60">Cash</div>
        </div>
        <div className="bg-white/70 p-2 rounded-lg text-center border border-[#e5d8cc]">
          <div className="text-lg font-black text-amber-700">{ownedCount}/{DRIP_CATALOG.length}</div>
          <div className="text-[10px] uppercase font-bold text-amber-900/60">Collected</div>
        </div>
      </div>

      <div className="daykare-journal-tabs" style={{ borderBottom: 'none', padding: '0' }}>
        <button
          type="button"
          onClick={() => setCategory('all')}
          className={`daykare-journal-tab ${category === 'all' ? 'daykare-journal-tab-active' : ''}`}
        >
          All
        </button>
        {DRIP_CATEGORIES.map((entry) => (
          <button
            key={entry}
            type="button"
            onClick={() => setCategory(entry)}
            className={`daykare-journal-tab ${category === entry ? 'daykare-journal-tab-active' : ''}`}
          >
            {DRIP_CATEGORY_LABELS[entry]}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {shown.map((view) => (
          <DripCard
            key={view.item.id}
            view={view}
            onBuy={purchaseDripItem}
            onEquip={equipDripItem}
            onUnequip={unequipDripCategory}
          />
        ))}
      </div>

      <div>
        <h3 className="daykare-section-head"><Star className="w-5 h-5 text-amber-600" /> Prestige goals</h3>
        <p className="daykare-empty-note mb-2">
          These cannot be bought. They are proof you did something.
        </p>
        <div className="space-y-2">
          {DRIP_CATALOG.filter((item) => item.prestige).map((item) => {
            const progress = item.achievement ? achievementProgress(item.achievement, evidence) : null;
            const done = Boolean(item.achievement && earned.has(item.achievement));
            return (
              <div key={item.id} className="daykare-entry-card">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-sm text-[#5c3a21]">{item.name}</span>
                  <span className={`daykare-status-badge ${done ? STATUS_STYLE.owned : STATUS_STYLE['needs-achievement']}`}>
                    {done ? 'Earned' : 'Locked'}
                  </span>
                </div>
                <div className="text-xs text-[#7a6353] mt-1">{item.unlockDetail}</div>
                {progress && !done && (
                  <div className="mt-2">
                    <div className="text-[11px] font-bold text-[#8b5a2b]">{progress.current}/{progress.required}</div>
                    <div className="daykare-progress-track">
                      <div
                        className="daykare-progress-fill"
                        style={{ width: `${Math.min(100, (progress.current / progress.required) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="daykare-section-head"><Sparkles className="w-5 h-5 text-sky-600" /> Places to earn your way into</h3>
        <p className="daykare-empty-note mb-2">
          Optional areas being built next. None of them stand in front of the Story.
        </p>
        <div className="space-y-2">
          {areas.map((area) => (
            <div key={area.gate.id} className="daykare-entry-card daykare-entry-card-dim">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-sm text-[#5c3a21]">{area.gate.name}</span>
                <span className={`daykare-status-badge ${area.unlocked ? STATUS_STYLE.owned : STATUS_STYLE['needs-rep']}`}>
                  {area.unlocked ? 'Qualified' : 'Locked'}
                </span>
              </div>
              <div className="text-xs text-[#7a6353] mt-1">{area.gate.purpose}</div>
              {!area.unlocked && (
                <div className="text-[11px] text-[#8b5a2b] mt-1.5">Needs {area.outstanding.join(' · ')}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
