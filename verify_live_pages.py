"""Verify an already-published course; no login or third-party credentials used.

Run: python3 verify_live_pages.py https://owner.github.io/repository/
All non-video files are checked by SHA-256. Videos are checked by HTTP size,
MIME type and a 1 KiB range request. Add --full-videos to also hash entire MP4s.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlsplit, quote
from urllib.request import Request, urlopen
import datetime
import hashlib
import json
import sys
import time

ROOT = Path(__file__).resolve().parent / 'downloads/derivatives-options-futures'
base = sys.argv[1].rstrip('/') + '/'
full_videos = '--full-videos' in sys.argv[2:]
parts = urlsplit(base)
if parts.scheme != 'https' or parts.hostname != 'copyninjasicca.github.io' or parts.path != '/coursera-derivatives-offline/':
    raise SystemExit('Use the approved HTTPS project URL for this course')
expected = {}
for line in (ROOT / 'SHA256SUMS.txt').read_text().splitlines():
    digest, name = line.split('  ', 1)
    expected[name] = digest
expected['SHA256SUMS.txt'] = hashlib.sha256((ROOT / 'SHA256SUMS.txt').read_bytes()).hexdigest()


def check(item):
    name, digest = item
    result = {'file': name, 'passed': False}
    url = base + quote(name, safe='/')
    try:
        if name.lower().endswith('.mp4'):
            size = (ROOT / name).stat().st_size
            with urlopen(Request(url, method='HEAD'), timeout=30) as response:
                result.update(status=response.status,
                              bytes=int(response.headers.get('Content-Length', -1)),
                              content_type=response.headers.get_content_type())
            with urlopen(Request(url, headers={'Range': 'bytes=0-1023'}), timeout=30) as response:
                prefix = response.read(1024)
                result.update(range_status=response.status,
                              content_range=response.headers.get('Content-Range'))
            with (ROOT / name).open('rb') as local:
                prefix_matches = prefix == local.read(1024)
            result['passed'] = (result['status'] == 200 and result['bytes'] == size
                                and result['content_type'] == 'video/mp4'
                                and result['range_status'] == 206
                                and result['content_range'] == f'bytes 0-1023/{size}'
                                and prefix_matches)
            result['method'] = 'size + MIME + range + prefix'
            if full_videos:
                with urlopen(url, timeout=60) as response:
                    actual = hashlib.sha256()
                    downloaded = 0
                    for block in iter(lambda: response.read(1024 * 1024), b''):
                        actual.update(block)
                        downloaded += len(block)
                    result.update(full_status=response.status, sha256=actual.hexdigest(), downloaded_bytes=downloaded)
                if downloaded != size:
                    raise IOError(f'Truncated video transfer: received {downloaded} of {size} bytes')
                result['passed'] = result['passed'] and result['full_status'] == 200 and downloaded == size and result['sha256'] == digest
                result['method'] = 'complete SHA-256 + video range'
        else:
            with urlopen(url, timeout=30) as response:
                actual = hashlib.sha256()
                for block in iter(lambda: response.read(65536), b''):
                    actual.update(block)
                result.update(status=response.status, sha256=actual.hexdigest())
            result['passed'] = result['status'] == 200 and result['sha256'] == digest
            result['method'] = 'complete SHA-256'
    except Exception as exc:
        result['passed'] = False
        result['error'] = str(exc)
    return result


def check_with_retry(item):
    for attempt in range(1, 4):
        result = check(item)
        result['attempts'] = attempt
        if 'error' not in result:
            return result
        if attempt < 3:
            time.sleep(attempt * 0.5)
    return result


retained = {}
report_path = Path('PAGES-LIVE-VALIDATION.json')
if '--retry-failed' in sys.argv[2:] and report_path.exists():
    previous = json.loads(report_path.read_text())
    if previous['url'] != base:
        raise SystemExit('Previous validation used a different site')
    for result in previous['results']:
        name = result['file']
        if result['passed'] and 'error' not in result and name in expected:
            if result.get('method') in ('complete SHA-256', 'complete SHA-256 + video range') and result.get('sha256') == expected[name]:
                retained[name] = result
            elif not full_videos and result.get('method') == 'size + MIME + range + prefix' and result.get('bytes') == (ROOT / name).stat().st_size:
                retained[name] = result
pending = [(name, digest) for name, digest in sorted(expected.items()) if name not in retained]
with ThreadPoolExecutor(max_workers=4) as pool:
    for result in pool.map(check_with_retry, pending):
        retained[result['file']] = result
results = [retained[name] for name in sorted(expected)]
report = {'checked_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'url': base, 'passed': all(r['passed'] for r in results),
          'files_checked': len(results),
          'complete_hashes_checked': sum(r.get('method', '').startswith('complete SHA-256') for r in results),
          'videos_range_checked': sum(r.get('method') in ('size + MIME + range + prefix', 'complete SHA-256 + video range') for r in results),
          'videos_complete_hashes_checked': sum(r.get('method') == 'complete SHA-256 + video range' for r in results),
          'files_rechecked_this_run': len(pending),
          'limitations': (['Published MP4s were fully hashed; local decoding is separate.'] if full_videos else ['Video checks do not hash or decode entire MP4 files.']),
          'results': results}
Path('PAGES-LIVE-VALIDATION.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({k: v for k, v in report.items() if k != 'results'}, indent=2))
if not report['passed']:
    print(json.dumps([r for r in results if not r['passed']], indent=2))
    raise SystemExit(1)
