import { message as bcText } from "../i18n/source";
import { z } from "zod";
import { db, transaction } from "./db";
import { appOrigin, AuthError, digest } from "./security";

import { captchaProviders, type CaptchaProvider } from "./human-contracts";
const prefixes = {
  recaptcha: "RECAPTCHA",
  hcaptcha: "HCAPTCHA",
  turnstile: "TURNSTILE",
} as const;
const endpoints = {
  recaptcha: "https://www.google.com/recaptcha/api/siteverify",
  hcaptcha: "https://api.hcaptcha.com/siteverify",
  turnstile: "https://challenges.cloudflare.com/turnstile/v0/siteverify",
} as const;
export const humanVerificationInput = z
  .object({ token: z.string().min(1).max(8192), challengeId: z.uuid() })
  .strict();
export function captchaConfiguration() {
  const selection = z
    .enum(captchaProviders)
    .safeParse(process.env.CAPTCHA_PROVIDER ?? "turnstile");
  if (!selection.success)
    throw new AuthError(
      503,
      bcText("ui.27b142d1f8ee70dc"),
    );
  const provider = selection.data;
  const prefix = prefixes[provider];
  const siteKey = process.env[`${prefix}_SITE_KEY`]?.trim() ?? "";
  const secret = process.env[`${prefix}_SECRET_KEY`]?.trim() ?? "";
  return {
    provider,
    siteKey,
    secret,
    configured: !!(siteKey && secret),
    hostname: new URL(appOrigin()).hostname,
  };
}
function requireConfiguration() {
  const config = captchaConfiguration();
  if (!config.configured)
    throw new AuthError(
      503,
      bcText("ui.2fbb5c88fe220fc2"),
    );
  return config;
}

const responseSchema = z.object({
  success: z.boolean(),
  hostname: z.string().optional(),
  challenge_ts: z.string().optional(),
  action: z.string().optional(),
  cdata: z.string().optional(),
});
// The injectable transport is for deterministic service tests. HTTP handlers always
// use the default real HTTPS fetch; no request/configuration can supply a verifier.
export async function verifyProviderToken(
  provider: CaptchaProvider,
  token: string,
  challengeId: string,
  transport: typeof fetch = fetch,
) {
  const config = requireConfiguration();
  if (config.provider !== provider)
    throw new AuthError(
      400,
      bcText("ui.e5ec91830f82f2ec"),
    );
  const form = new URLSearchParams({ secret: config.secret, response: token });
  if (provider === "hcaptcha") form.set("sitekey", config.siteKey);
  let payload: unknown;
  try {
    const response = await transport(endpoints[provider], {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Provider unavailable");
    payload = await response.json();
  } catch {
    throw new AuthError(
      503,
      bcText("ui.7a5885cd9181dddc"),
    );
  }
  const parsed = responseSchema.safeParse(payload);
  if (!parsed.success || parsed.data.success !== true)
    throw new AuthError(
      400,
      bcText("ui.ccdc15bc55d969e9"),
    );
  const answer = parsed.data;
  if (answer.hostname?.toLowerCase() !== config.hostname.toLowerCase())
    throw new AuthError(
      400,
      bcText("ui.6cf9c7ed3618117d"),
    );
  const issued = Date.parse(answer.challenge_ts ?? "");
  const age = Date.now() - issued;
  const maxAge = provider === "turnstile" ? 300000 : 120000;
  if (!Number.isFinite(issued) || age > maxAge || age < -60000)
    throw new AuthError(
      400,
      bcText("ui.e3404ccfb6bb78af"),
    );
  if (
    provider === "turnstile" &&
    (answer.action !== "braincraze_human" || answer.cdata !== challengeId)
  )
    throw new AuthError(
      400,
      bcText("ui.bb481117bd96ec4e"),
    );
}

export async function humanVerificationStatus(userId: string) {
  const { rows } = await db.query(
    "SELECT email_verified_at,human_verified,school_verified FROM braincraze.users WHERE id=$1",
    [userId],
  );
  if (!rows[0]) throw new AuthError(401, bcText("ui.2e1d18330b893e9d"));
  if (!rows[0].email_verified_at)
    throw new AuthError(403, bcText("ui.a1e54d72a61edf4b"));
  const { provider, siteKey, configured } = captchaConfiguration();
  return {
    humanVerified: rows[0].human_verified as boolean,
    provider,
    siteKey: configured ? siteKey : null,
    configured,
    next: !rows[0].human_verified
      ? "/human-verification"
      : rows[0].school_verified
        ? "/account"
        : "/school-verification",
  };
}

// Used at both ends of a provider request so revoked/expired sessions cannot
// gain access while a slow provider response is in flight.
async function lockAccount(
  client: import("pg").PoolClient,
  userId: string,
  sessionId: string,
) {
  const { rows } = await client.query(
    `SELECT u.email_verified_at,u.human_verified
  FROM braincraze.users u JOIN braincraze.sessions s ON s.user_id=u.id
  WHERE u.id=$1 AND s.id=$2 AND s.expires_at>clock_timestamp()
    AND s.last_seen_at>clock_timestamp()-CASE WHEN s.remember THEN interval '7 days' ELSE interval '30 minutes' END
  FOR UPDATE OF u,s`,
    [userId, sessionId],
  );
  if (!rows[0]) throw new AuthError(401, bcText("ui.2e1d18330b893e9d"));
  if (!rows[0].email_verified_at)
    throw new AuthError(403, bcText("ui.a1e54d72a61edf4b"));
  return rows[0] as { email_verified_at: Date; human_verified: boolean };
}

export async function createHumanChallenge(userId: string, sessionId: string) {
  const config = requireConfiguration();
  return transaction(async (client) => {
    const user = await lockAccount(client, userId, sessionId);
    if (user.human_verified) return { humanVerified: true, challengeId: null };
    // Invalidate older browser challenges in this session on an explicit retry.
    await client.query(
      `UPDATE braincraze.human_verification_challenges SET used_at=clock_timestamp() WHERE session_id=$1 AND used_at IS NULL`,
      [sessionId],
    );
    const { rows } = await client.query(
      `INSERT INTO braincraze.human_verification_challenges(user_id,session_id,provider) VALUES($1,$2,$3) RETURNING id,expires_at`,
      [userId, sessionId, config.provider],
    );
    return {
      humanVerified: false,
      challengeId: rows[0].id as string,
      expiresAt: rows[0].expires_at.toISOString() as string,
    };
  });
}

export async function completeHumanVerification(
  userId: string,
  sessionId: string,
  challengeId: string,
  token: string,
  transport: typeof fetch = fetch,
) {
  const config = requireConfiguration();
  const claimed = await transaction(async (client) => {
    const user = await lockAccount(client, userId, sessionId);
    if (user.human_verified) return false;
    const challenge = await client.query(
      `UPDATE braincraze.human_verification_challenges SET used_at=clock_timestamp()
   WHERE id=$1 AND user_id=$2 AND session_id=$3 AND provider=$4 AND used_at IS NULL AND expires_at>clock_timestamp() RETURNING id`,
      [challengeId, userId, sessionId, config.provider],
    );
    if (!challenge.rowCount)
      throw new AuthError(
        400,
        bcText("ui.813125e6acf429f9"),
      );
    const inserted = await client.query(
      `INSERT INTO braincraze.human_verification_tokens(token_hash,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING token_hash`,
      [digest(`${config.provider}:${token}`), userId],
    );
    // Keep the challenge consumed if the same token was submitted before.
    return inserted.rowCount ? "claimed" : "replayed";
  });
  if (claimed === false) return { humanVerified: true };
  if (claimed === "replayed")
    throw new AuthError(
      400,
      bcText("ui.9229dd4345be55e9"),
    );
  await verifyProviderToken(config.provider, token, challengeId, transport);
  await transaction(async (client) => {
    await lockAccount(client, userId, sessionId);
    await client.query(
      `UPDATE braincraze.users SET human_verified=true,human_verified_at=clock_timestamp(),human_verification_provider=$2,updated_at=clock_timestamp() WHERE id=$1 AND email_verified_at IS NOT NULL`,
      [userId, config.provider],
    );
  });
  return { humanVerified: true };
}
