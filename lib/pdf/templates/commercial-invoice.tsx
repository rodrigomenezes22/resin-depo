// =============================================================================
// Commercial Invoice — PDF template
// =============================================================================
// Modelled on TPE's existing invoice (sample 17647-RC4-C): the reference grid
// top-right, shipper / routing / consignee / notify boxes, then one row per
// container with weights and money, then the total.
//
// THE ONE ARGUMENT RULE: this template takes the parsed payload and nothing
// else. No database, no `new Date()`, no lookups. A revision fetched a year
// from now renders byte-identically because its input is frozen — which is the
// entire reason the payload exists.
// =============================================================================

import { Document, Page, Text, View } from "@react-pdf/renderer";
import { Logo } from "@/lib/pdf/logo";

import { CONTAINER_COLS, fmt, fmtMoney, styles } from "../styles";
import { partyLines } from "@/lib/export-shipment/documents/parties";
import { roundKg, roundMoney, sumInvoiceLines } from "@/lib/export-shipment/documents/totals";
import type { CommercialInvoiceFields, PartyBlock } from "@/lib/export-shipment/documents/types";
import { formatPackages } from "@/components/bank/export-shipments/package-kinds";

const DASH = "—";

function RefRow({ label, value, last }: { label: string; value: string | null; last?: boolean }) {
  return (
    <View style={last ? styles.refRowLast : styles.refRow}>
      <Text style={styles.refKey}>{label}</Text>
      <Text style={styles.refValue}>{value || DASH}</Text>
    </View>
  );
}

function PartyBox({ label, party, last }: { label: string; party: PartyBlock; last?: boolean }) {
  return (
    <View style={last ? styles.boxLast : styles.box}>
      <Text style={styles.boxLabel}>{label}</Text>
      {partyLines(party).map((line, i) => (
        <Text key={i} style={styles.boxLine}>
          {line}
        </Text>
      ))}
      {party.taxId ? <Text style={styles.boxLine}>Tax ID: {party.taxId}</Text> : null}
    </View>
  );
}

function FieldBox({
  label,
  lines,
  last,
}: {
  label: string;
  lines: (string | null)[];
  last?: boolean;
}) {
  const shown = lines.filter((l): l is string => Boolean(l && l.trim()));
  return (
    <View style={last ? styles.boxLast : styles.box}>
      <Text style={styles.boxLabel}>{label}</Text>
      {shown.length ? (
        shown.map((line, i) => (
          <Text key={i} style={styles.boxLine}>
            {line}
          </Text>
        ))
      ) : (
        <Text style={styles.boxLine}>{DASH}</Text>
      )}
    </View>
  );
}

export interface CommercialInvoicePdfProps {
  fields: CommercialInvoiceFields;
  /** Drives the DRAFT / VOID banner. A voided invoice must never look current. */
  status: "draft" | "issued" | "superseded" | "void";
  voidReason?: string | null;
}

export function CommercialInvoicePdf({ fields, status, voidReason }: CommercialInvoicePdfProps) {
  const totals = sumInvoiceLines(fields.lines);
  const c = fields.currency;

  return (
    <Document title={fields.documentNumber} author="The Plastics Exchange, LLC">
      <Page size="A4" style={styles.page}>
        {status === "void" ? (
          <Text style={styles.voidBanner}>
            VOID — {voidReason || "this document has been superseded"}
          </Text>
        ) : null}
        {status === "draft" ? <Text style={styles.draftBanner}>DRAFT — NOT ISSUED</Text> : null}

        {/* --- letterhead + reference grid ---------------------------------- */}
        <View style={styles.letterhead}>
          <View>
            <Logo />
            <Text style={styles.brand}>{fields.shipper.name}</Text>
            {partyLines(fields.shipper)
              .slice(1)
              .map((line, i) => (
                <Text key={i} style={styles.brandLines}>
                  {line}
                </Text>
              ))}
          </View>
          <View style={styles.refTable}>
            <RefRow label="Invoice No." value={fields.documentNumber} />
            <RefRow label="Transaction Date" value={fields.transactionDate} />
            <RefRow label="Shipping Date" value={fields.shippingDate} />
            <RefRow label="Invoice Date" value={fields.invoiceDate} />
            <RefRow label="Payment Due" value={fields.paymentDue} />
            <RefRow label="Payment Terms" value={fields.paymentTerms} />
            <RefRow label="Incoterms" value={fields.incoterms} />
            <RefRow label="Customer Ref #" value={fields.customerReference} />
            <RefRow label="Carrier Booking" value={fields.carrierBookingNumber} />
            <RefRow label="HBL No." value={fields.hblNumber} last />
          </View>
        </View>

        <Text style={styles.docTitle}>COMMERCIAL INVOICE</Text>

        {/* --- parties + routing -------------------------------------------- */}
        <View style={styles.boxRow}>
          <PartyBox label="Beneficiary / Shipper" party={fields.shipper} />
          <FieldBox label="Port of Loading" lines={[fields.portOfLoading]} />
          <FieldBox label="Port of Discharge" lines={[fields.portOfDischarge]} last />
        </View>

        <View style={styles.boxRow}>
          <FieldBox
            label="Carrier / Vessel / Voyage"
            lines={[
              fields.carrierName,
              [fields.vesselName, fields.voyageNumber].filter(Boolean).join(" / ") || null,
            ]}
          />
          <FieldBox label="Sailing on / or about" lines={[fields.sailingOnOrAbout]} last />
        </View>

        <View style={styles.boxRow}>
          <PartyBox label="Consignee" party={fields.consignee} />
          <PartyBox label="Notify Party" party={fields.notifyParty} last />
        </View>

        <View style={styles.boxRow}>
          <FieldBox
            label="Description of Goods"
            lines={[
              fields.descriptionOfGoods,
              fields.packaging ? `Packaging: ${fields.packaging}` : null,
              fields.marksAndNumbers,
            ]}
          />
          <FieldBox label="Commodity code" lines={[fields.commodityCode]} />
          <FieldBox label="Country of Origin" lines={[fields.countryOfOrigin]} last />
        </View>

        {/* --- container lines ---------------------------------------------- */}
        <View style={styles.table}>
          {/* `fixed` repeats the header when the table breaks across pages —
              the reason this template uses @react-pdf rather than hand-placed
              coordinates. */}
          <View style={styles.tableHeader} fixed>
            <Text style={[styles.th, { width: CONTAINER_COLS.container }]}>Container</Text>
            <Text style={[styles.th, { width: CONTAINER_COLS.seal }]}>Seal</Text>
            <Text style={[styles.th, styles.right, { width: CONTAINER_COLS.netKg }]}>Net (kg)</Text>
            <Text style={[styles.th, styles.right, { width: CONTAINER_COLS.grossKg }]}>
              Gross (kg)
            </Text>
            <Text style={[styles.th, { width: CONTAINER_COLS.packages }]}>Packages</Text>
            <Text style={[styles.th, styles.right, { width: CONTAINER_COLS.pallets }]}>Plts</Text>
            <Text style={[styles.th, styles.right, { width: CONTAINER_COLS.unitPrice }]}>
              Unit Price
            </Text>
            <Text style={[styles.th, styles.right, { width: CONTAINER_COLS.lineTotal }]}>
              Line Total
            </Text>
          </View>

          {fields.lines.map((line) => (
            <View key={line.containerId} style={styles.tableRow} wrap={false}>
              <Text style={[styles.td, { width: CONTAINER_COLS.container }]}>
                {line.containerNumber || DASH}
                {line.containerType ? ` (${line.containerType})` : ""}
              </Text>
              <Text style={[styles.td, { width: CONTAINER_COLS.seal }]}>
                {line.sealNumber || DASH}
              </Text>
              <Text style={[styles.td, styles.right, { width: CONTAINER_COLS.netKg }]}>
                {fmt(roundKg(line.netWeightKg), 2)}
              </Text>
              <Text style={[styles.td, styles.right, { width: CONTAINER_COLS.grossKg }]}>
                {fmt(roundKg(line.grossWeightKg), 2)}
              </Text>
              <Text style={[styles.td, { width: CONTAINER_COLS.packages }]}>
                {formatPackages(line.packageCount, line.packageKind) ?? DASH}
              </Text>
              <Text style={[styles.td, styles.right, { width: CONTAINER_COLS.pallets }]}>
                {line.palletCount ?? DASH}
              </Text>
              <Text style={[styles.td, styles.right, { width: CONTAINER_COLS.unitPrice }]}>
                {fmt(line.unitPrice, 4)}
              </Text>
              <Text style={[styles.td, styles.right, { width: CONTAINER_COLS.lineTotal }]}>
                {fmt(roundMoney(line.lineTotal), 2)}
              </Text>
            </View>
          ))}

          {/* Totals are the FULL-PRECISION sum rounded once — not the sum of the
              rounded rows above, which would drift from the Packing List. */}
          <View style={styles.totalRow}>
            <Text style={[styles.th, { width: CONTAINER_COLS.container }]}>
              {totals.containerCount} container{totals.containerCount === 1 ? "" : "s"}
            </Text>
            <Text style={[styles.th, { width: CONTAINER_COLS.seal }]}> </Text>
            <Text style={[styles.th, styles.right, { width: CONTAINER_COLS.netKg }]}>
              {fmt(roundKg(totals.netWeightKg), 2)}
            </Text>
            <Text style={[styles.th, styles.right, { width: CONTAINER_COLS.grossKg }]}>
              {fmt(roundKg(totals.grossWeightKg), 2)}
            </Text>
            <Text style={[styles.th, { width: CONTAINER_COLS.packages }]}>
              {totals.packageCount || DASH}
            </Text>
            <Text style={[styles.th, styles.right, { width: CONTAINER_COLS.pallets }]}>
              {totals.palletCount || DASH}
            </Text>
            <Text style={[styles.th, styles.right, { width: CONTAINER_COLS.unitPrice }]}>FOB</Text>
            <Text style={[styles.th, styles.right, { width: CONTAINER_COLS.lineTotal }]}>
              {fmt(roundMoney(totals.fobTotal), 2)}
            </Text>
          </View>
        </View>

        {/* --- money -------------------------------------------------------- */}
        <View style={[styles.boxRow, { marginTop: 8 }]}>
          <FieldBox label="Freight" lines={[fmtMoney(roundMoney(totals.freightTotal), c)]} />
          <FieldBox label="Total Value" lines={[fmtMoney(roundMoney(totals.totalValue), c)]} last />
        </View>

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `${fields.documentNumber}   ·   Page ${pageNumber} of ${totalPages}   ·   The Plastics Exchange, LLC`
          }
          fixed
        />
      </Page>
    </Document>
  );
}
