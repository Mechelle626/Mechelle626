import { message as bcText } from "../../../../lib/i18n/source";
import type Stripe from "stripe";
import {
  stripeClient,
  reconcileCustomer,
} from "../../../../lib/platform/billing";
import { bytes, json, failure } from "../../../../lib/platform/http";
import { AuthError } from "../../../../lib/auth/security";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const stripe = stripeClient(),
      signature = request.headers.get("stripe-signature");
    if (!signature) throw new AuthError(400, bcText("ui.1b45ab28651bb20c"));
    const raw = await bytes(request, 1024 * 1024);
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        raw,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET!,
      );
    } catch {
      throw new AuthError(400, bcText("ui.4906c90222064cb3"));
    }
    if (
      [
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
        "invoice.paid",
        "invoice.payment_failed",
      ].includes(event.type)
    ) {
      const object = event.data.object as unknown as {
        customer: string | { id: string } | null;
      };
      const customer =
        typeof object.customer === "string"
          ? object.customer
          : object.customer?.id;
      if (customer)
        await reconcileCustomer(customer, stripe, {
          id: event.id,
          type: event.type,
        });
    }
    return json({ received: true });
  } catch (error) {
    return failure(error);
  }
}
