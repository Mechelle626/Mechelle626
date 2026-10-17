import { message as bcText } from "../i18n/source";
import { db } from "./db";
import { AuthError, proof } from "./security";
export async function rateLimit(key: string, limit: number, seconds: number) {
  const { rows } = await db.query(
    `INSERT INTO braincraze.rate_limits(key,count,resets_at) VALUES($1,1,now()+$2*interval '1 second') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN braincraze.rate_limits.resets_at<now() THEN 1 ELSE braincraze.rate_limits.count+1 END,resets_at=CASE WHEN braincraze.rate_limits.resets_at<now() THEN now()+$2*interval '1 second' ELSE braincraze.rate_limits.resets_at END RETURNING count`,
    [proof(key), seconds],
  );
  if (rows[0].count > limit)
    throw new AuthError(429, bcText("ui.d1de3635fd27f839"));
}
