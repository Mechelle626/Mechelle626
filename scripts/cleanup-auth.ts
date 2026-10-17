import pg from "pg";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query(
    `DELETE FROM braincraze.sessions WHERE expires_at<now() OR last_seen_at<now()-CASE WHEN remember THEN interval '7 days' ELSE interval '30 minutes' END`,
  );
  await client.query(
    "DELETE FROM braincraze.challenges WHERE expires_at<now()",
  );
  await client.query(
    "DELETE FROM braincraze.oauth_flows WHERE expires_at<now()",
  );
  await client.query(
    "DELETE FROM braincraze.oauth_profiles WHERE expires_at<now()",
  );
  await client.query(
    "DELETE FROM braincraze.rate_limits WHERE resets_at<now()",
  );
  await client.query(
    'DELETE FROM braincraze."EmailVerification" WHERE expires_at<now() AND verified=false',
  );
  await client.query(
    "DELETE FROM braincraze.human_verification_challenges WHERE expires_at<clock_timestamp()",
  );
  await client.query(
    "DELETE FROM braincraze.human_verification_tokens WHERE created_at<clock_timestamp()-interval '24 hours'",
  );
  await client.query(
    "DELETE FROM braincraze.mfa_logins WHERE expires_at<now() OR attempts>=5",
  );
  await client.query(
    "UPDATE braincraze.account_security SET pending_secret=NULL,pending_expires_at=NULL WHERE pending_expires_at<now()",
  );
  await client.query("COMMIT");
  console.log("Expired authentication records removed.");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
