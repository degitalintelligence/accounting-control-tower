"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { consumeRateLimit } from "@/lib/rate-limit";

export async function login(formData: FormData) {
  const requestHeaders = await headers();
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email dan password wajib diisi." };
  }

  const address = requestHeaders.get("x-real-ip") ?? requestHeaders.get("x-forwarded-for")?.split(",", 1)[0]?.trim() ?? "unknown";
  const decision = consumeRateLimit(`login:${address}:${email.trim().toLowerCase()}`, 8, 15 * 60_000);
  if (!decision.allowed) return { error: "Terlalu banyak percobaan login. Silakan coba lagi nanti." };

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: "Email atau password salah." };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();

  await supabase.auth.signOut();

  revalidatePath("/", "layout");
  redirect("/login");
}
