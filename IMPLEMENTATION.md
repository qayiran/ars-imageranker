# Implementation plan and verification

Result pages use this vertical order: character ratings, result-card preview button, all character artwork, faction/region preferences, dark-horse favorites, closest matches, preference consistency (including its circular examples page), ranking divergence and rating fingerprint. On screens wider than 1000 px, dark-horse favorites and closest matches share the first row, followed by consistency and divergence in the second row. At narrower widths these panels stack in the same reading order. Public, personal and community-selected results share the same renderer; asynchronous reference updates preserve the layout.

## Dark-horse favorites, circular examples and rating fingerprints

1. Use the established self-excluded mean-rating reference for dark-horse favorites. Require the whole personal tied group within positions 1–5 and the whole reference tied group within positions 13–17; avoid arbitrary selection across a cutoff tie. Show reference sample size, honest empty/loading/error states and rounded-record caveats.
2. Validate all 136 distinct recorded pairs and verify their per-character wins against the displayed ranking before enumerating the 680 triplets. Show each directed cycle once in catalog order, with a triangle, explicit choice statements, previous/next navigation and artwork zoom. Personal histories are supplied locally. Examples occupy the second page of the Preference consistency panel. Public histories load automatically from a fixed same-origin UUID file and are checked against the result identity and scores. Cache validated histories and share in-flight requests across language/navigation rerenders. Failed, incomplete or mismatching histories show retry; screenshot records cannot invent examples from win totals or final ratings.
3. Center each character score on the personal mean, retain catalog order and draw signed diverging lines on a symmetric labeled scale. Include profile links, an accessible table, a compact phone chart and an explicit explanation of the adaptive range and zero baseline. This visual supports rounded recovered ratings without requiring wins or histories.
4. Reuse the common ranking renderer for public, private and community-selected results. Refresh only reference-dependent summaries when community reads finish; the history/fingerprint views remain independent of those errors and saving. Add complete Turkish/English and theme support. No Worker, save format or recorded data migration is required.
5. `tests/taste-insights.test.mjs` verifies reference exclusion/deduplication, cutoff-spanning ties, offset-invariant centered fingerprints, every real normal history's cycle count, directed choices and rejected/mismatching records. `tests/taste-insights-check.mjs` covers the three result views, source/Pages assets, two-page consistency navigation, automatic history loading, examples/zoom, profile links, manual/unavailable/delayed history states, reference retry and Turkish/English layouts in both themes at 320–1440 px. All service submissions are mocked; keep implementation local for review.

## Character profiles and result cards

1. Reuse normalized, UUID-deduplicated complete results for character statistics. Show mean rating, median midrank, first or tied-first count, six rating bins, all 17 rank positions and links to the underlying sessions ordered from highest to lowest rating. Share tied-rank distribution weight evenly across occupied positions. Include manual rounded ratings while excluding them from win-rate totals; preserve explicit empty/error/retry states and accessible distribution tables.
2. Generate 1200 × 1400 PNG result cards in the browser from fixed same-origin artwork and existing group means. Preview before downloading, follow the chosen language/theme, include all of the UUID, a result URL, artwork attribution and a subtle manual-record label. Reject incomplete rankings and failed artwork loads instead of exporting misleading cards. Revoke temporary object URLs when dialogs close.
3. Add `character.html` to static checks and the fingerprinted Pages build. Link profiles from the gallery, leaderboard and divisive-character list without replacing artwork zoom. Cards are available in public and personal completed-result views. No Worker, stored record or comparison-history changes are needed.
4. `tests/exploration.test.mjs` verifies tied ranks, histogram boundaries, sample handling, descending participant ratings, duplicate UUIDs and card data. `tests/exploration-check.mjs` verifies all 17 profiles and their sorted participant tables, absence of the removed agreement map, actual PNG previews/downloads for normal/manual/private results, image-load failures, empty/error/retry states, both languages/themes and source/Pages layouts from 320–1440 px. The browser checks mock service requests and never submit real results. Keep all changes local for review.

## Closest matches, divisiveness, consistency and community preferences

1. Reuse the normalized pair-order comparison for closest taste matches. Validate and deduplicate sessions, exclude the target UUID, preserve separate results with shared nicknames, and sort by agreement. Show the top three with full result codes and links to public result details; equal scores remain tied, ordered by date/code for display.
2. Calculate preference consistency from complete win counts. A completed session is a tournament on 17 vertices: every transitive triplet has exactly one character beating the other two. Sum `C(wins, 2)` to count transitive triplets and subtract from `C(17, 3) = 680` for circular triplets. Reject missing wins/counts and impossible tournament degree sequences using Landau's inequalities. Show the actual non-circular proportion and counts, explaining the 75% random-choice baseline rather than inventing a skill scale. This needs no historical result migration, additional requests or Worker change; manual screenshot records remain unavailable for this statistic.
3. Convert each saved session to ranks using average positions for tied scores. For each character, compute mean rank, population standard deviation of rank, and observed best/worst rank. Order by rank spread and show the top five with zoomable thumbnails, then all 17 in an expandable table. A single session is insufficient to measure disagreement; no sessions produce no fabricated summaries.
4. Apply existing faction/region arithmetic to the global mean-rating rows. This gives equal session weight and equal character weight within each group, with Louisiana/Vermont excluded only from factions. Reuse the group-membership explanation, but clearly title the panels as community averages and label the number of saved sessions. Search/sort never filters aggregate calculations.
5. Integrate personal insights with the shared result renderer and asynchronous reference refresh, keeping consistency independent of saving/network failures. Add global summaries on the public Results list, with full Turkish/English and theme support. `tests/community-insights.test.mjs` verifies known tournaments, enumerates all triplets in every complete stored history, checks ties, UUIDs, manual records and aggregate weighting. `tests/community-insights-check.mjs` verifies normal/manual/personal/community/public results, navigation, zoom, list filters, small cohorts, retry and saving independence, and source/Pages layouts at 320–1440 px. Keep all changes local for review.

## Ranking divergence from other participants

1. Validate/deduplicate public sessions and exclude the target UUID before averaging other participants' character ratings. Use the existing global leaderboard method for the reference, so participant ratings are equally weighted. An unsaved completed result compares against all saved sessions.
2. Compare all 136 unordered character pairs by final rating order. A reversal adds 1, a tie in exactly one ranking adds 0.5, and a shared tie adds 0. Divide by 136 and multiply by 100. Floating-point differences within 1e-9 rating points count as tied. This measures order divergence, not rating magnitude, vote-history inconsistency, statistical significance or population normality. Reference and personal ties receive average ranks for movement calculations.
3. Show the percentage, weighted pair count, mean absolute rank movement, largest three movements, all character differences and reference sample size. Manual rounded records are identified as such; missing wins are not required. Add card percentages and two sort options to find distinctive results without using arbitrary outlier thresholds.
4. Share rendering across private completed sessions, community selections and public result details. Fetch references for personal results without delaying or blocking saving. Retain loading/error/empty states and explicit retry. Guard asynchronous updates against navigation/language rerenders and share in-flight community requests. Changes require no Worker, data schema or historical result migration.
5. Verify known order reversals, adjacent swaps, ties, score-scale invariance, self-exclusion, UUID deduplication, equal weighting and manual sessions in `tests/rank-divergence.test.mjs`. Browser verification in `tests/rank-divergence-check.mjs` covers reference loading/retry, personal/community/public views, sort/search independence, both languages, phone themes and generated Pages assets. Review locally before committing or publishing.

## Faction and regional preference summaries

The shared individual-ranking renderer adds two panels below the character forest plot: Patriots versus Loyalists, and three regional averages. `assets/group-preferences.js` computes each group as the sum of member ratings divided by its size, using unrounded ratings from complete valid catalogs. This avoids rewarding the larger faction or region for having more characters. Massachusetts and New York retain equal character weight despite their leader labels. Louisiana and Vermont contribute only to geographic regions. New England includes Connecticut, Maine, Massachusetts, New Hampshire, Rhode Island and Vermont; Middle includes Delaware, New Jersey, New York and Pennsylvania; Southern includes Florida, Georgia, Louisiana, Maryland, North Carolina, South Carolina and Virginia.

`assets/group-preferences-view.js` renders translated means, the faction score gap, each region's gap below the highest region, and a shared rating scale. A details panel explains membership, calculation and the interpretation as character-design preferences. The summaries do not infer win rates, percentage preference or statistical significance from mean differences. Manual records use their recovered rounded ratings, with a precision note; comparison history and missing win counts are not required. The same view is used for personal results and both participant-browsing paths. Group definitions and labels stay out of saved records and require no Worker or result migration.

`tests/group-preferences.test.mjs` checks equal weighting, neutral exclusions, leader weighting, all region memberships, fractional scores, true ties, invalid catalogs and the actual recovered record. `tests/group-preferences-check.mjs` checks rendered means, membership explanations, Turkish/English, personal/community/public rendering, generated asset imports and light/dark layouts down to 320 px using mocked network requests.

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

## Keep deployed assets consistent after an update

Live HTML and source assets matched the approved preview, and a fresh browser passed the language and 17-image checks. The public responses use a ten-minute cache lifetime. The build now emits content-addressed asset filenames and rewrites both HTML references and transitive ES-module imports. A changed translation invalidates the language module and every importing entry point; unrelated assets retain their filenames. A deterministic public asset manifest identifies the build.

`tests/asset-build.test.mjs` covers transitive invalidation, deterministic output, resolvable references and missing/circular imports. `tests/cache-upgrade-check.mjs` reproduces a cached language module without event handlers and a cached stylesheet without the artwork grid, then verifies an ordinary reload of the built site restores the approved layout and language controls without clearing browser storage. It also checks all three pages, 17 expandable images, themes, narrow phones, the repository URL prefix and comparison input.

## Save recovery and owner-imported results

Auditing the public repository found five indexed results and five individual record files, so there was no orphaned record to recover for the sixth participant. This does not identify the precise cause of the original failed save. The former client made one request and required a manual retry, and a new session could replace an unsaved completed session.

`assets/save-queue.js` now retains validated, immutable completed payloads separately from the current session in `showcase-outbox:<catalog-version>`. It retries transient failures with exponential backoff (2 seconds through 5 minutes, plus jitter), honors rate-limit cooldowns even for manual retry, and resumes on reload/online/visibility events. Pending results survive starting a new session and remain downloadable as JSON. Invalid/mismatched receipts cannot mark results saved. Permanent HTTP errors remain backed up for explicit retry; unavailable local storage produces a download warning. A single-flight request within each tab and the existing server idempotency prevent duplicate result IDs. No identity, IP or device fields are added to records.

The Worker exposes `Retry-After` through CORS and supplies a 60-second cooldown for native rate limiting. Its existing immutable-record/SHA-merged-index protocol remains compatible; retries repair partial writes and lost receipts. The frontend also uses a 60-second fallback with the previously deployed Worker. No production writes or deployments are performed during local review.

The owner import script prepares nisacx's screenshot result with the requested Turkish completion time. Manual provenance remains restricted to owner-written records; the API strips client provenance and still recomputes complete histories. All 17 displayed integer scores are preserved; only Louisiana's explicitly visible 16/16 wins are retained. Exact uncertainty and remaining wins/counts are null. After reviewing the visible bars in the screenshot, their endpoints were digitized as separate `estimatedInterval` values. Shared rendering labels these bars and their table column as estimated 95% intervals, keeps unavailable statistics blank, labels manual results discreetly in both languages, and shows only the completion date, retaining the full timestamp in the saved JSON. Global means/top votes include recovered scores; win statistics exclude incomplete histories with an explanatory note. Fingerprinted assets cover both new modules as well as the updated translations and styles.

Interval recovery fits an affine rating-to-pixel scale from all 17 labeled dots: x = 539.8751303 + 0.3125143 × rating. The maximum calibration residual is 0.578 pixels (about 1.85 rating points). Cap midpoints are sampled away from the horizontal stroke and transformed back to rating units, rounded to integers. A conservative approximate ±5 rating-point tolerance covers calibration, rasterization and rounding; it is not a guaranteed error bound or a new statistical interval. No exact TrueSkill sigma or hidden comparison history is reconstructed. Louisiana is approximately 1421–2000 and Pennsylvania 56–645. Tests preserve the measured positions, verify axis calibration, validate provenance/bounds, and check all 17 rendered bars and translated estimate notes.

## Participant insights and pre-push audit — 6 October 2026

Approved additions include ranking divergence, closest taste matches, preference consistency with automatically loaded circular examples on its second tab, character rank spread, community faction/region preferences, character profiles, shareable PNG cards, dark-horse favorites and centered rating fingerprints. The participant agreement map was removed. Profile participant tables sort by descending rating; public participant cards show consistency before divergence. Individual results place all character artwork immediately after the main ratings and card button, followed by group preferences, two paired insight rows, and the fingerprint.

The audit passed `npm run check`, all 72 Node tests and `npm run build` (four public pages and 35 fingerprinted assets). All twelve optional Chromium checks passed: `browser-check`, `recovery-browser-check`, `cache-upgrade-check`, `theme-gallery-check`, `language-images-check`, `leaderboard-check`, `public-results-check`, `group-preferences-check`, `rank-divergence-check`, `community-insights-check`, `exploration-check` and `taste-insights-check`. They cover a complete 136-vote session, automatic save recovery and lost receipts, duplicate IDs, source/build parity and cached upgrades, every new statistic, artwork/cards/profile navigation, Turkish/English, both themes and 320–1440 px layouts. Browser submissions use mocked service storage; these checks create no production results.

All ten current result records agree with their index summaries. Normal records were recomputed from their full histories to verify ratings, uncertainty, wins and comparison counts. Manual screenshot recovery keeps its rounded-score and missing-history limitations. Result-file hashes are checked independently during release preparation so fetching new submissions does not remove or alter existing records.

Added `character.html` to the source verification workflow's push paths. Updated older browser checks to mock their empty-result scenarios explicitly and scope artwork/chart selectors to the intended section, accommodating the new thumbnails and fingerprint chart. The live API configuration and Worker remain unchanged. The existing manual Pages workflow publishes the checked artifact; public circular examples for newly submitted sessions still require their record files to be included in a subsequent Pages build.


## Live comparison histories — permanent circular-example fix

Added `GET /results/<uuid>` to the Worker. It reads the immutable result from the configured GitHub branch immediately, validates its public summary and complete fixed-catalog choices, and returns only public result fields. Missing records return 404; invalid or unreadable records return a retryable service error. The endpoint uses the existing CORS rules and no-store responses, performs no writes, and leaves submission rate limiting and saving behavior unchanged. Manual screenshot imports remain explicitly without recovered choices.

Shared frontend endpoint selection now loads histories from the configured live service, while unconfigured previews retain local UUID files. Existing identity/score/win checks, request sharing, validated caches, language rerenders and retry remain intact. The error message now describes connection/retry rather than requiring a site update. Deploy the Worker first, then publish the frontend once; subsequent submissions require no Pages rebuild for circular examples.

`tests/live-history-check.mjs` completes a fresh session through the actual Worker against mocked GitHub storage, makes every static history URL unavailable, and verifies automatic examples on source and built Pages paths. It checks Turkish/English, phone width, cache reuse and outage/retry without production writes. Unit coverage includes read-only access, UUID restrictions, CORS, missing/corrupt records, metadata filtering, manual imports, endpoint selection, invalid service URLs and absence of static fallback when live saving is configured.

Verification passed: all 76 Node tests, the full 136-vote/save browser regression, the circular-example browser regression, the fresh-result live-history regression, static checks, the Pages build and Wrangler 4.147.0 `deploy --dry-run`. All 12 participant records and their index were preserved unchanged. Production activation requires the owner to deploy the updated Worker, then run the manual Pages workflow once.


## Retire superseded manual recovery — 8 October 2026

Removed the manually reconstructed nisacx result (c686f7b4-9284-453e-801f-899de0b7aa0b) from the public index and result files after verifying Niase’s complete 136-choice submission (70b2edcc-0990-413d-81d0-7a46ab63f576). Every other participant record and summary remains intact. Aggregates now use the real submission without counting the screenshot reconstruction as a separate session.

Manual-result regression coverage now uses a synthetic test-only record, with its own fixture UUID and name, instead of depending on the retired public participant. The Pages artifact excludes these fixtures. Unit checks, the build, recovery/browser rendering and circular-example statistics pass after removal.
