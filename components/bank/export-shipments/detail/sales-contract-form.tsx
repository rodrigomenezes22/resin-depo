"use client";

// =============================================================================
// SalesContractForm — the Sales Contract's half of the export sheet
// =============================================================================
// A sibling of the Commercial Invoice form rather than a branch inside it: the
// two documents share a shell (header, container picker, footer) but almost no
// fields, and interleaving them behind conditionals would make both harder to
// read than either is alone.
//
// What it does NOT let you edit is as deliberate as what it does. The commodity
// rows, quantities and amounts are derived from the covered containers'
// contract weights and prices — the same numbers the Commercial Invoice bills
// on. Typing a different quantity here would produce a contract that disagrees
// with the invoice raised against it, which is the failure this whole feature
// exists to prevent. Change the coverage, or change the deal.
// =============================================================================

import { useState } from "react";
import { toast } from "sonner";

import { Cell, Grid } from "@/components/bank/chrome";
import { CoveredContainers } from "@/components/bank/export-shipments/detail/covered-containers";
import { PartyFields } from "@/components/bank/export-shipments/detail/party-fields";
import type {
  ShipmentDocumentRow,
  ShipmentGroupRow,
} from "@/components/bank/export-shipments/types";
import { Input } from "@/components/ui/input";
import { DocumentEditorShell } from "@/components/bank/export-shipments/detail/document-editor-shell";
import { isFieldEditable } from "@/lib/export-shipment/documents/editable";
import { isEditedOnShipment } from "@/lib/export-shipment/documents/shared-fields";
import { Textarea } from "@/components/ui/textarea";
import { roundMoney, roundMt } from "@/lib/export-shipment/documents/totals";
import {
  SalesContractSchema,
  type InvoiceLine,
  type PartyBlock,
  type SalesContractFields,
} from "@/lib/export-shipment/documents/types";
import { ClientAPI } from "@/trpc/client";

const orNull = (v: string) => (v.trim() === "" ? null : v.trim());

const mt = (n: number) =>
  roundMt(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n: number, currency: string) =>
  `${currency} ${roundMoney(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface SalesContractFormState {
  values: SalesContractFields;
  setters: {
    setContractDate: (v: string) => void;
    setPacking: (v: string) => void;
    setRemarks: (v: string) => void;
    setPortOfLoading: (v: string) => void;
    setPortOfDischarge: (v: string) => void;
    setInsurance: (v: string) => void;
    setShipmentWindow: (v: string) => void;
    setPaymentTerms: (v: string) => void;
    setTolerance: (v: string) => void;
    setBuyer: (p: PartyBlock) => void;
  };
}

/**
 * Holds the contract's editable state. Returned to the shell so it owns saving
 * — the same split the Commercial Invoice form uses.
 */
export function useSalesContractForm(source: SalesContractFields): SalesContractFormState {
  const [contractDate, setContractDate] = useState(source.contractDate ?? "");
  const [packing, setPacking] = useState(source.packing ?? "");
  const [remarks, setRemarks] = useState(source.remarks ?? "");
  const [portOfLoading, setPortOfLoading] = useState(source.portOfLoading ?? "");
  const [portOfDischarge, setPortOfDischarge] = useState(source.portOfDischarge ?? "");
  const [insurance, setInsurance] = useState(source.insurance ?? "");
  const [shipmentWindow, setShipmentWindow] = useState(source.shipmentWindow ?? "");
  const [paymentTerms, setPaymentTerms] = useState(source.paymentTerms ?? "");
  const [tolerance, setTolerance] = useState(String(source.tolerancePct ?? 5));
  const [buyer, setBuyer] = useState<PartyBlock>(source.buyer);

  return {
    values: {
      ...source,
      contractDate,
      packing: orNull(packing),
      remarks: orNull(remarks),
      portOfLoading: orNull(portOfLoading),
      portOfDischarge: orNull(portOfDischarge),
      insurance: orNull(insurance),
      shipmentWindow: orNull(shipmentWindow),
      paymentTerms: orNull(paymentTerms),
      tolerancePct: Number(tolerance) || 0,
      buyer,
    },
    setters: {
      setContractDate,
      setPacking,
      setRemarks,
      setPortOfLoading,
      setPortOfDischarge,
      setInsurance,
      setShipmentWindow,
      setPaymentTerms,
      setTolerance,
      setBuyer,
    },
  };
}

export function SalesContractFields_({
  state,
  locked,
}: {
  state: SalesContractFormState;
  locked: (key: string) => boolean;
}) {
  const { values: v, setters: s } = state;

  const field = (
    key: keyof SalesContractFields,
    label: string,
    value: string,
    onChange: (next: string) => void,
    opts: { span?: 2 | 3 | 4 | 6 | 8 | 12; type?: string } = {},
  ) => {
    const isLocked = locked(key);
    const id = `sc-${key}`;
    return (
      <Cell label={label} span={opts.span ?? 4} htmlFor={id}>
        <Input
          id={id}
          type={opts.type}
          className="h-8"
          value={value}
          disabled={isLocked}
          title={
            isEditedOnShipment(key)
              ? "Shipment data — edit it on the Booking or Purchase card; every document follows"
              : isLocked
                ? "Frozen once the document is issued"
                : undefined
          }
          onChange={(e) => onChange(e.target.value)}
        />
      </Cell>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <Section title="Contract">
        <Grid>
          {field("contractDate", "Contract date", v.contractDate, s.setContractDate, {
            type: "date",
          })}
          {field("paymentTerms", "Payment term", v.paymentTerms ?? "", s.setPaymentTerms, {
            span: 8,
          })}
          {field("portOfLoading", "Port of loading", v.portOfLoading ?? "", s.setPortOfLoading, {
            span: 6,
          })}
          {field(
            "portOfDischarge",
            "Port of discharge",
            v.portOfDischarge ?? "",
            s.setPortOfDischarge,
            { span: 6 },
          )}
          {field("insurance", "Insurance", v.insurance ?? "", s.setInsurance)}
          {field("shipmentWindow", "Shipment window", v.shipmentWindow ?? "", s.setShipmentWindow)}
          {field("tolerancePct", "Tolerance %", String(v.tolerancePct), s.setTolerance, {
            type: "number",
          })}
        </Grid>
      </Section>

      <Section title="Seller">
        <Grid>
          <Cell label="The SELLER" span={12}>
            <div className="text-muted-foreground flex h-8 items-center text-sm">
              {v.seller.name}
              <span className="ml-2 text-xs">from the exchange organization</span>
            </div>
          </Cell>
        </Grid>
      </Section>

      <Section title="Buyer">
        <PartyFields
          fieldKey="buyer"
          party={v.buyer}
          setParty={s.setBuyer}
          locked={locked("buyer")}
        />
      </Section>

      <Section title="Packing & remarks">
        <Grid>
          <Cell label="Packing" span={12} htmlFor="sc-packing">
            <Input
              id="sc-packing"
              className="h-8"
              value={v.packing ?? ""}
              disabled={locked("packing")}
              onChange={(e) => s.setPacking(e.target.value)}
            />
          </Cell>
          <Cell label="Remarks" span={12} htmlFor="sc-remarks">
            <Textarea
              id="sc-remarks"
              rows={2}
              value={v.remarks ?? ""}
              disabled={locked("remarks")}
              onChange={(e) => s.setRemarks(e.target.value)}
            />
          </Cell>
        </Grid>
      </Section>

      {/* Derived, not editable — see the note at the top of this file. */}
      <Section title="Commodity">
        <div className="flex flex-col gap-1">
          {v.lines.map((line, i) => (
            <div key={i} className="flex items-center gap-3 rounded px-1 py-1 text-sm">
              <span className="flex-1">{line.description}</span>
              <span className="w-24 text-right tabular-nums">{mt(line.quantityMt)} MT</span>
              <span className="text-muted-foreground w-28 text-right tabular-nums">
                {money(line.unitPricePerMt, v.currency)}/MT
              </span>
              <span className="w-32 text-right tabular-nums">{money(line.amount, v.currency)}</span>
            </div>
          ))}
          <div className="mt-1 flex items-center gap-3 border-t px-1 pt-2 text-sm font-semibold">
            <span className="flex-1">Total</span>
            <span className="w-24 text-right tabular-nums">{mt(v.totalQuantityMt)} MT</span>
            <span className="w-28" />
            <span className="w-32 text-right tabular-nums">{money(v.totalAmount, v.currency)}</span>
          </div>
        </div>
      </Section>

      {v.bank ? (
        <Section title="Payment to be made to">
          <Grid>
            <Cell label="Beneficiary" span={6}>
              <ReadOut>{v.bank.beneficiaryName}</ReadOut>
            </Cell>
            <Cell label="Bank" span={6}>
              <ReadOut>{v.bank.bankName}</ReadOut>
            </Cell>
            <Cell label="SWIFT" span={4}>
              <ReadOut>{v.bank.swiftCode ?? "—"}</ReadOut>
            </Cell>
            <Cell label="Account" span={4}>
              <ReadOut>{v.bank.accountNumber ?? "—"}</ReadOut>
            </Cell>
            <Cell label="ABA" span={4}>
              <ReadOut>{v.bank.abaRouting ?? "—"}</ReadOut>
            </Cell>
          </Grid>
        </Section>
      ) : (
        <p className="text-muted-foreground text-xs">
          No default bank account on file for this currency — the contract will print without a wire
          block. Add one under the exchange organization.
        </p>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        {title}
      </h3>
      {children}
    </div>
  );
}

// ===========================================================================
// The sheet
// ===========================================================================
// Same shell as the Commercial Invoice's — container coverage, footer,
// save/issue — with the contract's own fields.

export function SalesContractSheetForm({
  group,
  document,
  source,
  containerLines,
  locked,
  onClose,
  onSaved,
}: {
  group: ShipmentGroupRow;
  document?: ShipmentDocumentRow;
  source: SalesContractFields;
  /** Per-container rows for the picker (the contract's own lines are grouped). */
  containerLines: InvoiceLine[];
  locked: (key: string) => boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(document);
  const form = useSalesContractForm(source);

  const [coveredIds, setCoveredIds] = useState<Set<string>>(
    () =>
      new Set(
        isEdit && document ? document.containerIds : source.lines.flatMap((l) => l.containerIds),
      ),
  );

  // The saved row this dialog is editing: null id until the first save; status
  // flips to issued in place so the fields lock without reopening. Bumping the
  // preview version reloads the PDF pane — only ever after a successful save.
  const [live, setLive] = useState<{
    id: string | null;
    number: string | null;
    status: "draft" | "issued" | "superseded" | "void";
  }>({
    id: document?.id ?? null,
    number: document?.document_number ?? null,
    status: (document?.status ?? "draft") as "draft" | "issued" | "superseded" | "void",
  });
  const [previewVersion, setPreviewVersion] = useState(0);
  const isLocked = (key: string) =>
    isEditedOnShipment(key) ||
    (live.status === "draft" ? locked(key) : !isFieldEditable(key, "sales_contract", live.status));

  const create = ClientAPI.exportShipments.createDocument.useMutation();
  const update = ClientAPI.exportShipments.updateDocument.useMutation();
  const issue = ClientAPI.exportShipments.issueDocument.useMutation();
  const pending = create.isPending || update.isPending || issue.isPending;

  const toggle = (containerId: string) =>
    setCoveredIds((prev) => {
      const next = new Set(prev);
      if (next.has(containerId)) next.delete(containerId);
      else next.add(containerId);
      return next;
    });

  // Coverage drives the commodity rows: drop a container and its share leaves
  // both the row and the total, exactly as it leaves the invoice.
  const lines = source.lines
    .map((l) => {
      const kept = l.containerIds.filter((id) => coveredIds.has(id));
      if (!kept.length) return null;
      const share = kept.length / l.containerIds.length;
      return {
        ...l,
        containerIds: kept,
        quantityMt: l.quantityMt * share,
        amount: l.amount * share,
      };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);

  const values: SalesContractFields = {
    ...form.values,
    documentNumber: document?.document_number ?? source.documentNumber,
    lines,
    totalQuantityMt: lines.reduce((a, l) => a + l.quantityMt, 0),
    totalAmount: lines.reduce((a, l) => a + l.amount, 0),
  };

  const save = async (thenIssue: boolean) => {
    if (!coveredIds.size) {
      toast.error("A contract has to cover at least one container.");
      return;
    }
    const parsed = SalesContractSchema.safeParse(values);
    if (!parsed.success) {
      toast.error(
        `Missing: ${parsed.error.issues
          .map((i) => i.path.join("."))
          .slice(0, 3)
          .join(", ")}`,
      );
      return;
    }

    try {
      let id = live.id;
      if (id) {
        await update.mutateAsync({
          id,
          payload: parsed.data as unknown as Record<string, unknown>,
          // Coverage is frozen at issue — sending it would be refused.
          ...(live.status === "draft" ? { containerIds: [...coveredIds] } : {}),
        });
      } else {
        const created = await create.mutateAsync({
          groupId: group.id,
          docType: "sales_contract",
          containerIds: [...coveredIds],
          payload: parsed.data as unknown as Record<string, unknown>,
        });
        id = created.id;
        setLive((l) => ({ ...l, id: created.id, number: created.documentNumber }));
        toast.success(`${created.documentNumber} saved as a draft`);
      }
      if (thenIssue && id) {
        await issue.mutateAsync({ id });
        setLive((l) => ({ ...l, status: "issued" }));
        toast.success("Contract issued");
      } else if (live.id) {
        toast.success("Draft saved");
      }
      setPreviewVersion((v) => v + 1);
      onSaved();
    } catch {
      // The global mutation cache already surfaced the message.
    }
  };

  const allContainerIds = source.lines.flatMap((l) => l.containerIds);
  // The contract's own lines are GROUPED (one per product/price, many boxes);
  // the picker still lists boxes, so it reads the per-container rows the sheet
  // resolved — live for a draft, frozen once issued.
  const pickerLines = containerLines.filter((l) => allContainerIds.includes(l.containerId));

  return (
    <DocumentEditorShell
      title={`Sales Contract${live.number ? ` · ${live.number}` : ""}`}
      description={
        live.status !== "draft"
          ? "This contract has been issued. Only the reference fields left open stay editable — correcting anything else means voiding it and exporting the next revision."
          : "Prefilled from this booking and its transactions. Quantities and amounts follow the containers you cover, so they always match the invoice raised against them."
      }
      status={live.status}
      documentId={live.id}
      previewVersion={previewVersion}
      pending={pending}
      onClose={onClose}
      onSaveDraft={() => void save(false)}
      onSaveAndIssue={() => void save(true)}
      onSave={() => void save(false)}
    >
      <>
        <SalesContractFields_ state={{ values, setters: form.setters }} locked={isLocked} />

        <Section title={`Containers covered — ${coveredIds.size} of ${allContainerIds.length}`}>
          <CoveredContainers
            lines={pickerLines}
            covered={coveredIds}
            onToggle={toggle}
            disabled={isLocked("lines")}
          />
        </Section>
      </>
    </DocumentEditorShell>
  );
}

function ReadOut({ children }: { children: React.ReactNode }) {
  return <div className="flex h-8 items-center text-sm tabular-nums">{children}</div>;
}
