"use client";

import { useActionState, useState } from "react";
import { login, requestEmailOtp, verifyEmailOtp } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import { useI18n } from "@/components/i18n-provider";

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(loginAction, null);
  const [otpState, otpAction, isOtpPending] = useActionState(requestEmailOtp, null);
  const [verifyState, verifyAction, isVerifyPending] = useActionState(verifyEmailOtp, null);
  const [otpRequested, setOtpRequested] = useState(false);
  const { t } = useI18n();

  async function loginAction(_prevState: unknown, formData: FormData) {
    return await login(formData);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-sm shadow-sm">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
            <Shield className="h-6 w-6 text-blue-600" />
          </div>
          <CardTitle className="text-xl font-bold text-slate-900">
            Operations Control Tower
          </CardTitle>
          <p className="text-sm text-slate-500">
            Masuk untuk mengelola operasi tim
          </p>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="nama@perusahaan.com"
                required
                autoComplete="email"
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="Masukkan password"
                required
                autoComplete="current-password"
                disabled={isPending}
              />
            </div>

            {state?.error && (
              <p className="text-sm text-destructive">{state.error}</p>
            )}

            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold"
              disabled={isPending}
            >
              {isPending ? "Masuk..." : "Masuk"}
            </Button>
          </form>
          <Separator className="my-6" />
          {!otpRequested ? (
            <form action={(formData) => { setOtpRequested(true); otpAction(formData); }} className="space-y-3">
              <p className="text-sm text-slate-600">Masuk tanpa password menggunakan kode sekali pakai ke email.</p>
              <Input name="email" type="email" placeholder="nama@perusahaan.com" required autoComplete="email" disabled={isOtpPending} aria-label="Email untuk kode OTP" />
              {otpState?.error && <p className="text-sm text-destructive">{otpState.error}</p>}
              <Button type="submit" variant="outline" className="w-full" disabled={isOtpPending}>
                {isOtpPending ? "Mengirim kode..." : "Kirim kode ke email"}
              </Button>
            </form>
          ) : (
            <form action={verifyAction} className="space-y-3">
              <p className="text-sm text-slate-600">{otpState?.message ?? "Masukkan kode yang dikirim ke email Anda."}</p>
              <Input name="email" type="email" defaultValue={otpState?.email} required autoComplete="email" disabled={isVerifyPending} aria-label="Email OTP" />
              <Input name="token" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} placeholder="Kode 6 digit" required autoComplete="one-time-code" disabled={isVerifyPending} aria-label="Kode OTP" />
              <input type="hidden" name="next" value="/dashboard" />
              {verifyState?.error && <p className="text-sm text-destructive">{verifyState.error}</p>}
              <Button type="submit" className="w-full bg-blue-600 font-bold text-white hover:bg-blue-700" disabled={isVerifyPending}>
                {isVerifyPending ? "Memverifikasi..." : "Verifikasi dan masuk"}
              </Button>
            </form>
          )}
        </CardContent>
        <CardFooter className="justify-center border-t bg-slate-50/50 py-4">
          <Link
            href="/register"
            className="relative z-10 text-xs font-medium text-slate-500 hover:text-blue-600 transition-colors"
          >
            {t("auth.noAccount")}{" "}
            <span className="font-semibold text-blue-600 underline-offset-4 hover:underline">
              {t("auth.registerNow")}
            </span>
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
