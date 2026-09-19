// =============================================================================
// Locations — domain vocabulary and row shapes
// =============================================================================
// The vocabulary rule (see README.md): a LOCATION is the entity, of any kind;
// an ADDRESS is the postal facts a location carries; a ROLE is the commercial
// relationship between an organization and a location (organization_locations).
// Customer-facing copy may say "address" — it always denotes a location's
// postal facts, never a second entity.
//
// No "server-only" import: the unit suite exercises this module directly, and
// nothing in lib/ imports @trpc/server (trpc/AGENTS.md).

import type { Database } from "@/lib/supabase/database.types";

export type LocationKind = Database["public"]["Enums"]["location_kind"];

export const LOCATION_KINDS = ["warehouse", "port", "customer_dock", "office"] as const;

export const KIND_LABELS: Record<LocationKind, string> = {
  warehouse: "Warehouse",
  port: "Port",
  customer_dock: "Customer dock",
  office: "Office",
};

/**
 * Kinds that hold or move material — what the operational pickers (inventory
 * receive/transfer, bank warehouse filter, conversion drawer) ask for. Offices
 * are postal addresses and never appear in them.
 */
export const OPERATIONAL_KINDS = [
  "warehouse",
  "port",
  "customer_dock",
] as const satisfies readonly LocationKind[];

/**
 * The deal Delivery/Shipping Point rule (legacy "company places + warehouses,
 * with OR enter manually"): never ports — ocean routing belongs to the booking
 * (shipment_groups.pol/pod) — and never offices — a billing address is not a
 * freight point.
 */
export const isDealPointKind = (kind: string): boolean => kind !== "port" && kind !== "office";

/**
 * Commercial roles a location can play for an organization — DECLARED IN
 * CANONICAL DISPLAY ORDER: headquarters first, then billing, then the freight
 * roles. Every mixed-role view (the Addresses card, saved-address dropdowns)
 * sorts on this order via `roleRank`/`compareBookEntries`.
 */
export const LOCATION_ROLES = [
  "headquarters",
  "billing",
  "shipping_point",
  "delivery_point",
  // Where cheques are sent. TPE's own remittance address is NOT its
  // headquarters — the invoice's "CHECK REMITTANCE INSTRUCTIONS" block names a
  // lockbox, and before this role existed that address lived hardcoded in two
  // PDF templates while `organizations` said something different. One role, one
  // lookup, and `resolveOrgAddress` falls back to headquarters when an org has
  // no remittance link, so nothing breaks for orgs that never set one.
  "remittance",
] as const;
export type LocationRole = (typeof LOCATION_ROLES)[number];

/** Position in the canonical role order; unknown roles sort last. */
export const roleRank = (role: string): number => {
  const i = (LOCATION_ROLES as readonly string[]).indexOf(role);
  return i === -1 ? LOCATION_ROLES.length : i;
};

/**
 * Canonical kind order for mixed-kind views (the Locations directory, the
 * link-location picker): material-holding sites the desk touches daily first,
 * postal offices last.
 */
export const KIND_ORDER = [
  "warehouse",
  "customer_dock",
  "port",
  "office",
] as const satisfies readonly LocationKind[];

/** Position in the canonical kind order; unknown kinds sort last. */
export const kindRank = (kind: string): number => {
  const i = (KIND_ORDER as readonly string[]).indexOf(kind);
  return i === -1 ? KIND_ORDER.length : i;
};

export const ROLE_LABELS: Record<LocationRole, string> = {
  headquarters: "Headquarters",
  billing: "Billing",
  shipping_point: "Shipping point",
  delivery_point: "Delivery point",
  remittance: "Remit-to",
};

/** A `locations` row as the app consumes it (camelCase; operator name joined). */
export interface LocationRow {
  id: string;
  name: string;
  kind: LocationKind;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  unlocode: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  railNumber: string | null;
  instructions: string | null;
  operatedByOrgId: string | null;
  /** Joined from organizations when the query asks for it. */
  operatorName: string | null;
  /**
   * Storage-surcharge terms. Warehouses only in the UI, but the columns are on
   * every location — a port that starts billing storage is a migration nobody
   * should have to write. The derivation (deadline, warning, estimate) lives in
   * lib/inventory/storage-surcharge.ts; these are just the stored terms.
   */
  surchargeFreeDays: number | null;
  surchargeAmount: number | null;
  surchargeBasis: string | null;
  surchargePeriod: string | null;
  deactivatedAt: string | null;
  createdAt: string;
  updatedAt: string | null;
}

/** One role link on an org's address book entry. */
export interface OrgLocationLink {
  linkId: string;
  role: LocationRole;
  isPrimary: boolean;
}

/** An org's address book entry: a location plus every role it plays for the org. */
export interface OrgAddressBookEntry {
  location: LocationRow;
  /** Sorted by `roleRank` (headquarters first). */
  roles: OrgLocationLink[];
}

/**
 * Address-book display order: an entry sorts by its best (lowest-ranked)
 * role — so the headquarters entry always leads — with a primary link at
 * that role beating a non-primary one, and the location name as the final
 * tiebreak. `listOrgAddressBook` applies this, so every consumer (the
 * Addresses card, saved-address dropdowns) reads the same order.
 */
export function compareBookEntries(a: OrgAddressBookEntry, b: OrgAddressBookEntry): number {
  const best = (e: OrgAddressBookEntry) => Math.min(...e.roles.map((r) => roleRank(r.role)));
  const bestA = best(a);
  const bestB = best(b);
  if (bestA !== bestB) return bestA - bestB;
  const primaryAtBest = (e: OrgAddressBookEntry, rank: number) =>
    e.roles.some((r) => roleRank(r.role) === rank && r.isPrimary);
  const pa = primaryAtBest(a, bestA);
  const pb = primaryAtBest(b, bestB);
  if (pa !== pb) return pa ? -1 : 1;
  return a.location.name.localeCompare(b.location.name);
}

/**
 * A resolved org address — the shape document party blocks and the org
 * profile card consume. Always sourced from the address book; null from
 * `resolveOrgAddress` means the org has no address on file.
 */
export interface ResolvedOrgAddress {
  locationId: string;
  name: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
}
