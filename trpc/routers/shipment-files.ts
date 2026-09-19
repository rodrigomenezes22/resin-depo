// =============================================================================
// Shipment Files router — attachments on a deal or a booking
// =============================================================================
// Ports legacy's `Shipment_Files` panel. Serves two surfaces from one table:
// Bank → Transaction Details (owner = matched order) and Bank → Export
// Shipments detail (owner = shipment group). Every procedure is `admin:view`,
// matching the rest of both sections.
//
// UPLOAD ORDER IS DELIBERATE, AND INVERTED FROM THE COST SHEETS. The cost
// drawers (components/inventory/lot-forms.tsx, export-shipments/detail/
// add-cost-sheet.tsx) create the row FIRST and attach the storage path after,
// so a failed upload cannot cost the desk the cost figure it just typed. Here
// the file IS the record — a row with no object behind it is a broken grid line
// nobody can open — so the client uploads first and `create` records where it
// landed. The trade is an orphaned object if `create` then fails, which is
// invisible and harmless, rather than an orphaned row, which is neither.
//
// The path is therefore composed CLIENT-side (lib/shipment-files.ts) and this
// router only writes it down. That mirrors `inventory.attachInvoiceDocument`
// and the comment at export-shipments.ts:712-715: the bucket's RLS policies are
// the actual guard on what may be written where, not a server-side path check.
// =============================================================================

import { TRPCError } from "@trpc/server";

import type { Database } from "@/lib/supabase/database.types";
import { z } from "zod";

import { createTRPCRouter, requirePermission } from "../init";

/** Exactly one owner, mirroring the table's `shipment_files_one_owner` CHECK. */
const ownerInput = z
  .object({
    matchedOrderId: z.string().uuid().optional(),
    shipmentGroupId: z.string().uuid().optional(),
  })
  .refine(
    (v) => Boolean(v.matchedOrderId) !== Boolean(v.shipmentGroupId),
    "Provide exactly one of matchedOrderId or shipmentGroupId.",
  );

// One string LITERAL, deliberately: supabase-js parses the select list at the
// TYPE level, so a concatenated constant degrades every column to
// GenericStringError and the card loses all its fields.
const SELECT =
  "id, matched_order_id, shipment_group_id, file_name, description, storage_path, content_type, size_bytes, buyer_access, seller_access, created_at, updated_at, uploader:user_profiles!shipment_files_created_by_fkey(first_name, last_name)";

export const shipmentFilesRouter = createTRPCRouter({
  /** Files attached to one deal or one booking, newest first. */
  list: requirePermission("admin:view")
    .input(ownerInput)
    .query(async ({ ctx, input }) => {
      let q = ctx.db.from("shipment_files").select(SELECT);
      q = input.matchedOrderId
        ? q.eq("matched_order_id", input.matchedOrderId)
        : q.eq("shipment_group_id", input.shipmentGroupId!);

      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data ?? [];
    }),

  /**
   * Record a file the client has already uploaded.
   *
   * `id` comes from the caller because the storage path is keyed by it — the
   * object is written before this row exists, so the id cannot be minted here.
   */
  create: requirePermission("admin:view")
    .input(
      ownerInput.and(
        z.object({
          id: z.string().uuid(),
          fileName: z.string().trim().min(1).max(255),
          description: z.string().trim().max(500).optional(),
          storagePath: z.string().trim().min(1),
          contentType: z.string().trim().min(1),
          sizeBytes: z.number().int().positive(),
          buyerAccess: z.boolean().default(false),
          sellerAccess: z.boolean().default(false),
        }),
      ),
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.db
        .from("shipment_files")
        .insert({
          id: input.id,
          matched_order_id: input.matchedOrderId ?? null,
          shipment_group_id: input.shipmentGroupId ?? null,
          file_name: input.fileName,
          description: input.description?.trim() || null,
          storage_path: input.storagePath,
          content_type: input.contentType,
          size_bytes: input.sizeBytes,
          buyer_access: input.buyerAccess,
          seller_access: input.sellerAccess,
          created_by: ctx.claims.sub,
        })
        .select("id")
        .single();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data;
    }),

  /**
   * Edit a file's metadata, and optionally point it at a replacement object.
   *
   * Replacing is two writes the client sequences: it uploads the new object,
   * then calls this with the new path/type/size. When the replacement lands at
   * a DIFFERENT path (a PDF swapped for a PNG), the old object is now
   * unreferenced — the caller removes it, and `previousPath` is returned so it
   * knows which one to remove without having re-read the row first.
   */
  update: requirePermission("admin:view")
    .input(
      z.object({
        id: z.string().uuid(),
        fileName: z.string().trim().min(1).max(255).optional(),
        description: z.string().trim().max(500).nullable().optional(),
        buyerAccess: z.boolean().optional(),
        sellerAccess: z.boolean().optional(),
        storagePath: z.string().trim().min(1).optional(),
        contentType: z.string().trim().min(1).optional(),
        sizeBytes: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...f } = input;

      // Replacement is all-or-nothing: a new path without its type and size
      // would leave the row describing the file it no longer points at.
      const replacing = [f.storagePath, f.contentType, f.sizeBytes].filter(
        (v) => v !== undefined,
      ).length;
      if (replacing !== 0 && replacing !== 3) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Replacing a file requires storagePath, contentType and sizeBytes together.",
        });
      }

      const { data: before, error: readErr } = await ctx.db
        .from("shipment_files")
        .select("storage_path")
        .eq("id", id)
        .maybeSingle();
      if (readErr) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: readErr.message });
      if (!before) throw new TRPCError({ code: "NOT_FOUND", message: "That file is gone." });

      const patch: Database["public"]["Tables"]["shipment_files"]["Update"] = {};
      if (f.fileName !== undefined) patch.file_name = f.fileName;
      if (f.description !== undefined) patch.description = f.description?.trim() || null;
      if (f.buyerAccess !== undefined) patch.buyer_access = f.buyerAccess;
      if (f.sellerAccess !== undefined) patch.seller_access = f.sellerAccess;
      if (f.storagePath !== undefined) patch.storage_path = f.storagePath;
      if (f.contentType !== undefined) patch.content_type = f.contentType;
      if (f.sizeBytes !== undefined) patch.size_bytes = f.sizeBytes;

      if (Object.keys(patch).length === 0) return { previousPath: before.storage_path };

      const { error } = await ctx.db.from("shipment_files").update(patch).eq("id", id);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      return { previousPath: before.storage_path };
    }),

  /**
   * Forget a file. Returns its path so the caller can delete the object too —
   * the row and the object are separate stores and nothing joins them, so a
   * removal that dropped only the row would leave the bucket accumulating
   * material nobody can reach or account for.
   */
  remove: requirePermission("admin:view")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.db
        .from("shipment_files")
        .delete()
        .eq("id", input.id)
        .select("storage_path")
        .maybeSingle();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "That file is already gone." });
      return { storagePath: data.storage_path };
    }),
});
