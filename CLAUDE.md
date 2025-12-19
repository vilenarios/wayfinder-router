# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Wayfinder Router is a lightweight proxy router for the ar.io network. It acts as an intermediary between clients and Arweave gateways, providing:
- Content verification via hash checking against trusted gateways
- Smart gateway selection with health tracking and circuit breaker patterns
- ArNS (Arweave Name System) resolution with consensus verification
- Manifest verification for path-based content (Arweave manifests)
- Caching for verified content, manifests, and ArNS resolutions
- Two operating modes: `proxy` (fetch, verify, serve) and `route` (redirect to gateway)

## Requirements

- Node.js >= 20.0.0
- ESM module system (`"type": "module"` in package.json)

## Common Commands

```bash
npm run dev          # Start development server with hot reload (tsx watch)
npm run build        # Compile TypeScript to dist/
npm run start        # Run compiled server from dist/
npm run typecheck    # Type-check without emitting
npm run test         # Run tests once with vitest
npm run test:watch   # Run tests in watch mode
npx vitest run src/path/to/file.test.ts  # Run a single test file

# CLI utilities
npm run stats        # Show gateway telemetry statistics
npm run clear:telemetry  # Clear telemetry database
npm run clear:all    # Clear all data (telemetry + cache)
```

### Docker

```bash
docker compose up                    # Development
docker build -t wayfinder-router .   # Build production image
docker run -p 3000:3000 --env-file .env wayfinder-router  # Run production
```

## Architecture

### Entry Points
- `src/index.ts` - Application bootstrap, creates logger and starts Hono server
- `src/server.ts` - Hono app configuration, middleware registration, route handlers
- `src/config.ts` - Environment variable loading and validation

### Request Flow
1. **Middleware** (`src/middleware/`) - Request parsing, mode selection, rate limiting, error handling
2. **Handlers** (`src/handlers/`) - proxy.ts (fetch/verify/serve), route.ts (redirect), health.ts, stats.ts
3. **Services** (`src/services/`) - Core business logic (gateway selection, content fetching, verification, ArNS resolution, manifest resolution)
4. **Cache** (`src/cache/`) - ArNS cache, gateway health, content cache, manifest cache, gateway temperature
5. **Telemetry** (`src/telemetry/`) - Metrics collection and SQLite persistence
6. **Utils** (`src/utils/`) - Header utilities, URL parsing, request deduplication

### Code Patterns

**Factory Functions**: All services use `create*` factory functions that accept dependencies and return typed interfaces:
```typescript
// Example from gateway-selector.ts
export function createGatewaySelector(
  strategy: RoutingStrategy,
  provider: GatewaysProvider,
  config: RouterConfig,
  logger: Logger
): GatewaySelector { ... }
```

**Hono Context Extension**: Custom variables are added to Hono context via type declaration in `src/server.ts`:
```typescript
declare module "hono" {
  interface ContextVariableMap {
    requestInfo: RequestInfo;
    routerMode: RouterMode;
  }
}
```

**Dependency Injection**: `createServer()` in `src/server.ts` wires all services together and returns `{ app, services }`.

### Key Dependencies
- `@ar.io/wayfinder-core` - SDK for routing strategies, gateway providers, verification
- `@ar.io/sdk` - ar.io network SDK (ARIO class for fetching gateway registry)
- `hono` - Web framework with `@hono/node-server`
- `better-sqlite3` - Telemetry storage
- `pino` / `pino-pretty` - Logging
- `lru-cache` - Content and manifest caching

### TypeScript
- Strict mode enabled with `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`
- All imports must use `.js` extension (ESM requirement, even for `.ts` files)

### Verification Architecture
The router separates **routing** (where to fetch data) from **verification** (who to trust for hashes):

- **Routing Gateways**: Where to fetch content from. Sources: `network` (all ar.io gateways), `trusted-peers`, `static`
- **Verification Gateways**: Who to trust for hash verification. Sources: `top-staked` (top N by stake), `static`

### Manifest Verification Flow
When a request includes a subpath (e.g., `/txId/path/to/file`):
1. Gateway returns content with `x-arns-resolved-id` and `x-arns-data-id` headers
2. Router fetches manifest from trusted gateways, verifies its hash
3. Router verifies path mapping matches gateway's response
4. Router verifies actual content against expected txId from manifest

### Routing Strategies

Four routing strategies determine how gateways are selected for content fetching:

| Strategy | Behavior |
|----------|----------|
| `fastest` | Concurrent ping, use first responder |
| `random` | Random selection from healthy gateways |
| `round-robin` | Sequential rotation through gateways |
| `temperature` | Weighted selection based on recent latency and success rate |

The `temperature` strategy uses `GatewayTemperatureCache` to track performance metrics. Gateways with better recent performance have higher probability of selection, but slower gateways still receive some traffic (to detect improvements).

## Configuration

All configuration via environment variables. See `.env.example` for full list. Key variables:

**Server**: `PORT`, `HOST`, `BASE_DOMAIN`, `ARNS_ROOT_HOST`
**Mode**: `DEFAULT_MODE` (`proxy`/`route`), `ALLOW_MODE_OVERRIDE`
**Verification**: `VERIFICATION_ENABLED`, `VERIFICATION_GATEWAY_SOURCE`, `VERIFICATION_GATEWAY_COUNT`
**Routing**: `ROUTING_STRATEGY`, `ROUTING_GATEWAY_SOURCE`, `ROUTING_STATIC_GATEWAYS`
**Cache**: `CONTENT_CACHE_ENABLED`, `CONTENT_CACHE_MAX_SIZE_BYTES`, `ARNS_CACHE_TTL_MS`
