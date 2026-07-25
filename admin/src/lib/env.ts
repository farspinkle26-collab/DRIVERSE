// Centralised, server-only environment access. Importing this from a client
// component will throw at build/runtime — these secrets must never reach the
// browser.
import "server-only";

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) {
    throw new Error(
      `Missing required environment variable: ${name}. See admin/.env.example.`,
    );
  }
  return v;
}

export const env = {
  supabaseUrl: () => required("SUPABASE_URL"),
  supabaseServiceKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  adminPassword: () => required("ADMIN_PASSWORD"),
  sessionSecret: () =>
    process.env.ADMIN_SESSION_SECRET || required("ADMIN_PASSWORD"),
};
