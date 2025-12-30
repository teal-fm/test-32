use anyhow::{Context, Result};
use chrono::Datelike;
use clap::{Parser, Subcommand};
use futures::stream::{self, StreamExt};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use teal_wrapped_api::{
    atproto, db, global_stats, wrapped, DayActivity, TopArtist, TopTrack, WrappedData,
};

#[derive(Parser)]
#[command(name = "yircli")]
#[command(about = "teal wrapped CLI tool", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Import scrobbles from AT Protocol
    Import {
        /// User DID to import, or all for all users
        #[arg(value_name = "DID")]
        did: String,

        /// Optional year to filter imports
        #[arg(short, long)]
        year: Option<u32>,

        /// Number of concurrent imports
        #[arg(short, long, default_value_t = 20)]
        parallelism: usize,
    },

    /// Calculate statistics
    Calculate {
        #[command(subcommand)]
        stats_type: StatsType,
    },

    /// Manage materialized view refresh retry queue
    RetryQueue {
        #[command(subcommand)]
        action: RetryQueueAction,
    },

    /// Backfill missing musicbrainz IDs from existing records
    BackfillMbIds,
}

#[derive(Subcommand)]
enum RetryQueueAction {
    /// List all users in the retry queue
    List,

    /// Retry refreshing materialized views for queued users
    Process {
        /// Number of concurrent retries
        #[arg(short, long, default_value_t = 5)]
        parallelism: usize,
    },

    /// Clear the retry queue
    Clear,
}

#[derive(Subcommand)]
enum StatsType {
    /// Calculate wrapped stats for users
    Wrapped {
        /// User DID to calculate, or all for all users
        #[arg(value_name = "DID")]
        did: String,

        /// Year to calculate stats for
        #[arg(short, long, default_value_t = 2025)]
        year: u32,

        /// Number of concurrent calculations
        #[arg(short, long, default_value_t = 20)]
        parallelism: usize,

        /// Skip users with cached stats
        #[arg(long)]
        skip_cached: bool,
    },

    /// Calculate global platform statistics
    GlobalStats {
        /// Year to calculate stats for
        #[arg(default_value_t = 2025)]
        year: u32,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter("yircli=info,teal_wrapped_api=info")
        .init();

    let cli = Cli::parse();

    match cli.command {
        Commands::Import {
            did,
            year,
            parallelism,
        } => handle_import(&did, year, parallelism).await,
        Commands::Calculate { stats_type } => match stats_type {
            StatsType::Wrapped {
                did,
                year,
                parallelism,
                skip_cached,
            } => handle_calculate_wrapped(&did, year, parallelism, skip_cached).await,
            StatsType::GlobalStats { year } => handle_calculate_global_stats(year).await,
        },
        Commands::RetryQueue { action } => match action {
            RetryQueueAction::List => handle_retry_queue_list().await,
            RetryQueueAction::Process { parallelism } => {
                handle_retry_queue_process(parallelism).await
            }
            RetryQueueAction::Clear => handle_retry_queue_clear().await,
        },
        Commands::BackfillMbIds => handle_backfill_mbids().await,
    }
}

async fn handle_import(did: &str, year: Option<u32>, parallelism: usize) -> Result<()> {
    let db_pool = db::init_db()
        .await
        .context("Failed to initialize database")?;

    if did == "all" {
        tracing::info!("Fetching all DIDs from relay...");
        let dids = atproto::fetch_all_dids().await?;
        tracing::info!(
            "Found {} DIDs to process with parallelism {}",
            dids.len(),
            parallelism
        );

        let processed = Arc::new(AtomicUsize::new(0));
        let failed = Arc::new(AtomicUsize::new(0));
        let total = dids.len();

        stream::iter(dids.into_iter())
            .map(|did| {
                let db_pool = db_pool.clone();
                let processed = processed.clone();
                let failed = failed.clone();

                async move {
                    let result = import_user_scrobbles(&db_pool, &did, year).await;

                    let current = processed.fetch_add(1, Ordering::SeqCst) + 1;

                    match result {
                        Ok(count) => {
                            tracing::info!(
                                "[{}/{}] Successfully imported {} scrobbles for {}",
                                current,
                                total,
                                count,
                                did
                            );
                        }
                        Err(e) => {
                            failed.fetch_add(1, Ordering::SeqCst);
                            tracing::error!(
                                "[{}/{}] Failed to import scrobbles for {}: {}",
                                current,
                                total,
                                did,
                                e
                            );
                        }
                    }
                }
            })
            .buffer_unordered(parallelism)
            .collect::<Vec<_>>()
            .await;

        let processed_count = processed.load(Ordering::SeqCst);
        let failed_count = failed.load(Ordering::SeqCst);
        tracing::info!(
            "Bulk import complete. Processed: {}, Failed: {}, Success: {}",
            processed_count,
            failed_count,
            processed_count - failed_count
        );
    } else {
        match year {
            Some(y) => tracing::info!("Starting import for DID: {}, Year: {}", did, y),
            None => tracing::info!("Starting import for DID: {} (all years)", did),
        }

        let count = import_user_scrobbles(&db_pool, did, year).await?;

        match year {
            Some(y) => tracing::info!(
                "Successfully imported {} scrobbles for DID {} in year {}.",
                count,
                did,
                y
            ),
            None => tracing::info!(
                "Successfully imported {} scrobbles for DID {} (all years).",
                count,
                did
            ),
        }
    }

    Ok(())
}

async fn handle_calculate_wrapped(
    did: &str,
    year: u32,
    parallelism: usize,
    skip_cached: bool,
) -> Result<()> {
    let db_pool = db::init_db()
        .await
        .context("Failed to initialize database")?;

    if did == "all" {
        tracing::info!(
            "Calculating wrapped stats for year {} with parallelism {} (skip_cached: {})",
            year,
            parallelism,
            skip_cached
        );

        tracing::info!("Fetching all users with plays in {}...", year);
        let users: Vec<String> = sqlx::query_scalar(
            r#"
            SELECT DISTINCT user_did
            FROM user_plays
            WHERE EXTRACT(YEAR FROM played_at) = $1
            "#,
        )
        .bind(year as i32)
        .fetch_all(&db_pool)
        .await?;

        let users_to_process = if skip_cached {
            let mut filtered = Vec::new();
            for user in users {
                let cached = db::get_cached_wrapped(&db_pool, &user, year).await?;
                if cached.is_none() {
                    filtered.push(user);
                }
            }
            filtered
        } else {
            users
        };

        tracing::info!("Found {} users to process", users_to_process.len());

        let processed = Arc::new(AtomicUsize::new(0));
        let failed = Arc::new(AtomicUsize::new(0));
        let total = users_to_process.len();

        stream::iter(users_to_process.into_iter())
            .map(|user_did| {
                let db_pool = db_pool.clone();
                let processed = processed.clone();
                let failed = failed.clone();

                async move {
                    let result = calculate_and_cache_wrapped(&db_pool, &user_did, year).await;

                    let current = processed.fetch_add(1, Ordering::SeqCst) + 1;

                    match result {
                        Ok(()) => {
                            tracing::info!(
                                "[{}/{}] Cached wrapped stats for {}",
                                current,
                                total,
                                user_did
                            );
                        }
                        Err(e) => {
                            failed.fetch_add(1, Ordering::SeqCst);
                            tracing::error!(
                                "[{}/{}] Failed to calculate wrapped stats for {}: {}",
                                current,
                                total,
                                user_did,
                                e
                            );
                        }
                    }
                }
            })
            .buffer_unordered(parallelism)
            .collect::<Vec<_>>()
            .await;

        let processed_count = processed.load(Ordering::SeqCst);
        let failed_count = failed.load(Ordering::SeqCst);
        tracing::info!(
            "Calculation complete. Processed: {}, Failed: {}, Success: {}",
            processed_count,
            failed_count,
            processed_count - failed_count
        );
    } else {
        tracing::info!("Calculating wrapped stats for DID: {}, Year: {}", did, year);

        calculate_and_cache_wrapped(&db_pool, did, year).await?;

        tracing::info!(
            "Successfully calculated and cached wrapped stats for DID {} in year {}",
            did,
            year
        );
    }

    Ok(())
}

async fn handle_calculate_global_stats(year: u32) -> Result<()> {
    tracing::info!("Calculating global stats for year {}", year);

    let db_pool = db::init_db()
        .await
        .context("Failed to initialize database")?;

    tracing::info!("Calculating global statistics...");
    let stats = global_stats::calculate_global_stats(&db_pool, year)
        .await
        .context("Failed to calculate global stats")?;

    tracing::info!("Global stats calculated:");
    tracing::info!("  Total plays: {}", stats.total_plays);
    tracing::info!("  Total minutes: {:.0}", stats.total_minutes);
    tracing::info!("  Unique users: {}", stats.unique_users);
    tracing::info!("  Unique artists: {}", stats.unique_artists);
    tracing::info!("  Unique tracks: {}", stats.unique_tracks);

    tracing::info!("Caching global stats...");
    db::cache_global_stats(&db_pool, year, &stats)
        .await
        .context("Failed to cache global stats")?;

    tracing::info!("Global stats cached successfully for year {}", year);

    Ok(())
}

async fn import_user_scrobbles(
    db_pool: &sqlx::PgPool,
    did: &str,
    year: Option<u32>,
) -> Result<usize> {
    let scrobbles = atproto::fetch_scrobbles(did, 2024)
        .await
        .context("Failed to fetch scrobbles")?;

    if scrobbles.is_empty() {
        return Ok(0);
    }

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
        return Ok(0);
    }

    let count = filtered_scrobbles.len();

    db::store_user_plays(db_pool, did, &filtered_scrobbles)
        .await
        .context("Failed to store user plays in the database")?;

    Ok(count)
}

async fn handle_retry_queue_list() -> Result<()> {
    let db_pool = db::init_db()
        .await
        .context("Failed to initialize database")?;

    let queue = db::get_retry_queue(&db_pool)
        .await
        .context("Failed to fetch retry queue")?;

    if queue.is_empty() {
        tracing::info!("Retry queue is empty");
        return Ok(());
    }

    tracing::info!("Retry queue ({} users):", queue.len());
    for (did, retry_count, last_attempt) in queue {
        tracing::info!(
            "  {} - retries: {}, last attempt: {}",
            did,
            retry_count,
            last_attempt
        );
    }

    Ok(())
}

async fn handle_retry_queue_process(parallelism: usize) -> Result<()> {
    let db_pool = db::init_db()
        .await
        .context("Failed to initialize database")?;

    let queue = db::get_retry_queue(&db_pool)
        .await
        .context("Failed to fetch retry queue")?;

    if queue.is_empty() {
        tracing::info!("Retry queue is empty, nothing to process");
        return Ok(());
    }

    tracing::info!(
        "Processing {} users from retry queue with parallelism {}",
        queue.len(),
        parallelism
    );

    let processed = Arc::new(AtomicUsize::new(0));
    let failed = Arc::new(AtomicUsize::new(0));
    let total = queue.len();

    stream::iter(queue.into_iter())
        .map(|(did, _, _)| {
            let db_pool = db_pool.clone();
            let processed = processed.clone();
            let failed = failed.clone();

            async move {
                let current = processed.fetch_add(1, Ordering::SeqCst) + 1;

                match db::refresh_user_stats(&db_pool).await {
                    Ok(true) => {
                        tracing::info!(
                            "[{}/{}] Successfully refreshed views for {}",
                            current,
                            total,
                            did
                        );
                        if let Err(e) = db::remove_from_retry_queue(&db_pool, &did).await {
                            tracing::warn!("Failed to remove {} from retry queue: {}", did, e);
                        }
                    }
                    Ok(false) => {
                        failed.fetch_add(1, Ordering::SeqCst);
                        tracing::error!(
                            "[{}/{}] Refresh still failing for {} - keeping in queue",
                            current,
                            total,
                            did
                        );
                    }
                    Err(e) => {
                        failed.fetch_add(1, Ordering::SeqCst);
                        tracing::error!("[{}/{}] Error processing {}: {}", current, total, did, e);
                    }
                }
            }
        })
        .buffer_unordered(parallelism)
        .collect::<Vec<_>>()
        .await;

    let processed_count = processed.load(Ordering::SeqCst);
    let failed_count = failed.load(Ordering::SeqCst);
    tracing::info!(
        "Retry processing complete. Processed: {}, Failed: {}, Success: {}",
        processed_count,
        failed_count,
        processed_count - failed_count
    );

    Ok(())
}

async fn handle_retry_queue_clear() -> Result<()> {
    let db_pool = db::init_db()
        .await
        .context("Failed to initialize database")?;

    let queue_size = db::get_retry_queue(&db_pool).await?.len();

    sqlx::query("TRUNCATE TABLE refresh_retry_queue")
        .execute(&db_pool)
        .await
        .context("Failed to clear retry queue")?;

    tracing::info!("Cleared {} users from retry queue", queue_size);

    Ok(())
}

async fn handle_backfill_mbids() -> Result<()> {
    let db_pool = db::init_db()
        .await
        .context("Failed to initialize database")?;

    tracing::info!("Starting musicbrainz ID backfill...");

    // Count records missing artist mb_ids before backfill
    let missing_artist_count: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*)
        FROM user_plays
        WHERE EXISTS (
            SELECT 1
            FROM jsonb_array_elements(artists) elem
            WHERE elem->>'artistMbId' IS NULL
        )
        "#,
    )
    .fetch_one(&db_pool)
    .await?;

    tracing::info!(
        "Found {} records with missing artist mb_ids",
        missing_artist_count
    );

    // Backfill artist mb_ids
    tracing::info!("Backfilling artist mb_ids...");
    let artist_result = sqlx::query(
        r#"
        UPDATE user_plays up1
        SET artists = (
            SELECT jsonb_agg(
                CASE
                    WHEN elem->>'artistMbId' IS NULL THEN
                        elem || jsonb_build_object(
                            'artistMbId',
                            (
                                SELECT DISTINCT artist_elem->>'artistMbId'
                                FROM user_plays up2,
                                     jsonb_array_elements(up2.artists) artist_elem
                                WHERE LOWER(TRIM(artist_elem->>'artistName')) = LOWER(TRIM(elem->>'artistName'))
                                AND artist_elem->>'artistMbId' IS NOT NULL
                                LIMIT 1
                            )
                        )
                    ELSE elem
                END
            )
            FROM jsonb_array_elements(up1.artists) elem
        )
        WHERE EXISTS (
            SELECT 1
            FROM jsonb_array_elements(up1.artists) elem
            WHERE elem->>'artistMbId' IS NULL
        )
        "#,
    )
    .execute(&db_pool)
    .await?;

    tracing::info!(
        "Updated {} rows with artist mb_ids",
        artist_result.rows_affected()
    );

    // Count records missing recording mb_ids before backfill
    let missing_recording_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM user_plays WHERE recording_mb_id IS NULL")
            .fetch_one(&db_pool)
            .await?;

    tracing::info!(
        "Found {} records with missing recording mb_ids",
        missing_recording_count
    );

    // Backfill recording mb_ids
    tracing::info!("Backfilling recording mb_ids...");
    let recording_result = sqlx::query(
        r#"
        UPDATE user_plays up1
        SET recording_mb_id = (
            SELECT DISTINCT recording_mb_id
            FROM user_plays up2
            WHERE LOWER(TRIM(up2.track_name)) = LOWER(TRIM(up1.track_name))
            AND LOWER(TRIM((up2.artists->0)->>'artistName')) = LOWER(TRIM((up1.artists->0)->>'artistName'))
            AND up2.recording_mb_id IS NOT NULL
            LIMIT 1
        )
        WHERE recording_mb_id IS NULL
        "#,
    )
    .execute(&db_pool)
    .await?;

    tracing::info!(
        "Updated {} rows with recording mb_ids",
        recording_result.rows_affected()
    );

    // Count records missing release mb_ids before backfill
    let missing_release_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM user_plays WHERE release_mb_id IS NULL AND release_name IS NOT NULL",
    )
    .fetch_one(&db_pool)
    .await?;

    tracing::info!(
        "Found {} records with missing release mb_ids",
        missing_release_count
    );

    // Backfill release mb_ids
    tracing::info!("Backfilling release mb_ids...");
    let release_result = sqlx::query(
        r#"
        UPDATE user_plays up1
        SET release_mb_id = (
            SELECT DISTINCT release_mb_id
            FROM user_plays up2
            WHERE LOWER(TRIM(up2.release_name)) = LOWER(TRIM(up1.release_name))
            AND up2.release_mb_id IS NOT NULL
            LIMIT 1
        )
        WHERE release_mb_id IS NULL
        AND release_name IS NOT NULL
        "#,
    )
    .execute(&db_pool)
    .await?;

    tracing::info!(
        "Updated {} rows with release mb_ids",
        release_result.rows_affected()
    );

    // Show summary
    tracing::info!("Backfill summary:");
    tracing::info!(
        "  Artist mb_ids:    {} updated",
        artist_result.rows_affected()
    );
    tracing::info!(
        "  Recording mb_ids: {} updated",
        recording_result.rows_affected()
    );
    tracing::info!(
        "  Release mb_ids:   {} updated",
        release_result.rows_affected()
    );

    tracing::info!("Refreshing materialized views...");
    if db::refresh_user_stats(&db_pool).await? {
        tracing::info!("Materialized views refreshed successfully");
    } else {
        tracing::warn!("Materialized view refresh failed - check retry queue");
    }

    tracing::info!("Backfill complete!");

    Ok(())
}

async fn calculate_and_cache_wrapped(
    db_pool: &sqlx::PgPool,
    user_did: &str,
    year: u32,
) -> Result<()> {
    let stats = wrapped::calculate_wrapped_stats(db_pool, user_did, year)
        .await
        .context("Failed to calculate wrapped stats")?;

    let top_artists: Vec<TopArtist> = stats
        .top_artists
        .iter()
        .map(|(name, plays, minutes, mb_id)| {
            let (top_track, top_track_plays, top_track_duration_ms) = stats
                .top_track_per_artist
                .get(name)
                .map(|(track, plays, duration)| {
                    (Some(track.clone()), Some(*plays), Some(*duration))
                })
                .unwrap_or((None, None, None));

            TopArtist {
                name: name.clone(),
                plays: *plays,
                minutes: *minutes,
                mb_id: mb_id.clone(),
                image_url: None,
                top_track,
                top_track_plays,
                top_track_duration_ms,
            }
        })
        .collect();

    let top_tracks: Vec<TopTrack> = stats
        .top_tracks
        .iter()
        .map(|((track_name, artist_name), plays, metadata)| TopTrack {
            title: track_name.clone(),
            artist: artist_name.clone(),
            plays: *plays,
            recording_mb_id: metadata.recording_mb_id.clone(),
            release_name: metadata.release_name.clone(),
            release_mb_id: metadata.release_mb_id.clone(),
        })
        .collect();

    let activity_graph: Vec<DayActivity> = stats
        .daily_plays
        .iter()
        .map(|(date, plays)| {
            let minutes = *plays as f64 * (stats.avg_track_length_ms as f64 / (1000.0 * 60.0));
            DayActivity {
                date: date.format("%Y-%m-%d").to_string(),
                plays: *plays,
                minutes,
            }
        })
        .collect();

    let wrapped_data = WrappedData {
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
        avg_track_length_ms: stats.avg_track_length_ms,
        listening_diversity: stats.listening_diversity,
        hourly_distribution: stats.hourly_distribution,
        top_hour: stats.top_hour,
        longest_session_minutes: stats.longest_session_minutes,
        similar_users: None,
    };

    db::cache_wrapped(db_pool, user_did, year, &wrapped_data)
        .await
        .context("Failed to cache wrapped stats")?;

    Ok(())
}
