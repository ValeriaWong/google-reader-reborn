# Reader Reborn — Requirements

> Spec for the Kiroween 2026 (Resurrection) safety-net MVP.
> Project: revive Google Reader as an AI-curated RSS reader web app.
> All code in this repository is newly created for the hackathon submission
> period (started Oct 30, 2026). No pre-existing application code is used;
> only the standard web platform (HTML/CSS/JS, no framework) and keyless
> public APIs are used.

## Introduction

Google Reader (2005–2013) was the canonical RSS reader: subscribe to feeds,
scan headlines, mark items read. This project resurrects it as a free,
no-login, client-side web app with one modern addition: an AI layer that
writes a one-line summary per article and a daily digest, powered by the
keyless Pollinations text API. Feeds are fetched through keyless public
services (rss2json, with an AllOrigins + client-side XML fallback) and, for
the built-in starter feeds, a daily GitHub Actions snapshot. All user data
(feeds, read state, cached summaries) lives in the browser's localStorage.

## Glossary

- **Feed**: an RSS/Atom source identified by URL.
- **Article**: one item/entry from a feed, identified by its link URL.
- **Digest**: the daily view — the top stories across feeds with AI summaries.
- **Snapshot**: `data/daily-digest.json`, pre-generated daily by GitHub Actions.

## Requirements

### Requirement 1 — Add feeds by URL

**User Story:** As a reader, I want to add an RSS/Atom feed by pasting its URL,
so I can follow sources I care about.

#### Acceptance Criteria

1. WHEN the user submits a feed URL THEN the app SHALL fetch it, show its
   title in the sidebar, and list its articles.
2. WHEN a feed URL is invalid or unreachable THEN the app SHALL show an inline
   error and SHALL NOT add a broken feed.
3. WHEN a feed URL is already subscribed THEN the app SHALL NOT add a duplicate.

### Requirement 2 — OPML import

**User Story:** As a reader migrating from another reader, I want to import an
OPML file, so all my feeds arrive at once.

#### Acceptance Criteria

1. WHEN the user selects an `.opml`/`.xml` file THEN the app SHALL parse every
   `outline` element carrying an `xmlUrl` (at any depth) and add each as a feed.
2. WHEN an OPML file contains no feeds THEN the app SHALL report "no feeds found".
3. WHEN an OPML entry duplicates an existing feed THEN it SHALL be skipped.

### Requirement 3 — Free, keyless feed fetching

**User Story:** As a reader, I want feeds to load without creating accounts or
API keys, so the app stays free and frictionless.

#### Acceptance Criteria

1. WHEN the app fetches a feed THEN it SHALL use only keyless public services
   (rss2json primary, AllOrigins + client-side XML parsing as fallback).
2. WHEN one fetch method fails for a feed THEN the app SHALL try the fallback
   before reporting the feed as failed.
3. WHEN a feed fails on both methods THEN the app SHALL mark it failed in the
   sidebar and SHALL still show the other feeds' articles.

### Requirement 4 — Article list, read/unread, feed management

**User Story:** As a reader, I want a unified article list with read/unread
state and basic feed management, so I can triage quickly.

#### Acceptance Criteria

1. WHEN articles load THEN the app SHALL show them newest-first with title,
   feed name, relative time, and excerpt.
2. WHEN the user opens an article THEN it SHALL be marked read and the unread
   count SHALL update.
3. WHEN the user selects "Unread" THEN only unread articles SHALL be shown.
4. WHEN the user selects a feed THEN only that feed's articles SHALL be shown.
5. WHEN the user clicks "Mark all read" THEN all visible articles SHALL be
   marked read.
6. WHEN the user removes a feed THEN its articles SHALL disappear from the list.

### Requirement 5 — AI one-line summaries

**User Story:** As a reader, I want a one-line AI summary per article, so I can
decide what to read without opening everything.

#### Acceptance Criteria

1. WHEN the user requests a summary THEN the app SHALL call the keyless
   Pollinations text API with the article title and excerpt and SHALL display
   the returned one-line summary.
2. WHEN a summary is fetched THEN the app SHALL cache it in localStorage and
   SHALL NOT re-fetch it for the same article.
3. WHEN the summary API fails THEN the app SHALL fall back to the article's
   first excerpt sentence and SHALL say the AI summary is unavailable.

### Requirement 6 — Daily digest view

**User Story:** As a reader, I want a daily digest of the top stories with AI
summaries, so I can catch up in one glance.

#### Acceptance Criteria

1. WHEN the Digest view opens THEN the app SHALL show the newest daily digest
   (pre-generated snapshot if fresh, otherwise generated live from the latest
   articles).
2. WHEN the snapshot is missing or older than 36 hours THEN the app SHALL
   generate the digest live and SHALL label it "generated live".
3. WHEN the snapshot is used THEN the app SHALL show its generation timestamp.

### Requirement 7 — Client-side storage, no login

**User Story:** As a reader, I want my feeds and read state stored only in my
browser, so no account or backend is needed.

#### Acceptance Criteria

1. WHEN the app runs THEN it SHALL NOT require any login, account, or backend
   database.
2. WHEN the user reloads the page THEN feeds, read state, and cached summaries
   SHALL persist via localStorage.
3. WHEN the user clears browser data THEN the app SHALL start fresh with the
   built-in starter feeds.

### Requirement 8 — Daily digest snapshot (GitHub Actions)

**User Story:** As a reader, I want the digest ready even if live APIs are
slow, so the Digest view always has content.

#### Acceptance Criteria

1. WHEN the scheduled workflow runs daily THEN it SHALL fetch the starter feeds,
   pick the 10 newest articles, summarize each via Pollinations, and commit
   `data/daily-digest.json`.
2. WHEN the workflow runs THEN it SHALL use only the repository's built-in
   `GITHUB_TOKEN` and keyless public APIs (no secrets, no accounts).
3. WHEN the workflow's fetch fails THEN it SHALL exit non-zero without
   overwriting the previous snapshot.

### Requirement 9 — Free-only, original branding

**User Story:** As the submitter, I want the project to be free-only and
original, so it is safe to submit and demo.

#### Acceptance Criteria

1. WHEN the app runs THEN it SHALL depend on no paid service and no trial that
   converts to paid.
2. WHEN the app renders THEN it SHALL use only original branding and design
   (no Google Reader logo, trade dress, or third-party copyrighted assets).
3. WHEN the repo is published THEN it SHALL carry a detectable MIT license at
   the repository top and SHALL include the `/.kiro` directory at its root,
   not gitignored.
