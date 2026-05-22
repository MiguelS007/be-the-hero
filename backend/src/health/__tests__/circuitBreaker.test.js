const createCircuitBreaker = require('../circuitBreaker');

describe('circuitBreaker', () => {
  it('exposes a callable factory', () => {
    expect(typeof createCircuitBreaker).toBe('function');
  });

  it('forwards the result when the underlying call succeeds', async () => {
    const breaker = createCircuitBreaker(async () => 'ok', {
      failureThreshold: 3,
      resetTimeoutMs: 30000,
      timeoutMs: 100,
      name: 'test',
    });

    await expect(breaker.fire()).resolves.toBe('ok');
    expect(breaker.state()).toBe('closed');
  });

  it('opens after reaching the failure threshold', async () => {
    const breaker = createCircuitBreaker(async () => { throw new Error('boom'); }, {
      failureThreshold: 3,
      resetTimeoutMs: 30000,
      timeoutMs: 100,
      name: 'test',
    });

    await expect(breaker.fire()).rejects.toThrow();
    await expect(breaker.fire()).rejects.toThrow();
    await expect(breaker.fire()).rejects.toThrow();

    expect(breaker.state()).toBe('open');
  });

  it('short-circuits when open (does not call action)', async () => {
    const action = jest.fn(async () => { throw new Error('boom'); });
    const breaker = createCircuitBreaker(action, {
      failureThreshold: 2,
      resetTimeoutMs: 30000,
      timeoutMs: 100,
      name: 'test',
    });

    await expect(breaker.fire()).rejects.toThrow();
    await expect(breaker.fire()).rejects.toThrow();
    expect(breaker.state()).toBe('open');

    action.mockClear();
    await expect(breaker.fire()).rejects.toThrow(/circuit/i);
    expect(action).not.toHaveBeenCalled();
  });

  it('honours the per-call timeout', async () => {
    const breaker = createCircuitBreaker(
      () => new Promise((resolve) => setTimeout(() => resolve('late'), 200)),
      { failureThreshold: 5, resetTimeoutMs: 30000, timeoutMs: 50, name: 'slow' },
    );

    await expect(breaker.fire()).rejects.toThrow(/timeout/i);
  });

  it('resets to half-open after resetTimeoutMs and closes on success', async () => {
    let shouldFail = true;
    const breaker = createCircuitBreaker(async () => {
      if (shouldFail) throw new Error('boom');
      return 'ok';
    }, { failureThreshold: 2, resetTimeoutMs: 20, timeoutMs: 100, name: 'reset' });

    await expect(breaker.fire()).rejects.toThrow();
    await expect(breaker.fire()).rejects.toThrow();
    expect(breaker.state()).toBe('open');

    await new Promise((r) => setTimeout(r, 30));
    shouldFail = false;
    await expect(breaker.fire()).resolves.toBe('ok');
    expect(breaker.state()).toBe('closed');
  });
});
