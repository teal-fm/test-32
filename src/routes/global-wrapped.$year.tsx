import { createFileRoute } from "@tanstack/react-router";
import StaggeredText from "@/components/StaggeredText";
import {
  Metaballs,
  MeshGradient,
  SimplexNoise,
} from "@paper-design/shaders-react";
import { motion, useInView, useScroll, useTransform } from "framer-motion";
import { useState, useEffect, useRef } from "react";

const ALBUM_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='500' height='500' viewBox='0 0 500 500'%3E%3Crect fill='%231a1a2e' width='500' height='500'/%3E%3Ccircle cx='250' cy='250' r='150' fill='none' stroke='%23333' stroke-width='2'/%3E%3Ccircle cx='250' cy='250' r='50' fill='%23333'/%3E%3C/svg%3E";

const mbidCache = new Map<string, string | null>();

async function lookupReleaseMbId(
  title: string,
  artist: string,
): Promise<string | null> {
  const cacheKey = `${artist}::${title}`;
  if (mbidCache.has(cacheKey)) {
    return mbidCache.get(cacheKey) || null;
  }

  try {
    const query = encodeURIComponent(
      `recording:"${title}" AND artist:"${artist}"`,
    );
    const response = await fetch(
      `https://musicbrainz.org/ws/2/recording?query=${query}&fmt=json&limit=1`,
      {
        headers: {
          "User-Agent": "TealWrapped/1.0 (https://teal.fm)",
        },
      },
    );

    if (!response.ok) {
      mbidCache.set(cacheKey, null);
      return null;
    }

    const data = await response.json();
    const recording = data.recordings?.[0];
    const releaseMbId = recording?.releases?.[0]?.id;

    mbidCache.set(cacheKey, releaseMbId || null);
    return releaseMbId || null;
  } catch (error) {
    console.error("MusicBrainz lookup failed:", error);
    mbidCache.set(cacheKey, null);
    return null;
  }
}

function AlbumArt({
  releaseMbId,
  title,
  artist,
  alt,
  className,
}: {
  releaseMbId?: string;
  title: string;
  artist: string;
  alt?: string;
  className?: string;
}) {
  const [src, setSrc] = useState<string>(ALBUM_PLACEHOLDER);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function resolveAlbumArt() {
      if (releaseMbId && releaseMbId !== "undefined") {
        setSrc(
          `https://coverartarchive.org/release/${releaseMbId}/front-500.jpg`,
        );
        return;
      }

      const foundMbId = await lookupReleaseMbId(title, artist);
      if (cancelled) return;

      if (foundMbId) {
        setSrc(
          `https://coverartarchive.org/release/${foundMbId}/front-500.jpg`,
        );
      } else {
        setSrc(ALBUM_PLACEHOLDER);
      }
    }

    resolveAlbumArt();
    return () => {
      cancelled = true;
    };
  }, [releaseMbId, title, artist]);

  return (
    <img
      src={hasError ? ALBUM_PLACEHOLDER : src}
      alt={alt || title}
      className={className}
      onError={() => setHasError(true)}
    />
  );
}

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
    recording_mb_id?: string;
    release_mb_id?: string;
    release_name?: string;
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
  const minValue = Math.max(0.1, Math.min(...data.map(([, v]) => v)));
  const logMax = Math.log10(maxValue);
  const logMin = Math.log10(minValue);
  const logRange = logMax - logMin || 1;

  const p50Value = data.find(([p]) => p === 50)?.[1] || 0;
  const p100Value = data.find(([p]) => p === 100)?.[1] || 0;

  const logTick1 = Math.log10(minValue) + logRange * 0.25;
  const logTick2 = Math.log10(minValue) + logRange * 0.5;
  const logTick3 = Math.log10(minValue) + logRange * 0.75;
  const tick1Value = Math.pow(10, logTick1);
  const tick2Value = Math.pow(10, logTick2);
  const tick3Value = Math.pow(10, logTick3);

  return (
    <FadeUpSection delay={delay}>
      <div ref={chartRef}>
        <p className="text-xs uppercase tracking-[0.3em] text-white/40 mb-6">
          {title}
        </p>
        <div className="relative h-48 sm:h-56 bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
          <div className="absolute left-0 top-0 bottom-0 w-8 flex flex-col justify-between py-10">
            <span className="text-[10px] text-white/30">{formatter(tick3Value)}</span>
            <span className="text-[10px] text-white/30">{formatter(tick2Value)}</span>
            <span className="text-[10px] text-white/30">{formatter(tick1Value)}</span>
          </div>
          <div className="absolute inset-0 flex items-end justify-between gap-1 px-8 pb-10 pt-12 ml-8">
            {data.map(([percent, value], i) => {
              const logValue = Math.log10(Math.max(value, 0.1));
              const heightPercent = Math.max(
                5,
                ((logValue - logMin) / logRange) * 100,
              );

              return (
                <motion.div
                  key={percent}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{
                    height: isInView ? `${heightPercent}%` : "0%",
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
                    {formatter(value)}
                  </div>
                </motion.div>
              );
            })}
          </div>
          <div className="absolute inset-x-0 bottom-3 flex justify-between px-10 ml-8">
            <div className="text-left">
              <span className="text-xs text-white/30 block">min</span>
              <span className="text-xs text-white/50">{formatter(minValue)}</span>
            </div>
            <div className="text-center">
              <span className="text-xs text-white/30 block">median</span>
              <span className="text-xs text-white/50">{formatter(p50Value)}</span>
            </div>
            <div className="text-right">
              <span className="text-xs text-white/30 block">max</span>
              <span className="text-xs text-white/50">{formatter(p100Value)}</span>
            </div>
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

      {/* Top Artist #1 */}
      <section className="min-h-screen flex items-center px-8 md:px-16 lg:px-24 relative overflow-visible">
        <div className="absolute inset-0 opacity-30">
          <Metaballs
            colors={["#ff0099", "#9900ff"]}
            count={4}
            size={0.8}
            speed={0.2}
          />
        </div>
        <ParallaxBlob
          className="absolute bottom-40 right-0 w-[32rem] h-[32rem] bg-[#ff0099]/10 rounded-full blur-[140px]"
          speed={0.4}
        />
        <div className="max-w-7xl mx-auto w-full relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center">
            <FadeUpSection>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-white/40 mb-6 lg:mb-8">
                  Most Played Artist
                </p>
                {data.top_artists[0]?.mb_id && (
                  <AlbumArt
                    releaseMbId={data.top_artists[0].mb_id}
                    title={data.top_artists[0].name}
                    artist={data.top_artists[0].name}
                    className="mb-6 lg:mb-8 rounded-2xl border border-white/10 shadow-lg w-full max-w-sm lg:w-4/5 brightness-90"
                  />
                )}
                <StaggeredText
                  text={data.top_artists[0]?.name || "Unknown"}
                  className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-bold text-white leading-[0.9] mb-8 lg:mb-12"
                  offset={40}
                  delay={0.2}
                  duration={0.2}
                  staggerDelay={0.15}
                  once={true}
                  as="h2"
                />
              </div>
            </FadeUpSection>
            <div className="space-y-6 lg:space-y-8">
              <FadeUpSection delay={0.2}>
                <div className="border-l-4 border-[#00d9ff] pl-6 lg:pl-8">
                  <AnimatedNumber
                    value={Number((data.top_artists[0]?.minutes || 0) / 60)}
                    duration={2}
                    className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold bg-gradient-to-r from-[#00d9ff] to-[#0066ff] bg-clip-text text-transparent"
                  />
                  <p className="text-lg sm:text-xl text-white/60 mt-2">
                    hours played
                  </p>
                </div>
              </FadeUpSection>
              <FadeUpSection delay={0.3}>
                <div className="border-l-4 border-[#ff0099] pl-6 lg:pl-8">
                  <AnimatedNumber
                    value={data.top_artists[0]?.plays || 0}
                    duration={2}
                    className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold bg-gradient-to-r from-[#ff0099] to-[#9900ff] bg-clip-text text-transparent"
                  />
                  <p className="text-lg sm:text-xl text-white/60 mt-2">plays</p>
                </div>
              </FadeUpSection>
              <FadeUpSection delay={0.4}>
                <div className="pl-6 lg:pl-8 pt-6 lg:pt-8 border-t border-white/10">
                  <p className="text-sm text-white/40 uppercase tracking-widest mb-3">
                    Global Favorite
                  </p>
                  <p className="text-lg sm:text-xl text-white/60 leading-relaxed">
                    The most listened to artist across all of teal.fm
                  </p>
                </div>
              </FadeUpSection>
            </div>
          </div>
        </div>
      </section>

      {/* Artists #2 and #3 */}
      {(data.top_artists[1] || data.top_artists[2]) && (
        <section className="min-h-screen flex items-center px-8 md:px-16 lg:px-24 py-24 relative overflow-visible">
          <div className="absolute inset-0 opacity-30">
            <Metaballs
              colors={["#00d9ff", "#9900ff"]}
              count={4}
              size={0.8}
              speed={0.2}
            />
          </div>
          <ParallaxBlob
            className="absolute top-1/3 left-1/4 w-[32rem] h-[32rem] bg-[#00d9ff]/10 rounded-full blur-[140px]"
            speed={0.4}
          />
          <div className="max-w-7xl mx-auto w-full relative z-10">
            <FadeUpSection>
              <p className="text-sm uppercase tracking-[0.3em] text-white/40 mb-12 text-center">
                The Runners Up
              </p>
            </FadeUpSection>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
              {data.top_artists[1] && (
                <FadeUpSection delay={0.2}>
                  <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-6 lg:p-8 border border-white/10">
                    {data.top_artists[1].mb_id && (
                      <AlbumArt
                        releaseMbId={data.top_artists[1].mb_id}
                        title={data.top_artists[1].name}
                        artist={data.top_artists[1].name}
                        className="w-full aspect-square object-cover rounded-2xl mb-6 brightness-90"
                      />
                    )}
                    <div className="flex items-baseline gap-3 mb-4">
                      <span className="text-4xl font-bold text-white/30">
                        2
                      </span>
                      <h3 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white leading-tight">
                        {data.top_artists[1].name}
                      </h3>
                    </div>
                    <div className="space-y-4">
                      <div className="flex justify-between items-baseline border-b border-white/10 pb-3">
                        <span className="text-sm text-white/40">hours</span>
                        <AnimatedNumber
                          value={Number((data.top_artists[1].minutes / 60).toFixed(1))}
                          className="text-2xl font-bold bg-gradient-to-r from-[#00ffaa] to-[#00ff66] bg-clip-text text-transparent"
                        />
                      </div>
                      <div className="flex justify-between items-baseline border-b border-white/10 pb-3">
                        <span className="text-sm text-white/40">plays</span>
                        <span className="text-xl text-white/80">
                          <AnimatedNumber value={data.top_artists[1].plays} />
                        </span>
                      </div>
                    </div>
                  </div>
                </FadeUpSection>
              )}

              {data.top_artists[2] && (
                <FadeUpSection delay={0.3}>
                  <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-6 lg:p-8 border border-white/10">
                    {data.top_artists[2].mb_id && (
                      <AlbumArt
                        releaseMbId={data.top_artists[2].mb_id}
                        title={data.top_artists[2].name}
                        artist={data.top_artists[2].name}
                        className="w-full aspect-square object-cover rounded-2xl mb-6 brightness-90"
                      />
                    )}
                    <div className="flex items-baseline gap-3 mb-4">
                      <span className="text-4xl font-bold text-white/30">
                        3
                      </span>
                      <h3 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white leading-tight">
                        {data.top_artists[2].name}
                      </h3>
                    </div>
                    <div className="space-y-4">
                      <div className="flex justify-between items-baseline border-b border-white/10 pb-3">
                        <span className="text-sm text-white/40">hours</span>
                        <AnimatedNumber
                          value={Number((data.top_artists[2].minutes / 60).toFixed(1))}
                          className="text-2xl font-bold bg-gradient-to-r from-[#00ffaa] to-[#00ff66] bg-clip-text text-transparent"
                        />
                      </div>
                      <div className="flex justify-between items-baseline border-b border-white/10 pb-3">
                        <span className="text-sm text-white/40">plays</span>
                        <span className="text-xl text-white/80">
                          <AnimatedNumber value={data.top_artists[2].plays} />
                        </span>
                      </div>
                    </div>
                  </div>
                </FadeUpSection>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Rest of Top Artists */}
      {data.top_artists.length > 3 && (
        <section className="max-h-screen mt-40 flex items-center px-8 md:px-16 lg:px-24 py-24 pb-32 relative overflow-visible">
          <div className="absolute inset-0 opacity-20">
            <SimplexNoise
              colors={["#00d9ff", "#9900ff"]}
              softness={0.8}
              speed={0.15}
            />
          </div>
          <ParallaxBlob
            className="absolute top-1/4 right-0 w-[36rem] h-[36rem] bg-[#0066ff]/10 rounded-full blur-[150px]"
            speed={0.35}
          />
          <div className="max-w-5xl mx-auto w-full relative z-10">
            <FadeUpSection>
              <p className="text-sm uppercase tracking-[0.3em] text-white/40 mb-16">
                The Rest of Top Artists
              </p>
            </FadeUpSection>
            <div className="space-y-6">
              {data.top_artists.slice(3, 10).map((item, idx) => (
                <FadeUpSection key={idx} delay={idx * 0.1}>
                  <div className="flex items-start gap-4 sm:gap-6 md:gap-8 border-b border-white/10 pb-6 relative">
                    <p className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white z-20 pl-1 text-shadow-md min-w-[3rem] sm:min-w-[4rem]">
                      {idx + 4}
                    </p>
                    <div className="flex-1 min-w-0">
                      <StaggeredText
                        text={item.name}
                        className="text-xl sm:text-2xl md:text-4xl lg:text-5xl text-white font-medium mb-2"
                        offset={20}
                        delay={0.1 + (idx + 3) * 0.1}
                        duration={0.08}
                        staggerDelay={0.06}
                        once={true}
                        as="h3"
                      />
                      <div className="flex justify-between items-baseline">
                        <span className="text-base sm:text-lg text-white/50">
                          <AnimatedNumber value={item.plays} duration={1.5} /> plays
                        </span>
                        <span className="text-base sm:text-lg text-white/50">
                          {Number((item.minutes / 60).toFixed(1))} hrs
                        </span>
                      </div>
                    </div>
                  </div>
                </FadeUpSection>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Top Track #1 */}
      {data.top_tracks[0] && (
        <section className="min-h-screen flex items-center px-8 md:px-16 lg:px-24 relative overflow-visible">
          <div className="absolute inset-0 opacity-30">
            <Metaballs
              colors={["#00d9ff", "#00ffaa"]}
              count={4}
              size={0.8}
              speed={0.2}
            />
          </div>
          <ParallaxBlob
            className="absolute bottom-40 right-0 w-[32rem] h-[32rem] bg-[#00d9ff]/10 rounded-full blur-[140px]"
            speed={0.4}
          />

          <div className="max-w-7xl mx-auto w-full relative z-10">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center">
              <FadeUpSection>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-white/40 mb-6 lg:mb-8">
                    Most Played Track
                  </p>
                  {data.top_tracks[0].release_mb_id && (
                    <AlbumArt
                      releaseMbId={data.top_tracks[0].release_mb_id}
                      title={data.top_tracks[0].title}
                      artist={data.top_tracks[0].artist}
                      className="mb-6 lg:mb-8 rounded-2xl border border-white/10 shadow-lg w-full max-w-sm lg:w-4/5 brightness-90"
                    />
                  )}
                  <StaggeredText
                    text={data.top_tracks[0].title}
                    className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-bold text-white leading-[0.9] mb-8 lg:mb-12"
                    offset={40}
                    delay={0.2}
                    duration={0.2}
                    staggerDelay={0.15}
                    once={true}
                    as="h2"
                  />
                  <p className="text-xl sm:text-2xl md:text-3xl text-white/50 leading-relaxed max-w-2xl">
                    {data.top_tracks[0].artist}
                  </p>
                </div>
              </FadeUpSection>
              <div className="space-y-6 lg:space-y-8">
                <FadeUpSection delay={0.2}>
                  <div className="border-l-4 border-[#00d9ff] pl-6 lg:pl-8">
                    <AnimatedNumber
                      value={data.top_tracks[0].plays}
                      duration={2}
                      className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold bg-gradient-to-r from-[#00d9ff] to-[#0066ff] bg-clip-text text-transparent"
                    />
                    <p className="text-lg sm:text-xl text-white/60 mt-2">
                      total plays
                    </p>
                  </div>
                </FadeUpSection>
                <FadeUpSection delay={0.3}>
                  <div className="pl-6 lg:pl-8 pt-6 lg:pt-8 border-t border-white/10">
                    <p className="text-sm text-white/40 uppercase tracking-widest mb-3">
                      Global Favorite
                    </p>
                    <p className="text-lg sm:text-xl text-white/60 leading-relaxed">
                      The most played track across all of teal.fm
                    </p>
                  </div>
                </FadeUpSection>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Tracks #2 and #3 */}
      {(data.top_tracks[1] || data.top_tracks[2]) && (
        <section className="min-h-screen flex items-center px-8 md:px-16 lg:px-24 py-24 relative overflow-visible">
          <div className="absolute inset-0 opacity-30">
            <Metaballs
              colors={["#00d9ff", "#00ffaa"]}
              count={4}
              size={0.8}
              speed={0.2}
            />
          </div>
          <ParallaxBlob
            className="absolute top-1/3 left-1/4 w-[32rem] h-[32rem] bg-[#00d9ff]/10 rounded-full blur-[140px]"
            speed={0.4}
          />
          <div className="max-w-7xl mx-auto w-full relative z-10">
            <FadeUpSection>
              <p className="text-sm uppercase tracking-[0.3em] text-white/40 mb-12 text-center">
                The Runners Up
              </p>
            </FadeUpSection>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
              {data.top_tracks[1] && (
                <FadeUpSection delay={0.2}>
                  <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-6 lg:p-8 border border-white/10">
                    {data.top_tracks[1].release_mb_id && (
                      <AlbumArt
                        releaseMbId={data.top_tracks[1].release_mb_id}
                        title={data.top_tracks[1].title}
                        artist={data.top_tracks[1].artist}
                        className="w-full aspect-square object-cover rounded-2xl mb-6 brightness-90"
                      />
                    )}
                    <div className="flex items-baseline gap-3 mb-4">
                      <span className="text-4xl font-bold text-white/30">
                        2
                      </span>
                      <h3 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white leading-tight">
                        {data.top_tracks[1].title}
                      </h3>
                    </div>
                    <div className="space-y-4">
                      <div className="flex justify-between items-baseline border-b border-white/10 pb-3">
                        <span className="text-sm text-white/40">plays</span>
                        <span className="text-xl text-white/80">
                          <AnimatedNumber value={data.top_tracks[1].plays} />
                        </span>
                      </div>
                      <div className="pt-2">
                        <p className="text-xs text-white/40 uppercase tracking-wider mb-2">
                          {data.top_tracks[1].artist}
                        </p>
                      </div>
                    </div>
                  </div>
                </FadeUpSection>
              )}

              {data.top_tracks[2] && (
                <FadeUpSection delay={0.3}>
                  <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-6 lg:p-8 border border-white/10">
                    {data.top_tracks[2].release_mb_id && (
                      <AlbumArt
                        releaseMbId={data.top_tracks[2].release_mb_id}
                        title={data.top_tracks[2].title}
                        artist={data.top_tracks[2].artist}
                        className="w-full aspect-square object-cover rounded-2xl mb-6 brightness-90"
                      />
                    )}
                    <div className="flex items-baseline gap-3 mb-4">
                      <span className="text-4xl font-bold text-white/30">
                        3
                      </span>
                      <h3 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white leading-tight">
                        {data.top_tracks[2].title}
                      </h3>
                    </div>
                    <div className="space-y-4">
                      <div className="flex justify-between items-baseline border-b border-white/10 pb-3">
                        <span className="text-sm text-white/40">plays</span>
                        <span className="text-xl text-white/80">
                          <AnimatedNumber value={data.top_tracks[2].plays} />
                        </span>
                      </div>
                      <div className="pt-2">
                        <p className="text-xs text-white/40 uppercase tracking-wider mb-2">
                          {data.top_tracks[2].artist}
                        </p>
                      </div>
                    </div>
                  </div>
                </FadeUpSection>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Rest of Top Tracks */}
      {data.top_tracks.length > 3 && (
        <section className="max-h-screen mt-40 flex items-center px-8 md:px-16 lg:px-24 py-24 pb-32 relative overflow-visible">
          <div className="absolute inset-0 opacity-20">
            <SimplexNoise
              colors={["#00d9ff", "#9900ff"]}
              softness={0.8}
              speed={0.15}
            />
          </div>
          <ParallaxBlob
            className="absolute top-1/4 right-0 w-[36rem] h-[36rem] bg-[#0066ff]/10 rounded-full blur-[150px]"
            speed={0.35}
          />
          <div className="max-w-5xl mx-auto w-full relative z-10">
            <FadeUpSection>
              <p className="text-xs uppercase tracking-[0.3em] text-white/40 mb-16">
                The Rest of Top Tracks
              </p>
            </FadeUpSection>
            <div className="space-y-4">
              {data.top_tracks.slice(3, 10).map((track, i) => (
                <FadeUpSection key={`${track.title}-${track.artist}`} delay={i * 0.08}>
                  <div className="flex items-start gap-4 sm:gap-6 md:gap-8 border-b border-white/10 pb-6 relative">
                    <p className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white/30 z-20 pl-1 text-shadow-md min-w-[3rem] sm:min-w-[4rem]">
                      {i + 4}
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
      )}

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
