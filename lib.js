/* Reader Reborn — pure helpers (no DOM, no network).
   Shared by app.js (browser) and scripts/smoke-test.mjs (Node).
   All functions are newly written for Kiroween 2026. */

/** Strip HTML tags and decode common entities; collapse whitespace. */
export function stripHtml(html) {
  if (!html) return "";
  let text = String(html).replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  text = text.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'");
  return text.replace(/\s+/g, " ").trim();
}

/** Truncate text to max chars at a word boundary, with an ellipsis. */
export function truncate(text, max = 220) {
  const t = (text || "").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut) + "…";
}

/** Escape text for safe insertion into HTML. */
export function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** First sentence of a text (fallback summary when the AI API fails). */
export function firstSentence(text) {
  const t = (text || "").trim();
  if (!t) return "";
  const m = t.match(/^[^.!?]+[.!?]/);
  return (m ? m[0] : t.split(/\s+/).slice(0, 24).join(" ")).trim();
}

/** Human relative time ("5m ago", "3h ago", "2d ago", else a short date). */
export function relativeTime(iso, nowMs = Date.now()) {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const diff = Math.max(0, nowMs - ms);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ms).toLocaleDateString(undefined,
    { month: "short", day: "numeric", year: "numeric" });
}

/** Article identity: its link URL, falling back to guid. */
export function articleId(a) {
  return (a && (a.link || a.guid || a.title)) || "";
}

/** Build the one-line-summary prompt for the Pollinations text API. */
export function buildSummaryPrompt(title, excerpt) {
  const clean = truncate(stripHtml(excerpt || ""), 500);
  return `Summarize this in one short sentence, no preamble: Title: ${title}. ${clean}`;
}

/**
 * Parse an RSS 2.0 or Atom feed document (XML string) into normalized
 * articles. `parseXml` is injected so this stays DOM-free in Node tests:
 * pass a function (xml) => Document. In the browser it is DOMParser.
 */
export function parseFeedXml(xmlText, parseXml) {
  const doc = parseXml(xmlText);
  const text = (el, tag) => {
    const n = el ? el.getElementsByTagName(tag)[0] : null;
    return n ? (n.textContent || "").trim() : "";
  };
  const pickLink = (el) => {
    // Atom: <link href="…"> (prefer rel=alternate); RSS: <link>text</link>
    const links = el ? el.getElementsByTagName("link") : [];
    for (const l of links) {
      const href = l.getAttribute && l.getAttribute("href");
      const rel = l.getAttribute && l.getAttribute("rel");
      if (href && (!rel || rel === "alternate")) return href.trim();
    }
    return text(el, "link");
  };
  const items = [];
  const rssItems = doc.getElementsByTagName("item");
  for (const it of rssItems) {
    const link = pickLink(it);
    const title = text(it, "title") || link || "(untitled)";
    const desc = text(it, "description") || text(it, "content:encoded") || "";
    items.push({
      title,
      link,
      guid: text(it, "guid") || link,
      pubDate: toISO(text(it, "pubDate")),
      description: truncate(stripHtml(desc)),
    });
  }
  if (items.length === 0) {
    const entries = doc.getElementsByTagName("entry");
    for (const e of entries) {
      const link = pickLink(e);
      const title = text(e, "title") || link || "(untitled)";
      const desc = text(e, "summary") || text(e, "content") || "";
      items.push({
        title,
        link,
        guid: text(e, "id") || link,
        pubDate: toISO(text(e, "updated") || text(e, "published")),
        description: truncate(stripHtml(desc)),
      });
    }
  }
  return items;
}

/** Parse an OPML document (XML string) → [{title, url}]. Recursive outlines. */
export function parseOpml(opmlText, parseXml) {
  const doc = parseXml(opmlText);
  const out = [];
  const seen = new Set();
  const outlines = doc.getElementsByTagName("outline");
  for (const o of outlines) {
    const url = (o.getAttribute("xmlUrl") || o.getAttribute("xmlurl") || "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const title = (o.getAttribute("text") || o.getAttribute("title") || url).trim();
    out.push({ title, url });
  }
  return out;
}

/** Normalize one rss2json item into an article. */
export function normalizeRss2JsonItem(item, feedTitle) {
  const rawDesc = item.content || item.description || "";
  return {
    title: (item.title || "(untitled)").trim(),
    link: (item.link || "").trim(),
    guid: (item.guid || item.link || "").trim(),
    pubDate: toISO(item.pubDate || ""),
    description: truncate(stripHtml(rawDesc)),
    feedTitle,
  };
}

/** Is a digest snapshot fresh enough to use? (default: 36 hours). */
export function isFreshDigest(snapshot, nowMs = Date.now(), maxAgeMs = 36 * 3600 * 1000) {
  if (!snapshot || !Array.isArray(snapshot.items) || snapshot.items.length === 0) return false;
  const t = Date.parse(snapshot.generatedAt || "");
  return !Number.isNaN(t) && (nowMs - t) < maxAgeMs;
}

/** Normalize a date string to ISO; "" when unparseable. */
export function toISO(s) {
  const ms = Date.parse(s || "");
  return Number.isNaN(ms) ? "" : new Date(ms).toISOString();
}
