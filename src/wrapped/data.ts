import { useEffect, useState } from "react";

export const YEAR = 2026;
/** Set VITE_API_BASE (see .env.development) to point at a local API. */
export const API_BASE: string =
  import.meta.env.VITE_API_BASE || "https://yearinmusic-api.teal.fm";
export const SITE = "yearinmusic.teal.fm";

export interface TopArtist {
  name: string;
  plays: number;
  minutes: number;
  mb_id?: string;
  image_url?: string | null;
  top_track?: string;
  top_track_plays?: number;
  top_track_duration_ms?: number;
}

export interface TopTrack {
  title: string;
  artist: string;
  plays: number;
  recording_mb_id?: string;
  release_name?: string;
  release_mb_id?: string;
}

export interface Buddy {
  did: string;
  handle?: string;
  profile_picture?: string;
  similarity_score: number;
  shared_artists: string[];
  shared_artist_count: number;
}

export interface WrappedData {
  year: number;
  total_minutes: number;
  total_plays: number;
  top_artists: TopArtist[];
  top_tracks: TopTrack[];
  new_artists_count: number;
  activity_graph: Array<{ date: string; plays: number; minutes: number }>;
  hourly_distribution: number[]; // plays per UTC hour
  weekday_avg_minutes: number;
  weekend_avg_minutes: number;
  longest_streak: number;
  days_active: number;
  avg_track_length_ms: number;
  listening_diversity: number;
  top_hour: number;
  longest_session_minutes: number;
  similar_users?: Buddy[];
  profile_picture?: string;
}

export interface GlobalWrappedData {
  year: number;
  verified_minutes: number;
  total_users: number;
  unique_artists: number;
  unique_tracks: number;
  top_users: Array<{ did: string; plays: number; minutes: number }>;
  top_artists: TopArtist[];
  top_tracks: TopTrack[];
  distribution: {
    minutes_percentiles: Array<[number, number]>;
    plays_percentiles: Array<[number, number]>;
    artists_percentiles: Array<[number, number]>;
    tracks_percentiles: Array<[number, number]>;
  };
}

/** `fm.teal.feed.play` writes MusicBrainz IDs as `mbid:<uuid>`; URLs want the bare UUID. */
export function bareMbid(id?: string | null): string | undefined {
  if (!id || id === "undefined") return undefined;
  const bare = id.trim().replace(/^mbid:/, "");
  return bare || undefined;
}

export function artistImage(artist?: Pick<TopArtist, "image_url">) {
  if (!artist?.image_url) return undefined;
  return artist.image_url.startsWith("http")
    ? artist.image_url
    : API_BASE + artist.image_url;
}

type Load<T> =
  | { status: "loading" }
  | { status: "error"; message: string; notFound?: boolean }
  | { status: "ready"; data: T };

export function useWrapped(handle: string): Load<WrappedData> {
  const [state, setState] = useState<Load<WrappedData>>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    (async () => {
      try {
        if (import.meta.env.DEV && handle === "demo.teal.fm") {
          const { demoWrapped } = await import("./demo");
          if (!cancelled) setState({ status: "ready", data: demoWrapped() });
          return;
        }

        const doc = await fetch(
          `https://slingshot.microcosm.blue/xrpc/com.bad-example.identity.resolveMiniDoc?identifier=${encodeURIComponent(handle)}`,
        );
        if (!doc.ok) {
          throw Object.assign(new Error(`couldn't find @${handle}`), {
            notFound: true,
          });
        }
        const { did } = await doc.json();
        const res = await fetch(`${API_BASE}/api/wrapped/${YEAR}?did=${did}`);
        if (res.status === 404) {
          throw Object.assign(
            new Error(`no ${YEAR} plays found for @${handle} yet`),
            { notFound: true },
          );
        }
        if (!res.ok) throw new Error("the year-in-music server hiccuped");
        const data = (await res.json()) as WrappedData;
        if (!cancelled) setState({ status: "ready", data });
      } catch (err) {
        if (cancelled) return;
        const e = err as Error & { notFound?: boolean };
        setState({
          status: "error",
          message: e.message || "something went wrong",
          notFound: e.notFound,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [handle]);

  return state;
}

export function useGlobalWrapped(year: string): Load<GlobalWrappedData> {
  const [state, setState] = useState<Load<GlobalWrappedData>>({
    status: "loading",
  });
  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetch(`${API_BASE}/api/global-wrapped/${year}`)
      .then((r) => {
        if (!r.ok) throw new Error(`no global stats for ${year}`);
        return r.json();
      })
      .then((data) => !cancelled && setState({ status: "ready", data }))
      .catch(
        (e: Error) =>
          !cancelled && setState({ status: "error", message: e.message }),
      );
    return () => {
      cancelled = true;
    };
  }, [year]);
  return state;
}

/* ───────────────────────── derived stats ───────────────────────── */

export const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

export function hourLabel(h: number, long = false) {
  if (h === 0) return long ? "midnight" : "12a";
  if (h === 12) return long ? "noon" : "12p";
  return h < 12 ? `${h}${long ? "am" : "a"}` : `${h - 12}${long ? "pm" : "p"}`;
}

export type Persona = {
  name: string;
  blurb: string;
  night: boolean;
};

function persona(peak: number): Persona {
  if (peak >= 22 || peak < 5)
    return {
      name: "night owl",
      blurb: "your music came alive after dark.",
      night: true,
    };
  if (peak < 11)
    return {
      name: "early riser",
      blurb: "first coffee, first song. every day.",
      night: false,
    };
  if (peak < 17)
    return {
      name: "daydreamer",
      blurb: "you soundtracked the middle of the day.",
      night: false,
    };
  return {
    name: "sunset listener",
    blurb: "the day winds down, the volume goes up.",
    night: false,
  };
}

export function derive(d: WrappedData) {
  const offset = -new Date().getTimezoneOffset() / 60; // hours ahead of UTC
  const localHours = Array.from({ length: 24 }, (_, local) => {
    const utc = (((local - offset) % 24) + 24) % 24;
    return d.hourly_distribution[Math.round(utc) % 24] ?? 0;
  });
  const peakHour = localHours.indexOf(Math.max(...localHours));

  const months = Array(12).fill(0) as number[];
  for (const day of d.activity_graph) {
    const m = Number(day.date.slice(5, 7)) - 1;
    if (m >= 0 && m < 12) months[m] += day.plays;
  }
  const peakMonth = months.indexOf(Math.max(...months));

  const top3Minutes = d.top_artists
    .slice(0, 3)
    .reduce((a, x) => a + x.minutes, 0);
  const top3Share =
    d.total_minutes > 0
      ? Math.min(100, Math.round((top3Minutes / d.total_minutes) * 100))
      : 0;

  const hours = d.total_minutes / 60;
  const days = d.total_minutes / 60 / 24;

  const byDate = new Map(d.activity_graph.map((x) => [x.date, x.plays]));
  const maxDay = Math.max(1, ...d.activity_graph.map((x) => x.plays));

  return {
    localHours,
    peakHour,
    persona: persona(peakHour),
    months,
    peakMonth,
    top3Share,
    hours,
    days,
    byDate,
    maxDay,
  };
}

export type Derived = ReturnType<typeof derive>;

/** A fun yardstick for a pile of minutes. */
export function minutesYardstick(minutes: number) {
  const hours = minutes / 60;
  if (hours >= 28) {
    const n = Math.round(hours / 14);
    return `enough to fly new york → tokyo ${n.toLocaleString()} time${n === 1 ? "" : "s"}, headphones on the whole way.`;
  }
  if (minutes >= 240) {
    const n = Math.round(minutes / 120);
    return `that's ${n} feature-length films' worth of sound.`;
  }
  const n = Math.max(1, Math.round(minutes / 3.5));
  return `that's about ${n} songs back to back. a strong start.`;
}

export function fmtDuration(ms: number) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

export function buddyName(b: Buddy) {
  if (b.handle) return `@${b.handle}`;
  return b.did.length > 22 ? `${b.did.slice(0, 20)}…` : b.did;
}
