const createDatabaseIndicator = require('../indicators/DatabaseIndicator');

describe('DatabaseIndicator', () => {
  it('returns up when the database responds to SELECT 1', async () => {
    const fakeConnection = { raw: jest.fn().mockResolvedValue([{ 1: 1 }]) };
    const indicator = createDatabaseIndicator({ connection: fakeConnection, timeoutMs: 100 });

    const result = await indicator.check();

    expect(result.status).toBe('up');
    expect(fakeConnection.raw).toHaveBeenCalledWith('SELECT 1');
    expect(result).not.toHaveProperty('connectionString');
  });

  it('returns down when the database throws', async () => {
    const fakeConnection = { raw: jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:5432 password=topsecret')) };
    const indicator = createDatabaseIndicator({ connection: fakeConnection, timeoutMs: 100 });

    const result = await indicator.check();

    expect(result.status).toBe('down');
    // Security: do NOT leak the raw error string (which contains a password fragment)
    expect(JSON.stringify(result)).not.toMatch(/password=topsecret/);
    expect(JSON.stringify(result)).not.toMatch(/127\.0\.0\.1:5432/);
    expect(result.error).toBeDefined();
  });

  it('returns down with timeout when query hangs longer than timeoutMs', async () => {
    const fakeConnection = {
      raw: jest.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 300))),
    };
    const indicator = createDatabaseIndicator({ connection: fakeConnection, timeoutMs: 50 });

    const result = await indicator.check();

    expect(result.status).toBe('down');
    expect(result.error).toMatch(/timeout/i);
  });

  it('declares itself critical', () => {
    const indicator = createDatabaseIndicator({ connection: { raw: jest.fn() } });
    expect(indicator.critical).toBe(true);
    expect(indicator.name).toBe('database');
  });
});
