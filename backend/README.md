# backend

## Health checks (US-005 / T001-BE)

Two endpoints are exposed for monitoring. **Neither requires authentication** — by design — so a load balancer, orchestrator, or external monitor can probe the service freely.

### `GET /health` — liveness

Cheap, in-process probe. Confirms that the Node process is alive and accepting HTTP. Does **not** touch external dependencies.

- Always responds with HTTP **200** if the process can answer
- Target latency: **< 100 ms p95**
- Intended for: kernel-level / orchestrator liveness probes

Response (200):
```json
{
  "status": "healthy",
  "timestamp": "2026-05-22T00:00:00.000Z",
  "version": "1.0.0",
  "environment": "development"
}
```

### `GET /health/ready` — readiness

Deep probe. Fans out to every configured indicator (database today; Stripe/SendGrid pluggable) in **parallel**, with per-indicator timeout and a global timeout cap.

- HTTP **200** when every critical dependency is up
  - `status: "healthy"`   — everything up
  - `status: "degraded"`  — every critical dep up, but ≥1 non-critical dep down
- HTTP **503** when ≥1 critical dependency is down
  - `status: "unhealthy"`
- Target latency: **< 300 ms p95**
- Intended for: load-balancer readiness probes, deploy gating

Response (200, healthy):
```json
{
  "status": "healthy",
  "timestamp": "2026-05-22T00:00:00.000Z",
  "version": "1.0.0",
  "environment": "development",
  "checks": { "database": "up" },
  "durationMs": 4
}
```

Response (503, unhealthy):
```json
{
  "status": "unhealthy",
  "timestamp": "2026-05-22T00:00:00.000Z",
  "version": "1.0.0",
  "environment": "production",
  "checks": { "database": "down" },
  "error": "critical dependency down: database",
  "durationMs": 2003
}
```

### Behavioural guarantees

| Concern        | How it is handled                                                                   |
|----------------|-------------------------------------------------------------------------------------|
| Cascading fails| Circuit breaker per indicator: opens after 3 consecutive failures, resets in 30 s.  |
| Timeouts       | Per-indicator timeout (default 2 s). Global readiness timeout (default 3 s).        |
| Parallelism    | Indicators run via `Promise.all` — total readiness ≈ slowest indicator.             |
| Security       | Responses are scrubbed for connection strings, passwords, `sk_*`, `SG.*`, bearer tokens. |
| Auth           | None on purpose: probes must work for load balancers without credentials.           |
| Observability  | `durationMs` returned in payload; pluggable `logger` accepted by `HealthService`.   |

### Configuration (env vars)

| Variable                        | Default                  | Used for                                  |
|---------------------------------|--------------------------|-------------------------------------------|
| `APP_VERSION`                   | `package.json#version`   | `version` field in responses              |
| `NODE_ENV`                      | `"development"`          | `environment` field in responses          |
| `HEALTH_CHECK_TIMEOUT_MS`       | `2000`                   | Per-indicator timeout                     |
| `HEALTH_TOTAL_TIMEOUT_MS`       | `3000`                   | Global readiness timeout                  |

### Testing

```bash
npm test               # all unit + supertest E2E
npm run test:coverage  # with coverage report
```

Current coverage (US-005 / T001-BE): **34 tests, 91% statements, 94.88% lines**.
