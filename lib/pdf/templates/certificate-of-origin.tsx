// =============================================================================
// Certificate of Origin — PDF template
// =============================================================================
// Modelled on the sample (NAM8324516). Unlike the other four this is a fixed
// government-style FORM: a grid of numbered boxes whose positions and numbers a
// customs officer expects, not a flowing document. The box numbers are printed
// small in each cell exactly as on the paper, and they match the field names in
// CertificateOfOriginSchema so the two can be read side by side.
//
// One argument: the parsed payload.
// =============================================================================

import { Document, Page, Text, View } from "@react-pdf/renderer";
import { Logo } from "@/lib/pdf/logo";

import { partyLines } from "@/lib/export-shipment/documents/parties";
import { roundKg, roundMt } from "@/lib/export-shipment/documents/totals";
import type { CertificateOfOriginFields } from "@/lib/export-shipment/documents/types";
import { docStyles as d, fmt, styles } from "../styles";
import type { PartyBlock } from "@/lib/export-shipment/documents/types";

const DASH = "—";

function Box({
  n,
  label,
  children,
  width,
  flex,
  last,
}: {
  n?: string;
  label: string;
  children?: React.ReactNode;
  width?: number;
  flex?: number;
  last?: boolean;
}) {
  return (
    <View
      style={[d.box, last ? { borderRightWidth: 0 } : {}, width ? { width } : { flex: flex ?? 1 }]}
    >
      <Text style={d.boxNum}>
        {n ? `(${n}) ` : ""}
        {label}
      </Text>
      {children}
    </View>
  );
}

const Lines = ({ party }: { party: PartyBlock }) => (
  <>
    {partyLines(party).map((line, i) => (
      <Text key={i} style={i === 0 ? d.boxTextBold : d.boxText}>
        {line}
      </Text>
    ))}
  </>
);

const Val = ({ children }: { children: React.ReactNode }) => (
  <Text style={d.boxTextBold}>{children || DASH}</Text>
);

export interface CertificateOfOriginPdfProps {
  fields: CertificateOfOriginFields;
  status: "draft" | "issued" | "superseded" | "void";
  voidReason?: string | null;
}

export function CertificateOfOriginPdf({
  fields,
  status,
  voidReason,
}: CertificateOfOriginPdfProps) {
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

        <View style={{ alignItems: "flex-start" }}>
          <Logo width={90} />
        </View>
        <Text style={styles.docTitle}>CERTIFICATE OF ORIGIN</Text>

        <View style={d.boxGrid}>
          <View style={d.boxRow}>
            <Box n="2" label="SHIPPER/EXPORTER" flex={2}>
              <Lines party={f.shipper} />
            </Box>
            <Box label="BOOKING NO">
              <Val>{f.bookingNumber}</Val>
            </Box>
            <Box n="5A" label="BILL OF LADING NO" last>
              <Val>{f.blNumber}</Val>
            </Box>
          </View>

          <View style={d.boxRow}>
            <Box n="3" label="CONSIGNEE" flex={2}>
              <Lines party={f.consignee} />
            </Box>
            <Box n="6" label="EXPORT REFERENCES" flex={2} last>
              <Text style={d.boxText}>{f.exportReferences || DASH}</Text>
              <Text style={d.boxNum}>(7) FORWARDING AGENT / FMC NO.</Text>
              <Text style={d.boxText}>{f.forwardingAgent || DASH}</Text>
              <Text style={d.boxText}>{f.fmcNumber || ""}</Text>
            </Box>
          </View>

          <View style={d.boxRow}>
            <Box n="4" label="NOTIFY PARTY" flex={2}>
              <Lines party={f.notifyParty} />
            </Box>
            <Box n="8" label="POINT AND COUNTRY OF ORIGIN">
              <Val>{f.countryOfOrigin}</Val>
            </Box>
            <Box n="9" label="ALSO NOTIFY — ROUTING INSTRUCTIONS" last>
              <Text style={d.boxText}>{f.routingInstructions || DASH}</Text>
            </Box>
          </View>

          <View style={d.boxRow}>
            <Box n="12" label="INITIAL CARRIAGE BY">
              <Val>{null}</Val>
            </Box>
            <Box n="13" label="PLACE OF INITIAL RECEIPT">
              <Val>{f.placeOfReceipt}</Val>
            </Box>
            <Box n="9A" label="FINAL DESTINATION" last>
              <Val>{f.finalDestination}</Val>
            </Box>
          </View>

          <View style={d.boxRow}>
            <Box n="14" label="VESSEL / VOY">
              <Val>{f.vesselVoyage}</Val>
            </Box>
            <Box n="15" label="PORT OF LOADING">
              <Val>{f.portOfLoading}</Val>
            </Box>
            <Box n="10" label="LOADING TERMINAL" last>
              <Val>{f.loadingTerminal}</Val>
            </Box>
          </View>

          <View style={d.boxRow}>
            <Box n="16" label="PORT OF DISCHARGE">
              <Val>{f.portOfDischarge}</Val>
            </Box>
            <Box n="17" label="PLACE OF DELIVERY BY ON-CARRIER">
              <Val>{f.placeOfDelivery}</Val>
            </Box>
            <Box n="11" label="TYPE OF MOVE" last>
              <Val>{f.typeOfMove}</Val>
            </Box>
          </View>

          {/* --- the goods block ---------------------------------------------- */}
          <View style={d.boxRow}>
            <Box n="18" label="MKS. & NOS. / CONT. NOS." width={110}>
              {(f.marksAndNumbers ?? DASH).split("\n").map((line, i) => (
                <Text key={i} style={d.boxText}>
                  {line}
                </Text>
              ))}
            </Box>
            <Box n="19" label="NO. OF PKGS." width={62}>
              <Text style={d.boxTextBold}>{fmt(f.packageCount, 0)}</Text>
              <Text style={d.boxText}>{f.packageKind ?? ""}</Text>
            </Box>
            <Box n="20" label="DESCRIPTION OF PACKAGES AND GOODS" flex={2}>
              <Text style={d.boxTextBold}>
                WE HEREBY CERTIFY THAT THE GOODS ARE OF {f.countryOfOrigin || "UNITED STATES"}{" "}
                ORIGIN
              </Text>
              <Text style={[d.boxText, { marginTop: 4 }]}>{f.containerSummary}</Text>
              <Text style={d.boxText}>
                {fmt(roundMt(f.quantityMt), 2)} MT {f.descriptionOfGoods}
              </Text>
              {f.commodityCode ? <Text style={d.boxText}>HS CODE: {f.commodityCode}</Text> : null}
              <Text style={d.boxText}>NET WEIGHT: {fmt(roundKg(f.netWeightKg), 2)} KGS</Text>
              {f.invoiceReference ? (
                <Text style={[d.boxText, { marginTop: 4 }]}>INVOICE No. {f.invoiceReference}</Text>
              ) : null}
            </Box>
            <Box n="21" label="GROSS WEIGHT" width={78}>
              <Text style={d.boxTextBold}>{fmt(roundKg(f.grossWeightKg), 2)} KGS</Text>
            </Box>
            <Box n="22" label="MEASUREMENT" width={62} last>
              <Text style={d.boxText}>{f.measurement || ""}</Text>
            </Box>
          </View>
        </View>

        {/* --- the declaration + signature area ------------------------------- */}
        <View style={{ marginTop: 12 }}>
          <Text style={d.boxText}>
            The undersigned The Plastics Exchange, LLC does hereby declare for the above named
            shipper, the goods as described above were shipped on the above date and consigned as
            indicated and are products of {f.countryOfOrigin || "the United States"}.
          </Text>
          <Text style={[d.boxTextBold, { marginTop: 10 }]}>Dated at {f.issueDate}</Text>

          <View style={{ flexDirection: "row", gap: 40, marginTop: 30 }}>
            <View style={{ flex: 1 }}>
              <View style={{ borderTopWidth: 0.5, borderColor: "#111111" }} />
              <Text style={d.boxNum}>SIGNATURE OF OWNER OR AGENT</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ borderTopWidth: 0.5, borderColor: "#111111" }} />
              <Text style={d.boxNum}>CHAMBER OF COMMERCE — SECRETARY</Text>
            </View>
          </View>

          {/* The chamber stamp and notary seal are wet ink: generate, print,
              sign, then upload the scan against this document. */}
          <Text style={[d.boxNum, { marginTop: 14 }]}>
            Print, obtain the Chamber of Commerce certification and notary seal, then upload the
            executed original against this document.
          </Text>
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
