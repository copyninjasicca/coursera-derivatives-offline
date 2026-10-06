# Independent local media audit — 6 October 2026

Audited every current local MP4, not the previous manifest validations. No archived course files or Git metadata changed.

- 34 indexed lessons, plus 2 retained samples: 36 / 36 MP4s present.
- 34 indexed duration: 6,894.237456 seconds (114.9039576 minutes).
- Every MP4 independently probed and fully decoded through FFmpeg 8.0.1: video and audio, no errors, 1280 × 720 H.264 video with AAC audio.
- 36 / 36 transcript files exactly match all original VTT text after whitespace normalization.
- 34 / 34 generated caption arrays exactly match their original VTT text/times with only the intended final-time clamp; 2,211 indexed captions.
- The samples are exact SHA-256 duplicates of indexed uZR67 and 3QwcO respectively. All 34 indexed video hashes are distinct.
- Maximum ending gap without a caption: 9.061995 seconds (3QwcO). All final caption text ends in a complete sentence or music marker; no obvious truncation clues in the text.

Four original final caption times extend beyond their independently measured media duration:

| Lesson | Caption overrun | Final caption / final-frame observation |
| --- | ---: | --- |
| SHCPN What is an Option? - Overview | 0.983991 s | Enjoy. / Traders Academy closing logo |
| IcgXv Stock Options: Benefits & Risks | 1.012993 s | Come back and join us. [MUSIC] / Traders Academy closing logo |
| TWCPS Neutral Market - Short Straddle | 0.045998 s | [MUSIC] / Traders Academy closing logo |
| jNuPf Mechanics of the Futures Market Overview | 0.987007 s | Come back and join us. / black end frame |

The original VTTs are preserved and the local player correctly clamps all four rendered ends. The current completeness report discloses only the IcgXv case; it should disclose all four small source-timing mismatches. No missing text is caused by the clamp.

Two source naming/content observations need comparison with Coursera: njhi2 is named Bear Market - Long Put but its transcript is an order-entry walkthrough similar to Practical Usage - Bear Market - Long Put (3GcpZ), although the two videos have different hashes/durations. 2v5yO is captured with the generic title New Video and discusses futures prices. These are not proven defects; the original source may carry those titles/content.

Full decode command per file (two workers, no archived mutations):

```sh
ffprobe -v error -show_streams -show_format -of json FILE.mp4
ffmpeg -nostdin -v error -err_detect explode -threads 1 -i FILE.mp4 -map 0:v:0 -map 0:a:0 -threads 1 -f null -
```

Machine-readable evidence: `media-audit-20261006.json` with hashes, durations, codec metadata, every decode exit/error output and detailed caption comparisons. Audit took 84.25 seconds.

Limits: decoding proves local stream integrity, not byte equality to today's source or an assertion that every source lecture was inventoried. Transcript/VTT identity is internal evidence, not audio-recognition verification. Only ending frames of the four timing-warning videos were manually inspected. Live Coursera inventory/source comparison and GitHub Pages byte comparison are separate audit scopes.
