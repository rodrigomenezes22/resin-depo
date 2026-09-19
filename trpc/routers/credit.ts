// =============================================================================
// Credit — limits, receivables, payments, aging (resin-depo)
// =============================================================================
// Reads come from two SQL views that derive everything from data the desk
// already enters (purchases, issued Commercial Invoices, payments):
//   shipment_receivables — per shipment: amount owed (invoice total or purchase
//                          estimate), paid, balance, due date, days late
//   buyer_credit         — per buyer: limit, exposure, available, aging buckets
// Writes are two: record / delete a payment, and change a credit limit (with an
// audit row). organizations.credit_available is a trigger-maintained mirror of
// buyer_credit.available, kept for TPE compatibility; the UI reads the view.
//
// Numbers are numeric(14,2) in SQL and arrive as strings through PostgREST;
// every row is normalised to numbers here so components never Number() them.
// =============================================================================

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, requirePermission, type TRPCContext } from "../init";

const uuid = z.string().uuid();
const money = z.number().positive().max(999_999_999);

export const PAYMENT_METHODS = [
  ["wire", "Wire"],
  ["ach", "ACH"],
  ["check", "Check"],
  ["credit_card", "Credit card"],
  ["credit_note", "Credit note"],
  ["write_off", "Write-off"],
  ["other", "Other"],
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number][0];
const methodSchema = z.enum(PAYMENT_METHODS.map(([v]) => v) as [PaymentMethod, ...PaymentMethod[]]);

const n = (v: unknown) => (v == null ? 0 : Number(v));

function fail(code: TRPCError["code"], message: string): never {
  throw new TRPCError({ code, message });
}

const CREDIT_SELECT =
  "organization_id, name, role, credit_limit, payment_terms_days, exposure, available, bucket_current, bucket_1_30, bucket_31_60, bucket_61_90, bucket_90_plus, open_shipments, oldest_due, max_days_late, lifetime_billed, lifetime_paid";

const RECEIVABLE_SELECT =
  "shipment_group_id, display_number, status, currency, etd, purchase_id, order_number, buyer_org_id, buyer_name, container_count, contract_lbs, invoice_id, invoice_number, invoice_issued_at, amount, amount_source, paid, last_paid_at, payment_count, terms_days, invoice_due, purchase_created_at, balance, due_date, days_late, is_open";

const PAYMENT_SELECT =
  "id, shipment_group_id, buyer_org_id, amount, currency, paid_at, method, reference_number, notes, created_at, recorded_by:user_profiles(first_name, last_name)";

type CreditRaw = {
  organization_id: string | null;
  name: string | null;
  role: string | null;
  credit_limit: number | null;
  payment_terms_days: number | null;
  exposure: number | null;
  available: number | null;
  bucket_current: number | null;
  bucket_1_30: number | null;
  bucket_31_60: number | null;
  bucket_61_90: number | null;
  bucket_90_plus: number | null;
  open_shipments: number | null;
  oldest_due: string | null;
  max_days_late: number | null;
  lifetime_billed: number | null;
  lifetime_paid: number | null;
};

function creditRow(r: CreditRaw) {
  return {
    organizationId: r.organization_id!,
    name: r.name ?? "—",
    role: r.role ?? "buyer",
    creditLimit: n(r.credit_limit),
    paymentTermsDays: n(r.payment_terms_days),
    exposure: n(r.exposure),
    available: n(r.available),
    buckets: {
      current: n(r.bucket_current),
      d1_30: n(r.bucket_1_30),
      d31_60: n(r.bucket_31_60),
      d61_90: n(r.bucket_61_90),
      d90plus: n(r.bucket_90_plus),
    },
    openShipments: n(r.open_shipments),
    oldestDue: r.oldest_due,
    maxDaysLate: r.max_days_late == null ? null : Number(r.max_days_late),
    lifetimeBilled: n(r.lifetime_billed),
    lifetimePaid: n(r.lifetime_paid),
  };
}

type ReceivableRaw = {
  shipment_group_id: string | null;
  display_number: number | null;
  status: string | null;
  currency: string | null;
  etd: string | null;
  purchase_id: string | null;
  order_number: number | null;
  buyer_org_id: string | null;
  buyer_name: string | null;
  container_count: number | null;
  contract_lbs: number | null;
  invoice_id: string | null;
  invoice_number: string | null;
  invoice_issued_at: string | null;
  amount: number | null;
  amount_source: string | null;
  paid: number | null;
  last_paid_at: string | null;
  payment_count: number | null;
  terms_days: number | null;
  invoice_due: string | null;
  purchase_created_at: string | null;
  balance: number | null;
  due_date: string | null;
  days_late: number | null;
  is_open: boolean | null;
};

function receivableRow(r: ReceivableRaw) {
  return {
    shipmentGroupId: r.shipment_group_id!,
    displayNumber: r.display_number ?? 0,
    status: r.status ?? "draft",
    currency: r.currency ?? "USD",
    etd: r.etd,
    purchaseId: r.purchase_id,
    orderNumber: r.order_number,
    buyerOrgId: r.buyer_org_id,
    buyerName: r.buyer_name,
    containerCount: n(r.container_count),
    contractLbs: n(r.contract_lbs),
    invoiceId: r.invoice_id,
    invoiceNumber: r.invoice_number,
    invoiceIssuedAt: r.invoice_issued_at,
    amount: n(r.amount),
    amountSource: (r.amount_source ?? "estimate") as "invoice" | "estimate",
    paid: n(r.paid),
    lastPaidAt: r.last_paid_at,
    paymentCount: n(r.payment_count),
    termsDays: n(r.terms_days),
    balance: n(r.balance),
    dueDate: r.due_date,
    daysLate: r.days_late == null ? null : Number(r.days_late),
    isOpen: Boolean(r.is_open),
  };
}

/** The purchase + buyer behind a shipment, or null before the Purchase card is saved. */
async function purchaseFor(db: TRPCContext["db"], groupId: string) {
  const { data } = await db
    .from("shipment_group_deals")
    .select("matched_order_id, matched_orders(buyer_company_id, buyer_company_text)")
    .eq("shipment_group_id", groupId)
    .maybeSingle();
  if (!data?.matched_orders?.buyer_company_id) return null;
  return {
    purchaseId: data.matched_order_id,
    buyerOrgId: data.matched_orders.buyer_company_id,
    buyerName: data.matched_orders.buyer_company_text,
  };
}

export const creditRouter = createTRPCRouter({
  /** Every buyer with a limit or a receivable — the /credit grid. */
  overview: requirePermission("admin:view").query(async ({ ctx }) => {
    const { data, error } = await ctx.db
      .from("buyer_credit")
      .select(CREDIT_SELECT)
      .in("role", ["buyer", "distributor", "seller", "partner"])
      .order("exposure", { ascending: false })
      .order("name");
    if (error) fail("INTERNAL_SERVER_ERROR", error.message);
    return (data ?? []).map((r) => creditRow(r as CreditRaw));
  }),

  /** One buyer: credit row, every receivable, payments, limit history. */
  buyer: requirePermission("admin:view")
    .input(z.object({ orgId: uuid }))
    .query(async ({ ctx, input }) => {
      const [credit, receivables, payments, history] = await Promise.all([
        ctx.db
          .from("buyer_credit")
          .select(CREDIT_SELECT)
          .eq("organization_id", input.orgId)
          .maybeSingle(),
        ctx.db
          .from("shipment_receivables")
          .select(RECEIVABLE_SELECT)
          .eq("buyer_org_id", input.orgId)
          .order("is_open", { ascending: false })
          .order("due_date", { ascending: true, nullsFirst: false }),
        ctx.db
          .from("payments")
          .select(PAYMENT_SELECT)
          .eq("buyer_org_id", input.orgId)
          .order("paid_at", { ascending: false })
          .order("created_at", { ascending: false }),
        ctx.db
          .from("organization_credit_limit_changes")
          .select(
            "id, old_limit, new_limit, reason, changed_at, changed_by:user_profiles(first_name, last_name)",
          )
          .eq("organization_id", input.orgId)
          .order("changed_at", { ascending: false }),
      ]);
      for (const r of [credit, receivables, payments, history]) {
        if (r.error) fail("INTERNAL_SERVER_ERROR", r.error.message);
      }
      if (!credit.data) fail("NOT_FOUND", "Buyer not found.");
      return {
        credit: creditRow(credit.data as CreditRaw),
        receivables: (receivables.data ?? []).map((r) => receivableRow(r as ReceivableRaw)),
        payments: (payments.data ?? []).map((p) => ({ ...p, amount: n(p.amount) })),
        history: (history.data ?? []).map((h) => ({
          ...h,
          old_limit: n(h.old_limit),
          new_limit: n(h.new_limit),
        })),
      };
    }),

  /** One shipment's receivable + payments — the Payments card. */
  shipment: requirePermission("admin:view")
    .input(z.object({ groupId: uuid }))
    .query(async ({ ctx, input }) => {
      const [rec, pays] = await Promise.all([
        ctx.db
          .from("shipment_receivables")
          .select(RECEIVABLE_SELECT)
          .eq("shipment_group_id", input.groupId)
          .maybeSingle(),
        ctx.db
          .from("payments")
          .select(PAYMENT_SELECT)
          .eq("shipment_group_id", input.groupId)
          .order("paid_at", { ascending: false })
          .order("created_at", { ascending: false }),
      ]);
      if (rec.error) fail("INTERNAL_SERVER_ERROR", rec.error.message);
      if (pays.error) fail("INTERNAL_SERVER_ERROR", pays.error.message);
      const receivable = rec.data ? receivableRow(rec.data as ReceivableRaw) : null;
      let buyerCredit = null;
      if (receivable?.buyerOrgId) {
        const { data } = await ctx.db
          .from("buyer_credit")
          .select(CREDIT_SELECT)
          .eq("organization_id", receivable.buyerOrgId)
          .maybeSingle();
        buyerCredit = data ? creditRow(data as CreditRaw) : null;
      }
      return {
        receivable,
        buyerCredit,
        payments: (pays.data ?? []).map((p) => ({ ...p, amount: n(p.amount) })),
      };
    }),

  /**
   * Soft credit check for the Purchase card: what the buyer has available and
   * what is left after a purchase of `addValue`, excluding this shipment's own
   * current balance (it is being replaced, not added).
   */
  check: requirePermission("admin:view")
    .input(z.object({ orgId: uuid, addValue: z.number().min(0), excludeGroupId: uuid.optional() }))
    .query(async ({ ctx, input }) => {
      const { data: credit } = await ctx.db
        .from("buyer_credit")
        .select(CREDIT_SELECT)
        .eq("organization_id", input.orgId)
        .maybeSingle();
      if (!credit) return null;
      let own = 0;
      if (input.excludeGroupId) {
        const { data: r } = await ctx.db
          .from("shipment_receivables")
          .select("balance, is_open")
          .eq("shipment_group_id", input.excludeGroupId)
          .maybeSingle();
        if (r?.is_open) own = n(r.balance);
      }
      const row = creditRow(credit as CreditRaw);
      const exposure = row.exposure - own;
      const available = row.creditLimit - exposure;
      const after = available - input.addValue;
      return {
        creditLimit: row.creditLimit,
        exposure,
        available,
        afterThis: after,
        over: after < 0,
        nearLimit: row.creditLimit > 0 && after >= 0 && after < row.creditLimit * 0.2,
      };
    }),

  /** Change a buyer's credit limit; every change is audited. */
  setCreditLimit: requirePermission("admin:view")
    .input(
      z.object({
        orgId: uuid,
        creditLimit: z.number().min(0).max(999_999_999),
        reason: z.string().trim().max(300).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data: org, error } = await ctx.db
        .from("organizations")
        .select("id, credit_limit")
        .eq("id", input.orgId)
        .maybeSingle();
      if (error) fail("INTERNAL_SERVER_ERROR", error.message);
      if (!org) fail("NOT_FOUND", "Buyer not found.");
      const oldLimit = n(org.credit_limit);
      if (oldLimit === input.creditLimit) return { changed: false, belowExposure: false };

      const { error: upErr } = await ctx.db
        .from("organizations")
        .update({ credit_limit: input.creditLimit })
        .eq("id", input.orgId);
      if (upErr) fail("INTERNAL_SERVER_ERROR", upErr.message);
      const { error: logErr } = await ctx.db.from("organization_credit_limit_changes").insert({
        organization_id: input.orgId,
        old_limit: oldLimit,
        new_limit: input.creditLimit,
        changed_by_user_id: ctx.claims.sub,
        reason: input.reason?.trim() || null,
      });
      if (logErr) fail("INTERNAL_SERVER_ERROR", logErr.message);

      const { data: credit } = await ctx.db
        .from("buyer_credit")
        .select("exposure")
        .eq("organization_id", input.orgId)
        .maybeSingle();
      return { changed: true, belowExposure: n(credit?.exposure) > input.creditLimit };
    }),

  /** Record money received against a shipment's purchase. */
  recordPayment: requirePermission("admin:view")
    .input(
      z.object({
        groupId: uuid,
        amount: money,
        paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        method: methodSchema.optional().nullable(),
        referenceNumber: z.string().trim().max(120).optional().nullable(),
        notes: z.string().trim().max(1000).optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const purchase = await purchaseFor(ctx.db, input.groupId);
      if (!purchase) fail("PRECONDITION_FAILED", "This shipment has no purchase yet.");
      const { data: group } = await ctx.db
        .from("shipment_groups")
        .select("currency")
        .eq("id", input.groupId)
        .maybeSingle();

      const { data, error } = await ctx.db
        .from("payments")
        .insert({
          reference_id: purchase.purchaseId,
          shipment_group_id: input.groupId,
          buyer_org_id: purchase.buyerOrgId,
          amount: input.amount,
          currency: group?.currency ?? "USD",
          paid_at: input.paidAt,
          method: input.method ?? null,
          reference_number: input.referenceNumber?.trim() || null,
          notes: input.notes?.trim() || null,
          recorded_by: ctx.claims.sub,
        })
        .select("id")
        .single();
      if (error) fail("INTERNAL_SERVER_ERROR", error.message);

      await ctx.db.from("shipment_group_events").insert({
        shipment_group_id: input.groupId,
        event_type: "container_updated",
        payload: {
          scope: "payment",
          paymentId: data.id,
          amount: input.amount,
          method: input.method ?? null,
          referenceNumber: input.referenceNumber ?? null,
        },
        performed_by: ctx.claims.sub,
      });
      return { id: data.id };
    }),

  /** Remove a payment entered by mistake. Logged on the shipment timeline. */
  deletePayment: requirePermission("admin:view")
    .input(z.object({ id: uuid }))
    .mutation(async ({ ctx, input }) => {
      const { data: p } = await ctx.db
        .from("payments")
        .select("id, shipment_group_id, amount, method, reference_number")
        .eq("id", input.id)
        .maybeSingle();
      if (!p) fail("NOT_FOUND", "Payment not found.");
      const { error } = await ctx.db.from("payments").delete().eq("id", input.id);
      if (error) fail("INTERNAL_SERVER_ERROR", error.message);
      await ctx.db.from("shipment_group_events").insert({
        shipment_group_id: p.shipment_group_id,
        event_type: "container_updated",
        payload: {
          scope: "payment",
          removed: true,
          paymentId: p.id,
          amount: n(p.amount),
          method: p.method,
          referenceNumber: p.reference_number,
        },
        performed_by: ctx.claims.sub,
      });
      return { id: input.id, groupId: p.shipment_group_id };
    }),
});
