"use client";

// =============================================================================
// Purchase — the deal behind a shipment (resin-depo)
// =============================================================================
// TPE's shipment page starts at the Booking because the deal already exists in
// its ledger. resin-depo has no ledger, so the deal is entered HERE, once per
// shipment: buyer, product, prices and terms. It is stored as a parent
// matched_orders row (exportShipments.upsertDeal) and every container added
// afterwards is a conversion leg of it — the same shape TPE's
// convert_matched_order produces — so the documents keep reading buyer / terms
// / prices off each container's leg exactly as they do in TPE.
//
// Saving again pushes the shared fields down to every existing leg.
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import { Plus, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

import {
  Cell,
  Grid,
  PAYMENT_TERMS,
  QUALITIES,
  ReadValue,
  SELECT_POPUP,
  SELECT_TRIGGER,
  Section,
  UpdateButton,
} from "@/components/bank/chrome";
import type { ShipmentGroupRow } from "@/components/bank/export-shipments/types";
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
import { Textarea } from "@/components/ui/textarea";
import { lbsToMetricTons } from "@/lib/units";
import { ClientAPI } from "@/trpc/client";

const INCOTERMS = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "DAP", "DDP"] as const;
type Incoterm = (typeof INCOTERMS)[number];
const NONE = "__none__";

const money = (n: number, currency: string) =>
  n.toLocaleString("en-US", { style: "currency", currency, maximumFractionDigits: 2 });
const lbs = (n: number) => Math.round(n).toLocaleString("en-US");

export function Purchase({ group, onSaved }: { group: ShipmentGroupRow; onSaved: () => void }) {
  const deal = group.deal;

  const [orderNumber, setOrderNumber] = useState(deal ? String(deal.display_number) : "");
  const [legacyNumber, setLegacyNumber] = useState(deal?.legacy_number ?? "");
  const [buyerPo, setBuyerPo] = useState(deal?.buyer_po ?? "");
  const [buyerId, setBuyerId] = useState(deal?.buyer_company_id ?? NONE);
  const [productId, setProductId] = useState(deal?.product_id ?? NONE);
  const [quality, setQuality] = useState(deal?.quality ?? "prime");
  const [buyerTerms, setBuyerTerms] = useState(deal?.buyer_terms ?? PAYMENT_TERMS[0]);
  const [incoterm, setIncoterm] = useState<Incoterm>(group.incoterm as Incoterm);
  const [shippingTerms, setShippingTerms] = useState(deal?.shipping_terms ?? group.incoterm);
  const [tolerance, setTolerance] = useState(
    deal?.tolerance_pct == null ? "5" : String(Number(deal.tolerance_pct)),
  );
  const [buyPrice, setBuyPrice] = useState(deal ? String(Number(deal.tpe_buy_price)) : "");
  const [sellPrice, setSellPrice] = useState(deal ? String(Number(deal.tpe_sell_price)) : "");
  const [insurance, setInsurance] = useState(deal?.insurance_terms ?? "");
  const [window_, setWindow] = useState(deal?.shipment_window ?? "");
  const [notes, setNotes] = useState(deal?.notes ?? "");
  const [newParty, setNewParty] = useState(false);
  const [newProduct, setNewProduct] = useState(false);

  // Booking may change the incoterm from its own card; mirror it here.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIncoterm(group.incoterm as Incoterm);
  }, [group.incoterm]);

  const utils = ClientAPI.useUtils();
  const buyers = ClientAPI.reference.parties.list.useQuery({});
  const products = ClientAPI.reference.products.list.useQuery();
  const upsert = ClientAPI.exportShipments.upsertDeal.useMutation();

  const buyerOptions = useMemo(() => {
    const rows = buyers.data ?? [];
    return [...rows.filter((r) => r.role === "buyer"), ...rows.filter((r) => r.role !== "buyer")];
  }, [buyers.data]);

  // Live totals from the legs on the manifest.
  const containerCount = group.containers.length;
  const contractLbs = group.containers.reduce(
    (sum, c) => sum + Number(c.matched_orders?.quantity_lbs ?? 0),
    0,
  );
  const sell = Number(sellPrice) || 0;
  const buy = Number(buyPrice) || 0;

  // Soft credit check (TPE intent: warn, never block). The value of THIS
  // purchase is compared against the buyer's available credit with this
  // shipment's own open balance excluded — it is being replaced, not added.
  const purchaseValue = contractLbs * sell;
  const creditCheck = ClientAPI.credit.check.useQuery(
    { orgId: buyerId, addValue: purchaseValue, excludeGroupId: group.id },
    { enabled: buyerId !== NONE },
  );
  const cc = creditCheck.data ?? null;

  async function save() {
    if (buyerId === NONE) return void toast.error("Choose the buyer.");
    if (productId === NONE) return void toast.error("Choose the product.");
    if (sellPrice.trim() === "") return void toast.error("Enter the sell price.");
    try {
      await upsert.mutateAsync({
        groupId: group.id,
        orderNumber: orderNumber.trim() ? Number(orderNumber) : undefined,
        legacyNumber: legacyNumber.trim() || null,
        buyerOrgId: buyerId,
        productId,
        quality: quality as "prime" | "offgrade" | "regrind",
        buyerTerms: buyerTerms || null,
        buyerPo: buyerPo.trim() || null,
        shippingTerms: shippingTerms.trim() || null,
        incoterm,
        buyPricePerLb: buy,
        sellPricePerLb: sell,
        tolerancePct: Number(tolerance) || 0,
        insuranceTerms: insurance.trim() || null,
        shipmentWindow: window_.trim() || null,
        notes: notes.trim() || null,
      });
      toast.success(deal ? "Purchase updated" : "Purchase opened");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the purchase.");
    }
  }

  return (
    <Section
      title="Purchase"
      subtitle="What was sold — one purchase per shipment; every container inherits it"
      icon={ShoppingCart}
      actions={
        <UpdateButton
          label={deal ? "Update Purchase" : "Save Purchase"}
          pending={upsert.isPending}
          onClick={save}
        />
      }
    >
      {!deal && (
        <p className="text-tpe-gold-ink text-xs font-medium">
          No purchase yet — save this card to start adding containers.
        </p>
      )}

      <Grid>
        <Cell label="Order #" span={2} htmlFor="p-order">
          {deal ? (
            <ReadValue>
              <span className="font-mono">{deal.display_number}</span>
            </ReadValue>
          ) : (
            <Input
              id="p-order"
              type="number"
              min={1}
              className="h-8 font-mono"
              placeholder="auto"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
            />
          )}
        </Cell>
        <Cell label="Legacy ref" span={2} htmlFor="p-legacy">
          <Input
            id="p-legacy"
            className="h-8"
            value={legacyNumber}
            onChange={(e) => setLegacyNumber(e.target.value)}
          />
        </Cell>
        <Cell label="Buyer PO" span={2} htmlFor="p-po">
          <Input
            id="p-po"
            className="h-8"
            placeholder="Advise"
            value={buyerPo}
            onChange={(e) => setBuyerPo(e.target.value)}
          />
        </Cell>
        <Cell label="Buyer / consignee" span={6}>
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

        <Cell label="Product / grade" span={4}>
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
        <Cell label="Quality" span={2}>
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
        <Cell label="Payment terms" span={3}>
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
        <Cell label="Incoterm" span={1}>
          <Select
            value={incoterm}
            onValueChange={(v) => {
              if (!v) return;
              // Ship terms usually equal the incoterm; follow it until edited by hand.
              if (shippingTerms === incoterm) setShippingTerms(v);
              setIncoterm(v as Incoterm);
            }}
          >
            <SelectTrigger className={SELECT_TRIGGER} aria-label="Incoterm">
              <SelectValue>{incoterm}</SelectValue>
            </SelectTrigger>
            <SelectContent className={SELECT_POPUP}>
              {INCOTERMS.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Cell>
        <Cell label="Ship terms" span={2} htmlFor="p-ship">
          <Input
            id="p-ship"
            className="h-8"
            value={shippingTerms}
            onChange={(e) => setShippingTerms(e.target.value)}
          />
        </Cell>

        <Cell label="Purchase price ($/lb)" span={2} htmlFor="p-buy">
          <Input
            id="p-buy"
            type="number"
            min={0}
            step="0.0001"
            className="h-8"
            placeholder="0.5800"
            value={buyPrice}
            onChange={(e) => setBuyPrice(e.target.value)}
          />
        </Cell>
        <Cell label="Sell price ($/lb)" span={2} htmlFor="p-sell">
          <Input
            id="p-sell"
            type="number"
            min={0}
            step="0.0001"
            className="h-8"
            placeholder="0.7200"
            value={sellPrice}
            onChange={(e) => setSellPrice(e.target.value)}
          />
        </Cell>
        <Cell label="Tolerance %" span={1} htmlFor="p-tol">
          <Input
            id="p-tol"
            type="number"
            min={0}
            max={100}
            step="0.5"
            className="h-8"
            value={tolerance}
            onChange={(e) => setTolerance(e.target.value)}
          />
        </Cell>
        <Cell label="Containers" span={1}>
          <ReadValue>{containerCount || null}</ReadValue>
        </Cell>
        <Cell label="Contract (lbs / MT)" span={2}>
          <ReadValue>
            {contractLbs
              ? `${lbs(contractLbs)} / ${lbsToMetricTons(contractLbs).toLocaleString("en-US", {
                  minimumFractionDigits: 3,
                  maximumFractionDigits: 3,
                })}`
              : null}
          </ReadValue>
        </Cell>
        <Cell label="Sale value" span={2}>
          <ReadValue>
            {contractLbs && sell ? money(contractLbs * sell, group.currency) : null}
          </ReadValue>
        </Cell>
        <Cell label="Margin" span={2}>
          <ReadValue>
            {contractLbs && sell ? (
              <span className={sell - buy >= 0 ? "text-table-positive" : "text-table-negative"}>
                {money(contractLbs * (sell - buy), group.currency)}
              </span>
            ) : null}
          </ReadValue>
        </Cell>

        {cc ? (
          <Cell label="Credit" span={12}>
            <p
              className={
                cc.over
                  ? "text-table-negative text-sm font-medium"
                  : cc.nearLimit
                    ? "text-tpe-gold-ink text-sm font-medium"
                    : "text-muted-foreground text-sm"
              }
            >
              {cc.creditLimit > 0
                ? `${money(cc.available, group.currency)} available of ${money(cc.creditLimit, group.currency)} limit`
                : "No credit limit set (prepay)"}
              {purchaseValue > 0
                ? ` — this purchase ${money(purchaseValue, group.currency)} → ${money(cc.afterThis, group.currency)} left`
                : ""}
              {cc.over ? " · OVER LIMIT (saving is allowed; check with the desk)" : ""}
            </p>
          </Cell>
        ) : null}

        <Cell label="Insurance terms" span={4} htmlFor="p-ins">
          <Input
            id="p-ins"
            className="h-8"
            placeholder="Buyer's account"
            value={insurance}
            onChange={(e) => setInsurance(e.target.value)}
          />
        </Cell>
        <Cell label="Shipment window" span={4} htmlFor="p-window">
          <Input
            id="p-window"
            className="h-8"
            placeholder="October 2026"
            value={window_}
            onChange={(e) => setWindow(e.target.value)}
          />
        </Cell>
        <Cell label="Notes" span={4} htmlFor="p-notes">
          <Textarea
            id="p-notes"
            rows={1}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Cell>
      </Grid>

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
    </Section>
  );
}
