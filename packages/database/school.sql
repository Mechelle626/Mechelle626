CREATE TABLE IF NOT EXISTS braincraze.schools (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE,
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS braincraze.school_email_domains (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL REFERENCES braincraze.schools(id),
 domain text NOT NULL UNIQUE CHECK (domain=lower(domain)),
 email_roles text[] NOT NULL DEFAULT '{}' CHECK (email_roles <@ ARRAY['Student','Faculty','Teaching Assistant','Tutor','Staff']::text[]),
 active boolean NOT NULL DEFAULT true, policy_reference text NOT NULL,
 reviewed_by text NOT NULL, reviewed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE braincraze.users ADD COLUMN IF NOT EXISTS school_verified boolean NOT NULL DEFAULT false;
ALTER TABLE braincraze.users ADD COLUMN IF NOT EXISTS verified_school_id uuid REFERENCES braincraze.schools(id);
ALTER TABLE braincraze.users ADD COLUMN IF NOT EXISTS verified_school_role text CHECK (verified_school_role IN ('Student','Faculty','Teaching Assistant','Tutor','Staff'));
ALTER TABLE braincraze.users ADD COLUMN IF NOT EXISTS school_verified_at timestamptz;
CREATE TABLE IF NOT EXISTS braincraze.school_verification_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES braincraze.users(id) ON DELETE CASCADE,
 school_id uuid NOT NULL REFERENCES braincraze.schools(id),
 role text NOT NULL CHECK (role IN ('Student','Faculty','Teaching Assistant','Tutor','Staff')),
 method text NOT NULL CHECK (method IN ('email','upload','camera')),
 status text NOT NULL CHECK (status IN ('awaiting_email','pending_review','needs_information','approved','rejected','superseded')),
 university_email text, domain_id uuid REFERENCES braincraze.school_email_domains(id),
 code_hash text, code_expires_at timestamptz, code_issued_at timestamptz,
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
 delivery_status text CHECK (delivery_status IN ('pending','sent','failed')),
 document_key uuid, document_mime text CHECK (document_mime IN ('image/jpeg','application/pdf')),
 document_bytes integer CHECK (document_bytes BETWEEN 1 AND 10485760),
 document_scan_status text CHECK (document_scan_status IN ('pending','clean','infected','error')),
 submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 approved_at timestamptz, reviewer text, reason text,
 CHECK ((method='email' AND university_email IS NOT NULL AND domain_id IS NOT NULL AND document_key IS NULL)
     OR (method IN ('upload','camera') AND document_key IS NOT NULL AND code_hash IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS bc_active_school_request ON braincraze.school_verification_requests(user_id)
 WHERE status IN ('awaiting_email','pending_review','needs_information');
CREATE INDEX IF NOT EXISTS bc_school_requests_user ON braincraze.school_verification_requests(user_id,submitted_at DESC);
CREATE TABLE IF NOT EXISTS braincraze.school_review_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES braincraze.school_verification_requests(id) ON DELETE CASCADE,
 reviewer text NOT NULL, action text NOT NULL CHECK(action IN ('approve','reject','needs_information','view_document','scan')),
 reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
