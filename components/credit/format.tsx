"use client";

// Small shared pieces for the credit surfaces: money, dates, and the coloured
// "days late" / "available" readouts, so the overview, the buyer page and the
// shipment's Payments card agree on how a number looks.

import { cn } from "@/lib/utils";

export const usd = (n: number, currency = "USD") =>
  n.toLocaleString("en-US", { style: "currency", currency, maximumFractionDigits: 2 });

export const usd0 = (n: number, currency = "USD") =>
  n.toLocaleString("en-US", { style: "currency", currency, maximumFractionDigits: 0 });

export const fmtDay = (iso: string | null | undefined) =>
  iso
    ? new Date(iso + (iso.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
      })
    : "—";

/** "12 days late" in red, "due in 5 days" muted, "due today". */
export function DaysLate({ days, open = true }: { days: number | null; open?: boolean }) {
  if (days == null || !open) return <span className="text-muted-foreground">—</span>;
  if (days > 0) return <span className="text-table-negative font-medium">{days} days late</span>;
  if (days === 0) return <span className="text-tpe-gold-ink font-medium">due today</span>;
  return <span className="text-muted-foreground">due in {-days} days</span>;
}

/** Available credit: red when negative, gold when under 20 % of the limit. */
export function Available({ value, limit }: { value: number; limit: number }) {
  const tone =
    value < 0
      ? "text-table-negative"
      : limit > 0 && value < limit * 0.2
        ? "text-tpe-gold-ink"
        : "text-table-positive";
  return <span className={cn("font-medium", tone)}>{usd0(value)}</span>;
}

/** Thin utilisation bar: exposure / limit. */
export function Utilisation({ exposure, limit }: { exposure: number; limit: number }) {
  if (limit <= 0) {
    return (
      <span className="text-muted-foreground text-xs">{exposure > 0 ? "no limit set" : "—"}</span>
    );
  }
  const pct = Math.min(100, Math.round((exposure / limit) * 100));
  const over = exposure > limit;
  return (
    <div className="flex items-center gap-2">
      <div className="bg-muted h-2 w-24 overflow-hidden rounded-full">
        <div
          className={cn(
            "h-full rounded-full",
            over ? "bg-table-negative" : pct >= 80 ? "bg-tpe-gold" : "bg-table-positive",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={cn("text-xs tabular-nums", over && "text-table-negative font-medium")}>
        {Math.round((exposure / limit) * 100)}%
      </span>
    </div>
  );
}

export const METHOD_LABELS: Record<string, string> = {
  wire: "Wire",
  ach: "ACH",
  check: "Check",
  credit_card: "Credit card",
  credit_note: "Credit note",
  write_off: "Write-off",
  other: "Other",
};
