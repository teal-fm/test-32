// Dev-only fixture: open /wrapped/demo.teal.fm while running `pnpm dev`.
// Synthetic numbers for checking layouts against a full year of data; never shipped.
import type { WrappedData } from "./data";

function rand(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

export function demoWrapped(): WrappedData {
  const r = rand(42);
  const activity: WrappedData["activity_graph"] = [];
  for (let d = new Date("2026-01-01"); d <= new Date("2026-11-25"); d.setDate(d.getDate() + 1)) {
    if (r() < 0.12) continue;
    const plays = Math.round(r() * r() * 90) + 1;
    activity.push({ date: d.toISOString().slice(0, 10), plays, minutes: plays * 3.5 });
  }
  const total_plays = activity.reduce((a, x) => a + x.plays, 0);

  const artist = (name: string, plays: number, image: string | null, track: string, tp: number) => ({
    name,
    plays,
    minutes: plays * 3.4,
    image_url: image,
    top_track: track,
    top_track_plays: tp,
    top_track_duration_ms: 204000,
  });

  return {
    year: 2026,
    total_minutes: total_plays * 3.45,
    total_plays,
    top_artists: [
      artist("RAYE", 612, "/images/8be564c3-dfba-440b-af8c-4ffbceeef45e.jpg", "Escapism.", 88),
      artist("BLACKPINK", 401, "/images/48646387-1664-4c9a-9139-9bfd091b823c.jpg", "Forever Young", 51),
      artist("TWICE", 377, "/images/8da127cc-c432-418f-b356-ef36210d82ac.jpg", "Alcohol-Free", 40),
      artist("NewJeans", 260, null, "Cookie", 33),
      artist("BABYMONSTER", 231, "/images/5829cd4f-e693-4b03-abe5-1226243c23d6.jpg", "BILLIONAIRE", 29),
      artist("JEON SOMI", 190, "/images/8d4e6a86-fa1c-4a1b-b8c4-3b58a46dde9f.jpg", "Anymore", 22),
      artist("Red Velvet", 150, null, "Red Flavor", 20),
      artist("IVE", 120, "/images/b2f2216a-d7a9-4ce0-8b8f-f494d9a8c196.jpg", "Baddie", 18),
      artist("Taylor Swift", 98, "/images/20244d07-534f-4eff-b4d4-930878889970.jpg", "Fortnight", 12),
      artist("Lady Gaga", 77, "/images/650e7db6-b795-4eb5-a702-5ea2fc46c848.jpg", "Abracadabra", 9),
    ],
    top_tracks: [
      { title: "Kagakushu", artist: "Ado", plays: 141, release_name: "Kyougen", release_mb_id: "mbid:3106ffb9-4872-40ba-acde-2a07f41d7403" },
      { title: "Escapism.", artist: "RAYE", plays: 88, release_name: "My 21st Century Blues" },
      { title: "Elevate", artist: "Kelli-Leigh", plays: 72, release_mb_id: "4de96860-5045-4d5c-964a-3996e285208c", release_name: "Elevate" },
      { title: "Hypnotic", artist: "Jazzy", plays: 64, release_mb_id: "c6672132-cc8d-43f6-aeb3-6fbcfd014329", release_name: "Hypnotic" },
      { title: "Forever Young", artist: "BLACKPINK", plays: 51, release_name: "SQUARE UP" },
      { title: "The Burning of a Salem Witch", artist: "THØRNS", plays: 47 },
      { title: "Alcohol-Free", artist: "TWICE", plays: 40, release_name: "Taste of Love" },
      { title: "Cookie", artist: "NewJeans", plays: 33, release_name: "New Jeans" },
      { title: "BILLIONAIRE", artist: "BABYMONSTER", plays: 29 },
      { title: "Hold On (feat. EVIE)", artist: "Gil Glaze", plays: 26 },
    ],
    new_artists_count: 418,
    activity_graph: activity,
    hourly_distribution: [30, 18, 9, 4, 2, 1, 1, 3, 9, 22, 31, 40, 52, 48, 46, 50, 61, 74, 90, 101, 112, 98, 72, 51],
    weekday_avg_minutes: 142,
    weekend_avg_minutes: 196,
    longest_streak: 47,
    days_active: activity.length,
    avg_track_length_ms: 207560,
    listening_diversity: 0.42,
    top_hour: 20,
    longest_session_minutes: 312,
    similar_users: [
      { did: "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa", handle: "listener.example.com", similarity_score: 0.82, shared_artists: ["RAYE", "TWICE", "IVE", "NewJeans", "Red Velvet", "BLACKPINK"], shared_artist_count: 14 },
      { did: "did:plc:bbbbbbbbbbbbbbbbbbbbbbbb", handle: "another-very-long-handle.bsky.social", similarity_score: 0.6, shared_artists: ["BLACKPINK", "BABYMONSTER"], shared_artist_count: 6 },
      { did: "did:plc:cccccccccccccccccccccccc", similarity_score: 0.4, shared_artists: ["Taylor Swift"], shared_artist_count: 2 },
    ],
  };
}
