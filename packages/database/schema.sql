CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS schools (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE,
 domains text[] NOT NULL DEFAULT '{}', active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subject text NOT NULL UNIQUE,
 email text NOT NULL, first_name text NOT NULL DEFAULT '', last_name text NOT NULL DEFAULT '',
 username text UNIQUE, academic_role text CHECK (academic_role IN ('Student','Faculty','Teaching Assistant','Tutor','Staff')),
 school_id uuid REFERENCES schools(id), email_verified boolean NOT NULL DEFAULT false,
 human_verified_at timestamptz, affiliation_verified_at timestamptz,
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','banned')),
 is_admin boolean NOT NULL DEFAULT false, plan_selected boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS profiles (
 user_id uuid PRIMARY KEY REFERENCES users(id), bio text NOT NULL DEFAULT '', major text NOT NULL DEFAULT '',
 minor text NOT NULL DEFAULT '', graduation_year integer CHECK (graduation_year BETWEEN 1900 AND 2200),
 privacy text NOT NULL DEFAULT 'private' CHECK (privacy IN ('public','friends','private'))
);
CREATE TABLE IF NOT EXISTS verification_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
 school_id uuid NOT NULL REFERENCES schools(id), role text NOT NULL,
 method text NOT NULL CHECK (method IN ('upload','camera')),
 object_key text NOT NULL UNIQUE, media_type text NOT NULL CHECK (media_type IN ('image/jpeg','image/png','application/pdf')),
 byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 10485760),
 scan_status text NOT NULL DEFAULT 'awaiting_upload' CHECK (scan_status IN ('awaiting_upload','quarantined','clean','infected')),
 status text NOT NULL DEFAULT 'pending_upload' CHECK (status IN ('pending_upload','pending_scan','pending_review','needs_information','approved','rejected')),
 reason text, submitted_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz,
 reviewer_id uuid REFERENCES users(id), version integer NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_verification ON verification_requests(user_id)
 WHERE status IN ('pending_upload','pending_scan','pending_review','needs_information');
CREATE TABLE IF NOT EXISTS verification_badges (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
 request_id uuid NOT NULL UNIQUE REFERENCES verification_requests(id), badge_type text NOT NULL,
 issued_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz
);
CREATE TABLE IF NOT EXISTS subscriptions (
 user_id uuid PRIMARY KEY REFERENCES users(id), customer_id text UNIQUE, subscription_id text UNIQUE,
 plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free','monthly','yearly')),
 status text NOT NULL DEFAULT 'none', period_end timestamptz,
 cancel_at_period_end boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS payments (
 invoice_id text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id),
 amount integer NOT NULL, currency text NOT NULL, status text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS webhook_events (event_id text PRIMARY KEY, processed_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS admin_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), admin_id uuid NOT NULL REFERENCES users(id),
 action text NOT NULL, target_id uuid NOT NULL, reason text, created_at timestamptz NOT NULL DEFAULT now()
);
