// =============================================================================
// Sales Contract — PDF template
// =============================================================================
// Modelled on the executed sample (18036-RC1): buyer and seller blocks side by
// side under the title, a commodity table with a totals row, the PACKING and
// REMARKS boxes, the numbered terms, the wire block, the fixed clauses, and
// signature lines. Page 2 is the Conditions of Sales Agreement.
//
// THE ONE ARGUMENT RULE, as with every template here: it takes the parsed
// payload and nothing else. No database, no clock, no lookups — a contract
// re-fetched a year from now renders byte-identically because its input is
// frozen.
// =============================================================================

import { Document, Page, Text, View } from "@react-pdf/renderer";
import { Logo } from "@/lib/pdf/logo";

import { CONDITIONS_OF_SALE, contractClauses } from "@/lib/export-shipment/documents/boilerplate";
import { partyLines } from "@/lib/export-shipment/documents/parties";
import { roundMoney, roundMt } from "@/lib/export-shipment/documents/totals";
import type { SalesContractFields } from "@/lib/export-shipment/documents/types";
import { contractStyles as s, fmt, styles } from "../styles";

const DASH = "—";

function TermRow({ n, label, value }: { n: number; label: string; value: string | null }) {
  return (
    <View style={s.termRow}>
      <Text style={s.termNum}>{n}.</Text>
      <Text style={s.termLabel}>{label}</Text>
      <Text style={s.termValue}>{value || DASH}</Text>
    </View>
  );
}

function BankRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View style={s.bankRow}>
      <Text style={s.bankKey}>{label}</Text>
      <Text style={s.bankValue}>{value}</Text>
    </View>
  );
}

export interface SalesContractPdfProps {
  fields: SalesContractFields;
  status: "draft" | "issued" | "superseded" | "void";
  voidReason?: string | null;
}

export function SalesContractPdf({ fields, status, voidReason }: SalesContractPdfProps) {
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

        <Logo width={96} />

        {/* --- title + identity --------------------------------------------- */}
        <View style={s.titleRow}>
          <Text style={s.title}>SALES CONTRACT</Text>
          <View style={s.identity}>
            <Text>NO: {fields.documentNumber}</Text>
            <Text>DATE: {fields.contractDate}</Text>
          </View>
        </View>

        {/* --- the parties -------------------------------------------------- */}
        <View style={s.partyRow}>
          <View style={s.partyCol}>
            <Text style={s.partyLabel}>The BUYER:</Text>
            {partyLines(fields.buyer).map((line, i) => (
              <Text key={i} style={i === 0 ? s.partyName : s.partyLine}>
                {line}
              </Text>
            ))}
          </View>
          <View style={s.partyCol}>
            <Text style={s.partyLabel}>The SELLER:</Text>
            {partyLines(fields.seller).map((line, i) => (
              <Text key={i} style={i === 0 ? s.partyName : s.partyLine}>
                {line}
              </Text>
            ))}
          </View>
        </View>

        <Text style={s.preamble}>
          This Sales Contract (this &quot;Contract&quot;) is made by and between the Seller and the
          Buyer above-mentioned, whereby the Buyer agrees to buy, and the Seller agrees to sell the
          commodities on the terms and conditions stipulated below,
        </Text>

        {/* --- commodity table ---------------------------------------------- */}
        <View style={s.table}>
          <View style={s.tableHeader} fixed>
            <Text style={[s.th, { flex: 3 }]}>COMMODITY</Text>
            <Text style={[s.th, s.right, { width: 70 }]}>QUANTITY</Text>
            <Text style={[s.th, s.right, { width: 80 }]}>UNIT PRICE</Text>
            <Text style={[s.th, { width: 90 }]}>TERMS</Text>
            <Text style={[s.th, s.right, { width: 100 }]}>AMOUNT</Text>
          </View>

          {fields.lines.map((line, i) => (
            <View key={i} style={s.tableRow} wrap={false}>
              <View style={[s.td, { flex: 3 }]}>
                <Text>{line.description}</Text>
                {line.grade ? <Text>Grade: {line.grade}</Text> : null}
              </View>
              <Text style={[s.td, s.right, { width: 70 }]}>
                {fmt(roundMt(line.quantityMt), 2)} MT
              </Text>
              <Text style={[s.td, s.right, { width: 80 }]}>
                {fmt(roundMoney(line.unitPricePerMt), 2)}/MT
              </Text>
              <Text style={[s.td, { width: 90 }]}>{line.terms || DASH}</Text>
              <Text style={[s.td, s.right, { width: 100 }]}>
                {fmt(roundMoney(line.amount), 2)} {c}
              </Text>
            </View>
          ))}

          {/* Totals come from the payload, not from re-adding the rows above —
              the same full-precision figures the Commercial Invoice carries. */}
          <View style={s.totalRow}>
            <Text style={[s.th, { flex: 3 }]}> </Text>
            <Text style={[s.th, s.right, { width: 70 }]}>
              {fmt(roundMt(fields.totalQuantityMt), 2)} MT
            </Text>
            <Text style={[s.th, { width: 80 }]}> </Text>
            <Text style={[s.th, { width: 90 }]}> </Text>
            <Text style={[s.th, s.right, { width: 100 }]}>
              {fmt(roundMoney(fields.totalAmount), 2)} {c}
            </Text>
          </View>
        </View>

        {/* --- packing + remarks -------------------------------------------- */}
        <View style={s.boxedRow}>
          <Text style={s.boxedLabel}>PACKING</Text>
          <Text style={s.boxedValue}>{fields.packing || DASH}</Text>
        </View>
        <View style={s.boxedRow}>
          <Text style={s.boxedLabel}>REMARKS</Text>
          <Text style={s.boxedValue}>{fields.remarks || DASH}</Text>
        </View>

        {/* --- numbered terms ----------------------------------------------- */}
        <View style={s.terms}>
          <TermRow n={2} label="Port of loading:" value={fields.portOfLoading} />
          <TermRow n={3} label="Port of discharge:" value={fields.portOfDischarge} />
          <TermRow n={4} label="Insurance:" value={fields.insurance} />
          <TermRow n={5} label="Shipment window:" value={fields.shipmentWindow} />
          <TermRow n={6} label="Payment term:" value={fields.paymentTerms} />
        </View>

        {/* --- wire block ---------------------------------------------------- */}
        {fields.bank ? (
          <View style={s.bankBox}>
            <BankRow label="Payment to be made to:" value={fields.bank.beneficiaryName} />
            <BankRow label="Bank Name:" value={fields.bank.bankName} />
            <BankRow label="Bank Address:" value={fields.bank.bankAddress} />
            <BankRow label="Swift Code:" value={fields.bank.swiftCode} />
            <BankRow label="Account NO:" value={fields.bank.accountNumber} />
            <BankRow label="ABA #:" value={fields.bank.abaRouting} />
            <BankRow label="IBAN:" value={fields.bank.iban} />
          </View>
        ) : null}

        {/* --- fixed clauses ------------------------------------------------- */}
        <View style={s.clauses}>
          {contractClauses(fields.tolerancePct).map((clause, i) => (
            <View key={i} style={s.clauseRow}>
              <Text style={s.clauseNum}>{i + 8}.</Text>
              <Text style={s.clauseText}>{clause}</Text>
            </View>
          ))}
        </View>

        {/* --- signatures ---------------------------------------------------- */}
        <View style={s.signRow}>
          <View style={s.signCol}>
            <Text style={s.signLabel}>The SELLER:</Text>
            <Text style={s.signName}>{fields.seller.name}</Text>
            <View style={s.signLine} />
            <Text style={s.signDate}>Date: {fields.contractDate}</Text>
          </View>
          <View style={s.signCol}>
            <Text style={s.signLabel}>The BUYER:</Text>
            <Text style={s.signName}>{fields.buyer.name}</Text>
            <View style={s.signLine} />
            <Text style={s.signDate}>Date:</Text>
          </View>
        </View>

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `${fields.documentNumber}   ·   Page ${pageNumber} of ${totalPages}   ·   The Plastics Exchange, LLC`
          }
          fixed
        />
      </Page>

      {/* --- page 2: the standing terms ------------------------------------- */}
      <Page size="A4" style={styles.page}>
        <Text style={s.conditionsTitle}>Conditions of Sales Agreement</Text>
        {CONDITIONS_OF_SALE.map((para, i) => (
          <Text key={i} style={s.conditionsPara}>
            {para}
          </Text>
        ))}
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
