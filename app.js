/* Reader Reborn — application logic (ES module).
   Free, keyless, client-side only. All code newly written for Kiroween 2026.
   Sections: Constants / Store / Fetch / Summarize / Render / Events / Init. */

import {
  stripHtml, truncate, escapeHtml, firstSentence, relativeTime,
  articleId, buildSummaryPrompt, parseFeedXml, parseOpml,
  normalizeRss2JsonItem, isFreshDigest, toISO,
} from "./lib.js";

/* ============================== Constants ============================== */

const STORE_KEY = "reader-reborn-v1";
const DIGEST_URL = "data/daily-digest.json";
const DIGEST_MAX_AGE_MS = 36 * 3600 * 1000;
const DIGEST_LIVE_COUNT = 8;
const SUMMARY_DELAY_MS = 500;

const STARTER_FEEDS = [
  { id: "f_hn", url: "https://news.ycombinator.com/rss", title: "Hacker News" },
  { id: "f_bbc", url: "https://feeds.bbci.co.uk/news/rss.xml", title: "BBC News" },
  { id: "f_verge", url: "https://www.theverge.com/rss/index.xml", title: "The Verge" },
  { id: "f_ars", url: "https://feeds.arstechnica.com/arstechnica/index", title: "Ars Technica" },
  { id: "f_xkcd", url: "https://xkcd.com/rss.xml", title: "xkcd" },
  { id: "f_smashing", url: "https://www.smashingmagazine.com/feed/", title: "Smashing Magazine" },
];

const RSS2JSON = (url) =>
  `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`;
const CODETABS = (url) =>
  `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`;
const ALLORIGINS = (url) =>
  `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
const POLLINATIONS = (prompt) =>
  `https://text.pollinations.ai/${encodeURIComponent(prompt)}`;

/* ============================== Store ============================== */

const memoryFallback = { feeds: null, read: {}, summaries: {}, lastFetch: 0 };
let storageOK = true;

function defaultState() {
  return {
    feeds: STARTER_FEEDS.map((f) => ({ ...f, addedAt: Date.now() })),
    read: {},
    summaries: {},
    lastFetch: 0,
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.feeds)) return defaultState();
    return {
      feeds: parsed.feeds,
      read: parsed.read || {},
      summaries: parsed.summaries || {},
      lastFetch: parsed.lastFetch || 0,
    };
  } catch {
    storageOK = false;
    return memoryFallback.feeds ? memoryFallback : defaultState();
  }
}

function saveState() {
  if (!storageOK) return;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    storageOK = false;
  }
}

const state = loadState();

/* Runtime (not persisted) */
let articles = [];            // normalized articles, newest first
let feedStatus = {};           // feedId -> "ok" | "failed"
let currentView = "articles";  // "articles" | "digest"
let currentFilter = "all";     // "all" | "unread"
let selectedFeedId = null;     // null = all feeds
let digestLoaded = false;

/* ============================== Fetch ============================== */

const domParser = new DOMParser();
const parseXml = (xml) => domParser.parseFromString(xml, "text/xml");

function isHttpUrl(s) {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch { return false; }
}

async function fetchViaRss2Json(feed) {
  const res = await fetch(RSS2JSON(feed.url));
  if (!res.ok) throw new Error(`rss2json HTTP ${res.status}`);
  const data = await res.json();
  if (data.status !== "ok" || !Array.isArray(data.items)) {
    throw new Error(`rss2json: ${data.message || "bad response"}`);
  }
  const title = (data.feed && data.feed.title) || feed.title;
  return {
    title,
    items: data.items.map((it) => {
      const a = normalizeRss2JsonItem(it, title);
      a.feedId = feed.id;
      return a;
    }),
  };
}

async function fetchViaProxy(feed, proxyUrl) {
  const res = await fetch(proxyUrl(feed.url));
  if (!res.ok) throw new Error(`proxy HTTP ${res.status}`);
  const xml = await res.text();
  if (!xml || xml.length < 20 || xml.trimStart().startsWith("{")) {
    throw new Error("proxy returned no XML");
  }
  const items = parseFeedXml(xml, parseXml).map((a) => {
    a.feedId = feed.id;
    a.feedTitle = feed.title;
    return a;
  });
  return { title: feed.title, items };
}

/** Fetch one feed: rss2json, then codetabs, then allorigins. */
async function fetchFeed(feed) {
  const attempts = [
    () => fetchViaRss2Json(feed),
    () => fetchViaProxy(feed, CODETABS),
    () => fetchViaProxy(feed, ALLORIGINS),
  ];
  let lastErr = null;
  for (const attempt of attempts) {
    try {
      const out = await attempt();
      if (out.items.length > 0 || out.title) return out;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("all fetch methods failed");
}

async function refreshAllFeeds() {
  setStatus("Loading feeds…");
  const settled = await Promise.allSettled(state.feeds.map((f) => fetchFeed(f)));
  const seen = new Set();
  articles = [];
  settled.forEach((result, i) => {
    const feed = state.feeds[i];
    if (result.status === "fulfilled") {
      feedStatus[feed.id] = "ok";
      if (result.value.title && result.value.title !== feed.title) {
        feed.title = result.value.title; // adopt the feed's real title
      }
      for (const a of result.value.items) {
        const id = articleId(a);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        articles.push(a);
      }
    } else {
      feedStatus[feed.id] = "failed";
    }
  });
  articles.sort((a, b) => (Date.parse(b.pubDate || "") || 0) - (Date.parse(a.pubDate || "") || 0));
  state.lastFetch = Date.now();
  saveState();
  renderAll();
  const failed = state.feeds.filter((f) => feedStatus[f.id] === "failed").length;
  setStatus(failed
    ? `${articles.length} articles · ${failed} feed${failed > 1 ? "s" : ""} failed to load`
    : `${articles.length} articles · updated ${new Date(state.lastFetch).toLocaleTimeString()}`);
}

/* ============================== Summarize ============================== */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One-line AI summary via the keyless Pollinations text API (cached). */
async function summarize(article) {
  const id = articleId(article);
  if (state.summaries[id]) return { text: state.summaries[id], ai: true };
  const prompt = buildSummaryPrompt(article.title, article.description);
  try {
    const res = await fetch(POLLINATIONS(prompt));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let text = (await res.text()).trim().replace(/^["“]|["”]$/g, "");
    if (!text || text.startsWith("<")) throw new Error("bad response");
    text = truncate(text, 280);
    state.summaries[id] = text;
    saveState();
    return { text, ai: true };
  } catch {
    return { text: firstSentence(article.description) || article.title, ai: false };
  }
}

/* ============================== Render ============================== */

const $ = (id) => document.getElementById(id);

function setStatus(msg) { $("articles-status").textContent = msg; }

function unreadCountFor(feedId) {
  return articles.filter((a) => a.feedId === feedId && !state.read[articleId(a)]).length;
}

function visibleArticles() {
  let list = articles;
  if (selectedFeedId) list = list.filter((a) => a.feedId === selectedFeedId);
  if (currentFilter === "unread") list = list.filter((a) => !state.read[articleId(a)]);
  return list;
}

function renderFeeds() {
  const ul = $("feed-list");
  ul.innerHTML = "";
  $("count-feeds").textContent = String(state.feeds.length);
  for (const feed of state.feeds) {
    const unread = unreadCountFor(feed.id);
    const li = document.createElement("li");
    const avatar = document.createElement("span");
    avatar.className = "feed-avatar";
    avatar.textContent = (feed.title || "?").trim().charAt(0).toUpperCase();
    const name = document.createElement("button");
    name.type = "button";
    name.className = "feed-name" + (selectedFeedId === feed.id ? " selected" : "");
    name.textContent = feed.title;
    name.title = feed.url;
    name.addEventListener("click", () => {
      selectedFeedId = selectedFeedId === feed.id ? null : feed.id;
      renderAll();
    });
    const badge = document.createElement("span");
    badge.className = "feed-unread" + (unread === 0 ? " zero" : "");
    badge.textContent = String(unread);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "feed-remove";
    remove.textContent = "×";
    remove.title = `Unsubscribe from ${feed.title}`;
    remove.setAttribute("aria-label", `Unsubscribe from ${feed.title}`);
    remove.addEventListener("click", () => removeFeed(feed.id));
    li.append(avatar, name, badge, remove);
    if (feedStatus[feed.id] === "failed") {
      const fail = document.createElement("span");
      fail.className = "feed-failed";
      fail.textContent = "failed";
      li.appendChild(fail);
    }
    ul.appendChild(li);
  }
  const totalUnread = articles.filter((a) => !state.read[articleId(a)]).length;
  $("count-all").textContent = String(articles.length);
  $("count-unread").textContent = String(totalUnread);
}

function articleCard(a) {
  const id = articleId(a);
  const isRead = !!state.read[id];
  const card = document.createElement("article");
  card.className = "card" + (isRead ? "" : " unread");
  const h = document.createElement("h3");
  const link = document.createElement("a");
  link.href = isHttpUrl(a.link) ? a.link : "#";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = a.title;
  link.addEventListener("click", () => markRead(id));
  h.appendChild(link);
  const meta = document.createElement("p");
  meta.className = "meta";
  meta.textContent = `${a.feedTitle || ""}${a.pubDate ? ` · ${relativeTime(a.pubDate)}` : ""}`;
  const excerpt = document.createElement("p");
  excerpt.className = "excerpt";
  excerpt.textContent = a.description || "";
  const summary = document.createElement("div");
  summary.className = "summary";
  const cached = state.summaries[id];
  if (cached) {
    summary.innerHTML = `<span class="sum-label">✦ AI summary:</span><span class="sum-text"></span>`;
    summary.querySelector(".sum-text").textContent = cached;
  } else {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "✦ Summarize with AI";
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "Summarizing…";
      const result = await summarize(a);
      summary.innerHTML = result.ai
        ? `<span class="sum-label">✦ AI summary:</span><span class="sum-text"></span>`
        : `<span class="sum-label">✦ Summary unavailable — excerpt:</span><span class="sum-text"></span>`;
      summary.querySelector(".sum-text").textContent = result.text;
    });
    summary.appendChild(btn);
  }
  const actions = document.createElement("div");
  actions.className = "card-actions";
  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "read-toggle";
  toggleBtn.textContent = isRead ? "○ Mark unread" : "✓ Mark read";
  toggleBtn.setAttribute("aria-label", (isRead ? "Mark unread: " : "Mark read: ") + a.title);
  toggleBtn.addEventListener("click", () => toggleRead(id));
  actions.appendChild(toggleBtn);
  card.append(h, meta, excerpt, summary, actions);
  return card;
}

function renderArticles() {
  const list = $("article-list");
  list.innerHTML = "";
  $("articles-title").textContent =
    selectedFeedId
      ? (state.feeds.find((f) => f.id === selectedFeedId)?.title || "Feed")
      : currentFilter === "unread" ? "Unread articles" : "All articles";
  const visible = visibleArticles();
  if (articles.length === 0) {
    list.innerHTML = `<div class="empty">No articles yet — feeds are loading, or all feeds failed. Try Refresh.</div>`;
    return;
  }
  if (visible.length === 0) {
    list.innerHTML = `<div class="empty">Nothing here. ${currentFilter === "unread" ? "You are all caught up!" : "Try another filter."}</div>`;
    return;
  }
  for (const a of visible) list.appendChild(articleCard(a));
}

async function renderDigest() {
  const list = $("digest-list");
  const status = $("digest-status");
  if (!digestLoaded) {
    list.innerHTML = `<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>`;
    status.textContent = "Loading digest…";
  }
  let snapshot = null;
  try {
    const res = await fetch(DIGEST_URL, { cache: "no-store" });
    if (res.ok) snapshot = await res.json();
  } catch { /* snapshot missing — fall through to live generation */ }

  if (snapshot && isFreshDigest(snapshot, Date.now(), DIGEST_MAX_AGE_MS)) {
    status.textContent = `Pre-generated digest · ${new Date(snapshot.generatedAt).toLocaleString()} · ${snapshot.items.length} stories`;
    list.innerHTML = "";
    for (const item of snapshot.items) {
      list.appendChild(digestCard(item));
    }
  } else {
    status.textContent = "Snapshot unavailable — generating live from your feeds…";
    list.innerHTML = "";
    const top = articles.slice(0, DIGEST_LIVE_COUNT);
    if (top.length === 0) {
      list.innerHTML = `<div class="empty">No articles to digest yet — let the feeds load first.</div>`;
      status.textContent = "No articles yet.";
    } else {
      for (const a of top) {
        const card = digestCard({
          title: a.title, link: a.link, feedTitle: a.feedTitle,
          pubDate: a.pubDate, excerpt: a.description, summary: null,
        });
        list.appendChild(card);
        // Sequential, cached summaries (avoids API bursts).
        const result = await summarize(a);
        const sumEl = card.querySelector(".sum-text");
        if (sumEl) sumEl.textContent = result.text;
        await sleep(SUMMARY_DELAY_MS);
      }
      status.textContent = `Generated live just now · ${top.length} stories`;
    }
  }
  digestLoaded = true;
}

function digestCard(item) {
  const card = document.createElement("article");
  card.className = "card";
  const h = document.createElement("h3");
  const link = document.createElement("a");
  link.href = isHttpUrl(item.link) ? item.link : "#";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = item.title;
  h.appendChild(link);
  const meta = document.createElement("p");
  meta.className = "meta";
  meta.textContent = `${item.feedTitle || ""}${item.pubDate ? ` · ${relativeTime(item.pubDate)}` : ""}`;
  const summary = document.createElement("div");
  summary.className = "summary";
  summary.innerHTML = `<span class="sum-label">✦ AI summary:</span><span class="sum-text"></span>`;
  summary.querySelector(".sum-text").textContent =
    item.summary || item.excerpt || "Summary coming right up…";
  card.append(h, meta, summary);
  return card;
}

function renderAll() {
  renderFeeds();
  renderArticles();
  $("filter-all").classList.toggle("active", currentFilter === "all");
  $("filter-unread").classList.toggle("active", currentFilter === "unread");
  $("tab-articles").classList.toggle("active", currentView === "articles");
  $("tab-digest").classList.toggle("active", currentView === "digest");
  $("view-articles").hidden = currentView !== "articles";
  $("view-digest").hidden = currentView !== "digest";
}

function markRead(id) {
  if (!state.read[id]) {
    state.read[id] = true;
    saveState();
    renderFeeds();
  }
}

/** Toggle one article read/unread (per-article control on each card).
    Re-renders everything so the card's unread styling, its button label,
    and the feed/unread counts all update immediately. */
function toggleRead(id) {
  if (state.read[id]) delete state.read[id];
  else state.read[id] = true;
  saveState();
  renderAll();
}

function removeFeed(feedId) {
  const feed = state.feeds.find((f) => f.id === feedId);
  if (!feed) return;
  if (!window.confirm(`Unsubscribe from "${feed.title}"?`)) return;
  state.feeds = state.feeds.filter((f) => f.id !== feedId);
  articles = articles.filter((a) => a.feedId !== feedId);
  if (selectedFeedId === feedId) selectedFeedId = null;
  saveState();
  renderAll();
}

/* ============================== Events ============================== */

function showView(view) {
  currentView = view;
  renderAll();
  if (view === "digest") renderDigest();
}

$("tab-articles").addEventListener("click", () => showView("articles"));
$("tab-digest").addEventListener("click", () => showView("digest"));

$("filter-all").addEventListener("click", () => { currentFilter = "all"; selectedFeedId = null; renderAll(); });
$("filter-unread").addEventListener("click", () => { currentFilter = "unread"; renderAll(); });

$("btn-refresh").addEventListener("click", () => refreshAllFeeds());
$("btn-mark-all-read").addEventListener("click", () => {
  for (const a of visibleArticles()) state.read[articleId(a)] = true;
  saveState();
  renderAll();
});

$("form-add-feed").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("input-feed-url");
  const url = input.value.trim();
  const err = $("feed-error");
  err.hidden = true;
  if (!isHttpUrl(url)) {
    err.textContent = "Please enter a valid http(s) feed URL.";
    err.hidden = false;
    return;
  }
  if (state.feeds.some((f) => f.url === url)) {
    err.textContent = "You are already subscribed to that feed.";
    err.hidden = false;
    return;
  }
  err.textContent = "";
  input.disabled = true;
  try {
    const probe = { id: `f_${Date.now()}`, url, title: url };
    const result = await fetchFeed(probe);
    probe.title = result.title || url;
    state.feeds.push({ ...probe, addedAt: Date.now() });
    saveState();
    input.value = "";
    await refreshAllFeeds();
  } catch {
    err.textContent = "Could not fetch that URL as a feed. Check the URL and try again.";
    err.hidden = false;
  } finally {
    input.disabled = false;
  }
});

$("input-opml").addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  const status = $("import-status");
  if (!file) return;
  status.textContent = "Reading OPML…";
  try {
    const text = await file.text();
    const found = parseOpml(text, parseXml);
    if (found.length === 0) {
      status.textContent = "No feeds found in that OPML file.";
      return;
    }
    let added = 0, skipped = 0;
    for (const f of found) {
      if (state.feeds.some((x) => x.url === f.url)) { skipped++; continue; }
      state.feeds.push({ id: `f_${Date.now()}_${added}`, url: f.url, title: f.title, addedAt: Date.now() });
      added++;
    }
    saveState();
    status.textContent = `Imported ${added} feed${added === 1 ? "" : "s"}${skipped ? ` (${skipped} already subscribed)` : ""}.`;
    await refreshAllFeeds();
  } catch {
    status.textContent = "Could not parse that OPML file.";
  } finally {
    e.target.value = "";
  }
});

/* ============================== Init ============================== */

renderAll();
refreshAllFeeds();
