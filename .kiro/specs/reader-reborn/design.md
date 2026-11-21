# Reader Reborn — Design

## Overview

A zero-build static single-page app (plain HTML + CSS + vanilla JS, no
framework, no bundler, no dependencies). It runs as-is from any static host
(GitHub Pages). All state lives in `localStorage`; all network access goes to
keyless public APIs. A daily GitHub Actions job pre-generates the digest
snapshot so the Digest view works even when live APIs are slow.

## Architecture

```
Browser (GitHub Pages)
  index.html / styles.css / app.js
    ├─ FeedStore (localStorage) — feeds, read set, summary cache
    ├─ FeedFetcher — rss2json → codetabs → allorigins fallback chain,
    │                RSS 2.0 / Atom XML parsing via DOMParser
    ├─ Summarizer — keyless Pollinations text API, cached, excerpt fallback
    └─ Views — Articles list / Digest view
GitHub Actions (daily cron + manual dispatch)
  scripts/fetch-digest.mjs — fetch starter feeds → top 10 → summarize
  → commits data/daily-digest.json (GITHUB_TOKEN only, no secrets)
```

## Key decisions

- **No framework.** Vanilla JS keeps the repo dependency-free, the Pages
  deploy trivial (no build step), and every line auditable as new code.
- **rss2json first.** It returns parsed JSON, so the app avoids XML parsing
  in the common path. Free tier is keyless; it caps at ~10 items per feed,
  which is fine for an MVP reader.
- **Two CORS-proxy fallbacks.** If rss2json fails, fetch the raw feed XML
  through codetabs, then allorigins, and parse it client-side with DOMParser
  (RSS 2.0 `channel/item` and Atom `feed/entry`).
- **Articles are not persisted.** Only feed list, read state (by article URL),
  and summary cache persist. Articles are re-fetched on load; this keeps
  storage small and the code simple.
- **Summaries are cached forever (by article URL)** in localStorage, so the
  Pollinations API is hit at most once per article.
- **Digest snapshot is a progressive enhancement.** The app works fully
  without it (live generation); the snapshot just makes the Digest instant
  and resilient.

## Data model (localStorage key `reader-reborn-v1`)

```json
{
  "feeds": [
    {"id": "f_hn", "url": "https://news.ycombinator.com/rss",
     "title": "Hacker News", "addedAt": 1732000000000}
  ],
  "read": { "https://example.com/article": true },
  "summaries": { "https://example.com/article": "One-line summary." },
  "lastFetch": 1732000000000
}
```

Article (normalized, in-memory only):

```json
{
  "id": "<link url>",
  "title": "…", "link": "…", "guid": "…",
  "pubDate": "ISO string", "description": "plain-text excerpt",
  "feedId": "f_hn", "feedTitle": "Hacker News"
}
```

Digest snapshot (`data/daily-digest.json`):

```json
{
  "generatedAt": "ISO string",
  "source": "github-actions",
  "items": [
    {"title": "…", "link": "…", "feedTitle": "…",
     "pubDate": "ISO string", "summary": "…", "excerpt": "…"}
  ]
}
```

## Starter feeds (verified 2026-11-21 via rss2json)

| Feed | URL |
|---|---|
| Hacker News | https://news.ycombinator.com/rss |
| BBC News | https://feeds.bbci.co.uk/news/rss.xml |
| The Verge | https://www.theverge.com/rss/index.xml |
| Ars Technica | https://feeds.arstechnica.com/arstechnica/index |
| xkcd | https://xkcd.com/rss.xml |
| Smashing Magazine | https://www.smashingmagazine.com/feed/ |

## API contracts

- **rss2json**: `GET https://api.rss2json.com/v1/api.json?rss_url=<encoded>`
  → `{status:"ok", feed:{title,link}, items:[{title,link,guid,pubDate,
  description,content,thumbnail,author}]}`. Keyless.
- **codetabs proxy**: `GET https://api.codetabs.com/v1/proxy?quest=<encoded>`
  → raw feed XML. Keyless.
- **allorigins**: `GET https://api.allorigins.win/raw?url=<encoded>`
  → raw feed XML. Keyless.
- **Pollinations text**: `GET https://text.pollinations.ai/<encoded prompt>`
  → plain-text reply. Keyless. Prompt: `Summarize this in one short
  sentence, no preamble: Title: <title>. <excerpt>`. Sequential calls with a
  short delay; digest capped at 8–10 items.

## UI layout

- **Top bar**: original "Reader Reborn" wordmark (sunrise glyph, drawn as
  inline SVG — no third-party assets), view tabs (Articles / Digest),
  Refresh, Mark-all-read, Add feed.
- **Sidebar**: All articles / Unread filters; feed list with unread counts
  and per-feed remove; OPML import; footer note (free APIs, local-only data).
- **Articles view**: cards newest-first — title (opens original, marks read),
  feed name, relative time, excerpt, AI summary block (button → loading →
  summary, cached).
- **Digest view**: dated header, snapshot timestamp or "generated live" label,
  top-story cards with summaries.
- **States**: loading skeletons, per-feed failure badges, empty states,
  inline errors for bad URLs. No login screens anywhere.

## Testing

- `node --check` on all JS; a small Node harness (`scripts/smoke-test.mjs`)
  that exercises: RSS/Atom parsing against saved sample XML, OPML parsing,
  excerpt stripping, relative-time formatting, and the Pollinations prompt
  builder — all offline except two live API probes (rss2json + Pollinations)
  that tolerate failure without failing the suite.
- Manual browser check: serve the folder with `python3 -m http.server`,
  add/remove feeds, import the sample OPML, mark read/unread, open Digest.

## What is intentionally out of scope

- No user accounts, sync, or backend database.
- No full-text article extraction (links open the original site).
- No push notifications, no feed search across history, no folders/tags.
- No paid APIs, no API keys anywhere (runtime user-supplied keys are not
  implemented; the app is keyless by design).
