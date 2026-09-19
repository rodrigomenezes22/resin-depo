// =============================================================================
// Export shipment status vocabulary — labels + the ledger chip
// =============================================================================
// `shipment_groups.status` is the desk's hand-set booking label, the analogue
// of `matched_orders.ship_status`. It is NOT event-sourced: physical movement
// stays on `deliveries.status` via delivery_events, and shipment *readiness*
// ("3 of 4 containers stuffed") is derived in the procedure, never stored.
//
// Same shape as components/bank/ship-status.tsx so the two read alike.
// =============================================================================

import { Anchor, Ban, CalendarCheck, CheckCircle2, FileText, Ship } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { StatusBadge } from "@/components/ui/status-badge";
import type { Database } from "@/lib/supabase/database.types";

export type ShipmentGroupStatus = Database["public"]["Enums"]["shipment_group_status"];

/** Ordered for the Booking card's Select — the natural life of a booking. */
export const GROUP_STATUSES: [ShipmentGroupStatus, string][] = [
  ["draft", "Draft"],
  ["booked", "Booked"],
  ["sailed", "Sailed"],
  ["arrived", "Arrived"],
  ["closed", "Closed"],
  ["cancelled", "Cancelled"],
];

export const GROUP_STATUS_LABELS = Object.fromEntries(GROUP_STATUSES) as Record<
  ShipmentGroupStatus,
  string
>;

// Reads as a voyage: being put together (grey) → confirmed with the line (gold)
// → at sea (amber) → landed (green) → done (grey), with cancelled in red. Each
// gets its own icon so the statuses survive being read in greyscale. Typed as a
// total Record, so adding an enum value is a compile error here.
const GROUP_STATUS_CHIP: Record<
  ShipmentGroupStatus,
  { tone: React.ComponentProps<typeof StatusBadge>["tone"]; icon: LucideIcon }
> = {
  draft: { tone: "neutral", icon: FileText },
  booked: { tone: "in-review", icon: CalendarCheck },
  sailed: { tone: "in-progress", icon: Ship },
  arrived: { tone: "info", icon: Anchor },
  closed: { tone: "finished", icon: CheckCircle2 },
  cancelled: { tone: "danger", icon: Ban },
};

/** The list chip. Solid StatusBadge tones read on the light DataGrid rows. */
export function ExportGroupStatusBadge({ status }: { status: ShipmentGroupStatus }) {
  const spec = GROUP_STATUS_CHIP[status];
  return (
    <StatusBadge tone={spec.tone} icon={spec.icon}>
      {GROUP_STATUS_LABELS[status] ?? status}
    </StatusBadge>
  );
}

/** `SHP-01041` — the shipment's human name, per the Phase R display-id convention. */
export function formatShipmentNumber(displayNumber: number | string): string {
  return `SHP-${String(displayNumber).padStart(5, "0")}`;
}
