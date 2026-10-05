(function(root){
  'use strict';
  const phi=x=>Math.exp(-x*x/2)/Math.sqrt(2*Math.PI);
  function cdf(x){
    const y=Math.abs(x);
    if(y>37)return x>0?1:0;
    let tail;
    if(y<7.07106781186547){
      const num=((((((0.0352624965998911*y+0.700383064443688)*y+6.37396220353165)*y+33.912866078383)*y+112.079291497871)*y+221.213596169931)*y+220.206867912376);
      const den=(((((((0.0883883476483184*y+1.75566716318264)*y+16.064177579207)*y+86.7807322029461)*y+296.564248779674)*y+637.333633378831)*y+793.826512519948)*y+440.413735824752);
      tail=Math.exp(-y*y/2)*num/den;
    }else tail=phi(y)/(y+1/(y+2/(y+3/(y+4/(y+0.65)))));
    return x>=0?1-tail:tail;
  }
  function option(S,K,T,r,sigma,q=0){
    if(![S,K,T,r,sigma,q].every(Number.isFinite)||S<=0||K<=0||T<0||sigma<0)throw Error('Spot and strike must be positive; time and volatility cannot be negative.');
    const A=S*Math.exp(-q*T),B=K*Math.exp(-r*T);
    if(T===0||sigma===0)return {call:Math.max(A-B,0),put:Math.max(B-A,0),deltaCall:null,deltaPut:null,gamma:null,vega:null,thetaCall:null,thetaPut:null,rhoCall:null,rhoPut:null,alphaCall:null,alphaPut:null};
    const d1=(Math.log(S/K)+(r-q+sigma*sigma/2)*T)/(sigma*Math.sqrt(T)),d2=d1-sigma*Math.sqrt(T),N1=cdf(d1),N2=cdf(d2),n=phi(d1),common=-A*n*sigma/(2*Math.sqrt(T));
    const result={call:Math.max(0,A*N1-B*N2),put:Math.max(0,B*cdf(-d2)-A*cdf(-d1)),d1,d2,deltaCall:Math.exp(-q*T)*N1,deltaPut:Math.exp(-q*T)*(N1-1),gamma:Math.exp(-q*T)*n/(S*sigma*Math.sqrt(T)),vega:A*n*Math.sqrt(T)/100,thetaCall:(common-r*B*N2+q*A*N1)/365,thetaPut:(common+r*B*cdf(-d2)-q*A*cdf(-d1))/365,rhoCall:T*B*N2/100,rhoPut:-T*B*cdf(-d2)/100};
    result.alphaCall=result.thetaCall===0?null:result.gamma/result.thetaCall;
    result.alphaPut=result.thetaPut===0?null:result.gamma/result.thetaPut;
    return result;
  }
  function implied(type,target,S,K,T,r,q=0){
    if(!['call','put'].includes(type)||!Number.isFinite(target)||target<0||T<=0)throw Error('Choose a call or put, a nonnegative price, and a positive expiry.');
    option(S,K,T,r,0,q);
    const A=S*Math.exp(-q*T),B=K*Math.exp(-r*T),lower=type==='call'?Math.max(A-B,0):Math.max(B-A,0),upper=type==='call'?A:B;
    if(target<lower-1e-9||target>=upper)throw Error('Market price is outside the model bounds.');
    if(Math.abs(target-lower)<1e-9)return 0;
    let lo=0,hi=1;
    while(option(S,K,T,r,hi,q)[type]<target&&hi<16)hi*=2;
    if(option(S,K,T,r,hi,q)[type]<target)throw Error('No solution within the supported volatility range.');
    for(let i=0;i<100;i++){let mid=(lo+hi)/2;if(option(S,K,T,r,mid,q)[type]<target)lo=mid;else hi=mid;}
    return (lo+hi)/2;
  }
  function payoff(strategy,x,p){
    const {spot=100,strike=100,upper=110,callPremium=5,putPremium=5,multiplier=100,contracts=1}=p;
    const call=Math.max(x-strike,0),put=Math.max(strike-x,0);
    const values={longCall:call-callPremium,shortPut:putPremium-put,coveredCall:x-spot-call+callPremium,longPut:put-putPremium,coveredPut:spot-x-put+putPremium,shortStraddle:callPremium+putPremium-call-put,shortStrangle:callPremium+putPremium-Math.max(x-upper,0)-put};
    if(!(strategy in values))throw Error('Unknown strategy');
    return values[strategy]*multiplier*contracts;
  }
  function futures(entry,exit,multiplier,contracts,side,initial,maintenance){
    if(![entry,exit,multiplier,contracts,side,initial,maintenance].every(Number.isFinite)||multiplier<=0||contracts<=0||![-1,1].includes(side)||initial<0||maintenance<0||maintenance>initial)throw Error('Check contract, position, and margin inputs.');
    const pnl=(exit-entry)*multiplier*contracts*side,equity=initial+pnl,marginCall=equity<maintenance;
    return {pnl,equity,marginCall,topUp:marginCall?initial-equity:0};
  }
  const api={option,implied,payoff,futures,cdf};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.OptionMath=api;
})(typeof globalThis==='undefined'?this:globalThis);
