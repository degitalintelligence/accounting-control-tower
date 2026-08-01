"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Settings, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "General", href: "/settings", icon: Settings },
  { label: "Members", href: "/settings/members", icon: Users },
  { label: "Clients", href: "/settings/clients", icon: Building2 },
];

export default function SettingsPage() {
  const pathname = usePathname();

  return (
    <main className="flex-1 p-6 bg-[#f3f5f2] min-h-screen">
      <div className="mb-6">
        <h1 className="text-[20px] font-semibold text-[#18201f]">Settings</h1>
        <p className="text-[13px] text-[#8b9492] mt-0.5">
          Kelola pengaturan organisasi Anda
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {tabs.map((tab) => {
          const isActive =
            tab.href === "/settings"
              ? pathname === "/settings"
              : pathname.startsWith(tab.href);

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors",
                isActive
                  ? "border-[#18201f] text-[#18201f]"
                  : "border-transparent text-[#8b9492] hover:text-[#18201f]"
              )}
            >
              <tab.icon className="size-3.5" />
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* General Settings Content */}
      <div className="max-w-2xl">
        <div className="rounded-[14px] bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,.06)]">
          <h2 className="text-[15px] font-semibold text-[#18201f] mb-4">
            Informasi Organisasi
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-[12px] font-medium text-[#8b9492] mb-1">
                Nama Organisasi
              </label>
              <div className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-[#18201f] bg-slate-50">
                Kreasheet Accounting
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[#8b9492] mb-1">
                Slug
              </label>
              <div className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-[#18201f] bg-slate-50">
                kreasheet
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[#8b9492] mb-1">
                Timezone
              </label>
              <div className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-[#18201f] bg-slate-50">
                Asia/Jakarta
              </div>
            </div>
          </div>

          <p className="mt-4 text-[11px] text-[#8b9492]">
            Hubungi admin untuk mengubah pengaturan organisasi.
          </p>
        </div>
      </div>
    </main>
  );
}
