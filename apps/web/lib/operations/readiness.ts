import { message as bcText } from "../i18n/source";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { delimiter, isAbsolute, join } from "node:path";
import { documentsConfigured } from "../school/documents";
export async function serviceReadiness() {
  const groups: Record<string, string[]> = {
    smtp: ["SMTP_HOST", "MAIL_FROM"],
    google: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    microsoft: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"],
    apple: [
      "APPLE_CLIENT_ID",
      "APPLE_TEAM_ID",
      "APPLE_KEY_ID",
      "APPLE_PRIVATE_KEY",
    ],
    turnstile: ["TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"],
    recaptcha: ["RECAPTCHA_SITE_KEY", "RECAPTCHA_SECRET_KEY"],
    hcaptcha: ["HCAPTCHA_SITE_KEY", "HCAPTCHA_SECRET_KEY"],
    stripe: [
      "STRIPE_SECRET_KEY",
      "STRIPE_PRICE_MONTHLY",
      "STRIPE_PRICE_YEARLY",
      "STRIPE_WEBHOOK_SECRET",
    ],
    translations: ["I18N_AI_BASE_URL", "I18N_AI_MODEL", "I18N_AI_API_KEY"],
  };
  const services = Object.fromEntries(
    Object.entries(groups).map(([name, vars]) => [
      name,
      {
        configured: vars.every((v) => !!process.env[v]?.trim()),
        missing: vars.filter((v) => !process.env[v]?.trim()),
        liveTested: false,
      },
    ]),
  );
  let publicHttps = false;
  try {
    const url = new URL(process.env.APP_BASE_URL ?? "");
    publicHttps =
      url.protocol === "https:" &&
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch {}
  const executable =
    process.env.SCHOOL_SCANNER_EXECUTABLE?.trim() || "clamscan";
  const candidates = isAbsolute(executable)
    ? [executable]
    : (process.env.PATH ?? "")
        .split(delimiter)
        .filter(Boolean)
        .map((p) => join(p, executable));
  let executablePresent = false;
  for (const path of candidates) {
    try {
      await access(path, constants.X_OK);
      executablePresent = true;
      break;
    } catch {}
  }
  return {
    services,
    publicHttps,
    mailMode:
      process.env.MAIL_MODE === "outbox" ? "development-outbox" : "smtp",
    encryptedStorageConfigured: documentsConfigured(),
    scanner: { executablePresent, signaturesValidated: false },
    note: bcText("ui.99ab2e7288e51c61"),
  };
}
