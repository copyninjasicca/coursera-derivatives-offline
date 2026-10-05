(function(root){
  'use strict';
  const GREEKS=['delta','gamma','theta','vega','rho'];
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  function number(value,name,min=-Infinity){
    if(typeof value==='string'&&value.trim()!==''&&/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))value=Number(value);
    if(typeof value!=='number'||!Number.isFinite(value)||value<min)throw Error(name+' must be a finite number'+(min>-Infinity?' >= '+min: '')+'.');
    return value;
  }
  function object(o,name){if(!o||typeof o!=='object'||Array.isArray(o))throw Error(name+' must be an object.');return o;}
  function text(v,name){if(typeof v!=='string'||!v.trim()||v.length>160||/[\x00-\x1f<>]/.test(v))throw Error(name+' must be plain text, 1–160 characters.');return v.trim();}
  function date(v,name){
    if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v+'T00:00:00Z'))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)throw Error(name+' must be a valid YYYY-MM-DD date.');
    return v;
  }
  const daysBetween=(a,b)=>(Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000;
  function dependency(name,path){
    if(root[name])return root[name];
    if(typeof require==='function')return require(path);
    throw Error(name+' must be loaded before PortfolioMath.');
  }
  function normalizeLeg(input,market){
    object(input,'Leg');
    const kind=input.kind||(input.type==='stock'?'stock':'option');
    if(!['stock','option'].includes(kind))throw Error('Leg kind must be stock or option.');
    const leg={kind,quantity:number(input.quantity,'Quantity'),multiplier:number(input.multiplier===undefined?(kind==='stock'?1:100):input.multiplier,'Multiplier',Number.MIN_VALUE),entryPrice:number(input.entryPrice,'Entry price',0)};
    if(kind==='stock'&&leg.multiplier!==1)throw Error('Stock quantity is in shares; multiplier must be 1.');
    if(input.id!==undefined)leg.id=text(input.id,'Leg id');
    if(input.symbol!==undefined)leg.symbol=text(input.symbol,'Symbol');
    if(kind==='option'){
      if(!['call','put'].includes(input.type))throw Error('Option type must be call or put.');
      leg.type=input.type;leg.style=input.style||'european';
      if(!['american','european'].includes(leg.style))throw Error('Style must be american or european.');
      leg.strike=number(input.strike,'Strike',Number.MIN_VALUE);
      if(input.daysToExpiry!==undefined)leg.daysToExpiry=number(input.daysToExpiry,'Days to expiry');
      else if(input.expiry!==undefined&&market.valuationDate)leg.daysToExpiry=daysBetween(date(market.valuationDate,'Valuation date'),date(input.expiry,'Expiry'));
      else throw Error('Option needs daysToExpiry, or expiry and market.valuationDate.');
      if(input.expiry!==undefined)leg.expiry=date(input.expiry,'Expiry');
      if(input.volatility!==undefined)leg.volatility=number(input.volatility,'Leg volatility',0);
      if(input.dividendYield!==undefined)leg.dividendYield=number(input.dividendYield,'Leg dividend yield',0);
      if(input.dividends!==undefined){
        if(!Array.isArray(input.dividends))throw Error('Dividends must be an array.');
        leg.dividends=input.dividends.map(d=>{object(d,'Dividend');const fields=['timeYears','time','days'].filter(k=>d[k]!==undefined);if(fields.length!==1)throw Error('Dividend needs exactly one of timeYears, time or days.');const time=fields[0]==='days'?number(d.days,'Dividend days',0)/365:d[fields[0]];return {time:number(time,'Dividend time',0),amount:number(d.amount,'Dividend amount',0)};});
      }
    }
    if(input.markPrice!==undefined)leg.markPrice=number(input.markPrice,'Mark price',0);
    return leg;
  }
  function normalizeMarket(input){
    object(input,'Market');
    const m={spot:number(input.spot,'Spot',Number.MIN_VALUE),rate:number(input.rate===undefined?0:input.rate,'Rate'),volatility:number(input.volatility===undefined?.2:input.volatility,'Volatility',0),dividendYield:number(input.dividendYield===undefined?0:input.dividendYield,'Dividend yield',0)};
    if(input.valuationDate!==undefined)m.valuationDate=date(input.valuationDate,'Valuation date');
    if(input.symbol!==undefined)m.symbol=text(input.symbol,'Market symbol');
    return m;
  }
  function value(legs,market,options={}){
    if(!Array.isArray(legs))throw Error('Legs must be an array.');
    const m=normalizeMarket(market),elapsed=number(options.elapsedDays===undefined?0:options.elapsedDays,'Elapsed days',0),totals={cost:0,value:0,pnl:0,greeks:Object.fromEntries(GREEKS.map(k=>[k,0]))},warnings=[];
    const rows=legs.map(input=>{
      const l=normalizeLeg(input,m),size=number(l.quantity*l.multiplier,'Position size');
      if(l.symbol&&m.symbol&&l.symbol!==m.symbol)throw Error('All legs must use the market underlying symbol.');
      let price,model,greeks={delta:1,gamma:0,theta:0,vega:0,rho:0},remainingDays=null,volatility=null;
      if(l.kind==='stock'){price=m.spot;model='stock';}
      else {
        remainingDays=Math.max(0,l.daysToExpiry-elapsed);volatility=l.volatility===undefined?m.volatility:l.volatility;
        if(options.volatilityShift!==undefined)volatility=shiftVolatility(volatility,options.volatilityShift,options.volatilityMode||'relative');
        if(remainingDays===0){
          price=Math.max(l.type==='call'?m.spot-l.strike:l.strike-m.spot,0);model='intrinsic';
          greeks={delta:m.spot===l.strike?null:(l.type==='call'?(m.spot>l.strike?1:0):(m.spot<l.strike?-1:0)),gamma:null,theta:null,vega:0,rho:0};
          if(l.daysToExpiry-elapsed<0)warnings.push('Expired option valued at scenario-spot intrinsic; historical settlement and reinvestment are not modeled.');
        }else{
          const args={...l,spot:m.spot,rate:m.rate,volatility,dividendYield:l.dividendYield===undefined?m.dividendYield:l.dividendYield,daysToExpiry:remainingDays,time:remainingDays/365};
          if(l.dividends)args.dividends=l.dividends.map(d=>({time:d.time-elapsed/365,amount:d.amount})).filter(d=>d.time>0&&d.time<args.time&&d.amount>0);
          let p;
          if(options.pricingModel){
            if(typeof options.pricingModel!=='function')throw Error('pricingModel must be a function accepting normalized leg/model inputs.');
            p=options.pricingModel({...args,priceOnly:!!options.priceOnly});model='injected';
          }else {
            const cashDividends=!!(args.dividends&&args.dividends.length),lattice=l.style==='american'||cashDividends;
            const dep=lattice?dependency('AmericanMath','./american-math.js'):dependency('OptionMath','./option-math.js');
            const modelOptions={steps:options.steps||100,dividends:args.dividends||[],exercise:l.style};
            p=options.priceOnly&&lattice?{price:dep.price(l.type,args.spot,l.strike,args.time,args.rate,volatility,args.dividendYield,modelOptions)}:dep.option(args.spot,l.strike,args.time,args.rate,volatility,args.dividendYield,modelOptions);model=l.style==='american'?'CRR American':cashDividends?'CRR European (escrowed cash dividends)':'BSM European';
          }
          object(p,'Pricing model result');const suffix=l.type==='call'?'Call':'Put';
          price=number(p.price===undefined?p[l.type]:p.price,'Model price',0);
          greeks=Object.fromEntries(GREEKS.map(k=>{let g=p.greeks&&own(p.greeks,k)?p.greeks[k]:(p[k+suffix]===undefined?p[k]:p[k+suffix]);return [k,options.priceOnly||g===undefined||g===null?null:number(g,'Model '+k)];}));
        }
      }
      const modelPrice=price;
      if(options.useMarks&&l.markPrice!==undefined&&model!=='intrinsic'){price=l.markPrice;warnings.push('Imported/manual mark used for value; Greeks remain model sensitivities.');}
      const weighted=Object.fromEntries(GREEKS.map(k=>[k,size===0?0:greeks[k]===null?null:number(greeks[k]*size,'Position '+k)]));
      const row={...l,remainingDays,volatility,model,price,modelPrice,cost:number(l.entryPrice*size,'Position cost'),value:number(price*size,'Position value'),greeks:weighted,unitGreeks:greeks};row.pnl=number(row.value-row.cost,'Position PnL');
      totals.cost=number(totals.cost+row.cost,'Portfolio cost');totals.value=number(totals.value+row.value,'Portfolio value');
      for(const k of GREEKS)totals.greeks[k]=totals.greeks[k]===null||weighted[k]===null?null:number(totals.greeks[k]+weighted[k],'Portfolio '+k);
      return row;
    });
    totals.pnl=number(totals.value-totals.cost,'Portfolio PnL');
    return {...totals,legs:rows,market:m,priceOnly:!!options.priceOnly,warnings:[...new Set(warnings)],greekUnits:{delta:'currency per 1 spot unit',gamma:'delta change per 1 spot unit',theta:'currency per calendar day',vega:'currency per 1 volatility percentage point',rho:'currency per 1 rate percentage point'}};
  }
  function shiftVolatility(base,change,mode='relative'){
    base=number(base,'Base volatility',0);change=number(change,'Volatility shift');
    if(!['relative','absolute'].includes(mode))throw Error('Volatility mode must be relative or absolute.');
    return number(mode==='relative'?base*(1+change):base+change,'Shifted volatility',0);
  }
  function scenario(legs,market,changes={},options={}){
    object(changes,'Scenario');const m=normalizeMarket(market);
    if(changes.spot!==undefined)m.spot=number(changes.spot,'Scenario spot',Number.MIN_VALUE);
    else if(changes.spotShift!==undefined){const n=number(changes.spotShift,'Spot shift'),mode=changes.spotMode||'relative';if(!['relative','absolute'].includes(mode))throw Error('Spot mode must be relative or absolute.');m.spot=number(mode==='relative'?m.spot*(1+n):m.spot+n,'Scenario spot',Number.MIN_VALUE);}
    if(changes.rateShift!==undefined)m.rate+=number(changes.rateShift,'Rate shift');
    if(changes.dividendYield!==undefined)m.dividendYield=number(changes.dividendYield,'Scenario dividend yield',0);
    const baseline=options.baseline||value(legs,market,options),result=value(legs,m,{...options,elapsedDays:changes.elapsedDays===undefined?0:changes.elapsedDays,volatilityShift:changes.volatilityShift,volatilityMode:changes.volatilityMode||'relative',useMarks:false});
    number(baseline.value,'Baseline value');number(baseline.pnl,'Baseline PnL');
    return {...result,baselineValue:baseline.value,baselinePnl:baseline.pnl,valueChange:result.value-baseline.value};
  }
  function atExpiry(legs,spot,options={}){
    const market={...options.market,spot},normalized=legs.map(l=>l.kind==='stock'||l.type==='stock'?l:{...l,daysToExpiry:0});
    return value(normalized,market,{...options,useMarks:false,elapsedDays:0});
  }
  function scenarios(legs,market,points,options={}){if(!Array.isArray(points))throw Error('Scenario points must be an array.');const baseline=value(legs,market,options);return points.map(p=>scenario(legs,market,typeof p==='number'?{spot:p}:p,{...options,baseline}));}
  function importSnapshot(input){
    if(typeof input==='string'){if(input.length>10000000)throw Error('Snapshot exceeds 10 MB.');try{input=JSON.parse(input);}catch(e){throw Error('Snapshot must contain valid JSON.');}}
    object(input,'Snapshot');if(input.schemaVersion!==1)throw Error('Snapshot schemaVersion must be 1.');
    const result={schemaVersion:1,source:input.source===undefined?'User import':text(input.source,'Source'),prices:[],quotes:[]};
    if(input.asOf!==undefined)result.asOf=date(input.asOf,'As-of date');
    for(const field of ['prices','quotes']){if(input[field]!==undefined&&!Array.isArray(input[field]))throw Error(field+' must be an array.');if((input[field]||[]).length>100000)throw Error('Too many '+field+' rows.');}
    const priceKeys=new Set(),quoteKeys=new Set();
    result.prices=(input.prices||[]).map((r,i)=>{
      object(r,'Price row '+i);const row={symbol:text(r.symbol,'Price symbol'),date:date(r.date,'Price date'),close:number(r.close===undefined?r.price:r.close,'Close',Number.MIN_VALUE)};
      for(const k of ['open','high','low','adjustedClose'])if(r[k]!==undefined)row[k]=number(r[k],k,Number.MIN_VALUE);
      if(r.volume!==undefined)row.volume=number(r.volume,'Volume',0);
      if(row.high!==undefined&&row.low!==undefined&&row.high<row.low)throw Error('High must be >= low.');
      if(row.high!==undefined&&[row.close,row.open].filter(v=>v!==undefined).some(v=>v>row.high))throw Error('OHLC value exceeds high.');
      if(row.low!==undefined&&[row.close,row.open].filter(v=>v!==undefined).some(v=>v<row.low))throw Error('OHLC value below low.');
      const key=JSON.stringify([row.symbol,row.date]);if(priceKeys.has(key))throw Error('Duplicate symbol/date price row.');priceKeys.add(key);return row;
    }).sort((a,b)=>a.symbol.localeCompare(b.symbol)||a.date.localeCompare(b.date));
    result.quotes=(input.quotes||[]).map((r,i)=>{
      object(r,'Quote row '+i);const row={symbol:text(r.symbol,'Quote symbol'),date:date(r.date||result.asOf,'Quote date'),type:r.type||'stock'};
      if(!['stock','call','put'].includes(row.type))throw Error('Quote type must be stock, call or put.');
      if(row.type!=='stock'){row.expiry=date(r.expiry,'Quote expiry');row.strike=number(r.strike,'Quote strike',Number.MIN_VALUE);row.style=r.style||'european';if(!['american','european'].includes(row.style))throw Error('Invalid quote style.');row.multiplier=number(r.multiplier===undefined?100:r.multiplier,'Quote multiplier',Number.MIN_VALUE);}
      for(const k of ['bid','ask','last','mark','iv','volume','openInterest'])if(r[k]!==undefined)row[k]=number(r[k],k,0);
      if(row.bid!==undefined&&row.ask!==undefined&&row.bid>row.ask)throw Error('Quote bid exceeds ask.');
      if(!['bid','ask','last','mark','iv'].some(k=>row[k]!==undefined))throw Error('Quote needs a price or imported iv.');
      if(row.type==='stock'&&row.iv!==undefined)throw Error('Stock quote cannot contain option IV.');
      const key=JSON.stringify([row.symbol,row.date,row.type,row.expiry||'',row.strike||'']);if(quoteKeys.has(key))throw Error('Duplicate quote contract/date row.');quoteKeys.add(key);return row;
    }).sort((a,b)=>a.symbol.localeCompare(b.symbol)||a.date.localeCompare(b.date)||(a.expiry||'').localeCompare(b.expiry||'')||(a.strike||0)-(b.strike||0)||a.type.localeCompare(b.type));
    return result;
  }
  function historicalVolatility(input,options={}){
    if(!Array.isArray(input))throw Error('Price history must be an array.');
    const field=options.priceField||'close';if(!['close','adjustedClose'].includes(field))throw Error('Price field must be close or adjustedClose.');
    let rows=input;
    if(input.length&&typeof input[0]==='object'){
      const symbols=new Set(input.map(r=>r.symbol));if(options.symbol)rows=rows.filter(r=>r.symbol===options.symbol);else if(symbols.size>1)throw Error('Choose one symbol for historical volatility.');
      const seen=new Set();rows=rows.map(r=>{const d=date(r.date,'History date');if(seen.has(d))throw Error('Duplicate history date.');seen.add(d);return {date:d,price:number(r[field],field,Number.MIN_VALUE)};}).sort((a,b)=>a.date.localeCompare(b.date));
    }else rows=rows.map(p=>({price:number(p,'History price',Number.MIN_VALUE)}));
    const annualization=number(options.tradingDaysPerYear===undefined?252:options.tradingDaysPerYear,'Trading days per year',Number.MIN_VALUE),divisor=options.divisor||'sample';
    if(!['sample','population'].includes(divisor))throw Error('Divisor must be sample or population.');
    const available=Math.max(0,rows.length-1),window=number(options.window===undefined?available:options.window,'Return window',1);if(!Number.isInteger(window))throw Error('Window must be an integer return count.');
    if(window>available)throw Error('Need window + 1 prices.');if(divisor==='sample'&&window<2)throw Error('Sample volatility needs at least two returns (three prices).');
    const selected=rows.slice(-(window+1)),returns=selected.slice(1).map((p,i)=>Math.log(p.price)-Math.log(selected[i].price)),mean=returns.reduce((a,b)=>a+b,0)/window,variance=returns.reduce((sum,r)=>sum+(r-mean)**2,0)/(divisor==='sample'?window-1:window),volatility=number(Math.sqrt(variance*annualization),'Annualized volatility');
    return {volatility,percent:volatility*100,variance,dailyStdDev:Math.sqrt(variance),meanLogReturn:mean,returns,returnCount:window,priceCount:window+1,tradingDaysPerYear:annualization,divisor,priceField:field,startDate:selected[0].date||null,endDate:selected[selected.length-1].date||null};
  }
  function chain(input,options={}){
    const snapshot=importSnapshot(input);let rows=snapshot.quotes.filter(q=>q.type!=='stock'&&(!options.symbol||q.symbol===options.symbol)&&(!options.expiry||q.expiry===options.expiry));
    const asOf=options.date||rows.reduce((d,q)=>q.date>d?q.date:d,'');if(asOf)date(asOf,'Chain date');
    rows=rows.filter(q=>q.date===asOf);
    return rows.map(q=>{const mid=q.bid!==undefined&&q.ask!==undefined?(q.bid+q.ask)/2:null,spread=mid===null?null:q.ask-q.bid;return {...q,mid,spread,spreadPct:mid>0?spread/mid*100:null,ivPercent:q.iv===undefined?null:q.iv*100,daysToExpiry:daysBetween(q.date,q.expiry),dataSource:snapshot.source};});
  }
  function rankQuotes(input,options={}){
    const sortBy=options.sortBy||'iv',allowed=['iv','volume','openInterest','mid','spread','spreadPct'];if(!allowed.includes(sortBy))throw Error('Unsupported ranking field.');
    const direction=options.direction||'descending';if(!['ascending','descending'].includes(direction))throw Error('Invalid ranking direction.');
    return chain(input,options).filter(q=>q[sortBy]!==null&&q[sortBy]!==undefined).sort((a,b)=>(direction==='ascending'?1:-1)*(a[sortBy]-b[sortBy])||a.symbol.localeCompare(b.symbol)||(a.strike-b.strike)).map((q,i)=>({...q,rank:i+1,rankingField:sortBy}));
  }
  const api={value,scenario,scenarios,atExpiry,shiftVolatility,importSnapshot,historicalVolatility,chain,rankQuotes};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.PortfolioMath=api;
})(typeof globalThis==='undefined'?this:globalThis);
