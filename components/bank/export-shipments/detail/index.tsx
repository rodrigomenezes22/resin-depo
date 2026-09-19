"use client";

// =============================================================================
// ShipmentDetail — Bank → Export Shipments → one booking
// =============================================================================
// Stacked collapsible sections, the same shape as Transaction Details: Booking
// (vessel, ports, dates and the BOOKING NUMBER — set once for the whole
// shipment), Manifest (the containers and their stuffing detail), Shared Costs
// (quoted per booking, split across the containers), Documents, and the audit
// Timeline.
//
// Each section saves itself through a partial patch, so the Booking card can
// never clobber a field the Manifest owns.
// =============================================================================

import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";

import { FORM_PAGE_WIDTH } from "@/components/dashboard/page-width";
import { cn } from "@/lib/utils";
import { Booking } from "@/components/bank/export-shipments/detail/booking";
import { Purchase } from "@/components/bank/export-shipments/detail/purchase";
import { Costs } from "@/components/bank/export-shipments/detail/costs";
import { Documents } from "@/components/bank/export-shipments/detail/documents";
import { ShipmentFiles } from "@/components/bank/shipment-files";
import { Manifest } from "@/components/bank/export-shipments/detail/manifest";
import { Timeline } from "@/components/bank/export-shipments/detail/timeline";
import {
  ExportGroupStatusBadge,
  formatShipmentNumber,
} from "@/components/bank/export-shipments/group-status";
import { Section } from "@/components/bank/chrome";
import { ClientAPI } from "@/trpc/client";

const lbs = (n: number) => Math.round(n).toLocaleString("en-US");

export function ShipmentDetail({ id }: { id: string }) {
  const query = ClientAPI.exportShipments.detail.useQuery({ id });
  const group = query.data;

  if (query.isLoading) {
    return (
      <div className="text-muted-foreground bg-card rounded-lg border p-6 text-sm">
        Loading shipment…
      </div>
    );
  }
  if (!group) {
    return (
      <div className="bg-card rounded-lg border p-6 text-sm">
        <p className="font-medium">Shipment not found.</p>
        <Link href="/shipments" className="text-table-link text-sm hover:underline">
          Back to Export Shipments
        </Link>
      </div>
    );
  }

  const refresh = () => void query.refetch();

  const totalLbs = group.containers.reduce(
    (sum, c) => sum + Number(c.matched_orders?.quantity_lbs ?? 0),
    0,
  );
  const stuffed = group.containers.filter((c) => c.container_number).length;

  return (
    // Capped at FORM_PAGE_WIDTH (1280px) and centred: on ultrawide desks the
    // dense 12-col rows would otherwise stretch until the labels lose their
    // fields.
    <div className={cn(FORM_PAGE_WIDTH, "flex flex-col gap-3")}>
      {/* Header — identity, live readiness, and the way back */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/shipments"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
          >
            <ArrowLeft className="size-4" />
            Export Shipments
          </Link>
          <h1 className="text-tpe-gold-ink text-2xl font-bold">
            {formatShipmentNumber(group.display_number)}
          </h1>
          <ExportGroupStatusBadge status={group.status} />
          {group.rolled_from ? (
            <Link
              href={`/shipments/${group.rolled_from.id}`}
              className="text-table-link text-xs hover:underline"
            >
              Rolled from {formatShipmentNumber(group.rolled_from.display_number)}
            </Link>
          ) : null}
        </div>
        <div className="text-muted-foreground flex items-center gap-4 text-sm">
          <span>
            <span className="text-foreground font-semibold tabular-nums">
              {stuffed} / {group.containers.length}
            </span>{" "}
            stuffed
          </span>
          <span>
            <span className="text-foreground font-semibold tabular-nums">{lbs(totalLbs)}</span> lbs
          </span>
        </div>
      </div>

      <Purchase key={group.deal?.id ?? "none"} group={group} onSaved={refresh} />
      {/* Keyed on the incoterm: the Purchase card can change it, and Booking
          holds its own form state from mount (TPE design). */}
      <Booking key={`booking-${group.incoterm}`} group={group} onSaved={refresh} />

      {/* Every section but the Timeline renders its own Section — each needs the
          header action slot for its save / add button. */}
      <Manifest group={group} onSaved={refresh} />

      <Costs group={group} onSaved={refresh} />

      <Documents group={group} onSaved={refresh} />

      <ShipmentFiles owner={{ kind: "group", groupId: group.id }} />

      <Section title="Timeline" subtitle="What happened to this shipment" icon={History}>
        <Timeline events={group.events} />
      </Section>
    </div>
  );
}
