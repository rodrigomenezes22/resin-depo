"use client";

// =============================================================================
// ContainerSheet — edit one container's booking + stuffing detail
// =============================================================================
// The per-box fields: the line's booking number for this container, the
// container and seal numbers applied at loading, what went in it, and its
// weights.
//
// WEIGHTS. All three are typeable, but they are not independent — the database
// holds `gross_weight_lbs` as a GENERATED column (net + tare) so a document can
// never state a gross that disagrees with its own parts. The sheet keeps that
// identity by deriving whichever field you are not typing in:
//
//   edit net or tare → gross recomputes
//   edit gross       → NET recomputes (gross − tare)
//
// Net derives from gross rather than the other way around because that is the
// weighbridge's order of operations: the scale reads gross, tare is stamped on
// the container door, and net is what falls out. Only net and tare are sent.
//
// Net weight opens preloaded with the CONTRACT weight when the box has not been
// weighed yet. A container is normally stuffed to its contract weight, so that
// is the right first guess — but it stays fully editable, because the scale
// ticket is what the Packing List and B/L have to state.
//
// UNITS. Weights are stored in pounds, always. The header toggle switches every
// weight on the sheet — including what you type — between lbs and kg, because
// the desk reads scale tickets in both depending on the origin port. Toggling
// converts the values in place through `lib/units.ts`, so the two directions
// share one factor and cannot drift apart.
// =============================================================================

import { useState } from "react";
import { toast } from "sonner";

import { Cell, Grid, SELECT_POPUP, SELECT_TRIGGER } from "@/components/bank/chrome";
import {
  PACKAGE_KINDS,
  PACKAGE_STUFFING_LBS,
  isStuffingWeightEditable,
  packageKindLabel,
  packagesForNetWeight,
} from "@/components/bank/export-shipments/package-kinds";
import type { ShipmentContainerRow } from "@/components/bank/export-shipments/types";
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
import { kilogramsToLbs, lbsToKilograms, UNIT_LABELS, type OrderUnit } from "@/lib/units";
import { cn } from "@/lib/utils";
import { ClientAPI } from "@/trpc/client";

/** "" → null, so clearing a field actually clears the column. */
const orNull = (v: string) => (v.trim() === "" ? null : v.trim());

/** `package_kind` is nullable; Select needs a real value for "no kind set". */
const NONE = "none";

type WeightUnit = "lbs" | "kg";

/**
 * Trim a converted number back to something a human would type. Three decimals
 * is past any scale's precision and keeps lbs → kg → lbs stable, so flipping
 * the toggle twice returns the value you started with rather than shedding a
 * pound each time.
 */
const tidy = (n: number): string => String(Number(n.toFixed(3)));

/** Field value (in `unit`) → pounds, the storage unit. */
function toLbs(value: string, unit: WeightUnit): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return unit === "kg" ? kilogramsToLbs(n) : n;
}

/** Pounds → a field value in `unit`. */
function fromLbs(lbs: number | null | undefined, unit: WeightUnit): string {
  if (lbs == null) return "";
  return tidy(unit === "kg" ? lbsToKilograms(lbs) : lbs);
}

/** Units a container leg may carry — mirrors CONTAINER_UNITS in the router. */
const LEG_UNITS = [
  "container",
  "heavy_container",
  "container_20",
  "container_40",
  "container_40hc",
] as const;

export function ContainerSheet({
  container,
  onClose,
  onSaved,
}: {
  container: ShipmentContainerRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [containerNumber, setContainerNumber] = useState(container.container_number ?? "");
  const [sealNumber, setSealNumber] = useState(container.seal_number ?? "");
  const [packageCount, setPackageCount] = useState(
    container.package_count == null ? "" : String(container.package_count),
  );
  const [packageKind, setPackageKind] = useState(container.package_kind || NONE);
  const [unit, setUnit] = useState<WeightUnit>("lbs");

  // The contract weight (matched_orders.quantity_lbs) prices the invoice and is
  // never edited here — it seeds the net weight and is shown beside it so the
  // preloaded number is not mistaken for a scale reading.
  const contractLbs =
    container.matched_orders?.quantity_lbs == null
      ? null
      : Number(container.matched_orders.quantity_lbs);

  // Weight fields hold their value in the CURRENTLY DISPLAYED unit; the toggle
  // converts them in place. Storage is always pounds (see the header note).
  const [netWeight, setNetWeight] = useState(
    container.net_weight_lbs != null
      ? String(container.net_weight_lbs)
      : contractLbs != null
        ? String(contractLbs)
        : "",
  );
  const [tareWeight, setTareWeight] = useState(
    container.tare_weight_lbs == null ? "" : String(container.tare_weight_lbs),
  );
  const [grossWeight, setGrossWeight] = useState(() => {
    const net = Number(container.net_weight_lbs ?? contractLbs ?? 0);
    const tare = Number(container.tare_weight_lbs ?? 0);
    return net + tare > 0 ? String(net + tare) : "";
  });
  const [marks, setMarks] = useState(container.marks_and_numbers ?? "");

  // The package count auto-fills from the net weight, but only while the desk
  // hasn't overridden it: once they type their own number we stop moving it
  // under them. Same "auto until you touch it" rule the Order Entry prefill
  // markers use.
  const [autoCount, setAutoCount] = useState<string | null>(null);
  const countIsAuto = packageCount === "" || packageCount === autoCount;

  // Per-package stuffing weight. Supersacks and boxes default to 1,500 lbs, but
  // a supplier who fills to 1,200 would otherwise force the desk to back-solve
  // the package count by hand — so the default is overridable, and the override
  // is stored on THIS container (`package_weight_lbs`). It is never inherited
  // by the next box: the pallet of 1,200 lb boxes is a fact about the one they
  // went into. Held in the displayed unit like the other weights.
  const [stuffingWeight, setStuffingWeight] = useState(
    container.package_weight_lbs == null ? "" : String(container.package_weight_lbs),
  );
  const [editingStuffing, setEditingStuffing] = useState(false);
  const stuffingLbs = stuffingWeight.trim() === "" ? null : toLbs(stuffingWeight, unit);
  /** What the count is actually being derived at, override or house default. */
  const effectiveStuffingLbs =
    stuffingLbs && stuffingLbs > 0 ? stuffingLbs : (PACKAGE_STUFFING_LBS[packageKind] ?? null);

  const update = ClientAPI.exportShipments.updateContainer.useMutation({ onSuccess: onSaved });

  // resin-depo: the contract line (leg unit + contract weight) is editable here
  // too — TPE reads it from the ledger. Saved through updateLeg alongside the
  // stuffing patch; the parent purchase totals follow.
  const updateLeg = ClientAPI.exportShipments.updateLeg.useMutation();
  const [contractInput, setContractInput] = useState(
    contractLbs == null ? "" : String(contractLbs),
  );
  const [legUnit, setLegUnit] = useState<string>(container.matched_orders?.unit ?? "container");

  const num = (v: string) => (v.trim() === "" ? 0 : Number(v) || 0);

  /** Recompute the package count from a net weight + kind, if it's still auto. */
  function syncCount(
    netInUnit: string,
    kind: string,
    force = false,
    perPackageLbs?: number | null,
  ) {
    if (!force && !countIsAuto) return;
    const per = perPackageLbs === undefined ? stuffingLbs : perPackageLbs;
    const next = packagesForNetWeight(toLbs(netInUnit, unit), kind === NONE ? null : kind, per);
    if (next == null) return;
    setPackageCount(String(next));
    setAutoCount(String(next));
  }

  function onNetChange(value: string) {
    setNetWeight(value);
    setGrossWeight(
      value.trim() === "" && tareWeight.trim() === "" ? "" : tidy(num(value) + num(tareWeight)),
    );
    syncCount(value, packageKind);
  }

  function onTareChange(value: string) {
    setTareWeight(value);
    setGrossWeight(
      netWeight.trim() === "" && value.trim() === "" ? "" : tidy(num(netWeight) + num(value)),
    );
  }

  /** Gross is the scale reading; net is what's left after the container's tare. */
  function onGrossChange(value: string) {
    setGrossWeight(value);
    if (value.trim() === "") return;
    const net = Math.max(0, num(value) - num(tareWeight));
    setNetWeight(tidy(net));
    syncCount(tidy(net), packageKind);
  }

  function onKindChange(kind: string) {
    setPackageKind(kind);
    // Switching kind drops any override: "1,200 lbs" was a fact about the
    // boxes, and it says nothing about supersacks.
    setStuffingWeight("");
    setEditingStuffing(false);
    // An explicit pick re-derives the count even if the desk had typed one:
    // choosing "Boxes" is a statement about how the box is packed, so the
    // count that follows from it is the answer they just asked for.
    syncCount(netWeight, kind, true, null);
  }

  /** An explicit stuffing weight re-derives the count, same as picking a kind. */
  function onStuffingChange(value: string) {
    setStuffingWeight(value);
    const per = value.trim() === "" ? null : toLbs(value, unit);
    syncCount(netWeight, packageKind, true, per);
  }

  function onUnitChange(next: WeightUnit) {
    if (next === unit) return;
    const convert = (v: string) => (v.trim() === "" ? "" : fromLbs(toLbs(v, unit), next));
    setNetWeight(convert(netWeight));
    setTareWeight(convert(tareWeight));
    setGrossWeight(convert(grossWeight));
    setStuffingWeight(convert(stuffingWeight));
    setUnit(next);
  }

  const suffix = unit === "kg" ? "(kg)" : "(lbs)";

  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="p-6 pb-4">
          <SheetTitle className="text-base">Container {container.position}</SheetTitle>
          <SheetDescription>
            Booking, stuffing and weights for this container. Net weight starts at the contract
            weight — overwrite it with the scale ticket. The contract weight itself prices the
            invoice and stays on the transaction.
          </SheetDescription>
          {/* Weights are stored in pounds whichever way this is set — it
              switches both the display and what the inputs below mean. */}
          <div className="flex items-center gap-2 pt-1">
            <span className="text-muted-foreground text-xs">Weights in</span>
            <div className="border-border inline-flex overflow-hidden rounded-md border">
              {(["lbs", "kg"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  aria-pressed={unit === u}
                  onClick={() => onUnitChange(u)}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium transition-colors",
                    unit === u
                      ? "bg-tpe-gold text-[#171717]"
                      : "bg-background hover:bg-muted text-foreground",
                  )}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
        </SheetHeader>

        <div className="px-6 pb-6">
          <Grid>
            <Cell label="Container #" span={6} htmlFor="c-number">
              <Input
                id="c-number"
                className="h-8 font-mono"
                placeholder="MSKU1184470"
                value={containerNumber}
                onChange={(e) => setContainerNumber(e.target.value)}
              />
            </Cell>
            <Cell label="Seal #" span={6} htmlFor="c-seal">
              <Input
                id="c-seal"
                className="h-8 font-mono"
                value={sealNumber}
                onChange={(e) => setSealNumber(e.target.value)}
              />
            </Cell>
            {/* Count and kind are one fact — "880 25 kg Bags" — so they stay on
                one line. A nested full-width grid, not two loose cells: the seal
                above leaves 6 columns free, and bare cells would auto-place the
                count beside the seal and wrap the kind onto its own row. */}
            <Grid className="col-span-12">
              <Cell label="Packages" span={4} htmlFor="c-packages">
                <Input
                  id="c-packages"
                  type="number"
                  min={1}
                  className="h-8"
                  value={packageCount}
                  onChange={(e) => setPackageCount(e.target.value)}
                />
              </Cell>
              <Cell label="Package kind" span={8}>
                <Select value={packageKind} onValueChange={(v) => v && onKindChange(v)}>
                  <SelectTrigger className="h-8" aria-label="Package kind">
                    <SelectValue>
                      {packageKind === NONE ? "—" : packageKindLabel(packageKind)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {PACKAGE_KINDS.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* Sits INSIDE the kind cell so the count and the select stay
                    on one line — Cell stacks its children, so this grows the
                    row downward rather than shifting the select. */}
                {isStuffingWeightEditable(packageKind) &&
                  (editingStuffing ? (
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <Input
                        id="c-stuffing"
                        aria-label="Weight per package"
                        type="number"
                        min={0}
                        autoFocus
                        className="h-7 w-24 text-xs"
                        placeholder={String(PACKAGE_STUFFING_LBS[packageKind] ?? "")}
                        value={stuffingWeight}
                        onChange={(e) => onStuffingChange(e.target.value)}
                      />
                      <span className="text-muted-foreground text-xs">{unit} each</span>
                      <button
                        type="button"
                        className="text-table-link text-xs underline underline-offset-2"
                        onClick={() => setEditingStuffing(false)}
                      >
                        Done
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="text-muted-foreground pt-0.5 text-left text-xs"
                      onClick={() => setEditingStuffing(true)}
                    >
                      {effectiveStuffingLbs == null
                        ? null
                        : `${Number(fromLbs(effectiveStuffingLbs, unit)).toLocaleString("en-US")} ${unit} each · `}
                      <span className="text-table-link underline underline-offset-2">
                        Edit weight
                      </span>
                    </button>
                  ))}
              </Cell>
            </Grid>

            <Cell label="Container unit" span={3}>
              <Select value={legUnit} onValueChange={(v) => v && setLegUnit(v)}>
                <SelectTrigger className={SELECT_TRIGGER} aria-label="Container unit">
                  <SelectValue>{UNIT_LABELS[legUnit as OrderUnit] ?? legUnit}</SelectValue>
                </SelectTrigger>
                <SelectContent className={SELECT_POPUP}>
                  {LEG_UNITS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {UNIT_LABELS[u]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Cell>
            <Cell label="Contract weight (lbs)" span={3} htmlFor="c-contract">
              <Input
                id="c-contract"
                type="number"
                min={0}
                step="1"
                className="h-8"
                value={contractInput}
                onChange={(e) => setContractInput(e.target.value)}
              />
            </Cell>
            <Cell label={`Net weight ${suffix}`} span={6} htmlFor="c-net">
              <Input
                id="c-net"
                type="number"
                min={0}
                className="h-8"
                value={netWeight}
                onChange={(e) => onNetChange(e.target.value)}
              />
            </Cell>
            <Cell label={`Tare weight ${suffix}`} span={6} htmlFor="c-tare">
              <Input
                id="c-tare"
                type="number"
                min={0}
                className="h-8"
                value={tareWeight}
                onChange={(e) => onTareChange(e.target.value)}
              />
            </Cell>
            <Cell label={`Gross weight ${suffix}`} span={6} htmlFor="c-gross">
              <Input
                id="c-gross"
                type="number"
                min={0}
                className="h-8"
                value={grossWeight}
                onChange={(e) => onGrossChange(e.target.value)}
              />
            </Cell>
            <Cell label="Marks &amp; numbers" span={12} htmlFor="c-marks">
              <Textarea
                id="c-marks"
                rows={2}
                value={marks}
                onChange={(e) => setMarks(e.target.value)}
              />
            </Cell>
          </Grid>
        </div>

        <SheetFooter className="flex-row items-center justify-end gap-2 border-t p-6">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="blue"
            size="sm"
            disabled={update.isPending || updateLeg.isPending}
            onClick={async () => {
              const legId = container.matched_orders?.id;
              const nextLbs = contractInput.trim() === "" ? null : Number(contractInput);
              const legChanged =
                legId &&
                ((nextLbs != null && nextLbs > 0 && nextLbs !== contractLbs) ||
                  legUnit !== container.matched_orders?.unit);
              if (legChanged) {
                try {
                  await updateLeg.mutateAsync({
                    matchedOrderId: legId,
                    unit: legUnit as (typeof LEG_UNITS)[number],
                    quantityLbs: nextLbs != null && nextLbs > 0 ? nextLbs : undefined,
                  });
                } catch (e) {
                  toast.error(
                    e instanceof Error ? e.message : "Could not update the contract line.",
                  );
                  return;
                }
              }
              update.mutate({
                id: container.id,
                containerNumber: orNull(containerNumber),
                sealNumber: orNull(sealNumber),
                packageCount: packageCount.trim() === "" ? null : Number(packageCount),
                packageKind: packageKind === NONE ? null : packageKind,
                // Null clears it, so the container falls back to the house
                // default for its kind rather than keeping a stale override.
                packageWeightLbs: toLbs(stuffingWeight, unit),
                // Gross is not sent — the column is GENERATED from these two.
                netWeightLbs: toLbs(netWeight, unit),
                tareWeightLbs: toLbs(tareWeight, unit),
                marksAndNumbers: orNull(marks),
              });
            }}
          >
            {update.isPending || updateLeg.isPending ? "Saving…" : "Update Container"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
