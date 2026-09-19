"use client";

// =============================================================================
// Company & Bank — the exporter (organizations.role = 'exchange') + remittance
// =============================================================================
// Documents cannot be drafted until this exists: buildDraftPayload in the
// export router reads the exchange org as the seller/shipper and its default
// bank account (per currency) for the wire block on the Commercial Invoice and
// Sales Contract. The letterhead itself is a constant in the PDF templates;
// what is entered here is the party block (name, tax ID, address, contact).
// =============================================================================

import { useEffect, useState } from "react";
import { Building, Landmark, Plus, Star } from "lucide-react";
import { toast } from "sonner";

import { Cell, Grid, Section, UpdateButton } from "@/components/bank/chrome";
import { Button } from "@/components/ui/button";
import { DataGrid, type DataGridColumn } from "@/components/ui/data-grid";
import { Input } from "@/components/ui/input";
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

type Company = NonNullable<inferRouterOutputs<AppRouter>["reference"]["company"]["get"]>;
type BankRow = inferRouterOutputs<AppRouter>["reference"]["bankAccounts"]["list"][number];

function CompanyCard({ company, onSaved }: { company: Company | null; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: "",
    contactName: "",
    phone: "",
    email: "",
    taxId: "",
    eori: "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    zip: "",
    country: "",
  });
  useEffect(() => {
    // Sync the form with the server row when it (re)loads.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm({
      name: company?.name ?? "The Plastics Exchange",
      contactName: company?.contact_name ?? "",
      phone: company?.phone ?? "",
      email: company?.email ?? "",
      taxId: company?.tax_id ?? "",
      eori: company?.eori ?? "",
      line1: company?.address?.addressLine1 ?? "",
      line2: company?.address?.addressLine2 ?? "",
      city: company?.address?.city ?? "",
      state: company?.address?.state ?? "",
      zip: company?.address?.zip ?? "",
      country: company?.address?.country ?? "",
    });
  }, [company]);
  const upsert = ClientAPI.reference.company.upsert.useMutation();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    if (!form.name.trim()) {
      toast.error("Company name is required.");
      return;
    }
    try {
      await upsert.mutateAsync({
        name: form.name.trim(),
        contactName: form.contactName,
        phone: form.phone,
        email: form.email,
        taxId: form.taxId,
        eori: form.eori,
        address: {
          line1: form.line1,
          line2: form.line2,
          city: form.city,
          state: form.state,
          zip: form.zip,
          country: form.country,
        },
      });
      toast.success("Company saved");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the company.");
    }
  }

  return (
    <Section
      title="Company"
      subtitle="Exporter / seller party block on every document"
      icon={Building}
      actions={<UpdateButton pending={upsert.isPending} onClick={save} />}
    >
      {!company && (
        <p className="text-tpe-gold-ink text-xs font-medium">
          Not set up yet — documents cannot be drafted until the company is saved.
        </p>
      )}
      <Grid>
        <Cell label="Legal name" span={6} htmlFor="co-name">
          <Input id="co-name" className="h-8" value={form.name} onChange={set("name")} />
        </Cell>
        <Cell label="Tax ID (EIN)" span={3} htmlFor="co-tax">
          <Input id="co-tax" className="h-8" value={form.taxId} onChange={set("taxId")} />
        </Cell>
        <Cell label="EORI" span={3} htmlFor="co-eori">
          <Input id="co-eori" className="h-8" value={form.eori} onChange={set("eori")} />
        </Cell>
        <Cell label="Representative" span={4} htmlFor="co-contact">
          <Input
            id="co-contact"
            className="h-8"
            value={form.contactName}
            onChange={set("contactName")}
          />
        </Cell>
        <Cell label="Phone" span={4} htmlFor="co-phone">
          <Input id="co-phone" className="h-8" value={form.phone} onChange={set("phone")} />
        </Cell>
        <Cell label="Email" span={4} htmlFor="co-email">
          <Input id="co-email" className="h-8" value={form.email} onChange={set("email")} />
        </Cell>
        <Cell label="Address" span={6} htmlFor="co-line1">
          <Input id="co-line1" className="h-8" value={form.line1} onChange={set("line1")} />
        </Cell>
        <Cell label="Address line 2" span={6} htmlFor="co-line2">
          <Input id="co-line2" className="h-8" value={form.line2} onChange={set("line2")} />
        </Cell>
        <Cell label="City" span={3} htmlFor="co-city">
          <Input id="co-city" className="h-8" value={form.city} onChange={set("city")} />
        </Cell>
        <Cell label="State" span={3} htmlFor="co-state">
          <Input id="co-state" className="h-8" value={form.state} onChange={set("state")} />
        </Cell>
        <Cell label="Postal code" span={3} htmlFor="co-zip">
          <Input id="co-zip" className="h-8" value={form.zip} onChange={set("zip")} />
        </Cell>
        <Cell label="Country" span={3} htmlFor="co-country">
          <Input id="co-country" className="h-8" value={form.country} onChange={set("country")} />
        </Cell>
      </Grid>
    </Section>
  );
}

function BankSheet({
  account,
  onClose,
  onSaved,
}: {
  account?: BankRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    label: account?.label ?? "",
    beneficiaryName: account?.beneficiary_name ?? "",
    bankName: account?.bank_name ?? "",
    bankAddress: account?.bank_address ?? "",
    swiftCode: account?.swift_code ?? "",
    accountNumber: account?.account_number ?? "",
    abaRouting: account?.aba_routing ?? "",
    iban: account?.iban ?? "",
    currency: account?.currency ?? "USD",
    isDefault: account?.is_default ?? true,
  });
  const create = ClientAPI.reference.bankAccounts.create.useMutation();
  const update = ClientAPI.reference.bankAccounts.update.useMutation();
  const remove = ClientAPI.reference.bankAccounts.remove.useMutation();
  const pending = create.isPending || update.isPending || remove.isPending;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    if (!form.beneficiaryName.trim() || !form.bankName.trim()) {
      toast.error("Beneficiary and bank name are required.");
      return;
    }
    try {
      if (account) await update.mutateAsync({ id: account.id, ...form });
      else await create.mutateAsync(form);
      toast.success(account ? "Bank account updated" : "Bank account added");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the bank account.");
    }
  }

  async function del() {
    if (!account || !window.confirm("Remove this bank account?")) return;
    try {
      await remove.mutateAsync({ id: account.id });
      toast.success("Bank account removed");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove the bank account.");
    }
  }

  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="p-6 pb-4">
          <SheetTitle className="text-base">
            {account ? "Edit bank account" : "New bank account"}
          </SheetTitle>
          <SheetDescription>
            Wire instructions printed on the Commercial Invoice and Sales Contract. The default
            account for the shipment&apos;s currency is used.
          </SheetDescription>
        </SheetHeader>
        <div className="px-6 pb-6">
          <Grid>
            <Cell label="Label" span={8} htmlFor="bank-label">
              <Input
                id="bank-label"
                className="h-8"
                placeholder="Primary USD"
                value={form.label}
                onChange={set("label")}
              />
            </Cell>
            <Cell label="Currency" span={4} htmlFor="bank-currency">
              <Input
                id="bank-currency"
                className="h-8 font-mono uppercase"
                maxLength={3}
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
              />
            </Cell>
            <Cell label="Beneficiary name" span={12} htmlFor="bank-beneficiary">
              <Input
                id="bank-beneficiary"
                className="h-8"
                value={form.beneficiaryName}
                onChange={set("beneficiaryName")}
              />
            </Cell>
            <Cell label="Bank name" span={12} htmlFor="bank-name">
              <Input
                id="bank-name"
                className="h-8"
                value={form.bankName}
                onChange={set("bankName")}
              />
            </Cell>
            <Cell label="Bank address" span={12} htmlFor="bank-address">
              <Input
                id="bank-address"
                className="h-8"
                value={form.bankAddress}
                onChange={set("bankAddress")}
              />
            </Cell>
            <Cell label="SWIFT / BIC" span={6} htmlFor="bank-swift">
              <Input
                id="bank-swift"
                className="h-8 font-mono"
                value={form.swiftCode}
                onChange={set("swiftCode")}
              />
            </Cell>
            <Cell label="ABA routing" span={6} htmlFor="bank-aba">
              <Input
                id="bank-aba"
                className="h-8 font-mono"
                value={form.abaRouting}
                onChange={set("abaRouting")}
              />
            </Cell>
            <Cell label="Account number" span={6} htmlFor="bank-account">
              <Input
                id="bank-account"
                className="h-8 font-mono"
                value={form.accountNumber}
                onChange={set("accountNumber")}
              />
            </Cell>
            <Cell label="IBAN" span={6} htmlFor="bank-iban">
              <Input
                id="bank-iban"
                className="h-8 font-mono"
                value={form.iban}
                onChange={set("iban")}
              />
            </Cell>
            <Cell label="Default" span={12}>
              <label className="flex h-8 items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={form.isDefault}
                  onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
                />
                Default account for {form.currency || "this currency"}
              </label>
            </Cell>
          </Grid>
        </div>
        <SheetFooter className="flex-row items-center justify-between gap-2 border-t p-6">
          <div>
            {account && (
              <Button variant="destructive" size="sm" onClick={del} disabled={pending}>
                Remove
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button variant="blue" size="sm" onClick={save} disabled={pending}>
              {pending ? "Saving…" : account ? "Save changes" : "Add account"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function CompanyAndBank() {
  const company = ClientAPI.reference.company.get.useQuery();
  const banks = ClientAPI.reference.bankAccounts.list.useQuery();
  const utils = ClientAPI.useUtils();
  const [sheet, setSheet] = useState<{ mode: "new" } | { mode: "edit"; row: BankRow } | null>(null);

  const columns: DataGridColumn<BankRow>[] = [
    {
      key: "label",
      header: "Account",
      cell: (r) => (
        <button
          type="button"
          className="text-table-link flex items-center gap-1 font-medium hover:underline"
          onClick={() => setSheet({ mode: "edit", row: r })}
        >
          {r.is_default && <Star className="text-table-gold size-3 fill-current" />}
          {r.label ?? r.bank_name}
        </button>
      ),
      accessor: (r) => r.label ?? r.bank_name,
    },
    { key: "currency", header: "Currency", accessor: (r) => r.currency },
    { key: "beneficiary_name", header: "Beneficiary", accessor: (r) => r.beneficiary_name },
    { key: "bank_name", header: "Bank", accessor: (r) => r.bank_name },
    {
      key: "swift_code",
      header: "SWIFT",
      cellClassName: "font-mono",
      accessor: (r) => r.swift_code ?? "",
    },
    {
      key: "account_number",
      header: "Account #",
      cellClassName: "font-mono",
      accessor: (r) => r.account_number ?? "",
    },
  ];

  const refresh = () => {
    void utils.reference.company.invalidate();
    void utils.reference.bankAccounts.invalidate();
    setSheet(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <CompanyCard company={company.data ?? null} onSaved={refresh} />
      <Section
        title="Bank accounts"
        subtitle="Remittance instructions for the wire block"
        icon={Landmark}
        actions={
          <Button
            variant="gold"
            size="sm"
            onClick={() => setSheet({ mode: "new" })}
            disabled={!company.data}
          >
            <Plus /> New account
          </Button>
        }
      >
        <DataGrid
          label="Bank accounts"
          columns={columns}
          rows={banks.data ?? []}
          rowKey={(r) => r.id}
          emptyMessage={
            banks.isLoading
              ? "Loading…"
              : company.data
                ? "No bank accounts yet."
                : "Save the company first."
          }
        />
      </Section>
      {sheet?.mode === "new" && <BankSheet onClose={() => setSheet(null)} onSaved={refresh} />}
      {sheet?.mode === "edit" && (
        <BankSheet account={sheet.row} onClose={() => setSheet(null)} onSaved={refresh} />
      )}
    </div>
  );
}
