import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import Stripe from "stripe";
import * as OTPAuth from "otpauth";
import sharp from "sharp";
import { db, transaction } from "../apps/web/lib/auth/db";
import { digest, hashPassword } from "../apps/web/lib/auth/security";
import {
  badgeFor,
  accessFor,
  allowed,
  features,
} from "../apps/web/lib/platform/access";
import { beginMfa, enableMfa, useMfa } from "../apps/web/lib/platform/mfa";
import {
  changeRenewal,
  invoiceLink,
  portal,
  checkout,
  assertPrice,
  subscriptionEntitlement,
  reconcileCustomer,
} from "../apps/web/lib/platform/billing";
import { removeDocument } from "../apps/web/lib/school/documents";
import { submitSchoolDocument } from "../apps/web/lib/school/service";
const origin = process.env.APP_BASE_URL!,
  schoolId = randomUUID(),
  users: string[] = [],
  keys: string[] = [],
  events: string[] = [];
const password = "BrainCraze platform fixture password!",
  hash = await hashPassword(password);
await db.query("INSERT INTO braincraze.schools(id,name) VALUES($1,$2)", [
  schoolId,
  `Platform fixture ${schoolId}`,
]);
async function fixture(role = "Student", approved = false, admin = false) {
  const id = randomUUID(),
    sid = randomUUID(),
    token = randomBytes(32).toString("hex"),
    username = "pl_" + id.replaceAll("-", "").slice(0, 18),
    email = username + "@example.test";
  users.push(id);
  await db.query(
    `INSERT INTO braincraze.users(id,first_name,last_name,username,email,password_hash,school,role,email_verified_at,human_verified,human_verified_at,human_verification_provider,is_admin) VALUES($1,'Platform','Fixture',$2,$3,$4,'Self-reported fixture',$5,now(),true,now(),'turnstile',$6)`,
    [id, username, email, hash, role, admin],
  );
  await db.query(
    "INSERT INTO braincraze.sessions(id,user_id,token_hash,user_agent,expires_at,remember) VALUES($1,$2,$3,'Platform fixture',now()+interval '12 hours',false)",
    [sid, id, digest(token)],
  );
  if (approved) {
    const key = randomUUID();
    await db.query(
      `INSERT INTO braincraze.school_verification_requests(user_id,school_id,role,method,status,document_key,document_mime,document_bytes,document_scan_status,approved_at) VALUES($1,$2,$3,'upload','approved',$4,'image/jpeg',10,'clean',now())`,
      [id, schoolId, role, key],
    );
    await db.query(
      "UPDATE braincraze.users SET school_verified=true,verified_school_id=$2,verified_school_role=$3,school_verified_at=now() WHERE id=$1",
      [id, schoolId, role],
    );
  }
  return {
    id,
    sid,
    cookie: `bc_session=${token}`,
    username,
    email,
    role,
    first_name: "Platform",
    last_name: "Fixture",
    session_id: sid,
    school: "Self-reported fixture",
    email_verified_at: new Date().toISOString(),
    human_verified: true,
    school_verified: approved,
    is_admin: admin,
  };
}
async function call(
  action: string,
  user?: { cookie: string },
  body?: unknown,
  requestOrigin = origin,
) {
  return fetch(`${origin}/api/platform/${action}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(user ? { Cookie: user.cookie } : {}),
      ...(body === undefined
        ? {}
        : { "Content-Type": "application/json", Origin: requestOrigin }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "manual",
  });
}
async function premium(id: string, status = "active", end = "1 day") {
  await db.query(
    `INSERT INTO braincraze.subscriptions(user_id,stripe_subscription_id,stripe_price_id,status,period_end) VALUES($1,$2,'price_platform_fixture',$3,now()+$4::interval) ON CONFLICT(user_id) DO UPDATE SET status=$3,period_end=now()+$4::interval`,
    [id, "sub_" + id, status, end],
  );
}
after(async () => {
  await db.query("DELETE FROM braincraze.admin_audit WHERE actor_id=ANY($1) OR subject_id=ANY($1)",[users]);
  for (const key of keys) await removeDocument(key);
  await db.query("DELETE FROM braincraze.stripe_events WHERE id=ANY($1)", [
    events,
  ]);
  await db.query("DELETE FROM braincraze.users WHERE id=ANY($1)", [users]);
  await db.query("DELETE FROM braincraze.schools WHERE id=$1", [schoolId]);
  await db.end();
});

test("all five badge labels derive from approved affiliation, never self-reported role or Premium", async () => {
  for (const role of [
    "Student",
    "Faculty",
    "Teaching Assistant",
    "Tutor",
    "Staff",
  ]) {
    const user = await fixture(role, true);
    assert.equal(await badgeFor(user.id), role);
    await db.query("UPDATE braincraze.users SET role='Student' WHERE id=$1", [
      user.id,
    ]);
    assert.equal(await badgeFor(user.id), role);
    await db.query(
      "UPDATE braincraze.school_verification_requests SET status='superseded' WHERE user_id=$1",
      [user.id],
    );
    assert.equal(await badgeFor(user.id), null);
  }
  const forged = await fixture();
  await db.query(
    "UPDATE braincraze.users SET school_verified=true,verified_school_role='Faculty',verified_school_id=$2 WHERE id=$1",
    [forged.id, schoolId],
  );
  await premium(forged.id);
  assert.equal(await badgeFor(forged.id), null);
});
test("feature rules cover every academic role, Free/Premium, verified state, expiry and payment failure", async () => {
  for (const role of [
    "Student",
    "Faculty",
    "Teaching Assistant",
    "Tutor",
    "Staff",
  ]) {
    const u = await fixture(role, true);
    let a = await accessFor(u.id);
    assert.equal(allowed("matching", a), true);
    assert.equal(allowed("marketplace", a), false);
    await premium(u.id);
    a = await accessFor(u.id);
    for (const f of features) assert.equal(allowed(f, a), true);
    await premium(u.id, "past_due");
    assert.equal((await accessFor(u.id)).premium, false);
    await premium(u.id, "active", "-1 second");
    assert.equal((await accessFor(u.id)).premium, false);
  }
});
test("HTTP authorization rejects forged grants, non-admins, unverified sellers, CSRF and private data access", async () => {
  const u = await fixture(),
    other = await fixture();
  assert.equal((await call("settings")).status, 401);
  assert.equal(
    (
      await call("settings/profile", u, {
        bio: "",
        visibility: "public",
        is_admin: true,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "settings/profile",
        u,
        { bio: "", visibility: "public" },
        "https://attacker.invalid",
      )
    ).status,
    403,
  );
  assert.equal((await call("admin/verifications", u)).status, 403);
  assert.equal((await call("features/analytics", u)).status, 403);
  assert.equal((await call("listings", u)).status, 403);
  await premium(u.id);
  assert.equal(
    (
      await call("listings", u, {
        title: "Fixture",
        body: "Not an actual sale",
        priceCents: 100,
      })
    ).status,
    403,
  );
  const r = await call("settings/profile", u, {
    bio: "Private bio fixture",
    visibility: "private",
  });
  assert.equal(r.status, 200);
  assert.equal((await call("profile/" + u.username, other)).status, 404);
  assert.equal((await call("profile/" + u.username, u)).status, 200);
});
test("friends-only profiles and media honor accepted connections and revoke access on removal", async () => {
  const a = await fixture(),
    b = await fixture();
  await call("settings/profile", a, {
    bio: "Friends only",
    visibility: "friends",
  });
  assert.equal((await call("profile/" + a.username, b)).status, 404);
  assert.equal(
    (await call("friends/request", b, { username: a.username })).status,
    200,
  );
  assert.equal((await call("profile/" + a.username, b)).status, 404);
  assert.equal(
    (await call("friends/respond", a, { requesterId: b.id, accept: true }))
      .status,
    200,
  );
  assert.equal((await call("profile/" + a.username, b)).status, 200);
  const png = await sharp({
    create: { width: 15, height: 10, channels: 3, background: "#fff" },
  })
    .png()
    .toBuffer();
  const f = new FormData();
  f.set("kind", "picture");
  f.set(
    "image",
    new Blob([new Uint8Array(png)], { type: "image/png" }),
    "fixture.png",
  );
  const uploaded = await fetch(origin + "/api/platform/settings/image", {
    method: "POST",
    headers: { Cookie: a.cookie, Origin: origin },
    body: f,
  });
  assert.equal(uploaded.status, 200);
  const media = await call(`media/${a.username}/picture`, b);
  assert.equal(media.status, 200);
  assert.equal(media.headers.get("content-type"), "image/jpeg");
  await call("friends/remove", a, { userId: b.id });
  assert.equal((await call(`media/${a.username}/picture`, b)).status, 404);
});
test("posts, messages, and marketplace listings use live badge status; message reads are participant-only", async () => {
  const a = await fixture("Tutor", true),
    b = await fixture(),
    third = await fixture();
  await premium(a.id);
  assert.equal(
    (await call("posts", a, { body: "Synthetic post" })).status,
    201,
  );
  assert.equal(
    (
      await call("messages", a, {
        recipient: b.username,
        body: "Synthetic private message",
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await call("listings", a, {
        title: "Fixture listing",
        body: "Synthetic listing, not a real offer",
        priceCents: 199,
      })
    ).status,
    201,
  );
  const posts = await (await call("posts", b)).json();
  assert.equal(
    posts.items.find((x: any) => x.username === a.username).badge,
    "Tutor",
  );
  const messages = await (await call("messages", b)).json();
  assert.equal(messages.items[0].badge, "Tutor");
  assert.equal((await (await call("messages", third)).json()).items.length, 0);
  await db.query(
    "UPDATE braincraze.users SET school_verified=false WHERE id=$1",
    [a.id],
  );
  const listings = await (await call("listings", a)).json();
  assert.equal(
    listings.items.find((x: any) => x.username === a.username).badge,
    null,
  );
});
test("2FA encrypts secrets, issues single-use recovery codes and gates password session creation", async () => {
  const u = await fixture();
  const start = await call("security/mfa/setup", u, { password });
  assert.equal(start.status, 200);
  const setup = await start.json();
  const stored = (
    await db.query(
      "SELECT * FROM braincraze.account_security WHERE user_id=$1",
      [u.id],
    )
  ).rows[0];
  assert.equal(stored.pending_secret.includes(setup.secret), false);
  const otp = new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(setup.secret),
    digits: 6,
    period: 30,
  });
  const enabled = await call("security/mfa/enable", u, {
    password,
    code: otp.generate(),
  });
  assert.equal(enabled.status, 200);
  const { recoveryCodes } = await enabled.json();
  assert.equal(recoveryCodes.length, 10);
  const login = await fetch(origin + "/api/auth/login", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ email: u.email, password, remember: true }),
  });
  assert.equal(login.status, 200);
  assert.equal((await login.json()).next, "/two-factor");
  const mfaCookie = login.headers
    .getSetCookie()
    .find((c) => c.startsWith("bc_mfa="))!
    .split(";")[0];
  assert.ok(mfaCookie);
  const finish = await fetch(origin + "/api/auth/two-factor", {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: mfaCookie,
    },
    body: JSON.stringify({ code: recoveryCodes[0] }),
  });
  assert.equal(finish.status, 200);
  assert.ok(
    finish.headers
      .getSetCookie()
      .some(
        (c) => c.startsWith("bc_session=") && !c.startsWith("bc_session=;"),
      ),
  );
  assert.equal(
    await transaction((c) => useMfa(c, u.id, recoveryCodes[0])),
    false,
  );
  const replay = await fetch(origin + "/api/auth/two-factor", {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: mfaCookie,
    },
    body: JSON.stringify({ code: recoveryCodes[1] }),
  });
  assert.equal(replay.status, 400);
  const denied = await call("security/password", u, {
    currentPassword: password,
    password: "A replacement secure password!",
    code: "000000",
  });
  assert.equal(denied.status, 400);
  assert.equal(
    (
      await call("security/mfa/disable", u, {
        password,
        code: recoveryCodes[2],
      })
    ).status,
    200,
  );
});
test("administrator review needs recent 2FA, clean scan, excludes self-review, and suspension revokes access and badges", async () => {
  const admin = await fixture("Staff", false, true),
    student = await fixture("Student", true);
  assert.equal((await call("admin/verifications", admin)).status, 403);
  const setup = await beginMfa(admin.id, admin.email);
  const otp = new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(setup.secret),
  });
  await enableMfa(admin.id, admin.sid, otp.generate());
  assert.equal((await call("admin/verifications", admin)).status, 200);
  const image = await sharp({
    create: { width: 12, height: 10, channels: 3, background: "#fff" },
  })
    .png()
    .toBuffer();
  const request = await submitSchoolDocument(
    student.id,
    student.sid,
    { schoolId, role: "Faculty" },
    "camera",
    image,
    "image/png",
  );
  const id = request.request!.id;
  keys.push(
    (
      await db.query(
        "SELECT document_key FROM braincraze.school_verification_requests WHERE id=$1",
        [id],
      )
    ).rows[0].document_key,
  );
  assert.equal(
    (
      await call("admin/action", admin, {
        id,
        action: "approve",
        reason: "Fixture approval reason",
      })
    ).status,
    400,
  );
  assert.equal((await call("admin/document/" + id, admin)).status, 403);
  await db.query(
    "UPDATE braincraze.school_verification_requests SET document_scan_status='clean' WHERE id=$1",
    [id],
  ); // explicit scan fixture only
  assert.equal((await call("admin/document/" + id, admin)).status, 200);
  assert.equal(
    (
      await call("admin/action", admin, {
        id,
        action: "approve",
        reason: "Synthetic identity fixture approval",
      })
    ).status,
    200,
  );
  assert.equal(await badgeFor(student.id), "Faculty");
  assert.equal(
    (
      await call("admin/action", admin, {
        id: student.id,
        action: "suspend",
        reason: "Fixture suspension",
      })
    ).status,
    200,
  );
  assert.equal(await badgeFor(student.id), null);
  assert.equal((await call("settings", student)).status, 401);
  assert.equal(
    (
      await call("admin/action", admin, {
        id: admin.id,
        action: "ban",
        reason: "Self moderation forbidden",
      })
    ).status,
    403,
  );
  await db.query(
    "UPDATE braincraze.sessions SET mfa_verified_at=now()-interval '16 minutes' WHERE id=$1",
    [admin.sid],
  );
  assert.equal((await call("admin/verifications", admin)).status, 403);
});

test("Stripe price validation, Checkout idempotency, duplicate-subscription prevention and canonical webhook reconciliation", async () => {
  process.env.STRIPE_PRICE_MONTHLY = "price_month_fixture";
  process.env.STRIPE_PRICE_YEARLY = "price_year_fixture";
  const price = {
    id: "price_month_fixture",
    active: true,
    currency: "usd",
    unit_amount: 799,
    recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
    billing_scheme: "per_unit",
  } as Stripe.Price;
  assertPrice(price, "monthly");
  assert.throws(() => assertPrice({ ...price, unit_amount: 1 }, "monthly"));
  const u = await fixture();
  let subs: Stripe.Subscription[] = [],
    creates = 0,
    lists = 0;
  const session = {
    id: "cs_fixture_" + u.id,
    url: "https://checkout.stripe.com/test-fixture",
    status: "open",
    expires_at: Math.floor(Date.now() / 1000) + 1800,
  };
  const api = {
    prices: { retrieve: async () => price },
    customers: { create: async () => ({ id: "cus_fixture_" + u.id }) },
    subscriptions: {
      list: async () => {
        lists++;
        return { data: subs };
      },
    },
    checkout: {
      sessions: {
        create: async () => {
          creates++;
          return session;
        },
        retrieve: async () => session,
        listLineItems: async () => ({ data: [{ price }] }),
        expire: async () => {},
      },
    },
  } as unknown as Stripe;
  assert.equal(await checkout(u, "monthly", api), session.url);
  assert.equal(await checkout(u, "monthly", api), session.url);
  assert.equal(creates, 1);
  const active = {
    id: "sub_fixture_" + u.id,
    customer: "cus_fixture_" + u.id,
    status: "active",
    created: 100,
    cancel_at_period_end: false,
    items: {
      data: [
        {
          quantity: 1,
          price,
          current_period_end: Math.floor(Date.now() / 1000) + 86400,
        },
      ],
    },
  } as unknown as Stripe.Subscription;
  assert.equal(subscriptionEntitlement(active)?.status, "active");
  subs = [active];
  await assert.rejects(checkout(u, "monthly", api), { status: 409 });
  const event = {
    id: "evt_fixture_" + randomUUID(),
    type: "customer.subscription.updated",
  };
  events.push(event.id);
  await reconcileCustomer("cus_fixture_" + u.id, api, event);
  assert.equal((await accessFor(u.id)).premium, true);
  const before = lists;
  await reconcileCustomer("cus_fixture_" + u.id, api, event);
  assert.equal(lists, before);
  subs = [{ ...active, status: "canceled" }];
  const older = {
    id: "evt_fixture_" + randomUUID(),
    type: "customer.subscription.created",
  };
  events.push(older.id);
  await reconcileCustomer("cus_fixture_" + u.id, api, older);
  assert.equal((await accessFor(u.id)).premium, false);
  subs = [
    {
      ...active,
      items: {
        ...active.items,
        data: [
          {
            ...active.items.data[0],
            price: { ...price, id: "price_unrecognized" },
          },
        ],
      },
    },
  ];
  await reconcileCustomer("cus_fixture_" + u.id, api);
  assert.equal((await accessFor(u.id)).premium, false);
});

test("Stripe signature checks reject tampering, and checkout returns cannot grant Premium", async () => {
  const stripe = new Stripe("sk_test_signature_fixture_only"),
    secret = "whsec_fixture_only_" + randomUUID();
  const payload = JSON.stringify({
    id: "evt_signature_fixture",
    object: "event",
    type: "customer.subscription.updated",
    data: { object: { customer: "cus_fixture" } },
  });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  assert.equal(
    stripe.webhooks.constructEvent(payload, header, secret).id,
    "evt_signature_fixture",
  );
  assert.throws(() =>
    stripe.webhooks.constructEvent(payload + " ", header, secret),
  );
  const u = await fixture();
  const result = await fetch(origin + "/billing?checkout=returned", {
    headers: { Cookie: u.cookie },
  });
  assert.equal(result.status, 200);
  assert.equal((await accessFor(u.id)).premium, false);
  const webhook = await fetch(origin + "/api/stripe/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": "invalid",
    },
    body: payload,
  });
  assert.ok([400, 503].includes(webhook.status));
  assert.equal((await accessFor(u.id)).premium, false);
});

test("PostgreSQL message RLS restricts a non-owner role to participants and rejects forged senders", async () => {
  const a = await fixture(),
    b = await fixture(),
    c = await fixture();
  await db.query(
    "INSERT INTO braincraze.messages(user_id,recipient_id,body) VALUES($1,$2,'RLS fixture')",
    [a.id, b.id],
  );
  const role = "bc_rls_" + randomUUID().replaceAll("-", "");
  await db.query(`CREATE ROLE ${role} NOLOGIN`);
  try {
    await db.query(`GRANT USAGE ON SCHEMA braincraze TO ${role}`);
    await db.query(`GRANT SELECT,INSERT ON braincraze.messages TO ${role}`);
    const count = await transaction(async (client) => {
      await client.query(`SET LOCAL ROLE ${role}`);
      await client.query("SELECT set_config('app.user_id',$1,true)", [c.id]);
      return (
        await client.query(
          "SELECT count(*)::int AS count FROM braincraze.messages",
        )
      ).rows[0].count;
    });
    assert.equal(count, 0);
    const own = await transaction(async (client) => {
      await client.query(`SET LOCAL ROLE ${role}`);
      await client.query("SELECT set_config('app.user_id',$1,true)", [b.id]);
      return (
        await client.query(
          "SELECT count(*)::int AS count FROM braincraze.messages",
        )
      ).rows[0].count;
    });
    assert.equal(own, 1);
    await assert.rejects(
      transaction(async (client) => {
        await client.query(`SET LOCAL ROLE ${role}`);
        await client.query("SELECT set_config('app.user_id',$1,true)", [c.id]);
        await client.query(
          "INSERT INTO braincraze.messages(user_id,recipient_id,body) VALUES($1,$2,'forged sender')",
          [a.id, b.id],
        );
      }),
      { code: "42501" },
    );
  } finally {
    await db.query(`DROP OWNED BY ${role}`);
    await db.query(`DROP ROLE ${role}`);
  }
});

test("billing cancellation, renewal, portal and invoice downloads are bound to the owner", async () => {
  const u = await fixture(),
    other = await fixture();
  await premium(u.id);
  const customer = "cus_invoice_fixture_" + u.id;
  await db.query(
    "INSERT INTO braincraze.billing_customers(user_id,stripe_customer_id) VALUES($1,$2)",
    [u.id, customer],
  );
  const updates: any[] = [],
    portals: any[] = [];
  let invoiceCustomer = customer,
    invoiceUrl = "https://pay.stripe.com/invoice/fixture.pdf";
  const api = {
    subscriptions: {
      update: async (id: string, body: unknown) => {
        updates.push({ id, body });
        return {};
      },
    },
    billingPortal: {
      sessions: {
        create: async (body: unknown) => {
          portals.push(body);
          return { url: "https://billing.stripe.com/fixture" };
        },
      },
    },
    invoices: {
      retrieve: async () => ({
        customer: invoiceCustomer,
        invoice_pdf: invoiceUrl,
      }),
    },
  } as unknown as Stripe;
  await changeRenewal(u.id, true, api);
  assert.equal(
    (
      await db.query(
        "SELECT cancel_at_period_end FROM braincraze.subscriptions WHERE user_id=$1",
        [u.id],
      )
    ).rows[0].cancel_at_period_end,
    true,
  );
  await changeRenewal(u.id, false, api);
  assert.equal(updates[0].id, "sub_" + u.id);
  assert.deepEqual(updates[1].body, { cancel_at_period_end: false });
  await assert.rejects(changeRenewal(other.id, true, api), { status: 400 });
  assert.equal(updates.length, 2);
  assert.equal(await portal(u.id, api), "https://billing.stripe.com/fixture");
  assert.equal(portals[0].customer, customer);
  assert.equal(await invoiceLink(u.id, "in_fixture", api), invoiceUrl);
  await assert.rejects(invoiceLink(other.id, "in_fixture", api), {
    status: 404,
  });
  invoiceCustomer = "cus_another_account";
  await assert.rejects(invoiceLink(u.id, "in_fixture", api), { status: 404 });
  invoiceCustomer = customer;
  invoiceUrl = "https://stripe.com.attacker.invalid/invoice.pdf";
  await assert.rejects(invoiceLink(u.id, "in_fixture", api), { status: 503 });
});
