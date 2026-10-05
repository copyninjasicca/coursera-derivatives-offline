// Reproducible comparison of saved online UI observations; no network or credentials.
const fs=require('fs');
const base='./downloads/derivatives-options-futures/';
const M=require(base+'tools/option-math.js');
const refs=JSON.parse(fs.readFileSync(base+'oic-original/online-reference-cases.json'));
const pairs={ 'Option Value':['call','put'], Delta:['deltaCall','deltaPut'], Gamma:['gamma','gamma'], Theta:['thetaCall','thetaPut'], Alpha:['alphaCall','alphaPut'], Vega:['vega','vega'], Rho:['rhoCall','rhoPut']};
const cases=refs.map(ref=>{
  const i=Object.fromEntries(ref.inputs.filter(x=>x.label).map(x=>[x.label,x.value]));
  const days=+i['Days to expiration']+(+i['Hours to expiration'])/24+(+i['Minutes to expiration'])/1440;
  const style=ref.inputs.find(x=>['European','American'].includes(x.value)).value;
  const p={spot:+i['Last Price'],strike:+i.Strike,days,years:days/365,rate:+i['Interest Rate']/100,volatility:+i['IV (Implied Volatility)']/100,yield:+(i['Dividend Yield']||0)/100};
  const local=M.option(p.spot,p.strike,p.years,p.rate,p.volatility,p.yield);
  const text=ref.text||ref.dom.replace(/^.*generic: /gm,'').replace(/"/g,'');
  const rows=[];
  for(const [label,keys] of Object.entries(pairs)){
    const match=text.match(new RegExp('(?:^|\n)'+label+'\n(-?[0-9.]+)\n(-?[0-9.]+)'));
    if(!match)throw Error('Missing output '+label+' in '+ref.name);
    keys.forEach((key,n)=>{const online=+match[n+1],value=local[key];rows.push({metric:label,side:n===0?'Call':'Put',original:online,local:value,difference:value-online,matches_original_display_precision:Math.abs(value-online)<=0.00005});});
  }
  return {name:ref.name,style,parameters:p,comparable:style==='European',mapping_note:i['Dividend Yield']?'Continuous yield input shown in original UI.':'Original stock UI uses regular cash dividends; zero amount was shown. Local q=0 is a comparison assumption, not proof of identical server dividend handling.',rows};
});
const iv={parameters:cases[0].parameters,optionPrice:13.7343,originalPercent:{call:50.28,put:90.19}};
iv.localPercent={call:100*M.implied('call',iv.optionPrice,100,95,.25,.10,0),put:100*M.implied('put',iv.optionPrice,100,95,.25,.10,0)};
const probability=JSON.parse(fs.readFileSync(base+'oic-original/probability-calculator/online-case.json'));
const checks={terminal_sum_percent:23+52+25,touching_bounds_pass:[45.38,49.8,6.97,53.77,46.23].every(x=>x>=0&&x<=100),either_plus_neither_percent:53.77+46.23,union_from_displayed_marginals_percent:45.38+49.8-6.97,displayed_either_percent:53.77,union_identity_matches_display_rounding:false,standard_deviation_prices_increasing:true};
const result={phase:'Historical baseline before advanced extensions; current report is reconciliation/results.json',checked_on:'2026-10-05',authenticated_original_observed:true,full_equivalence:false,conclusion:'Independent offline tools are not identical to OIC originals. Three European price/Greek cases show residual differences; American exercise and server-dependent tools are not reproduced.',local_time_basis:'365 calendar days per year; fractional days included',original_time_basis:'Not established by the official guide or observed inputs',pricing_cases:cases,implied_volatility:iv,probability_observation:probability,probability_consistency_checks:checks,position_simulator_observation:{type:'hypothetical stock leg',quantity:100,entryPrice:100,displayedStrategyCost:10000,displayedDeltaPercent:100,full_option_valuation_verified:false},limitations:['Four online pricing cases and one IV inversion observation; not exhaustive domain validation.','Original values rounded by UI; precision comparison uses half of its 0.0001 display increment.','No server engine code or exact vendor day-count/cash-dividend convention was obtained.','Touching outputs do not satisfy the ordinary union identity in the saved observation; exact server semantics or cause is unresolved. No local probability clone is asserted.','Position simulator loaded and a stock-leg arithmetic observation was saved; option valuation was not compared. Market data is not an offline feed.']};
fs.writeFileSync(base+'oic-original/comparison.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({pricing_cases:cases.length,full_equivalence:false,iv_local:iv.localPercent,probability_checks:checks},null,2));
