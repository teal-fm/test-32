import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { YEAR } from "@/wrapped/data";
import { Blob, Float, moodVars, MOODS, Pop, Rise, Sparkle, Starburst } from "@/wrapped/ui";

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    meta: [
      { title: `teal.fm year in music ${YEAR}` },
      { name: "description", content: `your ${YEAR} in music, as tracked by teal.fm.` },
    ],
  }),
});

const FORMATS = [
  { id: "stories", label: "stories", hint: "tap through, one at a time" },
  { id: "scroll", label: "scroll", hint: "one long ride" },
  { id: "recap", label: "stories + recap", hint: "then everything at once" },
] as const;
type FormatId = (typeof FORMATS)[number]["id"];

const TICKER = ["minutes listened", "top artists", "song of the year", "listening clock", "streaks", "marathon sessions", "music buddies", "deep cuts"];
const TICKER_MOODS = ["lime", "lilac", "pink", "tangerine", "cobalt"] as const;

function Home() {
  const [handle, setHandle] = useState("");
  const [format, setFormat] = useState<FormatId>("stories");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const reduce = useReducedMotion();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const h = handle.trim().replace(/^@/, "").replace(/^https?:\/\/bsky\.app\/profile\//, "");
    if (!h) {
      setError("type your bluesky handle first");
      return;
    }
    setError("");
    if (format === "stories") navigate({ to: "/wrapped/$handle", params: { handle: h } });
    else if (format === "scroll") navigate({ to: "/wrapped/$handle/scroll", params: { handle: h } });
    else navigate({ to: "/wrapped/$handle/recap", params: { handle: h } });
  };

  return (
    <div className="grain @container relative isolate flex min-h-dvh flex-col overflow-hidden" style={moodVars("teal")}>
      <Float className="absolute -right-[8vw] top-[6vh] w-[min(42vw,22rem)] text-[var(--pop)]" duration={8}>
        <Starburst className="w-full" points={14} />
      </Float>
      <Float className="absolute -left-[10vw] top-[46vh] w-[min(36vw,18rem)] text-[var(--soft)]" duration={10} delay={1}>
        <Blob className="w-full" />
      </Float>
      <Float className="absolute right-[18vw] bottom-[22vh] hidden w-[min(9vw,4.5rem)] text-[var(--ink)] md:block" duration={4} amount={6}>
        <Sparkle className="w-full" />
      </Float>

      <header className="relative z-10 flex items-center justify-between px-5 pt-5 sm:px-8 sm:pt-7">
        <a href="https://teal.fm" className="rounded-full border-2 border-current px-3 py-1 text-sm font-bold hover:bg-black/10">
          teal.fm
        </a>
        <Link to="/global-wrapped/$year" params={{ year: String(YEAR) }} className="text-sm font-bold underline decoration-2 underline-offset-4 hover:opacity-75">
          global stats →
        </Link>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-5 py-10 sm:px-8">
        <h1 className="display text-[clamp(3.6rem,15vw,12.5rem)]">
          <Rise active as="span" className="block">
            your
          </Rise>
          <Rise active delay={0.08} as="span" className="block">
            <span className="relative inline-block">
              <span className="condensed inline-block rounded-[0.12em] bg-[var(--ink)] px-[0.08em] text-[var(--pop)]">{YEAR}</span>
              <Pop active delay={0.5} tilt={10} className="absolute -right-[0.32em] -top-[0.22em] w-[0.5em]">
                <div style={{ color: MOODS.pink.bg }}>
                  <Sparkle className="w-full" />
                </div>
              </Pop>
            </span>
          </Rise>
          <Rise active delay={0.16} as="span" className="block">
            in music.
          </Rise>
        </h1>

        <Rise active delay={0.3} className="mt-6 max-w-xl">
          <p className="text-[clamp(1.15rem,2.4vw,1.6rem)] font-semibold leading-snug">
            every play you scrobbled with teal.fm, turned into one very loud look back.
          </p>
        </Rise>

        <Rise active delay={0.4} className="mt-9 w-full max-w-2xl">
          <form onSubmit={submit} noValidate>
            <label htmlFor="handle" className="mb-2 block text-xs font-bold uppercase tracking-[0.14em]">
              your bluesky handle
            </label>
            <div className="flex flex-col gap-2 rounded-[2rem] bg-[var(--ink)] p-2 sm:flex-row sm:rounded-full">
              <div className="flex min-h-14 flex-1 items-center gap-1 rounded-full bg-[var(--bg)] px-5">
                <span className="text-xl font-bold opacity-60" aria-hidden>
                  @
                </span>
                <input
                  id="handle"
                  value={handle}
                  onChange={(e) => {
                    setHandle(e.target.value);
                    if (error) setError("");
                  }}
                  placeholder="you.bsky.social"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="url"
                  aria-invalid={!!error}
                  aria-describedby={error ? "handle-error" : undefined}
                  className="min-w-0 flex-1 bg-transparent text-xl font-bold outline-none placeholder:text-[var(--ink)]/40"
                />
              </div>
              <motion.button
                type="submit"
                whileHover={reduce ? undefined : { scale: 1.03 }}
                whileTap={reduce ? undefined : { scale: 0.97 }}
                className="min-h-14 rounded-full bg-[var(--pop)] px-7 text-lg font-extrabold text-[var(--ink)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--pop)]"
              >
                play my year →
              </motion.button>
            </div>
            <p id="handle-error" role="alert" className="mt-2 min-h-6 pl-5 text-sm font-bold">
              {error}
            </p>

            <fieldset className="mt-3">
              <legend className="mb-2 text-xs font-bold uppercase tracking-[0.14em]">how do you want to watch it?</legend>
              <div className="flex flex-wrap gap-2">
                {FORMATS.map((f) => (
                  <label
                    key={f.id}
                    className="cursor-pointer rounded-full border-2 border-[var(--ink)] px-4 py-2 transition-colors has-[:checked]:bg-[var(--ink)] has-[:checked]:text-[var(--bg)] has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--ink)]"
                  >
                    <input type="radio" name="format" value={f.id} checked={format === f.id} onChange={() => setFormat(f.id)} className="sr-only" />
                    <span className="block text-sm font-extrabold leading-tight">{f.label}</span>
                    <span className="block text-xs font-medium opacity-75">{f.hint}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </form>
        </Rise>
      </main>

      {/* what's inside */}
      <div className="relative z-10 overflow-hidden border-t-2 border-[var(--ink)] py-3" aria-hidden>
        <motion.div
          className="flex w-max gap-3"
          animate={reduce ? undefined : { x: ["0%", "-50%"] }}
          transition={{ duration: 38, repeat: Infinity, ease: "linear" }}
        >
          {[...TICKER, ...TICKER].map((t, i) => {
            const m = MOODS[TICKER_MOODS[i % TICKER_MOODS.length]];
            return (
              <span key={i} className="whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-extrabold" style={{ background: m.bg, color: m.ink }}>
                {t}
              </span>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}
