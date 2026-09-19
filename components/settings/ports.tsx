"use client";

import { useState } from "react";
import { Anchor, Plus } from "lucide-react";
import { toast } from "sonner";

import { Cell, Grid, Section } from "@/components/bank/chrome";
import { Button } from "@/components/ui/button";
import { DataGrid, type DataGridColumn } from "@/components/ui/data-grid";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ClientAPI } from "@/trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/trpc/routers/_app";

type PortRow = inferRouterOutputs<AppRouter>["reference"]["ports"]["list"][number];

function PortSheet({
  port,
  onClose,
  onSaved,
}: {
  port?: PortRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(port?.name ?? "");
  const [city, setCity] = useState(port?.city ?? "");
  const [state, setState] = useState(port?.state ?? "");
  const [country, setCountry] = useState(port?.country ?? "");
  const [unlocode, setUnlocode] = useState(port?.unlocode ?? "");
  const [active, setActive] = useState(!port?.deactivated_at);
  const create = ClientAPI.reference.ports.create.useMutation();
  const update = ClientAPI.reference.ports.update.useMutation();
  const pending = create.isPending || update.isPending;

  async function save() {
    if (!name.trim()) {
      toast.error("Name is required.");
      return;
    }
    const fields = { name: name.trim(), city, state, country, unlocode: unlocode.trim() };
    try {
      if (port) await update.mutateAsync({ id: port.id, ...fields, deactivated: !active });
      else await create.mutateAsync(fields);
      toast.success(port ? "Port updated" : "Port created");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the port.");
    }
  }

  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="p-6 pb-4">
          <SheetTitle className="text-base">{port ? "Edit port" : "New port"}</SheetTitle>
          <SheetDescription>
            Ports of loading and discharge. The UN/LOCODE (e.g. USHOU) keys the bill of lading.
          </SheetDescription>
        </SheetHeader>
        <div className="px-6 pb-6">
          <Grid>
            <Cell label="Port name" span={8} htmlFor="port-name">
              <Input
                id="port-name"
                className="h-8"
                placeholder="Port of Houston"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </Cell>
            <Cell label="UN/LOCODE" span={4} htmlFor="port-unlocode">
              <Input
                id="port-unlocode"
                className="h-8 font-mono uppercase"
                placeholder="USHOU"
                maxLength={5}
                value={unlocode}
                onChange={(e) => setUnlocode(e.target.value.toUpperCase())}
              />
            </Cell>
            <Cell label="City" span={4} htmlFor="port-city">
              <Input
                id="port-city"
                className="h-8"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </Cell>
            <Cell label="State / province" span={4} htmlFor="port-state">
              <Input
                id="port-state"
                className="h-8"
                value={state}
                onChange={(e) => setState(e.target.value)}
              />
            </Cell>
            <Cell label="Country" span={4} htmlFor="port-country">
              <Input
                id="port-country"
                className="h-8"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              />
            </Cell>
            {port && (
              <Cell label="Status" span={12}>
                <label className="flex h-8 items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                  />
                  Active (offered in the port pickers)
                </label>
              </Cell>
            )}
          </Grid>
        </div>
        <SheetFooter className="flex-row items-center justify-end gap-2 border-t p-6">
          <Button variant="outline" size="sm" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="blue" size="sm" onClick={save} disabled={pending}>
            {pending ? "Saving…" : port ? "Save changes" : "Create port"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function Ports() {
  const list = ClientAPI.reference.ports.list.useQuery();
  const utils = ClientAPI.useUtils();
  const [sheet, setSheet] = useState<{ mode: "new" } | { mode: "edit"; row: PortRow } | null>(null);

  const columns: DataGridColumn<PortRow>[] = [
    {
      key: "name",
      header: "Port",
      sortable: true,
      cell: (r) => (
        <button
          type="button"
          className="text-table-link font-medium hover:underline"
          onClick={() => setSheet({ mode: "edit", row: r })}
        >
          {r.name}
        </button>
      ),
      accessor: (r) => r.name,
    },
    {
      key: "unlocode",
      header: "UN/LOCODE",
      sortable: true,
      cellClassName: "font-mono",
      accessor: (r) => r.unlocode ?? "",
    },
    { key: "city", header: "City", accessor: (r) => r.city ?? "" },
    { key: "country", header: "Country", sortable: true, accessor: (r) => r.country ?? "" },
    {
      key: "status",
      header: "Status",
      accessor: (r) => (r.deactivated_at ? "Inactive" : "Active"),
    },
  ];

  const onSaved = () => {
    void utils.reference.ports.invalidate();
    void utils.locations.list.invalidate();
    setSheet(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <Section
        title="Ports"
        subtitle="Ports of loading and discharge"
        icon={Anchor}
        actions={
          <Button variant="gold" size="sm" onClick={() => setSheet({ mode: "new" })}>
            <Plus /> New port
          </Button>
        }
      >
        <DataGrid
          label="Ports"
          columns={columns}
          rows={list.data ?? []}
          rowKey={(r) => r.id}
          searchable
          searchPlaceholder="Search ports…"
          emptyMessage={list.isLoading ? "Loading…" : "No ports yet."}
        />
      </Section>
      {sheet?.mode === "new" && <PortSheet onClose={() => setSheet(null)} onSaved={onSaved} />}
      {sheet?.mode === "edit" && (
        <PortSheet port={sheet.row} onClose={() => setSheet(null)} onSaved={onSaved} />
      )}
    </div>
  );
}
