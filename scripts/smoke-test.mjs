/* Reader Reborn — smoke tests.
   Offline logic tests (pure helpers in lib.js) + tolerant live probes.
   The XML parser here is a small test double: it builds a minimal
   Document-like tree so parseFeedXml/parseOpml can be exercised in Node
   (the browser uses the real DOMParser; the traversal logic is what is
   under test). Live probes warn but never fail the suite.
   Run: node scripts/smoke-test.mjs — exit 0 means the offline suite passed. */

import {
  stripHtml, truncate, escapeHtml, firstSentence, relativeTime,
  articleId, buildSummaryPrompt, parseFeedXml, parseOpml,
  normalizeRss2JsonItem, isFreshDigest, toISO, retryAsync,
} from "../lib.js";

/* ---------- minimal XML test double ---------- */

class MiniEl {
  constructor(tag, attrs = {}) { this.tagName = tag; this.attrs = attrs; this.children = []; }
  getAttribute(name) { return this.attrs[name] ?? null; }
  getElementsByTagName(name) {
    const out = [];
    const walk = (el) => {
      for (const c of el.children) {
        if (c.tagName === name) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }
  get textContent() {
    return this.children.map((c) => (c.tagName === "#text" ? c.text : c.textContent)).join("");
  }
}

function miniParseXml(xml) {
  const root = new MiniEl("#document");
  const stack = [root];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([A-Za-z0-9_:\-\.]+)\s*>|<([A-Za-z0-9_:\-\.]+)((?:\s+[A-Za-z0-9_:\-\.]+=(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m;
  const pushText = (t) => {
    if (!t) return;
    const el = new MiniEl("#text");
    el.text = t;
    stack[stack.length - 1].children.push(el);
  };
  while ((m = re.exec(xml))) {
    if (m[1] !== undefined) { pushText(m[1]); continue; }          // CDATA
    if (m[2]) { if (stack.length > 1) stack.pop(); continue; }       // close tag
    if (m[3]) {                                                      // open tag
      const attrs = {};
      const attrRe = /([A-Za-z0-9_:\-\.]+)=("[^"]*"|'[^']*')/g;
      let am;
      while ((am = attrRe.exec(m[4] || ""))) {
        attrs[am[1]] = am[2].slice(1, -1);
      }
      const el = new MiniEl(m[3], attrs);
      stack[stack.length - 1].children.push(el);
      if (!m[5]) stack.push(el);
      continue;
    }
    if (m[6]) pushText(m[6]);                                        // text
  }
  return root;
}

/* ---------- tiny test harness ---------- */

let passed = 0, failed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log(`  ok: ${name}`); }
  else { failed++; console.log(`  FAIL: ${name}`); }
}

/* ---------- offline tests ---------- */

console.log("offline:");
check("stripHtml removes tags + entities", stripHtml("<p>Hello <b>world</b> &amp; friends</p>") === "Hello world & friends");
check("stripHtml drops script blocks", stripHtml("<script>alert(1)</script>ok") === "ok");
check("truncate cuts at a word", truncate("one two three four five six", 12).endsWith("…") && truncate("one two three four five six", 12).length <= 13);
check("truncate keeps short text", truncate("short", 220) === "short");
check("escapeHtml escapes", escapeHtml('<a href="x">&\'') === "&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
check("firstSentence picks the first sentence", firstSentence("Hello world. Second one here.") === "Hello world.");
check("relativeTime minutes", relativeTime(new Date(Date.now() - 5 * 60000).toISOString()) === "5m ago");
check("relativeTime hours", relativeTime(new Date(Date.now() - 3 * 3600000).toISOString()) === "3h ago");
check("relativeTime bad date is empty", relativeTime("not-a-date") === "");
check("articleId prefers link", articleId({ link: "L", guid: "G" }) === "L");
check("articleId falls back to guid", articleId({ link: "", guid: "G" }) === "G");
check("buildSummaryPrompt includes title", buildSummaryPrompt("T", "E").includes("Title: T"));
check("toISO normalizes", toISO("2026-11-20 18:33:14").startsWith("2026-11-20"));
check("toISO rejects garbage", toISO("garbage") === "");
check("normalizeRss2JsonItem strips excerpt HTML",
  normalizeRss2JsonItem({ title: "T", link: "L", guid: "G", pubDate: "2026-11-20 18:33:14", description: "<p>Hi <a href='#'>there</a></p>" }, "Feed").description === "Hi there");
check("isFreshDigest accepts a fresh snapshot",
  isFreshDigest({ generatedAt: new Date().toISOString(), items: [{ title: "x" }] }));
check("isFreshDigest rejects an old snapshot",
  !isFreshDigest({ generatedAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(), items: [{ title: "x" }] }));
check("isFreshDigest rejects an empty snapshot",
  !isFreshDigest({ generatedAt: new Date().toISOString(), items: [] }));

const RSS_SAMPLE = `<?xml version="1.0"?><rss version="2.0"><channel><title>Sample Feed</title>
<item><title>First Post</title><link>https://example.com/1</link><guid>g1</guid>
<pubDate>Fri, 20 Nov 2026 10:00:00 GMT</pubDate><description><![CDATA[<p>Hello <b>world</b></p>]]></description></item>
<item><title>Second Post</title><link>https://example.com/2</link><guid>g2</guid>
<pubDate>Fri, 20 Nov 2026 09:00:00 GMT</pubDate><description>Plain text</description></item>
</channel></rss>`;
const rssItems = parseFeedXml(RSS_SAMPLE, miniParseXml);
check("RSS parse finds 2 items", rssItems.length === 2);
check("RSS parse reads title/link/date", rssItems[0].title === "First Post" && rssItems[0].link === "https://example.com/1" && rssItems[0].pubDate.startsWith("2026-11-20"));
check("RSS parse strips CDATA HTML", rssItems[0].description === "Hello world");

const ATOM_SAMPLE = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Atom Feed</title>
<entry><title>Atom One</title><link rel="alternate" href="https://example.com/a1"/><id>a1</id>
<updated>2026-11-20T08:00:00Z</updated><summary>Atom summary here.</summary></entry>
</feed>`;
const atomItems = parseFeedXml(ATOM_SAMPLE, miniParseXml);
check("Atom parse finds 1 entry", atomItems.length === 1);
check("Atom parse reads href link", atomItems[0].link === "https://example.com/a1");
check("Atom parse reads summary", atomItems[0].description === "Atom summary here.");

const OPML_SAMPLE = `<?xml version="1.0"?><opml version="2.0"><body>
<outline text="News"><outline text="HN" xmlUrl="https://news.ycombinator.com/rss" htmlUrl="https://news.ycombinator.com/"/>
<outline text="BBC" xmlUrl="https://feeds.bbci.co.uk/news/rss.xml"/></outline>
<outline text="No URL here"/>
<outline text="Dup" xmlUrl="https://news.ycombinator.com/rss"/>
</body></opml>`;
const opmlFeeds = parseOpml(OPML_SAMPLE, miniParseXml);
check("OPML finds nested feeds + dedupes", opmlFeeds.length === 2);
check("OPML keeps title + url", opmlFeeds[0].title === "HN" && opmlFeeds[0].url === "https://news.ycombinator.com/rss");

/* retryAsync — the retry helper the AI summary transport relies on
   (direct Pollinations, then the allorigins proxy fallback). */
{
  let calls = 0;
  const flaky = async () => { calls++; return calls < 3 ? { ok: false, status: 500 } : { ok: true, text: "third time" }; };
  const out = await retryAsync(flaky, 2, [1, 1]);
  check("retryAsync succeeds on 3rd attempt", out.ok && out.text === "third time" && calls === 3);
}
{
  let calls = 0;
  const alwaysFail = async () => { calls++; return { ok: false, status: "network" }; };
  const out = await retryAsync(alwaysFail, 2, [1, 1]);
  check("retryAsync gives up after retries", !out.ok && out.status === "network" && calls === 3);
}
{
  let calls = 0;
  const instant = async () => { calls++; return { ok: true, text: "first" }; };
  const out = await retryAsync(instant, 2, [1, 1]);
  check("retryAsync does not retry success", out.ok && calls === 1);
}
{
  // A 403 must stop direct retries at once (the Turnstile gate is
  // deterministic per browser) so the caller can fall back to the proxy.
  let calls = 0;
  const gated = async () => { calls++; return { ok: false, status: 403 }; };
  const out = await retryAsync(gated, 2, [1, 1], (r) => r.ok || r.status === 403);
  check("retryAsync stops at once on 403", !out.ok && out.status === 403 && calls === 1);
}

/* ---------- live probes (warn-only) ---------- */

console.log("live probes (warn-only):");
async function probe(name, url, validate) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const text = await res.text();
    if (res.ok && validate(text)) console.log(`  ok: ${name}`);
    else console.log(`  WARN: ${name} — unexpected response (HTTP ${res.status})`);
  } catch (err) {
    console.log(`  WARN: ${name} — unreachable from here (${err.message})`);
  }
}
await probe("rss2json (Hacker News)",
  "https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Fnews.ycombinator.com%2Frss",
  (t) => { try { return JSON.parse(t).status === "ok"; } catch { return false; } });
await probe("Pollinations text",
  "https://text.pollinations.ai/Say%20hello%20in%20one%20short%20sentence",
  (t) => t.trim().length > 0 && !t.trim().startsWith("<"));
await probe("Pollinations text via allorigins (proxy fallback)",
  "https://api.allorigins.win/raw?url=" + encodeURIComponent(
    "https://text.pollinations.ai/" + encodeURIComponent(
      "Summarize this in one short sentence, no preamble: Title: Test. The quick brown fox jumps over the lazy dog.")),
  (t) => t.trim().length > 0 && !t.trim().startsWith("<"));

console.log(`\noffline: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
