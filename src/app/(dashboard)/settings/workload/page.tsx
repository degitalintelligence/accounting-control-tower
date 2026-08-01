import Link from "next/link";
import { ArrowRight, Users } from "lucide-react";

export default function WorkloadPage() {
  return (
    <main className="page-canvas">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink">Tim &amp; beban kerja</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Pantau pekerjaan tim dari antrean work item.</p>
      </div>
      <section className="surface-card max-w-2xl rounded-xl p-6">
        <Users className="mb-3 size-8 text-blue-600" />
        <h2 className="text-base font-semibold text-ink">Distribusi pekerjaan</h2>
        <p className="mt-1 text-sm text-muted-foreground">Gunakan daftar pekerjaan untuk melihat tugas per anggota, status, dan tenggat.</p>
        <Link href="/work-items?tab=mine" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-blue-600">
          Buka pekerjaan saya <ArrowRight className="size-4" />
        </Link>
      </section>
    </main>
  );
}
