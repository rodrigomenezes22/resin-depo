// =============================================================================
// Party blocks
// =============================================================================
// The name/address/contact box that every export document prints two or three
// of. Sourced from `organizations` where the counterparty is a real org, and
// degraded to a name-only block where the deal only carries free text — the
// desk can then complete it in the export sheet rather than being blocked.
// =============================================================================

import type { PartyBlock } from "./types";

/** The organization columns a party block needs. */
export interface PartyOrg {
  name: string;
  address: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  tax_id: string | null;
  contact_name: string | null;
  /** EU registration — only the COO prints it, but it lives on the org. */
  eori?: string | null;
}

export function orgToPartyBlock(org: PartyOrg): PartyBlock {
  return {
    name: org.name,
    address: org.address,
    address2: org.address2,
    city: org.city,
    state: org.state,
    zip: org.zip,
    country: org.country,
    phone: org.phone,
    email: org.email,
    taxId: org.tax_id,
    contactName: org.contact_name,
  };
}

/**
 * A block for a counterparty we only know by name — `matched_orders` carries
 * `buyer_company_text` for deals whose counterparty was never made an org. The
 * document still needs a consignee, so print the name and leave the rest for
 * the desk to fill in.
 */
export function nameOnlyPartyBlock(name: string): PartyBlock {
  return {
    name,
    address: null,
    address2: null,
    city: null,
    state: null,
    zip: null,
    country: null,
    phone: null,
    email: null,
    taxId: null,
    contactName: null,
  };
}

/** "City, ST 60661" — the line under the street, skipping whatever is missing. */
export function cityLine(p: PartyBlock): string {
  const left = [p.city, p.state].filter(Boolean).join(", ");
  return [left, p.zip].filter(Boolean).join(" ").trim();
}

/** The party block as printed lines, blanks dropped. */
export function partyLines(p: PartyBlock): string[] {
  return [
    p.name,
    p.address,
    p.address2,
    cityLine(p) || null,
    p.country,
    p.contactName ? `Attn: ${p.contactName}` : null,
    p.phone,
    p.email,
  ].filter((l): l is string => Boolean(l && l.trim()));
}
