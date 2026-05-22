const buildHealthModule = require('..');

describe('health module wiring', () => {
  it('builds a service and controller from a knex-like connection', async () => {
    const conn = { raw: jest.fn().mockResolvedValue([{ 1: 1 }]) };
    const mod = buildHealthModule({ dbConnection: conn });

    expect(typeof mod.service.getLiveness).toBe('function');
    expect(typeof mod.service.getReadiness).toBe('function');
    expect(typeof mod.controller.liveness).toBe('function');
    expect(typeof mod.controller.readiness).toBe('function');

    const ready = await mod.service.getReadiness();
    expect(ready.status).toBe('healthy');
    expect(ready.checks.database).toBe('up');
    expect(conn.raw).toHaveBeenCalledWith('SELECT 1');
  });

  it('still builds a working module when no dbConnection is provided', async () => {
    const mod = buildHealthModule({});
    const ready = await mod.service.getReadiness();
    expect(ready.status).toBe('healthy');
    expect(ready.checks).toEqual({});
  });
});
