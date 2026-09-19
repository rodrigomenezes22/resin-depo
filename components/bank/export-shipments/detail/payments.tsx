"use client";

// =============================================================================
// Payments — what this shipment's buyer owes and has paid (resin-depo)
// =============================================================================
// Amount owed = the issued Commercial Invoice's total when one exists (goods +
// freight), else the Purchase estimate (contract lbs × sell price). Balance and
// the buyer's available credit come from the credit views, so recording a
// payment here moves the Credit page instantly. TPE left this card as a
// disabled "Record Payment" button; this is the real one.
// =============================================================================

import { useState } from "react";
import { Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Cell, Grid, ReadValue, Section } from "@/components/bank/chrome";
import type { ShipmentGroupRow } from "@/components/bank/export-shipments/types";
import { formatShipmentNumber } from "@/components/bank/export-shipments/group-status";
import { Available, DaysLate, METHOD_LABELS, fmtDay, usd } from "@/components/credit/format";
import { PaymentSheet } from "@/components/credit/payment-sheet";
import { Button } from "@/components/ui/button";
import { DataGrid, type DataGridColumn } from "@/components/ui/data-grid";
import { ClientAPI } from "@/trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/trpc/routers/_app";

type PaymentRow = inferRouterOutputs<AppRouter>["credit"]["shipment"]["payments"][number];

export function Payments({ group, onSaved }: { group: ShipmentGroupRow; onSaved: () => void }) {
  const q = ClientAPI.credit.shipment.useQuery({ groupId: group.id });
  const utils = ClientAPI.useUtils();
  const [recording, setRecording] = useState(false);
  const remove = ClientAPI.credit.deletePayment.useMutation({
    onSuccess: () => {
      toast.success("Payment removed");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const refresh = () => {
    void utils.credit.invalidate();
    onSaved();
  };

  const r = q.data?.receivable ?? null;
  const credit = q.data?.buyerCredit ?? null;

  const columns: DataGridColumn<PaymentRow>[] = [
    { key: "paid_at", header: "Received", width: 120, accessor: (p) => fmtDay(p.paid_at) },
    {
      key: "amount",
      header: "Amount",
      width: 130,
      align: "right",
      accessor: (p) => usd(p.amount, p.currency),
    },
    {
      key: "method",
      header: "Method",
      width: 110,
      accessor: (p) => (p.method ? METHOD_LABELS[p.method] : "—"),
    },
    {
      key: "reference_number",
      header: "Reference",
      cellClassName: "font-mono text-xs",
      accessor: (p) => p.reference_number ?? "—",
    },
    { key: "notes", header: "Notes", accessor: (p) => p.notes ?? "" },
    {
      key: "recorded_by",
      header: "By",
      width: 140,
      accessor: (p) =>
        [p.recorded_by?.first_name, p.recorded_by?.last_name].filter(Boolean).join(" ") || "—",
    },
    {
      key: "actions",
      header: "",
      width: 44,
      cell: (p) => (
        <button
          type="button"
          aria-label="Remove payment"
          title="Remove (entered by mistake)"
          onClick={() => {
            if (window.confirm(`Remove the ${usd(p.amount, p.currency)} payment?`))
              remove.mutate({ id: p.id });
          }}
          className="text-muted-foreground hover:text-table-negative"
        >
          <Trash2 className="size-3.5" />
        </button>
      ),
    },
  ];

  return (
    <Section
      title="Payments"
      subtitle="What the buyer owes on this shipment and what has been received"
      icon={Wallet}
      actions={
        <Button
          variant="gold"
          size="sm"
          onClick={() => setRecording(true)}
          disabled={!r}
          title={r ? undefined : "Save the Purchase card first"}
        >
          Record payment
        </Button>
      }
    >
      {!r ? (
        <p className="text-muted-foreground text-sm">
          {q.isLoading ? "Loading…" : "No purchase yet — nothing is owed on this shipment."}
        </p>
      ) : (
        <>
          <Grid>
            <Cell
              label={
                r.amountSource === "invoice"
                  ? `Invoiced (${r.invoiceNumber})`
                  : "Amount owed (estimate)"
              }
              span={3}
            >
              <ReadValue>{usd(r.amount, r.currency)}</ReadValue>
            </Cell>
            <Cell label="Paid" span={2}>
              <ReadValue>{r.paid ? usd(r.paid, r.currency) : "—"}</ReadValue>
            </Cell>
            <Cell label="Balance" span={2}>
              <ReadValue>
                <span className={r.balance > 0 ? "text-table-negative" : "text-table-positive"}>
                  {usd(r.balance, r.currency)}
                </span>
              </ReadValue>
            </Cell>
            <Cell label={`Due (Net ${r.termsDays})`} span={2}>
              <ReadValue>{fmtDay(r.dueDate)}</ReadValue>
            </Cell>
            <Cell label="Status" span={3}>
              <ReadValue>
                {r.status === "cancelled" ? (
                  <span className="text-muted-foreground">Cancelled — not owed</span>
                ) : r.balance <= 0 ? (
                  <span className="text-table-positive">Paid in full</span>
                ) : (
                  <DaysLate days={r.daysLate} />
                )}
              </ReadValue>
            </Cell>
          </Grid>
          {credit ? (
            <p className="text-muted-foreground text-xs">
              {r.buyerName}: credit limit {usd(credit.creditLimit)}, exposure {usd(credit.exposure)}
              , available <Available value={credit.available} limit={credit.creditLimit} />.
              {r.amountSource === "estimate"
                ? " The amount is the purchase estimate (goods only) until a Commercial Invoice is issued; the invoice total then takes over."
                : ""}
            </p>
          ) : null}
          <DataGrid
            label="Payments"
            columns={columns}
            rows={q.data?.payments ?? []}
            rowKey={(p) => p.id}
            emptyMessage="No payments received yet."
          />
        </>
      )}

      {recording && r ? (
        <PaymentSheet
          groupId={group.id}
          shipmentLabel={formatShipmentNumber(group.display_number)}
          balance={r.balance}
          currency={r.currency}
          onClose={() => setRecording(false)}
          onSaved={() => {
            setRecording(false);
            refresh();
          }}
        />
      ) : null}
    </Section>
  );
}
