# EpicBook Reliability Tests

## Test environment

Date: 15 October 2026

Application: https://epicbook-michael-c3-2026.eastus.cloudapp.azure.com/

Azure VM: week11-docker-vm

Application image tags:
- michaelokanlawon/epicbook-frontend:16
- michaelokanlawon/epicbook-backend:16

Faults were injected manually by stopping one dependency at a time. The dependency was restored before proceeding.

## Baseline

All four Compose services were healthy.

| Request | HTTP status | Response time |
|---|---|---|
| Homepage | 200 | 0.397273 s |
| /api/books?limit=1 | 200 | 0.064991 s |

## Test: backend unavailable

Fault injection: docker compose stop backend

| Check | Observed result |
|---|---|
| Homepage | HTTP 503 in 0.083795 s |
| Homepage error handling | Friendly unavailable page with a Try again link |
| /api/books?limit=1 | HTTP 504 in 3.063526 s |
| Frontend process | Continued running |
| Frontend /health | Continued returning 200 |

Displayed message:

"The bookstore is temporarily unavailable"

"We could not retrieve your books or cart. Please try again shortly."

The application did not expose a stack trace in the returned error page.

### Recovery

The backend was started with Compose and became healthy. Nginx configuration was tested and reloaded.

The initial recovery homepage request returned HTTP 503 in 5.799018 s, while the API subsequently returned HTTP 200 in 0.203275 s.

Logs showed backend requests taking 5.363–5.546 seconds, exceeding the frontend's five-second dependency timeout. The frontend logged TimeoutError. The underlying cause of the temporary latency was not established.

Without another restart, three subsequent homepage requests returned:

| Attempt | HTTP status | Response time |
|---|---|---|
| 1 | 200 | 0.099440 s |
| 2 | 200 | 0.111710 s |
| 3 | 200 | 0.093640 s |

Direct requests from the frontend container also succeeded:

| Backend route | HTTP status | Duration |
|---|---|---|
| /api/books?limit=9 | 200 | 1975 ms |
| /api/categories | 200 | 24 ms |
| /api/cart | 200 | 43 ms |

Result: graceful homepage failure and successful recovery, with a temporary post-restart timeout.

## Test: database unavailable

Fault injection: docker compose stop -t 120 database

| Check | Observed result |
|---|---|
| Homepage | HTTP 503 in 0.090419 s |
| Homepage error handling | Same friendly unavailable page and Try again link |
| /api/books?limit=1 | HTTP 503 in 0.079849 s |
| Backend /health | HTTP 503 |

API response:

{"error":"Database temporarily unavailable"}

Backend health response:

{"status":"unavailable","service":"backend","database":"not_ready"}

The backend health endpoint correctly reported that its database dependency was unavailable.

### Recovery

The database was started with:

docker compose up -d --no-deps --wait --wait-timeout 180 database

Compose reported the database healthy after approximately 51.1 seconds. Neither the backend nor frontend was restarted for this recovery.

| Check | HTTP status | Response time |
|---|---|---|
| Homepage recovery attempt 1 | 200 | 2.578418 s |
| Homepage recovery attempt 2 | 200 | 0.489308 s |
| Homepage recovery attempt 3 | 200 | 0.178188 s |
| Recovered /api/books?limit=1 | 200 | 0.069048 s |

Final Compose output showed database, backend, frontend and reverse-proxy healthy.

Result: dependency-aware error responses and successful database reconnection without application-container restarts.

## Conclusions and limits

- Both injected dependency outages produced controlled homepage error responses.
- The backend health endpoint detected database unavailability.
- All four services were healthy after testing.
- Frontend health is a liveness check; it remained successful during backend failure.
- A successful healthcheck does not guarantee that every application request completes within the frontend timeout.
- The first backend recovery request exceeded the timeout; subsequent requests succeeded.
- Timings in the tables are individual request durations, not measured recovery-time objectives.
- Browser cart-mutation failure handling was not confirmed in the recorded evidence.
- These tests do not establish high availability, load capacity or automatic recovery from VM failure.
