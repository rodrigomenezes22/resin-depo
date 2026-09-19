"use client";

// =============================================================================
// Document editor shell — form on the left, the PDF on the right
// =============================================================================
// Ported from TPE's transaction-document editor (components/bank/
// transaction-detail/document-editor.tsx): the desk edits a document and sees
// the rendered page beside it. The preview is the SAME endpoint the Download
// button uses (/api/shipment-documents/:id/pdf), so it cannot drift from what
// the counterparty receives.
//
// One deliberate difference from TPE: the preview refreshes on SAVE, not on
// every keystroke. The desk asked for it — a PDF re-rendering under a moving
// cursor is noise, and an explicit "Save draft" is the natural checkpoint.
// The three export forms own their state and mutations; this shell owns the
// dialog, the preview pane and the footer.
// =============================================================================

import { ExternalLink, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function DocumentEditorShell({
  title,
  description,
  status,
  documentId,
  previewVersion,
  pending,
  onClose,
  onSaveDraft,
  onSaveAndIssue,
  onSave,
  children,
}: {
  title: string;
  description: string;
  status: "draft" | "issued" | "superseded" | "void";
  /** Null until the first save — nothing to preview before the row exists. */
  documentId: string | null;
  /** Bumped by the form after every successful save; keys the iframe. */
  previewVersion: number;
  pending: boolean;
  onClose: () => void;
  onSaveDraft: () => void;
  onSaveAndIssue: () => void;
  /** Issued documents: only the allowlisted references are still editable. */
  onSave: () => void;
  children: React.ReactNode;
}) {
  const isDraft = status === "draft";
  const pdfUrl = documentId
    ? `/api/shipment-documents/${documentId}/pdf?v=${previewVersion}`
    : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[92vh] max-h-[92vh] w-[96vw] max-w-[1600px] flex-col gap-3 sm:max-w-[1600px]">
        <DialogHeader>
          <DialogTitle>
            {title}
            {!isDraft && (
              <span className="text-muted-foreground ml-2 text-xs font-normal uppercase">
                {status}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-2">
          {/* --- The form, supplied by the document type ------------------ */}
          <div className="flex min-h-0 flex-col gap-5 overflow-y-auto pr-2">{children}</div>

          {/* --- The preview --------------------------------------------- */}
          <div className="bg-muted/30 flex min-h-0 flex-col overflow-hidden rounded-lg border">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-muted-foreground text-xs">
                {pending ? (
                  <span className="flex items-center gap-1">
                    <Loader2 className="size-3 animate-spin" /> Saving…
                  </span>
                ) : pdfUrl ? (
                  "Preview — refreshes when you save"
                ) : (
                  "Preview"
                )}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={!pdfUrl}
                onClick={() => pdfUrl && window.open(pdfUrl, "_blank", "noopener,noreferrer")}
              >
                <ExternalLink className="size-3.5" /> Open in new tab
              </Button>
            </div>
            {pdfUrl ? (
              // `key` forces a reload after each save — an iframe will not
              // refetch a URL it thinks it already has.
              <iframe
                key={previewVersion}
                src={pdfUrl}
                title={`${title} preview`}
                className="min-h-0 flex-1 bg-white"
              />
            ) : (
              <div className="text-muted-foreground flex flex-1 items-center justify-center p-6 text-center text-sm">
                Save the draft to render the first preview. It reloads on every save after that.
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-row items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={pending}>
            Close
          </Button>
          {isDraft ? (
            <>
              <Button variant="outline" size="sm" disabled={pending} onClick={onSaveDraft}>
                {pending ? "Saving…" : documentId ? "Save draft & refresh preview" : "Save draft"}
              </Button>
              <Button variant="gold" size="sm" disabled={pending} onClick={onSaveAndIssue}>
                {pending ? "Saving…" : "Save & issue"}
              </Button>
            </>
          ) : status === "issued" ? (
            <Button variant="blue" size="sm" disabled={pending} onClick={onSave}>
              {pending ? "Saving…" : "Save references"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The loading / error state before a draft could be built. */
export function DocumentEditorLoading({
  title,
  message,
  onClose,
}: {
  title: string;
  message: string;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[40vh] w-[96vw] max-w-[1600px] items-center justify-center sm:max-w-[1600px]">
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <span className="text-muted-foreground flex items-center text-sm">
          <Loader2 className="mr-2 size-4 animate-spin" /> {message}
        </span>
      </DialogContent>
    </Dialog>
  );
}
