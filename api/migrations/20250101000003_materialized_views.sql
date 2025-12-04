-- Materialized views for pre-aggregated statistics

CREATE MATERIALIZED VIEW user_artist_stats AS
SELECT
    user_did,
    EXTRACT(YEAR FROM played_at)::INTEGER as year,
    jsonb_agg(
        jsonb_build_object(
            'name', artist_name,
            'mb_id', artist_mb_id,
            'play_count', play_count,
            'total_duration_ms', total_duration_ms
        ) ORDER BY play_count DESC
    ) as artists
FROM (
    SELECT
        user_did,
        played_at,
        artist->>'artistName' as artist_name,
        artist->>'artistMbId' as artist_mb_id,
        COUNT(*) as play_count,
        SUM(COALESCE(duration_ms, 210000)) as total_duration_ms
    FROM user_plays, jsonb_array_elements(artists) as artist
    GROUP BY user_did, played_at, artist_name, artist_mb_id
) artist_plays
GROUP BY user_did, year;

CREATE UNIQUE INDEX idx_user_artist_stats_pk ON user_artist_stats (user_did, year);

CREATE MATERIALIZED VIEW user_track_stats AS
SELECT
    user_did,
    EXTRACT(YEAR FROM played_at)::INTEGER as year,
    jsonb_agg(
        jsonb_build_object(
            'track_name', track_name,
            'artist_name', (artists->0)->>'artistName',
            'recording_mb_id', recording_mb_id,
            'release_mb_id', release_mb_id,
            'release_name', release_name,
            'play_count', play_count
        ) ORDER BY play_count DESC
    ) as tracks
FROM (
    SELECT
        user_did,
        played_at,
        track_name,
        artists,
        recording_mb_id,
        release_mb_id,
        release_name,
        COUNT(*) as play_count
    FROM user_plays
    WHERE jsonb_array_length(artists) > 0
    GROUP BY user_did, played_at, track_name, artists, recording_mb_id, release_mb_id, release_name
) track_plays
GROUP BY user_did, year;

CREATE UNIQUE INDEX idx_user_track_stats_pk ON user_track_stats (user_did, year);

CREATE MATERIALIZED VIEW user_daily_activity AS
SELECT
    user_did,
    EXTRACT(YEAR FROM played_at)::INTEGER as year,
    jsonb_object_agg(
        (played_at::DATE)::TEXT,
        jsonb_build_object(
            'plays', play_count,
            'duration_ms', total_duration_ms
        )
    ) as daily_stats
FROM (
    SELECT
        user_did,
        played_at,
        COUNT(*) as play_count,
        SUM(COALESCE(duration_ms, 210000)) as total_duration_ms
    FROM user_plays
    GROUP BY user_did, played_at
) daily_plays
GROUP BY user_did, year;

CREATE UNIQUE INDEX idx_user_daily_activity_pk ON user_daily_activity (user_did, year);
