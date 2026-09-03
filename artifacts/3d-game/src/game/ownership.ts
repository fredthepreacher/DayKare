import { DRIP_CATALOG } from "./drip";
import {
  storybookItemPrice,
  type StorybookItemId,
} from "./storybookLaneConfig";

/**
 * What the player owns, read out of the state that already records it.
 *
 * There is deliberately no inventory of its own here. Homes live in the
 * final-master store, lane purchases in the lane store, cosmetics in the
 * game store's drip lists — this only reads them, so it can never disagree
 * with what the player actually has.
 */

export interface OwnershipInput {
  ownedStarterHome: boolean;
  homeVoucher: boolean;
  cribTier: number;
  laneItems: readonly string[];
  dripOwned: readonly string[];
  dripEquipped: Readonly<Record<string, string | null | undefined>>;
  fishingRods: readonly string[];
  tokens: number;
  gems: number;
  rascalBucks: number;
}

export interface OwnershipEntry {
  id: string;
  label: string;
  detail: string;
}

export interface OwnershipCategory {
  id: string;
  title: string;
  entries: OwnershipEntry[];
  /** Shown when the player owns nothing in this category yet. */
  emptyLabel: string;
}

/** A player-facing name for a home tier, instead of "Crib tier 0". */
export function homeTierName(cribTier: number) {
  const tier = Math.max(
    0,
    Math.floor(Number.isFinite(cribTier) ? cribTier : 0),
  );
  if (tier <= 0) return "Starter Home";
  if (tier === 1) return "Comfy Home";
  if (tier === 2) return "Deluxe Home";
  return "Showpiece Home";
}

const LANE_ITEM_LABELS: Record<StorybookItemId, string> = {
  tricycle: "Tricycle",
  dog: "Dog",
  crib: "Personal Crib",
  "mini-ride-on": "Mini Ride-On",
  "ping-pong-table": "Ping-Pong Table",
};

export function ownershipSummary(input: OwnershipInput): OwnershipCategory[] {
  const owns = (item: StorybookItemId) => input.laneItems.includes(item);

  const property: OwnershipEntry[] = [];
  if (input.ownedStarterHome) {
    property.push({
      id: "wavy-manor",
      label: "Wavy Manor",
      detail: `${homeTierName(input.cribTier)} · Stony Brook`,
    });
  } else if (input.homeVoucher) {
    property.push({
      id: "home-voucher",
      label: "Free-home voucher",
      detail: "Claim it from a Stony Brook realtor",
    });
  }

  const pets: OwnershipEntry[] = owns("dog")
    ? [
        {
          id: "dog",
          label: "Dog",
          detail: "Follows you in Stony Brook · whistle to call",
        },
      ]
    : [];

  // Rides live in the garage now, so the summary says where to find them.
  const parked = garageBays(input.laneItems);
  const rides: OwnershipEntry[] = (
    ["tricycle", "mini-ride-on"] as StorybookItemId[]
  )
    .filter(owns)
    .map((item) => ({
      id: item,
      label: LANE_ITEM_LABELS[item],
      detail: parked.some((bay) => bay?.id === item)
        ? "In the garage"
        : `Owned · ${storybookItemPrice(item).toLocaleString()} RB`,
    }));

  const furnishings: OwnershipEntry[] = [
    ...(owns("crib")
      ? [
          {
            id: "crib",
            label: "Personal Crib",
            detail: "Installed at your home",
          },
        ]
      : []),
    ...(owns("ping-pong-table")
      ? [
          {
            id: "ping-pong-table",
            label: "Ping-Pong Table",
            detail: "Playable in the basement rec room",
          },
        ]
      : []),
  ];

  const drip: OwnershipEntry[] = input.dripOwned
    .map((id) => DRIP_CATALOG.find((item) => item.id === id))
    .filter((item): item is (typeof DRIP_CATALOG)[number] => Boolean(item))
    .map((item) => ({
      id: item.id,
      label: item.name,
      detail:
        input.dripEquipped[item.category] === item.id
          ? `${item.category} · Equipped`
          : `${item.category} · ${item.rarity}`,
    }));

  const gear: OwnershipEntry[] = input.fishingRods.map((color) => ({
    id: `rod-${color}`,
    label: `${color.charAt(0).toUpperCase()}${color.slice(1)} fishing rod`,
    detail: "Garden District",
  }));

  return [
    {
      id: "property",
      title: "Property",
      entries: property,
      emptyLabel: "No home yet — talk to a Stony Brook realtor.",
    },
    { id: "pets", title: "Pets", entries: pets, emptyLabel: "No pet yet." },
    {
      id: "rides",
      title: "Rides (garage)",
      entries: rides,
      emptyLabel: "The garage is empty — no rides yet.",
    },
    {
      id: "furnishings",
      title: "Furnishings",
      entries: furnishings,
      emptyLabel: "Nothing installed yet.",
    },
    {
      id: "drip",
      title: "Drip",
      entries: drip,
      emptyLabel: "No cosmetics owned yet.",
    },
    { id: "gear", title: "Gear", entries: gear, emptyLabel: "No gear yet." },
  ];
}

/**
 * What sits in each garage bay, read from the lane store's owned items.
 *
 * There is no garage inventory of its own: a ride is in the garage exactly
 * when the player owns it, so the two cannot disagree. Bays the player has
 * not filled come back null and render as marked empty spaces, which is what
 * makes the garage read as something to grow into.
 */
export function garageBays(ownedItems: readonly string[]) {
  const RIDES: { id: StorybookItemId; label: string }[] = [
    { id: "tricycle", label: "Tricycle" },
    { id: "mini-ride-on", label: "Mini Ride-On" },
  ];
  const parked = RIDES.filter((ride) => ownedItems.includes(ride.id));
  return [0, 1, 2, 3].map((index) => parked[index] ?? null);
}

/** A one-line wallet summary to head the ownership screen. */
export function ownershipWalletLine(input: OwnershipInput) {
  return `${input.rascalBucks.toLocaleString()} RB · ${input.gems} Care Gem${input.gems === 1 ? "" : "s"} · ${input.tokens} Star Token${input.tokens === 1 ? "" : "s"}`;
}
