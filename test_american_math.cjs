/* Run: node test_american_math.cjs. Regenerates the numerical validation report. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const A = require('./downloads/derivatives-options-futures/tools/american-math.js');
const B = require('./downloads/derivatives-options-futures/tools/option-math.js');
const report = { status: 'passed', generatedAt: new Date().toISOString(), model: 'Independent CRR / explicit escrowed cash-dividend approximation', originalEngineReproduced: false, checks: 0, references: [], convergence: [], groups: [] };
function check(condition, message) { report.checks++; assert.ok(condition, message); }
function near(actual, expected, tolerance, message) { check(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}, tolerance ${tolerance}`); }
function throws(fn, pattern) { report.checks++; assert.throws(fn, pattern); }
const source = 'https://github.com/lballabio/QuantLib/blob/master/test-suite/americanoption.cpp';
const cases = [
  { name: 'Andersen-Lake-Offengenden premium r=5%', type: 'put', args: { S:100, K:100, T:1, sigma:.25, r:.05, q:.05 }, premium: true, expected: .1069526779971959, tolerance: .001, source, sourceTest: 'testAndersenLakeHighPrecisionExample' },
  { name: 'Andersen-Lake-Offengenden premium r=7.5%', type: 'put', args: { S:100, K:100, T:1, sigma:.25, r:.075, q:.05 }, premium: true, expected: .3671111267813689, tolerance: .001, source, sourceTest: 'testAndersenLakeHighPrecisionExample' },
  { name: 'No-dividend American call', type: 'call', args: { S:100, K:100, T:1, sigma:.25, r:.05, q:0 }, expected: 12.3359989303687243, tolerance: .001, source, sourceTest: 'testQdAmericanEngines edge case' },
  { name: 'Zero-volatility call', type: 'call', args: { S:100, K:50, T:1, sigma:0, r:.05, q:.01 }, expected: 51.4435121498811085, tolerance: 1e-10, source, sourceTest: 'testQdAmericanEngines edge case' },
  { name: 'Deterministic interior optimal exercise', type: 'put', args: { S:100, K:120, T:40, sigma:0, r:.01, q:.50 }, expected: 108.980904561184602, tolerance: 1e-10, source, sourceTest: 'testQdAmericanEngines edge case' },
  { name: 'Hull cash-dividend European reference', type: 'call', args: { S:40, K:40, T:.5, sigma:.3, r:.09, q:0, exercise:'european', dividends:[{timeYears:1/6,amount:.5},{timeYears:5/12,amount:.5}] }, expected:3.67, tolerance:.01, source:'https://github.com/lballabio/QuantLib/blob/master/test-suite/dividendoption.cpp', sourceTest:'testEuropeanKnownValue; Actual360 source inputs converted to fractional years' }
];
for (const c of cases) {
  const args = { ...c.args, steps:4000 };
  const modelPrice = A.price(c.type, args);
  const actual = c.premium ? modelPrice - B.option(args.S,args.K,args.T,args.r,args.sigma,args.q)[c.type] : modelPrice;
  near(actual, c.expected, c.tolerance, c.name);
  report.references.push({ ...c, args, actual, modelPrice, error:actual-c.expected });
}
report.groups.push('Primary-source reference values (external cached research values; no original OIC engine comparison)');
const base = { S:100, K:100, T:1, r:.05, q:0, sigma:.2, steps:1000 };
for (const args of [base,{...base,S:80,K:90,T:.5},{...base,S:120,K:110,T:2,r:.02}]) {
  const rows = A.convergence(args, [100,400,1000]);
  const european = B.option(args.S,args.K,args.T,args.r,args.sigma,args.q);
  const errors = rows.map(row => Math.abs(row.call-european.call));
  near(rows.at(-1).call, european.call, .004, 'No-dividend call approaches BSM');
  check(errors.at(-1)<errors[0], 'Refinement reduces the selected BSM error');
  for(const row of rows) near(row.call,A.price('call',{...args,steps:row.steps,exercise:'european'}),1e-10,'No early-exercise premium for no-dividend call with nonnegative r');
  report.convergence.push({args,rows,europeanCall:european.call,errors});
}
const cashArgs = {...base,dividends:[{timeYears:.3,amount:2},{timeYears:.6,amount:2}]};
for(const args of [{...base,q:.05},cashArgs]) {
  const rows=A.convergence(args,[100,400,1000,4000]);
  check(Math.abs(rows[2].call-rows[3].call)<.025,'American call convergence difference');
  check(Math.abs(rows[2].put-rows[3].put)<.025,'American put convergence difference');
  report.convergence.push({args,rows});
}
report.groups.push('Convergence at 100/400/1000 steps, with 4000-step yield/cash checks');
const american=A.option(base), european=B.option(base.S,base.K,base.T,base.r,base.sigma,base.q);
near(american.deltaCall,european.deltaCall,.0001,'Lattice delta vs analytic delta');
near(american.gammaCall,european.gamma,.00005,'Lattice gamma vs analytic gamma');
near(american.thetaCall,european.thetaCall,.00002,'Theta per calendar day vs analytic theta');
near(american.vegaCall,european.vega,.0002,'Vega per 1pp vs analytic vega');
near(american.rhoCall,european.rhoCall,.0001,'Rho per 1pp vs analytic rho');
check(american.put>european.put,'American put carries early exercise premium');
check(american.gammaPut>0&&american.vegaPut>0&&american.rhoPut<0,'American put Greek signs');
near(american.alphaCall,american.gammaCall/american.thetaCall,1e-12,'Alpha gamma/theta ratio');
const parity = A.option({...base,q:.03,exercise:'european'});
near(parity.call-parity.put,base.S*Math.exp(-.03)-base.K*Math.exp(-base.r),1e-9,'Exact tree put-call parity');
report.groups.push('Greek accuracy and theta/day, vega/rho/1pp units; European tree parity');
for(const type of ['call','put']) {
  for(const args of [base,{...base,q:.08},cashArgs]) {
    const target=A.price(type,args),sigma=A.implied(type,target,args);
    near(sigma,args.sigma,2e-7,`IV round trip ${type}`);
    near(A.price(type,{...args,sigma}),target,2e-8,'IV repricing residual');
  }
}
near(A.price('put',{...base,S:10}),90,1e-10,'Deep ITM put immediate exercise');
const exercise=A.option({...base,S:10});
near(exercise.deltaPut,-1,1e-12,'Immediate exercise delta');
for(const name of ['gammaPut','thetaPut','vegaPut','rhoPut']) near(exercise[name],0,1e-12,`Immediate exercise ${name}`);
throws(()=>A.implied('put',90,{...base,S:10}),/uniquely/);
throws(()=>A.implied('put',-1,base),/nonnegative/);
throws(()=>A.implied('call',1000,base),/supported range/);
throws(()=>A.implied('put',0,{...base,S:10}),/below/);
report.groups.push('IV round trips, unsupported prices and non-unique exercise-price IV');
for(const type of ['call','put']) {
  const low=A.price(type,{...base,sigma:.1}),high=A.price(type,{...base,sigma:.4});
  check(high>=low,'Price increases with volatility in selected cases');
  const up=A.price(type,{...base,S:110}),down=A.price(type,{...base,S:90});
  check(type==='call'?up>=down:up<=down,'Spot monotonicity');
  check(A.price(type,cashArgs)>=A.price(type,{...cashArgs,exercise:'european'}),'American dominates European on same dividend model');
}
check(A.price('call',cashArgs)<A.price('call',base),'Cash dividends reduce call in selected case');
check(A.price('put',cashArgs)>A.price('put',base),'Cash dividends increase put in selected case');
const earlyCash={...base,S:120,K:100,r:0,sigma:0,dividends:[{timeYears:.5,amount:10}]};
near(A.price('call',earlyCash),20,1e-12,'Exercise before dividend');
near(A.price('call',{...earlyCash,exercise:'european'}),10,1e-12,'European cash payoff');
const lowVol=A.option({...base,sigma:.00001});
check(lowVol.meta.models.some(m=>m.includes('fallback')),'Low-volatility model is disclosed');
near(lowVol.call,100-100*Math.exp(-.05),1e-8,'Low-volatility fallback limit');
near(A.price('call',{...base,sigma:1e-16}),100-100*Math.exp(-.05),1e-10,'Numerically deterministic boundary');
const expired=A.option({...base,T:0,S:110});
near(expired.call,10,0,'Expiry intrinsic call');
near(expired.put,0,0,'Expiry intrinsic put');
check(expired.deltaCall===null&&expired.thetaPut===null,'Expiry Greeks unavailable');
const offGrid=A.option({...base,dividends:[{timeYears:.300123,amount:2}]});
near(offGrid.meta.prepaidSpot,100-2*Math.exp(-.05*.300123),1e-10,'Off-grid cash present value retained');
near(A.price('call',{...base,dividends:[{days:109.5,amount:2}]}),A.price('call',{...base,dividends:[{timeYears:.3,amount:2}]}),1e-12,'Dividend day/year units');
near(A.price('call',{...base,dividends:[{timeYears:1,amount:2},{timeYears:2,amount:2}]}),A.price('call',base),0,'At/after-expiry cash excluded');
report.groups.push('Monotonicity, exercise around dividends, expiry, deterministic and low-volatility boundaries');
throws(()=>A.price('call',{...base,S:0}),/Spot/);
throws(()=>A.price('call',{...base,sigma:-.1}),/Volatility/);
throws(()=>A.price('call',{...base,steps:1}),/Steps/);
throws(()=>A.price('call',{...base,steps:1.5}),/Steps/);
throws(()=>A.price('call',{...base,dividends:[{timeYears:.2,days:2,amount:1}]}),/exactly one/);
throws(()=>A.price('call',{...base,dividends:[{timeYears:0,amount:1}]}),/positive/);
throws(()=>A.price('call',{...base,dividends:[{timeYears:.2,amount:200}]}),/smaller than spot/);
throws(()=>A.price('straddle',base),/call or put/);
throws(()=>A.price('call',{...base,sigma:100,T:100}),/floating-point/);
near(A.price('call',100,100,1,.05,.2,0,{steps:1000}),A.price('call',base),0,'Positional and object APIs agree');
near(A.option(100,100,1,.05,.2,0,{steps:1000}).put,american.put,0,'Positional option overload');
near(A.implied('call',american.call,100,100,1,.05,0,{steps:1000}),.2,2e-7,'Positional IV overload');
check(global.AmericanMath===A,'Global and CommonJS exports');
const browser = {};
vm.createContext(browser);
vm.runInContext(fs.readFileSync(path.join(__dirname,'downloads/derivatives-options-futures/tools/american-math.js'),'utf8'),browser);
near(browser.AmericanMath.price('put',base),american.put,0,'Browser script without CommonJS agrees');
const negativeRate={...base,r:-.03};
near(A.price('put',negativeRate),A.price('put',{...negativeRate,exercise:'european'}),1e-10,'No-dividend American put with negative rate has no exercise premium');
check(A.price('call',negativeRate)>=A.price('call',{...negativeRate,exercise:'european'}),'Negative-rate American call dominates European');
report.groups.push('Input validation and API overloads');
report.limitations=['No original OIC-engine numerical agreement claim.','Cash prices converge within the escrowed approximation, not to an exact fixed-cash-dividend jump-diffusion price.','Grid rounding retains cash present value but approximates exercise timing.','Lattice Greeks can oscillate near exercise boundaries; compare step counts.','Near-zero volatility and expiry return null Greeks; immediate exercise may make IV non-unique.'];
const out=path.join(__dirname,'downloads/derivatives-options-futures/oic-original/american-validation.json');
fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log(`AmericanMath: ${report.checks} checks passed across ${report.groups.length} groups; wrote ${out}`);
