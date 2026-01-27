# Wayfinder Router

A lightweight proxy router for [ar.io](https://ar.io) network gateways with content verification.

## Features

- **Content Verification** - Verifies content integrity via hash checking against trusted gateways
- **Smart Gateway Selection** - Multiple routing strategies (fastest, random, round-robin, temperature) with health tracking
- **ArNS Support** - Resolves Arweave Name System names with consensus verification
- **Manifest Verification** - Verifies path manifests and their content mappings
- **Root Domain Hosting** - Serve any ArNS name or txId directly at your root domain
- **Restrict to Root Host Mode** - Lock down router to serve only root domain content
- **GraphQL Proxy** - Proxy GraphQL requests to an upstream Arweave query endpoint
- **Two Operating Modes**:
  - `proxy` - Fetches, verifies, and serves content
  - `route` - Redirects clients to gateway URLs
- **Caching** - In-memory LRU cache for verified content, manifests, and ArNS resolutions
- **Circuit Breaker** - Automatically removes unhealthy gateways from rotation
- **Telemetry** - SQLite-backed metrics for gateway performance tracking
- **Gateway Rewards** - Off-chain incentive system to reward gateways for serving traffic

## Requirements

- Node.js (see `engines` in [package.json](package.json))

## Installation

```bash
npm install
```

## Quick Start

```bash
# Copy example environment file
cp .env.example .env

# Start development server
npm run dev

# Or build and run production
npm run build
npm start
```

The server starts at `http://localhost:3000` by default.

## Usage

### Root Domain Hosting

Configure `ROOT_HOST_CONTENT` to serve an ArNS name or transaction ID at your root domain:
```bash
# In .env - serve an ArNS name
ROOT_HOST_CONTENT=wayfinder

# Or serve a transaction ID directly
ROOT_HOST_CONTENT=bNbA3TEQVL60xlgCcqdz4ZPHFZ711cZ3hmkpGttDt_U
```

With this configuration:
- `https://yourdomain.com/` → Serves the configured content
- `https://yourdomain.com/docs` → Serves at path `/docs`
- `https://yourdomain.com/wayfinder/info` → Router info page

### Restrict to Root Host Only

Lock down the router to serve only root domain content:
```bash
# In .env
ROOT_HOST_CONTENT=wayfinder
RESTRICT_TO_ROOT_HOST=true
```

When enabled:
- Subdomain requests are rejected with 404
- TxId path requests (e.g., `/{txId}`) are rejected with 404
- Root domain paths work normally
- Router management endpoints (`/wayfinder/*`) still work

### GraphQL Proxy

Proxy `/graphql` requests to an upstream GraphQL endpoint:
```bash
# In .env
GRAPHQL_PROXY_URL=https://arweave-search.goldsky.com/graphql
```

When configured, clients can query Arweave data via `https://yourdomain.com/graphql`.

### ArNS Subdomain Requests

Access ArNS names via subdomain:
```
http://{arns-name}.localhost:3000/
```

### Transaction ID Requests

Access content by Arweave transaction ID:
```
http://localhost:3000/{txId}
http://localhost:3000/{txId}/path/to/file
```

### Mode Override

Force a specific mode via query parameter:
```
http://localhost:3000/{txId}?mode=route
http://localhost:3000/{txId}?mode=proxy
```

## Configuration

Configuration is managed via environment variables. See [.env.example](.env.example) for all available options and their defaults.

## API Endpoints

Router management endpoints are under the `/wayfinder/` prefix:

| Endpoint | Description |
|----------|-------------|
| `/wayfinder/health` | Health check |
| `/wayfinder/ready` | Readiness check |
| `/wayfinder/metrics` | Prometheus metrics |
| `/wayfinder/info` | Router info and configuration |
| `/wayfinder/stats/gateways` | Gateway performance statistics |
| `/graphql` | GraphQL proxy (requires `GRAPHQL_PROXY_URL`) |

When `ROOT_HOST_CONTENT` is not set, the root endpoint (`/`) displays router info.

## Gateway Rewards

The rewards system distributes ARIO tokens to gateways based on their performance serving traffic through Wayfinder Router.

### Reward Calculation

Gateways are scored on four weighted factors:
- **Volume (40%)** - Number of requests served
- **Reliability (25%)** - Success rate
- **Speed (20%)** - P95 latency
- **Bandwidth (15%)** - Bytes served

Verification gateways receive a 15% bonus. Rewards are split between operators and delegates according to gateway delegation settings.

### CLI Commands

```bash
# Calculate yesterday's rewards
npm run rewards:calculate

# Calculate for a specific date
npm run rewards calculate --date 2026-01-25

# List all reward periods
npm run rewards:list

# Preview distribution (see operator/delegate splits)
npm run rewards preview <periodId>

# Run fraud detection
npm run rewards fraud-check <periodId>

# Approve for distribution (after review)
npm run rewards approve <periodId>

# Execute distribution (dry-run first!)
npm run rewards distribute <periodId> --dry-run
npm run rewards distribute <periodId>
```

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `REWARDS_DATA_DIR` | `./data/rewards` | Directory for reward period data |
| `TELEMETRY_DB_PATH` | `./data/telemetry.db` | Path to telemetry database |
| `INSTANCE_ID` | `wayfinder-main` | Identifier for this instance |

See [CLAUDE.md](CLAUDE.md) for detailed documentation.

## Docker

```bash
# Development
docker compose up

# Production
docker build -t wayfinder-router .
docker run -p 3000:3000 --env-file .env wayfinder-router
```

## Development

```bash
npm run dev          # Start with hot reload
npm run build        # Compile TypeScript
npm run typecheck    # Type check without emitting
npm run test         # Run tests
npm run test:watch   # Run tests in watch mode
```

## License

Apache-2.0
