// =============================================================================
// Reference data — parties, carriers, products, ports, the company, bank
// =============================================================================
// In TPE these rows come from the CRM, the product catalogue, the locations
// directory and the admin org pages. resin-depo has none of that, so the
// export team maintains the small lookup tables the documents need through
// the Settings pages (and inline from the container drawer). Every write keeps
// TPE's row shapes so the data imports later:
//
//   · a party = one `organizations` row + one `locations(kind='office')` row
//     linked twice through `organization_locations` (headquarters + billing,
//     both primary) — exactly what TPE's address backfill (20260902042751)
//     produced, so `resolveOrgAddress(db, id, "billing" | "headquarters")`
//     resolves for document party blocks.
//   · the company = the single `organizations.role = 'exchange'` row; the
//     export router reads it as the seller/exporter and looks up its default
//     `bank_accounts` row for the wire block.
//   · a port = `locations(kind='port')` with country + unlocode.
// =============================================================================

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { resolveOrgAddress } from "@/lib/locations/queries";
import type { Database } from "@/lib/supabase/database.types";

import { createTRPCRouter, requirePermission } from "../init";

const uuid = z.string().uuid();
const text = z.string().trim().max(200);
const optText = text.optional().nullable();

/** Turn "" into null so optional text columns stay NULL rather than "". */
const nul = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

const addressInput = z.object({
  line1: optText,
  line2: optText,
  city: optText,
  state: optText,
  zip: optText,
  country: optText,
});

const PARTY_ROLES = ["buyer", "seller", "distributor", "service_provider", "partner"] as const;
const SERVICE_KINDS = ["freight", "warehouse", "both"] as const;

const partyFields = z.object({
  name: text.min(1),
  role: z.enum(PARTY_ROLES),
  serviceKind: z.enum(SERVICE_KINDS).optional().nullable(),
  phone: optText,
  email: optText,
  taxId: optText,
  eori: optText,
  contactName: optText,
  paymentTermsDays: z.number().int().min(0).max(365).optional(),
  address: addressInput.optional(),
});

const companyFields = z.object({
  name: text.min(1),
  phone: optText,
  email: optText,
  taxId: optText,
  eori: optText,
  contactName: optText,
  address: addressInput.optional(),
});

const productFields = z.object({
  name: text.min(1),
  baseUnit: z.enum(["kg", "lb", "mt"]).default("lb"),
  hsCode: optText,
  countryOfOrigin: optText,
});

const portFields = z.object({
  name: text.min(1),
  city: optText,
  state: optText,
  country: optText,
  unlocode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}[A-Z0-9]{3}$/, "UN/LOCODE is 5 characters, e.g. USHOU")
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null)),
});

const bankFields = z.object({
  label: optText,
  beneficiaryName: text.min(1),
  bankName: text.min(1),
  bankAddress: optText,
  swiftCode: optText,
  accountNumber: optText,
  abaRouting: optText,
  iban: optText,
  currency: z.string().trim().length(3).toUpperCase().default("USD"),
  isDefault: z.boolean().default(false),
});

function fail(code: TRPCError["code"], message: string): never {
  throw new TRPCError({ code, message });
}

function dbFail(error: { message: string; code?: string }, what: string): never {
  if (error.code === "23505") fail("PRECONDITION_FAILED", `${what} already exists.`);
  fail("INTERNAL_SERVER_ERROR", error.message);
}

type DB = Parameters<typeof resolveOrgAddress>[0];
type Update<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

/**
 * Upsert an org's headquarters address. TPE's shape: one office location,
 * linked as both `headquarters` and `billing` (primary). If a HQ link exists
 * the location is patched in place; otherwise location + links are created.
 */
async function writeHeadquarters(
  db: DB,
  orgId: string,
  orgName: string,
  address: z.infer<typeof addressInput>,
) {
  const patch = {
    address_line1: nul(address.line1),
    address_line2: nul(address.line2),
    city: nul(address.city),
    state: nul(address.state),
    zip: nul(address.zip),
    country: nul(address.country),
  };

  const { data: hq, error: hqError } = await db
    .from("organization_locations")
    .select("location_id")
    .eq("organization_id", orgId)
    .eq("role", "headquarters")
    .maybeSingle();
  if (hqError) dbFail(hqError, "Address");

  if (hq) {
    const { error } = await db
      .from("locations")
      .update({ ...patch, name: `${orgName} — Headquarters` })
      .eq("id", hq.location_id);
    if (error) dbFail(error, "Address");
    return hq.location_id;
  }

  const { data: loc, error: locError } = await db
    .from("locations")
    .insert({
      ...patch,
      name: `${orgName} — Headquarters`,
      kind: "office",
      operated_by_org_id: orgId,
    })
    .select("id")
    .single();
  if (locError) dbFail(locError, "Address");

  const { error: linkError } = await db.from("organization_locations").insert([
    { organization_id: orgId, location_id: loc.id, role: "headquarters", is_primary: true },
    { organization_id: orgId, location_id: loc.id, role: "billing", is_primary: true },
  ]);
  if (linkError) dbFail(linkError, "Address link");
  return loc.id;
}

async function orgWithAddress(db: DB, orgId: string) {
  const { data: org, error } = await db
    .from("organizations")
    .select(
      "id, name, role, service_kind, phone, email, tax_id, eori, contact_name, payment_terms_days, deactivated_at, created_at",
    )
    .eq("id", orgId)
    .single();
  if (error) dbFail(error, "Party");
  const address = await resolveOrgAddress(db, orgId, "headquarters");
  return { ...org, address };
}

export const referenceRouter = createTRPCRouter({
  // ---------------------------------------------------------------------------
  // Parties (buyers, carriers, other counterparties)
  // ---------------------------------------------------------------------------
  parties: createTRPCRouter({
    list: requirePermission("admin:view")
      .input(
        z
          .object({
            roles: z.array(z.enum(PARTY_ROLES)).optional(),
            search: z.string().trim().optional(),
            includeDeactivated: z.boolean().optional(),
          })
          .optional(),
      )
      .query(async ({ ctx, input }) => {
        let q = ctx.db
          .from("organizations")
          .select(
            "id, name, role, service_kind, phone, email, tax_id, eori, contact_name, payment_terms_days, deactivated_at, created_at, links:organization_locations(role, is_primary, locations(city, state, country)), deals:matched_orders!matched_orders_buyer_company_id_fkey(count)",
          )
          .neq("role", "exchange")
          .order("name");
        if (input?.roles?.length) q = q.in("role", input.roles);
        if (!input?.includeDeactivated) q = q.is("deactivated_at", null);
        if (input?.search) q = q.ilike("name", `%${input.search}%`);
        // Count purchases (parent deals), not their container legs.
        q = q.is("deals.parent_matched_order_id", null);
        const { data, error } = await q;
        if (error) dbFail(error, "Parties");
        return (data ?? []).map(({ links, deals, ...org }) => {
          const hq = links.find((l) => l.role === "headquarters")?.locations ?? null;
          return {
            ...org,
            city: hq?.city ?? null,
            state: hq?.state ?? null,
            country: hq?.country ?? null,
            // PostgREST count embed: [{ count: n }]. Purchases (parent deals) for this party.
            deal_count: deals?.[0]?.count ?? 0,
          };
        });
      }),

    get: requirePermission("admin:view")
      .input(z.object({ id: uuid }))
      .query(({ ctx, input }) => orgWithAddress(ctx.db, input.id)),

    create: requirePermission("admin:view")
      .input(partyFields)
      .mutation(async ({ ctx, input }) => {
        const { data: org, error } = await ctx.db
          .from("organizations")
          .insert({
            name: input.name,
            role: input.role,
            service_kind:
              input.role === "service_provider" ? (input.serviceKind ?? "freight") : null,
            phone: nul(input.phone),
            email: nul(input.email),
            tax_id: nul(input.taxId),
            eori: nul(input.eori),
            contact_name: nul(input.contactName),
            payment_terms_days: input.paymentTermsDays ?? 30,
          })
          .select("id")
          .single();
        if (error) dbFail(error, "Party");

        if (input.address) {
          try {
            await writeHeadquarters(ctx.db, org.id, input.name, input.address);
          } catch (e) {
            // Roll the org back so a failed address never leaves a half party.
            await ctx.db.from("organizations").delete().eq("id", org.id);
            throw e;
          }
        }
        return orgWithAddress(ctx.db, org.id);
      }),

    update: requirePermission("admin:view")
      .input(partyFields.partial().extend({ id: uuid, deactivated: z.boolean().optional() }))
      .mutation(async ({ ctx, input }) => {
        const patch: Update<"organizations"> = {};
        if (input.name !== undefined) patch.name = input.name;
        if (input.role !== undefined) patch.role = input.role;
        if (input.role !== undefined || input.serviceKind !== undefined) {
          patch.service_kind =
            (input.role ?? "service_provider") === "service_provider"
              ? (input.serviceKind ?? "freight")
              : null;
        }
        if (input.phone !== undefined) patch.phone = nul(input.phone);
        if (input.email !== undefined) patch.email = nul(input.email);
        if (input.taxId !== undefined) patch.tax_id = nul(input.taxId);
        if (input.eori !== undefined) patch.eori = nul(input.eori);
        if (input.contactName !== undefined) patch.contact_name = nul(input.contactName);
        if (input.paymentTermsDays !== undefined) patch.payment_terms_days = input.paymentTermsDays;
        if (input.deactivated !== undefined)
          patch.deactivated_at = input.deactivated ? new Date().toISOString() : null;

        if (Object.keys(patch).length) {
          const { error } = await ctx.db.from("organizations").update(patch).eq("id", input.id);
          if (error) dbFail(error, "Party");
        }
        if (input.address) {
          const { data: org } = await ctx.db
            .from("organizations")
            .select("name")
            .eq("id", input.id)
            .single();
          await writeHeadquarters(ctx.db, input.id, org?.name ?? "Party", input.address);
        }
        return orgWithAddress(ctx.db, input.id);
      }),
  }),

  /** Ocean carriers for the booking card — TPE `orders.carriers`, verbatim. */
  carriers: requirePermission("orders:view").query(async ({ ctx }) => {
    const { data, error } = await ctx.db
      .from("organizations")
      .select("id, name, phone")
      .eq("role", "service_provider")
      .in("service_kind", ["freight", "both"])
      .is("deactivated_at", null)
      .order("name");
    if (error) dbFail(error, "Carriers");
    return data ?? [];
  }),

  // ---------------------------------------------------------------------------
  // Products
  // ---------------------------------------------------------------------------
  products: createTRPCRouter({
    list: requirePermission("admin:view").query(async ({ ctx }) => {
      const { data, error } = await ctx.db
        .from("products")
        .select("id, name, base_unit, hs_code, country_of_origin, created_at")
        .order("name");
      if (error) dbFail(error, "Products");
      return data ?? [];
    }),
    create: requirePermission("admin:view")
      .input(productFields)
      .mutation(async ({ ctx, input }) => {
        const { data, error } = await ctx.db
          .from("products")
          .insert({
            name: input.name,
            base_unit: input.baseUnit,
            hs_code: nul(input.hsCode),
            country_of_origin: nul(input.countryOfOrigin),
          })
          .select("id, name, base_unit, hs_code, country_of_origin, created_at")
          .single();
        if (error) dbFail(error, "Product");
        return data;
      }),
    update: requirePermission("admin:view")
      .input(productFields.partial().extend({ id: uuid }))
      .mutation(async ({ ctx, input }) => {
        const patch: Update<"products"> = {};
        if (input.name !== undefined) patch.name = input.name;
        if (input.baseUnit !== undefined) patch.base_unit = input.baseUnit;
        if (input.hsCode !== undefined) patch.hs_code = nul(input.hsCode);
        if (input.countryOfOrigin !== undefined)
          patch.country_of_origin = nul(input.countryOfOrigin);
        const { data, error } = await ctx.db
          .from("products")
          .update(patch)
          .eq("id", input.id)
          .select("id, name, base_unit, hs_code, country_of_origin, created_at")
          .single();
        if (error) dbFail(error, "Product");
        return data;
      }),
  }),

  // ---------------------------------------------------------------------------
  // Ports — locations(kind = 'port')
  // ---------------------------------------------------------------------------
  ports: createTRPCRouter({
    list: requirePermission("admin:view").query(async ({ ctx }) => {
      const { data, error } = await ctx.db
        .from("locations")
        .select("id, name, city, state, country, unlocode, deactivated_at")
        .eq("kind", "port")
        .order("name");
      if (error) dbFail(error, "Ports");
      return data ?? [];
    }),
    create: requirePermission("admin:view")
      .input(portFields)
      .mutation(async ({ ctx, input }) => {
        const { data, error } = await ctx.db
          .from("locations")
          .insert({
            name: input.name,
            kind: "port",
            city: nul(input.city),
            state: nul(input.state),
            country: nul(input.country),
            unlocode: input.unlocode ?? null,
          })
          .select("id, name, city, state, country, unlocode, deactivated_at")
          .single();
        if (error) dbFail(error, "A port with that UN/LOCODE");
        return data;
      }),
    update: requirePermission("admin:view")
      .input(portFields.partial().extend({ id: uuid, deactivated: z.boolean().optional() }))
      .mutation(async ({ ctx, input }) => {
        const patch: Update<"locations"> = {};
        if (input.name !== undefined) patch.name = input.name;
        if (input.city !== undefined) patch.city = nul(input.city);
        if (input.state !== undefined) patch.state = nul(input.state);
        if (input.country !== undefined) patch.country = nul(input.country);
        if (input.unlocode !== undefined) patch.unlocode = input.unlocode ?? null;
        if (input.deactivated !== undefined)
          patch.deactivated_at = input.deactivated ? new Date().toISOString() : null;
        const { data, error } = await ctx.db
          .from("locations")
          .update(patch)
          .eq("id", input.id)
          .eq("kind", "port")
          .select("id, name, city, state, country, unlocode, deactivated_at")
          .single();
        if (error) dbFail(error, "A port with that UN/LOCODE");
        return data;
      }),
  }),

  // ---------------------------------------------------------------------------
  // Company — the exchange org (seller / exporter on every document)
  // ---------------------------------------------------------------------------
  company: createTRPCRouter({
    get: requirePermission("admin:view").query(async ({ ctx }) => {
      const { data, error } = await ctx.db
        .from("organizations")
        .select("id")
        .eq("role", "exchange")
        .order("created_at")
        .limit(1)
        .maybeSingle();
      if (error) dbFail(error, "Company");
      return data ? orgWithAddress(ctx.db, data.id) : null;
    }),

    upsert: requirePermission("admin:view")
      .input(companyFields)
      .mutation(async ({ ctx, input }) => {
        const { data: existing } = await ctx.db
          .from("organizations")
          .select("id")
          .eq("role", "exchange")
          .order("created_at")
          .limit(1)
          .maybeSingle();

        const fields = {
          name: input.name,
          phone: nul(input.phone),
          email: nul(input.email),
          tax_id: nul(input.taxId),
          eori: nul(input.eori),
          contact_name: nul(input.contactName),
        };

        let id = existing?.id;
        if (id) {
          const { error } = await ctx.db.from("organizations").update(fields).eq("id", id);
          if (error) dbFail(error, "Company");
        } else {
          const { data, error } = await ctx.db
            .from("organizations")
            .insert({ ...fields, role: "exchange" })
            .select("id")
            .single();
          if (error) dbFail(error, "Company");
          id = data.id;
        }
        if (input.address) await writeHeadquarters(ctx.db, id, input.name, input.address);
        return orgWithAddress(ctx.db, id);
      }),
  }),

  // ---------------------------------------------------------------------------
  // Bank accounts — the company's remittance details
  // ---------------------------------------------------------------------------
  bankAccounts: createTRPCRouter({
    list: requirePermission("admin:view").query(async ({ ctx }) => {
      const { data, error } = await ctx.db
        .from("bank_accounts")
        .select(
          "id, org_id, label, beneficiary_name, bank_name, bank_address, swift_code, account_number, aba_routing, iban, currency, is_default, created_at",
        )
        .order("is_default", { ascending: false })
        .order("currency")
        .order("created_at");
      if (error) dbFail(error, "Bank accounts");
      return data ?? [];
    }),

    create: requirePermission("admin:view")
      .input(bankFields)
      .mutation(async ({ ctx, input }) => {
        const { data: company, error: companyError } = await ctx.db
          .from("organizations")
          .select("id")
          .eq("role", "exchange")
          .limit(1)
          .maybeSingle();
        if (companyError) dbFail(companyError, "Company");
        if (!company)
          fail(
            "PRECONDITION_FAILED",
            "Set up the company (Settings → Company) before adding bank accounts.",
          );

        if (input.isDefault) {
          const { error } = await ctx.db
            .from("bank_accounts")
            .update({ is_default: false })
            .eq("org_id", company.id)
            .eq("currency", input.currency);
          if (error) dbFail(error, "Bank account");
        }
        const { data, error } = await ctx.db
          .from("bank_accounts")
          .insert({
            org_id: company.id,
            label: nul(input.label),
            beneficiary_name: input.beneficiaryName,
            bank_name: input.bankName,
            bank_address: nul(input.bankAddress),
            swift_code: nul(input.swiftCode),
            account_number: nul(input.accountNumber),
            aba_routing: nul(input.abaRouting),
            iban: nul(input.iban),
            currency: input.currency,
            is_default: input.isDefault,
          })
          .select("id")
          .single();
        if (error) dbFail(error, "Bank account");
        return data;
      }),

    update: requirePermission("admin:view")
      .input(bankFields.partial().extend({ id: uuid }))
      .mutation(async ({ ctx, input }) => {
        const { data: row, error: rowError } = await ctx.db
          .from("bank_accounts")
          .select("org_id, currency")
          .eq("id", input.id)
          .single();
        if (rowError) dbFail(rowError, "Bank account");

        const currency = input.currency ?? row.currency;
        if (input.isDefault) {
          const { error } = await ctx.db
            .from("bank_accounts")
            .update({ is_default: false })
            .eq("org_id", row.org_id)
            .eq("currency", currency)
            .neq("id", input.id);
          if (error) dbFail(error, "Bank account");
        }
        const patch: Update<"bank_accounts"> = {};
        if (input.label !== undefined) patch.label = nul(input.label);
        if (input.beneficiaryName !== undefined) patch.beneficiary_name = input.beneficiaryName;
        if (input.bankName !== undefined) patch.bank_name = input.bankName;
        if (input.bankAddress !== undefined) patch.bank_address = nul(input.bankAddress);
        if (input.swiftCode !== undefined) patch.swift_code = nul(input.swiftCode);
        if (input.accountNumber !== undefined) patch.account_number = nul(input.accountNumber);
        if (input.abaRouting !== undefined) patch.aba_routing = nul(input.abaRouting);
        if (input.iban !== undefined) patch.iban = nul(input.iban);
        if (input.currency !== undefined) patch.currency = input.currency;
        if (input.isDefault !== undefined) patch.is_default = input.isDefault;
        const { error } = await ctx.db.from("bank_accounts").update(patch).eq("id", input.id);
        if (error) dbFail(error, "Bank account");
        return { id: input.id };
      }),

    remove: requirePermission("admin:view")
      .input(z.object({ id: uuid }))
      .mutation(async ({ ctx, input }) => {
        const { error } = await ctx.db.from("bank_accounts").delete().eq("id", input.id);
        if (error) dbFail(error, "Bank account");
        return { id: input.id };
      }),
  }),
});
