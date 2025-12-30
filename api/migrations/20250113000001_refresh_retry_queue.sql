-- Table to track materialized view refresh failures for admin review

CREATE TABLE refresh_retry_queue (
    id BIGSERIAL PRIMARY KEY,
    user_did TEXT NOT NULL UNIQUE,
    retry_count INTEGER DEFAULT 0,
    last_attempt TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_refresh_retry_queue_last_attempt ON refresh_retry_queue(last_attempt);
