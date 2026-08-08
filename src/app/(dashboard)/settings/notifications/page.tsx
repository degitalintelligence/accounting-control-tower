"use client";

import { useEffect, useState } from "react";
import { Bell, Info, Loader2, RefreshCw, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/components/i18n-provider";
import { AccessDenied, SettingsTabs } from "@/components/settings/settings-tabs";
import { usePermissions } from "@/hooks/use-permissions";

const fields = [
  ["email_enabled", "settings.emailEnabled"],
  ["email_on_assignment", "settings.emailAssignment"],
  ["email_on_status_change", "settings.emailStatusChange"],
  ["email_on_deadline", "settings.emailDeadline"],
  ["email_on_overdue", "settings.emailOverdue"],
  ["email_on_review", "settings.emailReview"],
] as const;

type Preferences = Record<(typeof fields)[number][0], boolean>;

export default function NotificationSettingsPage() {
  const { t } = useI18n();
  const { has } = usePermissions();
  const canView = has("workspace.view");
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function loadPreferences() { setError(null); try { const response = await fetch("/api/settings/notifications", { cache: "no-store" }); const body = await response.json().catch(() => null); if (!response.ok) throw new Error(body?.error ?? t("settings.notificationLoadFailed")); setPreferences(body.data); } catch (cause) { setError(cause instanceof Error ? cause.message : t("settings.notificationLoadFailed")); } }
  useEffect(() => { const timer = window.setTimeout(() => { if (canView) void loadPreferences(); else setPreferences({ email_enabled: false, email_on_assignment: false, email_on_status_change: false, email_on_deadline: false, email_on_overdue: false, email_on_review: false }); }, 0); return () => window.clearTimeout(timer); }, [canView]);
  async function save(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); if (!preferences) return; setSaving(true); setError(null); try { const response = await fetch("/api/settings/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(preferences) }); if (!response.ok) throw new Error(t("settings.notificationSaveFailed")); setMessage(t("settings.notificationSaved")); } catch (cause) { setError(cause instanceof Error ? cause.message : t("settings.notificationSaveFailed")); } finally { setSaving(false); } }

  if (!canView) return <main className="page-canvas text-slate-900"><div className="mx-auto w-full max-w-6xl space-y-6"><SettingsTabs /><AccessDenied /></div></main>;

  return <main className="page-canvas text-slate-900"><div className="mx-auto w-full max-w-6xl space-y-6">
    <SettingsTabs />
    <header aria-label={t("settings.notificationPreferences")}><div className="flex items-center gap-2 text-xs font-semibold text-blue-600"><Settings2 className="size-4" /> {t("settings.controlCenter")} <span className="text-slate-400">/</span> {t("settings.general")}</div><h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{t("settings.notificationPreferences")}</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">{t("settings.notificationDescription")}</p></header><div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]"><form onSubmit={save} className="surface-card rounded-2xl p-5 sm:p-6"><div className="mb-5 flex items-start gap-3 border-b border-slate-100 pb-5"><span className="rounded-xl bg-blue-50 p-2.5 text-blue-600"><Bell aria-hidden="true" className="size-5" /></span><div><h2 className="text-lg font-bold text-slate-950">{t("settings.emailNotifications")}</h2><p className="mt-1 text-sm text-slate-500">{t("settings.emailNotificationsDescription")}</p></div></div>{error && <div role="alert" className="mb-4 flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between"><span>{error}</span><Button type="button" variant="outline" onClick={() => void loadPreferences()} className="w-fit gap-2 border-red-200 bg-white text-red-700"><RefreshCw className="size-4" />{t("common.retry")}</Button></div>}{preferences ? <div className="divide-y divide-slate-100">{fields.map(([key, labelKey]) => <label key={key} className="flex cursor-pointer items-center justify-between gap-4 py-3.5 text-sm text-slate-700"><span>{t(labelKey as never)}</span><input type="checkbox" aria-label={t(labelKey as never)} checked={preferences[key]} onChange={(event) => setPreferences({ ...preferences, [key]: event.target.checked })} className="size-4 accent-blue-600" /></label>)}</div> : <div className="space-y-3">{fields.map(([key]) => <div key={key} className="flex items-center justify-between"><Skeleton className="h-4 w-48" /><Skeleton className="size-4" /></div>)}</div>}<div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5"><Button disabled={!preferences || saving} className="cta-primary">{saving && <Loader2 className="size-4 animate-spin" />}{t("settings.notificationSave")}</Button>{message && <span role="status" className="text-sm font-medium text-emerald-700">{message}</span>}</div></form><aside className="surface-card h-fit rounded-2xl p-5"><div className="flex items-center gap-2"><Info className="size-5 text-blue-600" /><h3 className="font-bold text-slate-950">{t("settings.importantSignals")}</h3></div><p className="mt-2 text-sm leading-6 text-slate-500">{t("settings.importantSignalsDescription")}</p></aside></div></div></main>;
}
