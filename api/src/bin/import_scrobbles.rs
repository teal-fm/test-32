use anyhow::{anyhow, Context};
use chrono::Datelike;
use futures::stream::{self, StreamExt};
use teal_wrapped_api::{atproto, db};

const DEFAULT_PARALLELISM: usize = 20;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    // Initialize tracing subscriber for logging
    tracing_subscriber::fmt()
        .with_env_filter("import_scrobbles=info,teal_wrapped_api=info")
        .init();

    // Parse command-line arguments
    let args: Vec<String> = std::env::args().collect();

    // Check if we should scrape all DIDs
    let scrape_all = args.get(1).map(|s| s.as_str()) == Some("--all");

    if !scrape_all && args.len() < 2 {
        eprintln!("Usage: {} <did> [year]", args[0]);
        eprintln!("       {} --all [year] [parallelism]", args[0]);
        eprintln!();
        eprintln!("Arguments:");
        eprintln!("  <did>         - User DID to import scrobbles for");
        eprintln!("  --all         - Import scrobbles for all DIDs from relay");
        eprintln!(
            "  [year]        - Optional year to import (if not specified, imports all scrobbles)"
        );
        eprintln!(
            "  [parallelism] - Number of concurrent imports when using --all (default: {})",
            DEFAULT_PARALLELISM
        );
        return Err(anyhow!("Missing required argument"));
    }

    // Initialize the database
    let db_pool = db::init_db()
        .await
        .context("Failed to initialize database")?;
    tracing::info!("Database connection established.");

    if scrape_all {
        let year: Option<u32> = if args.len() >= 3 {
            Some(
                args[2]
                    .parse()
                    .context("Failed to parse year. It must be a valid number.")?,
            )
        } else {
            None
        };

        let parallelism: usize = if args.len() >= 4 {
            args[3]
                .parse()
                .context("Failed to parse parallelism. It must be a valid number.")?
        } else {
            DEFAULT_PARALLELISM
        };

        tracing::info!("Fetching all DIDs from relay...");
        let dids = atproto::fetch_all_dids()
            .await
            .context("Failed to fetch DIDs from relay")?;

        tracing::info!(
            "Found {} DIDs. Starting import with parallelism {}{}",
            dids.len(),
            parallelism,
            match year {
                Some(y) => format!(" for year {}", y),
                None => " (all years)".to_string(),
            }
        );

        let db_pool = std::sync::Arc::new(db_pool);

        let results: Vec<_> = stream::iter(dids)
            .map(|did| {
                let db_pool = db_pool.clone();
                async move {
                    let result = import_did(&db_pool, &did, year).await;
                    (did, result)
                }
            })
            .buffer_unordered(parallelism)
            .collect()
            .await;

        let success_count = results.iter().filter(|(_, r)| r.is_ok()).count();
        let error_count = results.iter().filter(|(_, r)| r.is_err()).count();

        for (did, result) in results {
            if let Err(e) = result {
                tracing::error!("Import failed for {}: {}", did, e);
            }
        }

        tracing::info!(
            "Import complete. Success: {}, Errors: {}",
            success_count,
            error_count
        );
    } else {
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

        import_did(&db_pool, did, year).await?;
    }

    Ok(())
}

async fn import_did(db_pool: &sqlx::PgPool, did: &str, year: Option<u32>) -> anyhow::Result<()> {
    match year {
        Some(y) => tracing::info!("Starting import for DID: {}, Year: {}", did, y),
        None => tracing::info!("Starting import for DID: {} (all years)", did),
    }

    // Fetch scrobbles from atproto (using dummy year since it's ignored)
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
    db::store_user_plays(db_pool, did, &filtered_scrobbles)
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
