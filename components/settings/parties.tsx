"use client";

// =============================================================================
// Parties — one grid component, two pages
// =============================================================================
// /settings/buyers shows only consignees (role = buyer) with "New buyer"
// pre-set to that role; /settings/parties shows everyone else (carriers,
// forwarders, suppliers). Same rows, same drawer — a buyer is just an
// organization the desk sells to, and the documents resolve it the same way.
// =============================================================================

import { useState } from "react";
import { Building2, Plus, Users } from "lucide-react";

import { Section } from "@/components/bank/chrome";
import { PARTY_ROLE_OPTIONS, PartySheet, type PartyRole } from "@/components/settings/party-sheet";
import { Button } from "@/components/ui/button";
import { DataGrid, type DataGridColumn } from "@/components/ui/data-grid";
import { ClientAPI } from "@/trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/trpc/routers/_app";

type ListRow = inferRouterOutputs<AppRouter>["reference"]["parties"]["list"][number];

const roleLabel = (role: string) => PARTY_ROLE_OPTIONS.find(([v]) => v === role)?.[1] ?? role;

const NON_BUYER_ROLES: PartyRole[] = ["service_provider", "seller", "distributor", "partner"];

function PartyGrid({
  roles,
  title,
  subtitle,
  icon,
  newLabel,
  defaultRole,
  emptyMessage,
  showRole,
}: {
  roles: PartyRole[];
  title: string;
  subtitle: string;
  icon: typeof Users;
  newLabel: string;
  defaultRole: PartyRole;
  emptyMessage: string;
  showRole: boolean;
}) {
  const list = ClientAPI.reference.parties.list.useQuery({ roles, includeDeactivated: true });
  const utils = ClientAPI.useUtils();
  const [sheet, setSheet] = useState<{ mode: "new" } | { mode: "edit"; id: string } | null>(null);
  const editing = ClientAPI.reference.parties.get.useQuery(
    { id: sheet?.mode === "edit" ? sheet.id : "" },
    { enabled: sheet?.mode === "edit" },
  );

  const columns: DataGridColumn<ListRow>[] = [
    {
      key: "name",
      header: "Company",
      sortable: true,
      cell: (r) => (
        <button
          type="button"
          className="text-table-link font-medium hover:underline"
          onClick={() => setSheet({ mode: "edit", id: r.id })}
        >
          {r.name}
        </button>
      ),
      accessor: (r) => r.name,
    },
    ...(showRole
      ? [
          {
            key: "role",
            header: "Role",
            sortable: true,
            accessor: (r: ListRow) => roleLabel(r.role),
          } satisfies DataGridColumn<ListRow>,
        ]
      : []),
    {
      key: "location",
      header: "Location",
      sortable: true,
      accessor: (r) => [r.city, r.state, r.country].filter(Boolean).join(", "),
    },
    { key: "contact_name", header: "Contact", accessor: (r) => r.contact_name ?? "" },
    { key: "email", header: "Email", accessor: (r) => r.email ?? "" },
    { key: "phone", header: "Phone", accessor: (r) => r.phone ?? "" },
    { key: "tax_id", header: "Tax ID", accessor: (r) => r.tax_id ?? "" },
    {
      key: "payment_terms_days",
      header: "Terms",
      align: "right",
      accessor: (r) => `Net ${r.payment_terms_days}`,
    },
    {
      key: "deal_count",
      header: "Purchases",
      align: "right",
      sortable: true,
      accessor: (r) => r.deal_count,
      cell: (r) => (r.deal_count ? r.deal_count.toLocaleString("en-US") : "—"),
    },
    {
      key: "status",
      header: "Status",
      accessor: (r) => (r.deactivated_at ? "Inactive" : "Active"),
    },
  ];

  const onSaved = () => {
    void utils.reference.parties.invalidate();
    void utils.reference.carriers.invalidate();
    setSheet(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <Section
        title={title}
        subtitle={subtitle}
        icon={icon}
        actions={
          <Button variant="gold" size="sm" onClick={() => setSheet({ mode: "new" })}>
            <Plus /> {newLabel}
          </Button>
        }
      >
        <DataGrid
          label={title}
          columns={columns}
          rows={list.data ?? []}
          rowKey={(r) => r.id}
          searchable
          searchPlaceholder={`Search ${title.toLowerCase()}…`}
          emptyMessage={list.isLoading ? "Loading…" : emptyMessage}
        />
      </Section>

      {sheet?.mode === "new" && (
        <PartySheet defaultRole={defaultRole} onClose={() => setSheet(null)} onSaved={onSaved} />
      )}
      {sheet?.mode === "edit" && editing.data && (
        <PartySheet party={editing.data} onClose={() => setSheet(null)} onSaved={onSaved} />
      )}
    </div>
  );
}

/** /settings/buyers — consignees the desk sells to. */
export function Buyers() {
  return (
    <PartyGrid
      roles={["buyer"]}
      title="Buyers"
      subtitle="Consignees — printed as Consignee / Sold to / Bill to on the documents"
      icon={Users}
      newLabel="New buyer"
      defaultRole="buyer"
      emptyMessage="No buyers yet. Add the first consignee."
      showRole={false}
    />
  );
}

/** /settings/parties — everyone who is not a buyer. */
export function Parties() {
  return (
    <PartyGrid
      roles={NON_BUYER_ROLES}
      title="Other parties"
      subtitle="Ocean carriers, forwarders, suppliers and partners"
      icon={Building2}
      newLabel="New party"
      defaultRole="service_provider"
      emptyMessage="No parties yet. Add an ocean carrier to use on bookings."
      showRole
    />
  );
}
