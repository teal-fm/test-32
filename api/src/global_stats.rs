use anyhow::Result;
use serde::{Deserialize, Serialize};
use sqlx::postgres::PgPool;
use sqlx::Row;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GlobalStats {
    pub year: u32,
    pub total_plays: i64,
    pub total_minutes: f64,
    pub unique_users: i64,
    pub unique_artists: i64,
    pub unique_tracks: i64,
    pub top_artists: Vec<GlobalArtist>,
    pub top_tracks: Vec<GlobalTrack>,
    pub top_users: Vec<TopUser>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GlobalArtist {
    pub name: String,
    pub play_count: i64,
    pub user_count: i64,
    pub mb_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GlobalTrack {
    pub track_name: String,
    pub artist_name: String,
    pub play_count: i64,
    pub user_count: i64,
    pub recording_mb_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TopUser {
    pub user_did: String,
    pub play_count: i64,
    pub listening_minutes: f64,
}

pub async fn calculate_global_stats(pool: &PgPool, year: u32) -> Result<GlobalStats> {
    // Get basic stats
    let basic_stats = sqlx::query(
        r#"
        SELECT
            COUNT(*) as total_plays,
            SUM(COALESCE(duration_ms, 210000)) as total_duration_ms,
            COUNT(DISTINCT user_did) as unique_users,
            COUNT(DISTINCT (artists->0)->>'artistName') as unique_artists,
            COUNT(DISTINCT track_name) as unique_tracks
        FROM user_plays
        WHERE EXTRACT(YEAR FROM played_at) = $1
        "#,
    )
    .bind(year as i32)
    .fetch_one(pool)
    .await?;

    let total_plays: i64 = basic_stats.get("total_plays");
    let total_duration_ms: Option<i64> = basic_stats.get("total_duration_ms");
    let total_minutes = total_duration_ms.unwrap_or(0) as f64 / (1000.0 * 60.0);
    let unique_users: i64 = basic_stats.get("unique_users");
    let unique_artists: i64 = basic_stats.get("unique_artists");
    let unique_tracks: i64 = basic_stats.get("unique_tracks");

    // Get top artists
    let top_artists_rows = sqlx::query(
        r#"
        SELECT
            (artists->0)->>'artistName' as artist_name,
            (artists->0)->>'artistMbId' as mb_id,
            COUNT(*) as play_count,
            COUNT(DISTINCT user_did) as user_count
        FROM user_plays
        WHERE EXTRACT(YEAR FROM played_at) = $1
          AND jsonb_array_length(artists) > 0
        GROUP BY (artists->0)->>'artistName', (artists->0)->>'artistMbId'
        ORDER BY play_count DESC
        LIMIT 100
        "#,
    )
    .bind(year as i32)
    .fetch_all(pool)
    .await?;

    let top_artists: Vec<GlobalArtist> = top_artists_rows
        .iter()
        .filter_map(|row| {
            let name: String = row.get("artist_name");
            let play_count: i64 = row.get("play_count");
            let user_count: i64 = row.get("user_count");
            let mb_id: Option<String> = row.get("mb_id");
            Some(GlobalArtist {
                name,
                play_count,
                user_count,
                mb_id,
            })
        })
        .collect();

    // Get top tracks
    let top_tracks_rows = sqlx::query(
        r#"
        SELECT
            track_name,
            (artists->0)->>'artistName' as artist_name,
            recording_mb_id,
            COUNT(*) as play_count,
            COUNT(DISTINCT user_did) as user_count
        FROM user_plays
        WHERE EXTRACT(YEAR FROM played_at) = $1
          AND jsonb_array_length(artists) > 0
        GROUP BY track_name, (artists->0)->>'artistName', recording_mb_id
        ORDER BY play_count DESC
        LIMIT 100
        "#,
    )
    .bind(year as i32)
    .fetch_all(pool)
    .await?;

    let top_tracks: Vec<GlobalTrack> = top_tracks_rows
        .iter()
        .filter_map(|row| {
            let track_name: String = row.get("track_name");
            let artist_name: String = row.get("artist_name");
            let play_count: i64 = row.get("play_count");
            let user_count: i64 = row.get("user_count");
            let recording_mb_id: Option<String> = row.get("recording_mb_id");
            Some(GlobalTrack {
                track_name,
                artist_name,
                play_count,
                user_count,
                recording_mb_id,
            })
        })
        .collect();

    // Get top users
    let top_users_rows = sqlx::query(
        r#"
        SELECT
            user_did,
            COUNT(*) as play_count,
            SUM(COALESCE(duration_ms, 210000)) as total_duration_ms
        FROM user_plays
        WHERE EXTRACT(YEAR FROM played_at) = $1
        GROUP BY user_did
        ORDER BY play_count DESC
        LIMIT 100
        "#,
    )
    .bind(year as i32)
    .fetch_all(pool)
    .await?;

    let top_users: Vec<TopUser> = top_users_rows
        .iter()
        .filter_map(|row| {
            let user_did: String = row.get("user_did");
            let play_count: i64 = row.get("play_count");
            let total_duration_ms: Option<i64> = row.get("total_duration_ms");
            let listening_minutes = total_duration_ms.unwrap_or(0) as f64 / (1000.0 * 60.0);
            Some(TopUser {
                user_did,
                play_count,
                listening_minutes,
            })
        })
        .collect();

    Ok(GlobalStats {
        year,
        total_plays,
        total_minutes,
        unique_users,
        unique_artists,
        unique_tracks,
        top_artists,
        top_tracks,
        top_users,
    })
}
