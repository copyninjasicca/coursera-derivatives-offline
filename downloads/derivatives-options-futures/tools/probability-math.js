(function(root){
  'use strict';
  // Independent GBM model; decimal annual rates/volatility, time in ACT/365 years.
  // Continuous monitoring includes time zero. See oic-original/probability-methodology.md.
  const LOG_SQRT_2PI=Math.log(2*Math.PI)/2, DEFAULT_TOLERANCE=1e-13;
  const clamp=x=>Math.max(0,Math.min(1,x));
  function millsDenominator(x){
    // Laplace continued fraction for the normal Mills ratio, used above seven sigma.
    let d=0; for(let n=100;n>=1;n--) d=n/(x+d); return x+d;
  }
  function logSf(x){
    if(x===Infinity)return -Infinity;
    if(x===-Infinity)return 0;
    if(Number.isNaN(x))return NaN;
    if(x<0)return Math.log1p(-Math.exp(logSf(-x)));
    if(x>=7)return -x*x/2-LOG_SQRT_2PI-Math.log(millsDenominator(x));
    const num=((((((0.0352624965998911*x+0.700383064443688)*x+6.37396220353165)*x+33.912866078383)*x+112.079291497871)*x+221.213596169931)*x+220.206867912376);
    const den=(((((((0.0883883476483184*x+1.75566716318264)*x+16.064177579207)*x+86.7807322029461)*x+296.564248779674)*x+637.333633378831)*x+793.826512519948)*x+440.413735824752);
    return -x*x/2+Math.log(num/den);
  }
  const sf=x=>Math.exp(logSf(x));
  const cdf=x=>x<=0?sf(-x):-Math.expm1(logSf(x));
  const logCdf=x=>logSf(-x);
  function logOneMinusExp(x){return x<-Math.LN2?Math.log1p(-Math.exp(x)):Math.log(-Math.expm1(x));}
  function tailRatio(a,b){
    // log(sf(b)/sf(a)); factored squares prevent cancellation for large arguments.
    if(b===Infinity)return -Infinity;
    return a>=7?-(b-a)*(b+a)/2+Math.log(millsDenominator(a)/millsDenominator(b)):logSf(b)-logSf(a);
  }
  function logNormalInterval(a,b){
    if(a>=b)return -Infinity;
    if(a>=0)return logSf(a)+logOneMinusExp(tailRatio(a,b));
    if(b<=0)return logSf(-b)+logOneMinusExp(tailRatio(-b,-a));
    return Math.log(cdf(b)-cdf(a));
  }
  const normalInterval=(a,b)=>Math.exp(logNormalInterval(a,b));
  function model(S,T,r,sigma,q){
    if(![S,T,r,sigma,q].every(Number.isFinite)||S<=0||T<0||sigma<0)throw new RangeError('Positive spot and finite inputs are required; time and volatility must be nonnegative.');
    const sd=sigma*Math.sqrt(T),variance=sd*sd,carry=T===0?0:r*T-q*T,drift=carry-variance/2;
    if(![variance,drift,sd,carry].every(Number.isFinite))throw new RangeError('The model inputs exceed floating-point range.');
    return {variance,drift,sd,carry};
  }
  function target(H){if(!Number.isFinite(H)||H<=0)throw new RangeError('Targets must be finite positive prices.');}
  function logRatio(a,b){
    if(Math.abs(a-b)<=b/2)return Math.log1p((a-b)/b);
    const ratio=a/b; return ratio>0&&Number.isFinite(ratio)?Math.log(ratio):Math.log(a)-Math.log(b);
  }
  function compareLogs(a,b){
    const gap=a-b;return Math.abs(gap)<=16*Number.EPSILON*Math.max(1,Math.abs(a),Math.abs(b))?0:Math.sign(gap);
  }
  function years(days=0,hours=0,minutes=0){
    if(![days,hours,minutes].every(Number.isFinite)||days<0||hours<0||minutes<0)throw new RangeError('Days, hours, and minutes must be finite and nonnegative.');
    const T=(days+hours/24+minutes/1440)/365;
    if(!Number.isFinite(T))throw new RangeError('Time exceeds floating-point range.');
    return T;
  }
  function terminal(S,p1,p2,T,r,sigma,q=0){
    const m=model(S,T,r,sigma,q); target(p1);target(p2);
    const lower=Math.min(p1,p2),upper=Math.max(p1,p2),a=logRatio(lower,S),b=logRatio(upper,S);
    // Strict below/above; the closed middle interval owns deterministic boundary mass.
    if(m.sd===0){const ca=compareLogs(m.drift,a),cb=compareLogs(m.drift,b);return {lower,upper,below:ca<0?1:0,between:ca>=0&&cb<=0?1:0,above:cb>0?1:0};}
    const z1=(a-m.drift)/m.sd,z2=(b-m.drift)/m.sd;
    return {lower,upper,below:cdf(z1),between:normalInterval(z1,z2),above:sf(z2)};
  }
  function touch(S,H,T,r,sigma,q=0,direction='auto'){
    const m=model(S,T,r,sigma,q);target(H);
    if(!['auto','lower','upper'].includes(direction))throw new RangeError('Direction must be auto, lower, or upper.');
    if(direction==='auto')direction=H<S?'lower':'upper';
    if((direction==='lower'&&S<=H)||(direction==='upper'&&S>=H))return 1;
    const sign=direction==='upper'?1:-1,a=sign*logRatio(H,S),d=sign*m.drift;
    if(m.sd===0)return compareLogs(d,a)>=0?1:0;
    const h=d/m.sd,b=a/m.sd,z=h+b;
    // Reflection formula. Complete the square before multiplying a large exponential
    // by a tiny normal tail, avoiding Infinity*0 and cancellation in the log exponent.
    const reflected=z>=7?Math.exp(-(h-b)*(h-b)/2-LOG_SQRT_2PI-Math.log(millsDenominator(z))):Math.exp(2*h*b+logCdf(-z));
    return clamp(cdf(h-b)+reflected);
  }
  function tolerance(options){
    const value=options&&options.tolerance!==undefined?options.tolerance:DEFAULT_TOLERANCE;
    if(!Number.isFinite(value)||value<1e-15||value>1e-5)throw new RangeError('Tolerance must be between 1e-15 and 1e-5.');
    return value;
  }
  function compensatedSum(values){
    let sum=0,correction=0;
    for(const v of values){const y=v-correction,t=sum+y;correction=(t-sum)-y;sum=t;}
    return sum;
  }
  function imageIntegral(A,B,h,c){
    const lo=A+c-h,hi=B+c-h;
    if(lo>=7)return Math.exp(-(A-h)*(A-h)/2-c*(A+c/2)-LOG_SQRT_2PI-Math.log(millsDenominator(lo))+logOneMinusExp(tailRatio(lo,hi)));
    if(hi<=-7)return Math.exp(-(B-h)*(B-h)/2-c*(B+c/2)-LOG_SQRT_2PI-Math.log(millsDenominator(-hi))+logOneMinusExp(tailRatio(-hi,-lo)));
    return Math.exp(-h*c+logNormalInterval(lo,hi));
  }
  function imageTail(A,B,h,c,step){
    const D=B-A,y=Math.max(A,Math.min(B,h-c));
    const peak=-(y-h)*(y-h)/2-c*(y+c/2);
    const logRatioBound=step>0?-step*(A+c+step/2):-step*(B+c+step/2);
    if(logRatioBound>=0)return Infinity;
    return Math.exp(Math.log(D)-LOG_SQRT_2PI+peak)/(-Math.expm1(logRatioBound));
  }
  function survivalImages(A,B,h,tol){
    const D=B-A,terms=[];
    const append=k=>{const c=2*k*D;terms.push(imageIntegral(A,B,h,c),-imageIntegral(A,B,h,c-2*A));};
    append(0);
    for(let n=1;n<=10000;n++){
      append(n);append(-n);
      const c=2*(n+1)*D;
      const errorBound=imageTail(A,B,h,c,2*D)+imageTail(A,B,h,c-2*A,2*D)+imageTail(A,B,h,-c,-2*D)+imageTail(A,B,h,-c-2*A,-2*D);
      if(errorBound<=tol)return {probability:clamp(compensatedSum(terms)),method:'images',terms:2*n+1,truncationBound:errorBound};
    }
    throw new Error('Absorbing-interval image expansion failed to converge.');
  }
  function survivalSpectral(A,B,h,tol){
    const D=B-A,alpha=Math.PI*Math.PI/(2*D*D),E0=h*A-h*h/2,E1=h*B-h*h/2;
    const logBound=Math.log(2)+Math.max(E0,E1),terms=[];
    for(let n=1;n<=10000;n++){
      const b=n*Math.PI/D,decay=alpha*n*n;
      const integral=b/(h*h+b*b)*(Math.exp(E0-decay)-(n%2?-1:1)*Math.exp(E1-decay));
      terms.push(2/D*Math.sin(n*Math.PI*(-A)/D)*integral);
      const next=n+1,errorBound=Math.exp(logBound-alpha*next*next)/(-Math.expm1(-alpha*(2*next+1)));
      if(errorBound<=tol)return {probability:clamp(compensatedSum(terms)),method:'spectral',terms:n,truncationBound:errorBound};
    }
    throw new Error('Absorbing-interval eigenfunction expansion failed to converge.');
  }
  function survival(S,lower,upper,T,r,sigma,q=0,options={}){
    const m=model(S,T,r,sigma,q);target(lower);target(upper);const tol=tolerance(options);
    if(lower>upper)throw new RangeError('Lower barrier must not exceed upper barrier.');
    if(S<=lower||S>=upper)return {probability:0,method:'already-breached',terms:0,truncationBound:0};
    const a=logRatio(lower,S),b=logRatio(upper,S);
    if(m.sd===0)return {probability:compareLogs(m.drift,a)>0&&compareLogs(m.drift,b)<0?1:0,method:'deterministic',terms:0,truncationBound:0};
    const A=a/m.sd,B=b/m.sd,h=m.drift/m.sd;
    if(![A,B,h].every(Number.isFinite))throw new RangeError('Scaled model inputs exceed floating-point range.');
    // Survival is bounded by ending inside. This also controls extreme-drift cases.
    const bound=normalInterval(A-h,B-h);
    if(bound<=tol)return {probability:0,method:'terminal-tail-bound',terms:0,truncationBound:bound};
    return B-A>=4?survivalImages(A,B,h,tol):survivalSpectral(A,B,h,tol);
  }
  function joint(p1,p2,both,details){
    // Project only rounding/truncation errors onto the exact Frechet bounds.
    both=Math.max(Math.max(0,p1+p2-1),Math.min(Math.min(p1,p2),both));
    const either=clamp(p1+p2-both);
    return {price1:p1,price2:p2,both,either,neither:clamp(1-either),...details};
  }
  function barriers(S,lower,upper,T,r,sigma,q=0,options={}){
    const noHit=survival(S,lower,upper,T,r,sigma,q,options);
    const p1=touch(S,lower,T,r,sigma,q,'lower'),p2=touch(S,upper,T,r,sigma,q,'upper');
    return joint(p1,p2,p1+p2-1+noHit.probability,{lower,upper,numerical:noHit});
  }
  function touching(S,p1,p2,T,r,sigma,q=0,options={}){
    model(S,T,r,sigma,q);target(p1);target(p2);tolerance(options);
    const t1=touch(S,p1,T,r,sigma,q),t2=touch(S,p2,T,r,sigma,q);
    if((p1-S)*(p2-S)>=0)return joint(t1,t2,Math.min(t1,t2),{numerical:{method:'nested-targets',terms:0,truncationBound:0}});
    const lower=Math.min(p1,p2),upper=Math.max(p1,p2),noHit=survival(S,lower,upper,T,r,sigma,q,options);
    return joint(t1,t2,t1+t2-1+noHit.probability,{numerical:noHit});
  }
  function intervals(S,T,r,sigma,q=0,levels=[1,2,3]){
    const m=model(S,T,r,sigma,q);
    if(!Array.isArray(levels)||!levels.every(n=>Number.isFinite(n)&&n>=0))throw new RangeError('Interval levels must be nonnegative finite standard deviations.');
    const median=Math.exp(Math.log(S)+m.drift),mean=Math.exp(Math.log(S)+m.carry);
    return {median,mean,logReturnMean:m.drift,logReturnSd:m.sd,levels:levels.map(n=>({standardDeviations:n,lower:Math.exp(Math.log(S)+m.drift-n*m.sd),upper:Math.exp(Math.log(S)+m.drift+n*m.sd),coverage:-Math.expm1(Math.log(2)+logSf(n))}))};
  }
  function calculate(input){
    const {spot,price1,price2,rate,volatility,dividendYield=0,time,days=0,hours=0,minutes=0,driftConvention='risk-neutral'}=input;
    const T=time===undefined?years(days,hours,minutes):time;
    model(spot,T,rate,volatility,dividendYield);
    if(!['risk-neutral','zero-log'].includes(driftConvention))throw new RangeError('Drift convention must be risk-neutral or zero-log.');
    const effectiveRate=driftConvention==='zero-log'?dividendYield+volatility*volatility/2:rate;
    if(!Number.isFinite(effectiveRate))throw new RangeError('The effective rate exceeds floating-point range.');
    const metadata={driftConvention,inputRate:rate,inputDividendYield:dividendYield,effectiveRate,logDrift:driftConvention==='zero-log'?0:rate-dividendYield-volatility*volatility/2,monitoring:'continuous',dayCount:'ACT/365'};
    return {time:T,model:metadata,terminal:terminal(spot,price1,price2,T,effectiveRate,volatility,dividendYield),touching:touching(spot,price1,price2,T,effectiveRate,volatility,dividendYield,input),intervals:intervals(spot,T,effectiveRate,volatility,dividendYield)};
  }
  const api={cdf,sf,logCdf,logSf,normalInterval,years,terminal,touch,touching,barriers,survival,intervals,calculate};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.ProbabilityMath=api;
})(typeof globalThis==='undefined'?this:globalThis);
