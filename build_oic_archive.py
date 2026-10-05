"""Build a read-only original-resource archive from captured local files."""
from pathlib import Path
from lxml import html
import json, html as h, shutil, hashlib

COURSE=Path(__file__).parent/'downloads/derivatives-options-futures'
ROOT=COURSE/'oic-original'
esc=lambda x:h.escape(str(x),quote=True)
inventory=json.loads((ROOT/'inventory.json').read_text())
comparison=json.loads((ROOT/'comparison.json').read_text())
features={
'trending-options-volume':('Top twenty stocks, indexes and ETFs by option volume; call/put volume and volatility metrics.','Remote market feed and session rankings. A saved snapshot is not an offline data service.'),
'options-monitor':('Option chains, expirations, bid/ask, volume, Delta and IV; links into pricing and probability calculators.','Remote symbol dictionary, option chains and proprietary volatility data.'),
'stock-monitor':('Stock/index watch lists, option volume, 30-day IVX and historical volatility.','Server market data and saved watch lists; no account watch-list clone included.'),
'options-calculator':('American and European call/put pricing, Delta, Gamma, daily Theta, Alpha, Vega, Rho and inverse implied volatility; regular cash dividends or yield.','Pricing and IV inversion call remote /optcalc/option-calculator endpoints. Front-end files do not include this server engine.'),
'pnl-calculator':('Multiple stock and option legs, quantity, side, entry price, theoretical P&L, aggregate Greeks and scenario charts; relative/absolute IV shifts.','Remote option chain and valuation services. Original UI was observed online; the complete application and server engine are not supplied.'),
'probability-calculator':('Terminal below/between/above probabilities, touching P1/P2/both/either/neither and six standard-deviation price boundaries.','Remote /optcalc/probability-calculator/calculate engine; exact model and joint-touching semantics were not established.'),
'historical-and-implied-volatility-new':('One-year price, historical-volatility and IVX charts; volatility summary statistics.','Remote historical series and proprietary IVX calculation. Original historical data is not a complete offline feed.')}
models={
'options-calculator':'Official guide: European Black-Scholes; American 100-step binomial model. Exact binomial convention, day count and cash-dividend handling were not established. Alpha = Gamma / daily Theta; Vega and Rho are per 1 percentage point.',
'pnl-calculator':'Official guide: Black-Scholes for European and certain no-dividend American cases; otherwise Cox–Ross–Rubinstein tree. Tree step count is not specified. Position Greeks scale with quantity and contract multiplier; default option multiplier is 100.',
'probability-calculator':'Official guide explains terminal and touching events, ATM/IVX/HV choices and standard-deviation boundaries. It does not specify the exact stochastic model, drift, day count or joint-touching formula.'}

def page(title,body,deep=False):
    p='../../' if deep else '../'
    back='../index.html' if deep else '../index.html'
    body=body.replace('<table>','<div class="table-scroll" tabindex="0"><table>').replace('</table>','</table></div>')
    own='../archive.css' if deep else 'archive.css'
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self' data:; script-src 'none'; style-src 'self'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'"><title>{esc(title)} · OIC archive</title><link rel="stylesheet" href="{p}style.css"><link rel="stylesheet" href="{own}"></head><body><div class="wrap"><header class="topbar"><a class="back" href="{back}">← {'OIC tools archive' if deep else 'Course library'}</a><span class="tag">ORIGINAL RESOURCES</span></header><main class="content">{body}</main><footer class="footer">Captured 5 October 2026 · <a href="{p}tools/index.html">Independent offline lab</a> · <a href="{p}completeness-report.html">Course coverage</a></footer></div></body></html>'''

# Preserve raw remote application index as text, not an executable offline page.
(ROOT/'archive.css').write_text('.table-scroll{max-width:100%;overflow-x:auto;margin:1rem 0}.table-scroll table{min-width:600px}.table-scroll td{overflow-wrap:anywhere}.content pre{white-space:pre-wrap;overflow-wrap:anywhere}.content img{max-width:100%;height:auto}.content details{margin:1rem 0}.content details summary{cursor:pointer}.content figure{margin:2rem 0}.content figcaption{font-size:.85rem;color:#687366}\n')
raw=ROOT/'ivol-app/index.source.html'
if raw.exists():raw.rename(ROOT/'ivol-app/index.source.html.txt')
for pdf in (ROOT/'guides').glob('*.pdf'):
    extracted=Path('/private/tmp/oic-guides-review')/(pdf.stem+'.txt')
    if extracted.exists():shutil.copyfile(extracted,pdf.with_suffix('.txt'))

cards=[]
for record in inventory:
    slug=record['slug']; folder=ROOT/slug
    record['offline_page']='oic-original/'+slug+'/index.html'
    record['status']='original_resources_saved_server_required'
    record['working_original_offline']=False
    record['features'],record['dependency']=features[slug]
    source=html.fromstring((folder/'description.source.html').read_text())
    headings=source.xpath('.//h2')
    description=' '.join(headings[0].text_content().split()) if headings else record['features']
    record['description']=description
    guide=ROOT/'guides'/(slug+'.pdf')
    guide_links=f'<p><a href="../guides/{slug}.pdf">Official original PDF guide</a> · <a href="../guides/{slug}.txt">Extracted guide text</a></p>' if guide.exists() else '<p>No PDF guide was linked on this tool page.</p>'
    record['guide_file']='oic-original/guides/'+slug+'.pdf' if guide.exists() else None
    evidence=[]
    for name in ('online-ui.txt','online-case.json','implied-volatility-online.txt','request-parameters.json','online-preview.jpg'):
        if (folder/name).exists():evidence.append(f'<a href="{name}">{esc(name)}</a>')
    note=record.get('online_observation','See saved description and guide; live engine availability was not established for this tool.')
    body=f'<div class="eyebrow">Original OIC · powered by iVolatility</div><h1>{esc(record["title"])}</h1><p class="notice">Original reference archive. The original interactive calculator is not operational offline.</p><p>{esc(description)}</p><h2>Functions and dependencies</h2><p>{esc(record["features"])}</p><p>{esc(record["dependency"])}</p><p>{esc(models.get(slug,"This tool primarily depends on market data supplied by the vendor."))}</p><h2>What was verified</h2><p>{esc(note)}</p>{guide_links}<p><a href="{esc(record["url"])}">Open original tool (online)</a> · <a href="description.source.html" download>Sanitized original description source</a></p><p>{" · ".join(evidence)}</p><p><a href="../../reconciliation/index.html">Current implementation and reconciliation</a> · <a href="../comparison.html">Earlier baseline comparison</a> · <a href="../resources.html">Original front-end resource inventory</a></p>'
    (folder/'index.html').write_text(page(record['title'],body,True))
    cards.append(f'<section class="question"><div class="eyebrow">Original resources saved · online engine</div><h2><a href="{slug}/index.html">{esc(record["title"])}</a></h2><p>{esc(record["features"])}</p><p class="muted">{esc(note)}</p></section>')
(ROOT/'inventory.json').write_text(json.dumps(inventory,indent=2)+'\n')

price_rows=[]; details=[]
for case in comparison['pricing_cases']:
    for row in case['rows'][:2]:price_rows.append(f'<tr><td>{esc(case["name"])}</td><td>{row["side"]}</td><td>{row["original"]:.4f}</td><td>{row["local"]:.6f}</td><td>{row["difference"]:+.6f}</td><td>{"Unsupported American exercise" if not case["comparable"] else "Residual difference"}</td></tr>')
    rows=''.join(f'<tr><td>{r["metric"]}</td><td>{r["side"]}</td><td>{r["original"]:.4f}</td><td>{r["local"]:.6f}</td><td>{r["difference"]:+.6f}</td></tr>' for r in case['rows'])
    details.append(f'<details><summary>{esc(case["name"])}</summary><p>{esc(case["mapping_note"])}</p><pre>{esc(json.dumps(case["parameters"],indent=2))}</pre><table><thead><tr><th>Metric</th><th>Side</th><th>Original</th><th>Local</th><th>Local − original</th></tr></thead><tbody>{rows}</tbody></table></details>')
iv=comparison['implied_volatility']
iv_rows=''.join(f'<tr><td>{side.title()}</td><td>{iv["originalPercent"][side]:.2f}%</td><td>{iv["localPercent"][side]:.6f}%</td></tr>' for side in ('call','put'))
matrix=[('European price & Greeks','Independent BSM with continuous yield; Alpha added','Three live cases compared; prices are close in index cases but not identical at original display precision.'),('American pricing & discrete cash dividends','Not implemented','Original American put 6.5280 vs original European put 6.3712 for the saved stock sample.'),('Inverse implied volatility','Independent bisection of local BSM','Original inversion and local inversion differ; see table.'),('Position P&L simulator','Seven selected expiry payoff strategies only','No arbitrary multileg editor, before-expiry scenario surface or original valuation engine.'),('Probability calculator','Not implemented','Original terminal/touching outputs and one consistency check preserved.'),('Market monitors / historical IVX','Not implemented','Original descriptions, guides and available UI snapshots preserved; remote market feeds are not copied.'),('Parity / futures margin','Independent local educational arithmetic','These two tools are course supplements, not OIC-original calculators.')]
feature_rows=''.join(f'<tr><td>{esc(a)}</td><td>{esc(b)}</td><td>{esc(c)}</td></tr>' for a,b,c in matrix)
body=f'''<div class="eyebrow">Authenticated original observations · 5 October 2026</div><h1>Verification & differences</h1><p class="notice">Historical baseline: this comparison describes the earlier four-panel lab. The current independent implementation adds American pricing, cash dividends, probabilities, editable positions and imported market/HV analysis. <a href="../reconciliation/index.html">Open current implementation and reconciliation</a>. Full original equivalence remains unproven. Saved resources do not supply the remote valuation engines.</p><p>Four online pricing observations, including one American case, and one inverse-IV sample were preserved. Three European cases were compared numerically. Local time includes fractional days divided by 365; the vendor's exact time convention is unknown. Stock zero-cash-dividend inputs were compared with local q=0, which does not prove identical server handling.</p><h2>Observed price differences</h2><table><thead><tr><th>Case</th><th>Side</th><th>Original</th><th>Local</th><th>Local − original</th><th>Assessment</th></tr></thead><tbody>{''.join(price_rows)}</tbody></table><p>Greek values, full parameters and differences:</p>{''.join(details)}<h2>Inverse implied volatility</h2><p>Original European stock sample, target option price 13.7343; the UI returns separate call and put implied volatilities.</p><table><thead><tr><th>Side</th><th>Original</th><th>Local BSM</th></tr></thead><tbody>{iv_rows}</tbody></table><h2>Probability sample</h2><p>S=100, rate=3%, dividend yield=2%, volatility=20%, 180 days 12 hours 15 minutes; targets 90 and 110. Original terminal probabilities: 23%, 52%, 25% (sum 100%). Touching P1=45.38%, P2=49.80%, Both=6.97%, Either=53.77%, Neither=46.23%. Bounds and Either+Neither pass. The ordinary union identity gives 88.21%, which differs from the displayed Either value. The cause or vendor interpretation is unresolved; these values are not used as a golden reference for a local probability clone.</p><p>Standard-deviation prices are ordered: 65.55, 75.45, 86.85, 115.06, 132.44, 152.44. <a href="probability-calculator/online-case.json">Saved original observation</a>.</p><h2>Feature coverage</h2><table><thead><tr><th>Original feature</th><th>Local support</th><th>Result</th></tr></thead><tbody>{feature_rows}</tbody></table><p>The independent mathematical implementation passed 188 model, unit, boundary and arithmetic checks, including Alpha. These checks validate its stated model and do not establish vendor equivalence. <a href="../validation-report.json">Local mathematical checks</a>.</p><p><a href="comparison.json">Machine-readable comparison</a> · <a href="online-reference-cases.json">Raw original pricing observations</a> · <a href="options-calculator/implied-volatility-online.txt">Original IV output</a> · <a href="source-review.json">Server dependency source evidence</a></p><figure><img src="online-calculator-preview.jpg" alt="Original online Options Calculator showing the fictional European stock test case" width="100%"><figcaption>Original online interface, with fictional test inputs; preserved as a screenshot.</figcaption></figure>'''
(ROOT/'comparison.html').write_text(page('Verification & differences',body))

assets=[]
for folder in ('ivol-app','pnl-app'):
    for p in sorted((ROOT/folder).rglob('*')):
        if p.is_file():assets.append({'file':str(p.relative_to(ROOT)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'kind':'original_observed_frontend_resource'})
(ROOT/'resource-manifest.json').write_text(json.dumps(assets,indent=2)+'\n')
rows=''.join(f'<tr><td><a href="{esc(x["file"])}" download>{esc(x["file"])}</a></td><td>{x["bytes"]:,}</td></tr>' for x in assets)
(ROOT/'resources.html').write_text(page('Original front-end resources',f'<h1>Original front-end resources</h1><p class="notice">Source files for inspection, not a complete working original application. No login tokens or credentials are included.</p><p>These are the publicly accessible files observed while using the original application. The saved application index is plain text. The archive pages never load the vendor scripts, fonts or remote endpoints. Exact pricing, probability engines, market feeds, account state and unobserved lazy resources are not supplied.</p><p><a href="resource-manifest.json">File hashes and sizes</a> · <a href="script-assets.json">Public script source URLs</a> · <a href="source-review.json">Options/probability server evidence</a> · <a href="pnl-source-review.json">P&amp;L server evidence</a> · <a href="pnl-script-assets.json">P&amp;L public script URLs</a></p><table><thead><tr><th>File</th><th>Bytes</th></tr></thead><tbody>{rows}</tbody></table>'))
(ROOT/'index.html').write_text(page('OIC original tools archive',f'<div class="eyebrow">OIC / iVolatility · authenticated review</div><h1>Original tools archive.</h1><p><a href="../tools/index.html">Open working independent offline tools</a> · <a href="../reconciliation/index.html">Current implementation and reconciliation</a>. All seven tools listed in the OIC directory were inventoried. Five original PDF guides, sanitized descriptions, available UI observations and observed front-end files are preserved locally.</p><p class="notice">The original tools depend on remote calculation or market-data services. This archive can be read offline; it does not make those seven original applications operational offline.</p><div class="toolbar"><a href="comparison.html">Verification & differences →</a><a href="resources.html">Original source files</a><a href="../tools/index.html">Independent offline lab</a></div>{"".join(cards)}<p><a href="inventory.json">Tool inventory</a> · <a href="https://www.optionseducation.org/options-quotes-calculators">Original directory (online)</a></p>'))
print(f'Built original archive: {len(inventory)} tool pages, {len(list((ROOT/"guides").glob("*.pdf")))} guides, {len(assets)} original front-end files.')
