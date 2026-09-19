"use client";

// =============================================================================
// PartyFields — the name/address/contact block, editable
// =============================================================================
// Shared by every document form. A party block is the same eleven fields
// wherever it appears; rendering it twice would let the Commercial Invoice's
// consignee and the Sales Contract's buyer drift apart in what they let you
// type, which is the opposite of the point.
//
// Rendered inside a nested full-width Grid: `Cell` spans auto-place into
// leftover columns, so a party dropped straight into a parent grid would tuck
// its first field alongside whatever preceded it.
// =============================================================================

import { Cell, Grid } from "@/components/bank/chrome";
import { Input } from "@/components/ui/input";
import type { PartyBlock } from "@/lib/export-shipment/documents/types";

export function PartyFields({
  fieldKey,
  party,
  setParty,
  locked,
  nameLabel = "Name",
}: {
  /** Prefixes the input ids, so two party blocks on one form stay distinct. */
  fieldKey: string;
  party: PartyBlock;
  setParty: (next: PartyBlock) => void;
  locked: boolean;
  nameLabel?: string;
}) {
  const set = (k: keyof PartyBlock) => (v: string) => setParty({ ...party, [k]: v || null });

  return (
    <Grid className="col-span-12">
      <Cell label={nameLabel} span={12} htmlFor={`${fieldKey}-name`}>
        <Input
          id={`${fieldKey}-name`}
          className="h-8"
          value={party.name}
          disabled={locked}
          onChange={(e) => setParty({ ...party, name: e.target.value })}
        />
      </Cell>
      <Cell label="Address" span={6} htmlFor={`${fieldKey}-address`}>
        <Input
          id={`${fieldKey}-address`}
          className="h-8"
          value={party.address ?? ""}
          disabled={locked}
          onChange={(e) => set("address")(e.target.value)}
        />
      </Cell>
      <Cell label="Address line 2" span={6} htmlFor={`${fieldKey}-address2`}>
        <Input
          id={`${fieldKey}-address2`}
          className="h-8"
          value={party.address2 ?? ""}
          disabled={locked}
          onChange={(e) => set("address2")(e.target.value)}
        />
      </Cell>
      <Cell label="City" span={3} htmlFor={`${fieldKey}-city`}>
        <Input
          id={`${fieldKey}-city`}
          className="h-8"
          value={party.city ?? ""}
          disabled={locked}
          onChange={(e) => set("city")(e.target.value)}
        />
      </Cell>
      <Cell label="State" span={2} htmlFor={`${fieldKey}-state`}>
        <Input
          id={`${fieldKey}-state`}
          className="h-8"
          value={party.state ?? ""}
          disabled={locked}
          onChange={(e) => set("state")(e.target.value)}
        />
      </Cell>
      <Cell label="ZIP" span={2} htmlFor={`${fieldKey}-zip`}>
        <Input
          id={`${fieldKey}-zip`}
          className="h-8"
          value={party.zip ?? ""}
          disabled={locked}
          onChange={(e) => set("zip")(e.target.value)}
        />
      </Cell>
      <Cell label="Country" span={3} htmlFor={`${fieldKey}-country`}>
        <Input
          id={`${fieldKey}-country`}
          className="h-8"
          value={party.country ?? ""}
          disabled={locked}
          onChange={(e) => set("country")(e.target.value)}
        />
      </Cell>
      <Cell label="Tax ID" span={4} htmlFor={`${fieldKey}-tax`}>
        <Input
          id={`${fieldKey}-tax`}
          className="h-8"
          value={party.taxId ?? ""}
          disabled={locked}
          onChange={(e) => set("taxId")(e.target.value)}
        />
      </Cell>
      <Cell label="Contact" span={4} htmlFor={`${fieldKey}-contact`}>
        <Input
          id={`${fieldKey}-contact`}
          className="h-8"
          value={party.contactName ?? ""}
          disabled={locked}
          onChange={(e) => set("contactName")(e.target.value)}
        />
      </Cell>
      <Cell label="Email" span={4} htmlFor={`${fieldKey}-email`}>
        <Input
          id={`${fieldKey}-email`}
          className="h-8"
          value={party.email ?? ""}
          disabled={locked}
          onChange={(e) => set("email")(e.target.value)}
        />
      </Cell>
    </Grid>
  );
}
