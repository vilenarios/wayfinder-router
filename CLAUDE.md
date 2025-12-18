# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Wayfinder Router is a lightweight proxy router for the ar.io network. It acts as an intermediary between clients and Arweave gateways, providing:
- Content verification via hash checking against trusted gateways
- Smart gateway selection with health tracking and circuit breaker patterns
- ArNS (Arweave Name System) resolution with consensus verification
- Caching for verified content and ArNS resolutions
- Two operating modes: `proxy` (fetch, verify, serve) and `route` (redirect to gateway)

## Common Commands

```bash
npm run dev          # Start development server with hot reload (tsx watch)
npm run build        # Compile TypeScript to dist/
npm run start        # Run compiled server from dist/
npm run typecheck    # Type-check without emitting
npm run test         # Run tests once with vitest
npm run test:watch   # Run tests in watch mode
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
   - `error-handler.ts` - Standardized error responses

2. **Handlers** (`src/handlers/`):
   - `proxy.ts` - Fetches content, verifies, serves (main data path)
   - `route.ts` - Redirects to selected gateway
   - `health.ts` - Health/ready/metrics endpoints
   - `stats.ts` - Telemetry API endpoints

3. **Services** (`src/services/`):
   - `wayfinder-client.ts` - Wraps `@ar.io/wayfinder-core` SDK, creates strategies
   - `gateway-selector.ts` - Smart gateway selection with health tracking
   - `content-fetcher.ts` - Fetches from gateways with retry logic
   - `verifier.ts` - Streaming hash verification
   - `arns-resolver.ts` - ArNS name to txId resolution

4. **Cache** (`src/cache/`):
   - `arns-cache.ts` - TTL cache for ArNS resolutions
   - `gateway-health.ts` - Health tracking with circuit breaker
   - `content-cache.ts` - LRU cache for verified content

5. **Telemetry** (`src/telemetry/`):
   - `collector.ts` - Request metrics collection
   - `storage.ts` - SQLite persistence (better-sqlite3)
   - `service.ts` - Telemetry service facade

### Key Dependencies
- `@ar.io/wayfinder-core` - SDK for routing strategies, gateway providers, verification
- `hono` - Web framework with `@hono/node-server`
- `better-sqlite3` - Telemetry storage
- `pino` / `pino-pretty` - Logging

### Request Types
Determined by `src/middleware/request-parser.ts`:
- **ArNS**: Subdomain request like `{arnsName}.{baseDomain}`
- **TxId**: Path request like `/{43-char-base64url}`
- **Reserved**: System paths (`/health`, `/ready`, `/metrics`, `/stats/*`)

### Verification Modes
- **Strict** (`VERIFICATION_STRICT=true`): Buffers entire response, verifies before serving
- **Non-strict** (default): Streams while verifying in background

### Routing Strategies
Configured via `ROUTING_STRATEGY`:
- `fastest` - Concurrent ping, use first responder
- `random` - Random healthy gateway
- `round-robin` - Sequential rotation

### Gateway Sources
Configured via `GATEWAY_SOURCE`:
- `trusted-peers` - Fetch from gateway's `/ar-io/peers` endpoint
- `static` - Use `STATIC_GATEWAYS` list
- `network` - (planned) ar.io network registry

## Configuration

All configuration via environment variables. See `.env.example` for full list. Key variables:
- `BASE_DOMAIN` - Domain for ArNS subdomain routing
- `DEFAULT_MODE` - `proxy` or `route`
- `VERIFICATION_ENABLED/STRICT` - Content verification settings
- `TRUSTED_GATEWAYS` - Comma-separated gateway URLs for verification
- `ROUTING_STRATEGY` - Gateway selection algorithm
- `GATEWAY_SOURCE` - Where to get gateway list
