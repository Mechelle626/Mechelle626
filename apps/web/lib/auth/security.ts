import { message as bcText } from "../i18n/source";
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
  createHmac,
} from "node:crypto";
import { z } from "zod";
import { roles } from "./contracts";
export const passwordSchema = z
  .string()
  .min(12, bcText("ui.618b57689fc12d5f"))
  .max(128, bcText("ui.860a8f936b334811"));
export const profileSchema = z.object({
  firstName: z.string().trim().min(1, bcText("ui.7633806b104639f5")).max(80),
  lastName: z.string().trim().min(1, bcText("ui.9d8dc637e16fa2ba")).max(80),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(30)
    .regex(/^[a-z0-9_]+$/, bcText("ui.b0747916fcf24984")),
  school: z.string().trim().min(2, bcText("ui.c25e4c70e65e6ee1")).max(160),
  role: z.enum(roles),
});
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const registrationSchema = profileSchema
  .extend({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: bcText("ui.6c6e178ad2a856ca"),
    path: ["confirmPassword"],
  });
export const resetSchema = z
  .object({
    token: z.string().regex(/^[a-f0-9]{64}$/),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: bcText("ui.6c6e178ad2a856ca"),
    path: ["confirmPassword"],
  });
export const randomToken = () => randomBytes(32).toString("hex");
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function proof(value: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("AUTH_SECRET must contain at least 32 characters.");
  return createHmac("sha256", secret).update(value).digest("hex");
}
const derive = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCallback(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$32768$8$3$${salt}$${(await derive(password, salt)).toString("hex")}`;
}
const dummy =
  "scrypt$32768$8$3$0123456789abcdef0123456789abcdef$" + "0".repeat(128);
export async function verifyPassword(password: string, stored: string | null) {
  const parts = (stored ?? dummy).split("$");
  if (
    parts.length !== 6 ||
    parts[0] !== "scrypt" ||
    parts[1] !== "32768" ||
    parts[2] !== "8" ||
    parts[3] !== "3"
  )
    return false;
  const expected = Buffer.from(parts[5], "hex"),
    actual = await derive(password, parts[4]);
  return (
    !!stored &&
    expected.length === actual.length &&
    timingSafeEqual(expected, actual)
  );
}
export class AuthError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string[] | undefined>,
  ) {
    super(message);
  }
}
export function appOrigin() {
  const raw = process.env.APP_BASE_URL;
  if (!raw)
    throw new AuthError(503, bcText("ui.4bb7688d769feca1"));
  const url = new URL(raw);
  if (
    process.env.NODE_ENV === "production" &&
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    throw new Error("Production requires HTTPS.");
  return url.origin;
}
export const secureCookies = () => appOrigin().startsWith("https:");
export const sessionCookie = () =>
  secureCookies() ? "__Host-bc_session" : "bc_session";
