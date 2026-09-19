"use client";

// =============================================================================
// Shipment Files — the legacy `Shipment_Files` panel
// =============================================================================
// One card, two hosts: Bank → Transaction Details (owner = a matched order) and
// Bank → Export Shipments detail (owner = a shipment group). The owner prop is
// the only difference, which is what keeps the desk looking at the same panel in
// both places rather than two that drift.
//
// Layout follows legacy (docs/legacy-ui-audit.md:370-372): the grid of existing
// files first — Delete | File | Description | Owner | Date | Buyer access |
// Seller access — then the upload area beneath it (File to Add, Description,
// per-party Access Rights checkboxes, Upload). We add Size and fold Delete in
// with the other row actions on the right, where every other grid in this app
// puts them.
//
// ACCESS RIGHTS ARE RECORDED, NOT ENFORCED. The two checkboxes write
// `buyer_access`/`seller_access` so the desk's intent survives to the planned
// customer login; RLS on the table is staff-only today, so ticking a box grants
// nobody anything yet. The helper text under the checkboxes says exactly that —
// do not reword it into a promise the system does not keep.
// =============================================================================

import { useRef, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { Download, Eye, Paperclip, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GridCell, GridHeadCell, GridRow, GridTable } from "@/components/ui/data-grid";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { createClient } from "@/lib/supabase/client";
import {
  FILE_ACCEPT,
  formatBytes,
  isPreviewable,
  rejectFile,
  shipmentFilePath,
  SHIPMENT_FILES_BUCKET,
  type FileOwner,
} from "@/lib/shipment-files";
import { ClientAPI } from "@/trpc/client";
import type { AppRouter } from "@/trpc/routers/_app";

import { CheckField, Section, fmtDate } from "./chrome";

type ShipmentFile = inferRouterOutputs<AppRouter>["shipmentFiles"]["list"][number];

/** The owner, in the shape both the query input and the path builder want. */
function queryInput(owner: FileOwner) {
  return owner.kind === "deal"
    ? { matchedOrderId: owner.matchedOrderId }
    : { shipmentGroupId: owner.groupId };
}

/**
 * Mint a short-lived signed URL for a private attachment.
 *
 * `download` asks storage to send Content-Disposition: attachment with the
 * ORIGINAL filename — the object itself is named by uuid, so without this the
 * desk saves a file called `9f3c…-4b21.pdf`.
 */
async function signedUrl(path: string, downloadAs?: string): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(SHIPMENT_FILES_BUCKET)
    .createSignedUrl(path, 3600, downloadAs ? { download: downloadAs } : undefined);
  if (error || !data?.signedUrl) {
    toast.error(error?.message || "Could not open that file.");
    return null;
  }
  return data.signedUrl;
}

export function ShipmentFiles({ owner }: { owner: FileOwner }) {
  const input = queryInput(owner);
  const utils = ClientAPI.useUtils();
  const list = ClientAPI.shipmentFiles.list.useQuery(input);

  const [editing, setEditing] = useState<ShipmentFile | null>(null);
  const [preview, setPreview] = useState<{ url: string; file: ShipmentFile } | null>(null);

  const refresh = () => void utils.shipmentFiles.list.invalidate(input);

  const remove = ClientAPI.shipmentFiles.remove.useMutation({
    onSuccess: async ({ storagePath }) => {
      // The row is gone; drop the object too, or the bucket accumulates
      // material nothing can reach. A failure here is worth surfacing but must
      // not read as "the delete failed" — the file IS gone from the desk's view.
      const { error } = await createClient()
        .storage.from(SHIPMENT_FILES_BUCKET)
        .remove([storagePath]);
      if (error) toast.warning(`Removed, but the stored file lingered: ${error.message}`);
      else toast.success("File removed.");
      refresh();
    },
  });

  const files = list.data ?? [];

  async function openPreview(file: ShipmentFile) {
    const url = await signedUrl(file.storage_path);
    if (url) setPreview({ url, file });
  }

  async function download(file: ShipmentFile) {
    const url = await signedUrl(file.storage_path, file.file_name);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  function confirmRemove(file: ShipmentFile) {
    if (!window.confirm(`Delete "${file.file_name}"? The stored file is deleted too.`)) return;
    remove.mutate({ id: file.id });
  }

  return (
    <Section
      title="Shipment Files"
      subtitle="Attachments on this shipment — scans, tickets, customs paperwork"
      icon={Paperclip}
    >
      <div className="bg-card overflow-x-auto rounded-lg border">
        <GridTable>
          <thead>
            <tr className="bg-muted/60 text-muted-foreground text-left text-xs">
              <GridHeadCell>File</GridHeadCell>
              <GridHeadCell className="w-1/3">Description</GridHeadCell>
              <GridHeadCell>Size</GridHeadCell>
              <GridHeadCell>Owner</GridHeadCell>
              <GridHeadCell>Date</GridHeadCell>
              <GridHeadCell>Buyer access</GridHeadCell>
              <GridHeadCell>Seller access</GridHeadCell>
              <GridHeadCell className="w-px" />
            </tr>
          </thead>
          <tbody>
            {list.isLoading ? (
              <GridRow index={0}>
                <GridCell colSpan={8} className="text-muted-foreground">
                  Loading files…
                </GridCell>
              </GridRow>
            ) : files.length === 0 ? (
              <GridRow index={0}>
                <GridCell colSpan={8} className="text-muted-foreground">
                  No files attached yet.
                </GridCell>
              </GridRow>
            ) : (
              files.map((f, i) => (
                <GridRow key={f.id} index={i}>
                  <GridCell className="font-medium">{f.file_name}</GridCell>
                  <GridCell className="text-muted-foreground">{f.description || "—"}</GridCell>
                  <GridCell>{formatBytes(Number(f.size_bytes))}</GridCell>
                  <GridCell>
                    {f.uploader
                      ? [f.uploader.first_name, f.uploader.last_name].filter(Boolean).join(" ") ||
                        "—"
                      : "—"}
                  </GridCell>
                  <GridCell>{fmtDate(f.created_at)}</GridCell>
                  <GridCell>{f.buyer_access ? "Yes" : "No"}</GridCell>
                  <GridCell>{f.seller_access ? "Yes" : "No"}</GridCell>
                  <GridCell>
                    <div className="flex items-center justify-end gap-1">
                      {isPreviewable(f.content_type) && (
                        <button
                          type="button"
                          aria-label={`Preview ${f.file_name}`}
                          title="Preview"
                          onClick={() => void openPreview(f)}
                          className="text-muted-foreground hover:text-foreground p-1"
                        >
                          <Eye className="size-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label={`Download ${f.file_name}`}
                        title="Download"
                        onClick={() => void download(f)}
                        className="text-muted-foreground hover:text-foreground p-1"
                      >
                        <Download className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Edit ${f.file_name}`}
                        title="Edit"
                        onClick={() => setEditing(f)}
                        className="text-muted-foreground hover:text-foreground p-1"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${f.file_name}`}
                        title="Delete"
                        disabled={remove.isPending}
                        onClick={() => confirmRemove(f)}
                        className="text-muted-foreground hover:text-destructive p-1 disabled:opacity-50"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </GridCell>
                </GridRow>
              ))
            )}
          </tbody>
        </GridTable>
      </div>

      <UploadArea owner={owner} onUploaded={refresh} />

      {editing && (
        <EditFileSheet
          owner={owner}
          file={editing}
          onDone={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}

      {preview && (
        <PreviewDialog
          url={preview.url}
          file={preview.file}
          onClose={() => setPreview(null)}
          onDownload={() => void download(preview.file)}
        />
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Upload area — the legacy fieldset, inline beneath the grid
// ---------------------------------------------------------------------------

function UploadArea({ owner, onUploaded }: { owner: FileOwner; onUploaded: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [buyerAccess, setBuyerAccess] = useState(false);
  const [sellerAccess, setSellerAccess] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const create = ClientAPI.shipmentFiles.create.useMutation();

  function pick(next: File | null) {
    if (!next) {
      setFile(null);
      return;
    }
    const problem = rejectFile(next);
    if (problem) {
      toast.error(problem);
      if (inputRef.current) inputRef.current.value = "";
      setFile(null);
      return;
    }
    setFile(next);
  }

  function reset() {
    setFile(null);
    setDescription("");
    setBuyerAccess(false);
    setSellerAccess(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function upload() {
    if (!file) return;
    setUploading(true);
    // Upload FIRST, then record — see the router's header. A row whose object
    // never landed is a grid line that opens nothing; an object with no row is
    // invisible and harmless.
    const id = crypto.randomUUID();
    const path = shipmentFilePath(owner, id, file.type);
    try {
      const { error } = await createClient()
        .storage.from(SHIPMENT_FILES_BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw new Error(error.message);

      await create.mutateAsync({
        ...queryInput(owner),
        id,
        fileName: file.name,
        description: description.trim() || undefined,
        storagePath: path,
        contentType: file.type,
        sizeBytes: file.size,
        buyerAccess,
        sellerAccess,
      });
      toast.success(`${file.name} attached.`);
      reset();
      onUploaded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="bg-muted/30 flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-col gap-1 text-xs font-medium">
          File to Add
          <Input
            ref={inputRef}
            type="file"
            accept={FILE_ACCEPT}
            aria-label="File to add"
            className="h-8 max-w-xs py-1"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium">
          Description
          <Input
            value={description}
            aria-label="File description"
            placeholder="What is this document?"
            className="h-8"
            maxLength={500}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
      </div>

      <div>
        <span className="text-xs font-medium">Access Rights</span>
        <div className="flex flex-wrap items-center gap-4">
          <CheckField label="Buyer" checked={buyerAccess} onChange={setBuyerAccess} />
          <CheckField label="Seller" checked={sellerAccess} onChange={setSellerAccess} />
        </div>
        <p className="text-muted-foreground text-xs">
          Recorded for when customer logins ship — today every file here is visible to TPE staff
          only, whichever boxes are ticked.
        </p>
      </div>

      <div className="flex justify-end">
        <Button
          variant="blue"
          size="sm"
          disabled={!file || uploading || create.isPending}
          onClick={() => void upload()}
        >
          {uploading || create.isPending ? "Uploading…" : "Upload"}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit — metadata, and optionally swap the file behind the row
// ---------------------------------------------------------------------------

function EditFileSheet({
  owner,
  file,
  onDone,
}: {
  owner: FileOwner;
  file: ShipmentFile;
  onDone: () => void;
}) {
  const [description, setDescription] = useState(file.description ?? "");
  const [buyerAccess, setBuyerAccess] = useState(file.buyer_access);
  const [sellerAccess, setSellerAccess] = useState(file.seller_access);
  const [replacement, setReplacement] = useState<File | null>(null);
  const [working, setWorking] = useState(false);

  const update = ClientAPI.shipmentFiles.update.useMutation();

  function pick(next: File | null) {
    if (!next) {
      setReplacement(null);
      return;
    }
    const problem = rejectFile(next);
    if (problem) {
      toast.error(problem);
      setReplacement(null);
      return;
    }
    setReplacement(next);
  }

  async function save() {
    setWorking(true);
    const supabase = createClient();
    try {
      let swap: { storagePath: string; contentType: string; sizeBytes: number } | undefined;

      if (replacement) {
        // The path carries the MIME-derived extension, so swapping a PDF for a
        // PNG lands at a NEW key. Upload first, repoint the row, and only then
        // drop the old object — in that order nothing is ever referenced-but-
        // missing, and the worst case is one unreferenced object.
        const path = shipmentFilePath(owner, file.id, replacement.type);
        const { error } = await supabase.storage
          .from(SHIPMENT_FILES_BUCKET)
          .upload(path, replacement, { upsert: true, contentType: replacement.type });
        if (error) throw new Error(error.message);
        swap = {
          storagePath: path,
          contentType: replacement.type,
          sizeBytes: replacement.size,
        };
      }

      const { previousPath } = await update.mutateAsync({
        id: file.id,
        ...(replacement ? { fileName: replacement.name } : {}),
        description: description.trim() || null,
        buyerAccess,
        sellerAccess,
        ...swap,
      });

      if (swap && previousPath && previousPath !== swap.storagePath) {
        const { error } = await supabase.storage.from(SHIPMENT_FILES_BUCKET).remove([previousPath]);
        if (error) toast.warning(`Replaced, but the old file lingered: ${error.message}`);
      }

      toast.success(replacement ? "File replaced." : "File updated.");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save that.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <Sheet open onOpenChange={(next) => !next && onDone()}>
      <SheetContent className="w-full gap-0 overflow-y-auto data-[side=right]:sm:max-w-md">
        <SheetHeader className="p-6 pb-4">
          <SheetTitle className="text-base">Edit file</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-6 pb-6">
          <label className="flex flex-col gap-1 text-xs font-medium">
            Description
            <Input
              value={description}
              aria-label="File description"
              className="h-8"
              maxLength={500}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          <div>
            <span className="text-xs font-medium">Access Rights</span>
            <div className="flex flex-wrap items-center gap-4">
              <CheckField label="Buyer" checked={buyerAccess} onChange={setBuyerAccess} />
              <CheckField label="Seller" checked={sellerAccess} onChange={setSellerAccess} />
            </div>
            <p className="text-muted-foreground text-xs">
              Recorded for when customer logins ship — staff-only until then.
            </p>
          </div>

          <label className="flex flex-col gap-1 text-xs font-medium">
            Replace file
            <Input
              type="file"
              accept={FILE_ACCEPT}
              aria-label="Replacement file"
              className="h-8 py-1"
              onChange={(e) => pick(e.target.files?.[0] ?? null)}
            />
            <span className="text-muted-foreground font-normal">
              {replacement
                ? `${replacement.name} will replace ${file.file_name}.`
                : `Currently ${file.file_name}. Leave empty to keep it.`}
            </span>
          </label>
        </div>

        <SheetFooter className="flex-row items-center justify-end gap-2 border-t p-6">
          <Button variant="outline" size="sm" onClick={onDone}>
            Cancel
          </Button>
          <Button variant="blue" size="sm" disabled={working} onClick={() => void save()}>
            {working ? "Saving…" : "Save"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Preview — inline, so the desk can check a scan without leaving the deal
// ---------------------------------------------------------------------------

function PreviewDialog({
  url,
  file,
  onClose,
  onDownload,
}: {
  url: string;
  file: ShipmentFile;
  onClose: () => void;
  onDownload: () => void;
}) {
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-base">{file.file_name}</DialogTitle>
        </DialogHeader>

        <div className="bg-muted/30 h-[70vh] overflow-auto rounded-lg border">
          {file.content_type.startsWith("image/") ? (
            // short-lived storage URL cannot be optimised by next/image.
            <img src={url} alt={file.file_name} className="mx-auto max-w-full" />
          ) : (
            <iframe src={url} title={file.file_name} className="h-full w-full" />
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onDownload}>
            Download
          </Button>
          <Button variant="blue" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
