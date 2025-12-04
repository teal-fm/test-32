use anyhow::Result;
use chrono::{Datelike, NaiveDate, Weekday};
use sqlx::postgres::PgPool;
use sqlx::Row;
use std::collections::HashMap;

#[derive(Debug, Clone, Default)]
pub struct TrackMetadata {
    pub recording_mb_id: Option<String>,
    pub release_name: Option<String>,
    pub release_mb_id: Option<String>,
}

#[derive(Debug)]
pub struct WrappedStats {
    pub total_hours: f64,
    pub total_plays: u32,
    pub avg_track_length_ms: i32,
    pub listening_diversity: f64,       // unique tracks / total plays
    pub hourly_distribution: [u32; 24], // plays per hour (UTC)
    pub top_hour: u8,                   // hour with most plays (0-23)
    pub longest_session_minutes: u32,   // longest continuous listening session
    pub top_artists: Vec<(String, u32, f64, Option<String>)>,
    pub top_tracks: Vec<((String, String), u32, TrackMetadata)>,
    pub top_track_per_artist: HashMap<String, (String, u32, i32)>, // artist_name -> (track_title, play_count, duration_ms)
    pub new_artists_count: u32,
    pub daily_plays: HashMap<NaiveDate, u32>,
    pub weekday_avg_hours: f64,
    pub weekend_avg_hours: f64,
    pub longest_streak: u32,
    pub days_active: u32,
}

/// Calculate wrapped stats directly from database views
pub async fn calculate_wrapped_stats(
    pool: &PgPool,
    user_did: &str,
    year: u32,
) -> Result<WrappedStats> {
    // Get top artists from materialized view
    let artist_stats = sqlx::query(
        r#"
        SELECT artists
        FROM user_artist_stats
        WHERE user_did = $1 AND year = $2
        "#,
    )
    .bind(user_did)
    .bind(year as i32)
    .fetch_optional(pool)
    .await?;

    let top_artists: Vec<(String, u32, f64, Option<String>)> = if let Some(row) = artist_stats {
        let artists_json: serde_json::Value = row.get("artists");
        artists_json
            .as_array()
            .unwrap_or(&vec![])
            .iter()
            .take(10)
            .filter_map(|a| {
                let name = a.get("name")?.as_str()?.to_string();
                let plays = a.get("play_count")?.as_i64()? as u32;
                let duration_ms = a.get("total_duration_ms")?.as_i64()? as f64;
                let hours = duration_ms / (1000.0 * 3600.0);
                let mb_id = a.get("mb_id").and_then(|v| v.as_str()).map(String::from);
                Some((name, plays, hours, mb_id))
            })
            .collect()
    } else {
        vec![]
    };

    // Get top tracks from materialized view
    let track_stats = sqlx::query(
        r#"
        SELECT tracks
        FROM user_track_stats
        WHERE user_did = $1 AND year = $2
        "#,
    )
    .bind(user_did)
    .bind(year as i32)
    .fetch_optional(pool)
    .await?;

    let top_tracks: Vec<((String, String), u32, TrackMetadata)> = if let Some(row) = track_stats {
        let tracks_json: serde_json::Value = row.get("tracks");
        tracks_json
            .as_array()
            .unwrap_or(&vec![])
            .iter()
            .take(10)
            .filter_map(|t| {
                let track_name = t.get("track_name")?.as_str()?.to_string();
                let artist_name = t.get("artist_name")?.as_str()?.to_string();
                let plays = t.get("play_count")?.as_i64()? as u32;
                let metadata = TrackMetadata {
                    recording_mb_id: t
                        .get("recording_mb_id")
                        .and_then(|v| v.as_str())
                        .map(String::from),
                    release_name: t
                        .get("release_name")
                        .and_then(|v| v.as_str())
                        .map(String::from),
                    release_mb_id: t
                        .get("release_mb_id")
                        .and_then(|v| v.as_str())
                        .map(String::from),
                };
                Some(((track_name, artist_name), plays, metadata))
            })
            .collect()
    } else {
        vec![]
    };

    // Get daily activity from materialized view
    let daily_stats = sqlx::query(
        r#"
        SELECT daily_stats
        FROM user_daily_activity
        WHERE user_did = $1 AND year = $2
        "#,
    )
    .bind(user_did)
    .bind(year as i32)
    .fetch_optional(pool)
    .await?;

    let mut daily_plays: HashMap<NaiveDate, u32> = HashMap::new();
    let mut total_duration_ms = 0i64;

    if let Some(row) = daily_stats {
        let daily_json: serde_json::Value = row.get("daily_stats");
        if let Some(obj) = daily_json.as_object() {
            for (date_str, stats) in obj {
                if let Ok(date) = NaiveDate::parse_from_str(date_str, "%Y-%m-%d") {
                    if let Some(plays) = stats.get("plays").and_then(|v| v.as_u64()) {
                        daily_plays.insert(date, plays as u32);
                    }
                    if let Some(duration) = stats.get("duration_ms").and_then(|v| v.as_i64()) {
                        total_duration_ms += duration;
                    }
                }
            }
        }
    }

    // Calculate derived metrics
    let total_hours = total_duration_ms as f64 / (1000.0 * 3600.0);
    let total_plays: u32 = daily_plays.values().sum();
    let days_active = daily_plays.len() as u32;

    // Calculate average track length
    let avg_track_length_ms = if total_plays > 0 {
        (total_duration_ms / total_plays as i64) as i32
    } else {
        0
    };

    // Calculate listening diversity (unique tracks / total plays)
    let unique_tracks: i64 = sqlx::query(
        r#"
        SELECT COUNT(DISTINCT track_name) as count
        FROM user_plays
        WHERE user_did = $1 AND EXTRACT(YEAR FROM played_at) = $2
        "#,
    )
    .bind(user_did)
    .bind(year as i32)
    .fetch_one(pool)
    .await
    .map(|row| row.get::<i64, _>("count"))
    .unwrap_or(0);

    let listening_diversity = if total_plays > 0 {
        unique_tracks as f64 / total_plays as f64
    } else {
        0.0
    };

    // Calculate hourly distribution
    let hourly_stats = sqlx::query(
        r#"
        SELECT
          EXTRACT(HOUR FROM played_at)::INT AS hour,
          COUNT(*) AS play_count
        FROM user_plays
        WHERE user_did = $1
          AND EXTRACT(YEAR FROM played_at) = $2
        GROUP BY EXTRACT(HOUR FROM played_at)::INT
        ORDER BY hour;
        "#,
    )
    .bind(user_did)
    .bind(year as i32)
    .fetch_all(pool)
    .await?;

    let mut hourly_distribution = [0u32; 24];
    for row in hourly_stats {
        let hour: i32 = row.get("hour");
        let count: i64 = row.get("play_count");
        hourly_distribution[hour as usize] = count as u32;
    }

    let top_hour = hourly_distribution
        .iter()
        .enumerate()
        .max_by_key(|(_, &count)| count)
        .map(|(hour, _)| hour as u8)
        .unwrap_or(0);

    // Calculate longest listening session (plays within 6 minutes of each other)
    let session_query = sqlx::query(
        r#"
        WITH sessions AS (
            SELECT
                played_at,
                EXTRACT(EPOCH FROM (played_at - LAG(played_at) OVER (ORDER BY played_at))) AS gap_seconds
            FROM user_plays
            WHERE user_did = $1
              AND EXTRACT(YEAR FROM played_at) = $2
        ),
        session_groups AS (
            SELECT
                played_at,
                SUM(
                    CASE
                        WHEN gap_seconds > 360 OR gap_seconds IS NULL THEN 1
                        ELSE 0
                    END
                ) OVER (ORDER BY played_at) AS session_id
            FROM sessions
        ),
        session_lengths AS (
            SELECT
                session_id,
                EXTRACT(EPOCH FROM (MAX(played_at) - MIN(played_at))) / 60.0 AS duration_minutes
                -- 60.0 ensures DOUBLE PRECISION arithmetic
            FROM session_groups
            GROUP BY session_id
        )
        SELECT
            COALESCE(MAX(duration_minutes)::DOUBLE PRECISION, 0) AS max_session
        FROM session_lengths;
        "#,
    )
    .bind(user_did)
    .bind(year as i32)
    .fetch_one(pool)
    .await?;

    let longest_session_minutes: f64 = session_query.get("max_session");
    let longest_session_minutes = longest_session_minutes.round() as u32;

    // Count unique first artists for new_artists
    let unique_first_artists: i64 = sqlx::query(
        r#"
        SELECT COUNT(DISTINCT (artists->0)->>'artistName') as count
        FROM user_plays
        WHERE user_did = $1 AND EXTRACT(YEAR FROM played_at) = $2 AND jsonb_array_length(artists) > 0
        "#,
    )
    .bind(user_did)
    .bind(year as i32)
    .fetch_one(pool)
    .await
    .map(|row| row.get::<i64, _>("count"))
    .unwrap_or(0);

    let new_artists_count = unique_first_artists as u32;

    // Calculate longest streak
    let longest_streak = calculate_longest_streak(&daily_plays);

    // Calculate weekday vs weekend averages
    let mut weekday_days = 0;
    let mut weekend_days = 0;

    for (date, _) in &daily_plays {
        match date.weekday() {
            Weekday::Sat | Weekday::Sun => {
                weekend_days += 1;
            }
            _ => {
                weekday_days += 1;
            }
        }
    }

    // Get weekday/weekend breakdown from database
    let weekday_stats = sqlx::query(
        r#"
        SELECT
            SUM(COALESCE(duration_ms, 210000)) as total_duration_ms
        FROM user_plays
        WHERE user_did = $1
          AND EXTRACT(YEAR FROM played_at) = $2
          AND EXTRACT(DOW FROM played_at) NOT IN (0, 6)
        "#,
    )
    .bind(user_did)
    .bind(year as i32)
    .fetch_one(pool)
    .await?;

    let weekend_stats = sqlx::query(
        r#"
        SELECT
            SUM(COALESCE(duration_ms, 210000)) as total_duration_ms
        FROM user_plays
        WHERE user_did = $1
          AND EXTRACT(YEAR FROM played_at) = $2
          AND EXTRACT(DOW FROM played_at) IN (0, 6)
        "#,
    )
    .bind(user_did)
    .bind(year as i32)
    .fetch_one(pool)
    .await?;

    let weekday_avg_hours = if weekday_days > 0 {
        let weekday_ms: Option<i64> = weekday_stats.get("total_duration_ms");
        weekday_ms
            .map(|ms| ms as f64 / (1000.0 * 3600.0) / weekday_days as f64)
            .unwrap_or(0.0)
    } else {
        0.0
    };

    let weekend_avg_hours = if weekend_days > 0 {
        let weekend_ms: Option<i64> = weekend_stats.get("total_duration_ms");
        weekend_ms
            .map(|ms| ms as f64 / (1000.0 * 3600.0) / weekend_days as f64)
            .unwrap_or(0.0)
    } else {
        0.0
    };

    // Get top track for each artist
    let mut top_track_per_artist: HashMap<String, (String, u32, i32)> = HashMap::new();

    // For each top artist, find their most played track
    for (artist_name, _, _, _) in &top_artists {
        let top_track_result = sqlx::query(
            r#"
            SELECT track_name, COUNT(*) as play_count, MAX(duration_ms) as duration_ms
            FROM user_plays
            WHERE user_did = $1
              AND EXTRACT(YEAR FROM played_at) = $2
              AND (artists->0)->>'artistName' = $3
            GROUP BY track_name
            ORDER BY play_count DESC
            LIMIT 1
            "#,
        )
        .bind(user_did)
        .bind(year as i32)
        .bind(artist_name)
        .fetch_optional(pool)
        .await?;

        if let Some(row) = top_track_result {
            let track_name: String = row.get("track_name");
            let play_count: i64 = row.get("play_count");
            let duration_ms: Option<i32> = row.get("duration_ms");
            let duration = duration_ms.unwrap_or(210000);
            top_track_per_artist.insert(
                artist_name.clone(),
                (track_name, play_count as u32, duration),
            );
        }
    }

    Ok(WrappedStats {
        total_hours,
        total_plays,
        top_artists,
        top_tracks,
        top_track_per_artist,
        new_artists_count,
        daily_plays,
        weekday_avg_hours,
        weekend_avg_hours,
        longest_streak,
        days_active,
        avg_track_length_ms,
        listening_diversity,
        hourly_distribution,
        top_hour,
        longest_session_minutes,
    })
}

fn calculate_longest_streak(daily_plays: &HashMap<NaiveDate, u32>) -> u32 {
    let mut dates: Vec<NaiveDate> = daily_plays.keys().copied().collect();
    dates.sort();

    let mut longest = 0;
    let mut current = 0;

    for i in 0..dates.len() {
        if i == 0 {
            current = 1;
        } else {
            let diff = dates[i].signed_duration_since(dates[i - 1]).num_days();
            if diff == 1 {
                current += 1;
            } else {
                longest = longest.max(current);
                current = 1;
            }
        }
    }

    longest.max(current)
}
