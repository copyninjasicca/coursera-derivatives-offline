// Compare independently implemented models with preserved authenticated UI observations.
// Offline, no credentials or remote requests; retain display-precision failures.
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'downloads/derivatives-options-futures'),out=path.join(root,'reconciliation');
const M=require(path.join(root,'tools/option-math.js')),A=require(path.join(root,'tools/american-math.js')),P=require(path.join(root,'tools/probability-math.js')),F=require(path.join(root,'tools/portfolio-math.js'));
const baseline=JSON.parse(fs.readFileSync(path.join(root,'oic-original/comparison.json')));
const pairs={'Option Value':['call','put'],Delta:['deltaCall','deltaPut'],Gamma:['gammaCall','gammaPut'],Theta:['thetaCall','thetaPut'],Alpha:['alphaCall','alphaPut'],Vega:['vegaCall','vegaPut'],Rho:['rhoCall','rhoPut']};
const row=(metric,original,local,tolerance,unit)=>({metric,original,local,difference:Number.isFinite(local)?local-original:null,tolerance,unit,matches_display_precision:Number.isFinite(local)?Math.abs(local-original)<=tolerance:null});
const fresh=JSON.parse(fs.readFileSync(path.join(out,'fresh-original-cases.json')));
const freshCases=fresh.map(ref=>{const i=Object.fromEntries(ref.inputs.map(x=>[x.label,x.value])),days=+i['Days to expiration']+(+i['Hours to expiration'])/24+(+i['Minutes to expiration'])/1440;const rows=[];for(const metric of Object.keys(pairs)){const match=ref.text.match(new RegExp('(?:^|\\n)'+metric+'\\n(-?[0-9.]+)\\n(-?[0-9.]+)'));if(!match)throw Error('Fresh output missing '+metric);['Call','Put'].forEach((side,j)=>rows.push({metric,side,original:+match[j+1]}))}return {name:ref.name,style:ref.style||(ref.dom.includes('textbox: American')?'American':'European'),parameters:{spot:+i['Last Price'],strike:+i.Strike,days,years:days/365,rate:+i['Interest Rate']/100,volatility:+i['IV (Implied Volatility)']/100,yield:+i['Dividend Yield']/100},rows,mapping_note:'Fresh authenticated SPX index case. Inputs were entered through the original UI and outputs captured after calculation.'}});
const pricing=[...baseline.pricing_cases,...freshCases].map(c=>{
 const p=c.parameters,args={S:p.spot,K:p.strike,T:p.years,r:p.rate,sigma:p.volatility,q:p.yield};
 const variants=(c.style==='American'?[100,400,1000]:[null]).map(steps=>{
  const o=steps?A.option({...args,steps}):M.option(args.S,args.K,args.T,args.r,args.sigma,args.q);
  return {model:steps?'American CRR':'European BSM',steps,rows:c.rows.map(x=>{
   const key=pairs[x.metric][x.side==='Call'?0:1];let local=o[key];if(local===undefined)local=o[key.replace(/Call|Put/,'')];
   return {...row(x.metric,x.original,local,.00005,'per share; daily theta; vega/rho per percentage point'),side:x.side};
  })};
 });return {name:c.name,style:c.style,parameters:p,mapping_note:c.mapping_note,variants};
});
const input={spot:100,price1:90,price2:110,days:180,hours:12,minutes:15,rate:.03,dividendYield:.02,volatility:.2};
const originals={below:23,between:52,above:25,price1:45.38,price2:49.80,both:6.97,either:53.77,neither:46.23};
const intervals=[65.55,75.45,86.85,115.06,132.44,152.44];
const probability=['risk-neutral','zero-log'].map(driftConvention=>{
 const o=P.calculate({...input,driftConvention});const rows=[];
 for(const k of ['below','between','above'])rows.push(row('Terminal '+k,originals[k],100*o.terminal[k],.5,'percentage points'));
 for(const k of ['price1','price2','both','either','neither'])rows.push(row('Touch '+k,originals[k],100*o.touching[k],.005,'percentage points'));
 const lower=o.intervals.levels.slice().sort((a,b)=>b.standardDeviations-a.standardDeviations).map(x=>x.lower),upper=o.intervals.levels.slice().sort((a,b)=>a.standardDeviations-b.standardDeviations).map(x=>x.upper);
 [...lower,...upper].forEach((v,i)=>rows.push(row('Deviation '+[-3,-2,-1,1,2,3][i],intervals[i],v,.005,'price units')));
 return {driftConvention,model:o.model,rows,localUnionResidual:o.touching.price1+o.touching.price2-o.touching.both-o.touching.either,terminalSum:o.terminal.below+o.terminal.between+o.terminal.above};
});
const p=baseline.implied_volatility;
const iv=['call','put'].map(type=>row(type+' IV',p.originalPercent[type],100*M.implied(type,p.optionPrice,100,95,.25,.1,0),.005,'volatility percentage points'));
const stock=F.value([{kind:'stock',quantity:100,multiplier:1,entryPrice:100}],{spot:100,rate:.03,volatility:.2,dividendYield:0});
const result={checkedOn:'2026-10-05',fullOriginalEquivalence:false,originalEvidence:'Preserved authenticated original UI observations from this session. Fresh pricing service eventually loaded, and additional nominal one-year, fractional-day and boundary observations were preserved.',precisionPolicy:'Half of the original display increment, unchanged across models. Different units are not aggregated.',pricing,impliedVolatility:iv,probability:{inputs:input,variants:probability,originalUnion:{marginalUnionPercent:45.38+49.80-6.97,displayedEitherPercent:53.77,consistent:false,cause:'Unresolved vendor interpretation or capture/service behavior; not corrected by fitting.'},interpretation:'Zero log drift matches the three terminal percentages and two individual touch percentages in one saved sample. This is an optional hypothesis, not an established vendor convention. Joint events and deviation intervals remain different.'},position:{cost:row('100 shares × entry price 100',10000,stock.cost,0,'currency units'),originalDisplayedDeltaPercent:100,deltaComparison:'Original percentage label does not establish agreement with a local position delta of 100 spot-unit sensitivity.',fullOriginalOptionValuationVerified:false},unverified:['Original cash-dividend numerical examples and exact American tree/Greek convention','Additional original probability samples and joint-event semantics','Original option-leg P&L scenario values and Greeks','Original live feeds, market rankings and proprietary IVX'],modelValidation:{bsm:'../validation-report.json',american:'../oic-original/american-validation.json',probability:'../oic-original/probability-validation.json',portfolio:'../oic-original/portfolio-validation.json'}};
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({pricingCases:pricing.length,americanStepVariants:pricing.filter(c=>c.style==='American').length*3,probabilityVariants:2,fullOriginalEquivalence:false}));
