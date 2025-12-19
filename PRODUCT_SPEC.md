# Wayfinder Router - Product Specification

**Version:** 1.2
**Status:** Draft
**Last Updated:** December 2024

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Vision](#2-product-vision)
3. [Core Principles](#3-core-principles)
4. [Target Audience](#4-target-audience)
5. [Use Cases](#5-use-cases)
6. [Functional Requirements](#6-functional-requirements)
7. [Non-Functional Requirements](#7-non-functional-requirements)
8. [System Architecture](#8-system-architecture)
9. [API Specification](#9-api-specification)
10. [Configuration Reference](#10-configuration-reference)
11. [Security Model](#11-security-model)
12. [Deployment Guide](#12-deployment-guide)
13. [Monitoring & Observability](#13-monitoring--observability)
14. [Performance Benchmarks](#14-performance-benchmarks)
15. [Future Roadmap](#15-future-roadmap)
16. [Glossary](#16-glossary)

---

## 1. Executive Summary

### What is Wayfinder Router?

Wayfinder Router is a **lightweight, high-performance proxy server** that provides a trusted single-domain entry point to the decentralized ar.io gateway network. It enables organizations to access Arweave permanent storage through a single trusted domain while leveraging the resilience and distribution of the entire ar.io network.

### The Problem

Organizations accessing Arweave data face a trust dilemma:

- **Single gateway dependency**: Trusting one gateway creates a single point of failure and requires trusting that operator
- **Direct network access**: Accessing multiple gateways directly requires trusting each one individually
- **Verification complexity**: Implementing data verification client-side is complex and resource-intensive
- **Domain management**: Managing multiple gateway domains complicates security policies, CORS, and user experience

### The Solution

Wayfinder Router solves this by:

1. **Single trusted domain**: Users trust only `your-router.com`, not individual gateways
2. **Network-backed resilience**: Routes requests across the entire ar.io network
3. **Cryptographic verification**: Verifies all data before serving to users
4. **Transparent operation**: Functions as a drop-in replacement for direct gateway access

### Key Metrics

| Metric | Target |
|--------|--------|
| Request latency (p50) | < 100ms overhead |
| Request latency (p99) | < 500ms overhead |
| Availability | 99.9% uptime |
| Verification accuracy | 100% (cryptographic) |
| Gateway failover time | < 1 second |

---

## 2. Product Vision

### Mission Statement

> Enable any organization to access the permanent web through a single trusted endpoint, backed by the resilience of a decentralized network, without sacrificing security or performance.

### Vision

Wayfinder Router becomes the standard way enterprises and institutions access Arweave data—providing the simplicity of a single API endpoint with the security guarantees of cryptographic verification and the resilience of a decentralized network.

### Strategic Goals

1. **Trust Minimization**: Reduce the trust surface from "trust every gateway" to "trust one domain + cryptography"
2. **Enterprise Adoption**: Enable regulated industries to access permanent storage with audit trails
3. **Developer Experience**: Provide a simple, familiar HTTP interface that "just works"
4. **Network Health**: Distribute load across the ar.io network, improving overall ecosystem resilience

---

## 3. Core Principles

### 3.1 Security First

Every design decision prioritizes security:

- **Zero trust for gateways**: All gateway responses are cryptographically verified
- **Consensus-based resolution**: ArNS names require multiple gateways to agree
- **No data leakage**: Internal gateway headers are stripped from responses
- **Fail secure**: When in doubt, reject rather than serve potentially bad data

### 3.2 Resilience by Design

The router must be more reliable than any single gateway:

- **Automatic failover**: Failed gateways are bypassed transparently
- **Circuit breakers**: Repeated failures trigger temporary blacklisting
- **Graceful degradation**: Partial failures don't cause total outages
- **Self-healing**: Recovered gateways are automatically re-enabled

### 3.3 Performance Without Compromise

Security and resilience cannot come at the cost of unusable performance:

- **Streaming verification**: Data flows to users while being verified
- **Intelligent routing**: Fastest available gateway is selected
- **Minimal overhead**: Proxy adds < 100ms latency in typical cases
- **Efficient caching**: Reduce redundant verification work

### 3.4 Operational Simplicity

The router should be easy to deploy and maintain:

- **Single binary/container**: No complex dependencies
- **Environment-based configuration**: 12-factor app compliance
- **Observable by default**: Metrics, logs, and health checks built-in
- **Horizontal scalability**: Stateless design enables easy scaling

### 3.5 Transparency

Users should understand exactly what the router does:

- **Clear documentation**: Every feature and behavior documented
- **Audit headers**: Response headers indicate verification status
- **Open source**: Full source code available for inspection
- **No hidden behavior**: What you configure is what you get

---

## 4. Target Audience

### 4.1 Primary: Enterprise & Institutions

**Profile:**
- Organizations in regulated industries (finance, healthcare, government)
- Companies with strict security and compliance requirements
- Institutions requiring audit trails and verifiable data access

**Needs:**
- Single trusted endpoint for security policies
- Cryptographic proof of data integrity
- SLA-backed reliability
- Integration with existing infrastructure (load balancers, WAFs)

**Pain Points:**
- Cannot trust arbitrary third-party gateways
- Need to demonstrate data provenance for compliance
- Require consistent, predictable API behavior

### 4.2 Secondary: dApp Developers

**Profile:**
- Developers building applications on Arweave
- Teams needing reliable content delivery for their users
- Projects requiring high availability without running infrastructure

**Needs:**
- Simple API that mirrors gateway behavior
- Reliable uptime without managing gateways
- Fast content delivery globally

### 4.3 Tertiary: Gateway Operators

**Profile:**
- Organizations running ar.io gateways
- Gateway operators wanting to offer premium services
- Network participants wanting to add value

**Needs:**
- White-label router deployment
- Integration with existing gateway infrastructure
- Differentiation through verified content delivery

---

## 5. Use Cases

### 5.1 Permanent Document Storage

**Scenario:** A legal firm stores contracts on Arweave and needs to retrieve them with proof of integrity.

**Flow:**
1. User requests `https://router.lawfirm.com/{contractTxId}`
2. Router fetches from fastest available gateway
3. Router verifies content hash against trusted gateways
4. User receives verified document with `x-wayfinder-verified: true` header
5. Firm's audit log records the verification

**Requirements:**
- Hash verification mandatory
- Strict mode enabled (no unverified content)
- Audit logging of all requests

### 5.2 Decentralized Application Hosting

**Scenario:** A DeFi protocol hosts its frontend on Arweave via ArNS name `protocol.ar`.

**Flow:**
1. User visits `https://protocol.defi-router.com`
2. Router resolves `protocol` ArNS name with consensus
3. Router fetches and verifies the frontend bundle
4. User receives verified HTML/JS/CSS
5. Subsequent asset requests are also verified

**Requirements:**
- ArNS subdomain routing
- Manifest handling for multi-file apps
- Fast initial load (< 2s TTFB)

### 5.3 Content Delivery Network

**Scenario:** A media company uses Arweave for permanent asset storage and needs fast global delivery.

**Flow:**
1. CDN edge receives request for `https://assets.media.com/{imageTxId}`
2. Edge checks cache; on miss, requests from Wayfinder Router
3. Router fetches from nearest/fastest gateway
4. Router verifies and streams to edge
5. Edge caches verified content

**Requirements:**
- Route mode for CDN integration (redirect to gateway)
- Low latency gateway selection
- Cache-friendly response headers

### 5.4 Regulatory Compliance Access

**Scenario:** A healthcare provider accesses patient records stored on Arweave.

**Flow:**
1. Internal system requests `https://internal-router.hospital.org/{recordTxId}`
2. Router verifies requestor (via network policy, not router auth)
3. Router fetches and cryptographically verifies record
4. Response includes verification proof headers
5. Access logged for HIPAA compliance

**Requirements:**
- Strict verification (no exceptions)
- Detailed audit logging
- Integration with enterprise logging systems

### 5.5 Gateway Load Distribution

**Scenario:** An ar.io gateway operator wants to distribute load across peer gateways.

**Flow:**
1. Gateway receives more traffic than it can handle
2. Gateway deploys Wayfinder Router as frontend
3. Router distributes requests across trusted peer gateways
4. Router verifies responses before serving
5. Operator's gateway handles overflow only

**Requirements:**
- Configurable gateway pool
- Round-robin or weighted routing
- Health-based exclusion

---

## 6. Functional Requirements

### 6.1 Request Routing

#### 6.1.1 ArNS Subdomain Routing

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1.1 | Router MUST accept requests with ArNS names as subdomains | P0 |
| FR-1.2 | ArNS names MUST be resolved to transaction IDs before routing | P0 |
| FR-1.3 | ArNS resolution MUST use consensus across multiple trusted gateways | P0 |
| FR-1.4 | Consensus threshold MUST be configurable (default: 2) | P1 |
| FR-1.5 | ArNS resolution results MUST be cached with TTL from gateway | P1 |
| FR-1.6 | Failed ArNS resolution MUST return 404 with descriptive error | P0 |
| FR-1.7 | ArNS consensus mismatch MUST return 502 with security warning | P0 |

**URL Format:** `https://{arnsName}.{routerDomain}/{path}`

**Examples:**
- `https://ardrive.router.example.com/` → ArNS "ardrive"
- `https://cookbook.router.example.com/recipes/1` → ArNS "cookbook" with path

#### 6.1.2 Transaction ID Path Routing

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-2.1 | Router MUST accept 43-character base64url transaction IDs in path | P0 |
| FR-2.2 | Transaction ID MUST be the first path segment | P0 |
| FR-2.3 | Remaining path segments MUST be forwarded to gateway | P0 |
| FR-2.4 | Invalid transaction ID format MUST return 400 | P1 |

**URL Format:** `https://{routerDomain}/{txId}/{path}`

**Examples:**
- `https://router.example.com/bNbA3TEQVL60xlgCcqdz4ZPHFZ711cZ3hmkpGttDt_U`
- `https://router.example.com/bNbA3TEQVL60xlgCcqdz4ZPHFZ711cZ3hmkpGttDt_U/index.html`

#### 6.1.3 Gateway Selection

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-3.1 | Router MUST support multiple gateway selection strategies | P0 |
| FR-3.2 | "Fastest" strategy MUST select gateway with lowest latency | P0 |
| FR-3.3 | "Random" strategy MUST randomly select from healthy gateways | P1 |
| FR-3.4 | "Round-robin" strategy MUST cycle through gateways sequentially | P1 |
| FR-3.5 | Unhealthy gateways MUST be excluded from selection | P0 |
| FR-3.6 | Gateway health MUST be determined by recent request success | P0 |
| FR-3.7 | Gateway selection strategy MUST be configurable | P0 |

### 6.2 Operating Modes

#### 6.2.1 Proxy Mode

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-4.1 | Proxy mode MUST fetch content from selected gateway | P0 |
| FR-4.2 | Proxy mode MUST stream content to client | P0 |
| FR-4.3 | Proxy mode MUST verify content if verification enabled | P0 |
| FR-4.4 | Proxy mode MUST add Wayfinder headers to response | P0 |
| FR-4.5 | Proxy mode MUST strip internal gateway headers | P0 |
| FR-4.6 | Proxy mode MUST preserve relevant content headers | P0 |

**Response Headers Added:**
```
x-wayfinder-mode: proxy
x-wayfinder-verified: true|false
x-wayfinder-gateway: https://gateway-used.example.com
x-wayfinder-txid: resolved-transaction-id
x-wayfinder-verification-time-ms: 123
```

**Headers Stripped:**
```
x-ar-io-digest
x-ar-io-verified
set-cookie
```

**Headers Preserved:**
```
content-type
content-length
content-disposition
cache-control
etag
last-modified
```

#### 6.2.2 Route Mode

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-5.1 | Route mode MUST return HTTP 302 redirect to gateway URL | P0 |
| FR-5.2 | Route mode MUST still resolve ArNS names with consensus | P0 |
| FR-5.3 | Route mode MUST select gateway using configured strategy | P0 |
| FR-5.4 | Redirect URL MUST use gateway's subdomain format | P1 |
| FR-5.5 | Route mode MUST be selectable via query parameter | P1 |

**Redirect Format:**
- ArNS: `302 → https://{arnsName}.{gateway}/{path}`
- TxId: `302 → https://{sandbox}.{gateway}/{path}`

### 6.3 Data Verification

#### 6.3.1 Hash Verification

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-6.1 | Router MUST compute SHA-256 hash of received content | P0 |
| FR-6.2 | Router MUST fetch expected hash from trusted gateway | P0 |
| FR-6.3 | Router MUST compare computed hash with expected hash | P0 |
| FR-6.4 | Hash mismatch MUST be treated as verification failure | P0 |
| FR-6.5 | Trusted gateways for verification MUST be configurable | P0 |
| FR-6.6 | Verification MUST timeout after configurable duration | P1 |

#### 6.3.2 Verification Modes

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-7.1 | Strict mode MUST buffer content before streaming | P0 |
| FR-7.2 | Strict mode MUST only serve verified content | P0 |
| FR-7.3 | Non-strict mode MUST stream while verifying | P0 |
| FR-7.4 | Non-strict mode MUST log verification failures | P0 |
| FR-7.5 | Verification mode MUST be configurable | P0 |
| FR-7.6 | Verification can be disabled entirely via configuration | P1 |

**Strict Mode Flow:**
```
Request → Fetch → Buffer → Verify → Stream (if pass) OR Error (if fail)
```

**Non-Strict Mode Flow:**
```
Request → Fetch → Stream + Verify (parallel) → Log result
```

#### 6.3.3 Verification Bypass

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-8.1 | Verification MAY be disabled for specific paths | P2 |
| FR-8.2 | Verification bypass MUST be explicitly configured | P2 |
| FR-8.3 | Bypassed requests MUST be clearly marked in headers | P2 |

### 6.4 Caching

#### 6.4.1 ArNS Resolution Cache

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-9.1 | ArNS resolutions MUST be cached | P0 |
| FR-9.2 | Cache TTL MUST respect gateway-provided TTL | P0 |
| FR-9.3 | Cache TTL MUST have configurable maximum | P1 |
| FR-9.4 | Cache MUST be invalidatable via API | P2 |

#### 6.4.2 Gateway List Cache

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-10.1 | Gateway list MUST be cached | P0 |
| FR-10.2 | Cache TTL MUST be configurable | P0 |
| FR-10.3 | Cache MUST refresh in background before expiry | P2 |

#### 6.4.3 Content Cache (Optional)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-11.1 | Verified content MAY be cached | P2 |
| FR-11.2 | Content cache MUST have configurable max size | P2 |
| FR-11.3 | Content cache MUST use LRU eviction | P2 |
| FR-11.4 | Cached content MUST be marked in response headers | P2 |

### 6.5 Rate Limiting

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-12.1 | Router MUST support request rate limiting | P1 |
| FR-12.2 | Rate limits MUST be configurable per time window | P1 |
| FR-12.3 | Rate limit exceeded MUST return 429 | P1 |
| FR-12.4 | Rate limit headers MUST be included in responses | P1 |
| FR-12.5 | Rate limiting MUST be bypassable for health checks | P1 |

**Rate Limit Headers:**
```
x-ratelimit-limit: 1000
x-ratelimit-remaining: 999
x-ratelimit-reset: 1640000000
retry-after: 60
```

### 6.6 Health & Monitoring

#### 6.6.1 Health Endpoints

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-13.1 | Router MUST expose `/wayfinder/health` endpoint | P0 |
| FR-13.2 | Router MUST expose `/wayfinder/ready` endpoint | P0 |
| FR-13.3 | Router MUST expose `/wayfinder/metrics` endpoint | P0 |
| FR-13.4 | Health endpoints MUST be excluded from rate limiting | P0 |
| FR-13.5 | `/wayfinder/ready` MUST verify gateway connectivity | P1 |
| FR-13.6 | All router endpoints MUST be under `/wayfinder/` prefix | P0 |

#### 6.6.2 Metrics

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-14.1 | Metrics MUST be Prometheus-compatible | P0 |
| FR-14.2 | Metrics MUST include request counts by status | P0 |
| FR-14.3 | Metrics MUST include request latency histograms | P0 |
| FR-14.4 | Metrics MUST include verification success/failure counts | P0 |
| FR-14.5 | Metrics MUST include gateway health status | P0 |
| FR-14.6 | Metrics MUST include cache hit/miss rates | P1 |

---

## 7. Non-Functional Requirements

### 7.1 Performance

| ID | Requirement | Target | Priority |
|----|-------------|--------|----------|
| NFR-1.1 | Request latency overhead (p50) | < 50ms | P0 |
| NFR-1.2 | Request latency overhead (p99) | < 200ms | P0 |
| NFR-1.3 | Throughput (single instance) | > 1000 req/s | P1 |
| NFR-1.4 | Memory usage (idle) | < 128MB | P1 |
| NFR-1.5 | Memory usage (under load) | < 512MB | P1 |
| NFR-1.6 | Startup time | < 5 seconds | P1 |
| NFR-1.7 | Graceful shutdown time | < 10 seconds | P1 |

### 7.2 Scalability

| ID | Requirement | Priority |
|----|-------------|----------|
| NFR-2.1 | Router MUST be horizontally scalable | P0 |
| NFR-2.2 | Router MUST be stateless (no shared state required) | P0 |
| NFR-2.3 | Router MUST support deployment behind load balancer | P0 |
| NFR-2.4 | Router SHOULD support Kubernetes deployment | P1 |
| NFR-2.5 | Router SHOULD support auto-scaling triggers | P2 |

### 7.3 Availability

| ID | Requirement | Target | Priority |
|----|-------------|--------|----------|
| NFR-3.1 | Service availability | 99.9% uptime | P0 |
| NFR-3.2 | Mean time to recovery | < 1 minute | P0 |
| NFR-3.3 | Graceful degradation on partial failure | Required | P0 |
| NFR-3.4 | Zero-downtime deployments | Required | P1 |

### 7.4 Security

| ID | Requirement | Priority |
|----|-------------|----------|
| NFR-4.1 | All gateway communication MUST use HTTPS | P0 |
| NFR-4.2 | Router MUST NOT log sensitive request content | P0 |
| NFR-4.3 | Router MUST sanitize error messages | P0 |
| NFR-4.4 | Router MUST support TLS termination | P0 |
| NFR-4.5 | Router SHOULD support mTLS to gateways | P2 |
| NFR-4.6 | Router MUST not be vulnerable to SSRF | P0 |

### 7.5 Observability

| ID | Requirement | Priority |
|----|-------------|----------|
| NFR-5.1 | Router MUST emit structured JSON logs | P0 |
| NFR-5.2 | Router MUST support configurable log levels | P0 |
| NFR-5.3 | Router MUST include request correlation IDs | P0 |
| NFR-5.4 | Router SHOULD support distributed tracing | P2 |
| NFR-5.5 | Router SHOULD support OpenTelemetry | P2 |

### 7.6 Compatibility

| ID | Requirement | Priority |
|----|-------------|----------|
| NFR-6.1 | Router MUST run on Linux x64 and arm64 | P0 |
| NFR-6.2 | Router MUST be available as Docker image | P0 |
| NFR-6.3 | Router SHOULD run on Windows and macOS | P2 |
| NFR-6.4 | Router MUST support Node.js 20+ | P0 |

---

## 8. System Architecture

### 8.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              INTERNET                                        │
│                                                                              │
│    ┌──────────────────┐         ┌──────────────────┐                        │
│    │ User Browser     │         │ User Application │                        │
│    │ (ArNS subdomain) │         │ (TxId path)      │                        │
│    └────────┬─────────┘         └────────┬─────────┘                        │
│             │                            │                                   │
│             │ HTTPS                      │ HTTPS                            │
│             └────────────┬───────────────┘                                  │
│                          ▼                                                   │
│    ┌─────────────────────────────────────────────────────────────────────┐  │
│    │                         LOAD BALANCER                                │  │
│    │                    (TLS Termination, WAF)                            │  │
│    └─────────────────────────────┬───────────────────────────────────────┘  │
│                                  │                                           │
└──────────────────────────────────┼───────────────────────────────────────────┘
                                   │
┌──────────────────────────────────┼───────────────────────────────────────────┐
│                    WAYFINDER ROUTER CLUSTER                                  │
│                                  │                                           │
│    ┌─────────────────────────────┼─────────────────────────────────────┐    │
│    │                             ▼                                      │    │
│    │    ┌─────────────┐   ┌─────────────┐   ┌─────────────┐            │    │
│    │    │  Router 1   │   │  Router 2   │   │  Router N   │            │    │
│    │    │             │   │             │   │             │            │    │
│    │    │ ┌─────────┐ │   │ ┌─────────┐ │   │ ┌─────────┐ │            │    │
│    │    │ │ Hono    │ │   │ │ Hono    │ │   │ │ Hono    │ │            │    │
│    │    │ │ Server  │ │   │ │ Server  │ │   │ │ Server  │ │            │    │
│    │    │ └────┬────┘ │   │ └────┬────┘ │   │ └────┬────┘ │            │    │
│    │    │      │      │   │      │      │   │      │      │            │    │
│    │    │ ┌────┴────┐ │   │ ┌────┴────┐ │   │ ┌────┴────┐ │            │    │
│    │    │ │Services │ │   │ │Services │ │   │ │Services │ │            │    │
│    │    │ │ Layer   │ │   │ │ Layer   │ │   │ │ Layer   │ │            │    │
│    │    │ └─────────┘ │   │ └─────────┘ │   │ └─────────┘ │            │    │
│    │    └─────────────┘   └─────────────┘   └─────────────┘            │    │
│    │           │                 │                 │                    │    │
│    └───────────┼─────────────────┼─────────────────┼────────────────────┘    │
│                └─────────────────┼─────────────────┘                         │
│                                  │                                           │
└──────────────────────────────────┼───────────────────────────────────────────┘
                                   │ HTTPS
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         AR.IO GATEWAY NETWORK                                 │
│                                                                              │
│    ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   │
│    │  arweave.net│   │  ar-io.dev  │   │ permagate.io│   │  Gateway N  │   │
│    │  (Gateway)  │   │  (Gateway)  │   │  (Gateway)  │   │  (Gateway)  │   │
│    └─────────────┘   └─────────────┘   └─────────────┘   └─────────────┘   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Component Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         WAYFINDER ROUTER INSTANCE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  HTTP LAYER                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  Hono Server                                                            │ │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │ │
│  │  │    CORS      │ │   Request    │ │     Mode     │ │    Error     │  │ │
│  │  │  Middleware  │→│    Parser    │→│   Selector   │→│   Handler    │  │ │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                          │                                   │
│  HANDLER LAYER                           ▼                                   │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐     │ │
│  │  │   Proxy Handler  │  │   Route Handler  │  │  Health Handler  │     │ │
│  │  │                  │  │                  │  │                  │     │ │
│  │  │ • Fetch content  │  │ • Build redirect │  │ • /health        │     │ │
│  │  │ • Verify data    │  │ • Return 302     │  │ • /ready         │     │ │
│  │  │ • Stream response│  │                  │  │ • /metrics       │     │ │
│  │  └──────────────────┘  └──────────────────┘  └──────────────────┘     │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                          │                                   │
│  SERVICE LAYER                           ▼                                   │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │ │
│  │  │    ArNS      │ │   Gateway    │ │   Content    │ │   Verifier   │  │ │
│  │  │   Resolver   │ │   Selector   │ │   Fetcher    │ │              │  │ │
│  │  │              │ │              │ │              │ │              │  │ │
│  │  │ • Consensus  │ │ • Strategy   │ │ • Retry      │ │ • Hash       │  │ │
│  │  │ • Caching    │ │ • Health     │ │ • Failover   │ │ • Streaming  │  │ │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                          │                                   │
│  CACHE LAYER                             ▼                                   │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                   │ │
│  │  │  ArNS Cache  │ │Gateway Health│ │Content Cache │                   │ │
│  │  │    (LRU)     │ │   (Circuit)  │ │ (Optional)   │                   │ │
│  │  └──────────────┘ └──────────────┘ └──────────────┘                   │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                          │                                   │
│  SDK LAYER                               ▼                                   │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                     WAYFINDER CORE SDK                                  │ │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                   │ │
│  │  │   Routing    │ │ Verification │ │   Gateway    │                   │ │
│  │  │  Strategies  │ │  Strategies  │ │  Providers   │                   │ │
│  │  └──────────────┘ └──────────────┘ └──────────────┘                   │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.3 Request Flow

#### 8.3.1 Proxy Mode Flow

```
┌──────┐     ┌──────────────┐     ┌──────────────┐     ┌─────────────┐
│Client│     │Wayfinder     │     │Content       │     │Gateway      │
│      │     │Router        │     │Fetcher       │     │Network      │
└──┬───┘     └──────┬───────┘     └──────┬───────┘     └──────┬──────┘
   │                │                    │                    │
   │ GET /txId      │                    │                    │
   │───────────────>│                    │                    │
   │                │                    │                    │
   │                │ Parse Request      │                    │
   │                │ (extract txId)     │                    │
   │                │                    │                    │
   │                │ Select Gateway     │                    │
   │                │ (fastest ping)     │                    │
   │                │                    │                    │
   │                │ Fetch Content      │                    │
   │                │───────────────────>│                    │
   │                │                    │                    │
   │                │                    │ GET /txId          │
   │                │                    │───────────────────>│
   │                │                    │                    │
   │                │                    │    200 OK + Data   │
   │                │                    │<───────────────────│
   │                │                    │                    │
   │                │  Stream + Verify   │                    │
   │                │<───────────────────│                    │
   │                │                    │                    │
   │  200 OK        │                    │                    │
   │  + Verified    │                    │                    │
   │  + Headers     │                    │                    │
   │<───────────────│                    │                    │
   │                │                    │                    │
```

#### 8.3.2 ArNS Resolution Flow

```
┌──────┐     ┌──────────────┐     ┌──────────────┐     ┌─────────────┐
│Client│     │Wayfinder     │     │ArNS          │     │Trusted      │
│      │     │Router        │     │Resolver      │     │Gateways     │
└──┬───┘     └──────┬───────┘     └──────┬───────┘     └──────┬──────┘
   │                │                    │                    │
   │ GET            │                    │                    │
   │ ardrive.router │                    │                    │
   │───────────────>│                    │                    │
   │                │                    │                    │
   │                │ Resolve "ardrive"  │                    │
   │                │───────────────────>│                    │
   │                │                    │                    │
   │                │                    │ HEAD ardrive.gw1   │
   │                │                    │───────────────────>│
   │                │                    │                    │
   │                │                    │ HEAD ardrive.gw2   │
   │                │                    │───────────────────>│
   │                │                    │                    │
   │                │                    │    x-arns-resolved │
   │                │                    │    -id: abc123     │
   │                │                    │<───────────────────│
   │                │                    │                    │
   │                │                    │ Check Consensus    │
   │                │                    │ (all agree?)       │
   │                │                    │                    │
   │                │    txId: abc123    │                    │
   │                │<───────────────────│                    │
   │                │                    │                    │
   │                │ Continue with txId │                    │
   │                │ (fetch & verify)   │                    │
   │                │                    │                    │
```

### 8.4 Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            DATA FLOW DIAGRAM                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────┐                                                                │
│  │ Request │                                                                │
│  │ Input   │                                                                │
│  └────┬────┘                                                                │
│       │                                                                      │
│       ▼                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         REQUEST PARSING                              │   │
│  │                                                                      │   │
│  │  Input: HTTP Request                                                 │   │
│  │  Output: { type: 'arns'|'txid', identifier, path }                  │   │
│  │                                                                      │   │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐              │   │
│  │  │ Check Host  │───>│ Check Path  │───>│ Validate    │              │   │
│  │  │ Subdomain   │    │ First Seg   │    │ Format      │              │   │
│  │  └─────────────┘    └─────────────┘    └─────────────┘              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│       │                                                                      │
│       │ type='arns'                   │ type='txid'                         │
│       ▼                               ▼                                      │
│  ┌─────────────────────┐    ┌─────────────────────┐                        │
│  │  ArNS RESOLUTION    │    │  DIRECT ROUTING     │                        │
│  │                     │    │                     │                        │
│  │  • Check cache      │    │  • txId already     │                        │
│  │  • Query gateways   │    │    known            │                        │
│  │  • Verify consensus │    │                     │                        │
│  │  • Cache result     │    │                     │                        │
│  │                     │    │                     │                        │
│  │  Output: txId       │    │  Output: txId       │                        │
│  └──────────┬──────────┘    └──────────┬──────────┘                        │
│             │                          │                                    │
│             └────────────┬─────────────┘                                   │
│                          ▼                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                       GATEWAY SELECTION                              │   │
│  │                                                                      │   │
│  │  Input: txId, path, healthy gateways                                │   │
│  │  Output: selected gateway URL                                        │   │
│  │                                                                      │   │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐              │   │
│  │  │ Get Gateway │───>│ Filter      │───>│ Apply       │              │   │
│  │  │ List        │    │ Unhealthy   │    │ Strategy    │              │   │
│  │  └─────────────┘    └─────────────┘    └─────────────┘              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                          │                                                  │
│       ┌──────────────────┼──────────────────┐                              │
│       │ mode='proxy'     │                  │ mode='route'                 │
│       ▼                  │                  ▼                               │
│  ┌─────────────────┐     │     ┌─────────────────┐                        │
│  │ CONTENT FETCH   │     │     │ BUILD REDIRECT  │                        │
│  │                 │     │     │                 │                        │
│  │ • Construct URL │     │     │ • Construct URL │                        │
│  │ • Fetch from GW │     │     │ • Return 302    │                        │
│  │ • Stream data   │     │     │                 │                        │
│  └────────┬────────┘     │     └────────┬────────┘                        │
│           │              │              │                                   │
│           ▼              │              │                                   │
│  ┌─────────────────┐     │              │                                   │
│  │ VERIFICATION    │     │              │                                   │
│  │                 │     │              │                                   │
│  │ • Compute hash  │     │              │                                   │
│  │ • Fetch digest  │     │              │                                   │
│  │ • Compare       │     │              │                                   │
│  └────────┬────────┘     │              │                                   │
│           │              │              │                                   │
│           └──────────────┼──────────────┘                                  │
│                          ▼                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                       RESPONSE FORMATTING                            │   │
│  │                                                                      │   │
│  │  • Add Wayfinder headers                                            │   │
│  │  • Strip internal headers                                           │   │
│  │  • Preserve content headers                                         │   │
│  │  • Stream to client                                                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                          │                                                  │
│                          ▼                                                  │
│                    ┌──────────┐                                            │
│                    │ Response │                                            │
│                    │ Output   │                                            │
│                    └──────────┘                                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. API Specification

### 9.1 Request Endpoints

#### 9.1.1 ArNS Subdomain Access

```
GET https://{arnsName}.{routerDomain}/{path}
```

**Parameters:**
| Parameter | Location | Required | Description |
|-----------|----------|----------|-------------|
| arnsName | subdomain | Yes | ArNS name (1-51 chars, alphanumeric + hyphen) |
| path | path | No | Resource path within the content |

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| mode | string | config default | `proxy` or `route` |

**Example:**
```
GET https://ardrive.router.example.com/
GET https://cookbook.router.example.com/recipes/pasta?mode=route
```

#### 9.1.2 Transaction ID Path Access

```
GET https://{routerDomain}/{txId}/{path}
```

**Parameters:**
| Parameter | Location | Required | Description |
|-----------|----------|----------|-------------|
| txId | path | Yes | 43-character base64url transaction ID |
| path | path | No | Resource path within the content |

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| mode | string | config default | `proxy` or `route` |

**Example:**
```
GET https://router.example.com/bNbA3TEQVL60xlgCcqdz4ZPHFZ711cZ3hmkpGttDt_U
GET https://router.example.com/bNbA3TEQVL60xlgCcqdz4ZPHFZ711cZ3hmkpGttDt_U/index.html
```

### 9.2 Response Format

#### 9.2.1 Successful Proxy Response

```http
HTTP/1.1 200 OK
Content-Type: text/html
Content-Length: 12345
Cache-Control: public, max-age=31536000, immutable
ETag: "abc123"
X-Wayfinder-Mode: proxy
X-Wayfinder-Verified: true
X-Wayfinder-Gateway: https://arweave.net
X-Wayfinder-TxId: bNbA3TEQVL60xlgCcqdz4ZPHFZ711cZ3hmkpGttDt_U
X-Wayfinder-Verification-Time-Ms: 45

<!DOCTYPE html>
...
```

#### 9.2.2 Successful Route Response

```http
HTTP/1.1 302 Found
Location: https://ardrive.arweave.net/
X-Wayfinder-Mode: route
X-Wayfinder-Gateway: https://arweave.net
X-Wayfinder-TxId: bNbA3TEQVL60xlgCcqdz4ZPHFZ711cZ3hmkpGttDt_U
```

#### 9.2.3 Error Responses

**ArNS Not Found (404):**
```json
{
  "error": "ARNS_RESOLUTION_FAILED",
  "message": "Failed to resolve ArNS name: only 0 of 2 required gateways responded",
  "arnsName": "nonexistent"
}
```

**Consensus Mismatch (502):**
```json
{
  "error": "ARNS_CONSENSUS_MISMATCH",
  "message": "ArNS resolution mismatch for \"example\": gateways returned different transaction IDs",
  "arnsName": "example",
  "hint": "Multiple trusted gateways returned different transaction IDs. This may indicate a security issue."
}
```

**Verification Failed (502):**
```json
{
  "error": "VERIFICATION_FAILED",
  "message": "Hash verification failed: computed hash does not match trusted gateway",
  "txId": "bNbA3TEQVL60xlgCcqdz4ZPHFZ711cZ3hmkpGttDt_U",
  "hint": "Data verification failed. The content may have been tampered with."
}
```

**No Healthy Gateways (503):**
```json
{
  "error": "NO_HEALTHY_GATEWAYS",
  "message": "No healthy gateways available",
  "hint": "All configured gateways are currently unavailable. Please try again later."
}
```

**Rate Limited (429):**
```json
{
  "error": "RATE_LIMITED",
  "message": "Too many requests",
  "retryAfter": 60
}
```

### 9.3 Health Endpoints

All health endpoints are under the `/wayfinder/` prefix.

#### 9.3.1 Health Check

```
GET /wayfinder/health
```

**Response:**
```json
{
  "status": "healthy",
  "uptime": {
    "ms": 3600000,
    "human": "1h 0m 0s"
  },
  "version": "1.0.0"
}
```

#### 9.3.2 Readiness Check

```
GET /wayfinder/ready
```

**Response (Ready):**
```json
{
  "status": "ready",
  "gateways": {
    "total": 10,
    "healthy": 8,
    "unhealthy": 2,
    "circuitOpen": 1
  }
}
```

**Response (Not Ready):**
```json
{
  "status": "not_ready",
  "reason": "No healthy gateways available",
  "gateways": {
    "total": 10,
    "healthy": 0,
    "unhealthy": 10,
    "circuitOpen": 10
  }
}
```

#### 9.3.3 Metrics

```
GET /wayfinder/metrics
```

**Response (Prometheus format):**
```
# HELP wayfinder_router_uptime_seconds Uptime in seconds
# TYPE wayfinder_router_uptime_seconds gauge
wayfinder_router_uptime_seconds 3600

# HELP wayfinder_router_gateways_total Total number of tracked gateways
# TYPE wayfinder_router_gateways_total gauge
wayfinder_router_gateways_total 10

# HELP wayfinder_router_gateways_healthy Number of healthy gateways
# TYPE wayfinder_router_gateways_healthy gauge
wayfinder_router_gateways_healthy 8

# HELP wayfinder_router_gateways_unhealthy Number of unhealthy gateways
# TYPE wayfinder_router_gateways_unhealthy gauge
wayfinder_router_gateways_unhealthy 2

# HELP wayfinder_router_gateways_circuit_open Number of gateways with open circuits
# TYPE wayfinder_router_gateways_circuit_open gauge
wayfinder_router_gateways_circuit_open 1

# HELP wayfinder_router_arns_cache_size Number of cached ArNS resolutions
# TYPE wayfinder_router_arns_cache_size gauge
wayfinder_router_arns_cache_size 150

# HELP wayfinder_content_cache_size_bytes Current cache size in bytes
# TYPE wayfinder_content_cache_size_bytes gauge
wayfinder_content_cache_size_bytes 1073741824

# HELP wayfinder_content_cache_items Number of items in cache
# TYPE wayfinder_content_cache_items gauge
wayfinder_content_cache_items 250

# HELP wayfinder_gateway_requests_total Total requests per gateway
# TYPE wayfinder_gateway_requests_total counter
wayfinder_gateway_requests_total{gateway="https://arweave.net",outcome="success"} 5000
wayfinder_gateway_requests_total{gateway="https://arweave.net",outcome="error"} 50

# HELP wayfinder_gateway_verifications_total Verification results per gateway
# TYPE wayfinder_gateway_verifications_total counter
wayfinder_gateway_verifications_total{gateway="https://arweave.net",outcome="verified"} 4950
wayfinder_gateway_verifications_total{gateway="https://arweave.net",outcome="failed"} 10

# HELP wayfinder_gateway_latency_seconds_sum Sum of request latencies
# TYPE wayfinder_gateway_latency_seconds_sum counter
wayfinder_gateway_latency_seconds_sum{gateway="https://arweave.net"} 425.5

# HELP wayfinder_gateway_latency_seconds_count Count of latency measurements
# TYPE wayfinder_gateway_latency_seconds_count counter
wayfinder_gateway_latency_seconds_count{gateway="https://arweave.net"} 5050

# HELP wayfinder_gateway_bytes_served_total Total bytes served per gateway
# TYPE wayfinder_gateway_bytes_served_total counter
wayfinder_gateway_bytes_served_total{gateway="https://arweave.net"} 1073741824
```

### 9.4 Telemetry & Stats Endpoints

The router includes a built-in telemetry system for tracking gateway performance. When enabled, it collects request metrics, latency data, and verification results. All stats endpoints are under the `/wayfinder/stats/` prefix.

#### 9.4.1 Gateway Stats Summary

```
GET /wayfinder/stats/gateways
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `start` | ISO 8601 | 24h ago | Start of time range |
| `end` | ISO 8601 | now | End of time range |

**Response:**
```json
[
  {
    "gateway": "https://arweave.net",
    "totalRequests": 1500,
    "successfulRequests": 1480,
    "failedRequests": 20,
    "avgLatencyMs": 85,
    "p95LatencyMs": 250,
    "bytesServed": 125000000,
    "verificationSuccess": 1470,
    "verificationFailed": 10
  }
]
```

#### 9.4.2 Gateway List

```
GET /wayfinder/stats/gateways/list
```

**Response:**
```json
{
  "gateways": [
    "https://arweave.net",
    "https://ar-io.dev",
    "https://permagate.io"
  ]
}
```

#### 9.4.3 Gateway Detail

```
GET /wayfinder/stats/gateways/:gateway
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `start` | ISO 8601 | 24h ago | Start of time range |
| `end` | ISO 8601 | now | End of time range |

**Response:**
```json
{
  "gateway": "https://arweave.net",
  "summary": {
    "totalRequests": 1500,
    "successfulRequests": 1480,
    "avgLatencyMs": 85
  },
  "hourly": [
    {
      "hour": "2024-12-17T10:00:00Z",
      "requests": 125,
      "avgLatencyMs": 82
    }
  ]
}
```

#### 9.4.4 Reward Export

```
GET /wayfinder/stats/export
```

Exports telemetry data in a format suitable for reward calculations.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `start` | ISO 8601 | 24h ago | Start of time range |
| `end` | ISO 8601 | now | End of time range |

**Response:**
```json
{
  "routerId": "router-1",
  "routerVersion": "0.1.0",
  "baseDomain": "router.example.com",
  "exportTime": "2024-12-17T12:00:00Z",
  "period": {
    "start": "2024-12-16T12:00:00Z",
    "end": "2024-12-17T12:00:00Z"
  },
  "gateways": [
    {
      "gateway": "https://arweave.net",
      "metrics": {
        "totalRequests": 1500,
        "successRate": 0.987,
        "avgLatencyMs": 85,
        "bytesServed": 125000000
      }
    }
  ]
}
```

### 9.5 Response Headers Reference

#### 9.5.1 Wayfinder Headers

| Header | Values | Description |
|--------|--------|-------------|
| `x-wayfinder-mode` | `proxy`, `route` | Operating mode used |
| `x-wayfinder-verified` | `true`, `false` | Whether content was verified |
| `x-wayfinder-gateway` | URL | Gateway that served content |
| `x-wayfinder-txid` | 43-char string | Resolved transaction ID |
| `x-wayfinder-verification-time-ms` | integer | Verification duration |
| `x-wayfinder-cached` | `true` | Present if served from cache |

#### 9.5.2 Rate Limit Headers

| Header | Description |
|--------|-------------|
| `x-ratelimit-limit` | Max requests per window |
| `x-ratelimit-remaining` | Requests remaining |
| `x-ratelimit-reset` | Unix timestamp of window reset |
| `retry-after` | Seconds until retry (on 429) |

---

## 10. Configuration Reference

### 10.1 Environment Variables

#### Server Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `PORT` | integer | `3000` | HTTP server port |
| `HOST` | string | `0.0.0.0` | Bind address |
| `BASE_DOMAIN` | string | `localhost` | Base domain for subdomain routing |
| `ARNS_ROOT_HOST` | string | `` | ArNS name to serve at root domain (empty = show info page) |

#### Mode Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `DEFAULT_MODE` | enum | `proxy` | Default mode (`proxy` or `route`) |
| `ALLOW_MODE_OVERRIDE` | boolean | `true` | Allow `?mode=` query parameter |

#### Verification Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `VERIFICATION_ENABLED` | boolean | `true` | Enable data verification |
| `TRUSTED_GATEWAYS` | string | `https://arweave.net,https://ar-io.dev` | Comma-separated trusted gateway URLs |
| `ARNS_CONSENSUS_THRESHOLD` | integer | `2` | Minimum agreeing gateways for ArNS |

#### Routing Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ROUTING_STRATEGY` | enum | `fastest` | Gateway selection (`fastest`, `random`, `round-robin`) |
| `GATEWAY_SOURCE` | enum | `trusted-peers` | Gateway discovery (`network`, `trusted-peers`, `static`) |
| `TRUSTED_PEER_GATEWAY` | string | `https://arweave.net` | Gateway for peer discovery |
| `STATIC_GATEWAYS` | string | | Comma-separated static gateway list |

#### Resilience Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `RETRY_ATTEMPTS` | integer | `3` | Max retry attempts per request |
| `RETRY_DELAY_MS` | integer | `100` | Base delay between retries |
| `GATEWAY_HEALTH_TTL_MS` | integer | `300000` | Health status cache duration |
| `CIRCUIT_BREAKER_THRESHOLD` | integer | `3` | Failures before circuit opens |
| `CIRCUIT_BREAKER_RESET_MS` | integer | `60000` | Circuit reset timeout |

#### Cache Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ARNS_CACHE_TTL_MS` | integer | `300000` | ArNS resolution cache TTL |
| `CONTENT_CACHE_ENABLED` | boolean | `true` | Enable verified content caching |
| `CONTENT_CACHE_MAX_SIZE_BYTES` | integer | `53687091200` | Max content cache size (50GB) |
| `CONTENT_CACHE_MAX_ITEM_SIZE_BYTES` | integer | `2147483648` | Max single item size (2GB) |
| `CONTENT_CACHE_PATH` | string | `` | Cache storage path (empty = in-memory only) |

#### Rate Limiting Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `RATE_LIMIT_ENABLED` | boolean | `false` | Enable rate limiting |
| `RATE_LIMIT_WINDOW_MS` | integer | `60000` | Rate limit window (1 minute) |
| `RATE_LIMIT_MAX_REQUESTS` | integer | `1000` | Max requests per window |

#### Logging Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `LOG_LEVEL` | enum | `info` | Log level (`debug`, `info`, `warn`, `error`) |

#### Telemetry Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `TELEMETRY_ENABLED` | boolean | `true` | Enable gateway telemetry collection |
| `TELEMETRY_ROUTER_ID` | string | `router-{timestamp}` | Unique identifier for this router |
| `TELEMETRY_SAMPLE_SUCCESS` | float | `0.1` | Sampling rate for successful requests (0.0-1.0) |
| `TELEMETRY_SAMPLE_ERRORS` | float | `1.0` | Sampling rate for errors (0.0-1.0) |
| `TELEMETRY_SAMPLE_LATENCY` | float | `0.1` | Sampling rate for latency measurements (0.0-1.0) |
| `TELEMETRY_DB_PATH` | string | `./data/telemetry.db` | SQLite database path |
| `TELEMETRY_RETENTION_DAYS` | integer | `30` | Days to retain telemetry data |
| `TELEMETRY_EXPORT_ENABLED` | boolean | `false` | Enable automatic export |
| `TELEMETRY_EXPORT_INTERVAL_HOURS` | integer | `24` | Export interval |
| `TELEMETRY_EXPORT_PATH` | string | `./data/telemetry-export.json` | Export file path |

### 10.2 Configuration Examples

#### Development Configuration

```env
PORT=3000
BASE_DOMAIN=localhost
DEFAULT_MODE=proxy
VERIFICATION_ENABLED=true
ROUTING_STRATEGY=random
LOG_LEVEL=debug
TELEMETRY_ENABLED=true
TELEMETRY_ROUTER_ID=dev-router
```

#### Production Configuration

```env
PORT=3000
HOST=0.0.0.0
BASE_DOMAIN=router.example.com
DEFAULT_MODE=proxy
ALLOW_MODE_OVERRIDE=true

VERIFICATION_ENABLED=true
TRUSTED_GATEWAYS=https://arweave.net,https://ar-io.dev,https://permagate.io
ARNS_CONSENSUS_THRESHOLD=2

ROUTING_STRATEGY=fastest
GATEWAY_SOURCE=trusted-peers
TRUSTED_PEER_GATEWAY=https://arweave.net

RETRY_ATTEMPTS=3
RETRY_DELAY_MS=100
GATEWAY_HEALTH_TTL_MS=300000
CIRCUIT_BREAKER_THRESHOLD=3
CIRCUIT_BREAKER_RESET_MS=60000

ARNS_CACHE_TTL_MS=300000
CONTENT_CACHE_ENABLED=true

RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=1000

LOG_LEVEL=info

TELEMETRY_ENABLED=true
TELEMETRY_ROUTER_ID=prod-router-1
TELEMETRY_SAMPLE_SUCCESS=0.1
TELEMETRY_SAMPLE_ERRORS=1.0
TELEMETRY_DB_PATH=/var/lib/wayfinder/telemetry.db
TELEMETRY_RETENTION_DAYS=30
```

#### High-Security Configuration

```env
DEFAULT_MODE=proxy
ALLOW_MODE_OVERRIDE=false

VERIFICATION_ENABLED=true
TRUSTED_GATEWAYS=https://gateway1.internal,https://gateway2.internal,https://gateway3.internal
ARNS_CONSENSUS_THRESHOLD=3

ROUTING_STRATEGY=round-robin
GATEWAY_SOURCE=static
STATIC_GATEWAYS=https://gateway1.internal,https://gateway2.internal

CONTENT_CACHE_ENABLED=true
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX_REQUESTS=100

TELEMETRY_ENABLED=true
```

---

## 11. Security Model

### 11.1 Trust Boundaries

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TRUST MODEL                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  FULLY TRUSTED                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  • Wayfinder Router code                                            │   │
│  │  • Router's cryptographic operations                                │   │
│  │  • Router's configuration                                           │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  TRUSTED FOR SPECIFIC OPERATIONS                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Trusted Gateways (for verification):                               │   │
│  │  • Trusted to provide correct content hashes                        │   │
│  │  • Trusted to resolve ArNS names correctly                          │   │
│  │  • NOT trusted to serve correct content (that's verified)           │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  UNTRUSTED                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  • Content-serving gateways (data is verified)                      │   │
│  │  • Gateway list from network (filtered by health)                   │   │
│  │  • User input (validated and sanitized)                             │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 11.2 Threat Model

#### 11.2.1 Threats Mitigated

| Threat | Mitigation |
|--------|------------|
| **Malicious gateway serving wrong content** | Hash verification against trusted gateways |
| **Single gateway compromise** | Consensus-based ArNS resolution |
| **Man-in-the-middle attack** | TLS for all gateway communication |
| **Gateway returning stale ArNS** | TTL-based cache expiration |
| **Denial of service via gateway** | Circuit breaker, automatic failover |
| **Information leakage via headers** | Strip internal gateway headers |
| **SSRF attacks** | Validate gateway URLs, no user-controlled hosts |

#### 11.2.2 Threats NOT Mitigated

| Threat | Reason | Recommendation |
|--------|--------|----------------|
| **Compromise of all trusted gateways** | No remaining source of truth | Use independent trusted gateways |
| **Router infrastructure compromise** | Out of scope | Standard infra security practices |
| **DDoS against router** | Requires external mitigation | Use CDN/WAF |
| **Private data exposure** | Arweave is public | Don't store private data |

### 11.3 Security Controls

#### 11.3.1 Input Validation

- Transaction IDs: Must match `/^[A-Za-z0-9_-]{43}$/`
- ArNS names: Must match `/^[a-z0-9_-]{1,51}$/i`
- Paths: Sanitized, no directory traversal
- Query parameters: Whitelist allowed parameters

#### 11.3.2 Output Sanitization

- Error messages: No internal details exposed
- Headers: Internal gateway headers stripped
- Logs: No sensitive request content logged

#### 11.3.3 Cryptographic Operations

- Hash algorithm: SHA-256
- Encoding: Base64url (URL-safe)
- Verification: Compare computed vs trusted hash

### 11.4 Security Checklist

- [ ] All gateway communication uses HTTPS
- [ ] Trusted gateways are independently operated
- [ ] Consensus threshold ≥ 2 for ArNS resolution
- [ ] Strict mode enabled for high-security deployments
- [ ] Rate limiting enabled to prevent abuse
- [ ] Logs do not contain sensitive data
- [ ] Error messages are generic
- [ ] Router deployed behind TLS-terminating load balancer
- [ ] Regular security audits of dependencies
- [ ] Monitoring for anomalous traffic patterns

---

## 12. Deployment Guide

### 12.1 Deployment Options

#### 12.1.1 Docker (Recommended)

```bash
# Pull the image
docker pull ghcr.io/ar-io/wayfinder-router:latest

# Run with environment variables
docker run -d \
  --name wayfinder-router \
  -p 3000:3000 \
  -e BASE_DOMAIN=router.example.com \
  -e VERIFICATION_ENABLED=true \
  -e TRUSTED_GATEWAYS=https://arweave.net,https://ar-io.dev \
  -e RATE_LIMIT_ENABLED=true \
  ghcr.io/ar-io/wayfinder-router:latest
```

#### 12.1.2 Docker Compose

```yaml
version: '3.8'

services:
  wayfinder-router:
    image: ghcr.io/ar-io/wayfinder-router:latest
    ports:
      - "3000:3000"
    environment:
      - BASE_DOMAIN=router.example.com
      - VERIFICATION_ENABLED=true
      - TRUSTED_GATEWAYS=https://arweave.net,https://ar-io.dev
      - ROUTING_STRATEGY=fastest
      - RATE_LIMIT_ENABLED=true
      - TELEMETRY_ENABLED=true
      - LOG_LEVEL=info
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3000/wayfinder/health"]
      interval: 30s
      timeout: 3s
      retries: 3
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 512M
```

#### 12.1.3 Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: wayfinder-router
spec:
  replicas: 3
  selector:
    matchLabels:
      app: wayfinder-router
  template:
    metadata:
      labels:
        app: wayfinder-router
    spec:
      containers:
      - name: wayfinder-router
        image: ghcr.io/ar-io/wayfinder-router:latest
        ports:
        - containerPort: 3000
        env:
        - name: BASE_DOMAIN
          value: "router.example.com"
        - name: VERIFICATION_ENABLED
          value: "true"
        - name: RATE_LIMIT_ENABLED
          value: "true"
        - name: TELEMETRY_ENABLED
          value: "true"
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /wayfinder/health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /wayfinder/ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: wayfinder-router
spec:
  selector:
    app: wayfinder-router
  ports:
  - port: 80
    targetPort: 3000
  type: ClusterIP
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: wayfinder-router
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
  - hosts:
    - "router.example.com"
    - "*.router.example.com"
    secretName: wayfinder-router-tls
  rules:
  - host: "router.example.com"
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: wayfinder-router
            port:
              number: 80
  - host: "*.router.example.com"
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: wayfinder-router
            port:
              number: 80
```

### 12.2 Infrastructure Requirements

#### 12.2.1 DNS Configuration

```
# A records for base domain
router.example.com.     A     <load-balancer-ip>

# Wildcard for ArNS subdomains
*.router.example.com.   A     <load-balancer-ip>
```

#### 12.2.2 TLS Certificates

- **Requirement:** Wildcard certificate for `*.router.example.com`
- **Options:**
  - Let's Encrypt with DNS-01 challenge
  - Commercial wildcard certificate
  - Self-managed PKI (for internal deployments)

#### 12.2.3 Load Balancer

- TLS termination at load balancer
- Health check: `GET /wayfinder/health`
- Sticky sessions: Not required (stateless)
- Timeout: 120 seconds (for large file transfers)

### 12.3 Scaling Guidelines

| Traffic Level | Instances | CPU per Instance | Memory per Instance |
|---------------|-----------|------------------|---------------------|
| < 100 req/s | 1-2 | 0.5 vCPU | 256MB |
| 100-500 req/s | 2-4 | 1 vCPU | 512MB |
| 500-2000 req/s | 4-8 | 2 vCPU | 1GB |
| > 2000 req/s | 8+ | 2 vCPU | 1GB |

**Auto-scaling Triggers:**
- CPU > 70% for 2 minutes → scale up
- CPU < 30% for 10 minutes → scale down
- Request queue depth > 100 → scale up

---

## 13. Monitoring & Observability

### 13.1 Key Metrics

#### 13.1.1 Request Metrics

| Metric | Type | Labels | Alert Threshold |
|--------|------|--------|-----------------|
| `requests_total` | counter | status, mode | N/A |
| `request_duration_seconds` | histogram | - | p99 > 2s |
| `request_size_bytes` | histogram | - | N/A |
| `response_size_bytes` | histogram | - | N/A |

#### 13.1.2 Verification Metrics

| Metric | Type | Labels | Alert Threshold |
|--------|------|--------|-----------------|
| `verification_total` | counter | result | failure rate > 1% |
| `verification_duration_seconds` | histogram | - | p99 > 1s |
| `arns_resolution_total` | counter | result | failure rate > 5% |
| `arns_consensus_mismatch_total` | counter | - | any occurrence |

#### 13.1.3 Gateway Metrics

| Metric | Type | Labels | Alert Threshold |
|--------|------|--------|-----------------|
| `gateways_total` | gauge | - | < 3 |
| `gateways_healthy` | gauge | - | 0 |
| `gateway_requests_total` | counter | gateway, status | N/A |
| `gateway_latency_seconds` | histogram | gateway | N/A |

#### 13.1.4 Cache Metrics

| Metric | Type | Labels | Alert Threshold |
|--------|------|--------|-----------------|
| `arns_cache_size` | gauge | - | N/A |
| `arns_cache_hits_total` | counter | - | hit rate < 50% |
| `content_cache_size_bytes` | gauge | - | > 90% capacity |

### 13.2 Logging

#### 13.2.1 Log Format

```json
{
  "level": "info",
  "time": 1640000000000,
  "msg": "Request completed",
  "traceId": "abc-123-def",
  "method": "GET",
  "path": "/txId/path",
  "status": 200,
  "duration": 45,
  "mode": "proxy",
  "verified": true,
  "gateway": "https://arweave.net"
}
```

#### 13.2.2 Log Levels

| Level | Use Case |
|-------|----------|
| `error` | Unexpected errors, verification failures |
| `warn` | Gateway failures, consensus issues |
| `info` | Request completion, configuration changes |
| `debug` | Detailed request flow, cache operations |

### 13.3 Alerting Rules

#### 13.3.1 Critical Alerts

```yaml
# No healthy gateways
- alert: WayfinderNoHealthyGateways
  expr: wayfinder_router_gateways_healthy == 0
  for: 1m
  severity: critical

# High error rate
- alert: WayfinderHighErrorRate
  expr: rate(wayfinder_router_requests_total{status=~"5.."}[5m]) / rate(wayfinder_router_requests_total[5m]) > 0.05
  for: 5m
  severity: critical

# Verification failures
- alert: WayfinderVerificationFailures
  expr: rate(wayfinder_router_verification_total{result="failure"}[5m]) > 0.01
  for: 5m
  severity: critical
```

#### 13.3.2 Warning Alerts

```yaml
# High latency
- alert: WayfinderHighLatency
  expr: histogram_quantile(0.99, rate(wayfinder_router_request_duration_seconds_bucket[5m])) > 2
  for: 10m
  severity: warning

# Gateway health degraded
- alert: WayfinderGatewayHealthDegraded
  expr: wayfinder_router_gateways_healthy / wayfinder_router_gateways_total < 0.5
  for: 5m
  severity: warning

# ArNS consensus mismatch
- alert: WayfinderArnsConsensusMismatch
  expr: increase(wayfinder_router_arns_consensus_mismatch_total[1h]) > 0
  severity: warning
```

### 13.4 Dashboards

#### 13.4.1 Overview Dashboard

- Request rate (by status code)
- Request latency (p50, p95, p99)
- Error rate
- Verification success rate
- Gateway health status
- Cache hit rates

#### 13.4.2 Gateway Dashboard

- Requests per gateway
- Latency per gateway
- Error rate per gateway
- Health status history
- Circuit breaker state

---

## 14. Performance Benchmarks

### 14.1 Test Environment

- **Router:** 2 vCPU, 1GB RAM
- **Network:** 1 Gbps
- **Gateways:** 5 healthy gateways
- **Content:** Mixed sizes (1KB - 10MB)

### 14.2 Baseline Performance

| Metric | Value | Notes |
|--------|-------|-------|
| Throughput (proxy, no verify) | 2,500 req/s | Small content |
| Throughput (proxy, verify) | 1,200 req/s | Small content |
| Throughput (route) | 5,000 req/s | Redirect only |
| Latency p50 (proxy, verify) | 85ms | Including verification |
| Latency p99 (proxy, verify) | 250ms | Including verification |
| Memory usage (idle) | 95MB | |
| Memory usage (1000 req/s) | 320MB | |

### 14.3 Verification Impact

| Content Size | Without Verification | With Verification | Overhead |
|--------------|---------------------|-------------------|----------|
| 1 KB | 25ms | 45ms | +20ms |
| 100 KB | 35ms | 65ms | +30ms |
| 1 MB | 120ms | 180ms | +60ms |
| 10 MB | 850ms | 1100ms | +250ms |

### 14.4 Scaling Behavior

| Instances | Max Throughput | Latency p99 |
|-----------|----------------|-------------|
| 1 | 1,200 req/s | 250ms |
| 2 | 2,400 req/s | 255ms |
| 4 | 4,700 req/s | 260ms |
| 8 | 9,200 req/s | 270ms |

---

## 15. Future Roadmap

### 15.1 Completed in Current Version

- **Rate Limiting** ✓
  - IP-based rate limiting
  - Configurable window and limits
  - Rate limit headers (X-RateLimit-*)

- **Content Caching** ✓
  - LRU cache for verified content
  - Configurable max size (up to 50GB default)
  - Per-item size limits

- **Gateway Telemetry** ✓
  - SQLite-backed metrics storage
  - Per-gateway performance tracking
  - Stats API endpoints (/wayfinder/stats/*)
  - Reward data export

- **Manifest Verification** ✓
  - Fetches and verifies Arweave path manifests
  - Verifies path mappings match expected content
  - Three-layer verification: manifest hash, path mapping, content hash
  - Caching of verified manifests

- **ArNS Root Host** ✓
  - Serve any ArNS name at the root domain via `ARNS_ROOT_HOST`
  - Info page moves to `/wayfinder/info` when configured
  - All router endpoints consolidated under `/wayfinder/` prefix

- **Security Improvements** ✓
  - Never trust source gateway digest headers (always verify against trusted gateways)
  - Minimum consensus threshold of 2 enforced for ArNS resolution
  - Parallel manifest fetching with Promise.any() for reliability

### 15.2 Version 1.1

- **Enhanced Metrics**
  - Request latency histograms
  - Bandwidth metrics by gateway
  - Cache effectiveness metrics

- **Cache Invalidation API**
  - HTTP endpoint for ArNS cache invalidation
  - Selective content cache purge

### 15.3 Version 2.0

- **WebSocket Support**
  - Proxy WebSocket connections
  - Gateway health via WebSocket

- **Edge Deployment**
  - Cloudflare Workers support
  - Deno Deploy support
  - Vercel Edge support

- **Advanced Routing**
  - Geographic routing
  - Weighted routing
  - Custom routing rules

### 15.4 Future Considerations

- Multi-region deployment support
- A/B testing for gateway selection
- Machine learning for gateway prediction
- Integration with ar.io incentive system
- Support for encrypted content
- GraphQL API for configuration

---

## 16. Glossary

| Term | Definition |
|------|------------|
| **ArNS** | Arweave Name System - human-readable names for Arweave content |
| **ar.io** | Decentralized gateway network for Arweave |
| **Base64url** | URL-safe Base64 encoding used by Arweave |
| **Circuit Breaker** | Pattern to prevent cascading failures by temporarily disabling failed services |
| **Consensus** | Agreement among multiple parties (gateways) on a value |
| **Gateway** | Server that provides HTTP access to Arweave data |
| **Hash Verification** | Comparing computed SHA-256 hash with expected value |
| **LRU** | Least Recently Used - cache eviction strategy |
| **Manifest** | JSON document describing multi-file Arweave content |
| **Proxy Mode** | Fetching and serving content through the router |
| **Route Mode** | Redirecting requests to gateway URLs |
| **Sandbox** | Isolated subdomain for transaction content |
| **Telemetry** | Collection of gateway performance metrics for monitoring |
| **Transaction ID (TxId)** | 43-character identifier for Arweave transactions |
| **TTL** | Time To Live - duration before cache expiration |
| **Trusted Gateway** | Gateway trusted for verification hash retrieval |

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Dec 2024 | AR.IO | Initial specification |
| 1.1 | Dec 2024 | AR.IO | Added telemetry documentation, stats API endpoints, updated config reference, aligned metrics with implementation, updated roadmap |
| 1.2 | Dec 2024 | AR.IO | Added manifest verification, ARNS_ROOT_HOST configuration, security improvements (never trust source gateway), moved all endpoints to /wayfinder/ prefix, updated deployment examples |

---

*This document is maintained by the AR.IO team. For questions or feedback, please open an issue on the GitHub repository.*
