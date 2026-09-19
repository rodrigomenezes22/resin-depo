// =============================================================================
// Shipment Files — the pure half
// =============================================================================
// Path construction, type/size gating and display helpers for the Shipment
// Files panel (legacy `Shipment_Files`, docs/legacy-ui-audit.md:370-372), shared
// by the Transaction Details card, the Export Shipments card and the unit spec
// so the three cannot disagree about where a file lives or what is accepted.
//
// The bucket is the existing private `shipment-documents` — see
// supabase/migrations/20260908120000_shipment_files.sql for why no new bucket
// was minted.
// =============================================================================

/** The private bucket these attachments share with generated export paperwork. */
export const SHIPMENT_FILES_BUCKET = "shipment-documents";

/**
 * MIME types the bucket accepts. This list is not advisory: the bucket's own
 * `allowed_mime_types` rejects anything else, so a wider client-side list would
 * only turn a clear "not accepted" into an opaque storage error mid-upload.
 */
export const ALLOWED_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;

/** Matches the bucket's 20 MB `file_size_limit`. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** What the file input's `accept` attribute should offer. */
export const FILE_ACCEPT = ALLOWED_FILE_TYPES.join(",");

/** Which surface a file hangs off. Mirrors the table's exactly-one-owner CHECK. */
export type FileOwner =
  | { kind: "deal"; matchedOrderId: string }
  | { kind: "group"; groupId: string };

/**
 * Extension for the stored object, derived from the MIME type rather than the
 * user's filename. A file named `invoice.pdf.exe` must not put `.exe` in the
 * path, and a browser that reports `image/jpeg` for `scan.jfif` should still
 * land as `.jpg`. The original name is preserved on the row instead, which is
 * what the grid shows and what the download is named.
 */
export function extensionFor(contentType: string): string {
  switch (contentType) {
    case "application/pdf":
      return "pdf";
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    default:
      return "bin";
  }
}

/**
 * Where an attachment lives in the bucket:
 *
 *   files/deal/{matchedOrderId}/{fileId}.{ext}
 *   files/group/{shipmentGroupId}/{fileId}.{ext}
 *
 * Keyed by the row's uuid, never the filename — two files called `scan.pdf` on
 * one deal must not collide, and the `files/` first segment is what scopes the
 * storage DELETE policy to attachments alone.
 */
export function shipmentFilePath(owner: FileOwner, fileId: string, contentType: string): string {
  const ext = extensionFor(contentType);
  return owner.kind === "deal"
    ? `files/deal/${owner.matchedOrderId}/${fileId}.${ext}`
    : `files/group/${owner.groupId}/${fileId}.${ext}`;
}

/** Can the viewer see this inline, or is download the only option? */
export function isPreviewable(contentType: string): boolean {
  return contentType === "application/pdf" || contentType.startsWith("image/");
}

/**
 * Reject a file before it is uploaded, naming the actual limit. Returns null
 * when the file is acceptable.
 */
export function rejectFile(file: { type: string; size: number }): string | null {
  if (!ALLOWED_FILE_TYPES.includes(file.type as (typeof ALLOWED_FILE_TYPES)[number])) {
    return "Only PDF, JPEG and PNG files can be attached.";
  }
  if (file.size > MAX_FILE_BYTES) {
    return `That file is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_FILE_BYTES)}.`;
  }
  if (file.size === 0) {
    return "That file is empty.";
  }
  return null;
}

/** Human file size for the grid's Size column and the over-limit message. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
}
