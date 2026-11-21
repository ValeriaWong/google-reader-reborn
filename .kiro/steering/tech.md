# Tech steering — Reader Reborn

## Stack

- Plain HTML + CSS + vanilla JavaScript (ES2020). No framework, no bundler,
  no npm dependencies. The repo is served as-is from GitHub Pages.
- Node 20+ only for the GitHub Actions digest script (global `fetch`, no deps).

## Rules

- **No API keys, ever.** No keys in files, memory, or chat. All APIs used
  are keyless: rss2json, codetabs/allorigins proxies, Pollinations text.
  If a keyed API is ever needed, it must be runtime user-supplied only —
  that path is not implemented in this MVP.
- **No secrets in the repo.** The Actions workflow uses only the built-in
  `GITHUB_TOKEN` (`permissions: contents: write`).
- **`/.kiro` is sacred.** It lives at the repo root and is never gitignored.
  Specs, steering, and hooks document how the app was built with Kiro.
- **Client-side XML parsing only.** RSS/Atom fallback parsing uses the
  browser DOMParser; never hand-roll an XML parser.
- **Cache aggressively, fetch politely.** Summaries cached by article URL;
  digest generation capped at 8–10 items; sequential AI calls with a short
  delay between them.
- **No external assets.** No webfonts, no CDN JS/CSS, no third-party images.
  The only external requests are the feed/summary APIs and the article
  links the user clicks.
- **Accessibility basics.** Semantic HTML, keyboard-reachable controls,
  visible focus states, `aria-live` for status messages.
