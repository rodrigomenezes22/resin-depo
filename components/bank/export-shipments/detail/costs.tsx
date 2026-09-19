"use client";

// =============================================================================
// Shared Costs — quoted per booking, carried per transaction
// =============================================================================
// Ocean freight, terminal handling and documentation are priced for the whole
// booking, but the ledger reports margin per transaction. The desk enters each
// total once here; the database splits it across the containers by contract
// weight and writes each share to that container's transaction.
//
// The allocation is READ BACK, never recomputed in this component. It is
// maintained by `allocate_shipment_costs` and re-runs on cost changes AND on
// membership changes — so adding a container elsewhere cannot leave these
// numbers quietly stale. Showing a client-side estimate beside a server-side
// truth is how two numbers start disagreeing.
//
// Adding is a drawer (AddCostSheet), matching Transaction Details → "+ Cost".
// =============================================================================

import { useState } from "react";
import { Coins, FileText, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Section } from "@/components/bank/chrome";
import { costLabel } from "@/components/bank/export-shipments/cost-types";
import { AddCostSheet } from "@/components/bank/export-shipments/detail/add-cost-sheet";
import type { ShipmentGroupRow } from "@/components/bank/export-shipments/types";
import { Button } from "@/components/ui/button";
import { DataGrid, type DataGridColumn } from "@/components/ui/data-grid";
import { createClient } from "@/lib/supabase/client";
import { ClientAPI } from "@/trpc/client";

/**
 * Open a private invoice PDF. The bucket is not public, so there is no URL to
 * hand out — this mints a one-hour signed one, which only succeeds for a
 * session the bucket's staff-only policies admit.
 */
async function viewInvoice(path: string) {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from("shipment-documents")
    .createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) {
    toast.error(error?.message || "Could not open the invoice.");
    return;
  }
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

const money = (n: number, currency: string) =>
  `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const lbs = (n: number) => Math.round(n).toLocaleString("en-US");

type CostRow = {
  id: string;
  cost_type: string;
  description: string | null;
  amount: number | string;
  currency: string;
  invoice_number: string | null;
  invoice_document_path: string | null;
};

type AllocationRow = {
  containerId: string;
  position: number;
  containerNumber: string | null;
  contractLbs: number;
  allocated: number;
};

export function Costs({ group, onSaved }: { group: ShipmentGroupRow; onSaved: () => void }) {
  const [adding, setAdding] = useState(false);

  const utils = ClientAPI.useUtils();
  const query = ClientAPI.exportShipments.costs.useQuery({ groupId: group.id });

  const refresh = () => {
    void utils.exportShipments.costs.invalidate({ groupId: group.id });
    // The allocation lands on matched_orders.freight, so the manifest and the
    // shipment header are stale too.
    onSaved();
  };

  const remove = ClientAPI.exportShipments.removeCost.useMutation({
    onSuccess: () => {
      toast.success("Cost removed — the split was recalculated");
      refresh();
    },
  });

  const data = query.data;
  const currency = group.currency;
  const costs = (data?.costs ?? []) as CostRow[];
  const allocations = (data?.allocations ?? []) as AllocationRow[];
  const total = data?.total ?? 0;
  const allocated = allocations.reduce((sum, a) => sum + a.allocated, 0);

  const costColumns: DataGridColumn<CostRow>[] = [
    { key: "type", header: "Cost", width: 160, accessor: (c) => costLabel(c.cost_type) },
    {
      key: "description",
      header: "Description",
      width: 240,
      accessor: (c) => c.description ?? "—",
    },
    {
      // Number and PDF are one fact — "which bill is this?" — so they share a
      // cell: the number reads as a link exactly when there is a file behind it.
      key: "invoice",
      header: "Invoice",
      width: 160,
      cell: (c) =>
        c.invoice_document_path ? (
          <button
            type="button"
            onClick={() => void viewInvoice(c.invoice_document_path!)}
            className="text-table-link flex items-center gap-1 hover:underline"
          >
            <FileText className="size-3.5 shrink-0" />
            {c.invoice_number ?? "View PDF"}
          </button>
        ) : (
          (c.invoice_number ?? "—")
        ),
    },
    {
      key: "amount",
      header: "Amount",
      width: 130,
      align: "right",
      accessor: (c) => money(Number(c.amount), c.currency),
    },
    {
      key: "actions",
      header: "",
      width: 44,
      cell: (c) => (
        <button
          type="button"
          aria-label={`Remove ${costLabel(c.cost_type)}`}
          title="Remove"
          disabled={remove.isPending}
          onClick={() => remove.mutate({ id: c.id })}
          className="text-table-negative hover:opacity-70 disabled:opacity-30"
        >
          <Trash2 className="size-3.5" />
        </button>
      ),
    },
  ];

  const allocationColumns: DataGridColumn<AllocationRow>[] = [
    { key: "position", header: "#", width: 44, align: "right", accessor: (a) => a.position },
    {
      key: "container",
      header: "Container #",
      width: 150,
      cell: (a) =>
        a.containerNumber ? (
          <span className="font-mono text-xs">{a.containerNumber}</span>
        ) : (
          <span className="text-muted-foreground">Not stuffed</span>
        ),
    },
    {
      key: "weight",
      header: "Contract (lbs)",
      width: 130,
      align: "right",
      accessor: (a) => lbs(a.contractLbs),
    },
    {
      key: "share",
      header: "Allocated",
      width: 140,
      align: "right",
      accessor: (a) => money(a.allocated, currency),
    },
  ];

  return (
    <Section
      title="Shared Costs"
      subtitle="Quoted per booking — split across the containers by contract weight"
      icon={Coins}
      actions={
        <Button variant="gold" size="sm" onClick={() => setAdding(true)}>
          <Plus className="size-4" />
          Add Cost
        </Button>
      }
    >
      <DataGrid
        columns={costColumns}
        rows={costs}
        rowKey={(c) => c.id}
        totals={
          costs.length
            ? costColumns.map((c) =>
                c.key === "type" ? "Total" : c.key === "amount" ? money(total, currency) : null,
              )
            : undefined
        }
        emptyMessage="No shared costs yet. Add the ocean freight and terminal charges quoted for this booking."
      />

      {costs.length ? (
        <>
          <h3 className="text-muted-foreground mt-2 text-xs font-semibold tracking-wide uppercase">
            Allocation
          </h3>
          <DataGrid
            columns={allocationColumns}
            rows={allocations}
            rowKey={(a) => a.containerId}
            totals={allocationColumns.map((c) =>
              c.key === "position"
                ? "Total"
                : c.key === "share"
                  ? money(allocated, currency)
                  : null,
            )}
            emptyMessage="No containers on this shipment yet."
          />
          <p className="text-muted-foreground text-xs">
            Each share is written to its container&apos;s transaction, so Transaction Summary margin
            and the Commercial Invoice&apos;s freight line read the same number. The last container
            absorbs the rounding remainder, so the shares always sum to the total.
          </p>
        </>
      ) : null}

      {adding ? (
        <AddCostSheet
          groupId={group.id}
          currency={currency}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            refresh();
          }}
        />
      ) : null}
    </Section>
  );
}
