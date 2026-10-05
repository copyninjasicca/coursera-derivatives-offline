'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const P=require('./downloads/derivatives-options-futures/tools/portfolio-math.js');
const B=require('./downloads/derivatives-options-futures/tools/option-math.js');
const checks=[];
function test(name,fn){fn();checks.push({name,status:'pass'});}
function near(actual,expected,tolerance=1e-10){assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);}
const market={spot:110,volatility:.2,rate:.03,dividendYield:0};
const stock={kind:'stock',quantity:100,entryPrice:95};
const shortCall={kind:'option',type:'call',style:'european',quantity:-1,strike:100,entryPrice:5,daysToExpiry:30};
test('Signed stock/covered-call expiry cost, value and PnL are hand-computed',()=>{
  const r=P.atExpiry([stock,shortCall],110);near(r.cost,9000);near(r.value,10000);near(r.pnl,1000);near(r.legs[1].pnl,-500);near(r.greeks.delta,0);assert.equal(r.greeks.gamma,null);
  const under=P.atExpiry([stock,shortCall],90);near(under.pnl,0);near(under.greeks.delta,100);
});
test('Long put, short stock and nonstandard option contract multiplier',()=>{
  const r=P.atExpiry([{kind:'stock',quantity:-20,entryPrice:100},{kind:'option',type:'put',quantity:2,multiplier:50,strike:100,daysToExpiry:20,entryPrice:3}],80);
  near(r.cost,-1700);near(r.value,400);near(r.pnl,2100);near(r.greeks.delta,-120);
});
test('Pre-expiry BSM portfolio Greeks use quantity sign and multiplier',()=>{
  const b=B.option(110,100,30/365,.03,.2,0),r=P.value([stock,shortCall],market);
  near(r.cost,9000);near(r.value,11000-100*b.call);near(r.pnl,r.value-9000);
  near(r.greeks.delta,100-100*b.deltaCall);near(r.greeks.gamma,-100*b.gamma);near(r.greeks.theta,-100*b.thetaCall);near(r.greeks.vega,-100*b.vega);near(r.greeks.rho,-100*b.rhoCall);
});
test('Per-leg IV scenarios distinguish 10% relative (22%) and absolute (30%)',()=>{
  near(P.shiftVolatility(.2,.1,'relative'),.22);near(P.shiftVolatility(.2,.1,'absolute'),.3);
  const legs=[{...shortCall,volatility:.2},{...shortCall,strike:120,quantity:1,volatility:.4}];
  const r=P.scenario(legs,market,{spotShift:.1,elapsedDays:10,volatilityShift:.1,volatilityMode:'relative'});
  near(r.market.spot,121);near(r.legs[0].volatility,.22);near(r.legs[1].volatility,.44);assert.equal(r.legs[0].remainingDays,20);near(r.valueChange,r.value-r.baselineValue);
  const a=P.scenario(legs,market,{volatilityShift:.1,volatilityMode:'absolute'});near(a.legs[0].volatility,.3);near(a.legs[1].volatility,.5);
  assert.throws(()=>P.shiftVolatility(.2,-.3,'absolute'));
});
test('Different expiries and expired leg explanation use scenario intrinsic',()=>{
  const r=P.scenario([shortCall,{...shortCall,type:'put',daysToExpiry:90}],market,{elapsedDays:40});
  near(r.legs[0].price,10);assert.equal(r.legs[0].model,'intrinsic');assert.equal(r.legs[1].remainingDays,50);assert.ok(r.warnings.some(w=>w.includes('historical settlement')));
  const dated=P.value([{...shortCall,daysToExpiry:undefined,expiry:'2026-11-04'}],{...market,valuationDate:'2026-10-05'});assert.equal(dated.legs[0].remainingDays,30);
});
test('Injection works for type-specific American Greeks without hidden BSM fallback',()=>{
  const r=P.value([{...shortCall,style:'american'}],market,{pricingModel:a=>{assert.equal(a.style,'american');return {call:8,deltaCall:.6,gammaCall:.04,thetaCall:-.05,vegaCall:.1,rhoCall:.2};}});
  near(r.value,-800);near(r.greeks.gamma,-4);near(r.greeks.vega,-10);assert.equal(r.legs[0].model,'injected');
});
test('American model integration, cash dividend timing aliases and price-only parity',()=>{
  const A=require('./downloads/derivatives-options-futures/tools/american-math.js');
  const leg={...shortCall,type:'put',style:'american',daysToExpiry:90,dividends:[{days:30,amount:1}]};
  const full=P.value([leg],market,{steps:100}),fast=P.value([leg],market,{steps:100,priceOnly:true});
  near(full.value,fast.value);near(full.greeks.gamma,-100*A.option(110,100,90/365,.03,.2,0,{steps:100,dividends:[{time:30/365,amount:1}]}).gammaPut);assert.equal(fast.greeks.gamma,null);assert.equal(fast.priceOnly,true);
  near(P.value([{...leg,dividends:[{timeYears:30/365,amount:1}]}],market,{priceOnly:true}).value,fast.value);
  assert.throws(()=>P.value([{...leg,dividends:[{days:30,time:1,amount:1}]}],market),/exactly one/);
});
test('European cash-dividend price and Greeks match European-exercise escrowed lattice',()=>{
  const A=require('./downloads/derivatives-options-futures/tools/american-math.js');
  const leg={...shortCall,daysToExpiry:90,dividends:[{days:20,amount:1},{days:60,amount:2}]};
  const reference=A.option(110,100,90/365,.03,.2,0,{steps:100,exercise:'european',dividends:leg.dividends});
  const r=P.value([leg],market,{steps:100}),fast=P.value([leg],market,{steps:100,priceOnly:true});
  near(r.value,-100*reference.call);near(fast.value,r.value);near(r.greeks.delta,-100*reference.deltaCall);near(r.greeks.gamma,-100*reference.gammaCall);near(r.greeks.theta,-100*reference.thetaCall);near(r.greeks.vega,-100*reference.vegaCall);near(r.greeks.rho,-100*reference.rhoCall);assert.equal(r.legs[0].model,'CRR European (escrowed cash dividends)');
  const elapsed=P.scenario([leg],market,{elapsedDays:30});
  const shifted=A.price('call',110,100,60/365,.03,.2,0,{steps:100,exercise:'european',dividends:[{days:30,amount:2}]});near(elapsed.value,-100*shifted);
  const beyond=P.scenario([leg],market,{elapsedDays:65});near(beyond.value,-100*B.option(110,100,25/365,.03,.2,0).call);assert.equal(beyond.legs[0].model,'BSM European');
  const boundary=P.value([{...leg,dividends:[{days:90,amount:2},{days:100,amount:1}]}],market);near(boundary.value,-100*B.option(110,100,90/365,.03,.2,0).call);assert.equal(boundary.legs[0].model,'BSM European');
});
test('Scenario curve shares one baseline and returns identical prices to individual scenarios',()=>{
  let count=0;const pricingModel=a=>{count++;return {price:a.spot/10,greeks:{delta:.1,gamma:0,theta:0,vega:0,rho:0}};};
  const points=[100,110,120],curve=P.scenarios([shortCall],market,points,{priceOnly:true,pricingModel});assert.equal(count,4);assert.equal(curve.length,3);
  curve.forEach((r,i)=>near(r.value,-10*points[i]));
  const actual=P.scenarios([{...shortCall,style:'american'}],market,points,{priceOnly:true});actual.forEach((r,i)=>near(r.value,P.scenario([{...shortCall,style:'american'}],market,{spot:points[i]},{priceOnly:true}).value));
});
test('Marks value without replacing model Greeks, and expiry ignores marks',()=>{
  const r=P.value([{...shortCall,markPrice:7}],market,{useMarks:true});near(r.value,-700);assert.ok(r.warnings.length);near(r.greeks.delta,-100*B.option(110,100,30/365,.03,.2,0).deltaCall);
  near(P.atExpiry([{...shortCall,markPrice:7}],110,{useMarks:true}).value,-1000);
});
const snapshot={schemaVersion:1,source:'Synthetic validation fixture',asOf:'2026-10-05',prices:[{symbol:'TEST',date:'2026-10-03',close:'121'},{symbol:'TEST',date:'2026-10-01',close:100},{symbol:'TEST',date:'2026-10-02',close:110}],quotes:[{symbol:'TEST',type:'call',expiry:'2026-11-04',strike:100,bid:4,ask:6,iv:.2,volume:100},{symbol:'TEST',type:'put',expiry:'2026-11-04',strike:100,bid:3,ask:4,iv:.3,volume:20},{symbol:'TEST',type:'call',date:'2026-10-04',expiry:'2026-11-04',strike:100,last:3,iv:.9}]};
test('Import sorts dates, accepts safe numeric strings and uses dated quote chain',()=>{
  const r=P.importSnapshot(JSON.stringify(snapshot));assert.deepEqual(r.prices.map(p=>p.date),['2026-10-01','2026-10-02','2026-10-03']);assert.equal(r.prices[2].close,121);
  const chain=P.chain(r,{symbol:'TEST'});assert.equal(chain.length,2);near(chain.find(q=>q.type==='call').mid,5);near(chain.find(q=>q.type==='call').spreadPct,40);assert.equal(chain[0].daysToExpiry,30);
  assert.equal(P.rankQuotes(r,{sortBy:'iv'})[0].type,'put');assert.equal(P.rankQuotes(r,{sortBy:'volume'})[0].type,'call');assert.equal(P.chain(r,{date:'2026-10-04'})[0].iv,.9);
});
test('Import rejects duplicate/invalid records, crossed quotes, bad OHLC, HTML and numeric expressions',()=>{
  assert.throws(()=>P.importSnapshot({...snapshot,prices:[snapshot.prices[0],snapshot.prices[0]]}),/Duplicate/);
  assert.throws(()=>P.importSnapshot({...snapshot,quotes:[snapshot.quotes[0],snapshot.quotes[0]]}),/Duplicate/);
  for(const date of ['2026-02-30','2026-13-01','not a date'])assert.throws(()=>P.importSnapshot({...snapshot,prices:[{symbol:'TEST',date,close:100}]}));
  assert.throws(()=>P.importSnapshot({...snapshot,quotes:[{...snapshot.quotes[0],bid:10,ask:1}]}),/bid exceeds/);
  assert.throws(()=>P.importSnapshot({...snapshot,prices:[{symbol:'TEST',date:'2026-10-01',close:10,high:9,low:8}]}),/exceeds high/);
  assert.throws(()=>P.importSnapshot({...snapshot,source:'<script>alert(1)</script>'}));
  for(const close of ['1+2','Infinity','',true,null,-1])assert.throws(()=>P.importSnapshot({...snapshot,prices:[{symbol:'TEST',date:'2026-10-01',close}]}));
  assert.throws(()=>P.importSnapshot('{malformed'));assert.throws(()=>P.importSnapshot({...snapshot,schemaVersion:2}));
});
test('Historical volatility of known log returns matches sample and population formula',()=>{
  const prices=[100,100*Math.exp(.1),100*Math.exp(.1)*Math.exp(-.1)];
  const r=P.historicalVolatility(prices,{tradingDaysPerYear:252});near(r.meanLogReturn,0);near(r.variance,.02);near(r.volatility,Math.sqrt(5.04));assert.equal(r.divisor,'sample');
  const p=P.historicalVolatility(prices,{tradingDaysPerYear:252,divisor:'population'});near(p.variance,.01);near(p.volatility,Math.sqrt(2.52));
  const window=P.historicalVolatility([1,...prices],{window:2,tradingDaysPerYear:100});near(window.volatility,Math.sqrt(2));
});
test('History ordering, symbol selection, adjusted closes and insufficient window validation',()=>{
  const r=P.historicalVolatility(snapshot.prices,{window:2});near(r.volatility,0,1e-12);assert.equal(r.startDate,'2026-10-01');
  assert.throws(()=>P.historicalVolatility([100,110],{divisor:'sample'}));assert.throws(()=>P.historicalVolatility([100,110],{window:2}));assert.throws(()=>P.historicalVolatility([100,0,110]));
  assert.throws(()=>P.historicalVolatility([snapshot.prices[0],snapshot.prices[0]]),/Duplicate/);
  assert.throws(()=>P.historicalVolatility([...snapshot.prices,{symbol:'OTHER',date:'2026-10-01',close:30}]));
  const adjusted=snapshot.prices.map(r=>({...r,adjustedClose:Number(r.close)*2}));near(P.historicalVolatility(adjusted,{priceField:'adjustedClose'}).volatility,0,1e-12);
});
test('Input validation rejects unsupported legs, mixed underlying and unsafe values',()=>{
  assert.throws(()=>P.value([{...shortCall,type:'invalid'}],market));assert.throws(()=>P.value([{...stock,multiplier:100}],market));assert.throws(()=>P.value([{...shortCall,symbol:'OTHER'}],{...market,symbol:'TEST'}));assert.throws(()=>P.value([shortCall],{...market,spot:0}));
  assert.throws(()=>P.value([{...shortCall,quantity:Infinity}],market));assert.throws(()=>P.value([{...shortCall,dividends:[{time:.02,amount:-1}]}],market));
  assert.throws(()=>P.value([{...shortCall,quantity:1e308}],market));assert.throws(()=>P.value([{...stock,quantity:1e308}],market));
});
test('Browser globals expose valuation without CommonJS and extreme price ratios stay finite',()=>{
  const context={};vm.createContext(context);
  for(const file of ['option-math.js','american-math.js','portfolio-math.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'downloads/derivatives-options-futures/tools',file),'utf8'),context);
  const r=context.PortfolioMath.value([{...shortCall,style:'american'}],market);assert.ok(Number.isFinite(r.pnl)&&Number.isFinite(r.greeks.delta));
  assert.ok(Number.isFinite(P.historicalVolatility([Number.MIN_VALUE,Number.MAX_VALUE,Number.MIN_VALUE],{tradingDaysPerYear:252}).volatility));
});
const report={status:'pass',testCount:checks.length,checks,sourceBasis:['Archived OIC Profit and Loss Simulator guide: quantity scaling, contract size, relative/absolute IV scenarios, BSM/CRR style distinction','Archived OIC Historical and Implied Volatility guide: annualized historical volatility'],limitations:['Single underlying per valuation; cash flows, transaction costs and historical settlement omitted','Cash-dividend European/American legs use per-leg escrowed approximation; residual-stock diffusion varies with leg expiry, not one globally consistent dividend process','Imported quotes and imported contract IV only; no live feed or proprietary IVX','HV uses consecutive available observations, not reconstructed missing trading dates; return window and sample/population divisor explicit','Expiry gamma/theta are undefined; ATM expiry delta is undefined; aggregate affected Greeks return null']};
fs.writeFileSync(path.join(__dirname,'downloads/derivatives-options-futures/oic-original/portfolio-validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,testCount:checks.length}));
