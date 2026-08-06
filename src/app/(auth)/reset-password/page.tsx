"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/components/i18n-provider";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getSession().then(({ data }) => {
      if (!data.session) setError(t("auth.invalidResetLink"));
    });
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (password.length < 8) return setError(t("auth.passwordMin"));
    if (password !== confirmation) return setError(t("auth.passwordMismatch"));
    setSaving(true);
    const { error: updateError } = await createClient().auth.updateUser({ password });
    setSaving(false);
    if (updateError) return setError(t("auth.passwordUpdateFailed"));
    setMessage(t("auth.passwordUpdated"));
    await createClient().auth.signOut();
    setTimeout(() => router.push("/login"), 1200);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-sm shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-slate-900">{t("auth.setPassword")}</CardTitle>
          <p className="text-sm text-slate-500">{t("auth.setPasswordDescription")}</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="password">{t("auth.newPassword")}</Label><Input id="password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={saving} /></div>
            <div className="space-y-2"><Label htmlFor="confirmation">{t("auth.confirmPassword")}</Label><Input id="confirmation" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required disabled={saving} /></div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {message && <p className="text-sm text-emerald-600">{message}</p>}
            <Button type="submit" className="w-full bg-blue-600 font-bold text-white hover:bg-blue-700" disabled={saving}>{saving ? t("auth.saving") : t("auth.savePassword")}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
