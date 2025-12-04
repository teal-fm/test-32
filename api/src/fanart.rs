use reqwest::Client;
use serde::Deserialize;
use sqlx::PgPool;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::fs;
use tokio::io::AsyncWriteExt;

#[derive(Debug, Deserialize)]
struct FanartResponse {
    #[serde(default)]
    artistthumb: Vec<ArtistThumb>,
}

#[derive(Debug, Deserialize)]
struct ArtistThumb {
    url: String,
}

#[derive(Debug, Deserialize)]
struct SpotifySearchResponse {
    artists: SpotifyArtists,
}

#[derive(Debug, Deserialize)]
struct SpotifyArtists {
    items: Vec<SpotifyArtist>,
}

#[derive(Debug, Deserialize)]
struct SpotifyArtist {
    images: Vec<SpotifyImage>,
}

#[derive(Debug, Deserialize)]
struct SpotifyImage {
    url: String,
    height: u32,
    width: u32,
}

#[derive(Debug, Deserialize)]
struct SpotifyTokenResponse {
    access_token: String,
}

pub async fn get_artist_image(
    pool: &PgPool,
    mb_id: &str,
    artist_name: &str,
    spotify_client_id: &str,
    spotify_client_secret: &str,
    fanart_api_key: &str,
) -> Result<Option<String>, anyhow::Error> {
    // Check cache first
    if let Some(cached_path) = check_cache(pool, mb_id).await? {
        tracing::debug!("using cached image for {}: {}", artist_name, cached_path);
        return Ok(Some(cached_path));
    }

    let client = Client::new();
    let mut image_url: Option<String> = None;
    let mut source = "none";

    // Try Spotify first
    if !spotify_client_id.is_empty() && !spotify_client_secret.is_empty() {
        tracing::debug!("trying spotify for artist: {}", artist_name);
        match fetch_spotify_image(
            &client,
            artist_name,
            spotify_client_id,
            spotify_client_secret,
        )
        .await
        {
            Ok(Some(url)) => {
                tracing::info!("found spotify image for {}", artist_name);
                image_url = Some(url);
                source = "spotify";
            }
            Ok(None) => {
                tracing::debug!("no spotify image found for {}", artist_name);
            }
            Err(e) => {
                tracing::warn!("spotify fetch error for {}: {}", artist_name, e);
            }
        }
    } else {
        tracing::debug!("spotify credentials not set, skipping");
    }

    // Fallback to fanart.tv
    if image_url.is_none() && !fanart_api_key.is_empty() {
        if let Ok(Some(url)) = fetch_fanart_image(&client, mb_id, fanart_api_key).await {
            image_url = Some(url);
            source = "fanart";
        }
    }

    // Download and store the image locally
    if let Some(url) = image_url {
        match download_and_store_image(&client, mb_id, &url).await {
            Ok(local_path) => {
                cache_image(pool, mb_id, Some(&local_path), source).await?;
                return Ok(Some(local_path));
            }
            Err(e) => {
                tracing::warn!("failed to download image for {}: {}", mb_id, e);
            }
        }
    }

    // Cache the miss to avoid repeated API calls
    cache_image(pool, mb_id, None, "none").await?;
    Ok(None)
}

async fn download_and_store_image(
    client: &Client,
    mb_id: &str,
    image_url: &str,
) -> Result<String, anyhow::Error> {
    // Create images directory if it doesn't exist
    let images_dir = PathBuf::from("./images");
    fs::create_dir_all(&images_dir).await?;

    // Download the image
    let response = client.get(image_url).send().await?;
    let bytes = response.bytes().await?;

    // Determine file extension from URL or content-type
    let extension = image_url
        .split('.')
        .last()
        .and_then(|ext| {
            let ext = ext.split('?').next()?;
            if matches!(ext, "jpg" | "jpeg" | "png" | "webp") {
                Some(ext)
            } else {
                None
            }
        })
        .unwrap_or("jpg");

    // Save to disk
    let filename = format!("{}.{}", mb_id, extension);
    let filepath = images_dir.join(&filename);

    let mut file = fs::File::create(&filepath).await?;
    file.write_all(&bytes).await?;

    Ok(format!("/images/{}", filename))
}

async fn fetch_spotify_image(
    client: &Client,
    artist_name: &str,
    client_id: &str,
    client_secret: &str,
) -> Result<Option<String>, anyhow::Error> {
    // Get access token
    let auth = format!("{}:{}", client_id, client_secret);
    let encoded =
        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, auth.as_bytes());

    let token_response = client
        .post("https://accounts.spotify.com/api/token")
        .header("Authorization", format!("Basic {}", encoded))
        .form(&[("grant_type", "client_credentials")])
        .send()
        .await?;

    if !token_response.status().is_success() {
        return Ok(None);
    }

    let token: SpotifyTokenResponse = token_response.json().await?;

    // Search for artist
    let search_response = client
        .get("https://api.spotify.com/v1/search")
        .header("Authorization", format!("Bearer {}", token.access_token))
        .query(&[("q", artist_name), ("type", "artist"), ("limit", "1")])
        .send()
        .await?;

    if !search_response.status().is_success() {
        return Ok(None);
    }

    let search: SpotifySearchResponse = search_response.json().await?;

    // Get the largest image
    let image_url = search.artists.items.first().and_then(|artist| {
        artist
            .images
            .iter()
            .max_by_key(|img| img.width)
            .map(|img| img.url.clone())
    });

    Ok(image_url)
}

async fn fetch_fanart_image(
    client: &Client,
    mb_id: &str,
    api_key: &str,
) -> Result<Option<String>, anyhow::Error> {
    let url = format!(
        "https://webservice.fanart.tv/v3/music/{}?api_key={}",
        mb_id, api_key
    );

    let response = client.get(&url).send().await?;

    if !response.status().is_success() {
        return Ok(None);
    }

    let fanart: FanartResponse = response.json().await?;
    let image_url = fanart.artistthumb.first().map(|t| t.url.clone());

    Ok(image_url)
}

async fn check_cache(pool: &PgPool, mb_id: &str) -> Result<Option<String>, anyhow::Error> {
    let result = sqlx::query!(
        r#"
        SELECT image_url, cached_at
        FROM artist_images
        WHERE mb_id = $1
        "#,
        mb_id
    )
    .fetch_optional(pool)
    .await?;

    if let Some(record) = result {
        // Cache for 30 days
        let cache_duration = 30 * 24 * 60 * 60; // 30 days in seconds
        let now = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs() as i64;

        if now - record.cached_at < cache_duration {
            return Ok(record.image_url);
        }
    }

    Ok(None)
}

async fn cache_image(
    pool: &PgPool,
    mb_id: &str,
    image_url: Option<&str>,
    source: &str,
) -> Result<(), anyhow::Error> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs() as i64;

    sqlx::query!(
        r#"
        INSERT INTO artist_images (mb_id, image_url, image_source, cached_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (mb_id)
        DO UPDATE SET image_url = $2, image_source = $3, cached_at = $4
        "#,
        mb_id,
        image_url,
        source,
        now
    )
    .execute(pool)
    .await?;

    Ok(())
}
