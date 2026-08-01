"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { navigationItems, quickActions, type NavigationIcon } from "@/lib/navigation";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CommandItem {
  label: string;
  description: string;
  href: string;
  icon: NavigationIcon;
  shortcut?: string;
}

const commands: CommandItem[] = [...quickActions, ...navigationItems].map((command) => ({
  label: command.label,
  description: command.description ?? "Buka halaman ini",
  href: command.href,
  icon: command.icon,
  shortcut: "shortcut" in command ? command.shortcut : undefined,
}));

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const filteredCommands = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return commands;
    return commands.filter((command) =>
      `${command.label} ${command.description}`.toLowerCase().includes(normalizedQuery)
    );
  }, [query]);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setQuery("");
      setActiveIndex(0);
    });
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (activeIndex >= filteredCommands.length) {
      queueMicrotask(() => setActiveIndex(0));
    }
  }, [activeIndex, filteredCommands.length]);

  function execute(command: CommandItem | undefined) {
    if (!command) return;
    onOpenChange(false);
    router.push(command.href);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % Math.max(filteredCommands.length, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + filteredCommands.length) % Math.max(filteredCommands.length, 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      execute(filteredCommands[activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onOpenChange(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/30 px-4 pt-[12vh] backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-slate-200"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="flex items-center gap-2 border-b border-slate-100 px-4">
          <Search className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ketik perintah atau cari..."
            aria-label="Cari perintah"
            className="h-12 border-0 px-0 shadow-none focus-visible:ring-0"
          />
          <kbd className="hidden rounded border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-400 sm:inline">Esc</kbd>
        </div>
        <div className="max-h-[min(60vh,420px)] overflow-y-auto p-2" role="listbox" aria-label="Perintah">
          {filteredCommands.length > 0 ? (
            filteredCommands.map((command, index) => {
              const Icon = command.icon;
              const active = index === activeIndex;
              return (
                <button
                  key={command.href}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => execute(command)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${active ? "bg-slate-100" : "hover:bg-slate-50"}`}
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-slate-100 text-slate-600">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-900">{command.label}</span>
                    <span className="block truncate text-xs text-slate-500">{command.description}</span>
                  </span>
                  {command.shortcut && <kbd className="rounded border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-400">{command.shortcut}</kbd>}
                </button>
              );
            })
          ) : (
            <p className="px-3 py-8 text-center text-sm text-slate-500">Tidak ada perintah yang cocok.</p>
          )}
        </div>
        <div className="hidden items-center gap-3 border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400 sm:flex">
          <span>↑↓ pilih</span>
          <span>Enter buka</span>
          <span>Esc tutup</span>
        </div>
      </div>
    </div>
  );
}
