# resin-depo

Export System for Gordy — an interim, standalone copy of TPE's **Export Shipments** section so the
export team can manage ocean bookings, container manifests, shared costs and the export
paperwork (Commercial Invoice, Packing List, Proforma Invoice, Certificate of Origin, Sales
Contract) while the full TPE platform is finished.

## How it relates to TPE

- The export tables, tRPC router, document logic and PDF templates are **copied verbatim** from
  TPE (`/c/websites/TPE-2026/repo/tpe`). Migrations under `supabase/migrations/` after the
  foundation file are byte-identical to their TPE twins.
- One foundation migration (`20260101000000_foundation.sql`) creates minimal, TPE-shaped copies of
  the upstream tables the export feature depends on: `user_profiles`, `organizations`,
  `locations` + `organization_locations`, `products`, `matched_orders`, a stub `lots`.
- **Double entry, once per shipment.** TPE puts a container on a shipment from its ledger; here
  the desk fills the **Purchase card** (buyer, product, prices, terms) once per shipment. It is
  stored as a parent `matched_orders` row, linked by `shipment_group_deals`, and every container
  added afterwards is a *conversion leg* of it (`parent_matched_order_id`, `leg_index`, printed
  as `900001-CH2`) — exactly what TPE's `convert_matched_order` produces. Saving the Purchase
  again pushes the shared fields down to the legs. Everything downstream (manifest, cost
  allocation, documents) is TPE's code unchanged.
- **Import contract.** When TPE goes live, this database imports as a row copy. Numbering is
  offset so nothing collides: shipments start at `SHP-90000`, order lines at `900000`. Paper
  references from the team's existing process go in `matched_orders.legacy_number`.
  `shipment_group_deals` is resin-depo-only — drop it on import; the legs already carry
  `parent_matched_order_id`.
- Every user is `admin` (`user_profiles.platform_role` default). TPE's RLS policies are kept as-is.

## Stack

Next.js 16 (App Router) · React 19 · tRPC 11 + TanStack Query · Supabase (Postgres, Auth,
Storage) · Zod 4 · `@react-pdf/renderer` · Tailwind 4 + shadcn (base-vega, TPE theme).

## Setup

```bash
pnpm install
cp .env.example .env.local        # fill in the Supabase URL + anon key (+ service role for admin:seed)
pnpm supabase:start               # local stack (Docker) — applies migrations + seed
pnpm admin:seed                   # admin@tpe.dev / testpassword123 (or pass email password)
pnpm dev
```

Hosted project: `pnpm supabase:push:dry` → `pnpm supabase:push` → `pnpm supabase:types`
(needs `SUPABASE_ACCESS_TOKEN` and the DB password / `supabase link`).

First run, in the app: **Company & Bank** (the exporter party block + default USD wire account
— documents cannot be drafted without it), then **Ports**, **Products** (HS code + origin),
**Parties** (consignees, carriers). Parties and products can also be created inline from the
container drawer.

## Scripts

| Script | What |
| --- | --- |
| `pnpm dev` / `build` / `start` | Next.js |
| `pnpm typecheck` / `lint` / `format` | tsc, eslint, prettier |
| `pnpm supabase:start` / `stop` / `reset` | local stack |
| `pnpm supabase:push` / `push:dry` | apply migrations to the linked hosted project |
| `pnpm supabase:types` / `types:local` | regenerate `lib/supabase/database.types.ts` |
| `pnpm supabase:migrate:new <slug>` | new migration file |
| `pnpm admin:seed [email] [password]` | create / reset a confirmed user via the Admin API |

## Shared fields between the shipment and its documents

A fact that lives on the shipment (Booking: vessel, voyage, booking/HBL numbers, ETD/ETA, ports,
carrier, filing boxes · Purchase: PO, payment terms, tolerance, insurance, window · Product: HS
code, origin) has one home. Every **draft** document reads it live, and saving a document that
changed one of those fields writes it back home and re-derives every other draft on the shipment
(`lib/export-shipment/documents/shared-fields.ts`, `resyncDrafts` in the export router). Fields
backed by a picker (ports, carrier, incoterm, party blocks, bank) are shown live but edited on
the shipment. Document-only fields (dates, description wording, marks, notify party, a hand-set
payment due) stay per document. Issued documents remain frozen except for their allowlisted
references, which still write back.

## Customer credit

Per buyer: **credit limit** (max they may owe), **exposure** (Σ balances of open shipments, counted
from the Purchase until paid), **available** = limit − exposure, and aging buckets (current / 1–30
/ 31–60 / 61–90 / >90 days past due). The amount owed on a shipment is the issued Commercial
Invoice total when one exists, else the Purchase estimate (contract lbs × sell price, labelled
"estimate"). Due date = invoice payment-due date, else ETD + payment terms, else purchase date +
terms. Payments are recorded per shipment (Payments card, or from `/credit/[buyer]`); limit changes
are audited. The model follows TPE's pre-rebuild `payments` / `credit_limit_changes` migrations;
`shipment_receivables` and `buyer_credit` are SQL views, and `organizations.credit_available` is a
trigger-maintained mirror kept for TPE. The Purchase card shows a soft over-limit warning and
never blocks a save.

## Layout

```
app/(authenticated)/shipments        list + detail (TPE pages)
app/(authenticated)/settings/*       parties, products, ports, company & bank
app/api/shipment-documents/…/pdf     PDF route (renders from the frozen payload)
components/bank/export-shipments     TPE feature UI (+ detail/deal-sheet.tsx, new here)
components/settings                  reference-data pages
lib/export-shipment/documents        payload schemas, context, draft builders
lib/pdf                              styles + five templates
trpc/routers                         export-shipments, shipment-files, locations, reference
supabase/migrations                  foundation → TPE export migrations → post-export
```

See `lib/export-shipment/README.md` (from TPE) for the document architecture: the payload is the
frozen record, PDFs render only from it, corrections are void + reissue.
