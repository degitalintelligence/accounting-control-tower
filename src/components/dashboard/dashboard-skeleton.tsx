import { Skeleton } from "@/components/ui/skeleton";

export function StatCardSkeleton() {
  return (
    <div className="flex h-full flex-col justify-between rounded-[14px] bg-white p-[18px] shadow-[0_2px_12px_rgba(0,0,0,.06)]">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-[90px]" />
        <Skeleton className="size-[30px] rounded-full" />
      </div>
      <div className="mt-[30px] flex items-end justify-between">
        <Skeleton className="h-[26px] w-[60px]" />
        <Skeleton className="h-3 w-[100px]" />
      </div>
    </div>
  );
}

export function DeadlineSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
      <Skeleton className="size-9 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3 w-[180px]" />
        <Skeleton className="h-2.5 w-[120px]" />
      </div>
      <Skeleton className="h-5 w-[70px] rounded-full" />
    </div>
  );
}

export function ActivitySkeleton() {
  return (
    <div className="flex items-start gap-3">
      <Skeleton className="size-2 mt-1.5 rounded-full" />
      <div className="flex-1 space-y-1">
        <Skeleton className="h-3 w-[200px]" />
        <Skeleton className="h-2.5 w-[80px]" />
      </div>
    </div>
  );
}
