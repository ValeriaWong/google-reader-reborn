# Reader Reborn

**Google Reader, reborn with AI.** A free, no-login, client-side RSS reader
built for [Kiroween 2026](https://kiroween.devpost.com/) (Resurrection
category): subscribe to feeds, triage headlines, and get a one-line AI
summary per article plus a daily digest.

> This is the safety-net entry beside the primary Clippy revival. It is a
> complete, submittable project on its own. All code in this repository was
> newly written for the hackathon submission period (Oct 30 – Dec 4, 2026).
> No pre-existing application code is used — only the standard web platform
> and keyless public APIs.

## What it does

- **Add feeds by URL** — any RSS/Atom feed, verified on add.
- **OPML import** — bring all your feeds from another reader at once.
- **Article list** — newest-first, read/unread state, per-feed filter,
  mark-all-read. Clicking an article marks it read.
- **AI one-line summaries** — each article can be summarized in one sentence
  via the keyless Pollinations text API (cached per article; falls back to
  the excerpt if the API is down).
- **Daily Digest** — the top stories with AI summaries. Pre-generated daily
  by GitHub Actions (`data/daily-digest.json`); if the snapshot is stale or
  missing, the app generates it live from your feeds.
- **Local-only data** — feeds, read state, and summaries live in your
  browser's localStorage. No account, no backend, no tracking.

## How it works (free-only, keyless)

| Need | Service | Key? |
|---|---|---|
| Feed fetching | rss2json (primary), codetabs / allorigins proxies + client-side XML parsing (fallback) | No |
| AI summaries | Pollinations text API (`text.pollinations.ai`) | No |
| Hosting | GitHub Pages | No |
| Daily snapshot | GitHub Actions, built-in `GITHUB_TOKEN` only | No |

No API keys exist anywhere in this project — by design.

## Run it locally

No build step, no dependencies. Serve the folder over HTTP:

```sh
python3 -m http.server 8000
# open http://localhost:8000/
```

## Repo layout

```
.kiro/specs/reader-reborn/   # spec: requirements, design, tasks (written first)
.kiro/steering/              # product / tech / structure steering
.kiro/hooks/hooks.json        # Kiro guardrails (no secrets, spec-before-code)
.github/workflows/           # daily digest snapshot job
data/daily-digest.json        # digest snapshot (rewritten daily by the job)
scripts/fetch-digest.mjs     # digest generator (Node, no deps)
scripts/smoke-test.mjs       # offline + live smoke tests
index.html  styles.css  app.js  lib.js
```

Run the smoke tests with `node scripts/smoke-test.mjs` (exit 0 = offline
suite passed; live probes only warn).

## Built with Kiro

This project was built spec-driven with Kiro: the spec in
`.kiro/specs/reader-reborn/` was written before the code, steering docs in
`.kiro/steering/` record the product/tech/structure decisions, and
`.kiro/hooks/hooks.json` guards the free-only and spec-first rules. The
`/.kiro` directory is part of the submission and is intentionally not
gitignored.

## Branding

"Reader Reborn" branding (name, sunrise mark, CSS) is original work drawn
for this project. Not affiliated with Google; no Google Reader logo or trade
dress is used.

## License

MIT — see [LICENSE](LICENSE).
