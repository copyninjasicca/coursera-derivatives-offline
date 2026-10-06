"""Read-only deployment checks; needs only Python's standard library."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parent / 'downloads/derivatives-options-futures'
errors = []
links = 0


class PageLinks(HTMLParser):
    def __init__(self, page):
        super().__init__()
        self.page = page

    def handle_starttag(self, tag, attrs):
        global links
        attrs = dict(attrs)
        for key in ('href', 'src'):
            url = attrs.get(key, '')
            parsed = urlsplit(url)
            if parsed.scheme in ('http', 'https') or url.startswith('//'):
                if tag != 'a':
                    errors.append(f'{self.page.relative_to(ROOT)}: remote load')
                continue
            if parsed.scheme or not parsed.path:
                continue
            links += 1
            if parsed.path.startswith('/'):
                errors.append(f'{self.page.relative_to(ROOT)}: root-relative URL {url}')
                continue
            target = (self.page.parent / unquote(parsed.path)).resolve()
            if not target.is_relative_to(ROOT) or not target.is_file():
                errors.append(f'{self.page.relative_to(ROOT)}: broken link {url}')


manifest = json.loads((ROOT / 'manifest.json').read_text())
report = json.loads((ROOT / 'integrity-report.json').read_text())
if not report['passed'] or len(manifest['items']) != 84:
    errors.append('Complete validated 84-item archive required')
if len(manifest['offline_tools']) != 7:
    errors.append('All seven independent tools required')

files = [p for p in ROOT.rglob('*') if p.is_file()]
size = sum(p.stat().st_size for p in files)
if size >= 1_000_000_000:
    errors.append('Site exceeds the 1 GB GitHub Pages limit')
for p in ROOT.rglob('*'):
    if p.is_symlink():
        errors.append(f'Symlink cannot be deployed: {p.relative_to(ROOT)}')
for p in files:
    if p.name.startswith('.env') or p.name.endswith(('.local.json', '.pem', '.key')):
        errors.append(f'Private configuration in archive: {p.relative_to(ROOT)}')
    if p.suffix in ('.html', '.js', '.json', '.txt', '.css', '.md'):
        if re.search(rb'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----|(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{30,}', p.read_bytes()):
            errors.append(f'Credential pattern in archive: {p.relative_to(ROOT)}')

hashes = 0
for line in (ROOT / 'SHA256SUMS.txt').read_text().splitlines():
    expected, name = line.split('  ', 1)
    p = (ROOT / name).resolve()
    if not p.is_relative_to(ROOT) or not p.is_file():
        errors.append(f'Missing checksum file: {name}')
        continue
    with p.open('rb') as stream:
        actual = hashlib.file_digest(stream, 'sha256').hexdigest()
    if actual != expected:
        errors.append(f'Checksum mismatch: {name}')
    hashes += 1
if hashes != len(files) - 1:
    errors.append('Checksum inventory must cover every file except itself')

external = json.loads((ROOT / 'external-resources.json').read_text())
originals = json.loads((ROOT / 'oic-original/inventory.json').read_text())
names = ['index.html', 'tools/index.html', 'completeness-report.html',
         'reconciliation/index.html', 'oic-original/index.html',
         'oic-original/comparison.html', 'oic-original/resources.html']
names += [x['offline_page'] for x in manifest['items'] + originals]
names += [x['file'] for x in external if x.get('file', '').endswith('.html')
          and x['status'] != 'recreated']
for name in sorted(set(names)):
    page = ROOT / name
    PageLinks(page).feed(page.read_text())

print(json.dumps({'passed': not errors, 'files': len(files), 'bytes': size,
                  'sha256_verified': hashes, 'local_links_checked': links,
                  'course_items': len(manifest['items']),
                  'tool_panels': len(manifest['offline_tools']),
                  'errors': errors}, indent=2))
if errors:
    raise SystemExit(1)
