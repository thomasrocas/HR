# HR Orientation Monorepo

This repository hosts the HR Orientation application. The codebase is being reorganized into a monorepo with separate workspaces for the server, client, and shared utilities.

## Project Structure

```
apps/
  server/
    src/
      config/
      controllers/
      routes/
      services/
      models/
      middlewares/
      utils/
    tests/
  client/
    src/
      components/
      pages/
      services/
      utils/
packages/
  shared/
    src/
```

## Prerequisites

- Node.js 18+
- npm 9+ (or compatible package manager)
- PostgreSQL 13+

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy the example environment file and adjust values as needed:
   ```bash
   cp .env.example .env
   ```
3. Provision a PostgreSQL database and update `DATABASE_URL` accordingly.

## Development

- Start the development server(s) after scripts are added:
  ```bash
  npm run dev
  ```
- Lint and type-check as available:
  ```bash
  npm run lint
  npm run typecheck
  ```

## Testing

- Run the automated test suite:
  ```bash
  npm test
  ```
- Execute targeted server or client tests as the monorepo tooling evolves (e.g., `npm run test:server`).

## Database Migrations

Apply SQL files in the `migrations/` directory sequentially using your preferred migration runner or `psql` client.

## Docker

Build and run the application via Docker once images are defined:
```bash
docker compose up --build
```
Adjust environment variables in `docker-compose.yml` (once available) to match your deployment settings.

## Additional Notes

- Shared constants and types will live under `packages/shared/src`.
- Do not commit secrets; keep all sensitive values in `.env` files or secret managers.
