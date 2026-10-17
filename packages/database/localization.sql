CREATE TABLE IF NOT EXISTS braincraze.languages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text UNIQUE NOT NULL CHECK(code ~ '^[a-z]{2,3}(-[A-Za-z0-9]{1,8})*$'),
 language_name text NOT NULL, native_name text NOT NULL, enabled boolean NOT NULL DEFAULT true,
 direction text NOT NULL DEFAULT 'ltr' CHECK(direction IN ('ltr','rtl')),
 CHECK(code <> 'en' OR enabled)
);
CREATE TABLE IF NOT EXISTS braincraze.translation_keys (
 translation_key text PRIMARY KEY, english_source text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS braincraze.translations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), language_id uuid NOT NULL REFERENCES braincraze.languages(id),
 translation_key text NOT NULL REFERENCES braincraze.translation_keys(translation_key), translation_value text NOT NULL,
 review_status text NOT NULL DEFAULT 'Pending Language Review' CHECK(review_status IN ('Draft','Pending Language Review','Reviewed','Approved')),
 updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES braincraze.users(id) ON DELETE SET NULL,
 UNIQUE(language_id,translation_key)
);
CREATE TABLE IF NOT EXISTS braincraze.translation_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES braincraze.users(id) ON DELETE SET NULL,
 language_id uuid NOT NULL REFERENCES braincraze.languages(id), translation_key text NOT NULL REFERENCES braincraze.translation_keys(translation_key),
 report_type text NOT NULL CHECK(report_type IN ('Incorrect translation','Missing translation','Poor translation quality')),
 notes text NOT NULL CHECK(length(notes) BETWEEN 1 AND 2000), created_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'Open' CHECK(status IN ('Open','Resolved','Dismissed')),
 resolved_by uuid REFERENCES braincraze.users(id) ON DELETE SET NULL, resolved_at timestamptz
);
CREATE TABLE IF NOT EXISTS braincraze.translation_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES braincraze.users(id) ON DELETE SET NULL,
 action text NOT NULL, details jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS translations_review_idx ON braincraze.translations(language_id,review_status);
CREATE INDEX IF NOT EXISTS translation_reports_queue_idx ON braincraze.translation_reports(status,created_at);
ALTER TABLE braincraze.users DROP CONSTRAINT IF EXISTS users_preferred_language_check;
REVOKE ALL ON braincraze.languages,braincraze.translation_keys,braincraze.translations,braincraze.translation_reports,braincraze.translation_audit FROM PUBLIC;
CREATE TABLE IF NOT EXISTS braincraze.localized_email_queue (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES braincraze.users(id) ON DELETE CASCADE,
 template text NOT NULL CHECK(template IN ('subscription','notification')), template_values jsonb NOT NULL,
 deduplication_key text UNIQUE NOT NULL, attempts integer NOT NULL DEFAULT 0, sent_at timestamptz,
 next_attempt_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON braincraze.localized_email_queue FROM PUBLIC;

ALTER TABLE braincraze.languages DROP CONSTRAINT IF EXISTS languages_code_check;
ALTER TABLE braincraze.languages ADD CONSTRAINT languages_code_check CHECK(code ~ '^[a-z]{2,3}(-[A-Za-z0-9]{1,8})*$');
