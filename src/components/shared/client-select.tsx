"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useClients } from "@/hooks/use-clients";

interface ClientSelectProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  label?: string;
}

export function ClientSelect({ id, value, onChange, required = true, label = "Client" }: ClientSelectProps) {
  const { clients, loading, error } = useClients();

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      <Select value={value || null} onValueChange={(next) => onChange(next ?? "")}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={loading ? "Memuat client..." : "Pilih client..."} />
        </SelectTrigger>
        <SelectContent>
          {clients.length === 0 && !loading ? (
            <div className="px-3 py-2 text-sm text-slate-400">{error ?? "Tidak ada client dalam scope Anda."}</div>
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
    </div>
  );
}
