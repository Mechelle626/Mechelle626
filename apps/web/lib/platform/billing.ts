import { message as bcText } from "../i18n/source";
import Stripe from "stripe";
import { db, transaction } from "../auth/db";
import { appOrigin, AuthError } from "../auth/security";
import type { AuthUser } from "../auth/session";
export const plans = {
  monthly: { cents: 799, interval: "month" },
  yearly: { cents: 6999, interval: "year" },
} as const;
export type Cycle = keyof typeof plans;
export function billingConfigured() {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_PRICE_MONTHLY &&
    process.env.STRIPE_PRICE_YEARLY &&
    process.env.STRIPE_WEBHOOK_SECRET,
  );
}
export function stripeClient() {
  if (!billingConfigured())
    throw new AuthError(
      503,
      bcText("ui.0b8c64e1472f5ed5"),
    );
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    maxNetworkRetries: 2,
    timeout: 15000,
  });
}
export function priceId(cycle: Cycle) {
  return (
    cycle === "monthly"
      ? process.env.STRIPE_PRICE_MONTHLY
      : process.env.STRIPE_PRICE_YEARLY
  )!;
}
export function assertPrice(price: Stripe.Price, cycle: Cycle, requireActive = true) {
  if (
    (requireActive && !price.active) ||
    price.currency !== "usd" ||
    price.unit_amount !== plans[cycle].cents ||
    price.recurring?.interval !== plans[cycle].interval ||
    price.recurring.interval_count !== 1 ||
    price.recurring.usage_type !== "licensed" ||
    price.billing_scheme !== "per_unit"
  )
    throw new AuthError(
      503,
      bcText("ui.27eed6d91c91934b"),
    );
}
export function subscriptionEntitlement(subscription: Stripe.Subscription) {
  const item = subscription.items.data[0];
  const cycle =
    item?.price.id === priceId("monthly")
      ? "monthly"
      : item?.price.id === priceId("yearly")
        ? "yearly"
        : null;
  if (!cycle || subscription.items.data.length !== 1 || item.quantity !== 1)
    return null;
  try {
    assertPrice(item.price, cycle, false);
  } catch {
    return null;
  }
  return {
    subscriptionId: subscription.id,
    priceId: item.price.id,
    status: subscription.status,
    periodEnd: new Date(item.current_period_end * 1000),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    cycle,
  };
}
export async function checkout(
  user: AuthUser,
  cycle: Cycle,
  stripe = stripeClient(),
) {
  // Serialize creation and retain a reusable pending Checkout Session to prevent double subscription checkout.
  return transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      "billing:" + user.id,
    ]);
    const price = await stripe.prices.retrieve(priceId(cycle));
    assertPrice(price, cycle);
    await client.query(
      "INSERT INTO braincraze.billing_customers(user_id) VALUES($1) ON CONFLICT DO NOTHING",
      [user.id],
    );
    let row = (
      await client.query(
        "SELECT * FROM braincraze.billing_customers WHERE user_id=$1 FOR UPDATE",
        [user.id],
      )
    ).rows[0];
    if (!row.stripe_customer_id) {
      const customer = await stripe.customers.create(
        {
          email: user.email,
          name: `${user.first_name} ${user.last_name}`,
          metadata: { braincraze_user_id: user.id },
        },
        { idempotencyKey: "bc-customer-" + user.id },
      );
      await client.query(
        "UPDATE braincraze.billing_customers SET stripe_customer_id=$2 WHERE user_id=$1",
        [user.id, customer.id],
      );
      row = { ...row, stripe_customer_id: customer.id };
    }
    const existing = await stripe.subscriptions.list({
      customer: row.stripe_customer_id,
      status: "all",
      limit: 100,
    });
    if (
      existing.data.some(
        (s) => !["canceled", "incomplete_expired"].includes(s.status),
      )
    )
      throw new AuthError(
        409,
        bcText("ui.e9dfb4257ad0a353"),
      );
    if (
      row.checkout_session_id &&
      new Date(row.checkout_expires_at).getTime() > Date.now()
    ) {
      const pending = await stripe.checkout.sessions.retrieve(
        row.checkout_session_id,
      );
      if (pending.status === "open" && pending.url) {
        const items = await stripe.checkout.sessions.listLineItems(pending.id);
        if (items.data[0]?.price?.id === price.id) return pending.url;
        await stripe.checkout.sessions.expire(pending.id);
      } else if (pending.status === "complete")
        throw new AuthError(
          409,
          bcText("ui.2d7866f37e457ba9"),
        );
    }
    // Deterministic key for a short window also covers a network failure after Stripe created the session.
    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer: row.stripe_customer_id,
        line_items: [{ price: price.id, quantity: 1 }],
        client_reference_id: user.id,
        subscription_data: { metadata: { braincraze_user_id: user.id } },
        success_url: appOrigin() + "/billing?checkout=returned",
        cancel_url: appOrigin() + "/subscription?checkout=cancelled",
      },
      {
        idempotencyKey: `bc-checkout-${user.id}-${cycle}-${row.checkout_session_id ?? "initial"}-${Math.floor(Date.now() / 1800000)}`,
      },
    );
    if (!session.url)
      throw new AuthError(503, bcText("ui.d33fcd88d906d523"));
    await client.query(
      "UPDATE braincraze.billing_customers SET checkout_session_id=$2,checkout_expires_at=to_timestamp($3) WHERE user_id=$1",
      [user.id, session.id, session.expires_at],
    );
    return session.url;
  });
}
export async function reconcileCustomer(
  customerId: string,
  stripe: Stripe,
  event?: { id: string; type: string },
) {
  return transaction(async (client) => {
    const owner = (
      await client.query(
        "SELECT user_id FROM braincraze.billing_customers WHERE stripe_customer_id=$1",
        [customerId],
      )
    ).rows[0];
    if (!owner) return;
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      "billing:" + owner.user_id,
    ]);
    if (
      event &&
      (
        await client.query(
          "SELECT id FROM braincraze.stripe_events WHERE id=$1",
          [event.id],
        )
      ).rowCount
    )
      return;
    // Read current Stripe state under the same lock even for out-of-order events.
    const list = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 100,
      expand: ["data.default_payment_method"],
    });
    const candidates = list.data
      .map((s) => ({ s, value: subscriptionEntitlement(s) }))
      .filter((x) => x.value);
    candidates.sort(
      (a, b) =>
        Number(b.s.status === "active") - Number(a.s.status === "active") ||
        b.s.created - a.s.created,
    );
    const selected = candidates[0]?.value;
    if (selected)
      await client.query(
        `INSERT INTO braincraze.subscriptions(user_id,stripe_subscription_id,stripe_price_id,status,period_end,cancel_at_period_end) VALUES($1,$2,$3,$4,$5,$6)
      ON CONFLICT(user_id) DO UPDATE SET stripe_subscription_id=EXCLUDED.stripe_subscription_id,stripe_price_id=EXCLUDED.stripe_price_id,status=EXCLUDED.status,period_end=EXCLUDED.period_end,cancel_at_period_end=EXCLUDED.cancel_at_period_end,updated_at=now()`,
        [
          owner.user_id,
          selected.subscriptionId,
          selected.priceId,
          selected.status,
          selected.periodEnd,
          selected.cancelAtPeriodEnd,
        ],
      );
    else
      await client.query(
        "DELETE FROM braincraze.subscriptions WHERE user_id=$1",
        [owner.user_id],
      );
    if(event && /^(customer\.subscription\.|invoice\.)/.test(event.type))
      await client.query(`INSERT INTO braincraze.localized_email_queue(user_id,template,template_values,deduplication_key) VALUES($1,'subscription',$2,$3) ON CONFLICT(deduplication_key) DO NOTHING`,[owner.user_id,JSON.stringify([appOrigin()+"/billing"]),"stripe:"+event.id]);
    if (event)
      await client.query(
        "INSERT INTO braincraze.stripe_events(id,event_type) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [event.id, event.type],
      );
  });
}
export async function billingState(userId: string, stripe?: Stripe) {
  const owner = (
    await db.query(
      "SELECT * FROM braincraze.billing_customers WHERE user_id=$1",
      [userId],
    )
  ).rows[0];
  if (owner?.stripe_customer_id && billingConfigured())
    await reconcileCustomer(owner.stripe_customer_id, stripe ?? stripeClient());
  const sub = (
    await db.query(
      "SELECT *,status='active' AND period_end>now() AS premium FROM braincraze.subscriptions WHERE user_id=$1",
      [userId],
    )
  ).rows[0];
  const base = {
    configured: billingConfigured(),
    plan: sub?.premium ? "Premium" : "Free",
    subscription: sub
      ? {
          status: sub.status,
          periodEnd: sub.period_end,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          cycle:
            sub.stripe_price_id === priceId("monthly") ? "monthly" : "yearly",
        }
      : null,
  };
  if (!owner?.stripe_customer_id || !billingConfigured())
    return { ...base, paymentMethod: null, invoices: [], hasCustomer: false };
  const api = stripe ?? stripeClient();
  const [customer, invoices, subscription] = await Promise.all([
    api.customers.retrieve(owner.stripe_customer_id, {
      expand: ["invoice_settings.default_payment_method"],
    }),
    api.invoices.list({ customer: owner.stripe_customer_id, limit: 30 }),
    sub
      ? api.subscriptions.retrieve(sub.stripe_subscription_id, {
          expand: ["default_payment_method"],
        })
      : null,
  ]);
  const method =
    subscription?.default_payment_method ||
    (!customer.deleted
      ? customer.invoice_settings.default_payment_method
      : null);
  const payment = method && typeof method !== "string" ? method : null;
  return {
    ...base,
    hasCustomer: true,
    paymentMethod: payment
      ? {
          type: payment.type,
          brand: payment.card?.brand,
          last4: payment.card?.last4,
          expMonth: payment.card?.exp_month,
          expYear: payment.card?.exp_year,
        }
      : null,
    invoices: invoices.data.map((i) => ({
      id: i.id,
      number: i.number,
      status: i.status,
      date: i.created,
      total: i.total,
      currency: i.currency,
      downloadable: Boolean(i.invoice_pdf),
    })),
  };
}
export async function portal(userId: string, api = stripeClient()) {
  const row = (
    await db.query(
      "SELECT stripe_customer_id FROM braincraze.billing_customers WHERE user_id=$1",
      [userId],
    )
  ).rows[0];
  if (!row?.stripe_customer_id)
    throw new AuthError(400, bcText("ui.4ce4bfc409211289"));
  return (
    await api.billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: appOrigin() + "/billing",
    })
  ).url;
}
export async function changeRenewal(
  userId: string,
  cancel: boolean,
  api = stripeClient(),
) {
  return transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      "billing:" + userId,
    ]);
    const row = (
      await client.query(
        "SELECT * FROM braincraze.subscriptions WHERE user_id=$1",
        [userId],
      )
    ).rows[0];
    if (!row || !["active", "past_due"].includes(row.status))
      throw new AuthError(
        400,
        bcText("ui.92d44b9acea4fb33"),
      );
    await api.subscriptions.update(row.stripe_subscription_id, {
      cancel_at_period_end: cancel,
    });
    await client.query(
      "UPDATE braincraze.subscriptions SET cancel_at_period_end=$2,updated_at=now() WHERE user_id=$1",
      [userId, cancel],
    );
  });
}
export async function invoiceLink(
  userId: string,
  id: string,
  api = stripeClient(),
) {
  const row = (
    await db.query(
      "SELECT stripe_customer_id FROM braincraze.billing_customers WHERE user_id=$1",
      [userId],
    )
  ).rows[0];
  if (!row?.stripe_customer_id) throw new AuthError(404, bcText("ui.886b9edf6b36f83b"));
  const invoice = await api.invoices.retrieve(id);
  const customer =
    typeof invoice.customer === "string"
      ? invoice.customer
      : invoice.customer?.id;
  if (customer !== row.stripe_customer_id || !invoice.invoice_pdf)
    throw new AuthError(404, bcText("ui.886b9edf6b36f83b"));
  const url = new URL(invoice.invoice_pdf);
  if (
    url.protocol !== "https:" ||
    !(url.hostname === "stripe.com" || url.hostname.endsWith(".stripe.com"))
  )
    throw new AuthError(503, bcText("ui.65d08af1cd9f6dfc"));
  return url.toString();
}
