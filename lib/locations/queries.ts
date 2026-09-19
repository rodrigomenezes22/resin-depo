import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { dbError } from "@/lib/supabase/errors";

import { kindRank } from "./types";
import type { LocationKind, LocationRole, LocationRow, ResolvedOrgAddress } from "./types";

// Trimmed copy of TPE lib/locations/queries.ts: only listLocations (ports
// picker), locationsByIds and resolveOrgAddress (document party blocks)
// survive here. The address-book / deal-point queries belong to TPE's order
// wizard and are not needed in resin-depo.

type DB = SupabaseClient<Database>;

const LOCATION_COLUMNS =
  "id, name, kind, address_line1, address_line2, city, state, zip, country, unlocode, " +
  "contact_name, phone, email, rail_number, instructions, operated_by_org_id, " +
  "deactivated_at, created_at, updated_at, updated_by, " +
  "surcharge_free_days, surcharge_amount, surcharge_basis, surcharge_period";

type DbLocation = Database["public"]["Tables"]["locations"]["Row"];

function toRow(l: DbLocation, operatorName: string | null = null): LocationRow {
  return {
    id: l.id,
    name: l.name,
    kind: l.kind,
    addressLine1: l.address_line1,
    addressLine2: l.address_line2,
    city: l.city,
    state: l.state,
    zip: l.zip,
    country: l.country,
    unlocode: l.unlocode,
    contactName: l.contact_name,
    phone: l.phone,
    email: l.email,
    railNumber: l.rail_number,
    instructions: l.instructions,
    operatedByOrgId: l.operated_by_org_id,
    operatorName,
    deactivatedAt: l.deactivated_at,
    createdAt: l.created_at,
    updatedAt: l.updated_at,
    surchargeFreeDays: l.surcharge_free_days,
    // numeric comes back as a string from PostgREST; the surcharge maths is
    // arithmetic, and "0.005" * 42000 is NaN.
    surchargeAmount: l.surcharge_amount == null ? null : Number(l.surcharge_amount),
    surchargeBasis: l.surcharge_basis,
    surchargePeriod: l.surcharge_period,
  };
}

export interface ListLocationsParams {
  /** Restrict to these kinds; omit for all (the directory wants everything). */
  kinds?: readonly LocationKind[];
  /**
   * Include soft-retired rows (directory only). Pickers omit this — but note
   * a historical FK to a deactivated location still renders wherever the row
   * was already chosen; deactivation only removes it from NEW picks.
   */
  includeDeactivated?: boolean;
  /** Only locations operated by this org (e.g. an org's own docks). */
  operatedByOrgId?: string;
  /**
   * Quality-of-life ordering for pickers where an org is already in context
   * (the sale form's Delivery/Shipping Point pickers once the buyer/seller is
   * chosen): that org's address-book entries float to the top — role-matched
   * links first (primaries leading), then the org's other links and operated
   * sites, then everything else in canonical order. Ordering only; nothing is
   * filtered. The Bank's party cards scope through `listDealPoints` instead.
   */
  preferOrg?: { organizationId: string; role?: LocationRole };
}

/**
 * Locations in canonical order — `kindRank` (warehouses → docks → ports →
 * offices) then name — with the operator org's name joined. Mixed-kind views
 * (the directory, the link-location picker) read grouped; a single-kind
 * picker just gets name order.
 */
export async function listLocations(
  db: DB,
  params: ListLocationsParams = {},
): Promise<LocationRow[]> {
  let query = db
    .from("locations")
    .select(`${LOCATION_COLUMNS}, operator:organizations!locations_operated_by_org_id_fkey(name)`)
    .order("name")
    .order("id"); // stable tiebreak — names aren't unique

  if (params.kinds && params.kinds.length > 0) query = query.in("kind", [...params.kinds]);
  if (!params.includeDeactivated) query = query.is("deactivated_at", null);
  if (params.operatedByOrgId) query = query.eq("operated_by_org_id", params.operatedByOrgId);

  const { data, error } = await query;
  if (error) throw dbError(error);
  // Stable sort over the SQL name order, so within a kind names stay sorted.
  const rows = (data ?? [])
    .map((l) => toRow(l, l.operator?.name ?? null))
    .sort((a, b) => kindRank(a.kind) - kindRank(b.kind));
  if (!params.preferOrg) return rows;

  // Float the in-context org's places. Rank per location: 0 = linked under
  // the asked-for role (primary before sibling), 1 = any other link or an
  // operated site, 2 = everyone else. Stable, so canonical order survives
  // within each band.
  const { organizationId, role } = params.preferOrg;
  const { data: links, error: linksError } = await db
    .from("organization_locations")
    .select("location_id, role, is_primary")
    .eq("organization_id", organizationId);
  if (linksError) throw dbError(linksError);

  const bandOf = new Map<string, number>();
  for (const link of links ?? []) {
    const band = role && link.role === role ? (link.is_primary ? 0 : 0.5) : 1;
    bandOf.set(link.location_id, Math.min(band, bandOf.get(link.location_id) ?? Infinity));
  }
  const band = (l: LocationRow) =>
    bandOf.get(l.id) ?? (l.operatedByOrgId === organizationId ? 1 : 2);
  return rows.sort((a, b) => band(a) - band(b));
}

export async function locationsByIds(
  db: DB,
  ids: readonly string[],
  includeDeactivated = false,
): Promise<LocationRow[]> {
  let query = db
    .from("locations")
    .select(`${LOCATION_COLUMNS}, operator:organizations!locations_operated_by_org_id_fkey(name)`)
    .in("id", [...ids])
    .order("name")
    .order("id");
  if (!includeDeactivated) query = query.is("deactivated_at", null);

  const { data, error } = await query;
  if (error) throw dbError(error);
  return (data ?? []).map((l) => toRow(l, l.operator?.name ?? null));
}

export async function resolveOrgAddress(
  db: DB,
  organizationId: string,
  role: LocationRole,
): Promise<ResolvedOrgAddress | null> {
  const { data: links, error } = await db
    .from("organization_locations")
    .select(`role, is_primary, locations(${LOCATION_COLUMNS})`)
    .eq("organization_id", organizationId)
    .in("role", role === "headquarters" ? ["headquarters"] : [role, "headquarters"]);
  if (error) throw dbError(error);

  const live = (links ?? []).filter((l) => l.locations && !l.locations.deactivated_at);
  const pick =
    live.find((l) => l.role === role && l.is_primary) ??
    live.find((l) => l.role === role) ??
    live.find((l) => l.role === "headquarters");
  if (!pick?.locations) return null;

  const loc = pick.locations;
  return {
    locationId: loc.id,
    name: loc.name,
    addressLine1: loc.address_line1,
    addressLine2: loc.address_line2,
    city: loc.city,
    state: loc.state,
    zip: loc.zip,
    country: loc.country,
    contactName: loc.contact_name,
    phone: loc.phone,
    email: loc.email,
  };
}
