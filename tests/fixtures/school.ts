// Explicit regression fixtures only. No application route imports this module.
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
const ids: string[] = [];
export async function approveSchoolFixture(pool: Pool, email: string) {
  const id = randomUUID();
  ids.push(id);
  await pool.query("INSERT INTO braincraze.schools(id,name) VALUES($1,$2)", [
    id,
    `Regression fixture school ${id}`,
  ]);
  await pool.query(
    "UPDATE braincraze.users SET identity_verification_status='verified',selfie_verification_status='verified',school_verified=true,verified_school_id=$2,verified_school_role=role,school_verified_at=now() WHERE email=$1",
    [email, id],
  );
  // Explicit synthetic identity/tutorial fixture for downstream authentication regressions.
  await pool.query(
    "INSERT INTO braincraze.onboarding_progress(user_id,tutorial_step,tutorial_status) SELECT id,10,'completed' FROM braincraze.users WHERE email=$1 ON CONFLICT(user_id) DO UPDATE SET tutorial_step=10,tutorial_status='completed'",
    [email],
  );
}
export async function cleanupSchoolFixtures(pool: Pool) {
  await pool.query("DELETE FROM braincraze.schools WHERE id=ANY($1)", [ids]);
  ids.length = 0;
}
