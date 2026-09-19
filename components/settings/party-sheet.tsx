"use client";

// =============================================================================
// PartySheet — create / edit a counterparty (buyer, carrier, …)
// =============================================================================
// One drawer for both the Parties settings page and the "New party…" affordance
// inside the container drawer, so the export desk never has to leave a
// shipment to add the consignee it is about to invoice.
//
// A party is written in TPE's shape (organizations + an office location linked
// as headquarters/billing) by trpc/routers/reference.ts; this form only knows
// the flat fields.
// =============================================================================

import { useState } from "react";
import { toast } from "sonner";

import { Cell, Grid, SELECT_POPUP, SELECT_TRIGGER } from "@/components/bank/chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ClientAPI } from "@/trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/trpc/routers/_app";

export type PartyRow = inferRouterOutputs<AppRouter>["reference"]["parties"]["get"];

export type PartyRole = "buyer" | "seller" | "distributor" | "service_provider" | "partner";

export const PARTY_ROLE_OPTIONS: [PartyRole, string][] = [
  ["buyer", "Buyer / consignee"],
  ["service_provider", "Service provider (carrier, forwarder)"],
  ["seller", "Seller / supplier"],
  ["distributor", "Distributor"],
  ["partner", "Partner"],
];

const SERVICE_KIND_OPTIONS: [string, string][] = [
  ["freight", "Freight / ocean carrier"],
  ["warehouse", "Warehouse"],
  ["both", "Freight + warehouse"],
];

export function PartySheet({
  party,
  defaultRole = "buyer",
  onClose,
  onSaved,
}: {
  /** Existing party to edit; omit to create. */
  party?: PartyRow | null;
  defaultRole?: PartyRole;
  onClose: () => void;
  onSaved: (party: PartyRow) => void;
}) {
  const [name, setName] = useState(party?.name ?? "");
  const [role, setRole] = useState<PartyRole>((party?.role as PartyRole) ?? defaultRole);
  const [serviceKind, setServiceKind] = useState(party?.service_kind ?? "freight");
  const [contactName, setContactName] = useState(party?.contact_name ?? "");
  const [phone, setPhone] = useState(party?.phone ?? "");
  const [email, setEmail] = useState(party?.email ?? "");
  const [taxId, setTaxId] = useState(party?.tax_id ?? "");
  const [eori, setEori] = useState(party?.eori ?? "");
  const [terms, setTerms] = useState(String(party?.payment_terms_days ?? 30));
  const [line1, setLine1] = useState(party?.address?.addressLine1 ?? "");
  const [line2, setLine2] = useState(party?.address?.addressLine2 ?? "");
  const [city, setCity] = useState(party?.address?.city ?? "");
  const [state, setState] = useState(party?.address?.state ?? "");
  const [zip, setZip] = useState(party?.address?.zip ?? "");
  const [country, setCountry] = useState(party?.address?.country ?? "");

  const create = ClientAPI.reference.parties.create.useMutation();
  const update = ClientAPI.reference.parties.update.useMutation();
  const pending = create.isPending || update.isPending;

  async function save() {
    if (!name.trim()) {
      toast.error("Name is required.");
      return;
    }
    const fields = {
      name: name.trim(),
      role,
      serviceKind:
        role === "service_provider" ? (serviceKind as "freight" | "warehouse" | "both") : null,
      contactName,
      phone,
      email,
      taxId,
      eori,
      paymentTermsDays: Number(terms) || 0,
      address: { line1, line2, city, state, zip, country },
    };
    try {
      const saved = party
        ? await update.mutateAsync({ id: party.id, ...fields })
        : await create.mutateAsync(fields);
      toast.success(party ? "Party updated" : "Party created");
      onSaved(saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the party.");
    }
  }

  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader className="p-6 pb-4">
          <SheetTitle className="text-base">{party ? "Edit party" : "New party"}</SheetTitle>
          <SheetDescription>
            Consignees, notify parties and carriers. The address prints on document party blocks
            exactly as entered here.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-6 pb-6">
          <Grid>
            <Cell label="Company name" span={12} htmlFor="party-name">
              <Input
                id="party-name"
                className="h-8"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </Cell>
            <Cell label="PartyRole" span={role === "service_provider" ? 6 : 12}>
              <Select value={role} onValueChange={(v) => v && setRole(v as PartyRole)}>
                <SelectTrigger className={SELECT_TRIGGER} aria-label="PartyRole">
                  <SelectValue>{PARTY_ROLE_OPTIONS.find(([v]) => v === role)?.[1]}</SelectValue>
                </SelectTrigger>
                <SelectContent className={SELECT_POPUP}>
                  {PARTY_ROLE_OPTIONS.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Cell>
            {role === "service_provider" && (
              <Cell label="Service" span={6}>
                <Select value={serviceKind} onValueChange={(v) => v && setServiceKind(v)}>
                  <SelectTrigger className={SELECT_TRIGGER} aria-label="Service kind">
                    <SelectValue>
                      {SERVICE_KIND_OPTIONS.find(([v]) => v === serviceKind)?.[1]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className={SELECT_POPUP}>
                    {SERVICE_KIND_OPTIONS.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Cell>
            )}
            <Cell label="Contact name" span={6} htmlFor="party-contact">
              <Input
                id="party-contact"
                className="h-8"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
            </Cell>
            <Cell label="Payment terms (days)" span={6} htmlFor="party-terms">
              <Input
                id="party-terms"
                type="number"
                min={0}
                className="h-8"
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
              />
            </Cell>
            <Cell label="Phone" span={6} htmlFor="party-phone">
              <Input
                id="party-phone"
                className="h-8"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Cell>
            <Cell label="Email" span={6} htmlFor="party-email">
              <Input
                id="party-email"
                type="email"
                className="h-8"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Cell>
            <Cell label="Tax ID / VAT / RFC" span={6} htmlFor="party-tax">
              <Input
                id="party-tax"
                className="h-8"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
              />
            </Cell>
            <Cell label="EORI (EU consignees)" span={6} htmlFor="party-eori">
              <Input
                id="party-eori"
                className="h-8"
                value={eori}
                onChange={(e) => setEori(e.target.value)}
              />
            </Cell>
          </Grid>

          <div>
            <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
              Address
            </p>
            <Grid>
              <Cell label="Address" span={12} htmlFor="party-line1">
                <Input
                  id="party-line1"
                  className="h-8"
                  value={line1}
                  onChange={(e) => setLine1(e.target.value)}
                />
              </Cell>
              <Cell label="Address line 2" span={12} htmlFor="party-line2">
                <Input
                  id="party-line2"
                  className="h-8"
                  value={line2}
                  onChange={(e) => setLine2(e.target.value)}
                />
              </Cell>
              <Cell label="City" span={4} htmlFor="party-city">
                <Input
                  id="party-city"
                  className="h-8"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </Cell>
              <Cell label="State / province" span={4} htmlFor="party-state">
                <Input
                  id="party-state"
                  className="h-8"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                />
              </Cell>
              <Cell label="Postal code" span={4} htmlFor="party-zip">
                <Input
                  id="party-zip"
                  className="h-8"
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                />
              </Cell>
              <Cell label="Country" span={12} htmlFor="party-country">
                <Input
                  id="party-country"
                  className="h-8"
                  placeholder="China"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                />
              </Cell>
            </Grid>
          </div>
        </div>

        <SheetFooter className="flex-row items-center justify-end gap-2 border-t p-6">
          <Button variant="outline" size="sm" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="blue" size="sm" onClick={save} disabled={pending}>
            {pending ? "Saving…" : party ? "Save changes" : "Create party"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
