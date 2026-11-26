import html2canvas from "html2canvas-pro";
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { artistImage, bareMbid, derive, SITE, type WrappedData } from "./data";
import { MOODS, type Mood } from "./ui";

export type ShareKind = "summary" | "artist" | "song" | "stats";

const W = 1080;
const H = 1350;

/** Plain-CSS card shell: html2canvas can't read container units, font-stretch, or color-mix. */
function Card({
  mood,
  innerRef,
  children,
}: {
  mood: Mood;
  innerRef: (el: HTMLDivElement | null) => void;
  children: ReactNode;
}) {
  const m = MOODS[mood];
  return (
    <div
      ref={innerRef}
      className="share-card relative flex flex-col overflow-hidden"
      style={{
        width: W,
        height: H,
        padding: 72,
        background: m.bg,
        color: m.ink,
        fontFamily: '"Bricolage Grotesque", sans-serif',
      }}
    >
      {children}
    </div>
  );
}

const big = (size: number, extra?: CSSProperties): CSSProperties => ({
  fontSize: size,
  fontWeight: 800,
  lineHeight: 0.9,
  letterSpacing: "-0.035em",
  ...extra,
});
const label: CSSProperties = {
  fontSize: 26,
  fontWeight: 700,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
};

function Footer({ handle, avatar, ink }: { handle: string; avatar?: string; ink: string }) {
  return (
    <div className="mt-auto flex items-center justify-between" style={{ borderTop: `4px solid ${ink}`, paddingTop: 28 }}>
      <div className="flex items-center" style={{ gap: 18 }}>
        {avatar && <img src={avatar} alt="" crossOrigin="anonymous" style={{ width: 64, height: 64, borderRadius: 999, objectFit: "cover" }} />}
        <span style={{ fontSize: 34, fontWeight: 700 }}>@{handle}</span>
      </div>
      <span style={{ fontSize: 30, fontWeight: 700 }}>{SITE}</span>
    </div>
  );
}

function coverUrl(id?: string) {
  const bare = bareMbid(id);
  return bare ? `https://coverartarchive.org/release/${bare}/front-500` : undefined;
}

function ShareCards({ d, handle, refs }: { d: WrappedData; handle: string; refs: React.MutableRefObject<Partial<Record<ShareKind, HTMLDivElement | null>>> }) {
  const x = derive(d);
  const a = d.top_artists[0];
  const t = d.top_tracks[0];
  const set = (k: ShareKind) => (el: HTMLDivElement | null) => {
    refs.current[k] = el;
  };
  const h = Math.floor(d.longest_session_minutes / 60);
  const mm = Math.round(d.longest_session_minutes % 60);

  return (
    <div aria-hidden style={{ position: "fixed", left: -20000, top: 0, pointerEvents: "none" }}>
      {/* top fives */}
      <Card mood="teal" innerRef={set("summary")}>
        <p style={label}>my {d.year} year in music</p>
        <p style={big(230, { marginTop: 28 })}>{Math.round(d.total_minutes).toLocaleString()}</p>
        <p style={big(84, { marginTop: 6 })}>minutes</p>
        <div className="grid grid-cols-2" style={{ gap: 48, marginTop: 72 }}>
          {[
            { title: "top artists", rows: d.top_artists.slice(0, 5).map((r) => r.name) },
            { title: "top songs", rows: d.top_tracks.slice(0, 5).map((r) => r.title) },
          ].map((c) => (
            <div key={c.title} style={{ minWidth: 0 }}>
              <p style={{ ...label, marginBottom: 22, background: MOODS.teal.ink, color: MOODS.teal.pop, display: "inline-block", padding: "6px 16px", borderRadius: 999 }}>{c.title}</p>
              {c.rows.map((r, i) => (
                <p key={r + i} style={{ fontSize: 42, fontWeight: 800, lineHeight: 1.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: "-0.02em" }}>
                  <span style={{ opacity: 0.55, marginRight: 14 }}>{i + 1}</span>
                  {r}
                </p>
              ))}
            </div>
          ))}
        </div>
        <Footer handle={handle} avatar={d.profile_picture} ink={MOODS.teal.ink} />
      </Card>

      {/* top artist */}
      {a && (
        <Card mood="pink" innerRef={set("artist")}>
          <p style={label}>my #1 artist of {d.year}</p>
          <div style={{ marginTop: 56, display: "flex", justifyContent: "center" }}>
            {artistImage(a) ? (
              <img src={artistImage(a)} alt="" crossOrigin="anonymous" style={{ width: 640, height: 640, objectFit: "cover", borderRadius: 40, border: "16px solid #fff", transform: "rotate(-3deg)" }} />
            ) : (
              <div style={{ width: 640, height: 640, borderRadius: 40, border: "16px solid #fff", background: MOODS.pink.pop, display: "grid", placeItems: "center", transform: "rotate(-3deg)", ...big(220) }}>
                {a.name.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>
          <p style={big(a.name.length > 14 ? 96 : 140, { marginTop: 56, wordBreak: "break-word" })}>{a.name}</p>
          <p style={{ fontSize: 44, fontWeight: 700, marginTop: 22 }}>
            {Math.round(a.minutes / 60).toLocaleString()} hours · {a.plays.toLocaleString()} plays
          </p>
          <Footer handle={handle} avatar={d.profile_picture} ink={MOODS.pink.ink} />
        </Card>
      )}

      {/* song of the year */}
      {t && (
        <Card mood="cobalt" innerRef={set("song")}>
          <p style={label}>my song of {d.year}</p>
          <div style={{ position: "relative", marginTop: 56, width: 600, height: 600 }}>
            <div style={{ position: "absolute", left: 230, top: 0, width: 600, height: 600, borderRadius: 999, background: "#111", display: "grid", placeItems: "center" }}>
              <div style={{ width: 200, height: 200, borderRadius: 999, background: MOODS.cobalt.pop }} />
            </div>
            {coverUrl(t.release_mb_id) ? (
              <img src={coverUrl(t.release_mb_id)} alt="" crossOrigin="anonymous" style={{ position: "relative", width: 600, height: 600, objectFit: "cover", borderRadius: 20, border: "14px solid #fff" }} />
            ) : (
              <div style={{ position: "relative", width: 600, height: 600, borderRadius: 20, border: "14px solid #fff", background: "#111", color: MOODS.cobalt.pop, display: "grid", placeItems: "center", ...big(200) }}>♪</div>
            )}
          </div>
          <p style={big(t.title.length > 18 ? 92 : 128, { marginTop: 60, wordBreak: "break-word" })}>{t.title}</p>
          <p style={{ fontSize: 46, fontWeight: 700, marginTop: 18 }}>{t.artist}</p>
          <p style={{ fontSize: 40, fontWeight: 700, marginTop: 10, color: MOODS.cobalt.pop }}>{t.plays.toLocaleString()} plays</p>
          <Footer handle={handle} avatar={d.profile_picture} ink={MOODS.cobalt.ink} />
        </Card>
      )}

      {/* stats */}
      <Card mood="lime" innerRef={set("stats")}>
        <p style={label}>my {d.year} in numbers</p>
        <div className="grid grid-cols-2" style={{ gap: "56px 48px", marginTop: 64 }}>
          {[
            { v: Math.round(d.total_minutes).toLocaleString(), k: "minutes" },
            { v: d.total_plays.toLocaleString(), k: "plays" },
            { v: d.new_artists_count.toLocaleString(), k: "artists" },
            { v: `${d.longest_streak}`, k: "day streak" },
            { v: h > 0 ? `${h}h ${mm}m` : `${mm}m`, k: "longest session" },
            { v: `${Math.round(d.listening_diversity * 100)}%`, k: "unique songs" },
          ].map((s) => (
            <div key={s.k} style={{ borderTop: `4px solid ${MOODS.lime.ink}`, paddingTop: 22 }}>
              <p style={big(s.v.length > 7 ? 104 : 128)}>{s.v}</p>
              <p style={{ ...label, marginTop: 14 }}>{s.k}</p>
            </div>
          ))}
        </div>
        <p style={{ ...big(76), marginTop: 64 }}>
          certified <span style={{ background: MOODS.lime.ink, color: MOODS.lime.bg, padding: "0 14px", borderRadius: 14 }}>{x.persona.name}</span>
        </p>
        <Footer handle={handle} avatar={d.profile_picture} ink={MOODS.lime.ink} />
      </Card>
    </div>
  );
}

export function useShare(d: WrappedData | null, handle: string) {
  const refs = useRef<Partial<Record<ShareKind, HTMLDivElement | null>>>({});
  const [busy, setBusy] = useState<ShareKind | null>(null);

  const share = async (kind: ShareKind) => {
    const el = refs.current[kind];
    if (!el || !d) return;
    setBusy(kind);
    try {
      await document.fonts.ready;
      await Promise.all(
        Array.from(el.querySelectorAll("img")).map((img) =>
          img.complete ? null : new Promise((r) => ((img.onload = r), (img.onerror = r))),
        ),
      );
      const canvas = await html2canvas(el, {
        backgroundColor: null,
        scale: 1,
        width: W,
        height: H,
        useCORS: true,
        logging: false,
      });
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
      if (!blob) throw new Error("couldn't render image");
      const file = new File([blob], `teal-${d.year}-${kind}-${handle}.png`, { type: "image/png" });

      // phones: hand it to the share sheet; everywhere else: download
      if (navigator.canShare?.({ files: [file] }) && matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ files: [file] }).catch(() => {});
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = file.name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (err) {
      console.error("share image failed", err);
    } finally {
      setBusy(null);
    }
  };

  const cards = d ? <ShareCards d={d} handle={handle} refs={refs} /> : null;
  return { cards, share, busy };
}
