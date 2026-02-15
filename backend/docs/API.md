# TxSim API Documentation

## Base URL

```
http://localhost:3000
```

---

## Endpoints

### GET /health

Check API, Anvil (EVM), and Chopsticks (WASM) connection status.

**Response:**

```json
{
    "status": "ok",
    "anvil": "connected",
    "chopsticks": "connected"
}
```

| Status   | Meaning                           |
| -------- | --------------------------------- |
| ok       | All systems operational           |
| degraded | One or more services disconnected |
| error    | Critical failure                  |

---

### POST /simulate

Simulate a transaction against forked chain state. **Supports both EVM and WASM transactions.**

The endpoint automatically detects the transaction type:

- **EVM**: Request contains `transaction` field
- **WASM**: Request contains `extrinsic` field

---

#### EVM Request Format

**Headers:**

```
Content-Type: application/json
```

**Body:**

```typescript
{
  // Required: Address initiating the transaction
  "sender": "0x...",

  // Required: Transaction details
  "transaction": {
    // Required: Target address (contract or EOA)
    "to": "0x...",

    // Optional: Calldata for contract interaction
    "data": "0x...",

    // Optional: Native token value in wei
    "value": "1000000000000000000",

    // Optional: Gas limit
    "gasLimit": "100000"
  },

  // Optional: ERC20 token addresses to track
  "trackTokens": ["0x...", "0x..."]
}
```

---

#### WASM Request Format

**Headers:**

```
Content-Type: application/json
```

**Body:**

```typescript
{
  // Required: Substrate address initiating the transaction
  "sender": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",

  // Required: Extrinsic details (either call params or raw hex)
  "extrinsic": {
    // Option 1: Structured call
    "pallet": "Balances",
    "method": "transferKeepAlive",
    "args": ["5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty", "1000000000000"]

    // Option 2: Raw hex (alternative to pallet/method/args)
    // "rawHex": "0x..."
  },

  // Optional: Asset IDs to track (pallet-assets)
  "trackAssets": [1, 2, 3]
}
```

#### Response

**Success (200):**

```typescript
{
  // Whether transaction would succeed on-chain
  "success": true,

  // Balance changes for all involved addresses
  "stateChanges": {
    "sender": {
      "address": "0x...",
      "before": [TokenBalance],
      "after": [TokenBalance],
      "changes": [TokenBalanceChange]
    },
    "recipient": {
      "address": "0x...",
      "before": [TokenBalance],
      "after": [TokenBalance],
      "changes": [TokenBalanceChange]
    },
    "contractsAffected": [AddressState]
  },

  // Decoded event logs
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

  // Gas usage breakdown (live gas price fetched from forked chain)
  "gas": {
    "gasUsed": "52000",
    "gasPrice": "1000000000",
    "totalCostWei": "52000000000000",
    "totalCostNative": "0.000052",
    "nativeSymbol": "GLMR"
  }
}
```

**Failure (422):**

```typescript
{
  "success": false,
  "stateChanges": {
    "sender": { "address": "0x...", "before": [], "after": [], "changes": [] },
    "recipient": { "address": "0x...", "before": [], "after": [], "changes": [] },
    "contractsAffected": []
  },
  "events": [],
  "gas": {
    "gasUsed": "0",
    "gasPrice": "0",
    "totalCostWei": "0",
    "totalCostNative": "0",
    "nativeSymbol": "GLMR"
  },
  "error": {
    "type": "revert",
    "message": "ERC20: transfer amount exceeds balance",
    "raw": "0x08c379a0..."
  }
}
```

**Validation Error (400):**

```typescript
{
  "success": false,
  "stateChanges": {...},
  "events": [],
  "gas": {...},
  "error": {
    "type": "unknown",
    "message": "Invalid sender address"
  }
}
```

---

## Examples

### 1. Native Token Transfer

Transfer 1 GLMR to another address.

```bash
curl -X POST http://localhost:3000/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "sender": "0xe7Bc9082c538d4d6D3e1C54CEa42b58899A5ADD0",
    "transaction": {
      "to": "0x000000000000000000000000000000000000dEaD",
      "value": "1000000000000000000"
    }
  }'
```

### 2. ERC20 Transfer

Transfer USDC tokens.

```bash
# Function: transfer(address,uint256)
# Selector: 0xa9059cbb
# Params: recipient (32 bytes) + amount (32 bytes)

curl -X POST http://localhost:3000/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "sender": "0xe7Bc9082c538d4d6D3e1C54CEa42b58899A5ADD0",
    "transaction": {
      "to": "0x818ec0A7Fe18Ff94269904fCED6AE3DaE6d6dC0b",
      "data": "0xa9059cbb000000000000000000000000f7426ea766e6592be659b6ba5ffdc8f08fc8338300000000000000000000000000000000000000000000000000000000000f4240"
    },
    "trackTokens": ["0x818ec0A7Fe18Ff94269904fCED6AE3DaE6d6dC0b"]
  }'
```

### 3. ERC20 Approve

Approve a spender to use tokens.

```bash
# Function: approve(address,uint256)
# Selector: 0x095ea7b3

curl -X POST http://localhost:3000/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "sender": "0xe7Bc9082c538d4d6D3e1C54CEa42b58899A5ADD0",
    "transaction": {
      "to": "0x818ec0A7Fe18Ff94269904fCED6AE3DaE6d6dC0b",
      "data": "0x095ea7b3000000000000000000000000d0A01ec574D1fC6652eDF79cb2F880fd47D34Ab1ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    }
  }'
```

### 4. Contract Interaction (DEX Swap)

Simulate a token swap on StellaSwap.

```bash
curl -X POST http://localhost:3000/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "sender": "0xe7Bc9082c538d4d6D3e1C54CEa42b58899A5ADD0",
    "transaction": {
      "to": "0xd0A01ec574D1fC6652eDF79cb2F880fd47D34Ab1",
      "data": "0x38ed1739...",
      "value": "0"
    },
    "trackTokens": [
      "0x818ec0A7Fe18Ff94269904fCED6AE3DaE6d6dC0b",
      "0xAcc15dC74880C9944775448304B263D191c6077F"
    ]
  }'
```

---

## Encoding Calldata

Use ethers.js to encode function calls:

```typescript
import { ethers } from "ethers";

// ERC20 transfer
const iface = new ethers.Interface([
    "function transfer(address to, uint256 amount)",
]);

const data = iface.encodeFunctionData("transfer", [
    "0xRecipientAddress",
    ethers.parseUnits("100", 6), // 100 USDC (6 decimals)
]);

console.log(data);
// 0xa9059cbb000000000000000000000000...
```

---

## Common Function Selectors

| Function                              | Selector   |
| ------------------------------------- | ---------- |
| transfer(address,uint256)             | 0xa9059cbb |
| approve(address,uint256)              | 0x095ea7b3 |
| transferFrom(address,address,uint256) | 0x23b872dd |
| balanceOf(address)                    | 0x70a08231 |
| allowance(address,address)            | 0xdd62ed3e |

```

---

## Project Structure
```

txsim/backend/
├── src/
│ ├── index.ts
│ ├── routes/
│ │ └── unified-simulate.ts # Unified EVM/WASM endpoint
│ ├── services/
│ │ ├── anvil.ts # EVM fork manager
│ │ ├── chopsticks.ts # WASM fork manager
│ │ ├── simulator.ts # EVM simulation logic
│ │ └── simulator-wasm.ts # WASM simulation logic
│ ├── utils/
│ │ ├── error-decoder.ts
│ │ ├── event-decoder.ts
│ │ ├── gas-calculator.ts
│ │ ├── state-impact.ts
│ │ └── token-info.ts
│ └── types/
│ └── index.ts
├── chopsticks-config.yml # Chopsticks configuration
├── Dockerfile
├── Dockerfile.dev
├── docker-compose.yml
├── docker-entrypoint.sh
├── docker-entrypoint.dev.sh
├── .dockerignore
├── package.json
├── tsconfig.json
├── README.md
└── API.md
