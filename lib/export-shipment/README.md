# lib/export-shipment

Pure logic behind the export documents on
`/bank/export-shipments/[id]`. No database access, no clock, no React — so every
rule here is testable without a browser or a running Supabase.

The UI lives in [`components/bank/export-shipments/`](../../components/bank/export-shipments/README.md);
the plan and staging live in [`docs/export-shipment-documents-plan.md`](../../docs/export-shipment-documents-plan.md).

## `write-container.ts`

`writeContainerFields()` — the shared write path for a container's editable
fields (number, seal, packages, net/tare weights): column UPDATE plus the
`shipment_group_events` audit entry, used by the Manage Containers bulk save.
(The Export Shipments container sheet's own `updateContainer` procedure
predates this helper and still writes directly — consolidation is tracked as a
follow-up.)

## `documents/`

| File                       | Exports                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **`context.ts`**           | **`buildDocumentContext(input)` — every repeated fact, derived once**                                                                       |
| `types.ts`                 | `CommercialInvoiceSchema`, `SalesContractSchema`, `PartyBlockSchema`, `DOC_TYPES`, `DOC_TYPE_META`, `BUILT_DOC_TYPES`, `payloadSchemaFor()` |
| `commercial-invoice.ts`    | `buildCommercialInvoiceDraft({context, documentNumber})`                                                                                    |
| `packing-list.ts`          | `buildPackingListDraft({context, documentNumber})`                                                                                          |
| `sales-contract.ts`        | `buildSalesContractDraft({context, documentNumber})`                                                                                        |
| `proforma-invoice.ts`      | `buildProformaInvoiceDraft({context, documentNumber})`                                                                                      |
| `certificate-of-origin.ts` | `buildCertificateOfOriginDraft({context, documentNumber, invoiceReference?})`                                                               |
| `boilerplate.ts`           | `contractClauses()`, `CONDITIONS_OF_SALE` — the fixed legal text                                                                            |
| `parties.ts`               | `orgToPartyBlock()`, `nameOnlyPartyBlock()`, `partyLines()`, `cityLine()`                                                                   |
| `totals.ts`                | `sumInvoiceLines()`, `roundKg()`, `roundMt()`, `roundMoney()`                                                                               |
| `editable.ts`              | `editableKeysAfterIssue()`, `isFieldEditable()`                                                                                             |

### Letterhead party blocks (Locations push)

`PackingListSchema.shipper` and `ProformaInvoiceSchema.seller` carry TPE's
own party block (the exchange org's **headquarters**, resolved through the
org address book — `resolveOrgAddress` in `lib/locations`); the buyer block
resolves the buyer's **billing** address the same way. Both letterhead keys
are **`.optional()` on purpose**: stored payloads re-parse against the
current schema at render time, so a pre-Locations payload without the key
must keep parsing — the PDF templates then fall back to their historical
hardcoded block. `tests/unit/document-consistency.spec.ts` pins both halves.

### One context, many documents — the rule that keeps them consistent

**Anything printed on more than one document is derived in `context.ts` and
nowhere else.** The mappers _shape_ that context into each document's
vocabulary; none of them recompute.

```
        buildDocumentContext(rows)  ──▶  DocumentContext
                                          seller / buyer / goods / routing
                                          refs / terms / filing / bank
                                          lines / lots / totals
   ┌───────────┬───────────┬───────────┬───────────┬───────────┐
  CI          PL          SC          PI          COO
 Shipper    (none)    The SELLER    (none)     Shipper (2)
 Consignee  Bill to   The BUYER    Sold To    Consignee (3)
 lbs, $/lb  no money  MT, $/MT     MT, $/MT   no money
```

Four names for one counterparty; one organization behind all of them.

Without it the documents drift: one rounds a weight differently, another falls
back to `product_text` where its neighbour used `products.name`, a third joins
the incoterm to the port with a comma. A customs officer comparing two
documents from one booking finds it immediately.

`tests/unit/document-consistency.spec.ts` asserts the shared facts come out
**equal**, not equal-to-a-literal — a test that restated the expected value
would drift alongside the code it guards, and would still pass if both
documents were wrong the same way. **Add a document type there before you add
its template.**

The one genuine difference between the two is units: a contract is written in
metric tonnes at a price per tonne, an invoice in pounds at a price per pound.
`pricePerLbToPerMetricTon` (`lib/units.ts`) shares the 2205 factor with the
weight conversions, so the two totals reconcile to the cent.

### One schema, three jobs

`CommercialInvoiceSchema` validates the payload **on write** (`issueDocument`
refuses to freeze a payload that cannot be rendered), validates it again **on
read** (the PDF route parses before rendering), and **types the template's
props**. One shared contract is what makes "the PDF matches the record"
enforceable rather than hoped-for.

### The payload is the record

A document's PDF renders from its frozen `payload` and from nothing else. The
mapper's job is to produce a good _first draft_ of that payload from live data;
once issued, the payload is the truth and live data is irrelevant to it.

### `buildCommercialInvoiceDraft` is pure

It takes the rows it needs — group, containers, orgs, product — plus `today` as
an argument rather than calling `new Date()`. The router fetches; the mapper
maps. That split is why `tests/unit/commercial-invoice-mapping.spec.ts` can
assert every fallback without a database.

**The invariant it exists to protect:** line money is `tpe_sell_price ×
matched_orders.quantity_lbs` — the CONTRACT weight — never `net_weight_lbs`. The
net weight reaches the weight columns only. Two similar numbers side by side is
exactly how an invoice goes wrong.

### Rounding

`totals.ts` returns **full-precision** numbers; `roundKg` / `roundMt` /
`roundMoney` are for the template to call at the last moment. Rounding each
container and then summing makes a Commercial Invoice's total disagree with the
sum of its own Packing List rows — the class of error that generating both from
one dataset is supposed to eliminate.

### `editable.ts` mirrors SQL

It is a **copy** of `public.shipment_document_editable_keys(doc_type)`, kept so
the sheet can grey out inputs it knows the database will refuse. **If the two
disagree, the database is right.** `tests/unit/shipment-documents-schema.spec.ts`
asserts they match for every document type.
