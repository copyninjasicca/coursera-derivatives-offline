"""Rebuild the offline course from locally captured files. No network requests."""
from pathlib import Path
from lxml import html, etree
import json, re, html as escape_html
from urllib.parse import urljoin

ROOT = Path(__file__).parent / 'downloads/derivatives-options-futures'
data = json.loads((ROOT/'manifest.json').read_text())
external = json.loads((ROOT/'external-resources.json').read_text())
modules = ['All About Options','Options Market Mechanics','Basic Option Strategies','Neutral Market Strategies','Mechanics of the Futures Market']
esc = lambda value: escape_html.escape(str(value), quote=True)
def directory(e):
    return ROOT/f"module-{e['module']:02d}"/(e['kind']+'s')/e['id']

ALLOWED = set('div span p strong em b i u s sub sup ul ol li h1 h2 h3 h4 h5 h6 br a table thead tbody tfoot tr td th img pre code blockquote hr figure figcaption svg path circle rect line polyline polygon text g math mrow mi mn mo mfrac msqrt msub msup msubsup mtable mtr mtd mtext semantics annotation'.split())
ATTRS = set('href src alt colspan rowspan viewbox viewBox d x y x1 x2 y1 y2 cx cy r rx ry points width height fill stroke stroke-width xmlns display encoding'.split())
def sanitize(markup, images=None, base=None, prefix='../../../'):
    node = html.fragment_fromstring(markup, create_parent='div')
    for el in list(node.iterdescendants()):
        if not isinstance(el.tag,str):
            if el.getparent() is not None: el.getparent().remove(el)
            continue
        if el.tag in ('script','style','iframe','object','embed','input','audio','video','source','dialog','nav'):
            el.drop_tree(); continue
        if el.tag in ('form','button'):
            el.drop_tag(); continue
        if el.tag not in ALLOWED:
            el.drop_tag(); continue
        for key in list(el.attrib):
            if key not in ATTRS: del el.attrib[key]
        if el.tag=='img':
            src=el.get('src',''); asset=next((x for x in images or [] if x.get('src')==src and x.get('file')),None)
            if base:src=urljoin(base,src)
            if asset: el.set('src',asset['file'])
            elif src.startswith(('https:','http:','//')):
                alt=el.get('alt','')
                if alt=='Opens in a new tab':el.drop_tree()
                else:el.tag='span';el.attrib.clear();el.text='[External image not preserved'+(': '+alt if alt else '')+']'
        if el.tag=='a':
            href=el.get('href','')
            if href.startswith(('javascript:','data:','mailto:')):el.attrib.pop('href',None);continue
            resolved=urljoin(base,href) if base else href
            saved=next((x for x in external if x['url']==resolved and x.get('file')),None)
            if saved:el.set('href',prefix+saved['file'])
            elif resolved.startswith(('http:','https:')):
                el.set('href',resolved); el.set('title','Online reference; not required for offline course browsing')
            elif base:el.set('href',resolved)
    return re.sub(r'[ \t]+\n', '\n', ''.join(html.tostring(c,encoding='unicode') for c in node))

def page(title,body,prefix='../../../',item_id='',extra=''):
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self' data:; script-src 'self'; style-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'"><title>{esc(title)} · Offline course</title><link rel="stylesheet" href="{prefix}style.css"></head><body data-id="{esc(item_id)}"><div class="wrap"><header class="topbar"><a class="back" href="{prefix}index.html">← Course library</a><span class="tag">OFFLINE EDITION</span></header>{body}<footer class="footer">Saved for personal offline study · <a href="{prefix}completeness-report.html">Completeness & limitations</a> · <a href="{prefix}tools/index.html">Derivatives lab</a></footer></div>{extra}<script src="{prefix}app.js"></script></body></html>'''

def parse_vtt(text):
    def sec(t):
        fields=[float(x) for x in t.replace(',','.').split(':')]
        return fields[-1]+60*fields[-2]+(3600*fields[-3] if len(fields)==3 else 0)
    cues=[]
    for block in re.split(r'\n\s*\n',text.replace('\r','')):
        lines=block.splitlines(); idx=next((i for i,l in enumerate(lines) if '-->' in l),None)
        if idx is None:continue
        times=lines[idx].split('-->'); content=re.sub('<[^>]+>','', '\n'.join(lines[idx+1:]))
        cues.append({'start':sec(times[0].strip()),'end':sec(times[1].strip().split()[0]),'text':escape_html.unescape(content)})
    return cues

question_total=0
for e in data['items']:
    folder=directory(e); folder.mkdir(parents=True,exist_ok=True)
    heading=f'<div class="eyebrow">Module {e["module"]} · {esc(e["kind"])}</div><h1>{esc(e["title"])}</h1>'
    source=f'<p class="muted"><a href="https://www.coursera.org{esc(e["url"])}">Original lesson (online)</a></p>'
    progress='<div class="toolbar"><button id="complete" class="primary">Mark studied</button></div>'
    extra=''
    if e['kind']=='video':
        transcript=(folder/'transcript-en.txt').read_text()
        cues=parse_vtt((folder/'subtitles-en.vtt').read_text())
        seconds=float(e['media_validation']['format']['duration'])
        e['subtitle_render_adjustments']=[{'original_end':c['end'],'render_end':seconds} for c in cues if c['end']>seconds]
        for c in cues:c['end']=min(c['end'],seconds)
        cues=[c for c in cues if c['start']<c['end']]
        (folder/'cues.js').write_text('const SUBTITLE_CUES='+json.dumps(cues,ensure_ascii=False)+';\n')
        e['cue_count']=len(cues)
        content=f'''<div class="video-frame"><video controls preload="metadata" src="video-720p.mp4" aria-label="{esc(e['title'])}"></video><div class="captions" id="captions" hidden><span id="caption-text"></span></div></div><div class="toolbar"><button id="toggle-captions" aria-pressed="true">English captions</button><a href="video-720p.mp4" download>MP4 · 720p</a><a href="subtitles-en.vtt" download>English VTT</a><a href="transcript-en.txt" download>English transcript</a></div><details><summary>Read transcript</summary><div class="transcript">{esc(transcript)}</div></details>'''
        extra='<script src="cues.js"></script>'
    elif e['kind']=='reading':
        original=(folder/'content.html').read_text()
        content='<div class="reading">'+sanitize(original,e.get('image_assets'))+'</div>'
        if e['id'] in ('Yo7Er','Rnk8d'):content+='<div class="notice">OIC originals were reviewed after login. <a href="../../../oic-original/options-calculator/index.html">Original resources and guide</a> · <a href="../../../reconciliation/index.html">Verified differences</a> · <a href="../../../tools/index.html">Independent offline option calculator & Greeks lab</a>.</div>'
        if e['id'] in ('dKqe8','wHWtW','VmHW4','9R3l9','AJzSB','pwE1L','QAbaO'):content+='<p><a href="../../../tools/index.html#payoff">Explore this strategy in the offline payoff tool →</a></p>'
        if e['id'] in ('2AsvI','ZwdJE'):content+='<p><a href="../../../tools/index.html#futures">Open the offline futures P&L and margin tool →</a></p>'
        if e['id']=='ozbIu':content+='<p class="notice">The IBKR Trader Workstation trial requires an online account and platform; it is not included as an offline replica.</p>'
    else:
        raw=json.loads((folder/'questions.json').read_text()); clean=[]; rendered=[]
        for i,q in enumerate(raw,1):
            if 'prompt_html' in q:
                prompt=q['prompt_html']; choices=q['choices_html']
            else:
                node=html.fromstring(q['html'])
                viewers=node.xpath('.//*[@data-testid="cml-viewer"]')
                prompt=sanitize(html.tostring(viewers[0],encoding='unicode'),e.get('image_assets'))
                choices=[]
                for label in node.xpath('.//label[.//input]'):
                    views=label.xpath('.//*[@data-testid="cml-viewer"]')
                    if not views:raise RuntimeError(f'Choice text missing: {e["id"]}/{i}')
                    choices.append(sanitize(html.tostring(views[0],encoding='unicode'),e.get('image_assets')))
            if not choices:raise RuntimeError(f'No choices: {e["id"]}/{i}')
            clean.append({'number':i,'prompt_html':prompt,'choices_html':choices,'answer_key':None})
            options=''.join(f'<label class="choice"><input type="radio" name="q{i}" value="{j}"><span>{choice}</span></label>' for j,choice in enumerate(choices))
            rendered.append(f'<section class="question"><fieldset><legend>Question {i}</legend>{prompt}{options}</fieldset></section>')
        (folder/'questions.json').write_text(json.dumps(clean,indent=2,ensure_ascii=False)+'\n')
        e['question_count']=len(clean);question_total+=len(clean)
        content='<p class="notice">Current visible question set. Randomized or future question variants are not included. No answer key was available without submitting. Selections are saved only on this device.</p>'+'\n'.join(rendered)+'<div class="toolbar"><button id="reset-answers">Clear this set</button><button id="export">Export answers & progress</button><span id="answer-status" class="local-status" role="status">Your selections stay local.</span></div>'
    body=f'<main class="content">{heading}{source}{content}{progress}</main>'
    (folder/'index.html').write_text(page(e['title'],body,item_id=e['id'],extra=extra))
    e['offline_page']=str((folder/'index.html').relative_to(ROOT))

for record in external:
    if record.get('file','').startswith('external/') and record.get('file','').endswith('.html') and record['status']!='recreated':
        p=ROOT/record['file']; source=p.with_suffix('.source.html')
        if not source.exists():source.write_text(p.read_text())
        captured=source.read_text();body=sanitize(captured,base=record.get('resolved_url',record['url']),prefix='../')
        p.write_text(page('Supplementary reading','<main class="content"><p class="notice">Public page snapshot. Linked courses, embedded videos and live services may require online access.</p><div class="reading">'+body+'</div></main>',prefix='../'))

sections=[]
for m,name in enumerate(modules,1):
    rows=[]
    for i,e in enumerate([x for x in data['items'] if x['module']==m],1):
        detail='720p · English captions & transcript' if e['kind']=='video' else f'{e["question_count"]} questions · local practice' if e['kind']=='exercise' else 'Saved text & available figures'
        rows.append(f'<div class="item" data-item="{e["id"]}" data-kind="{e["kind"]}"><span class="number">{i:02d}</span><span class="kind">{e["kind"]}</span><div><a class="title" href="{esc(e["offline_page"])}">{esc(e["title"])}</a><small>{detail}</small></div><span class="done" aria-label="Studied"></span></div>')
    sections.append(f'<section class="module"><div class="module-head"><h2><span class="muted">{m:02d}</span> {name}</h2><span class="eyebrow">{len(rows)} items</span></div>'+''.join(rows)+'</section>')
index=f'''<main><p class="notice">Independent educational study edition. Not affiliated with Coursera, Interactive Brokers, OIC or iVolatility. Original materials belong to their respective owners.</p><section class="hero"><div><div class="eyebrow">Interactive Brokers · Personal study library</div><h1>Derivatives.<br>Options & Futures.</h1><p>Five modules, one local library. Watch, read and practice at your own pace. The downloaded complete folder works without a login or internet connection. This hosted page needs a connection; use the local launcher for offline study.</p><p class="muted"><span id="progress">0</span> / 84 items marked studied</p></div><div class="stats"><div><strong>34</strong> videos</div><div><strong>16</strong> readings</div><div><strong>{question_total}</strong> questions · 34 sets</div></div></section><aside class="tools-banner"><div><div class="eyebrow">Derivatives lab</div><p>American and European pricing, probabilities, editable portfolios, imported market snapshots, historical volatility, payoffs and futures margin.</p></div><a href="tools/index.html">Open offline tools →</a></aside><div class="toolbar"><label for="search" class="eyebrow">Find a lesson</label><input id="search" type="search" placeholder="Search this course" aria-label="Search this course"><button class="active" data-filter="all">All</button><button data-filter="video">Videos</button><button data-filter="reading">Readings</button><button data-filter="exercise">Practice</button></div>{''.join(sections)}<div class="toolbar"><button id="export">Export progress & answers</button><label>Import progress <input id="import" type="file" accept="application/json"></label><a href="completeness-report.html">Completeness report</a><a href="audit-report.html">Fresh source audit</a></div></main>'''
(ROOT/'index.html').write_text(page('Derivatives — Options & Futures',index,prefix=''))
home=ROOT/'index.html'
home.write_text(home.read_text().replace('<div class="toolbar"><label for="search"', '<aside class="tools-banner"><div><div class="eyebrow">OIC original archive</div><p>Seven original tools, five official guides and verified numerical differences. Original engines require online services.</p></div><a href="oic-original/index.html">Open original resources →</a></aside><div class="toolbar"><label for="search"'))
data['question_total']=question_total
data['offline_tools']=[{'name':'Independent European / American option price, cash dividends & Greeks','page':'tools/index.html#pricing','preservation':'Independent BSM / CRR / escrowed dividend models, not original server engine'},{'name':'Expiry payoff explorer','page':'tools/index.html#payoff'},{'name':'Put-call parity','page':'tools/index.html#parity'},{'name':'Futures P&L and margin','page':'tools/index.html#futures'},{'name':'GBM probabilities and barriers','page':'tools/index.html#probability'},{'name':'Editable position scenarios','page':'tools/index.html#portfolio'},{'name':'Imported market snapshots and historical volatility','page':'tools/index.html#market'}]
data['implementation_reconciliation']={'page':'reconciliation/index.html','evidence':'reconciliation/results.json','full_original_equivalence':False,'model_evidence':['validation-report.json','oic-original/american-validation.json','oic-original/probability-validation.json','oic-original/portfolio-validation.json'],'market_feed':'User imported dated snapshots only; example is synthetic; no IVX'}
data['original_tool_archive']={'page':'oic-original/index.html','tool_count':7,'official_pdf_guides':5,'comparison':'oic-original/comparison.json','working_original_offline':False,'preservation':'Original descriptions, guides, UI observations and observed frontend files; server calculation and market feeds required.'}
(ROOT/'manifest.json').write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n')
print(f'Built 84 course pages; {question_total} questions; 7 offline learning panels.')
