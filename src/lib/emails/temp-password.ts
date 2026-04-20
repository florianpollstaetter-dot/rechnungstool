import type { EmailPayload } from "../email";

export function buildTempPasswordEmail(params: {
  to: string;
  displayName: string;
  tempPassword: string;
  companyName: string;
  loginUrl: string;
}): EmailPayload {
  const { to, displayName, tempPassword, companyName, loginUrl } = params;
  const subject = `[${companyName}] Dein temporäres Passwort`;

  const text = `Hallo ${displayName},

dein temporäres Passwort lautet:

  ${tempPassword}

Logge dich hier ein: ${loginUrl}

Du wirst sofort zur Vergabe eines neuen Passworts geführt.

— Orange Octo`;

  const html = `<!doctype html>
<html lang="de">
<body style="margin:0;padding:24px;background:#f7f6f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f1b16;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e9e3d8;border-radius:12px;padding:28px;">
    <tr><td>
      <div style="font-size:20px;font-weight:700;color:#f97316;margin-bottom:4px;">Orange Octo</div>
      <div style="font-size:12px;color:#8a7f6f;margin-bottom:24px;">${escapeHtml(companyName)}</div>
      <h1 style="font-size:18px;font-weight:600;margin:0 0 8px;">Hallo ${escapeHtml(displayName)},</h1>
      <p style="font-size:14px;line-height:1.5;margin:0 0 16px;">dein temporäres Passwort wurde zurückgesetzt. Logge dich damit ein — du wirst sofort zur Vergabe eines neuen Passworts geführt.</p>
      <div style="background:#fbf9f4;border:1px solid #e9e3d8;border-radius:8px;padding:16px;margin:16px 0;">
        <div style="font-size:11px;color:#8a7f6f;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Temporäres Passwort</div>
        <div style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:16px;font-weight:600;letter-spacing:0.5px;color:#1f1b16;word-break:break-all;">${escapeHtml(tempPassword)}</div>
      </div>
      <div style="margin:24px 0;">
        <a href="${escapeHtml(loginUrl)}" style="display:inline-block;background:#f97316;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:10px 20px;border-radius:8px;">Jetzt einloggen</a>
      </div>
      <p style="font-size:12px;color:#8a7f6f;line-height:1.5;margin:16px 0 0;">Falls du diese E-Mail nicht angefordert hast, antworte direkt auf diese Nachricht.</p>
    </td></tr>
  </table>
</body>
</html>`;

  return { to, subject, html, text };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
