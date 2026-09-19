"use client";

// =============================================================================
// DealSheet — the trade line behind a container (resin-depo)
// =============================================================================
// TPE never needed this drawer: a container joins a shipment from the ledger,
// where the matched order already exists. resin-depo has no ledger, so this is
// where the export desk types the deal — buyer, product, contract weight,
// price, terms — and the server writes it in TPE's matched_orders shape and
// puts it on the manifest in one call (`exportShipments.createContainer`).
//
// The same drawer edits the deal later (`updateDeal`), opened from the order
// number on the manifest where TPE linked to the Transaction Summary.
//
// Stuffing detail (container no., seal, packages, net/tare) stays in
// ContainerSheet, exactly as in TPE. Two drawers, two concerns: what was SOLD
// vs what was LOADED.
// =============================================================================

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import {
  Cell,
  Grid,
  PAYMENT_TERMS,
  QUALITIES,
  SELECT_POPUP,
  SELECT_TRIGGER,
} from "@/components/bank/chrome";
import type {
  ShipmentContainerRow,
  ShipmentGroupRow,
} from "@/components/bank/export-shipments/types";
import { PartySheet } from "@/components/settings/party-sheet";
import { ProductSheet } from "@/components/settings/products";
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
import { LBS_PER_UNIT, UNIT_LABELS, type OrderUnit } from "@/lib/units";
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

const NONE = "__none__";

export function DealSheet({
  group,
  container,
  onClose,
  onSaved,
}: {
  group: ShipmentGroupRow;
  /** Existing container whose deal is being edited; omit to add a new one. */
  container?: ShipmentContainerRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const deal = container?.matched_orders ?? null;
  const editing = Boolean(deal);

  const [orderNumber, setOrderNumber] = useState(deal ? String(deal.display_number) : "");
  const [legacyNumber, setLegacyNumber] = useState(deal?.legacy_number ?? "");
  const [buyerId, setBuyerId] = useState(deal?.buyer_company_id ?? NONE);
  const [productId, setProductId] = useState(deal?.product_id ?? NONE);
  const [unit, setUnit] = useState<ContainerUnit>(
    (CONTAINER_UNITS as readonly string[]).includes(deal?.unit ?? "")
      ? (deal!.unit as ContainerUnit)
      : "container",
  );
  const [qty, setQty] = useState(deal ? String(Number(deal.qty)) : "1");
  const [quantityLbs, setQuantityLbs] = useState(
    deal ? String(Number(deal.quantity_lbs)) : String(LBS_PER_UNIT.container),
  );
  const [lbsTouched, setLbsTouched] = useState(editing);
  const [price, setPrice] = useState(deal ? String(Number(deal.tpe_sell_price)) : "");
  const [quality, setQuality] = useState(deal?.quality ?? "prime");
  const [buyerTerms, setBuyerTerms] = useState(deal?.buyer_terms ?? PAYMENT_TERMS[0]);
  const [buyerPo, setBuyerPo] = useState(deal?.buyer_po ?? "");
  const [shippingTerms, setShippingTerms] = useState(deal?.shipping_terms ?? group.incoterm);
  const [tolerance, setTolerance] = useState(
    deal?.tolerance_pct == null ? "5" : String(Number(deal.tolerance_pct)),
  );
  const [insurance, setInsurance] = useState(deal?.insurance_terms ?? "");
  const [window_, setWindow] = useState(deal?.shipment_window ?? "");
  const [notes, setNotes] = useState(deal?.notes ?? "");

  const [newParty, setNewParty] = useState(false);
  const [newProduct, setNewProduct] = useState(false);

  const utils = ClientAPI.useUtils();
  const buyers = ClientAPI.reference.parties.list.useQuery({});
  const products = ClientAPI.reference.products.list.useQuery();
  const create = ClientAPI.exportShipments.createContainer.useMutation();
  const update = ClientAPI.exportShipments.updateDeal.useMutation();
  const pending = create.isPending || update.isPending;

  // Buyers first, then everyone else — a notify party is sometimes the
  // consignee's forwarder, and the desk should not have to reclassify it.
  const buyerOptions = useMemo(() => {
    const rows = buyers.data ?? [];
    return [...rows.filter((r) => r.role === "buyer"), ...rows.filter((r) => r.role !== "buyer")];
  }, [buyers.data]);

  function onUnitChange(next: ContainerUnit) {
    setUnit(next);
    if (!lbsTouched) setQuantityLbs(String(LBS_PER_UNIT[next] * (Number(qty) || 1)));
  }
  function onQtyChange(next: string) {
    setQty(next);
    if (!lbsTouched) setQuantityLbs(String(LBS_PER_UNIT[unit] * (Number(next) || 0)));
  }

  const contractMt = (Number(quantityLbs) || 0) / 2204.62;
  const value = (Number(quantityLbs) || 0) * (Number(price) || 0);

  async function save() {
    if (buyerId === NONE) return void toast.error("Choose the buyer.");
    if (productId === NONE) return void toast.error("Choose the product.");
    if (!(Number(quantityLbs) > 0)) return void toast.error("Contract weight must be positive.");
    if (price.trim() === "" || Number(price) < 0) return void toast.error("Enter the sell price.");

    const fields = {
      orderNumber: orderNumber.trim() ? Number(orderNumber) : undefined,
      legacyNumber: legacyNumber.trim() || null,
      buyerOrgId: buyerId,
      productId,
      unit,
      qty: Number(qty) || 1,
      quantityLbs: Number(quantityLbs),
      sellPricePerLb: Number(price),
      quality: quality as "prime" | "offgrade" | "regrind",
      buyerTerms: buyerTerms || null,
      buyerPo: buyerPo.trim() || null,
      shippingTerms: shippingTerms || null,
      tolerancePct: Number(tolerance) || 0,
      insuranceTerms: insurance.trim() || null,
      shipmentWindow: window_.trim() || null,
      notes: notes.trim() || null,
    };
    try {
      if (deal) {
        await update.mutateAsync({ matchedOrderId: deal.id, ...fields });
        toast.success("Deal updated");
      } else {
        const r = await create.mutateAsync({ groupId: group.id, ...fields });
        toast.success(`Container added — order #${r.displayNumber}`);
      }
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the deal.");
    }
  }

  return (
    <>
      <Sheet open onOpenChange={(next) => !next && onClose()}>
        <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
          <SheetHeader className="p-6 pb-4">
            <SheetTitle className="text-base">
              {editing ? `Deal — container ${container!.position}` : "Add container"}
            </SheetTitle>
            <SheetDescription>
              {editing
                ? "The trade line this container carries. Contract weight prices the invoice; loaded weights live in the container drawer."
                : "One container = one trade line. Enter what was sold; stuff the box (container no., seal, weights) afterwards from the manifest."}
            </SheetDescription>
          </SheetHeader>

          <div className="form-contrast flex flex-col gap-4 px-6 pb-6">
            <Grid>
              <Cell label="Order #" span={4} htmlFor="d-order">
                <Input
                  id="d-order"
                  type="number"
                  min={1}
                  className="h-8 font-mono"
                  placeholder="auto"
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                />
              </Cell>
              <Cell label="Legacy ref" span={4} htmlFor="d-legacy">
                <Input
                  id="d-legacy"
                  className="h-8"
                  value={legacyNumber}
                  onChange={(e) => setLegacyNumber(e.target.value)}
                />
              </Cell>
              <Cell label="Buyer PO" span={4} htmlFor="d-po">
                <Input
                  id="d-po"
                  className="h-8"
                  value={buyerPo}
                  onChange={(e) => setBuyerPo(e.target.value)}
                />
              </Cell>

              <Cell label="Buyer / consignee" span={12}>
                <div className="flex gap-1">
                  <Select value={buyerId} onValueChange={(v) => v && setBuyerId(v)}>
                    <SelectTrigger className={SELECT_TRIGGER} aria-label="Buyer">
                      <SelectValue>
                        {buyerId === NONE
                          ? "Choose…"
                          : (buyerOptions.find((b) => b.id === buyerId)?.name ??
                            deal?.buyer_company_text ??
                            "—")}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className={SELECT_POPUP}>
                      {buyerOptions.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                          {b.role !== "buyer" ? (
                            <span className="text-muted-foreground ml-1 text-xs">({b.role})</span>
                          ) : null}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => setNewParty(true)}
                    aria-label="New party"
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>
              </Cell>

              <Cell label="Product / grade" span={8}>
                <div className="flex gap-1">
                  <Select value={productId} onValueChange={(v) => v && setProductId(v)}>
                    <SelectTrigger className={SELECT_TRIGGER} aria-label="Product">
                      <SelectValue>
                        {productId === NONE
                          ? "Choose…"
                          : (products.data?.find((p) => p.id === productId)?.name ??
                            deal?.product_text ??
                            "—")}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className={SELECT_POPUP}>
                      {(products.data ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                          {p.hs_code ? (
                            <span className="text-muted-foreground ml-1 font-mono text-xs">
                              {p.hs_code}
                            </span>
                          ) : null}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => setNewProduct(true)}
                    aria-label="New product"
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>
              </Cell>
              <Cell label="Quality" span={4}>
                <Select value={quality} onValueChange={(v) => v && setQuality(v)}>
                  <SelectTrigger className={SELECT_TRIGGER} aria-label="Quality">
                    <SelectValue>{QUALITIES.find(([v]) => v === quality)?.[1]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent className={SELECT_POPUP}>
                    {QUALITIES.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Cell>

              <Cell label="Unit" span={6}>
                <Select value={unit} onValueChange={(v) => v && onUnitChange(v as ContainerUnit)}>
                  <SelectTrigger className={SELECT_TRIGGER} aria-label="Unit">
                    <SelectValue>{UNIT_LABELS[unit as OrderUnit]}</SelectValue>
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
              <Cell label="Qty" span={2} htmlFor="d-qty">
                <Input
                  id="d-qty"
                  type="number"
                  min={1}
                  step="1"
                  className="h-8"
                  value={qty}
                  onChange={(e) => onQtyChange(e.target.value)}
                />
              </Cell>
              <Cell label="Contract lbs" span={4} htmlFor="d-lbs">
                <Input
                  id="d-lbs"
                  type="number"
                  min={0}
                  step="1"
                  className="h-8"
                  value={quantityLbs}
                  onChange={(e) => {
                    setLbsTouched(true);
                    setQuantityLbs(e.target.value);
                  }}
                />
              </Cell>

              <Cell label="Price $/lb" span={4} htmlFor="d-price">
                <Input
                  id="d-price"
                  type="number"
                  min={0}
                  step="0.0001"
                  className="h-8"
                  placeholder="0.6900"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </Cell>
              <Cell label="Contract (MT)" span={4}>
                <div className="flex h-8 items-center text-sm font-medium">
                  {contractMt.toLocaleString("en-US", {
                    minimumFractionDigits: 3,
                    maximumFractionDigits: 3,
                  })}
                </div>
              </Cell>
              <Cell label="Line value" span={4}>
                <div className="flex h-8 items-center text-sm font-medium">
                  {value.toLocaleString("en-US", { style: "currency", currency: group.currency })}
                </div>
              </Cell>

              <Cell label="Payment terms" span={6}>
                <Select value={buyerTerms} onValueChange={(v) => v && setBuyerTerms(v)}>
                  <SelectTrigger className={SELECT_TRIGGER} aria-label="Payment terms">
                    <SelectValue>{buyerTerms}</SelectValue>
                  </SelectTrigger>
                  <SelectContent className={SELECT_POPUP}>
                    {[...new Set([buyerTerms, ...PAYMENT_TERMS])].filter(Boolean).map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Cell>
              <Cell label="Ship terms" span={3} htmlFor="d-ship">
                <Input
                  id="d-ship"
                  className="h-8"
                  value={shippingTerms}
                  onChange={(e) => setShippingTerms(e.target.value)}
                />
              </Cell>
              <Cell label="Tolerance %" span={3} htmlFor="d-tol">
                <Input
                  id="d-tol"
                  type="number"
                  min={0}
                  max={100}
                  step="0.5"
                  className="h-8"
                  value={tolerance}
                  onChange={(e) => setTolerance(e.target.value)}
                />
              </Cell>
              <Cell label="Insurance terms" span={6} htmlFor="d-ins">
                <Input
                  id="d-ins"
                  className="h-8"
                  placeholder="Buyer's account"
                  value={insurance}
                  onChange={(e) => setInsurance(e.target.value)}
                />
              </Cell>
              <Cell label="Shipment window" span={6} htmlFor="d-window">
                <Input
                  id="d-window"
                  className="h-8"
                  placeholder="October 2026"
                  value={window_}
                  onChange={(e) => setWindow(e.target.value)}
                />
              </Cell>
              <Cell label="Notes" span={12} htmlFor="d-notes">
                <Textarea
                  id="d-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </Cell>
            </Grid>
          </div>

          <SheetFooter className="flex-row items-center justify-end gap-2 border-t p-6">
            <Button variant="outline" size="sm" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button variant="blue" size="sm" onClick={save} disabled={pending}>
              {pending ? "Saving…" : editing ? "Save deal" : "Add container"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {newParty ? (
        <PartySheet
          onClose={() => setNewParty(false)}
          onSaved={(p) => {
            setNewParty(false);
            setBuyerId(p.id);
            void utils.reference.parties.invalidate();
            void utils.reference.carriers.invalidate();
          }}
        />
      ) : null}
      {newProduct ? (
        <ProductSheet
          onClose={() => setNewProduct(false)}
          onSaved={(p) => {
            setNewProduct(false);
            setProductId(p.id);
            void utils.reference.products.invalidate();
          }}
        />
      ) : null}
    </>
  );
}
