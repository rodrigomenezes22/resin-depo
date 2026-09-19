import { createTRPCRouter, protectedProcedure } from "../init";
import { exportShipmentsRouter } from "./export-shipments";
import { locationsRouter } from "./locations";
import { referenceRouter } from "./reference";
import { shipmentFilesRouter } from "./shipment-files";

export const appRouter = createTRPCRouter({
  exportShipments: exportShipmentsRouter,
  locations: locationsRouter,
  reference: referenceRouter,
  shipmentFiles: shipmentFilesRouter,

  /** Current user — used by the shell header. */
  me: protectedProcedure.query(async ({ ctx }) => {
    const { data: profile } = await ctx.db
      .from("user_profiles")
      .select("first_name, last_name, platform_role")
      .eq("id", ctx.claims.sub)
      .single();

    return {
      id: ctx.claims.sub,
      email: ctx.claims.email ?? "",
      firstName: profile?.first_name ?? null,
      lastName: profile?.last_name ?? null,
      role: profile?.platform_role ?? "admin",
    };
  }),
});

export type AppRouter = typeof appRouter;
