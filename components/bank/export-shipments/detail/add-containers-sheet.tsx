"use client";

// =============================================================================
// AddContainersSheet — assemble a shipment from existing transactions
// =============================================================================
// Offers only what the database will actually accept: international,
// container-sized, non-draft transactions that are not already on a shipment
// and are not conversion parents. `exportShipments.groupable` mirrors the guard
// trigger, so the picker can never present something the insert will reject.
// =============================================================================

import { useState } from "react";

import type { GroupableTransaction } from "@/components/bank/export-shipments/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { dealOrderNumber, UNIT_LABELS, type OrderUnit } from "@/lib/units";
import { ClientAPI } from "@/trpc/client";

const lbs = (n: number | string) => Math.round(Number(n)).toLocaleString("en-US");

export function AddContainersSheet({
  groupId,
  onClose,
  onSaved,
}: {
  groupId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const candidates = ClientAPI.exportShipments.groupable.useQuery({
    search: search || undefined,
  });
  const assign = ClientAPI.exportShipments.assignContainers.useMutation({ onSuccess: onSaved });

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const rows: GroupableTransaction[] = candidates.data ?? [];
  const totalLbs = rows
    .filter((r) => selected.has(r.id))
    .reduce((a, r) => a + Number(r.quantity_lbs), 0);

  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader className="p-6 pb-4">
          <SheetTitle className="text-base">Add containers</SheetTitle>
          <SheetDescription>
            International container transactions that are not yet on a shipment. Each one becomes a
            container on this booking.
          </SheetDescription>
        </SheetHeader>

        <div className="px-6 pb-4">
          <Input
            className="h-9"
            placeholder="Search order #, product, customer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <ul className="flex flex-col gap-1 px-6 pb-6">
          {candidates.isLoading ? (
            <li className="text-muted-foreground py-6 text-center text-sm">Loading…</li>
          ) : rows.length === 0 ? (
            <li className="text-muted-foreground py-6 text-center text-sm">
              No ungrouped container transactions. They must be international, container-sized and
              confirmed.
            </li>
          ) : (
            rows.map((r) => (
              <li key={r.id}>
                <label className="hover:bg-accent flex cursor-pointer items-center gap-3 rounded-md border p-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                  />
                  <span className="flex-1">
                    <span className="font-medium">
                      {dealOrderNumber({
                        display_number: r.display_number,
                        unit: r.unit as OrderUnit,
                        qty: Number(r.qty),
                        parent_display_number: r.parent_display_number,
                        leg_index: r.leg_index,
                      })}
                    </span>
                    <span className="text-muted-foreground">
                      {" · "}
                      {r.products?.name ?? r.product_text ?? "—"}
                      {" · "}
                      {r.buyer_company_text ?? "—"}
                    </span>
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {UNIT_LABELS[r.unit as OrderUnit] ?? r.unit} · {lbs(r.quantity_lbs)} lbs
                  </span>
                </label>
              </li>
            ))
          )}
        </ul>

        <SheetFooter className="flex-row items-center justify-between border-t p-6">
          <span className="text-muted-foreground text-xs">
            {selected.size === 0
              ? "Nothing selected"
              : `${selected.size} selected · ${lbs(totalLbs)} lbs`}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="gold"
              size="sm"
              disabled={selected.size === 0 || assign.isPending}
              onClick={() => assign.mutate({ groupId, matchedOrderIds: [...selected] })}
            >
              {assign.isPending ? "Adding…" : "Add to shipment"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
