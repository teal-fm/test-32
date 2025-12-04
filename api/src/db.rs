use anyhow::Result;
use chrono::Utc;
use sqlx::postgres::PgPool;
use sqlx::Row;

use crate::{atproto::ScrobbleRecord, models::*, WrappedData};

pub async fn init_db() -> Result<PgPool> {
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://localhost/teal_wrapped".to_string());

    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(5)
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

pub async fn store_user_plays(
    pool: &PgPool,
    user_did: &str,
    scrobbles: &[ScrobbleRecord],
) -> Result<()> {
    let mut tx = pool.begin().await?;

    for scrobble in scrobbles {
        if let Some(time_str) = &scrobble.played_time {
            if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(time_str) {
                let played_at = dt.with_timezone(&Utc);
                let duration_ms = scrobble.duration.map(|d| (d as i32) * 1000);

                // Build artists jsonb array from artist names and mbids
                let artists_json = serde_json::json!(scrobble
                    .artists
                    .iter()
                    .enumerate()
                    .map(|(i, name)| {
                        let mb_id = scrobble
                            .artist_mb_ids
                            .as_ref()
                            .and_then(|ids| ids.get(i))
                            .cloned();
                        serde_json::json!({
                            "artistName": name,
                            "artistMbId": mb_id
                        })
                    })
                    .collect::<Vec<_>>());

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
                .bind(&scrobble.recording_mb_id)
                .bind(&scrobble.track_mb_id)
                .bind(&scrobble.release_mb_id)
                .bind(&scrobble.release_name)
                .bind(duration_ms)
                .bind(played_at)
                .execute(&mut *tx)
                .await?;
            }
        }
    }

    tx.commit().await?;

    // Refresh materialized views after batch insert
    refresh_user_stats(pool).await?;

    Ok(())
}

/// Refresh materialized views with concurrent refresh to allow reads during update
pub async fn refresh_user_stats(pool: &PgPool) -> Result<()> {
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
