import StaggeredText from "@/components/StaggeredText";
import {
  MeshGradient,
  Metaballs,
  SimplexNoise,
} from "@paper-design/shaders-react";
import { createFileRoute } from "@tanstack/react-router";
import { motion, useInView, useScroll, useTransform } from "framer-motion";
import html2canvas from "html2canvas-pro";
import { useEffect, useRef, useState } from "react";

// Hook to get responsive margin for intersection observer
function useResponsiveMargin() {
  const [margin, setMargin] = useState("-20px 0px -20px 0px");

  useEffect(() => {
    const updateMargin = () => {
      if (window.innerWidth < 640) {
        // Mobile: very small margin
        setMargin("-10px 0px -10px 0px");
      } else if (window.innerWidth < 1024) {
        // Tablet: small margin
        setMargin("-20px 0px -20px 0px");
      } else {
        // Desktop: larger margin
        setMargin("-50px 0px -50px 0px");
      }
    };

    updateMargin();
    window.addEventListener("resize", updateMargin);
    return () => window.removeEventListener("resize", updateMargin);
  }, []);

  return margin;
}

// Placeholder for missing album art
const ALBUM_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='500' height='500' viewBox='0 0 500 500'%3E%3Crect fill='%231a1a2e' width='500' height='500'/%3E%3Ccircle cx='250' cy='250' r='150' fill='none' stroke='%23333' stroke-width='2'/%3E%3Ccircle cx='250' cy='250' r='50' fill='%23333'/%3E%3C/svg%3E";

// Cache for MusicBrainz lookups to avoid repeated API calls
const mbidCache = new Map<string, string | null>();

async function lookupReleaseMbId(
  title: string,
  artist: string
): Promise<string | null> {
  const cacheKey = `${artist}::${title}`;
  if (mbidCache.has(cacheKey)) {
    return mbidCache.get(cacheKey) || null;
  }

  try {
    // Search for recording to find release
    const query = encodeURIComponent(
      `recording:"${title}" AND artist:"${artist}"`
    );
    const response = await fetch(
      `https://musicbrainz.org/ws/2/recording?query=${query}&fmt=json&limit=1`,
      {
        headers: {
          "User-Agent": "TealWrapped/1.0 (https://teal.fm)",
        },
      }
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
      // If we have a valid MBID, use it directly
      if (releaseMbId && releaseMbId !== "undefined") {
        setSrc(
          `https://coverartarchive.org/release/${releaseMbId}/front-500.jpg`
        );
        return;
      }

      // Try to look up the MBID from MusicBrainz
      const foundMbId = await lookupReleaseMbId(title, artist);
      if (cancelled) return;

      if (foundMbId) {
        setSrc(
          `https://coverartarchive.org/release/${foundMbId}/front-500.jpg`
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

interface WrappedData {
  year: number;
  total_minutes: number;
  total_plays: number;
  top_artists: Array<{
    name: string;
    plays: number;
    minutes: number;
    mb_id?: string;
    image_url?: string;
    top_track?: string;
    top_track_plays?: number;
    top_track_duration_ms?: number;
  }>;
  top_tracks: Array<{
    title: string;
    artist: string;
    plays: number;
    recording_mb_id?: string;
    release_name?: string;
    release_mb_id?: string;
  }>;
  new_artists_count: number;
  activity_graph: Array<{
    date: string;
    plays: number;
    minutes: number;
  }>;
  hourly_distribution: number[]; // plays per hour (UTC)
  weekday_avg_minutes: number;
  weekend_avg_minutes: number;
  longest_streak: number;
  days_active: number;
  avg_track_length_ms: number;
  listening_diversity: number;
  top_hour: number;
  longest_session_minutes: number;
  similar_users?: Array<{
    did: string;
    handle?: string;
    profile_picture?: string;
    similarity_score: number;
    shared_artists: string[];
    shared_artist_count: number;
  }>;
  profile_picture?: string;
}

export const Route = createFileRoute("/wrapped/$handle")({
  component: WrappedPage,
  head: ({ params }) => {
    const year = new Date().getFullYear();
    const ogImageUrl = `http://localhost:3001/api/wrapped/${year}/og?handle=${encodeURIComponent(
      params.handle
    )}`;
    const pageUrl = `https://yearinmusic.teal.fm/wrapped/${params.handle}`;

    return {
      meta: [
        {
          title: `@${params.handle}'s ${year} teal.fm Year In Music`,
        },
        {
          name: "description",
          content: `${params.handle}'s year in music as tracked by teal.fm - the best music tracking app.`,
        },
        // Open Graph
        {
          property: "og:title",
          content: `@${params.handle}'s ${year} teal.fm Year In Music`,
        },
        {
          property: "og:description",
          content: `Check out ${params.handle}'s year in music on teal.fm!`,
        },
        {
          property: "og:image",
          content: ogImageUrl,
        },
        {
          property: "og:image:width",
          content: "1200",
        },
        {
          property: "og:image:height",
          content: "630",
        },
        {
          property: "og:type",
          content: "website",
        },
        {
          property: "og:url",
          content: pageUrl,
        },
        // Twitter Card
        {
          name: "twitter:card",
          content: "summary_large_image",
        },
        {
          name: "twitter:title",
          content: `@${params.handle}'s ${year} teal.fm Year In Music`,
        },
        {
          name: "twitter:description",
          content: `Check out ${params.handle}'s year in music on teal.fm!`,
        },
        {
          name: "twitter:image",
          content: ogImageUrl,
        },
      ],
    };
  },
});

function getActivityColor(
  date: Date,
  activityData: Array<{ date: string; plays: number; minutes: number }>
): string {
  const dateStr = date.toISOString().split("T")[0];
  const activity = activityData.find((a) => a.date === dateStr);

  if (!activity) return "bg-white/5";

  // Color based on hours listened (convert from minutes)
  const hours = activity.minutes / 60;
  if (hours >= 8) return "bg-[#04c4b8]";
  if (hours >= 5) return "bg-[#04c4be]/70";
  if (hours >= 2) return "bg-[#04c4b8]/40";
  if (hours >= 0.5) return "bg-[#04c4b8]/20";
  return "bg-white/5";
}

function generateCalendarWeeks(
  year: number,
  activityData: Array<{ date: string; plays: number; minutes: number }>,
  startMonth?: number,
  endMonth?: number
): Date[][] {
  const weeks: Date[][] = [];
  const startDate = new Date(`${year}-01-01`);

  // Find the first date with activity
  const firstActivityDate =
    activityData.length > 0
      ? new Date(
          Math.min(...activityData.map((a) => new Date(a.date).getTime()))
        )
      : startDate;

  // Use date range if specified, otherwise use full activity range
  let actualStartDate: Date;
  let actualEndDate: Date;

  if (startMonth !== undefined && endMonth !== undefined) {
    actualStartDate = new Date(year, startMonth - 1, 1);
    actualEndDate = new Date(year, endMonth, 0); // Last day of endMonth
  } else {
    actualStartDate = firstActivityDate;
    actualEndDate = new Date(`${year}-12-31`);
  }

  // Find the first Monday on or before the first activity date
  const firstDay = new Date(actualStartDate);
  const dayOfWeek = firstDay.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  firstDay.setDate(firstDay.getDate() - daysToMonday);

  let currentDate = new Date(firstDay);

  while (currentDate <= actualEndDate) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }
    weeks.push(week);

    // Stop if we've gone past the year
    if (currentDate.getFullYear() > year) break;
  }

  return weeks;
}

function shouldSplitActivityGraph(
  year: number,
  activityData: Array<{ date: string; plays: number; minutes: number }>
): boolean {
  if (activityData.length === 0) return false;

  const yearStart = new Date(`${year}-01-01`);
  const yearEnd = new Date(`${year}-12-31`);

  const firstActivityDate = new Date(
    Math.min(...activityData.map((a) => new Date(a.date).getTime()))
  );

  // Calculate days from first activity to end of year
  const totalDays = Math.ceil(
    (yearEnd.getTime() - firstActivityDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Split if spans more than 275 days (about 3/4 of year) or starts before March
  return totalDays > 275 || firstActivityDate.getMonth() < 2;
}

function AnimatedNumber({
  value,
  duration = 2,
}: {
  value: number;
  duration?: number;
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
      initial={{ opacity: 0 }}
      animate={isInView ? { opacity: 1 } : { opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      {isInView && (
        <motion.span
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration,
            ease: [0.33, 1, 0.68, 1],
          }}
        >
          <motion.span
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{
              duration: duration * 0.8,
              ease: [0.34, 1.56, 0.64, 1], // spring-like ease
            }}
          >
            {value.toLocaleString()}
          </motion.span>
        </motion.span>
      )}
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

function FloatingArtistBubble({
  artist,
  idx,
  xPercent,
  yPercent,
  sizeClass,
}: {
  artist: WrappedData["top_artists"][0];
  idx: number;
  xPercent: number;
  yPercent: number;
  sizeClass: string;
}) {
  const { scrollY } = useScroll();
  // different parallax speeds based on position - bubbles closer to edges move faster
  const parallaxSpeed = 0.15 + (Math.abs(xPercent - 50) / 100) * 0.2;
  const yOffset = useTransform(scrollY, [0, 1500], [0, -150 * parallaxSpeed]);

  return (
    <motion.div
      className={`absolute ${sizeClass} group`}
      style={{
        left: `${xPercent}%`,
        top: `${yPercent}%`,
        x: "-50%",
        y: useTransform(yOffset, (v) => `calc(-50% + ${v}px)`),
      }}
      initial={{ opacity: 0, scale: 0, rotate: -10 }}
      whileInView={{ opacity: 1, scale: 1, rotate: 0 }}
      viewport={{ once: true, margin: "00px" }}
      transition={{
        duration: 0.7,
        delay: idx * 0.1,
        ease: [0.34, 1.26, 0.64, 1],
      }}
      whileHover={{
        scale: 1.2,
        rotate: 5,
        zIndex: 10,
        transition: { duration: 0.2 },
      }}
    >
      {artist.image_url ? (
        <div className="relative w-full h-full overflow-clip rounded-full border-2 border-white/30 shadow-xl group-hover:shadow-2xl transition-shadow">
          <img
            src={artist.image_url}
            alt={artist.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
          <div className="absolute inset-0 flex items-end justify-center pb-1 sm:pb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <span className="text-white text-[0.6rem] sm:text-xs font-medium drop-shadow-lg px-1 text-center leading-tight">
              {artist.name}
            </span>
          </div>
        </div>
      ) : (
        <div className="w-full h-full rounded-full bg-gradient-to-br from-[#ff6b6b]/30 to-[#ff9500]/30 border-2 border-white/30 flex items-center justify-center backdrop-blur-sm">
          <div className="text-white/80 text-[0.6rem] sm:text-xs font-medium text-center px-1 sm:px-2 leading-tight">
            {artist.name.split(" ")[0]}
          </div>
        </div>
      )}
    </motion.div>
  );
}

function WrappedPage() {
  const { handle } = Route.useParams();
  const [data, setData] = useState<WrappedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatingImage, setGeneratingImage] = useState(false);

  const topStatsCardRef = useRef<HTMLDivElement>(null);
  const topArtistCardRef = useRef<HTMLDivElement>(null);
  const activityCardRef = useRef<HTMLDivElement>(null);
  const overallCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Resolve handle to DID via minidoc
        const miniDocResponse = await fetch(
          `https://slingshot.microcosm.blue/xrpc/com.bad-example.identity.resolveMiniDoc?identifier=${handle}`
        );
        if (!miniDocResponse.ok) {
          throw new Error("Failed to resolve handle");
        }
        const miniDoc = await miniDocResponse.json();
        const did = miniDoc.did;

        const year = new Date().getFullYear();
        const response = await fetch(
          `http://localhost:3001/api/wrapped/${year}?did=${did}`
        );
        if (!response.ok) {
          throw new Error("Failed to fetch wrapped data");
        }
        const wrappedData = await response.json();
        setData(wrappedData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [handle]);

  const generateShareImage = async (
    ref: React.RefObject<HTMLDivElement>,
    filename: string
  ) => {
    if (!ref.current) return;

    setGeneratingImage(true);
    try {
      const canvas = await html2canvas(ref.current, {
        backgroundColor: "#0a0a0a",
        scale: 2,
        logging: false,
      });

      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => resolve(blob!), "image/png");
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to generate image:", err);
    } finally {
      setGeneratingImage(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-[#0a0a0a] text-white min-h-screen flex items-center justify-center">
        <p className="text-white/60">Loading your wrapped data...</p>
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
      {/* Hero - Full bleed year */}
      <section className="min-h-screen flex items-center justify-center relative overflow-visible">
        <div className="px-8 max-w-[100vw] relative">
          <motion.h1
            className="text-[16rem] md:text-[18rem] lg:text-[24rem] xl:text-[32rem] font-black leading-none bg-teal-700 bg-clip-text text-transparent text-center relative z-0"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: 1.2,
              ease: [0.34, 0.8, 0.64, 1],
            }}
          >
            <div className="md:hidden">
              <p>{String(data.year).substring(0, 2)}</p>
              <p className="-mt-10">{String(data.year).substring(2, 4)}</p>
            </div>
            <div className="hidden md:block">{data.year}</div>
          </motion.h1>
          <motion.div
            className="md:absolute relative left-0 right-0 md:left-auto -mt-40 z-30 flex flex-col items-center gap-4"
            initial={{ opacity: 0, scale: 1 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.6 }}
          >
            <p className="text-3xl md:text-3xl lg:text-4xl uppercase tracking-[0.3em] text-white text-center">
              Your Year in Music
            </p>
            <div className="-mt-3 flex flex-row items-center gap-4">
              {data.profile_picture && (
                <img
                  src={data.profile_picture}
                  alt={handle}
                  className="w-12 h-12 rounded-full border-2 border-white/20"
                />
              )}
              <p className="text-lg text-white/50">@{handle}</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Hours Stat - Big Impact */}
      <section className="min-h-screen flex items-center justify-center px-8 relative overflow-visible">
        {/* Subtle simplex noise */}
        <div className="absolute inset-0 opacity-25">
          <SimplexNoise
            colors={["#00d9ff", "#00ffaa"]}
            softness={0.6}
            speed={0.25}
          />
        </div>
        <ParallaxBlob
          className="absolute top-20 left-0 w-96 h-96 bg-[#00d9ff]/10 rounded-full blur-[120px]"
          speed={0.3}
        />
        <div className="relative z-10">
          <FadeUpSection>
            <p className="text-sm uppercase tracking-widest text-white/40 mb-6">
              You listened to
            </p>
          </FadeUpSection>
          <FadeUpSection delay={0.2}>
            <div className="mb-8">
              <span className="text-[4rem] sm:text-[6rem] md:text-[10rem] lg:text-[14rem] font-bold leading-none bg-gradient-to-r from-[#00ffaa] to-[#00ff66] bg-clip-text text-transparent">
                <AnimatedNumber
                  value={Math.round(data.total_minutes)}
                  duration={2.5}
                />
              </span>
            </div>
          </FadeUpSection>
          <FadeUpSection delay={0.4}>
            <StaggeredText
              text="minutes of music"
              className="text-2xl sm:text-3xl md:text-5xl lg:text-6xl text-white/80"
              offset={30}
              duration={0.15}
              staggerDelay={0.12}
              once={true}
              as="p"
            />
          </FadeUpSection>
          <FadeUpSection delay={0.6}>
            <p className="text-base sm:text-lg md:text-xl text-white/40 mt-6 max-w-md">
              That's {Math.round(data.total_minutes / 60 / 24)} days straight.
              You could have walked ~{Math.round(data.total_minutes * 0.05)}{" "}
              miles in that amount of time!
            </p>
          </FadeUpSection>
        </div>
      </section>

      {/* Discovery - floating artist photos blob */}
      <section className="min-h-screen flex items-center px-8 relative overflow-visible">
        {/* Gentle mesh gradient */}
        <div className="absolute inset-0 opacity-35">
          <MeshGradient
            colors={["#ff6b6b", "#ff9500", "#00ffaa"]}
            distortion={0.6}
            speed={0.25}
          />
        </div>
        <ParallaxBlob
          className="absolute top-20 left-1/3 w-[28rem] h-[28rem] bg-[#00ffaa]/10 rounded-full blur-[100px]"
          speed={0.2}
        />

        <div className="max-w-7xl mx-auto w-full relative z-10">
          <div className="relative flex items-center justify-center min-h-[80vh]">
            <div className="absolute inset-0">
              {/* container needs defined height and relative positioning */}
              {/* container with padding to prevent edge cutoff */}
              <div className="relative h-screen sm:max-h-[1000px] lg:max-h-[1000px] w-full max-w-7xl mx-auto px-8 sm:px-12">
                {data.top_artists.slice(0, 8).map((artist, idx) => {
                  // create clusters in different regions of the screen
                  const regions = [
                    { x: 15, y: 20 }, // top left
                    { x: 80, y: 15 }, // top right
                    { x: 90, y: 35 }, // mid right
                    { x: 55, y: 85 }, // bottom right
                    { x: 25, y: 80 }, // bottom left
                    { x: 10, y: 50 }, // mid left
                    { x: 30, y: 23 }, // upper center
                    { x: 90, y: 75 }, // lower center
                  ];

                  const base = regions[idx];
                  // add random jitter within a small range
                  const jitterX = Math.sin(idx * 2.3) * 8;
                  const jitterY = Math.cos(idx * 1.7) * 8;

                  const xPercent = base.x + jitterX;
                  const yPercent = base.y + jitterY;

                  // vary sizes slightly for more organic feel
                  const sizeVariants = [
                    "w-14 h-14",
                    "w-16 h-16",
                    "w-20 h-20",
                    "w-18 h-18",
                  ];
                  const smSizeVariants = [
                    "sm:w-20 sm:h-20",
                    "sm:w-24 sm:h-24",
                    "sm:w-28 sm:h-28",
                    "sm:w-22 sm:h-22",
                  ];
                  const lgSizeVariants = [
                    "lg:w-38 lg:h-38",
                    "lg:w-42 lg:h-42",
                    "lg:w-48 lg:h-48",
                    "lg:w-30 lg:h-30",
                  ];

                  const sizeClass = `${sizeVariants[idx % 4]} ${
                    smSizeVariants[idx % 4]
                  } ${lgSizeVariants[idx % 4]}`;

                  return (
                    <FloatingArtistBubble
                      key={artist.mb_id || idx}
                      artist={artist}
                      idx={idx}
                      xPercent={xPercent}
                      yPercent={yPercent}
                      sizeClass={sizeClass}
                    />
                  );
                })}
              </div>
            </div>
            {/* Central stat */}
            <FadeUpSection>
              <div className="text-center relative z-20">
                <p className="text-sm uppercase tracking-[0.3em] text-white/40 mb-8">
                  Discovery
                </p>
                <div className="mb-8">
                  <span className="text-[6rem] sm:text-[8rem] md:text-[12rem] lg:text-[14rem] font-bold leading-none bg-gradient-to-br from-[#ff6b6b] to-[#ff9500] bg-clip-text text-transparent">
                    <AnimatedNumber
                      value={data.new_artists_count}
                      duration={2}
                    />
                  </span>
                </div>
                <div>
                  <p className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl text-white mb-3">
                    artists discovered this year
                  </p>
                  <p className="text-lg sm:text-xl text-white/60 leading-relaxed max-w-2xl mx-auto">
                    You're always hunting for something fresh. These are the
                    faces behind those new sounds.
                  </p>
                </div>
              </div>
            </FadeUpSection>
          </div>
        </div>
      </section>

      {/* Top Artist - Editorial Layout */}
      <section className="min-h-screen flex items-center px-8 md:px-16 lg:px-24 relative overflow-visible">
        {/* Very subtle metaballs */}
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
                  Your Top Artist
                </p>
                <img
                  src={data.top_artists[0]?.image_url}
                  alt={data.top_artists[0]?.name}
                  className="mb-6 lg:mb-8 rounded-2xl border border-white/10 shadow-lg w-full max-w-sm lg:w-4/5 brightness-90"
                />
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
                  <p className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold bg-gradient-to-r from-[#00d9ff] to-[#0066ff] bg-clip-text text-transparent">
                    <AnimatedNumber
                      value={Math.round(
                        (data.top_artists[0]?.minutes || 0) / 60
                      )}
                    />
                  </p>
                  <p className="text-lg sm:text-xl text-white/60 mt-2">
                    hours played
                  </p>
                </div>
              </FadeUpSection>
              <FadeUpSection delay={0.3}>
                <div className="border-l-4 border-[#ff0099] pl-6 lg:pl-8">
                  <p className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold bg-gradient-to-r from-[#ff0099] to-[#9900ff] bg-clip-text text-transparent">
                    <AnimatedNumber value={data.top_artists[0]?.plays || 0} />
                  </p>
                  <p className="text-lg sm:text-xl text-white/60 mt-2">plays</p>
                </div>
              </FadeUpSection>
              <FadeUpSection delay={0.4}>
                <div className="pl-6 lg:pl-8 pt-6 lg:pt-8 border-t border-white/10">
                  <p className="text-sm text-white/40 uppercase tracking-widest mb-3">
                    Most Played Track
                  </p>
                  <StaggeredText
                    text={data.top_artists[0]?.top_track || "Unknown"}
                    className="text-xl sm:text-2xl md:text-3xl text-white font-medium"
                    offset={20}
                    delay={0.2}
                    duration={0.1}
                    staggerDelay={0.08}
                    once={true}
                    as="p"
                  />
                  {data.top_artists[0]?.top_track_plays && (
                    <div className="text-sm text-white/40 mt-2 space-y-1">
                      <p>
                        {data.top_artists[0].top_track_plays} plays -{" "}
                        {data.top_artists[0].top_track_duration_ms && (
                          <span>
                            {Math.round(
                              (data.top_artists[0].top_track_duration_ms *
                                data.top_artists[0].top_track_plays) /
                                1000 /
                                60
                            )}
                            m{" "}
                            {String(
                              Math.floor(
                                ((data.top_artists[0].top_track_duration_ms *
                                  data.top_artists[0].top_track_plays) /
                                  1000) %
                                  60
                              )
                            ).padStart(2, "0")}
                            s in total
                          </span>
                        )}
                      </p>
                    </div>
                  )}
                </div>
              </FadeUpSection>
            </div>
          </div>
        </div>
      </section>

      {/* Artists #2 and #3 - Side by Side */}
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
                The Rest of the Podium
              </p>
            </FadeUpSection>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
              {/* Artist #2 */}
              {data.top_artists[1] && (
                <FadeUpSection delay={0.2}>
                  <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-6 lg:p-8 border border-white/10">
                    {data.top_artists[1].image_url && (
                      <img
                        src={data.top_artists[1].image_url}
                        alt={data.top_artists[1].name}
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
                        <span className="text-2xl font-bold bg-gradient-to-r from-[#00ffaa] to-[#00ff66] bg-clip-text text-transparent">
                          <AnimatedNumber
                            value={Math.round(data.top_artists[1].minutes / 60)}
                          />
                        </span>
                      </div>
                      <div className="flex justify-between items-baseline border-b border-white/10 pb-3">
                        <span className="text-sm text-white/40">plays</span>
                        <span className="text-xl text-white/80">
                          <AnimatedNumber value={data.top_artists[1].plays} />
                        </span>
                      </div>
                      {data.top_artists[1].top_track && (
                        <div className="pt-2">
                          <p className="text-xs text-white/40 uppercase tracking-wider mb-2">
                            Top Track
                          </p>
                          <p className="text-sm text-white/70 leading-snug">
                            {data.top_artists[1].top_track}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </FadeUpSection>
              )}

              {/* Artist #3 */}
              {data.top_artists[2] && (
                <FadeUpSection delay={0.3}>
                  <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-6 lg:p-8 border border-white/10">
                    {data.top_artists[2].image_url && (
                      <img
                        src={data.top_artists[2].image_url}
                        alt={data.top_artists[2].name}
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
                        <span className="text-2xl font-bold bg-gradient-to-r from-[#0066ff] to-[#9900ff] bg-clip-text text-transparent">
                          <AnimatedNumber
                            value={Math.round(data.top_artists[2].minutes / 60)}
                          />
                        </span>
                      </div>
                      <div className="flex justify-between items-baseline border-b border-white/10 pb-3">
                        <span className="text-sm text-white/40">plays</span>
                        <span className="text-xl text-white/80">
                          <AnimatedNumber value={data.top_artists[2].plays} />
                        </span>
                      </div>
                      {data.top_artists[2].top_track && (
                        <div className="pt-2">
                          <p className="text-xs text-white/40 uppercase tracking-wider mb-2">
                            Top Track
                          </p>
                          <p className="text-sm text-white/70 leading-snug">
                            {data.top_artists[2].top_track}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </FadeUpSection>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Track #1 */}
      <section className="max-h-screen flex items-center px-8 md:px-16 lg:px-24 py-32 relative overflow-visible">
        <div className="absolute inset-0 opacity-30">
          <MeshGradient
            colors={["#ff0099", "#ff6b6b", "#00d9ff"]}
            distortion={0.5}
            speed={0.2}
          />
        </div>
        <div className="max-w-7xl mx-auto w-full relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-16 items-center">
            <div className="lg:col-span-3 relative">
              <p className="text-xs uppercase tracking-[0.3em] text-white/40 mb-8">
                track of your year
              </p>
              <FadeUpSection>
                <AlbumArt
                  releaseMbId={data.top_tracks[0]?.release_mb_id}
                  title={data.top_tracks[0]?.title || "Unknown"}
                  artist={data.top_tracks[0]?.artist || "Unknown"}
                  className="-mb-12 sm:-mb-16 lg:-mb-18 rounded-2xl border border-white/10 shadow-lg w-full max-w-sm lg:max-w-md brightness-85 relative z-0"
                />
              </FadeUpSection>
              <FadeUpSection delay={0.2}>
                <StaggeredText
                  text={data.top_tracks[0]?.title || "Unknown"}
                  className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl 2xl:text-9xl font-bold text-white leading-none mb-6 lg:mb-8 text-shadow-md relative z-10"
                  offset={40}
                  delay={0.1}
                  duration={0.2}
                  staggerDelay={0.12}
                  once={true}
                  as="h2"
                />
              </FadeUpSection>
              <div>
                <FadeUpSection delay={0.4}>
                  <p className="text-lg sm:text-xl md:text-2xl lg:text-3xl text-white/60 lg:mb-2">
                    {data.top_tracks[0]?.artist}{" "}
                  </p>
                </FadeUpSection>
                <FadeUpSection delay={0.4}>
                  <p className="text-lg sm:text-xl md:text-2xl lg:text-3xl text-white/60 mb-8 lg:mb-12">
                    {data.top_tracks[0]?.release_name
                      ? `${data.top_tracks[0].release_name}`
                      : ""}
                  </p>
                </FadeUpSection>
              </div>
            </div>
            <div className="lg:col-span-2">
              <FadeUpSection delay={0.6}>
                <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 lg:p-8 border border-white/10">
                  <p className="text-[4rem] sm:text-[5rem] md:text-[6rem] lg:text-[7rem] xl:text-[8rem] font-bold leading-none bg-gradient-to-br from-[#ff0099] to-[#ff6b6b] bg-clip-text text-transparent mb-4">
                    <AnimatedNumber
                      value={data.top_tracks[0]?.plays || 0}
                      duration={2}
                    />
                  </p>
                  <p className="text-lg sm:text-xl text-white/70 mb-6">
                    total plays
                  </p>
                  <p className="text-sm text-white/40 leading-relaxed">
                    You really couldn't get enough of this one. It's your
                    most-played track of the year.
                  </p>
                </div>
              </FadeUpSection>
            </div>
          </div>
        </div>
      </section>

      {/* Tracks #2 and #3 - Side by Side */}
      {(data.top_tracks[1] || data.top_tracks[2]) && (
        <section className="min-h-screen flex items-center px-8 md:px-16 lg:px-24 py-24 relative overflow-visible">
          <div className="absolute inset-0 opacity-30">
            <MeshGradient
              colors={["#00d9ff", "#ff9500"]}
              distortion={0.5}
              speed={0.2}
            />
          </div>
          <div className="max-w-7xl mx-auto w-full relative z-10">
            <FadeUpSection>
              <p className="text-sm uppercase tracking-[0.3em] text-white/40 mb-12 text-center">
                More Repeat Offenders
              </p>
            </FadeUpSection>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
              {/* Track #2 */}
              {data.top_tracks[1] && (
                <FadeUpSection delay={0.2}>
                  <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-6 lg:p-8 border border-white/10">
                    <AlbumArt
                      releaseMbId={data.top_tracks[1].release_mb_id}
                      title={data.top_tracks[1].title}
                      artist={data.top_tracks[1].artist}
                      className="w-full aspect-square object-cover rounded-2xl mb-6 brightness-85"
                    />
                    <div className="flex items-baseline gap-3 mb-2">
                      <span className="text-4xl font-bold text-white/30">
                        2
                      </span>
                      <h3 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white leading-tight">
                        {data.top_tracks[1].title}
                      </h3>
                    </div>
                    <p className="text-base text-white/50 mb-6">
                      {data.top_tracks[1].artist}
                      {data.top_tracks[1].release_name &&
                        ` · ${data.top_tracks[1].release_name}`}
                    </p>
                    <div className="flex justify-between items-baseline border-t border-white/10 pt-4">
                      <span className="text-sm text-white/40">plays</span>
                      <span className="text-3xl font-bold bg-gradient-to-r from-[#00d9ff] to-[#00ffaa] bg-clip-text text-transparent">
                        <AnimatedNumber value={data.top_tracks[1].plays} />
                      </span>
                    </div>
                  </div>
                </FadeUpSection>
              )}

              {/* Track #3 */}
              {data.top_tracks[2] && (
                <FadeUpSection delay={0.3}>
                  <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-6 lg:p-8 border border-white/10">
                    <AlbumArt
                      releaseMbId={data.top_tracks[2].release_mb_id}
                      title={data.top_tracks[2].title}
                      artist={data.top_tracks[2].artist}
                      className="w-full aspect-square object-cover rounded-2xl mb-6 brightness-85"
                    />
                    <div className="flex items-baseline gap-3 mb-2">
                      <span className="text-4xl font-bold text-white/30">
                        3
                      </span>
                      <h3 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white leading-tight">
                        {data.top_tracks[2].title}
                      </h3>
                    </div>
                    <p className="text-base text-white/50 mb-6">
                      {data.top_tracks[2].artist}
                      {data.top_tracks[2].release_name &&
                        ` · ${data.top_tracks[2].release_name}`}
                    </p>
                    <div className="flex justify-between items-baseline border-t border-white/10 pt-4">
                      <span className="text-sm text-white/40">plays</span>
                      <span className="text-3xl font-bold bg-gradient-to-r from-[#9900ff] to-[#ff9500] bg-clip-text text-transparent">
                        <AnimatedNumber value={data.top_tracks[2].plays} />
                      </span>
                    </div>
                  </div>
                </FadeUpSection>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Top Tracks - Vertical List */}
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
              Your Top Tracks
            </p>
          </FadeUpSection>
          <div className="space-y-6">
            {data.top_tracks.slice(0, 10).map((item, idx) => (
              <FadeUpSection key={idx} delay={idx * 0.1}>
                <div className="flex items-start gap-4 sm:gap-6 md:gap-8 border-b border-white/10 pb-6 relative">
                  <p className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white z-20 pl-1 text-shadow-md min-w-[3rem] sm:min-w-[4rem]">
                    {idx + 1}
                  </p>
                  <AlbumArt
                    releaseMbId={item.release_mb_id}
                    title={item.title}
                    artist={item.artist}
                    className="w-13 h-13 sm:w-20 sm:h-20 rounded-lg object-cover shadow-md absolute brightness-80"
                  />
                  <div className="flex-1 min-w-0">
                    <StaggeredText
                      text={item.title}
                      className="text-xl sm:text-2xl md:text-4xl lg:text-5xl text-white font-medium mb-2"
                      offset={20}
                      delay={0.1 + idx * 0.1}
                      duration={0.08}
                      staggerDelay={0.06}
                      once={true}
                      as="h3"
                    />
                    <p className="text-base sm:text-lg md:text-xl text-white/50">
                      {item.artist}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl sm:text-3xl md:text-4xl font-bold">
                      <AnimatedNumber value={item.plays} duration={1.5} />
                    </p>
                    <p className="text-sm text-white/40 mt-1">plays</p>
                  </div>
                </div>
              </FadeUpSection>
            ))}
          </div>
        </div>
      </section>

      {/* Listening Patterns - Weekday vs Weekend */}
      <section className="min-h-screen flex items-center justify-center mt-20 px-8 py-24 relative overflow-visible">
        <div className="absolute inset-0 opacity-25">
          <Metaballs
            colors={["#00ffaa", "#00d9ff"]}
            count={5}
            size={0.7}
            speed={0.15}
          />
        </div>
        <ParallaxBlob
          className="absolute bottom-0 left-1/4 w-[40rem] h-[40rem] bg-[#00ffaa]/10 rounded-full blur-[160px]"
          speed={0.25}
        />
        <div className="max-w-6xl mx-auto relative z-10">
          <FadeUpSection>
            <p className="text-sm uppercase tracking-[0.3em] text-white/40 mb-16 text-center">
              Your Listening Patterns
            </p>
          </FadeUpSection>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 mb-16 lg:mb-20">
            {/* Weekday */}
            <FadeUpSection delay={0.2}>
              <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-6 lg:p-10 border border-white/10 w-full max-w-sm mx-auto lg:max-w-none">
                <p className="text-sm uppercase tracking-wider text-white/40 mb-6">
                  Weekdays
                </p>
                <div className="mb-6 lg:mb-8">
                  <p className="text-[3rem] sm:text-[4rem] md:text-[5rem] lg:text-[6rem] font-bold leading-none bg-gradient-to-r from-[#0066ff] to-[#00d9ff] bg-clip-text text-transparent mb-2">
                    <AnimatedNumber
                      value={Number((data.weekday_avg_minutes / 60).toFixed(1))}
                      duration={2}
                    />
                  </p>
                  <p className="text-lg sm:text-xl lg:text-2xl text-white/60">
                    avg. hours per day
                  </p>
                </div>
              </div>
            </FadeUpSection>

            {/* Weekend */}
            <FadeUpSection delay={0.4}>
              <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-6 lg:p-10 border border-white/10 w-full max-w-sm mx-auto lg:max-w-none">
                <p className="text-sm uppercase tracking-wider text-white/40 mb-6">
                  Weekends
                </p>
                <div className="mb-6 lg:mb-8">
                  <p className="text-[3rem] sm:text-[4rem] md:text-[5rem] lg:text-[6rem] font-bold leading-none bg-gradient-to-r from-[#00ffaa] to-[#00ff66] bg-clip-text text-transparent mb-2">
                    <AnimatedNumber
                      value={Number((data.weekend_avg_minutes / 60).toFixed(1))}
                      duration={2}
                    />
                  </p>
                  <p className="text-lg sm:text-xl lg:text-2xl text-white/60">
                    avg. hours per day
                  </p>
                </div>
              </div>
            </FadeUpSection>
          </div>

          <FadeUpSection delay={0.6}>
            <div className="text-center">
              <p className="text-base sm:text-lg md:text-xl text-white/50 max-w-2xl mx-auto leading-relaxed px-4">
                {data.weekend_avg_minutes + 60 > data.weekday_avg_minutes ? (
                  <>
                    Weekends are when you really dig in.{" "}
                    {Math.round(
                      ((data.weekend_avg_minutes - data.weekday_avg_minutes) /
                        data.weekday_avg_minutes) *
                        100
                    )}
                    % more listening time on average.
                  </>
                ) : data.weekend_avg_minutes < data.weekday_avg_minutes ? (
                  <>
                    Weekdays are when you really lock in, with{" "}
                    {Math.round(
                      Math.abs(
                        (data.weekend_avg_minutes - data.weekday_avg_minutes) /
                          data.weekday_avg_minutes
                      ) * 100
                    )}
                    % more listening time on average.
                  </>
                ) : (
                  <>
                    You're surprisingly consistent throughout the week. No big
                    spikes on weekends. Nice!
                  </>
                )}
              </p>
            </div>
          </FadeUpSection>
        </div>
      </section>

      {/* Listening Insights - Track Length & Diversity */}
      <section className="min-h-screen flex items-center justify-center px-8 py-24 relative overflow-visible">
        <div className="absolute inset-0 opacity-25">
          <SimplexNoise
            colors={["#ff9500", "#ff6b6b"]}
            softness={0.7}
            speed={0.18}
          />
        </div>
        <ParallaxBlob
          className="absolute top-1/4 left-1/3 w-[36rem] h-[36rem] bg-[#ff9500]/10 rounded-full blur-[140px]"
          speed={0.3}
        />
        <div className="max-w-6xl mx-auto relative z-10">
          <FadeUpSection>
            <p className="text-sm uppercase tracking-[0.3em] text-white/40 mb-16 text-center">
              Deep Cuts
            </p>
          </FadeUpSection>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 mb-16">
            {/* Average Track Length */}
            <FadeUpSection delay={0.2}>
              <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-6 lg:p-10 border border-white/10">
                <p className="text-sm uppercase tracking-wider text-white/40 mb-6">
                  Average Track Length
                </p>
                <div className="mb-6 lg:mb-8">
                  <p className="text-[3rem] sm:text-[4rem] md:text-[5rem] lg:text-[6rem] font-bold leading-none bg-gradient-to-r from-[#ff9500] to-[#ff6b6b] bg-clip-text text-transparent mb-2">
                    <AnimatedNumber
                      value={Math.floor(data.avg_track_length_ms / 60000)}
                      duration={2}
                    />
                    :
                    {String(
                      Math.floor((data.avg_track_length_ms % 60000) / 1000)
                    ).padStart(2, "0")}
                  </p>
                  <p className="text-lg sm:text-xl lg:text-2xl text-white/60">
                    minutes per track
                  </p>
                </div>
                <p className="text-sm text-white/40 leading-relaxed">
                  {data.avg_track_length_ms > 300000
                    ? "Long time 'Abolish The 2 Minute Song' advocate." // i rofl'd when i wrote this - mmatt.net
                    : data.avg_track_length_ms > 210000
                    ? "Right in the sweet spot - classic track lengths."
                    : "Short and sweet - you're in and out of the tunes quickly."}
                </p>
              </div>
            </FadeUpSection>

            {/* Listening Diversity */}
            <FadeUpSection delay={0.4}>
              <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-6 lg:p-10 border border-white/10">
                <p className="text-sm uppercase tracking-wider text-white/40 mb-6">
                  Listening Diversity
                </p>
                <div className="mb-6 lg:mb-8">
                  <p className="text-[3rem] sm:text-[4rem] md:text-[5rem] lg:text-[6rem] font-bold leading-none bg-gradient-to-r from-[#9900ff] to-[#ff0099] bg-clip-text text-transparent mb-2">
                    <AnimatedNumber
                      value={Math.round(data.listening_diversity * 100)}
                      duration={2}
                    />
                    %
                  </p>
                  <p className="text-lg sm:text-xl lg:text-2xl text-white/60">
                    unique tracks
                  </p>
                </div>
                <p className="text-sm text-white/40 leading-relaxed">
                  {data.listening_diversity > 0.7
                    ? "Did some crate digging? Did you find something good?"
                    : data.listening_diversity > 0.4
                    ? "A healthy mix of favorites and fresh discoveries."
                    : "When you find something you love, you play it on loop - sometimes that's all you need."}
                </p>
              </div>
            </FadeUpSection>
          </div>
        </div>
      </section>

      {/* Longest Session */}
      <section className="min-h-screen flex items-center justify-center px-8 py-24 relative overflow-visible">
        <div className="absolute inset-0 opacity-20">
          <Metaballs
            colors={["#00d9ff", "#0066ff"]}
            count={4}
            size={0.9}
            speed={0.15}
          />
        </div>
        <ParallaxBlob
          className="absolute bottom-1/4 right-1/4 w-[40rem] h-[40rem] bg-[#00d9ff]/10 rounded-full blur-[160px]"
          speed={0.35}
        />
        <div className="max-w-4xl mx-auto relative z-10 text-center">
          <FadeUpSection>
            <p className="text-sm uppercase tracking-[0.3em] text-white/40 mb-8">
              Marathon Session
            </p>
          </FadeUpSection>
          <FadeUpSection delay={0.2}>
            <div className="mb-8">
              <span className="text-[5rem] sm:text-[7rem] md:text-[10rem] lg:text-[12rem] font-bold leading-none bg-gradient-to-br from-[#00d9ff] to-[#0066ff] bg-clip-text text-transparent">
                <AnimatedNumber
                  value={Math.floor(data.longest_session_minutes / 60)}
                  duration={2.5}
                />
                h{" "}
                <AnimatedNumber
                  value={data.longest_session_minutes % 60}
                  duration={2}
                />
                m
              </span>
            </div>
          </FadeUpSection>
          <FadeUpSection delay={0.4}>
            <StaggeredText
              text="your longest listening session"
              className="text-xl sm:text-2xl md:text-3xl lg:text-4xl text-white/80"
              offset={30}
              duration={0.12}
              staggerDelay={0.08}
              once={true}
              as="p"
            />
          </FadeUpSection>
          <FadeUpSection delay={0.6}>
            <p className="text-base sm:text-lg text-white/40 mt-8 max-w-xl mx-auto">
              {data.longest_session_minutes >= 300
                ? "Fully immersed in the tunes at all hours of the day."
                : data.longest_session_minutes >= 120
                ? "Was your playlist just too good to stop?"
                : data.longest_session_minutes >= 60
                ? "How was the album? Was it a masterpiece?"
                : "Just a quick listen to get you through the day."}
            </p>
          </FadeUpSection>
        </div>
      </section>

      {/* Music Buddies / Similar Users */}
      {data.similar_users && data.similar_users.length > 0 && (
        <section className="min-h-screen flex items-center justify-center px-8 py-24 relative overflow-visible">
          <div className="absolute inset-0 opacity-25">
            <MeshGradient
              colors={["#00ffaa", "#00d9ff", "#9900ff"]}
              distortion={0.5}
              speed={0.2}
            />
          </div>
          <ParallaxBlob
            className="absolute top-1/3 left-0 w-[32rem] h-[32rem] bg-[#00ffaa]/10 rounded-full blur-[140px]"
            speed={0.25}
          />
          <div className="max-w-5xl mx-auto relative z-10">
            <FadeUpSection>
              <div className="text-center mb-16">
                <p className="text-sm uppercase tracking-[0.3em] text-white/40 mb-8">
                  Your Music Buddies
                </p>
                <StaggeredText
                  text="You're not listening alone"
                  className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl text-white mb-6"
                  offset={30}
                  duration={0.15}
                  staggerDelay={0.1}
                  once={true}
                  as="h2"
                />
                <p className="text-lg sm:text-xl text-white/50 max-w-2xl mx-auto">
                  These listeners share your taste in music
                </p>
              </div>
            </FadeUpSection>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {data.similar_users.slice(0, 3).map((buddy, idx) => (
                <FadeUpSection key={buddy.did} delay={0.2 + idx * 0.15}>
                  <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-6 border border-white/10 h-full">
                    <a
                      href={`https://bsky.app/profile/${buddy.did}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:opacity-80 transition-opacity duration-200"
                    >
                      <div className="flex items-center gap-4 mb-6">
                        {buddy.profile_picture ? (
                          <div className="relative">
                            <img
                              src={buddy.profile_picture}
                              alt={buddy.handle || "Music buddy"}
                              className="w-14 h-14 rounded-full object-cover border-2 border-white/20"
                            />
                            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-gradient-to-br from-[#00ffaa] to-[#00d9ff] flex items-center justify-center text-xs font-bold text-[#0a0a0a]">
                              {idx + 1}
                            </div>
                          </div>
                        ) : (
                          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#00ffaa] to-[#00d9ff] flex items-center justify-center text-2xl font-bold text-[#0a0a0a]">
                            {idx + 1}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-lg font-medium text-white truncate">
                            {buddy.handle
                              ? `@${buddy.handle}`
                              : buddy.did.startsWith("did:")
                              ? `${buddy.did.slice(0, 18)}...`
                              : buddy.did}
                          </p>
                          <p className="text-sm text-white/40">
                            {idx === 0
                              ? "Music twin"
                              : idx === 1
                              ? "Music buddy"
                              : idx === 2
                              ? "Music neighbor"
                              : "Music friend"}
                          </p>
                        </div>
                      </div>
                    </a>
                    <div className="mb-4">
                      <div className="flex items-baseline justify-between mb-2">
                        <span className="text-sm text-white/40">
                          Shared artists
                        </span>
                        <span className="text-2xl font-bold bg-gradient-to-r from-[#00ffaa] to-[#00d9ff] bg-clip-text text-transparent">
                          <AnimatedNumber
                            value={buddy.shared_artist_count}
                            duration={1.5}
                          />
                        </span>
                      </div>
                      <div className="w-full bg-white/10 rounded-full h-2">
                        <motion.div
                          className="bg-gradient-to-r from-[#00ffaa] to-[#00d9ff] h-2 rounded-full"
                          initial={{ width: 0 }}
                          whileInView={{
                            width: `${Math.min(
                              (buddy.shared_artist_count / 20) * 100,
                              100
                            )}%`,
                          }}
                          viewport={{ once: true }}
                          transition={{ duration: 1, delay: 0.5 }}
                        />
                      </div>
                    </div>
                    {buddy.shared_artists.length > 0 && (
                      <div className="pt-4 border-t border-white/10">
                        <p className="text-xs text-white/40 uppercase tracking-wider mb-3">
                          You both love
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {buddy.shared_artists.slice(0, 4).map((artist) => (
                            <span
                              key={artist}
                              className="px-3 py-1 bg-white/10 rounded-full text-sm text-white/70"
                            >
                              {artist}
                            </span>
                          ))}
                          {buddy.shared_artists.length > 4 && (
                            <span className="px-3 py-1 bg-white/5 rounded-full text-sm text-white/40">
                              +{buddy.shared_artists.length - 4} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </FadeUpSection>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Time Patterns - Radial Charts */}
      <section className="min-h-screen flex items-center justify-center px-8 py-24 relative overflow-visible">
        <div className="absolute inset-0 opacity-25">
          <SimplexNoise
            colors={["#ff6b6b", "#ff9500"]}
            softness={0.7}
            speed={0.18}
          />
        </div>
        <ParallaxBlob
          className="absolute top-1/3 right-1/4 w-[36rem] h-[36rem] bg-[#ff9500]/10 rounded-full blur-[140px]"
          speed={0.3}
        />
        <div className="max-w-7xl mx-auto w-full relative z-10">
          <FadeUpSection>
            <p className="text-sm uppercase tracking-[0.3em] text-white/40 mb-16 text-center">
              When You Listen
            </p>
          </FadeUpSection>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16">
            {/* Monthly Radial Chart */}
            <FadeUpSection delay={0.1}>
              <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-6 lg:p-10 border border-white/10">
                <p className="text-xs uppercase tracking-wider text-white/40 mb-8 text-center">
                  Plays by Month
                </p>
                <div className="relative aspect-square max-w-md mx-auto">
                  <svg viewBox="0 0 400 400" className="w-full h-full">
                    {(() => {
                      // Calculate monthly totals
                      const monthlyPlays = Array(12).fill(0);
                      data.activity_graph.forEach((day) => {
                        const month = new Date(day.date).getMonth();
                        monthlyPlays[month] += day.plays;
                      });

                      const maxMonthlyPlays = Math.max(...monthlyPlays);
                      const monthNames = [
                        "Jan",
                        "Feb",
                        "Mar",
                        "Apr",
                        "May",
                        "Jun",
                        "Jul",
                        "Aug",
                        "Sep",
                        "Oct",
                        "Nov",
                        "Dec",
                      ];
                      const centerX = 200;
                      const centerY = 200;
                      const maxRadius = 140;
                      const minRadius = 40;
                      const angleStep = (2 * Math.PI) / 12;

                      return monthlyPlays.map((plays, idx) => {
                        // Skip months with no plays
                        const angle = angleStep * idx - Math.PI / 2; // Start at top
                        const normalizedPlays =
                          maxMonthlyPlays > 0 ? plays / maxMonthlyPlays : 0;
                        const radius =
                          minRadius + normalizedPlays * (maxRadius - minRadius);

                        const x = centerX + radius * Math.cos(angle);
                        const y = centerY + radius * Math.sin(angle);

                        // Calculate petal path
                        const nextAngle = angle + angleStep;
                        const angleOffset = angleStep * 0.4;

                        const x1 = centerX + minRadius * Math.cos(angle);
                        const y1 = centerY + minRadius * Math.sin(angle);
                        const x2 = x;
                        const y2 = y;
                        const x3 =
                          centerX + minRadius * Math.cos(angle + angleStep);
                        const y3 =
                          centerY + minRadius * Math.sin(angle + angleStep);

                        // Control points for smooth curves
                        const midAngle = angle + angleStep / 2;
                        const outerRadius = radius;
                        const ctrlX =
                          centerX + outerRadius * Math.cos(midAngle);
                        const ctrlY =
                          centerY + outerRadius * Math.sin(midAngle);

                        const pathData = `
                          M ${x1} ${y1}
                          L ${x2} ${y2}
                          Q ${ctrlX} ${ctrlY} ${
                          centerX + radius * Math.cos(nextAngle)
                        } ${centerY + radius * Math.sin(nextAngle)}
                          L ${x3} ${y3}
                          A ${minRadius} ${minRadius} 0 0 0 ${x1} ${y1}
                        `;

                        // Label position
                        const labelRadius = maxRadius + 30;
                        const labelX = centerX + labelRadius * Math.cos(angle);
                        const labelY = centerY + labelRadius * Math.sin(angle);

                        return (
                          <g key={idx}>
                            {plays === 0 ? null : (
                              <motion.path
                                d={pathData}
                                fill="#ff9500"
                                opacity={0.7}
                                stroke="rgba(255, 149, 0, 0.5)"
                                strokeWidth="1"
                                initial={{ opacity: 0 }}
                                whileInView={{ opacity: 0.7 }}
                                viewport={{ once: true }}
                                transition={{
                                  delay: idx * 0.05,
                                  duration: 0.6,
                                  ease: "easeOut",
                                }}
                              />
                            )}
                            <motion.text
                              x={labelX}
                              y={labelY}
                              textAnchor="middle"
                              dominantBaseline="middle"
                              className="text-sm fill-white/60"
                              initial={{ opacity: 0 }}
                              whileInView={{ opacity: 1 }}
                              viewport={{ once: true }}
                              transition={{ delay: idx * 0.05 + 0.3 }}
                            >
                              {monthNames[idx]}
                            </motion.text>
                          </g>
                        );
                      });
                    })()}
                  </svg>
                </div>
                <FadeUpSection delay={0.8}>
                  <div className="mt-6 pt-6 border-t border-white/10">
                    <p className="text-sm text-white/50 text-center leading-relaxed">
                      {(() => {
                        const monthlyPlays = Array(12).fill(0);
                        data.activity_graph.forEach((day) => {
                          const month = new Date(day.date).getMonth();
                          monthlyPlays[month] += day.plays;
                        });
                        const maxMonthlyPlays = Math.max(...monthlyPlays);
                        const peakMonth = monthlyPlays.indexOf(maxMonthlyPlays);
                        const monthNames = [
                          "January",
                          "February",
                          "March",
                          "April",
                          "May",
                          "June",
                          "July",
                          "August",
                          "September",
                          "October",
                          "November",
                          "December",
                        ];
                        return `${monthNames[peakMonth]} was your heaviest month`;
                      })()}
                    </p>
                  </div>
                </FadeUpSection>
              </div>
            </FadeUpSection>

            {/* Hourly Radial Chart */}
            <FadeUpSection delay={0.2}>
              <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-6 lg:p-10 border border-white/10">
                <p className="text-xs uppercase tracking-wider text-white/40 mb-8 text-center">
                  Plays by Hour
                </p>
                <div className="relative aspect-square max-w-md mx-auto">
                  <svg viewBox="0 0 400 400" className="w-full h-full">
                    {(() => {
                      const centerX = 200;
                      const centerY = 200;
                      const maxRadius = 140;
                      const minRadius = 40;
                      const angleStep = (2 * Math.PI) / 24;

                      // Convert to local time and create array
                      const localHourlyPlays = data.hourly_distribution.map(
                        (plays, utcHour) => {
                          const localHour =
                            (utcHour -
                              new Date().getTimezoneOffset() / 60 +
                              24) %
                            24;
                          return { hour: localHour, plays };
                        }
                      );

                      // Sort by local hour
                      localHourlyPlays.sort((a, b) => a.hour - b.hour);

                      const maxPlays = Math.max(
                        ...localHourlyPlays.map((h) => h.plays)
                      );

                      return localHourlyPlays.map((hourData, idx) => {
                        const angle = angleStep * idx - Math.PI / 2; // Start at top (midnight)
                        const normalizedPlays =
                          maxPlays > 0 ? hourData.plays / maxPlays : 0;
                        const radius =
                          minRadius + normalizedPlays * (maxRadius - minRadius);

                        const nextAngle = angle + angleStep;

                        const x1 = centerX + minRadius * Math.cos(angle);
                        const y1 = centerY + minRadius * Math.sin(angle);
                        const x2 = centerX + radius * Math.cos(angle);
                        const y2 = centerY + radius * Math.sin(angle);
                        const x3 =
                          centerX + minRadius * Math.cos(angle + angleStep);
                        const y3 =
                          centerY + minRadius * Math.sin(angle + angleStep);

                        const midAngle = angle + angleStep / 2;
                        const outerRadius = radius;
                        const ctrlX =
                          centerX + outerRadius * Math.cos(midAngle);
                        const ctrlY =
                          centerY + outerRadius * Math.sin(midAngle);

                        const pathData = `
                          M ${x1} ${y1}
                          L ${x2} ${y2}
                          Q ${ctrlX} ${ctrlY} ${
                          centerX + radius * Math.cos(nextAngle)
                        } ${centerY + radius * Math.sin(nextAngle)}
                          L ${x3} ${y3}
                          A ${minRadius} ${minRadius} 0 0 0 ${x1} ${y1}
                        `;

                        // Show labels for every 3rd hour (0, 3, 6, 9, 12, 15, 18, 21)
                        const showLabel = hourData.hour % 3 === 0;
                        const labelRadius = maxRadius + 30;
                        const labelX = centerX + labelRadius * Math.cos(angle);
                        const labelY = centerY + labelRadius * Math.sin(angle);
                        const hourLabel =
                          hourData.hour === 0
                            ? "12am"
                            : hourData.hour < 12
                            ? `${hourData.hour}`
                            : hourData.hour === 12
                            ? "12pm"
                            : `${hourData.hour - 12}`;

                        return (
                          <g key={idx}>
                            {hourData.plays === 0 ? null : (
                              <motion.path
                                d={pathData}
                                fill="#00d9ff"
                                opacity={0.7}
                                stroke="rgba(0, 217, 255, 0.5)"
                                strokeWidth="0.5"
                                initial={{ opacity: 0 }}
                                whileInView={{ opacity: 0.7 }}
                                viewport={{ once: true }}
                                transition={{
                                  delay: idx * 0.02,
                                  duration: 0.4,
                                  ease: "easeOut",
                                }}
                              />
                            )}
                            {showLabel && (
                              <motion.text
                                x={labelX}
                                y={labelY}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                className="text-sm fill-white/60"
                                initial={{ opacity: 0 }}
                                whileInView={{ opacity: 1 }}
                                viewport={{ once: true }}
                                transition={{ delay: idx * 0.02 + 0.3 }}
                              >
                                {hourLabel}
                              </motion.text>
                            )}
                          </g>
                        );
                      });
                    })()}
                  </svg>
                </div>
                <FadeUpSection delay={0.8}>
                  <div className="mt-6 pt-6 border-t border-white/10">
                    <p className="text-sm text-white/50 text-center leading-relaxed">
                      {(() => {
                        const maxPlays = Math.max(...data.hourly_distribution);
                        const peakUtcHour =
                          data.hourly_distribution.indexOf(maxPlays);
                        const peakLocalHour =
                          (peakUtcHour -
                            new Date().getTimezoneOffset() / 60 +
                            24) %
                          24;
                        const peakDisplay =
                          peakLocalHour === 0
                            ? "midnight"
                            : peakLocalHour < 12
                            ? `${peakLocalHour}am`
                            : peakLocalHour === 12
                            ? "noon"
                            : `${peakLocalHour - 12}pm`;

                        if (peakLocalHour >= 0 && peakLocalHour < 6) {
                          return `Peak at ${peakDisplay} - late night sessions`;
                        } else if (peakLocalHour >= 6 && peakLocalHour < 12) {
                          return `Peak at ${peakDisplay} - morning energy`;
                        } else if (peakLocalHour >= 12 && peakLocalHour < 18) {
                          return `Peak at ${peakDisplay} - afternoon vibes`;
                        } else {
                          return `Peak at ${peakDisplay} - evening hours`;
                        }
                      })()}
                    </p>
                  </div>
                </FadeUpSection>
              </div>
            </FadeUpSection>
          </div>
        </div>
      </section>

      {/* Listening Streaks */}
      <section className="min-h-[200vh] relative overflow-visible">
        <div className="absolute inset-0 opacity-20">
          <SimplexNoise
            colors={["#00ff66", "#00ffaa"]}
            softness={0.75}
            speed={0.18}
          />
        </div>
        <ParallaxBlob
          className="absolute top-1/2 right-1/4 w-[36rem] h-[36rem] bg-[#00ff66]/10 rounded-full blur-[140px]"
          speed={0.28}
        />
        <div className="sticky top-0 min-h-screen flex items-center justify-center px-8 py-24">
          <div className="max-w-6xl mx-auto w-full relative z-10">
            <FadeUpSection>
              <div className="text-center mb-16">
                <p className="text-sm uppercase tracking-[0.3em] text-white/40 mb-8">
                  Consistency
                </p>
                <div className="mb-8">
                  <span className="text-[6rem] sm:text-[8rem] md:text-[10rem] lg:text-[12rem] xl:text-[14rem] font-bold leading-none bg-gradient-to-r from-[#00ff66] to-[#00ffaa] bg-clip-text text-transparent">
                    <AnimatedNumber
                      value={data.longest_streak}
                      duration={2.5}
                    />
                  </span>
                </div>
                <StaggeredText
                  text="day listening streak"
                  className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl text-white/80"
                  offset={30}
                  delay={0.3}
                  duration={0.12}
                  staggerDelay={0.08}
                  once={true}
                  as="p"
                />
                <p className="text-lg sm:text-xl text-white/40 mt-6 px-4">
                  {data.longest_streak >= 60
                    ? `Some people meditate. You just hit play.`
                    : data.longest_streak >= 30
                    ? `Music isn't background noise for you—it's the soundtrack.`
                    : `Consistency pays off. Keep it going.`}
                </p>
              </div>
            </FadeUpSection>

            <FadeUpSection delay={0.4}>
              <div>
                <p className="text-sm uppercase tracking-wider text-white/40 mb-8">
                  Your {data.year} Activity
                </p>
                {/* Desktop: horizontal layout */}
                <div className="hidden lg:block overflow-x-auto">
                  <div className="inline-flex flex-col gap-1.5 min-w-full justify-center items-center">
                    {/* Month labels */}
                    <div className="flex gap-1.5">
                      <div className="w-8" />
                      {generateCalendarWeeks(
                        data.year,
                        data.activity_graph
                      ).map((week, weekIdx) => {
                        const firstDate = week[0];
                        const isFirstWeekOfMonth = firstDate.getDate() <= 7;
                        const monthNames = [
                          "Jan",
                          "Feb",
                          "Mar",
                          "Apr",
                          "May",
                          "Jun",
                          "Jul",
                          "Aug",
                          "Sep",
                          "Oct",
                          "Nov",
                          "Dec",
                        ];
                        return (
                          <div
                            key={weekIdx}
                            className="w-3.5 text-[10px] text-white/30"
                          >
                            {isFirstWeekOfMonth &&
                              monthNames[firstDate.getMonth()]}
                          </div>
                        );
                      })}
                    </div>
                    {/* Day rows */}
                    {["Mon", "", "Wed", "", "Fri", "", "Sun"].map(
                      (day, dayIdx) => (
                        <div key={dayIdx} className="flex gap-1.5 items-center">
                          <div className="w-8 text-xs text-white/30">{day}</div>
                          {generateCalendarWeeks(
                            data.year,
                            data.activity_graph
                          ).map((week, weekIdx) => {
                            const date = week[dayIdx];
                            const bgColor = getActivityColor(
                              date,
                              data.activity_graph
                            );
                            const activity = data.activity_graph.find(
                              (a) => a.date === date.toISOString().split("T")[0]
                            );
                            return (
                              <motion.div
                                key={weekIdx}
                                className={`w-3.5 h-3.5 rounded-sm ${bgColor}`}
                                initial={{ opacity: 0, scale: 0 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{
                                  duration: 0.2,
                                  delay: 0.4 + weekIdx * 0.005 + dayIdx * 0.01,
                                }}
                                title={`${date.toDateString()}: ${(
                                  (activity?.minutes || 0) / 60
                                ).toFixed(1)} hours`}
                              />
                            );
                          })}
                        </div>
                      )
                    )}
                  </div>
                </div>
                {/* Mobile: vertical scrolling layout */}
                <div className="lg:hidden overflow-x-auto flex justify-center">
                  <div className="inline-flex flex-row gap-1.5">
                    {/* Month labels column */}
                    <div className="flex flex-col gap-1.5">
                      <div className="h-6" />
                      {generateCalendarWeeks(
                        data.year,
                        data.activity_graph
                      ).map((week, weekIdx) => {
                        const firstDate = week[0];
                        const isFirstWeekOfMonth = firstDate.getDate() <= 7;
                        const monthNames = [
                          "Jan",
                          "Feb",
                          "Mar",
                          "Apr",
                          "May",
                          "Jun",
                          "Jul",
                          "Aug",
                          "Sep",
                          "Oct",
                          "Nov",
                          "Dec",
                        ];
                        return (
                          <div
                            key={weekIdx}
                            className="h-3.5 text-[10px] text-white/30 flex items-center pr-2"
                          >
                            {isFirstWeekOfMonth &&
                              monthNames[firstDate.getMonth()]}
                          </div>
                        );
                      })}
                    </div>
                    {/* Day columns */}
                    {["Mon", "", "Wed", "", "Fri", "", "Sun"].map(
                      (day, dayIdx) => (
                        <div key={dayIdx} className="flex flex-col gap-1.5">
                          <div className="h-6 text-xs text-white/30 flex items-center justify-center -rotate-45 -mr-4">
                            {day}
                          </div>
                          {generateCalendarWeeks(
                            data.year,
                            data.activity_graph
                          ).map((week, weekIdx) => {
                            const date = week[dayIdx];
                            const bgColor = getActivityColor(
                              date,
                              data.activity_graph
                            );
                            const activity = data.activity_graph.find(
                              (a) => a.date === date.toISOString().split("T")[0]
                            );
                            return (
                              <motion.div
                                key={weekIdx}
                                className={`w-6 h-6 rounded-sm ${bgColor}`}
                                initial={{ opacity: 0, scale: 0 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{
                                  duration: 0.2,
                                  delay: 0.4 + weekIdx * 0.005 + dayIdx * 0.01,
                                }}
                                title={`${date.toDateString()}: ${(
                                  (activity?.minutes || 0) / 60
                                ).toFixed(1)} hours`}
                              />
                            );
                          })}
                        </div>
                      )
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-8 justify-end">
                  <span className="text-xs text-white/30">Less</span>
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-white/5" />
                    <div className="w-3 h-3 rounded-sm bg-[#00ff66]/20" />
                    <div className="w-3 h-3 rounded-sm bg-[#00ff66]/40" />
                    <div className="w-3 h-3 rounded-sm bg-[#00ff66]/70" />
                    <div className="w-3 h-3 rounded-sm bg-[#00ff66]" />
                  </div>
                  <span className="text-xs text-white/30">More</span>
                </div>
              </div>
            </FadeUpSection>

            <FadeUpSection delay={0.6}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8 mt-12 max-w-4xl mx-auto">
                <div className="text-center">
                  <p className="text-3xl sm:text-4xl md:text-5xl font-bold text-white/80 mb-2">
                    <AnimatedNumber value={data.days_active} duration={1.5} />
                  </p>
                  <p className="text-sm text-white/40 uppercase tracking-wider">
                    days active
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-3xl sm:text-4xl md:text-5xl font-bold bg-gradient-to-r from-[#00ff66] to-[#00ffaa] bg-clip-text text-transparent mb-2">
                    <AnimatedNumber
                      value={data.longest_streak}
                      duration={1.5}
                    />
                  </p>
                  <p className="text-sm text-white/40 uppercase tracking-wider">
                    longest streak
                  </p>
                </div>
              </div>
            </FadeUpSection>
          </div>
        </div>
      </section>

      {/* Top 3 Dominance */}
      <section className="min-h-screen -mt-200 flex items-center justify-center px-8 py-24 relative overflow-visible">
        <div className="absolute inset-0 opacity-25">
          <SimplexNoise
            colors={["#9900ff", "#ff0099"]}
            softness={0.7}
            speed={0.2}
          />
        </div>
        <ParallaxBlob
          className="absolute top-1/3 left-0 w-[32rem] h-[32rem] bg-[#9900ff]/10 rounded-full blur-[140px]"
          speed={0.3}
        />
        <div className="max-w-5xl mx-auto relative z-10">
          <FadeUpSection>
            <div className="text-center mb-16">
              <p className="text-sm uppercase tracking-[0.3em] text-white/40 mb-8">
                The Big Three
              </p>
              <div className="flex justify-center items-baseline gap-6 mb-8">
                <span className="text-[6rem] sm:text-[8rem] md:text-[10rem] lg:text-[12rem] xl:text-[14rem] font-bold leading-none bg-gradient-to-br from-[#9900ff] to-[#ff0099] bg-clip-text text-transparent">
                  <AnimatedNumber
                    value={Math.round(
                      (data.top_artists
                        .slice(0, 3)
                        .reduce((acc, a) => acc + a.minutes, 0) /
                        data.total_minutes) *
                        100
                    )}
                    duration={2}
                  />
                  %
                </span>
              </div>
              <p className="text-xl sm:text-2xl md:text-3xl text-white/70 max-w-2xl mx-auto leading-relaxed mb-8 lg:mb-12 px-4">
                of your listening went to just three artists
              </p>
            </div>
          </FadeUpSection>
          <FadeUpSection delay={0.4}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {data.top_artists.slice(0, 3).map((artist, idx) => (
                <div
                  key={idx}
                  className="bg-white/5 backdrop-blur-sm rounded-2xl overflow-visible border border-white/10"
                >
                  {artist.image_url && (
                    <div className="relative w-full aspect-square overflow-visible">
                      <img
                        src={artist.image_url}
                        alt={artist.name}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/60 to-transparent" />
                      <div className="absolute top-4 left-4 text-4xl sm:text-5xl lg:text-6xl font-bold text-white/90">
                        {idx + 1}
                      </div>
                    </div>
                  )}
                  <div className="p-6 lg:p-8">
                    {!artist.image_url && (
                      <div className="text-6xl md:text-7xl font-bold text-white/20 mb-4">
                        {idx + 1}
                      </div>
                    )}
                    <StaggeredText
                      text={artist.name}
                      className="text-xl sm:text-2xl lg:text-3xl font-bold text-white mb-4"
                      offset={20}
                      delay={0.4 + idx * 0.1}
                      duration={0.1}
                      staggerDelay={0.06}
                      once={true}
                      as="h3"
                    />
                    <div className="space-y-2">
                      <div className="flex justify-between items-baseline">
                        <span className="text-sm text-white/40">hours</span>
                        <span className="text-lg sm:text-xl font-bold bg-gradient-to-r from-[#9900ff] to-[#ff0099] bg-clip-text text-transparent">
                          <AnimatedNumber
                            value={Math.round(artist.minutes / 60)}
                            duration={1.5}
                          />
                        </span>
                      </div>
                      <div className="flex justify-between items-baseline">
                        <span className="text-sm text-white/40">plays</span>
                        <span className="text-base sm:text-lg text-white/60">
                          <AnimatedNumber value={artist.plays} duration={1.5} />
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </FadeUpSection>
          <FadeUpSection delay={0.8}>
            <p className="text-base sm:text-lg text-white/50 text-center mt-8 lg:mt-12 max-w-2xl mx-auto px-4">
              {Math.round(
                (data.top_artists
                  .slice(0, 3)
                  .reduce((acc, a) => acc + a.minutes, 0) /
                  data.total_minutes) *
                  100
              ) >= 25
                ? "You know what you like, and you really commit to it."
                : "Focused, but still leaving room for discovery."}
            </p>
          </FadeUpSection>
        </div>
      </section>

      {/* Ending - Personal Moment */}
      <section className="min-h-screen flex items-center justify-center px-8 relative overflow-visible">
        <div className="absolute inset-0 opacity-20">
          <MeshGradient
            colors={["#00d9ff", "#00ffaa", "#0066ff"]}
            distortion={0.4}
            speed={0.15}
          />
        </div>
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <FadeUpSection>
            <p className="text-sm uppercase tracking-[0.3em] text-white/40 mb-12">
              Your {data.year}
            </p>
          </FadeUpSection>
          <FadeUpSection delay={0.2}>
            <StaggeredText
              text={`${Math.round(data.total_minutes / 60)} hours.`}
              className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl text-white/90 mb-6 font-light"
              offset={30}
              delay={0.1}
              duration={0.15}
              staggerDelay={0.1}
              once={true}
              as="p"
            />
          </FadeUpSection>
          <FadeUpSection delay={0.4}>
            <StaggeredText
              text={`${data.total_plays} tracks played.`}
              className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl text-white/90 mb-6 font-light"
              offset={30}
              delay={0.1}
              duration={0.15}
              staggerDelay={0.1}
              once={true}
              as="p"
            />
          </FadeUpSection>
          <FadeUpSection delay={0.6}>
            <StaggeredText
              text="Endless discovery."
              className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl text-white/90 mb-12 lg:mb-16 font-light"
              offset={30}
              delay={0.1}
              duration={0.15}
              staggerDelay={0.1}
              once={true}
              as="p"
            />
          </FadeUpSection>
          <FadeUpSection delay={0.8}>
            <p className="text-lg sm:text-xl md:text-2xl text-white/50 leading-relaxed max-w-2xl mx-auto px-4 mb-12">
              Thanks for making 2025 unforgettable.
              <br />-{" "}
              <span className="font-hand hover:text-white/80 transition-colors duration-200">
                <a
                  href="https://bsky.app/profile/did:plc:tas6hj2xjrqben5653v5kohk"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Matt
                </a>
              </span>{" "}
              and{" "}
              <span className="font-hand hover:text-white/80 transition-colors duration-200">
                <a
                  href="https://bsky.app/profile/did:plc:k644h4rq5bjfzcetgsa6tuby"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Natalie
                </a>
              </span>
            </p>
          </FadeUpSection>

          {/* Share buttons */}
          <FadeUpSection delay={1.0}>
            <div className="flex flex-wrap gap-4 justify-center">
              <button
                onClick={() =>
                  generateShareImage(
                    // @ts-ignore
                    topStatsCardRef,
                    `wrapped-${data.year}-stats.png`
                  )
                }
                disabled={generatingImage}
                className="px-6 py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-full text-white text-sm uppercase tracking-wider transition-colors disabled:opacity-50"
              >
                Share Stats
              </button>
              <button
                onClick={() =>
                  generateShareImage(
                    // @ts-ignore
                    topArtistCardRef,
                    `wrapped-${data.year}-artist.png`
                  )
                }
                disabled={generatingImage}
                className="px-6 py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-full text-white text-sm uppercase tracking-wider transition-colors disabled:opacity-50"
              >
                Share Top Artist
              </button>
              <button
                onClick={() =>
                  generateShareImage(
                    // @ts-ignore
                    activityCardRef,
                    `wrapped-${data.year}-activity.png`
                  )
                }
                disabled={generatingImage}
                className="px-6 py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-full text-white text-sm uppercase tracking-wider transition-colors disabled:opacity-50"
              >
                Share Activity
              </button>
              <button
                onClick={() =>
                  generateShareImage(
                    // @ts-ignore
                    overallCardRef,
                    `wrapped-${data.year}-overall.png`
                  )
                }
                disabled={generatingImage}
                className="px-6 py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-full text-white text-sm uppercase tracking-wider transition-colors disabled:opacity-50"
              >
                Share Overall
              </button>
            </div>
          </FadeUpSection>
        </div>
      </section>

      {process.env.NODE_ENV === "development" && (
        // Share cards - visible for development
        <section className="py-24 px-8 bg-[#0a0a0a]">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-4xl font-bold text-white mb-12">
              Share Cards Preview
            </h2>
            <div className="space-y-12">
              {/* Top Stats Card */}
              <div>
                <h3 className="text-white text-xl mb-4">
                  Top Stats (1080x1080)
                </h3>
                <div
                  ref={topStatsCardRef}
                  className="w-[1080px] h-[1080px] bg-[#0a0a0a] p-16 flex flex-col justify-between border  border-white/20 rounded-4xl"
                  style={{
                    transform: "scale(0.5)",
                    transformOrigin: "top left",
                  }}
                >
                  <div>
                    <p className="text-3xl uppercase tracking-[0.3em] text-white/40 mb-12">
                      {data.year} Wrapped
                    </p>
                    <h2 className="text-9xl font-bold text-white mb-4">
                      {Math.round(data.total_minutes).toLocaleString()}
                    </h2>
                    <p className="text-5xl text-white/80 mb-24">
                      minutes of music
                    </p>

                    <div className="space-y-8">
                      <div className="flex justify-between items-baseline border-b border-white/10 pb-6">
                        <span className="text-3xl text-white/60">
                          Total plays
                        </span>
                        <span className="text-5xl font-bold text-white">
                          {data.total_plays.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between items-baseline border-b border-white/10 pb-6">
                        <span className="text-3xl text-white/60">
                          Artists played
                        </span>
                        <span
                          className="text-5xl font-bold"
                          style={{ color: "#00ffaa" }}
                        >
                          {data.new_artists_count}
                        </span>
                      </div>
                      <div className="flex justify-between items-baseline border-b border-white/10 pb-6">
                        <span className="text-3xl text-white/60">
                          Longest streak
                        </span>
                        <span
                          className="text-5xl font-bold"
                          style={{ color: "#ff0099" }}
                        >
                          {data.longest_streak} days
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {data.profile_picture && (
                        <img
                          src={data.profile_picture}
                          alt={handle}
                          className="w-12 h-12 rounded-full border border-white/20"
                        />
                      )}
                      <p className="text-2xl text-white/60">@{handle}</p>
                    </div>
                    <p className="text-2xl text-white/40">
                      yearinmusic.teal.fm
                    </p>
                  </div>
                </div>
              </div>

              {/* Top Artist Card */}
              <div>
                <h3 className="text-white text-xl mb-4">
                  Top Artist (1080x1080)
                </h3>
                <div
                  ref={topArtistCardRef}
                  className="w-[1080px] h-[1080px] bg-[#0a0a0a] p-16 flex flex-col border  border-white/20 rounded-4xl"
                  style={{
                    transform: "scale(0.5)",
                    transformOrigin: "top left",
                  }}
                >
                  <div>
                    <p className="text-3xl uppercase tracking-[0.3em] text-white/40 mb-12">
                      Your Top Artist · {data.year}
                    </p>
                  </div>

                  <div className="flex-1 flex flex-col justify-center mt-12">
                    {data.top_artists[0]?.image_url && (
                      <img
                        src={data.top_artists[0].image_url}
                        alt={data.top_artists[0].name}
                        className="w-96 h-96 object-cover rounded-3xl mx-auto mb-12 brightness-90 scale-150 -z-20"
                      />
                    )}
                    <h2 className="text-7xl font-bold text-white text-center mb-16 leading-tight text-shadow-lg">
                      {data.top_artists[0]?.name}
                    </h2>

                    <div className="flex gap-16 justify-center">
                      <div className="text-center">
                        <p
                          className="text-6xl font-bold mb-3"
                          style={{ color: "#00d9ff" }}
                        >
                          {Math.round(data.top_artists[0]?.minutes || 0)}
                        </p>
                        <p className="text-2xl text-white/60">
                          minutes listened
                        </p>
                      </div>
                      <div className="text-center">
                        <p
                          className="text-6xl font-bold mb-3"
                          style={{ color: "#ff0099" }}
                        >
                          {data.top_artists[0]?.plays || 0}
                        </p>
                        <p className="text-2xl text-white/60">tracks played</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {data.profile_picture && (
                        <img
                          src={data.profile_picture}
                          alt={handle}
                          className="w-12 h-12 rounded-full border border-white/20"
                        />
                      )}
                      <p className="text-2xl text-white/60">@{handle}</p>
                    </div>
                    <p className="text-2xl text-white/40">
                      yearinmusic.teal.fm
                    </p>
                  </div>
                </div>
              </div>

              {/* Activity Graph Card */}
              <div>
                <h3 className="text-white text-xl mb-4">
                  Activity (1920x1080)
                </h3>
                <div
                  ref={activityCardRef}
                  className="w-[1920px] h-[1080px] bg-[#0a0a0a] p-16 flex flex-col border border-white/20 rounded-4xl"
                  style={{
                    transform: "scale(0.4)",
                    transformOrigin: "top left",
                  }}
                >
                  <div>
                    <p className="text-3xl uppercase tracking-[0.3em] text-white/40">
                      {data.year} Activity
                    </p>
                  </div>

                  <div className="flex-1 flex flex-col justify-center">
                    {shouldSplitActivityGraph(
                      data.year,
                      data.activity_graph
                    ) ? (
                      /* Split into two rows for full year */
                      <div className="flex flex-col items-center">
                        {/* First half - Jan to Jun */}
                        <div className="bg-white/5 rounded-3xl p-8 pt-4 border max-w-min border-white/10">
                          <div className="inline-flex flex-col gap-1.5 min-w-full justify-center items-center">
                            {/* Month labels */}
                            <div className="flex gap-1.5">
                              <div className="w-6" />
                              {generateCalendarWeeks(
                                data.year,
                                data.activity_graph,
                                1,
                                6
                              ).map((week, weekIdx) => {
                                const firstDate = week[0];
                                const isFirstWeekOfMonth =
                                  firstDate.getDate() <= 7;
                                const monthNames = [
                                  "Jan",
                                  "Feb",
                                  "Mar",
                                  "Apr",
                                  "May",
                                  "Jun",
                                ];
                                return (
                                  <div
                                    key={weekIdx}
                                    className="w-8 text-lg text-white/30"
                                  >
                                    {isFirstWeekOfMonth &&
                                      monthNames[firstDate.getMonth()]}
                                  </div>
                                );
                              })}
                            </div>
                            {/* Day rows */}
                            {["Mon", "", "Wed", "", "Fri", "", "Sun"].map(
                              (day, dayIdx) => (
                                <div
                                  key={dayIdx}
                                  className="flex gap-1.5 items-center"
                                >
                                  <div className="w-8 text-sm text-white/30">
                                    {day}
                                  </div>
                                  {generateCalendarWeeks(
                                    data.year,
                                    data.activity_graph,
                                    1,
                                    6
                                  ).map((week, weekIdx) => {
                                    const date = week[dayIdx];
                                    const bgColor = getActivityColor(
                                      date,
                                      data.activity_graph
                                    );
                                    const activity = data.activity_graph.find(
                                      (a) =>
                                        a.date ===
                                        date.toISOString().split("T")[0]
                                    );
                                    return (
                                      <div
                                        key={weekIdx}
                                        className={`w-8 h-8 rounded ${bgColor}`}
                                        title={`${date.toDateString()}: ${(
                                          (activity?.minutes || 0) / 60
                                        ).toFixed(1)} hours`}
                                      />
                                    );
                                  })}
                                </div>
                              )
                            )}
                            <div className="h-2" />
                            <div className="flex gap-1.5">
                              <div className="w-6" />
                              {generateCalendarWeeks(
                                data.year,
                                data.activity_graph,
                                7,
                                12
                              ).map((week, weekIdx) => {
                                const firstDate = week[0];
                                const isFirstWeekOfMonth =
                                  firstDate.getDate() <= 7;
                                const monthNames = [
                                  "",
                                  "",
                                  "",
                                  "",
                                  "",
                                  "",
                                  "Jul",
                                  "Aug",
                                  "Sep",
                                  "Oct",
                                  "Nov",
                                  "Dec",
                                ];
                                return (
                                  <div
                                    key={weekIdx}
                                    className="w-8 text-lg text-white/30"
                                  >
                                    {isFirstWeekOfMonth &&
                                      monthNames[firstDate.getMonth()]}
                                  </div>
                                );
                              })}
                            </div>
                            {/* Day rows */}
                            {["Mon", "", "Wed", "", "Fri", "", "Sun"].map(
                              (day, dayIdx) => (
                                <div
                                  key={dayIdx}
                                  className="flex gap-1.5 items-center"
                                >
                                  <div className="w-8 text-sm text-white/30">
                                    {day}
                                  </div>
                                  {generateCalendarWeeks(
                                    data.year,
                                    data.activity_graph,
                                    7,
                                    12
                                  ).map((week, weekIdx) => {
                                    const date = week[dayIdx];
                                    const bgColor = getActivityColor(
                                      date,
                                      data.activity_graph
                                    );
                                    const activity = data.activity_graph.find(
                                      (a) =>
                                        a.date ===
                                        date.toISOString().split("T")[0]
                                    );
                                    return (
                                      <div
                                        key={weekIdx}
                                        className={`w-8 h-8 rounded ${bgColor}`}
                                        title={`${date.toDateString()}: ${(
                                          (activity?.minutes || 0) / 60
                                        ).toFixed(1)} hours`}
                                      />
                                    );
                                  })}
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Single row for shorter activity periods */
                      <div className="bg-white/5 rounded-3xl p-12 border border-white/10">
                        <div className="inline-flex flex-col gap-1.5 min-w-full justify-center items-center">
                          {/* Month labels */}
                          <div className="flex gap-1.5">
                            <div className="w-8" />
                            {generateCalendarWeeks(
                              data.year,
                              data.activity_graph
                            ).map((week, weekIdx) => {
                              const firstDate = week[0];
                              const isFirstWeekOfMonth =
                                firstDate.getDate() <= 7;
                              const monthNames = [
                                "Jan",
                                "Feb",
                                "Mar",
                                "Apr",
                                "May",
                                "Jun",
                                "Jul",
                                "Aug",
                                "Sep",
                                "Oct",
                                "Nov",
                                "Dec",
                              ];
                              return (
                                <div
                                  key={weekIdx}
                                  className="w-8 text-2xl -rotate-25 pl-4 text-white/30"
                                >
                                  {isFirstWeekOfMonth &&
                                    monthNames[firstDate.getMonth()]}
                                </div>
                              );
                            })}
                          </div>
                          {/* Day rows */}
                          {["Mon", "", "Wed", "", "Fri", "", "Sun"].map(
                            (day, dayIdx) => (
                              <div
                                key={dayIdx}
                                className="flex gap-1.5 items-center"
                              >
                                <div className="w-12 text-lg text-white/30">
                                  {day}
                                </div>
                                {generateCalendarWeeks(
                                  data.year,
                                  data.activity_graph
                                ).map((week, weekIdx) => {
                                  const date = week[dayIdx];
                                  const bgColor = getActivityColor(
                                    date,
                                    data.activity_graph
                                  );
                                  const activity = data.activity_graph.find(
                                    (a) =>
                                      a.date ===
                                      date.toISOString().split("T")[0]
                                  );
                                  return (
                                    <div
                                      key={weekIdx}
                                      className={`w-8 h-8 rounded ${bgColor}`}
                                      title={`${date.toDateString()}: ${(
                                        (activity?.minutes || 0) / 60
                                      ).toFixed(1)} hours`}
                                    />
                                  );
                                })}
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    )}

                    <div className="mt-16 text-center">
                      <p className="text-5xl font-bold text-white mb-6">
                        {data.days_active} days active
                      </p>
                      <p className="text-3xl text-white/60">
                        {data.longest_streak} day streak
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {data.profile_picture && (
                        <img
                          src={data.profile_picture}
                          alt={handle}
                          className="w-12 h-12 rounded-full border border-white/20"
                        />
                      )}
                      <p className="text-2xl text-white/60">@{handle}</p>
                    </div>
                    <p className="text-2xl text-white/40">
                      yearinmusic.teal.fm
                    </p>
                  </div>
                </div>
              </div>

              {/* Overall Card */}
              <div>
                <h3 className="text-white text-xl mb-4">
                  Overall Top 5s (1080x1080)
                </h3>
                <div
                  ref={overallCardRef}
                  className="w-[1080px] h-[1440px] bg-[#0a0a0a] p-16 flex flex-col border  border-white/20 rounded-4xl relative"
                  style={{
                    transform: "scale(0.5)",
                    transformOrigin: "top left",
                  }}
                >
                  {data.top_artists[0]?.image_url && (
                    <div className="absolute w-full -m-16 -z-10">
                      <img
                        src={data.top_artists[0].image_url}
                        alt={data.top_artists[0].name}
                        className="aspect-square w-full object-cover rounded-2xl absolute top-0 left-0 -z-20"
                      />
                      <div
                        className="aspect-square w-full rounded-2xl absolute top-0 left-0 pointer-events-none z-20"
                        style={{
                          background:
                            "linear-gradient(#0a0a0a, #0a0a0a70, transparent, #0a0a0a70, #0a0a0ac0, #0a0a0a)",
                        }}
                      />
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-4 mb-4">
                      {data.profile_picture && (
                        <img
                          src={data.profile_picture}
                          alt={handle}
                          className="w-14 h-14 rounded-full border-2 opacity-75 border-white/20"
                        />
                      )}
                      <p className="text-3xl text-white/40">@{handle}'s</p>
                    </div>
                    <p className="text-3xl uppercase tracking-[0.3em] text-white/40 mb-8">
                      {data.year} year in music
                    </p>
                  </div>
                  <div className="flex-1 flex flex-col justify-end z-10">
                    <div className="grid grid-cols-2">
                      <div>
                        <h2 className="text-9xl font-semibold text-white/75 text-shadow-lg ml-4">
                          {Math.round(data.total_minutes).toLocaleString()}
                        </h2>
                        <p className="text-5xl text-white/80 mb-8 ml-4">
                          minutes listened
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2">
                      <div className="ml-4">
                        <h3 className="text-4xl text-white/70 mb-8">Artists</h3>
                        <ol className="list-decimal list-outside ml-6 space-y-4 text-white text-xl">
                          {data.top_artists.slice(0, 5).map((artist, idx) => (
                            <li key={idx} className="font-medium text-4xl">
                              {artist.name}
                              <p className="text-xl text-white/50">
                                {artist.plays} plays
                              </p>
                            </li>
                          ))}
                        </ol>
                      </div>
                      <div>
                        <h3 className="text-4xl text-white/70 mb-8">Tracks</h3>
                        <ol className="list-decimal list-outside ml-6 space-y-4 text-white text-xl">
                          {data.top_tracks.slice(0, 5).map((t, idx) => (
                            <li key={idx} className="font-medium text-4xl">
                              {t.title}
                              <p className="text-xl text-white/50">
                                {t.artist}
                              </p>
                            </li>
                          ))}
                        </ol>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-8">
                    <p className="text-2xl text-white/40">
                      yearinmusic.teal.fm
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
