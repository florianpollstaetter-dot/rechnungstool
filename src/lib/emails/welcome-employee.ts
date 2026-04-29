// SCH-918 K3-V2 — Welcome email after admin creates a new MA.
//
// Sister template to buildTempPasswordEmail. Different use-case:
// here the admin has just created the user from scratch (NOT a
// password-reset). The body needs to:
//   - state that an account was created on behalf of the user,
//   - carry the login email + the temporary password verbatim,
//   - link to /login,
//   - keep the same Orange Octo brand framing as temp-password.ts.
//
// `i18n` is a simple language code (de | en); the rest of the
// 8 supported languages fall back to English. We do not pull in
// the React/translations module because this helper runs in API
// routes that already import this file via dynamic-only paths and
// adding the React i18n provider would balloon the bundle.

import type { EmailPayload } from "../email";

export type WelcomeEmailLocale = "de" | "en";

export function buildWelcomeEmployeeEmail(params: {
  to: string;
  displayName: string;
  tempPassword: string;
  companyName: string;
  loginUrl: string;
  locale?: WelcomeEmailLocale;
}): EmailPayload {
  const {
    to,
    displayName,
    tempPassword,
    companyName,
    loginUrl,
    locale = "de",
  } = params;

  const copy = locale === "de" ? COPY_DE : COPY_EN;

  const subject = copy.subject(companyName);

  const text =
    `${copy.greeting(displayName)}

${copy.intro(companyName)}

  ${copy.loginEmailLabel}: ${to}
  ${copy.passwordLabel}: ${tempPassword}

${copy.loginAt} ${loginUrl}

${copy.afterLogin}

— Orange Octo`;

  const html = `<!doctype html>
<html lang="${locale}">
<body style="margin:0;padding:24px;background:#f7f6f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f1b16;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e9e3d8;border-radius:12px;padding:28px;">
    <tr><td>
      <div style="font-size:20px;font-weight:700;color:#f97316;margin-bottom:4px;">Orange Octo</div>
      <div style="font-size:12px;color:#8a7f6f;margin-bottom:24px;">${escapeHtml(companyName)}</div>
      <h1 style="font-size:18px;font-weight:600;margin:0 0 8px;">${escapeHtml(copy.greeting(displayName))}</h1>
      <p style="font-size:14px;line-height:1.5;margin:0 0 16px;">${escapeHtml(copy.intro(companyName))}</p>
      <div style="background:#fbf9f4;border:1px solid #e9e3d8;border-radius:8px;padding:16px;margin:16px 0;">
        <div style="font-size:11px;color:#8a7f6f;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">${escapeHtml(copy.loginEmailLabel)}</div>
        <div style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:14px;font-weight:500;color:#1f1b16;word-break:break-all;margin-bottom:12px;">${escapeHtml(to)}</div>
        <div style="font-size:11px;color:#8a7f6f;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">${escapeHtml(copy.passwordLabel)}</div>
        <div style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:16px;font-weight:600;letter-spacing:0.5px;color:#1f1b16;word-break:break-all;">${escapeHtml(tempPassword)}</div>
      </div>
      <div style="margin:24px 0;">
        <a href="${escapeHtml(loginUrl)}" style="display:inline-block;background:#f97316;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:10px 20px;border-radius:8px;">${escapeHtml(copy.loginButton)}</a>
      </div>
      <p style="font-size:12px;color:#8a7f6f;line-height:1.5;margin:16px 0 0;">${escapeHtml(copy.afterLogin)}</p>
    </td></tr>
  </table>
</body>
</html>`;

  return { to, subject, html, text };
}

interface CopyBundle {
  subject: (companyName: string) => string;
  greeting: (displayName: string) => string;
  intro: (companyName: string) => string;
  loginEmailLabel: string;
  passwordLabel: string;
  loginAt: string;
  loginButton: string;
  afterLogin: string;
}

const COPY_DE: CopyBundle = {
  subject: (companyName) => `[${companyName}] Dein Account ist bereit`,
  greeting: (displayName) => `Hallo ${displayName},`,
  intro: (companyName) =>
    `bei ${companyName} wurde gerade ein Account für dich angelegt. Du kannst dich mit den unten stehenden Zugangsdaten einloggen — beim ersten Login wirst du sofort gebeten, dir ein eigenes Passwort zu vergeben.`,
  loginEmailLabel: "Login-E-Mail",
  passwordLabel: "Temporäres Passwort",
  loginAt: "Logge dich hier ein:",
  loginButton: "Jetzt einloggen",
  afterLogin:
    "Falls du nicht weißt, wer dir diesen Account angelegt hat, antworte direkt auf diese E-Mail.",
};

const COPY_EN: CopyBundle = {
  subject: (companyName) => `[${companyName}] Your account is ready`,
  greeting: (displayName) => `Hi ${displayName},`,
  intro: (companyName) =>
    `An account has just been created for you at ${companyName}. You can log in with the credentials below — on first login you'll be asked to set your own password.`,
  loginEmailLabel: "Login email",
  passwordLabel: "Temporary password",
  loginAt: "Log in here:",
  loginButton: "Log in now",
  afterLogin:
    "If you don't know who created this account, reply to this email directly.",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
