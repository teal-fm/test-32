-- Global stats cache table

CREATE TABLE global_stats_cache (
    year INTEGER PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
