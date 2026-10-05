# Independent American option model

`../tools/american-math.js` is an independently written local numerical calculator. It does not contain the OIC pricing engine. The saved [OIC guide](guides/options-calculator.txt) states that its American calculator uses a 100-step binomial model. It does not establish the tree variant, probability convention, Greek method, day-count rules or cash-dividend algorithm. Selecting 100 steps here therefore does not establish numerical equivalence to OIC.

## API

The file exports `AmericanMath` in a browser and through CommonJS. Canonical object inputs are:

```js
const args = {
  S: 100, K: 100, T: 180 / 365,
  r: 0.05, sigma: 0.2, q: 0,
  steps: 100, exercise: 'american',
  dividends: [{ timeYears: 60 / 365, amount: 0.50 }]
};
AmericanMath.price('call', args);         // number, currency per share
AmericanMath.option(args);                // both prices, Greeks and metadata
AmericanMath.implied('put', 4.50, args);  // annual volatility as a decimal
AmericanMath.convergence(args);           // rows at 100, 400, 1000 steps
```

`S` and `K` must be positive; `T` and `sigma` must be nonnegative. `r` and `q` are continuously compounded annual decimal rates. `T` is fractional years; the UI can use calendar days divided by 365. `q` represents continuous proportional yield and cash dividends represent additional dated cash payments. Do not enter the same dividend through both inputs. `exercise` can be `american` or `european`, allowing comparison using the same numerical model.

Each cash dividend has exactly one time field: `timeYears`, `time` (an alias in years), or `days` (converted using 365), plus `amount` in currency per share. Amounts cannot be negative. Dates must be strictly after valuation. Dividends at or after expiry are excluded: this defines expiry exercise as occurring before a dividend at that exact time. Aggregate multiple payments on one date or submit them separately. The calculator sorts events and adds their amounts at the same grid node.

Steps must be an integer from 2 to 10,000. The default is 100. Complexity is quadratic in the number of steps and memory use is linear. Floating-point range limits produce an explicit error.

The positional overloads remain available:

```js
price(type, S, K, T, r, sigma, q = 0, options = {})
option(S, K, T, r, sigma, q = 0, options = {})
implied(type, target, S, K, T, r, q = 0, options = {})
```

`option()` returns `call`, `put`, `deltaCall`, `deltaPut`, `gammaCall`, `gammaPut`, `thetaCall`, `thetaPut`, `vegaCall`, `vegaPut`, `rhoCall`, `rhoPut`, `alphaCall`, `alphaPut`, and `meta`. American call and put gamma/vega can differ, so there is no shared gamma/vega field. Metadata discloses the model, actual steps, cash-event grid mapping, prepaid stock value and Greek method.

## Binomial process

The ordinary tree uses the classical exact-martingale CRR probability:

```
dt = T / N
u = exp(sigma * sqrt(dt)), d = 1 / u
p = (exp((r-q) * dt) - d) / (u-d)
continuation = exp(-r * dt) * ((1-p) * downValue + p * upValue)
American value = max(continuation, intrinsic exercise value)
```

This probability convention is stated explicitly because implementations bearing the CRR name can use different finite-step approximations. For example, [QuantLib's lattice source](https://github.com/lballabio/QuantLib/blob/master/ql/methods/lattices/binomialtree.cpp) uses a probability based on log-process drift. Finite grids can therefore differ even when they share the same continuous limit.

If a fixed grid gives a CRR probability outside `[0,1]`, usually at very low volatility or high carry, the implementation uses an explicitly disclosed martingale-centered equal-probability recombining tree:

```
a = sigma * sqrt(dt)
m = (r-q) * dt - log(cosh(a))
u = exp(m+a), d = exp(m-a), p = 1/2
```

Its mean stock growth is exactly `exp((r-q)*dt)`, and it approaches the deterministic carry path as volatility vanishes. It is a numerical fallback with the same continuous diffusion limit, not an identified OIC algorithm. A zero or numerically negligible volatility (at most `1e-12`) uses a deterministic exercise calculation, including stationary exercise times inside intervals. At expiry the price is intrinsic value.

## Explicit cash-dividend approximation

The calculator uses an **escrowed residual-stock approximation**. Let

```
A(t) = sum of future D_j * exp(-(r-q)*(t_j-t))
X(0) = S(0) - A(0)
S(t) = X(t) + A(t)
```

`X`, rather than the entire stock `S`, follows the lognormal tree with annual volatility `sigma` and drift `r-q`. The reserve grows at `r-q` between events; the stock loses the cash payment when the reserve is removed. This is consistent with the spot adjustment using the risk-free discount divided by the yield discount in [QuantLib's analytic dividend engine](https://github.com/lballabio/QuantLib/blob/master/ql/pricingengines/vanilla/analyticdividendeuropeanengine.cpp).

Each event is moved to the first grid node at or after its actual time. Its effective payment is `D * exp((r-q)*(gridTime-actualTime))`, preserving its time-zero reserve exactly. The event-node exercise calculation considers both the stock just before and just after the payment. At a final grid node, American exercise can occur before that mapped dividend, while European exercise uses the stock after the payment.

The stochastic volatility is on `X` without a compensating volatility adjustment. Consequently the full stock's instantaneous percentage volatility is `sigma*X/S`. This is a model approximation to a stock with fixed cash jumps and constant percentage volatility on its full value. It can produce material differences for large payments, short expiries near dividend dates, or small residual spot. Increasing steps reduces lattice and event-timing errors but does **not** remove the dividend-model approximation. The residual spot must be strictly positive. [Research by Vellekoop and Nieuwenhuis](https://ris.utwente.nl/ws/portalfiles/portal/121375612/Vellekoop2005consistent.pdf) discusses modeling limitations of escrowed cash dividends, including dependence on the chosen dividend horizon. This implementation uses only payments strictly before each option's expiry. In a multi-expiry portfolio, the resulting per-leg diffusion assumptions can differ; summing those leg prices is a scenario approximation and does not define one globally consistent cash-dividend process.

## Greeks and implied volatility

Delta uses first-level node values and stock spacing. Gamma uses the change in second-level deltas divided by the corresponding midpoint stock spacing. These avoid the zero/spiky gamma created by tiny spot bumps on a piecewise-linear lattice.

Theta uses the local pricing PDE in the continuation region:

```
thetaPerYear = r*value - (r-q)*S*delta - 0.5*sigma^2*X^2*gamma
theta = thetaPerYear / 365
```

Theta is the derivative with advancing calendar time at fixed spot; cash ex dates advance toward valuation. It is an instantaneous estimate, not the cash price jump on an ex date. Vega uses a central volatility bump of `max(0.0001, 0.005*sigma)`, capped at half the volatility. Rho uses a central rate bump of `0.0001`; its repricing includes the changed cash reserve. Both derivatives are divided by 100. Delta is per currency unit of spot, gamma is per squared currency unit, theta is currency/share/calendar-day, and vega/rho are currency/share/one percentage point. Alpha is gamma divided by daily theta and is `null` when theta is zero or unavailable.

If immediate exercise is optimal at valuation with positive intrinsic value, delta is `+1` for calls or `-1` for puts and gamma/theta/vega/rho are zero. At expiry or numerically zero volatility all Greeks are `null`. Greeks can oscillate near the exercise boundary and at cash-event grid changes; compare more than one step count when sensitivity matters.

IV uses bracketing and bisection in this same model and step count. Default price tolerance is `1e-8` currency/share and maximum volatility is 8 (800% annually); `priceTolerance` and `maxVolatility` (at most 16) can be supplied. Prices below the deterministic model lower bound or above the supported-volatility price are rejected. A price equal to a positive immediate-exercise lower bound has no unique IV and is rejected explicitly. A price equal to a zero lower bound returns 0, which is the smallest supported solution. Fixed-grid numerical effects can affect inversion near very low volatility or exercise plateaus.

## Numerical evidence

Run `node test_american_math.cjs` from the workspace. It regenerates [american-validation.json](american-validation.json), including every external reference input, expected value, actual value, tolerance, source link and signed error. The current suite covers 91 checks in six groups, including 100/400/1000-step convergence, 4000-step dividend checks, BSM call Greeks, put exercise, dividend effects, IV residuals, negative rates, browser exports and input limits. Public sources were read on 2026-10-05.

External values are from [QuantLib's American option tests](https://github.com/lballabio/QuantLib/blob/master/test-suite/americanoption.cpp), including cached Andersen/Lake/Offengenden research premiums and deterministic limits, and the [Hull cash-dividend case in its dividend tests](https://github.com/lballabio/QuantLib/blob/master/test-suite/dividendoption.cpp). The research premium checks allow `0.001` per share at 4000 steps; the cash reference is published to two decimals and allows `0.01`. These are independent reference checks, not observations of OIC outputs. The local BSM module supplies analytic comparisons and converts research premium vectors into absolute prices.
