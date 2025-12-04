use crate::atproto::ScrobbleRecord;
use chrono::{Datelike, NaiveDate, Weekday};
use std::collections::HashMap;

/// Calculate all wrapped statistics from scrobble records
pub fn calculate_wrapped_stats(scrobbles: Vec<ScrobbleRecord>, year: u32) -> WrappedStats {
    let mut artist_plays: HashMap<String, u32> = HashMap::new();
    let mut artist_seconds: HashMap<String, i64> = HashMap::new();
    let mut artist_mb_ids: HashMap<String, Option<String>> = HashMap::new();
    let mut track_plays: HashMap<(String, String), u32> = HashMap::new();
    let mut track_metadata: HashMap<(String, String), TrackMetadata> = HashMap::new();
    let mut daily_plays: HashMap<NaiveDate, u32> = HashMap::new();
    let mut new_artists: HashMap<String, NaiveDate> = HashMap::new();
    let mut total_seconds = 0i64;

    for scrobble in &scrobbles {
        let track_name = &scrobble.track_name;

        // Get duration for this scrobble
        let duration = scrobble.duration.unwrap_or(210); // Fallback to 3.5 minutes
        total_seconds += duration;

        // Count artist plays (use first artist if available)
        if let Some(artist_name) = scrobble.artists.first() {
            *artist_plays.entry(artist_name.clone()).or_insert(0) += 1;
            *artist_seconds.entry(artist_name.clone()).or_insert(0) += duration;

            // Track artist MBID (prefer first non-None value)
            artist_mb_ids.entry(artist_name.clone()).or_insert_with(|| {
                scrobble
                    .artist_mb_ids
                    .as_ref()
                    .and_then(|ids| ids.first())
                    .cloned()
            });

            // Count track plays
            let track_key = (track_name.clone(), artist_name.clone());
            *track_plays.entry(track_key.clone()).or_insert(0) += 1;

            // Track metadata (prefer first non-None values)
            track_metadata
                .entry(track_key)
                .or_insert_with(|| TrackMetadata {
                    recording_mb_id: scrobble.recording_mb_id.clone(),
                    release_name: scrobble.release_name.clone(),
                    release_mb_id: scrobble.release_mb_id.clone(),
                });
        }

        // Track daily activity
        if let Some(played_at) = &scrobble.played_time {
            if let Ok(date) = chrono::DateTime::parse_from_rfc3339(played_at) {
                let naive_date = date.naive_local().date();
                *daily_plays.entry(naive_date).or_insert(0) += 1;

                // Track new artist discoveries
                if let Some(artist_name) = scrobble.artists.first() {
                    new_artists.entry(artist_name.clone()).or_insert(naive_date);
                }
            }
        }
    }

    // Calculate top artists with MBIDs and hours
    let mut top_artists: Vec<(String, u32, f64, Option<String>)> = artist_plays
        .into_iter()
        .map(|(name, plays)| {
            let mb_id = artist_mb_ids.get(&name).and_then(|opt| opt.clone());
            let seconds = artist_seconds.get(&name).copied().unwrap_or(0);
            let hours = seconds as f64 / 3600.0;
            (name, plays, hours, mb_id)
        })
        .collect();
    top_artists.sort_by(|a, b| b.1.cmp(&a.1));

    // Calculate top tracks with metadata
    let mut top_tracks: Vec<((String, String), u32, TrackMetadata)> = track_plays
        .into_iter()
        .map(|(key, plays)| {
            let metadata = track_metadata.get(&key).cloned().unwrap_or_default();
            (key, plays, metadata)
        })
        .collect();
    top_tracks.sort_by(|a, b| b.1.cmp(&a.1));

    // Calculate weekday vs weekend averages
    let mut weekday_plays = 0;
    let mut weekend_plays = 0;
    let mut weekday_count = 0;
    let mut weekend_count = 0;

    for (date, plays) in &daily_plays {
        if date.weekday() == Weekday::Sat || date.weekday() == Weekday::Sun {
            weekend_plays += plays;
            weekend_count += 1;
        } else {
            weekday_plays += plays;
            weekday_count += 1;
        }
    }

    // Calculate longest streak
    let longest_streak = calculate_longest_streak(&daily_plays, year);

    // Calculate hours from actual duration
    let total_hours = total_seconds as f64 / 3600.0;

    // For weekday/weekend averages, we need to track time per day, not just play counts
    // For now, estimate based on average track duration
    let avg_duration = if !scrobbles.is_empty() {
        total_seconds as f64 / scrobbles.len() as f64
    } else {
        210.0 // 3.5 minutes
    };

    let weekday_avg_hours = if weekday_count > 0 {
        (weekday_plays as f64 * avg_duration) / 3600.0 / weekday_count as f64
    } else {
        0.0
    };
    let weekend_avg_hours = if weekend_count > 0 {
        (weekend_plays as f64 * avg_duration) / 3600.0 / weekend_count as f64
    } else {
        0.0
    };

    let days_active = daily_plays.len() as u32;

    WrappedStats {
        total_hours,
        top_artists: top_artists.into_iter().take(10).collect(),
        top_tracks: top_tracks.into_iter().take(10).collect(),
        new_artists_count: new_artists.len() as u32,
        daily_plays,
        weekday_avg_hours,
        weekend_avg_hours,
        longest_streak,
        days_active,
    }
}

fn calculate_longest_streak(daily_plays: &HashMap<NaiveDate, u32>, _year: u32) -> u32 {
    let mut dates: Vec<NaiveDate> = daily_plays.keys().copied().collect();
    dates.sort();

    let mut longest = 0;
    let mut current = 0;

    for i in 0..dates.len() {
        if i == 0 {
            current = 1;
        } else {
            let diff = dates[i].signed_duration_since(dates[i - 1]).num_days();
            if diff == 1 {
                current += 1;
            } else {
                longest = longest.max(current);
                current = 1;
            }
        }
    }

    longest.max(current)
}

#[derive(Debug, Clone, Default)]
pub struct TrackMetadata {
    pub recording_mb_id: Option<String>,
    pub release_name: Option<String>,
    pub release_mb_id: Option<String>,
}

#[derive(Debug)]
pub struct WrappedStats {
    pub total_hours: f64,
    pub top_artists: Vec<(String, u32, f64, Option<String>)>,
    pub top_tracks: Vec<((String, String), u32, TrackMetadata)>,
    pub new_artists_count: u32,
    pub daily_plays: HashMap<NaiveDate, u32>,
    pub weekday_avg_hours: f64,
    pub weekend_avg_hours: f64,
    pub longest_streak: u32,
    pub days_active: u32,
}
