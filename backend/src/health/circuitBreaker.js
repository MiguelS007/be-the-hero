/**
 * Minimal circuit breaker.
 *
 * States:
 *   - closed:   action is called normally; consecutive failures are counted
 *   - open:     short-circuits with a CircuitOpenError until resetTimeoutMs elapses
 *   - half-open: one trial call is allowed; success closes, failure re-opens
 *
 * Options:
 *   - failureThreshold (default 3)
 *   - resetTimeoutMs   (default 30_000)
 *   - timeoutMs        (default 2_000) — per-call timeout
 *   - name             (default 'breaker') — used in error messages
 */
const DEFAULTS = Object.freeze({
  failureThreshold: 3,
  resetTimeoutMs: 30_000,
  timeoutMs: 2_000,
  name: 'breaker',
});

class CircuitOpenError extends Error {
  constructor(name) {
    super(`circuit open for ${name}`);
    this.name = 'CircuitOpenError';
    this.code = 'CIRCUIT_OPEN';
  }
}

class CircuitTimeoutError extends Error {
  constructor(name, ms) {
    super(`timeout after ${ms}ms in ${name}`);
    this.name = 'CircuitTimeoutError';
    this.code = 'CIRCUIT_TIMEOUT';
  }
}

const withTimeout = (promise, ms, name) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new CircuitTimeoutError(name, ms)), ms);
    if (timer && typeof timer.unref === 'function') timer.unref();
    Promise.resolve()
      .then(() => promise)
      .then(
        (value) => { clearTimeout(timer); resolve(value); },
        (err) => { clearTimeout(timer); reject(err); },
      );
  });

const createCircuitBreaker = (action, options = {}) => {
  const cfg = { ...DEFAULTS, ...options };
  let state = 'closed';
  let failures = 0;
  let openedAt = 0;

  const recordSuccess = () => {
    failures = 0;
    state = 'closed';
  };

  const recordFailure = () => {
    failures += 1;
    if (failures >= cfg.failureThreshold) {
      state = 'open';
      openedAt = Date.now();
    }
  };

  const maybeReopen = () => {
    if (state === 'open' && Date.now() - openedAt >= cfg.resetTimeoutMs) {
      state = 'half-open';
    }
  };

  const fire = async (...args) => {
    maybeReopen();
    if (state === 'open') {
      throw new CircuitOpenError(cfg.name);
    }

    try {
      const result = await withTimeout(
        Promise.resolve().then(() => action(...args)),
        cfg.timeoutMs,
        cfg.name,
      );
      recordSuccess();
      return result;
    } catch (err) {
      recordFailure();
      throw err;
    }
  };

  return {
    fire,
    state: () => state,
    failures: () => failures,
    reset: () => { state = 'closed'; failures = 0; openedAt = 0; },
  };
};

createCircuitBreaker.CircuitOpenError = CircuitOpenError;
createCircuitBreaker.CircuitTimeoutError = CircuitTimeoutError;

module.exports = createCircuitBreaker;
