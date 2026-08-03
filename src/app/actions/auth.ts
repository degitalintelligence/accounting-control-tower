"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { consumeRateLimit, getClientAddress } from "@/lib/rate-limit";

export type AuthActionState = {
  error?: string;
  message?: string;
  email?: string;
} | null;

const GENERIC_AUTH_ERROR = "Email atau kode tidak valid.";

function getSafeNext(value: FormDataEntryValue | null) {
  return typeof value === "string" && /^\/(?!\/)[a-zA-Z0-9/_-]*(?:\?[a-zA-Z0-9=&_%-]*)?$/.test(value)
    ? value
    : "/dashboard";
}

function getAppUrl(path: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) throw new Error("NEXT_PUBLIC_APP_URL belum dikonfigurasi.");
  return new URL(path, appUrl).toString();
}

async function hasActiveMembership(userId: string) {
  const { createServiceRoleClient } = await import("@/lib/supabase/server");
  const admin = createServiceRoleClient();
  const result = await admin
    .from("memberships")
    .select("id")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .limit(1);
  return Boolean(result.data?.length && !result.error);
}

export async function login(formData: FormData) {
  const requestHeaders = await headers();
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email dan password wajib diisi." };
  }

  const address = getClientAddress(requestHeaders);
  const decision = consumeRateLimit(`login:${address}:${email.trim().toLowerCase()}`, 8, 15 * 60_000);
  if (!decision.allowed) return { error: "Terlalu banyak percobaan login. Silakan coba lagi nanti." };

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: "Email atau password salah." };
  }

  const signedInUser = (await supabase.auth.getUser()).data.user;
  if (!(await hasActiveMembership(signedInUser?.id ?? ""))) redirect("/onboarding/organization");

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function requestEmailOtp(_previousState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const requestHeaders = await headers();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) return { error: "Email atau kode tidak valid." };

  const address = getClientAddress(requestHeaders);
  const decision = consumeRateLimit(`otp-request:${address}:${email}`, 5, 15 * 60_000);
  if (!decision.allowed) return { error: "Terlalu banyak permintaan kode. Silakan coba lagi nanti." };

  const supabase = await createClient();
  await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: getAppUrl("/auth/callback?next=/dashboard"),
    },
  });

  return {
    message: "Jika email terdaftar dan memiliki akses, kode login telah dikirim. Periksa inbox atau folder spam.",
    email,
  };
}

export async function verifyEmailOtp(_previousState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const requestHeaders = await headers();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("token") ?? "").trim();
  const next = getSafeNext(formData.get("next"));
  if (!email || !token) return { error: GENERIC_AUTH_ERROR, email };

  const address = getClientAddress(requestHeaders);
  const decision = consumeRateLimit(`otp-verify:${address}:${email}`, 8, 15 * 60_000);
  if (!decision.allowed) return { error: "Terlalu banyak percobaan kode. Silakan coba lagi nanti.", email };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error || !data.user) return { error: GENERIC_AUTH_ERROR, email };
  if (!(await hasActiveMembership(data.user.id))) redirect("/onboarding/organization");

  revalidatePath("/", "layout");
  redirect(next);
}

export async function logout() {
  const supabase = await createClient();

  await supabase.auth.signOut();

  revalidatePath("/", "layout");
  redirect("/login");
}
