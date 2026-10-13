# Logging Layout and Observability

## Log destinations

| Component | Destination | Format |
|---|---|---|
| Frontend | Container stdout | Application JSON |
| Backend | Container stdout | Application JSON |
| Database initialisation script | Temporary container stdout | Application JSON |
| MySQL | Container stdout/stderr | MySQL's default text output |
| Nginx access log | /var/log/nginx/access.log | JSON |
| Nginx error log | /var/log/nginx/error.log | Text |

## Reverse proxy host mount

Compose bind-mounts ./logs/nginx to /var/log/nginx.

Host files:
- logs/nginx/access.log
- logs/nginx/error.log

These files remain on the VM when the proxy container is recreated.

Nginx access records contain:
time, service, method, uri, status, duration and upstream_status.

The Nginx /health location disables access logging to reduce noise.
Nginx error logging uses the warn level.

## Application JSON logs

Frontend and backend write JSON records to stdout with:
timestamp, service, level and event.

Request records additionally include:
method, path, status and durationMs.

Other events include startup, shutdown and request failures.
Backend database-health failures are logged as health_failed.

Passwords, request bodies and database connection strings are not
deliberately included in these application log records.

## Viewing logs

Live application logs:

docker compose logs --follow --no-log-prefix frontend backend

Recent application logs:

docker compose logs --since=10m frontend backend

Proxy access logs on the host:

sudo tail -f logs/nginx/access.log

Proxy error logs on the host:

sudo tail -f logs/nginx/error.log

Database logs:

docker compose logs --tail=50 database

## Rotation and retention

All four Compose services use Docker's json-file logging driver with:
- max-size: 10m
- max-file: 3

This limits retained container stdout/stderr logs to approximately
30 MB per container, excluding overhead.

Docker's json-file format wraps container output. It does not convert
MySQL text messages into structured application JSON.

Docker log rotation does not rotate the bind-mounted Nginx files.
Host-side rotation for logs/nginx must be configured separately.
A proposed policy is daily rotation, seven retained files, compression
of older logs and a USR1 signal to Nginx after rotation to reopen logs.

Local logs are not an off-VM archive. Central log collection and
automated alerting have not been implemented.

## Observability and evidence

Service health can be inspected with docker compose ps.
HTTP status codes and request durations help identify failed or slow
requests. Backend healthchecks also check database access.

Verification uses requests to / and /api/books while following frontend
and backend JSON logs. The proxy access log is inspected on the host.

Submitted screenshot:
Logging & Observability — Live JSON Container Logs.
