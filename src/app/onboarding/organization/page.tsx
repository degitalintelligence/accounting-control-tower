"use client";

import { useState } from "react";
import { Building2, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/stores/auth-store";

export default function OrganizationOnboardingPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch("/api/organizations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, slug }) });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setError(body?.error ?? "Organisasi gagal dibuat.");
      setBusy(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  function changeName(value: string) {
    setName(value);
    if (!slug || slug === name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")) setSlug(value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
  }

  return <main className="page-canvas flex min-h-[calc(100vh-5rem)] items-center justify-center px-4"><Card className="w-full max-w-2xl shadow-sm"><CardHeader className="space-y-3"><div className="flex size-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Building2 className="size-6" /></div><CardTitle className="text-2xl text-slate-950">Buat ruang kerja baru</CardTitle><p className="text-sm leading-6 text-slate-500">{user?.email ? `Ruang kerja untuk ${user.email}.` : "Satu ruang kerja untuk mengatur tim, pekerjaan, kontrol, dan audit operasional Anda."}</p></CardHeader><CardContent><div className="mb-6 grid gap-3 sm:grid-cols-3"><Benefit icon={ShieldCheck} text="Role Owner otomatis" /><Benefit icon={CheckCircle2} text="Permission siap pakai" /><Benefit icon={Building2} text="Tenant terisolasi" /></div><form onSubmit={submit} className="space-y-5"><div className="space-y-2"><Label htmlFor="organization-name">Nama organisasi</Label><Input id="organization-name" value={name} onChange={(event) => changeName(event.target.value)} placeholder="Contoh: Tim Operasi Nusantara" required minLength={2} maxLength={120} /></div><div className="space-y-2"><Label htmlFor="organization-slug">Alamat workspace</Label><div className="flex items-center rounded-md border border-slate-200 bg-slate-50 focus-within:ring-2 focus-within:ring-blue-200"><span className="pl-3 text-sm text-slate-400">opscontrol/</span><Input id="organization-slug" value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase())} className="border-0 bg-transparent focus-visible:ring-0" placeholder="lolosats-finance" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={80} /></div><p className="text-xs text-slate-500">Gunakan huruf kecil, angka, dan tanda hubung.</p></div>{error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}<div className="flex justify-end"><Button type="submit" className="cta-primary" disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Building2 className="size-4" />}{busy ? "Menyiapkan workspace..." : "Buat workspace"}</Button></div></form></CardContent></Card></main>;
}

function Benefit({ icon: Icon, text }: { icon: typeof Building2; text: string }) { return <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><Icon className="size-4 text-blue-600" /><p className="mt-2 text-xs font-semibold text-slate-700">{text}</p></div>; }
