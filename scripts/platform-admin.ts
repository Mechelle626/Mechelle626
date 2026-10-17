// Trusted operator CLI; this is intentionally not exposed through a registration or web endpoint.
import pg from "pg";
const [action, username] = process.argv.slice(2);
if (!["grant", "revoke"].includes(action) || !username)
  throw new Error("Usage: npm run platform:admin -- grant|revoke <username>");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const result = await pool.query(
    "UPDATE braincraze.users SET is_admin=$2 WHERE username=$1 RETURNING username",
    [username, action === "grant"],
  );
  if (!result.rowCount) throw new Error("Account not found.");
  console.log(
    `Administrator permission ${action === "grant" ? "granted" : "revoked"} for ${result.rows[0].username}. 2FA and recent verification remain required.`,
  );
} finally {
  await pool.end();
}
