import { timingSafeEqual } from "node:crypto";

export type ServerEnvName =
  | "NEXT_PUBLIC_SUPABASE_URL"
  | "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  | "SUPABASE_SERVICE_ROLE_KEY"
  | "NEXT_PUBLIC_APP_URL"
  | "CRON_SECRET"
  | "OPENROUTER_API_KEY"
  | "OPENROUTER_MODEL"
  | "RESEND_API_KEY"
  | "RESEND_FROM_EMAIL"
  | "WAHA_BASE_URL"
  | "WAHA_SESSION"
  | "WAHA_WEBHOOK_TOKEN";

export type ServerEnvValidation = {
  ok: boolean;
  missing: ServerEnvName[];
  invalid: ServerEnvName[];
};

export function validateServerEnv(names: readonly ServerEnvName[]): ServerEnvValidation {
  const missing = names.filter((name) => !process.env[name]);
  const invalid = names.filter((name) => {
    const value = process.env[name];
    if (!value || !["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_APP_URL"].includes(name)) return false;
    try {
      const url = new URL(value);
      return url.protocol !== "https:" && process.env.NODE_ENV === "production";
    } catch {
      return true;
    }
  });
  return { ok: missing.length === 0 && invalid.length === 0, missing, invalid };
}

export const productionRequiredEnv: readonly ServerEnvName[] = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_APP_URL",
  "CRON_SECRET",
];

export function validateProductionEnv() {
  return validateServerEnv(productionRequiredEnv);
}

export function getRequiredServerEnv(name: ServerEnvName): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required server environment variable: ${name}`);
  return value;
}

export function isCronRequestAuthorized(authorization: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return "misconfigured" as const;
  if (!authorization?.startsWith("Bearer ")) return "unauthorized" as const;

  const provided = authorization.slice(7);
  if (provided.length !== secret.length) return "unauthorized" as const;

  return timingSafeEqual(Buffer.from(provided), Buffer.from(secret))
    ? "authorized" as const
    : "unauthorized" as const;
}
