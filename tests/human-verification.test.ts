import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../apps/web/lib/auth/db";
import { digest, randomToken } from "../apps/web/lib/auth/security";
import {
  captchaConfiguration,
  createHumanChallenge,
  completeHumanVerification,
  humanVerificationStatus,
  verifyProviderToken,
} from "../apps/web/lib/auth/human-verification";
import {
  captchaProviders,
  type CaptchaProvider,
} from "../apps/web/lib/auth/human-contracts";

const origin = process.env.APP_BASE_URL!;
const userIds: string[] = [];
const saved = Object.fromEntries(
  [
    "CAPTCHA_PROVIDER",
    "RECAPTCHA_SITE_KEY",
    "RECAPTCHA_SECRET_KEY",
    "HCAPTCHA_SITE_KEY",
    "HCAPTCHA_SECRET_KEY",
    "TURNSTILE_SITE_KEY",
    "TURNSTILE_SECRET_KEY",
  ].map((key) => [key, process.env[key]]),
);
function configure(provider: CaptchaProvider = "turnstile") {
  process.env.CAPTCHA_PROVIDER = provider;
  for (const prefix of ["RECAPTCHA", "HCAPTCHA", "TURNSTILE"]) {
    process.env[`${prefix}_SITE_KEY`] = "unit-test-public-site";
    process.env[`${prefix}_SECRET_KEY`] = "unit-test-secret-not-a-live-key";
  }
}
beforeEach(() => configure());
after(async () => {
  await db.query("DELETE FROM braincraze.users WHERE id=ANY($1)", [userIds]);
  await db.end();
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
function providerReply(
  challengeId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    success: true,
    hostname: new URL(origin).hostname,
    challenge_ts: new Date().toISOString(),
    action: "braincraze_human",
    cdata: challengeId,
    ...overrides,
  };
}
function transport(payload: unknown, status = 200): typeof fetch {
  return async () => Response.json(payload, { status });
}
async function fixture(emailVerified = true) {
  const id = randomUUID(),
    sessionId = randomUUID(),
    token = randomToken();
  userIds.push(id);
  await db.query(
    `INSERT INTO braincraze.users(id,first_name,last_name,username,email,school,role,email_verified_at) VALUES($1,'Human','Fixture',$2,$3,'Test fixture school','Student',CASE WHEN $4 THEN now() ELSE NULL END)`,
    [
      id,
      `human_${id.replaceAll("-", "").slice(0, 20)}`,
      `human-${id}@example.test`,
      emailVerified,
    ],
  );
  await db.query(
    `INSERT INTO braincraze.sessions(id,user_id,token_hash,user_agent,expires_at,remember) VALUES($1,$2,$3,'Human verification test fixture',now()+interval '12 hours',false)`,
    [sessionId, id, digest(token)],
  );
  return { id, sessionId, cookie: `bc_session=${token}` };
}
async function flag(id: string) {
  return (
    await db.query("SELECT human_verified FROM braincraze.users WHERE id=$1", [
      id,
    ])
  ).rows[0].human_verified;
}
async function api(
  path: string,
  cookie?: string,
  body?: unknown,
  requestOrigin = origin,
) {
  return fetch(`${origin}/api/auth/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body === undefined
        ? {}
        : { "Content-Type": "application/json", Origin: requestOrigin }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "manual",
  });
}

test("all three provider adapters post to fixed HTTPS endpoints and require a verified response", async () => {
  for (const provider of captchaProviders) {
    configure(provider);
    const challenge = randomUUID();
    let called = false;
    const fetcher: typeof fetch = async (input, init) => {
      called = true;
      const url = String(input);
      assert.ok(url.startsWith("https://"));
      assert.ok(url.endsWith("/siteverify"));
      assert.equal(init?.method, "POST");
      assert.equal(init?.redirect, "error");
      const form = init?.body as URLSearchParams;
      assert.equal(form.get("response"), "fixture-response");
      assert.equal(form.get("secret"), "unit-test-secret-not-a-live-key");
      if (provider === "hcaptcha")
        assert.equal(form.get("sitekey"), "unit-test-public-site");
      assert.equal(
        url,
        provider === "recaptcha"
          ? "https://www.google.com/recaptcha/api/siteverify"
          : provider === "hcaptcha"
            ? "https://api.hcaptcha.com/siteverify"
            : "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      );
      return Response.json(providerReply(challenge));
    };
    await verifyProviderToken(provider, "fixture-response", challenge, fetcher);
    assert.equal(called, true);
  }
});

test("provider failures, malformed results, wrong hostname, old/future timestamp, nonce and action fail closed", async () => {
  const challenge = randomUUID();
  for (const provider of captchaProviders) {
    configure(provider);
    const invalid = [
      { success: false },
      { success: "true" },
      null,
      { success: true },
      providerReply(challenge, { hostname: "attacker.invalid" }),
      providerReply(challenge, { challenge_ts: "invalid" }),
      providerReply(challenge, {
        challenge_ts: new Date(Date.now() - 6 * 60000).toISOString(),
      }),
      providerReply(challenge, {
        challenge_ts: new Date(Date.now() + 2 * 60000).toISOString(),
      }),
    ];
    for (const reply of invalid)
      await assert.rejects(
        verifyProviderToken(
          provider,
          "fixture-response",
          challenge,
          transport(reply),
        ),
      );
    await assert.rejects(
      verifyProviderToken(
        provider,
        "fixture-response",
        challenge,
        transport({}, 503),
      ),
      { status: 503 },
    );
    await assert.rejects(
      verifyProviderToken(provider, "fixture-response", challenge, async () => {
        throw new Error("network failure");
      }),
      { status: 503 },
    );
    await assert.rejects(
      verifyProviderToken(
        provider,
        "fixture-response",
        challenge,
        async () => new Response("{invalid"),
      ),
      { status: 503 },
    );
  }
  configure();
  await assert.rejects(
    verifyProviderToken(
      "turnstile",
      "fixture",
      challenge,
      transport(providerReply(challenge, { action: "other" })),
    ),
    { status: 400 },
  );
  await assert.rejects(
    verifyProviderToken(
      "turnstile",
      "fixture",
      challenge,
      transport(providerReply(challenge, { cdata: randomUUID() })),
    ),
    { status: 400 },
  );
});

test("missing keys and unsupported configuration fail before contacting a provider", async () => {
  delete process.env.TURNSTILE_SECRET_KEY;
  let calls = 0;
  await assert.rejects(
    verifyProviderToken("turnstile", "fixture", randomUUID(), async () => {
      calls++;
      return Response.json({ success: true });
    }),
    { status: 503 },
  );
  assert.equal(calls, 0);
  assert.equal(captchaConfiguration().configured, false);
  process.env.CAPTCHA_PROVIDER = "not-a-provider";
  assert.throws(() => captchaConfiguration(), { status: 503 });
});

test("email verification is mandatory and users cannot forge a verified flag through the API", async () => {
  const unverified = await fixture(false);
  await assert.rejects(
    createHumanChallenge(unverified.id, unverified.sessionId),
    { status: 403 },
  );
  assert.equal(await flag(unverified.id), false);
  assert.equal((await api("human-status")).status, 401);
  assert.equal((await api("human-status", unverified.cookie)).status, 403);
  assert.equal(
    (
      await api("verify-human", unverified.cookie, {
        token: "fixture",
        challengeId: randomUUID(),
      })
    ).status,
    403,
  );
  const verified = await fixture();
  assert.equal(
    (await api("verify-human", verified.cookie, { human_verified: true }))
      .status,
    400,
  );
  assert.equal(
    (
      await api("verify-human", verified.cookie, {
        token: "fixture",
        challengeId: randomUUID(),
        human_verified: true,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await api(
        "verify-human",
        verified.cookie,
        { token: "fixture", challengeId: randomUUID() },
        "https://attacker.invalid",
      )
    ).status,
    403,
  );
  // Step 10 allows email-verified owners to manage sessions while affiliation checks are pending.
  assert.equal((await api("sessions", verified.cookie)).status, 200);
  const page = await fetch(`${origin}/account`, {
    headers: { Cookie: verified.cookie },
    redirect: "manual",
  });
  assert.equal(page.status, 307);
  assert.ok(page.headers.get("location")?.includes("/human-verification"));
  assert.equal(await flag(verified.id), false);
});

test("accepted mocked provider response persists human state; Step 4 remains gated", async () => {
  const user = await fixture();
  const challenge = await createHumanChallenge(user.id, user.sessionId);
  assert.ok(challenge.challengeId);
  const token = randomToken();
  const result = await completeHumanVerification(
    user.id,
    user.sessionId,
    challenge.challengeId!,
    token,
    transport(providerReply(challenge.challengeId!)),
  );
  assert.equal(result.humanVerified, true);
  assert.equal(await flag(user.id), true);
  const saved = await db.query(
    "SELECT human_verified_at,human_verification_provider FROM braincraze.users WHERE id=$1",
    [user.id],
  );
  assert.ok(saved.rows[0].human_verified_at);
  assert.equal(saved.rows[0].human_verification_provider, "turnstile");
  const proofs = await db.query(
    "SELECT token_hash FROM braincraze.human_verification_tokens WHERE user_id=$1",
    [user.id],
  );
  assert.equal(proofs.rows[0].token_hash === token, false);
  assert.equal(proofs.rows[0].token_hash.length, 64);
  assert.equal((await humanVerificationStatus(user.id)).humanVerified, true);
  assert.equal((await api("sessions", user.cookie)).status, 200);
  assert.equal(
    (
      await fetch(`${origin}/account`, {
        headers: { Cookie: user.cookie },
        redirect: "manual",
      })
    ).status,
    307,
  );
});

test("rejected provider result consumes the attempt without unlocking, and a fresh challenge can succeed", async () => {
  const user = await fixture();
  const challenge = await createHumanChallenge(user.id, user.sessionId);
  const token = randomToken();
  await assert.rejects(
    completeHumanVerification(
      user.id,
      user.sessionId,
      challenge.challengeId!,
      token,
      transport({ success: false }),
    ),
    { status: 400 },
  );
  assert.equal(await flag(user.id), false);
  let calls = 0;
  await assert.rejects(
    completeHumanVerification(
      user.id,
      user.sessionId,
      challenge.challengeId!,
      token,
      async () => {
        calls++;
        return Response.json(providerReply(challenge.challengeId!));
      },
    ),
    { status: 400 },
  );
  assert.equal(calls, 0);
  const fresh = await createHumanChallenge(user.id, user.sessionId);
  await completeHumanVerification(
    user.id,
    user.sessionId,
    fresh.challengeId!,
    randomToken(),
    transport(providerReply(fresh.challengeId!)),
  );
  assert.equal(await flag(user.id), true);
});

test("tokens cannot be replayed across accounts and challenges cannot cross sessions or outlive expiry", async () => {
  const first = await fixture(),
    second = await fixture();
  const a = await createHumanChallenge(first.id, first.sessionId),
    b = await createHumanChallenge(second.id, second.sessionId);
  const token = randomToken();
  await completeHumanVerification(
    first.id,
    first.sessionId,
    a.challengeId!,
    token,
    transport(providerReply(a.challengeId!)),
  );
  await assert.rejects(
    completeHumanVerification(
      second.id,
      second.sessionId,
      b.challengeId!,
      token,
      transport(providerReply(b.challengeId!)),
    ),
    { status: 400 },
  );
  assert.equal(await flag(second.id), false);
  const fresh = await createHumanChallenge(second.id, second.sessionId);
  await assert.rejects(
    completeHumanVerification(
      second.id,
      second.sessionId,
      a.challengeId!,
      randomToken(),
      transport(providerReply(a.challengeId!)),
    ),
    { status: 400 },
  );
  await db.query(
    "UPDATE braincraze.human_verification_challenges SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
    [fresh.challengeId],
  );
  await assert.rejects(
    completeHumanVerification(
      second.id,
      second.sessionId,
      fresh.challengeId!,
      randomToken(),
      transport(providerReply(fresh.challengeId!)),
    ),
    { status: 400 },
  );
  assert.equal(await flag(second.id), false);
});

test("session revocation while the provider request is in flight prevents approval", async () => {
  const user = await fixture(),
    challenge = await createHumanChallenge(user.id, user.sessionId);
  await assert.rejects(
    completeHumanVerification(
      user.id,
      user.sessionId,
      challenge.challengeId!,
      randomToken(),
      async () => {
        await db.query("DELETE FROM braincraze.sessions WHERE id=$1", [
          user.sessionId,
        ]);
        return Response.json(providerReply(challenge.challengeId!));
      },
    ),
    { status: 401 },
  );
  assert.equal(await flag(user.id), false);
});
