type ResendMessage = {
  id?: string;
  message?: string;
};

function getResendConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return null;
  return { apiKey, from };
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const config = getResendConfig();
  if (!config) throw new Error("Resend belum dikonfigurasi.");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
    cache: "no-store",
  });

  const result = (await response.json().catch(() => ({}))) as ResendMessage;
  if (!response.ok) throw new Error(result.message ?? "Resend gagal mengirim email.");
  return result.id ?? null;
}

export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}
