import { z } from "zod";

/**
 * Which statuses a shipment may be OPENED in (REM-03).
 *
 * `shipment_groups.status` is a six-value enum covering the whole life of a
 * booking (draft → booked → sailed → arrived → closed, plus cancelled), and
 * `updateGroup` may move a shipment through all of it. But `createGroup` used
 * `.partial()` over the full enum, so a brand-new shipment could be born
 * `sailed` or `closed` — a booking that skipped its own history, with an
 * event log whose first entry contradicts its status.
 *
 * A new booking is either a draft the desk is still assembling, or already
 * booked with the carrier. Everything after that is a transition, and
 * transitions belong to `updateGroup`.
 *
 * Lives here, outside the router, so it is importable from a unit spec —
 * `trpc/routers/export-shipments.ts` pulls in `lib/supabase/server`, which is
 * `server-only` and cannot be imported from a test.
 */
export const CREATABLE_GROUP_STATUSES = ["draft", "booked"] as const;

/** Zod schema for a new shipment's initial status; used by `createGroup`. */
export const creatableGroupStatusSchema = z.enum(CREATABLE_GROUP_STATUSES);

export type CreatableGroupStatus = (typeof CREATABLE_GROUP_STATUSES)[number];
