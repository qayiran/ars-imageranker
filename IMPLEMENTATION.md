# Implementation plan and verification

## 1. Establish a Pages-compatible foundation

Create a static root entry point and relative asset URLs. Keep the upstream Flask app intact. Use an explicit catalog of the 17 supplied PNGs; preserve their filenames (including `Masachusetts_Showcase.png`) while correcting the visible label to Massachusetts. Port the upstream TrueSkill and queue-priority logic into a dependency-free module shared by browser and Worker.

## 2. Implement the fixed comparison session

Require a pseudonym before comparing. Compare all 136 unique pairs. Keep auto-shuffle enabled after three votes, and omit upload, image replacement, manual shuffle, and image exclusion. Add keyboard shortcuts, image enlargement, image-load checks, undo, defer, pause and validated browser-local recovery. Require completion before submitting.

## 3. Design the site

Use a warm neutral palette, forest green accents, serif titles and self-hosted assets/system fonts. Build responsive welcome, comparison and results views with visible focus states, live progress feedback, reduced-motion support and a tabular alternative to the SVG chart.

## 4. Display results and forest plots

Show the top choice, all 17 ratings, wins and model uncertainty. Present a public participant list after completion and let users open each person’s ranking and forest plot. Clearly distinguish TrueSkill model uncertainty from population agreement; show the transformed rating scale.

## 5. Save results securely

Use a Cloudflare Worker with a repository-scoped GitHub credential stored as a secret. Validate complete unique showcase comparisons and recompute ratings server-side. Store immutable UUID-based result files plus a public summary index. Handle concurrent index writes and retried/partial saves. Save no identity/contact/network fields. Keep publication a manual owner action and explain pseudonymity limits.

## 6. Verify and hand off

Run model and service tests; check source syntax, catalog assets and static build. Verify desktop and mobile layouts, a complete session, three-vote shuffle, undo/defer, pause/reload/resume, download, the forest chart, shared-results browsing, publication errors and retries, and GitHub Pages subdirectory asset paths. Document publishing/service setup and retain an honest offline/unconfigured fallback.

## Deployment scope

No site, Worker, token, GitHub repository, or remote result has been created by this work. Real repository persistence requires the owner’s configuration in README.md. The local browser integration exercises the real Worker handler against a simulated GitHub contents API; it does not certify a deployment or credentials that do not yet exist.

## Completed validation — 2026-10-03

- `npm run check`: all 17 exact showcase paths, the 136-pair total, public configuration and results index pass.
- `npm test`: all 15 model and Worker tests pass. The 136-comparison reference fixture was generated with the upstream Python `trueskill` implementation. Maximum observed difference is below 0.000004 in μ and below 0.000001 in σ.
- JavaScript syntax checks pass for the browser app, chart and Worker modules.
- `npm run build`: produces a self-contained static artifact with relative assets and no server source, virtual environment or secrets.
- Wrangler 4.147.0 `deploy --dry-run`: successfully bundles the Worker and validates the configured rate-limit and environment bindings; no deployment occurs.
- `tests/browser-check.mjs`: Playwright/Chromium verifies all 136 votes through the actual UI, locked shuffle, shuffle after three votes, undo/defer, zoom, pause/reload/resume, result download, forest plot/table, two participants, a failed save and successful retry, desktop and phone widths, subdirectory image URLs, and unconfigured saving. The real Worker handler is used, with only outbound GitHub requests mocked. There are no browser JavaScript errors.
- Desktop and phone screenshots were visually inspected. Phone results use a compact forest plot. Temporary screenshots and simulated participant records are not added to the public site.
- The original `image-ranker/` Git checkout has no changes. The public `results/index.json` remains empty; no demonstration participant is presented as a real submission.

To run the optional browser check with your own installed Playwright and Chromium, start `npm start` separately and run:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs CHROMIUM_PATH=/absolute/path/to/chromium node tests/browser-check.mjs
```

Optional environment variables: `PREVIEW_URL` (defaults to `http://127.0.0.1:8000`) and `BROWSER_ARTIFACTS` (defaults to `/tmp/showcase-browser-check`). This test never requires a real GitHub token, makes no remote GitHub writes and uses isolated browser profiles.

## Follow-up: branding, copy, themes and gallery

Renamed the public site to American Revolution Smuggler and replaced slogan-style welcome, comparison, status and results copy with direct descriptions. The home page identifies HIROTONFA’s character collection and explains that it contains the thirteen founding colonies plus four additional colony/state characters. Existing comparison IDs and saved sessions remain compatible.

Added a shared Browser/Light/Dark selector that applies before the page paints, follows browser changes by default, persists explicit overrides, and works when local storage is unavailable. Dark colors cover forms, image panels, navigation, dialogs, results and forest plots.

Added the static `gallery.html` page with all 17 artworks, colony/state names, founding-colony labels, enlargement, previous/next navigation, arrow-key controls and character deep links. Gallery navigation preserves saved ranking progress. The static build and source-check workflow include the gallery.

`tests/theme-gallery-check.mjs` verifies browser preference changes, override persistence, page navigation, all gallery images, enlargement/navigation, direct links, phone widths, deployment subpaths, JavaScript-disabled gallery content and storage-disabled theme controls. Run it with the same `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH` and `PREVIEW_URL` variables as the existing browser check.

## Follow-up: freely accessible public results

Added `results.html` to all public navigation and the Pages artifact. The page can be visited before any comparison session, with search, date/name sorting, participant detail links, and the same forest plot/table view used by completed sessions. Shared chart rendering is extracted into `assets/results-view.js` so both views stay consistent.

The temporary preview examples have now been removed from public data and rendering. Test-only synthetic records are stored in `tests/fixtures/participant-results.json` and excluded from the Pages artifact. Empty participant and leaderboard views do not display fabricated scores.

## Follow-up: global colony/state leaderboard

Added a global leaderboard above the individual results, with a direct `results.html#leaderboard` link. Each of the 17 characters is ordered by its mean Elo-style rating across complete participant sessions. Every session has equal weight; duplicate UUIDs count once, while separate sessions with the same nickname remain independent. Total wins, win rate, first-place finishes and combined comparison counts are also shown. Public ranking counts use the same UUID deduplication, and card search/sorting do not filter the aggregate or collapse an expanded plot.

The global forest plot uses mean ratings and the observed lowest-to-highest submitted scores. Its descriptions and legend distinguish that range from the posterior uncertainty shown in individual plots. Empty and service-error states remain explicit, and refresh/retry rebuild both the leaderboard and individual list.

## Follow-up: result identity and historical labels

Every result displays its complete uppercase UUID as a Result code, avoiding shortened-prefix collisions and allowing duplicate nicknames. The code is searchable on the public Results page and visible on cards, personal rankings and both participant detail views. Records, index entries and downloads derive and save the code from the existing session ID. Client-supplied codes are ignored; old records receive a display code without migration. No identity or contact information is collected to distinguish participants.

Removed the header’s “ar” badge from all three pages and replaced the favicon with a ranking podium and star. Historical gallery labels now describe Spanish Louisiana, Maine as part of Massachusetts, sovereign Vermont (1777–1791) and British East & West Florida. Static cards and enlarged viewer captions use the same descriptions. References are linked on the gallery page.

All 22 Node tests pass, including duplicate nicknames with colliding UUID prefixes, historical-record code derivation, rejection of spoofed codes, session deduplication and aggregate arithmetic. The static check and Pages build pass. Browser checks cover removal of public examples and deployed test fixtures, honest empty states, duplicate nickname/code search, reload/direct links, save/download/retry code stability, global and individual plots, labels in cards and viewers, light/dark layouts down to 320 pixels, header/icon changes and Pages subdirectory paths. The complete comparison check uses the actual Worker handler with only outbound GitHub requests mocked; it performs no real submissions or remote writes.

## Turkish/English and ranking artwork update

- `assets/language-init.js` sets Turkish by default before rendering, or uses the saved English preference. `assets/language.js` handles the selector, dates, static labels and runtime messages, with Turkish text in `assets/translations.js`. Usernames, character names, IDs and the saved result schema stay unchanged.
- All three pages expose the same language control. Dynamic views rerender without changing votes, publication state, search/sort values or selected participant. Static gallery content remains available in Turkish without JavaScript. Preferences still work for the current page if storage is blocked.
- `assets/result-images.js` supplies expandable images for the prominent winner, the full ranked artwork grid, and global leaderboard rows. The shared modal viewer follows the result's rank order, supports keyboard navigation and retains historical labels.
- `tests/language-images-check.mjs` checks both languages, language persistence, mid-session changes, save errors and retries, result/viewer navigation, subdirectory assets and layouts down to 320 px. Existing browser checks explicitly choose English so their original regression coverage remains meaningful. Synthetic preview records remain test-only.
