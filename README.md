# American Revolution Smuggler — Character Ranker

A static GitHub Pages adaptation of [Quentin Wach’s Image Ranker](https://github.com/QuentinWach/image-ranker), exclusively for the 17 images in `showcase/`. The original Flask app stays in `image-ranker/`; the website starts at this folder’s `index.html`.

Visitors choose a pseudonym and compare all 136 unique image pairs. Auto-shuffle is always enabled after every three votes. There is no upload, folder selector, exclusion, or manual smart-shuffle control. Users can enlarge images, undo, defer a pair, pause, resume, download results, and explore other participants’ rankings and forest plots after finishing.

Turkish is the default language. Visitors can select English using the header language control; the choice stays in this browser across pages. Language changes preserve comparison progress, typed nicknames, result filters and the selected participant. Labels, chart explanations, historical categories, status messages, dates and accessible image labels follow the chosen language; saved results and character identifiers remain unchanged.

Each individual ranking keeps its large first-place image and adds an ordered gallery of all 17 characters. Images open in the shared viewer, where previous/next buttons and arrow keys follow rank order. The global leaderboard also includes an expandable thumbnail in each character row.

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

## Connect saving before publishing

GitHub Pages serves static files; it cannot run Flask or hold a private GitHub credential. The included Cloudflare Worker receives completed sessions and commits them to your repository. Visitors need only a nickname; they never need GitHub or Cloudflare accounts. You, the site owner, need a Cloudflare account once to set up the service.

1. Create your own GitHub repository containing the contents of **this folder**: `index.html`, `gallery.html`, `results.html`, `assets/`, `showcase/`, `server/`, `results/`, `scripts/`, `tests/`, `package.json`, `config.json`, and `.github/`. Do not publish only the nested `image-ranker/` folder. That folder is an independent checkout of the upstream project; use your own repository for this site. The static build excludes the original Python app, its virtual environment, server files, tests, and secrets.
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
- Save failures never discard browser progress. Users can retry with the same session ID or download their complete result. GitHub commits are made by the token’s service identity, not the participant.
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
