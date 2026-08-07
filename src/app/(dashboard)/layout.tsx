import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/authorization";
import { DashboardLayoutClient } from "./dashboard-layout-client";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const authorization = await getAuthContext();
  if (authorization.response) {
    if (authorization.response.status === 401) redirect("/login");
    if (authorization.response.status === 403) redirect("/onboarding/organization");
    throw new Error("Gagal memuat authorization context.");
  }

  return <DashboardLayoutClient>{children}</DashboardLayoutClient>;
}
