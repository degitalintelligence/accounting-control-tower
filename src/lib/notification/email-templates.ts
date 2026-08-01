import type { NotificationEventType } from "@/types/notification";

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

function plainText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

const labels: Record<NotificationEventType, string> = {
  item_assigned: "Penugasan pekerjaan",
  status_changed: "Perubahan status pekerjaan",
  comment_added: "Komentar baru",
  deadline_approaching: "Pengingat tenggat",
  item_overdue: "Pekerjaan melewati tenggat",
  review_requested: "Review diperlukan",
  review_approved: "Review disetujui",
  item_escalated: "Eskalasi pekerjaan",
  digest: "Ringkasan pekerjaan",
};

export function renderNotificationEmail(input: {
  eventType: NotificationEventType;
  title: string;
  body: string | null;
  actionUrl?: string;
}) {
  const title = escapeHtml(input.title);
  const body = escapeHtml(input.body ?? "Ada pembaruan yang perlu Anda periksa.");
  const label = labels[input.eventType] ?? "Notifikasi pekerjaan";
  const safeUrl = input.actionUrl && /^https:\/\//i.test(input.actionUrl)
    ? escapeHtml(input.actionUrl)
    : null;
  const action = safeUrl
    ? `<p><a href="${safeUrl}" style="display:inline-block;background:#f97316;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:700">Buka di Lolos ATS</a></p>`
    : "";

  return {
    subject: `${label}: ${plainText(input.title)}`,
    text: `${label}\n\n${plainText(input.title)}\n${plainText(input.body ?? "Ada pembaruan yang perlu Anda periksa.")}${input.actionUrl ? `\n\n${input.actionUrl}` : ""}`,
    html: `<!doctype html><html lang="id"><body style="margin:0;background:#f8fafc;color:#0f172a;font-family:Arial,sans-serif"><main style="max-width:600px;margin:0 auto;padding:32px 20px"><div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:28px"><p style="margin:0 0 16px;color:#2563eb;font-size:13px;font-weight:700">LOLOS ATS</p><p style="margin:0 0 8px;color:#64748b;font-size:13px">${escapeHtml(label)}</p><h1 style="font-size:22px;line-height:1.3;margin:0 0 16px">${title}</h1><p style="font-size:15px;line-height:1.6;white-space:pre-line">${body}</p>${action}</div><p style="color:#64748b;font-size:12px;margin:18px 0">Email ini dikirim dari sistem Lolos ATS. Jangan membalas email ini.</p></main></body></html>`,
  };
}
