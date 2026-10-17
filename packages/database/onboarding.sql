-- Additive onboarding: existing accounts retain their previous flow.
ALTER TABLE braincraze.users ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE braincraze.users ADD COLUMN IF NOT EXISTS country_code text;
ALTER TABLE braincraze.users ADD COLUMN IF NOT EXISTS region text;
ALTER TABLE braincraze.users ADD COLUMN IF NOT EXISTS region_code text;
ALTER TABLE braincraze.users ADD COLUMN IF NOT EXISTS institution_name text;
ALTER TABLE braincraze.users ADD COLUMN IF NOT EXISTS institution_email text;
ALTER TABLE braincraze.users ADD COLUMN IF NOT EXISTS institution_id uuid REFERENCES braincraze.schools(id);
ALTER TABLE braincraze.users ADD COLUMN IF NOT EXISTS preferred_language text NOT NULL DEFAULT 'en'
 CHECK(preferred_language IN ('en','fr','my','id','ms','ln','am','ti','ar','fa','hi','he','yi','zh','ja','ko','nl','es'));
ALTER TABLE braincraze.users ADD COLUMN IF NOT EXISTS onboarding_required boolean NOT NULL DEFAULT false;
ALTER TABLE braincraze.users ADD COLUMN IF NOT EXISTS selfie_verification_status text NOT NULL DEFAULT 'not_started'
 CHECK(selfie_verification_status IN ('not_started','pending_review','under_review','verified','additional_information_required','rejected'));
ALTER TABLE braincraze.users ADD COLUMN IF NOT EXISTS identity_verification_status text NOT NULL DEFAULT 'not_started'
 CHECK(identity_verification_status IN ('not_started','pending_review','under_review','verified','additional_information_required','rejected'));
CREATE TABLE IF NOT EXISTS braincraze.identity_verifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES braincraze.users(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'collecting' CHECK(status IN ('collecting','pending_review','under_review','verified','additional_information_required','rejected','superseded')),
 institution_name text NOT NULL,school_id uuid REFERENCES braincraze.schools(id),role text NOT NULL,
 submitted_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),reviewer_id uuid REFERENCES braincraze.users(id) ON DELETE SET NULL,
 reviewer_notes text,reviewed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS bc_identity_active ON braincraze.identity_verifications(user_id) WHERE status IN ('collecting','pending_review','under_review','additional_information_required');
CREATE TABLE IF NOT EXISTS braincraze."VerificationDocuments" (
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES braincraze.users(id) ON DELETE CASCADE,
 verification_id uuid NOT NULL REFERENCES braincraze.identity_verifications(id) ON DELETE CASCADE,
 document_type text NOT NULL CHECK(document_type IN ('selfie','institution_id','passport','drivers_license','national_id','government_id')),
 document_url text NOT NULL CHECK(document_url LIKE 'private://%'),
 document_key uuid NOT NULL UNIQUE,mime text NOT NULL CHECK(mime IN ('image/jpeg','application/pdf')),bytes integer NOT NULL CHECK(bytes BETWEEN 1 AND 10485760),
 capture_method text NOT NULL CHECK(capture_method IN ('camera','upload')),
 scan_status text NOT NULL DEFAULT 'pending' CHECK(scan_status IN ('pending','clean','infected','error')),
 verification_status text NOT NULL DEFAULT 'pending_review' CHECK(verification_status IN ('pending_review','under_review','verified','additional_information_required','rejected')),
 reviewer_notes text,uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS bc_identity_selfie ON braincraze."VerificationDocuments"(verification_id) WHERE document_type='selfie';
CREATE UNIQUE INDEX IF NOT EXISTS bc_identity_evidence ON braincraze."VerificationDocuments"(verification_id) WHERE document_type<>'selfie';
CREATE TABLE IF NOT EXISTS braincraze.identity_review_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),verification_id uuid NOT NULL REFERENCES braincraze.identity_verifications(id) ON DELETE CASCADE,
 actor_id uuid REFERENCES braincraze.users(id) ON DELETE SET NULL,action text NOT NULL,notes text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS braincraze.onboarding_progress (
 user_id uuid PRIMARY KEY REFERENCES braincraze.users(id) ON DELETE CASCADE,
 tutorial_step integer NOT NULL DEFAULT 0 CHECK(tutorial_step BETWEEN 0 AND 11),
 tutorial_status text NOT NULL DEFAULT 'not_started' CHECK(tutorial_status IN ('not_started','in_progress','completed','skipped')),
 updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON braincraze."VerificationDocuments",braincraze.identity_verifications,braincraze.identity_review_logs FROM PUBLIC;
CREATE OR REPLACE VIEW braincraze.verification_badges AS
 SELECT u.id AS user_id,u.verified_school_role AS role,u.verified_school_id AS school_id
 FROM braincraze.users u JOIN braincraze.schools s ON s.id=u.verified_school_id AND s.active
 WHERE u.account_status='active' AND u.email_verified_at IS NOT NULL AND u.human_verified AND u.school_verified
 AND (NOT u.onboarding_required OR u.identity_verification_status='verified')
 AND EXISTS(SELECT 1 FROM braincraze.school_verification_requests r WHERE r.user_id=u.id AND r.status='approved' AND r.school_id=u.verified_school_id AND r.role=u.verified_school_role AND r.approved_at IS NOT NULL);
