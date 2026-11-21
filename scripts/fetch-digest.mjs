/* Reader Reborn — daily digest generator (GitHub Actions).
   Node 20+, no dependencies, no secrets, no accounts.
   Fetches the starter feeds via the keyless rss2json API, picks the 10
   newest articles, summarizes each with the keyless Pollinations text API,
   and writes data/daily-digest.json. Exits non-zero without writing if
   nothing could be fetched (so a bad run never clobbers a good snapshot).
   All code newly written for Kiroween 2026. */

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { stripHtml, truncate, firstSentence, buildSummaryPrompt, toISO } from "../lib.js";

const OUT_PATH = path.resolve("data/daily-digest.json");
const TOP_N = 10;
const SUMMARY_DELAY_MS = 600;

const STARTER_FEEDS = [
  { url: "https://news.ycombinator.com/rss", title: "Hacker News" },
  { url: "https://feeds.bbci.co.uk/news/rss.xml", title: "BBC News" },
  { url: "https://www.theverge.com/rss/index.xml", title: "The Verge" },
  { url: "https://feeds.arstechnica.com/arstechnica/index", title: "Ars Technica" },
  { url: "https://xkcd.com/rss.xml", title: "xkcd" },
  { url: "https://www.smashingmagazine.com/feed/", title: "Smashing Magazine" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchFeed(url) {
  const res = await fetch(
    `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`,
    { signal: AbortSignal.timeout(20000) },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.status !== "ok" || !Array.isArray(data.items)) {
    throw new Error(`rss2json: ${data.message || "bad response"}`);
  }
  return { title: data.feed?.title || "", items: data.items };
}

async function summarize(title, excerpt) {
  const prompt = buildSummaryPrompt(title, excerpt);
  try {
    const res = await fetch(
      `https://text.pollinations.ai/${encodeURIComponent(prompt)}`,
      { signal: AbortSignal.timeout(20000) },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = (await res.text()).trim().replace(/^["“]|["”]$/g, "");
    if (!text || text.startsWith("<")) throw new Error("bad response");
    return truncate(text, 280);
  } catch {
    return firstSentence(excerpt) || title; // honest fallback, no fake AI text
  }
}

async function main() {
  const collected = [];
  for (const feed of STARTER_FEEDS) {
    try {
      const { title, items } = await fetchFeed(feed.url);
      const feedTitle = title || feed.title;
      for (const it of items) {
        const link = (it.link || "").trim();
        if (!link) continue;
        collected.push({
          title: (it.title || "(untitled)").trim(),
          link,
          feedTitle,
          pubDate: toISO(it.pubDate || ""),
          excerpt: truncate(stripHtml(it.content || it.description || "")),
        });
      }
      console.log(`ok: ${feedTitle} (${items.length} items)`);
    } catch (err) {
      console.error(`failed: ${feed.title} — ${err.message}`);
    }
  }

  const seen = new Set();
  const top = collected
    .filter((a) => !seen.has(a.link) && seen.add(a.link))
    .sort((a, b) => (Date.parse(b.pubDate || "") || 0) - (Date.parse(a.pubDate || "") || 0))
    .slice(0, TOP_N);

  if (top.length === 0) {
    console.error("No articles fetched from any feed — not writing a snapshot.");
    process.exit(1);
  }

  for (const item of top) {
    item.summary = await summarize(item.title, item.excerpt);
    await sleep(SUMMARY_DELAY_MS);
  }

  const snapshot = {
    generatedAt: new Date().toISOString(),
    source: "github-actions",
    items: top,
  };
  await writeFile(OUT_PATH, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
  console.log(`wrote ${OUT_PATH} (${top.length} items)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
