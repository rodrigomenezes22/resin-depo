import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - robots.txt / sitemap.xml — crawler policy files must be readable
     *   WITHOUT a session; before this exclusion, a signed-out GET of
     *   /robots.txt 307-redirected to /auth/login, so crawlers could never
     *   read the policy (caught by the @deployed smoke suite on staging)
     * - static assets - .svg, .png, .jpg, .jpeg, .gif, .webp, .pdf
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|pdf)$).*)",
  ],
};
