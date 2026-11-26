import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { artistImage, plural, useGlobalWrapped, type GlobalWrappedData } from "@/wrapped/data";
import { ScrollDeck, type DeckSection } from "@/wrapped/formats";
import { fit, Kicker, Lede, Note, SlideFrame } from "@/wrapped/slides";
import { ArtistPhoto, CountUp, Cover, Disc, ErrorScreen, Float, LoadingScreen, Pop, Rise, Sparkle, Starburst } from "@/wrapped/ui";

export const Route = createFileRoute("/global-wrapped/$year")({
  component: GlobalWrapped,
  head: ({ params }) => ({
    meta: [
      { title: `everyone's ${params.year} on teal.fm` },
      { name: "description", content: `the whole teal.fm community's ${params.year} in music.` },
    ],
  }),
});

function GlobalWrapped() {
  const { year } = Route.useParams();
  const state = useGlobalWrapped(year);
  if (state.status === "loading") return <LoadingScreen label="adding up everyone's plays" />;
  if (state.status === "error")
    return (
      <ErrorScreen title="hmm." message={state.message}>
        <Link to="/" className="inline-flex min-h-12 items-center rounded-full bg-[var(--ink)] px-6 font-bold text-[var(--bg)]">
          back home
        </Link>
      </ErrorScreen>
    );
  return <ScrollDeck badge={`teal.fm · everyone · ${year}`} sections={globalSections(state.data)} />;
}

function Percentiles({ title, data, active, format, delay = 0 }: { title: string; data: Array<[number, number]>; active: boolean; format: (v: number) => string; delay?: number }) {
  const rows = data.filter(([p]) => p < 100);
  const logs = rows.map(([, v]) => Math.log10(Math.max(1, v)));
  const max = Math.max(1, ...logs);
  const median = data.find(([p]) => p === 50)?.[1] ?? 0;
  const top = data.find(([p]) => p === 95)?.[1] ?? rows[rows.length - 1]?.[1] ?? 0;
  return (
    <Rise active={active} delay={delay}>
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em]">{title}</p>
      <div className="flex h-24 items-end gap-[2px]" role="img" aria-label={`${title}: median ${format(median)}, top 5% ${format(top)}`}>
        {logs.map((l, i) => (
          <motion.div
            key={i}
            className="flex-1 rounded-t-sm"
            style={{ background: rows[i][0] === 50 ? "var(--pop)" : "var(--ink)" }}
            initial={{ height: 0 }}
            animate={{ height: active ? `${Math.max(3, (l / max) * 100)}%` : 0 }}
            transition={{ duration: 0.7, delay: delay + i * 0.025, ease: [0.22, 1, 0.36, 1] }}
          />
        ))}
      </div>
      <p className="mt-2 text-sm font-semibold tnum">
        median <span className="font-extrabold">{format(median)}</span> · top 5% <span className="font-extrabold">{format(top)}+</span>
      </p>
    </Rise>
  );
}

function globalSections(g: GlobalWrappedData): DeckSection[] {
  const s: DeckSection[] = [];
  const a = g.top_artists[0];
  const t = g.top_tracks[0];
  const hours = Math.round(g.verified_minutes / 60);

  s.push({
    id: "intro",
    label: "intro",
    mood: "cobalt",
    render: (active) => (
      <SlideFrame mood="cobalt" format="scroll">
        <Float className="absolute -right-[6cqw] top-[12%] w-[34cqw] max-w-80 text-[var(--pop)]" duration={8}>
          <Starburst className="w-full" points={16} />
        </Float>
        <Kicker active={active}>teal.fm · everyone</Kicker>
        <Rise active={active} delay={0.05} y={80}>
          <h1 className="display condensed text-[min(42cqw,22rem)]">{g.year}</h1>
        </Rise>
        <Rise active={active} delay={0.3} className="max-w-2xl">
          <Lede>the whole community's year in music, added up. scroll ↓</Lede>
        </Rise>
      </SlideFrame>
    ),
  });

  s.push({
    id: "listeners",
    label: "listeners",
    mood: "lime",
    render: (active) => (
      <SlideFrame mood="lime" format="scroll">
        <Kicker active={active}>the community</Kicker>
        <Rise active={active} delay={0.1} y={60}>
          <p className="display condensed text-[min(40cqw,20rem)] tnum">
            <CountUp value={g.total_users} active={active} />
          </p>
        </Rise>
        <Rise active={active} delay={0.3} className="max-w-2xl">
          <Lede>listeners scrobbled their {g.year} to teal.fm, every play stored in their own atproto repo.</Lede>
        </Rise>
      </SlideFrame>
    ),
  });

  s.push({
    id: "hours",
    label: "hours",
    mood: "teal",
    render: (active) => (
      <SlideFrame mood="teal" format="scroll">
        <Kicker active={active}>together, we listened to</Kicker>
        <Rise active={active} delay={0.1} y={60}>
          <p className="display condensed text-[min(30cqw,16rem)] tnum">
            <CountUp value={hours} active={active} duration={2.4} />
          </p>
        </Rise>
        <Rise active={active} delay={0.25}>
          <p className="display text-[min(10cqw,5rem)]">hours of music</p>
        </Rise>
        <Rise active={active} delay={0.6} className="mt-5 max-w-xl">
          <Note>that's {Math.round(hours / 24).toLocaleString()} days back to back, counting only plays matched to MusicBrainz.</Note>
        </Rise>
      </SlideFrame>
    ),
  });

  s.push({
    id: "catalog",
    label: "artists and songs",
    mood: "lilac",
    render: (active) => (
      <SlideFrame mood="lilac" format="scroll">
        <Kicker active={active}>a very big crate</Kicker>
        <div className="grid gap-[min(6cqw,3rem)] @3xl:grid-cols-2">
          {[
            { v: g.unique_artists, k: "different artists" },
            { v: g.unique_tracks, k: "different songs" },
          ].map((x, i) => (
            <Rise key={x.k} active={active} delay={0.1 + i * 0.2} y={50}>
              <p className="display condensed text-[min(26cqw,13rem)] tnum">
                <CountUp value={x.v} active={active} delay={0.1 + i * 0.2} />
              </p>
              <p className="display text-[min(8cqw,3.5rem)]">{x.k}</p>
            </Rise>
          ))}
        </div>
      </SlideFrame>
    ),
  });

  if (a)
    s.push({
      id: "top-artist",
      label: "top artist",
      mood: "pink",
      render: (active) => (
        <SlideFrame mood="pink" format="scroll">
          <Kicker active={active}>teal.fm's #1 artist</Kicker>
          <div className="@2xl:flex @2xl:items-end @2xl:gap-12">
            <Pop active={active} tilt={-4} className="relative w-[60cqw] max-w-[24rem] shrink-0">
              <ArtistPhoto name={a.name} src={artistImage(a)} className="sticker aspect-square w-full rounded-[1.6rem]" />
              <Pop active={active} delay={0.4} tilt={12} className="absolute -right-10 -top-8 w-32 text-[var(--pop)]">
                <Sparkle className="w-full" />
              </Pop>
            </Pop>
            <div className="min-w-0">
              <Rise active={active} delay={0.2} y={40}>
                <h2 className="display mt-6 break-words" style={{ fontSize: fit(a.name, 18, 9) }}>
                  {a.name}
                </h2>
              </Rise>
              <Rise active={active} delay={0.4} className="mt-4">
                <Lede>
                  {plural(a.plays, "play")} · {Math.round(a.minutes / 60).toLocaleString()} hours across the whole network.
                </Lede>
              </Rise>
            </div>
          </div>
        </SlideFrame>
      ),
    });

  if (g.top_artists.length > 1)
    s.push({
      id: "artists",
      label: "top artists",
      mood: "tangerine",
      render: (active) => (
        <SlideFrame mood="tangerine" format="scroll">
          <Kicker active={active}>everyone's rotation</Kicker>
          <ol className="grid gap-x-10 gap-y-[min(3cqw,1rem)] @3xl:grid-flow-col @3xl:grid-cols-2 @3xl:grid-rows-5">
            {g.top_artists.slice(1, 10).map((x, i) => (
              <Rise as="li" key={x.name} active={active} delay={0.1 + i * 0.06} y={16} className="flex items-center gap-4 border-b-2 border-[var(--soft)] pb-[min(3cqw,1rem)]">
                <span className="display condensed w-[2ch] shrink-0 text-right text-[min(9cqw,3rem)] tnum">{i + 2}</span>
                <ArtistPhoto name={x.name} src={artistImage(x)} className="aspect-square w-14 shrink-0 rounded-full border-[3px] border-white" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[min(5.5cqw,1.6rem)] font-extrabold leading-tight">{x.name}</p>
                  <p className="text-sm font-semibold opacity-75 tnum">{plural(x.plays, "play")}</p>
                </div>
              </Rise>
            ))}
          </ol>
        </SlideFrame>
      ),
    });

  if (t)
    s.push({
      id: "top-track",
      label: "top song",
      mood: "cobalt",
      render: (active) => (
        <SlideFrame mood="cobalt" format="scroll">
          <Kicker active={active}>teal.fm's song of the year</Kicker>
          <div className="@2xl:flex @2xl:items-center @2xl:gap-14">
            <div className="relative mb-8 w-[58cqw] max-w-[22rem] shrink-0 @2xl:mb-0 @2xl:mr-[calc(min(58cqw,22rem)*0.36)]">
              <motion.div className="absolute inset-0" animate={{ x: active ? "34%" : 0, rotate: active ? 180 : 0 }} transition={{ duration: 1.1, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}>
                <Disc className="h-full w-full text-[var(--pop)]" />
              </motion.div>
              <Pop active={active} tilt={-3} className="relative">
                <Cover title={t.title} artist={t.artist} releaseMbId={t.release_mb_id} className="sticker aspect-square w-full rounded-xl" />
              </Pop>
            </div>
            <div className="min-w-0">
              <Rise active={active} delay={0.25} y={40}>
                <h2 className="display break-words" style={{ fontSize: fit(t.title, 16, 8.5) }}>
                  {t.title}
                </h2>
              </Rise>
              <Rise active={active} delay={0.4} className="mt-3">
                <Lede>
                  {t.artist} · <span className="text-[var(--pop)]">{plural(t.plays, "play")}</span>
                </Lede>
              </Rise>
            </div>
          </div>
        </SlideFrame>
      ),
    });

  if (g.top_tracks.length > 1)
    s.push({
      id: "tracks",
      label: "top songs",
      mood: "ink",
      render: (active) => (
        <SlideFrame mood="ink" format="scroll">
          <Kicker active={active}>on everyone's repeat</Kicker>
          <ol className="grid gap-x-10 gap-y-3 @3xl:grid-flow-col @3xl:grid-cols-2 @3xl:grid-rows-5">
            {g.top_tracks.slice(1, 10).map((x, i) => (
              <Rise as="li" key={`${x.title}-${x.artist}`} active={active} delay={0.1 + i * 0.06} y={16} className="flex items-center gap-3">
                <span className="display condensed w-[2ch] shrink-0 text-right text-[min(8cqw,2.5rem)] text-[var(--pop)] tnum">{i + 2}</span>
                <Cover title={x.title} artist={x.artist} releaseMbId={x.release_mb_id} className="h-14 w-14 shrink-0 rounded-md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[min(4.8cqw,1.3rem)] font-extrabold leading-tight">{x.title}</p>
                  <p className="truncate text-sm font-medium opacity-70">{x.artist}</p>
                </div>
                <span className="shrink-0 text-sm font-bold tnum">{x.plays}×</span>
              </Rise>
            ))}
          </ol>
        </SlideFrame>
      ),
    });

  s.push({
    id: "spread",
    label: "how much people listened",
    mood: "lime",
    render: (active) => (
      <SlideFrame mood="lime" format="scroll">
        <Kicker active={active}>where do you land?</Kicker>
        <Rise active={active} delay={0.05}>
          <h2 className="display mb-[min(6cqw,2.5rem)] text-[min(12cqw,6rem)]">every listener, lined up.</h2>
        </Rise>
        <div className="grid gap-x-10 gap-y-8 @2xl:grid-cols-2">
          <Percentiles title="hours listened" data={g.distribution.minutes_percentiles} active={active} format={(v) => `${(v / 60).toFixed(v < 600 ? 1 : 0)}h`} delay={0.1} />
          <Percentiles title="plays" data={g.distribution.plays_percentiles} active={active} format={(v) => Math.round(v).toLocaleString()} delay={0.2} />
          <Percentiles title="different artists" data={g.distribution.artists_percentiles} active={active} format={(v) => Math.round(v).toLocaleString()} delay={0.3} />
          <Percentiles title="different songs" data={g.distribution.tracks_percentiles} active={active} format={(v) => Math.round(v).toLocaleString()} delay={0.4} />
        </div>
        <Rise active={active} delay={0.8} className="mt-6">
          <Note>bars run from the lightest listener to the top 5%, on a log scale. the bright bar is the median.</Note>
        </Rise>
      </SlideFrame>
    ),
  });

  s.push({
    id: "outro",
    label: "thanks",
    mood: "pink",
    render: (active) => (
      <SlideFrame mood="pink" format="scroll">
        <Kicker active={active}>that's everyone</Kicker>
        <Rise active={active} delay={0.1}>
          <h2 className="display text-[min(14cqw,8rem)]">thanks for making {g.year} sound like this.</h2>
        </Rise>
        <Rise active={active} delay={0.3} className="mt-6">
          <p className="text-[min(6cqw,1.8rem)] font-semibold">
            —{" "}
            <a className="font-hand text-[1.5em] font-normal hover:underline" href="https://bsky.app/profile/did:plc:tas6hj2xjrqben5653v5kohk" target="_blank" rel="noopener noreferrer">
              Matt
            </a>{" "}
            &{" "}
            <a className="font-hand text-[1.5em] font-normal hover:underline" href="https://bsky.app/profile/did:plc:k644h4rq5bjfzcetgsa6tuby" target="_blank" rel="noopener noreferrer">
              Natalie
            </a>
          </p>
        </Rise>
        <Rise active={active} delay={0.5} className="mt-8">
          <Link to="/" className="inline-flex min-h-12 items-center rounded-full bg-[var(--ink)] px-6 font-bold text-[var(--bg)] hover:-translate-y-0.5 transition-transform">
            now see your own year →
          </Link>
        </Rise>
      </SlideFrame>
    ),
  });

  return s;
}
