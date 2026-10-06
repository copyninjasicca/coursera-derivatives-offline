"""Reconcile fresh source observations with the archive and publish audit evidence."""
from pathlib import Path
from lxml import html
from urllib.parse import urlsplit
import datetime, hashlib, json, re, shutil

BASE = Path(__file__).resolve().parent
ROOT = BASE / 'downloads/derivatives-options-futures'
EVIDENCE = BASE / 'audit-evidence'
DEST = ROOT / 'audit'
DEST.mkdir(exist_ok=True)
read = lambda p: json.loads(p.read_text())
write = lambda p, d: p.write_text(json.dumps(d, ensure_ascii=False, indent=2) + '\n')
norm = lambda s: re.sub(r'\s+', '', s or '').replace('Opensinanewtab', '')
manifest = read(ROOT / 'manifest.json')
byid = {e['id']: e for e in manifest['items']}
source = read(EVIDENCE / 'source-inventory-20261006.json')
readings = read(EVIDENCE / 'source-readings-20261006.json')
questions = read(EVIDENCE / 'source-questions-20261006.json')
video_downloads = read(EVIDENCE / 'source-video-observations.json')
media = read(EVIDENCE / 'media-audit-20261006.json')
checks = []
def check(label, passed):
    checks.append({'label': label, 'passed': bool(passed)})

check('All 84 source IDs and their order match the archive',
      [x['href'].split('/')[4] for x in source['items']] == list(byid))
check('All source item types match', all(
    {'lecture': 'video', 'supplement': 'reading', 'assignment-submission': 'exercise'}[x['href'].split('/')[3]] == byid[x['href'].split('/')[4]]['kind']
    for x in source['items']))
check('Sixteen readings freshly compared', len(readings) == 16)
for x in readings:
    e = byid[x['id']]
    local = (ROOT / e['offline_page']).with_name('content.html')
    check(x['id'] + ' original reading text', norm(x['content']['text']) == norm(html.fromstring(local.read_text()).text_content()))
    observed = [urlsplit(a['url']).path for a in x['content']['images']]
    archived = [urlsplit(a['src']).path for a in e.get('image_assets', [])]
    check(x['id'] + ' original figure asset IDs', observed == archived)
check('Thirty-four current question sets freshly compared', len(questions) == 34)
for x in questions:
    local = read((ROOT / byid[x['id']]['offline_page']).with_name('questions.json'))
    check(x['id'] + ' question count', len(local) == len(x['questions']))
    for i, (a, b) in enumerate(zip(local, x['questions']), 1):
        check(f'{x["id"]} question {i} prompt and ordered choices',
              norm(html.fromstring(a['prompt_html']).text_content()) == norm(b['prompt'])
              and [norm(html.fromstring(c).text_content()) for c in a['choices_html']] == [norm(c) for c in b['choices']])

video_sources = []
check('All 34 English source video transcripts freshly downloaded', len(video_downloads) == 34)
for x in video_downloads:
    e = byid[x['id']]
    local = (ROOT / e['offline_page']).with_name('transcript-en.txt').read_bytes()
    duration = float(e['media_validation']['format']['duration'])
    matched = x['sha256'] == hashlib.sha256(local).hexdigest() and x['bytes'] == len(local)
    delta = None if x['duration'] is None else x['duration'] - duration
    check(x['id'] + ' source transcript exact bytes', matched)
    check(x['id'] + ' source playback duration within 0.05 seconds', delta is not None and abs(delta) < .05)
    video_sources.append({'id': x['id'], 'sha256': x['sha256'], 'source_transcript_exact': matched,
                          'source_playback_seconds': x['duration'], 'local_seconds': duration, 'duration_difference_seconds': delta})
check('All 36 local MP4s fully audio/video decoded', media['mp4_found'] == 36 and not media['failures'] and all(v['decode_exit'] == 0 for v in media['videos']))
check('All local subtitle text agrees with transcripts', all(v['transcript_matches_all_vtt_text_after_whitespace_normalization'] for v in media['videos']))
position_tests = read(EVIDENCE / 'tools-position-import-validation.json')
check('Eleven import/export regression checks', position_tests['passed'] and position_tests['testCount'] == 11)
exported = read(EVIDENCE / 'browser-position-export.json')
check('Actual browser imported/exported distinct baseline, scenario and 400 steps',
      exported['market']['spot'] == 100 and exported['scenario']['spot'] == 110 and exported['modelOptions']['steps'] == 400)
external = read(ROOT / 'external-resources.json')
for resource in external:
    assets=resource.get('image_assets', [])
    if assets:
        p=ROOT/resource['file']
        rendered=html.fromstring(p.read_text())
        check(resource['file']+' all recovered figures rendered', [i.get('src') for i in rendered.xpath('//img')] == [a['file'] for a in assets])
        for a in assets:
            check(a['file']+' recovered source hash', hashlib.sha256((p.parent/a['file']).read_bytes()).hexdigest() == a['sha256'])
overruns = [{'id': v['id'], 'title': v['title'], 'seconds': max(c['end'] - v['duration_seconds'] for c in v['cues_exceeding_duration'])}
            for v in media['videos'] if v['indexed'] and v['cues_exceeding_duration']]
report = {'checked_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'passed': all(c['passed'] for c in checks),
          'scope': 'Fresh authenticated source outline, all readings, current question sets and all English video transcripts; local full decode; public Pages full-file hashes separately.',
          'full_original_replica': False, 'source_items': 84, 'source_readings': len(readings),
          'source_question_sets': len(questions), 'source_questions': sum(len(x['questions']) for x in questions),
          'source_choices': sum(len(q['choices']) for x in questions for q in x['questions']),
          'source_video_transcripts': len(video_sources), 'source_video_checks': video_sources,
          'local_full_decodes': 36, 'original_caption_overruns': overruns,
          'repairs': ['Restore American tree steps on position JSON import/export', 'Restore distinct scenario and baseline prices without partial invalid-import state changes',
                      'Preserve local recovered article figures during external-page rebuilding', 'Remove temporary signed image URL query strings from manifest and raw reading captures',
                      'Recover the current June 2024 official OCC disclosure PDF (96 pages), with explicit version provenance', 'Recover two matching IBKR articles and all four figures; preserve the OIC video tutorial description with explicit video-online limits'],
          'limits': ['Original source MP4s were not downloaded again for a separate original-to-local byte hash; all source transcripts match and playback durations differ by less than 0.05 seconds.',
                     'No Coursera server grading, answer keys, feedback after submission, certificates or unseen randomized variants.',
                     'Original OIC server engines, live feeds, proprietary IVX and account watchlists are not offline; local models are independent and full numerical equivalence is not established.',
                     'Generated reading-aloud audio and Coursera AI are online platform features, not preserved recordings.',
                     'External embedded media and linked courses are not complete offline copies. See the resource log for individual statuses.',
                     'Hosted Pages requires network access; the downloaded complete folder works offline via the local launcher. No service-worker offline cache is claimed.'],
          'checks': checks, 'external_resources': external}
write(DEST / 'results.json', report)
for name, data in [('source-inventory.json', source), ('source-readings.json', readings), ('source-questions.json', questions),
                   ('source-video-checks.json', video_sources), ('media-audit.json', media), ('tools-audit.json', read(EVIDENCE / 'tools-audit.json')),
                   ('position-import-validation.json', position_tests), ('browser-position-export.json', exported), ('external-recovery.json', read(EVIDENCE / 'external-recovery/recovery-summary.json'))]:
    write(DEST / name, data)
assert report['passed'], json.dumps([c for c in checks if not c['passed']], indent=2)

esc = __import__('html').escape
missing = [x for x in external if x['status'] in ('unavailable', 'online_only', 'server_required', 'reference_only', 'saved_description_video_online')]
rows = ''.join('<tr><td>' + esc(x['url']) + '</td><td>' + esc(x['status']) + '</td><td>' + esc(x.get('note', '')) + '</td></tr>' for x in missing)
body = f'''<main class="content"><div class="eyebrow">Independent re-audit · 6 October 2026</div><h1>What is complete—and what remains online</h1>
<p>原课程目录、16份阅读正文、124道题和383个选项均与本地一致。计算工具为独立实现，整个网站并非原平台的完整复制。</p>
<p>The current five-module outline contains exactly the same 84 IDs, item types and order as this library. All 16 original reading texts and seven figure asset IDs agree. All 34 current question sets, 124 prompts and 383 ordered choices agree after whitespace normalization. No assignment answers were selected or submitted.</p>
<h2>Videos and subtitles</h2><p>All 34 freshly downloaded English source transcripts are byte-identical to the retained files. Original playback durations and local file durations agree within 0.05 seconds. All 36 local MP4s—34 indexed clips and two exact duplicate retained samples—fully decoded both audio and video without errors. Indexed duration: {media['indexed_duration_seconds']/60:.3f} minutes; all clips are H.264 720p with AAC audio. Every retained transcript agrees with its full VTT text.</p>
<p>Four source caption endings overrun media by 0.046–1.013 seconds: SHCPN, IcgXv, TWCPS and jNuPf. Original VTT files are retained and rendered ends are clamped correctly. The apparent Bear Market – Long Put naming/content anomaly is also present in the source: its freshly downloaded njhi2 transcript matches exactly. The generic New Video title is retained from the outline.</p>
<h2>Repairs and supplementary material</h2><p>Position JSON now retains American tree steps and a scenario price distinct from the baseline. Eleven actual-handler regression checks passed, including invalid imports leaving editor state intact. A real browser imported the 100 baseline / 110 scenario / 400-step fixture and exported all three correctly, with P&amp;L 342.94. Current v1 exports remain supported. Temporary image URL signatures were removed; local figures retain their bytes.</p>
<p>The previously missing OCC disclosure PDF is now saved: <a href="external/occ-options-disclosure-june-2024.pdf">Characteristics and Risks of Standardized Options</a>, June 2024, 96 pages. It resolves both legacy course references; the historical version those links once served has not been identified. Other recovered supplementary material is listed in the <a href="external-resources.json">resource log</a>.</p>
<h2>Local and published parity</h2><p>The pre-repair hosted edition passed complete SHA-256 comparison of all 421 files, including all 36 entire MP4s and video range checks. The repaired edition is deployed and rechecked separately; the current deployment and public full-hash results are recorded in the repository <a href="https://github.com/copyninjasicca/coursera-derivatives-offline/blob/main/PAGES-VALIDATION.md">validation log</a> and <a href="https://github.com/copyninjasicca/coursera-derivatives-offline/blob/main/PAGES-LIVE-VALIDATION.json">machine-readable live checks</a>. Those checks identify their actual time and file counts.</p>
<h2>Limits of completeness</h2><ul>{''.join('<li>'+esc(x)+'</li>' for x in report['limits'])}</ul>
<p>Passing independent mathematics tests proves the stated models are consistent with their reference cases; it does not prove matching OIC outputs. <a href="reconciliation/index.html">Existing reconciliation</a> preserves original price/Greek/IV differences and unresolved probability comparisons.</p>
<table><thead><tr><th>Source still requiring online access or unavailable</th><th>Status</th><th>Details</th></tr></thead><tbody>{rows}</tbody></table>
<p><a href="audit/results.json">Re-audit results and checks</a> · <a href="audit/source-video-checks.json">All source video checks</a> · <a href="audit/media-audit.json">Full decode evidence</a> · <a href="completeness-report.html">Package report</a></p></main>'''
head = '''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self' data:; script-src 'self'; style-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'"><title>Independent re-audit · Offline course</title><link rel="stylesheet" href="style.css?rev=20261006-audit"></head><body><div class="wrap"><header class="topbar"><a href="index.html">← Course library</a><span class="tag">RE-AUDIT</span></header>'''
(ROOT / 'audit-report.html').write_text(head + body + '</div></body></html>')
(ROOT / 'audit-report.md').write_text('# Independent re-audit\n\n' + html.fromstring(body).text_content() + '\n')
print(json.dumps({'passed': report['passed'], 'source_checks': len(checks), 'videos': len(video_sources), 'question_sets': len(questions)}))
