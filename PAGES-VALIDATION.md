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

## Remaining publication gate

The authenticated repository's Pages settings still state **“Upgrade or make this repository public to enable Pages.”** No visibility change, upgrade or deployment has been performed. A user decision is pending.

These checks establish local deployment readiness. They do not establish a live Pages deployment, GitHub media range-request behavior, or production asset accessibility. Those must be verified after the publishing gate is resolved.
