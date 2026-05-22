const createHealthService = require('../HealthService');

const makeIndicator = (name, status, opts = {}) => ({
  name,
  critical: opts.critical !== false,
  check: jest.fn().mockResolvedValue({ status }),
});

describe('HealthService', () => {
  describe('getLiveness', () => {
    it('returns healthy with version/environment/timestamp', () => {
      const svc = createHealthService({
        indicators: [],
        version: '1.2.3',
        environment: 'dev',
      });

      const result = svc.getLiveness();

      expect(result.status).toBe('healthy');
      expect(result.version).toBe('1.2.3');
      expect(result.environment).toBe('dev');
      expect(typeof result.timestamp).toBe('string');
      expect(() => new Date(result.timestamp).toISOString()).not.toThrow();
    });

    it('is fast (synchronous, well under 100ms)', () => {
      const svc = createHealthService({ indicators: [], version: '1.0.0', environment: 'dev' });
      const start = Date.now();
      svc.getLiveness();
      expect(Date.now() - start).toBeLessThan(20);
    });
  });

  describe('getReadiness', () => {
    it('returns healthy + 200 when all critical indicators are up', async () => {
      const svc = createHealthService({
        indicators: [
          makeIndicator('database', 'up'),
          makeIndicator('stripe', 'up', { critical: false }),
        ],
        version: '1.0.0',
        environment: 'dev',
      });

      const result = await svc.getReadiness();

      expect(result.status).toBe('healthy');
      expect(result.httpStatus).toBe(200);
      expect(result.checks).toEqual({ database: 'up', stripe: 'up' });
    });

    it('returns unhealthy + 503 when a critical indicator is down', async () => {
      const svc = createHealthService({
        indicators: [
          makeIndicator('database', 'down'),
          makeIndicator('stripe', 'up', { critical: false }),
        ],
        version: '1.0.0',
        environment: 'prod',
      });

      const result = await svc.getReadiness();

      expect(result.status).toBe('unhealthy');
      expect(result.httpStatus).toBe(503);
      expect(result.checks.database).toBe('down');
      expect(result.error).toBeDefined();
    });

    it('returns degraded + 200 when only non-critical indicator is down', async () => {
      const svc = createHealthService({
        indicators: [
          makeIndicator('database', 'up'),
          makeIndicator('stripe', 'down', { critical: false }),
        ],
        version: '1.0.0',
        environment: 'dev',
      });

      const result = await svc.getReadiness();

      expect(result.status).toBe('degraded');
      expect(result.httpStatus).toBe(200);
      expect(result.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/stripe/i)]));
    });

    it('runs indicators in parallel (total ~= max, not sum)', async () => {
      const slow = (name, ms) => ({
        name,
        critical: true,
        check: () => new Promise((resolve) => setTimeout(() => resolve({ status: 'up' }), ms)),
      });
      const svc = createHealthService({
        indicators: [slow('a', 80), slow('b', 80), slow('c', 80)],
        version: '1.0.0',
        environment: 'dev',
      });

      const start = Date.now();
      await svc.getReadiness();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(200); // 80ms in parallel, NOT 240ms in serial
    });

    it('does not leak secrets/connection strings in the response payload', async () => {
      const svc = createHealthService({
        indicators: [
          { name: 'database', critical: true, check: async () => ({ status: 'down', error: 'connection refused at postgres://admin:hunter2@db:5432' }) },
        ],
        version: '1.0.0',
        environment: 'dev',
      });

      const result = await svc.getReadiness();
      const payload = JSON.stringify(result);

      expect(payload).not.toMatch(/hunter2/);
      expect(payload).not.toMatch(/postgres:\/\//);
    });
  });
});
