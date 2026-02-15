# TxSim - Multi-Chain Transaction Simulator

TxSim is a transaction simulation engine that previews how transactions will behave on both **EVM** and **WASM** chains before they're executed. It forks live chain state using Anvil (EVM) and Chopsticks (WASM) and executes transactions in isolated environments.

## Features

- **Multi-Chain Support** - Simulate transactions on both EVM and WASM chains
- **Transaction Simulation** - Execute any transaction against forked chain state
- **Balance Tracking** - Before/after snapshots for native tokens, ERC20 (EVM), and pallet-assets (WASM)
- **State Impact Report** - Structured view of all balance changes
- **Gas Estimation** - Accurate gas usage and cost breakdown (live gas prices for EVM)
- **Event Decoding** - Human-readable event logs for both chains
- **Error Decoding** - Clear error messages for reverts and panics
- **Unified API** - Single endpoint auto-detects EVM vs WASM requests

## Quick Start

### Using Docker (Recommended)

```bash
# Clone and build
git clone <repo-url>
cd txsim

# Start with Docker Compose
docker-compose up -d

# Check logs
docker-compose logs -f
```

### Manual Setup

**Prerequisites:**

- Node.js 18+
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (for Anvil - EVM simulation)
- [Chopsticks](https://github.com/AcalaNetwork/chopsticks) (for WASM simulation)

```bash
# Install dependencies
npm install

# Setup environment variables
cp .env.example .env

## Quick Links

- [GitHub Repo](https://github.com/sidelaw/TX-sim-dev)
- [MIT License](https://opensource.org/licenses/MIT)
- [Documentation](docs/API.md)
- [Tests](src/tests)
- [Dockerfile](docker/Dockerfile)
- [Engine Code](src/index.ts)

# Install Chopsticks globally
npm install -g @acala-network/chopsticks

# Start Anvil (in separate terminal)
anvil --fork-url https://rpc.api.moonbeam.network

# Start Chopsticks (in another terminal)
npx @acala-network/chopsticks --config ./chopsticks-config.yml

# Start the server
npm run dev
```

## API Reference

### Health Check

```
GET /health
```

**Response:**

```json
{
    "status": "ok",
    "anvil": "connected",
    "chopsticks": "connected"
}
```

**Status Values:**

- `ok` - All systems operational
- `degraded` - One or more services disconnected
- `error` - Critical failure

---

### Simulate Transaction

```
POST /simulate
```

**Request Body:**

| Field                | Type     | Required | Description                     |
| -------------------- | -------- | -------- | ------------------------------- |
| sender               | string   | Yes      | Address sending the transaction |
| transaction.to       | string   | Yes      | Target contract/address         |
| transaction.data     | string   | No       | Calldata (hex encoded)          |
| transaction.value    | string   | No       | Native token amount (wei)       |
| transaction.gasLimit | string   | No       | Gas limit                       |
| trackTokens          | string[] | No       | ERC20 addresses to track        |

**Example - Native Transfer:**

```bash
curl -X POST http://localhost:3000/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "sender": "0xYourAddress",
    "transaction": {
      "to": "0xRecipientAddress",
      "value": "1000000000000000000"
    }
  }'
```

**Example - ERC20 Transfer:**

```bash
curl -X POST http://localhost:3000/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "sender": "0xYourAddress",
    "transaction": {
      "to": "0xTokenContract",
      "data": "0xa9059cbb000000000000000000000000RECIPIENT_PADDED_TO_32_BYTESAMT_PADDED_TO_32_BYTES"
    },
    "trackTokens": ["0xTokenContract"]
  }'
```

**Response:**

```json
{
  "success": true,
  "stateChanges": {
    "sender": {
      "address": "0x...",
      "before": [
        {
          "token": "GLMR",
          "contractAddress": null,
          "balance": "5000000000000000000",
          "decimals": 18,
          "symbol": "GLMR"
        }
      ],
      "after": [...],
      "changes": [
        {
          "token": "GLMR",
          "contractAddress": null,
          "before": "5000000000000000000",
          "after": "4999000000000000000",
          "delta": "-1000000000000000",
          "decimals": 18,
          "symbol": "GLMR"
        }
      ]
    },
    "recipient": {...},
    "contractsAffected": []
  },
  "events": [
    {
      "name": "Transfer",
      "contract": "0x...",
      "args": {
        "from": "0x...",
        "to": "0x...",
        "value": "1000000"
      },
      "signature": "Transfer(address,address,uint256)",
      "logIndex": 0
    }
  ],
  "gas": {
    "gasUsed": "21000",
    "gasPrice": "1000000000",
    "totalCostWei": "21000000000000",
    "totalCostNative": "0.000021",
    "nativeSymbol": "GLMR"
  }
}
```

---

## Response Schema

### StateImpactReport

| Field             | Type           | Description                 |
| ----------------- | -------------- | --------------------------- |
| sender            | AddressState   | Sender's balance changes    |
| recipient         | AddressState   | Recipient's balance changes |
| contractsAffected | AddressState[] | Other affected addresses    |

### AddressState

| Field   | Type                 | Description                 |
| ------- | -------------------- | --------------------------- |
| address | string               | Wallet/contract address     |
| before  | TokenBalance[]       | Balances before transaction |
| after   | TokenBalance[]       | Balances after transaction  |
| changes | TokenBalanceChange[] | Only changed balances       |

### TokenBalance

| Field           | Type           | Description                      |
| --------------- | -------------- | -------------------------------- |
| token           | string         | Token symbol                     |
| contractAddress | string \| null | Token contract (null for native) |
| balance         | string         | Balance in smallest unit         |
| decimals        | number         | Token decimals                   |
| symbol          | string         | Token symbol                     |

### GasReport

| Field           | Type   | Description          |
| --------------- | ------ | -------------------- |
| gasUsed         | string | Gas units consumed   |
| gasPrice        | string | Gas price in wei     |
| totalCostWei    | string | Total cost in wei    |
| totalCostNative | string | Total cost formatted |
| nativeSymbol    | string | Native token symbol  |

### DecodedError

| Field   | Type   | Description                                  |
| ------- | ------ | -------------------------------------------- |
| type    | string | "revert" \| "panic" \| "custom" \| "unknown" |
| message | string | Human-readable error                         |
| raw     | string | Raw error data                               |

---

## Configuration

### Environment Variables

| Variable           | Default | Description                     |
| ------------------ | ------- | ------------------------------- |
| PORT               | 3000    | API server port                 |
| FORK_URL_EVM       | -       | EVM chain RPC URL (for Anvil)   |
| FORK_URL_WASM      | -       | WASM chain RPC URL (Chopsticks) |
| CHOPSTICKS_PORT    | 8546    | Chopsticks RPC port             |
| NATIVE_SYMBOL      | GLMR    | EVM native token symbol         |
| NATIVE_SYMBOL_WASM | ASTR    | WASM native token symbol        |

### Supported Chains

**EVM Chains (via Anvil):**

| Chain    | Fork URL                         | Native Symbol |
| -------- | -------------------------------- | ------------- |
| Moonbeam | https://rpc.api.moonbeam.network | GLMR          |
| Ethereum | https://eth.llamarpc.com         | ETH           |
| Polygon  | https://polygon-rpc.com          | MATIC         |
| Arbitrum | https://arb1.arbitrum.io/rpc     | ETH           |

**WASM Chains (via Chopsticks):**

| Chain    | Fork URL                               | Native Symbol |
| -------- | -------------------------------------- | ------------- |
| Astar    | https://astar.api.onfinality.io/public | ASTR          |
| Polkadot | https://rpc.polkadot.io                | DOT           |
| Kusama   | https://kusama-rpc.polkadot.io         | KSM           |

---

## Error Handling

Failed simulations (reverts or panics) return a **422 Unprocessable Entity** status code. Validation errors (invalid addresses, missing fields) return a **400 Bad Request** status code.

### Revert Errors

Standard Solidity reverts with reason strings:

```json
{
    "success": false,
    "error": {
        "type": "revert",
        "message": "ERC20: transfer amount exceeds balance",
        "raw": "0x08c379a0..."
    }
}
```

### Panic Errors

Solidity panic codes are decoded:

| Code | Meaning                       |
| ---- | ----------------------------- |
| 0x01 | Assertion failed              |
| 0x11 | Arithmetic overflow/underflow |
| 0x12 | Division by zero              |
| 0x21 | Invalid enum value            |
| 0x31 | Pop on empty array            |
| 0x32 | Array index out of bounds     |
| 0x41 | Too much memory allocated     |

```json
{
    "success": false,
    "error": {
        "type": "panic",
        "message": "Panic: Arithmetic overflow/underflow",
        "raw": "0x4e487b71..."
    }
}
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        TxSim API                                 │
│                      (Express.js)                                │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────┐                                          │
│  │  Unified Simulate  │                                          │
│  │     Endpoint       │                                          │
│  └─────────┬──────────┘                                          │
│            │                                                     │
│     ┌──────┴──────┐                                              │
│     ▼             ▼                                              │
│  ┌─────────┐  ┌──────────┐                                      │
│  │   EVM   │  │   WASM   │                                      │
│  │Simulator│  │Simulator │                                      │
│  └────┬────┘  └────┬─────┘                                      │
│       │            │                                             │
│       ▼            ▼                                             │
│  ┌─────────┐  ┌──────────┐    ┌────────────┐                   │
│  │  Anvil  │  │Chopsticks│───▶│   Forked   │                   │
│  │ Manager │  │ Manager  │    │WASM Chain  │                   │
│  └────┬────┘  └──────────┘    └────────────┘                   │
│       │                                                          │
│       ▼                                                          │
│  ┌────────────┐                                                 │
│  │  Forked    │                                                 │
│  │ EVM Chain  │                                                 │
│  └────────────┘                                                 │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                       Utils                               │  │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────────┐          │  │
│  │  │  Error    │ │  Event    │ │  State Impact │          │  │
│  │  │  Decoder  │ │  Decoder  │ │  Builder      │          │  │
│  │  └───────────┘ └───────────┘ └───────────────┘          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Development

### Project Structure

```
src/
├── index.ts                 # Express server entry
├── routes/
│   └── unified-simulate.ts  # Unified simulation endpoint (EVM/WASM)
├── services/
│   ├── anvil.ts            # Anvil connection manager (EVM)
│   ├── chopsticks.ts       # Chopsticks connection manager (WASM)
│   ├── simulator.ts        # EVM simulation logic
│   └── simulator-wasm.ts   # WASM simulation logic
├── utils/
│   ├── error-decoder.ts    # EVM error parsing
│   ├── event-decoder.ts    # Event log decoding
│   ├── gas-calculator.ts   # Gas cost computation
│   ├── state-impact.ts     # State diff builder
│   └── token-info.ts       # ERC20 metadata
└── types/
    └── index.ts            # TypeScript interfaces
```

### Running Tests

```bash
npm test
```

### Building

```bash
npm run build
```

---

## License

MIT
