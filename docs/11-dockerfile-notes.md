# Multi-stage Dockerfiles

Both frontend and backend use a dependency stage and a runtime stage
based on node:24-bookworm-slim.

## Layer optimisation
- Package manifests and lock files are copied before application source.
- npm ci installs dependencies from the committed lock file.
- Source-only edits can reuse the dependency installation layer.
- Each service has its own build context and .dockerignore.
- Only production dependencies are installed.
- The frontend contains UI assets; the backend contains models and seed data.

## Security benefits
- Both runtime containers run as the unprivileged node user.
- Database credentials are supplied at runtime through mounted files.
- Environment files, private keys and secrets are excluded from build contexts.
- Neither service image contains the original credential configuration.
- Explicit COPY instructions limit the contents of runtime images.

## Scope
These JavaScript services do not require compilation. The first stage
prepares dependencies; the second assembles the runnable application.
Multi-stage structure alone does not guarantee a smaller image when
both stages use the same base.

Image builds and syntax checks do not establish runtime correctness.
Database integration, UI rendering and failure behaviour must be tested
after Compose deployment. Dependency and image vulnerability findings
must also be reviewed before claiming production readiness.
