"use client";

// =============================================================================
// Timeline — the shipment's append-only audit
// =============================================================================
// `shipment_group_events` is written by the procedures, never by hand. It is
// what answers "why does this shipment have two containers when the invoice
// says three" once the roll lands in Stage 3.
// =============================================================================

import type { ShipmentEventRow } from "@/components/bank/export-shipments/types";

const EVENT_LABELS: Record<string, string> = {
  created: "Shipment opened",
  containers_assigned: "Containers added",
  containers_removed: "Container removed",
  container_updated: "Container updated",
  containers_rolled_out: "Containers rolled out",
  containers_rolled_in: "Containers rolled in",
  status_changed: "Status changed",
  cost_reallocated: "Shared costs re-allocated",
  cost_added: "Shared cost added",
  cost_updated: "Shared cost updated",
  cost_removed: "Shared cost removed",
  document_drafted: "Document drafted",
  document_issued: "Document issued",
  document_voided: "Document voided",
  document_deleted: "Draft document deleted",
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Event label; deal edits reuse container_updated with a scope marker (REM-03 CHECK). */
function labelOf(event: ShipmentEventRow): string {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  if (event.event_type === "container_updated" && payload.scope === "deal") {
    return payload.created ? "Purchase opened" : "Purchase updated";
  }
  if (event.event_type === "container_updated" && payload.scope === "payment") {
    return payload.removed ? "Payment removed" : "Payment recorded";
  }
  return EVENT_LABELS[event.event_type] ?? event.event_type;
}

/** A one-line, human summary of the event's payload. */
function describe(event: ShipmentEventRow): string | null {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  if (event.event_type === "status_changed" && payload.from && payload.to) {
    return `${payload.from} → ${payload.to}`;
  }
  if (typeof payload.count === "number") {
    return `${payload.count} container${payload.count === 1 ? "" : "s"}`;
  }
  if (typeof payload.containers === "number") {
    return `${payload.containers} container${payload.containers === 1 ? "" : "s"}`;
  }
  if (payload.scope === "payment" && typeof payload.amount === "number") {
    const amt = payload.amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
    return [amt, payload.method, payload.referenceNumber].filter(Boolean).join(" · ");
  }
  // container_updated / cost_updated carry { changed: { column: { from, to } } }.
  if (payload.changed && typeof payload.changed === "object") {
    const cols = Object.keys(payload.changed as Record<string, unknown>);
    if (cols.length) return cols.map((c) => c.replace(/_/g, " ")).join(", ");
  }
  return null;
}

export function Timeline({ events }: { events: ShipmentEventRow[] }) {
  if (!events.length) {
    return <p className="text-muted-foreground text-sm">Nothing has happened yet.</p>;
  }

  return (
    <ol className="flex flex-col gap-2">
      {events.map((e) => {
        const detail = describe(e);
        const who = e.performed_by
          ? `${e.performed_by.first_name ?? ""} ${e.performed_by.last_name ?? ""}`.trim()
          : null;
        return (
          <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="text-muted-foreground w-40 shrink-0 font-mono text-xs">
              {fmt(e.occurred_at)}
            </span>
            <span className="font-medium">{labelOf(e)}</span>
            {detail ? <span className="text-muted-foreground">{detail}</span> : null}
            {who ? <span className="text-muted-foreground text-xs">· {who}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
