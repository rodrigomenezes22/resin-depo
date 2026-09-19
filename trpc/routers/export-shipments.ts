import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { LBS_PER_UNIT } from "@/lib/units";

import { buildCommercialInvoiceDraft } from "@/lib/export-shipment/documents/commercial-invoice";
import { buildCertificateOfOriginDraft } from "@/lib/export-shipment/documents/certificate-of-origin";
import { buildDocumentContext } from "@/lib/export-shipment/documents/context";
import { buildPackingListDraft } from "@/lib/export-shipment/documents/packing-list";
import { buildProformaInvoiceDraft } from "@/lib/export-shipment/documents/proforma-invoice";
import { buildSalesContractDraft } from "@/lib/export-shipment/documents/sales-contract";
import {
  isBuiltDocType,
  type PersistedDocType,
  DOC_TYPES,
  DOC_TYPE_META,
  payloadSchemaFor,
  type ShipmentDocType,
} from "@/lib/export-shipment/documents/types";
import { parentDisplayNumbers } from "@/lib/deal-numbers";
import { resolveOrgAddress } from "@/lib/locations/queries";
import type { ResolvedOrgAddress } from "@/lib/locations/types";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/database.types";
import { formatShipmentNumber } from "@/components/bank/export-shipments/group-status";
import { creatableGroupStatusSchema } from "@/components/bank/export-shipments/group-statuses";
import { createTRPCRouter, requirePermission } from "../init";

/** The request-scoped Supabase client on the tRPC context (`ctx.db`). */
type ExportShipmentDb = Awaited<ReturnType<typeof createClient>>;

/**
 * Zod gives us `Record<string, unknown>` for a validated JSON object; Supabase's
 * generated `Json` type cannot express "some plain JSON object" without an index
 * signature the input type doesn't carry. The value really is JSON — it arrived
 * as JSON over the wire and is validated against the document schema before it
 * is ever issued — so this narrows at the one boundary rather than smearing
 * casts through the procedures.
 */
const asJson = (value: Record<string, unknown>): Json => value as Json;

// resin-depo: supabase-js 2.116 rejects Record<string, unknown> as an update
// payload (TPE pins 2.100). buildPatch stays TPE's dynamic column mapper;
// the four call sites cast to the table's Update type.
type Update<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

// =============================================================================
// Export Shipments router — Bank → Export Shipments
// =============================================================================
// The grouping layer for international container sales: one ocean booking
// covering several container transactions. It sits BESIDE matched_orders — a
// shipment_containers row is 1:1 with a transaction and holds the group link —
// so nothing here changes the Transaction Summary ledger.
//
// Gates on admin:view to match the rest of the Bank area (the same permission
// the Transaction Details mutations use). The
// tables' RLS is the broader ('admin','broker_trader'), so opening a read-only
// Sales view later needs no migration.
//
// Manifest positions are kept CONTIGUOUS (1..n) on every membership change: a
// partial unique index enforces uniqueness, and `renumber` closes the gaps so a
// manifest never reads 1, 3, 4.
// =============================================================================

/** Units that can physically be a container. Mirrors the DB guard trigger. */
const CONTAINER_UNITS = [
  "container",
  "heavy_container",
  "container_20",
  "container_40",
  "container_40hc",
] as const;

/** The Purchase card (resin-depo): the shipment's parent deal. */
const purchaseFields = {
  orderNumber: z.number().int().positive().optional(),
  legacyNumber: z.string().trim().max(60).nullable().optional(),
  buyerOrgId: z.string().uuid(),
  productId: z.string().uuid(),
  quality: z.enum(["prime", "offgrade", "regrind"]).optional(),
  buyerTerms: z.string().trim().max(120).nullable().optional(),
  buyerPo: z.string().trim().max(120).nullable().optional(),
  shippingTerms: z.string().trim().max(60).nullable().optional(),
  incoterm: z.enum(["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "DAP", "DDP"]).optional(),
  buyPricePerLb: z.number().min(0),
  sellPricePerLb: z.number().min(0),
  tolerancePct: z.number().min(0).max(100).optional(),
  insuranceTerms: z.string().trim().max(200).nullable().optional(),
  shipmentWindow: z.string().trim().max(200).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
};

/** "Add container" (resin-depo): the physical facts of N identical legs. */
const containerLegFields = {
  unit: z.enum(CONTAINER_UNITS),
  count: z.number().int().min(1).max(20).default(1),
  quantityLbs: z.number().positive().optional(),
  packageKind: z.string().trim().max(40).nullable().optional(),
  packageCount: z.number().int().positive().nullable().optional(),
  packageWeightLbs: z.number().positive().nullable().optional(),
  marksAndNumbers: z.string().trim().max(2000).nullable().optional(),
};

/** Columns of the parent deal the Purchase card shows and the legs inherit. */
const PURCHASE_SELECT =
  "id, display_number, legacy_number, notes, qty, unit, quantity_lbs, created_at, broker_id, buyer_company_id, buyer_company_text, product_id, product_text, quality, buyer_terms, buyer_po, shipping_terms, tpe_buy_price, tpe_sell_price, tolerance_pct, insurance_terms, shipment_window, seller_company_id, seller_company_text, products(name, hs_code, country_of_origin)";

const GROUP_STATUS = z.enum(["draft", "booked", "sailed", "arrived", "closed", "cancelled"]);
const INCOTERM = z.enum(["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "DAP", "DDP"]);
/** Built from DOC_TYPES so the enum cannot drift from the payload schemas. */
const DOC_TYPE = z.enum(DOC_TYPES);
/** Mirrors the `export_cost_type` enum. */
const COST_TYPE = z.enum([
  "ocean_freight",
  "thc",
  "documentation",
  "insurance",
  "customs",
  "other",
]);

/**
 * Booking fields, all optional. Written as a partial patch (only keys the
 * client actually sent), so the Booking card can save itself without
 * clobbering fields it doesn't render — the same contract as
 * `orders.updateTransaction`.
 */
const groupFields = {
  status: GROUP_STATUS,
  incoterm: INCOTERM,
  currency: z.string().trim().min(1).max(3),
  carrierOrgId: z.string().uuid().nullable(),
  vesselName: z.string().trim().nullable(),
  voyageNumber: z.string().trim().nullable(),
  masterBlNumber: z.string().trim().nullable(),
  bookingNumber: z.string().trim().nullable(),
  polLocationId: z.string().uuid().nullable(),
  podLocationId: z.string().uuid().nullable(),
  placeOfReceipt: z.string().trim().nullable(),
  placeOfDelivery: z.string().trim().nullable(),
  etd: z.string().nullable(),
  eta: z.string().nullable(),
  notes: z.string().nullable(),
} as const;

/** camelCase input key → snake_case column. */
const GROUP_COLUMN: Record<keyof typeof groupFields, string> = {
  status: "status",
  incoterm: "incoterm",
  currency: "currency",
  carrierOrgId: "carrier_org_id",
  vesselName: "vessel_name",
  voyageNumber: "voyage_number",
  masterBlNumber: "master_bl_number",
  bookingNumber: "booking_number",
  polLocationId: "pol_location_id",
  podLocationId: "pod_location_id",
  placeOfReceipt: "place_of_receipt",
  placeOfDelivery: "place_of_delivery",
  etd: "etd",
  eta: "eta",
  notes: "notes",
};

const containerFields = {
  containerNumber: z.string().trim().nullable(),
  sealNumber: z.string().trim().nullable(),
  packageCount: z.number().int().positive().nullable(),
  packageKind: z.string().trim().nullable(),
  /** Weight of ONE package; null = the house default for the kind. */
  packageWeightLbs: z.number().positive().nullable(),
  netWeightLbs: z.number().positive().nullable(),
  tareWeightLbs: z.number().nonnegative().nullable(),
  marksAndNumbers: z.string().nullable(),
} as const;

const CONTAINER_COLUMN: Record<keyof typeof containerFields, string> = {
  containerNumber: "container_number",
  sealNumber: "seal_number",
  packageCount: "package_count",
  packageKind: "package_kind",
  packageWeightLbs: "package_weight_lbs",
  netWeightLbs: "net_weight_lbs",
  tareWeightLbs: "tare_weight_lbs",
  marksAndNumbers: "marks_and_numbers",
};

/**
 * Build a snake_cased patch from only the keys physically present on `input`.
 * `undefined` means "not edited"; `null` means "clear it" and is written.
 */
function buildPatch<K extends string>(
  input: Record<string, unknown>,
  columns: Record<K, string>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(columns) as K[]) {
    if (key in input) patch[columns[key]] = input[key];
  }
  return patch;
}

/** Turn a `raise exception 'shipment: …'` into a readable tRPC error. */
function shipmentError(message: string): TRPCError {
  const m = /shipment:\s*(.*)$/.exec(message);
  return new TRPCError({
    code: "PRECONDITION_FAILED",
    message: m ? m[1] : message,
  });
}

// `parentDisplayNumbers` (lib/deal-numbers.ts) resolves the parent order number
// a conversion leg renders under — container transactions are very often
// exactly those legs, since a railcar cut into containers is the normal way an
// export booking gets filled.

export const exportShipmentsRouter = createTRPCRouter({
  // The old `ports` read moved to the dedicated `locations` router — the
  // Booking card calls locations.list with kinds: ["port"].

  /**
   * The Export Shipments list. One row per booking, with the derived numbers
   * the desk scans on: container count, total contract weight, and how many
   * containers have been stuffed (a container number recorded).
   */
  list: requirePermission("admin:view")
    .input(
      z
        .object({
          status: GROUP_STATUS.nullish(),
          search: z.string().trim().nullish(),
        })
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      let query = ctx.db
        .from("shipment_groups")
        .select(
          "id, display_number, status, incoterm, currency, vessel_name, voyage_number, master_bl_number, etd, eta, created_at, rolled_from_group_id, carrier:organizations(id, name), pol:locations!shipment_groups_pol_location_id_fkey(id, name, unlocode), pod:locations!shipment_groups_pod_location_id_fkey(id, name, unlocode), shipment_containers!shipment_containers_shipment_group_id_fkey(id, container_number, matched_orders(quantity_lbs, buyer_company_text)), deal:shipment_group_deals(matched_orders(buyer_company_text))",
        )
        .order("created_at", { ascending: false });
      if (input.status) query = query.eq("status", input.status);

      const { data, error } = await query;
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      let rows = (data ?? []).map((g) => {
        const containers = g.shipment_containers ?? [];
        // One booking is one customer, so the first buyer names the shipment.
        // PostgREST may hand the one-to-one deal embed back as an object or a
        // one-element array; accept either.
        const dealRaw: unknown = g.deal;
        const dealRow = (Array.isArray(dealRaw) ? dealRaw[0] : dealRaw) as
          { matched_orders: { buyer_company_text: string | null } | null } | null | undefined;
        const buyer =
          containers.find((c) => c.matched_orders?.buyer_company_text)?.matched_orders
            ?.buyer_company_text ?? dealRow?.matched_orders?.buyer_company_text;
        return {
          id: g.id,
          display_number: g.display_number,
          status: g.status,
          incoterm: g.incoterm,
          currency: g.currency,
          vessel_name: g.vessel_name,
          voyage_number: g.voyage_number,
          master_bl_number: g.master_bl_number,
          etd: g.etd,
          eta: g.eta,
          created_at: g.created_at,
          is_rolled: Boolean(g.rolled_from_group_id),
          carrier_name: g.carrier?.name ?? null,
          pol: g.pol ? { name: g.pol.name, unlocode: g.pol.unlocode } : null,
          pod: g.pod ? { name: g.pod.name, unlocode: g.pod.unlocode } : null,
          buyer_company_text: buyer ?? null,
          container_count: containers.length,
          // Derived readiness — never stored, so it cannot drift.
          stuffed_count: containers.filter((c) => c.container_number).length,
          total_lbs: containers.reduce(
            (sum, c) => sum + Number(c.matched_orders?.quantity_lbs ?? 0),
            0,
          ),
        };
      });

      const s = input.search?.toLowerCase();
      if (s) {
        rows = rows.filter((r) =>
          [
            r.display_number,
            r.vessel_name,
            r.voyage_number,
            r.master_bl_number,
            r.buyer_company_text,
            r.carrier_name,
            r.pod?.name,
          ]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(s)),
        );
      }
      return rows;
    }),

  /** One shipment: booking, container manifest, and its audit timeline. */
  detail: requirePermission("admin:view")
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data: group } = await ctx.db
        .from("shipment_groups")
        .select(
          "id, display_number, status, incoterm, currency, carrier_org_id, vessel_name, voyage_number, master_bl_number, pol_location_id, pod_location_id, place_of_receipt, place_of_delivery, etd, eta, notes, rolled_from_group_id, created_at, booking_number, hbl_number, aes_itn, forwarding_agent, fmc_number, loading_terminal, type_of_move, final_destination, freight_terms, dthc_terms, carrier:organizations(id, name), pol:locations!shipment_groups_pol_location_id_fkey(id, name, unlocode, country), pod:locations!shipment_groups_pod_location_id_fkey(id, name, unlocode, country), rolled_from:shipment_groups!rolled_from_group_id(id, display_number)",
        )
        .eq("id", input.id)
        .maybeSingle();
      if (!group) return null;

      const { data: containers } = await ctx.db
        .from("shipment_containers")
        .select(
          "id, matched_order_id, position, container_number, seal_number, package_count, package_kind, package_weight_lbs, pallet_count, container_type, net_weight_lbs, tare_weight_lbs, gross_weight_lbs, marks_and_numbers, rolled_from_group_id, lots:shipment_container_lots(id, lot_id, lot_number_text, qty_lbs, position), matched_orders(id, display_number, leg_index, parent_matched_order_id, qty, unit, quantity_lbs, quality, product_id, product_text, buyer_company_id, buyer_company_text, buyer_terms, buyer_po, shipping_terms, tolerance_pct, insurance_terms, shipment_window, legacy_number, notes, seller_company_text, tpe_buy_price, tpe_sell_price, commission_pct, freight, ship_status, created_at, products(name, hs_code, country_of_origin))",
        )
        .eq("shipment_group_id", input.id)
        .order("position");

      const { data: events } = await ctx.db
        .from("shipment_group_events")
        .select(
          "id, event_type, payload, occurred_at, performed_by:user_profiles(first_name, last_name)",
        )
        .eq("shipment_group_id", input.id)
        .order("occurred_at", { ascending: false });

      // Every container on a booking is usually a conversion leg, and a leg is
      // displayed under its PARENT's order number (05025-CN2). Attached at the
      // container level rather than inside the embedded matched_orders object,
      // which is read-only as far as the generated types are concerned.
      const parentNumbers = await parentDisplayNumbers(
        ctx.db,
        (containers ?? []).map((c) => c.matched_orders?.parent_matched_order_id),
      );

      // PostgREST resolves the SELF-referencing rolled_from embed to an ARRAY,
      // not an object — and an empty array for a shipment that was never
      // rolled. `[]` is truthy, so handing it straight to the client rendered
      // "Rolled from SHP-undefined" on every ordinary shipment. Normalise here,
      // where the quirk lives, rather than making every consumer know about it.
      const rolledFromRaw: unknown = group.rolled_from;
      type RolledFrom = { id: string; display_number: number } | null;
      const rolled_from = Array.isArray(rolledFromRaw)
        ? ((rolledFromRaw[0] ?? null) as RolledFrom)
        : ((rolledFromRaw ?? null) as RolledFrom);

      const deal = await purchaseOf(ctx.db, input.id);

      return {
        ...group,
        rolled_from,
        deal,
        containers: (containers ?? []).map((c) => ({
          ...c,
          parent_display_number: c.matched_orders?.parent_matched_order_id
            ? (parentNumbers.get(c.matched_orders.parent_matched_order_id) ?? null)
            : null,
        })),
        events: events ?? [],
      };
    }),

  /**
   * Container transactions that are eligible to join a shipment: international,
   * container-sized, non-draft, not already grouped, and never a conversion
   * parent. Mirrors the DB guard so the picker cannot offer something the
   * trigger will reject.
   */
  groupable: requirePermission("admin:view")
    .input(
      z
        .object({ search: z.string().trim().nullish(), groupId: z.string().uuid().nullish() })
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      // resin-depo: containers are legs of the shipment's purchase, so "Add
      // existing" only ever re-attaches a leg that was removed from THIS
      // shipment. A purchase with no legs yet is not a conversion parent in the
      // DB's eyes, so it is excluded here explicitly.
      const parent = input.groupId ? await purchaseOf(ctx.db, input.groupId) : null;
      if (input.groupId && !parent) return [];
      const { data: dealLinks } = await ctx.db
        .from("shipment_group_deals")
        .select("matched_order_id");
      const purchaseIds = new Set((dealLinks ?? []).map((d) => d.matched_order_id));

      const { data: rows } = await ctx.db
        .from("matched_orders")
        .select(
          "id, display_number, leg_index, parent_matched_order_id, qty, unit, quantity_lbs, quality, product_text, buyer_company_text, seller_company_text, created_at, products(name), shipment_containers(id, shipment_group_id)",
        )
        .eq("market", "international")
        .in("unit", CONTAINER_UNITS)
        .neq("status", "draft")
        .order("created_at", { ascending: false });

      // A conversion parent is a zero-margin pass-through, not a box.
      const { data: parents } = await ctx.db
        .from("matched_orders")
        .select("parent_matched_order_id")
        .not("parent_matched_order_id", "is", null);
      const parentIds = new Set(
        (parents ?? []).map((p) => p.parent_matched_order_id).filter(Boolean) as string[],
      );

      let free = (rows ?? []).filter(
        (r) =>
          !parentIds.has(r.id) &&
          !purchaseIds.has(r.id) &&
          !r.shipment_containers?.shipment_group_id &&
          (!parent || r.parent_matched_order_id === parent.id),
      );

      // A conversion leg is DISPLAYED under its parent's number (05025-CN2),
      // and container transactions very often ARE conversion legs, so resolve
      // the parents' numbers. Not a PostgREST self-embed: that resolves to an
      // array here (same quirk as `rolled_from` above).
      const parentNumbers = await parentDisplayNumbers(
        ctx.db,
        free.map((r) => r.parent_matched_order_id),
      );

      const s = input.search?.toLowerCase();
      if (s) {
        free = free.filter((r) =>
          [r.display_number, r.products?.name ?? r.product_text, r.buyer_company_text]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(s)),
        );
      }
      return free.map((r) => ({
        ...r,
        parent_display_number: r.parent_matched_order_id
          ? (parentNumbers.get(r.parent_matched_order_id) ?? null)
          : null,
      }));
    }),

  /**
   * Open a new shipment. Booking details can all be filled in later.
   *
   * The initial status is narrowed to draft/booked: a shipment cannot be
   * created already `sailed` or `closed`, which would leave an event log whose
   * first entry contradicts the status. Later moves through the full enum are
   * `updateGroup`'s job.
   */
  createGroup: requirePermission("admin:view")
    .input(z.object({ ...groupFields, status: creatableGroupStatusSchema }).partial())
    .mutation(async ({ ctx, input }) => {
      const patch = buildPatch(input, GROUP_COLUMN);
      const { data, error } = await ctx.db
        .from("shipment_groups")
        .insert({ ...patch, created_by: ctx.claims.sub })
        .select("id, display_number")
        .single();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      await ctx.db.from("shipment_group_events").insert({
        shipment_group_id: data.id,
        event_type: "created",
        performed_by: ctx.claims.sub,
      });
      return data;
    }),

  /**
   * Open a shipment straight from a set of transactions — the Transaction
   * Summary "Create Shipment" flow, where the desk picks the containers in the
   * ledger before a booking exists.
   *
   * Create-then-assign, with the group deleted again if the assignment is
   * rejected. Two statements rather than one because the guard trigger fires on
   * the insert, and a half-built shipment left behind by a rejected pick would
   * show up in the list as an empty booking nobody opened.
   */
  // ===========================================================================
  // Purchase — resin-depo's replacement for TPE's ledger entry point
  // ===========================================================================
  // In TPE a container joins a shipment from the Transaction Summary: the desk
  // already has a deal (matched_orders row) and CONVERTS it into container
  // legs (convert_matched_order). resin-depo has no ledger, so the Purchase
  // card on the shipment page IS that parent deal — one per shipment, linked
  // through shipment_group_deals — and "Add container" mints its legs exactly
  // the way the conversion does: each leg copies the parent's commercial
  // columns (DEAL_COPY_COLUMNS) and carries parent_matched_order_id +
  // leg_index, so it prints as "900001-CH2" and the documents read buyer /
  // terms / prices off the leg as they always did.

  /**
   * Create or update the shipment's purchase (parent deal). On update the
   * commercial columns are pushed down to every existing leg, so a price or
   * terms change never leaves a container on the old number.
   */
  upsertDeal: requirePermission("admin:view")
    .input(z.object({ groupId: z.string().uuid() }).extend(purchaseFields))
    .mutation(async ({ ctx, input }) => {
      const {
        groupId,
        incoterm,
        orderNumber,
        legacyNumber,
        notes,
        buyerOrgId,
        productId,
        ...rest
      } = input;
      const [
        { data: group },
        { data: buyer },
        { data: product },
        { data: exchange },
        { data: link },
      ] = await Promise.all([
        ctx.db.from("shipment_groups").select("id, incoterm").eq("id", groupId).maybeSingle(),
        ctx.db.from("organizations").select("id, name").eq("id", buyerOrgId).maybeSingle(),
        ctx.db.from("products").select("id, name").eq("id", productId).maybeSingle(),
        ctx.db
          .from("organizations")
          .select("id, name")
          .eq("role", "exchange")
          .limit(1)
          .maybeSingle(),
        ctx.db
          .from("shipment_group_deals")
          .select("matched_order_id")
          .eq("shipment_group_id", groupId)
          .maybeSingle(),
      ]);
      if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Shipment not found." });
      if (!buyer) throw new TRPCError({ code: "NOT_FOUND", message: "Buyer not found." });
      if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found." });

      // The columns every leg inherits (TPE convert_matched_order copies these,
      // plus tolerance/insurance/window which TPE leaves to defaults).
      const shared = {
        buyer_company_id: buyer.id,
        buyer_company_text: buyer.name,
        product_id: product.id,
        product_text: product.name,
        quality: rest.quality ?? "prime",
        buyer_terms: rest.buyerTerms ?? null,
        buyer_po: rest.buyerPo ?? null,
        shipping_terms: rest.shippingTerms ?? incoterm ?? group.incoterm,
        tpe_buy_price: rest.buyPricePerLb,
        tpe_sell_price: rest.sellPricePerLb,
        tolerance_pct: rest.tolerancePct ?? 5,
        insurance_terms: rest.insuranceTerms ?? null,
        shipment_window: rest.shipmentWindow ?? null,
        seller_company_id: exchange?.id ?? null,
        seller_company_text: exchange?.name ?? "The Plastics Exchange",
      };
      const parentOnly = {
        legacy_number: legacyNumber ?? null,
        notes: notes ?? null,
        ...(orderNumber ? { display_number: orderNumber } : {}),
      };
      const orderTaken = (e: { code?: string; message: string }): never => {
        if (e.code === "23505") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `Order number ${orderNumber} is already taken.`,
          });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e.message });
      };

      let parentId = link?.matched_order_id ?? null;
      if (!parentId) {
        const { data: parent, error } = await ctx.db
          .from("matched_orders")
          .insert({
            ...shared,
            ...parentOnly,
            market: "international",
            status: "matched",
            ship_status: "inventory",
            unit: "container",
            qty: 1,
            quantity_lbs: 0,
            broker_id: ctx.claims.sub,
          })
          .select("id")
          .single();
        if (error) orderTaken(error);
        if (!parent)
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Could not create the purchase.",
          });
        parentId = parent.id;
        const { error: linkError } = await ctx.db
          .from("shipment_group_deals")
          .insert({ shipment_group_id: groupId, matched_order_id: parentId });
        if (linkError) {
          await ctx.db.from("matched_orders").delete().eq("id", parentId);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: linkError.message });
        }
        await logEvent(ctx.db, groupId, "container_updated", ctx.claims.sub, {
          scope: "deal",
          created: true,
          matchedOrderId: parentId,
        });
      } else {
        const { data: before } = await ctx.db
          .from("matched_orders")
          .select(
            "display_number, legacy_number, notes, buyer_company_id, buyer_company_text, product_id, product_text, quality, buyer_terms, buyer_po, shipping_terms, tpe_buy_price, tpe_sell_price, tolerance_pct, insurance_terms, shipment_window",
          )
          .eq("id", parentId)
          .maybeSingle();
        const { error } = await ctx.db
          .from("matched_orders")
          .update({ ...shared, ...parentOnly })
          .eq("id", parentId);
        if (error) orderTaken(error);

        // Push the shared columns down to every leg of this purchase.
        const { error: legError } = await ctx.db
          .from("matched_orders")
          .update(shared)
          .eq("parent_matched_order_id", parentId);
        if (legError) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: legError.message });
        }

        const after = { ...shared, ...parentOnly } as Record<string, unknown>;
        const beforeRec = (before ?? {}) as Record<string, unknown>;
        const changed = Object.fromEntries(
          Object.keys(after)
            .filter((k) => String(beforeRec[k] ?? "") !== String(after[k] ?? ""))
            .map((k) => [k, { from: beforeRec[k] ?? null, to: after[k] ?? null }]),
        );
        if (Object.keys(changed).length) {
          await logEvent(ctx.db, groupId, "container_updated", ctx.claims.sub, {
            scope: "deal",
            matchedOrderId: parentId,
            changed,
          });
        }
      }

      if (incoterm && incoterm !== group.incoterm) {
        const { error } = await ctx.db
          .from("shipment_groups")
          .update({ incoterm })
          .eq("id", groupId);
        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }
      return { matchedOrderId: parentId };
    }),

  /**
   * Add containers to the manifest: each is a conversion leg of the shipment's
   * purchase (buyer, product, prices, terms inherited), plus the physical
   * facts the desk knows up front — unit, contract weight, packaging. Stuffing
   * detail (container no., seal, net/tare) comes later in the container sheet.
   */
  createContainer: requirePermission("admin:view")
    .input(z.object({ groupId: z.string().uuid() }).extend(containerLegFields))
    .mutation(async ({ ctx, input }) => {
      const { groupId, count, unit, packageKind, packageCount, packageWeightLbs, marksAndNumbers } =
        input;
      const parent = await purchaseOf(ctx.db, groupId);
      if (!parent) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Save the Purchase card before adding containers.",
        });
      }
      const quantityLbs = input.quantityLbs ?? LBS_PER_UNIT[unit];

      const { data: lastLeg } = await ctx.db
        .from("matched_orders")
        .select("leg_index")
        .eq("parent_matched_order_id", parent.id)
        .order("leg_index", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      let legIndex = (lastLeg?.leg_index ?? 0) + 1;

      const legRow = {
        parent_matched_order_id: parent.id,
        market: "international" as const,
        status: "matched",
        ship_status: "inventory" as const,
        unit,
        qty: 1,
        quantity_lbs: quantityLbs,
        broker_id: parent.broker_id,
        buyer_company_id: parent.buyer_company_id,
        buyer_company_text: parent.buyer_company_text,
        product_id: parent.product_id,
        product_text: parent.product_text,
        quality: parent.quality,
        buyer_terms: parent.buyer_terms,
        buyer_po: parent.buyer_po,
        shipping_terms: parent.shipping_terms,
        tpe_buy_price: parent.tpe_buy_price,
        tpe_sell_price: parent.tpe_sell_price,
        tolerance_pct: parent.tolerance_pct,
        insurance_terms: parent.insurance_terms,
        shipment_window: parent.shipment_window,
        seller_company_id: parent.seller_company_id,
        seller_company_text: parent.seller_company_text,
      };

      const created: string[] = [];
      for (let i = 0; i < count; i++) {
        const { data: leg, error } = await ctx.db
          .from("matched_orders")
          .insert({ ...legRow, leg_index: legIndex })
          .select("id")
          .single();
        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
        try {
          await assignToGroup(ctx.db, groupId, [leg.id]);
        } catch (err) {
          await ctx.db.from("matched_orders").delete().eq("id", leg.id);
          throw err;
        }
        if (packageKind || packageCount || packageWeightLbs || marksAndNumbers) {
          await ctx.db
            .from("shipment_containers")
            .update({
              package_kind: packageKind ?? null,
              package_count: packageKind ? (packageCount ?? null) : null,
              package_weight_lbs: packageKind ? (packageWeightLbs ?? null) : null,
              marks_and_numbers: marksAndNumbers ?? null,
            })
            .eq("matched_order_id", leg.id);
        }
        created.push(leg.id);
        legIndex += 1;
      }

      await syncPurchaseTotals(ctx.db, parent.id);
      await logEvent(ctx.db, groupId, "containers_assigned", ctx.claims.sub, {
        count,
        matchedOrderIds: created,
        from: "purchase",
      });
      return { matchedOrderIds: created };
    }),

  /** Per-container override of the contract line: unit and contract weight. */
  updateLeg: requirePermission("admin:view")
    .input(
      z.object({
        matchedOrderId: z.string().uuid(),
        unit: z.enum(CONTAINER_UNITS).optional(),
        quantityLbs: z.number().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const patch: Update<"matched_orders"> = {};
      if (input.unit !== undefined) patch.unit = input.unit;
      if (input.quantityLbs !== undefined) patch.quantity_lbs = input.quantityLbs;
      if (!Object.keys(patch).length) return { matchedOrderId: input.matchedOrderId };

      const { data: before } = await ctx.db
        .from("matched_orders")
        .select(
          "unit, quantity_lbs, parent_matched_order_id, shipment_containers(id, shipment_group_id)",
        )
        .eq("id", input.matchedOrderId)
        .maybeSingle();
      if (!before) throw new TRPCError({ code: "NOT_FOUND", message: "Container not found." });

      const { error } = await ctx.db
        .from("matched_orders")
        .update(patch)
        .eq("id", input.matchedOrderId);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      if (before.parent_matched_order_id)
        await syncPurchaseTotals(ctx.db, before.parent_matched_order_id);

      const groupId = before.shipment_containers?.shipment_group_id;
      if (groupId) {
        const changed: Record<string, { from: unknown; to: unknown }> = {};
        if (patch.unit !== undefined && patch.unit !== before.unit)
          changed.unit = { from: before.unit, to: patch.unit };
        if (
          patch.quantity_lbs !== undefined &&
          Number(patch.quantity_lbs) !== Number(before.quantity_lbs)
        )
          changed.quantity_lbs = { from: before.quantity_lbs, to: patch.quantity_lbs };
        if (Object.keys(changed).length) {
          await logEvent(ctx.db, groupId, "container_updated", ctx.claims.sub, {
            containerId: before.shipment_containers?.id ?? null,
            matchedOrderId: input.matchedOrderId,
            changed,
          });
        }
      }
      return { matchedOrderId: input.matchedOrderId };
    }),

  /**
   * Delete a container AND its leg. Refused while an ISSUED document covers
   * it: live paperwork cites the box, so void that first. Draft and voided
   * coverage rows go with it (cascade).
   */
  deleteContainer: requirePermission("admin:view")
    .input(z.object({ containerId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data: row } = await ctx.db
        .from("shipment_containers")
        .select(
          "id, matched_order_id, shipment_group_id, container_number, matched_orders(parent_matched_order_id)",
        )
        .eq("id", input.containerId)
        .maybeSingle();
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Container not found." });

      const { data: issued } = await ctx.db
        .from("shipment_document_containers")
        .select("document_id, shipment_documents!inner(status, document_number)")
        .eq("container_id", input.containerId)
        .eq("shipment_documents.status", "issued");
      if (issued?.length) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `This container is on ${issued.length} issued document(s). Void them before deleting it.`,
        });
      }

      // matched_orders -> shipment_containers is ON DELETE CASCADE.
      const { error } = await ctx.db.from("matched_orders").delete().eq("id", row.matched_order_id);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      const parentId = row.matched_orders?.parent_matched_order_id;
      if (parentId) await syncPurchaseTotals(ctx.db, parentId);

      if (row.shipment_group_id) {
        await renumber(ctx.db, row.shipment_group_id);
        await logEvent(ctx.db, row.shipment_group_id, "containers_removed", ctx.claims.sub, {
          containerId: row.id,
          matchedOrderId: row.matched_order_id,
          containerNumber: row.container_number,
          deleted: true,
        });
      }
      return { groupId: row.shipment_group_id };
    }),

  /** Partial patch of the booking. Only keys the client sent are written. */
  updateGroup: requirePermission("admin:view")
    .input(z.object({ id: z.string().uuid() }).extend(z.object(groupFields).partial().shape))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const patch = buildPatch(rest, GROUP_COLUMN);
      if (!Object.keys(patch).length) return { id };

      // Status is the desk's public label, so a change is worth an audit row.
      let previousStatus: string | null = null;
      if ("status" in patch) {
        const { data: before } = await ctx.db
          .from("shipment_groups")
          .select("status")
          .eq("id", id)
          .maybeSingle();
        previousStatus = before?.status ?? null;
      }

      const { error } = await ctx.db
        .from("shipment_groups")
        .update(patch as Update<"shipment_groups">)
        .eq("id", id);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      if (previousStatus && previousStatus !== patch.status) {
        await ctx.db.from("shipment_group_events").insert({
          shipment_group_id: id,
          event_type: "status_changed",
          payload: { from: previousStatus, to: String(patch.status) },
          performed_by: ctx.claims.sub,
        });
      }
      return { id };
    }),

  /**
   * Add container transactions to a shipment, appending them to the manifest.
   * A transaction that has never been containerised gets its row created here;
   * one that exists but is unassigned is moved. No money moves and no documents
   * exist yet at this stage, so this is a plain write rather than a SQL
   * function — unlike the roll, which must be atomic.
   */
  assignContainers: requirePermission("admin:view")
    .input(
      z.object({
        groupId: z.string().uuid(),
        matchedOrderIds: z.array(z.string().uuid()).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assignToGroup(ctx.db, input.groupId, input.matchedOrderIds);
      await ctx.db.from("shipment_group_events").insert({
        shipment_group_id: input.groupId,
        event_type: "containers_assigned",
        payload: { count: input.matchedOrderIds.length },
        performed_by: ctx.claims.sub,
      });
      return { added: input.matchedOrderIds.length };
    }),

  /**
   * Take a container off a shipment without deleting what has been recorded
   * about it — the booking / container / seal numbers stay on the row, which is
   * what a later roll into another shipment will want.
   */
  removeContainer: requirePermission("admin:view")
    .input(z.object({ containerId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data: row } = await ctx.db
        .from("shipment_containers")
        .select("id, shipment_group_id")
        .eq("id", input.containerId)
        .maybeSingle();
      if (!row?.shipment_group_id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Container is not on a shipment." });
      }
      const groupId = row.shipment_group_id;

      const { error } = await ctx.db
        .from("shipment_containers")
        .update({ shipment_group_id: null })
        .eq("id", input.containerId);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      await renumber(ctx.db, groupId);
      await ctx.db.from("shipment_group_events").insert({
        shipment_group_id: groupId,
        event_type: "containers_removed",
        payload: { containerId: input.containerId },
        performed_by: ctx.claims.sub,
      });
      return { groupId };
    }),

  /**
   * Partial patch of one container's booking / stuffing detail.
   *
   * Writes a `container_updated` event carrying a field diff (REM-12): this
   * was the one export mutation that changed a booking silently, so a seal or
   * container number could be rewritten with nothing in the log to show it.
   * The diff records only fields whose value actually moved, old and new, so
   * the log says what changed rather than merely that something did.
   *
   * A container not yet assigned to a group has no log to write to — the edit
   * still applies, and the assignment event that follows carries it onto the
   * booking's timeline.
   */
  updateContainer: requirePermission("admin:view")
    .input(z.object({ id: z.string().uuid() }).extend(z.object(containerFields).partial().shape))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const patch = buildPatch(rest, CONTAINER_COLUMN);
      if (!Object.keys(patch).length) return { id };

      const columns = Object.keys(patch);
      const { data: before } = await ctx.db
        .from("shipment_containers")
        .select(["shipment_group_id", ...columns].join(", "))
        .eq("id", id)
        .maybeSingle<Record<string, unknown>>();

      const { error } = await ctx.db
        .from("shipment_containers")
        .update(patch as Update<"shipment_containers">)
        .eq("id", id);
      if (error) throw shipmentError(error.message);

      const groupId = before?.shipment_group_id as string | null | undefined;
      if (groupId) {
        const changed = Object.fromEntries(
          columns
            .filter((c) => (before?.[c] ?? null) !== (patch[c] ?? null))
            .map((c) => [c, { from: before?.[c] ?? null, to: patch[c] ?? null }]),
        );
        if (Object.keys(changed).length) {
          await ctx.db.from("shipment_group_events").insert({
            shipment_group_id: groupId,
            event_type: "container_updated",
            payload: asJson({ containerId: id, changed }),
            performed_by: ctx.claims.sub,
          });
        }
      }
      return { id };
    }),

  // ===========================================================================
  // Shared costs
  // ===========================================================================
  // Quoted per BOOKING, reported per TRANSACTION. The desk enters the total
  // once and a DB trigger allocates it across the containers by contract
  // weight, writing each share to `matched_orders.freight` — so the ledger's
  // margin, the manifest and the Commercial Invoice all read one number.
  //
  // Nothing here computes the split: `allocate_shipment_costs` does, and it
  // fires on cost changes AND on membership changes. Doing it in the client
  // would leave the shares stale the moment a container was added elsewhere.

  /** A shipment's costs plus what each container ended up carrying. */
  costs: requirePermission("admin:view")
    .input(z.object({ groupId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data: costs } = await ctx.db
        .from("shipment_group_costs")
        .select(
          // FK hint required: shipment_group_costs references user_profiles
          // twice (created_by and updated_by), so an unhinted embed is
          // ambiguous (PGRST201) and the whole query fails.
          "id, cost_type, description, amount, currency, invoice_number, invoice_document_path, created_at, created_by:user_profiles!shipment_group_costs_created_by_fkey(first_name, last_name)",
        )
        .eq("shipment_group_id", input.groupId)
        .order("created_at");

      // The allocation as it actually landed, read back rather than recomputed
      // — if these ever disagreed with the total, the desk should see it.
      const { data: allocations } = await ctx.db
        .from("shipment_containers")
        .select("id, position, container_number, matched_orders(id, quantity_lbs, freight)")
        .eq("shipment_group_id", input.groupId)
        .order("position");

      const rows = costs ?? [];
      return {
        costs: rows,
        total: rows.reduce((sum, c) => sum + Number(c.amount), 0),
        allocations: (allocations ?? []).map((a) => ({
          containerId: a.id,
          position: a.position,
          containerNumber: a.container_number,
          contractLbs: Number(a.matched_orders?.quantity_lbs ?? 0),
          allocated: Number(a.matched_orders?.freight ?? 0),
        })),
      };
    }),

  addCost: requirePermission("admin:view")
    .input(
      z.object({
        groupId: z.string().uuid(),
        costType: COST_TYPE,
        description: z.string().trim().nullish(),
        amount: z.number().nonnegative(),
        currency: z.string().trim().min(1).max(3).default("USD"),
        invoiceNumber: z.string().trim().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.db
        .from("shipment_group_costs")
        .insert({
          shipment_group_id: input.groupId,
          cost_type: input.costType,
          description: input.description ?? null,
          amount: input.amount,
          currency: input.currency,
          invoice_number: input.invoiceNumber || null,
          created_by: ctx.claims.sub,
        })
        .select("id")
        .single();
      if (error || !data) throw shipmentError(error?.message ?? "Could not add the cost.");

      await logEvent(ctx.db, input.groupId, "cost_added", ctx.claims.sub, {
        costType: input.costType,
        amount: input.amount,
      });
      return { id: data.id };
    }),

  updateCost: requirePermission("admin:view")
    .input(
      z.object({
        id: z.string().uuid(),
        costType: COST_TYPE.optional(),
        description: z.string().trim().nullable().optional(),
        amount: z.number().nonnegative().optional(),
        invoiceNumber: z.string().trim().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, costType, invoiceNumber, ...rest } = input;
      const patch: Record<string, unknown> = { ...rest };
      if (costType) patch.cost_type = costType;
      if (invoiceNumber !== undefined) patch.invoice_number = invoiceNumber || null;
      if (!Object.keys(patch).length) return { id };

      const columns = Object.keys(patch);
      const { data: before } = await ctx.db
        .from("shipment_group_costs")
        .select(["shipment_group_id", ...columns].join(", "))
        .eq("id", id)
        .maybeSingle<Record<string, unknown>>();

      const { error } = await ctx.db
        .from("shipment_group_costs")
        .update(patch as Update<"shipment_group_costs">)
        .eq("id", id);
      if (error) throw shipmentError(error.message);

      // Editing a cost is a money edit: changing the amount re-fires
      // allocate_shipment_costs, which rewrites freight on every container in
      // the booking and moves the canonical margin with it. Log what changed,
      // in the same shape updateContainer uses.
      const groupId = before?.shipment_group_id as string | null | undefined;
      if (groupId) {
        const changed = Object.fromEntries(
          columns
            .filter((c) => (before?.[c] ?? null) !== (patch[c] ?? null))
            .map((c) => [c, { from: before?.[c] ?? null, to: patch[c] ?? null }]),
        );
        if (Object.keys(changed).length) {
          await logEvent(ctx.db, groupId, "cost_updated", ctx.claims.sub, { costId: id, changed });
        }
      }

      return { id };
    }),

  /**
   * Record the storage path of a cost's vendor invoice PDF. The upload itself
   * happens client-side against the private `shipment-documents` bucket, whose
   * storage policies are the actual guard — this only writes down where the
   * file landed, exactly as `attachDocumentFile` does for export paperwork.
   */
  attachCostInvoice: requirePermission("admin:view")
    .input(z.object({ id: z.string().uuid(), path: z.string().trim().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.db
        .from("shipment_group_costs")
        .update({ invoice_document_path: input.path })
        .eq("id", input.id);
      if (error) throw shipmentError(error.message);
      return { id: input.id };
    }),

  removeCost: requirePermission("admin:view")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data: cost } = await ctx.db
        .from("shipment_group_costs")
        .select("shipment_group_id, cost_type, amount")
        .eq("id", input.id)
        .maybeSingle();

      const { error } = await ctx.db.from("shipment_group_costs").delete().eq("id", input.id);
      if (error) throw shipmentError(error.message);

      if (cost) {
        await logEvent(ctx.db, cost.shipment_group_id, "cost_removed", ctx.claims.sub, {
          costType: cost.cost_type,
          amount: cost.amount,
        });
      }
      return { id: input.id };
    }),

  // ===========================================================================
  // Documents
  // ===========================================================================
  // A document's `payload` is the frozen record of what it SAID; the PDF is a
  // view of that payload and renders from nothing else. These procedures own
  // the payload's lifecycle. The PDF itself is NOT here — it lives at
  // app/api/shipment-documents/[documentId]/pdf, because httpBatchLink +
  // superjson would base64 a binary into a batch envelope.

  /** Every document on a shipment, newest first — the Documents card's table. */
  documents: requirePermission("admin:view")
    .input(z.object({ groupId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data } = await ctx.db
        .from("shipment_documents")
        .select(
          "id, doc_type, status, document_number, revision, payload, generated_path, uploaded_path, issued_at, voided_at, void_reason, created_at, created_by:user_profiles(first_name, last_name), containers:shipment_document_containers(container_id)",
        )
        .eq("shipment_group_id", input.groupId)
        .order("created_at", { ascending: false });

      return (data ?? []).map(({ containers, ...doc }) => ({
        ...doc,
        containerIds: (containers ?? []).map((c) => c.container_id),
        containerCount: containers?.length ?? 0,
      }));
    }),

  /**
   * The prefilled payload for a new document. NEVER persisted — this is what
   * the export sheet opens with, and everything in it stays editable.
   */
  documentDraft: requirePermission("admin:view")
    .input(
      z.object({
        groupId: z.string().uuid(),
        docType: DOC_TYPE,
        containerIds: z.array(z.string().uuid()).nullish(),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!isBuiltDocType(input.docType)) {
        // The remaining types arrive in later stages. Say so rather than
        // returning {} and letting the sheet render an empty form that looks
        // like a data problem.
        throw new TRPCError({
          code: "NOT_IMPLEMENTED",
          message: `${input.docType.replace(/_/g, " ")} is not built yet.`,
        });
      }
      return buildDraftPayload(ctx.db, input.groupId, input.docType, input.containerIds ?? null);
    }),

  /** Save a new draft document and link the containers it covers. */
  createDocument: requirePermission("admin:view")
    .input(
      z.object({
        groupId: z.string().uuid(),
        docType: DOC_TYPE,
        containerIds: z.array(z.string().uuid()).min(1),
        payload: z.record(z.string(), z.unknown()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // A placeholder type has no builder and no `doc_type` value — refuse it
      // here too, not just by disabling its button.
      if (!isBuiltDocType(input.docType)) {
        throw new TRPCError({
          code: "NOT_IMPLEMENTED",
          message: `${input.docType.replace(/_/g, " ")} is not built yet.`,
        });
      }
      const documentNumber = await allocateDocumentNumber(ctx.db, input.groupId, input.docType);

      const { data: doc, error } = await ctx.db
        .from("shipment_documents")
        .insert({
          shipment_group_id: input.groupId,
          doc_type: input.docType,
          document_number: documentNumber,
          revision: revisionOf(documentNumber),
          payload: asJson({ ...input.payload, documentNumber }),
          created_by: ctx.claims.sub,
        })
        .select("id, document_number")
        .single();
      if (error || !doc) throw shipmentError(error?.message ?? "Could not create the document.");

      const { error: linkError } = await ctx.db
        .from("shipment_document_containers")
        .insert(input.containerIds.map((container_id) => ({ document_id: doc.id, container_id })));
      if (linkError) {
        // Leave no half-built document behind — the same self-cleanup as
        // createFromTransactions.
        await ctx.db.from("shipment_documents").delete().eq("id", doc.id);
        throw shipmentError(linkError.message);
      }

      await logEvent(ctx.db, input.groupId, "document_drafted", ctx.claims.sub, {
        documentNumber: doc.document_number,
        docType: input.docType,
        containers: input.containerIds.length,
      });
      return { id: doc.id, documentNumber: doc.document_number };
    }),

  /**
   * Update a document. Drafts take anything; once issued the database refuses
   * every payload key outside `shipment_document_editable_keys`, so this is
   * ergonomics rather than enforcement.
   */
  updateDocument: requirePermission("admin:view")
    .input(
      z.object({
        id: z.string().uuid(),
        payload: z.record(z.string(), z.unknown()).optional(),
        containerIds: z.array(z.string().uuid()).min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.payload) {
        const { error } = await ctx.db
          .from("shipment_documents")
          .update({ payload: asJson(input.payload) })
          .eq("id", input.id);
        if (error) throw shipmentError(error.message);
      }

      if (input.containerIds) {
        // Membership is replace-not-merge. The trigger refuses this outright
        // once the document is issued, which is what makes a roll a reissue.
        const { error: delError } = await ctx.db
          .from("shipment_document_containers")
          .delete()
          .eq("document_id", input.id);
        if (delError) throw shipmentError(delError.message);

        const { error: insError } = await ctx.db
          .from("shipment_document_containers")
          .insert(
            input.containerIds.map((container_id) => ({ document_id: input.id, container_id })),
          );
        if (insError) throw shipmentError(insError.message);
      }

      return { id: input.id };
    }),

  /** Issue a document: validate the payload, freeze it, record the event. */
  issueDocument: requirePermission("admin:view")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data: doc } = await ctx.db
        .from("shipment_documents")
        .select("id, shipment_group_id, doc_type, status, document_number, payload")
        .eq("id", input.id)
        .maybeSingle();
      if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Document not found." });
      if (doc.status !== "draft") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `${doc.document_number} is already ${doc.status}.`,
        });
      }

      // The same schema that types the PDF template. A payload that cannot be
      // rendered must not become the record of what was sent.
      const parsed = payloadSchemaFor(doc.doc_type).safeParse(doc.payload);
      if (!parsed.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `This document is missing required fields: ${parsed.error.issues
            .map((i) => i.path.join("."))
            .filter(Boolean)
            .slice(0, 5)
            .join(", ")}`,
        });
      }

      const { error } = await ctx.db
        .from("shipment_documents")
        .update({ status: "issued", issued_at: new Date().toISOString() })
        .eq("id", input.id);
      if (error) throw shipmentError(error.message);

      await logEvent(ctx.db, doc.shipment_group_id, "document_issued", ctx.claims.sub, {
        documentNumber: doc.document_number,
        docType: doc.doc_type,
      });
      return { id: input.id };
    }),

  /**
   * Void an issued document. THE ROLL PATH: container coverage is frozen at
   * issue, so a box leaving a booking is corrected by voiding the invoice and
   * exporting the next number — never by editing what was already sent.
   */
  voidDocument: requirePermission("admin:view")
    .input(z.object({ id: z.string().uuid(), reason: z.string().trim().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { data: doc } = await ctx.db
        .from("shipment_documents")
        .select("id, shipment_group_id, doc_type, status, document_number")
        .eq("id", input.id)
        .maybeSingle();
      if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Document not found." });
      if (doc.status !== "issued") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            doc.status === "draft"
              ? "A draft has not been sent anywhere — delete it instead of voiding it."
              : `${doc.document_number} is already ${doc.status}.`,
        });
      }

      const { error } = await ctx.db
        .from("shipment_documents")
        .update({
          status: "void",
          voided_at: new Date().toISOString(),
          void_reason: input.reason,
        })
        .eq("id", input.id);
      if (error) throw shipmentError(error.message);

      await logEvent(ctx.db, doc.shipment_group_id, "document_voided", ctx.claims.sub, {
        documentNumber: doc.document_number,
        docType: doc.doc_type,
        reason: input.reason,
      });
      return { id: input.id };
    }),

  /** Delete a draft. Issued and voided rows are the audit trail — the DB refuses. */
  deleteDocument: requirePermission("admin:view")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data: doc } = await ctx.db
        .from("shipment_documents")
        .select("id, shipment_group_id, document_number, status")
        .eq("id", input.id)
        .maybeSingle();
      if (!doc) return { id: input.id };

      const { error } = await ctx.db.from("shipment_documents").delete().eq("id", input.id);
      if (error) throw shipmentError(error.message);

      await logEvent(ctx.db, doc.shipment_group_id, "document_deleted", ctx.claims.sub, {
        documentNumber: doc.document_number,
      });
      return { id: input.id };
    }),

  /** Record the storage path of a counter-signed original uploaded by the desk. */
  attachDocumentFile: requirePermission("admin:view")
    .input(z.object({ id: z.string().uuid(), path: z.string().trim().min(1) }))
    .mutation(async ({ ctx, input }) => {
      // `uploaded_path` is not a payload key, so this stays legal on an issued
      // document: the executed original arriving is not an edit to the record.
      const { error } = await ctx.db
        .from("shipment_documents")
        .update({ uploaded_path: input.path })
        .eq("id", input.id);
      if (error) throw shipmentError(error.message);
      return { id: input.id };
    }),
});

/** Append one audit row to a shipment's timeline. */
/** The shipment's purchase (parent deal), or null before the card is saved. */
async function purchaseOf(db: ExportShipmentDb, groupId: string) {
  const { data } = await db
    .from("shipment_group_deals")
    .select("matched_order_id")
    .eq("shipment_group_id", groupId)
    .maybeSingle();
  if (!data) return null;
  const { data: parent } = await db
    .from("matched_orders")
    .select(PURCHASE_SELECT)
    .eq("id", data.matched_order_id)
    .maybeSingle();
  return parent ?? null;
}

/**
 * Keep the parent's qty / quantity_lbs equal to its legs (count and sum), so
 * the purchase reads as "3 containers, 133,500 lb" wherever TPE shows a deal.
 */
async function syncPurchaseTotals(db: ExportShipmentDb, parentId: string): Promise<void> {
  const { data: legs } = await db
    .from("matched_orders")
    .select("quantity_lbs")
    .eq("parent_matched_order_id", parentId);
  const count = legs?.length ?? 0;
  const lbs = (legs ?? []).reduce((sum, l) => sum + Number(l.quantity_lbs ?? 0), 0);
  await db
    .from("matched_orders")
    .update({ qty: Math.max(1, count), quantity_lbs: lbs })
    .eq("id", parentId);
}

async function logEvent(
  db: ExportShipmentDb,
  groupId: string,
  eventType: string,
  performedBy: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await db.from("shipment_group_events").insert({
    shipment_group_id: groupId,
    event_type: eventType,
    payload: asJson(payload),
    performed_by: performedBy,
  });
}

/**
 * Allocate the next document number: `{shipmentNumber}-{typeCode}-{n}`, e.g.
 * `SHP-01041-CI-2`.
 *
 * `n` is the reissue counter, and it counts EVERY document of that type on the
 * shipment — including voided ones — so a voided `-1` can never have its number
 * handed out again. `document_number` is UNIQUE, so the worst case if two
 * operators export at the same instant is a refused insert rather than two
 * documents sharing an identity.
 */
async function allocateDocumentNumber(
  db: ExportShipmentDb,
  groupId: string,
  docType: PersistedDocType,
): Promise<string> {
  const { data: group } = await db
    .from("shipment_groups")
    .select("display_number")
    .eq("id", groupId)
    .maybeSingle();
  if (!group) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Shipment not found." });
  }

  const { count } = await db
    .from("shipment_documents")
    .select("id", { count: "exact", head: true })
    .eq("shipment_group_id", groupId)
    .eq("doc_type", docType);

  const shipmentNumber = formatShipmentNumber(group.display_number);
  return `${shipmentNumber}-${DOC_TYPE_META[docType].code}-${(count ?? 0) + 1}`;
}

/** The trailing counter in a document number, for the `revision` column. */
function revisionOf(documentNumber: string): number {
  const m = /-(\d+)$/.exec(documentNumber);
  return m ? Number(m[1]) : 1;
}

/**
 * Compose a document party from org-level identity (name, tax ids, contact)
 * plus the org's resolved address-book entry — the only address source
 * (organizations carries no address columns since 20260902042751). A null
 * resolution prints a name-plus-contact block with blank address lines; the
 * desk completes it in the export sheet rather than being blocked.
 */
function partyFromOrg<T extends { name: string; phone: string | null; email: string | null }>(
  org: T,
  resolved: ResolvedOrgAddress | null,
): T & {
  address: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
} {
  return {
    ...org,
    address: resolved?.addressLine1 ?? null,
    address2: resolved?.addressLine2 ?? null,
    city: resolved?.city ?? null,
    state: resolved?.state ?? null,
    zip: resolved?.zip ?? null,
    country: resolved?.country ?? null,
  };
}

/**
 * Build a prefilled document payload from live data.
 *
 * Every fetch happens here and feeds ONE `buildDocumentContext`; the per-type
 * mappers then shape that context and are pure, so they can be tested without a
 * database — and so two documents built from one shipment cannot derive the
 * same fact differently.
 */
async function buildDraftPayload(
  db: ExportShipmentDb,
  groupId: string,
  docType: ShipmentDocType,
  containerIds: string[] | null,
) {
  const { data: group } = await db
    .from("shipment_groups")
    .select(
      "display_number, incoterm, currency, vessel_name, voyage_number, master_bl_number, booking_number, hbl_number, aes_itn, forwarding_agent, fmc_number, loading_terminal, type_of_move, final_destination, freight_terms, dthc_terms, etd, eta, place_of_receipt, place_of_delivery, carrier:organizations(name), pol:locations!shipment_groups_pol_location_id_fkey(name, country), pod:locations!shipment_groups_pod_location_id_fkey(name, country)",
    )
    .eq("id", groupId)
    .maybeSingle();
  if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Shipment not found." });

  let query = db
    .from("shipment_containers")
    .select(
      "id, position, container_number, seal_number, container_type, package_count, package_kind, pallet_count, net_weight_lbs, gross_weight_lbs, marks_and_numbers, lots:shipment_container_lots(lot_number_text, qty_lbs, position), matched_orders(id, display_number, leg_index, parent_matched_order_id, qty, unit, quantity_lbs, tpe_sell_price, freight, buyer_terms, buyer_po, buyer_company_id, buyer_company_text, shipping_terms, tolerance_pct, insurance_terms, shipment_window, product_id, product_text, quality, created_at, products(name))",
    )
    .eq("shipment_group_id", groupId)
    .order("position");
  if (containerIds?.length) query = query.in("id", containerIds);

  const { data: containers } = await query;
  const rawCovered = containers ?? [];

  // A leg prints under its PARENT's number (dealOrderNumber), so resolve those
  // in one round trip — the same shape the shipment detail query builds for the
  // manifest, which is what keeps the two container tables reading alike.
  const parentIds = [
    ...new Set(
      rawCovered
        .map((c) => c.matched_orders?.parent_matched_order_id)
        .filter((id): id is string => !!id),
    ),
  ];
  const parentNumbers = new Map<string, number>();
  if (parentIds.length) {
    const { data: parents } = await db
      .from("matched_orders")
      .select("id, display_number")
      .in("id", parentIds);
    for (const p of parents ?? []) parentNumbers.set(p.id, p.display_number);
  }
  const covered = rawCovered.map((c) => ({
    ...c,
    parent_display_number: c.matched_orders?.parent_matched_order_id
      ? (parentNumbers.get(c.matched_orders.parent_matched_order_id) ?? null)
      : null,
  }));

  // The exporter block. `role = 'exchange'` is TPE's own org — the same lookup
  // convert_matched_order uses. Identity (name, tax_id, phone, …) is
  // org-level; the ADDRESS half is the org's address book — the exchange
  // prints its headquarters, the buyer its billing address.
  const { data: exchangeOrgRaw } = await db
    .from("organizations")
    .select("id, name, phone, email, tax_id, contact_name")
    .eq("role", "exchange")
    .limit(1)
    .maybeSingle();
  const exchangeOrg = exchangeOrgRaw
    ? partyFromOrg(exchangeOrgRaw, await resolveOrgAddress(db, exchangeOrgRaw.id, "headquarters"))
    : null;

  const buyerId = covered.find((c) => c.matched_orders?.buyer_company_id)?.matched_orders
    ?.buyer_company_id;
  const { data: buyerOrgRaw } = buyerId
    ? await db
        .from("organizations")
        .select("id, name, phone, email, tax_id, contact_name, eori, payment_terms_days")
        .eq("id", buyerId)
        .maybeSingle()
    : { data: null };
  const buyerOrg = buyerOrgRaw
    ? partyFromOrg(buyerOrgRaw, await resolveOrgAddress(db, buyerOrgRaw.id, "billing"))
    : null;

  const productId = covered.find((c) => c.matched_orders?.product_id)?.matched_orders?.product_id;
  const { data: product } = productId
    ? await db
        .from("products")
        .select("name, hs_code, country_of_origin")
        .eq("id", productId)
        .maybeSingle()
    : { data: null };

  // The wire block, for the documents that print one. Default account for the
  // shipment's currency, on TPE's own org.
  const { data: exchangeOrgRow } = await db
    .from("organizations")
    .select("id")
    .eq("role", "exchange")
    .limit(1)
    .maybeSingle();
  const { data: bankAccount } = exchangeOrgRow
    ? await db
        .from("bank_accounts")
        .select(
          "beneficiary_name, bank_name, bank_address, swift_code, account_number, aba_routing, iban, currency",
        )
        .eq("org_id", exchangeOrgRow.id)
        .eq("currency", group.currency)
        .eq("is_default", true)
        .maybeSingle()
    : { data: null };

  const context = buildDocumentContext({
    group,
    containers: covered,
    exchangeOrg,
    buyerOrg,
    product,
    bankAccount,
    today: new Date().toISOString().slice(0, 10),
  });

  // A draft payload is not persisted, so it has no number yet. `createDocument`
  // allocates the real one and overwrites this.
  const documentNumber = `${context.refs.shipmentNumber}-${DOC_TYPE_META[docType].code}-?`;

  switch (docType) {
    case "packing_list":
      return buildPackingListDraft({ context, documentNumber });
    case "sales_contract":
      return buildSalesContractDraft({ context, documentNumber });
    case "proforma_invoice":
      return buildProformaInvoiceDraft({ context, documentNumber });
    case "certificate_of_origin":
      return buildCertificateOfOriginDraft({ context, documentNumber });
    default:
      return buildCommercialInvoiceDraft({ context, documentNumber });
  }
}

/**
 * Put transactions onto a shipment, appending them to the manifest.
 *
 * A transaction that has never been containerised gets its row created; one
 * that exists but is unassigned is moved. Shared by `assignContainers` (adding
 * to an open shipment) and `createFromTransactions` (opening one from the
 * ledger), so the eligibility check and the position arithmetic cannot drift
 * between the two entry points.
 */
async function assignToGroup(
  db: ExportShipmentDb,
  groupId: string,
  matchedOrderIds: string[],
): Promise<void> {
  const { data: existing } = await db
    .from("shipment_containers")
    .select("id, matched_order_id, shipment_group_id")
    .in("matched_order_id", matchedOrderIds);
  const byOrder = new Map((existing ?? []).map((c) => [c.matched_order_id, c]));

  const already = (existing ?? []).find(
    (c) => c.shipment_group_id && c.shipment_group_id !== groupId,
  );
  if (already) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "One of these containers already belongs to another shipment. Roll it out of that shipment first.",
    });
  }

  const { data: current } = await db
    .from("shipment_containers")
    .select("position")
    .eq("shipment_group_id", groupId)
    .order("position", { ascending: false })
    .limit(1);
  let next = (current?.[0]?.position ?? 0) + 1;

  for (const matchedOrderId of matchedOrderIds) {
    const row = byOrder.get(matchedOrderId);
    const result = row
      ? await db
          .from("shipment_containers")
          .update({ shipment_group_id: groupId, position: next })
          .eq("id", row.id)
      : await db.from("shipment_containers").insert({
          matched_order_id: matchedOrderId,
          shipment_group_id: groupId,
          position: next,
        });
    // The guard trigger speaks here — "not international", "not a container",
    // "a conversion parent is a pass-through" — so surface its words.
    if (result.error) throw shipmentError(result.error.message);
    next += 1;
  }
}

/**
 * Close the gaps in a shipment's manifest positions (1..n in current order).
 * Two passes with a large offset, because the partial unique index would fire
 * mid-shuffle if positions were rewritten in place.
 */
async function renumber(db: ExportShipmentDb, groupId: string): Promise<void> {
  const { data: rows } = await db
    .from("shipment_containers")
    .select("id, position")
    .eq("shipment_group_id", groupId)
    .order("position");
  if (!rows?.length) return;

  const OFFSET = 10_000;
  for (const row of rows) {
    await db
      .from("shipment_containers")
      .update({ position: row.position + OFFSET })
      .eq("id", row.id);
  }
  let position = 1;
  for (const row of rows) {
    await db.from("shipment_containers").update({ position }).eq("id", row.id);
    position += 1;
  }
}
