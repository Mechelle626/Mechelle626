import {queueSecurityNotice} from "../auth/security-notifications";
import { message as bcText } from "../i18n/source";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import * as OTPAuth from "otpauth";
import { cookies } from "next/headers";
import { transaction, db } from "../auth/db";
import {
  AuthError,
  digest,
  randomToken,
  secureCookies,
  verifyPassword,
} from "../auth/security";
import type { PoolClient } from "pg";
const cookieName = () => (secureCookies() ? "__Host-bc_mfa" : "bc_mfa");
function key() {
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32)
    throw new AuthError(503, bcText("ui.63c3ec0a62430d4e"));
  return createHash("sha256")
    .update("braincraze-mfa:" + process.env.AUTH_SECRET)
    .digest();
}
function encrypt(secret: string, id: string) {
  const nonce = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), nonce);
  cipher.setAAD(Buffer.from(id));
  const bytes = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), bytes]).toString("base64");
}
function decrypt(value: string, id: string) {
  const data = Buffer.from(value, "base64"),
    cipher = createDecipheriv("aes-256-gcm", key(), data.subarray(0, 12));
  cipher.setAAD(Buffer.from(id));
  cipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([
    cipher.update(data.subarray(28)),
    cipher.final(),
  ]).toString();
}
const totp = (secret: string, email = "account") =>
  new OTPAuth.TOTP({
    issuer: "BrainCraze",
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
export async function passwordCheck(userId: string, password: string) {
  const row = (
    await db.query("SELECT password_hash FROM braincraze.users WHERE id=$1", [
      userId,
    ])
  ).rows[0];
  if (!row?.password_hash)
    throw new AuthError(
      400,
      bcText("ui.9b386c0f47bfbbd9"),
    );
  if (!(await verifyPassword(password, row.password_hash)))
    throw new AuthError(403, bcText("ui.7bd90cab5f6dccd4"));
  return row.password_hash as string;
}
export async function beginMfa(id: string, email: string) {
  const secret = new OTPAuth.Secret({ size: 20 }).base32;
  const result = await db.query(
    `INSERT INTO braincraze.account_security(user_id,pending_secret,pending_expires_at) VALUES($1,$2,now()+interval '10 minutes')
    ON CONFLICT(user_id) DO UPDATE SET pending_secret=EXCLUDED.pending_secret,pending_expires_at=EXCLUDED.pending_expires_at WHERE NOT braincraze.account_security.enabled RETURNING user_id`,
    [id, encrypt(secret, id)],
  );
  if (!result.rowCount)
    throw new AuthError(409, bcText("ui.ac0b7deafa1a2ebe"));
  return { secret, uri: totp(secret, email).toString() };
}
export async function useMfa(client: PoolClient, id: string, code: string) {
  const row = (
    await client.query(
      "SELECT * FROM braincraze.account_security WHERE user_id=$1 FOR UPDATE",
      [id],
    )
  ).rows[0];
  if (!row?.enabled) return false;
  const counter = Math.floor(Date.now() / 30000);
  if (/^\d{6}$/.test(code)) {
    const delta = totp(decrypt(row.totp_secret, id)).validate({
      token: code,
      window: 1,
    });
    if (delta === null || counter + delta <= Number(row.last_counter))
      return false;
    await client.query(
      "UPDATE braincraze.account_security SET last_counter=$2 WHERE user_id=$1",
      [id, counter + delta],
    );
    return true;
  }
  const hash = digest(code.replaceAll("-", "").toLowerCase());
  if (!row.recovery_hashes.includes(hash)) return false;
  await client.query(
    "UPDATE braincraze.account_security SET recovery_hashes=array_remove(recovery_hashes,$2) WHERE user_id=$1",
    [id, hash],
  );
  return true;
}
export async function enableMfa(id: string, sessionId: string, code: string) {
  return transaction(async (client) => {
    const row = (
      await client.query(
        "SELECT * FROM braincraze.account_security WHERE user_id=$1 FOR UPDATE",
        [id],
      )
    ).rows[0];
    if (
      !row ||
      row.enabled ||
      !row.pending_secret ||
      new Date(row.pending_expires_at).getTime() <= Date.now()
    )
      throw new AuthError(400, bcText("ui.94db7c95125cb7a0"));
    const delta = totp(decrypt(row.pending_secret, id)).validate({
      token: code,
      window: 1,
    });
    if (delta === null)
      throw new AuthError(400, bcText("ui.5110cb9c53a81afb"));
    const codes = Array.from({ length: 10 }, () =>
      randomBytes(10).toString("hex"),
    );
    await client.query(
      `UPDATE braincraze.account_security SET enabled=true,totp_secret=pending_secret,pending_secret=NULL,pending_expires_at=NULL,last_counter=$2,recovery_hashes=$3 WHERE user_id=$1`,
      [id, Math.floor(Date.now() / 30000) + delta, codes.map(digest)],
    );
    await client.query(
      "DELETE FROM braincraze.sessions WHERE user_id=$1 AND id<>$2",
      [id, sessionId],
    );
    await client.query(
      "UPDATE braincraze.sessions SET mfa_verified_at=now() WHERE id=$1 AND user_id=$2",
      [sessionId, id],
    );
    await queueSecurityNotice(client,id,"two_factor_enabled");
    return codes;
  });
}
export async function beginMfaLogin(
  userId: string,
  remember: boolean,
  agent: string,
) {
  const token = randomToken();
  await db.query(
    "INSERT INTO braincraze.mfa_logins(token_hash,user_id,remember,user_agent,expires_at) VALUES($1,$2,$3,$4,now()+interval '5 minutes')",
    [digest(token), userId, remember, agent.slice(0, 300)],
  );
  (await cookies()).set(cookieName(), token, {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax",
    path: "/",
    maxAge: 300,
  });
}
export async function completeMfaLogin(code: string) {
  const raw = (await cookies()).get(cookieName())?.value;
  if (!raw) throw new AuthError(401, bcText("ui.bd588448da995fdb"));
  const result = await transaction(async (client) => {
    const row = (
      await client.query(
        "SELECT * FROM braincraze.mfa_logins WHERE token_hash=$1 AND expires_at>now() FOR UPDATE",
        [digest(raw)],
      )
    ).rows[0];
    if (!row || row.attempts >= 5) return null;
    await client.query(
      "UPDATE braincraze.mfa_logins SET attempts=attempts+1 WHERE token_hash=$1",
      [digest(raw)],
    );
    if (!(await useMfa(client, row.user_id, code))) return null;
    await client.query(
      "DELETE FROM braincraze.mfa_logins WHERE token_hash=$1",
      [digest(raw)],
    );
    return row;
  });
  if (!result)
    throw new AuthError(
      400,
      bcText("ui.4d49034134fc748a"),
    );
  (await cookies()).set(cookieName(), "", {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return result as { user_id: string; remember: boolean; user_agent: string };
}
