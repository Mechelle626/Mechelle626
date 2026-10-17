-- BrainCraze Step 1. Separate namespace preserves the earlier BrainCraze scaffold.
CREATE SCHEMA IF NOT EXISTS braincraze;
CREATE TABLE IF NOT EXISTS braincraze.users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 first_name text NOT NULL, last_name text NOT NULL,
 username text NOT NULL UNIQUE CHECK (username = lower(username)),
 email text NOT NULL UNIQUE CHECK (email = lower(email)),
 password_hash text,
 school text NOT NULL,
 role text NOT NULL CHECK (role IN ('Student','Faculty','Teaching Assistant','Tutor','Staff')),
 email_verified_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS braincraze.sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES braincraze.users(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE, user_agent text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL, remember boolean NOT NULL
);
CREATE INDEX IF NOT EXISTS bc_sessions_user ON braincraze.sessions(user_id);
CREATE TABLE IF NOT EXISTS braincraze.challenges (
 user_id uuid NOT NULL REFERENCES braincraze.users(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK (kind IN ('verify','reset')),
 token_hash text NOT NULL, expires_at timestamptz NOT NULL,
 attempts integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (user_id,kind)
);
CREATE INDEX IF NOT EXISTS bc_challenge_hash ON braincraze.challenges(token_hash);
CREATE TABLE IF NOT EXISTS braincraze.identities (
 provider text NOT NULL CHECK (provider IN ('google','microsoft','apple')),
 subject text NOT NULL, user_id uuid NOT NULL REFERENCES braincraze.users(id) ON DELETE CASCADE,
 PRIMARY KEY(provider,subject)
);
CREATE TABLE IF NOT EXISTS braincraze.oauth_flows (
 state_hash text PRIMARY KEY, provider text NOT NULL, nonce text NOT NULL,
 verifier text NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS braincraze.oauth_profiles (
 token_hash text PRIMARY KEY, provider text NOT NULL, subject text NOT NULL,
 email text NOT NULL, email_verified boolean NOT NULL, first_name text NOT NULL, last_name text NOT NULL,
 expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS braincraze.rate_limits (
 key text PRIMARY KEY, count integer NOT NULL, resets_at timestamptz NOT NULL
);

-- Step 2: a dedicated ownership-verification record. `code` stores only an
-- account-bound HMAC-SHA256 digest, never the six-digit plaintext value.
CREATE TABLE IF NOT EXISTS braincraze."EmailVerification" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL UNIQUE REFERENCES braincraze.users(id) ON DELETE CASCADE,
 code text NOT NULL CHECK (code ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz NOT NULL,
 verified boolean NOT NULL DEFAULT false,
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
 created_at timestamptz NOT NULL DEFAULT now(),
 verified_at timestamptz,
 delivery_status text NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending','sent','failed')),
 CHECK (verified = (verified_at IS NOT NULL))
);
-- Preserve any previously issued Step 1 proof without exposing or extending it.
INSERT INTO braincraze."EmailVerification"(user_id,code,expires_at,attempts,created_at,delivery_status)
 SELECT user_id,token_hash,expires_at,LEAST(attempts,5),created_at,'sent'
 FROM braincraze.challenges WHERE kind='verify'
 ON CONFLICT(user_id) DO NOTHING;
DELETE FROM braincraze.challenges WHERE kind='verify';

-- Step 3: server-owned human-verification state. Existing users must complete it.
ALTER TABLE braincraze.users ADD COLUMN IF NOT EXISTS human_verified boolean NOT NULL DEFAULT false;
ALTER TABLE braincraze.users ADD COLUMN IF NOT EXISTS human_verified_at timestamptz;
ALTER TABLE braincraze.users ADD COLUMN IF NOT EXISTS human_verification_provider text
 CHECK (human_verification_provider IN ('recaptcha','hcaptcha','turnstile'));
CREATE TABLE IF NOT EXISTS braincraze.human_verification_challenges (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES braincraze.users(id) ON DELETE CASCADE,
 session_id uuid NOT NULL REFERENCES braincraze.sessions(id) ON DELETE CASCADE,
 provider text NOT NULL CHECK (provider IN ('recaptcha','hcaptcha','turnstile')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '10 minutes',
 used_at timestamptz
);
CREATE INDEX IF NOT EXISTS bc_human_challenge_session ON braincraze.human_verification_challenges(session_id);
CREATE TABLE IF NOT EXISTS braincraze.human_verification_tokens (
 token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
 user_id uuid NOT NULL REFERENCES braincraze.users(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
