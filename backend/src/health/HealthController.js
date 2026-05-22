/**
 * HealthController
 *
 * Thin HTTP boundary around HealthService. Returns JSON and the right
 * HTTP status code (200 / 503) — no business logic lives here.
 *
 * Intentional contract:
 *   - GET /health        →  always 200 if the process can answer
 *   - GET /health/ready  →  200 (healthy/degraded) or 503 (unhealthy)
 *
 * No authentication is applied; this is by design so a load balancer
 * or orchestrator can probe the service without credentials.
 */

const stripInternal = (payload) => {
  if (!payload || typeof payload !== 'object') return payload;
  const { httpStatus, ...rest } = payload;
  return rest;
};

const createHealthController = ({ service }) => {
  if (!service || typeof service.getLiveness !== 'function' || typeof service.getReadiness !== 'function') {
    throw new Error('HealthController requires a service with getLiveness/getReadiness');
  }

  const liveness = (req, res) => {
    const result = service.getLiveness();
    res.status(200).json(result);
  };

  const readiness = async (req, res) => {
    try {
      const result = await service.getReadiness();
      const status = typeof result.httpStatus === 'number' ? result.httpStatus : 200;
      res.status(status).json(stripInternal(result));
    } catch (_err) {
      // Defense in depth: never propagate raw errors to the wire.
      res.status(503).json({
        status: 'unhealthy',
        error: 'readiness check failed',
        timestamp: new Date().toISOString(),
      });
    }
  };

  return { liveness, readiness };
};

module.exports = createHealthController;
