mod import_scrobbles;

use anyhow::Result;
use sqlx::postgres::PgPool;
use teal_wrapped_api::db;

#[tokio::main]
async fn main() -> Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter("inspect=debug,teal_wrapped_api=debug")
        .init();

    let args: Vec<String> = std::env::args().collect();

    if args.len() < 2 {
        print_usage();
        return Ok(());
    }

    let pool = db::init_db().await?;

    match args[1].as_str() {
        "stats" => {
            show_stats(&pool).await?;
        }
        "user" => {
            if args.len() < 3 {
                println!("usage: inspect user <did> [year]");
                return Ok(());
            }
            let did = &args[2];
            let year = args.get(3).and_then(|s| s.parse().ok()).unwrap_or(2025);
            show_user_stats(&pool, did, year).await?;
        }
        "buddies" => {
            if args.len() < 3 {
                println!("usage: inspect buddies <did> [year]");
                return Ok(());
            }
            let did = &args[2];
            let year = args.get(3).and_then(|s| s.parse().ok()).unwrap_or(2025);
            show_buddies(&pool, did, year).await?;
        }
        "list" => {
            list_users(&pool).await?;
        }
        "refresh" => {
            println!("refreshing materialized views...");
            db::refresh_user_stats(&pool).await?;
            println!("refresh complete!");
        }
        _ => {
            print_usage();
        }
    }

    Ok(())
}

fn print_usage() {
    println!("teal-wrapped database inspector");
    println!();
    println!("usage:");
    println!("  inspect stats                  - show global database stats");
    println!("  inspect list                   - list all users");
    println!("  inspect user <did> [year]      - show user's listening stats");
    println!("  inspect buddies <did> [year]   - show user's music buddies");
    println!("  inspect refresh                - refresh materialized views");
}

async fn show_stats(pool: &PgPool) -> Result<()> {
    let total_users: i64 = sqlx::query_scalar("SELECT COUNT(DISTINCT user_did) FROM user_plays")
        .fetch_one(pool)
        .await?;

    let total_plays: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM user_plays")
        .fetch_one(pool)
        .await?;

    let total_cached: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM wrapped_cache")
        .fetch_one(pool)
        .await?;

    println!("global stats:");
    println!("  total users: {}", total_users);
    println!("  total plays: {}", total_plays);
    println!("  cached wrapped: {}", total_cached);

    Ok(())
}

async fn list_users(pool: &PgPool) -> Result<()> {
    let users: Vec<(String, i64)> = sqlx::query_as(
        "SELECT user_did, COUNT(*) as plays FROM user_plays GROUP BY user_did ORDER BY plays DESC",
    )
    .fetch_all(pool)
    .await?;

    println!("users in database:");
    for (did, plays) in users {
        println!("  {} - {} plays", did, plays);
    }

    Ok(())
}

async fn show_user_stats(pool: &PgPool, user_did: &str, year: u32) -> Result<()> {
    let play_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM user_plays WHERE user_did = $1 AND EXTRACT(YEAR FROM played_at) = $2",
    )
    .bind(user_did)
    .bind(year as i32)
    .fetch_one(pool)
    .await?;

    if play_count == 0 {
        println!("no plays found for {} in {}", user_did, year);
        return Ok(());
    }

    let unique_tracks: i64 = sqlx::query_scalar(
        "SELECT COUNT(DISTINCT COALESCE(recording_mb_id, track_name)) FROM user_plays WHERE user_did = $1 AND EXTRACT(YEAR FROM played_at) = $2"
    )
    .bind(user_did)
    .bind(year as i32)
    .fetch_one(pool)
    .await?;

    let with_mbid: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM user_plays WHERE user_did = $1 AND EXTRACT(YEAR FROM played_at) = $2 AND recording_mb_id IS NOT NULL"
    )
    .bind(user_did)
    .bind(year as i32)
    .fetch_one(pool)
    .await?;

    println!("user stats for {} ({}):", user_did, year);
    println!("  total plays: {}", play_count);
    println!("  unique tracks: {}", unique_tracks);
    println!(
        "  with recording mbid: {} ({}%)",
        with_mbid,
        (with_mbid * 100) / play_count
    );

    // Show top 5 tracks
    let top_tracks: Vec<(String, Option<String>, i64)> = sqlx::query_as(
        r#"
        SELECT track_name, recording_mb_id, COUNT(*) as plays
        FROM user_plays
        WHERE user_did = $1 AND EXTRACT(YEAR FROM played_at) = $2
        GROUP BY track_name, recording_mb_id
        ORDER BY plays DESC
        LIMIT 5
        "#,
    )
    .bind(user_did)
    .bind(year as i32)
    .fetch_all(pool)
    .await?;

    println!("\ntop 5 tracks:");
    for (track, mbid, plays) in top_tracks {
        if let Some(mbid) = mbid {
            println!("  {} - {} plays (mbid: {})", track, plays, mbid);
        } else {
            println!("  {} - {} plays", track, plays);
        }
    }

    // Show top 5 artists
    let top_artists: Vec<(String, i64)> = sqlx::query_as(
        r#"
        SELECT artist->>'artistName' as artist_name, COUNT(*) as plays
        FROM user_plays, jsonb_array_elements(artists) as artist
        WHERE user_did = $1 AND EXTRACT(YEAR FROM played_at) = $2
        GROUP BY artist_name
        ORDER BY plays DESC
        LIMIT 5
        "#,
    )
    .bind(user_did)
    .bind(year as i32)
    .fetch_all(pool)
    .await?;

    println!("\ntop 5 artists:");
    for (artist, plays) in top_artists {
        println!("  {} - {} plays", artist, plays);
    }

    // Show top 5 albums
    let top_albums: Vec<(String, i64)> = sqlx::query_as(
        r#"
        SELECT release_name, COUNT(*) as plays
        FROM user_plays
        WHERE user_did = $1 AND EXTRACT(YEAR FROM played_at) = $2 AND release_name IS NOT NULL
        GROUP BY release_name
        ORDER BY plays DESC
        LIMIT 5
        "#,
    )
    .bind(user_did)
    .bind(year as i32)
    .fetch_all(pool)
    .await?;

    if !top_albums.is_empty() {
        println!("\ntop 5 albums:");
        for (album, plays) in top_albums {
            println!("  {} - {} plays", album, plays);
        }
    }

    Ok(())
}

async fn show_buddies(pool: &PgPool, user_did: &str, year: u32) -> Result<()> {
    println!("finding music buddies for {} ({})...\n", user_did, year);

    let buddies = db::find_similar_users(pool, user_did, year, 10).await?;

    if buddies.is_empty() {
        println!("no music buddies found!");
        println!("(this user might be the only one in the database)");
        return Ok(());
    }

    println!("found {} potential music buddies:\n", buddies.len());

    for (i, buddy) in buddies.iter().enumerate() {
        println!("{}. {}", i + 1, buddy.did);
        println!("   similarity: {:.2}", buddy.similarity_score);
        println!("   shared artists: {}", buddy.shared_artists.join(", "));

        // Get buddy's play count
        let buddy_plays: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM user_plays WHERE user_did = $1 AND EXTRACT(YEAR FROM played_at) = $2")
                .bind(&buddy.did)
                .bind(year as i32)
                .fetch_one(pool)
                .await?;

        println!("   buddy's total plays: {}", buddy_plays);
        println!();
    }

    Ok(())
}
