# Healthchecks and Startup Order

## Service checks

| Service | Check | What it proves |
|---|---|---|
| database | Authenticated SELECT 1 against bookstore | MySQL accepts connections using the application credentials |
| backend | HTTP GET /health | Backend responds, database authentication succeeds, and the Book table can be queried |
| frontend | HTTP GET /health | Frontend HTTP process responds |
| reverse-proxy | HTTP GET /health | Nginx responds using its configured server |

Frontend and proxy healthchecks do not prove that the entire application
works. Separate homepage and API requests verify integration.

## Timing

| Service | Interval | Timeout | Start period | Retries |
|---|---|---|---|---|
| database | 10 seconds | 5 seconds | 60 seconds | 12 |
| backend | 30 seconds | 5 seconds | 30 seconds | 3 |
| frontend | 30 seconds | 5 seconds | 10 seconds | 3 |
| reverse-proxy | 15 seconds | 5 seconds | None configured | 3 |

The frontend/backend check commands also use a three-second HTTP timeout.
Database and application initialisation may need additional time on a
small VM.

## Dependency conditions

- Backend depends on database with condition: service_healthy.
- Frontend depends on backend with condition: service_healthy.
- Reverse proxy depends on frontend and backend with
  condition: service_healthy.

First deployment requires this sequence:

1. Build the application images.
2. Start the database and wait for its healthcheck.
3. Run backend/scripts/init-db.js using a temporary backend container.
4. Start the complete stack and wait for healthchecks.

Initialisation is separate because backend readiness requires the Book
table to exist. Normal backend startup does not modify the schema.

## Behaviour after startup

depends_on conditions control startup readiness. They do not continuously
stop dependent containers when a dependency becomes unhealthy.

restart: unless-stopped restarts containers that exit, subject to Docker's
restart policy. An unhealthy status alone does not restart a container.

The frontend bounds backend fetches with a five-second timeout and
returns HTTP 503 when data retrieval fails.

## Verification on 2026-10-13

- Database initialisation loaded 53 authors and 54 books.
- All four Compose services reported healthy.
- GET /api/books?limit=1 returned HTTP 200 with book and author data.
- An initial homepage request returned HTTP 503 with a logged TimeoutError.
- Subsequent direct calls from frontend to books, categories and cart
  APIs all returned HTTP 200.
- An empty-data template rendering test passed.
- Three subsequent homepage requests returned HTTP 200 in approximately
  0.896, 0.045 and 0.040 seconds.
- The rendered homepage contained the title "28 Summers".

The initial timeout's underlying cause was not established.
No timeout increase or database reset was required.

## Deployment stage

Verification currently uses http://127.0.0.1:8088 inside the VM.
Public access and HTTPS are not yet configured.
