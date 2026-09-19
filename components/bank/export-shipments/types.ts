// Row types inferred from the procedures, so the sections cannot drift from
// `exportShipments.detail`'s select list — the same trick as
// components/bank/transaction-detail/types.ts.

import type { inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "@/trpc/routers/_app";

type RouterOutputs = inferRouterOutputs<AppRouter>;

/** One shipment as the detail page sees it: booking + manifest + timeline. */
export type ShipmentGroupRow = NonNullable<RouterOutputs["exportShipments"]["detail"]>;

export type ShipmentContainerRow = ShipmentGroupRow["containers"][number];
export type ShipmentEventRow = ShipmentGroupRow["events"][number];

/** One row of the Documents card's table. */
export type ShipmentDocumentRow = RouterOutputs["exportShipments"]["documents"][number];

/** A transaction eligible to join a shipment (mirrors the DB guard). */
export type GroupableTransaction = RouterOutputs["exportShipments"]["groupable"][number];
