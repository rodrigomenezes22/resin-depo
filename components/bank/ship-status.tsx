// =============================================================================
// Ship status vocabulary — labels + the ledger chip
// =============================================================================
// `matched_orders.ship_status` is the hand-set sales/ops shipment label
// (supabase/migrations/20260729151130_ship_status.sql), deliberately distinct
// from the event-sourced `deliveries.status`. It is edited on the Transaction
// Details page (a plain Select) and displayed on the Transaction Summary ledger
// (a colored pill). Both read the labels from here so the two never drift.
// =============================================================================

import { BookmarkCheck, PackageCheck, Truck, Warehouse } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { StatusBadge } from "@/components/ui/status-badge";
import type { Database } from "@/lib/supabase/database.types";

export type ShipStatus = Database["public"]["Enums"]["ship_status"];

/**
 * Shipment Details → Status. Legacy's SHIPMENT_SHIP_STATUS (1/2/3) plus Client
 * Reserved. Mirrors the `ship_status` enum on matched_orders — keep in sync
 * with the Zod enum in trpc/routers/orders.ts.
 */
export const SHIP_STATUSES: [string, string][] = [
  ["inventory", "Inventory"],
  ["enroute", "Enroute"],
  ["delivered", "Delivered"],
  ["client_reserved", "Client Reserved"],
];

export const SHIP_STATUS_LABELS = Object.fromEntries(SHIP_STATUSES) as Record<string, string>;

// Reads as a pipeline: sitting still (grey) → moving (amber) → done (green),
// with Client Reserved gold as the "held/flagged" state. Each also gets its own
// icon so the statuses are distinguishable without relying on color alone.
// Typed as a total Record so adding an enum value is a compile error here.
const SHIP_STATUS_CHIP: Record<
  ShipStatus,
  { tone: React.ComponentProps<typeof StatusBadge>["tone"]; icon: LucideIcon }
> = {
  inventory: { tone: "neutral", icon: Warehouse },
  enroute: { tone: "in-progress", icon: Truck },
  delivered: { tone: "finished", icon: PackageCheck },
  client_reserved: { tone: "in-review", icon: BookmarkCheck },
};

/** The ledger pill. Solid StatusBadge tones read on the light DataGrid rows. */
export function ShipStatusBadge({ status }: { status: ShipStatus }) {
  const spec = SHIP_STATUS_CHIP[status];
  return (
    <StatusBadge tone={spec.tone} icon={spec.icon}>
      {SHIP_STATUS_LABELS[status] ?? status}
    </StatusBadge>
  );
}
