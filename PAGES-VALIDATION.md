# GitHub Pages readiness check

Checked on 6 October 2026 against the prepared manual deployment workflow.

## Package and deployment

- `python3 verify_pages.py`: passed; 421 files, 572,090,826 bytes, 420 SHA-256 hashes, 930 local links, 84 course items and seven tool panels.
- Workflow YAML parsed successfully. The trigger is manual, the upload directory is `downloads/derivatives-options-futures`, and deployment depends on the artifact job.
- The whole course archive is the upload source; local account configuration and the repository root are outside it.

## Browser preview at a project URL path

Served the unchanged archive at `http://127.0.0.1:8766/coursera-derivatives-offline/` to exercise the same path structure as the expected Pages project URL.

- The course index, Greeks video, practice questions, original-resource index and reconciliation report loaded through their relative links.
- The Greeks MP4 loaded with no media error, duration 610.591995 seconds and ready state 4. Native playback advanced past 16 seconds and displayed the English caption “designed to familiarize traders with a set of”.
- A study marker survived reload. A question selection survived reload. These temporary preview changes were cleared afterward; the existing localhost library uses a different origin.
- All seven calculator tabs rendered. Changing the underlying price from 100 to 110 and calculating changed the displayed European call price from 13.695273 to 21.019220; put price became 3.673661. The parity panel displayed a residual of -0.000000.
- The browser's recorded warning/error log was empty at the end of the preview session.

## Published deployment and live verification

The user approved making the repository public. GitHub identity verification completed, repository settings confirm public visibility, and Pages settings confirm the GitHub Actions source.

- [Deployment run 37393810919](https://github.com/copyninjasicca/coursera-derivatives-offline/actions/runs/37393810919) succeeded for commit `38592d1367484c5f4b163809af2ff3e99bc79bdb`, with a 513 MB compressed artifact. Both build and deploy jobs succeeded; total duration was 1 minute 18 seconds.
- Live URL: <https://copyninjasicca.github.io/coursera-derivatives-offline/>. The deployed archive contains 421 files and 572,091,011 bytes after adding educational attribution on the home page.
- `PAGES-LIVE-VALIDATION.json`: all 421 publicly served files passed. Full hashes matched for 385 non-video files. All 36 MP4s passed size, MIME type, HTTP 206 range and first-1-KiB checks. Initial transient TLS connection errors were retried only for affected files; TLS certificate verification stayed enabled.
- Live browser playback of the Greeks video advanced beyond 34 seconds after native keyboard seeking, with ready state 4 and no media error. The English caption displayed “in the value of the underlying security.”
- A study marker and a question selection survived reload. Export produced a JSON containing the test answer. Clearing the answer and importing that exported JSON restored the selected answer. Temporary study/answer selections were cleared afterward; the existing localhost origin was unaffected.
- All seven calculator panels rendered on the live site. Changing the underlying to 110 recalculated the European call to 21.019220. Original-resource navigation and the reconciliation report also rendered. The browser warning/error log was empty after these checks.
- The private account configuration remains untracked and outside the deployed archive. A final scan of 343 tracked text files found no saved credential values or credential patterns.

The video checks verify accessibility and seeking support without hashing or decoding every entire MP4. The hosted edition uses browser-local storage; existing localhost progress can be transferred by export/import. Original server engines, live market feeds and server grading remain outside the offline implementation's stated scope.

## Independent source and media re-audit — 6 October 2026

273 source/recovery checks pass: 84 ordered IDs/types; 16 reading texts/seven figure asset IDs; 34 current sets/124 prompts/383 choices; 34 freshly downloaded exact English transcript hashes and source/local duration tolerance 0.05 seconds. All 36 local MP4s fully decoded audio/video with zero errors. The pre-repair published package passed complete SHA-256 for every one of 421 files, including 36 entire MP4s, plus video range checks. See `audit-evidence/pages-pre-repair-full-hash.json`.

Recovered the current June 2024 OCC PDF (96 pages), two matching official IBKR article texts/four figures, and the OIC calculator tutorial description (video remains online). Six legacy references still return 404 without a retrievable verified official replacement. Original source MP4 byte hashes were not independently re-downloaded; OIC engines/feeds/IVX, grading and unseen randomized questions are not copied.

Position import/export now retains American tree steps and distinct baseline/scenario prices, validates the complete scenario before changing editor state, and accepts legacy v1 without model options. All eleven actual-handler regression checks pass. The real local browser imported baseline100/scenario110/steps400 and exported them unchanged with P&L342.94. File chooser completion was delayed by the browser backend; no duplicate upload was performed.

Final package validation passes: 444 files, 573,345,209 bytes, 443 stored hashes and 967 authored local links, with no automatic remote loads. Repaired deployment and post-deployment live verification will be recorded below. Existing study progress was preserved; no online questions were answered or submitted.

Final browser verification caught that the supplementary-page rebuilder replaced the four recovered figures with missing-image placeholders. Source-image mappings now preserve those local assets. Both article figure lists and all four original image hashes are checked during the audit; the local browser rendered the three All That Glitters charts at their expected dimensions without overflow. The intermediate deployment is superseded by the final corrected run below.
