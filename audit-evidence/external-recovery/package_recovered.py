from pathlib import Path
from lxml import html,etree
from urllib.parse import urljoin
import json,subprocess,hashlib,concurrent.futures,html as escape
base=Path(__file__).parent
mapping=[(9,'gold-silver-black-gold','https://www.interactivebrokers.com/campus/traders-insight/securities/commodities/gold-silver-the-black-gold-alternative/'),(11,'all-that-glitters','https://www.interactivebrokers.com/campus/?p=69405')]
records=[]
for i,slug,url in mapping:
 d=html.fromstring((base/f'source-{i:02d}.html').read_bytes())
 title=d.xpath('//h1')[0].text_content().strip()
 body=max(d.xpath('//div[contains(concat(" ",normalize-space(@class)," ")," page-content ")]'),key=lambda x:len(x.text_content()))
 for e in body.xpath('.//script|.//style|.//iframe|.//form|.//button|.//input|.//div[@class="related-tags"]|.//div[@id="comments"]'):
  e.drop_tree()
 image_records=[]
 for n,img in enumerate(body.xpath('.//img'),1):
  original=urljoin(url,img.get('data-src') or img.get('src'))
  local=f'{slug}-figure-{n}.png'
  p=subprocess.run(['curl','--fail','--silent','--show-error','--location','--connect-timeout','8','--max-time','20',original,'--output',str(base/local)],capture_output=True,text=True,timeout=25)
  ok=p.returncode==0
  image_records.append({'source':original,'file':local if ok else None,'downloaded':ok,'bytes':(base/local).stat().st_size if ok else 0})
  for a in list(img.attrib):
   if a not in ('alt',): del img.attrib[a]
  if ok: img.set('src',local)
  else: img.set('alt',(img.get('alt') or '')+' (image not archived)')
 for e in body.iter():
  for a in list(e.attrib):
   if a not in ('href','src','alt','title','colspan','rowspan'): del e.attrib[a]
  if e.tag=='a' and e.get('href'): e.set('href',urljoin(url,e.get('href')))
 content=html.tostring(body,encoding='unicode')
 page='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src \'self\' data:; script-src \'none\'; connect-src \'none\'; style-src \'unsafe-inline\'; object-src \'none\'; base-uri \'none\'"><title>'+escape.escape(title)+'</title><style>body{max-width:860px;margin:40px auto;padding:0 24px;font:18px/1.7 system-ui;color:#22352b;background:#fbfaf4}img{max-width:100%;height:auto}a{color:#245b48}header{border-bottom:1px solid #ccc;padding-bottom:20px}small{font-size:14px}</style></head><body><header><h1>'+escape.escape(title)+'</h1><p><a href="'+escape.escape(url,quote=True)+'">Official IBKR Campus source</a></p><small>Archived 2026-10-06. Recovered matching article from the current official IBKR Campus. Article text, figures and source disclosures retained; discussion, site navigation and promotional controls omitted. Embedded links may require internet.</small></header>'+content+'</body></html>'
 (base/f'{slug}.html').write_text(page)
 records.append({'slug':slug,'title':title,'source':url,'file':f'{slug}.html','images':image_records,'text_characters':len(body.text_content()),'status':'recovered_article_text_and_figures' if all(x['downloaded'] for x in image_records) else 'recovered_text_images_partial'})
# Preserve tutorial description and explicit online video boundary.
tutorial_url='https://www.optionseducation.org/videolibrary/oic-options-calculator-tutorial'
d=html.fromstring((base/'source-12.html').read_bytes())
main=d.xpath('//main')[0]
texts=[e.text_content().strip() for e in main.xpath('.//p') if e.text_content().strip()]
description=next((t for t in texts if 'powered by iVolatility' in t),'')
video='https://www.youtube.com/watch?v=gWYTcWGU9pI'
page='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>OIC Options Calculator Tutorial — Source Notes</title></head><body><h1>OIC Options Calculator Tutorial</h1><p>'+escape.escape(description)+'</p><p><a href="'+tutorial_url+'">Official OIC source</a> · <a href="'+video+'">Official page-linked YouTube video (online)</a></p><p>Archived 2026-10-06. Description and source link only. The externally hosted video, subtitles and transcript have not been copied and require online access.</p></body></html>'
(base/'oic-options-calculator-tutorial.html').write_text(page)
records.append({'source':tutorial_url,'file':'oic-options-calculator-tutorial.html','video_url':video,'status':'description_only_video_online','description_characters':len(description)})
(base/'recovered-packages.json').write_text(json.dumps(records,indent=2))
print(json.dumps(records,indent=2))
