"use client";

// =============================================================================
// DocumentSheet — export (or edit) one document
// =============================================================================
// Every field of the document, prefilled from the shipment and its
// transactions, plus the containers it covers. Everything here stays editable
// while the document is a DRAFT.
//
// Once issued, the sheet disables every input outside the allowlist and the
// container checkboxes. That list is imported from the same module the SQL
// trigger mirrors — two hand-maintained copies would drift, and the UI's copy
// would be the one that lied. The database is still the enforcement; this only
// avoids letting someone type into a field that will be refused on save.
//
// Money is NOT editable here. Line totals come from the transactions' contract
// weights and prices; an invoice whose total disagrees with the ledger is the
// failure this whole feature exists to prevent.
// =============================================================================

import { useState } from "react";
import { toast } from "sonner";

import { Cell, Grid } from "@/components/bank/chrome";
import {
  CoveredContainers,
  linesFromContainers,
} from "@/components/bank/export-shipments/detail/covered-containers";
import type {
  ShipmentDocumentRow,
  ShipmentGroupRow,
} from "@/components/bank/export-shipments/types";
import { Input } from "@/components/ui/input";
import {
  DocumentEditorLoading,
  DocumentEditorShell,
} from "@/components/bank/export-shipments/detail/document-editor-shell";
import { Textarea } from "@/components/ui/textarea";
import {
  GenericDocumentForm,
  hasGenericForm,
} from "@/components/bank/export-shipments/detail/generic-document-form";
import { SalesContractSheetForm } from "@/components/bank/export-shipments/detail/sales-contract-form";
import { isFieldEditable } from "@/lib/export-shipment/documents/editable";
import {
  isEditedOnShipment,
  mergeLiveIntoDraft,
} from "@/lib/export-shipment/documents/shared-fields";

import { sumInvoiceLines, roundKg, roundMoney } from "@/lib/export-shipment/documents/totals";
import type { InvoiceLine } from "@/lib/export-shipment/documents/types";
import {
  CommercialInvoiceSchema,
  DOC_TYPE_META,
  type CommercialInvoiceFields,
  type PartyBlock,
  type SalesContractFields,
  type ShipmentDocType,
} from "@/lib/export-shipment/documents/types";
import { ClientAPI } from "@/trpc/client";

const orNull = (v: string) => (v.trim() === "" ? null : v.trim());

const money = (n: number, currency: string) =>
  `${currency} ${roundMoney(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const kg = (n: number) =>
  roundKg(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function DocumentSheet({
  group,
  docType,
  document,
  onClose,
  onSaved,
}: {
  group: ShipmentGroupRow;
  docType: ShipmentDocType;
  /** Present when editing; absent when exporting a new one. */
  document?: ShipmentDocumentRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(document);
  const status = document?.status ?? "draft";
  const locked = (key: string) => !isFieldEditable(key, docType, status);

  // A new document prefills from the server; an existing one opens on what it
  // already says — a frozen payload must never be silently re-derived.
  //
  // Its CONTAINERS are the exception. A draft is not an artifact yet (the PDF
  // route re-renders drafts every time), so a seal number or weight typed on
  // the shipment page after the draft was saved has to show through here — the
  // drawer was still printing the snapshot. Issued and void documents keep
  // their frozen lines: that IS what the document says.
  const isDraftDoc = !isEdit || status === "draft";
  // Fetched fresh every time the editor opens — a cached derivation from an
  // earlier open would still show the ports as they were then. No refocus
  // refetch: the form is seeded once and must not be torn down mid-edit.
  const [openedAt] = useState(() => Date.now());
  const draftQuery = ClientAPI.exportShipments.documentDraft.useQuery(
    { groupId: group.id, docType },
    { enabled: isDraftDoc, staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: false },
  );
  const liveIsCurrent = draftQuery.dataUpdatedAt >= openedAt;

  // resin-depo: a DRAFT opens on its stored payload with every shipment-owned
  // key (booking, terms, HS code, ports, lines) replaced by the live value —
  // the shipment is the home of those facts. Issued documents stay frozen.
  const source = (
    document && isDraftDoc && draftQuery.data && liveIsCurrent
      ? mergeLiveIntoDraft(
          document.payload as Record<string, unknown>,
          draftQuery.data as Record<string, unknown>,
        )
      : (document?.payload ?? draftQuery.data)
  ) as CommercialInvoiceFields | undefined;
  // Live container rows for a draft; the payload's own for anything issued.
  const liveLines = (draftQuery.data as CommercialInvoiceFields | undefined)?.lines;
  const lines =
    (isDraftDoc && liveLines ? liveLines : source?.lines) ?? linesFromContainers(group.containers);

  // A draft must not mount its form on the stored payload while the live
  // derivation is still loading: form state is seeded once, and it would keep
  // the stale ports/vessel until the dialog is reopened.
  const waitingForLive = isDraftDoc && !liveIsCurrent && !draftQuery.isError;
  if (!source || waitingForLive) {
    return (
      <DocumentEditorLoading
        title={DOC_TYPE_META[docType].label}
        message={
          draftQuery.isError
            ? (draftQuery.error?.message ?? "Could not build this document.")
            : "Reading the shipment…"
        }
        onClose={onClose}
      />
    );
  }

  // Each document type gets its own form. The Commercial Invoice and Sales
  // Contract are bespoke — their layouts differ substantially. The other three
  // are scalar fields, a party block and a container picker, so they share a
  // spec-driven form rather than three near-copies that drift apart.
  if (hasGenericForm(docType)) {
    return (
      <GenericDocumentForm
        group={group}
        docType={docType}
        document={document}
        source={source as unknown as Record<string, unknown>}
        lines={lines}
        locked={locked}
        onClose={onClose}
        onSaved={onSaved}
      />
    );
  }

  if (docType === "sales_contract") {
    return (
      <SalesContractSheetForm
        group={group}
        document={document}
        source={source as unknown as SalesContractFields}
        containerLines={lines}
        locked={locked}
        onClose={onClose}
        onSaved={onSaved}
      />
    );
  }

  return (
    <DocumentSheetForm
      group={group}
      docType={docType}
      document={document}
      source={source}
      lines={lines}
      locked={locked}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

/**
 * Split out so the field state is initialised ONCE, from a payload that is
 * already loaded. Seeding `useState` from a query that arrives later would
 * silently keep the empty first render.
 */
function DocumentSheetForm({
  group,
  docType,
  lines: allLines,
  document,
  source,
  locked,
  onClose,
  onSaved,
}: {
  group: ShipmentGroupRow;
  docType: ShipmentDocType;
  document?: ShipmentDocumentRow;
  source: CommercialInvoiceFields;
  /** Container rows to show — live for a draft, the payload's when issued. */
  lines: InvoiceLine[];
  locked: (key: string) => boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(document);

  // --- header / references --------------------------------------------------
  const [invoiceDate, setInvoiceDate] = useState(source.invoiceDate ?? "");
  const [transactionDate, setTransactionDate] = useState(source.transactionDate ?? "");
  const [shippingDate, setShippingDate] = useState(source.shippingDate ?? "");
  const [paymentDue, setPaymentDue] = useState(source.paymentDue ?? "");
  const [paymentTerms, setPaymentTerms] = useState(source.paymentTerms ?? "");
  const [incoterms, setIncoterms] = useState(source.incoterms ?? "");
  const [customerReference, setCustomerReference] = useState(source.customerReference ?? "");
  const [carrierBookingNumber, setCarrierBookingNumber] = useState(
    source.carrierBookingNumber ?? "",
  );
  const [hblNumber, setHblNumber] = useState(source.hblNumber ?? "");

  // --- routing --------------------------------------------------------------
  const [portOfLoading, setPortOfLoading] = useState(source.portOfLoading ?? "");
  const [portOfDischarge, setPortOfDischarge] = useState(source.portOfDischarge ?? "");
  const [carrierName, setCarrierName] = useState(source.carrierName ?? "");
  const [vesselName, setVesselName] = useState(source.vesselName ?? "");
  const [voyageNumber, setVoyageNumber] = useState(source.voyageNumber ?? "");
  const [sailingOnOrAbout, setSailingOnOrAbout] = useState(source.sailingOnOrAbout ?? "");

  // --- goods ----------------------------------------------------------------
  const [descriptionOfGoods, setDescriptionOfGoods] = useState(source.descriptionOfGoods ?? "");
  const [packaging, setPackaging] = useState(source.packaging ?? "");
  const [commodityCode, setCommodityCode] = useState(source.commodityCode ?? "");
  const [countryOfOrigin, setCountryOfOrigin] = useState(source.countryOfOrigin ?? "");
  const [marksAndNumbers, setMarksAndNumbers] = useState(source.marksAndNumbers ?? "");

  // --- parties --------------------------------------------------------------
  const [consignee, setConsignee] = useState<PartyBlock>(source.consignee);
  const [notifyParty, setNotifyParty] = useState<PartyBlock>(source.notifyParty);

  // --- coverage -------------------------------------------------------------
  const [coveredIds, setCoveredIds] = useState<Set<string>>(
    () => new Set(isEdit && document ? document.containerIds : allLines.map((l) => l.containerId)),
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
  const isLockedKey = (key: string) =>
    isEditedOnShipment(key) ||
    (live.status === "draft" ? locked(key) : !isFieldEditable(key, docType, live.status));

  const create = ClientAPI.exportShipments.createDocument.useMutation();
  const update = ClientAPI.exportShipments.updateDocument.useMutation();
  const issue = ClientAPI.exportShipments.issueDocument.useMutation();
  const pending = create.isPending || update.isPending || issue.isPending;

  // Lines follow the checkbox list; money is derived, never typed.
  const lines = allLines.filter((l) => coveredIds.has(l.containerId));
  const totals = sumInvoiceLines(lines);

  const toggle = (containerId: string) =>
    setCoveredIds((prev) => {
      const next = new Set(prev);
      if (next.has(containerId)) next.delete(containerId);
      else next.add(containerId);
      return next;
    });

  const buildPayload = (): CommercialInvoiceFields => ({
    ...source,
    documentNumber: live.number ?? source.documentNumber,
    invoiceDate,
    transactionDate: orNull(transactionDate),
    shippingDate: orNull(shippingDate),
    paymentDue: orNull(paymentDue),
    paymentTerms: orNull(paymentTerms),
    incoterms: orNull(incoterms),
    customerReference: orNull(customerReference),
    carrierBookingNumber: orNull(carrierBookingNumber),
    hblNumber: orNull(hblNumber),
    portOfLoading: orNull(portOfLoading),
    portOfDischarge: orNull(portOfDischarge),
    carrierName: orNull(carrierName),
    vesselName: orNull(vesselName),
    voyageNumber: orNull(voyageNumber),
    sailingOnOrAbout: orNull(sailingOnOrAbout),
    descriptionOfGoods: descriptionOfGoods.trim() || "—",
    packaging: orNull(packaging),
    commodityCode: orNull(commodityCode),
    countryOfOrigin: orNull(countryOfOrigin),
    marksAndNumbers: orNull(marksAndNumbers),
    consignee,
    notifyParty,
    lines,
    fobTotal: totals.fobTotal,
    freightTotal: totals.freightTotal,
    totalValue: totals.totalValue,
  });

  const save = async (thenIssue: boolean) => {
    if (!coveredIds.size) {
      toast.error("A document has to cover at least one container.");
      return;
    }

    const payload = buildPayload();
    const parsed = CommercialInvoiceSchema.safeParse(payload);
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
          docType,
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
        toast.success("Document issued");
      } else if (live.id) {
        toast.success("Draft saved");
      }
      setPreviewVersion((v) => v + 1);
      onSaved();
    } catch {
      // The global mutation cache already surfaced the message.
    }
  };

  /** An input that greys itself out when its key is frozen. */
  const field = (
    key: keyof CommercialInvoiceFields,
    label: string,
    value: string,
    onChange: (v: string) => void,
    opts: { span?: 2 | 3 | 4 | 6 | 8 | 12; type?: string } = {},
  ) => {
    const isLocked = isLockedKey(key);
    const id = `doc-${key}`;
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

  const partyFields = (
    key: "consignee" | "notifyParty",
    label: string,
    party: PartyBlock,
    setParty: (p: PartyBlock) => void,
  ) => {
    const isLocked = isLockedKey(key);
    const set = (k: keyof PartyBlock) => (v: string) => setParty({ ...party, [k]: v || null });
    return (
      <Grid className="col-span-12">
        <Cell label={label} span={12} htmlFor={`${key}-name`}>
          <Input
            id={`${key}-name`}
            className="h-8"
            value={party.name}
            disabled={isLocked}
            onChange={(e) => setParty({ ...party, name: e.target.value })}
          />
        </Cell>
        <Cell label="Address" span={6} htmlFor={`${key}-address`}>
          <Input
            id={`${key}-address`}
            className="h-8"
            value={party.address ?? ""}
            disabled={isLocked}
            onChange={(e) => set("address")(e.target.value)}
          />
        </Cell>
        <Cell label="Address line 2" span={6} htmlFor={`${key}-address2`}>
          <Input
            id={`${key}-address2`}
            className="h-8"
            value={party.address2 ?? ""}
            disabled={isLocked}
            onChange={(e) => set("address2")(e.target.value)}
          />
        </Cell>
        <Cell label="City" span={3} htmlFor={`${key}-city`}>
          <Input
            id={`${key}-city`}
            className="h-8"
            value={party.city ?? ""}
            disabled={isLocked}
            onChange={(e) => set("city")(e.target.value)}
          />
        </Cell>
        <Cell label="State" span={2} htmlFor={`${key}-state`}>
          <Input
            id={`${key}-state`}
            className="h-8"
            value={party.state ?? ""}
            disabled={isLocked}
            onChange={(e) => set("state")(e.target.value)}
          />
        </Cell>
        <Cell label="ZIP" span={2} htmlFor={`${key}-zip`}>
          <Input
            id={`${key}-zip`}
            className="h-8"
            value={party.zip ?? ""}
            disabled={isLocked}
            onChange={(e) => set("zip")(e.target.value)}
          />
        </Cell>
        <Cell label="Country" span={3} htmlFor={`${key}-country`}>
          <Input
            id={`${key}-country`}
            className="h-8"
            value={party.country ?? ""}
            disabled={isLocked}
            onChange={(e) => set("country")(e.target.value)}
          />
        </Cell>
        <Cell label="Tax ID" span={4} htmlFor={`${key}-tax`}>
          <Input
            id={`${key}-tax`}
            className="h-8"
            value={party.taxId ?? ""}
            disabled={isLocked}
            onChange={(e) => set("taxId")(e.target.value)}
          />
        </Cell>
        <Cell label="Contact" span={4} htmlFor={`${key}-contact`}>
          <Input
            id={`${key}-contact`}
            className="h-8"
            value={party.contactName ?? ""}
            disabled={isLocked}
            onChange={(e) => set("contactName")(e.target.value)}
          />
        </Cell>
        <Cell label="Email" span={4} htmlFor={`${key}-email`}>
          <Input
            id={`${key}-email`}
            className="h-8"
            value={party.email ?? ""}
            disabled={isLocked}
            onChange={(e) => set("email")(e.target.value)}
          />
        </Cell>
      </Grid>
    );
  };

  const currency = source.currency;

  return (
    <DocumentEditorShell
      title={`${DOC_TYPE_META[docType].label}${live.number ? ` · ${live.number}` : ""}`}
      description={
        live.status !== "draft"
          ? "This document has been issued. Only the reference fields left open stay editable — correcting anything else means voiding it and exporting the next revision."
          : "Prefilled from this booking and its transactions. Every field is editable; the money follows the containers you cover."
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
        <FormSection title="Header & references">
          <Grid>
            {field("invoiceDate", "Invoice date", invoiceDate, setInvoiceDate, { type: "date" })}
            {field("transactionDate", "Transaction date", transactionDate, setTransactionDate, {
              type: "date",
            })}
            {field("shippingDate", "Shipping date", shippingDate, setShippingDate, {
              type: "date",
            })}
            {field("paymentTerms", "Payment terms", paymentTerms, setPaymentTerms, { span: 6 })}
            {/* A real date: derivePaymentDue() already emits YYYY-MM-DD, and the
                  PDF prints it beside Invoice Date, so the picker matches both. */}
            {field("paymentDue", "Payment due", paymentDue, setPaymentDue, {
              span: 3,
              type: "date",
            })}
            {field("incoterms", "Incoterms", incoterms, setIncoterms, { span: 3 })}
            {field("customerReference", "Customer ref #", customerReference, setCustomerReference)}
            {field(
              "carrierBookingNumber",
              "Carrier booking #",
              carrierBookingNumber,
              setCarrierBookingNumber,
            )}
            {field("hblNumber", "HBL #", hblNumber, setHblNumber)}
          </Grid>
        </FormSection>

        <FormSection title="Routing">
          <Grid>
            {field("portOfLoading", "Port of loading", portOfLoading, setPortOfLoading, {
              span: 6,
            })}
            {field("portOfDischarge", "Port of discharge", portOfDischarge, setPortOfDischarge, {
              span: 6,
            })}
            {field("carrierName", "Carrier", carrierName, setCarrierName)}
            {field("vesselName", "Vessel", vesselName, setVesselName)}
            {field("voyageNumber", "Voyage #", voyageNumber, setVoyageNumber)}
            {field("sailingOnOrAbout", "Sailing on/about", sailingOnOrAbout, setSailingOnOrAbout, {
              type: "date",
              span: 4,
            })}
          </Grid>
        </FormSection>

        <FormSection title="Goods">
          <Grid>
            {field("descriptionOfGoods", "Description", descriptionOfGoods, setDescriptionOfGoods, {
              span: 12,
            })}
            {field("packaging", "Packaging", packaging, setPackaging)}
            {field("commodityCode", "HS / commodity code", commodityCode, setCommodityCode)}
            {field("countryOfOrigin", "Country of origin", countryOfOrigin, setCountryOfOrigin)}
            <Cell label="Marks &amp; numbers" span={12} htmlFor="doc-marks">
              <Textarea
                id="doc-marks"
                rows={2}
                value={marksAndNumbers}
                disabled={isLockedKey("marksAndNumbers")}
                onChange={(e) => setMarksAndNumbers(e.target.value)}
              />
            </Cell>
          </Grid>
        </FormSection>

        <FormSection title="Shipper">
          <Grid>
            <Cell label="Beneficiary / Shipper" span={12}>
              <div className="text-muted-foreground flex h-8 items-center text-sm">
                {source.shipper.name}
                <span className="ml-2 text-xs">from the exchange organization</span>
              </div>
            </Cell>
          </Grid>
        </FormSection>

        <FormSection title="Consignee">
          {partyFields("consignee", "Name", consignee, setConsignee)}
        </FormSection>
        <FormSection title="Notify party">
          {partyFields("notifyParty", "Name", notifyParty, setNotifyParty)}
        </FormSection>

        <FormSection title={`Containers covered — ${coveredIds.size} of ${allLines.length}`}>
          <CoveredContainers
            lines={allLines}
            covered={coveredIds}
            onToggle={toggle}
            disabled={isLockedKey("lines")}
          />
        </FormSection>

        {/* Money is derived from the covered containers' CONTRACT weights, so
              it moves with the checkboxes above and is never typed. */}
        <FormSection title="Totals">
          <Grid>
            <Cell label="Net weight" span={3}>
              <ReadOut>{kg(totals.netWeightKg)} kg</ReadOut>
            </Cell>
            <Cell label="Gross weight" span={3}>
              <ReadOut>{kg(totals.grossWeightKg)} kg</ReadOut>
            </Cell>
            <Cell label="FOB" span={3}>
              <ReadOut>{money(totals.fobTotal, currency)}</ReadOut>
            </Cell>
            <Cell label="Freight" span={3}>
              <ReadOut>{money(totals.freightTotal, currency)}</ReadOut>
            </Cell>
            <Cell label="Total value" span={12}>
              <div className="flex h-8 items-center text-sm font-semibold tabular-nums">
                {money(totals.totalValue, currency)}
              </div>
            </Cell>
          </Grid>
        </FormSection>
      </>
    </DocumentEditorShell>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        {title}
      </h3>
      {children}
    </div>
  );
}

function ReadOut({ children }: { children: React.ReactNode }) {
  return <div className="flex h-8 items-center text-sm tabular-nums">{children}</div>;
}
