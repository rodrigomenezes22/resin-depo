"use client";

// =============================================================================
// Buyer credit — /credit/[orgId]
// =============================================================================
// Header: limit (editable, audited), exposure, available, utilisation, aging.
// Receivables: every shipment with a purchase for this buyer — amount owed
// (invoice or estimate), paid, balance, due, days late, record payment.
// Then the payments received and the credit-limit history.
// =============================================================================

import { useState } from "react";
import Link from "next/link";
import { CreditCard, History, Receipt, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Cell, Grid, ReadValue, Section } from "@/components/bank/chrome";
import { formatShipmentNumber } from "@/components/bank/export-shipments/group-status";
import { CreditLimitSheet } from "@/components/credit/credit-limit-sheet";
import {
  Available,
  DaysLate,
  METHOD_LABELS,
  Utilisation,
  fmtDay,
  usd,
  usd0,
} from "@/components/credit/format";
import { PaymentSheet } from "@/components/credit/payment-sheet";
import { Button } from "@/components/ui/button";
import { DataGrid, type DataGridColumn } from "@/components/ui/data-grid";
import { cn } from "@/lib/utils";
import { ClientAPI } from "@/trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/trpc/routers/_app";

type Data = inferRouterOutputs<AppRouter>["credit"]["buyer"];
type Receivable = Data["receivables"][number];
type Payment = Data["payments"][number];
type Change = Data["history"][number];

const who = (p: { first_name: string | null; last_name: string | null } | null) =>
  [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "—";

export function BuyerCredit({ orgId }: { orgId: string }) {
  const q = ClientAPI.credit.buyer.useQuery({ orgId });
  const utils = ClientAPI.useUtils();
  const [editingLimit, setEditingLimit] = useState(false);
  const [paying, setPaying] = useState<Receivable | null>(null);
  const remove = ClientAPI.credit.deletePayment.useMutation({
    onSuccess: () => {
      toast.success("Payment removed");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const refresh = () => {
    void utils.credit.invalidate();
    void utils.reference.parties.invalidate();
  };

  if (q.isLoading) return <p className="text-muted-foreground text-sm">Loading…</p>;
  if (!q.data) return <p className="text-muted-foreground text-sm">Buyer not found.</p>;
  const { credit, receivables, payments, history } = q.data;

  const recColumns: DataGridColumn<Receivable>[] = [
    {
      key: "shipment",
      header: "Shipment",
      width: 110,
      cell: (r) => (
        <Link
          href={`/shipments/${r.shipmentGroupId}`}
          className="text-table-link font-medium hover:underline"
        >
          {formatShipmentNumber(r.displayNumber)}
        </Link>
      ),
      accessor: (r) => formatShipmentNumber(r.displayNumber),
    },
    {
      key: "order",
      header: "Order #",
      width: 90,
      cellClassName: "font-mono",
      accessor: (r) => r.orderNumber ?? "—",
    },
    {
      key: "invoice",
      header: "Invoice",
      width: 150,
      cell: (r) =>
        r.amountSource === "invoice" ? (
          <span className="font-mono text-xs">{r.invoiceNumber}</span>
        ) : (
          <span className="text-muted-foreground text-xs">estimate</span>
        ),
      accessor: (r) => r.invoiceNumber ?? "estimate",
    },
    {
      key: "containers",
      header: "Ctrs",
      width: 60,
      align: "right",
      accessor: (r) => r.containerCount || "—",
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      accessor: (r) => r.amount,
      cell: (r) => usd(r.amount, r.currency),
    },
    {
      key: "paid",
      header: "Paid",
      align: "right",
      accessor: (r) => r.paid,
      cell: (r) => (r.paid ? usd(r.paid, r.currency) : "—"),
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      sortable: true,
      accessor: (r) => r.balance,
      cell: (r) => (
        <span
          className={cn(
            "font-medium",
            r.balance > 0 && r.isOpen ? "text-table-negative" : "text-table-positive",
          )}
        >
          {usd(r.balance, r.currency)}
        </span>
      ),
    },
    {
      key: "due",
      header: "Due",
      width: 110,
      sortable: true,
      accessor: (r) => r.dueDate ?? "",
      cell: (r) => fmtDay(r.dueDate),
    },
    {
      key: "late",
      header: "Status",
      width: 130,
      cell: (r) =>
        r.status === "cancelled" ? (
          <span className="text-muted-foreground">cancelled</span>
        ) : r.balance <= 0 ? (
          <span className="text-table-positive">paid</span>
        ) : (
          <DaysLate days={r.daysLate} />
        ),
      accessor: (r) => r.daysLate ?? 0,
    },
    {
      key: "actions",
      header: "",
      width: 130,
      cell: (r) =>
        r.isOpen ? (
          <Button variant="blue" size="xs" onClick={() => setPaying(r)}>
            Record payment
          </Button>
        ) : null,
    },
  ];

  const payColumns: DataGridColumn<Payment>[] = [
    { key: "paid_at", header: "Received", width: 120, accessor: (p) => fmtDay(p.paid_at) },
    {
      key: "shipment",
      header: "Shipment",
      width: 110,
      cell: (p) => {
        const r = receivables.find((x) => x.shipmentGroupId === p.shipment_group_id);
        return (
          <Link
            href={`/shipments/${p.shipment_group_id}`}
            className="text-table-link hover:underline"
          >
            {r ? formatShipmentNumber(r.displayNumber) : "—"}
          </Link>
        );
      },
    },
    { key: "amount", header: "Amount", align: "right", accessor: (p) => usd(p.amount, p.currency) },
    {
      key: "method",
      header: "Method",
      width: 110,
      accessor: (p) => (p.method ? METHOD_LABELS[p.method] : "—"),
    },
    {
      key: "ref",
      header: "Reference",
      cellClassName: "font-mono text-xs",
      accessor: (p) => p.reference_number ?? "—",
    },
    { key: "notes", header: "Notes", accessor: (p) => p.notes ?? "" },
    { key: "by", header: "By", width: 140, accessor: (p) => who(p.recorded_by) },
    {
      key: "actions",
      header: "",
      width: 44,
      cell: (p) => (
        <button
          type="button"
          aria-label="Remove payment"
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

  const histColumns: DataGridColumn<Change>[] = [
    {
      key: "changed_at",
      header: "When",
      width: 170,
      accessor: (c) => new Date(c.changed_at).toLocaleString("en-US"),
    },
    { key: "old", header: "From", align: "right", accessor: (c) => usd0(c.old_limit) },
    { key: "new", header: "To", align: "right", accessor: (c) => usd0(c.new_limit) },
    { key: "by", header: "By", width: 140, accessor: (c) => who(c.changed_by) },
    { key: "reason", header: "Reason", accessor: (c) => c.reason ?? "" },
  ];

  const b = credit.buckets;
  const chip = (label: string, v: number, late = false) => (
    <span
      key={label}
      className={cn(
        "rounded-md border px-2 py-1 text-xs",
        v > 0 && late
          ? "border-table-negative/40 text-table-negative font-medium"
          : "text-muted-foreground",
      )}
    >
      {label}: {v ? usd0(v) : "—"}
    </span>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Link href="/credit" className="text-table-link text-sm hover:underline">
          ← Customer credit
        </Link>
        <h1 className="text-tpe-gold-ink text-2xl font-bold">{credit.name}</h1>
      </div>

      <Section
        title="Credit"
        subtitle={`Net ${credit.paymentTermsDays} · lifetime billed ${usd0(credit.lifetimeBilled)}, paid ${usd0(credit.lifetimePaid)}`}
        icon={CreditCard}
        actions={
          <Button variant="blue" size="sm" onClick={() => setEditingLimit(true)}>
            Change limit
          </Button>
        }
      >
        <Grid>
          <Cell label="Credit limit" span={2}>
            <ReadValue>{usd0(credit.creditLimit)}</ReadValue>
          </Cell>
          <Cell label="Exposure (open balances)" span={3}>
            <ReadValue>{usd(credit.exposure)}</ReadValue>
          </Cell>
          <Cell label="Available" span={2}>
            <ReadValue>
              <Available value={credit.available} limit={credit.creditLimit} />
            </ReadValue>
          </Cell>
          <Cell label="Used" span={3}>
            <div className="flex h-8 items-center">
              <Utilisation exposure={credit.exposure} limit={credit.creditLimit} />
            </div>
          </Cell>
          <Cell label="Open shipments" span={2}>
            <ReadValue>{credit.openShipments || null}</ReadValue>
          </Cell>
        </Grid>
        <div className="flex flex-wrap gap-2">
          {chip("Current", b.current)}
          {chip("1–30", b.d1_30, true)}
          {chip("31–60", b.d31_60, true)}
          {chip("61–90", b.d61_90, true)}
          {chip(">90", b.d90plus, true)}
        </div>
      </Section>

      <Section
        title="Receivables"
        subtitle="Every shipment with a purchase for this buyer — open first"
        icon={Receipt}
      >
        <DataGrid
          label="Receivables"
          columns={recColumns}
          rows={receivables}
          rowKey={(r) => r.shipmentGroupId}
          emptyMessage="No shipments for this buyer yet."
        />
      </Section>

      <Section title="Payments received" subtitle="Newest first" icon={Wallet}>
        <DataGrid
          label="Payments"
          columns={payColumns}
          rows={payments}
          rowKey={(p) => p.id}
          emptyMessage="No payments yet."
        />
      </Section>

      <Section
        title="Credit limit history"
        subtitle="Who changed the limit, when and why"
        icon={History}
      >
        <DataGrid
          label="Credit limit history"
          columns={histColumns}
          rows={history}
          rowKey={(c) => c.id}
          emptyMessage="No changes recorded."
        />
      </Section>

      {editingLimit ? (
        <CreditLimitSheet
          orgId={orgId}
          name={credit.name}
          currentLimit={credit.creditLimit}
          exposure={credit.exposure}
          onClose={() => setEditingLimit(false)}
          onSaved={() => {
            setEditingLimit(false);
            refresh();
          }}
        />
      ) : null}
      {paying ? (
        <PaymentSheet
          groupId={paying.shipmentGroupId}
          shipmentLabel={formatShipmentNumber(paying.displayNumber)}
          balance={paying.balance}
          currency={paying.currency}
          onClose={() => setPaying(null)}
          onSaved={() => {
            setPaying(null);
            refresh();
          }}
        />
      ) : null}
    </div>
  );
}
