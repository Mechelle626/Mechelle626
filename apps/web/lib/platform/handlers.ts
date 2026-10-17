import {adminOverview,adminSubscriptions} from "./overview";
import { message as bcText } from "../i18n/source";
import { requireIdentity } from "../onboarding/flow";
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "../auth/db";
import { requireUser } from "../auth/session";
import { AuthError } from "../auth/security";
import { rateLimit } from "../auth/rate-limit";
import { accessFor, authorize, features, requireAdmin } from "./access";
import {
  billingState,
  checkout,
  portal,
  invoiceLink,
  changeRenewal,
} from "./billing";
import { pendingVerifications, adminAction, reviewDocument } from "./admin";
import { profile, friends, visibleSql } from "./profiles";
import {
  settingsStatus,
  saveProfile,
  profileImage,
  securityAction,
  appearance,
} from "./settings";
import { readContent, createContent } from "./content";
import { failure, json, originCheck, readJson } from "./http";
export async function platformHandler(request: NextRequest, parts: string[]) {
  try {
    const user = await requireUser(true),
      action = parts.join("/");
    if (request.method === "GET") {
      if (action === "access") return json(await accessFor(user.id));
      if (action === "settings") return json(await settingsStatus(user.id));
      if (action === "billing") return json(await billingState(user.id));
      if (action === "friends")
        return json({ friends: await friends(user.id) });
      if (parts[0] === "profile" && parts.length === 2) {
        if (parts[1] !== user.username) await requireIdentity(user.id);
        return json(await profile(parts[1], user.id));
      }
      if (parts[0] === "media" && parts.length === 3) {
        if (parts[1] !== user.username) await requireIdentity(user.id);
        const person = await profile(parts[1], user.id),
          kind = z.enum(["picture", "banner"]).parse(parts[2]);
        const image = (
          await db.query(
            `SELECT ${kind} AS image FROM braincraze.account_profiles WHERE user_id=$1`,
            [person.id],
          )
        ).rows[0]?.image;
        if (!image) throw new AuthError(404, bcText("ui.e16d2aece4b14e4f"));
        return new Response(new Uint8Array(image), {
          headers: {
            "Content-Type": "image/jpeg",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
      if (action === "admin/overview") {await requireAdmin();return json(await adminOverview());}
      if (action === "admin/subscriptions") {
        await requireAdmin();
        const page=z.coerce.number().int().min(1).max(10000).parse(request.nextUrl.searchParams.get("page")??1);
        const status=z.enum(["","active","trialing","past_due","canceled","unpaid","incomplete","incomplete_expired","paused"]).parse(request.nextUrl.searchParams.get("status")??"");
        return json(await adminSubscriptions((request.nextUrl.searchParams.get("q")??"").slice(0,100),page,status));
      }
      if (action === "admin/verifications") {
        await requireAdmin();
        const page = z.coerce
          .number()
          .int()
          .min(1)
          .max(10000)
          .parse(request.nextUrl.searchParams.get("page") ?? 1);
        return json({
          requests: await pendingVerifications(
            request.nextUrl.searchParams.get("status") ?? "pending_review",
            page,
          ),
        });
      }
      if (action === "admin/users") {
        await requireAdmin();
        const q = (request.nextUrl.searchParams.get("q") ?? "").slice(0, 100);
        return json({
          users: (
            await db.query(
              "SELECT id,username,first_name,last_name,account_status,is_admin FROM braincraze.users WHERE strpos(lower(username),lower($1))>0 ORDER BY username LIMIT 50",
              [q],
            )
          ).rows,
        });
      }
      if (parts[0] === "admin" && parts[1] === "document" && parts.length === 3)
        return await reviewDocument(parts[2]);
      if (["posts", "messages", "listings"].includes(action))
        return json({
          items: await readContent(
            action as "posts" | "messages" | "listings",
            user,
          ),
        });
      if (parts[0] === "features" && parts.length === 2) {
        const feature = z.enum(features).parse(parts[1]);
        await authorize(feature, user);
        if (feature === "analytics")
          return json(
            (
              await db.query(
                `SELECT (SELECT count(*)::int FROM braincraze.posts WHERE user_id=$1) AS posts,(SELECT count(*)::int FROM braincraze.messages WHERE user_id=$1) AS messages,(SELECT count(*)::int FROM braincraze.listings WHERE user_id=$1) AS listings`,
                [user.id],
              )
            ).rows[0],
          );
        if (["matching", "tutors"].includes(feature))
          return json({
            people: (
              await db.query(
                `SELECT u.username,u.first_name,u.last_name,b.role AS badge,s.name AS school FROM braincraze.verification_badges b JOIN braincraze.users u ON u.id=b.user_id JOIN braincraze.schools s ON s.id=b.school_id LEFT JOIN braincraze.account_profiles p ON p.user_id=u.id WHERE u.id<>$1 AND ${visibleSql("u", "$1")} ${feature === "tutors" ? "AND b.role='Tutor'" : "AND b.school_id=(SELECT school_id FROM braincraze.verification_badges WHERE user_id=$1)"} ORDER BY u.username LIMIT 50`,
                [user.id],
              )
            ).rows,
          });
        return json({ allowed: true });
      }
      throw new AuthError(404, bcText("ui.9655eebc96749ab6"));
    }
    if (request.method !== "POST")
      throw new AuthError(405, bcText("ui.5765cf564d4dd7a2"));
    originCheck(request);
    await rateLimit(`platform:${user.id}`, 100, 60);
    if (action === "settings/image") {
      await rateLimit(`profile-image:${user.id}`, 20, 3600);
      await profileImage(user, request);
      return json({ message: bcText("ui.35267291a584d2fb") });
    }
    const body = await readJson(request);
    if (action === "settings/profile") {
      await saveProfile(user.id, body);
      return json({ message: bcText("ui.c1632eafd4468cab") });
    }
    if (action.startsWith("security/"))
      return json(await securityAction(user, action.slice(9), body));
    if (action === "settings/appearance") {
      await appearance(user, body);
      return json({ message: bcText("ui.122b49fe8f4ec9c9") });
    }
    if (action === "settings/remove-image") {
      const { kind } = z
        .object({ kind: z.enum(["picture", "banner"]) })
        .strict()
        .parse(body);
      await db.query(
        `UPDATE braincraze.account_profiles SET ${kind}=NULL,updated_at=now() WHERE user_id=$1`,
        [user.id],
      );
      return json({ message: bcText("ui.92464a2da31cb515") });
    }
    if (action === "friends/request") {
      const { username } = z
        .object({ username: z.string().trim().toLowerCase().min(3).max(30) })
        .strict()
        .parse(body);
      const target = (
        await db.query(
          "SELECT id FROM braincraze.users WHERE username=$1 AND account_status='active'",
          [username],
        )
      ).rows[0];
      if (!target || target.id === user.id)
        throw new AuthError(400, bcText("ui.45c6eaf40a9faf73"));
      await db.query(
        "INSERT INTO braincraze.friendships(requester_id,recipient_id) VALUES($1,$2)",
        [user.id, target.id],
      );
      return json({ message: bcText("ui.e05e1bacada2a3ba") });
    }
    if (action === "friends/respond") {
      const input = z
        .object({ requesterId: z.uuid(), accept: z.boolean() })
        .strict()
        .parse(body);
      if (input.accept)
        await db.query(
          "UPDATE braincraze.friendships SET status='accepted' WHERE requester_id=$1 AND recipient_id=$2 AND status='pending'",
          [input.requesterId, user.id],
        );
      else
        await db.query(
          "DELETE FROM braincraze.friendships WHERE requester_id=$1 AND recipient_id=$2",
          [input.requesterId, user.id],
        );
      return json({ message: bcText("ui.0c6d25be95c0753b") });
    }
    if (action === "friends/remove") {
      const { userId } = z.object({ userId: z.uuid() }).strict().parse(body);
      await db.query(
        "DELETE FROM braincraze.friendships WHERE (requester_id=$1 AND recipient_id=$2) OR (requester_id=$2 AND recipient_id=$1)",
        [user.id, userId],
      );
      return json({ message: bcText("ui.ef3b6e7ad07f3c38") });
    }
    if (action === "billing/checkout") {
      await requireUser(true, true);
      const { cycle } = z
        .object({ cycle: z.enum(["monthly", "yearly"]) })
        .strict()
        .parse(body);
      return json({ url: await checkout(user, cycle) });
    }
    if (action === "billing/portal")
      return json({ url: await portal(user.id) });
    if (action === "billing/cancel" || action === "billing/renew") {
      await changeRenewal(user.id, action === "billing/cancel");
      return json({
        message: action.endsWith("cancel")
          ? "Cancellation scheduled for the end of the paid period."
          : "Automatic renewal restored.",
      });
    }
    if (action === "billing/invoice") {
      const { id } = z
        .object({ id: z.string().regex(/^in_[a-zA-Z0-9]+$/) })
        .strict()
        .parse(body);
      return json({ url: await invoiceLink(user.id, id) });
    }
    if (action === "admin/action") {
      await rateLimit(`admin-action:${user.id}`, 30, 60);
      await adminAction(body);
      return json({ message: bcText("ui.29ce037bb609d56b") });
    }
    if (["posts", "messages", "listings"].includes(action)) {
      await requireUser(true, true);
      await requireIdentity(user.id);
      await createContent(
        action as "posts" | "messages" | "listings",
        user,
        body,
      );
      return json({ message: bcText("ui.fca046ccd586c67f") }, 201);
    }
    throw new AuthError(404, bcText("ui.9655eebc96749ab6"));
  } catch (error) {
    return failure(error);
  }
}
