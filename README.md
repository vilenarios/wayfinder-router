# Wayfinder Router

A lightweight proxy router for [ar.io](https://ar.io) network gateways with content verification.

## Features

- **Content Verification** - Verifies content integrity via hash checking against trusted gateways
- **Smart Gateway Selection** - Multiple routing strategies (fastest, random, round-robin) with health tracking
- **ArNS Support** - Resolves Arweave Name System names with consensus verification
- **Manifest Verification** - Verifies path manifests and their content mappings
- **Root Domain Hosting** - Serve any ArNS name directly at your root domain
- **Two Operating Modes**:
  - `proxy` - Fetches, verifies, and serves content
  - `route` - Redirects clients to gateway URLs
- **Caching** - In-memory LRU cache for verified content, manifests, and ArNS resolutions
- **Circuit Breaker** - Automatically removes unhealthy gateways from rotation
- **Telemetry** - SQLite-backed metrics for gateway performance tracking

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

Configure `ARNS_ROOT_HOST` to serve an ArNS name at your root domain:
```bash
# In .env
ARNS_ROOT_HOST=wayfinder
```

With this configuration:
- `https://yourdomain.com/` → Serves ArNS "wayfinder" content
- `https://yourdomain.com/docs` → Serves ArNS "wayfinder" at path `/docs`
- `https://yourdomain.com/wayfinder/info` → Router info page

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

| Endpoint | Description |
|----------|-------------|
| `/health` | Health check |
| `/ready` | Readiness check |
| `/metrics` | Prometheus metrics |
| `/wayfinder/info` | Router info and configuration |
| `/stats/gateways` | Gateway performance statistics |

When `ARNS_ROOT_HOST` is not set, the root endpoint (`/`) also displays router info.

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
