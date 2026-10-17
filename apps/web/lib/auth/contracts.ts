import { message as bcText } from "../i18n/source";
export const roles = [
  "Student",
  "Faculty",
  "Teaching Assistant",
  "Tutor",
  "Staff",
] as const;
export type AuthMode =
  | "signup"
  | "login"
  | "forgot-password"
  | "reset-password"
  | "verify-email"
  | "complete-profile";
export function passwordStrength(value: string) {
  if (!value) return { score: 0, label: bcText("ui.32dce93171fc5fdb") };
  if (value.length < 12)
    return { score: 1, label: bcText("ui.c064a1aff473d25d") };
  const variety = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) =>
    re.test(value),
  ).length;
  if (value.length >= 18 && variety >= 3)
    return { score: 4, label: bcText("ui.14be368e3dc35aa4") };
  if (value.length >= 14 && variety >= 2)
    return { score: 3, label: bcText("ui.f9e9f53dfb84bcf5") };
  return { score: 2, label: bcText("ui.0ae2127db23a00d0") };
}
