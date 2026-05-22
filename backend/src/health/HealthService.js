/**
 * HealthService
 *
 * Orchestrates the configured indicators.
 *
 * - getLiveness(): synchronous, returns the process-level status.
 *   Used for /health (load balancer liveness probe). MUST be fast (<100ms p95).
 *
 * - getReadiness(): async, fans out to all indicators in parallel and aggregates.
 *   Used for /health/ready (deeper check). MUST stay under ~300ms p95.
 *
 * Status semantics:
 *   - healthy:   every indicator returned status=up
 *   - degraded:  every CRITICAL indicator is up, but at least one non-critical down
 *   - unhealthy: at least one critical indicator is down  → httpStatus 503
 *
 * Security: this layer is the last place where indicator-level error
 * strings flow before reaching the wire. It scrubs anything that looks like
 * a secret to defense-in-depth against indicators that ignore the contract.
 */

const SECRET_PATTERNS = [
  /postgres(ql)?:\/\/[^\s"']+/gi,
  /mysql:\/\/[^\s"']+/gi,
  /redis:\/\/[^\s"']+/gi,
  /mongodb(\+srv)?:\/\/[^\s"']+/gi,
  /password\s*[:=]\s*[^\s"',}]+/gi,
  /sk_(test|live)_[a-zA-Z0-9]+/g,
  /SG\.[a-zA-Z0-9_\-.]+/g,
  /Bearer\s+[A-Za-z0-9._\-]+/g,
];

const scrub = (value) => {
  if (typeof value !== 'string') return value;
  return SECRET_PATTERNS.reduce((acc, re) => acc.replace(re, '[REDACTED]'), value);
};

const scrubDeep = (obj) => {
  if (obj == null) return obj;
  if (typeof obj === 'string') return scrub(obj);
  if (Array.isArray(obj)) return obj.map(scrubDeep);
  if (typeof obj === 'object') {
    const out = {};
    for (const k of Object.keys(obj)) out[k] = scrubDeep(obj[k]);
    return out;
  }
  return obj;
};

const nowIso = () => new Date().toISOString();

const createHealthService = ({
  indicators = [],
  version = process.env.APP_VERSION || '0.0.0',
  environment = process.env.NODE_ENV || 'development',
  totalTimeoutMs = 3000,
  logger = null,
} = {}) => {
  const safeLog = (level, msg, extra) => {
    if (logger && typeof logger[level] === 'function') {
      try { logger[level](msg, extra); } catch (_) { /* never throw from logger */ }
    }
  };

  const getLiveness = () => ({
    status: 'healthy',
    timestamp: nowIso(),
    version,
    environment,
  });

  const runOne = async (indicator) => {
    try {
      const result = await indicator.check();
      return { name: indicator.name, critical: !!indicator.critical, result };
    } catch (err) {
      safeLog('warn', 'health.indicator.error', { indicator: indicator.name });
      return {
        name: indicator.name,
        critical: !!indicator.critical,
        result: { status: 'down', error: 'indicator threw' },
      };
    }
  };

  const withGlobalTimeout = (promise) => {
    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve({ __timedOut: true }), totalTimeoutMs);
      if (timer && typeof timer.unref === 'function') timer.unref();
    });
    return Promise.race([promise, timeout]).then(
      (value) => { if (timer) clearTimeout(timer); return value; },
      (err) => { if (timer) clearTimeout(timer); throw err; },
    );
  };

  const getReadiness = async () => {
    const startedAt = Date.now();
    const settled = await withGlobalTimeout(Promise.all(indicators.map(runOne)));

    const timestamp = nowIso();
    if (settled && settled.__timedOut) {
      return scrubDeep({
        status: 'unhealthy',
        httpStatus: 503,
        timestamp,
        version,
        environment,
        checks: {},
        error: 'readiness check exceeded total timeout',
        durationMs: Date.now() - startedAt,
      });
    }

    const checks = {};
    const warnings = [];
    let criticalDown = false;
    let nonCriticalDown = false;

    for (const { name, critical, result } of settled) {
      checks[name] = result.status;
      if (result.status === 'down') {
        if (critical) {
          criticalDown = true;
        } else {
          nonCriticalDown = true;
          warnings.push(`${name} service unavailable`);
        }
      }
    }

    let status;
    let httpStatus;
    if (criticalDown) {
      status = 'unhealthy';
      httpStatus = 503;
    } else if (nonCriticalDown) {
      status = 'degraded';
      httpStatus = 200;
    } else {
      status = 'healthy';
      httpStatus = 200;
    }

    const payload = {
      status,
      httpStatus,
      timestamp,
      version,
      environment,
      checks,
      durationMs: Date.now() - startedAt,
    };
    if (warnings.length) payload.warnings = warnings;
    if (criticalDown) {
      const downCritical = settled
        .filter((s) => s.critical && s.result.status === 'down')
        .map((s) => s.name);
      payload.error = `critical dependency down: ${downCritical.join(', ')}`;
    }

    return scrubDeep(payload);
  };

  return { getLiveness, getReadiness };
};

module.exports = createHealthService;
module.exports.__test = { scrub, scrubDeep };
