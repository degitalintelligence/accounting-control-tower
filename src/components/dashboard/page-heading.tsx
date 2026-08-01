"use client";

import { AlertTriangle } from "lucide-react";

interface PageHeadingProps {
  userName?: string;
  exceptionCount?: number;
  goalPercent?: number;
}

function GoalRing({ percent }: { percent: number }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center w-20 h-20 shrink-0">
      <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
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
        <span className="text-base font-bold text-[#1a2421]">{percent}%</span>
        <span className="text-[8px] font-medium text-[#8a9490] uppercase tracking-wider">
          Goal
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
  const now = new Date();
  const dateStr = now.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <p className="text-xs font-medium text-[#8a9490] mb-1">{dateStr}</p>
        <h1 className="text-xl font-bold text-[#1a2421]">
          Selamat Pagi, {userName}
        </h1>
        <div className="flex items-center gap-1.5 mt-2">
          <AlertTriangle className="w-3.5 h-3.5 text-[#c94040]" />
          <span className="text-xs text-[#c94040] font-semibold">
            {exceptionCount} Exceptions Need Your Attention
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3 bg-white border border-[#dfe4e1] rounded-xl shadow-[0_1px_2px_rgba(24,32,31,.04),0_8px_30px_rgba(24,32,31,.045)] px-4 py-3">
        <GoalRing percent={goalPercent} />
        <div>
          <p className="text-xs font-bold text-[#1a2421]">
            Autonomous Completion
          </p>
          <p className="text-[10px] text-[#8a9490]">
            78% tasks auto-resolved this week
          </p>
        </div>
      </div>
    </div>
  );
}
