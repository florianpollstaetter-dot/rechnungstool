const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type EmailPayload = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type EmailResult =
  | { sent: true; id: string }
  | { sent: false; reason: "not_configured" }
  | { sent: false; reason: "error"; message: string };

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: "not_configured" };

  const from = process.env.RESEND_FROM || "Orange Octo <admin@orange-octo.com>";

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { sent: false, reason: "error", message: `${res.status}: ${body.slice(0, 200)}` };
  }

  const data = (await res.json().catch(() => ({}))) as { id?: string };
  return { sent: true, id: data.id || "" };
}
