import {queueSecurityNotice} from "../auth/security-notifications";
import { message as bcText } from "../i18n/source";
import { z } from "zod";
import sharp from "sharp";
import { db, transaction } from "../auth/db";
import { AuthError, hashPassword, passwordSchema } from "../auth/security";
import { type AuthUser } from "../auth/session";
import { rateLimit } from "../auth/rate-limit";
import { authorize } from "./access";
import { beginMfa, enableMfa, passwordCheck, useMfa } from "./mfa";
import { bytes } from "./http";
export const profileInput = z
  .object({
    bio: z.string().max(1000),
    visibility: z.enum(["public", "private", "friends"]),
  })
  .strict();
export async function settingsStatus(id: string) {
  const { rows } = await db.query(
    `SELECT u.first_name,u.last_name,u.username,u.email,COALESCE(p.bio,'') AS bio,COALESCE(p.visibility,'public') AS visibility,
    p.picture IS NOT NULL AS has_picture,p.banner IS NOT NULL AS has_banner,COALESCE(a.enabled,false) AS "twoFactorEnabled",
    (SELECT role FROM braincraze.verification_badges WHERE user_id=u.id) AS badge,
    EXISTS(SELECT 1 FROM braincraze.identities i WHERE i.user_id=u.id) AS socialLogin
    FROM braincraze.users u LEFT JOIN braincraze.account_profiles p ON p.user_id=u.id LEFT JOIN braincraze.account_security a ON a.user_id=u.id WHERE u.id=$1`,
    [id],
  );
  return rows[0];
}
export async function saveProfile(id: string, body: unknown) {
  const input = profileInput.parse(body);
  await db.query(
    `INSERT INTO braincraze.account_profiles(user_id,bio,visibility) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET bio=$2,visibility=$3,updated_at=now()`,
    [id, input.bio, input.visibility],
  );
}
export async function profileImage(user: AuthUser, request: Request) {
  const type = request.headers.get("content-type") ?? "";
  if (!type.startsWith("multipart/form-data;"))
    throw new AuthError(415, bcText("ui.1f48d73482637721"));
  const raw = await bytes(request, 5 * 1024 * 1024 + 65536);
  let form: FormData;
  try {
    form = await new Request(request.url, {
      method: "POST",
      headers: { "Content-Type": type },
      body: new Uint8Array(raw),
    }).formData();
  } catch {
    throw new AuthError(400, bcText("ui.07e54f9ec3c07507"));
  }
  if (
    Array.from(form.keys()).some((k) => !["kind", "image"].includes(k)) ||
    ["kind", "image"].some((k) => form.getAll(k).length !== 1)
  )
    throw new AuthError(400, bcText("ui.5ea242110e507ff4"));
  const kind = z.enum(["picture", "banner"]).parse(form.get("kind"));
  const file = form.get("image");
  if (
    !(file instanceof File) ||
    !file.size ||
    file.size > 5 * 1024 * 1024 ||
    !["image/jpeg", "image/png"].includes(file.type)
  )
    throw new AuthError(400, bcText("ui.3339c809c08e305f"));
  let image: Buffer;
  try {
    const input = Buffer.from(await file.arrayBuffer());
    const meta = await sharp(input, {
      limitInputPixels: 25000000,
      failOn: "warning",
    }).metadata();
    if (!["jpeg", "png"].includes(meta.format ?? "")) throw new Error();
    image = await sharp(input, {
      limitInputPixels: 25000000,
      failOn: "warning",
    })
      .rotate()
      .resize({
        width: kind === "picture" ? 512 : 1600,
        height: kind === "picture" ? 512 : 600,
        fit: "cover",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    throw new AuthError(400, bcText("ui.be84a321a0dd2947"));
  }
  await db.query(
    `INSERT INTO braincraze.account_profiles(user_id,${kind}) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET ${kind}=$2,updated_at=now()`,
    [user.id, image],
  );
}
export async function securityAction(
  user: AuthUser,
  action: string,
  body: unknown,
) {
  await rateLimit(`security:${user.id}`, 10, 900);
  if (action === "password") {
    const input = z
      .object({
        currentPassword: z.string().max(128),
        password: passwordSchema,
        code: z.string().max(40).default(""),
      })
      .strict()
      .parse(body);
    const original = await passwordCheck(user.id, input.currentPassword),
      password = await hashPassword(input.password);
    await transaction(async (client) => {
      const current = (
        await client.query(
          "SELECT password_hash FROM braincraze.users WHERE id=$1 FOR UPDATE",
          [user.id],
        )
      ).rows[0];
      if (current.password_hash !== original)
        throw new AuthError(409, bcText("ui.9e8889666a0885f0"));
      const mfa = (
        await client.query(
          "SELECT enabled FROM braincraze.account_security WHERE user_id=$1",
          [user.id],
        )
      ).rows[0];
      if (mfa?.enabled && !(await useMfa(client, user.id, input.code)))
        throw new AuthError(
          400,
          bcText("ui.9cd650d7445374cc"),
        );
      await client.query(
        "UPDATE braincraze.users SET password_hash=$2,updated_at=now() WHERE id=$1",
        [user.id, password],
      );
      await client.query(
        "DELETE FROM braincraze.challenges WHERE user_id=$1 AND kind='reset'",
        [user.id],
      );
      await client.query(
        "DELETE FROM braincraze.sessions WHERE user_id=$1 AND id<>$2",
        [user.id, user.session_id],
      );
      await queueSecurityNotice(client,user.id,"password_changed");
    });
    return { message: bcText("ui.eadb3362be235010") };
  }
  const input = z
    .object({
      password: z.string().max(128),
      code: z.string().max(40).default(""),
    })
    .strict()
    .parse(body);
  await passwordCheck(user.id, input.password);
  if (action === "mfa/setup") return beginMfa(user.id, user.email);
  if (action === "mfa/enable")
    return {
      recoveryCodes: await enableMfa(user.id, user.session_id, input.code),
    };
  if (action === "mfa/disable") {
    await transaction(async (client) => {
      if (!(await useMfa(client, user.id, input.code)))
        throw new AuthError(
          400,
          bcText("ui.9cd650d7445374cc"),
        );
      await client.query(
        "DELETE FROM braincraze.account_security WHERE user_id=$1",
        [user.id],
      );
      await client.query("DELETE FROM braincraze.mfa_logins WHERE user_id=$1", [
        user.id,
      ]);
      await client.query(
        "DELETE FROM braincraze.sessions WHERE user_id=$1 AND id<>$2",
        [user.id, user.session_id],
      );
      await client.query(
        "UPDATE braincraze.sessions SET mfa_verified_at=NULL WHERE user_id=$1",
        [user.id],
      );
      await queueSecurityNotice(client,user.id,"two_factor_disabled");
    });
    return {
      message:
        bcText("ui.4f5677c45ca94c35"),
    };
  }
  throw new AuthError(404, bcText("ui.9655eebc96749ab6"));
}
export async function appearance(user: AuthUser, body: unknown) {
  await authorize("themes", user);
  const input = z
    .object({
      theme: z.enum(["classic", "midnight", "lavender"]),
      skin: z.enum(["classic", "fox", "owl"]),
    })
    .strict()
    .parse(body);
  await db.query(
    `INSERT INTO braincraze.account_profiles(user_id,theme,buddy_skin) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET theme=$2,buddy_skin=$3,updated_at=now()`,
    [user.id, input.theme, input.skin],
  );
}
