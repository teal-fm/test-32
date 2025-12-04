use anyhow::{anyhow, Context};
use chrono::Datelike;
use teal_wrapped_api::{atproto, db};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    // Initialize tracing subscriber for logging
    tracing_subscriber::fmt()
        .with_env_filter("import_scrobbles=info,teal_wrapped_api=info")
        .init();

    // Parse command-line arguments
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 2 {
        eprintln!("Usage: {} <did> [year]", args[0]);
        eprintln!("  <did>  - User DID to import scrobbles for");
        eprintln!("  [year] - Optional year to import (if not specified, imports all scrobbles)");
        return Err(anyhow!("Missing required argument: did"));
    }

    let did = &args[1];
    let year: Option<u32> = if args.len() >= 3 {
        Some(
            args[2]
                .parse()
                .context("Failed to parse year. It must be a valid number.")?,
        )
    } else {
        None
    };

    match year {
        Some(y) => tracing::info!("Starting import for DID: {}, Year: {}", did, y),
        None => tracing::info!("Starting import for DID: {} (all years)", did),
    }

    // Initialize the database
    let db_pool = db::init_db()
        .await
        .context("Failed to initialize database")?;
    tracing::info!("Database connection established.");

    // Fetch scrobbles from atproto (using dummy year since it's ignored)
    tracing::info!("Fetching scrobbles...");
    let scrobbles = atproto::fetch_scrobbles(did, 2024)
        .await
        .context("Failed to fetch scrobbles")?;

    if scrobbles.is_empty() {
        match year {
            Some(y) => tracing::warn!(
                "No scrobbles found for {} in {}. Nothing to import.",
                did,
                y
            ),
            None => tracing::warn!("No scrobbles found for {}. Nothing to import.", did),
        }
        return Ok(());
    }

    // Filter scrobbles by year if specified
    let filtered_scrobbles: Vec<_> = if let Some(target_year) = year {
        scrobbles
            .into_iter()
            .filter(|scrobble| {
                if let Some(played_time) = &scrobble.played_time {
                    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(played_time) {
                        return dt.year() as u32 == target_year;
                    }
                }
                false
            })
            .collect()
    } else {
        scrobbles
    };

    if filtered_scrobbles.is_empty() {
        match year {
            Some(y) => tracing::warn!(
                "No scrobbles found for {} in {} after filtering. Nothing to import.",
                did,
                y
            ),
            None => tracing::warn!("No valid scrobbles found for {}. Nothing to import.", did),
        }
        return Ok(());
    }

    tracing::info!(
        "Found {} scrobbles{}. Storing them in the database...",
        filtered_scrobbles.len(),
        match year {
            Some(y) => format!(" for year {}", y),
            None => " (all years)".to_string(),
        }
    );

    // Store the fetched scrobbles in the database
    db::store_user_plays(&db_pool, did, &filtered_scrobbles)
        .await
        .context("Failed to store user plays in the database")?;

    match year {
        Some(y) => tracing::info!(
            "Successfully imported {} scrobbles for DID {} in year {}.",
            filtered_scrobbles.len(),
            did,
            y
        ),
        None => tracing::info!(
            "Successfully imported {} scrobbles for DID {} (all years).",
            filtered_scrobbles.len(),
            did
        ),
    }

    Ok(())
}
