'use strict';
const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict'), path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../downloads/derivatives-options-futures/tools/advanced-tools-ui.js'),'utf8');
const PortfolioMath=require('../downloads/derivatives-options-futures/tools/portfolio-math.js');
const controls={};
for(const [id,value] of Object.entries({'port-spot':100,'port-rate':3,'port-yield':0,'port-elapsed':0,'port-volshift':0,'port-volmode':'relative','port-steps':100,'port-cash':''}))controls[id]={value:String(value)};
for(const id of ['portfolio-import','portfolio-export','portfolio-error'])controls[id]={value:'',textContent:'',handlers:{},addEventListener(type,fn){this.handlers[type]=fn}};
const context={PortfolioMath,el:id=>controls[id],n:id=>Number(controls[id].value),legs:[],portfolioBaselineMarket:null,capturedExport:null,renderLegs(){},portfolio(){context.lastScenario=PortfolioMath.scenario(context.legs,context.market(),context.changes(),{steps:Number(controls['port-steps'].value)})},download(name,data){context.capturedExport=JSON.parse(JSON.stringify(data))},readLegs(){return context.legs},valuationLegs(){return context.legs}};
vm.createContext(context);
const helperNames=['legInputs','market','changes'];
for(const name of helperNames){const start=source.indexOf('  function '+name+'('),end=source.indexOf('\n',start);vm.runInContext(source.slice(start,end),context)}
const start=source.indexOf("  el('portfolio-export').addEventListener"),end=source.indexOf('  function analyze()',start);
vm.runInContext(source.slice(start,end),context);
const fixtures=path.join(__dirname,'tools-fixtures'),report={checkedAt:new Date().toISOString(),method:'Execute actual extracted event-handler source with real PortfolioMath and inert UI controls; browser verification remains separate',checks:[]};
function check(label,test){test();report.checks.push({label,passed:true})}
function state(){return JSON.stringify({controls:Object.fromEntries(Object.entries(controls).filter(([id])=>id!=='portfolio-error'&&id!=='portfolio-import').map(([id,o])=>[id,o.value])),legs:context.legs,baseline:context.portfolioBaselineMarket,lastScenario:context.lastScenario})}
async function load(name){const raw=fs.readFileSync(path.join(fixtures,name),'utf8');controls['portfolio-import'].files=[{size:Buffer.byteLength(raw),text:async()=>raw}];await controls['portfolio-import'].handlers.change({target:controls['portfolio-import']})}
(async()=>{
await load('distinct-spot-400.json');
const valid=JSON.parse(fs.readFileSync(path.join(fixtures,'distinct-spot-400.json'),'utf8'));
check('Distinct scenario spot restored, baseline spot retained, and 400 tree steps restored',()=>{assert.equal(Number(controls['port-spot'].value),110);assert.equal(context.market().spot,100);assert.equal(Number(controls['port-steps'].value),400)});
check('Imported actual valuation agrees with original input model parameters',()=>{const expected=PortfolioMath.scenario(valid.legs,valid.market,valid.scenario,valid.modelOptions);assert.equal(context.lastScenario.pnl,expected.pnl);assert.equal(context.lastScenario.baselineValue,expected.baselineValue)});
controls['portfolio-export'].handlers.click();const exported=context.capturedExport;
check('Export retains baseline 100, scenario 110, selected tree steps 400',()=>{assert.equal(exported.market.spot,100);assert.equal(exported.scenario.spot,110);assert.equal(exported.modelOptions.steps,400)});
const before=state();
for(const name of ['bad-model','bad-spot','bad-elapsed','bad-mode','bad-shift','bad-quantity','bad-market']){await load(name+'.json');check(name+' rejected without partial editor mutation',()=>{assert.ok(controls['portfolio-error'].textContent);assert.equal(state(),before);assert.equal(controls['portfolio-import'].value,'')})}
await load('legacy-v1.json');
check('Old v1 without modelOptions retains current steps and its scenario spot',()=>{assert.equal(Number(controls['port-steps'].value),400);assert.equal(Number(controls['port-spot'].value),105);assert.equal(context.market().spot,100);assert.equal(context.lastScenario.pnl,PortfolioMath.scenario(JSON.parse(fs.readFileSync(path.join(fixtures,'legacy-v1.json'))).legs,valid.market,{spot:105,elapsedDays:0,volatilityShift:0,volatilityMode:'relative'},{steps:400}).pnl)});
fs.writeFileSync(path.join(__dirname,'tools-position-import-validation.json'),JSON.stringify({...report,passed:true,testCount:report.checks.length,exported},null,2)+'\n');console.log(JSON.stringify({passed:true,checks:report.checks.length,scenarioPnl:context.lastScenario.pnl}));
})().catch(e=>{console.error(e);process.exit(1)});
