import { API_BASE, SITE, YEAR } from "./data";

export function wrappedHead(handle: string) {
  const title = `@${handle}'s ${YEAR} year in music · teal.fm`;
  const description = `${handle}'s ${YEAR} in music, as tracked by teal.fm.`;
  const image = `${API_BASE}/api/wrapped/${YEAR}/og?handle=${encodeURIComponent(handle)}`;
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: `see what @${handle} listened to in ${YEAR}.` },
      { property: "og:image", content: image },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `https://${SITE}/wrapped/${handle}` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:image", content: image },
    ],
  };
}
