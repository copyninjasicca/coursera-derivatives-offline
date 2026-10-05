"""Build the English advanced lab markup from its maintained local templates.
Models and UI scripts remain independent source files; course pages/progress are untouched.
"""
from pathlib import Path
ROOT=Path(__file__).parent
TOOLS=ROOT/'downloads/derivatives-options-futures/tools'
for name in ('option-math.js','american-math.js','probability-math.js','portfolio-math.js','tools-ui.js','market-example.js','advanced-tools-ui.js'):
    assert (TOOLS/name).is_file(),f'Missing lab source: {name}'
for template,target in [('advanced-tools.html','index.html'),('advanced-tools.css','advanced.css')]:
    (TOOLS/target).write_text((ROOT/'templates'/template).read_text())
print('Built seven-panel advanced lab; model and UI sources preserved.')
