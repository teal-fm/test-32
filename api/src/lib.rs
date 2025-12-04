use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json,
    routing::get,
    Router,
};
use serde::{Deserialize, Serialize};
use sqlx::postgres::PgPool;
use std::net::SocketAddr;
use tower_http::cors::CorsLayer;
use tracing_subscriber;

pub mod atproto;
pub mod db;
pub mod models;
pub mod wrapped;

#[derive(Clone)]
struct AppState {
    db: PgPool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WrappedData {
    year: u32,
    total_hours: f64,
    top_artists: Vec<TopArtist>,
    top_tracks: Vec<TopTrack>,
    new_artists_count: u32,
    activity_graph: Vec<DayActivity>,
    weekday_avg_hours: f64,
    weekend_avg_hours: f64,
    longest_streak: u32,
    days_active: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    similar_users: Option<Vec<MusicBuddy>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct MusicBuddy {
    did: String,
    similarity_score: f64,
    shared_artists: Vec<String>,
    shared_artist_count: u32,
}

#[derive(Debug, Serialize, Deserialize)]
struct TopArtist {
    name: String,
    plays: u32,
    hours: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    mb_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct TopTrack {
    title: String,
    artist: String,
    plays: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    recording_mb_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    release_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    release_mb_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct DayActivity {
    date: String,
    plays: u32,
    hours: f64,
}

#[derive(Debug, Deserialize)]
struct WrappedQuery {
    did: String,
}

async fn get_wrapped(
    State(state): State<AppState>,
    Path(year): Path<u32>,
    Query(params): Query<WrappedQuery>,
) -> Result<Json<WrappedData>, StatusCode> {
    let did = &params.did;

    if let Ok(Some(cached)) = db::get_cached_wrapped(&state.db, did, year).await {
        tracing::info!("returning cached data for {} year {}", did, year);
        return Ok(Json(cached));
    }

    // Try to get scrobbles from database first
    let scrobbles = match db::get_scrobbles_for_year(&state.db, did, year).await {
        Ok(db_scrobbles) if !db_scrobbles.is_empty() => {
            tracing::info!(
                "found {} scrobbles in database for {} year {}",
                db_scrobbles.len(),
                did,
                year
            );
            db_scrobbles
        }
        _ => {
            // Fallback to fetching from atproto
            tracing::info!(
                "no scrobbles in database, fetching from atproto for {} year {}",
                did,
                year
            );
            let fetched_scrobbles = atproto::fetch_scrobbles(did, year).await.map_err(|e| {
                tracing::error!("failed to fetch scrobbles: {}", e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

            // Store all play records for similarity matching
            if let Err(e) = db::store_user_plays(&state.db, did, &fetched_scrobbles).await {
                tracing::warn!("failed to store user plays: {}", e);
            }

            fetched_scrobbles
        }
    };

    let stats = wrapped::calculate_wrapped_stats(scrobbles, year);

    let top_artists = stats
        .top_artists
        .into_iter()
        .map(|(name, plays, hours, mb_id)| TopArtist {
            name,
            plays,
            hours,
            mb_id,
        })
        .collect();

    let top_tracks = stats
        .top_tracks
        .into_iter()
        .map(|((title, artist), plays, metadata)| TopTrack {
            title,
            artist,
            plays,
            recording_mb_id: metadata.recording_mb_id,
            release_name: metadata.release_name,
            release_mb_id: metadata.release_mb_id,
        })
        .collect();

    let activity_graph = stats
        .daily_plays
        .into_iter()
        .map(|(date, plays)| DayActivity {
            date: date.to_string(),
            plays,
            hours: (plays as f64 * 3.5) / 60.0,
        })
        .collect();

    // Find similar users (music buddies)
    let similar_users = match db::find_similar_users(&state.db, did, year, 3).await {
        Ok(users) => Some(
            users
                .into_iter()
                .map(|u| MusicBuddy {
                    did: u.did,
                    similarity_score: u.similarity_score,
                    shared_artist_count: u.shared_artists.len() as u32,
                    shared_artists: u.shared_artists,
                })
                .collect(),
        ),
        Err(e) => {
            tracing::warn!("failed to find similar users: {}", e);
            None
        }
    };

    let data = WrappedData {
        year,
        total_hours: stats.total_hours,
        top_artists,
        top_tracks,
        new_artists_count: stats.new_artists_count,
        activity_graph,
        weekday_avg_hours: stats.weekday_avg_hours,
        weekend_avg_hours: stats.weekend_avg_hours,
        longest_streak: stats.longest_streak,
        days_active: stats.days_active,
        similar_users,
    };

    if let Err(e) = db::cache_wrapped(&state.db, did, year, &data).await {
        tracing::warn!("failed to cache wrapped data: {}", e);
    }

    Ok(Json(data))
}

async fn health_check() -> &'static str {
    "ok"
}

pub async fn run() {
    tracing_subscriber::fmt()
        .with_env_filter("teal_wrapped_api=debug,tower_http=debug")
        .init();

    let db = db::init_db().await.expect("failed to initialize database");
    tracing::info!("database initialized");

    let state = AppState { db };

    let app = Router::new()
        .route("/health", get(health_check))
        .route("/api/wrapped/:year", get(get_wrapped))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 3001));
    tracing::info!("listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
