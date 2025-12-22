use anyhow::{Context, Result};
use lexicon::fm_teal::alpha::feed::play::Play;
use repo_stream::{DiskBuilder, Driver, DriverBuilder};
use serde::{Deserialize, Serialize};
use std::io::Cursor;

const PLAY_COLLECTION: &str = "fm.teal.alpha.feed.play";

#[derive(Debug, Deserialize)]
struct BlobRef {
    #[serde(rename = "$link")]
    link: String,
}

#[derive(Debug, Deserialize)]
struct Blob {
    #[serde(rename = "ref")]
    blob_ref: BlobRef,
    #[serde(rename = "mimeType")]
    _mime_type: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ProfileRecord {
    avatar: Option<Blob>,
}

#[derive(Debug, Deserialize)]
struct GetRecordResponse {
    value: ProfileRecord,
}

/// Fetch user's profile picture URL from their AT Protocol repository
pub async fn fetch_profile_picture(did: &str) -> Result<Option<String>> {
    let pds = resolve_pds(did).await?;

    // Fetch the profile record
    let url = format!(
        "{}/xrpc/com.atproto.repo.getRecord?repo={}&collection=app.bsky.actor.profile&rkey=self",
        pds, did
    );

    let response = reqwest::get(&url).await?;

    if !response.status().is_success() {
        tracing::debug!("no profile record found for {}", did);
        return Ok(None);
    }

    let record: GetRecordResponse = response.json().await?;

    // If there's an avatar, construct the blob URL
    if let Some(avatar) = record.value.avatar {
        let blob_url = format!(
            "{}/xrpc/com.atproto.sync.getBlob?did={}&cid={}",
            pds, did, avatar.blob_ref.link
        );
        return Ok(Some(blob_url));
    }

    Ok(None)
}

fn extract_artists_from_play(play: &Play) -> (Vec<String>, Option<Vec<String>>) {
    // Handle new format with artists array
    if let Some(artists) = play.artists.as_ref() {
        let names: Vec<String> = artists
            .iter()
            .map(|artist| artist.artist_name.to_string())
            .collect();
        let mbids: Vec<String> = artists
            .iter()
            .filter_map(|artist| artist.artist_mb_id.as_ref().map(|id| id.to_string()))
            .collect();
        let mbids_opt = if mbids.is_empty() { None } else { Some(mbids) };
        return (names, mbids_opt);
    }

    // Fallback to old format with separate artist_names and artist_mb_ids arrays
    let names = play
        .artist_names
        .as_ref()
        .map(|names| names.iter().map(|n| n.to_string()).collect())
        .unwrap_or_default();

    let mbids = play
        .artist_mb_ids
        .as_ref()
        .map(|ids| ids.iter().map(|id| id.to_string()).collect::<Vec<_>>())
        .filter(|ids: &Vec<String>| !ids.is_empty());

    (names, mbids)
}

/// Resolve DID to find the user's PDS endpoint
async fn resolve_pds(did: &str) -> Result<String> {
    let plc_url = format!("https://plc.directory/{}", did);
    let response = reqwest::get(&plc_url).await?;
    let doc: serde_json::Value = response.json().await?;

    let service = doc
        .get("service")
        .and_then(|s| s.as_array())
        .and_then(|arr| arr.first())
        .and_then(|s| s.get("serviceEndpoint"))
        .and_then(|e| e.as_str())
        .ok_or_else(|| anyhow::anyhow!("no PDS found in DID document"))?;

    Ok(service.to_string())
}

/// Download and parse a CAR file from a user's AT Protocol repo
pub async fn fetch_scrobbles(did: &str, _year: u32) -> Result<Vec<ScrobbleRecord>> {
    // Resolve DID to PDS endpoint
    let pds = resolve_pds(did).await?;
    tracing::info!("resolved PDS: {}", pds);

    // Download CAR file from PDS
    let pds_url = format!("{}/xrpc/com.atproto.sync.getRepo?did={}", pds, did);

    tracing::info!("fetching repo for {}", did);
    let response = reqwest::get(&pds_url)
        .await
        .context("failed to fetch repo")?;

    let status = response.status();
    let car_bytes = response
        .bytes()
        .await
        .context("failed to read response bytes")?;

    tracing::info!("downloaded {} bytes (status: {})", car_bytes.len(), status);

    if !status.is_success() {
        let error_text = String::from_utf8_lossy(&car_bytes);
        anyhow::bail!("failed to fetch repo: {} - {}", status, error_text);
    }

    // Create an async reader from the bytes
    let reader = Cursor::new(car_bytes.to_vec());
    let reader = tokio::io::BufReader::new(reader);

    // Load the CAR file with repo-stream
    let mut scrobbles = Vec::new();

    match DriverBuilder::new()
        .with_mem_limit_mb(100)
        .with_block_processor(|block| block.to_vec())
        .load_car(reader)
        .await?
    {
        Driver::Memory(_commit, mut driver) => {
            // Process records in chunks
            while let Some(chunk) = driver.next_chunk(256).await? {
                for (rkey, block_data) in chunk {
                    // Check if this is a play record by rkey prefix
                    if rkey.starts_with(PLAY_COLLECTION) {
                        // Deserialize the Play record
                        if let Ok(play) = serde_ipld_dagcbor::from_slice::<Play>(&block_data) {
                            let (artists, artist_mb_ids) = extract_artists_from_play(&play);
                            let played_time = play.played_time.as_ref().map(|dt| dt.to_string());

                            scrobbles.push(ScrobbleRecord {
                                uri: format!("at://{}/{}", did, rkey),
                                cid: String::new(), // CID not available from this API
                                track_name: play.track_name.to_string(),
                                artists,
                                played_time,
                                duration: play.duration,
                                recording_mb_id: play
                                    .recording_mb_id
                                    .as_ref()
                                    .map(|s| s.to_string()),
                                track_mb_id: play.track_mb_id.as_ref().map(|s| s.to_string()),
                                release_mb_id: play.release_mb_id.as_ref().map(|s| s.to_string()),
                                release_name: play.release_name.as_ref().map(|s| s.to_string()),
                                artist_mb_ids,
                            });
                        }
                    }
                }
            }
        }
        Driver::Disk(paused) => {
            tracing::info!("repo exceeds memory limit, using disk storage");

            // Create temporary directory for disk storage
            let temp_dir = std::env::temp_dir().join(format!("repo-{}", did.replace(':', "-")));
            std::fs::create_dir_all(&temp_dir)?;

            let disk_path = temp_dir.join("blocks.db");
            let store = DiskBuilder::new().open(disk_path).await?;

            let (_commit, mut driver) = paused.finish_loading(store).await?;

            // Process records in chunks from disk
            while let Some(chunk) = driver.next_chunk(256).await? {
                for (rkey, block_data) in chunk {
                    if rkey.starts_with(PLAY_COLLECTION) {
                        if let Ok(play) = serde_ipld_dagcbor::from_slice::<Play>(&block_data) {
                            let (artists, artist_mb_ids) = extract_artists_from_play(&play);
                            let played_time = play.played_time.as_ref().map(|dt| dt.to_string());

                            scrobbles.push(ScrobbleRecord {
                                uri: format!("at://{}/{}", did, rkey),
                                cid: String::new(),
                                track_name: play.track_name.to_string(),
                                artists,
                                played_time,
                                duration: play.duration,
                                recording_mb_id: play
                                    .recording_mb_id
                                    .as_ref()
                                    .map(|s| s.to_string()),
                                track_mb_id: play.track_mb_id.as_ref().map(|s| s.to_string()),
                                release_mb_id: play.release_mb_id.as_ref().map(|s| s.to_string()),
                                release_name: play.release_name.as_ref().map(|s| s.to_string()),
                                artist_mb_ids,
                            });
                        }
                    }
                }
            }

            // Clean up temporary directory
            if let Err(e) = std::fs::remove_dir_all(&temp_dir) {
                tracing::warn!("failed to clean up temp dir: {}", e);
            }
        }
    }

    tracing::info!("found {} play records", scrobbles.len());

    Ok(scrobbles)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScrobbleRecord {
    pub uri: String,
    pub cid: String,
    pub track_name: String,
    pub artists: Vec<String>,
    pub played_time: Option<String>,
    pub duration: Option<i64>,
    pub recording_mb_id: Option<String>,
    pub track_mb_id: Option<String>,
    pub release_mb_id: Option<String>,
    pub release_name: Option<String>,
    pub artist_mb_ids: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct MiniDocResponse {
    did: String,
}

/// Resolve a handle to a DID using the Microcosm resolution service
pub async fn resolve_handle_to_did(handle: &str) -> Result<String> {
    let url = format!(
        "https://slingshot.microcosm.blue/xrpc/com.bad-example.identity.resolveMiniDoc?identifier={}",
        handle
    );

    let response = reqwest::get(&url).await?;

    if !response.status().is_success() {
        anyhow::bail!("failed to resolve handle: {}", response.status());
    }

    let doc: MiniDocResponse = response.json().await?;
    Ok(doc.did)
}
