// =============================================================================
// Contract boilerplate
// =============================================================================
// The fixed legal text on a Sales Contract: the numbered clauses under the
// terms block, and the Conditions of Sales Agreement that prints as page 2.
//
// Held in code rather than in a table on purpose — this is legal wording. A
// change to it should arrive as a reviewable diff in a pull request, not as a
// row somebody edited in a form. It is NOT part of the document payload for the
// same reason: freezing a copy per document would leave hundreds of duplicates
// to migrate the day counsel revises a clause, and the clauses are identical on
// every contract anyway.
//
// Transcribed from the executed samples (18036-RC1).
// =============================================================================

/** Numbered clauses 8-12 on the face page, after the payment block. */
export const CONTRACT_CLAUSES: readonly string[] = [
  "TOLERANCE: {TOLERANCE} % MORE OR LESS ON BOTH CREDIT AMOUNT AND QUANTITY ARE ACCEPTABLE.",
  "Third Party Documents are Acceptable",
  "Transshipment and Partial Shipment Allowed",
  "The Plastics Exchange, LLC shall not hold responsible for any delay or cancellation of shipment caused by the Shipping Line.",
  "Contract is subjected to U.S.A. Law and Jurisdiction and The Plastics Exchange, LLC's general terms and conditions.",
];

/**
 * Fill the clause placeholders. Only the tolerance varies, and it comes from
 * the deal — so a contract written at 3% says 3% in the clause too, rather than
 * the boilerplate contradicting the terms block above it.
 */
export function contractClauses(tolerancePct: number): string[] {
  const tolerance = Number.isInteger(tolerancePct) ? tolerancePct.toFixed(1) : String(tolerancePct);
  return CONTRACT_CLAUSES.map((c) => c.replace("{TOLERANCE}", tolerance));
}

/** Page 2 — Conditions of Sales Agreement, one paragraph per entry. */
export const CONDITIONS_OF_SALE: readonly string[] = [
  "All orders for goods placed by Purchaser with The Plastics Exchange, LLC (TPE), whether written or verbal or whether made simultaneously with the submission of a credit application or any time thereafter, shall be subject to the terms and conditions set forth below. ALL ORDERS ARE SUBJECT TO CREDIT APPROVAL. These terms and conditions shall take precedence over any differing terms in any other documentation of Purchaser including, but not limited to, any other clauses or terms which appear on any correspondence, purchase orders, or order slips of Purchaser. Once a Purchase Order has received a Sales Confirmation from The Plastics Exchange, the order is only cancelable with the expressed written consent of The Plastics Exchange.",

  "The Purchaser is required to immediately test material upon delivery. Rejection of nonconforming materials received by Purchaser shall be made by sending written notification of such rejection to TPE within ten (10) days of the Purchaser's receipt of goods. Such notification shall state the basis of the nonconformity of the goods and a detailed description of that portion of the shipment being rejected. Purchaser's failure to give notice in writing to TPE within ten (10) days of Purchaser's receipt of goods shall constitute an absolute and unconditional acceptance of such materials and a waiver by Purchaser of all claims with respect thereto.",

  "Upon receipt of notification of rejection, TPE shall have a reasonable period under the circumstances to undertake an inspection of any rejected goods at the point of delivery. Goods determined to be nonconforming by TPE will be replaced or credit will be issued to Purchaser, at TPE's option. At no time will TPE's liability exceed the amount invoiced on the subject purchase order for the nonconforming goods. No credit for incidental or consequential damages will be issued by TPE. TPE shall not be liable for delay in performance or nonperformance caused by circumstances beyond its control, including, but not limited to: Acts of God, fire, explosion, flood, natural catastrophe, war, civil disturbance, governmental regulation, direction or request, accident, strike, labor trouble, shortage of or inability to obtain material, equipment, transportation or Force Majeure.",

  "Purchaser agrees to indemnify and hold harmless TPE against any and all claims and inability arising out of any use of the materials or of products made from the material purchased from TPE.",

  "DISCLAIMER OR WARRANTIES: PURCHASER AND TPE AGREE THAT TPE DOES NOT MAKE OR INTEND AND TPE DOES NOT AUTHORIZE ANY AGENT OR REPRESENTATIVE TO MAKE ANY REPRESENTATIONS OR WARRANTIES, OR IMPLIED, OR MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE (WHETHER OR NOT THAT PURPOSE IS KNOWN TO TPE), OR OTHERWISE WITH RESPECT TO ITS PRODUCTS. ANY SUGGESTIONS BY TPE CONCERNING USES OR APPLICATIONS OF ITS PRODUCTS REFLECT TPE'S OPINION ONLY AND TPE MAKES NO WARRANTY OR RESULTS TO BE OBTAINED. TPE SHALL NOT BE LIABLE FOR, AND PURCHASER ASSUMES RESPONSIBILITY FOR, ALL PERSONAL AND BODILY INJURY AND PROPERTY DAMAGES RESULTING FROM THE HANDLING, POSSESSION, USE OR RESALE OF TPE'S PRODUCTS. TPE SHALL NOT BE LIABLE FOR CONSEQUENTIAL DAMAGES, PUNATIVE DAMAGES, OR LOSS OF PROFITS. IN ANY EVENT, TPE'S LIABILITY SHALL NOT EXCEED THE VALUE OF THE ORDER AT ISSUE.",

  "This agreement shall be governed, construed and enforced in accordance with the substantive laws of the State of Arizona without regard to the principle of conflict of laws.",

  "Failure to pay amount due on account beyond stated terms will accrue interest at the rate of 0.75% per 15 days until paid, or the maximum interest rate allowable by Law, and Purchaser agrees to pay any and all costs associated with the recovery of such amounts due on account including principal, interest, associated credit insurance fees and attorney costs. In the case of rail car purchases, such rail cars must be released within 60 days of placement at Purchaser's location. Failure to do so will make Purchaser liable for all demurrage charges, at a minimum rate of $75 per day, arising from such lateness. Payments are due per the terms printed on the face page of this invoice.",

  "During the normal course of business, should The Plastics Exchange, LLC have an amount outstanding due to the Customer, at The Plastics Exchange, LLC discretion, these amounts may be Set-Off against the amounts due from the Customer.",

  "The invalidity of any one or more of the clauses or words contained in this Agreement shall not affect the enforceability of the remaining portions of this Agreement, all of which are inserted conditionally on being valid in law, and in the event any part or portions of this Agreement shall be invalid or illegal or unenforceable in whole or in part, neither the validity of the remaining part of such term nor the validity of any other term of this Agreement shall in any way be affected thereby.",

  "The waiver by any provision of this Agreement shall not operate as, or be construed to be, a waiver of any subsequent breach hereof. The terms of this Conditions of Sales Agreement, combined with any invoice or other similar document issued by TPE with respect to orders for goods placed by Purchaser, are intended by the parties as the complete expression of their agreement, with respect to each order for goods placed by Purchaser with TPE. Any and all changes, amendments, or modifications of the Agreement shall not be effective unless made in writing and signed by the parties hereto.",

  "In the event of any litigation of any action, suit, counterclaim or proceeding (i) to enforce or defend any rights under or in connection with this Conditions of Sale Agreement or any amendment, document or agreement delivered or which may in the future be delivered in connection herewith, or (ii) arising from any dispute or controversy in connection with or related to this Condition of Sale Agreement or any such amendment, document or agreement, the prevailing party in such action, suit, counterclaim or proceeding shall be entitled to recover from the other party in such action, such sum as the court shall fix as reasonable attorney's fees incurred by such prevailing party. Buyer irrevocably waives any right to trial by jury in the aforementioned paragraph for any action, suit counterclaim or proceeding and agrees that any such action, suit, counterclaim or proceeding shall be tried before a court in the City of Scottsdale, Maricopa County, Arizona and not before a jury.",
];

/** The default note in the contract's REMARKS box. */
export const DEFAULT_CONTRACT_REMARKS = "SUBJECT TO APPROVED CREDIT LIMIT";
