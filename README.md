# Coursera derivatives offline library

Personal offline study archive for **Derivatives – Options & Futures**, with an English course library, independent calculation tools and original-tool reconciliation.

## Open the library

**Live website:** [Derivatives — Options & Futures](https://copyninjasicca.github.io/coursera-derivatives-offline/) · [Calculators](https://copyninjasicca.github.io/coursera-derivatives-offline/tools/index.html)

Run `downloads/derivatives-options-futures/Open Offline Course.command` on macOS, or serve the archive folder:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory downloads/derivatives-options-futures
```

Open <http://127.0.0.1:8765/index.html>. Keep the whole archive folder together. The server serves the archive, not the repository root.

## Contents

- 34 local 720p videos with English captions and transcripts, 16 readings and 34 captured question sets.
- Seven offline tool panels: European/American pricing and Greeks, expiry payoffs, parity, futures margin, probabilities, editable portfolios, and imported market snapshots/HV.
- Original OIC reference guides/resources, nine recorded original pricing cases, model validation and unresolved numerical differences.
- Local study progress and answers with JSON export/import; no server grading or answer keys.

Start with the archive's `completeness-report.html` and `reconciliation/index.html` for precise coverage and limitations. The independent models are not the original OIC/iVolatility server engines. Market examples are synthetic; no live feed or proprietary IVX is included. Original course and vendor materials remain subject to their respective owners' rights. This independent educational project is not affiliated with Coursera, Interactive Brokers, OIC or iVolatility.

## Validation and regeneration

Run the four `test_*_math.cjs` files with Node.js. The probability test accepts `--write-validation`. Model evidence and package hashes are saved inside the archive.

Builders: `build_offline.py`, `build_advanced_tools.py`, `build_oic_archive.py`, `reconcile_models.cjs`, `build_reconciliation.py`, and `audit_offline.py`. Python builders/audits use lxml, Pillow and pypdf. The checked-in HTML, scripts and media run without these build dependencies.

Local account configuration, credentials, environment files and machine-generated caches are excluded from Git.

## GitHub Pages deployment

The repository and website are public. GitHub Pages deploys with GitHub Actions. [The first deployment succeeded](https://github.com/copyninjasicca/coursera-derivatives-offline/actions/runs/37393810919) on 6 October 2026.

Run **Actions → Publish course library to GitHub Pages → Run workflow** on `main`. The workflow deploys only `downloads/derivatives-options-futures` as the site root, including all media and seven independent tools. It does not upload the repository root or local account configuration. No additional token is needed.

Live project URL: `https://copyninjasicca.github.io/coursera-derivatives-offline/`. GitHub's deployment output is the authoritative live URL. Deployment is manual so a push does not automatically publish materials.

Run `python3 verify_pages.py` before deployment to check size, package hashes, relative asset links and credential patterns. The archive fits the 1 GB published-site limit. GitHub Pages also has a soft 100 GB monthly bandwidth limit; video viewing counts toward it.

[Pages verification evidence](PAGES-VALIDATION.md) records local and live browser checks. [The live file report](PAGES-LIVE-VALIDATION.json) checks all 421 published files: full SHA-256 for 385 non-video files, and size/MIME/range/prefix checks for 36 MP4s (34 indexed lessons and two retained samples). Run `python3 verify_live_pages.py https://copyninjasicca.github.io/coursera-derivatives-offline/` to repeat the file checks. Video checks do not hash or decode whole videos.

Progress remains in each browser's local storage. To move existing localhost progress to the hosted site, export progress and answers from the local library, then import that JSON on the hosted library. Hosting does not add cloud sync or server grading.

Provider documentation: [custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [availability and public site visibility](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site), and [size/bandwidth limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

The [fresh completeness audit](https://copyninjasicca.github.io/coursera-derivatives-offline/audit-report.html) reconciles the current original course against the local edition, lists recovered attachments and remaining online dependencies. Rebuild audit evidence with `build_reaudit.py` after `build_offline.py`, then regenerate package checksums with `audit_offline.py`. Public full-video hash verification is available via `python3 verify_live_pages.py https://copyninjasicca.github.io/coursera-derivatives-offline/ --full-videos`; use `--retry-failed` to retain already verified identical files.
