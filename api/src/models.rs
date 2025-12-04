use chrono::{DateTime, Utc};
use sqlx::FromRow;

#[derive(Debug, Clone, FromRow)]
pub struct UserPlay {
    pub id: i64,
    pub user_did: String,
    pub uri: String,
    pub track_name: String,
    pub artists: serde_json::Value,
    pub recording_mb_id: Option<String>,
    pub track_mb_id: Option<String>,
    pub release_mb_id: Option<String>,
    pub release_name: Option<String>,
    pub duration_ms: Option<i32>,
    pub played_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, FromRow)]
pub struct WrappedCache {
    pub user_did: String,
    pub year: i32,
    pub data: serde_json::Value,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, FromRow)]
pub struct UserArtistStats {
    pub user_did: String,
    pub year: i32,
    pub artists: Option<serde_json::Value>,
}

#[derive(Debug, FromRow)]
pub struct UserTrackStats {
    pub user_did: String,
    pub year: i32,
    pub tracks: Option<serde_json::Value>,
}

#[derive(Debug, FromRow)]
pub struct UserDailyActivity {
    pub user_did: String,
    pub year: i32,
    pub daily_stats: Option<serde_json::Value>,
}
