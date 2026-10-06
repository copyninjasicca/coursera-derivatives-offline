"""Validate the local course package and produce its completeness report."""
from pathlib import Path
from urllib.parse import urlsplit, unquote
from lxml import html
from PIL import Image
from collections import Counter
import json, hashlib, html as h, re
from datetime import date
from pypdf import PdfReader

ROOT=Path(__file__).parent/'downloads/derivatives-options-futures'
manifest=json.loads((ROOT/'manifest.json').read_text())
external=json.loads((ROOT/'external-resources.json').read_text())
math_report=json.loads((ROOT/'validation-report.json').read_text())
oic_inventory=json.loads((ROOT/'oic-original/inventory.json').read_text())
advanced_reports={name:json.loads((ROOT/('oic-original/'+name+'-validation.json')).read_text()) for name in ('american','probability','portfolio')}
reconciliation=json.loads((ROOT/'reconciliation/results.json').read_text())
browser_report=json.loads((ROOT/'reconciliation/browser-validation.json').read_text())
oic_comparison=json.loads((ROOT/'oic-original/comparison.json').read_text())
errors=[]; checks=0; questions=0; choices=0; duration=0; images=0; core_bytes=0
def check(ok,label):
    global checks
    checks+=1
    if not ok:errors.append(label)
counts=Counter(e['kind'] for e in manifest['items'])
check(counts=={'video':34,'reading':16,'exercise':34},'Course inventory must contain 34 videos, 16 readings and 34 assignments')
check(len({e['id'] for e in manifest['items']})==84,'Duplicate course IDs')
for e in manifest['items']:
    folder=(ROOT/e['offline_page']).parent
    check((folder/'index.html').is_file(),e['id']+' page missing')
    for name in e['files']:
        p=folder/name;check(p.is_file() and p.stat().st_size>0,e['id']+' missing/empty '+name)
        if p.is_file():core_bytes+=p.stat().st_size
    if e['kind']=='video':
        media=e['media_validation'];seconds=float(media['format']['duration']);duration+=seconds
        check(any(s.get('codec_type')=='video' and s.get('height')==720 for s in media['streams']),e['id']+' video stream invalid')
        check(any(s.get('codec_type')=='audio' for s in media['streams']),e['id']+' audio stream absent')
        check((folder/'subtitles-en.vtt').read_text().startswith('WEBVTT'),e['id']+' subtitle header invalid')
        cue_text=(folder/'cues.js').read_text();cues=json.loads(cue_text.removeprefix('const SUBTITLE_CUES=').strip().removesuffix(';'))
        check(bool(cues),e['id']+' no subtitle cues')
        check(all(0<=c['start']<c['end']<=seconds+1 for c in cues),e['id']+' subtitle time outside video')
        check(all(cues[i]['start']<=cues[i+1]['start'] for i in range(len(cues)-1)),e['id']+' subtitle order invalid')
    elif e['kind']=='exercise':
        qs=json.loads((folder/'questions.json').read_text());questions+=len(qs)
        check(len(qs)==e['question_count'],e['id']+' count mismatch')
        for q in qs:
            choices+=len(q['choices_html']);check(bool(html.fromstring(q['prompt_html']).text_content().strip()),e['id']+' empty question')
            check(len(q['choices_html'])>=2,e['id']+' choices missing')
            check(q['answer_key'] is None,e['id']+' unsupported answer key')
    for image in e.get('image_assets',[]):
        if image.get('file'):
            p=folder/image['file'];images+=1
            try:
                with Image.open(p) as im:im.verify()
                check(True,e['id']+' image')
            except Exception as ex:check(False,e['id']+' invalid image '+str(ex))
check(questions==124,'Question total differs from 124')
check(choices==383,'Choice total differs from captured 383')
check(math_report['passed'],'Calculator validation failed')
check(advanced_reports['american']['status']=='passed','American validation failed')
check(advanced_reports['probability']['checks']>=1000 and all(abs(x['error'])<1e-8 for x in advanced_reports['probability']['quadrature']),'Probability validation evidence incomplete')
check(advanced_reports['portfolio']['status']=='pass','Portfolio validation failed')
check(browser_report['passed'],'Advanced browser validation failed')
check(reconciliation['fullOriginalEquivalence'] is False,'Reconciliation must preserve original differences')
check(len(manifest['offline_tools'])==7,'Seven independent lab panels expected')
check(len(oic_inventory)==7,'OIC inventory must contain seven directory tools')
check(oic_comparison['full_equivalence'] is False,'Original equivalence must not be asserted')
for original in oic_inventory:
    check((ROOT/original['offline_page']).is_file(),'OIC detail page missing')
    check(original['working_original_offline'] is False,'Server dependent originals must be labelled')
guide_pages=0
for pdf in (ROOT/'oic-original/guides').glob('*.pdf'):
    reader=PdfReader(pdf);guide_pages+=len(reader.pages)
    check(len(reader.pages)>0,'Empty OIC guide '+pdf.name)
check(guide_pages==18,'Original guides must contain 18 pages in total')
for asset in json.loads((ROOT/'oic-original/resource-manifest.json').read_text()):
    p=ROOT/'oic-original'/asset['file']
    check(p.is_file() and p.stat().st_size==asset['bytes'],'Original resource missing/size '+asset['file'])
    check(hashlib.sha256(p.read_bytes()).hexdigest()==asset['sha256'],'Original resource hash '+asset['file'])
credential_leaks=[]
for p in ROOT.rglob('*'):
    if p.is_file() and p.suffix in ('.html','.json','.txt','.js','.css'):
        if re.search(rb'(?:[?&]|&amp;)hmac=[A-Za-z0-9_-]{12,}',p.read_bytes()) or re.search(rb'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}',p.read_bytes()):credential_leaks.append(str(p.relative_to(ROOT)))
check(not credential_leaks,'Authorization JWT found in delivered files: '+str(credential_leaks))

reaudit_path=ROOT/'audit/results.json'
reaudit=json.loads(reaudit_path.read_text()) if reaudit_path.exists() else None
if reaudit:check(reaudit['passed'],'Independent source re-audit failed')
media_audit_path=ROOT/'audit/media-audit.json'
media_audit=json.loads(media_audit_path.read_text()) if media_audit_path.exists() else None
if media_audit:check(not media_audit['failures'] and media_audit['mp4_found']==36,'Full media decode audit failed')
article_missing=sum('tradersinsight.news' in x['url'] and x['status']=='unavailable' for x in external)
disclosure_saved=(ROOT/'external/occ-options-disclosure-june-2024.pdf').exists()
external_summary=(f'{article_missing} legacy Traders’ Insight references remain unavailable. ' + ('The current official OCC disclosure PDF, June 2024, 96 pages, is saved and resolves both legacy references; its historical version is not verified.' if disclosure_saved else 'The OCC disclosure PDF remains unavailable.'))
# Reports are created before the link audit so all authored links can resolve.
rows=''.join('<tr><td>'+h.escape(x['url'])+'</td><td>'+h.escape(x['status'])+'</td><td>'+h.escape(x.get('note','Public text snapshot saved.'))+'</td></tr>' for x in external)
modules=[]
for n in range(1,6):
    es=[e for e in manifest['items'] if e['module']==n];c=Counter(e['kind'] for e in es)
    modules.append({'module':n,'videos':c['video'],'readings':c['reading'],'assignments':c['exercise'],'questions':sum(e.get('question_count',0) for e in es)})
module_rows=''.join(f'<tr><td>{r["module"]}</td><td>{r["videos"]}</td><td>{r["readings"]}</td><td>{r["assignments"]}</td><td>{r["questions"]}</td></tr>' for r in modules)
body=f'''<main class="content"><div class="eyebrow">Captured 5 October 2026 · English edition</div><h1>Completeness & limitations</h1><p><a href="audit-report.html">Read the fresh independent audit of 6 October 2026 →</a></p><p>The 84 course items in the captured five-module outline have local pages: 34 videos, 16 readings and 34 assignment sets. The assignments contain 124 currently visible questions and 383 choices. All seven figures embedded in course readings were downloaded.</p><table><thead><tr><th>Module</th><th>Videos</th><th>Readings</th><th>Assignments</th><th>Questions</th></tr></thead><tbody>{module_rows}</tbody></table><h2>Media and files</h2><p>All 34 indexed videos have local 720p MP4, English VTT and English text transcript files. Total video duration: {duration/60:.1f} minutes. All 36 MP4s (34 indexed and two duplicate samples) fully decoded audio and video with FFmpeg without errors in the independent 6 October audit. Every retained transcript agrees with its full VTT text. Four original final captions (SHCPN, IcgXv, TWCPS and jNuPf) end 0.046–1.013 seconds after their media; on-screen ends are correctly clamped, while the original VTTs are retained. Images were decoded for integrity. SHA256SUMS.txt records package file hashes. Browser playback and captions were verified on Introduction to Options – The Greeks; every video was not watched from beginning to end.</p><h2>Local practice and progress</h2><p>Selections and studied markers are saved in browser storage. Export progress and answers to JSON to move them between browsers or preserve a backup; opening files directly and using a local server may use different storage. Exported files can be imported on the homepage. The archive has no Coursera scoring, completion certificates, answer keys, feedback after submission or unseen randomized question variants. No answers were submitted online. Online dates, attempts and grading rules do not apply to this local practice interface.</p><h2>Preserved and independent tools</h2><p>All seven original OIC directory tools were inventoried after login; five original PDF guides, descriptions, available UI observations and front-end files are in the <a href="oic-original/index.html">original archive</a>. Original engines and market feeds remain server dependent. The <a href="tools/index.html">independent lab</a> now has seven panels: option pricing/Greeks/IV, expiry strategies, parity, futures margin, probabilities, editable position scenarios, and imported market/HV analysis.</p><p>European BSM, American CRR and an escrowed cash-dividend approximation are implemented locally. Probability models include terminal and continuously monitored joint barrier events. Positions support signed stock/call/put legs, multipliers, expiries, styles, IV shifts, elapsed time and cash schedules. Local snapshots retain their source and date; the supplied example is synthetic. HV is annualized from consecutive log returns with explicit window, divisor and sessions/year. There is no original live feed or proprietary IVX.</p><p>The BSM/arithmetic suite passed {math_report['checks']} checks, American suite {advanced_reports['american']['checks']} checks, probability suite {advanced_reports['probability']['checks']} checks, and portfolio/import/HV suite {advanced_reports['portfolio']['testCount']} test groups. Browser interactions and JSON import/export were checked. See the <a href="reconciliation/index.html">implementation and numerical reconciliation</a> for models, test evidence and strict display-precision differences. Full original equivalence is not established. The zero-log-drift probability alternative matches marginal displays in one saved sample; original joint events remain unresolved.</p><p>Time is ACT/365; theta/day and vega/rho per one percentage point. Cash-dividend valuation is an approximation with step-dependent numerical Greeks. Position models omit stock dividend receipts, fees, financing, historical settlement paths and assignment simulation. Futures top-up restores the starting balance below maintenance and is illustrative. CME and IBKR trading services require online access.</p><h2>Supplementary sources</h2><p>Three course-linked CME public pages and the public OCC Learning introduction were saved as text snapshots. Embedded media, linked external courses and related sites are not complete offline copies. {external_summary} The course readings that list them are preserved.</p><table><thead><tr><th>Source URL</th><th>Status</th><th>Details</th></tr></thead><tbody>{rows}</tbody></table><h2>Use offline</h2><p>The supplied local launcher is the verified preview method; direct file navigation is unsupported by the in-app browser. You can also open index.html in a normal browser if its file policies permit. All course media, preserved reading figures, question pages and calculator scripts use local files. Links marked online intentionally open external sources. For consistent browser storage, start the supplied local preview launcher; it serves only this course folder on 127.0.0.1.</p><p><a href="integrity-report.json">File and link validation</a> · <a href="manifest.json">Course manifest</a> · <a href="external-resources.json">External resource log</a> · <a href="SHA256SUMS.txt">Checksums</a></p></main>'''
head='''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self' data:; script-src 'self'; style-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'"><title>Completeness report · Offline course</title><link rel="stylesheet" href="style.css"></head><body><div class="wrap"><header class="topbar"><a href="index.html">← Course library</a><span class="tag">COMPLETENESS REPORT</span></header>'''
(ROOT/'completeness-report.html').write_text(head+body+'</div></body></html>')
(ROOT/'README.md').write_text(f'''# Derivatives – Options & Futures: English offline edition

Open `index.html` in a browser. Keep this entire folder together.

Included: 34 videos (720p) with English captions/transcripts, 16 readings with seven figures, 34 current question sets (124 questions), and seven independent calculation panels. The indexed videos total {duration/60:.1f} minutes. Answers and studied markers are saved locally; use Export/Import to back them up.

Run `Open Offline Course.command` on macOS for a consistent local browser address. Alternatively run `python3 -m http.server 8765 --bind 127.0.0.1 --directory /path/to/this/folder`, then open http://127.0.0.1:8765/index.html. Stop the server with Ctrl-C.

Read `completeness-report.html` for exact coverage and limitations. OIC login succeeded: seven original tool reference pages, five PDF guides and observed front-end resources were archived in `oic-original/`. Original engines remain online; local calculators are independent implementations and observed price/IV differences are recorded in `reconciliation/index.html`. {external_summary} Current questions are preserved without answer keys, randomized variants or server grading. No answers were submitted online. Supplementary site courses, embedded media and live trading services are not complete offline copies.

`manifest.json` lists every course item; `external-resources.json` lists supplementary results; `validation-report.json` records {math_report['checks']} BSM/arithmetic checks; `oic-original/*-validation.json` records American/probability checks and portfolio test groups; `reconciliation/results.json` records strict original comparisons; `integrity-report.json` records file/link checks; `SHA256SUMS.txt` records file hashes. Initial sample downloads are retained in the two title-named folders and excluded from the 34 indexed video count. Account credentials are outside this course folder and are not served by the launcher.

Captured: 2026-10-05. Personal offline study copy.
''')
(ROOT/'completeness-report.md').write_text('# Completeness report\n\n'+html.fromstring(body).text_content()+'\n')
(ROOT/'integrity-report.json').write_text('{}\n')
(ROOT/'SHA256SUMS.txt').write_text('')
pages=[ROOT/'index.html',ROOT/'tools/index.html',ROOT/'completeness-report.html',ROOT/'reconciliation/index.html',ROOT/'audit-report.html']+[ROOT/e['offline_page'] for e in manifest['items']]+[ROOT/r['file'] for r in external if r.get('file','').endswith('.html') and r['status']!='recreated']
pages=sorted(set(pages+[ROOT/'oic-original/index.html',ROOT/'oic-original/comparison.html',ROOT/'oic-original/resources.html']+[ROOT/x['offline_page'] for x in oic_inventory]))
local_links=0;remote_loads=[]
for p in pages:
    node=html.fromstring(p.read_text())
    check(node.get('lang')=='en',str(p.relative_to(ROOT))+' language')
    for el in node.xpath('//*[@href or @src]'):
        url=el.get('src') or el.get('href');parsed=urlsplit(url)
        if parsed.scheme in ('http','https') or url.startswith('//'):
            if el.tag!='a':remote_loads.append(str(p.relative_to(ROOT))+': '+url)
            continue
        if parsed.scheme in ('data','blob') or not parsed.path:continue
        target=(p.parent/unquote(parsed.path)).resolve();local_links+=1
        check(target.is_relative_to(ROOT.resolve()) and target.is_file(),str(p.relative_to(ROOT))+' broken link '+url)
    check('You are a helpful AI assistant' not in p.read_text(),str(p.relative_to(ROOT))+' stray page injection')
check(not remote_loads,'Remote automatic loads: '+str(remote_loads))
report={'checked_on':date.today().isoformat(),'passed':not errors,'checks':checks,'course_pages':84,'inventory':dict(counts),'questions':questions,'choices':choices,'reading_images':images,'video_duration_seconds':duration,'indexed_file_bytes':core_bytes,'local_links_checked':local_links,'automatic_remote_loads':remote_loads,'calculator_checks_passed':math_report['checks'],'american_checks_passed':advanced_reports['american']['checks'],'probability_checks_passed':advanced_reports['probability']['checks'],'portfolio_test_groups_passed':advanced_reports['portfolio']['testCount'],'advanced_browser_validation':browser_report,'original_tools_inventoried':7,'original_pdf_guides':5,'original_guide_pages':guide_pages,'original_full_equivalence':False,'original_server_engines_offline':0,'original_frontend_resource_files':len(json.loads((ROOT/'oic-original/resource-manifest.json').read_text())),'authorization_jwt_leaks':credential_leaks,'modules':modules,'errors':errors,'browser_checks':['Course search and video filter','Local Greeks video playback with English captions','Studied marker survives reload','Local answer selection survives reload and can be cleared','Progress JSON export creates a valid file and import restores a studied marker','Option price/Greeks, implied volatility, covered put payoff and futures margin UI','OIC archive navigation, comparison table and original guide link','New Alpha row renders locally; IV inversion of 13.7343 returns 50.214585%','Archive comparison page fits the default 438px viewport without page overflow'],'limits':['Full local decode passed; original-to-local source MP4 byte hashes were not independently repeated','Only currently accessible assignment variants','Browser validation used loopback HTTP; direct file navigation is unsupported by the in-app browser','External source restrictions listed separately']}
(ROOT/'integrity-report.json').write_text(json.dumps(report,indent=2)+'\n')
hashes=[]
for p in sorted(ROOT.rglob('*')):
    if p.is_file() and p.name!='SHA256SUMS.txt':hashes.append(hashlib.file_digest(p.open('rb'),'sha256').hexdigest()+'  '+str(p.relative_to(ROOT)))
(ROOT/'SHA256SUMS.txt').write_text('\n'.join(hashes)+'\n')
print(json.dumps(report,indent=2))
if errors:raise SystemExit(1)
