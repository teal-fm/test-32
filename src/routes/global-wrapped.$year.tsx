import { createFileRoute } from "@tanstack/react-router";
import {
  Metaballs,
  MeshGradient,
  SimplexNoise,
} from "@paper-design/shaders-react";
import { motion, useInView, useScroll, useTransform } from "framer-motion";
import { useState, useEffect, useRef } from "react";

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

function useResponsiveMargin() {
  const [margin, setMargin] = useState("-20px 0px -20px 0px");

  useEffect(() => {
    const updateMargin = () => {
      if (window.innerWidth < 640) {
        setMargin("-10px 0px -10px 0px");
      } else if (window.innerWidth < 1024) {
        setMargin("-20px 0px -20px 0px");
      } else {
        setMargin("-50px 0px -50px 0px");
      }
    };

    updateMargin();
    window.addEventListener("resize", updateMargin);
    return () => window.removeEventListener("resize", updateMargin);
  }, []);

  return margin;
}

function AnimatedNumber({
  value,
  duration = 2,
  className,
}: {
  value: number;
  duration?: number;
  className?: string;
}) {
  const ref = useRef(null);
  const margin = useResponsiveMargin();
  const isInView = useInView(ref, {
    once: true,
    margin: margin as any,
  });

  return (
    <motion.span
      ref={ref}
      className={className}
      style={{
        display: "inline-block",
        willChange: isInView ? "auto" : "transform, opacity",
      }}
      initial={{ opacity: 0, y: 20, scale: 0.8 }}
      animate={{
        opacity: isInView ? 1 : 0,
        y: isInView ? 0 : 20,
        scale: isInView ? 1 : 0.8,
      }}
      transition={{
        duration,
        ease: [0.33, 1, 0.68, 1],
      }}
    >
      {value.toLocaleString()}
    </motion.span>
  );
}

function FadeUpSection({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  const ref = useRef(null);
  const margin = useResponsiveMargin();
  const isInView = useInView(ref, {
    once: true,
    margin: margin as any,
  });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 60 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 60 }}
      transition={{
        duration: 0.8,
        delay,
        ease: [0.33, 1, 0.68, 1],
      }}
    >
      {children}
    </motion.div>
  );
}

function ParallaxBlob({
  className,
  speed = 0.5,
}: {
  className: string;
  speed?: number;
}) {
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 1000], [0, 1000 * speed]);

  return <motion.div className={className} style={{ y }} />;
}

function PercentileChart({
  title,
  data,
  color,
  formatter,
  delay = 0,
}: {
  title: string;
  data: Array<[number, number]>;
  color: string;
  formatter: (v: number) => string;
  delay?: number;
}) {
  const chartRef = useRef<HTMLDivElement>(null);
  const margin = useResponsiveMargin();
  const isInView = useInView(chartRef, {
    once: true,
    margin: margin as any,
  });

  const maxValue = Math.max(...data.map(([, v]) => v));
  const minValue = Math.min(...data.map(([, v]) => v));
  const range = maxValue - minValue || 1;

  return (
    <FadeUpSection delay={delay}>
      <div ref={chartRef}>
        <p className="text-xs uppercase tracking-[0.3em] text-white/40 mb-6">
          {title}
        </p>
        <div className="relative h-48 sm:h-56 bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
          <div className="absolute inset-0 flex items-end justify-between gap-1 px-6 pb-6 pt-12">
            {data.map(([percent, value], i) => {
              const heightPercent = ((value - minValue) / range) * 100;
              const barHeight = Math.max(heightPercent, 5);

              return (
                <motion.div
                  key={percent}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{
                    height: isInView ? `${barHeight}%` : "0%",
                    opacity: isInView ? 1 : 0,
                  }}
                  transition={{
                    duration: 0.8,
                    delay: isInView ? delay + i * 0.03 : 0,
                    ease: [0.33, 1, 0.68, 1],
                  }}
                  className="flex-1 rounded-t-sm relative group cursor-pointer"
                  style={{ background: color, minHeight: "2px" }}
                >
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-white/80 whitespace-nowrap bg-black/50 px-2 py-1 rounded">
                    P{percent}: {formatter(value)}
                  </div>
                </motion.div>
              );
            })}
          </div>
          <div className="absolute inset-x-0 bottom-3 flex justify-between px-6">
            <span className="text-xs text-white/30">P0</span>
            <span className="text-xs text-white/30">P50</span>
            <span className="text-xs text-white/30">P100</span>
          </div>
        </div>
      </div>
    </FadeUpSection>
  );
}

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
      <div className="bg-[#0a0a0a] text-white min-h-screen flex flex-col items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-t-white/40 border-r-white/20 border-b-white/10 border-l-transparent rounded-full"
        />
        <p className="text-white/60 mt-6">Loading global stats...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-[#0a0a0a] text-white min-h-screen flex items-center justify-center">
        <p className="text-white/60">{error || "No data available"}</p>
      </div>
    );
  }

  return (
    <div className="bg-[#0a0a0a] text-white overflow-x-hidden">
      {/* Hero */}
      <section className="min-h-screen flex items-center justify-center relative overflow-visible">
        <div className="absolute inset-0 opacity-25">
          <MeshGradient
            colors={["#00d9ff", "#ff0099", "#00ffaa"]}
            distortion={0.5}
            speed={0.2}
          />
        </div>
        <ParallaxBlob
          className="absolute top-20 left-0 w-96 h-96 bg-[#00d9ff]/10 rounded-full blur-[120px]"
          speed={0.3}
        />
        <ParallaxBlob
          className="absolute bottom-20 right-0 w-80 h-80 bg-[#ff0099]/10 rounded-full blur-[100px]"
          speed={0.25}
        />

        <div className="relative z-10 px-8 max-w-[100vw] text-center">
          <motion.h1
            className="text-[12rem] md:text-[16rem] lg:text-[20rem] font-black leading-none bg-gradient-to-br from-[#00d9ff] to-[#00ffaa] bg-clip-text text-transparent"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.2, ease: [0.34, 0.8, 0.64, 1] }}
          >
            {data.year}
          </motion.h1>
          <motion.div
            className="-mt-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.3 }}
          >
            <p className="text-3xl md:text-4xl uppercase tracking-[0.3em] text-white/60">
              Global Year in Music
            </p>
          </motion.div>
        </div>
      </section>

      {/* Community Size */}
      <section className="min-h-screen flex items-center justify-center px-8 relative overflow-visible">
        <div className="absolute inset-0 opacity-25">
          <SimplexNoise
            colors={["#00d9ff", "#00ffaa"]}
            softness={0.6}
            speed={0.2}
          />
        </div>
        <ParallaxBlob
          className="absolute top-40 right-0 w-80 h-80 bg-[#00ffaa]/10 rounded-full blur-[100px]"
          speed={0.35}
        />

        <div className="relative z-10 max-w-6xl mx-auto">
          <FadeUpSection>
            <p className="text-sm uppercase tracking-[0.3em] text-white/40 mb-8 text-center">
              The Community
            </p>
          </FadeUpSection>
          <FadeUpSection delay={0.2}>
            <div className="text-center mb-12">
              <AnimatedNumber
                value={data.total_users}
                duration={2.5}
                className="text-[6rem] sm:text-[8rem] md:text-[10rem] lg:text-[12rem] font-bold leading-none bg-gradient-to-br from-[#00d9ff] to-[#0066ff] bg-clip-text text-transparent"
              />
            </div>
          </FadeUpSection>
          <FadeUpSection delay={0.4}>
            <p className="text-xl sm:text-2xl md:text-3xl text-white/80 text-center max-w-2xl mx-auto leading-relaxed">
              listeners tracked music this year
            </p>
            <p className="text-base sm:text-lg text-white/40 text-center mt-6 max-w-xl mx-auto">
              A vibrant community of music lovers, all wrapped up in your data.
            </p>
          </FadeUpSection>
        </div>
      </section>

      {/* Top Artists */}
      <section className="min-h-screen flex items-center px-8 md:px-16 lg:px-24 relative overflow-visible">
        <div className="absolute inset-0 opacity-20">
          <Metaballs
            colors={["#ff0099", "#00ffaa"]}
            count={4}
            size={0.7}
            speed={0.18}
          />
        </div>
        <ParallaxBlob
          className="absolute bottom-40 left-0 w-80 h-80 bg-[#ff0099]/10 rounded-full blur-[120px]"
          speed={0.3}
        />

        <div className="max-w-6xl mx-auto w-full relative z-10">
          <FadeUpSection>
            <p className="text-xs uppercase tracking-[0.3em] text-white/40 mb-16 text-center">
              Most Played Artists
            </p>
          </FadeUpSection>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
            {data.top_artists.slice(0, 10).map((artist, i) => (
              <FadeUpSection key={artist.name} delay={0.1 + i * 0.08}>
                <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
                  <p className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white/30 mb-4">
                    #{i + 1}
                  </p>
                  <p className="text-xl sm:text-2xl md:text-3xl text-white font-semibold mb-4 leading-tight">
                    {artist.name}
                  </p>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-white/40 mb-1">
                        plays
                      </p>
                      <AnimatedNumber
                        value={artist.plays}
                        duration={1.5}
                        className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-[#00d9ff] to-[#0066ff] bg-clip-text text-transparent"
                      />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider text-white/40 mb-1">
                        hours
                      </p>
                      <AnimatedNumber
                        value={Number((artist.minutes / 60).toFixed(1))}
                        duration={1.5}
                        className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-[#ff0099] to-[#ff6b6b] bg-clip-text text-transparent"
                      />
                    </div>
                  </div>
                </div>
              </FadeUpSection>
            ))}
          </div>
        </div>
      </section>

      {/* Top Tracks */}
      <section className="min-h-screen flex items-center px-8 md:px-16 lg:px-24 py-24 relative overflow-visible">
        <div className="absolute inset-0 opacity-20">
          <SimplexNoise
            colors={["#00d9ff", "#ff0099"]}
            softness={0.7}
            speed={0.15}
          />
        </div>
        <ParallaxBlob
          className="absolute top-20 right-0 w-96 h-96 bg-[#0066ff]/10 rounded-full blur-[140px]"
          speed={0.3}
        />

        <div className="max-w-5xl mx-auto w-full relative z-10">
          <FadeUpSection>
            <p className="text-xs uppercase tracking-[0.3em] text-white/40 mb-16 text-center">
              Most Played Tracks
            </p>
          </FadeUpSection>

          <div className="space-y-4">
            {data.top_tracks.map((track, i) => (
              <FadeUpSection key={`${track.title}-${track.artist}`} delay={i * 0.08}>
                <div className="flex items-start gap-4 sm:gap-6 md:gap-8 border-b border-white/10 pb-6 relative">
                  <p className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white/30 z-20 pl-1 min-w-[3rem] sm:min-w-[4rem]">
                    {i + 1}
                  </p>
                  <div className="flex-1 min-w-0">
                    <p className="text-xl sm:text-2xl md:text-3xl lg:text-4xl text-white font-medium mb-2 leading-tight">
                      {track.title}
                    </p>
                    <p className="text-base sm:text-lg md:text-xl text-white/50">
                      {track.artist}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl sm:text-3xl md:text-4xl font-bold">
                      <AnimatedNumber value={track.plays} duration={1.5} />
                    </div>
                    <p className="text-sm text-white/40 mt-1">plays</p>
                  </div>
                </div>
              </FadeUpSection>
            ))}
          </div>
        </div>
      </section>

      {/* Distribution Charts */}
      <section className="min-h-screen flex items-center px-8 md:px-16 lg:px-24 py-24 relative overflow-visible">
        <div className="absolute inset-0 opacity-25">
          <Metaballs
            colors={["#00ffaa", "#ff0099"]}
            count={5}
            size={0.6}
            speed={0.15}
          />
        </div>
        <ParallaxBlob
          className="absolute bottom-0 left-1/4 w-80 h-80 bg-[#00ffaa]/10 rounded-full blur-[120px]"
          speed={0.25}
        />

        <div className="max-w-6xl mx-auto w-full relative z-10">
          <FadeUpSection>
            <p className="text-xs uppercase tracking-[0.3em] text-white/40 mb-16 text-center">
              How Listening Is Distributed
            </p>
          </FadeUpSection>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-12">
            <PercentileChart
              title="Minutes Listened"
              data={data.distribution.minutes_percentiles}
              color="#00d9ff"
              formatter={(v) => `${(v / 60).toFixed(1)} hrs`}
              delay={0.2}
            />
            <PercentileChart
              title="Total Plays"
              data={data.distribution.plays_percentiles}
              color="#ff0099"
              formatter={(v) => v.toLocaleString()}
              delay={0.3}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            <PercentileChart
              title="Unique Artists"
              data={data.distribution.artists_percentiles}
              color="#00ffaa"
              formatter={(v) => v.toLocaleString()}
              delay={0.4}
            />
            <PercentileChart
              title="Unique Tracks"
              data={data.distribution.tracks_percentiles}
              color="#ffcc00"
              formatter={(v) => v.toLocaleString()}
              delay={0.5}
            />
          </div>
        </div>
      </section>

      {/* Footer Summary */}
      <section className="min-h-screen flex items-center justify-center px-8 relative overflow-visible">
        <div className="absolute inset-0 opacity-20">
          <MeshGradient
            colors={["#00d9ff", "#00ffaa", "#ff0099"]}
            distortion={0.4}
            speed={0.15}
          />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <FadeUpSection>
            <div className="mb-12">
              <AnimatedNumber
                value={Number((data.verified_minutes / 60).toFixed(0))}
                duration={2.5}
                className="text-[8rem] sm:text-[10rem] md:text-[12rem] font-bold leading-none bg-gradient-to-br from-[#00ffaa] to-[#00d9ff] bg-clip-text text-transparent"
              />
            </div>
          </FadeUpSection>
          <FadeUpSection delay={0.2}>
            <p className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl text-white/80 mb-8">
              verified hours of music
            </p>
            <p className="text-xl sm:text-2xl text-white/50 max-w-2xl mx-auto leading-relaxed">
              From tracks identified with MusicBrainz data. The soundtrack to a year of discovery.
            </p>
          </FadeUpSection>
        </div>
      </section>
    </div>
  );
}
