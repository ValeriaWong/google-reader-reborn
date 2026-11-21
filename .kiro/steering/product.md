# Product steering — Reader Reborn

## What this is

A resurrection of Google Reader for Kiroween 2026 (Resurrection category):
the classic RSS reader, reborn as a free, no-login, AI-curated web app.
The safety-net entry beside the primary Clippy revival — it must be
submittable on its own.

## Principles

- **Free only.** No paid service, no trial that converts, no account walls.
  Every dependency is a keyless public API or the browser itself.
- **No login, no backend.** All state in localStorage. The app must work for
  a judge who opens the URL cold, with zero setup.
- **New code only.** Everything here was written for the hackathon submission
  period (Oct 30 – Dec 4, 2026). Standard web platform only; no framework,
  no copied application code.
- **Original identity.** "Reader Reborn" branding is drawn from scratch
  (inline SVG sunrise mark, original CSS). No Google Reader logo, trade
  dress, or third-party copyrighted assets anywhere.
- **Graceful degradation.** Every network call has a fallback or a clear
  empty/error state. A failed feed or a failed summary never breaks the page.
- **Honest AI.** Summaries are labeled as AI-generated; failures fall back
  to the article excerpt and say so.
