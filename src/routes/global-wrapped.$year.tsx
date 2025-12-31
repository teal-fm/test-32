import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";

interface GlobalWrappedData {
  year: number;
  verified_minutes: number;
  total_users: number;
  unique_artists: number;
  unique_tracks: number;
  top_users: Array<{ did: string; plays: number; minutes: number }>;
  top_artists: Array<{
    name: string;
    plays: number;
    minutes: number;
    mb_id?: string;
  }>;
  top_tracks: Array<{
    title: string;
    artist: string;
    plays: number;
  }>;
  distribution: {
    minutes_percentiles: Array<[number, number]>;
    plays_percentiles: Array<[number, number]>;
    artists_percentiles: Array<[number, number]>;
    tracks_percentiles: Array<[number, number]>;
  };
}

export const Route = createFileRoute("/global-wrapped/$year")({
  component: GlobalWrapped,
  head: () => ({
    meta: [
      {
        name: "description",
        content: "Global music statistics for a year on teal.fm.",
      },
      {
        title: "teal.fm's Global Year in Music",
      },
    ],
  }),
});

function GlobalWrapped() {
  const params = Route.useParams();
  const year = params.year as string;
  const [data, setData] = useState<GlobalWrappedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL || "http://localhost:3001"}/api/global-wrapped/${year}`,
        );

        if (!response.ok) {
          throw new Error("Failed to fetch global wrapped data");
        }

        const jsonData = await response.json();
        setData(jsonData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [year]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-white/60">Loading...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-red-400">{error || "No data available"}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Animated gradient mesh background */}
      <div className="fixed inset-0">
        <div className="absolute inset-0 opacity-30">
          <div
            className="absolute top-[20%] left-[20%] w-[600px] h-[600px] rounded-full blur-[120px]"
            style={{
              background:
                "radial-gradient(circle, #00d9ff 0%, transparent 70%)",
            }}
          />
          <div
            className="absolute bottom-[20%] right-[20%] w-[500px] h-[500px] rounded-full blur-[120px]"
            style={{
              background:
                "radial-gradient(circle, #ff0099 0%, transparent 70%)",
            }}
          />
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 container mx-auto px-6 py-12">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <h1 className="text-6xl sm:text-8xl font-semibold text-white mb-4">
            global year in music
          </h1>
          <p className="text-xl text-white/60 font-light">{data.year}</p>
        </motion.div>

        {/* Key Stats */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12"
        >
          {[
            {
              label: "Total Users",
              value: data.total_users.toLocaleString(),
            },
            {
              label: "Verified Minutes",
              value: `${(data.verified_minutes / 60).toFixed(0)} hrs`,
            },
            {
              label: "Unique Artists",
              value: data.unique_artists.toLocaleString(),
            },
            {
              label: "Unique Tracks",
              value: data.unique_tracks.toLocaleString(),
            },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 + i * 0.1 }}
              className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10"
            >
              <p className="text-white/60 text-sm mb-2">{stat.label}</p>
              <p className="text-3xl sm:text-4xl font-semibold text-white">
                {stat.value}
              </p>
            </motion.div>
          ))}
        </motion.div>

        {/* Top Artists */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mb-12"
        >
          <h2 className="text-2xl font-semibold text-white mb-6">Top Artists</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.top_artists.map((artist, i) => (
              <motion.div
                key={artist.name}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.5 + i * 0.05 }}
                className="bg-white/5 backdrop-blur-xl rounded-xl p-4 border border-white/10 flex items-center gap-4"
              >
                <span className="text-2xl font-bold text-white/40">
                  #{i + 1}
                </span>
                <div className="flex-1">
                  <p className="text-white font-medium">{artist.name}</p>
                  <p className="text-white/60 text-sm">
                    {artist.plays} plays · {(artist.minutes / 60).toFixed(1)} hrs
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Top Tracks */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mb-12"
        >
          <h2 className="text-2xl font-semibold text-white mb-6">Top Tracks</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.top_tracks.map((track, i) => (
              <motion.div
                key={`${track.title}-${track.artist}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.6 + i * 0.05 }}
                className="bg-white/5 backdrop-blur-xl rounded-xl p-4 border border-white/10 flex items-center gap-4"
              >
                <span className="text-2xl font-bold text-white/40">
                  #{i + 1}
                </span>
                <div className="flex-1">
                  <p className="text-white font-medium">{track.title}</p>
                  <p className="text-white/60 text-sm">
                    {track.artist} · {track.plays} plays
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Distribution Charts */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.7 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-6"
        >
          {[
            {
              title: "Minutes Listened",
              data: data.distribution.minutes_percentiles,
              color: "#00d9ff",
              formatter: (v: number) => `${(v / 60).toFixed(1)} hrs`,
            },
            {
              title: "Plays",
              data: data.distribution.plays_percentiles,
              color: "#ff0099",
              formatter: (v: number) => v.toLocaleString(),
            },
            {
              title: "Unique Artists",
              data: data.distribution.artists_percentiles,
              color: "#00ffaa",
              formatter: (v: number) => v.toLocaleString(),
            },
            {
              title: "Unique Tracks",
              data: data.distribution.tracks_percentiles,
              color: "#ffcc00",
              formatter: (v: number) => v.toLocaleString(),
            },
          ].map((chart, i) => (
            <motion.div
              key={chart.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.8 + i * 0.1 }}
              className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10"
            >
              <h3 className="text-lg font-semibold text-white mb-4">
                {chart.title}
              </h3>
              <div className="relative h-48">
                {/* Simple bar chart */}
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-1">
                  {chart.data.map(([percent, value], j) => (
                    <motion.div
                      key={percent}
                      initial={{ height: 0 }}
                      animate={{
                        height: `${
                          value === 0
                            ? "2px"
                            : `${((value / Math.max(...chart.data.map(([, v]) => v))) * 100).toFixed(1)}%`
                        }`,
                      }}
                      transition={{ duration: 0.5, delay: 0.9 + i * 0.1 + j * 0.02 }}
                      className="flex-1 rounded-t transition-all"
                      style={{
                        background: chart.color,
                        minHeight: "2px",
                      }}
                      title={`P${percent}: ${chart.formatter(value)}`}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
