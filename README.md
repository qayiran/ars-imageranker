# American Revolution Smuggler — Character Ranker

A static GitHub Pages adaptation of [Quentin Wach’s Image Ranker](https://github.com/QuentinWach/image-ranker), exclusively for the 17 images in `showcase/`. The original Flask app stays in `image-ranker/`; the website starts at this folder’s `index.html`.

Visitors choose a pseudonym and compare all 136 unique image pairs. Auto-shuffle is always enabled after every three votes. There is no upload, folder selector, exclusion, or manual smart-shuffle control. Users can enlarge images, undo, defer a pair, pause, resume, download results, and explore other participants’ rankings and forest plots after finishing.

Turkish is the default language. Visitors can select English using the header language control; the choice stays in this browser across pages. Language changes preserve comparison progress, typed nicknames, result filters and the selected participant. Labels, chart explanations, historical categories, status messages, dates and accessible image labels follow the chosen language; saved results and character identifiers remain unchanged.

Each individual ranking keeps its large first-place image and adds an ordered gallery of all 17 characters. Images open in the shared viewer, where previous/next buttons and arrow keys follow rank order. The global leaderboard also includes an expandable thumbnail in each character row.

Individual results also compare **Patriots vs Loyalists** and **New England, Middle and Southern colonies** using the mean character rating in each group. Dividing by group size gives the 11 Patriots and 4 Loyalists equal footing; leaders receive no extra weight. Louisiana and Vermont are excluded from faction scores. Regional statistics include all 17 characters geographically: Maine and Vermont in New England, Florida and Louisiana in the South, and Maryland in the Southern group. The expandable group list shows every assignment. Factions use the site owner's character assignments, and these scores describe artwork preferences. They are rating averages, not percentages or historical political claims. Recovered screenshot scores can contribute without missing win counts; their rounded precision is identified.

Each result also shows **ranking divergence** from a reference ranking built from the mean character ratings of all other valid saved sessions. The result's own UUID is excluded, including duplicate copies; separate sessions sharing a nickname remain separate. The percentage is the number of reversed character pairs plus half-weight for ties in only one ranking, divided by 136: 0% means matching order, 100% means fully reversed order. Shared ties count as agreement, and tied characters share their average rank. This uses the pair-order idea underlying [Kendall rank comparisons](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.kendalltau.html), with the displayed tie rule; it does not compute a significance test. Average rank movement and per-character differences explain the score. Participant cards display the percentage and can be sorted by most divergent or most similar. Search does not redefine the reference group. Rounded manual records contribute without requiring win counts; near ties can be affected by rounding. Empty, loading and unavailable comparisons remain explicit.

Four further summaries are available. **Closest taste matches** show the three other sessions with the highest pair-order agreement, using the same tie handling as divergence and excluding only the target UUID. **Preference consistency** shows the exact proportion of non-circular three-character groups. Participant cards show this percentage immediately above divergence, with an unavailable label when complete win counts are missing. With all 136 pairs compared once, transitive triplets equal the sum of `wins × (wins − 1) / 2` over characters, and cyclic triplets equal `680 − that sum`; this follows the [standard tournament triplet count](https://users.metu.edu.tr/aldoks/341/Book%201%20%28Harary%29.pdf). Complete win counts suffice, so existing normal results require no migration or extra requests. Recovered results with missing win counts explicitly show consistency as unavailable. Random independent choices average 75% non-circular triplets, so this descriptive percentage is not a rescaled skill or taste-quality score.

The public Results page also shows **most divisive characters**, ordered by the population standard deviation of their ranks across saved sessions, plus observed best/worst and average rank. The five most divisive characters have expandable artwork; a table covers all 17. At least two saved sessions are required to compare participants. **Community faction and region preferences** apply the existing character-group averages to the global mean ratings, keeping equal weight for every session and normalizing group size. Both summaries use the full saved cohort, unaffected by participant-card search or sorting. Recovered rounded ratings are included in matches, rank spread and community group scores, with their precision identified.

**Character profiles** are available from the gallery, global leaderboard and divisive-character list at `character.html#character-id`. Each shows artwork, faction/region membership, mean rating, median rank, first or tied-first results, rating/rank distributions and linked participant results ordered from highest to lowest rating. Ties share distribution weight across their occupied positions. Win rates use complete comparison records only; recovered screenshot ratings still contribute to rating and rank summaries.

**Shareable result cards** preview the top three characters, preferred faction/region and full result code, then download as a 1200 × 1400 PNG. Cards follow the selected Turkish/English language and light/dark theme, identify manual records, include a result link and credit the artwork. Images are generated entirely in the browser with the site's existing assets; creating or downloading a card performs no submission or external sharing.

Three additional personal summaries are available. **Dark-horse favorites** are characters whose entire tied-position group fits in the participant's top five and in the bottom five of the other sessions' combined ranking. The reference uses mean ratings with the target UUID excluded and peer UUIDs deduplicated. Empty matches, unavailable references and rounded screenshot contributions remain explicit.

**Circular preference examples** show actual directed three-character loops, with artwork zoom and previous/next navigation through all recorded cycles. Personal results use their browser history immediately. The second page of the Preference consistency panel shows examples; public results automatically load and validate their complete comparison history from the same-origin `results/<uuid>.json`, checking the result identity, ratings and win counts. Summaries alone cannot reconstruct these choices. A newly saved record may require the next Pages build before its history file becomes available; loading failure is retryable and does not affect saving or other statistics. Manual screenshot records explicitly have no examples.

**Rating fingerprints** plot all 17 scores minus the participant's own mean, in fixed catalog order, with signed values and an accessible table. Character rows link to their profiles. The symmetric horizontal range adapts to the result and is printed on the axis; zero is the participant's mean, not the initial rating or community average. The visual describes score differences, not uncertainty or personality. Screenshot-recovered ratings are supported and identified as rounded.

## Preview locally

Node.js 22+ and Python 3 are sufficient. There are no frontend packages to install.

```sh
npm run check
npm test
npm start
```

Open `http://127.0.0.1:8000`. The default `config.json` intentionally has no results-service URL: comparisons and downloads work, and the page clearly says shared saving is unavailable. It never claims a result was saved to GitHub unless the service confirms it.

To preview just the deployment artifact:

```sh
npm run build
python3 -m http.server 8000 --bind 127.0.0.1 --directory _site
```

The build gives every JavaScript module, stylesheet and favicon a content-based filename and rewrites the complete module import graph. When a dependency changes, its importing modules receive new filenames too. This prevents cached files from an earlier deployment from breaking language controls or mixing old styles with new results markup. The generated `asset-manifest.json` identifies the deployed version. Preview `_site` as above to inspect the exact artifact GitHub Pages publishes.

## Connect saving before publishing

GitHub Pages serves static files; it cannot run Flask or hold a private GitHub credential. The included Cloudflare Worker receives completed sessions and commits them to your repository. Visitors need only a nickname; they never need GitHub or Cloudflare accounts. You, the site owner, need a Cloudflare account once to set up the service.

1. Create your own GitHub repository containing the contents of **this folder**: `index.html`, `gallery.html`, `results.html`, `character.html`, `assets/`, `showcase/`, `server/`, `results/`, `scripts/`, `tests/`, `package.json`, `config.json`, and `.github/`. Do not publish only the nested `image-ranker/` folder. That folder is an independent checkout of the upstream project; use your own repository for this site. The static build excludes the original Python app, its virtual environment, server files, tests, and secrets.
2. Create a [fine-grained GitHub personal access token](https://github.com/settings/personal-access-tokens/new) for **only your new repository**, with **Contents: Read and write**. Set a suitable expiration and renew it before it expires. Never put the token in `config.json`, source files, or a commit. Your target branch must allow the token owner to create commits through the API; a branch requiring pull requests needs an appropriately permitted service identity or a separate results branch.
3. Edit `server/wrangler.jsonc`. Set `GITHUB_OWNER`, `GITHUB_REPO`, and `GITHUB_BRANCH`. Set `ALLOWED_ORIGIN` to your website’s origin, such as `https://yourname.github.io` — **no repository path and no trailing slash**. For a custom domain, use its HTTPS origin. Multiple allowed origins can be comma-separated. The GitHub owner/repository values refer to your own site repository, not the upstream Image Ranker repository.
4. From the project root, run these commands yourself:

   ```sh
   npx wrangler@4 login
   npx wrangler@4 secret put GITHUB_TOKEN --config server/wrangler.jsonc
   npx wrangler@4 deploy --config server/wrangler.jsonc
   ```

   Paste the GitHub token at the secret prompt. Wrangler stores it as a Worker secret. If the secret command asks to create the Worker, accept. The deploy command prints a URL like `https://showcase-results.your-account.workers.dev`.
5. Set that URL in `config.json`:

   ```json
   {
     "resultsApiUrl": "https://showcase-results.your-account.workers.dev"
   }
   ```

   Use the base URL, **without `/results`**. Commit the public configuration change to your repository. No credential belongs in this file.
6. Publish GitHub Pages when ready. The included **Publish showcase to GitHub Pages** workflow is manual: choose **GitHub Actions** in your repository’s Settings → Pages, then run the workflow from Actions. It runs checks and uploads only `_site/`. Relative asset URLs also work at `https://yourname.github.io/repository-name/`. If you prefer Pages’ branch-based publishing, the root `index.html` and `.nojekyll` also work, but the Actions artifact is the cleaner option.
7. Complete a session on the published site. Verify the green saved confirmation and GitHub commit link. A new `results/<session-uuid>.json` and an updated `results/index.json` should appear in the configured branch. Open “Other rankings” from a second completed session to inspect the first person’s ranking and forest plot. Live results are read from the Worker, so saving does not require a Pages rebuild.

Nothing has been deployed by this implementation. The service cannot perform real writes until you configure and publish it. For the public website, keep the service available; an expired token or unavailable Worker produces a visible retry/download fallback.

Official references: [GitHub Pages’ static hosting](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site), [GitHub repository contents API](https://docs.github.com/en/rest/repos/contents?apiVersion=2022-11-28), [Cloudflare Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/), and [Workers rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

## Privacy and anonymity

Use a made-up nickname. No account, email, analytics script, remote font, or tracking cookie is requested. Images, fonts (system fonts), styles, and scripts load from the site itself. Outbound API requests omit credentials and referrer information. A random UUID identifies a comparison session, not a person or device; separate sessions get separate UUIDs.

The saved record includes the chosen nickname, random session ID, completion time, showcase/model version, all comparison choices, and derived ratings. The index contains the nickname, ID, completion time and derived rankings. **These are public**, both on the site and, for a public repository, in GitHub history. There is no attempt to enforce unique nicknames, verify identities, or prevent the same person from doing multiple sessions. Avoid identifying names if anonymity matters.

The application does not persist IP addresses, browser headers, location, or device identifiers in results, and Worker observability is disabled. Its native rate limiter temporarily uses the request IP as a limit key (five save attempts per minute); that key is never committed to GitHub. GitHub and Cloudflare still handle network requests and may retain infrastructure-level information under their own policies. This is **pseudonymous participation, not guaranteed network anonymity**. Do not enable request logging or analytics if they conflict with your privacy requirements.

Progress is stored in this browser’s `localStorage`, including your nickname and choices. It survives reloads on the same browser/origin; clearing browser site data removes it. Pause returns to the nickname screen, where you can resume. Starting over asks before replacing existing choices. Results remain in Git history even if the latest file is removed; tell participants this if you offer deletion.

## Rating model and forest plots

`assets/ranking.js` ports the actual `TrueSkillRanking.update_rating` implementation from `image-ranker/elo.py`: sequential 1-vs-1 TrueSkill with initial μ = 0, σ = 8.33, β = 25/6, τ = 25/300, and the upstream default draw probability of 0.1. Votes are decisive outcomes. Each vote updates the two compared images; it does not globally refit previous comparisons.

The initial queue uses Image Ranker’s randomized coverage ring followed by remaining unique pairs. Every three votes, remaining pairs are reordered using its priority `abs(μa − μb) + 0.8 × (counta + countb)`, with randomized tie order. Every image remains eligible. Deferred pairs return at the end and do not count as votes. Completing requires all 136 unique pairs, ensuring all images have 16 comparisons. Undo recalculates ratings from the remaining vote history and restores the last pair.

Ratings are displayed as **1,000 + 40 × μ**, an explicitly labeled Elo-style scale rather than classical Elo. The forest plot shows the rating estimate and approximate **95% posterior intervals**, **± 1.96 × 40 × σ**. They reflect model uncertainty within one person’s session, not population confidence intervals or agreement between participants. Each person has their own complete ranking and plot. The table provides the same estimates in an accessible alternative. Rating order can have a small dependence on comparison order because this preserves upstream’s sequential model.

## Results service behavior

- `GET /results`: reads the latest summary index from GitHub. No Pages rebuild is needed.
- `POST /results`: accepts an ID, pseudonym, showcase/model version and 136 winner/loser pairs. It validates that every fixed pair appears exactly once and recomputes ratings. Supplied ratings and unexpected fields are discarded.
- Each UUID gets one immutable result file. Resubmitting the same session is idempotent; changing a result under an existing ID is rejected. The index uses SHA-based optimistic retries so concurrent saves do not overwrite each other. If a result file is saved but the index update fails, retrying repairs the index without duplicating the session.
- CORS restricts browser submissions to configured origins. It is not authentication; scripts can forge an Origin header. The native rate limiter reduces accidental/spam bursts, but anonymous submissions cannot prove that a human cast the votes. This implementation suits a small public showcase; large studies may need stronger abuse controls and a database-backed index.
- Completed rankings enter a separate browser backup queue before submitting. Network and temporary server failures retry automatically with increasing delays while the site is open; reload, returning to the site and reconnecting resume pending saves. Starting another ranking retains older pending results. Rate limits wait at least 60 seconds and honor `Retry-After`. Only a matching confirmed receipt removes a backup. Permanent validation/configuration errors require explicit retry. Users can download the active result or all pending submissions. If browser storage is unavailable, the page warns users to download before closing. GitHub commits are made by the token’s service identity, not the participant.
- Result commits do not trigger the manual Pages workflow or source-only check workflow. If using GitHub’s automatic branch-based Pages deployment, GitHub may rebuild automatically on commits.

## Verification

```sh
npm run check
npm test
npm run build
```

The dependency-free Node tests cover unique pair coverage, the Python TrueSkill reference, shuffle order, complete rating statistics, validation, safe pseudonyms, recomputed server ratings, discarded personal metadata, concurrent index writes, idempotent retries, partial-save repair, CORS, request limits, and rate-limit handling. Browser integration checks are described in `IMPLEMENTATION.md`.

## Attribution

The adaptation preserves Image Ranker’s MIT attribution in `LICENSE.txt`. Showcase artwork is supplied by the repository owner; the software license does not grant third-party rights in the artwork.

## Gallery and color theme

`gallery.html` displays all 17 characters from HIROTONFA’s American Revolution Smuggler. It identifies the thirteen founding colonies and describes Florida as British East & West Florida, Louisiana as a Spanish colony, Maine as part of Massachusetts, and Vermont as a sovereign state during 1777–1791. Historical references are linked on the gallery page. Each image opens an enlarged viewer with previous/next controls and arrow-key navigation. A character can be linked directly using `gallery.html#connecticut` (or its catalog ID). The gallery’s images and labels also work without JavaScript.

The header’s **Theme** selector defaults to **Browser**, following `prefers-color-scheme` and updating when the browser preference changes. **Light** or **Dark** overrides are saved locally and carried between the ranker and gallery. Returning to Browser removes the override. If browser storage is unavailable, the selector still works for the current page.

## Public results and result codes

`results.html` is accessible from Rank, Gallery and Results navigation. Visitors can browse saved participant rankings, search by nickname, result code or top character, sort by date or name, and open each ranking’s forest plot and table without entering a username or completing a session. Individual rankings have shareable links such as `results.html#<session-uuid>`.

Every result displays a **Result code**: its complete random session UUID in uppercase. The full code avoids collisions caused by shortened prefixes and distinguishes different sessions using the same nickname without requesting identities or reserving nicknames. It remains the same through reloads, downloads and retried saves. It appears on public result cards, individual detail pages, your completed ranking and the post-comparison participant list. New saved records, index entries and downloads include a `resultCode` field derived by the software; client-supplied codes are ignored. Existing records receive the same derived display code without requiring a migration. The code identifies a public result; it is not an authentication secret or proof of identity.

The page reads the live Worker’s `/results` endpoint when configured, or the public `results/index.json` when no Worker URL is set. A failed live request shows an error and Retry button; it does not claim there are no submissions. With no saved rankings, both the participant list and leaderboard show empty states. The temporary public examples and their generator have been removed. Synthetic verification records are kept only in `tests/fixtures/`, which is excluded from the Pages build.

The optional `tests/public-results-check.mjs` browser check uses the same Playwright environment variables as the other checks and verifies public access, absence of demo data, duplicate-name codes, search/sort, direct links, participant browsing, service failure/retry, subdirectory paths, header/icon changes and light/dark phone layouts.

## Global colony/state leaderboard

The Results page starts with a global leaderboard for all 17 characters, available directly at `results.html#leaderboard`. It averages each character’s Elo-style rating across all valid, complete participant rankings, giving every ranking equal weight. It also shows total wins, win rate, first-place finishes and the number of combined comparisons. Duplicate session IDs count once. Separate completed sessions count separately, even if they use the same nickname; the site does not identify unique people. Search and sorting apply only to the individual ranking cards.

The expandable global forest plot shows mean ratings and the **minimum-to-maximum submitted rating** for each character. These ranges describe differences between rankings, not confidence intervals. Individual participants’ plots continue to show their TrueSkill posterior uncertainty.

The leaderboard uses only saved participant rankings. With no submissions, it shows an explicit empty state. When the live results service fails, it shows an error rather than stale scores. Refresh and Retry update the leaderboard and participant list together. No additional service configuration is required beyond the existing results endpoint.

`tests/leaderboard.test.mjs` checks the arithmetic, weighting, ranges, duplicate IDs and rejection of retired preview records. The optional `tests/leaderboard-check.mjs` browser check verifies table values, forest plots, filtering, refresh/error recovery, duplicate nicknames, gallery links, Pages subpaths and light/dark layouts down to 320 pixels, using the same environment variables as the other browser checks.

## Owner recovery from a screenshot

The public API continues to require every comparison and recomputes submitted scores. Manual recovery is an owner-only repository edit, with a small **Manually added / Elle eklendi** label on cards and participant details. Screenshot scores are stored as displayed integers. Exact uncertainty and missing win statistics remain `null`. When screenshot intervals can be measured, each row can contain a separate `estimatedInterval` with integer `lower`/`upper` endpoints, explicitly marked as estimates. Otherwise the plot shows dots only. Screenshot scores contribute equally to global averages and first-place counts. Global wins and win rates use only complete comparison records, with a note explaining the smaller sample.

Pull current repository results before importing so other participants remain in the index. Prepare a JSON file with `id` (optional UUID, supplied for repeatable recovery), `username`, `completedAt` (ISO time including a timezone), and 17 `rankings` rows containing fixed catalog `id` and integer `elo`. Only include `wins` and `count` when visible in the screenshot; otherwise omit both. To add measured intervals, set a positive `endpointAccuracy` in rating points and supply `estimatedInterval: { "lower": ..., "upper": ... }` for every row; these endpoints must contain the score and be approximately symmetric within that accuracy. The catalog ID for Massachusetts is historically spelled `masachusetts`.

```sh
node scripts/import-result.mjs /path/to/recovered-result.json
npm run check
npm test
npm run build
```

The script prepares an immutable `results/<uuid>.json` and merges it into `results/index.json`. It rejects a conflicting existing UUID. Review the local Results page before committing these files. If the participant later recovers their full downloaded JSON or original session, replace the manual recovery instead of counting both copies. The saved timestamp for nisacx is 4 October 2026 at 21:37 Turkish time (`2026-10-04T18:37:00.000Z`); the website displays only the completion date. Its 17 interval estimates were measured from the supplied screenshot using a calibrated scale of approximately 3.2 rating points per pixel. The figure and table identify the endpoints as estimates with roughly ±5 rating-point accuracy; this is a digitization tolerance, not an additional statistical confidence interval. The calibration measurements are preserved in `tests/fixtures/nisacx-interval-measurements.json`.

`tests/save-queue.test.mjs` verifies backoff, reloads, replacement sessions, lost receipts, rate limits, permanent errors, storage failures and single-flight requests. `tests/manual-results.test.mjs` verifies owner imports, provenance and aggregate arithmetic. `tests/recovery-browser-check.mjs` exercises automatic recovery and reviews the actual local imported result with mocked network requests; it never submits to the production Worker.
