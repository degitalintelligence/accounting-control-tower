"use client";

import { CircleHelp, ExternalLink, ListChecks, ShieldCheck } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getHelpDefinition } from "@/lib/help/content";

interface ContextualHelpSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ContextualHelpSheet({ open, onOpenChange }: ContextualHelpSheetProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const definition = getHelpDefinition(pathname, searchParams.toString());

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-md gap-0 overflow-y-auto p-0 sm:max-w-md">
        <SheetHeader className="border-b border-line bg-surface px-5 py-5 pr-14">
          <div className="mb-3 grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-600">
            <CircleHelp className="size-5" />
          </div>
          <SheetTitle className="font-heading text-xl">{definition.title}</SheetTitle>
          <SheetDescription className="leading-6">{definition.summary}</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 p-5">
          <section>
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
              <ListChecks className="size-4 text-blue-600" />
              Cara menggunakan
            </div>
            <ol className="space-y-3">
              {definition.steps.map((step, index) => (
                <li key={step} className="flex gap-3 text-sm leading-6 text-muted-foreground">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-amber-900">
              <ShieldCheck className="size-4" />
              Aturan penting
            </div>
            <ul className="space-y-2 text-sm leading-6 text-amber-950/75">
              {definition.rules.map((rule) => (
                <li key={rule} className="flex gap-2">
                  <span aria-hidden="true">•</span>
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-bold text-foreground">Aksi terkait</h3>
            <div className="space-y-2">
              {definition.related.map((related) => (
                <Button
                  key={related.href}
                  type="button"
                  variant="outline"
                  className="h-auto w-full justify-between rounded-lg px-3 py-2.5 text-left font-semibold"
                  onClick={() => {
                    onOpenChange(false);
                    router.push(related.href);
                  }}
                >
                  {related.label}
                  <ExternalLink className="size-4 text-muted-foreground" />
                </Button>
              ))}
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function ContextualHelpButton({ onClick }: { onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        onClick={onClick}
        className="control-interactive grid size-10 place-items-center rounded-lg border border-line bg-surface"
        aria-label="Buka bantuan halaman ini"
      >
        <CircleHelp className="size-[17px] text-[#6f7a77]" />
      </TooltipTrigger>
      <TooltipContent>Bantuan halaman ini</TooltipContent>
    </Tooltip>
  );
}
