const createCircuitBreaker = require('../circuitBreaker');

/**
 * ExternalServiceIndicator
 *
 * Probes an external HTTP service with a HEAD/GET. By default treated as
 * non-critical (e.g. Stripe / SendGrid) — failures degrade the system but
 * do NOT mark it unhealthy.
 *
 * Accepts an injected `probe()` so it can be unit-tested without real HTTP,
 * and so the implementation stays decoupled from any specific HTTP client.
 */
const SAFE_DOWN_ERROR = 'external service unavailable';

const createExternalServiceIndicator = ({
  name,
  probe,
  critical = false,
  timeoutMs = 2000,
} = {}) => {
  if (!name) throw new Error('ExternalServiceIndicator requires a name');
  if (typeof probe !== 'function') {
    throw new Error('ExternalServiceIndicator requires a probe() function');
  }

  const breaker = createCircuitBreaker(probe, {
    failureThreshold: 3,
    resetTimeoutMs: 30_000,
    timeoutMs,
    name,
  });

  return {
    name,
    critical,
    async check() {
      try {
        await breaker.fire();
        return { status: 'up' };
      } catch (err) {
        const label = err && err.code === 'CIRCUIT_TIMEOUT'
          ? `timeout while probing ${name}`
          : SAFE_DOWN_ERROR;
        return { status: 'down', error: label };
      }
    },
  };
};

module.exports = createExternalServiceIndicator;
