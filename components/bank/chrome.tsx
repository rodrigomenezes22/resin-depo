"use client";

// =============================================================================
// Shared chrome for the Transaction Details sections
// =============================================================================
// Dense-form conventions (docs/figma-design-system.md §4 — "Dense forms use
// 14px"): every section is a 12-column grid, controls are h-8, labels are 12px
// uppercase-ish muted. Fields declare their span, so a section packs several
// controls per row instead of the old 4-up grid with gap-4 gutters.
// =============================================================================

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { SHIP_STATUSES, SHIP_STATUS_LABELS } from "./ship-status";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { SELECTABLE_UNITS, UNIT_LABELS } from "@/lib/units";

// Re-exported so the transaction-detail components keep importing unit display
// helpers from one place (`./chrome`) rather than reaching into lib/units.
export { UNIT_LABELS };

export const DASH = "—";

// Base UI's Select is sized for a toolbar, not for a form grid: the trigger is
// `w-fit` (so it stops short of its Cell) and the popup is pinned to
// `w-(--anchor-width)` with `overflow-x-hidden`, which shears the right-hand
// side off long items — "Port of Los Angeles (USLAX)" reads as "Port of Los A…".
// Dense-form selects pass these two instead: the trigger fills its Cell, and
// the popup starts at the trigger's width but may grow to its longest item.
export const SELECT_TRIGGER = "h-8 w-full";
export const SELECT_POPUP = "w-auto min-w-(--anchor-width) max-w-[min(32rem,calc(100vw-2rem))]";

// `[value, label]` for the Shipment Details Unit dropdown. Driven by
// SELECTABLE_UNITS, not by all of UNIT_LABELS: the retired packagings (barrel,
// supersacks, 25 kg bags) must still RENDER on historic rows — which is why
// UNIT_LABELS stays complete — but must not be offered on a live shipment.
export const UNIT_OPTIONS: [string, string][] = SELECTABLE_UNITS.map((u) => [u, UNIT_LABELS[u]]);

export const PAYMENT_TERMS = [
  "Net 30 days from shipment",
  "Net 45 days from shipment",
  "Net 60 days from shipment",
  "Prepay",
  "COD",
];

export const SHIPPING_TERMS = [
  "FOB Delivered",
  "FOB Shipping",
  "CFR",
  "CIF",
  "FAS",
  "FCA",
  "FOB",
  "DDP",
];

export const QUALITIES: [string, string][] = [
  ["prime", "Prime"],
  ["offgrade", "Offgrade"],
  ["regrind", "Scrap/Regrind/Repro"],
];

// Shipment Details → Status. The vocabulary lives in components/bank/ship-status
// (shared with the Transaction Summary ledger chip); re-exported so the detail
// components keep importing everything from `./chrome`.
export { SHIP_STATUSES, SHIP_STATUS_LABELS };

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
export const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
export const lbs = (n: number) => Math.round(n).toLocaleString("en-US");

/** A collapsible section card with its own Update button in the header. */
export function Section({
  title,
  subtitle,
  icon: Icon,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="surface-light bg-card overflow-hidden rounded-lg border">
      <div className="flex w-full items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 text-left"
        >
          <Icon className="text-tpe-gold-ink size-4 shrink-0" />
          <span>
            <span className="block text-sm font-semibold">{title}</span>
            {subtitle && <span className="text-muted-foreground block text-xs">{subtitle}</span>}
          </span>
        </button>
        <div className="flex items-center gap-2">
          {actions}
          <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Toggle section">
            <ChevronDown
              className={cn(
                "text-muted-foreground size-4 transition-transform",
                !open && "-rotate-90",
              )}
            />
          </button>
        </div>
      </div>
      {open && <div className="flex flex-col gap-3 border-t px-3 py-3">{children}</div>}
    </div>
  );
}

/** The 12-column dense row. Children set their own `span-*` via <Cell>. */
export function Grid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-12 gap-x-3 gap-y-2", className)}>{children}</div>;
}

const SPANS: Record<number, string> = {
  // 1 is for short numerics (melt, density) that only ever hold four
  // characters — a third of the row on mobile, where 1/12 would be unusable.
  1: "col-span-4 sm:col-span-1",
  2: "col-span-6 sm:col-span-2",
  3: "col-span-6 sm:col-span-3",
  4: "col-span-6 sm:col-span-4",
  6: "col-span-12 sm:col-span-6",
  8: "col-span-12 sm:col-span-8",
  12: "col-span-12",
};

/** A labelled cell in the dense grid. `span` is in 12-col units (sm and up). */
export function Cell({
  label,
  span = 3,
  htmlFor,
  children,
}: {
  label: string;
  span?: 1 | 2 | 3 | 4 | 6 | 8 | 12;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1", SPANS[span])}>
      <Label htmlFor={htmlFor} className="text-muted-foreground text-xs">
        {label}
      </Label>
      {children}
    </div>
  );
}

/** Read-only value styled to sit at the same height as an h-8 input. */
export function ReadValue({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-8 items-center text-sm font-medium">
      {children === null || children === undefined || children === "" ? DASH : children}
    </div>
  );
}

/** Legacy Prime / Problem toggles. There is no shadcn Checkbox in this repo. */
export function CheckField({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex h-8 items-center gap-2 text-sm font-medium">
      <input
        type="checkbox"
        className="size-4"
        checked={checked}
        disabled={disabled || !onChange}
        onChange={(e) => onChange?.(e.target.checked)}
      />
      {label}
    </label>
  );
}

/** The per-section save button. Blue = transactional (design system §4). */
export function UpdateButton({
  label = "Update",
  pending,
  onClick,
}: {
  label?: string;
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <Button variant="blue" size="sm" disabled={pending} onClick={onClick}>
      {pending ? "Saving…" : label}
    </Button>
  );
}
