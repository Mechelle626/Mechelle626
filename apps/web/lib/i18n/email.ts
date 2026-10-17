import { db } from "../auth/db";
import { catalog, enabledLocale, listLanguages } from "./store";
import { sendMail } from "../auth/mail";
export type EmailTemplate =
  "verification" | "school" | "reset" | "subscription" | "notification" | "security";
export async function renderEmail(
  template: EmailTemplate,
  language: string,
  values: string[],
) {
  const locale = (await enabledLocale(language)) ?? "en",
    messages = await catalog(locale);
  const render = (key: string) => {
    const text = messages[key];
    if (!text) throw new Error("Email template missing: " + key);
    return text.replace(
      /\{(\d+)\}/g,
      (_, i) => values[Number(i)] ?? "{" + i + "}",
    );
  };
  const languages = await listLanguages();
  return {
    language: locale,
    direction: languages.find((l) => l.code === locale)?.direction ?? "ltr",
    subject: render(`email.${template}.subject`),
    text: render(`email.${template}.body`),
  };
}
export async function sendLocalizedEmail(
  userId: string,
  to: string,
  template: EmailTemplate,
  values: string[],
) {
  const user = (
    await db.query(
      "SELECT preferred_language FROM braincraze.users WHERE id=$1",
      [userId],
    )
  ).rows[0];
  const email = await renderEmail(
    template,
    user?.preferred_language ?? "en",
    values,
  );
  await sendMail(to, email.subject, email.text, {
    language: email.language,
    direction: email.direction,
  });
}
