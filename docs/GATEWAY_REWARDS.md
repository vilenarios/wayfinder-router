# Gateway Rewards System

## Overview

The Gateway Rewards System is an off-chain incentive mechanism that distributes ARIO tokens to ar.io gateways based on their performance serving traffic through Wayfinder Router.

**Key Principles:**
- **Performance-based**: Gateways that serve more traffic reliably earn more rewards
- **Transparent**: All calculations are published publicly for verification
- **Fraud-resistant**: Review period with automated and manual fraud detection
- **Delegate-aware**: Respects gateway delegation settings for reward splits

## How It Works

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        DAILY REWARD CYCLE                                 │
│                                                                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌───────────┐ │
│  │   Day N     │    │  Day N+1    │    │ Day N+1-3   │    │  Day N+4  │ │
│  │             │    │             │    │             │    │           │ │
│  │  Traffic    │───▶│  Calculate  │───▶│   Review    │───▶│ Distribute│ │
│  │  Served     │    │   Rewards   │    │   Period    │    │  Tokens   │ │
│  │             │    │             │    │             │    │           │ │
│  └─────────────┘    └─────────────┘    └─────────────┘    └───────────┘ │
│                                                                          │
│  Telemetry         Scoring &          Fraud Check &      Token Transfer │
│  Collection        Publishing         Manual Review      to Operators   │
│                                                          & Delegates    │
└──────────────────────────────────────────────────────────────────────────┘
```

## Reward Formula

### Qualification Requirements

Gateways must meet minimum thresholds to qualify for rewards:

| Requirement | Default | Rationale |
|-------------|---------|-----------|
| Minimum Requests | 100 | Filter out inactive gateways |
| Minimum Success Rate | 90% | Ensure reliability |

### Scoring Components

Each qualified gateway receives a score based on four weighted factors:

```
Final Score = (Volume × 0.40 + Reliability × 0.25 + Speed × 0.20 + Bandwidth × 0.15) × Verification Bonus
```

| Component | Weight | Calculation | Purpose |
|-----------|--------|-------------|---------|
| **Volume** | 40% | `requests / max_requests` | Reward traffic served |
| **Reliability** | 25% | `success_rate` (0-1) | Reward uptime |
| **Speed** | 20% | `min_latency / gateway_p95_latency` | Reward performance |
| **Bandwidth** | 15% | `bytes_served / max_bytes` | Reward large content serving |

### Verification Gateway Bonus

Gateways used for hash verification receive a **15% bonus** (configurable):

```
Verification Bonus = 1.15 if gateway is in verification set, else 1.0
```

This rewards gateways that are trusted enough to verify content integrity.

### Reward Calculation

```
Gateway Reward = (Gateway Score / Total Qualified Scores) × Daily Pool
```

Example with 1000 ARIO daily pool:
- Gateway A: Score 0.35 → 350 ARIO
- Gateway B: Score 0.25 → 250 ARIO
- Gateway C: Score 0.20 → 200 ARIO
- Gateway D: Score 0.12 → 120 ARIO
- Gateway E: Score 0.08 → 80 ARIO

## Operator & Delegate Splits

Rewards are distributed according to each gateway's delegation settings:

```
┌─────────────────────────────────────────────────────────────┐
│                    Gateway Reward: 100 ARIO                  │
│                                                              │
│  Gateway Delegation Setting: 50% to delegates               │
│                                                              │
│  ┌─────────────────┐        ┌─────────────────────────────┐ │
│  │    Operator     │        │         Delegates           │ │
│  │    50 ARIO      │        │         50 ARIO             │ │
│  │                 │        │                             │ │
│  │                 │        │  Delegate A (60% stake):    │ │
│  │                 │        │    30 ARIO                  │ │
│  │                 │        │                             │ │
│  │                 │        │  Delegate B (40% stake):    │ │
│  │                 │        │    20 ARIO                  │ │
│  └─────────────────┘        └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## CLI Commands

### Calculate Rewards

```bash
# Calculate yesterday's rewards (most common)
bun run rewards:calculate

# Calculate for a specific date
bun run rewards calculate --date 2026-01-25

# Use custom configuration
bun run rewards calculate --config ./my-config.json
```

### Review & Approve

```bash
# List all periods
bun run rewards:list
bun run rewards list --status pending_review

# Preview distribution (see operator/delegate splits)
bun run rewards preview 2026-01-25_2026-01-26

# Run fraud detection
bun run rewards fraud-check 2026-01-25_2026-01-26

# Approve for distribution
bun run rewards approve 2026-01-25_2026-01-26

# Or reject
bun run rewards reject 2026-01-25_2026-01-26 --reason "Suspected gaming detected"
```

### Distribute

```bash
# Dry run (see what would happen)
bun run rewards distribute 2026-01-25_2026-01-26 --dry-run

# Execute distribution
bun run rewards distribute 2026-01-25_2026-01-26
```

## Configuration

### Default Configuration

```typescript
{
  dailyPoolAmount: 1000,           // ARIO tokens per day
  minimumRequestsThreshold: 100,   // Min requests to qualify
  minimumSuccessRate: 0.9,         // 90% success rate required
  verificationGatewayBonus: 1.15,  // 15% bonus for verification GWs
  weights: {
    requestVolume: 0.4,            // 40% weight
    successRate: 0.25,             // 25% weight
    latencyScore: 0.2,             // 20% weight
    bytesServed: 0.15,             // 15% weight
  },
  distributionDelayDays: 3,        // 3 day review period
}
```

### Custom Configuration

Create a JSON file with overrides:

```json
{
  "dailyPoolAmount": 2000,
  "minimumRequestsThreshold": 500,
  "verificationGatewayBonus": 1.25,
  "weights": {
    "requestVolume": 0.5,
    "successRate": 0.2,
    "latencyScore": 0.2,
    "bytesServed": 0.1
  }
}
```

## Fraud Detection

### Automated Checks

The system automatically flags suspicious patterns:

| Flag Type | Detection | Action |
|-----------|-----------|--------|
| `suspicious_volume_spike` | >3x historical average | Review before approval |
| `latency_manipulation` | P95 <30% of historical | Investigate |
| `self_routing_suspected` | (Future) Correlation analysis | Exclude or reduce |
| `sybil_suspected` | (Future) Multiple GWs same operator | Apply diminishing returns |

### Manual Review

Before approving any period:

1. Check the fraud-check output
2. Review any flagged gateways
3. Compare with historical patterns
4. Verify new gateways aren't gaming

## Public Publishing

Reward calculations are published for transparency:

### Output Format

```json
{
  "periodId": "2026-01-25_2026-01-26",
  "period": {
    "start": "2026-01-25T00:00:00.000Z",
    "end": "2026-01-26T00:00:00.000Z"
  },
  "pool": {
    "totalAmount": 1000,
    "distributed": 998.5,
    "qualifiedGateways": 15
  },
  "configuration": {
    "minimumRequests": 100,
    "minimumSuccessRate": "90%",
    "verificationBonus": "15%"
  },
  "rewards": [
    {
      "gateway": "ar-io.dev",
      "operatorAddress": "abc123...",
      "reward": 150.5,
      "poolShare": "15.05%",
      "metrics": {
        "requests": 5000,
        "successRate": "98.5%",
        "p95LatencyMs": 250,
        "isVerificationGateway": true
      },
      "scores": {
        "volume": "0.3500",
        "reliability": "0.9850",
        "speed": "0.8000",
        "bandwidth": "0.2500",
        "verificationBonus": "1.15",
        "total": "0.4825"
      }
    }
  ]
}
```

### Publishing to Arweave

For full transparency, publish calculations to Arweave:

```typescript
import { createArweavePublisher } from './rewards';

const publisher = createArweavePublisher(arweave, 'My-Wayfinder-Rewards');
const txId = await publisher.publishPeriod(period, formattedData);
```

## Integration with ar.io SDK

### Real Token Distribution

Replace mock services with ar.io SDK:

```typescript
import { ARIO } from '@ar.io/sdk';

const ario = ARIO.init({ signer: mySigner });

const tokenService = {
  async transfer(to: string, amount: number) {
    const result = await ario.transfer({ target: to, qty: amount });
    return { txId: result.id };
  },
  async getBalance() {
    const balance = await ario.getBalance({ address: myAddress });
    return balance;
  }
};
```

### Delegation Info

```typescript
const delegationSource = {
  async getDelegationInfo(operatorAddress: string) {
    const gateway = await ario.getGateway({ address: operatorAddress });
    const delegates = await ario.getGatewayDelegates({ address: operatorAddress });

    return {
      operatorAddress,
      delegateRewardShareRatio: gateway.settings.delegateRewardShareRatio,
      delegates: delegates.map(d => ({
        address: d.address,
        stake: d.delegatedStake,
        shareOfDelegatedStake: d.delegatedStake / gateway.totalDelegatedStake,
      })),
    };
  }
};
```

## Best Practices

### For Gateway Operators

1. **Maintain High Uptime**: Success rate heavily impacts rewards
2. **Optimize Latency**: Faster responses = higher speed score
3. **Join Verification Set**: If trusted, get 15% bonus
4. **Serve Larger Content**: Bandwidth contribution matters

### For Reward Administrators

1. **Daily Monitoring**: Run calculations daily, review anomalies
2. **Fraud Detection**: Always run fraud-check before approval
3. **Public Publishing**: Build trust with transparency
4. **Gradual Tuning**: Adjust weights based on observed behavior
5. **Document Changes**: Log configuration changes with rationale

## Data Retention

| Data | Retention | Storage |
|------|-----------|---------|
| Reward Periods | Indefinite | JSON files |
| Published Calculations | Permanent | Arweave |
| Distribution Transactions | Indefinite | ar.io network |
| Fraud Flags | 90 days | JSON files |

## Future Enhancements

- [ ] On-chain reward distribution via smart contract
- [ ] Real-time fraud detection
- [ ] Sybil resistance via operator identity verification
- [ ] Multi-Wayfinder aggregation (combine stats from multiple routers)
- [ ] Slashing for verified fraud
- [ ] Reputation scores based on historical performance
