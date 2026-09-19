"use client";

// Record a payment against one shipment's purchase. Opened from the shipment's
// Payments card and from the buyer credit page (which passes the shipment).

import { useState } from "react";
import { toast } from "sonner";

import { Cell, Grid, SELECT_POPUP, SELECT_TRIGGER } from "@/components/bank/chrome";
import { METHOD_LABELS, usd } from "@/components/credit/format";
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
import { Textarea } from "@/components/ui/textarea";
import { ClientAPI } from "@/trpc/client";

const METHODS = Object.entries(METHOD_LABELS);
const today = () => new Date().toISOString().slice(0, 10);

export function PaymentSheet({
  groupId,
  shipmentLabel,
  balance,
  currency = "USD",
  onClose,
  onSaved,
}: {
  groupId: string;
  shipmentLabel: string;
  /** Prefills the amount. */
  balance: number;
  currency?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(balance > 0 ? String(balance) : "");
  const [paidAt, setPaidAt] = useState(today());
  const [method, setMethod] = useState("wire");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const record = ClientAPI.credit.recordPayment.useMutation();

  async function save() {
    const n = Number(amount);
    if (!(n > 0)) return void toast.error("Enter the amount received.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) return void toast.error("Enter the payment date.");
    try {
      await record.mutateAsync({
        groupId,
        amount: n,
        paidAt,
        method: method as "wire",
        referenceNumber: reference.trim() || null,
        notes: notes.trim() || null,
      });
      toast.success(`Payment of ${usd(n, currency)} recorded`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record the payment.");
    }
  }

  const over = Number(amount) > balance && balance > 0;

  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="p-6 pb-4">
          <SheetTitle className="text-base">Record payment — {shipmentLabel}</SheetTitle>
          <SheetDescription>
            Balance on this shipment: <span className="font-medium">{usd(balance, currency)}</span>.
            Partial payments are fine; the balance and the buyer&apos;s available credit update
            immediately.
          </SheetDescription>
        </SheetHeader>
        <div className="px-6 pb-6">
          <Grid>
            <Cell label={`Amount (${currency})`} span={6} htmlFor="pay-amount">
              <Input
                id="pay-amount"
                type="number"
                min={0}
                step="0.01"
                className="h-8"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
              />
            </Cell>
            <Cell label="Received on" span={6} htmlFor="pay-date">
              <Input
                id="pay-date"
                type="date"
                className="h-8"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
              />
            </Cell>
            <Cell label="Method" span={6}>
              <Select value={method} onValueChange={(v) => v && setMethod(v)}>
                <SelectTrigger className={SELECT_TRIGGER} aria-label="Payment method">
                  <SelectValue>{METHOD_LABELS[method]}</SelectValue>
                </SelectTrigger>
                <SelectContent className={SELECT_POPUP}>
                  {METHODS.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Cell>
            <Cell label="Reference # (wire / check)" span={6} htmlFor="pay-ref">
              <Input
                id="pay-ref"
                className="h-8 font-mono"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </Cell>
            <Cell label="Notes" span={12} htmlFor="pay-notes">
              <Textarea
                id="pay-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Cell>
          </Grid>
          {over ? (
            <p className="text-tpe-gold-ink mt-3 text-xs font-medium">
              This is more than the balance — the excess shows as a credit on the buyer.
            </p>
          ) : null}
        </div>
        <SheetFooter className="flex-row items-center justify-end gap-2 border-t p-6">
          <Button variant="outline" size="sm" onClick={onClose} disabled={record.isPending}>
            Cancel
          </Button>
          <Button variant="blue" size="sm" onClick={save} disabled={record.isPending}>
            {record.isPending ? "Saving…" : "Record payment"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
