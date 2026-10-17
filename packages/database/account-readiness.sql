-- Security notifications reuse the existing durable, localized email queue.
ALTER TABLE braincraze.localized_email_queue DROP CONSTRAINT IF EXISTS localized_email_queue_template_check;
ALTER TABLE braincraze.localized_email_queue ADD CONSTRAINT localized_email_queue_template_check CHECK(template IN ('subscription','notification','security'));
