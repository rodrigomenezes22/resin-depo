// =============================================================================
// Proforma Invoice — PDF template
// =============================================================================
// Modelled on the sample (17818-345): reference grid top-right, Sold-To and
// Delivered-To blocks, a single priced line in MT, the packing/containers/
// carrier facts, the tolerance note, and the wire transfer block.
//
// One argument: the parsed payload.
// =============================================================================

import { Document, Page, Text, View } from "@react-pdf/renderer";
import { Logo } from "@/lib/pdf/logo";

import { partyLines } from "@/lib/export-shipment/documents/parties";
import { roundKg, roundMoney, roundMt } from "@/lib/export-shipment/documents/totals";
import type { ProformaInvoiceFields } from "@/lib/export-shipment/documents/types";
import { docStyles as d, fmt, styles } from "../styles";

const DASH = "—";

export interface ProformaInvoicePdfProps {
  fields: ProformaInvoiceFields;
  status: "draft" | "issued" | "superseded" | "void";
  voidReason?: string | null;
}

export function ProformaInvoicePdf({ fields, status, voidReason }: ProformaInvoicePdfProps) {
  const f = fields;
  const c = f.currency;

  return (
    <Document title={f.documentNumber} author="The Plastics Exchange, LLC">
      <Page size="A4" style={styles.page}>
        {status === "void" ? (
          <Text style={styles.voidBanner}>
            VOID — {voidReason || "this document has been superseded"}
          </Text>
        ) : null}
        {status === "draft" ? <Text style={styles.draftBanner}>DRAFT — NOT ISSUED</Text> : null}

        {/* Letterhead — data-driven from the payload's seller block (the
            exchange org's headquarters address, commercial-invoice pattern).
            Pre-Locations payloads have no seller key: fall back to the block
            this template historically hardcoded, byte for byte. */}
        <View style={styles.letterhead}>
          {f.seller ? (
            <View>
              <Logo />
              <Text style={styles.brand}>{f.seller.name}</Text>
              {partyLines(f.seller)
                .slice(1)
                .map((line, i) => (
                  <Text key={i} style={styles.brandLines}>
                    {line}
                  </Text>
                ))}
            </View>
          ) : (
            <View>
              <Logo />
              <Text style={styles.brand}>The Plastics Exchange, LLC.</Text>
              <Text style={styles.brandLines}>16510 N. 92nd St. #1010</Text>
              <Text style={styles.brandLines}>Scottsdale, AZ 85260 USA</Text>
              <Text style={styles.brandLines}>Phone: +1 312.202.0002</Text>
            </View>
          )}
          <View style={styles.refTable}>
            <RefRow label="Invoice No." value={f.documentNumber} />
            <RefRow label="Transaction Date" value={f.transactionDate} />
            <RefRow label="Latest Sailing" value={f.latestSailingDate} />
            <RefRow label="Invoice Date" value={f.invoiceDate} />
            <RefRow label="Payment Terms" value={f.paymentTerms} />
            <RefRow label="Customer Ref No." value={f.customerReference} />
            <RefRow label="Incoterms" value={f.incoterms} last />
          </View>
        </View>

        <Text style={styles.docTitle}>PROFORMA INVOICE</Text>

        <View style={styles.boxRow}>
          <View style={styles.box}>
            <Text style={styles.boxLabel}>Sold To:</Text>
            {partyLines(f.soldTo).map((line, i) => (
              <Text key={i} style={styles.boxLine}>
                {line}
              </Text>
            ))}
          </View>
          <View style={styles.boxLast}>
            <Text style={styles.boxLabel}>Delivered To:</Text>
            <Text style={styles.boxLine}>{f.deliveredTo || DASH}</Text>
          </View>
        </View>

        {/* --- the priced line ------------------------------------------------ */}
        <View style={[d.table, { marginTop: 10 }]}>
          <View style={d.tableHeader}>
            <Text style={[d.th, { flex: 3 }]}>Product Description</Text>
            <Text style={[d.th, d.right, { width: 64 }]}>Quantity</Text>
            <Text style={[d.th, { width: 40 }]}>UoM</Text>
            <Text style={[d.th, d.right, { width: 84 }]}>Unit Price {c}</Text>
            <Text style={[d.th, d.right, { width: 96 }]}>Line Total</Text>
          </View>
          <View style={d.tableRow}>
            <View style={[d.td, { flex: 3 }]}>
              <Text>{f.descriptionOfGoods}</Text>
              {f.grade ? <Text>Grade: {f.grade}</Text> : null}
            </View>
            <Text style={[d.td, d.right, { width: 64 }]}>{fmt(roundMt(f.quantityMt), 2)}</Text>
            <Text style={[d.td, { width: 40 }]}>MT</Text>
            <Text style={[d.td, d.right, { width: 84 }]}>
              {c} {fmt(roundMoney(f.unitPricePerMt), 2)}
            </Text>
            <Text style={[d.td, d.right, { width: 96 }]}>
              {c} {fmt(roundMoney(f.totalValue), 2)}
            </Text>
          </View>
          <View style={d.totalRow}>
            <Text style={[d.th, { flex: 3 }]}>Total Transaction Value:</Text>
            <Text style={[d.th, { width: 188 }]}> </Text>
            <Text style={[d.th, d.right, { width: 96 }]}>
              {c} {fmt(roundMoney(f.totalValue), 2)}
            </Text>
          </View>
        </View>

        {/* --- shipment facts -------------------------------------------------- */}
        <View style={[d.facts, { marginTop: 10 }]}>
          <Text style={d.fact}>PACKING: {f.packing || DASH}</Text>
          <Text style={d.fact}>TOTAL NET WEIGHT: {fmt(roundKg(f.totalNetWeightKg), 2)} KGS</Text>
          <Text style={d.fact}>TOTAL NUMBER OF CONTAINERS: {f.containerSummary || DASH}</Text>
          <Text style={d.fact}>CARRIER: {f.carrierName || DASH}</Text>
          <Text style={d.fact}>VESSEL / VOYAGE: {f.vesselVoyage || DASH}</Text>
          {f.freightTerms ? <Text style={d.fact}>{f.freightTerms}</Text> : null}
          {f.dthcTerms ? <Text style={d.fact}>{f.dthcTerms}</Text> : null}
        </View>

        <Text style={[d.declare, { fontFamily: "Helvetica-Bold" }]}>
          Tolerance: +-{fmt(f.tolerancePct, 0)}% at the Seller&apos;s option. Please reference the
          transaction number in your payments.
        </Text>

        {/* --- wire block ------------------------------------------------------ */}
        {f.bank ? (
          <View style={d.table}>
            <View style={d.tableHeader}>
              <Text style={[d.th, { flex: 1 }]}>WIRE TRANSFER INSTRUCTIONS</Text>
            </View>
            <View style={{ padding: 5 }}>
              <Text style={d.fact}>Beneficiary Bank: {f.bank.bankName}</Text>
              {f.bank.abaRouting ? <Text style={d.fact}>ABA #: {f.bank.abaRouting}</Text> : null}
              {f.bank.swiftCode ? (
                <Text style={d.fact}>Beneficiary Bank Swift Code: {f.bank.swiftCode}</Text>
              ) : null}
              {f.bank.bankAddress ? (
                <Text style={d.fact}>Beneficiary Bank Address: {f.bank.bankAddress}</Text>
              ) : null}
              <Text style={d.fact}>Beneficiary: {f.bank.beneficiaryName}</Text>
              {f.bank.accountNumber ? (
                <Text style={d.fact}>Beneficiary Account #: {f.bank.accountNumber}</Text>
              ) : null}
            </View>
          </View>
        ) : null}

        <View style={{ marginTop: 10, flexDirection: "row", justifyContent: "space-between" }}>
          <View>
            <Text style={d.blockLine}>Shipping Via: {f.shippingVia || DASH}</Text>
            <Text style={d.blockLine}>B/L Date: ETD {f.blDate || DASH}</Text>
            <Text style={d.blockLine}>Country of Origin: {f.countryOfOrigin || DASH}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={d.blockLine}>{f.signatory || ""}</Text>
            <Text style={d.blockLine}>{f.seller?.name ?? "The Plastics Exchange, LLC"}</Text>
          </View>
        </View>

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `${f.documentNumber}   ·   Page ${pageNumber} of ${totalPages}   ·   The Plastics Exchange, LLC`
          }
          fixed
        />
      </Page>
    </Document>
  );
}

function RefRow({ label, value, last }: { label: string; value: string | null; last?: boolean }) {
  return (
    <View style={last ? styles.refRowLast : styles.refRow}>
      <Text style={styles.refKey}>{label}</Text>
      <Text style={styles.refValue}>{value || DASH}</Text>
    </View>
  );
}
