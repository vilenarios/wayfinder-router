# Wayfinder Router Enterprise Deployment Diagram

## Overview

This document provides visual representations of the enterprise deployment architecture for Wayfinder Router on Hetzner bare metal with CDN77.

---

## 1. High-Level Architecture (Mermaid)

```mermaid
flowchart TB
    subgraph Internet["INTERNET"]
        Users["End Users<br/>Web Browsers, Apps, APIs"]
    end

    subgraph CDN["CDN77 GLOBAL NETWORK"]
        direction TB
        subgraph EdgePops["Edge PoPs (100+ Locations)"]
            FRA["Frankfurt<br/>PoP"]
            AMS["Amsterdam<br/>PoP"]
            NYC["New York<br/>PoP"]
            LAX["Los Angeles<br/>PoP"]
            SG["Singapore<br/>PoP"]
            More["..."]
        end

        subgraph CDNServices["CDN Services"]
            DDoS["DDoS Protection<br/>L3/L4/L7"]
            WAF["WAF<br/>OWASP Rules"]
            SSL["SSL Termination<br/>TLS 1.3"]
            Cache["Edge Cache<br/>365d for txId"]
        end

        OriginShield["Origin Shield<br/>(Frankfurt)"]
    end

    subgraph Hetzner["HETZNER DATA CENTER (FSN1)"]
        subgraph Network["Network Layer"]
            LB["Load Balancer<br/>Round Robin<br/>Health Checks"]
            FW["Firewall<br/>CDN77 IPs Only"]
        end

        subgraph Compute["Compute Layer (Private VLAN)"]
            WF1["WF-FSN-1<br/>AX102 / 10Gbps<br/>wayfinder:3000"]
            WF2["WF-FSN-2<br/>AX102 / 10Gbps<br/>wayfinder:3000"]
            WF3["WF-FSN-3<br/>AX102 / 10Gbps<br/>wayfinder:3000"]
        end

        subgraph Management["Management Layer"]
            MGT["MGT-FSN<br/>AX42"]
            subgraph Monitoring["Monitoring Stack"]
                Prom["Prometheus"]
                Graf["Grafana"]
                Loki["Loki"]
                Alert["Alertmanager"]
            end
        end
    end

    subgraph ArIO["AR.IO GATEWAY NETWORK"]
        GW1["ar.io Turbo<br/>Gateway"]
        GW2["ArDrive<br/>Gateway"]
        GW3["Permagate<br/>Gateway"]
        GWN["100+ Other<br/>Gateways"]
    end

    subgraph Arweave["ARWEAVE NETWORK"]
        Nodes["Arweave Nodes<br/>Permanent Storage"]
    end

    %% Connections
    Users --> FRA & AMS & NYC & LAX & SG
    FRA & AMS & NYC & LAX & SG --> DDoS
    DDoS --> WAF --> SSL --> Cache
    Cache --> OriginShield
    OriginShield --> LB
    LB --> FW
    FW --> WF1 & WF2 & WF3
    WF1 & WF2 & WF3 --> GW1 & GW2 & GW3 & GWN
    GW1 & GW2 & GW3 & GWN --> Nodes
    WF1 & WF2 & WF3 -.-> MGT
    Prom -.-> WF1 & WF2 & WF3

    %% Styling
    classDef internet fill:#e1f5fe,stroke:#01579b
    classDef cdn fill:#fff3e0,stroke:#e65100
    classDef hetzner fill:#e8f5e9,stroke:#2e7d32
    classDef ario fill:#f3e5f5,stroke:#7b1fa2
    classDef arweave fill:#fce4ec,stroke:#c2185b

    class Users internet
    class FRA,AMS,NYC,LAX,SG,DDoS,WAF,SSL,Cache,OriginShield cdn
    class LB,FW,WF1,WF2,WF3,MGT,Prom,Graf,Loki,Alert hetzner
    class GW1,GW2,GW3,GWN ario
    class Nodes arweave
```

---

## 2. Detailed Network Topology (Mermaid)

```mermaid
flowchart LR
    subgraph CDN77["CDN77"]
        Shield["Origin Shield<br/>185.93.x.x"]
    end

    subgraph Internet["Internet Backbone"]
        IX["Internet Exchange"]
    end

    subgraph Hetzner["Hetzner FSN1"]
        subgraph PublicNet["Public Network (203.0.113.0/28)"]
            Router["Hetzner Router"]
            LB["Load Balancer<br/>203.0.113.1:443"]
        end

        subgraph PrivateNet["Private VLAN (10.0.1.0/24)"]
            WF1["WF-FSN-1<br/>10.0.1.10:3000"]
            WF2["WF-FSN-2<br/>10.0.1.11:3000"]
            WF3["WF-FSN-3<br/>10.0.1.12:3000"]
            MGT["MGT-FSN<br/>10.0.1.100"]
        end

        subgraph FirewallRules["Firewall Rules"]
            FW["Inbound:<br/>443 from CDN77 IPs<br/>22 from Bastion<br/>9090 from Monitoring"]
        end
    end

    subgraph ArIO["ar.io Network"]
        GW["Gateways<br/>(HTTPS/443)"]
    end

    Shield -->|HTTPS| IX
    IX -->|HTTPS| Router
    Router --> LB
    LB --> FW
    FW --> WF1 & WF2 & WF3
    WF1 & WF2 & WF3 -->|HTTPS| GW
    WF1 & WF2 & WF3 <-->|Internal| MGT
```

---

## 3. Request Flow Diagram (Mermaid)

```mermaid
sequenceDiagram
    participant User as End User
    participant CDN as CDN77 Edge
    participant Shield as Origin Shield
    participant LB as Load Balancer
    participant WF as Wayfinder Node
    participant Cache as Content Cache
    participant GW as ar.io Gateway
    participant Ver as Verification GWs

    User->>CDN: GET /{txId}

    alt CDN Cache Hit
        CDN-->>User: 200 OK (cached)
    else CDN Cache Miss
        CDN->>Shield: Forward request
        Shield->>LB: Forward to origin
        LB->>WF: Route to healthy node

        WF->>Cache: Check local cache

        alt Local Cache Hit
            Cache-->>WF: Return cached content
        else Local Cache Miss
            WF->>GW: Fetch content
            GW-->>WF: Content + headers

            WF->>Ver: Verify hash (parallel)
            Ver-->>WF: Hash verification result

            alt Verification Success
                WF->>Cache: Store verified content
                WF-->>LB: 200 OK + content
            else Verification Failed
                WF->>GW: Retry with different gateway
                GW-->>WF: Content
                WF->>Ver: Re-verify
                Ver-->>WF: Result
                WF-->>LB: 200 OK or 502 Error
            end
        end

        LB-->>Shield: Response
        Shield-->>CDN: Response + cache headers
        CDN-->>User: 200 OK
    end
```

---

## 4. Multi-Region DR Architecture (Mermaid)

```mermaid
flowchart TB
    subgraph Global["GLOBAL TRAFFIC"]
        DNS["GeoDNS / GSLB"]
    end

    subgraph CDN["CDN77"]
        Shield1["Shield FRA"]
        Shield2["Shield AMS"]
    end

    subgraph Primary["PRIMARY REGION (FSN1 - Germany)"]
        LB1["Load Balancer"]
        WF1A["WF-FSN-1"]
        WF1B["WF-FSN-2"]
        WF1C["WF-FSN-3"]
        LB1 --> WF1A & WF1B & WF1C
    end

    subgraph Secondary["SECONDARY REGION (HEL1 - Finland)"]
        LB2["Load Balancer"]
        WF2A["WF-HEL-1"]
        WF2B["WF-HEL-2"]
        LB2 --> WF2A & WF2B
    end

    subgraph Tertiary["TERTIARY REGION (NBG1 - Germany)"]
        LB3["Load Balancer"]
        WF3A["WF-NBG-1<br/>(cold)"]
        LB3 --> WF3A
    end

    DNS --> Shield1 & Shield2
    Shield1 -->|Primary| LB1
    Shield1 -->|Failover| LB2
    Shield2 -->|Primary| LB1
    Shield2 -->|Failover| LB2
    LB2 -.->|Failover| LB3

    style Primary fill:#c8e6c9,stroke:#2e7d32
    style Secondary fill:#fff9c4,stroke:#f9a825
    style Tertiary fill:#ffccbc,stroke:#e64a19
```

---

## 5. Component Architecture (Mermaid)

```mermaid
flowchart TB
    subgraph Node["WAYFINDER NODE"]
        subgraph Ingress["Ingress Layer"]
            RP["Request Parser"]
            RL["Rate Limiter"]
            RT["Request Tracker"]
        end

        subgraph Routing["Routing Layer"]
            PH["Proxy Handler"]
            RH["Route Handler"]
            AH["API Handler"]
        end

        subgraph Services["Service Layer"]
            GS["Gateway Selector"]
            AR["ArNS Resolver"]
            CF["Content Fetcher"]
            MR["Manifest Resolver"]
            VF["Verifier"]
            NM["Network Manager"]
        end

        subgraph Caching["Cache Layer"]
            CC["Content Cache<br/>LRU 50GB"]
            AC["ArNS Cache<br/>TTL 5min"]
            MC["Manifest Cache"]
            HC["Health Cache"]
            TC["Temperature Cache"]
        end

        subgraph Observability["Observability Layer"]
            TL["Telemetry<br/>SQLite"]
            MT["Metrics<br/>Prometheus"]
            LG["Logging<br/>Pino"]
        end
    end

    RP --> RL --> RT
    RT --> PH & RH & AH
    PH --> GS & AR & CF & MR & VF
    GS --> HC & TC & NM
    AR --> AC
    CF --> CC
    MR --> MC
    PH & RH & AH --> TL & MT & LG
```

---

## 6. ASCII Deployment Diagram

For environments where Mermaid is not supported:

```
                                    INTERNET USERS
                                          │
                                          ▼
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                           CDN77 GLOBAL NETWORK                           │
    │                                                                          │
    │   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
    │   │   FRA   │ │   AMS   │ │   NYC   │ │   LAX   │ │   SG    │  ...     │
    │   │   PoP   │ │   PoP   │ │   PoP   │ │   PoP   │ │   PoP   │          │
    │   └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘          │
    │        └───────────┴───────────┴───────────┴───────────┘               │
    │                                │                                        │
    │   ┌────────────────────────────┼────────────────────────────┐          │
    │   │     ┌──────────┐    ┌──────┴─────┐    ┌──────────┐      │          │
    │   │     │   DDoS   │───▶│    WAF     │───▶│   SSL    │      │          │
    │   │     │Protection│    │  (OWASP)   │    │  (TLS)   │      │          │
    │   │     └──────────┘    └────────────┘    └──────────┘      │          │
    │   └────────────────────────────┬────────────────────────────┘          │
    │                                │                                        │
    │                    ┌───────────┴───────────┐                            │
    │                    │    ORIGIN SHIELD      │                            │
    │                    │     (Frankfurt)       │                            │
    │                    └───────────┬───────────┘                            │
    └────────────────────────────────┼────────────────────────────────────────┘
                                     │
                                     │ HTTPS (CDN77 IPs only)
                                     ▼
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                    HETZNER FSN1 DATA CENTER                              │
    │                                                                          │
    │  ┌─────────────────────────────────────────────────────────────────┐    │
    │  │                      NETWORK LAYER                               │    │
    │  │  ┌─────────────────────────────────────────────────────────┐    │    │
    │  │  │              LOAD BALANCER (Round Robin)                 │    │    │
    │  │  │                  203.0.113.1:443                         │    │    │
    │  │  │              Health: /wayfinder/ready                    │    │    │
    │  │  └──────────────────────────┬──────────────────────────────┘    │    │
    │  │                             │                                   │    │
    │  │  ┌──────────────────────────┴──────────────────────────────┐    │    │
    │  │  │                    FIREWALL                              │    │    │
    │  │  │         Allow: CDN77 IPs → 443, Bastion → 22            │    │    │
    │  │  └──────────────────────────┬──────────────────────────────┘    │    │
    │  └─────────────────────────────┼───────────────────────────────────┘    │
    │                                │                                         │
    │  ┌─────────────────────────────┼───────────────────────────────────┐    │
    │  │              PRIVATE VLAN (10.0.1.0/24)                          │    │
    │  │                             │                                    │    │
    │  │         ┌───────────────────┼───────────────────┐               │    │
    │  │         │                   │                   │               │    │
    │  │         ▼                   ▼                   ▼               │    │
    │  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │    │
    │  │  │  WF-FSN-1   │    │  WF-FSN-2   │    │  WF-FSN-3   │         │    │
    │  │  │             │    │             │    │             │         │    │
    │  │  │  AX102      │    │  AX102      │    │  AX102      │         │    │
    │  │  │  48C/256GB  │    │  48C/256GB  │    │  48C/256GB  │         │    │
    │  │  │  10 Gbps    │    │  10 Gbps    │    │  10 Gbps    │         │    │
    │  │  │             │    │             │    │             │         │    │
    │  │  │ ┌─────────┐ │    │ ┌─────────┐ │    │ ┌─────────┐ │         │    │
    │  │  │ │Wayfinder│ │    │ │Wayfinder│ │    │ │Wayfinder│ │         │    │
    │  │  │ │ :3000   │ │    │ │ :3000   │ │    │ │ :3000   │ │         │    │
    │  │  │ └─────────┘ │    │ └─────────┘ │    │ └─────────┘ │         │    │
    │  │  │ ┌─────────┐ │    │ ┌─────────┐ │    │ ┌─────────┐ │         │    │
    │  │  │ │ Cache   │ │    │ │ Cache   │ │    │ │ Cache   │ │         │    │
    │  │  │ │  50GB   │ │    │ │  50GB   │ │    │ │  50GB   │ │         │    │
    │  │  │ └─────────┘ │    │ └─────────┘ │    │ └─────────┘ │         │    │
    │  │  │ 10.0.1.10   │    │ 10.0.1.11   │    │ 10.0.1.12   │         │    │
    │  │  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘         │    │
    │  │         │                  │                  │                │    │
    │  │         └──────────────────┴──────────────────┘                │    │
    │  │                            │                                   │    │
    │  │                    ┌───────┴───────┐                           │    │
    │  │                    │   MGT-FSN     │                           │    │
    │  │                    │   10.0.1.100  │                           │    │
    │  │                    │               │                           │    │
    │  │                    │ ┌───────────┐ │                           │    │
    │  │                    │ │Prometheus │ │                           │    │
    │  │                    │ │ Grafana   │ │                           │    │
    │  │                    │ │ Loki      │ │                           │    │
    │  │                    │ │Alertmanager│                            │    │
    │  │                    │ └───────────┘ │                           │    │
    │  │                    └───────────────┘                           │    │
    │  └─────────────────────────────────────────────────────────────────┘    │
    └─────────────────────────────────────────────────────────────────────────┘
                                     │
                                     │ HTTPS (to gateways)
                                     ▼
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                        AR.IO GATEWAY NETWORK                             │
    │                                                                          │
    │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
    │  │   ar.io     │  │   ArDrive   │  │  Permagate  │  │   100+      │     │
    │  │   Turbo     │  │   Gateway   │  │   Gateway   │  │   Others    │     │
    │  │  (Routing)  │  │  (Routing)  │  │ (Routing)   │  │ (Routing)   │     │
    │  │ (Verify)    │  │  (Verify)   │  │  (Verify)   │  │             │     │
    │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘     │
    │                                                                          │
    └────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                          ARWEAVE NETWORK                                 │
    │                                                                          │
    │                    ┌───────────────────────────┐                         │
    │                    │    PERMANENT STORAGE      │                         │
    │                    │    (Immutable Data)       │                         │
    │                    │                           │                         │
    │                    │  Transactions (txId)      │                         │
    │                    │  Manifests                │                         │
    │                    │  ArNS Records             │                         │
    │                    └───────────────────────────┘                         │
    │                                                                          │
    └─────────────────────────────────────────────────────────────────────────┘


    ═══════════════════════════════════════════════════════════════════════════
                                    LEGEND
    ═══════════════════════════════════════════════════════════════════════════

    Traffic Flow:
    ─────────────
    User Request:  Internet → CDN77 Edge → Origin Shield → Hetzner LB → Node
    Content Fetch: Node → ar.io Gateway → Arweave Network
    Verification:  Node → Multiple Verification Gateways (parallel)

    Security Layers:
    ────────────────
    Layer 1: CDN77 DDoS Protection (L3/L4/L7)
    Layer 2: CDN77 WAF (OWASP rules)
    Layer 3: TLS Encryption (TLS 1.3)
    Layer 4: Hetzner Firewall (IP allowlist)
    Layer 5: Application Rate Limiting
    Layer 6: Content Hash Verification

    Cache Layers:
    ─────────────
    Layer 1: CDN77 Edge Cache (365d for txId content)
    Layer 2: Origin Shield Cache
    Layer 3: Node Content Cache (50GB LRU per node)
    Layer 4: Node ArNS/Manifest Cache (TTL-based)

    High Availability:
    ──────────────────
    • 3 nodes in active/active configuration
    • N+1 redundancy (can lose 1 node)
    • Load balancer health checks (5s interval)
    • Circuit breaker for gateway failures
    • Graceful shutdown with request draining

    Monitoring:
    ───────────
    • Prometheus metrics scraping (/wayfinder/metrics)
    • Grafana dashboards
    • Loki log aggregation
    • Alertmanager → PagerDuty integration
```

---

## 7. Data Flow Matrix

| Source | Destination | Protocol | Port | Purpose |
|--------|-------------|----------|------|---------|
| Users | CDN77 Edge | HTTPS | 443 | Client requests |
| CDN77 Edge | Origin Shield | HTTPS | 443 | Cache miss |
| Origin Shield | Hetzner LB | HTTPS | 443 | Origin pull |
| Hetzner LB | Wayfinder Nodes | HTTP | 3000 | Load balancing |
| Wayfinder Nodes | ar.io Gateways | HTTPS | 443 | Content fetch |
| Wayfinder Nodes | Verification GWs | HTTPS | 443 | Hash verification |
| Prometheus | Wayfinder Nodes | HTTP | 3000 | Metrics scrape |
| Wayfinder Nodes | Management | Various | Various | Logs, internal |
| Bastion | All Servers | SSH | 22 | Administration |

---

## 8. Port Reference

| Service | Port | Protocol | Exposure |
|---------|------|----------|----------|
| Wayfinder App | 3000 | HTTP | Internal only |
| Prometheus | 9090 | HTTP | Internal only |
| Grafana | 3001 | HTTP | VPN/Internal |
| Loki | 3100 | HTTP | Internal only |
| Alertmanager | 9093 | HTTP | Internal only |
| Node Exporter | 9100 | HTTP | Internal only |
| SSH | 22 | TCP | Bastion only |
| Load Balancer | 443 | HTTPS | CDN77 IPs only |

---

## 9. Rendering Options

This diagram can be rendered using:

1. **GitHub/GitLab**: Native Mermaid support in markdown files
2. **VS Code**: Install "Markdown Preview Mermaid Support" extension
3. **Mermaid Live Editor**: https://mermaid.live
4. **Obsidian**: Native Mermaid support
5. **Notion**: Mermaid code blocks
6. **Confluence**: Mermaid plugin
7. **PlantUML**: Convert to PlantUML syntax if needed
8. **Draw.io**: Import Mermaid or recreate manually

For professional documentation, export from Mermaid Live Editor to:
- PNG (for documents)
- SVG (for web/scalable)
- PDF (for presentations)

---

## 10. Alternative Diagram Formats

### 10.1 PlantUML Version

If you prefer PlantUML, the deployment can be represented as:

```plantuml
@startuml
!include <cloudinsight/common>
!include <cloudinsight/web_server>

cloud "Internet" {
  actor Users
}

cloud "CDN77" {
  node "Edge PoPs" as edge
  node "Origin Shield" as shield
}

frame "Hetzner FSN1" {
  node "Load Balancer" as lb

  frame "Private VLAN" {
    node "WF-FSN-1" as wf1
    node "WF-FSN-2" as wf2
    node "WF-FSN-3" as wf3
    node "Management" as mgt
  }
}

cloud "ar.io Network" {
  node "Gateways" as gw
}

cloud "Arweave" {
  database "Permanent Storage" as ar
}

Users --> edge
edge --> shield
shield --> lb
lb --> wf1
lb --> wf2
lb --> wf3
wf1 --> gw
wf2 --> gw
wf3 --> gw
gw --> ar
wf1 ..> mgt
wf2 ..> mgt
wf3 ..> mgt

@enduml
```

### 10.2 Draw.io XML

For Draw.io, import the Mermaid diagram or create manually using the ASCII diagram as reference.

---

*Diagrams last updated: 2026-01-27*
