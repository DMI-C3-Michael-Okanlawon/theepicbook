# EpicBook: App Discovery and Deployment Design

## Discovery baseline
Inspected source commit: 7c05669.

The existing application combines Express, Handlebars rendering, static
assets and Sequelize database access in one Node.js process.

- Entry point: server.js.
- Templates: views/ and views/layouts/.
- Static files: public/assets/.
- HTML routes: /, /cart, /gallery and POST /category/:categoryName.
- API routes: POST /api/cart, GET /api/cart and DELETE /api/cart/delete.
- Database: MySQL through Sequelize and mysql2.
- Models: Author, Book, Cart, Checkout and the Cartbook join table.
- No separate worker process was identified in the inspected source.
- A Checkout model exists, but no checkout API was found in the inspected routes.

The current server calls sequelize.sync() before listening.
The standalone SQL schema does not describe every Sequelize model.
scripts/seed.js synchronises models and loads author/book SQL when their
respective tables are empty.

## Existing environment configuration
| Variable | Current use |
|---|---|
| PORT | Express listen port; defaults to 8080 |
| NODE_ENV | Selects config/config.json section; defaults to development |
| JAWSDB_URL | Explicitly required by scripts/seed.js |

models/index.js reads its database URL from the environment variable named
by config[NODE_ENV].use_env_variable. Verified: production uses JAWSDB_URL.
Development and test use direct configuration fields instead.
No credentials are included here.

Both the URL-based Sequelize connection and seed script currently enable
TLS with certificate validation.

## Planned four-service architecture
This section describes the target design, not an already deployed stack.

1. reverse-proxy: Nginx routes /api/ to backend and / to frontend.
2. frontend: Node.js/Express renders existing Handlebars views using
   backend API responses and serves static assets.
3. backend: Node.js/Express owns database queries and exposes JSON APIs.
4. database: MySQL stores persistent application data.

Read APIs for books, categories and cart data will be added so the
frontend no longer imports Sequelize models or connects to MySQL.
Browser API requests will use relative /api/ URLs.

## Planned ports and networks
| Service | Container port | Host publication | Networks |
|---|---|---|---|
| reverse-proxy | 80, 443 | 80, 443 | front-tier |
| frontend | 3000 | None | front-tier |
| backend | 8080 | None | front-tier, back-tier |
| database | 3306 | None | back-tier |

back-tier will be an internal Docker network.
Only the backend joins both networks.
SSH port 22 will be restricted to the administrator's current public IP.
HTTPS requires certificate provisioning and verification before it is
reported as working.

## Planned configuration contract
These settings will be implemented in the capstone code.

| Service | Setting | Purpose |
|---|---|---|
| frontend | NODE_ENV=production | Production runtime |
| frontend | PORT=3000 | Internal listener |
| frontend | BACKEND_URL=http://backend:8080 | Server-side API requests |
| backend | NODE_ENV=production | Production runtime |
| backend | PORT=8080 | Internal listener |
| backend | DB_HOST=database | Compose database hostname |
| backend | DB_PORT=3306 | Database port |
| backend | DB_NAME=bookstore | Database name |
| backend | DB_USER=epicbook | Application database account |
| backend | DB_PASSWORD_FILE | Mounted application password file |
| backend | DB_SSL | Explicit database TLS mode |
| backend | CORS_ORIGINS | Exact allowed browser origins |
| database | MYSQL_DATABASE=bookstore | Initial database |
| database | MYSQL_USER=epicbook | Initial application user |
| database | MYSQL_PASSWORD_FILE | Mounted application password file |
| database | MYSQL_ROOT_PASSWORD_FILE | Separate root password file |

DB_* settings will replace the legacy database URL configuration for this
deployment. The seed script must use the same connection settings.
Secrets must remain outside Git and image layers.
MySQL initialisation variables apply to a fresh data directory; changing
a secret file alone does not rotate an existing database user's password.

## Planned persistence and logging
| Data | Container path | Storage |
|---|---|---|
| MySQL data | /var/lib/mysql | Named volume mysql-data |
| Reverse proxy logs | /var/log/nginx | Host bind mount ./logs/nginx |
| Application logs | stdout/stderr | Docker logs with rotation |
| Database backups | Not an application mount | Protected host directory and off-VM copy |

Templates and static assets will be packaged into the frontend image.
No user-upload storage path was identified.
Backups must be database-consistent and verified with a restore drill.

## Required application fixes
- Return a response from DELETE /api/cart/delete.
- Await cart.addBook(book) before reporting successful creation.
- Validate input and return 404 for unknown books.
- Replace the GET cart route's dependence on a request body.
- Handle database/API errors and return bounded failure responses.
- Add backend /health and frontend dependency-failure handling.
- Configure database TLS explicitly and preserve certificate verification
  whenever TLS is enabled.
- Control schema initialisation separately from normal application startup.

## Application scope
The inspected cart routes have no per-user ownership checks.
Deployment hardening does not make this application suitable for real
customer transactions. Authentication, cart isolation and broader
application security review remain additional production requirements.
