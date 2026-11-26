import {
  animate,
  motion,
  useReducedMotion,
  type HTMLMotionProps,
} from "framer-motion";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { bareMbid } from "./data";

/* ───────────────────────── palette ───────────────────────── */

export const MOODS = {
  teal: { bg: "#10b3a3", ink: "#032b27", pop: "#fff36b" },
  lilac: { bg: "#c9b6ff", ink: "#2a0f66", pop: "#ff5fa2" },
  tangerine: { bg: "#ff7a2e", ink: "#2a0a00", pop: "#ffe2c4" },
  lime: { bg: "#d7f75b", ink: "#183000", pop: "#2f5bff" },
  pink: { bg: "#ff5fa2", ink: "#3a0020", pop: "#fff36b" },
  cobalt: { bg: "#2f5bff", ink: "#f2efff", pop: "#d7f75b" },
  night: { bg: "#17134a", ink: "#ece8ff", pop: "#ffcf4a" },
  ink: { bg: "#0f2422", ink: "#e9fffb", pop: "#10b3a3" },
} as const;

export type Mood = keyof typeof MOODS;

export function moodVars(mood: Mood): CSSProperties {
  const m = MOODS[mood];
  return {
    "--bg": m.bg,
    "--ink": m.ink,
    "--pop": m.pop,
    "--soft": `color-mix(in oklab, ${m.ink} 14%, ${m.bg})`,
    background: m.bg,
    color: m.ink,
  } as CSSProperties;
}

/* ───────────────────────── motion ───────────────────────── */

export const EASE = [0.22, 1, 0.36, 1] as const;

/** Rises into place when `active` flips on. Content stays visible when motion is reduced. */
export function Rise({
  active,
  delay = 0,
  y = 28,
  rotate = 0,
  scale = 1,
  className,
  style,
  children,
  as = "div",
}: {
  active: boolean;
  delay?: number;
  y?: number;
  rotate?: number;
  scale?: number;
  className?: string;
  style?: CSSProperties;
  children?: React.ReactNode;
  as?: "div" | "span" | "p" | "h1" | "h2" | "li";
}) {
  const reduce = useReducedMotion();
  const Comp = motion[as] as React.ComponentType<HTMLMotionProps<"div">>;
  if (reduce)
    return (
      <Comp className={className} style={style}>
        {children}
      </Comp>
    );
  return (
    <Comp
      className={className}
      style={style}
      initial={{ opacity: 0, y, rotate, scale }}
      animate={
        active
          ? { opacity: 1, y: 0, rotate: 0, scale: 1 }
          : { opacity: 0, y, rotate, scale }
      }
      transition={{ duration: 0.7, delay: active ? delay : 0, ease: EASE }}
    >
      {children}
    </Comp>
  );
}

/** Springy entrance for stickers: overshoots and settles at a tilt. */
export function Pop({
  active,
  delay = 0,
  tilt = 0,
  className,
  style,
  children,
}: {
  active: boolean;
  delay?: number;
  tilt?: number;
  className?: string;
  style?: CSSProperties;
  children?: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      style={style}
      initial={reduce ? { rotate: tilt } : { opacity: 0, scale: 0.2, rotate: tilt - 25 }}
      animate={
        active || reduce
          ? { opacity: 1, scale: 1, rotate: tilt }
          : { opacity: 0, scale: 0.2, rotate: tilt - 25 }
      }
      transition={{
        type: "spring",
        stiffness: 260,
        damping: 14,
        delay: active ? delay : 0,
      }}
    >
      {children}
    </motion.div>
  );
}

/** Slow idle bob for decorative shapes. */
export function Float({
  className,
  style,
  children,
  amount = 10,
  duration = 5,
  delay = 0,
}: {
  className?: string;
  style?: CSSProperties;
  children?: React.ReactNode;
  amount?: number;
  duration?: number;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      aria-hidden
      className={`pointer-events-none ${className ?? ""}`}
      style={{ zIndex: -1, ...style }}
      animate={reduce ? undefined : { y: [0, -amount, 0], rotate: [0, 6, 0] }}
      transition={{ duration, repeat: Infinity, ease: "easeInOut", delay }}
    >
      {children}
    </motion.div>
  );
}

/** Counts from 0 to `value` once `active` is set. */
export function CountUp({
  value,
  active,
  duration = 1.8,
  delay = 0,
  decimals = 0,
  className,
}: {
  value: number;
  active: boolean;
  duration?: number;
  delay?: number;
  decimals?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const fmt = (n: number) =>
    n.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) {
      el.textContent = fmt(value);
      return;
    }
    if (!active) {
      el.textContent = fmt(0);
      return;
    }
    const controls = animate(0, value, {
      duration,
      delay,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        el.textContent = fmt(v);
      },
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, value, reduce]);

  return (
    <span ref={ref} className={`tnum ${className ?? ""}`}>
      {fmt(reduce ? value : 0)}
    </span>
  );
}

/* ───────────────────────── shapes ───────────────────────── */

export function Starburst({ className, points = 12 }: { className?: string; points?: number }) {
  const d = Array.from({ length: points * 2 }, (_, i) => {
    const r = i % 2 === 0 ? 50 : 36;
    const a = (Math.PI * i) / points - Math.PI / 2;
    return `${i ? "L" : "M"}${50 + r * Math.cos(a)} ${50 + r * Math.sin(a)}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <path d={`${d} Z`} fill="currentColor" />
    </svg>
  );
}

export function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <path
        d="M50 0 C54 34 66 46 100 50 C66 54 54 66 50 100 C46 66 34 54 0 50 C34 46 46 34 50 0 Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function Blob({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <path
        d="M78 14c12 9 20 26 17 42-3 17-15 33-31 39-17 6-37 1-50-12C1 70-3 49 6 33 15 17 34 6 51 5c10-1 20 2 27 9Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function Squiggle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 24" className={className} aria-hidden fill="none">
      <path
        d="M2 12c8-10 16-10 24 0s16 10 24 0 16-10 24 0 16 10 24 0 16-10 20-4"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Disc({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <circle cx="50" cy="50" r="50" fill="#111" />
      {[44, 38, 32, 26].map((r) => (
        <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="#fff" strokeOpacity=".08" />
      ))}
      <circle cx="50" cy="50" r="17" fill="currentColor" />
      <circle cx="50" cy="50" r="2.5" fill="#111" />
    </svg>
  );
}

/* ───────────────────────── images ───────────────────────── */

const mbCache = new Map<string, Promise<string | null>>();

function lookupReleaseMbid(title: string, artist: string) {
  const key = `${artist}::${title}`;
  let hit = mbCache.get(key);
  if (!hit) {
    const q = encodeURIComponent(`recording:"${title}" AND artist:"${artist}"`);
    hit = fetch(`https://musicbrainz.org/ws/2/recording?query=${q}&fmt=json&limit=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j?.recordings?.[0]?.releases?.[0]?.id as string) ?? null)
      .catch(() => null);
    mbCache.set(key, hit);
  }
  return hit;
}

const caa = (id: string) => `https://coverartarchive.org/release/${id}/front-500`;

function initials(name: string) {
  return (
    name
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "♪"
  );
}

/** Album art from the Cover Art Archive, falling back to a MusicBrainz search, then to a printed placeholder. */
export function Cover({
  title,
  artist,
  releaseMbId,
  className = "",
  style,
}: {
  title: string;
  artist: string;
  releaseMbId?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const [src, setSrc] = useState<string | null>(() => {
    const id = bareMbid(releaseMbId);
    return id ? caa(id) : null;
  });
  const [failed, setFailed] = useState(false);
  const [triedSearch, setTriedSearch] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const id = bareMbid(releaseMbId);
    setFailed(false);
    setTriedSearch(!id);
    if (id) {
      setSrc(caa(id));
    } else {
      setSrc(null);
      lookupReleaseMbid(title, artist).then((found) => {
        if (cancelled) return;
        if (found) setSrc(caa(found));
        else setFailed(true);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [releaseMbId, title, artist]);

  const onError = () => {
    if (!triedSearch) {
      setTriedSearch(true);
      lookupReleaseMbid(title, artist).then((found) => {
        if (found && caa(found) !== src) setSrc(caa(found));
        else setFailed(true);
      });
    } else setFailed(true);
  };

  if (failed || !src) {
    return (
      <div
        className={`@container relative grid place-items-center overflow-hidden bg-[var(--ink)] text-[var(--bg)] ${className}`}
        style={style}
        role="img"
        aria-label={`${title} by ${artist}`}
      >
        <Disc className="absolute w-[130%] -right-[45%] text-[var(--pop)] opacity-90" />
        <span className="display relative text-[30cqw] -translate-x-[18%] text-[var(--pop)]">
          {initials(title)}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={`${title} by ${artist}`}
      className={`object-cover bg-[var(--soft)] ${className}`}
      style={style}
      crossOrigin="anonymous"
      onError={onError}
      loading="eager"
      decoding="async"
    />
  );
}

export function ArtistPhoto({
  name,
  src,
  className = "",
  style,
}: {
  name: string;
  src?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div
        className={`@container grid place-items-center bg-[var(--pop)] text-[var(--ink)] overflow-hidden ${className}`}
        style={style}
        role="img"
        aria-label={name}
      >
        <span className="display text-[34cqw]">{initials(name)}</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={name}
      className={`object-cover bg-[var(--soft)] ${className}`}
      style={style}
      crossOrigin="anonymous"
      onError={() => setFailed(true)}
      decoding="async"
    />
  );
}

/* ───────────────────────── screens ───────────────────────── */

const LOADING_LINES = [
  "dusting off your records",
  "counting every single play",
  "rewinding the tape",
  "untangling the aux cord",
  "asking your repo nicely",
];

export function LoadingScreen({ label }: { label?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % LOADING_LINES.length), 1800);
    return () => clearInterval(t);
  }, []);
  return (
    <div
      className="grain relative min-h-dvh grid place-items-center px-6 overflow-hidden"
      style={moodVars("teal")}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-8">
        <div className="flex items-end gap-2 h-20" aria-hidden>
          {[0, 1, 2, 3, 4].map((b) => (
            <motion.span
              key={b}
              className="w-4 rounded-full bg-[var(--ink)]"
              animate={{ height: ["20%", "100%", "35%", "80%", "20%"] }}
              transition={{ duration: 1.1, repeat: Infinity, delay: b * 0.12, ease: "easeInOut" }}
            />
          ))}
        </div>
        <p className="text-xl font-semibold text-center">
          {label ?? LOADING_LINES[i]}…
        </p>
      </div>
    </div>
  );
}

export function ErrorScreen({
  title,
  message,
  children,
}: {
  title: string;
  message: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="grain relative isolate min-h-dvh grid place-items-center px-6 overflow-hidden" style={moodVars("tangerine")}>
      <Float className="absolute -top-10 -right-10 w-56 text-[var(--pop)]">
        <Starburst className="w-full" />
      </Float>
      <div className="relative max-w-md">
        <p className="display text-7xl mb-6">{title}</p>
        <p className="text-xl font-medium mb-8">{message}</p>
        {children}
      </div>
    </div>
  );
}
