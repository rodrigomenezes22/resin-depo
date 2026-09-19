// =============================================================================
// GET /api/shipment-documents/:documentId/pdf
// =============================================================================
// The PDF is served from a route handler rather than a tRPC procedure on
// purpose: httpBatchLink + superjson would base64 a few hundred KB of binary
// into a JSON batch envelope.
//
// Two paths:
//
//   1. `generated_path` is set → signed URL, 302. A document fetched a year
//      later is BYTE-IDENTICAL, because it was rendered once from a frozen
//      payload and stored.
//   2. Not yet rendered → parse the payload with the same Zod schema that types
//      the template, render, upload with the CALLER'S client so bucket RLS
//      applies, record the path, and stream it back.
//
// Drafts deliberately re-render every time (nothing is stored until issue), so
// editing a draft always shows the current text.
// =============================================================================

import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";

import { renderShipmentDocument } from "@/lib/pdf/render";
import {
  BUILT_DOC_TYPES,
  payloadSchemaFor,
  type ShipmentDocStatus,
} from "@/lib/export-shipment/documents/types";
import { createClient } from "@/lib/supabase/server";

// @react-pdf/renderer needs Node APIs — it must never be edge.
export const runtime = "nodejs";

const BUCKET = "shipment-documents";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;
  const db = await createClient();

  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // RLS on shipment_documents already restricts this to staff — an unauthorized
  // reader simply sees no row, so there is no separate role check to drift.
  const { data: doc } = await db
    .from("shipment_documents")
    .select(
      "id, shipment_group_id, doc_type, status, document_number, payload, generated_path, void_reason",
    )
    .eq("id", documentId)
    .maybeSingle();

  if (!doc) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  // --- already rendered: serve the stored artifact ---------------------------
  if (doc.generated_path && doc.status !== "draft") {
    const { data: signed } = await db.storage
      .from(BUCKET)
      .createSignedUrl(doc.generated_path, 3600);
    if (signed?.signedUrl) return NextResponse.redirect(signed.signedUrl);
    // Fall through and re-render if the object went missing — the payload is
    // the record, so the PDF is always reproducible.
  }

  if (!BUILT_DOC_TYPES.includes(doc.doc_type)) {
    return NextResponse.json(
      { error: `${doc.doc_type.replace(/_/g, " ")} PDFs are not built yet.` },
      { status: 501 },
    );
  }

  // Parse with the SAME schema that types the template, then render. A payload
  // that cannot satisfy the schema is not rendered at all — the alternative is
  // a PDF with holes in it going to a bank.
  const status = doc.status as ShipmentDocStatus;
  const parsed = payloadSchemaFor(doc.doc_type).safeParse(doc.payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "This document is incomplete and cannot be rendered.",
        missing: parsed.error.issues.map((i) => i.path.join(".")).slice(0, 10),
      },
      { status: 422 },
    );
  }

  // Dispatch has no fallback on purpose (`lib/pdf/render.tsx`) — an unhandled
  // doc_type must fail loudly, never render as whatever the last branch was.
  const buffer = await renderToBuffer(
    renderShipmentDocument(doc.doc_type, parsed.data, {
      status,
      voidReason: doc.void_reason,
    }),
  );

  // Store issued documents so every later fetch is byte-identical. Drafts are
  // ephemeral by design: they still change.
  if (doc.status !== "draft") {
    const path = `${doc.shipment_group_id}/${doc.document_number}.pdf`;
    const { error: uploadError } = await db.storage
      .from(BUCKET)
      .upload(path, buffer, { upsert: true, contentType: "application/pdf" });
    if (!uploadError) {
      await db.from("shipment_documents").update({ generated_path: path }).eq("id", doc.id);
    }
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${doc.document_number}.pdf"`,
      // Drafts change; issued documents never do.
      "Cache-Control": doc.status === "draft" ? "no-store" : "private, max-age=3600",
    },
  });
}
