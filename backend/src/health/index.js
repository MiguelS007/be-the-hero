/**
 * Health module wiring.
 *
 * Reads its dependencies (DB connection, env vars) ONLY at this layer so
 * the rest of the module stays unit-testable with stubs.
 */
const createHealthService = require('./HealthService');
const createHealthController = require('./HealthController');
const createDatabaseIndicator = require('./indicators/DatabaseIndicator');

const buildIndicators = ({ dbConnection }) => {
  const indicators = [];
  if (dbConnection) {
    indicators.push(createDatabaseIndicator({
      connection: dbConnection,
      timeoutMs: parseInt(process.env.HEALTH_CHECK_TIMEOUT_MS, 10) || 2000,
    }));
  }
  // Stripe / SendGrid probes are intentionally NOT wired here:
  // the current codebase has no client for them. They can be added
  // via createExternalServiceIndicator() when integration lands,
  // following the same `critical: false` pattern.
  return indicators;
};

const buildHealthModule = ({ dbConnection } = {}) => {
  const service = createHealthService({
    indicators: buildIndicators({ dbConnection }),
    version: process.env.APP_VERSION || require('../../package.json').version,
    environment: process.env.NODE_ENV || 'development',
    totalTimeoutMs: parseInt(process.env.HEALTH_TOTAL_TIMEOUT_MS, 10) || 3000,
  });

  const controller = createHealthController({ service });

  return { service, controller };
};

module.exports = buildHealthModule;
