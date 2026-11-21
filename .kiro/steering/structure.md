# Structure steering — Reader Reborn

```
google-reader-reborn/
├── .kiro/
│   ├── specs/reader-reborn/   # requirements.md, design.md, tasks.md
│   ├── steering/              # product.md, tech.md, structure.md
│   └── hooks/hooks.json       # Kiro hooks (docs + guardrails)
├── .github/workflows/
│   └── fetch-digest.yml       # daily digest snapshot job
├── data/
│   └── daily-digest.json      # snapshot (rewritten daily by the job)
├── scripts/
│   ├── fetch-digest.mjs       # digest generator (Node, no deps)
│   └── smoke-test.mjs         # offline + live smoke tests
├── index.html                 # app shell
├── styles.css                 # all styling
├── app.js                     # app logic (ES module)
├── lib.js                     # pure helpers (shared with smoke tests)
├── package.json               # {"type": "module"} so Node checks app.js as ESM
├── README.md
├── LICENSE                    # MIT
└── .gitignore                 # never ignores .kiro
```

## Conventions

- One file per concern; `app.js` is organized in sections (Store, Fetch,
  Parse, Summarize, Render, Events) with section banners. Pure, DOM-free
  helpers live in `lib.js` so the smoke test can import them in Node.
- All user-facing copy in English (the hackathon audience); code comments
  concise and in English.
- Dates stored as ISO strings; displayed as relative time ("2h ago").
- Article identity is its link URL (`link || guid`).
