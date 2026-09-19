"use client";

// =============================================================================
// Manifest — the containers on a shipment
// =============================================================================
// One row per container. In TPE the order number links back to the ledger
// Transaction; resin-depo has no ledger — the deal is the Purchase card above,
// every container is one of its legs, and "Add containers" mints more legs.
// Editing opens a sheet rather than putting eleven inputs inline: a manifest
// row is scanned far more often than it is edited.
//
// Contract weight (matched_orders.quantity_lbs) and loaded net weight are shown
// side by side on purpose — they differ, and only the contract weight ever
// prices anything.
// =============================================================================

import { useState } from "react";
import { Container, ListPlus, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Section } from "@/components/bank/chrome";
import { AddContainersSheet } from "@/components/bank/export-shipments/detail/add-containers-sheet";
import { ContainerSheet } from "@/components/bank/export-shipments/detail/container-sheet";
import { AddContainerSheet } from "@/components/bank/export-shipments/detail/add-container-sheet";
import { formatPackages } from "@/components/bank/export-shipments/package-kinds";
import type {
  ShipmentContainerRow,
  ShipmentGroupRow,
} from "@/components/bank/export-shipments/types";
import { Button } from "@/components/ui/button";
import { DataGrid, type DataGridColumn } from "@/components/ui/data-grid";
import { dealOrderNumber, lbsToMetricTons, type OrderUnit } from "@/lib/units";
import { ClientAPI } from "@/trpc/client";

const lbs = (n: number | string | null) =>
  n == null ? "—" : Math.round(Number(n)).toLocaleString("en-US");

/** The same pounds restated in MT — three decimals, as on a B/L. */
const mt = (n: number | string | null) =>
  n == null
    ? "—"
    : lbsToMetricTons(Number(n)).toLocaleString("en-US", {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
      });

export function Manifest({ group, onSaved }: { group: ShipmentGroupRow; onSaved: () => void }) {
  const [editing, setEditing] = useState<ShipmentContainerRow | null>(null);
  const [minting, setMinting] = useState(false);
  const [adding, setAdding] = useState(false);

  const remove = ClientAPI.exportShipments.removeContainer.useMutation({ onSuccess: onSaved });
  const destroy = ClientAPI.exportShipments.deleteContainer.useMutation({
    onSuccess: onSaved,
    onError: (e) => toast.error(e.message),
  });

  const columns: DataGridColumn<ShipmentContainerRow>[] = [
    { key: "position", header: "#", width: 44, align: "right", accessor: (c) => c.position },
    {
      key: "order",
      header: "Order #",
      width: 120,
      cell: (c) =>
        c.matched_orders ? (
          <button
            type="button"
            onClick={() => setEditing(c)}
            className="text-table-link font-medium hover:underline"
            aria-label={`Open container ${c.position}`}
          >
            {/* Containers on a booking are very often conversion legs, so this
                is exactly where a shared parent number has to show through. */}
            {dealOrderNumber({
              display_number: c.matched_orders.display_number,
              unit: c.matched_orders.unit as OrderUnit,
              qty: Number(c.matched_orders.qty),
              parent_display_number: c.parent_display_number,
              leg_index: c.matched_orders.leg_index,
            })}
          </button>
        ) : (
          "—"
        ),
    },
    {
      key: "product",
      header: "Product",
      width: 150,
      accessor: (c) => c.matched_orders?.products?.name ?? c.matched_orders?.product_text ?? "—",
    },
    {
      key: "container",
      header: "Container #",
      width: 140,
      cell: (c) =>
        c.container_number ? (
          <span className="font-mono text-xs">{c.container_number}</span>
        ) : (
          <span className="text-muted-foreground">Not stuffed</span>
        ),
    },
    {
      key: "seal",
      header: "Seal #",
      width: 110,
      cell: (c) => <span className="font-mono text-xs">{c.seal_number ?? "—"}</span>,
    },
    {
      key: "packages",
      header: "Packages",
      width: 140,
      align: "right",
      accessor: (c) => formatPackages(c.package_count, c.package_kind) ?? "—",
    },
    {
      key: "contractLbs",
      header: "Contract (lbs)",
      width: 120,
      align: "right",
      accessor: (c) => lbs(c.matched_orders?.quantity_lbs ?? null),
    },
    {
      key: "contractMt",
      header: "Contract (MT)",
      width: 120,
      align: "right",
      // Derived from the contract lbs, never stored — the two columns are one
      // number expressed twice, and a stored MT could drift from it.
      accessor: (c) => mt(c.matched_orders?.quantity_lbs ?? null),
    },
    {
      key: "netLbs",
      header: "Net (lbs)",
      width: 110,
      align: "right",
      accessor: (c) => lbs(c.net_weight_lbs),
    },
    {
      key: "grossLbs",
      header: "Gross (lbs)",
      width: 110,
      align: "right",
      // GENERATED in the database — never editable, so it can't disagree.
      accessor: (c) => (c.net_weight_lbs == null ? "—" : lbs(c.gross_weight_lbs)),
    },
    {
      key: "actions",
      header: "",
      width: 104,
      cell: (c) => (
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={`Edit container ${c.position}`}
            onClick={() => setEditing(c)}
            className="text-table-link hover:opacity-70"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label={`Remove container ${c.position} from shipment`}
            onClick={() => remove.mutate({ containerId: c.id })}
            className="text-table-negative hover:opacity-70"
            title="Remove from shipment (keeps the deal)"
          >
            <X className="size-4" />
          </button>
          <button
            type="button"
            aria-label={`Delete container ${c.position} and its deal`}
            title="Delete container and its deal"
            onClick={() => {
              if (
                window.confirm("Delete this container AND its trade line? This cannot be undone.")
              )
                destroy.mutate({ containerId: c.id });
            }}
            className="text-muted-foreground hover:text-table-negative"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ),
    },
  ];

  const totalContract = group.containers.reduce(
    (a, c) => a + Number(c.matched_orders?.quantity_lbs ?? 0),
    0,
  );
  const totalNet = group.containers.reduce((a, c) => a + Number(c.net_weight_lbs ?? 0), 0);
  const totalGross = group.containers.reduce((a, c) => a + Number(c.gross_weight_lbs ?? 0), 0);
  const totalPackages = group.containers.reduce((a, c) => a + Number(c.package_count ?? 0), 0);

  const totalsByKey: Record<string, React.ReactNode> = {
    position: "Total",
    packages: totalPackages || null,
    contractLbs: lbs(totalContract),
    contractMt: mt(totalContract),
    netLbs: totalNet ? lbs(totalNet) : null,
    grossLbs: totalGross ? lbs(totalGross) : null,
  };

  return (
    // Renders its own Section — Add Containers lives in the header slot.
    <Section
      title="Container Manifest"
      subtitle="One row per container — container no., seal, packing & weights"
      icon={Container}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <ListPlus className="size-4" />
            Add existing
          </Button>
          <Button
            variant="gold"
            size="sm"
            onClick={() => setMinting(true)}
            disabled={!group.deal}
            title={group.deal ? undefined : "Save the Purchase card first"}
          >
            <Plus className="size-4" />
            Add containers
          </Button>
        </div>
      }
    >
      <DataGrid
        columns={columns}
        rows={group.containers}
        rowKey={(c) => c.id}
        totals={
          group.containers.length ? columns.map((c) => totalsByKey[c.key] ?? null) : undefined
        }
        emptyMessage={
          group.deal
            ? "No containers yet. Add containers — each inherits the Purchase above."
            : "Save the Purchase card first, then add containers."
        }
      />

      {editing ? (
        <ContainerSheet
          container={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onSaved();
          }}
        />
      ) : null}

      {minting ? (
        <AddContainerSheet
          groupId={group.id}
          onClose={() => setMinting(false)}
          onSaved={() => {
            setMinting(false);
            onSaved();
          }}
        />
      ) : null}

      {adding ? (
        <AddContainersSheet
          groupId={group.id}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            onSaved();
          }}
        />
      ) : null}
    </Section>
  );
}
