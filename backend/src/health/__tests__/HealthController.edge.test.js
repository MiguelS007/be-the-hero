const express = require('express');
const request = require('supertest');
const createHealthController = require('../HealthController');

describe('HealthController edge cases', () => {
  it('throws when constructed without a valid service', () => {
    expect(() => createHealthController({})).toThrow(/service/);
    expect(() => createHealthController({ service: {} })).toThrow(/service/);
  });

  it('returns 503 with a generic error when service.getReadiness throws synchronously', async () => {
    const controller = createHealthController({
      service: {
        getLiveness: () => ({ status: 'healthy', timestamp: 't', version: 'v', environment: 'dev' }),
        getReadiness: () => { throw new Error('boom raw connection info password=secret'); },
      },
    });
    const app = express();
    app.get('/health/ready', controller.readiness);

    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('unhealthy');
    expect(JSON.stringify(res.body)).not.toMatch(/password=secret/);
  });

  it('defaults to 200 when the service result has no httpStatus field', async () => {
    const controller = createHealthController({
      service: {
        getLiveness: () => ({ status: 'healthy', timestamp: 't', version: 'v', environment: 'dev' }),
        getReadiness: async () => ({ status: 'healthy', checks: {} }),
      },
    });
    const app = express();
    app.get('/health/ready', controller.readiness);

    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(200);
  });
});
