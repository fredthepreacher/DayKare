import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Clock3,
  Coins,
  Crown,
  Gem,
  LockKeyhole,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  X,
} from "lucide-react";
import { achievementsEarned, getDripItem } from "./drip";
import {
  formatProductPrice,
  productsForSection,
  type MonetizationProduct,
  type ShopSection,
} from "./monetization";
import { useMonetizationStore } from "./monetizationStore";
import { paymentProvider, sandboxCheckoutAllowed } from "./paymentProvider";
import { useGameStore } from "./store";
import { useStorybookLaneStore } from "./storybookLaneStore";
import { useFinalMasterStore } from "./finalMasterStore";
import { RASCAL_BUCKS_PER_GEM } from "./finalMaster";

const SECTIONS: { id: ShopSection; label: string }[] = [
  { id: "featured", label: "Featured" },
  { id: "bundles", label: "Bundles" },
  { id: "clothing", label: "Clothing" },
  { id: "accessories", label: "Accessories" },
  { id: "furniture", label: "Furniture" },
  { id: "care-gems", label: "Care Gems" },
  { id: "xp-boosts", label: "REP Boosts" },
  { id: "kare-pass", label: "Kare Pass" },
  { id: "seasonal", label: "Seasonal" },
  { id: "daily-deals", label: "Daily Deals" },
];

function remainingTime(expiresAt: number) {
  const seconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function ProductCard({
  product,
  onSelect,
}: {
  product: MonetizationProduct;
  onSelect: (product: MonetizationProduct) => void;
}) {
  const entitlements = useMonetizationStore((state) => state.entitlements);
  const careGems = useMonetizationStore((state) => state.careGems);
  const rascalBucks = useStorybookLaneStore((state) => state.ribbonBucks);
  const dripOwned = useGameStore((state) => state.dripOwned);
  const dripEquipped = useGameStore((state) => state.dripEquipped);
  const progression = useGameStore((state) => state.progression);
  const quests = useGameStore((state) => state.quests);
  const caper = useGameStore((state) => state.caper);
  const friends = useGameStore((state) => state.friends);
  const juiceClubCustomersServed = useGameStore(
    (state) => state.juiceClubCustomersServed,
  );
  const heistsCompleted = useFinalMasterStore((state) => state.heistsCompleted);
  const cosmeticId = product.grant.cosmetics?.[0];
  const cosmetic = cosmeticId ? getDripItem(cosmeticId) : null;
  const owned =
    (!product.consumable && entitlements.ownedProducts.includes(product.id)) ||
    Boolean(cosmeticId && dripOwned.includes(cosmeticId));
  const equipped = Boolean(
    cosmetic && dripEquipped[cosmetic.category] === cosmetic.id,
  );
  const balance = product.currency === "rascal_bucks" ? rascalBucks : careGems;
  const insufficient = product.currency !== "usd" && balance < product.price;
  const earnedAchievements = achievementsEarned({
    binkyComplete: quests["where-binky"]?.status === "complete",
    caperComplete: caper.step === "complete",
    rainbowRounds: progression.activityRuns["rainbow-tidy-up"] ?? 0,
    gardenRuns: progression.activityRuns["garden-planting"] ?? 0,
    juiceCustomersServed: juiceClubCustomersServed,
    artActivities: progression.activityRuns["garden-planting"] ?? 0,
    bestFriendship: Object.values(friends).reduce(
      (best, friend) => Math.max(best, friend?.friendship ?? 0),
      0,
    ),
    heistsCompleted,
  });
  const preservesGameplayGate = !product.progressionOverride;
  const needsReputation = cosmetic
    ? preservesGameplayGate && progression.reputation < cosmetic.repRequired
    : false;
  const needsAchievement = Boolean(
    preservesGameplayGate &&
    cosmetic?.achievement &&
    !earnedAchievements.has(cosmetic.achievement),
  );
  const progressionLocked = needsReputation || needsAchievement;
  const actionLabel =
    owned && !product.consumable
      ? "Owned"
      : needsAchievement
        ? (cosmetic?.unlockDetail ?? "Achievement required")
        : needsReputation
          ? `Needs ${cosmetic?.repRequired} REP`
          : insufficient
            ? "Not enough"
            : formatProductPrice(product);

  return (
    <article
      className={`daykare-shop-card ${owned ? "is-owned" : ""}`}
      data-testid={`shop-product-${product.id}`}
    >
      <div
        className="daykare-shop-art"
        style={{
          background: `linear-gradient(145deg, ${product.color}, #fff8e8)`,
        }}
      >
        {product.kind === "subscription" ? (
          <Crown aria-hidden="true" />
        ) : product.kind === "currency" ? (
          <Gem aria-hidden="true" />
        ) : (
          <Sparkles aria-hidden="true" />
        )}
        <span>{product.rarity}</span>
      </div>
      <div className="daykare-shop-card-copy">
        <div className="daykare-shop-card-title">
          <strong>{product.name}</strong>
          {owned && (
            <span>
              <Check aria-hidden="true" /> Owned
            </span>
          )}
          {equipped && <span>Equipped</span>}
        </div>
        <p>{product.description}</p>
        <div className="daykare-shop-tags">
          {product.grant.subscription && <span>Kare member</span>}
          {product.grant.boost && (
            <span>{product.grant.boost.multiplier}× REP</span>
          )}
          {product.rarity === "Seasonal" && <span>Limited</span>}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onSelect(product)}
        disabled={
          (owned && !product.consumable) || insufficient || progressionLocked
        }
        className="daykare-shop-buy"
        data-testid={`button-product-${product.id}`}
      >
        {actionLabel}
      </button>
    </article>
  );
}

/**
 * Rascal Bucks into Care Gems, at a deliberately grindy 10,000 : 1.
 *
 * The button disables itself for the length of the write as well as when
 * the balance is short, so a double tap cannot mint two gems from one
 * payment; the store's own check is the second guard.
 */
function GemExchange() {
  const rascalBucks = useStorybookLaneStore((state) => state.ribbonBucks);
  const convert = useFinalMasterStore((state) => state.convertRbToGem);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const affordable = rascalBucks >= RASCAL_BUCKS_PER_GEM;

  const run = () => {
    if (busy) return;
    setBusy(true);
    const converted = convert();
    setConfirming(false);
    setMessage(
      converted
        ? `Traded ${RASCAL_BUCKS_PER_GEM.toLocaleString()} RB for 1 Care Gem.`
        : `You need ${RASCAL_BUCKS_PER_GEM.toLocaleString()} RB. Nothing was spent.`,
    );
    setBusy(false);
  };

  return (
    <span className="daykare-gem-exchange">
      {confirming ? (
        <>
          <small>Trade {RASCAL_BUCKS_PER_GEM.toLocaleString()} RB for 1 Care Gem?</small>
          <button type="button" disabled={busy || !affordable} onClick={run}>
            Confirm
          </button>
          <button type="button" disabled={busy} onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            disabled={!affordable}
            onClick={() => { setMessage(null); setConfirming(true); }}
          >
            {affordable
              ? `Trade ${RASCAL_BUCKS_PER_GEM.toLocaleString()} RB → 1 Gem`
              : `${(RASCAL_BUCKS_PER_GEM - rascalBucks).toLocaleString()} RB to your next Gem`}
          </button>
          {message && <small role="status">{message}</small>}
        </>
      )}
    </span>
  );
}

export function MonetizationShop() {
  const [section, setSection] = useState<ShopSection>("featured");
  const [selected, setSelected] = useState<MonetizationProduct | null>(null);
  const [clock, setClock] = useState(0);
  const careGems = useMonetizationStore((state) => state.careGems);
  const rascalBucks = useStorybookLaneStore((state) => state.ribbonBucks);
  const entitlements = useMonetizationStore((state) => state.entitlements);
  const purchaseState = useMonetizationStore((state) => state.purchaseState);
  const purchaseMessage = useMonetizationStore(
    (state) => state.purchaseMessage,
  );
  const setPurchaseState = useMonetizationStore(
    (state) => state.setPurchaseState,
  );
  const spendCurrencyProduct = useMonetizationStore(
    (state) => state.spendCurrencyProduct,
  );
  const fulfillVerifiedTransaction = useMonetizationStore(
    (state) => state.fulfillVerifiedTransaction,
  );
  const claimDailyReward = useMonetizationStore(
    (state) => state.claimDailyReward,
  );
  const track = useMonetizationStore((state) => state.track);
  const clearExpired = useMonetizationStore((state) => state.clearExpired);
  const grantCosmetics = useGameStore(
    (state) => state.grantMonetizationCosmetics,
  );
  const equipDripItem = useGameStore((state) => state.equipDripItem);
  const products = useMemo(() => productsForSection(section), [section]);
  const sandbox = sandboxCheckoutAllowed();

  useEffect(() => {
    track({ name: "shop_opened" });
    clearExpired();
  }, [track, clearExpired]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setClock((value) => value + 1);
      clearExpired();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [clearExpired]);
  void clock;

  const viewProduct = (product: MonetizationProduct) => {
    setPurchaseState("idle");
    setSelected(product);
    track({
      name:
        product.kind === "subscription" ? "care_pass_viewed" : "product_viewed",
      productId: product.id,
    });
  };

  const confirm = async () => {
    if (!selected || purchaseState === "loading") return;
    if (selected.currency !== "usd") {
      const current = useGameStore.getState();
      const earned = achievementsEarned({
        binkyComplete: current.quests["where-binky"]?.status === "complete",
        caperComplete: current.caper.step === "complete",
        rainbowRounds: current.progression.activityRuns["rainbow-tidy-up"] ?? 0,
        gardenRuns: current.progression.activityRuns["garden-planting"] ?? 0,
        juiceCustomersServed: current.juiceClubCustomersServed,
        artActivities: current.progression.activityRuns["garden-planting"] ?? 0,
        bestFriendship: Object.values(current.friends).reduce(
          (best, friend) => Math.max(best, friend?.friendship ?? 0),
          0,
        ),
        heistsCompleted: useFinalMasterStore.getState().heistsCompleted,
      });
      const success = spendCurrencyProduct(
        selected.id,
        {
          reputation: current.progression.reputation,
          achievements: Array.from(earned),
        },
        grantCosmetics,
      );
      setPurchaseState(
        success ? "success" : "failed",
        success
          ? `${selected.name} added.`
          : "That item is owned, active, or outside your balance.",
      );
      return;
    }
    setPurchaseState("loading", "Opening secure checkout…");
    track({ name: "checkout_started", productId: selected.id });
    try {
      const transaction = await paymentProvider.checkout(selected.id);
      fulfillVerifiedTransaction(transaction, grantCosmetics);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Checkout could not be completed.";
      setPurchaseState("failed", message);
      track({
        name: "purchase_failed",
        productId: selected.id,
        reason: "provider_error",
      });
    }
  };

  const claimedToday =
    entitlements.claimedDailyRewardDay ===
    new Date().toISOString().slice(0, 10);
  const activeBoost = entitlements.activeBoost;
  const selectedCosmetic = selected?.grant.cosmetics?.[0];
  const selectedDrip = selectedCosmetic ? getDripItem(selectedCosmetic) : null;
  const selectedOwned = Boolean(
    selectedCosmetic &&
    useGameStore.getState().dripOwned.includes(selectedCosmetic),
  );

  return (
    <div className="daykare-shop" data-testid="panel-kare-shop">
      <section className="daykare-shop-hero">
        <div>
          <p className="daykare-eyebrow">
            Optional extras · core play stays free
          </p>
          <h2>Kare Shop</h2>
          <p>
            Play to earn Rascal Bucks. Care Gems are the rare tier, and 10,000
            Rascal Bucks trade for one. No purchase is required to enjoy DayKare.
          </p>
        </div>
        <div className="daykare-shop-wallet" aria-label="Wallet balances">
          <span>
            <Coins aria-hidden="true" />
            <strong>{rascalBucks.toLocaleString()}</strong>
            <small>Rascal Bucks</small>
          </span>
          <span>
            <Gem aria-hidden="true" />
            <strong>{careGems}</strong>
            <small>Care Gems</small>
          </span>
          <GemExchange />
        </div>
      </section>

      {sandbox && (
        <div className="daykare-sandbox-banner">
          <ShieldCheck aria-hidden="true" />
          <span>
            <strong>Preview Sandbox</strong>No money is charged. Test
            entitlements are local to this browser.
          </span>
        </div>
      )}

      <div className="daykare-shop-daily">
        <div>
          <strong>Kindness check-in</strong>
          <span>
            {entitlements.subscriptionTier === "none"
              ? "250 Rascal Bucks daily for everyone"
              : "Your pass increases today’s Rascal Bucks gift"}
          </span>
        </div>
        <button
          type="button"
          disabled={claimedToday}
          onClick={() => claimDailyReward()}
          data-testid="button-claim-daily-reward"
        >
          {claimedToday ? "Claimed today" : "Claim daily gift"}
        </button>
      </div>

      {activeBoost && (
        <div className="daykare-boost-status" role="status">
          <Clock3 aria-hidden="true" />
          <span>
            <strong>{activeBoost.multiplier}× REP boost active</strong>
            {remainingTime(activeBoost.expiresAt)} remaining · persists across
            refresh
          </span>
        </div>
      )}

      <nav className="daykare-shop-tabs" aria-label="Shop sections">
        {SECTIONS.map((entry) => (
          <button
            type="button"
            key={entry.id}
            className={section === entry.id ? "is-active" : ""}
            onClick={() => setSection(entry.id)}
            data-testid={`button-shop-tab-${entry.id}`}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      <div className="daykare-shop-grid">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            onSelect={viewProduct}
          />
        ))}
      </div>
      {products.length === 0 && (
        <div className="daykare-shop-empty">
          <ShoppingBag aria-hidden="true" />
          <strong>Fresh surprises are being prepared.</strong>
          <span>
            Rotation changes come from the catalog configuration, not this
            screen.
          </span>
        </div>
      )}

      {selected && (
        <div
          className="daykare-purchase-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelected(null);
          }}
        >
          <section
            className="daykare-purchase-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="purchase-title"
          >
            <button
              type="button"
              className="daykare-purchase-close"
              onClick={() => setSelected(null)}
              aria-label="Close purchase details"
              data-testid="button-close-purchase"
            >
              <X />
            </button>
            <div
              className="daykare-purchase-preview"
              style={{ backgroundColor: selected.color }}
            >
              <Sparkles aria-hidden="true" />
            </div>
            <p className="daykare-eyebrow">
              {selected.rarity} · {selected.kind}
            </p>
            <h3 id="purchase-title">{selected.name}</h3>
            <p>{selected.description}</p>
            <div className="daykare-purchase-contents">
              {selected.grant.rascalBucks ? (
                <span>+{selected.grant.rascalBucks.toLocaleString()} Rascal Bucks</span>
              ) : null}
              {selected.grant.careGems ? (
                <span>+{selected.grant.careGems} Care Gems</span>
              ) : null}
              {selected.grant.cosmetics?.map((id) => (
                <span key={id}>{getDripItem(id)?.name ?? id}</span>
              ))}
              {selected.grant.furniture?.map((id) => (
                <span key={id}>{id.replaceAll("_", " ")}</span>
              ))}
              {selected.grant.boost ? (
                <span>
                  {selected.grant.boost.multiplier}× REP ·{" "}
                  {Math.round(selected.grant.boost.durationMs / 60_000)} min
                </span>
              ) : null}
            </div>
            {selected.currency === "usd" && (
              <p className="daykare-purchase-security">
                <LockKeyhole aria-hidden="true" />
                {sandbox
                  ? "Sandbox confirmation only — no charge or payment details."
                  : "Checkout requires a configured server payment provider."}
              </p>
            )}
            {purchaseMessage && (
              <div
                className={`daykare-purchase-message is-${purchaseState}`}
                role="status"
              >
                {purchaseMessage}
              </div>
            )}
            <div className="daykare-purchase-actions">
              {selectedOwned && selectedDrip ? (
                <button
                  type="button"
                  className="is-primary"
                  onClick={() => equipDripItem(selectedDrip.id)}
                >
                  Wear now
                </button>
              ) : (
                <button
                  type="button"
                  className="is-primary"
                  disabled={purchaseState === "loading"}
                  onClick={confirm}
                  data-testid="button-confirm-purchase"
                >
                  {purchaseState === "loading"
                    ? "Checking…"
                    : sandbox && selected.currency === "usd"
                      ? `Test ${formatProductPrice(selected)} (no charge)`
                      : `Confirm ${formatProductPrice(selected)}`}
                </button>
              )}
              <button type="button" onClick={() => setSelected(null)}>
                Not now
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
