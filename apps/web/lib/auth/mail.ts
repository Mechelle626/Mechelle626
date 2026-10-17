import { message as bcText } from "../i18n/source";
import nodemailer from "nodemailer";
import { mkdir, writeFile, chmod } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { AuthError } from "./security";
function localBaseUrl() {
  try {
    return ["localhost", "127.0.0.1"].includes(
      new URL(process.env.APP_BASE_URL ?? "").hostname,
    );
  } catch {
    return false;
  }
}
export function mailConfigured() {
  if (!["smtp", "outbox"].includes(process.env.MAIL_MODE ?? "smtp"))
    return false;
  return process.env.MAIL_MODE === "outbox"
    ? process.env.ALLOW_LOCAL_OUTBOX === "true" && localBaseUrl()
    : !!(process.env.SMTP_HOST && process.env.MAIL_FROM);
}
export async function sendMail(
  to: string,
  subject: string,
  text: string,
  localization?: { language: string; direction: string },
) {
  if (!mailConfigured())
    throw new AuthError(503, bcText("ui.67cff13e788a8fe5"));
  if (process.env.MAIL_MODE === "outbox") {
    const path =
      process.env.MAIL_OUTBOX_DIR ?? join(process.cwd(), ".local", "mail");
    await mkdir(path, { recursive: true, mode: 0o700 });
    await chmod(path, 0o700);
    await writeFile(
      join(path, `${Date.now()}-${randomUUID()}.json`),
      JSON.stringify(
        {
          to,
          subject,
          text,
          language: localization?.language ?? "en",
          mode: "local-development-outbox",
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    return;
  }
  const transport = nodemailer.createTransport(smtpOptions());
  const escape = (s: string) =>
    s.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c]!,
    );
  const html = localization
    ? `<!doctype html><html lang="${escape(localization.language)}" dir="${escape(localization.direction)}"><body><p style="white-space:pre-wrap">${escape(text)}</p></body></html>`
    : undefined;
  await transport.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject,
    text,
    html,
  });
}

export function smtpOptions() {
  return {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_PORT === "465",
    requireTLS: process.env.SMTP_PORT !== "465",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
    connectionTimeout: 10000,
    socketTimeout: 15000,
  };
}
