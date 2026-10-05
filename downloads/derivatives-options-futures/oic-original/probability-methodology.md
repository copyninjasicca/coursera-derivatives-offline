# Independent probability calculator

This module implements a documented geometric Brownian motion (GBM) model offline. It reproduces the kinds of outputs described in the saved [OIC guide](guides/probability-calculator.txt), but it does not assert numerical equality with IVolatility's proprietary calculator. The guide describes the inputs and output categories without publishing the detailed stochastic model, monitoring rule, day count, or formulas.

## Model and units

Let `S` be the current positive price, `r` the continuously compounded annual interest rate, `q` the continuous annual dividend yield, and `sigma` the annual volatility. Rates and volatility are decimals, so 3% is `0.03`. The implementation chooses

\[
S_t=S\exp\{(r-q-\sigma^2/2)t+\sigma W_t\}.
\]

This is a risk-neutral drift assumption, not an estimate of the stock's expected real-world return. Continuous yield replaces discrete dividend cash payments. Prices have continuous paths with constant volatility and carry. The lognormal representation and risk-neutral drift follow the model explained in [Karl Sigman's Columbia University GBM notes](https://www.columbia.edu/~ks20/FE-Notes/4700-07-Notes-GBM.pdf).

`calculate` accepts `driftConvention: 'risk-neutral'` (default) or `'zero-log'`. The explicit zero-log alternative uses `effectiveRate = q + sigma^2/2` for every terminal, touching and interval primitive, so the log drift is zero and the median remains at spot. In this alternative, entered interest rate and dividend yield do not drive the future distribution. The output `model` metadata preserves `inputRate` and `inputDividendYield`, identifies the chosen `driftConvention`, and reports `effectiveRate`, annual `logDrift`, `monitoring` and `dayCount`. Zero log drift is a comparison convention and vendor-engine hypothesis; it has not been proven to be the vendor's model. Tiny floating-point residuals around zero can remain after deriving the effective rate.

`years(days,hours,minutes)` converts the entered time using

\[
T=(\text{days}+\text{hours}/24+\text{minutes}/1440)/365.
\]

Hours and minutes represent literal remaining duration; no exchange calendar, business-day adjustment, session clock, timezone conversion, or leap-year adjustment is applied. `calculate` also accepts an explicit `time` in years. Touching is continuously monitored throughout the closed interval `[0,T]`, including the starting price.

## API

The source is [probability-math.js](../tools/probability-math.js). It exports CommonJS and sets the browser global `ProbabilityMath`. It has no dependency on `OptionMath`, network data, or external libraries.

```js
const result = ProbabilityMath.calculate({
  spot: 100, price1: 90, price2: 110,
  rate: 0.03, dividendYield: 0.02, volatility: 0.20,
  days: 180, hours: 12, minutes: 15
});
// result.time
// result.model: {driftConvention,inputRate,inputDividendYield,effectiveRate,
//                logDrift,monitoring,dayCount}
// result.terminal: {lower, upper, below, between, above}
// result.touching: {price1, price2, both, either, neither, numerical}
// result.intervals: {median, mean, logReturnMean, logReturnSd, levels}
// intervals.levels: [{standardDeviations, lower, upper, coverage}, ...]
// touching.numerical: {probability, method, terms, truncationBound}
```

All probabilities are fractions from zero to one. `numerical.probability` is the probability of surviving inside the two barriers; for nested targets, it is omitted. The lower-level functions are:

| Function | Purpose |
| --- | --- |
| `terminal(S,p1,p2,T,r,sigma,q=0)` | Strictly below the smaller target, between the targets inclusively, strictly above the larger target |
| `touch(S,H,T,r,sigma,q=0,direction='auto')` | One-sided touching; `auto` chooses the target's side relative to spot |
| `touching(S,p1,p2,T,r,sigma,q=0,options={})` | Target-level touching with input order preserved in `price1` and `price2` |
| `barriers(S,lower,upper,T,r,sigma,q=0,options={})` | Explicit lower/upper threshold events, including already-breached barriers |
| `survival(S,lower,upper,T,r,sigma,q=0,options={})` | Probability of remaining strictly inside an absorbing interval, with numerical metadata |
| `intervals(S,T,r,sigma,q=0,levels=[1,2,3])` | Log-price standard deviation intervals, mean and median |
| `cdf`, `sf`, `logCdf`, `logSf`, `normalInterval` | Normal-distribution numerical helpers |

Positive finite spot/targets, nonnegative finite time/volatility, and finite rates are required. Reversed targets are accepted by `terminal` and `touching`; explicit `barriers` and `survival` require ordered barriers. Invalid inputs or arithmetic beyond the supported floating-point range throw `RangeError`.

### Event conventions

An explicit lower barrier means `min(S_t) <= lower`; an explicit upper barrier means `max(S_t) >= upper`. An already-breached barrier therefore has probability one, even if its exact level was not crossed during the future interval. `touch` with an explicit direction follows this convention.

`touching` treats two entered prices as target levels. When both targets are above spot, reaching the farther upper target necessarily reaches the nearer one; the analogous rule holds below spot. Thus the joint probability is the smaller marginal, and the union probability is the larger marginal. A target equal to spot is touched at time zero. This distinction prevents applying a straddling-barrier formula to two targets on the same side.

At expiry or zero volatility, the path is deterministic. Below/above terminal probabilities are strict; the middle interval owns any boundary point mass. Touching includes equality. Deterministic log comparisons allow 16 machine epsilons of rounding when an endpoint is constructed from an exponential. This prevents numerical rounding from classifying an exactly reached deterministic target as missed.

## Terminal distribution and price intervals

Write `m = r-q-sigma^2/2`, `v = sigma*sqrt(T)`. For positive volatility and duration,

\[
P(S_T<H)=\Phi\left(\frac{\log(H/S)-mT}{v}\right).
\]

The implementation evaluates the interval and upper tail directly rather than subtracting rounded CDF values close to one. For example, the interval between eight and nine log-price standard deviations remains positive.

The `n`-standard-deviation interval is

\[
[S\exp(mT-nv),\ S\exp(mT+nv)],
\]

with coverage `Phi(n)-Phi(-n)`. These are standard deviations of **log price**. They are quantile intervals centered multiplicatively on the median `S*exp(mT)`, not additive intervals around the arithmetic mean `S*exp((r-q)T)`. They remain positive except for underflow at extreme inputs. Output prices can overflow at extreme inputs even when probabilities are computable.

## One-sided touching

For a target strictly above spot, set `a = log(H/S) > 0` and `d = m`. Below spot, reflect the process so `a = -log(H/S)` and `d = -m`. Then

\[
P(\tau_a\le T)=\Phi\left(\frac{dT-a}{\sigma\sqrt T}\right)
+\exp\left(\frac{2da}{\sigma^2}\right)
\Phi\left(\frac{-dT-a}{\sigma\sqrt T}\right).
\]

This is the drifted reflection-principle hitting law; see [University of Chicago lecture 25](https://www.stat.uchicago.edu/~yibi/teaching/stat317/2021/Lectures/Lecture25.pdf) and the drift-free reflection argument in [MIT lecture 7](https://ocw.mit.edu/courses/15-070j-advanced-stochastic-processes-fall-2013/aca1518a09539a09ddd37428ab0d0268_MIT15_070JF13_Lec7.pdf). Completing the square in the reflected term avoids multiplying an overflowing exponential by an underflowed tail.

## Joint probability: absorbing interval, not independence

For a lower target `L < S` and upper target `U > S`, let `N` be the probability that neither barrier is touched. The joint events obey

\[
P(\text{both})=P(\text{lower})+P(\text{upper})-1+N,
\quad P(\text{either})=P(\text{lower})+P(\text{upper})-P(\text{both}),
\quad P(\text{neither})=1-P(\text{either}).
\]

Multiplying the marginal hit probabilities would assume independence and is incorrect. The implementation obtains `N` by integrating the killed transition density over the interval. The relation between absorbing densities, first hitting and survival is explained in [Jonathan Goodman's NYU notes](https://math.nyu.edu/~goodman/teaching/StochCalc2012/notes/Week4.pdf); the eigenfunction construction with Dirichlet boundaries is covered in [Stanford Math 227 notes, chapter 5](https://math.stanford.edu/~ryzhik/STANFORD/STANF227-10/notes227-09.pdf). The following scaled formulas and numerical bounds are the implementation's derivation.

Scale log prices by `sigma*sqrt(T)`:

\[
A=\log(L/S)/v<0,\quad B=\log(U/S)/v>0,
\quad D=B-A,\quad h=mT/v.
\]

For `D >= 4`, integrate the method-of-images kernel

\[
p_h(y)=e^{hy-h^2/2}\sum_{k\in\mathbb Z}
[\phi(y+2kD)-\phi(y-2A+2kD)],\quad A<y<B.
\]

Odd reflections cancel at both boundaries; the sole initial delta inside the interval is at zero. Multiplying the drift-free kernel by the exponential tilt produces the drifted forward equation. For each shift `c`, the integrated image term is

\[
I(c)=e^{-hc}[\Phi(B+c-h)-\Phi(A+c-h)],
\quad N=\sum_k[I(2kD)-I(2kD-2A)].
\]

The code evaluates this in the log domain. Each omitted image is bounded by interval length times its maximum positive density. Subsequent images have a decreasing geometric ratio, giving an explicit bound on both signed tails. Symmetric image shells continue until this bound meets the requested tolerance.

For `D < 4`, the faster representation is the sine eigenfunction integral. Let `b_n=n*pi/D`, `E_A=h*A-h^2/2` and `E_B=h*B-h^2/2`:

\[
N=\frac{2}{D}\sum_{n=1}^{\infty}
\sin\left(\frac{-n\pi A}{D}\right)
\frac{b_n}{h^2+b_n^2}
[e^{E_A}-(-1)^n e^{E_B}]e^{-b_n^2/2}.
\]

This follows by integrating `exp(h*y)*sin(b_n*(y-A))` over `[A,B]`. The omitted absolute terms are bounded by

\[
2e^{\max(E_A,E_B)}
\frac{e^{-\alpha(N_{terms}+1)^2}}
{1-e^{-\alpha(2N_{terms}+3)}},\qquad
\alpha=\pi^2/(2D^2).
\]

The exponential decay makes this convergent. Selecting the image representation for wide intervals avoids slow early-time sine convergence. Survival is also bounded above by the probability of ending inside the interval. When that bound is already below tolerance, returning zero has a controlled absolute error and avoids problematic extreme-drift arithmetic.

The default tolerance is `1e-13`. `options.tolerance` may range from `1e-15` to `1e-5`. `numerical.truncationBound` describes the omitted-series or terminal-tail error only; it is not a certified total bound including normal-CDF approximation and floating-point arithmetic. Compensated summation reduces cancellation. Final joint values are projected onto the exact Frechet bounds to remove residual rounding/truncation violations.

Normal tails above seven sigma use a 100-level Laplace continued fraction, with its error-function counterpart documented by [NIST DLMF section 7.9](https://dlmf.nist.gov/7.9). Smaller arguments use the rational normal approximation already used by this workspace's independent option-math implementation. `logSf(40)` remains finite even though the probability itself underflows in double precision. Exact unit probabilities, values below representable range, and extreme price overflow are inherent floating-point limitations.

## Validation and unresolved vendor differences

Run the meaningful numerical tests from the workspace:

```sh
node test_probability_math.cjs
node test_probability_math.cjs --write-validation
```

The second command refreshes [probability-validation.json](probability-validation.json). Validation includes normal-CDF quadrature and reference tails, an independent convolution of first-exit flux with subsequent opposite-barrier hitting, quadrature refinement, a known symmetric survival series, both representation regimes and their transition, tolerance refinement, probability algebra and Frechet bounds, tails, deterministic/expiry/breached boundaries, same-side/reversed targets, and a seeded 120,000-path Brownian-bridge Monte Carlo check with sampling standard errors. Bridge extrema are sampled with exact one-sided marginals; the small remaining error from independent upper/lower draws within one segment is explicitly bounded by a reflection-principle union bound. The sample has 64 segments and a dependence-error bound about `2.95e-6`, much smaller than sampling standard errors.

The saved online case uses `S=100`, `r=3%`, `q=2%`, `sigma=20%`, and 180 days 12 hours 15 minutes. The independent model gives:

| Output | Saved vendor display | Independent model |
| --- | ---: | ---: |
| Terminal below / between / above | 23% / 52% / 25% | 23.7631% / 52.4388% / 23.7981% |
| Touch first / second | 45.38% / 49.8% | 46.5780% / 48.6147% |
| Both | 6.97% | 6.4400% |
| Either | 53.77% | 88.7528% |
| Neither | 46.23% | 11.2472% |

The displayed vendor marginals and both imply an ordinary union of `45.38+49.8-6.97 = 88.21%`, which differs materially from the displayed `53.77%`. Rounding cannot explain this gap. It may reflect another event convention, a vendor issue, or an observation/state issue; the available evidence does not resolve which. The saved output is preserved as evidence, not used as a golden reference. The vendor also shows different terminal standard deviation prices, so its centering and time/drift conventions remain unverified. No hidden correction or guessed vendor rule is embedded in the independent model.

### Zero-log-drift comparison hypothesis

The same saved inputs, without fitting a drift or changing the ACT/365 time, produce the following under the explicit zero-log convention. Residuals compare the unrounded model percentages with the displayed percentages in percentage points.

| Output | Zero-log model % | Saved display % | Residual pp | Agreement at display precision |
| --- | ---: | ---: | ---: | --- |
| Terminal below | 22.6896704114 | 23 | -0.3103295886 | Yes: integer % |
| Terminal between | 52.4106056666 | 52 | +0.4106056666 | Yes: integer % |
| Terminal above | 24.8997239220 | 25 | -0.1002760780 | Yes: integer % |
| Touch first | 45.3793408228 | 45.38 | -0.0006591772 | Yes: 0.01 pp |
| Touch second | 49.7994478440 | 49.8 | -0.0005521560 | Yes: also at 0.01 pp with trailing zero |
| Both | 6.4181420860 | 6.97 | -0.5518579140 | No: rounds to 6.42% |
| Either | 88.7606465807 | 53.77 | +34.9906465807 | No |
| Neither | 11.2393534193 | 46.23 | -34.9906465807 | No |

The terminal and one-sided matches support investigating a zero-log-drift convention. The joint mismatch remains, so this does not identify the proprietary engine. In particular, the saved `Both` value does not agree with this hypothesis at the displayed precision.

The spot-centered prices `S*exp(±n*sigma*sqrt(T))` also differ from every displayed vendor interval price:

| Standard deviations | Zero-log price | Saved price | Residual price | Model rounded price |
| --- | ---: | ---: | ---: | ---: |
| -3 | 65.5770037213 | 65.55 | +0.0270037213 | 65.58 |
| -2 | 75.4804324365 | 75.45 | +0.0304324365 | 75.48 |
| -1 | 86.8794753878 | 86.85 | +0.0294753878 | 86.88 |
| +1 | 115.1019841610 | 115.06 | +0.0419841610 | 115.10 |
| +2 | 132.4846675780 | 132.44 | +0.0446675780 | 132.48 |
| +3 | 152.4924810914 | 152.44 | +0.0524810914 | 152.49 |

Tests verify the alternative through independent zero-drift reflection quadrature and centered survival series, require exact rounding agreement for the matching display categories, and explicitly retain the nonmatching joint and interval values. Full unrounded residuals and display-precision comparisons are saved in `probability-validation.json`.
