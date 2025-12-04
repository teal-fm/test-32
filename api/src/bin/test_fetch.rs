use teal_wrapped_api::atproto;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter("test_fetch=debug,teal_wrapped_api=debug")
        .init();

    // Test with a DID - replace with a real one that has play records
    let did = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "did:plc:k644h4rq5bjfzcetgsa6tuby".to_string());

    println!("fetching scrobbles for: {}", did);

    let scrobbles = atproto::fetch_scrobbles(&did, 2025).await?;

    println!("found {} scrobbles", scrobbles.len());

    if !scrobbles.is_empty() {
        println!("\nfirst 5 records:");
        for record in scrobbles.iter().take(5) {
            println!("  {} by {}", record.track_name, record.artists.join(", "));
            if let Some(played_time) = &record.played_time {
                println!("    played at: {}", played_time);
            }
            if let Some(recording_mb_id) = &record.recording_mb_id {
                println!("    recording mbid: {}", recording_mb_id);
            }
            if let Some(release_name) = &record.release_name {
                println!("    release: {}", release_name);
            }
            if let Some(artist_mb_ids) = &record.artist_mb_ids {
                if !artist_mb_ids.is_empty() {
                    println!("    artist mbids: {}", artist_mb_ids.join(", "));
                }
            }
        }
    }

    Ok(())
}
