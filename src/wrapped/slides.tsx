import { Link } from "@tanstack/react-router";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";
import {
  artistImage,
  buddyName,
  fmtDuration,
  hourLabel,
  MONTHS,
  minutesYardstick,
  plural,
  YEAR,
  type Derived,
  type WrappedData,
} from "./data";
import type { ShareKind } from "./share";
import {
  ArtistPhoto,
  Blob,
  CountUp,
  Cover,
  Disc,
  Float,
  moodVars,
  Pop,
  Rise,
  Sparkle,
  Squiggle,
  Starburst,
  type Mood,
} from "./ui";

export type Format = "stories" | "scroll" | "recap";

export interface SlideActions {
  share: (kind: ShareKind) => void;
  busy: ShareKind | null;
  restart?: () => void;
  openRecap?: () => void;
}

export interface SlideProps {
  d: WrappedData;
  x: Derived;
  handle: string;
  active: boolean;
  format: Format;
  actions: SlideActions;
}

export interface SlideDef {
  id: string;
  mood: Mood;
  /** ms before stories auto-advance; Infinity waits for the listener */
  duration: number;
  label: string;
  Component: (p: SlideProps) => ReactNode;
}

/* ───────────────────────── frame + type ───────────────────────── */

export function SlideFrame({
  mood,
  format,
  children,
  className = "",
  align = "center",
}: {
  mood: Mood;
  format: Format;
  children: ReactNode;
  className?: string;
  align?: "center" | "start";
}) {
  return (
    <div
      className={`grain @container relative isolate flex h-full w-full flex-col overflow-hidden ${className}`}
      style={moodVars(mood)}
    >
      <div
        className={`relative z-10 mx-auto flex w-full flex-1 flex-col px-[max(1.25rem,6cqw)] ${
          align === "center" ? "justify-center" : "justify-start"
        } ${
          format === "stories"
            ? "max-w-[36rem] pt-[4.75rem] pb-[max(1.5rem,env(safe-area-inset-bottom))]"
            : "max-w-6xl py-20"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

export function Kicker({ children, active, delay = 0 }: { children: ReactNode; active: boolean; delay?: number }) {
  return (
    <Rise active={active} delay={delay} y={12}>
      <p className="mb-[min(5cqw,1.75rem)] inline-flex items-center gap-2 rounded-full border-2 border-current px-3.5 py-1 text-[0.8rem] font-bold uppercase tracking-[0.14em]">
        {children}
      </p>
    </Rise>
  );
}

export function Lede({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`text-[min(6.2cqw,1.9rem)] font-semibold leading-[1.15] tracking-[-0.01em] text-balance ${className}`}>
      {children}
    </p>
  );
}

export function Note({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`text-[min(4.4cqw,1.2rem)] font-medium leading-snug opacity-80 text-pretty ${className}`}>
      {children}
    </p>
  );
}

/** Font size that keeps a name or title on as few lines as possible. */
export function fit(text: string, max: number, min: number, budget = 120) {
  const longestWord = Math.max(1, ...text.split(/\s+/).map((w) => w.length));
  const v = Math.max(min, Math.min(max, budget / longestWord, (budget * 1.9) / Math.max(1, text.length)));
  return `min(${v.toFixed(2)}cqw, ${(v * 0.5).toFixed(2)}rem)`;
}

/** A short beat after a slide opens, for teaser-then-reveal slides. */
function useBeat(active: boolean, ms: number) {
  const reduce = useReducedMotion();
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!active) {
      setOn(false);
      return;
    }
    if (reduce) {
      setOn(true);
      return;
    }
    const t = setTimeout(() => setOn(true), ms);
    return () => clearTimeout(t);
  }, [active, ms, reduce]);
  return on;
}

export function Btn({
  children,
  onClick,
  href,
  variant = "solid",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  variant?: "solid" | "ghost";
  disabled?: boolean;
}) {
  const cls = `pointer-events-auto inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-[0.95rem] font-bold transition-[transform,opacity] duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:hover:translate-y-0 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-current ${
    variant === "solid"
      ? "bg-[var(--ink)] text-[var(--bg)]"
      : "border-2 border-current"
  }`;
  if (href)
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls} data-interactive>
        {children}
      </a>
    );
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls} data-interactive>
      {children}
    </button>
  );
}

/* ───────────────────────── slides ───────────────────────── */

function Intro({ d, handle, active, format }: SlideProps) {
  return (
    <SlideFrame mood="teal" format={format}>
      <Float className="absolute -right-[12cqw] top-[16%] w-[42cqw] max-w-72 text-[var(--pop)]" duration={7}>
        <Starburst className="w-full" points={14} />
      </Float>
      <Float className="absolute -left-[8cqw] bottom-[12%] w-[30cqw] max-w-52 text-[var(--soft)]" duration={9} delay={1}>
        <Blob className="w-full" />
      </Float>

      <Kicker active={active}>teal.fm · year in music</Kicker>
      <h1 className="display condensed relative">
        <Rise active={active} delay={0.05} y={80} as="span" className="block text-[min(46cqw,22rem)]">
          20
        </Rise>
        <Rise active={active} delay={0.15} y={80} as="span" className="block text-[min(46cqw,22rem)] -mt-[0.08em] pl-[0.35em]">
          26
        </Rise>
        <Pop active={active} delay={0.55} tilt={-8} className="absolute left-[50%] top-[38%] w-[30cqw] max-w-44">
          {d.profile_picture ? (
            <img src={d.profile_picture} alt="" className="sticker aspect-square w-full rounded-full object-cover" crossOrigin="anonymous" />
          ) : (
            <Sparkle className="w-full text-[var(--pop)]" />
          )}
        </Pop>
      </h1>
      <Rise active={active} delay={0.4} className="mt-[min(6cqw,2rem)]">
        <Lede>
          hey <span className="rounded-md bg-[var(--ink)] px-1.5 text-[var(--bg)]">@{handle}</span>, let's rewind your year in sound.
        </Lede>
      </Rise>
      <Rise active={active} delay={0.7} className="mt-auto pt-6">
        <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em]">
          {format === "stories" || format === "recap" ? (
            <>
              tap to start
              <motion.span animate={{ x: [0, 6, 0] }} transition={{ repeat: Infinity, duration: 1.2 }}>
                →
              </motion.span>
            </>
          ) : (
            <>
              scroll
              <motion.span animate={{ y: [0, 6, 0] }} transition={{ repeat: Infinity, duration: 1.2 }}>
                ↓
              </motion.span>
            </>
          )}
        </p>
      </Rise>
    </SlideFrame>
  );
}

function Minutes({ d, x, active, format }: SlideProps) {
  const minutes = Math.round(d.total_minutes);
  return (
    <SlideFrame mood="lime" format={format}>
      <Float className="absolute right-[6cqw] top-[18%] w-[18cqw] max-w-28 text-[var(--pop)]" duration={4}>
        <Sparkle className="w-full" />
      </Float>
      <Kicker active={active}>time well spent</Kicker>
      <Rise active={active} delay={0.1}>
        <Lede>you hit play and stayed for</Lede>
      </Rise>
      <Rise active={active} delay={0.2} y={60}>
        <p className="display condensed my-[min(3cqw,1rem)] text-[min(30cqw,15rem)] break-all">
          <CountUp value={minutes} active={active} duration={2.2} delay={0.2} />
        </p>
      </Rise>
      <Rise active={active} delay={0.35}>
        <p className="display text-[min(13cqw,5.5rem)] -mt-[0.1em]">minutes</p>
      </Rise>
      <Rise active={active} delay={1.4} className="mt-[min(7cqw,2.5rem)] space-y-4">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-[var(--ink)] px-3.5 py-1.5 text-sm font-bold text-[var(--bg)] tnum">
            {Math.round(x.hours).toLocaleString()} hours
          </span>
          <span className="rounded-full bg-[var(--ink)] px-3.5 py-1.5 text-sm font-bold text-[var(--bg)] tnum">
            {x.days >= 1 ? `${x.days.toFixed(1)} full days` : `${plural(d.total_plays, "play")}`}
          </span>
        </div>
        <Note>{minutesYardstick(d.total_minutes)}</Note>
      </Rise>
    </SlideFrame>
  );
}

const BUBBLES = [
  { x: 8, y: 6, s: 34, t: -6 },
  { x: 58, y: 0, s: 26, t: 8 },
  { x: 72, y: 34, s: 22, t: -10 },
  { x: 36, y: 30, s: 28, t: 4 },
  { x: 0, y: 46, s: 22, t: 10 },
  { x: 52, y: 62, s: 26, t: -4 },
  { x: 18, y: 72, s: 18, t: -12 },
  { x: 80, y: 70, s: 16, t: 12 },
];

function Discovery({ d, active, format }: SlideProps) {
  const artists = d.top_artists.slice(0, BUBBLES.length);
  const n = d.new_artists_count;
  return (
    <SlideFrame mood="lilac" format={format}>
      <Kicker active={active}>a well-stamped passport</Kicker>
      <div className="relative mb-[min(4cqw,1.5rem)] aspect-[1/0.78] w-full max-w-[34rem]">
        {artists.map((a, i) => {
          const b = BUBBLES[i];
          return (
            <Pop
              key={a.name}
              active={active}
              delay={0.15 + i * 0.08}
              tilt={b.t}
              className="absolute"
              style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.s}%` }}
            >
              <ArtistPhoto name={a.name} src={artistImage(a)} className="sticker aspect-square w-full rounded-full" />
            </Pop>
          );
        })}
      </div>
      <Rise active={active} delay={0.5}>
        <p className="display condensed text-[min(26cqw,12rem)]">
          <CountUp value={n} active={active} delay={0.5} />
        </p>
      </Rise>
      <Rise active={active} delay={0.6}>
        <Lede>different artists made it into your ears this year.</Lede>
      </Rise>
      <Rise active={active} delay={1.2} className="mt-3">
        <Note>
          {n > 500
            ? "you don't have a type. you have every type."
            : n > 150
              ? "always one more name to look up."
              : "a tight little circle, and you love them for it."}
        </Note>
      </Rise>
    </SlideFrame>
  );
}

function TopArtist({ d, active, format }: SlideProps) {
  const a = d.top_artists[0];
  const revealed = useBeat(active, 1500);
  const share = d.total_plays > 0 ? Math.round((a.plays / d.total_plays) * 100) : 0;
  return (
    <SlideFrame mood="pink" format={format}>
      <motion.div
        className="absolute inset-x-[max(1.25rem,6cqw)] top-1/2 -translate-y-1/2"
        animate={{ opacity: revealed ? 0 : active ? 1 : 0, scale: revealed ? 0.9 : 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        aria-hidden={revealed}
      >
        <p className="display text-[min(14cqw,6.5rem)] text-balance">
          and the artist you couldn't stop playing…
        </p>
      </motion.div>

      <div className={revealed ? "" : "pointer-events-none"} aria-hidden={!revealed}>
        <Kicker active={revealed}>your #1 artist</Kicker>
        <div className="relative @2xl:flex @2xl:items-end @2xl:gap-10">
          <Pop active={revealed} tilt={-4} className="relative w-[64cqw] max-w-[22rem] shrink-0">
            <ArtistPhoto name={a.name} src={artistImage(a)} className="sticker aspect-square w-full rounded-[1.6rem]" />
            <Pop active={revealed} delay={0.4} tilt={12} className="absolute -right-[10cqw] -top-[7cqw] w-[30cqw] max-w-40 text-[var(--pop)] @2xl:-right-16 @2xl:-top-10">
              <Starburst className="w-full" />
              <span className="absolute inset-0 grid place-items-center text-center text-[min(5cqw,1.4rem)] font-extrabold leading-none text-[var(--ink)]">
                {share}%<br />
                <span className="text-[0.6em] font-bold">of plays</span>
              </span>
            </Pop>
          </Pop>
          <div className="min-w-0">
            <Rise active={revealed} delay={0.2} y={40}>
              <h2 className="display mt-[min(6cqw,2rem)] break-words" style={{ fontSize: fit(a.name, 20, 9) }}>
                {a.name}
              </h2>
            </Rise>
            <Rise active={revealed} delay={0.45} className="mt-4 flex gap-6 tnum">
              <div>
                <p className="display text-[min(11cqw,4rem)]">
                  <CountUp value={Math.round(a.minutes / 60)} active={revealed} delay={0.4} />
                </p>
                <p className="text-sm font-bold uppercase tracking-[0.12em]">hours</p>
              </div>
              <div>
                <p className="display text-[min(11cqw,4rem)]">
                  <CountUp value={a.plays} active={revealed} delay={0.5} />
                </p>
                <p className="text-sm font-bold uppercase tracking-[0.12em]">plays</p>
              </div>
            </Rise>
            {a.top_track && (
              <Rise active={revealed} delay={0.8} className="mt-5">
                <Note>
                  on repeat: <span className="font-extrabold opacity-100">{a.top_track}</span>
                  {a.top_track_plays ? `, ${plural(a.top_track_plays, "time")}` : ""}.
                </Note>
              </Rise>
            )}
          </div>
        </div>
      </div>
    </SlideFrame>
  );
}

function RowNum({ n }: { n: number }) {
  return (
    <span className="display condensed w-[2ch] shrink-0 text-right text-[min(10cqw,3.25rem)] tnum">
      {n}
    </span>
  );
}

function Rotation({ d, active, format }: SlideProps) {
  const rows = d.top_artists.slice(1, 5);
  return (
    <SlideFrame mood="tangerine" format={format}>
      <Kicker active={active}>heavy rotation</Kicker>
      <Rise active={active} delay={0.05}>
        <h2 className="display mb-[min(6cqw,2rem)] text-[min(14cqw,6rem)]">the rest of your top five</h2>
      </Rise>
      <ol className="space-y-[min(3.5cqw,1rem)]">
        {rows.map((a, i) => (
          <Rise as="li" key={a.name} active={active} delay={0.2 + i * 0.12} y={20} className="flex items-center gap-[min(4cqw,1.25rem)] border-b-2 border-[var(--soft)] pb-[min(3.5cqw,1rem)]">
            <RowNum n={i + 2} />
            <ArtistPhoto name={a.name} src={artistImage(a)} className="aspect-square w-[16cqw] max-w-20 shrink-0 rounded-full border-[3px] border-white" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[min(6.6cqw,2rem)] font-extrabold leading-tight tracking-[-0.02em]">{a.name}</p>
              <p className="text-[min(3.8cqw,1rem)] font-semibold opacity-75 tnum">
                {plural(a.plays, "play")} · {Math.round(a.minutes / 60).toLocaleString()} hrs
              </p>
            </div>
          </Rise>
        ))}
      </ol>
    </SlideFrame>
  );
}

function TopTrack({ d, active, format }: SlideProps) {
  const t = d.top_tracks[0];
  const reduce = useReducedMotion();
  const every = t.plays > 0 ? 365 / t.plays : 0;
  return (
    <SlideFrame mood="cobalt" format={format}>
      <Kicker active={active}>song of the year</Kicker>
      <div className="@2xl:flex @2xl:items-center @2xl:gap-12">
        <div className="relative mb-[min(8cqw,2.5rem)] w-[62cqw] max-w-[22rem] shrink-0 @2xl:mb-0 @2xl:mr-[calc(min(62cqw,22rem)*0.36)]">
          <motion.div
            className="absolute inset-0"
            initial={{ x: 0 }}
            animate={{ x: active ? "34%" : 0 }}
            transition={{ duration: 0.9, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.div
              className="h-full w-full"
              animate={reduce || !active ? undefined : { rotate: 360 }}
              transition={{ duration: 3.2, repeat: Infinity, ease: "linear" }}
            >
              <Disc className="h-full w-full text-[var(--pop)]" />
            </motion.div>
          </motion.div>
          <Pop active={active} tilt={-3} className="relative">
            <Cover title={t.title} artist={t.artist} releaseMbId={t.release_mb_id} className="sticker aspect-square w-full rounded-xl" />
          </Pop>
        </div>
        <div className="min-w-0">
          <Rise active={active} delay={0.3} y={40}>
            <h2 className="display break-words" style={{ fontSize: fit(t.title, 17, 8.5) }}>
              {t.title}
            </h2>
          </Rise>
          <Rise active={active} delay={0.45} className="mt-3">
            <Lede>
              {t.artist}
              {t.release_name && t.release_name !== t.title && <span className="opacity-70"> · {t.release_name}</span>}
            </Lede>
          </Rise>
          <Rise active={active} delay={0.9} className="mt-[min(6cqw,2rem)] flex items-baseline gap-3">
            <span className="display condensed text-[min(20cqw,7rem)] text-[var(--pop)]">
              <CountUp value={t.plays} active={active} delay={0.9} />
            </span>
            <span className="text-lg font-bold">plays</span>
          </Rise>
          <Rise active={active} delay={1.3}>
            <Note>
              {every >= 1
                ? `that's about once every ${Math.round(every)} day${Math.round(every) === 1 ? "" : "s"}. it never got old.`
                : `that's ${(t.plays / 365).toFixed(1)} times a day. we're not judging. (we're a little impressed.)`}
            </Note>
          </Rise>
        </div>
      </div>
    </SlideFrame>
  );
}

function OnRepeat({ d, active, format }: SlideProps) {
  const rows = d.top_tracks.slice(1, 10);
  return (
    <SlideFrame mood="ink" format={format}>
      <Kicker active={active}>on repeat</Kicker>
      <Rise active={active} delay={0.05}>
        <h2 className="display mb-[min(5cqw,1.75rem)] text-[min(12cqw,5.5rem)]">your top ten, continued</h2>
      </Rise>
      <ol className="grid gap-[min(2.4cqw,0.75rem)] @3xl:grid-flow-col @3xl:grid-cols-2 @3xl:grid-rows-5 @3xl:gap-x-10">
        {rows.map((t, i) => (
          <Rise as="li" key={`${t.title}-${t.artist}`} active={active} delay={0.12 + i * 0.07} y={16} className="flex items-center gap-[min(3.4cqw,1rem)]">
            <span className="display condensed w-[2ch] shrink-0 text-right text-[min(7.5cqw,2.4rem)] text-[var(--pop)] tnum">{i + 2}</span>
            <Cover title={t.title} artist={t.artist} releaseMbId={t.release_mb_id} className="aspect-square w-[11cqw] max-w-14 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[min(4.6cqw,1.3rem)] font-extrabold leading-tight">{t.title}</p>
              <p className="truncate text-[min(3.6cqw,0.95rem)] font-medium opacity-70">{t.artist}</p>
            </div>
            <span className="shrink-0 text-[min(3.8cqw,1rem)] font-bold tnum opacity-80">{t.plays}×</span>
          </Rise>
        ))}
      </ol>
    </SlideFrame>
  );
}

function BigThree({ d, x, active, format }: SlideProps) {
  const top = d.top_artists.slice(0, 3);
  const segs = top.map((a) => (d.total_minutes > 0 ? (a.minutes / d.total_minutes) * 100 : 0));
  const colors = ["var(--ink)", "var(--pop)", "#fff"];
  const names =
    top.length === 3
      ? `${top[0].name}, ${top[1].name} and ${top[2].name}`
      : top.map((a) => a.name).join(" and ");
  return (
    <SlideFrame mood="lilac" format={format}>
      <Kicker active={active}>the big {top.length === 3 ? "three" : top.length === 2 ? "two" : "one"}</Kicker>
      <Rise active={active} delay={0.1} y={60}>
        <p className="display condensed text-[min(44cqw,20rem)] tnum">
          <CountUp value={x.top3Share} active={active} />
          <span className="text-[0.5em]">%</span>
        </p>
      </Rise>
      <Rise active={active} delay={0.3}>
        <Lede>of everything you played went to {names}.</Lede>
      </Rise>
      <div className="mt-[min(7cqw,2.5rem)] flex h-[min(12cqw,4rem)] w-full overflow-hidden rounded-full bg-[var(--soft)]" role="img" aria-label={`top artists share: ${x.top3Share}%`}>
        {segs.map((s, i) => (
          <motion.div
            key={i}
            className="h-full first:rounded-l-full"
            style={{ background: colors[i] }}
            initial={{ width: 0 }}
            animate={{ width: active ? `${s}%` : 0 }}
            transition={{ duration: 1, delay: 0.6 + i * 0.25, ease: [0.22, 1, 0.36, 1] }}
          />
        ))}
      </div>
      <Rise active={active} delay={1.5} className="mt-4">
        <Note>
          {x.top3Share >= 40
            ? "loyalty, unmatched. they should be thanking you."
            : x.top3Share >= 20
              ? "you know exactly what you like."
              : "you play the field. everyone gets a turn."}
        </Note>
      </Rise>
    </SlideFrame>
  );
}

function Clock({ x, active, format }: SlideProps) {
  const max = Math.max(1, ...x.localHours);
  const R0 = 26;
  const R1 = 48;
  return (
    <SlideFrame mood={x.persona.night ? "night" : "tangerine"} format={format}>
      {x.persona.night && (
        <>
          {[12, 30, 70, 84, 55].map((l, i) => (
            <Float key={i} className="absolute w-3 text-[var(--pop)]" style={{ left: `${l}%`, top: `${10 + i * 7}%` }} duration={3 + i} amount={4}>
              <Sparkle className="w-full" />
            </Float>
          ))}
        </>
      )}
      <Kicker active={active}>your listening clock</Kicker>
      <div className="@2xl:flex @2xl:items-center @2xl:gap-12">
        <Rise active={active} delay={0.1} className="mx-auto mb-[min(6cqw,2rem)] w-[78cqw] max-w-[24rem] shrink-0 @2xl:mx-0">
          <svg viewBox="0 0 100 100" className="w-full overflow-visible" role="img" aria-label={`plays by hour, peaking at ${hourLabel(x.peakHour, true)}`}>
            <circle cx="50" cy="50" r={R0 - 3} fill="var(--soft)" />
            {x.localHours.map((v, h) => {
              const a = (h / 24) * Math.PI * 2 - Math.PI / 2;
              const len = R0 + (v / max) * (R1 - R0);
              const peak = h === x.peakHour;
              return (
                <motion.line
                  key={h}
                  x1={50 + R0 * Math.cos(a)}
                  y1={50 + R0 * Math.sin(a)}
                  stroke={peak ? "var(--pop)" : "currentColor"}
                  strokeWidth={peak ? 4.2 : 3.2}
                  strokeLinecap="round"
                  initial={{ x2: 50 + R0 * Math.cos(a), y2: 50 + R0 * Math.sin(a) }}
                  animate={
                    active
                      ? { x2: 50 + len * Math.cos(a), y2: 50 + len * Math.sin(a) }
                      : { x2: 50 + R0 * Math.cos(a), y2: 50 + R0 * Math.sin(a) }
                  }
                  transition={{ duration: 0.8, delay: 0.2 + h * 0.03, ease: [0.22, 1, 0.36, 1] }}
                />
              );
            })}
            {[0, 6, 12, 18].map((h) => {
              const a = (h / 24) * Math.PI * 2 - Math.PI / 2;
              return (
                <text key={h} x={50 + 15 * Math.cos(a)} y={50 + 15 * Math.sin(a)} textAnchor="middle" dominantBaseline="central" fontSize="5" fontWeight="700" fill="currentColor" opacity=".7">
                  {hourLabel(h)}
                </text>
              );
            })}
          </svg>
        </Rise>
        <div>
          <Rise active={active} delay={0.6}>
            <p className="text-sm font-bold uppercase tracking-[0.14em] opacity-80">you're a</p>
            <h2 className="display text-[min(17cqw,7.5rem)]">{x.persona.name}</h2>
          </Rise>
          <Rise active={active} delay={0.9} className="mt-3">
            <Lede>
              {x.persona.blurb} peak hour: <span className="text-[var(--pop)]">{hourLabel(x.peakHour, true)}</span>.
            </Lede>
          </Rise>
        </div>
      </div>
    </SlideFrame>
  );
}

function Months({ x, active, format }: SlideProps) {
  const max = Math.max(1, ...x.months);
  return (
    <SlideFrame mood="teal" format={format}>
      <Kicker active={active}>month by month</Kicker>
      <Rise active={active} delay={0.05}>
        <h2 className="display text-[min(15cqw,7rem)]">
          <span className="text-[var(--pop)] [paint-order:stroke] [-webkit-text-stroke:0.06em_var(--ink)]">{MONTHS[x.peakMonth]}</span>
          <br />
          went the hardest.
        </h2>
      </Rise>
      <div className="mt-[min(8cqw,3rem)] flex h-[min(52cqw,18rem)] items-end gap-[1.4%]" role="img" aria-label={`plays by month, peaking in ${MONTHS[x.peakMonth]}`}>
        {x.months.map((v, i) => (
          <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
            <motion.div
              className="w-full rounded-t-[0.6rem] rounded-b-sm"
              style={{ background: i === x.peakMonth ? "var(--pop)" : "var(--ink)" }}
              initial={{ height: 0 }}
              animate={{ height: active ? `${Math.max(2, (v / max) * 100)}%` : 0 }}
              transition={{ duration: 0.8, delay: 0.25 + i * 0.05, ease: [0.22, 1, 0.36, 1] }}
            />
            <span className="text-[min(3.2cqw,0.85rem)] font-bold">{MONTHS[i][0]}</span>
          </div>
        ))}
      </div>
      <Rise active={active} delay={1} className="mt-5">
        <Note>{plural(x.months[x.peakMonth], "play")} in {MONTHS[x.peakMonth]} alone.</Note>
      </Rise>
    </SlideFrame>
  );
}

function Week({ d, active, format }: SlideProps) {
  const wd = d.weekday_avg_minutes / 60;
  const we = d.weekend_avg_minutes / 60;
  const total = wd + we || 1;
  const diff = wd > 0 ? Math.round(((we - wd) / wd) * 100) : 0;
  let line: string;
  if (Math.abs(diff) < 10) line = "monday or saturday, you show up the same. respect.";
  else if (diff > 0) line = `weekends are when you really dig in: ${diff}% more listening.`;
  else line = `weekdays are your lock-in zone: ${Math.round(((wd - we) / Math.max(we, 0.01)) * 100) > 999 ? "way" : `${Math.round(((wd - we) / Math.max(we, 0.01)) * 100)}%`} more than weekends.`;
  return (
    <SlideFrame mood="pink" format={format}>
      <Kicker active={active}>weekday vs weekend</Kicker>
      <div className="grid grid-cols-2 gap-[min(6cqw,2rem)]">
        {[
          { label: "weekdays", v: wd },
          { label: "weekends", v: we },
        ].map((s, i) => (
          <Rise key={s.label} active={active} delay={0.1 + i * 0.15} y={50}>
            <p className="display condensed text-[min(30cqw,12rem)] tnum">
              <CountUp value={s.v} decimals={1} active={active} delay={0.15 + i * 0.15} />
            </p>
            <p className="text-[min(4.4cqw,1.2rem)] font-bold">hrs / day on {s.label}</p>
          </Rise>
        ))}
      </div>
      <div className="mt-[min(8cqw,3rem)] flex h-5 w-full overflow-hidden rounded-full bg-[var(--soft)]">
        <motion.div className="h-full bg-[var(--ink)]" initial={{ width: 0 }} animate={{ width: active ? `${(wd / total) * 100}%` : 0 }} transition={{ duration: 1, delay: 0.6, ease: [0.22, 1, 0.36, 1] }} />
        <motion.div className="h-full bg-[var(--pop)]" initial={{ width: 0 }} animate={{ width: active ? `${(we / total) * 100}%` : 0 }} transition={{ duration: 1, delay: 0.8, ease: [0.22, 1, 0.36, 1] }} />
      </div>
      <Rise active={active} delay={1.1} className="mt-6">
        <Lede>{line}</Lede>
      </Rise>
    </SlideFrame>
  );
}

function Streak({ d, x, active, format }: SlideProps) {
  const start = new Date(Date.UTC(d.year, 0, 1));
  const days = Array.from({ length: 371 }, (_, i) => new Date(start.getTime() + i * 864e5)).filter((dt) => dt.getUTCFullYear() === d.year);
  const offset = (start.getUTCDay() + 6) % 7; // monday-first
  return (
    <SlideFrame mood="lime" format={format}>
      <Kicker active={active}>consistency</Kicker>
      <Rise active={active} delay={0.1} y={60} className="flex items-end gap-3">
        <span className="display condensed text-[min(40cqw,18rem)] tnum">
          <CountUp value={d.longest_streak} active={active} />
        </span>
        <span className="display mb-[0.6em] text-[min(10cqw,4rem)]">
          day
          <br />
          streak
        </span>
      </Rise>
      <Rise active={active} delay={0.3}>
        <Lede>
          {d.longest_streak >= 60
            ? "some people meditate. you just hit play."
            : d.longest_streak >= 30
              ? "music isn't background noise for you. it's the soundtrack."
              : d.longest_streak >= 7
                ? "a full week without skipping a day. keep it going."
                : "every streak starts with day one."}
        </Lede>
      </Rise>
      <Rise active={active} delay={0.6} className="mt-[min(7cqw,2.5rem)]">
        <svg viewBox={`0 0 ${53 * 6} ${7 * 6}`} className="w-full" role="img" aria-label={`${d.days_active} days with music in ${d.year}`}>
          {days.map((dt, i) => {
            const idx = i + offset;
            const col = Math.floor(idx / 7);
            const row = idx % 7;
            const plays = x.byDate.get(dt.toISOString().slice(0, 10)) ?? 0;
            const t = plays / x.maxDay;
            return (
              <rect
                key={i}
                x={col * 6}
                y={row * 6}
                width="5"
                height="5"
                rx="1.4"
                fill={plays ? "var(--ink)" : "var(--soft)"}
                opacity={plays ? 0.35 + 0.65 * Math.min(1, t * 1.6) : 1}
              />
            );
          })}
        </svg>
        <p className="mt-3 text-[min(4cqw,1.05rem)] font-bold tnum">
          music on {d.days_active.toLocaleString()} days of {d.year}
        </p>
      </Rise>
    </SlideFrame>
  );
}

function Marathon({ d, active, format }: SlideProps) {
  const h = Math.floor(d.longest_session_minutes / 60);
  const m = Math.round(d.longest_session_minutes % 60);
  return (
    <SlideFrame mood="cobalt" format={format}>
      <Float className="absolute -right-[10cqw] bottom-[10%] w-[50cqw] max-w-80 text-[var(--pop)] opacity-90" duration={8}>
        <Squiggle className="w-full" />
      </Float>
      <Kicker active={active}>marathon mode</Kicker>
      <Rise active={active} delay={0.1}>
        <Lede>your longest listening session ran</Lede>
      </Rise>
      <Rise active={active} delay={0.25} y={60}>
        <p className="display condensed my-2 text-[min(32cqw,15rem)] tnum">
          {h > 0 && (
            <>
              <CountUp value={h} active={active} delay={0.3} />
              <span className="text-[0.45em] text-[var(--pop)]">h </span>
            </>
          )}
          <CountUp value={m} active={active} delay={0.4} />
          <span className="text-[0.45em] text-[var(--pop)]">m</span>
        </p>
      </Rise>
      <Rise active={active} delay={0.9}>
        <Lede>
          {d.longest_session_minutes >= 300
            ? "no breaks. no skips. just vibes, for hours."
            : d.longest_session_minutes >= 120
              ? "was the playlist just too good to stop?"
              : d.longest_session_minutes >= 60
                ? "an album, front to back. the way it was intended."
                : "quick, focused, perfectly timed."}
        </Lede>
      </Rise>
    </SlideFrame>
  );
}

function DeepCuts({ d, active, format }: SlideProps) {
  const div = Math.round(d.listening_diversity * 100);
  return (
    <SlideFrame mood="tangerine" format={format}>
      <Kicker active={active}>deep cuts</Kicker>
      <div className="grid gap-[min(9cqw,3rem)] @3xl:grid-cols-2">
        <Rise active={active} delay={0.1}>
          <p className="text-sm font-bold uppercase tracking-[0.14em]">average song length</p>
          <p className="display condensed text-[min(30cqw,10rem)] tnum">{fmtDuration(d.avg_track_length_ms)}</p>
          <Note>
            {d.avg_track_length_ms > 300000
              ? "long-time 'abolish the 2 minute song' advocate."
              : d.avg_track_length_ms > 210000
                ? "right in the sweet spot. classic song lengths."
                : "short and sweet. in, hook, out."}
          </Note>
        </Rise>
        <Rise active={active} delay={0.45}>
          <p className="text-sm font-bold uppercase tracking-[0.14em]">unique songs</p>
          <p className="display condensed text-[min(30cqw,10rem)] tnum">
            <CountUp value={div} active={active} delay={0.5} />%
          </p>
          <Note>
            {d.listening_diversity > 0.7
              ? "crate digger. did you find something good?"
              : d.listening_diversity > 0.4
                ? "a healthy mix of old favorites and fresh finds."
                : "when you love a song, you really love it. on loop."}
          </Note>
        </Rise>
      </div>
    </SlideFrame>
  );
}

function Buddies({ d, active, format }: SlideProps) {
  const buddies = (d.similar_users ?? []).slice(0, 3);
  const tags = ["music twin", "taste buddy", "same wavelength"];
  return (
    <SlideFrame mood="teal" format={format}>
      <Kicker active={active}>music buddies</Kicker>
      <Rise active={active} delay={0.05}>
        <h2 className="display mb-[min(6cqw,2rem)] text-[min(13cqw,6rem)]">you're not listening alone.</h2>
      </Rise>
      <ul className="grid grid-cols-1 gap-[min(3.5cqw,1rem)] @3xl:grid-cols-3">
        {buddies.map((b, i) => (
          <Rise as="li" key={b.did} active={active} delay={0.25 + i * 0.15} y={24} className="min-w-0 rounded-[1.4rem] bg-[var(--ink)] p-[min(4cqw,1.25rem)] text-[var(--bg)]">
            <a href={`https://bsky.app/profile/${b.did}`} target="_blank" rel="noopener noreferrer" className="pointer-events-auto flex items-center gap-3 hover:opacity-85" data-interactive>
              {b.profile_picture ? (
                <img src={b.profile_picture} alt="" className="aspect-square w-12 shrink-0 rounded-full border-2 border-[var(--bg)] object-cover" />
              ) : (
                <span className="grid aspect-square w-12 shrink-0 place-items-center rounded-full bg-[var(--pop)] text-lg font-extrabold text-[var(--ink)]">{i + 1}</span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[min(4.6cqw,1.15rem)] font-extrabold">{buddyName(b)}</span>
                <span className="block text-xs font-bold uppercase tracking-[0.12em] text-[var(--pop)]">{tags[i]}</span>
              </span>
            </a>
            {b.shared_artists.length > 0 && (
              <p className="mt-3 text-[min(3.8cqw,0.95rem)] font-medium leading-snug opacity-90">
                you both love {b.shared_artists.slice(0, 3).join(", ")}
                {b.shared_artist_count > 3 ? ` + ${b.shared_artist_count - 3} more` : ""}.
              </p>
            )}
          </Rise>
        ))}
      </ul>
    </SlideFrame>
  );
}

export function ShareRow({ actions, compact = false }: { actions: SlideActions; compact?: boolean }) {
  const items: Array<[ShareKind, string]> = [
    ["summary", "top fives"],
    ["artist", "top artist"],
    ["song", "top song"],
    ["stats", "my stats"],
  ];
  return (
    <div className={`flex flex-wrap ${compact ? "gap-1.5" : "gap-2"}`}>
      {items.map(([k, label]) => (
        <Btn key={k} variant="ghost" onClick={() => actions.share(k)} disabled={actions.busy !== null}>
          {actions.busy === k ? "saving…" : `↓ ${label}`}
        </Btn>
      ))}
    </div>
  );
}

export function bskyIntent(handle: string) {
  const text = `my ${YEAR} year in music, tracked on teal.fm 🎧\n\nhttps://yearinmusic.teal.fm/wrapped/${handle}`;
  return `https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`;
}

function Summary({ d, x, handle, active, format, actions }: SlideProps) {
  return (
    <SlideFrame mood="ink" format={format} align="start">
      <Rise active={active} className="flex items-center gap-3">
        {d.profile_picture && <img src={d.profile_picture} alt="" className="aspect-square w-11 rounded-full border-2 border-[var(--pop)] object-cover" />}
        <p className="min-w-0 truncate text-[min(4.4cqw,1.1rem)] font-bold">@{handle}</p>
      </Rise>
      <Rise active={active} delay={0.05}>
        <h2 className="display mt-[min(4cqw,1.25rem)] text-[min(15cqw,7rem)] text-balance">
          your <span className="text-[var(--pop)]">{d.year}</span>, wrapped up
        </h2>
      </Rise>
      <div className="mt-[min(5cqw,1.75rem)] grid grid-cols-2 gap-x-[min(5cqw,2rem)] gap-y-4">
        {[
          { title: "top artists", rows: d.top_artists.slice(0, 5).map((a) => a.name) },
          { title: "top songs", rows: d.top_tracks.slice(0, 5).map((t) => t.title) },
        ].map((col, ci) => (
          <Rise key={col.title} active={active} delay={0.15 + ci * 0.1}>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-[var(--pop)]">{col.title}</p>
            <ol className="space-y-1">
              {col.rows.map((r, i) => (
                <li key={r + i} className="flex gap-2 text-[min(4.3cqw,1.2rem)] font-bold leading-tight">
                  <span className="w-[1.2ch] shrink-0 opacity-60 tnum">{i + 1}</span>
                  <span className="min-w-0 truncate">{r}</span>
                </li>
              ))}
            </ol>
          </Rise>
        ))}
      </div>
      <Rise active={active} delay={0.35} className="mt-[min(5cqw,1.75rem)] grid grid-cols-3 gap-3 border-t-2 border-[var(--soft)] pt-4">
        {[
          { k: "minutes", v: Math.round(d.total_minutes).toLocaleString(), word: false },
          { k: "day streak", v: d.longest_streak.toLocaleString(), word: false },
          { k: "listener", v: x.persona.name, word: true },
        ].map((s) => (
          <div key={s.k} className="min-w-0">
            <p className={`display leading-none tnum ${s.word ? "text-[min(5.6cqw,2rem)] leading-[0.95]" : "text-[min(7.4cqw,2.6rem)]"}`}>{s.v}</p>
            <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] opacity-70">{s.k}</p>
          </div>
        ))}
      </Rise>
      <Rise active={active} delay={0.5} className="mt-auto pt-6">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] opacity-70">save a card for bluesky</p>
        <ShareRow actions={actions} />
      </Rise>
    </SlideFrame>
  );
}

function Outro({ handle, active, format, actions }: SlideProps) {
  return (
    <SlideFrame mood="pink" format={format}>
      <Float className="absolute -right-[12cqw] bottom-[6%] w-[44cqw] max-w-72 text-[var(--pop)]" duration={7}>
        <Starburst className="w-full" points={10} />
      </Float>
      <Kicker active={active}>that's a wrap</Kicker>
      <Rise active={active} delay={0.1}>
        <h2 className="display text-[min(16cqw,8rem)]">thanks for listening with us.</h2>
      </Rise>
      <Rise active={active} delay={0.35} className="mt-[min(6cqw,2rem)]">
        <p className="text-[min(6cqw,1.8rem)] font-semibold leading-snug">
          here's to another year of finds.
          <br />— <a className="pointer-events-auto font-hand text-[1.5em] font-normal hover:underline" href="https://bsky.app/profile/did:plc:tas6hj2xjrqben5653v5kohk" target="_blank" rel="noopener noreferrer" data-interactive>Matt</a>{" "}
          &{" "}
          <a className="pointer-events-auto font-hand text-[1.5em] font-normal hover:underline" href="https://bsky.app/profile/did:plc:k644h4rq5bjfzcetgsa6tuby" target="_blank" rel="noopener noreferrer" data-interactive>Natalie</a>
        </p>
      </Rise>
      <Rise active={active} delay={0.6} className="mt-[min(8cqw,2.75rem)] flex flex-wrap gap-2">
        {format === "recap" && actions.openRecap && <Btn onClick={actions.openRecap}>see the full recap ↓</Btn>}
        <Btn href={bskyIntent(handle)} variant={format === "recap" ? "ghost" : "solid"}>
          post on bluesky
        </Btn>
        {actions.restart && (
          <Btn variant="ghost" onClick={actions.restart}>
            ↺ play it again
          </Btn>
        )}
      </Rise>
      <Rise active={active} delay={0.75} className="mt-5">
        <Link to="/global-wrapped/$year" params={{ year: String(YEAR) }} className="pointer-events-auto text-[min(4.2cqw,1.05rem)] font-bold underline decoration-2 underline-offset-4 hover:opacity-75" data-interactive>
          see what everyone on teal.fm played →
        </Link>
      </Rise>
    </SlideFrame>
  );
}

/* ───────────────────────── sequence ───────────────────────── */

export function buildSlides(d: WrappedData, x: Derived): SlideDef[] {
  const s: SlideDef[] = [];
  const add = (id: string, mood: Mood, duration: number, label: string, Component: SlideDef["Component"]) =>
    s.push({ id, mood, duration, label, Component });

  add("intro", "teal", 5000, "intro", Intro);
  add("minutes", "lime", 7000, "minutes listened", Minutes);
  if (d.new_artists_count > 0) add("discovery", "lilac", 7000, "artists", Discovery);
  if (d.top_artists.length > 0) add("top-artist", "pink", 9500, "top artist", TopArtist);
  if (d.top_artists.length > 1) add("rotation", "tangerine", 8000, "top five artists", Rotation);
  if (d.top_tracks.length > 0) add("top-track", "cobalt", 8500, "song of the year", TopTrack);
  if (d.top_tracks.length > 1) add("on-repeat", "ink", 9000, "top songs", OnRepeat);
  if (d.top_artists.length > 0) add("big-three", "lilac", 7000, "top artist share", BigThree);
  add("clock", x.persona.night ? "night" : "tangerine", 7500, "listening clock", Clock);
  if (d.activity_graph.length > 0) add("months", "teal", 7000, "months", Months);
  add("week", "pink", 7000, "weekday vs weekend", Week);
  add("streak", "lime", 8000, "streak", Streak);
  if (d.longest_session_minutes > 0) add("marathon", "cobalt", 6500, "longest session", Marathon);
  add("deep-cuts", "tangerine", 8000, "song length and variety", DeepCuts);
  if ((d.similar_users ?? []).length > 0) add("buddies", "teal", 9000, "music buddies", Buddies);
  add("summary", "ink", Infinity, "summary", Summary);
  add("outro", "pink", Infinity, "thanks", Outro);
  return s;
}
