"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";

interface PageHeadingProps {
  userName?: string;
  exceptionCount?: number;
  goalPercent?: number;
}

function GoalRing({ percent }: { percent: number }) {
  const safePercent = Math.min(100, Math.max(0, percent));
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (safePercent / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center w-20 h-20 shrink-0" role="img" aria-label={`Tingkat penyelesaian tepat waktu ${safePercent}%`}>
      <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80" aria-hidden="true">
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          stroke="#e8ece9"
          strokeWidth="5"
        />
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          stroke="#20865a"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-base font-bold text-ink">{safePercent}%</span>
        <span className="text-xs font-medium text-muted-foreground">
          Target
        </span>
      </div>
    </div>
  );
}

export function PageHeading({
  userName = "Dedi",
  exceptionCount = 9,
  goalPercent = 78,
}: PageHeadingProps) {
  const [dateStr, setDateStr] = useState("Memuat tanggal...");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDateStr(
        new Intl.DateTimeFormat("id-ID", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "Asia/Jakarta",
        }).format(new Date())
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <header className="flex flex-col sm:flex-row items-start justify-between gap-4 mb-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground mb-1">{dateStr}</p>
        <h1 className="text-xl font-bold text-ink">
          Selamat Pagi, {userName}
        </h1>
        <div className="flex items-center gap-1.5 mt-2">
          <AlertTriangle className="w-4 h-4 text-danger" aria-hidden="true" />
          <span className="text-sm text-danger font-semibold" role="status">
            {exceptionCount} pengecualian membutuhkan perhatian
          </span>
        </div>
      </div>
      <div className="surface-card flex items-center gap-3 rounded-xl px-4 py-3">
        <GoalRing percent={goalPercent} />
        <div>
          <p className="text-sm font-bold text-ink">
            Penyelesaian Otomatis
          </p>
          <p className="text-sm text-muted-foreground">
            {goalPercent}% tugas terselesaikan otomatis minggu ini
          </p>
        </div>
      </div>
    </header>
  );
}
