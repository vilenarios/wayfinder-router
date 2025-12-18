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
1. **Middleware** (`src/middleware/`):
   - `request-parser.ts` - Extracts request type (ArNS subdomain, txId path, or reserved)
   - `mode-selector.ts` - Determines proxy vs route mode from config/headers
   - `rate-limiter.ts` - IP-based rate limiting (configurable)
   - `error-handler.ts` - Standardized error responses with `WayfinderError` class

2. **Handlers** (`src/handlers/`):
   - `proxy.ts` - Fetches content, verifies (with manifest support), caches, serves
   - `route.ts` - Redirects to selected gateway
   - `health.ts` - Health/ready/metrics endpoints
   - `stats.ts` - Telemetry API endpoints (`/stats/gateways`, `/stats/export`)

3. **Services** (`src/services/`):
   - `wayfinder-client.ts` - Wraps `@ar.io/wayfinder-core` SDK, creates strategies and providers
   - `network-gateway-manager.ts` - Fetches/caches gateway list from ar.io network registry, sorted by stake
   - `gateway-selector.ts` - Smart gateway selection with health tracking
   - `content-fetcher.ts` - Fetches from gateways with retry logic
   - `verifier.ts` - Streaming hash verification
   - `arns-resolver.ts` - ArNS name to txId resolution with consensus
   - `manifest-resolver.ts` - Fetches, verifies, and resolves Arweave path manifests

4. **Cache** (`src/cache/`):
   - `arns-cache.ts` - TTL cache for ArNS resolutions
   - `gateway-health.ts` - Health tracking with circuit breaker
   - `content-cache.ts` - LRU cache for verified content (configurable size, disk optional)
   - `manifest-cache.ts` - LRU cache for verified manifests

5. **Telemetry** (`src/telemetry/`):
   - `collector.ts` - Request metrics collection with sampling
   - `storage.ts` - SQLite persistence (better-sqlite3)
   - `service.ts` - Telemetry service facade

6. **Utils** (`src/utils/`):
   - `url.ts` - URL construction, txId/ArNS validation, sandbox subdomain generation
   - `headers.ts` - Wayfinder response headers, manifest detection from gateway headers

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

### Request Types
Determined by `src/middleware/request-parser.ts`:
- **ArNS**: Subdomain request like `{arnsName}.{baseDomain}`
- **TxId**: Path request like `/{43-char-base64url}`
- **Reserved**: System paths (`/health`, `/ready`, `/metrics`, `/stats/*`)

### Verification Architecture
The router separates **routing** (where to fetch data) from **verification** (who to trust for hashes):

**Routing Gateways** (`ROUTING_GATEWAY_SOURCE`):
- `network` (default) - All gateways from ar.io registry (any gateway works since we verify)
- `trusted-peers` - Fetch from gateway's `/ar-io/peers` endpoint
- `static` - Use `ROUTING_STATIC_GATEWAYS` list

**Verification Gateways** (`VERIFICATION_GATEWAY_SOURCE`):
- `top-staked` (default) - Top N gateways by stake from ar.io network (highest trust)
- `static` - Use `VERIFICATION_STATIC_GATEWAYS` list

### Routing Strategies
Configured via `ROUTING_STRATEGY`:
- `fastest` (default) - Concurrent ping, use first responder
- `random` - Random healthy gateway
- `round-robin` - Sequential rotation

### Manifest Verification Flow
When a request includes a subpath (e.g., `/txId/path/to/file`):
1. Gateway returns content with `x-arns-resolved-id` and `x-arns-data-id` headers
2. Router fetches manifest from trusted gateways, verifies its hash
3. Router verifies path mapping matches gateway's response
4. Router verifies actual content against expected txId from manifest

## Configuration

All configuration via environment variables. See `.env.example` for full list. Key variables:

**Server**: `PORT`, `HOST`, `BASE_DOMAIN`
**Mode**: `DEFAULT_MODE` (`proxy`/`route`), `ALLOW_MODE_OVERRIDE`
**Verification**: `VERIFICATION_ENABLED`, `VERIFICATION_GATEWAY_SOURCE`, `VERIFICATION_GATEWAY_COUNT`
**Routing**: `ROUTING_STRATEGY`, `ROUTING_GATEWAY_SOURCE`, `ROUTING_STATIC_GATEWAYS`
**Network**: `NETWORK_GATEWAY_REFRESH_MS`, `NETWORK_MIN_GATEWAYS`, `NETWORK_FALLBACK_GATEWAYS`
**Cache**: `CONTENT_CACHE_ENABLED`, `CONTENT_CACHE_MAX_SIZE_BYTES`, `ARNS_CACHE_TTL_MS`
**Rate Limit**: `RATE_LIMIT_ENABLED`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS`
