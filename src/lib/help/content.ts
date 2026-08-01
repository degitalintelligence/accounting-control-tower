import { getNavigationItem } from "@/lib/navigation";

export interface HelpDefinition {
  title: string;
  summary: string;
  steps: string[];
  rules: string[];
  related: Array<{ label: string; href: string }>;
}

const helpDefinitions: Record<string, HelpDefinition> = {
  "/dashboard": {
    title: "Memahami Ringkasan",
    summary: "Gunakan ringkasan untuk melihat pekerjaan yang membutuhkan perhatian dan risiko operasional terbaru.",
    steps: [
      "Mulai dari area exception untuk menemukan pekerjaan yang overdue atau tertahan.",
      "Buka antrean review untuk memproses pekerjaan yang menunggu tindakan.",
      "Gunakan KPI sebagai sinyal, lalu buka work item untuk memeriksa detailnya.",
    ],
    rules: [
      "Angka overdue dan at risk adalah indikator hasil perhitungan sistem.",
      "Ringkasan hanya menampilkan data yang dapat Anda akses.",
    ],
    related: [
      { label: "Buka pekerjaan saya", href: "/work-items?tab=mine" },
      { label: "Buka antrean review", href: "/work-items?filter=review" },
    ],
  },
  "/work-items": {
    title: "Memahami Work Items",
    summary: "Kelola pekerjaan accounting berdasarkan status, tipe, deadline, dan pihak yang bertanggung jawab.",
    steps: [
      "Gunakan filter untuk mempersempit daftar pekerjaan.",
      "Buka work item untuk melihat checklist, evidence, assignment, dan riwayat.",
      "Pilih pekerjaan baru untuk membuat dan menugaskan pekerjaan.",
    ],
    rules: [
      "Status pekerjaan hanya dapat berubah melalui alur yang diizinkan.",
      "Maker tidak boleh menjadi checker pada pekerjaan yang sama.",
      "Overdue ditentukan oleh deadline, bukan status manual.",
    ],
    related: [
      { label: "Lihat pekerjaan saya", href: "/work-items?tab=mine" },
      { label: "Lihat antrean review", href: "/work-items?filter=review" },
      { label: "Lihat pekerjaan rutin", href: "/work-items?type=routine" },
    ],
  },
  "/work-items/[id]": {
    title: "Memahami Detail Work Item",
    summary: "Halaman ini menyatukan assignment, checklist, evidence, review, komentar, dan audit trail.",
    steps: [
      "Periksa status dan langkah berikutnya di bagian atas halaman.",
      "Selesaikan checklist dan lampirkan evidence yang diperlukan.",
      "Submit pekerjaan setelah semua persyaratan maker terpenuhi.",
    ],
    rules: [
      "Evidence yang sudah disubmit tidak dapat diedit maker sampai pekerjaan dikembalikan untuk revisi.",
      "Permintaan revisi wajib memiliki alasan dan finding yang jelas.",
      "Pekerjaan selesai setelah seluruh kontrol dan approval yang diwajibkan terpenuhi.",
    ],
    related: [
      { label: "Buka semua pekerjaan", href: "/work-items" },
      { label: "Buka antrean review", href: "/work-items?filter=review" },
    ],
  },
  "/projects": {
    title: "Memahami Proyek",
    summary: "Pantau proyek, milestone, pekerjaan terkait, dan progres delivery dalam satu tempat.",
    steps: [
      "Buka proyek untuk melihat milestone dan pekerjaan di dalamnya.",
      "Gunakan progres sebagai ringkasan, lalu periksa child work item untuk detail.",
      "Tindak lanjuti milestone yang tertunda atau memiliki dependency.",
    ],
    rules: [
      "Progress proyek dihitung dari pekerjaan dan milestone yang terkait.",
      "Perubahan penting pada deadline dan status tercatat dalam audit trail.",
    ],
    related: [{ label: "Buka semua pekerjaan", href: "/work-items" }],
  },
  "/templates": {
    title: "Memahami Template SOP",
    summary: "Gunakan template untuk membentuk pekerjaan yang konsisten dan dapat diaudit.",
    steps: [
      "Pilih template untuk melihat versi, checklist, dan aturan yang digunakan.",
      "Buat atau publikasikan versi baru jika prosedur berubah.",
      "Periksa effective period sebelum template dipakai untuk instance baru.",
    ],
    rules: [
      "Instance historis tidak berubah saat template diperbarui.",
      "Versi template yang dipublikasikan menjadi acuan untuk periode berikutnya.",
    ],
    related: [
      { label: "Buka checklist", href: "/checklists" },
      { label: "Buka pekerjaan rutin", href: "/work-items?type=routine" },
    ],
  },
  "/wa-inbox": {
    title: "Memahami Kotak Masuk WhatsApp",
    summary: "Gunakan inbox untuk memantau sinyal operasional dari grup WhatsApp yang telah diizinkan.",
    steps: [
      "Tinjau pesan yang masuk dan identitas pengirimnya.",
      "Pastikan grup dan participant telah terverifikasi.",
      "Konfirmasi saran tindakan sebelum menjadi perubahan di sistem.",
    ],
    rules: [
      "Hanya grup yang di-whitelist yang diproses.",
      "Pesan WhatsApp bukan sumber kebenaran utama aplikasi.",
      "Pesan pribadi tidak diproses pada MVP.",
    ],
    related: [{ label: "Buka Inbox AI", href: "/ai-inbox" }],
  },
  "/ai-inbox": {
    title: "Memahami Inbox AI",
    summary: "Tinjau saran AI sebelum dikonfirmasi menjadi task atau perubahan di sistem.",
    steps: [
      "Baca sumber pesan dan field yang diekstrak.",
      "Validasi client, pekerjaan, dan identitas yang diusulkan.",
      "Konfirmasi atau tolak saran dengan keputusan manusia.",
    ],
    rules: [
      "AI hanya memberikan saran dan tidak menjadi approver final.",
      "Semua natural-language inference memerlukan konfirmasi manusia.",
      "Saran yang tidak valid tidak boleh langsung membuat perubahan.",
    ],
    related: [{ label: "Buka Kotak Masuk WhatsApp", href: "/wa-inbox" }],
  },
  "/settings": {
    title: "Memahami Pengaturan",
    summary: "Kelola konfigurasi workspace, anggota, client, notifikasi, dan akses operasional.",
    steps: [
      "Pilih tab pengaturan yang sesuai dengan kebutuhan Anda.",
      "Periksa dampak perubahan sebelum menyimpan konfigurasi.",
      "Pastikan perubahan akses sesuai dengan organisasi dan client yang dipilih.",
    ],
    rules: [
      "Akses data dibatasi berdasarkan organisasi dan client.",
      "Perubahan konfigurasi penting dapat tercatat dalam audit trail.",
    ],
    related: [
      { label: "Kelola anggota", href: "/settings/members" },
      { label: "Kelola client", href: "/settings/clients" },
      { label: "Kelola beban kerja", href: "/settings/workload" },
    ],
  },
};

const fallbackDefinition: HelpDefinition = {
  title: "Bantuan halaman ini",
  summary: "Gunakan halaman ini untuk menjalankan proses accounting sesuai akses dan workflow Anda.",
  steps: [
    "Periksa judul, status, dan filter aktif di halaman.",
    "Buka detail item untuk melihat informasi dan tindakan yang tersedia.",
    "Gunakan bantuan terkait jika Anda membutuhkan konteks lebih lanjut.",
  ],
  rules: [
    "Aksi yang tersedia mengikuti role dan permission Anda.",
    "Perubahan penting mengikuti workflow dan tercatat dalam audit trail.",
  ],
  related: [{ label: "Kembali ke Ringkasan", href: "/dashboard" }],
};

export function getHelpDefinition(pathname: string, search: string): HelpDefinition {
  if (/^\/work-items\/[^/]+$/.test(pathname)) return helpDefinitions["/work-items/[id]"];

  const navigationItem = getNavigationItem(pathname, search);
  const route = navigationItem?.href.split("?")[0] ?? pathname;
  const definition = helpDefinitions[route] ?? fallbackDefinition;

  if (route === "/work-items" && new URLSearchParams(search).get("filter") === "review") {
    return {
      ...definition,
      title: "Memahami Antrean Review",
      summary: "Fokuskan perhatian pada pekerjaan yang menunggu pemeriksaan checker.",
      steps: [
        "Buka pekerjaan yang paling dekat dengan deadline.",
        "Periksa checklist, evidence, dan finding sebelum mengambil keputusan.",
        "Minta revisi dengan alasan yang jelas jika ada kontrol yang belum terpenuhi.",
      ],
    };
  }

  if (route === "/work-items" && new URLSearchParams(search).get("tab") === "mine") {
    return {
      ...definition,
      title: "Memahami Pekerjaan Saya",
      summary: "Gunakan tampilan ini untuk memprioritaskan pekerjaan yang ditugaskan kepada Anda.",
    };
  }

  return definition;
}
