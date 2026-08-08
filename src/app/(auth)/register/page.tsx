"use client";

import { FormEvent, useEffect, useState, useActionState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { requestRegisterOtp, verifyEmailOtp, logout } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/components/i18n-provider";
import { Shield, Loader2, LogOut } from "lucide-react";
import Link from "next/link";

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [session, setSession] = useState<any>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { t } = useI18n();

  const [registerState, registerAction, isRegisterPending] = useActionState(requestRegisterOtp, null);
  const [verifyState, verifyAction, isVerifyPending] = useActionState(verifyEmailOtp, null);
  const otpSent = Boolean(registerState?.email);

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsChecking(false);
    });
  }, []);

  async function handleSetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (password.length < 8) {
      return setError(t("auth.passwordMin"));
    }
    if (password !== confirmation) {
      return setError(t("auth.passwordMismatch"));
    }

    setSaving(true);
    const { error: updateError } = await createClient().auth.updateUser({ 
      password 
    });
    
    setSaving(false);

    if (updateError) {
      return setError(t("auth.passwordUpdateFailed"));
    }

    setMessage(t("auth.passwordUpdated"));
    
    // Redirect ke onboarding atau dashboard setelah beberapa saat
    setTimeout(() => {
      router.push("/dashboard");
    }, 1500);
  }

  if (isChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <Loader2 className="size-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // Jika sudah punya akun/session, beri tahu user untuk logout dulu jika ingin daftar baru
  // KECUALI jika ada parameter 'next' yang menandakan alur undangan (invitation flow)
  const isInvitation = searchParams.has("next");

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-sm shadow-sm">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
            <Shield className="h-6 w-6 text-blue-600" />
          </div>
          <CardTitle className="text-xl font-bold text-slate-900">
            {session ? t("auth.welcome") : t("auth.signUp")}
          </CardTitle>
          <p className="text-sm text-slate-500">
            {session ? t("auth.registerDescription") : t("auth.signUpDescription")}
          </p>
        </CardHeader>
        <CardContent>
          {session ? (
            <div className="space-y-6">
              {isInvitation ? (
                <form onSubmit={handleSetPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="password">{t("auth.newPassword")}</Label>
                    <Input
                      id="password"
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      disabled={saving}
                      placeholder={t("auth.passwordMin")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmation">{t("auth.confirmPassword")}</Label>
                    <Input
                      id="confirmation"
                      type="password"
                      autoComplete="new-password"
                      value={confirmation}
                      onChange={(event) => setConfirmation(event.target.value)}
                      required
                      disabled={saving}
                      placeholder={t("auth.confirmPassword")}
                    />
                  </div>

                  {error && (
                    <p className="text-sm text-destructive bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                      {error}
                    </p>
                  )}
                  {message && (
                    <p className="text-sm text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                      {message}
                    </p>
                  )}

                  <Button
                    type="submit"
                    className="w-full bg-blue-600 font-bold text-white hover:bg-blue-700"
                    disabled={saving}
                  >
                    {saving ? t("auth.saving") : t("auth.saveAndEnter")}
                  </Button>
                </form>
              ) : (
                <div className="space-y-4 text-center">
                  <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl text-blue-800 text-sm leading-relaxed">
                    Anda sudah masuk sebagai <br />
                    <strong className="text-blue-900">{session.user.email}</strong>.<br /><br />
                    Silakan keluar terlebih dahulu jika ingin mendaftarkan akun baru.
                  </div>
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => logout()}
                  >
                    <LogOut className="mr-2 size-4" />
                    Keluar Sekarang
                  </Button>
                  <Button 
                    asChild
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold"
                  >
                    <Link href="/dashboard">Lanjut ke Dashboard</Link>
                  </Button>
                </div>
              )}
            </div>
          ) : otpSent ? (
            <div className="space-y-4">
              {verifyState?.error && (
                <p className="text-sm text-destructive bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {verifyState.error}
                </p>
              )}
              {verifyState?.message && (
                <p className="text-sm text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                  {verifyState.message}
                </p>
              )}
              <p className="text-sm text-slate-600">
                Masukkan kode 6 digit yang dikirim ke{" "}
                <strong className="text-slate-900">{registerState!.email}</strong> untuk membuat akun Anda.
              </p>
              <form action={verifyAction} className="space-y-4">
                <input type="hidden" name="email" value={registerState!.email} />
                <input type="hidden" name="next" value="/onboarding/organization" />
                <div className="space-y-2">
                  <Label htmlFor="token">Kode OTP</Label>
                  <Input
                    id="token"
                    name="token"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    minLength={6}
                    maxLength={6}
                    placeholder="Kode 6 digit"
                    required
                    autoComplete="one-time-code"
                    disabled={isVerifyPending}
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full bg-blue-600 font-bold text-white hover:bg-blue-700"
                  disabled={isVerifyPending}
                >
                  {isVerifyPending ? t("auth.saving") : "Verifikasi & Buat Akun"}
                </Button>
              </form>
              <div className="text-center">
                <a href="/register" className="text-xs font-medium text-slate-500 hover:text-blue-600">
                  Gunakan email lain
                </a>
              </div>
            </div>
          ) : (
            <form action={registerAction} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t("auth.fullName")}</Label>
                <Input
                  id="name"
                  name="name"
                  type="text"
                  placeholder={t("auth.fullNamePlaceholder")}
                  required
                  disabled={isRegisterPending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">{t("settings.email")}</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="nama@perusahaan.com"
                  required
                  disabled={isRegisterPending}
                />
              </div>

              {registerState?.error && (
                <p className="text-sm text-destructive bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {registerState.error}
                </p>
              )}

              <Button
                type="submit"
                className="w-full bg-blue-600 font-bold text-white hover:bg-blue-700"
                disabled={isRegisterPending}
              >
                {isRegisterPending ? t("auth.saving") : "Kirim Kode Verifikasi"}
              </Button>
            </form>
          )}
        </CardContent>
        <CardFooter className="justify-center border-t bg-slate-50/50 py-4">
          <Link
            href="/login"
            className="relative z-10 text-xs font-medium text-slate-500 hover:text-blue-600 transition-colors"
          >
            {session ? "Bukan akun Anda?" : t("auth.hasAccount")}{" "}
            <span className="font-semibold text-blue-600 underline-offset-4 hover:underline">
              {session ? "Masuk dengan akun lain" : t("auth.loginNow")}
            </span>
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <Loader2 className="size-8 animate-spin text-blue-600" />
      </div>
    }>
      <RegisterContent />
    </Suspense>
  );
}
