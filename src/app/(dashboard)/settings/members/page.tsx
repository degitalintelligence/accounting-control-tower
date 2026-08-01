"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface Member {
  id: string;
  profile_id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  role: string;
  initials: string;
  joined_at: string;
}

const roleLabels: Record<string, string> = {
  admin: "Admin",
  finance_manager: "Finance Manager",
  finance_staff: "Finance Staff",
};

const roleColors: Record<string, string> = {
  admin: "bg-[#3b82f6] text-white",
  finance_manager: "bg-[#8b5cf6] text-white",
  finance_staff: "bg-[#6b7280] text-white",
};

const tabs = [
  { label: "General", href: "/settings", icon: Settings },
  { label: "Members", href: "/settings/members", icon: Users },
];

export default function MembersPage() {
  const pathname = usePathname();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMembers() {
      try {
        const res = await fetch("/api/settings/members");
        if (res.ok) {
          const data = await res.json();
          setMembers(data);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchMembers();
  }, []);

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

      {/* Members List */}
      <div className="max-w-3xl">
        <div className="rounded-[14px] bg-white shadow-[0_2px_12px_rgba(0,0,0,.06)] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
            <div>
              <h2 className="text-[15px] font-semibold text-[#18201f]">
                Anggota Organisasi
              </h2>
              <p className="text-[11px] text-[#8b9492]">
                {members.length} anggota aktif
              </p>
            </div>
          </div>

          {/* List */}
          <div className="divide-y divide-slate-50">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3.5">
                  <Skeleton className="size-9 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-[140px]" />
                    <Skeleton className="h-2.5 w-[180px]" />
                  </div>
                  <Skeleton className="h-5 w-[80px] rounded-full" />
                </div>
              ))
            ) : members.length === 0 ? (
              <div className="px-5 py-8 text-center text-[13px] text-[#8b9492]">
                Belum ada anggota.
              </div>
            ) : (
              members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-3 px-5 py-3.5"
                >
                  {/* Avatar */}
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#e5e7eb] text-[11px] font-bold text-[#374151]">
                    {member.initials}
                  </span>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <strong className="block text-[13px] font-medium text-[#18201f] truncate">
                      {member.name}
                    </strong>
                    {member.email && (
                      <span className="block text-[11px] text-[#8b9492] truncate">
                        {member.email}
                      </span>
                    )}
                  </div>

                  {/* Role Badge */}
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold",
                      roleColors[member.role] ?? "bg-slate-200 text-slate-700"
                    )}
                  >
                    {roleLabels[member.role] ?? member.role}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
