(function (root) {
  'use strict';
  // Independent implementation. See ../oic-original/american-model.md.
  const MAX_STEPS = 10000;
  const intrinsic = (type, S, K) => Math.max(type === 'call' ? S - K : K - S, 0);
  function objectArgs(values, implied) {
    if (values[0] && typeof values[0] === 'object') return { ...values[0] };
    const [S, K, T, r, fifth, sixth, seventh] = values;
    return implied ? { S, K, T, r, q: fifth === undefined ? 0 : fifth, ...(sixth || {}) }
      : { S, K, T, r, sigma: fifth, q: sixth === undefined ? 0 : sixth, ...(seventh || {}) };
  }
  function normalize(raw, needVol = true) {
    const a = { q: 0, sigma: 0, steps: 100, exercise: 'american', dividends: [], ...raw };
    if (![a.S, a.K, a.T, a.r, a.q].every(Number.isFinite) || a.S <= 0 || a.K <= 0 || a.T < 0)
      throw Error('Spot and strike must be positive, expiry nonnegative, and rates finite.');
    if (needVol && (!Number.isFinite(a.sigma) || a.sigma < 0)) throw Error('Volatility must be finite and nonnegative.');
    if (!Number.isInteger(a.steps) || a.steps < 2 || a.steps > MAX_STEPS) throw Error('Steps must be an integer from 2 to 10000.');
    if (!['american', 'european'].includes(a.exercise)) throw Error('Exercise must be american or european.');
    if (!Array.isArray(a.dividends)) throw Error('Dividends must be an array of dated cash amounts.');
    a.dividends = a.dividends.map(d => {
      if (!d || typeof d !== 'object') throw Error('Invalid cash dividend.');
      const fields = ['timeYears', 'time', 'days'].filter(k => d[k] !== undefined);
      if (fields.length !== 1) throw Error('Each dividend needs exactly one of timeYears, time, or days.');
      const timeYears = fields[0] === 'days' ? d.days / 365 : d[fields[0]];
      if (!Number.isFinite(timeYears) || timeYears <= 0 || !Number.isFinite(d.amount) || d.amount < 0)
        throw Error('Dividend times must be positive and cash amounts nonnegative.');
      return { timeYears, amount: d.amount };
    }).filter(d => d.amount > 0 && d.timeYears < a.T).sort((x, y) => x.timeYears - y.timeYears);
    if (Math.max(Math.abs(a.r * a.T), Math.abs((a.r - a.q) * a.T), a.sigma * Math.sqrt(a.T * a.steps)) > 650)
      throw Error('Inputs exceed the supported floating-point lattice range.');
    return a;
  }
  function checkType(type) { if (!['call', 'put'].includes(type)) throw Error('Choose call or put.'); }
  function prepare(a) {
    const dt = a.T / a.steps, carry = a.r - a.q;
    const cash = new Float64Array(a.steps + 1);
    const mapped = a.dividends.map(d => {
      const step = Math.min(a.steps, Math.max(1, Math.ceil(d.timeYears / dt - 1e-12)));
      // Moving the event to the next grid node preserves its present value.
      const amount = d.amount * Math.exp(carry * (step * dt - d.timeYears));
      cash[step] += amount;
      return { ...d, step, effectiveTimeYears: step * dt, effectiveAmount: amount };
    });
    const reserve = new Float64Array(a.steps + 1);
    for (let i = a.steps - 1; i >= 0; --i) reserve[i] = (reserve[i + 1] + cash[i + 1]) * Math.exp(-carry * dt);
    const X = a.S - reserve[0];
    if (X <= 0) throw Error('Present value of cash dividends must be smaller than spot for the escrowed-dividend approximation.');
    return { dt, carry, cash, reserve, X, mapped };
  }
  function deterministic(type, a, p) {
    const terminal = intrinsic(type, p.X * Math.exp(p.carry * a.T) + p.reserve[a.steps], a.K);
    if (a.exercise === 'european') return terminal * Math.exp(-a.r * a.T);
    let best = intrinsic(type, a.S, a.K);
    // Exercise at every grid node, before and after each mapped cash payment.
    for (let i = 1; i <= a.steps; ++i) {
      const t = i * p.dt, post = p.X * Math.exp(p.carry * t) + p.reserve[i];
      best = Math.max(best, Math.exp(-a.r * t) * intrinsic(type, post, a.K), Math.exp(-a.r * t) * intrinsic(type, post + p.cash[i], a.K));
    }
    // The only possible stationary time in each deterministic inter-dividend interval.
    let start = 0;
    const ends = [...new Set(p.mapped.map(d => d.step)), a.steps];
    for (const end of ends) {
      const t0 = start * p.dt, t1 = end * p.dt;
      const C = p.X + p.reserve[start] * Math.exp(-p.carry * t0);
      const ratio = a.r * a.K / (a.q * C);
      if (p.carry !== 0 && ratio > 0 && Number.isFinite(ratio)) {
        const t = Math.log(ratio) / p.carry;
        if (t > t0 && t < t1) best = Math.max(best, Math.exp(-a.r * t) * intrinsic(type, C * Math.exp(p.carry * t), a.K));
      }
      start = end;
    }
    return best;
  }
  function lattice(type, a) {
    checkType(type);
    if (a.T === 0) return { value: intrinsic(type, a.S, a.K), delta: null, gamma: null, model: 'expiry', rootExercise: false, mapped: [], X: a.S };
    if (a.sigma * Math.sqrt(a.T * a.steps) > 650) throw Error('Inputs exceed the supported floating-point lattice range.');
    const p = prepare(a);
    if (a.sigma <= 1e-12) return { value: deterministic(type, a, p), delta: null, gamma: null, model: 'deterministic', rootExercise: false, mapped: p.mapped, X: p.X };
    const jump = a.sigma * Math.sqrt(p.dt);
    let shift = 0;
    let prob = Math.expm1(p.carry * p.dt + jump) / Math.expm1(2 * jump);
    let model = 'CRR';
    // CRR cannot have valid probabilities at very low vol/high carry on a fixed grid.
    // A martingale-centered, equal-probability recombining tree has the same limit.
    if (!Number.isFinite(prob) || prob < 0 || prob > 1) {
      shift = p.carry * p.dt - (jump + Math.log1p(Math.exp(-2 * jump)) - Math.LN2);
      prob = 0.5;
      model = 'martingale-centered low-volatility fallback';
    }
    const discount = Math.exp(-a.r * p.dt), values = new Float64Array(a.steps + 1);
    const stock = (i, j) => p.X * Math.exp(i * shift + (2 * j - i) * jump) + p.reserve[i];
    for (let j = 0; j <= a.steps; ++j) {
      const S = stock(a.steps, j);
      values[j] = intrinsic(type, S, a.K);
      if (a.exercise === 'american') values[j] = Math.max(values[j], intrinsic(type, S + p.cash[a.steps], a.K));
    }
    let level1, level2, rootContinuation, rootExercise = false;
    if (a.steps === 2) level2 = Array.from(values);
    for (let i = a.steps - 1; i >= 0; --i) {
      for (let j = 0; j <= i; ++j) {
        const continuation = discount * ((1 - prob) * values[j] + prob * values[j + 1]);
        values[j] = continuation;
        if (a.exercise === 'american') {
          const S = stock(i, j);
          values[j] = Math.max(continuation, intrinsic(type, S, a.K), intrinsic(type, S + p.cash[i], a.K));
        }
        if (i === 0) rootContinuation = continuation;
      }
      if (i === 2) level2 = Array.from(values.slice(0, 3));
      if (i === 1) level1 = Array.from(values.slice(0, 2));
    }
    let delta = (level1[1] - level1[0]) / (stock(1, 1) - stock(1, 0));
    const downDelta = (level2[1] - level2[0]) / (stock(2, 1) - stock(2, 0));
    const upDelta = (level2[2] - level2[1]) / (stock(2, 2) - stock(2, 1));
    let gamma = (upDelta - downDelta) / ((stock(2, 2) - stock(2, 0)) / 2);
    const exerciseValue = intrinsic(type, a.S, a.K);
    if (a.exercise === 'american' && exerciseValue > 0 && exerciseValue >= rootContinuation - 1e-12) {
      rootExercise = true;
      delta = type === 'call' ? 1 : -1;
      gamma = 0;
    }
    if (![values[0], delta, gamma].every(Number.isFinite)) throw Error('Lattice overflow or numerically unresolved stock jumps.');
    return { value: values[0], delta, gamma, model, rootExercise, mapped: p.mapped, X: p.X };
  }
  function price(type, ...args) { return lattice(type, normalize(objectArgs(args))).value; }
  function option(...args) {
    const a = normalize(objectArgs(args)), result = {}, models = new Set();
    for (const type of ['call', 'put']) {
      const suffix = type === 'call' ? 'Call' : 'Put', base = lattice(type, a);
      result[type] = base.value;
      result['delta' + suffix] = base.delta;
      result['gamma' + suffix] = base.gamma;
      models.add(base.model);
      let theta = null, vega = null, rho = null;
      if (a.T > 0 && a.sigma > 1e-12) {
        if (base.rootExercise) theta = vega = rho = 0;
        else {
          const hv = Math.min(a.sigma / 2, Math.max(0.0001, a.sigma * 0.005)), hr = 0.0001;
          vega = (lattice(type, { ...a, sigma: a.sigma + hv }).value - lattice(type, { ...a, sigma: a.sigma - hv }).value) / (2 * hv * 100);
          rho = (lattice(type, { ...a, r: a.r + hr }).value - lattice(type, { ...a, r: a.r - hr }).value) / (2 * hr * 100);
          // Local pricing PDE; residual stock X carries the diffusion in this approximation.
          theta = (a.r * base.value - (a.r - a.q) * a.S * base.delta - 0.5 * a.sigma * a.sigma * base.X * base.X * base.gamma) / 365;
        }
      }
      result['theta' + suffix] = theta;
      result['vega' + suffix] = vega;
      result['rho' + suffix] = rho;
      result['alpha' + suffix] = theta === null || theta === 0 ? null : base.gamma / theta;
      if (type === 'call') result.meta = { steps: a.steps, exercise: a.exercise, dividendModel: 'escrowed-residual-stock approximation', dividendSchedule: base.mapped, prepaidSpot: base.X, greekMethod: 'lattice delta/gamma; PDE theta/day; central-bump vega/rho per 1pp' };
    }
    result.meta.models = [...models];
    return result;
  }
  function implied(type, target, ...args) {
    checkType(type);
    const raw = objectArgs(args, true), a = normalize({ ...raw, sigma: 0 });
    if (!Number.isFinite(target) || target < 0 || a.T <= 0) throw Error('Implied volatility needs a nonnegative price and positive expiry.');
    const tolerance = raw.priceTolerance === undefined ? 1e-8 : raw.priceTolerance;
    const maxVol = raw.maxVolatility === undefined ? 8 : raw.maxVolatility;
    if (!Number.isFinite(tolerance) || tolerance <= 0 || !Number.isFinite(maxVol) || maxVol <= 0 || maxVol > 16)
      throw Error('Price tolerance must be positive and maximum volatility in (0,16].');
    const zero = lattice(type, a).value;
    if (target < zero - tolerance) throw Error('Market price is below the zero-volatility model bound.');
    if (Math.abs(target - zero) <= tolerance) {
      if (a.exercise === 'american' && zero > 0 && Math.abs(zero - intrinsic(type, a.S, a.K)) <= tolerance)
        throw Error('Implied volatility is not uniquely identifiable at the immediate-exercise price.');
      return 0;
    }
    let lo = 0, hi = Math.min(0.5, maxVol);
    while (lattice(type, { ...a, sigma: hi }).value < target && hi < maxVol) hi = Math.min(maxVol, 2 * hi);
    if (lattice(type, { ...a, sigma: hi }).value < target - tolerance) throw Error('No implied volatility within the supported range.');
    for (let i = 0; i < 100; ++i) {
      const mid = (lo + hi) / 2, value = lattice(type, { ...a, sigma: mid }).value;
      if (Math.abs(value - target) <= tolerance) return mid;
      if (value < target) lo = mid; else hi = mid;
    }
    const sigma = (lo + hi) / 2;
    if (Math.abs(lattice(type, { ...a, sigma }).value - target) > tolerance * 2) throw Error('Lattice IV did not converge to the requested price tolerance.');
    return sigma;
  }
  function convergence(args, levels = [100, 400, 1000]) {
    let previous;
    return levels.map(steps => {
      const a = normalize({ ...args, steps }), row = { steps, call: lattice('call', a).value, put: lattice('put', a).value };
      row.callChange = previous ? row.call - previous.call : null;
      row.putChange = previous ? row.put - previous.put : null;
      previous = row;
      return row;
    });
  }
  const api = { price, option, implied, convergence, MAX_STEPS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AmericanMath = api;
})(typeof globalThis === 'undefined' ? this : globalThis);
