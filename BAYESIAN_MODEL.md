# Bayesian community ranking

The public results page's existing **View global forest plot** disclosure contains one community plot fitted to all available, complete recorded choices. Calculation starts only when the disclosure opens. First-place probabilities and a collapsible model explanation are included in the same card. Existing individual TrueSkill results, arithmetic means in the leaderboard table, win totals, divergence and other statistics retain their calculations. The plot is explicitly labeled as Bayesian community scores because it estimates a different quantity from the average ratings in the table.

## Model and interpretation

This is a **custom static hierarchical probit preference model inspired by TrueSkill**, not an implementation of the original online TrueSkill algorithm. A session counts as one independent tester. The model assumes an additive preference for each character within each tester; circular choices are allowed through performance noise.

For K characters, let P = I − 11ᵀ/K. In the raw score units used by the individual rating model:

- Community preferences g ~ Normal(0, σg² P), with σg = 25/3.
- Tester deviations bᵤ ~ Normal(0, τ² P).
- Between-tester standard deviation τ ~ HalfNormal(25/3).
- Winner w over loser l has likelihood Φ(((g_w + bᵤw) − (g_l + bᵤl)) / (√2 β)), with β = 25/6.

Both g and each bᵤ sum to zero. These constraints identify score contrasts; priors are Gaussian in the K−1 dimensional contrast space. Each session contains every unordered pair once. The model uses decisive choices, a fixed performance scale and no temporal drift or draw margin. Inference estimates τ along with the scores, allowing disagreement to remain disagreement instead of treating all votes as independent measurements of one fixed preference.

Displayed community scores are 1000 + 40 g. Dots are posterior means. Bars are equal-tail 2.5th–97.5th percentiles of posterior samples of g, conditional on this model and its priors. They are marginal credible intervals, not a simultaneous coverage statement. They describe the shared community scores, not the predicted range of a new tester's preferences. First-place probabilities count posterior draws in which a character has the largest g. The taste-variation statistic is 40 τ, with its own credible interval.

Participants can share a nickname. Distinct session UUIDs count separately. The site cannot identify repeat testers, and does not correct selection bias from voluntary participation. Prior assumptions, independence assumptions, limited participants and the additive preference assumption constrain interpretation. Overlapping intervals and close posterior means warrant caution about precise rank order. Zero displayed first-place probability can be a rounded small Monte Carlo estimate.

## Inference

A module Web Worker runs four independently seeded chains. Internally scores are divided by √2 β, so latent comparison noise has unit variance. Albert–Chib augmentation draws each latent winning difference from a positive truncated normal. For a complete round robin, the graph Laplacian acts as K I on the contrast space. This gives an exact Gaussian block update rather than a matrix approximation.

Given latent comparisons, form qᵤ = Rᵤ/K, where Rᵤ is the signed sum of latent differences incident on each character. Conditional on g and τ, qᵤ has covariance c P with c = τ² + 1/K in normalized units. Before drawing g and b, integrate out both Gaussian blocks and slice-sample log τ using

    log p(log τ | z) = log τ − τ²/(2 sτ²)
      − (U−1)(K−1)/2 log c − Σᵤ‖qᵤ−q̄‖²/(2c)
      − (K−1)/2 log(sg²+c/U) − ‖q̄‖²/(2(sg²+c/U)) + constant.

Here sg and sτ are normalized prior scales. The log τ term is the Jacobian of the half-normal prior. The next Gaussian draws are g | z, τ and b | g, z, τ, centered by subtracting their means. This blocked update avoids the hierarchical funnel as τ approaches zero. Randomized stepping-out and shrinkage implement the slice update. Normal rejection and exponential tail rejection sample truncated normals, including negative latent means.

Each chain discards 1,500 warmup iterations and initially retains 2,000 draws. Sampling doubles up to 16,000 draws per chain if checks fail. All draws contribute to the published summaries. Tester deviations and the augmented joint log posterior are monitored every eighth draw to bound diagnostic memory; community scores and τ are monitored on all retained draws.

Checks cover every community score, τ, every tester deviation and the augmented joint log posterior. Rank-normalized split/folded R-hat must be below 1.01, and both bulk and tail ESS must be at least 400 for every monitored series. ESS uses Geyer's initial positive/monotone paired autocorrelation sequence. Rank normalization uses Blom's (rank − 3/8)/(S + 1/4) from the Vehtari paper. Diagnostics cannot prove convergence, but failures suppress the Bayesian scores. Retrying a convergence failure uses a new reproducible seed, recorded in the cached result.

## Data, delivery and failures

The frontend uses the existing read-only `/results/<UUID>` service for new comparisons, so a newly saved result does not require another Pages publication. Local previews with an empty API URL use repository files. Complete histories must match the public index's scores and per-character win counts. The sampler independently rejects incomplete pairs, duplicates and invalid indices. Screenshot imports are excluded from this model and labeled because their choices are unknown; they still contribute to existing averages as before.

Three concurrent history loads limit bursts. A missing or inconsistent history stops estimation for the whole snapshot instead of silently dropping that participant. Retry reuses valid already-loaded histories. Refresh cancels an old worker and ignores stale asynchronous completions. Calculation runs off the main thread and has a three-minute timeout; existing views remain usable on errors or unsupported workers.

One browser cache stores only validated posterior summaries, diagnostics and a fingerprint of the UUIDs and index statistics. It contains no raw comparison history or additional identifiers. A changed cohort, changed model settings or invalid cache forces recomputation. All sessions/pairs are canonically sorted; the default seed is deterministic. The asset build fingerprints the module-worker URL and its dependency chain, supporting GitHub Pages repository subpaths and cache invalidation. No backend deployment changes or new runtime dependencies are required.

## Validation and references

- Independent SciPy observed-data quadrature for two characters marginalizes tester effects analytically, then integrates community contrast and τ numerically. The sampler matches posterior means, credible bounds, taste variation and first-place probability within Monte Carlo tolerances. Regenerate with `python3 tests/reference/bayesian-quadrature.py`.
- Independent NumPy/SciPy diagnostics fixtures cover independent, autocorrelated, shifted, unequal-scale and tied chains. Regenerate with `python3 tests/reference/mcmc-diagnostics.py`.
- Analytical truncated-normal moments test central and extreme-tail draws.
- Simulated unanimous and opposing taste groups verify partial pooling, greater inferred disagreement, centered scores and credible intervals.
- Browser tests exercise the real fingerprinted worker, responsive navigation, history failure/retry, cache reuse/invalidation, new participants without a build, convergence rejection, both languages and small screens.

Sources: [TrueSkill (Herbrich, Minka & Graepel)](https://www.microsoft.com/en-us/research/wp-content/uploads/2006/01/TR-2006-80.pdf), [Albert & Chib (1993)](https://www.stat.cmu.edu/~brian/905-2009/all-papers/albert-chib-1993.pdf), [Neal, Slice Sampling](https://arxiv.org/abs/physics/0009028), [Vehtari et al., rank-normalization, folding and localization](https://arxiv.org/abs/1903.08008).
