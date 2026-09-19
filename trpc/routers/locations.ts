// =============================================================================
// Locations router — the `list` procedure of TPE's trpc/routers/locations.ts
// =============================================================================
// Kept under the same router name and signature because the copied export UI
// calls `ClientAPI.locations.list({ kinds: ["port"] })` (booking card). The
// rest of TPE's locations router (address books, deal points, directory
// mutations) is not needed; port CRUD lives in trpc/routers/reference.ts.
// =============================================================================

import { z } from "zod";

import { listLocations } from "@/lib/locations/queries";
import { LOCATION_KINDS, LOCATION_ROLES } from "@/lib/locations/types";

import { createTRPCRouter, requirePermission } from "../init";

const kindSchema = z.enum(LOCATION_KINDS);
const roleSchema = z.enum(LOCATION_ROLES);

export const locationsRouter = createTRPCRouter({
  list: requirePermission("orders:view")
    .input(
      z
        .object({
          kinds: z.array(kindSchema).optional(),
          includeDeactivated: z.boolean().optional(),
          preferOrg: z
            .object({
              organizationId: z.string().uuid(),
              role: roleSchema.optional(),
            })
            .optional(),
        })
        .optional(),
    )
    .query(({ ctx, input }) =>
      listLocations(ctx.db, {
        kinds: input?.kinds,
        includeDeactivated: input?.includeDeactivated,
        preferOrg: input?.preferOrg,
      }),
    ),
});
