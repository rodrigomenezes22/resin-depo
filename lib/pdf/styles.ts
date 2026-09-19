// =============================================================================
// PDF stylesheet
// =============================================================================
// @react-pdf/renderer is NOT React-DOM. There is no Tailwind here, no cascade,
// and no `className` — only its own `StyleSheet.create` and a flexbox subset.
// Everything a template needs to look like TPE's existing paperwork lives here
// so the templates stay declarative.
//
// Sizes are in PDF points (72pt = 1 inch). The samples are dense business
// forms: 8-9pt body, hairline rules, no decoration.
// =============================================================================

import { StyleSheet } from "@react-pdf/renderer";

export const COLORS = {
  ink: "#111111",
  muted: "#555555",
  rule: "#999999",
  headerFill: "#eeeeee",
  voidRed: "#b91c1c",
  /**
   * Legacy prints ESTIMATED and unscheduled values in red — the shipped weight
   * on a purchase order, and a pickup date that still says "ASAP". It is the
   * one piece of colour in that paperwork that carries meaning rather than
   * decoration, so it is reproduced; the blue grid chrome around it is not.
   */
  estimate: "#c00000",
} as const;

export const styles = StyleSheet.create({
  page: {
    paddingTop: 34,
    paddingBottom: 46,
    paddingHorizontal: 34,
    fontSize: 8.5,
    fontFamily: "Helvetica",
    color: COLORS.ink,
    lineHeight: 1.35,
  },

  // --- letterhead ----------------------------------------------------------
  letterhead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  brand: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  brandLines: { fontSize: 8, color: COLORS.muted },
  docTitle: { fontSize: 15, fontFamily: "Helvetica-Bold", textAlign: "center", marginBottom: 10 },

  /**
   * The FORM documents' title — Invoice, Purchase Order, Proforma Invoice.
   *
   * Shaded and underlined, as legacy sets it. Two samples show the treatment
   * (the purchase order and the proforma invoice); the invoice was originally
   * built with the plain `docTitle` above, and now matches its siblings —
   * those three are one letterhead and their titles must not differ.
   *
   * The LETTER documents use `letterStyles.title` instead: plain and centred,
   * because a letter that boxes its subject line reads like a form.
   */
  formTitleWrap: { alignItems: "center", marginBottom: 14 },
  formTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    backgroundColor: COLORS.headerFill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    textDecoration: "underline",
  },

  // --- the header reference grid (Invoice No. / Terms / Incoterms …) -------
  refTable: { borderWidth: 0.5, borderColor: COLORS.rule, width: 232 },
  refRow: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: COLORS.rule },
  refRowLast: { flexDirection: "row" },
  refKey: {
    width: 96,
    padding: 3,
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    borderRightWidth: 0.5,
    borderColor: COLORS.rule,
  },
  refValue: { flex: 1, padding: 3, fontSize: 7.5 },

  // --- party blocks --------------------------------------------------------
  boxRow: { flexDirection: "row", borderWidth: 0.5, borderColor: COLORS.rule, marginBottom: -0.5 },
  box: { flex: 1, padding: 5, borderRightWidth: 0.5, borderColor: COLORS.rule },
  boxLast: { flex: 1, padding: 5 },
  boxLabel: { fontFamily: "Helvetica-Bold", fontSize: 7.5, marginBottom: 2 },
  boxLine: { fontSize: 8 },

  // --- the container table -------------------------------------------------
  table: { marginTop: 10, borderWidth: 0.5, borderColor: COLORS.rule },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: COLORS.headerFill,
    borderBottomWidth: 0.5,
    borderColor: COLORS.rule,
  },
  tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: COLORS.rule },
  th: {
    padding: 4,
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    borderRightWidth: 0.5,
    borderColor: COLORS.rule,
  },
  td: { padding: 4, fontSize: 8, borderRightWidth: 0.5, borderColor: COLORS.rule },
  totalRow: { flexDirection: "row", backgroundColor: COLORS.headerFill },
  right: { textAlign: "right" },

  // --- footer / watermark --------------------------------------------------
  footer: {
    position: "absolute",
    bottom: 22,
    left: 34,
    right: 34,
    fontSize: 7,
    color: COLORS.muted,
    textAlign: "center",
  },
  voidBanner: {
    borderWidth: 1,
    borderColor: COLORS.voidRed,
    color: COLORS.voidRed,
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    padding: 5,
    marginBottom: 8,
    textAlign: "center",
  },
  draftBanner: {
    borderWidth: 1,
    borderColor: COLORS.muted,
    color: COLORS.muted,
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    padding: 5,
    marginBottom: 8,
    textAlign: "center",
  },
});

/** Column widths for the container table, in points. Must sum to ~527 (A4 - margins). */
export const CONTAINER_COLS = {
  container: 78,
  seal: 58,
  netKg: 66,
  grossKg: 66,
  packages: 74,
  pallets: 42,
  unitPrice: 60,
  lineTotal: 76,
} as const;

/**
 * The transaction documents' goods table, in points.
 *
 * ONE set of widths for the Invoice and the Purchase Order. The two print the
 * same eight columns of the same deal and differ only in two headings, so
 * separate copies would have drifted into two subtly different tables — which
 * on a printed page reads as two different companies' paperwork.
 *
 * Sums to 527: LETTER width less the page's 34pt horizontal margins.
 */
export const TRANSACTION_COLS = {
  amount: 42,
  size: 54,
  lbs: 54,
  perLb: 46,
  product: 168,
  pickup: 62,
  terms: 44,
  total: 57,
} as const;

/**
 * Shared document furniture — the block/table primitives the Packing List,
 * Proforma Invoice and Certificate of Origin all use. Kept together so three
 * documents cannot drift into three slightly different table borders.
 */
export const docStyles = StyleSheet.create({
  billTo: { marginBottom: 8 },
  blockLabel: { fontSize: 7.5, fontFamily: "Helvetica-Bold", marginBottom: 1 },
  blockLine: { fontSize: 8 },

  declaration: { borderWidth: 0.5, borderColor: COLORS.rule, marginBottom: 8 },
  declRow: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: COLORS.rule },
  declKey: {
    flex: 1,
    padding: 4,
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    borderRightWidth: 0.5,
    borderColor: COLORS.rule,
  },
  declValue: {
    flex: 1,
    padding: 4,
    fontSize: 8.5,
    borderRightWidth: 0.5,
    borderColor: COLORS.rule,
  },

  facts: { marginBottom: 6 },
  fact: { fontSize: 8, fontFamily: "Helvetica-Bold", marginBottom: 1 },
  declare: { fontSize: 8, marginBottom: 8 },

  table: { borderWidth: 0.5, borderColor: COLORS.rule },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: COLORS.headerFill,
    borderBottomWidth: 0.5,
    borderColor: COLORS.rule,
  },
  tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: COLORS.rule },
  th: {
    padding: 4,
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    borderRightWidth: 0.5,
    borderColor: COLORS.rule,
  },
  td: { padding: 4, fontSize: 7.5, borderRightWidth: 0.5, borderColor: COLORS.rule },
  totalRow: { flexDirection: "row", backgroundColor: COLORS.headerFill },
  right: { textAlign: "right" },

  // Certificate of Origin — a grid of numbered boxes, not a flowing document.
  boxGrid: { borderWidth: 0.5, borderColor: COLORS.rule },
  boxRow: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: COLORS.rule },
  box: {
    padding: 4,
    borderRightWidth: 0.5,
    borderColor: COLORS.rule,
    minHeight: 40,
  },
  boxNum: { fontSize: 6, color: COLORS.muted },
  boxText: { fontSize: 7.5 },
  boxTextBold: { fontSize: 8, fontFamily: "Helvetica-Bold" },
});

/**
 * Sales Contract layout. Kept beside the invoice styles rather than inside the
 * template, so the two documents share the page frame, the banners and the
 * footer and only differ where the paperwork genuinely differs.
 */
export const contractStyles = StyleSheet.create({
  titleRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", letterSpacing: 1 },
  identity: { fontSize: 8, textAlign: "right" },

  partyRow: { flexDirection: "row", gap: 24, marginBottom: 10 },
  partyCol: { flex: 1 },
  partyLabel: { fontSize: 8, color: COLORS.muted },
  partyName: { fontSize: 9.5, fontFamily: "Helvetica-Bold" },
  partyLine: { fontSize: 8.5 },

  preamble: { fontSize: 8, marginBottom: 10, lineHeight: 1.4 },

  table: { borderWidth: 0.5, borderColor: COLORS.rule, marginBottom: 10 },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderColor: COLORS.rule,
    backgroundColor: COLORS.headerFill,
  },
  tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: COLORS.rule },
  th: {
    padding: 5,
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    borderRightWidth: 0.5,
    borderColor: COLORS.rule,
  },
  td: { padding: 5, fontSize: 8.5, borderRightWidth: 0.5, borderColor: COLORS.rule },
  totalRow: { flexDirection: "row", backgroundColor: COLORS.headerFill },
  right: { textAlign: "right" },

  boxedRow: {
    flexDirection: "row",
    borderWidth: 0.5,
    borderColor: COLORS.rule,
    marginBottom: -0.5,
  },
  boxedLabel: {
    width: 90,
    padding: 4,
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    borderRightWidth: 0.5,
    borderColor: COLORS.rule,
  },
  boxedValue: { flex: 1, padding: 4, fontSize: 8.5, fontFamily: "Helvetica-Bold" },

  terms: { marginTop: 10, marginBottom: 10 },
  termRow: { flexDirection: "row", marginBottom: 2 },
  termNum: { width: 16, fontSize: 8 },
  termLabel: { width: 96, fontSize: 8 },
  termValue: { flex: 1, fontSize: 8.5 },

  bankBox: {
    borderWidth: 0.5,
    borderColor: COLORS.rule,
    padding: 5,
    marginBottom: 10,
  },
  bankRow: { flexDirection: "row" },
  bankKey: { width: 118, fontSize: 7.5, fontFamily: "Helvetica-Bold" },
  bankValue: { flex: 1, fontSize: 7.5, fontFamily: "Helvetica-Bold" },

  clauses: { marginBottom: 18 },
  clauseRow: { flexDirection: "row", marginBottom: 2 },
  clauseNum: { width: 16, fontSize: 7.5 },
  clauseText: { flex: 1, fontSize: 7.5, lineHeight: 1.35 },

  signRow: { flexDirection: "row", gap: 40, marginTop: 10 },
  signCol: { flex: 1 },
  signLabel: { fontSize: 8, color: COLORS.muted },
  signName: { fontSize: 9, fontFamily: "Helvetica-Bold", marginBottom: 22 },
  signLine: { borderTopWidth: 0.5, borderColor: COLORS.ink },
  signDate: { fontSize: 7.5, marginTop: 2 },

  conditionsTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginBottom: 10,
  },
  conditionsPara: { fontSize: 7, lineHeight: 1.45, marginBottom: 6, textAlign: "justify" },
});

/** en-US number formatting, applied only at render — never before summing. */
export const fmt = (n: number, dp: number): string =>
  n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

export const fmtMoney = (n: number, currency: string): string => `${currency} ${fmt(n, 2)}`;
