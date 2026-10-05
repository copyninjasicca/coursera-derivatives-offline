# Independent portfolio and imported-data calculations

`tools/portfolio-math.js` exposes the same `PortfolioMath` API through CommonJS and `globalThis`. Load `option-math.js` before it in a browser; load `american-math.js` for American legs and European legs with cash dividends. CommonJS dependencies resolve lazily. This is an independent educational implementation informed by the archived primary OIC guides, not a copy of IVolatility's pricing service or data feed.

## Portfolio API

```js
PortfolioMath.value(legs, market, options)
PortfolioMath.scenario(legs, market, changes, options)
PortfolioMath.scenarios(legs, market, points, options)
PortfolioMath.atExpiry(legs, spot, {market, ...options})
PortfolioMath.shiftVolatility(base, change, 'relative' /* or 'absolute' */)
```

`legs` are all positions in one underlying. A stock leg is `{kind:'stock', quantity:100, entryPrice:95}`. Stock quantity counts shares and the multiplier is 1. An option leg is:

```json
{
  "kind": "option", "type": "call", "style": "american",
  "quantity": -1, "entryPrice": 5, "multiplier": 100,
  "strike": 100, "daysToExpiry": 30, "volatility": 0.20,
  "dividendYield": 0,
  "dividends": [{"timeYears": 0.05, "amount": 1}]
}
```

Positive quantity means long, negative means short; option quantity counts contracts. Defaults: option multiplier 100 and style European. `volatility` and `dividendYield` may be omitted to use market assumptions. Optional `symbol` must match `market.symbol` when both are present. Optional `id` is carried through. `daysToExpiry` is the baseline calendar-day count, shared by every scenario; an alternative `expiry:'YYYY-MM-DD'` needs `market.valuationDate`. If both are supplied, the day count is authoritative. Fractional day counts are supported. Negative baseline days are treated as expired. Cash dividend amounts are per underlying share; specify exactly one timing field per event: `timeYears`, `time` (years), or `days` (calendar days / 365). Normalized output uses `{time,amount}`. Scenario elapsed time advances dividend timing and retains only positive cash events strictly after valuation and strictly before the leg expiry, matching AmericanMath's schedule convention. Events exactly at valuation or expiry are excluded.

`market` is `{spot, rate:0, volatility:0.20, dividendYield:0, symbol?, valuationDate?}`. Rates, yields and volatility are decimal annualized inputs, so 20% is `0.20`; rate is continuously compounded. Model time uses calendar days / 365.

`value` returns signed `cost`, signed `value`, `pnl`, aggregate `greeks`, per-leg `legs`, normalized `market`, and `warnings`. Each leg includes `remainingDays`, `volatility`, `price`, `modelPrice`, `model`, `cost`, `value`, `pnl`, `unitGreeks`, and position `greeks`.

For leg quantity Q and multiplier M, cost = entry price × Q × M, value = current price × Q × M, and PnL = value − cost. A negative cost is entry credit. Stock value is spot × shares. Option expiry value is intrinsic × signed contracts × multiplier. Every Greek is multiplied by signed Q × M before aggregation. Delta is value change per underlying price unit, gamma is delta change per underlying price unit, theta is value change per calendar day, and vega/rho are value change per one absolute percentage point of volatility/rate. Expiry gamma and theta are undefined (`null`); expiry delta is undefined exactly at the strike. Any undefined Greek from a nonzero leg makes that aggregate Greek `null` rather than silently zero. Zero-quantity legs contribute zero.

European legs without active cash dividends use the existing BSM implementation and continuous dividend yield. European legs with active cash dividends use AmericanMath's escrowed-residual-stock lattice with `exercise:'european'`, preventing early exercise. American legs use the same sibling lattice with American exercise. Both cash-dividend paths share the disclosed approximation and type-specific lattice sensitivity methods. Their model labels identify the route. Once scenario time has elapsed beyond every scheduled dividend, a European leg uses BSM again. See [American model notes](american-model.md) for numerical limits, cash-dividend approximation, and low-volatility fallback. The escrow reserve includes dividends only before each leg's expiry, so the implied residual-stock diffusion differs across expiries. Portfolio summation is a per-leg scenario approximation, not a single globally consistent cash-dividend process. Stock dividend receipts, dividends already paid, interest on entry cash, exercise/assignment history, fees, spread execution, margin and taxes are omitted. For legs elapsed past expiry, the result deliberately uses intrinsic at the supplied scenario spot; a warning explains that historical expiry settlement and reinvestment are not assumed. Multiple expiries therefore describe hypothetical marks at the scenario spot, not a reconstructed cash-flow ledger.

`options` supports `steps` for lattice calculations, `priceOnly:true` for chart calculations, `useMarks:true`, and `pricingModel`. An injected model is a function receiving normalized `{kind,type,style,strike,spot,rate,volatility,dividendYield,daysToExpiry,time,dividends?,priceOnly}` and returning `{price,greeks:{delta,gamma,theta,vega,rho}}`, or the call/put and Greek-key structure of OptionMath/AmericanMath. Missing sensitivities become `null`. `priceOnly` directly calls AmericanMath's single-type price method for every lattice route, including European cash dividends; pre-expiry option sensitivities are `null`. `scenarios` computes its baseline once, making it the preferred curve API. `useMarks` uses a leg's optional imported/manual `markPrice` for value while retaining model Greeks, and supplies a warning; intrinsic expiry and scenario values ignore marks.

`changes` accepts `spot` or `{spotShift,spotMode:'relative'|'absolute'}`, nonnegative `elapsedDays`, `{volatilityShift,volatilityMode:'relative'|'absolute'}`, `rateShift`, and `dividendYield`. The IV shift applies independently to each leg's own baseline IV. For example, `shiftVolatility(.20,.10,'relative')` = `.22`, while `shiftVolatility(.20,.10,'absolute')` = `.30`. Invalid negative shifted IV is rejected. Relative spot shifts are decimal fractions; absolute shifts are price units. Scenario output adds `baselineValue`, `baselinePnl`, and `valueChange`. `scenarios` accepts an array of numeric spots or scenario objects. `atExpiry` sets every option to zero days and uses stock spot; it describes joint intrinsic payoff rather than each historical expiry event.

## Local JSON snapshot schema

```json
{
  "schemaVersion": 1,
  "source": "User supplied example; not live market data",
  "asOf": "2026-10-05",
  "prices": [
    {"symbol":"EXAMPLE", "date":"2026-10-01", "close":100, "volume":1000},
    {"symbol":"EXAMPLE", "date":"2026-10-02", "close":102, "volume":1200},
    {"symbol":"EXAMPLE", "date":"2026-10-05", "close":101, "volume":900}
  ],
  "quotes": [
    {"symbol":"EXAMPLE", "type":"call", "expiry":"2026-11-04", "strike":100,
     "style":"american", "bid":4, "ask":5, "iv":0.20, "volume":10, "openInterest":100}
  ]
}
```

This fixture is illustrative and has no asserted market provenance. `importSnapshot(JSON string or object)` validates and copies recognized fields; it does not execute content. Price rows require `symbol`, real calendar `date`, and positive `close` (alias `price`). Optional fields: positive `open`, `high`, `low`, `adjustedClose`, and nonnegative `volume`. Available OHLC bounds are checked. Quote rows require `symbol`, `date` (defaults to `asOf`), and `type:'stock'|'call'|'put'` (stock default). Options require positive strike and expiry date; style defaults European and multiplier defaults 100. Optional nonnegative fields: `bid`, `ask`, `last`, `mark`, `iv`, `volume`, `openInterest`. At least one price or imported IV must be supplied. Bid cannot exceed ask. Stock quote IV is rejected. IV is a decimal contract-level imported observation, not a computed proprietary index. Dates are strict YYYY-MM-DD, with no ambiguous local timestamps. Duplicate prices by symbol/date and duplicate quotes by symbol/date/type/expiry/strike are rejected. Arrays are sorted by symbol and ascending date. Safe decimal numeric strings are accepted; blanks, booleans, null, infinity, NaN, expressions and executable text are rejected. Unknown fields are ignored. Text is limited to plain strings up to 160 characters. JSON text is capped at 10 MB and each collection at 100,000 rows.

`chain(snapshot,{symbol?,expiry?,date?})` returns imported option rows at the requested date, defaulting to the latest available filtered date. Derived fields are `mid` (requires bid and ask), `spread`, `spreadPct` (spread/mid × 100, null at zero mid), `ivPercent`, calendar `daysToExpiry`, and `dataSource`. Quotes do not carry forward across missing dates. `rankQuotes(snapshot,{symbol?,expiry?,date?,sortBy:'iv'|'volume'|'openInterest'|'mid'|'spread'|'spreadPct',direction:'descending'|'ascending'})` sorts contract rows with the selected field present and supplies rank. Default order is descending imported IV. These are rankings of the imported snapshot's contracts, not a claim about market-wide top symbols. No live quotes, implied-volatility interpolation, exchange metadata or proprietary IVX/IV30 is fabricated.

## Historical volatility

`historicalVolatility(prices,{symbol?,window?,tradingDaysPerYear:252,divisor:'sample'|'population',priceField:'close'|'adjustedClose'})` accepts numeric prices in their supplied order or dated price rows. Dated rows are sorted; duplicate dates fail. A multisymbol history requires a symbol selection. `window` is the number of most recent returns, requiring window + 1 prices; its default uses all available returns. Default divisor is sample, needing at least two returns. Selecting adjusted close requires that field in every selected row.

For each consecutive observation, r_i = ln(P_i / P_(i−1)); the return mean is removed. Variance = Σ(r_i − mean)² / (n−1) for sample or / n for population. Annualized HV = √(variance × tradingDaysPerYear). Return fields disclose volatility as decimal and percent, variance, daily standard deviation, mean, return array/count, price count, divisor, annualization, selected dates and price field. `window:20` gives a 20-return HV requiring 21 prices. The source guide specifies annualization and HV20 but does not specify its exact divisor, return formula, or trading-day convention; these are explicit independent choices here.

The calculation uses adjacent imported observations, without inventing missing prices or weighting irregular gaps. Use complete daily trading observations and suitable adjusted closes for corporate actions when interpreting daily HV. This module does not compute a historical implied-volatility curve from price history.

## Source and validation record

Primary archived references: [OIC PnL Simulator description](https://www.optionseducation.org/toolsoptionquotes/pnl-calculator), [archived PnL guide text](guides/pnl-calculator.txt), [OIC Historical and Implied Volatility description](https://www.optionseducation.org/toolsoptionquotes/historical-and-implied-volatility-new), and [archived volatility guide text](guides/historical-and-implied-volatility-new.txt). The PnL guide directly establishes signed position quantities, contract size 100 by default, multiplied Greeks, relative/absolute volatility examples, elapsed time scenarios and European BSM/American CRR distinctions. The volatility guide establishes annualized HV and the price/volume history display. No source claims an exact offline reproduction of the remote proprietary service.

Run `node test_portfolio_math.cjs` from the workspace root. It records test results in `portfolio-validation.json`, covering hand-calculated signed payoff totals, BSM and American sensitivities, European cash-dividend price/Greek parity against AmericanMath's European-exercise lattice, dividend elapsed-time and expiry-boundary handling, multiplier scaling, both IV shift modes, dividend timing aliases, shared-baseline price-only curves, expired-leg treatment, dates/duplicates/unsafe input rejection, quote chain/rank derivations, and sample/population HV against known log returns.
