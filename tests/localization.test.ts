import { formattingLocale } from "../apps/web/lib/i18n/config";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { db } from "../apps/web/lib/auth/db";
import { digest } from "../apps/web/lib/auth/security";
import { catalog, coverage, saveTranslation } from "../apps/web/lib/i18n/store";
import { renderEmail } from "../apps/web/lib/i18n/email";
const origin = process.env.APP_BASE_URL!,
  ids: string[] = [],
  code = "de-x-bctest";
let added = false;
async function fixture(admin = false) {
  const id = randomUUID(),
    sid = randomUUID(),
    token = randomBytes(32).toString("hex");
  ids.push(id);
  await db.query(
    `INSERT INTO braincraze.users(id,first_name,last_name,username,email,school,role,email_verified_at,human_verified,is_admin) VALUES($1,'Locale','Fixture',$2,$3,'Fixture','Student',now(),true,$4)`,
    [
      id,
      "loc_" + id.replaceAll("-", "").slice(0, 18),
      id + "@example.test",
      admin,
    ],
  );
  await db.query(
    `INSERT INTO braincraze.sessions(id,user_id,token_hash,user_agent,expires_at,remember,mfa_verified_at) VALUES($1,$2,$3,'Localization fixture',now()+interval '1 hour',false,now())`,
    [sid, id, digest(token)],
  );
  if (admin)
    await db.query(
      "INSERT INTO braincraze.account_security(user_id,enabled,totp_secret) VALUES($1,true,'test fixture not a secret')",
      [id],
    );
  return { id, sid, cookie: "bc_session=" + token };
}
async function api(
  path: string,
  user?: { cookie: string },
  body?: unknown,
  requestOrigin = origin,
) {
  return fetch(origin + "/api/localization/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(user ? { Cookie: user.cookie } : {}),
      ...(body === undefined
        ? {}
        : { Origin: requestOrigin, "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
after(async () => {
  if (added) {
    await db.query(
      "DELETE FROM braincraze.translation_reports WHERE language_id=(SELECT id FROM braincraze.languages WHERE code=$1)",
      [code],
    );
    await db.query(
      "DELETE FROM braincraze.translations WHERE language_id=(SELECT id FROM braincraze.languages WHERE code=$1)",
      [code],
    );
    await db.query("DELETE FROM braincraze.languages WHERE code=$1", [code]);
  }
  await db.query(
    "DELETE FROM braincraze.translation_audit WHERE actor_id=ANY($1)",
    [ids],
  );
  await db.query("DELETE FROM braincraze.users WHERE id=ANY($1)", [ids]);
  await db.end();
});
test("admin language additions, catalog editing, conflicts, placeholders, feedback, coverage and permissions", async () => {
  const admin = await fixture(true),
    member = await fixture();
  assert.equal((await api("coverage")).status, 401);
  assert.equal((await api("coverage", member)).status, 403);
  assert.equal(
    (
      await api(
        "languages",
        admin,
        {
          code,
          name: "German test language",
          nativeName: "Deutsch (test)",
          direction: "ltr",
          enabled: true,
        },
        "https://untrusted.example",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await api("languages", admin, {
        code,
        name: "German test language",
        nativeName: "Deutsch (test)",
        direction: "ltr",
        enabled: true,
      })
    ).status,
    200,
  );
  added = true;
  assert.ok(
    (await (await api("languages")).json()).languages.some(
      (x: any) => x.code === code,
    ),
  );
  const key = "email.verification.body",
    source = (await catalog("en"))[key];
  const edit = {
    language: code,
    key,
    value: "Ihr BrainCraze-Code: {0}.",
    status: "Pending Language Review",
    updatedAt: null,
  };
  assert.equal(
    (await api("translations", admin, { ...edit, value: "Lost placeholder" }))
      .status,
    400,
  );
  assert.equal((await api("translations", admin, edit)).status, 200);
  assert.equal((await api("translations", admin, edit)).status, 409);
  assert.equal((await catalog(code))[key], edit.value);
  const langCoverage = (await coverage()).find((x) => x.code === code);
  assert.equal(langCoverage.translated_keys, 1);
  assert.ok(langCoverage.missing_keys > 0);
  const pending = await (
    await api(
      "translations?language=" + code + "&status=Pending+Language+Review",
      admin,
    )
  ).json();
  assert.equal(pending.translations.length, 1);
  assert.equal(
    (
      await api("reports", member, {
        language: code,
        key,
        type: "Poor translation quality",
        notes: "Test fixture report",
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await api("reports", member, {
        language: code,
        key: "not-a-key",
        type: "Missing translation",
        notes: "Test",
      })
    ).status,
    404,
  );
  const reports = await (await api("reports", admin)).json(),
    report = reports.reports.find((x: any) => x.code === code);
  assert.ok(report);
  assert.equal(
    (await api("reports/review", admin, { id: report.id, status: "Resolved" }))
      .status,
    200,
  );
  assert.equal(
    (await api("reports/review", admin, { id: report.id, status: "Resolved" }))
      .status,
    409,
  );
  assert.equal(
    (
      await api("languages", admin, {
        code: "en",
        name: "English",
        nativeName: "English",
        direction: "ltr",
        enabled: false,
      })
    ).status,
    400,
  );
  await db.query(
    "UPDATE braincraze.sessions SET mfa_verified_at=now()-interval '16 minutes' WHERE id=$1",
    [admin.sid],
  );
  assert.equal((await api("coverage", admin)).status, 403);
});
test("all initial locales have draft email templates, exact tokens, direction and English fallback", async () => {
  const langs = (
    await db.query("SELECT code FROM braincraze.languages WHERE enabled")
  ).rows;
  for (const { code: c } of langs.filter((x) => x.code !== code)) {
    const email = await renderEmail("verification", c, ["123456"]);
    assert.ok(email.text.includes("123456"));
    assert.ok(!email.text.includes("{0}"));
    assert.equal(email.language, c);
    const reset = await renderEmail("reset", c, [
      "https://example.test/reset#token=fixture",
    ]);
    assert.ok(reset.text.includes("https://example.test/reset#token=fixture"));
    assert.ok(reset.text.includes("\n"));
  }
  assert.equal(
    (await renderEmail("verification", "invalid", ["123456"])).language,
    "en",
  );
  const count = (
    await db.query(
      `SELECT count(*)::int AS count FROM braincraze.translations t JOIN braincraze.languages l ON l.id=t.language_id WHERE l.code<>'en' AND t.updated_by IS NULL AND t.review_status IN ('Reviewed','Approved')`,
    )
  ).rows[0].count;
  assert.equal(count, 0);
});

test("OpenAI-compatible generation imports only validated pending drafts and rejects modified tokens", async () => {
  const code = "de-x-bcgen";
  let invalid = true;
  await db.query(
    "INSERT INTO braincraze.languages(code,language_name,native_name) VALUES($1,'Synthetic test language','Test')",
    [code],
  );
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    const input = JSON.parse(body),
      sources = JSON.parse(input.messages[1].content);
    const result = Object.fromEntries(
      Object.entries(sources).map(([key, value]) => [
        key,
        "Entwurf: " + value + (invalid ? " {999}" : ""),
      ]),
    );
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(result) } }],
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const run = () =>
    new Promise<number | null>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          "--import",
          "tsx",
          "scripts/generate-translations.ts",
          "--language=" + code,
          "--max-batches=1",
        ],
        {
          env: {
            ...process.env,
            I18N_AI_BASE_URL: "http://127.0.0.1:" + port + "/v1",
            I18N_AI_API_KEY: "synthetic-test-key",
            I18N_AI_MODEL: "synthetic-test-model",
          },
          stdio: "ignore",
        },
      );
      child.on("error", reject);
      child.on("close", resolve);
    });
  try {
    assert.notEqual(await run(), 0);
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM braincraze.translations WHERE language_id=(SELECT id FROM braincraze.languages WHERE code=$1)",
          [code],
        )
      ).rows[0].n,
      0,
    );
    invalid = false;
    assert.equal(await run(), 0);
    const rows = (
      await db.query(
        "SELECT review_status,translation_value FROM braincraze.translations WHERE language_id=(SELECT id FROM braincraze.languages WHERE code=$1)",
        [code],
      )
    ).rows;
    assert.equal(rows.length, 12);
    assert.ok(rows.every((r) => r.review_status === "Pending Language Review"));
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    await db.query(
      "DELETE FROM braincraze.translations WHERE language_id=(SELECT id FROM braincraze.languages WHERE code=$1)",
      [code],
    );
    await db.query("DELETE FROM braincraze.languages WHERE code=$1", [code]);
    await db.query(
      "DELETE FROM braincraze.translation_audit WHERE action='drafts.generated' AND details->>'language'=$1",
      [code],
    );
  }
});

test("regional formatting preserves explicit language regions and locale-sensitive dates, times, amounts and digits", () => {
  assert.equal(formattingLocale("fr", "CA"), "fr-CA");
  assert.equal(formattingLocale("fr-FR", "CA"), "fr-FR");
  assert.equal(formattingLocale("en", null), "en");
  assert.equal(
    new Intl.NumberFormat(formattingLocale("de", "DE"), {
      style: "currency",
      currency: "EUR",
    }).format(1234.5),
    new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: "EUR",
    }).format(1234.5),
  );
  const date = new Date("2026-10-17T16:30:00Z");
  assert.notEqual(
    new Intl.DateTimeFormat("en-US", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(date),
    new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(date),
  );
  assert.notEqual(
    new Intl.NumberFormat("ar-EG").format(1234),
    new Intl.NumberFormat("en-US").format(1234),
  );
});
