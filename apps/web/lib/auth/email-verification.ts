import { sendLocalizedEmail } from "../i18n/email";
import { message as bcText } from "../i18n/source";
import { randomInt, timingSafeEqual } from "node:crypto";
import { db, transaction } from "./db";
import { AuthError, proof } from "./security";
import { mailConfigured } from "./mail";
import { rateLimit } from "./rate-limit";

const lifetimeSeconds = 15 * 60;
const resendSeconds = 60;
const maxAttempts = 5;

export async function verificationStatus(userId: string) {
  const { rows } = await db.query(
    `
  SELECT u.email, u.email_verified_at, v.expires_at, v.created_at, v.attempts,
         v.verified, v.delivery_status, clock_timestamp() AS server_now
  FROM braincraze.users u
  LEFT JOIN braincraze."EmailVerification" v ON v.user_id=u.id
  WHERE u.id=$1`,
    [userId],
  );
  if (!rows[0]) throw new AuthError(401, bcText("ui.2e1d18330b893e9d"));
  const row = rows[0];
  return {
    email: row.email as string,
    verified: !!row.email_verified_at,
    expiresAt: row.expires_at?.toISOString() ?? null,
    resendAvailableAt: row.created_at
      ? new Date(row.created_at.getTime() + resendSeconds * 1000).toISOString()
      : null,
    remainingAttempts:
      row.attempts == null
        ? maxAttempts
        : Math.max(0, maxAttempts - row.attempts),
    deliveryStatus: (row.delivery_status ?? "none") as
      "none" | "pending" | "sent" | "failed",
    serverNow: row.server_now.toISOString() as string,
  };
}

export async function issueVerification(userId: string, email: string) {
  if (!mailConfigured())
    throw new AuthError(503, bcText("ui.96b330e475224023"));
  // An additional rolling-hour bucket protects recipients from repeated delivery requests.
  await rateLimit(`verify-hour:${userId}`, 10, 3600);
  let code = randomInt(100000, 1000000).toString();
  let tokenHash = proof(`${userId}:${code}`);
  const created = await transaction(async (client) => {
    // Serialize issuance with verification, including concurrent requests on different instances.
    const user = await client.query(
      "SELECT email_verified_at,email FROM braincraze.users WHERE id=$1 FOR UPDATE",
      [userId],
    );
    if (!user.rows[0] || user.rows[0].email !== email)
      throw new AuthError(401, bcText("ui.2e1d18330b893e9d"));
    if (user.rows[0].email_verified_at) return false;
    const prior = await client.query(
      `SELECT code, created_at>clock_timestamp()-$2*interval '1 second' AS cooling_down FROM braincraze."EmailVerification" WHERE user_id=$1`,
      [userId, resendSeconds],
    );
    if (prior.rows[0]?.cooling_down)
      throw new AuthError(
        429,
        bcText("ui.54915e295fd8e570"),
      );
    while (prior.rows[0]?.code === tokenHash) {
      code = randomInt(100000, 1000000).toString();
      tokenHash = proof(`${userId}:${code}`);
    }
    await client.query(
      `INSERT INTO braincraze."EmailVerification"(user_id,code,expires_at)
    VALUES($1,$2,clock_timestamp()+$3*interval '1 second')
    ON CONFLICT(user_id) DO UPDATE SET code=EXCLUDED.code,expires_at=EXCLUDED.expires_at,
    verified=false,verified_at=NULL,attempts=0,created_at=clock_timestamp(),delivery_status='pending'`,
      [userId, tokenHash, lifetimeSeconds],
    );
    return true;
  });
  if (!created) return true;
  try {
    await sendLocalizedEmail(userId,email,"verification",[code]);
    await db.query(
      `UPDATE braincraze."EmailVerification" SET delivery_status='sent' WHERE user_id=$1 AND code=$2`,
      [userId, tokenHash],
    );
    return true;
  } catch {
    await db.query(
      `UPDATE braincraze."EmailVerification" SET delivery_status='failed' WHERE user_id=$1 AND code=$2`,
      [userId, tokenHash],
    );
    console.error(
      "Verification email delivery failed. Check mail configuration.",
    );
    return false;
  }
}

export async function verifyEmailCode(userId: string, code: string) {
  const result = await transaction(async (client) => {
    const user = await client.query(
      "SELECT email_verified_at FROM braincraze.users WHERE id=$1 FOR UPDATE",
      [userId],
    );
    if (!user.rows[0]) throw new AuthError(401, bcText("ui.2e1d18330b893e9d"));
    if (user.rows[0].email_verified_at) return "already-verified";
    const { rows } = await client.query(
      `SELECT *,expires_at<=clock_timestamp() AS expired FROM braincraze."EmailVerification" WHERE user_id=$1 FOR UPDATE`,
      [userId],
    );
    const row = rows[0];
    if (!row) return "missing";
    if (row.verified) return "used";
    if (row.expired) return "expired";
    if (row.attempts >= maxAttempts) return "locked";
    if (row.delivery_status !== "sent") return "delivery-failed";
    const stored = Buffer.from(row.code, "hex"),
      received = Buffer.from(proof(`${userId}:${code}`), "hex");
    const valid =
      stored.length === received.length && timingSafeEqual(stored, received);
    if (!valid) {
      await client.query(
        `UPDATE braincraze."EmailVerification" SET attempts=attempts+1 WHERE user_id=$1`,
        [userId],
      );
      return row.attempts + 1 >= maxAttempts ? "locked" : "incorrect";
    }
    await client.query(
      `UPDATE braincraze."EmailVerification" SET verified=true,verified_at=clock_timestamp() WHERE user_id=$1`,
      [userId],
    );
    await client.query(
      "UPDATE braincraze.users SET email_verified_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1",
      [userId],
    );
    return "verified";
  });
  const errors: Record<string, string> = {
    "already-verified": "This email is already verified. No code is needed.",
    missing: "No verification code is available. Request a new code.",
    used: "This code has already been used.",
    expired: "This code has expired. Request a new code.",
    locked: "Too many incorrect codes. Request a new code.",
    "delivery-failed":
      "The verification email has not been sent successfully. Request a new code.",
    incorrect:
      "That code is incorrect. Please check the latest verification email.",
  };
  // Throw only after committing an unsuccessful attempt, so the attempt counter persists.
  if (result !== "verified") throw new AuthError(400, errors[result]);
}
