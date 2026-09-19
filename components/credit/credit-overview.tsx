"use client";

// =============================================================================
// Customer credit — the /credit grid
// =============================================================================
// One row per buyer: limit, exposure (Σ open balances), available, utilisation
// and the standard aging buckets. Numbers come from the buyer_credit view;
// the buyer name opens /credit/[orgId] for the shipment-level detail.
// =============================================================================

import { useState } from "react";
import Link from "next/link";
import { CreditCard } from "lucide-react";

import { Section } from "@/components/bank/chrome";
import { CreditLimitSheet } from "@/components/credit/credit-limit-sheet";
import { Available, Utilisation, fmtDay, usd0 } from "@/components/credit/format";
import { DataGrid, type DataGridColumn } from "@/components/ui/data-grid";
import { cn } from "@/lib/utils";
import { ClientAPI } from "@/trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/trpc/routers/_app";

type Row = inferRouterOutputs<AppRouter>["credit"]["overview"][number];

const bucket = (v: number, late = false) =>
  v ? <span className={cn(late && "text-table-negative font-medium")}>{usd0(v)}</span> : "—";

export function CreditOverview() {
  const q = ClientAPI.credit.overview.useQuery();
  const utils = ClientAPI.useUtils();
  const [editing, setEditing] = useState<Row | null>(null);
  const rows = q.data ?? [];

  const columns: DataGridColumn<Row>[] = [
    {
      key: "name",
      header: "Buyer",
      sortable: true,
      cell: (r) => (
        <Link
          href={`/credit/${r.organizationId}`}
          className="text-table-link font-medium hover:underline"
        >
          {r.name}
        </Link>
      ),
      accessor: (r) => r.name,
    },
    { key: "terms", header: "Terms", width: 70, accessor: (r) => `Net ${r.paymentTermsDays}` },
    {
      key: "limit",
      header: "Credit limit",
      align: "right",
      sortable: true,
      accessor: (r) => r.creditLimit,
      cell: (r) => (
        <button
          type="button"
          className="text-table-link hover:underline"
          title="Change limit"
          onClick={() => setEditing(r)}
        >
          {usd0(r.creditLimit)}
        </button>
      ),
    },
    {
      key: "exposure",
      header: "Exposure",
      align: "right",
      sortable: true,
      accessor: (r) => r.exposure,
      cell: (r) => (r.exposure ? usd0(r.exposure) : "—"),
    },
    {
      key: "available",
      header: "Available",
      align: "right",
      sortable: true,
      accessor: (r) => r.available,
      cell: (r) => <Available value={r.available} limit={r.creditLimit} />,
    },
    {
      key: "used",
      header: "Used",
      width: 150,
      cell: (r) => <Utilisation exposure={r.exposure} limit={r.creditLimit} />,
      accessor: (r) => (r.creditLimit ? Math.round((r.exposure / r.creditLimit) * 100) : 0),
    },
    {
      key: "b0",
      header: "Current",
      align: "right",
      accessor: (r) => r.buckets.current,
      cell: (r) => bucket(r.buckets.current),
    },
    {
      key: "b1",
      header: "1–30",
      align: "right",
      accessor: (r) => r.buckets.d1_30,
      cell: (r) => bucket(r.buckets.d1_30, true),
    },
    {
      key: "b2",
      header: "31–60",
      align: "right",
      accessor: (r) => r.buckets.d31_60,
      cell: (r) => bucket(r.buckets.d31_60, true),
    },
    {
      key: "b3",
      header: "61–90",
      align: "right",
      accessor: (r) => r.buckets.d61_90,
      cell: (r) => bucket(r.buckets.d61_90, true),
    },
    {
      key: "b4",
      header: ">90",
      align: "right",
      accessor: (r) => r.buckets.d90plus,
      cell: (r) => bucket(r.buckets.d90plus, true),
    },
    {
      key: "open",
      header: "Open",
      width: 60,
      align: "right",
      accessor: (r) => r.openShipments || "—",
    },
    {
      key: "oldest",
      header: "Oldest due",
      width: 110,
      accessor: (r) => (r.openShipments ? fmtDay(r.oldestDue) : "—"),
    },
  ];

  const sum = (f: (r: Row) => number) => rows.reduce((a, r) => a + f(r), 0);
  const totals: Record<string, React.ReactNode> = {
    name: "Total",
    limit: usd0(sum((r) => r.creditLimit)),
    exposure: usd0(sum((r) => r.exposure)),
    available: usd0(sum((r) => r.available)),
    b0: bucket(sum((r) => r.buckets.current)),
    b1: bucket(
      sum((r) => r.buckets.d1_30),
      true,
    ),
    b2: bucket(
      sum((r) => r.buckets.d31_60),
      true,
    ),
    b3: bucket(
      sum((r) => r.buckets.d61_90),
      true,
    ),
    b4: bucket(
      sum((r) => r.buckets.d90plus),
      true,
    ),
    open: sum((r) => r.openShipments) || "—",
  };

  return (
    <div className="flex flex-col gap-4">
      <Section
        title="Customer credit"
        subtitle="Limit, exposure and aging per buyer — exposure counts every open shipment from its purchase until paid"
        icon={CreditCard}
      >
        <DataGrid
          label="Customer credit"
          columns={columns}
          rows={rows}
          rowKey={(r) => r.organizationId}
          searchable
          searchPlaceholder="Search buyers…"
          totals={rows.length ? columns.map((c) => totals[c.key] ?? null) : undefined}
          emptyMessage={q.isLoading ? "Loading…" : "No buyers yet."}
        />
        <p className="text-muted-foreground text-xs">
          Aging buckets are days past the due date (invoice payment-due date, else ETD + payment
          terms). Amounts before a Commercial Invoice is issued are purchase estimates.
        </p>
      </Section>
      {editing ? (
        <CreditLimitSheet
          orgId={editing.organizationId}
          name={editing.name}
          currentLimit={editing.creditLimit}
          exposure={editing.exposure}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void utils.credit.invalidate();
            void utils.reference.parties.invalidate();
          }}
        />
      ) : null}
    </div>
  );
}
