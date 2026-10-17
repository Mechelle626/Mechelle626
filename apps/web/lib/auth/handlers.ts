import {validationFields} from "../i18n/validation";
import {queueSecurityNotice} from "./security-notifications";
import { sendLocalizedEmail } from "../i18n/email";
import { message as bcText } from "../i18n/source";
import {residenceSchema,validateResidence,applyResidence} from "../onboarding/registration";
import {nextStep} from "../onboarding/flow";
import { completeMfaLogin } from "../platform/mfa";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, transaction } from "./db";
import {
  appOrigin,
  AuthError,
  digest,
  emailSchema,
  hashPassword,
  profileSchema,
  randomToken,
  registrationSchema,
  resetSchema,
  verifyPassword,
} from "./security";
import { clearSession, createSession, requireUser } from "./session";
import { mailConfigured } from "./mail";
import { rateLimit } from "./rate-limit";
import {
  humanVerificationStatus,
  createHumanChallenge,
  completeHumanVerification,
  humanVerificationInput,
} from "./human-verification";
import {
  issueVerification,
  verificationStatus,
  verifyEmailCode,
} from "./email-verification";
import {
  beginOAuth,
  completeOAuth,
  finishOAuth,
  pendingOAuth,
  providerConfigured,
  providers,
  type Provider,
} from "./oauth";

async function readJson(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new AuthError(415, bcText("ui.a164cd2abe96c4c3"));
  const reader = request.body?.getReader();
  if (!reader) throw new AuthError(400, bcText("ui.6e05cc730b7f1690"));
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 16384) {
      await reader.cancel();
      throw new AuthError(413, bcText("ui.fb5a64779155dcd2"));
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw new AuthError(400, bcText("ui.677275edb6b61c01"));
  }
}
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function authHandler(request: NextRequest, parts: string[]) {
  const action = parts.join("/");
  const method = request.method;
  const agent = request.headers.get("user-agent") ?? "Unknown browser";
  try {
    if (!process.env.DATABASE_URL)
      throw new AuthError(503, bcText("ui.08d8dda4d53e9f7c"));
    if (action.startsWith("oauth/")) {
      const provider = parts[1] as Provider;
      if (!providers.includes(provider))
        throw new AuthError(404, bcText("ui.51ae780cb525f01e"));
      await rateLimit("oauth-global", 200, 60);
      if (parts.length === 2 && method === "GET")
        return NextResponse.redirect(await beginOAuth(provider));
      if (
        parts[2] === "callback" &&
        parts.length === 3 &&
        (method === "GET" || (method === "POST" && provider === "apple"))
      ) {
        const params =
          method === "GET"
            ? request.nextUrl.searchParams
            : new URLSearchParams(await request.text());
        const destination = await finishOAuth(provider, params, agent);
        return NextResponse.redirect(new URL(destination, appOrigin()), 303);
      }
      throw new AuthError(405, bcText("ui.5765cf564d4dd7a2"));
    }
    if (method === "GET") {
      if (action === "config")
        return json({
          providers: Object.fromEntries(
            providers.map((p) => [p, providerConfigured(p)]),
          ),
          mailMode:
            process.env.MAIL_MODE === "outbox"
              ? "local-outbox"
              : mailConfigured()
                ? "smtp"
                : "unconfigured",
        });
      if (action === "me") return json({ user: await requireUser() });
      if (action === "human-status") {
        const user = await requireUser(true);
        return json(await humanVerificationStatus(user.id));
      }
      if (action === "verification-status") {
        const user = await requireUser();
        return json(await verificationStatus(user.id));
      }
      if (action === "oauth-profile") {
        const p = await pendingOAuth();
        return json({
          firstName: p.first_name,
          lastName: p.last_name,
          email: p.email,
        });
      }
      if (action === "sessions") {
        const user = await requireUser(true);
        const { rows } = await db.query(
          `SELECT id,user_agent,created_at,last_seen_at,expires_at,remember,id=$2 AS current FROM braincraze.sessions WHERE user_id=$1 AND expires_at>now() AND last_seen_at>now()-CASE WHEN remember THEN interval '7 days' ELSE interval '30 minutes' END ORDER BY created_at DESC`,
          [user.id, user.session_id],
        );
        return json({ sessions: rows });
      }
      throw new AuthError(404, bcText("ui.9655eebc96749ab6"));
    }
    if (method !== "POST") throw new AuthError(405, bcText("ui.5765cf564d4dd7a2"));
    if (request.headers.get("origin") !== appOrigin())
      throw new AuthError(403, bcText("ui.0b1789e68e952de5"));
    await rateLimit("auth-global", 300, 60);
    // Only trust the proxy-supplied address when the operator explicitly configures a trusted, stripping proxy.
    const address =
      process.env.TRUST_PROXY === "true"
        ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        : "shared";
    await rateLimit(`network:${address ?? "shared"}`, 100, 60);
    const body = await readJson(request);
    if (action === "human-challenge") {
      const user = await requireUser(true);
      await rateLimit(`human-start:${user.id}`, 20, 600);
      return json(await createHumanChallenge(user.id, user.session_id));
    }
    if (action === "verify-human") {
      const user = await requireUser(true);
      const input = humanVerificationInput.parse(body);
      await rateLimit(`human-verify:${user.id}`, 10, 600);
      const result = await completeHumanVerification(
        user.id,
        user.session_id,
        input.challengeId,
        input.token,
      );
      return json({
        ...result,
        message: bcText("ui.7cb5d1f7d98c5824"),
        next: user.onboarding_required ? "/identity-verification" : "/school-verification",
      });
    }
    if (action === "register") {
      if (!mailConfigured())
        throw new AuthError(
          503,
          bcText("ui.e4f2630822c00cd2"),
        );
      const input = registrationSchema.parse(body);
      const residence=residenceSchema.parse(body);
      await validateResidence(residence);
      await rateLimit(`register:${input.email}`, 5, 3600);
      const passwordHash = await hashPassword(input.password);
      const { rows } = await transaction(async client=>{const result=await client.query(
        `INSERT INTO braincraze.users(first_name,last_name,username,email,password_hash,school,role) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,email`,
        [
          input.firstName,
          input.lastName,
          input.username,
          input.email,
          passwordHash,
          input.school,
          input.role,
        ],
      );
      await applyResidence(result.rows[0].id,residence,client);return result;
      });
      const emailSent = await issueVerification(rows[0].id, rows[0].email);
      await createSession(rows[0].id, false, agent);
      return json({ next: "/verify-email", emailSent }, 201);
    }
    if (action === "two-factor") {
      const { code } = z
        .object({ code: z.string().min(6).max(40) })
        .strict()
        .parse(body);
      const pending = await completeMfaLogin(code);
      await createSession(
        pending.user_id,
        pending.remember,
        pending.user_agent,
        true,
      );
      return json({ next: "/account" });
    }
    if (action === "login") {
      const input = z
        .object({
          email: emailSchema,
          password: z.string().min(1).max(128),
          remember: z.boolean().default(false),
        })
        .parse(body);
      await rateLimit(`login:${input.email}`, 10, 900);
      const { rows } = await db.query(
        "SELECT id,password_hash,email_verified_at,human_verified,school_verified,onboarding_required,identity_verification_status FROM braincraze.users WHERE email=$1",
        [input.email],
      );
      if (
        !(await verifyPassword(input.password, rows[0]?.password_hash ?? null))
      )
        throw new AuthError(401, bcText("ui.58b4835523dcab3a"));
      const mfa = await createSession(rows[0].id, input.remember, agent);
      return json({
        next: mfa ? "/two-factor" : nextStep(rows[0]),
      });
    }
    if (action === "forgot-password") {
      if (!mailConfigured())
        throw new AuthError(503, bcText("ui.760b37f2c297589c"));
      const { email } = z.object({ email: emailSchema }).parse(body);
      await rateLimit(`reset-send:${email}`, 3, 3600);
      const { rows } = await db.query(
        "SELECT id,password_hash FROM braincraze.users WHERE email=$1",
        [email],
      );
      if (rows[0]) {
        const token = randomToken();
        await db.query(
          `INSERT INTO braincraze.challenges(user_id,kind,token_hash,expires_at) VALUES($1,'reset',$2,now()+interval '30 minutes') ON CONFLICT(user_id,kind) DO UPDATE SET token_hash=EXCLUDED.token_hash,expires_at=EXCLUDED.expires_at,attempts=0,created_at=now()`,
          [rows[0].id, digest(token)],
        );
        try {
          await sendLocalizedEmail(rows[0].id,email,"reset",[`${appOrigin()}/reset-password#token=${token}`]);
        } catch {
          console.error(
            "Password reset email delivery failed. Check mail configuration.",
          );
        }
      }
      return json({
        message:
          bcText("ui.52a9133497dda4d0"),
      });
    }
    if (action === "reset-password") {
      const input = resetSchema.parse(body);
      await rateLimit(`reset-use:${digest(input.token)}`, 5, 900);
      const passwordHash = await hashPassword(input.password);
      await transaction(async (client) => {
        const { rows } = await client.query(
          `DELETE FROM braincraze.challenges WHERE kind='reset' AND token_hash=$1 AND expires_at>now() RETURNING user_id`,
          [digest(input.token)],
        );
        if (!rows[0])
          throw new AuthError(
            400,
            bcText("ui.e648709a60d07971"),
          );
        await client.query(
          "UPDATE braincraze.users SET password_hash=$1,updated_at=now() WHERE id=$2",
          [passwordHash, rows[0].user_id],
        );
        await client.query("DELETE FROM braincraze.sessions WHERE user_id=$1", [
          rows[0].user_id,
        ]);
        await queueSecurityNotice(client,rows[0].user_id,"password_reset");
      });
      await clearSession();
      return json({
        message: bcText("ui.a25ee1e973294fbb"),
        next: "/login",
      });
    }
    if (action === "verify-email") {
      const user = await requireUser();
      const { code } = z
        .object({
          code: z.string().regex(/^\d{6}$/, bcText("ui.51361e99c23a7321")),
        })
        .parse(body);
      await rateLimit(`verify-attempt:${user.id}`, 10, 600);
      await verifyEmailCode(user.id, code);
      // Rotate the unverified session after the privilege change.
      await db.query("DELETE FROM braincraze.sessions WHERE id=$1", [
        user.session_id,
      ]);
      await createSession(user.id, false, agent);
      return json({
        next: "/human-verification",
        verified: true,
        message: bcText("ui.bc512ab036ae1f01"),
        verification: await verificationStatus(user.id),
      });
    }
    if (action === "resend-verification") {
      const user = await requireUser();
      if (user.email_verified_at)
        return json({ message: bcText("ui.6412cddca14cdcd4") });
      if (!mailConfigured())
        throw new AuthError(503, bcText("ui.96b330e475224023"));
      const sent = await issueVerification(user.id, user.email);
      if (!sent)
        throw new AuthError(
          503,
          bcText("ui.118999f70919b738"),
        );
      return json({
        message: bcText("ui.efdfee04416b7fe8"),
        verification: await verificationStatus(user.id),
      });
    }
    if (action === "complete-profile") {
      const profile = profileSchema.parse(body);
      const residence=residenceSchema.parse(body);await validateResidence(residence);
      if (!mailConfigured())
        throw new AuthError(
          503,
          bcText("ui.98b3d8b781d3f4db"),
        );
      const user = await completeOAuth(profile, agent, residence);
      const emailSent = user.email_verified_at
        ? true
        : await issueVerification(user.id, user.email);
      return json(
        {
          next: user.email_verified_at
            ? "/human-verification"
            : "/verify-email",
          emailSent,
        },
        201,
      );
    }
    if (action === "logout") {
      const user = await requireUser();
      await db.query("DELETE FROM braincraze.sessions WHERE id=$1", [
        user.session_id,
      ]);
      await clearSession();
      return json({ next: "/login" });
    }
    if (action === "revoke-session") {
      const user = await requireUser(true);
      const { id } = z.object({ id: z.uuid() }).parse(body);
      await db.query(
        "DELETE FROM braincraze.sessions WHERE id=$1 AND user_id=$2",
        [id, user.id],
      );
      if (id === user.session_id) await clearSession();
      return json({
        message: bcText("ui.5e4762e598cb3f8c"),
        current: id === user.session_id,
      });
    }
    if (action === "revoke-other-sessions") {
      const user = await requireUser(true);
      await db.query(
        "DELETE FROM braincraze.sessions WHERE user_id=$1 AND id<>$2",
        [user.id, user.session_id],
      );
      return json({ message: bcText("ui.113cf4a703f6163f") });
    }
    throw new AuthError(404, bcText("ui.9655eebc96749ab6"));
  } catch (error) {
    if (
      (action.startsWith("oauth/") && method !== "POST") ||
      (action.startsWith("oauth/") && parts[1] === "apple")
    ) {
      const message =
        error instanceof AuthError
          ? error.message
          : "Social sign-in could not be completed.";
      const target = new URL("/login", appOrigin());
      target.searchParams.set("error", message);
      return NextResponse.redirect(target, 303);
    }
    if (error instanceof z.ZodError)
      return json(
        {
          error: bcText("ui.4a3ac9bb1378a7e9"),
          fields: validationFields(error),
        },
        400,
      );
    if (error instanceof AuthError)
      return json({ error: error.message, fields: error.fields }, error.status);
    if ((error as { code?: string }).code === "23505")
      return json(
        {
          error:
            bcText("ui.a7baf1dd0b00b438"),
        },
        409,
      );
    console.error(
      "Authentication request failed.",
      error instanceof Error ? error.name : "UnknownError",
    );
    return json(
      {
        error: bcText("ui.3415f57b771ebdf1"),
      },
      503,
    );
  }
}
