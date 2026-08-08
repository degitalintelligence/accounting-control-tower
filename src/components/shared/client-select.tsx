"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useClients } from "@/hooks/use-clients";
import { useI18n } from "@/components/i18n-provider";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { QuickAddClientDialog } from "./quick-add-client-dialog";

interface ClientSelectProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  label?: string;
}

export function ClientSelect({ id, value, onChange, required = true, label = "Client" }: ClientSelectProps) {
  const { clients, loading, error } = useClients();
  const { t } = useI18n();
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      <Select value={value || null} onValueChange={(next) => onChange(next ?? "")}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={loading ? t("common.loadingClient") : t("common.selectClient")} />
        </SelectTrigger>
        <SelectContent>
          <div className="p-1 border-b mb-1">
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-start text-orange-600 hover:text-orange-700 hover:bg-orange-50 font-medium h-8 px-2 text-xs"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setQuickAddOpen(true);
              }}
            >
              <Plus className="mr-2 h-3.5 w-3.5" />
              Tambah Client Baru
            </Button>
          </div>
          {clients.length === 0 && !loading ? (
            <div className="px-3 py-2 text-sm text-slate-400">{error ?? t("common.noClientScope")}</div>
          ) : (
            clients.map((client) => (
              <SelectItem key={client.id} value={client.id}>
                {client.name}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
      {error && <p className="text-[11px] text-red-500">{error}</p>}

      <QuickAddClientDialog
        open={quickAddOpen}
        onOpenChange={setQuickAddOpen}
        onSuccess={(client) => {
          onChange(client.id);
        }}
      />
    </div>
  );
}
