const createExternalServiceIndicator = require('../indicators/ExternalServiceIndicator');

describe('ExternalServiceIndicator', () => {
  it('requires a name', () => {
    expect(() => createExternalServiceIndicator({ probe: async () => {} })).toThrow(/name/);
  });

  it('requires a probe function', () => {
    expect(() => createExternalServiceIndicator({ name: 'stripe' })).toThrow(/probe/);
  });

  it('defaults to non-critical', () => {
    const ind = createExternalServiceIndicator({ name: 'stripe', probe: async () => true });
    expect(ind.critical).toBe(false);
    expect(ind.name).toBe('stripe');
  });

  it('reports up when probe succeeds', async () => {
    const ind = createExternalServiceIndicator({ name: 'stripe', probe: async () => true });
    await expect(ind.check()).resolves.toEqual({ status: 'up' });
  });

  it('reports down with a sanitized error when probe rejects', async () => {
    const ind = createExternalServiceIndicator({
      name: 'stripe',
      probe: async () => { throw new Error('using key sk_live_supersecret'); },
    });
    const r = await ind.check();
    expect(r.status).toBe('down');
    expect(r.error).not.toMatch(/sk_live_supersecret/);
  });

  it('reports timeout label when probe hangs longer than timeoutMs', async () => {
    const ind = createExternalServiceIndicator({
      name: 'stripe',
      timeoutMs: 30,
      probe: () => new Promise((r) => setTimeout(r, 200)),
    });
    const r = await ind.check();
    expect(r.status).toBe('down');
    expect(r.error).toMatch(/timeout/i);
  });
});
