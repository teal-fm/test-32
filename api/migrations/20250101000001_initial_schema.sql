-- Initial schema for user plays and wrapped cache

CREATE TABLE user_plays (
    id BIGSERIAL PRIMARY KEY,
    user_did TEXT NOT NULL,
    uri TEXT NOT NULL UNIQUE,
    track_name TEXT NOT NULL,
    artists JSONB NOT NULL,
    recording_mb_id TEXT,
    track_mb_id TEXT,
    release_mb_id TEXT,
    release_name TEXT,
    duration_ms INTEGER,
    played_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE wrapped_cache (
    user_did TEXT NOT NULL,
    year INTEGER NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_did, year)
);
