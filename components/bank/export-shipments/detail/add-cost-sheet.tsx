"use client";

// =============================================================================
// AddCostSheet — post a shared cost against a booking
// =============================================================================
// The same drawer shape as Transaction Details → Inventory → "+ Cost": the form
// is a side sheet, not an inline panel, so opening it never pushes the Shared
// Costs table and its allocation out from under the reader.
//
// Posting a cost re-runs `allocate_shipment_costs` server-side, which rewrites
// every container's freight share — hence the caller-supplied `onSaved`, which
// refreshes the manifest and the shipment header as well as this table.
//
// THE INVOICE PDF. A cost is a bill somebody sent us, so the vendor's invoice
// can be attached with it. Two steps, in this order and no other: post the cost,
// then upload under its id. The path is `{groupId}/costs/{costId}.pdf`, so the
// object cannot be named before the row exists — and if the upload fails the
// desk still has the cost (it is what the allocation runs on), rather than
// losing a $4,050 freight bill because a PDF was 3 MB too big.
//
// The file goes to the PRIVATE `shipment-documents` bucket, whose storage
// policies admit only admin and broker_trader — the same guard as the Bills of
// Lading it sits beside. There is no public URL; reading one back means minting
// a short-lived signed URL as a session that passed those policies.
// =============================================================================

import { useState } from "react";
import { toast } from "sonner";

import { Cell, Grid, SELECT_POPUP, SELECT_TRIGGER } from "@/components/bank/chrome";
import {
  COST_TYPES,
  costLabel,
  type ExportCostType,
} from "@/components/bank/export-shipments/cost-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { createClient } from "@/lib/supabase/client";
import { ClientAPI } from "@/trpc/client";

/** The bucket's own cap (20 MB) — refuse here so the upload isn't wasted. */
const MAX_INVOICE_BYTES = 20 * 1024 * 1024;

export function AddCostSheet({
  groupId,
  currency,
  onClose,
  onSaved,
}: {
  groupId: string;
  currency: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [costType, setCostType] = useState<ExportCostType>("ocean_freight");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const add = ClientAPI.exportShipments.addCost.useMutation();
  const attach = ClientAPI.exportShipments.attachCostInvoice.useMutation();
  const pending = add.isPending || attach.isPending || uploading;

  function pickFile(f: File | null) {
    if (f && f.type !== "application/pdf") {
      toast.error("The invoice must be a PDF.");
      return;
    }
    if (f && f.size > MAX_INVOICE_BYTES) {
      toast.error("The invoice PDF must be 20 MB or smaller.");
      return;
    }
    setFile(f);
  }

  async function submit() {
    try {
      // 1) Post the cost. The allocation runs on this insert, so it is the part
      //    that must not be held hostage to the upload.
      const { id } = await add.mutateAsync({
        groupId,
        costType,
        description: description.trim() || null,
        amount: Number(amount),
        currency,
        invoiceNumber: invoiceNumber.trim() || null,
      });

      // 2) Upload the invoice under the new cost's id and record the path.
      if (file) {
        setUploading(true);
        const supabase = createClient();
        const path = `${groupId}/costs/${id}.pdf`;
        const { error } = await supabase.storage
          .from("shipment-documents")
          .upload(path, file, { upsert: true, contentType: "application/pdf" });
        if (error) throw new Error(error.message);
        await attach.mutateAsync({ id, path });
      }

      toast.success(file ? "Cost added with its invoice" : "Cost added and allocated");
      onSaved();
    } catch (e) {
      // The cost may well have landed — say so, rather than implying nothing
      // happened and inviting a duplicate.
      toast.error(e instanceof Error ? e.message : "Could not add the cost.");
      setUploading(false);
    }
  }

  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="p-6 pb-4">
          <SheetTitle className="text-base">Add cost</SheetTitle>
          <SheetDescription>
            Quoted for the whole booking. On save it is split across the containers by contract
            weight and written to each one&apos;s transaction.
          </SheetDescription>
        </SheetHeader>

        <div className="px-6 pb-6">
          <Grid>
            <Cell label="Cost" span={12}>
              <Select value={costType} onValueChange={(v) => v && setCostType(v as ExportCostType)}>
                <SelectTrigger className={SELECT_TRIGGER} aria-label="Cost type">
                  <SelectValue>{costLabel(costType)}</SelectValue>
                </SelectTrigger>
                <SelectContent className={SELECT_POPUP}>
                  {COST_TYPES.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Cell>

            <Cell label="Description" span={12} htmlFor="cost-description">
              <Input
                id="cost-description"
                className="h-8"
                placeholder="Houston to Shanghai, 3 x 40HC"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Cell>

            <Cell label={`Amount (${currency})`} span={12} htmlFor="cost-amount">
              <Input
                id="cost-amount"
                type="number"
                min={0}
                step="0.01"
                className="h-8"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Cell>

            <Cell label="Invoice #" span={12} htmlFor="cost-invoice">
              <Input
                id="cost-invoice"
                className="h-8"
                placeholder="As printed on the vendor's bill"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
              />
            </Cell>

            <Cell label="Invoice PDF" span={12} htmlFor="cost-pdf">
              <Input
                id="cost-pdf"
                type="file"
                accept="application/pdf"
                className="h-8 py-1"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
            </Cell>
          </Grid>

          <p className="text-muted-foreground mt-2 text-xs">
            {file ? `${file.name} — ` : ""}PDF up to 20 MB. Stored privately; only TPE staff can
            open it.
          </p>
        </div>

        <SheetFooter className="flex-row items-center justify-end gap-2 border-t p-6">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="blue" size="sm" disabled={pending || !amount.trim()} onClick={submit}>
            {uploading ? "Uploading…" : pending ? "Saving…" : "Add Cost"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
