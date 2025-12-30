use axum::{
    body::Body,
    extract::{Path, Query, State},
    http::header,
    response::{Json, Response},
    routing::get,
    Router,
};
use serde::{Deserialize, Serialize};
use sqlx::postgres::PgPool;
use std::net::SocketAddr;
use tokio::fs::File;
use tokio_util::io::ReaderStream;
use tower_http::cors::CorsLayer;
use tracing_subscriber;

pub mod atproto;
pub mod db;
pub mod fanart;
pub mod global_stats;
pub mod models;
pub mod wrapped;

#[derive(Clone)]
struct AppState {
    db: PgPool,
    spotify_client_id: String,
    spotify_client_secret: String,
    fanart_api_key: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WrappedData {
    pub year: u32,
    pub total_minutes: f64,
    pub total_plays: u32,
    pub top_artists: Vec<TopArtist>,
    pub top_tracks: Vec<TopTrack>,
    pub new_artists_count: u32,
    pub activity_graph: Vec<DayActivity>,
    pub weekday_avg_minutes: f64,
    pub weekend_avg_minutes: f64,
    pub longest_streak: u32,
    pub days_active: u32,
    pub avg_track_length_ms: i32,
    pub listening_diversity: f64,       // unique tracks / total plays
    pub hourly_distribution: [u32; 24], // plays per hour (UTC)
    pub top_hour: u8,                   // hour with most plays (0-23)
    pub longest_session_minutes: u32,   // longest continuous listening session
    #[serde(skip_serializing_if = "Option::is_none")]
    pub similar_users: Option<Vec<MusicBuddy>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MusicBuddy {
    did: String,
    similarity_score: f64,
    shared_artists: Vec<String>,
    shared_artist_count: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TopArtist {
    pub name: String,
    pub plays: u32,
    pub minutes: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mb_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_track: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_track_plays: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_track_duration_ms: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TopTrack {
    pub title: String,
    pub artist: String,
    pub plays: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recording_mb_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub release_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub release_mb_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DayActivity {
    pub date: String,
    pub plays: u32,
    pub minutes: f64,
}

#[derive(Debug, Deserialize)]
struct WrappedQuery {
    did: String,
}

#[axum::debug_handler]
async fn get_wrapped(
    State(state): State<AppState>,
    Path(year): Path<u32>,
    Query(params): Query<WrappedQuery>,
) -> Result<Json<WrappedData>, axum::http::StatusCode> {
    let did = &params.did;

    if let Ok(Some(cached)) = db::get_cached_wrapped(&state.db, did, year).await {
        tracing::info!("returning cached data for {} year {}", did, year);
        return Ok(Json(cached));
    }

    // Check if we have any plays in the database
    let has_data = match db::get_scrobbles_for_year(&state.db, did, year).await {
        Ok(db_scrobbles) if !db_scrobbles.is_empty() => {
            tracing::info!(
                "found {} scrobbles in database for {} year {}",
                db_scrobbles.len(),
                did,
                year
            );
            true
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
                axum::http::StatusCode::INTERNAL_SERVER_ERROR
            })?;

            // Store all play records for similarity matching
            if let Err(e) = db::store_user_plays(&state.db, did, &fetched_scrobbles).await {
                tracing::warn!("failed to store user plays: {}", e);
            }

            !fetched_scrobbles.is_empty()
        }
    };

    if !has_data {
        return Err(axum::http::StatusCode::NOT_FOUND);
    }

    let stats = wrapped::calculate_wrapped_stats(&state.db, did, year)
        .await
        .map_err(|e| {
            tracing::error!("failed to calculate wrapped stats: {}", e);
            axum::http::StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let mut top_artists = Vec::new();
    for (name, plays, minutes, mb_id) in stats.top_artists {
        let (top_track, top_track_plays, top_track_duration_ms) = stats
            .top_track_per_artist
            .get(&name)
            .map(|(track, count, duration)| (Some(track.clone()), Some(*count), Some(*duration)))
            .unwrap_or((None, None, None));

        // Fetch artist image if we have an MB ID
        let image_url = if let Some(ref mbid) = mb_id {
            tracing::info!("fetching artist image for {} (mbid: {})", name, mbid);
            match fanart::get_artist_image(
                &state.db,
                mbid,
                &name,
                &state.spotify_client_id,
                &state.spotify_client_secret,
                &state.fanart_api_key,
            )
            .await
            {
                Ok(url) => {
                    if let Some(ref u) = url {
                        tracing::info!("successfully fetched image for {}: {}", name, u);
                    } else {
                        tracing::warn!("no image found for {}", name);
                    }
                    url
                }
                Err(e) => {
                    tracing::error!("failed to fetch artist image for {}: {}", name, e);
                    None
                }
            }
        } else {
            tracing::debug!("no mbid for artist {}, skipping image fetch", name);
            None
        };

        top_artists.push(TopArtist {
            name,
            plays,
            minutes,
            mb_id,
            image_url,
            top_track,
            top_track_plays,
            top_track_duration_ms,
        });
    }

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

    let mut activity_graph: Vec<DayActivity> = stats
        .daily_plays
        .into_iter()
        .map(|(date, plays)| DayActivity {
            date: date.to_string(),
            plays,
            minutes: plays as f64 * 3.5,
        })
        .collect();

    // Sort by date to ensure chronological order for calendar generation
    activity_graph.sort_by(|a, b| a.date.cmp(&b.date));

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
        total_minutes: stats.total_minutes,
        total_plays: stats.total_plays,
        top_artists,
        top_tracks,
        new_artists_count: stats.new_artists_count,
        activity_graph,
        weekday_avg_minutes: stats.weekday_avg_minutes,
        weekend_avg_minutes: stats.weekend_avg_minutes,
        longest_streak: stats.longest_streak,
        days_active: stats.days_active,
        similar_users,
        avg_track_length_ms: stats.avg_track_length_ms,
        listening_diversity: stats.listening_diversity,
        hourly_distribution: stats.hourly_distribution,
        top_hour: stats.top_hour,
        longest_session_minutes: stats.longest_session_minutes,
    };

    if let Err(e) = db::cache_wrapped(&state.db, did, year, &data).await {
        tracing::warn!("failed to cache wrapped data: {}", e);
    }

    Ok(Json(data))
}

async fn get_global_stats(
    State(state): State<AppState>,
    Path(year): Path<u32>,
) -> Result<Json<global_stats::GlobalStats>, axum::http::StatusCode> {
    if let Ok(Some(cached)) = db::get_cached_global_stats(&state.db, year).await {
        tracing::info!("returning cached global stats for year {}", year);
        return Ok(Json(cached));
    }

    tracing::info!("calculating global stats for year {}", year);
    let stats = global_stats::calculate_global_stats(&state.db, year)
        .await
        .map_err(|e| {
            tracing::error!("failed to calculate global stats: {}", e);
            axum::http::StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if let Err(e) = db::cache_global_stats(&state.db, year, &stats).await {
        tracing::warn!("failed to cache global stats: {}", e);
    }

    Ok(Json(stats))
}

async fn health_check() -> &'static str {
    "ok"
}

async fn serve_image(Path(filename): Path<String>) -> Result<Response, axum::http::StatusCode> {
    let filepath = std::path::PathBuf::from("./images").join(&filename);

    // Security: prevent path traversal
    if !filepath.starts_with("./images") {
        return Err(axum::http::StatusCode::BAD_REQUEST);
    }

    let file = File::open(&filepath)
        .await
        .map_err(|_| axum::http::StatusCode::NOT_FOUND)?;

    // Determine content type from extension
    let content_type = if filename.ends_with(".png") {
        "image/png"
    } else if filename.ends_with(".webp") {
        "image/webp"
    } else {
        "image/jpeg"
    };

    let stream = ReaderStream::new(file);
    let body = Body::from_stream(stream);

    Ok(Response::builder()
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CACHE_CONTROL, "public, max-age=2592000") // 30 days
        .body(body)
        .unwrap())
}

pub async fn run() {
    tracing_subscriber::fmt()
        .with_env_filter("teal_wrapped_api=debug,tower_http=debug")
        .init();

    let db = db::init_db().await.expect("failed to initialize database");
    tracing::info!("database initialized");

    let spotify_client_id = std::env::var("SPOTIFY_CLIENT_ID").unwrap_or_default();
    let spotify_client_secret = std::env::var("SPOTIFY_CLIENT_SECRET").unwrap_or_default();
    let fanart_api_key = std::env::var("FANART_API_KEY").unwrap_or_default();

    if spotify_client_id.is_empty() && fanart_api_key.is_empty() {
        tracing::warn!(
            "Neither SPOTIFY_CLIENT_ID nor FANART_API_KEY set, artist images will not be fetched"
        );
    }

    let state = AppState {
        db,
        spotify_client_id,
        spotify_client_secret,
        fanart_api_key,
    };

    let app = Router::new()
        .route("/health", get(health_check))
        .route("/api/wrapped/:year", get(get_wrapped))
        .route("/api/global-stats/:year", get(get_global_stats))
        .route("/images/:filename", get(serve_image))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 3001));
    tracing::info!("listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
