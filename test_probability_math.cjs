'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const P=require('./downloads/derivatives-options-futures/tools/probability-math.js');
let checks=0;
function close(actual,expected,tolerance=1e-11,label='value'){
  assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<=tolerance,`${label}: ${actual} vs ${expected} (tolerance ${tolerance})`);checks++;
}
function relative(actual,expected,tol=2e-13,label='tail'){close(actual/expected,1,tol,label);}
function simpson(f,a,b,tol=1e-11){
  const m=(a+b)/2,fa=f(a),fm=f(m),fb=f(b),whole=(b-a)*(fa+4*fm+fb)/6;
  function recurse(a,b,fa,fm,fb,whole,tol,depth){
    const m=(a+b)/2,l=(a+m)/2,r=(m+b)/2,fl=f(l),fr=f(r);
    const left=(m-a)*(fa+4*fl+fm)/6,right=(b-m)*(fm+4*fr+fb)/6,delta=left+right-whole;
    if(depth===0||Math.abs(delta)<=15*tol)return left+right+delta/15;
    return recurse(a,m,fa,fl,fm,left,tol/2,depth-1)+recurse(m,b,fm,fr,fb,right,tol/2,depth-1);
  }
  return recurse(a,b,fa,fm,fb,whole,tol,25);
}
const phi=x=>Math.exp(-x*x/2)/Math.sqrt(2*Math.PI);
// Independent Gaussian integration, not the module's rational/continued-fraction CDF.
function refSf(x){if(x<0)return 1-refSf(-x);if(x>=12)return 0;return simpson(phi,x,12,2e-13);}
const refCdf=x=>refSf(-x);
function refHit(distance,h,t){
  if(t<=0)return 0;
  const s=Math.sqrt(t);
  return refCdf((h*t-distance)/s)+Math.exp(2*h*distance)*refCdf((-h*t-distance)/s);
}
// Independent first-exit flux + strong-Markov convolution: first lower then upper,
// plus first upper then lower. This does not use the module's survival integral.
function exitFlux(t,x,D,h){
  if(t<=0)return 0;
  let sum=0;
  for(let k=-50;k<=50;k++){const z=x+2*k*D;sum+=z*Math.exp(-z*z/(2*t));}
  return Math.exp(-h*x-h*h*t/2)*sum/(Math.sqrt(2*Math.PI)*Math.pow(t,1.5));
}
function refBoth(A,B,h,tol=2e-10){
  const D=B-A;
  return simpson(t=>exitFlux(t,-A,D,h)*refHit(D,h,1-t)+exitFlux(t,B,D,-h)*refHit(D,-h,1-t),0,1,tol);
}
function verifyAlgebra(result,label='joint'){
  for(const key of ['price1','price2','both','either','neither'])assert.ok(result[key]>=0&&result[key]<=1,`${label} ${key}`);
  close(result.either,result.price1+result.price2-result.both,4e-16,label+' union');
  close(result.either+result.neither,1,3e-16,label+' complement');
  assert.ok(result.both<=Math.min(result.price1,result.price2)+1e-15);
  assert.ok(result.both>=Math.max(0,result.price1+result.price2-1)-1e-15);checks+=7;
}
for(const x of [-6,-3,-1,0,.3,1,3,6])close(P.cdf(x),refCdf(x),4e-13,'CDF quadrature '+x);
for(const [x,v] of [[8,6.220960574271784e-16],[10,7.61985302416047e-24],[20,2.7536241186062337e-89]])relative(P.sf(x),v,2e-13,'normal tail '+x);
close(P.logSf(40),-804.6084420137539,2e-13,'log 40-sigma tail');
assert.ok(P.normalInterval(8,9)>0);checks++;
relative(P.normalInterval(8,9),6.219831985865830e-16,2e-13,'8-to-9 sigma interval');
close(P.years(180,12,15),180.51041666666666/365,1e-16,'ACT/365');
const quadrature=[];
for(const [A,B,h] of [[-.2,.4,0],[-.7,.8,.7],[-1.1,1.4,-.8],[-2.1,2.3,.3],[-3,2,0]]){
  const S=100,sigma=.25,T=1,r=sigma*sigma/2+h*sigma;
  const result=P.barriers(S,S*Math.exp(A*sigma),S*Math.exp(B*sigma),T,r,sigma);
  const reference=refBoth(A,B,h),fineReference=refBoth(A,B,h,2e-12);
  close(reference,fineReference,8e-10,'flux quadrature refinement');
  close(result.both,fineReference,2e-9,'joint first-exit quadrature');
  close(result.price1,refHit(-A,-h,1),2e-11,'lower reflection quadrature');
  close(result.price2,refHit(B,h,1),2e-11,'upper reflection quadrature');
  verifyAlgebra(result);
  quadrature.push({A,B,h,both:result.both,reference:fineReference,error:result.both-fineReference,method:result.numerical.method,truncationBound:result.numerical.truncationBound});
}
// Known zero-log-drift centered survival series has only alternating odd terms.
function symmetricSurvival(a){let sum=0;for(let k=0;k<100;k++){const n=2*k+1;sum+=4/Math.PI*(k%2?-1:1)/n*Math.exp(-n*n*Math.PI*Math.PI/(8*a*a));}return sum;}
for(const a of [.1,.3,.7,1.99,2,2.01,4]){
  const S=100,v=.2,result=P.barriers(S,S*Math.exp(-a*v),S*Math.exp(a*v),1,v*v/2,v);
  close(result.numerical.probability,symmetricSurvival(a),5e-13,'symmetric survival');
  close(result.price1,result.price2,4e-15,'zero-log-drift symmetry');
  close(result.price1,2*refSf(a),1e-11,'reflection principle');
  verifyAlgebra(result);
}
// Convergence and stability across the images/spectral switch and drift extremes.
const convergence=[];
for(const D of [.3,.9,2.2,3.99999,4,4.00001,7,25])for(const h of [-3,-.1,0,.1,3]){
  const v=.2,A=-.4*D,B=.6*D,r=v*v/2+h*v,L=100*Math.exp(A*v),U=100*Math.exp(B*v);
  const loose=P.barriers(100,L,U,1,r,v,0,{tolerance:1e-8});
  const tight=P.barriers(100,L,U,1,r,v,0,{tolerance:1e-14});
  close(loose.both,tight.both,1.1e-8,'series tolerance refinement');verifyAlgebra(tight);
  convergence.push({D,h,error:loose.both-tight.both,method:tight.numerical.method,terms:tight.numerical.terms});
}
for(const v of [1e-8,1e-5,.01,.2,3])for(const r of [-20,-.04,0,.07,20]){
  verifyAlgebra(P.barriers(100,90,110,2,r,v));
  const t=P.terminal(100,90,110,2,r,v);close(t.below+t.between+t.above,1,5e-15,'terminal partition');
}
// Path/event conventions, reversed targets, same-side nesting, and deterministic mass.
for(const [a,b] of [[110,120],[80,90],[100,120],[80,100],[100,100],[90,110]]){
  const x=P.touching(100,a,b,1,.04,.2),y=P.touching(100,b,a,1,.04,.2);
  verifyAlgebra(x);close(x.price1,y.price2);close(x.both,y.both);
  if((a-100)*(b-100)>=0){close(x.both,Math.min(x.price1,x.price2));close(x.either,Math.max(x.price1,x.price2));}
}
close(P.touch(100,110,0,.04,.2),0);close(P.touch(100,100,0,.04,.2),1);
close(P.touch(100,100,0,1e308,1e308,-1e308),1);
close(P.terminal(100,90,110,0,1e308,1e308,-1e308).between,1);
close(P.touch(80,90,1,.04,.2,0,'lower'),1);close(P.touch(120,110,1,.04,.2,0,'upper'),1);
verifyAlgebra(P.barriers(80,90,110,1,.04,.2));
verifyAlgebra(P.barriers(120,90,110,1,.04,.2));
close(P.barriers(100,100,100,0,0,0).both,1);
for(const r of [0,Math.log(1.1),-Math.log(1.1)]){
  const endpoint=100*Math.exp(r),x=P.terminal(100,endpoint,endpoint,1,r,0);
  close(x.between,1);close(x.below+x.above,0);
  close(P.touch(100,endpoint,1,r,0),1);
}
close(P.touch(100,110,1,Math.log(1.1),0),1);
close(P.survival(100,90,110,1,Math.log(1.1),0).probability,0);
close(P.touching(100,90,110,0,.04,.2).neither,1);
const zero=P.intervals(100,0,.04,.2);close(zero.median,100,1e-12);for(const row of zero.levels){close(row.lower,100,1e-12);close(row.upper,100,1e-12);}
const ints=P.intervals(100,1,.04,.2,.01);
close(ints.mean,100*Math.exp(.03),1e-12);close(Math.sqrt(ints.levels[0].lower*ints.levels[0].upper),ints.median,1e-12);
close(ints.levels[0].coverage,.6826894921370859,4e-15);
// Far tails must not be lost through subtracting nearly equal CDF values.
const extreme=P.terminal(100,100*Math.exp(8*.2),100*Math.exp(9*.2),1,.02,.2);
assert.ok(extreme.between>0&&extreme.above>0);checks++;
close(P.touch(100,Math.exp(10),1,1e4+.5,1),1);
const hugeDrift=P.barriers(1,Math.exp(-.00001),Math.exp(.100001),1,.10000000005,.00001);
verifyAlgebra(hugeDrift);assert.ok(hugeDrift.price2>.45&&hugeDrift.price2<.47);checks++;
for(const f of [()=>P.terminal(0,90,110,1,0,.2),()=>P.touch(100,0,1,0,.2),()=>P.touch(100,90,-1,0,.2),()=>P.barriers(100,110,90,1,0,.2),()=>P.touching(100,90,110,1,0,.2,0,{tolerance:0}),()=>P.intervals(100,1,0,.2,0,[-1]),()=>P.years(-1),()=>P.touch(100,90,1,0,.2,0,'bad')]){assert.throws(f,RangeError);checks++;}
// Seeded Brownian-bridge Monte Carlo: exact endpoints and one-sided bridge marginals.
// Both sides in one 1/64-year segment have negligible probability, bounded below.
function monteCarlo(A,B,h,paths=120000,steps=64){
  let seed=0x12345678,spare=null;
  function uniform(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return ((seed>>>0)+.5)/4294967296;}
  function normal(){if(spare!==null){const z=spare;spare=null;return z;}const mag=Math.sqrt(-2*Math.log(uniform())),ang=2*Math.PI*uniform();spare=mag*Math.sin(ang);return mag*Math.cos(ang);}
  const counts={price1:0,price2:0,both:0,either:0,neither:0},dt=1/steps,s=Math.sqrt(dt);
  for(let p=0;p<paths;p++){
    let x=0,low=false,up=false;
    for(let j=0;j<steps;j++){
      const y=x+h*dt+s*normal();
      if(!low)low=x<=A||y<=A||uniform()<Math.exp(-2*(x-A)*(y-A)/dt);
      if(!up)up=x>=B||y>=B||uniform()<Math.exp(-2*(B-x)*(B-y)/dt);
      x=y;
    }
    counts.price1+=low;counts.price2+=up;counts.both+=low&&up;counts.either+=low||up;counts.neither+=!low&&!up;
  }
  const output={paths,steps,seed:'0x12345678',estimates:{}};
  for(const key in counts){const estimate=counts[key]/paths;output.estimates[key]={estimate,standardError:Math.sqrt(estimate*(1-estimate)/paths)};}
  // If a segment spans both barriers, its displacement from its start reaches D/2
  // on at least one side. Apply reflection and a union bound to real and artificial
  // bridge extrema. This bounds the remaining dependence error conservatively.
  const half=(B-A)/2;
  output.bridgeDependenceErrorBound=2*steps*(refHit(half,h,dt)+refHit(half,-h,dt));
  return output;
}
const A=Math.log(.9)/(.2*Math.sqrt(P.years(180,12,15))),B=Math.log(1.1)/(.2*Math.sqrt(P.years(180,12,15))),h=(-.01*P.years(180,12,15))/(.2*Math.sqrt(P.years(180,12,15)));
const mc=monteCarlo(A,B,h);
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'downloads/derivatives-options-futures/oic-original/probability-calculator/online-case.json'),'utf8'));
const offline=P.calculate({spot:fixture.spot,price1:fixture.price1,price2:fixture.price2,rate:fixture.ratePercent/100,dividendYield:fixture.dividendYieldPercent/100,volatility:fixture.volatilityPercent/100,days:fixture.days,hours:fixture.hours,minutes:fixture.minutes});
for(const key in mc.estimates){const row=mc.estimates[key];close(offline.touching[key],row.estimate,5*row.standardError+mc.bridgeDependenceErrorBound,'Monte Carlo '+key);}
// Explicit alternative convention: keep entered carry metadata, route all primitives
// through effective r=q+sigma^2/2, and verify zero-log-drift reflection independently.
const zeroInput={spot:fixture.spot,price1:fixture.price1,price2:fixture.price2,rate:fixture.ratePercent/100,dividendYield:fixture.dividendYieldPercent/100,volatility:fixture.volatilityPercent/100,days:fixture.days,hours:fixture.hours,minutes:fixture.minutes,driftConvention:'zero-log'};
const zeroLog=P.calculate(zeroInput);
close(zeroLog.model.inputRate,.03);close(zeroLog.model.inputDividendYield,.02);close(zeroLog.model.effectiveRate,.04);close(zeroLog.model.logDrift,0);
close(zeroLog.intervals.logReturnMean,0,1e-16);close(zeroLog.intervals.median,100,1e-12);
close(zeroLog.touching.price1,2*refSf(-A),2e-12,'zero-log lower reflection');
close(zeroLog.touching.price2,2*refSf(B),2e-12,'zero-log upper reflection');
verifyAlgebra(zeroLog.touching);
const expectedTerminal=[23,52,25],terminalKeys=['below','between','above'];
for(let i=0;i<3;i++){assert.equal(Math.round(zeroLog.terminal[terminalKeys[i]]*100),expectedTerminal[i]);checks++;}
assert.equal((zeroLog.touching.price1*100).toFixed(2),'45.38');checks++;
assert.equal((zeroLog.touching.price2*100).toFixed(2),'49.80');checks++;
assert.equal((zeroLog.touching.both*100).toFixed(2),'6.42');checks++;
assert.notEqual((zeroLog.touching.both*100).toFixed(2),'6.97');checks++;
const alternateCarry=P.calculate({...zeroInput,rate:.19,dividendYield:.11});
close(alternateCarry.touching.both,zeroLog.touching.both,1e-14,'zero-log input carry independence');
close(alternateCarry.model.inputRate,.19);close(alternateCarry.model.inputDividendYield,.11);
for(const a of [.3,.7,2,2.01]){
  const v=.2,z=P.calculate({spot:100,price1:100*Math.exp(-a*v),price2:100*Math.exp(a*v),time:1,rate:.08,dividendYield:.015,volatility:v,driftConvention:'zero-log'});
  close(z.touching.price1,2*refSf(a),2e-12,'zero-log symmetric reflection');
  close(z.touching.price1,z.touching.price2,5e-15,'zero-log convention symmetry');
  close(z.touching.neither,symmetricSurvival(a),5e-13,'zero-log convention survival');
}
assert.throws(()=>P.calculate({...zeroInput,driftConvention:'fitted'}),RangeError);checks++;
assert.throws(()=>P.calculate({...zeroInput,rate:NaN}),RangeError);checks++;
const displayedTouch={price1:45.38,price2:49.8,both:6.97,either:53.77,neither:46.23};
const zeroResiduals={terminal:{},touching:{},intervals:[]};
for(let i=0;i<3;i++){const key=terminalKeys[i];zeroResiduals.terminal[key]={modelPercent:zeroLog.terminal[key]*100,displayedPercent:expectedTerminal[i],residualPercentagePoints:zeroLog.terminal[key]*100-expectedTerminal[i],modelRoundedPercent:Math.round(zeroLog.terminal[key]*100),matchesDisplay:true};}
for(const key in displayedTouch){const actual=zeroLog.touching[key]*100,displayed=displayedTouch[key];zeroResiduals.touching[key]={modelPercent:actual,displayedPercent:displayed,residualPercentagePoints:actual-displayed,modelRoundedPercent:Number(actual.toFixed(2)),matchesDisplay:Number(actual.toFixed(2))===displayed};}
for(const [n,displayed] of [[-3,65.55],[-2,75.45],[-1,86.85],[1,115.06],[2,132.44],[3,152.44]]){
  const row=zeroLog.intervals.levels.find(x=>x.standardDeviations===Math.abs(n)),price=n<0?row.lower:row.upper;
  zeroResiduals.intervals.push({standardDeviations:n,modelPrice:price,displayedPrice:displayed,residualPrice:price-displayed,modelRoundedPrice:Number(price.toFixed(2)),matchesDisplay:Number(price.toFixed(2))===displayed});
}
const validation={generatedAt:new Date().toISOString(),model:'continuous GBM, default log drift r-q-sigma^2/2; explicit alternative zero log drift, ACT/365',checks,quadrature,convergence,monteCarlo:mc,onlineComparison:{input:fixture,offline,zeroLogAlternative:{offline:zeroLog,residuals:zeroResiduals,interpretation:'Zero log drift matches the displayed terminal integer percentages and one-sided touch values at two-decimal precision. Both, either, neither and all six standard-deviation prices do not match. This is a convention hypothesis, not proof of the proprietary vendor engine.'},observedUnionUsingDisplayedMarginals:0.4538+0.498-0.0697,observedDisplayedEither:0.5377,interpretation:'The displayed either/both/touch values do not satisfy ordinary union algebra. Vendor drift, monitoring, and interval conventions are unverified; observed numbers are not a golden reference.'}};
if(process.argv.includes('--write-validation'))fs.writeFileSync(path.join(__dirname,'downloads/derivatives-options-futures/oic-original/probability-validation.json'),JSON.stringify(validation,null,2)+'\n');
console.log(`Probability math: ${checks} checks passed; independent flux quadrature and ${mc.paths.toLocaleString()} Brownian-bridge paths validated.`);
console.log(JSON.stringify({maxQuadratureError:Math.max(...quadrature.map(x=>Math.abs(x.error))),mc:mc.estimates,bridgeDependenceErrorBound:mc.bridgeDependenceErrorBound}));
