"use client";

// Change a buyer's credit limit. Every change is written to
// organization_credit_limit_changes with who / when / why. Lowering the limit
// below the current exposure is allowed (the desk records reality) but flagged.

import { useState } from "react";
import { toast } from "sonner";

import { Cell, Grid } from "@/components/bank/chrome";
import { usd } from "@/components/credit/format";
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
import { Textarea } from "@/components/ui/textarea";
import { ClientAPI } from "@/trpc/client";

export function CreditLimitSheet({
  orgId,
  name,
  currentLimit,
  exposure,
  onClose,
  onSaved,
}: {
  orgId: string;
  name: string;
  currentLimit: number;
  exposure: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [limit, setLimit] = useState(String(currentLimit));
  const [reason, setReason] = useState("");
  const set = ClientAPI.credit.setCreditLimit.useMutation();
  const next = Number(limit);
  const below = Number.isFinite(next) && next < exposure;

  async function save() {
    if (!(next >= 0)) return void toast.error("Enter a credit limit (0 = prepay only).");
    try {
      const r = await set.mutateAsync({
        orgId,
        creditLimit: next,
        reason: reason.trim() || undefined,
      });
      toast.success(
        r.changed
          ? r.belowExposure
            ? "Limit saved — below current exposure"
            : "Credit limit updated"
          : "Limit unchanged",
      );
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the limit.");
    }
  }

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="p-6 pb-4">
          <SheetTitle className="text-base">Credit limit — {name}</SheetTitle>
          <SheetDescription>
            The most this buyer may owe at any time. Current exposure is{" "}
            <span className="font-medium">{usd(exposure)}</span>. A limit of $0 means prepay only.
          </SheetDescription>
        </SheetHeader>
        <div className="px-6 pb-6">
          <Grid>
            <Cell label="New credit limit ($)" span={6} htmlFor="cl-limit">
              <Input
                id="cl-limit"
                type="number"
                min={0}
                step="1000"
                className="h-8"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                autoFocus
              />
            </Cell>
            <Cell label="Current" span={6}>
              <div className="flex h-8 items-center text-sm font-medium">{usd(currentLimit)}</div>
            </Cell>
            <Cell label="Reason (kept in the history)" span={12} htmlFor="cl-reason">
              <Textarea
                id="cl-reason"
                rows={2}
                placeholder="Approved by … / trade references / prepaid history"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Cell>
          </Grid>
          {below ? (
            <p className="text-table-negative mt-3 text-xs font-medium">
              This is below what the buyer currently owes ({usd(exposure)}). It will save, and the
              buyer shows as over limit until payments come in.
            </p>
          ) : null}
        </div>
        <SheetFooter className="flex-row items-center justify-end gap-2 border-t p-6">
          <Button variant="outline" size="sm" onClick={onClose} disabled={set.isPending}>
            Cancel
          </Button>
          <Button variant="blue" size="sm" onClick={save} disabled={set.isPending}>
            {set.isPending ? "Saving…" : "Save limit"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
