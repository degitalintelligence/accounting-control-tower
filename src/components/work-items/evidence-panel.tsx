"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Circle, Download, FileText, Loader2, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type EvidenceRequirement = {
  id: string;
  name: string;
  description: string | null;
  file_types: string[] | null;
  max_size_mb: number | null;
  is_required: boolean;
};

type EvidenceFile = {
  id: string;
  file_id: string;
  evidence_requirement_id: string | null;
  files: { filename: string; mime_type: string | null; size_bytes: number; created_at: string } | null;
  evidence_requirement: { id: string; name: string; is_required: boolean } | null;
};

type EvidenceData = {
  files: EvidenceFile[];
  requirements: EvidenceRequirement[];
  required_total: number;
  required_completed: number;
};

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function EvidencePanel({ workItemId }: { workItemId: string }) {
  const [data, setData] = useState<EvidenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedRequirement, setSelectedRequirement] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`/api/work-items/${workItemId}/files`);
    const body = await response.json().catch(() => null);
    if (!response.ok) setError(body?.error ?? "Gagal memuat evidence.");
    else setData(body?.data ?? null);
    setLoading(false);
  }, [workItemId]);

  useEffect(() => { queueMicrotask(() => load()); }, [load]);

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const requirement = data?.requirements.find((entry) => entry.id === selectedRequirement);
    if (requirement?.max_size_mb && file.size > requirement.max_size_mb * 1024 * 1024) {
      setError(`Ukuran file maksimal ${requirement.max_size_mb} MB.`);
      return;
    }
    if (requirement?.file_types?.length && !requirement.file_types.some((type) => file.type === type || file.name.toLowerCase().endsWith(`.${type.toLowerCase().replace(".", "")}`))) {
      setError("Tipe file tidak sesuai requirement.");
      return;
    }
    setUploading(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    if (selectedRequirement) form.append("evidence_requirement_id", selectedRequirement);
    const response = await fetch(`/api/work-items/${workItemId}/files`, { method: "POST", body: form });
    const body = await response.json().catch(() => null);
    if (!response.ok) setError(body?.error ?? "Gagal mengunggah evidence.");
    else await load();
    setUploading(false);
  }

  async function download(fileId: string) {
    const response = await fetch(`/api/work-items/${workItemId}/files/${fileId}/download`);
    const body = await response.json().catch(() => null);
    if (!response.ok) setError(body?.error ?? "Gagal membuat link download.");
    else window.open(body.data.url, "_blank", "noopener,noreferrer");
  }

  if (loading) return <Card><CardContent className="p-6 flex justify-center"><Loader2 className="size-5 animate-spin text-slate-400" /></CardContent></Card>;
  if (!data) return <Card><CardContent className="p-4 text-sm text-red-600">{error ?? "Evidence tidak tersedia."}</CardContent></Card>;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm">Evidence File</CardTitle>
            <p className="text-xs text-slate-500 mt-1">{data.required_completed}/{data.required_total} evidence wajib terpenuhi</p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-orange-500 px-3 py-2 text-xs font-bold text-white hover:bg-orange-600">
            {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
            Upload
            <input type="file" className="hidden" disabled={uploading} onChange={upload} />
          </label>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        {data.requirements.length > 0 && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-600" htmlFor="evidence-requirement">Tautkan ke requirement</label>
            <select id="evidence-requirement" className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={selectedRequirement} onChange={(event) => setSelectedRequirement(event.target.value)}>
              <option value="">Tanpa requirement khusus</option>
              {data.requirements.map((requirement) => <option key={requirement.id} value={requirement.id}>{requirement.name}{requirement.is_required ? " *" : ""}</option>)}
            </select>
          </div>
        )}
        {data.requirements.length > 0 && <div className="space-y-2">{data.requirements.map((requirement) => {
          const complete = data.files.some((file) => file.evidence_requirement_id === requirement.id);
          return <div key={requirement.id} className="flex items-start gap-2 rounded-lg border border-slate-100 p-3"><span>{complete ? <CheckCircle2 className="mt-0.5 size-4 text-emerald-500" /> : <Circle className="mt-0.5 size-4 text-slate-300" />}</span><div><p className="text-sm text-slate-700">{requirement.name} {requirement.is_required && <span className="text-red-500">*</span>}</p>{requirement.description && <p className="text-xs text-slate-400">{requirement.description}</p>}</div></div>;
        })}</div>}
        <div className="space-y-2">{data.files.length === 0 ? <p className="py-4 text-center text-sm italic text-slate-400">Belum ada file evidence.</p> : data.files.map((file) => <div key={file.id} className="flex items-center gap-3 rounded-lg border border-slate-100 p-3"><FileText className="size-5 shrink-0 text-blue-500" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-800">{file.files?.filename ?? "File"}</p><p className="text-xs text-slate-400">{file.files?.size_bytes ? formatSize(file.files.size_bytes) : "—"}{file.evidence_requirement?.name ? ` · ${file.evidence_requirement.name}` : ""}</p></div><Button type="button" variant="ghost" size="sm" onClick={() => download(file.file_id)}><Download className="size-4" /></Button></div>)}</div>
      </CardContent>
    </Card>
  );
}
