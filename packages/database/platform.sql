-- Steps 7-12. Academic role is separate from administrator permission.
ALTER TABLE braincraze.users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;
ALTER TABLE braincraze.users ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active' CHECK(account_status IN ('active','suspended','banned'));
ALTER TABLE braincraze.sessions ADD COLUMN IF NOT EXISTS mfa_verified_at timestamptz;
CREATE TABLE IF NOT EXISTS braincraze.account_profiles (
 user_id uuid PRIMARY KEY REFERENCES braincraze.users(id) ON DELETE CASCADE,
 bio text NOT NULL DEFAULT '' CHECK(length(bio)<=1000),
 visibility text NOT NULL DEFAULT 'public' CHECK(visibility IN ('public','private','friends')),
 picture bytea CHECK(octet_length(picture)<=2097152), banner bytea CHECK(octet_length(banner)<=4194304),
 theme text NOT NULL DEFAULT 'classic' CHECK(theme IN ('classic','midnight','lavender')),
 buddy_skin text NOT NULL DEFAULT 'classic' CHECK(buddy_skin IN ('classic','fox','owl')),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS braincraze.friendships (
 requester_id uuid NOT NULL REFERENCES braincraze.users(id) ON DELETE CASCADE,
 recipient_id uuid NOT NULL REFERENCES braincraze.users(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted')),
 PRIMARY KEY(requester_id,recipient_id), CHECK(requester_id<>recipient_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS bc_friend_pair ON braincraze.friendships(LEAST(requester_id,recipient_id),GREATEST(requester_id,recipient_id));
CREATE TABLE IF NOT EXISTS braincraze.account_security (
 user_id uuid PRIMARY KEY REFERENCES braincraze.users(id) ON DELETE CASCADE,
 totp_secret text, pending_secret text, pending_expires_at timestamptz,
 enabled boolean NOT NULL DEFAULT false, last_counter bigint NOT NULL DEFAULT -1,
 recovery_hashes text[] NOT NULL DEFAULT '{}', CHECK(NOT enabled OR totp_secret IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS braincraze.mfa_logins (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES braincraze.users(id) ON DELETE CASCADE,
 remember boolean NOT NULL, user_agent text NOT NULL, expires_at timestamptz NOT NULL,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5)
);
CREATE TABLE IF NOT EXISTS braincraze.billing_customers (
 user_id uuid PRIMARY KEY REFERENCES braincraze.users(id) ON DELETE CASCADE,
 stripe_customer_id text UNIQUE, checkout_session_id text, checkout_expires_at timestamptz
);
CREATE TABLE IF NOT EXISTS braincraze.subscriptions (
 user_id uuid PRIMARY KEY REFERENCES braincraze.users(id) ON DELETE CASCADE,
 stripe_subscription_id text UNIQUE NOT NULL, stripe_price_id text NOT NULL,
 status text NOT NULL, period_end timestamptz NOT NULL,
 cancel_at_period_end boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS braincraze.stripe_events (
 id text PRIMARY KEY, event_type text NOT NULL, processed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS braincraze.admin_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES braincraze.users(id) ON DELETE SET NULL,
 subject_id uuid REFERENCES braincraze.users(id) ON DELETE SET NULL,
 action text NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS braincraze.posts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES braincraze.users(id) ON DELETE CASCADE,
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 3000),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS braincraze.messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES braincraze.users(id) ON DELETE CASCADE,
 recipient_id uuid NOT NULL REFERENCES braincraze.users(id) ON DELETE CASCADE,
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 3000),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS braincraze.listings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES braincraze.users(id) ON DELETE CASCADE,
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 160),body text NOT NULL CHECK(length(body) BETWEEN 1 AND 3000),
 price_cents integer NOT NULL CHECK(price_cents BETWEEN 0 AND 10000000),created_at timestamptz NOT NULL DEFAULT now()
);
-- Badges derive from current approval, never user-editable profile data or subscription.
CREATE OR REPLACE VIEW braincraze.verification_badges AS
 SELECT u.id AS user_id,u.verified_school_role AS role,u.verified_school_id AS school_id
 FROM braincraze.users u JOIN braincraze.schools s ON s.id=u.verified_school_id AND s.active
 WHERE u.account_status='active' AND u.email_verified_at IS NOT NULL AND u.human_verified AND u.school_verified
 AND EXISTS(SELECT 1 FROM braincraze.school_verification_requests r WHERE r.user_id=u.id
 AND r.status='approved' AND r.school_id=u.verified_school_id AND r.role=u.verified_school_role AND r.approved_at IS NOT NULL);
-- Policies apply to non-owner SQL roles. The trusted server must set app.user_id per transaction.
ALTER TABLE braincraze.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bc_message_participants ON braincraze.messages;
CREATE POLICY bc_message_participants ON braincraze.messages USING
 (user_id=NULLIF(current_setting('app.user_id',true),'')::uuid OR recipient_id=NULLIF(current_setting('app.user_id',true),'')::uuid)
 WITH CHECK(user_id=NULLIF(current_setting('app.user_id',true),'')::uuid);
ALTER TABLE braincraze.account_security ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bc_security_owner ON braincraze.account_security;
CREATE POLICY bc_security_owner ON braincraze.account_security USING(user_id=NULLIF(current_setting('app.user_id',true),'')::uuid);
REVOKE ALL ON braincraze.account_security,braincraze.mfa_logins,braincraze.billing_customers,braincraze.subscriptions,braincraze.stripe_events,braincraze.admin_audit FROM PUBLIC;
