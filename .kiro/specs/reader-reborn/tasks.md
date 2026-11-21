# Reader Reborn — Implementation Tasks

Spec: `.kiro/specs/reader-reborn/` (requirements.md, design.md). All code is
new for Kiroween 2026; no pre-existing application code.

- [x] 1. Spec first: requirements, design, tasks (this file)
- [x] 2. Steering docs: product, tech, structure
- [x] 3. Hooks config: `.kiro/hooks/hooks.json`
- [x] 4. App shell: `index.html` (layout, sidebar, views, dialogs)
- [x] 5. Styles: `styles.css` (original design, responsive, no external assets)
- [x] 6. Store: `app.js` — localStorage state (feeds, read set, summary cache)
- [x] 7. Fetch: `app.js` — rss2json primary, codetabs/allorigins + DOMParser fallback
- [x] 8. Parsing: RSS 2.0 + Atom XML parsing, excerpt stripping, relative time (`lib.js`)
- [x] 9. OPML import: file picker, recursive `xmlUrl` extraction, dedupe
- [x] 10. Articles view: list, filters (all/unread/per-feed), mark read, mark-all-read
- [x] 11. AI summaries: Pollinations text API, per-article button, cache, excerpt fallback
- [x] 12. Digest view: snapshot-first (36h freshness), live generation fallback
- [x] 13. Digest job: `scripts/fetch-digest.mjs` + `.github/workflows/fetch-digest.yml`
- [x] 14. Seed snapshot: `data/daily-digest.json` (initial, replaced daily by the job)
- [x] 15. Docs: `README.md`, MIT `LICENSE`, `.gitignore` (must NOT ignore `.kiro`)
- [x] 16. Smoke tests: `scripts/smoke-test.mjs` (offline parsing/logic + live probes)
- [x] 17. Local verification: `node --check`, smoke test, serve + manual browser pass
  (done 2026-11-21: node --check 4/4 OK; smoke test 26/26 offline + 2 live
  probes OK; digest generator ran end-to-end, real 10-item snapshot;
  local serve 200s for all files; id cross-check 22/22; secret scan clean)
- [ ] 18. Publish: push to ValeriaWong/google-reader-reborn, enable GitHub Pages, verify live URL
  (BLOCKED 2026-11-21: connector create_repository returned 403
  "Resource not accessible by integration" — the GitHub App cannot create
  repos under ValeriaWong. Repo does not exist yet. Needs Allen/parent to
  create the empty public repo first; then push via connector push_files
  per references/snapshot-push.md, then enable Pages.)
