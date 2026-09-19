"use client";

// =============================================================================
// AddContainerSheet — mint containers under the shipment's purchase (resin-depo)
// =============================================================================
// The physical half of TPE's conversion drawer: unit, how many, contract
// weight per box, packaging. Buyer / product / prices / terms are NOT here —
// they live on the Purchase card and every leg inherits them
// (exportShipments.createContainer). Container number, seal and loaded
// weights come later, in the container sheet, as in TPE.
// =============================================================================

import { useState } from "react";
import { toast } from "sonner";

import { Cell, Grid, SELECT_POPUP, SELECT_TRIGGER } from "@/components/bank/chrome";
import {
  PACKAGE_KINDS,
  PACKAGE_STUFFING_LBS,
  isStuffingWeightEditable,
  packagesForNetWeight,
} from "@/components/bank/export-shipments/package-kinds";
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
import { LBS_PER_UNIT, UNIT_LABELS, lbsToMetricTons } from "@/lib/units";
import { ClientAPI } from "@/trpc/client";

/** Mirrors CONTAINER_UNITS in the router / the DB guard trigger. */
const CONTAINER_UNITS = [
  "container",
  "heavy_container",
  "container_20",
  "container_40",
  "container_40hc",
] as const;
type ContainerUnit = (typeof CONTAINER_UNITS)[number];
const NONE = "none";

export function AddContainerSheet({
  groupId,
  onClose,
  onSaved,
}: {
  groupId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [unit, setUnit] = useState<ContainerUnit>("container_40hc");
  const [count, setCount] = useState("1");
  const [lbsPerBox, setLbsPerBox] = useState(String(LBS_PER_UNIT.container_40hc));
  const [lbsTouched, setLbsTouched] = useState(false);
  const [packageKind, setPackageKind] = useState<string>("supersacks");
  const [stuffing, setStuffing] = useState("");
  const [packages, setPackages] = useState("");
  const [packagesTouched, setPackagesTouched] = useState(false);
  const [marks, setMarks] = useState("");

  const create = ClientAPI.exportShipments.createContainer.useMutation();

  const kind = packageKind === NONE ? null : packageKind;
  const stuffingLbs = stuffing.trim() ? Number(stuffing) : undefined;
  const autoPackages = kind
    ? packagesForNetWeight(Number(lbsPerBox) || 0, kind, stuffingLbs)
    : null;
  const effectivePackages = packagesTouched && packages !== "" ? Number(packages) : autoPackages;

  function onUnitChange(next: ContainerUnit) {
    setUnit(next);
    if (!lbsTouched) setLbsPerBox(String(LBS_PER_UNIT[next]));
  }

  const n = Math.max(1, Math.min(20, Math.round(Number(count) || 1)));
  const totalLbs = n * (Number(lbsPerBox) || 0);

  async function save() {
    if (!(Number(lbsPerBox) > 0)) return void toast.error("Contract weight must be positive.");
    try {
      await create.mutateAsync({
        groupId,
        unit,
        count: n,
        quantityLbs: Number(lbsPerBox),
        packageKind: kind,
        packageCount: kind && effectivePackages ? effectivePackages : null,
        packageWeightLbs:
          kind && isStuffingWeightEditable(kind) && stuffingLbs ? stuffingLbs : null,
        marksAndNumbers: marks.trim() || null,
      });
      toast.success(n === 1 ? "Container added" : `${n} containers added`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add the containers.");
    }
  }

  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="p-6 pb-4">
          <SheetTitle className="text-base">Add containers</SheetTitle>
          <SheetDescription>
            Each container inherits the Purchase (buyer, product, prices, terms). Enter the box
            itself here; container no., seal and loaded weights are stuffed in later from the
            manifest.
          </SheetDescription>
        </SheetHeader>

        <div className="px-6 pb-6">
          <Grid>
            <Cell label="Unit" span={8}>
              <Select value={unit} onValueChange={(v) => v && onUnitChange(v as ContainerUnit)}>
                <SelectTrigger className={SELECT_TRIGGER} aria-label="Unit">
                  <SelectValue>{UNIT_LABELS[unit]}</SelectValue>
                </SelectTrigger>
                <SelectContent className={SELECT_POPUP}>
                  {CONTAINER_UNITS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {UNIT_LABELS[u]}
                      <span className="text-muted-foreground ml-1 text-xs">
                        {LBS_PER_UNIT[u].toLocaleString("en-US")} lb
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Cell>
            <Cell label="How many" span={4} htmlFor="ac-count">
              <Input
                id="ac-count"
                type="number"
                min={1}
                max={20}
                step="1"
                className="h-8"
                value={count}
                onChange={(e) => setCount(e.target.value)}
              />
            </Cell>

            <Cell label="Contract lbs per container" span={6} htmlFor="ac-lbs">
              <Input
                id="ac-lbs"
                type="number"
                min={0}
                step="1"
                className="h-8"
                value={lbsPerBox}
                onChange={(e) => {
                  setLbsTouched(true);
                  setLbsPerBox(e.target.value);
                }}
              />
            </Cell>
            <Cell label="Total" span={6}>
              <div className="flex h-8 items-center text-sm font-medium">
                {totalLbs
                  ? `${Math.round(totalLbs).toLocaleString("en-US")} lb · ${lbsToMetricTons(totalLbs).toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} MT`
                  : "—"}
              </div>
            </Cell>

            <Cell label="Package kind" span={6}>
              <Select
                value={packageKind}
                onValueChange={(v) => {
                  if (!v) return;
                  setPackageKind(v);
                  setStuffing("");
                  setPackagesTouched(false);
                }}
              >
                <SelectTrigger className={SELECT_TRIGGER} aria-label="Package kind">
                  <SelectValue>
                    {kind ? PACKAGE_KINDS.find(([v]) => v === kind)?.[1] : "Not packaged"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className={SELECT_POPUP}>
                  <SelectItem value={NONE}>Not packaged</SelectItem>
                  {PACKAGE_KINDS.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Cell>
            <Cell label="Packages per container" span={6} htmlFor="ac-packages">
              <Input
                id="ac-packages"
                type="number"
                min={1}
                step="1"
                className="h-8"
                disabled={!kind}
                value={packagesTouched ? packages : (autoPackages ?? "")}
                onChange={(e) => {
                  setPackagesTouched(true);
                  setPackages(e.target.value);
                }}
              />
            </Cell>
            {kind && isStuffingWeightEditable(kind) ? (
              <Cell label="Weight per package (lb)" span={6} htmlFor="ac-stuffing">
                <Input
                  id="ac-stuffing"
                  type="number"
                  min={0}
                  step="1"
                  className="h-8"
                  placeholder={String(
                    PACKAGE_STUFFING_LBS[kind as keyof typeof PACKAGE_STUFFING_LBS] ?? "",
                  )}
                  value={stuffing}
                  onChange={(e) => {
                    setStuffing(e.target.value);
                    setPackagesTouched(false);
                  }}
                />
              </Cell>
            ) : null}
            <Cell label="Marks & numbers" span={12} htmlFor="ac-marks">
              <Textarea
                id="ac-marks"
                rows={2}
                value={marks}
                onChange={(e) => setMarks(e.target.value)}
              />
            </Cell>
          </Grid>
        </div>

        <SheetFooter className="flex-row items-center justify-end gap-2 border-t p-6">
          <Button variant="outline" size="sm" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button variant="blue" size="sm" onClick={save} disabled={create.isPending}>
            {create.isPending ? "Adding…" : n === 1 ? "Add container" : `Add ${n} containers`}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
