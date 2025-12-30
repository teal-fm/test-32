use anyhow::Result;
use chrono::Utc;
use sqlx::postgres::PgPool;
use sqlx::Row;

use crate::{atproto::ScrobbleRecord, global_stats::GlobalStats, models::*, WrappedData};

pub async fn init_db() -> Result<PgPool> {
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://localhost/teal_wrapped".to_string());

    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(50)
        .acquire_timeout(std::time::Duration::from_secs(30))
        .connect(&database_url)
        .await?;

    // Run migrations
    sqlx::migrate!("./migrations").run(&pool).await?;

    Ok(pool)
}

pub async fn get_cached_wrapped(
    pool: &PgPool,
    user_did: &str,
    year: u32,
) -> Result<Option<WrappedData>> {
    let cached = sqlx::query_as::<_, WrappedCache>(
        "SELECT user_did, year, data, created_at FROM wrapped_cache WHERE user_did = $1 AND year = $2",
    )
    .bind(user_did)
    .bind(year as i32)
    .fetch_optional(pool)
    .await?;

    Ok(cached.and_then(|c| serde_json::from_value(c.data).ok()))
}

pub async fn cache_wrapped(
    pool: &PgPool,
    user_did: &str,
    year: u32,
    data: &WrappedData,
) -> Result<()> {
    let json_data = serde_json::to_value(data)?;

    sqlx::query(
        r#"
        INSERT INTO wrapped_cache (user_did, year, data)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_did, year)
        DO UPDATE SET data = $3, created_at = NOW()
        "#,
    )
    .bind(user_did)
    .bind(year as i32)
    .bind(json_data)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn get_cached_global_stats(pool: &PgPool, year: u32) -> Result<Option<GlobalStats>> {
    let cached =
        sqlx::query("SELECT year, data, created_at FROM global_stats_cache WHERE year = $1")
            .bind(year as i32)
            .fetch_optional(pool)
            .await?;

    Ok(cached.and_then(|row| {
        let data: serde_json::Value = row.get("data");
        serde_json::from_value(data).ok()
    }))
}

pub async fn cache_global_stats(pool: &PgPool, year: u32, data: &GlobalStats) -> Result<()> {
    let json_data = serde_json::to_value(data)?;

    sqlx::query(
        r#"
        INSERT INTO global_stats_cache (year, data)
        VALUES ($1, $2)
        ON CONFLICT (year)
        DO UPDATE SET data = $2, created_at = NOW()
        "#,
    )
    .bind(year as i32)
    .bind(json_data)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn get_scrobbles_for_year(
    pool: &PgPool,
    user_did: &str,
    year: u32,
) -> Result<Vec<ScrobbleRecord>> {
    let records = sqlx::query_as::<_, UserPlay>(
        r#"
        SELECT id, user_did, uri, track_name, artists,
               recording_mb_id, track_mb_id, release_mb_id, release_name,
               duration_ms, played_at, created_at
        FROM user_plays
        WHERE user_did = $1
          AND EXTRACT(YEAR FROM played_at) = $2
        ORDER BY played_at
        "#,
    )
    .bind(user_did)
    .bind(year as i32)
    .fetch_all(pool)
    .await?;

    let scrobbles = records
        .into_iter()
        .map(|r| {
            let artists_array = r.artists.as_array();

            let artist_names: Vec<String> = artists_array
                .map(|arr| {
                    arr.iter()
                        .filter_map(|a| {
                            a.get("artistName")
                                .and_then(|v| v.as_str())
                                .map(String::from)
                        })
                        .collect()
                })
                .unwrap_or_default();

            let artist_mb_ids: Option<Vec<String>> = artists_array
                .map(|arr| {
                    arr.iter()
                        .filter_map(|a| {
                            a.get("artistMbId")
                                .and_then(|v| v.as_str())
                                .map(String::from)
                        })
                        .collect()
                })
                .filter(|ids: &Vec<String>| !ids.is_empty());

            ScrobbleRecord {
                uri: r.uri,
                cid: String::new(),
                track_name: r.track_name,
                artists: artist_names,
                played_time: Some(r.played_at.to_rfc3339()),
                duration: r.duration_ms.map(|d| d as i64 / 1000),
                recording_mb_id: r.recording_mb_id,
                track_mb_id: r.track_mb_id,
                release_mb_id: r.release_mb_id,
                release_name: r.release_name,
                artist_mb_ids,
            }
        })
        .collect();

    Ok(scrobbles)
}

fn normalize_name(name: &str) -> String {
    name.to_lowercase()
        .trim()
        .replace("the ", "")
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

pub async fn store_user_plays(
    pool: &PgPool,
    user_did: &str,
    scrobbles: &[ScrobbleRecord],
) -> Result<()> {
    let mut tx = pool.begin().await.map_err(|e| {
        tracing::error!("Failed to begin transaction: {}", e);
        e
    })?;

    for scrobble in scrobbles {
        if let Some(time_str) = &scrobble.played_time {
            if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(time_str) {
                let played_at = dt.with_timezone(&Utc);
                let duration_ms = scrobble
                    .duration
                    .and_then(|d| d.checked_mul(1000).and_then(|ms| i32::try_from(ms).ok()));

                // Build artists jsonb array from artist names and mbids
                // For each artist, if no mb_id, try to find one from existing records
                let mut artists_data = Vec::new();
                for (i, name) in scrobble.artists.iter().enumerate() {
                    let mut mb_id = scrobble
                        .artist_mb_ids
                        .as_ref()
                        .and_then(|ids| ids.get(i))
                        .cloned();

                    // If no mb_id provided, look for existing records with this artist name
                    if mb_id.is_none() {
                        let normalized = normalize_name(name);
                        let existing = sqlx::query!(
                            r#"
                            SELECT DISTINCT (artists->0)->>'artistMbId' as mb_id
                            FROM user_plays
                            WHERE LOWER(TRIM((artists->0)->>'artistName')) = $1
                            AND (artists->0)->>'artistMbId' IS NOT NULL
                            LIMIT 1
                            "#,
                            normalized
                        )
                        .fetch_optional(&mut *tx)
                        .await?;

                        if let Some(row) = existing {
                            mb_id = row.mb_id;
                            if mb_id.is_some() {
                                tracing::debug!(
                                    "inherited mb_id for artist '{}' from existing records",
                                    name
                                );
                            }
                        }
                    }

                    artists_data.push(serde_json::json!({
                        "artistName": name,
                        "artistMbId": mb_id
                    }));
                }

                let artists_json = serde_json::json!(artists_data);

                // Normalize recording_mb_id from existing records if not provided
                let mut recording_mb_id = scrobble.recording_mb_id.clone();
                if recording_mb_id.is_none() && !scrobble.artists.is_empty() {
                    let normalized_track = normalize_name(&scrobble.track_name);
                    let normalized_artist = normalize_name(&scrobble.artists[0]);

                    let existing = sqlx::query!(
                        r#"
                        SELECT DISTINCT recording_mb_id
                        FROM user_plays
                        WHERE LOWER(TRIM(track_name)) = $1
                        AND LOWER(TRIM((artists->0)->>'artistName')) = $2
                        AND recording_mb_id IS NOT NULL
                        LIMIT 1
                        "#,
                        normalized_track,
                        normalized_artist
                    )
                    .fetch_optional(&mut *tx)
                    .await?;

                    if let Some(row) = existing {
                        recording_mb_id = row.recording_mb_id;
                        if recording_mb_id.is_some() {
                            tracing::debug!("inherited recording_mb_id for track '{}' by '{}' from existing records", scrobble.track_name, scrobble.artists[0]);
                        }
                    }
                }

                // Normalize release_mb_id from existing records if not provided
                let mut release_mb_id = scrobble.release_mb_id.clone();
                if release_mb_id.is_none() && scrobble.release_name.is_some() {
                    let release_name = scrobble.release_name.as_ref().unwrap();
                    let normalized_release = normalize_name(release_name);

                    let existing = sqlx::query!(
                        r#"
                        SELECT DISTINCT release_mb_id
                        FROM user_plays
                        WHERE LOWER(TRIM(release_name)) = $1
                        AND release_mb_id IS NOT NULL
                        LIMIT 1
                        "#,
                        normalized_release
                    )
                    .fetch_optional(&mut *tx)
                    .await?;

                    if let Some(row) = existing {
                        release_mb_id = row.release_mb_id;
                        if release_mb_id.is_some() {
                            tracing::debug!(
                                "inherited release_mb_id for release '{}' from existing records",
                                release_name
                            );
                        }
                    }
                }

                sqlx::query(
                    r#"
                    INSERT INTO user_plays (
                        user_did, uri, track_name, artists,
                        recording_mb_id, track_mb_id, release_mb_id, release_name,
                        duration_ms, played_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    ON CONFLICT (uri) DO NOTHING
                    "#,
                )
                .bind(user_did)
                .bind(&scrobble.uri)
                .bind(&scrobble.track_name)
                .bind(&artists_json)
                .bind(&recording_mb_id)
                .bind(&scrobble.track_mb_id)
                .bind(&release_mb_id)
                .bind(&scrobble.release_name)
                .bind(duration_ms)
                .bind(played_at)
                .execute(&mut *tx)
                .await
                .map_err(|e| {
                    tracing::error!("Failed to insert play for uri {}: {}", &scrobble.uri, e);
                    e
                })?;
            }
        }
    }

    tx.commit().await.map_err(|e| {
        tracing::error!("Failed to commit transaction: {}", e);
        e
    })?;

    // Refresh materialized views after batch insert
    // If refresh fails after retries, we'll log it but continue
    // The data is safely committed, refresh can be done later
    if !refresh_user_stats(pool).await? {
        tracing::warn!("materialized view refresh failed for user {} after max retries - data is committed but views need manual refresh", user_did);
        add_to_retry_queue(pool, user_did).await?;
    }

    Ok(())
}

/// Refresh materialized views with concurrent refresh to allow reads during update
/// Returns Ok(true) if successful, Ok(false) if should be retried later
pub async fn refresh_user_stats(pool: &PgPool) -> Result<bool> {
    const MAX_RETRIES: u32 = 10;
    const BASE_DELAY_MS: u64 = 100;

    for attempt in 0..MAX_RETRIES {
        if attempt > 0 {
            let delay = BASE_DELAY_MS * 2_u64.pow(attempt - 1);
            tracing::debug!(
                "refresh attempt {}/{}, waiting {}ms",
                attempt + 1,
                MAX_RETRIES,
                delay
            );
            tokio::time::sleep(tokio::time::Duration::from_millis(delay)).await;
        }

        match try_refresh_views(pool).await {
            Ok(_) => {
                if attempt > 0 {
                    tracing::info!(
                        "refresh succeeded on attempt {}/{}",
                        attempt + 1,
                        MAX_RETRIES
                    );
                }
                return Ok(true);
            }
            Err(e) => {
                if attempt + 1 < MAX_RETRIES {
                    tracing::warn!(
                        "refresh attempt {}/{} failed: {}",
                        attempt + 1,
                        MAX_RETRIES,
                        e
                    );
                } else {
                    tracing::error!("refresh failed after {} attempts: {}", MAX_RETRIES, e);
                    return Ok(false); // Signal that this needs manual retry
                }
            }
        }
    }

    Ok(false)
}

async fn try_refresh_views(pool: &PgPool) -> Result<()> {
    sqlx::query("REFRESH MATERIALIZED VIEW CONCURRENTLY user_artist_stats")
        .execute(pool)
        .await?;

    sqlx::query("REFRESH MATERIALIZED VIEW CONCURRENTLY user_track_stats")
        .execute(pool)
        .await?;

    sqlx::query("REFRESH MATERIALIZED VIEW CONCURRENTLY user_daily_activity")
        .execute(pool)
        .await?;

    Ok(())
}

/// Add a user to the retry queue for failed materialized view refreshes
async fn add_to_retry_queue(pool: &PgPool, user_did: &str) -> Result<()> {
    sqlx::query(
        r#"
        INSERT INTO refresh_retry_queue (user_did, retry_count, last_attempt)
        VALUES ($1, 0, NOW())
        ON CONFLICT (user_did) DO UPDATE
        SET retry_count = refresh_retry_queue.retry_count + 1,
            last_attempt = NOW()
        "#,
    )
    .bind(user_did)
    .execute(pool)
    .await?;

    Ok(())
}

/// Get all users in the retry queue
pub async fn get_retry_queue(pool: &PgPool) -> Result<Vec<(String, i32, chrono::DateTime<Utc>)>> {
    let rows = sqlx::query(
        r#"
        SELECT user_did, retry_count, last_attempt
        FROM refresh_retry_queue
        ORDER BY last_attempt ASC
        "#,
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| {
            (
                row.get("user_did"),
                row.get("retry_count"),
                row.get("last_attempt"),
            )
        })
        .collect())
}

/// Remove a user from the retry queue after successful refresh
pub async fn remove_from_retry_queue(pool: &PgPool, user_did: &str) -> Result<()> {
    sqlx::query("DELETE FROM refresh_retry_queue WHERE user_did = $1")
        .bind(user_did)
        .execute(pool)
        .await?;

    Ok(())
}

#[derive(Debug, Clone)]
pub struct SimilarUser {
    pub did: String,
    pub similarity_score: f64,
    pub shared_artists: Vec<String>,
}

/// Find users with similar music taste using artist-level comparison
pub async fn find_similar_users(
    pool: &PgPool,
    user_did: &str,
    year: u32,
    limit: i64,
) -> Result<Vec<SimilarUser>> {
    let rows = sqlx::query(
        r#"
        WITH user_artists AS (
            SELECT DISTINCT artist->>'artistName' as artist
            FROM user_plays, jsonb_array_elements(artists) as artist
            WHERE user_did = $1
              AND EXTRACT(YEAR FROM played_at) = $2
        ),
        other_users AS (
            SELECT
                user_did,
                array_agg(DISTINCT artist->>'artistName') as artists
            FROM user_plays, jsonb_array_elements(artists) as artist
            WHERE user_did != $1
              AND EXTRACT(YEAR FROM played_at) = $2
            GROUP BY user_did
        )
        SELECT
            ou.user_did,
            cardinality(ARRAY(
                SELECT unnest(ou.artists)
                INTERSECT
                SELECT artist FROM user_artists
            )) as shared_count,
            ARRAY(
                SELECT unnest(ou.artists)
                INTERSECT
                SELECT artist FROM user_artists
            ) as shared_artists
        FROM other_users ou
        WHERE cardinality(ARRAY(
            SELECT unnest(ou.artists)
            INTERSECT
            SELECT artist FROM user_artists
        )) > 0
        ORDER BY shared_count DESC
        LIMIT $3
        "#,
    )
    .bind(user_did)
    .bind(year as i32)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    let similar_users = rows
        .into_iter()
        .map(|row| {
            let did: String = row.get("user_did");
            let shared_count: i32 = row.get("shared_count");
            let shared_artists: Vec<String> = row.get("shared_artists");

            SimilarUser {
                did,
                similarity_score: shared_count as f64,
                shared_artists,
            }
        })
        .collect();

    Ok(similar_users)
}
