"use client";

// =============================================================================
// ExportShipments — Bank → Export Shipments
// =============================================================================
// The list of ocean bookings. One row per shipment, not per container: the
// Transaction Summary ledger remains the one-row-per-container view, and a
// shipment is the layer beside it. Columns are the things the desk scans on
// when the phone rings — vessel, ports, ETD, and how many of the containers
// have actually been stuffed.
//
// `stuffed_count` / `container_count` / `total_lbs` are all derived server-side
// from the manifest, never stored, so they cannot drift from the containers.
// =============================================================================

import { useState } from "react";
import Link from "next/link";
import { Search, Ship } from "lucide-react";

import {
  ExportGroupStatusBadge,
  formatShipmentNumber,
  GROUP_STATUSES,
  type ShipmentGroupStatus,
} from "@/components/bank/export-shipments/group-status";
import { NewShipmentButton } from "@/components/bank/export-shipments/new-shipment-button";
import { Button } from "@/components/ui/button";
import { DataGrid, type DataGridColumn } from "@/components/ui/data-grid";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClientAPI } from "@/trpc/client";

const FILTER_LABEL = "text-muted-foreground text-[11px] font-medium tracking-wide uppercase";

const lbs = (n: number) => Math.round(n).toLocaleString("en-US");
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "2-digit" }) : "—";

export function ExportShipments() {
  const [status, setStatus] = useState<ShipmentGroupStatus | "all">("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const shipments = ClientAPI.exportShipments.list.useQuery({
    status: status === "all" ? undefined : status,
    search: search || undefined,
  });
  const rows = shipments.data ?? [];

  const columns: DataGridColumn<(typeof rows)[number]>[] = [
    {
      key: "shipment",
      header: "Shipment #",
      width: 120,
      cell: (g) => (
        <Link href={`/shipments/${g.id}`} className="text-table-link font-medium hover:underline">
          {formatShipmentNumber(g.display_number)}
        </Link>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: 130,
      cell: (g) => <ExportGroupStatusBadge status={g.status} />,
    },
    {
      key: "containers",
      header: "Containers",
      width: 110,
      align: "right",
      // "2 / 3" reads as stuffed-of-booked at a glance — the number the desk
      // chases before a sailing.
      cell: (g) => (
        <span className="tabular-nums">
          {g.stuffed_count} / {g.container_count}
        </span>
      ),
    },
    {
      key: "buyer",
      header: "Customer",
      width: 170,
      accessor: (g) => g.buyer_company_text ?? "—",
    },
    {
      key: "vessel",
      header: "Vessel / Voyage",
      width: 190,
      cell: (g) =>
        g.vessel_name ? (
          <span>
            {g.vessel_name}
            {g.voyage_number ? (
              <span className="text-muted-foreground"> · {g.voyage_number}</span>
            ) : null}
          </span>
        ) : (
          <span className="text-muted-foreground">Not booked</span>
        ),
    },
    {
      key: "route",
      header: "POL → POD",
      width: 170,
      cell: (g) =>
        g.pol || g.pod ? (
          <span className="font-mono text-xs">
            {g.pol?.unlocode ?? g.pol?.name ?? "—"} → {g.pod?.unlocode ?? g.pod?.name ?? "—"}
          </span>
        ) : (
          "—"
        ),
    },
    { key: "etd", header: "ETD", width: 90, accessor: (g) => fmtDate(g.etd) },
    { key: "eta", header: "ETA", width: 90, accessor: (g) => fmtDate(g.eta) },
    {
      key: "weight",
      header: "Weight (lbs)",
      width: 120,
      align: "right",
      accessor: (g) => lbs(g.total_lbs),
    },
    { key: "incoterm", header: "Incoterm", width: 90, accessor: (g) => g.incoterm },
    {
      key: "carrier",
      header: "Carrier",
      width: 160,
      accessor: (g) => g.carrier_name ?? "—",
    },
  ];

  const totalContainers = rows.reduce((a, g) => a + g.container_count, 0);
  const totalLbs = rows.reduce((a, g) => a + g.total_lbs, 0);
  const totalsByKey: Record<string, React.ReactNode> = {
    shipment: "Total",
    containers: totalContainers,
    weight: lbs(totalLbs),
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-tpe-gold-ink text-3xl font-bold">Export Shipments</h1>
        <NewShipmentButton />
      </div>

      <div className="bg-card overflow-hidden rounded-lg border">
        <div className="flex flex-wrap items-end gap-4 p-4">
          <div className="flex flex-col gap-1.5">
            <span className={FILTER_LABEL}>Status</span>
            <Select
              value={status}
              onValueChange={(v) => v && setStatus(v as ShipmentGroupStatus | "all")}
            >
              <SelectTrigger className="w-40">
                <SelectValue>
                  {status === "all"
                    ? "All statuses"
                    : (GROUP_STATUSES.find(([v]) => v === status)?.[1] ?? status)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {GROUP_STATUSES.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="ml-auto flex flex-col gap-1.5">
            <span className={FILTER_LABEL}>Search</span>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && setSearch(searchInput)}
                  placeholder="Search shipment #, vessel, B/L, customer…"
                  className="h-9 w-56 pl-8 sm:w-72"
                />
              </div>
              <Button variant="gold" onClick={() => setSearch(searchInput)}>
                Find
              </Button>
            </div>
          </div>
        </div>
      </div>

      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(g) => g.id}
        totals={rows.length ? columns.map((c) => totalsByKey[c.key] ?? null) : undefined}
        emptyMessage={
          shipments.isLoading ? (
            "Loading shipments…"
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Ship className="size-4" />
              No export shipments yet. Open one to group containers onto a booking.
            </span>
          )
        }
      />
    </div>
  );
}
