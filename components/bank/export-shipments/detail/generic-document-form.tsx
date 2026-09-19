"use client";

// =============================================================================
// GenericDocumentForm — the Packing List, Proforma and Certificate of Origin
// =============================================================================
// The Commercial Invoice and Sales Contract have bespoke forms because their
// layouts differ substantially. These three do not: each is a set of scalar
// fields, one or two party blocks, and a container picker. Writing three more
// bespoke forms would triple the surface with no gain and let their disabled
// states, null handling and save paths drift apart.
//
// So they are described by a SPEC and rendered generically. Adding a field is a
// line in the spec, and every document gets the same behaviour for free.
//
// What is NOT in the spec is deliberate: quantities, weights, totals and lot
// numbers are derived from the covered containers and never typed. Change the
// coverage, or change the deal.
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
import { Textarea } from "@/components/ui/textarea";
import {
  DOC_TYPE_META,
  payloadSchemaFor,
  type InvoiceLine,
  type PartyBlock,
  type ShipmentDocType,
} from "@/lib/export-shipment/documents/types";
import { ClientAPI } from "@/trpc/client";

type Span = 2 | 3 | 4 | 6 | 8 | 12;

type FieldSpec =
  | { kind: "text" | "date" | "number"; key: string; label: string; span?: Span }
  | { kind: "textarea"; key: string; label: string }
  | { kind: "party"; key: string; label: string }
  | { kind: "readout"; key: string; label: string; span?: Span };

interface SectionSpec {
  title: string;
  fields: FieldSpec[];
}

/**
 * What each document lets you edit. Everything absent from a spec is still in
 * the payload and still printed — it is simply derived rather than typed.
 */
const SPECS: Partial<Record<ShipmentDocType, SectionSpec[]>> = {
  packing_list: [
    {
      title: "Header & references",
      fields: [
        { kind: "date", key: "invoiceDate", label: "Invoice date" },
        { kind: "date", key: "shippingDate", label: "Shipping date" },
        { kind: "text", key: "incoterms", label: "Incoterms" },
        { kind: "text", key: "paymentTerms", label: "Payment terms", span: 6 },
        { kind: "text", key: "customerReference", label: "Customer ref #", span: 3 },
        { kind: "text", key: "carrierBookingNumber", label: "Carrier booking #", span: 3 },
      ],
    },
    { title: "Bill to", fields: [{ kind: "party", key: "billTo", label: "Name" }] },
    {
      title: "Goods",
      fields: [
        { kind: "text", key: "descriptionOfGoods", label: "Description", span: 6 },
        { kind: "text", key: "grade", label: "Grade", span: 6 },
        { kind: "text", key: "packaging", label: "Packing", span: 6 },
        { kind: "text", key: "commodityCode", label: "HS code", span: 3 },
        { kind: "text", key: "countryOfOrigin", label: "Country of origin", span: 3 },
      ],
    },
    {
      title: "Routing",
      fields: [
        { kind: "text", key: "portOfLoading", label: "POL", span: 3 },
        { kind: "text", key: "portOfDischarge", label: "POD", span: 3 },
        { kind: "date", key: "atd", label: "ATD", span: 3 },
        { kind: "date", key: "eta", label: "ETA", span: 3 },
        { kind: "text", key: "carrierName", label: "Carrier", span: 6 },
        { kind: "readout", key: "containerSummary", label: "Containers", span: 6 },
      ],
    },
  ],

  proforma_invoice: [
    {
      title: "Header & references",
      fields: [
        { kind: "date", key: "invoiceDate", label: "Invoice date" },
        { kind: "date", key: "latestSailingDate", label: "Latest sailing" },
        { kind: "text", key: "incoterms", label: "Incoterms" },
        { kind: "text", key: "paymentTerms", label: "Payment terms", span: 8 },
        { kind: "text", key: "customerReference", label: "Customer ref #", span: 4 },
      ],
    },
    { title: "Sold to", fields: [{ kind: "party", key: "soldTo", label: "Name" }] },
    {
      title: "Goods & shipment",
      fields: [
        { kind: "text", key: "deliveredTo", label: "Delivered to", span: 6 },
        { kind: "text", key: "descriptionOfGoods", label: "Description", span: 6 },
        { kind: "text", key: "grade", label: "Grade", span: 4 },
        { kind: "text", key: "packing", label: "Packing", span: 8 },
        { kind: "text", key: "carrierName", label: "Carrier", span: 4 },
        { kind: "text", key: "vesselVoyage", label: "Vessel / voyage", span: 4 },
        { kind: "text", key: "countryOfOrigin", label: "Country of origin", span: 4 },
        { kind: "text", key: "freightTerms", label: "Freight terms", span: 4 },
        { kind: "text", key: "dthcTerms", label: "DTHC terms", span: 4 },
        { kind: "number", key: "tolerancePct", label: "Tolerance %", span: 4 },
        { kind: "text", key: "signatory", label: "Signatory", span: 6 },
        { kind: "readout", key: "containerSummary", label: "Containers", span: 6 },
      ],
    },
  ],

  certificate_of_origin: [
    {
      title: "Identity",
      fields: [
        { kind: "date", key: "issueDate", label: "Issue date" },
        { kind: "text", key: "blNumber", label: "B/L no. (5A)" },
        { kind: "text", key: "bookingNumber", label: "Booking no." },
        { kind: "text", key: "exportReferences", label: "Export references (6)", span: 6 },
        { kind: "text", key: "countryOfOrigin", label: "Country of origin (8)", span: 6 },
      ],
    },
    { title: "Consignee (3)", fields: [{ kind: "party", key: "consignee", label: "Name" }] },
    { title: "Notify party (4)", fields: [{ kind: "party", key: "notifyParty", label: "Name" }] },
    {
      title: "Routing",
      fields: [
        { kind: "text", key: "forwardingAgent", label: "Forwarding agent (7)", span: 6 },
        { kind: "text", key: "fmcNumber", label: "FMC no. (7)", span: 6 },
        { kind: "text", key: "routingInstructions", label: "Routing instructions (9)", span: 6 },
        { kind: "text", key: "finalDestination", label: "Final destination (9A)", span: 6 },
        { kind: "text", key: "loadingTerminal", label: "Loading terminal (10)", span: 4 },
        { kind: "text", key: "typeOfMove", label: "Type of move (11)", span: 4 },
        { kind: "text", key: "placeOfReceipt", label: "Place of receipt (13)", span: 4 },
        { kind: "text", key: "vesselVoyage", label: "Vessel / voy (14)", span: 4 },
        { kind: "text", key: "portOfLoading", label: "POL (15)", span: 4 },
        { kind: "text", key: "portOfDischarge", label: "POD (16)", span: 4 },
        { kind: "text", key: "placeOfDelivery", label: "Place of delivery (17)", span: 6 },
        { kind: "text", key: "invoiceReference", label: "Invoice ref (20)", span: 6 },
      ],
    },
    {
      title: "Goods",
      fields: [
        { kind: "text", key: "descriptionOfGoods", label: "Description (20)", span: 6 },
        { kind: "text", key: "commodityCode", label: "HS code", span: 3 },
        { kind: "text", key: "measurement", label: "Measurement (22)", span: 3 },
        { kind: "textarea", key: "marksAndNumbers", label: "Marks &amp; numbers (18)" },
      ],
    },
  ],
};

export function hasGenericForm(docType: ShipmentDocType): boolean {
  return docType in SPECS;
}

type Payload = Record<string, unknown>;

export function GenericDocumentForm({
  group,
  docType,
  document,
  source,
  lines,
  locked,
  onClose,
  onSaved,
}: {
  group: ShipmentGroupRow;
  docType: ShipmentDocType;
  document?: ShipmentDocumentRow;
  source: Payload;
  /** Container rows resolved by the sheet — live for a draft, frozen once issued. */
  lines: InvoiceLine[];
  locked: (key: string) => boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(document);
  const sections = SPECS[docType] ?? [];

  const [values, setValues] = useState<Payload>(source);

  // The container rows the sheet resolved: live for a draft, the payload's own
  // once issued. Every document's lines carry containerId.
  const lineIds = lines.map((l) => l.containerId);

  const [coveredIds, setCoveredIds] = useState<Set<string>>(
    () => new Set(isEdit && document ? document.containerIds : lineIds),
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
    live.status === "draft" ? locked(key) : !isFieldEditable(key, docType, live.status);
  const isLocked = isLockedKey;

  const create = ClientAPI.exportShipments.createDocument.useMutation();
  const update = ClientAPI.exportShipments.updateDocument.useMutation();
  const issue = ClientAPI.exportShipments.issueDocument.useMutation();
  const pending = create.isPending || update.isPending || issue.isPending;

  const set = (key: string, v: unknown) => setValues((prev) => ({ ...prev, [key]: v }));

  const toggle = (containerId: string) =>
    setCoveredIds((prev) => {
      const next = new Set(prev);
      if (next.has(containerId)) next.delete(containerId);
      else next.add(containerId);
      return next;
    });

  const save = async (thenIssue: boolean) => {
    if (!coveredIds.size) {
      toast.error("A document has to cover at least one container.");
      return;
    }

    const payload: Payload = {
      ...values,
      documentNumber: live.number ?? values.documentNumber,
    };
    const parsed = payloadSchemaFor(docType).safeParse(payload);
    if (!parsed.success) {
      const issues = "issues" in parsed.error ? parsed.error.issues : [];
      toast.error(
        `Missing: ${issues
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
          payload: parsed.data as Payload,
          // Coverage is frozen at issue — sending it would be refused.
          ...(live.status === "draft" ? { containerIds: [...coveredIds] } : {}),
        });
      } else {
        const created = await create.mutateAsync({
          groupId: group.id,
          docType,
          containerIds: [...coveredIds],
          payload: parsed.data as Payload,
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

  const str = (key: string) => {
    const v = values[key];
    return v == null ? "" : String(v);
  };

  const renderField = (spec: FieldSpec) => {
    const isLocked = isLockedKey(spec.key);
    const id = `doc-${spec.key}`;

    if (spec.kind === "party") {
      return (
        <PartyFields
          key={spec.key}
          fieldKey={spec.key}
          party={values[spec.key] as PartyBlock}
          setParty={(p) => set(spec.key, p)}
          locked={isLocked}
          nameLabel={spec.label}
        />
      );
    }

    if (spec.kind === "textarea") {
      return (
        <Cell key={spec.key} label={spec.label} span={12} htmlFor={id}>
          <Textarea
            id={id}
            rows={2}
            value={str(spec.key)}
            disabled={isLocked}
            onChange={(e) => set(spec.key, e.target.value || null)}
          />
        </Cell>
      );
    }

    if (spec.kind === "readout") {
      return (
        <Cell key={spec.key} label={spec.label} span={spec.span ?? 4}>
          <div className="text-muted-foreground flex h-8 items-center text-sm">
            {str(spec.key) || "—"}
            <span className="ml-2 text-xs">derived</span>
          </div>
        </Cell>
      );
    }

    return (
      <Cell key={spec.key} label={spec.label} span={spec.span ?? 4} htmlFor={id}>
        <Input
          id={id}
          type={spec.kind === "text" ? undefined : spec.kind}
          className="h-8"
          value={str(spec.key)}
          disabled={isLocked}
          title={isLocked ? "Frozen once the document is issued" : undefined}
          onChange={(e) =>
            set(
              spec.key,
              spec.kind === "number" ? Number(e.target.value) || 0 : e.target.value || null,
            )
          }
        />
      </Cell>
    );
  };

  return (
    <DocumentEditorShell
      title={`${DOC_TYPE_META[docType].label}${live.number ? ` · ${live.number}` : ""}`}
      description={
        live.status !== "draft"
          ? "This document has been issued. Only the reference fields left open stay editable — correcting anything else means voiding it and exporting the next revision."
          : "Prefilled from this booking and its transactions. Weights, counts and totals follow the containers you cover, so they match every other document on this shipment."
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
        {sections.map((section) => (
          <div key={section.title} className="flex flex-col gap-2">
            <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              {section.title}
            </h3>
            <Grid>{section.fields.map(renderField)}</Grid>
          </div>
        ))}

        <div className="flex flex-col gap-2">
          <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Containers covered — {coveredIds.size} of {lineIds.length}
          </h3>
          <CoveredContainers
            lines={lines}
            covered={coveredIds}
            onToggle={toggle}
            disabled={isLocked("lines")}
          />
          <p className="text-muted-foreground text-xs">
            Changing the coverage here changes only this document. Re-export the others if the
            shipment itself changed.
          </p>
        </div>
      </>
    </DocumentEditorShell>
  );
}
