import { appOrigin } from "../auth/security";
import { message as bcText } from "../i18n/source";
import { requireIdentity } from "../onboarding/flow";
import { z } from "zod";
import { db, transaction } from "../auth/db";
import { AuthError } from "../auth/security";
import type { AuthUser } from "../auth/session";
import { authorize } from "./access";
import { profile, visibleSql } from "./profiles";
const bodySchema = z.string().trim().min(1).max(3000);
export async function readContent(
  kind: "posts" | "messages" | "listings",
  user: AuthUser,
) {
  await requireIdentity(user.id);
  if (kind === "listings") await authorize("marketplace", user);
  const { rows } = await db.query(
    `SELECT c.id,c.body,c.created_at,u.username,u.first_name,u.last_name,b.role AS badge,
    EXISTS(SELECT 1 FROM braincraze.subscriptions sub WHERE sub.user_id=u.id AND sub.status='active' AND sub.period_end>now()) AS premium
    ${kind === "messages" ? ",recipient.username AS recipient,c.user_id=$1 AS sent" : kind === "listings" ? ",c.title,c.price_cents" : ""}
    FROM braincraze.${kind} c JOIN braincraze.users u ON u.id=c.user_id LEFT JOIN braincraze.account_profiles p ON p.user_id=u.id
    LEFT JOIN braincraze.verification_badges b ON b.user_id=u.id
    ${kind === "messages" ? "JOIN braincraze.users recipient ON recipient.id=c.recipient_id" : ""}
    WHERE u.account_status='active' AND ${kind === "messages" ? "(c.user_id=$1 OR c.recipient_id=$1)" : visibleSql("u", "$1")}
    ORDER BY c.created_at DESC LIMIT 100`,
    [user.id],
  );
  return rows;
}
export async function createContent(
  kind: "posts" | "messages" | "listings",
  user: AuthUser,
  body: unknown,
) {
  await requireIdentity(user.id);
  if (kind === "posts") {
    const input = z.object({ body: bodySchema }).strict().parse(body);
    await db.query("INSERT INTO braincraze.posts(user_id,body) VALUES($1,$2)", [
      user.id,
      input.body,
    ]);
    return;
  }
  if (kind === "messages") {
    const input = z
      .object({
        recipient: z.string().trim().toLowerCase().min(3).max(30),
        body: bodySchema,
      })
      .strict()
      .parse(body);
    const recipient = await profile(input.recipient, user.id);
    if (recipient.id === user.id)
      throw new AuthError(400, bcText("ui.b4b17533e7ef4072"));
    await transaction(async client=>{
      const message=await client.query("INSERT INTO braincraze.messages(user_id,recipient_id,body) VALUES($1,$2,$3) RETURNING id",[user.id,recipient.id,input.body]);
      await client.query(`INSERT INTO braincraze.localized_email_queue(user_id,template,template_values,deduplication_key) VALUES($1,'notification',$2,$3)`,[recipient.id,JSON.stringify([appOrigin()+"/messages"]),"message:"+message.rows[0].id]);
    });
    return;
  }
  await authorize("selling", user);
  const input = z
    .object({
      title: z.string().trim().min(1).max(160),
      body: bodySchema,
      priceCents: z.number().int().min(0).max(10000000),
    })
    .strict()
    .parse(body);
  await db.query(
    "INSERT INTO braincraze.listings(user_id,title,body,price_cents) VALUES($1,$2,$3,$4)",
    [user.id, input.title, input.body, input.priceCents],
  );
}
