"use client";

import { useState } from "react";
import { Building2, Plus } from "lucide-react";

import { Section } from "@/components/bank/chrome";
import { PARTY_ROLE_OPTIONS, PartySheet } from "@/components/settings/party-sheet";
import { Button } from "@/components/ui/button";
import { DataGrid, type DataGridColumn } from "@/components/ui/data-grid";
import { ClientAPI } from "@/trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/trpc/routers/_app";

type ListRow = inferRouterOutputs<AppRouter>["reference"]["parties"]["list"][number];

const roleLabel = (role: string) => PARTY_ROLE_OPTIONS.find(([v]) => v === role)?.[1] ?? role;

export function Parties() {
  const list = ClientAPI.reference.parties.list.useQuery({ includeDeactivated: true });
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
    { key: "role", header: "Role", sortable: true, accessor: (r) => roleLabel(r.role) },
    {
      key: "location",
      header: "Location",
      accessor: (r) => [r.city, r.state, r.country].filter(Boolean).join(", "),
    },
    { key: "contact_name", header: "Contact", accessor: (r) => r.contact_name ?? "" },
    { key: "email", header: "Email", accessor: (r) => r.email ?? "" },
    { key: "phone", header: "Phone", accessor: (r) => r.phone ?? "" },
    { key: "tax_id", header: "Tax ID", accessor: (r) => r.tax_id ?? "" },
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
        title="Parties"
        subtitle="Consignees, notify parties, carriers and other counterparties"
        icon={Building2}
        actions={
          <Button variant="gold" size="sm" onClick={() => setSheet({ mode: "new" })}>
            <Plus /> New party
          </Button>
        }
      >
        <DataGrid
          label="Parties"
          columns={columns}
          rows={list.data ?? []}
          rowKey={(r) => r.id}
          searchable
          searchPlaceholder="Search parties…"
          emptyMessage={list.isLoading ? "Loading…" : "No parties yet. Add the first consignee."}
        />
      </Section>

      {sheet?.mode === "new" && <PartySheet onClose={() => setSheet(null)} onSaved={onSaved} />}
      {sheet?.mode === "edit" && editing.data && (
        <PartySheet party={editing.data} onClose={() => setSheet(null)} onSaved={onSaved} />
      )}
    </div>
  );
}
