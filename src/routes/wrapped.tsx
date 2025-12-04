import { createFileRoute } from "@tanstack/react-router";
import { motion, useInView, useScroll, useTransform } from "framer-motion";
import { useRef, useEffect, useState } from "react";
import {
  MeshGradient,
  Metaballs,
  SimplexNoise,
} from "@paper-design/shaders-react";
import StaggeredText from "@/components/StaggeredText";

interface WrappedData {
  year: number;
  total_hours: number;
  top_artists: Array<{
    name: string;
    plays: number;
    hours: number;
    mb_id?: string;
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
    hours: number;
  }>;
  weekday_avg_hours: number;
  weekend_avg_hours: number;
  longest_streak: number;
  days_active: number;
  similar_users?: Array<string>;
}

export const Route = createFileRoute("/wrapped")({
  component: WrappedPage,
});

function getActivityColor(
  date: Date,
  activityData: Array<{ date: string; plays: number; hours: number }>,
): string {
  const dateStr = date.toISOString().split("T")[0];
  const activity = activityData.find((a) => a.date === dateStr);

  if (!activity) return "bg-white/5";

  // Color based on hours listened
  if (activity.hours >= 8) return "bg-[#00ff66]";
  if (activity.hours >= 5) return "bg-[#00ff66]/70";
  if (activity.hours >= 2) return "bg-[#00ff66]/40";
  if (activity.hours >= 0.5) return "bg-[#00ff66]/20";
  return "bg-white/5";
}

function generateCalendarDates(year: number): Date[] {
  const dates: Date[] = [];
  const startDate = new Date(`${year}-01-01`);
  let currentDate = new Date(startDate);

  while (currentDate.getFullYear() === year) {
    dates.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return dates;
}

function AnimatedNumber({
  value,
  duration = 2,
}: {
  value: number;
  duration?: number;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

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
  const isInView = useInView(ref, { once: true, margin: "-100px" });

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

function WrappedPage() {
  const [data, setData] = useState<WrappedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const did =
          localStorage.getItem("user_did") ||
          "did:plc:k644h4rq5bjfzcetgsa6tuby";
        const year = new Date().getFullYear();
        const response = await fetch(
          `http://localhost:3001/api/wrapped/${year}?did=${did}`,
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
  }, []);

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
      <section className="min-h-screen flex items-center justify-center relative overflow-hidden">
        <div className="relative px-8">
          <motion.p
            className="text-3xl uppercase tracking-[0.3em] text-white -mb-40 text-center relative z-10"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.6 }}
          >
            Your Year in Music
          </motion.p>
          <motion.h1
            className="text-[12rem] md:text-[20rem] lg:text-[28rem] font-bold leading-none bg-gradient-to-br from-[#00d9ff] via-[#0066ff] to-[#9900ff] bg-clip-text text-transparent text-center relative z-0"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: 1.2,
              ease: [0.34, 0.8, 0.64, 1],
            }}
          >
            {data.year}
          </motion.h1>
        </div>
      </section>

      {/* Hours Stat - Big Impact */}
      <section className="min-h-screen flex items-center justify-center px-8 relative overflow-hidden">
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
              <span className="text-[8rem] md:text-[12rem] lg:text-[16rem] font-bold leading-none bg-gradient-to-r from-[#00ffaa] to-[#00ff66] bg-clip-text text-transparent">
                <AnimatedNumber
                  value={Math.round(data.total_hours)}
                  duration={2.5}
                />
              </span>
            </div>
          </FadeUpSection>
          <FadeUpSection delay={0.4}>
            <StaggeredText
              text="hours of music"
              className="text-4xl md:text-6xl text-white/80"
              offset={30}
              duration={0.15}
              staggerDelay={0.12}
              once={true}
              as="p"
            />
          </FadeUpSection>
          <FadeUpSection delay={0.6}>
            <p className="text-lg md:text-xl text-white/40 mt-6 max-w-md">
              That's 51 days straight. You could've walked to Tokyo.
            </p>
          </FadeUpSection>
        </div>
      </section>

      {/* Top Artist - Editorial Layout */}
      <section className="min-h-screen flex items-center px-8 md:px-16 lg:px-24 relative overflow-hidden">
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <FadeUpSection>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-white/40 mb-8">
                  Your Top Artist
                </p>
                <StaggeredText
                  text={data.top_artists[0]?.name || "Unknown"}
                  className="text-7xl md:text-8xl lg:text-9xl font-bold text-white leading-[0.9] mb-12"
                  offset={40}
                  delay={0.2}
                  duration={0.2}
                  staggerDelay={0.15}
                  once={true}
                  as="h2"
                />
              </div>
            </FadeUpSection>
            <div className="space-y-8">
              <FadeUpSection delay={0.2}>
                <div className="border-l-4 border-[#00d9ff] pl-8">
                  <p className="text-6xl md:text-7xl font-bold bg-gradient-to-r from-[#00d9ff] to-[#0066ff] bg-clip-text text-transparent">
                    <AnimatedNumber
                      value={Math.round(data.top_artists[0]?.hours || 0)}
                    />
                  </p>
                  <p className="text-xl text-white/60 mt-2">hours played</p>
                </div>
              </FadeUpSection>
              <FadeUpSection delay={0.3}>
                <div className="border-l-4 border-[#ff0099] pl-8">
                  <p className="text-6xl md:text-7xl font-bold bg-gradient-to-r from-[#ff0099] to-[#9900ff] bg-clip-text text-transparent">
                    <AnimatedNumber value={data.top_artists[0]?.plays || 0} />
                  </p>
                  <p className="text-xl text-white/60 mt-2">plays</p>
                </div>
              </FadeUpSection>
              <FadeUpSection delay={0.4}>
                <div className="pl-8 pt-8 border-t border-white/10">
                  <p className="text-sm text-white/40 uppercase tracking-widest mb-3">
                    Most Played Track
                  </p>
                  <StaggeredText
                    text={data.top_artists[0]?.top_track || "Unknown"}
                    className="text-2xl md:text-3xl text-white font-medium"
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
                                60,
                            )}
                            m{" "}
                            {String(
                              Math.floor(
                                ((data.top_artists[0].top_track_duration_ms *
                                  data.top_artists[0].top_track_plays) /
                                  1000) %
                                  60,
                              ),
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

      {/* Discovery - Asymmetric */}
      <section className="min-h-screen flex items-end pb-24 px-8 md:px-16 lg:px-24 relative overflow-hidden">
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
          <FadeUpSection>
            <div className="max-w-3xl ml-auto">
              <div className="flex items-baseline gap-8 mb-8">
                <span className="text-[10rem] md:text-[14rem] font-bold leading-none bg-gradient-to-br from-[#ff6b6b] to-[#ff9500] bg-clip-text text-transparent">
                  <AnimatedNumber value={data.new_artists_count} duration={2} />
                </span>
                <div>
                  <p className="text-3xl md:text-5xl text-white mb-3">
                    new artists
                  </p>
                  <p className="text-lg text-white/40">discovered this year</p>
                </div>
              </div>
              <p className="text-xl md:text-2xl text-white/60 leading-relaxed">
                You're always hunting for something fresh. That's a lot of new
                sounds.
              </p>
            </div>
          </FadeUpSection>
        </div>
      </section>

      {/* Top Tracks - Vertical List */}
      <section className="min-h-screen flex items-center px-8 md:px-16 lg:px-24 py-24 relative overflow-hidden">
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
              Your Top 5 Tracks
            </p>
          </FadeUpSection>
          <div className="space-y-12">
            {data.top_tracks.slice(0, 5).map((item, idx) => (
              <FadeUpSection key={idx} delay={idx * 0.1}>
                <div className="flex items-baseline gap-6 md:gap-12 border-b border-white/10 pb-6">
                  <span className="text-5xl md:text-7xl font-bold text-white/20 min-w-[4rem]">
                    {idx + 1}
                  </span>
                  <div className="flex-1">
                    <StaggeredText
                      text={item.title}
                      className="text-3xl md:text-5xl text-white font-medium mb-2"
                      offset={20}
                      delay={0.1 + idx * 0.1}
                      duration={0.08}
                      staggerDelay={0.06}
                      once={true}
                      as="h3"
                    />
                    <p className="text-lg md:text-xl text-white/50">
                      {item.artist}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-[#00d9ff] to-[#9900ff] bg-clip-text text-transparent">
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
      <section className="min-h-screen flex items-center justify-center px-8 py-24 relative overflow-hidden">
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
              Your Listening Rhythm
            </p>
          </FadeUpSection>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 mb-20">
            {/* Weekday */}
            <FadeUpSection delay={0.2}>
              <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-10 border border-white/10">
                <p className="text-sm uppercase tracking-wider text-white/40 mb-6">
                  Weekdays
                </p>
                <div className="mb-8">
                  <p className="text-[5rem] md:text-[6rem] font-bold leading-none bg-gradient-to-r from-[#0066ff] to-[#00d9ff] bg-clip-text text-transparent mb-2">
                    <AnimatedNumber
                      value={data.weekday_avg_hours}
                      duration={2}
                    />
                  </p>
                  <p className="text-2xl text-white/60">hours per day</p>
                </div>
                <div className="space-y-4 pt-6 border-t border-white/10">
                  <div className="flex justify-between items-baseline">
                    <span className="text-white/50">
                      Average daily listening
                    </span>
                    <span className="text-xl text-white font-medium">
                      Consistent
                    </span>
                  </div>
                </div>
              </div>
            </FadeUpSection>

            {/* Weekend */}
            <FadeUpSection delay={0.4}>
              <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-10 border border-white/10">
                <p className="text-sm uppercase tracking-wider text-white/40 mb-6">
                  Weekends
                </p>
                <div className="mb-8">
                  <p className="text-[5rem] md:text-[6rem] font-bold leading-none bg-gradient-to-r from-[#00ffaa] to-[#00ff66] bg-clip-text text-transparent mb-2">
                    <AnimatedNumber
                      value={data.weekend_avg_hours}
                      duration={2}
                    />
                  </p>
                  <p className="text-2xl text-white/60">hours per day</p>
                </div>
                <div className="space-y-4 pt-6 border-t border-white/10">
                  <div className="flex justify-between items-baseline">
                    <span className="text-white/50">
                      Average daily listening
                    </span>
                    <span className="text-xl text-white font-medium">
                      More relaxed
                    </span>
                  </div>
                </div>
              </div>
            </FadeUpSection>
          </div>

          <FadeUpSection delay={0.6}>
            <div className="text-center">
              <p className="text-lg md:text-xl text-white/50 max-w-2xl mx-auto leading-relaxed">
                Weekends are when you really dig in. 81% more listening time,
                and you're way more adventurous with what you play.
              </p>
            </div>
          </FadeUpSection>
        </div>
      </section>

      {/* Repeat Behavior */}
      <section className="min-h-screen flex items-center px-8 md:px-16 lg:px-24 relative overflow-hidden">
        <div className="absolute inset-0 opacity-30">
          <MeshGradient
            colors={["#ff0099", "#ff6b6b", "#00d9ff"]}
            distortion={0.5}
            speed={0.2}
          />
        </div>
        <div className="max-w-7xl mx-auto w-full relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-16 items-center">
            <div className="lg:col-span-3">
              <FadeUpSection>
                <p className="text-xs uppercase tracking-[0.3em] text-white/40 mb-8">
                  Most Obsessed Track
                </p>
              </FadeUpSection>
              <FadeUpSection delay={0.2}>
                <StaggeredText
                  text="Daydreaming"
                  className="text-7xl md:text-8xl lg:text-9xl font-bold text-white leading-none mb-8"
                  offset={40}
                  delay={0.1}
                  duration={0.2}
                  staggerDelay={0.12}
                  once={true}
                  as="h2"
                />
              </FadeUpSection>
              <FadeUpSection delay={0.4}>
                <p className="text-2xl md:text-3xl text-white/60 mb-12">
                  Radiohead · A Moon Shaped Pool
                </p>
              </FadeUpSection>
            </div>
            <div className="lg:col-span-2">
              <FadeUpSection delay={0.6}>
                <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10">
                  <p className="text-[6rem] md:text-[8rem] font-bold leading-none bg-gradient-to-br from-[#ff0099] to-[#ff6b6b] bg-clip-text text-transparent mb-4">
                    <AnimatedNumber value={47} duration={2} />
                  </p>
                  <p className="text-xl text-white/70 mb-6">
                    plays in a single day
                  </p>
                  <p className="text-sm text-white/40 leading-relaxed">
                    On March 15th, you couldn't get enough. That's once every 30
                    minutes during waking hours.
                  </p>
                </div>
              </FadeUpSection>
            </div>
          </div>
        </div>
      </section>

      {/* Listening Streaks */}
      <section className="min-h-[200vh] relative overflow-hidden">
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
                  <span className="text-[10rem] md:text-[14rem] font-bold leading-none bg-gradient-to-r from-[#00ff66] to-[#00ffaa] bg-clip-text text-transparent">
                    <AnimatedNumber
                      value={data.longest_streak}
                      duration={2.5}
                    />
                  </span>
                </div>
                <StaggeredText
                  text="day listening streak"
                  className="text-4xl md:text-6xl text-white/80"
                  offset={30}
                  delay={0.3}
                  duration={0.12}
                  staggerDelay={0.08}
                  once={true}
                  as="p"
                />
                <p className="text-xl text-white/40 mt-6">
                  You listened every single day for {data.longest_streak}{" "}
                  consecutive days
                </p>
              </div>
            </FadeUpSection>

            <FadeUpSection delay={0.4}>
              <div>
                <p className="text-sm uppercase tracking-wider text-white/40 mb-8">
                  Your 2025 Activity
                </p>
                {/* Desktop: horizontal layout */}
                <div className="hidden md:block overflow-x-auto">
                  <div className="inline-flex flex-col gap-1.5 min-w-full">
                    {/* Days of week labels */}
                    <div className="flex gap-1.5">
                      <div className="w-6 text-xs text-white/30" />
                      {Array.from({ length: 53 }, (_, weekIdx) => {
                        const isFirstOfMonth = weekIdx % 4 === 0;
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
                            className="w-3 text-[10px] text-white/30 text-center"
                          >
                            {isFirstOfMonth &&
                              monthNames[Math.floor(weekIdx / 4.4)]}
                          </div>
                        );
                      })}
                    </div>
                    {/* Week rows */}
                    {["Mon", "", "Wed", "", "Fri", "", "Sun"].map(
                      (day, dayIdx) => (
                        <div
                          key={dayIdx}
                          className="flex gap-1.5 items-center justify-center"
                        >
                          <div className="w-6 text-xs text-white/30">{day}</div>
                          {generateCalendarDates(data.year)
                            .filter((d) => {
                              const dow = d.getDay();
                              const adjustedDow = dow === 0 ? 6 : dow - 1;
                              return adjustedDow === dayIdx;
                            })
                            .map((date, idx) => {
                              const bgColor = getActivityColor(
                                date,
                                data.activity_graph,
                              );
                              return (
                                <motion.div
                                  key={idx}
                                  className={`w-3.5 h-3.5 rounded-sm ${bgColor}`}
                                  initial={{ opacity: 0, scale: 0 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  transition={{
                                    duration: 0.2,
                                    delay: 0.4 + idx * 0.005 + dayIdx * 0.01,
                                  }}
                                  title={`${date.toDateString()}: ${
                                    data.activity_graph.find(
                                      (a) =>
                                        a.date ===
                                        date.toISOString().split("T")[0],
                                    )?.hours || 0
                                  } hours`}
                                />
                              );
                            })}
                        </div>
                      ),
                    )}
                  </div>
                </div>
                {/* Mobile: vertical scrolling layout */}
                <div className="md:hidden md:max-h-0 flex justify-center">
                  <div className="inline-flex flex-row gap-2">
                    {/* Month labels column */}
                    <div className="flex flex-col gap-2">
                      <div className="h-8" />
                      {Array.from({ length: 53 }, (_, weekIdx) => {
                        const isFirstOfMonth = weekIdx % 4 === 0;
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
                            className="h-4 text-xs text-white/30 flex items-center pr-2"
                          >
                            {isFirstOfMonth &&
                              monthNames[Math.floor(weekIdx / 4.4)]}
                          </div>
                        );
                      })}
                    </div>
                    {/* Week columns */}
                    {["Mon", "", "Wed", "", "Fri", "", "Sun"].map(
                      (day, dayIdx) => (
                        <div key={dayIdx} className="flex flex-col gap-2">
                          <div className="h-8 text-sm text-white/30 -rotate-55 -mr-4 md:mr-0 flex items-center justify-center">
                            {day}
                          </div>
                          {generateCalendarDates(data.year)
                            .filter((d) => {
                              const dow = d.getDay();
                              const adjustedDow = dow === 0 ? 6 : dow - 1;
                              return adjustedDow === dayIdx;
                            })
                            .map((date, idx) => {
                              const bgColor = getActivityColor(
                                date,
                                data.activity_graph,
                              );
                              return (
                                <motion.div
                                  key={idx}
                                  className={`w-4 h-4 rounded-sm ${bgColor}`}
                                  initial={{ opacity: 0, scale: 0 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  transition={{
                                    duration: 0.2,
                                    delay: 0.4 + idx * 0.005 + dayIdx * 0.01,
                                  }}
                                  title={`${date.toDateString()}: ${
                                    data.activity_graph.find(
                                      (a) =>
                                        a.date ===
                                        date.toISOString().split("T")[0],
                                    )?.hours || 0
                                  } hours`}
                                />
                              );
                            })}
                        </div>
                      ),
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
              <div className="grid grid-cols-3 gap-8 mt-12 max-w-4xl mx-auto">
                <div className="text-center">
                  <p className="text-4xl md:text-5xl font-bold text-white/80 mb-2">
                    <AnimatedNumber value={data.days_active} duration={1.5} />
                  </p>
                  <p className="text-sm text-white/40 uppercase tracking-wider">
                    days active
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-4xl md:text-5xl font-bold text-white/80 mb-2">
                    <AnimatedNumber
                      value={365 - data.days_active}
                      duration={1.5}
                    />
                  </p>
                  <p className="text-sm text-white/40 uppercase tracking-wider">
                    days off
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-[#00ff66] to-[#00ffaa] bg-clip-text text-transparent mb-2">
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

      {/* Deep Cuts */}
      <section className="min-h-screen flex items-center justify-center px-8 py-24 relative overflow-hidden">
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
        <div className="max-w-4xl mx-auto relative z-10">
          <FadeUpSection>
            <div className="text-center mb-16">
              <p className="text-sm uppercase tracking-[0.3em] text-white/40 mb-8">
                You're a Deep Listener
              </p>
              <div className="flex justify-center items-baseline gap-6 mb-8">
                <span className="text-[10rem] md:text-[14rem] font-bold leading-none bg-gradient-to-br from-[#9900ff] to-[#ff0099] bg-clip-text text-transparent">
                  <AnimatedNumber value={67} duration={2} />%
                </span>
              </div>
              <p className="text-2xl md:text-3xl text-white/70 max-w-2xl mx-auto leading-relaxed">
                of your listening was full albums, not individual tracks
              </p>
            </div>
          </FadeUpSection>
          <FadeUpSection delay={0.4}>
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-10 border border-white/10">
              <p className="text-sm uppercase tracking-wider text-white/40 mb-4">
                Most Played Album
              </p>
              <StaggeredText
                text="In Rainbows"
                className="text-4xl md:text-5xl font-bold text-white mb-2"
                offset={25}
                delay={0.2}
                duration={0.12}
                staggerDelay={0.08}
                once={true}
                as="h3"
              />
              <p className="text-xl text-white/50 mb-6">Radiohead</p>
              <div className="flex items-baseline gap-4">
                <span className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-[#9900ff] to-[#ff0099] bg-clip-text text-transparent">
                  <AnimatedNumber value={89} duration={1.5} />
                </span>
                <span className="text-lg text-white/40">
                  complete playthroughs
                </span>
              </div>
            </div>
          </FadeUpSection>
        </div>
      </section>

      {/* Ending - Personal Moment */}
      <section className="min-h-screen flex items-center justify-center px-8 relative overflow-hidden">
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
              text={`${Math.round(data.total_hours)} hours.`}
              className="text-5xl md:text-7xl text-white/90 mb-6 font-light"
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
              text={`${data.new_artists_count} new artists.`}
              className="text-5xl md:text-7xl text-white/90 mb-6 font-light"
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
              className="text-5xl md:text-7xl text-white/90 mb-16 font-light"
              offset={30}
              delay={0.1}
              duration={0.15}
              staggerDelay={0.1}
              once={true}
              as="p"
            />
          </FadeUpSection>
          <FadeUpSection delay={0.8}>
            <p className="text-xl md:text-2xl text-white/50 leading-relaxed max-w-2xl mx-auto">
              Music isn't just what you listen to. It's where you live. Thanks
              for making 2025 unforgettable.
            </p>
          </FadeUpSection>
        </div>
      </section>
    </div>
  );
}
