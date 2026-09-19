import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Written by `supabase start` (gitignored): the bundled edge-runtime entry
    // point, minified onto one line. Linting it produces ~150 phantom errors.
    "supabase/.temp/**",
  ]),
]);

export default eslintConfig;
