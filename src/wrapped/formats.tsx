import { Link, useNavigate } from "@tanstack/react-router";
import {
  AnimatePresence,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { ChevronLeft, ChevronRight, Pause, Play, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  artistImage,
  buddyName,
  derive,
  fmtDuration,
  hourLabel,
  MONTHS,
  plural,
  useWrapped,
  YEAR,
  type Derived,
  type WrappedData,
} from "./data";
import { useShare } from "./share";
import { bskyIntent, buildSlides, ShareRow, type Format, type SlideActions, type SlideDef } from "./slides";
import { ArtistPhoto, Cover, ErrorScreen, LoadingScreen, MOODS, moodVars, type Mood } from "./ui";

/* ───────────────────────── shell ───────────────────────── */

export function WrappedRoute({ handle, format }: { handle: string; format: Format }) {
  const state = useWrapped(handle);
  const { cards, share, busy } = useShare(state.status === "ready" ? state.data : null, handle);

  if (state.status === "loading") return <LoadingScreen />;
  if (state.status === "error")
    return (
      <ErrorScreen title={state.notFound ? "hmm." : "oops."} message={state.message}>
        <Link to="/" className="inline-flex min-h-12 items-center rounded-full bg-[var(--ink)] px-6 font-bold text-[var(--bg)]">
          try another handle
        </Link>
      </ErrorScreen>
    );

  return (
    <>
      <Experience d={state.data} handle={handle} format={format} actions={{ share, busy }} />
      {cards}
    </>
  );
}

function Experience({ d, handle, format, actions }: { d: WrappedData; handle: string; format: Format; actions: Pick<SlideActions, "share" | "busy"> }) {
  const x = useMemo(() => derive(d), [d]);
  const slides = useMemo(() => buildSlides(d, x), [d, x]);
  const [showRecap, setShowRecap] = useState(false);
  const [run, setRun] = useState(0);

  if (format === "scroll") return <ScrollStory d={d} x={x} handle={handle} slides={slides} actions={actions} />;

  if (format === "recap" && showRecap)
    return (
      <Recap
        d={d}
        x={x}
        handle={handle}
        actions={actions}
        onReplay={() => {
          setShowRecap(false);
          setRun((r) => r + 1);
        }}
      />
    );

  return (
    <Stories
      key={run}
      d={d}
      x={x}
      handle={handle}
      slides={slides}
      format={format}
      actions={actions}
      onRestart={() => setRun((r) => r + 1)}
      onFinish={format === "recap" ? () => setShowRecap(true) : undefined}
    />
  );
}

/* ───────────────────────── stories ───────────────────────── */

function Stories({
  d,
  x,
  handle,
  slides,
  format,
  actions,
  onRestart,
  onFinish,
}: {
  d: WrappedData;
  x: Derived;
  handle: string;
  slides: SlideDef[];
  format: Format;
  actions: Pick<SlideActions, "share" | "busy">;
  onRestart: () => void;
  onFinish?: () => void;
}) {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const progress = useMotionValue(0);
  const elapsed = useRef(0);
  const frameRef = useRef<HTMLDivElement>(null);

  const slide = slides[index];
  const last = index === slides.length - 1;

  const go = useCallback(
    (next: number) => {
      if (next < 0) {
        elapsed.current = 0;
        progress.set(0);
        return;
      }
      if (next >= slides.length) {
        onFinish?.();
        return;
      }
      setDir(next > index ? 1 : -1);
      setIndex(next);
    },
    [index, slides.length, onFinish, progress],
  );

  useEffect(() => {
    elapsed.current = 0;
    progress.set(0);
  }, [index, progress]);

  // playback clock
  useEffect(() => {
    let raf = 0;
    let prev = performance.now();
    const tick = (now: number) => {
      const dt = now - prev;
      prev = now;
      const stopped = paused || held || document.hidden || !Number.isFinite(slide.duration);
      if (!stopped) {
        elapsed.current += dt;
        const p = Math.min(1, elapsed.current / slide.duration);
        progress.set(p);
        if (p >= 1 && !last) {
          go(index + 1);
          return;
        }
      } else if (!Number.isFinite(slide.duration)) {
        progress.set(1);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, held, slide.duration, index, last, go, progress]);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea")) return;
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        go(index + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(index - 1);
      } else if (e.key === "Escape") navigate({ to: "/" });
      else if (e.key.toLowerCase() === "p" || e.key.toLowerCase() === "k") setPaused((p) => !p);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index, navigate]);

  // tap left/right, hold to pause, swipe
  const press = useRef<{ x: number; y: number; t: number; timer: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-interactive], a, button")) return;
    const timer = window.setTimeout(() => setHeld(true), 220);
    press.current = { x: e.clientX, y: e.clientY, t: performance.now(), timer };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const p = press.current;
    press.current = null;
    if (!p) return;
    clearTimeout(p.timer);
    const wasHeld = held;
    setHeld(false);
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) return go(index + (dx < 0 ? 1 : -1));
    if (dy > 120 && Math.abs(dy) > Math.abs(dx)) return navigate({ to: "/" });
    if (wasHeld || performance.now() - p.t > 350) return;
    const rect = frameRef.current!.getBoundingClientRect();
    go(index + (e.clientX - rect.left < rect.width * 0.3 ? -1 : 1));
  };

  const m = MOODS[slide.mood];
  const fullActions: SlideActions = { ...actions, restart: onRestart, openRecap: onFinish };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center gap-6 overflow-hidden transition-colors duration-700"
      style={{ background: `color-mix(in oklab, ${m.bg} 62%, #000)` }}
    >
      <SideButton label="previous" onClick={() => go(index - 1)} disabled={index === 0}>
        <ChevronLeft />
      </SideButton>

      <div
        ref={frameRef}
        className="relative h-dvh w-full touch-none select-none overflow-hidden sm:h-[min(calc(100dvh-2.5rem),960px)] sm:w-auto sm:aspect-[9/16] sm:rounded-[2rem] sm:shadow-[0_40px_120px_-30px_rgba(0,0,0,.6)]"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          if (press.current) clearTimeout(press.current.timer);
          press.current = null;
          setHeld(false);
        }}
        onContextMenu={(e) => e.preventDefault()}
        role="region"
        aria-roledescription="story"
        aria-label={`${d.year} year in music for @${handle}`}
      >
        <AnimatePresence initial={false} custom={dir}>
          <motion.div
            key={slide.id}
            custom={dir}
            className="absolute inset-0"
            variants={{
              enter: (dr: number) =>
                reduce ? { opacity: 0, zIndex: 2 } : { clipPath: `circle(0% at ${dr > 0 ? "88%" : "12%"} 55%)`, zIndex: 2 },
              center: { clipPath: "circle(150% at 50% 55%)", opacity: 1, zIndex: 2 },
              exit: { zIndex: 1, opacity: 1 },
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: reduce ? 0.2 : 0.65, ease: [0.65, 0, 0.35, 1] }}
            aria-live="polite"
          >
            <slide.Component d={d} x={x} handle={handle} active format={format} actions={fullActions} />
          </motion.div>
        </AnimatePresence>

        {/* chrome */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] transition-colors duration-500" style={{ color: m.ink }}>
          <div className="flex gap-1" aria-hidden>
            {slides.map((s, i) => (
              <Segment key={s.id} state={i < index ? "done" : i > index ? "todo" : "now"} progress={progress} />
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2.5">
            {d.profile_picture && <img src={d.profile_picture} alt="" className="h-8 w-8 rounded-full object-cover ring-2 ring-current" />}
            <p className="min-w-0 flex-1 truncate text-sm font-bold">
              @{handle} <span className="opacity-60">· {d.year}</span>
            </p>
            <IconBtn label={paused ? "play" : "pause"} onClick={() => setPaused((p) => !p)}>
              {paused ? <Play size={18} fill="currentColor" /> : <Pause size={18} fill="currentColor" />}
            </IconBtn>
            <Link to="/" aria-label="close" data-interactive className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-current">
              <X size={22} />
            </Link>
          </div>
        </div>

        <p className="sr-only" aria-live="polite">
          slide {index + 1} of {slides.length}: {slide.label}. use the arrow keys to move, p to pause.
        </p>
      </div>

      <SideButton label="next" onClick={() => go(index + 1)} disabled={last && !onFinish}>
        <ChevronRight />
      </SideButton>
    </div>
  );
}

function Segment({ state, progress }: { state: "done" | "now" | "todo"; progress: MotionValue<number> }) {
  const width = useTransform(progress, (p) => `${p * 100}%`);
  return (
    <div className="h-1 flex-1 overflow-hidden rounded-full bg-current/25">
      {state === "done" && <div className="h-full w-full bg-current" />}
      {state === "now" && <motion.div className="h-full bg-current" style={{ width }} />}
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} data-interactive className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-current">
      {children}
    </button>
  );
}

function SideButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="hidden h-14 w-14 shrink-0 place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/25 disabled:opacity-0 sm:grid"
    >
      {children}
    </button>
  );
}

/* ───────────────────────── cinematic scroll ───────────────────────── */

function ScrollStory({ d, x, handle, slides, actions }: { d: WrappedData; x: Derived; handle: string; slides: SlideDef[]; actions: Pick<SlideActions, "share" | "busy"> }) {
  return (
    <ScrollDeck
      badge={`teal.fm · ${d.year}`}
      sections={slides.map((s) => ({
        id: s.id,
        label: s.label,
        mood: s.mood,
        render: (active) => <s.Component d={d} x={x} handle={handle} active={active} format="scroll" actions={actions} />,
      }))}
    />
  );
}

export interface DeckSection {
  id: string;
  label: string;
  mood: Mood;
  render: (active: boolean) => ReactNode;
}

/** Full-screen sections that snap, each revealing itself once as it scrolls into view. */
export function ScrollDeck({ sections, badge }: { sections: DeckSection[]; badge: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ container: ref });
  const [current, setCurrent] = useState(0);
  const m = MOODS[sections[current]?.mood ?? "teal"];

  return (
    <div ref={ref} className="no-scrollbar h-dvh snap-y snap-proximity overflow-y-auto overflow-x-hidden">
      <motion.div className="fixed inset-x-0 top-0 z-30 h-1.5 origin-left transition-colors duration-500" style={{ scaleX: scrollYProgress, background: m.ink }} />
      <div className="pointer-events-none fixed left-4 top-4 z-30 transition-colors duration-500 sm:left-6 sm:top-6" style={{ color: m.ink }}>
        <Link to="/" className="pointer-events-auto rounded-full border-2 border-current px-3 py-1 text-sm font-bold hover:bg-black/10">
          {badge}
        </Link>
      </div>
      <nav className="fixed right-3 top-1/2 z-30 hidden -translate-y-1/2 flex-col gap-2 md:flex" aria-label="sections">
        {sections.map((s, i) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            aria-label={s.label}
            aria-current={i === current}
            className="h-2.5 w-2.5 rounded-full transition-all duration-300 aria-[current=true]:h-6"
            style={{ background: m.ink, opacity: i === current ? 1 : 0.35 }}
          />
        ))}
      </nav>
      {sections.map((s, i) => (
        <ScrollSection key={s.id} id={s.id} label={s.label} onEnter={() => setCurrent(i)} root={ref}>
          {s.render}
        </ScrollSection>
      ))}
      <SiteFooter mood="pink" />
    </div>
  );
}

function ScrollSection({ id, label, onEnter, root, children }: { id: string; label: string; onEnter: () => void; root: React.RefObject<HTMLDivElement | null>; children: (active: boolean) => ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const seen = useInView(ref, { root, amount: 0.4, once: true });
  const here = useInView(ref, { root, amount: 0.5 });
  useEffect(() => {
    if (here) onEnter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [here]);
  return (
    <section ref={ref} id={id} aria-label={label} className="relative min-h-dvh snap-start [&>div]:min-h-dvh">
      {children(seen)}
    </section>
  );
}

export function SiteFooter({ mood = "ink" }: { mood?: Mood }) {
  return (
    <footer className="px-6 py-8 text-center text-sm font-medium" style={moodVars(mood)}>
      data from MusicBrainz, Spotify. all rights reserved by their respective owners. ·{" "}
      <a href="https://teal.fm" className="underline underline-offset-2">
        teal.fm
      </a>
    </footer>
  );
}

/* ───────────────────────── recap (everything page) ───────────────────────── */

function Tile({ mood, className = "", children }: { mood: Mood; className?: string; children: ReactNode }) {
  return (
    <div className={`grain @container relative overflow-hidden rounded-[1.75rem] p-5 sm:p-7 ${className}`} style={moodVars(mood)}>
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}

const tileLabel = "mb-3 text-xs font-bold uppercase tracking-[0.14em]";

function Recap({ d, x, handle, actions, onReplay }: { d: WrappedData; x: Derived; handle: string; actions: Pick<SlideActions, "share" | "busy">; onReplay: () => void }) {
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);
  const h = Math.floor(d.longest_session_minutes / 60);
  const mm = Math.round(d.longest_session_minutes % 60);
  const maxMonth = Math.max(1, ...x.months);
  const maxHour = Math.max(1, ...x.localHours);

  return (
    <div style={moodVars("ink")} className="min-h-dvh">
      <header className="mx-auto max-w-6xl px-4 pb-8 pt-8 sm:px-6 sm:pt-12">
        <div className="mb-8 flex items-center justify-between gap-3">
          <Link to="/" className="rounded-full border-2 border-current px-3 py-1 text-sm font-bold hover:bg-white/10">
            teal.fm · {d.year}
          </Link>
          <button type="button" onClick={onReplay} className="rounded-full border-2 border-current px-3 py-1 text-sm font-bold hover:bg-white/10">
            ↺ watch the story
          </button>
        </div>
        <div className="flex items-center gap-4">
          {d.profile_picture && <img src={d.profile_picture} alt="" className="h-16 w-16 rounded-full border-[3px] border-[var(--pop)] object-cover sm:h-20 sm:w-20" />}
          <p className="text-lg font-bold sm:text-xl">@{handle}</p>
        </div>
        <h1 className="display mt-5 text-[clamp(3.5rem,13vw,10rem)]">
          your <span className="text-[var(--pop)]">{d.year}</span>,<br />
          all of it.
        </h1>
      </header>

      <main className="mx-auto grid max-w-6xl grid-cols-2 gap-3 px-4 pb-16 sm:grid-cols-6 sm:gap-4 sm:px-6">
        {/* headline numbers */}
        <Tile mood="lime" className="col-span-2 sm:col-span-4">
          <p className={tileLabel}>minutes listened</p>
          <p className="display condensed text-[min(26cqw,11rem)] tnum">{Math.round(d.total_minutes).toLocaleString()}</p>
          <p className="mt-2 text-lg font-semibold">
            {Math.round(x.hours).toLocaleString()} hours · {plural(d.total_plays, "play")}
          </p>
        </Tile>
        <Tile mood="lilac" className="col-span-2 sm:col-span-2">
          <p className={tileLabel}>artists</p>
          <p className="display condensed text-[min(40cqw,8rem)] tnum">{d.new_artists_count.toLocaleString()}</p>
          <p className="mt-2 text-lg font-semibold">different names in your ears</p>
        </Tile>

        {/* top artists */}
        <Tile mood="pink" className="col-span-2 sm:col-span-6">
          <p className={tileLabel}>top artists</p>
          <ol className="grid grid-cols-2 gap-4 @xl:grid-cols-5">
            {d.top_artists.slice(0, 10).map((a, i) => (
              <li key={a.name} className={i === 0 ? "col-span-2 @xl:row-span-2" : ""}>
                <div className="relative">
                  <ArtistPhoto name={a.name} src={artistImage(a)} className={`aspect-square w-full border-[3px] border-white ${i === 0 ? "rounded-[1.4rem]" : "rounded-2xl"}`} />
                  <span className={`display absolute left-2 top-2 rounded-full bg-[var(--ink)] px-2.5 py-1 text-[var(--bg)] tnum ${i === 0 ? "text-3xl" : "text-lg"}`}>{i + 1}</span>
                </div>
                <p className={`mt-2 truncate font-extrabold leading-tight ${i === 0 ? "text-3xl" : "text-base"}`}>{a.name}</p>
                <p className="text-sm font-semibold opacity-75 tnum">{plural(a.plays, "play")}</p>
              </li>
            ))}
          </ol>
        </Tile>

        {/* top tracks */}
        <Tile mood="cobalt" className="col-span-2 sm:col-span-6">
          <p className={tileLabel}>top songs</p>
          <ol className="grid gap-3 @2xl:grid-flow-col @2xl:grid-cols-2 @2xl:grid-rows-5 @2xl:gap-x-8">
            {d.top_tracks.slice(0, 10).map((t, i) => (
              <li key={`${t.title}-${t.artist}`} className="flex items-center gap-3">
                <span className="display condensed w-[2ch] shrink-0 text-right text-3xl text-[var(--pop)] tnum">{i + 1}</span>
                <Cover title={t.title} artist={t.artist} releaseMbId={t.release_mb_id} className="h-14 w-14 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-extrabold leading-tight">{t.title}</p>
                  <p className="truncate text-sm font-medium opacity-75">{t.artist}</p>
                </div>
                <span className="shrink-0 text-sm font-bold tnum">{t.plays}×</span>
              </li>
            ))}
          </ol>
        </Tile>

        {/* habits */}
        <Tile mood={x.persona.night ? "night" : "tangerine"} className="col-span-2 sm:col-span-3">
          <p className={tileLabel}>listening clock</p>
          <div className="flex h-28 items-end gap-[2px]" role="img" aria-label={`peak hour ${hourLabel(x.peakHour, true)}`}>
            {x.localHours.map((v, i) => (
              <div key={i} className="flex-1 rounded-t-sm" style={{ height: `${Math.max(3, (v / maxHour) * 100)}%`, background: i === x.peakHour ? "var(--pop)" : "currentColor" }} />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-xs font-bold opacity-70">
            <span>12a</span>
            <span>6a</span>
            <span>12p</span>
            <span>6p</span>
            <span>11p</span>
          </div>
          <p className="display mt-4 text-[min(12cqw,3.5rem)]">{x.persona.name}</p>
          <p className="mt-1 font-semibold">peak hour: {hourLabel(x.peakHour, true)}</p>
        </Tile>
        <Tile mood="teal" className="col-span-2 sm:col-span-3">
          <p className={tileLabel}>month by month</p>
          <div className="flex h-28 items-end gap-1" role="img" aria-label={`peak month ${MONTHS[x.peakMonth]}`}>
            {x.months.map((v, i) => (
              <div key={i} className="flex-1 rounded-t-md" style={{ height: `${Math.max(3, (v / maxMonth) * 100)}%`, background: i === x.peakMonth ? "var(--pop)" : "var(--ink)" }} />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-xs font-bold opacity-70">
            {MONTHS.map((mo) => (
              <span key={mo} className="flex-1 text-center">
                {mo[0]}
              </span>
            ))}
          </div>
          <p className="display mt-4 text-[min(12cqw,3.5rem)]">{MONTHS[x.peakMonth]}</p>
          <p className="mt-1 font-semibold">your loudest month</p>
        </Tile>

        {[
          { mood: "lime" as Mood, k: "day streak", v: d.longest_streak.toLocaleString(), s: `music on ${d.days_active} days` },
          { mood: "cobalt" as Mood, k: "longest session", v: h > 0 ? `${h}h ${mm}m` : `${mm}m`, s: "in one sitting" },
          { mood: "pink" as Mood, k: "weekday vs weekend", v: `${(d.weekday_avg_minutes / 60).toFixed(1)} / ${(d.weekend_avg_minutes / 60).toFixed(1)}`, s: "hours per day" },
          { mood: "lilac" as Mood, k: "top three share", v: `${x.top3Share}%`, s: "went to your top three" },
          { mood: "tangerine" as Mood, k: "average song", v: fmtDuration(d.avg_track_length_ms), s: "minutes long" },
          { mood: "teal" as Mood, k: "unique songs", v: `${Math.round(d.listening_diversity * 100)}%`, s: "of your plays" },
        ].map((t) => (
          <Tile key={t.k} mood={t.mood} className="col-span-1 sm:col-span-2">
            <p className={tileLabel}>{t.k}</p>
            <p className="display condensed text-[min(26cqw,5.5rem)] tnum">{t.v}</p>
            <p className="mt-1 text-sm font-semibold sm:text-base">{t.s}</p>
          </Tile>
        ))}

        {(d.similar_users ?? []).length > 0 && (
          <Tile mood="lime" className="col-span-2 sm:col-span-6">
            <p className={tileLabel}>music buddies</p>
            <ul className="grid gap-3 @2xl:grid-cols-3">
              {(d.similar_users ?? []).slice(0, 3).map((b) => (
                <li key={b.did}>
                  <a href={`https://bsky.app/profile/${b.did}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-2xl bg-[var(--ink)] p-3 text-[var(--bg)] hover:opacity-90">
                    {b.profile_picture ? <img src={b.profile_picture} alt="" className="h-12 w-12 rounded-full object-cover" /> : <span className="h-12 w-12 rounded-full bg-[var(--pop)]" />}
                    <span className="min-w-0">
                      <span className="block truncate font-extrabold">{buddyName(b)}</span>
                      <span className="block truncate text-sm opacity-80">
                        {plural(b.shared_artist_count, "shared artist")}
                        {b.shared_artists[0] ? `, like ${b.shared_artists[0]}` : ""}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </Tile>
        )}

        <Tile mood="pink" className="col-span-2 sm:col-span-6">
          <div className="grid gap-6 @3xl:grid-cols-[1.2fr_1fr] @3xl:items-end">
            <div>
              <p className={tileLabel}>that's a wrap</p>
              <p className="display text-[min(11cqw,5rem)]">thanks for listening with us.</p>
              <p className="mt-4 text-xl font-semibold">
                —{" "}
                <a className="font-hand text-[1.5em] font-normal hover:underline" href="https://bsky.app/profile/did:plc:tas6hj2xjrqben5653v5kohk" target="_blank" rel="noopener noreferrer">
                  Matt
                </a>{" "}
                &{" "}
                <a className="font-hand text-[1.5em] font-normal hover:underline" href="https://bsky.app/profile/did:plc:k644h4rq5bjfzcetgsa6tuby" target="_blank" rel="noopener noreferrer">
                  Natalie
                </a>
              </p>
            </div>
            <div>
              <p className={tileLabel}>save a card for bluesky</p>
              <ShareRow actions={actions} />
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <a href={bskyIntent(handle)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center rounded-full bg-[var(--ink)] px-5 font-bold text-[var(--bg)]">
                  post on bluesky
                </a>
                <Link to="/global-wrapped/$year" params={{ year: String(YEAR) }} className="font-bold underline decoration-2 underline-offset-4">
                  global stats →
                </Link>
              </div>
            </div>
          </div>
        </Tile>
      </main>
      <SiteFooter />
    </div>
  );
}
