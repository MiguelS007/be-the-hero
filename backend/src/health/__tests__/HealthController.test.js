const express = require('express');
const request = require('supertest');
const createHealthController = require('../HealthController');

const buildApp = (controller) => {
  const app = express();
  app.get('/health', controller.liveness);
  app.get('/health/ready', controller.readiness);
  return app;
};

const stubService = ({ liveness, readiness }) => ({
  getLiveness: jest.fn().mockReturnValue(liveness),
  getReadiness: jest.fn().mockResolvedValue(readiness),
});

describe('HealthController (HTTP)', () => {
  it('GET /health returns 200 + JSON body with healthy status', async () => {
    const service = stubService({
      liveness: {
        status: 'healthy',
        timestamp: '2026-05-22T00:00:00.000Z',
        version: '1.0.0',
        environment: 'dev',
      },
      readiness: { status: 'healthy', httpStatus: 200, checks: {} },
    });
    const controller = createHealthController({ service });
    const app = buildApp(controller);

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.status).toBe('healthy');
    expect(res.body.version).toBe('1.0.0');
    expect(res.body.environment).toBe('dev');
    expect(res.body.timestamp).toBeDefined();
  });

  it('GET /health/ready returns 200 when healthy', async () => {
    const service = stubService({
      liveness: { status: 'healthy', timestamp: 't', version: '1.0.0', environment: 'dev' },
      readiness: {
        status: 'healthy',
        httpStatus: 200,
        checks: { database: 'up' },
        timestamp: 't',
        version: '1.0.0',
        environment: 'dev',
      },
    });
    const controller = createHealthController({ service });
    const app = buildApp(controller);

    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.checks).toEqual({ database: 'up' });
  });

  it('GET /health/ready returns 503 when critical dependency is down', async () => {
    const service = stubService({
      liveness: { status: 'healthy', timestamp: 't', version: '1.0.0', environment: 'prod' },
      readiness: {
        status: 'unhealthy',
        httpStatus: 503,
        checks: { database: 'down' },
        error: 'Database connection failed',
        timestamp: 't',
        version: '1.0.0',
        environment: 'prod',
      },
    });
    const controller = createHealthController({ service });
    const app = buildApp(controller);

    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('unhealthy');
    expect(res.body.checks.database).toBe('down');
  });

  it('GET /health/ready returns 200 with degraded when non-critical is down', async () => {
    const service = stubService({
      liveness: { status: 'healthy', timestamp: 't', version: '1.0.0', environment: 'dev' },
      readiness: {
        status: 'degraded',
        httpStatus: 200,
        checks: { database: 'up', stripe: 'down' },
        warnings: ['stripe service unavailable'],
        timestamp: 't',
        version: '1.0.0',
        environment: 'dev',
      },
    });
    const controller = createHealthController({ service });
    const app = buildApp(controller);

    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('degraded');
    expect(res.body.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/stripe/i)]));
  });

  it('does NOT require authentication on /health or /health/ready', async () => {
    // Reaching the handler without any auth header proves no middleware blocks it.
    const service = stubService({
      liveness: { status: 'healthy', timestamp: 't', version: '1.0.0', environment: 'dev' },
      readiness: { status: 'healthy', httpStatus: 200, checks: {}, timestamp: 't', version: '1.0.0', environment: 'dev' },
    });
    const controller = createHealthController({ service });
    const app = buildApp(controller);

    const live = await request(app).get('/health');
    const ready = await request(app).get('/health/ready');
    expect(live.status).toBe(200);
    expect(ready.status).toBe(200);
  });

  it('does NOT leak secret-looking strings in any /health response body', async () => {
    const service = stubService({
      liveness: { status: 'healthy', timestamp: 't', version: '1.0.0', environment: 'dev' },
      readiness: {
        status: 'unhealthy',
        httpStatus: 503,
        checks: { database: 'down' },
        // Service is expected to sanitize before this point; controller just forwards.
        error: 'Database connection failed',
        timestamp: 't',
        version: '1.0.0',
        environment: 'dev',
      },
    });
    const controller = createHealthController({ service });
    const app = buildApp(controller);

    const res = await request(app).get('/health/ready');
    const payload = JSON.stringify(res.body);

    expect(payload).not.toMatch(/sk_(test|live)_/);
    expect(payload).not.toMatch(/postgres:\/\//);
    expect(payload).not.toMatch(/password=/i);
  });
});
