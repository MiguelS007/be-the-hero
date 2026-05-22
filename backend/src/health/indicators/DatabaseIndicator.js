const createCircuitBreaker = require('../circuitBreaker');

/**
 * DatabaseIndicator
 *
 * Probes the database with a lightweight `SELECT 1` and reports up/down.
 * Critical: yes (a failed DB makes the application non-ready → readiness = 503).
 *
 * Security note: never echo raw driver errors back — they often include
 * the connection string, host, port, or credentials.
 */
const SAFE_DOWN_ERROR = 'Database connection failed';

const createDatabaseIndicator = ({ connection, timeoutMs = 2000 } = {}) => {
  if (!connection || typeof connection.raw !== 'function') {
    throw new Error('DatabaseIndicator requires a knex-like connection with .raw()');
  }

  const breaker = createCircuitBreaker(
    () => connection.raw('SELECT 1'),
    { failureThreshold: 3, resetTimeoutMs: 30_000, timeoutMs, name: 'database' },
  );

  return {
    name: 'database',
    critical: true,
    async check() {
      try {
        await breaker.fire();
        return { status: 'up' };
      } catch (err) {
        // Decide error label without leaking the underlying message.
        const label = err && err.code === 'CIRCUIT_TIMEOUT'
          ? 'timeout while probing database'
          : SAFE_DOWN_ERROR;
        return { status: 'down', error: label };
      }
    },
  };
};

module.exports = createDatabaseIndicator;
