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
pub mod models;
pub mod og_image;
pub mod wrapped;

async fn lookup_release_from_recording(
    client: &reqwest::Client,
    recording_mb_id: &str,
) -> Result<Option<String>, reqwest::Error> {
    let url = format!(
        "https://musicbrainz.org/ws/2/recording/{}?fmt=json&inc=releases",
        recording_mb_id
    );

    let response = client
        .get(&url)
        .header("User-Agent", "TealWrapped/1.0 (https://teal.fm)")
        .send()
        .await?;

    if !response.status().is_success() {
        return Ok(None);
    }

    let data: serde_json::Value = response.json().await?;
    let releases = data.get("releases").and_then(|r| r.as_array());

    if let Some(releases) = releases {
        if let Some(first_release) = releases.first() {
            if let Some(release_id) = first_release.get("id").and_then(|id| id.as_str()) {
                return Ok(Some(release_id.to_string()));
            }
        }
    }

    Ok(None)
}

#[derive(Clone)]
struct AppState {
    db: PgPool,
    http_client: reqwest::Client,
    spotify_client_id: String,
    spotify_client_secret: String,
    fanart_api_key: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WrappedData {
    year: u32,
    total_minutes: f64,
    total_plays: u32,
    top_artists: Vec<TopArtist>,
    top_tracks: Vec<TopTrack>,
    new_artists_count: u32,
    activity_graph: Vec<DayActivity>,
    weekday_avg_minutes: f64,
    weekend_avg_minutes: f64,
    longest_streak: u32,
    days_active: u32,
    pub avg_track_length_ms: i32,
    pub listening_diversity: f64,       // unique tracks / total plays
    pub hourly_distribution: [u32; 24], // plays per hour (UTC)
    pub top_hour: u8,                   // hour with most plays (0-23)
    pub longest_session_minutes: u32,   // longest continuous listening session
    #[serde(skip_serializing_if = "Option::is_none")]
    similar_users: Option<Vec<MusicBuddy>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    profile_picture: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GlobalWrappedData {
    year: u32,
    verified_minutes: f64,
    total_users: u32,
    unique_artists: u32,
    unique_tracks: u32,
    top_users: Vec<TopUser>,
    top_artists: Vec<GlobalTopArtist>,
    top_tracks: Vec<TopTrack>,
    #[serde(skip_serializing_if = "Option::is_none")]
    user_percentile: Option<GlobalUserPercentile>,
    distribution: GlobalDistribution,
}

#[derive(Debug, Serialize, Deserialize)]
struct GlobalTopArtist {
    name: String,
    plays: u32,
    minutes: f64,
    mb_id: Option<String>,
    image_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GlobalDistribution {
    minutes_percentiles: Vec<(i32, f64)>,
    plays_percentiles: Vec<(i32, u32)>,
    artists_percentiles: Vec<(i32, u32)>,
    tracks_percentiles: Vec<(i32, u32)>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GlobalUserPercentile {
    total_minutes: i32,
    total_plays: i32,
    unique_artists: i32,
    unique_tracks: i32,
}

#[derive(Debug, Serialize, Deserialize)]
struct TopUser {
    did: String,
    plays: u32,
    minutes: f64,
}

#[derive(Debug, Serialize, Deserialize)]
struct MusicBuddy {
    did: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    handle: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    profile_picture: Option<String>,
    similarity_score: f64,
    shared_artists: Vec<String>,
    shared_artist_count: u32,
}

#[derive(Debug, Serialize, Deserialize)]
struct TopArtist {
    name: String,
    plays: u32,
    minutes: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    mb_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    image_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_track: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_track_plays: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_track_duration_ms: Option<i32>,
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
    minutes: f64,
}

#[derive(Debug, Deserialize)]
struct WrappedQuery {
    did: String,
}

#[derive(Debug, Deserialize)]
struct GlobalWrappedQuery {
    did: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OgImageQuery {
    handle: String,
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

    // Find similar users (music buddies) and resolve their profiles
    let similar_users = match db::find_similar_users(&state.db, did, year, 3).await {
        Ok(users) => {
            let mut buddies = Vec::new();
            for u in users {
                // Resolve handle and profile picture for each similar user
                let (handle, profile_picture) = match atproto::resolve_did_document(&u.did).await {
                    Ok(doc) => {
                        let pfp = match atproto::fetch_profile_picture(&u.did).await {
                            Ok(url) => url,
                            Err(e) => {
                                tracing::debug!("failed to fetch pfp for {}: {}", u.did, e);
                                None
                            }
                        };
                        (doc.handle, pfp)
                    }
                    Err(e) => {
                        tracing::debug!("failed to resolve did doc for {}: {}", u.did, e);
                        (None, None)
                    }
                };

                buddies.push(MusicBuddy {
                    did: u.did,
                    handle,
                    profile_picture,
                    similarity_score: u.similarity_score,
                    shared_artist_count: u.shared_artists.len() as u32,
                    shared_artists: u.shared_artists,
                });
            }
            Some(buddies)
        }
        Err(e) => {
            tracing::warn!("failed to find similar users: {}", e);
            None
        }
    };

    // Fetch profile picture from AT Protocol
    let profile_picture = match atproto::fetch_profile_picture(did).await {
        Ok(url) => {
            if url.is_some() {
                tracing::info!("fetched profile picture for {}", did);
            }
            url
        }
        Err(e) => {
            tracing::warn!("failed to fetch profile picture for {}: {}", did, e);
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
        profile_picture,
    };

    if let Err(e) = db::cache_wrapped(&state.db, did, year, &data).await {
        tracing::warn!("failed to cache wrapped data: {}", e);
    }

    Ok(Json(data))
}

#[axum::debug_handler]
async fn get_global_wrapped(
    State(state): State<AppState>,
    Path(year): Path<u32>,
    Query(params): Query<GlobalWrappedQuery>,
) -> Result<Json<GlobalWrappedData>, axum::http::StatusCode> {
    if let Ok(Some(_cached)) = wrapped::get_cached_global_wrapped(&state.db, year).await {
        tracing::info!("returning cached global data for year {}", year);
    } else {
        tracing::info!("calculating global wrapped stats for year {}", year);
    }

    let user_did = params.did.as_deref();
    let stats = wrapped::calculate_global_wrapped_stats(&state.db, year, user_did)
        .await
        .map_err(|e| {
            tracing::error!("failed to calculate global wrapped stats: {}", e);
            axum::http::StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if let Err(e) = wrapped::cache_global_wrapped(&state.db, year, &stats).await {
        tracing::warn!("failed to cache global wrapped data: {}", e);
    }

    let top_users = stats
        .top_users
        .into_iter()
        .map(|(did, plays, minutes)| TopUser { did, plays, minutes })
        .collect();

    let spotify_client_id = std::env::var("SPOTIFY_CLIENT_ID").unwrap_or_default();
    let spotify_client_secret = std::env::var("SPOTIFY_CLIENT_SECRET").unwrap_or_default();
    let fanart_api_key = std::env::var("FANART_API_KEY").unwrap_or_default();

    let mut top_artists: Vec<GlobalTopArtist> = Vec::new();
    for (name, plays, minutes, mb_id) in stats.top_artists {
        let image_url = if let Some(id) = &mb_id {
            match fanart::get_artist_image(
                &state.db,
                id,
                &name,
                &spotify_client_id,
                &spotify_client_secret,
                &fanart_api_key,
            )
            .await
            {
                Ok(Some(url)) => Some(url),
                Ok(None) => None,
                Err(e) => {
                    tracing::warn!("failed to fetch image for {}: {}", name, e);
                    None
                }
            }
        } else {
            None
        };

        top_artists.push(GlobalTopArtist {
            name,
            plays,
            minutes,
            mb_id,
            image_url,
        });
    }

    let top_tracks: Vec<TopTrack> = stats
        .top_tracks
        .into_iter()
        .map(|((title, artist), plays, metadata)| async move {
            let mut release_mb_id = metadata.release_mb_id;

            if release_mb_id.is_none() {
                if let Some(ref recording_mb_id) = metadata.recording_mb_id {
                    match lookup_release_from_recording(&state.http_client, recording_mb_id).await {
                        Ok(Some(id)) => release_mb_id = Some(id),
                        Ok(None) => tracing::debug!("no release found for recording {}", recording_mb_id),
                        Err(e) => tracing::warn!("failed to lookup release for {}: {}", recording_mb_id, e),
                    }
                }
            }

            TopTrack {
                title,
                artist,
                plays,
                recording_mb_id: metadata.recording_mb_id,
                release_name: metadata.release_name,
                release_mb_id,
            }
        })
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .collect();

    let user_percentile = stats.user_percentile.map(|p| GlobalUserPercentile {
        total_minutes: p.total_minutes,
        total_plays: p.total_plays,
        unique_artists: p.unique_artists,
        unique_tracks: p.unique_tracks,
    });

    let distribution = GlobalDistribution {
        minutes_percentiles: stats.distribution.minutes_percentiles,
        plays_percentiles: stats.distribution.plays_percentiles,
        artists_percentiles: stats.distribution.artists_percentiles,
        tracks_percentiles: stats.distribution.tracks_percentiles,
    };

    let data = GlobalWrappedData {
        year,
        verified_minutes: stats.verified_minutes,
        total_users: stats.total_users,
        unique_artists: stats.unique_artists,
        unique_tracks: stats.unique_tracks,
        top_users,
        top_artists,
        top_tracks,
        user_percentile,
        distribution,
    };

    Ok(Json(data))
}

async fn health_check() -> &'static str {
    "ok"
}

#[axum::debug_handler]
async fn get_og_image(
    State(state): State<AppState>,
    Path(year): Path<u32>,
    Query(params): Query<OgImageQuery>,
) -> Result<Response, axum::http::StatusCode> {
    let handle = &params.handle;

    // Check for cached OG image on disk first
    let cache_dir = std::path::Path::new("./images/og");
    let cache_filename = format!("{}_{}.png", handle.replace('.', "_"), year);
    let cache_path = cache_dir.join(&cache_filename);

    if cache_path.exists() {
        tracing::info!("serving cached OG image for {} (year {})", handle, year);
        let file = File::open(&cache_path)
            .await
            .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;
        let stream = ReaderStream::new(file);
        let body = Body::from_stream(stream);

        return Ok(Response::builder()
            .header(header::CONTENT_TYPE, "image/png")
            .header(header::CACHE_CONTROL, "public, max-age=86400")
            .body(body)
            .unwrap());
    }

    // Resolve handle to DID
    let did = atproto::resolve_handle_to_did(handle).await.map_err(|e| {
        tracing::error!("failed to resolve handle {}: {}", handle, e);
        axum::http::StatusCode::NOT_FOUND
    })?;

    // Try to get cached wrapped data first
    let wrapped_data = if let Ok(Some(cached)) = db::get_cached_wrapped(&state.db, &did, year).await
    {
        Some(cached)
    } else {
        // Try to calculate it
        match wrapped::calculate_wrapped_stats(&state.db, &did, year).await {
            Ok(stats) => {
                // Get profile picture
                let mut profile_picture: Option<String> = None;
                let mut top_artists: Vec<TopArtist> = Vec::new();

                // Get profile picture
                if let Ok(Some(pfp)) = atproto::fetch_profile_picture(&did).await {
                    profile_picture = Some(pfp);
                }

                // Get top artist with image for OG background
                if let Some((name, plays, minutes, mb_id)) = stats.top_artists.first() {
                    let image_url = if let Some(ref mbid) = mb_id {
                        fanart::get_artist_image(
                            &state.db,
                            mbid,
                            name,
                            &state.spotify_client_id,
                            &state.spotify_client_secret,
                            &state.fanart_api_key,
                        )
                        .await
                        .ok()
                        .flatten()
                    } else {
                        None
                    };

                    top_artists.push(TopArtist {
                        name: name.clone(),
                        plays: *plays,
                        minutes: *minutes,
                        mb_id: mb_id.clone(),
                        image_url,
                        top_track: None,
                        top_track_plays: None,
                        top_track_duration_ms: None,
                    });
                }

                Some(WrappedData {
                    year,
                    total_minutes: stats.total_minutes,
                    total_plays: stats.total_plays,
                    top_artists,
                    top_tracks: vec![],
                    new_artists_count: 0,
                    activity_graph: vec![],
                    weekday_avg_minutes: 0.0,
                    weekend_avg_minutes: 0.0,
                    longest_streak: 0,
                    days_active: 0,
                    similar_users: None,
                    avg_track_length_ms: 0,
                    listening_diversity: 0.0,
                    hourly_distribution: [0; 24],
                    top_hour: 0,
                    longest_session_minutes: 0,
                    profile_picture,
                })
            }
            Err(_) => None,
        }
    };

    // Extract necessary data for OG image
    let profile_picture = wrapped_data
        .as_ref()
        .and_then(|d| d.profile_picture.clone());
    let top_artist_image = wrapped_data
        .as_ref()
        .and_then(|d| d.top_artists.first())
        .and_then(|a| a.image_url.clone());

    tracing::info!(
        "generating OG image for {} (year {}), profile_pic: {}, artist_bg: {}",
        handle,
        year,
        profile_picture.is_some(),
        top_artist_image.is_some()
    );

    // Generate the OG image
    let image_bytes = og_image::generate_og_image(
        handle,
        year,
        profile_picture.as_deref(),
        top_artist_image.as_deref(),
    )
    .await
    .map_err(|e| {
        tracing::error!("failed to generate OG image: {}", e);
        axum::http::StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Cache the generated image to disk
    if let Err(e) = tokio::fs::create_dir_all(cache_dir).await {
        tracing::warn!("failed to create og_images cache directory: {}", e);
    } else if let Err(e) = tokio::fs::write(&cache_path, &image_bytes).await {
        tracing::warn!("failed to cache OG image to disk: {}", e);
    } else {
        tracing::info!("cached OG image to {}", cache_path.display());
    }

    Ok(Response::builder()
        .header(header::CONTENT_TYPE, "image/png")
        .header(header::CACHE_CONTROL, "public, max-age=86400") // 24 hours
        .body(Body::from(image_bytes))
        .unwrap())
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
        http_client: reqwest::Client::new(),
        spotify_client_id,
        spotify_client_secret,
        fanart_api_key,
    };

    let app = Router::new()
        .route("/health", get(health_check))
        .route("/api/wrapped/:year", get(get_wrapped))
        .route("/api/wrapped/:year/og", get(get_og_image))
        .route("/api/global-wrapped/:year", get(get_global_wrapped))
        .route("/images/:filename", get(serve_image))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 3001));
    tracing::info!("listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
