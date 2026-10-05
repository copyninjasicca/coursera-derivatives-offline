const assert=require('node:assert/strict');
const fs=require('node:fs');
const M=require('./downloads/derivatives-options-futures/tools/option-math.js');
let checks=0;
function near(actual,expected,tolerance,label){assert.ok(Math.abs(actual-expected)<=tolerance,`${label}: ${actual} vs ${expected}`);checks++;}
for(const [x,expected] of JSON.parse(fs.readFileSync('cdf-reference.json','utf8')))near(M.cdf(x),expected,2e-14,'Normal CDF vs Python math.erfc');
let o=M.option(100,95,.25,.1,.5,0);
near(o.call,13.6953,6e-5,'MathWorks no-dividend call');near(o.put,6.3497,6e-5,'MathWorks no-dividend put');
o=M.option(910,980,.25,.02,.25,.025);
near(o.call,19.6863,6e-5,'MathWorks dividend call');near(o.put,90.4683,6e-5,'MathWorks dividend put');
for(const S of [80,100,120])for(const sigma of [.1,.3,.7]){
 const K=100,T=.8,r=.03,q=.015,h=.01,o=M.option(S,K,T,r,sigma,q);
 near(o.call-o.put,S*Math.exp(-q*T)-K*Math.exp(-r*T),1e-9,'Put-call parity');
 const up=M.option(S+h,K,T,r,sigma,q),down=M.option(S-h,K,T,r,sigma,q);
 near((up.call-down.call)/(2*h),o.deltaCall,3e-5,'Call delta');
 near((up.put-down.put)/(2*h),o.deltaPut,3e-5,'Put delta');
 near((up.call-2*o.call+down.call)/(h*h),o.gamma,3e-5,'Gamma');
 const dv=.0001,vega=(M.option(S,K,T,r,sigma+dv,q).call-M.option(S,K,T,r,sigma-dv,q).call)/(2*dv)/100;
 near(vega,o.vega,3e-5,'Vega');
 const dt=.00001,theta=-(M.option(S,K,T+dt,r,sigma,q).call-M.option(S,K,T-dt,r,sigma,q).call)/(2*dt)/365;
 near(theta,o.thetaCall,3e-6,'Theta/day');
 const dr=.0001,rho=(M.option(S,K,T,r+dr,sigma,q).call-M.option(S,K,T,r-dr,sigma,q).call)/(2*dr)/100;
 near(rho,o.rhoCall,3e-5,'Rho');
 near(M.implied('call',o.call,S,K,T,r,q),sigma,1e-8,'Call implied vol recovery');
 near(M.implied('put',o.put,S,K,T,r,q),sigma,1e-8,'Put implied vol recovery');
}
near(o.alphaCall,o.gamma/o.thetaCall,1e-12,'OIC Alpha definition: call');near(o.alphaPut,o.gamma/o.thetaPut,1e-12,'OIC Alpha definition: put');
near(.0735/-1.3461,-.0546,5e-5,'OIC guide call Alpha screenshot');near(.0739/-1.3210,-.0559,5e-5,'OIC guide put Alpha screenshot');
near(M.option(110,100,0,.05,.2).call,10,0,'Expiry intrinsic');
near(M.option(100,100,1,.05,0).call,100-100*Math.exp(-.05),1e-12,'Zero-vol deterministic limit');
assert.throws(()=>M.implied('call',200,100,100,1,.05));checks++;
assert.throws(()=>M.option(-1,100,1,.05,.2));checks++;
const p={spot:100,strike:100,upper:110,callPremium:5,putPremium:4,multiplier:100,contracts:1};
for(const [strategy,x,expected] of [['longCall',110,500],['longCall',90,-500],['shortPut',90,-600],['coveredCall',120,500],['longPut',90,600],['coveredPut',120,-1600],['shortStraddle',100,900],['shortStrangle',105,900],['shortStrangle',130,-1100]])near(M.payoff(strategy,x,p),expected,0,strategy);
const f=M.futures(100,62,100,1,1,8000,6500);near(f.pnl,-3800,0,'Futures P&L');near(f.equity,4200,0,'Margin balance');near(f.topUp,3800,0,'Margin restoration');assert.equal(f.marginCall,true);checks++;
near(M.futures(100,98,100,2,-1,8000,6500).pnl,400,0,'Short futures P&L');
const report={checked_on:'2026-10-05',checks,passed:true,sources:['https://www.mathworks.com/help/finance/blsprice.html','https://www.mathworks.com/help/finance/blsdelta.html','https://www.optionseducation.org/toolsoptionquotes/options-calculator'],methods:['Normal CDF compared against Python math.erfc on 81 points from -10 to 10','Official published price examples','Independent central finite-difference Greeks','Put-call parity','Implied-volatility round trips','Expiry and zero-volatility boundary cases','Hand-calculated strategy payoffs and futures margin examples','Alpha definition and rounded official OIC guide examples'],limitations:['European exercise only; continuous dividend yield','Original OIC output comparison is in oic-original/comparison.json; observed numerical differences remain','Normal CDF approximation; not a market calibration model']};
fs.writeFileSync('downloads/derivatives-options-futures/validation-report.json',JSON.stringify(report,null,2)+'\n');console.log(report);
