use anyhow::{Context, Result};
use repo_stream::{DiskBuilder, Driver, DriverBuilder};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::io::Cursor;

/// Current play collection.
const PLAY_COLLECTION: &str = "fm.teal.feed.play";
/// Pre-migration play collection. Older plays (and repos that never migrated) live here.
const LEGACY_PLAY_COLLECTION: &str = "fm.teal.alpha.feed.play";
/// Every collection we ingest plays from, newest first. When the same play exists in
/// more than one (e.g. it was copied during migration), the first one wins.
const PLAY_COLLECTIONS: [&str; 2] = [PLAY_COLLECTION, LEGACY_PLAY_COLLECTION];

/// The fields we read from a play record. `fm.teal.feed.play` and
/// `fm.teal.alpha.feed.play` share these names and shapes, so one struct decodes both;
/// anything else in the record is ignored.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlayRecord {
    track_name: String,
    #[serde(default)]
    artists: Option<Vec<PlayArtist>>,
    #[serde(default)]
    artist_names: Option<Vec<String>>,
    #[serde(default)]
    artist_mb_ids: Option<Vec<String>>,
    #[serde(default)]
    duration: Option<i64>,
    #[serde(default)]
    played_time: Option<String>,
    #[serde(default)]
    recording_mb_id: Option<String>,
    #[serde(default)]
    track_mb_id: Option<String>,
    #[serde(default)]
    release_mb_id: Option<String>,
    #[serde(default)]
    release_name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlayArtist {
    artist_name: String,
    #[serde(default)]
    artist_mb_id: Option<String>,
}

/// `fm.teal.feed.play` formats MusicBrainz IDs as `mbid:<uuid>`; the alpha lexicon used
/// bare UUIDs. Store bare UUIDs so both match each other and work in MusicBrainz,
/// Cover Art Archive, and fanart.tv URLs.
fn normalize_mbid(id: &str) -> Option<String> {
    let id = id.trim();
    let id = id.strip_prefix("mbid:").unwrap_or(id);
    if id.is_empty() {
        None
    } else {
        Some(id.to_string())
    }
}

/// Which play collection a repo path (`<collection>/<rkey>`) belongs to, if any.
fn play_collection_of(path: &str) -> Option<&'static str> {
    PLAY_COLLECTIONS.into_iter().find(|collection| {
        path.strip_prefix(collection)
            .is_some_and(|rest| rest.starts_with('/'))
    })
}

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

#[derive(Debug, Deserialize)]
struct RepoEntry {
    did: String,
}

#[derive(Debug, Deserialize)]
struct RepoListResponse {
    repos: Vec<RepoEntry>,
    cursor: Option<String>,
}

pub async fn fetch_all_dids() -> Result<Vec<String>> {
    let mut seen = HashSet::new();
    let mut all_dids = Vec::new();

    for collection in PLAY_COLLECTIONS {
        for did in fetch_dids_for_collection(collection).await? {
            if seen.insert(did.clone()) {
                all_dids.push(did);
            }
        }
    }

    tracing::info!("{} unique DIDs across all play collections", all_dids.len());
    Ok(all_dids)
}

async fn fetch_dids_for_collection(collection: &str) -> Result<Vec<String>> {
    let mut all_dids = Vec::new();
    let mut cursor: Option<String> = None;
    let base_url =
        "https://relay1.us-east.bsky.network/xrpc/com.atproto.sync.listReposByCollection";

    loop {
        let url = if let Some(c) = &cursor {
            format!("{}?collection={}&cursor={}", base_url, collection, c)
        } else {
            format!("{}?collection={}", base_url, collection)
        };

        tracing::info!("fetching {} DIDs from relay (cursor: {:?})", collection, cursor);
        let response = reqwest::get(&url).await?;
        let list: RepoListResponse = response.json().await?;

        let count = list.repos.len();
        all_dids.extend(list.repos.into_iter().map(|r| r.did));

        tracing::info!(
            "fetched {} {} DIDs (total: {})",
            count,
            collection,
            all_dids.len()
        );

        if list.cursor.is_none() || count == 0 {
            break;
        }
        cursor = list.cursor;
    }

    Ok(all_dids)
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

fn extract_artists_from_play(play: &PlayRecord) -> (Vec<String>, Option<Vec<String>>) {
    // Prefer the structured artists array
    if let Some(artists) = play.artists.as_ref().filter(|a| !a.is_empty()) {
        let names: Vec<String> = artists.iter().map(|a| a.artist_name.clone()).collect();
        let mbids: Vec<String> = artists
            .iter()
            .filter_map(|a| a.artist_mb_id.as_deref().and_then(normalize_mbid))
            .collect();
        let mbids_opt = if mbids.is_empty() { None } else { Some(mbids) };
        return (names, mbids_opt);
    }

    // Fallback to the deprecated parallel artistNames / artistMbIds arrays
    let names = play.artist_names.clone().unwrap_or_default();
    let mbids = play
        .artist_mb_ids
        .as_ref()
        .map(|ids| ids.iter().filter_map(|id| normalize_mbid(id)).collect::<Vec<_>>())
        .filter(|ids| !ids.is_empty());

    (names, mbids)
}

/// Decode one repo block into a scrobble if it's a play record from any play collection.
fn scrobble_from_block(did: &str, path: &str, block: &[u8]) -> Option<ScrobbleRecord> {
    play_collection_of(path)?;
    let play = match serde_ipld_dagcbor::from_slice::<PlayRecord>(block) {
        Ok(play) => play,
        Err(e) => {
            tracing::debug!("skipping undecodable play record {}: {}", path, e);
            return None;
        }
    };
    let (artists, artist_mb_ids) = extract_artists_from_play(&play);

    Some(ScrobbleRecord {
        uri: format!("at://{}/{}", did, path),
        cid: String::new(), // CID not available from this API
        track_name: play.track_name,
        artists,
        played_time: play.played_time,
        duration: play.duration,
        recording_mb_id: play.recording_mb_id.as_deref().and_then(normalize_mbid),
        track_mb_id: play.track_mb_id.as_deref().and_then(normalize_mbid),
        release_mb_id: play.release_mb_id.as_deref().and_then(normalize_mbid),
        release_name: play.release_name,
        artist_mb_ids,
    })
}

/// A repo can hold the same listen in both collections (copied across during the
/// lexicon migration). Drop a legacy-collection play when the current collection has
/// the same track at the same time, so it isn't counted twice. Plays within a single
/// collection are left alone.
fn dedupe_scrobbles(scrobbles: Vec<ScrobbleRecord>) -> Vec<ScrobbleRecord> {
    let collection = |s: &ScrobbleRecord| {
        play_collection_of(s.uri.splitn(4, '/').nth(3).unwrap_or_default())
    };
    let key = |s: &ScrobbleRecord| {
        s.played_time.as_deref().map(|played| {
            let played = chrono::DateTime::parse_from_rfc3339(played)
                .map(|t| t.timestamp().to_string())
                .unwrap_or_else(|_| played.to_string());
            (s.track_name.to_lowercase(), played)
        })
    };

    let current: HashSet<_> = scrobbles
        .iter()
        .filter(|s| collection(s) == Some(PLAY_COLLECTION))
        .filter_map(|s| key(s))
        .collect();
    if current.is_empty() {
        return scrobbles;
    }

    let before = scrobbles.len();
    let kept: Vec<_> = scrobbles
        .into_iter()
        .filter(|s| {
            collection(s) != Some(LEGACY_PLAY_COLLECTION)
                || key(s).is_none_or(|k| !current.contains(&k))
        })
        .collect();

    if kept.len() != before {
        tracing::info!(
            "dropped {} legacy plays already present in {}",
            before - kept.len(),
            PLAY_COLLECTION
        );
    }
    kept
}

/// Cached DID document to avoid duplicate requests
#[derive(Debug, Clone)]
pub struct DidDocument {
    pub pds: String,
    pub handle: Option<String>,
}

fn get_did_doc_url(did: &str) -> Result<String> {
    if did.starts_with("did:plc") {
        Ok(format!("https://plc.directory/{}", did))
    } else if did.starts_with("did:web") {
        let domain = did.trim_start_matches("did:web:");
        Ok(format!("https://{}/.well-known/did.json", domain))
    } else {
        anyhow::bail!("unsupported DID method");
    }
}

/// Resolve DID to get both PDS endpoint and handle
pub async fn resolve_did_document(did: &str) -> Result<DidDocument> {
    let plc_url = get_did_doc_url(did)?;
    tracing::info!("resolving DID document from {}", plc_url);
    let response = reqwest::get(&plc_url).await?;
    let doc: serde_json::Value = response.json().await?;

    let pds = doc
        .get("service")
        .and_then(|s| s.as_array())
        .and_then(|arr| {
            arr.iter().find(|s| {
                s.get("type")
                    .and_then(|t| t.as_str())
                    .map(|t| t == "AtprotoPersonalDataServer")
                    .unwrap_or(false)
            })
        })
        .and_then(|s| s.get("serviceEndpoint"))
        .and_then(|e| e.as_str())
        .ok_or_else(|| anyhow::anyhow!("no PDS found in DID document"))?
        .to_string();

    // Extract handle from alsoKnownAs (format: "at://handle")
    let handle = doc
        .get("alsoKnownAs")
        .and_then(|a| a.as_array())
        .and_then(|arr| arr.first())
        .and_then(|h| h.as_str())
        .and_then(|h| h.strip_prefix("at://"))
        .map(|h| h.to_string());

    Ok(DidDocument { pds, handle })
}

/// Resolve DID to find the user's PDS endpoint
async fn resolve_pds(did: &str) -> Result<String> {
    let doc = resolve_did_document(did).await?;
    Ok(doc.pds)
}

/// Resolve DID to get the user's handle
pub async fn resolve_handle(did: &str) -> Result<Option<String>> {
    let doc = resolve_did_document(did).await?;
    Ok(doc.handle)
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
                for (path, block_data) in chunk {
                    if let Some(scrobble) = scrobble_from_block(did, &path, &block_data) {
                        scrobbles.push(scrobble);
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
                for (path, block_data) in chunk {
                    if let Some(scrobble) = scrobble_from_block(did, &path, &block_data) {
                        scrobbles.push(scrobble);
                    }
                }
            }

            // Clean up temporary directory
            if let Err(e) = std::fs::remove_dir_all(&temp_dir) {
                tracing::warn!("failed to clean up temp dir: {}", e);
            }
        }
    }

    let scrobbles = dedupe_scrobbles(scrobbles);
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

#[cfg(test)]
mod tests {
    use super::*;

    fn cbor(value: serde_json::Value) -> Vec<u8> {
        serde_ipld_dagcbor::to_vec(&value).unwrap()
    }

    #[test]
    fn decodes_plays_from_both_collections() {
        let new = cbor(serde_json::json!({
            "$type": "fm.teal.feed.play",
            "trackName": "Angel Music",
            "artists": [{ "artistName": "Ninajirachi", "artistMbId": "mbid:aaaa" }],
            "releaseMbId": "mbid:bbbb",
            "playedTime": "2026-11-26T00:10:15Z",
            "musicServiceUri": "https://music.apple.com",
            "duration": 201
        }));
        let old = cbor(serde_json::json!({
            "$type": "fm.teal.alpha.feed.play",
            "trackName": "Old Song",
            "artistNames": ["Someone"],
            "artistMbIds": ["cccc"],
            "playedTime": "2025-03-01T12:00:00Z"
        }));

        let a = scrobble_from_block("did:x", "fm.teal.feed.play/3abc", &new).unwrap();
        assert_eq!(a.artists, vec!["Ninajirachi"]);
        assert_eq!(a.artist_mb_ids, Some(vec!["aaaa".to_string()]));
        assert_eq!(a.release_mb_id.as_deref(), Some("bbbb"));
        assert_eq!(a.duration, Some(201));

        let b = scrobble_from_block("did:x", "fm.teal.alpha.feed.play/3def", &old).unwrap();
        assert_eq!(b.artists, vec!["Someone"]);
        assert_eq!(b.artist_mb_ids, Some(vec!["cccc".to_string()]));

        assert!(scrobble_from_block("did:x", "app.bsky.feed.post/3x", &new).is_none());
        assert!(scrobble_from_block("did:x", "fm.teal.feed.playlist/3x", &new).is_none());
    }

    #[test]
    fn dedupes_migrated_plays_preferring_new_collection() {
        let mk = |path: &str, time: &str| ScrobbleRecord {
            uri: format!("at://did:x/{}", path),
            cid: String::new(),
            track_name: "Song".into(),
            artists: vec!["A".into()],
            played_time: Some(time.into()),
            duration: None,
            recording_mb_id: None,
            track_mb_id: None,
            release_mb_id: None,
            release_name: None,
            artist_mb_ids: None,
        };
        let out = dedupe_scrobbles(vec![
            mk("fm.teal.alpha.feed.play/1", "2026-01-01T00:00:00.000Z"),
            mk("fm.teal.feed.play/1", "2026-01-01T00:00:00Z"),
            mk("fm.teal.alpha.feed.play/2", "2026-01-02T00:00:00Z"),
            // a double-scrobble inside one collection is not ours to drop
            mk("fm.teal.feed.play/3", "2026-01-03T00:00:00Z"),
            mk("fm.teal.feed.play/4", "2026-01-03T00:00:00Z"),
        ]);
        assert_eq!(out.len(), 4);
        assert!(out.iter().any(|s| s.uri.ends_with("fm.teal.feed.play/1")));
        assert!(!out.iter().any(|s| s.uri.ends_with("fm.teal.alpha.feed.play/1")));
    }
}
