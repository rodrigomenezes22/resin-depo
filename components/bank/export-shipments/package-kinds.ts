// =============================================================================
// Package kinds — how the cargo is packed inside a container
// =============================================================================
// `shipment_containers.package_kind` is free text in the database, and was a
// free-text input in the container sheet until the desk asked for a dropdown.
// This is the offered vocabulary; `packageKindLabel` still renders whatever is
// already stored, so seeded rows (`supersacks`) and anything hand-typed before
// the dropdown existed keep showing on the Packing List instead of going blank.
//
// The slugs deliberately match `lib/units.ts` where the two overlap
// (`supersacks`, `bags_25kg`) — the same packing, whether it is being sold as a
// unit of quantity or declared as a package count.
// =============================================================================

import { LBS_PER_UNIT } from "@/lib/units";

/** `[slug, label]` — the options the container sheet offers, in desk order. */
export const PACKAGE_KINDS: [string, string][] = [
  ["supersacks", "Supersacks"],
  ["bags_25kg", "25 kg Bags"],
  ["boxes", "Boxes"],
];

/**
 * Kinds the dropdown no longer offers but the column may still hold.
 *
 * The list above was trimmed to the three the desk actually stuffs. Retiring an
 * option must not blank a Packing List: a container saved as `gaylords` still
 * has to print "12 Gaylords", so the labels stay resolvable even though the
 * option is gone. Nothing writes these any more.
 */
const RETIRED_LABELS: [string, string][] = [
  ["bags_50lb", "50 lb Bags"],
  ["bags", "Bags"],
  ["gaylords", "Gaylords"],
  ["bales", "Bales"],
  ["drums", "Drums"],
  ["pallets", "Pallets"],
  ["bulk", "Bulk"],
];

const LABELS = new Map([...PACKAGE_KINDS, ...RETIRED_LABELS]);

/**
 * Pounds of resin in one package of each kind — what the container sheet uses
 * to turn a net weight into a package count.
 *
 * These are STUFFING weights, and `supersacks` deliberately disagrees with
 * `LBS_PER_UNIT.supersacks` (2,000): that constant is the TRADING unit — what a
 * supersack means as a quantity on the floor — and is pinned to the DB's
 * `unit_lbs_factors()`. A supersack loaded into an export container is filled
 * to 1,500 lbs. Two different facts that happen to share a word; changing
 * `LBS_PER_UNIT` to match would reprice every order quoted in supersacks.
 *
 * `bags_25kg` reuses `LBS_PER_UNIT` on purpose — a 25 kg bag is 25 kg wherever
 * it appears, so a second constant here could only ever drift from it.
 */
export const PACKAGE_STUFFING_LBS: Record<string, number> = {
  supersacks: 1500,
  boxes: 1500,
  bags_25kg: LBS_PER_UNIT.bags_25kg,
};

/**
 * Whether the desk may override this kind's stuffing weight for one container.
 *
 * Supersacks and boxes are filled to whatever the packer used — 1,500 lbs is
 * the house default, not a law, and a supplier who fills to 1,200 would
 * otherwise force the desk to back-solve the package count by hand. A 25 kg bag
 * is 25 kg by definition; there is nothing to override, and offering the field
 * would only invite a container declaring bags that aren't 25 kg.
 */
export const isStuffingWeightEditable = (kind: string | null | undefined): boolean =>
  kind === "supersacks" || kind === "boxes";

/**
 * How many packages of `kind` a net weight comes to — the container sheet's
 * auto-fill when the desk picks a kind.
 *
 * `perPackageLbs` overrides the default for one container (see
 * `isStuffingWeightEditable`); it wins over the table whenever it is a real
 * positive weight, so an overridden kind still answers even if the table has
 * no entry for it.
 *
 * `null` when it cannot be answered (no weight, or a kind with no stuffing
 * weight on file and no override) so the caller leaves the field alone rather
 * than writing a zero. Rounds to the nearest whole package and never returns 0
 * for a real weight: `package_count` is CHECKed `> 0`, and "some resin, zero
 * packages" is not a manifest line anyone can act on.
 */
export function packagesForNetWeight(
  netLbs: number | null | undefined,
  kind: string | null | undefined,
  perPackageLbs?: number | null,
): number | null {
  const override = Number(perPackageLbs ?? 0);
  const per = override > 0 ? override : kind ? PACKAGE_STUFFING_LBS[kind] : undefined;
  const net = Number(netLbs ?? 0);
  if (!per || !Number.isFinite(net) || net <= 0) return null;
  return Math.max(1, Math.round(net / per));
}

/** Label for a stored kind, falling back to the raw value for legacy free text. */
export const packageKindLabel = (kind: string | null | undefined): string =>
  kind == null || kind === "" ? "" : (LABELS.get(kind) ?? kind);

/**
 * A manifest / Packing List packages cell — "20 Supersacks". A kind with no
 * count is not a line (you cannot declare "Supersacks" of nothing), so the
 * count governs whether there is anything to show at all.
 */
export function formatPackages(
  count: number | string | null | undefined,
  kind: string | null | undefined,
): string | null {
  const n = Number(count ?? 0);
  if (!n) return null;
  const label = packageKindLabel(kind);
  return label ? `${n} ${label}` : String(n);
}
