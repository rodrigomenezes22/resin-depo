// =============================================================================
// Permissions — resin-depo's one-role reduction of TPE's RBAC
// =============================================================================
// TPE gates every export procedure with `requirePermission("admin:view")` and
// reads the caller's `user_profiles.platform_role`. That code is copied
// verbatim here, so this module keeps TPE's type names and function
// signature — but the policy collapses to "admins can do everything, nobody
// else exists". Every profile is created with platform_role = 'admin'
// (supabase/migrations/20260101000000_foundation.sql), so in practice a gate
// means "signed in".
//
// The PlatformRole union is TPE's full vocabulary on purpose: rows imported
// into TPE later must carry valid role literals.
// =============================================================================

export type PlatformRole =
  | "admin"
  | "broker_trader"
  | "external_broker"
  | "resin_processor"
  | "resin_producer"
  | "resin_analyst";

/** The subset of TPE permission keys referenced by code copied into this app. */
export type Permission = "admin:view" | "orders:view" | "inventory:view" | "orgs:manage";

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature kept TPE-compatible
export function hasPermission(role: PlatformRole, _permission: Permission): boolean {
  return role === "admin";
}

export function hasAllPermissions(role: PlatformRole, permissions: readonly Permission[]): boolean {
  return permissions.every((p) => hasPermission(role, p));
}
