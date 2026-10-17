import { message as bcText } from "../i18n/source";
import { beginMfaLogin } from "../platform/mfa";
import { cookies } from "next/headers";
import { db } from "./db";
import {
  AuthError,
  digest,
  randomToken,
  secureCookies,
  sessionCookie,
} from "./security";
export type AuthUser = {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
  email: string;
  school: string;
  role: string;
  email_verified_at: string | null;
  human_verified: boolean;
  school_verified: boolean;
  session_id: string;
  password_hash?: string;
  is_admin: boolean;
  onboarding_required?: boolean;
  identity_verification_status?: string;
  preferred_language?: string;
  country_code?: string;
};
export async function createSession(
  userId: string,
  remember: boolean,
  agent: string,
  mfaVerified = false,
) {
  const account = (
    await db.query(
      "SELECT u.account_status,COALESCE(a.enabled,false) AS mfa FROM braincraze.users u LEFT JOIN braincraze.account_security a ON a.user_id=u.id WHERE u.id=$1",
      [userId],
    )
  ).rows[0];
  if (!account || account.account_status !== "active")
    throw new AuthError(403, bcText("ui.d0e81258ed14cd2d"));
  if (account.mfa && !mfaVerified) {
    await clearSession();
    await beginMfaLogin(userId, remember, agent);
    return true;
  }
  const token = randomToken();
  const seconds = remember ? 30 * 86400 : 12 * 3600;
  await db.query(
    `INSERT INTO braincraze.sessions(user_id,token_hash,user_agent,expires_at,remember,mfa_verified_at) VALUES($1,$2,$3,now()+$4*interval '1 second',$5,CASE WHEN $6 THEN now() ELSE NULL END)`,
    [
      userId,
      digest(token),
      agent.slice(0, 300),
      seconds,
      remember,
      mfaVerified,
    ],
  );
  (await cookies()).set(sessionCookie(), token, {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax",
    path: "/",
    ...(remember ? { maxAge: seconds } : {}),
  });
  return false;
}
export async function getSession(token?: string): Promise<AuthUser | null> {
  const raw = token ?? (await cookies()).get(sessionCookie())?.value;
  if (!raw || !/^[a-f0-9]{64}$/.test(raw)) return null;
  const result = await db.query(
    `SELECT u.id,u.first_name,u.last_name,u.username,u.email,u.school,u.role,u.email_verified_at,u.human_verified,u.school_verified,u.is_admin,u.onboarding_required,u.identity_verification_status,u.preferred_language,u.country_code,s.id AS session_id FROM braincraze.sessions s JOIN braincraze.users u ON u.id=s.user_id WHERE u.account_status='active' AND s.token_hash=$1 AND s.expires_at>now() AND s.last_seen_at>now()-CASE WHEN s.remember THEN interval '7 days' ELSE interval '30 minutes' END`,
    [digest(raw)],
  );
  if (!result.rows[0]) return null;
  await db.query(
    "UPDATE braincraze.sessions SET last_seen_at=now() WHERE token_hash=$1 AND last_seen_at<now()-interval '1 minute'",
    [digest(raw)],
  );
  return result.rows[0];
}
export async function requireUser(
  verified = false,
  humanVerified = false,
  schoolVerified = false,
) {
  const user = await getSession();
  if (!user) throw new AuthError(401, bcText("ui.ecbd45b6cea47db3"));
  if (verified && !user.email_verified_at)
    throw new AuthError(403, bcText("ui.a1e54d72a61edf4b"));
  if (humanVerified && !user.human_verified)
    throw new AuthError(403, bcText("ui.7c18fdf59eed4020"));
  if (schoolVerified && !user.school_verified)
    throw new AuthError(403, bcText("ui.7605d85e27d78590"));
  return user;
}
export async function clearSession() {
  (await cookies()).set(sessionCookie(), "", {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
