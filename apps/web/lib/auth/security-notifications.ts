import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { appOrigin } from "./security";
export type SecurityEvent =
  | "password_changed"
  | "password_reset"
  | "two_factor_enabled"
  | "two_factor_disabled";
// Called inside the transaction that changes the security state. No codes,
// passwords, recovery secrets, or caller-controlled destination URLs are stored.
export async function queueSecurityNotice(
  client: PoolClient,
  userId: string,
  event: SecurityEvent,
) {
  await client.query(
    `INSERT INTO braincraze.localized_email_queue(user_id,template,template_values,deduplication_key) VALUES($1,'security',$2,$3)`,
    [
      userId,
      JSON.stringify([appOrigin() + "/settings"]),
      `security:${event}:${randomUUID()}`,
    ],
  );
}
