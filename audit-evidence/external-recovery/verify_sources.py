from pathlib import Path
import json,subprocess,concurrent.futures
base=Path(__file__).parent
items=json.loads(Path('downloads/derivatives-options-futures/external-resources.json').read_text())
old=[x['url'] for x in items if 'tradersinsight.news' in x['url']]
known=['https://www.interactivebrokers.com/campus/traders-insight/securities/options/how-to-play-the-value-stock-boomlet-while-it-lasts/','https://www.interactivebrokers.com/campus/traders-insight/securities/commodities/gold-silver-the-black-gold-alternative/','https://www.interactivebrokers.com/campus/traders-insight/securities/commodities/economist-perspective-commodities-outlook-for-2021/','https://www.interactivebrokers.com/campus/?p=69405','https://www.optionseducation.org/videolibrary/oic-options-calculator-tutorial']
def check(pair):
 i,url=pair
 path=base/f'source-{i:02d}.html'
 p=subprocess.run(['curl','--silent','--show-error','--location','--connect-timeout','8','--max-time','20','--output',str(path),'--write-out','%{http_code} %{url_effective}',url],capture_output=True,text=True,timeout=25)
 return {'url':url,'result':p.stdout,'exit_code':p.returncode,'error':p.stderr,'file':str(path) if path.exists() else None,'bytes':path.stat().st_size if path.exists() else 0}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 rows=list(pool.map(check,enumerate(old+known)))
(base/'url-checks.json').write_text(json.dumps(rows,indent=2))
for row in rows: print(json.dumps(row))
