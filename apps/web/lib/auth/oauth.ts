import { message as bcText } from "../i18n/source";
import {applyResidence,type Residence} from "../onboarding/registration";
import { createRemoteJWKSet, jwtVerify, SignJWT, importPKCS8 } from "jose";
import { cookies } from "next/headers";
import { db, transaction } from "./db";
import {
  appOrigin,
  AuthError,
  randomToken,
  digest,
  secureCookies,
} from "./security";
import { createSession } from "./session";
export const providers = ["google", "microsoft", "apple"] as const;
export type Provider = (typeof providers)[number];
export function providerConfigured(provider: Provider) {
  const prefix = provider.toUpperCase();
  return !!(
    process.env[`${prefix}_CLIENT_ID`] &&
    (provider === "apple"
      ? process.env.APPLE_TEAM_ID &&
        process.env.APPLE_KEY_ID &&
        process.env.APPLE_PRIVATE_KEY &&
        secureCookies()
      : process.env[`${prefix}_CLIENT_SECRET`])
  );
}
const endpoints = {
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    jwks: "https://www.googleapis.com/oauth2/v3/certs",
    issuer: "https://accounts.google.com",
  },
  microsoft: {
    authorize: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    jwks: "https://login.microsoftonline.com/common/discovery/v2.0/keys",
    issuer: "",
  },
  apple: {
    authorize: "https://appleid.apple.com/auth/authorize",
    token: "https://appleid.apple.com/auth/token",
    jwks: "https://appleid.apple.com/auth/keys",
    issuer: "https://appleid.apple.com",
  },
};
const jwks = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
const flowCookie = (p: Provider) => `bc_oauth_${p}`;
async function clientSecret(provider: Provider) {
  if (provider !== "apple")
    return process.env[`${provider.toUpperCase()}_CLIENT_SECRET`]!;
  const key = await importPKCS8(
    process.env.APPLE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
    "ES256",
  );
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: process.env.APPLE_KEY_ID! })
    .setIssuer(process.env.APPLE_TEAM_ID!)
    .setSubject(process.env.APPLE_CLIENT_ID!)
    .setAudience("https://appleid.apple.com")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(key);
}
export async function beginOAuth(provider: Provider) {
  if (!providerConfigured(provider))
    throw new AuthError(503, `${provider} sign-in is not configured.`);
  const state = randomToken(),
    nonce = randomToken(),
    verifier = randomToken();
  await db.query(
    `INSERT INTO braincraze.oauth_flows(state_hash,provider,nonce,verifier,expires_at) VALUES($1,$2,$3,$4,now()+interval '10 minutes')`,
    [digest(state), provider, nonce, verifier],
  );
  (await cookies()).set(flowCookie(provider), state, {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: provider === "apple" ? "none" : "lax",
    path: "/",
    maxAge: 600,
  });
  const url = new URL(endpoints[provider].authorize);
  const params: Record<string, string> = {
    client_id: process.env[`${provider.toUpperCase()}_CLIENT_ID`]!,
    redirect_uri: `${appOrigin()}/api/auth/oauth/${provider}/callback`,
    response_type: "code",
    scope: provider === "apple" ? "name email" : "openid email profile",
    state,
    nonce,
  };
  if (provider === "apple") params.response_mode = "form_post";
  else {
    params.code_challenge = Buffer.from(digest(verifier), "hex").toString(
      "base64url",
    );
    params.code_challenge_method = "S256";
  }
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return url;
}
export async function finishOAuth(
  provider: Provider,
  params: URLSearchParams,
  agent: string,
) {
  const state = params.get("state");
  const saved = (await cookies()).get(flowCookie(provider))?.value;
  if (!state || !saved || state !== saved)
    throw new AuthError(
      400,
      bcText("ui.025fe1a6aee120e6"),
    );
  const { rows } = await db.query(
    `DELETE FROM braincraze.oauth_flows WHERE state_hash=$1 AND provider=$2 AND expires_at>now() RETURNING *`,
    [digest(state), provider],
  );
  (await cookies()).set(flowCookie(provider), "", {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: provider === "apple" ? "none" : "lax",
    path: "/",
    maxAge: 0,
  });
  if (!rows[0] || !params.get("code") || params.has("error"))
    throw new AuthError(
      400,
      bcText("ui.ca2250e2f099f6a9"),
    );
  const form = new URLSearchParams({
    client_id: process.env[`${provider.toUpperCase()}_CLIENT_ID`]!,
    client_secret: await clientSecret(provider),
    code: params.get("code")!,
    grant_type: "authorization_code",
    redirect_uri: `${appOrigin()}/api/auth/oauth/${provider}/callback`,
  });
  if (provider !== "apple") form.set("code_verifier", rows[0].verifier);
  const tokenResponse = await fetch(endpoints[provider].token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(15000),
  });
  if (!tokenResponse.ok)
    throw new AuthError(
      502,
      bcText("ui.92df61122e8be086"),
    );
  const tokens = await tokenResponse.json();
  if (typeof tokens.id_token !== "string")
    throw new AuthError(400, bcText("ui.e853a801458135c6"));
  if (!jwks.has(provider))
    jwks.set(provider, createRemoteJWKSet(new URL(endpoints[provider].jwks)));
  const { payload } = await jwtVerify(tokens.id_token, jwks.get(provider)!, {
    audience: process.env[`${provider.toUpperCase()}_CLIENT_ID`]!,
    ...(provider === "microsoft" ? {} : { issuer: endpoints[provider].issuer }),
    algorithms: ["RS256"],
    requiredClaims: ["exp", "iat", "sub", "nonce", "iss"],
    maxTokenAge: "10m",
  });
  if (payload.nonce !== rows[0].nonce)
    throw new AuthError(400, bcText("ui.0ca3f2f9e46256c7"));
  if (
    provider === "microsoft" &&
    (typeof payload.tid !== "string" ||
      !/^[a-f0-9-]{36}$/i.test(payload.tid) ||
      payload.iss !== `https://login.microsoftonline.com/${payload.tid}/v2.0`)
  )
    throw new AuthError(400, bcText("ui.c311b1194c95c83a"));
  const identitySubject =
    provider === "microsoft" ? `${payload.tid}:${payload.sub}` : payload.sub!;
  const existing = await db.query(
    "SELECT user_id FROM braincraze.identities WHERE provider=$1 AND subject=$2",
    [provider, identitySubject],
  );
  if (existing.rows[0]) {
    const mfa = await createSession(existing.rows[0].user_id, false, agent);
    return mfa ? "/two-factor" : "/account";
  }
  const email =
    typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!email || !email.includes("@"))
    throw new AuthError(
      400,
      bcText("ui.603a7a341843a000"),
    );
  const conflict = await db.query(
    "SELECT id FROM braincraze.users WHERE email=$1",
    [email],
  );
  if (conflict.rowCount)
    throw new AuthError(
      409,
      bcText("ui.3e3eb9bbde42cab6"),
    );
  const pending = randomToken();
  await db.query(
    `INSERT INTO braincraze.oauth_profiles(token_hash,provider,subject,email,email_verified,first_name,last_name,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '10 minutes')`,
    [
      digest(pending),
      provider,
      identitySubject,
      email,
      payload.email_verified === true || payload.email_verified === "true",
      typeof payload.given_name === "string" ? payload.given_name : "",
      typeof payload.family_name === "string" ? payload.family_name : "",
    ],
  );
  (await cookies()).set("bc_oauth_profile", pending, {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return "/complete-profile";
}
export async function pendingOAuth() {
  const token = (await cookies()).get("bc_oauth_profile")?.value;
  if (!token)
    throw new AuthError(401, bcText("ui.688c70023d2200c6"));
  const { rows } = await db.query(
    "SELECT * FROM braincraze.oauth_profiles WHERE token_hash=$1 AND expires_at>now()",
    [digest(token)],
  );
  if (!rows[0])
    throw new AuthError(401, bcText("ui.688c70023d2200c6"));
  return rows[0];
}
export async function completeOAuth(
  profile: {
    firstName: string;
    lastName: string;
    username: string;
    school: string;
    role: string;
  },
  agent: string,
  residence:Residence,
) {
  const pending = await pendingOAuth();
  const user = await transaction(async (client) => {
    const lock = await client.query(
      "DELETE FROM braincraze.oauth_profiles WHERE token_hash=$1 AND expires_at>now() RETURNING *",
      [pending.token_hash],
    );
    if (!lock.rowCount)
      throw new AuthError(401, bcText("ui.688c70023d2200c6"));
    const { rows } = await client.query(
      `INSERT INTO braincraze.users(first_name,last_name,username,email,school,role,email_verified_at) VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $7 THEN now() ELSE NULL END) RETURNING id,email_verified_at,email`,
      [
        profile.firstName,
        profile.lastName,
        profile.username,
        pending.email,
        profile.school,
        profile.role,
        pending.email_verified,
      ],
    );
    await applyResidence(rows[0].id,residence,client);
    await client.query(
      "INSERT INTO braincraze.identities(provider,subject,user_id) VALUES($1,$2,$3)",
      [pending.provider, pending.subject, rows[0].id],
    );
    return rows[0];
  });
  (await cookies()).set("bc_oauth_profile", "", {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  await createSession(user.id, false, agent);
  return user;
}
