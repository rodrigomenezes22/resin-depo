// Create (or reset) a confirmed admin user via the Supabase Admin API.
//
//   pnpm admin:seed                         # admin@tpe.dev / testpassword123
//   pnpm admin:seed you@example.com secret  # custom credentials
//
// Needs SUPABASE_SECRET_KEY (Project Settings → API Keys → secret key, sb_secret_…)
// or the legacy SUPABASE_SERVICE_ROLE_KEY
// in .env.local. Never expose that key to the browser.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const file of [".env", ".env.local"]) {
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined)
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* file optional */
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Either key format works for the Admin API: the new sb_secret_… key or the
// legacy service_role JWT.
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL, or SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY, in .env.local",
  );
  process.exit(1);
}

const [email = "admin@tpe.dev", password = "testpassword123"] = process.argv.slice(2);

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: created, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { role: "admin" },
});

if (!error) {
  console.log(`Created ${email} (${created.user.id})`);
} else if (error.code !== "email_exists") {
  fail(`Failed to create ${email}: ${error.message}`);
} else {
  // Already exists — reset the password and make sure the email is confirmed.
  const { data: list, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listError) fail(listError.message);
  const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!existing) fail(`User ${email} reported as existing but not found`);
  const { error: updateError } = await supabase.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
  });
  if (updateError) fail(updateError.message);
  console.log(`Updated ${email} (${existing.id}) — password reset, email confirmed`);
}

// No process.exit() on success: exiting while the fetch socket is still closing
// trips a libuv assertion on Windows. Let the event loop drain instead.
function fail(message) {
  console.error(message);
  process.exitCode = 1;
  throw new Error(message);
}
