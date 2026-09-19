import { initTRPC, TRPCError } from "@trpc/server";
import { cache } from "react";
import superjson from "superjson";
import { z, ZodError } from "zod";
import type { JwtPayload } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  hasAllPermissions,
  type Permission,
  type PlatformRole,
} from "@/lib/navigation/permissions";

export interface TRPCContext {
  claims: JwtPayload | null;
  db: Awaited<ReturnType<typeof createClient>>;
}

export const createTRPCContext = cache(async (): Promise<TRPCContext> => {
  const db = await createClient();
  const { data } = await db.auth.getClaims();

  return { claims: data?.claims ?? null, db };
});

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter: ({ shape, error }) => ({
    ...shape,
    data: {
      ...shape.data,
      zodError: error.cause instanceof ZodError ? z.treeifyError(error.cause) : null,
    },
  }),
});

// Base router and procedure helpers
export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;

/**
 * Public procedure — no auth required.
 * `ctx.claims` may be `null`.
 */
export const baseProcedure = t.procedure;

/**
 * Protected procedure — requires an authenticated user.
 * Throws UNAUTHORIZED if no valid claims.
 * `ctx.claims` is narrowed to non-null `JwtPayload`.
 */
export const protectedProcedure = baseProcedure.use(async ({ ctx, next }) => {
  if (!ctx.claims) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return next({
    ctx: { ...ctx, claims: ctx.claims },
  });
});

/**
 * Build a procedure that requires the caller's role to grant ALL of the
 * given permissions.
 *
 * Throws UNAUTHORIZED if the caller is unauthenticated, FORBIDDEN if they
 * are authenticated but missing any required permission. The procedure's
 * context includes `role: PlatformRole` for downstream use.
 *
 * @example
 * ```ts
 * delete: requirePermission("orders:delete").input(...).mutation(...)
 * ```
 */
export function requirePermission(...permissions: readonly Permission[]) {
  return protectedProcedure.use(async ({ ctx, next }) => {
    const { data: profile } = await ctx.db
      .from("user_profiles")
      .select("platform_role")
      .eq("id", ctx.claims.sub)
      .single();

    const role = (profile?.platform_role as PlatformRole | undefined) ?? "admin";

    if (!hasAllPermissions(role, permissions)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Missing required permission${permissions.length > 1 ? "s" : ""}: ${permissions.join(", ")}`,
      });
    }

    return next({ ctx: { ...ctx, role } });
  });
}
