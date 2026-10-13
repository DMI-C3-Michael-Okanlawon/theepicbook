# Reverse Proxy Routing and CORS

## Routing
Nginx is the only service publishing a host port.

| Path | Destination |
|---|---|
| /api/ | http://backend:8080 |
| / | http://frontend:3000 |
| /health | Nginx's own health response |

The API proxy_pass has no trailing URI, preserving /api/ in upstream
requests. The frontend retrieves backend data through BACKEND_URL.
Browser API calls use relative /api/ paths.

Current verification URL: http://127.0.0.1:8088 inside the VM.
Public access and HTTPS will be configured during cloud deployment.

## Proxy controls
- Nginx version details are hidden.
- Request bodies are limited to 16 KB.
- Upstream connection timeout: 3 seconds.
- Upstream read timeout: 10 seconds.
- X-Content-Type-Options: nosniff.
- X-Frame-Options: SAMEORIGIN.
- Referrer-Policy: strict-origin-when-cross-origin.
- Access logs use JSON and are bind-mounted to the host.

## Backend CORS
CORS_ORIGINS contains a comma-separated allowlist.
The current Compose defaults are:
- http://127.0.0.1:8088
- http://localhost:8088

Allowed methods: GET, POST, DELETE, OPTIONS.
Allowed request header: Content-Type.
Preflight cache duration: 600 seconds.

The backend rejects requests carrying an unlisted Origin with HTTP 403.
Requests without an Origin are permitted for internal calls and CLI use.
CORS is not authentication or per-user authorisation.

When public access is configured, the exact public origin must be added
and the backend container recreated to load the new environment setting.

## Observed verification: 2026-10-13
- Homepage routing previously returned HTTP 200 with rendered book data.
- GET /api/books returned HTTP 200 through Nginx.
- Origin http://127.0.0.1:8088 returned HTTP 200 and an exact matching
  Access-Control-Allow-Origin header.
- Origin https://untrusted.example returned HTTP 403 without an
  Access-Control-Allow-Origin header.
- OPTIONS /api/cart requesting POST and Content-Type returned HTTP 204
  with the expected allow-origin, methods and headers.
