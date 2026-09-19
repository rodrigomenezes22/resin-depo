// =============================================================================
// Packing List — PDF template
// =============================================================================
// Modelled on the sample (17647-RC4-C - PL): the reference grid top-right, the
// Bill-to block, a description block stating packing / HS code / totals, then
// one row per container with weights, counts and lot numbers, and the
// POL/POD/ATD/ETA strip at the foot.
//
// One argument: the parsed payload.
// =============================================================================

import { Document, Page, Text, View } from "@react-pdf/renderer";

import { partyLines } from "@/lib/export-shipment/documents/parties";
import { roundKg, roundMt } from "@/lib/export-shipment/documents/totals";
import type { PackingListFields } from "@/lib/export-shipment/documents/types";
import { docStyles as d, fmt, styles } from "../styles";

const DASH = "—";

export interface PackingListPdfProps {
  fields: PackingListFields;
  status: "draft" | "issued" | "superseded" | "void";
  voidReason?: string | null;
}

export function PackingListPdf({ fields, status, voidReason }: PackingListPdfProps) {
  const f = fields;

  return (
    <Document title={f.documentNumber} author="The Plastics Exchange, LLC">
      <Page size="A4" style={styles.page}>
        {status === "void" ? (
          <Text style={styles.voidBanner}>
            VOID — {voidReason || "this document has been superseded"}
          </Text>
        ) : null}
        {status === "draft" ? <Text style={styles.draftBanner}>DRAFT — NOT ISSUED</Text> : null}

        {/* Letterhead — data-driven from the payload's shipper block (the
            exchange org's headquarters address, commercial-invoice pattern).
            Pre-Locations payloads have no shipper key: fall back to the block
            this template historically hardcoded, byte for byte. */}
        <View style={styles.letterhead}>
          {f.shipper ? (
            <View>
              <Text style={styles.brand}>{f.shipper.name}</Text>
              {partyLines(f.shipper)
                .slice(1)
                .map((line, i) => (
                  <Text key={i} style={styles.brandLines}>
                    {line}
                  </Text>
                ))}
            </View>
          ) : (
            <View>
              <Text style={styles.brand}>The Plastics Exchange, LLC</Text>
              <Text style={styles.brandLines}>16510 N. 92nd St. #1010</Text>
              <Text style={styles.brandLines}>Scottsdale, AZ 85260, USA</Text>
            </View>
          )}
          <View style={styles.refTable}>
            <RefRow label="Invoice No." value={f.documentNumber} />
            <RefRow label="Transaction Date" value={f.transactionDate} />
            <RefRow label="Shipping Date" value={f.shippingDate} />
            <RefRow label="Invoice Date" value={f.invoiceDate} />
            <RefRow label="Payment Terms" value={f.paymentTerms} />
            <RefRow label="Incoterms" value={f.incoterms} />
            <RefRow label="Customer Ref #" value={f.customerReference} />
            <RefRow label="Carrier Booking" value={f.carrierBookingNumber} last />
          </View>
        </View>

        <View style={d.billTo}>
          <Text style={d.blockLabel}>Bill to:</Text>
          {partyLines(f.billTo).map((line, i) => (
            <Text key={i} style={d.blockLine}>
              {line}
            </Text>
          ))}
          <Text style={d.blockLine}>Destination: {f.destination || DASH}</Text>
          <Text style={d.blockLine}>Name of Carrier: {f.carrierName || DASH}</Text>
        </View>

        <Text style={styles.docTitle}>PACKING LIST</Text>

        {/* --- the declaration block ----------------------------------------- */}
        <View style={d.declaration}>
          <View style={d.declRow}>
            <Text style={d.declKey}>DESCRIPTION</Text>
            <Text style={d.declKey}>UNIT</Text>
            <Text style={d.declKey}>QUANTITY</Text>
          </View>
          <View style={d.declRow}>
            <Text style={d.declValue}>{f.descriptionOfGoods}</Text>
            <Text style={d.declValue}>MT</Text>
            <Text style={d.declValue}>{fmt(roundMt(f.quantityMt), 3)}</Text>
          </View>
        </View>

        <View style={d.facts}>
          {f.grade ? <Text style={d.fact}>Grade: {f.grade}</Text> : null}
          <Text style={d.fact}>PACKING: {f.packaging || DASH}</Text>
          <Text style={d.fact}>HS CODE: {f.commodityCode || DASH}</Text>
          <Text style={d.fact}>TOTAL NUMBER OF PACKAGES: {fmt(f.totalPackages, 0)}</Text>
          <Text style={d.fact}>TOTAL NUMBER OF PALLETS: {fmt(f.totalPallets, 0)}</Text>
          <Text style={d.fact}>TOTAL: {f.containerSummary || DASH}</Text>
          <Text style={d.fact}>TOTAL NET WEIGHT: {fmt(roundKg(f.totalNetWeightKg), 2)} KGS</Text>
          <Text style={d.fact}>
            TOTAL GROSS WEIGHT: {fmt(roundKg(f.totalGrossWeightKg), 2)} KGS
          </Text>
        </View>

        <Text style={d.declare}>
          HEREBY DECLARE THAT THESE GOODS ARE OF {f.countryOfOrigin || "UNITED STATES"} ORIGIN
        </Text>

        {/* --- container table ----------------------------------------------- */}
        <View style={d.table}>
          <View style={d.tableHeader} fixed>
            <Text style={[d.th, { width: 86 }]}>Container #</Text>
            <Text style={[d.th, { width: 64 }]}>Seal #</Text>
            <Text style={[d.th, d.right, { width: 74 }]}>Net Weight</Text>
            <Text style={[d.th, d.right, { width: 74 }]}>Gross Weight</Text>
            <Text style={[d.th, d.right, { width: 46 }]}>Pkgs</Text>
            <Text style={[d.th, d.right, { width: 42 }]}>Pallets</Text>
            <Text style={[d.th, { width: 34 }]}>UoM</Text>
            <Text style={[d.th, { flex: 1 }]}>Lot No.</Text>
          </View>

          {f.lines.map((line) => (
            <View key={line.containerId} style={d.tableRow} wrap={false}>
              <Text style={[d.td, { width: 86 }]}>{line.containerNumber || DASH}</Text>
              <Text style={[d.td, { width: 64 }]}>{line.sealNumber || DASH}</Text>
              <Text style={[d.td, d.right, { width: 74 }]}>
                {fmt(roundKg(line.netWeightKg), 2)}
              </Text>
              <Text style={[d.td, d.right, { width: 74 }]}>
                {fmt(roundKg(line.grossWeightKg), 2)}
              </Text>
              <Text style={[d.td, d.right, { width: 46 }]}>{line.packageCount ?? DASH}</Text>
              <Text style={[d.td, d.right, { width: 42 }]}>{line.palletCount ?? DASH}</Text>
              <Text style={[d.td, { width: 34 }]}>KG</Text>
              {/* A box stuffed from two lots prints both. */}
              <Text style={[d.td, { flex: 1 }]}>
                {line.lotNumbers.length ? line.lotNumbers.join(", ") : DASH}
              </Text>
            </View>
          ))}

          <View style={d.totalRow}>
            <Text style={[d.th, { width: 150 }]}>Total Qty</Text>
            <Text style={[d.th, d.right, { width: 74 }]}>
              {fmt(roundKg(f.totalNetWeightKg), 2)}
            </Text>
            <Text style={[d.th, d.right, { width: 74 }]}>
              {fmt(roundKg(f.totalGrossWeightKg), 2)}
            </Text>
            <Text style={[d.th, d.right, { width: 46 }]}>{fmt(f.totalPackages, 0)}</Text>
            <Text style={[d.th, d.right, { width: 42 }]}>{fmt(f.totalPallets, 0)}</Text>
            <Text style={[d.th, { width: 34 }]}>KG</Text>
            <Text style={[d.th, { flex: 1 }]}> </Text>
          </View>
        </View>

        {/* --- routing strip -------------------------------------------------- */}
        <View style={[d.table, { marginTop: 10 }]}>
          <View style={d.tableHeader}>
            <Text style={[d.th, { flex: 1 }]}>POL</Text>
            <Text style={[d.th, { flex: 1 }]}>POD</Text>
            <Text style={[d.th, { flex: 1 }]}>ATD</Text>
            <Text style={[d.th, { flex: 1 }]}>ETA</Text>
          </View>
          <View style={d.tableRow}>
            <Text style={[d.td, { flex: 1 }]}>{f.portOfLoading || DASH}</Text>
            <Text style={[d.td, { flex: 1 }]}>{f.portOfDischarge || DASH}</Text>
            <Text style={[d.td, { flex: 1 }]}>{f.atd || DASH}</Text>
            <Text style={[d.td, { flex: 1 }]}>{f.eta || DASH}</Text>
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
