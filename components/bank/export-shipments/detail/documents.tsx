"use client";

// =============================================================================
// Documents — the export paperwork a booking produces
// =============================================================================
// A row of Export buttons over a table of what has already been generated.
//
// The third row action is Delete on a DRAFT and Void on an ISSUED document,
// never both: an invoice that has left the building cannot be removed, only
// superseded, and that distinction is the whole point of the lifecycle. Both
// are refused by the database too — this only saves the round trip.
//
// Download hits app/api/shipment-documents/[id]/pdf rather than storage
// directly: issued documents are served byte-identically from their stored
// artifact, and anything not yet rendered is rendered on demand.
// =============================================================================

import { useState } from "react";
import { Download, FileSignature, FileText, Pencil, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { Section } from "@/components/bank/chrome";
import { DocStatusBadge } from "@/components/bank/export-shipments/doc-status";
import { DocumentSheet } from "@/components/bank/export-shipments/detail/document-sheet";
import type {
  ShipmentDocumentRow,
  ShipmentGroupRow,
} from "@/components/bank/export-shipments/types";
import { Button } from "@/components/ui/button";
import { DataGrid, type DataGridColumn } from "@/components/ui/data-grid";
import { Input } from "@/components/ui/input";
import {
  isBuiltDocType,
  DOC_TYPES,
  DOC_TYPE_META,
  type ShipmentDocStatus,
  type ShipmentDocType,
} from "@/lib/export-shipment/documents/types";
import { createClient } from "@/lib/supabase/client";
import { ClientAPI } from "@/trpc/client";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
      })
    : "—";

export function Documents({ group, onSaved }: { group: ShipmentGroupRow; onSaved: () => void }) {
  const [editing, setEditing] = useState<ShipmentDocumentRow | null>(null);
  const [creating, setCreating] = useState<ShipmentDocType | null>(null);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);

  const utils = ClientAPI.useUtils();
  const query = ClientAPI.exportShipments.documents.useQuery({ groupId: group.id });

  const refresh = () => {
    void utils.exportShipments.documents.invalidate({ groupId: group.id });
    onSaved();
  };

  const remove = ClientAPI.exportShipments.deleteDocument.useMutation({
    onSuccess: () => {
      toast.success("Draft deleted");
      refresh();
    },
  });
  const voidDoc = ClientAPI.exportShipments.voidDocument.useMutation({
    onSuccess: () => {
      toast.success("Document voided — export the next revision when ready");
      refresh();
    },
  });
  const attach = ClientAPI.exportShipments.attachDocumentFile.useMutation({ onSuccess: refresh });

  const download = (doc: ShipmentDocumentRow) => {
    window.open(`/api/shipment-documents/${doc.id}/pdf`, "_blank", "noopener,noreferrer");
  };

  /** The counter-signed original, straight from storage. */
  const downloadSigned = async (path: string) => {
    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from("shipment-documents")
      .createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) {
      toast.error(error?.message || "Could not open the signed original.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const uploadSigned = async (doc: ShipmentDocumentRow, file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("The file must be 20 MB or smaller.");
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "pdf";
    const path = `${group.id}/${doc.document_number}-signed.${ext}`;
    const supabase = createClient();
    const { error } = await supabase.storage
      .from("shipment-documents")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) {
      toast.error(error.message);
      return;
    }
    await attach.mutateAsync({ id: doc.id, path });
    toast.success("Signed original attached");
    setUploadingFor(null);
  };

  const askVoid = (doc: ShipmentDocumentRow) => {
    // A void without a reason is refused by a CHECK constraint, so ask for one
    // here rather than discovering it server-side.
    const reason = window.prompt(
      `Void ${doc.document_number}?\n\nIt stays downloadable and the reason is recorded. Export the next revision afterwards.\n\nReason:`,
      "",
    );
    if (reason === null) return;
    if (!reason.trim()) {
      toast.error("A void needs a reason — it is the record of why the document was withdrawn.");
      return;
    }
    voidDoc.mutate({ id: doc.id, reason: reason.trim() });
  };

  const columns: DataGridColumn<ShipmentDocumentRow>[] = [
    {
      key: "docType",
      header: "Document",
      width: 170,
      accessor: (d) => DOC_TYPE_META[d.doc_type as ShipmentDocType]?.label ?? d.doc_type,
    },
    {
      key: "number",
      header: "Number",
      width: 160,
      cell: (d) => <span className="font-mono text-xs">{d.document_number}</span>,
    },
    {
      key: "status",
      header: "Status",
      width: 130,
      cell: (d) => <DocStatusBadge status={d.status as ShipmentDocStatus} />,
    },
    {
      key: "containers",
      header: "Containers",
      width: 90,
      align: "right",
      accessor: (d) => d.containerCount,
    },
    { key: "issued", header: "Issued", width: 120, accessor: (d) => fmtDate(d.issued_at) },
    {
      key: "signed",
      header: "Signed",
      width: 90,
      cell: (d) =>
        d.uploaded_path ? (
          <button
            type="button"
            aria-label={`Download the signed original of ${d.document_number}`}
            onClick={() => void downloadSigned(d.uploaded_path!)}
            className="text-table-link inline-flex items-center gap-1 hover:opacity-70"
          >
            <FileSignature className="size-3.5" />
            <span className="text-xs">Signed</span>
          </button>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        ),
    },
    {
      key: "actions",
      header: "",
      width: 118,
      cell: (d) => (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label={`Download ${d.document_number}`}
            title="Download PDF"
            onClick={() => download(d)}
            className="text-table-link hover:opacity-70"
          >
            <Download className="size-3.5" />
          </button>

          <button
            type="button"
            aria-label={`Edit ${d.document_number}`}
            title={d.status === "draft" ? "Edit" : "Edit the fields that stay open after issue"}
            disabled={d.status === "void" || d.status === "superseded"}
            onClick={() => setEditing(d)}
            className="text-table-link hover:opacity-70 disabled:opacity-30"
          >
            <Pencil className="size-3.5" />
          </button>

          <button
            type="button"
            aria-label={`Attach the signed original of ${d.document_number}`}
            title="Upload signed original"
            onClick={() => setUploadingFor(uploadingFor === d.id ? null : d.id)}
            className="text-table-link hover:opacity-70"
          >
            <Upload className="size-3.5" />
          </button>

          {/* Delete on a draft, Void on an issued document — never both. */}
          {d.status === "draft" ? (
            <button
              type="button"
              aria-label={`Delete ${d.document_number}`}
              title="Delete this draft"
              onClick={() => remove.mutate({ id: d.id })}
              className="text-table-negative hover:opacity-70"
            >
              <Trash2 className="size-3.5" />
            </button>
          ) : (
            <button
              type="button"
              aria-label={`Void ${d.document_number}`}
              title="Void this document"
              disabled={d.status !== "issued"}
              onClick={() => askVoid(d)}
              className="text-table-negative hover:opacity-70 disabled:opacity-30"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      ),
    },
  ];

  const rows = query.data ?? [];

  return (
    <Section
      title="Documents"
      subtitle="Export paperwork generated from this booking's data"
      icon={FileText}
    >
      {/* One Export button per document type. Stages 2-3 fill in the rest; the
          unbuilt ones are shown DISABLED rather than hidden, so the desk can
          see what is coming instead of wondering where it went. */}
      <div className="flex flex-wrap gap-2">
        {DOC_TYPES.map((type) => {
          const available = isBuiltDocType(type);
          return (
            <Button
              key={type}
              variant={available ? "gold" : "outline"}
              size="sm"
              disabled={!available}
              title={available ? undefined : "Not built yet"}
              onClick={() => setCreating(type)}
            >
              <FileText className="size-4" />
              {DOC_TYPE_META[type].label}
            </Button>
          );
        })}
      </div>

      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(d) => d.id}
        emptyMessage="No documents yet. Export one from this booking's data using the buttons above."
      />

      {uploadingFor ? (
        <div className="flex items-center gap-2 rounded-md border p-3">
          <Input
            id="signed-upload"
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            aria-label="Signed original"
            className="h-8 max-w-sm"
            onChange={(e) => {
              const file = e.target.files?.[0];
              const doc = rows.find((d) => d.id === uploadingFor);
              if (file && doc) void uploadSigned(doc, file);
            }}
          />
          <span className="text-muted-foreground text-xs">
            The executed original — a scan of the signed and stamped document. PDF, JPEG or PNG.
          </span>
          <Button variant="outline" size="sm" onClick={() => setUploadingFor(null)}>
            Cancel
          </Button>
        </div>
      ) : null}

      {creating ? (
        <DocumentSheet
          group={group}
          docType={creating}
          onClose={() => setCreating(null)}
          // Saving keeps the editor open (the preview reloads); Close ends it.
          onSaved={refresh}
        />
      ) : null}

      {editing ? (
        <DocumentSheet
          group={group}
          docType={editing.doc_type as ShipmentDocType}
          document={editing}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      ) : null}
    </Section>
  );
}
