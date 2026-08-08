"use client";

import { useEffect, useMemo, useState } from "react";
import { KeyRound, Loader2, Plus, RefreshCw, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n-provider";
import { AccessDenied, SettingsTabs } from "@/components/settings/settings-tabs";
import { usePermissions } from "@/hooks/use-permissions";

type Role = { id: string; role_key: string; name: string; description: string | null; is_system: boolean; is_active: boolean };
type Permission = { id: string; permission_key: string; name: string; description: string | null; category: string };
type RolePermission = { role_id: string; permission_id: string };

export default function RolesPage() {
  const { t } = useI18n();
  const { has } = usePermissions();
  const canView = has("roles.view");
  const canManage = has("roles.manage");
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState({ role_key: "", name: "", description: "" });
  const [createForm, setCreateForm] = useState({ role_key: "", name: "", description: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/settings/roles", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? t("settings.permissionLoadFailed"));
      const nextRoles = (body.roles ?? []) as Role[];
      setRoles(nextRoles);
      setPermissions(body.permissions ?? []);
      setRolePermissions(body.rolePermissions ?? []);
      setSelected((current) => {
        const nextSelected = current && nextRoles.some((role) => role.id === current) ? current : nextRoles[0]?.id ?? null;
        const nextRole = nextRoles.find((role) => role.id === nextSelected);
        if (nextRole) setForm({ role_key: nextRole.role_key, name: nextRole.name, description: nextRole.description ?? "" });
        return nextSelected;
      });
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("settings.permissionLoadFailed")); } finally { setLoading(false); }
  }
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, []);

  const current = roles.find((role) => role.id === selected) ?? null;
  const selectedPermissions = useMemo(() => new Set(rolePermissions.filter((item) => item.role_id === selected).map((item) => item.permission_id)), [rolePermissions, selected]);

  if (!canView) return <main className="page-canvas text-slate-900"><div className="mx-auto w-full max-w-6xl space-y-6"><SettingsTabs /><AccessDenied /></div></main>;
  const grouped = permissions.reduce<Record<string, Permission[]>>((result, permission) => { (result[permission.category] ??= []).push(permission); return result; }, {});
  function choose(role: Role) { setSelected(role.id); setForm({ role_key: role.role_key, name: role.name, description: role.description ?? "" }); setMessage(null); }
  async function save() {
    if (!current) return;
    setSaving(true); setError(null); setMessage(null);
    try { const response = await fetch("/api/settings/roles", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role_id: current.id, name: form.name, description: form.description || null, permission_ids: [...selectedPermissions] }) }); const body = await response.json(); if (!response.ok) throw new Error(body?.error ?? t("settings.roleSaveFailed")); setMessage(t("settings.permissionSaveSuccess")); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : t("settings.roleSaveFailed")); } finally { setSaving(false); }
  }
  async function createRole(event: React.FormEvent) { event.preventDefault(); setSaving(true); setError(null); try { const response = await fetch("/api/settings/roles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(createForm) }); const body = await response.json(); if (!response.ok) throw new Error(body?.error ?? t("settings.roleCreateFailed")); setCreateForm({ role_key: "", name: "", description: "" }); await load(); choose(body.data); } catch (cause) { setError(cause instanceof Error ? cause.message : t("settings.roleCreateFailed")); } finally { setSaving(false); } }
  function toggle(permissionId: string) { setRolePermissions((items) => selectedPermissions.has(permissionId) ? items.filter((item) => !(item.role_id === selected && item.permission_id === permissionId)) : [...items, { role_id: selected as string, permission_id: permissionId }]); }

  return (
    <main className="page-canvas text-slate-900">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <header>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-600">
            <KeyRound className="size-4" /> {t("settings.controlCenter")} <span className="text-slate-400">/</span> {t("settings.general")}
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{t("settings.rolesTitle")}</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">{t("settings.rolesDescription")}</p>
        </header>
        <SettingsTabs />
        {error && (
          <div role="alert" className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCw className="size-4" /> {t("common.retry")}
            </Button>
          </div>
        )}
        {message && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}
        {loading ? (
          <div className="h-80 animate-pulse rounded-2xl bg-white shadow-sm" />
        ) : (
          <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
            <section className="surface-card rounded-2xl p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-bold">{t("settings.workspaceRoles")}</h2>
                <Shield className="size-5 text-blue-600" />
              </div>
              <div className="space-y-1">
                {roles.map((role) => (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => choose(role)}
                    className={cn("w-full rounded-lg px-3 py-2 text-left text-sm", selected === role.id ? "bg-blue-50 font-semibold text-blue-800" : "hover:bg-slate-50")}
                  >
                    {role.name}
                    <span className="mt-0.5 block text-xs font-normal text-slate-500">{role.role_key}</span>
                  </button>
                ))}
              </div>
              {canManage && (
                <form onSubmit={createRole} className="mt-5 space-y-2 border-t border-slate-100 pt-4">
                  <p className="text-sm font-bold">{t("settings.addCustomRole")}</p>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder={t("settings.roleKeyPlaceholder")}
                    value={createForm.role_key}
                    onChange={(event) => setCreateForm({ ...createForm, role_key: event.target.value })}
                  />
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder={t("settings.roleNamePlaceholder")}
                    value={createForm.name}
                    onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })}
                  />
                  <Button className="w-full cta-primary" disabled={saving}>
                    <Plus className="size-4" /> {t("settings.createRole")}
                  </Button>
                </form>
              )}
            </section>
            <section className="surface-card rounded-2xl p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">{current?.name ?? t("settings.selectRole")}</h2>
                  <p className="mt-1 text-sm text-slate-500">{current?.description ?? t("settings.permissionsDescription")}</p>
                </div>
                {canManage && (
                  <Button onClick={() => void save()} disabled={saving || !current} className="cta-primary">
                    {saving && <Loader2 className="size-4 animate-spin" />}
                    {t("settings.saveChanges")}
                  </Button>
                )}
              </div>
              {current && (
                <div className="mt-6 space-y-5">
                  {Object.entries(grouped).map(([category, items]) => (
                    <div key={category}>
                      <h3 className="mb-2 text-sm font-bold text-slate-700">{category}</h3>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {items.map((permission) => (
                          <label key={permission.id} className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 p-3 hover:border-blue-200">
                            <input
                              type="checkbox"
                              checked={selectedPermissions.has(permission.id)}
                              onChange={() => toggle(permission.id)}
                              disabled={!canManage}
                              className="mt-1 size-4 accent-blue-600"
                            />
                            <span>
                              <span className="block text-sm font-semibold">{permission.name}</span>
                              <span className="block text-xs text-slate-500">{permission.description}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
